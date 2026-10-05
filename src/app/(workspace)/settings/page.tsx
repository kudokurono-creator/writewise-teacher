import {
  Settings2,
  Cpu,
  Database,
  Globe2,
  FolderOpen,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { pageUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAIConfigured, isMockAI } from "@/services/ai/provider";
import { getEmbeddingProvider } from "@/services/rag/embedding";
import { PageHeading } from "@/components/shared";
import { fullDate } from "@/lib/utils";
export default async function Settings() {
  const user = await pageUser();
  const admin = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .includes(user.email);
  const logs = admin
    ? await db.aIRequestLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];
  const items = [
    {
      name: "AI Provider",
      value: isMockAI() ? "Mock · 演示模型" : "OpenAI compatible",
      icon: Cpu,
    },
    {
      name: "Chat Model",
      value: isMockAI() ? "规则生成示例" : process.env.AI_MODEL || "未配置",
      icon: FileText,
    },
    {
      name: "Embedding Model",
      value: getEmbeddingProvider().model || "未配置",
      icon: Database,
    },
    {
      name: "Search Provider",
      value:
        process.env.SEARCH_PROVIDER === "mock"
          ? "Mock · 未执行真实搜索"
          : process.env.SEARCH_API_KEY?.trim()
            ? "Tavily"
            : "Tavily · 待配置",
      icon: Globe2,
    },
    { name: "文件存储", value: "本地持久存储", icon: FolderOpen },
  ];
  return (
    <>
      <PageHeading title="设置" description="查看当前教学空间与模型配置。" />
      <div className="settings-layout">
        <section className="panel settings-profile">
          <span className="avatar large-avatar">{user.name.slice(0, 1)}</span>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
          <span className="badge badge-teal">
            {admin ? "开发管理员" : "教师账号"}
          </span>
          <div className="profile-security">
            <ShieldCheck size={20} />
            <p>教学设计、知识资料、对话和复盘均与你的账号关联。</p>
          </div>
        </section>
        <div>
          <section className="panel settings-provider">
            <div className="section-header">
              <h2>
                <Settings2 size={19} />
                模型与服务
              </h2>
              <span className="badge badge-gray">
                {isMockAI()
                  ? "演示环境"
                  : isAIConfigured()
                    ? "AI 已配置"
                    : "AI 待配置"}
              </span>
            </div>
            {admin ? (
              items.map((item) => (
                <div className="setting-row" key={item.name}>
                  <span>
                    <item.icon size={17} />
                    {item.name}
                  </span>
                  <b>{item.value}</b>
                </div>
              ))
            ) : (
              <p className="settings-note">
                模型与存储由管理员统一配置，需要更换模型时请联系管理员。
              </p>
            )}
            {isMockAI() ? (
              <div className="settings-note">
                当前为演示模式，可体验完整流程。真实资料分析与语义检索需要管理员配置
                AI 与 Embedding 模型。
              </div>
            ) : !isAIConfigured() ? (
              <div className="settings-note">
                请在项目根目录的 .env 中填写 AI_BASE_URL、AI_API_KEY 和 AI_MODEL。
                知识库检索还需要单独填写 EMBEDDING 配置。
              </div>
            ) : null}
            <div className="settings-note muted">
              密钥只保存在服务端环境变量中，页面不会显示。
            </div>
          </section>
          {admin ? (
            <section className="panel settings-logs">
              <div className="section-header">
                <h2>最近模型请求</h2>
                <span className="muted">仅显示当前账号</span>
              </div>
              {logs.length ? (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>功能</th>
                        <th>模型</th>
                        <th>耗时</th>
                        <th>Tokens 入 / 出</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            {log.feature}
                            <small>{fullDate(log.createdAt)}</small>
                          </td>
                          <td>{log.model}</td>
                          <td>{log.latency} ms</td>
                          <td>
                            {log.inputTokens} / {log.outputTokens}
                          </td>
                          <td>
                            <span
                              className={`badge ${log.status === "SUCCESS" ? "badge-teal" : "badge-red"}`}
                            >
                              {log.status === "SUCCESS" ? "成功" : "失败"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="settings-note muted">
                  生成教学分析或发送课堂问题后，请求信息会显示在这里。
                </p>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
