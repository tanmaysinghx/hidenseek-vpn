import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Plan, PlanRequest, PlanRequestStatus } from '../../core/models';
import { FORMAT_PIPES } from '../../shared/format';
import { UI } from '../../shared/ui';

const GB = 1024 ** 3;
const TONE: Record<PlanRequestStatus, 'amber' | 'green' | 'red' | 'gray'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'gray',
};

/** Upgrade requests to approve or reject, and the plan catalogue. */
@Component({
  selector: 'hs-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6">
      <h2 class="text-2xl font-bold tracking-tight">Plans</h2>
      <p class="mt-1 text-sm text-ink-400">Daily data allowances. People request an upgrade in the app; payment happens outside it, so approve once you've been paid.</p>
    </div>
    <hs-error [message]="error()" />

    <section class="mt-3">
      <div class="mb-3 flex items-center justify-between gap-3">
        <h3 class="text-sm font-semibold">Requests</h3>
        <div class="inline-flex gap-1 rounded-xl bg-ink-950/60 p-1 ring-1 ring-white/5">
          @for (all of [false, true]; track all) {
            <button type="button" (click)="showAll.set(all)" class="h-7 rounded-lg px-3 text-xs font-semibold transition-colors"
              [class]="showAll() === all ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'">{{ all ? 'Recent' : 'Pending' }}</button>
          }
        </div>
      </div>
      <div class="card overflow-hidden">
        @if (requests.isLoading() && !requests.value()) {
          <hs-spinner />
        } @else if (!requests.value()?.length) {
          <hs-empty icon="gauge" [title]="showAll() ? 'No requests yet' : 'Nothing waiting'">People request a bigger plan from the Plan screen in the app.</hs-empty>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[760px] text-sm">
              <thead class="table-head"><tr><th>Person</th><th>Wants</th><th>Message</th><th>Asked</th><th class="!text-right">Decision</th></tr></thead>
              <tbody>
                @for (r of requests.value()!; track r.id) {
                  <tr class="table-row">
                    <td><span class="block truncate font-medium">{{ r.userName || r.userEmail || 'Deleted user' }}</span>
                      <span class="block truncate text-xs text-ink-400">{{ r.userEmail }}</span></td>
                    <td><hs-badge tone="sky">{{ r.plan.name }}</hs-badge></td>
                    <td class="max-w-xs text-xs text-ink-300">{{ r.note || '—' }}</td>
                    <td class="whitespace-nowrap text-ink-300">{{ r.createdAt | relative }}</td>
                    <td class="text-right">
                      @if (r.status === 'PENDING') {
                        <div class="inline-flex items-center gap-2">
                          <select class="h-8 rounded-lg border border-white/10 bg-ink-950/60 px-2 text-xs font-semibold text-ink-100 outline-none"
                            aria-label="How long the plan lasts" [ngModel]="days[r.id] ?? 30" (ngModelChange)="days[r.id] = $event">
                            <option [ngValue]="30">30 days</option><option [ngValue]="90">90 days</option>
                            <option [ngValue]="365">1 year</option><option [ngValue]="null">No end date</option>
                          </select>
                          <button class="btn-primary h-8 px-3 text-xs" [disabled]="busy()" (click)="decide(r, 'approve')"><hs-icon name="check" class="size-3.5" />Approve</button>
                          <button class="btn-danger h-8 px-3 text-xs" [disabled]="busy()" (click)="decide(r, 'reject')"><hs-icon name="x" class="size-3.5" />Reject</button>
                        </div>
                      } @else {
                        <div class="inline-flex flex-col items-end gap-1">
                          <hs-badge [tone]="tone[r.status]">{{ r.status.toLowerCase() }}</hs-badge>
                          @if (r.decidedBy) { <span class="text-[11px] text-ink-400">by {{ r.decidedBy }} · {{ r.decidedAt | relative }}</span> }
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>

    <section class="mt-8">
      <h3 class="mb-3 text-sm font-semibold">Catalogue</h3>
      @if (plans.isLoading() && !plans.value()) {
        <hs-spinner />
      } @else {
        <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
          @for (p of plans.value() ?? []; track p.id) {
            <article class="card flex flex-col p-5">
              <div class="flex items-center justify-between gap-2">
                <h4 class="font-semibold">{{ p.name }}</h4>
                @if (p.isDefault) { <hs-badge>default</hs-badge> }
              </div>
              <div class="mt-2 text-2xl font-bold tracking-tight">{{ p.dailyLimitBytes | allowance }}
                @if (p.dailyLimitBytes !== null) { <span class="text-sm font-normal text-ink-400">/ day</span> }</div>
              <div class="text-xs text-ink-400">{{ p.priceLabel || 'No price shown' }}</div>
              @if (p.description) { <p class="mt-2 text-sm text-ink-300">{{ p.description }}</p> }
              <div class="mt-auto pt-4"><button class="btn-secondary h-8 px-3 text-xs" (click)="edit(p)">Edit</button></div>
            </article>
          }
        </div>
      }
    </section>

    @if (editing(); as p) {
      <div class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" (click)="editing.set(null)">
        <form class="card w-full max-w-md space-y-4 p-6" (click)="$event.stopPropagation()" (ngSubmit)="save(p)">
          <h3 class="text-lg font-semibold">Edit {{ p.name }}</h3>
          <label class="block text-sm text-ink-300">Name<input class="input mt-1" name="name" [(ngModel)]="form.name" required maxlength="64" /></label>
          <label class="block text-sm text-ink-300">Description<input class="input mt-1" name="description" [(ngModel)]="form.description" maxlength="255" /></label>
          <label class="block text-sm text-ink-300">Daily allowance (GB) <span class="text-ink-400">(blank = unlimited)</span>
            <input class="input mt-1" name="limit" type="number" min="0.01" step="any" [(ngModel)]="form.limitGb" placeholder="Unlimited" /></label>
          <label class="block text-sm text-ink-300">Price shown to users<input class="input mt-1" name="price" [(ngModel)]="form.priceLabel" maxlength="64" placeholder="₹99 / month" /></label>
          <p class="text-xs text-ink-400">Changes apply to everyone on this plan straight away.</p>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" (click)="editing.set(null)">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="busy()">Save</button>
          </div>
        </form>
      </div>
    }`,
})
export class PlansPage {
  private readonly api = inject(ApiService);
  protected readonly tone = TONE;
  protected readonly showAll = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editing = signal<Plan | null>(null);
  /** Chosen duration per pending request; 30 days when untouched. */
  protected readonly days: Record<string, number | null> = {};
  protected form = { name: '', description: '', limitGb: null as number | null, priceLabel: '' };

  protected readonly requests = rxResource({ params: () => this.showAll(), stream: ({ params }) => this.api.planRequests(!params) });
  protected readonly plans = rxResource({ stream: () => this.api.plans() });

  protected async decide(r: PlanRequest, verb: 'approve' | 'reject') {
    let note: string | null = null;
    if (verb === 'reject') {
      note = window.prompt(`Reject ${r.userName || r.userEmail}'s request for ${r.plan.name}? Add a note for them (optional):`, '');
      if (note === null) return;
    }
    await this.run(`Could not ${verb} the request.`, async () => {
      await firstValueFrom(this.api.decidePlanRequest(r.id, verb, verb === 'approve' ? (this.days[r.id] ?? 30) : null, note || null));
      this.requests.reload();
    });
  }

  protected edit(p: Plan) {
    this.form = {
      name: p.name,
      description: p.description ?? '',
      limitGb: p.dailyLimitBytes === null ? null : +(p.dailyLimitBytes / GB).toFixed(2),
      priceLabel: p.priceLabel ?? '',
    };
    this.editing.set(p);
  }

  protected async save(p: Plan) {
    const gb = this.form.limitGb;
    await this.run(`Could not save ${p.name}.`, async () => {
      const updated = await firstValueFrom(this.api.updatePlan(p.id, {
        name: this.form.name,
        description: this.form.description || null,
        dailyLimitBytes: gb && gb > 0 ? Math.round(gb * GB) : null,
        priceLabel: this.form.priceLabel || null,
      }));
      this.plans.update((list) => list?.map((x) => (x.id === updated.id ? updated : x)));
      this.editing.set(null);
    });
  }

  private async run(failure: string, fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch {
      this.error.set(failure);
    } finally {
      this.busy.set(false);
    }
  }
}
