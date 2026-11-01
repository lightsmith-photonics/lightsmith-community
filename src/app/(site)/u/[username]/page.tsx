import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, displayName } from "@/lib/session";
import { Markdown } from "@/components/Markdown";
import { ProjectCard, projectCardSelect } from "@/components/ProjectCard";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await db.user.findUnique({ where: { username: username.toLowerCase() } });
  if (!user) notFound();
  const viewer = await getCurrentUser();
  const self = viewer?.id === user.id;

  const [projects, threads, posts, submissions] = await Promise.all([
    db.project.findMany({
      where: { ownerId: user.id, ...(self ? {} : { visibility: "public" }) },
      orderBy: { updatedAt: "desc" },
      select: projectCardSelect,
    }),
    db.thread.findMany({
      where: { authorId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { category: true },
    }),
    db.post.count({ where: { authorId: user.id, deletedAt: null } }),
    db.materialSubmission.findMany({ where: { userId: user.id, ...(self ? {} : { status: "approved" }) }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="container-page py-10">
      <header className="flex flex-col gap-2 border-b border-line pb-6">
        <h1 className="text-3xl font-bold">{displayName(user)}</h1>
        <p className="text-muted">
          @{user.username}
          {user.role !== "user" && <span className="badge ml-2">{user.role}</span>}
        </p>
        {user.affiliation && <p>{user.affiliation}</p>}
        {user.orcid && (
          <p className="text-sm">
            ORCID:{" "}
            <a className="link" href={`https://orcid.org/${user.orcid}`} rel="noopener">
              {user.orcid}
            </a>
          </p>
        )}
        {user.bio && <Markdown className="mt-2 max-w-prose text-sm">{user.bio}</Markdown>}
        {self && (
          <Link className="btn mt-2 w-fit" href="/settings/profile">
            Edit profile
          </Link>
        )}
      </header>

      <section className="mt-8" aria-labelledby="projects">
        <h2 id="projects" className="text-xl font-semibold">
          Projects <span className="text-muted">({projects.length})</span>
        </h2>
        {projects.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No public projects yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-3">
            {projects.map((p) => (
              <li key={p.slug}>
                <ProjectCard p={p} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="datasets">
        <h2 id="datasets" className="text-xl font-semibold">
          Material datasets <span className="text-muted">({submissions.length})</span>
        </h2>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No contributed datasets.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {submissions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <Link href={`/materials/${encodeURIComponent(s.material)}`} className="link">
                    {s.material}
                  </Link>{" "}
                  — {s.title}
                </span>
                <span className="badge">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="posts">
        <h2 id="posts" className="text-xl font-semibold">
          Forum <span className="text-muted">({threads.length} threads, {posts} posts)</span>
        </h2>
        <ul className="mt-3 space-y-1 text-sm">
          {threads.map((t) => (
            <li key={t.id}>
              <Link className="link" href={`/forum/t/${t.id}`}>
                {t.title}
              </Link>{" "}
              <span className="text-muted">in {t.category.name}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
