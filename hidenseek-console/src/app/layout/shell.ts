import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Theme } from '../core/theme';
import { Icon } from '../shared/icon';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const ADMIN_NAV: NavSection[] = [
  { label: 'Overview', items: [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/analytics', label: 'Analytics', icon: 'chart' },
  ] },
  { label: 'Manage', items: [
    { path: '/users', label: 'Users', icon: 'users' },
    { path: '/plans', label: 'Plans', icon: 'gauge' },
    { path: '/servers', label: 'Servers', icon: 'server' },
  ] },
  { label: 'Activity', items: [
    { path: '/sessions', label: 'Sessions', icon: 'activity' },
    { path: '/websites', label: 'Websites', icon: 'globe' },
    { path: '/audit', label: 'Audit log', icon: 'list' },
  ] },
  { label: 'System', items: [
    { path: '/control', label: 'Control panel', icon: 'sliders' },
  ] },
];
const USER_NAV: NavSection[] = [{ label: 'Account', items: [{ path: '/me', label: 'My account', icon: 'user' }] }];

@Component({
  selector: 'hs-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  template: `
    <div class="flex h-dvh">
      <!-- Sidebar: fixed on desktop, a drawer on phones -->
      @if (menuOpen()) {
        <button class="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] lg:hidden" aria-label="Close menu" (click)="menuOpen.set(false)"></button>
      }
      <aside class="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-white/[0.07] bg-ink-950 transition-transform lg:static lg:translate-x-0"
        [class.-translate-x-full]="!menuOpen()">
        <a routerLink="/" class="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.07] px-4">
          <img src="logo.svg" alt="" class="size-7" />
          <div class="leading-tight">
            <div class="text-[14px] font-semibold tracking-tight">Hidenseek</div>
            <div class="text-[11px] text-ink-400">{{ isAdmin() ? 'Admin console' : 'Account' }}</div>
          </div>
        </a>

        <nav class="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
          @for (section of nav(); track section.label) {
            <div>
              <div class="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-500">{{ section.label }}</div>
              <div class="space-y-0.5">
                @for (item of section.items; track item.path) {
                  <a [routerLink]="item.path" routerLinkActive="is-active" #rla="routerLinkActive" (click)="menuOpen.set(false)"
                    [attr.aria-current]="rla.isActive ? 'page' : null"
                    class="group relative flex h-8.5 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-300 transition-colors hover:bg-white/[0.04] hover:text-ink-100 [&.is-active]:bg-white/[0.06] [&.is-active]:text-ink-100">
                    @if (rla.isActive) { <span class="absolute -left-3 top-1.5 bottom-1.5 w-0.5 rounded-r bg-brand-400"></span> }
                    <hs-icon [name]="item.icon" class="size-4 text-ink-400 group-hover:text-ink-200 group-[.is-active]:text-brand-400" />
                    {{ item.label }}
                  </a>
                }
              </div>
            </div>
          }
        </nav>

        <div class="border-t border-white/[0.07] p-3">
          <div class="flex items-center gap-2.5 rounded-lg p-1.5">
            <div class="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400/35 to-sky-500/35 text-xs font-bold uppercase">{{ initial() }}</div>
            <div class="min-w-0 flex-1 leading-tight">
              <div class="truncate text-[13px] font-medium">{{ user()?.displayName || user()?.email }}</div>
              <div class="truncate text-[11px] text-ink-400">{{ isAdmin() ? 'Administrator' : user()?.email }}</div>
            </div>
            <button class="btn-ghost size-8 shrink-0 px-0" title="Sign out" aria-label="Sign out" (click)="signOut()">
              <hs-icon name="logout" class="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-ink-900/80 px-4 backdrop-blur sm:px-6">
          <button class="btn-ghost -ml-2 px-2 lg:hidden" aria-label="Open menu" (click)="menuOpen.set(true)">
            <hs-icon name="menu" class="size-5" />
          </button>
          <nav class="flex min-w-0 items-center gap-2 text-sm" aria-label="Breadcrumb">
            @if (crumb().section) {
              <span class="hidden text-ink-400 sm:inline">{{ crumb().section }}</span>
              <span class="hidden text-ink-500 sm:inline" aria-hidden="true">/</span>
            }
            <span class="truncate font-semibold">{{ crumb().page }}</span>
          </nav>
          <div class="ml-auto flex items-center gap-1.5">
            <a href="/" class="btn-ghost hidden h-8 px-2.5 text-xs sm:inline-flex" title="Open the public site">
              <hs-icon name="external" class="size-3.5" />Site
            </a>
            <button class="btn-ghost size-8 px-0" (click)="theme.toggle()"
              [attr.aria-label]="theme.mode() === 'light' ? 'Switch to dark theme' : 'Switch to light theme'"
              [title]="theme.mode() === 'light' ? 'Dark theme' : 'Light theme'">
              <hs-icon [name]="theme.mode() === 'light' ? 'moon' : 'sun'" class="size-4" />
            </button>
          </div>
        </header>
        <main class="min-h-0 flex-1 overflow-y-auto">
          <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>`,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly theme = inject(Theme);

  protected readonly menuOpen = signal(false);
  protected readonly user = this.auth.user;
  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly nav = computed(() => (this.isAdmin() ? ADMIN_NAV : USER_NAV));
  protected readonly initial = computed(() => (this.user()?.displayName || this.user()?.email || '?').charAt(0));

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );
  protected readonly crumb = computed(() => {
    const url = this.url();
    for (const section of [...ADMIN_NAV, ...USER_NAV]) {
      const item = section.items.find((n) => url.startsWith(n.path));
      if (item) {
        const detail = url.startsWith('/users/');
        return { section: detail ? 'Manage / Users' : section.label, page: detail ? 'User' : item.label };
      }
    }
    return { section: '', page: 'Hidenseek' };
  });

  protected async signOut() {
    await this.auth.signOut();
    await this.router.navigate(['/sign-in']);
  }
}
