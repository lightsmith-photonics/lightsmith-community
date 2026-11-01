/** Mark: a plane wave scattering off a sphere. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="6" fill="var(--accent)" />
      <path d="M2 10 Q5 7 8 10 T14 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="var(--accent)" strokeWidth="1" strokeDasharray="2 4" opacity="0.45" />
    </svg>
  );
}
