import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { DataSet } from '../../core/models';
import { FORMAT_PIPES, compact } from '../../shared/format';
import { UI } from '../../shared/ui';

/** yyyy-MM-dd in the browser's timezone. */
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const DESCRIPTION: Record<string, string> = {
  audit: 'API requests: who, what, result, IP and location.',
  traffic: 'Console page views, referrers and campaign tags.',
  activity: 'Domains looked up through servers with activity logging on.',
};

/** System status, stored data and its retention, and manual clean-up. */
@Component({
  selector: 'hs-control-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Control panel</h2>
        <p class="mt-1 text-sm text-ink-400">What the server stores, how long it keeps it, and clean-up.</p>
      </div>
      <button class="btn-ghost px-2" title="Refresh" aria-label="Refresh" (click)="system.reload()"><hs-icon name="refresh" class="size-4" /></button>
    </div>

    @if (system.error()) {
      <hs-error message="Could not load the system status." />
    } @else if (!system.value()) {
      <hs-spinner />
    } @else {
      @let s = system.value()!;
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Totals">
        <hs-stat label="Users" [value]="s.users" icon="users" />
        <hs-stat label="Servers" [value]="s.nodes" icon="server" />
        <hs-stat label="Devices" [value]="s.devices" icon="laptop" />
        <hs-stat label="Timezone" [value]="s.timezone" icon="clock" hint="days and daily resets" />
      </section>

      <section class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="card p-5">
          <div class="flex items-center justify-between gap-3">
            <h3 class="card-title">GeoIP locations</h3>
            @if (s.geoipEnabled) { <hs-badge tone="green" [dot]="true">on</hs-badge> } @else { <hs-badge tone="amber" [dot]="true">off</hs-badge> }
          </div>
          <p class="mt-2 text-sm text-ink-300">
            @if (s.geoipEnabled) {
              Client IPs are located (country, state, city) with the local MaxMind database. No IP leaves the server.
            } @else {
              Set <span class="font-mono text-ink-100">GEOIP_DATABASE</span> to a GeoLite2-City <span class="font-mono">.mmdb</span> file
              and restart the backend to see countries and states in analytics.
            }
          </p>
        </div>
        <div class="card p-5">
          <div class="flex items-center justify-between gap-3">
            <h3 class="card-title">Audit detail</h3>
            <hs-badge [tone]="s.auditLogReads ? 'sky' : 'gray'">{{ s.auditLogReads ? 'every request' : 'changes & failures' }}</hs-badge>
          </div>
          <p class="mt-2 text-sm text-ink-300">
            @if (s.auditLogReads) {
              Every API request is recorded, including the apps' polling. Set <span class="font-mono text-ink-100">AUDIT_LOG_READS=false</span> to keep only changes, failures and refusals.
            } @else {
              Changes, failures and refused requests are recorded; successful reads are skipped because the apps poll.
              Set <span class="font-mono text-ink-100">AUDIT_LOG_READS=true</span> to record everything.
            }
          </p>
        </div>
      </section>

      <h3 class="mb-3 mt-8 text-sm font-semibold">Stored data</h3>
      <hs-error [message]="error()" />
      @if (notice()) {
        <div class="mb-3 rounded-xl border border-brand-500/20 bg-brand-500/[0.08] px-3.5 py-3 text-sm" role="status">{{ notice() }}</div>
      }
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        @for (d of s.data; track d.id) {
          <article class="card flex flex-col p-5">
            <div class="flex items-center justify-between gap-2">
              <h4 class="font-semibold">{{ d.label }}</h4>
              <a [routerLink]="link[d.id]" class="text-xs font-semibold text-ink-300 hover:text-ink-100">View →</a>
            </div>
            <p class="mt-1 text-xs text-ink-400">{{ description[d.id] }}</p>
            <dl class="mt-4 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-lg bg-white/[0.03] py-2"><dt class="text-[11px] text-ink-400">Rows</dt><dd class="text-sm font-semibold tabular-nums">{{ fmt(d.rows) }}</dd></div>
              <div class="rounded-lg bg-white/[0.03] py-2"><dt class="text-[11px] text-ink-400">Oldest</dt><dd class="text-sm font-semibold">{{ d.oldest ? (d.oldest | relative) : '—' }}</dd></div>
              <div class="rounded-lg bg-white/[0.03] py-2"><dt class="text-[11px] text-ink-400">Kept for</dt><dd class="text-sm font-semibold">{{ d.retentionDays }}d</dd></div>
            </dl>
            <form class="mt-4 border-t border-white/5 pt-4" (ngSubmit)="purge(d)">
              <label class="block text-xs text-ink-400" [for]="'before-' + d.id">Delete everything from before</label>
              <div class="mt-1.5 flex gap-2">
                <input class="input h-9 min-w-0 flex-1" type="date" [id]="'before-' + d.id" [name]="'before-' + d.id"
                  [max]="today" [(ngModel)]="before[d.id]" required />
                <button type="submit" class="btn-danger h-9 px-3 text-xs" [disabled]="busy() === d.id || !before[d.id] || !d.rows">
                  <hs-icon name="trash" class="size-3.5" />Delete
                </button>
              </div>
              <p class="mt-1.5 text-[11px] text-ink-400">Older records are removed automatically after {{ d.retentionDays }} days. Today's are always kept.</p>
            </form>
          </article>
        }
      </div>

      <h3 class="mb-3 mt-8 text-sm font-semibold">Shortcuts</h3>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
        @for (l of shortcuts; track l.path) {
          <a [routerLink]="l.path" class="card flex items-center gap-3 p-4 text-sm font-medium hover:border-white/15">
            <hs-icon [name]="l.icon" class="size-[18px] text-brand-400" />{{ l.label }}
          </a>
        }
      </div>
    }`,
})
export class ControlPanelPage {
  private readonly api = inject(ApiService);
  protected readonly system = rxResource({ stream: () => this.api.system() });
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly today = isoDay(new Date());
  protected readonly description = DESCRIPTION;
  protected readonly link: Record<string, string> = { audit: '/audit', traffic: '/analytics', activity: '/websites' };
  /** Default: everything older than 30 days. */
  protected readonly before: Record<string, string> = Object.fromEntries(
    ['audit', 'traffic', 'activity'].map((id) => [id, isoDay(new Date(Date.now() - 30 * 86_400_000))]),
  );
  protected readonly shortcuts = [
    { path: '/analytics', label: 'Analytics', icon: 'chart' },
    { path: '/audit', label: 'Audit log', icon: 'list' },
    { path: '/users', label: 'Users', icon: 'users' },
    { path: '/plans', label: 'Plans', icon: 'gauge' },
    { path: '/servers', label: 'Servers', icon: 'server' },
  ];

  protected fmt(n: number): string {
    return compact(n);
  }

  protected async purge(d: DataSet) {
    const before = this.before[d.id];
    const when = new Date(`${before}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    if (!window.confirm(`Delete all ${d.label.toLowerCase()} records from before ${when}? This can't be undone.`)) return;
    this.busy.set(d.id);
    this.error.set(null);
    this.notice.set(null);
    try {
      const result = await firstValueFrom(this.api.purge(d.id, before));
      this.notice.set(`Deleted ${result.deleted.toLocaleString()} ${d.label.toLowerCase()} ${result.deleted === 1 ? 'record' : 'records'} from before ${when}.`);
      this.system.reload();
    } catch (e) {
      this.error.set((e as { error?: { message?: string } })?.error?.message ?? `Could not delete ${d.label.toLowerCase()} records.`);
    } finally {
      this.busy.set(null);
    }
  }
}
