import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  defaultBasic,
  emptyClassProfile,
  basicInfoSchema,
  lessonContentSchema,
  validateDuration,
  assertMatchingVersions,
  syncStages,
  getLessons,
  type BasicInfo,
} from "@/types/lesson";
import {
  sampleAnalysis,
  sampleLesson,
  sampleLegacyLesson,
  sampleEnglishDesign,
  sampleMaterialAnalysis,
  sampleReflection,
} from "@/services/ai/mock";
import { checkedDesignSchema, replaceTarget } from "@/services/ai/lesson-plan";
import { textbookExcerpt } from "@/services/ai/material-context";
import {
  buildCourseContext,
  buildClassroomMessages,
} from "@/services/ai/course-context";
import { exportLesson } from "@/services/export/docx";
import { prompts } from "@/prompts";

const info: BasicInfo = {
  ...defaultBasic,
  title: "教材读写课",
  topic: "Space Exploration",
  unit: "Unit 4",
  teachingScope: "P44–45 · Reading for Writing",
  referenceScope: "Entire Unit 4",
  lessonType: "议论文",
};
describe("textbook-based course design", () => {
  it("CASE 1: generates a 45-minute single lesson with executable activities", () => {
    const content = checkedDesignSchema(info, true).parse(sampleLesson(info));
    validateDuration(content, info);
    expect(content.lessons).toHaveLength(1);
    expect(
      content
        .lessons![0].stages.flatMap((s) => s.activities || [])
        .reduce((sum, a) => sum + a.duration, 0),
    ).toBe(45);
    expect(
      content.lessons![0].stages[0].activities![0].teacherActions.join(" "),
    ).toContain(info.teachingScope);
    expect(
      content.teachingMaterials!.find((m) => m.id === "rubric")!.content,
    ).toContain("证据");
  });
  it.each([
    [40, 45],
    [45, 45],
    [45, 50],
    [180, 180],
  ])(
    "CASE 2: validates independent %i + %i minute lessons",
    (first, second) => {
      const basic = basicInfoSchema.parse({
        ...info,
        lessonMode: "double",
        lessonDurations: [first, second],
        duration: first + second,
      });
      const content = checkedDesignSchema(basic, true).parse(
        sampleLesson(basic),
      );
      content.lessons!.forEach((lesson, i) =>
        expect(
          lesson.stages
            .flatMap((s) => s.activities || [])
            .reduce((sum, a) => sum + a.duration, 0),
        ).toBe([first, second][i]),
      );
      expect(content.lessonConnection!.firstLessonOutput).toBe(
        content.lessons![0].output,
      );
      expect(content.lessons![1].stages[0].activities![0].connection).toContain(
        "第一课时",
      );
      const english = sampleEnglishDesign(basic, content);
      expect(() => assertMatchingVersions(content, english)).not.toThrow();
      validateDuration(english, basic);
    },
  );
  it("CASE 3: does not fabricate unit facts for partial material", () => {
    const analysis = sampleMaterialAnalysis(info);
    expect(analysis.unitGoals).toEqual([]);
    expect(analysis.priorLearning).toContain("待教师确认");
    expect(analysis.unitStructure).toContain("待教师确认");
    expect(analysis.currentScope).toBe(info.teachingScope);
    expect(prompts["lesson-plan-generation"]).toContain("不得擅自扩大");
  });
  it("CASE 4: reuses the confirmed class profile without guessing missing details", () => {
    const profile = {
      ...emptyClassProfile,
      className: "高二（3）班",
      reading: "能定位明确信息",
      writing: "需要篇章衔接支持",
    };
    const analysis = sampleAnalysis({
      ...info,
      classProfile: profile,
      classProfileId: "class-1",
    });
    expect(analysis.students).toContain(profile.reading);
    expect(analysis.students).toContain(profile.writing);
    expect(analysis.students).toContain("待教师确认");
  });
  it("CASE 5: legacy content remains readable, editable and translatable", () => {
    const old = sampleLegacyLesson(info);
    const parsed = lessonContentSchema.parse(old);
    expect(parsed.lessons).toBeUndefined();
    expect(getLessons(parsed, info)).toHaveLength(1);
    validateDuration(parsed, info);
    const next = replaceTarget(parsed, "stage-1", {
      ...parsed.stages[0],
      teacherActivities: "旧教案局部修改",
    });
    expect(next.stages[0].teacherActivities).toBe("旧教案局部修改");
    expect(next.stages.slice(1)).toEqual(parsed.stages.slice(1));
    expect(() =>
      assertMatchingVersions(parsed, sampleEnglishDesign(info, parsed)),
    ).not.toThrow();
  });
  it("rejects double lesson shape, stage timing, activity timing and objective mismatches", () => {
    const basic: BasicInfo = {
      ...info,
      lessonMode: "double",
      lessonDurations: [40, 45],
      duration: 85,
    };
    expect(basicInfoSchema.safeParse({ ...basic, duration: 90 }).success).toBe(
      false,
    );
    expect(
      basicInfoSchema.safeParse({ ...basic, lessonDurations: [45] }).success,
    ).toBe(false);
    const content = sampleLesson(basic);
    const corrupt = structuredClone(content);
    corrupt.lessons![0].stages[0].activities![0].duration += 3;
    expect(() => validateDuration(syncStages(corrupt), basic)).toThrow(
      "活动总时长",
    );
    const unknown = structuredClone(content);
    unknown.lessons![0].stages[0].activities![0].objectiveIds = ["O8"];
    expect(() => validateDuration(syncStages(unknown), basic)).toThrow(
      "不存在的教学目标",
    );
    expect(() => validateDuration(content, info)).toThrow("课时数量");
  });
  it("activity and lesson revisions leave unrelated Chinese content intact", () => {
    const basic: BasicInfo = {
      ...info,
      lessonMode: "double",
      lessonDurations: [45, 50],
      duration: 95,
    };
    const source = sampleLesson(basic);
    const activity = source.lessons![1].stages[0].activities![0];
    const next = replaceTarget(source, activity.id, {
      ...activity,
      evidence: "新的学习证据",
    });
    expect(next.lessons![0]).toEqual(source.lessons![0]);
    expect(next.lessons![1].stages.slice(1)).toEqual(
      source.lessons![1].stages.slice(1),
    );
    expect(
      next.stages.find((s) => s.id === source.lessons![1].stages[0].id)!
        .activities![0].evidence,
    ).toBe("新的学习证据");
    validateDuration(next, basic);
    const after = replaceTarget(next, "lesson-2", {
      ...next.lessons![1],
      assessment: "仅修改第二课时评价",
    });
    expect(after.lessons![0]).toEqual(source.lessons![0]);
    expect(after.assessment).toBe(source.assessment);
  });
  it("rejects omitted or retimed English activities and preserves revised array lengths", () => {
    const source = sampleLesson(info);
    source.lessons![0].stages[0].activities![0].teacherActions.push(
      "教师新增的操作",
    );
    const chinese = syncStages(source);
    const english = sampleEnglishDesign(info, chinese);
    assertMatchingVersions(chinese, english);
    english.lessons![0].stages[0].activities![0].teacherActions.pop();
    expect(() => assertMatchingVersions(chinese, syncStages(english))).toThrow(
      "不一致",
    );
  });
  it("provides explicit unit boundaries and marks truncated references", () => {
    expect(
      textbookExcerpt("Unit 1\nA\nUnit 2\nB\nUnit 3\nC", {
        ...info,
        unit: "Unit 2",
      }).text,
    ).toContain("B");
    expect(
      textbookExcerpt("Unit 1\nA\nUnit 2\nB\nUnit 3\nC", {
        ...info,
        unit: "Unit 2",
      }).text,
    ).not.toContain("Unit 3");
    expect(textbookExcerpt("long text ".repeat(50), info, 20).truncated).toBe(
      true,
    );
  });
  it("classroom and reflection distinguish the two lessons and their connection", () => {
    const basic: BasicInfo = {
      ...info,
      lessonMode: "double",
      lessonDurations: [40, 45],
      duration: 85,
    };
    const source = sampleLesson(basic);
    const course = buildCourseContext(
      {
        id: "plan",
        title: basic.title,
        basicInfo: basic,
        analysis: sampleAnalysis(basic),
        content: source,
      },
      "lesson-2",
    );
    expect(course.currentLessonDuration).toBe(45);
    expect(course.stages![0].name).toBe(source.lessons![1].stages[0].name);
    const messages = buildClassroomMessages({
      course,
      history: [],
      sources: [],
      webSources: [],
      webSearch: false,
      question: "第二课时如何调用第一课时产出？",
    });
    expect(messages[1].content).toContain("两课时衔接");
    const report = sampleReflection(
      "第一课时完成资源表，第二课时未充分使用。",
      basic.topic,
      source.lessons,
    );
    expect(report.lessonReports!.map((l) => l.lessonId)).toEqual([
      "lesson-1",
      "lesson-2",
    ]);
    expect(report.continuityAnalysis).toContain("资源表");
  });
  it("exports complete English and Chinese Word documents using the retained template", async () => {
    const source = sampleLesson(info);
    source.english = sampleEnglishDesign(info, source);
    const en = await JSZip.loadAsync(
      await exportLesson(info, source, "Teacher", "en"),
    );
    const zh = await JSZip.loadAsync(
      await exportLesson(info, source, "教师", "zh"),
    );
    const enXml = await en.file("word/document.xml")!.async("string");
    const zhXml = await zh.file("word/document.xml")!.async("string");
    expect(enXml).toContain("Activities");
    expect(enXml).toContain("Teaching Aims");
    expect(enXml).toContain("Question");
    expect(enXml).toContain("Peer Assessment Rubric");
    expect(enXml).toContain("P44–45");
    const visibleText = [...enXml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)]
      .map((m) => m[1])
      .join(" ");
    expect(visibleText.match(/[\u3400-\u9fff]+/g)).toBeNull();
    expect(zhXml).toContain("课堂教学设计表");
    expect(zhXml).toContain("学习证据");
    expect(enXml).not.toContain("{{");
    await expect(
      exportLesson(info, sampleLegacyLesson(info), "Teacher", "en"),
    ).rejects.toThrow("英文版尚未生成");
  });
});
