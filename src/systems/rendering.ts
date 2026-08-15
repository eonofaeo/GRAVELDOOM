import {
  Entity, getComponent,
  SpriteComponent, HealthComponent, StaminaComponent, EmberComponent, CombatStateComponent,
} from '../entities/components.js';
import { Renderer, Colors } from '../engine/renderer.js';
import { Camera } from '../engine/renderer.js';
import { Vec2, MathUtils } from '../engine/math.js';
import { deriveMaxHP, deriveMaxStamina, deriveMaxEmber } from '../data/gameData.js';
import { PlayerState } from './playerController.js';

/** Animation system — updates sprite frames */
export class AnimationSystem {
  private spriteSheets = new Map<string, HTMLCanvasElement>();

  registerSheet(key: string, sheet: HTMLCanvasElement): void {
    this.spriteSheets.set(key, sheet);
  }

  getSheet(key: string): HTMLCanvasElement | undefined {
    return this.spriteSheets.get(key);
  }

  update(entities: Entity[], dt: number): void {
    for (const entity of entities) {
      if (!entity.active) continue;
      const sprite = getComponent<SpriteComponent>(entity, 'sprite');
      if (!sprite) continue;

      sprite.frameTimer += dt;
      const frameDuration = 1 / sprite.fps;
      if (sprite.frameTimer >= frameDuration) {
        sprite.frameTimer -= frameDuration;
        const sheet = this.spriteSheets.get(`${sprite.sheetKey}_${sprite.currentAnim}`);
        if (sheet) {
          const frameCount = Math.floor(sheet.width / sprite.width);
          sprite.frame = (sprite.frame + 1) % frameCount;
        }
      }
    }
  }

  renderEntity(entity: Entity, renderer: Renderer): void {
    const sprite = getComponent<SpriteComponent>(entity, 'sprite');
    const transform = entity.components.get('transform') as any;
    if (!sprite || !transform || !sprite.visible) return;

    const sheet = this.spriteSheets.get(`${sprite.sheetKey}_${sprite.currentAnim}`);
    if (!sheet) {
      // Fallback: draw a colored rectangle
      renderer.drawRect(
        transform.position.x + sprite.offsetX,
        transform.position.y + sprite.offsetY,
        sprite.width, sprite.height,
        entity.tags.has('player') ? '#4a4440' : '#3a3530',
      );
      return;
    }

    const sx = sprite.frame * sprite.width;
    const screenPos = renderer.camera.worldToScreen(
      transform.position.add(Vec2.of(sprite.offsetX, sprite.offsetY)),
    );

    // Flash effect (damage)
    if (sprite.flashTimer > 0) {
      renderer.ctx.save();
      renderer.ctx.globalAlpha = 0.7;
      renderer.ctx.fillStyle = sprite.flashColor;
      renderer.ctx.fillRect(
        screenPos.x, screenPos.y,
        sprite.width * renderer.camera.zoom,
        sprite.height * renderer.camera.zoom,
      );
      renderer.ctx.restore();
    }

    renderer.drawSprite(
      sheet,
      sx, 0, sprite.width, sprite.height,
      screenPos.x, screenPos.y,
      sprite.width * renderer.camera.zoom,
      sprite.height * renderer.camera.zoom,
      sprite.flipX,
    );
  }
}

/** HUD Renderer — the three resource bars + ash counter */
export class HUDRenderer {
  private bossBanner: { name: string; epithet: string; timer: number; maxTimer: number } | null = null;
  private deathOverlay: { timer: number; flavorText: string } | null = null;
  private damageFlash = 0;

  showBossBanner(name: string, epithet: string, duration = 3): void {
    this.bossBanner = { name, epithet, timer: 0, maxTimer: duration };
  }

