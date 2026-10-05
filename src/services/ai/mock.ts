import { z } from "zod";
import type { AIProvider, AIResult, Message } from "./types";
import type {
  BasicInfo,
  LessonAnalysis,
  LessonContent,
  ReflectionReport,
} from "@/types/lesson";
export function sampleAnalysis(
  info: BasicInfo,
  hasReferences = false,
): LessonAnalysis {
  return {
    theme: `围绕“${info.topic}”组织${info.lessonType}写作，连接真实交际情境，经历理解任务、积累表达、独立写作与修改的过程。`,
    students: hasReferences
      ? "已提供参考资料。当前为演示分析，请教师结合资料中的实际表现确认学情：学生的篇章组织、语域选择与表达准确性需要分别诊断。"
      : "尚未提供班级学情。建议课前用一份 80 词短写作诊断学生的篇章结构、词汇与衔接能力；以下建议需要教师确认。",
    objectives: [
      info.objectives ||
        `学生能识别${info.lessonType}的写作目的、读者与基本结构。`,
      `学生能使用与“${info.topic}”相关的至少三种表达完成初稿。`,
      "学生能依据内容、结构、语言三项标准开展同伴互评，并完成一处有理由的修改。",
    ],
    focus:
      "围绕写作目的安排信息，用清晰的段落结构组织内容，建立恰当的语言支架。",
    difficulties: "将零散信息转化为连贯段落，并根据读者与情境调整语气。",
    writingSkills: "内容选择、篇章组织、衔接表达和基于评价标准的自主修订。",
    strategies: [
      "情境任务驱动",
      "范例观察与支架",
      "写作过程教学",
      "同伴互评与反馈",
    ],
  };
}
export function sampleLesson(
  info: BasicInfo,
  analysis = sampleAnalysis(info),
): LessonContent {
  const weights = [5, 8, 7, 15, 7, 3];
  const durations = weights.map((n) =>
    Math.max(1, Math.floor((n * info.duration) / 45)),
  );
  durations[3] += info.duration - durations.reduce((a, b) => a + b, 0);
  const names = [
    "Lead-in · 情境导入",
    "Explore · 范例探究",
    "Plan · 写前构思",
    "Write · 独立写作",
    "Review · 同伴互评",
    "Reflect · 总结迁移",
  ];
  const teachers = [
    `呈现与“${info.topic}”相关的写作情境，明确读者与写作目的。请学生用一个句子描述想要传达的信息。`,
    `出示一篇与“${info.topic}”相关的${info.lessonType}范例，引导学生标注开头、主体和结尾，归纳衔接语。`,
    "展示写作规划表，帮助学生整理关键内容与段落关系。提供句型支架，要求学生自主选择而非照抄。",
    `发布${info.lessonType}写作任务。巡视并记录共性问题，对需要支持的学生提供词汇或句式提示，不直接替写。`,
    "公布内容、结构、语言三维量规。示范一条具体反馈，组织同伴交换作品，并安排学生进行修改。",
    "请学生用离堂条写出本节课最有效的策略和下一次需要改进之处。回扣目标并布置分层作业。",
  ];
  const students = [
    "观察情境，讨论读者需求，明确任务并分享初步想法。",
    "标注范例的结构与关键表达，比较不同段落的功能，小组总结写作特征。",
    "独立完成规划表，与同伴核对信息完整性，并选择适合自己的语言表达。",
    `依据规划独立完成“${info.topic}”初稿，检查段落衔接与语气。`,
    "按量规提供一条优点和一条改进建议，采纳有依据的反馈，保留修改记录。",
    "填写离堂条，回顾学习成果，选择适合自身情况的课后任务。",
  ];
  const purposes = [
    "建立真实交际动机，激活主题知识。",
    "通过观察建立体裁与篇章意识。",
    "降低认知负荷，为独立表达提供支架。",
    "把结构与语言知识转化为独立写作能力。",
    "发展评价意识和自主修订能力。",
    "收集即时证据，为下一轮教学提供依据。",
  ];
  return {
    textbookAnalysis: analysis.theme,
    studentAnalysis: analysis.students,
    objectives: analysis.objectives,
    focus: analysis.focus,
    difficulties: analysis.difficulties,
    methods: analysis.strategies,
    resources: ["写作任务单", "体裁范例", "写作规划表", "同伴互评量规"],
    stages: names.map((name, i) => ({
      id: `stage-${i + 1}`,
      name,
      duration: durations[i],
      teacherActivities: teachers[i],
      studentActivities: students[i],
      purpose: purposes[i],
      materials:
        i === 1 ? ["体裁范例"] : i === 4 ? ["同伴互评量规"] : ["写作任务单"],
    })),
    assessment:
      "采用内容、结构、语言三维评价：内容是否回应任务且信息完整；结构是否清晰且衔接合理；语言是否准确并符合交际语域。结合规划表、初稿、互评记录与修改稿观察目标达成，不仅关注成品分数。",
    homework: `基础任务：根据课堂反馈修改“${info.topic}”写作，并用中文说明两处修改理由。拓展任务：调整写作对象或交际情境，再完成一份${info.lessonType}作品。`,
    boardDesign: `${info.topic}\nPurpose → Audience → Structure\nPlan → Draft → Review → Revise\nChecklist: Content / Organization / Language`,
    reflection: "",
  };
}
export function sampleReflection(
  notes: string,
  topic: string,
): ReflectionReport {
  return {
    overall: `围绕“${topic}”的课堂完成了从范例观察到写作修订的设计。当前为演示报告，仅依据已提供反馈提出待验证的改进方向，不代表实际测量结果。`,
    goalAchievement:
      "需对照初稿、修改稿和互评记录检查每项教学目标。现有反馈不足以计算达成比例，建议下一次收集可比较的写作样本。",
    activityAnalysis:
      "检查范例观察是否直接支持了独立写作，关注学生能否在没有范例的情况下组织段落。",
    participation:
      "通过规划表完成情况、讨论记录与互评质量观察不同学生的参与，避免仅依据举手次数判断。",
    timeAllocation:
      "建议记录实际活动起止时间，特别关注写作与修改是否被前半节讨论挤占。",
    writingDevelopment:
      "重点比较信息完整性、段落衔接和语域恰当性，保留学生的修改理由作为学习证据。",
    studentFeedback: notes
      ? `教师提供的反馈记录：${notes.slice(0, 900)}。以上为反馈原文摘要，仍需结合学生作品验证。`
      : "未提供学生反馈，无法判断学生感受。建议增加匿名离堂条。",
    problems: [
      "现有反馈证据无法完整覆盖每项教学目标。",
      "需要确认不同水平学生获得支架后能否独立完成写作。",
    ],
    suggestions: [
      "把同伴互评量规简化为三条可观察标准，每人提供一条具体修改建议。",
      "在独立写作前安排一次简短规划核对，提前发现信息遗漏。",
      "保留写作与修改时间，课后对比初稿和修改稿。",
    ],
    nextLesson:
      "下一轮保留完整写作过程，增加分层语言支架与规划核对，在评价阶段要求学生说明修改理由。",
  };
}
export class MockAIProvider implements AIProvider {
  readonly model = "演示模型（规则生成）";
  async chat(messages: Message[]): Promise<AIResult<string>> {
    return {
      data: `【演示回答】${messages.at(-1)?.content.slice(0, 100)}\n建议先明确写作目的与读者，再从结构和语言两方面引导学生观察范例。此内容用于流程体验，真实回答需配置模型。`,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
  async generateStructured<T>(
    _messages: Message[],
    schema: z.ZodType<T>,
  ): Promise<AIResult<T>> {
    throw new Error(
      `演示模型需由业务服务提供符合 ${schema.description || "结构"} 的示例。`,
    );
  }
  async *streamChat(messages: Message[]) {
    const result = await this.chat(messages);
    for (let i = 0; i < result.data.length; i += 12)
      yield result.data.slice(i, i + 12);
  }
}
