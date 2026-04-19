import { requestUrl } from "obsidian";
import http from "http";
import https from "https";
import type ResearchReportPlugin from "../main";

export interface ControlPlaneContext {
  userQuery: string;
  claim?: string;
  selection?: string;
  documentExcerpt?: string;
  documentTitle?: string;
  documentPath?: string;
}

export interface ControlPlaneBootstrap {
  requestId: string;
  user: {
    userId: string;
    email: string;
    nickname?: string;
    planType: string;
    status: string;
  };
  session: {
    sessionId: string;
    userId: string;
    deviceId?: string | null;
    expiresAt: string;
    createdAt: string;
  };
  device: {
    deviceId: string;
    userId: string;
    name: string;
    platform: string;
    clientVersion: string;
    trusted: boolean;
  };
  config: Record<string, unknown>;
  version: {
    latestVersion: string;
    minSupportedVersion: string;
    upgradeRequired: boolean;
  };
  capabilities: ControlPlaneCapability[];
}

export interface ControlPlaneCapability {
  key: string;
  enabled?: boolean;
  invocationType?: "sync" | "async" | string;
  kind?: "cloud" | "local" | string;
  title?: string;
  reason?: string | null;
  quota?: {
    limit?: number | null;
    remaining?: number | null;
    resetAt?: string | null;
  } | null;
}

interface JsonResponse<T = any> {
  ok: boolean;
  status: number;
  data: T;
}

function trimTrailingSlash(value: string): string {
  return String(value || "").replace(/\/+$/, "");
}

function getBaseUrl(plugin: ResearchReportPlugin): string {
  return trimTrailingSlash(plugin.settings.controlPlaneBaseUrl);
}

function getClientVersion(plugin: ResearchReportPlugin): string {
  return plugin.settings.controlPlaneClientVersion || "1.0.0";
}

function getStoredDeviceId(plugin: ResearchReportPlugin): string {
  return String(plugin.settings.controlPlaneDeviceId || "").trim();
}

async function persistSettings(plugin: ResearchReportPlugin): Promise<void> {
  await plugin.saveSettings();
}

function ensureConfiguredBaseUrl(plugin: ResearchReportPlugin): string {
  const baseUrl = getBaseUrl(plugin);
  if (!baseUrl) {
    throw new Error("请先在插件设置中填写 Control Plane 地址。");
  }
  return baseUrl;
}

function getAccessToken(plugin: ResearchReportPlugin): string {
  return plugin.controlPlaneSession.accessToken;
}

function getRefreshToken(plugin: ResearchReportPlugin): string {
  return plugin.controlPlaneSession.refreshToken;
}

function setSessionTokens(
  plugin: ResearchReportPlugin,
  accessToken = "",
  refreshToken = ""
): void {
  plugin.controlPlaneSession.accessToken = accessToken;
  plugin.controlPlaneSession.refreshToken = refreshToken;
}