  showDeathOverlay(): void {
    const flavorTexts = [
      'The ash remembers this shape of failing.',
      'Another shape in the grey.',
      'The bloom grows a little stronger.',
      'Silence takes what was not given.',
      'The ember dims, but does not die.',
      'Even stillness has a cost.',
    ];
    this.deathOverlay = {
      timer: 0,
      flavorText: flavorTexts[Math.floor(Math.random() * flavorTexts.length)],
    };
  }

  triggerDamageFlash(): void {
    this.damageFlash = 0.15;
  }

  update(dt: number): void {
    if (this.bossBanner) {
      this.bossBanner.timer += dt;
      if (this.bossBanner.timer >= this.bossBanner.maxTimer) {
        this.bossBanner = null;
      }
    }
    if (this.deathOverlay) {
      this.deathOverlay.timer += dt;
    }
    if (this.damageFlash > 0) this.damageFlash -= dt;
  }

  render(renderer: Renderer, playerState: {
    health: HealthComponent;
    stamina: StaminaComponent;
    ember: EmberComponent;
    ash: number;
    combat: CombatStateComponent;
    flaskCharges?: number;
    maxFlaskCharges?: number;
    activeBoss?: { name: string; epithet: string; currentHP: number; maxHP: number };
  }): void {
    const ctx = renderer.ctx;
    const W = renderer.w;
    const H = renderer.h;

    // ─── Resource Bars ────────────────────────────────────
    const barX = 20;
    const barW = 160;
    const barH = 8;
    const barGap = 14;

    // Vigor (HP)
    this.drawResourceBar(ctx, barX, 20, barW, barH,
      playerState.health.current, playerState.health.max,
      Colors.HP_CRIMSON, 'rgba(139,26,26,0.3)', 'VIGOR');

    // Endurance (Stamina)
    this.drawResourceBar(ctx, barX, 20 + barGap, barW, barH,
      playerState.stamina.current, playerState.stamina.max,
      Colors.STAMINA_BONE, 'rgba(212,207,196,0.2)', 'ENDURANCE');

    // Ember
    this.drawResourceBar(ctx, barX, 20 + barGap * 2, barW, barH,
      playerState.ember.current, playerState.ember.max,
      Colors.CRIMSON_DIM, 'rgba(92,16,16,0.2)', 'EMBER');

    // Ash counter
    renderer.drawText(`✧ ${playerState.ash.toLocaleString()}`, barX + barW + 20, 20, {
      color: Colors.ASH_GOLD,
      font: '14px "Courier New", monospace',
      shadow: { color: 'rgba(196,168,74,0.3)', blur: 4, offsetX: 0, offsetY: 0 },
    });

    // Crimson Flask Charges
    const flaskCharges = (playerState as any).flaskCharges ?? 4;
    const maxFlaskCharges = (playerState as any).maxFlaskCharges ?? 4;
    ctx.fillStyle = 'rgba(230,57,70,0.15)';
    ctx.fillRect(barX + barW + 20, 36, 90, 16);
    ctx.strokeStyle = Colors.CRIMSON_GLOW;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX + barW + 20, 36, 90, 16);
    renderer.drawText(`🧪 FLASK ${flaskCharges}/${maxFlaskCharges}`, barX + barW + 26, 39, {
      color: flaskCharges > 0 ? Colors.CRIMSON_BRIGHT : 'rgba(212,207,196,0.4)',
      font: '10px "Courier New", monospace',
    });

    // ─── Weapon & Item indicators (Bottom Right) ──────────
    const weaponY = H - 35;
    const weaponX = W - 180;
    const weaponName = (playerState as any).weaponName ?? 'Arming Sword';
    ctx.fillStyle = 'rgba(10,10,10,0.6)';
    ctx.fillRect(weaponX, weaponY - 20, 160, 45);
    ctx.strokeStyle = 'rgba(212,207,196,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(weaponX, weaponY - 20, 160, 45);
    renderer.drawText(`⚔ ${weaponName}`, weaponX + 8, weaponY - 14, {
      color: Colors.BONE_WHITE, font: '10px "Courier New", monospace',
    });
    renderer.drawText(`[J] Attack [K] Heavy [Q] Heal`, weaponX + 8, weaponY + 4, {
      color: 'rgba(212,207,196,0.4)', font: '8px "Courier New", monospace',
    });

