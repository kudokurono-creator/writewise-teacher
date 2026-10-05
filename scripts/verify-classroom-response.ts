/** Uses the existing real AI, embedding and retrieval providers. Deletes only
 * its temporary user/course/document/session records and uploaded file.
 * node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/verify-classroom-response.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { chromium, expect } from "@playwright/test";
import { db, json } from "../src/lib/db";
import { classroomStream } from "../src/services/ai/classroom";
import { isMockAI } from "../src/services/ai/provider";
import { sampleLesson } from "../src/services/ai/mock";
import { factSentenceCount } from "../src/services/ai/response-policy";
import { groupClassroomSources } from "../src/lib/classroom-sources";
import { uploadDocument } from "../src/services/documents/service";
import { getStorage } from "../src/services/storage/provider";
import { defaultBasic, type ClassroomAnswer } from "../src/types/lesson";
import {
  classroomProfile,
  classroomProfileName,
} from "../tests/fixtures/classroom-profile";

async function main() {
  if (isMockAI()) throw new Error("该验收要求真实模型配置。");
  const directory = "output/assistant-qa";
  await mkdir(directory, { recursive: true });
  const records: { test: string; result: string; details: unknown }[] = [];
  const user = await db.user.create({
    data: {
      email: `response-probe-${Date.now()}@local.test`,
      name: "回答策略自动验收",
      passwordHash: "probe-no-login",
    },
  });
  try {
    const info = {
      ...defaultBasic,
      title: "高二3班文化节邀请信写作",
      topic: "An Invitation to Our School Cultural Festival",
      className: "高二（3）班",
      objectives:
        "写出信息完整的邀请信，使用具体的时间地点表达，根据量规互评并修改。",
      requirements: "保留独立写作时间，关注基础薄弱学生的支架。",
    };
    const content = sampleLesson(info);
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
    const base = await db.knowledgeBase.create({
      data: { userId: user.id, name: "回答策略回归资料" },
    });
    const document = await uploadDocument(
      new File([classroomProfile], classroomProfileName, {
        type: "text/plain",
      }),
      user.id,
      base.id,
    );
    if (document.status !== "READY")
      throw new Error(`测试资料索引失败：${document.error}`);
    let sessionId: string | undefined;
    const ask = async (question: string) => {
      let answer: ClassroomAnswer | undefined;
      let error = "";
      let streamed = "";
      await classroomStream(
        user.id,
        {
          sessionId,
          lessonPlanId: plan.id,
          knowledgeBaseIds: [base.id],
          webSearch: false,
          question,
        },
        (event) => {
          const e = event as {
            type: string;
            id?: string;
            answer?: ClassroomAnswer;
            error?: string;
            text?: string;
          };
          if (e.type === "delta") streamed += e.text || "";
          if (e.type === "session") sessionId = e.id;
          if (e.type === "complete") answer = e.answer;
          if (e.type === "error") error = e.error || "回答失败";
        },
      );
      if (!answer || error) {
        await writeFile(
          `${directory}/failed-generation.json`,
          JSON.stringify({ question, error, streamed }, null, 2),
        );
        throw new Error(error || "回答未完成");
      }
      return answer;
    };
    const record = async (test: string, pass: boolean, details: unknown) => {
      records.push({ test, result: pass ? "PASS" : "FAIL", details });
      console.log(`${test}: ${pass ? "PASS" : "FAIL"}`);
      await writeFile(
        `${directory}/response-live-results.json`,
        JSON.stringify(records, null, 2),
      );
    };
    const text = (a: ClassroomAnswer) =>
      [a.answer, a.teachingSuggestion, ...a.examples].join("\n");
    const extras =
      /教师讲解建议|写作示例|活动目标|完整教案|重新核实|名册.*确认|实际名册|未(?:启用|开启).*网络|没有启用网络|本次.*网络检索/;
    const one = await ask("高二（3）班有多少人？");
    await record(
      "TEST 1 简单事实",
      /46/.test(one.answer) &&
        one.intent === "FACT" &&
        factSentenceCount(one.answer) <= 4 &&
        !extras.test(text(one)) &&
        !one.teachingSuggestion &&
        !one.examples.length &&
        one.knowledgeSources.length > 0,
      one,
    );
    const two = await ask("最近一次英语阶段测评平均分是多少？");
    await record(
      "TEST 2 平均分",
      /108\.6/.test(two.answer) &&
        !/46人|男生|女生/.test(two.answer) &&
        factSentenceCount(two.answer) <= 4 &&
        !extras.test(text(two)) &&
        !two.teachingSuggestion &&
        !two.examples.length,
      two,
    );
    const three = await ask("为什么这个班不适合全员在线协作？");
    await record(
      "TEST 3 原因分析",
      /设备|平板|电脑/.test(three.answer) &&
        !/108\.6/.test(three.answer) &&
        /手机/.test(three.answer) &&
        /纸质|投影|同桌/.test(three.answer) &&
        !/完整教案|45分钟流程/.test(text(three)) &&
        !three.teachingSuggestion,
      three,
    );
    const four = await ask("基础薄弱学生应该提供什么支架？");
    await record(
      "TEST 4 教学建议",
      /句型框架/.test(text(four)) &&
        !/全员.*在线协作/.test(four.answer) &&
        /词汇银行/.test(text(four)) &&
        /填空/.test(text(four)) &&
        /1.{0,3}2|一.{0,3}两/.test(text(four)) &&
        !/完整教案|45分钟流程/.test(text(four)),
      four,
    );
    const five = await ask("C层学生是不是就是100分以下那11个人？");
    await record(
      "TEST 5 事实推断边界",
      /(?:没有|未|不能|无法|不宜|不足以).{0,20}(?:说明|对应|等同|同一|断定|认定|确定)/.test(
        five.answer,
      ) &&
        /10/.test(five.answer) &&
        /11/.test(five.answer) &&
        !/相当一部分属于|大部分重合|大部分对应/.test(five.answer),
      five,
    );
    const six = await ask("为什么互评最好控制在5分钟？");
    const saved = await db.lessonPlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    await record(
      "TEST 6 课程优先级",
      /7\s*分钟/.test(six.answer) &&
        /5\s*分钟/.test(six.answer) &&
        /核心/.test(six.answer) &&
        six.answer.indexOf("7") < six.answer.indexOf("5") &&
        isDeepStrictEqual(saved.content, content),
      six,
    );
    const seven = await ask(
      "结合高二（3）班学情，为当前邀请信写作课设计一个5分钟同伴互评活动。",
    );
    await record(
      "TEST 7 活动设计",
      seven.intent === "ACTIVITY_DESIGN" &&
        /目标/.test(text(seven)) &&
        /5\s*分钟/.test(text(seven)) &&
        /两人|同桌|二人/.test(text(seven)) &&
        /时间|地点/.test(text(seven)) &&
        /C层|基础薄弱/.test(text(seven)) &&
        /invite|invitation|反馈句型/i.test(text(seven)) &&
        /邀请信/.test(text(seven)),
      seven,
    );
    const token = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        id: createHash("sha256").update(token).digest("hex"),
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const browser = await chromium.launch();
    try {
      const url = process.env.CLASSROOM_VERIFY_URL || "http://localhost:3000";
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      await context.addCookies([
        { name: "writewise_session", value: token, url },
      ]);
      const page = await context.newPage();
      await page.goto(`${url}/classroom?session=${sessionId}`);
      const references = page
        .locator(".assistant-turn")
        .first()
        .locator(".source-section");
      const card = references.locator(".source-item");
      await expect(card).toHaveCount(
        groupClassroomSources(one.knowledgeSources).length,
      );
      await expect(references).toContainText("参考资料");
      await expect(
        references.getByText("参考资料", { exact: true }),
      ).toBeVisible();
      await expect(card.first().locator(".source-document-title")).toHaveText(
        classroomProfileName,
      );
      await expect(
        card.first().locator(".source-quotations"),
      ).not.toHaveAttribute("open", "");
      await expect(card.first().locator("li").first()).not.toBeVisible();
      await page.screenshot({
        path: `${directory}/sources-collapsed.png`,
        fullPage: true,
      });
      await card.first().getByText("查看引用", { exact: true }).click();
      await expect(card.first().locator("li").first()).toBeVisible();
      const fullText = await context.request.get(
        `${url}/api/documents/${document.id}?view=text`,
      );
      expect(fullText.status()).toBe(200);
      expect(await fullText.text()).toContain("高二（3）班人数：46人");
      await record(
        "TEST 8 来源UI",
        !/知识库来源|chunkId|similarity score|retrieval index/.test(
          await references.innerText(),
        ),
        {
          documentCount: await card.count(),
          quotationCount: groupClassroomSources(one.knowledgeSources)[0]
            .quotations.length,
          originalTextStatus: fullText.status(),
          screenshot: `${directory}/sources-collapsed.png`,
        },
      );
    } catch (e) {
      await record(
        "TEST 8 来源UI",
        false,
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      await browser.close();
    }
    if (records.some((r) => r.result === "FAIL")) process.exitCode = 1;
  } finally {
    const files = await db.document.findMany({
      where: { userId: user.id },
      select: { storageKey: true },
    });
    for (const file of files) await getStorage().remove(file.storageKey);
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "验收失败");
  process.exitCode = 1;
});
