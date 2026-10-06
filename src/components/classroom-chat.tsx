"use client";
import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessagesSquare,
  Plus,
  Send,
  BookOpen,
  Globe2,
  Sparkles,
  History,
  X,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { ClassroomAnswer } from "@/types/lesson";
import { partialAnswer } from "@/lib/stream";
import { teacherLanguage } from "@/lib/teacher-language";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Busy, PageHeading } from "./shared";
import { ClassroomAnswerDetails } from "./classroom-answer-details";
type ChatMessage = { role: string; content: string; answer?: ClassroomAnswer };
export function ClassroomChat({
  bases,
  sessions,
  initial,
  mock,
  course,
  lessons,
  lessonOptions = [],
}: {
  bases: { id: string; name: string }[];
  sessions: { id: string; title: string }[];
  initial?: {
    id: string;
    messages: ChatMessage[];
    baseIds: string[];
    webSearch: boolean;
    currentLessonId?: string;
  };
  mock: boolean;
  course: { id: string; title: string } | null;
  lessons: { id: string; title: string }[];
  lessonOptions?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [sessionId, setSessionId] = useState(initial?.id);
  const [selected, setSelected] = useState(initial?.baseIds || []);
  const [webSearch, setWebSearch] = useState(initial?.webSearch || false);
  const [currentLessonId, setCurrentLessonId] = useState(
    initial?.currentLessonId || lessonOptions[0]?.id,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    initial?.messages || [],
  );
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [streaming, setStreaming] = useState("");
  const [remove, setRemove] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const locked = busy || navigating || deleting;
  const visibleSessions = sessions.filter((s) => !deletedIds.includes(s.id));
  const bottom = useRef<HTMLDivElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [messages, streaming, status]);
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const q = question.trim();
    if (!q || locked) return;
    setBusy(true);
    setQuestion("");
    setStatus("正在检索所选资料…");
    setStreaming("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    let raw = "";
    let completed = false;
    try {
      const response = await fetch("/api/classroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          lessonPlanId: course?.id ?? null,
          question: q,
          knowledgeBaseIds: selected,
          webSearch,
          currentLessonId,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "课堂助教暂时不可用");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取回答");
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "session") {
            setSessionId(event.id);
            const params = new URLSearchParams({ session: event.id });
            if (course) params.set("lessonPlanId", course.id);
            window.history.replaceState(null, "", `/classroom?${params}`);
          }
          if (event.type === "status") setStatus(event.text);
          if (event.type === "delta") {
            raw += event.text;
            setStreaming(teacherLanguage(partialAnswer(raw)));
          }
          if (event.type === "complete") {
            completed = true;
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: event.answer.answer,
                answer: event.answer,
              },
            ]);
            setStreaming("");
          }
          if (event.type === "error") throw new Error(event.error);
        }
        if (done) break;
      }
      if (!completed) throw new Error("回答未完整返回，请重新发送。");
      router.refresh();
    } catch (e) {
      const error = e instanceof Error ? e.message : "回答失败";
      toast.error(error);
      setMessages((prev) => [...prev, { role: "error", content: error }]);
      setQuestion(q);
    } finally {
      setBusy(false);
      setStatus("");
      setStreaming("");
      textInput.current?.focus();
    }
  }
  function resetConversation() {
    setMessages([]);
    setSessionId(undefined);
    setQuestion("");
    setSelected([]);
    setWebSearch(false);
    setCurrentLessonId(lessonOptions[0]?.id);
  }
  function newChat() {
    resetConversation();
    startNavigation(() =>
      router.push(
        course
          ? `/classroom?lessonPlanId=${encodeURIComponent(course.id)}`
          : "/classroom",
      ),
    );
  }
  async function deleteConversation() {
    if (!remove || locked) return;
    const target = remove;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/classroom/${encodeURIComponent(target.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "删除对话失败，请重试。");
      }
      setDeletedIds((prev) => [...prev, target.id]);
      setRemove(null);
      if (target.id === sessionId) {
        resetConversation();
        startNavigation(() =>
          router.replace(
            course
              ? `/classroom?lessonPlanId=${encodeURIComponent(course.id)}`
              : "/classroom",
          ),
        );
      } else {
        router.refresh();
      }
      toast.success("对话已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除对话失败，请重试。");
    } finally {
      setDeleting(false);
    }
  }
  return (
    <>
      <PageHeading
        title="课中助教"
        description="带着你的教学资料，随时讨论写作讲解、语言支架与课堂问题。"
        action={
          <Button variant="outline" onClick={newChat} disabled={locked}>
            <Plus size={16} />
            新建对话
          </Button>
        }
      />
      <div className="classroom-course panel">
        <label htmlFor="classroom-course">当前课程</label>
        <select
          id="classroom-course"
          value={course?.id || ""}
          disabled={locked}
          onChange={(e) =>
            startNavigation(() =>
              router.push(
                `/classroom?lessonPlanId=${encodeURIComponent(e.target.value)}`,
              ),
            )
          }
        >
          {!course ? (
            <option value="" disabled>
              请选择教学设计
            </option>
          ) : null}
          {lessons.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.title}
            </option>
          ))}
        </select>
        {lessonOptions.length > 1 ? (
          <label className="field">
            <span>当前课时</span>
            <select
              aria-label="当前课时"
              value={currentLessonId}
              disabled={locked}
              onChange={(e) => setCurrentLessonId(e.target.value)}
            >
              {lessonOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="muted">
          {course
            ? "回答将结合这份教学设计的最新目标、教学流程和教师要求。切换课程会开始新对话。"
            : "选择教学设计后，助教即可结合本节课回答。"}
        </p>
      </div>
      <div className="classroom-layout">
        <section className="classroom-surface">
          <div className="classroom-controls">
            <details className="knowledge-picker">
              <summary>
                <BookOpen size={16} />
                关联知识库
                <span>
                  {selected.length ? `已选 ${selected.length} 个` : "未选择"}
                </span>
                <ChevronDown size={14} />
              </summary>
              <div className="knowledge-dropdown">
                {bases.length ? (
                  bases.map((base) => (
                    <label key={base.id}>
                      <input
                        type="checkbox"
                        disabled={locked}
                        checked={selected.includes(base.id)}
                        onChange={() => toggle(base.id)}
                      />
                      {base.name}
                    </label>
                  ))
                ) : (
                  <Link href="/knowledge" className="text-link">
                    先创建知识库
                  </Link>
                )}
              </div>
            </details>
            <div className="search-switch">
              <Globe2 size={15} />
              <span>联网搜索</span>
              <button
                role="switch"
                aria-label="联网搜索"
                aria-checked={webSearch}
                disabled={locked}
                onClick={() => setWebSearch(!webSearch)}
                className={`switch ${webSearch ? "on" : ""}`}
              >
                <span />
              </button>
            </div>
          </div>
          {selected.length ? (
            <div className="selected-bases">
              {bases
                .filter((b) => selected.includes(b.id))
                .map((b) => (
                  <span key={b.id}>
                    <BookOpen size={12} />
                    {b.name}
                    <button
                      aria-label={`移除${b.name}`}
                      disabled={locked}
                      onClick={() => toggle(b.id)}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
            </div>
          ) : null}
          <div className="chat-messages">
            {!messages.length ? (
              <div className="chat-welcome">
                <span className="chat-welcome-icon">
                  <MessagesSquare size={30} />
                </span>
                <h2>这节写作课，遇到了什么问题？</h2>
                <p>选择知识库，让回答结合你的资料；也可以直接讨论教学问题。</p>
                <div className="question-suggestions">
                  {[
                    "如何帮助学生写出得体的邀请信？",
                    "读后续写如何搭建情节与语言支架？",
                    "怎样设计具体有效的同伴互评？",
                    "如何解释写作中的段落衔接？",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setQuestion(q);
                        textInput.current?.focus();
                      }}
                    >
                      <Sparkles size={15} />
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, i) =>
                message.role === "user" ? (
                  <div className="chat-turn user-turn" key={i}>
                    <span className="chat-avatar user">我</span>
                    <div>{message.content}</div>
                  </div>
                ) : message.role === "error" ? (
                  <div className="error-message" key={i}>
                    {message.content}
                  </div>
                ) : (
                  <div className="chat-turn assistant-turn" key={i}>
                    <span className="chat-avatar assistant">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <p className="answer-text">
                        {teacherLanguage(message.content)}
                      </p>
                      {message.answer ? (
                        <ClassroomAnswerDetails answer={message.answer} />
                      ) : null}
                    </div>
                  </div>
                ),
              )
            )}
            {busy ? (
              <div className="chat-turn assistant-turn">
                <span className="chat-avatar assistant">
                  <Sparkles size={18} />
                </span>
                <div>
                  {streaming ? (
                    <p className="answer-text">{streaming}</p>
                  ) : null}
                  <div className="stream-status" role="status">
                    <Busy label={status} />
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={bottom} />
          </div>
          <form className="chat-composer" onSubmit={send}>
            <textarea
              ref={textInput}
              aria-label="课堂问题"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入你的课堂问题，按 Enter 发送，Shift + Enter 换行"
              maxLength={4000}
              disabled={locked}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div>
              <small>
                {mock
                  ? "演示模型生成示例回答，实际教学请核对。"
                  : "回答结合当前课程与已关联资料，引用可在回答下方查看。"}
              </small>
              <Button
                size="sm"
                type="submit"
                disabled={locked || !question.trim()}
              >
                <Send size={15} />
                发送
              </Button>
            </div>
          </form>
        </section>
        <aside className="chat-history panel">
          <div className="section-header">
            <h2>对话历史</h2>
            <History size={17} className="muted" />
          </div>
          {visibleSessions.length ? (
            visibleSessions.map((s) => (
              <div
                className={`chat-session-row ${sessionId === s.id ? "active" : ""}`}
                key={s.id}
              >
                <Link
                  className={`chat-session-link ${sessionId === s.id ? "active" : ""}`}
                  href={`/classroom?session=${encodeURIComponent(s.id)}`}
                  aria-disabled={locked}
                  onClick={(event) => {
                    if (locked) event.preventDefault();
                  }}
                >
                  <MessagesSquare size={15} />
                  <span>{s.title}</span>
                </Link>
                <button
                  type="button"
                  className="chat-session-delete"
                  aria-label={`删除对话：${s.title}`}
                  title="删除对话"
                  disabled={locked}
                  onClick={() => setRemove(s)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <p className="muted history-empty">
              发送问题后，对话会保存在这里。
            </p>
          )}
          <div className="chat-history-note">
            <BookOpen size={17} />
            <p>引用来源来自实际检索的文档片段。联网搜索来源单独展示。</p>
          </div>
        </aside>
      </div>
      <Dialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open && !deleting) setRemove(null);
        }}
        title="删除这段对话？"
        description={`将删除“${remove?.title || ""}”及其中全部问答，删除后无法恢复。`}
      >
        <div className="dialog-actions">
          <Button
            variant="outline"
            disabled={deleting}
            onClick={() => setRemove(null)}
          >
            保留对话
          </Button>
          <Button
            variant="destructive"
            disabled={locked}
            onClick={deleteConversation}
          >
            {deleting ? "正在删除…" : "删除对话"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
