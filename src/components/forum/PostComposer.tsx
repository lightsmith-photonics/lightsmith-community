"use client";

import { useActionState, useEffect, useState } from "react";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import type { ForumState } from "@/app/(site)/forum/actions";

export interface AttachmentOption {
  value: string;
  label: string;
  group: string;
}

export function AttachmentPicker({ options }: { options: AttachmentOption[] }) {
  if (options.length === 0) return null;
  const groups = [...new Set(options.map((o) => o.group))];
  return (
    <div>
      <label className="label" htmlFor="attachment">Attach a spec or result (optional)</label>
      <select id="attachment" name="attachment" className="input">
        <option value="">None</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {options
              .filter((o) => o.group === g)
              .map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
          </optgroup>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted">Only items from public or unlisted projects can be attached.</p>
    </div>
  );
}

export function ReplyForm({ action, attachments }: { action: (s: ForumState, fd: FormData) => Promise<ForumState>; attachments: AttachmentOption[] }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    if (state?.ok) setResetKey((k) => k + 1); // clear the editor after a successful post
  }, [state]);
  return (
    <form action={formAction} className="space-y-3">
      <MarkdownEditor name="body" label="Your reply" required key={resetKey} />
      <AttachmentPicker options={attachments} />
      {state && (
        <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
      )}
      <button className="btn-primary" type="submit" disabled={pending}>{pending ? "Posting…" : "Post reply"}</button>
    </form>
  );
}

export function NewThreadForm({
  action,
  categories,
  defaultCategory,
  attachments,
}: {
  action: (s: ForumState, fd: FormData) => Promise<ForumState>;
  categories: { slug: string; name: string }[];
  defaultCategory?: string;
  attachments: AttachmentOption[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="category">Category</label>
        <select id="category" name="category" className="input" defaultValue={defaultCategory} required>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" className="input" required minLength={8} maxLength={160} placeholder="e.g. DDA extinction of a gold nanorod does not converge" />
      </div>
      <MarkdownEditor name="body" label="Details" required rows={12} />
      <AttachmentPicker options={attachments} />
      {state && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <button className="btn-primary" type="submit" disabled={pending}>{pending ? "Posting…" : "Post thread"}</button>
    </form>
  );
}

export function FlagForm({ action }: { action: (s: ForumState, fd: FormData) => Promise<ForumState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  if (state?.ok) return <p role="status" className="text-xs text-success">{state.message}</p>;
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <input name="reason" aria-label="Reason for the report" className="input !w-64 !py-1 text-xs" placeholder="Why should a moderator look at this?" required minLength={3} />
      <button className="btn !py-1 text-xs" type="submit" disabled={pending}>Send report</button>
      {state && !state.ok && <p role="alert" className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
