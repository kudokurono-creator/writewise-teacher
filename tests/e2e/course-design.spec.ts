import { test, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 180000 });
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
import {
  defaultBasic,
  emptyClassProfile,
  type LessonContent,
} from "../../src/types/lesson";
import { sampleLegacyLesson } from "../../src/services/ai/mock";
import { getStorage } from "../../src/services/storage/provider";
const stamp = Date.now();
const emails = [
  `course-ui-${stamp}@teacher.test`,
  `course-api-${stamp}@teacher.test`,
  `course-other-${stamp}@teacher.test`,
  `course-roles-${stamp}@teacher.test`,
];
const database = new PrismaClient();
let failed = false;
test.afterEach(async ({}, info) => {
  failed ||= info.status !== info.expectedStatus;
});
test.beforeAll(async () => {
  await mkdir("output/course-design-qa", { recursive: true });
  await writeFile(
    "output/course-design-qa/unit.txt",
    "Unit 2\nP24\nReading task: identify the writer's position and supporting evidence.\nP25\nCompare claims and evidence.\nP26\nPlan an argument based on the reading.\nUnit 3\nOther unit content outside the teaching scope.",
  );
});
test.afterAll(async () => {
  if (failed) {
    await database.$disconnect();
    return;
  }
  const documents = await database.document.findMany({
    where: { user: { email: { in: emails } } },
    select: { storageKey: true },
  });
  for (const doc of documents) await getStorage().remove(doc.storageKey);
  await database.user.deleteMany({ where: { email: { in: emails } } });
  await database.$disconnect();
});

