import { z } from "zod";
import { canonicalSchema } from "./canonical";
const text = z.string().trim().min(1).max(12000);
export const classProfileSchema = z.object({
  grade: z.enum(["高一", "高二", "高三"]),
  className: z.string().trim().min(1).max(150),
  size: z.number().int().min(1).max(200).optional(),
  level: z.string().max(4000),
  reading: z.string().max(4000),
  writing: z.string().max(4000),
  problems: z.string().max(4000),
  strengths: z.string().max(4000),
  differentiation: z.string().max(4000),
  habits: z.string().max(4000),
  notes: z.string().max(4000),
  documentIds: z.array(z.string()).max(15),
});
export type ClassProfile = z.infer<typeof classProfileSchema>;
export type ClassProfileRecord = { id: string; profile: ClassProfile };
export const emptyClassProfile: ClassProfile = {
  grade: "高二",
  className: "",
  level: "",
  reading: "",
  writing: "",
  problems: "",
  strengths: "",
  differentiation: "",
  habits: "",
  notes: "",
  documentIds: [],
};
export const basicInfoSchema = z
  .object({
    title: z.string().trim().max(150),
    grade: z.enum(["高一", "高二", "高三"]),
    textbook: z.string().max(150),
    unit: z.string().max(150),
    topic: z.string().max(250),
    lessonType: z.enum([
      "应用文",
      "读后续写",
      "概要写作",
      "议论文",
      "记叙文",
      "说明文",
      "其他",
    ]),
    duration: z.number().int().min(20).max(360),
    className: z.string().max(150),
    objectives: z.string().max(4000),
    requirements: z.string().max(4000),
    lessonMode: z.enum(["single", "double"]).optional(),
    lessonDurations: z
      .array(z.number().int().min(20).max(180))
      .max(2)
      .optional(),
    teachingScope: z.string().max(1000).optional(),
    referenceScope: z.string().max(1000).optional(),
    referenceWholeUnit: z.boolean().optional(),
    classProfileId: z.string().optional(),
    classProfile: classProfileSchema.optional(),
    workflowVersion: z.literal(2).optional(),
  })
  .superRefine((info, ctx) => {
    const durations = getLessonDurations(info);
    if (info.lessonMode !== "double" && info.duration > 180)
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: "单课时时长不能超过 180 分钟。",
      });
    if (
      info.lessonMode === "double" &&
      durations.reduce((sum, n) => sum + n, 0) !== info.duration
    )
      ctx.addIssue({
        code: "custom",
        path: ["duration"],
        message: "双课时总时长应等于两个课时之和。",
      });
    if (info.lessonMode === "double" && info.lessonDurations?.length !== 2)
      ctx.addIssue({
        code: "custom",
        path: ["lessonDurations"],
        message: "双课时需要分别配置两个课时的时长。",
      });
    if (
      info.lessonMode !== "double" &&
      info.lessonDurations &&
      (info.lessonDurations.length !== 1 ||
        info.lessonDurations[0] !== info.duration)
    )
      ctx.addIssue({
        code: "custom",
        path: ["lessonDurations"],
        message: "单课时配置应与课时时长一致。",
      });
  });
