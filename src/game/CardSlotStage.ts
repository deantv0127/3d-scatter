import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { soundEngine } from './audio';
import { CardTextureAtlas } from './cardTextures';
import { createShowcaseGrid } from './slotEngine';
import {
  CardCellData,
  CascadeTierMultiplier,
  GRID_COLS,
  GRID_ROWS,
  SpinOutcome,
  SymbolId,
} from './types';

// Module-scope reusable math helpers (zero GC inside render loop)
const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scaleVec = new THREE.Vector3();
const _color = new THREE.Color();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();

const CARD_W = 1.16;
const CARD_H = 1.62;
const CARD_GAP_X = 0.12;
const CARD_GAP_Y = 0.12;
const COL_STEP = CARD_W + CARD_GAP_X;
const ROW_STEP = CARD_H + CARD_GAP_Y;

function cellToWorldX(col: number): number {
  return (col - (GRID_COLS - 1) / 2) * COL_STEP;
}

function cellToWorldY(row: number): number {
  return ((GRID_ROWS - 1) / 2 - row) * ROW_STEP - 0.02;
}

function createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

function createNormalizedRoundedPlane(
  w: number,
  h: number,
  r: number,
): THREE.ShapeGeometry {
  const shape = createRoundedRectShape(w, h, r);
  const geo = new THREE.ShapeGeometry(shape, 6);
  const pos = geo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uvs[i * 2] = (x + w / 2) / w;
    uvs[i * 2 + 1] = (y + h / 2) / h;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geo;
}

function createHaloFrameGeometry(
  w: number,
  h: number,
  r: number,
  border: number,
): THREE.ExtrudeGeometry {
  const outer = createRoundedRectShape(
    w + border * 2,
    h + border * 2,
    r + border * 0.6,
  );
  const inner = createRoundedRectShape(w - 0.01, h - 0.01, r);
  outer.holes.push(inner);
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth: 0.028,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 5,
  });
  geo.center();
  return geo;
}

interface CardRig {
  group: THREE.Group;
  frontMesh: THREE.Mesh;
  frontMat: THREE.MeshStandardMaterial;
  haloMesh: THREE.Mesh;
  haloMat: THREE.MeshStandardMaterial;
  hitMesh: THREE.Mesh;
  cell: CardCellData;
  pos: THREE.Vector3;
  targetPos: THREE.Vector3;
  rot: THREE.Vector3;
  targetRot: THREE.Vector3;
  scale: number;
  targetScale: number;
  velY: number;
  springBounce: boolean;
  delayTimer: number;
  hideWhileDelayed: boolean;
  highlightIntensity: number;
  targetHighlight: number;
  highlightColor: THREE.Color;
  phaseOffset: number;
}

interface ParticleState {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface StageCallbacks {
  onCardInspect?: (cell: CardCellData) => void;
  onCascadeStep?: (
    stepIndex: number,
    tierMultiplier: CascadeTierMultiplier,
    stepWin: number,
    runningWin: number,
  ) => void;
  onContextLostChange?: (lost: boolean) => void;
}

export class CardSlotStage {
  private container: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private atlas!: CardTextureAtlas;
  private isSoftwareGl: boolean;
  private isMobile: boolean;
  private callbacks: StageCallbacks;

  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private elapsedTime = 0;

  private cardRigs: CardRig[] = [];
  private cardContainer = new THREE.Group();
  private stageGroup = new THREE.Group();
  private winPointLight!: THREE.PointLight;
  private keyLight!: THREE.DirectionalLight;

  private sharedGeometries: THREE.BufferGeometry[] = [];
  private sharedMaterials: THREE.Material[] = [];

  private readonly particleCount = 110;
  private particleMesh!: THREE.InstancedMesh;
  private particles: ParticleState[] = [];

  private baseCamPos = new THREE.Vector3(0, 0.25, 9.4);
  private baseLookTarget = new THREE.Vector3(0, 0.14, 0);
  private currentLookTarget = new THREE.Vector3(0, 0.14, 0);
  private pointerTiltX = 0;
  private pointerTiltY = 0;
  private targetPointerTiltX = 0;
  private targetPointerTiltY = 0;
  private shakeTrauma = 0;

  private mode: 'title' | 'idle' | 'spinning' = 'title';
  private inspectedCardId: string | null = null;
  private inspectTimer = 0;
  private isPointerDown = false;
  private pointerDownPos = { x: 0, y: 0 };
  private abortController: AbortController | null = null;

