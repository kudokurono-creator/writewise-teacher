# 教学设计改版实现与验收

本轮沿用现有 Next.js、Prisma、AI Provider、文件解析、班级档案、版本保存与界面配色。教学设计改成六步流程，资料用途进入后端，中文和英文从一个 canonical 结构生成；页面与 Word 的教学过程采用两列。

## 1 与 2 修改文件和主要内容

| 文件                                                                                                | 本轮主要变化                                                                                               |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/types/lesson.ts`                                                                               | 可留空的元信息；分课时分析；显式目标记录；课堂操作、资料绑定、计时作业、结构化板书；旧字段仍可读取         |
| `src/types/canonical.ts`                                                                            | canonical 树与语言字典、资料角色、进度类型                                                                 |
| `src/lib/canonical-plan.ts`                                                                         | 生成共享结构、文本去重、语言渲染、目标文本视图、校验缓存视图                                               |
| `prisma/schema.prisma`                                                                              | 草稿步骤、分析确认、分析对话、资料用途字段                                                                 |
| `prisma/migrations/202610060002_canonical_design/migration.sql`                                     | 增量添加字段，为旧草稿设置恢复步骤，旧资料默认为 reference/other                                           |
| `src/services/documents/selection.ts`                                                               | 资料所有权与重复角色校验                                                                                   |
| `src/services/ai/material-context.ts`                                                               | 教材与参考资料分别构造上下文，班级文件标为学情，只有教材进行 Unit 摘录；限制各类资料总上下文长度并记录截断 |
| `src/services/ai/class-profile.ts`                                                                  | 解析班级档案及快照，保存实际授课范围与参考范围的默认值，避免仅在界面显示却未保存                           |
| `src/services/ai/lesson-plan.ts`                                                                    | 分课时分析、元信息识别、限定课时的多轮对话、生成进度、局部修改及目标视图同步                               |
| `src/services/ai/design-generation.ts`                                                              | 先生成课时结构，再逐阶段补充具体活动；派生目标文本与师生摘要；硬校验和限定字段修复                         |
| `src/services/ai/design-validation.ts`                                                              | 可定位的硬错误、非阻塞软建议、时间/目标/资源/输入/范围绑定校验、安全补丁应用                               |
| `src/services/ai/bilingual.ts`                                                                      | 模型只翻译文本 ID 列表；从共享结构渲染双语，复用未改动译文；清理教学正文中泄漏的内部字段名称               |
| `src/services/ai/openai-compatible.ts`、`types.ts`                                                  | 保留可解析原始候选给业务校验；JSON 语法修复一次；兼容原有 Structured Output 接口                           |
| `src/services/ai/mock.ts`                                                                           | 完整结构演示、独立课时目标、操作、作业和板书；任意文本翻译保留原文并明确标记                               |
| `src/prompts/index.ts`                                                                              | 资料优先级、实际范围、课时递进、细操作、受控翻译、定点修复、分析对话约束                                   |
| `src/repositories/lesson.ts`                                                                        | canonical 与缓存视图一致性、保存硬校验、重算软建议、版本冲突、生成状态及标题同步                           |
| `src/app/api/lesson-plans/route.ts`                                                                 | 可保存文件先行草稿与资料角色，兼容旧 documentIds                                                           |
| `src/app/api/lesson-plans/[id]/route.ts`                                                            | 保存步骤和确认、资料角色更新、分析对话、真实生成进度流、保存/翻译/恢复                                     |
| `src/app/(workspace)/prepare/new/page.tsx`                                                          | 恢复步骤、角色、分析与对话                                                                                 |
| `src/components/prepare-wizard.tsx`                                                                 | 六步、教材/参考分区、可选元信息、课时分析 Tab、共同分析默认折叠、对话与进度                                |
| `src/components/file-picker.tsx`                                                                    | 复用上传/知识库选择，按教材/参考显示名称，统一“本次上传”；新上传的文件可在两类角色之间重新选择             |
| `src/components/lesson-document.tsx`                                                                | 动态课时 Tab、两列 Step/Activity/操作、问题与预期回应、材料链接、检查清单、逐课时板书、标题编辑            |
| `src/components/lesson-editor.tsx`                                                                  | 从 canonical 读取英文视图，保留中文编辑及两种 Word 下载，文件名同步标题                                    |
| `src/app/workspace.css`                                                                             | 沿用原色彩和间距，增加资料区域、Tab、两列表格及移动端样式                                                  |
| `src/services/export/docx.ts`                                                                       | 保留模板其他部分，将教学过程替换成有重复表头的两列表格，输出全部课时、操作、作业、板书与衔接               |
| `src/services/ai/reflection.ts`                                                                     | 复盘优化针对选定阶段，保留结构并重新同步 canonical 和英文                                                  |
| `tests/unit/canonical-design.test.ts`、`course-design.test.ts`、`core.test.ts`、`classroom.test.ts` | 新结构、旧数据、硬/软校验、限定修复、双语结构与 Word、原有问答回归                                         |
| `tests/e2e/course-design.spec.ts`、`workflow.spec.ts`                                               | 新流程、角色、Tab、第二课时对话、草稿恢复、生成/下载与教学闭环                                             |

原有班级档案和课中当前课时功能继续使用。之前的本机登录来源修复保留，本轮未扩大生产环境的来源信任范围。

工作区还保留本次连续任务前面已实现的文件，未撤销这些功能：

| 文件                                                                             | 保留的修改内容                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `prisma/migrations/202610060001_course_design/migration.sql`                     | 班级档案、教案班级快照和课堂当前课时字段的增量迁移                        |
| `src/app/api/class-profiles/route.ts`、`src/components/class-profile-picker.tsx` | 班级档案创建、选择和所有权检查                                            |
| `src/app/(workspace)/classroom/page.tsx`、`src/components/classroom-chat.tsx`    | 选择已保存课程及当前课时，课堂问答绑定当前设计                            |
| `src/services/ai/course-context.ts`、`classroom.ts`                              | 每次问答读取当前保存版本和课时活动、产出与衔接                            |
| `src/components/reflection-workspace.tsx`                                        | 按课时输入反馈并显示复盘结果                                              |
| `src/components/lesson-library.tsx`                                              | 单/双课时和时长摘要                                                       |
| `src/app/api/lesson-plans/[id]/export/route.ts`                                  | Word 默认使用英文版，按语言输出对应文件名                                 |
| `src/lib/errors.ts`                                                              | 开发环境允许同协议、同端口的 localhost/127.0.0.1 回环别名，外部来源仍拒绝 |
| `tests/unit/request-origin.test.ts`、`tests/e2e/auth-origin.spec.ts`             | 登录、注册请求来源及外部来源拒绝回归                                      |
| `next-env.d.ts`                                                                  | Next.js 开发/构建自动更新类型引用，无业务逻辑修改                         |
| `docs/course-design-upgrade.md`                                                  | 本实现说明、逐文件清单、验证记录和部署要求                                |

## 3 新流程

选择班级 → 教材与资料 → 教学范围 → 教学模式 → AI 分析与确认 → 生成教案。

前四步保存当前进度。教材版本和 Unit 可留空；新流程至少选择一份教材并指定实际页码/板块。AI 识别题目、主题、体裁和目标，未知教材版本/Unit 标为未指定。第五步先说明课时安排理由，再按课时确认分析，通过多轮对话补充偏好。确认后生成和保存双语内容。最终题目可在正文编辑。

## 4 Canonical 数据结构

```json
{
  "version": 2,
  "structure": {
    "goals": [{ "id": "O1", "text": { "textId": "plan/goals/0/text" } }],
    "lessons": [
      {
        "id": "lesson-1",
        "lessonNumber": 1,
        "duration": 45,
        "title": { "textId": "plan/lessons/0/title" },
        "objectiveIds": ["O1"],
        "stages": [
          {
            "id": "S1",
            "duration": 4,
            "kind": "teaching",
            "activities": [
              {
                "id": "S1-activity-1",
                "duration": 4,
                "objectiveIds": ["O1"],
                "operations": [
                  {
                    "actor": "students",
                    "grouping": "pair",
                    "instruction": { "textId": "operation-text" }
                  }
                ],
                "resourceIds": ["worksheet"],
                "inputFromActivityIds": []
              }
            ]
          }
        ]
      }
    ]
  },
  "locales": {
    "zh": { "operation-text": "两人核对教材依据并记录理由。" },
    "en": {
      "operation-text": "Compare the textbook evidence with a partner and record the reasons."
    }
  }
}
```

以上为局部示意，真实结构还包含各课时重难点、产出、评价、作业、板书、问题、预期回答、支架、清单和材料。数字、顺序、ID、关联、活动与操作数量由唯一 structure 持有；文字使用 textId。相同原文共享文本项。goals 是目标文本的唯一清单，课时通过 objectiveIds 关联，旧 objectives 数组作为对应视图派生。

数据库 content 仍保留原字段和 english，供旧界面/历史版本兼容。这些是 canonical 的缓存视图，不是模型独立生成的另一份方案。保存时检查视图一致性。Word 和英文页面读取 canonical。中文手动编辑是待保存视图，保存时重建 canonical 并同步文字。lessons Schema 最多 12 项；当前创建 UI 仍提供单/双课时。

## 5 校验与修复

硬错误包括字段缺失/类型错误、课时数量/序号/配置时长、每课时 Step 总时长、明显不一致的活动时间、重复 ID、不存在或不属于该课时的目标、错误材料引用、未来/不存在的活动输入、缺少计时作业和双课时衔接，以及将参考资料或参考范围绑定为直接教学对象。

每项错误具有 code、path、lessonNumber、stageId、activityId、field、expected、actual、message、repairPaths。开发日志输出完整定位；用户看到具体原因和自动调整进度。

业务修复最多两轮，只允许 issues.repairPaths 指定字段。时间问题只允许相关时长数字，引用问题只允许对应关联字段；已有 ID 和正确课时内容保留。模型收到目标 JSON Schema，避免缺失对象时不知道应补哪些字段。拒绝越界、危险键和非法路径。JSON 语法失败最多额外调整一次，保持已有内容。最终仍不通过则不保存新教案。

每课时 Step 总时长严格相等；活动合计允许 1 分钟组织转换差异，产生软建议，超过则硬错误。软建议覆盖较长活动、简单评价/证据、空泛目标、未覆盖目标和不明确衔接；这些规则是提示，不能证明教学质量，也不会阻止查看和导出。

## 6 双语一致性

翻译接口仅接收 `{id,text}`，返回同数量、同顺序、同 ID 的译文列表，不接收或返回另一份教案结构。模型不能修改课时、Step、Activity、时长、关联或清单数量。每批最多 36 条，最多三批并发；同原文及未修改译文复用。两种语言从同一结构渲染。结构一致由程序保证，译文措辞与教材事实仍应由教师复核。

生成或修改后，若教学文字出现 documentId、sourceType、coverage、previousOutput、teachingScope 等内部字段名称，先仅对相关文本项改成教师能读懂的资料来源或活动衔接说明，再进行翻译。资料角色、范围标记与真实 ID 仍保存在结构中。真实模型验收课程已检查这些字段名称不再出现在教学文字中。

## 7 资料角色与范围

每个 LessonPlanReference 保存 sourceType=textbook/reference；参考资料保存 student_profile、curriculum_standard、teaching_case、exercise、teacher_material、other。上传和知识库只是来源方式，用途单独保存。所有文件校验所有权；重复选择同一文档的不同角色会被拒绝。

教材决定内容，teachingScope 限定直接授课，学情决定支持方式，标准约束目标，案例只参考方法，练习用于练习/评价。sourceBindings 保留文档 ID、teaching/reference 范围和 direct/background/practice 用途；参考案例不能绑定为 direct。只有教材做 Unit 截取，参考资料不会错误套用教材页码裁剪。截断和未知事实在上下文中明确标记。

语义层面的范围和引文准确性由 Prompt 与教师确认共同约束；结构校验不能独立核实未提供的教材原文。大教材摘录依赖可识别的文本标记，扫描件仍受现有解析能力限制。

## 8 双课时 Tab 与局部对话

分析和最终教案均由 lessons 数组生成 Tab，每次只呈现一个课时，共同分析默认折叠且只保存一份。单页切换，无需课时专用路由。多轮对话保存到课程，限定选定课时的 id/序号/时长；服务端替换该项，保留其他课时和共同分析，必要时更新整体承接说明。对话随草稿恢复。

## 9 详细教学过程

层级为 Step → Activity → 编号 operations。每个操作说明师生、独立/两人/小组/全班方式及实际任务；配套问题、预期回应、追问、材料、可用支架、产出、反馈、过渡。右列呈现具体 Teaching Aim、目标关联、证据、检查清单和分层支持。resourceIds 关联实际任务单/评价工具，inputFromActivityIds 追踪此前产出。双课时后一课时从前一课时产出开始。

写作链由教材和确认分析决定，不强制套用固定模板。Homework 单独计时并计入课时，每课时都有分区板书。保留原 Word 模板的基本信息和分析部分，教学过程更换为两列、自动行高、可跨页行和重复表头，完整导出各课时。

## 10 验证记录

- lint、typecheck、test、build 对应现有 package.json 脚本，使用项目安装的 CLI 执行；Windows 环境 npm 未在 PATH。
- 最后一轮 lint、typecheck、test、build 均通过。单元测试为 8 个测试文件、118 项通过，覆盖 14 个要求对应的结构/逻辑场景、旧教案、目标/时间限定修复、最多两轮、越界拒绝、软建议不阻塞，以及两列 Word XML 和中英文共享结构。Vite 提示配置文件未来加载方式变化，当前测试执行成功。
- 浏览器定向测试 `file-first drafts distinguish uploaded textbook from knowledge-base profile and standards` 通过：不填版本/Unit 可保存草稿，教材本次上传、学情及标准来自知识库，角色分别保存，新上传的参考文件可重新选为教材。
- 真实 Provider 已完成六步分析、仅修改第二课时的对话、草稿恢复、双课时生成和中英文下载。该次完整测试在后续课堂问答处因不合理的“必须包含 45 分钟”断言失败；问题问的是第一课时产出，已将断言改为对应产出，不将该次整条测试记为通过。
- 后续定向测试 `saved real-provider design keeps the selected lesson across languages and completes reflection` 通过：复用独立验收库中真实生成的教案，验证第二课时切换中英文后仍被选中、两种 Word 下载、标题保存、课中问答、课后复盘及优化后的版本保存。未宣称全部 E2E 测试套件通过。
- 真实双课时样例为 40 + 45 分钟，各有 4 个 Step 和 4 个 Activity；每课时合计与配置分别一致，第二课时使用第一课时的分析表和比较表。45 + 45 及单课时 45 分钟另有单元测试。
- 主数据库应用增量迁移，浏览器验收使用 5434 端口独立数据库与 3100 端口服务。生产测试使用 localhost；主站开发地址继续为 127.0.0.1:3000。
- 双语 Word 使用真实模型最终保存版本导出。由于依赖包中未提供 soffice.exe，已改用本机 Word 只读导出 PDF，再使用 bundled Python 渲染并逐页检查 65 张最终页面：英文 35 页、中文 30 页，无空白页、裁切、文字重叠或表格溢出；跨页表头和逐课时板书正常。保留模板的反思区域及其预留空间。
- 主站浏览器重新打开备课页，确认六步导航与既有界面风格正常；前后端在 3000 端口，主数据库在 5433 端口继续运行。

## 11 当前边界

未新增图片 OCR、独立 PPTX 或图片式板书。课件、图片/视频资源可以保存文本建议。语义准确性与译文需要教师审核；mock 不伪造任意中文的完整英文翻译，而是保留原文并标记待翻译。生成是多次真实模型调用，所需时间取决于模型速度与教材长度。

资料范围的结构绑定已校验，但不能用结构校验证明模型每句话的教材依据或语义准确性。当前完整导出保留细操作、支架、评价工具和材料，详细双课时 Word 可能较长；真实验收样例为英文 35 页、中文 30 页。当前创建入口提供单/双课时，尚未开放三课时的配置 UI。

## 12 数据库操作

本机已执行 `202610060002_canonical_design` migration，并重新生成 Prisma Client。无需 reset，已有用户、知识库、教案和版本保留。

其他环境部署先执行现有 `db:migrate` 与 `db:generate` 脚本（分别为 prisma migrate deploy 和 prisma generate）。旧 JSON 不要求批量重写；旧教案继续按 stages 读取、编辑、翻译和导出，旧资料默认 reference/other，需要在备课中明确哪些是教材。
