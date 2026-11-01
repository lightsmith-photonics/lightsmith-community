// "Open in Studio" deep links to apps/studio.
// Small specs travel inline as base64url JSON; larger ones by URL to /api/specs/{id}
// (or, for a spec of a project version, /api/projects/{slug}/versions/{n}/specs/{index}).

export const MAX_INLINE_SPEC_CHARS = 6000;

export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export function studioLink(opts: {
  studioUrl: string;
  siteUrl: string;
  /** live spec row, served at /api/specs/{id} */
  specId?: string;
  /** absolute URL that serves the spec JSON, used instead of specId (version snapshots) */
  specUrl?: string;
  specJson: string;
  name?: string;
  projectUrl?: string;
  /** private specs cannot be fetched by URL, so they always go inline */
  allowUrl: boolean;
}): string {
  const params = new URLSearchParams();
  const compact = JSON.stringify(JSON.parse(opts.specJson));
  const inline = base64UrlEncode(compact);
  if (inline.length <= MAX_INLINE_SPEC_CHARS || !opts.allowUrl) params.set("spec", inline);
  else params.set("spec_url", opts.specUrl ?? `${opts.siteUrl}/api/specs/${opts.specId}`);
  if (opts.name) params.set("name", opts.name);
  if (opts.projectUrl) params.set("project", opts.projectUrl);
  return `${opts.studioUrl}/?${params}`;
}
