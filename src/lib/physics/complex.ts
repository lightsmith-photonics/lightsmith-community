export interface Complex {
  re: number;
  im: number;
}

export const c = (re: number, im = 0): Complex => ({ re, im });
export const add = (a: Complex, b: Complex): Complex => c(a.re + b.re, a.im + b.im);
export const sub = (a: Complex, b: Complex): Complex => c(a.re - b.re, a.im - b.im);
export const mul = (a: Complex, b: Complex): Complex => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
export const scale = (a: Complex, s: number): Complex => c(a.re * s, a.im * s);
export const abs2 = (a: Complex): number => a.re * a.re + a.im * a.im;
export const abs = (a: Complex): number => Math.hypot(a.re, a.im);

export function div(a: Complex, b: Complex): Complex {
  const d = abs2(b);
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}

export function sqrt(a: Complex): Complex {
  const r = abs(a);
  const re = Math.sqrt((r + a.re) / 2);
  const im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (r - a.re) / 2));
  return c(re, im);
}
