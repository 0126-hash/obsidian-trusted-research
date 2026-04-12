import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";
import type ResearchReportPlugin from "../main";
import { invokeControlPlaneCapability } from "./controlPlaneService";

/**
 * Wrap Obsidian's requestUrl with a client-side timeout via Promise.race.
 *
 * Background: Obsidian's RequestUrlParam type does not declare a `timeout`
 * field; the runtime silently drops unknown properties. Earlier code passed
 * an unsupported timeout property and suppressed the type error, which
 * compiled but had no runtime effect.
 *
 * This helper races requestUrl against a setTimeout-based rejection. When
 * the timer wins, it rejects with Error("PROVIDER_TIMEOUT"), allowing the
 * existing getErrorMessage() chain to translate the code via ERROR_MESSAGES.
 *
 * Caveat: requestUrl itself is not cancellable, so the underlying request
 * continues in the background until it naturally completes.
 */
export async function requestUrlWithTimeout(
  params: RequestUrlParam,
  timeoutMs: number
): Promise<RequestUrlResponse> {
  return Promise.race([
    requestUrl(params),
    new Promise<RequestUrlResponse>((_, reject) =>
      setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), timeoutMs)
    ),
  ]);
}

/* ── Types ── */

export interface RuntimeConfig {
  baseUrl: string;
  timeout: number;
  provider: string;
  dashscopeApiKey: string;
  dashscopeQuickCheckModel: string;
  dashscopeDeepResearchModel: string;
}

export interface QuickCheckContext {
  selectedText?: string;
  documentContent?: string;
  documentTitle?: string;
  documentPath?: string;
}

export interface QuickCheckSource {
  id: string;
  sourceType: string;
  title: string;
  locator: Record<string, string | undefined>;
  retrievedAt: string;
  snippet: string;
  credibilityNote: string;
  timeSensitivity: string;
}

export interface QuickCheckResult {
  query: string;
  conclusion: string;
  keyEvidence: string[];
  uncertainties: string[];
  sources: QuickCheckSource[];
  confidenceNote: string;
  timeSensitivity: string;
}

export interface QuickCheckResponse {
  task?: {
    id: string;
    mode: string;
    status: string;
    createdAt: string;
  };
  result: QuickCheckResult;
}

export interface QuickCheckError {
  error: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}

/* ── Error code → human-readable message ── */

const ERROR_MESSAGES: Record<string, string> = {
  MISSING_QUERY: "请输入研究问题",
  QUERY_TOO_LONG: "问题过长，请缩短到 1000 字以内",
  SELECTION_TOO_LONG: "选中文本过长，请缩短到 8000 字以内",
  DOCUMENT_TOO_LONG: "文档内容过长（超过 50000 字符），系统将自动截断",
  NO_CONTEXT: "需要提供选中文本或打开一篇文档作为上下文",
  INVALID_INPUT: "请求格式错误",
  PROVIDER_MISCONFIGURED: "模型提供商未正确配置 (请检查 API Key)",
  QUICK_CHECK_FAILED: "模型推理失败，请稍后重试",
  FACT_GUARD_FAILED: "事实核查失败，请稍后重试",
  QUOTA_EXCEEDED: "当日配额已用完，请明天再试",
  PROVIDER_TIMEOUT: "模型响应超时，请稍后重试",
  PROVIDER_REQUEST_FAILED: "调用模型服务失败，请稍后重试",
  PROVIDER_UNAVAILABLE: "模型服务当前不可用",
  PROVIDER_BAD_RESPONSE: "模型服务返回了无效内容",
  UNKNOWN: "服务器内部错误",
};

export function getErrorMessage(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] || fallback || `未知错误 (${code})`;
}

/* ── API call ── */

export async function callQuickCheck(
  plugin: ResearchReportPlugin,
  query: string,
  context: QuickCheckContext
): Promise<QuickCheckResult> {
  if (plugin.settings.serviceMode === "control_plane") {
    const result = await invokeControlPlaneCapability<{
      summary: string;
      keyEvidence?: string[];
      uncertainties?: string[];
      sources?: QuickCheckSource[];
      confidenceNote?: string;
      timeSensitivity?: string;
    }>(plugin, "research.quick_check", {
      userQuery: query,
      selection: context.selectedText || undefined,
      documentExcerpt: context.documentContent || undefined,
      documentTitle: context.documentTitle || undefined,
      documentPath: context.documentPath || undefined,
    });

    return {
      query,
      conclusion: result.summary || "",
      keyEvidence: result.keyEvidence || [],
      uncertainties: result.uncertainties || [],
      sources: result.sources || [],
      confidenceNote: result.confidenceNote || "",
      timeSensitivity: result.timeSensitivity || "unknown",
    };
  }

  const config: RuntimeConfig = {
    baseUrl: plugin.settings.researchApiBaseUrl,
    timeout: plugin.settings.quickCheckTimeout,
    provider: plugin.settings.researchProvider,
    dashscopeApiKey: plugin.settings.dashscopeApiKey,
    dashscopeQuickCheckModel: plugin.settings.dashscopeQuickCheckModel,
    dashscopeDeepResearchModel: plugin.settings.dashscopeDeepResearchModel,
  };

  const url = `${config.baseUrl.replace(/\/$/, "")}/research/quick-check`;

  const body = {
    query,
    context: {
      selectedText: context.selectedText || undefined,
      documentContent: context.documentContent || undefined,
      documentTitle: context.documentTitle || undefined,
      documentPath: context.documentPath || undefined,
    },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Provider": config.provider,
  };
  if (config.provider === "dashscope") {
    if (config.dashscopeApiKey) headers["X-DashScope-API-Key"] = config.dashscopeApiKey;
    if (config.dashscopeQuickCheckModel) headers["X-Quick-Check-Model"] = config.dashscopeQuickCheckModel;
  }

  let response;
  try {
    response = await requestUrlWithTimeout(
      {
        url,
        method: "POST",
        headers,
        body: JSON.stringify(body),
        throw: false,
      },
      config.timeout
    );
  } catch (err) {
    if (err instanceof Error && err.message === "PROVIDER_TIMEOUT") {
      throw new Error(getErrorMessage("PROVIDER_TIMEOUT"));
    }
    throw new Error(
      `无法连接到研究引擎 (${config.baseUrl})。请确认服务已启动。`
    );
  }

  if (response.status >= 400) {
    let errorData: QuickCheckError | undefined;
    try {
      errorData = response.json as QuickCheckError;
    } catch {
      /* not JSON */
    }
    if (errorData?.error?.code) {
      throw new Error(getErrorMessage(errorData.error.code, errorData.error.message));
    }
    throw new Error(`研究引擎返回错误 (HTTP ${response.status})`);
  }

  const data = response.json as QuickCheckResponse;
  if (!data?.result) {
    throw new Error("研究引擎返回了空结果");
  }

  return data.result;
}
