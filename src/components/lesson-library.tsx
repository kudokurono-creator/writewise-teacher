"use client";
import Link from "next/link";
import { useState } from "react";
import { Search, FileText, Clock3, Plus, NotebookPen } from "lucide-react";
import { getLessonDurations, type BasicInfo } from "@/types/lesson";
import { dateLabel } from "@/lib/utils";
import { Button } from "./ui/button";
import { EmptyState, Status } from "./shared";
export type LessonCard = {
  id: string;
  title: string;
  basicInfo: BasicInfo;
  status: string;
  currentVersion: number;
  updatedAt: string;
  content: boolean;
};
export function LessonLibrary({
  plans,
  prepare = false,
}: {
  plans: LessonCard[];
  prepare?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const visible = plans.filter(
    (p) =>
      (!query ||
        `${p.title} ${p.basicInfo.topic} ${p.basicInfo.className}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "全部" || filter === "草稿"
        ? filter === "全部" || !p.content
        : p.basicInfo.lessonType === filter),
  );
  return (
    <>
      {prepare ? (
        <div className="prepare-intro">
          <div>
            <span className="workflow-icon teal">
              <NotebookPen size={26} />
            </span>
            <h2>把教学思路整理成一堂写作课</h2>
            <p>
              选择班级与教材，明确教学范围和课时，确认分析后生成中英文教案。
            </p>
          </div>
          <Button asChild>
            <Link href="/prepare/new">
              <Plus size={17} />
              新建教学设计
            </Link>
          </Button>
        </div>
      ) : null}
      <div className="library-toolbar">
        <div className="filter-tabs">
          {["全部", "应用文", "读后续写", "议论文", "草稿"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? "selected" : ""}
            >
              {f}
              {f === "全部" ? <span>{plans.length}</span> : null}
            </button>
          ))}
        </div>
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="搜索教学设计"
            placeholder="搜索教学设计或写作主题"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {visible.length ? (
        <div className="lesson-card-grid">
          {visible.map((p) => (
            <Link
              key={p.id}
              href={
                p.content
                  ? `/lesson-plans/${p.id}`
                  : `/prepare/new?draft=${p.id}`
              }
              className="lesson-card"
            >
              <div className="lesson-card-top">
                <span
                  className={`lesson-row-icon ${p.basicInfo.lessonType === "读后续写" ? "blue" : p.basicInfo.lessonType === "议论文" ? "amber" : "teal"}`}
                >
                  <FileText size={25} />
                </span>
                <Status status={p.status} />
              </div>
              <span className="lesson-type-label">
                {p.basicInfo.grade} / {p.basicInfo.lessonType}
              </span>
              <h2>{p.title}</h2>
              <p className="card-topic">{p.basicInfo.topic}</p>
              <div className="card-class">
                {p.basicInfo.textbook}
                <br />
                {p.basicInfo.className || "班级待填写"}
              </div>
              <div className="lesson-card-bottom">
                <span>
                  <Clock3 size={13} />
                  {getLessonDurations(p.basicInfo).join(" + ")} 分钟
                </span>
                <span>
                  {p.currentVersion ? `V${p.currentVersion}` : "草稿"}
                </span>
                <span>{dateLabel(p.updatedAt)} 更新</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            title={
              plans.length ? "没有找到匹配的教学设计" : "开始你的第一份教学设计"
            }
            description={
              plans.length
                ? "试试其他主题词或选择全部类型。"
                : "从课程目标与学生需要出发，让 AI 协助整理教学活动。"
            }
            href={plans.length ? undefined : "/prepare/new"}
            button="新建教学设计"
          />
        </div>
      )}
    </>
  );
}
