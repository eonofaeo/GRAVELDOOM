/**
 * Input Manager — keyboard, gamepad, mouse, and full mobile touch controls
 * Frame-buffered with virtual analog joystick and tactile action buttons.
 */

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
  MapToggle = 'mapToggle',
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
  'KeyM': InputAction.MapToggle,
  'Tab': InputAction.MapToggle,
};

export interface TouchButtonDef {
  id: string;
  action: InputAction;
  label: string;
  sublabel?: string;
  icon?: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  isPressed: boolean;
}

export interface PointerState {
  x: number;
  y: number;
  isDown: boolean;
  justPressed: boolean;
  justReleased: boolean;
}

export class InputManager {
  private keysDown = new Set<string>();
  private actionsDown = new Set<InputAction>();
  private actionsPressed = new Set<InputAction>();
  private actionsReleased = new Set<InputAction>();
  private gamepadIndex: number | null = null;

  // Pointer & Touch State
  private pointer: PointerState = { x: 0, y: 0, isDown: false, justPressed: false, justReleased: false };
  private touchActive = false;
  private isTouchDevice = false;

  // Virtual Joystick State
  public joystick = {
    active: false,
    touchId: null as number | null,
    baseX: 110,
    baseY: 420,
    currX: 110,
    currY: 420,
    radius: 55,
    knobRadius: 24,
    vector: { x: 0, y: 0 },
  };

  // Virtual Buttons List
  public touchButtons: TouchButtonDef[] = [];
  private activeTouchMap = new Map<number, string>(); // touchId -> buttonId or 'joystick'

  constructor(private canvas: HTMLCanvasElement) {
    this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (this.isTouchDevice) {
      this.touchActive = true;
    }

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleGamepadConnected = this.handleGamepadConnected.bind(this);
    this.handleGamepadDisconnected = this.handleGamepadDisconnected.bind(this);

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);

    // Pointer events (mouse & stylus)
    canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    window.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    window.addEventListener('pointerup', this.handlePointerUp, { passive: false });
    window.addEventListener('pointercancel', this.handlePointerUp, { passive: false });