    // ─── Active Boss Health Bar (Top Center) ──────────────
    const activeBoss = (playerState as any).activeBoss as { name: string; epithet: string; currentHP: number; maxHP: number } | undefined;
    if (activeBoss && activeBoss.currentHP > 0) {
      const bossBarW = Math.min(480, W * 0.7);
      const bossBarX = (W - bossBarW) / 2;
      const bossBarY = 40;
      renderer.drawText(`${activeBoss.name.toUpperCase()} — ${activeBoss.epithet}`, W / 2, bossBarY - 14, {
        color: Colors.BONE_WHITE, font: '11px "Courier New", monospace', align: 'center',
        shadow: { color: Colors.CRIMSON_GLOW, blur: 6, offsetX: 0, offsetY: 0 },
      });
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bossBarX, bossBarY, bossBarW, 10);
      const bossFill = Math.max(0, (activeBoss.currentHP / activeBoss.maxHP) * bossBarW);
      ctx.fillStyle = Colors.CRIMSON;
      ctx.fillRect(bossBarX, bossBarY, bossFill, 10);
      ctx.strokeStyle = Colors.PALE_GOLD;
      ctx.lineWidth = 1;
      ctx.strokeRect(bossBarX, bossBarY, bossBarW, 10);
    }

    // ─── Stamina exhaustion warning ───────────────────────
    if (playerState.stamina.isExhausted) {
      const flashAlpha = Math.sin(performance.now() * 0.01) * 0.3 + 0.5;
      renderer.drawText('EXHAUSTED', barX, 20 + barGap * 3 + 4, {
        color: `rgba(230,57,70,${flashAlpha})`,
        font: '10px "Courier New", monospace',
      });
    }

    // ─── Boss Banner ──────────────────────────────────────
    if (this.bossBanner) {
      this.renderBossBanner(ctx, W, H);
    }

    // ─── Death Overlay ────────────────────────────────────
    if (this.deathOverlay) {
      this.renderDeathOverlay(ctx, W, H);
    }

    // ─── Damage Flash ─────────────────────────────────────
    if (this.damageFlash > 0) {
      const alpha = (this.damageFlash / 0.15) * 0.2;
      ctx.fillStyle = `rgba(139,26,26,${alpha})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawResourceBar(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    current: number, max: number,
    fgColor: string, bgColor: string, label: string,
  ): void {
    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y, w, h);

    // Fill
    const fillW = (current / max) * w;
    ctx.fillStyle = fgColor;
    ctx.fillRect(x, y, fillW, h);

    // Glow on the fill edge
    if (fillW > 0) {
      const grad = ctx.createLinearGradient(x + fillW - 10, y, x + fillW, y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(255,255,255,0.15)');
      ctx.fillStyle = grad;
      ctx.fillRect(x + fillW - 10, y, 10, h);
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // Label
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = 'rgba(212,207,196,0.5)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, x, y - 2);
  }

  private renderBossBanner(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this.bossBanner) return;
    const { name, epithet, timer, maxTimer } = this.bossBanner;

    // Slide in/out animation
    let alpha = 1;
    const slideIn = 0.5;
    const slideOut = maxTimer - 0.5;
    if (timer < slideIn) {
      alpha = timer / slideIn;
    } else if (timer > slideOut) {
      alpha = 1 - (timer - slideOut) / 0.5;
    }

    ctx.save();
    ctx.globalAlpha = MathUtils.clamp(alpha, 0, 1);

    // Ornate frame
    const frameW = 400;
    const frameH = 60;
    const frameX = (W - frameW) / 2;
    const frameY = 80;

    // Background
    ctx.fillStyle = 'rgba(10,10,10,0.8)';
    ctx.fillRect(frameX, frameY, frameW, frameH);

    // Crimson border
    ctx.strokeStyle = Colors.CRIMSON_GLOW;
    ctx.lineWidth = 2;
    ctx.strokeRect(frameX + 4, frameY + 4, frameW - 8, frameH - 8);

    // Filigree corners
    ctx.strokeStyle = Colors.PALE_GOLD;
    ctx.lineWidth = 1;
    const cornerSize = 12;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(frameX + 2, frameY + cornerSize);
    ctx.lineTo(frameX + 2, frameY + 2);
    ctx.lineTo(frameX + cornerSize, frameY + 2);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(frameX + frameW - cornerSize, frameY + 2);
    ctx.lineTo(frameX + frameW - 2, frameY + 2);
    ctx.lineTo(frameX + frameW - 2, frameY + cornerSize);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(frameX + 2, frameY + frameH - cornerSize);
    ctx.lineTo(frameX + 2, frameY + frameH - 2);
    ctx.lineTo(frameX + cornerSize, frameY + frameH - 2);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(frameX + frameW - cornerSize, frameY + frameH - 2);
    ctx.lineTo(frameX + frameW - 2, frameY + frameH - 2);
    ctx.lineTo(frameX + frameW - 2, frameY + frameH - cornerSize);
    ctx.stroke();

    // Boss name
    ctx.font = '18px "Courier New", monospace';
    ctx.fillStyle = Colors.BONE_WHITE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = Colors.CRIMSON_GLOW;
    ctx.shadowBlur = 8;
    ctx.fillText(name, W / 2, frameY + frameH / 2 - 8);

    // Epithet
    ctx.font = '11px "Courier New", monospace';
    ctx.fillStyle = Colors.PALE_GOLD;
    ctx.shadowBlur = 4;
    ctx.fillText(epithet, W / 2, frameY + frameH / 2 + 10);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  private renderDeathOverlay(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    if (!this.deathOverlay) return;
    const { timer, flavorText } = this.deathOverlay;

    const fadeIn = MathUtils.clamp(timer / 1.5, 0, 1);

    // Desaturate overlay
    ctx.save();
    ctx.globalAlpha = fadeIn * 0.7;
    ctx.fillStyle = 'rgba(10,10,10,0.8)';
    ctx.fillRect(0, 0, W, H);

    // "FADED TO ASH" text
    if (timer > 0.5) {
      const textAlpha = MathUtils.clamp((timer - 0.5) / 1.0, 0, 1);
      ctx.globalAlpha = textAlpha;

      ctx.font = '28px "Courier New", monospace';
      ctx.fillStyle = Colors.CRIMSON_DIM;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = Colors.CRIMSON;
      ctx.shadowBlur = 12;
      ctx.fillText('FADED TO ASH', W / 2, H / 2 - 30);

      // Flavor text
      if (timer > 1.5) {
        const flavorAlpha = MathUtils.clamp((timer - 1.5) / 1.0, 0, 1);
        ctx.globalAlpha = flavorAlpha;
        ctx.font = '12px "Courier New", monospace';
        ctx.fillStyle = 'rgba(212,207,196,0.6)';
        ctx.shadowBlur = 0;
        ctx.fillText(flavorText, W / 2, H / 2 + 10);
      }

      // Respawn prompt
      if (timer > 3) {
        const promptAlpha = Math.sin(timer * 2) * 0.3 + 0.5;
        ctx.globalAlpha = promptAlpha;
        ctx.font = '10px "Courier New", monospace';
        ctx.fillStyle = 'rgba(212,207,196,0.4)';
        ctx.fillText('The ash remembers...', W / 2, H / 2 + 40);
      }
    }

    ctx.restore();
  }

  clearDeathOverlay(): void {
    this.deathOverlay = null;
  }
}
