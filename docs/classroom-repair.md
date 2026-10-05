# 课中助教修复与教案模板验收

日期：2026 年 10 月 5 日。沿用现有 Next.js、Prisma、流式聊天、知识库、Tavily 和教案版本架构。

## Root Cause

课程没进入聊天：`Classroom` 页面只加载知识库和聊天会话，聊天请求只传 sessionId、问题、知识库 ID 和联网开关；ChatSession 没有课程绑定字段，classroomStream 从未读取 LessonPlan。课程信息无法在首轮、多轮或刷新后进入模型。

多轮跑成通用写作：原提示词仅要求回答高中写作教学问题，没有当前体裁、主题、目标和教师要求的权威约束。历史只存取 answer 正文，遗漏讲解建议和例句；流式格式失败后重新调用通用 generate，还会丢掉会话历史。模型因而延续通用写作建议。

第三方来源混入：Tavily 收到完整自然语言命令，原实现仅检查 HTTP URL，直接接受引擎前四条结果。没有机构域名限制、可信度排序、学段/学科/文件类型相关性或版本处理。官方域名上的无关文件也会进入引用；本次真实联调发现并补齐了这个问题。

## 修改文件与作用

| 文件 | 修改 |
| --- | --- |
| `prisma/schema.prisma` | ChatSession 增加可空 lessonPlanId、关系和索引，LessonPlan 增加反向关系。 |
| `prisma/migrations/202610050002_classroom_course/migration.sql` | 以增量迁移添加字段、外键和索引；保留旧会话。已应用到本地数据库。 |
| `src/app/(workspace)/classroom/page.tsx` | 按 URL 或会话恢复课程，校验归属；新对话可默认最近课程；不猜测旧会话课程。 |
| `src/components/classroom-chat.tsx` | 每轮传课程 ID；增加课程选择；URL 保存会话；新建清理聊天、知识库和联网状态；切换课程开启新对话；过滤流式及历史回答中的内部术语。 |
| `src/components/shell.tsx` | 从正在打开的教学设计通过侧边导航进入助教时携带课程 ID。 |
| `src/components/lesson-editor.tsx` | 增加当前教学设计直接进入助教的入口。 |
| `src/app/workspace.css` | 增加课程选择区域的自适应样式。 |
| `src/services/ai/course-context.ts` | 每轮构造课程权威事实、教师要求和完整聊天消息；优先使用最新保存教案的目标和分析，对附加流程合理限长。 |
| `src/services/ai/classroom.ts` | 校验用户/会话/课程，读取最新课程；本轮重新检索；保留历史建议和例句；格式修复共用完整消息；隔离不同课程及会话。 |
| `src/prompts/index.ts` | 增加课程优先级、指代解析、邀请信支架、真实来源及内部信息保密规则；教案生成对应模板新增字段。 |
| `src/lib/teacher-language.ts` | 将模型意外输出的内部字段名转换为教师能理解的表达。 |
| `src/services/search/authority.ts` | 通用机构识别、查询精简、域名重写、可信度排序、学段/学科/文件类型筛选、版本优先、去重及四条上限；识别域名边界以阻止伪装主机名。 |
| `src/services/search/provider.ts` | 保留现有 provider 和开关；向 Tavily 传域名限制，并在返回前执行筛选排序。官方查询使用 advanced 检索。 |
| `src/types/lesson.ts` | 课程标准和设计思路字段接受旧版本缺省值。 |
| `src/components/lesson-document.tsx` | 新增课程标准和设计思路的查看/编辑入口；缺省用自然表达提示补充。 |
| `src/services/ai/lesson-plan.ts` | 新字段加入现有局部修改目标列表。 |
| `src/services/export/docx.ts` | 改为填充原模板转换后的 OOXML 包；阶段四列表格、原样式及分区保留；安全转义文字；不再使用原来的通用十节样式。 |
| `src/app/api/lesson-plans/[id]/export/route.ts` | 将当前教师姓名写入模板设计者字段，继续提供 DOCX 下载。 |
| `public/templates/classroom-design-2026.docx` | 原 DOC 转换并整理出的运行时模板，保留字体、页面及表格部件。 |
| `scripts/prepare-export-template.py` | 可重复生成派生模板，记录各原表格槽位并支持跨页表头。 |
| `scripts/verify-classroom.ts` | 真实模型/Tavily 六项回归；仅创建自己的临时用户课程，结束后删除；另支持仅生成导出示例。 |
| `package.json`、`pnpm-lock.yaml` | 将已有 JSZip 从开发依赖移到运行时依赖，未新增大型依赖。 |
| `tests/unit/classroom.test.ts` | 课程读取、最新目标、历史完整性、格式修复、会话隔离、课程归属、官方来源及相关性回归。 |
| `tests/unit/core.test.ts` | 更新模板导出断言，增加包部件保留和 XML/模板形状文字转义验证。 |
| `tests/e2e/workflow.spec.ts` | 增加课程导航、刷新恢复、新建对话、开关重置、切换课程、历史恢复及跨课程拒绝验证。 |
| `docs/template-export.md` | 模板来源、原样式、字段映射、保留要求与版式验收记录。 |
| `docs/classroom-repair.md` | 本修复说明与验证结果。 |

