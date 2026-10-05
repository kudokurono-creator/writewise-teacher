# 部署说明

## 推荐部署方式

使用单台服务器或容器运行 Next.js Node 服务，连接 PostgreSQL 17 与 pgvector，并挂载上传文件的持久卷。首版不拆分微服务。

```powershell
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

生产环境不运行开发 Seed。通过注册创建教师账号，再用 `ADMIN_EMAILS` 指定允许查看服务配置的管理员邮箱。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| DATABASE_URL | 生产 PostgreSQL URL，敏感凭据只写入环境 |
| APP_URL | 浏览器访问的完整站点 origin，例如 https://writing.school.example |
| AI_PROVIDER | 正式环境使用 openai-compatible，体验使用 mock |
| AI_BASE_URL / AI_API_KEY / AI_MODEL | 模型兼容 API 配置 |
| EMBEDDING_PROVIDER / EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL | Embedding API 配置 |
| SEARCH_PROVIDER / SEARCH_API_KEY | mock 或 tavily |
| STORAGE_PROVIDER / STORAGE_PATH | local 与持久文件目录 |
| ALLOW_DEMO_LOGIN | 生产设置 false；代码在 production 下也会阻止演示入口 |
| ADMIN_EMAILS | 逗号分隔的管理员邮箱，普通用户看不到模型名称配置 |
| MAX_UPLOAD_MB | 文件限制，默认并最多 15 MB，可配置更小值 |

Session 使用随机 256 位 token，数据库只保存其 SHA-256 摘要。生产 cookie 设置 HttpOnly、SameSite=Lax、Secure，站点必须使用 HTTPS。未使用 JWT，因此不需要 NEXTAUTH_SECRET。

## Docker

先根据 `.env.example` 设置 `.env`，将 `APP_URL` 改为部署站点、关闭演示入口并填写模型。根目录提供 Dockerfile 与 compose.yaml。

```powershell
docker compose up -d database
docker compose --profile application up -d --build
```

应用容器启动时运行已提交的数据库迁移；数据库尚未就绪时由健康检查阻止应用启动。应用端口为 3000，通过 Nginx 或其他反向代理提供 HTTPS。上传文件挂载到 Docker volume。不要把 .env 打包到镜像。

`DATABASE_URL` 在 compose 应用服务中指向 `database:5432`；修改数据库用户名或密码时同步修改 compose 的环境配置。示例本地 PostgreSQL 账号仅适用于开发，生产凭据从部署环境设置。

## 备份与恢复

备份 PostgreSQL（例如 pg_dump）和上传文件持久目录，两者需要一起保存。恢复后使用相同 Storage Provider 路径，避免文档元数据存在但原文件丢失。

本地 PGlite 的 `.data/postgres` 仅用于开发，备份时先停掉 `pnpm db:local`。不应将该目录用作多实例生产数据库。

## 扩展限制

当前索引处理在上传请求中同步完成，适用于小规模教师资料。大量 PDF 或高并发时，应引入持久任务队列与 Worker，并扩展统一解析服务；无需改变业务页面。pgvector 当前采用精确检索，固定生产向量维度后可以增加 HNSW 索引。

本地存储的部署需使用单实例或共享文件系统。无状态环境应先实现 S3/R2 等 Storage Provider，而不是让上传文件写入临时目录。
