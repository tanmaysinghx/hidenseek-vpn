import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuditLog } from '../../core/models';
import { FORMAT_PIPES } from '../../shared/format';
import { UI } from '../../shared/ui';

const PAGE_SIZE = 50;

/** Every audited API request, newest first. */
@Component({
  selector: 'hs-audit-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Audit log</h2>
        <p class="mt-1 text-sm text-ink-400">Who called the API, from where, and what happened. Changes, failures and refusals are always recorded.</p>
      </div>
      <div class="flex items-center gap-2">
        <a routerLink="/analytics" [queryParams]="{ tab: 'api' }" class="btn-secondary h-9 px-3 text-xs">Stats</a>
        <button class="btn-ghost px-2" title="Refresh" aria-label="Refresh" (click)="logs.reload()"><hs-icon name="refresh" class="size-4" /></button>
      </div>
    </div>

    <div class="mb-3 flex flex-wrap items-center gap-2">
      <label class="flex h-9 w-full items-center gap-2 rounded-xl border border-white/10 bg-ink-950/60 px-3 sm:w-72">
        <hs-icon name="search" class="size-4 text-ink-400" />
        <input class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400" placeholder="Path, IP or email"
          aria-label="Search the audit log" [ngModel]="query()" (ngModelChange)="query.set($event); page.set(0)" />
      </label>
      <select class="select" aria-label="Period" [ngModel]="days()" (ngModelChange)="days.set(+$event); page.set(0)">
        <option [ngValue]="1">Today</option><option [ngValue]="7">7 days</option>
        <option [ngValue]="30">30 days</option><option [ngValue]="90">90 days</option><option [ngValue]="365">1 year</option>
      </select>
      <select class="select" aria-label="Method" [ngModel]="method()" (ngModelChange)="method.set($event); page.set(0)">
        <option value="">Any method</option>
        @for (m of methods; track m) { <option [value]="m">{{ m }}</option> }
      </select>
      <select class="select" aria-label="Outcome" [ngModel]="status()" (ngModelChange)="status.set($event); page.set(0)">
        <option value="">Any outcome</option><option value="failed">Failed (4xx/5xx)</option>
        <option value="2xx">Succeeded (2xx)</option><option value="401">401 not signed in</option>
        <option value="403">403 refused</option><option value="404">404 not found</option><option value="5xx">Server errors (5xx)</option>
      </select>
      @if (user()) {
        <span class="inline-flex h-9 items-center gap-2 rounded-xl bg-white/[0.06] px-3 text-xs">
          {{ user() }}
          <button class="text-ink-400 hover:text-ink-100" aria-label="Clear person filter" (click)="user.set(null); page.set(0)"><hs-icon name="x" class="size-3.5" /></button>
        </span>
      }
    </div>

    <div class="card overflow-hidden">
      @if (logs.error()) {
        <div class="p-4"><hs-error message="Could not load the audit log." /></div>
      } @else if (logs.isLoading() && !logs.value()) {
        <hs-spinner />
      } @else if (!logs.value()?.items?.length) {
        <hs-empty icon="list" title="Nothing recorded">No audited requests match these filters.</hs-empty>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full min-w-[860px] text-sm">
            <thead class="table-head"><tr><th>When</th><th>Who</th><th>Request</th><th>Result</th><th>From</th><th>Client</th></tr></thead>
            <tbody>
              @for (l of logs.value()!.items; track l.id) {
                <tr class="table-row cursor-pointer" (click)="toggle(l.id)" [attr.aria-expanded]="open() === l.id">
                  <td class="whitespace-nowrap text-ink-300" [title]="l.occurredAt | dateTime">{{ l.occurredAt | relative }}</td>
                  <td class="max-w-[200px] truncate">
                    @if (l.userEmail) {
                      <button class="hover:text-brand-300" (click)="$event.stopPropagation(); user.set(l.userEmail); page.set(0)">{{ l.userEmail }}</button>
                    } @else { <span class="text-ink-400">anonymous</span> }
                  </td>
                  <td class="max-w-[320px] truncate font-mono text-xs"><span class="mr-2 font-semibold text-ink-300">{{ l.method }}</span>{{ l.path }}</td>
                  <td class="whitespace-nowrap"><hs-badge [tone]="tone(l.status)">{{ l.status }}</hs-badge>
                    <span class="ml-2 font-mono text-[11px] text-ink-400">{{ l.durationMs }} ms</span></td>
                  <td class="whitespace-nowrap">
                    <span class="flex items-center gap-2"><hs-flag [code]="l.countryCode" />
                      <span class="truncate">{{ place(l) }}</span></span>
                    <span class="font-mono text-[11px] text-ink-400">{{ l.ip || 'unknown IP' }}</span>
                  </td>
                  <td class="text-xs text-ink-300">{{ clientLabel[l.client] }}</td>
                </tr>
                @if (open() === l.id) {
                  <tr class="bg-white/[0.02]">
                    <td colspan="6" class="px-4 py-3">
                      <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
                        <dt class="text-ink-400">Time</dt><dd class="font-mono">{{ l.occurredAt }}</dd>
                        <dt class="text-ink-400">Path</dt><dd class="break-all font-mono">{{ l.method }} {{ l.path }}</dd>
                        <dt class="text-ink-400">Endpoint</dt><dd class="font-mono text-ink-300">{{ l.route }}</dd>
                        <dt class="text-ink-400">Location</dt><dd>{{ fullPlace(l) }}</dd>
                        <dt class="text-ink-400">Referrer</dt><dd class="break-all font-mono">{{ l.referrer || '—' }}</dd>
                        <dt class="text-ink-400">User agent</dt><dd class="break-all font-mono text-ink-300">{{ l.userAgent || '—' }}</dd>
                      </dl>
                      @if (l.ip) {
                        <button class="btn-ghost mt-2 h-7 px-2 text-xs" (click)="query.set(l.ip); page.set(0)">All requests from {{ l.ip }}</button>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-white/5 px-4 py-3 text-xs text-ink-400">
          <span>{{ range() }}</span>
          <div class="flex gap-2">
            <button class="btn-secondary h-8 px-3 text-xs" [disabled]="page() === 0" (click)="page.set(page() - 1)">Newer</button>
            <button class="btn-secondary h-8 px-3 text-xs" [disabled]="!hasMore()" (click)="page.set(page() + 1)">Older</button>
          </div>
        </div>
      }
    </div>`,
  styles: `.select { height: 2.25rem; border-radius: 0.75rem; border: 1px solid rgb(255 255 255 / 0.1);
    background: color-mix(in srgb, var(--color-ink-950) 60%, transparent); padding: 0 0.6rem; font-size: 0.8rem;
    color: var(--color-ink-100); outline: none; }`,
})
export class AuditLogPage {
  private readonly api = inject(ApiService);
  protected readonly methods = ['POST', 'PUT', 'PATCH', 'DELETE', 'GET'];
  protected readonly clientLabel = { APP: 'App', WEB: 'Browser', OTHER: 'Other' };

  /** ?user= and ?q= from links on the analytics page. */
  readonly userParam = input<string | undefined>(undefined, { alias: 'user' });
  readonly qParam = input<string | undefined>(undefined, { alias: 'q' });
  protected readonly user = linkedSignal<string | null>(() => this.userParam() ?? null);
  protected readonly query = linkedSignal(() => this.qParam() ?? '');
  protected readonly days = signal(7);
  protected readonly method = signal('');
  protected readonly status = signal('');
  protected readonly page = signal(0);
  protected readonly open = signal<number | null>(null);

  private readonly debouncedQuery = toSignal(toObservable(this.query).pipe(debounceTime(300)), { initialValue: '' });

  protected readonly logs = rxResource({
    params: () => ({
      days: this.days(), user: this.user(), method: this.method(), status: this.status(),
      q: this.debouncedQuery(), page: this.page(), size: PAGE_SIZE,
    }),
    stream: ({ params }) => this.api.auditLogs(params),
  });

  protected readonly hasMore = computed(() => {
    const p = this.logs.value();
    return !!p && (p.page + 1) * p.size < p.total;
  });
  protected readonly range = computed(() => {
    const p = this.logs.value();
    if (!p || !p.total) return '';
    const from = p.page * p.size + 1;
    return `${from}–${from + p.items.length - 1} of ${p.total}`;
  });

  protected toggle(id: number) {
    this.open.set(this.open() === id ? null : id);
  }

  protected tone(status: number): 'green' | 'sky' | 'amber' | 'red' {
    return status >= 500 ? 'red' : status >= 400 ? 'amber' : status >= 300 ? 'sky' : 'green';
  }

  protected place(l: AuditLog): string {
    return l.region || l.country || (l.ip ? 'Unknown location' : '—');
  }

  protected fullPlace(l: AuditLog): string {
    return [l.city, l.region, l.country].filter(Boolean).join(', ') || 'Unknown (private IP, or no GeoIP database)';
  }
}
