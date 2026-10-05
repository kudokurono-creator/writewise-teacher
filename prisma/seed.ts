import "@/lib/db";
import { db, json } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import {
  sampleAnalysis,
  sampleLesson,
  sampleReflection,
} from "@/services/ai/mock";
import { defaultBasic } from "@/types/lesson";
import { getStorage } from "@/services/storage/provider";
import { indexDocument } from "@/services/rag/service";
async function main() {
  // Seed resources are explicit fixtures; never call paid APIs while seeding.
  process.env.EMBEDDING_PROVIDER = "mock";
  const user = await db.user.upsert({
    where: { email: "demo@writewise.local" },
    update: {},
    create: {
      email: "demo@writewise.local",
      name: "林老师",
      passwordHash: hashPassword("WriteWise2026!"),
    },
  });
  const bases = [
    {
      id: "demo-base-curriculum",
      name: "高中英语课程与写作指南",
      category: "课程标准",
      description: "演示教学资料：写作目标、活动设计与评价参考。",
      file: "写作教学参考（演示）.md",
      text: "# 写作教学参考（演示资料，并非课程标准原文）\n写作任务应明确交际目的、读者和情境。学生通过构思、起草、修改等过程组织信息。\n教学目标需可观察、可评价，关注内容、结构和语言。\n形成性评价可以利用规划表、同伴互评和修改记录。教师应鼓励学生解释修改理由。\n应用文常包含称呼、写作目的、主要信息和结束语。邀请信应说明活动内容、时间、地点和邀请意图，语气礼貌。",
    },
    {
      id: "demo-base-textbook",
      name: "人教版写作教学资料",
      category: "教材资料",
      description: "按单元整理写作任务、语言支架与课堂活动。",
      file: "邀请信写作支架.txt",
      text: "邀请信写作教学支架（演示）\n开头明确邀请目的：I am writing to invite you to...\n主体说明活动安排：The event will take place... Students will have the opportunity to...\n结尾表达期待：We would be delighted if you could join us.\n引导学生结合具体情境改写表达，避免机械背诵。\n评价关注目的清晰、信息完整、结构连贯与礼貌语气。",
    },
    {
      id: "demo-base-students",
      name: "高二（3）班学情档案",
      category: "班级学情",
      description: "开发演示用虚构班级资料，正式使用前请替换。",
      file: "班级学情（虚构示例）.txt",
      text: "虚构学情示例，仅用于开发体验。部分学生能使用常见邀请句式，但活动安排信息容易遗漏。建议增加读者需求检查表。对需要支持的学生提供关键词库，让学生根据活动特点选择恰当表达。写作后同伴互评应指出具体语句并说明理由。",
    },
  ];
  for (const base of bases) {
    await db.knowledgeBase.upsert({
      where: { id: base.id },
      update: {},
      create: {
        id: base.id,
        userId: user.id,
        name: base.name,
        description: base.description,
        category: base.category,
      },
    });
    const id = `${base.id}-document`;
    if (!(await db.document.findUnique({ where: { id } }))) {
      const bytes = Buffer.from(base.text);
      const type = base.file.endsWith("md") ? "md" : "txt";
      const storageKey = await getStorage().put(user.id, type, bytes);
      await db.document.create({
        data: {
          id,
          userId: user.id,
          knowledgeBaseId: base.id,
          name: base.file,
          size: bytes.length,
          type,
          storageKey,
          text: base.text,
          status: "READY",
        },
      });
      await indexDocument(id, user.id);
    }
  }
  for (const [i, title, topic, lessonType, grade] of [
    [
      1,
      "邀请信写作：校园英语文化节",
      "An invitation to our English festival",
      "应用文",
      "高二",
    ],
    [
      2,
      "读后续写：一次难忘的帮助",
      "An unexpected act of kindness",
      "读后续写",
      "高二",
    ],
    [3, "观点表达：科技与学习", "Technology in our learning", "议论文", "高三"],
  ] as const) {
    const id = `demo-lesson-${i}`;
    const info = {
      ...defaultBasic,
      title,
      topic,
      lessonType,
      grade,
      className: i === 3 ? "高三（1）班" : "高二（3）班",
    };
    const analysis = sampleAnalysis(info, true);
    const content = sampleLesson(info, analysis);
    await db.lessonPlan.upsert({
      where: { id },
      update: {},
      create: {
        id,
        userId: user.id,
        title,
        basicInfo: json(info),
        analysis: json(analysis),
        content: json(content),
        status: "READY",
        currentVersion: 1,
        versions: {
          create: {
            number: 1,
            content: json(content),
            changeDescription: "示例教学设计",
          },
        },
        references: { create: { documentId: "demo-base-textbook-document" } },
      },
    });
  }
  const source = await db.lessonPlan.findUniqueOrThrow({
    where: { id: "demo-lesson-1" },
  });
  await db.reflection.upsert({
    where: { id: "demo-reflection-1" },
    update: {},
    create: {
      id: "demo-reflection-1",
      userId: user.id,
      lessonPlanId: source.id,
      title: "邀请信写作课堂复盘（示例）",
      notes:
        "演示反馈：部分学生能写出邀请目的，但遗漏了活动地点；同伴互评需要更具体的评价标准。",
      sourceVersion: 1,
      sourceContent: json(source.content),
      report: json(
        sampleReflection(
          "部分学生遗漏活动地点，互评建议过于笼统（虚构反馈）。",
          "邀请信写作",
        ),
      ),
    },
  });
  console.log(
    "Seed ready. Development demo account: demo@writewise.local / WriteWise2026!",
  );
}
main().finally(() => db.$disconnect());
