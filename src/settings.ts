export interface ResearchReportSettings {
  anthropicApiKey: string;
  braveApiKey: string;
  defaultReportFolder: string;
  maxUrlsToFetch: number;
  maxCharsPerPage: number;
  researchApiBaseUrl: string;
  quickCheckTimeout: number;
  serviceMode: "runtime" | "control_plane";
  controlPlaneBaseUrl: string;
  controlPlaneEmail: string;
  controlPlanePassword: string;
  controlPlaneClientVersion: string;
  controlPlaneAccessToken: string;
  controlPlaneRefreshToken: string;
  controlPlaneDeviceId: string;
  
  /* Beta Configs */
  researchProvider: "local_mock" | "dashscope";
  dashscopeApiKey: string;
  dashscopeQuickCheckModel: string;
  dashscopeDeepResearchModel: string;
}

export const DEFAULT_SETTINGS: ResearchReportSettings = {
  anthropicApiKey: "",
  braveApiKey: "",
  defaultReportFolder: "行业研究",
  maxUrlsToFetch: 20,
  maxCharsPerPage: 50000,
  researchApiBaseUrl: "http://127.0.0.1:4319",
  quickCheckTimeout: 30000,
  serviceMode: "control_plane",
  controlPlaneBaseUrl: "http://127.0.0.1:4320",
  controlPlaneEmail: "demo@example.com",
  controlPlanePassword: "demo123456",
  controlPlaneClientVersion: "1.0.0",
  controlPlaneAccessToken: "",
  controlPlaneRefreshToken: "",
  controlPlaneDeviceId: "",
  
  researchProvider: "dashscope",
  dashscopeApiKey: "",
  dashscopeQuickCheckModel: "qwen-flash",
  dashscopeDeepResearchModel: "qwen-plus",
};
