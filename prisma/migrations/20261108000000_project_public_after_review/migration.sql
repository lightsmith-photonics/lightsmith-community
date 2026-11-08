-- Projects an agent shared as public while its posts were reviewed: unlisted until the review passes.
ALTER TABLE "Project" ADD COLUMN "publicAfterReview" BOOLEAN NOT NULL DEFAULT false;
