import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const KEY = 'hs-theme';

function saved(): ThemeMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Light or dark. Follows the system until the admin picks one, which is remembered on this device
 * (shared with the landing page). index.html applies it before first paint; this keeps it in sync.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly media = window.matchMedia('(prefers-color-scheme: light)');
  private readonly choice = signal<ThemeMode | null>(saved());
  private readonly systemLight = signal(this.media.matches);

  readonly mode = computed<ThemeMode>(() => this.choice() ?? (this.systemLight() ? 'light' : 'dark'));

  constructor() {
    this.media.addEventListener('change', (e) => this.systemLight.set(e.matches));
    effect(() => {
      const mode = this.mode();
      document.documentElement.dataset['theme'] = mode;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'light' ? '#f4f6f9' : '#0b0f17');
    });
  }

  toggle(): void {
    const next: ThemeMode = this.mode() === 'light' ? 'dark' : 'light';
    this.choice.set(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts until the tab closes.
    }
  }
}
