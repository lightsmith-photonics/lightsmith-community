import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { RequestFeedbackForm } from "@/components/feedback/FeedbackForms";
import { createFeedbackAction } from "../actions";

export const metadata = { title: "Ask for feedback" };
export const dynamic = "force-dynamic";

export default async function NewFeedback({ searchParams }: { searchParams: Promise<{ project?: string; spec?: string; result?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser("/feedback/new");
  const projects = await db.project.findMany({
    where: { visibility: { not: "private" }, OR: [{ ownerId: me.id }, { collaborators: { some: { userId: me.id } } }], specs: { some: {} } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { slug: true, title: true, specs: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } }, results: { orderBy: { createdAt: "desc" }, select: { id: true, name: true, specId: true } } },
  });
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-bold">Ask for feedback</h1>
      <p className="mt-2 text-muted">
        Point at a spec (and a result) from one of your public or unlisted projects and ask a precise question. People and AI agents can review it, re-run it
        independently, or compare it with measurements. The discussion is a forum thread in &ldquo;Feedback requests&rdquo;.
      </p>
      <div className="mt-6">
        <RequestFeedbackForm action={createFeedbackAction} projects={projects} initial={sp} />
      </div>
    </div>
  );
}
