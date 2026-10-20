import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { PlaceStat } from '../../core/models';
import { Chart } from '../../shared/chart';
import { FORMAT_PIPES, compact, countryName } from '../../shared/format';
import { UI } from '../../shared/ui';
import { rankedBars, requestsPerDay, visitsPerDay } from './charts';

interface BarRow {
  label: string;
  value: number;
  hint?: string;
  flag?: string | null;
}

/** A labelled proportional list: the longest bar is the biggest value. */
@Component({
  selector: 'hs-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...UI],
  template: `
    @if (rows().length) {
      <ul class="space-y-2.5">
        @for (r of rows(); track r.label) {
          <li>
            <div class="flex items-center justify-between gap-3 text-sm">
              <span class="flex min-w-0 items-center gap-2">
                @if (flags()) { <hs-flag [code]="r.flag" /> }
                <span class="truncate">{{ r.label }}</span>
              </span>
              <span class="shrink-0 font-mono text-xs tabular-nums text-ink-300">{{ r.value }}</span>
            </div>
            <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5" aria-hidden="true">
              <div class="h-full rounded-full bg-series-1" [style.width.%]="share(r.value)"></div>
            </div>
            @if (r.hint) { <div class="mt-0.5 text-[11px] text-ink-400">{{ r.hint }}</div> }
          </li>
        }
      </ul>
    } @else {
      <p class="py-6 text-center text-sm text-ink-400">{{ empty() }}</p>
    }`,
})
export class BarList {
  readonly rows = input.required<BarRow[]>();
  readonly flags = input(false);
  readonly empty = input('Nothing yet');

  protected share(value: number): number {
    const max = Math.max(...this.rows().map((r) => r.value), 1);
    return Math.max(2, (value / max) * 100);
  }
}

type Tab = 'visitors' | 'api';

const STATUS_LABEL: Record<string, string> = { '2xx': 'Succeeded', '3xx': 'Redirected', '4xx': 'Refused / not found', '5xx': 'Server errors' };
const STATUS_TONE: Record<string, 'green' | 'sky' | 'amber' | 'red'> = { '2xx': 'green', '3xx': 'sky', '4xx': 'amber', '5xx': 'red' };
const CLIENT_LABEL: Record<string, string> = { APP: 'Hidenseek apps', WEB: 'Browsers (console)', OTHER: 'Other (scripts, tools)' };
const DEVICE_LABEL: Record<string, string> = { DESKTOP: 'Desktop', MOBILE: 'Phone', TABLET: 'Tablet', OTHER: 'Other' };

