import { geoContains, geoMercator, geoPath } from "d3-geo";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, type LonLat } from "../lib/geo";

export type MapPhase = "off" | "connecting" | "on" | "disconnecting";

export interface MapPin {
  id: string;
  name: string;
  coords: LonLat;
  online: boolean;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 1000;
const H = 620;
const projection = geoMercator().fitExtent(
  [
    [0, 0],
    [W, H],
  ],
  { type: "FeatureCollection", features: COUNTRIES },
);
const path = geoPath(projection);
const project = (c: LonLat) => projection(c) as [number, number];

/** Static, so React never re-renders 170 country paths while the camera moves. */
const Land = memo(function Land() {
  return (
    <g fill="var(--color-map-land)" stroke="var(--color-map-border)" strokeWidth={0.6} strokeLinejoin="round">
      {COUNTRIES.map((f) => (
        <path key={String(f.id)} d={path(f) ?? undefined} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
});

function countryAt(c: LonLat | null) {
  return c ? COUNTRIES.find((f) => geoContains(f, c)) ?? null : null;
}

/** Frames points so they sit inside the unobscured part of the map, with breathing room. */
function frame(points: [number, number][], aspect: number, obscuredBottom: number, minWidth: number): View {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = Math.max(x1 - x0, y1 - y0) * 0.35 + 40;
  const visible = 1 - obscuredBottom;
  let h = Math.max((y1 - y0 + 2 * pad) / visible, (x1 - x0 + 2 * pad) / aspect);
  let w = h * aspect;
  if (w < minWidth) {
    w = minWidth;
    h = w / aspect;
  }
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - (h * visible) / 2, w, h };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function useCamera(target: View) {
  const [view, setView] = useState(target);
  const current = useRef(target);
  const key = `${target.x.toFixed(1)},${target.y.toFixed(1)},${target.w.toFixed(1)}`;
  useEffect(() => {
    const from = current.current;
    const to = target;
    const start = performance.now();
    const ms = 1100;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const k = ease(t);
      const v = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, w: from.w + (to.w - from.w) * k, h: from.h + (to.h - from.h) * k };
      current.current = v;
      setView(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return view;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Proton-style dark world map. Draws a route from the person to the chosen server: a faint dashed
 * preview while idle, a line that draws itself with probing packets while connecting, and a solid
 * route with data flowing both ways once protected (more packets when more traffic moves).
 */
export function WorldMap({
  me,
  meLabel,
  pins,
  targetId,
  phase,
  flow = { down: 1, up: 1 },
  obscuredBottom = 0,
  onPick,
}: {
  me: LonLat | null;
  meLabel: string;
  pins: MapPin[];
  targetId: string | null;
  phase: MapPhase;
  /** Packets in flight each way, 0-4. */
  flow?: { down: number; up: number };
  /** Fraction of the map's height covered by UI, so framing keeps the route above it. */
  obscuredBottom?: number;
  onPick?: (id: string) => void;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const aspect = size.width / size.height;
  const target = pins.find((p) => p.id === targetId) ?? null;

  const meXY = me ? project(me) : null;
  const targetXY = target ? project(target.coords) : null;

  const goal = useMemo(() => {
    const points = [meXY, targetXY].filter(Boolean) as [number, number][];
    if (points.length === 0) return frame([[W / 2, H / 2]], aspect, obscuredBottom, W);
    return frame(points, aspect, obscuredBottom, points.length === 1 ? 520 : 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meXY?.[0], meXY?.[1], targetXY?.[0], targetXY?.[1], aspect, obscuredBottom]);
  const view = useCamera(goal);
  /** Map units per screen pixel, so markers keep their on-screen size while zooming. */
  const px = view.w / size.width;

  const meCountry = useMemo(() => countryAt(me), [me?.[0], me?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const targetCountry = useMemo(() => countryAt(target?.coords ?? null), [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const route = useMemo(() => {
    if (!meXY || !targetXY) return null;
    const [x1, y1] = meXY;
    const [x2, y2] = targetXY;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    // Bow the line upward like a flight path.
    let nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const bow = Math.min(len * 0.28, 140);
    const cx = (x1 + x2) / 2 + nx * bow, cy = (y1 + y2) / 2 + ny * bow;
    return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  }, [meXY?.[0], meXY?.[1], targetXY?.[0], targetXY?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const on = phase === "on";
  const connecting = phase === "connecting";
  const animate = !reducedMotion;

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-[var(--color-map-sea)]">
      <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" className="size-full select-none" aria-hidden="true">
        <defs>
          <linearGradient id="route-on" gradientUnits="userSpaceOnUse" x1={meXY?.[0]} y1={meXY?.[1]} x2={targetXY?.[0]} y2={targetXY?.[1]}>
            <stop stopColor="var(--color-brand-400)" />
            <stop offset="1" stopColor="var(--color-ok-400)" />
          </linearGradient>
          <radialGradient id="map-vignette" cx="50%" cy="45%" r="75%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={3 * px} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <Land />

        {meCountry && (
          <path d={path(meCountry) ?? undefined} fill="var(--color-brand-500)" fillOpacity={0.14} stroke="var(--color-brand-400)" strokeOpacity={0.35} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
        )}
        {targetCountry && targetCountry !== meCountry && (
          <path
            d={path(targetCountry) ?? undefined}
            fill={on ? "var(--color-ok-500)" : "var(--color-brand-500)"}
            fillOpacity={on ? 0.2 : 0.1}
            stroke={on ? "var(--color-ok-400)" : "var(--color-brand-400)"}
            strokeOpacity={0.4}
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
            style={{ transition: "fill 700ms, fill-opacity 700ms, stroke 700ms" }}
          />
        )}

        {/* Route */}
        {route && (phase === "off" || phase === "disconnecting") && (
          <path
            d={route}
            fill="none"
            stroke="var(--color-ink-300)"
            strokeOpacity={phase === "off" ? 0.35 : 0.15}
            strokeWidth={1.5 * px}
            strokeDasharray="0.006 0.012"
            strokeLinecap="round"
            pathLength={1}
            style={{ transition: "stroke-opacity 400ms" }}
          />
        )}
        {route && (connecting || on) && (
          <g key={phase} filter="url(#glow)">
            <path
              d={route}
              fill="none"
              stroke={on ? "url(#route-on)" : "var(--color-brand-400)"}
              strokeWidth={(on ? 2.6 : 2.2) * px}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              className={connecting ? "animate-route-draw" : undefined}
            />
            {connecting && animate && (
              <path
                d={route}
                fill="none"
                stroke="#fff"
                strokeOpacity={0.55}
                strokeWidth={2 * px}
                strokeLinecap="round"
                strokeDasharray="0.01 0.03"
                pathLength={1}
                className="animate-route-march"
              />
            )}
          </g>
        )}

        {/* Packets: probing toward the server while connecting, both ways once up. */}
        {route && animate && connecting &&
          [0, 1, 2].map((i) => <Packet key={`c${i}`} route={route} r={3.2 * px} color="var(--color-brand-300)" dur={1.2} offset={i * 0.4} reverse={false} />)}
        {route && animate && on && (
          <>
            {Array.from({ length: flow.down }, (_, i) => (
              <Packet key={`d${i}`} route={route} r={3.4 * px} color="var(--color-ok-300)" dur={2.2} offset={(i * 2.2) / Math.max(1, flow.down)} reverse />
            ))}
            {Array.from({ length: flow.up }, (_, i) => (
              <Packet key={`u${i}`} route={route} r={2.6 * px} color="var(--color-brand-300)" dur={2.6} offset={(i * 2.6) / Math.max(1, flow.up) + 0.7} reverse={false} />
            ))}
          </>
        )}

        {/* Servers */}
        {pins.map((p) => {
          const [x, y] = project(p.coords);
          const isTarget = p.id === targetId;
          const color = isTarget && on ? "var(--color-ok-400)" : isTarget ? "var(--color-brand-400)" : p.online ? "var(--color-ink-300)" : "var(--color-ink-600)";
          return (
            <g key={p.id} onClick={p.online && onPick ? () => onPick(p.id) : undefined} style={{ cursor: p.online && onPick ? "pointer" : "default" }}>
              <title>{p.name}{p.online ? "" : " (offline)"}</title>
              {isTarget && (on || connecting) && animate && (
                <circle cx={x} cy={y} r={5 * px} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" className="animate-ping-slow" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
              )}
              <circle cx={x} cy={y} r={14 * px} fill="transparent" />
              <circle cx={x} cy={y} r={(isTarget ? 6 : 4) * px} fill={color} stroke="var(--color-map-sea)" strokeWidth={2 * px} style={{ transition: "fill 500ms" }} />
              {isTarget && <Label x={x} y={y - 14 * px} px={px} text={p.name} tone={on ? "ok" : "brand"} />}
            </g>
          );
        })}

        {/* You */}
        {meXY && (
          <g>
            {animate && (phase !== "on") && (
              <circle cx={meXY[0]} cy={meXY[1]} r={6 * px} fill="none" stroke="var(--color-brand-300)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" className="animate-ping-slow" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
            )}
            <circle cx={meXY[0]} cy={meXY[1]} r={7 * px} fill="var(--color-brand-500)" fillOpacity={0.25} />
            <circle cx={meXY[0]} cy={meXY[1]} r={4 * px} fill="#fff" stroke="var(--color-brand-500)" strokeWidth={2.2 * px} />
            <Label x={meXY[0]} y={meXY[1] + 24 * px} px={px} text={meLabel} tone="muted" />
          </g>
        )}

        <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#map-vignette)" pointerEvents="none" />
      </svg>
    </div>
  );
}

function Packet({ route, r, color, dur, offset, reverse }: { route: string; r: number; color: string; dur: number; offset: number; reverse: boolean }) {
  // Negative begin = already mid-flight, so packets are spread along the route from the start.
  const begin = `-${offset.toFixed(2)}s`;
  return (
    <circle r={r} fill={color} filter="url(#glow)" opacity={0}>
      <animateMotion dur={`${dur}s`} begin={begin} repeatCount="indefinite" path={route} keyPoints={reverse ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear" />
      <animate attributeName="opacity" dur={`${dur}s`} begin={begin} repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.12;0.85;1" />
    </circle>
  );
}

function Label({ x, y, px, text, tone }: { x: number; y: number; px: number; text: string; tone: "ok" | "brand" | "muted" }) {
  const fill = tone === "ok" ? "var(--color-ok-300)" : tone === "brand" ? "var(--color-brand-300)" : "var(--color-ink-100)";
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={12 * px}
      fontWeight={600}
      fill={fill}
      stroke="var(--color-map-sea)"
      strokeWidth={4 * px}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={{ letterSpacing: "0.01em" }}
    >
      {text}
    </text>
  );
}
