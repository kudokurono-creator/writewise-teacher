import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { classroomSchema, type KnowledgeSource } from "@/types/lesson";
import {
  applyResponsePolicy,
  factSentenceCount,
  resolveResponseIntent,
  responsePolicyPrompt,
  responsePolicyViolation,
  routeClassroomResponse,
} from "@/services/ai/response-policy";
import { groupClassroomSources } from "@/lib/classroom-sources";
import { ClassroomAnswerDetails } from "@/components/classroom-answer-details";
import { chronologicalClassroomMessages } from "@/lib/classroom-history";

describe("response routing", () => {
  it.each([
    ["高二（3）班有多少人？", "FACT"],
    ["最近一次英语阶段测评平均分是多少？", "FACT"],
    ["为什么这个班不适合全员在线协作？", "EXPLANATION"],
    ["基础薄弱学生应该提供什么支架？", "TEACHING_ADVICE"],
    ["C层学生是不是就是100分以下那11个人？", "FACT"],
    ["为什么互评最好控制在5分钟？", "EXPLANATION"],
    [
      "结合高二（3）班学情，为当前邀请信写作课设计一个5分钟同伴互评活动。",
      "ACTIVITY_DESIGN",
    ],
    ["请给我完整教学设计和45分钟流程。", "FULL_LESSON_DESIGN"],
    ["给我写一个邀请信模板。", "EXAMPLE_REQUEST"],
    ["把这个活动压缩到5分钟，并降低难度。", "ACTIVITY_DESIGN"],
    ["不要完整教案，告诉我班级有多少人，不要写作示例。", "FACT"],
    ["知识库有没有完整教案？", "FACT"],
  ])("%s → %s", (question, intent) => {
    expect(routeClassroomResponse(question).intent).toBe(intent);
  });
  it("lets the existing generation classify unclear requests and cannot enable a full lesson", () => {
    const route = routeClassroomResponse("谈谈这份材料");
    expect(route.intent).toBeNull();
    expect(resolveResponseIntent(route, "FACT")).toBe("FACT");
    expect(resolveResponseIntent(route, "FULL_LESSON_DESIGN")).toBe(
      "EXPLANATION",
    );
    expect(resolveResponseIntent(route, "EXAMPLE_REQUEST")).toBe("EXPLANATION");
    expect(responsePolicyPrompt(route)).toContain("无需额外分类调用");
  });
  it("removes generated suggestions/examples for facts even if the model asks to expand", () => {
    const result = applyResponsePolicy(
      classroomSchema.parse({
        answer: "根据《学情档案》，共有46人。",
        teachingSuggestion: "分组互评",
        examples: ["I'm writing to invite"],
        intent: "FULL_LESSON_DESIGN",
      }),
      routeClassroomResponse("这个班多少人？"),
    );
    expect(result).toMatchObject({
      intent: "FACT",
      teachingSuggestion: "",
      examples: [],
    });
  });
  it("allows detailed activity steps and explicitly requested examples", () => {
    const answer = classroomSchema.parse({
      answer:
        "目标：信息完整\n时间：1分钟示范、2分钟互评、2分钟修改\n教师：出示量规\n学生：同桌交流\n支架：时间地点表\n评价：补齐信息",
      teachingSuggestion: "聚焦1–2个评价点",
      examples: ["Please add the time."],
    });
    const route = routeClassroomResponse(
      "设计一个5分钟互评活动，并给个反馈例句。",
    );
    expect(applyResponsePolicy(answer, route).examples).toHaveLength(1);
    expect(responsePolicyViolation(answer, route)).toBeNull();
    expect(responsePolicyPrompt(route)).toContain("教师动作");
  });
  it("does not enable examples or web notices for a plain fact", () => {
    expect(routeClassroomResponse("最近一次平均分是多少？")).toMatchObject({
      includeExamples: false,
      explainWebStatus: false,
    });
    expect(
      routeClassroomResponse("请联网查找最新官方网页").explainWebStatus,
    ).toBe(true);
    expect(
      routeClassroomResponse("基础弱学生提供什么支架？不要模板。")
        .includeExamples,
    ).toBe(false);
    expect(routeClassroomResponse("为什么这个模板不适合本班？")).toMatchObject({
      intent: "EXPLANATION",
      includeExamples: false,
    });
    expect(
      routeClassroomResponse("为什么完整教学设计需要时间分配？"),
    ).toMatchObject({ intent: "EXPLANATION", allowFullLesson: false });
  });
  it("accepts short decimal facts and flags over-answering rather than truncating the evidence", () => {
    const route = routeClassroomResponse("平均分是多少？");
    expect(factSentenceCount("平均分108.6/150。最高139，最低72。")).toBe(2);
    expect(
      responsePolicyViolation(
        classroomSchema.parse({ answer: "平均分108.6/150。" }),
        route,
      ),
    ).toBeNull();
    expect(
      responsePolicyViolation(
        classroomSchema.parse({
          answer: "平均分108.6。第一句。第二句。第三句。第四句。",
        }),
        route,
      ),
    ).toContain("4句话");
  });
  it("reads legacy answers and accepts answers without forced sections", () => {
    expect(classroomSchema.parse({ answer: "46人。" })).toMatchObject({
      teachingSuggestion: "",
      examples: [],
    });
    expect(
      classroomSchema.safeParse({
        answer: "回答",
        teachingSuggestion: "旧建议",
        examples: ["旧示例"],
      }).success,
    ).toBe(true);
  });
  it("requires repair when a model tries to generate an unrequested full lesson", () => {
    expect(
      responsePolicyViolation(
        classroomSchema.parse({
          answer: "整节课方案",
          intent: "FULL_LESSON_DESIGN",
        }),
        routeClassroomResponse("谈谈这份材料"),
      ),
    ).toContain("没有请求完整教案");
    expect(
      responsePolicyViolation(
        classroomSchema.parse({
          answer: "整节课方案",
          intent: "FULL_LESSON_DESIGN",
        }),
        routeClassroomResponse("请给我完整教案"),
      ),
    ).toBeNull();
  });
});

