"use client";

import { useActionState, useId } from "react";
import type { FormState } from "@/app/(site)/p/actions";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** Restore an old version as a new one, with an optional message. */
export function RestoreForm({ action, number }: { action: Action; number: number }) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <label className="label" htmlFor={`${id}-msg`}>Restore message <span className="font-normal text-muted">(optional)</span></label>
        <input id={`${id}-msg`} name="message" className="input" maxLength={500} placeholder={`Restored v${number}`} />
      </div>
      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "Restoring…" : `Restore v${number} as a new version`}
      </button>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`w-full text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

/** Add a collaborator by username (project settings). */
export function CollaboratorForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  const id = useId();
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <label className="label" htmlFor={`${id}-user`}>Username</label>
        <input id={`${id}-user`} name="username" className="input" required maxLength={31} placeholder="e.g. maxwell" autoComplete="off" />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add collaborator"}
      </button>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`w-full text-sm ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
