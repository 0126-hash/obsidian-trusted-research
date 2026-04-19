export interface ResearchReportSettings {
  anthropicApiKey: string;
  braveApiKey: string;
  defaultReportFolder: string;
  maxUrlsToFetch: number;
  maxCharsPerPage: number;
  researchApiBaseUrl: string;
  quickCheckTimeout: number;
  factGuardTimeout: number;
  deepResearchTimeout: number;
  deepResearchExportTimeout: number;
  maxDocumentContextChars: number;
  serviceMode: "runtime" | "control_plane";
  controlPlaneBaseUrl: string;
  controlPlaneEmail: string;
  controlPlanePassword: string;
  controlPlaneClientVersion: string;
  controlPlaneDeviceId: string;
  
  /* Beta Configs */
  researchProvider: "local_mock" | "dashscope";
  dashscopeApiKey: string;
  dashscopeQuickCheckModel: string;
  dashscopeFactGuardModel: string;
  dashscopeDeepResearchModel: string;
}

export const DEFAULT_SETTINGS: ResearchReportSettings = {
  anthropicApiKey: "",
  braveApiKey: "",
  defaultReportFolder: "行业研究",
  maxUrlsToFetch: 20,
  maxCharsPerPage: 50000,
  researchApiBaseUrl: "",
  quickCheckTimeout: 30000,
  factGuardTimeout: 30000,
  deepResearchTimeout: 45000,
  deepResearchExportTimeout: 60000,
  maxDocumentContextChars: 12000,
  serviceMode: "runtime",
  controlPlaneBaseUrl: "",
  controlPlaneEmail: "",
  controlPlanePassword: "",
  controlPlaneClientVersion: "0.2.0",
  controlPlaneDeviceId: "",
  
  researchProvider: "dashscope",
  dashscopeApiKey: "",
  dashscopeQuickCheckModel: "qwen-flash",
  dashscopeFactGuardModel: "qwen-flash",
  dashscopeDeepResearchModel: "qwen-plus",
};
