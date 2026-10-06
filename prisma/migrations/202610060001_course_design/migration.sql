CREATE TABLE "ClassProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClassProfile_userId_updatedAt_idx" ON "ClassProfile"("userId", "updatedAt");
ALTER TABLE "ClassProfile" ADD CONSTRAINT "ClassProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatSession" ADD COLUMN "currentLessonId" TEXT;
