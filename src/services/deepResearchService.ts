import type ResearchReportPlugin from "../main";
import {
  cancelControlPlaneTask,
  createControlPlaneTask,
  getControlPlaneTask,
} from "./controlPlaneService";
import { requestUrlWithTimeout } from "./quickCheckService";

/* ── Types ── */

export interface RuntimeConfig {
  baseUrl: string;
  timeout: number;
  provider: string;
  dashscopeApiKey: string;
  dashscopeQuickCheckModel: string;
  dashscopeDeepResearchModel: string;
}

export type ResearchTaskStatus =
  | "idle"
  | "drafting_plan"
  | "awaiting_confirmation"
  | "running"
  | "synthesizing"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskProgress {
  currentStep: string;
  currentStepLabel: string;
  progressPercent: number;
  fetchedCount?: number;
  parsedCount?: number;
  selectedCount?: number;
  failedCount?: number;
}

export interface ResearchPlan {
  objective: string;
  subquestions: string[];
  sourceStrategy: string[];
  stopCondition: string;
  notes?: string[];
}

export interface EvidenceItem {
  id: string;
  sourceType: "web" | "document" | "note" | "manual";
  title: string;
  locator: {
    url?: string;
    filePath?: string;
    section?: string;
  };
  publishedAt?: string;
  retrievedAt: string;
  snippet: string;
  supportsClaims?: string[];
  conflictsWithClaims?: string[];
  credibilityNote?: string;
  timeSensitivity?: "low" | "medium" | "high";
}

export interface ResearchReport {
  query: string;
  objective: string;
  executiveSummary: string;
  keyFindings: string[];
  evidenceItems: EvidenceItem[];
  controversies: string[];
  uncertainties: string[];
  recommendations?: string[];
  generatedAt: string;
}

export interface TaskError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ResearchTask {
  id: string;
  mode: "deep_research";
  query: string;
  status: ResearchTaskStatus;
  createdAt: string;
  updatedAt: string;
  contextSummary: {
    hasActiveDocument: boolean;
    hasSelection: boolean;
    sourceMode: string;
  };
  plan?: ResearchPlan;
  progress?: TaskProgress;
  result?: ResearchReport;
  error?: TaskError;
  runtimeTaskId?: string;
}

export interface DeepResearchContext {
  selectedText?: string;
  documentContent?: string;
  documentTitle?: string;
  documentPath?: string;
}

/* ── Error handling ── */

const ERROR_MESSAGES: Record<string, string> = {
  MISSING_QUERY: "请输入研究问题",
  QUERY_TOO_LONG: "问题过长，请缩短到 1000 字以内",
  SELECTION_TOO_LONG: "选中文本过长，请缩短到 8000 字以内",
  DOCUMENT_TOO_LONG: "文档内容过长（超过 50000 字符）",
  NO_CONTEXT: "需要提供选中文本或打开一篇文档作为上下文",
  INVALID_INPUT: "请求格式错误",
  PROVIDER_MISCONFIGURED: "模型提供商未正确配置 (请检查 API Key)",
  DEEP_RESEARCH_FAILED: "深度研究执行失败，请重试",
  FACT_GUARD_FAILED: "事实核查执行失败，请重试",
  RETRIEVAL_FAILED: "研究引擎检索失败，请稍后重试",
  PLAN_GENERATION_FAILED: "研究计划生成失败",
  SYNTHESIS_FAILED: "研究报告合成失败",
  TASK_CANCELLED: "任务已取消",
  UNKNOWN: "服务器内部错误",
};

function getErrorMessage(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] || fallback || `未知错误 (${code})`;
}

function parseErrorResponse(response: { status: number; json: unknown }): never {
  const data = response.json as { error?: { code?: string; message?: string } };
  if (data?.error?.code) {
    throw new Error(getErrorMessage(data.error.code, data.error.message));
  }
  throw new Error(`研究引擎返回错误 (HTTP ${response.status})`);
}

/* ── Helpers ── */

function buildHeaders(config: RuntimeConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Provider": config.provider,
  };
  if (config.provider === "dashscope") {
    if (config.dashscopeApiKey) headers["X-DashScope-API-Key"] = config.dashscopeApiKey;
    if (config.dashscopeDeepResearchModel) headers["X-Deep-Research-Model"] = config.dashscopeDeepResearchModel;
  }
  return headers;
}

/* ── API Calls ── */

