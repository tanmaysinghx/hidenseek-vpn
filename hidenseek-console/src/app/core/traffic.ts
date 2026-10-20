import { DestroyRef, Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth.service';

type EventType = 'LANDING' | 'PAGEVIEW';

interface TrafficEvent {
  type: EventType;
  path: string;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  at: string;
}

const ENDPOINT = '/api/v1/public/events';
const FLUSH_MS = 4000;
const MAX_BATCH = 50;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** localStorage/sessionStorage can throw (private mode, blocked site data); fall back to memory. */
function stored(storage: () => Storage, key: string): { id: string; isNew: boolean } {
  try {
    const existing = storage().getItem(key);
    if (existing) return { id: existing, isNew: false };
    const id = crypto.randomUUID();
    storage().setItem(key, id);
    return { id, isNew: true };
  } catch {
    return { id: crypto.randomUUID(), isNew: true };
  }
}

/**
 * Reports page views to the backend for the admin's traffic analytics: the first page of a visit
 * with its referrer and utm_* tags, then each in-app navigation. A visitor is a random id kept in
 * localStorage, a visit is one browser tab (sessionStorage). No cookies, no third parties.
 */
@Injectable({ providedIn: 'root' })
export class TrafficTracker {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly visitor = stored(() => localStorage, 'hs.visitor');
  private readonly visit = stored(() => sessionStorage, 'hs.visit');
  private queue: TrafficEvent[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private landed = !this.visit.isNew;
  private lastPath: string | null = null;

  constructor() {
    const sub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.track(e.urlAfterRedirects));
    const onHide = () => document.visibilityState === 'hidden' && void this.flush();
    document.addEventListener('visibilitychange', onHide);
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
    });
  }

  private track(url: string) {
    const path = TrafficTracker.normalize(url);
    if (path === this.lastPath) return;
    this.lastPath = path;
    const at = new Date().toISOString();
    if (!this.landed) {
      this.landed = true;
      const query = new URLSearchParams(window.location.search);
      this.queue.push({
        type: 'LANDING',
        path,
        referrer: document.referrer || null,
        utmSource: query.get('utm_source'),
        utmMedium: query.get('utm_medium'),
        utmCampaign: query.get('utm_campaign'),
        at,
      });
    } else {
      this.queue.push({ type: 'PAGEVIEW', path, at });
    }
    if (this.queue.length >= MAX_BATCH) void this.flush();
    else this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  }

  /** Path only, ids replaced: /users/3f2a… becomes /users/:id, so pages group in the stats. */
  static normalize(url: string): string {
    const path = url.split(/[?#]/)[0] || '/';
    return path.split('/').map((part) => (ID.test(part) ? ':id' : part)).join('/');
  }

  private async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.queue.length) return;
    const events = this.queue.splice(0, MAX_BATCH);
    const body = JSON.stringify({ visitorId: this.visitor.id, sessionId: this.visit.id, events });
    const send = (token: string | null) =>
      fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body,
      });
    try {
      const token = this.auth.accessToken();
      const res = await send(token);
      // An expired token is refused even on a public endpoint; the events still count, just anonymously.
      if (res.status === 401 && token) await send(null);
    } catch {
      // Analytics are best effort; a failed batch is dropped rather than retried forever.
    }
    if (this.queue.length) void this.flush();
  }
}
