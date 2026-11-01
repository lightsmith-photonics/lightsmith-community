"use client";

import { useId, useMemo, useState } from "react";
import { colormap, extent, formatTick, niceTicks } from "@/lib/chart";

interface Props {
  title: string;
  /** values[i][j]: i along x (axis1), j along y (axis2) */
  values: number[][];
  xAxis: number[];
  yAxis: number[];
  xLabel: string;
  yLabel: string;
  valueLabel: string;
  defaultLog?: boolean;
}

const S = 420;
const M = { top: 10, right: 10, bottom: 44, left: 56 };

/** Near-field map with linear/log colour scale, hover readout and summary text for screen readers. */
export function Heatmap({ title, values, xAxis, yAxis, xLabel, yLabel, valueLabel, defaultLog = true }: Props) {
  const id = useId();
  const [log, setLog] = useState(defaultLog);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  const flat = useMemo(() => values.flat().filter((v) => Number.isFinite(v) && (!log || v > 0)), [values, log]);
  const [lo, hi] = extent(flat);
  const tf = (v: number) => (log ? Math.log10(v) : v);
  const [tlo, thi] = [tf(Math.max(lo, log ? 1e-12 : lo)), tf(hi)];
  const norm = (v: number) => (thi === tlo ? 0.5 : (tf(v) - tlo) / (thi - tlo));
  const nx = xAxis.length;
  const ny = yAxis.length;
  const cw = (S - M.left - M.right) / nx;
  const ch = (S - M.top - M.bottom) / ny;
  const [x0, x1] = [xAxis[0], xAxis[nx - 1]];
  const [y0, y1] = [yAxis[0], yAxis[ny - 1]];
  const px = (x: number) => M.left + ((x - x0) / (x1 - x0 || 1)) * (S - M.left - M.right);
  const py = (y: number) => S - M.bottom - ((y - y0) / (y1 - y0 || 1)) * (S - M.top - M.bottom);
  const max = hi;

  return (
    <figure aria-labelledby={`${id}-t`} className="w-full max-w-xl">
      <figcaption id={`${id}-t`} className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
        <span>{title}</span>
        <label className="flex items-center gap-1.5 text-xs font-normal">
          <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> Log scale
        </label>
      </figcaption>
      <div className="flex items-stretch gap-3">
        <svg
          viewBox={`0 0 ${S} ${S}`}
          className="h-auto w-full rounded-md border border-line bg-bg"
          role="img"
          aria-label={`${title}. Maximum ${valueLabel} ${formatTick(max)}.`}
          onPointerLeave={() => setHover(null)}
        >
          {values.map((col, i) =>
            col.map((v, j) => (
              <rect
                key={`${i}-${j}`}
                x={M.left + i * cw}
                y={S - M.bottom - (j + 1) * ch}
                width={cw + 0.5}
                height={ch + 0.5}
                fill={Number.isFinite(v) && (!log || v > 0) ? colormap(norm(v)) : "var(--surface-2)"}
                onPointerEnter={() => setHover({ i, j })}
              />
            )),
          )}
          {niceTicks(x0, x1, 5).map((t) => (
            <text key={`x${t}`} x={px(t)} y={S - M.bottom + 16} fontSize={11} textAnchor="middle" fill="var(--muted)">
              {formatTick(t)}
            </text>
          ))}
          {niceTicks(y0, y1, 5).map((t) => (
            <text key={`y${t}`} x={M.left - 6} y={py(t)} fontSize={11} textAnchor="end" dominantBaseline="middle" fill="var(--muted)">
              {formatTick(t)}
            </text>
          ))}
          <text x={(S + M.left) / 2} y={S - 8} fontSize={12} textAnchor="middle" fill="var(--fg)">
            {xLabel}
          </text>
          <text transform={`translate(14 ${(S - M.bottom) / 2}) rotate(-90)`} fontSize={12} textAnchor="middle" fill="var(--fg)">
            {yLabel}
          </text>
        </svg>
        <div className="flex w-14 shrink-0 flex-col items-center text-[11px] text-muted" aria-hidden>
          <span>{formatTick(hi)}</span>
          <div
            className="my-1 w-4 flex-1 rounded-sm border border-line"
            style={{ background: `linear-gradient(to top, ${[0, 0.25, 0.5, 0.75, 1].map((t) => colormap(t)).join(",")})` }}
          />
          <span>{formatTick(lo)}</span>
        </div>
      </div>
      <p className="mt-1 h-5 text-xs text-muted" aria-live="polite">
        {hover
          ? `${xLabel.split(" (")[0]} ${formatTick(xAxis[hover.i])}, ${yLabel.split(" (")[0]} ${formatTick(yAxis[hover.j])}: ${valueLabel} ${
              Number.isFinite(values[hover.i][hover.j]) ? formatTick(values[hover.i][hover.j]) : "undefined"
            }`
          : `Max ${valueLabel} ${formatTick(max)}`}
      </p>
    </figure>
  );
}
