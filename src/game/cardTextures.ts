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
    // 8-point arcana star crest
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
    // Stylized 5-point royal star
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
        glowColor: 'rgba(56, 189, 248, 0.25)',
        cornerText: '♦',
        label: 'DIAMOND',
      };
    case 'CLUB':
      return {
        bgTop: '#0a221b',
        bgBottom: '#06130f',
        frameColor: '#34d399',
        accentColor: '#6ee7b7',
        glowColor: 'rgba(52, 211, 153, 0.24)',
        cornerText: '♣',
        label: 'CLUB',
      };
    case 'HEART':
      return {
        bgTop: '#2b0f1b',
        bgBottom: '#16070d',
        frameColor: '#fb7185',
        accentColor: '#fda4af',
        glowColor: 'rgba(251, 113, 133, 0.26)',
        cornerText: '♥',
        label: 'HEART',
      };
    case 'SPADE':
      return {
        bgTop: '#161b26',
        bgBottom: '#0a0d13',
        frameColor: '#94a3b8',
        accentColor: '#e2e8f0',
        glowColor: 'rgba(148, 163, 184, 0.24)',
        cornerText: '♠',
        label: 'SPADE',
      };
    case 'QUEEN':
      return {
        bgTop: '#261338',
        bgBottom: '#12081c',
        frameColor: '#c084fc',
        accentColor: '#e9d5ff',
        glowColor: 'rgba(192, 132, 252, 0.28)',
        cornerText: 'Q',
        label: 'QUEEN',
      };
    case 'KING':
      return {
        bgTop: '#2a1c0a',
        bgBottom: '#140c04',
        frameColor: '#fbbf24',
        accentColor: '#fde68a',
        glowColor: 'rgba(251, 191, 36, 0.28)',
        cornerText: 'K',
        label: 'KING',
      };
    case 'ACE':
      return {
        bgTop: '#2d2310',
        bgBottom: '#130e06',
        frameColor: '#f59e0b',
        accentColor: '#fef3c7',
        glowColor: 'rgba(245, 158, 11, 0.34)',
        cornerText: 'A',
        label: 'ACE',
      };
    case 'WILD':
      return {
        bgTop: '#0b2928',
        bgBottom: '#061515',
        frameColor: '#2dd4bf',
        accentColor: '#99f6e4',
        glowColor: 'rgba(45, 212, 191, 0.36)',
        cornerText: '★',
        label: 'WILD',
      };
    case 'BONUS':
      return {
        bgTop: '#32102c',
        bgBottom: '#170615',
        frameColor: '#f472b6',
        accentColor: '#fbcfe8',
        glowColor: 'rgba(244, 114, 182, 0.36)',
        cornerText: '✦',
        label: 'BONUS',
      };
    case 'MULTIPLIER':
      return {
        bgTop: '#332307',
        bgBottom: '#170f03',
        frameColor: '#facc15',
        accentColor: '#fef08a',
        glowColor: 'rgba(250, 204, 21, 0.42)',
        cornerText: `${multiplier ?? 2}×`,
        label: 'MULTIPLIER',
      };
  }
}

export class CardTextureAtlas {
  private faceTextures = new Map<string, THREE.CanvasTexture>();
  private backTexture: THREE.CanvasTexture | null = null;
  private feltTexture: THREE.CanvasTexture | null = null;
  private maxAnisotropy: number;

  constructor(maxAnisotropy: number) {
    this.maxAnisotropy = Math.min(maxAnisotropy, 8);
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
    const w = 512;
    const h = 716;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // Deep midnight obsidian gradient
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0c1220');
    bg.addColorStop(0.5, '#131d31');
    bg.addColorStop(1, '#090d17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Ornate gold double-line border
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.72)';
    ctx.lineWidth = 6;
    drawRoundedRectPath(ctx, 26, 26, w - 52, h - 52, 26);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, 42, 42, w - 84, h - 84, 18);
    ctx.stroke();

    // Guilloché diamond lattice
    ctx.save();
    drawRoundedRectPath(ctx, 48, 48, w - 96, h - 96, 14);
    ctx.clip();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.16)';
    ctx.lineWidth = 2;
    const step = 44;
    for (let x = -h; x < w + h; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + h, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.restore();

    // Center arcana medallion
    ctx.save();
    ctx.translate(w / 2, h / 2);
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
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      20,
      size / 2,
      size / 2,
      size / 2,
    );
    grad.addColorStop(0, '#102822');
    grad.addColorStop(0.58, '#0b1c18');
    grad.addColorStop(1, '#060f0d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle woven felt micro-grain
    ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
    for (let i = 0; i < 3500; i += 1) {
      const px = Math.random() * size;
      const py = Math.random() * size;
      ctx.fillRect(px, py, 1.5, 1.5);
    }

    // Subtle inlaid gold compass rings
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.08)';
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
    const w = 512;
    const h = 716;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const style = getCardStyle(symbol, multiplier);

    // Rich card background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, style.bgTop);
    bg.addColorStop(1, style.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Center aura radial glow
    const aura = ctx.createRadialGradient(w / 2, h / 2, 16, w / 2, h / 2, 230);
    aura.addColorStop(0, style.glowColor);
    aura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    // Crisp outer foil frame
    ctx.strokeStyle = style.frameColor;
    ctx.lineWidth = 8;
    drawRoundedRectPath(ctx, 22, 22, w - 44, h - 44, 28);
    ctx.stroke();

    // Inner hairline filigree frame
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, 38, 38, w - 76, h - 76, 18);
    ctx.stroke();

    // Corner indices (top-left & bottom-right)
    ctx.fillStyle = style.accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const isMult = symbol === 'MULTIPLIER';
    ctx.font = isMult
      ? '800 50px "JetBrains Mono", monospace'
      : '700 58px "Cinzel", Georgia, serif';
    ctx.fillText(style.cornerText, 82, 92);

    ctx.save();
    ctx.translate(w - 82, h - 92);
    ctx.rotate(Math.PI);
    ctx.fillText(style.cornerText, 0, 0);
    ctx.restore();

    // Central emblem
    ctx.save();
    ctx.shadowColor = style.frameColor;
    ctx.shadowBlur = 24;
    ctx.fillStyle = style.frameColor;

    if (
      symbol === 'DIAMOND' ||
      symbol === 'CLUB' ||
      symbol === 'HEART' ||
      symbol === 'SPADE' ||
      symbol === 'WILD' ||
      symbol === 'BONUS'
    ) {
      drawSuitGlyph(ctx, symbol, w / 2, h / 2 - 14, 138);
      // Inner highlight sheen
      ctx.shadowBlur = 0;
      ctx.fillStyle = style.accentColor;
      drawSuitGlyph(ctx, symbol, w / 2, h / 2 - 14, 96);
    } else if (symbol === 'QUEEN' || symbol === 'KING' || symbol === 'ACE') {
      // Royal medallion ring
      ctx.strokeStyle = style.frameColor;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 12, 136, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowBlur = 0;
      drawCrownCrest(ctx, w / 2, h / 2 - 102, 42);

      ctx.fillStyle = style.accentColor;
      ctx.font = '800 176px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(style.cornerText, w / 2, h / 2 + 18);
    } else if (symbol === 'MULTIPLIER') {
      // Holographic golden multiplier seal
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 14, 148, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 - 14, 126, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fef9c3';
      ctx.font = '800 132px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${multiplier ?? 2}×`, w / 2, h / 2 - 10);
    }
    ctx.restore();

    // Crisp bottom plaque label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(style.label, w / 2, h - 66);

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