test("file-first drafts distinguish uploaded textbook from knowledge-base profile and standards", async ({
  page,
}) => {
  const registered = await page.request.post("/api/auth/register", {
    data: { email: emails[3], name: "验收资料用途", password: "Teacher2026!" },
  });
  expect(registered.status()).toBe(200);
  const base = await (
    await page.request.post("/api/knowledge", {
      data: { name: "资料用途验收知识库" },
    })
  ).json();
  const upload = async (name: string, text: string, knowledgeBaseId?: string) =>
    (
      await (
        await page.request.post("/api/documents", {
          multipart: {
            ...(knowledgeBaseId ? { knowledgeBaseId } : {}),
            file: { name, mimeType: "text/plain", buffer: Buffer.from(text) },
          },
        })
      ).json()
    ).id as string;
  const textbook = await upload(
    "three-pages.txt",
    "P20\nRead an invitation.\nP21\nIdentify time and place.\nP22\nWrite an invitation.",
  );
  const profile = await upload(
    "student-profile.txt",
    "学生需要段落结构支架",
    base.id,
  );
  const standards = await upload(
    "standards.txt",
    "学生能根据交际目的组织语篇",
    base.id,
  );
  const created = await page.request.post("/api/lesson-plans", {
    data: {
      basicInfo: {
        ...defaultBasic,
        workflowVersion: 2,
        textbook: "",
        unit: "",
        teachingScope: "P20–22",
        referenceScope: "Entire Unit 2",
      },
      draftStep: 4,
      documentSelections: [
        {
          documentId: textbook,
          sourceType: "textbook",
          referenceType: "other",
        },
        {
          documentId: profile,
          sourceType: "reference",
          referenceType: "student_profile",
        },
        {
          documentId: standards,
          sourceType: "reference",
          referenceType: "curriculum_standard",
        },
      ],
    },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  const plan = await (await page.request.get(`/api/lesson-plans/${id}`)).json();
  expect(plan.basicInfo.textbook).toBe("");
  expect(plan.basicInfo.unit).toBe("");
  expect(
    plan.references.map(
      (r: {
        documentId: string;
        sourceType: string;
        referenceType: string;
      }) => [r.documentId, r.sourceType, r.referenceType],
    ),
  ).toEqual(
    expect.arrayContaining([
      [textbook, "textbook", "other"],
      [profile, "reference", "student_profile"],
      [standards, "reference", "curriculum_standard"],
    ]),
  );
  await page.goto(`/prepare/new?draft=${id}`);
  await expect(
    page.getByRole("heading", { name: "安排本次课时" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await expect(page.getByLabel("教材区域")).toContainText("three-pages.txt");
  await expect(page.getByLabel("参考资料区域")).toContainText(
    "student-profile.txt",
  );
  await expect(page.getByLabel("参考资料区域")).toContainText("standards.txt");
  await expect(page.locator(".wizard-aside")).toContainText(
    "教材 1 份 · 参考 2 份",
  );
  await page.getByLabel("上传参考文件").setInputFiles({
    name: "extra-textbook-pages.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("P23 additional textbook material"),
  });
  await expect(page.getByLabel("extra-textbook-pages.txt的用途")).toBeVisible();
  await page
    .getByLabel("教材区域")
    .locator(".file-select-row")
    .filter({ hasText: "extra-textbook-pages.txt" })
    .locator('input[type="checkbox"]')
    .check();
  await expect(page.getByLabel("extra-textbook-pages.txt的用途")).toHaveCount(
    0,
  );
  await expect(page.locator(".wizard-aside")).toContainText(
    "教材 2 份 · 参考 2 份",
  );
});

test("six-step flow uses optional metadata and scoped dialogue to produce bilingual Word designs", async ({
  page,
}) => {
  test.setTimeout(900000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/register");
  await page.getByLabel("教师姓名").fill("验收双语教师");
  await page.getByLabel("邮箱", { exact: true }).fill(emails[0]);
  await page.getByLabel("密码", { exact: true }).fill("Teacher2026!");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/prepare/new");
  await page.getByRole("button", { name: "新建班级档案", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建班级学情档案" });
  await dialog.getByLabel("班级名称").fill("高二（3）班");
  await dialog
    .getByLabel("阅读基础", { exact: true })
    .fill("能定位明确信息，需要论据分析支持");
  await dialog
    .getByLabel("写作基础", { exact: true })
    .fill("能写出观点，需要组织论证");
  await dialog.getByRole("button", { name: "确认学情并保存档案" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("选择班级学情档案")).not.toHaveValue("");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(
    page.getByLabel("教材版本（选填）", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("单元（选填）", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("上传教材文件")
    .setInputFiles("output/course-design-qa/unit.txt");
  await expect(page.getByLabel("教材区域")).toContainText("已选择 1 份资料");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByLabel("本次教学范围").fill("P24–26 · Reading for Writing");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "连续双课时", exact: true }).click();
  await page.getByLabel("第 1 课时时长（分钟）").fill("40");
  await page.getByLabel("第 2 课时时长（分钟）").fill("45");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByLabel("班级（可选）")).toHaveCount(0);
  await expect(page.getByLabel("教学设计名称")).toHaveCount(0);
  await expect(page.locator(".wizard-steps li")).toHaveCount(6);
  await page.getByRole("button", { name: "开始教学分析", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "AI 分析与确认" }),
  ).toBeVisible();
  await expect(page.getByLabel("学情分析", { exact: true })).toHaveValue(
    /能定位明确信息/,
  );
  await expect(page.locator(".material-analysis")).not.toHaveAttribute("open");
  const planId = new URL(page.url()).searchParams.get("draft")!;
  const before = (
    await (await page.request.get(`/api/lesson-plans/${planId}`)).json()
  ).analysis;
  await page.getByRole("tab", { name: "Lesson 2 · 45 分钟" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Lesson 1 分析" }),
  ).toHaveCount(0);
  await page
    .getByLabel("与 AI 确认教学要求")
    .fill("第二课时增加写作支架，第一课时保持当前分析。");
  await page.getByRole("button", { name: "调整选定课时分析" }).click();
  await expect(page.locator(".revision-messages .assistant")).toHaveCount(1, {
    timeout: 180000,
  });
  const after = (
    await (await page.request.get(`/api/lesson-plans/${planId}`)).json()
  ).analysis;
  expect(after.lessons[0]).toEqual(before.lessons[0]);
  expect(after.materialAnalysis).toEqual(before.materialAnalysis);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "AI 分析与确认" }),
  ).toBeVisible();
  await expect(page.locator(".revision-messages")).toContainText(
    "第二课时增加写作支架",
  );
  await page.getByRole("button", { name: "接受分析并继续" }).click();
  await page
    .getByRole("button", { name: "生成完整教学设计", exact: true })
    .click();
  await expect(page).toHaveURL(/lesson-plans\//, { timeout: 600000 });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.locator(".lesson-session-heading")).toHaveCount(1);
  await expect(page.locator(".lesson-session-heading").first()).toContainText(
    "40 / 40",
  );
  await page.getByRole("tab", { name: "Lesson 2 · 45 分钟" }).click();
  await expect(page.locator(".lesson-session-heading")).toContainText(
    "45 / 45",
  );
  await expect(page.locator(".lesson-connection")).toBeVisible();
  const content = (
    await (await page.request.get(`/api/lesson-plans/${id}`)).json()
  ).content as LessonContent;
  expect(content.english?.lessons).toHaveLength(2);
  expect(content.canonical?.version).toBe(2);
  await expect(page.locator(".procedure-table thead th")).toHaveCount(2);
  await page
    .getByRole("button", { name: "English version", exact: true })
    .click();
  await expect(page.locator(".lesson-document")).toContainText(
    "Learning Evidence",
  );
  const englishDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载英文 Word", exact: true })
    .click();
  const enFile = await englishDownload;
  expect(enFile.suggestedFilename()).toContain("English");
  await enFile.saveAs("output/course-design-qa/double-English.docx");
  const defaultExport = await page.request.get(
    `/api/lesson-plans/${id}/export`,
  );
  expect(defaultExport.status()).toBe(200);
  expect(defaultExport.headers()["content-disposition"]).toContain("English");
  const text = await (
    await JSZip.loadAsync(await defaultExport.body())
  )
    .file("word/document.xml")!
    .async("string");
  expect(text).toContain("Lesson Connection");
  expect(text).toContain("40 + 45");
  const chineseDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "下载中文 Word", exact: true })
    .click();
  await (
    await chineseDownload
  ).saveAs("output/course-design-qa/double-Chinese.docx");
  await page.screenshot({
    path: "output/course-design-qa/english-editor.png",
    fullPage: true,
  });
  await page.goto(`/classroom?lessonPlanId=${id}`);
  const secondLessonId = content.lessons![1].id;
  await page
    .getByLabel("当前课时", { exact: true })
    .selectOption(secondLessonId);
  await page.getByLabel("课堂问题").fill("本课时如何调用第一课时产出？");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.locator(".answer-text")).toContainText(/第1课时|第一课时/);
  await page.reload();
  await expect(page.getByLabel("当前课时", { exact: true })).toHaveValue(
    secondLessonId,
  );
  const reflection = await (
    await page.request.post("/api/reflection", {
      data: {
        lessonPlanId: id,
        title: "双课时衔接复盘",
        notes: "第一课时完成资源表；第二课时学生未充分使用论据。",
        documentIds: [],
      },
    })
  ).json();
  const analyzed = await page.request.post(`/api/reflection/${reflection.id}`, {
    data: { action: "analyze" },
    timeout: 180000,
  });
  expect(analyzed.status()).toBe(200);
  expect((await analyzed.json()).lessonReports).toHaveLength(2);
  const optimized = await page.request.post(
    `/api/reflection/${reflection.id}`,
    { data: { action: "optimize", expectedVersion: 1 }, timeout: 180000 },
  );
  expect(optimized.status()).toBe(200);
  expect((await optimized.json()).content.english.lessons).toHaveLength(2);
  await page.goto(`/reflection/${reflection.id}`);
  await expect(
    page.getByRole("heading", { name: "两课时衔接效果" }),
  ).toBeVisible();
  await page.goto("/prepare/new");
  await expect(
    page
      .getByLabel("选择班级学情档案")
      .getByRole("option", { name: "高二（3）班 · 高二" }),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/course-design-qa/wizard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("class snapshots, owner isolation, legacy translation and partial revisions persist", async ({
  page,
  playwright,
  baseURL,
}) => {
  const owner = await playwright.request.newContext({ baseURL });
  const other = await playwright.request.newContext({ baseURL });
  try {
    for (const [context, email] of [
      [owner, emails[1]],
      [other, emails[2]],
    ] as const)
      expect(
        (
          await context.post("/api/auth/register", {
            data: { email, name: "验收兼容教师", password: "Teacher2026!" },
          })
        ).status(),
      ).toBe(200);
    const profile = {
      ...emptyClassProfile,
      className: "高二（3）班",
      writing: "需要篇章组织支持",
    };
    const saved = await (
      await owner.post("/api/class-profiles", { data: { profile } })
    ).json();
    expect(
      (
        await other.post("/api/class-profiles", {
          data: { id: saved.id, profile },
        })
      ).status(),
    ).toBe(404);
    const basicInfo = {
      ...defaultBasic,
      title: "复用班级写作课",
      topic: "Space Exploration",
      teachingScope: "P44–45",
      referenceScope: "Entire Unit 4",
      classProfileId: saved.id,
      classProfile: { ...profile, writing: "恶意覆盖的虚假成绩" },
    };
    const created = await (
      await owner.post("/api/lesson-plans", {
        data: { basicInfo, documentIds: [] },
      })
    ).json();
    expect(
      (await (await owner.get(`/api/lesson-plans/${created.id}`)).json())
        .basicInfo.classProfile.writing,
    ).toBe(profile.writing);
    expect(
      (
        await other.post("/api/lesson-plans", {
          data: { basicInfo, documentIds: [] },
        })
      ).status(),
    ).toBe(404);
    await owner.post("/api/class-profiles", {
      data: { id: saved.id, profile: { ...profile, writing: "更新后的档案" } },
    });
    expect(
      (await (await owner.get(`/api/lesson-plans/${created.id}`)).json())
        .basicInfo.classProfile.writing,
    ).toBe(profile.writing);
    expect(
      (
        await owner.post("/api/lesson-plans", {
          data: {
            basicInfo: {
              ...basicInfo,
              lessonMode: "double",
              lessonDurations: [45, 50],
              duration: 90,
            },
            documentIds: [],
          },
        })
      ).status(),
    ).toBe(400);
    await owner.post(`/api/lesson-plans/${created.id}`, {
      data: { action: "analyze" },
    });
    const generated = await owner.post(`/api/lesson-plans/${created.id}`, {
      data: { action: "generate" },
    });
    expect(generated.status()).toBe(200);
    const content = (await generated.json()).content as LessonContent;
    const target = content.lessons![0].stages[0].activities![0].id;
    const revised = await owner.post(`/api/lesson-plans/${created.id}`, {
      data: {
        action: "revise",
        target,
        instruction: "增加同伴核对证据",
        expectedVersion: 1,
      },
    });
    expect(revised.status()).toBe(200);
    const next = (await revised.json()).content as LessonContent;
    expect(next.lessons![0].stages.slice(1)).toEqual(
      content.lessons![0].stages.slice(1),
    );
    expect(next.objectives).toEqual(content.objectives);
    expect(next.english).toBeDefined();
    expect(
      (
        await owner.post(`/api/lesson-plans/${created.id}`, {
          data: { action: "save", content: next, expectedVersion: 1 },
        })
      ).status(),
    ).toBe(409);
    const user = await database.user.findUniqueOrThrow({
      where: { email: emails[1] },
    });
    const oldInfo = {
      ...defaultBasic,
      title: "旧版单课时",
      topic: "An Invitation",
    };
    const old = await database.lessonPlan.create({
      data: {
        userId: user.id,
        title: oldInfo.title,
        basicInfo: oldInfo,
        content: JSON.parse(JSON.stringify(sampleLegacyLesson(oldInfo))),
        status: "READY",
        currentVersion: 1,
      },
    });
    expect(
      (await owner.get(`/api/lesson-plans/${old.id}/export`)).status(),
    ).toBe(409);
    expect(
      (
        await owner.get(`/api/lesson-plans/${old.id}/export?language=zh`)
      ).status(),
    ).toBe(200);
    const translated = await owner.post(`/api/lesson-plans/${old.id}`, {
      data: { action: "translate", expectedVersion: 1 },
    });
    expect(translated.status()).toBe(200);
    expect((await translated.json()).content.english).toBeDefined();
    expect(
      (await owner.get(`/api/lesson-plans/${old.id}/export`)).status(),
    ).toBe(200);
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.goto(`/lesson-plans/${old.id}`);
    await expect(page.locator(".stage-block")).toHaveCount(6);
    await page
      .getByRole("button", { name: "English version", exact: true })
      .click();
    await expect(page.locator(".lesson-document")).toContainText(
      "Teaching Procedures",
    );
    const bytes = await (
      await owner.get(`/api/lesson-plans/${old.id}/export`)
    ).body();
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  } finally {
    await owner.dispose();
    await other.dispose();
  }
});

test("saved real-provider design keeps the selected lesson across languages and completes reflection", async ({
  page,
}) => {
  test.setTimeout(600000);
  const id = process.env.COURSE_QA_RESUME_ID;
  test.skip(!id, "为保留的独立验收课程提供 COURSE_QA_RESUME_ID 后运行");
  const plan = await database.lessonPlan.findUniqueOrThrow({
    where: { id: id! },
    include: { user: true },
  });
  expect(plan.user.email.startsWith("course-ui-")).toBe(true);
  expect(
    (
      await page.request.post("/api/auth/login", {
        data: { email: plan.user.email, password: "Teacher2026!" },
      })
    ).status(),
  ).toBe(200);
  const before = plan.currentVersion;
  await page.goto(`/lesson-plans/${id}`);
  await page.getByRole("tab", { name: "Lesson 2 · 45 分钟" }).click();
  await page
    .getByRole("button", { name: "English version", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Lesson 2 · 45 min" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".lesson-session-heading")).toContainText(
    "45 / 45",
  );
  await expect(page.locator(".procedure-table thead th")).toHaveCount(2);
  await page.screenshot({
    path: "output/canonical-design-qa/english-lesson-two.png",
    fullPage: true,
  });
  for (const language of ["en", "zh"] as const) {
    const response = await page.request.get(
      `/api/lesson-plans/${id}/export?language=${language}`,
    );
    expect(response.status()).toBe(200);
    await writeFile(
      `output/canonical-design-qa/live-${language}.docx`,
      await response.body(),
    );
  }
  await page.getByRole("button", { name: "中文版", exact: true }).click();
  await page
    .getByRole("button", { name: "编辑教学设计名称", exact: true })
    .click();
  await page
    .getByLabel("教学设计名称", { exact: true })
    .fill("Text Evidence and Argument Planning");
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(page.locator(".editor-save-state")).toContainText(
    `V${before + 1}`,
  );
  const { id: reflectionId } = await (
    await page.request.post("/api/reflection", {
      data: {
        lessonPlanId: id,
        title: "双课时衔接验收",
        notes: "第一课时完成观点和证据表，第二课时需要更明确的衔接支架。",
        documentIds: [],
      },
    })
  ).json();
  const report = await page.request.post(`/api/reflection/${reflectionId}`, {
    data: { action: "analyze" },
    timeout: 180000,
  });
  expect(report.status()).toBe(200);
  expect((await report.json()).lessonReports).toHaveLength(2);
  const optimized = await page.request.post(`/api/reflection/${reflectionId}`, {
    data: { action: "optimize", expectedVersion: before + 1 },
    timeout: 180000,
  });
  expect(optimized.status()).toBe(200);
  const result = await optimized.json();
  expect(result.content.canonical.version).toBe(2);
  expect(result.content.english.lessons).toHaveLength(2);
  await page.goto(`/lesson-plans/${id}`);
  await expect(page.locator(".editor-save-state")).toContainText(
    `V${before + 2}`,
  );
});
