"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Sparkles,
  ChevronLeft,
  BookOpen,
  Clock3,
  FileText,
  RefreshCw,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import {
  basicInfoSchema,
  defaultBasic,
  type BasicInfo,
  type LessonAnalysis,
} from "@/types/lesson";
import { request } from "@/lib/utils";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { PageHeading, Busy } from "./shared";
import { FilePicker, type FileRecord } from "./file-picker";
const steps = ["课程基本信息", "参考资料", "教学分析", "生成教学设计"];
const analysisFields: {
  key: keyof LessonAnalysis;
  label: string;
  hint: string;
}[] = [
  { key: "theme", label: "教学主题分析", hint: "写作情境与单元主题的关系" },
  { key: "students", label: "学情分析", hint: "已有能力与需要支持的部分" },
  {
    key: "objectives",
    label: "教学目标建议",
    hint: "每行一个目标，可以观察和评价",
  },
  { key: "focus", label: "教学重点", hint: "本节课集中发展的能力" },
  { key: "difficulties", label: "教学难点", hint: "学生可能遇到的困难" },
  {
    key: "writingSkills",
    label: "写作能力培养重点",
    hint: "内容、结构、语言与修改",
  },
  { key: "strategies", label: "推荐教学策略", hint: "每行一个策略" },
];
export type DraftData = {
  id: string;
  basicInfo: BasicInfo;
  analysis: LessonAnalysis | null;
  documentIds: string[];
};
export function PrepareWizard({
  documents,
  draft,
  mock,
}: {
  documents: FileRecord[];
  draft?: DraftData;
  mock: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(draft?.analysis ? 3 : draft ? 2 : 1);
  const [id, setId] = useState(draft?.id);
  const [info, setInfo] = useState<BasicInfo>(draft?.basicInfo || defaultBasic);
  const [selected, setSelected] = useState<string[]>(draft?.documentIds || []);
  const [analysis, setAnalysis] = useState<LessonAnalysis | null>(
    draft?.analysis || null,
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  function update<K extends keyof BasicInfo>(key: K, value: BasicInfo[K]) {
    setInfo((prev) => ({ ...prev, [key]: value }));
  }
  async function run(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy("");
    }
  }
  async function saveInfo(next = true) {
    const parsed = basicInfoSchema.safeParse(info);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join("；"));
      return;
    }
    await run("正在保存课程信息…", async () => {
      if (id) {
        await request(`/api/lesson-plans/${id}`, { basicInfo: info }, "PATCH");
        setAnalysis(null);
      } else {
        const plan = await request<{ id: string }>("/api/lesson-plans", {
          basicInfo: info,
          documentIds: [],
        });
        setId(plan.id);
        router.replace(`/prepare/new?draft=${plan.id}`);
      }
      toast.success("草稿已保存");
      if (next) setStep(2);
    });
  }
  async function analyze(section?: keyof LessonAnalysis) {
    if (!id) return;
    await run(
      section ? "正在重新分析这一部分…" : "正在结合课程信息与资料分析教学…",
      async () => {
        await request(
          `/api/lesson-plans/${id}`,
          { documentIds: selected },
          "PATCH",
        );
        const data = await request<LessonAnalysis>(`/api/lesson-plans/${id}`, {
          action: "analyze",
          section,
        });
        setAnalysis(data);
        setStep(3);
        toast.success("教学分析已生成，请确认或修改");
      },
    );
  }
  async function confirm() {
    if (!id || !analysis) return;
    await run("正在保存教学分析…", async () => {
      await request(`/api/lesson-plans/${id}`, { analysis }, "PATCH");
      setStep(4);
    });
  }
  async function generate() {
    if (!id) return;
    await run("正在设计课堂活动并生成完整教案…", async () => {
      await request(`/api/lesson-plans/${id}`, { action: "generate" });
      toast.success("教学设计已生成，进入编辑器");
      router.push(`/lesson-plans/${id}`);
      router.refresh();
    });
  }
  return (
    <>
      <PageHeading
        title="新建教学设计"
        eyebrow="课前备课 / 新建教学设计"
        description="先理解教学情境，再一起设计课堂。"
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
              <p>请保持页面打开。草稿已持久保存，完成后会更新页面。</p>
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="error-message wizard-error">
              {error}
            </div>
          ) : null}
          {step === 1 ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveInfo();
              }}
              className="form-section"
            >
              <h2>这是一堂怎样的写作课？</h2>
              <p className="muted">
                填写教学情境，帮助 AI 给出更贴合课堂的建议。
              </p>
              <div className="form-grid">
                <Field label="教学设计名称" required className="span-2">
                  <input
                    value={info.title}
                    onChange={(e) => update("title", e.target.value)}
                    placeholder="例如：邀请信写作——校园英语文化节"
                    required
                    maxLength={150}
                  />
                </Field>
                <Field label="年级" required>
                  <select
                    value={info.grade}
                    onChange={(e) =>
                      update("grade", e.target.value as BasicInfo["grade"])
                    }
                  >
                    {["高一", "高二", "高三"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="教材版本" required>
                  <input
                    value={info.textbook}
                    onChange={(e) => update("textbook", e.target.value)}
                    required
                  />
                </Field>
                <Field label="单元">
                  <input
                    value={info.unit}
                    onChange={(e) => update("unit", e.target.value)}
                    placeholder="例如：必修第二册 Unit 4"
                  />
                </Field>
                <Field label="班级">
                  <input
                    value={info.className}
                    onChange={(e) => update("className", e.target.value)}
                    placeholder="例如：高二（3）班"
                  />
                </Field>
                <Field label="写作主题" required className="span-2">
                  <input
                    value={info.topic}
                    onChange={(e) => update("topic", e.target.value)}
                    required
                    placeholder="例如：An invitation to our English festival"
                  />
                </Field>
                <Field label="写作类型" required>
                  <select
                    value={info.lessonType}
                    onChange={(e) =>
                      update(
                        "lessonType",
                        e.target.value as BasicInfo["lessonType"],
                      )
                    }
                  >
                    {[
                      "应用文",
                      "读后续写",
                      "概要写作",
                      "议论文",
                      "记叙文",
                      "说明文",
                      "其他",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field label="课时时长（分钟）" required>
                  <input
                    type="number"
                    value={info.duration}
                    min={20}
                    max={180}
                    onChange={(e) => update("duration", Number(e.target.value))}
                    required
                  />
                </Field>
                <Field
                  label="教学目标"
                  className="span-2"
                  hint="可以先写初步想法，下一步会提供建议。"
                >
                  <textarea
                    rows={3}
                    value={info.objectives}
                    onChange={(e) => update("objectives", e.target.value)}
                    placeholder="例如：学生能在真实情境中使用恰当的语言表达邀请意图。"
                  />
                </Field>
                <Field label="教师补充要求" className="span-2">
                  <textarea
                    rows={3}
                    value={info.requirements}
                    onChange={(e) => update("requirements", e.target.value)}
                    placeholder="例如：增加同伴互评；为基础较弱的学生提供语言支架。"
                  />
                </Field>
              </div>
              <div className="form-actions">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveInfo(false)}
                  disabled={!!busy}
                >
                  <Save size={16} />
                  保存草稿
                </Button>
                <Button type="submit" disabled={!!busy}>
                  保存并选择资料
                </Button>
              </div>
            </form>
          ) : null}
          {step === 2 ? (
            <section className="form-section">
              <h2>让 AI 了解你的教材与学生</h2>
              <p className="muted">
                添加学情、教材、课程标准或写作案例。资料会保留在你的教学空间。
              </p>
              <FilePicker
                initialDocuments={documents}
                selected={selected}
                onChange={setSelected}
              />
              <div className="form-actions">
                <Button
                  variant="ghost"
                  className="push-left"
                  onClick={() => setStep(1)}
                  disabled={!!busy}
                >
                  <ChevronLeft size={16} />
                  上一步
                </Button>
                <Button onClick={() => analyze()} disabled={!!busy}>
                  <Sparkles size={16} />
                  开始教学分析
                </Button>
              </div>
            </section>
          ) : null}
          {step === 3 && analysis ? (
            <section className="form-section">
              <h2>先确认教学分析</h2>
              <p className="muted">
                你可以直接修改，或仅重新生成其中一个部分。确认后再生成完整教案。
              </p>
              <div className="analysis-fields">
                {analysisFields.map(({ key, label, hint }) => (
                  <div className="analysis-field" key={key}>
                    <div>
                      <b>{label}</b>
                      <button
                        className="text-link"
                        disabled={!!busy}
                        onClick={() => analyze(key)}
                      >
                        <RefreshCw size={13} />
                        重新分析
                      </button>
                    </div>
                    <p>{hint}</p>
                    <textarea
                      aria-label={label}
                      rows={Array.isArray(analysis[key]) ? 4 : 3}
                      value={
                        Array.isArray(analysis[key])
                          ? (analysis[key] as string[]).join("\n")
                          : analysis[key]
                      }
                      onChange={(e) =>
                        setAnalysis({
                          ...analysis,
                          [key]: Array.isArray(analysis[key])
                            ? e.target.value.split("\n")
                            : e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="form-actions">
                <Button
                  className="push-left"
                  variant="ghost"
                  onClick={() => setStep(2)}
                  disabled={!!busy}
                >
                  <ChevronLeft size={16} />
                  上一步
                </Button>
                <Button onClick={confirm} disabled={!!busy}>
                  接受分析并继续
                </Button>
              </div>
            </section>
          ) : null}
          {step === 4 ? (
            <section className="form-section generation-review">
              <div className="review-symbol">
                <FileText size={32} />
              </div>
              <h2>课程已梳理，开始设计课堂</h2>
              <p className="muted">
                将依据你确认的分析，生成可编辑的完整教学设计。
              </p>
              <div className="review-summary">
                <h3>{info.title}</h3>
                <p className="english-topic">{info.topic}</p>
                <div>
                  <span>
                    {info.grade} / {info.lessonType}
                  </span>
                  <span>{info.duration} 分钟</span>
                  <span>{selected.length} 份参考资料</span>
                </div>
              </div>
              <div className="review-outline">
                教材与学情分析 · 教学目标与重难点 · 结构化教学过程
                <br />
                教学评价 · 作业设计 · 板书设计 · 反思预留区
              </div>
              <div className="form-actions">
                <Button
                  variant="ghost"
                  className="push-left"
                  onClick={() => setStep(3)}
                  disabled={!!busy}
                >
                  <ChevronLeft size={16} />
                  修改教学分析
                </Button>
                <Button onClick={generate} disabled={!!busy}>
                  <Sparkles size={16} />
                  生成完整教学设计
                </Button>
              </div>
            </section>
          ) : null}
        </div>
        <aside className="wizard-aside">
          <section>
            <h3>你的课程</h3>
            <p>{info.title || "填写课程名称后显示在这里"}</p>
            <div>
              <BookOpen size={15} />
              {info.grade} · {info.lessonType}
            </div>
            <div>
              <Clock3 size={15} />
              {info.duration} 分钟
            </div>
            <div>
              <FileText size={15} />
              {selected.length} 份参考资料
            </div>
          </section>
          <section className="wizard-guidance">
            <h3>教师确认，始终在前</h3>
            <p>
              AI
              先提供分析建议，最终教学决策由你确认。生成后，每个教学阶段都可以单独修改。
            </p>
            {mock ? (
              <div className="demo-note">
                当前为演示模式，生成内容用于验证流程。配置模型后可进行真实资料分析。
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
