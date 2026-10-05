/** Real-provider acceptance probe. Creates only its own temporary course/user,
 * writes review evidence, and deletes those records in finally. Run with:
 * node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/verify-classroom.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { db, json } from "../src/lib/db";
import { classroomStream } from "../src/services/ai/classroom";
import { sampleLesson } from "../src/services/ai/mock";
import { exportLesson } from "../src/services/export/docx";
import { defaultBasic, type ClassroomAnswer } from "../src/types/lesson";

async function main() {
  const info = {
    ...defaultBasic,
    title: "邀请信写作——文化节",
    className: "高二（1）班",
    topic: "An Invitation to Our School Cultural Festival",
    objectives:
      "1. 学生能够识别英文邀请信的基本结构和核心信息要素。\n2. 掌握邀请、介绍活动及表达期待的常用语言。\n3. 根据真实交际情境完成内容完整、结构清晰、语言得体的英文邀请信。\n4. 根据评价标准进行自评和互评。",
    requirements:
      "突出写前分析、写中支架和写后评价；为基础较弱学生提供语言支架；设置适合能力较强学生的提升任务；最后约8分钟用于独立写作和修改。",
  };
  const content = {
    ...sampleLesson(info),
    objectives: info.objectives
      .split("\n")
      .map((s) => s.replace(/^\d+\.\s*/, "")),
    designRationale:
      "以校园文化节为真实交际情境，通过范例分析建立邀请信结构意识，以时间、地点、活动三项检查表支持基础薄弱学生，结合分层支架、独立写作和互评修订落实教学目标。",
    curriculumStandards: "",
  };
  const records: { test: string; result: string; details: unknown }[] = [];
  await mkdir("output/repair-qa", { recursive: true });
  await writeFile(
    "output/repair-qa/invitation-template-export.docx",
    await exportLesson(info, content, "验收教师"),
  );
  if (process.argv.includes("--export-only")) return;
  const user = await db.user.create({
    data: {
      email: `classroom-probe-${Date.now()}@local.test`,
      name: "自动验收",
      passwordHash: "probe-no-login",
    },
  });
  try {
    const plan = await db.lessonPlan.create({
      data: {
        userId: user.id,
        title: info.title,
        basicInfo: json(info),
        content: json(content),
        status: "READY",
        currentVersion: 1,
      },
    });
    const ask = async (
      question: string,
      webSearch = false,
      sessionId?: string,
    ) => {
      let id = sessionId;
      let answer: ClassroomAnswer | undefined;
      let error = "";
      await classroomStream(
        user.id,
        {
          lessonPlanId: plan.id,
          sessionId,
          question,
          webSearch,
          knowledgeBaseIds: [],
        },
        (event) => {
          const e = event as {
            type: string;
            id?: string;
            answer?: ClassroomAnswer;
            error?: string;
          };
          if (e.type === "session") id = e.id;
          if (e.type === "complete") answer = e.answer;
          if (e.type === "error") error = e.error || "生成失败";
        },
      );
      if (!answer || error) throw new Error(error || "未返回回答");
      return { id, answer };
    };
    const text = (a: ClassroomAnswer) =>
      [a.answer, a.teachingSuggestion, ...a.examples].join("\n");
    const record = async (name: string, pass: boolean, details: unknown) => {
      const result = pass ? "PASS" : "FAIL";
      records.push({ test: name, result, details });
      console.log(`${name}: ${result}`);
      await writeFile(
        "output/repair-qa/classroom-live-results.json",
        JSON.stringify(records, null, 2),
      );
    };
    const one = await ask(
      "根据我当前这节课，给我设计一个8分钟的写作练习，并说明它对应哪个教学目标。",
    );
    await record(
      "TEST 1 当前课程识别",
      /邀请信/.test(text(one.answer)) &&
        /8\s*分钟/.test(text(one.answer)) &&
        /目标/.test(text(one.answer)) &&
        !/没有提供.*(?:课题|年级|目标)/.test(text(one.answer)),
      one,
    );
    const round1 = await ask("给我设计一个同伴互评活动。");
    const round2 = await ask(
      "把这个活动压缩到5分钟，并降低难度。",
      false,
      round1.id,
    );
    const round3 = await ask(
      "再给基础薄弱学生加一个语言支架。",
      false,
      round1.id,
    );
    await record(
      "TEST 2 多轮活动修改",
      /5\s*分钟/.test(text(round2.answer)) &&
        /invite|invitation/i.test(text(round3.answer)) &&
        !/In conclusion|I think/i.test(text(round3.answer)),
      { round1, round2, round3 },
    );
    const three = await ask(
      "学生写邀请信时总是漏掉活动时间和地点，我现在课堂上应该怎么处理？",
    );
    await record(
      "TEST 3 临场处理",
      /时间/.test(text(three.answer)) &&
        /地点/.test(text(three.answer)) &&
        !/请.*(?:提供|告知).*(?:年级|写作类型|课时时长)/.test(
          text(three.answer),
        ),
      three,
    );
    const query =
      "帮我查找教育部官方发布的普通高中英语课程标准，并给我官方网页来源。";
    const forbidden =
      /knowledgeContext|webContext|searchContext|currentCourseContext|system prompt|tool call|retrieval result|\brouter\b/i;
    const four = await ask(query);
    await record(
      "TEST 4 联网关闭",
      four.answer.webSources.length === 0 &&
        !/https?:\/\//.test(text(four.answer)) &&
        /未.*(?:启用|开启)|没有.*(?:启用|检索)|关闭|无法.*核实/.test(
          text(four.answer),
        ) &&
        !forbidden.test(text(four.answer)),
      four,
    );
    const five = await ask(query, true);
    const links = [];
    for (const source of five.answer.webSources) {
      try {
        const response = await fetch(source.url, {
          signal: AbortSignal.timeout(20000),
        });
        links.push({ url: source.url, status: response.status });
      } catch {
        links.push({ url: source.url, status: 0 });
      }
    }
    await record(
      "TEST 5 联网官方来源",
      five.answer.webSources.length > 0 &&
        five.answer.webSources.every(
          (s) =>
            (new URL(s.url).hostname.endsWith(".moe.gov.cn") ||
              new URL(s.url).hostname === "moe.gov.cn") &&
            /普通高中/.test(s.title) &&
            /课程标准/.test(s.title) &&
            !/实验/.test(s.title),
        ) &&
        /https?:\/\//.test(text(five.answer)) &&
        links.every((l) => l.status >= 200 && l.status < 400),
      { ...five, links },
    );
    const six = await ask(query, false);
    const session = await db.chatSession.findUniqueOrThrow({
      where: { id: six.id },
      include: { messages: true },
    });
    await record(
      "TEST 6 Session Isolation",
      six.id !== five.id &&
        six.answer.webSources.length === 0 &&
        !/https?:\/\//.test(text(six.answer)) &&
        session.messages.length === 2 &&
        session.lessonPlanId === plan.id &&
        !forbidden.test(text(six.answer)),
      six,
    );
    if (records.some((r) => r.result === "FAIL")) process.exitCode = 1;
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "验收失败");
  process.exitCode = 1;
});
