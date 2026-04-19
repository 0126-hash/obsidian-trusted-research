import { Plugin, Notice, WorkspaceLeaf, Menu, Editor } from "obsidian";
import { DEFAULT_SETTINGS, type ResearchReportSettings } from "./settings";
import { ResearchReportSettingTab } from "./ResearchReportSettingTab";
import { QuickCheckView, QUICK_CHECK_VIEW_TYPE } from "./QuickCheckView";
import { FactGuardView, FACT_GUARD_VIEW_TYPE } from "./FactGuardView";
import { DeepResearchView, DEEP_RESEARCH_VIEW_TYPE } from "./DeepResearchView";
import {
  ensureControlPlaneBootstrap,
  getCapabilityFromBootstrap,
  type ControlPlaneBootstrap,
  type ControlPlaneCapability,
} from "./services/controlPlaneService";

export default class ResearchReportPlugin extends Plugin {
  settings: ResearchReportSettings;
  controlPlaneBootstrap: ControlPlaneBootstrap | null = null;
  controlPlaneBootstrapError: string | null = null;
  controlPlaneSession = {
    accessToken: "",
    refreshToken: "",
  };
  private controlPlaneBootstrapPromise: Promise<ControlPlaneBootstrap | null> | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ResearchReportSettingTab(this.app, this));
    void this.refreshControlPlaneBootstrap(true);

    /* ── Quick Check View ── */
    this.registerView(
      QUICK_CHECK_VIEW_TYPE,
      (leaf) => new QuickCheckView(leaf, this)
    );

    this.addRibbonIcon("search-check", "Quick Check · 可信核查", () => {
      this.activateQuickCheckView();
    });

    this.addCommand({
      id: "open-quick-check",
      name: "打开 Quick Check 可信核查",
      callback: () => this.activateQuickCheckView(),
    });

    /* ── Fact Guard View ── */
    this.registerView(
      FACT_GUARD_VIEW_TYPE,
      (leaf) => new FactGuardView(leaf, this)
    );

    this.addRibbonIcon("shield", "Fact Guard · 事实核查", () => {
      this.activateFactGuardView();
    });

    this.addCommand({
      id: "open-fact-guard",
      name: "打开 Fact Guard 事实核查",
      callback: () => this.activateFactGuardView(),
    });

    /* ── Deep Research View ── */
    this.registerView(
      DEEP_RESEARCH_VIEW_TYPE,
      (leaf) => new DeepResearchView(leaf, this)
    );

    this.addRibbonIcon("microscope", "Deep Research · 深度研究", () => {
      this.activateDeepResearchView();
    });

    this.addCommand({
      id: "open-deep-research",
      name: "打开 Deep Research 深度研究",
      callback: () => this.activateDeepResearchView(),
    });

    this.addCommand({
      id: "start-deep-research-selection",
      name: "对选中内容发起深度研究",
      editorCallback: (editor: Editor) => {
        const selection = editor.getSelection()?.trim();
        if (!selection) {
          new Notice("请先选中一段文本");
          return;
        }
        this.activateDeepResearchView(selection);
      },
    });

    /* ── Right-click menu ── */
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
        const selection = editor.getSelection()?.trim();
        if (selection) {
          menu.addItem((item) => {
            item
              .setTitle("🔬 深度研究")
              .setIcon("microscope")
              .onClick(() => {
                this.activateDeepResearchView(selection);
              });
          });
        }
      })
    );

  }

  async activateQuickCheckView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(QUICK_CHECK_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: QUICK_CHECK_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async activateFactGuardView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(FACT_GUARD_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: FACT_GUARD_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async activateDeepResearchView(query?: string): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(DEEP_RESEARCH_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: DEEP_RESEARCH_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
      if (query) {
        const view = leaf.view;
        if (view instanceof DeepResearchView) {
          view.startWithQuery(query);
        }
      }
    }
  }

  onunload() {}

  async refreshControlPlaneBootstrap(silent = false): Promise<ControlPlaneBootstrap | null> {
    if (this.settings.serviceMode !== "control_plane") {
      this.controlPlaneBootstrap = null;
      this.controlPlaneBootstrapError = null;
      return null;
    }

    if (this.controlPlaneBootstrapPromise) {
      return this.controlPlaneBootstrapPromise.catch(() => null);
    }

    this.controlPlaneBootstrapPromise = ensureControlPlaneBootstrap(this)
      .then((bootstrap) => {
        this.controlPlaneBootstrap = bootstrap;
        this.controlPlaneBootstrapError = null;
        return bootstrap;
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "连接 Control Plane 失败。";
        this.controlPlaneBootstrapError = message;
        if (!silent) {
          new Notice(message, 6000);
        }
        return null;
      })
      .finally(() => {
        this.controlPlaneBootstrapPromise = null;
      }) as Promise<ControlPlaneBootstrap | null>;

    return this.controlPlaneBootstrapPromise;
  }

  getControlPlaneCapability(capabilityKey: string): ControlPlaneCapability | null {
    return getCapabilityFromBootstrap(this.controlPlaneBootstrap, capabilityKey);
  }

  getControlPlanePlanType(): string | null {
    return this.controlPlaneBootstrap?.user?.planType || null;
  }

  isUpgradeRequired(): boolean {
    return Boolean(this.controlPlaneBootstrap?.version?.upgradeRequired);
  }

  async loadSettings() {
    const persisted = (await this.loadData()) || {};
    const {
      controlPlaneAccessToken: _legacyAccessToken,
      controlPlaneRefreshToken: _legacyRefreshToken,
      ...rest
    } = persisted as Partial<ResearchReportSettings> & {
      controlPlaneAccessToken?: string;
      controlPlaneRefreshToken?: string;
    };

    this.settings = { ...DEFAULT_SETTINGS, ...rest };
    this.controlPlaneSession = {
      accessToken: "",
      refreshToken: "",
    };

    if (_legacyAccessToken || _legacyRefreshToken) {
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
