import "server-only";
import { db } from "@/lib/db";
import type { AttachmentOption } from "@/components/forum/PostComposer";

/** The user's specs and results from non-private projects, for the attachment picker. */
export async function attachmentOptions(userId: string): Promise<AttachmentOption[]> {
  const projects = await db.project.findMany({
    where: { ownerId: userId, visibility: { not: "private" } },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { title: true, specs: { select: { id: true, name: true } }, results: { select: { id: true, name: true } } },
  });
  return projects.flatMap((p) => [
    ...p.specs.map((s) => ({ value: `spec:${s.id}`, label: `Spec: ${s.name}`, group: p.title })),
    ...p.results.map((r) => ({ value: `result:${r.id}`, label: `Result: ${r.name}`, group: p.title })),
  ]);
}
