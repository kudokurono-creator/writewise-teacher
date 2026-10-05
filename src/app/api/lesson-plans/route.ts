import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { api } from "@/lib/errors";
import { basicInfoSchema } from "@/types/lesson";
import { referenceDocuments } from "@/services/documents/service";
export const GET = api(async () => {
  const user = await requireUser();
  return NextResponse.json(
    await db.lessonPlan.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    }),
  );
});
export const POST = api(async (request) => {
  const user = await requireUser();
  const data = z
    .object({
      basicInfo: basicInfoSchema,
      documentIds: z.array(z.string()).max(15).default([]),
    })
    .parse(await request.json());
  const documents = await referenceDocuments(data.documentIds, user.id);
  const plan = await db.lessonPlan.create({
    data: {
      userId: user.id,
      title: data.basicInfo.title,
      basicInfo: json(data.basicInfo),
      references: { create: documents.map((d) => ({ documentId: d.id })) },
    },
  });
  return NextResponse.json({ id: plan.id }, { status: 201 });
});
