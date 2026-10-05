import { z } from "zod";
const text = z.string().trim().min(1).max(12000);
export const basicInfoSchema = z.object({
  title: z.string().trim().min(2, "请输入教学设计名称").max(150),
  grade: z.enum(["高一", "高二", "高三"]),
  textbook: z.string().min(1).max(150),
  unit: z.string().max(150),
  topic: z.string().min(1, "请输入写作主题").max(250),
  lessonType: z.enum([
    "应用文",
    "读后续写",
    "概要写作",
    "议论文",
    "记叙文",
    "说明文",
    "其他",
  ]),
  duration: z.number().int().min(20).max(180),
  className: z.string().max(150),
  objectives: z.string().max(4000),
  requirements: z.string().max(4000),
});
export const analysisSchema = z.object({
  theme: text,
  students: text,
  objectives: z.array(text).min(1).max(8),
  focus: text,
  difficulties: text,
  writingSkills: text,
  strategies: z.array(text).min(1).max(8),
});
export const stageSchema = z.object({
  id: z.string().min(1),
  name: text,
  duration: z.number().int().min(1).max(180),
  teacherActivities: text,
  studentActivities: text,
  purpose: text,
  materials: z.array(z.string().max(1000)).max(10),
});
export const lessonContentSchema = z.object({
  curriculumStandards: z.string().max(12000).default(""),
  designRationale: z.string().max(12000).default(""),
  textbookAnalysis: text,
  studentAnalysis: text,
  objectives: z.array(text).min(1).max(8),
  focus: text,
  difficulties: text,
  methods: z.array(text).min(1).max(8),
  resources: z.array(z.string().max(1000)).max(15),
  stages: z.array(stageSchema).min(1).max(15),
  assessment: text,
  homework: text,
  boardDesign: text,
  reflection: z.string().max(12000),
});
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
  textbook: "人教版（2019）",
  unit: "选择性必修第一册 Unit 1",
  topic: "",
  lessonType: "应用文",
  duration: 45,
  className: "",
  objectives: "",
  requirements: "",
};
export function validateDuration(content: LessonContent, duration: number) {
  if (
    content.stages.reduce((sum, stage) => sum + stage.duration, 0) !== duration
  )
    throw new Error(`教学阶段总时长需要为 ${duration} 分钟。`);
  if (new Set(content.stages.map((s) => s.id)).size !== content.stages.length)
    throw new Error("教学阶段 ID 不能重复。");
  return content;
}
