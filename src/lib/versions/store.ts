import type { Prisma, ProjectVersion } from "@prisma/client";
import { db } from "../db";
import { copyResult, deleteStoredResults } from "../results-store";
import { uniqueSlug } from "../slug";
import { carriedResults, findSpec, parseSnapshot, snapshotFromSpecs, specJson, type SpecSnapshot } from "./snapshot";
import { jsonEqual } from "./diff";

// Project versions: every change to a project's specs commits an immutable snapshot of all of them.
// Results are linked to the version whose specs produced them and carried to later versions while
// their spec stays the same. Callers check permissions (src/lib/roles.ts) first.

type Tx = Prisma.TransactionClient;

const versionResultsSelect = { resultId: true, specId: true, specName: true, name: true, kind: true, method: true, backend: true, storageKey: true, sizeBytes: true, preview: true } as const;
type StoredResult = Prisma.VersionResultGetPayload<{ select: typeof versionResultsSelect }>;

export type CommitOutcome = { version: ProjectVersion; created: boolean };

const TX = { timeout: 30_000 };

/** Serialise spec changes and version numbers per project (row lock until the transaction ends). */
async function lockProject(tx: Tx, projectId: string) {
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
}

/**
 * Snapshot the project's live specs as the next version and make it current. Results of the previous
 * version (and of `extraSources`, e.g. the version being restored) whose spec is unchanged are linked
 * to it. Saving specs identical to the current version creates nothing.
 */
export async function commitVersion(
  tx: Tx,
  input: { projectId: string; authorId: string | null; message: string; restoredFrom?: number | null; extraSources?: { snapshot: SpecSnapshot[]; results: StoredResult[] }[]; force?: boolean },
): Promise<CommitOutcome> {
  await lockProject(tx, input.projectId);
  const specs = await tx.spec.findMany({ where: { projectId: input.projectId }, orderBy: { createdAt: "asc" } });
  const snapshot = snapshotFromSpecs(specs);
  const project = await tx.project.findUniqueOrThrow({
    where: { id: input.projectId },
    include: { currentVersion: { include: { results: { select: versionResultsSelect } } } },
  });
  const current = project.currentVersion;
  const currentSnapshot = current ? parseSnapshot(current.specs) : null;
  if (current && currentSnapshot && !input.force && jsonEqual(currentSnapshot, snapshot)) return { version: current, created: false };

  const last = await tx.projectVersion.aggregate({ where: { projectId: input.projectId }, _max: { number: true } });
  const sources = [...(current && currentSnapshot ? [{ snapshot: currentSnapshot, results: current.results }] : []), ...(input.extraSources ?? [])];
  const carried = carriedResults(snapshot, sources);
  const version = await tx.projectVersion.create({
    data: {
      projectId: input.projectId,
      number: (last._max.number ?? 0) + 1,
      authorId: input.authorId,
      message: input.message.trim().slice(0, 500),
      specs: snapshot as unknown as Prisma.InputJsonValue,
      restoredFrom: input.restoredFrom ?? null,
      results: {
        create: carried.map(({ nextSpec, ...r }) => ({ ...r, specId: nextSpec?.id ?? null, specName: nextSpec?.name ?? null })),
      },
    },
  });
  await tx.project.update({ where: { id: input.projectId }, data: { currentVersionId: version.id, updatedAt: new Date() } });
  return { version, created: true };
}

export function commit(input: Parameters<typeof commitVersion>[1]) {
  return db.$transaction((tx) => commitVersion(tx, input), TX);
}

/**
 * Make the live specs equal to `specs`. Rows are reused by id, then by name, so jobs, forum
 * attachments and results keep pointing at the same spec; live specs not in the list are deleted.
 */
export async function replaceSpecs(tx: Tx, projectId: string, specs: { id?: string | null; name: string; kind: string; problem: Record<string, unknown> }[]) {
  const live = await tx.spec.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
  const keep = new Set<string>();
  for (const s of specs) {
    const free = live.filter((l) => !keep.has(l.id));
    const row = (s.id ? free.find((l) => l.id === s.id) : undefined) ?? free.find((l) => l.name === s.name);
    const data = { name: s.name, kind: s.kind, json: JSON.stringify(s.problem, null, 2) };
    if (row) {
      keep.add(row.id);
      await tx.spec.update({ where: { id: row.id }, data });
    } else {
      keep.add((await tx.spec.create({ data: { projectId, ...data } })).id);
    }
  }
  await tx.spec.deleteMany({ where: { projectId, id: { notIn: [...keep] } } });
}

