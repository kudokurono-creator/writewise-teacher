import { z } from "zod";

export type CanonicalNode =
  | null
  | boolean
  | number
  | string
  | CanonicalNode[]
  | { [key: string]: CanonicalNode };
const nodeSchema: z.ZodType<CanonicalNode, CanonicalNode> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(nodeSchema),
    z.record(z.string(), nodeSchema),
  ]),
);
// Only this tree owns counts, order, IDs, timings and mappings. Locale maps own text.
export const canonicalSchema = z.object({
  version: z.literal(2),
  structure: nodeSchema,
  locales: z.object({
    zh: z.record(z.string(), z.string()),
    en: z.record(z.string(), z.string()).optional(),
  }),
});
export type CanonicalPlan = z.infer<typeof canonicalSchema>;
export const referenceTypes = [
  "student_profile",
  "curriculum_standard",
  "teaching_case",
  "exercise",
  "teacher_material",
  "other",
] as const;
export const documentSelectionSchema = z.object({
  documentId: z.string().min(1),
  sourceType: z.enum(["textbook", "reference"]),
  referenceType: z.enum(referenceTypes).default("other"),
});
export type DocumentSelection = z.infer<typeof documentSelectionSchema>;
export const referenceLabels: Record<(typeof referenceTypes)[number], string> =
  {
    student_profile: "学情资料",
    curriculum_standard: "课程标准",
    teaching_case: "教学案例",
    exercise: "练习与评价",
    teacher_material: "教师材料",
    other: "其他参考",
  };
export type GenerationProgress = { phase: string; message: string };
export type ProgressReporter = (progress: GenerationProgress) => void;
