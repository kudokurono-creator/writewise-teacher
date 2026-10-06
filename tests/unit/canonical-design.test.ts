import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import {
  defaultBasic,
  basicInfoSchema,
  stageSchema,
  type BasicInfo,
} from "@/types/lesson";
import {
  sampleAnalysis,
  sampleLesson,
  sampleLegacyLesson,
} from "@/services/ai/mock";
import {
  makeCanonical,
  renderCanonical,
  canonicalProjections,
  assertCanonicalProjections,
} from "@/lib/canonical-plan";
import {
  validateDesign,
  applyRepairs,
  designSkeletonSchema,
} from "@/services/ai/design-validation";
import { repairDesign } from "@/services/ai/design-generation";
import { applyAnalysisDialogue } from "@/services/ai/lesson-plan";
import { translationSchema } from "@/services/ai/bilingual";
import { exportLesson } from "@/services/export/docx";
import { lessonReferences } from "@/services/ai/material-context";
import { resolveClassProfile } from "@/services/ai/class-profile";
import { prompts } from "@/prompts";
vi.mock("@/services/documents/service", () => ({
  referenceDocuments: async () => [],
}));
const info: BasicInfo = {
  ...defaultBasic,
  title: "教材任务",
  topic: "School Festival",
  teachingScope: "P20–22",
  referenceScope: "Entire Unit 2",
  lessonType: "应用文",
};
const double: BasicInfo = {
  ...info,
  lessonMode: "double",
  lessonDurations: [45, 45],
  duration: 90,
};
describe("canonical teaching design acceptance", () => {
  it("persists the displayed whole-unit reference scope when left at its default", async () => {
    const resolved = await resolveClassProfile(
      { ...info, unit: "Unit 2", referenceScope: "", referenceWholeUnit: true },
      "teacher",
    );
    expect(resolved.referenceScope).toBe("整个 Unit 2");
    const currentOnly = await resolveClassProfile(
      { ...info, referenceScope: "", referenceWholeUnit: false },
      "teacher",
    );
    expect(currentOnly.referenceScope).toBe(info.teachingScope);
  });
  it("derives root and lesson objective text from the single goal registry", async () => {
    const source = sampleLesson(double);
    const skeleton = {
      ...source,
      stages: [],
      objectives: ["重复的模型文本"],
      lessons: source.lessons!.map((l) => ({
        ...l,
        objectives: ["错误的重复数组"],
        stages: l.stages.map((s) =>
          stageSchema.omit({ activities: true }).parse(s),
        ),
      })),
    };
    const repair = vi.fn(async () => ({ patches: [] }));
    const result = await repairDesign(
      skeleton,
      double,
      repair,
      undefined,
      undefined,
      designSkeletonSchema,
    );
    expect(repair).not.toHaveBeenCalled();
    expect(result.objectives).toEqual(source.goals!.map((g) => g.text));
    result.lessons!.forEach((l) =>
      expect(l.objectives).toEqual(
        l.objectiveIds.map(
          (id) => source.goals!.find((g) => g.id === id)!.text,
        ),
      ),
    );
  });
  it("1: optional metadata accepts a three-page file-first configuration", () => {
    expect(
      basicInfoSchema.parse({
        ...defaultBasic,
        workflowVersion: 2,
        textbook: "",
        unit: "",
        teachingScope: "uploaded three pages",
      }).textbook,
    ).toBe("");
  });
  it("2: textbook, knowledge-base profile and standards retain separate roles", async () => {
    const references = await lessonReferences(
      {
        references: [
          {
            sourceType: "textbook",
            referenceType: "other",
            document: {
              id: "book",
              name: "3pages.txt",
              text: "P20–22\nText task",
            },
          },
          {
            sourceType: "reference",
            referenceType: "student_profile",
            document: {
              id: "profile",
              name: "class.txt",
              text: "学生需要语言支架",
            },
          },
          {
            sourceType: "reference",
            referenceType: "curriculum_standard",
            document: {
              id: "standard",
              name: "standard.txt",
              text: "标准要求",
            },
          },
        ],
      },
      info,
      "teacher",
    );
    expect(references.map((r) => [r.sourceType, r.referenceType])).toEqual([
      ["textbook", "other"],
      ["reference", "student_profile"],
      ["reference", "curriculum_standard"],
    ]);
    expect(references[1].coverage).toContain("参考资料");
  });
  it("3: a case or whole-unit reference cannot bind direct teaching content", () => {
    const content = sampleLesson(info);
    content.lessons!.forEach((l) =>
      l.stages.forEach((s) =>
        s.activities?.forEach((a) => {
          a.sourceBindings = [
            { documentId: "book", scope: "teaching", purpose: "direct" },
          ];
        }),
      ),
    );
    content.lessons![0].stages[0].activities![0].sourceBindings = [
      { documentId: "case", scope: "reference", purpose: "direct" },
    ];
    expect(
      validateDesign(content, info, true, [
        { documentId: "book", sourceType: "textbook", referenceType: "other" },
        {
          documentId: "case",
          sourceType: "reference",
          referenceType: "teaching_case",
        },
      ]).hard.find((i) => i.code === "scope-binding")?.activityId,
    ).toBe("stage-1-activity-1");
    expect(prompts["lesson-plan-generation"]).toContain("案例不得覆盖");
  });
  it("4: one lesson is exactly 45 minutes including the Homework Step", () => {
    const result = validateDesign(sampleLesson(info), info);
    expect(result.hard).toEqual([]);
    expect(
      result.design!.lessons![0].stages.reduce((n, s) => n + s.duration, 0),
    ).toBe(45);
    expect(result.design!.lessons![0].stages.at(-1)!.kind).toBe("homework");
  });
  it("5: double lessons are independent, progressive and consume prior outputs", () => {
    const content = sampleLesson(double);
    expect(validateDesign(content, double).hard).toEqual([]);
    expect(
      content.lessons!.map((l) => l.stages.reduce((n, s) => n + s.duration, 0)),
    ).toEqual([45, 45]);
    expect(content.lessons![0].keyPoints).not.toBe(
      content.lessons![1].keyPoints,
    );
    expect(content.lessons![0].objectives).not.toEqual(
      content.lessons![1].objectives,
    );
    expect(
      content.lessons![1].stages[0].activities![0].inputFromActivityIds,
    ).toEqual(["homework-1-activity"]);
  });
  it("7: dialogue changes only the second lesson and preserves common analysis", () => {
    const previous = sampleAnalysis(double),
      second = previous.lessons![1];
    const next = applyAnalysisDialogue(previous, second.id, {
      lesson: { ...second, coreContent: "第二课时增加衔接支架" },
    });
    expect(next.lessons![0]).toEqual(previous.lessons![0]);
    expect(next.materialAnalysis).toEqual(previous.materialAnalysis);
    expect(next.lessons![1].coreContent).toContain("支架");
    expect(() =>
      applyAnalysisDialogue(previous, second.id, {
        lesson: { ...second, duration: 50 },
      }),
    ).toThrow("时长");
  });
  it("8: language dictionaries cannot change lesson, operation, checklist or timing structure", () => {
    const canonical = makeCanonical(sampleLesson(double));
    canonical.locales.en = Object.fromEntries(
      Object.entries(canonical.locales.zh).map(([id, text]) => [
        id,
        `Translated: ${text}`,
      ]),
    );
    const zh = renderCanonical(canonical, "zh"),
      en = renderCanonical(canonical, "en");
    const neutral = (v: unknown): unknown =>
      typeof v === "string"
        ? v.startsWith("Translated:")
          ? v.slice(12)
          : v
        : Array.isArray(v)
          ? v.map(neutral)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, item]) => [k, neutral(item)]),
              )
            : v;
    expect(neutral(en)).toEqual(neutral(zh));
    const content = canonicalProjections(canonical);
    assertCanonicalProjections(content);
    content.english!.lessons![0].duration = 50;
    expect(() => assertCanonicalProjections(content)).toThrow("共享");
    expect(
      translationSchema(["text1"]).safeParse({
        texts: [{ id: "changed", text: "English" }],
      }).success,
    ).toBe(false);
  });
  it("9: 50 vs 45 minutes gives a precise error and repairs only timings", async () => {
    const source = sampleLesson(double),
      invalid = structuredClone(source);
    const stage = invalid.lessons![0].stages[3];
    stage.duration += 5;
    stage.activities![0].duration += 5;
    const issue = validateDesign(invalid, double).hard.find(
      (i) => i.code === "lesson-total",
    )!;
    expect([issue.lessonNumber, issue.expected, issue.actual]).toEqual([
      1, 45, 50,
    ]);
    const repair = vi.fn(async () => ({
      patches: [
        {
          path: "lessons.0.stages.3.duration",
          valueJson: String(source.lessons![0].stages[3].duration),
        },
        {
          path: "lessons.0.stages.3.activities.0.duration",
          valueJson: String(
            source.lessons![0].stages[3].activities![0].duration,
          ),
        },
      ],
    }));
    const next = await repairDesign(invalid, double, repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(next.lessons).toEqual(source.lessons);
  });
  it("10: nonexistent O4 is located and only the mapping is repaired", async () => {
    const source = sampleLesson(info),
      invalid = structuredClone(source);
    invalid.lessons![0].stages[0].activities![0].objectiveIds = ["O4"];
    const issues = validateDesign(invalid, info).hard;
    expect(issues[0]).toMatchObject({
      code: "objective-ref",
      lessonNumber: 1,
      stageId: "stage-1",
      activityId: "stage-1-activity-1",
      field: "objectiveIds",
      actual: "O4",
    });
    const next = await repairDesign(invalid, info, async () => ({
      patches: [{ path: issues[0].path, valueJson: '["O1"]' }],
    }));
    expect(next.lessons).toEqual(source.lessons);
    expect(() =>
      applyRepairs(invalid, issues, [
        { path: "lessons.0.title", valueJson: '"rewrite"' },
      ]),
    ).toThrow("越界");
  });
  it("11: a soft assessment suggestion still allows viewing and Word export", async () => {
    const source = sampleLesson(info);
    source.lessons![0].assessment = "观察表现";
    const result = validateDesign(source, info);
    expect(result.hard).toEqual([]);
    expect(result.soft.some((i) => i.code === "assessment")).toBe(true);
    const bytes = await exportLesson(info, source);
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });
  it("12–14: operations, two-column export, writing chain/checklist and per-lesson board are complete", async () => {
    const source = sampleLesson(double),
      lesson = source.lessons![1],
      activity = lesson.stages[0].activities![0];
    expect(activity.operations?.some((op) => op.actor === "teacher")).toBe(
      true,
    );
    expect(activity.operations?.some((op) => op.actor === "students")).toBe(
      true,
    );
    expect(activity.questions[0].question).toBeTruthy();
    expect(activity.scaffolds).not.toHaveLength(0);
    expect(lesson.stages.map((s) => s.name).join(" ")).toContain("Plan");
    expect(lesson.stages.map((s) => s.name).join(" ")).toContain("Write");
    expect(lesson.stages.map((s) => s.name).join(" ")).toContain("Review");
    expect(lesson.blackboardDesign!.sections.length).toBeGreaterThan(2);
    const xml = await (
      await JSZip.loadAsync(await exportLesson(double, source))
    )
      .file("word/document.xml")!
      .async("string");
    const table = xml.match(
      /<w:tbl\b[^>]*>(?:(?!<w:tbl\b)[\s\S])*?Activities(?:(?!<w:tbl\b)[\s\S])*?<\/w:tbl>/,
    )![0];
    expect((table.match(/<w:gridCol /g) || []).length).toBe(2);
    expect(table).toContain("Teaching Aims");
    expect(table).toContain("评价检查清单");
    expect(table).toContain("语言支架");
    expect(table).toContain("Homework");
  });
  it("retains legacy designs and bounds repair attempts to two", async () => {
    expect(validateDesign(sampleLegacyLesson(info), info, false).hard).toEqual(
      [],
    );
    const invalid = sampleLesson(info);
    invalid.lessons![0].stages[0].activities![0].objectiveIds = ["O4"];
    const repair = vi.fn(async () => ({
      patches: [
        {
          path: "lessons.0.stages.0.activities.0.objectiveIds",
          valueJson: '["O4"]',
        },
      ],
    }));
    await expect(repairDesign(invalid, info, repair)).rejects.toThrow("预期");
    expect(repair).toHaveBeenCalledTimes(2);
  });
});
