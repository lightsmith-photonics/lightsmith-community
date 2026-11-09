import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { headers } from "next/headers";
import { consume } from "@/lib/agents/rate";
import { ApiError } from "@/lib/api/errors";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { normaliseSignInEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { signInMailRules } from "@/lib/signin-limits";
import { randomSuffix, usernameFrom } from "@/lib/slug";

// Providers are switched on by env vars only; none is hard-coded. Sessions live in Postgres.
function providers(): Provider[] {
  const list: Provider[] = [];
  if (env.github) list.push(GitHub({ clientId: env.github.id, clientSecret: env.github.secret }));
  if (env.emailServer) {
    list.push(Nodemailer({ server: env.emailServer, from: env.emailFrom, normalizeIdentifier: normaliseSignInEmail }));
  } else if (env.emailToConsole) {
    list.push(
      Nodemailer({
        server: "smtp://localhost:25",
        from: env.emailFrom,
        normalizeIdentifier: normaliseSignInEmail,
        async sendVerificationRequest({ identifier, url }) {
          console.info(`\n[auth] magic link for ${identifier}:\n${url}\n`);
        },
      }),
    );
  }
  return list;
}

export function enabledProviders() {
  return { github: Boolean(env.github), email: Boolean(env.emailServer) || env.emailToConsole, emailIsConsole: env.emailToConsole };
}

async function availableUsername(seed: string): Promise<string> {
  const base = usernameFrom(seed);
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${randomSuffix(4)}`;
    if (!(await db.user.findUnique({ where: { username: candidate } }))) return candidate;
  }
  return `user-${randomSuffix(10)}`;
}

/** False once this address, this network or the whole site has asked for too many sign-in emails. */
async function maySendSignInLink(email: string): Promise<boolean> {
  try {
    await consume(signInMailRules(email, clientIp({ headers: await headers() })));
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) return false;
    throw err;
  }
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  providers: providers(),
  trustHost: true,
  pages: { signIn: "/signin", verifyRequest: "/signin/check-email", error: "/signin" },
  callbacks: {
    // Runs before a token or an email exists, for the sign-in form and for a direct POST alike.
    async signIn({ user, email }) {
      if (!email?.verificationRequest) return true;
      return (await maySendSignInLink(user.email ?? "")) || "/signin?error=TooManyEmails";
    },
    // With database sessions Auth.js passes the whole session row (including sessionToken) and user
    // here; return only public fields so /api/auth/session never exposes the token to scripts.
    session({ session, user }) {
      return { expires: session.expires, user: { id: user.id, name: user.name, email: user.email, image: user.image } } as typeof session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      const existing = await db.user.findUnique({ where: { id: user.id } });
      if (!existing || existing.username) return;
      const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      const username = await availableUsername(user.email ?? user.name ?? "user");
      const role = user.email && adminEmails.includes(user.email.toLowerCase()) ? "admin" : existing.role;
      await db.user.update({ where: { id: user.id }, data: { username, role } });
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