/** Replace the live specs with a version's snapshot and commit that as a new version. */
export async function restoreVersion(projectId: string, number: number, authorId: string, message: string): Promise<CommitOutcome> {
  return db.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    const target = await tx.projectVersion.findUniqueOrThrow({ where: { projectId_number: { projectId, number } }, include: { results: { select: versionResultsSelect } } });
    const snapshot = parseSnapshot(target.specs);
    await replaceSpecs(tx, projectId, snapshot);
    return commitVersion(tx, { projectId, authorId, message: message || `Restored v${number}`, restoredFrom: number, extraSources: [{ snapshot, results: target.results }] });
  }, TX);
}

/** Save a whole spec set (the versions API): replace the live specs and commit, unless `base` is stale. */
export async function saveSpecs(
  projectId: string,
  specs: { id?: string | null; name: string; kind: string; problem: Record<string, unknown> }[],
  authorId: string,
  message: string,
  base: number | null,
): Promise<CommitOutcome | { conflict: number }> {
  return db.$transaction(async (tx) => {
    await lockProject(tx, projectId);
    if (base !== null) {
      const current = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { currentVersion: { select: { number: true } } } });
      const now = current.currentVersion?.number ?? 0;
      if (now !== base) return { conflict: now };
    }
    await replaceSpecs(tx, projectId, specs);
    return commitVersion(tx, { projectId, authorId, message });
  }, TX);
}

/**
 * Fork a project into the user's account. With a version number the fork starts from that version's
 * specs and results; without one, from the live specs and all live results (as forks always did).
 */
export async function forkProject(sourceId: string, number: number | null, user: { id: string }) {
  const src = await db.project.findUniqueOrThrow({
    where: { id: sourceId },
    include: { owner: { select: { username: true } }, results: true, currentVersion: { select: { id: true, number: true } } },
  });
  const version = number
    ? await db.projectVersion.findUnique({ where: { projectId_number: { projectId: src.id, number } }, include: { results: { select: versionResultsSelect } } })
    : null;
  if (number && !version) return null;
  const live = number ? null : await db.spec.findMany({ where: { projectId: src.id }, orderBy: { createdAt: "asc" } });
  const snapshot = version ? parseSnapshot(version.specs) : snapshotFromSpecs(live!);
  const fromVersion = version ?? src.currentVersion;

  const fork = await db.project.create({
    data: {
      slug: uniqueSlug(src.title),
      title: src.title,
      description: src.description,
      notes: src.notes,
      tags: src.tags,
      visibility: src.visibility === "private" ? "private" : "public",
      ownerId: user.id,
      forkedFromId: src.id,
      forkedFromVersionId: fromVersion?.id ?? null,
    },
  });
  const results: StoredResult[] = [];
  const label = `@${src.owner.username}/${src.slug}${fromVersion ? ` v${fromVersion.number}` : ""}`;
  try {
    const specIds = new Map<SpecSnapshot, string>();
    for (const s of snapshot) specIds.set(s, (await db.spec.create({ data: { projectId: fork.id, name: s.name, kind: s.kind, json: specJson(s) } })).id);
    const toCopy = version ? version.results : src.results.map((r) => ({ ...r, specName: null }));
    for (const r of toCopy) {
      const spec = r.specId || r.specName ? findSpec(snapshot, r) : null;
      if ((r.specId || r.specName) && !spec && version) continue;
      const specId = spec ? specIds.get(spec)! : null;
      const copy = await copyResult(r, fork.id, specId);
      if (!copy) continue;
      const { id, name, kind, method, backend, storageKey, sizeBytes, preview } = copy;
      results.push({ resultId: id, specId, specName: spec?.name ?? null, name, kind, method, backend, storageKey, sizeBytes, preview });
    }
    const forkSnapshot = snapshotFromSpecs(snapshot.map((s) => ({ id: specIds.get(s)!, name: s.name, kind: s.kind, json: specJson(s) })));
    await commit({ projectId: fork.id, authorId: user.id, message: `Forked from ${label}`, extraSources: [{ snapshot: forkSnapshot, results }] });
  } catch (err) {
    // No half-made forks: drop the project and the objects copied so far.
    await db.project.delete({ where: { id: fork.id } }).catch(() => undefined);
    await deleteStoredResults(results.map((r) => r.storageKey));
    throw err;
  }
  return { fork, label };
}
