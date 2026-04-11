import { App, Notice, Setting, PluginSettingTab } from "obsidian";
import type ResearchReportPlugin from "./main";
import { DEFAULT_SETTINGS, type ResearchReportSettings } from "./settings";

export class ResearchReportSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ResearchReportPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Research Report 设置" });

    new Setting(containerEl)
      .setName("Anthropic API Key")
      .setDesc("用于调用 Claude 进行规划与报告合成")
      .addText((text) =>
        text
          .setPlaceholder("sk-ant-...")
          .setValue(this.plugin.settings.anthropicApiKey)
          .onChange(async (v) => {
            this.plugin.settings.anthropicApiKey = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Brave Search API Key")
      .setDesc("用于按关键词搜索网页")
      .addText((text) =>
        text
          .setPlaceholder("Brave API Key")
          .setValue(this.plugin.settings.braveApiKey)
          .onChange(async (v) => {
            this.plugin.settings.braveApiKey = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("默认报告文件夹")
      .setDesc("新建报告时存放的文件夹路径（相对 vault 根）")
      .addText((text) =>
        text
          .setPlaceholder("行业研究")
          .setValue(this.plugin.settings.defaultReportFolder)
          .onChange(async (v) => {
            this.plugin.settings.defaultReportFolder = v || DEFAULT_SETTINGS.defaultReportFolder;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("单次最多抓取 URL 数")
      .setDesc("每轮搜集时最多抓取多少个链接的全文（避免过长）")
      .addText((text) =>
        text
          .setPlaceholder("20")
          .setValue(String(this.plugin.settings.maxUrlsToFetch))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.maxUrlsToFetch = Math.min(50, n);
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("单页最大字符数")
      .setDesc("每个网页抓取后截断的最大字符数")
      .addText((text) =>
        text
          .setPlaceholder("50000")
          .setValue(String(this.plugin.settings.maxCharsPerPage))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.maxCharsPerPage = Math.min(200000, n);
              await this.plugin.saveSettings();
            }
          })
      );

    /* ── 可信研究引擎 ── */

    containerEl.createEl("h2", { text: "可信研究引擎" });

    new Setting(containerEl)
      .setName("服务模式")
      .setDesc("选择直接连接 runtime，或通过 control-plane 走服务模式主链路")
      .addDropdown((drop) =>
        drop
          .addOption("control_plane", "Control Plane 服务模式")
          .addOption("runtime", "直连 Runtime（兼容模式）")
          .setValue(this.plugin.settings.serviceMode)
          .onChange(async (v: "runtime" | "control_plane") => {
            this.plugin.settings.serviceMode = v;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.serviceMode === "control_plane") {
      new Setting(containerEl)
        .setName("Control Plane 地址")
        .setDesc("服务模式统一网关地址")
        .addText((text) =>
          text
            .setPlaceholder("http://127.0.0.1:4320")
            .setValue(this.plugin.settings.controlPlaneBaseUrl)
            .onChange(async (v) => {
              this.plugin.settings.controlPlaneBaseUrl =
                v.trim() || DEFAULT_SETTINGS.controlPlaneBaseUrl;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Control Plane 邮箱")
        .setDesc("当前用于登录服务模式账号的邮箱")
        .addText((text) =>
          text
            .setPlaceholder("demo@example.com")
            .setValue(this.plugin.settings.controlPlaneEmail)
            .onChange(async (v) => {
              this.plugin.settings.controlPlaneEmail = v.trim();
              this.plugin.settings.controlPlaneAccessToken = "";
              this.plugin.settings.controlPlaneRefreshToken = "";
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Control Plane 密码")
        .setDesc("开发期直接保存在插件设置中，后续可替换为正式登录流程")
        .addText((text) =>
          text
            .setPlaceholder("demo123456")
            .setValue(this.plugin.settings.controlPlanePassword)
            .onChange(async (v) => {
              this.plugin.settings.controlPlanePassword = v;
              this.plugin.settings.controlPlaneAccessToken = "";
              this.plugin.settings.controlPlaneRefreshToken = "";
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("客户端版本号")
        .setDesc("会通过 x-client-version 发送给 control-plane，用于版本策略校验")
        .addText((text) =>
          text
            .setPlaceholder("1.0.0")
            .setValue(this.plugin.settings.controlPlaneClientVersion)
            .onChange(async (v) => {
              this.plugin.settings.controlPlaneClientVersion =
                v.trim() || DEFAULT_SETTINGS.controlPlaneClientVersion;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("当前设备")
        .setDesc(this.plugin.settings.controlPlaneDeviceId || "尚未注册")
        .addButton((button) =>
          button
            .setButtonText("测试登录并拉取 Bootstrap")
            .onClick(async () => {
              button.setButtonText("连接中...");
              button.setDisabled(true);
              try {
                const bootstrap = await this.plugin.refreshControlPlaneBootstrap();
                if (!bootstrap) {
                  throw new Error("连接 Control Plane 失败。");
                }
                this.plugin.settings.controlPlaneDeviceId = bootstrap.device.deviceId;
                await this.plugin.saveSettings();
                new Notice(`已连接：${bootstrap.user.email} · ${bootstrap.user.planType}`);
                this.display();
              } catch (error) {
                new Notice(error instanceof Error ? error.message : "连接 Control Plane 失败。", 6000);
              } finally {
                button.setButtonText("测试登录并拉取 Bootstrap");
                button.setDisabled(false);
              }
            })
        );
    }

    new Setting(containerEl)
      .setName("Research API 地址")
      .setDesc("可信研究引擎后端服务地址")
      .addText((text) =>
        text
          .setPlaceholder("http://127.0.0.1:4319")
          .setValue(this.plugin.settings.researchApiBaseUrl)
          .onChange(async (v) => {
            this.plugin.settings.researchApiBaseUrl =
              v.trim() || DEFAULT_SETTINGS.researchApiBaseUrl;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("请求超时 (ms)")
      .setDesc("Quick Check 请求的最大等待时间")
      .addText((text) =>
        text
          .setPlaceholder("30000")
          .setValue(String(this.plugin.settings.quickCheckTimeout))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 5000) {
              this.plugin.settings.quickCheckTimeout = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("模型提供商 (Provider)")
      .setDesc("选择可信研究引擎的模型来源 (推荐: 阿里云百炼)")
      .addDropdown((drop) =>
        drop
          .addOption("local_mock", "本地 Mock (脱机测试)")
          .addOption("dashscope", "阿里云百炼 (DashScope)")
          .setValue(this.plugin.settings.researchProvider)
          .onChange(async (v: "local_mock" | "dashscope") => {
            this.plugin.settings.researchProvider = v;
            await this.plugin.saveSettings();
            this.display(); // re-render to toggle related settings
          })
      );

    if (this.plugin.settings.researchProvider === "dashscope") {
      new Setting(containerEl)
        .setName("DashScope API Key")
        .setDesc("调用阿里云百炼需提供 API Key")
        .addText((text) =>
          text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.dashscopeApiKey)
            .onChange(async (v) => {
              this.plugin.settings.dashscopeApiKey = v.trim();
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Quick Check 模型")
        .setDesc("快查使用的模型 (默认: qwen-flash)")
        .addText((text) =>
          text
            .setPlaceholder("qwen-flash")
            .setValue(this.plugin.settings.dashscopeQuickCheckModel)
            .onChange(async (v) => {
              this.plugin.settings.dashscopeQuickCheckModel =
                v.trim() || DEFAULT_SETTINGS.dashscopeQuickCheckModel;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Deep Research 模型")
        .setDesc("深度研究主力模型 (默认: qwen-plus)")
        .addText((text) =>
          text
            .setPlaceholder("qwen-plus")
            .setValue(this.plugin.settings.dashscopeDeepResearchModel)
            .onChange(async (v) => {
              this.plugin.settings.dashscopeDeepResearchModel =
                v.trim() || DEFAULT_SETTINGS.dashscopeDeepResearchModel;
              await this.plugin.saveSettings();
            })
        );
    }
  }
}
