import { Pipe, PipeTransform } from '@angular/core';

export function bytes(n: number | null | undefined): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function duration(totalSeconds: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSeconds ?? 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function compact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

const regions = new Intl.DisplayNames(undefined, { type: 'region' });
export function countryName(code: string | null | undefined, fallback?: string | null): string {
  if (!code) return fallback || 'Unknown';
  try {
    return regions.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function place(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(', ') || 'Unknown location';
}

@Pipe({ name: 'bytes' })
export class BytesPipe implements PipeTransform {
  transform = bytes;
}

@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform = duration;
}

@Pipe({ name: 'relative' })
export class RelativePipe implements PipeTransform {
  transform = relative;
}

@Pipe({ name: 'dateTime' })
export class DateTimePipe implements PipeTransform {
  transform = dateTime;
}

@Pipe({ name: 'country' })
export class CountryPipe implements PipeTransform {
  transform = countryName;
}

export const FORMAT_PIPES = [BytesPipe, DurationPipe, RelativePipe, DateTimePipe, CountryPipe] as const;
