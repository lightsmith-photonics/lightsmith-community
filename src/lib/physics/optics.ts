import { abs2, c, div, sqrt, sub, type Complex } from "./complex";

/** h*c in eV*nm: E[eV] = HC_EV_NM / lambda[nm]. */
export const HC_EV_NM = 1239.841984;

export const nmToEv = (nm: number) => HC_EV_NM / nm;
export const evToNm = (ev: number) => HC_EV_NM / ev;

/** Permittivity from refractive index, exp(-iwt) convention: eps = (n + ik)^2. */
export function nkToEps(n: number, k: number): { eps1: number; eps2: number } {
  return { eps1: n * n - k * k, eps2: 2 * n * k };
}

export function epsToNk(eps1: number, eps2: number): { n: number; k: number } {
  const r = sqrt(c(eps1, eps2));
  return { n: r.re, k: Math.abs(r.im) };
}

/** Drude: eps(w) = eps_inf - wp^2 / (w^2 + i*gamma*w), energies in eV. */
export function drudeEps(epsInf: number, wpEv: number, gammaEv: number, wavelengthNm: number): Complex {
  const w = nmToEv(wavelengthNm);
  return sub(c(epsInf), div(c(wpEv * wpEv), c(w * w, gammaEv * w)));
}

/** Drude plus Lorentz poles: + sum delta_eps * w0^2 / (w0^2 - w^2 - i*gamma*w). */
export function drudeLorentzEps(
  epsInf: number,
  wpEv: number,
  gammaEv: number,
  poles: { delta_eps: number; omega0_ev: number; gamma_ev: number }[],
  wavelengthNm: number,
): Complex {
  const w = nmToEv(wavelengthNm);
  let eps = wpEv > 0 ? drudeEps(epsInf, wpEv, gammaEv, wavelengthNm) : c(epsInf);
  for (const p of poles) {
    const term = div(c(p.delta_eps * p.omega0_ev * p.omega0_ev), c(p.omega0_ev ** 2 - w * w, -p.gamma_ev * w));
    eps = c(eps.re + term.re, eps.im + term.im);
  }
  return eps;
}

/** Linear interpolation on a sorted grid; NaN outside it (no extrapolation, as in the library). */
export function interp(x: number, xs: number[], ys: number[]): number {
  if (xs.length === 0 || x < xs[0] || x > xs[xs.length - 1]) return NaN;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  if (xs[hi] === xs[lo]) return ys[lo];
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

export function relativeDifference(a: number[], b: number[]): { max: number; rms: number } {
  let max = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const r = Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), 1e-300);
    max = Math.max(max, r);
    sum += r * r;
  }
  return { max, rms: Math.sqrt(sum / Math.max(1, a.length)) };
}

export { abs2 };
