import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, AppError } from "@/lib/errors";
import { getStorage } from "@/services/storage/provider";
import { parseDocument } from "@/services/documents/parser";
import { indexDocument } from "@/services/rag/service";
type Context = { params: Promise<{ id: string }> };
export const GET = (r: Request, c: Context) =>
  api(async () => {
    const user = await requireUser();
    const document = await db.document.findFirst({
      where: { id: (await c.params).id, userId: user.id },
    });
    if (!document) throw new AppError("文档不存在。", 404);
    if (new URL(r.url).searchParams.get("view") === "text")
      return new Response(document.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    const bytes = await getStorage().read(document.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  })(r);
export const DELETE = (r: Request, c: Context) =>
  api(async () => {
    const user = await requireUser();
    const document = await db.document.findFirst({
      where: { id: (await c.params).id, userId: user.id },
    });
    if (!document) throw new AppError("文档不存在。", 404);
    const used = await db.lessonPlanReference.count({
      where: { documentId: document.id },
    });
    const reflected = await db.reflectionDocument.count({
      where: { documentId: document.id },
    });
    if (used || reflected)
      throw new AppError("该文件已被教学设计或复盘引用，无法删除。", 409);
    await db.document.delete({ where: { id: document.id } });
    await getStorage().remove(document.storageKey);
    return NextResponse.json({ ok: true });
  })(r);
export const POST = (r: Request, c: Context) =>
  api(async () => {
    const user = await requireUser();
    const doc = await db.document.findFirst({
      where: { id: (await c.params).id, userId: user.id },
    });
    if (!doc) throw new AppError("文档不存在。", 404);
    const parsed = await parseDocument(
      await getStorage().read(doc.storageKey),
      doc.type,
    );
    await db.document.update({
      where: { id: doc.id },
      data: { text: parsed.text, status: "READY", error: null },
    });
    if (doc.knowledgeBaseId) await indexDocument(doc.id, user.id);
    return NextResponse.json({ ok: true });
  })(r);
