import { SERIES_COLORS, extent, linePath } from "@/lib/chart";
import type { ResultPreview } from "@/lib/problem/result";

/** Static thumbnail of a stored result's preview (no client JavaScript). */
export function PreviewChart({ preview, width = 320, height = 90 }: { preview: ResultPreview; width?: number; height?: number }) {
  const [x0, x1] = extent(preview.x);
  const [y0, y1] = extent(preview.series.flatMap((s) => s.y));
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * (width - 4) + 2;
  const sy = (y: number) => height - 2 - ((y - y0) / (y1 - y0 || 1)) * (height - 4);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${preview.yLabel} against ${preview.xLabel}: ${preview.headline}`}>
      {preview.xTicks?.map((t) => (
        <line key={`${t.label}${t.x}`} x1={sx(t.x)} x2={sx(t.x)} y1={0} y2={height} stroke="var(--line)" />
      ))}
      {preview.series.map((s, i) => (
        <path key={s.label} d={linePath(preview.x.map((x, j) => [sx(x), sy(s.y[j])]))} fill="none" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={1.5} />
      ))}
    </svg>
  );
}
