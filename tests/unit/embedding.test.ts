import { afterEach, describe, expect, it, vi } from "vitest";
import { CompatibleEmbeddingProvider } from "@/services/rag/embedding";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function setup(dimensions: string) {
  vi.stubEnv("EMBEDDING_BASE_URL", "https://embedding.test/v1");
  vi.stubEnv("EMBEDDING_API_KEY", "test-key");
  vi.stubEnv("EMBEDDING_MODEL", "Qwen/Qwen3-Embedding-4B");
  vi.stubEnv("EMBEDDING_DIMENSIONS", dimensions);
  return new CompatibleEmbeddingProvider();
}

describe("hosted embedding contract", () => {
  it("requests 2560 float dimensions and restores the input order", async () => {
    const provider = setup("2560");
    const first = Array.from({ length: 2560 }, (_, i) => (i === 0 ? 1 : 0));
    const second = Array.from({ length: 2560 }, (_, i) => (i === 1 ? 1 : 0));
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          { index: 1, embedding: second },
          { index: 0, embedding: first },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await provider.embed(["first", "second"]);
    expect(result).toEqual([first, second]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://embedding.test/v1/embeddings");
    expect(JSON.parse(init.body)).toMatchObject({
      dimensions: 2560,
      encoding_format: "float",
    });
  });

  it("omits dimensions when the provider should use its default", async () => {
    const provider = setup("");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ index: 0, embedding: [0.6, 0.8] }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider.embed(["example"])).resolves.toEqual([[0.6, 0.8]]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty(
      "dimensions",
    );
  });

  it("rejects an unexpected dimension instead of mixing vector spaces", async () => {
    const provider = setup("2560");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          data: [{ index: 0, embedding: [0.6, 0.8] }],
        }),
      ),
    );
    await expect(provider.embed(["example"])).rejects.toThrow(
      "与配置的 2560 维不一致",
    );
  });

  it.each(["0", "-1", "1.5", "NaN"])(
    "rejects invalid dimensions %s before calling the API",
    async (dimensions) => {
      const provider = setup(dimensions);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(provider.embed(["example"])).rejects.toThrow("必须为正整数");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("does not send a request before the new platform key is supplied", async () => {
    const provider = setup("2560");
    vi.stubEnv("EMBEDDING_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider.embed(["example"])).rejects.toThrow("对应服务商");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
