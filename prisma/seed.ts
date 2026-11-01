// Demo data: users with each role, projects of every problem kind with results the library
// computed (fixtures/demo, built by scripts/build_demo_results.py), and forum threads.
// Opt-in: `npm run db:seed` (or the compose `seed` service). It clears the tables it fills, so
// run it only against a development database. Needs object storage (S3_*) for the results.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { saveResult } from "../src/lib/results-store";
import { commit } from "../src/lib/versions/store";
import { parseResult } from "../src/lib/problem/result";
import { mockSolve } from "../src/lib/problem/mock-solver";
import { mockNkLookup } from "../src/lib/materials/mock";
import type { Simulation } from "../src/lib/problem/spec";

const db = new PrismaClient();
const DEMO = join(__dirname, "..", "fixtures", "demo");
const days = (n: number) => new Date(Date.UTC(2026, 9, 31) - n * 86_400_000);
const spec = (name: string) => JSON.parse(readFileSync(join(DEMO, `${name}.spec.json`), "utf8")) as Record<string, unknown>;
const result = (name: string) => {
  const p = parseResult(readFileSync(join(DEMO, `${name}.result.json`), "utf8"));
  if (!p.ok) throw new Error(`fixtures/demo/${name}.result.json: ${p.error}`);
  return p.result;
};
const pretty = (v: unknown) => JSON.stringify(v, null, 2);

async function project(input: {
  slug: string;
  title: string;
  description: string;
  tags: string;
  ownerId: string;
  notes?: string;
  visibility?: string;
  createdAt?: Date;
  forkedFromId?: string;
  forkedFromVersionId?: string;
  demos: { spec: string; name: string; resultName?: string }[];
}) {
  const p = await db.project.create({
    data: {
      slug: input.slug,
      title: input.title,
      description: input.description,
      tags: input.tags,
      ownerId: input.ownerId,
      notes: input.notes ?? "",
      visibility: input.visibility ?? "public",
      createdAt: input.createdAt,
      forkedFromId: input.forkedFromId,
      forkedFromVersionId: input.forkedFromVersionId,
    },
  });
  const specs = [];
  for (const d of input.demos) {
    const problem = spec(d.spec);
    specs.push(await db.spec.create({ data: { projectId: p.id, name: d.name, kind: String(problem.kind ?? "scattering"), json: pretty(problem) } }));
  }
  // v1 holds the specs; results saved afterwards are linked to it.
  const { version } = await commit({ projectId: p.id, authorId: input.ownerId, message: input.forkedFromId ? "Forked" : "Initial version" });
  const results = [];
  for (const [i, d] of input.demos.entries()) {
    if (d.resultName) results.push(await saveResult({ projectId: p.id, specId: specs[i].id, name: d.resultName, result: result(d.spec) }));
  }
  return { ...p, results, version };
}

