import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ErrorNote, Icon } from '../../shared/ui';

@Component({
  selector: 'hs-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ErrorNote],
  template: `
    <div class="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div class="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl"></div>
      <div class="pointer-events-none absolute -bottom-56 right-0 h-[420px] w-[520px] rounded-full bg-sky-500/10 blur-3xl"></div>
      <div class="relative w-full max-w-md animate-fade-in">
        <div class="mb-8 text-center">
          <img src="logo.svg" alt="" class="mx-auto mb-4 size-14 drop-shadow-[0_10px_30px_rgba(16,185,129,0.35)]" />
          <h1 class="text-2xl font-bold tracking-tight">Hidenseek console</h1>
          <p class="mt-1 text-sm text-ink-400">See who's connected, how much they use, and manage your servers.</p>
        </div>
        <div class="card space-y-5 p-6 sm:p-7">
          <button class="btn-primary h-12 w-full text-base" [disabled]="pending()" (click)="signIn()">
            @if (pending()) {
              <span class="size-4 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950"></span> Waiting for Portal…
            } @else {
              <hs-icon name="key" class="size-4" /> Sign in with Portal
            }
          </button>
          <hs-error [message]="error()" />
          <p class="text-center text-xs text-ink-400">
            Admins see the full console. Everyone else sees their own connections.
          </p>
        </div>
        <p class="mt-6 text-center text-xs text-ink-400"><a href="/" class="hover:text-ink-100">← Back to vpn.tanmaysinghx.com</a></p>
      </div>
    </div>`,
})
export class SignIn {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async signIn() {
    this.pending.set(true);
    this.error.set(null);
    try {
      await this.auth.signIn();
      await this.router.navigate([this.auth.isAdmin() ? '/dashboard' : '/me']);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
    } finally {
      this.pending.set(false);
    }
  }
}
