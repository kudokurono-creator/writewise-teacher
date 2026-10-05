"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  NotebookPen,
  MessagesSquare,
  RotateCcw,
  LibraryBig,
  Files,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  PencilLine,
  ChevronDown,
} from "lucide-react";
import { request } from "@/lib/utils";
import { toast } from "sonner";
const nav = [
  { href: "/dashboard", label: "教学工作台", icon: LayoutDashboard },
  { href: "/prepare", label: "课前备课", icon: NotebookPen },
  { href: "/classroom", label: "课中助教", icon: MessagesSquare },
  { href: "/reflection", label: "课后复盘", icon: RotateCcw },
  { href: "/knowledge", label: "知识库", icon: LibraryBig },
  { href: "/lesson-plans", label: "教学设计", icon: Files },
];
export function Shell({
  user,
  mock,
  aiConfigured,
  children,
}: {
  user: { name: string; email: string };
  mock: boolean;
  aiConfigured: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const current = nav.find((n) => path.startsWith(n.href))?.label || "设置";
  const openedLessonId = path.match(/^\/lesson-plans\/([^/]+)$/)?.[1];
  async function signout() {
    setLeaving(true);
    try {
      await request("/api/auth/logout", {});
      router.push("/login");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "退出失败");
      setLeaving(false);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      {open ? (
        <button
          className="mobile-overlay"
          aria-label="关闭导航"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <Link href="/dashboard" className="brand">
          <span className="brand-mark">
            <PencilLine size={23} />
          </span>
          <span>
            WriteWise<small>英语写作教学助手</small>
          </span>
        </Link>
        <div className="sidebar-caption">我的教学空间</div>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={
                n.href === "/classroom" && openedLessonId
                  ? `/classroom?lessonPlanId=${encodeURIComponent(openedLessonId)}`
                  : n.href
              }
              onClick={() => setOpen(false)}
              className={`nav-item ${path.startsWith(n.href) ? "active" : ""}`}
              aria-current={path.startsWith(n.href) ? "page" : undefined}
            >
              <n.icon size={19} strokeWidth={1.7} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="teaching-note">
            <span className="mini-pencil">
              <PencilLine size={17} />
            </span>
            <b>从构思，到更好的课堂</b>
            <p>用每一次教学反馈，完善下一版教案。</p>
          </div>
          <Link
            href="/settings"
            className={`nav-item ${path === "/settings" ? "active" : ""}`}
          >
            <Settings2 size={19} />
            设置
          </Link>
          <div className="user-card">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <b>{user.name}</b>
              <small>高中英语教师</small>
            </div>
            <button
              onClick={signout}
              disabled={leaving}
              className="icon-button"
              aria-label="退出登录"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <button
              className="mobile-menu icon-button"
              onClick={() => setOpen(!open)}
              aria-label={open ? "收起导航" : "打开导航"}
            >
              {open ? (
                <PanelLeftClose size={20} />
              ) : (
                <PanelLeftOpen size={20} />
              )}
            </button>
            <span>我的教学空间</span>
            <span className="slash">/</span>
            <b>{current}</b>
          </div>
          <div className="topbar-right">
            {mock ? (
              <Link href="/settings" className="demo-tag">
                演示模式
              </Link>
            ) : (
              <Link
                href="/settings"
                className={`badge ${aiConfigured ? "badge-teal" : "badge-gray"}`}
              >
                {aiConfigured ? "AI 已配置" : "AI 待配置"}
              </Link>
            )}
            <span className="topbar-avatar">{user.name.slice(0, 1)}</span>
            <span>{user.name}</span>
            <ChevronDown size={14} />
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
