import { braveSearch } from "../services/brave";
import { fetchUrlFullText } from "../services/fetchUrl";

export interface GatheredDoc {
  title: string;
  url: string;
  content: string;
}

/**
 * 按关键词列表搜索，并对每个结果的 URL 做全文抓取（受 maxUrls 与 maxCharsPerPage 限制）
 */
export async function gather(
  braveApiKey: string,
  keywords: string[],
  maxUrls: number,
  maxCharsPerPage: number,
  onProgress?: (msg: string) => void
): Promise<GatheredDoc[]> {
  const seen = new Set<string>();
  const results: GatheredDoc[] = [];
  const perKeyword = Math.max(3, Math.ceil(maxUrls / keywords.length));

  for (const kw of keywords) {
    if (results.length >= maxUrls) break;
    onProgress?.(`搜索: ${kw}`);
    const list = await braveSearch(braveApiKey, kw, perKeyword);
    for (const r of list) {
      if (seen.has(r.url) || results.length >= maxUrls) continue;
      seen.add(r.url);
      onProgress?.(`抓取: ${r.title || r.url}`);
      const fetched = await fetchUrlFullText(r.url, maxCharsPerPage);
      if (fetched && fetched.content.length > 100) {
        results.push({
          title: fetched.title || r.title,
          url: fetched.url,
          content: fetched.content,
        });
      } else {
        // fallback: 至少保留标题和摘要
        results.push({
          title: r.title,
          url: r.url,
          content: r.description || "[无法抓取全文]",
        });
      }
    }
  }

  return results;
}

/**
 * 解析规划输出，提取 KEYWORDS 和 OUTLINE 部分
 */
export function parsePlanOutput(text: string): { keywords: string[]; outline: string } {
  const lines = text.split("\n").map((s) => s.trim());
  const keywords: string[] = [];
  const outlineLines: string[] = [];
  let phase: "keywords" | "outline" | null = null;

  for (const line of lines) {
    if (/^KEYWORDS:?\s*$/i.test(line)) {
      phase = "keywords";
      continue;
    }
    if (/^OUTLINE:?\s*$/i.test(line)) {
      phase = "outline";
      continue;
    }
    if (phase === "keywords" && line) {
      keywords.push(line);
    } else if (phase === "outline" && line) {
      outlineLines.push(line);
    }
  }

  return {
    keywords: keywords.filter((k) => k.length > 0),
    outline: outlineLines.join("\n"),
  };
}
