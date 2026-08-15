import { Colors } from '../engine/renderer.js';

/**
 * Procedural Sprite Generator
 * Creates all game sprites as offscreen canvases — no external art files needed for prototype.
 * Style: painterly high-fidelity dark fantasy pixel art
 */

export interface SpriteSheet {
  canvas: HTMLCanvasElement;
  frameWidth: number;
  frameHeight: number;
  frames: number;
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Draw a pixel-art humanoid figure */
function drawHumanoid(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  opts: {
    skinColor: string;
    armorColor: string;
    cloakColor: string;
    eyeColor: string;
    hasCloak?: boolean;
    hasPauldron?: boolean;
    weaponType?: 'sword' | 'greatsword' | 'dagger' | 'mace' | 'staff' | 'none';
    facing?: number; // 1 = right, -1 = left
  },
): void {
  const f = opts.facing ?? 1;
  const cx = x + w / 2;
  const ground = y + h;

  // Body proportions (relative to height)
  const headSize = h * 0.18;
  const torsoH = h * 0.3;
  const legH = h * 0.35;
  const armW = w * 0.12;

  const headY = y + h * 0.05;
  const torsoY = headY + headSize + 2;
  const legY = torsoY + torsoH;

  // Cloak (behind body)
  if (opts.hasCloak !== false) {
    ctx.fillStyle = opts.cloakColor;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.25, torsoY - 5);
    ctx.lineTo(cx + w * 0.3 * f, torsoY - 5);
    ctx.quadraticCurveTo(cx + w * 0.4 * f, legY + legH * 0.6, cx + w * 0.15, ground - 2);
    ctx.lineTo(cx - w * 0.2, ground - 2);
    ctx.quadraticCurveTo(cx - w * 0.25, legY + legH * 0.4, cx - w * 0.25, torsoY - 5);
    ctx.fill();
    // Cloak tatters
    ctx.fillStyle = opts.cloakColor;
    for (let i = 0; i < 3; i++) {
      const tx = cx - w * 0.1 + i * w * 0.1;
      const tLen = 4 + Math.random() * 6;
      ctx.fillRect(tx, ground - 2, 3, tLen);
    }
  }

  // Legs
  ctx.fillStyle = opts.armorColor;
  // Left leg
  ctx.fillRect(cx - w * 0.15, legY, w * 0.14, legH);
  // Right leg (slightly forward)
  ctx.fillRect(cx + w * 0.02, legY - 2, w * 0.14, legH + 2);

  // Boots
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(cx - w * 0.17, ground - h * 0.08, w * 0.18, h * 0.08);
  ctx.fillRect(cx, ground - h * 0.08, w * 0.18, h * 0.08);

  // Torso / armor
  ctx.fillStyle = opts.armorColor;
  ctx.fillRect(cx - w * 0.2, torsoY, w * 0.4, torsoH);
  // Armor detail lines
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(cx - w * 0.02, torsoY + 3, 2, torsoH - 6);

  // Pauldron (asymmetric — one big, one small/none)
  if (opts.hasPauldron !== false) {
    // Big pauldron on the forward shoulder
    ctx.fillStyle = opts.armorColor;
    const paulX = f > 0 ? cx + w * 0.18 : cx - w * 0.28;
    ctx.fillRect(paulX, torsoY - 4, w * 0.16, h * 0.1);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(paulX + 2, torsoY - 2, w * 0.12, 2);
  }

  // Arms
  ctx.fillStyle = opts.skinColor;
  // Back arm
  ctx.fillRect(cx - w * 0.25, torsoY + 5, armW, torsoH * 0.7);
  // Front arm
  ctx.fillRect(cx + w * 0.15, torsoY + 5, armW, torsoH * 0.7);

  // Head
  ctx.fillStyle = opts.skinColor;
  ctx.fillRect(cx - headSize / 2, headY, headSize, headSize);
  // Helm/hood detail
  ctx.fillStyle = opts.armorColor;
  ctx.fillRect(cx - headSize / 2 - 1, headY, headSize + 2, headSize * 0.4);

  // Ember eye (the signature!)
  ctx.fillStyle = opts.eyeColor;
  ctx.shadowColor = opts.eyeColor;
  ctx.shadowBlur = 6;
  const eyeX = cx + (f > 0 ? 2 : -4);
  ctx.fillRect(eyeX, headY + headSize * 0.45, 3, 3);
  ctx.shadowBlur = 0;

