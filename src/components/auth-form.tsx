"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PencilLine, BookOpen, Check, ShieldCheck } from "lucide-react";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { Busy } from "./shared";
import { request } from "@/lib/utils";
export function AuthForm({
  register = false,
  demo = false,
}: {
  register?: boolean;
  demo?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await request(`/api/auth/${register ? "register" : "login"}`, {
        email: data.get("email"),
        password: data.get("password"),
        ...(register ? { name: data.get("name") } : {}),
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      setBusy(false);
    }
  }
  async function enterDemo() {
    setBusy(true);
    setError("");
    try {
      await request("/api/auth/demo", {});
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "演示入口暂不可用");
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand auth-brand">
          <span className="brand-mark">
            <PencilLine size={24} />
          </span>
          <span>
            WriteWise<small>英语写作教学助手</small>
          </span>
        </div>
        <div className="auth-story-body">
          <p className="auth-kicker">为高中英语教师而设计</p>
          <h1>
            一份好教案，
            <br />
            是一堂好课的开始。
          </h1>
          <p>
            把教学资料、课堂实践与课后思考，
            <br />
            串联成持续改进的写作教学。
          </p>
          <div className="auth-paper">
            <span className="badge badge-teal">应用文写作</span>
            <h3>
              An invitation to
              <br />
              our English festival
            </h3>
            <div className="paper-line" />
            <p>
              <Check size={16} />
              明确真实情境与写作目的
            </p>
            <p>
              <Check size={16} />
              搭建结构与语言支架
            </p>
            <p>
              <Check size={16} />
              用反馈推动下一次修改
            </p>
            <span className="paper-footer">
              <BookOpen size={16} />
              备课 · 教学 · 复盘
            </span>
          </div>
        </div>
        <p className="auth-bottom">让教师专注教学，让每一次写作有迹可循。</p>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <h2>{register ? "创建你的教学空间" : "欢迎回到教学空间"}</h2>
          <p className="muted">
            {register
              ? "整理资料，开始你的第一份教学设计。"
              : "继续备课，和学生一起写得更好。"}
          </p>
          <form onSubmit={submit} className="form-stack">
            {register ? (
              <Field label="教师姓名">
                <input
                  name="name"
                  autoComplete="name"
                  placeholder="怎么称呼你"
                  required
                  maxLength={60}
                />
              </Field>
            ) : null}
            <Field label="邮箱">
              <input
                type="email"
                name="email"
                autoComplete="email"
                placeholder="teacher@example.com"
                required
              />
            </Field>
            <Field
              label="密码"
              hint={
                register ? "至少 8 位，建议包含字母、数字与符号" : undefined
              }
            >
              <input
                type="password"
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="输入密码"
                required
                minLength={8}
                maxLength={128}
              />
            </Field>
            {error ? (
              <div role="alert" className="error-message">
                {error}
              </div>
            ) : null}
            <Button disabled={busy} type="submit" className="full-width">
              {busy ? (
                <Busy label="正在进入…" />
              ) : register ? (
                "创建账号"
              ) : (
                "登录教学空间"
              )}
            </Button>
          </form>
          {demo && !register ? (
            <>
              <div className="auth-divider">
                <span>先看看工作台</span>
              </div>
              <Button
                variant="outline"
                className="full-width"
                disabled={busy}
                onClick={enterDemo}
              >
                进入示例教学空间
              </Button>
              <p className="fineprint">
                示例资料为开发演示数据，不包含真实学生信息。
              </p>
            </>
          ) : null}
          <p className="auth-switch">
            {register ? "已有账号？" : "还没有账号？"}
            <Link href={register ? "/login" : "/register"}>
              {register ? "去登录" : "注册教师账号"}
            </Link>
          </p>
          <div className="auth-privacy">
            <ShieldCheck size={16} />
            你的教案与资料仅在自己的账号中可见
          </div>
        </div>
      </section>
    </div>
  );
}
