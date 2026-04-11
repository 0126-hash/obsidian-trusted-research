# Research Report（行业研究报告）

Obsidian 插件：结合 Claude 与 Brave 搜索，从话题规划关键词、全文抓取资料并自动整理成报告写入笔记。

## 功能

- **多轮细化**：根据话题生成关键词与提纲，可编辑后再次「细化」或补充说明
- **按关键词自动搜集**：Brave 搜索 + URL 全文抓取（失败时用摘要）
- **补充分析**：结果不满意时可输入补充关键词/说明再搜一轮
- **一次性完整报告**：固定结构（概述、关键发现、细分维度、风险、资料来源）+ 引用标注
- **自动写入笔记**：报告保存到默认文件夹（可设置）下的新笔记

## 安装

1. 在仓库根目录执行：`npm install` 与 `npm run build`
2. 将整个 `obsidian-research-report` 文件夹复制到 vault 的 `.obsidian/plugins/` 下
3. 在 Obsidian 设置 → 社区插件中启用「Research Report」
4. 在插件设置中填写 **Anthropic API Key** 与 **Brave Search API Key**

## 使用

1. 命令面板中执行「开始行业研究报告」
2. 输入研究话题，点击「生成/细化关键词」
3. 可编辑关键词与提纲，或输入补充说明后点击「补充分析」
4. 点击「开始搜集」进行搜索与全文抓取
5. 可选：再次「补充分析」增加资料
6. 点击「生成报告并写入笔记」，报告将写入默认文件夹下的新笔记

## 技术说明

- 规划与报告合成：Anthropic Messages API (Claude)
- 搜索：Brave Search API
- 全文抓取：fetch + DOMParser 提取正文（Electron 环境可能受 CORS 限制，失败时使用摘要）

详见项目根目录 `TECH_SPEC_RESEARCH_REPORT.md`。
