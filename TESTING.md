# Research Report 插件 — 测试操作指南

## 一、安装到 Obsidian

### 1. 确认插件已构建

在终端执行（若已构建过可跳过）：

```bash
cd /Users/xuziming/Obsitian/obsidian-research-report
npm run build
```

确认目录下存在 **`main.js`**（和 `manifest.json`、`styles.css` 在同一层）。

### 2. 复制到 Obsidian 插件目录

- 打开你的 **Obsidian Vault** 所在文件夹（例如 `~/Documents/MyVault`）。
- 进入 **`.obsidian`**（若没有则先在 Obsidian 里打开一次该 Vault 并随便改个设置，会自动生成）。
- 进入 **`plugins`**，若没有则新建一个名为 `plugins` 的文件夹。
- 在 `plugins` 下新建文件夹 **`research-report`**。
- 将以下三个文件**复制进去**（保持同名）：
  - `obsidian-research-report/main.js`
  - `obsidian-research-report/manifest.json`
  - `obsidian-research-report/styles.css`

即最终结构为：

```
你的Vault/
  .obsidian/
    plugins/
      research-report/
        main.js
        manifest.json
        styles.css
```

### 3. 在 Obsidian 里启用插件

1. 打开该 Vault。
2. 打开 **设置**（左下角齿轮）→ **社区插件**。
3. 若「已安装插件」里没有 **Research Report**，点 **「浏览」** 一般找不到（因为是本地开发），需要确认上面文件是否放对；若已有 **Research Report**，把开关打开。
4. 若仍看不到：点 **「已安装插件」** 旁的 **「从磁盘加载插件」**（若有），或关闭 Obsidian 再打开一次，确保 `plugins/research-report/` 下三个文件都在。

---

## 二、配置 API Key

1. 设置 → **社区插件** → 找到 **Research Report**，点右侧 **齿轮** 进入插件设置。
2. 填写：
   - **Anthropic API Key**：在 [Anthropic Console](https://console.anthropic.com/) 创建 API Key 后粘贴。若没有，需先注册/开通。
   - **Brave Search API Key**：你已有（与 Claudian 配置里用的相同），粘贴即可。
3. （可选）**默认报告文件夹** 保持 `行业研究` 或改成你想要的路径；**单次最多抓取 URL 数** 可先用默认 20。
4. 关闭设置页。

---

## 三、一次完整测试流程

### 步骤 1：打开研究面板

- **Mac**：`Cmd + P` 打开命令面板。  
- 输入 **「行业研究」** 或 **「Research」**，选择 **「开始行业研究报告」**，回车。

### 步骤 2：输入话题并生成关键词

- 在 **「研究话题 / 目标」** 输入框里输入一句话，例如：**`新能源汽车电池产业链`**。
- 点击 **「生成/细化关键词」**。
- 等待几秒，下方 **「关键词与提纲」** 文本框会出现 Claude 生成的关键词和提纲。

### 步骤 3：（可选）多轮细化

- 若想调整：可直接编辑文本框里的关键词，或在 **「补充或修改说明」** 里输入例如 **「增加储能和回收相关」**，再点 **「补充分析（输入说明后点此）」**。
- 可重复多次，直到满意。

### 步骤 4：开始搜集

- 点击 **「开始搜集（搜索+全文抓取）」**。
- 下方状态会依次显示「搜索: xxx」「抓取: xxx」，等它跑完（可能 1～2 分钟，取决于关键词数和网络）。
- 状态最后会显示类似 **「已抓取 N 篇」**。

### 步骤 5：生成报告并写入笔记

- 点击 **「生成报告并写入笔记」**。
- 等待几十秒，状态会显示 **「已写入笔记: 行业研究/xxx-YYYY-MM-DD.md」**（或你设置的文件夹）。
- 在 Obsidian 左侧文件树或搜索里打开该笔记，即可看到完整报告。

---

## 四、快速自检清单

| 步骤           | 检查项 |
|----------------|--------|
| 安装           | `plugins/research-report/` 下有 `main.js`、`manifest.json`、`styles.css` |
| 启用           | 设置 → 社区插件 → Research Report 已开启 |
| 配置           | 插件设置里 Anthropic、Brave 两个 Key 已填写且无多余空格 |
| 打开面板       | Cmd+P → 「开始行业研究报告」能打开弹窗 |
| 生成关键词     | 点「生成/细化关键词」后文本框有内容 |
| 搜集           | 点「开始搜集」后状态有「搜索/抓取」提示并最终显示「已抓取 N 篇」 |
| 写笔记         | 点「生成报告并写入笔记」后状态显示「已写入笔记: …」，且对应路径下出现新笔记 |

若某一步报错，把**状态栏/弹窗里显示的错误文案**记下来，便于排查（例如 API Key 无效、网络超时等）。
