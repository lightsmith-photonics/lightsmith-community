import { createHash } from "node:crypto";
import { envInt, type Rule } from "./agents/limits";

// Anyone can ask for a sign-in email to any address. Without limits, the form could flood a stranger's
// inbox and spend the reputation of the mail account. So links are counted per mailbox (an inbox cannot be
// flooded, wherever the requests come from), per network, and for the whole site (many networks together
// are still capped). Override with LIMIT_SIGNIN_MAIL_*.

export const signInMailLimits = () => ({
  addressPerHour: envInt("LIMIT_SIGNIN_MAIL_PER_ADDRESS_PER_HOUR", 5),
  addressPerDay: envInt("LIMIT_SIGNIN_MAIL_PER_ADDRESS_PER_DAY", 15),
  ipPerHour: envInt("LIMIT_SIGNIN_MAIL_PER_IP_PER_HOUR", 30),
  sitePerHour: envInt("LIMIT_SIGNIN_MAIL_PER_HOUR", 300),
});

/** One inbox: "+tag" addresses arrive in the same place. Hashed, so the counters hold no addresses. */
function mailboxKey(email: string): string {
  const [local, domain] = email.toLowerCase().split("@");
  return createHash("sha256").update(`${local.split("+")[0]}@${domain}`).digest("hex");
}

export function signInMailRules(email: string, ip: string): Rule[] {
  const limits = signInMailLimits();
  const box = mailboxKey(email);
  const rule = (key: string, limit: number, window: Rule["window"], who: string): Rule => ({ key: `signin-mail:${key}`, limit, window, subject: "agent", who });
  return [
    rule(`address:${box}:hour`, limits.addressPerHour, "hour", "this address"),
    rule(`address:${box}:day`, limits.addressPerDay, "day", "this address"),
    rule(`ip:${ip}:hour`, limits.ipPerHour, "hour", "this network"),
    rule("site:hour", limits.sitePerHour, "hour", "the whole site"),
  ];
}