async function main() {
  for (const t of ["notification", "flag", "vote", "post", "thread", "forumCategory", "star", "versionResult", "projectCollaborator", "job", "projectVersion", "resultRecord", "spec", "project", "materialSubmission", "account", "session", "verificationToken", "user"] as const) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[t].deleteMany();
  }

  const [ada, maxwell, mie, rayleigh] = await Promise.all([
    db.user.create({ data: { id: "seed-user-ada", username: "ada", name: "Ada Lovelace", email: "ada@example.test", emailVerified: days(40), role: "admin", affiliation: "Analytical Engine Lab", orcid: "0000-0002-1825-0097", bio: "Maintainer. Integrated photonics and **reproducible numerics**." } }),
    db.user.create({ data: { id: "seed-user-maxwell", username: "maxwell", name: "James Clerk Maxwell", email: "maxwell@example.test", emailVerified: days(40), role: "moderator", affiliation: "King's College", bio: "Moderator. $\\nabla \\times \\mathbf{H} = \\mathbf{J} + \\partial_t \\mathbf{D}$" } }),
    db.user.create({ data: { id: "seed-user-mie", username: "mie", name: "Gustav Mie", email: "mie@example.test", emailVerified: days(40), affiliation: "Universität Greifswald", bio: "Spheres, mostly. Lately metasurfaces." } }),
    db.user.create({ data: { id: "seed-user-rayleigh", username: "rayleigh", name: "Lord Rayleigh", email: "rayleigh@example.test", emailVerified: days(40), affiliation: "Cavendish Laboratory", bio: "Thin films and gratings." } }),
  ]);

  // ---------------- Projects (one per area) ----------------
  const wg = await project({
    slug: "silicon-strip-waveguide-modes",
    title: "Silicon strip waveguide: modes and dispersion",
    description: "The standard 500 × 220 nm SOI strip around 1550 nm: effective and group index, TE fraction and field profiles.",
    tags: "integrated-photonics,silicon,waveguide,fde",
    ownerId: ada.id,
    createdAt: days(20),
    notes: `## Notes

Group index from the effective-index dispersion:

$$ n_g = n_{eff} - \\lambda \\frac{\\partial n_{eff}}{\\partial \\lambda} $$

Expect $n_{eff} \\approx 2.4$ and $n_g \\approx 4.2$ for the fundamental TE-like mode at 1550 nm.`,
    demos: [{ spec: "mode", name: "si-strip-500x220", resultName: "FDE, 2 modes with fields" }],
  });
  await project({
    slug: "mzi-circuit",
    title: "Mach–Zehnder interferometer from a netlist",
    description: "Two 50:50 couplers and a 20 µm path difference. The free spectral range follows λ²/(n_g ΔL).",
    tags: "integrated-photonics,circuit,mzi",
    ownerId: ada.id,
    createdAt: days(15),
    demos: [{ spec: "circuit", name: "mzi-dl20um", resultName: "Circuit S-parameters" }],
  });
  const films = await project({
    slug: "anti-reflection-and-bragg-mirrors",
    title: "Anti-reflection coating and Bragg mirror",
    description: "A quarter-wave MgF₂ coating on glass (550 nm) and an 8-pair TiO₂/MgF₂ Bragg mirror (quarter-wave at 620 nm).",
    tags: "thin-films,coatings,tmm",
    ownerId: rayleigh.id,
    createdAt: days(12),
    notes: "Quarter-wave condition: $n d = \\lambda_0 / 4$. For MgF₂ ($n = 1.38$) at 550 nm, $d \\approx 100$ nm.",
    demos: [
      { spec: "layer_stack", name: "mgf2-ar-coating", resultName: "TMM, 0° and 45°" },
      { spec: "bragg", name: "tio2-mgf2-bragg-8", resultName: "TMM, normal incidence" },
    ],
  });
  await project({
    slug: "tio2-grating-rcwa",
    title: "TiO₂ grating on glass",
    description: "A 400 nm period dielectric grating: zeroth-order spectra and diffraction orders with RCWA.",
    tags: "metasurfaces,grating,rcwa",
    ownerId: mie.id,
    createdAt: days(9),
    demos: [{ spec: "periodic", name: "tio2-grating-p400", resultName: "RCWA, 15 harmonics" }],
  });
  await project({
    slug: "square-lattice-photonic-crystal",
    title: "Square lattice of dielectric rods: band gaps",
    description: "Rods with ε = 8.9 and r = 0.2a in air. TM has a complete gap between bands 1 and 2.",
    tags: "photonic-crystals,bands,pwe",
    ownerId: rayleigh.id,
    createdAt: days(7),
    demos: [{ spec: "bands", name: "rods-r0.2a", resultName: "PWE, TE and TM" }],
  });
  const goldSpec = spec("scattering");
  const gold = await project({
    slug: "gold-nanosphere-plasmon",
    title: "Gold nanosphere plasmon in water",
    description: "A 40 nm Drude sphere: Mie reference spectrum, near-field hot spots and dipole far field.",
    tags: "nanophotonics,plasmonics,mie",
    ownerId: mie.id,
    createdAt: days(18),
    demos: [{ spec: "scattering", name: "drude-sphere-40nm", resultName: "Mie (miepython)" }],
  });
  const goldLibrary: Simulation = {
    particles: [{ shape: { kind: "sphere", radius_nm: 40 }, material: { kind: "library", name: "Au", dataset: "Johnson-Christy" } }],
    medium_index: 1.33,
    wavelengths: { start_nm: 400, stop_nm: 800, num: 81 },
  };
  const goldSpecRow = await db.spec.create({ data: { projectId: gold.id, name: "au-jc-sphere-40nm", kind: "scattering", json: pretty(goldLibrary) } });
  await commit({ projectId: gold.id, authorId: mie.id, message: "Add the Johnson-Christy gold sphere" });
  const goldFields = await saveResult({ projectId: gold.id, specId: goldSpecRow.id, name: "Johnson-Christy, near and far field (mock)", result: mockSolve(goldLibrary, { lookup: mockNkLookup }) });

  const fork = await project({
    slug: "si-waveguide-fork",
    title: "Silicon strip waveguide: modes and dispersion",
    description: "Fork: trying a 450 nm wide strip for single-mode operation.",
    tags: "integrated-photonics,silicon,waveguide",
    ownerId: maxwell.id,
    visibility: "unlisted",
    forkedFromId: wg.id,
    forkedFromVersionId: wg.version.id,
    createdAt: days(5),
    demos: [{ spec: "mode", name: "si-strip-500x220" }],
  });
  await project({
    slug: "ada-scratchpad",
    title: "Scratchpad",
    description: "Private experiments.",
    visibility: "private",
    ownerId: ada.id,
    tags: "",
    demos: [{ spec: "layer_stack", name: "ar-coating-copy" }],
  });
  void goldSpec;

  const allProjects = await db.project.findMany({ select: { id: true, slug: true } });
  const id = (slug: string) => allProjects.find((p) => p.slug === slug)!.id;
  await db.star.createMany({
    data: [
      { userId: mie.id, projectId: wg.id },
      { userId: maxwell.id, projectId: wg.id },
      { userId: rayleigh.id, projectId: wg.id },
      { userId: ada.id, projectId: films.id },
      { userId: ada.id, projectId: id("tio2-grating-rcwa") },
      { userId: mie.id, projectId: id("square-lattice-photonic-crystal") },
    ],
  });

  await db.materialSubmission.create({ data: { remoteId: "sub_demo1", userId: mie.id, material: "Au", title: "Demo ellipsometry 2026", status: "pending" } });

  // ---------------- Forum ----------------
  const cats = await Promise.all(
    [
      ["integrated-photonics", "Integrated photonics", "Waveguides, couplers, rings, modulators, circuits and S-parameters."],
      ["metasurfaces", "Metasurfaces and gratings", "Periodic structures, metalenses, diffraction and RCWA."],
      ["thin-films", "Thin films", "Coatings, filters, Bragg mirrors and multilayer stacks."],
      ["photonic-crystals", "Photonic crystals", "Band structures, band gaps, slabs and cavities."],
      ["nanophotonics", "Nanophotonics and plasmonics", "Particles, antennas, near fields: Mie, T-matrix, DDA, FDTD."],
      ["inverse-design", "Inverse design", "Topology optimisation, adjoints and differentiable solvers."],
      ["materials", "Materials", "Optical constants, datasets and dispersion models."],
      ["help", "Help", "Installation, first simulations, the problem spec and this site."],
    ].map(([slug, name, description], position) => db.forumCategory.create({ data: { slug, name, description, position } })),
  );
  const cat = Object.fromEntries(cats.map((c) => [c.slug, c]));

  const t1 = await db.thread.create({
    data: {
      title: "Group index of a 500 × 220 nm strip: what grid spacing is enough?",
      categoryId: cat["integrated-photonics"].id,
      authorId: mie.id,
      createdAt: days(10),
      lastActivityAt: days(9),
      posts: {
        create: {
          authorId: mie.id,
          createdAt: days(10),
          body: `I get $n_g = 4.04$ with \`grid_spacing_nm: 25\`. Does it converge, and how fine do I need to go for $10^{-3}$ accuracy in $n_{eff}$?

\`\`\`json
"options": {"fde": {"grid_spacing_nm": 25}}
\`\`\``,
          attachedSpecId: (await db.spec.findFirstOrThrow({ where: { projectId: wg.id } })).id,
        },
      },
    },
  });
  const a1 = await db.post.create({
    data: {
      threadId: t1.id,
      authorId: maxwell.id,
      createdAt: days(9),
      score: 2,
      body: `The default subpixel averaging helps a lot; errors fall roughly as $h^2$:

$$ n_{eff}(h) \\approx n_{eff}(0) + C h^2 $$

so solve at 25, 15 and 10 nm and Richardson-extrapolate. @mie with \`subpixel: "anisotropic"\` 15 nm is usually within $10^{-3}$.`,
    },
  });
  await db.post.create({ data: { threadId: t1.id, authorId: rayleigh.id, createdAt: days(9), score: 1, body: "Also widen the window: at 2 × 1.5 µm the TM-like mode still feels the boundary." } });
  await db.thread.update({ where: { id: t1.id }, data: { acceptedPostId: a1.id } });
  await db.vote.createMany({ data: [{ userId: ada.id, postId: a1.id, value: 1 }, { userId: mie.id, postId: a1.id, value: 1 }] });

  const filmResult = films.results[1];
  const bragg = await db.thread.create({
    data: {
      title: "Bragg mirror: stop band runs off the end of my wavelength range",
      categoryId: cat["thin-films"].id,
      authorId: rayleigh.id,
      createdAt: days(6),
      lastActivityAt: days(4),
      posts: {
        create: {
          authorId: rayleigh.id,
          body: "R stays above 0.9 from 524 nm up to the 700 nm end of my range, so I cannot see the red edge. The quarter-wave estimate $\\Delta\\lambda = \\frac{4\\lambda_0}{\\pi}\\arcsin\\frac{n_H - n_L}{n_H + n_L}$ gives about 190 nm. Is the stack really centred at 550 nm?",
          attachedResultId: filmResult.id,
        },
      },
    },
  });

  await db.post.create({
    data: {
      threadId: bragg.id,
      authorId: maxwell.id,
      createdAt: days(4),
      body: "No: $n_H d_H = 2.4 \\times 64.6 \\approx 155$ nm and $n_L d_L = 1.38 \\times 112.3 \\approx 155$ nm, so $\\lambda_0 = 4 \\times 155 = 620$ nm. A 190 nm stop band around 620 nm runs from about 525 to 715 nm, which matches your result. Widen the range to 800 nm to see the edge.",
    },
  });

  await db.thread.create({
    data: {
      title: "Welcome! Posting specs, results and equations",
      categoryId: cat.help.id,
      authorId: ada.id,
      pinned: true,
      createdAt: days(30),
      lastActivityAt: days(30),
      posts: {
        create: {
          authorId: ada.id,
          body: `Welcome to the forum.

- Use \`$...$\` for inline maths like $n_g = n_{eff} - \\lambda\\, \\partial n_{eff}/\\partial\\lambda$ and \`$$...$$\` for display equations.
- Fenced code blocks get syntax highlighting.
- Attach a spec or result from one of your projects when you ask about a simulation.
- Mention people with @username. Be kind; report posts that break the rules.`,
        },
      },
    },
  });

  const t4 = await db.thread.create({
    data: {
      title: "Near-field hot spots of a gold sphere at the plasmon peak",
      categoryId: cat.nanophotonics.id,
      authorId: mie.id,
      createdAt: days(3),
      lastActivityAt: days(2),
      posts: { create: { authorId: mie.id, body: "Quasi-static near field and dipole far field at the extinction peak: hot spots along the polarisation axis.", attachedResultId: goldFields.id } },
    },
  });
  const spam = await db.post.create({ data: { threadId: t4.id, authorId: rayleigh.id, createdAt: days(2), body: "Great plots! (Pretend this is off-topic so the flag queue has something in it.)" } });
  await db.flag.create({ data: { postId: spam.id, reporterId: maxwell.id, reason: "Demo report: off-topic." } });

  await db.thread.create({
    data: {
      title: "Which objective for a broadband 90° bend?",
      categoryId: cat["inverse-design"].id,
      authorId: ada.id,
      createdAt: days(1),
      posts: { create: { authorId: ada.id, body: "Planning a topology-optimised bend from 1500 to 1600 nm. Minimise the worst-case insertion loss, or the mean? @rayleigh @maxwell" } },
    },
  });

  await db.notification.createMany({
    data: [
      { userId: mie.id, actorId: maxwell.id, type: "mention", message: `@maxwell mentioned you in “${t1.title}”`, url: `/forum/t/${t1.id}#post-${a1.id}`, createdAt: days(9) },
      { userId: maxwell.id, actorId: mie.id, type: "accepted", message: `Your answer in “${t1.title}” was accepted`, url: `/forum/t/${t1.id}#post-${a1.id}`, createdAt: days(9) },
      { userId: ada.id, actorId: maxwell.id, type: "fork", message: "@maxwell forked “Silicon strip waveguide: modes and dispersion”", url: `/p/${fork.slug}`, createdAt: days(5) },
      { userId: ada.id, actorId: mie.id, type: "submission", message: "New dataset for review: Gold — Demo ellipsometry 2026", url: "/moderation/materials", createdAt: days(3) },
    ],
  });

  const counts = await Promise.all([db.user.count(), db.project.count(), db.resultRecord.count(), db.thread.count()]);
  console.log(`[seed] users=${counts[0]} projects=${counts[1]} results=${counts[2]} threads=${counts[3]}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
