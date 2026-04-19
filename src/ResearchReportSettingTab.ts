import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ResearchReportPlugin from "./main";
import { DEFAULT_SETTINGS } from "./settings";

export class ResearchReportSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ResearchReportPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Trusted Research 设置" });
    containerEl.createEl("p", {
      text:
        "该插件需要桌面版 Obsidian，并且至少配置一个后端：Research API（Runtime）或 Control Plane。",
    });

    new Setting(containerEl)
      .setName("服务模式")
      .setDesc("Runtime 适合自部署后端；Control Plane 适合统一账号、套餐与配额管理。")
      .addDropdown((drop) =>
        drop
          .addOption("runtime", "Runtime 兼容模式")
          .addOption("control_plane", "Control Plane 服务模式")
          .setValue(this.plugin.settings.serviceMode)
          .onChange(async (value: "runtime" | "control_plane") => {
            this.plugin.settings.serviceMode = value;
            if (value !== "control_plane") {
              this.plugin.controlPlaneBootstrap = null;
              this.plugin.controlPlaneBootstrapError = null;
              this.plugin.controlPlaneSession.accessToken = "";
              this.plugin.controlPlaneSession.refreshToken = "";
            }
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.serviceMode === "control_plane") {
      containerEl.createEl("h3", { text: "Control Plane" });

      new Setting(containerEl)
        .setName("Control Plane 地址")
        .setDesc("例如 https://control-plane.example.com")
        .addText((text) =>
          text
            .setPlaceholder("https://control-plane.example.com")
            .setValue(this.plugin.settings.controlPlaneBaseUrl)
            .onChange(async (value) => {
              this.plugin.settings.controlPlaneBaseUrl = value.trim();
              this.plugin.controlPlaneBootstrap = null;
              this.plugin.controlPlaneBootstrapError = null;
              this.plugin.controlPlaneSession.accessToken = "";
              this.plugin.controlPlaneSession.refreshToken = "";
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Control Plane 邮箱")
        .setDesc("用于登录当前服务模式账号。")
        .addText((text) =>
          text
            .setPlaceholder("name@example.com")
            .setValue(this.plugin.settings.controlPlaneEmail)
            .onChange(async (value) => {
              this.plugin.settings.controlPlaneEmail = value.trim();
              this.plugin.controlPlaneSession.accessToken = "";
              this.plugin.controlPlaneSession.refreshToken = "";
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Control Plane 密码")
        .setDesc("仅用于当前本地配置；访问 token 不再持久化到插件设置。")
        .addText((text) => {
          text.inputEl.type = "password";
          return text
            .setPlaceholder("输入登录密码")
            .setValue(this.plugin.settings.controlPlanePassword)
            .onChange(async (value) => {
              this.plugin.settings.controlPlanePassword = value;
              this.plugin.controlPlaneSession.accessToken = "";
              this.plugin.controlPlaneSession.refreshToken = "";
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("客户端版本号")
        .setDesc("会通过 x-client-version 发送给 Control Plane，用于版本兼容判断。")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.controlPlaneClientVersion)
            .setValue(this.plugin.settings.controlPlaneClientVersion)
            .onChange(async (value) => {
              this.plugin.settings.controlPlaneClientVersion =
                value.trim() || DEFAULT_SETTINGS.controlPlaneClientVersion;
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
                new Notice(
                  error instanceof Error ? error.message : "连接 Control Plane 失败。",
                  6000
                );
              } finally {
                button.setButtonText("测试登录并拉取 Bootstrap");
                button.setDisabled(false);
              }
            })
        )
        .addExtraButton((button) =>
          button
            .setIcon("reset")
            .setTooltip("清除当前登录会话")
            .onClick(async () => {
              this.plugin.controlPlaneSession.accessToken = "";
              this.plugin.controlPlaneSession.refreshToken = "";
              this.plugin.controlPlaneBootstrap = null;
              this.plugin.controlPlaneBootstrapError = null;
              new Notice("已清除当前会话。");
              this.display();
            })
        );
    }

    containerEl.createEl("h3", { text: "Research API" });

    new Setting(containerEl)
      .setName("Research API 地址")
      .setDesc("例如 https://runtime.example.com。Runtime 模式必填。")
      .addText((text) =>
        text
          .setPlaceholder("https://runtime.example.com")
          .setValue(this.plugin.settings.researchApiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.researchApiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Quick Check 超时 (ms)")
      .setDesc("Quick Check 的单次请求超时。")
      .addText((text) =>
        text
          .setPlaceholder("30000")
          .setValue(String(this.plugin.settings.quickCheckTimeout))
          .onChange(async (value) => {
            const nextValue = Number.parseInt(value, 10);
            if (!Number.isNaN(nextValue) && nextValue >= 5000) {
              this.plugin.settings.quickCheckTimeout = nextValue;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Fact Guard 超时 (ms)")
      .setDesc("Fact Guard 的单次请求超时。")
      .addText((text) =>
        text
          .setPlaceholder("30000")
          .setValue(String(this.plugin.settings.factGuardTimeout))
          .onChange(async (value) => {
            const nextValue = Number.parseInt(value, 10);
            if (!Number.isNaN(nextValue) && nextValue >= 5000) {
              this.plugin.settings.factGuardTimeout = nextValue;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Deep Research 超时 (ms)")
      .setDesc("创建任务、轮询状态、取消任务时使用。")
      .addText((text) =>
        text
          .setPlaceholder("45000")
          .setValue(String(this.plugin.settings.deepResearchTimeout))
          .onChange(async (value) => {
            const nextValue = Number.parseInt(value, 10);
            if (!Number.isNaN(nextValue) && nextValue >= 5000) {
              this.plugin.settings.deepResearchTimeout = nextValue;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Deep Research 导出超时 (ms)")
      .setDesc("仅用于 Runtime 模式下的 Markdown 导出。")
      .addText((text) =>
        text
          .setPlaceholder("60000")
          .setValue(String(this.plugin.settings.deepResearchExportTimeout))
          .onChange(async (value) => {
            const nextValue = Number.parseInt(value, 10);
            if (!Number.isNaN(nextValue) && nextValue >= 5000) {
              this.plugin.settings.deepResearchExportTimeout = nextValue;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("文档上下文上限 (字符)")
      .setDesc("客户端发送当前文档前会截断到该长度，选中文本固定最多 8000 字。")
      .addText((text) =>
        text
          .setPlaceholder("12000")
          .setValue(String(this.plugin.settings.maxDocumentContextChars))
          .onChange(async (value) => {
            const nextValue = Number.parseInt(value, 10);
            if (!Number.isNaN(nextValue) && nextValue >= 2000) {
              this.plugin.settings.maxDocumentContextChars = nextValue;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("模型提供商")
      .setDesc("Runtime 模式下用于指定后端使用哪种模型提供商。")
      .addDropdown((drop) =>
        drop
          .addOption("local_mock", "本地 Mock（离线调试）")
          .addOption("dashscope", "阿里云百炼（DashScope）")
          .setValue(this.plugin.settings.researchProvider)
          .onChange(async (value: "local_mock" | "dashscope") => {
            this.plugin.settings.researchProvider = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.researchProvider === "dashscope") {
      new Setting(containerEl)
        .setName("DashScope API Key")
        .setDesc("Runtime 模式直连 DashScope 时使用。")
        .addText((text) => {
          text.inputEl.type = "password";
          return text
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.dashscopeApiKey)
            .onChange(async (value) => {
              this.plugin.settings.dashscopeApiKey = value.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setName("Quick Check 模型")
        .setDesc("默认 qwen-flash。")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.dashscopeQuickCheckModel)
            .setValue(this.plugin.settings.dashscopeQuickCheckModel)
            .onChange(async (value) => {
              this.plugin.settings.dashscopeQuickCheckModel =
                value.trim() || DEFAULT_SETTINGS.dashscopeQuickCheckModel;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Fact Guard 模型")
        .setDesc("默认 qwen-flash。")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.dashscopeFactGuardModel)
            .setValue(this.plugin.settings.dashscopeFactGuardModel)
            .onChange(async (value) => {
              this.plugin.settings.dashscopeFactGuardModel =
                value.trim() || DEFAULT_SETTINGS.dashscopeFactGuardModel;
              await this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName("Deep Research 模型")
        .setDesc("默认 qwen-plus。")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_SETTINGS.dashscopeDeepResearchModel)
            .setValue(this.plugin.settings.dashscopeDeepResearchModel)
            .onChange(async (value) => {
              this.plugin.settings.dashscopeDeepResearchModel =
                value.trim() || DEFAULT_SETTINGS.dashscopeDeepResearchModel;
              await this.plugin.saveSettings();
            })
        );
    }

    containerEl.createEl("p", {
      text:
        "隐私提示：Quick Check、Fact Guard、Deep Research 会把当前问题、选中文本和截断后的当前文档内容发送到你配置的后端服务。",
    });
  }
}
