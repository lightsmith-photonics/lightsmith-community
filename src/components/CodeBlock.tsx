import { CopyButton } from "./CopyButton";

export function CodeBlock({ code, label, lang }: { code: string; label?: string; lang?: string }) {
  return (
    <div className="relative">
      <pre tabIndex={0} className="overflow-x-auto rounded-md border border-line bg-surface-2 p-3 pr-16 text-sm" aria-label={label} data-lang={lang}>
        <code>{code}</code>
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={code} />
      </div>
    </div>
  );
}
