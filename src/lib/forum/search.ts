import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Forum full-text search on PostgreSQL. The to_tsvector expressions match the GIN indexes in
// prisma/migrations/*_forum_search, so the planner can use them. Title matches rank higher.

export interface SearchHit {
  threadId: string;
  title: string;
  categorySlug: string;
  categoryName: string;
  snippet: string;
  score: number;
  createdAt: Date;
}

/** Normalised query, or null when there is nothing worth searching for. */
export function normaliseQuery(q: string): string | null {
  const t = q.replace(/\s+/g, " ").trim().slice(0, 200);
  return /[\p{L}\p{N}]{2,}/u.test(t) ? t : null;
}

export async function searchForum(raw: string, limit = 30): Promise<SearchHit[]> {
  const q = normaliseQuery(raw);
  if (!q) return [];
  const rows = await db.$queryRaw<
    { threadId: string; title: string; categorySlug: string; categoryName: string; snippet: string; score: number; createdAt: Date }[]
  >(Prisma.sql`
    WITH query AS (SELECT websearch_to_tsquery('english', ${q}) AS tsq),
    hits AS (
      SELECT DISTINCT ON (t.id)
             t.id AS "threadId", t.title, c.slug AS "categorySlug", c.name AS "categoryName", t."createdAt",
             ts_headline('english', p.body, query.tsq, 'MaxWords=30, MinWords=10, StartSel="", StopSel=""') AS snippet,
             2 * ts_rank(to_tsvector('english', t.title), query.tsq) + ts_rank(to_tsvector('english', p.body), query.tsq) AS score
      FROM "Post" p
      JOIN "Thread" t ON t.id = p."threadId"
      JOIN "ForumCategory" c ON c.id = t."categoryId"
      CROSS JOIN query
      WHERE p."deletedAt" IS NULL AND t."deletedAt" IS NULL
        AND (to_tsvector('english', p.body) @@ query.tsq OR to_tsvector('english', t.title) @@ query.tsq)
      ORDER BY t.id, score DESC
    )
    SELECT * FROM hits ORDER BY score DESC LIMIT ${limit}`);
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}
