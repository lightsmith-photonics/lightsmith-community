"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/session";
import { asVisibility, canContribute, canEditProject, canViewProject } from "@/lib/roles";
import { uniqueSlug } from "@/lib/slug";
import { validateProblem } from "@/lib/problem/problem";
import { parseResult } from "@/lib/problem/result";
import { parseTags } from "@/lib/projects";
import { deleteStoredResults, deleteUnreferencedResults, saveResult } from "@/lib/results-store";
import { commit, forkProject as forkInto, restoreVersion } from "@/lib/versions/store";
import { notify } from "@/lib/notify";

export type FormState = { ok: boolean; message: string } | null;

const MAX_SPEC = 2_000_000;
const MAX_RESULT = 50_000_000;

const ProjectInput = z.object({
  title: z.string().trim().min(3, "Title needs at least 3 characters").max(120),
  description: z.string().trim().max(500).default(""),
  visibility: z.string().transform(asVisibility),
  tags: z.string().default("").transform(parseTags),
});

/** "owner": settings, deletion and collaborators. "contribute": specs, versions and results (owner and collaborators). */
async function editable(projectId: string, level: "owner" | "contribute" = "contribute") {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id: projectId }, include: { collaborators: { select: { userId: true } } } });
  if (!project || !(level === "owner" ? canEditProject(project, user) : canContribute(project, user))) throw new Error("Not allowed");
  return { user, project };
}

const issuesText = (issues: { path: string; message: string }[]) => issues.map((i) => `${i.path} ${i.message}`).join("; ");
const versionMessage = (fd: FormData, fallback: string) => String(fd.get("message") ?? "").trim().slice(0, 500) || fallback;

export async function createProject(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in first." };
  const parsed = ProjectInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const specText = String(fd.get("spec") ?? "").trim();
  let spec: { json: string; kind: string } | null = null;
  if (specText) {
    if (specText.length > MAX_SPEC) return { ok: false, message: "Spec is larger than 2 MB." };
    const v = validateProblem(specText);
    if (!v.ok) return { ok: false, message: `Spec: ${issuesText(v.issues)}` };
    spec = { json: JSON.stringify(v.problem, null, 2), kind: v.kind };
  }
  const project = await db.project.create({
    data: {
      ...parsed.data,
      slug: uniqueSlug(parsed.data.title),
      ownerId: user.id,
      specs: spec ? { create: { name: String(fd.get("specName") || "spec-1"), ...spec } } : undefined,
    },
  });
  await commit({ projectId: project.id, authorId: user.id, message: "Initial version" });
  redirect(`/p/${project.slug}`);
}

export async function updateProject(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const { project } = await editable(projectId, "owner");
  const parsed = ProjectInput.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  await db.project.update({ where: { id: project.id }, data: { ...parsed.data, notes: String(fd.get("notes") ?? "").slice(0, 100_000) } });
  revalidatePath(`/p/${project.slug}`);
  return { ok: true, message: "Saved." };
}

export async function deleteProject(projectId: string) {
  const { project, user } = await editable(projectId, "owner");
  const [results, versioned, answers] = await Promise.all([
    db.resultRecord.findMany({ where: { projectId: project.id }, select: { storageKey: true } }),
    db.versionResult.findMany({ where: { version: { projectId: project.id } }, select: { storageKey: true } }),
    db.feedbackResponse.findMany({ where: { request: { projectId: project.id }, storageKey: { not: null } }, select: { storageKey: true } }),
  ]);
  await db.project.delete({ where: { id: project.id } });
  await deleteStoredResults([...new Set([...results, ...versioned, ...answers].map((r) => r.storageKey!))]);
  redirect(`/u/${user.username ?? ""}`);
}

/** Every spec change is committed as a new project version. */
export async function saveSpec(projectId: string, specId: string | null, _: FormState, fd: FormData): Promise<FormState> {
  const { project, user } = await editable(projectId);
  const text = String(fd.get("json") ?? "");
  if (text.length > MAX_SPEC) return { ok: false, message: "Spec is larger than 2 MB." };
  const v = validateProblem(text);
  if (!v.ok) return { ok: false, message: issuesText(v.issues) };
  const name = String(fd.get("name") ?? "").trim().slice(0, 80) || "spec";
  const data = { name, kind: v.kind, json: JSON.stringify(v.problem, null, 2) };
  if (specId) await db.spec.updateMany({ where: { id: specId, projectId: project.id }, data });
  else await db.spec.create({ data: { projectId: project.id, ...data } });
  const { version, created } = await commit({ projectId: project.id, authorId: user.id, message: versionMessage(fd, specId ? `Updated ${name}` : `Added ${name}`) });
  revalidatePath(`/p/${project.slug}`, "layout");
  if (!created) return { ok: true, message: `No changes; the project is still at v${version.number}.` };
  return { ok: true, message: `${specId ? "Spec updated" : "Spec added"}: saved as v${version.number}.` };
}

