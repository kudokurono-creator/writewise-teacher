import { z } from "zod";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { api, AppError } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { ownedLesson, saveVersion } from "@/repositories/lesson";
import {
  analyzeLesson,
  generateLesson,
  reviseLesson,
} from "@/services/ai/lesson-plan";
import {
  analysisSchema,
  basicInfoSchema,
  lessonContentSchema,
  validateDuration,
} from "@/types/lesson";
type Context = { params: Promise<{ id: string }> };
export const GET = (r: Request, c: Context) =>
  api(async () => {
    const user = await requireUser();
    return NextResponse.json(await ownedLesson((await c.params).id, user.id));
  })(r);
export const PATCH = (r: Request, c: Context) =>
  api(async (req) => {
    const user = await requireUser();
    const id = (await c.params).id;
    const plan = await ownedLesson(id, user.id);
    const data = z
      .object({
        basicInfo: basicInfoSchema.optional(),
        analysis: analysisSchema.optional(),
        documentIds: z.array(z.string()).max(15).optional(),
      })
      .parse(await req.json());
    if (plan.currentVersion > 0 && (data.basicInfo || data.documentIds))
      throw new AppError("已生成教案的课程信息不可通过备课草稿接口修改。");
    if (data.documentIds) {
      const { referenceDocuments } =
        await import("@/services/documents/service");
      const documents = await referenceDocuments(data.documentIds, user.id);
      await db.$transaction(async (tx) => {
        await tx.lessonPlanReference.deleteMany({
          where: { lessonPlanId: id },
        });
        await tx.lessonPlanReference.createMany({
          data: documents.map((d) => ({ lessonPlanId: id, documentId: d.id })),
        });
      });
    }
    await db.lessonPlan.update({
      where: { id },
      data: {
        ...(data.basicInfo
          ? {
              basicInfo: json(data.basicInfo),
              title: data.basicInfo.title,
              analysis: Prisma.DbNull,
              status: "DRAFT",
            }
          : {}),
        ...(data.analysis ? { analysis: json(data.analysis) } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  })(r);
export const POST = (r: Request, c: Context) =>
  api(async (req) => {
    const user = await requireUser();
    const id = (await c.params).id;
    const body = await req.json();
    const action = z
      .enum(["analyze", "generate", "save", "revise", "restore"])
      .parse(body.action);
    if (action === "analyze")
      return NextResponse.json(
        await analyzeLesson(
          id,
          user.id,
          z
            .enum([
              "theme",
              "students",
              "objectives",
              "focus",
              "difficulties",
              "writingSkills",
              "strategies",
            ])
            .optional()
            .parse(body.section),
        ),
      );
    if (action === "generate")
      return NextResponse.json(await generateLesson(id, user.id));
    const expectedVersion = z.number().int().min(0).parse(body.expectedVersion);
    if (action === "revise")
      return NextResponse.json(
        await reviseLesson(
          id,
          user.id,
          z.string().parse(body.target),
          z.string().trim().min(2).max(2000).parse(body.instruction),
          expectedVersion,
        ),
      );
    const plan = await ownedLesson(id, user.id);
    if (action === "restore") {
      const number = z.number().int().min(1).parse(body.number);
      const version = plan.versions.find((v) => v.number === number);
      if (!version) throw new AppError("版本不存在。", 404);
      return NextResponse.json(
        await saveVersion(
          id,
          user.id,
          lessonContentSchema.parse(version.content),
          expectedVersion,
          `恢复历史版本 V${number}`,
        ),
      );
    }
    const content = lessonContentSchema.parse(body.content);
    try {
      validateDuration(content, basicInfoSchema.parse(plan.basicInfo).duration);
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : "课时时间不一致。");
    }
    return NextResponse.json(
      await saveVersion(id, user.id, content, expectedVersion, "教师手动编辑"),
    );
  })(r);
