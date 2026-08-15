import { inject } from '@vercel/analytics';

import { Vec2, AABB, MathUtils } from './engine/math.js';
import { InputManager, InputAction } from './engine/input.js';
import { GameLoop } from './engine/loop.js';
import { Renderer, Colors, Camera } from './engine/renderer.js';
import { ParticleSystem, ParticlePresets } from './engine/particles.js';
import { AudioManager } from './engine/audio.js';
import { SpriteGenerator, UIGenerator } from './engine/sprites.js';
import { MusicSystem } from './engine/music.js';
import { AssetManager } from './engine/assets.js';
import {
  createEntity, addComponent, getComponent, Entity,
  createTransform, createVelocity, createCollider, createHealth, createStamina,
  createEmber, createPoise, createCombatState, createSprite, createAI,
  createFaction, createLoot, createName,
  TransformComponent, HealthComponent, StaminaComponent, EmberComponent, VelocityComponent,
  CombatStateComponent, SpriteComponent, PoiseComponent,
} from './entities/components.js';
import {
  createCinderChoir, updateCinderChoir, CinderChoirInstance,
  createRootMother, updateRootMother, RootMotherInstance,
  createVaelith, updateVaelith, VaelithInstance,
  createFrostWidow, updateFrostWidow, FrostWidowInstance,
  createHollowKing, updateHollowKing, HollowKingInstance,
  createUnspokenTwin, updateUnspokenTwin, UnspokenTwinInstance,
} from './entities/bosses.js';
import { PlayerController } from './systems/playerController.js';
import { EnemyAISystem } from './systems/enemyAI.js';
import { BossController } from './systems/bossController.js';
import { UniqueBossController, UniqueBossId } from './systems/uniqueBossController.js';
import { AnimationSystem, HUDRenderer } from './systems/rendering.js';
import { SaveManager, SaveData } from './systems/saveSystem.js';
import { EmberArtSystem, EMBER_ARTS, WEAPON_DEFAULT_ARTS } from './systems/emberArts.js';
import { CindersmithingSystem, MATERIALS } from './systems/cindersmithing.js';
import { DialogueManager } from './systems/dialogue.js';
import { MapSystem } from './systems/mapSystem.js';
import { HexSystem } from './systems/hexSystem.js';
import { SettingsManager } from './systems/settings.js';
import { ORIGINS, WEAPONS, ENEMIES, attuneCost, deriveMaxHP, deriveMaxStamina, deriveMaxEmber, scalingMultiplier } from './data/gameData.js';
import { ALL_REGIONS, RegionDefinition } from './data/regions.js';

// ─── Game State Machine ──────────────────────────────────────────

type GameScene = 'title' | 'vigil_select' | 'character_create' | 'gameplay' | 'paused' | 'settings' | 'dialogue' | 'death' | 'attune' | 'shop' | 'smithing';

class Gravebloom {
  // Engine
  private renderer: Renderer;
  private input: InputManager;
  private loop: GameLoop;
  private particles: ParticleSystem;
  private audio: AudioManager;
  private camera: Camera;
  private assets: AssetManager;

  // Systems
  private animationSystem: AnimationSystem;
  private hudRenderer: HUDRenderer;
  private saveManager: SaveManager;
  private playerController: PlayerController | null = null;
  private enemyAI: EnemyAISystem;
  private bossController: BossController | null = null;
  private emberArtSystem: EmberArtSystem;
  private cindersmithing: CindersmithingSystem;
  private dialogueManager: DialogueManager;
  private mapSystem: MapSystem;
  private hexSystem: HexSystem;
  private settingsManager: SettingsManager;
  private musicSystem: MusicSystem;

  // Multi-boss instances
  private cinderChoir: CinderChoirInstance | null = null;
  private rootMother: RootMotherInstance | null = null;
  private vaelith: VaelithInstance | null = null;
  private frostWidow: FrostWidowInstance | null = null;
  private hollowKing: HollowKingInstance | null = null;
  private unspokenTwin: UnspokenTwinInstance | null = null;
  private uniqueBossController: UniqueBossController | null = null;

  // Entities
  private player: Entity | null = null;
  private enemies: Entity[] = [];
  private allEntities: Entity[] = [];

  // Scene
  private currentScene: GameScene = 'title';
  private titleSelection = 0;
  private vigilSelection = 0;
  private originSelection = 0;
  private settingsSelection = 0;
  private settingsTab = 0;
  private currentSaveSlot = 0;
  private currentSave: SaveData | null = null;
  private currentRegion: RegionDefinition | null = null;
  private playTime = 0;
  private bossDefeated = new Set<string>();

  // ─── Progression & persistence ─────────────────────────────
  private lastBloomstone: { region: string; x: number; y: number } | null = null;
  private weaponUpgradeLevels: Record<string, number> = {};   // weaponId -> level (0-10)
  private weaponArtAssignments: Record<string, string> = {};  // weaponId -> artId
  private interactionLabel = '';

  // ─── Death Loop & Ash Recovery ─────────────────────────────
  private droppedAsh = 0;
  private droppedAshPos: { region: string; x: number; y: number } | null = null;

  // ─── Sub-menu UI state (attune / shop / smithing) ──────────
  private attuneSelection = 0;
  private shopSelection = 0;
  private smithSelection = 0;
  private smithStatus = '';
  private meleeHitCooldown = 0;
  private interactionCooldown = 0;

  // Environment
  private environmentSprites = new Map<string, HTMLCanvasElement>();

  // Timers
  private sceneTransitionTimer = 0;
  private autoSaveTimer = 0;
  private deathTimer = 0;
  private dialogueActionTimer = 0;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    this.renderer = new Renderer(canvas);
    this.input = new InputManager(canvas);
    this.particles = new ParticleSystem();
    this.audio = new AudioManager();
    this.assets = new AssetManager();
    this.animationSystem = new AnimationSystem();
    this.hudRenderer = new HUDRenderer();
    this.saveManager = new SaveManager();
    this.enemyAI = new EnemyAISystem(this.particles, this.audio);
    this.emberArtSystem = new EmberArtSystem(this.particles, this.audio);
    this.cindersmithing = new CindersmithingSystem();
    this.dialogueManager = new DialogueManager();
    this.mapSystem = new MapSystem();
    this.hexSystem = new HexSystem(this.particles, this.audio);
    this.settingsManager = new SettingsManager();
    this.musicSystem = new MusicSystem();
    this.camera = this.renderer.camera;

    // Generate sprites
    const spriteGen = new SpriteGenerator();
    const playerSprites = spriteGen.generatePlayer();
    playerSprites.forEach((sheet, anim) => this.animationSystem.registerSheet(`player_${anim}`, sheet));
    const wretchSprites = spriteGen.generateWretch();
    wretchSprites.forEach((sheet, anim) => this.animationSystem.registerSheet(`wretch_${anim}`, sheet));
    const ashgraveSprites = spriteGen.generateAshgrave();
    ashgraveSprites.forEach((sheet, anim) => this.animationSystem.registerSheet(`ashgrave_${anim}`, sheet));
    this.environmentSprites = spriteGen.generateEnvironment();

    // Custom cursor
    canvas.style.cursor = 'none';