    // Touch events for multi-touch mobile gameplay
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    window.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
  }

  public setTouchActive(active: boolean): void {
    this.touchActive = active;
  }

  public getIsTouchActive(): boolean {
    return this.touchActive || this.isTouchDevice;
  }

  private getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code in KEYBOARD_MAP) {
      e.preventDefault();
    }
    if (this.keysDown.has(e.code)) return;
    this.keysDown.add(e.code);
    const action = KEYBOARD_MAP[e.code];
    if (action) {
      this.triggerActionDown(action);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code);
    const action = KEYBOARD_MAP[e.code];
    if (action) {
      this.triggerActionUp(action);
    }
  }

  private handleGamepadConnected(e: GamepadEvent): void {
    this.gamepadIndex = e.gamepad.index;
  }

  private handleGamepadDisconnected(): void {
    this.gamepadIndex = null;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.pointerType === 'touch') return; // Handled by touch events for multi-touch
    const pos = this.getCanvasCoords(e.clientX, e.clientY);
    this.pointer.x = pos.x;
    this.pointer.y = pos.y;
    this.pointer.isDown = true;
    this.pointer.justPressed = true;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    const pos = this.getCanvasCoords(e.clientX, e.clientY);
    this.pointer.x = pos.x;
    this.pointer.y = pos.y;
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.pointerType === 'touch') return;
    this.pointer.isDown = false;
    this.pointer.justReleased = true;
  }

  // ─── Multi-touch mobile input ─────────────────────────────────

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.touchActive = true;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const pos = this.getCanvasCoords(touch.clientX, touch.clientY);

      // Record primary pointer click for UI menus
      this.pointer.x = pos.x;
      this.pointer.y = pos.y;
      this.pointer.isDown = true;
      this.pointer.justPressed = true;

      // Check on-screen buttons
      let buttonHit = false;
      for (const btn of this.touchButtons) {
        const dx = pos.x - btn.x;
        const dy = pos.y - btn.y;
        if (dx * dx + dy * dy <= (btn.radius * 1.3) * (btn.radius * 1.3)) {
          btn.isPressed = true;
          this.activeTouchMap.set(touch.identifier, btn.id);
          this.triggerActionDown(btn.action);
          buttonHit = true;
          break;
        }
      }

      // Check virtual joystick area (left half of screen or bottom-left)
      if (!buttonHit && pos.x < this.canvas.width * 0.45 && pos.y > this.canvas.height * 0.3) {
        this.joystick.active = true;
        this.joystick.touchId = touch.identifier;
        this.joystick.baseX = pos.x;
        this.joystick.baseY = pos.y;
        this.joystick.currX = pos.x;
        this.joystick.currY = pos.y;
        this.activeTouchMap.set(touch.identifier, 'joystick');
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const pos = this.getCanvasCoords(touch.clientX, touch.clientY);

      if (this.joystick.active && this.joystick.touchId === touch.identifier) {
        const dx = pos.x - this.joystick.baseX;
        const dy = pos.y - this.joystick.baseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxRadius = this.joystick.radius;

        if (dist > 0) {
          const clampedDist = Math.min(dist, maxRadius);
          const nx = (dx / dist);
          const ny = (dy / dist);
          this.joystick.currX = this.joystick.baseX + nx * clampedDist;
          this.joystick.currY = this.joystick.baseY + ny * clampedDist;
          this.joystick.vector = {
            x: nx * (clampedDist / maxRadius),
            y: ny * (clampedDist / maxRadius),
          };
        } else {
          this.joystick.currX = this.joystick.baseX;
          this.joystick.currY = this.joystick.baseY;
          this.joystick.vector = { x: 0, y: 0 };
        }

        // Map joystick vector to digital actions
        if (this.joystick.vector.x < -0.3) this.triggerActionDown(InputAction.MoveLeft);
        else this.triggerActionUp(InputAction.MoveLeft);

        if (this.joystick.vector.x > 0.3) this.triggerActionDown(InputAction.MoveRight);
        else this.triggerActionUp(InputAction.MoveRight);

        if (this.joystick.vector.y < -0.4) this.triggerActionDown(InputAction.MoveUp);
        else this.triggerActionUp(InputAction.MoveUp);

        if (this.joystick.vector.y > 0.4) this.triggerActionDown(InputAction.MoveDown);
        else this.triggerActionUp(InputAction.MoveDown);
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const target = this.activeTouchMap.get(touch.identifier);

      if (target === 'joystick') {
        this.joystick.active = false;
        this.joystick.touchId = null;
        this.joystick.currX = this.joystick.baseX;
        this.joystick.currY = this.joystick.baseY;
        this.joystick.vector = { x: 0, y: 0 };
        this.triggerActionUp(InputAction.MoveLeft);
        this.triggerActionUp(InputAction.MoveRight);
        this.triggerActionUp(InputAction.MoveUp);
        this.triggerActionUp(InputAction.MoveDown);
      } else if (target) {
        const btn = this.touchButtons.find(b => b.id === target);
        if (btn) {
          btn.isPressed = false;
          this.triggerActionUp(btn.action);
        }
      }

      this.activeTouchMap.delete(touch.identifier);
    }

    if (e.touches.length === 0) {
      this.pointer.isDown = false;
      this.pointer.justReleased = true;
    }
  }

  public triggerActionDown(action: InputAction): void {
    if (!this.actionsDown.has(action)) {
      this.actionsPressed.add(action);
    }
    this.actionsDown.add(action);
  }

  public triggerActionUp(action: InputAction): void {
    if (this.actionsDown.has(action)) {
      this.actionsReleased.add(action);
    }
    this.actionsDown.delete(action);
  }

  /** Update virtual button layouts dynamically to match canvas size */
  public updateTouchLayout(w: number, h: number): void {
    this.joystick.baseX = Math.max(90, Math.min(130, w * 0.15));
    this.joystick.baseY = h - Math.max(90, Math.min(130, h * 0.25));
    if (!this.joystick.active) {
      this.joystick.currX = this.joystick.baseX;
      this.joystick.currY = this.joystick.baseY;
    }

    const rightClusterX = w - 100;
    const rightClusterY = h - 100;

    this.touchButtons = [
      // ⚔️ Light Attack
      {
        id: 'btn_light',
        action: InputAction.LightAttack,
        label: 'ATTACK',
        sublabel: 'J',
        icon: '⚔️',
        x: rightClusterX - 45,
        y: rightClusterY + 10,
        radius: 32,
        color: '#c42020',
        isPressed: this.isDown(InputAction.LightAttack),
      },
      // 💥 Heavy Attack
      {
        id: 'btn_heavy',
        action: InputAction.HeavyAttack,
        label: 'HEAVY',
        sublabel: 'K',
        icon: '🗡️',
        x: rightClusterX - 105,
        y: rightClusterY - 35,
        radius: 28,
        color: '#8b1a1a',
        isPressed: this.isDown(InputAction.HeavyAttack),
      },
      // 💨 Roll / Dodge
      {
        id: 'btn_roll',
        action: InputAction.Roll,
        label: 'ROLL',
        sublabel: 'SHIFT',
        icon: '💨',
        x: rightClusterX + 25,
        y: rightClusterY + 10,
        radius: 30,
        color: '#d4cfc4',
        isPressed: this.isDown(InputAction.Roll),
      },
      // 🛡️ Parry
      {
        id: 'btn_parry',
        action: InputAction.Parry,
        label: 'PARRY',
        sublabel: 'L',
        icon: '🛡️',
        x: rightClusterX + 25,
        y: rightClusterY - 60,
        radius: 26,
        color: '#c4a84a',
        isPressed: this.isDown(InputAction.Parry),
      },
      // 🔥 Ember Art
      {
        id: 'btn_art',
        action: InputAction.EmberArt,
        label: 'ART',
        sublabel: 'R',
        icon: '🔥',
        x: rightClusterX - 45,
        y: rightClusterY - 70,
        radius: 26,
        color: '#c45a1a',
        isPressed: this.isDown(InputAction.EmberArt),
      },
      // 🧪 Crimson Flask / Heal (Q)
      {
        id: 'btn_flask',
        action: InputAction.UseItem,
        label: 'HEAL',
        sublabel: 'Q',
        icon: '🧪',
        x: rightClusterX - 160,
        y: rightClusterY + 15,
        radius: 26,
        color: '#e63946',
        isPressed: this.isDown(InputAction.UseItem),
      },
      // 💬 Interact (E)
      {
        id: 'btn_interact',
        action: InputAction.Interact,
        label: 'EXAMINE',
        sublabel: 'E',
        icon: '✧',
        x: rightClusterX - 110,
        y: rightClusterY + 30,
        radius: 24,
        color: '#c4a84a',
        isPressed: this.isDown(InputAction.Interact),
      },
      // 🗺️ Map Button (Top-Right)
      {
        id: 'btn_map',
        action: InputAction.MapToggle,
        label: 'MAP',
        sublabel: 'M',
        icon: '🗺️',
        x: w - 50,
        y: 40,
        radius: 22,
        color: '#d4cfc4',
        isPressed: this.isDown(InputAction.MapToggle),
      },
      // ⏸️ Pause Button (Top-Left)
      {
        id: 'btn_pause',
        action: InputAction.Pause,
        label: 'PAUSE',
        sublabel: 'ESC',
        icon: '⏸',
        x: 50,
        y: 40,
        radius: 22,
        color: '#d4cfc4',
        isPressed: this.isDown(InputAction.Pause),
      },
    ];
  }

  /** Call at end of each frame to clear single-frame press/release buffers */
  endFrame(): void {
    this.actionsPressed.clear();
    this.actionsReleased.clear();
    this.pointer.justPressed = false;
    this.pointer.justReleased = false;
  }

  isDown(action: InputAction): boolean {
    return this.actionsDown.has(action);
  }

  isPressed(action: InputAction): boolean {
    return this.actionsPressed.has(action);
  }

  isReleased(action: InputAction): boolean {
    return this.actionsReleased.has(action);
  }

  /** Get movement vector combining keyboard, gamepad, and virtual touch joystick */
  getMovement(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.isDown(InputAction.MoveLeft)) x -= 1;
    if (this.isDown(InputAction.MoveRight)) x += 1;
    if (this.isDown(InputAction.MoveUp)) y -= 1;
    if (this.isDown(InputAction.MoveDown)) y += 1;

    if (this.joystick.active && (this.joystick.vector.x !== 0 || this.joystick.vector.y !== 0)) {
      x = this.joystick.vector.x;
      y = this.joystick.vector.y;
    }

    const len = Math.sqrt(x * x + y * y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Get mouse/touch click position if clicked/tapped this frame */
  getPointerClick(): { x: number; y: number } | null {
    if (this.pointer.justPressed) {
      return { x: this.pointer.x, y: this.pointer.y };
    }
    return null;
  }

  getPointerPos(): { x: number; y: number } {
    return { x: this.pointer.x, y: this.pointer.y };
  }

  isPointerDown(): boolean {
    return this.pointer.isDown;
  }

  /** Poll gamepad state */
  pollGamepad(): void {
    if (this.gamepadIndex === null) return;
    const gp = navigator.getGamepads()[this.gamepadIndex];
    if (!gp) return;

    const deadzone = 0.2;
    const lx = Math.abs(gp.axes[0]) > deadzone ? gp.axes[0] : 0;
    const ly = Math.abs(gp.axes[1]) > deadzone ? gp.axes[1] : 0;

    if (lx < -0.5) this.triggerActionDown(InputAction.MoveLeft);
    else this.triggerActionUp(InputAction.MoveLeft);

    if (lx > 0.5) this.triggerActionDown(InputAction.MoveRight);
    else this.triggerActionUp(InputAction.MoveRight);

    if (ly < -0.5) this.triggerActionDown(InputAction.MoveUp);
    else this.triggerActionUp(InputAction.MoveUp);

    if (ly > 0.5) this.triggerActionDown(InputAction.MoveDown);
    else this.triggerActionUp(InputAction.MoveDown);

    const buttonMap: [number, InputAction][] = [
      [0, InputAction.Roll],        // A
      [1, InputAction.LightAttack], // B
      [2, InputAction.HeavyAttack], // X
      [3, InputAction.Parry],       // Y
      [4, InputAction.UseItem],     // L1 / LB (Heal)
      [5, InputAction.Interact],    // R1 / RB
      [7, InputAction.EmberArt],    // R2 / RT
      [8, InputAction.MapToggle],   // Back/Select
      [9, InputAction.Pause],       // Start
    ];

    for (const [btn, action] of buttonMap) {
      if (gp.buttons[btn]?.pressed) {
        this.triggerActionDown(action);
      } else {
        this.triggerActionUp(action);
      }
    }
  }

  /** Render on-screen mobile controls onto canvas */
  renderTouchControls(ctx: CanvasRenderingContext2D, opacity = 0.75): void {
    if (!this.getIsTouchActive()) return;

    ctx.save();
    ctx.globalAlpha = opacity;

    // 1. Draw Virtual Joystick
    ctx.beginPath();
    ctx.arc(this.joystick.baseX, this.joystick.baseY, this.joystick.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,10,10,0.45)';
    ctx.fill();
    ctx.strokeStyle = this.joystick.active ? '#c42020' : 'rgba(212,207,196,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner guide arrows
    ctx.fillStyle = 'rgba(212,207,196,0.25)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◄', this.joystick.baseX - 35, this.joystick.baseY);
    ctx.fillText('►', this.joystick.baseX + 35, this.joystick.baseY);

    // Joystick Knob
    ctx.beginPath();
    ctx.arc(this.joystick.currX, this.joystick.currY, this.joystick.knobRadius, 0, Math.PI * 2);
    const knobGrad = ctx.createRadialGradient(
      this.joystick.currX, this.joystick.currY, 2,
      this.joystick.currX, this.joystick.currY, this.joystick.knobRadius,
    );
    knobGrad.addColorStop(0, this.joystick.active ? '#e63946' : '#5c1010');
    knobGrad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = knobGrad;
    ctx.fill();
    ctx.strokeStyle = this.joystick.active ? '#c42020' : '#d4cfc4';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 2. Draw Touch Buttons
    for (const btn of this.touchButtons) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, btn.radius, 0, Math.PI * 2);

      const btnGrad = ctx.createRadialGradient(btn.x, btn.y, 2, btn.x, btn.y, btn.radius);
      if (btn.isPressed) {
        btnGrad.addColorStop(0, btn.color);
        btnGrad.addColorStop(1, '#3a1a1a');
        ctx.shadowColor = btn.color;
        ctx.shadowBlur = 15;
      } else {
        btnGrad.addColorStop(0, 'rgba(30,25,25,0.7)');
        btnGrad.addColorStop(1, 'rgba(10,10,10,0.85)');
      }
      ctx.fillStyle = btnGrad;
      ctx.fill();

      ctx.strokeStyle = btn.isPressed ? '#ffffff' : btn.color;
      ctx.lineWidth = btn.isPressed ? 2.5 : 1.5;
      ctx.stroke();

      // Button Label / Icon
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (btn.icon) {
        ctx.font = `${Math.floor(btn.radius * 0.7)}px sans-serif`;
        ctx.fillStyle = btn.isPressed ? '#ffffff' : '#d4cfc4';
        ctx.fillText(btn.icon, btn.x, btn.y - (btn.sublabel ? 4 : 0));
      } else {
        ctx.font = `bold ${Math.floor(btn.radius * 0.4)}px "Courier New", monospace`;
        ctx.fillStyle = btn.isPressed ? '#ffffff' : '#d4cfc4';
        ctx.fillText(btn.label, btn.x, btn.y - (btn.sublabel ? 4 : 0));
      }

      if (btn.sublabel) {
        ctx.font = '8px "Courier New", monospace';
        ctx.fillStyle = 'rgba(212,207,196,0.6)';
        ctx.fillText(btn.sublabel, btn.x, btn.y + btn.radius * 0.48);
      }

      ctx.restore();
    }

    ctx.restore();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);

    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);

    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    window.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('touchend', this.handleTouchEnd);
    window.removeEventListener('touchcancel', this.handleTouchEnd);
  }
}
