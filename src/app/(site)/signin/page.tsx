import { isPlainEmail } from "@/lib/email";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, enabledProviders } from "@/auth";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

function safeCallback(url: string | undefined): string {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

const ERRORS: Record<string, string> = {
  Verification: "The sign-in link is invalid or has expired. Request a new one.",
  OAuthAccountNotLinked: "This email is already linked to another sign-in method. Use that method.",
  Configuration: "Sign-in is not configured correctly on this server.",
  EmailSignin: "We could not send the sign-in email. Try again in a moment.",
  TooManyEmails: "Too many sign-in emails were requested. Links you already received work for 24 hours; otherwise, try again within the hour.",
  InvalidEmail: "That does not look like an email address. Enter a plain address, such as ada@example.org.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const sp = await searchParams;
  const callbackUrl = safeCallback(sp.callbackUrl);
  if (await getCurrentUser()) redirect(callbackUrl);
  const providers = enabledProviders();

  async function withProvider(provider: string, formData?: FormData) {
    "use server";
    if (provider === "nodemailer" && !isPlainEmail(formData?.get("email"))) redirect(`/signin?error=InvalidEmail&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    try {
      await signIn(provider, formData ? { ...Object.fromEntries(formData), redirectTo: callbackUrl } : { redirectTo: callbackUrl });
    } catch (err) {
      if (err instanceof AuthError) redirect(`/signin?error=${err.type}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
      throw err;
    }
  }

  const error = sp.error ? (ERRORS[sp.error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <div className="container-page max-w-md py-12">
      <h1 className="text-2xl font-bold">Sign in or create an account</h1>
      <p className="mt-2 text-sm text-muted">New here? Signing in for the first time creates your account.</p>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-danger p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-6 space-y-6">
        {providers.github && (
          <form action={withProvider.bind(null, "github", undefined)}>
            <button className="btn w-full !py-2" type="submit">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" />
              </svg>
              Continue with GitHub
            </button>
          </form>
        )}
        {providers.email && (
          <form
            action={async (fd: FormData) => {
              "use server";
              await withProvider("nodemailer", fd);
            }}
            className="space-y-2"
          >
            <label htmlFor="email" className="label">
              Email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@university.edu" />
            <button className="btn-primary w-full !py-2" type="submit">
              Email me a sign-in link
            </button>
            {providers.emailIsConsole && (
              <p className="text-xs text-muted">Development: no SMTP server is configured, so the link is printed in the server log.</p>
            )}
          </form>
        )}
        {!providers.github && !providers.email && (
          <p className="rounded-md border border-line p-3 text-sm">
            No sign-in method is configured. Set <code>AUTH_GITHUB_ID</code>/<code>AUTH_GITHUB_SECRET</code> or <code>EMAIL_SERVER</code> (see{" "}
            <code>.env.example</code>).
          </p>
        )}
      </div>
    </div>
  );
}
