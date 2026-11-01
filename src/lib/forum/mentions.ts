/**
 * @username mentions in Markdown, ignoring code spans, fenced code blocks, math and e-mail
 * addresses. Returns unique lower-case usernames in order of appearance.
 */
export function extractMentions(markdown: string): string[] {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ");
  const out: string[] = [];
  const re = /(^|[^A-Za-z0-9_.@/-])@([A-Za-z0-9][A-Za-z0-9_-]{2,29})\b/g;
  for (const m of stripped.matchAll(re)) {
    const name = m[2].toLowerCase();
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** Turn @username into Markdown links to profiles (outside code), for rendering. */
export function linkMentions(markdown: string, known: Set<string>): string {
  const parts = markdown.split(/(```[\s\S]*?```|`[^`\n]*`|\$\$[\s\S]*?\$\$|\$[^$\n]*\$)/g);
  return parts
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/(^|[^A-Za-z0-9_.@/\[-])@([A-Za-z0-9][A-Za-z0-9_-]{2,29})\b/g, (all, pre: string, name: string) =>
            known.has(name.toLowerCase()) ? `${pre}[@${name}](/u/${name.toLowerCase()})` : all,
          ),
    )
    .join("");
}
