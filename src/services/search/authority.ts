import type { WebSource } from "@/types/lesson";

const institutions = [
  { names: /教育部|ministry of education/i, domain: "moe.gov.cn" },
  { names: /人民教育出版社|人教社|\bpep\b/i, domain: "pep.com.cn" },
  { names: /国务院|中国政府网/i, domain: "gov.cn" },
  { names: /上海市教委|上海市教育委员会/i, domain: "edu.sh.gov.cn" },
];
const within = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

export function searchPolicy(query: string) {
  const officialOnly =
    /官方|官网|政府(?:网站|来源)|只看官方|official|government sources?/i.test(
      query,
    );
  const authorityRequired = officialOnly || /权威|authoritative/i.test(query);
  const institution = institutions.find((i) => i.names.test(query));
  // A teacher-supplied domain can identify other institutions without adding
  // per-question rules. Match hostnames, never substrings of URLs.
  const domain = query
    .match(/(?:https?:\/\/|site:)([a-z0-9.-]+\.[a-z]{2,})(?=[/:\s]|$)/i)?.[1]
    ?.toLowerCase();
  const targetDomain = authorityRequired
    ? (institution?.domain ?? domain)
    : undefined;
  // Search engines work better with the requested document/topic than a full
  // conversational command. Keep institutions and subject terms, remove UI asks.
  const compactQuery = query
    .replace(/[，,。；;].*(?:来源|链接|网页|source|link).*$/i, "")
    .replace(
      /(?:请|帮我|帮助我|我想|为我|麻烦)?(?:查找|搜索|检索|查一下|找一下|找出|查询|寻找)/g,
      " ",
    )
    .replace(/(?:官方)?(?:发布|颁布|制定)的?/g, " ")
    .replace(/官方|官网|政府来源|政府网站|权威来源/g, " ")
    .replace(
      /(普通高中|高中|义务教育|初中|小学)(英语|语文|数学|物理|化学|历史|生物|地理)/g,
      "$1 $2 ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const stage = query.match(/普通高中|义务教育|高等学校|高中|初中|小学/)?.[0];
  const subject = query.match(/英语|语文|数学|物理|化学|历史|生物|地理/)?.[0];
  const documentKind = query.match(/课程标准|管理规定|指导纲要|实施办法/)?.[0];
  return {
    officialOnly,
    authorityRequired,
    targetDomain,
    stage,
    subject,
    documentKind,
    query: targetDomain
      ? `${compactQuery} site:${targetDomain}`
      : compactQuery || query,
    includeDomains: targetDomain
      ? [targetDomain]
      : officialOnly
        ? ["gov.cn"]
        : undefined,
  };
}

export function sourceAuthority(url: string, targetDomain?: string) {
  try {
    const parsed = new URL(url);
    if (
      !/^https?:$/.test(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return 0;
    const host = parsed.hostname.toLowerCase();
    if (targetDomain && within(host, targetDomain)) return 100;
    if (within(host, "moe.gov.cn")) return 95;
    if (within(host, "gov.cn")) return 90;
    if (within(host, "pep.com.cn")) return 80;
    if (within(host, "edu.cn")) return 70;
    if (
      ["doi.org", "sciencedirect.com", "springer.com", "scirp.org"].some((d) =>
        within(host, d),
      )
    )
      return 40;
    return 20;
  } catch {
    return 0;
  }
}

export function rankSearchResults(
  query: string,
  results: unknown,
): WebSource[] {
  if (!Array.isArray(results)) return [];
  const policy = searchPolicy(query);
  const seen = new Set<string>();
  const candidates = results.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    if (
      typeof r.url !== "string" ||
      typeof r.title !== "string" ||
      typeof r.content !== "string"
    )
      return [];
    const authority = sourceAuthority(r.url, policy.targetDomain);
    if (!authority) return [];
    const url = new URL(r.url);
    if (
      policy.officialOnly &&
      (policy.targetDomain
        ? !within(url.hostname.toLowerCase(), policy.targetDomain)
        : !within(url.hostname.toLowerCase(), "gov.cn"))
    )
      return [];
    if (policy.authorityRequired && !policy.officialOnly && authority < 70)
      return [];
    // Official-hosted material can still be irrelevant (e.g. university policy
    // or compulsory education in a high-school standards query). Document
    // searches require the requested type and school stage in the title.
    if (
      policy.authorityRequired &&
      policy.documentKind &&
      !r.title.includes(policy.documentKind)
    )
      return [];
    if (
      policy.authorityRequired &&
      policy.stage &&
      !r.title.includes(policy.stage)
    )
      return [];
    if (
      policy.authorityRequired &&
      policy.documentKind &&
      policy.subject &&
      !r.title.includes(policy.subject) &&
      !/(?:等|各|个)学科.*课程标准/.test(r.title)
    )
      return [];
    const relevance =
      typeof r.score === "number" ? Math.max(0, Math.min(1, r.score)) : 0.5;
    if (relevance < 0.25) return [];
    url.hash = "";
    if (seen.has(url.href)) return [];
    seen.add(url.href);
    const versions = [...r.title.matchAll(/(20\d{2})年(?:版|修订)/g)].map((m) =>
      Number(m[1]),
    );
    const versionScore =
      policy.documentKind && versions.length
        ? Math.max(0, Math.min(25, Math.max(...versions) - 2000))
        : 0;
    return [
      {
        source: {
          title: r.title,
          url: url.href,
          content: r.content.slice(0, 3000),
        },
        score: authority + relevance * 40 + versionScore,
      },
    ];
  });
  const hasVersionedStandard =
    policy.documentKind === "课程标准" &&
    candidates.some((r) => /20\d{2}年(?:版|修订)/.test(r.source.title));
  return candidates
    .filter(
      (r) =>
        !hasVersionedStandard ||
        /实验|历史|沿革/.test(query) ||
        !/实验/.test(r.source.title),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((r) => r.source);
}
