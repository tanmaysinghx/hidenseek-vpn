import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Enrollment, Server } from '../../core/models';
import { FORMAT_PIPES } from '../../shared/format';
import { UI } from '../../shared/ui';

@Component({
  selector: 'hs-servers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI, ...FORMAT_PIPES],
  template: `
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">Servers</h2>
        <p class="mt-1 text-sm text-ink-400">Each VPS running the agent is a location people can connect to.</p>
      </div>
      <button class="btn-primary" (click)="adding.set(true)"><hs-icon name="plus" class="size-4" />Add server</button>
    </div>
    <hs-error [message]="error()" />

    @if (servers.isLoading() && !servers.value()) {
      <hs-spinner />
    } @else if (!servers.value()?.length) {
      <div class="card"><hs-empty icon="server" title="No servers yet">Add one, then run the install command on a Linux VPS.</hs-empty></div>
    } @else {
      <div class="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        @for (s of servers.value()!; track s.id) {
          <article class="card p-5">
            <div class="flex items-start gap-3">
              <hs-flag [code]="s.countryCode" [size]="22" />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate font-semibold">{{ s.name }}</h3>
                  @if (s.status === 'PENDING') { <hs-badge tone="amber">awaiting install</hs-badge> }
                  @else if (s.online) { <hs-badge tone="green" [dot]="true">online</hs-badge> }
                  @else { <hs-badge tone="red" [dot]="true">offline</hs-badge> }
                </div>
                <p class="truncate text-xs text-ink-400">{{ [s.city, (s.countryCode | country)].join(', ') }}
                  @if (s.endpointHost) { · <span class="font-mono">{{ s.endpointHost }}:{{ s.listenPort }}</span> }</p>
              </div>
              <button class="btn-ghost h-8 px-2" [attr.aria-label]="'Delete ' + s.name" (click)="remove(s)"><hs-icon name="trash" class="size-4" /></button>
            </div>
            <dl class="mt-4 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-lg bg-white/[0.03] py-2"><dt class="text-[11px] text-ink-400">Live</dt><dd class="text-sm font-semibold tabular-nums">{{ s.activeSessions }}</dd></div>
              <div class="rounded-lg bg-white/[0.03] py-2"><dt class="text-[11px] text-ink-400">Devices</dt><dd class="text-sm font-semibold tabular-nums">{{ s.peerCount }}</dd></div>
              <div class="rounded-lg bg-white/[0.03] py-2"><dt class="text-[11px] text-ink-400">Last seen</dt><dd class="text-sm font-semibold">{{ s.status === 'PENDING' ? '—' : (s.lastHeartbeatAt | relative) }}</dd></div>
            </dl>
            <div class="mt-4 space-y-3 border-t border-white/5 pt-4">
              <label class="flex items-center justify-between gap-4">
                <span><span class="block text-sm font-medium">Enabled</span><span class="text-xs text-ink-400">Disabled servers drop every connection and are hidden.</span></span>
                <input type="checkbox" class="size-5 accent-brand-500" [checked]="s.enabled" (change)="toggle(s, 'enabled', $any($event.target).checked)" />
              </label>
              <label class="flex items-center justify-between gap-4">
                <span><span class="block text-sm font-medium">Log website activity</span><span class="text-xs text-ink-400">Records domains people look up. They're warned in the app first.</span></span>
                <input type="checkbox" class="size-5 accent-brand-500" [checked]="s.activityLogging" (change)="toggle(s, 'activityLogging', $any($event.target).checked)" />
              </label>
            </div>
            <div class="mt-4 flex items-center justify-between gap-2 text-xs text-ink-400">
              <span class="font-mono">{{ s.addressCidr }}@if (s.agentVersion) { · agent {{ s.agentVersion }} }</span>
              <button class="btn-secondary h-8 px-3 text-xs" (click)="install(s)"><hs-icon name="terminal" class="size-3.5" />{{ s.status === 'PENDING' ? 'Install command' : 'Reinstall' }}</button>
            </div>
          </article>
        }
      </div>
    }

    @if (adding()) {
      <div class="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" (click)="adding.set(false)">
        <form class="card w-full max-w-lg space-y-4 p-6" (click)="$event.stopPropagation()" (ngSubmit)="create()">
          <h3 class="text-lg font-semibold">Add a server</h3>
          <div class="grid grid-cols-2 gap-3">
            <label class="col-span-2 text-sm text-ink-300">Name<input class="input mt-1" name="name" [(ngModel)]="form.name" required placeholder="Singapore 2" /></label>
            <label class="text-sm text-ink-300">Country code<input class="input mt-1" name="cc" [(ngModel)]="form.countryCode" required maxlength="2" placeholder="SG" /></label>
            <label class="text-sm text-ink-300">City<input class="input mt-1" name="city" [(ngModel)]="form.city" placeholder="Singapore" /></label>
            <label class="col-span-2 text-sm text-ink-300">Public host <span class="text-ink-400">(blank = detect)</span><input class="input mt-1" name="host" [(ngModel)]="form.endpointHost" /></label>
            <label class="text-sm text-ink-300">UDP port<input class="input mt-1" name="port" type="number" [(ngModel)]="form.listenPort" /></label>
            <label class="text-sm text-ink-300">Tunnel subnet<input class="input mt-1" name="cidr" [(ngModel)]="form.addressCidr" /></label>
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-ghost" (click)="adding.set(false)">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="busy()">Create and get install command</button>
          </div>
        </form>
      </div>
    }

    @if (enrollment(); as e) {
      <div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" (click)="enrollment.set(null)">
        <div class="card w-full max-w-xl space-y-4 p-6" (click)="$event.stopPropagation()">
          <h3 class="text-lg font-semibold">Install on {{ e.server.name }}</h3>
          <p class="text-sm text-ink-300">SSH into the VPS and run this as root. Single use, valid until {{ e.data.expiresAt | dateTime }}.</p>
          <div class="flex overflow-hidden rounded-xl border border-white/10 bg-ink-950">
            <code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap p-3 font-mono text-xs text-brand-300">{{ e.data.installCommand }}</code>
            <button class="border-l border-white/10 px-3 text-xs font-semibold text-ink-300 hover:bg-white/5" (click)="copy(e.data.installCommand)">{{ copied() ? 'Copied' : 'Copy' }}</button>
          </div>
          <p class="text-sm text-ink-300">Then allow <span class="font-mono text-ink-100">UDP {{ e.server.listenPort }}</span> in the cloud provider's firewall.</p>
          <div class="flex justify-end"><button class="btn-primary" (click)="enrollment.set(null)">Done</button></div>
        </div>
      </div>
    }`,
})
export class ServersPage {
  private readonly api = inject(ApiService);
  protected readonly servers = rxResource({ stream: () => this.api.servers() });
  protected readonly adding = signal(false);
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly enrollment = signal<{ server: Server; data: Enrollment } | null>(null);
  protected form = { name: '', countryCode: '', city: '', endpointHost: '', listenPort: 51820, addressCidr: '10.66.0.0/24' };

