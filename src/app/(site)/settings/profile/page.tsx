import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { USERNAME_RE } from "@/lib/slug";

export const metadata = { title: "Profile settings" };

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

const ProfileInput = z.object({
  username: z.string().trim().toLowerCase().regex(USERNAME_RE, "3–30 lower-case letters, digits, '-' or '_'"),
  name: z.string().trim().max(80),
  affiliation: z.string().trim().max(120),
  orcid: z
    .string()
    .trim()
    .transform((s) => s.replace(/^https?:\/\/orcid\.org\//, ""))
    .refine((s) => s === "" || ORCID_RE.test(s), "ORCID iD looks like 0000-0002-1825-0097"),
  bio: z.string().trim().max(2000),
});

export default async function ProfileSettings({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser("/settings/profile");
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });

  async function save(fd: FormData) {
    "use server";
    const current = await requireUser("/settings/profile");
    const parsed = ProfileInput.safeParse(Object.fromEntries(fd));
    if (!parsed.success) redirect(`/settings/profile?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
    const data = parsed.data;
    const taken = await db.user.findFirst({ where: { username: data.username, NOT: { id: current.id } } });
    if (taken) redirect(`/settings/profile?error=${encodeURIComponent("That username is taken")}`);
    await db.user.update({
      where: { id: current.id },
      data: { ...data, orcid: data.orcid || null, affiliation: data.affiliation || null, bio: data.bio || null },
    });
    revalidatePath("/", "layout");
    redirect("/settings/profile?saved=1");
  }

  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="text-2xl font-bold">Profile</h1>
      {sp.error && (
        <p role="alert" className="mt-4 rounded-md border border-danger p-3 text-sm text-danger">
          {sp.error}
        </p>
      )}
      {sp.saved && (
        <p role="status" className="mt-4 rounded-md border border-success p-3 text-sm text-success">
          Saved.
        </p>
      )}
      <form action={save} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="username">Username</label>
          <input className="input" id="username" name="username" defaultValue={user.username ?? ""} required pattern="[a-z0-9][a-z0-9_\-]{2,29}" aria-describedby="username-help" />
          <p id="username-help" className="mt-1 text-xs text-muted">Used for @mentions and your profile URL.</p>
        </div>
        <div>
          <label className="label" htmlFor="name">Display name</label>
          <input className="input" id="name" name="name" defaultValue={user.name ?? ""} maxLength={80} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="affiliation">Affiliation</label>
          <input className="input" id="affiliation" name="affiliation" defaultValue={user.affiliation ?? ""} maxLength={120} autoComplete="organization" />
        </div>
        <div>
          <label className="label" htmlFor="orcid">ORCID iD</label>
          <input className="input" id="orcid" name="orcid" defaultValue={user.orcid ?? ""} placeholder="0000-0002-1825-0097" />
        </div>
        <div>
          <label className="label" htmlFor="bio">Bio (Markdown)</label>
          <textarea className="input" id="bio" name="bio" rows={5} defaultValue={user.bio ?? ""} maxLength={2000} />
        </div>
        <button className="btn-primary" type="submit">Save profile</button>
      </form>
      <p className="mt-8 text-sm text-muted">Email: {user.email ?? "—"} · Role: {user.role}</p>
    </div>
  );
}
