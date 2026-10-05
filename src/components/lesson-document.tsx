"use client";
import { Pencil, Sparkles, Clock3, Check } from "lucide-react";
import { useState } from "react";
import type { BasicInfo, LessonContent, Stage } from "@/types/lesson";
export const sectionNames: Record<
  Exclude<keyof LessonContent, "stages">,
  string
> = {
  curriculumStandards: "课程标准（学科基本要求）",
  designRationale: "设计思路",
  textbookAnalysis: "教材分析",
  studentAnalysis: "学情分析",
  objectives: "教学目标",
  focus: "教学重点",
  difficulties: "教学难点",
  methods: "教学方法",
  resources: "教学资源",
  assessment: "教学评价",
  homework: "作业设计",
  boardDesign: "板书设计",
  reflection: "教学反思",
};
type Props = {
  info: BasicInfo;
  content: LessonContent;
  onChange?: (content: LessonContent) => void;
  onAITarget?: (target: string) => void;
  disabled?: boolean;
};
export function LessonDocument({
  info,
  content,
  onChange,
  onAITarget,
  disabled,
}: Props) {
  const [editing, setEditing] = useState("");
  function section(
    key: Exclude<keyof LessonContent, "stages">,
    number?: string,
  ) {
    const value = content[key];
    const edit = editing === key;
    const text = Array.isArray(value) ? value.join("\n") : value || "";
    return (
      <section className="document-section" id={`section-${key}`} key={key}>
        <div className="document-section-heading">
          <h2>
            {number ? <span>{number}</span> : null}
            {sectionNames[key]}
          </h2>
          {onChange ? (
            <div className="section-tools">
              <button
                className="icon-button"
                title={edit ? "结束编辑" : `编辑${sectionNames[key]}`}
                aria-label={
                  edit
                    ? `结束编辑${sectionNames[key]}`
                    : `编辑${sectionNames[key]}`
                }
                disabled={disabled}
                onClick={() => setEditing(edit ? "" : key)}
              >
                {edit ? <Check size={15} /> : <Pencil size={14} />}
              </button>
              {onAITarget && key !== "resources" ? (
                <button
                  className="icon-button"
                  title={`AI 修改${sectionNames[key]}`}
                  aria-label={`AI 修改${sectionNames[key]}`}
                  onClick={() => onAITarget(key)}
                  disabled={disabled}
                >
                  <Sparkles size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {edit ? (
          <textarea
            aria-label={`编辑${sectionNames[key]}正文`}
            rows={
              Array.isArray(value)
                ? Math.max(4, value.length + 1)
                : key === "boardDesign"
                  ? 6
                  : 4
            }
            value={text}
            onChange={(e) =>
              onChange?.({
                ...content,
                [key]: Array.isArray(value)
                  ? e.target.value.split("\n")
                  : e.target.value,
              })
            }
          />
        ) : Array.isArray(value) ? (
          <ol
            className={key === "objectives" ? "objective-list" : "plain-list"}
          >
            {value.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ol>
        ) : (
          <p
            className={
              key === "boardDesign" ? "board-content" : "document-paragraph"
            }
          >
            {text ||
              (key === "reflection"
                ? "课后填写目标达成情况、学生表现与改进建议。"
                : "待教师补充并确认。")}
          </p>
        )}
      </section>
    );
  }
  function changeStage(
    id: string,
    key: keyof Stage,
    value: Stage[keyof Stage],
  ) {
    onChange?.({
      ...content,
      stages: content.stages.map((s) =>
        s.id === id ? { ...s, [key]: value } : s,
      ),
    });
  }
  return (
    <article className="lesson-document">
      <header className="document-header">
        <div className="document-label">高中英语写作教学设计</div>
        <h1>{info.title}</h1>
        <p className="document-topic">{info.topic}</p>
        <div className="document-basic">
          <span>
            {info.grade} / {info.className || "班级待填写"}
          </span>
          <span>{info.textbook}</span>
          <span>{info.unit}</span>
          <span>
            {info.lessonType} · {info.duration} 分钟
          </span>
        </div>
      </header>
      {section("curriculumStandards")}
      {section("textbookAnalysis", "一")}
      {section("studentAnalysis", "二")}
      {section("objectives", "三")}
      <div className="focus-grid">
        {section("focus", "四")}
        {section("difficulties", "五")}
      </div>
      {section("methods", "六")}
      {section("designRationale")}
      {section("resources", "七")}
      <section className="document-section" id="section-stages">
        <div className="document-section-heading">
          <h2>
            <span>八</span>教学过程
          </h2>
          <span
            className={`duration-total ${content.stages.reduce((n, s) => n + s.duration, 0) !== info.duration ? "error-text" : ""}`}
          >
            <Clock3 size={14} />共{" "}
            {content.stages.reduce((n, s) => n + s.duration, 0)} /{" "}
            {info.duration} 分钟
          </span>
        </div>
        <div className="stage-timeline">
          {content.stages.map((stage, i) => (
            <section className="stage-block" key={stage.id}>
              <div className="stage-header">
                <span className="stage-number">{i + 1}</span>
                {editing === stage.id ? (
                  <input
                    aria-label="阶段名称"
                    value={stage.name}
                    onChange={(e) =>
                      changeStage(stage.id, "name", e.target.value)
                    }
                  />
                ) : (
                  <h3>{stage.name}</h3>
                )}
                {editing === stage.id ? (
                  <label className="stage-minutes">
                    <input
                      type="number"
                      min={1}
                      max={180}
                      aria-label={`${stage.name}时间`}
                      value={stage.duration}
                      onChange={(e) =>
                        changeStage(
                          stage.id,
                          "duration",
                          Number(e.target.value),
                        )
                      }
                    />
                    分钟
                  </label>
                ) : (
                  <span className="stage-duration">{stage.duration} 分钟</span>
                )}
                {onChange ? (
                  <div className="section-tools">
                    <button
                      className="icon-button"
                      aria-label={`编辑阶段${i + 1}`}
                      disabled={disabled}
                      onClick={() =>
                        setEditing(editing === stage.id ? "" : stage.id)
                      }
                    >
                      {editing === stage.id ? (
                        <Check size={15} />
                      ) : (
                        <Pencil size={14} />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`AI 修改阶段${i + 1}`}
                      onClick={() => onAITarget?.(stage.id)}
                      disabled={disabled}
                    >
                      <Sparkles size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="stage-activities">
                {(
                  ["teacherActivities", "studentActivities", "purpose"] as const
                ).map((key, index) => (
                  <div
                    className={key === "purpose" ? "stage-purpose" : ""}
                    key={key}
                  >
                    <h4>{["教师活动", "学生活动", "设计意图"][index]}</h4>
                    {editing === stage.id ? (
                      <textarea
                        aria-label={`${stage.name}${["教师活动", "学生活动", "设计意图"][index]}`}
                        rows={3}
                        value={stage[key]}
                        onChange={(e) =>
                          changeStage(stage.id, key, e.target.value)
                        }
                      />
                    ) : (
                      <p>{stage[key]}</p>
                    )}
                  </div>
                ))}
              </div>
              {editing === stage.id ? (
                <label className="field stage-materials">
                  <span>阶段资源（每行一项）</span>
                  <textarea
                    aria-label="阶段资源"
                    rows={2}
                    value={stage.materials.join("\n")}
                    onChange={(e) =>
                      changeStage(
                        stage.id,
                        "materials",
                        e.target.value.split("\n").filter(Boolean),
                      )
                    }
                  />
                </label>
              ) : (
                <p className="stage-material-label">
                  资源：{stage.materials.join("、") || "无"}
                </p>
              )}
            </section>
          ))}
        </div>
      </section>
      {section("assessment", "九")}
      {section("homework", "十")}
      {section("boardDesign", "十一")}
      {section("reflection", "十二")}
    </article>
  );
}
