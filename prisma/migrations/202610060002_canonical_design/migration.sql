ALTER TABLE "LessonPlan" ADD COLUMN "draftStep" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "analysisConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "analysisConversation" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "LessonPlanReference" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'reference',
ADD COLUMN "referenceType" TEXT NOT NULL DEFAULT 'other';
UPDATE "LessonPlan" SET "draftStep" = CASE WHEN "content" IS NOT NULL THEN 6 WHEN "analysis" IS NOT NULL THEN 5 ELSE 2 END;
