import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { Icon } from './icon';

/** SVG flag (flag-icons); Windows can't render flag emoji. */
@Component({
  selector: 'hs-flag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { class: 'inline-flex shrink-0' },
  template: `
    @if (code()) {
      <span class="fi fis rounded-[3px] ring-1 ring-white/10" [class]="'fi-' + code()!.toLowerCase()"
        [style.width.px]="size() * 1.4" [style.height.px]="size()" style="background-size: cover"
        [attr.aria-label]="code()"></span>
    } @else {
      <span class="grid place-items-center rounded-[3px] bg-white/5 text-ink-400" [style.width.px]="size() * 1.4"
        [style.height.px]="size()"><hs-icon name="globe" class="size-3" /></span>
    }`,
})
export class Flag {
  readonly code = input<string | null | undefined>();
  readonly size = input(16);
}

@Component({
  selector: 'hs-stat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { class: 'card block p-4' },
  template: `
    <div class="flex items-center justify-between">
      <span class="label">{{ label() }}</span>
      @if (icon()) { <hs-icon [name]="icon()!" class="size-4 text-ink-400" /> }
    </div>
    <div class="mt-2 text-2xl font-bold tracking-tight tabular-nums">{{ value() }}</div>
    @if (hint()) { <div class="mt-0.5 text-xs text-ink-400">{{ hint() }}</div> }`,
})
export class Stat {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
  readonly icon = input<string>();
}

type Tone = 'green' | 'amber' | 'red' | 'sky' | 'gray';
const TONES: Record<Tone, string> = {
  green: 'bg-brand-500/10 text-brand-300 ring-brand-500/20',
  amber: 'bg-amber-500/10 text-amber-300 ring-amber-500/20',
  red: 'bg-rose-500/10 text-rose-300 ring-rose-500/20',
  sky: 'bg-sky-500/10 text-sky-300 ring-sky-500/20',
  gray: 'bg-white/5 text-ink-300 ring-white/10',
};

@Component({
  selector: 'hs-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `<span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset" [class]="classes()">
    @if (dot()) { <span class="size-1.5 rounded-full bg-current"></span> }<ng-content /></span>`,
})
export class Badge {
  readonly tone = input<Tone>('gray');
  readonly dot = input(false);
  protected readonly classes = computed(() => TONES[this.tone()]);
}

@Component({
  selector: 'hs-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { class: 'flex flex-col items-center justify-center px-6 py-12 text-center' },
  template: `
    <div class="mb-3 grid size-11 place-items-center rounded-2xl bg-white/5 text-ink-300"><hs-icon [name]="icon()" class="size-5" /></div>
    <p class="text-sm font-semibold">{{ title() }}</p>
    <div class="mt-1 max-w-sm text-sm text-ink-400"><ng-content /></div>`,
})
export class Empty {
  readonly icon = input('activity');
  readonly title = input.required<string>();
}

@Component({
  selector: 'hs-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex justify-center py-14' },
  template: `<span class="size-6 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" role="status" aria-label="Loading"></span>`,
})
export class Spinner {}

@Component({
  selector: 'hs-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (message()) {
      <div class="flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200">
        <hs-icon name="alert" class="mt-0.5 size-4 text-rose-400" /><span>{{ message() }}</span>
      </div>
    }`,
})
export class ErrorNote {
  readonly message = input<string | null>();
}

/** One row of period buttons; every chart on the page follows it. */
@Component({
  selector: 'hs-period',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inline-flex gap-1 rounded-xl bg-ink-950/60 p-1 ring-1 ring-white/5" role="radiogroup" aria-label="Time range">
      @for (d of options; track d) {
        <button type="button" role="radio" [attr.aria-checked]="value() === d" (click)="value.set(d)"
          class="h-7 rounded-lg px-3 text-xs font-semibold transition-colors"
          [class]="value() === d ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'">{{ d }}d</button>
      }
    </div>`,
})
export class Period {
  readonly value = model.required<number>();
  protected readonly options = [7, 14, 30, 90];
}

export { Icon };
export const UI = [Flag, Stat, Badge, Empty, Spinner, ErrorNote, Period, Icon] as const;
