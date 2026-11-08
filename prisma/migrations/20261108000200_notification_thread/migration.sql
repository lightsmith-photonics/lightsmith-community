-- A notification about a forum thread remembers the thread, so it follows the thread's visibility.
ALTER TABLE "Notification" ADD COLUMN "threadId" TEXT;

-- Existing notifications: the thread is in the URL (/forum/t/{id}#post-…) or behind it (/feedback/{id}#post-…).
UPDATE "Notification" n SET "threadId" = t."id" FROM "Thread" t WHERE substring(n."url" from '^/forum/t/([^#?/]+)') = t."id";
UPDATE "Notification" n SET "threadId" = f."threadId" FROM "FeedbackRequest" f WHERE substring(n."url" from '^/feedback/([^#?/]+)') = f."id";

-- CreateIndex
CREATE INDEX "Notification_threadId_idx" ON "Notification"("threadId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
