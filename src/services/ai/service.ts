import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { prompts, buildTeachingContext } from "@/prompts";
import { getAIProvider, isMockAI } from "./provider";
export async function generate<T>(
  userId: string,
  feature: keyof typeof prompts,
  input: unknown,
  schema: z.ZodType<T>,
  mock: () => unknown,
): Promise<T> {
  const provider = getAIProvider();
  const start = Date.now();
  let inputTokens = 0,
    outputTokens = 0,
    status = "SUCCESS";
  try {
    if (isMockAI()) return schema.parse(mock());
    const result = await provider.generateStructured(
      [
        { role: "system", content: prompts[feature] },
        { role: "user", content: buildTeachingContext(input) },
      ],
      schema,
    );
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    return result.data;
  } catch (e) {
    status = "FAILED";
    if (e instanceof AppError) throw e;
    throw new AppError("生成内容未通过校验，请重试。", 502);
  } finally {
    await db.aIRequestLog.create({
      data: {
        userId,
        feature,
        model: provider.model,
        latency: Date.now() - start,
        inputTokens,
        outputTokens,
        status,
      },
    });
  }
}
