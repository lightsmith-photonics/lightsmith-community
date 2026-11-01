import Link from "next/link";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";
import { CodeBlock } from "@/components/CodeBlock";
import { ProjectCard, projectCardSelect } from "@/components/ProjectCard";

export const dynamic = "force-dynamic";

const L = brand.library;

const QUICKSTART = `import ${L.module} as ${L.alias}

# A silicon strip waveguide: effective index and mode profiles
modes = ${L.alias}.solve({
    "kind": "mode",
    "structures": [{"profile": {"kind": "rectangle", "size_nm": [500, 220]},
                    "material": {"kind": "library", "name": "Si"}}],
    "background": {"kind": "library", "name": "SiO2"},
    "window_size_nm": [2000, 1500],
    "wavelengths": [1500, 1550, 1600],
}, device="gpu")

print(modes.modes[1][0].neff_real)   # mode 0 at 1550 nm`;

const AREAS = [
  { name: "Integrated photonics", what: "Waveguide modes (FDE), devices and S-parameters (FDTD, FDFD, EME), circuit netlists from compact models.", kinds: "mode · device · circuit" },
  { name: "Metasurfaces and gratings", what: "Periodic structures with RCWA: diffraction orders, reflectance and transmittance against wavelength and angle.", kinds: "periodic" },
  { name: "Thin films", what: "Transfer-matrix spectra of coatings, filters and Bragg mirrors, with coherent and incoherent layers.", kinds: "layer_stack" },
  { name: "Photonic crystals", what: "Band diagrams and band gaps from plane-wave expansion along any k-path.", kinds: "bands" },
  { name: "Nanophotonics and plasmonics", what: "Scattering by particles and clusters: Mie, T-matrix, DDA and FDTD, with near and far fields.", kinds: "scattering" },
  { name: "Inverse design", what: "Differentiable solvers for topology optimisation of devices. Coming soon as a headline feature.", kinds: "optimization" },
];

export default async function Home() {
  const recent = await db.project.findMany({ where: { visibility: "public" }, orderBy: { updatedAt: "desc" }, take: 3, select: projectCardSelect });

  return (
    <>
      <section className="border-b border-line bg-surface">
        <div className="container-page grid gap-10 py-16 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="badge mb-4">Open source · {L.license} · GPU-native · differentiable</p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{brand.tagline}</h1>
            <p className="mt-4 max-w-prose text-lg text-muted">
              {brand.pitch} {brand.community} is where people share problems, results, materials data and questions.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/docs" className="btn-primary !px-4 !py-2">Get started</Link>
              <Link href="/projects" className="btn !px-4 !py-2">Browse projects</Link>
              <Link href="/materials" className="btn !px-4 !py-2">{brand.materials}</Link>
              <a href={env.githubRepo} className="btn !px-4 !py-2">GitHub</a>
            </div>
            <div className="mt-6 max-w-md">
              <CodeBlock code={L.install} label="Install command" />
            </div>
          </div>
          <div>
            <CodeBlock code={QUICKSTART} label="Python quick start" lang="python" />
          </div>
        </div>
      </section>

      <section className="container-page py-12" aria-labelledby="areas">
        <h2 id="areas" className="text-2xl font-semibold">One spec format, from nanoparticles to photonic chips</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((a) => (
            <li key={a.name} className="card">
              <h3 className="font-semibold">{a.name}</h3>
              <p className="mt-2 text-sm text-muted">{a.what}</p>
              <p className="mt-2 font-mono text-xs text-muted">kind: {a.kinds}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          <code>solve(problem, method=&quot;auto&quot;)</code> picks the most accurate applicable solver for each problem kind, and <code>compare</code>{" "}
          cross-checks solvers against each other. Every result carries provenance and warnings.
        </p>
      </section>

      <section className="container-page grid gap-6 py-6 md:grid-cols-3" aria-label="Platform features">
        <div className="card">
          <h2 className="text-lg font-semibold">{brand.materials}</h2>
          <p className="mt-2 text-sm text-muted">
            Optical constants per paper, plotted as n, k or ε against wavelength or energy, with DOIs and licences. Download as CSV, YAML or a
            ready-to-use material for your specs, and contribute your own measurements.
          </p>
          <Link href="/materials" className="link mt-3 inline-block text-sm">Browse materials</Link>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold">Shareable projects</h2>
          <p className="mt-2 text-sm text-muted">
            Keep problems, results and notes together: spectra, mode profiles, S-parameters and band diagrams. Fork, star, embed plots, open in{" "}
            {brand.studio} or run on {brand.cloud}.
          </p>
          <Link href="/projects" className="link mt-3 inline-block text-sm">See projects</Link>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold">A forum that speaks LaTeX</h2>
          <p className="mt-2 text-sm text-muted">Ask about convergence, materials, devices and methods with equations, code and attached specs or results.</p>
          <Link href="/forum" className="link mt-3 inline-block text-sm">Visit the forum</Link>
        </div>
      </section>

      <section className="container-page py-12" aria-labelledby="agents">
        <div className="card grid gap-6 md:grid-cols-2 md:items-center">
          <div>
            <h2 id="agents" className="text-2xl font-semibold">Built for AI agents</h2>
            <p className="mt-2 text-muted">
              Every interface is JSON in, JSON out. Agents fetch the schema, call <code>estimate</code> before <code>solve</code>, read warnings and
              provenance, and cross-check solvers. The MCP server exposes the same tools to any MCP client.
            </p>
            <Link href="/docs/agents" className="link mt-3 inline-block">Agent integration guide</Link>
          </div>
          <CodeBlock code={`${L.installMcp}\n${L.mcpServer}   # stdio MCP server`} label="MCP install" />
        </div>
      </section>

      {recent.length > 0 && (
        <section className="container-page py-6" aria-labelledby="recent">
          <div className="flex items-baseline justify-between">
            <h2 id="recent" className="text-2xl font-semibold">Recently updated projects</h2>
            <Link href="/projects" className="link text-sm">All projects</Link>
          </div>
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {recent.map((p) => (
              <li key={p.slug}>
                <ProjectCard p={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
