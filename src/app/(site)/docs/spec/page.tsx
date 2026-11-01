import schema from "@fixtures/problem-schema.json";
import { KIND_LABELS, SCHEMA_VERSION, isProblemKind } from "@/lib/problem/problem";
import { brand } from "@/lib/brand";

export const metadata = { title: "Problem spec reference", description: `Every field of the ${brand.product} problem JSON schema, for all problem kinds.` };

type Prop = { type?: string; description?: string; default?: unknown; $ref?: string; anyOf?: Prop[]; oneOf?: Prop[]; items?: Prop; const?: unknown; minimum?: number; exclusiveMinimum?: number; prefixItems?: Prop[] };
type Def = { title?: string; description?: string; properties?: Record<string, Prop>; required?: string[] };
type Envelope = { properties: { problem: { discriminator: { mapping: Record<string, string> } } }; $defs: Record<string, Def> };

function typeOf(p: Prop): string {
  if (p.const !== undefined) return JSON.stringify(p.const);
  if (p.$ref) return p.$ref.split("/").pop()!;
  if (p.anyOf) return p.anyOf.map(typeOf).join(" | ");
  if (p.oneOf) return p.oneOf.map(typeOf).join(" | ");
  if (p.prefixItems) return `[${p.prefixItems.map(typeOf).join(", ")}]`;
  if (p.type === "array") return `${p.items ? typeOf(p.items) : "any"}[]`;
  return p.type ?? "any";
}

function PropTable({ def }: { def: Def }) {
  const props = Object.entries(def.properties ?? {});
  if (props.length === 0) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Type</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {props.map(([name, p]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
              {def.required?.includes(name) && <span title="required"> *</span>}
            </td>
            <td>
              <code>{typeOf(p)}</code>
            </td>
            <td>
              {p.description}
              {p.default !== undefined && p.default !== null && p.const === undefined && <> Default {JSON.stringify(p.default)}.</>}
              {p.exclusiveMinimum !== undefined && <> &gt; {p.exclusiveMinimum}.</>}
              {p.minimum !== undefined && <> ≥ {p.minimum}.</>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SpecReference() {
  const s = schema as unknown as Envelope;
  const mapping = Object.entries(s.properties.problem.discriminator.mapping);
  const problemDefs = new Set(mapping.map(([, ref]) => ref.split("/").pop()!));
  const shared = Object.entries(s.$defs).filter(([name]) => !problemDefs.has(name));
  return (
    <>
      <h1>Problem spec reference</h1>
      <p>
        Generated from the library&apos;s <code>{brand.library.cli} schema</code> output (scattering schema version {SCHEMA_VERSION}). Every problem
        has a <code>kind</code>; a spec without one is a scattering problem. Fields marked * are required. Specs saved on this site are validated
        against the same schema.
      </p>
      <nav aria-label="Problem kinds">
        <ul>
          {mapping.map(([kind, ref]) => (
            <li key={kind}>
              <a href={`#${ref.split("/").pop()}`}>
                <code>{kind}</code>
              </a>{" "}
              — {isProblemKind(kind) ? KIND_LABELS[kind] : kind}
            </li>
          ))}
        </ul>
      </nav>
      <h2>Problem kinds</h2>
      {mapping.map(([kind, ref]) => {
        const name = ref.split("/").pop()!;
        const def = s.$defs[name];
        return (
          <section key={kind}>
            <h3 id={name}>
              <code>{kind}</code> ({name})
            </h3>
            {def?.description && <p>{def.description}</p>}
            {def && <PropTable def={def} />}
          </section>
        );
      })}
      <h2>Shared definitions</h2>
      {shared.map(([name, def]) => (
        <section key={name}>
          <h3 id={name}>{name}</h3>
          {def.description && <p>{def.description}</p>}
          <PropTable def={def} />
        </section>
      ))}
    </>
  );
}
