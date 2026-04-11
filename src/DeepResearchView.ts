import { ItemView, WorkspaceLeaf, setIcon, Notice } from "obsidian";
import type ResearchReportPlugin from "./main";
import {
  createResearchTask,
  getResearchTask,
  confirmResearchTask,
  cancelResearchTask,
  exportResearchMarkdown,
  isTerminalStatus,
  type ResearchTask,
  type ResearchTaskStatus,
  type EvidenceItem,
} from "./services/deepResearchService";

export const DEEP_RESEARCH_VIEW_TYPE = "deep-research-view";

const POLL_INTERVAL_MS = 1000;

type ViewPhase =
  | "idle"
  | "drafting_plan"
  | "awaiting_confirmation"
  | "running"
  | "synthesizing"
  | "completed"
  | "failed"
  | "cancelled"
  | "error";

export class DeepResearchView extends ItemView {
  private plugin: ResearchReportPlugin;
  private phase: ViewPhase = "idle";
  private currentTask: ResearchTask | null = null;
  private currentError: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastExportPath: string | null = null;

  /* DOM refs */
  private inputEl: HTMLTextAreaElement;
  private contextIndicatorEl: HTMLDivElement;
  private serviceStatusEl: HTMLDivElement;
  private bodyEl: HTMLDivElement;

  constructor(leaf: WorkspaceLeaf, plugin: ResearchReportPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return DEEP_RESEARCH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Deep Research";
  }

