import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { EmbeddingProvider } from "@/services/ai/types";
// Offline feature hashing is only a deterministic demonstration, not a semantic model.
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly model = "demo-hash-128";
  async embed(texts: string[]) {
    return texts.map((text) => {
      const vector = Array.from({ length: 128 }, () => 0);
      const tokens = text
        .toLowerCase()
        .match(/[a-z]+|[\u4e00-\u9fff]{1,2}/g) || [text];
      for (const token of tokens) {
        const hash = createHash("sha256").update(token).digest();
        vector[hash.readUInt16BE(0) % 128] += 1;
      }
      const norm = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0)) || 1;
      return vector.map((n) => n / norm);
    });
  }
}
export class CompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly model = process.env.EMBEDDING_MODEL || "";
  async embed(texts: string[]) {
    if (
      !process.env.EMBEDDING_BASE_URL ||
      !process.env.EMBEDDING_API_KEY ||
      !this.model
    )
      throw new AppError(
        "Embedding 模型尚未配置，请填写对应服务商的 EMBEDDING_BASE_URL、EMBEDDING_API_KEY 和 EMBEDDING_MODEL。",
        503,
      );
    const configuredDimensions = process.env.EMBEDDING_DIMENSIONS?.trim();
    const dimensions = configuredDimensions
      ? Number(configuredDimensions)
      : undefined;
    if (
      dimensions !== undefined &&
      (!Number.isSafeInteger(dimensions) || dimensions <= 0)
    )
      throw new AppError(
        "EMBEDDING_DIMENSIONS 必须为正整数，或留空使用服务商默认维度。",
        503,
      );
    const response = await fetch(
      `${process.env.EMBEDDING_BASE_URL.replace(/\/$/, "")}/embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
          encoding_format: "float",
          ...(dimensions !== undefined ? { dimensions } : {}),
        }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok)
      throw new AppError(`Embedding 服务不可用（${response.status}）。`, 502);
    const body = await response.json();
    const items: { index: number; embedding: number[] }[] = body.data;
    if (!Array.isArray(items) || items.length !== texts.length)
      throw new AppError("Embedding 返回数量不匹配。", 502);
    const vectors = items
      .sort((a, b) => a.index - b.index)
      .map((i) => i.embedding);
    const dims = vectors[0]?.length;
    if (
      !dims ||
      vectors.some(
        (v) =>
          !Array.isArray(v) ||
          v.length !== dims ||
          v.some((n) => !Number.isFinite(n)) ||
          v.every((n) => n === 0),
      )
    )
      throw new AppError("Embedding 向量无效。", 502);
    if (dimensions !== undefined && dims !== dimensions)
      throw new AppError(
        `Embedding 返回 ${dims} 维，与配置的 ${dimensions} 维不一致，请检查模型与维度配置。`,
        502,
      );
    return vectors;
  }
}
export function getEmbeddingProvider(): EmbeddingProvider {
  return process.env.EMBEDDING_PROVIDER === "mock"
    ? new MockEmbeddingProvider()
    : new CompatibleEmbeddingProvider();
}