  // Weapon
  if (opts.weaponType && opts.weaponType !== 'none') {
    const weapX = cx + w * 0.25 * f;
    const weapY = torsoY;
    drawWeapon(ctx, weapX, weapY, opts.weaponType, f, h);
  }
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  type: string, facing: number, scale: number,
): void {
  ctx.save();
  ctx.translate(x, y);

  switch (type) {
    case 'sword': {
      // Arming sword
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(0, -scale * 0.35, 3, scale * 0.35);
      // Guard
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(-4, 0, 11, 3);
      // Grip
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(1, 3, 2, scale * 0.08);
      // Pommel
      ctx.fillStyle = '#5a4a2a';
      ctx.fillRect(0, scale * 0.11, 4, 3);
      break;
    }
    case 'greatsword': {
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(0, -scale * 0.5, 4, scale * 0.5);
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(-6, 0, 16, 4);
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(2, 4, 3, scale * 0.12);
      ctx.fillStyle = '#5a4a2a';
      ctx.fillRect(1, scale * 0.16, 5, 4);
      break;
    }
    case 'dagger': {
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(0, -scale * 0.15, 2, scale * 0.15);
      ctx.fillStyle = '#5a4a2a';
      ctx.fillRect(-2, 0, 6, 2);
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(0, 2, 2, scale * 0.05);
      break;
    }
    case 'mace': {
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(1, -scale * 0.25, 3, scale * 0.25);
      // Head
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(-3, -scale * 0.35, 10, scale * 0.1);
      // Spikes
      ctx.fillStyle = '#7a7a7a';
      ctx.fillRect(-5, -scale * 0.33, 2, 4);
      ctx.fillRect(9, -scale * 0.33, 2, 4);
      break;
    }
    case 'staff': {
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(1, -scale * 0.5, 3, scale * 0.5);
      // Crystal top
      ctx.fillStyle = Colors.CRIMSON_GLOW;
      ctx.shadowColor = Colors.CRIMSON_GLOW;
      ctx.shadowBlur = 8;
      ctx.fillRect(-1, -scale * 0.55, 7, 8);
      ctx.shadowBlur = 0;
      break;
    }
  }
  ctx.restore();
}

/** Generate all sprites for the prototype */
export class SpriteGenerator {
  private cache = new Map<string, HTMLCanvasElement>();

  /** Get or generate a sprite */
  get(key: string, generator: () => HTMLCanvasElement): HTMLCanvasElement {
    let sprite = this.cache.get(key);
    if (!sprite) {
      sprite = generator();
      this.cache.set(key, sprite);
    }
    return sprite;
  }

