import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, Signal, afterNextRender, computed, effect, inject, input,
} from '@angular/core';
import { Theme, ThemeMode } from '../core/theme';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);

export type ChartOption = echarts.EChartsCoreOption;

/** Chrome around the data, per theme. Text and grid follow the ink tokens in styles.css. */
const CHROME: Record<ThemeMode, {
  surface: string; text: string; muted: string; grid: string; hover: string; crosshair: string;
  tooltipBg: string; tooltipText: string; tooltipBorder: string; tooltipShadow: string;
}> = {
  dark: {
    surface: '#0f1420', text: '#c3cddb', muted: '#6b7a93', grid: 'rgba(255,255,255,0.06)',
    hover: 'rgba(255,255,255,0.04)', crosshair: 'rgba(255,255,255,0.18)',
    tooltipBg: '#141a28', tooltipText: '#e6edf6', tooltipBorder: 'rgba(255,255,255,0.08)',
    tooltipShadow: 'box-shadow:0 12px 30px -12px rgba(0,0,0,.8);',
  },
  light: {
    surface: '#ffffff', text: '#334155', muted: '#64748b', grid: 'rgba(15,23,42,0.07)',
    hover: 'rgba(15,23,42,0.04)', crosshair: 'rgba(15,23,42,0.2)',
    tooltipBg: '#ffffff', tooltipText: '#0f172a', tooltipBorder: 'rgba(15,23,42,0.1)',
    tooltipShadow: 'box-shadow:0 12px 30px -14px rgba(15,23,42,.35);',
  },
};

let current: ThemeMode = 'dark';

/**
 * Chart colors for the theme being built. Series hues are the same in both themes: they pass the
 * dataviz palette checks on the dark (#0f1420) and the light (#ffffff) surface alike.
 */
export const VIZ = {
  series: ['#3987e5', '#d95926', '#199e70'],
  get surface() { return CHROME[current].surface; },
  get text() { return CHROME[current].text; },
  get muted() { return CHROME[current].muted; },
  get grid() { return CHROME[current].grid; },
  get hover() { return CHROME[current].hover; },
  get crosshair() { return CHROME[current].crosshair; },
  get tooltipBg() { return CHROME[current].tooltipBg; },
};

/**
 * Builds a chart's options from a source, again whenever the source or the theme changes.
 * Call it in a field initializer (it injects the theme).
 */
export function chartOf<T>(source: () => T, build: (value: T) => ChartOption): Signal<ChartOption> {
  const theme = inject(Theme);
  return computed(() => {
    current = theme.mode();
    return build(source());
  });
}

const font = 'Inter, ui-sans-serif, system-ui, sans-serif';

/** Shared look: recessive axes and grid, ink-colored text, a tooltip on every chart. */
export function baseOption(): ChartOption {
  return {
    animationDuration: 400,
    textStyle: { fontFamily: font, color: VIZ.text },
    grid: { left: 8, right: 12, top: 36, bottom: 4, containLabel: true },
    tooltip: {
      backgroundColor: CHROME[current].tooltipBg,
      borderColor: CHROME[current].tooltipBorder,
      textStyle: { color: CHROME[current].tooltipText, fontSize: 12, fontFamily: font },
      extraCssText: `border-radius:10px;${CHROME[current].tooltipShadow}`,
    },
    legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: VIZ.text, fontSize: 12 } },
  };
}

/** Getters, so spreading it ({ ...axisStyle }) picks up the theme being built. */
export const axisStyle = {
  get axisLine() { return { lineStyle: { color: VIZ.grid } }; },
  axisTick: { show: false },
  get axisLabel() { return { color: VIZ.muted, fontSize: 11 }; },
  get splitLine() { return { lineStyle: { color: VIZ.grid } }; },
};

@Component({
  selector: 'hs-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full', role: 'img', '[attr.aria-label]': 'label()', '[style.height.px]': 'height()' },
  template: '',
})
export class Chart implements OnDestroy {
  readonly options = input.required<ChartOption>();
  readonly height = input(260);
  readonly label = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private chart?: echarts.ECharts;
  private resize?: ResizeObserver;

  constructor() {
    afterNextRender(() => {
      this.chart = echarts.init(this.host.nativeElement, undefined, { renderer: 'svg' });
      this.chart.setOption(this.options(), true);
      this.resize = new ResizeObserver(() => this.chart?.resize());
      this.resize.observe(this.host.nativeElement);
    });
    effect(() => {
      const options = this.options();
      this.chart?.setOption(options, true);
    });
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
    this.chart?.dispose();
  }
}
