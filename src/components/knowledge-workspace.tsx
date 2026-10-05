"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  BookOpen,
  LibraryBig,
  FileText,
  Search,
  Download,
  Trash2,
  RefreshCw,
  Upload,
  ChevronLeft,
  Clock3,
} from "lucide-react";
import { toast } from "sonner";
import { request, fullDate, fileSize } from "@/lib/utils";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { Dialog } from "./ui/dialog";
import { PageHeading, EmptyState, DocumentIcon, Status, Busy } from "./shared";
import { FilePicker, type FileRecord } from "./file-picker";
export type KnowledgeCard = {
  id: string;
  name: string;
  description: string;
  category: string;
  documentCount: number;
  createdAt: string;
};
export function KnowledgeWorkspace({ bases }: { bases: KnowledgeCard[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const base = await request<{ id: string }>("/api/knowledge", {
        name: form.get("name"),
        description: form.get("description"),
        category: form.get("category"),
      });
      toast.success("知识库已创建");
      setOpen(false);
      router.push(`/knowledge/${base.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }
  const visible = bases.filter((b) =>
    `${b.name} ${b.description}`.includes(query),
  );
  return (
    <>
      <PageHeading
        title="我的知识库"
        description="把课程标准、教材与教学经验，整理成随时可用的参考。"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={17} />
            新建知识库
          </Button>
        }
      />
      <div className="knowledge-overview">
        <LibraryBig size={23} />
        <span>
          <b>{bases.length}</b> 个知识库
        </span>
        <div className="vertical-rule" />
        <FileText size={20} />
        <span>
          <b>{bases.reduce((n, b) => n + b.documentCount, 0)}</b> 份教学资料
        </span>
        <label className="search-input">
          <Search size={16} />
          <input
            aria-label="搜索知识库"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索知识库"
          />
        </label>
      </div>
      {visible.length ? (
        <div className="knowledge-grid">
          {visible.map((base, i) => (
            <Link
              key={base.id}
              href={`/knowledge/${base.id}`}
              className="knowledge-card"
            >
              <div className="knowledge-card-top">
                <span
                  className={`knowledge-book ${["teal", "blue", "amber"][i % 3]}`}
                >
                  <BookOpen size={28} />
                </span>
                <span className="badge badge-gray">{base.category}</span>
              </div>
              <h2>{base.name}</h2>
              <p>{base.description || "添加教学资料，建立自己的参考资源。"}</p>
              <div className="knowledge-card-bottom">
                <span>
                  <FileText size={14} />
                  {base.documentCount} 份资料
                </span>
                <span>打开知识库</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title={
              bases.length ? "没有找到这个知识库" : "给教学资料一个清晰的归处"
            }
            description="可以按课程标准、教材单元、班级学情或优秀范例分类。"
          >
            <Button onClick={() => setOpen(true)}>
              <Plus size={16} />
              新建知识库
            </Button>
          </EmptyState>
        </div>
      )}
      <div className="knowledge-footnote">
        <BookOpen size={18} />
        <p>
          上传后自动解析文本、切分并建立检索索引。备课与课堂助教可引用你的资料，回答中会保留原文来源。
        </p>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="新建知识库"
        description="按教学用途分类，方便在备课时找到合适的资料。"
      >
        <form className="form-stack" onSubmit={create}>
          <Field label="知识库名称" required>
            <input
              name="name"
              placeholder="例如：读后续写教学案例"
              minLength={2}
              maxLength={100}
              required
            />
          </Field>
          <Field label="资料分类">
            <select name="category">
              {[
                "教学资料",
                "课程标准",
                "教材资料",
                "写作理论",
                "优秀教案",
                "班级学情",
                "学生作文",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="说明">
            <textarea
              name="description"
              rows={3}
              maxLength={1000}
              placeholder="这份知识库用于什么教学任务？"
            />
          </Field>
          {error ? (
            <div className="error-message" role="alert">
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
            <Button type="submit" disabled={busy}>
              {busy ? <Busy /> : "创建知识库"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
export function KnowledgeDetail({
  base,
  documents,
}: {
  base: KnowledgeCard;
  documents: (FileRecord & { chunkCount: number })[];
}) {
  const router = useRouter();
  const [upload, setUpload] = useState(false);
  const [busy, setBusy] = useState("");
  const [remove, setRemove] = useState<FileRecord | null>(null);
  async function act(id: string, method: string) {
    setBusy(id);
    try {
      await request(`/api/documents/${id}`, {}, method);
      toast.success(
        method === "DELETE" ? "文件已删除" : "资料已重新解析并索引",
      );
      setRemove(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <Link href="/knowledge" className="back-link knowledge-back">
        <ChevronLeft size={16} />
        返回知识库
      </Link>
      <PageHeading
        title={base.name}
        description={base.description}
        action={
          <Button onClick={() => setUpload(true)}>
            <Upload size={17} />
            上传资料
          </Button>
        }
      />
      <div className="base-detail-meta">
        <span className="badge badge-teal">{base.category}</span>
        <span>
          <FileText size={15} />
          {documents.length} 份资料
        </span>
        <span>
          <Clock3 size={15} />
          {documents.reduce((n, d) => n + d.chunkCount, 0)} 个索引片段
        </span>
      </div>
      <div className="panel">
        {documents.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>文档名称</th>
                  <th>状态</th>
                  <th>检索片段</th>
                  <th>上传时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className="document-table-name">
                        <DocumentIcon type={d.type} />
                        <div>
                          <b>{d.name}</b>
                          <small>
                            {fileSize(d.size)}
                            {d.error ? ` · ${d.error}` : ""}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Status status={d.status} />
                    </td>
                    <td>{d.chunkCount}</td>
                    <td>{fullDate(d.createdAt)}</td>
                    <td>
                      <div className="table-actions">
                        <a
                          className="icon-button"
                          href={`/api/documents/${d.id}`}
                          aria-label={`下载${d.name}`}
                        >
                          <Download size={16} />
                        </a>
                        <button
                          className="icon-button"
                          disabled={!!busy}
                          onClick={() => act(d.id, "POST")}
                          aria-label={`重新索引${d.name}`}
                        >
                          {busy === d.id ? (
                            <RefreshCw size={16} className="spin" />
                          ) : (
                            <RefreshCw size={16} />
                          )}
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`删除${d.name}`}
                          disabled={!!busy}
                          onClick={() => setRemove(d)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="上传第一份参考资料"
            description="支持 PDF、DOCX、TXT 和 Markdown。扫描版 PDF 请先进行 OCR。"
          >
            <Button onClick={() => setUpload(true)}>
              <Upload size={17} />
              上传资料
            </Button>
          </EmptyState>
        )}
      </div>
      <div className="info-message knowledge-info">
        资料的检索索引会持续保留。切换 Embedding
        模型后，使用“重新索引”更新旧资料。
      </div>
      <Dialog
        open={upload}
        onOpenChange={setUpload}
        title={`上传到${base.name}`}
        description="上传后自动提取文本并创建知识索引。"
      >
        <FilePicker
          baseId={base.id}
          selected={[]}
          onChange={() => undefined}
          uploadOnly
          onUploaded={() => router.refresh()}
        />
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setUpload(false)}>
            完成
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={(value) => !value && setRemove(null)}
        title="删除这份资料？"
        description={`将删除“${remove?.name}”及其检索索引。已被教案或复盘引用的资料不能删除。`}
      >
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => setRemove(null)}>
            保留资料
          </Button>
          <Button
            variant="destructive"
            disabled={!!busy}
            onClick={() => remove && act(remove.id, "DELETE")}
          >
            删除资料
          </Button>
        </div>
      </Dialog>
    </>
  );
}
