import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOrigin } from "@/lib/errors";

afterEach(() => vi.unstubAllEnvs());
const mutation = (
  origin: string,
  site = "same-origin",
  url = "http://localhost:3000/api/auth/login",
) =>
  new Request(url, {
    method: "POST",
    headers: { origin, "sec-fetch-site": site },
  });

describe("request origin validation", () => {
  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
  ])("accepts the local development origin %s", (origin) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(() => checkOrigin(mutation(origin))).not.toThrow();
  });
  it("accepts localhost when the configured development address uses 127.0.0.1", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
    expect(() =>
      checkOrigin(
        mutation(
          "http://localhost:3000",
          "same-origin",
          "http://127.0.0.1:3000/api/auth/register",
        ),
      ),
    ).not.toThrow();
  });
  it.each([
    "http://127.0.0.1:3001",
    "https://127.0.0.1:3000",
    "http://127.0.0.2:3000",
    "https://untrusted.test",
    "null",
    "http://localhost:3000.evil.test",
    "http://127.0.0.1:3000/login",
  ])("rejects untrusted origins, schemes and ports: %s", (origin) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(() => checkOrigin(mutation(origin))).toThrow("请求来源不受信任");
  });
  it("continues rejecting cross-site fetches even from a loopback origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(() =>
      checkOrigin(mutation("http://127.0.0.1:3000", "cross-site")),
    ).toThrow("请求来源不受信任");
  });
  it("does not allow loopback aliases in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(() => checkOrigin(mutation("http://127.0.0.1:3000"))).toThrow(
      "请求来源不受信任",
    );
    expect(() => checkOrigin(mutation("http://localhost:3000"))).not.toThrow();
  });
  it("preserves the configured production origin behind a proxy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://writing.school.example");
    expect(() =>
      checkOrigin(mutation("https://writing.school.example")),
    ).not.toThrow();
    expect(() => checkOrigin(mutation("https://other.school.example"))).toThrow(
      "请求来源不受信任",
    );
  });
});
