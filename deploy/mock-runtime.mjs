import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PORT = Number.parseInt(process.env.PORT || "8787", 10);
const EXPORT_ROOT = path.resolve(
  process.env.EXPORT_ROOT || path.join(os.tmpdir(), "trusted-research-exports")
);

const tasks = new Map();

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, statusCode, code, message) {
  sendJson(res, statusCode, {
    error: {
      code,
      message,
      retryable: statusCode >= 500,
    },
  });
}

function summarizeText(value, limit = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function deriveTimeSensitivity(query) {
  if (/(today|latest|current|今年|本月|今天|最近|最新)/i.test(query)) return "high";
  if (/(trend|forecast|季度|近期)/i.test(query)) return "medium";
  return "low";
}

function buildSource(index, query, context) {
  const hasPath = Boolean(context.documentPath);
  return {
    id: `src-${index + 1}`,
    sourceType: hasPath ? "document" : "web",
    title: hasPath
      ? `${context.documentTitle || "当前文档"} · 证据片段 ${index + 1}`
      : `Mock web source ${index + 1} · ${query.slice(0, 32)}`,
    locator: hasPath
      ? {
          filePath: context.documentPath,
          section: index === 0 ? "当前选区" : "文档摘要",
        }
      : {
          url: `https://example.com/mock/${index + 1}?q=${encodeURIComponent(query.slice(0, 24))}`,
          section: index === 0 ? "summary" : "details",
        },
    retrievedAt: nowIso(),
    snippet:
      index === 0
        ? summarizeText(context.selectedText || context.documentContent || query, 180)
        : `Mock evidence ${index + 1} generated for "${query}".`,
    credibilityNote:
      index === 0
        ? "来自当前文档上下文，适合作为人工复核起点。"
        : "演示环境返回的占位证据，不代表真实检索结果。",
    timeSensitivity: deriveTimeSensitivity(query),
  };
}

function buildQuickCheckResult(query, context) {
  const excerpt = summarizeText(context.selectedText || context.documentContent, 220);
  return {
    query,
    conclusion: excerpt
      ? `Mock Runtime 判断：当前上下文与“${query}”存在初步相关性，但仍需真实后端补充外部证据。`
      : `Mock Runtime 判断：缺少足够上下文，问题“${query}”需要补充文档内容后再核查。`,
    keyEvidence: [
      excerpt || "未提供可用的文档摘录，结果主要基于问题文本生成。",
      "这是仓库内置的最小联调 Runtime，用于验证插件界面、请求链路和任务状态。",
    ],
    uncertainties: [
      "未执行真实联网检索。",
      "未接入生产模型或配额系统。",
    ],
    sources: [buildSource(0, query, context), buildSource(1, query, context)],
    confidenceNote: excerpt ? "中等，仅用于联调" : "低，仅用于联调",
    timeSensitivity: deriveTimeSensitivity(query),
  };
}

function buildFactGuardResult(claim, context) {
  const excerpt = summarizeText(context.selectedText || context.documentContent, 220);
  return {
    claim,
    verdict: excerpt ? "partially_supported" : "uncertain",
    rationale: excerpt
      ? "Mock Runtime 发现当前文档片段与陈述存在部分对应信息，但没有进行外部交叉验证。"
      : "Mock Runtime 没有拿到足够上下文，只能返回待确认状态。",
    supportingEvidence: [
      {
        ...buildSource(0, claim, context),
        supportsClaims: [claim],
        publishedAt: nowIso().slice(0, 10),
      },
    ],
    conflictingEvidence: excerpt
      ? [
          {
            ...buildSource(1, claim, context),
            conflictsWithClaims: [claim],
            description: "演示用反向证据，提醒前端展示支持/冲突结构。",
            publishedAt: nowIso().slice(0, 10),
          },
        ]
      : [],
    uncertainties: [
      "Mock Runtime 未接入真实事实核查数据源。",
    ],
  };
}

function buildPlan(query, context) {
  return {
    objective: `围绕“${query}”生成一个可验证的研究结论。`,
    subquestions: [
      "当前文档或选区中有哪些直接陈述？",
      "还需要哪些外部来源来补足证据链？",
      "是否存在时间敏感或相互冲突的信息？",
    ],
    sourceStrategy: [
      context.documentTitle
        ? `优先读取当前文档《${context.documentTitle}》中的相关段落`
        : "优先使用当前选区或问题文本作为初始上下文",
      "用外部检索补充最新来源",
      "在综合结论前显式列出争议与不确定项",
    ],
    stopCondition: "当关键问题均有至少一条可引用证据且争议点被显式标记时结束。",
    notes: [
      "该计划由仓库内置 Mock Runtime 生成，仅用于客户端联调。",
    ],
  };
}

function buildReport(task) {
  const context = task.context || {};
  const excerpt = summarizeText(context.selectedText || context.documentContent, 260);
  const evidenceItems = [buildSource(0, task.query, context), buildSource(1, task.query, context)];
  return {
    query: task.query,
    objective: task.plan.objective,
    executiveSummary: excerpt
      ? `Mock Runtime 根据当前文档上下文生成了一份演示研究结论。核心判断是：问题与已有上下文存在相关证据，但缺少真实外部检索支持。`
      : `Mock Runtime 生成了一份无外部检索的演示研究结论，适合检查前端任务流和导出链路。`,
    keyFindings: [
      excerpt || "当前没有可用的文档摘录，研究结论主要基于问题文本。",
      "前端已经成功串通 create / confirm / polling / completed / export 流程。",
    ],
    evidenceItems,
    controversies: [
      "演示环境不会返回真实联网来源，因此争议判断仅用于 UI 验证。",
    ],
    uncertainties: [
      "未接入真实搜索与抓取能力。",
      "未接入真实 LLM 推理服务。",
    ],
    recommendations: [
      "如需真实结果，请替换为你的 Runtime 或 Control Plane 后端。",
      "提交公开 beta 前，建议先用真实后端跑一遍人工联调。",
    ],
    generatedAt: nowIso(),
  };
}

function createTask(query, context) {
  const task = {
    id: createId("task"),
    mode: "deep_research",
    query,
    status: "awaiting_confirmation",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    contextSummary: {
      hasActiveDocument: Boolean(context.documentTitle || context.documentPath || context.documentContent),
      hasSelection: Boolean(context.selectedText),
      sourceMode: "current_doc_only",
    },
    context,
    plan: buildPlan(query, context),
    progress: {
      currentStep: "drafting_plan",
      currentStepLabel: "研究计划已生成，等待确认",
      progressPercent: 15,
      fetchedCount: 0,
      parsedCount: 0,
      selectedCount: 0,
      failedCount: 0,
    },
  };
  tasks.set(task.id, task);
  return task;
}

function cloneTask(task) {
  return JSON.parse(JSON.stringify(task));
}

function hydrateTask(task) {
  if (!task) return null;
  if (task.status === "cancelled" || task.status === "failed" || task.status === "completed") {
    return cloneTask(task);
  }
  if (task.status === "awaiting_confirmation" || !task.startedAt) {
    return cloneTask(task);
  }

  const elapsedSec = Math.max(0, (Date.now() - task.startedAt) / 1000);
  if (elapsedSec < 2) {
    task.status = "running";
    task.progress = {
      currentStep: "retrieval",
      currentStepLabel: "正在检索候选来源",
      progressPercent: 28,
      fetchedCount: 2,
      parsedCount: 1,
      selectedCount: 0,
      failedCount: 0,
    };
  } else if (elapsedSec < 4.5) {
    task.status = "running";
    task.progress = {
      currentStep: "analysis",
      currentStepLabel: "正在分析证据与冲突",
      progressPercent: 58,
      fetchedCount: 5,
      parsedCount: 4,
      selectedCount: 3,
      failedCount: 0,
    };
  } else if (elapsedSec < 6.5) {
    task.status = "synthesizing";
    task.progress = {
      currentStep: "synthesis",
      currentStepLabel: "正在生成研究摘要",
      progressPercent: 84,
      fetchedCount: 5,
      parsedCount: 4,
      selectedCount: 3,
      failedCount: 0,
    };
  } else {
    task.status = "completed";
    task.progress = {
      currentStep: "completed",
      currentStepLabel: "研究完成",
      progressPercent: 100,
      fetchedCount: 5,
      parsedCount: 4,
      selectedCount: 3,
      failedCount: 0,
    };
    task.result = buildReport(task);
  }
  task.updatedAt = nowIso();
  return cloneTask(task);
}

function renderMarkdown(report) {
  const lines = [
    `# ${report.query}`,
    "",
    `生成时间：${report.generatedAt}`,
    "",
    "## 执行摘要",
    report.executiveSummary,
    "",
    "## 关键发现",
    ...report.keyFindings.map((item) => `- ${item}`),
    "",
    "## 争议点",
    ...report.controversies.map((item) => `- ${item}`),
    "",
    "## 不确定项",
    ...report.uncertainties.map((item) => `- ${item}`),
    "",
    "## 来源与证据",
  ];

  for (const item of report.evidenceItems || []) {
    lines.push(`### ${item.title}`);
    lines.push(item.snippet || "");
    if (item.locator?.url) {
      lines.push(`- URL: ${item.locator.url}`);
    }
    if (item.locator?.filePath) {
      lines.push(`- 文件: ${item.locator.filePath}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function getTaskIdFromPath(pathname) {
  const match = pathname.match(/^\/research\/tasks\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return null;
  return {
    taskId: decodeURIComponent(match[1]),
    action: match[2] || "",
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname;

  try {
    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, { ok: true, runtime: "mock", now: nowIso() });
      return;
    }

    if (req.method === "POST" && pathname === "/research/quick-check") {
      const body = await readJsonBody(req);
      sendJson(res, 200, {
        result: buildQuickCheckResult(body.query || "未命名问题", body.context || {}),
      });
      return;
    }

    if (req.method === "POST" && pathname === "/research/fact-guard") {
      const body = await readJsonBody(req);
      sendJson(res, 200, {
        result: buildFactGuardResult(body.claim || body.query || "未命名陈述", body.context || {}),
      });
      return;
    }

    if (req.method === "POST" && pathname === "/research/tasks") {
      const body = await readJsonBody(req);
      if (!String(body.query || "").trim()) {
        sendError(res, 400, "MISSING_QUERY", "请输入研究问题");
        return;
      }
      sendJson(res, 200, {
        task: createTask(String(body.query).trim(), body.context || {}),
      });
      return;
    }

    const taskRoute = getTaskIdFromPath(pathname);
    if (taskRoute) {
      const task = tasks.get(taskRoute.taskId);
      if (!task) {
        sendError(res, 404, "TASK_NOT_FOUND", "未找到对应任务");
        return;
      }

      if (req.method === "GET" && !taskRoute.action) {
        sendJson(res, 200, { task: hydrateTask(task) });
        return;
      }

      if (req.method === "POST" && taskRoute.action === "confirm") {
        task.startedAt = task.startedAt || Date.now();
        task.status = "running";
        task.updatedAt = nowIso();
        sendJson(res, 200, { task: hydrateTask(task) });
        return;
      }

      if (req.method === "POST" && taskRoute.action === "cancel") {
        task.status = "cancelled";
        task.updatedAt = nowIso();
        task.progress = {
          currentStep: "cancelled",
          currentStepLabel: "任务已取消",
          progressPercent: 100,
          fetchedCount: 0,
          parsedCount: 0,
          selectedCount: 0,
          failedCount: 0,
        };
        sendJson(res, 200, { task: hydrateTask(task) });
        return;
      }

      if (req.method === "POST" && taskRoute.action === "export-markdown") {
        const current = hydrateTask(task);
        if (!current?.result) {
          sendError(res, 409, "TASK_NOT_READY", "任务尚未完成，无法导出 Markdown");
          return;
        }

        const body = await readJsonBody(req);
        const exportDir = path.resolve(body.targetFolder || EXPORT_ROOT);
        await mkdir(exportDir, { recursive: true });
        const safeName = current.query.replace(/[^\p{Letter}\p{Number}\-_ ]/gu, " ").trim() || "trusted-research";
        const filePath = path.join(exportDir, `${safeName.slice(0, 60)}.md`);
        await writeFile(filePath, renderMarkdown(current.result), "utf8");
        sendJson(res, 200, { filePath });
        return;
      }
    }

    sendError(res, 404, "NOT_FOUND", "未找到请求的接口");
  } catch (error) {
    sendError(
      res,
      500,
      "UNKNOWN",
      error instanceof Error ? error.message : "未知运行时错误"
    );
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Trusted Research mock runtime listening on http://127.0.0.1:${PORT}`);
  console.log(`Export root: ${EXPORT_ROOT}`);
});
