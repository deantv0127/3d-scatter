# Sovereign Arcana Security Specification

## 1. Data Invariants
1. **Strict Ownership**: A document at `/players/{userId}` may only be read (`get`), created, or updated by an authenticated, email-verified user whose `request.auth.uid == userId`.
2. **No Directory Enumeration**: Listing `/players` (`allow list`) and deleting player vaults (`allow delete`) are strictly forbidden.
3. **Immutable Identity & Creation Time**: `uid` and `createdAt` cannot be modified after document creation, and `createdAt`/`updatedAt` must equal `request.time`.
4. **No Shadow Fields**: Creates must provide all required keys and only allowlisted keys (`hasAll` + `hasOnly`); updates must use action-scoped `affectedKeys().hasOnly(...)`.
5. **Bounded Numeric & String Values**: String lengths (`uid <= 128`, `displayName` 1..64, `photoUrl <= 512`) and non-negative numeric limits (`balance`, `freeSpinPot`, `freeSpinsLeft`, `totalSpins`, `totalWon`, `biggestWin`) are enforced on every write.

## 2. Adversarial Payloads ("Dirty Dozen")
1. Unauthenticated `get` on `/players/user_123` -> `PERMISSION_DENIED`.
2. Cross-user `get` on `/players/victim_uid` as `attacker_uid` -> `PERMISSION_DENIED`.
3. `list` query on `/players` -> `PERMISSION_DENIED`.
4. Unverified email token creating `/players/user_123` -> `PERMISSION_DENIED`.
5. Oversized path ID (`/players/<200-char-id>`) -> `PERMISSION_DENIED`.
6. Create with spoofed `uid` (`uid: "other_user"`) -> `PERMISSION_DENIED`.
7. Create with shadow field (`isAdmin: true` or `role: "admin"`) -> `PERMISSION_DENIED`.
8. Create with client-supplied `createdAt` instead of `request.time` -> `PERMISSION_DENIED`.
9. Update attempting to mutate `uid` or `createdAt` -> `PERMISSION_DENIED`.
10. Update injecting negative `balance: -500` or string `balance: "9999"` -> `PERMISSION_DENIED`.
11. Update injecting 1KB `displayName` -> `PERMISSION_DENIED`.
12. `delete` on `/players/user_123` -> `PERMISSION_DENIED`.
