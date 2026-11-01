import { CodeBlock } from "@/components/CodeBlock";
import { brand } from "@/lib/brand";

export const metadata = { title: "AI agents and MCP", description: `Drive ${brand.product} from AI agents through its MCP server, CLI or Python API.` };

const L = brand.library;
const MCP_CONFIG = `{
  "mcpServers": {
    "${L.package}": {
      "command": "uvx",
      "args": ["--from", "${L.package}[mcp]", "${L.mcpServer}"]
    }
  }
}`;

export default function AgentsDoc() {
  return (
    <>
      <h1>AI agents and MCP</h1>
      <p>
        Every {brand.product} interface is JSON in and JSON out, and errors say why a solver was skipped and what to change. That makes the suite
        straightforward to drive from an agent, for any problem kind from nanoparticles to photonic chips.
      </p>

      <h2>MCP server</h2>
      <CodeBlock code={`${L.installMcp}\n${L.mcpServer}     # speaks MCP over stdio`} label="Install the MCP server" />
      <p>Register it with any MCP client, for example:</p>
      <CodeBlock code={MCP_CONFIG} label="MCP client configuration" />
      <table>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>get_schema</code></td><td>JSON Schema of every problem kind, so the agent can write valid specs.</td></tr>
          <tr><td><code>list_backends</code></td><td>Installed solvers and backends, with versions and licences.</td></tr>
          <tr><td><code>check_environment</code></td><td>Frameworks and GPUs (same as <code>{L.cli} doctor</code>).</td></tr>
          <tr><td><code>estimate</code></td><td>Grid size, precision and memory — without solving.</td></tr>
          <tr><td><code>solve</code></td><td>Run a problem; returns a result with provenance and warnings.</td></tr>
          <tr><td><code>compare</code></td><td>Cross-check solvers on the same problem.</td></tr>
        </tbody>
      </table>

      <h2>Recommended workflow</h2>
      <ol>
        <li>Fetch the schema and build a problem with the right <code>kind</code> (units nm, vacuum wavelengths).</li>
        <li>
          Call <code>estimate</code> before <code>solve</code> for grid-based solvers (DDA, FDTD, FDFD, FDE, RCWA) to check size and memory.
        </li>
        <li>
          Call <code>solve</code> with <code>method=&quot;auto&quot;</code> unless the user asked for a specific solver.
        </li>
        <li>
          Read <code>warnings</code> and <code>provenance</code> before reporting numbers; use <code>compare</code> when accuracy matters.
        </li>
      </ol>

      <h2>CLI and Python</h2>
      <p>
        Agents without MCP can use the CLI: <code>{L.cli} {"{doctor,backends,schema,estimate,solve,compare}"}</code> prints JSON, and failures print{" "}
        <code>{'{"error", "message"}'}</code> to stderr with exit code 1.
      </p>

      <h2>This site</h2>
      <p>
        Project specs and results are plain JSON at <code>/api/specs/&#123;id&#125;</code> and <code>/api/results/&#123;id&#125;</code> for public and unlisted
        projects, so an agent can fetch a shared problem, solve it locally and compare against the published result.
      </p>
    </>
  );
}
