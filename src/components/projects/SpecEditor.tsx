"use client";

import { useActionState, useMemo, useState } from "react";
import { KIND_LABELS, summarizeProblem, validateProblem } from "@/lib/problem/problem";
import { EXAMPLE_SPECS } from "./examples";
import type { FormState } from "@/app/(site)/p/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** JSON editor with live validation against the problem schema (any kind). */
export function SpecJsonField({ defaultValue, name = "json", id = "spec-json", onValid }: { defaultValue: string; name?: string; id?: string; onValid?: (ok: boolean) => void }) {
  const [text, setText] = useState(defaultValue);
  const v = useMemo(() => (text.trim() ? validateProblem(text) : null), [text]);
  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-2">
        <label className="label !mb-0" htmlFor={id}>
          Problem JSON
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted">Load example</span>
          <select
            className="input !w-auto !py-0.5 text-xs"
            value=""
            onChange={(e) => {
              const ex = EXAMPLE_SPECS.find((x) => x.id === e.target.value);
              if (ex) {
                setText(JSON.stringify(ex.spec, null, 2));
                onValid?.(true);
              }
            }}
          >
            <option value="">Choose…</option>
            {EXAMPLE_SPECS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        id={id}
        name={name}
        className="input font-mono text-xs"
        rows={14}
        spellCheck={false}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onValid?.(validateProblem(e.target.value).ok);
        }}
        aria-describedby={`${id}-status`}
        aria-invalid={v ? !v.ok : undefined}
      />
      <div id={`${id}-status`} className="mt-1 text-xs" aria-live="polite">
        {!v && <span className="text-muted">Paste a problem of any kind (scattering, layer_stack, periodic, mode, device, bands, circuit, optimization).</span>}
        {v?.ok && (
          <span className="text-success">
            Valid {KIND_LABELS[v.kind].toLowerCase()} problem · {summarizeProblem(v.kind, v.problem)}
          </span>
        )}
        {v && !v.ok && (
          <ul className="list-disc pl-4 text-danger">
            {v.issues.slice(0, 6).map((i, k) => (
              <li key={k}>
                <code>{i.path}</code> {i.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** `withMessage` adds the version message: every save of a project's specs creates a version. */
export function SpecEditor({ action, defaultName = "", defaultJson = "", submitLabel = "Save spec", withMessage = false }: { action: Action; defaultName?: string; defaultJson?: string; submitLabel?: string; withMessage?: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const nameId = useMemo(() => `spec-name-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="label" htmlFor={nameId}>Name</label>
        <input id={nameId} name="name" className="input" defaultValue={defaultName} required maxLength={80} placeholder="e.g. au-sphere-40nm" />
      </div>
      <SpecJsonField defaultValue={defaultJson} id={`${nameId}-json`} />
      {withMessage && (
        <div>
          <label className="label" htmlFor={`${nameId}-message`}>Version message <span className="font-normal text-muted">(optional)</span></label>
          <input id={`${nameId}-message`} name="message" className="input" maxLength={500} placeholder="e.g. thicker MgF₂ layer" />
        </div>
      )}
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
