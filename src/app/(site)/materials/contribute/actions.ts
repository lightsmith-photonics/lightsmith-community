"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { materialsApi } from "@/lib/materials";
import { parseNkTable } from "@/lib/materials/formats";
import { issuePlatformJwt } from "@/lib/platform-jwt";
import { notify } from "@/lib/notify";

export type SubmitState = { ok: boolean; message: string; id?: string } | null;

const Input = z.object({
  material_id: z.string().trim().max(40),
  material_name: z.string().trim().min(1, "Material name is required").max(80),
  category: z.string().regex(/^[a-z0-9_]{1,32}$/, "Choose a category"),
  dataset_name: z.string().trim().min(2, "Dataset name is required").max(80),
  reference: z.string().trim().min(10, "Give the full reference (authors, title, journal, year)").max(1000),
  doi: z
    .string()
    .trim()
    .transform((s) => s.replace(/^https?:\/\/(dx\.)?doi\.org\//, ""))
    .refine((s) => s === "" || /^10\.\d{4,9}\/\S+$/.test(s), "DOI should look like 10.1103/PhysRevB.6.4370"),
  // Licences the materials service accepts for contributions (GET /v1/licenses).
  license: z.enum(["CC0-1.0", "CC-BY-4.0", "PDDL-1.0"]),
  comments: z.string().trim().max(2000),
  unit: z.enum(["nm", "um", "ev"]),
  data: z.string().min(1, "Paste or upload the n, k table"),
  rights: z.literal("on", { errorMap: () => ({ message: "Confirm that you may share this data under the chosen licence" }) }),
});

export async function submitDataset(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Sign in to contribute data." };
  const parsed = Input.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const table = parseNkTable(v.data, v.unit);
  if (table.errors.length) return { ok: false, message: `Data: ${table.errors.join("; ")}` };
  if (table.rows.length > 20000) return { ok: false, message: "At most 20 000 rows per dataset." };

  try {
    const token = await issuePlatformJwt(user, "materials-db");
    const sub = await materialsApi().submit(
      {
        material_id: v.material_id || null,
        material_name: v.material_name,
        category: v.category,
        dataset_name: v.dataset_name,
        reference: v.reference,
        doi: v.doi || null,
        license: v.license,
        comments: v.comments,
        data: table.rows,
      },
      token,
    );
    await db.materialSubmission.create({
      data: { remoteId: sub.id, userId: user.id, material: v.material_id || v.material_name, title: v.dataset_name, status: sub.status },
    });
    const mods = await db.user.findMany({ where: { role: { in: ["moderator", "admin"] } }, select: { id: true } });
    await Promise.all(
      mods.map((m) =>
        notify({ userId: m.id, actorId: user.id, type: "submission", message: `New dataset for review: ${v.material_name} — ${v.dataset_name}`, url: "/moderation/materials" }),
      ),
    );
    return { ok: true, id: sub.id, message: `Thanks! Submission ${sub.id} is waiting for review (${table.rows.length} points).` };
  } catch (err) {
    return { ok: false, message: `The materials service rejected the submission: ${(err as Error).message}` };
  }
}