export async function createResearchTask(
  plugin: ResearchReportPlugin,
  query: string,
  context: DeepResearchContext
): Promise<ResearchTask> {
  if (plugin.settings.serviceMode === "control_plane") {
    const task = await createControlPlaneTask(plugin, "research.deep_research", {
      userQuery: query,
      selection: context.selectedText || undefined,
      documentExcerpt: context.documentContent || undefined,
      documentTitle: context.documentTitle || undefined,
      documentPath: context.documentPath || undefined,
    });
    return mapControlPlaneTask(query, task);
  }

  const config: RuntimeConfig = {
    baseUrl: plugin.settings.researchApiBaseUrl,
    timeout: plugin.settings.quickCheckTimeout,
    provider: plugin.settings.researchProvider,
    dashscopeApiKey: plugin.settings.dashscopeApiKey,
    dashscopeQuickCheckModel: plugin.settings.dashscopeQuickCheckModel,
    dashscopeDeepResearchModel: plugin.settings.dashscopeDeepResearchModel,
  };
  const url = `${config.baseUrl.replace(/\/$/, "")}/research/tasks`;

  const body = {
    query,
    context: {
      selectedText: context.selectedText || undefined,
      documentContent: context.documentContent || undefined,
      documentTitle: context.documentTitle || undefined,
      documentPath: context.documentPath || undefined,
    },
  };

  let response;
  try {
    response = await requestUrlWithTimeout(
      {
        url,
        method: "POST",
        headers: buildHeaders(config),
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
    parseErrorResponse(response);
  }

  const data = response.json as { task?: ResearchTask };
  if (!data?.task) {
    throw new Error("研究引擎返回了空任务");
  }
  return data.task;
}

export async function getResearchTask(
  plugin: ResearchReportPlugin,
  taskId: string
): Promise<ResearchTask> {
  if (plugin.settings.serviceMode === "control_plane") {
    const task = await getControlPlaneTask(plugin, taskId);
    return mapControlPlaneTask(undefined, task);
  }

  const config: RuntimeConfig = {
    baseUrl: plugin.settings.researchApiBaseUrl,
    timeout: plugin.settings.quickCheckTimeout,
    provider: plugin.settings.researchProvider,
    dashscopeApiKey: plugin.settings.dashscopeApiKey,
    dashscopeQuickCheckModel: plugin.settings.dashscopeQuickCheckModel,
    dashscopeDeepResearchModel: plugin.settings.dashscopeDeepResearchModel,
  };
  const url = `${config.baseUrl.replace(/\/$/, "")}/research/tasks/${taskId}`;

  let response;
  try {
    response = await requestUrlWithTimeout(
      {
        url,
        method: "GET",
        headers: buildHeaders(config),
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
    parseErrorResponse(response);
  }

  const data = response.json as { task?: ResearchTask };
  if (!data?.task) {
    throw new Error("研究引擎返回了空任务");
  }
  return data.task;
}

export async function confirmResearchTask(
  plugin: ResearchReportPlugin,
  taskId: string
): Promise<ResearchTask> {
  if (plugin.settings.serviceMode === "control_plane") {
    return getResearchTask(plugin, taskId);
  }

  const config: RuntimeConfig = {
    baseUrl: plugin.settings.researchApiBaseUrl,
    timeout: plugin.settings.quickCheckTimeout,
    provider: plugin.settings.researchProvider,
    dashscopeApiKey: plugin.settings.dashscopeApiKey,
    dashscopeQuickCheckModel: plugin.settings.dashscopeQuickCheckModel,
    dashscopeDeepResearchModel: plugin.settings.dashscopeDeepResearchModel,
  };
  const url = `${config.baseUrl.replace(/\/$/, "")}/research/tasks/${taskId}/confirm`;

  let response;
  try {
    response = await requestUrlWithTimeout(
      {
        url,
        method: "POST",
        headers: buildHeaders(config),
        body: JSON.stringify({ accepted: true }),
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
    parseErrorResponse(response);
  }

  const data = response.json as { task?: ResearchTask };
  if (!data?.task) {
    throw new Error("研究引擎返回了空任务");
  }
  return data.task;
}

export async function cancelResearchTask(
  plugin: ResearchReportPlugin,
  taskId: string
): Promise<ResearchTask> {
  if (plugin.settings.serviceMode === "control_plane") {
    const task = await cancelControlPlaneTask(plugin, taskId);
    return mapControlPlaneTask(undefined, task);
  }

  const config: RuntimeConfig = {
    baseUrl: plugin.settings.researchApiBaseUrl,
    timeout: plugin.settings.quickCheckTimeout,
    provider: plugin.settings.researchProvider,
    dashscopeApiKey: plugin.settings.dashscopeApiKey,
    dashscopeQuickCheckModel: plugin.settings.dashscopeQuickCheckModel,
    dashscopeDeepResearchModel: plugin.settings.dashscopeDeepResearchModel,
  };
  const url = `${config.baseUrl.replace(/\/$/, "")}/research/tasks/${taskId}/cancel`;

  let response;
  try {
    response = await requestUrlWithTimeout(
      {
        url,
        method: "POST",
        headers: buildHeaders(config),
        body: JSON.stringify({}),
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
    parseErrorResponse(response);
  }

  const data = response.json as { task?: ResearchTask };
  if (!data?.task) {
    throw new Error("研究引擎返回了空任务");
  }
  return data.task;
}

/* ── Export ── */

export interface ExportResult {
  filePath: string;
}

export async function exportResearchMarkdown(
  plugin: ResearchReportPlugin,
  taskId: string,
  targetFolder?: string
): Promise<ExportResult> {
  if (plugin.settings.serviceMode === "control_plane") {
    throw new Error("服务模式下暂未开放客户端直接导出，请先在结果中查看内容。");
  }

  const config: RuntimeConfig = {
    baseUrl: plugin.settings.researchApiBaseUrl,
    timeout: plugin.settings.quickCheckTimeout,
    provider: plugin.settings.researchProvider,
    dashscopeApiKey: plugin.settings.dashscopeApiKey,
    dashscopeQuickCheckModel: plugin.settings.dashscopeQuickCheckModel,
    dashscopeDeepResearchModel: plugin.settings.dashscopeDeepResearchModel,
  };
  const url = `${config.baseUrl.replace(/\/$/, "")}/research/tasks/${taskId}/export-markdown`;

  const body: { targetFolder?: string } = {};
  if (targetFolder) body.targetFolder = targetFolder;

  let response;
  try {
    response = await requestUrlWithTimeout(
      {
        url,
        method: "POST",
        headers: buildHeaders(config),
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
    parseErrorResponse(response);
  }

  const data = response.json as { filePath?: string };
  if (!data?.filePath) {
    throw new Error("导出失败：未返回文件路径");
  }
  return { filePath: data.filePath };
}

/* ── Terminal states check ── */

export function isTerminalStatus(status: ResearchTaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function mapControlPlaneTask(query: string | undefined, task: any): ResearchTask {
  const status = mapControlPlaneStatus(task?.status);
  const progressPercent =
    status === "completed"
      ? 100
      : status === "failed" || status === "cancelled"
      ? 100
      : status === "synthesizing"
      ? 85
      : status === "running"
      ? 45
      : 15;

  return {
    id: task.taskId,
    mode: "deep_research",
    query: query || task?.result?.query || task?.contextSnapshot?.userQuery || "",
    status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    contextSummary: {
      hasActiveDocument: Boolean(
        task?.contextSnapshot?.documentTitle || task?.contextSnapshot?.documentPath || task?.contextSnapshot?.documentExcerpt
      ),
      hasSelection: Boolean(task?.contextSnapshot?.selection),
      sourceMode: "current_doc_only",
    },
    progress: {
      currentStep: task?.runtimeStatus || task?.status || "running",
      currentStepLabel: task?.progress?.currentStepLabel || task?.progressText || "任务处理中",
      progressPercent,
      fetchedCount: task?.progress?.fetchedCount,
      parsedCount: task?.progress?.parsedCount,
      selectedCount: task?.progress?.selectedCount,
      failedCount: task?.progress?.failedCount,
    },
    plan: task?.plan,
    result: task?.result,
    error: task?.runtimeError || (task?.errorCode
      ? {
          code: task.errorCode,
          message: task.errorMessage || task.errorCode,
          retryable: task.errorCode !== "INVALID_INPUT",
        }
      : undefined),
    runtimeTaskId: task?.runtimeTaskId,
  };
}

function mapControlPlaneStatus(status: string): ResearchTaskStatus {
  switch (status) {
    case "created":
    case "queued":
      return "running";
    case "running":
      return "running";
    case "synthesizing":
      return "synthesizing";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "running";
  }
}
