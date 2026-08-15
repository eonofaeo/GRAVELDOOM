import { Vec2 } from './math.js';

/** Color constants from the design brief */
export const Colors = {
  // Base palette
  ASH_GREY: '#3a3a3a',
  BONE_WHITE: '#d4cfc4',
  DEEP_UMBER: '#2d1f14',
  CHARCOAL: '#1a1a1a',
  BLACK: '#0a0a0a',

  // Primary accent
  CRIMSON: '#8b1a1a',
  CRIMSON_GLOW: '#c42020',
  CRIMSON_BRIGHT: '#e63946',
  CRIMSON_DIM: '#5c1010',
  BLOOD_RED: '#6b0f0f',

  // Secondary accents
  MOLTEN_ORANGE: '#c45a1a',
  PALE_GOLD: '#c4a84a',
  SICKLY_VIOLET: '#5a2d6b',
  ICE_BLUE: '#4a8fa8',

  // UI
  HP_CRIMSON: '#c42020',
  STAMINA_BONE: '#d4cfc4',
  EMBER_DARK: '#5c1010',
  ASH_GOLD: '#c4a84a',

  // Misc
  TRANSPARENT: 'rgba(0,0,0,0)',
  OVERLAY_DARK: 'rgba(10,10,10,0.8)',
  OVERLAY_LIGHT: 'rgba(26,26,26,0.6)',
} as const;

/** Camera for world-to-screen transformation */
export class Camera {
  position = Vec2.ZERO;
  private targetPosition = Vec2.ZERO;
  private smoothing = 0.1;
  zoom = 1;
  private _shakeOffset = Vec2.ZERO;
  get shakeOffset(): Vec2 { return this._shakeOffset; }
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;

  constructor(
    public viewportWidth: number,
    public viewportHeight: number,
  ) {}

  follow(target: Vec2, smoothing = 0.1): void {
    this.targetPosition = target;
    this.smoothing = smoothing;
  }

  shake(intensity: number, duration: number): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = 0;
  }

  update(dt: number): void {
    // Smooth follow
    this.position = this.position.lerp(this.targetPosition, this.smoothing);

    // Screen shake
    if (this.shakeTimer < this.shakeDuration) {
      this.shakeTimer += dt;
      const progress = this.shakeTimer / this.shakeDuration;
      const intensity = this.shakeIntensity * (1 - progress);
      this._shakeOffset = Vec2.of(
        (Math.random() - 0.5) * 2 * intensity,
        (Math.random() - 0.5) * 2 * intensity,
      );
    } else {
      this._shakeOffset = Vec2.ZERO;
    }
  }

  /** Convert world position to screen position */
  worldToScreen(worldPos: Vec2): Vec2 {
    const halfW = this.viewportWidth / 2;
    const halfH = this.viewportHeight / 2;
    return Vec2.of(
      (worldPos.x - this.position.x) * this.zoom + halfW + this.shakeOffset.x,
      (worldPos.y - this.position.y) * this.zoom + halfH + this.shakeOffset.y,
    );
  }

  /** Convert screen position to world position */
  screenToWorld(screenPos: Vec2): Vec2 {
    const halfW = this.viewportWidth / 2;
    const halfH = this.viewportHeight / 2;
    return Vec2.of(
      (screenPos.x - halfW - this.shakeOffset.x) / this.zoom + this.position.x,
      (screenPos.y - halfH - this.shakeOffset.y) / this.zoom + this.position.y,
    );
  }

  /** Get visible world bounds */
  getWorldBounds(): { left: number; right: number; top: number; bottom: number } {
    const halfW = (this.viewportWidth / 2) / this.zoom;
    const halfH = (this.viewportHeight / 2) / this.zoom;
    return {
      left: this.position.x - halfW,
      right: this.position.x + halfW,
      top: this.position.y - halfH,
      bottom: this.position.y + halfH,
    };
  }
}

/** Main renderer — Canvas2D with lighting and particle layers */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly camera: Camera;
  private width: number;
  private height: number;
  private scaleFactor = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.width = 0;
    this.height = 0;
    this.camera = new Camera(0, 0);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    // Target internal resolution: 960x540 (16:9), scaled to fit screen
    const targetW = 960;
    const targetH = 540;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;
    this.scaleFactor = Math.min(screenW / targetW, screenH / targetH);
    this.width = Math.floor(screenW / this.scaleFactor);
    this.height = Math.floor(screenH / this.scaleFactor);

    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = `${screenW}px`;
    this.canvas.style.height = `${screenH}px`;

    this.ctx.imageSmoothingEnabled = false;
    this.camera.viewportWidth = this.width;
    this.camera.viewportHeight = this.height;
  }

  get w(): number { return this.width; }
  get h(): number { return this.height; }

  /** Begin frame — clear screen */
  beginFrame(): void {
    this.ctx.save();
    this.ctx.fillStyle = Colors.BLACK;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** End frame */
  endFrame(): void {
    this.ctx.restore();
  }

  /** Transform context for camera */
  applyCameraTransform(): void {
    const cam = this.camera;
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    this.ctx.save();
    this.ctx.translate(halfW + cam.shakeOffset.x, halfH + cam.shakeOffset.y);
    this.ctx.scale(cam.zoom, cam.zoom);
    this.ctx.translate(-cam.position.x, -cam.position.y);
  }

  restoreCameraTransform(): void {
    this.ctx.restore();
  }

  // ─── Primitive Drawing ──────────────────────────────────────────

  drawRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  drawRectOutline(x: number, y: number, w: number, h: number, color: string, lineWidth = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.strokeRect(x, y, w, h);
  }

  drawCircle(x: number, y: number, radius: number, color: string): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  drawCircleOutline(x: number, y: number, radius: number, color: string, lineWidth = 1): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, color: string, lineWidth = 1): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }

  /** Draw a gradient rectangle (vertical) */
  drawGradientRect(x: number, y: number, w: number, h: number, colorTop: string, colorBottom: string): void {
    const grad = this.ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, colorTop);
    grad.addColorStop(1, colorBottom);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(x, y, w, h);
  }

  /** Draw text with optional shadow */
  drawText(
    text: string,
    x: number, y: number,
    options: {
      color?: string;
      font?: string;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
      maxWidth?: number;
    } = {},
  ): void {
    const {
      color = Colors.BONE_WHITE,
      font = '12px "Courier New", monospace',
      align = 'left',
      baseline = 'top',
      shadow,
      maxWidth,
    } = options;
    this.ctx.save();
    this.ctx.font = font;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    if (shadow) {
      this.ctx.shadowColor = shadow.color;
      this.ctx.shadowBlur = shadow.blur;
      this.ctx.shadowOffsetX = shadow.offsetX;
      this.ctx.shadowOffsetY = shadow.offsetY;
    }
    this.ctx.fillStyle = color;
    if (maxWidth) {
      this.ctx.fillText(text, x, y, maxWidth);
    } else {
      this.ctx.fillText(text, x, y);
    }
    this.ctx.restore();
  }

  /** Draw sprite from an offscreen canvas or image */
  drawSprite(
    source: HTMLCanvasElement | HTMLImageElement,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
    flipX = false,
  ): void {
    if (flipX) {
      this.ctx.save();
      this.ctx.translate(dx + dw / 2, dy);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(source, sx, sy, sw, sh, -dw / 2, 0, dw, dh);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }

  /** Apply a full-screen color overlay (for death screen, damage flash, etc.) */
  drawOverlay(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** Apply vignette effect */
  drawVignette(intensity = 0.6): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = Math.max(this.width, this.height) * 0.7;
    const grad = this.ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${intensity})`);
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
}
