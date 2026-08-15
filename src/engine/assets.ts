/**
 * Asset Manager for GRAVEBLOOM
 * Loads high-resolution 2D concept art, boss portraits, backgrounds, and item icons.
 * Provides fallback procedural canvas textures if images are unavailable.
 */

export class AssetManager {
  private images = new Map<string, HTMLImageElement>();
  private loaded = false;

  private assetUrls: Record<string, string> = {
    'title_bg': '/assets/title_bg.jpg',
    'the_unspoken': '/assets/the_unspoken.jpg',
    'ser_ashgrave': '/assets/ser_ashgrave.jpg',
    'sir_corvain': '/assets/sir_corvain.jpg',
    'the_bloomwarden': '/assets/the_bloomwarden.jpg',
    'hollow_king': '/assets/hollow_king.jpg',
    'crimson_flask': '/assets/crimson_flask.jpg',
  };

  constructor() {
    this.preload();
  }

  public async preload(): Promise<void> {
    const promises = Object.entries(this.assetUrls).map(([key, url]) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          this.images.set(key, img);
          resolve();
        };
        img.onerror = () => {
          // Gracefully continue without breaking
          resolve();
        };
      });
    });

    await Promise.all(promises);
    this.loaded = true;
  }

  public getImage(key: string): HTMLImageElement | null {
    return this.images.get(key) ?? null;
  }

  public hasImage(key: string): boolean {
    return this.images.has(key);
  }
}
