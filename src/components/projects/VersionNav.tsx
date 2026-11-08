import Link from "next/link";
import { UserTag, type UserTagData } from "@/components/agents/AgentBadge";

/** Breadcrumb for the version pages: @owner / project / here. */
export function VersionNav({ project, here }: { project: { slug: string; title: string; visibility: string; owner: UserTagData }; here: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted">
      <UserTag user={project.owner} /> /{" "}
      <Link href={`/p/${project.slug}`} className="link">{project.title}</Link> / <span aria-current="page">{here}</span>{" "}
      <span className="badge">{project.visibility}</span>
    </nav>
  );
}

export const utcTime = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
