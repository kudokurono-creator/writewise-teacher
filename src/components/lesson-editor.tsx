"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Download,
  History,
  Sparkles,
  Send,
  Check,
  RotateCcw,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import type { BasicInfo, LessonContent } from "@/types/lesson";
import { request, fullDate } from "@/lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Busy } from "./shared";
import { LessonDocument, sectionNames } from "./lesson-document";
type Version = {
  number: number;
  content: LessonContent;
  changeDescription: string;
  createdAt: string;
};
export function LessonEditor({
  id,
  info,
  initialContent,
  initialVersion,
  versions,
  references,
  mock,
}: {
  id: string;
  info: BasicInfo;
  initialContent: LessonContent;
  initialVersion: number;
  versions: Version[];
  references: { name: string; id: string }[];
  mock: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [version, setVersion] = useState(initialVersion);
  const [history, setHistory] = useState(versions);
  const [busy, setBusy] = useState("");
  const [target, setTarget] = useState(content.stages[0]?.id || "objectives");
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string }[]>(
    [],
  );
  const [showHistory, setShowHistory] = useState(false);
  const [preview, setPreview] = useState<Version | null>(null);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(content) !== JSON.stringify(savedContent);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  async function apply(
    result: { number: number; content: LessonContent },
    description: string,
  ) {
    setContent(result.content);
    setSavedContent(result.content);
    setVersion(result.number);
    setHistory((prev) => [
      {
        number: result.number,
        content: result.content,
        changeDescription: description,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    router.refresh();
  }
  async function operation(label: string, task: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await task();
    } catch (e) {
      const text = e instanceof Error ? e.message : "操作失败";
      setError(text);
      toast.error(text);
    } finally {
      setBusy("");
    }
  }
  async function save() {
    await operation("正在保存…", async () => {
      const result = await request<{ number: number; content: LessonContent }>(
        `/api/lesson-plans/${id}`,
        { action: "save", content, expectedVersion: version },
      );
      await apply(result, "教师手动编辑");
      toast.success(`已保存为 V${result.number}`);
    });
  }
  async function revise(e: React.FormEvent) {
    e.preventDefault();
    if (dirty || !instruction.trim()) return;
    await operation("正在修改选中部分…", async () => {
      const text = instruction;
      const result = await request<{ number: number; content: LessonContent }>(
        `/api/lesson-plans/${id}`,
        {
          action: "revise",
          target,
          instruction: text,
          expectedVersion: version,
        },
      );
      await apply(result, `AI 修改：${text}`);
      setMessages((prev) => [
        ...prev,
        { role: "user", text },
        {
          role: "assistant",
          text: `已修改“${content.stages.find((s) => s.id === target)?.name || sectionNames[target as keyof typeof sectionNames]}”，保存为 V${result.number}。请检查改动是否符合课堂需要。`,
        },
      ]);
      setInstruction("");
      toast.success(`局部修改已保存为 V${result.number}`);
    });
  }
  async function restore(v: Version) {
    await operation("正在恢复版本…", async () => {
      const result = await request<{ number: number; content: LessonContent }>(
        `/api/lesson-plans/${id}`,
        { action: "restore", number: v.number, expectedVersion: version },
      );
      await apply(result, `恢复历史版本 V${v.number}`);
      setShowHistory(false);
      setPreview(null);
      toast.success(`已恢复 V${v.number} 的内容，保存为 V${result.number}`);
    });
  }
  async function download() {
    await operation("正在生成 Word…", async () => {
      const response = await fetch(`/api/lesson-plans/${id}/export`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Word 导出失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${info.title}.docx`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.success("Word 文档已下载");
    });
  }
  return (
    <>
      <div className="editor-top">
        <Link href="/lesson-plans" className="back-link">
          <ArrowLeft size={17} />
          教学设计
        </Link>
        <div className="editor-save-state">
          {dirty ? (
            <span className="unsaved-dot">有未保存修改</span>
          ) : (
            <span>
              <Check size={14} />
              已保存
            </span>
          )}
          <span className="badge badge-gray">V{version}</span>
        </div>
        <div className="editor-actions">
          <Link
            className="button button-outline"
            href={`/classroom?lessonPlanId=${encodeURIComponent(id)}`}
          >
            进入课中助教
          </Link>
          <Button
            variant="outline"
            onClick={() => setShowHistory(true)}
            disabled={!!busy}
          >
            <History size={15} />
            历史版本
          </Button>
          <Button
            variant="outline"
            onClick={download}
            disabled={!!busy || dirty}
          >
            <Download size={15} />
            导出 Word
          </Button>
          <Button onClick={save} disabled={!!busy || !dirty}>
            <Save size={15} />
            保存修改
          </Button>
        </div>
      </div>
      {busy ? (
        <div className="generation-status" role="status">
          <Busy label={busy} />
        </div>
      ) : null}
      {error ? (
        <div className="error-message editor-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="editor-layout">
        <div>
          <LessonDocument
            info={info}
            content={content}
            onChange={setContent}
            disabled={!!busy}
            onAITarget={(value) => {
              setTarget(value);
              document.getElementById("ai-instruction")?.focus();
            }}
          />
        </div>
        <aside className="ai-panel">
          <header>
            <span>
              <Sparkles size={19} />
              AI 修改助手
            </span>
            <span className="badge badge-teal">局部修改</span>
          </header>
          <div className="ai-panel-body">
            <p className="ai-intro">保留教案整体思路，只优化你选中的部分。</p>
            <form onSubmit={revise}>
              <label className="field">
                <span>修改范围</span>
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  aria-label="AI 修改范围"
                >
                  {content.stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {Object.entries(sectionNames)
                    .filter(([key]) => key !== "resources")
                    .map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="quick-prompts">
                <span>试着这样修改</span>
                {[
                  "把导入活动改得更有趣",
                  "增加小组讨论与语言支架",
                  "增加具体的同伴互评标准",
                ].map((p, i) => (
                  <button
                    type="button"
                    key={p}
                    disabled={!!busy}
                    onClick={() => {
                      setInstruction(p);
                      setTarget(
                        i === 2
                          ? "assessment"
                          : content.stages[i === 0 ? 0 : 2]?.id || "objectives",
                      );
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>你的修改建议</span>
                <textarea
                  id="ai-instruction"
                  rows={5}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="例如：把这一阶段改为两人合作活动，保留现有时长。"
                  maxLength={2000}
                />
              </label>
              {dirty ? (
                <p className="ai-save-notice">
                  请先保存正文修改，再使用 AI 助手或导出。
                </p>
              ) : null}
              <Button
                type="submit"
                className="full-width"
                disabled={!!busy || dirty || instruction.trim().length < 2}
              >
                <Send size={15} />
                修改选中部分
              </Button>
            </form>
            {messages.length ? (
              <div className="revision-messages" aria-live="polite">
                {messages.map((m, i) => (
                  <div key={i} className={`revision-message ${m.role}`}>
                    <b>{m.role === "user" ? "你的要求" : "修改完成"}</b>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ai-first-message">
                <FileText size={19} />
                <p>
                  修改后自动产生新版本，
                  <br />
                  随时可以查看和恢复。
                </p>
              </div>
            )}
            {mock ? (
              <p className="demo-note">
                当前使用演示模型。修改建议为规则示例，正式教学请核对或配置真实模型。
              </p>
            ) : null}
          </div>
          <footer>
            <h3>本课参考资料</h3>
            {references.length ? (
              references.map((r) => (
                <a
                  key={r.id}
                  href={`/api/documents/${r.id}`}
                  className="reference-link"
                >
                  <FileText size={14} />
                  {r.name}
                </a>
              ))
            ) : (
              <p className="muted">本课未关联参考资料。</p>
            )}
            <Link href={`/reflection?lesson=${id}`} className="text-link">
              <RotateCcw size={14} />
              为这堂课创建复盘
            </Link>
          </footer>
        </aside>
      </div>
      <Dialog
        open={showHistory}
        onOpenChange={setShowHistory}
        title="教学设计历史版本"
        description={`恢复历史内容会生成新版本，已有版本继续保留。${dirty ? "恢复将放弃当前未保存的修改。" : ""}`}
        wide
      >
        <div className="version-layout">
          <div className="version-list">
            {history.map((v) => (
              <button
                key={v.number}
                className={`version-row ${preview?.number === v.number ? "selected" : ""}`}
                onClick={() => setPreview(v)}
              >
                <div>
                  <b>V{v.number}</b>
                  {v.number === version ? (
                    <span className="badge badge-teal">当前版本</span>
                  ) : null}
                </div>
                <p>{v.changeDescription}</p>
                <small>{fullDate(v.createdAt)}</small>
              </button>
            ))}
          </div>
          <div className="version-preview">
            {preview ? (
              <>
                <div className="version-preview-top">
                  <b>V{preview.number} 内容</b>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!busy || preview.number === version}
                    onClick={() => restore(preview)}
                  >
                    <RotateCcw size={14} />
                    恢复此版本
                  </Button>
                </div>
                <div className="version-content">
                  <LessonDocument info={info} content={preview.content} />
                </div>
              </>
            ) : (
              <div className="empty-state">
                <History size={30} />
                <p className="muted">选择一个版本查看完整教案。</p>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
