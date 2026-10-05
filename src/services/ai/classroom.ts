import { z } from "zod";
import { db, json } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { classroomSchema, type ClassroomAnswer } from "@/types/lesson";
import { retrieve } from "@/services/rag/service";
import { getSearchProvider } from "@/services/search/provider";
import { getAIProvider, isMockAI } from "./provider";
import { parseJSON } from "./openai-compatible";
import { buildCourseContext, buildClassroomMessages } from "./course-context";
import { teacherLanguage } from "@/lib/teacher-language";
import { chronologicalClassroomMessages } from "@/lib/classroom-history";
import type { Message } from "./types";
import {
  applyResponsePolicy,
  responsePolicyViolation,
  routeClassroomResponse,
} from "./response-policy";
export const chatInputSchema = z.object({
  sessionId: z.string().optional(),
  lessonPlanId: z.string().min(1).nullable().optional(),
  question: z.string().trim().min(1).max(4000),
  knowledgeBaseIds: z.array(z.string()).max(10),
  webSearch: z.boolean(),
});
export async function classroomStream(
  userId: string,
  input: z.infer<typeof chatInputSchema>,
  emit: (data: unknown) => void,
) {
  const start = Date.now();
  const provider = getAIProvider();
  let status = "SUCCESS";
  try {
    const existing = input.sessionId
      ? await db.chatSession.findFirst({
          where: { id: input.sessionId, userId },
          include: { messages: { orderBy: { createdAt: "desc" }, take: 10 } },
        })
      : null;
    if (input.sessionId && !existing) throw new AppError("对话不存在。", 404);
    // A conversation belongs to one course; switching courses starts a new chat.
    const lessonPlanId =
      input.lessonPlanId === undefined
        ? (existing?.lessonPlanId ?? null)
        : input.lessonPlanId;
    if (existing && existing.lessonPlanId !== lessonPlanId)
      throw new AppError("当前对话属于另一课程，请新建对话后继续。", 409);
    const plan = lessonPlanId
      ? await db.lessonPlan.findFirst({
          where: { id: lessonPlanId, userId },
          select: {
            id: true,
            title: true,
            basicInfo: true,
            analysis: true,
            content: true,
          },
        })
      : null;
    if (lessonPlanId && !plan) throw new AppError("教学设计不存在。", 404);
    const course = plan ? buildCourseContext(plan) : null;
    const route = routeClassroomResponse(input.question);
    const [sources, webSources] = await Promise.all([
      retrieve(
        userId,
        input.knowledgeBaseIds,
        course
          ? `${input.question}\n${course.basicInfo.topic} ${course.basicInfo.lessonType}`
          : input.question,
      ),
      input.webSearch
        ? getSearchProvider().search(input.question)
        : Promise.resolve([]),
    ]);
    emit({ type: "status", text: "正在组织回答…" });
    const session =
      existing ||
      (await db.chatSession.create({
        data: {
          userId,
          title: input.question.slice(0, 60),
          lessonPlanId,
          knowledgeBaseIds: input.knowledgeBaseIds,
          webSearch: input.webSearch,
        },
      }));
    await db.chatSession.update({
      where: { id: session.id },
      data: {
        knowledgeBaseIds: input.knowledgeBaseIds,
        webSearch: input.webSearch,
        updatedAt: new Date(),
      },
    });
    emit({ type: "session", id: session.id });
    const mockAnswer = () => ({
      intent: route.intent ?? "EXPLANATION",
      answer:
        route.intent === "FACT"
          ? `【演示回答】${course ? `当前课程是${course.basicInfo.grade}“${course.basicInfo.title}”，写作主题为“${course.basicInfo.topic}”。` : ""}演示模型不能解答资料中的具体事实，请查看已关联资料或配置真实模型。`
          : `【演示回答】${course ? `当前课程是${course.basicInfo.grade}“${course.basicInfo.title}”，${course.basicInfo.lessonType}，${course.basicInfo.duration}分钟。教学目标：${course.objectives.join("；")}。` : ""}关于“${input.question}”，建议先明确写作任务的读者、目的和主要信息，再引导学生从篇章结构与语言表达两方面分析。${sources.length ? "可在下方查看已关联的参考资料。" : "当前未关联可用的参考资料。"}${route.explainWebStatus && !input.webSearch ? "当前没有启用网络检索，无法提供本次实时核实的官方网页。" : ""}`,
      teachingSuggestion:
        "先出示两份简短片段，让学生比较哪一份更符合交际目的，再邀请学生说明理由。把判断依据转化为三条可观察的写作标准。",
      examples: [
        ...(course &&
        /邀请|invitation|invite/i.test(
          `${course.basicInfo.title} ${course.basicInfo.topic}`,
        )
          ? [
              "I'm writing to invite you to our school cultural festival.",
              "The activity will be held at ... on ...",
              "During the activity, we will ...",
              "I hope you can join us.",
              "Looking forward to your reply.",
            ]
          : ["先明确写作目的、读者和该体裁必须包含的信息，再组织表达。"]),
      ],
    });
    const history = chronologicalClassroomMessages(
      [...(existing?.messages || [])].reverse(),
    ).map((m) => ({
      role: m.role as "user" | "assistant",
      content:
        m.role === "assistant" && m.structured
          ? (() => {
              const answer = classroomSchema.safeParse(m.structured).data;
              return answer
                ? JSON.stringify(answer).slice(0, 12000)
                : m.content.slice(0, 6000);
            })()
          : m.content.slice(0, 6000),
    }));
    const messages: Message[] = buildClassroomMessages({
      course,
      history,
      sources,
      webSources,
      webSearch: input.webSearch,
      question: input.question,
      route,
    });
    messages[0].content += `\n输出匹配 JSON Schema 的对象：${JSON.stringify(z.toJSONSchema(classroomSchema))}`;
    let raw = "";
    if (isMockAI()) {
      const serialized = JSON.stringify(mockAnswer());
      for (let i = 0; i < serialized.length; i += 20) {
        const delta = serialized.slice(i, i + 20);
        raw += delta;
        if (route.intent && route.intent !== "FACT")
          emit({ type: "delta", text: delta });
      }
    } else {
      for await (const delta of provider.streamChat(messages)) {
        raw += delta;
        // Validate short factual answers before displaying unvalidated additions.
        if (route.intent && route.intent !== "FACT")
          emit({ type: "delta", text: delta });
      }
    }
    let answer;
    try {
      answer = classroomSchema.parse(parseJSON(raw));
    } catch {
      emit({ type: "status", text: "正在校验并修复回答格式…" });
      // Repair with exactly the same course, references and session history.
      answer = (
        await provider.generateStructured(
          [
            ...messages,
            { role: "assistant", content: raw.slice(0, 40000) },
            {
              role: "user",
              content:
                "请修复上次回答的格式，返回完整 JSON，保持本节课事实与刚才活动一致。",
            },
          ],
          classroomSchema,
        )
      ).data;
    }
    const violation = responsePolicyViolation(answer, route);
    if (violation) {
      emit({ type: "status", text: "正在精简回答…" });
      answer = (
        await provider.generateStructured(
          [
            ...messages,
            { role: "assistant", content: JSON.stringify(answer) },
            { role: "user", content: violation },
          ],
          classroomSchema,
        )
      ).data;
      if (responsePolicyViolation(answer, route))
        throw new AppError("回答未符合简洁要求，请重试。", 502);
    }
    answer = applyResponsePolicy(answer, route);
    const result: ClassroomAnswer = {
      ...answer,
      answer: teacherLanguage(answer.answer),
      teachingSuggestion: teacherLanguage(answer.teachingSuggestion),
      examples: answer.examples.map(teacherLanguage),
      knowledgeSources: sources,
      webSources,
      ...(route.explainWebStatus &&
      input.webSearch &&
      process.env.SEARCH_PROVIDER === "mock"
        ? {
            searchNotice:
              "联网搜索处于演示模式，未执行真实搜索，也未生成网络来源。",
          }
        : route.explainWebStatus && input.webSearch && !webSources.length
          ? { searchNotice: "本次没有检索到符合要求的可验证网络来源。" }
          : {}),
    };
    const savedAt = Date.now();
    await db.$transaction([
      db.chatMessage.create({
        data: {
          sessionId: session.id,
          role: "user",
          content: input.question,
          createdAt: new Date(savedAt),
        },
      }),
      db.chatMessage.create({
        data: {
          sessionId: session.id,
          role: "assistant",
          content: result.answer,
          structured: json(result),
          createdAt: new Date(savedAt + 1),
        },
      }),
    ]);
    emit({ type: "complete", answer: result });
  } catch (e) {
    status = "FAILED";
    emit({
      type: "error",
      error: e instanceof AppError ? e.message : "回答生成失败，请重试。",
    });
  } finally {
    await db.aIRequestLog.create({
      data: {
        userId,
        feature: "classroom-stream",
        model: provider.model,
        latency: Date.now() - start,
        status,
      },
    });
  }
}
