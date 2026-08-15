# GRAVEBLOOM — A Requiem in Ash and Crimson

A 2D dark-fantasy action-RPG (Souls-like) built with TypeScript + Canvas2D.

## Quick Start

```bash
npm install
npm run dev        # → http://localhost:3000
npm run build      # → dist/
```

## Controls

| Action | Keyboard | Gamepad |
|--------|----------|---------|
| Move | WASD / Arrow Keys | Left Stick |
| Light Attack | J | B |
| Heavy Attack | K | X |
| Roll/Dodge | Shift | A |
| Parry | L | Y |
| Ember Art | R | R2 |
| Interact | E | — |
| Pause | Escape | Start |

## Architecture

```
src/
  engine/         Core systems (loop, renderer, input, physics, particles, audio, sprites)
  entities/       Entity-Component System
  systems/        Gameplay systems (player controller, enemy AI, rendering, save)
  data/           Game data (stats, weapons, origins, enemies)
  main.ts         Entry point — scene management and game bootstrap
```

## What's Implemented

### Phase 0 — Core Loop ✅
- Fixed-timestep game loop (60 FPS) with interpolation
- Canvas2D renderer with camera system (follow, shake, zoom)
- Input manager (keyboard + gamepad)
- AABB collision detection and resolution
- Particle system with presets (ash, ember, hit sparks, death dissolve)

### Phase 1 — Vertical Slice ✅
- **Player**: Full combat state machine (idle → windup → active → recovery)
  - 3-hit chain attacks with timing windows
  - Roll with i-frames (frames 3-7 per spec)
  - Parry with active window + riposte reward
  - Stamina-gated actions with exhaustion penalty
  - Health, Ember, Poise systems
  - Death → respawn at Bloomstone with ash loss

- **Enemies**: AI state machine (idle → chase → attack → recover)
  - Attack telegraphs with warning flash
  - Poise damage and stagger
  - Loot drops (ash currency)
  - Fodder (Hollowed Wretch) and Elite (Ashguard Sentinel)

- **HUD**: Three resource bars (Vigor/Endurance/Ember), ash counter, boss banner, death overlay

- **Screens**: Title menu, Vigil select (3 save slots), Character creation (7 origins), Pause menu

- **Audio**: Web Audio API synthesized SFX (weapon impacts, parry, roll, hurt, death, UI)

- **Save System**: localStorage-based, 3 Vigil slots, auto-save, JSON export/import

- **Visuals**: Procedural sprite generation, particle effects, parallax backgrounds, vignette, damage flash

### Design Spec Compliance
- Frame data matches §9.2 (roll i-frames, attack durations, parry windows)
- Stamina formula: `80 + endurance * 5`
- Level-up cost: `100 × level^1.5`
- All 7 origins from §4.1
- Weapon classes with scaling grades
- Death screen: "FADED TO ASH" with flavor text pool
- Boss banner with ornate crimson-gold frame
- Bloomstone checkpoint system
- Ash death-drop mechanic (lose 50% on death)

## Current Status

### Implemented
- Ser Ashgrave multi-phase boss fight
- Dedicated two-phase Sir Corvain and Bloomwarden encounters with unique attack sets
- Cindersmithing materials, recipes, shop, upgrade UI, and save persistence
- Gravebloom Marsh and the connected region data set
- Ember Arts, Hex casting, NPC dialogue, progressive map reveal, and Bloomstone fast travel
- Versioned save migration, remembered Bloomstone respawns, defeated-boss persistence
- Accessibility toggles for stamina, parry timing, i-frames, damage, and screen shake
- PWA manifest, service-worker registration, and install icons

### Remaining production work
- Add broader browser/gamepad playtesting and final balance tuning
- Replace procedural sprites with final painted assets