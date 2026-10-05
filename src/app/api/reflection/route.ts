import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { api, AppError } from "@/lib/errors";
import { db, json } from "@/lib/db";
import { ownedLesson } from "@/repositories/lesson";
import { referenceDocuments } from "@/services/documents/service";
export const POST = api(async (request) => {
  const user = await requireUser();
  const data = z
    .object({
      lessonPlanId: z.string(),
      title: z.string().min(2).max(150),
      notes: z.string().max(12000),
      documentIds: z.array(z.string()).max(15),
    })
    .parse(await request.json());
  if (!data.notes.trim() && !data.documentIds.length)
    throw new AppError("请填写课堂反馈或上传反馈资料。");
  const plan = await ownedLesson(data.lessonPlanId, user.id);
  if (!plan.content) throw new AppError("请先完成教学设计。");
  const documents = await referenceDocuments(data.documentIds, user.id);
  const reflection = await db.reflection.create({
    data: {
      userId: user.id,
      lessonPlanId: plan.id,
      title: data.title,
      notes: data.notes,
      sourceVersion: plan.currentVersion,
      sourceContent: json(plan.content),
      documents: { create: documents.map((d) => ({ documentId: d.id })) },
    },
  });
  // Preserve the draft if model generation fails; the UI can retry from its detail page.
  return NextResponse.json({ id: reflection.id });
});
