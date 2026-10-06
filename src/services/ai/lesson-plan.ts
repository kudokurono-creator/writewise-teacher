import { z } from "zod";
import {
  basicInfoSchema,
  analysisSchema,
  lessonContentSchema,
  lessonDesignSchema,
  materialAnalysisSchema,
  lessonSessionSchema,
  activitySchema,
  stageSchema,
  syncStages,
  type LessonContent,
  type BasicInfo,
  lessonAnalysisSchema,
} from "@/types/lesson";
import { ownedLesson, saveVersion } from "@/repositories/lesson";
import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { generate } from "./service";
import { sampleAnalysis, sampleLesson, sampleMaterialAnalysis } from "./mock";
import { withEnglishDesign } from "./bilingual";
import { lessonReferences } from "./material-context";
import { generateValidatedDesign } from "./design-generation";
import {
  generatedDesignSchema,
  richActivitySchema,
  validateDesign,
} from "./design-validation";
import {
  documentSelectionSchema,
  type ProgressReporter,
} from "@/types/canonical";

export async function analyzeLesson(
  id: string,
  userId: string,
  section?: keyof z.infer<typeof analysisSchema>,
) {
  const plan = await ownedLesson(id, userId);
  const info = basicInfoSchema.parse(plan.basicInfo);
  const references = await lessonReferences(plan, info, userId);
  if (
    info.workflowVersion === 2 &&
    !references.some((r) => r.sourceType === "textbook")
  )
    throw new AppError("请在教材与资料中选择至少一份本次教材。");
  const previous = analysisSchema.safeParse(plan.analysis).data;
  const materialAnalysis =
    section && section !== "materialAnalysis" && previous?.materialAnalysis
      ? previous.materialAnalysis
      : await generate(
          userId,
          "material-analysis",
          { basicInfo: info, references },
          materialAnalysisSchema,
          () => sampleMaterialAnalysis(info),
        );
  const analysis = await generate(
    userId,
    "lesson-analysis",
    { ...info, references, materialAnalysis },
    analysisSchema
      .extend({
        lessons: z
          .array(lessonAnalysisSchema)
          .length(info.lessonMode === "double" ? 2 : 1),
        sequenceRationale: z.string().min(1),
        inferredInfo: analysisSchema.shape.inferredInfo.unwrap(),
      })
      .superRefine((a, ctx) => {
        a.lessons.forEach((lesson, i) => {
          if (
            lesson.duration !== (info.lessonDurations || [info.duration])[i] ||
            lesson.lessonNumber !== i + 1
          )
            ctx.addIssue({
              code: "custom",
              path: ["lessons", i],
              message: "课时序号和时长必须使用教师配置。",
            });
        });
      }),
    () => ({
      ...sampleAnalysis(info, references.length > 0),
      materialAnalysis,
    }),
  );
  const final =
    section && previous
      ? analysisSchema.parse({
          ...previous,
          [section]:
            section === "materialAnalysis"
              ? materialAnalysis
              : analysis[section],
        })
      : { ...analysis, materialAnalysis };
  await db.lessonPlan.update({
    where: { id },
    data: {
      analysis: json(final),
      status: plan.content ? plan.status : "ANALYZED",
      analysisConfirmed: false,
      draftStep: 5,
      ...(final.inferredInfo
        ? {
            title: final.inferredInfo.title,
            basicInfo: json({
              ...info,
              ...final.inferredInfo,
              referenceScope:
                info.referenceWholeUnit !== false &&
                ["", "整个 所选 Unit"].includes(info.referenceScope || "")
                  ? `整个 ${final.inferredInfo.unit && final.inferredInfo.unit !== "未指定" ? final.inferredInfo.unit : "所选 Unit"}`
                  : info.referenceScope,
            }),
          }
        : {}),
    },
  });
  return final;
}

export function checkedDesignSchema(info: BasicInfo, requireNew = false) {
  const schema = requireNew ? generatedDesignSchema : lessonDesignSchema;
  return schema.transform(syncStages).superRefine((content, ctx) => {
    validateDesign(content, info, requireNew).hard.forEach((i) =>
      ctx.addIssue({
        code: "custom",
        path: i.path.split("."),
        message: `${i.message} 预期 ${i.expected}，实际 ${i.actual}`,
      }),
    );
  });
}