  protected async toggle(server: Server, field: 'enabled' | 'activityLogging', value: boolean) {
    await this.run(async () => {
      const updated = await firstValueFrom(this.api.updateServer(server.id, { [field]: value }));
      this.servers.update((list) => list?.map((s) => (s.id === updated.id ? updated : s)));
    });
  }

  protected async create() {
    await this.run(async () => {
      const created = await firstValueFrom(this.api.createServer({ ...this.form, city: this.form.city || null, endpointHost: this.form.endpointHost || null }));
      this.adding.set(false);
      this.servers.reload();
      await this.install(created);
    });
  }

  protected async install(server: Server) {
    await this.run(async () => this.enrollment.set({ server, data: await firstValueFrom(this.api.enrollment(server.id)) }));
  }

  protected async remove(server: Server) {
    if (!confirm(`Delete "${server.name}"? Its sessions and activity history are deleted too.`)) return;
    await this.run(async () => {
      await firstValueFrom(this.api.deleteServer(server.id));
      this.servers.reload();
    });
  }

  protected async copy(text: string) {
    await navigator.clipboard.writeText(text);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  private async run(action: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (e: unknown) {
      const message = (e as { error?: { message?: string } })?.error?.message;
      this.error.set(message ?? 'Something went wrong.');
    } finally {
      this.busy.set(false);
    }
  }
}
