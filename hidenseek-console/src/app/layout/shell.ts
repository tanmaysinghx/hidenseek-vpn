import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Icon } from '../shared/icon';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const ADMIN_NAV: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { path: '/users', label: 'Users', icon: 'users' },
  { path: '/sessions', label: 'Sessions', icon: 'activity' },
  { path: '/websites', label: 'Websites', icon: 'globe' },
  { path: '/servers', label: 'Servers', icon: 'server' },
];
const USER_NAV: NavItem[] = [{ path: '/me', label: 'My account', icon: 'user' }];

@Component({
  selector: 'hs-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <div class="flex h-dvh">
      <!-- Sidebar: fixed on desktop, a drawer on phones -->
      @if (menuOpen()) {
        <button class="fixed inset-0 z-30 bg-black/60 lg:hidden" aria-label="Close menu" (click)="menuOpen.set(false)"></button>
      }
      <aside class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/5 bg-ink-950 p-4 transition-transform lg:static lg:translate-x-0"
        [class.-translate-x-full]="!menuOpen()">
        <a routerLink="/" class="mb-8 flex items-center gap-2.5 px-2 pt-1">
          <img src="logo.svg" alt="" class="size-8" />
          <div>
            <div class="text-[15px] font-bold leading-tight">Hidenseek</div>
            <div class="text-[11px] font-medium text-ink-400">{{ isAdmin() ? 'Admin console' : 'Account' }}</div>
          </div>
        </a>
        <nav class="flex flex-1 flex-col gap-1" aria-label="Main">
          @for (item of nav(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="!bg-white/[0.06] !text-ink-100 [&_hs-icon]:text-brand-400"
              (click)="menuOpen.set(false)"
              class="flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-ink-400 transition-colors hover:bg-white/[0.03] hover:text-ink-100">
              <hs-icon [name]="item.icon" class="size-[18px]" />{{ item.label }}
            </a>
          }
        </nav>
        <a href="/" class="rounded-xl px-3 py-2 text-xs text-ink-400 hover:text-ink-100">← vpn site & downloads</a>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-16 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-900/80 px-4 backdrop-blur sm:px-6">
          <button class="btn-ghost -ml-2 px-2 lg:hidden" aria-label="Open menu" (click)="menuOpen.set(true)">
            <hs-icon name="menu" class="size-5" />
          </button>
          <h1 class="truncate text-base font-semibold">{{ title() }}</h1>
          <div class="ml-auto flex items-center gap-3">
            <div class="hidden text-right sm:block">
              <div class="text-sm font-medium leading-tight">{{ user()?.displayName || user()?.email }}</div>
              <div class="text-xs text-ink-400">{{ user()?.email }}</div>
            </div>
            <div class="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-400/40 to-sky-500/40 text-sm font-bold uppercase">
              {{ initial() }}
            </div>
            <button class="btn-ghost px-2" title="Sign out" aria-label="Sign out" (click)="signOut()">
              <hs-icon name="logout" class="size-[18px]" />
            </button>
          </div>
        </header>
        <main class="min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>`,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly user = this.auth.user;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly nav = computed(() => (this.isAdmin() ? ADMIN_NAV : USER_NAV));
  protected readonly initial = computed(() => (this.user()?.displayName || this.user()?.email || '?').charAt(0));

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );
  protected readonly title = computed(() => {
    const url = this.url();
    if (url.startsWith('/users/')) return 'User';
    return [...ADMIN_NAV, ...USER_NAV].find((n) => url.startsWith(n.path))?.label ?? 'Hidenseek';
  });

  protected async signOut() {
    await this.auth.signOut();
    await this.router.navigate(['/sign-in']);
  }
}
