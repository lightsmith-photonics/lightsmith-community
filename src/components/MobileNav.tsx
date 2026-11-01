"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="md:hidden">
      <button type="button" className="btn !px-2" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
        <span className="sr-only">Menu</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
        </svg>
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-14 border-b border-line bg-bg p-2 shadow-lg">
          <ul>
            {items.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block rounded-md px-3 py-2 hover:bg-surface">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