async function requestJson<T = any>(
  plugin: ResearchReportPlugin,
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    timeout?: number;
  } = {}
): Promise<JsonResponse<T>> {
  const url = `${ensureConfiguredBaseUrl(plugin)}${path}`;
  const method = options.method || "GET";
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const timeout = options.timeout || plugin.settings.quickCheckTimeout || 30000;
  const body =
    options.body === undefined ? undefined : JSON.stringify(options.body);

  try {
    return await requestJsonViaNode<T>(url, {
      method,
      headers,
      body,
      timeout,
    });
  } catch {
    const response = await requestUrl({
      url,
      method,
      headers,
      body,
      // @ts-ignore
      timeout,
      throw: false,
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      data: safelyParseJson<T>(response.text),
    };
  }
}

function safelyParseJson<T>(value: string): T {
  if (!value) return {} as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

async function requestJsonViaNode<T>(
  rawUrl: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeout: number;
  }
): Promise<JsonResponse<T>> {
  const target = new URL(rawUrl);
  const client = target.protocol === "https:" ? https : http;

  return await new Promise<JsonResponse<T>>((resolve, reject) => {
    const req = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port:
          target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: options.method,
        headers: {
          ...options.headers,
          ...(options.body
            ? { "Content-Length": Buffer.byteLength(options.body).toString() }
            : {}),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
            status: res.statusCode || 0,
            data: safelyParseJson<T>(text),
          });
        });
      }
    );

    req.setTimeout(options.timeout, () => {
      req.destroy(new Error("REQUEST_TIMEOUT"));
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function getErrorCode(response: JsonResponse<any>): string | null {
  return response.data?.error?.code || null;
}

function getErrorMessage(response: JsonResponse<any>, fallback: string): string {
  return response.data?.error?.message || fallback;
}

async function login(plugin: ResearchReportPlugin): Promise<void> {
  if (!plugin.settings.controlPlaneEmail || !plugin.settings.controlPlanePassword) {
    throw new Error("请先在设置中填写 Control Plane 邮箱和密码。");
  }

  const response = await requestJson<{
    accessToken: string;
    refreshToken: string;
    user: { planType: string };
  }>(plugin, "/api/v1/auth/login", {
    method: "POST",
    body: {
      email: plugin.settings.controlPlaneEmail,
      password: plugin.settings.controlPlanePassword,
    },
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(response, "登录 Control Plane 失败。"));
  }

  setSessionTokens(plugin, response.data.accessToken || "", response.data.refreshToken || "");
}

async function refresh(plugin: ResearchReportPlugin): Promise<boolean> {
  if (!getRefreshToken(plugin)) {
    return false;
  }

  const response = await requestJson<{
    accessToken: string;
    refreshToken: string;
    session: { deviceId?: string | null };
  }>(plugin, "/api/v1/auth/refresh", {
    method: "POST",
    body: {
      refreshToken: getRefreshToken(plugin),
    },
  });

  if (!response.ok) {
    setSessionTokens(plugin);
    return false;
  }

  setSessionTokens(plugin, response.data.accessToken || "", response.data.refreshToken || "");
  if (response.data.session?.deviceId) {
    plugin.settings.controlPlaneDeviceId = response.data.session.deviceId;
    await persistSettings(plugin);
  }
  return true;
}

async function ensureAccessToken(plugin: ResearchReportPlugin): Promise<void> {
  if (getAccessToken(plugin)) {
    return;
  }

  const refreshed = await refresh(plugin);
  if (!refreshed) {
    await login(plugin);
  }
}

async function registerDevice(plugin: ResearchReportPlugin): Promise<string> {
  await ensureAccessToken(plugin);

  const response = await requestJson<{
    device: { deviceId: string };
  }>(plugin, "/api/v1/devices/register", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken(plugin)}`,
    },
    body: {
      name: plugin.manifest.name,
      platform: "macos",
      clientVersion: getClientVersion(plugin),
    },
  });

  if (response.status === 401) {
    setSessionTokens(plugin, "", getRefreshToken(plugin));
    if (!(await refresh(plugin))) {
      await login(plugin);
    }
    return registerDevice(plugin);
  }

  if (!response.ok || !response.data?.device?.deviceId) {
    throw new Error(getErrorMessage(response, "注册设备失败。"));
  }

  plugin.settings.controlPlaneDeviceId = response.data.device.deviceId;
  await persistSettings(plugin);
  return response.data.device.deviceId;
}

function buildAuthedHeaders(plugin: ResearchReportPlugin, withDevice = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getAccessToken(plugin)}`,
  };

  if (withDevice && getStoredDeviceId(plugin)) {
    headers["x-device-id"] = getStoredDeviceId(plugin);
  }

  if (withDevice) {
    headers["x-client-version"] = getClientVersion(plugin);
  }

  return headers;
}

async function requestAuthed<T = any>(
  plugin: ResearchReportPlugin,
  path: string,
  options: {
    method?: string;
    body?: any;
    withDevice?: boolean;
  } = {}
): Promise<JsonResponse<T>> {
  await ensureAccessToken(plugin);

  const execute = async () =>
    requestJson<T>(plugin, path, {
      method: options.method,
      headers: buildAuthedHeaders(plugin, options.withDevice !== false),
      body: options.body,
    });

  let response = await execute();

  if (response.status === 401) {
    setSessionTokens(plugin, "", getRefreshToken(plugin));
    const refreshed = await refresh(plugin);
    if (!refreshed) {
      await login(plugin);
    }
    response = await execute();
  }

  if (getErrorCode(response) === "DEVICE_NOT_TRUSTED" && options.withDevice !== false) {
    plugin.settings.controlPlaneDeviceId = "";
    await persistSettings(plugin);
    await registerDevice(plugin);
    response = await execute();
  }

  return response;
}

export async function ensureControlPlaneBootstrap(
  plugin: ResearchReportPlugin
): Promise<ControlPlaneBootstrap> {
  if (!getStoredDeviceId(plugin)) {
    await registerDevice(plugin);
  }

  const response = await requestAuthed<ControlPlaneBootstrap>(plugin, "/api/v1/bootstrap", {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(response, "拉取服务初始化信息失败。"));
  }

  return response.data;
}

export function getCapabilityFromBootstrap(
  bootstrap: ControlPlaneBootstrap | null | undefined,
  capabilityKey: string
): ControlPlaneCapability | null {
  if (!bootstrap?.capabilities?.length) return null;
  return (
    bootstrap.capabilities.find((capability) => capability?.key === capabilityKey) ||
    null
  );
}

export async function invokeControlPlaneCapability<T = any>(
  plugin: ResearchReportPlugin,
  capabilityKey: string,
  context: ControlPlaneContext
): Promise<T> {
  await ensureControlPlaneBootstrap(plugin);

  const response = await requestAuthed<{
    capabilityKey: string;
    invocationType: "sync";
    result: T;
    quotaRemaining?: number | null;
    quota?: Record<string, unknown> | null;
    meta?: Record<string, unknown>;
  }>(plugin, `/api/v1/capabilities/${encodeURIComponent(capabilityKey)}/invoke`, {
    method: "POST",
    body: {
      context,
    },
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(response, "能力调用失败。"));
  }

  return response.data.result;
}

export async function createControlPlaneTask(
  plugin: ResearchReportPlugin,
  capabilityKey: string,
  context: ControlPlaneContext
): Promise<any> {
  await ensureControlPlaneBootstrap(plugin);

  const response = await requestAuthed<{ task: any }>(plugin, "/api/v1/tasks", {
    method: "POST",
    body: {
      capabilityKey,
      context,
    },
  });

  if (!response.ok || !response.data?.task) {
    throw new Error(getErrorMessage(response, "创建任务失败。"));
  }

  return response.data.task;
}

export async function getControlPlaneTask(plugin: ResearchReportPlugin, taskId: string): Promise<any> {
  await ensureControlPlaneBootstrap(plugin);
  const response = await requestAuthed<{ task: any }>(
    plugin,
    `/api/v1/tasks/${encodeURIComponent(taskId)}`,
    { method: "GET" }
  );

  if (!response.ok || !response.data?.task) {
    throw new Error(getErrorMessage(response, "获取任务状态失败。"));
  }

  return response.data.task;
}

export async function cancelControlPlaneTask(plugin: ResearchReportPlugin, taskId: string): Promise<any> {
  await ensureControlPlaneBootstrap(plugin);
  const response = await requestAuthed<{ task: any }>(
    plugin,
    `/api/v1/tasks/${encodeURIComponent(taskId)}/cancel`,
    { method: "POST", body: {} }
  );

  if (!response.ok || !response.data?.task) {
    throw new Error(getErrorMessage(response, "取消任务失败。"));
  }

  return response.data.task;
}