export const materialAnalysisSchema = z.object({
  unitTheme: text,
  unitGoals: z.array(text).max(8),
  unitStructure: text,
  currentScope: text,
  currentScopeRole: text,
  priorLearning: text,
  nextLearning: text,
  contentAnalysis: text,
  transferableResources: z.array(text).max(12),
  lessonSplitSuggestion: z.array(text).max(12),
  continuity: text,
  uncertainties: z.array(text).max(12),
});
export type MaterialAnalysis = z.infer<typeof materialAnalysisSchema>;
export const lessonAnalysisSchema = z.object({
  id: z.string().min(1),
  lessonNumber: z.number().int().positive(),
  duration: z.number().int().min(20).max(180),
  title: text,
  topic: text,
  objectives: z.array(text).min(1).max(32),
  coreContent: text,
  keyPoints: text,
  difficultPoints: text,
  textbookTask: text,
  expectedOutcome: text,
  previousConnection: z.string().max(12000),
  nextConnection: z.string().max(12000),
});
export const analysisSchema = z.object({
  theme: text,
  students: text,
  objectives: z.array(text).min(1).max(32),
  focus: text,
  difficulties: text,
  writingSkills: text,
  strategies: z.array(text).min(1).max(8),
  materialAnalysis: materialAnalysisSchema.optional(),
  lessons: z.array(lessonAnalysisSchema).min(1).max(12).optional(),
  sequenceRationale: text.optional(),
  inferredInfo: z
    .object({
      title: text,
      textbook: z.string().max(150),
      unit: z.string().max(150),
      topic: text,
      lessonType: basicInfoSchema.shape.lessonType,
    })
    .optional(),
});
export const operationSchema = z.object({
  actor: z.enum(["teacher", "students"]),
  grouping: z.enum(["individual", "pair", "group", "whole_class"]),
  instruction: text,
});
export const activitySchema = z.object({
  id: z.string().min(1),
  title: text,
  duration: z.number().int().min(1).max(180),
  objectiveIds: z
    .array(z.string().regex(/^O[1-9]\d*$/))
    .min(1)
    .max(32),
  teacherActions: z.array(text).min(1).max(20),
  studentActions: z.array(text).min(1).max(20),
  questions: z
    .array(z.object({ question: text, expectedResponse: text, followUp: text }))
    .max(8),
  teachingAim: text,
  materials: z.array(text).max(10),
  scaffolds: z.array(text).max(8),
  differentiation: text,
  evidence: text,
  successCriteria: z.array(text).min(1).max(8),
  connection: text,
  operations: z.array(operationSchema).min(2).max(20).optional(),
  resourceIds: z.array(z.string()).max(15).optional(),
  inputFromActivityIds: z.array(z.string()).max(15).optional(),
  output: text.optional(),
  sourceBindings: z
    .array(
      z.object({
        documentId: z.string().min(1),
        scope: z.enum(["teaching", "reference"]),
        purpose: z.enum(["direct", "background", "practice"]),
      }),
    )
    .max(15)
    .optional(),
});
export type LessonActivity = z.infer<typeof activitySchema>;
export const stageSchema = z.object({
  id: z.string().min(1),
  name: text,
  duration: z.number().int().min(1).max(180),
  teacherActivities: text,
  studentActivities: text,
  purpose: text,
  materials: z.array(z.string().max(1000)).max(10),
  activities: z.array(activitySchema).min(1).max(10).optional(),
  kind: z.enum(["teaching", "homework"]).optional(),
});
export const lessonSessionSchema = z.object({
  id: z.string().min(1),
  lessonNumber: z.number().int().positive().optional(),
  title: text,
  duration: z.number().int().min(20).max(180),
  objectives: z.array(text).min(1).max(32),
  objectiveIds: z
    .array(z.string().regex(/^O[1-9]\d*$/))
    .min(1)
    .max(32),
  stages: z.array(stageSchema).min(1).max(15),
  assessment: text,
  resources: z.array(text).max(15),
  output: text,
  homework: text,
  keyPoints: text.optional(),
  difficultPoints: text.optional(),
  learningOutcome: text.optional(),
  blackboardDesign: z
    .object({
      title: text,
      sections: z
        .array(z.object({ heading: text, lines: z.array(text).min(1).max(12) }))
        .min(1)
        .max(8),
      connections: z.array(text).max(8),
    })
    .optional(),
});
export type LessonSession = z.infer<typeof lessonSessionSchema>;
export const displayInfoSchema = z.object({
  title: text,
  grade: text,
  className: z.string().max(1000),
  textbook: text,
  unit: z.string().max(1000),
  topic: text,
  lessonType: text,
  teachingScope: z.string().max(1000),
  referenceScope: z.string().max(1000),
});
export const lessonDesignSchema = z.object({
  curriculumStandards: z.string().max(12000).default(""),
  designRationale: z.string().max(12000).default(""),
  textbookAnalysis: text,
  studentAnalysis: text,
  objectives: z.array(text).min(1).max(32),
  goals: z
    .array(z.object({ id: z.string().regex(/^O[1-9]\d*$/), text }))
    .min(1)
    .max(32)
    .optional(),
  focus: text,
  difficulties: text,
  methods: z.array(text).min(1).max(8),
  resources: z.array(z.string().max(1000)).max(15),
  stages: z.array(stageSchema).min(1).max(30),
  assessment: text,
  homework: text,
  boardDesign: text,
  reflection: z.string().max(12000),
  lessons: z.array(lessonSessionSchema).min(1).max(12).optional(),
  lessonConnection: z
    .object({
      priorLearning: text,
      firstLessonOutput: text,
      secondLessonInput: text,
      transition: text,
      sharedGoal: text,
    })
    .optional(),
  materialAnalysis: materialAnalysisSchema.optional(),
  teachingMaterials: z
    .array(z.object({ id: z.string().min(1), title: text, content: text }))
    .max(15)
    .optional(),
  pptSuggestions: z.array(text).max(15).optional(),
  displayInfo: displayInfoSchema.optional(),
});
// Legacy language views are projections of canonical for new designs.
export const lessonContentSchema = lessonDesignSchema.extend({
  english: lessonDesignSchema.optional(),
  canonical: canonicalSchema.optional(),
  qualitySuggestions: z
    .array(z.object({ path: z.string(), message: text }))
    .optional(),
});
export type LessonDesign = z.input<typeof lessonDesignSchema>;
export const classroomIntents = [
  "FACT",
  "EXPLANATION",
  "TEACHING_ADVICE",
  "ACTIVITY_DESIGN",
  "FULL_LESSON_DESIGN",
  "EXAMPLE_REQUEST",
] as const;
export type ClassroomIntent = (typeof classroomIntents)[number];
export const classroomSchema = z.object({
  answer: text,
  teachingSuggestion: z.string().trim().max(12000).default(""),
  examples: z.array(text).max(8).default([]),
  // Optional to keep persisted conversations and compatible providers readable.
  intent: z.enum(classroomIntents).optional(),
});
export const reflectionSchema = z.object({
  overall: text,
  goalAchievement: text,
  activityAnalysis: text,
  participation: text,
  timeAllocation: text,
  writingDevelopment: text,
  studentFeedback: text,
  problems: z.array(text).max(10),
  suggestions: z.array(text).min(1).max(10),
  nextLesson: text,
  lessonReports: z
    .array(
      z.object({
        lessonId: z.string(),
        title: text,
        goalAchievement: text,
        activityAnalysis: text,
        timeAllocation: text,
        evidence: text,
        suggestions: z.array(text).min(1).max(8),
      }),
    )
    .max(12)
    .optional(),
  continuityAnalysis: z.string().max(12000).optional(),
});
export type BasicInfo = z.infer<typeof basicInfoSchema>;
export type LessonAnalysis = z.infer<typeof analysisSchema>;
// Optional in stored legacy versions; parsing supplies empty values.
export type LessonContent = z.input<typeof lessonContentSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type ReflectionReport = z.infer<typeof reflectionSchema>;
export type KnowledgeSource = {
  documentId: string;
  documentName: string;
  chunkId: string;
  content: string;
  excerpt: string;
  score: number;
};
export type WebSource = { title: string; url: string; content: string };
export type ClassroomAnswer = z.infer<typeof classroomSchema> & {
  knowledgeSources: KnowledgeSource[];
  webSources: WebSource[];
  searchNotice?: string;
};
export const defaultBasic: BasicInfo = {
  title: "",
  grade: "高二",
  textbook: "",
  unit: "",
  topic: "",
  lessonType: "其他",
  duration: 45,
  className: "",
  objectives: "",
  requirements: "",
  lessonMode: "single",
  teachingScope: "",
  referenceScope: "",
  referenceWholeUnit: true,
};
export function getLessonDurations(info: {
  lessonMode?: string;
  lessonDurations?: number[];
  duration: number;
}) {
  return info.lessonMode === "double"
    ? info.lessonDurations || []
    : [info.duration];
}
export function getLessons(
  content: LessonDesign,
  info: BasicInfo,
): LessonSession[] {
  return (
    content.lessons || [
      {
        id: "lesson-1",
        title: info.title,
        duration: info.duration,
        objectives: content.objectives,
        objectiveIds: content.objectives.map((_, i) => `O${i + 1}`),
        stages: content.stages,
        assessment: content.assessment,
        resources: content.resources,
        output: "",
        homework: content.homework,
      },
    ]
  );
}
export function syncStages<T extends LessonDesign>(content: T): T {
  return content.lessons
    ? { ...content, stages: content.lessons.flatMap((l) => l.stages) }
    : content;
}
export function validateDuration(
  content: LessonContent,
  input: number | BasicInfo,
) {
  const durations =
    typeof input === "number" ? [input] : getLessonDurations(input);
  const lessons = content.lessons;
  if (lessons && lessons.length !== durations.length)
    throw new Error("课时数量与教学模式不一致。");
  if (!lessons && durations.length === 2)
    throw new Error("双课时必须包含两个独立课时。");
  const ids = new Set<string>();
  if (new Set(content.stages.map((s) => s.id)).size !== content.stages.length)
    throw new Error("教学阶段 ID 不能重复。");
  const validateStages = (
    stages: Stage[],
    duration: number,
    objectiveIds?: string[],
  ) => {
    const total = stages.reduce((sum, stage) => sum + stage.duration, 0);
    if (total !== duration)
      throw new Error(
        `教学阶段总时长需要为 ${duration} 分钟，实际 ${total} 分钟。`,
      );
    for (const stage of stages) {
      if (ids.has(stage.id)) throw new Error("教学阶段或活动 ID 不能重复。");
      ids.add(stage.id);
      if (stage.activities) {
        if (
          Math.abs(
            stage.activities.reduce((sum, a) => sum + a.duration, 0) -
              stage.duration,
          ) > 1
        )
          throw new Error(
            `阶段“${stage.name}”的活动总时长需要为 ${stage.duration} 分钟。`,
          );
        for (const a of stage.activities) {
          if (ids.has(a.id)) throw new Error("教学阶段或活动 ID 不能重复。");
          ids.add(a.id);
          if (
            a.objectiveIds.some(
              (id) =>
                !(
                  content.goals?.map((g) => g.id) ||
                  content.objectives.map((_, i) => `O${i + 1}`)
                ).includes(id),
            )
          )
            throw new Error("活动关联了不存在的教学目标。");
          if (
            objectiveIds &&
            a.objectiveIds.some((id) => !objectiveIds.includes(id))
          )
            throw new Error("活动目标必须属于当前课时的教学目标。");
        }
      }
    }
  };
  if (lessons) {
    if (new Set(lessons.map((l) => l.id)).size !== lessons.length)
      throw new Error("课时 ID 不能重复。");
    lessons.forEach((l) => ids.add(l.id));
    lessons.forEach((lesson, i) => {
      if (lesson.duration !== durations[i])
        throw new Error(`第 ${i + 1} 课时时长需要为 ${durations[i]} 分钟。`);
      if (
        lesson.objectiveIds.some(
          (id) =>
            !(
              content.goals?.map((g) => g.id) ||
              content.objectives.map((_, i) => `O${i + 1}`)
            ).includes(id),
        )
      )
        throw new Error("课时关联了不存在的教学目标。");
      if (lesson.objectives.length !== lesson.objectiveIds.length)
        throw new Error("课时目标与目标 ID 需要一一对应。");
      validateStages(lesson.stages, durations[i], lesson.objectiveIds);
    });
    if (
      JSON.stringify(content.stages) !==
      JSON.stringify(lessons.flatMap((l) => l.stages))
    )
      throw new Error("教学过程与课时内容不一致。");
    if (lessons.length === 2 && !content.lessonConnection)
      throw new Error("双课时需要提供课时衔接设计。");
  } else validateStages(content.stages, durations[0]);
  return content;
}
export function assertMatchingVersions(
  chinese: LessonDesign,
  english: LessonDesign,
) {
  const shape = (design: LessonDesign) => ({
    objectives: design.objectives.length,
    stages: design.stages.map((s) => [
      s.id,
      s.duration,
      s.materials.length,
      s.activities?.map((a) => [
        a.id,
        a.duration,
        a.objectiveIds,
        a.teacherActions.length,
        a.studentActions.length,
        a.questions.length,
        a.materials.length,
        a.scaffolds.length,
        a.successCriteria.length,
      ]),
    ]),
    lessons: design.lessons?.map((l) => [
      l.id,
      l.duration,
      l.objectiveIds,
      l.objectives.length,
      l.stages.map((s) => s.id),
    ]),
    materials: design.teachingMaterials?.map((m) => m.id),
    connection: Boolean(design.lessonConnection),
    resources: design.resources.length,
    methods: design.methods.length,
    slides: design.pptSuggestions?.length,
    materialAnalysis: design.materialAnalysis
      ? [
          design.materialAnalysis.unitGoals.length,
          design.materialAnalysis.transferableResources.length,
          design.materialAnalysis.lessonSplitSuggestion.length,
          design.materialAnalysis.uncertainties.length,
        ]
      : undefined,
  });
  if (JSON.stringify(shape(chinese)) !== JSON.stringify(shape(english)))
    throw new Error("中英文教案的课时、活动、目标或资源结构不一致。");
}
