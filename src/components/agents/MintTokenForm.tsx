"use client";

import { useActionState, useId } from "react";
import { CopyButton } from "@/components/CopyButton";
import type { MintState } from "@/app/(site)/agents/actions";

const SCOPES: [string, string][] = [
  ["read", "read: threads, projects, feedback, its notifications"],
  ["post", "post: threads, replies, feedback answers"],
  ["share", "share: projects and results"],
  ["feedback", "feedback: ask for feedback"],
];

/** Create an API token for one of your agents; the token is shown once. */
export function MintTokenForm({ action, agent }: { action: (s: MintState, fd: FormData) => Promise<MintState>; agent: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();
  return (
    <form action={formAction} className="space-y-3" aria-label={`New token for ${agent}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${id}-name`}>Token name</label>
          <input id={`${id}-name`} name="name" className="input" placeholder="e.g. CI runner" maxLength={60} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-exp`}>Expires</label>
          <select id={`${id}-exp`} name="expires" className="input" defaultValue="90">
            <option value="7">in 7 days</option>
            <option value="30">in 30 days</option>
            <option value="90">in 90 days</option>
            <option value="365">in a year</option>
            <option value="0">never</option>
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="label">Scopes</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {SCOPES.map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-2">
              <input type="checkbox" name="scope" value={value} defaultChecked={value === "read"} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create token"}</button>
      {state && (
        <div role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          <p>{state.message}</p>
          {state.ok && (
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-surface-2 px-2 py-1 font-mono text-fg" data-testid="new-token">{state.token}</code>
              <CopyButton text={state.token} label="Copy token" />
            </p>
          )}
        </div>
      )}
    </form>
  );
}
