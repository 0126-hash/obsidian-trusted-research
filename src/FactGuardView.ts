import { WorkspaceLeaf, setIcon } from "obsidian";
import type ResearchReportPlugin from "./main";
import { QuickCheckView } from "./QuickCheckView";
import type { QuickCheckResult } from "./services/quickCheckService";
import {
  callFactGuard,
  type FactGuardEvidenceItem,
  type FactGuardResult,
} from "./services/factGuardService";

export const FACT_GUARD_VIEW_TYPE = "fact-guard-view";

export class FactGuardView extends QuickCheckView {
  constructor(leaf: WorkspaceLeaf, plugin: ResearchReportPlugin) {
    super(leaf, plugin);
  }

  getViewType(): string {
    return FACT_GUARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Fact Guard";
  }

  getIcon(): string {
    return "shield";
  }

  async onOpen(): Promise<void> {
    await super.onOpen();
    const container = this.containerEl.children[1] as HTMLElement | undefined;
    if (container) {
      const titleText = container.querySelector(".qc-title-text") as HTMLElement | null;
      if (titleText) titleText.textContent = "Fact Guard";
      const titleSubtitle = container.querySelector(".qc-title-subtitle") as HTMLElement | null;
      if (titleSubtitle) titleSubtitle.textContent = "事实核查";
      const titleIcon = container.querySelector(".qc-title-icon") as HTMLElement | null;
      if (titleIcon) {
        titleIcon.textContent = "";
        setIcon(titleIcon, "shield");
      }
    }
    if (this.inputEl) {
      this.inputEl.placeholder = "输入你想核查的陈述，或直接使用当前选中文本…";
    }
    this.setViewState("idle");
  }

