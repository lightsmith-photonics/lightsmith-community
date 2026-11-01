-- Full-text search for the forum (src/lib/forum/search.ts uses the same expressions).
CREATE INDEX "Post_body_fts_idx" ON "Post" USING GIN (to_tsvector('english', "body"));
CREATE INDEX "Thread_title_fts_idx" ON "Thread" USING GIN (to_tsvector('english', "title"));
