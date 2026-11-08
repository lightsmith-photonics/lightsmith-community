import { randomUUID } from "node:crypto";
import { db } from "./db";
import { deleteObject, getJsonText, putJson, resultKey } from "./storage";
import { makePreview, type AnyResult, type ResultPreview } from "./problem/result";

// Result rows hold metadata and a preview; the full JSON lives gzipped in object storage.
// Each new result is also linked to a project version (src/lib/versions), which keeps its own reference;
// feedback requests (src/lib/feedback) reference the result they ask about too.

/** Store a result and link it to `versionId` (a job's version) or, by default, the project's current version. */
export async function saveResult(input: { projectId: string; specId: string | null; name: string; result: AnyResult; versionId?: string | null }) {
  const id = randomUUID();
  const storageKey = resultKey(input.projectId, id);
  const { sizeBytes } = await putJson(storageKey, JSON.stringify(input.result));
  const record = await db.resultRecord.create({
    data: {
      id,
      projectId: input.projectId,
      specId: input.specId,
      name: input.name.slice(0, 120),
      kind: input.result.kind,
      method: input.result.method,
      backend: input.result.backend,
      storageKey,
      sizeBytes,
      preview: JSON.stringify(makePreview(input.result)),
    },
  });
  await linkResult(record, input.versionId);
  return record;
}

async function linkResult(
  record: { id: string; projectId: string; specId: string | null; name: string; kind: string; method: string; backend: string; storageKey: string; sizeBytes: number; preview: string },
  versionId?: string | null,
) {
  const target = versionId ?? (await db.project.findUnique({ where: { id: record.projectId }, select: { currentVersionId: true } }))?.currentVersionId;
  if (!target) return null;
  const spec = record.specId ? await db.spec.findUnique({ where: { id: record.specId }, select: { name: true } }) : null;
  const { id, specId, name, kind, method, backend, storageKey, sizeBytes, preview } = record;
  return db.versionResult.create({ data: { versionId: target, resultId: id, specId, specName: spec?.name ?? null, name, kind, method, backend, storageKey, sizeBytes, preview } });
}

/** Copy a stored result into another project (forks get their own object). */
export async function copyResult(record: { storageKey: string; name: string; kind: string; method: string; backend: string; preview: string }, projectId: string, specId: string | null) {
  const text = await getJsonText(record.storageKey);
  if (text === null) return null;
  const id = randomUUID();
  const storageKey = resultKey(projectId, id);
  const { sizeBytes } = await putJson(storageKey, text);
  return db.resultRecord.create({
    data: { id, projectId, specId, name: record.name, kind: record.kind, method: record.method, backend: record.backend, storageKey, sizeBytes, preview: record.preview },
  });
}

export async function deleteStoredResults(keys: string[]) {
  await Promise.allSettled(keys.map((k) => deleteObject(k)));
}

/** Delete objects that no live result or project version references any more. */
export async function deleteUnreferencedResults(keys: string[]) {
  if (keys.length === 0) return;
  const [live, versioned, asked] = await Promise.all([
    db.resultRecord.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } }),
    db.versionResult.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } }),
    db.feedbackRequest.findMany({ where: { resultKey: { in: keys } }, select: { resultKey: true } }),
  ]);
  const used = new Set([...live, ...versioned].map((r) => r.storageKey).concat(asked.map((f) => f.resultKey!)));
  await deleteStoredResults(keys.filter((k) => !used.has(k)));
}

export function readPreview(preview: string): ResultPreview | null {
  try {
    return JSON.parse(preview) as ResultPreview;
  } catch {
    return null;
  }
}
