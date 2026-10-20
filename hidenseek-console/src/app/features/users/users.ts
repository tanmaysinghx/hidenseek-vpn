import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AdminUser, UserStatus } from '../../core/models';
import { FORMAT_PIPES } from '../../shared/format';
import { UI } from '../../shared/ui';

type Filter = 'ALL' | UserStatus;
const TONE = { APPROVED: 'green', PENDING: 'amber', SUSPENDED: 'red' } as const;

@Component({
  selector: 'hs-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6">
      <h2 class="text-xl font-semibold tracking-tight">Users</h2>
      <p class="mt-1 text-sm text-ink-400">Everyone who has signed in to the VPN with Portal. Approve people before they can connect.</p>
    </div>

    <div class="mb-4 flex flex-wrap items-center gap-2">
      @for (f of filters; track f) {
        <button type="button" (click)="filter.set(f)"
          class="rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition-colors"
          [class]="filter() === f ? 'bg-white/10 text-ink-100 ring-white/15' : 'text-ink-400 ring-white/5 hover:text-ink-100'">
          {{ f === 'ALL' ? 'All' : (f.charAt(0) + f.slice(1).toLowerCase()) }}
          @if (f !== 'ALL') { <span class="ml-1 tabular-nums text-ink-400">{{ count(f) }}</span> }
        </button>
      }
      <label class="ml-auto flex h-9 w-full items-center gap-2 rounded-xl border border-white/10 bg-ink-950/60 px-3 sm:w-64">
        <hs-icon name="search" class="size-4 text-ink-400" />
        <input class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400" placeholder="Search name or email"
          [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </label>
    </div>

    <hs-error [message]="actionError()" />
    <div class="card mt-3 overflow-hidden">
      @if (users.isLoading() && !users.value()) {
        <hs-spinner />
      } @else if (!shown().length) {
        <hs-empty icon="users" title="Nobody here">People appear after they sign in to a Hidenseek app.</hs-empty>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] text-sm">
            <thead class="table-head"><tr><th>Person</th><th>Status</th><th>Plan</th><th>Today</th><th>Last seen</th><th class="!text-right">Access</th></tr></thead>
            <tbody>
              @for (u of shown(); track u.id) {
                <tr class="table-row">
                  <td>
                    <a [routerLink]="['/users', u.id]" class="flex items-center gap-3 hover:text-brand-300">
                      <span class="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400/30 to-sky-500/30 text-xs font-bold uppercase">{{ (u.displayName || u.email).charAt(0) }}</span>
                      <span class="min-w-0"><span class="block truncate font-medium">{{ u.displayName || u.email }}</span>
                        <span class="block truncate text-xs text-ink-400">{{ u.email }}</span></span>
                    </a>
                  </td>
                  <td><div class="flex gap-1.5"><hs-badge [tone]="tone[u.status]">{{ u.status.toLowerCase() }}</hs-badge>
                    @if (u.role === 'ADMIN') { <hs-badge tone="sky">admin</hs-badge> }</div></td>
                  <td>
                    <select class="h-8 rounded-lg border border-white/10 bg-ink-950/60 px-2 text-xs font-semibold text-ink-100 outline-none focus:border-brand-400/60"
                      [attr.aria-label]="'Plan for ' + (u.displayName || u.email)" [disabled]="busy() === u.id || !plans.value()"
                      [ngModel]="u.planId" (ngModelChange)="setPlan(u, $event)">
                      @for (p of plans.value() ?? [{ id: u.planId, name: u.planName }]; track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                    </select>
                    @if (u.planExpiresAt) { <div class="mt-1 text-[11px] text-ink-400">until {{ u.planExpiresAt | dateTime }}</div> }
                  </td>
                  <td class="whitespace-nowrap text-xs tabular-nums">
                    <span [class]="overLimit(u) ? 'font-semibold text-rose-300' : 'text-ink-100'">{{ u.usedTodayBytes | bytes }}</span>
                    <span class="text-ink-400"> / {{ u.role === 'ADMIN' ? 'no limit' : (u.dailyLimitBytes | allowance) }}</span>
                  </td>
                  <td class="text-ink-300">{{ u.lastSeenAt | relative }}</td>
                  <td class="text-right">
                    @if (u.id !== me()?.id) {
                      <div class="inline-flex gap-2">
                        @if (u.status !== 'APPROVED') {
                          <button class="btn-primary h-8 px-3 text-xs" [disabled]="busy() === u.id" (click)="setStatus(u, 'APPROVED')"><hs-icon name="check" class="size-3.5" />Approve</button>
                        }
                        @if (u.status !== 'SUSPENDED') {
                          <button class="btn-danger h-8 px-3 text-xs" [disabled]="busy() === u.id" (click)="setStatus(u, 'SUSPENDED')"><hs-icon name="ban" class="size-3.5" />Suspend</button>
                        }
                      </div>
                    } @else {
                      <span class="text-xs text-ink-400">You</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>`,
})
export class UsersPage {
  private readonly api = inject(ApiService);
  protected readonly me = inject(AuthService).user;
  protected readonly tone = TONE;
  protected readonly filters: Filter[] = ['ALL', 'PENDING', 'APPROVED', 'SUSPENDED'];

  /** ?status=PENDING from the dashboard banner. */
  readonly status = input<Filter | undefined>();
  protected readonly filter = linkedSignal<Filter>(() => {
    const s = this.status();
    return s && this.filters.includes(s) ? s : 'ALL';
  });
  protected readonly query = signal('');
  protected readonly busy = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly users = rxResource({ stream: () => this.api.users() });
  protected readonly plans = rxResource({ stream: () => this.api.plans() });

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return (this.users.value() ?? []).filter(
      (u) =>
        (this.filter() === 'ALL' || u.status === this.filter()) &&
        (!q || u.email.toLowerCase().includes(q) || (u.displayName ?? '').toLowerCase().includes(q)),
    );
  });

  protected count(status: UserStatus): number {
    return (this.users.value() ?? []).filter((u) => u.status === status).length;
  }

  protected overLimit(u: AdminUser): boolean {
    return u.role !== 'ADMIN' && u.dailyLimitBytes !== null && u.usedTodayBytes >= u.dailyLimitBytes;
  }

  protected setStatus(user: AdminUser, status: UserStatus) {
    return this.change(user, () => this.api.setUserStatus(user.id, status));
  }

  /** Set from here, a plan has no end date; time-limited plans come from approving a request. */
  protected setPlan(user: AdminUser, planId: string) {
    return this.change(user, () => this.api.setUserPlan(user.id, planId));
  }

  private async change(user: AdminUser, call: () => Observable<AdminUser>) {
    this.busy.set(user.id);
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(call());
      this.users.update((list) => list?.map((u) => (u.id === updated.id ? updated : u)));
    } catch {
      this.actionError.set(`Could not update ${user.email}.`);
      this.users.reload();
    } finally {
      this.busy.set(null);
    }
  }
}