/** Where console visitors come from, and how the API is being used. */
@Component({
  selector: 'hs-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Chart, BarList, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Analytics</h2>
        <p class="mt-1 text-sm text-ink-400">Visitors to this console and requests to the API, located with the server's GeoIP database.</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="btn-ghost px-2" title="Refresh" aria-label="Refresh" (click)="reload()"><hs-icon name="refresh" class="size-4" /></button>
        <hs-period [(value)]="days" />
      </div>
    </div>

    <div class="mb-5 inline-flex gap-1 rounded-xl bg-ink-950/60 p-1 ring-1 ring-white/5" role="tablist">
      @for (t of tabs; track t.id) {
        <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)"
          class="h-8 rounded-lg px-3.5 text-sm font-medium transition-colors"
          [class]="tab() === t.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'">{{ t.label }}</button>
      }
    </div>

    @if (tab() === 'visitors') {
      @if (traffic.error()) {
        <hs-error message="Could not load visitor analytics." />
      } @else if (!traffic.value()) {
        <hs-spinner />
      } @else {
        @let t = traffic.value()!;
        <section class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Visitor figures">
          <hs-stat label="Visitors" [value]="fmt(t.visitors)" icon="users" [hint]="'last ' + t.days + ' days'" />
          <hs-stat label="Visits" [value]="fmt(t.visits)" icon="activity" [hint]="perVisitor(t.visits, t.visitors)" />
          <hs-stat label="Page views" [value]="fmt(t.pageViews)" icon="eye" [hint]="perVisitor(t.pageViews, t.visits, 'per visit')" />
          <hs-stat label="Signed in" [value]="fmt(t.signedInUsers)" icon="user" hint="distinct accounts" />
        </section>

        <section class="card mt-4 p-5">
          <h3 class="card-title">Visitors per day</h3>
          <p class="mb-2 text-xs text-ink-400">Distinct browsers and the pages they opened ({{ timezone() }})</p>
          <hs-chart [options]="visitsChart()" [height]="250" label="Line chart of visitors and page views per day" />
        </section>

        <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
          <div class="card p-5 xl:col-span-3">
            <h3 class="card-title">Traffic sources</h3>
            <p class="mb-3 text-xs text-ink-400">Where visits started: the referring site, a utm_source tag, or Direct (typed, bookmarked, or the app)</p>
            @if (t.sources.length) {
              <hs-chart [options]="sourcesChart()" [height]="Math.max(140, t.sources.length * 32)" label="Bar chart of visits per traffic source" />
            } @else {
              <hs-empty icon="globe" title="No visits yet">Visits appear here as people open the console.</hs-empty>
            }
          </div>
          <div class="card p-5 xl:col-span-2">
            <h3 class="card-title">Devices</h3>
            <p class="mb-3 text-xs text-ink-400">Visitors by device type</p>
            <hs-bar-list [rows]="deviceRows()" empty="No visitors yet" />
          </div>
        </section>

        <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="card p-5">
            <h3 class="card-title">Countries</h3>
            <p class="mb-3 text-xs text-ink-400">Visitors by country</p>
            <hs-bar-list [rows]="placeRows(t.countries, false)" [flags]="true" [empty]="geoEmpty()" />
          </div>
          <div class="card p-5">
            <h3 class="card-title">States &amp; regions</h3>
            <p class="mb-3 text-xs text-ink-400">Visitors by state or province</p>
            <hs-bar-list [rows]="placeRows(t.regions, true)" [flags]="true" [empty]="geoEmpty()" />
          </div>
        </section>

        <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="card overflow-hidden">
            <h3 class="card-title p-5 pb-3">Landing pages</h3>
            @if (t.landingPages.length) {
              <table class="w-full text-sm">
                <thead class="table-head"><tr><th>Page</th><th class="!text-right">Visits</th><th class="!text-right">Visitors</th></tr></thead>
                <tbody>
                  @for (p of t.landingPages; track p.path) {
                    <tr class="table-row"><td class="font-mono text-xs">{{ p.path }}</td>
                      <td class="text-right tabular-nums">{{ p.views }}</td><td class="text-right tabular-nums text-ink-300">{{ p.visitors }}</td></tr>
                  }
                </tbody>
              </table>
            } @else { <p class="px-5 pb-5 text-sm text-ink-400">No visits yet.</p> }
          </div>
          <div class="card overflow-hidden">
            <h3 class="card-title p-5 pb-3">Most viewed pages</h3>
            @if (t.topPages.length) {
              <table class="w-full text-sm">
                <thead class="table-head"><tr><th>Page</th><th class="!text-right">Views</th><th class="!text-right">Visitors</th></tr></thead>
                <tbody>
                  @for (p of t.topPages; track p.path) {
                    <tr class="table-row"><td class="font-mono text-xs">{{ p.path }}</td>
                      <td class="text-right tabular-nums">{{ p.views }}</td><td class="text-right tabular-nums text-ink-300">{{ p.visitors }}</td></tr>
                  }
                </tbody>
              </table>
            } @else { <p class="px-5 pb-5 text-sm text-ink-400">No page views yet.</p> }
          </div>
        </section>

        <section class="card mt-4 overflow-hidden">
          <div class="p-5 pb-3">
            <h3 class="card-title">Campaigns</h3>
            <p class="text-xs text-ink-400">Visits from links tagged with <span class="font-mono">utm_source</span>, <span class="font-mono">utm_medium</span> or <span class="font-mono">utm_campaign</span></p>
          </div>
          @if (t.campaigns.length) {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[520px] text-sm">
                <thead class="table-head"><tr><th>Source</th><th>Medium</th><th>Campaign</th><th class="!text-right">Visits</th></tr></thead>
                <tbody>
                  @for (c of t.campaigns; track $index) {
                    <tr class="table-row"><td>{{ c.source || '—' }}</td><td class="text-ink-300">{{ c.medium || '—' }}</td>
                      <td class="text-ink-300">{{ c.campaign || '—' }}</td><td class="text-right tabular-nums">{{ c.visits }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="px-5 pb-5 text-sm text-ink-400">No tagged visits. Share links like <span class="font-mono text-ink-300">…/console/?utm_source=whatsapp&amp;utm_campaign=invite</span> to see them here.</p>
          }
        </section>
      }
    } @else {
      @if (api.error()) {
        <hs-error message="Could not load API analytics." />
      } @else if (!api.value()) {
        <hs-spinner />
      } @else {
        @let a = api.value()!;
        <section class="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="API figures">
          <hs-stat label="Audited requests" [value]="fmt(a.requests)" icon="activity" [hint]="'last ' + a.days + ' days'" />
          <hs-stat label="Failed" [value]="fmt(a.failures)" icon="alert" [hint]="failureRate(a.failures, a.requests)" />
          <hs-stat label="People" [value]="fmt(a.uniqueUsers)" icon="users" hint="signed-in callers" />
          <hs-stat label="IP addresses" [value]="fmt(a.uniqueIps)" icon="globe" hint="distinct" />
          <hs-stat label="Avg response" [value]="a.avgMs + ' ms'" icon="clock" />
        </section>

        <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div class="card p-5 xl:col-span-2">
            <h3 class="card-title">Requests per day</h3>
            <p class="mb-2 text-xs text-ink-400">{{ readsNote() }}</p>
            <hs-chart [options]="requestsChart()" [height]="250" label="Stacked bar chart of succeeded and failed requests per day" />
          </div>
          <div class="card p-5">
            <h3 class="card-title">Outcomes</h3>
            <ul class="mt-3 space-y-2.5">
              @for (s of statusKeys; track s) {
                <li class="flex items-center justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2"><hs-badge [tone]="statusTone[s]">{{ s }}</hs-badge>{{ statusLabel[s] }}</span>
                  <span class="font-mono text-xs tabular-nums text-ink-300">{{ a.statusClasses[s] }}</span>
                </li>
              }
            </ul>
            <h3 class="card-title mt-6">Clients</h3>
            <div class="mt-3"><hs-bar-list [rows]="clientRows()" /></div>
          </div>
        </section>

        <section class="card mt-4 overflow-hidden">
          <div class="flex items-center justify-between p-5 pb-3">
            <h3 class="card-title">Busiest endpoints</h3>
            <a routerLink="/audit" class="text-xs font-semibold text-ink-300 hover:text-ink-100">Audit log →</a>
          </div>
          @if (a.topRoutes.length) {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[600px] text-sm">
                <thead class="table-head"><tr><th>Endpoint</th><th class="!text-right">Requests</th><th class="!text-right">Failed</th><th class="!text-right">Avg</th></tr></thead>
                <tbody>
                  @for (r of a.topRoutes; track r.method + r.route) {
                    <tr class="table-row">
                      <td class="font-mono text-xs"><span class="mr-2 font-semibold text-ink-300">{{ r.method }}</span>{{ r.route }}</td>
                      <td class="text-right tabular-nums">{{ r.requests }}</td>
                      <td class="text-right tabular-nums" [class.text-rose-300]="r.failures > 0">{{ r.failures }}</td>
                      <td class="text-right font-mono text-xs tabular-nums text-ink-300">{{ r.avgMs }} ms</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <hs-empty icon="activity" title="No audited requests yet" /> }
        </section>

        <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="card overflow-hidden">
            <h3 class="card-title p-5 pb-3">Most active people</h3>
            @if (a.topUsers.length) {
              <table class="w-full text-sm">
                <thead class="table-head"><tr><th>Person</th><th class="!text-right">Requests</th><th class="!text-right">Failed</th><th class="!text-right">Last</th></tr></thead>
                <tbody>
                  @for (u of a.topUsers; track u.email) {
                    <tr class="table-row">
                      <td><a [routerLink]="['/audit']" [queryParams]="{ user: u.email }" class="hover:text-brand-300">{{ u.email }}</a></td>
                      <td class="text-right tabular-nums">{{ u.requests }}</td>
                      <td class="text-right tabular-nums" [class.text-rose-300]="u.failures > 0">{{ u.failures }}</td>
                      <td class="whitespace-nowrap text-right text-ink-400">{{ u.lastSeen | relative }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="px-5 pb-5 text-sm text-ink-400">No signed-in requests yet.</p> }
          </div>
          <div class="card overflow-hidden">
            <h3 class="card-title p-5 pb-3">Top IP addresses</h3>
            @if (a.topIps.length) {
              <table class="w-full text-sm">
                <thead class="table-head"><tr><th>IP</th><th>Where</th><th class="!text-right">Requests</th><th class="!text-right">Failed</th></tr></thead>
                <tbody>
                  @for (i of a.topIps; track i.ip) {
                    <tr class="table-row">
                      <td><a [routerLink]="['/audit']" [queryParams]="{ q: i.ip }" class="font-mono text-xs hover:text-brand-300">{{ i.ip }}</a></td>
                      <td><span class="flex items-center gap-2"><hs-flag [code]="i.countryCode" />{{ i.region || (i.countryCode | country) }}</span></td>
                      <td class="text-right tabular-nums">{{ i.requests }}</td>
                      <td class="text-right tabular-nums" [class.text-rose-300]="i.failures > 0">{{ i.failures }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else { <p class="px-5 pb-5 text-sm text-ink-400">No requests yet.</p> }
          </div>
        </section>

        <section class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div class="card p-5">
            <h3 class="card-title">Countries</h3>
            <p class="mb-3 text-xs text-ink-400">Requests by country</p>
            <hs-bar-list [rows]="placeRows(a.countries, false)" [flags]="true" [empty]="geoEmpty()" />
          </div>
          <div class="card p-5">
            <h3 class="card-title">States &amp; regions</h3>
            <p class="mb-3 text-xs text-ink-400">Requests by state or province</p>
            <hs-bar-list [rows]="placeRows(a.regions, true)" [flags]="true" [empty]="geoEmpty()" />
          </div>
        </section>
      }
    }`,
})
export class AnalyticsPage {
  private readonly apiService = inject(ApiService);
  protected readonly Math = Math;
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'visitors', label: 'Visitors' },
    { id: 'api', label: 'API' },
  ];
  protected readonly statusKeys = ['2xx', '3xx', '4xx', '5xx'];
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;

  /** ?tab=api from links elsewhere in the console. */
  readonly tabParam = input<Tab | undefined>(undefined, { alias: 'tab' });
  protected readonly tab = linkedSignal<Tab>(() => (this.tabParam() === 'api' ? 'api' : 'visitors'));
  protected readonly days = signal(30);

  protected readonly traffic = rxResource({
    params: () => (this.tab() === 'visitors' ? this.days() : undefined),
    stream: ({ params }) => this.apiService.trafficStats(params),
  });
  protected readonly api = rxResource({
    params: () => (this.tab() === 'api' ? this.days() : undefined),
    stream: ({ params }) => this.apiService.auditStats(params),
  });
  private readonly system = rxResource({ stream: () => this.apiService.system() });

  protected readonly visitsChart = computed(() => visitsPerDay(this.traffic.value()?.daily ?? []));
  protected readonly requestsChart = computed(() => requestsPerDay(this.api.value()?.daily ?? []));
  protected readonly sourcesChart = computed(() =>
    rankedBars((this.traffic.value()?.sources ?? []).map((s) => ({
      label: s.source,
      value: s.visits,
      detail: `${s.visits} ${s.visits === 1 ? 'visit' : 'visits'} · ${s.visitors} ${s.visitors === 1 ? 'visitor' : 'visitors'}`,
    }))),
  );
  protected readonly deviceRows = computed<BarRow[]>(() =>
    Object.entries(this.traffic.value()?.devices ?? {})
      .filter(([, n]) => n > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([d, n]) => ({ label: DEVICE_LABEL[d] ?? d, value: n })),
  );
  protected readonly clientRows = computed<BarRow[]>(() =>
    Object.entries(this.api.value()?.clients ?? {}).map(([c, n]) => ({ label: CLIENT_LABEL[c] ?? c, value: n })),
  );
  protected readonly timezone = computed(() => this.system.value()?.timezone ?? 'server time');
  protected readonly geoEmpty = computed(() =>
    this.system.value()?.geoipEnabled === false ? 'Set GEOIP_DATABASE on the server to see locations' : 'No located traffic yet',
  );
  protected readonly readsNote = computed(() =>
    this.system.value()?.auditLogReads
      ? 'Every API request'
      : 'Changes, failures and refusals. Successful reads are skipped unless AUDIT_LOG_READS is on.',
  );

  protected reload() {
    if (this.tab() === 'visitors') this.traffic.reload();
    else this.api.reload();
  }

  protected fmt(n: number): string {
    return compact(n);
  }

  protected perVisitor(n: number, of: number, unit = 'per visitor'): string {
    return of ? `${(n / of).toFixed(1)} ${unit}` : '';
  }

  protected failureRate(failures: number, total: number): string {
    return total ? `${((failures / total) * 100).toFixed(1)}% of requests` : '';
  }

  protected placeRows(places: PlaceStat[], regions: boolean): BarRow[] {
    // Visitors tab ranks by distinct visitors; the API tab by requests (with distinct IPs as the hint).
    const visitors = this.tab() === 'visitors';
    return places.map((p) => ({
      label: regions ? `${p.name}, ${countryName(p.countryCode)}` : countryName(p.code, p.name),
      value: visitors ? p.uniques : p.requests,
      hint: visitors ? `${p.requests} page views` : `${p.uniques} IP ${p.uniques === 1 ? 'address' : 'addresses'}`,
      flag: p.countryCode,
    }));
  }
}
