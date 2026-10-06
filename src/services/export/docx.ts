import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { getLessons, type BasicInfo, type LessonContent } from "@/types/lesson";
import { designView } from "@/lib/canonical-plan";

const escapeXML = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function fill(xml: string, values: Record<string, string>) {
  return xml.replace(/\{\{([A-Z_]+)\}\}/g, (token, key: string) => {
    if (!(key in values)) return token;
    // Each token occupies a single source run. Breaks keep its font and cell.
    return values[key]
      .split(/\r?\n/)
      .map(escapeXML)
      .join('</w:t><w:br/><w:t xml:space="preserve">');
  });
}

export async function exportLesson(
  info: BasicInfo,
  content: LessonContent,
  designer = "",
  language: "zh" | "en" = "zh",
) {
  const en = language === "en";
  const design = content.canonical
    ? designView(content, language)
    : en
      ? content.english
      : content;
  if (!design) throw new Error("英文版尚未生成，请先生成英文对应版本。");
  const display = en ? design.displayInfo : undefined;
  const lessons = getLessons(design, info);
  const label = (zh: string, english: string) => (en ? english : zh);
  // Converted once from the supplied 2026 DOC, retaining its table package.
  // Production export needs neither Word/Python nor the original local path.
  const zip = await JSZip.loadAsync(
    await readFile(
      join(process.cwd(), "public", "templates", "classroom-design-2026.docx"),
    ),
  );
  const part = zip.file("word/document.xml");
  if (!part) throw new Error("教学设计模板不可用。");
  let xml = await part.async("string");
  if (en) {
    const labels: Record<string, string> = {
      课堂教学设计表: "Classroom Lesson Design",
      教学: "Teaching ",
      基本信息: "Basic Information",
      教学课题: "Lesson Topic",
      时长: "Duration",
      授课年级: "Grade and Class",
      设计者: "Designer",
      学号: "Student ID",
      "教学分析：": "Teaching Analysis",
      "课程标准（学科基本要求）": "Curriculum Standards",
      内容: "Content ",
      分析: "Analysis",
      学情分析: "Class Profile Analysis",
      目标: "Objectives",
      教学重点: "Teaching Focus",
      教学难点: "Anticipated Difficulties",
      教: "Teaching ",
      学策略: "Strategies",
      设计思路: "Design Rationale",
      教学流程安排: "Lesson Sequence",
      "教学过程：": "Teaching Procedures",
      "教学环节（用时）": "Stage and Timing",
      教师活动: "Teacher Actions",
      学生活动: "Student Actions",
      设计意图: "Teaching Aims",
      板书与: "Blackboard and ",
      "教学材料与资源：": "Materials and Resources",
      可选: "Optional",
      学习支持资料: "Learning Materials",
      教学支持材料: "Teaching Resources",
      对学生学习的评价方法: "Assessment Methods",
      其: "Other",
      他: "",
      "教学特色与反思：": "Teaching Reflection",
    };
    xml = xml.replace(
      /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g,
      (_token, start: string, value: string, end) => {
        if (!(value in labels)) return `${start}${value}${end}`;
        const preservedStart = start.includes("xml:space=")
          ? start
          : start.replace(/>$/, ' xml:space="preserve">');
        return `${preservedStart}${escapeXML(labels[value])}${end}`;
      },
    );
    xml = xml
      .replace(/w:(ascii|hAnsi)="楷体"/g, 'w:$1="Times New Roman"')
      .replace(/<w:spacing w:val="\d+"\/>/g, '<w:spacing w:val="0"/>');
  }
  const procedurePattern =
    /<w:tbl\b[^>]*>(?:(?!<w:tbl\b)[\s\S])*?\{\{STAGE_NAME\}\}(?:(?!<w:tbl\b)[\s\S])*?<\/w:tbl>/;
  if (!procedurePattern.test(xml)) throw new Error("教学过程模板不可用。");
  const paragraphs = (text: string, bold = false) =>
    text
      .split(/\r?\n/)
      .map(
        (line) =>
          `<w:p><w:pPr><w:spacing w:after="70" w:line="260" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/><w:sz w:val="22"/>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${escapeXML(line)}</w:t></w:r></w:p>`,
      )
      .join("");
  const cell = (text: string, width: number, bold = false, merged = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${merged ? '<w:gridSpan w:val="2"/><w:shd w:fill="F4F7F9"/>' : ""}<w:vAlign w:val="top"/></w:tcPr>${paragraphs(text, bold)}</w:tc>`;
  const row = (left: string, right: string) =>
    `<w:tr>${cell(left, 6600)}${cell(right, 3028)}</w:tr>`;
  const heading = (text: string) =>
    `<w:tr>${cell(text, 9628, true, true)}</w:tr>`;
  const activitiesHeader = label("教学活动 / Activities", "Activities"),
    aimsHeader = label("教学目的 / Teaching Aims", "Teaching Aims");
  const grouping = {
    individual: label("独立", "Individual"),
    pair: label("两人", "Pair"),
    group: label("小组", "Group"),
    whole_class: label("全班", "Whole class"),
  };
  const rows = lessons
    .map((lesson, li) =>
      [
        heading(
          `Lesson ${lesson.lessonNumber || li + 1} · ${lesson.title} · ${lesson.duration} ${label("分钟", "min")}`,
        ),
        row(
          `${label("本课时目标", "Lesson Objectives")}\n${lesson.objectives.map((o, i) => `${lesson.objectiveIds[i]}: ${o}`).join("\n")}\n${label("重点", "Key Points")}: ${lesson.keyPoints || design.focus}\n${label("难点", "Difficult Points")}: ${lesson.difficultPoints || design.difficulties}`,
          `${label("学习产出", "Learning Outcome")}: ${lesson.learningOutcome || lesson.output}\n${label("评价", "Assessment")}: ${lesson.assessment}`,
        ),
        ...lesson.stages.flatMap((stage, si) => [
          heading(
            `Step ${si + 1} · ${stage.name} · ${stage.duration} ${label("分钟", "min")}`,
          ),
          row(
            `${label("教师活动", "Teacher Actions")}: ${stage.teacherActivities}\n${label("学生活动", "Student Actions")}: ${stage.studentActivities}`,
            stage.purpose,
          ),
          ...(stage.activities?.length
            ? stage.activities.map((a, ai) =>
                row(
                  [
                    `Activity ${lesson.stages.slice(0, si).reduce((sum, s) => sum + (s.activities?.length || 0), 0) + ai + 1} · ${a.title} · ${a.duration} ${label("分钟", "min")}`,
                    ...(a.operations
                      ? a.operations.map(
                          (op, i) =>
                            `${i + 1}. ${op.actor === "teacher" ? label("教师", "Teacher") : label("学生", "Students")} (${grouping[op.grouping]}): ${op.instruction}`,
                        )
                      : [
                          ...a.teacherActions.map(
                            (t, i) =>
                              `${i + 1}. ${label("教师", "Teacher")}: ${t}`,
                          ),
                          ...a.studentActions.map(
                            (t, i) =>
                              `${i + 1 + a.teacherActions.length}. ${label("学生", "Students")}: ${t}`,
                          ),
                        ]),
                    ...a.questions.map(
                      (q) =>
                        `${label("问题", "Question")}: ${q.question}\n${label("预期回答", "Expected Response")}: ${q.expectedResponse}\n${label("追问", "Follow-up")}: ${q.followUp}`,
                    ),
                    `${label("教材与材料", "Textbook and Materials")}: ${a.materials.join("; ")}`,
                    ...(a.resourceIds?.map(
                      (id) =>
                        `${label("绑定材料", "Linked Material")}: ${design.teachingMaterials?.find((m) => m.id === id)?.title || id}`,
                    ) || []),
                    `${label("支架", "Scaffolds")}: ${a.scaffolds.join("\n")}`,
                    `${label("学习产出", "Output")}: ${a.output || a.evidence}`,
                    `${label("反馈与活动承接", "Feedback and Connection")}: ${a.connection}`,
                  ].join("\n"),
                  [
                    a.teachingAim,
                    `${label("目标", "Objectives")}: ${a.objectiveIds.join(" / ")}`,
                    `${label("学习证据", "Learning Evidence")}: ${a.evidence}`,
                    `${label("评价检查清单", "Assessment Checklist")}:\n${a.successCriteria.map((c) => `□ ${c}`).join("\n")}`,
                    `${label("分层支持", "Differentiation")}: ${a.differentiation}`,
                  ].join("\n"),
                ),
              )
            : [
                row(
                  `${label("教师活动", "Teacher Actions")}: ${stage.teacherActivities}\n${label("学生活动", "Student Actions")}: ${stage.studentActivities}\n${stage.materials.join("; ")}`,
                  stage.purpose,
                ),
              ]),
        ]),
        heading(label("本课时作业", "Lesson Homework")),
        `<w:tr>${cell(lesson.homework, 9628, false, true)}</w:tr>`,
        heading(label("本课时板书设计", "Blackboard Design")),
        `<w:tr>${cell(lesson.blackboardDesign ? [lesson.blackboardDesign.title, ...lesson.blackboardDesign.sections.map((s) => `${s.heading}\n${s.lines.join("\n")}`), ...lesson.blackboardDesign.connections].join("\n\n") : design.boardDesign, 9628, false, true)}</w:tr>`,
        ...(li === 0 && design.lessonConnection
          ? [
              heading(label("两课时衔接", "Lesson Connection")),
              row(
                `${design.lessonConnection.firstLessonOutput}\n→ ${design.lessonConnection.secondLessonInput}`,
                `${design.lessonConnection.transition}\n${design.lessonConnection.sharedGoal}`,
              ),
            ]
          : []),
      ].join(""),
    )
    .join("");
  const procedures = `<w:tbl><w:tblPr><w:tblW w:w="9628" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((side) => `<w:${side} w:val="single" w:sz="4" w:color="DFE7EB"/>`).join("")}</w:tblBorders><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="6600"/><w:gridCol w:w="3028"/></w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${cell(activitiesHeader, 6600, true)}${cell(aimsHeader, 3028, true)}</w:tr>${rows}</w:tbl>`;
  xml = xml.replace(procedurePattern, () => procedures);
  xml = fill(xml, {
    TITLE: display?.title || info.title,
    DURATION: `${lessons.map((l) => l.duration).join(" + ")} ${label("分钟", "min")}`,
    GRADE_CLASS:
      `${display?.grade || info.grade}\n${display?.className || info.className}`.trim(),
    DESIGNER: designer,
    STUDENT_ID: "",
    STANDARDS:
      design.curriculumStandards ||
      label(
        "待教师补充与本课相关的课程标准原文及官方来源。",
        "Pending teacher confirmation of relevant standards and their official source.",
      ),
    TEXTBOOK_ANALYSIS: [
      `${label("教材", "Textbook")}: ${display?.textbook || info.textbook}`,
      `${label("单元", "Unit")}: ${display?.unit || info.unit || label("待填写", "To be confirmed")}`,
      `${label("主题", "Topic")}: ${display?.topic || info.topic}`,
      `${label("体裁", "Genre")}: ${display?.lessonType || info.lessonType}`,
      `${label("实际授课范围", "Teaching scope")}: ${display?.teachingScope || info.teachingScope || label("待确认", "To be confirmed")}`,
      `${label("允许参考范围", "Reference scope")}: ${display?.referenceScope || info.referenceScope || label("待确认", "To be confirmed")}`,
      design.textbookAnalysis,
      ...(design.materialAnalysis
        ? [
            design.materialAnalysis.unitTheme,
            ...design.materialAnalysis.unitGoals,
            design.materialAnalysis.unitStructure,
            design.materialAnalysis.currentScope,
            design.materialAnalysis.currentScopeRole,
            design.materialAnalysis.priorLearning,
            design.materialAnalysis.nextLearning,
            design.materialAnalysis.contentAnalysis,
            ...design.materialAnalysis.transferableResources,
            ...design.materialAnalysis.lessonSplitSuggestion,
            design.materialAnalysis.continuity,
            ...design.materialAnalysis.uncertainties,
          ]
        : []),
    ].join("\n"),
    STUDENT_ANALYSIS: design.studentAnalysis,
    OBJECTIVES: design.objectives
      .map((o, i) => `${design.goals?.[i]?.id || `O${i + 1}`}. ${o}`)
      .join("\n"),
    FOCUS: design.focus,
    DIFFICULTIES: design.difficulties,
    DESIGN_RATIONALE:
      design.designRationale ||
      `${label("教学方法", "Methods")}: ${design.methods.join("; ")}\n${design.stages.map((s) => `${s.name}: ${s.purpose}`).join("\n")}`,
    FLOW: lessons
      .map(
        (l, i) =>
          `Lesson ${i + 1} (${l.duration} ${label("分钟", "min")}): ${l.stages.map((s) => `${s.name} (${s.duration})`).join(" → ")}`,
      )
      .join("\n"),
    BOARD_DESIGN: `${design.boardDesign}${design.pptSuggestions?.length ? `\n\n${label("PPT 页面建议", "Suggested Slides")}\n${design.pptSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : ""}`,
    LEARNING_RESOURCES: [
      design.resources.join("\n"),
      ...(design.teachingMaterials || []).map(
        (m) => `${m.title}\n${m.content}`,
      ),
    ].join("\n\n"),
    TEACHING_RESOURCES: [
      ...new Set(design.stages.flatMap((s) => s.materials)),
    ].join("\n"),
    ASSESSMENT: design.assessment,
    HOMEWORK_REQUIREMENTS: `${label("作业设计", "Homework")}: ${design.homework}${!en && info.requirements ? `\n教师补充要求：${info.requirements}` : ""}`,
    REFLECTION:
      design.reflection ||
      label(
        "课后填写：教学特色、目标达成情况、学生表现及具体改进措施。",
        "Record objective achievement, student evidence and specific improvements after teaching.",
      ),
  });
  if (/\{\{[A-Z_]+\}\}/.test(xml))
    throw new Error("教学设计模板存在未填写字段。");
  zip.file("word/document.xml", xml);
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXML(display?.title || info.title)}</dc:title><dc:creator>${escapeXML(designer || "WriteWise")}</dc:creator></cp:coreProperties>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