export async function generateLesson(
  id: string,
  userId: string,
  progress?: ProgressReporter,
) {
  const plan = await ownedLesson(id, userId);
  const info = basicInfoSchema.parse(plan.basicInfo);
  if (!plan.analysis) throw new AppError("请先生成并确认教学分析。");
  if (info.workflowVersion === 2 && !plan.analysisConfirmed)
    throw new AppError("请先接受并确认各课时分析。");
  if (plan.currentVersion > 0)
    throw new AppError("教学设计已生成，请使用编辑或局部修改，避免重复生成。");
  const analysis = analysisSchema.parse(plan.analysis);
  const sources = plan.references.map((r) => documentSelectionSchema.parse(r));
  progress?.({
    phase: "analysis",
    message: "正在读取已确认的教材、资料用途与各课时分析…",
  });
  const content = await generateValidatedDesign(
    userId,
    info,
    {
      basicInfo: info,
      analysis,
      references: await lessonReferences(plan, info, userId),
      analysisConversation: plan.analysisConversation,
    },
    () => {
      const mock = sampleLesson(info, analysis);
      mock.lessons?.forEach((l) =>
        l.stages.forEach((s) =>
          s.activities?.forEach((a) => {
            a.sourceBindings = sources
              .filter((s) => s.sourceType === "textbook")
              .map((s) => ({
                documentId: s.documentId,
                scope: "teaching",
                purpose: "direct",
              }));
          }),
        ),
      );
      return syncStages(mock);
    },
    progress,
    sources,
  );
  const saved = await saveVersion(
    id,
    userId,
    await withEnglishDesign(userId, info, content, progress),
    0,
    "初始生成中英文版本",
  );
  progress?.({ phase: "complete", message: "结构校验与双语保存已完成。" });
  return saved;
}

