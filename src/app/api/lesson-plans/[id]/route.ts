import { z } from "zod";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { api, AppError } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { ownedLesson, saveVersion } from "@/repositories/lesson";
import { resolveClassProfile } from "@/services/ai/class-profile";
import { withEnglishDesign } from "@/services/ai/bilingual";
import { checkedSelections } from "@/services/documents/selection";
import { documentSelectionSchema } from "@/types/canonical";
import { validateDesign } from "@/services/ai/design-validation";
import {
  analyzeLesson,
  generateLesson,
  reviseLesson,
  discussAnalysis,
} from "@/services/ai/lesson-plan";
import {
  analysisSchema,
  basicInfoSchema,
  lessonContentSchema,
  validateDuration,
  getLessonDurations,
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
        documentSelections: z.array(documentSelectionSchema).max(30).optional(),
        draftStep: z.number().int().min(1).max(6).optional(),
        analysisConfirmed: z.boolean().optional(),
      })
      .parse(await req.json());
    if (plan.currentVersion > 0)
      throw new AppError("已生成教案的课程信息不可通过备课草稿接口修改。");
    const selections =
      data.documentSelections ||
      data.documentIds?.map((documentId) => ({
        documentId,
        sourceType: "reference" as const,
        referenceType: "other" as const,
      }));
    const [info, documents] = await Promise.all([
      data.basicInfo
        ? resolveClassProfile(data.basicInfo, user.id)
        : Promise.resolve(null),
      selections
        ? checkedSelections(selections, user.id)
        : Promise.resolve(null),
    ]);
    const changedReferences =
      documents &&
      JSON.stringify(
        [...documents].sort((a, b) => a.documentId.localeCompare(b.documentId)),
      ) !==
        JSON.stringify(
          plan.references
            .map((r) => ({
              documentId: r.documentId,
              sourceType: r.sourceType,
              referenceType: r.referenceType,
            }))
            .sort((a, b) => a.documentId.localeCompare(b.documentId)),
        );
    const changedInfo =
      info &&
      JSON.stringify(info) !==
        JSON.stringify(basicInfoSchema.parse(plan.basicInfo));
    if (data.analysisConfirmed && !(data.analysis || plan.analysis))
      throw new AppError("请先完成教学分析。");
    if (data.analysisConfirmed) {
      if (changedInfo || changedReferences)
        throw new AppError("教材或课程配置已变化，请重新分析后确认。");
      const currentInfo = info || basicInfoSchema.parse(plan.basicInfo);
      const confirmed = analysisSchema.parse(data.analysis || plan.analysis);
      if (
        currentInfo.workflowVersion === 2 &&
        (confirmed.lessons?.length !== getLessonDurations(currentInfo).length ||
          confirmed.lessons.some(
            (l, i) =>
              l.lessonNumber !== i + 1 ||
              l.duration !== getLessonDurations(currentInfo)[i],
          ))
      )
        throw new AppError(
          "各课时分析的数量、序号或时长与课程配置不一致，请重新分析。",
        );
    }
    await db.$transaction(async (tx) => {
      const updated = await tx.lessonPlan.updateMany({
        where: {
          id,
          userId: user.id,
          ...(info || documents ? { currentVersion: 0 } : {}),
        },
        data: {
          ...(changedInfo
            ? {
                basicInfo: json(info),
                title: info!.title || "教学设计草稿",
                analysis: Prisma.DbNull,
                status: "DRAFT",
              }
            : {}),
          ...(changedReferences
            ? { analysis: Prisma.DbNull, status: "DRAFT" }
            : {}),
          ...(data.analysis ? { analysis: json(data.analysis) } : {}),
          ...(data.draftStep ? { draftStep: data.draftStep } : {}),
          ...(changedInfo || changedReferences
            ? { analysisConfirmed: false, analysisConversation: json([]) }
            : {}),
          ...(data.analysisConfirmed !== undefined
            ? { analysisConfirmed: data.analysisConfirmed }
            : {}),
        },
      });
      if (updated.count !== 1)
        throw new AppError("教案已生成，请刷新后使用教案编辑器。", 409);
      if (documents) {
        await tx.lessonPlanReference.deleteMany({
          where: { lessonPlanId: id },
        });
        await tx.lessonPlanReference.createMany({
          data: documents.map((d) => ({ lessonPlanId: id, ...d })),
        });
      }
    });
    return NextResponse.json({ ok: true });
  })(r);
export const POST = (r: Request, c: Context) =>
  api(async (req) => {
    const user = await requireUser();
    const id = (await c.params).id;
    const body = await req.json();
    const action = z
      .enum([
        "analyze",
        "analysis-chat",
        "generate",
        "save",
        "revise",
        "restore",
        "translate",
      ])
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
              "materialAnalysis",
            ])
            .optional()
            .parse(body.section),
        ),
      );
    if (action === "analysis-chat")
      return NextResponse.json(
        await discussAnalysis(
          id,
          user.id,
          z.string().min(1).parse(body.targetLessonId),
          z.string().trim().min(2).max(2000).parse(body.instruction),
        ),
      );
    if (action === "generate") {
      if (!body.stream)
        return NextResponse.json(await generateLesson(id, user.id));
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: unknown) => {
            try {
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            } catch {
              /* Client may navigate while the saved generation completes. */
            }
          };
          try {
            const result = await generateLesson(id, user.id, (progress) =>
              send({ type: "progress", ...progress }),
            );
            send({ type: "complete", number: result.number });
          } catch (error) {
            send({
              type: "error",
              message:
                error instanceof Error ? error.message : "生成未完成，请重试。",
            });
          } finally {
            try {
              controller.close();
            } catch {
              /* Disconnected reader. */
            }
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
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
    if (plan.currentVersion !== expectedVersion)
      throw new AppError("教案版本已更新，请刷新后重试。", 409);
    if (action === "translate") {
      const content = lessonContentSchema.parse(plan.content);
      return NextResponse.json(
        await saveVersion(
          id,
          user.id,
          await withEnglishDesign(
            user.id,
            basicInfoSchema.parse(plan.basicInfo),
            content,
          ),
          expectedVersion,
          "生成英文对应版本",
        ),
      );
    }
    if (action === "restore") {
      const number = z.number().int().min(1).parse(body.number);
      const version = plan.versions.find((v) => v.number === number);
      if (!version) throw new AppError("版本不存在。", 404);
      const historical = lessonContentSchema.parse(version.content);
      return NextResponse.json(
        await saveVersion(
          id,
          user.id,
          historical.english
            ? historical
            : await withEnglishDesign(
                user.id,
                basicInfoSchema.parse(plan.basicInfo),
                historical,
              ),
          expectedVersion,
          `恢复历史版本 V${number}`,
        ),
      );
    }
    const content = lessonContentSchema.parse(body.content);
    try {
      const info = basicInfoSchema.parse(plan.basicInfo);
      if (info.workflowVersion === 2) {
        const checked = validateDesign(
          content,
          info,
          true,
          plan.references.map((r) => documentSelectionSchema.parse(r)),
        );
        if (checked.hard.length)
          throw new AppError(
            checked.hard
              .slice(0, 3)
              .map(
                (i) => `${i.message}（预期 ${i.expected}，实际 ${i.actual}）`,
              )
              .join("；"),
          );
      } else validateDuration(content, info);
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : "课时时间不一致。");
    }
    return NextResponse.json(
      await saveVersion(
        id,
        user.id,
        await withEnglishDesign(
          user.id,
          basicInfoSchema.parse(plan.basicInfo),
          content,
        ),
        expectedVersion,
        "教师手动编辑，同步英文版",
      ),
    );
  })(r);