const source = (
  documentId: string,
  chunkId: string,
  content: string,
): KnowledgeSource => ({
  documentId,
  documentName: "学情档案.txt",
  chunkId,
  content,
  excerpt: content.slice(0, 4),
  score: 0.98,
});
describe("teacher-facing references", () => {
  it("groups by document ID, keeps distinct quotations and removes repeated IDs/text", () => {
    const sources = [
      source("a", "c1", "人数46人"),
      source("a", "c2", "基础弱10人"),
      source("a", "c1", "人数46人"),
      source("a", "c3", "  基础弱10人  "),
      source("b", "c4", "人数48人"),
    ];
    const groups = groupClassroomSources(sources);
    expect(groups).toHaveLength(2);
    expect(groups[0].quotations).toEqual(["人数46人", "基础弱10人"]);
    expect(sources).toHaveLength(5); // Retrieval evidence is not mutated.
    expect(JSON.stringify(groups)).not.toMatch(/chunkId|score|index/);
  });
  it("renders one file card with collapsed citations, original-text and download links", () => {
    const html = renderToStaticMarkup(
      createElement(ClassroomAnswerDetails, {
        answer: {
          answer: "46人",
          teachingSuggestion: "",
          examples: [],
          webSources: [],
          knowledgeSources: [
            source("a", "hidden-id-1", "人数46人"),
            source("a", "hidden-id-2", "基础弱10人"),
          ],
        },
      }),
    );
    expect(html.match(/学情档案.txt/g)).toHaveLength(1);
    expect(html).toContain("命中 2 个相关片段");
    expect(html).toContain("查看引用");
    expect(html).toContain("?view=text");
    expect(html).toContain("下载文件");
    expect(html).not.toMatch(
      /<details[^>]*\bopen|知识库来源|教师讲解建议|写作示例|hidden-id|chunkId|score|index/,
    );
  });
});
describe("legacy tied chat timestamps", () => {
  it("puts a question before its reply and preserves chronological turns without mutating the input", () => {
    const now = new Date("2026-10-05T10:00:00Z");
    const messages = [
      {
        role: "assistant",
        content: "第二轮回答",
        createdAt: new Date(now.getTime() + 1000),
      },
      { role: "assistant", content: "第一轮回答", createdAt: now },
      { role: "user", content: "第一轮问题", createdAt: now },
      {
        role: "user",
        content: "第二轮问题",
        createdAt: new Date(now.getTime() + 1000),
      },
    ];
    expect(
      chronologicalClassroomMessages(messages).map((m) => m.content),
    ).toEqual(["第一轮问题", "第一轮回答", "第二轮问题", "第二轮回答"]);
    expect(messages[0].content).toBe("第二轮回答");
  });
});