    // Game loop
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha),
    );

    // Init audio + music on first touch/interaction
    const initAudio = () => {
      this.audio.init();
      this.audio.startAmbience();
      const audioCtx = (this.audio as any).ctx;
      const masterGain = (this.audio as any).masterGain;
      if (audioCtx && masterGain) {
        this.musicSystem.init(audioCtx, masterGain);
        this.musicSystem.start();
      }
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
      window.removeEventListener('touchstart', initAudio);
      window.removeEventListener('pointerdown', initAudio);
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);
    window.addEventListener('touchstart', initAudio);
    window.addEventListener('pointerdown', initAudio);
  }

  start(): void { this.loop.start(); }

  // ═══════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════

  private update(dt: number): void {
    this.input.updateTouchLayout(this.renderer.w, this.renderer.h);
    this.input.pollGamepad();
    this.particles.update(dt);
    this.hudRenderer.update(dt);
    this.sceneTransitionTimer += dt;

    switch (this.currentScene) {
      case 'title':          this.updateTitle(dt); break;
      case 'vigil_select':   this.updateVigilSelect(dt); break;
      case 'character_create': this.updateCharacterCreate(dt); break;
      case 'gameplay':       this.updateGameplay(dt); break;
      case 'paused':         this.updatePaused(dt); break;
      case 'settings':       this.updateSettings(dt); break;
      case 'dialogue':       this.updateDialogue(dt); break;
      case 'death':          this.updateDeath(dt); break;
      case 'attune':         this.updateAttune(dt); break;
      case 'shop':           this.updateShop(dt); break;
      case 'smithing':       this.updateSmithing(dt); break;
    }

    this.input.endFrame();
  }

  // ─── Title ────────────────────────────────────────────────

  private updateTitle(dt: number): void {
    const W = this.renderer.w;
    const H = this.renderer.h;
    const click = this.input.getPointerClick();

    if (click) {
      const my = H * 0.55;
      for (let i = 0; i < 4; i++) {
        const y = my + i * 24;
        if (click.x >= W / 2 - 120 && click.x <= W / 2 + 120 && click.y >= y - 10 && click.y <= y + 16) {
          this.titleSelection = i;
          this.audio.playUISelect();
          if (i === 0 || i === 1) {
            this.currentScene = 'vigil_select'; this.sceneTransitionTimer = 0;
          } else if (i === 2) {
            this.currentScene = 'settings'; this.sceneTransitionTimer = 0;
          }
          return;
        }
      }
    }

    if (this.input.isPressed(InputAction.MoveUp))   { this.titleSelection = Math.max(0, this.titleSelection - 1); this.audio.playUISelect(); }
    if (this.input.isPressed(InputAction.MoveDown)) { this.titleSelection = Math.min(3, this.titleSelection + 1); this.audio.playUISelect(); }
    if (this.input.isPressed(InputAction.Interact) || this.input.isPressed(InputAction.LightAttack)) {
      this.audio.playUISelect();
      switch (this.titleSelection) {
        case 0: case 1:
          this.currentScene = 'vigil_select'; this.sceneTransitionTimer = 0; break;
        case 2:
          this.currentScene = 'settings'; this.sceneTransitionTimer = 0; break;
        case 3: break;
      }
    }
    if (Math.random() < 0.3) {
      this.particles.emit(ParticlePresets.ash(Vec2.of(MathUtils.randomRange(0, this.renderer.w), this.renderer.h + 10)));
    }
  }

  // ─── Vigil Select ─────────────────────────────────────────

  private updateVigilSelect(dt: number): void {
    const W = this.renderer.w;
    const H = this.renderer.h;
    const click = this.input.getPointerClick();

    if (click) {
      const cardW = 160, cardH = 120, cardGap = 20;
      const startX = (W - (cardW * 3 + cardGap * 2)) / 2;
      const cardY = H * 0.3;
      for (let i = 0; i < 3; i++) {
        const x = startX + i * (cardW + cardGap);
        if (click.x >= x && click.x <= x + cardW && click.y >= cardY && click.y <= cardY + cardH) {
          this.vigilSelection = i;
          const vigils = this.saveManager.getVigils();
          const selected = vigils[i];
          this.currentSaveSlot = i;
          if (selected.isEmpty) {
            this.currentScene = 'character_create'; this.sceneTransitionTimer = 0;
          } else {
            this.currentSave = selected.data!;
            this.loadGameplay();
          }
          this.audio.playUISelect();
          return;
        }
      }
      if (click.y > H - 50) {
        this.currentScene = 'title'; this.sceneTransitionTimer = 0;
        this.audio.playUISelect();
        return;
      }
    }

    if (this.input.isPressed(InputAction.MoveLeft))  { this.vigilSelection = Math.max(0, this.vigilSelection - 1); this.audio.playUISelect(); }
    if (this.input.isPressed(InputAction.MoveRight)) { this.vigilSelection = Math.min(2, this.vigilSelection + 1); this.audio.playUISelect(); }
    if (this.input.isPressed(InputAction.Interact) || this.input.isPressed(InputAction.LightAttack)) {
      const vigils = this.saveManager.getVigils();
      const selected = vigils[this.vigilSelection];
      if (selected.isEmpty) {
        this.currentSaveSlot = this.vigilSelection;
        this.currentScene = 'character_create'; this.sceneTransitionTimer = 0;
      } else {
        this.currentSaveSlot = this.vigilSelection;
        this.currentSave = selected.data!;
        this.loadGameplay();
      }
      this.audio.playUISelect();
    }
    if (this.input.isPressed(InputAction.Pause)) { this.currentScene = 'title'; this.sceneTransitionTimer = 0; }
  }

  // ─── Character Create ─────────────────────────────────────

  private updateCharacterCreate(dt: number): void {
    const W = this.renderer.w;
    const H = this.renderer.h;
    const click = this.input.getPointerClick();

    if (click) {
      for (let i = 0; i < ORIGINS.length; i++) {
        const y = 60 + i * 28;
        if (click.x >= 40 && click.x <= 340 && click.y >= y - 4 && click.y <= y + 24) {
          this.originSelection = i;
          this.audio.playUISelect();
          break;
        }
      }
      // Confirm button click
      if (click.x >= W / 2 - 100 && click.x <= W / 2 + 100 && click.y >= H - 45) {
        const origin = ORIGINS[this.originSelection];
        this.currentSave = this.saveManager.createSave(this.currentSaveSlot, origin.id, 'The Unspoken');
        this.loadGameplay();
        this.audio.playUISelect();
        return;
      }
      // Back button click (top left)
      if (click.x <= 100 && click.y <= 50) {
        this.currentScene = 'vigil_select'; this.sceneTransitionTimer = 0;
        this.audio.playUISelect();
        return;
      }
    }

    if (this.input.isPressed(InputAction.MoveUp))   { this.originSelection = Math.max(0, this.originSelection - 1); this.audio.playUISelect(); }
    if (this.input.isPressed(InputAction.MoveDown)) { this.originSelection = Math.min(ORIGINS.length - 1, this.originSelection + 1); this.audio.playUISelect(); }
    if (this.input.isPressed(InputAction.Interact) || this.input.isPressed(InputAction.LightAttack)) {
      const origin = ORIGINS[this.originSelection];
      this.currentSave = this.saveManager.createSave(this.currentSaveSlot, origin.id, 'The Unspoken');
      this.loadGameplay();
      this.audio.playUISelect();
    }
    if (this.input.isPressed(InputAction.Pause)) { this.currentScene = 'vigil_select'; this.sceneTransitionTimer = 0; }
  }

  // ─── Gameplay ─────────────────────────────────────────────

  private updateGameplay(dt: number): void {
    if (!this.player || !this.playerController || !this.currentSave) return;

    // Map toggle (M key, Tab, touch button, or E+Up)
    if (this.input.isPressed(InputAction.MapToggle) || (this.input.isPressed(InputAction.Interact) && this.input.isDown(InputAction.MoveUp))) {
      this.mapSystem.toggle();
      this.audio.playUISelect();
    }
    if (this.mapSystem.getIsOpen()) {
      const move = this.input.getMovement();
      const selected = this.mapSystem.updateInput(dt, move.x, move.y,
        this.input.isPressed(InputAction.LightAttack), this.input.isPressed(InputAction.Pause));
      if (selected) this.handleMapSelection(selected);
      return;
    }

    // Pause
    if (this.input.isPressed(InputAction.Pause)) { this.currentScene = 'paused'; this.sceneTransitionTimer = 0; return; }

    // Ember Art
    if (this.input.isPressed(InputAction.EmberArt)) {
      const weapon = this.playerController.getState().weaponId;
      this.emberArtSystem.tryActivate(this.player, weapon, this.particles);
    }

    // Hex casting (1-4 keys mapped to items)
    for (let slot = 1; slot <= 4; slot++) {
      if (this.input.isPressed(InputAction.UseItem) && this.input.isDown(InputAction[`Move${['Up','Down','Left','Right'][slot-1]}` as keyof typeof InputAction] as any)) {
        const stats = this.currentSave.attributes;
        this.hexSystem.tryCast(slot, this.player, stats, (requiredItem) =>
          this.currentSave!.inventory.includes(requiredItem) || this.playerController!.getState().weaponId === requiredItem,
        );
      }
    }

    // Update player
    this.playerController.update(dt);

    // Player melee attacks damage enemies/bosses (weapon + upgrade level + scaling)
    this.processPlayerAttackHits();

    // Check player death
    const playerHealth = getComponent<HealthComponent>(this.player, 'health')!;
    if (playerHealth.current <= 0 && this.currentScene === 'gameplay') {
      const pTransform = getComponent<TransformComponent>(this.player, 'transform')!;
      if (this.playerController.getState().ash > 0) {
        this.droppedAsh = this.playerController.getState().ash;
        this.droppedAshPos = {
          region: this.currentRegion?.id ?? 'ashenCoast',
          x: pTransform.position.x,
          y: pTransform.position.y,
        };
        this.playerController.setAsh(0);
      }
      this.currentScene = 'death';
      this.deathTimer = 0;
      this.hudRenderer.showDeathOverlay();
      this.musicSystem.stop();
      return;
    }

    // Update enemies
    this.enemyAI.update(dt);

    // Update active boss
    this.updateActiveBoss(dt);

    // Update Ember Arts
    this.emberArtSystem.update(dt);

    // Update Hex system
    this.hexSystem.update(dt);

    // Process enemy hits on player
    const hits = this.enemyAI.collectPlayerHits();
    for (const hit of hits) {
      this.playerController.takeDamage(hit.damage, hit.direction, hit.isParryable);
      this.hudRenderer.triggerDamageFlash();
      this.shakeCamera(8, 0.2);
    }

    // Process hex hits
    for (const enemy of this.enemies) {
      const eTransform = getComponent<TransformComponent>(enemy, 'transform');
      if (!eTransform) continue;
      const hexHit = this.hexSystem.checkHits(eTransform.position, enemy.id);
      if (hexHit) {
        const eHealth = getComponent<HealthComponent>(enemy, 'health');
        if (eHealth) {
          eHealth.current -= hexHit.damage;
          if (hexHit.heal > 0) {
            playerHealth.current = Math.min(playerHealth.max, playerHealth.current + hexHit.heal);
          }
        }
      }
    }

    // Process ember art hits
    for (const enemy of this.enemies) {
      const eTransform = getComponent<TransformComponent>(enemy, 'transform');
      if (!eTransform) continue;
      const artHit = this.emberArtSystem.checkHits(eTransform.position, enemy.id);
      if (artHit) {
        const eHealth = getComponent<HealthComponent>(enemy, 'health');
        if (eHealth) eHealth.current -= artHit.damage;
      }
    }

    // Process enemy drops
    const drops = this.enemyAI.collectDrops();
    for (const drop of drops) this.playerController.addAsh(drop.ash);

    // Update animations
    this.animationSystem.update(this.allEntities, dt);

    // Camera follow
    const playerTransform = getComponent<TransformComponent>(this.player, 'transform')!;
    this.camera.follow(playerTransform.position, 0.08);
    this.camera.update(dt);

    // Ambient ash
    if (Math.random() < 0.15) {
      this.particles.emit(ParticlePresets.ash(Vec2.of(
        playerTransform.position.x + MathUtils.randomRange(-400, 400),
        playerTransform.position.y - 300,
      )));
    }

    // Exploration: Bloomstones, region exits, interaction prompts
    if (this.currentRegion) this.checkWorldInteractions(playerTransform.position);

    // Update map player indicator
    this.mapSystem.updatePlayerPosition(playerTransform.position, this.currentRegion?.id ?? 'ashenCoast');

    // Auto-save
    this.autoSaveTimer += dt;
    if (this.autoSaveTimer >= 60) { this.autoSaveTimer = 0; this.saveCurrentGame(); }
    this.playTime += dt;
  }

  private updateActiveBoss(dt: number): void {
    if (!this.player) return;
    const playerTransform = getComponent<TransformComponent>(this.player, 'transform')!;
    const playerPos = playerTransform.position;

    // Ser Ashgrave
    if (this.bossController) {
      this.bossController.update(dt, playerPos);
      const bossHit = this.bossController.checkHit(playerPos);
      if (bossHit) {
        this.playerController!.takeDamage(bossHit.damage, bossHit.direction, true);
        this.hudRenderer.triggerDamageFlash();
        this.shakeCamera(12, 0.3);
      }
      if ((this.bossController as any).entity?._bossDefeated) {
        delete (this.bossController as any).entity._bossDefeated;
        this.onBossDefeated('ser_ashgrave');
      }
    }

    if (this.uniqueBossController) {
      this.uniqueBossController.update(dt, playerPos);
      const bossHit = this.uniqueBossController.checkHit(playerPos);
      if (bossHit) {
        this.playerController!.takeDamage(bossHit.damage, bossHit.direction, true);
        this.hudRenderer.triggerDamageFlash();
        this.shakeCamera(10, 0.25);
      }
      if ((this.uniqueBossController.entity as any)._bossDefeated) {
        delete (this.uniqueBossController.entity as any)._bossDefeated;
        this.onBossDefeated(this.uniqueBossController.bossId);
      }
    }

    // Cinder Choir
    if (this.cinderChoir) {
      updateCinderChoir(this.cinderChoir, dt, playerPos, this.particles);
      if (this.cinderChoir.sharedHealth <= 0) this.onBossDefeated('cinder_choir');
    }

    // Root Mother
    if (this.rootMother) {
      updateRootMother(this.rootMother, dt, playerPos, this.particles);
      const rmHealth = getComponent<HealthComponent>(this.rootMother.entity, 'health');
      if (rmHealth && rmHealth.current <= 0) this.onBossDefeated('root_mother');
    }

    // Vaelith
    if (this.vaelith) {
      updateVaelith(this.vaelith, dt, playerPos, this.particles);
      const vHealth = getComponent<HealthComponent>(this.vaelith.entity, 'health');
      if (vHealth && vHealth.current <= 0) this.onBossDefeated('vaelith');
    }

    // Frost Widow
    if (this.frostWidow) {
      updateFrostWidow(this.frostWidow, dt, playerPos, this.particles);
      const fwHealth = getComponent<HealthComponent>(this.frostWidow.entity, 'health');
      if (fwHealth && fwHealth.current <= 0) this.onBossDefeated('frost_widow');
    }

    // Hollow King
    if (this.hollowKing) {
      updateHollowKing(this.hollowKing, dt, playerPos, this.particles);
      const hkHealth = getComponent<HealthComponent>(this.hollowKing.entity, 'health');
      if (hkHealth && hkHealth.current <= 0) this.onBossDefeated('hollow_king');
    }

    // Unspoken Twin
    if (this.unspokenTwin) {
      const playerState = this.playerController!.getState();
      updateUnspokenTwin(this.unspokenTwin, dt, playerPos,
        { health: getComponent<HealthComponent>(this.player, 'health')!.current, stamina: 0 },
        this.particles);
      const utHealth = getComponent<HealthComponent>(this.unspokenTwin.entity, 'health');
      if (utHealth && utHealth.current <= 0) this.onBossDefeated('unspoken_twin');
    }
  }

  private onBossDefeated(bossId: string): void {
    if (this.bossDefeated.has(bossId)) return;
    this.bossDefeated.add(bossId);

    const names: Record<string, { name: string; epithet: string }> = {
      ser_ashgrave: { name: 'SER ASHGRAVE', epithet: 'Felled' },
      sir_corvain: { name: 'SIR CORVAIN', epithet: 'The Last Vigil Falls' },
      bloomwarden: { name: 'THE BLOOMWARDEN', epithet: 'Rooted No More' },
      cinder_choir: { name: 'THE CINDER CHOIR', epithet: 'Silenced' },
      root_mother: { name: 'THE ROOT MOTHER', epithet: 'Severed' },
      vaelith: { name: 'VAELITH', epithet: 'Voice Unmade' },
      frost_widow: { name: 'THE FROST WIDOW', epithet: 'Shattered Crown' },
      hollow_king: { name: 'THE HOLLOW KING', epithet: 'Father of Ash, Freed' },
      unspoken_twin: { name: 'THE UNSPOKEN TWIN', epithet: 'The Mirror Shatters' },
    };

    const info = names[bossId];
    if (info) this.hudRenderer.showBossBanner(info.name, info.epithet, 5);

    // Unlock next region connections via map
    const regionUnlock: Record<string, string> = {
      ser_ashgrave: 'cindermoor',
      sir_corvain: 'emberWaste',
      bloomwarden: 'rootdeep',
      cinder_choir: 'silentCathedral',
      root_mother: 'hollowBough',
      vaelith: 'frostspire',
      frost_widow: 'hollowThrone',
    };
    const unlock = regionUnlock[bossId];
    if (unlock) this.mapSystem.discoverRegion(unlock);

    this.musicSystem.setRegion('exploration');
    this.saveCurrentGame();
  }

  private handleMapSelection(pinId: string): void {
    const pin = this.mapSystem.getPin(pinId);
    if (!pin || !pin.discovered || pin.type !== 'bloomstone') return;

    // Travel to the pin's region (spawns at that region's Bloomstone)
    if (pin.region && pin.region !== this.currentRegion?.id) {
      this.transitionToRegion(pin.region, null);
    }
    this.mapSystem.visitPin(pinId);
    this.mapSystem.toggle();
  }

  // ─── Death ────────────────────────────────────────────────

  private updateDeath(dt: number): void {
    this.deathTimer += dt;
    this.particles.update(dt);
    const click = this.input.getPointerClick();
    if (this.deathTimer > 2.5 && (click || this.input.isPressed(InputAction.Interact) || this.input.isPressed(InputAction.LightAttack))) {
      this.respawnPlayer();
    }
  }

  private respawnPlayer(): void {
    if (!this.player || !this.playerController || !this.currentSave) return;
    const health = getComponent<HealthComponent>(this.player, 'health')!;
    const combat = getComponent<CombatStateComponent>(this.player, 'combatState')!;
    const stamina = getComponent<StaminaComponent>(this.player, 'stamina')!;
    const ember = getComponent<EmberComponent>(this.player, 'ember')!;
    const transform = getComponent<TransformComponent>(this.player, 'transform')!;
    const velocity = getComponent<VelocityComponent>(this.player, 'velocity')!;

    health.current = health.max;
    health.invulnTimer = 2.0;
    stamina.current = stamina.max;
    ember.current = ember.max;
    combat.state = 'idle'; combat.canAct = true; combat.isAttacking = false;
    velocity.velocity = Vec2.ZERO;
    this.playerController.refillFlask();

    if (this.lastBloomstone && this.lastBloomstone.region !== this.currentRegion?.id) {
      this.transitionToRegion(this.lastBloomstone.region, Vec2.of(this.lastBloomstone.x, this.lastBloomstone.y));
      return;
    }
    transform.position = this.lastBloomstone
      ? Vec2.of(this.lastBloomstone.x, this.lastBloomstone.y)
      : Vec2.of(200, 300);

    this.currentScene = 'gameplay';
    this.deathTimer = 0;
    this.hudRenderer.clearDeathOverlay();
    this.musicSystem.setRegion('exploration');
  }

  // ─── Paused ─────────────────────────────────��─────────────

  private updatePaused(dt: number): void {
    const W = this.renderer.w;
    const H = this.renderer.h;
    const click = this.input.getPointerClick();

    if (click) {
      // Resume or Quit tap
      if (click.y >= H / 2 - 50 && click.y <= H / 2 - 10) {
        this.currentScene = 'gameplay';
        this.sceneTransitionTimer = 0;
        this.audio.playUISelect();
        return;
      } else if (click.y >= H / 2 && click.y <= H / 2 + 50) {
        this.saveCurrentGame();
        this.currentScene = 'title';
        this.sceneTransitionTimer = 0;
        this.musicSystem.stop();
        this.audio.playUISelect();
        return;
      }
    }

    if (this.input.isPressed(InputAction.Pause)) { this.currentScene = 'gameplay'; this.sceneTransitionTimer = 0; }
    if (this.input.isPressed(InputAction.Interact)) {
      this.saveCurrentGame();
      this.currentScene = 'title'; this.sceneTransitionTimer = 0;
      this.musicSystem.stop();
    }
  }

  // ─── Settings ─────────────────────────────────────────────

  private updateSettings(dt: number): void {
    const tabs = ['accessibility', 'video', 'audio', 'controls'];
    const click = this.input.getPointerClick();

    if (click) {
      // Tab clicks
      for (let i = 0; i < tabs.length; i++) {
        const tabX = 60 + i * 120;
        if (click.x >= tabX - 10 && click.x <= tabX + 110 && click.y >= 50 && click.y <= 75) {
          this.settingsTab = i;
          this.audio.playUISelect();
          return;
        }
      }
      // Item clicks
      for (let i = 0; i < 7; i++) {
        const y = 88 + i * 24;
        if (click.x >= 55 && click.x <= 460 && click.y >= y && click.y <= y + 24) {
          this.settingsSelection = i;
          this.triggerSettingToggle();
          return;
        }
      }
      // Back button click
      if (click.y > this.renderer.h - 50) {
        this.currentScene = 'title';
        this.sceneTransitionTimer = 0;
        this.audio.playUISelect();
        return;
      }
    }

    if (this.input.isPressed(InputAction.MoveLeft))  { this.settingsTab = Math.max(0, this.settingsTab - 1); this.audio.playUISelect(); }
    if (this.input.isPressed(InputAction.MoveRight)) { this.settingsTab = Math.min(tabs.length - 1, this.settingsTab + 1); this.audio.playUISelect(); }
    if (this.input.isPressed(InputAction.MoveUp))    { this.settingsSelection = Math.max(0, this.settingsSelection - 1); }
    if (this.input.isPressed(InputAction.MoveDown))  { this.settingsSelection = Math.min(7, this.settingsSelection + 1); }

    if (this.input.isPressed(InputAction.Interact)) {
      this.triggerSettingToggle();
    }

    if (this.input.isPressed(InputAction.Pause)) {
      this.currentScene = 'title'; this.sceneTransitionTimer = 0;
    }
  }

  private triggerSettingToggle(): void {
    const tabs = ['accessibility', 'video', 'audio', 'controls'];
    const tab = tabs[this.settingsTab];
    const acc = this.settingsManager.getAccessibility();
    const video = this.settingsManager.getVideo();
    const audio = this.settingsManager.getAudio();
    const controls = this.settingsManager.get().controls;

    if (tab === 'accessibility') {
      switch (this.settingsSelection) {
        case 0: this.settingsManager.updateAccessibility({ extendedParryWindow: !acc.extendedParryWindow }); break;
        case 1: this.settingsManager.updateAccessibility({ extendedIFrameWindow: !acc.extendedIFrameWindow }); break;
        case 2: this.settingsManager.updateAccessibility({ unlimitedStamina: !acc.unlimitedStamina }); break;
        case 3: this.settingsManager.updateAccessibility({ flashingLightsReduction: !acc.flashingLightsReduction }); break;
        case 4: this.settingsManager.updateAccessibility({ screenShakeReduction: acc.screenShakeReduction > 0 ? 0 : 0.7 }); break;
        case 5: {
          const modes: ('none' | 'protanopia' | 'deuteranopia' | 'tritanopia')[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia'];
          const idx = modes.indexOf(acc.colorblindMode);
          this.settingsManager.updateAccessibility({ colorblindMode: modes[(idx + 1) % modes.length] });
          break;
        }
      }
    } else if (tab === 'video') {
      switch (this.settingsSelection) {
        case 0: this.settingsManager.updateVideo({ screenShakeToggle: !video.screenShakeToggle }); break;
        case 1: this.settingsManager.updateVideo({ motionBlurToggle: !video.motionBlurToggle }); break;
        case 2: this.settingsManager.updateVideo({ brightness: video.brightness >= 1.5 ? 0.5 : video.brightness + 0.1 }); break;
        case 3: this.settingsManager.updateVideo({ gamma: video.gamma >= 1.5 ? 0.5 : video.gamma + 0.1 }); break;
      }
    } else if (tab === 'audio') {
      switch (this.settingsSelection) {
        case 0: this.settingsManager.updateAudio({ masterVolume: audio.masterVolume >= 1 ? 0 : audio.masterVolume + 0.1 }); break;
        case 1: this.settingsManager.updateAudio({ musicVolume: audio.musicVolume >= 1 ? 0 : audio.musicVolume + 0.1 }); break;
        case 2: this.settingsManager.updateAudio({ sfxVolume: audio.sfxVolume >= 1 ? 0 : audio.sfxVolume + 0.1 }); break;
        case 3: this.settingsManager.updateAudio({ ambienceVolume: audio.ambienceVolume >= 1 ? 0 : audio.ambienceVolume + 0.1 }); break;
      }
    } else if (tab === 'controls') {
      switch (this.settingsSelection) {
        case 0: this.settingsManager.updateControls({ stickDeadzone: controls.stickDeadzone >= 0.5 ? 0.1 : controls.stickDeadzone + 0.1 }); break;
        case 1: this.settingsManager.updateControls({ promptStyle: controls.promptStyle === 'auto' ? 'keyboard' : controls.promptStyle === 'keyboard' ? 'gamepad' : 'auto' }); break;
        case 2: this.settingsManager.updateControls({ mouseSensitivity: controls.mouseSensitivity >= 2 ? 0.5 : controls.mouseSensitivity + 0.25 }); break;
      }
    }
    this.applyAudioSettings();
    this.audio.playUISelect();
  }

  private applyAudioSettings(): void {
    const audio = this.settingsManager.getAudio();
    this.audio.setMasterVolume(audio.masterVolume);
    this.audio.setMusicVolume(audio.musicVolume);
    this.audio.setSFXVolume(audio.sfxVolume);
    this.audio.setAmbienceVolume(audio.ambienceVolume);
  }

  // ─── Dialogue ─────────────────────────────────────────────

  private updateDialogue(dt: number): void {
    this.dialogueActionTimer += dt;
    if (this.dialogueActionTimer < 0.3) return;

    const click = this.input.getPointerClick();
    if (click || this.input.isPressed(InputAction.Interact) || this.input.isPressed(InputAction.LightAttack)) {
      const result = this.dialogueManager.advance();
      this.audio.playUISelect();

      if (result.action) this.handleDialogueAction(result.action);
      if (result.isFinished && this.currentScene === 'dialogue') {
        this.currentScene = 'gameplay';
        this.dialogueManager.endDialogue();
      }
    }
    if (this.input.isPressed(InputAction.Pause)) {
      this.currentScene = 'gameplay';
      this.dialogueManager.endDialogue();
    }
  }

  private handleDialogueAction(action: string): void {
    switch (action) {
      case 'open_attune':
        this.attuneSelection = 0;
        this.currentScene = 'attune';
        break;
      case 'open_shop':
        this.shopSelection = 0;
        this.currentScene = 'shop';
        break;
      case 'open_cindersmithing':
        this.smithSelection = 0;
        this.smithStatus = '';
        this.currentScene = 'smithing';
        break;
    }
  }

  private updateAttune(_dt: number): void {
    if (!this.currentSave) return;
    const attributes = Object.keys(this.currentSave.attributes);
    const click = this.input.getPointerClick();

    if (click) {
      const H = this.renderer.h;
      for (let i = 0; i < attributes.length; i++) {
        const y = H * 0.32 + i * 32;
        if (click.y >= y - 10 && click.y <= y + 22) {
          this.attuneSelection = i;
          this.attuneSelectedAttribute();
          return;
        }
      }
      if (click.y > H * 0.78) {
        this.currentScene = 'gameplay';
        this.dialogueManager.endDialogue();
        return;
      }
    }

    if (this.input.isPressed(InputAction.MoveUp)) this.attuneSelection = Math.max(0, this.attuneSelection - 1);
    if (this.input.isPressed(InputAction.MoveDown)) this.attuneSelection = Math.min(attributes.length - 1, this.attuneSelection + 1);
    if (this.input.isPressed(InputAction.Interact)) {
      this.attuneSelectedAttribute();
    }
    if (this.input.isPressed(InputAction.Pause)) {
      this.currentScene = 'gameplay';
      this.dialogueManager.endDialogue();
    }
  }

  private attuneSelectedAttribute(): void {
    if (!this.currentSave) return;
    const attributes = Object.keys(this.currentSave.attributes);
    const cost = attuneCost(this.currentSave.level);
    if (this.playerController && this.playerController.getState().ash >= cost) {
      this.playerController.setAsh(this.playerController.getState().ash - cost);
      const attribute = attributes[this.attuneSelection];
      this.currentSave.attributes[attribute] = (this.currentSave.attributes[attribute] ?? 0) + 1;
      this.currentSave.level += 1;
      this.saveCurrentGame();
      this.audio.playBloomstone();
    } else {
      this.audio.playUISelect();
    }
  }

  private updateShop(_dt: number): void {
    if (!this.playerController) return;
    const shopItems = [
      { id: 'ashen_ore', name: 'Ashen Ore', cost: 50 },
      { id: 'cindersteel', name: 'Cindersteel', cost: 150 },
      { id: 'marshstone', name: 'Marshstone', cost: 300 },
    ];
    const click = this.input.getPointerClick();

    if (click) {
      const H = this.renderer.h;
      for (let i = 0; i < shopItems.length; i++) {
        const y = H * 0.32 + i * 32;
        if (click.y >= y - 10 && click.y <= y + 22) {
          this.shopSelection = i;
          this.purchaseShopItem();
          return;
        }
      }
      if (click.y > H * 0.78) {
        this.currentScene = 'gameplay';
        return;
      }
    }

    if (this.input.isPressed(InputAction.MoveUp)) this.shopSelection = Math.max(0, this.shopSelection - 1);
    if (this.input.isPressed(InputAction.MoveDown)) this.shopSelection = Math.min(shopItems.length - 1, this.shopSelection + 1);
    if (this.input.isPressed(InputAction.Interact)) {
      this.purchaseShopItem();
    }
    if (this.input.isPressed(InputAction.Pause)) this.currentScene = 'gameplay';
  }

  private purchaseShopItem(): void {
    if (!this.playerController) return;
    const shopItems = [
      { id: 'ashen_ore', name: 'Ashen Ore', cost: 50 },
      { id: 'cindersteel', name: 'Cindersteel', cost: 150 },
      { id: 'marshstone', name: 'Marshstone', cost: 300 },
    ];
    const item = shopItems[this.shopSelection];
    if (this.playerController.getState().ash >= item.cost) {
      this.playerController.setAsh(this.playerController.getState().ash - item.cost);
      this.cindersmithing.addMaterial(item.id, 1);
      this.saveCurrentGame();
      this.audio.playAshReclaim();
    } else {
      this.audio.playUISelect();
    }
  }

  private updateSmithing(_dt: number): void {
    if (!this.playerController) return;
    const click = this.input.getPointerClick();

    if (click) {
      const H = this.renderer.h;
      if (click.y >= H * 0.32 && click.y <= H * 0.65) {
        this.performSmithingUpgrade();
        return;
      }
      if (click.y > H * 0.78) {
        this.currentScene = 'gameplay';
        return;
      }
    }

    if (this.input.isPressed(InputAction.Interact)) {
      this.performSmithingUpgrade();
    }
    if (this.input.isPressed(InputAction.Pause)) this.currentScene = 'gameplay';
  }

  private performSmithingUpgrade(): void {
    if (!this.playerController) return;
    const weaponId = this.playerController.getState().weaponId;
    const state = { weaponId, level: this.weaponUpgradeLevels[weaponId] ?? 0, emberArtId: this.weaponArtAssignments[weaponId] ?? null };
    const check = this.cindersmithing.canUpgrade(state, this.playerController.getState().ash);
    const result = this.cindersmithing.upgrade(state, this.playerController.getState().ash);
    if (result) {
      this.weaponUpgradeLevels[weaponId] = result.newState.level;
      this.playerController.setAsh(this.playerController.getState().ash - result.ashCost);
      this.smithStatus = `Weapon upgraded to +${result.newState.level}`;
      this.saveCurrentGame();
      this.audio.playParry();
    } else {
      this.smithStatus = check.reason;
      this.audio.playUISelect();
    }
  }

  private processPlayerAttackHits(): void {
    if (!this.player || !this.playerController) return;
    this.meleeHitCooldown -= 1 / 60;
    const combat = getComponent<CombatStateComponent>(this.player, 'combatState')!;
    if (combat.state !== 'active' || this.meleeHitCooldown > 0) return;
    this.meleeHitCooldown = 0.25;
    const playerTransform = getComponent<TransformComponent>(this.player, 'transform')!;
    const weapon = WEAPONS[this.playerController.getState().weaponId];
    if (!weapon) return;
    const level = this.weaponUpgradeLevels[weapon.id] ?? 0;
    const damage = (weapon.baseDamage + this.cindersmithing.getUpgradedDamage(weapon.id, level) - weapon.baseDamage)
      * scalingMultiplier(this.currentSave?.attributes[weapon.scaling[0]?.stat] ?? 10, weapon.scaling[0]?.grade ?? 'D');
    const targets = [...this.enemies, ...(this.bossController ? [(this.bossController as any).entity as Entity] : [])];
    for (const target of targets) {
      if (!target?.active) continue;
      const targetTransform = getComponent<TransformComponent>(target, 'transform');
      const health = getComponent<HealthComponent>(target, 'health');
      if (!targetTransform || !health) continue;
      const inFront = (targetTransform.position.x - playerTransform.position.x) * playerTransform.facing >= -10;
      if (inFront && targetTransform.position.distanceTo(playerTransform.position) <= weapon.range + 35) {
        health.current = Math.max(0, health.current - damage);
        const poise = getComponent<PoiseComponent>(target, 'poise');
        if (poise) poise.current = Math.max(0, poise.current - weapon.poiseDamage);
      }
    }
  }

  private checkWorldInteractions(position: Vec2): void {
    if (!this.currentRegion || !this.currentSave || !this.playerController) return;
    if (this.interactionCooldown > 0) {
      this.interactionCooldown -= 1 / 60;
      return;
    }

    // 1. Ashlight reclamation
    if (this.droppedAshPos && this.droppedAshPos.region === this.currentRegion.id && this.droppedAsh > 0) {
      if (position.distanceTo(Vec2.of(this.droppedAshPos.x, this.droppedAshPos.y)) < 65) {
        this.playerController.addAsh(this.droppedAsh);
        this.audio.playAshReclaim();
        this.particles.emit(ParticlePresets.parrySpark(position));
        this.hudRenderer.showBossBanner('ASHLIGHT RETRIEVED', `Reclaimed ${this.droppedAsh.toLocaleString()} Lost Ash`, 3);
        this.droppedAsh = 0;
        this.droppedAshPos = null;
        this.saveCurrentGame();
      }
    }

    // 2. Bloomstones
    for (const stone of this.currentRegion.bloomstones) {
      if (position.distanceTo(Vec2.of(stone.x, stone.y)) < 70) {
        this.playerController.refillFlask();
        const pinId = this.mapSystem.getBloomstonePinId(this.currentRegion.id) ?? stone.id;
        this.mapSystem.discoverPin(pinId);
        this.mapSystem.visitPin(pinId);
        this.currentSave.bloomstonesDiscovered = [...new Set([...this.currentSave.bloomstonesDiscovered, stone.id])];
        this.lastBloomstone = { region: this.currentRegion.id, x: stone.x, y: stone.y };

        if (this.input.isPressed(InputAction.Interact)) {
          this.attuneSelection = 0;
          this.currentScene = 'attune';
          this.audio.playBloomstone();
          return;
        }
      }
    }

    // 3. NPC Interactions (Hub & Roaming)
    if (this.currentRegion.npcs) {
      for (const npc of this.currentRegion.npcs) {
        if (position.distanceTo(Vec2.of(npc.x, npc.y)) < 70) {
          if (this.input.isPressed(InputAction.Interact)) {
            if (npc.id === 'waking_choir') {
              this.attuneSelection = 0;
              this.currentScene = 'attune';
              this.audio.playUISelect();
            } else if (npc.id === 'old_coalspine') {
              this.shopSelection = 0;
              this.currentScene = 'shop';
              this.audio.playUISelect();
            } else if (npc.id === 'ferro') {
              this.smithSelection = 0;
              this.smithStatus = '';
              this.currentScene = 'smithing';
              this.audio.playUISelect();
            } else if (npc.id === 'unburied_scribe') {
              this.dialogueManager.startDialogue('scribe_intro');
              this.currentScene = 'dialogue';
              this.dialogueActionTimer = 0;
              this.audio.playUISelect();
            }
            return;
          }
        }
      }
    }

    // 4. Region exits & doors
    for (const connection of this.currentRegion.connections) {
      const target = ALL_REGIONS[connection.toRegion];
      if (target && position.distanceTo(Vec2.of(connection.x, connection.y)) < 55) {
        this.transitionToRegion(connection.toRegion, null);
        return;
      }
    }
  }

  private getActiveBossInfo(): { name: string; epithet: string; currentHP: number; maxHP: number } | undefined {
    if (this.bossController) {
      const health = getComponent<HealthComponent>((this.bossController as any).entity, 'health');
      if (health && health.current > 0) {
        return { name: 'Ser Ashgrave', epithet: 'The Herald Undone', currentHP: health.current, maxHP: health.max };
      }
    }
    if (this.uniqueBossController) {
      const health = getComponent<HealthComponent>(this.uniqueBossController.entity, 'health');
      if (health && health.current > 0) {
        const isCorvain = this.uniqueBossController.bossId === 'sir_corvain';
        return {
          name: isCorvain ? 'Sir Corvain' : 'The Bloomwarden',
          epithet: isCorvain ? 'The Last Vigil' : 'The Rooted Queen',
          currentHP: health.current,
          maxHP: health.max,
        };
      }
    }
    if (this.cinderChoir && this.cinderChoir.sharedHealth > 0) {
      return { name: 'The Cinder Choir', epithet: 'The Bound Sisters', currentHP: this.cinderChoir.sharedHealth, maxHP: 2400 };
    }
    if (this.rootMother) {
      const health = getComponent<HealthComponent>(this.rootMother.entity, 'health');
      if (health && health.current > 0) {
        return { name: 'The Root Mother', epithet: 'The Buried Horror', currentHP: health.current, maxHP: health.max };
      }
    }
    if (this.vaelith) {
      const health = getComponent<HealthComponent>(this.vaelith.entity, 'health');
      if (health && health.current > 0) {
        return { name: 'Vaelith', epithet: 'Voice of the Hollow Bough', currentHP: health.current, maxHP: health.max };
      }
    }
    if (this.frostWidow) {
      const health = getComponent<HealthComponent>(this.frostWidow.entity, 'health');
      if (health && health.current > 0) {
        return { name: 'The Frost Widow', epithet: "The Widow's Crown", currentHP: health.current, maxHP: health.max };
      }
    }
    if (this.hollowKing) {
      const health = getComponent<HealthComponent>(this.hollowKing.entity, 'health');
      if (health && health.current > 0) {
        return { name: 'The Hollow King', epithet: 'Father of Ash', currentHP: health.current, maxHP: health.max };
      }
    }
    if (this.unspokenTwin) {
      const health = getComponent<HealthComponent>(this.unspokenTwin.entity, 'health');
      if (health && health.current > 0) {
        return { name: 'The Unspoken Twin', epithet: 'The Mirror That Remembers', currentHP: health.current, maxHP: health.max };
      }
    }
    return undefined;
  }

  private transitionToRegion(regionId: string, spawn: Vec2 | null): void {
    const region = ALL_REGIONS[regionId];
    if (!region || !this.currentSave) return;
    this.currentSave.position.region = regionId;
    this.currentSave.position.x = spawn?.x ?? (region.bloomstones[0]?.x ?? 150);
    this.currentSave.position.y = spawn?.y ?? (region.bloomstones[0]?.y ?? 300);
    this.currentRegion = region;
    this.enemyAI.clear();
    this.enemies = [];
    this.bossController = null;
    this.uniqueBossController = null;
    this.cinderChoir = null; this.rootMother = null; this.vaelith = null;
    this.frostWidow = null; this.hollowKing = null; this.unspokenTwin = null;
    this.loadGameplay();
  }

  private shakeCamera(intensity: number, duration: number): void {
    const reduction = this.settingsManager.getAccessibility().screenShakeReduction;
    if (this.settingsManager.getVideo().screenShakeToggle === false) return;
    this.camera.shake(intensity * Math.max(0, 1 - reduction), duration);
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  private render(alpha: number): void {
    this.renderer.beginFrame();
    switch (this.currentScene) {
      case 'title':          this.renderTitle(); break;
      case 'vigil_select':   this.renderVigilSelect(); break;
      case 'character_create': this.renderCharacterCreate(); break;
      case 'gameplay':       this.renderGameplay(alpha); break;
      case 'paused':         this.renderGameplay(alpha); this.renderPauseOverlay(); break;
      case 'settings':       this.renderSettings(); break;
      case 'dialogue':       this.renderGameplay(alpha); this.renderDialogue(); break;
      case 'death':          this.renderGameplay(alpha); break;
      case 'attune':         this.renderGameplay(alpha); this.renderAttune(); break;
      case 'shop':           this.renderGameplay(alpha); this.renderShop(); break;
      case 'smithing':       this.renderGameplay(alpha); this.renderSmithing(); break;
    }
    this.renderer.endFrame();
  }

  private renderTitle(): void {
    const ctx = this.renderer.ctx;
    const W = this.renderer.w;
    const H = this.renderer.h;
    ctx.fillStyle = Colors.BLACK; ctx.fillRect(0, 0, W, H);

    const titleBg = this.assets.getImage('title_bg');
    if (titleBg) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.drawImage(titleBg, 0, 0, W, H);
      ctx.restore();
    } else {
      // Silhouette fallback
      const sy = H * 0.6;
      ctx.fillStyle = '#151210';
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x < W; x += 5) { ctx.lineTo(x, sy - (30 + Math.sin(x * 0.01) * 40 + Math.sin(x * 0.03) * 20)); }
      ctx.lineTo(W, H); ctx.fill();
    }

    this.renderer.drawVignette(0.7);

    this.renderer.drawText('GRAVEBLOOM', W / 2, H * 0.26, {
      color: Colors.BONE_WHITE, font: '36px "Courier New", monospace', align: 'center',
      shadow: { color: Colors.CRIMSON_GLOW, blur: 20, offsetX: 0, offsetY: 0 },
    });
    this.renderer.drawText('A Requiem in Ash and Crimson', W / 2, H * 0.26 + 36, {
      color: 'rgba(212,207,196,0.6)', font: '12px "Courier New", monospace', align: 'center',
    });

    const items = ['Begin Anew', 'Continue Vigil', 'Settings', 'Controls & Credits'];
    const my = H * 0.54;
    for (let i = 0; i < items.length; i++) {
      const y = my + i * 26;
      const sel = i === this.titleSelection;
      if (sel) this.renderer.drawText('✦', W / 2 - 80, y, { color: Colors.CRIMSON_GLOW, font: '12px "Courier New", monospace', align: 'center', shadow: { color: Colors.CRIMSON_GLOW, blur: 6, offsetX: 0, offsetY: 0 } });
      this.renderer.drawText(items[i], W / 2, y, { color: sel ? Colors.CRIMSON_GLOW : 'rgba(212,207,196,0.6)', font: `${sel ? 14 : 12}px "Courier New", monospace`, align: 'center', shadow: sel ? { color: Colors.CRIMSON, blur: 8, offsetX: 0, offsetY: 0 } : undefined });
    }

    this.renderer.drawText('[CLICK / TAP] or [ENTER] to Select', W / 2, H - 25, {
      color: 'rgba(212,207,196,0.3)', font: '9px "Courier New", monospace', align: 'center'
    });

    this.particles.render(this.renderer);
    if (this.sceneTransitionTimer < 1) this.renderer.drawOverlay(`rgba(0,0,0,${1 - this.sceneTransitionTimer})`);
  }

  private renderVigilSelect(): void {
    const ctx = this.renderer.ctx;
    const W = this.renderer.w;
    const H = this.renderer.h;
    ctx.fillStyle = Colors.BLACK; ctx.fillRect(0, 0, W, H);
    this.renderer.drawVignette(0.6);
    this.renderer.drawText('Choose Your Vigil', W / 2, 40, { color: Colors.BONE_WHITE, font: '18px "Courier New", monospace', align: 'center' });
    this.renderer.drawText('"The Ash remembers those who return."', W / 2, 65, { color: 'rgba(212,207,196,0.4)', font: '10px "Courier New", monospace', align: 'center' });

    const vigils = this.saveManager.getVigils();
    const cardW = 160, cardH = 120, cardGap = 20;
    const startX = (W - (cardW * 3 + cardGap * 2)) / 2;
    const cardY = H * 0.3;
    const romans = ['I', 'II', 'III'];
    for (let i = 0; i < 3; i++) {
      const x = startX + i * (cardW + cardGap);
      const sel = i === this.vigilSelection;
      const v = vigils[i];
      ctx.fillStyle = sel ? 'rgba(139,26,26,0.15)' : 'rgba(26,26,26,0.6)';
      ctx.fillRect(x, cardY, cardW, cardH);
      ctx.strokeStyle = sel ? Colors.CRIMSON_GLOW : 'rgba(212,207,196,0.15)';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(x, cardY, cardW, cardH);
      this.renderer.drawText(`Vigil ${romans[i]}`, x + cardW / 2, cardY + 15, { color: sel ? Colors.CRIMSON_GLOW : Colors.BONE_WHITE, font: '14px "Courier New", monospace', align: 'center' });
      if (!v.isEmpty && v.data) {
        this.renderer.drawText(v.data.vigilName, x + cardW / 2, cardY + 40, { color: Colors.BONE_WHITE, font: '11px "Courier New", monospace', align: 'center' });
        this.renderer.drawText(`Lv. ${v.data.level}`, x + cardW / 2, cardY + 55, { color: 'rgba(212,207,196,0.6)', font: '10px "Courier New", monospace', align: 'center' });
        const origin = ORIGINS.find(o => o.id === v.data!.origin);
        if (origin) this.renderer.drawText(origin.name, x + cardW / 2, cardY + 70, { color: 'rgba(212,207,196,0.4)', font: '9px "Courier New", monospace', align: 'center' });
        const h = Math.floor(v.data.playTime / 3600), m = Math.floor((v.data.playTime % 3600) / 60);
        this.renderer.drawText(`${h}h${m.toString().padStart(2, '0')}m`, x + cardW / 2, cardY + 85, { color: 'rgba(196,168,74,0.5)', font: '9px "Courier New", monospace', align: 'center' });
      } else {
        this.renderer.drawText('An unlit Vigil', x + cardW / 2, cardY + 50, { color: 'rgba(212,207,196,0.25)', font: '10px "Courier New", monospace', align: 'center' });
        if (sel) this.renderer.drawText('Begin Anew', x + cardW / 2, cardY + 70, { color: 'rgba(230,57,70,0.5)', font: '10px "Courier New", monospace', align: 'center' });
      }
    }
    this.particles.render(this.renderer);
    if (this.sceneTransitionTimer < 0.5) this.renderer.drawOverlay(`rgba(0,0,0,${1 - this.sceneTransitionTimer * 2})`);
  }

  private renderCharacterCreate(): void {
    const ctx = this.renderer.ctx;
    const W = this.renderer.w;
    const H = this.renderer.h;
    ctx.fillStyle = Colors.BLACK; ctx.fillRect(0, 0, W, H);
    this.renderer.drawVignette(0.6);
    this.renderer.drawText('Choose Your Origin', W / 2, 28, { color: Colors.BONE_WHITE, font: '18px "Courier New", monospace', align: 'center' });

    // Origin list
    for (let i = 0; i < ORIGINS.length; i++) {
      const o = ORIGINS[i]; const y = 60 + i * 28; const sel = i === this.originSelection;
      if (sel) {
        ctx.fillStyle = 'rgba(139,26,26,0.2)';
        ctx.fillRect(45, y - 3, 300, 25);
        this.renderer.drawText('✦', 50, y + 3, { color: Colors.CRIMSON_GLOW, font: '10px "Courier New", monospace' });
      }
      this.renderer.drawText(o.name, 65, y + 2, { color: sel ? Colors.CRIMSON_GLOW : Colors.BONE_WHITE, font: '12px "Courier New", monospace' });
      this.renderer.drawText(o.description, 65, y + 14, { color: 'rgba(212,207,196,0.4)', font: '8px "Courier New", monospace' });
    }

    const sel = ORIGINS[this.originSelection];
    const dx = W - 250;

    // Portrait concept art
    const heroArt = this.assets.getImage('the_unspoken');
    if (heroArt) {
      ctx.save();
      ctx.strokeStyle = Colors.CRIMSON_GLOW;
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 30, 50, 110, 110);
      ctx.drawImage(heroArt, dx + 30, 50, 110, 110);
      ctx.restore();
    }

    const statsStartY = heroArt ? 170 : 65;
    this.renderer.drawText('Starting Stats', dx, statsStartY, { color: Colors.PALE_GOLD, font: '11px "Courier New", monospace' });
    const statKeys = ['vigor', 'endurance', 'might', 'grace', 'resolve', 'ashAffinity'];
    const statLabels = ['Vigor', 'Endurance', 'Might', 'Grace', 'Resolve', 'Ash Affin.'];
    for (let i = 0; i < statKeys.length; i++) {
      const val = sel.stats[statKeys[i]]; const y = statsStartY + 16 + i * 15;
      this.renderer.drawText(statLabels[i], dx, y, { color: 'rgba(212,207,196,0.6)', font: '10px "Courier New", monospace' });
      ctx.fillStyle = 'rgba(139,26,26,0.2)'; ctx.fillRect(dx + 80, y, 80, 6);
      ctx.fillStyle = Colors.CRIMSON_DIM; ctx.fillRect(dx + 80, y, (val / 20) * 80, 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.strokeRect(dx + 80, y, 80, 6);
      this.renderer.drawText(val.toString(), dx + 165, y - 1, { color: Colors.BONE_WHITE, font: '9px "Courier New", monospace' });
    }

    const weapon = WEAPONS[sel.startingWeapon];
    if (weapon) {
      const wy = statsStartY + 115;
      this.renderer.drawText(`Weapon: ${weapon.name}`, dx, wy, { color: Colors.PALE_GOLD, font: '10px "Courier New", monospace' });
      this.renderer.drawText(weapon.description, dx, wy + 14, { color: 'rgba(212,207,196,0.4)', font: '9px "Courier New", monospace', maxWidth: 200 });
    }

    // Confirm button
    ctx.fillStyle = 'rgba(139,26,26,0.25)';
    ctx.fillRect(W / 2 - 100, H - 40, 200, 28);
    ctx.strokeStyle = Colors.CRIMSON_GLOW;
    ctx.strokeRect(W / 2 - 100, H - 40, 200, 28);
    this.renderer.drawText('CONFIRM ORIGIN', W / 2, H - 28, {
      color: Colors.CRIMSON_GLOW, font: '11px "Courier New", monospace', align: 'center'
    });

    this.particles.render(this.renderer);
  }

  private renderGameplay(alpha: number): void {
    const ctx = this.renderer.ctx;
    const W = this.renderer.w;
    const H = this.renderer.h;

    this.renderBackground();
    this.renderer.applyCameraTransform();
    this.renderTerrain();
    this.renderDecorations();

    // Render Ashlight reclamation wisp
    if (this.droppedAshPos && this.currentRegion && this.droppedAshPos.region === this.currentRegion.id && this.droppedAsh > 0) {
      ctx.save();
      const time = performance.now() / 1000;
      const bob = Math.sin(time * 4) * 6;
      ctx.fillStyle = 'rgba(230,57,70,0.85)';
      ctx.shadowColor = Colors.CRIMSON_GLOW;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(this.droppedAshPos.x, this.droppedAshPos.y - 15 + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = Colors.PALE_GOLD;
      ctx.beginPath();
      ctx.arc(this.droppedAshPos.x, this.droppedAshPos.y - 15 + bob, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    for (const entity of this.allEntities) {
      if (!entity.active && getComponent<CombatStateComponent>(entity, 'combatState')?.state !== 'dead') continue;
      this.animationSystem.renderEntity(entity, this.renderer);
      if (entity.tags.has('enemy')) this.renderEnemyHealthBar(entity);
    }

    // Boss-specific particles
    this.renderBossVisuals();

    this.particles.render(this.renderer);
    this.renderer.restoreCameraTransform();
    this.renderer.drawVignette(0.4);

    // HUD
    if (this.player && this.playerController) {
      const health = getComponent<HealthComponent>(this.player, 'health')!;
      const stamina = getComponent<StaminaComponent>(this.player, 'stamina')!;
      const ember = getComponent<EmberComponent>(this.player, 'ember')!;
      const combat = getComponent<CombatStateComponent>(this.player, 'combatState')!;
      const activeBoss = this.getActiveBossInfo();
      this.hudRenderer.render(this.renderer, {
        health, stamina, ember,
        ash: this.playerController.getState().ash,
        combat,
        flaskCharges: this.playerController.getFlaskCharges(),
        maxFlaskCharges: this.playerController.getMaxFlaskCharges(),
        activeBoss,
      });
    }

    // Mobile touch controls overlay
    this.input.renderTouchControls(this.renderer.ctx, 0.85);

    // Map overlay
    if (this.mapSystem.getIsOpen()) this.mapSystem.render(this.renderer);
  }

  private renderMenuPanel(title: string, lines: string[], selection: number, status = ''): void {
    const ctx = this.renderer.ctx;
    const W = this.renderer.w;
    const H = this.renderer.h;
    ctx.fillStyle = 'rgba(5,5,5,0.92)';
    ctx.fillRect(W * 0.18, H * 0.12, W * 0.64, H * 0.76);
    ctx.strokeStyle = Colors.CRIMSON_GLOW;
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.18, H * 0.12, W * 0.64, H * 0.76);
    this.renderer.drawText(title, W / 2, H * 0.21, {
      color: Colors.BONE_WHITE, font: '20px "Courier New", monospace', align: 'center',
    });
    lines.forEach((line, index) => {
      this.renderer.drawText(`${index === selection ? '▸ ' : '  '}${line}`, W * 0.27, H * 0.32 + index * 32, {
        color: index === selection ? Colors.CRIMSON_GLOW : Colors.BONE_WHITE,
        font: '12px "Courier New", monospace',
      });
    });
    if (status) this.renderer.drawText(status, W / 2, H * 0.72, {
      color: Colors.PALE_GOLD, font: '10px "Courier New", monospace', align: 'center',
    });
    this.renderer.drawText('[↑↓] Select  [ENTER] Confirm  [ESC] Back', W / 2, H * 0.82, {
      color: 'rgba(212,207,196,0.45)', font: '9px "Courier New", monospace', align: 'center',
    });
  }

  private renderAttune(): void {
    const attributes = this.currentSave ? Object.entries(this.currentSave.attributes) : [];
    const ash = this.playerController?.getState().ash ?? 0;
    const level = this.currentSave?.level ?? 1;
    const cost = attuneCost(level);
    this.renderMenuPanel('ATTUNE AT THE WAKING CHOIR', [
      ...attributes.map(([name, value]) => `${name}: ${value}`),
      `Spend ${cost} Ash to raise the selected attribute`,
      `Ash: ${ash}  Level: ${level}`,
    ], Math.min(this.attuneSelection, Math.max(0, attributes.length - 1)));
  }

  private renderShop(): void {
    const items = [
      'Ashen Ore — 50 Ash',
      'Cindersteel — 150 Ash',
      'Marshstone — 300 Ash',
    ];
    const materials = [...this.cindersmithing.getMaterials()]
      .map(([id, count]) => `${MATERIALS[id]?.name ?? id}: ${count}`).join('  ');
    this.renderMenuPanel('OLD COALSPINE — MATERIALS', items, this.shopSelection,
      `${materials || 'No materials'}  |  Ash: ${this.playerController?.getState().ash ?? 0}`);
  }

  private renderSmithing(): void {
    const weaponId = this.playerController?.getState().weaponId ?? 'arming_sword';
    const level = this.weaponUpgradeLevels[weaponId] ?? 0;
    const state = { weaponId, level, emberArtId: null };
    const check = this.cindersmithing.canUpgrade(state, this.playerController?.getState().ash ?? 0);
    this.renderMenuPanel('FERRO — CINDERSMITHING', [
      `${WEAPONS[weaponId]?.name ?? weaponId} +${level}`,
      check.recipe ? `Next upgrade: +${check.recipe.targetLevel} (${check.recipe.ashCost} Ash)` : 'Maximum level reached',
      check.canUpgrade ? 'Upgrade ready' : check.reason,
    ], this.smithSelection, this.smithStatus);
  }

  private renderBossVisuals(): void {
    // Cinder Choir ribbon
    if (this.cinderChoir && this.cinderChoir.linkingRibbon.length >= 2) {
      const ctx = this.renderer.ctx;
      ctx.strokeStyle = Colors.MOLTEN_ORANGE;
      ctx.lineWidth = 2;
      ctx.shadowColor = Colors.MOLTEN_ORANGE;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const first = this.cinderChoir.linkingRibbon[0];
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < this.cinderChoir.linkingRibbon.length; i++) {
        ctx.lineTo(this.cinderChoir.linkingRibbon[i].x, this.cinderChoir.linkingRibbon[i].y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Root Mother limbs
    if (this.rootMother) {
      const transform = getComponent<TransformComponent>(this.rootMother.entity, 'transform');
      if (transform) {
        for (const limb of this.rootMother.limbPositions) {
          const pos = transform.position.add(limb);
          this.renderer.ctx.fillStyle = '#3a1a4a';
          this.renderer.ctx.fillRect(pos.x - 3, pos.y - 3, 6, 6);
          // Withered hand
          this.renderer.ctx.fillStyle = '#5a3a2a';
          this.renderer.ctx.fillRect(pos.x - 2, pos.y - 6, 4, 4);
        }
      }
    }

    // Vaelith root strings
    if (this.vaelith) {
      const transform = getComponent<TransformComponent>(this.vaelith.entity, 'transform');
      if (transform) {
        const ctx = this.renderer.ctx;
        ctx.strokeStyle = Colors.SICKLY_VIOLET;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4;
        for (const root of this.vaelith.rootStrings) {
          ctx.beginPath();
          ctx.moveTo(root.x, root.y - 200);
          ctx.quadraticCurveTo(
            (root.x + transform.position.x) / 2,
            (root.y + transform.position.y) / 2 - 50,
            transform.position.x, transform.position.y - 30,
          );
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Vaelith whisper orbs
    if (this.vaelith) {
      for (const orb of this.vaelith.whisperOrbs) {
        this.renderer.ctx.save();
        this.renderer.ctx.fillStyle = Colors.SICKLY_VIOLET;
        this.renderer.ctx.shadowColor = '#aa66dd';
        this.renderer.ctx.shadowBlur = 10;
        this.renderer.ctx.beginPath();
        this.renderer.ctx.arc(orb.pos.x, orb.pos.y, 5, 0, Math.PI * 2);
        this.renderer.ctx.fill();
        this.renderer.ctx.shadowBlur = 0;
        this.renderer.ctx.restore();
      }
    }

    // Hollow King reforming blade
    if (this.hollowKing && this.hollowKing.reformingBlade) {
      const transform = getComponent<TransformComponent>(this.hollowKing.entity, 'transform');
      if (transform) {
        this.renderer.ctx.save();
        this.renderer.ctx.strokeStyle = Colors.CRIMSON_GLOW;
        this.renderer.ctx.lineWidth = 3;
        this.renderer.ctx.shadowColor = Colors.CRIMSON_GLOW;
        this.renderer.ctx.shadowBlur = 12;
        this.renderer.ctx.beginPath();
        this.renderer.ctx.moveTo(transform.position.x + transform.facing * 20, transform.position.y - 60);
        this.renderer.ctx.lineTo(transform.position.x + transform.facing * 40, transform.position.y - 20);
        this.renderer.ctx.stroke();
        this.renderer.ctx.shadowBlur = 0;
        this.renderer.ctx.restore();
      }
    }

    // Frost Widow blizzard overlay
    if (this.frostWidow && this.frostWidow.blizzardActive) {
      this.renderer.ctx.save();
      this.renderer.ctx.fillStyle = 'rgba(200,220,240,0.08)';
      this.renderer.ctx.fillRect(0, 0, this.renderer.w, this.renderer.h);
      this.renderer.ctx.restore();
    }

    // Unspoken Twin void aura
    if (this.unspokenTwin) {
      const transform = getComponent<TransformComponent>(this.unspokenTwin.entity, 'transform');
      if (transform) {
        this.renderer.ctx.save();
        this.renderer.ctx.globalAlpha = 0.2 + Math.sin(performance.now() * 0.003) * 0.1;
        const grad = this.renderer.ctx.createRadialGradient(
          transform.position.x, transform.position.y, 0,
          transform.position.x, transform.position.y, 60,
        );
        grad.addColorStop(0, 'rgba(0,0,0,0.8)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        this.renderer.ctx.fillStyle = grad;
        this.renderer.ctx.fillRect(transform.position.x - 60, transform.position.y - 60, 120, 120);
        this.renderer.ctx.restore();
      }
    }
  }

  private renderBackground(): void {
    const ctx = this.renderer.ctx;
    const W = this.renderer.w;
    const H = this.renderer.h;
    const region = this.currentRegion;
    const c1 = region?.bgColor1 ?? '#0a0808';
    const c2 = region?.bgColor2 ?? '#151210';
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, c1); grad.addColorStop(0.5, c2); grad.addColorStop(1, c2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    for (let layer = 0; layer < 3; layer++) {
      const parallax = 0.2 + layer * 0.15;
      const offsetX = this.camera.position.x * parallax;
      const bg = this.environmentSprites.get(`bg_layer_${layer}`);
      if (bg) {
        const bgW = bg.width;
        const startX = -(offsetX % bgW);
        for (let x = startX - bgW; x < W + bgW; x += bgW) ctx.drawImage(bg, x, H - bg.height);
      }
    }
  }

  private renderTerrain(): void {
    const ground = this.environmentSprites.get('ground');
    const wall = this.environmentSprites.get('wall');
    if (!ground) return;
    const T = 64;
    const bounds = this.camera.getWorldBounds();
    const startX = Math.floor(bounds.left / T) * T;
    const endX = Math.ceil(bounds.right / T) * T;
    for (let x = startX; x < endX; x += T) {
      this.renderer.ctx.drawImage(ground, x, 300);
      if (wall) this.renderer.ctx.drawImage(wall, x, 300 + T);
    }
    // Region-specific platforms
    if (this.currentRegion) {
      for (const tile of this.currentRegion.tiles) {
        if (tile.type === 'platform') this.renderer.ctx.drawImage(ground, tile.x, tile.y);
        if (tile.type === 'hazard') {
          this.renderer.ctx.save();
          this.renderer.ctx.globalAlpha = 0.4;
          this.renderer.ctx.fillStyle = this.currentRegion.hazardType === 'poison' ? '#2a4a2a' :
            this.currentRegion.hazardType === 'fire' ? '#4a2a1a' :
            this.currentRegion.hazardType === 'ice' ? '#3a4a5a' : '#2a2a2a';
          this.renderer.ctx.fillRect(tile.x, tile.y, T, 10);
          this.renderer.ctx.restore();
        }
      }
    }
  }

  private renderDecorations(): void {
    const flower = this.environmentSprites.get('gravebloom');
    const bloomstone = this.environmentSprites.get('bloomstone');
    if (!this.currentRegion) return;
    for (const tile of this.currentRegion.tiles) {
      if (tile.type === 'bloomstone' && bloomstone) {
        this.renderer.ctx.drawImage(bloomstone, tile.x, tile.y);
        this.renderer.ctx.save();
        this.renderer.ctx.globalAlpha = 0.2 + Math.sin(performance.now() * 0.001) * 0.1;
        this.renderer.ctx.fillStyle = Colors.CRIMSON_GLOW;
        this.renderer.ctx.shadowColor = Colors.CRIMSON_GLOW;
        this.renderer.ctx.shadowBlur = 25;
        this.renderer.ctx.beginPath();
        this.renderer.ctx.arc(tile.x + 32, tile.y + 24, 20, 0, Math.PI * 2);
        this.renderer.ctx.fill();
        this.renderer.ctx.shadowBlur = 0;
        this.renderer.ctx.restore();
      }
      if (tile.type === 'boss_gate') {
        this.renderer.ctx.save();
        this.renderer.ctx.strokeStyle = Colors.CRIMSON_DIM;
        this.renderer.ctx.lineWidth = 3;
        this.renderer.ctx.shadowColor = Colors.CRIMSON;
        this.renderer.ctx.shadowBlur = 10;
        this.renderer.ctx.strokeRect(tile.x, tile.y, 64, 64);
        this.renderer.ctx.shadowBlur = 0;
        this.renderer.ctx.restore();
      }
    }
    // Gravebloom flowers scattered
    if (flower) {
      const positions = [
        { x: 350, y: 292 }, { x: 500, y: 292 }, { x: 750, y: 292 },
        { x: 900, y: 292 }, { x: 1100, y: 292 },
      ];
      for (const pos of positions) {
        this.renderer.ctx.drawImage(flower, pos.x, pos.y);
        this.renderer.ctx.save();
        this.renderer.ctx.globalAlpha = 0.15 + Math.sin(performance.now() * 0.002 + pos.x) * 0.05;
        this.renderer.ctx.fillStyle = Colors.CRIMSON_GLOW;
        this.renderer.ctx.shadowColor = Colors.CRIMSON_GLOW;
        this.renderer.ctx.shadowBlur = 15;
        this.renderer.ctx.beginPath();
        this.renderer.ctx.arc(pos.x + 8, pos.y + 6, 12, 0, Math.PI * 2);
        this.renderer.ctx.fill();
        this.renderer.ctx.shadowBlur = 0;
        this.renderer.ctx.restore();
      }
    }
  }

  private renderEnemyHealthBar(entity: Entity): void {
    const health = getComponent<HealthComponent>(entity, 'health')!;
    const transform = getComponent<TransformComponent>(entity, 'transform')!;
    if (health.current >= health.max) return;
    const screenPos = this.camera.worldToScreen(transform.position);
    const barW = 40, barH = 4;
    const barX = screenPos.x - barW / 2, barY = screenPos.y - 70;
    this.renderer.ctx.fillStyle = 'rgba(0,0,0,0.5)'; this.renderer.ctx.fillRect(barX, barY, barW, barH);
    this.renderer.ctx.fillStyle = Colors.CRIMSON; this.renderer.ctx.fillRect(barX, barY, (health.current / health.max) * barW, barH);
    this.renderer.ctx.strokeStyle = 'rgba(255,255,255,0.2)'; this.renderer.ctx.lineWidth = 0.5; this.renderer.ctx.strokeRect(barX, barY, barW, barH);
  }

  private renderPauseOverlay(): void {
    const W = this.renderer.w, H = this.renderer.h;
    this.renderer.ctx.fillStyle = 'rgba(10,10,10,0.7)'; this.renderer.ctx.fillRect(0, 0, W, H);
    this.renderer.drawText('PAUSED', W / 2, H / 2 - 40, { color: Colors.BONE_WHITE, font: '24px "Courier New", monospace', align: 'center', shadow: { color: Colors.CRIMSON, blur: 10, offsetX: 0, offsetY: 0 } });
    this.renderer.drawText('[ESC] Resume  [ENTER] Quit to Title', W / 2, H / 2 + 10, { color: 'rgba(212,207,196,0.5)', font: '11px "Courier New", monospace', align: 'center' });
  }

  private renderSettings(): void {
    const ctx = this.renderer.ctx;
    const W = this.renderer.w, H = this.renderer.h;
    ctx.fillStyle = Colors.BLACK; ctx.fillRect(0, 0, W, H);
    this.renderer.drawVignette(0.6);
    this.renderer.drawText('SETTINGS', W / 2, 30, { color: Colors.BONE_WHITE, font: '18px "Courier New", monospace', align: 'center' });

    const tabs = ['Accessibility', 'Video', 'Audio', 'Controls'];
    for (let i = 0; i < tabs.length; i++) {
      const sel = i === this.settingsTab;
      this.renderer.drawText(tabs[i], 60 + i * 120, 60, { color: sel ? Colors.CRIMSON_GLOW : 'rgba(212,207,196,0.4)', font: '11px "Courier New", monospace' });
    }

    const acc = this.settingsManager.getAccessibility();
    const video = this.settingsManager.getVideo();
    const audio = this.settingsManager.getAudio();
    const controls = this.settingsManager.get().controls;
    const tab = ['accessibility', 'video', 'audio', 'controls'][this.settingsTab];
    const items = tab === 'accessibility' ? [
      `Extended Parry Window: ${acc.extendedParryWindow ? 'ON' : 'OFF'}`,
      `Extended I-Frames: ${acc.extendedIFrameWindow ? 'ON' : 'OFF'}`,
      `Unlimited Stamina: ${acc.unlimitedStamina ? 'ON' : 'OFF'}`,
      `Reduce Flashing: ${acc.flashingLightsReduction ? 'ON' : 'OFF'}`,
      `Reduce Screen Shake: ${acc.screenShakeReduction > 0 ? 'ON' : 'OFF'}`,
      `Colorblind Mode: ${acc.colorblindMode}`,
    ] : tab === 'video' ? [
      `Screen Shake: ${video.screenShakeToggle ? 'ON' : 'OFF'}`,
      `Motion Blur: ${video.motionBlurToggle ? 'ON' : 'OFF'}`,
      `Brightness: ${video.brightness.toFixed(1)}`,
      `Gamma: ${video.gamma.toFixed(1)}`,
    ] : tab === 'audio' ? [
      `Master Volume: ${Math.round(audio.masterVolume * 100)}%`,
      `Music Volume: ${Math.round(audio.musicVolume * 100)}%`,
      `SFX Volume: ${Math.round(audio.sfxVolume * 100)}%`,
      `Ambience Volume: ${Math.round(audio.ambienceVolume * 100)}%`,
    ] : [
      `Stick Deadzone: ${controls.stickDeadzone.toFixed(1)}`,
      `Prompt Style: ${controls.promptStyle}`,
      `Mouse Sensitivity: ${controls.mouseSensitivity.toFixed(2)}`,
    ];
    for (let i = 0; i < items.length; i++) {
      const sel = i === this.settingsSelection;
      if (sel) { ctx.fillStyle = 'rgba(139,26,26,0.1)'; ctx.fillRect(55, 88 + i * 24, 400, 22); }
      this.renderer.drawText(sel ? '▸ ' + items[i] : '  ' + items[i], 60, 92 + i * 24, { color: sel ? Colors.CRIMSON_GLOW : Colors.BONE_WHITE, font: '11px "Courier New", monospace' });
    }
    this.renderer.drawText('[←→] Tab  [↑↓] Select  [ENTER] Toggle  [ESC] Back', W / 2, H - 25, { color: 'rgba(212,207,196,0.3)', font: '9px "Courier New", monospace', align: 'center' });
  }

  private renderDialogue(): void {
    const ctx = this.renderer.ctx;
    const W = this.renderer.w, H = this.renderer.h;
    const line = this.dialogueManager.getCurrentLine();
    if (!line) return;

    const boxH = 100;
    const boxY = H - boxH - 20;
    ctx.fillStyle = 'rgba(10,10,10,0.85)';
    ctx.fillRect(40, boxY, W - 80, boxH);
    ctx.strokeStyle = Colors.CRIMSON_DIM;
    ctx.lineWidth = 1;
    ctx.strokeRect(40, boxY, W - 80, boxH);

    this.renderer.drawText(line.speaker, 60, boxY + 12, {
      color: Colors.CRIMSON_GLOW, font: '12px "Courier New", monospace',
      shadow: { color: Colors.CRIMSON, blur: 4, offsetX: 0, offsetY: 0 },
    });
    this.renderer.drawText(line.text, 60, boxY + 32, {
      color: Colors.BONE_WHITE, font: '11px "Courier New", monospace', maxWidth: W - 140,
    });
    this.renderer.drawText('[ENTER] Continue', W - 120, boxY + boxH - 18, {
      color: 'rgba(212,207,196,0.3)', font: '9px "Courier New", monospace',
    });
  }

  // ═══════════════════════════════════════════════���═══════════════
  // GAME MANAGEMENT
  // ════════════════════════════════════════���═════════════���════════

  private loadGameplay(): void {
    if (!this.currentSave) return;

    // Load region
    this.currentRegion = ALL_REGIONS[this.currentSave.position.region] ?? ALL_REGIONS.ashenCoast;
    this.mapSystem.discoverRegion(this.currentRegion.id);

    // Create player
    this.player = this.createPlayer(this.currentSave);
    this.playerController = new PlayerController(
      this.player,
      this.input,
      this.audio,
      this.particles,
      () => this.settingsManager.getAccessibility(),
    );
    this.playerController.setAsh(this.currentSave.ash);
    const equippedWeapon = this.currentSave.inventory[0];
    if (equippedWeapon) this.playerController.setWeapon(equippedWeapon);
    this.weaponUpgradeLevels = { ...this.currentSave.weaponLevels };
    this.weaponArtAssignments = { ...this.currentSave.weaponArts };
    for (const [weaponId, artId] of Object.entries(this.weaponArtAssignments)) {
      this.emberArtSystem.assignArt(weaponId, artId);
    }
    this.cindersmithing.loadMaterials(this.currentSave.materials);
    this.bossDefeated = new Set(this.currentSave.bossesDefeated);
    this.lastBloomstone = this.currentSave.lastBloomstone;
    if (this.currentSave.discoveredRegions.length) {
      this.mapSystem.loadState({
        discoveredRegions: this.currentSave.discoveredRegions,
        discoveredPins: this.currentSave.discoveredPins,
        visitedPins: this.currentSave.visitedPins,
      });
    }
    this.mapSystem.setBloomstonesDiscovered(this.currentSave.bloomstonesDiscovered);

    // Create enemies from region data
    this.enemies = [];
    if (this.currentRegion) {
      for (const enemyDef of this.currentRegion.enemies) {
        const data = ENEMIES[enemyDef.type] ?? ENEMIES.hollowed_wretch;
        const entity = createEntity(['enemy', data.tier === 'elite' ? 'elite' : 'fodder']);
        addComponent(entity, createTransform(Vec2.of(enemyDef.x, enemyDef.y)));
        addComponent(entity, createVelocity(data.tier === 'elite' ? 80 : 100, 10));
        addComponent(entity, createCollider(data.tier === 'elite' ? 32 : 24, data.tier === 'elite' ? 56 : 48, 2, 0b11101));
        addComponent(entity, createHealth(data.baseHP));
        addComponent(entity, createPoise(data.poise));
        addComponent(entity, createCombatState());
        addComponent(entity, createSprite('wretch', data.tier === 'elite' ? 48 : 40, data.tier === 'elite' ? 64 : 56));
        addComponent(entity, createAI(data.aggroRange, data.attackRange, data.telegraphDuration));
        addComponent(entity, createFaction('enemy'));
        addComponent(entity, createLoot(data.ashReward));
        addComponent(entity, createName(data.name, data.epithet));
        this.enemyAI.register(entity);
        this.enemies.push(entity);
      }
    }

    // Create boss for this region
    this.createRegionBoss();

    // Set targets
    this.enemyAI.setPlayer(this.player);

    // All entities
    this.allEntities = [this.player, ...this.enemies];
    if (this.bossController) this.allEntities.push((this.bossController as any).entity);
    if (this.cinderChoir) this.allEntities.push(...this.cinderChoir.sisters);
    if (this.rootMother) this.allEntities.push(this.rootMother.entity);
    if (this.vaelith) this.allEntities.push(this.vaelith.entity);
    if (this.frostWidow) this.allEntities.push(this.frostWidow.entity);
    if (this.hollowKing) this.allEntities.push(this.hollowKing.entity);
    if (this.unspokenTwin) this.allEntities.push(this.unspokenTwin.entity);
    if (this.uniqueBossController) this.allEntities.push(this.uniqueBossController.entity);

    // Camera
    const playerTransform = getComponent<TransformComponent>(this.player, 'transform')!;
    this.camera.position = playerTransform.position;

    // Region banner
    if (this.currentRegion) {
      this.hudRenderer.showBossBanner(this.currentRegion.name, this.currentRegion.subtitle, 3);
    }

    // Music
    this.musicSystem.setRegion('exploration');

    this.currentScene = 'gameplay';
    this.sceneTransitionTimer = 0;
    this.playTime = this.currentSave.playTime;
  }

  private createRegionBoss(): void {
    if (!this.currentRegion?.bossId) return;
    const bossId = this.currentRegion.bossId;
    if (this.bossDefeated.has(bossId)) return;

    switch (bossId) {
      case 'ser_ashgrave': {
        const entity = createEntity(['boss', 'enemy', 'ashgrave']);
        addComponent(entity, createTransform(this.currentRegion.bossPosition!));
        addComponent(entity, createVelocity(80, 8));
        addComponent(entity, createCollider(60, 80, 2, 0b11101));
        addComponent(entity, createHealth(ENEMIES.ser_ashgrave.baseHP));
        addComponent(entity, createPoise(ENEMIES.ser_ashgrave.poise));
        addComponent(entity, createCombatState());
        addComponent(entity, createSprite('ashgrave', 80, 96));
        addComponent(entity, createFaction('enemy'));
        addComponent(entity, createLoot(ENEMIES.ser_ashgrave.ashReward));
        addComponent(entity, createName('Ser Ashgrave', 'The Herald Undone'));
        this.bossController = new BossController(entity, this.particles, this.audio);
        this.bossController.activate();
        break;
      }
      case 'cinder_choir':
        this.cinderChoir = createCinderChoir(this.particles, this.audio);
        break;
      case 'root_mother':
        this.rootMother = createRootMother(this.particles);
        break;
      case 'vaelith':
        this.vaelith = createVaelith(this.particles);
        break;
      case 'frost_widow':
        this.frostWidow = createFrostWidow(this.particles);
        break;
      case 'hollow_king':
        this.hollowKing = createHollowKing(this.particles);
        break;
      case 'unspoken_twin':
        this.unspokenTwin = createUnspokenTwin(this.particles);
        break;
      case 'bloomwarden':
      case 'sir_corvain': {
        const isCorvain = bossId === 'sir_corvain';
        const data = isCorvain ? ENEMIES.ashguard_sentinel : ENEMIES.ser_ashgrave;
        const entity = createEntity(['boss', 'enemy', bossId]);
        addComponent(entity, createTransform(this.currentRegion.bossPosition!));
        addComponent(entity, createVelocity(isCorvain ? 65 : 45, 8));
        addComponent(entity, createCollider(isCorvain ? 46 : 62, isCorvain ? 68 : 88, 2, 0b11101));
        addComponent(entity, createHealth(isCorvain ? 900 : 1400));
        addComponent(entity, createPoise(isCorvain ? 75 : 90));
        addComponent(entity, createCombatState());
        addComponent(entity, createSprite(isCorvain ? 'wretch' : 'ashgrave', isCorvain ? 60 : 82, isCorvain ? 80 : 100));
        addComponent(entity, createFaction('enemy'));
        addComponent(entity, createLoot(data.ashReward));
        addComponent(entity, createName(isCorvain ? 'Sir Corvain' : 'The Bloomwarden', isCorvain ? 'The Last Vigil' : 'Queen of Roots'));
        this.uniqueBossController = new UniqueBossController(entity, this.particles, this.audio, bossId as UniqueBossId);
        this.uniqueBossController.activate();
        break;
      }
    }
  }

  private createPlayer(save: SaveData): Entity {
    const attrs = save.attributes;
    const entity = createEntity(['player']);
    addComponent(entity, createTransform(Vec2.of(save.position.x, save.position.y)));
    addComponent(entity, createVelocity(200, 12));
    addComponent(entity, createCollider(28, 56, 1, 0b11110));
    addComponent(entity, createHealth(deriveMaxHP(attrs.vigor), 0.8));
    addComponent(entity, createStamina(deriveMaxStamina(attrs.endurance)));
    addComponent(entity, createEmber(deriveMaxEmber(attrs.ashAffinity)));
    addComponent(entity, createPoise(50));
    addComponent(entity, createCombatState());
    addComponent(entity, createSprite('player', 48, 64));
    addComponent(entity, createFaction('player'));
    return entity;
  }

  private saveCurrentGame(): void {
    if (!this.currentSave || !this.player) return;
    const transform = getComponent<TransformComponent>(this.player, 'transform')!;
    this.currentSave.position = { region: this.currentRegion?.id ?? 'ashenCoast', x: transform.position.x, y: transform.position.y };
    this.currentSave.playTime = this.playTime;
    this.currentSave.ash = this.playerController?.getState().ash ?? this.currentSave.ash;
    this.currentSave.bossesDefeated = [...this.bossDefeated];
    this.currentSave.lastBloomstone = this.lastBloomstone;
    this.currentSave.materials = this.cindersmithing.exportMaterials();
    this.currentSave.weaponLevels = { ...this.weaponUpgradeLevels };
    this.currentSave.weaponArts = { ...this.weaponArtAssignments };
    const mapState = this.mapSystem.exportState();
    this.currentSave.discoveredRegions = mapState.discoveredRegions;
    this.currentSave.discoveredPins = mapState.discoveredPins;
    this.currentSave.visitedPins = mapState.visitedPins;
    this.saveManager.saveToSlot(this.currentSaveSlot, this.currentSave);
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────
inject();

const game = new Gravebloom();
game.start();
