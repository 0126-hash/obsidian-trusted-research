import type ResearchReportPlugin from "../main";
import { invokeControlPlaneCapability, type ControlPlaneContext } from "./controlPlaneService";
import { getErrorMessage, requestUrlWithTimeout, type QuickCheckContext } from "./quickCheckService";

export type FactGuardContext = QuickCheckContext;

export interface FactGuardEvidenceItem {
  id?: string;
  sourceType?: string;
  title?: string;
  locator?: Record<string, string | undefined>;
  retrievedAt?: string;
  snippet?: string;
  credibilityNote?: string;
  timeSensitivity?: string;
  supportsClaims?: string[];
  conflictsWithClaims?: string[];
  source?: string;
  quote?: string;
  excerpt?: string;
  text?: string;
  content?: string;
  description?: string;
  claim?: string;
}

export type FactGuardVerdict =
  | "supported"
  | "partially_supported"
  | "unsupported"
  | "contradicted"
  | "mixed"
  | "uncertain";

export interface FactGuardResult {
  claim: string;
  verdict: FactGuardVerdict | string;
  rationale: string;
  supportingEvidence: (string | FactGuardEvidenceItem)[];
  conflictingEvidence: (string | FactGuardEvidenceItem)[];
  uncertainties: (string | FactGuardEvidenceItem)[];
}

interface FactGuardControlPlaneRawResponse {
  claim?: string;
  verdict?: string;
  rationale?: string;
  supportingEvidence?: (string | FactGuardEvidenceItem)[];
  conflictingEvidence?: (string | FactGuardEvidenceItem)[];
  uncertainties?: (string | FactGuardEvidenceItem)[];
}

interface FactGuardRuntimeResponse {
  result?: FactGuardResult;
}

interface FactGuardRuntimeError {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
}

export async function callFactGuard(
  plugin: ResearchReportPlugin,
  query: string,
  context: FactGuardContext
): Promise<FactGuardResult> {
  if (plugin.settings.serviceMode === "control_plane") {
    const cpContext = {
      userQuery: query,
      claim: query,
      selection: context.selectedText || undefined,
      documentExcerpt: context.documentContent || undefined,
      documentTitle: context.documentTitle || undefined,
      documentPath: context.documentPath || undefined,
    } satisfies ControlPlaneContext;

    const raw = await invokeControlPlaneCapability<FactGuardControlPlaneRawResponse>(
      plugin,
      "research.fact_guard",
      cpContext
    );

    return {
      claim: raw.claim || query,
      verdict: raw.verdict || "uncertain",
      rationale: raw.rationale || "",
      supportingEvidence: raw.supportingEvidence || [],
      conflictingEvidence: raw.conflictingEvidence || [],
      uncertainties: raw.uncertainties || [],
    };
  }

  const config = {
    baseUrl: plugin.settings.researchApiBaseUrl,
    timeout: plugin.settings.quickCheckTimeout,
    provider: plugin.settings.researchProvider,
    dashscopeApiKey: plugin.settings.dashscopeApiKey,
  };

  if (!config.baseUrl.trim()) {
    throw new Error("请先在插件设置中填写 Research API 地址。");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}/research/fact-guard`;
  const body = {
    claim: query,
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
  if (config.provider === "dashscope" && config.dashscopeApiKey) {
    headers["X-DashScope-API-Key"] = config.dashscopeApiKey;
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
    throw new Error(`无法连接到研究引擎 (${config.baseUrl})。请确认服务已启动。`);
  }

  if (response.status >= 400) {
    let errorData: FactGuardRuntimeError | undefined;
    try {
      errorData = response.json as FactGuardRuntimeError;
    } catch {
      /* not JSON */
    }
    if (errorData?.error?.code) {
      throw new Error(getErrorMessage(errorData.error.code, errorData.error.message));
    }
    throw new Error(`研究引擎返回错误 (HTTP ${response.status})`);
  }

  const data = response.json as FactGuardRuntimeResponse;
  if (!data?.result) {
    throw new Error("研究引擎返回了空结果");
  }
  return data.result;
}
