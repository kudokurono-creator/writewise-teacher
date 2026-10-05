import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { chunkText } from "./chunker";
import { getEmbeddingProvider } from "./embedding";
import { PgVectorStore } from "./vector-store";
export async function indexDocument(id: string, userId: string) {
  const document = await db.document.findFirst({ where: { id, userId } });
  if (!document?.text) throw new AppError("文档未解析或不存在。", 404);
  const chunks = chunkText(document.text);
  const provider = getEmbeddingProvider();
  const records: Prisma.DocumentChunkCreateManyInput[] = [];
  for (let start = 0; start < chunks.length; start += 24) {
    const batch = chunks.slice(start, start + 24);
    const embeddings = await provider.embed(batch);
    for (let i = 0; i < batch.length; i++)
      records.push({
        documentId: id,
        index: start + i,
        content: batch[i],
        embedding: embeddings[i],
        embeddingModel: provider.model,
      });
  }
  await db.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({ where: { documentId: id } });
    await tx.documentChunk.createMany({ data: records });
    await tx.document.update({
      where: { id },
      data: { status: "READY", error: null },
    });
  });
}
export async function retrieve(
  userId: string,
  baseIds: string[],
  query: string,
  topK = 5,
) {
  if (!baseIds.length) return [];
  const owned = await db.knowledgeBase.count({
    where: { id: { in: [...new Set(baseIds)] }, userId },
  });
  if (owned !== new Set(baseIds).size)
    throw new AppError("知识库不存在。", 404);
  const provider = getEmbeddingProvider();
  const [vector] = await provider.embed([query.trim()]);
  return new PgVectorStore().search(
    userId,
    baseIds,
    vector,
    provider.model,
    topK,
  );
}
