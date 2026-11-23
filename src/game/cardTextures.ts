import * as THREE from 'three';
import { SymbolId } from './types';

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

function createMetallicGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: [number, string][],
): CanvasGradient {
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) {
    grad.addColorStop(offset, color);
  }
  return grad;
}

function traceSuitPath(
  ctx: CanvasRenderingContext2D,
  symbol: SymbolId,
): void {
  if (symbol === 'DIAMOND') {
    ctx.beginPath();
    ctx.moveTo(0, -1.0);
    ctx.quadraticCurveTo(0.22, -0.26, 0.84, 0);
    ctx.quadraticCurveTo(0.22, 0.26, 0, 1.0);
    ctx.quadraticCurveTo(-0.22, 0.26, -0.84, 0);
    ctx.quadraticCurveTo(-0.22, -0.26, 0, -1.0);
    ctx.closePath();
  } else if (symbol === 'HEART') {
    ctx.beginPath();
    ctx.moveTo(0, 0.94);
    ctx.bezierCurveTo(-1.12, 0.22, -1.06, -0.9, -0.45, -0.9);
    ctx.bezierCurveTo(-0.14, -0.9, 0, -0.58, 0, -0.4);
    ctx.bezierCurveTo(0, -0.58, 0.14, -0.9, 0.45, -0.9);
    ctx.bezierCurveTo(1.06, -0.9, 1.12, 0.22, 0, 0.94);
    ctx.closePath();
  } else if (symbol === 'SPADE') {
    ctx.beginPath();
    ctx.moveTo(0, -0.98);
    ctx.bezierCurveTo(0.96, -0.25, 1.04, 0.56, 0.44, 0.56);
    ctx.bezierCurveTo(0.2, 0.56, 0.1, 0.4, 0.08, 0.34);
    ctx.lineTo(0.25, 0.96);
    ctx.lineTo(-0.25, 0.96);
    ctx.lineTo(-0.08, 0.34);
    ctx.bezierCurveTo(-0.1, 0.4, -0.2, 0.56, -0.44, 0.56);
    ctx.bezierCurveTo(-1.04, 0.56, -0.96, -0.25, 0, -0.98);
    ctx.closePath();
  } else if (symbol === 'CLUB') {
    const r = 0.42;
    ctx.beginPath();
    ctx.arc(0, -0.45, r, 0, Math.PI * 2);
    ctx.arc(-0.45, 0.16, r, 0, Math.PI * 2);
    ctx.arc(0.45, 0.16, r, 0, Math.PI * 2);
    ctx.moveTo(-0.1, 0.12);
    ctx.lineTo(0.1, 0.12);
    ctx.lineTo(0.26, 0.96);
    ctx.lineTo(-0.26, 0.96);
    ctx.closePath();
  } else if (symbol === 'BONUS') {
    ctx.beginPath();
    for (let i = 0; i < 16; i += 1) {
      const ang = (i * Math.PI) / 8 - Math.PI / 2;
      const rad = i % 2 === 0 ? 1.02 : i % 4 === 1 ? 0.36 : 0.62;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (symbol === 'WILD') {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const ang = (i * Math.PI) / 5 - Math.PI / 2;
      const rad = i % 2 === 0 ? 1.02 : 0.42;
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}

interface CardStyle {
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  frameStops: [number, string][];
  frameColor: string;
  accentColor: string;
  gemLight: string;
  gemMid: string;
  gemDark: string;
  glowColor: string;
  rimHighlight: string;
  cornerText: string;
  label: string;
}

const GOLD_FRAME_STOPS: [number, string][] = [
  [0, '#fff5cc'],
  [0.24, '#f5c451'],
  [0.52, '#a16207'],
  [0.78, '#fde047'],
  [1, '#b45309'],
];

function getCardStyle(symbol: SymbolId): CardStyle {
  switch (symbol) {
    case 'DIAMOND':
      return {
        bgTop: '#0b2244',
        bgMid: '#07152b',
        bgBottom: '#030914',
        frameStops: [
          [0, '#e0f2fe'],
          [0.28, '#38bdf8'],
          [0.55, '#0369a1'],
          [0.8, '#bae6fd'],
          [1, '#0284c7'],
        ],
        frameColor: '#38bdf8',
        accentColor: '#e0f2fe',
        gemLight: '#e0f2fe',
        gemMid: '#0ea5e9',
        gemDark: '#0c4a6e',
        glowColor: 'rgba(56, 189, 248, 0.36)',
        rimHighlight: 'rgba(186, 230, 253, 0.55)',
        cornerText: '♦',
        label: 'DIAMOND',
      };
    case 'CLUB':
      return {
        bgTop: '#072a1f',
        bgMid: '#041a13',
        bgBottom: '#020b08',
        frameStops: [
          [0, '#d1fae5'],
          [0.28, '#34d399'],
          [0.55, '#047857'],
          [0.8, '#a7f3d0'],
          [1, '#059669'],
        ],
        frameColor: '#34d399',
        accentColor: '#d1fae5',
        gemLight: '#a7f3d0',
        gemMid: '#10b981',
        gemDark: '#064e3b',
        glowColor: 'rgba(52, 211, 153, 0.34)',
        rimHighlight: 'rgba(167, 243, 208, 0.5)',
        cornerText: '♣',
        label: 'CLUB',
      };
    case 'HEART':
      return {
        bgTop: '#3c0b1e',
        bgMid: '#210510',
        bgBottom: '#100207',
        frameStops: [
          [0, '#ffe4e6'],
          [0.28, '#fb7185'],
          [0.55, '#be123c'],
          [0.8, '#fecdd3'],
          [1, '#9f1239'],
        ],
        frameColor: '#fb7185',
        accentColor: '#ffe4e6',
        gemLight: '#fecdd3',
        gemMid: '#f43f5e',
        gemDark: '#881337',
        glowColor: 'rgba(251, 113, 133, 0.36)',
        rimHighlight: 'rgba(254, 205, 211, 0.52)',
        cornerText: '♥',
        label: 'HEART',
      };
    case 'SPADE':
      return {
        bgTop: '#1c2434',
        bgMid: '#101520',
        bgBottom: '#07090f',
        frameStops: [
          [0, '#f8fafc'],
          [0.28, '#cbd5e1'],
          [0.55, '#475569'],
          [0.8, '#f1f5f9'],
          [1, '#64748b'],
        ],
        frameColor: '#cbd5e1',
        accentColor: '#f8fafc',
        gemLight: '#64748b',
        gemMid: '#1e293b',
        gemDark: '#090d16',
        glowColor: 'rgba(203, 213, 225, 0.28)',
        rimHighlight: 'rgba(248, 250, 252, 0.45)',
        cornerText: '♠',
        label: 'SPADE',
      };
    case 'QUEEN':
      return {
        bgTop: '#33124d',
        bgMid: '#1b082c',
        bgBottom: '#0c0315',
        frameStops: [
          [0, '#fae8ff'],
          [0.28, '#c084fc'],
          [0.55, '#7e22ce'],
          [0.8, '#f3e8ff'],
          [1, '#a855f7'],
        ],
        frameColor: '#c084fc',
        accentColor: '#f5d0fe',
        gemLight: '#f3e8ff',
        gemMid: '#c084fc',
        gemDark: '#581c87',
        glowColor: 'rgba(192, 132, 252, 0.38)',
        rimHighlight: 'rgba(245, 208, 254, 0.55)',
        cornerText: 'Q',
        label: 'QUEEN',
      };
    case 'KING':
      return {
        bgTop: '#3a1f08',
        bgMid: '#201003',
        bgBottom: '#0e0601',
        frameStops: GOLD_FRAME_STOPS,
        frameColor: '#fbbf24',
        accentColor: '#fef3c7',
        gemLight: '#fef3c7',
        gemMid: '#f59e0b',
        gemDark: '#92400e',
        glowColor: 'rgba(251, 191, 36, 0.40)',
        rimHighlight: 'rgba(254, 243, 199, 0.58)',
        cornerText: 'K',
        label: 'KING',
      };
    case 'ACE':
      return {
        bgTop: '#2f2309',
        bgMid: '#191204',
        bgBottom: '#090702',
        frameStops: GOLD_FRAME_STOPS,
        frameColor: '#f59e0b',
        accentColor: '#fffbeb',
        gemLight: '#fffbeb',
        gemMid: '#fbbf24',
        gemDark: '#78350f',
        glowColor: 'rgba(245, 158, 11, 0.45)',
        rimHighlight: 'rgba(255, 251, 235, 0.65)',
        cornerText: 'A',
        label: 'ACE',
      };
    case 'WILD':
      return {
        bgTop: '#083330',
        bgMid: '#041d1b',
        bgBottom: '#020d0c',
        frameStops: [
          [0, '#ccfbf1'],
          [0.26, '#2dd4bf'],
          [0.52, '#f59e0b'],
          [0.78, '#99f6e4'],
          [1, '#0d9488'],
        ],
        frameColor: '#2dd4bf',
        accentColor: '#ccfbf1',
        gemLight: '#f0fdfa',
        gemMid: '#14b8a6',
        gemDark: '#134e4a',
        glowColor: 'rgba(45, 212, 191, 0.46)',
        rimHighlight: 'rgba(204, 251, 241, 0.65)',
        cornerText: '★',
        label: 'WILD',
      };
    case 'BONUS':
      return {
        bgTop: '#400f36',
        bgMid: '#21061c',
        bgBottom: '#0e020c',
        frameStops: [
          [0, '#fce7f3'],
          [0.26, '#f472b6'],
          [0.52, '#eab308'],
          [0.78, '#fbcfe8'],
          [1, '#db2777'],
        ],
        frameColor: '#f472b6',
        accentColor: '#fce7f3',
        gemLight: '#fdf2f8',
        gemMid: '#ec4899',
        gemDark: '#831843',
        glowColor: 'rgba(244, 114, 182, 0.46)',
        rimHighlight: 'rgba(252, 231, 243, 0.65)',
        cornerText: '✦',
        label: 'SCATTER',
      };
  }
}

function drawCornerOrnament(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 7);
  ctx.lineTo(-7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLuxuryCrown(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  jewelColor: string,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;

  const goldGrad = createMetallicGradient(ctx, -1, -0.6, 1, 0.7, GOLD_FRAME_STOPS);
  ctx.fillStyle = goldGrad;
  ctx.beginPath();
  ctx.moveTo(-0.88, 0.42);
  ctx.lineTo(-0.98, -0.38);
  ctx.lineTo(-0.44, 0.04);
  ctx.lineTo(0, -0.62);
  ctx.lineTo(0.44, 0.04);
  ctx.lineTo(0.98, -0.38);
  ctx.lineTo(0.88, 0.42);
  ctx.closePath();
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255, 250, 220, 0.8)';
  ctx.lineWidth = 0.045;
  ctx.stroke();

  ctx.fillStyle = goldGrad;
  ctx.fillRect(-0.86, 0.5, 1.72, 0.17);

  // Crown tip pearls & central jewel
  const tips: [number, number, number, string][] = [
    [-0.98, -0.4, 0.09, '#fffbeb'],
    [0, -0.64, 0.12, jewelColor],
    [0.98, -0.4, 0.09, '#fffbeb'],
  ];
  for (const [tx, ty, tr, col] of tips) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFacetedSuitEmblem(
  ctx: CanvasRenderingContext2D,
  symbol: SymbolId,
  cx: number,
  cy: number,
  scale: number,
  style: CardStyle,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // Outer drop shadow for 3D lift
  ctx.shadowColor = 'rgba(0, 0, 0, 0.62)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;

  const gemGrad = ctx.createRadialGradient(-0.24, -0.32, 0.08, 0, 0.08, 1.08);
  gemGrad.addColorStop(0, style.gemLight);
  gemGrad.addColorStop(0.42, style.gemMid);
  gemGrad.addColorStop(1, style.gemDark);

  traceSuitPath(ctx, symbol);
  ctx.fillStyle = gemGrad;
  ctx.fill();

  ctx.shadowColor = 'transparent';

  // Crisp metallic rim around emblem
  const rimGrad = createMetallicGradient(
    ctx,
    -1,
    -1,
    1,
    1,
    symbol === 'SPADE' ? GOLD_FRAME_STOPS : style.frameStops,
  );
  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = symbol === 'SPADE' ? 0.075 : 0.055;
  ctx.stroke();

  // Clip inside symbol to paint crystal facets & specular highlights
  ctx.save();
  traceSuitPath(ctx, symbol);
  ctx.clip();

  if (symbol === 'DIAMOND') {
    // 4-quadrant sapphire crystal facets
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0, 0);
    ctx.lineTo(-0.84, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(3, 105, 161, 0.38)';
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(0, 0);
    ctx.lineTo(0.84, 0);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(224, 242, 254, 0.45)';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.lineTo(0, 1);
    ctx.moveTo(-0.84, 0);
    ctx.lineTo(0.84, 0);
    ctx.stroke();

    // Inner diamond core table facet
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath();
    ctx.moveTo(0, -0.44);
    ctx.lineTo(0.36, 0);
    ctx.lineTo(0, 0.44);
    ctx.lineTo(-0.36, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();
  } else if (symbol === 'HEART') {
    // Soft ruby glass highlight on left lobe + darker right bevel
    const lobeShine = ctx.createRadialGradient(-0.42, -0.46, 0.02, -0.42, -0.46, 0.48);
    lobeShine.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    lobeShine.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = lobeShine;
    ctx.fillRect(-1.1, -1.0, 2.2, 2.0);
  } else if (symbol === 'CLUB') {
    // Emerald highlights on top & left lobes
    for (const [lx, ly] of [
      [-0.08, -0.54],
      [-0.5, 0.08],
      [0.36, 0.08],
    ]) {
      const shine = ctx.createRadialGradient(lx, ly, 0.02, lx, ly, 0.34);
      shine.addColorStop(0, 'rgba(236, 253, 245, 0.46)');
      shine.addColorStop(1, 'rgba(236, 253, 245, 0)');
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.arc(lx, ly, 0.34, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (symbol === 'SPADE') {
    // Brushed gold vertical ridge + subtle slate specular sweep
    const sweep = ctx.createLinearGradient(-0.8, -0.8, 0.6, 0.6);
    sweep.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    sweep.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    sweep.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
    ctx.fillStyle = sweep;
    ctx.fillRect(-1.1, -1.1, 2.2, 2.2);

    ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(0, -0.78);
    ctx.lineTo(0, 0.28);
    ctx.stroke();
  } else if (symbol === 'WILD') {
    // Faceted 10-point prismatic star (light/dark alternating ray halves)
    for (let i = 0; i < 10; i += 1) {
      const ang1 = (i * Math.PI) / 5 - Math.PI / 2;
      const ang2 = ((i + 1) * Math.PI) / 5 - Math.PI / 2;
      const r1 = i % 2 === 0 ? 1.02 : 0.42;
      const r2 = (i + 1) % 2 === 0 ? 1.02 : 0.42;
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(255, 255, 255, 0.28)' : 'rgba(13, 148, 136, 0.35)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang1) * r1, Math.sin(ang1) * r1);
      ctx.lineTo(Math.cos(ang2) * r2, Math.sin(ang2) * r2);
      ctx.closePath();
      ctx.fill();
    }
    // Bright champagne-diamond core
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.moveTo(0, -0.28);
    ctx.lineTo(0.28, 0);
    ctx.lineTo(0, 0.28);
    ctx.lineTo(-0.28, 0);
    ctx.closePath();
    ctx.fill();
  } else if (symbol === 'BONUS') {
    // Celestial 16-point faceted compass star
    for (let i = 0; i < 16; i += 1) {
      const ang1 = (i * Math.PI) / 8 - Math.PI / 2;
      const ang2 = ((i + 1) * Math.PI) / 8 - Math.PI / 2;
      const r1 = i % 2 === 0 ? 1.02 : i % 4 === 1 ? 0.36 : 0.62;
      const r2 = (i + 1) % 2 === 0 ? 1.02 : (i + 1) % 4 === 1 ? 0.36 : 0.62;
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(255, 240, 248, 0.30)' : 'rgba(157, 23, 77, 0.42)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang1) * r1, Math.sin(ang1) * r1);
      ctx.lineTo(Math.cos(ang2) * r2, Math.sin(ang2) * r2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(0, 0, 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.03;
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

const ALL_SYMBOLS: SymbolId[] = [
  'DIAMOND',
  'CLUB',
  'HEART',
  'SPADE',
  'QUEEN',
  'KING',
  'ACE',
  'WILD',
  'BONUS',
];

export class CardTextureAtlas {
  private faceTextures = new Map<SymbolId, THREE.CanvasTexture>();
  private backTexture: THREE.CanvasTexture | null = null;
  private feltTexture: THREE.CanvasTexture | null = null;
  private maxAnisotropy: number;
  private cardScale: number;

  constructor(maxAnisotropy: number, isMobile: boolean) {
    this.maxAnisotropy = Math.min(maxAnisotropy, isMobile ? 4 : 8);
    this.cardScale = isMobile ? 0.75 : 1.0;
  }

  public preloadAll(renderer: THREE.WebGLRenderer): void {
    renderer.initTexture(this.getBackTexture());
    renderer.initTexture(this.getFeltTexture());
    for (const symbol of ALL_SYMBOLS) {
      renderer.initTexture(this.getFaceTexture(symbol));
    }
  }

  public getFaceTexture(symbol: SymbolId): THREE.CanvasTexture {
    const cached = this.faceTextures.get(symbol);
    if (cached) return cached;

    const tex = this.buildFaceTexture(symbol);
    this.faceTextures.set(symbol, tex);
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
    bg.addColorStop(0, '#0a1224');
    bg.addColorStop(0.5, '#13203b');
    bg.addColorStop(1, '#070b16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, baseW, baseH);

    // Subtle guilloché diamond weave
    ctx.save();
    drawRoundedRectPath(ctx, 44, 44, baseW - 88, baseH - 88, 16);
    ctx.clip();
    ctx.strokeStyle = 'rgba(245, 196, 81, 0.14)';
    ctx.lineWidth = 1.5;
    const step = 36;
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

    // Brushed gold outer bevel frame
    ctx.strokeStyle = createMetallicGradient(
      ctx,
      0,
      0,
      baseW,
      baseH,
      GOLD_FRAME_STOPS,
    );
    ctx.lineWidth = 8;
    drawRoundedRectPath(ctx, 22, 22, baseW - 44, baseH - 44, 26);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(254, 240, 138, 0.42)';
    ctx.lineWidth = 2;
    drawRoundedRectPath(ctx, 38, 38, baseW - 76, baseH - 76, 18);
    ctx.stroke();

    drawCornerOrnament(ctx, 56, 56, '#f5c451');
    drawCornerOrnament(ctx, baseW - 56, 56, '#f5c451');
    drawCornerOrnament(ctx, 56, baseH - 56, '#f5c451');
    drawCornerOrnament(ctx, baseW - 56, baseH - 56, '#f5c451');

    // Ornate central celestial medallion
    ctx.save();
    ctx.translate(baseW / 2, baseH / 2);
    const radGrad = ctx.createRadialGradient(0, 0, 12, 0, 0, 150);
    radGrad.addColorStop(0, 'rgba(245, 189, 65, 0.42)');
    radGrad.addColorStop(1, 'rgba(245, 189, 65, 0)');
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = createMetallicGradient(
      ctx,
      -105,
      -105,
      105,
      105,
      GOLD_FRAME_STOPS,
    );
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(0, 0, 102, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(254, 240, 138, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 84, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = createMetallicGradient(
      ctx,
      -54,
      -54,
      54,
      54,
      GOLD_FRAME_STOPS,
    );
    ctx.save();
    ctx.scale(62, 62);
    traceSuitPath(ctx, 'BONUS');
    ctx.fill();
    ctx.restore();
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

  private buildFaceTexture(symbol: SymbolId): THREE.CanvasTexture {
    const baseW = 512;
    const baseH = 716;
    const w = Math.round(baseW * this.cardScale);
    const h = Math.round(baseH * this.cardScale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(this.cardScale, this.cardScale);

    const style = getCardStyle(symbol);

    // 1. Rich diagonal velvet jewel base
    const bg = ctx.createLinearGradient(0, 0, baseW * 0.65, baseH);
    bg.addColorStop(0, style.bgTop);
    bg.addColorStop(0.52, style.bgMid);
    bg.addColorStop(1, style.bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, baseW, baseH);

    // 2. Subtle guilloché diamond weave watermark inside inner border
    ctx.save();
    drawRoundedRectPath(ctx, 36, 36, baseW - 72, baseH - 72, 20);
    ctx.clip();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 1.25;
    const weaveStep = 44;
    for (let x = -baseH; x < baseW + baseH; x += weaveStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + baseH, baseH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + baseH, 0);
      ctx.lineTo(x, baseH);
      ctx.stroke();
    }

    // 3. Diagonal foil sheen sweep
    const sheen = ctx.createLinearGradient(0, 0, baseW, baseH);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    sheen.addColorStop(0.32, 'rgba(255, 255, 255, 0.0)');
    sheen.addColorStop(0.52, 'rgba(255, 255, 255, 0.065)');
    sheen.addColorStop(0.74, 'rgba(255, 255, 255, 0.0)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0.24)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, baseW, baseH);
    ctx.restore();

    // 4. Center jewel illumination aura
    const aura = ctx.createRadialGradient(
      baseW / 2,
      baseH / 2 - 14,
      14,
      baseW / 2,
      baseH / 2 - 14,
      250,
    );
    aura.addColorStop(0, style.glowColor);
    aura.addColorStop(0.65, 'rgba(0, 0, 0, 0)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, baseW, baseH);

    // 5. Outer metallic bevel frame & inner hairline trim
    const frameGrad = createMetallicGradient(
      ctx,
      18,
      18,
      baseW - 18,
      baseH - 18,
      style.frameStops,
    );
    ctx.strokeStyle = frameGrad;
    ctx.lineWidth = 9;
    drawRoundedRectPath(ctx, 21, 21, baseW - 42, baseH - 42, 28);
    ctx.stroke();

    ctx.strokeStyle = style.rimHighlight;
    ctx.lineWidth = 1.75;
    drawRoundedRectPath(ctx, 36, 36, baseW - 72, baseH - 72, 18);
    ctx.stroke();

    // Ornate corner diamond pips (top-right and bottom-left free corners)
    drawCornerOrnament(ctx, baseW - 60, 62, style.frameColor);
    drawCornerOrnament(ctx, 60, baseH - 62, style.frameColor);

    // 6. Metallic corner indices with drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = style.accentColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 56px "Cinzel", Georgia, serif';
    ctx.fillText(style.cornerText, 78, 86);

    ctx.save();
    ctx.translate(baseW - 78, baseH - 86);
    ctx.rotate(Math.PI);
    ctx.fillText(style.cornerText, 0, 0);
    ctx.restore();
    ctx.restore();

    // 7. Centerpiece artwork
    const cx = baseW / 2;
    const cy = baseH / 2 - 14;

    if (
      symbol === 'DIAMOND' ||
      symbol === 'CLUB' ||
      symbol === 'HEART' ||
      symbol === 'SPADE' ||
      symbol === 'WILD' ||
      symbol === 'BONUS'
    ) {
      // Subtle filigree halo ring behind special/suit emblems
      ctx.save();
      ctx.strokeStyle = style.rimHighlight;
      ctx.globalAlpha = symbol === 'WILD' || symbol === 'BONUS' ? 0.52 : 0.24;
      ctx.lineWidth = symbol === 'WILD' || symbol === 'BONUS' ? 3 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 152, 0, Math.PI * 2);
      ctx.stroke();

      if (symbol === 'WILD' || symbol === 'BONUS') {
        ctx.setLineDash([4, 10]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 170, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      drawFacetedSuitEmblem(ctx, symbol, cx, cy, 142, style);
    } else {
      // Royal Medallions: QUEEN, KING, ACE
      ctx.save();
      ctx.translate(cx, cy + 4);

      // Outer radiant ticks for ACE
      if (symbol === 'ACE') {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.25)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 24; i += 1) {
          const ang = (i * Math.PI) / 12;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang) * 144, Math.sin(ang) * 144);
          ctx.lineTo(Math.cos(ang) * 172, Math.sin(ang) * 172);
          ctx.stroke();
        }
      }

      // Medallion recessed disc
      const discGrad = ctx.createRadialGradient(0, -30, 12, 0, 0, 140);
      discGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
      discGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
      ctx.fillStyle = discGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 140, 0, Math.PI * 2);
      ctx.fill();

      // Double metallic bezel rings
      ctx.strokeStyle = frameGrad;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 140, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = style.rimHighlight;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 124, 0, Math.PI * 2);
      ctx.stroke();

      // Cardinal gem pips on medallion ring
      for (const [gx, gy] of [
        [-140, 0],
        [140, 0],
        [0, 140],
      ]) {
        drawCornerOrnament(ctx, gx, gy, style.accentColor);
      }

      ctx.restore();

      const crownJewel =
        symbol === 'QUEEN'
          ? '#e879f9'
          : symbol === 'KING'
            ? '#fb7185'
            : '#38bdf8';
      drawLuxuryCrown(ctx, cx, cy - 114, 44, crownJewel);

      // Embossed metallic serif letterform
      ctx.save();
      ctx.font = '800 176px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 8;

      const letterGrad = createMetallicGradient(
        ctx,
        cx,
        cy - 70,
        cx,
        cy + 90,
        [
          [0, '#ffffff'],
          [0.35, style.accentColor],
          [0.75, style.frameColor],
          [1, style.gemDark],
        ],
      );
      ctx.fillStyle = letterGrad;
      ctx.fillText(style.cornerText, cx, cy + 20);

      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeText(style.cornerText, cx, cy + 20);
      ctx.restore();
    }

    // 8. Bottom metallic nameplate divider & label
    ctx.save();
    ctx.strokeStyle = style.rimHighlight;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(132, baseH - 94);
    ctx.lineTo(baseW - 132, baseH - 94);
    ctx.stroke();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = style.accentColor;
    ctx.font = '700 22px "Cinzel", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.label, baseW / 2, baseH - 68);
    ctx.restore();

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
