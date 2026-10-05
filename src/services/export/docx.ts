import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import type { BasicInfo, LessonContent } from "@/types/lesson";

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
) {
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
  const stagePattern =
    /<w:tr\b[^>]*>(?:(?!<w:tr\b)[\s\S])*?\{\{STAGE_NAME\}\}(?:(?!<w:tr\b)[\s\S])*?<\/w:tr>/;
  const stageRow = xml.match(stagePattern)?.[0];
  if (!stageRow) throw new Error("教学过程模板不可用。");
  xml = xml.replace(stagePattern, () =>
    content.stages
      .map((s) =>
        fill(stageRow, {
          STAGE_NAME: `${s.name}\n（用时：${s.duration}分钟）`,
          TEACHER_ACTIVITIES: s.teacherActivities,
          STUDENT_ACTIVITIES: s.studentActivities,
          PURPOSE: s.purpose,
        }),
      )
      .join(""),
  );
  xml = fill(xml, {
    TITLE: info.title,
    DURATION: `${info.duration}分钟`,
    GRADE_CLASS: `${info.grade}\n${info.className}`.trim(),
    DESIGNER: designer,
    STUDENT_ID: "",
    STANDARDS:
      content.curriculumStandards ||
      "待教师补充与本课相关的课程标准原文及官方来源。",
    TEXTBOOK_ANALYSIS: `教材：${info.textbook}\n单元：${info.unit || "待填写"}\n写作主题：${info.topic}\n写作类型：${info.lessonType}\n${content.textbookAnalysis}`,
    STUDENT_ANALYSIS: content.studentAnalysis,
    OBJECTIVES: content.objectives.map((o, i) => `${i + 1}. ${o}`).join("\n"),
    FOCUS: content.focus,
    DIFFICULTIES: content.difficulties,
    DESIGN_RATIONALE:
      content.designRationale ||
      `教学方法：${content.methods.join("、")}\n${content.stages.map((s) => `${s.name}：${s.purpose}`).join("\n")}`,
    FLOW: content.stages
      .map((s) => `${s.name}（${s.duration}分钟）`)
      .join(" → "),
    BOARD_DESIGN: content.boardDesign,
    LEARNING_RESOURCES: content.resources.join("\n"),
    TEACHING_RESOURCES: [
      ...new Set(content.stages.flatMap((s) => s.materials)),
    ].join("\n"),
    ASSESSMENT: content.assessment,
    HOMEWORK_REQUIREMENTS: `作业设计：${content.homework}${info.requirements ? `\n教师补充要求：${info.requirements}` : ""}`,
    REFLECTION:
      content.reflection ||
      "课后填写：教学特色、目标达成情况、学生表现及具体改进措施。",
  });
  if (/\{\{[A-Z_]+\}\}/.test(xml))
    throw new Error("教学设计模板存在未填写字段。");
  zip.file("word/document.xml", xml);
  zip.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXML(info.title)}</dc:title><dc:creator>${escapeXML(designer || "WriteWise")}</dc:creator></cp:coreProperties>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
