import { z } from "zod";
import type { AIProvider, AIResult, Message } from "./types";
import type {
  BasicInfo,
  LessonAnalysis,
  LessonContent,
  ReflectionReport,
  MaterialAnalysis,
  LessonDesign,
  LessonSession,
} from "@/types/lesson";
import {
  getLessonDurations,
  syncStages,
  lessonDesignSchema,
} from "@/types/lesson";
export function sampleMaterialAnalysis(info: BasicInfo): MaterialAnalysis {
  return {
    unitTheme: "待教师确认：演示模型不能核实教材单元主题。",
    unitGoals: [],
    unitStructure: "待教师确认：需要单元目录或整个 Unit 的资料。",
    currentScope:
      info.teachingScope || "待教师确认：未指定实际教学页码或板块。",
    currentScopeRole:
      "待教师确认：请依据教材确认本板块的功能；建议将本次材料中的结构与语言用于后续表达任务。",
    priorLearning: "待教师确认：不能仅凭单元编号推断学生已经学习的内容。",
    nextLearning: "待教师确认：后续教材板块尚未核实。",
    contentAnalysis: `围绕教师指定的“${info.topic}”分析材料的任务、语篇结构和语言。只教授 ${info.teachingScope || "教师确认的实际范围"}；其他内容用于上下文。`,
    transferableResources: [
      "内容：记录教材观点及其依据",
      "结构：归纳各段功能与信息顺序",
      "语言：从提供的材料提取恰当表达",
      "策略：定位信息、规划表达并根据反馈修改",
    ],
    lessonSplitSuggestion:
      info.lessonMode === "double"
        ? [
            `第一课时 ${info.lessonDurations?.[0]} 分钟：理解本次教材内容，形成结构和语言资源表。`,
            `第二课时 ${info.lessonDurations?.[1]} 分钟：调用资源表完成表达任务、评价与修改；具体课型待教材确认。`,
          ]
        : [`单课时 ${info.duration} 分钟：教材探究与目标应用。`],
    continuity:
      "第一课时的教材内容、结构与语言资源表作为第二课时规划和表达的输入。具体承接方式需结合教材确认。",
    uncertainties: [
      "官方单元主题、整体目标与前后板块需核实",
      "演示内容是教学建议，不是教材事实",
    ],
  };
}
export function sampleAnalysis(
  info: BasicInfo,
  hasReferences = false,
): LessonAnalysis {
  const profileLabels: Record<string, string> = {
    grade: "年级",
    className: "班级",
    size: "人数",
    level: "整体英语水平",
    reading: "阅读基础",
    writing: "写作基础",
    problems: "常见问题",
    strengths: "优势",
    differentiation: "分层情况",
    habits: "学习习惯与课堂特点",
    notes: "教师补充说明",
  };
  return {
    inferredInfo: {
      title: info.title || `${info.teachingScope || "教材任务"}教学设计`,
      textbook: info.textbook || "未指定",
      unit: info.unit || "未指定",
      topic: info.topic || "所选教材任务（演示模式待教师确认）",
      lessonType: info.lessonType,
    },
    sequenceRationale:
      info.lessonMode === "double"
        ? "第一课时理解教材并提取内容、结构和语言资源；第二课时调用这些产出进行表达、反馈与修订，具体分工需结合教材证据确认。"
        : "围绕教材任务完成探究、应用与反馈，形成可检查的学习作品。",
    lessons: getLessonDurations(info).map((duration, i) => ({
      id: `lesson-${i + 1}`,
      lessonNumber: i + 1,
      duration,
      title: i === 0 ? "教材探究与任务规划" : "表达、评价与修订",
      topic: info.topic || "所选教材任务",
      objectives:
        i === 0
          ? ["识别教材任务目的与结构", "提取有依据的内容和语言资源"]
          : ["调用第一课时资源完成表达", "依据标准评价并说明修订理由"],
      coreContent: `仅在 ${info.teachingScope || "所选教材"} 内组织学习`,
      keyPoints:
        i === 0 ? "用教材证据解释信息与结构" : "将资源转为清楚、连贯的表达",
      difficultPoints:
        i === 0 ? "说明信息选择的依据" : "根据读者与任务调整表达",
      textbookTask: "按照已提供教材任务组织活动，原题待教师核实",
      expectedOutcome:
        i === 0 && info.lessonMode === "double"
          ? "教材内容、结构和语言资源表"
          : "规划表、表达作品与修订说明",
      previousConnection:
        i > 0 ? "调用上一课时资源表" : "依据已确认学情激活经验",
      nextConnection:
        i === 0 && info.lessonMode === "double"
          ? "资源表供下一课时规划与表达"
          : "保留作品用于课后评价",
    })),
    theme: `围绕“${info.topic}”组织${info.lessonType}写作，连接真实交际情境，经历理解任务、积累表达、独立写作与修改的过程。`,
    students: info.classProfile
      ? Object.entries(info.classProfile)
          .filter(([key]) => key !== "documentIds")
          .map(
            ([key, value]) =>
              `${profileLabels[key] || key}：${value || "待教师确认"}`,
          )
          .join("\n")
      : hasReferences
        ? "已提供参考资料。当前为演示分析，请教师结合资料中的实际表现确认学情：学生的篇章组织、语域选择与表达准确性需要分别诊断。"
        : "尚未提供班级学情。建议课前用简短写作诊断学生的篇章结构、词汇与衔接能力；以下建议需要教师确认。",
    objectives: [
      info.objectives ||
        `学生能识别${info.lessonType}的写作目的、读者与基本结构。`,
      `学生能调用教材中与“${info.topic}”相关的内容、结构或语言完成表达任务。`,
      "学生能依据本任务评价标准开展同伴互评，并说明修改理由。",
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
    materialAnalysis: sampleMaterialAnalysis(info),
  };
}
export function sampleLegacyLesson(
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
const genreCriteria: Record<string, string[]> = {
  应用文: [
    "任务完成：读者需要的信息是否完整？",
    "组织：信息顺序是否清晰？",
    "语域与语言：语气是否符合对象和目的？",
  ],
  议论文: [
    "立场：观点是否清楚？",
    "证据：理由是否支持观点？",
    "论证组织：观点与依据之间的关系是否清晰？",
    "语言：衔接和表达是否准确？",
  ],
  读后续写: [
    "情节连贯：发展是否与原文一致？",
    "原文联系：是否回应原文线索？",
    "人物一致：人物行为是否合理？",
    "语言：叙述与衔接是否恰当？",
  ],
};
export function sampleLesson(
  info: BasicInfo,
  analysis = sampleAnalysis(info),
): LessonContent {
  const durations = getLessonDurations(info);
  const criteria = genreCriteria[info.lessonType] || [
    "内容是否回应任务？",
    "组织是否清晰？",
    "语言是否适切？",
  ];
  const readingFirst =
    info.lessonMode === "double" &&
    /reading|阅读|读写/i.test(`${info.requirements} ${info.teachingScope}`);
  const lessonTitles = readingFirst
    ? [
        "Reading & Exploring Text Structure",
        "Applying Text Resources in Writing",
      ]
    : [
        "Exploring the Task and Building Resources",
        "Application, Feedback and Revision",
      ];
  const lessons: LessonSession[] = durations.map((duration, li) => {
    const base = sampleLegacyLesson({ ...info, duration }, analysis);
    const isInput = durations.length === 2 && li === 0;
    const names = isInput
      ? [
          "Orient · 任务定位",
          "Read · 教材理解",
          "Check · 信息与证据核对",
          "Explore · 结构探究",
          "Collect · 语言资源提取",
          "Connect · 产出整理",
        ]
      : base.stages.map((s) => s.name);
    const questions = isInput
      ? [
          "What is the task asking us to understand?",
          "What is the main idea of this section?",
          "Which part of the text supports your answer?",
          "How does the writer organize the ideas?",
          "Which expressions help the writer achieve the purpose?",
          "What can we use in the next lesson?",
        ]
      : [
          "Who is your reader and what do they need?",
          "How does this text achieve its purpose?",
          "Which ideas and expressions will you use?",
          "How does this paragraph support your purpose?",
          "What specific change would make this clearer?",
          "What did you revise and why?",
        ];
    const prompts = isInput
      ? [
          "圈出教材任务中的关键词，说明本次范围和阅读目的",
          "阅读实际教学范围内的语篇，标注主要信息，完成教材已有问题（题目原文待资料核实）",
          "返回教材定位答案依据，两人比较并说明理由",
          "标注段落功能，填写结构图，不预设教材不存在的段落",
          "提取教材中的内容与表达，记录适用情境，避免抄录未提供的原文",
          "整理教材内容、结构、语言资源表，并标出下节课可调用的项目",
        ]
      : [
          "呈现本次教材任务并圈出对象和目的",
          "在实际授课范围中标注结构与关键表达",
          li === 1
            ? "取出第一课时资源表，选用内容、结构和表达填写规划表"
            : "依据教材材料填写内容与段落规划表",
          "依据规划独立写作，教师巡视提供提示而不替写",
          "交换作品，依据本任务量规给出具体反馈并修改",
          "提交离堂条，说明修改理由与后续需要的支持",
        ];
    const stages = base.stages.map((stage, si) => {
      const id = `stage-${li * 6 + si + 1}`;
      const objectiveIds = [
        `O${Math.min(isInput ? (si < 2 ? 1 : 2) : li === 1 ? (si < 4 ? 2 : 3) : si < 2 ? 1 : si < 4 ? 2 : 3, analysis.objectives.length)}`,
      ];
      const evidence = isInput
        ? "学生在教材中标注的信息、答案依据和资源表。"
        : "学生的规划表、初稿、反馈记录和修改说明。";
      return {
        ...stage,
        id,
        name: names[si],
        teacherActivities: `指定教材依据：${info.teachingScope || "实际授课范围待教师确认"}。${prompts[si]}。`,
        studentActivities: `独立完成任务，再与同伴比较，并提交可观察的学习产出。${li === 1 ? "调用第一课时的资源表。" : ""}`,
        activities: [
          {
            id: `${id}-activity-1`,
            title: names[si],
            duration: stage.duration,
            objectiveIds,
            teacherActions: [
              `指定教材依据：${info.teachingScope || "待教师确认"}；${prompts[si]}。`,
              `提出问题：${questions[si]}`,
              "请学生展示依据，追问理由并记录需要进一步支持的学生。",
            ],
            studentActions: [
              prompts[si],
              "两人比较答案或作品，指出依据，再完善自己的记录。",
            ],
            questions: [
              {
                question: questions[si],
                expectedResponse:
                  "学生能结合教材信息、任务目的或自己的作品解释选择。",
                followUp: "What evidence or example supports your choice?",
              },
            ],
            teachingAim: stage.purpose,
            materials: [
              `${info.teachingScope || "实际教学范围"}的教材材料（原文待核实）`,
              "任务单与资源表",
            ],
            scaffolds: [
              "Main idea / Supporting information / Useful expression / How I can use it",
              "I think ... because ... / The text shows ... / I would revise ... because ...",
            ],
            differentiation:
              "需要支持的学生先用关键词和句首提示；学有余力者补充证据或比较不同表达效果。实际分层依据班级档案确认。",
            evidence,
            successCriteria: [
              isInput
                ? "能够在所提供教材中指出信息依据并解释其作用。"
                : criteria[Math.min(si % criteria.length, criteria.length - 1)],
            ],
            connection:
              li === 1
                ? "调用第一课时的内容、结构或语言资源，形成可反馈与修订的作品。"
                : si === 5 && isInput
                  ? "资源表交给第二课时使用。"
                  : "保留本活动记录，供下一活动定位信息、规划或修改时使用。",
          },
        ],
      };
    });
    return {
      id: `lesson-${li + 1}`,
      lessonNumber: li + 1,
      title: durations.length === 1 ? info.title : lessonTitles[li],
      duration,
      objectives:
        durations.length === 1
          ? analysis.objectives
          : [
              ...new Set(
                (isInput ? [0, 1] : [1, 2]).map((i) =>
                  Math.min(i, analysis.objectives.length - 1),
                ),
              ),
            ].map((i) => analysis.objectives[i]),
      objectiveIds:
        durations.length === 1
          ? analysis.objectives.map((_, i) => `O${i + 1}`)
          : [
              ...new Set(
                (isInput ? [0, 1] : [1, 2]).map((i) =>
                  Math.min(i, analysis.objectives.length - 1),
                ),
              ),
            ].map((i) => `O${i + 1}`),
      stages,
      assessment: isInput
        ? "依据教材信息标注、任务答案、结构图和资源表，检查信息理解与依据是否一致。"
        : criteria.join("\n"),
      resources: ["教材实际教学范围", "教材资源表", "课堂任务单"],
      output: isInput
        ? "教材信息核对表、段落功能图、内容与语言资源表。"
        : "规划表、作品初稿、互评记录、修改稿与修改理由。",
      homework: isInput
        ? "整理资源表；第二课时带回并用于任务规划。不扩大实际授课页码。"
        : base.homework,
      keyPoints: analysis.lessons?.[li]?.keyPoints || analysis.focus,
      difficultPoints:
        analysis.lessons?.[li]?.difficultPoints || analysis.difficulties,
      learningOutcome: isInput
        ? "教材证据、结构图和语言资源表"
        : "表达作品、互评记录和修改理由",
      blackboardDesign: {
        title: `${info.topic || "教材任务"} · Lesson ${li + 1}`,
        sections: [
          {
            heading: "任务与读者",
            lines: ["Purpose → Audience → Required information"],
          },
          {
            heading: isInput ? "教材信息与结构" : "表达结构",
            lines: [
              "Claim / Main idea → Supporting evidence → Explanation",
              "Paragraph function → Connection to purpose",
            ],
          },
          {
            heading: "语言支架",
            lines: [
              "I think … because …",
              "The text shows … / This evidence suggests …",
            ],
          },
          {
            heading: "评价与修订",
            lines: [...criteria, "Feedback → Revision → Reason"],
          },
        ],
        connections: [
          isInput
            ? "教材证据 → 资源表 → 下一课时规划"
            : "资源表 → 规划 → 初稿 → 反馈 → 修改稿",
        ],
      },
    };
  });
  let previousActivity: string | undefined;
  lessons.forEach((lesson, li) => {
    const longest = lesson.stages.reduce((largest, s) =>
      s.duration > largest.duration ? s : largest,
    );
    longest.duration -= 2;
    longest.activities![0].duration -= 2;
    const last = lesson.stages.at(-1)!;
    lesson.stages.push({
      ...last,
      id: `homework-${li + 1}`,
      name: "Homework · 作业布置",
      duration: 2,
      kind: "homework",
      teacherActivities: `说明作业任务：${lesson.homework}`,
      studentActivities: "复述任务要求，记下材料，提出尚不清楚的问题。",
      purpose: "将本课时产出用于课后巩固或下一课时输入。",
      activities: [
        {
          ...last.activities![0],
          id: `homework-${li + 1}-activity`,
          title: "说明作业与检查任务理解",
          duration: 2,
          teacherActions: [
            `布置：${lesson.homework}`,
            "请学生复述需要提交的作品和评价依据，澄清遗漏。",
          ],
          studentActions: [
            "记录作业任务、资源与提交要求。",
            "向同伴复述任务，检查理解。",
          ],
          questions: [
            {
              question:
                "What will you bring or submit, and how will you check it?",
              expectedResponse: "说明需要提交的资源表或修改稿，指明评价依据。",
              followUp: "Which classroom resource will help you?",
            },
          ],
          teachingAim: "确保学生能独立完成延伸任务，保持学习连续性。",
        },
      ],
    });
    lesson.stages.forEach((stage, si) => {
      stage.kind = stage.kind || "teaching";
      stage.activities?.forEach((a) => {
        a.operations = a.teacherActions.flatMap((instruction, i) => [
          {
            actor: "teacher" as const,
            grouping: "whole_class" as const,
            instruction,
          },
          ...(a.studentActions[i]
            ? [
                {
                  actor: "students" as const,
                  grouping:
                    i === 0 ? ("individual" as const) : ("pair" as const),
                  instruction: a.studentActions[i],
                },
              ]
            : []),
        ]);
        a.resourceIds = [si === 4 ? "rubric" : "worksheet"];
        a.sourceBindings = [];
        a.inputFromActivityIds = previousActivity ? [previousActivity] : [];
        a.output =
          stage.kind === "homework"
            ? "已记录并复述的课后任务与检查标准"
            : `${li === 0 && lessons.length > 1 ? "教材证据与资源表记录" : "规划、作品或反馈记录"}：${a.studentActions[0]}`;
        previousActivity = a.id;
      });
    });
  });
  const base = sampleLegacyLesson(
    { ...info, duration: durations[0] },
    analysis,
  );
  return syncStages({
    ...base,
    goals: analysis.objectives.map((text, i) => ({ id: `O${i + 1}`, text })),
    displayInfo: {
      title: info.title || "教材任务教学设计",
      grade: info.grade,
      className: info.className,
      textbook: info.textbook || "未指定",
      unit: info.unit || "未指定",
      topic: info.topic || "教材任务",
      lessonType: info.lessonType,
      teachingScope: info.teachingScope || "",
      referenceScope: info.referenceScope || "",
    },
    lessons,
    assessment: criteria.join("\n"),
    materialAnalysis: analysis.materialAnalysis || sampleMaterialAnalysis(info),
    lessonConnection:
      lessons.length === 2
        ? {
            priorLearning: "第一课时理解教材任务并整理可迁移资源。",
            firstLessonOutput: lessons[0].output,
            secondLessonInput: "第一课时的内容核对表、结构图与语言资源表。",
            transition:
              "第二课时先展示第一课时产出，核对后将其转为规划与表达支架。",
            sharedGoal:
              "在教师指定教材范围内完成从理解到应用、评价和修改的学习过程。",
          }
        : undefined,
    teachingMaterials: [
      {
        id: "worksheet",
        title: "教材与规划任务单",
        content:
          "Text reference: ____\nMain idea: ____\nEvidence in the text: ____\nParagraph function: ____\nUseful expression: ____\nPurpose / Audience: ____\nMy plan: ____\n说明：依据实际提供的教材填写，不预填教材原文。",
      },
      {
        id: "rubric",
        title: "同伴评价工具",
        content: `${criteria.join("\n")}\nA strength and its evidence: ____\nA suggested change and its reason: ____\nMy revision: ____`,
      },
      {
        id: "exit-ticket",
        title: "离堂条",
        content:
          "What did I learn from the text? ____\nWhich resource did I use? ____\nWhat did I revise and why? ____\nWhat support do I still need? ____",
      },
    ],
    pptSuggestions: [
      "呈现实际教材范围及任务目的",
      "呈现教材任务与可填写结构图，不伪造原文",
      "展示资源表、规划表与任务量规",
      "展示反馈示范和离堂条",
    ],
  });
}

// Deterministic English demo. Arbitrary Chinese teacher data is explicitly left
// pending confirmation rather than presented as a fabricated translation.
export function sampleEnglishDesign(
  info: BasicInfo,
  source: LessonDesign,
): LessonDesign {
  const safe = (value: string | undefined, fallback: string) =>
    value && !/[\u3400-\u9fff]/.test(value) ? value : fallback;
  const genre: Record<string, string> = {
    应用文: "Practical writing",
    议论文: "Argumentative writing",
    读后续写: "Continuation writing",
    概要写作: "Summary writing",
    记叙文: "Narrative writing",
    说明文: "Expository writing",
    其他: "Other",
  };
  const criteria =
    info.lessonType === "议论文"
      ? [
          "Is the position clear?",
          "Does the evidence support the claims?",
          "Is the argument logically organized?",
          "Is the language appropriate?",
        ]
      : info.lessonType === "读后续写"
        ? [
            "Is the plot coherent?",
            "Does it connect with the original text?",
            "Are the characters consistent?",
            "Is the narrative language appropriate?",
          ]
        : [
            "Does the text complete the task and include the reader's required information?",
            "Is the organization clear?",
            "Are register and language appropriate for the audience?",
          ];
  const english = structuredClone(source);
  english.goals = source.goals?.map((g, i) => ({
    ...g,
    text:
      [
        "Identify the task purpose, audience and organization.",
        "Apply content, structure and language resources.",
        "Evaluate and revise using task-specific criteria.",
      ][i] || "Apply the confirmed learning objective.",
  }));
  english.curriculumStandards = "";
  english.designRationale =
    "Use the specified textbook task to connect understanding, planning, application and revision. Adjust support using the confirmed class profile.";
  english.textbookAnalysis =
    "Use only the specified teaching pages or section for the main classroom tasks. Other unit materials provide context or support. Textbook facts require confirmation from the supplied material.";
  english.studentAnalysis =
    "Use the teacher-confirmed class profile. Missing information and the English rendering of teacher-supplied Chinese details require teacher confirmation in demo mode.";
  english.objectives = source.objectives.map(
    (_, i) =>
      [
        "Identify the purpose, audience and organization of the textbook task.",
        "Apply relevant content, structure and language resources to the task.",
        "Use task-specific criteria to give feedback and explain revisions.",
      ][i] ||
      "Apply the teacher-confirmed learning objective; wording pending confirmation.",
  );
  english.focus =
    "Select relevant information and organize it for the intended purpose and audience.";
  english.difficulties =
    "Connect ideas coherently and adjust language and register to the task.";
  english.methods = source.methods.map(
    (_, i) =>
      [
        "Task-based learning",
        "Text exploration and scaffolding",
        "Process approach",
        "Peer feedback",
      ][i] || "Teacher-confirmed strategy",
  );
  english.resources = source.resources.map(
    (_, i) =>
      [
        "Task worksheet",
        "Supplied textbook material",
        "Planning organizer",
        "Peer assessment rubric",
      ][i] || "Classroom resource",
  );
  english.assessment = criteria.join("\n");
  english.homework =
    "Revise the classroom output using feedback and explain the changes. Extend the task by considering a different audience when appropriate.";
  english.boardDesign = `${safe(info.topic, "Selected topic")}\nPurpose → Audience → Structure\nText resources → Plan → Apply → Review → Revise`;
  english.reflection = source.reflection
    ? "Reflect on the available learning evidence, activity timing and effectiveness of support. Specific findings require teacher confirmation."
    : "";
  english.displayInfo = {
    title: `${safe(info.topic, "Textbook Task")} Lesson Design`,
    grade: { 高一: "Grade 10", 高二: "Grade 11", 高三: "Grade 12" }[info.grade],
    className: info.className
      ? `Class ${info.className.match(/[0-9]+/g)?.join(" ") || "to be confirmed"}`
      : "Class to be confirmed",
    textbook: safe(
      info.textbook,
      "Selected textbook (English name to be confirmed)",
    ),
    unit: safe(
      info.unit,
      `Unit ${info.unit.match(/Unit\s*\d+/i)?.[0].replace(/Unit\s*/i, "") || "to be confirmed"}`,
    ),
    topic: safe(info.topic, "Topic to be confirmed"),
    lessonType: genre[info.lessonType],
    teachingScope: safe(
      info.teachingScope,
      info.teachingScope?.match(/P\s*\d+\s*[-–—]\s*\d+/i)?.[0] ||
        "Teaching scope to be confirmed",
    ),
    referenceScope: safe(
      info.referenceScope,
      info.referenceWholeUnit !== false
        ? `Entire ${info.unit.match(/Unit\s*\d+/i)?.[0] || "unit (to be confirmed)"}`
        : "Teacher-selected reference scope (to be confirmed)",
    ),
  };
  if (source.materialAnalysis)
    english.materialAnalysis = {
      unitTheme: "Unit theme pending verification against the textbook.",
      unitGoals: source.materialAnalysis.unitGoals.map(
        () => "Official unit goal pending verification.",
      ),
      unitStructure: "Unit organization pending textbook verification.",
      currentScope: english.displayInfo.teachingScope,
      currentScopeRole:
        "Use the specified section to develop understanding and transferable resources; its exact unit role requires confirmation.",
      priorLearning:
        "Previous textbook learning requires teacher confirmation.",
      nextLearning:
        "Subsequent textbook learning requires teacher confirmation.",
      contentAnalysis: english.textbookAnalysis,
      transferableResources: source.materialAnalysis.transferableResources.map(
        (_, i) =>
          [
            "Content and supporting evidence",
            "Text organization",
            "Relevant language resources",
            "Planning and revision strategies",
          ][i] || "Transferable resource",
      ),
      lessonSplitSuggestion: source.materialAnalysis.lessonSplitSuggestion.map(
        (_, i) =>
          `Lesson ${i + 1}: ${i === 0 ? "understanding and resource building" : "application, feedback and revision"}. Confirm the division against the supplied textbook.`,
      ),
      continuity:
        "Carry the first lesson's content, structure and language organizer into the second lesson.",
      uncertainties: source.materialAnalysis.uncertainties.map(
        () =>
          "Textbook information or teacher-supplied wording requires verification in demo mode.",
      ),
    };
  if (source.lessonConnection)
    english.lessonConnection = {
      priorLearning:
        "Understand the textbook task and organize transferable resources in Lesson 1.",
      firstLessonOutput:
        "Text evidence table, paragraph organizer and language resource bank.",
      secondLessonInput:
        "The content, structure and language resources produced in Lesson 1.",
      transition:
        "Review the first lesson's organizers and use them to plan and complete the second lesson's task.",
      sharedGoal:
        "Move from textbook understanding to application, feedback and revision within the teaching scope.",
    };
  english.lessons = source.lessons?.map((l, li) => ({
    ...l,
    keyPoints: "Use textbook evidence to explain ideas and organization.",
    difficultPoints: "Select relevant evidence and explain language choices.",
    learningOutcome:
      li === 0 && source.lessons?.length === 2
        ? "Text evidence and language resource organizer."
        : "Draft, feedback and revision reasons.",
    blackboardDesign: l.blackboardDesign
      ? {
          title: "Task and Learning Resources",
          sections: l.blackboardDesign.sections.map((s, i) => ({
            heading:
              [
                "Purpose and Audience",
                "Organization",
                "Language Support",
                "Assessment and Revision",
              ][i] || "Learning Resources",
            lines: s.lines.map((line, n) =>
              /[\u3400-\u9fff]/.test(line)
                ? criteria[n % criteria.length]
                : line,
            ),
          })),
          connections: l.blackboardDesign.connections.map(
            () =>
              "Text evidence → Resource bank → Plan → Draft → Feedback → Revise",
          ),
        }
      : undefined,
    title:
      source.lessons?.length === 1
        ? english.displayInfo!.title
        : [
            "Understanding the Text and Building Resources",
            "Application, Feedback and Revision",
          ][li],
    objectives: l.objectives.map(
      (_, i) =>
        english.objectives[Number(l.objectiveIds[i].slice(1)) - 1] ||
        "Apply the confirmed learning objective.",
    ),
    assessment: english.assessment,
    resources: l.resources.map(
      () => "Supplied textbook and classroom organizer",
    ),
    output:
      li === 0 && source.lessons?.length === 2
        ? "Text evidence table, paragraph organizer and language resource bank."
        : "Plan, draft, feedback record and revised output.",
    homework:
      li === 0 && source.lessons?.length === 2
        ? "Complete the resource organizer and bring it to Lesson 2."
        : english.homework,
    stages: l.stages.map((s, si) => ({
      ...s,
      name: `${si + 1}. ${source.lessons?.length === 2 && li === 0 ? ["Orient", "Understand", "Check evidence", "Explore organization", "Collect language", "Prepare transition"][si] : ["Lead-in", "Explore", "Plan", "Apply", "Review", "Reflect"][si] || "Learning activity"}`,
      teacherActivities:
        "Direct students to the specified textbook section. Explain the task, ask for evidence and check the submitted learning output.",
      studentActivities:
        "Complete the task independently, compare with a partner and explain the evidence for your choices.",
      purpose:
        "Connect textbook understanding and resources to the learning objective.",
      materials: s.materials.map(
        () => "Specified textbook material and task worksheet",
      ),
      activities: s.activities?.map((a) => ({
        ...a,
        operations: a.operations?.map((op) => ({
          ...op,
          instruction:
            op.actor === "teacher"
              ? "Locate the specified textbook task, invite evidence and give concrete feedback."
              : "Complete the task, compare with a partner and revise using evidence.",
        })),
        output: "Text organizer, plan, draft or feedback record.",
        title: `${si + 1}. ${source.lessons?.length === 2 && li === 0 ? ["Orient", "Understand", "Check evidence", "Explore organization", "Collect language", "Prepare transition"][si] : ["Lead-in", "Explore", "Plan", "Apply", "Review", "Reflect"][si] || "Learning activity"}`,
        teacherActions: a.teacherActions.map(
          (_, index) =>
            [
              "Locate the task within the specified teaching scope and explain its purpose.",
              "Ask students to identify relevant information and show supporting evidence.",
              "Invite partners to compare their work and give specific feedback.",
            ][index] ||
            "Teacher-requested adaptation requires confirmation of its English wording in demo mode.",
        ),
        studentActions: a.studentActions.map(
          (_, index) =>
            [
              "Complete the textbook or application task and record evidence.",
              "Compare choices with a partner and revise the output.",
            ][index] ||
            "Explain the learning output and the evidence for your choices.",
        ),
        questions: a.questions.map((q) => ({
          question: q.question,
          expectedResponse:
            "Students explain their choices using the textbook, task purpose or their own work.",
          followUp: "What evidence or example supports your choice?",
        })),
        teachingAim:
          "Make the linked learning objective visible through student work.",
        materials: a.materials.map((_, i) =>
          i === 0
            ? "Specified textbook section"
            : "Task worksheet and resource bank",
        ),
        scaffolds: a.scaffolds.map((value) =>
          safe(
            value,
            "Main idea / Supporting evidence / Useful expression / How I can use it",
          ),
        ),
        differentiation:
          "Provide keywords and sentence starters where needed; invite confident learners to compare evidence or language choices.",
        evidence:
          "Text annotations, organizers, drafts, feedback and explanations of revisions.",
        successCriteria: a.successCriteria.map(() => criteria[0]),
        connection:
          li === 1
            ? "Use the content, structure and language resources produced in Lesson 1."
            : "Retain this activity's output for the next task or lesson.",
      })),
    })),
  }));
  english.teachingMaterials = source.teachingMaterials?.map((m, i) => ({
    ...m,
    title:
      ["Text and Planning Worksheet", "Peer Assessment Rubric", "Exit Ticket"][
        i
      ] || "Classroom material",
    content:
      [
        "Text reference: ____\nMain idea: ____\nSupporting evidence: ____\nParagraph function: ____\nUseful expression: ____\nPurpose / Audience: ____\nMy plan: ____",
        `${criteria.join("\n")}\nA strength and its evidence: ____\nA suggested change and reason: ____\nMy revision: ____`,
        "What did I learn from the text? ____\nWhich resource did I use? ____\nWhat did I revise and why? ____\nWhat support do I still need? ____",
      ][i] || "Complete the task using the supplied textbook material.",
  }));
  english.pptSuggestions = source.pptSuggestions?.map(
    (_, i) =>
      [
        "Teaching scope and task purpose",
        "Textbook task and paragraph organizer",
        "Resource bank, planning worksheet and rubric",
        "Feedback model and exit ticket",
      ][i] || "Classroom task slide",
  );
  if (!english.lessons)
    english.stages = source.stages.map((s) => ({
      ...s,
      name: safe(s.name, "Teaching stage"),
      teacherActivities:
        "Explain the confirmed classroom task and check student evidence.",
      studentActivities:
        "Complete the task and explain choices using evidence.",
      purpose: "Support the confirmed learning objective.",
      materials: s.materials.map(() => "Teacher-selected material"),
    }));
  return lessonDesignSchema.parse(syncStages(english));
}
export function sampleReflection(
  notes: string,
  topic: string,
  lessons?: LessonSession[],
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
    lessonReports: lessons?.map((lesson) => ({
      lessonId: lesson.id,
      title: lesson.title,
      goalAchievement: `${lesson.objectiveIds.join(" / ")}：对照本课时活动证据与达成标准检查，当前不能计算达成率。`,
      activityAnalysis: `检查本课时“${lesson.title}”的活动产出是否支持目标；未提供该课时作品时证据不足。`,
      timeAllocation: `本课时设计为 ${lesson.duration} 分钟；需核对实际活动起止记录。`,
      evidence: `待核实的学习产出：${lesson.output}。现有课堂记录需教师按课时归属确认。`,
      suggestions: ["保留本课时任务记录，按关联目标检查学生表现与修改理由。"],
    })),
    continuityAnalysis:
      lessons?.length === 2
        ? "需要核对第一课时的资源表与第二课时作品，确认学生确实调用了先前的内容、结构或语言；当前反馈不能证明衔接效果。"
        : undefined,
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
