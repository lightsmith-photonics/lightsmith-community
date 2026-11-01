import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { loadProject } from "@/lib/projects";
import { canEditProject } from "@/lib/roles";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { deleteProject, updateProject } from "../../actions";

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
      <section className="mt-12 rounded-md border border-danger p-4" aria-labelledby="danger">
        <h2 id="danger" className="font-semibold text-danger">Delete project</h2>
        <p className="mt-1 text-sm text-muted">This removes its specs, results and stars. Forks are kept. This cannot be undone.</p>
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
