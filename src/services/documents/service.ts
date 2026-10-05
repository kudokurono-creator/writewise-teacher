import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getStorage } from "@/services/storage/provider";
import { indexDocument } from "@/services/rag/service";
import { parseDocument, validateFile } from "./parser";
export async function uploadDocument(
  file: File,
  userId: string,
  baseId?: string,
) {
  if (
    file.size >
    Math.min(Number(process.env.MAX_UPLOAD_MB || 15), 15) * 1048576
  )
    throw new AppError("上传文件超过大小限制。");
  if (
    baseId &&
    !(await db.knowledgeBase.findFirst({ where: { id: baseId, userId } }))
  )
    throw new AppError("知识库不存在。", 404);
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = validateFile(file.name, buffer);
  const storage = getStorage();
  const storageKey = await storage.put(userId, type, buffer);
  let document;
  try {
    document = await db.document.create({
      data: {
        userId,
        knowledgeBaseId: baseId || null,
        name: file.name
          .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
          .slice(0, 200),
        type,
        size: buffer.length,
        storageKey,
        status: "PARSING",
      },
    });
  } catch (e) {
    await storage.remove(storageKey);
    throw e;
  }
  try {
    const parsed = await parseDocument(buffer, type);
    await db.document.update({
      where: { id: document.id },
      data: {
        text: parsed.text,
        metadata: json(parsed.metadata),
        status: baseId ? "INDEXING" : "READY",
      },
    });
    if (baseId) await indexDocument(document.id, userId);
  } catch (e) {
    await db.document.update({
      where: { id: document.id },
      data: {
        status: "FAILED",
        error:
          e instanceof AppError
            ? e.message
            : "解析或索引失败，请检查文件并重试。",
      },
    });
  }
  return db.document.findUniqueOrThrow({
    where: { id: document.id },
    select: {
      id: true,
      name: true,
      type: true,
      size: true,
      status: true,
      error: true,
      createdAt: true,
    },
  });
}
export async function referenceDocuments(ids: string[], userId: string) {
  const unique = [...new Set(ids)];
  const docs = await db.document.findMany({
    where: { id: { in: unique }, userId, status: "READY" },
  });
  if (docs.length !== unique.length)
    throw new AppError("部分资料不存在、无法访问或尚未解析完成。");
  return docs;
}
