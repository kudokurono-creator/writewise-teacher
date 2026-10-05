# WriteWise 高中英语写作 AI 教学助手

面向高中英语教师的教学工作台。以课前备课、课中助教、课后复盘构成闭环，支持个人知识库、结构化教案、历史版本和真正的 Word 文档导出。

## 已实现功能

- 注册、登录、登出，数据库会话与用户数据隔离。
- 四步备课：课程信息 → 参考资料 → 可修改的教学分析 → 完整教案。
- PDF、DOCX、TXT、Markdown 上传与统一文本解析。
- 教学过程以阶段对象保存，支持逐阶段编辑；校验总课时和唯一阶段 ID。
- AI 修改指定字段或阶段，保留其余教案内容；每次保存、修改或恢复产生新版本。
- Word 导出包含中文字体、标题层级、教学过程表格、重复表头和明确列宽。
- 多知识库，资料切块、Embedding 持久化、pgvector 检索与原文来源。
- 课堂问答支持当前课程上下文、知识库多选、多轮对话和按问题类型控制回答长度；来源按文件合并，可展开引用、查看原文和下载。
- 对话历史可逐条选择删除；删除当前对话后保留当前课程，手机端同样可操作。
- 课后复盘保存当时的教案快照；分析反馈并生成新教案版本。
- 管理员设置页仅显示模型名称与当前账号日志，不向前端提供密钥。
- 首页、列表、编辑器、上传和生成均有加载、空、失败及成功反馈。

默认使用**真实 API 模式**，请在 `.env` 中填写 AI 和 Embedding 配置。未配置时会提示缺少配置，不会自动返回模拟生成结果。开发 Seed 中的示例教案与资料仍明确标注为演示内容；Mock Provider 仅保留用于显式离线测试。

## 技术栈

Next.js 16 App Router、React 19、TypeScript strict、Tailwind CSS 4、shadcn 风格 Button 与 Radix Dialog、Lucide、Sonner、PostgreSQL、Prisma 6、pgvector、Zod 4、docx、mammoth、pdf-parse、Vitest、Playwright。

UI 采用 `frontend-design` 与 `vercel-react-best-practices` 的原则，使用冷白、墨蓝和教学青，围绕教案工作纸与教学工作流组织界面，设计说明见 [docs/design.md](docs/design.md)。

## 目录

```text
src/
  app/                  页面、布局和 Route Handlers
    (workspace)/        受保护的教师工作台
    api/                认证、教案、文件、知识库、对话、复盘
  components/           按业务拆分的界面组件
    ui/                 按钮、表单标签、弹窗
  lib/                  数据库、认证、错误和请求工具
  types/                Zod Schema 与共享业务类型
  repositories/         教案查询与并发安全的版本保存
  prompts/              教学 Prompt 与变量模板工具
  services/
    ai/                 模型接口、兼容 Provider、教学业务服务
    documents/          统一文件校验、解析与处理流程
    storage/            StorageProvider 与本地实现
    rag/                切块、Embedding、VectorStore 和检索
    search/             搜索接口、Mock 与 Tavily
    export/             DOCX 文档生成
prisma/                 正式 Schema、迁移、开发 Seed
scripts/                环境初始化与本地开发数据库
tests/                  单元、API、浏览器验收和文件样本
docs/                   设计、部署与验收说明
```

## 环境要求

- Node.js 22.13+，推荐 Node.js 24。
- pnpm 11（本项目已生成 `pnpm-lock.yaml`）。
- Windows、macOS 或 Linux。
- 本地快速体验无需自行安装 PostgreSQL；生产使用带 pgvector 的 PostgreSQL。

## 本地快速启动

在项目目录安装依赖：

```powershell
pnpm install
```

在终端 A 启动持久化开发数据库，并保持终端运行：

```powershell
pnpm db:local
```

在终端 B 初始化环境和数据库，再启动应用：

```powershell
pnpm setup
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。`setup` 只在 `.env` 不存在时从示例复制，不会覆盖已有配置。数据库保存在 `.data/postgres`，文件保存在 `storage`；重启后保留。

开发示例账号：`demo@writewise.local` / `WriteWise2026!`。也可在登录页点击“进入示例教学空间”，或注册自己的账号。演示入口在生产环境自动关闭；不要在公开生产环境运行开发 Seed。

本地数据库是 PGlite 的 PostgreSQL 运行时加 socket server，监听 `127.0.0.1:5433`。Prisma 本地连接使用 `connection_limit=1&pgbouncer=true&statement_cache_size=0`，以适配多连接复用。该数据库仅用于开发，正式部署使用常规 PostgreSQL。

Windows 下再次执行 `setup` 或 `db:generate` 前，先停止 `pnpm dev`／`pnpm start`，避免正在使用的 Prisma DLL 被系统锁定。无需停止开发数据库。

## 使用已有 PostgreSQL

```env
DATABASE_URL=postgresql://username:password@localhost:5432/writewise
```

数据库需要允许安装 `vector` 扩展；迁移已包含 `CREATE EXTENSION IF NOT EXISTS vector`。初始化命令：

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Schema 包含 User、Session、KnowledgeBase、Document、DocumentChunk、LessonPlan、LessonPlanVersion、LessonPlanReference、ChatSession、ChatMessage、Reflection、ReflectionDocument、AIRequestLog，以及认证限流记录。

## AI 模型配置

在 `.env` 中填写服务端配置，然后重启应用：

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=your-server-only-key
AI_MODEL=your-low-cost-chat-model
```

