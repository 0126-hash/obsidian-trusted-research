/**
 * 调用 Anthropic Messages API（Claude）进行规划与报告合成。
 */
import { PLAN_SYSTEM_PROMPT, SYNTHESIZE_SYSTEM_PROMPT } from "../reportTemplate";

export async function chat(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  model: string = "claude-sonnet-4-20250514"
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${t}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data?.content?.find((c) => c.type === "text")?.text ?? "";
  return text;
}

export async function planKeywords(apiKey: string, topic: string): Promise<string> {
  return chat(apiKey, PLAN_SYSTEM_PROMPT, `请为以下研究话题生成搜索关键词和研究提纲：\n\n${topic}`);
}

export async function refinePlan(
  apiKey: string,
  topic: string,
  currentKeywordsAndOutline: string,
  userRefinement: string
): Promise<string> {
  const userMessage = `研究话题：${topic}\n\n当前关键词与提纲：\n${currentKeywordsAndOutline}\n\n用户补充或修改要求：\n${userRefinement}\n\n请输出更新后的 KEYWORDS: 和 OUTLINE:，格式与之前一致。`;
  return chat(apiKey, PLAN_SYSTEM_PROMPT, userMessage);
}

export async function synthesizeReport(
  apiKey: string,
  topic: string,
  fetchedContent: Array<{ title: string; url: string; content: string }>
): Promise<string> {
  const contentBlock = fetchedContent
    .map(
      (f, i) =>
        `[来源 ${i + 1}] ${f.title}\nURL: ${f.url}\n\n${f.content.slice(0, 15000)}${f.content.length > 15000 ? "\n\n[已截断]" : ""}`
    )
    .join("\n\n---\n\n");
  const userMessage = `研究话题：${topic}\n\n以下是从网上抓取到的资料全文。请据此撰写一份完整的研究报告，结构按 system 中的要求，并标注引用来源。\n\n${contentBlock}`;
  return chat(apiKey, SYNTHESIZE_SYSTEM_PROMPT, userMessage);
}
