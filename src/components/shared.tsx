import Link from "next/link";
import { BookOpen, Plus, FileText, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import type { ReactNode } from "react";
export function PageHeading({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <div className="breadcrumb">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  href,
  button,
  children,
}: {
  title: string;
  description: string;
  href?: string;
  button?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <BookOpen size={26} />
      </div>
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {href ? (
        <Button asChild>
          <Link href={href}>
            <Plus size={16} />
            {button}
          </Link>
        </Button>
      ) : (
        children
      )}
    </div>
  );
}
export function Status({ status }: { status: string }) {
  const label: Record<string, string> = {
    READY: "已完成",
    DRAFT: "草稿",
    ANALYZED: "待生成",
    FAILED: "处理失败",
    PENDING: "等待处理",
    PARSING: "正在解析",
    INDEXING: "正在索引",
  };
  return (
    <span
      className={`badge ${status === "READY" ? "badge-teal" : status === "FAILED" ? "badge-red" : "badge-gray"}`}
    >
      {label[status] || status}
    </span>
  );
}
export function DocumentIcon({ type = "docx" }: { type?: string }) {
  return (
    <span className={`file-icon file-${type}`}>
      <FileText size={20} />
      <small>{type.toUpperCase()}</small>
    </span>
  );
}
export function Busy({ label = "正在处理…" }: { label?: string }) {
  return (
    <span className="busy">
      <LoaderCircle size={16} className="spin" />
      {label}
    </span>
  );
}
