"use client";
import { useState } from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Sparkles,
  ChevronLeft,
  Clock3,
  FileText,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  basicInfoSchema,
  defaultBasic,
  getLessonDurations,
  type BasicInfo,
  type LessonAnalysis,
  type ClassProfileRecord,
} from "@/types/lesson";
import {
  documentSelectionSchema,
  referenceTypes,
  referenceLabels,
  type DocumentSelection,
} from "@/types/canonical";
import { request } from "@/lib/utils";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { PageHeading, Busy } from "./shared";
import { FilePicker, type FileRecord } from "./file-picker";
import { ClassProfilePicker } from "./class-profile-picker";

const steps = [
  "选择班级",
  "教材与资料",
  "教学范围",
  "教学模式",
  "AI 分析与确认",
  "生成教案",
];
const conversationSchema = z.array(
  z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string(),
    lessonId: z.string(),
    createdAt: z.string(),
  }),
);
type Conversation = z.infer<typeof conversationSchema>;
export type DraftData = {
  id: string;
  basicInfo: BasicInfo;
  analysis: LessonAnalysis | null;
  documentIds: string[];
  documentSelections?: {
    documentId: string;
    sourceType: "textbook" | "reference";
    referenceType: string;
  }[];
  draftStep?: number;
  conversation?: unknown;
};
const lessonFields = {
  topic: "教学主题",
  objectives: "本课时目标",
  coreContent: "核心内容",
  keyPoints: "教学重点",
  difficultPoints: "教学难点",
  textbookTask: "教材任务",
  expectedOutcome: "预期学习产出",
  previousConnection: "前序承接",
  nextConnection: "后续衔接",
} as const;
const materialLabels: Record<string, string> = {
  unitTheme: "单元主题",
  unitGoals: "单元目标",
  unitStructure: "单元结构",
  currentScope: "本次范围",
  currentScopeRole: "本次内容在单元中的作用",
  priorLearning: "前序学习",
  nextLearning: "后续学习",
  contentAnalysis: "教材内容",
  transferableResources: "可迁移资源",
  lessonSplitSuggestion: "课时划分建议",
  continuity: "课时承接",
  uncertainties: "资料不足与待确认",
};
export function PrepareWizard({
  documents,
  draft,
  mock,
  profiles,
}: {
  documents: FileRecord[];
  draft?: DraftData;
  mock: boolean;
  profiles: ClassProfileRecord[];
}) {
  const router = useRouter();
  const [availableDocuments, setAvailableDocuments] = useState(documents);
  const available = (document: FileRecord) =>
    setAvailableDocuments((prev) => [
      document,
      ...prev.filter((d) => d.id !== document.id),
    ]);
  const [step, setStep] = useState(
    Math.min(6, draft?.draftStep || (draft?.analysis ? 5 : draft ? 2 : 1)),
  );
  const [id, setId] = useState(draft?.id);
  const [info, setInfo] = useState<BasicInfo>(
    draft?.basicInfo || { ...defaultBasic, workflowVersion: 2 },
  );
  const [selections, setSelections] = useState<DocumentSelection[]>(
    draft?.documentSelections?.map((s) => documentSelectionSchema.parse(s)) ||
      draft?.documentIds.map((documentId) => ({
        documentId,
        sourceType: "reference",
        referenceType: "other",
      })) ||
      [],
  );
  const [analysis, setAnalysis] = useState(draft?.analysis || null);
  const [conversation, setConversation] = useState<Conversation>(
    conversationSchema.safeParse(draft?.conversation).data || [],
  );
  const [activeLesson, setActiveLesson] = useState(
    conversationSchema.safeParse(draft?.conversation).data?.at(-1)?.lessonId ||
      draft?.analysis?.lessons?.[0]?.id ||
      "lesson-1",
  );
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState("");
  const [phases, setPhases] = useState<{ phase: string; message: string }[]>(
    [],
  );
  const [error, setError] = useState("");
  const lesson =
    analysis?.lessons?.find((l) => l.id === activeLesson) ||
    analysis?.lessons?.[0];
  const durations = getLessonDurations(info);
  function update<K extends keyof BasicInfo>(key: K, value: BasicInfo[K]) {
    setInfo((prev) => ({ ...prev, [key]: value }));
    setAnalysis(null);
    setConversation([]);
  }
  function select(sourceType: DocumentSelection["sourceType"], ids: string[]) {
    setSelections((prev) => [
      ...prev.filter(
        (s) => s.sourceType !== sourceType && !ids.includes(s.documentId),
      ),
      ...ids.map((documentId) => ({
        documentId,
        sourceType,
        referenceType:
          prev.find((s) => s.documentId === documentId)?.referenceType ||
          ("other" as const),
      })),
    ]);
    setAnalysis(null);
    setConversation([]);
  }
  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues.map((i) => `${i.path.join(".")}：${i.message}`).join("；")
          : e instanceof Error
            ? e.message
            : "操作未完成，请重试。",
      );
    } finally {
      setBusy("");
    }
  }
  async function saveDraft(nextStep: number) {
    const basicInfo = basicInfoSchema.parse(info);
    const body = {
      basicInfo,
      documentSelections: selections,
      draftStep: nextStep,
    };
    if (id) {
      await request(`/api/lesson-plans/${id}`, body, "PATCH");
      return id;
    }
    const plan = await request<{ id: string }>("/api/lesson-plans", body);
    setId(plan.id);
    router.replace(`/prepare/new?draft=${plan.id}`);
    return plan.id;
  }
  async function analyze() {
    await run("正在读取教材、辨别资料用途并分析各课时…", async () => {
      if (
        !selections.some((s) => s.sourceType === "textbook") &&
        info.workflowVersion === 2
      )
        throw new Error("请在教材与资料中选择至少一份教材文件。");
      const planId = await saveDraft(5);
      const result = await request<LessonAnalysis>(
        `/api/lesson-plans/${planId}`,
        { action: "analyze" },
      );
      setAnalysis(result);
      setActiveLesson(result.lessons?.[0]?.id || "lesson-1");
      if (result.inferredInfo)
        setInfo((prev) => ({ ...prev, ...result.inferredInfo }));
      toast.success("各课时分析已生成，可通过对话调整后确认");
    });
  }
  async function discuss() {
    if (!id || !lesson || !instruction.trim()) return;
    await run("正在调整选定课时的分析…", async () => {
      await request(
        `/api/lesson-plans/${id}`,
        { analysis, analysisConfirmed: false },
        "PATCH",
      );
      const explicitSecond =
        instruction.includes("第二课时") || instruction.includes("第 2 课时");
      const targetId = explicitSecond
        ? analysis!.lessons?.[1]?.id || lesson.id
        : lesson.id;
      const result = await request<{
        analysis: LessonAnalysis;
        conversation: Conversation;
      }>(`/api/lesson-plans/${id}`, {
        action: "analysis-chat",
        targetLessonId: targetId,
        instruction,
      });
      setAnalysis(result.analysis);
      setConversation(result.conversation);
      setActiveLesson(targetId);
      setInstruction("");
    });
  }
  async function generate() {
    if (!id) return;
    await run("正在读取已确认分析…", async () => {
      setPhases([]);
      const response = await fetch(`/api/lesson-plans/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", stream: true }),
      });
      if (!response.ok) {
        const failure = z
          .object({ error: z.string() })
          .parse(await response.json());
        throw new Error(failure.error);
      }
      if (!response.body) throw new Error("生成连接未建立，请重试。");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let pending = "",
        completed = false;
      const eventSchema = z.discriminatedUnion("type", [
        z.object({
          type: z.literal("progress"),
          phase: z.string(),
          message: z.string(),
        }),
        z.object({ type: z.literal("complete"), number: z.number() }),
        z.object({ type: z.literal("error"), message: z.string() }),
      ]);
      try {
        while (true) {
          const { done, value } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n");
          pending = lines.pop() || "";
          for (const line of lines.filter(Boolean)) {
            const event = eventSchema.parse(JSON.parse(line));
            if (event.type === "error") throw new Error(event.message);
            if (event.type === "complete") completed = true;
            if (event.type === "progress") {
              setBusy(event.message);
              setPhases((prev) => [
                ...prev.filter((p) => p.phase !== event.phase),
                event,
              ]);
            }
          }
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
      if (!completed)
        throw new Error("生成连接中断。请刷新检查保存状态后重试。");
      toast.success("中英文教学设计已保存");
      router.push(`/lesson-plans/${id}`);
      router.refresh();
    });
  }
  async function move(next: number) {
    await run("正在保存备课进度…", async () => {
      if (
        next > step &&
        step === 2 &&
        !selections.some((s) => s.sourceType === "textbook")
      )
        throw new Error("请选择或上传至少一份本次教材。");
      if (next > step && step === 3 && !info.teachingScope?.trim())
        throw new Error("请填写本次实际教学页码或板块。");
      await saveDraft(next);
      setStep(next);
    });
  }
  return (
    <>
      <PageHeading
        title="新建教学设计"
        eyebrow="课前备课 / 新建教学设计"
        description="从教材与学情出发，逐课时确认，生成共享结构的中英文教学设计。"
        action={
          <Button variant="ghost" asChild>
            <Link href="/prepare">
              <ChevronLeft size={16} />
              返回备课
            </Link>
          </Button>
        }
      />
      <ol className="wizard-steps">
        {steps.map((label, i) => (
          <li
            key={label}
            className={
              step === i + 1 ? "current" : step > i + 1 ? "complete" : ""
            }
          >
            <span>{step > i + 1 ? <Check size={17} /> : i + 1}</span>
            <b>{label}</b>
          </li>
        ))}
      </ol>
      <div className="wizard-layout">
        <div className="wizard-main">
          {busy ? (
            <div className="generation-status" role="status">
              <Busy label={busy} />
              {phases.length ? (
                <ol className="generation-phases">
                  {phases.map((p) => (
                    <li key={p.phase}>{p.message}</li>
                  ))}
                </ol>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="error-message wizard-error">
              {error}
            </div>
          ) : null}
          <section className="form-section">
            {step === 1 ? (
              <>
                <h2>先选择本次授课班级</h2>
                <p className="muted">复用已确认的档案，也可以稍后补充学情。</p>
                <ClassProfilePicker
                  initialProfiles={profiles}
                  documents={availableDocuments}
                  selectedId={info.classProfileId}
                  onChoose={(record) => {
                    setInfo((prev) => ({
                      ...prev,
                      classProfileId: record?.id,
                      classProfile: record?.profile,
                      grade: record?.profile.grade || prev.grade,
                      className: record?.profile.className || "",
                    }));
                    setAnalysis(null);
                  }}
                />
                {!info.classProfileId ? (
                  <Field label="年级">
                    <select
                      value={info.grade}
                      onChange={(e) =>
                        update("grade", e.target.value as BasicInfo["grade"])
                      }
                    >
                      {["高一", "高二", "高三"].map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </>
            ) : null}
            {step === 2 ? (
              <>
                <h2>教材与参考资料</h2>
                <p className="muted">
                  教材决定课堂内容；参考资料分别支持学情、目标、活动与评价。
                </p>
                <section className="source-region" aria-label="教材区域">
                  <h3>A · 本次教材</h3>
                  <div className="form-grid">
                    <Field
                      label="教材版本（选填）"
                      hint="可留空，AI 根据文件识别"
                    >
                      <input
                        value={info.textbook}
                        maxLength={150}
                        placeholder="未指定"
                        onChange={(e) => update("textbook", e.target.value)}
                      />
                    </Field>
                    <Field label="单元（选填）" hint="可留空，不影响文件备课">
                      <input
                        value={info.unit}
                        maxLength={150}
                        placeholder="未指定"
                        onChange={(e) => update("unit", e.target.value)}
                      />
                    </Field>
                  </div>
                  <FilePicker
                    purpose="textbook"
                    initialDocuments={availableDocuments}
                    onAvailable={available}
                    selected={selections
                      .filter((s) => s.sourceType === "textbook")
                      .map((s) => s.documentId)}
                    onChange={(ids) => select("textbook", ids)}
                  />
                </section>
                <section className="source-region" aria-label="参考资料区域">
                  <h3>B · 参考资料</h3>
                  <p className="muted">
                    教学案例只参考方法，不会替代教材或扩展实际授课范围。
                  </p>
                  <FilePicker
                    purpose="reference"
                    initialDocuments={availableDocuments}
                    onAvailable={available}
                    selected={selections
                      .filter((s) => s.sourceType === "reference")
                      .map((s) => s.documentId)}
                    onChange={(ids) => select("reference", ids)}
                  />
                  {selections
                    .filter((s) => s.sourceType === "reference")
                    .map((s) => (
                      <Field
                        key={s.documentId}
                        label={`${availableDocuments.find((d) => d.id === s.documentId)?.name || "所选参考资料"}的用途`}
                      >
                        <select
                          aria-label={`资料用途 ${s.documentId}`}
                          value={s.referenceType}
                          onChange={(e) => {
                            setSelections((prev) =>
                              prev.map((item) =>
                                item.documentId === s.documentId
                                  ? {
                                      ...item,
                                      referenceType: e.target
                                        .value as DocumentSelection["referenceType"],
                                    }
                                  : item,
                              ),
                            );
                            setAnalysis(null);
                          }}
                        >
                          {referenceTypes.map((t) => (
                            <option key={t} value={t}>
                              {referenceLabels[t]}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ))}
                </section>
              </>
            ) : null}
            {step === 3 ? (
              <>
                <h2>明确实际授课与参考范围</h2>
                <p className="muted">
                  实际活动以授课范围为边界，整个单元用于背景与衔接。
                </p>
                <div className="form-stack">
                  <Field
                    label="本次教学范围"
                    required
                    hint="例如 P20–22 · Reading for Writing"
                  >
                    <input
                      value={info.teachingScope || ""}
                      maxLength={1000}
                      onChange={(e) => update("teachingScope", e.target.value)}
                    />
                  </Field>
                  <label className="scope-option">
                    <input
                      type="checkbox"
                      checked={info.referenceWholeUnit !== false}
                      onChange={(e) => {
                        update("referenceWholeUnit", e.target.checked);
                        setInfo((prev) => ({
                          ...prev,
                          referenceScope: e.target.checked
                            ? `整个 ${prev.unit || "所选 Unit"}`
                            : prev.teachingScope,
                        }));
                      }}
                    />
                    参考整个 Unit
                  </label>
                  <Field label="允许参考的教材范围">
                    <input
                      value={
                        info.referenceScope ||
                        (info.referenceWholeUnit !== false
                          ? `整个 ${info.unit || "所选 Unit"}`
                          : "")
                      }
                      maxLength={1000}
                      onChange={(e) => update("referenceScope", e.target.value)}
                    />
                  </Field>
                </div>
              </>
            ) : null}
            {step === 4 ? (
              <>
                <h2>安排本次课时</h2>
                <div className="segmented-tabs">
                  {(["single", "double"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={
                        (info.lessonMode || "single") === mode ? "selected" : ""
                      }
                      onClick={() => {
                        const next =
                          mode === "double"
                            ? [durations[0] || 45, durations[1] || 45]
                            : [durations[0] || 45];
                        setInfo({
                          ...info,
                          lessonMode: mode,
                          lessonDurations: next,
                          duration: next.reduce((a, b) => a + b, 0),
                        });
                        setAnalysis(null);
                      }}
                    >
                      {mode === "single" ? "单课时" : "连续双课时"}
                    </button>
                  ))}
                </div>
                <p className="muted">
                  每课时分别设计目标、活动、评价与板书，连续课时明确产出承接。
                </p>
                <div className="form-grid">
                  {durations.map((minutes, i) => (
                    <Field
                      key={i}
                      label={
                        durations.length > 1
                          ? `第 ${i + 1} 课时时长（分钟）`
                          : "课时时长（分钟）"
                      }
                      required
                    >
                      <input
                        type="number"
                        min={20}
                        max={180}
                        value={minutes}
                        onChange={(e) => {
                          const next = [...durations];
                          next[i] = Number(e.target.value);
                          setInfo({
                            ...info,
                            lessonDurations: next,
                            duration: next.reduce((a, b) => a + b, 0),
                          });
                          setAnalysis(null);
                        }}
                      />
                    </Field>
                  ))}
                </div>
              </>
            ) : null}
            {step === 5 ? (
              <>
                <h2>AI 分析与确认</h2>
                {!analysis ? (
                  <div className="generation-review">
                    <p>
                      AI
                      将从教材识别标题、主题、体裁和目标，并结合学情、课程标准提出各课时分析。未知版本与
                      Unit 会显示“未指定”。
                    </p>
                    <Button disabled={!!busy} onClick={analyze}>
                      <Sparkles size={16} />
                      开始教学分析
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="lesson-connection">
                      <h3>课时安排与学习递进</h3>
                      <p>
                        {analysis.sequenceRationale ||
                          analysis.materialAnalysis?.continuity}
                      </p>
                    </div>
                    {analysis.materialAnalysis ? (
                      <details className="material-analysis">
                        <summary>共同教材分析 · 单元视角</summary>
                        {Object.entries(analysis.materialAnalysis).map(
                          ([key, value]) => (
                            <Field key={key} label={materialLabels[key] || key}>
                              <textarea
                                rows={2}
                                value={
                                  Array.isArray(value)
                                    ? value.join("\n")
                                    : value
                                }
                                onChange={(e) =>
                                  setAnalysis({
                                    ...analysis,
                                    materialAnalysis: {
                                      ...analysis.materialAnalysis!,
                                      [key]: Array.isArray(value)
                                        ? e.target.value
                                            .split("\n")
                                            .filter(Boolean)
                                        : e.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                          ),
                        )}
                      </details>
                    ) : null}
                    <Field label="学情分析">
                      <textarea
                        rows={3}
                        value={analysis.students}
                        onChange={(e) =>
                          setAnalysis({ ...analysis, students: e.target.value })
                        }
                      />
                    </Field>
                    <div
                      className="segmented-tabs lesson-tabs"
                      role="tablist"
                      aria-label="课时分析"
                    >
                      {analysis.lessons?.map((l) => (
                        <button
                          key={l.id}
                          role="tab"
                          aria-selected={lesson?.id === l.id}
                          className={lesson?.id === l.id ? "selected" : ""}
                          onClick={() => setActiveLesson(l.id)}
                        >
                          Lesson {l.lessonNumber} · {l.duration} 分钟
                        </button>
                      ))}
                    </div>
                    {lesson ? (
                      <div
                        role="tabpanel"
                        aria-label={`Lesson ${lesson.lessonNumber} 分析`}
                      >
                        <h3>{lesson.title}</h3>
                        <div className="analysis-fields">
                          {Object.entries(lessonFields).map(([key, label]) => {
                            const field = key as keyof typeof lessonFields,
                              value = lesson[field];
                            return (
                              <Field key={key} label={label}>
                                <textarea
                                  rows={2}
                                  value={
                                    Array.isArray(value)
                                      ? value.join("\n")
                                      : value
                                  }
                                  onChange={(e) =>
                                    setAnalysis({
                                      ...analysis,
                                      lessons: analysis.lessons!.map((l) =>
                                        l.id === lesson.id
                                          ? {
                                              ...l,
                                              [field]: Array.isArray(value)
                                                ? e.target.value
                                                    .split("\n")
                                                    .filter(Boolean)
                                                : e.target.value,
                                            }
                                          : l,
                                      ),
                                    })
                                  }
                                />
                              </Field>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="muted">
                        历史草稿尚无分课时分析，请重新分析。
                      </p>
                    )}
                    <section className="analysis-dialogue">
                      <h3>
                        <Sparkles size={17} />与 AI 调整当前课时
                      </h3>
                      <p className="muted">
                        补充教学偏好或局部要求，其他课时保留。
                      </p>
                      <div className="quick-prompts">
                        {[
                          "加强考试导向",
                          "增加互动",
                          "增加写作支架",
                          "保留教材活动",
                          "减少教师讲授",
                          "加强前后课时衔接",
                        ].map((p) => (
                          <button
                            key={p}
                            type="button"
                            disabled={!!busy}
                            onClick={() => setInstruction(p)}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                      <div className="revision-messages" aria-live="polite">
                        {conversation.map((m, i) => (
                          <div key={i} className={`revision-message ${m.role}`}>
                            <b>
                              {m.role === "user" ? "你的要求" : "AI 分析建议"} ·{" "}
                              {analysis.lessons?.find(
                                (l) => l.id === m.lessonId,
                              )?.lessonNumber || ""}
                            </b>
                            <p>{m.text}</p>
                          </div>
                        ))}
                      </div>
                      <Field label="与 AI 确认教学要求">
                        <textarea
                          rows={3}
                          maxLength={2000}
                          placeholder="例如：第二课时增加段落衔接支架，第一课时保持当前分析。"
                          value={instruction}
                          onChange={(e) => setInstruction(e.target.value)}
                        />
                      </Field>
                      <Button
                        disabled={
                          !!busy || !lesson || instruction.trim().length < 2
                        }
                        onClick={discuss}
                      >
                        <Send size={15} />
                        调整选定课时分析
                      </Button>
                    </section>
                    <Button variant="ghost" disabled={!!busy} onClick={analyze}>
                      重新分析教材与课时
                    </Button>
                  </>
                )}
              </>
            ) : null}
            {step === 6 ? (
              <div className="generation-review">
                <h2>生成中英文教学设计</h2>
                <p className="muted">
                  依据已确认的分析生成详细活动、课堂材料与独立板书。Word
                  优先下载英文版。
                </p>
                <div className="review-summary">
                  <h3>{info.title || "教材任务教学设计"}</h3>
                  <p>{info.topic || "主题由教材分析识别"}</p>
                  <div>
                    <span>{info.className || "学情待确认"}</span>
                    <span>{durations.join(" + ")} 分钟</span>
                    <span>{info.teachingScope}</span>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="form-actions">
              {step > 1 ? (
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  className="push-left"
                  onClick={() => move(step - 1)}
                >
                  <ChevronLeft size={16} />
                  上一步
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() =>
                  run("正在保存草稿…", async () => {
                    await saveDraft(step);
                    if (analysis && id)
                      await request(
                        `/api/lesson-plans/${id}`,
                        { analysis },
                        "PATCH",
                      );
                    toast.success("草稿与当前进度已保存");
                  })
                }
              >
                保存草稿
              </Button>
              {step < 5 ? (
                <Button disabled={!!busy} onClick={() => move(step + 1)}>
                  下一步
                </Button>
              ) : null}
              {step === 5 && analysis ? (
                <Button
                  disabled={!!busy || !lesson}
                  onClick={() =>
                    run("正在保存确认分析…", async () => {
                      await request(
                        `/api/lesson-plans/${id}`,
                        { analysis, analysisConfirmed: true, draftStep: 6 },
                        "PATCH",
                      );
                      setStep(6);
                    })
                  }
                >
                  接受分析并继续
                </Button>
              ) : null}
              {step === 6 ? (
                <Button disabled={!!busy} onClick={generate}>
                  <Sparkles size={16} />
                  生成完整教学设计
                </Button>
              ) : null}
            </div>
          </section>
        </div>
        <aside className="wizard-aside">
          <section>
            <h3>你的课程</h3>
            <p>{info.title || "标题由 AI 分析后识别"}</p>
            <p>
              {info.className || "学情待确认"} · {info.grade}
            </p>
            <p>教材：{info.textbook || "未指定"}</p>
            <p>单元：{info.unit || "未指定"}</p>
            <div>
              <Clock3 size={15} />
              {info.lessonMode === "double" ? "双课时" : "单课时"} ·{" "}
              {durations.join(" + ")} 分钟
            </div>
            <div>
              <FileText size={15} />
              教材{" "}
              {selections.filter((s) => s.sourceType === "textbook").length} 份
              · 参考{" "}
              {selections.filter((s) => s.sourceType === "reference").length} 份
            </div>
            <p>授课：{info.teachingScope || "待选择"}</p>
            <p>
              参考：{info.referenceScope || `整个 ${info.unit || "所选 Unit"}`}
            </p>
          </section>
          <section className="wizard-guidance">
            <h3>从证据出发，逐课时确认</h3>
            <p>
              教材范围决定课堂内容，案例只参考方法。确认分析后，中英文共享同一份课时、活动和时间结构。
            </p>
            {mock ? (
              <div className="demo-note">
                当前为演示模式，教材事实需核实；无法可靠翻译的文本会保留原文并标记。配置真实模型后生成完整英文文本。
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
