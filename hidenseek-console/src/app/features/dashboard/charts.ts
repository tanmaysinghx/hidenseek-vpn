import { DayPoint, DomainStat } from '../../core/models';
import { bytes } from '../../shared/format';
import { ChartOption, VIZ, axisStyle, baseOption } from '../../shared/chart';

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** One series: no legend, the card title names it. Bars are thin with 4px rounded tops. */
export function sessionsPerDay(points: DayPoint[]): ChartOption {
  return {
    ...baseOption(),
    grid: { left: 8, right: 12, top: 12, bottom: 4, containLabel: true },
    legend: { show: false },
    tooltip: {
      ...(baseOption()['tooltip'] as object),
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,0.04)' } },
      formatter: (items: { dataIndex: number }[]) => {
        const p = points[items[0].dataIndex];
        return `<b>${dayLabel(p.date)}</b><br/>${p.sessions} sessions · ${p.activeUsers} ${p.activeUsers === 1 ? 'person' : 'people'}`;
      },
    },
    xAxis: { type: 'category', data: points.map((p) => dayLabel(p.date)), ...axisStyle, splitLine: { show: false } },
    yAxis: { type: 'value', minInterval: 1, ...axisStyle, axisLine: { show: false } },
    series: [{
      name: 'Sessions',
      type: 'bar',
      data: points.map((p) => p.sessions),
      barMaxWidth: 18,
      itemStyle: { color: VIZ.series[0], borderRadius: [4, 4, 0, 0] },
      emphasis: { itemStyle: { color: '#5598e7' } },
    }],
  };
}

/** Two series on one byte axis: legend plus a crosshair tooltip with both values. */
export function trafficPerDay(points: DayPoint[]): ChartOption {
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
      ...(baseOption()['tooltip'] as object),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.18)' } },
      formatter: (items: { dataIndex: number; marker: string; seriesName: string; value: number }[]) =>
        `<b>${dayLabel(points[items[0].dataIndex].date)}</b><br/>` +
        items.map((i) => `${i.marker} ${i.seriesName} <b>${bytes(i.value)}</b>`).join('<br/>'),
    },
    xAxis: { type: 'category', boundaryGap: false, data: points.map((p) => dayLabel(p.date)), ...axisStyle, splitLine: { show: false } },
    yAxis: { type: 'value', ...axisStyle, axisLine: { show: false }, axisLabel: { ...axisStyle.axisLabel, formatter: (v: number) => bytes(v) } },
    series: [
      line('Download', VIZ.series[0], points.map((p) => p.downloadBytes)),
      line('Upload', VIZ.series[1], points.map((p) => p.uploadBytes)),
    ],
  };
}

/** Ranked list: horizontal bars, biggest on top, each bar labelled with its count. */
export function topWebsites(domains: DomainStat[]): ChartOption {
  const rows = [...domains].slice(0, 10).reverse();
  return {
    ...baseOption(),
    grid: { left: 4, right: 40, top: 4, bottom: 4, containLabel: true },
    legend: { show: false },
    tooltip: {
      ...(baseOption()['tooltip'] as object),
      trigger: 'item',
      formatter: (item: { dataIndex: number }) => {
        const d = rows[item.dataIndex];
        return `<b>${d.domain}</b><br/>${d.lookups} lookups · ${d.users} ${d.users === 1 ? 'person' : 'people'}`;
      },
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: rows.map((d) => d.domain),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: VIZ.text, fontSize: 12, width: 150, overflow: 'truncate' },
    },
    series: [{
      type: 'bar',
      data: rows.map((d) => d.lookups),
      barMaxWidth: 14,
      barCategoryGap: '35%',
      itemStyle: { color: VIZ.series[0], borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: VIZ.muted, fontSize: 11 },
    }],
  };
}
