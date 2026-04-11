import { Modal, App, ButtonComponent } from "obsidian";
import type ResearchReportPlugin from "./main";
import { planKeywords, refinePlan, synthesizeReport } from "./services/anthropic";
import { gather, parsePlanOutput, type GatheredDoc } from "./workflow/gather";

export class ResearchReportModal extends Modal {
  private topic = "";
  private keywordsAndOutline = "";
  private gathered: GatheredDoc[] = [];
  private statusEl: HTMLDivElement;
  private keywordsEl: HTMLTextAreaElement;
  private refinementEl: HTMLInputElement;

  constructor(app: App, private plugin: ResearchReportPlugin, private initialTopic: string = "") {
    super(app);
    this.topic = initialTopic;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("research-report-modal");
    contentEl.createEl("h2", { text: "行业研究报告" });

    contentEl.createEl("label", { text: "研究话题 / 目标" }).setAttribute("for", "rr-topic");
    const topicInput = contentEl.createEl("input", { type: "text", cls: "rr-input" });
    topicInput.id = "rr-topic";
    topicInput.placeholder = "例如：新能源汽车电池产业链";
    topicInput.value = this.topic;
    topicInput.oninput = () => (this.topic = topicInput.value);

    contentEl.createEl("label", { text: "关键词与提纲（可编辑，支持多轮细化）" }).setAttribute("for", "rr-keywords");
    this.keywordsEl = contentEl.createEl("textarea", { cls: "rr-textarea" }) as HTMLTextAreaElement;
    this.keywordsEl.id = "rr-keywords";
    this.keywordsEl.placeholder = "点击「生成/细化关键词」后显示";
    this.keywordsEl.value = this.keywordsAndOutline;
    this.keywordsEl.rows = 8;
    this.keywordsEl.onchange = () => (this.keywordsAndOutline = this.keywordsEl.value);

    const btnRow1 = contentEl.createDiv({ cls: "rr-btn-row" });
    new ButtonComponent(btnRow1).setButtonText("生成/细化关键词").onClick(() => this.doPlan());
    new ButtonComponent(btnRow1).setButtonText("补充分析（输入说明后点此）").onClick(() => this.doRefine());

    contentEl.createEl("label", { text: "补充或修改说明（用于多轮细化）" }).setAttribute("for", "rr-refine");
    this.refinementEl = contentEl.createEl("input", { type: "text", cls: "rr-input" }) as HTMLInputElement;
    this.refinementEl.id = "rr-refine";
    this.refinementEl.placeholder = "例如：增加「储能」相关关键词";

    const btnRow2 = contentEl.createDiv({ cls: "rr-btn-row" });
    new ButtonComponent(btnRow2).setButtonText("开始搜集（搜索+全文抓取）").onClick(() => this.doGather());
    new ButtonComponent(btnRow2).setButtonText("生成报告并写入笔记").onClick(() => this.doSynthesize());

    this.statusEl = contentEl.createDiv({ cls: "rr-status" });
  }

  private setStatus(msg: string) {
    this.statusEl.setText(msg);
  }

  private async doPlan() {
    if (!this.plugin.settings.anthropicApiKey) {
      this.setStatus("请先在设置中填写 Anthropic API Key");
      return;
    }
    if (!this.topic.trim()) {
      this.topic = (document.getElementById("rr-topic") as HTMLInputElement)?.value ?? "";
      if (!this.topic.trim()) {
        this.setStatus("请先输入研究话题");
        return;
      }
    }
    this.setStatus("正在生成关键词与提纲…");
    try {
      const text = await planKeywords(this.plugin.settings.anthropicApiKey, this.topic);
      this.keywordsAndOutline = text;
      this.keywordsEl.value = text;
      this.setStatus("已生成。可编辑后再次点击「细化」或直接「开始搜集」。");
    } catch (e) {
      this.setStatus("错误: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  private async doRefine() {
    const refinement = this.refinementEl?.value?.trim();
    if (!refinement) {
      this.setStatus("请先输入补充或修改说明");
      return;
    }
    if (!this.keywordsAndOutline.trim()) {
      this.setStatus("请先点击「生成/细化关键词」");
      return;
    }
    this.setStatus("正在细化…");
    try {
      const text = await refinePlan(
        this.plugin.settings.anthropicApiKey,
        this.topic,
        this.keywordsAndOutline,
        refinement
      );
      this.keywordsAndOutline = text;
      this.keywordsEl.value = text;
      this.refinementEl.value = "";
      this.setStatus("已细化。可继续编辑或「开始搜集」。");
    } catch (e) {
      this.setStatus("错误: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  private async doGather() {
    if (!this.plugin.settings.braveApiKey) {
      this.setStatus("请先在设置中填写 Brave Search API Key");
      return;
    }
    this.keywordsAndOutline = this.keywordsEl.value;
    const { keywords } = parsePlanOutput(this.keywordsAndOutline);
    if (keywords.length === 0) {
      this.setStatus("请先生成关键词（或手动输入 KEYWORDS: 下列关键词）");
      return;
    }
    this.setStatus("正在搜索并抓取全文…");
    try {
      this.gathered = await gather(
        this.plugin.settings.braveApiKey,
        keywords,
        this.plugin.settings.maxUrlsToFetch,
        this.plugin.settings.maxCharsPerPage,
        (msg) => this.setStatus(msg)
      );
      this.setStatus(`已抓取 ${this.gathered.length} 篇。可点击「补充分析」再搜，或直接「生成报告并写入笔记」。`);
    } catch (e) {
      this.setStatus("错误: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  private async doSynthesize() {
    if (!this.plugin.settings.anthropicApiKey) {
      this.setStatus("请先在设置中填写 Anthropic API Key");
      return;
    }
    if (this.gathered.length === 0) {
      this.setStatus("请先「开始搜集」获取资料");
      return;
    }
    this.setStatus("正在生成报告…");
    try {
      const report = await synthesizeReport(
        this.plugin.settings.anthropicApiKey,
        this.topic,
        this.gathered.map((g) => ({ title: g.title, url: g.url, content: g.content }))
      );
      const folder = this.plugin.settings.defaultReportFolder.replace(/^\//, "").replace(/\/$/, "") || "行业研究";
      const safeName = this.topic.replace(/[/\\?*:|"]/g, "-").slice(0, 50);
      const date = new Date().toISOString().slice(0, 10);
      const path = `${folder}/${safeName}-${date}.md`;
      await this.plugin.app.vault.create(path, report);
      this.setStatus(`已写入笔记: ${path}`);
    } catch (e) {
      this.setStatus("错误: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
