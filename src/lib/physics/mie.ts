import { abs2, add, c, div, mul, scale, sub, type Complex } from "./complex";

/**
 * Mie efficiencies of a homogeneous sphere (Bohren & Huffman BHMIE, cross sections only).
 * Used by the mock compute runner and demo data; the real numbers come from Lightsmith Cloud (lightsmith-cloud).
 *
 * @param m relative refractive index n_particle / n_medium, exp(-iwt) convention (Im m >= 0 = loss)
 * @param x size parameter 2*pi*n_medium*radius / lambda_vacuum
 */
export function mieEfficiencies(m: Complex, x: number): { qext: number; qsca: number; qabs: number } {
  if (!Number.isFinite(m.re) || !Number.isFinite(m.im) || !(x > 0)) return { qext: NaN, qsca: NaN, qabs: NaN };
  const nstop = Math.round(x + 4 * Math.cbrt(x) + 2);
  const y = mul(m, c(x));
  const nmx = Math.max(nstop, Math.round(Math.hypot(y.re, y.im))) + 15;

  // Logarithmic derivative D_n(mx) by downward recurrence.
  const d: Complex[] = new Array(nmx + 1).fill(c(0));
  for (let n = nmx; n >= 1; n--) {
    const ny = div(c(n), y);
    d[n - 1] = sub(ny, div(c(1), add(d[n], ny)));
  }

  let psi0 = Math.cos(x);
  let psi1 = Math.sin(x);
  let chi0 = -Math.sin(x);
  let chi1 = Math.cos(x);
  let xi1 = c(psi1, -chi1);
  let qsca = 0;
  let qext = 0;

  for (let n = 1; n <= nstop; n++) {
    const psi = ((2 * n - 1) / x) * psi1 - psi0;
    const chi = ((2 * n - 1) / x) * chi1 - chi0;
    const xi = c(psi, -chi);
    const nx = n / x;
    const da = add(div(d[n], m), c(nx));
    const db = add(mul(m, d[n]), c(nx));
    const an = div(sub(scale(da, psi), c(psi1)), sub(mul(da, xi), xi1));
    const bn = div(sub(scale(db, psi), c(psi1)), sub(mul(db, xi), xi1));
    qsca += (2 * n + 1) * (abs2(an) + abs2(bn));
    qext += (2 * n + 1) * (an.re + bn.re);
    psi0 = psi1;
    psi1 = psi;
    chi0 = chi1;
    chi1 = chi;
    xi1 = c(psi1, -chi1);
  }
  qsca *= 2 / (x * x);
  qext *= 2 / (x * x);
  return { qext, qsca, qabs: qext - qsca };
}

/** Cross sections in nm^2 of a sphere of radius `radiusNm` with complex index `nParticle` in a host of index `nMedium`. */
export function mieSphere(radiusNm: number, nParticle: Complex, nMedium: number, wavelengthNm: number) {
  const x = (2 * Math.PI * nMedium * radiusNm) / wavelengthNm;
  const m = c(nParticle.re / nMedium, nParticle.im / nMedium);
  const q = mieEfficiencies(m, x);
  const area = Math.PI * radiusNm * radiusNm;
  return { cext: q.qext * area, csca: q.qsca * area, cabs: q.qabs * area };
}