  /** Generate the player sprite sheet (idle, walk, run, attack, roll, hurt, death) */
  generatePlayer(): Map<string, HTMLCanvasElement> {
    const sprites = new Map<string, HTMLCanvasElement>();
    const W = 48;
    const H = 64;

    // Idle animation frames
    const idleFrames = 8;
    const idleSheet = createCanvas(W * idleFrames, H);
    const ictx = idleSheet.getContext('2d')!;
    for (let i = 0; i < idleFrames; i++) {
      const breathe = Math.sin((i / idleFrames) * Math.PI * 2) * 1.5;
      ictx.save();
      ictx.translate(0, breathe);
      drawHumanoid(ictx, i * W, 0, W, H, {
        skinColor: '#8a8078',
        armorColor: '#4a4440',
        cloakColor: '#2a2825',
        eyeColor: Colors.CRIMSON_GLOW,
        hasCloak: true,
        hasPauldron: true,
        weaponType: 'sword',
      });
      ictx.restore();
    }
    sprites.set('idle', idleSheet);

    // Walk animation frames
    const walkFrames = 8;
    const walkSheet = createCanvas(W * walkFrames, H);
    const wctx = walkSheet.getContext('2d')!;
    for (let i = 0; i < walkFrames; i++) {
      const phase = (i / walkFrames) * Math.PI * 2;
      const bob = Math.abs(Math.sin(phase)) * 2;
      const legSwing = Math.sin(phase) * 4;
      wctx.save();
      wctx.translate(0, -bob);
      drawHumanoid(wctx, i * W, 0, W, H, {
        skinColor: '#8a8078',
        armorColor: '#4a4440',
        cloakColor: '#2a2825',
        eyeColor: Colors.CRIMSON_GLOW,
        hasCloak: true,
        hasPauldron: true,
        weaponType: 'sword',
      });
      wctx.restore();
    }
    sprites.set('walk', walkSheet);

    // Run animation frames
    const runFrames = 8;
    const runSheet = createCanvas(W * runFrames, H);
    const rctx = runSheet.getContext('2d')!;
    for (let i = 0; i < runFrames; i++) {
      const phase = (i / runFrames) * Math.PI * 2;
      const bob = Math.abs(Math.sin(phase)) * 3;
      rctx.save();
      rctx.translate(0, -bob);
      drawHumanoid(rctx, i * W, 0, W, H, {
        skinColor: '#8a8078',
        armorColor: '#4a4440',
        cloakColor: '#2a2825',
        eyeColor: Colors.CRIMSON_GLOW,
        hasCloak: true,
        hasPauldron: true,
        weaponType: 'sword',
      });
      rctx.restore();
    }
    sprites.set('run', runSheet);

    // Attack frames (3-hit chain)
    const atkFrames = 24; // 8 frames per hit × 3
    const atkSheet = createCanvas(W * atkFrames, H);
    const actx = atkSheet.getContext('2d')!;
    for (let i = 0; i < atkFrames; i++) {
      const hitIndex = Math.floor(i / 8);
      const frameInHit = i % 8;
      const swingPhase = frameInHit / 8;
      actx.save();
      // Wind-up then swing
      if (frameInHit < 3) {
        // Wind-up: pull back
        actx.translate(-swingPhase * 4, 0);
      } else if (frameInHit < 6) {
        // Swing: forward motion
        actx.translate((swingPhase - 0.3) * 8, 0);
      }
      drawHumanoid(actx, i * W, 0, W, H, {
        skinColor: '#8a8078',
        armorColor: '#4a4440',
        cloakColor: '#2a2825',
        eyeColor: Colors.CRIMSON_GLOW,
        hasCloak: true,
        hasPauldron: true,
        weaponType: 'sword',
      });
      // Weapon trail effect on active frames
      if (frameInHit >= 3 && frameInHit <= 5) {
        actx.strokeStyle = 'rgba(200,200,200,0.3)';
        actx.lineWidth = 2;
        actx.beginPath();
        actx.arc(i * W + W * 0.7, H * 0.3, W * 0.3, -Math.PI * 0.3, Math.PI * 0.5);
        actx.stroke();
      }
      actx.restore();
    }
    sprites.set('attack', atkSheet);

    // Roll frames
    const rollFrames = 10;
    const rollSheet = createCanvas(W * rollFrames, H);
    const rollCtx = rollSheet.getContext('2d')!;
    for (let i = 0; i < rollFrames; i++) {
      const phase = i / rollFrames;
      const rotation = phase * Math.PI * 2;
      rollCtx.save();
      rollCtx.translate(i * W + W / 2, H / 2);
      rollCtx.rotate(rotation);
      drawHumanoid(rollCtx, -W / 2, -H / 2, W, H, {
        skinColor: '#8a8078',
        armorColor: '#4a4440',
        cloakColor: '#2a2825',
        eyeColor: Colors.CRIMSON_GLOW,
        hasCloak: true,
        hasPauldron: false,
        weaponType: 'none',
      });
      rollCtx.restore();
    }
    sprites.set('roll', rollSheet);

    // Hurt frames
    const hurtFrames = 4;
    const hurtSheet = createCanvas(W * hurtFrames, H);
    const hctx = hurtSheet.getContext('2d')!;
    for (let i = 0; i < hurtFrames; i++) {
      const recoil = (1 - i / hurtFrames) * 5;
      hctx.save();
      hctx.translate(-recoil, 0);
      // Flash white on first frame
      if (i === 0) {
        hctx.filter = 'brightness(2)';
      }
      drawHumanoid(hctx, i * W, 0, W, H, {
        skinColor: '#8a8078',
        armorColor: '#4a4440',
        cloakColor: '#2a2825',
        eyeColor: Colors.CRIMSON_GLOW,
        hasCloak: true,
        hasPauldron: true,
        weaponType: 'sword',
      });
      hctx.filter = 'none';
      hctx.restore();
    }
    sprites.set('hurt', hurtSheet);

    // Death frames
    const deathFrames = 14;
    const deathSheet = createCanvas(W * deathFrames, H);
    const dctx = deathSheet.getContext('2d')!;
    for (let i = 0; i < deathFrames; i++) {
      const phase = i / deathFrames;
      const fallAngle = phase * Math.PI / 2;
      dctx.save();
      dctx.translate(i * W + W / 2, H);
      dctx.rotate(fallAngle);
      drawHumanoid(dctx, -W / 2, -H, W, H, {
        skinColor: '#8a8078',
        armorColor: '#4a4440',
        cloakColor: '#2a2825',
        eyeColor: Colors.CRIMSON_DIM,
        hasCloak: true,
        hasPauldron: true,
        weaponType: 'sword',
      });
      dctx.restore();
    }
    sprites.set('death', deathSheet);

    return sprites;
  }

