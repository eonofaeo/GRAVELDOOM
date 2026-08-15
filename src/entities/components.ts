import { Vec2, AABB } from '../engine/math.js';

/**
 * Entity Component System — lightweight for this scope.
 * Entities are plain objects with typed component maps.
 */

export type EntityId = number;

let nextId = 1;

export interface Entity {
  id: EntityId;
  tags: Set<string>;
  components: Map<string, Component>;
  active: boolean;
}

export interface Component {
  type: string;
}

export function createEntity(tags: string[] = []): Entity {
  return {
    id: nextId++,
    tags: new Set(tags),
    components: new Map(),
    active: true,
  };
}

export function addComponent<T extends Component>(entity: Entity, component: T): T {
  entity.components.set(component.type, component);
  return component;
}

export function getComponent<T extends Component>(entity: Entity, type: string): T | undefined {
  return entity.components.get(type) as T | undefined;
}

export function removeComponent(entity: Entity, type: string): void {
  entity.components.delete(type);
}

export function hasComponent(entity: Entity, type: string): boolean {
  return entity.components.has(type);
}

// ─── Standard Components ─────────────────────────────────────────

export interface TransformComponent extends Component {
  type: 'transform';
  position: Vec2;
  previousPosition: Vec2;
  scale: Vec2;
  rotation: number;
  facing: number; // 1 = right, -1 = left
}

export interface VelocityComponent extends Component {
  type: 'velocity';
  velocity: Vec2;
  maxSpeed: number;
  friction: number;
}

export interface ColliderComponent extends Component {
  type: 'collider';
  bounds: AABB;        // relative to transform
  layer: number;
  mask: number;
  isTrigger: boolean;
  isStatic: boolean;
}

export interface HealthComponent extends Component {
  type: 'health';
  current: number;
  max: number;
  invulnTimer: number;
  invulnDuration: number;
}

export interface StaminaComponent extends Component {
  type: 'stamina';
  current: number;
  max: number;
  regenRate: number;      // per second
  regenDelay: number;     // seconds after use before regen starts
  regenTimer: number;
  isExhausted: boolean;
  exhaustionPenalty: number; // multiplier on regen when exhausted
}

export interface EmberComponent extends Component {
  type: 'ember';
  current: number;
  max: number;
  regenRate: number;
}

export interface PoiseComponent extends Component {
  type: 'poise';
  current: number;
  max: number;
  regenRate: number;
  staggerTimer: number;
  staggerDuration: number;
  isStaggered: boolean;
}

export interface CombatStateComponent extends Component {
  type: 'combatState';
  state: 'idle' | 'windup' | 'active' | 'recovery' | 'staggered' | 'rolling' | 'parrying' | 'hurt' | 'dead';
  attackIndex: number;      // for chain attacks
  chainWindow: number;      // time remaining to chain next attack
  stateTimer: number;       // time in current state
  attackDirection: number;  // angle of attack
  parryWindow: number;      // active parry frames remaining
  iFrames: number;          // invincibility frames remaining
  isAttacking: boolean;
  canAct: boolean;
}

export interface SpriteComponent extends Component {
  type: 'sprite';
  sheetKey: string;
  currentAnim: string;
  frame: number;
  frameTimer: number;
  fps: number;
  flipX: boolean;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  visible: boolean;
  flashTimer: number;
  flashColor: string;
}

export interface AIBrainComponent extends Component {
  type: 'ai';
  state: 'idle' | 'patrol' | 'chase' | 'attack' | 'recover' | 'staggered' | 'dead';
  target: EntityId | null;
  aggroRange: number;
  attackRange: number;
  patrolTarget: Vec2 | null;
  patrolTimer: number;
  thinkTimer: number;
  attackCooldown: number;
  telegraphDuration: number;
}

export interface FactionComponent extends Component {
  type: 'faction';
  faction: 'player' | 'enemy' | 'neutral';
}

export interface LootComponent extends Component {
  type: 'loot';
  ashDrop: number;
  items: string[];
}

export interface NameComponent extends Component {
  type: 'name';
  displayName: string;
  epithet: string;
}

// ─── Component Factories ─────────────────────────────────────────

export function createTransform(pos: Vec2): TransformComponent {
  return { type: 'transform', position: pos, previousPosition: pos, scale: Vec2.of(1, 1), rotation: 0, facing: 1 };
}

export function createVelocity(maxSpeed: number, friction = 10): VelocityComponent {
  return { type: 'velocity', velocity: Vec2.ZERO, maxSpeed, friction };
}

export function createCollider(width: number, height: number, layer: number, mask: number, offsetX = 0, offsetY = 0): ColliderComponent {
  return {
    type: 'collider',
    bounds: new AABB(Vec2.of(offsetX, offsetY), Vec2.of(offsetX + width, offsetY + height)),
    layer, mask, isTrigger: false, isStatic: false,
  };
}

export function createHealth(maxHP: number, invulnDuration = 0.5): HealthComponent {
  return { type: 'health', current: maxHP, max: maxHP, invulnTimer: 0, invulnDuration };
}

export function createStamina(maxStamina: number): StaminaComponent {
  return {
    type: 'stamina', current: maxStamina, max: maxStamina,
    regenRate: 30, regenDelay: 1.0, regenTimer: 0,
    isExhausted: false, exhaustionPenalty: 0.5,
  };
}

export function createEmber(maxEmber: number): EmberComponent {
  return { type: 'ember', current: maxEmber, max: maxEmber, regenRate: 2 };
}

export function createPoise(maxPoise: number): PoiseComponent {
  return {
    type: 'poise', current: maxPoise, max: maxPoise,
    regenRate: 10, staggerTimer: 0, staggerDuration: 0.8, isStaggered: false,
  };
}

export function createCombatState(): CombatStateComponent {
  return {
    type: 'combatState', state: 'idle', attackIndex: 0, chainWindow: 0,
    stateTimer: 0, attackDirection: 0, parryWindow: 0, iFrames: 0,
    isAttacking: false, canAct: true,
  };
}

export function createSprite(sheetKey: string, width: number, height: number): SpriteComponent {
  return {
    type: 'sprite', sheetKey, currentAnim: 'idle', frame: 0, frameTimer: 0, fps: 12,
    flipX: false, offsetX: -width / 2, offsetY: -height, width, height, visible: true,
    flashTimer: 0, flashColor: '#fff',
  };
}

export function createAI(aggroRange: number, attackRange: number, telegraphDuration: number): AIBrainComponent {
  return {
    type: 'ai', state: 'idle', target: null, aggroRange, attackRange,
    patrolTarget: null, patrolTimer: 0, thinkTimer: 0, attackCooldown: 0,
    telegraphDuration,
  };
}

export function createFaction(faction: 'player' | 'enemy' | 'neutral'): FactionComponent {
  return { type: 'faction', faction };
}

export function createLoot(ashDrop: number, items: string[] = []): LootComponent {
  return { type: 'loot', ashDrop, items };
}

export function createName(displayName: string, epithet: string): NameComponent {
  return { type: 'name', displayName, epithet };
}