## 当前上下文数据流

课程入口/选择框/历史会话 → lessonPlanId + sessionId → 后端校验当前用户归属 → 每轮读取 LessonPlan 最新 basicInfo、analysis、content → 课程上下文构造 → 系统规则 → 当前课程事实 → 教师要求 → 本轮所选知识库检索 → 本轮联网检索 → 当前会话历史 → 当前问题 → 流式回答/同上下文格式修复 → 保存本会话消息与来源。

课程存储和聊天历史生命周期分开。新对话继续绑定当前课程，但不读取旧会话消息、知识片段或网页。切换课程不复用旧 sessionId；历史入口恢复原绑定。关闭联网时不调用搜索服务，网络来源为零；模型不能把历史链接称为本次核实来源。

## 六项真实回归

使用 `.env` 中现有真实模型和 Tavily 配置，对指定高二文化节邀请信、45 分钟、四项目标和教师补充要求进行验证。未打印密钥，临时记录已清理。

| 测试 | 结果 | 观察 |
| --- | --- | --- |
| TEST 1 当前课程识别 | PASS | 设计 8 分钟邀请信写作与修改，明确对应已有目标 3 和目标 4；使用当前 45 分钟课堂和教师要求。 |
| TEST 2 多轮活动修改 | PASS | 同伴互评压缩为 5 分钟后，第三轮继续提供邀请信相关英语表达与低难度支架。 |
| TEST 3 临场处理 | PASS | 针对遗漏时间地点给出检查表、补写句式和即时互评策略，没有再索要已有课程字段。 |
| TEST 4 联网关闭 | PASS | 没有执行搜索或返回网页；明确无法本次核实官方来源；未暴露内部字段名。 |
| TEST 5 联网开启 | PASS | 返回 2020 修订通知、2017 通知和课程标准目录，全部 moe.gov.cn，三个链接均 HTTP 200；没有 SCIRP、无关政策或旧实验版。 |
| TEST 6 Session Isolation | PASS | 开启联网后另建关闭联网的会话，网页来源为零，无旧链接，只保存本轮两条消息，仍绑定同一课程。 |

真实回答和 URL 状态保存在 `output/repair-qa/classroom-live-results.json`。前期曾出现无关官方文件，已修复并以最终重新运行结果为准；不能把仅域名正确视为完整 PASS。

## 工程检查

| 检查 | 结果 |
| --- | --- |
| ESLint | PASS |
| TypeScript strict typecheck | PASS |
| Vitest | PASS，3 个文件、44 项测试 |
| Playwright | PASS，3 项浏览器/API 工作流 |
| Next.js production build（webpack） | PASS |
| Prisma generate / migrate deploy | PASS |
| Word 版式 | PASS，4 页逐页检查，重复表头和反思填写空间正常 |

完整浏览器工作流使用演示 AI、Embedding 和搜索验证 UI/数据库行为；六项教学回答验收另用真实模型与真实搜索，二者不混淆。已有 Vite 配置将来默认加载方式的提示不影响当前测试。

## 已知限制

旧会话从未保存课程 ID，无法可靠回填其所属课程，因此保留历史并显示未绑定；选择课程后开启新对话。其他环境部署需执行已提交的增量迁移和 Prisma generate。

官方机构域名包含教育部、国务院、人教社、上海市教委，并支持教师明确提供的其他官网域名。尚未维护完整机构目录；未知机构要求官方来源时会保守筛选，必要时可能无结果，不会将第三方冒称官方。

模板的课程标准原文需要有可核实资料或由教师填写；联网返回通知页不等于已获取附件全文。导出支持板书文字与教学资源槽位，尚不自动生成或嵌入独立 PPT 文件。原模板“学号”保持空白。

本机没有 bundled LibreOffice，使用现有 Microsoft Word 完成渲染检查；生产 DOCX 填充不依赖这两种办公软件。Docker 容器构建本次未执行，模板文件已确认进入 Next.js 路由追踪，现有 Docker public 复制路径适用。