  constructor(container: HTMLElement, callbacks: StageCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = this.detectSoftwareWebGL();
    this.isMobile =
      typeof window !== 'undefined' &&
      (window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);

    this.initScene();
    this.buildTableStage();
    this.buildParticles();
    this.buildInitialCards();
    this.updateCameraFraming();
    this.bindEvents();

    // Pre-warm all card textures & shaders at startup so spins never hitch on mobile
    this.atlas.preloadAll(this.renderer);
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.clock.start();
    this.tick();
  }

  private detectSoftwareWebGL(): boolean {
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return false;
    }
  }

  private initScene(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    const targetDpr = this.isSoftwareGl
      ? 1
      : Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 2);
    this.renderer.setPixelRatio(targetDpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && !this.isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    this.container.appendChild(canvas);

    this.scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x070a10);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(0x070a10, 0.042);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
    this.camera.position.copy(this.baseCamPos);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0x9cb8ff, 0x1a1410, 0.7);
    this.scene.add(hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff1d6, 2.15);
    this.keyLight.position.set(4.5, 7.2, 6.8);
    if (this.renderer.shadowMap.enabled) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.camera.near = 1;
      this.keyLight.shadow.camera.far = 22;
      const d = 5.5;
      this.keyLight.shadow.camera.left = -d;
      this.keyLight.shadow.camera.right = d;
      this.keyLight.shadow.camera.top = d;
      this.keyLight.shadow.camera.bottom = -d;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0x4fd1c5, 0.95);
    rimLight.position.set(-5.2, 3.2, -4.5);
    this.scene.add(rimLight);

    this.winPointLight = new THREE.PointLight(0xffcb57, 0.0, 14, 1.5);
    this.winPointLight.position.set(0, 0.5, 3.5);
    this.scene.add(this.winPointLight);

    this.atlas = new CardTextureAtlas(
      this.renderer.capabilities.getMaxAnisotropy(),
      this.isMobile,
    );
    this.scene.add(this.stageGroup);
    this.scene.add(this.cardContainer);
  }

  private buildTableStage(): void {
    const plinthPoints = [
      new THREE.Vector2(0, -0.36),
      new THREE.Vector2(5.45, -0.36),
      new THREE.Vector2(5.68, -0.18),
      new THREE.Vector2(5.42, -0.02),
      new THREE.Vector2(5.12, 0.0),
      new THREE.Vector2(0, 0.0),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthPoints, 40);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x0d1119,
      roughness: 0.42,
      metalness: 0.65,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(0, -3.04, -0.35);
    plinth.receiveShadow = true;
    this.stageGroup.add(plinth);
    this.sharedGeometries.push(plinthGeo);
    this.sharedMaterials.push(plinthMat);

    const feltGeo = new THREE.CircleGeometry(5.06, 40);
    feltGeo.rotateX(-Math.PI / 2);
    const feltMat = new THREE.MeshStandardMaterial({
      map: this.atlas.getFeltTexture(),
      roughness: 0.88,
      metalness: 0.04,
    });
    const felt = new THREE.Mesh(feltGeo, feltMat);
    felt.position.set(0, -3.02, -0.35);
    felt.receiveShadow = true;
    this.stageGroup.add(felt);
    this.sharedGeometries.push(feltGeo);
    this.sharedMaterials.push(feltMat);

    const bezelGeo = new THREE.TorusGeometry(5.18, 0.09, 12, 48);
    bezelGeo.rotateX(Math.PI / 2);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.92,
      roughness: 0.22,
    });
    const bezel = new THREE.Mesh(bezelGeo, brassMat);
    bezel.position.set(0, -3.01, -0.35);
    this.stageGroup.add(bezel);
    this.sharedGeometries.push(bezelGeo);
    this.sharedMaterials.push(brassMat);

    const boardW = GRID_COLS * CARD_W + (GRID_COLS - 1) * CARD_GAP_X + 0.34;
    const boardH = GRID_ROWS * CARD_H + (GRID_ROWS - 1) * CARD_GAP_Y + 0.32;
    const boardShape = createRoundedRectShape(boardW, boardH, 0.22);
    const boardGeo = new THREE.ExtrudeGeometry(boardShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.018,
      bevelSegments: 1,
      curveSegments: 5,
    });
    boardGeo.center();
    const boardMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f18,
      roughness: 0.55,
      metalness: 0.38,
    });
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.position.set(0, -0.02, -0.28);
    boardMesh.receiveShadow = true;
    this.stageGroup.add(boardMesh);
    this.sharedGeometries.push(boardGeo);
    this.sharedMaterials.push(boardMat);

    const boardRimGeo = createHaloFrameGeometry(boardW, boardH, 0.22, 0.036);
    const boardRim = new THREE.Mesh(boardRimGeo, brassMat);
    boardRim.position.set(0, -0.02, -0.24);
    this.stageGroup.add(boardRim);
    this.sharedGeometries.push(boardRimGeo);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(64, 64, 12, 64, 64, 62);
    sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    sGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.26)');
    sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
    const contactGeo = new THREE.PlaneGeometry(13.5, 13.5);
    contactGeo.rotateX(-Math.PI / 2);
    const contactMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    const contactPlane = new THREE.Mesh(contactGeo, contactMat);
    contactPlane.position.set(0, -3.42, -0.35);
    this.stageGroup.add(contactPlane);
    this.sharedGeometries.push(contactGeo);
    this.sharedMaterials.push(contactMat);
  }

  private buildParticles(): void {
    const geo = new THREE.OctahedronGeometry(0.065, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffdf6b,
      emissive: 0xffaa00,
      emissiveIntensity: 0.75,
      metalness: 0.85,
      roughness: 0.15,
    });
    this.particleMesh = new THREE.InstancedMesh(geo, mat, this.particleCount);
    this.particleMesh.frustumCulled = false;
    this.sharedGeometries.push(geo);
    this.sharedMaterials.push(mat);

    for (let i = 0; i < this.particleCount; i += 1) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        life: 0,
        maxLife: 1,
        size: 0,
      });
      _scaleVec.set(0, 0, 0);
      _mat4.compose(_vec3.set(0, -50, 0), _quat.identity(), _scaleVec);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, _color.setHex(0xfacc15));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.particleMesh);
  }

  private emitParticles(
    worldX: number,
    worldY: number,
    worldZ: number,
    count: number,
    hexColor: number,
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particleCount && spawned < count; i += 1) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.x = worldX + (Math.random() - 0.5) * 0.42;
      p.y = worldY + (Math.random() - 0.5) * 0.5;
      p.z = worldZ + 0.08;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.8;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed + 1.25;
      p.vz = 0.8 + Math.random() * 2.0;
      p.rx = Math.random() * Math.PI;
      p.ry = Math.random() * Math.PI;
      p.life = 0;
      p.maxLife = 0.48 + Math.random() * 0.36;
      p.size = 0.72 + Math.random() * 0.8;
      this.particleMesh.setColorAt(i, _color.setHex(hexColor));
      spawned += 1;
    }
    if (spawned > 0 && this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private createCardChassisAssets(): {
    chassisGeo: THREE.ExtrudeGeometry;
    faceGeo: THREE.ShapeGeometry;
    haloGeo: THREE.ExtrudeGeometry;
    hitGeo: THREE.PlaneGeometry;
    chassisMat: THREE.MeshStandardMaterial;
    backMat: THREE.MeshStandardMaterial;
    hitMat: THREE.MeshBasicMaterial;
  } {
    const chassisShape = createRoundedRectShape(CARD_W, CARD_H, 0.075);
    const chassisGeo = new THREE.ExtrudeGeometry(chassisShape, {
      depth: 0.024,
      bevelEnabled: true,
      bevelThickness: 0.01,
      bevelSize: 0.01,
      bevelSegments: 1,
      curveSegments: 5,
    });
    chassisGeo.center();

    const faceGeo = createNormalizedRoundedPlane(
      CARD_W - 0.04,
      CARD_H - 0.04,
      0.055,
    );
    const haloGeo = createHaloFrameGeometry(
      CARD_W + 0.02,
      CARD_H + 0.02,
      0.085,
      0.025,
    );
    const hitGeo = new THREE.PlaneGeometry(CARD_W + 0.08, CARD_H + 0.08);

    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x252b3b,
      metalness: 0.82,
      roughness: 0.26,
    });

    const backMat = new THREE.MeshStandardMaterial({
      map: this.atlas.getBackTexture(),
      roughness: 0.36,
      metalness: 0.28,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    this.sharedGeometries.push(chassisGeo, faceGeo, haloGeo, hitGeo);
    this.sharedMaterials.push(chassisMat, backMat, hitMat);

    return {
      chassisGeo,
      faceGeo,
      haloGeo,
      hitGeo,
      chassisMat,
      backMat,
      hitMat,
    };
  }

  private sharedCardAssets: ReturnType<
    CardSlotStage['createCardChassisAssets']
  > | null = null;

  private createCardRig(cell: CardCellData): CardRig {
    if (!this.sharedCardAssets) {
      this.sharedCardAssets = this.createCardChassisAssets();
    }
    const assets = this.sharedCardAssets;
    const group = new THREE.Group();

    const chassisMesh = new THREE.Mesh(assets.chassisGeo, assets.chassisMat);
    chassisMesh.castShadow = this.renderer.shadowMap.enabled;
    chassisMesh.receiveShadow = this.renderer.shadowMap.enabled;
    group.add(chassisMesh);

    const frontMat = new THREE.MeshStandardMaterial({
      map: this.atlas.getFaceTexture(cell.symbol),
      roughness: 0.34,
      metalness: 0.16,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const frontMesh = new THREE.Mesh(assets.faceGeo, frontMat);
    frontMesh.position.z = 0.024;
    group.add(frontMesh);

    const backMesh = new THREE.Mesh(assets.faceGeo, assets.backMat);
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = -0.024;
    group.add(backMesh);

    const haloMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 0,
      metalness: 0.8,
      roughness: 0.2,
      transparent: true,
      opacity: 0,
    });
    const haloMesh = new THREE.Mesh(assets.haloGeo, haloMat);
    haloMesh.position.z = 0.005;
    haloMesh.visible = false;
    group.add(haloMesh);

    const hitMesh = new THREE.Mesh(assets.hitGeo, assets.hitMat);
    hitMesh.position.z = 0.04;
    hitMesh.layers.set(1);
    group.add(hitMesh);

    const wx = cellToWorldX(cell.col);
    const wy = cellToWorldY(cell.row);
    group.position.set(wx, wy, 0);

    const rig: CardRig = {
      group,
      frontMesh,
      frontMat,
      haloMesh,
      haloMat,
      hitMesh,
      cell: { ...cell },
      pos: new THREE.Vector3(wx, wy, 0),
      targetPos: new THREE.Vector3(wx, wy, 0),
      rot: new THREE.Vector3(0, 0, 0),
      targetRot: new THREE.Vector3(0, 0, 0),
      scale: 1,
      targetScale: 1,
      velY: 0,
      springBounce: false,
      delayTimer: 0,
      hideWhileDelayed: false,
      highlightIntensity: 0,
      targetHighlight: 0,
      highlightColor: new THREE.Color(0xfacc15),
      phaseOffset: cell.col * 0.65 + cell.row * 0.42,
    };

    hitMesh.userData.rig = rig;
    this.cardContainer.add(group);
    return rig;
  }

  private applyCellTexture(rig: CardRig, cell: CardCellData): void {
    rig.cell = { ...cell };
    // Re-assign pre-warmed texture without setting needsUpdate (avoids shader re-check stall)
    rig.frontMat.map = this.atlas.getFaceTexture(cell.symbol);
  }

  private buildInitialCards(): void {
    const grid = createShowcaseGrid();
    for (let col = 0; col < GRID_COLS; col += 1) {
      for (let row = 0; row < GRID_ROWS; row += 1) {
        const rig = this.createCardRig(grid[col][row]);
        this.cardRigs.push(rig);
      }
    }
  }

  private findRigAt(col: number, row: number): CardRig | undefined {
    return this.cardRigs.find((r) => r.cell.col === col && r.cell.row === row);
  }

  public setMode(mode: 'title' | 'idle' | 'spinning'): void {
    this.mode = mode;
    if (mode !== 'idle') {
      this.inspectedCardId = null;
      this.inspectTimer = 0;
    }
  }

  public updateCameraFraming(): void {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    const spanW = GRID_COLS * CARD_W + (GRID_COLS - 1) * CARD_GAP_X;
    const spanH = GRID_ROWS * CARD_H + (GRID_ROWS - 1) * CARD_GAP_Y;

    // Tight framing so cards maximize viewport presence while clearing top multiplier rail & bottom dock
    const horizMargin = aspect < 0.85 ? 0.36 : 0.65;
    const vertMargin = aspect < 0.85 ? 2.1 : 1.95;
    const gridWidth = spanW + horizMargin;
    const gridHeight = spanH + vertMargin;

    const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const distForHeight = gridHeight / (2 * Math.tan(vFovRad / 2));
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
    const distForWidth = gridWidth / (2 * Math.tan(hFovRad / 2));

    const targetZ = Math.max(distForHeight, distForWidth, 7.6);
    const centerShiftY = aspect < 0.85 ? 0.22 : 0.28;
    this.baseCamPos.set(0, centerShiftY, targetZ);
    this.baseLookTarget.set(0, centerShiftY - 0.14, 0);
  }

  private waitMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  private isSpecialSymbol(sym: SymbolId): boolean {
    return sym === 'WILD' || sym === 'BONUS' || sym === 'ACE';
  }

  public async playSpinSequence(
    outcome: SpinOutcome,
    turbo: boolean,
  ): Promise<void> {
    if (this.disposed) return;
    this.mode = 'spinning';
    this.inspectedCardId = null;
    this.inspectTimer = 0;

    const tMul = turbo ? 0.54 : 1.0;

    for (const rig of this.cardRigs) {
      rig.targetHighlight = 0;
      rig.targetScale = 1;
      rig.hideWhileDelayed = false;
    }

    // Phase 1: Snappy sweep-out launch (no freeze delay)
    soundEngine.playSpinLaunch();
    for (const rig of this.cardRigs) {
      rig.delayTimer = rig.cell.col * 0.022 * tMul;
      rig.springBounce = false;
      rig.targetPos.set(
        cellToWorldX(rig.cell.col),
        cellToWorldY(rig.cell.row) - 4.9,
        -0.5,
      );
      rig.targetRot.set(-0.28, Math.PI * 0.75, 0);
      rig.targetScale = 0.86;
    }
    await this.waitMs(175 * tMul);
    if (this.disposed) return;

    // Phase 2: Staggered column cascade deal with brisk spring snap
    for (let col = 0; col < GRID_COLS; col += 1) {
      for (let row = 0; row < GRID_ROWS; row += 1) {
        const rig = this.findRigAt(col, row);
        if (!rig) continue;
        const cell = outcome.initialGrid[col][row];
        this.applyCellTexture(rig, cell);

        const wx = cellToWorldX(col);
        const wy = cellToWorldY(row);
        rig.pos.set(wx, wy + 4.3 + (GRID_ROWS - row) * 0.34, 0.16);
        rig.rot.set(-0.16, -Math.PI * 0.85, 0);
        rig.scale = 0.94;
        rig.velY = -4.2;
        rig.springBounce = true;
        rig.delayTimer = (col * 0.062 + (GRID_ROWS - 1 - row) * 0.02) * tMul;
        rig.hideWhileDelayed = true;
        rig.group.visible = rig.delayTimer <= 0.001;

        rig.targetPos.set(wx, wy, 0);
        rig.targetRot.set(0, 0, 0);
        rig.targetScale = 1;
      }
    }

    for (let col = 0; col < GRID_COLS; col += 1) {
      const hasSpecial = outcome.initialGrid[col].some((c) =>
        this.isSpecialSymbol(c.symbol),
      );
      window.setTimeout(() => {
        if (!this.disposed) soundEngine.playCardSnap(col, hasSpecial);
      }, (col * 62 + 135) * tMul);
    }

    await this.waitMs(470 * tMul);
    if (this.disposed) return;

    // Phase 3: Cascade Loop synced with 2x -> 3x -> 4x -> 6x -> 10x header tiers
    let runningWin = 0;
    for (let idx = 0; idx < outcome.cascades.length; idx += 1) {
      const step = outcome.cascades[idx];
      runningWin = Math.round((runningWin + step.stepWin) * 100) / 100;
      this.callbacks.onCascadeStep?.(
        step.stepIndex,
        step.tierMultiplier,
        step.stepWin,
        runningWin,
      );

      soundEngine.playScatterWin(idx);
      this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.32);
      this.winPointLight.intensity = 3.2;

      const winPosSet = new Set(
        step.removedPositions.map((p) => `${p.col}:${p.row}`),
      );

      for (const rig of this.cardRigs) {
        if (winPosSet.has(`${rig.cell.col}:${rig.cell.row}`)) {
          rig.targetPos.z = 0.52;
          rig.targetScale = 1.08;
          rig.targetRot.set(-0.08, 0, 0);
          rig.targetHighlight = 1;
          rig.highlightColor.setHex(
            rig.cell.symbol === 'WILD' ? 0x2dd4bf : 0xfacc15,
          );
          this.emitParticles(
            rig.pos.x,
            rig.pos.y,
            0.35,
            8,
            rig.cell.symbol === 'WILD' ? 0x2dd4bf : 0xfacc15,
          );
        }
      }

      await this.waitMs(420 * tMul);
      if (this.disposed) return;

      soundEngine.playCascadeTumble();
      for (const rig of this.cardRigs) {
        if (winPosSet.has(`${rig.cell.col}:${rig.cell.row}`)) {
          this.emitParticles(rig.pos.x, rig.pos.y, 0.45, 7, 0xfef08a);
          rig.targetScale = 0.01;
          rig.targetRot.y = Math.PI * 1.25;
          rig.targetPos.z = 1.05;
          rig.targetHighlight = 0;
        }
      }

      await this.waitMs(190 * tMul);
      if (this.disposed) return;

      const survivorMoves = new Map<string, CardRig>();
      const recycledRigs: CardRig[] = [];

      for (const rig of this.cardRigs) {
        if (winPosSet.has(`${rig.cell.col}:${rig.cell.row}`)) {
          recycledRigs.push(rig);
        } else {
          survivorMoves.set(rig.cell.id, rig);
        }
      }

      for (const drop of step.drops) {
        const rig = survivorMoves.get(drop.cell.id);
        if (rig) {
          rig.cell = { ...drop.cell };
          rig.springBounce = true;
          rig.hideWhileDelayed = false;
          rig.delayTimer = drop.toCol * 0.02 * tMul;
          rig.targetPos.set(
            cellToWorldX(drop.toCol),
            cellToWorldY(drop.toRow),
            0,
          );
          rig.targetRot.set(0, 0, 0);
          rig.targetScale = 1;
        }
      }

      for (let i = 0; i < step.newCards.length; i += 1) {
        const nc = step.newCards[i];
        const rig = recycledRigs[i];
        if (!rig) continue;
        this.applyCellTexture(rig, nc.cell);
        const wx = cellToWorldX(nc.col);
        const wy = cellToWorldY(nc.row);
        rig.pos.set(wx, wy + 3.4 + (GRID_ROWS - nc.row) * 0.26, 0.14);
        rig.rot.set(-0.15, -Math.PI * 0.8, 0);
        rig.scale = 0.92;
        rig.velY = -3.4;
        rig.springBounce = true;
        rig.hideWhileDelayed = true;
        rig.delayTimer = (nc.col * 0.045 + 0.03) * tMul;
        rig.group.visible = rig.delayTimer <= 0.001;
        rig.targetPos.set(wx, wy, 0);
        rig.targetRot.set(0, 0, 0);
        rig.targetScale = 1;
        rig.targetHighlight = 0;
      }

      window.setTimeout(() => {
        if (!this.disposed) soundEngine.playCardSnap(2, false);
      }, 170 * tMul);

      await this.waitMs(390 * tMul);
      if (this.disposed) return;
    }

    // Phase 4: Bonus Scatter Celebration (3+ Scatter cards -> 10 Free Spins)
    if (outcome.awardedFreeSpins > 0) {
      soundEngine.playBonusTrigger();
      this.shakeTrauma = Math.min(1, this.shakeTrauma + 0.52);
      this.winPointLight.intensity = 4.6;
      for (const rig of this.cardRigs) {
        if (rig.cell.symbol === 'BONUS') {
          rig.targetPos.z = 0.62;
          rig.targetScale = 1.14;
          rig.targetHighlight = 1;
          rig.highlightColor.setHex(0xf472b6);
          this.emitParticles(rig.pos.x, rig.pos.y, 0.5, 14, 0xf472b6);
        }
      }
      await this.waitMs(520 * tMul);
    }

    for (const rig of this.cardRigs) {
      rig.group.visible = true;
      rig.hideWhileDelayed = false;
      rig.targetPos.set(
        cellToWorldX(rig.cell.col),
        cellToWorldY(rig.cell.row),
        0,
      );
      rig.targetRot.set(0, 0, 0);
      rig.targetScale = 1;
      rig.targetHighlight = 0;
    }

    this.mode = 'idle';
  }

  private bindEvents(): void {
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const canvas = this.renderer.domElement;

    const onResize = () => this.updateCameraFraming();
    window.addEventListener('resize', onResize, { signal });

    canvas.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        soundEngine.unlock();
        this.isPointerDown = true;
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
        this.updatePointerTilt(e);
      },
      { signal },
    );

    canvas.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        this.updatePointerTilt(e);
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerup',
      (e: PointerEvent) => {
        if (!this.isPointerDown) return;
        this.isPointerDown = false;
        const dx = e.clientX - this.pointerDownPos.x;
        const dy = e.clientY - this.pointerDownPos.y;
        if (Math.hypot(dx, dy) < 16 && this.mode === 'idle') {
          this.tryInspectCard(e);
        }
      },
      { signal },
    );

    canvas.addEventListener(
      'pointerleave',
      () => {
        this.isPointerDown = false;
        this.targetPointerTiltX = 0;
        this.targetPointerTiltY = 0;
      },
      { signal },
    );

    canvas.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault();
        this.callbacks.onContextLostChange?.(true);
      },
      { signal },
    );

    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        this.callbacks.onContextLostChange?.(false);
      },
      { signal },
    );
  }

  private updatePointerTilt(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.targetPointerTiltX = THREE.MathUtils.clamp(nx, -1, 1) * 0.22;
    this.targetPointerTiltY = THREE.MathUtils.clamp(ny, -1, 1) * 0.12;
  }

  private tryInspectCard(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    _raycaster.layers.set(1);
    _raycaster.setFromCamera(_pointerNdc, this.camera);
    const hits = _raycaster.intersectObjects(this.cardContainer.children, true);
    if (hits.length > 0) {
      const rig = hits[0].object.userData.rig as CardRig | undefined;
      if (rig) {
        this.inspectedCardId = rig.cell.id;
        this.inspectTimer = 2.2;
        soundEngine.playInspect();
        this.callbacks.onCardInspect?.(rig.cell);
      }
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.elapsedTime += dt;

    this.updateScene(dt);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private updateScene(dt: number): void {
    this.pointerTiltX = THREE.MathUtils.damp(
      this.pointerTiltX,
      this.targetPointerTiltX,
      6,
      dt,
    );
    this.pointerTiltY = THREE.MathUtils.damp(
      this.pointerTiltY,
      this.targetPointerTiltY,
      6,
      dt,
    );

    const titleOrbitX =
      this.mode === 'title' ? Math.sin(this.elapsedTime * 0.42) * 0.72 : 0;
    const titleOrbitY =
      this.mode === 'title' ? Math.cos(this.elapsedTime * 0.28) * 0.16 : 0;

    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.1);
    const shakeAmt = this.shakeTrauma * this.shakeTrauma * 0.13;
    const shakeX = shakeAmt * Math.sin(this.elapsedTime * 48);
    const shakeY = shakeAmt * Math.cos(this.elapsedTime * 57);

    const desiredCamX =
      this.baseCamPos.x + this.pointerTiltX + titleOrbitX + shakeX;
    const desiredCamY =
      this.baseCamPos.y + this.pointerTiltY + titleOrbitY + shakeY;

    this.camera.position.x = THREE.MathUtils.damp(
      this.camera.position.x,
      desiredCamX,
      7,
      dt,
    );
    this.camera.position.y = THREE.MathUtils.damp(
      this.camera.position.y,
      desiredCamY,
      7,
      dt,
    );
    this.camera.position.z = THREE.MathUtils.damp(
      this.camera.position.z,
      this.baseCamPos.z,
      7,
      dt,
    );

    this.currentLookTarget.x = THREE.MathUtils.damp(
      this.currentLookTarget.x,
      this.baseLookTarget.x,
      8,
      dt,
    );
    this.currentLookTarget.y = THREE.MathUtils.damp(
      this.currentLookTarget.y,
      this.baseLookTarget.y,
      8,
      dt,
    );
    this.camera.lookAt(this.currentLookTarget);

    this.winPointLight.intensity = THREE.MathUtils.damp(
      this.winPointLight.intensity,
      0,
      4.5,
      dt,
    );

    if (this.inspectTimer > 0) {
      this.inspectTimer -= dt;
      if (this.inspectTimer <= 0) {
        this.inspectedCardId = null;
      }
    }

    for (let i = 0; i < this.cardRigs.length; i += 1) {
      const rig = this.cardRigs[i];
      if (rig.delayTimer > 0) {
        rig.delayTimer = Math.max(0, rig.delayTimer - dt);
        if (rig.hideWhileDelayed) {
          rig.group.visible = false;
        }
        continue;
      }
      rig.group.visible = true;
      rig.hideWhileDelayed = false;

      const isInspected =
        this.mode === 'idle' && rig.cell.id === this.inspectedCardId;
      const idleFloatZ =
        this.mode !== 'spinning'
          ? Math.sin(this.elapsedTime * 1.8 + rig.phaseOffset) * 0.028
          : 0;
      const idleRotY =
        this.mode === 'title'
          ? Math.sin(this.elapsedTime * 1.1 + rig.phaseOffset) * 0.14
          : 0;

      const goalX = rig.targetPos.x;
      const goalY = rig.targetPos.y;
      const goalZ = rig.targetPos.z + idleFloatZ + (isInspected ? 0.56 : 0);

      rig.pos.x = THREE.MathUtils.damp(rig.pos.x, goalX, 18, dt);
      rig.pos.z = THREE.MathUtils.damp(rig.pos.z, goalZ, 16, dt);

      if (rig.springBounce) {
        const stiffness = 340;
        const damping = 24;
        const force = (goalY - rig.pos.y) * stiffness;
        rig.velY += force * dt;
        rig.velY *= Math.exp(-damping * dt);
        rig.pos.y += rig.velY * dt;
        if (
          Math.abs(goalY - rig.pos.y) < 0.005 &&
          Math.abs(rig.velY) < 0.03
        ) {
          rig.pos.y = goalY;
          rig.velY = 0;
          rig.springBounce = false;
        }
      } else {
        rig.pos.y = THREE.MathUtils.damp(rig.pos.y, goalY, 17, dt);
      }

      const goalRotX = rig.targetRot.x + (isInspected ? -0.1 : 0);
      const goalRotY =
        rig.targetRot.y +
        idleRotY +
        (isInspected ? Math.sin(this.elapsedTime * 3) * 0.14 : 0);
      const goalRotZ = rig.targetRot.z;

      rig.rot.x = THREE.MathUtils.damp(rig.rot.x, goalRotX, 16, dt);
      rig.rot.y = THREE.MathUtils.damp(rig.rot.y, goalRotY, 16, dt);
      rig.rot.z = THREE.MathUtils.damp(rig.rot.z, goalRotZ, 16, dt);

      const goalScale = rig.targetScale * (isInspected ? 1.1 : 1);
      rig.scale = THREE.MathUtils.damp(rig.scale, goalScale, 18, dt);

      rig.group.position.copy(rig.pos);
      rig.group.rotation.set(rig.rot.x, rig.rot.y, rig.rot.z);
      rig.group.scale.setScalar(rig.scale);

      const goalHalo = isInspected ? 0.9 : rig.targetHighlight;
      rig.highlightIntensity = THREE.MathUtils.damp(
        rig.highlightIntensity,
        goalHalo,
        14,
        dt,
      );
      if (rig.highlightIntensity > 0.015) {
        rig.haloMesh.visible = true;
        rig.haloMat.color.copy(rig.highlightColor);
        rig.haloMat.emissive.copy(rig.highlightColor);
        rig.haloMat.emissiveIntensity = rig.highlightIntensity * 1.4;
        rig.haloMat.opacity = rig.highlightIntensity;
      } else {
        rig.haloMesh.visible = false;
      }
    }

    let anyParticles = false;
    for (let i = 0; i < this.particleCount; i += 1) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyParticles = true;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        _scaleVec.set(0, 0, 0);
        _mat4.compose(_vec3.set(0, -50, 0), _quat.identity(), _scaleVec);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }

      p.vy -= 6.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += 5.5 * dt;
      p.ry += 4.2 * dt;

      const tNorm = p.life / p.maxLife;
      const s = p.size * (1 - tNorm * tNorm);
      _vec3.set(p.x, p.y, p.z);
      _euler.set(p.rx, p.ry, 0);
      _quat.setFromEuler(_euler);
      _scaleVec.set(s, s, s);
      _mat4.compose(_vec3, _quat, _scaleVec);
      this.particleMesh.setMatrixAt(i, _mat4);
    }
    if (anyParticles) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.abortController?.abort();

    for (const rig of this.cardRigs) {
      rig.frontMat.dispose();
      rig.haloMat.dispose();
    }
    for (const g of this.sharedGeometries) g.dispose();
    for (const m of this.sharedMaterials) m.dispose();
    this.atlas.dispose();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
