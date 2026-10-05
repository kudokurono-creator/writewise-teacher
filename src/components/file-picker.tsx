"use client";
import { useState, useRef } from "react";
import { Upload, Check, LibraryBig, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { request, fileSize, dateLabel } from "@/lib/utils";
import { Button } from "./ui/button";
import { Busy, DocumentIcon, Status } from "./shared";
export type FileRecord = {
  id: string;
  name: string;
  type: string;
  size: number;
  status: string;
  error: string | null;
  createdAt: string;
  knowledgeBase?: { name: string } | null;
};
export function FilePicker({
  initialDocuments = [],
  selected,
  onChange,
  baseId,
  uploadOnly = false,
  onUploaded,
}: {
  initialDocuments?: FileRecord[];
  selected: string[];
  onChange: (ids: string[]) => void;
  baseId?: string;
  uploadOnly?: boolean;
  onUploaded?: () => void;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [drag, setDrag] = useState(false);
  const [tab, setTab] = useState("upload");
  const input = useRef<HTMLInputElement>(null);
  async function upload(files: FileList | File[]) {
    setBusy(true);
    const added: string[] = [];
    for (const file of Array.from(files)) {
      setProgress(`正在解析${baseId ? "并索引" : ""}：${file.name}`);
      try {
        const form = new FormData();
        form.set("file", file);
        if (baseId) form.set("knowledgeBaseId", baseId);
        const result = await request<FileRecord>("/api/documents", form);
        setDocuments((prev) => [result, ...prev]);
        if (result.status === "READY") {
          added.push(result.id);
          toast.success(`${file.name} 已就绪`);
        } else toast.error(result.error || "文件处理失败");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "上传失败");
      }
    }
    if (added.length) onChange([...new Set([...selected, ...added])]);
    setBusy(false);
    setProgress("");
    if (input.current) input.current.value = "";
    onUploaded?.();
  }
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );
  const visible = documents.filter((d) =>
    tab === "knowledge"
      ? !!d.knowledgeBase
      : selected.includes(d.id) || !d.knowledgeBase,
  );
  return (
    <div className="file-picker">
      {!uploadOnly ? (
        <div className="segmented-tabs" aria-label="参考资料方式">
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={tab === "upload" ? "selected" : ""}
          >
            <Upload size={16} />
            上传参考资料
          </button>
          <button
            type="button"
            onClick={() => setTab("knowledge")}
            className={tab === "knowledge" ? "selected" : ""}
          >
            <LibraryBig size={16} />
            从知识库选择
          </button>
        </div>
      ) : null}
      {tab === "upload" ? (
        <>
          <input
            ref={input}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            multiple
            hidden
            aria-label="上传参考文件"
            onChange={(e) => e.target.files && upload(e.target.files)}
          />
          <div
            className={`upload-zone ${drag ? "drag-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) upload(e.dataTransfer.files);
            }}
          >
            <div className="upload-symbol">
              <Upload size={26} />
            </div>
            <h3>{busy ? <Busy label={progress} /> : "上传你的教学参考资料"}</h3>
            <p>拖放文件到这里，或从电脑选择</p>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              选择文件
            </Button>
            <small>PDF、DOCX、TXT、Markdown · 单个文件不超过 15 MB</small>
          </div>
        </>
      ) : (
        <div className="info-message">
          <LibraryBig size={16} />
          选择自己的知识库资料，AI 将参考这些文件进行教学分析。
        </div>
      )}
      {!uploadOnly && visible.length ? (
        <div className="file-selection-list">
          {visible.map((d) => (
            <label
              key={d.id}
              className={`file-select-row ${selected.includes(d.id) ? "is-selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(d.id)}
                disabled={d.status !== "READY" || busy}
                onChange={() => toggle(d.id)}
              />
              <DocumentIcon type={d.type} />
              <span className="file-name">
                <b>{d.name}</b>
                <small>
                  {d.knowledgeBase?.name || "临时参考资料"} · {fileSize(d.size)}{" "}
                  · {dateLabel(d.createdAt)}
                </small>
                {d.error ? (
                  <small className="error-text">{d.error}</small>
                ) : null}
              </span>
              <Status status={d.status} />
            </label>
          ))}
        </div>
      ) : tab === "knowledge" ? (
        <div className="compact-empty">
          <FileText size={22} />
          <p>知识库中还没有可选资料。先在知识库上传文件。</p>
        </div>
      ) : null}
      {!uploadOnly ? (
        <div className="selection-footer">
          <span>
            <Check size={15} />
            已选择 {selected.length} 份资料
          </span>
          {selected.length ? (
            <button
              type="button"
              className="text-link"
              onClick={() => onChange([])}
            >
              <X size={13} />
              清空选择
            </button>
          ) : (
            <small>没有资料也可以继续，学情将标注为待确认。</small>
          )}
        </div>
      ) : null}
    </div>
  );
}
