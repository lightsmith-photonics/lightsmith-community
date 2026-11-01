import Link from "next/link";
import { env } from "@/lib/env";
import { brand } from "@/lib/brand";
import { CodeBlock } from "@/components/CodeBlock";
import example from "@fixtures/demo/layer_stack.spec.json";

export const metadata = { title: "Getting started", description: `Install ${brand.product} and solve your first photonics problem.` };

const L = brand.library;

export default function DocsHome() {
  return (
    <>
      <h1>Getting started</h1>
      <p>
        {brand.product} is an {L.license}-licensed Python library for photonics simulation. One JSON problem spec covers scattering, thin films,
        gratings and metasurfaces, waveguide modes, devices, photonic crystals and circuits, solved on CPU or GPU. Source, issues and roadmap are on{" "}
        <a href={env.githubRepo}>GitHub</a>.
      </p>

      {env.paperUrl && (
        <p>
          For the methods, conventions and the cross-method benchmarks behind them, read the{" "}
          <a href={env.paperUrl}>{brand.product} technical report</a>.
        </p>
      )}

      <h2>Install</h2>
      <CodeBlock code={`${L.install}               # CPU\n${L.installGpu}        # + PyTorch for GPU solvers\n${L.installMcp}        # + MCP server for AI agents`} label="Install with uv" />
      <p>Check which solvers are installed and which GPUs are visible:</p>
      <CodeBlock code={`uv run ${L.cli} doctor\nuv run ${L.cli} backends`} label="Doctor" />

      <h2>Solve a problem</h2>
      <p>
        A problem is a JSON document with a <code>kind</code>. This one is a single-layer anti-reflection coating on glass, at normal and 45°
        incidence:
      </p>
      <CodeBlock code={JSON.stringify(example, null, 2)} label="Example problem" />
      <CodeBlock
        code={`uv run ${L.cli} estimate coating.json          # size and memory, no solve
uv run ${L.cli} solve coating.json -o result.json
uv run ${L.cli} compare coating.json            # cross-check the applicable solvers`}
        label="CLI"
      />
      <p>From Python:</p>
      <CodeBlock
        code={`import json, ${L.module} as ${L.alias}

res = ${L.alias}.solve(json.load(open("coating.json")), method="auto", device="auto")
print(res.kind, res.backend)  # spectrum via a transfer-matrix solver
print(res.warnings)           # read these before trusting numbers`}
        label="Python"
      />

      <h2>Problem kinds and results</h2>
      <table>
        <thead>
          <tr>
            <th>kind</th>
            <th>For</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>scattering</code></td><td>particles and clusters (Mie, T-matrix, DDA, FDTD)</td><td>cross sections, near and far fields</td></tr>
          <tr><td><code>layer_stack</code></td><td>thin films and coatings (transfer matrix)</td><td>R/T/A spectrum</td></tr>
          <tr><td><code>periodic</code></td><td>gratings, metasurfaces, photonic-crystal slabs (RCWA)</td><td>R/T/A spectrum with diffraction orders</td></tr>
          <tr><td><code>mode</code></td><td>waveguide cross-sections (FDE)</td><td>effective indices and mode fields</td></tr>
          <tr><td><code>device</code></td><td>components with ports (FDTD, FDFD, EME)</td><td>S-parameters</td></tr>
          <tr><td><code>bands</code></td><td>photonic crystals (plane-wave expansion)</td><td>band diagram</td></tr>
          <tr><td><code>circuit</code></td><td>netlists of compact models</td><td>S-parameters</td></tr>
          <tr><td><code>optimization</code></td><td>inverse design of devices (coming)</td><td>optimised design and history</td></tr>
        </tbody>
      </table>
      <p>
        <code>solve(problem, method=&quot;auto&quot;)</code> picks the most accurate applicable solver and explains why others were skipped. See the{" "}
        <Link href="/docs/spec">spec reference</Link> for every field.
      </p>

      <h2>Conventions</h2>
      <ul>
        <li>Lengths in nm; wavelengths are vacuum wavelengths.</li>
        <li>Time dependence exp(−iωt): absorbing materials have Im ε &gt; 0 and Im n &gt; 0.</li>
        <li>Scattering cross sections in nm²; efficiencies use the volume-equivalent radius of all particles.</li>
        <li>Spectra are power fractions; S-parameters are complex amplitudes S(out, in).</li>
        <li>Every result carries provenance (backend versions, device, precision, iterations, residuals) and warnings.</li>
      </ul>
    </>
  );
}
