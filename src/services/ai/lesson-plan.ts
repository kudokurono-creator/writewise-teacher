import { z } from "zod";
import {
  basicInfoSchema,
  analysisSchema,
  lessonContentSchema,
  stageSchema,
  validateDuration,
} from "@/types/lesson";
import { ownedLesson, saveVersion } from "@/repositories/lesson";
import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { generate } from "./service";
import { sampleAnalysis, sampleLesson } from "./mock";
export async function analyzeLesson(
  id: string,
  userId: string,
  section?: keyof z.infer<typeof analysisSchema>,
) {
  const plan = await ownedLesson(id, userId);
  const info = basicInfoSchema.parse(plan.basicInfo);
  const references = plan.references.map((r) => ({
    name: r.document.name,
    text: r.document.text.slice(0, 15000),
  }));
  const analysis = await generate(
    userId,
    "lesson-analysis",
    { ...info, references },
    analysisSchema,
    () => sampleAnalysis(info, references.length > 0),
  );
  const final =
    section && plan.analysis
      ? analysisSchema.parse({
          ...analysisSchema.parse(plan.analysis),
          [section]: analysis[section],
        })
      : analysis;
  await db.lessonPlan.update({
    where: { id },
    data: {
      analysis: json(final),
      status: plan.content ? plan.status : "ANALYZED",
    },
  });
  return final;
}
export async function generateLesson(id: string, userId: string) {
  const plan = await ownedLesson(id, userId);
  const info = basicInfoSchema.parse(plan.basicInfo);
  if (!plan.analysis) throw new AppError("请先生成并确认教学分析。");
  if (plan.currentVersion > 0)
    throw new AppError("教学设计已生成，请使用编辑或局部修改，避免重复生成。");
  const analysis = analysisSchema.parse(plan.analysis);
  const schema = lessonContentSchema
    .refine(
      (c) => c.stages.reduce((n, s) => n + s.duration, 0) === info.duration,
      "教学阶段总时长不正确",
    )
    .refine(
      (c) => new Set(c.stages.map((s) => s.id)).size === c.stages.length,
      "教学阶段 ID 不能重复",
    );
  const content = await generate(
    userId,
    "lesson-plan-generation",
    {
      ...info,
      analysis,
      references: plan.references.map((r) => ({
        name: r.document.name,
        text: r.document.text.slice(0, 15000),
      })),
    },
    schema,
    () => sampleLesson(info, analysis),
  );
  try {
    validateDuration(content, info.duration);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : "阶段校验失败。");
  }
  return saveVersion(id, userId, content, 0, "初始生成版本");
}
export const revisionTargets = [
  "curriculumStandards",
  "designRationale",
  "textbookAnalysis",
  "studentAnalysis",
  "objectives",
  "focus",
  "difficulties",
  "methods",
  "assessment",
  "homework",
  "boardDesign",
  "reflection",
] as const;
export async function reviseLesson(
  id: string,
  userId: string,
  target: string,
  instruction: string,
  expectedVersion: number,
) {
  const plan = await ownedLesson(id, userId);
  const content = lessonContentSchema.parse(plan.content);
  if (plan.currentVersion !== expectedVersion)
    throw new AppError("教案版本已更新，请刷新后重试。", 409);
  const stage = content.stages.find((s) => s.id === target);
  if (
    !stage &&
    !revisionTargets.includes(target as (typeof revisionTargets)[number])
  )
    throw new AppError("无效的修改范围。");
  const current = stage || content[target as (typeof revisionTargets)[number]];
  const valueSchema = stage
    ? stageSchema
    : Array.isArray(current)
      ? z.array(z.string().min(1)).min(1).max(8)
      : z.string().min(1).max(12000);
  const schema = z.object({ value: valueSchema });
  const result = await generate(
    userId,
    "lesson-plan-revision",
    { target, instruction, current, basicInfo: plan.basicInfo },
    schema,
    () => ({
      value: stage
        ? {
            ...stage,
            teacherActivities: `${stage.teacherActivities}\n演示修改建议：${instruction}。安排学生先独立思考，再两人交流，最后分享并说明理由。`,
            studentActivities: `${stage.studentActivities}\n完成简短同伴讨论，记录具体观点。`,
          }
        : Array.isArray(current)
          ? [...current, `演示修改建议：${instruction}`].slice(0, 8)
          : `${current}\n演示修改建议：${instruction}。请结合本班实际确认并细化。`,
    }),
  );
  const next = stage
    ? {
        ...content,
        stages: content.stages.map((s) =>
          s.id === target
            ? { ...stageSchema.parse(result.value), id: target }
            : s,
        ),
      }
    : { ...content, [target]: result.value };
  const parsed = lessonContentSchema.parse(next);
  try {
    validateDuration(parsed, basicInfoSchema.parse(plan.basicInfo).duration);
  } catch (e) {
    throw new AppError(
      e instanceof Error ? e.message : "阶段时间需要重新分配。",
    );
  }
  return saveVersion(
    id,
    userId,
    parsed,
    expectedVersion,
    `AI 修改：${stage?.name || target}；${instruction.slice(0, 100)}`,
  );
}
