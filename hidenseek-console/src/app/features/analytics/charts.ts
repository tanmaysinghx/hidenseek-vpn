import { AuditStats, TrafficDay } from '../../core/models';
import { ChartOption, VIZ, axisStyle, baseOption } from '../../shared/chart';

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const tooltip = () => baseOption()['tooltip'] as object;

/** Visitors and page views share one count axis; legend plus crosshair tooltip. */
export function visitsPerDay(points: TrafficDay[]): ChartOption {
  const line = (name: string, color: string, data: number[]) => ({
    name,
    type: 'line',
    data,
    smooth: 0.25,
    symbol: 'circle',
    symbolSize: 8,
    showSymbol: points.length <= 14,
    lineStyle: { width: 2, color },
    itemStyle: { color, borderColor: VIZ.surface, borderWidth: 2 },
    areaStyle: { color, opacity: 0.06 },
  });
  return {
    ...baseOption(),
    tooltip: {
      ...tooltip(),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: VIZ.crosshair } },
      formatter: (items: { dataIndex: number; marker: string; seriesName: string; value: number }[]) => {
        const p = points[items[0].dataIndex];
        return `<b>${dayLabel(p.date)}</b><br/>` +
          items.map((i) => `${i.marker} ${i.seriesName} <b>${i.value}</b>`).join('<br/>') +
          `<br/><span style="color:${VIZ.muted}">${p.visits} ${p.visits === 1 ? 'visit' : 'visits'}</span>`;
      },
    },
    xAxis: { type: 'category', boundaryGap: false, data: points.map((p) => dayLabel(p.date)), ...axisStyle, splitLine: { show: false } },
    yAxis: { type: 'value', minInterval: 1, ...axisStyle, axisLine: { show: false } },
    series: [
      line('Visitors', VIZ.series[0], points.map((p) => p.visitors)),
      line('Page views', VIZ.series[1], points.map((p) => p.pageViews)),
    ],
  };
}

/** Stacked bars: succeeded below, failed on top, a 2px surface gap between segments. */
export function requestsPerDay(points: AuditStats['daily']): ChartOption {
  const bar = (name: string, color: string, data: number[], top: boolean) => ({
    name,
    type: 'bar',
    stack: 'requests',
    data,
    barMaxWidth: 18,
    itemStyle: { color, borderColor: VIZ.surface, borderWidth: 1, borderRadius: top ? [4, 4, 0, 0] : 0 },
  });
  return {
    ...baseOption(),
    tooltip: {
      ...tooltip(),
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: VIZ.hover } },
      formatter: (items: { dataIndex: number }[]) => {
        const p = points[items[0].dataIndex];
        return `<b>${dayLabel(p.date)}</b><br/>${p.requests} requests · ${p.failures} failed`;
      },
    },
    xAxis: { type: 'category', data: points.map((p) => dayLabel(p.date)), ...axisStyle, splitLine: { show: false } },
    yAxis: { type: 'value', minInterval: 1, ...axisStyle, axisLine: { show: false } },
    series: [
      bar('Succeeded', VIZ.series[0], points.map((p) => p.requests - p.failures), false),
      bar('Failed', VIZ.series[1], points.map((p) => p.failures), true),
    ],
  };
}

/** Ranked list: horizontal bars, biggest on top, each labelled with its count. */
export function rankedBars(rows: { label: string; value: number; detail: string }[]): ChartOption {
  const data = [...rows].slice(0, 10).reverse();
  return {
    ...baseOption(),
    grid: { left: 4, right: 40, top: 4, bottom: 4, containLabel: true },
    legend: { show: false },
    tooltip: {
      ...tooltip(),
      trigger: 'item',
      formatter: (item: { dataIndex: number }) => `<b>${data[item.dataIndex].label}</b><br/>${data[item.dataIndex].detail}`,
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map((r) => r.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: VIZ.text, fontSize: 12, width: 150, overflow: 'truncate' },
    },
    series: [{
      type: 'bar',
      data: data.map((r) => r.value),
      barMaxWidth: 14,
      barCategoryGap: '35%',
      itemStyle: { color: VIZ.series[0], borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: VIZ.muted, fontSize: 11 },
    }],
  };
}
