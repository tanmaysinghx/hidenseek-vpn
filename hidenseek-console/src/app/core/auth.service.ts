import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PublicConfig, User } from './models';
import { challengeFor, randomToken } from './pkce';

interface WebSession {
  accessToken: string;
  expiresIn: number;
}

/** Sent on refresh/logout; the backend requires it so other sites can't trigger them. */
const CONSOLE_HEADER = new HttpHeaders({ 'X-Hidenseek-Console': '1' });
const POPUP_MESSAGE = 'PORTAL_SSO_POPUP_CALLBACK';

/**
 * Portal SSO sign-in for the console. Portal's popup does the PKCE login; the backend redeems the
 * code with the confidential client's secret and keeps the refresh token in an HttpOnly cookie.
 * The access token lives only in memory and is renewed silently before it expires.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly token = signal<string | null>(null);
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshing: Promise<boolean> | null = null;
  private config: PublicConfig | null = null;

  readonly user = signal<User | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  readonly ready = signal(false);

  accessToken(): string | null {
    return this.token();
  }

  /** Restores a session from the refresh cookie, once, at startup. */
  async init(): Promise<void> {
    if (this.ready()) return;
    try {
      if (await this.refresh()) await this.loadUser();
    } finally {
      this.ready.set(true);
    }
  }

  async signIn(): Promise<void> {
    const config = await this.publicConfig();
    const verifier = randomToken(48);
    const state = randomToken(16);
    const redirectUri = `${config.portalUrl}/oauth2/popup-callback`;
    const url = new URL(`${config.portalUrl}/oauth2/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scopes,
      state,
      code_challenge: await challengeFor(verifier),
      code_challenge_method: 'S256',
    }).toString();

    const code = await this.popup(url.toString(), new URL(config.portalUrl).origin, state);
    const session = await firstValueFrom(
      this.http.post<WebSession>('/api/v1/public/auth/web/token', { code, codeVerifier: verifier }),
    );
    this.accept(session);
    await this.loadUser();
  }

  async signOut(): Promise<void> {
    clearTimeout(this.refreshTimer);
    this.token.set(null);
    this.user.set(null);
    try {
      await firstValueFrom(this.http.post('/api/v1/public/auth/web/logout', null, { headers: CONSOLE_HEADER }));
    } catch {
      // The cookie is gone either way once it expires; nothing else to undo.
    }
  }

  /** Gets a fresh access token from the refresh cookie. Concurrent callers share one request. */
  refresh(): Promise<boolean> {
    this.refreshing ??= firstValueFrom(
      this.http.post<WebSession>('/api/v1/public/auth/web/refresh', null, { headers: CONSOLE_HEADER }),
    )
      .then((session) => {
        this.accept(session);
        return true;
      })
      .catch(() => {
        this.token.set(null);
        this.user.set(null);
        return false;
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async loadUser(): Promise<void> {
    this.user.set(await firstValueFrom(this.http.get<User>('/api/v1/me')));
  }

  private accept(session: WebSession): void {
    this.token.set(session.accessToken);
    clearTimeout(this.refreshTimer);
    const renewIn = Math.max(30, session.expiresIn - 60) * 1000;
    this.refreshTimer = setTimeout(() => void this.refresh(), renewIn);
  }

  private async publicConfig(): Promise<PublicConfig> {
    this.config ??= await firstValueFrom(this.http.get<PublicConfig>('/api/v1/public/config'));
    return this.config;
  }

  /** Opens Portal's sign-in popup and resolves with the authorization code it posts back. */
  private popup(url: string, portalOrigin: string, state: string): Promise<string> {
    const width = 480;
    const height = 680;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const win = window.open(url, 'hidenseek-sign-in', `width=${width},height=${height},left=${left},top=${top}`);
    if (!win) return Promise.reject(new Error('Your browser blocked the sign-in window. Allow pop-ups for this site.'));

    return new Promise<string>((resolve, reject) => {
      const done = () => {
        window.removeEventListener('message', onMessage);
        clearInterval(closedPoll);
      };
      const onMessage = (event: MessageEvent) => {
        // Portal posts with targetOrigin '*', so the sender and the state are both checked here.
        if (event.origin !== portalOrigin || event.data?.type !== POPUP_MESSAGE) return;
        done();
        if (event.data.state !== state) reject(new Error('The sign-in response did not match this request.'));
        else if (event.data.error) reject(new Error(event.data.errorDescription || event.data.error));
        else resolve(event.data.code);
      };
      const closedPoll = setInterval(() => {
        if (win.closed) {
          done();
          reject(new Error('The sign-in window was closed.'));
        }
      }, 600);
      window.addEventListener('message', onMessage);
    });
  }
}
