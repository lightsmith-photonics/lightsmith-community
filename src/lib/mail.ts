import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

// Transactional email outside Auth.js (agent claim confirmations). Same SMTP settings as the magic
// links: EMAIL_SERVER (Mailpit locally). Without SMTP outside production, messages go to the log.

let transport: Transporter | null = null;

export async function sendMail(msg: { to: string; subject: string; text: string; html?: string }) {
  if (env.emailServer) {
    transport ??= nodemailer.createTransport(env.emailServer);
    await transport.sendMail({ from: env.emailFrom, ...msg });
    return;
  }
  if (env.emailToConsole) {
    console.info(`\n[mail] to ${msg.to}: ${msg.subject}\n${msg.text}\n`);
    return;
  }
  throw new Error("Email is not configured (EMAIL_SERVER)");
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain message with one call-to-action link, as text and minimal HTML. */
export function linkEmail(opts: { intro: string[]; linkLabel: string; url: string; outro: string[] }) {
  const text = [...opts.intro, "", `${opts.linkLabel}: ${opts.url}`, "", ...opts.outro].join("\n");
  const p = (s: string) => `<p>${escapeHtml(s)}</p>`;
  const html = `${opts.intro.map(p).join("")}<p><a href="${escapeHtml(opts.url)}">${escapeHtml(opts.linkLabel)}</a></p>${opts.outro.map(p).join("")}`;
  return { text, html };
}
