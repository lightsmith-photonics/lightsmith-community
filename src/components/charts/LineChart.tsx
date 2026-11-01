"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { SERIES_COLORS, extent, formatTick, linePath, logTicks, nearestIndex, niceTicks, padDomain } from "@/lib/chart";

export interface Series {
  id: string;
  label: string;
  x: number[];
  y: number[];
  color?: string;
  dashed?: boolean;
}

interface Props {
  title: string;
  series: Series[];
  xLabel: string;
  yLabel: string;
  logY?: boolean;
  height?: number;
  /** compact: no legend/table controls (embeds, thumbnails) */
  compact?: boolean;
  /** labelled x positions with vertical grid lines (e.g. high-symmetry points of a band diagram) */
  xTicks?: { x: number; label: string }[];
  /** fixed y range instead of fitting the data */
  yDomain?: [number, number];
}

const W = 760;
const M = { top: 16, right: 20, bottom: 46, left: 70 };

/** Accessible interactive line chart: hover/keyboard crosshair, legend toggles, data table. */
export function LineChart({ title, series, xLabel, yLabel, logY = false, height = 360, compact = false, xTicks: labelledTicks, yDomain: fixedY }: Props) {
  const id = useId();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const H = height;
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  // Sort each series by x so eV axes (descending wavelength) work.
  const prepared = useMemo(
    () =>
      series.map((s, i) => {
        const idx = s.x.map((_, j) => j).sort((a, b) => s.x[a] - s.x[b]);
        return { ...s, x: idx.map((j) => s.x[j]), y: idx.map((j) => s.y[j]), color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] };
      }),
    [series],
  );
  const visible = prepared.filter((s) => !hidden.has(s.id));

  const xDom = padDomain(extent(visible.flatMap((s) => s.x)), 0);
  const yVals = visible.flatMap((s) => s.y).filter((v) => !logY || v > 0);
  const yDom: [number, number] = fixedY
    ? fixedY
    : logY
    ? (() => {
        const [lo, hi] = extent(yVals);
        return [lo / 1.5, hi * 1.5];
      })()
    : padDomain(extent(yVals));
  const sx = (x: number) => M.left + ((x - xDom[0]) / (xDom[1] - xDom[0] || 1)) * iw;
  const sy = (y: number) =>
    logY
      ? M.top + ih - ((Math.log10(y) - Math.log10(yDom[0])) / (Math.log10(yDom[1]) - Math.log10(yDom[0]) || 1)) * ih
      : M.top + ih - ((y - yDom[0]) / (yDom[1] - yDom[0] || 1)) * ih;
  const xTicks = labelledTicks ? labelledTicks.map((t) => t.x) : niceTicks(xDom[0], xDom[1], 7);
  const xTickLabel = (t: number) => labelledTicks?.find((l) => l.x === t)?.label ?? formatTick(t);
  const yTicks = logY ? logTicks(yDom[0], yDom[1]) : niceTicks(yDom[0], yDom[1], 6);

  const master = visible[0];
  const cursorX = master && cursor !== null ? master.x[Math.min(cursor, master.x.length - 1)] : null;

  function onMove(e: PointerEvent<SVGSVGElement>) {
    if (!master || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const x = xDom[0] + ((px - M.left) / iw) * (xDom[1] - xDom[0]);
    setCursor(nearestIndex(master.x, x));
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (!master) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowRight") setCursor((c) => Math.min(master.x.length - 1, (c ?? -1) + step));
    else if (e.key === "ArrowLeft") setCursor((c) => Math.max(0, (c ?? master.x.length) - step));
    else if (e.key === "Escape") setCursor(null);
    else return;
    e.preventDefault();
  }

  const readout =
    cursorX === null
      ? null
      : visible.map((s) => {
          const j = nearestIndex(s.x, cursorX);
          return { s, x: s.x[j], y: s.y[j] };
        });

  return (
    <figure className="w-full" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className={compact ? "sr-only" : "mb-2 text-sm font-semibold"}>
        {title}
      </figcaption>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none rounded-md border border-line bg-bg"
          role="img"
          aria-label={`${title}. ${yLabel} against ${xLabel}. Use left and right arrow keys to read values.`}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
        >
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.left} x2={W - M.right} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={M.left - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="var(--muted)">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={sx(t)} x2={sx(t)} y1={labelledTicks ? M.top : M.top + ih} y2={M.top + ih + 5} stroke={labelledTicks ? "var(--line)" : "var(--muted)"} />
              <text x={sx(t)} y={M.top + ih + 18} textAnchor="middle" fontSize={labelledTicks ? 14 : 12} fill="var(--muted)">
                {xTickLabel(t)}
              </text>
            </g>
          ))}
          {!logY && yDom[0] < 0 && yDom[1] > 0 && (
            <line x1={M.left} x2={W - M.right} y1={sy(0)} y2={sy(0)} stroke="var(--muted)" strokeWidth={1} />
          )}
          <rect x={M.left} y={M.top} width={iw} height={ih} fill="none" stroke="var(--line)" />
          <text x={M.left + iw / 2} y={H - 8} textAnchor="middle" fontSize={13} fill="var(--fg)">
            {xLabel}
          </text>
          <text transform={`translate(16 ${M.top + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize={13} fill="var(--fg)">
            {yLabel}
          </text>
          <clipPath id={`${id}-clip`}>
            <rect x={M.left} y={M.top} width={iw} height={ih} />
          </clipPath>
          <g clipPath={`url(#${id}-clip)`}>
            {visible.map((s) => (
              <path
                key={s.id}
                d={linePath(s.x.map((x, j) => [sx(x), logY && s.y[j] <= 0 ? NaN : sy(s.y[j])]))}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "6 4" : undefined}
              />
            ))}
          </g>
          {readout && cursorX !== null && (
            <g pointerEvents="none">
              <line x1={sx(cursorX)} x2={sx(cursorX)} y1={M.top} y2={M.top + ih} stroke="var(--muted)" strokeDasharray="3 3" />
              {readout.map(({ s, x, y }) =>
                Number.isFinite(y) && (!logY || y > 0) ? <circle key={s.id} cx={sx(x)} cy={sy(y)} r={4} fill={s.color} stroke="var(--bg)" /> : null,
              )}
            </g>
          )}
        </svg>
        {readout && cursorX !== null && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-line bg-bg/95 px-2 py-1 text-xs shadow-sm"
            style={{ left: sx(cursorX) / W > 0.6 ? "auto" : `calc(${(sx(cursorX) / W) * 100}% + 12px)`, right: sx(cursorX) / W > 0.6 ? `calc(${(1 - sx(cursorX) / W) * 100}% + 12px)` : "auto" }}
            aria-live="polite"
          >
            <div className="font-medium">
              {xLabel.split(" (")[0]}: {formatTick(cursorX)}
            </div>
            {readout.map(({ s, y }) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label}: {Number.isFinite(y) ? formatTick(y) : "—"}
              </div>
            ))}
          </div>
        )}
      </div>
      {!compact && (
        <>
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Series">
            {prepared.map((s) => {
              const on = !hidden.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className="btn !py-1 text-xs"
                    aria-pressed={on}
                    onClick={() =>
                      setHidden((h) => {
                        const n = new Set(h);
                        if (n.has(s.id)) n.delete(s.id);
                        else n.add(s.id);
                        return n;
                      })
                    }
                  >
                    <svg width="18" height="8" aria-hidden>
                      <line x1="0" x2="18" y1="4" y2="4" stroke={s.color} strokeWidth="3" strokeDasharray={s.dashed ? "4 3" : undefined} opacity={on ? 1 : 0.3} />
                    </svg>
                    <span className={on ? "" : "line-through opacity-70"}>{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-muted">Data table</summary>
            <div className="mt-2 max-h-72 overflow-auto">
              {visible.map((s) => (
                <table key={s.id} className="mb-3 w-full text-left text-xs">
                  <caption className="text-left font-medium">{s.label}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="pr-4">{xLabel}</th>
                      <th scope="col">{yLabel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.x.map((x, j) => (
                      <tr key={j}>
                        <td className="pr-4 tabular-nums">{formatTick(x)}</td>
                        <td className="tabular-nums">{Number.isFinite(s.y[j]) ? s.y[j].toPrecision(5) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          </details>
        </>
      )}
    </figure>
  );
}