export async function deleteSpec(projectId: string, specId: string) {
  const { project, user } = await editable(projectId);
  const spec = await db.spec.findFirst({ where: { id: specId, projectId: project.id } });
  if (!spec) return;
  await db.spec.delete({ where: { id: spec.id } });
  await commit({ projectId: project.id, authorId: user.id, message: `Deleted ${spec.name}` });
  revalidatePath(`/p/${project.slug}`, "layout");
}

export async function uploadResult(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const { project } = await editable(projectId);
  const file = fd.get("file");
  let text = String(fd.get("json") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_RESULT) return { ok: false, message: "Result is larger than 50 MB." };
    text = await file.text();
  }
  if (!text.trim()) return { ok: false, message: "Choose a result JSON file or paste it." };
  const p = parseResult(text);
  if (!p.ok) return { ok: false, message: `Not a result the platform understands: ${p.error}` };
  const specId = String(fd.get("specId") ?? "") || null;
  if (specId && !(await db.spec.findFirst({ where: { id: specId, projectId: project.id } }))) return { ok: false, message: "Unknown spec." };
  try {
    await saveResult({ projectId: project.id, specId, name: String(fd.get("name") ?? "").trim() || `${p.result.method} ${p.result.kind}`, result: p.result });
  } catch (err) {
    return { ok: false, message: `Could not store the result: ${(err as Error).message}` };
  }
  await db.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
  revalidatePath(`/p/${project.slug}`, "layout");
  return { ok: true, message: "Result added." };
}

export async function deleteResult(projectId: string, resultId: string) {
  const { project } = await editable(projectId);
  const r = await db.resultRecord.findFirst({ where: { id: resultId, projectId: project.id } });
  if (!r) return;
  await db.resultRecord.delete({ where: { id: r.id } });
  // Versions that link the result keep its object.
  await deleteUnreferencedResults([r.storageKey]);
  revalidatePath(`/p/${project.slug}`);
}

export async function toggleStar(projectId: string) {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id: projectId }, include: { collaborators: { select: { userId: true } } } });
  if (!project || !canViewProject(project, user)) return;
  const key = { userId_projectId: { userId: user.id, projectId } };
  if (await db.star.findUnique({ where: key })) {
    await db.star.delete({ where: key });
  } else {
    await db.star.create({ data: { userId: user.id, projectId } });
    await notify({ userId: project.ownerId, actorId: user.id, type: "star", message: `@${user.username} starred “${project.title}”`, url: `/p/${project.slug}` });
  }
  revalidatePath(`/p/${project.slug}`);
}

/** Fork the project as it is now, or one of its versions (`number`), into the signed-in user's account. */
export async function forkProject(projectId: string, number: number | null) {
  const user = await requireUser();
  const src = await db.project.findUnique({ where: { id: projectId }, include: { collaborators: { select: { userId: true } } } });
  if (!src || !canViewProject(src, user)) throw new Error("Not found");
  const out = await forkInto(src.id, number, user);
  if (!out) throw new Error("Not found");
  await notify({ userId: src.ownerId, actorId: user.id, type: "fork", message: `@${user.username} forked “${src.title}” (${out.label})`, url: `/p/${out.fork.slug}` });
  redirect(`/p/${out.fork.slug}`);
}

/** Make an old version current again. The restore is itself a new version; history is never rewritten. */
export async function restoreVersionAction(projectId: string, number: number, _: FormState, fd: FormData): Promise<FormState> {
  const { project, user } = await editable(projectId);
  const { version, created } = await restoreVersion(project.id, number, user.id, versionMessage(fd, `Restored v${number}`));
  revalidatePath(`/p/${project.slug}`, "layout");
  if (!created) return { ok: true, message: `v${number} has the same specs as the current version; nothing to restore.` };
  redirect(`/p/${project.slug}/v/${version.number}`);
}

export async function addCollaborator(projectId: string, _: FormState, fd: FormData): Promise<FormState> {
  const { project, user } = await editable(projectId, "owner");
  const username = String(fd.get("username") ?? "").trim().replace(/^@/, "").toLowerCase();
  const other = username ? await db.user.findUnique({ where: { username } }) : null;
  if (!other) return { ok: false, message: `There is no user @${username}.` };
  if (other.id === project.ownerId) return { ok: false, message: "The owner can already edit this project." };
  await db.projectCollaborator.upsert({
    where: { projectId_userId: { projectId: project.id, userId: other.id } },
    create: { projectId: project.id, userId: other.id },
    update: {},
  });
  await notify({ userId: other.id, actorId: user.id, type: "collaborator", message: `@${user.username} added you as a collaborator on “${project.title}”`, url: `/p/${project.slug}` });
  revalidatePath(`/p/${project.slug}/settings`);
  return { ok: true, message: `@${other.username} can now save specs and create versions.` };
}

export async function removeCollaborator(projectId: string, userId: string) {
  const { project } = await editable(projectId, "owner");
  await db.projectCollaborator.deleteMany({ where: { projectId: project.id, userId } });
  revalidatePath(`/p/${project.slug}/settings`);
}
