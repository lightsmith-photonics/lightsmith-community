import { abs2, add, c, div, mul, scale, sqrt, sub, type Complex } from "./complex";

// Coherent transfer-matrix method for planar multilayers (Byrnes' formulation), exp(-iwt):
// n = n + ik with k >= 0 for loss. Used by the mock compute runner for layer_stack problems.

const exp = (z: Complex): Complex => {
  const m = Math.exp(z.re);
  return c(m * Math.cos(z.im), m * Math.sin(z.im));
};
const neg = (z: Complex) => c(-z.re, -z.im);
const conj = (z: Complex) => c(z.re, -z.im);
const I = c(0, 1);

type M2 = [Complex, Complex, Complex, Complex]; // [m00, m01, m10, m11]
const mm = (a: M2, b: M2): M2 => [
  add(mul(a[0], b[0]), mul(a[1], b[2])),
  add(mul(a[0], b[1]), mul(a[1], b[3])),
  add(mul(a[2], b[0]), mul(a[3], b[2])),
  add(mul(a[2], b[1]), mul(a[3], b[3])),
];

export interface TmmLayer {
  n: Complex;
  thicknessNm: number;
}

/**
 * Power reflectance, transmittance and absorptance of `layers` between semi-infinite media
 * `n0` (incidence side, must be lossless) and `nSub`.
 */
export function tmm(pol: "s" | "p", n0: Complex, layers: TmmLayer[], nSub: Complex, wavelengthNm: number, angleDeg: number) {
  const k0 = (2 * Math.PI) / wavelengthNm;
  const ns = [n0, ...layers.map((l) => l.n), nSub];
  const sin0 = scale(n0, Math.sin((angleDeg * Math.PI) / 180)); // n0 sin(theta0), conserved
  // kz_j = k0 sqrt(n_j^2 - (n0 sin theta0)^2), branch with Im >= 0 (decaying / lossy)
  const kz = ns.map((n) => {
    let q = sqrt(sub(mul(n, n), mul(sin0, sin0)));
    if (q.im < 0 || (q.im === 0 && q.re < 0)) q = neg(q);
    return scale(q, k0);
  });
  const interface_ = (i: number, j: number) => {
    if (pol === "s") {
      const den = add(kz[i], kz[j]);
      return { r: div(sub(kz[i], kz[j]), den), t: div(scale(kz[i], 2), den) };
    }
    const ni2 = mul(ns[i], ns[i]);
    const nj2 = mul(ns[j], ns[j]);
    const den = add(mul(nj2, kz[i]), mul(ni2, kz[j]));
    return { r: div(sub(mul(nj2, kz[i]), mul(ni2, kz[j])), den), t: div(scale(mul(mul(ns[i], ns[j]), kz[i]), 2), den) };
  };

  const f0 = interface_(0, 1);
  let M: M2 = [div(c(1), f0.t), div(f0.r, f0.t), div(f0.r, f0.t), div(c(1), f0.t)];
  for (let j = 1; j <= layers.length; j++) {
    const delta = mul(kz[j], c(layers[j - 1].thicknessNm));
    const f = interface_(j, j + 1);
    const prop: M2 = [exp(neg(mul(I, delta))), c(0), c(0), exp(mul(I, delta))];
    const fresnel: M2 = [div(c(1), f.t), div(f.r, f.t), div(f.r, f.t), div(c(1), f.t)];
    M = mm(M, mm(prop, fresnel));
  }
  const r = div(M[2], M[0]);
  const t = div(c(1), M[0]);
  const last = ns.length - 1;
  // Power transmittance: Re(n_f cos_f) / Re(n_0 cos_0) for s; with conjugated cosines for p.
  const cos = (j: number) => div(kz[j], scale(ns[j], k0));
  const T =
    pol === "s"
      ? (abs2(t) * mul(ns[last], cos(last)).re) / mul(n0, cos(0)).re
      : (abs2(t) * mul(ns[last], conj(cos(last))).re) / mul(n0, conj(cos(0))).re;
  const R = abs2(r);
  return { R, T, A: 1 - R - T, r, t };
}
