export function slugify(input: string, maxLength = 60): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return s || "untitled";
}

/** Short random suffix so slugs stay unique without a lookup loop. */
export function randomSuffix(length = 6): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function uniqueSlug(title: string): string {
  return `${slugify(title, 48)}-${randomSuffix()}`;
}

/** Usernames: 3-30 chars, lower-case letters, digits, '-' and '_'. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;

export function usernameFrom(seed: string): string {
  const base = seed
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 22);
  return base.length >= 3 ? base : `user-${base}`.slice(0, 22);
}