  getIcon(): string {
    return "microscope";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("dr-container");

    /* ── Header ── */
    const header = container.createDiv({ cls: "dr-header" });
    const titleRow = header.createDiv({ cls: "dr-title-row" });
    const iconEl = titleRow.createSpan({ cls: "dr-title-icon" });
    setIcon(iconEl, "microscope");
    titleRow.createSpan({ cls: "dr-title-text", text: "Deep Research" });
    titleRow.createSpan({
      cls: "dr-title-subtitle",
      text: "深度研究",
    });

    /* ── Context Indicator ── */
    this.contextIndicatorEl = header.createDiv({ cls: "dr-context-indicator" });
    this.updateContextIndicator();
    this.serviceStatusEl = header.createDiv({ cls: "dr-context-indicator" });
    this.renderServiceStatus();
    void this.refreshServiceStatus();

    /* ── Input Area ── */
    const inputArea = container.createDiv({ cls: "dr-input-area" });
    this.inputEl = inputArea.createEl("textarea", {
      cls: "dr-input",
      attr: {
        placeholder: "输入你想深度研究的问题…",
        rows: "3",
      },
    });
    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.startResearch();
      }
    });

    const btnRow = inputArea.createDiv({ cls: "dr-btn-row" });
    btnRow.createSpan({ cls: "dr-send-hint", text: "⌘ + Enter" });
    const sendBtn = btnRow.createEl("button", {
      cls: "dr-send-btn",
      text: "开始研究",
    });
    const sendIconEl = sendBtn.createSpan({ cls: "dr-send-icon" });
    setIcon(sendIconEl, "arrow-up");
    sendBtn.addEventListener("click", () => this.startResearch());

    /* ── Body ── */
    this.bodyEl = container.createDiv({ cls: "dr-body" });
    this.renderBody();

    /* ── Context events ── */
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.updateContextIndicator();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        this.updateContextIndicator();
      })
    );
  }

  async onClose(): Promise<void> {
    this.stopPolling();
  }

  /* ── Public: start with pre-filled query ── */

  public startWithQuery(query: string): void {
    this.inputEl.value = query;
    this.startResearch();
  }

  /* ── Context ── */

  private updateContextIndicator(): void {
    if (!this.contextIndicatorEl) return;
    this.contextIndicatorEl.empty();

    const { documentTitle, selectedText } = this.getContext();
    const iconEl = this.contextIndicatorEl.createSpan({ cls: "dr-ctx-icon" });

    if (selectedText) {
      setIcon(iconEl, "text-cursor-input");
      this.contextIndicatorEl.createSpan({
        cls: "dr-ctx-text",
        text: `已选中 ${selectedText.length} 字`,
      });
      if (documentTitle) {
        this.contextIndicatorEl.createSpan({
          cls: "dr-ctx-doc",
          text: `· ${documentTitle}`,
        });
      }
    } else if (documentTitle) {
      setIcon(iconEl, "file-text");
      this.contextIndicatorEl.createSpan({
        cls: "dr-ctx-text",
        text: documentTitle,
      });
    } else {
      setIcon(iconEl, "alert-circle");
      this.contextIndicatorEl.createSpan({
        cls: "dr-ctx-text dr-ctx-empty",
        text: "请打开一篇文档",
      });
    }
  }

  private async refreshServiceStatus(): Promise<void> {
    if (this.plugin.settings.serviceMode !== "control_plane") {
      this.renderServiceStatus();
      return;
    }
    await this.plugin.refreshControlPlaneBootstrap(true);
    this.renderServiceStatus();
  }

  private renderServiceStatus(): void {
    if (!this.serviceStatusEl) return;
    this.serviceStatusEl.empty();

    const iconEl = this.serviceStatusEl.createSpan({ cls: "dr-ctx-icon" });

    if (this.plugin.settings.serviceMode !== "control_plane") {
      setIcon(iconEl, "plug");
      this.serviceStatusEl.createSpan({
        cls: "dr-ctx-text",
        text: "当前为 Runtime 兼容模式",
      });
      return;
    }

    const bootstrap = this.plugin.controlPlaneBootstrap;
    if (!bootstrap) {
      setIcon(iconEl, "cloud-off");
      this.serviceStatusEl.createSpan({
        cls: "dr-ctx-text dr-ctx-empty",
        text: this.plugin.controlPlaneBootstrapError || "Control Plane 未连接",
      });
      return;
    }

    const capability = this.plugin.getControlPlaneCapability("research.deep_research");
    setIcon(iconEl, bootstrap.version?.upgradeRequired ? "alert-triangle" : "cloud");
    this.serviceStatusEl.createSpan({
      cls: "dr-ctx-text",
      text: `服务模式 · ${bootstrap.user.planType}`,
    });
    if (capability?.enabled === false) {
      this.serviceStatusEl.createSpan({
        cls: "dr-ctx-doc",
        text: `· ${capability.reason || "当前套餐不可用"}`,
      });
    } else if (capability?.quota?.remaining !== undefined && capability?.quota?.remaining !== null) {
      this.serviceStatusEl.createSpan({
        cls: "dr-ctx-doc",
        text: `· 剩余 ${capability.quota.remaining}`,
      });
    }
    if (bootstrap.version?.upgradeRequired) {
      this.serviceStatusEl.createSpan({
        cls: "dr-ctx-doc",
        text: "· 需要升级客户端",
      });
    }
  }

  private getContext(): {
    selectedText: string;
    documentContent: string;
    documentTitle: string;
    documentPath: string;
  } {
    const activeFile = this.app.workspace.getActiveFile();
    const editor = this.app.workspace.activeEditor?.editor;
    return {
      selectedText: editor?.getSelection()?.trim() || "",
      documentContent: editor?.getValue() || "",
      documentTitle: activeFile?.basename || "",
      documentPath: activeFile?.path || "",
    };
  }

  /* ── Research Actions ── */

  private async startResearch(): Promise<void> {
    const query = this.inputEl.value.trim();
    if (!query) {
      this.showError("请输入研究问题");
      return;
    }

    const ctx = this.getContext();
    if (!ctx.selectedText && !ctx.documentContent && !ctx.documentTitle) {
      this.showError("需要提供上下文：请打开一篇文档或选中一段文本");
      return;
    }

    if (this.plugin.settings.serviceMode === "control_plane") {
      await this.refreshServiceStatus();
      const capability = this.plugin.getControlPlaneCapability("research.deep_research");
      if (capability?.enabled === false) {
        this.showError(capability.reason || "当前套餐暂不支持 Deep Research");
        return;
      }
    }

    this.setPhase("drafting_plan");

    try {
      await this.refreshServiceStatus();
      const task = await createResearchTask(
        this.plugin,
        query,
        {
          selectedText: ctx.selectedText || undefined,
          documentContent: ctx.documentContent || undefined,
          documentTitle: ctx.documentTitle || undefined,
          documentPath: ctx.documentPath || undefined,
        }
      );
      this.currentTask = task;
      this.syncPhaseFromTask(task);
      this.startPolling();
    } catch (err) {
      this.showError(
        err instanceof Error ? err.message : "创建研究任务失败"
      );
    }
  }

  private async doConfirm(): Promise<void> {
    if (!this.currentTask) return;
    try {
      const task = await confirmResearchTask(
        this.plugin,
        this.currentTask.id
      );
      this.currentTask = task;
      this.syncPhaseFromTask(task);
      this.startPolling();
    } catch (err) {
      this.showError(
        err instanceof Error ? err.message : "确认计划失败"
      );
    }
  }

  private async doCancel(): Promise<void> {
    if (!this.currentTask) return;
    this.stopPolling();
    try {
      const task = await cancelResearchTask(
        this.plugin,
        this.currentTask.id
      );
      this.currentTask = task;
      await this.refreshServiceStatus();
      this.syncPhaseFromTask(task);
    } catch (err) {
      this.showError(
        err instanceof Error ? err.message : "取消任务失败"
      );
    }
  }

  /* ── Polling ── */

  private startPolling(): void {
    this.stopPolling();
    if (
      this.phase !== "drafting_plan" &&
      this.phase !== "awaiting_confirmation" &&
      this.phase !== "running" &&
      this.phase !== "synthesizing"
    ) {
      return;
    }
    this.pollTimer = setInterval(() => this.pollTask(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollTask(): Promise<void> {
    if (!this.currentTask) {
      this.stopPolling();
      return;
    }

    try {
      const task = await getResearchTask(
        this.plugin,
        this.currentTask.id
      );
      this.currentTask = task;
      if (this.plugin.settings.serviceMode === "control_plane" && isTerminalStatus(task.status)) {
        await this.refreshServiceStatus();
      }
      this.syncPhaseFromTask(task);

      if (isTerminalStatus(task.status)) {
        this.stopPolling();
      }
    } catch (err) {
      this.stopPolling();
      this.showError(
        err instanceof Error ? err.message : "获取任务状态失败"
      );
    }
  }

  /* ── State Management ── */

  private syncPhaseFromTask(task: ResearchTask): void {
    const statusToPhase: Record<ResearchTaskStatus, ViewPhase> = {
      idle: "idle",
      drafting_plan: "drafting_plan",
      awaiting_confirmation: "awaiting_confirmation",
      running: "running",
      synthesizing: "synthesizing",
      completed: "completed",
      failed: "failed",
      cancelled: "cancelled",
    };
    this.setPhase(statusToPhase[task.status] || "error");
  }

  private setPhase(phase: ViewPhase): void {
    this.phase = phase;
    this.renderBody();
  }

  private showError(message: string): void {
    this.currentError = message;
    this.setPhase("error");
  }

  private resetToIdle(): void {
    this.stopPolling();
    this.currentTask = null;
    this.currentError = null;
    this.lastExportPath = null;
    this.inputEl.value = "";
    this.setPhase("idle");
    this.inputEl.focus();
  }

  /* ── Rendering ── */

  private renderBody(): void {
    if (!this.bodyEl) return;
    this.bodyEl.empty();

    switch (this.phase) {
      case "idle":
        this.renderIdle();
        break;
      case "drafting_plan":
        this.renderDraftingPlan();
        break;
      case "awaiting_confirmation":
        this.renderAwaitingConfirmation();
        break;
      case "running":
      case "synthesizing":
        this.renderRunning();
        break;
      case "completed":
        this.renderCompleted();
        break;
      case "failed":
        this.renderFailed();
        break;
      case "cancelled":
        this.renderCancelled();
        break;
      case "error":
        this.renderError();
        break;
    }
  }

  private renderIdle(): void {
    const idle = this.bodyEl.createDiv({ cls: "dr-idle" });
    const iconEl = idle.createDiv({ cls: "dr-idle-icon" });
    setIcon(iconEl, "microscope");
    idle.createEl("p", {
      cls: "dr-idle-text",
      text: "输入问题，对选中内容或当前文档发起深度研究",
    });
    const tips = idle.createDiv({ cls: "dr-idle-tips" });
    tips.createEl("p", { text: "🔬 适合深度研究的问题：" });
    const ul = tips.createEl("ul");
    ul.createEl("li", { text: "这段论述的核心依据是否充分？" });
    ul.createEl("li", { text: "该领域当前有哪些主要争议？" });
    ul.createEl("li", { text: "这些数据的来源和时效性如何？" });
  }

  private renderDraftingPlan(): void {
    const el = this.bodyEl.createDiv({ cls: "dr-drafting" });
    const spinner = el.createDiv({ cls: "dr-spinner" });
    for (let i = 0; i < 3; i++) spinner.createDiv({ cls: "dr-spinner-dot" });
    el.createEl("p", { cls: "dr-status-text", text: "正在生成研究计划…" });
    const skeleton = el.createDiv({ cls: "dr-skeleton" });
    for (let i = 0; i < 3; i++) skeleton.createDiv({ cls: "dr-skeleton-line" });
  }

  private renderAwaitingConfirmation(): void {
    const task = this.currentTask;
    if (!task?.plan) return;

    const el = this.bodyEl.createDiv({ cls: "dr-plan" });

    /* Plan header */
    const planHeader = el.createDiv({ cls: "dr-plan-header" });
    const planIcon = planHeader.createSpan({ cls: "dr-plan-icon" });
    setIcon(planIcon, "clipboard-list");
    planHeader.createSpan({ cls: "dr-plan-title", text: "研究计划" });

    /* Objective */
    const objSection = el.createDiv({ cls: "dr-plan-section" });
    objSection.createDiv({ cls: "dr-plan-label", text: "🎯 研究目标" });
    objSection.createDiv({
      cls: "dr-plan-objective",
      text: task.plan.objective,
    });

    /* Subquestions */
    if (task.plan.subquestions?.length > 0) {
      const subSection = el.createDiv({ cls: "dr-plan-section" });
      subSection.createDiv({ cls: "dr-plan-label", text: "❓ 子问题" });
      const subList = subSection.createEl("ol", { cls: "dr-plan-list" });
      for (const q of task.plan.subquestions) {
        subList.createEl("li", { text: q });
      }
    }

    /* Source strategy */
    if (task.plan.sourceStrategy?.length > 0) {
      const stratSection = el.createDiv({ cls: "dr-plan-section" });
      stratSection.createDiv({ cls: "dr-plan-label", text: "📚 检索策略" });
      const stratList = stratSection.createEl("ul", { cls: "dr-plan-list" });
      for (const s of task.plan.sourceStrategy) {
        stratList.createEl("li", { text: s });
      }
    }

    /* Notes */
    if (task.plan.notes?.length) {
      const noteSection = el.createDiv({ cls: "dr-plan-section" });
      noteSection.createDiv({ cls: "dr-plan-label", text: "📝 备注" });
      for (const n of task.plan.notes) {
        noteSection.createDiv({ cls: "dr-plan-note", text: n });
      }
    }

    /* Action buttons */
    const actions = el.createDiv({ cls: "dr-plan-actions" });

    const confirmBtn = actions.createEl("button", {
      cls: "dr-btn-confirm",
      text: "开始研究",
    });
    const confirmIcon = confirmBtn.createSpan();
    setIcon(confirmIcon, "play");
    confirmBtn.addEventListener("click", () => this.doConfirm());

    const cancelBtn = actions.createEl("button", {
      cls: "dr-btn-cancel",
      text: "取消",
    });
    const cancelIcon = cancelBtn.createSpan();
    setIcon(cancelIcon, "x");
    cancelBtn.addEventListener("click", () => this.doCancel());
  }

  private renderRunning(): void {
    const task = this.currentTask;
    const el = this.bodyEl.createDiv({ cls: "dr-running" });

    /* Progress bar */
    const progressWrap = el.createDiv({ cls: "dr-progress-wrap" });
    const progressBar = progressWrap.createDiv({ cls: "dr-progress-bar" });
    const progressFill = progressBar.createDiv({ cls: "dr-progress-fill" });
    const pct = task?.progress?.progressPercent ?? 20;
    progressFill.style.width = `${pct}%`;
    progressWrap.createDiv({
      cls: "dr-progress-pct",
      text: `${pct}%`,
    });

    /* Step label */
    const stepLabel = task?.progress?.currentStepLabel || (
      this.phase === "synthesizing" ? "正在生成研究摘要" : "研究执行中"
    );
    el.createEl("p", { cls: "dr-status-text", text: stepLabel });

    /* Stats */
    if (task?.progress) {
      const stats = el.createDiv({ cls: "dr-stats" });
      if (task.progress.fetchedCount !== undefined) {
        stats.createSpan({ text: `📥 ${task.progress.fetchedCount} 条获取` });
      }
      if (task.progress.parsedCount !== undefined) {
        stats.createSpan({ text: `📄 ${task.progress.parsedCount} 条解析` });
      }
      if ((task.progress.failedCount ?? 0) > 0) {
        stats.createSpan({
          cls: "dr-stat-warning",
          text: `⚠️ ${task.progress.failedCount} 条失败`,
        });
      }
    }

    /* Cancel button */
    const actions = el.createDiv({ cls: "dr-running-actions" });
    const refreshBtn = actions.createEl("button", {
      cls: "dr-btn-cancel-sm",
      text: "刷新状态",
    });
    refreshBtn.addEventListener("click", () => this.pollTask());
    const cancelBtn = actions.createEl("button", {
      cls: "dr-btn-cancel-sm",
      text: "取消研究",
    });
    cancelBtn.addEventListener("click", () => this.doCancel());
  }

  /* ── Export ── */

  private async doExport(): Promise<void> {
    if (!this.currentTask) return;
    try {
      const result = await exportResearchMarkdown(
        this.plugin,
        this.currentTask.id
      );
      this.lastExportPath = result.filePath;
      new Notice(`报告已导出`);
      this.renderBody();
    } catch (err) {
      this.lastExportPath = null;
      new Notice(
        `导出失败：${err instanceof Error ? err.message : "未知错误"}`
      );
    }
  }

  private openExportedFile(): void {
    if (!this.lastExportPath) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    electron.shell.openPath(this.lastExportPath);
  }

  private showInFinder(): void {
    if (!this.lastExportPath) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    electron.shell.showItemInFolder(this.lastExportPath);
  }

  /* ── Completed / Report Reading View ── */

  private renderCompleted(): void {
    const task = this.currentTask;
    const report = task?.result;
    if (!report) return;

    const el = this.bodyEl.createDiv({ cls: "dr-completed" });

    /* ── Report Header ── */
    const reportHeader = el.createDiv({ cls: "dr-report-header" });
    reportHeader.createDiv({ cls: "dr-badge-success", text: "✅ 研究完成" });
    reportHeader.createDiv({
      cls: "dr-report-query",
      text: report.query,
    });
    if (report.objective) {
      reportHeader.createDiv({
        cls: "dr-report-objective",
        text: report.objective,
      });
    }

    /* ── Action Bar ── */
    const actionBar = el.createDiv({ cls: "dr-report-action-bar" });

    if (this.lastExportPath) {
      /* Export success state */
      const successRow = actionBar.createDiv({ cls: "dr-export-success" });
      const checkIcon = successRow.createSpan({ cls: "dr-export-success-icon" });
      setIcon(checkIcon, "check-circle");
      successRow.createSpan({ cls: "dr-export-success-text", text: "已导出" });

      const pathRow = actionBar.createDiv({ cls: "dr-export-path-row" });
      const basename = this.lastExportPath.split("/").pop() || this.lastExportPath;
      pathRow.createSpan({ cls: "dr-export-path", text: basename });

      const btnGroup = actionBar.createDiv({ cls: "dr-export-btn-group" });

      const openBtn = btnGroup.createEl("button", { cls: "dr-export-open-btn" });
      const openIcon = openBtn.createSpan({ cls: "dr-export-icon" });
      setIcon(openIcon, "file-text");
      openBtn.createSpan({ text: "打开文件" });
      openBtn.addEventListener("click", () => this.openExportedFile());

      const folderBtn = btnGroup.createEl("button", { cls: "dr-export-folder-btn" });
      const folderIcon = folderBtn.createSpan({ cls: "dr-export-icon" });
      setIcon(folderIcon, "folder-open");
      folderBtn.createSpan({ text: "打开目录" });
      folderBtn.addEventListener("click", () => this.showInFinder());
    } else if (this.plugin.settings.serviceMode !== "control_plane") {
      /* Export button */
      const exportBtn = actionBar.createEl("button", {
        cls: "dr-export-btn",
      });
      const exportIcon = exportBtn.createSpan({ cls: "dr-export-icon" });
      setIcon(exportIcon, "download");
      exportBtn.createSpan({ text: "导出 Markdown" });
      exportBtn.addEventListener("click", () => this.doExport());
    } else {
      actionBar.createDiv({
        cls: "dr-export-success-text",
        text: "服务模式下暂不提供客户端直接导出",
      });
    }

    const newBtn = actionBar.createEl("button", {
      cls: "dr-action-btn",
    });
    const newIcon = newBtn.createSpan();
    setIcon(newIcon, "refresh-cw");
    newBtn.createSpan({ text: " 新研究" });
    newBtn.addEventListener("click", () => this.resetToIdle());

    /* ── Executive Summary ── */
    if (report.executiveSummary) {
      const sumSection = el.createDiv({ cls: "dr-section" });
      sumSection.createDiv({ cls: "dr-section-label", text: "📍 执行摘要" });
      sumSection.createDiv({
        cls: "dr-summary-block",
        text: report.executiveSummary,
      });
    }

    /* ── Key Findings ── */
    if (report.keyFindings?.length > 0) {
      const findSection = el.createDiv({ cls: "dr-section" });
      findSection.createDiv({
        cls: "dr-section-label",
        text: "🔑 关键发现",
      });
      const findList = findSection.createEl("ul", { cls: "dr-findings-list" });
      for (const f of report.keyFindings) {
        findList.createEl("li", { text: f });
      }
    }

    /* ── Controversies ── */
    if (report.controversies?.length > 0) {
      const conSection = el.createDiv({ cls: "dr-section" });
      conSection.createDiv({
        cls: "dr-section-label",
        text: "⚡ 争议点",
      });
      for (const c of report.controversies) {
        conSection.createDiv({ cls: "dr-controversy-block", text: c });
      }
    }

    /* ── Uncertainties ── */
    if (report.uncertainties?.length > 0) {
      const uncSection = el.createDiv({ cls: "dr-section" });
      uncSection.createDiv({
        cls: "dr-section-label",
        text: "⚠️ 不确定项",
      });
      for (const u of report.uncertainties) {
        uncSection.createDiv({ cls: "dr-uncertainty-block", text: u });
      }
    }

    /* ── Evidence Items ── */
    if (report.evidenceItems?.length > 0) {
      const evSection = el.createDiv({ cls: "dr-section" });
      evSection.createDiv({
        cls: "dr-section-label",
        text: `🔗 来源与证据 (${report.evidenceItems.length})`,
      });
      for (const ev of report.evidenceItems) {
        this.renderEvidenceCard(evSection, ev);
      }
    }

    /* ── Recommendations ── */
    if (report.recommendations?.length) {
      const recSection = el.createDiv({ cls: "dr-section" });
      recSection.createDiv({
        cls: "dr-section-label",
        text: "💡 建议",
      });
      const recList = recSection.createEl("ul", { cls: "dr-findings-list" });
      for (const r of report.recommendations) {
        recList.createEl("li", { text: r });
      }
    }

    /* ── Meta Info ── */
    if (report.generatedAt) {
      const metaSection = el.createDiv({ cls: "dr-report-meta" });
      const date = new Date(report.generatedAt);
      metaSection.createSpan({
        cls: "dr-meta-text",
        text: `生成时间：${date.toLocaleString("zh-CN")}`,
      });
      if (task?.id) {
        metaSection.createSpan({
          cls: "dr-meta-text",
          text: `任务 ID：${task.id.slice(0, 8)}`,
        });
      }
    }
  }

  /* ── Evidence Card ── */

  private renderEvidenceCard(
    parent: HTMLElement,
    ev: EvidenceItem
  ): void {
    const card = parent.createDiv({ cls: "dr-evidence-card" });
    const cardHeader = card.createDiv({ cls: "dr-evidence-header" });

    const typeIcon = cardHeader.createSpan({ cls: "dr-evidence-type-icon" });
    const iconName = ev.sourceType === "web" ? "globe" : ev.sourceType === "note" ? "sticky-note" : "file-text";
    setIcon(typeIcon, iconName);
    cardHeader.createSpan({ cls: "dr-evidence-title", text: ev.title });

    /* Time sensitivity badge */
    if (ev.timeSensitivity) {
      const badgeCls = `dr-ts-badge dr-ts-${ev.timeSensitivity}`;
      const labels: Record<string, string> = { low: "低敏感", medium: "中敏感", high: "高敏感" };
      cardHeader.createSpan({ cls: badgeCls, text: labels[ev.timeSensitivity] || ev.timeSensitivity });
    }

    const expandIcon = cardHeader.createSpan({ cls: "dr-evidence-expand" });
    setIcon(expandIcon, "chevron-down");

    const cardBody = card.createDiv({ cls: "dr-evidence-body" });
    cardBody.style.display = "none";

    /* Snippet */
    if (ev.snippet) {
      cardBody.createDiv({ cls: "dr-evidence-snippet", text: ev.snippet });
    }

    /* Credibility note */
    if (ev.credibilityNote) {
      cardBody.createDiv({ cls: "dr-evidence-cred", text: ev.credibilityNote });
    }

    /* Claims support/conflict */
    if (ev.supportsClaims?.length) {
      const claimEl = cardBody.createDiv({ cls: "dr-evidence-claims" });
      for (const c of ev.supportsClaims) {
        claimEl.createDiv({ cls: "dr-claim-support", text: `✅ ${c}` });
      }
    }
    if (ev.conflictsWithClaims?.length) {
      const claimEl = cardBody.createDiv({ cls: "dr-evidence-claims" });
      for (const c of ev.conflictsWithClaims) {
        claimEl.createDiv({ cls: "dr-claim-conflict", text: `❌ ${c}` });
      }
    }

    /* Locator: clickable URL */
    if (ev.locator?.url) {
      const urlRow = cardBody.createDiv({ cls: "dr-evidence-url-row" });
      const urlIcon = urlRow.createSpan({ cls: "dr-evidence-url-icon" });
      setIcon(urlIcon, "external-link");
      const linkEl = urlRow.createEl("a", {
        cls: "dr-evidence-url",
        text: ev.locator.url,
        href: ev.locator.url,
      });
      linkEl.setAttr("target", "_blank");
      linkEl.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(ev.locator!.url!, "_blank");
      });
    }

    /* Locator: filePath */
    if (ev.locator?.filePath) {
      cardBody.createDiv({
        cls: "dr-evidence-path",
        text: `📂 ${ev.locator.filePath}`,
      });
    }

    /* Published date */
    if (ev.publishedAt) {
      cardBody.createDiv({
        cls: "dr-evidence-date",
        text: `📅 发布于 ${ev.publishedAt}`,
      });
    }

    cardHeader.addEventListener("click", () => {
      const isOpen = cardBody.style.display !== "none";
      cardBody.style.display = isOpen ? "none" : "block";
      expandIcon.empty();
      setIcon(expandIcon, isOpen ? "chevron-down" : "chevron-up");
    });
  }

  private renderFailed(): void {
    const task = this.currentTask;
    const el = this.bodyEl.createDiv({ cls: "dr-failed" });
    const iconEl = el.createDiv({ cls: "dr-failed-icon" });
    setIcon(iconEl, "alert-triangle");

    const msg = task?.error?.message || "研究任务执行失败";
    el.createEl("p", { cls: "dr-failed-text", text: msg });

    if (task?.error?.retryable) {
      el.createEl("p", {
        cls: "dr-failed-hint",
        text: "此错误可重试",
      });
    }

    const actions = el.createDiv({ cls: "dr-actions" });
    const retryBtn = actions.createEl("button", {
      cls: "dr-action-btn dr-action-retry",
      text: "重试",
    });
    retryBtn.addEventListener("click", () => this.startResearch());

    const newBtn = actions.createEl("button", {
      cls: "dr-action-btn",
      text: "新研究",
    });
    const newIcon = newBtn.createSpan();
    setIcon(newIcon, "refresh-cw");
    newBtn.addEventListener("click", () => this.resetToIdle());
  }

  private renderCancelled(): void {
    const el = this.bodyEl.createDiv({ cls: "dr-cancelled" });
    const iconEl = el.createDiv({ cls: "dr-cancelled-icon" });
    setIcon(iconEl, "circle-off");
    el.createEl("p", { cls: "dr-cancelled-text", text: "任务已取消" });

    const actions = el.createDiv({ cls: "dr-actions" });
    const newBtn = actions.createEl("button", {
      cls: "dr-action-btn",
      text: "重新发起",
    });
    const newIcon = newBtn.createSpan();
    setIcon(newIcon, "refresh-cw");
    newBtn.addEventListener("click", () => this.resetToIdle());
  }

  private renderError(): void {
    const el = this.bodyEl.createDiv({ cls: "dr-error" });
    const iconEl = el.createDiv({ cls: "dr-error-icon" });
    setIcon(iconEl, "alert-triangle");
    el.createEl("p", {
      cls: "dr-error-text",
      text: this.currentError || "发生未知错误",
    });
    const retryBtn = el.createEl("button", {
      cls: "dr-action-btn dr-action-retry",
      text: "重试",
    });
    retryBtn.addEventListener("click", () => this.startResearch());
  }
}
