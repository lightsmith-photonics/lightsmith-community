import Link from "next/link";
import { brand } from "@/lib/brand";

export const metadata = { title: "Pricing", description: `${brand.product} is free and open source. Hosted GPU compute on ${brand.cloud} is planned.` };

const TIERS = [
  {
    name: "Open source",
    price: "Free",
    note: "forever",
    features: [`The full ${brand.product} library (${brand.library.license})`, "CLI, Python API and MCP server", "Run on your own CPU or GPU", `${brand.studio} on your desktop`],
    cta: { href: "/docs", label: "Install" },
  },
  {
    name: `${brand.cloud} Free`,
    price: "Free",
    note: "planned",
    features: ["Shared projects, stars and forks", "Small hosted runs on CPU", "A monthly allowance of GPU minutes", "Public and unlisted projects"],
    cta: { href: "/signin", label: "Create an account" },
    highlight: true,
  },
  {
    name: "GPU hours",
    price: "Pay as you go",
    note: "planned",
    features: ["Large FDTD, DDA and inverse-design runs on hosted GPUs", "Private projects and team sharing", "Job queue with priority", "Usage reports per project"],
    cta: { href: "/forum", label: "Tell us what you need" },
  },
];

export default function PricingPage() {
  return (
    <div className="container-page py-12">
      <h1 className="text-center text-4xl font-bold">Pricing</h1>
      <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
        The {brand.product} library is and will stay free and open source. {brand.cloud}, the hosted compute service, is in preparation; the plans
        below are a preview, and nothing is billed today.
      </p>
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {TIERS.map((t) => (
          <li key={t.name} className={`card flex flex-col ${t.highlight ? "!border-accent ring-1 ring-accent" : ""}`}>
            <h2 className="text-lg font-semibold">{t.name}</h2>
            <p className="mt-2 text-3xl font-bold">{t.price}</p>
            <p className="text-sm text-muted">{t.note}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-success">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link className={`${t.highlight ? "btn-primary" : "btn"} mt-6`} href={t.cta.href}>
              {t.cta.label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center text-sm text-muted">Prices, quotas and availability are not final. Academic and open-science discounts are being considered.</p>
    </div>
  );
}
