"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(site)/p/actions";
import { SpecJsonField } from "./SpecEditor";
import { MarkdownEditor } from "@/components/MarkdownEditor";

interface Defaults {
  title?: string;
  description?: string;
  visibility?: string;
  tags?: string;
  notes?: string;
}

export function ProjectForm({
  action,
  defaults = {},
  withSpec = false,
  withNotes = false,
  submitLabel,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  defaults?: Defaults;
  withSpec?: boolean;
  withNotes?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" className="input" required minLength={3} maxLength={120} defaultValue={defaults.title} />
      </div>
      <div>
        <label className="label" htmlFor="description">Short description</label>
        <textarea id="description" name="description" className="input" rows={2} maxLength={500} defaultValue={defaults.description} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="label">Visibility</legend>
          {[
            ["public", "Public — listed and searchable"],
            ["unlisted", "Unlisted — anyone with the link"],
            ["private", "Private — only you"],
          ].map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="visibility" value={v} defaultChecked={(defaults.visibility ?? "public") === v} /> {label}
            </label>
          ))}
        </fieldset>
        <div>
          <label className="label" htmlFor="tags">Tags</label>
          <input id="tags" name="tags" className="input" defaultValue={defaults.tags?.split(",").join(", ")} placeholder="plasmonics, gold, dda" />
          <p className="mt-1 text-xs text-muted">Up to 8, separated by commas.</p>
        </div>
      </div>
      {withNotes && <MarkdownEditor name="notes" label="Notes (Markdown + LaTeX)" defaultValue={defaults.notes} rows={10} />}
      {withSpec && (
        <fieldset className="space-y-2 rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-semibold">First spec (optional)</legend>
          <div>
            <label className="label" htmlFor="specName">Spec name</label>
            <input id="specName" name="specName" className="input" defaultValue="spec-1" />
          </div>
          <SpecJsonField defaultValue="" name="spec" />
        </fieldset>
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
