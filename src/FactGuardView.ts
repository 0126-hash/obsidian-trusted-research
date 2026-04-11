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
    const list = section.createEl("ul", { cls: "qc-evidence-list" });
    for (const item of items) {
      let displayText: string;
      if (typeof item === "string") {
        displayText = item;
      } else if (item && typeof item === "object") {
        const title = item.title || item.source || "";
        const body =
          item.snippet ||
          item.quote ||
          item.excerpt ||
          item.text ||
          item.content ||
          item.credibilityNote ||
          item.description ||
          item.claim ||
          "";
        displayText =
          title && body ? `${title} — ${body}` : body || title || JSON.stringify(item);
      } else {
        displayText = String(item);
      }
      list.createEl("li", { text: displayText });
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