export const conversationSchema = z.array(
  z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string(),
    lessonId: z.string(),
    createdAt: z.string(),
  }),
);
export function applyAnalysisDialogue(
  previous: z.infer<typeof analysisSchema>,
  targetId: string,
  result: {
    lesson: z.infer<typeof lessonAnalysisSchema>;
    sequenceRationale?: string;
  },
) {
  const old = previous.lessons?.find((l) => l.id === targetId);
  if (
    !old ||
    result.lesson.id !== old.id ||
    result.lesson.lessonNumber !== old.lessonNumber ||
    result.lesson.duration !== old.duration
  )
    throw new AppError("分析调整必须保留选定课时、序号与时长。");
  return {
    ...previous,
    lessons: previous.lessons!.map((l) =>
      l.id === targetId ? result.lesson : l,
    ),
    ...(result.sequenceRationale
      ? { sequenceRationale: result.sequenceRationale }
      : {}),
  };
}
export async function discussAnalysis(
  id: string,
  userId: string,
  targetId: string,
  instruction: string,
) {
  const plan = await ownedLesson(id, userId);
  if (plan.currentVersion > 0)
    throw new AppError("教案已生成，请使用教案局部修改。");
  const previous = analysisSchema.parse(plan.analysis),
    info = basicInfoSchema.parse(plan.basicInfo);
  const lesson = previous.lessons?.find((l) => l.id === targetId);
  if (!lesson) throw new AppError("请先生成本课时分析。");
  const history = conversationSchema.parse(plan.analysisConversation);
  const result = await generate(
    userId,
    "lesson-analysis-dialogue",
    {
      targetLessonId: targetId,
      instruction,
      lesson,
      analysis: previous,
      history: history.slice(-20),
      basicInfo: info,
      references: await lessonReferences(plan, info, userId),
    },
    z.object({
      reply: z.string().min(1),
      questions: z.array(z.string()).max(3),
      lesson: lessonAnalysisSchema,
      sequenceRationale: z.string().optional(),
    }),
    () => ({
      reply:
        "已将要求加入选定课时，其他课时与共同教材分析保留。演示建议请核实。",
      questions: [],
      lesson: {
        ...lesson,
        coreContent: `${lesson.coreContent}\n教师要求：${instruction}`,
        difficultPoints: `${lesson.difficultPoints}\n建议：针对“${instruction}”补充示范与任务支架。`,
      },
    }),
  );
  const analysis = applyAnalysisDialogue(previous, targetId, result);
  const now = new Date().toISOString();
  const conversation = [
    ...history,
    {
      role: "user" as const,
      text: instruction,
      lessonId: targetId,
      createdAt: now,
    },
    {
      role: "assistant" as const,
      text: [result.reply, ...result.questions].join("\n"),
      lessonId: targetId,
      createdAt: now,
    },
  ];
  await db.lessonPlan.update({
    where: { id },
    data: {
      analysis: json(analysis),
      analysisConversation: json(conversation),
      analysisConfirmed: false,
      draftStep: 5,
    },
  });
  return { analysis, conversation };
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
  "resources",
  "assessment",
  "homework",
  "boardDesign",
  "reflection",
  "pptSuggestions",
] as const;
export function revisionTarget(content: LessonContent, target: string) {
  const rich = Boolean(content.canonical && content.goals && content.lessons);
  const lesson = content.lessons?.find((l) => l.id === target);
  if (lesson)
    return {
      current: lesson,
      schema: rich
        ? generatedDesignSchema.shape.lessons.element
        : lessonSessionSchema,
      label: lesson.title,
      kind: "lesson" as const,
    };
  for (const stage of content.stages) {
    if (stage.id === target)
      return {
        current: stage,
        schema: rich
          ? generatedDesignSchema.shape.lessons.element.shape.stages.element
          : stageSchema,
        label: stage.name,
        kind: "stage" as const,
      };
    const activity = stage.activities?.find((a) => a.id === target);
    if (activity)
      return {
        current: activity,
        schema: rich ? richActivitySchema : activitySchema,
        label: activity.title,
        kind: "activity" as const,
      };
  }
  if (!revisionTargets.includes(target as (typeof revisionTargets)[number]))
    throw new AppError("无效的修改范围。");
  const current = content[target as (typeof revisionTargets)[number]] || "";
  return {
    current,
    schema: Array.isArray(current)
      ? z
          .array(z.string().min(1))
          .min(1)
          .max(
            target === "objectives"
              ? 32
              : target === "resources" || target === "pptSuggestions"
                ? 15
                : 8,
          )
      : z.string().min(1).max(12000),
    label: target,
    kind: "field" as const,
  };
}

export function replaceTarget(
  content: LessonContent,
  target: string,
  value: unknown,
): LessonContent {
  const selected = revisionTarget(content, target);
  if (selected.kind === "field") {
    const goals =
      target === "objectives" && content.goals
        ? z
            .array(z.string())
            .parse(value)
            .map((text, i) => ({
              id:
                content.goals?.[i]?.id ||
                `O${Math.max(...content.goals!.map((g) => Number(g.id.slice(1)))) + i - content.goals!.length + 1}`,
              text,
            }))
        : content.goals;
    return lessonContentSchema.parse({
      ...content,
      [target]: value,
      goals,
      lessons:
        target === "objectives" && goals
          ? content.lessons?.map((l) => ({
              ...l,
              objectives: l.objectiveIds.map(
                (id, i) =>
                  goals.find((g) => g.id === id)?.text || l.objectives[i],
              ),
            }))
          : content.lessons,
    });
  }
  const updateStage = (stage: z.infer<typeof stageSchema>) => {
    if (selected.kind === "stage" && stage.id === target)
      return { ...stageSchema.parse(value), id: target };
    return {
      ...stage,
      activities: stage.activities?.map((a) =>
        a.id === target ? { ...activitySchema.parse(value), id: target } : a,
      ),
    };
  };
  return lessonContentSchema.parse(
    syncStages({
      ...content,
      lessons: content.lessons?.map((lesson) =>
        selected.kind === "lesson" && lesson.id === target
          ? { ...lessonSessionSchema.parse(value), id: target }
          : { ...lesson, stages: lesson.stages.map(updateStage) },
      ),
      stages: content.stages.map(updateStage),
    }),
  );
}

