// Only the sign-in form puts text from anonymous visitors into a nodemailer recipient. The installed
// nodemailer has open advisories in its address parser (quadratic time, comments and groups read as
// other recipients), and Auth.js's default check lets commas, parentheses, semicolons and any length
// through in the local part. So sign-in accepts plain addresses only: nothing the parser could read
// as a comment, a group or a second recipient, and no more than the 254 characters an address can have.

const PLAIN_ADDRESS = /^[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+$/u;

export function isPlainEmail(raw: unknown): boolean {
  try {
    normaliseSignInEmail(raw);
    return true;
  } catch {
    return false;
  }
}

export function normaliseSignInEmail(raw: unknown): string {
  // NFKC first: a look-alike of "@" must become a real one and then fail the check.
  const email = String(raw ?? "").normalize("NFKC").toLowerCase().trim();
  if (email.length > 254 || !PLAIN_ADDRESS.test(email)) throw new Error("Invalid email address format.");
  return email;
}
