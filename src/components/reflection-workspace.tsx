"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  RotateCcw,
  FileText,
  ChevronRight,
  Check,
  Sparkles,
  NotebookPen,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { request, dateLabel } from "@/lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Field } from "./ui/field";
import { PageHeading, EmptyState, Busy } from "./shared";
import { FilePicker, type FileRecord } from "./file-picker";
import type { ReflectionReport } from "@/types/lesson";
type ReflectionCard = {
  id: string;
  title: string;
  lessonTitle: string;
  sourceVersion: number;
  createdAt: string;
  hasReport: boolean;
  optimizedVersion: number | null;
};
export function ReflectionWorkspace({
  reflections,
  plans,
  documents,
  selectedLesson,
}: {
  reflections: ReflectionCard[];
  plans: { id: string; title: string }[];
  documents: FileRecord[];
  selectedLesson?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!selectedLesson);
  const [lesson, setLesson] = useState(selectedLesson || plans[0]?.id || "");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const reflection = await request<{ id: string }>("/api/reflection", {
        lessonPlanId: lesson,
        title: title || `${plans.find((p) => p.id === lesson)?.title}课堂复盘`,
        notes,
        documentIds: selected,
      });
      router.push(`/reflection/${reflection.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="课后复盘"
        description="让课堂里的观察，成为下一次教学的依据。"
        action={
          <Button onClick={() => setOpen(true)} disabled={!plans.length}>
            <Plus size={17} />
            创建教学复盘
          </Button>
        }
      />
      <div className="reflection-intro">
        <span className="workflow-icon amber">
          <RotateCcw size={25} />
        </span>
        <div>
          <h2>回看这堂课，找到下一次的改进</h2>
          <p>关联教案，整理学生反馈与课堂记录，生成具体的教学改进建议。</p>
        </div>
        <div className="reflection-loop">
          <span>原始教案</span>
          <ChevronRight size={14} />
          <span>反馈分析</span>
          <ChevronRight size={14} />
          <span>优化新版本</span>
        </div>
      </div>
      {reflections.length ? (
        <div className="reflection-list">
          {reflections.map((r) => (
            <Link
              className="reflection-card"
              key={r.id}
              href={`/reflection/${r.id}`}
            >
              <div className="reflection-card-icon">
                <ClipboardList size={24} />
              </div>
              <div className="reflection-card-content">
                <h2>{r.title}</h2>
                <p>
                  <FileText size={14} />
                  {r.lessonTitle} <span>V{r.sourceVersion}</span>
                </p>
                <small>{dateLabel(r.createdAt)} 创建</small>
              </div>
              <span
                className={`badge ${r.hasReport ? "badge-teal" : "badge-gray"}`}
              >
                {r.hasReport ? "报告已生成" : "等待分析"}
              </span>
              {r.optimizedVersion ? (
                <span className="badge badge-amber">
                  已生成 V{r.optimizedVersion}
                </span>
              ) : null}
              <ChevronRight size={18} className="muted" />
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title={
              plans.length ? "记录第一堂课的教学反思" : "先完成一份教学设计"
            }
            description={
              plans.length
                ? "哪些活动有效？学生在哪里遇到了困难？从真实证据开始。"
                : "复盘需要关联一份完整教案，先到课前备课创建教学设计。"
            }
            href={plans.length ? undefined : "/prepare/new"}
            button="新建教学设计"
          >
            {plans.length ? (
              <Button onClick={() => setOpen(true)}>创建教学复盘</Button>
            ) : null}
          </EmptyState>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="创建教学复盘"
        description="上传或记录学生反馈、教师反思和课堂观察。"
        wide
      >
        <form onSubmit={create} className="form-stack">
          <div className="form-grid">
            <Field label="关联教学设计" required>
              <select
                value={lesson}
                onChange={(e) => setLesson(e.target.value)}
                required
                aria-label="关联教学设计"
              >
                <option value="" disabled>
                  选择一份教学设计
                </option>
                {plans.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="复盘名称">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="留空时根据课程名称生成"
                maxLength={150}
              />
            </Field>
          </div>
          <Field
            label="课堂观察与反馈"
            hint="请填写实际观察，不必给出结论，也可以上传反馈资料。"
          >
            <textarea
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：学生漏写了活动地点；互评标准不够具体……"
              maxLength={12000}
            />
          </Field>
          <FilePicker
            initialDocuments={documents}
            selected={selected}
            onChange={setSelected}
          />
          {error ? (
            <div role="alert" className="error-message">
              {error}
            </div>
          ) : null}
          <div className="dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={busy || !lesson || (!notes.trim() && !selected.length)}
            >
              {busy ? <Busy label="正在保存反馈…" /> : "保存并进入复盘"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
const reportFields: { key: keyof ReflectionReport; name: string }[] = [
  { key: "overall", name: "总体评价" },
  { key: "goalAchievement", name: "教学目标达成分析" },
  { key: "activityAnalysis", name: "教学活动有效性" },
  { key: "participation", name: "学生参与度" },
  { key: "timeAllocation", name: "教学时间分配" },
  { key: "writingDevelopment", name: "写作能力培养效果" },
  { key: "studentFeedback", name: "学生反馈分析" },
  { key: "problems", name: "主要教学问题" },
  { key: "suggestions", name: "具体优化建议" },
  { key: "nextLesson", name: "下一轮教学设计建议" },
];
export function ReflectionDetail({
  id,
  title,
  lessonId,
  lessonTitle,
  sourceVersion,
  currentVersion,
  notes,
  initialReport,
  optimizedVersion,
  documentNames,
  mock,
}: {
  id: string;
  title: string;
  lessonId: string;
  lessonTitle: string;
  sourceVersion: number;
  currentVersion: number;
  notes: string;
  initialReport: ReflectionReport | null;
  optimizedVersion: number | null;
  documentNames: string[];
  mock: boolean;
}) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [optimized, setOptimized] = useState(optimizedVersion);
  async function analyze() {
    setBusy("正在分析教学目标、课堂活动与反馈…");
    setError("");
    try {
      setReport(
        await request<ReflectionReport>(`/api/reflection/${id}`, {
          action: "analyze",
        }),
      );
      toast.success("教学改进报告已生成");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setBusy("");
    }
  }
  async function optimize() {
    setBusy("正在结合复盘结果优化教案…");
    setError("");
    try {
      const data = await request<{ number: number }>(`/api/reflection/${id}`, {
        action: "optimize",
        expectedVersion: currentVersion,
      });
      setOptimized(data.number);
      toast.success(`优化版 V${data.number} 已保存`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "优化失败");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeading
        title={title}
        eyebrow="课后复盘 / 教学改进报告"
        action={
          <Button variant="outline" asChild>
            <Link href="/reflection">返回复盘列表</Link>
          </Button>
        }
      />
      <div className="reflection-detail-meta">
        <FileText size={17} />
        <Link href={`/lesson-plans/${lessonId}`}>{lessonTitle}</Link>
        <span className="badge badge-gray">复盘基于 V{sourceVersion}</span>
      </div>
      {busy ? (
        <div className="generation-status" role="status">
          <Busy label={busy} />
        </div>
      ) : null}
      {error ? (
        <div className="error-message wizard-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="reflection-detail-layout">
        <div className="panel reflection-report">
          {report ? (
            reportFields.map(({ key, name }, i) => (
              <section key={key}>
                <div className="report-section-heading">
                  <span>{i + 1}</span>
                  <h2>{name}</h2>
                </div>
                {Array.isArray(report[key]) ? (
                  <ul>
                    {(report[key] as string[]).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{report[key]}</p>
                )}
              </section>
            ))
          ) : (
            <EmptyState
              title="反馈已保存，开始教学分析"
              description="AI 将对照当时的教案版本，分析目标、活动、学生反馈与时间分配。"
            >
              <Button disabled={!!busy} onClick={analyze}>
                <Sparkles size={16} />
                生成教学改进报告
              </Button>
            </EmptyState>
          )}
        </div>
        <aside>
          <section className="panel reflection-evidence">
            <h3>本次复盘依据</h3>
            <span className="badge badge-gray">原教案 V{sourceVersion}</span>
            <h4>课堂记录</h4>
            <p>{notes || "未填写文本反馈，已提供附件。"}</p>
            {documentNames.length ? (
              <>
                <h4>反馈资料</h4>
                {documentNames.map((name, i) => (
                  <p key={i} className="evidence-file">
                    <FileText size={14} />
                    {name}
                  </p>
                ))}
              </>
            ) : null}
            {mock ? (
              <p className="demo-note">
                演示报告不会测量实际达成率，正式教学请使用真实反馈与模型。
              </p>
            ) : null}
          </section>
          {report ? (
            <section className="optimize-panel">
              <NotebookPen size={23} />
              <h3>让复盘回到下一堂课</h3>
              <p>根据具体建议生成新的教案版本，保留原版与完整修改记录。</p>
              {optimized ? (
                <>
                  <div className="optimized-success">
                    <Check size={16} />
                    已生成优化版 V{optimized}
                  </div>
                  <Button className="full-width" asChild>
                    <Link href={`/lesson-plans/${lessonId}`}>
                      查看优化教学设计
                    </Link>
                  </Button>
                </>
              ) : (
                <Button
                  onClick={optimize}
                  disabled={!!busy}
                  className="full-width"
                >
                  <Sparkles size={15} />
                  生成优化版教学设计
                </Button>
              )}
              <Button
                variant="ghost"
                className="full-width"
                disabled={!!busy}
                onClick={analyze}
              >
                重新分析反馈
              </Button>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
