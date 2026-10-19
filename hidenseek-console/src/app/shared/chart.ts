import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, effect, inject, input,
} from '@angular/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);

export type ChartOption = echarts.EChartsCoreOption;

/** Colors from styles.css. Series hues passed the dataviz palette checks on the dark surface. */
export const VIZ = {
  series: ['#3987e5', '#d95926', '#199e70'],
  surface: '#0f1420',
  text: '#c3cddb',
  muted: '#6b7a93',
  grid: 'rgba(255,255,255,0.06)',
  tooltipBg: '#141a28',
};

const font = 'Inter, ui-sans-serif, system-ui, sans-serif';

/** Shared look: recessive axes and grid, ink-colored text, a tooltip on every chart. */
export function baseOption(): ChartOption {
  return {
    animationDuration: 400,
    textStyle: { fontFamily: font, color: VIZ.text },
    grid: { left: 8, right: 12, top: 36, bottom: 4, containLabel: true },
    tooltip: {
      backgroundColor: VIZ.tooltipBg,
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#e6edf6', fontSize: 12, fontFamily: font },
      extraCssText: 'border-radius:10px;box-shadow:0 12px 30px -12px rgba(0,0,0,.8);',
    },
    legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: VIZ.text, fontSize: 12 } },
  };
}

export const axisStyle = {
  axisLine: { lineStyle: { color: VIZ.grid } },
  axisTick: { show: false },
  axisLabel: { color: VIZ.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: VIZ.grid } },
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
