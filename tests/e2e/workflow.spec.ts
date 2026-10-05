import { test, expect } from "@playwright/test";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { exportLesson } from "../../src/services/export/docx";
import { defaultBasic } from "../../src/types/lesson";
import { sampleLesson } from "../../src/services/ai/mock";
import { getStorage } from "../../src/services/storage/provider";
import {
  classroomProfile,
  classroomProfileName,
} from "../fixtures/classroom-profile";
const stamp = `${Date.now()}`;
const email = `e2e-${stamp}@teacher.test`;
test.beforeAll(async () => {
  await mkdir("output", { recursive: true });
  const info = {
    ...defaultBasic,
    title: "学生写作样例",
    topic: "An invitation",
  };
  await writeFile(
    "output/student-reference.docx",
    await exportLesson(info, sampleLesson(info)),
  );
});
test.afterAll(async () => {
  const db = new PrismaClient();
  const documents = await db.document.findMany({
    where: {
      user: {
        email: { endsWith: "@teacher.test" },
        name: { startsWith: "验收" },
      },
    },
    select: { storageKey: true },
  });
  for (const document of documents)
    await getStorage().remove(document.storageKey);
  await db.user.deleteMany({
    where: {
      email: { endsWith: "@teacher.test" },
      name: { startsWith: "验收" },
    },
  });
  await db.$disconnect();
});
test("MVP1 browser workflow plus classroom, reflection and responsive pages", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("教师姓名").fill("验收教师");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill("Teacher2026!");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page
    .getByRole("link", { name: "新建教学设计", exact: true })
    .first()
    .click();
  await page.getByLabel("教学设计名称").fill("验收课：校园文化节邀请信");
  await page
    .getByLabel("写作主题")
    .fill("An invitation to our English festival");
  await page.getByLabel("班级", { exact: true }).fill("高二（3）班");
  await page.getByRole("button", { name: "保存并选择资料" }).click();
  await expect(
    page.getByRole("heading", { name: "让 AI 了解你的教材与学生" }),
  ).toBeVisible();
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      "tests/fixtures/student-profile.pdf",
      "output/student-reference.docx",
    ]);
  await expect(page.getByText("已选择 2 份资料", { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.getByRole("button", { name: "开始教学分析", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "先确认教学分析" }),
  ).toBeVisible();
  await page
    .getByLabel("学情分析", { exact: true })
    .fill(
      "参考学情资料后确认：学生能表达邀请意图，需要补充时间、地点并调整语域。",
    );
  await page.getByRole("button", { name: "接受分析并继续" }).click();
  await page
    .getByRole("button", { name: "生成完整教学设计", exact: true })
    .click();
  await expect(page).toHaveURL(/lesson-plans\//);
  const lessonUrl = page.url();
  const openedId = new URL(lessonUrl).pathname.split("/").pop();
  await expect(
    page.getByRole("link", { name: "课中助教", exact: true }),
  ).toHaveAttribute("href", `/classroom?lessonPlanId=${openedId}`);
  await page.getByRole("button", { name: "编辑教学评价", exact: true }).click();
  await page
    .getByLabel("编辑教学评价正文")
    .fill("内容完整、结构清晰、语气得体。学生使用三维量规给出具体修改建议。");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.locator(".editor-save-state")).toContainText("V2");
  await page.getByLabel("AI 修改范围").selectOption("stage-1");
  await page
    .getByLabel("你的修改建议")
    .fill("把导入活动改得更有趣，增加两人讨论并保留 5 分钟时长。");
  await page.getByRole("button", { name: "修改选中部分", exact: true }).click();
  await expect(page.locator(".editor-save-state")).toContainText("V3");
  await expect(page.locator(".stage-block").first()).toContainText(
    "演示修改建议",
  );
  await page.getByRole("button", { name: "历史版本", exact: true }).click();
  await page
    .locator(".version-row")
    .filter({ has: page.getByText("V1", { exact: true }) })
    .click();
  await expect(page.locator(".version-content")).toContainText("教学过程");
  await page.getByRole("button", { name: "恢复此版本" }).click();
  await expect(page.locator(".editor-save-state")).toContainText("V4");
  await page.reload();
  await expect(page.locator(".editor-save-state")).toContainText("V4");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Word", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
  await download.saveAs("output/verified-lesson.docx");
  expect(
    (await readFile("output/verified-lesson.docx")).subarray(0, 2).toString(),
  ).toBe("PK");
  await page.screenshot({ path: "output/editor.png", fullPage: true });
  await page.goto("/knowledge");
  await page
    .getByRole("button", { name: "新建知识库", exact: true })
    .first()
    .click();
  await page.getByLabel("知识库名称").fill("验收写作资料");
  await page.getByLabel("说明", { exact: true }).fill("邀请信结构与礼貌表达");
  await page.getByRole("button", { name: "创建知识库", exact: true }).click();
  await expect(page).toHaveURL(/knowledge\//);
  await page
    .getByRole("button", { name: "上传资料", exact: true })
    .first()
    .click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "邀请信教学.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "邀请信需要明确邀请目的、活动时间与地点、礼貌语气。I am writing to invite you to our festival. 对需要支持的学生提供关键词支架。",
    ),
  });
  await expect(page.getByText("邀请信教学.txt", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.locator("tbody")).toContainText("已完成");
  await page.goto("/classroom");
  await page.locator(".knowledge-picker summary").click();
  await page.getByLabel("验收写作资料", { exact: true }).check();
  await page.locator(".knowledge-picker summary").click();
  await page.getByRole("switch", { name: "联网搜索" }).click();
  await page
    .getByLabel("课堂问题")
    .fill("如何写出得体的邀请信？请联网搜索相关资料。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".answer-details")).toContainText(
    "邀请信教学.txt",
    { timeout: 30000 },
  );
  await expect(page.locator(".answer-details")).toContainText("未执行真实搜索");
  await page.screenshot({
    path: "output/classroom-answer.png",
    fullPage: true,
  });
  await page.goto(lessonUrl);
  await page.getByRole("link", { name: "为这堂课创建复盘" }).click();
  await page
    .getByLabel("课堂观察与反馈")
    .fill(
      "学生能够表达邀请意图，但部分作品遗漏活动地点。同伴评价建议不够具体，需要更清晰的量规。",
    );
  await page.getByRole("button", { name: "保存并进入复盘" }).click();
  await expect(page).toHaveURL(/reflection\//);
  await page.getByRole("button", { name: "生成教学改进报告" }).click();
  await expect(
    page.getByRole("heading", { name: "教学目标达成分析", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "生成优化版教学设计" }).click();
  await expect(
    page.getByText("已生成优化版 V5", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "查看优化教学设计" }).click();
  await expect(page.locator(".editor-save-state")).toContainText("V5");
  await page.goto("/dashboard");
  for (const width of [1280, 1440, 1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/dashboard-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/prepare/new");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "output/prepare-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("API rejects unauthorized access, cross-user records and stale versions", async ({
  playwright,
  baseURL,
}) => {
  const a = await playwright.request.newContext({
    baseURL,
  });
  const b = await playwright.request.newContext({
    baseURL,
  });
  expect((await a.get("/api/lesson-plans")).status()).toBe(401);
  await a.post("/api/auth/register", {
    data: {
      email: `e2e-a-${stamp}@teacher.test`,
      password: "Teacher2026!",
      name: "验收A",
    },
  });
  await b.post("/api/auth/register", {
    data: {
      email: `e2e-b-${stamp}@teacher.test`,
      password: "Teacher2026!",
      name: "验收B",
    },
  });
  const basicInfo = {
    ...defaultBasic,
    title: "API 用户隔离课",
    topic: "An invitation",
  };
  const create = await a.post("/api/lesson-plans", {
    data: { basicInfo, documentIds: [] },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  expect((await b.get(`/api/lesson-plans/${id}`)).status()).toBe(404);
  expect((await b.get(`/api/lesson-plans/${id}/export`)).status()).toBe(404);
  expect(
    (
      await b.post(`/api/lesson-plans/${id}`, { data: { action: "analyze" } })
    ).status(),
  ).toBe(404);
  expect(
    (
      await a.post("/api/knowledge", {
        headers: { origin: "https://untrusted.test" },
        data: { name: "跨站测试" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await a.post("/api/documents", {
        multipart: {
          file: {
            name: "fake.pdf",
            mimeType: "application/pdf",
            buffer: Buffer.from("not a PDF"),
          },
        },
      })
    ).status(),
  ).toBe(400);
  await a.post(`/api/lesson-plans/${id}`, { data: { action: "analyze" } });
  const generated = await a.post(`/api/lesson-plans/${id}`, {
    data: { action: "generate" },
  });
  expect(generated.status()).toBe(200);
  const { content } = await generated.json();
  expect(
    (
      await a.post(`/api/lesson-plans/${id}`, {
        data: { action: "save", content, expectedVersion: 0 },
      })
    ).status(),
  ).toBe(409);
  const before = structuredClone(content);
  const revised = await a.post(`/api/lesson-plans/${id}`, {
    data: {
      action: "revise",
      target: "stage-1",
      instruction: "增加两人讨论",
      expectedVersion: 1,
    },
  });
  expect(revised.status()).toBe(200);
  const after = (await revised.json()).content;
  expect(after.stages.slice(1)).toEqual(before.stages.slice(1));
  expect(after.assessment).toBe(before.assessment);
  expect(after.objectives).toEqual(before.objectives);
  const plan = await (await a.get(`/api/lesson-plans/${id}`)).json();
  expect(plan.versions).toHaveLength(2);
  expect(plan.currentVersion).toBe(2);
  const base = await (
    await a.post("/api/knowledge", { data: { name: "隔离测试知识库" } })
  ).json();
  const file = await (
    await a.post("/api/documents", {
      multipart: {
        knowledgeBaseId: base.id,
        file: {
          name: "owned.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("邀请信写作应包含目的、时间地点和礼貌结束语。"),
        },
      },
    })
  ).json();
  expect(file.status).toBe("READY");
  expect((await b.get(`/api/documents/${file.id}`)).status()).toBe(404);
  expect((await b.get(`/api/documents/${file.id}?view=text`)).status()).toBe(
    404,
  );
  const original = await a.get(`/api/documents/${file.id}?view=text`);
  expect(original.status()).toBe(200);
  expect(original.headers()["content-type"]).toContain("text/plain");
  expect(await original.text()).toContain("邀请信写作应包含目的");
  expect(
    (
      await b.post("/api/lesson-plans", {
        data: { basicInfo, documentIds: [file.id] },
      })
    ).status(),
  ).toBe(400);
  const forbiddenChat = await b.post("/api/classroom", {
    data: {
      question: "邀请信写作",
      knowledgeBaseIds: [base.id],
      webSearch: false,
    },
  });
  expect(await forbiddenChat.text()).toContain("知识库不存在");
  expect(
    (
      await a.post(`/api/lesson-plans/${id}`, {
        data: {
          action: "save",
          expectedVersion: 2,
          content: {
            ...after,
            stages: after.stages.map((s: { duration: number }, i: number) =>
              i === 0 ? { ...s, duration: 30 } : s,
            ),
          },
        },
      })
    ).status(),
  ).toBe(400);
  const reflection = await (
    await a.post("/api/reflection", {
      data: {
        lessonPlanId: id,
        title: "隔离测试复盘",
        notes: "学生能够明确目的但遗漏时间地点，需要补充检查表。",
        documentIds: [],
      },
    })
  ).json();
  expect(
    (
      await b.post(`/api/reflection/${reflection.id}`, {
        data: { action: "analyze" },
      })
    ).status(),
  ).toBe(404);
  expect((await a.post("/api/auth/logout", { data: {} })).status()).toBe(200);
  expect((await a.get("/api/lesson-plans")).status()).toBe(401);
  expect(
    (
      await a.post("/api/auth/login", {
        data: {
          email: `e2e-a-${stamp}@teacher.test`,
          password: "wrong-password",
        },
      })
    ).status(),
  ).toBe(401);
  const login = await a.post("/api/auth/login", {
    data: { email: `e2e-a-${stamp}@teacher.test`, password: "Teacher2026!" },
  });
  expect(login.status()).toBe(200);
  expect(login.headers()["set-cookie"]).toContain("HttpOnly");
  expect((await a.get(`/api/lesson-plans/${id}`)).status()).toBe(200);
  await a.dispose();
  await b.dispose();
});
test("factual turns hide unasked sections and group references behind an accessible disclosure", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/register");
  await page.getByLabel("教师姓名").fill("验收回答策略");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill(`e2e-response-${stamp}@teacher.test`);
  await page.getByLabel("密码", { exact: true }).fill("Teacher2026!");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const plan = await (
    await page.request.post("/api/lesson-plans", {
      data: {
        basicInfo: {
          ...defaultBasic,
          title: "来源展示回归课",
          topic: "An Invitation to Our School Cultural Festival",
        },
        documentIds: [],
      },
    })
  ).json();
  const base = await (
    await page.request.post("/api/knowledge", {
      data: { name: "来源展示回归知识库" },
    })
  ).json();
  const upload = await page.request.post("/api/documents", {
    multipart: {
      knowledgeBaseId: base.id,
      file: {
        name: classroomProfileName,
        mimeType: "text/plain",
        buffer: Buffer.from(classroomProfile),
      },
    },
  });
  const document = await upload.json();
  expect(document.status).toBe("READY");
  await page.goto(`/classroom?lessonPlanId=${plan.id}`);
  await page.locator(".knowledge-picker summary").click();
  await page.getByLabel("来源展示回归知识库", { exact: true }).check();
  await page.locator(".knowledge-picker summary").click();
  await page.getByLabel("课堂问题").fill("高二（3）班有多少人？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const turn = page.locator(".assistant-turn").first();
  const card = turn.locator(".source-item");
  await expect(card).toHaveCount(1);
  await expect(turn.getByText("参考资料", { exact: true })).toBeVisible();
  await expect(card.locator(".source-document-title")).toHaveText(
    classroomProfileName,
  );
  await expect(card.locator(".source-count")).toHaveText(
    /命中 [2-9] 个相关片段/,
  );
  await expect(card.locator("li").first()).not.toBeVisible();
  await expect(turn).not.toContainText("教师讲解建议");
  await expect(turn).not.toContainText("写作示例");
  await expect(turn).not.toContainText("没有启用网络");
  await expect(card.getByText("查看原文", { exact: true })).toHaveAttribute(
    "href",
    `/api/documents/${document.id}?view=text`,
  );
  await card.getByText("查看引用", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(card.locator("li").first()).toBeVisible();
  await expect(card.locator("li")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(card.locator("li").first()).not.toBeVisible();
  const sessionUrl = page.url();
  await page.reload();
  await expect(page.locator(".assistant-turn .source-item")).toHaveCount(1);
  await expect(page.locator(".source-document-title").first()).toBeVisible();
  await expect(page.locator(".source-quotations li").first()).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("课堂问题")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/assistant-qa/sources-mobile.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("下载文件", { exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    classroomProfileName,
  );
  expect(page.url()).toBe(sessionUrl);
  expect(errors).toEqual([]);
});

test("classroom restores course/session after refresh and isolates course switches", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("教师姓名").fill("验收课程绑定");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill(`e2e-course-${stamp}@teacher.test`);
  await page.getByLabel("密码", { exact: true }).fill("Teacher2026!");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const create = async (title: string, topic: string) => {
    const response = await page.request.post("/api/lesson-plans", {
      data: { basicInfo: { ...defaultBasic, title, topic }, documentIds: [] },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).id as string;
  };
  const first = await create(
    "邀请信绑定课程",
    "An Invitation to Our Cultural Festival",
  );
  const second = await create(
    "议论文绑定课程",
    "Should school uniforms be compulsory?",
  );
  await page.goto(`/classroom?lessonPlanId=${first}`);
  await expect(page.getByLabel("当前课程", { exact: true })).toHaveValue(first);
  await page.getByRole("switch", { name: "联网搜索" }).click();
  await page.getByLabel("课堂问题").fill("本节课是什么写作主题？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".assistant-turn .answer-text")).toContainText(
    "邀请信绑定课程",
  );
  const savedUrl = page.url();
  expect(savedUrl).toContain("session=");
  await page.reload();
  await expect(page.getByLabel("当前课程", { exact: true })).toHaveValue(first);
  await expect(page.locator(".assistant-turn .answer-text")).toContainText(
    "邀请信绑定课程",
  );
  await page.getByRole("button", { name: "新建对话", exact: true }).click();
  await expect(page.getByLabel("当前课程", { exact: true })).toHaveValue(first);
  await expect(page.getByRole("switch", { name: "联网搜索" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(page.locator(".user-turn")).toHaveCount(0);
  await page.getByLabel("当前课程", { exact: true }).selectOption(second);
  await expect(page).toHaveURL(new RegExp(`lessonPlanId=${second}`));
  await expect(page.locator(".user-turn")).toHaveCount(0);
  await page.getByLabel("课堂问题").fill("当前这堂课的课题是什么？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".assistant-turn .answer-text")).toContainText(
    "议论文绑定课程",
  );
  await expect(page.locator(".assistant-turn .answer-text")).not.toContainText(
    "邀请信绑定课程",
  );
  await page.goto(savedUrl);
  await expect(page.getByLabel("当前课程", { exact: true })).toHaveValue(first);
  await expect(page.getByRole("switch", { name: "联网搜索" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const sessionId = new URL(savedUrl).searchParams.get("session");
  const mismatch = await page.request.post("/api/classroom", {
    data: {
      sessionId,
      lessonPlanId: second,
      question: "这个活动",
      knowledgeBaseIds: [],
      webSearch: false,
    },
  });
  expect(await mismatch.text()).toContain("另一课程");
  await page.screenshot({
    path: "output/classroom-course-binding.png",
    fullPage: true,
  });
});
test("teachers can cancel or delete chosen history, including the current chat, with owner isolation", async ({
  page,
  playwright,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/register");
  await page.getByLabel("教师姓名").fill("验收历史删除");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill(`e2e-delete-${stamp}@teacher.test`);
  await page.getByLabel("密码", { exact: true }).fill("Teacher2026!");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  const plan = await (
    await page.request.post("/api/lesson-plans", {
      data: {
        basicInfo: {
          ...defaultBasic,
          title: "删除历史后的当前课程",
          topic: "An Invitation",
        },
        documentIds: [],
      },
    })
  ).json();
  const base = await (
    await page.request.post("/api/knowledge", {
      data: { name: "删除历史测试资料" },
    })
  ).json();
  const createChat = async (question: string) => {
    const response = await page.request.post("/api/classroom", {
      data: {
        lessonPlanId: plan.id,
        question,
        knowledgeBaseIds: [base.id],
        webSearch: true,
      },
    });
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.some((event) => event.type === "complete")).toBe(true);
    return events.find((event) => event.type === "session").id as string;
  };
  const older = await createChat("只删除这条旧对话");
  const retained = await createChat("保留的另一段对话");
  const current = await createChat("当前需要删除的对话");
  const outsider = await playwright.request.newContext({ baseURL });
  expect((await outsider.delete(`/api/classroom/${older}`)).status()).toBe(401);
  await outsider.post("/api/auth/register", {
    data: {
      email: `e2e-delete-other-${stamp}@teacher.test`,
      name: "验收删除隔离",
      password: "Teacher2026!",
    },
  });
  expect((await outsider.delete(`/api/classroom/${older}`)).status()).toBe(404);
  expect(
    (
      await page.request.delete(`/api/classroom/${older}`, {
        headers: { origin: "https://untrusted.test" },
      })
    ).status(),
  ).toBe(403);
  await outsider.dispose();
  await page.goto(`/classroom?session=${current}`);
  await expect(
    page.getByRole("heading", { name: "对话历史", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".chat-session-row")).toHaveCount(3);
  await page.getByLabel("课堂问题").fill("保留未发送的草稿");
  const deleteOlder = page.getByRole("button", {
    name: "删除对话：只删除这条旧对话",
    exact: true,
  });
  await deleteOlder.click();
  const dialog = page.getByRole("dialog", { name: "删除这段对话？" });
  await expect(dialog).toContainText("只删除这条旧对话");
  await dialog.getByRole("button", { name: "保留对话", exact: true }).click();
  await expect(deleteOlder).toBeVisible();
  await deleteOlder.click();
  const deleteUrl = `**/api/classroom/${older}`;
  await page.route(deleteUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "删除暂时失败，请重试。" }),
    }),
  );
  await dialog.getByRole("button", { name: "删除对话", exact: true }).click();
  await expect(
    page.getByText("删除暂时失败，请重试。", { exact: true }),
  ).toBeVisible();
  // The modal intentionally hides background controls from the accessibility tree.
  await expect(
    page.locator(".chat-session-row").filter({ hasText: "只删除这条旧对话" }),
  ).toHaveCount(1);
  await expect(dialog).toBeVisible();
  await page.unroute(deleteUrl);
  await dialog.getByRole("button", { name: "删除对话", exact: true }).click();
  await expect(deleteOlder).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`session=${current}`));
  await expect(page.getByLabel("课堂问题")).toHaveValue("保留未发送的草稿");
  await expect(page.locator(".user-turn")).toHaveCount(1);
  const database = new PrismaClient();
  try {
    expect(
      await database.chatSession.findUnique({ where: { id: older } }),
    ).toBeNull();
    expect(
      await database.chatMessage.count({ where: { sessionId: older } }),
    ).toBe(0);
    expect(
      await database.chatMessage.count({ where: { sessionId: current } }),
    ).toBe(2);
    await page.reload();
    await expect(page.locator(".chat-session-row")).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    const deleteCurrent = page.getByRole("button", {
      name: "删除对话：当前需要删除的对话",
      exact: true,
    });
    await expect(deleteCurrent).toBeVisible();
    await deleteCurrent.click();
    await dialog.getByRole("button", { name: "删除对话", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/classroom\\?lessonPlanId=${plan.id}$`),
    );
    await expect(page.getByLabel("当前课程", { exact: true })).toHaveValue(
      plan.id,
    );
    await expect(page.locator(".user-turn")).toHaveCount(0);
    await expect(
      page.getByRole("switch", { name: "联网搜索" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(page.locator(".selected-bases")).toHaveCount(0);
    await expect(page.locator(".chat-session-row")).toHaveCount(1);
    await expect(
      page
        .locator(".chat-history")
        .getByRole("link", { name: "保留的另一段对话", exact: true }),
    ).toBeVisible();
    expect(
      await database.chatSession.findUnique({ where: { id: current } }),
    ).toBeNull();
    expect(
      await database.chatMessage.count({ where: { sessionId: current } }),
    ).toBe(0);
    expect(
      await database.chatMessage.count({ where: { sessionId: retained } }),
    ).toBe(2);
    const stale = await page.request.post("/api/classroom", {
      data: {
        sessionId: current,
        lessonPlanId: plan.id,
        question: "继续旧对话",
        knowledgeBaseIds: [],
        webSearch: false,
      },
    });
    expect(await stale.text()).toContain("对话不存在");
    await page.screenshot({
      path: "output/assistant-qa/history-delete-mobile.png",
      fullPage: true,
    });
    await page.getByLabel("课堂问题").fill("删除之后的新问题");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    await expect(page.locator(".assistant-turn .answer-details")).toHaveCount(
      1,
    );
    const nextSession = new URL(page.url()).searchParams.get("session");
    expect(nextSession).toBeTruthy();
    expect(nextSession).not.toBe(current);
    expect(errors).toEqual([]);
  } finally {
    await database.$disconnect();
  }
});
