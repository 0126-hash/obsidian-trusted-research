/**
 * 抓取 URL 全文。在 Electron 环境中 fetch 可能受 CORS 限制，
 * 失败时返回 null，调用方可用 Brave 的 description 作为 fallback。
 * 使用 DOMParser + 简单正文提取（优先 article/main，否则 body 文本）。
 */
export interface FetchedPage {
  title: string;
  content: string;
  url: string;
}

const MAX_CHARS = 100000;

function extractTextFromHtml(html: string, maxChars: number): { title: string; content: string } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const title =
    doc.querySelector("title")?.textContent?.trim() ||
    doc.querySelector("h1")?.textContent?.trim() ||
    "";

  const article =
    doc.querySelector("article") ||
    doc.querySelector("main") ||
    doc.querySelector("[role='main']") ||
    doc.body;
  if (!article) {
    return { title, content: "" };
  }

  article.querySelectorAll("script, style, nav, footer, aside, iframe").forEach((el) => el.remove());
  let text = article.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + "\n\n[内容已截断]";
  }
  return { title, content: text };
}

export async function fetchUrlFullText(
  url: string,
  maxCharsPerPage: number = MAX_CHARS
): Promise<FetchedPage | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ResearchReport/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const { title, content } = extractTextFromHtml(html, maxCharsPerPage);
    return { title, content, url };
  } catch {
    return null;
  }
}
