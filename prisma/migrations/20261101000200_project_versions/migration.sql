-- Versioned projects: immutable spec snapshots (ProjectVersion), the results linked to each (VersionResult),
-- collaborators, fork lineage to a version, and the version a job ran. Additive; existing projects become v1.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "currentVersionId" TEXT,
ADD COLUMN     "forkedFromVersionId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "versionId" TEXT;

-- CreateTable
CREATE TABLE "ProjectCollaborator" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCollaborator_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ProjectVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "authorId" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "specs" JSONB NOT NULL,
    "restoredFrom" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionResult" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "resultId" TEXT,
    "specId" TEXT,
    "specName" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "backend" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "preview" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCollaborator_userId_idx" ON "ProjectCollaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_projectId_number_key" ON "ProjectVersion"("projectId", "number");

-- CreateIndex
CREATE INDEX "VersionResult_versionId_idx" ON "VersionResult"("versionId");

-- CreateIndex
CREATE INDEX "VersionResult_storageKey_idx" ON "VersionResult"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Project_currentVersionId_key" ON "Project"("currentVersionId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_forkedFromVersionId_fkey" FOREIGN KEY ("forkedFromVersionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionResult" ADD CONSTRAINT "VersionResult_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionResult" ADD CONSTRAINT "VersionResult_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ResultRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: every existing project gets v1 holding its current specs and results, and points at it.
-- Spec JSON was validated on save; anything that is not JSON is kept as text rather than failing the migration.
CREATE FUNCTION pg_temp.lightsmith_try_jsonb(t TEXT) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN t::jsonb;
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('_unparsed', t);
END
$$;

INSERT INTO "ProjectVersion" ("id", "projectId", "number", "authorId", "message", "specs", "createdAt")
SELECT
  'v1_' || p."id",
  p."id",
  1,
  p."ownerId",
  'Initial version',
  COALESCE(
    (SELECT jsonb_agg(
              jsonb_build_object('id', s."id", 'name', s."name", 'kind', s."kind", 'problem', pg_temp.lightsmith_try_jsonb(s."json"))
              ORDER BY s."createdAt", s."id")
       FROM "Spec" s WHERE s."projectId" = p."id"),
    '[]'::jsonb),
  p."updatedAt"
FROM "Project" p;

INSERT INTO "VersionResult" ("id", "versionId", "resultId", "specId", "specName", "name", "kind", "method", "backend", "storageKey", "sizeBytes", "preview", "createdAt")
SELECT 'v1r_' || r."id", 'v1_' || r."projectId", r."id", r."specId", s."name", r."name", r."kind", r."method", r."backend", r."storageKey", r."sizeBytes", r."preview", r."createdAt"
FROM "ResultRecord" r
LEFT JOIN "Spec" s ON s."id" = r."specId";

UPDATE "Project" SET "currentVersionId" = 'v1_' || "id";
