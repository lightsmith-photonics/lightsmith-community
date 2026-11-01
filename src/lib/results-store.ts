import { randomUUID } from "node:crypto";
import { db } from "./db";
import { deleteObject, getJsonText, putJson, resultKey } from "./storage";
import { makePreview, type AnyResult, type ResultPreview } from "./problem/result";

// Result rows hold metadata and a preview; the full JSON lives gzipped in object storage.

export async function saveResult(input: { projectId: string; specId: string | null; name: string; result: AnyResult }) {
  const id = randomUUID();
  const storageKey = resultKey(input.projectId, id);
  const { sizeBytes } = await putJson(storageKey, JSON.stringify(input.result));
  return db.resultRecord.create({
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

export function readPreview(preview: string): ResultPreview | null {
  try {
    return JSON.parse(preview) as ResultPreview;
  } catch {
    return null;
  }
}
