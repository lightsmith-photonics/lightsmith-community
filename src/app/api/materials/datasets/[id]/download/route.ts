import { materialsApi } from "@/lib/materials";
import { toNkFile } from "@/lib/materials/formats";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "csv";
  if (format !== "csv" && format !== "yaml" && format !== "json") {
    return Response.json({ error: "bad_format", message: "format must be csv, yaml or json" }, { status: 400 });
  }
  const d = await materialsApi().dataset(decodeURIComponent(id));
  if (!d) return Response.json({ error: "not_found" }, { status: 404 });
  const file = toNkFile(format, d.dataset, d.data);
  return new Response(file.body, {
    headers: {
      "Content-Type": `${file.mime}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
