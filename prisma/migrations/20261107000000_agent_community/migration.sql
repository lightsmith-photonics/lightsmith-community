-- AI agents as community members (accounts, claims, tokens, rate limits, webhooks) and feedback requests
-- on shared simulations. See docs/proposals/agent-community.md.

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "pendingReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "via" TEXT NOT NULL DEFAULT 'web';

-- AlterTable
ALTER TABLE "Thread" ADD COLUMN     "pendingReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'human';

-- CreateTable
CREATE TABLE "AgentProfile" (
    "userId" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "description" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL,
    "tooling" TEXT NOT NULL DEFAULT '',
    "homepage" TEXT,
    "deviceCodeHash" TEXT,
    "userCode" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "requestedScopes" TEXT NOT NULL DEFAULT 'read,post,share,feedback',
    "grantedScopes" TEXT NOT NULL DEFAULT '',
    "claimedAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "webhookUrl" TEXT,
    "webhookVersion" INTEGER NOT NULL DEFAULT 0,
    "reviewAll" BOOLEAN NOT NULL DEFAULT false,
    "approvedPosts" INTEGER NOT NULL DEFAULT 0,
    "writeLimitPerHour" INTEGER,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AgentClaim" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "confirmHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateCounter" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateCounter_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT,
    "specId" TEXT,
    "resultId" TEXT,
    "specName" TEXT NOT NULL,
    "problem" JSONB NOT NULL,
    "problemKind" TEXT NOT NULL,
    "resultName" TEXT,
    "resultKind" TEXT,
    "resultKey" TEXT,
    "resultPreview" TEXT,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "wants" TEXT NOT NULL DEFAULT 'review,reproduce',
    "status" TEXT NOT NULL DEFAULT 'open',
    "threadId" TEXT NOT NULL,
    "via" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "FeedbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "problem" JSONB,
    "problemKind" TEXT,
    "method" TEXT,
    "backend" TEXT,
    "dataKind" TEXT,
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "preview" TEXT,
    "metadata" JSONB,
    "comparison" JSONB,
    "via" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_deviceCodeHash_key" ON "AgentProfile"("deviceCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_userCode_key" ON "AgentProfile"("userCode");

-- CreateIndex
CREATE INDEX "AgentProfile_ownerId_idx" ON "AgentProfile"("ownerId");

-- CreateIndex
CREATE INDEX "AgentProfile_status_claimExpiresAt_idx" ON "AgentProfile"("status", "claimExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentClaim_confirmHash_key" ON "AgentClaim"("confirmHash");

-- CreateIndex
CREATE INDEX "AgentClaim_agentId_idx" ON "AgentClaim"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_hash_key" ON "ApiToken"("hash");

-- CreateIndex
CREATE INDEX "ApiToken_agentId_idx" ON "ApiToken"("agentId");

-- CreateIndex
CREATE INDEX "RateCounter_windowStart_idx" ON "RateCounter"("windowStart");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_agentId_createdAt_idx" ON "WebhookDelivery"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackRequest_threadId_key" ON "FeedbackRequest"("threadId");

-- CreateIndex
CREATE INDEX "FeedbackRequest_status_createdAt_idx" ON "FeedbackRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackRequest_authorId_idx" ON "FeedbackRequest"("authorId");

-- CreateIndex
CREATE INDEX "FeedbackRequest_projectId_idx" ON "FeedbackRequest"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackResponse_postId_key" ON "FeedbackResponse"("postId");

-- CreateIndex
CREATE INDEX "FeedbackResponse_requestId_createdAt_idx" ON "FeedbackResponse"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentClaim" ADD CONSTRAINT "AgentClaim_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentClaim" ADD CONSTRAINT "AgentClaim_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_specId_fkey" FOREIGN KEY ("specId") REFERENCES "Spec"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ResultRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Review queue for held posts (src/lib/agents/moderation.ts): only held posts are indexed.
CREATE INDEX "Post_pendingReview_idx" ON "Post" ("createdAt") WHERE "pendingReview";
