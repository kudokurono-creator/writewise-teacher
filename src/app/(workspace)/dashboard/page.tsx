import Link from "next/link";
import {
  Plus,
  NotebookPen,
  MessagesSquare,
  RotateCcw,
  Upload,
  BookOpen,
  Clock3,
  FileText,
  ChevronRight,
  LibraryBig,
  CalendarDays,
} from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { basicInfoSchema } from "@/types/lesson";
import { dateLabel } from "@/lib/utils";
import { PageHeading, Status, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
export default async function Dashboard() {
  const user = await pageUser();
  const [plans, bases, reflections, chats, counts] = await Promise.all([
    db.lessonPlan.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 3,
    }),
    db.knowledgeBase.findMany({
      where: { userId: user.id },
      include: { _count: { select: { documents: true } } },
      take: 3,
      orderBy: { createdAt: "desc" },
    }),
    db.reflection.findMany({
      where: { userId: user.id },
      take: 2,
      orderBy: { createdAt: "desc" },
    }),
    db.chatSession.findMany({
      where: { userId: user.id },
      take: 2,
      orderBy: { updatedAt: "desc" },
    }),
    Promise.all([
      db.lessonPlan.count({ where: { userId: user.id } }),
      db.document.count({ where: { userId: user.id } }),
      db.reflection.count({ where: { userId: user.id } }),
    ]),
  ]);
  const latest = plans[0];
  const info = latest ? basicInfoSchema.parse(latest.basicInfo) : null;
  const date = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  return (
    <>
      <PageHeading
        title={`${user.name}，今天准备教些什么？`}
        description="从一份教学设计开始，连接课前、课中与课后的每一步。"
        action={
          <Button asChild>
            <Link href="/prepare/new">
              <Plus size={17} />
              新建教学设计
            </Link>
          </Button>
        }
      />
      <div className="dashboard-date">
        <CalendarDays size={15} />
        {date}
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="continue-card">
            <div className="continue-top">
              <span>
                <NotebookPen size={17} />
                继续你的备课
              </span>
              {latest ? (
                <Status status={latest.status} />
              ) : (
                <span className="badge badge-teal">开始第一课</span>
              )}
            </div>
            <div className="continue-body">
              <div>
                <h2>{info?.title || "把教学想法，变成清晰的课堂安排"}</h2>
                <p className="english-topic">
                  {info?.topic ||
                    "From a teaching idea to a thoughtful lesson."}
                </p>
                <div className="lesson-meta">
                  <span>
                    <BookOpen size={15} />
                    {info
                      ? `${info.grade} / ${info.lessonType}`
                      : "高中英语写作"}
                  </span>
                  <span>
                    <Clock3 size={15} />
                    {info ? `${info.duration} 分钟` : "完整备课流程"}
                  </span>
                </div>
                <Button asChild>
                  <Link
                    href={
                      latest
                        ? latest.content
                          ? `/lesson-plans/${latest.id}`
                          : `/prepare/new?draft=${latest.id}`
                        : "/prepare/new"
                    }
                  >
                    {latest
                      ? latest.content
                        ? "打开教学设计"
                        : "继续编辑草稿"
                      : "开始备课"}
                  </Link>
                </Button>
              </div>
              <div className="lesson-sheet" aria-hidden="true">
                <div className="sheet-heading">
                  Lesson plan<span>{info?.grade || "高中英语"}</span>
                </div>
                <div className="sheet-topic">
                  {info?.topic || "A better writing lesson"}
                </div>
                <p>Teaching objectives</p>
                <div className="sheet-line" />
                <div className="sheet-line short" />
                <p>Teaching procedure</p>
                <div className="sheet-stage">
                  <span>Lead-in</span>
                  <b>5 min</b>
                </div>
                <div className="sheet-stage">
                  <span>Explore & Write</span>
                  <b>30 min</b>
                </div>
                <div className="sheet-stage">
                  <span>Review & Reflect</span>
                  <b>10 min</b>
                </div>
              </div>
            </div>
          </section>
          <section className="workflow-strip" aria-label="教学工作流程">
            <Link href="/prepare">
              <span className="workflow-icon teal">
                <NotebookPen size={22} />
              </span>
              <span>
                <b>课前备课</b>
                <small>资料分析与教学设计</small>
              </span>
            </Link>
            <ChevronRight size={16} className="muted" />
            <Link href="/classroom">
              <span className="workflow-icon blue">
                <MessagesSquare size={22} />
              </span>
              <span>
                <b>课中助教</b>
                <small>讲解建议与写作示例</small>
              </span>
            </Link>
            <ChevronRight size={16} className="muted" />
            <Link href="/reflection">
              <span className="workflow-icon amber">
                <RotateCcw size={22} />
              </span>
              <span>
                <b>课后复盘</b>
                <small>分析反馈与改进教案</small>
              </span>
            </Link>
          </section>
          <section className="panel">
            <div className="section-header">
              <h2>最近教学设计</h2>
              <Link className="text-link" href="/lesson-plans">
                查看全部
                <ChevronRight size={15} />
              </Link>
            </div>
            {plans.length ? (
              <div className="lesson-list">
                {plans.map((plan) => {
                  const basic = basicInfoSchema.parse(plan.basicInfo);
                  return (
                    <Link
                      className="lesson-row"
                      key={plan.id}
                      href={
                        plan.content
                          ? `/lesson-plans/${plan.id}`
                          : `/prepare/new?draft=${plan.id}`
                      }
                    >
                      <div
                        className={`lesson-row-icon ${basic.lessonType === "读后续写" ? "blue" : basic.lessonType === "议论文" ? "amber" : "teal"}`}
                      >
                        <FileText size={23} />
                      </div>
                      <div className="lesson-row-text">
                        <h3>{plan.title}</h3>
                        <p>
                          {basic.grade}
                          <span>·</span>
                          {basic.lessonType}
                          <span>·</span>
                          {basic.className || basic.textbook}
                        </p>
                      </div>
                      <Status status={plan.status} />
                      <span className="row-date">
                        {dateLabel(plan.updatedAt)}
                      </span>
                      <ChevronRight size={17} className="muted" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="还没有教学设计"
                description="填写课程信息，开始第一份写作教案。"
                href="/prepare/new"
                button="新建教学设计"
              />
            )}
          </section>
          <section className="recent-bottom">
            <div className="panel">
              <div className="section-header">
                <h2>最近课堂对话</h2>
                <MessagesSquare size={18} className="muted" />
              </div>
              {chats.length ? (
                chats.map((chat) => (
                  <Link
                    key={chat.id}
                    className="compact-row"
                    href={`/classroom?session=${chat.id}`}
                  >
                    <span>{chat.title}</span>
                    <ChevronRight size={16} />
                  </Link>
                ))
              ) : (
                <div className="compact-empty">
                  <p>课堂上的问题，随时展开讨论。</p>
                  <Link href="/classroom" className="text-link">
                    进入课堂助教
                  </Link>
                </div>
              )}
            </div>
            <div className="panel">
              <div className="section-header">
                <h2>最近教学复盘</h2>
                <RotateCcw size={18} className="muted" />
              </div>
              {reflections.length ? (
                reflections.map((r) => (
                  <Link
                    key={r.id}
                    className="compact-row"
                    href={`/reflection/${r.id}`}
                  >
                    <span>{r.title}</span>
                    <ChevronRight size={16} />
                  </Link>
                ))
              ) : (
                <div className="compact-empty">
                  <p>把课堂观察，转化为下一次改进。</p>
                  <Link href="/reflection" className="text-link">
                    创建教学复盘
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
        <aside className="dashboard-secondary">
          <section className="panel resource-panel">
            <div className="section-header">
              <h2>我的知识库</h2>
              <LibraryBig size={18} className="muted" />
            </div>
            <p className="muted resource-intro">
              让你的教学积累，在备课时派上用场。
            </p>
            {bases.length ? (
              bases.map((base) => (
                <Link
                  href={`/knowledge/${base.id}`}
                  key={base.id}
                  className="resource-row"
                >
                  <span className="resource-icon">
                    <BookOpen size={19} />
                  </span>
                  <div>
                    <b>{base.name}</b>
                    <small>{base._count.documents} 份资料</small>
                  </div>
                  <ChevronRight size={15} />
                </Link>
              ))
            ) : (
              <p className="muted">上传课程、教材或班级学情资料。</p>
            )}
            <Button asChild variant="outline" className="full-width">
              <Link href="/knowledge">
                <Upload size={16} />
                上传知识资料
              </Link>
            </Button>
          </section>
          <section className="workspace-summary">
            <h3>教学积累</h3>
            <div>
              <span>教学设计</span>
              <b>
                {counts[0]} <small>份</small>
              </b>
            </div>
            <div>
              <span>参考资料</span>
              <b>
                {counts[1]} <small>份</small>
              </b>
            </div>
            <div>
              <span>教学复盘</span>
              <b>
                {counts[2]} <small>次</small>
              </b>
            </div>
          </section>
          <section className="checklist-panel">
            <div className="checklist-title">
              <PencilLineIcon />
              备课前，想一想
            </div>
            <p>学生这节课要完成什么？</p>
            <p>什么证据能说明他们学会了？</p>
            <p>哪些支架能帮助他们独立写作？</p>
            <div className="checklist-footer">从学生的学习出发</div>
          </section>
        </aside>
      </div>
    </>
  );
}
function PencilLineIcon() {
  return <NotebookPen size={18} />;
}