  /** Generate Hollowed Wretch enemy sprite */
  generateWretch(): Map<string, HTMLCanvasElement> {
    const sprites = new Map<string, HTMLCanvasElement>();
    const W = 40;
    const H = 56;

    // Idle
    const idleFrames = 6;
    const idleSheet = createCanvas(W * idleFrames, H);
    const ictx = idleSheet.getContext('2d')!;
    for (let i = 0; i < idleFrames; i++) {
      const sway = Math.sin((i / idleFrames) * Math.PI * 2) * 2;
      ictx.save();
      ictx.translate(sway, 0);
      drawHumanoid(ictx, i * W, 0, W, H, {
        skinColor: '#6a6058',
        armorColor: '#3a3530',
        cloakColor: '#252220',
        eyeColor: Colors.CRIMSON_DIM,
        hasCloak: true,
        hasPauldron: false,
        weaponType: 'dagger',
      });
      ictx.restore();
    }
    sprites.set('idle', idleSheet);

    // Walk
    const walkFrames = 6;
    const walkSheet = createCanvas(W * walkFrames, H);
    const wctx = walkSheet.getContext('2d')!;
    for (let i = 0; i < walkFrames; i++) {
      const phase = (i / walkFrames) * Math.PI * 2;
      const bob = Math.abs(Math.sin(phase)) * 1.5;
      wctx.save();
      wctx.translate(0, -bob);
      drawHumanoid(wctx, i * W, 0, W, H, {
        skinColor: '#6a6058',
        armorColor: '#3a3530',
        cloakColor: '#252220',
        eyeColor: Colors.CRIMSON_DIM,
        hasCloak: true,
        hasPauldron: false,
        weaponType: 'dagger',
      });
      wctx.restore();
    }
    sprites.set('walk', walkSheet);

    // Attack (with clear telegraph)
    const atkFrames = 12;
    const atkSheet = createCanvas(W * atkFrames, H);
    const actx = atkSheet.getContext('2d')!;
    for (let i = 0; i < atkFrames; i++) {
      actx.save();
      if (i < 6) {
        // Telegraph: raise weapon, glow red
        const telegraph = i / 6;
        actx.translate(0, -telegraph * 3);
        if (i >= 4) {
          // Warning flash
          actx.shadowColor = Colors.CRIMSON;
          actx.shadowBlur = 8;
        }
      } else {
        // Lunge forward
        const lunge = (i - 6) / 6;
        actx.translate(lunge * 10, 0);
      }
      drawHumanoid(actx, i * W, 0, W, H, {
        skinColor: '#6a6058',
        armorColor: '#3a3530',
        cloakColor: '#252220',
        eyeColor: Colors.CRIMSON,
        hasCloak: true,
        hasPauldron: false,
        weaponType: 'dagger',
      });
      actx.restore();
    }
    sprites.set('attack', atkSheet);

    // Hurt
    const hurtFrames = 4;
    const hurtSheet = createCanvas(W * hurtFrames, H);
    const hctx = hurtSheet.getContext('2d')!;
    for (let i = 0; i < hurtFrames; i++) {
      const recoil = (1 - i / hurtFrames) * 4;
      hctx.save();
      hctx.translate(-recoil, 0);
      if (i === 0) hctx.filter = 'brightness(2)';
      drawHumanoid(hctx, i * W, 0, W, H, {
        skinColor: '#6a6058',
        armorColor: '#3a3530',
        cloakColor: '#252220',
        eyeColor: Colors.CRIMSON_DIM,
        hasCloak: true,
        hasPauldron: false,
        weaponType: 'dagger',
      });
      hctx.filter = 'none';
      hctx.restore();
    }
    sprites.set('hurt', hurtSheet);

    // Death
    const deathFrames = 10;
    const deathSheet = createCanvas(W * deathFrames, H);
    const dctx = deathSheet.getContext('2d')!;
    for (let i = 0; i < deathFrames; i++) {
      const phase = i / deathFrames;
      const fallAngle = phase * Math.PI / 2;
      dctx.save();
      dctx.translate(i * W + W / 2, H);
      dctx.rotate(fallAngle);
      drawHumanoid(dctx, -W / 2, -H, W, H, {
        skinColor: '#5a5048',
        armorColor: '#2a2520',
        cloakColor: '#1a1815',
        eyeColor: '#330000',
        hasCloak: true,
        hasPauldron: false,
        weaponType: 'dagger',
      });
      dctx.restore();
    }
    sprites.set('death', deathSheet);

    return sprites;
  }

