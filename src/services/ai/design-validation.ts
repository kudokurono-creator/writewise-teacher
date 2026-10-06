import { z } from "zod";
import {
  activitySchema,
  lessonDesignSchema,
  lessonSessionSchema,
  stageSchema,
  getLessonDurations,
  syncStages,
  type BasicInfo,
  type LessonDesign,
} from "@/types/lesson";
import type { DocumentSelection } from "@/types/canonical";

export type DesignIssue = {
  severity: "hard" | "soft";
  code: string;
  path: string;
  lessonNumber?: number;
  stageId?: string;
  activityId?: string;
  field: string;
  expected: string | number;
  actual: string | number;
  message: string;
  repairPaths: string[];
};
export const richActivitySchema = activitySchema.extend({
  operations: activitySchema.shape.operations.unwrap(),
  resourceIds: activitySchema.shape.resourceIds.unwrap(),
  output: activitySchema.shape.output.unwrap(),
  sourceBindings: activitySchema.shape.sourceBindings.unwrap(),
});
export const generatedDesignSchema = lessonDesignSchema.extend({
  stages: z.array(stageSchema).default([]),
  goals: lessonDesignSchema.shape.goals.unwrap(),
  displayInfo: lessonDesignSchema.shape.displayInfo.unwrap(),
  teachingMaterials: lessonDesignSchema.shape.teachingMaterials.unwrap().min(1),
  lessons: z
    .array(
      lessonSessionSchema.extend({
        lessonNumber: z.number().int().positive(),
        keyPoints: z.string().min(1),
        difficultPoints: z.string().min(1),
        learningOutcome: z.string().min(1),
        blackboardDesign: lessonSessionSchema.shape.blackboardDesign.unwrap(),
        stages: z
          .array(
            stageSchema.extend({
              kind: stageSchema.shape.kind.unwrap(),
              activities: z.array(richActivitySchema).min(1).max(10),
            }),
          )
          .min(1)
          .max(15),
      }),
    )
    .min(1)
    .max(12),
});
export const designSkeletonSchema = generatedDesignSchema.extend({
  lessons: z
    .array(
      generatedDesignSchema.shape.lessons.element.extend({
        stages: z
          .array(
            stageSchema
              .omit({ activities: true })
              .extend({ kind: stageSchema.shape.kind.unwrap() }),
          )
          .min(1)
          .max(15),
      }),
    )
    .min(1)
    .max(12),
});
export function validateDesign(
  candidate: unknown,
  info: BasicInfo,
  rich = true,
  sources?: DocumentSelection[],
  schemaOverride?: z.ZodType<LessonDesign>,
): { design?: LessonDesign; hard: DesignIssue[]; soft: DesignIssue[] } {
  const hard: DesignIssue[] = [],
    soft: DesignIssue[] = [];
  const schema =
    schemaOverride || (rich ? generatedDesignSchema : lessonDesignSchema);
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    const raw =
      candidate && typeof candidate === "object"
        ? (candidate as Record<string, unknown>)
        : {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      const value = issue.path.reduce<unknown>(
        (v, k) =>
          v && typeof v === "object"
            ? (v as Record<string, unknown>)[String(k)]
            : undefined,
        raw,
      );
      const li =
        issue.path[0] === "lessons" && typeof issue.path[1] === "number"
          ? issue.path[1]
          : undefined;
      hard.push({
        severity: "hard",
        code: "schema",
        path,
        lessonNumber: li === undefined ? undefined : li + 1,
        field: String(issue.path.at(-1) || "plan"),
        expected: issue.message,
        actual:
          value === undefined ? "缺失" : JSON.stringify(value).slice(0, 160),
        message: `字段 ${path || "教案"}：${issue.message}`,
        repairPaths: [path],
      });
    }
    return { hard, soft };
  }
  const design = syncStages(parsed.data);
  const durations = getLessonDurations(info);
  const goalIds =
    design.goals?.map((g) => g.id) ||
    design.objectives.map((_, i) => `O${i + 1}`);
  const resources = new Set(design.teachingMaterials?.map((m) => m.id));
  const seen = new Set<string>();
  const add = (
    code: string,
    path: string,
    expected: string | number,
    actual: string | number,
    message: string,
    location: Partial<DesignIssue> = {},
    repairPaths = [path],
  ) =>
    hard.push({
      severity: "hard",
      code,
      path,
      field: path.split(".").at(-1)!,
      expected,
      actual,
      message,
      repairPaths,
      ...location,
    });
  const unique = (
    id: string,
    path: string,
    location: Partial<DesignIssue> = {},
  ) => {
    if (seen.has(id))
      add("duplicate-id", path, "唯一 ID", id, `ID ${id} 重复。`, location);
    seen.add(id);
  };
  goalIds.forEach((id, i) => unique(id, `goals.${i}.id`));
  if (
    design.goals &&
    JSON.stringify(design.goals.map((g) => g.text)) !==
      JSON.stringify(design.objectives)
  )
    add(
      "goal-text",
      "objectives",
      "与 goals 文本一致",
      "不一致",
      "整体目标文本与目标记录不一致。",
    );
  const lessons = design.lessons || [
    {
      id: "lesson-1",
      title: info.title,
      duration: info.duration,
      stages: design.stages,
      objectives: design.objectives,
      objectiveIds: goalIds,
      assessment: design.assessment,
      output: "",
      homework: design.homework,
      resources: design.resources,
    },
  ];
  if (lessons.length !== durations.length)
    add(
      "lesson-count",
      "lessons",
      durations.length,
      lessons.length,
      "课时数量与教学模式不一致。",
    );
  if (lessons.length > 1 && !design.lessonConnection)
    add(
      "connection",
      "lessonConnection",
      "课时衔接",
      "缺失",
      "连续课时需要提供衔接关系。",
    );
  const activityPositions = new Map<string, number>();
  let position = 0;
  lessons.forEach((l) =>
    l.stages.forEach((s) =>
      s.activities?.forEach((a) => activityPositions.set(a.id, position++)),
    ),
  );
  position = 0;
  lessons.forEach((lesson, li) => {
    const base = design.lessons ? `lessons.${li}` : "";
    const loc = { lessonNumber: li + 1 };
    unique(lesson.id, `${base}.id`, loc);
    if (design.lessons && rich && lesson.lessonNumber !== li + 1)
      add(
        "lesson-number",
        `${base}.lessonNumber`,
        li + 1,
        lesson.lessonNumber || "缺失",
        "课时序号必须与顺序一致。",
        loc,
      );
    if (lesson.duration !== durations[li])
      add(
        "lesson-duration",
        `${base}.duration`,
        durations[li],
        lesson.duration,
        `第 ${li + 1} 课时时长应为 ${durations[li]} 分钟，实际 ${lesson.duration} 分钟。`,
        loc,
      );
    const total = lesson.stages.reduce((sum, s) => sum + s.duration, 0);
    if (total !== durations[li])
      add(
        "lesson-total",
        `${base}.stages`,
        durations[li],
        total,
        `第 ${li + 1} 课时各 Step 合计应为 ${durations[li]} 分钟，实际 ${total} 分钟。`,
        loc,
        lesson.stages.flatMap((s, si) => [
          `${base}.stages.${si}.duration`,
          ...(s.activities || []).map(
            (_, ai) => `${base}.stages.${si}.activities.${ai}.duration`,
          ),
        ]),
      );
    if (lesson.objectives.length !== lesson.objectiveIds.length)
      add(
        "goal-count",
        `${base}.objectives`,
        lesson.objectiveIds.length,
        lesson.objectives.length,
        "课时目标与 ID 必须一一对应。",
        loc,
      );
    if (lesson.objectiveIds.some((id) => !goalIds.includes(id)))
      add(
        "objective-ref",
        `${base}.objectiveIds`,
        goalIds.join(","),
        lesson.objectiveIds.join(","),
        "课时关联了不存在的教学目标。",
        loc,
      );
    if (rich && !lesson.stages.some((s) => s.kind === "homework"))
      add(
        "homework-step",
        `${base}.stages`,
        "独立计时 Homework Step",
        "缺失",
        `第 ${li + 1} 课时缺少计时的作业布置环节。`,
        loc,
        [`${base}.stages`],
      );
    lesson.stages.forEach((stage, si) => {
      const sp = base ? `${base}.stages.${si}` : `stages.${si}`;
      const sloc = { ...loc, stageId: stage.id };
      unique(stage.id, `${sp}.id`, sloc);
      const sum = stage.activities?.reduce((n, a) => n + a.duration, 0);
      if (sum !== undefined && Math.abs(sum - stage.duration) > 1)
        add(
          "activity-total",
          `${sp}.activities`,
          stage.duration,
          sum,
          `第 ${li + 1} 课时 ${stage.name} 的活动总时长应为 ${stage.duration} 分钟，实际 ${sum} 分钟。`,
          sloc,
          [
            `${sp}.duration`,
            ...(stage.activities || []).map(
              (_, ai) => `${sp}.activities.${ai}.duration`,
            ),
          ],
        );
      if (
        sum !== undefined &&
        sum !== stage.duration &&
        Math.abs(sum - stage.duration) <= 1
      )
        soft.push({
          severity: "soft",
          code: "timing-tolerance",
          path: sp,
          field: "duration",
          expected: stage.duration,
          actual: sum,
          message: "活动计时有 1 分钟组织转换差异，可在实施时微调。",
          repairPaths: [],
          ...sloc,
        });
      stage.activities?.forEach((activity, ai) => {
        const ap = `${sp}.activities.${ai}`;
        const aloc = { ...sloc, activityId: activity.id };
        unique(activity.id, `${ap}.id`, aloc);
        if (
          activity.objectiveIds.some(
            (id) => !goalIds.includes(id) || !lesson.objectiveIds.includes(id),
          )
        )
          add(
            "objective-ref",
            `${ap}.objectiveIds`,
            lesson.objectiveIds.join(","),
            activity.objectiveIds.join(","),
            `第 ${li + 1} 课时 ${stage.id}/${activity.id} 关联了不存在的教学目标或其他课时目标。`,
            aloc,
          );
        if (activity.resourceIds?.some((id) => !resources.has(id)))
          add(
            "resource-ref",
            `${ap}.resourceIds`,
            [...resources].join(","),
            activity.resourceIds.join(","),
            "活动绑定了不存在的课堂材料。",
            aloc,
          );
        if (sources?.some((s) => s.sourceType === "textbook")) {
          if (!activity.sourceBindings?.length)
            add(
              "source-binding",
              `${ap}.sourceBindings`,
              "明确的教材/参考资料绑定",
              "缺失",
              "活动需注明实际授课范围内的教材依据。",
              aloc,
            );
          activity.sourceBindings?.forEach((binding, bi) => {
            const source = sources.find(
              (s) => s.documentId === binding.documentId,
            );
            if (
              !source ||
              (binding.purpose === "direct" &&
                (source.sourceType !== "textbook" ||
                  binding.scope !== "teaching"))
            )
              add(
                "scope-binding",
                `${ap}.sourceBindings.${bi}`,
                "教材 + teaching 用于直接教学",
                JSON.stringify(binding),
                "参考案例或单元背景不能作为直接教授内容。",
                aloc,
              );
          });
        }
        if (
          activity.inputFromActivityIds?.some(
            (id) =>
              !activityPositions.has(id) ||
              activityPositions.get(id)! >= position,
          )
        )
          add(
            "input-ref",
            `${ap}.inputFromActivityIds`,
            "此前活动 ID",
            activity.inputFromActivityIds.join(","),
            "活动输入必须引用此前已产生的学习产出。",
            aloc,
          );
        position++;
        if (
          activity.duration > 20 ||
          activity.successCriteria.every((c) => c.length < 8) ||
          activity.evidence.length < 8
        )
          soft.push({
            severity: "soft",
            code: "quality",
            path: ap,
            field: "assessment",
            expected: "可观察的具体证据",
            actual: "建议优化",
            message: `${activity.title}：可细化评价依据或拆分较长活动。`,
            repairPaths: [],
            ...aloc,
          });
      });
    });
    if (lesson.assessment.length < 15)
      soft.push({
        severity: "soft",
        code: "assessment",
        path: `${base}.assessment`,
        field: "assessment",
        expected: "具体标准与证据",
        actual: lesson.assessment,
        message: `第 ${li + 1} 课时评价可补充作品证据与具体标准；仍可查看和导出。`,
        repairPaths: [],
        ...loc,
      });
    const linked = new Set(
      lesson.stages.flatMap((s) =>
        (s.activities || []).flatMap((a) => a.objectiveIds),
      ),
    );
    lesson.objectiveIds
      .filter((id) => !linked.has(id))
      .forEach((id) =>
        soft.push({
          severity: "soft",
          code: "objective-coverage",
          path: `${base}.objectiveIds`,
          field: "objectiveIds",
          expected: "目标对应活动与证据",
          actual: id,
          message: `第 ${li + 1} 课时尚无活动明确关联 ${id}，建议补充学习证据。`,
          repairPaths: [],
          ...loc,
        }),
      );
    lesson.objectives.forEach((objective, i) => {
      if (
        objective.length < 12 ||
        (objective.length < 25 &&
          (objective.includes("提高") || objective.includes("提升")))
      )
        soft.push({
          severity: "soft",
          code: "objective-wording",
          path: `${base}.objectives.${i}`,
          field: "objectives",
          expected: "可观察的学习行为",
          actual: objective,
          message: `第 ${li + 1} 课时目标 ${lesson.objectiveIds[i]} 可细化为可观察的学习行为与评价依据。`,
          repairPaths: [],
          ...loc,
        });
    });
    if (li > 0) {
      const priorIds = new Set(
        lessons[li - 1].stages.flatMap((s) =>
          (s.activities || []).map((a) => a.id),
        ),
      );
      if (
        !lesson.stages.some((s) =>
          s.activities?.some((a) =>
            a.inputFromActivityIds?.some((id) => priorIds.has(id)),
          ),
        )
      )
        soft.push({
          severity: "soft",
          code: "continuity",
          path: base,
          field: "inputFromActivityIds",
          expected: "调用前一课时产出",
          actual: "尚未明确",
          message: `第 ${li + 1} 课时可更明确地调用前一课时的学习产出。`,
          repairPaths: [],
          ...loc,
        });
    }
  });
  return { design, hard, soft };
}
export const repairSchema = z.object({
  patches: z
    .array(z.object({ path: z.string().min(1), valueJson: z.string().min(1) }))
    .min(1)
    .max(80),
});
export function applyRepairs(
  candidate: unknown,
  issues: DesignIssue[],
  patches: z.infer<typeof repairSchema>["patches"],
): unknown {
  const next: unknown = structuredClone(candidate);
  const permitted = issues.flatMap((i) => i.repairPaths);
  for (const patch of patches) {
    if (!permitted.includes(patch.path))
      throw new Error(`自动修复越界：${patch.path}`);
    const keys = patch.path.split(".");
    if (keys.some((k) => ["__proto__", "constructor", "prototype"].includes(k)))
      throw new Error("修复字段无效。");
    let parent = next;
    for (const key of keys.slice(0, -1)) {
      if (!parent || typeof parent !== "object")
        throw new Error(`修复路径不存在：${patch.path}`);
      parent = (parent as Record<string, unknown>)[key];
    }
    if (!parent || typeof parent !== "object")
      throw new Error(`修复路径不存在：${patch.path}`);
    const key = keys.at(-1)!;
    const existing = (parent as Record<string, unknown>)[key];
    const value: unknown = JSON.parse(patch.valueJson);
    if (
      existing &&
      typeof existing === "object" &&
      issues.some(
        (i) => i.code === "homework-step" && i.repairPaths.includes(patch.path),
      )
    ) {
      if (
        !Array.isArray(existing) ||
        !Array.isArray(value) ||
        value.length !== existing.length + 1 ||
        existing.some(
          (item, i) => JSON.stringify(item) !== JSON.stringify(value[i]),
        )
      )
        throw new Error("缺少作业环节时只能追加，不能改写已有正确环节。");
    }
    const ids = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.flatMap(ids)
        : v && typeof v === "object"
          ? Object.entries(v).flatMap(([k, child]) =>
              k === "id" && typeof child === "string" ? [child] : ids(child),
            )
          : [];
    const beforeIds = ids(existing),
      afterIds = ids(value);
    const addingHomework =
      issues.some(
        (i) => i.code === "homework-step" && i.repairPaths.includes(patch.path),
      ) && beforeIds.every((id, i) => afterIds[i] === id);
    if (
      (key === "id" && existing !== undefined && existing !== value) ||
      (!addingHomework &&
        JSON.stringify(beforeIds) !== JSON.stringify(afterIds) &&
        existing !== undefined)
    )
      throw new Error("自动修复不得改变已有 ID。");
    (parent as Record<string, unknown>)[key] = value;
  }
  return next;
}
