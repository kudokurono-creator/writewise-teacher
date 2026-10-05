import type { WebSource } from "@/types/lesson";
import { AppError } from "@/lib/errors";
import { searchPolicy, rankSearchResults } from "./authority";
export interface WebSearchProvider {
  search(query: string): Promise<WebSource[]>;
}
export class MockSearchProvider implements WebSearchProvider {
  async search() {
    return [];
  }
}
export class TavilySearchProvider implements WebSearchProvider {
  async search(query: string) {
    if (!process.env.SEARCH_API_KEY)
      throw new AppError("联网搜索尚未配置。请关闭联网搜索或联系管理员。", 503);
    const policy = searchPolicy(query);
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.SEARCH_API_KEY,
        query: policy.query,
        max_results: 8,
        search_depth: policy.authorityRequired ? "advanced" : "basic",
        ...(policy.includeDomains
          ? { include_domains: policy.includeDomains }
          : {}),
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new AppError("联网搜索暂时不可用。", 502);
    const body = await response.json();
    return rankSearchResults(query, body.results);
  }
}
export function getSearchProvider(): WebSearchProvider {
  return process.env.SEARCH_PROVIDER === "mock"
    ? new MockSearchProvider()
    : new TavilySearchProvider();
}