  /** Generate Ser Ashgrave boss sprite */
  generateAshgrave(): Map<string, HTMLCanvasElement> {
    const sprites = new Map<string, HTMLCanvasElement>();
    const W = 80;
    const H = 96;

    // Idle — towering, ash pouring
    const idleFrames = 8;
    const idleSheet = createCanvas(W * idleFrames, H);
    const ictx = idleSheet.getContext('2d')!;
    for (let i = 0; i < idleFrames; i++) {
      const breathe = Math.sin((i / idleFrames) * Math.PI * 2) * 2;
      ictx.save();
      ictx.translate(0, breathe);
      drawAshgraveFrame(ictx, i * W, 0, W, H, false);
      // Ash particles falling from cracks
      ictx.fillStyle = 'rgba(100,90,80,0.5)';
      for (let p = 0; p < 5; p++) {
        const px = i * W + W * 0.3 + Math.sin(i + p * 1.3) * W * 0.2;
        const py = H * 0.4 + (i * 3 + p * 7) % 30;
        ictx.fillRect(px, py, 2, 3);
      }
      ictx.restore();
    }
    sprites.set('idle', idleSheet);

    // Attack — slow overhead slam
    const atkFrames = 16;
    const atkSheet = createCanvas(W * atkFrames, H);
    const actx = atkSheet.getContext('2d')!;
    for (let i = 0; i < atkFrames; i++) {
      actx.save();
      if (i < 10) {
        // Wind-up: raise sword (very long telegraph per design brief)
        const windup = i / 10;
        actx.translate(0, -windup * 5);
        if (i >= 7) {
          actx.shadowColor = Colors.CRIMSON;
          actx.shadowBlur = 12;
        }
      } else {
        // Slam down
        const slam = (i - 10) / 6;
        actx.translate(0, slam * 15);
      }
      drawAshgraveFrame(actx, i * W, 0, W, H, i >= 10);
      actx.restore();
    }
    sprites.set('attack', atkSheet);

    return sprites;
  }

