/**
 * Accessibility & Settings System
 * Per spec §10: opt-in assists that don't gate content or achievements
 */

export interface AccessibilitySettings {
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  uiScale: number;          // 0.75 – 1.5
  damageTakenMultiplier: number;  // 0.5 – 1.0
  extendedParryWindow: boolean;   // doubles parry window
  extendedIFrameWindow: boolean;  // extends i-frames by 50%
  screenShakeReduction: number;   // 0 – 1 (1 = no shake)
  flashingLightsReduction: boolean;
  unlimitedStamina: boolean;
  subtitlesEnabled: boolean;
  immersiveMode: boolean;  // hide HUD
}

export interface VideoSettings {
  resolution: string;    // 'auto', '1920x1080', etc.
  windowMode: 'fullscreen' | 'windowed' | 'borderless';
  vsync: boolean;
  frameCap: number;      // 30, 60, 120, 0 = uncapped
  resolutionScale: number; // 0.5 – 1.0
  screenShakeToggle: boolean;
  motionBlurToggle: boolean;
  brightness: number;    // 0.5 – 1.5
  gamma: number;         // 0.5 – 1.5
}

export interface AudioSettings {
  masterVolume: number;   // 0 – 1
  musicVolume: number;    // 0 – 1
  sfxVolume: number;      // 0 – 1
  ambienceVolume: number; // 0 – 1
  subtitles: boolean;
}

export interface ControlSettings {
  keyboardBindings: Record<string, string>;
  gamepadBindings: Record<string, string>;
  stickDeadzone: number;  // 0.1 – 0.5
  promptStyle: 'auto' | 'keyboard' | 'gamepad';
  mouseSensitivity: number;
}

export interface GameSettings {
  autosave: boolean;
  immersiveMode: boolean;
  language: string;
}

export interface Settings {
  accessibility: AccessibilitySettings;
  video: VideoSettings;
  audio: AudioSettings;
  controls: ControlSettings;
  game: GameSettings;
}

const SETTINGS_KEY = 'gravebloom_settings';

const DEFAULT_SETTINGS: Settings = {
  accessibility: {
    colorblindMode: 'none',
    uiScale: 1.0,
    damageTakenMultiplier: 1.0,
    extendedParryWindow: false,
    extendedIFrameWindow: false,
    screenShakeReduction: 0,
    flashingLightsReduction: false,
    unlimitedStamina: false,
    subtitlesEnabled: true,
    immersiveMode: false,
  },
  video: {
    resolution: 'auto',
    windowMode: 'windowed',
    vsync: true,
    frameCap: 60,
    resolutionScale: 1.0,
    screenShakeToggle: true,
    motionBlurToggle: true,
    brightness: 1.0,
    gamma: 1.0,
  },
  audio: {
    masterVolume: 0.8,
    musicVolume: 0.3,
    sfxVolume: 0.7,
    ambienceVolume: 0.2,
    subtitles: true,
  },
  controls: {
    keyboardBindings: {},
    gamepadBindings: {},
    stickDeadzone: 0.2,
    promptStyle: 'auto',
    mouseSensitivity: 1.0,
  },
  game: {
    autosave: true,
    immersiveMode: false,
    language: 'en',
  },
};

export class SettingsManager {
  private settings: Settings;

  constructor() {
    this.settings = this.load();
  }

  get(): Settings { return this.settings; }

  getAccessibility(): AccessibilitySettings { return this.settings.accessibility; }
  getVideo(): VideoSettings { return this.settings.video; }
  getAudio(): AudioSettings { return this.settings.audio; }

  updateAccessibility(partial: Partial<AccessibilitySettings>): void {
    Object.assign(this.settings.accessibility, partial);
    this.save();
  }

  updateVideo(partial: Partial<VideoSettings>): void {
    Object.assign(this.settings.video, partial);
    this.save();
  }

  updateAudio(partial: Partial<AudioSettings>): void {
    Object.assign(this.settings.audio, partial);
    this.save();
  }

  updateControls(partial: Partial<ControlSettings>): void {
    Object.assign(this.settings.controls, partial);
    this.save();
  }

  reset(): void {
    this.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.save();
  }

  private load(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const loaded = JSON.parse(raw);
        // Merge with defaults (in case new settings were added)
        return this.deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), loaded);
      }
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {}
  }

  private deepMerge(target: any, source: any): any {
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  // ─── Colorblind Filters ─────────────────────────────────

  /** Apply colorblind correction to a CSS color string */
  applyColorblindFilter(color: string): string {
    if (this.settings.accessibility.colorblindMode === 'none') return color;

    // Simple approximation using CSS filters
    // In production, use a proper colorblind simulation library
    switch (this.settings.accessibility.colorblindMode) {
      case 'protanopia':
        return this.shiftHue(color, 15);
      case 'deuteranopia':
        return this.shiftHue(color, -10);
      case 'tritanopia':
        return this.shiftHue(color, 30);
      default:
        return color;
    }
  }

  private shiftHue(color: string, degrees: number): string {
    const match = color.trim().match(/^#([0-9a-f]{6})$/i);
    if (!match) return color;
    const value = Number.parseInt(match[1], 16);
    let r = (value >> 16) / 255;
    let g = ((value >> 8) & 0xff) / 255;
    let b = (value & 0xff) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const delta = max - min;
    let hue = 0;
    let saturation = 0;
    if (delta !== 0) {
      saturation = delta / (1 - Math.abs(2 * lightness - 1));
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
    }
    hue = (hue + degrees + 360) % 360;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness - chroma / 2;
    if (hue < 60) [r, g, b] = [chroma, x, 0];
    else if (hue < 120) [r, g, b] = [x, chroma, 0];
    else if (hue < 180) [r, g, b] = [0, chroma, x];
    else if (hue < 240) [r, g, b] = [0, x, chroma];
    else if (hue < 300) [r, g, b] = [x, 0, chroma];
    else [r, g, b] = [chroma, 0, x];
    const channel = (component: number) => Math.round((component + m) * 255).toString(16).padStart(2, '0');
    return `#${channel(r)}${channel(g)}${channel(b)}`;
  }

  /** Get CSS filter string for canvas colorblind mode */
  getCanvasFilter(): string {
    switch (this.settings.accessibility.colorblindMode) {
      case 'protanopia':
        return 'url(#protanopia)';
      case 'deuteranopia':
        return 'url(#deuteranopia)';
      case 'tritanopia':
        return 'url(#tritanopia)';
      default:
        return 'none';
    }
  }
}
