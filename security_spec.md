# Sovereign Arcana Security Specification

## 1. Data Invariants
1. **Strict Ownership & Admin RBAC**:
   - `/players/{userId}` may only be read (`get`), created, or updated by the owning user (`request.auth.uid == userId`), with verified admin override for withdrawal coin refunds.
   - `/withdrawals/{withdrawalId}` may only be read (`get`/`list`) by the owning player (`resource.data.uid == request.auth.uid`) or a verified admin (`email_verified == true` and matching admin email/registry), isolating GCash PII from other users.
2. **No Unauthorized Directory Enumeration**:
   - Listing `/players` and `/admins` is strictly forbidden.
   - Listing `/withdrawals` evaluates `resource.data.uid == request.auth.uid` or verified bootstrapped admin email without any `get()`/`exists()` calls in `allow list`.
3. **Atomic Balance Deduction & Refund**:
   - Creating a `/withdrawals/{withdrawalId}` requires `status == 'pending'`, exact coin-to-peso tier matching (`2000->5`, `4000->10`, `8000->20`, `20000->50`, `40000->100`), sufficient `/players/{uid}.balance`, and atomic deduction via `getAfter` in the same transaction/batch.
   - Rejecting a withdrawal as an admin atomically refunds `coinsAmount` to `/players/{uid}.balance` via `getAfter`.
4. **Terminal State Locking**:
   - Withdrawals in `'paid'` or `'rejected'` status cannot be modified again, preventing double-refunds or tampering.
5. **Immutable Identity, Timestamps & Schema Limits**:
   - `uid`, `id`, `gcashName`, `gcashNumber`, `coinsAmount`, `pesoAmount`, and `createdAt` are immutable after creation; `createdAt`/`updatedAt` must equal `request.time`.
   - All strings enforce `.size()` bounds and regex validation (`id`, `uid`, `gcashNumber`).

## 2. Adversarial Payloads ("Dirty Dozen")
1. Unauthenticated `get` or `list` on `/players/user_123` or `/withdrawals` -> `PERMISSION_DENIED`.
2. Cross-user `get` on `/withdrawals/wd_victim` as `attacker_uid` (PII leak of GCash number) -> `PERMISSION_DENIED`.
3. Unverified email spoofing `email: "deantv0127@gmail.com"` with `email_verified: false` -> `PERMISSION_DENIED`.
4. Oversized path ID (`/withdrawals/<200-char-id>`) -> `PERMISSION_DENIED`.
5. Creating a withdrawal with `status: "paid"` or `status: "approved"` directly -> `PERMISSION_DENIED`.
6. Creating a withdrawal with mismatched tier (`coinsAmount: 2000, pesoAmount: 100`) -> `PERMISSION_DENIED`.
7. Creating a withdrawal without atomically deducting `coinsAmount` from `/players/{uid}.balance` -> `PERMISSION_DENIED`.
8. Creating a withdrawal with shadow field (`isAdmin: true`) or invalid `gcashNumber: "abc"` -> `PERMISSION_DENIED`.
9. Non-admin player attempting to `update` `/withdrawals/wd_123` to `'approved'` or `'paid'` -> `PERMISSION_DENIED`.
10. Admin attempting to mutate a terminal `'rejected'` or `'paid'` withdrawal (double refund) -> `PERMISSION_DENIED`.
11. Non-admin attempting to write to `/admins/{uid}` (self-assigned admin role) -> `PERMISSION_DENIED`.
12. `delete` on `/players/user_123` or `/withdrawals/wd_123` -> `PERMISSION_DENIED`.
