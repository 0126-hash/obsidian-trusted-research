import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type ResearchReportPlugin from "./main";
import {
  callQuickCheck,
  type QuickCheckResult,
  type QuickCheckSource,
} from "./services/quickCheckService";

export const QUICK_CHECK_VIEW_TYPE = "quick-check-view";

type ViewState = "idle" | "loading" | "result" | "error";

export class QuickCheckView extends ItemView {
  private plugin: ResearchReportPlugin;
  private state: ViewState = "idle";
  private currentResult: QuickCheckResult | null = null;
  private currentError: string | null = null;

  /* DOM refs */
  private inputEl: HTMLTextAreaElement;
  private contextIndicatorEl: HTMLDivElement;
  private serviceStatusEl: HTMLDivElement;
  private sendBtnEl: HTMLButtonElement;
  private bodyEl: HTMLDivElement;

  constructor(leaf: WorkspaceLeaf, plugin: ResearchReportPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return QUICK_CHECK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Quick Check";
  }

  getIcon(): string {
    return "search-check";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("qc-container");

    /* ── Header ── */
    const header = container.createDiv({ cls: "qc-header" });
    const titleRow = header.createDiv({ cls: "qc-title-row" });
    const iconEl = titleRow.createSpan({ cls: "qc-title-icon" });
    setIcon(iconEl, "search-check");
    titleRow.createSpan({ cls: "qc-title-text", text: "Quick Check" });
    titleRow.createSpan({
      cls: "qc-title-subtitle",
      text: "可信核查",
    });

    /* ── Context Indicator ── */
    this.contextIndicatorEl = header.createDiv({ cls: "qc-context-indicator" });
    this.updateContextIndicator();
    this.serviceStatusEl = header.createDiv({ cls: "qc-context-indicator" });
    this.renderServiceStatus();
    void this.refreshServiceStatus();

    /* ── Input Area ── */
    const inputArea = container.createDiv({ cls: "qc-input-area" });
    this.inputEl = inputArea.createEl("textarea", {
      cls: "qc-input",
      attr: {
        placeholder: "输入你想核查的问题…",
        rows: "3",
      },
    });
    this.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.doQuickCheck();
      }
    });

    const btnRow = inputArea.createDiv({ cls: "qc-btn-row" });
    const hintEl = btnRow.createSpan({
      cls: "qc-send-hint",
      text: "⌘ + Enter",
    });
    this.sendBtnEl = btnRow.createEl("button", {
      cls: "qc-send-btn",
      text: "核查",
    });
    const sendIconEl = this.sendBtnEl.createSpan({ cls: "qc-send-icon" });
    setIcon(sendIconEl, "arrow-up");
    this.sendBtnEl.addEventListener("click", () => this.doQuickCheck());

    /* ── Body (result / loading / error) ── */
    this.bodyEl = container.createDiv({ cls: "qc-body" });
    this.renderBody();

    /* ── Register events for context updates ── */
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
    /* cleanup handled by Obsidian */
  }

  /* ── Context Indicator ── */

  private updateContextIndicator(): void {
    if (!this.contextIndicatorEl) return;
    this.contextIndicatorEl.empty();

    const { documentTitle, selectedText } = this.getContext();
    const iconEl = this.contextIndicatorEl.createSpan({ cls: "qc-ctx-icon" });

    if (selectedText) {
      setIcon(iconEl, "text-cursor-input");
      const charCount = selectedText.length;
      this.contextIndicatorEl.createSpan({
        cls: "qc-ctx-text",
        text: `已选中 ${charCount} 字`,
      });
      if (documentTitle) {
        this.contextIndicatorEl.createSpan({
          cls: "qc-ctx-doc",
          text: `· ${documentTitle}`,
        });
      }
    } else if (documentTitle) {
      setIcon(iconEl, "file-text");
      this.contextIndicatorEl.createSpan({
        cls: "qc-ctx-text",
        text: documentTitle,
      });
    } else {
      setIcon(iconEl, "alert-circle");
      this.contextIndicatorEl.createSpan({
        cls: "qc-ctx-text qc-ctx-empty",
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

    const iconEl = this.serviceStatusEl.createSpan({ cls: "qc-ctx-icon" });

    if (this.plugin.settings.serviceMode !== "control_plane") {
      setIcon(iconEl, "plug");
      this.serviceStatusEl.createSpan({
        cls: "qc-ctx-text",
        text: "当前为 Runtime 兼容模式",
      });
      return;
    }

    const bootstrap = this.plugin.controlPlaneBootstrap;
    if (!bootstrap) {
      setIcon(iconEl, "cloud-off");
      this.serviceStatusEl.createSpan({
        cls: "qc-ctx-text qc-ctx-empty",
        text: this.plugin.controlPlaneBootstrapError || "Control Plane 未连接",
      });
      return;
    }

    const capability = this.plugin.getControlPlaneCapability("research.quick_check");
    setIcon(iconEl, bootstrap.version?.upgradeRequired ? "alert-triangle" : "cloud");
    this.serviceStatusEl.createSpan({
      cls: "qc-ctx-text",
      text: `服务模式 · ${bootstrap.user.planType}`,
    });
    if (capability?.quota?.remaining !== undefined && capability?.quota?.remaining !== null) {
      this.serviceStatusEl.createSpan({
        cls: "qc-ctx-doc",
        text: `· 剩余 ${capability.quota.remaining}`,
      });
    }
    if (bootstrap.version?.upgradeRequired) {
      this.serviceStatusEl.createSpan({
        cls: "qc-ctx-doc",
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

    const selectedText = editor?.getSelection()?.trim() || "";
    const documentContent = editor?.getValue() || "";
    const documentTitle = activeFile?.basename || "";
    const documentPath = activeFile?.path || "";

    return { selectedText, documentContent, documentTitle, documentPath };
  }

  /* ── Quick Check Action ── */

  private async doQuickCheck(): Promise<void> {
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
      const capability = this.plugin.getControlPlaneCapability("research.quick_check");
      if (capability?.enabled === false) {
        this.showError(capability.reason || "当前套餐暂不支持 Quick Check");
        return;
      }
    }

    this.setViewState("loading");

    try {
      const result = await callQuickCheck(
        this.plugin,
        query,
        {
          selectedText: ctx.selectedText || undefined,
          documentContent: ctx.documentContent || undefined,
          documentTitle: ctx.documentTitle || undefined,
          documentPath: ctx.documentPath || undefined,
        }
      );
      this.currentResult = result;
      await this.refreshServiceStatus();
      this.setViewState("result");
    } catch (err) {
      this.showError(
        err instanceof Error ? err.message : "未知错误，请重试"
      );
    }
  }

  /* ── State Management ── */

  private setViewState(state: ViewState): void {
    this.state = state;
    this.renderBody();
  }

  private showError(message: string): void {
    this.currentError = message;
    this.setViewState("error");
  }

  /* ── Rendering ── */

  private renderBody(): void {
    if (!this.bodyEl) return;
    this.bodyEl.empty();

    switch (this.state) {
      case "idle":
        this.renderIdleState();
        break;
      case "loading":
        this.renderLoadingState();
        break;
      case "result":
        this.renderResultState();
        break;
      case "error":
        this.renderErrorState();
        break;
    }
  }

  private renderIdleState(): void {
    const idle = this.bodyEl.createDiv({ cls: "qc-idle" });
    const iconEl = idle.createDiv({ cls: "qc-idle-icon" });
    setIcon(iconEl, "search");
    idle.createEl("p", {
      cls: "qc-idle-text",
      text: "输入问题，核查当前文档或选中内容的可信度",
    });
    const tips = idle.createDiv({ cls: "qc-idle-tips" });
    tips.createEl("p", { text: "💡 可以问：" });
    const ul = tips.createEl("ul");
    ul.createEl("li", { text: "这段表述是否有事实依据？" });
    ul.createEl("li", { text: "这个数据引用准确吗？" });
    ul.createEl("li", { text: "这段论述是否有已知争议？" });
  }

  private renderLoadingState(): void {
    const loading = this.bodyEl.createDiv({ cls: "qc-loading" });
    const spinner = loading.createDiv({ cls: "qc-spinner" });
    for (let i = 0; i < 3; i++) {
      spinner.createDiv({ cls: "qc-spinner-dot" });
    }
    loading.createEl("p", { cls: "qc-loading-text", text: "正在核查中…" });

    /* shimmer skeleton */
    const skeleton = loading.createDiv({ cls: "qc-skeleton" });
    for (let i = 0; i < 4; i++) {
      skeleton.createDiv({ cls: "qc-skeleton-line" });
    }
  }

  private renderResultState(): void {
    if (!this.currentResult) return;
    const r = this.currentResult;

    const result = this.bodyEl.createDiv({ cls: "qc-result" });

    /* Time sensitivity badge */
    if (r.timeSensitivity) {
      const badgeClass =
        r.timeSensitivity === "high"
          ? "qc-badge-high"
          : r.timeSensitivity === "medium"
          ? "qc-badge-medium"
          : "qc-badge-low";
      result.createDiv({
        cls: `qc-badge ${badgeClass}`,
        text: `时效性: ${
          r.timeSensitivity === "high"
            ? "⚡ 高"
            : r.timeSensitivity === "medium"
            ? "📅 中"
            : "🟢 低"
        }`,
      });
    }

    /* Conclusion */
    const conclusionSection = result.createDiv({ cls: "qc-section" });
    conclusionSection.createDiv({ cls: "qc-section-label", text: "📍 结论" });
    conclusionSection.createDiv({
      cls: "qc-conclusion",
      text: r.conclusion,
    });

    /* Key Evidence */
    if (r.keyEvidence?.length > 0) {
      const evidenceSection = result.createDiv({ cls: "qc-section" });
      evidenceSection.createDiv({
        cls: "qc-section-label",
        text: "📋 关键证据",
      });
      const list = evidenceSection.createEl("ul", { cls: "qc-evidence-list" });
      for (const item of r.keyEvidence) {
        list.createEl("li", { text: item });
      }
    }

    /* Uncertainties */
    if (r.uncertainties?.length > 0) {
      const uncSection = result.createDiv({ cls: "qc-section" });
      uncSection.createDiv({
        cls: "qc-section-label",
        text: "⚠️ 不确定项",
      });
      for (const item of r.uncertainties) {
        uncSection.createDiv({ cls: "qc-uncertainty-block", text: item });
      }
    }

    /* Sources */
    if (r.sources?.length > 0) {
      const srcSection = result.createDiv({ cls: "qc-section" });
      srcSection.createDiv({
        cls: "qc-section-label",
        text: "🔗 来源",
      });
      for (const source of r.sources) {
        this.renderSourceCard(srcSection, source);
      }
    }

    /* Confidence Note */
    if (r.confidenceNote) {
      result.createDiv({
        cls: "qc-confidence-note",
        text: `可信度: ${r.confidenceNote}`,
      });
    }

    /* Action buttons */
    const actions = result.createDiv({ cls: "qc-actions" });
    const newCheckBtn = actions.createEl("button", {
      cls: "qc-action-btn qc-action-new",
      text: "新核查",
    });
    const newCheckIcon = newCheckBtn.createSpan();
    setIcon(newCheckIcon, "refresh-cw");
    newCheckBtn.addEventListener("click", () => {
      this.inputEl.value = "";
      this.currentResult = null;
      this.setViewState("idle");
      this.inputEl.focus();
    });
  }

  private renderSourceCard(parent: HTMLElement, source: QuickCheckSource): void {
    const card = parent.createDiv({ cls: "qc-source-card" });

    const cardHeader = card.createDiv({ cls: "qc-source-header" });
    const typeIcon = cardHeader.createSpan({ cls: "qc-source-type-icon" });
    setIcon(
      typeIcon,
      source.sourceType === "document" ? "file-text" : "globe"
    );
    cardHeader.createSpan({
      cls: "qc-source-title",
      text: source.title,
    });
    const expandIcon = cardHeader.createSpan({ cls: "qc-source-expand" });
    setIcon(expandIcon, "chevron-down");

    const cardBody = card.createDiv({ cls: "qc-source-body" });
    cardBody.style.display = "none";

    if (source.snippet) {
      cardBody.createDiv({
        cls: "qc-source-snippet",
        text: source.snippet,
      });
    }
    if (source.credibilityNote) {
      cardBody.createDiv({
        cls: "qc-source-credibility",
        text: source.credibilityNote,
      });
    }
    if (source.locator?.filePath) {
      cardBody.createDiv({
        cls: "qc-source-path",
        text: `📂 ${source.locator.filePath}`,
      });
    }

    /* Toggle expand */
    cardHeader.addEventListener("click", () => {
      const isOpen = cardBody.style.display !== "none";
      cardBody.style.display = isOpen ? "none" : "block";
      expandIcon.empty();
      setIcon(expandIcon, isOpen ? "chevron-down" : "chevron-up");
    });
  }

  private renderErrorState(): void {
    const error = this.bodyEl.createDiv({ cls: "qc-error" });
    const iconEl = error.createDiv({ cls: "qc-error-icon" });
    setIcon(iconEl, "alert-triangle");
    error.createEl("p", {
      cls: "qc-error-text",
      text: this.currentError || "发生未知错误",
    });
    const retryBtn = error.createEl("button", {
      cls: "qc-action-btn qc-action-retry",
      text: "重试",
    });
    retryBtn.addEventListener("click", () => {
      this.doQuickCheck();
    });
  }
}
