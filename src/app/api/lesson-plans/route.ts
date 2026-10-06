import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { api } from "@/lib/errors";
import { basicInfoSchema } from "@/types/lesson";
import { checkedSelections } from "@/services/documents/selection";
import { documentSelectionSchema } from "@/types/canonical";
import { resolveClassProfile } from "@/services/ai/class-profile";
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
      documentSelections: z.array(documentSelectionSchema).max(30).optional(),
      draftStep: z.number().int().min(1).max(6).default(1),
    })
    .parse(await request.json());
  const selections = await checkedSelections(
    data.documentSelections ||
      data.documentIds.map((documentId) => ({
        documentId,
        sourceType: "reference" as const,
        referenceType: "other" as const,
      })),
    user.id,
  );
  const info = await resolveClassProfile(data.basicInfo, user.id);
  const plan = await db.lessonPlan.create({
    data: {
      userId: user.id,
      title: info.title || "教学设计草稿",
      basicInfo: json(info),
      draftStep: data.draftStep,
      references: { create: selections },
    },
  });
  return NextResponse.json({ id: plan.id }, { status: 201 });
});
