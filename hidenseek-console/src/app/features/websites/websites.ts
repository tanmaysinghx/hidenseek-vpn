import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Chart, chartOf } from '../../shared/chart';
import { FORMAT_PIPES } from '../../shared/format';
import { UI } from '../../shared/ui';
import { topWebsites } from '../dashboard/charts';

const PAGE = 100;

@Component({
  selector: 'hs-websites',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FormsModule, Chart, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold tracking-tight">Websites</h2>
        <p class="mt-1 max-w-2xl text-sm text-ink-400">Domains looked up through the VPN on servers with activity logging on.
          Page contents and full URLs are never visible; records are deleted after the retention period.</p>
      </div>
      <hs-period [(value)]="days" />
    </div>

    <div class="mb-4 flex flex-wrap gap-2">
      <select class="input w-full sm:w-72" [ngModel]="userId()" (ngModelChange)="userId.set($event); page.set(0)" aria-label="Person">
        <option value="">Everyone</option>
        @for (u of users.value() ?? []; track u.id) { <option [value]="u.id">{{ u.displayName ? u.displayName + ' · ' : '' }}{{ u.email }}</option> }
      </select>
    </div>

    <section class="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <div class="card p-5 xl:col-span-3">
        <h3 class="card-title">Top websites</h3>
        <p class="mb-2 text-xs text-ink-400">By number of lookups</p>
        @if (top.value()?.length) {
          <hs-chart [options]="chart()" [height]="Math.max(160, Math.min(top.value()!.length, 10) * 30)" label="Bar chart of the most looked-up websites" />
        } @else if (top.isLoading()) {
          <hs-spinner />
        } @else {
          <hs-empty icon="eye" title="No website activity">Turn on "Log activity" for a server under Servers.</hs-empty>
        }
      </div>
      <div class="card overflow-hidden xl:col-span-2">
        <h3 class="card-title p-5 pb-3">Ranking</h3>
        <div class="max-h-[340px] overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="table-head sticky top-0 bg-ink-850"><tr><th>Website</th><th class="!text-right">Lookups</th><th class="!text-right">People</th></tr></thead>
            <tbody>
              @for (d of top.value() ?? []; track d.domain) {
                <tr class="table-row cursor-pointer" (click)="search.set(d.domain); page.set(0)" [title]="'Last seen ' + (d.lastSeen | dateTime)">
                  <td class="max-w-[200px] truncate font-mono text-xs text-brand-300">{{ d.domain }}</td>
                  <td class="text-right tabular-nums">{{ d.lookups }}</td>
                  <td class="text-right tabular-nums text-ink-300">{{ d.users }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="card mt-4 overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <h3 class="card-title">Activity log</h3>
        <label class="flex h-9 w-full items-center gap-2 rounded-xl border border-white/10 bg-ink-950/60 px-3 sm:w-72">
          <hs-icon name="search" class="size-4 text-ink-400" />
          <input class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400" placeholder="Filter domains, e.g. youtube"
            [ngModel]="search()" (ngModelChange)="search.set($event); page.set(0)" />
          @if (search()) { <button aria-label="Clear" (click)="search.set('')"><hs-icon name="x" class="size-4 text-ink-400" /></button> }
        </label>
      </div>
      @if (log.value()?.items?.length) {
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead class="table-head"><tr><th>When</th><th>User</th><th>Website</th><th>Type</th></tr></thead>
            <tbody>
              @for (a of log.value()!.items; track a.id) {
                <tr class="table-row">
                  <td class="whitespace-nowrap text-ink-400">{{ a.occurredAt | dateTime }}</td>
                  <td><a [routerLink]="['/users', a.userId]" class="hover:text-brand-300">{{ a.userEmail }}</a></td>
                  <td class="font-mono text-xs text-brand-300">{{ a.domain }}</td>
                  <td class="font-mono text-xs text-ink-400">{{ a.queryType }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-white/5 p-3 text-xs text-ink-400">
          <span>{{ log.value()!.total }} lookups</span>
          <button class="btn-secondary h-8 px-3 text-xs" [disabled]="page() === 0" (click)="page.set(page() - 1)">Newer</button>
          <span>Page {{ page() + 1 }} of {{ pages() }}</span>
          <button class="btn-secondary h-8 px-3 text-xs" [disabled]="page() + 1 >= pages()" (click)="page.set(page() + 1)">Older</button>
        </div>
      } @else if (log.isLoading()) {
        <hs-spinner />
      } @else {
        <hs-empty icon="search" title="Nothing matches" />
      }
    </section>`,
})
export class WebsitesPage {
  private readonly api = inject(ApiService);
  protected readonly Math = Math;
  protected readonly days = signal(7);
  protected readonly userId = signal('');
  protected readonly search = signal('');
  protected readonly page = signal(0);

  protected readonly users = rxResource({ stream: () => this.api.users() });
  protected readonly top = rxResource({
    params: () => ({ days: this.days(), userId: this.userId() }),
    stream: ({ params }) => this.api.websites(params.days, params.userId, 50),
  });
  protected readonly log = rxResource({
    params: () => ({ days: this.days(), userId: this.userId(), q: this.search(), page: this.page() }),
    stream: ({ params }) => this.api.activity({ ...params, size: PAGE }),
  });

  protected readonly chart = chartOf(() => this.top.value() ?? [], topWebsites);
  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.log.value()?.total ?? 0) / PAGE)));
}
