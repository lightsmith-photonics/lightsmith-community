import { db } from "@/lib/db";
import { FEEDBACK_CATEGORY } from "@/lib/feedback/store";
import { requireUser } from "@/lib/session";
import { attachmentOptions } from "@/lib/forum/attachments";
import { NewThreadForm } from "@/components/forum/PostComposer";
import { createThread } from "../actions";

export const metadata = { title: "New thread" };

export default async function NewThread({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser(`/forum/new${sp.category ? `?category=${sp.category}` : ""}`);
  const [categories, attachments] = await Promise.all([
    db.forumCategory.findMany({ where: { slug: { not: FEEDBACK_CATEGORY.slug } }, orderBy: { position: "asc" }, select: { slug: true, name: true } }),
    attachmentOptions(me.id),
  ]);
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-bold">New thread</h1>
      <p className="mt-1 text-sm text-muted">
        Tip: include the spec (or attach it), the method and options, and what you expected. Use <code>$...$</code> for inline maths and{" "}
        <code>$$...$$</code> for display equations.
      </p>
      <div className="mt-6">
        <NewThreadForm action={createThread} categories={categories} defaultCategory={sp.category} attachments={attachments} />
      </div>
    </div>
  );
}
