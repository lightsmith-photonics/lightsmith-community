import { formatTick, linePath } from "@/lib/chart";
import type { FarField } from "@/lib/problem/result";

const S = 360;
const R = 140;

function cut(ff: FarField, phi: number) {
  const idx = (p: number) => ff.phi_deg.reduce((b, v, i) => (Math.abs(v - p) < Math.abs(ff.phi_deg[b] - p) ? i : b), 0);
  const a = idx(phi);
  const b = idx(phi + 180 > 360 ? phi - 180 : phi + 180);
  // Right half: phi; left half: phi + 180 (theta measured from +z, pointing up).
  const right = ff.theta_deg.map((t, i) => ({ ang: t, v: ff.dcsca_domega_nm2[i][a] }));
  const left = ff.theta_deg.map((t, i) => ({ ang: -t, v: ff.dcsca_domega_nm2[i][b] })).reverse();
  return [...left, ...right];
}

/** Far-field cuts (phi = 0 and 90 degrees) in polar form; theta = 0 is the propagation direction (up). */
export function PolarPlot({ ff, title }: { ff: FarField; title: string }) {
  const cuts = [
    { label: "φ = 0° (E-plane for x-pol.)", pts: cut(ff, 0), color: "var(--plot-1)" },
    { label: "φ = 90°", pts: cut(ff, 90), color: "var(--plot-2)", dashed: true },
  ];
  const max = Math.max(...cuts.flatMap((c) => c.pts.map((p) => p.v)).filter(Number.isFinite), 1e-30);
  const xy = (ang: number, v: number): [number, number] => {
    const r = (v / max) * R;
    const a = (ang * Math.PI) / 180;
    return [S / 2 + r * Math.sin(a), S / 2 - r * Math.cos(a)];
  };
  return (
    <figure className="w-full max-w-md">
      <figcaption className="mb-2 text-sm font-semibold">{title}</figcaption>
      <svg viewBox={`0 0 ${S} ${S}`} className="h-auto w-full rounded-md border border-line bg-bg" role="img" aria-label={`${title}. Peak dC/dΩ ${formatTick(max)} nm²/sr.`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={S / 2} cy={S / 2} r={R * f} fill="none" stroke="var(--line)" />
        ))}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const [x, y] = xy(a, max * 1.12);
          return (
            <text key={a} x={x} y={y} fontSize={11} fill="var(--muted)" textAnchor="middle" dominantBaseline="middle">
              {a > 180 ? a - 360 : a}°
            </text>
          );
        })}
        {cuts.map((c) => (
          <path key={c.label} d={linePath(c.pts.map((p) => xy(p.ang, p.v))) + "Z"} fill="none" stroke={c.color} strokeWidth={2} strokeDasharray={c.dashed ? "5 4" : undefined} />
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        {cuts.map((c) => (
          <li key={c.label} className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden>
              <line x1="0" x2="18" y1="4" y2="4" stroke={c.color} strokeWidth="3" strokeDasharray={c.dashed ? "4 3" : undefined} />
            </svg>
            {c.label}
          </li>
        ))}
        <li>λ = {ff.wavelength_nm} nm, max {formatTick(max)} nm²/sr</li>
      </ul>
    </figure>
  );
}