export async function reviseLesson(
  id: string,
  userId: string,
  target: string,
  instruction: string,
  expectedVersion: number,
) {
  const plan = await ownedLesson(id, userId);
  if (plan.currentVersion !== expectedVersion)
    throw new AppError("教案版本已更新，请刷新后重试。", 409);
  const info = basicInfoSchema.parse(plan.basicInfo);
  const content = lessonContentSchema.parse(plan.content);
  const selected = revisionTarget(content, target);
  const stableShape = (value: unknown) => {
    const stageShape = (s: z.infer<typeof stageSchema>) => [
      s.id,
      s.duration,
      s.kind,
      s.activities?.map((a) => [
        a.id,
        a.duration,
        a.objectiveIds,
        a.resourceIds,
        a.inputFromActivityIds,
        a.sourceBindings,
      ]),
    ];
    if (selected.kind === "lesson") {
      const l = lessonSessionSchema.parse(value);
      return JSON.stringify([
        l.id,
        l.duration,
        l.objectiveIds,
        l.stages.map(stageShape),
      ]);
    }
    if (selected.kind === "stage")
      return JSON.stringify(stageShape(stageSchema.parse(value)));
    if (selected.kind === "activity") {
      const a = activitySchema.parse(value);
      return JSON.stringify([
        a.id,
        a.duration,
        a.objectiveIds,
        a.resourceIds,
        a.inputFromActivityIds,
        a.sourceBindings,
      ]);
    }
    return "";
  };
  const schema = z
    .object({ value: selected.schema })
    .superRefine((result, ctx) => {
      if (stableShape(result.value) !== stableShape(selected.current))
        ctx.addIssue({
          code: "custom",
          message: "局部修改必须保留课时、阶段、活动 ID、时长和目标关联。",
        });
    });
  const result = await generate(
    userId,
    "lesson-plan-revision",
    {
      target,
      instruction,
      current: selected.current,
      basicInfo: info,
      design: lessonDesignSchema.parse(content),
      references: await lessonReferences(plan, info, userId),
    },
    schema,
    () => {
      const current = selected.current;
      if (selected.kind === "activity")
        return {
          value: {
            ...activitySchema.parse(current),
            teacherActions: [
              ...activitySchema.parse(current).teacherActions,
              `演示修改建议：${instruction}；请教师确认。`,
            ].slice(0, 10),
            operations: activitySchema.parse(current).operations
              ? [
                  ...activitySchema.parse(current).operations!,
                  {
                    actor: "teacher",
                    grouping: "whole_class",
                    instruction: `演示修改建议：${instruction}；请教师确认。`,
                  },
                ].slice(0, 20)
              : undefined,
          },
        };
      if (selected.kind === "stage") {
        const stage = stageSchema.parse(current);
        return {
          value: {
            ...stage,
            teacherActivities: `${stage.teacherActivities}\n演示修改建议：${instruction}。`,
            activities: stage.activities?.map((a, i) =>
              i === 0
                ? {
                    ...a,
                    teacherActions: [
                      ...a.teacherActions,
                      `演示修改建议：${instruction}；请教师确认。`,
                    ].slice(0, 10),
                    operations: a.operations
                      ? [
                          ...a.operations,
                          {
                            actor: "teacher",
                            grouping: "whole_class",
                            instruction: `演示修改建议：${instruction}；请教师确认。`,
                          },
                        ].slice(0, 20)
                      : undefined,
                  }
                : a,
            ),
          },
        };
      }
      if (selected.kind === "lesson") {
        const lesson = lessonSessionSchema.parse(current);
        return {
          value: {
            ...lesson,
            assessment: `${lesson.assessment}\n演示修改建议：${instruction}；请教师确认。`,
          },
        };
      }
      return {
        value: Array.isArray(current)
          ? [...current, `演示修改建议：${instruction}`].slice(0, 8)
          : `${current}\n演示修改建议：${instruction}。请结合本班实际确认。`,
      };
    },
  );
  const next = checkedDesignSchema(info).parse(
    replaceTarget(content, target, result.value),
  );
  return saveVersion(
    id,
    userId,
    await withEnglishDesign(userId, info, next),
    expectedVersion,
    `AI 修改：${selected.label}；${instruction.slice(0, 100)}`,
  );
}
