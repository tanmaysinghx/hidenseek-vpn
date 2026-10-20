import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Chart, chartOf } from '../../shared/chart';
import { FORMAT_PIPES, bytes, compact } from '../../shared/format';
import { UI } from '../../shared/ui';
import { sessionsPerDay, topWebsites, trafficPerDay } from './charts';

@Component({
  selector: 'hs-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Chart, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold tracking-tight">Overview</h2>
        <p class="mt-1 text-sm text-ink-400">Connections, data and websites across every server.</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-ghost px-2" title="Refresh" aria-label="Refresh" (click)="data.reload()"><hs-icon name="refresh" class="size-4" /></button>
        <hs-period [(value)]="days" />
      </div>
    </div>

    @if (data.error()) {
      <hs-error message="Could not load the dashboard. Check that you're signed in as an admin." />
    } @else if (!data.value()) {
      <hs-spinner />
    } @else {
      @let d = data.value()!;
      @if (d.stats.pendingUsers > 0) {
        <a routerLink="/users" [queryParams]="{ status: 'PENDING' }"
          class="card mb-4 flex items-center justify-between gap-3 border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm hover:border-amber-500/40">
          <span><b>{{ d.stats.pendingUsers }}</b> {{ d.stats.pendingUsers === 1 ? 'person is' : 'people are' }} waiting for approval</span>
          <span class="font-semibold text-amber-300">Review →</span>
        </a>
      }

      <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Key figures">
        <hs-stat label="Live now" [value]="d.stats.activeSessions" icon="activity" [hint]="d.stats.activeSessions === 1 ? 'connection' : 'connections'" />
        <hs-stat label="Servers online" [value]="d.stats.onlineNodes + ' / ' + d.stats.nodes" icon="server" />
        <hs-stat label="Users" [value]="d.stats.users" icon="users" [hint]="d.stats.pendingUsers + ' pending'" />
        <hs-stat label="Sessions" [value]="totalSessions()" icon="clock" [hint]="'last ' + d.days + ' days'" />
        <hs-stat label="Data used" [value]="totalData()" icon="down" [hint]="'last ' + d.days + ' days'" />
        <hs-stat label="Websites" [value]="lookups()" icon="globe" [hint]="'lookups, last ' + d.days + ' days'" />
      </section>

      <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="card p-5">
          <h3 class="card-title">Sessions per day</h3>
          <p class="mb-2 text-xs text-ink-400">New connections started each day (UTC)</p>
          <hs-chart [options]="sessionsChart()" [height]="240" label="Bar chart of sessions per day" />
        </div>
        <div class="card p-5">
          <h3 class="card-title">Data per day</h3>
          <p class="mb-2 text-xs text-ink-400">Downloaded and uploaded through the VPN</p>
          <hs-chart [options]="trafficChart()" [height]="240" label="Line chart of download and upload per day" />
        </div>
      </section>

      <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div class="card p-5 xl:col-span-3">
          <div class="mb-3 flex items-center justify-between">
            <div>
              <h3 class="card-title">Top websites</h3>
              <p class="text-xs text-ink-400">Most looked-up domains, from servers with activity logging on</p>
            </div>
            <a routerLink="/websites" class="text-xs font-semibold text-ink-300 hover:text-ink-100">All websites →</a>
          </div>
          @if (d.topDomains.length) {
            <hs-chart [options]="websitesChart()" [height]="Math.max(160, d.topDomains.length * 30)" label="Bar chart of the most looked-up websites" />
          } @else {
            <hs-empty icon="eye" title="No website activity yet">Turn on activity logging for a server under Servers.</hs-empty>
          }
        </div>

        <div class="card overflow-hidden xl:col-span-2">
          <div class="flex items-center justify-between p-5 pb-3">
            <h3 class="card-title">Top users by data</h3>
            <a routerLink="/users" class="text-xs font-semibold text-ink-300 hover:text-ink-100">All users →</a>
          </div>
          @if (d.topUsers.length) {
            <ul>
              @for (u of d.topUsers; track u.userId) {
                <li>
                  <a [routerLink]="['/users', u.userId]" class="block px-5 py-2.5 hover:bg-white/[0.03]">
                    <div class="flex items-center justify-between gap-3 text-sm">
                      <span class="truncate font-medium">{{ u.displayName || u.email }}</span>
                      <span class="shrink-0 font-mono text-xs tabular-nums text-ink-300">{{ u.downloadBytes + u.uploadBytes | bytes }}</span>
                    </div>
                    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                      <div class="h-full rounded-full bg-series-1" [style.width.%]="share(u.downloadBytes + u.uploadBytes)"></div>
                    </div>
                    <div class="mt-1 text-[11px] text-ink-400">{{ u.sessions }} sessions · {{ u.connectedSeconds | duration }} connected</div>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <hs-empty icon="users" title="Nobody has connected yet" />
          }
        </div>
      </section>

      <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div class="card overflow-hidden xl:col-span-3">
          <div class="flex items-center justify-between p-5 pb-3">
            <h3 class="card-title flex items-center gap-2">Live now
              @if (d.live.length) { <hs-badge tone="green" [dot]="true">{{ d.live.length }}</hs-badge> }
            </h3>
            <a routerLink="/sessions" class="text-xs font-semibold text-ink-300 hover:text-ink-100">All sessions →</a>
          </div>
          @if (d.live.length) {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[560px] text-sm">
                <thead class="table-head"><tr><th>User</th><th>From</th><th>Server</th><th class="!text-right">Connected</th><th class="!text-right">Data</th></tr></thead>
                <tbody>
                  @for (l of d.live; track l.session.id) {
                    <tr class="table-row">
                      <td><a [routerLink]="['/users', l.session.userId]" class="font-medium hover:text-brand-300">{{ l.session.userEmail }}</a>
                        <div class="text-xs text-ink-400">{{ l.deviceName || 'Device' }}</div></td>
                      <td><div class="flex items-center gap-2"><hs-flag [code]="l.session.countryCode" />
                        <div><div>{{ l.session.city || (l.session.countryCode | country: l.session.country) }}</div>
                        <div class="font-mono text-xs text-ink-400">{{ l.session.clientIp }}</div></div></div></td>
                      <td class="text-ink-300">{{ l.nodeName }}</td>
                      <td class="text-right font-mono tabular-nums">{{ l.session.elapsedSeconds | duration }}</td>
                      <td class="text-right font-mono text-xs tabular-nums text-ink-300">{{ l.session.txBytes + l.session.rxBytes | bytes }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <hs-empty icon="activity" title="Nobody is connected right now" />
          }
        </div>

        <div class="card p-5 xl:col-span-2">
          <h3 class="card-title mb-3">Where people connect from</h3>
          @if (d.countries.length) {
            <ul class="space-y-3">
              @for (c of d.countries; track c.countryCode) {
                <li>
                  <div class="flex items-center gap-2.5 text-sm">
                    <hs-flag [code]="c.countryCode" [size]="14" />
                    <span class="flex-1 truncate">{{ c.countryCode | country: c.country }}</span>
                    <span class="text-xs tabular-nums text-ink-300">{{ c.sessions }} sessions · {{ c.users }} {{ c.users === 1 ? 'person' : 'people' }}</span>
                  </div>
                  <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
                    <div class="h-full rounded-full bg-series-1" [style.width.%]="countryShare(c.sessions)"></div>
                  </div>
                </li>
              }
            </ul>
            @if (unknownLocations()) {
              <p class="mt-4 text-xs text-ink-400">"Unknown" means the server has no GeoLite2 database for IP locations yet.</p>
            }
          } @else {
            <hs-empty icon="globe" title="No connections in this period" />
          }
        </div>
      </section>

      <section class="card mt-4 overflow-hidden">
        <div class="flex items-center justify-between p-5 pb-3">
          <div>
            <h3 class="card-title">Recent website activity</h3>
            <p class="text-xs text-ink-400">The latest domains looked up through the VPN</p>
          </div>
          <a routerLink="/websites" class="text-xs font-semibold text-ink-300 hover:text-ink-100">Full log →</a>
        </div>
        @if (d.recentActivity.length) {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[560px] text-sm">
              <thead class="table-head"><tr><th>When</th><th>User</th><th>Website</th><th>Type</th></tr></thead>
              <tbody>
                @for (a of d.recentActivity; track a.id) {
                  <tr class="table-row">
                    <td class="whitespace-nowrap text-ink-400" [title]="a.occurredAt | dateTime">{{ a.occurredAt | relative }}</td>
                    <td><a [routerLink]="['/users', a.userId]" class="hover:text-brand-300">{{ a.userEmail }}</a></td>
                    <td class="font-mono text-xs text-brand-300">{{ a.domain }}</td>
                    <td class="font-mono text-xs text-ink-400">{{ a.queryType }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <hs-empty icon="eye" title="No website activity recorded">Activity logging is off on every server, or nobody has browsed yet.</hs-empty>
        }
      </section>
    }`,
})
export class DashboardPage {
  private readonly api = inject(ApiService);
  protected readonly Math = Math;
  protected readonly days = signal(7);

  protected readonly data = rxResource({
    params: () => ({ days: this.days() }),
    stream: ({ params }) => this.api.dashboard(params.days),
  });

  protected readonly sessionsChart = chartOf(() => this.data.value()?.daily ?? [], sessionsPerDay);
  protected readonly trafficChart = chartOf(() => this.data.value()?.daily ?? [], trafficPerDay);
  protected readonly websitesChart = chartOf(() => this.data.value()?.topDomains ?? [], topWebsites);

  protected readonly totalSessions = computed(() => compact((this.data.value()?.daily ?? []).reduce((n, p) => n + p.sessions, 0)));
  protected readonly totalData = computed(() =>
    bytes((this.data.value()?.daily ?? []).reduce((n, p) => n + p.downloadBytes + p.uploadBytes, 0)),
  );
  protected readonly lookups = computed(() => compact(this.data.value()?.activityLookups ?? 0));
  protected readonly unknownLocations = computed(() => (this.data.value()?.countries ?? []).some((c) => !c.countryCode));

  protected share(total: number): number {
    const max = Math.max(...(this.data.value()?.topUsers ?? []).map((u) => u.downloadBytes + u.uploadBytes), 1);
    return Math.max(2, (total / max) * 100);
  }

  protected countryShare(sessions: number): number {
    const max = Math.max(...(this.data.value()?.countries ?? []).map((c) => c.sessions), 1);
    return Math.max(2, (sessions / max) * 100);
  }
}
