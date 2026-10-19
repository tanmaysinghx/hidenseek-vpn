import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FORMAT_PIPES } from '../../shared/format';
import { UI } from '../../shared/ui';

/** What non-admins see for now: their own connections. */
@Component({
  selector: 'hs-me',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6">
      <h2 class="text-2xl font-bold tracking-tight">Hi {{ user()?.displayName || user()?.email }}</h2>
      <p class="mt-1 text-sm text-ink-400">Your recent VPN connections. Connect from the Hidenseek app on your device.</p>
    </div>
    @if (user()?.status === 'PENDING') {
      <div class="card mb-4 border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm">Your account is waiting for an admin to approve it.</div>
    }
    <div class="card overflow-hidden">
      @if (sessions.isLoading() && !sessions.value()) {
        <hs-spinner />
      } @else if (!sessions.value()?.items?.length) {
        <hs-empty icon="activity" title="No connections yet">Install the app from the <a href="/#download" class="text-brand-300">download page</a> and connect.</hs-empty>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] text-sm">
            <thead class="table-head"><tr><th>Started</th><th>From</th><th class="!text-right">Duration</th><th class="!text-right">↓ / ↑</th></tr></thead>
            <tbody>
              @for (s of sessions.value()!.items; track s.id) {
                <tr class="table-row">
                  <td class="whitespace-nowrap"><div class="flex items-center gap-2">{{ s.startedAt | dateTime }}
                    @if (s.active) { <hs-badge tone="green" [dot]="true">live</hs-badge> }</div></td>
                  <td><div class="flex items-center gap-2"><hs-flag [code]="s.countryCode" />{{ s.city || (s.countryCode | country: s.country) }}
                    <span class="font-mono text-xs text-ink-400">{{ s.clientIp }}</span></div></td>
                  <td class="text-right font-mono tabular-nums">{{ s.elapsedSeconds | duration }}</td>
                  <td class="whitespace-nowrap text-right font-mono text-xs tabular-nums text-ink-300">{{ s.txBytes | bytes }} / {{ s.rxBytes | bytes }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>`,
})
export class MePage {
  private readonly api = inject(ApiService);
  protected readonly user = inject(AuthService).user;
  protected readonly sessions = rxResource({ stream: () => this.api.mySessions() });
}
