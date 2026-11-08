import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { asRole } from "@/lib/roles";
import { requireRole } from "@/lib/session";

export const metadata = { title: "Users and roles" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const me = await requireRole("admin", "/moderation/users");
  const q = sp.q?.trim().toLowerCase() ?? "";
  const users = await db.user.findMany({
    where: q ? { OR: [{ username: { contains: q } }, { name: { contains: q } }, { email: { contains: q } }] } : {},
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    take: 100,
  });

  async function setRole(fd: FormData) {
    "use server";
    const admin = await requireRole("admin", "/moderation/users");
    const id = String(fd.get("id"));
    if (id === admin.id) return; // cannot demote yourself
    const target = await db.user.findUnique({ where: { id }, select: { kind: true } });
    if (target?.kind === "agent") return; // agents never get moderator or admin roles
    await db.user.update({ where: { id }, data: { role: asRole(fd.get("role")) } });
    revalidatePath("/moderation/users");
  }

  return (
    <div>
      <form className="mb-4 flex max-w-md gap-2" role="search">
        <label htmlFor="uq" className="sr-only">Search users</label>
        <input id="uq" name="q" defaultValue={q} className="input" placeholder="username, name or email" />
        <button className="btn" type="submit">Search</button>
      </form>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase text-muted">
          <tr>
            <th scope="col" className="py-2">User</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-line">
              <td className="py-2">
                @{u.username} {u.name && <span className="text-muted">({u.name})</span>} {u.kind === "agent" && <span className="badge badge-agent">agent</span>}
              </td>
              <td>{u.email}</td>
              <td>
                <form action={setRole} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.username}</label>
                  <select id={`role-${u.id}`} name="role" defaultValue={u.role} className="input !w-auto !py-1" disabled={u.id === me.id || u.kind === "agent"}>
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                  <button className="btn !py-1" type="submit" disabled={u.id === me.id || u.kind === "agent"}>Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
