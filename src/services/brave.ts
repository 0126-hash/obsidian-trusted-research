/**
 * Brave Search API: GET https://api.search.brave.com/res/v1/web/search
 */
export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
}

export async function braveSearch(
  apiKey: string,
  query: string,
  count: number = 10
): Promise<BraveSearchResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(count, 20)));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Brave Search failed: ${res.status} ${t}`);
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const list = data?.web?.results ?? [];
  return list
    .filter((r) => r?.url)
    .map((r) => ({
      title: r.title ?? "",
      url: r.url!,
      description: r.description ?? "",
    }));
}
