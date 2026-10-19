import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { FORMAT_PIPES } from '../../shared/format';
import { UI } from '../../shared/ui';

const PAGE = 50;

@Component({
  selector: 'hs-sessions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Sessions</h2>
        <p class="mt-1 text-sm text-ink-400">Every connection: who, from where, for how long and how much data.</p>
      </div>
      <div class="inline-flex gap-1 rounded-xl bg-ink-950/60 p-1 ring-1 ring-white/5" role="radiogroup" aria-label="Which sessions">
        @for (opt of [false, true]; track opt) {
          <button type="button" role="radio" [attr.aria-checked]="live() === opt" (click)="live.set(opt); page.set(0)"
            class="h-7 rounded-lg px-3 text-xs font-semibold" [class]="live() === opt ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'">
            {{ opt ? 'Live now' : 'All' }}</button>
        }
      </div>
    </div>

    <div class="card overflow-hidden">
      @if (sessions.isLoading() && !sessions.value()) {
        <hs-spinner />
      } @else if (!sessions.value()?.items?.length) {
        <hs-empty icon="activity" [title]="live() ? 'Nobody is connected right now' : 'No sessions yet'" />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] text-sm">
            <thead class="table-head"><tr><th>User</th><th>From</th><th>Server</th><th>Started</th><th>Ended</th><th class="!text-right">Duration</th><th class="!text-right">↓ / ↑</th></tr></thead>
            <tbody>
              @for (s of sessions.value()!.items; track s.id) {
                <tr class="table-row">
                  <td><a [routerLink]="['/users', s.userId]" class="font-medium hover:text-brand-300">{{ s.userEmail }}</a></td>
                  <td><div class="flex items-center gap-2"><hs-flag [code]="s.countryCode" />
                    <div><div class="max-w-[180px] truncate">{{ place(s) }}</div><div class="font-mono text-xs text-ink-400">{{ s.clientIp }}</div></div></div></td>
                  <td class="text-ink-300">{{ serverName(s.nodeId) }}</td>
                  <td class="whitespace-nowrap text-ink-300">{{ s.startedAt | dateTime }}</td>
                  <td class="whitespace-nowrap">
                    @if (s.active) { <hs-badge tone="green" [dot]="true">live</hs-badge> } @else { <span class="text-ink-400">{{ s.endedAt | dateTime }}</span> }
                  </td>
                  <td class="text-right font-mono tabular-nums">{{ s.elapsedSeconds | duration }}</td>
                  <td class="whitespace-nowrap text-right font-mono text-xs tabular-nums text-ink-300">{{ s.txBytes | bytes }} / {{ s.rxBytes | bytes }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-white/5 p-3 text-xs text-ink-400">
          <span>{{ sessions.value()!.total }} sessions</span>
          <button class="btn-secondary h-8 px-3 text-xs" [disabled]="page() === 0" (click)="page.set(page() - 1)">Previous</button>
          <span>Page {{ page() + 1 }} of {{ pages() }}</span>
          <button class="btn-secondary h-8 px-3 text-xs" [disabled]="page() + 1 >= pages()" (click)="page.set(page() + 1)">Next</button>
        </div>
      }
    </div>`,
})
export class SessionsPage {
  private readonly api = inject(ApiService);
  protected readonly live = signal(false);
  protected readonly page = signal(0);

  protected readonly sessions = rxResource({
    params: () => ({ active: this.live(), page: this.page() }),
    stream: ({ params }) => this.api.sessions({ ...params, size: PAGE }),
  });
  private readonly servers = rxResource({ stream: () => this.api.servers() });

  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.sessions.value()?.total ?? 0) / PAGE)));

  protected serverName(id: string): string {
    return this.servers.value()?.find((s) => s.id === id)?.name ?? '—';
  }

  protected place(s: { city: string | null; region: string | null; country: string | null }): string {
    return [s.city, s.region, s.country].filter(Boolean).join(', ') || 'Unknown location';
  }
}