  protected renderServiceStatus(): void {
    if (!this.serviceStatusEl) return;
    this.serviceStatusEl.empty();
    const iconEl = this.serviceStatusEl.createSpan({ cls: "qc-ctx-icon" });
    if (this.plugin.settings.serviceMode !== "control_plane") {
      setIcon(iconEl, "plug");
      this.serviceStatusEl.createSpan({ cls: "qc-ctx-text", text: "当前为 Runtime 兼容模式" });
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
    const cap = this.plugin.getControlPlaneCapability("research.fact_guard");
    setIcon(iconEl, bootstrap.version?.upgradeRequired ? "alert-triangle" : "shield");
    this.serviceStatusEl.createSpan({
      cls: "qc-ctx-text",
      text: `服务模式 · ${bootstrap.user.planType}`,
    });
    if (cap?.quota?.remaining !== undefined && cap?.quota?.remaining !== null) {
      this.serviceStatusEl.createSpan({
        cls: "qc-ctx-doc",
        text: `· 剩余 ${cap.quota.remaining}`,
      });
    }
    if (bootstrap.version?.upgradeRequired) {
      this.serviceStatusEl.createSpan({
        cls: "qc-ctx-doc",
        text: "· 需要升级客户端",
      });
    }
  }

  protected async doQuickCheck(): Promise<void> {
    const ctx = this.getContext();
    const query = this.inputEl.value.trim() || ctx.selectedText || "";
    if (!query) {
      this.showError("请输入需要核查的陈述，或先选中一段文本");
      return;
    }
    if (this.plugin.settings.serviceMode === "control_plane") {
      await this.refreshServiceStatus();
      const cap = this.plugin.getControlPlaneCapability("research.fact_guard");
      if (cap?.enabled === false) {
        this.showError(cap.reason || "当前套餐暂不支持 Fact Guard");
        return;
      }
    }
    this.setViewState("loading");
    try {
      const result = await callFactGuard(this.plugin, query, {
        selectedText: ctx.selectedText || undefined,
        documentContent: ctx.documentContent || undefined,
        documentTitle: ctx.documentTitle || undefined,
        documentPath: ctx.documentPath || undefined,
      });
      this.currentResult = result as unknown as QuickCheckResult;
      await this.refreshServiceStatus();
      this.setViewState("result");
    } catch (err) {
      this.showError(err instanceof Error ? err.message : "未知错误，请重试");
    }
  }

  protected renderIdleState(): void {
    const idle = this.bodyEl.createDiv({ cls: "qc-idle" });
    const iconEl = idle.createDiv({ cls: "qc-idle-icon" });
    setIcon(iconEl, "shield");
    idle.createEl("p", {
      cls: "qc-idle-text",
      text: "输入一条需要核查的陈述，或直接使用当前选中文本进行事实核查",
    });
    const tips = idle.createDiv({ cls: "qc-idle-tips" });
    tips.createEl("p", { text: "💡 可以核查：" });
    const ul = tips.createEl("ul");
    ul.createEl("li", { text: "这段说法是否有事实依据？" });
    ul.createEl("li", { text: "这个结论是否与上下文冲突？" });
    ul.createEl("li", { text: "这里是否存在明显的夸大或误引？" });
  }

  private renderEvidenceSection(
    container: HTMLElement,
    label: string,
    items: (string | FactGuardEvidenceItem)[] | undefined
  ): void {
    if (!items?.length) return;
    const section = container.createDiv({ cls: "qc-section" });
    section.createDiv({ cls: "qc-section-label", text: label });
    const list = section.createDiv({ cls: "qc-evidence-stack" });
    for (const item of items) {
      if (typeof item === "string") {
        list.createDiv({ cls: "qc-uncertainty-block", text: item });
        continue;
      }
      if (item && typeof item === "object") {
        this.renderEvidenceCard(list, item);
      } else {
        list.createDiv({ cls: "qc-uncertainty-block", text: String(item) });
      }
    }
  }

  private renderEvidenceCard(parent: HTMLElement, item: FactGuardEvidenceItem): void {
    const card = parent.createDiv({ cls: "qc-source-card" });
    const cardHeader = card.createDiv({ cls: "qc-source-header" });

    const typeIcon = cardHeader.createSpan({ cls: "qc-source-type-icon" });
    setIcon(typeIcon, this.getEvidenceIcon(item.sourceType));

    const headerMain = cardHeader.createDiv({ cls: "qc-source-header-main" });
    headerMain.createSpan({
      cls: "qc-source-title",
      text: item.title || item.source || item.claim || "未命名证据",
    });

    const badgeRow = headerMain.createDiv({ cls: "qc-source-badges" });
    if (item.sourceType) {
      badgeRow.createSpan({
        cls: "qc-source-badge",
        text: this.getSourceTypeLabel(item.sourceType),
      });
    }
    if (item.timeSensitivity) {
      badgeRow.createSpan({
        cls: `qc-source-badge qc-source-badge-${item.timeSensitivity}`,
        text: this.getTimeSensitivityLabel(item.timeSensitivity),
      });
    }

    const expandIcon = cardHeader.createSpan({ cls: "qc-source-expand" });
    setIcon(expandIcon, "chevron-down");

    const cardBody = card.createDiv({ cls: "qc-source-body" });
    cardBody.style.display = "none";

    const snippet =
      item.snippet ||
      item.quote ||
      item.excerpt ||
      item.text ||
      item.content ||
      item.description ||
      item.claim ||
      "";
    if (snippet) {
      cardBody.createDiv({
        cls: "qc-source-snippet",
        text: snippet,
      });
    }

    if (item.credibilityNote) {
      cardBody.createDiv({
        cls: "qc-source-credibility",
        text: item.credibilityNote,
      });
    }

    if (item.supportsClaims?.length || item.conflictsWithClaims?.length) {
      const claimList = cardBody.createDiv({ cls: "qc-claim-list" });
      for (const claim of item.supportsClaims || []) {
        claimList.createSpan({
          cls: "qc-claim-chip qc-claim-chip-support",
          text: `支持: ${claim}`,
        });
      }
      for (const claim of item.conflictsWithClaims || []) {
        claimList.createSpan({
          cls: "qc-claim-chip qc-claim-chip-conflict",
          text: `冲突: ${claim}`,
        });
      }
    }

    const meta = cardBody.createDiv({ cls: "qc-source-meta" });
    if (item.locator?.url) {
      const urlRow = meta.createDiv({ cls: "qc-source-link-row" });
      const urlIcon = urlRow.createSpan({ cls: "qc-source-type-icon" });
      setIcon(urlIcon, "external-link");
      const linkEl = urlRow.createEl("a", {
        cls: "qc-source-link",
        text: item.locator.url,
        href: item.locator.url,
      });
      linkEl.setAttr("target", "_blank");
      linkEl.addEventListener("click", (event) => {
        event.preventDefault();
        window.open(item.locator?.url || "", "_blank");
      });
    }
    if (item.locator?.filePath) {
      meta.createDiv({
        cls: "qc-source-path",
        text: `📂 ${item.locator.filePath}`,
      });
    }
    if (item.locator?.section) {
      meta.createDiv({
        cls: "qc-source-path",
        text: `§ ${item.locator.section}`,
      });
    }
    if (item.publishedAt) {
      meta.createDiv({
        cls: "qc-source-date",
        text: `📅 发布于 ${item.publishedAt}`,
      });
    }
    if (item.retrievedAt) {
      meta.createDiv({
        cls: "qc-source-date",
        text: `🕒 抓取于 ${item.retrievedAt}`,
      });
    }

    cardHeader.addEventListener("click", () => {
      const isOpen = cardBody.style.display !== "none";
      cardBody.style.display = isOpen ? "none" : "block";
      expandIcon.empty();
      setIcon(expandIcon, isOpen ? "chevron-down" : "chevron-up");
    });
  }

  private getEvidenceIcon(sourceType?: string): string {
    switch (sourceType) {
      case "web":
        return "globe";
      case "note":
        return "sticky-note";
      case "manual":
        return "pen-tool";
      case "document":
      default:
        return "file-text";
    }
  }

  private getSourceTypeLabel(sourceType: string): string {
    switch (sourceType) {
      case "web":
        return "网页";
      case "note":
        return "笔记";
      case "manual":
        return "手工输入";
      case "document":
        return "文档";
      default:
        return sourceType;
    }
  }

  private getTimeSensitivityLabel(value: string): string {
    switch (value) {
      case "high":
        return "高时效";
      case "medium":
        return "中时效";
      case "low":
        return "低时效";
      default:
        return value;
    }
  }

  protected renderResultState(): void {
    if (!this.currentResult) return;
    const result = this.currentResult as unknown as FactGuardResult;
    const container = this.bodyEl.createDiv({ cls: "qc-result" });

    const verdictLabels: Record<string, string> = {
      supported: "支持",
      partially_supported: "部分支持",
      unsupported: "不支持",
      contradicted: "存在冲突",
      mixed: "存在争议",
      uncertain: "待确认",
    };
    const verdictText = verdictLabels[result.verdict as string] || result.verdict || "待确认";
    const badgeClass =
      result.verdict === "supported"
        ? "qc-badge-low"
        : result.verdict === "unsupported" || result.verdict === "contradicted"
          ? "qc-badge-high"
          : "qc-badge-medium";
    container.createDiv({ cls: `qc-badge ${badgeClass}`, text: `结论: ${verdictText}` });

    const claimSection = container.createDiv({ cls: "qc-section" });
    claimSection.createDiv({ cls: "qc-section-label", text: "📝 核查陈述" });
    claimSection.createDiv({ cls: "qc-conclusion", text: result.claim || "" });

    const rationaleSection = container.createDiv({ cls: "qc-section" });
    rationaleSection.createDiv({ cls: "qc-section-label", text: "📌 判断依据" });
    rationaleSection.createDiv({
      cls: "qc-conclusion",
      text: result.rationale || "模型未返回判断依据",
    });

    this.renderEvidenceSection(container, "✅ 支持证据", result.supportingEvidence);
    this.renderEvidenceSection(container, "⚠️ 反向证据", result.conflictingEvidence);
    this.renderEvidenceSection(container, "❓ 不确定项", result.uncertainties);

    const actions = container.createDiv({ cls: "qc-actions" });
    const newCheckBtn = actions.createEl("button", {
      cls: "qc-action-btn qc-action-new",
      text: "新核查",
    });
    const iconSpan = newCheckBtn.createSpan();
    setIcon(iconSpan, "refresh-cw");
    newCheckBtn.addEventListener("click", () => {
      this.inputEl.value = "";
      this.currentResult = null;
      this.setViewState("idle");
      this.inputEl.focus();
    });
  }
}
