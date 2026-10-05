import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, AppError } from "@/lib/errors";
import { uploadDocument } from "@/services/documents/service";
export const POST = api(async (request) => {
  const user = await requireUser();
  if (Number(request.headers.get("content-length") || 0) > 16 * 1048576)
    throw new AppError("文件超过 15 MB 限制。", 413);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("请选择文件。");
  const base = form.get("knowledgeBaseId");
  return NextResponse.json(
    await uploadDocument(
      file,
      user.id,
      typeof base === "string" ? base : undefined,
    ),
  );
});
export const GET = api(async () => {
  const user = await requireUser();
  return NextResponse.json(
    await db.document.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        type: true,
        size: true,
        status: true,
        error: true,
        createdAt: true,
        knowledgeBase: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  );
});
