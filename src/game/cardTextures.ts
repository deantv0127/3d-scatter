import * as THREE from 'three';
import { MultiplierValue, SymbolId } from './types';

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSuitGlyph(
  ctx: CanvasRenderingContext2D,
  symbol: SymbolId,
  cx: number,
  cy: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  if (symbol === 'DIAMOND') {
    ctx.beginPath();
    ctx.moveTo(0, -1.0);
    ctx.quadraticCurveTo(0.24, -0.25, 0.86, 0);
    ctx.quadraticCurveTo(0.24, 0.25, 0, 1.0);
    ctx.quadraticCurveTo(-0.24, 0.25, -0.86, 0);
    ctx.quadraticCurveTo(-0.24, -0.25, 0, -1.0);
    ctx.closePath();
    ctx.fill();
  } else if (symbol === 'HEART') {
    ctx.beginPath();
    ctx.moveTo(0, 0.92);
    ctx.bezierCurveTo(-1.1, 0.22, -1.05, -0.88, -0.45, -0.88);
    ctx.bezierCurveTo(-0.14, -0.88, 0, -0.58, 0, -0.42);
    ctx.bezierCurveTo(0, -0.58, 0.14, -0.88, 0.45, -0.88);
    ctx.bezierCurveTo(1.05, -0.88, 1.1, 0.22, 0, 0.92);
    ctx.closePath();
    ctx.fill();
  } else if (symbol === 'SPADE') {
    ctx.beginPath();
    ctx.moveTo(0, -0.96);
    ctx.bezierCurveTo(0.95, -0.25, 1.02, 0.56, 0.44, 0.56);
    ctx.bezierCurveTo(0.2, 0.56, 0.1, 0.4, 0.08, 0.34);
    ctx.lineTo(0.24, 0.95);
    ctx.lineTo(-0.24, 0.95);
    ctx.lineTo(-0.08, 0.34);
    ctx.bezierCurveTo(-0.1, 0.4, -0.2, 0.56, -0.44, 0.56);
    ctx.bezierCurveTo(-1.02, 0.56, -0.95, -0.25, 0, -0.96);
    ctx.closePath();
    ctx.fill();
  } else if (symbol === 'CLUB') {
    const r = 0.41;
    ctx.beginPath();
    ctx.arc(0, -0.44, r, 0, Math.PI * 2);
    ctx.arc(-0.44, 0.16, r, 0, Math.PI * 2);
    ctx.arc(0.44, 0.16, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.09, 0.1);
    ctx.lineTo(0.09, 0.1);
    ctx.lineTo(0.24, 0.95);
    ctx.lineTo(-0.24, 0.95);
    ctx.closePath();
    ctx.fill();
  } else if (symbol === 'BONUS') {
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const ang = (i * Math.PI) / 8;
      const rad = i % 2 === 0 ? 1.0 : i % 4 === 1 ? 0.38 : 0.62;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (symbol === 'WILD') {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const ang = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? 1.0 : 0.42;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawCrownCrest(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-0.85, 0.42);
  ctx.lineTo(-0.95, -0.35);
  ctx.lineTo(-0.42, 0.04);
  ctx.lineTo(0, -0.56);
  ctx.lineTo(0.42, 0.04);
  ctx.lineTo(0.95, -0.35);
  ctx.lineTo(0.85, 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-0.82, 0.52, 1.64, 0.16);
  ctx.restore();
}

interface CardStyle {
  bgTop: string;
  bgBottom: string;
  frameColor: string;
  accentColor: string;
  glowColor: string;
  cornerText: string;
  label: string;
}

function getCardStyle(symbol: SymbolId, multiplier?: MultiplierValue): CardStyle {
  switch (symbol) {
    case 'DIAMOND':
      return {
        bgTop: '#0d1b2e',
        bgBottom: '#08101c',
        frameColor: '#38bdf8',
        accentColor: '#7dd3fc',
        glowColor: 'rgba(56, 189, 248, 0.32)',
        cornerText: '♦',
        label: 'DIAMOND',
      };
    case 'CLUB':
      return {
        bgTop: '#0a221b',
        bgBottom: '#06130f',
        frameColor: '#34d399',
        accentColor: '#6ee7b7',
        glowColor: 'rgba(52, 211, 153, 0.30)',
        cornerText: '♣',
        label: 'CLUB',
      };
    case 'HEART':
      return {
        bgTop: '#2b0f1b',
        bgBottom: '#16070d',
        frameColor: '#fb7185',
        accentColor: '#fda4af',
        glowColor: 'rgba(251, 113, 133, 0.32)',
        cornerText: '♥',
        label: 'HEART',
      };
    case 'SPADE':
      return {
        bgTop: '#161b26',
        bgBottom: '#0a0d13',
        frameColor: '#94a3b8',
        accentColor: '#e2e8f0',
        glowColor: 'rgba(148, 163, 184, 0.28)',
        cornerText: '♠',
        label: 'SPADE',
      };
    case 'QUEEN':
      return {
        bgTop: '#261338',
        bgBottom: '#12081c',
        frameColor: '#c084fc',
        accentColor: '#e9d5ff',
        glowColor: 'rgba(192, 132, 252, 0.34)',
        cornerText: 'Q',
        label: 'QUEEN',
      };
    case 'KING':
      return {
        bgTop: '#2a1c0a',
        bgBottom: '#140c04',
        frameColor: '#fbbf24',
        accentColor: '#fde68a',
        glowColor: 'rgba(251, 191, 36, 0.34)',
        cornerText: 'K',
        label: 'KING',
      };
    case 'ACE':
      return {
        bgTop: '#2d2310',
        bgBottom: '#130e06',
        frameColor: '#f59e0b',
        accentColor: '#fef3c7',
        glowColor: 'rgba(245, 158, 11, 0.40)',
        cornerText: 'A',
        label: 'ACE',
      };
    case 'WILD':
      return {
        bgTop: '#0b2928',
        bgBottom: '#061515',
        frameColor: '#2dd4bf',
        accentColor: '#99f6e4',
        glowColor: 'rgba(45, 212, 191, 0.42)',
        cornerText: '★',
        label: 'WILD',
      };
    case 'BONUS':
      return {
        bgTop: '#32102c',
        bgBottom: '#170615',
        frameColor: '#f472b6',
        accentColor: '#fbcfe8',
        glowColor: 'rgba(244, 114, 182, 0.42)',
        cornerText: '✦',
        label: 'BONUS',
      };
    case 'MULTIPLIER':
      return {
        bgTop: '#332307',
        bgBottom: '#170f03',
        frameColor: '#facc15',
        accentColor: '#fef08a',
        glowColor: 'rgba(250, 204, 21, 0.48)',
        cornerText: `${multiplier ?? 2}×`,
        label: 'MULTIPLIER',
      };
  }
}

const ALL_SYMBOLS: Array<{ symbol: SymbolId; multiplier?: MultiplierValue }> = [
  { symbol: 'DIAMOND' },
  { symbol: 'CLUB' },
  { symbol: 'HEART' },
  { symbol: 'SPADE' },
  { symbol: 'QUEEN' },
  { symbol: 'KING' },
  { symbol: 'ACE' },
  { symbol: 'WILD' },
  { symbol: 'BONUS' },
  { symbol: 'MULTIPLIER', multiplier: 2 },
  { symbol: 'MULTIPLIER', multiplier: 3 },
  { symbol: 'MULTIPLIER', multiplier: 5 },
  { symbol: 'MULTIPLIER', multiplier: 10 },
  { symbol: 'MULTIPLIER', multiplier: 25 },
];

export class CardTextureAtlas {
  private faceTextures = new Map<string, THREE.CanvasTexture>();
  private backTexture: THREE.CanvasTexture | null = null;
  private feltTexture: THREE.CanvasTexture | null = null;
  private maxAnisotropy: number;
  private cardScale: number;

  constructor(maxAnisotropy: number, isMobile: boolean) {
    this.maxAnisotropy = Math.min(maxAnisotropy, isMobile ? 4 : 8);
    // Mobile-friendly resolution: 320x448 on mobile, 384x538 on desktop (base design space 512x716)
    this.cardScale = isMobile ? 0.625 : 0.75;
  }

  public preloadAll(renderer: THREE.WebGLRenderer): void {
    renderer.initTexture(this.getBackTexture());
    renderer.initTexture(this.getFeltTexture());
    for (const item of ALL_SYMBOLS) {
      const tex = this.getFaceTexture(item.symbol, item.multiplier);
      renderer.initTexture(tex);
    }
  }

  public getFaceTexture(
    symbol: SymbolId,
    multiplier?: MultiplierValue,
  ): THREE.CanvasTexture {
    const key =
      symbol === 'MULTIPLIER' ? `${symbol}_${multiplier ?? 2}` : symbol;
    const cached = this.faceTextures.get(key);
    if (cached) return cached;

    const tex = this.buildFaceTexture(symbol, multiplier);
    this.faceTextures.set(key, tex);
    return tex;
  }

  public getBackTexture(): THREE.CanvasTexture {
    if (this.backTexture) return this.backTexture;
    const baseW = 512;
    const baseH = 716;
    const w = Math.round(baseW * this.cardScale);
    const h = Math.round(baseH * this.cardScale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(this.cardScale, this.cardScale);

    const bg = ctx.createLinearGradient(0, 0, baseW, baseH);
    bg.addColorStop(0, '#0c1220');
    bg.addColorStop(0.5, '#131d31');
    bg.addColorStop(1, '#090d17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, baseW, baseH);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.72)';
    ctx.lineWidth = 6;
    drawRoundedRectPath(ctx, 26, 26, baseW - 52, baseH - 52, 26);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, 42, 42, baseW - 84, baseH - 84, 18);
    ctx.stroke();

    ctx.save();
    drawRoundedRectPath(ctx, 48, 48, baseW - 96, baseH - 96, 14);
    ctx.clip();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.16)';
    ctx.lineWidth = 2;
    const step = 48;
    for (let x = -baseH; x < baseW + baseH; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + baseH, baseH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + baseH, 0);
      ctx.lineTo(x, baseH);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(baseW / 2, baseH / 2);
    const radGrad = ctx.createRadialGradient(0, 0, 12, 0, 0, 120);
    radGrad.addColorStop(0, 'rgba(245, 189, 65, 0.36)');
    radGrad.addColorStop(1, 'rgba(245, 189, 65, 0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#e5bd5b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 86, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#e5bd5b';
    drawSuitGlyph(ctx, 'BONUS', 0, 0, 56);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    this.backTexture = tex;
    return tex;
  }

  public getFeltTexture(): THREE.CanvasTexture {
    if (this.feltTexture) return this.feltTexture;
    const size = 384;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      16,
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, '#102822');
    grad.addColorStop(0.58, '#0b1c18');
    grad.addColorStop(1, '#060f0d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < 650; i += 1) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      ctx.fillRect(px, py, 1.5, 1.5);
    }

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.09)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    this.feltTexture = tex;
    return tex;
  }

  private buildFaceTexture(
    symbol: SymbolId,
    multiplier?: MultiplierValue,
  ): THREE.CanvasTexture {
    const baseW = 512;
    const baseH = 716;
    const w = Math.round(baseW * this.cardScale);
    const h = Math.round(baseH * this.cardScale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(this.cardScale, this.cardScale);

    const style = getCardStyle(symbol, multiplier);

    const bg = ctx.createLinearGradient(0, 0, 0, baseH);
    bg.addColorStop(0, style.bgTop);
    bg.addColorStop(1, style.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, baseW, baseH);

    // Fast radial glow (avoids expensive mobile shadowBlur passes)
    const aura = ctx.createRadialGradient(
      baseW / 2,
      baseH / 2 - 10,
      18,
      baseW / 2,
      baseH / 2 - 10,
      235,
    );
    aura.addColorStop(0, style.glowColor);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, baseW, baseH);

    ctx.strokeStyle = style.frameColor;
    ctx.lineWidth = 8;
    drawRoundedRectPath(ctx, 22, 22, baseW - 44, baseH - 44, 28);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, 38, 38, baseW - 76, baseH - 76, 18);
    ctx.stroke();

    ctx.fillStyle = style.accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const isMult = symbol === 'MULTIPLIER';
    ctx.font = isMult
      ? '800 50px "JetBrains Mono", monospace'
      : '700 58px "Cinzel", Georgia, serif';
    ctx.fillText(style.cornerText, 82, 92);

    ctx.save();
    ctx.translate(baseW - 82, baseH - 92);
    ctx.rotate(Math.PI);
    ctx.fillText(style.cornerText, 0, 0);
    ctx.restore();

    ctx.fillStyle = style.frameColor;
    if (
      symbol === 'DIAMOND' ||
      symbol === 'CLUB' ||
      symbol === 'HEART' ||
      symbol === 'SPADE' ||
      symbol === 'WILD' ||
      symbol === 'BONUS'
    ) {
      drawSuitGlyph(ctx, symbol, baseW / 2, baseH / 2 - 14, 138);
      ctx.fillStyle = style.accentColor;
      drawSuitGlyph(ctx, symbol, baseW / 2, baseH / 2 - 14, 96);
    } else if (symbol === 'QUEEN' || symbol === 'KING' || symbol === 'ACE') {
      ctx.strokeStyle = style.frameColor;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(baseW / 2, baseH / 2 - 12, 136, 0, Math.PI * 2);
      ctx.stroke();

      drawCrownCrest(ctx, baseW / 2, baseH / 2 - 102, 42);

      ctx.fillStyle = style.accentColor;
      ctx.font = '800 176px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.cornerText, baseW / 2, baseH / 2 + 18);
    } else if (symbol === 'MULTIPLIER') {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(baseW / 2, baseH / 2 - 14, 148, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.arc(baseW / 2, baseH / 2 - 14, 126, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fef9c3';
      ctx.font = '800 132px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${multiplier ?? 2}×`, baseW / 2, baseH / 2 - 10);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(style.label, baseW / 2, baseH - 66);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  }

  public dispose(): void {
    this.faceTextures.forEach((t) => t.dispose());
    this.faceTextures.clear();
    this.backTexture?.dispose();
    this.feltTexture?.dispose();
  }
}
