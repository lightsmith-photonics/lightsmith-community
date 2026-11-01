"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(site)/p/actions";
import { brand } from "@/lib/brand";

export function ResultUpload({ action, specs }: { action: (p: FormState, fd: FormData) => Promise<FormState>; specs: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-3" encType="multipart/form-data">
      <p className="text-sm text-muted">
        Upload the JSON written by <code>{brand.library.cli} solve spec.json -o result.json</code> or <code>res.model_dump_json()</code>: cross sections, spectra, modes, S-parameters or bands.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="r-name">Name</label>
          <input id="r-name" name="name" className="input" placeholder="e.g. DDA 20 dipoles/diameter" />
        </div>
        <div>
          <label className="label" htmlFor="r-spec">Produced from spec</label>
          <select id="r-spec" name="specId" className="input">
            <option value="">—</option>
            {specs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="r-file">Result JSON file</label>
        <input id="r-file" name="file" type="file" accept=".json,application/json" className="text-sm" />
      </div>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Uploading…" : "Add result"}
      </button>
    </form>
  );
}
