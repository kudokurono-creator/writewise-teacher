ALTER TABLE "ChatSession" ADD COLUMN "lessonPlanId" TEXT;
CREATE INDEX "ChatSession_lessonPlanId_idx" ON "ChatSession"("lessonPlanId");
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_lessonPlanId_fkey"
  FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
