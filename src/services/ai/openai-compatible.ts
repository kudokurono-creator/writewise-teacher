import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { AIProvider, AIResult, Message } from "./types";
export function parseJSON(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}
export class OpenAICompatibleProvider implements AIProvider {
  readonly model = process.env.AI_MODEL || "deepseek-chat";
  private async call(messages: Message[], stream = false, structured = false) {
    const base = process.env.AI_BASE_URL?.replace(/\/$/, "");
    if (!base || !process.env.AI_API_KEY)
      throw new AppError(
        "AI 模型尚未配置，请管理员设置 AI_BASE_URL 和 AI_API_KEY。",
        503,
      );
    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.5,
          stream,
          ...(structured ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(90000),
      });
    } catch {
      throw new AppError("模型连接超时，请重试或检查模型地址。", 502);
    }
    if (!response.ok)
      throw new AppError(
        `模型服务暂时不可用（${response.status}），请检查配置后重试。`,
        502,
      );
    return response;
  }
  async chat(messages: Message[]): Promise<AIResult<string>> {
    const body = await (await this.call(messages)).json();
    const content: unknown = body.choices?.[0]?.message?.content;
    if (typeof content !== "string")
      throw new AppError("模型未返回有效内容，请重试。", 502);
    return {
      data: content,
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    };
  }
  async generateStructured<T>(
    messages: Message[],
    schema: z.ZodType<T>,
  ): Promise<AIResult<T>> {
    const instruction: Message = {
      role: "system",
      content: `输出匹配此 JSON Schema 的 JSON 对象：${JSON.stringify(z.toJSONSchema(schema, { io: "input" }))}`,
    };
    let conversation = [instruction, ...messages];
    let inputTokens = 0,
      outputTokens = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = await (await this.call(conversation, false, true)).json();
      inputTokens += body.usage?.prompt_tokens ?? 0;
      outputTokens += body.usage?.completion_tokens ?? 0;
      const content: unknown = body.choices?.[0]?.message?.content;
      try {
        if (typeof content !== "string") throw new Error("响应为空");
        return {
          data: schema.parse(parseJSON(content)),
          inputTokens,
          outputTokens,
        };
      } catch (error) {
        if (attempt === 1)
          throw new AppError(
            "模型返回格式校验失败，已自动修复一次。请重试。",
            502,
          );
        conversation = [
          ...conversation,
          {
            role: "assistant",
            content:
              typeof content === "string" ? content.slice(0, 40000) : "{}",
          },
          {
            role: "user",
            content: `上一次响应未通过校验。${
              error instanceof z.ZodError
                ? error.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("；")
                    .slice(0, 3000)
                : "JSON 格式无效"
            }。请修复并重新返回完整 JSON 对象。`,
          },
        ];
      }
    }
    throw new AppError("生成失败。", 502);
  }
  async generateCandidate(
    messages: Message[],
    schema: z.ZodType,
  ): Promise<AIResult<unknown>> {
    const instruction: Message = {
      role: "system",
      content: `只输出匹配此 JSON Schema 的 JSON 对象：${JSON.stringify(z.toJSONSchema(schema, { io: "input" }))}`,
    };
    let conversation = [instruction, ...messages],
      inputTokens = 0,
      outputTokens = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = await (await this.call(conversation, false, true)).json();
      const content: unknown = body.choices?.[0]?.message?.content;
      inputTokens += body.usage?.prompt_tokens ?? 0;
      outputTokens += body.usage?.completion_tokens ?? 0;
      if (typeof content !== "string")
        throw new AppError("模型返回为空，请重试。", 502);
      try {
        return { data: parseJSON(content), inputTokens, outputTokens };
      } catch {
        if (attempt === 1)
          throw new AppError(
            "模型返回的 JSON 不完整，自动调整后仍无法读取。请重试；未覆盖已保存内容。",
            502,
          );
        conversation = [
          ...conversation,
          { role: "assistant", content },
          {
            role: "user",
            content:
              "上一次JSON语法不完整。只修复引号、分隔符和缺少的闭合括号，保留所有已有字段、ID、数字和文本，不重新设计，不添加猜测内容；返回可解析JSON，缺失内容稍后按字段补齐。",
          },
        ];
      }
    }
    throw new AppError("模型返回未完成。", 502);
  }
  async *streamChat(messages: Message[]) {
    const response = await this.call(messages, true);
    if (!response.body) throw new AppError("模型未返回流。", 502);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") return;
          if (!payload) continue;
          const delta: unknown =
            JSON.parse(payload).choices?.[0]?.delta?.content;
          if (typeof delta === "string") yield delta;
        }
        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  }
}
