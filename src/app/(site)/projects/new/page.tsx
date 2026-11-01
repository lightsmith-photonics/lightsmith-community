import { requireUser } from "@/lib/session";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { createProject } from "../../p/actions";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireUser("/projects/new");
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-bold">New project</h1>
      <p className="mt-1 text-muted">A project collects simulation specs, their results and your notes.</p>
      <div className="mt-6">
        <ProjectForm action={createProject} withSpec submitLabel="Create project" />
      </div>
    </div>
  );
}
