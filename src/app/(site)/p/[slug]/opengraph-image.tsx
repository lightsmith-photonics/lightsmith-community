import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { brand } from "@/lib/brand";
import { readPreview } from "@/lib/results-store";
import { extent, linePath } from "@/lib/chart";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Project preview";

const COLORS = ["#a5b4fc", "#fb923c", "#34d399", "#f0abfc"];

// Social preview: title, owner, counts and the preview curve of the latest result.
export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await db.project.findUnique({
    where: { slug },
    include: {
      owner: { select: { username: true } },
      results: { orderBy: { createdAt: "desc" }, take: 1, select: { preview: true } },
      _count: { select: { stars: true, specs: true, results: true } },
    },
  });
  const visible = p && p.visibility !== "private";
  const preview = visible && p.results[0] ? readPreview(p.results[0].preview) : null;
  let paths: string[] = [];
  if (preview) {
    const [x0, x1] = extent(preview.x);
    const [y0, y1] = extent(preview.series.flatMap((s) => s.y));
    paths = preview.series.map((s) => linePath(preview.x.map((x, i) => [((x - x0) / (x1 - x0 || 1)) * 1040, 210 - ((s.y[i] - y0) / (y1 - y0 || 1)) * 200])));
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0b0d12", color: "#e8eaf0", padding: 60, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 28, color: "#a5b4fc" }}>
          {brand.community} · {visible ? `@${p.owner.username}` : "project"}
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>{visible ? p.title.slice(0, 80) : "Private project"}</div>
        {visible && p.description && <div style={{ display: "flex", fontSize: 28, color: "#a3abba", marginTop: 16 }}>{p.description.slice(0, 120)}</div>}
        <div style={{ display: "flex", flex: 1 }} />
        {paths.length > 0 && (
          <svg width="1080" height="220" viewBox="-20 -5 1080 220">
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="5" />
            ))}
          </svg>
        )}
        {visible && (
          <div style={{ display: "flex", gap: 40, fontSize: 26, color: "#a3abba", marginTop: 16 }}>
            <span>{p._count.stars} stars</span>
            <span>{p._count.specs} specs</span>
            <span>{p._count.results} results</span>
            {preview && <span>{preview.headline.slice(0, 60)}</span>}
          </div>
        )}
      </div>
    ),
    size,
  );
}
