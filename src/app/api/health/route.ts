import { db } from "@/lib/db";
import { materialsApi } from "@/lib/materials";
import { computeApi } from "@/lib/compute";
import { storageHealthy } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Readiness: database and object storage reachable, plus which services are mocked. */
export async function GET() {
  let database = false;
  try {
    await db.$queryRaw`SELECT 1`;
    database = true;
  } catch {}
  const storage = await storageHealthy();
  const ok = database && storage;
  return Response.json(
    { ok, database, storage, materials: materialsApi().mode, compute: computeApi().mode },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
