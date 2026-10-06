import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import {
  lessonContentSchema,
  reflectionSchema,
  basicInfoSchema,
  lessonDesignSchema,
  syncStages,
  stageSchema,
  type LessonContent,
} from "@/types/lesson";
import { generate } from "./service";
import { sampleReflection } from "./mock";
import { ownedLesson, saveVersion } from "@/repositories/lesson";
import { withEnglishDesign } from "./bilingual";
import { checkedDesignSchema, replaceTarget } from "./lesson-plan";
import { lessonReferences } from "./material-context";
export async function analyzeReflection(id: string, userId: string) {
  const reflection = await db.reflection.findFirst({
    where: { id, userId },
    include: { lessonPlan: true, documents: { include: { document: true } } },
  });
  if (!reflection) throw new AppError("复盘不存在。", 404);
  const info = basicInfoSchema.parse(reflection.lessonPlan.basicInfo);
  const source = lessonDesignSchema.parse(reflection.sourceContent);
  const report = await generate(
    userId,
    "reflection-analysis",
    {
      basicInfo: info,
      lesson: source,
      feedback: reflection.notes,
      documents: reflection.documents.map((r) => ({
        name: r.document.name,
        text: r.document.text.slice(0, 20000),
      })),
    },
    reflectionSchema.superRefine((report, ctx) => {
      if (
        source.lessons?.length === 2 &&
        (report.lessonReports?.length !== 2 ||
          source.lessons.some(
            (l, i) => report.lessonReports?.[i]?.lessonId !== l.id,
          ) ||
          !report.continuityAnalysis)
      )
        ctx.addIssue({
          code: "custom",
          message: "双课时需分别分析两个课时及衔接效果。",
        });
    }),
    () => sampleReflection(reflection.notes, info.topic, source.lessons),
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
  const chosen = content.lessons
    ? content.lessons.map((l) => l.stages[Math.max(0, l.stages.length - 2)])
    : [content.stages[Math.max(0, content.stages.length - 2)]];
  const stable = (stage: z.infer<typeof stageSchema>) =>
    JSON.stringify([
      stage.id,
      stage.duration,
      stage.kind,
      stage.activities?.map((a) => [
        a.id,
        a.duration,
        a.objectiveIds,
        a.resourceIds,
        a.inputFromActivityIds,
        a.sourceBindings,
      ]),
    ]);
  const references = await lessonReferences(plan, info, userId);
  const updates = await Promise.all(
    chosen.map((stage) =>
      generate(
        userId,
        "lesson-plan-revision",
        {
          instruction:
            "依据复盘建议优化选定评价/反馈阶段，保留其ID、时长、目标、资源绑定与活动输入，不改其他阶段。同步更新操作详情，不能只改变摘要。",
          basicInfo: info,
          target: stage.id,
          current: stage,
          reflection: report,
          references,
        },
        z.object({ value: stageSchema }).superRefine((result, ctx) => {
          if (stable(result.value) !== stable(stage))
            ctx.addIssue({
              code: "custom",
              message: "复盘局部优化必须保留阶段/活动ID、时长和关联。",
            });
        }),
        () => ({
          value: {
            ...stage,
            teacherActivities: `${stage.teacherActivities}\n复盘改进：${report.suggestions[0]}`,
            activities: stage.activities?.map((a, i) =>
              i === 0
                ? {
                    ...a,
                    teacherActions: [
                      ...a.teacherActions,
                      `复盘改进：${report.suggestions[0]}`,
                    ].slice(0, 20),
                    operations: a.operations
                      ? [
                          ...a.operations,
                          {
                            actor: "teacher",
                            grouping: "whole_class",
                            instruction: `复盘改进：${report.suggestions[0]}`,
                          },
                        ].slice(0, 20)
                      : undefined,
                  }
                : a,
            ),
          },
        }),
      ),
    ),
  );
  let revised: LessonContent = content;
  updates.forEach((result, i) => {
    revised = replaceTarget(revised, chosen[i].id, result.value);
  });
  const next = checkedDesignSchema(info, info.workflowVersion === 2).parse(
    syncStages({
      ...revised,
      reflection: `${report.overall}\n下一轮建议：${report.nextLesson}`,
    }),
  );
  const saved = await saveVersion(
    plan.id,
    userId,
    await withEnglishDesign(userId, info, next),
    expectedVersion,
    `基于复盘“${reflection.title}”优化`,
  );
  await db.reflection.update({
    where: { id },
    data: { optimizedVersion: saved.number },
  });
  return { lessonPlanId: plan.id, ...saved };
}
