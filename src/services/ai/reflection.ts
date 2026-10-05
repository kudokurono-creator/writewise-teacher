import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  lessonContentSchema,
  reflectionSchema,
  basicInfoSchema,
} from "@/types/lesson";
import { generate } from "./service";
import { sampleReflection } from "./mock";
import { ownedLesson, saveVersion } from "@/repositories/lesson";
export async function analyzeReflection(id: string, userId: string) {
  const reflection = await db.reflection.findFirst({
    where: { id, userId },
    include: { lessonPlan: true, documents: { include: { document: true } } },
  });
  if (!reflection) throw new AppError("复盘不存在。", 404);
  const info = basicInfoSchema.parse(reflection.lessonPlan.basicInfo);
  const report = await generate(
    userId,
    "reflection-analysis",
    {
      lesson: reflection.sourceContent,
      feedback: reflection.notes,
      documents: reflection.documents.map((r) => ({
        name: r.document.name,
        text: r.document.text.slice(0, 20000),
      })),
    },
    reflectionSchema,
    () => sampleReflection(reflection.notes, info.topic),
  );
  await db.reflection.update({ where: { id }, data: { report: json(report) } });
  return report;
}
export async function optimizeFromReflection(
  id: string,
  userId: string,
  expectedVersion: number,
) {
  const reflection = await db.reflection.findFirst({ where: { id, userId } });
  if (!reflection?.report) throw new AppError("请先完成教学复盘。", 404);
  const plan = await ownedLesson(reflection.lessonPlanId, userId);
  if (plan.currentVersion !== expectedVersion)
    throw new AppError("教案已更新，请刷新后重试。", 409);
  const content = lessonContentSchema.parse(plan.content);
  const report = reflectionSchema.parse(reflection.report);
  const info = basicInfoSchema.parse(plan.basicInfo);
  const next = await generate(
    userId,
    "lesson-plan-generation",
    {
      instruction: "根据反馈优化已有教案，尽量保留有效活动与所有阶段 ID。",
      basicInfo: info,
      existing: content,
      reflection: report,
    },
    lessonContentSchema.refine(
      (c) => c.stages.reduce((sum, s) => sum + s.duration, 0) === info.duration,
    ),
    () => ({
      ...content,
      stages: content.stages.map((s, i) =>
        i === content.stages.length - 2
          ? {
              ...s,
              teacherActivities: `${s.teacherActivities}\n复盘改进：${report.suggestions[0]}`,
            }
          : s,
      ),
      reflection: `${report.overall}\n下一轮建议：${report.nextLesson}`,
    }),
  );
  const saved = await saveVersion(
    plan.id,
    userId,
    next,
    expectedVersion,
    `基于复盘“${reflection.title}”优化`,
  );
  await db.reflection.update({
    where: { id },
    data: { optimizedVersion: saved.number },
  });
  return { lessonPlanId: plan.id, ...saved };
}
