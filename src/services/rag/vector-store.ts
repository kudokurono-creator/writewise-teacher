import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { KnowledgeSource } from "@/types/lesson";
export interface VectorStore {
  search(
    userId: string,
    baseIds: string[],
    vector: number[],
    model: string,
    topK: number,
  ): Promise<KnowledgeSource[]>;
}
export class PgVectorStore implements VectorStore {
  async search(
    userId: string,
    baseIds: string[],
    vector: number[],
    model: string,
    topK = 5,
  ) {
    if (!baseIds.length) return [];
    const literal = `[${vector.join(",")}]`;
    const rows = await db.$queryRaw<
      {
        documentId: string;
        documentName: string;
        chunkId: string;
        content: string;
        score: number;
      }[]
    >(Prisma.sql`
      SELECT d.id AS "documentId", d.name AS "documentName", c.id AS "chunkId", c.content,
      1 - (c.embedding::vector <=> ${literal}::vector) AS score
      FROM "DocumentChunk" c JOIN "Document" d ON d.id = c."documentId"
      WHERE d."userId" = ${userId} AND d."knowledgeBaseId" IN (${Prisma.join(baseIds)})
      AND d.status = 'READY' AND c."embeddingModel" = ${model} AND cardinality(c.embedding) = ${vector.length}
      ORDER BY c.embedding::vector <=> ${literal}::vector LIMIT ${Math.max(1, Math.min(topK, 10))}`);
    return rows.map((row) => ({ ...row, excerpt: row.content.slice(0, 250) }));
  }
}
