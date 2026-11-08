-- Marks posts that flags took back into review, whatever happens to those flags afterwards.
ALTER TABLE "Post" ADD COLUMN "escalatedAt" TIMESTAMP(3);
