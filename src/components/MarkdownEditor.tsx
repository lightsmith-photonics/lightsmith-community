"use client";

import { useId, useState } from "react";
import { Markdown } from "./Markdown";

/** Textarea with Write/Preview tabs. Submits as a normal form field named `name`. */
export function MarkdownEditor({
  name,
  label,
  defaultValue = "",
  required = false,
  rows = 8,
  placeholder = "Markdown supported: **bold**, `code`, ```python blocks```, $E = mc^2$, $$\\sigma_{ext}$$, @mentions",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-end justify-between">
        <label htmlFor={id} className="label !mb-0">
          {label}
        </label>
        <div role="tablist" aria-label={`${label} mode`} className="flex gap-1 text-xs">
          <button type="button" role="tab" aria-selected={!preview} className={`rounded px-2 py-1 ${!preview ? "bg-surface-2 font-semibold" : "text-muted"}`} onClick={() => setPreview(false)}>
            Write
          </button>
          <button type="button" role="tab" aria-selected={preview} className={`rounded px-2 py-1 ${preview ? "bg-surface-2 font-semibold" : "text-muted"}`} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
      </div>
      <textarea
        id={id}
        name={name}
        className={`input font-mono ${preview ? "hidden" : ""}`}
        rows={rows}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
      {preview && (
        <div className="min-h-32 rounded-md border border-line bg-bg p-3" aria-live="polite">
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted">Nothing to preview.</p>}
        </div>
      )}
    </div>
  );
}
