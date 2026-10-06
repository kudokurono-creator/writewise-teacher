import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { prompts, buildTeachingContext } from "@/prompts";
import {
  operationSchema,
  type BasicInfo,
  type LessonContent,
  type LessonDesign,
} from "@/types/lesson";
import { z } from "zod";
import type { ProgressReporter } from "@/types/canonical";
import type { DocumentSelection } from "@/types/canonical";
import { getAIProvider, isMockAI } from "./provider";
import type { AIProvider } from "./types";
import { generate } from "./service";
import {
  designSkeletonSchema,
  generatedDesignSchema,
  richActivitySchema,
  validateDesign,
  applyRepairs,
  repairSchema,
  type DesignIssue,
} from "./design-validation";

export async function repairDesign(
  candidate: unknown,
  info: BasicInfo,
  repair: (candidate: unknown, issues: DesignIssue[]) => Promise<unknown>,
  progress?: ProgressReporter,
  sources?: DocumentSelection[],
  schemaOverride?: z.ZodType<LessonDesign>,
) {
  let current = candidate;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (schemaOverride) current = projectObjectives(current);
    progress?.({ phase: "timing", message: "正在核对各课时时间分配…" });
    const result = validateDesign(current, info, true, sources, schemaOverride);
    progress?.({
      phase: "objectives",
      message: "正在核对目标映射、活动输入和资源绑定…",
    });
    if (!result.hard.length && result.design)
      return {
        ...result.design,
        qualitySuggestions: result.soft.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      };
    console.warn(
      "[lesson-design-validation]",
      JSON.stringify({ attempt, issues: result.hard }),
    );
    if (attempt === 2)
      throw new AppError(
        `部分结构尚未调整完成：${result.hard
          .slice(0, 3)
          .map((i) => `${i.message}（预期 ${i.expected}，实际 ${i.actual}）`)
          .join("；")}。请检查本次课时配置后重试。`,
        502,
      );
    progress?.({
      phase: "repair",
      message: "检测到部分结构问题，正在自动调整…",
    });
    const patches = repairSchema.parse(await repair(current, result.hard));
    try {
      current = applyRepairs(current, result.hard, patches.patches);
    } catch (error) {
      throw new AppError(
        `自动调整未完成：${error instanceof Error ? error.message : "修复字段无效"}。已保留原有内容，请重试。`,
        502,
      );
    }
  }
  throw new AppError("教案未完成校验。", 502);
}
function projectObjectives(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return candidate;
  const data = candidate as Record<string, unknown>;
  const goals = z
    .array(z.object({ id: z.string(), text: z.string() }))
    .safeParse(data.goals).data;
  if (!goals) return candidate;
  return {
    ...data,
    objectives: goals.map((g) => g.text),
    lessons: Array.isArray(data.lessons)
      ? data.lessons.map((l) => {
          if (!l || typeof l !== "object" || Array.isArray(l)) return l;
          const lesson = l as Record<string, unknown>,
            ids = z.array(z.string()).safeParse(lesson.objectiveIds).data;
          return ids
            ? {
                ...lesson,
                objectives: ids.map(
                  (id) =>
                    goals.find((g) => g.id === id)?.text || "目标引用待修复",
                ),
              }
            : l;
        })
      : data.lessons,
  };
}
export async function generateValidatedDesign(
  userId: string,
  info: BasicInfo,
  input: unknown,
  mock: () => unknown,
  progress?: ProgressReporter,
  sources?: DocumentSelection[],
): Promise<LessonContent> {
  const provider: AIProvider = getAIProvider(),
    start = Date.now();
  let status = "SUCCESS",
    inputTokens = 0,
    outputTokens = 0;
  try {
    progress?.({
      phase: "structure",
      message: "正在组织独立课时、学习产出和承接关系…",
    });
    const candidate = isMockAI()
      ? mock()
      : await (async () => {
          const messages = [
            {
              role: "system" as const,
              content: `${prompts["lesson-plan-generation"]}本轮只规划共同字段、各课时目标/板书/产出、Step摘要与计时，不输出activities。goals为唯一目标文本源，各课时只输出objectiveIds；objectives数组由系统从goals派生，无需重复。双课时必须提供完整lessonConnection对象五个字段。不要复制顶层stages。保留已确认分析，先形成时间严格正确的结构。`,
            },
            { role: "user" as const, content: buildTeachingContext(input) },
          ];
          const skeletonSchema =
            info.lessonMode === "double"
              ? designSkeletonSchema.extend({
                  lessonConnection:
                    designSkeletonSchema.shape.lessonConnection.unwrap(),
                })
              : designSkeletonSchema;
          const inputSchema = skeletonSchema.omit({ objectives: true }).extend({
            lessons: z
              .array(
                skeletonSchema.shape.lessons.element.omit({ objectives: true }),
              )
              .min(1)
              .max(12),
          });
          const result = provider.generateCandidate
            ? await provider.generateCandidate(messages, inputSchema)
            : await provider.generateStructured(messages, inputSchema);
          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;
          const repair = (current: unknown, issues: DesignIssue[]) =>
            generate(
              userId,
              "lesson-plan-repair",
              {
                current,
                issues,
                expectedSchema: z.toJSONSchema(skeletonSchema, { io: "input" }),
              },
              repairSchema,
              () => {
                throw new Error("需要配置模型。");
              },
            );
          const skeleton = await repairDesign(
            result.data,
            info,
            repair,
            undefined,
            sources,
            skeletonSchema,
          );
          const activityInput = richActivitySchema.omit({
            id: true,
            teacherActions: true,
            studentActions: true,
            inputFromActivityIds: true,
          });
          const jobs = skeleton.lessons!.flatMap((lesson, li) =>
            lesson.stages.map((stage, si) => ({ lesson, li, stage, si })),
          );
          const details: unknown[] = new Array(jobs.length);
          let cursor = 0;
          await Promise.all(
            Array.from({ length: Math.min(3, jobs.length) }, async () => {
              while (cursor < jobs.length) {
                const index = cursor++,
                  job = jobs[index],
                  previous = jobs[index - 1];
                progress?.({
                  phase: "activities",
                  message: `正在细化第 ${job.li + 1} 课时 · ${job.stage.name} 的操作、问题与评价…`,
                });
                const stageMessages = [
                  {
                    role: "system" as const,
                    content: `${prompts["lesson-plan-generation"]}本轮只细化所选Step的一项完整activity。保留已规划时长与目标，不能创建或改其他Step。operations按真实师生行动顺序组织，teacherActions/studentActions由系统派生，无需重复。明确消费previousOutput，形成当前output，写具体问题、预期回应、反馈与支架。sourceBindings用已给documentId；直接教学只能scope=teaching且sourceType教材，案例/参考只能background或practice。`,
                  },
                  {
                    role: "user" as const,
                    content: buildTeachingContext({
                      context: input,
                      goals: skeleton.goals,
                      lesson: {
                        id: job.lesson.id,
                        title: job.lesson.title,
                        objectives: job.lesson.objectives,
                        objectiveIds: job.lesson.objectiveIds,
                        duration: job.lesson.duration,
                        assessment: job.lesson.assessment,
                      },
                      step: job.stage,
                      previousOutput: previous
                        ? {
                            step: previous.stage.name,
                            summary: previous.stage.studentActivities,
                            lessonOutcome: previous.lesson.learningOutcome,
                          }
                        : null,
                      nextStep: jobs[index + 1]?.stage.name,
                      teachingMaterials: skeleton.teachingMaterials,
                      sources,
                    }),
                  },
                ];
                const result = provider.generateCandidate
                  ? await provider.generateCandidate(
                      stageMessages,
                      z.object({ activity: activityInput }),
                    )
                  : await provider.generateStructured(
                      stageMessages,
                      z.object({ activity: activityInput }),
                    );
                inputTokens += result.inputTokens;
                outputTokens += result.outputTokens;
                const raw =
                  result.data &&
                  typeof result.data === "object" &&
                  !Array.isArray(result.data)
                    ? (result.data as Record<string, unknown>).activity
                    : undefined;
                const data =
                  raw && typeof raw === "object" && !Array.isArray(raw)
                    ? (raw as Record<string, unknown>)
                    : {};
                const operations =
                  z.array(operationSchema).safeParse(data.operations).data ||
                  [];
                details[index] = {
                  ...data,
                  id: `${job.stage.id}-activity-1`,
                  inputFromActivityIds: previous
                    ? [`${previous.stage.id}-activity-1`]
                    : [],
                  teacherActions: operations
                    .filter((op) => op.actor === "teacher")
                    .map((op) => op.instruction),
                  studentActions: operations
                    .filter((op) => op.actor === "students")
                    .map((op) => op.instruction),
                };
              }
            }),
          );
          // The final validator sees raw fields and repairs only the reported paths.
          let index = 0;
          return {
            ...skeleton,
            stages: [],
            lessons: skeleton.lessons!.map((lesson) => ({
              ...lesson,
              stages: lesson.stages.map((stage) => ({
                ...stage,
                activities: [details[index++]],
              })),
            })),
          };
        })();
    progress?.({
      phase: "activities",
      message: "各课时活动已展开，正在检查完整性…",
    });
    return await repairDesign(
      candidate,
      info,
      (current, issues) =>
        generate(
          userId,
          "lesson-plan-repair",
          {
            current,
            issues,
            expectedSchema: z.toJSONSchema(generatedDesignSchema, {
              io: "input",
            }),
          },
          repairSchema,
          () => {
            throw new Error("演示生成内容未通过校验。");
          },
        ),
      progress,
      sources,
    );
  } catch (error) {
    status = "FAILED";
    throw error;
  } finally {
    await db.aIRequestLog.create({
      data: {
        userId,
        feature: "lesson-plan-generation",
        model: provider.model,
        latency: Date.now() - start,
        status,
        inputTokens,
        outputTokens,
      },
    });
  }
}