  /** Generate environment tile sprites */
  generateEnvironment(): Map<string, HTMLCanvasElement> {
    const tiles = new Map<string, HTMLCanvasElement>();
    const T = 64; // tile size per spec

    // Ground stone tile
    const ground = createCanvas(T, T);
    const gctx = ground.getContext('2d')!;
    gctx.fillStyle = '#3a3530';
    gctx.fillRect(0, 0, T, T);
    // Stone texture
    gctx.fillStyle = 'rgba(0,0,0,0.1)';
    for (let i = 0; i < 8; i++) {
      const rx = (i * 37) % T;
      const ry = (i * 53) % T;
      gctx.fillRect(rx, ry, 6 + (i % 3) * 2, 4 + (i % 2) * 2);
    }
    // Cracks
    gctx.strokeStyle = 'rgba(0,0,0,0.15)';
    gctx.lineWidth = 1;
    gctx.beginPath();
    gctx.moveTo(20, 0); gctx.lineTo(25, 30); gctx.lineTo(30, T);
    gctx.stroke();
    tiles.set('ground', ground);

    // Wall tile
    const wall = createCanvas(T, T);
    const wctx = wall.getContext('2d')!;
    wctx.fillStyle = '#2a2520';
    wctx.fillRect(0, 0, T, T);
    // Brick pattern
    wctx.strokeStyle = 'rgba(0,0,0,0.2)';
    wctx.lineWidth = 1;
    for (let row = 0; row < 4; row++) {
      const y = row * 16;
      wctx.strokeRect(0, y, T, 16);
      const offset = row % 2 === 0 ? 0 : 32;
      wctx.beginPath();
      wctx.moveTo(offset + 32, y); wctx.lineTo(offset + 32, y + 16);
      wctx.stroke();
    }
    tiles.set('wall', wall);

    // Bloomstone (checkpoint)
    const bloomstone = createCanvas(T, T);
    const bsctx = bloomstone.getContext('2d')!;
    // Base stone
    bsctx.fillStyle = '#4a4440';
    bsctx.beginPath();
    bsctx.moveTo(T * 0.3, T);
    bsctx.lineTo(T * 0.2, T * 0.6);
    bsctx.lineTo(T * 0.35, T * 0.3);
    bsctx.lineTo(T * 0.5, T * 0.2);
    bsctx.lineTo(T * 0.65, T * 0.3);
    bsctx.lineTo(T * 0.8, T * 0.6);
    bsctx.lineTo(T * 0.7, T);
    bsctx.fill();
    // Crimson glow
    bsctx.fillStyle = Colors.CRIMSON_GLOW;
    bsctx.shadowColor = Colors.CRIMSON_GLOW;
    bsctx.shadowBlur = 15;
    bsctx.beginPath();
    bsctx.arc(T * 0.5, T * 0.35, 6, 0, Math.PI * 2);
    bsctx.fill();
    bsctx.shadowBlur = 0;
    // Rune lines
    bsctx.strokeStyle = Colors.CRIMSON_DIM;
    bsctx.lineWidth = 1;
    bsctx.beginPath();
    bsctx.moveTo(T * 0.4, T * 0.5);
    bsctx.lineTo(T * 0.5, T * 0.35);
    bsctx.lineTo(T * 0.6, T * 0.5);
    bsctx.stroke();
    tiles.set('bloomstone', bloomstone);

    // Ashen Coast background layers
    for (let layer = 0; layer < 3; layer++) {
      const bg = createCanvas(T * 4, T * 2);
      const bctx = bg.getContext('2d')!;
      const alpha = 0.3 + layer * 0.2;
      bctx.fillStyle = `rgba(${30 + layer * 15}, ${28 + layer * 12}, ${25 + layer * 10}, ${alpha})`;
      bctx.fillRect(0, 0, bg.width, bg.height);
      // Distant mountains/ruins silhouette
      bctx.fillStyle = `rgba(${20 + layer * 10}, ${18 + layer * 8}, ${15 + layer * 5}, ${alpha + 0.1})`;
      bctx.beginPath();
      bctx.moveTo(0, bg.height);
      for (let x = 0; x < bg.width; x += 20) {
        const h = 20 + Math.sin(x * 0.02 + layer) * 30 + layer * 15;
        bctx.lineTo(x, bg.height - h);
      }
      bctx.lineTo(bg.width, bg.height);
      bctx.fill();
      tiles.set(`bg_layer_${layer}`, bg);
    }

    // Gravebloom flower (crimson bioluminescent)
    const flower = createCanvas(16, 16);
    const fctx = flower.getContext('2d')!;
    // Stem
    fctx.fillStyle = '#3a5a3a';
    fctx.fillRect(7, 8, 2, 8);
    // Petals
    fctx.fillStyle = Colors.CRIMSON_GLOW;
    fctx.shadowColor = Colors.CRIMSON_GLOW;
    fctx.shadowBlur = 6;
    fctx.beginPath();
    fctx.arc(8, 6, 4, 0, Math.PI * 2);
    fctx.fill();
    // Center
    fctx.fillStyle = Colors.CRIMSON_BRIGHT;
    fctx.beginPath();
    fctx.arc(8, 6, 2, 0, Math.PI * 2);
    fctx.fill();
    fctx.shadowBlur = 0;
    tiles.set('gravebloom', flower);

    return tiles;
  }

  /** Generate particle sprites */
  generateParticles(): Map<string, HTMLCanvasElement> {
    const particles = new Map<string, HTMLCanvasElement>();

    // Ash flake
    const ash = createCanvas(4, 4);
    const actx = ash.getContext('2d')!;
    actx.fillStyle = '#666';
    actx.fillRect(0, 0, 3, 2);
    actx.fillRect(1, 2, 2, 1);
    particles.set('ash', ash);

    // Ember
    const ember = createCanvas(4, 4);
    const ectx = ember.getContext('2d')!;
    ectx.fillStyle = Colors.CRIMSON_GLOW;
    ectx.shadowColor = Colors.CRIMSON_GLOW;
    ectx.shadowBlur = 4;
    ectx.beginPath();
    ectx.arc(2, 2, 1.5, 0, Math.PI * 2);
    ectx.fill();
    particles.set('ember', ember);

    // Dust
    const dust = createCanvas(6, 6);
    const dctx = dust.getContext('2d')!;
    dctx.fillStyle = 'rgba(150,140,130,0.5)';
    dctx.beginPath();
    dctx.arc(3, 3, 2.5, 0, Math.PI * 2);
    dctx.fill();
    particles.set('dust', dust);

    return particles;
  }
}