兼容 Provider 使用 `/chat/completions`，支持 JSON object 与 SSE 流式输出。豆包、DeepSeek、通义等需要使用其兼容 API 的地址、模型标识与账号密钥。业务服务只调用统一 `AIProvider`，新厂商可扩展实现而不修改页面。

教学分析、教案、局部修改和复盘均进行 Zod 校验；结构错误时自动修复一次。教案生成还校验阶段总时长；失败不会写入无效版本。AI 请求日志保存功能、模型、耗时、状态和可用的 token 使用量，不保存密钥或完整 Prompt。流式请求未提供 usage 时 token 显示为 0，不应将其作为实际成本。

## Embedding 与 RAG

```env
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_API_KEY=your-siliconflow-api-key
EMBEDDING_MODEL=Qwen/Qwen3-Embedding-4B
EMBEDDING_DIMENSIONS=2560
```

示例使用硅基流动国内站的托管 API。在 [API 密钥页面](https://cloud.siliconflow.cn/account/ak) 创建该平台的密钥，再填写 `.env`。不同服务商的密钥不能混用。接口及支持的维度见 [官方 Embedding 文档](https://api-docs.siliconflow.cn/docs/api/embeddings-post)。

通过 `/embeddings` 批量生成向量，显式请求 `encoding_format: "float"`。`EMBEDDING_DIMENSIONS` 会作为 `dimensions` 参数发送，返回维度必须与配置一致；使用不支持自定义维度的服务时将该项留空。切块默认约 900 字符，重叠 150 字符，文本和向量只在上传或重新索引时计算。数据库保存 embedding model，检索按用户、知识库、模型和维度过滤，防止混用不同向量空间。更换服务商、模型或维度后，在知识库中重新索引旧资料。

`VectorStore` 默认用 pgvector 的余弦距离做精确检索，适合第一版个人知识库。当前采用数组持久化并在 SQL 中转为 vector；大量文档场景需固定向量维度后增加专用 vector 列与 HNSW 索引。扫描 PDF 未集成 OCR，须先转为含文本的 PDF。

## 文件存储与限制

```env
STORAGE_PROVIDER=local
STORAGE_PATH=./storage
MAX_UPLOAD_MB=15
```

文件通过随机 UUID 存储，按 userId 分目录。校验扩展名、大小以及 PDF／DOCX 文件头，禁止路径穿越。下载接口先验证文件所有权。已被教案或复盘引用的文件不能删除。

`StorageProvider` 包含 `put/read/remove`；未来可实现 S3、R2、OSS 等 Provider。目前仅提供本地实现，配置其他名称会明确报错。生产必须挂载持久磁盘，不能直接部署到不保留本地文件的临时函数环境。

## 联网搜索

```env
SEARCH_PROVIDER=tavily
SEARCH_API_KEY=
```

联网搜索为可选功能，填写 Tavily 密钥后再开启课堂页面的联网搜索开关；未填写时会提示配置缺失，不会生成模拟网络来源。其他搜索厂商可实现 `WebSearchProvider`。知识来源与网络来源分别展示，引用元数据由服务端检索结果构建。

## 测试与构建

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm start
```

浏览器与 API 测试需要开发数据库和独立测试用的 `pnpm dev` 同时运行，默认访问 `http://localhost:3000`。这些离线验收依赖模拟数据，需要在启动测试服务的终端显式设置 `AI_PROVIDER=mock`、`EMBEDDING_PROVIDER=mock`、`SEARCH_PROVIDER=mock`；不要对正在接入真实 API 的服务直接运行这套端到端测试。测试注册临时账号，结束后删除其数据库数据。测试下载和截图位于忽略的 `output` 目录。PDF 测试文件已保存在仓库，无需运行 Python 生成脚本。

部署参见 [docs/deployment.md](docs/deployment.md)，验收范围与限制参见 [docs/verification.md](docs/verification.md)。

## 维护注意

- API 每次操作都验证身份和所有权；页面保护不能代替接口检查。
- 版本保存使用事务与 expectedVersion，防止旧页面覆盖最新教案。
- 复盘保存源教案快照，后续修改教案不会改变当次复盘依据。
- 文件或模型失败保留草稿及错误状态，可重新上传／索引／分析。
- 原目录的 `教案设计模板2026.doc` 保留不变；当前导出填充 `public/templates/classroom-design-2026.docx` 派生模板，保留表格和页面样式，运行时不依赖本机 Word。模板映射见 [docs/template-export.md](docs/template-export.md)。
- 本项目未实现支付、学校组织架构、复杂权限、OCR、语音或真实课堂数据统计。
