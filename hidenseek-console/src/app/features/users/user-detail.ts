import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Chart } from '../../shared/chart';
import { FORMAT_PIPES, bytes, duration } from '../../shared/format';
import { UI } from '../../shared/ui';
import { topWebsites, trafficPerDay } from '../dashboard/charts';

const PAGE = 50;
const TONE = { APPROVED: 'green', PENDING: 'amber', SUSPENDED: 'red' } as const;

@Component({
  selector: 'hs-user-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, Chart, ...UI, ...FORMAT_PIPES],
  template: `
    <a routerLink="/users" class="mb-4 inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100"><hs-icon name="back" class="size-4" />Users</a>

    @if (insights.error()) {
      <hs-error message="Could not load this user." />
    } @else if (!insights.value()) {
      <hs-spinner />
    } @else {
      @let d = insights.value()!;
      <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <span class="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-400/40 to-sky-500/40 text-xl font-bold uppercase">{{ (d.user.displayName || d.user.email).charAt(0) }}</span>
          <div>
            <h2 class="text-2xl font-bold tracking-tight">{{ d.user.displayName || d.user.email }}</h2>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-400">
              <span>{{ d.user.email }}</span>
              <hs-badge [tone]="tone[d.user.status]">{{ d.user.status.toLowerCase() }}</hs-badge>
              @if (d.user.role === 'ADMIN') { <hs-badge tone="sky">admin</hs-badge> }
              <span>· joined {{ d.user.createdAt | relative }} · seen {{ d.user.lastSeenAt | relative }}</span>
            </div>
          </div>
        </div>
        <hs-period [(value)]="days" />
      </div>

      <section class="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Totals">
        <hs-stat label="Sessions" [value]="d.sessions" icon="activity" [hint]="'last ' + d.days + ' days'" />
        <hs-stat label="Connected" [value]="connected()" icon="clock" />
        <hs-stat label="Downloaded" [value]="down()" icon="down" />
        <hs-stat label="Uploaded" [value]="up()" icon="up" />
        <hs-stat label="Website lookups" [value]="d.activityLookups" icon="globe" />
      </section>

      <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="card p-5">
          <h3 class="card-title">Data per day</h3>
          <p class="mb-2 text-xs text-ink-400">Downloaded and uploaded by {{ d.user.displayName || d.user.email }}</p>
          <hs-chart [options]="trafficChart()" [height]="240" label="Line chart of this user's download and upload per day" />
        </div>
        <div class="card p-5">
          <h3 class="card-title">Most visited websites</h3>
          <p class="mb-2 text-xs text-ink-400">By DNS lookups in the last {{ d.days }} days</p>
          @if (d.topDomains.length) {
            <hs-chart [options]="websitesChart()" [height]="Math.max(160, Math.min(d.topDomains.length, 10) * 30)" label="Bar chart of this user's most visited websites" />
          } @else {
            <hs-empty icon="eye" title="No website activity">Only servers with activity logging on record websites.</hs-empty>
          }
        </div>
      </section>

      <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div class="card overflow-hidden xl:col-span-2">
          <h3 class="card-title p-5 pb-3">Recent sessions</h3>
          @if (d.recentSessions.length) {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[560px] text-sm">
                <thead class="table-head"><tr><th>Started</th><th>From</th><th class="!text-right">Duration</th><th class="!text-right">↓ / ↑</th></tr></thead>
                <tbody>
                  @for (s of d.recentSessions; track s.id) {
                    <tr class="table-row">
                      <td class="whitespace-nowrap"><div class="flex items-center gap-2">{{ s.startedAt | dateTime }}
                        @if (s.active) { <hs-badge tone="green" [dot]="true">live</hs-badge> }</div></td>
                      <td><div class="flex items-center gap-2"><hs-flag [code]="s.countryCode" />
                        <div><div>{{ s.city || (s.countryCode | country: s.country) }}</div><div class="font-mono text-xs text-ink-400">{{ s.clientIp }}</div></div></div></td>
                      <td class="text-right font-mono tabular-nums">{{ s.elapsedSeconds | duration }}</td>
                      <td class="whitespace-nowrap text-right font-mono text-xs tabular-nums text-ink-300">{{ s.txBytes | bytes }} / {{ s.rxBytes | bytes }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <hs-empty icon="activity" title="No sessions yet" />
          }
        </div>
        <div class="card p-5">
          <h3 class="card-title mb-3">Devices</h3>
          @if (d.devices.length) {
            <ul class="space-y-3">
              @for (dev of d.devices; track dev.id) {
                <li class="flex items-center gap-3">
                  <span class="grid size-9 place-items-center rounded-xl bg-white/5 text-ink-300"><hs-icon [name]="dev.platform === 'ANDROID' ? 'phone' : 'laptop'" class="size-4" /></span>
                  <div class="min-w-0"><div class="truncate text-sm font-medium">{{ dev.name }}</div>
                    <div class="text-xs text-ink-400">{{ dev.platform.toLowerCase() }} · added {{ dev.createdAt | relative }}</div></div>
                </li>
              }
            </ul>
          } @else {
            <hs-empty icon="laptop" title="No devices" />
          }
        </div>
      </section>

      <section class="card mt-4 overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <div>
            <h3 class="card-title">Website activity</h3>
            <p class="text-xs text-ink-400">Every domain looked up, newest first</p>
          </div>
          <label class="flex h-9 w-full items-center gap-2 rounded-xl border border-white/10 bg-ink-950/60 px-3 sm:w-64">
            <hs-icon name="search" class="size-4 text-ink-400" />
            <input class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400" placeholder="Filter domains"
              [ngModel]="search()" (ngModelChange)="search.set($event); page.set(0)" />
          </label>
        </div>
        @if (activity.value()?.items?.length) {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[520px] text-sm">
              <thead class="table-head"><tr><th>When</th><th>Website</th><th>Type</th></tr></thead>
              <tbody>
                @for (a of activity.value()!.items; track a.id) {
                  <tr class="table-row">
                    <td class="whitespace-nowrap text-ink-400">{{ a.occurredAt | dateTime }}</td>
                    <td class="font-mono text-xs text-brand-300">{{ a.domain }}</td>
                    <td class="font-mono text-xs text-ink-400">{{ a.queryType }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-end gap-2 border-t border-white/5 p-3 text-xs text-ink-400">
            <span>{{ activity.value()!.total }} lookups</span>
            <button class="btn-secondary h-8 px-3 text-xs" [disabled]="page() === 0" (click)="page.set(page() - 1)">Newer</button>
            <span>Page {{ page() + 1 }} of {{ pages() }}</span>
            <button class="btn-secondary h-8 px-3 text-xs" [disabled]="page() + 1 >= pages()" (click)="page.set(page() + 1)">Older</button>
          </div>
        } @else if (activity.isLoading()) {
          <hs-spinner />
        } @else {
          <hs-empty icon="eye" title="No website activity in this period" />
        }
      </section>
    }`,
})
export class UserDetailPage {
  private readonly api = inject(ApiService);
  protected readonly Math = Math;
  protected readonly tone = TONE;

  readonly id = input.required<string>();
  protected readonly days = signal(30);
  protected readonly search = signal('');
  protected readonly page = signal(0);

  protected readonly insights = rxResource({
    params: () => ({ id: this.id(), days: this.days() }),
    stream: ({ params }) => this.api.userInsights(params.id, params.days),
  });

  protected readonly activity = rxResource({
    params: () => ({ userId: this.id(), q: this.search(), days: this.days(), page: this.page() }),
    stream: ({ params }) => this.api.activity({ ...params, size: PAGE }),
  });

  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.activity.value()?.total ?? 0) / PAGE)));
  protected readonly trafficChart = computed(() => trafficPerDay(this.insights.value()?.daily ?? []));
  protected readonly websitesChart = computed(() => topWebsites(this.insights.value()?.topDomains ?? []));
  protected readonly connected = computed(() => duration(this.insights.value()?.connectedSeconds));
  protected readonly down = computed(() => bytes(this.insights.value()?.downloadBytes));
  protected readonly up = computed(() => bytes(this.insights.value()?.uploadBytes));
}