function drawAshgraveFrame(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  isSlamming: boolean,
): void {
  const cx = x + w / 2;
  const ground = y + h;

  // Enormous armored body
  ctx.fillStyle = '#3a3530';
  // Legs
  ctx.fillRect(cx - w * 0.2, y + h * 0.6, w * 0.15, h * 0.35);
  ctx.fillRect(cx + w * 0.05, y + h * 0.58, w * 0.15, h * 0.37);
  // Boots
  ctx.fillStyle = '#2a2015';
  ctx.fillRect(cx - w * 0.22, ground - h * 0.08, w * 0.2, h * 0.08);
  ctx.fillRect(cx + w * 0.03, ground - h * 0.08, w * 0.2, h * 0.08);

  // Torso — massive
  ctx.fillStyle = '#3a3530';
  ctx.fillRect(cx - w * 0.3, y + h * 0.25, w * 0.6, h * 0.35);
  // Armor cracks with ash
  ctx.fillStyle = 'rgba(100,90,80,0.4)';
  ctx.fillRect(cx - w * 0.1, y + h * 0.3, 2, h * 0.25);
  ctx.fillRect(cx + w * 0.15, y + h * 0.28, 3, h * 0.2);

  // Pauldrons — massive
  ctx.fillStyle = '#4a4440';
  ctx.fillRect(cx - w * 0.38, y + h * 0.2, w * 0.15, h * 0.12);
  ctx.fillRect(cx + w * 0.23, y + h * 0.2, w * 0.15, h * 0.12);

  // Arms
  ctx.fillStyle = '#3a3530';
  ctx.fillRect(cx - w * 0.35, y + h * 0.32, w * 0.1, h * 0.25);
  ctx.fillRect(cx + w * 0.25, y + h * 0.32, w * 0.1, h * 0.25);

  // Head (cracked helm)
  ctx.fillStyle = '#3a3530';
  ctx.fillRect(cx - w * 0.12, y + h * 0.1, w * 0.24, h * 0.15);
  // Helm crack — red glow within
  ctx.fillStyle = Colors.CRIMSON_DIM;
  ctx.shadowColor = Colors.CRIMSON;
  ctx.shadowBlur = 8;
  ctx.fillRect(cx - 2, y + h * 0.13, 6, 4);
  ctx.shadowBlur = 0;

  // Melted greatsword (fused to arm)
  ctx.fillStyle = '#5a5550';
  if (isSlamming) {
    // Sword overhead then slamming down
    ctx.fillRect(cx + w * 0.2, y + h * 0.05, w * 0.06, h * 0.55);
  } else {
    ctx.fillRect(cx + w * 0.28, y + h * 0.1, w * 0.06, h * 0.5);
  }
  // Melting effect on blade
  ctx.fillStyle = 'rgba(80,75,70,0.5)';
  ctx.fillRect(cx + w * 0.29, y + h * 0.55, w * 0.08, h * 0.08);

  // Cloak / tattered cape
  ctx.fillStyle = '#252220';
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.25, y + h * 0.25);
  ctx.lineTo(cx - w * 0.15, y + h * 0.25);
  ctx.quadraticCurveTo(cx - w * 0.1, y + h * 0.6, cx - w * 0.2, ground - 2);
  ctx.lineTo(cx - w * 0.35, ground - 2);
  ctx.quadraticCurveTo(cx - w * 0.3, y + h * 0.5, cx - w * 0.25, y + h * 0.25);
  ctx.fill();
}

/** Generate UI elements */
export class UIGenerator {
  static generateEmberCursor(): HTMLCanvasElement {
    const c = createCanvas(12, 12);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = Colors.CRIMSON_GLOW;
    ctx.shadowColor = Colors.CRIMSON_GLOW;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(6, 6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    return c;
  }
}
