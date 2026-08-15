/** Input Manager — keyboard + gamepad, frame-buffered */
export enum InputAction {
  MoveLeft = 'moveLeft',
  MoveRight = 'moveRight',
  MoveUp = 'moveUp',
  MoveDown = 'moveDown',
  Jump = 'jump',
  LightAttack = 'lightAttack',
  HeavyAttack = 'heavyAttack',
  Roll = 'roll',
  Parry = 'parry',
  Interact = 'interact',
  UseItem = 'useItem',
  Pause = 'pause',
  EmberArt = 'emberArt',
}

const KEYBOARD_MAP: Record<string, InputAction> = {
  'KeyA': InputAction.MoveLeft,
  'ArrowLeft': InputAction.MoveLeft,
  'KeyD': InputAction.MoveRight,
  'ArrowRight': InputAction.MoveRight,
  'KeyW': InputAction.MoveUp,
  'ArrowUp': InputAction.MoveUp,
  'KeyS': InputAction.MoveDown,
  'ArrowDown': InputAction.MoveDown,
  'Space': InputAction.Jump,
  'KeyJ': InputAction.LightAttack,
  'KeyK': InputAction.HeavyAttack,
  'ShiftLeft': InputAction.Roll,
  'ShiftRight': InputAction.Roll,
  'KeyL': InputAction.Parry,
  'KeyE': InputAction.Interact,
  'KeyQ': InputAction.UseItem,
  'Escape': InputAction.Pause,
  'KeyR': InputAction.EmberArt,
};

export class InputManager {
  private keysDown = new Set<string>();
  private actionsDown = new Set<InputAction>();
  private actionsPressed = new Set<InputAction>();  // just this frame
  private actionsReleased = new Set<InputAction>();  // just this frame
  private gamepadIndex: number | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleGamepadConnected = this.handleGamepadConnected.bind(this);
    this.handleGamepadDisconnected = this.handleGamepadDisconnected.bind(this);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Prevent default for game keys
    if (e.code in KEYBOARD_MAP) {
      e.preventDefault();
    }
    if (this.keysDown.has(e.code)) return; // ignore repeat
    this.keysDown.add(e.code);
    const action = KEYBOARD_MAP[e.code];
    if (action) {
      this.actionsDown.add(action);
      this.actionsPressed.add(action);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code);
    const action = KEYBOARD_MAP[e.code];
    if (action) {
      this.actionsDown.delete(action);
      this.actionsReleased.add(action);
    }
  }

  private handleGamepadConnected(e: GamepadEvent): void {
    this.gamepadIndex = e.gamepad.index;
  }

  private handleGamepadDisconnected(): void {
    this.gamepadIndex = null;
  }

  /** Call at end of each frame to clear pressed/released buffers */
  endFrame(): void {
    this.actionsPressed.clear();
    this.actionsReleased.clear();
  }

  /** Is action currently held? */
  isDown(action: InputAction): boolean {
    return this.actionsDown.has(action);
  }

  /** Was action pressed THIS frame? */
  isPressed(action: InputAction): boolean {
    return this.actionsPressed.has(action);
  }

  /** Was action released THIS frame? */
  isReleased(action: InputAction): boolean {
    return this.actionsReleased.has(action);
  }

  /** Get normalized movement vector from directional inputs */
  getMovement(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.isDown(InputAction.MoveLeft)) x -= 1;
    if (this.isDown(InputAction.MoveRight)) x += 1;
    if (this.isDown(InputAction.MoveUp)) y -= 1;
    if (this.isDown(InputAction.MoveDown)) y += 1;
    // Normalize diagonal
    const len = Math.sqrt(x * x + y * y);
    if (len > 0) { x /= len; y /= len; }
    return { x, y };
  }

  /** Poll gamepad state (call each frame) */
  pollGamepad(): void {
    if (this.gamepadIndex === null) return;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return;
    // Left stick as movement
    const deadzone = 0.2;
    const lx = Math.abs(gp.axes[0]) > deadzone ? gp.axes[0] : 0;
    const ly = Math.abs(gp.axes[1]) > deadzone ? gp.axes[1] : 0;
    // Map to digital actions
    if (lx < -0.5) { this.actionsDown.add(InputAction.MoveLeft); }
    else { this.actionsDown.delete(InputAction.MoveLeft); }
    if (lx > 0.5) { this.actionsDown.add(InputAction.MoveRight); }
    else { this.actionsDown.delete(InputAction.MoveRight); }
    if (ly < -0.5) { this.actionsDown.add(InputAction.MoveUp); }
    else { this.actionsDown.delete(InputAction.MoveUp); }
    if (ly > 0.5) { this.actionsDown.add(InputAction.MoveDown); }
    else { this.actionsDown.delete(InputAction.MoveDown); }
    // Face buttons
    const buttonMap: [number, InputAction][] = [
      [0, InputAction.Roll],      // A
      [1, InputAction.LightAttack], // B
      [2, InputAction.HeavyAttack], // X
      [3, InputAction.Parry],      // Y
      [7, InputAction.EmberArt],   // R2
      [9, InputAction.Pause],      // Start
    ];
    for (const [btn, action] of buttonMap) {
      if (gp.buttons[btn]?.pressed) {
        if (!this.actionsDown.has(action)) {
          this.actionsPressed.add(action);
        }
        this.actionsDown.add(action);
      } else {
        if (this.actionsDown.has(action)) {
          this.actionsReleased.add(action);
        }
        this.actionsDown.delete(action);
      }
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
  }
}
