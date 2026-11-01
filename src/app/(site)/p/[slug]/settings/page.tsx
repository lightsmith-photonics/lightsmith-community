import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { loadProject } from "@/lib/projects";
import { canEditProject } from "@/lib/roles";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { CollaboratorForm } from "@/components/projects/VersionForms";
import { addCollaborator, deleteProject, removeCollaborator, updateProject } from "../../actions";

export const metadata = { title: "Project settings" };

export default async function ProjectSettings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser(`/p/${slug}/settings`);
  const p = await loadProject(slug, me);
  if (!p || !canEditProject(p, me)) notFound();
  return (
    <div className="container-page max-w-3xl py-10">
      <p className="text-sm">
        <Link className="link" href={`/p/${p.slug}`}>← Back to project</Link>
      </p>
      <h1 className="mt-2 text-3xl font-bold">Settings</h1>
      <div className="mt-6">
        <ProjectForm
          action={updateProject.bind(null, p.id)}
          defaults={{ title: p.title, description: p.description, visibility: p.visibility, tags: p.tags, notes: p.notes }}
          withNotes
          submitLabel="Save changes"
        />
      </div>
      <section className="mt-12" aria-labelledby="collaborators">
        <h2 id="collaborators" className="text-xl font-semibold">Collaborators</h2>
        <p className="mt-1 text-sm text-muted">
          Collaborators can edit specs (each save is a new version), restore versions, run specs and upload results. They can see the project when it is private.
          Only you can change these settings.
        </p>
        {p.collaborators.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line">
            {p.collaborators.map((c) => (
              <li key={c.userId} className="flex items-center justify-between gap-2 px-3 py-2">
                <Link className="link" href={`/u/${c.user.username}`}>@{c.user.username}</Link>
                <form action={removeCollaborator.bind(null, p.id, c.userId)}>
                  <button className="btn" type="submit" aria-label={`Remove @${c.user.username}`}>Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <CollaboratorForm action={addCollaborator.bind(null, p.id)} />
        </div>
      </section>

      <section className="mt-12 rounded-md border border-danger p-4" aria-labelledby="danger">
        <h2 id="danger" className="font-semibold text-danger">Delete project</h2>
        <p className="mt-1 text-sm text-muted">This removes its specs, versions, results and stars. Forks are kept. This cannot be undone.</p>
        <form action={deleteProject.bind(null, p.id)} className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="confirm">
            Type <code>{p.slug}</code> to confirm
          </label>
          <input id="confirm" required pattern={p.slug.replace(/[-]/g, "\\-")} className="input !w-64" autoComplete="off" />
          <button className="btn-danger" type="submit">Delete project</button>
        </form>
      </section>
    </div>
  );
}
