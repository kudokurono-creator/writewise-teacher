// Run locally with: node --env-file=.env scripts/check-api-config.mjs
// Prints only health metadata; never prints credentials or embedding values.
import { mkdir, writeFile } from "node:fs/promises";

const secrets = ["AI_API_KEY", "EMBEDDING_API_KEY", "SEARCH_API_KEY"]
  .map((name) => process.env[name])
  .filter(Boolean);
function safeMessage(value) {
  let text = String(value || "Unknown error");
  for (const secret of secrets) text = text.replaceAll(secret, "[REDACTED]");
  return text.slice(0, 300);
}
async function check(name, url, init, inspect) {
  const only = process.argv
    .find((argument) => argument.startsWith("--only="))
    ?.slice(7)
    .split(",");
  if (only && !only.includes(name)) return { name, ok: true, skipped: true };
  const start = Date.now();
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(45000),
    });
    const body = await response.json();
    const result = response.ok
      ? {
          name,
          status: response.status,
          ...inspect(body),
          elapsedMs: Date.now() - start,
        }
      : {
          name,
          ok: false,
          status: response.status,
          error: safeMessage(
            body.error?.message ||
              body.error ||
              body.message ||
              body.Message ||
              body.detail ||
              JSON.stringify(body),
          ),
        };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    const result = {
      name,
      ok: false,
      error: safeMessage(error.message),
      elapsedMs: Date.now() - start,
    };
    console.log(JSON.stringify(result));
    return result;
  }
}
const aiBase = process.env.AI_BASE_URL?.replace(/\/$/, "");
const embeddingBase = process.env.EMBEDDING_BASE_URL?.replace(/\/$/, "");
const post = (key, body) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify(body),
});
const results = await Promise.all([
  ...(process.argv.includes("--embedding-models")
    ? [
        check(
          "embedding-models",
          `${embeddingBase}/models`,
          {
            headers: {
              Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`,
            },
          },
          (body) => ({
            ok: Array.isArray(body.data),
            models: body.data
              ?.filter((model) => /embedding/i.test(model.id))
              .map((model) => model.id),
          }),
        ),
      ]
    : []),
  check(
    "ai-models",
    `${aiBase}/models`,
    { headers: { Authorization: `Bearer ${process.env.AI_API_KEY}` } },
    (body) => ({
      ok: Array.isArray(body.data),
      models: body.data?.map((model) => model.id),
      configuredModelFound: body.data?.some(
        (model) => model.id === process.env.AI_MODEL,
      ),
    }),
  ),
  check(
    "ai-json",
    `${aiBase}/chat/completions`,
    post(process.env.AI_API_KEY, {
      model: process.env.AI_MODEL,
      messages: [
        {
          role: "user",
          content:
            'Return only this JSON object: {"ok":true}. This is a connection check.',
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 128,
      stream: false,
    }),
    (body) => {
      const content = body.choices?.[0]?.message?.content;
      let validJSON = false;
      try {
        validJSON = JSON.parse(content).ok === true;
      } catch {}
      return {
        ok: validJSON,
        model: body.model,
        hasContent: typeof content === "string" && content.length > 0,
        validJSON,
        usage: body.usage,
      };
    },
  ),
  check(
    "embedding",
    `${embeddingBase}/embeddings`,
    post(process.env.EMBEDDING_API_KEY, {
      model: process.env.EMBEDDING_MODEL,
      input: [
        "Teach students to write an invitation letter.",
        "邀请信应说明活动时间、地点和邀请目的。",
      ],
      encoding_format: "float",
      ...(process.env.EMBEDDING_DIMENSIONS?.trim()
        ? { dimensions: Number(process.env.EMBEDDING_DIMENSIONS) }
        : {}),
    }),
    (body) => {
      const vectors = body.data?.map((item) => item.embedding);
      const dimensions = vectors?.[0]?.length;
      return {
        ok:
          vectors?.length === 2 &&
          dimensions > 0 &&
          (!process.env.EMBEDDING_DIMENSIONS?.trim() ||
            dimensions === Number(process.env.EMBEDDING_DIMENSIONS)) &&
          vectors.every(
            (vector) =>
              Array.isArray(vector) &&
              vector.length === dimensions &&
              vector.every(Number.isFinite),
          ),
        model: body.model,
        count: vectors?.length,
        dimensions,
        requestedConfigDimensions:
          process.env.EMBEDDING_DIMENSIONS || "API default",
      };
    },
  ),
  ...(process.env.SEARCH_API_KEY
    ? [
        check(
          "search",
          "https://api.tavily.com/search",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: process.env.SEARCH_API_KEY,
              query: "British Council teaching English writing invitations",
              max_results: 1,
              search_depth: "basic",
            }),
          },
          (body) => ({
            ok: Array.isArray(body.results),
            results: body.results?.length,
          }),
        ),
      ]
    : []),
]);
await mkdir("output", { recursive: true });
await writeFile(
  "output/api-config-check.json",
  JSON.stringify(results, null, 2),
);
if (results.some((result) => !result.ok)) process.exitCode = 1;
