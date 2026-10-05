-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '教学资料',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "embeddingModel" TEXT NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "basicInfo" JSONB NOT NULL,
    "analysis" JSONB,
    "content" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlanVersion" (
    "id" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "changeDescription" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlanReference" (
    "lessonPlanId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "LessonPlanReference_pkey" PRIMARY KEY ("lessonPlanId","documentId")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "knowledgeBaseIds" TEXT[],
    "webSearch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reflection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonPlanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "sourceContent" JSONB NOT NULL,
    "report" JSONB,
    "optimizedVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReflectionDocument" (
    "reflectionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "ReflectionDocument_pkey" PRIMARY KEY ("reflectionId","documentId")
);

-- CreateTable
CREATE TABLE "AIRequestLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latency" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_key_createdAt_idx" ON "AuthAttempt"("key", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeBase_userId_createdAt_idx" ON "KnowledgeBase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_userId_knowledgeBaseId_idx" ON "Document"("userId", "knowledgeBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_index_key" ON "DocumentChunk"("documentId", "index");

-- CreateIndex
CREATE INDEX "LessonPlan_userId_updatedAt_idx" ON "LessonPlan"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LessonPlanVersion_lessonPlanId_number_key" ON "LessonPlanVersion"("lessonPlanId", "number");

-- CreateIndex
CREATE INDEX "ChatSession_userId_updatedAt_idx" ON "ChatSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Reflection_userId_createdAt_idx" ON "Reflection"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIRequestLog_userId_createdAt_idx" ON "AIRequestLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "KnowledgeBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanVersion" ADD CONSTRAINT "LessonPlanVersion_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanReference" ADD CONSTRAINT "LessonPlanReference_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlanReference" ADD CONSTRAINT "LessonPlanReference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reflection" ADD CONSTRAINT "Reflection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reflection" ADD CONSTRAINT "Reflection_lessonPlanId_fkey" FOREIGN KEY ("lessonPlanId") REFERENCES "LessonPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReflectionDocument" ADD CONSTRAINT "ReflectionDocument_reflectionId_fkey" FOREIGN KEY ("reflectionId") REFERENCES "Reflection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReflectionDocument" ADD CONSTRAINT "ReflectionDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRequestLog" ADD CONSTRAINT "AIRequestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;
