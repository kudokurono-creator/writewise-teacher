"use client";
import { Pencil, Sparkles, Clock3, Check } from "lucide-react";
import { useState, Fragment } from "react";
import {
  getLessons,
  syncStages,
  type BasicInfo,
  type LessonContent,
  type Stage,
  type LessonActivity,
  type LessonSession,
} from "@/types/lesson";
export const sectionNames = {
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
  pptSuggestions: "PPT 页面建议",
} as const;
type SectionKey = keyof typeof sectionNames;
const englishNames: Record<SectionKey, string> = {
  curriculumStandards: "Curriculum Standards",
  designRationale: "Design Rationale",
  textbookAnalysis: "Textbook Analysis",
  studentAnalysis: "Class Profile Analysis",
  objectives: "Overall Objectives",
  focus: "Teaching Focus",
  difficulties: "Anticipated Difficulties",
  methods: "Teaching Methods",
  resources: "Resources",
  assessment: "Overall Assessment",
  homework: "Homework",
  boardDesign: "Blackboard Design",
  reflection: "Teaching Reflection",
  pptSuggestions: "Suggested Slides",
};
type Props = {
  info: BasicInfo;
  content: LessonContent;
  onChange?: (content: LessonContent) => void;
  onAITarget?: (target: string) => void;
  disabled?: boolean;
  language?: "zh" | "en";
  initialLessonId?: string;
  onLessonSelect?: (id: string) => void;
};
export function LessonDocument({
  info,
  content,
  onChange,
  onAITarget,
  disabled,
  language = "zh",
  initialLessonId,
  onLessonSelect,
}: Props) {
  const [editing, setEditing] = useState("");
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      getLessons(content, info).findIndex((l) => l.id === initialLessonId),
    ),
  );
  const en = language === "en",
    label = (zh: string, english: string) => (en ? english : zh);
  const lessons = getLessons(content, info),
    lesson = lessons[Math.min(active, lessons.length - 1)];
  const display = content.displayInfo;
  function tools(id: string, name: string) {
    return onChange || onAITarget ? (
      <div className="section-tools">
        {onChange ? (
          <button
            className="icon-button"
            disabled={disabled}
            aria-label={`编辑${name}`}
            onClick={() => setEditing(editing === id ? "" : id)}
          >
            {editing === id ? <Check size={15} /> : <Pencil size={14} />}
          </button>
        ) : null}
        {onAITarget ? (
          <button
            className="icon-button"
            disabled={disabled}
            aria-label={`AI 修改${name}`}
            onClick={() => onAITarget(id)}
          >
            <Sparkles size={14} />
          </button>
        ) : null}
      </div>
    ) : null;
  }
  function section(key: SectionKey) {
    const value = content[key],
      text = Array.isArray(value) ? value.join("\n") : value || "";
    return (
      <section key={key} id={`section-${key}`} className="document-section">
        <div className="document-section-heading">
          <h2>{en ? englishNames[key] : sectionNames[key]}</h2>
          {tools(key, sectionNames[key])}
        </div>
        {editing === key ? (
          <textarea
            aria-label={`编辑${sectionNames[key]}正文`}
            rows={5}
            value={text}
            onChange={(e) => {
              const next = Array.isArray(value)
                ? e.target.value.split("\n")
                : e.target.value;
              onChange?.({
                ...content,
                [key]: next,
                ...(key === "objectives" && Array.isArray(next) && content.goals
                  ? {
                      goals: next.map((text, i) => ({
                        id: content.goals?.[i]?.id || `O${i + 1}`,
                        text,
                      })),
                    }
                  : {}),
              });
            }}
          />
        ) : Array.isArray(value) ? (
          <ol className="plain-list">
            {value.map((v, i) => (
              <li key={i}>
                {key === "objectives" ? (
                  <b>{content.goals?.[i]?.id || `O${i + 1}`} · </b>
                ) : null}
                {v}
              </li>
            ))}
          </ol>
        ) : (
          <p
            className={
              key === "boardDesign" ? "board-content" : "document-paragraph"
            }
          >
            {text ||
              label("待教师补充并确认。", "Pending teacher confirmation.")}
          </p>
        )}
      </section>
    );
  }
  function changeLesson(id: string, patch: Partial<LessonSession>) {
    onChange?.(
      syncStages({
        ...content,
        lessons: content.lessons?.map((l) =>
          l.id === id ? { ...l, ...patch } : l,
        ),
      }),
    );
  }
  function changeStage(id: string, patch: Partial<Stage>) {
    const update = (s: Stage) => (s.id === id ? { ...s, ...patch } : s);
    onChange?.(
      syncStages({
        ...content,
        lessons: content.lessons?.map((l) => ({
          ...l,
          stages: l.stages.map(update),
        })),
        stages: content.stages.map(update),
      }),
    );
  }
  function changeActivity(
    stage: Stage,
    id: string,
    patch: Partial<LessonActivity>,
  ) {
    changeStage(stage.id, {
      activities: stage.activities?.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    });
  }
  const grouping = {
    individual: label("独立", "Individual"),
    pair: label("两人", "Pair"),
    group: label("小组", "Group"),
    whole_class: label("全班", "Whole class"),
  };
  function activityField(
    stage: Stage,
    activity: LessonActivity,
    key:
      | "materials"
      | "scaffolds"
      | "output"
      | "connection"
      | "teachingAim"
      | "evidence"
      | "successCriteria"
      | "differentiation",
    zh: string,
    english: string,
  ) {
    const value = activity[key];
    return (
      <div className="procedure-field">
        <h5>{label(zh, english)}</h5>
        {editing === activity.id ? (
          <textarea
            rows={2}
            aria-label={`${activity.title}${zh}`}
            value={Array.isArray(value) ? value.join("\n") : value || ""}
            onChange={(e) =>
              changeActivity(stage, activity.id, {
                [key]: Array.isArray(value)
                  ? e.target.value.split("\n").filter(Boolean)
                  : e.target.value,
              })
            }
          />
        ) : Array.isArray(value) ? (
          <ul>
            {value.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        ) : (
          <p>{value}</p>
        )}
      </div>
    );
  }
  return (
    <article className="lesson-document">
      <header className="document-header">
        <div className="document-label">
          {label("高中英语教学设计", "High School English Lesson Design")}
        </div>
        {editing === "title" ? (
          <input
            aria-label="教学设计名称"
            maxLength={150}
            value={display?.title || info.title}
            onChange={(e) =>
              onChange?.({
                ...content,
                displayInfo: { ...display!, title: e.target.value },
              })
            }
          />
        ) : (
          <h1>{display?.title || info.title}</h1>
        )}
        {onChange && display ? (
          <button
            className="text-link"
            onClick={() => setEditing(editing === "title" ? "" : "title")}
          >
            编辑教学设计名称
          </button>
        ) : null}
        <p className="document-topic">{display?.topic || info.topic}</p>
        <div className="document-basic">
          <span>
            {display?.grade || info.grade} /{" "}
            {display?.className ||
              info.className ||
              label("学情待确认", "Class pending confirmation")}
          </span>
          <span>
            {display?.textbook ||
              info.textbook ||
              label("未指定", "Unspecified")}
          </span>
          <span>
            {display?.unit || info.unit || label("未指定", "Unspecified")}
          </span>
          <span>
            {display?.lessonType || info.lessonType} ·{" "}
            {lessons.map((l) => l.duration).join(" + ")} {label("分钟", "min")}
          </span>
        </div>
        <p>
          {label("实际授课范围", "Teaching scope")}：
          {display?.teachingScope || info.teachingScope}
        </p>
        <p>
          {label("允许参考范围", "Reference scope")}：
          {display?.referenceScope || info.referenceScope}
        </p>
      </header>
      {content.qualitySuggestions?.length ? (
        <details className="quality-advice">
          <summary>
            {label(
              "可优化建议（不影响查看与导出）",
              "Optimization suggestions",
            )}
          </summary>
          <ul>
            {content.qualitySuggestions.map((s, i) => (
              <li key={i}>{s.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <details className="common-design">
        <summary>
          {label(
            "共同教材分析与整体设计",
            "Shared Analysis and Overall Design",
          )}
        </summary>
        {content.materialAnalysis ? (
          <section className="document-section">
            <h2>{label("单元视角下的教材分析", "Unit Perspective")}</h2>
            {Object.values(content.materialAnalysis).map((v, i) => (
              <p className="document-paragraph" key={i}>
                {Array.isArray(v) ? v.join("\n") : v}
              </p>
            ))}
          </section>
        ) : null}
        {(
          [
            "curriculumStandards",
            "textbookAnalysis",
            "studentAnalysis",
            "objectives",
            "focus",
            "difficulties",
            "methods",
            "designRationale",
            "resources",
          ] as const
        ).map(section)}
      </details>
      {content.lessonConnection ? (
        <div className="lesson-connection">
          <h3>{label("两课时衔接", "Lesson Connection")}</h3>
          <p>{content.lessonConnection.transition}</p>
          <p>
            {content.lessonConnection.firstLessonOutput} →{" "}
            {content.lessonConnection.secondLessonInput}
          </p>
        </div>
      ) : null}
      <div
        className="segmented-tabs lesson-tabs"
        role="tablist"
        aria-label={label("教案课时", "Lesson designs")}
      >
        {lessons.map((l, i) => (
          <button
            role="tab"
            aria-selected={active === i}
            className={active === i ? "selected" : ""}
            key={l.id}
            onClick={() => {
              setActive(i);
              onLessonSelect?.(l.id);
              setEditing("");
            }}
          >
            Lesson {l.lessonNumber || i + 1} · {l.duration}{" "}
            {label("分钟", "min")}
          </button>
        ))}
      </div>
      <div
        className="lesson-session"
        role="tabpanel"
        aria-label={`Lesson ${lesson.lessonNumber || active + 1}`}
      >
        <div className="lesson-session-heading">
          <div className="document-section-heading">
            <h3>
              Lesson {lesson.lessonNumber || active + 1} · {lesson.title}
            </h3>
            {tools(lesson.id, label("本课时", "this lesson"))}
          </div>
          <p>
            <Clock3 size={14} />{" "}
            {lesson.stages.reduce((sum, s) => sum + s.duration, 0)} /{" "}
            {lesson.duration} {label("分钟", "min")}
          </p>
          <ol>
            {lesson.objectives.map((o, i) => (
              <li key={i}>
                <b>{lesson.objectiveIds[i]} · </b>
                {o}
              </li>
            ))}
          </ol>
          {lesson.keyPoints ? (
            <p>
              <b>{label("重点", "Key points")}：</b>
              {lesson.keyPoints}
            </p>
          ) : null}
          {lesson.difficultPoints ? (
            <p>
              <b>{label("难点", "Difficult points")}：</b>
              {lesson.difficultPoints}
            </p>
          ) : null}
        </div>
        <section className="document-section" id="section-stages">
          <h2>{label("教学过程", "Teaching Procedures")}</h2>
          <div className="procedure-scroll">
            <table className="procedure-table">
              <thead>
                <tr>
                  <th scope="col">
                    {label("教学活动 / Activities", "Activities")}
                  </th>
                  <th scope="col">
                    {label("教学目的 / Teaching Aims", "Teaching Aims")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lesson.stages.map((stage, si) => (
                  <Fragment key={stage.id}>{stageRows(stage, si)}</Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="lesson-outcome">
          {(
            [
              ["assessment", "本课时评价", "Lesson Assessment"],
              ["learningOutcome", "学习产出", "Learning Outcome"],
              ["homework", "作业与衔接", "Homework and Transition"],
            ] as const
          ).map(([key, zh, english]) => (
            <div key={key}>
              <h4>{label(zh, english)}</h4>
              {onChange && content.lessons ? (
                <textarea
                  rows={3}
                  aria-label={`Lesson ${active + 1} ${zh}`}
                  value={
                    lesson[key] ||
                    (key === "learningOutcome" ? lesson.output : "")
                  }
                  onChange={(e) =>
                    changeLesson(lesson.id, {
                      [key]: e.target.value,
                      ...(key === "learningOutcome"
                        ? { output: e.target.value }
                        : {}),
                    })
                  }
                />
              ) : (
                <p>
                  {lesson[key] ||
                    (key === "learningOutcome" ? lesson.output : "")}
                </p>
              )}
            </div>
          ))}
        </div>
        {lesson.blackboardDesign ? (
          <section className="document-section lesson-blackboard">
            <h2>{label("本课时板书设计", "Blackboard Design")}</h2>
            <h3>{lesson.blackboardDesign.title}</h3>
            <div className="blackboard-sections">
              {lesson.blackboardDesign.sections.map((s, i) => (
                <div key={i}>
                  <h4>{s.heading}</h4>
                  {onChange && content.lessons ? (
                    <textarea
                      aria-label={`板书分区 ${i + 1}`}
                      rows={4}
                      value={s.lines.join("\n")}
                      onChange={(e) =>
                        changeLesson(lesson.id, {
                          blackboardDesign: {
                            ...lesson.blackboardDesign!,
                            sections: lesson.blackboardDesign!.sections.map(
                              (item, n) =>
                                n === i
                                  ? {
                                      ...item,
                                      lines: e.target.value
                                        .split("\n")
                                        .filter(Boolean),
                                    }
                                  : item,
                            ),
                          },
                        })
                      }
                    />
                  ) : (
                    <p>{s.lines.join("\n")}</p>
                  )}
                </div>
              ))}
            </div>
            <p>{lesson.blackboardDesign.connections.join("\n")}</p>
          </section>
        ) : (
          section("boardDesign")
        )}
      </div>
      {content.teachingMaterials?.length ? (
        <details className="common-design">
          <summary>
            {label("课堂材料与任务单", "Classroom Materials and Worksheets")}
          </summary>
          {content.teachingMaterials.map((m) => (
            <section
              className="document-section"
              key={m.id}
              id={`material-${m.id}`}
            >
              <h3>{m.title}</h3>
              {onChange ? (
                <textarea
                  aria-label={`编辑材料${m.title}`}
                  rows={6}
                  value={m.content}
                  onChange={(e) =>
                    onChange({
                      ...content,
                      teachingMaterials: content.teachingMaterials?.map(
                        (item) =>
                          item.id === m.id
                            ? { ...item, content: e.target.value }
                            : item,
                      ),
                    })
                  }
                />
              ) : (
                <p className="document-paragraph">{m.content}</p>
              )}
            </section>
          ))}
        </details>
      ) : null}
      {section("pptSuggestions")}
      {section("assessment")}
      {section("homework")}
      {section("reflection")}
    </article>
  );
  function stageRows(stage: Stage, si: number) {
    return (
      <>
        <tr className="step-row">
          <th colSpan={2}>
            <div className="stage-header stage-block">
              <b>Step {si + 1} · </b>
              {editing === stage.id ? (
                <input
                  aria-label="阶段名称"
                  value={stage.name}
                  onChange={(e) =>
                    changeStage(stage.id, { name: e.target.value })
                  }
                />
              ) : (
                <h3>{stage.name}</h3>
              )}
              {editing === stage.id ? (
                <input
                  type="number"
                  min={1}
                  max={180}
                  aria-label={`${stage.name}时间`}
                  value={stage.duration}
                  onChange={(e) =>
                    changeStage(stage.id, { duration: Number(e.target.value) })
                  }
                />
              ) : (
                <span>
                  {stage.duration} {label("分钟", "min")}
                </span>
              )}
              {tools(stage.id, `阶段${si + 1}`)}
            </div>
          </th>
        </tr>
        {stage.activities?.length ? (
          stage.activities.map((activity, ai) => (
            <tr key={activity.id} className="activity-detail">
              <td>
                <div className="document-section-heading">
                  <h4>
                    Activity{" "}
                    {lesson.stages
                      .slice(0, si)
                      .reduce(
                        (sum, s) => sum + (s.activities?.length || 0),
                        0,
                      ) +
                      ai +
                      1}{" "}
                    · {activity.title} · {activity.duration}{" "}
                    {label("分钟", "min")}
                  </h4>
                  {tools(activity.id, `活动${activity.title}`)}
                </div>
                {editing === activity.id ? (
                  <div className="form-grid">
                    <label className="field">
                      <span>活动名称</span>
                      <input
                        value={activity.title}
                        onChange={(e) =>
                          changeActivity(stage, activity.id, {
                            title: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>活动时长</span>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={activity.duration}
                        onChange={(e) =>
                          changeActivity(stage, activity.id, {
                            duration: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>目标 ID</span>
                      <input
                        value={activity.objectiveIds.join(",")}
                        onChange={(e) =>
                          changeActivity(stage, activity.id, {
                            objectiveIds: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}
                <ol className="classroom-operations">
                  {(
                    activity.operations || [
                      ...activity.teacherActions.map((instruction) => ({
                        actor: "teacher" as const,
                        grouping: "whole_class" as const,
                        instruction,
                      })),
                      ...activity.studentActions.map((instruction) => ({
                        actor: "students" as const,
                        grouping: "individual" as const,
                        instruction,
                      })),
                    ]
                  ).map((op, i) => (
                    <li key={i}>
                      <b>
                        {op.actor === "teacher"
                          ? label("教师", "Teacher")
                          : label("学生", "Students")}{" "}
                        · {grouping[op.grouping]}
                      </b>
                      {editing === activity.id && activity.operations ? (
                        <textarea
                          rows={2}
                          aria-label={`课堂操作 ${i + 1}`}
                          value={op.instruction}
                          onChange={(e) =>
                            changeActivity(stage, activity.id, {
                              operations: activity.operations!.map((item, n) =>
                                n === i
                                  ? { ...item, instruction: e.target.value }
                                  : item,
                              ),
                            })
                          }
                        />
                      ) : (
                        <p>{op.instruction}</p>
                      )}
                    </li>
                  ))}
                </ol>
                {activity.questions.map((q, qi) => (
                  <div className="activity-question" key={qi}>
                    {(
                      ["question", "expectedResponse", "followUp"] as const
                    ).map((key, i) => (
                      <p key={key}>
                        <b>
                          {
                            [
                              label("问题", "Question"),
                              label("预期回答", "Expected response"),
                              label("追问", "Follow-up"),
                            ][i]
                          }
                          ：
                        </b>
                        {editing === activity.id ? (
                          <textarea
                            rows={2}
                            aria-label={`${activity.title}${key}${qi + 1}`}
                            value={q[key]}
                            onChange={(e) =>
                              changeActivity(stage, activity.id, {
                                questions: activity.questions.map((item, n) =>
                                  n === qi
                                    ? { ...item, [key]: e.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        ) : (
                          q[key]
                        )}
                      </p>
                    ))}
                  </div>
                ))}
                {activityField(
                  stage,
                  activity,
                  "materials",
                  "教材依据与材料",
                  "Textbook and Materials",
                )}
                {activity.resourceIds?.map((id) => (
                  <a
                    key={id}
                    href={`#material-${id}`}
                    onClick={() => {
                      const el = document
                        .getElementById(`material-${id}`)
                        ?.closest("details");
                      if (el) el.open = true;
                    }}
                    className="text-link"
                  >
                    {content.teachingMaterials?.find((m) => m.id === id)
                      ?.title || id}
                  </a>
                ))}
                {activityField(
                  stage,
                  activity,
                  "scaffolds",
                  "学习与语言支架",
                  "Scaffolds",
                )}
                {activityField(stage, activity, "output", "学习产出", "Output")}
                {activityField(
                  stage,
                  activity,
                  "connection",
                  "反馈与活动承接",
                  "Feedback and Connection",
                )}
              </td>
              <td>
                {activityField(
                  stage,
                  activity,
                  "teachingAim",
                  "活动教学意图",
                  "Teaching Aim",
                )}
                <p className="objective-link">
                  {activity.objectiveIds.join(" / ")}
                </p>
                {activityField(
                  stage,
                  activity,
                  "evidence",
                  "学习证据",
                  "Learning Evidence",
                )}
                {activityField(
                  stage,
                  activity,
                  "successCriteria",
                  "评价检查清单",
                  "Assessment Checklist",
                )}
                {activityField(
                  stage,
                  activity,
                  "differentiation",
                  "分层支持",
                  "Differentiation",
                )}
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td>
              <h4>{label("教师活动", "Teacher Actions")}</h4>
              {editing === stage.id ? (
                <textarea
                  rows={3}
                  value={stage.teacherActivities}
                  onChange={(e) =>
                    changeStage(stage.id, { teacherActivities: e.target.value })
                  }
                />
              ) : (
                <p>{stage.teacherActivities}</p>
              )}
              <h4>{label("学生活动", "Student Actions")}</h4>
              {editing === stage.id ? (
                <textarea
                  rows={3}
                  aria-label={`${stage.name}学生活动`}
                  value={stage.studentActivities}
                  onChange={(e) =>
                    changeStage(stage.id, { studentActivities: e.target.value })
                  }
                />
              ) : (
                <p>{stage.studentActivities}</p>
              )}
              {editing === stage.id ? (
                <textarea
                  rows={2}
                  aria-label={`${stage.name}阶段资源`}
                  value={stage.materials.join("\n")}
                  onChange={(e) =>
                    changeStage(stage.id, {
                      materials: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                />
              ) : (
                <p>{stage.materials.join("; ")}</p>
              )}
            </td>
            <td>
              {editing === stage.id ? (
                <textarea
                  rows={3}
                  aria-label={`${stage.name}设计意图`}
                  value={stage.purpose}
                  onChange={(e) =>
                    changeStage(stage.id, { purpose: e.target.value })
                  }
                />
              ) : (
                <p>{stage.purpose}</p>
              )}
            </td>
          </tr>
        )}
      </>
    );
  }
}
