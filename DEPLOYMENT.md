# Backend Deployment Notes

`Trusted Research` ships only the Obsidian client. To use the plugin outside pure UI testing, you must provide a backend.

This repo now includes a **minimal runnable Runtime mock** for local testing, plus the interface contract for replacing it with a real service.

## 1. Fastest path: local mock Runtime

Use this when you want beta users or collaborators to verify the plugin flow without standing up a production research system.

### Start with Node.js

```bash
cd /Users/xuziming/Obsitian/obsidian-research-report
npm run runtime:mock
```

The mock server listens on:

```text
http://127.0.0.1:8787
```

Then configure the plugin:

- `服务模式`: `Runtime 兼容模式`
- `Research API 地址`: `http://127.0.0.1:8787`
- `模型提供商`: `本地 Mock（离线调试）`

### Start with Docker Compose

```bash
cd /Users/xuziming/Obsitian/obsidian-research-report
docker compose -f docker-compose.mock.yml up
```

This mock Runtime supports:

- `POST /research/quick-check`
- `POST /research/fact-guard`
- `POST /research/tasks`
- `GET /research/tasks/:taskId`
- `POST /research/tasks/:taskId/confirm`
- `POST /research/tasks/:taskId/cancel`
- `POST /research/tasks/:taskId/export-markdown`
- `GET /health`

### What the mock Runtime is for

- validating plugin UI and request wiring
- verifying Quick Check / Fact Guard result rendering
- verifying Deep Research plan, confirm, polling, completion, and export
- letting beta users install the plugin and see a working end-to-end flow immediately

### What the mock Runtime does **not** do

- no real web search
- no real document retrieval
- no real model inference
- no quota or account system
- no multi-user persistence

It is strictly a local beta and integration aid.

## 2. Production path: Runtime mode

Configure `Research API 地址` to your own service. The plugin expects these Runtime endpoints:

- `POST /research/quick-check`
- `POST /research/fact-guard`
- `POST /research/tasks`
- `GET /research/tasks/:taskId`
- `POST /research/tasks/:taskId/confirm`
- `POST /research/tasks/:taskId/cancel`
- `POST /research/tasks/:taskId/export-markdown`

### Runtime request headers

The client may send:

- `X-Provider`
- `X-DashScope-API-Key`
- `X-Quick-Check-Model`
- `X-Fact-Guard-Model`
- `X-Deep-Research-Model`

### Runtime request body shape

Quick Check:

```json
{
  "query": "这个结论靠谱吗？",
  "context": {
    "selectedText": "...",
    "documentContent": "...",
    "documentTitle": "当前文档",
    "documentPath": "notes/example.md"
  }
}
```

Fact Guard:

```json
{
  "claim": "这段陈述是否成立？",
  "context": {
    "selectedText": "...",
    "documentContent": "...",
    "documentTitle": "当前文档",
    "documentPath": "notes/example.md"
  }
}
```

Deep Research create:

```json
{
  "query": "请深度研究这个问题",
  "context": {
    "selectedText": "...",
    "documentContent": "...",
    "documentTitle": "当前文档",
    "documentPath": "notes/example.md"
  }
}
```

### Runtime response expectations

- Quick Check: `{ "result": QuickCheckResult }`
- Fact Guard: `{ "result": FactGuardResult }`
- Task create/get/confirm/cancel: `{ "task": ResearchTask }`
- Export: `{ "filePath": "/absolute/path/to/report.md" }`

On errors, return:

```json
{
  "error": {
    "code": "MISSING_QUERY",
    "message": "请输入研究问题",
    "retryable": false
  }
}
```

## 3. Production path: Control Plane mode

Use this when you need:

- account login
- device registration
- quota / plan gating
- centralized capability switches
- async task orchestration

The plugin expects these endpoints:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/devices/register`
- `GET /api/v1/bootstrap`
- `POST /api/v1/capabilities/:capabilityKey/invoke`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/:taskId`
- `POST /api/v1/tasks/:taskId/cancel`

The client also sends:

- `Authorization: Bearer <token>`
- `x-device-id`
- `x-client-version`

### Capability keys currently used by the plugin

- `research.quick_check`
- `research.fact_guard`
- `research.deep_research`

## 4. Recommended production architecture

For a real public beta, the clean split is:

1. `obsidian-trusted-research` client
2. Runtime API service
3. model adapter layer
4. retrieval / crawling / source normalization workers
5. optional Control Plane for auth, plans, quota, and task routing

If you only need a closed beta, start with Runtime mode first and keep Control Plane out of scope until usage justifies it.

## 5. Security notes

- access and refresh tokens are session-only in the client
- Control Plane email and password are still stored in plugin settings if you use Control Plane mode
- the plugin sends note title, path, selection, and truncated document content to the configured backend
- treat all note content as sensitive

## 6. Release checklist

- keep `manifest.json` and `package.json` versions aligned
- update `versions.json` when `minAppVersion` changes
- build the plugin before creating a GitHub release
- upload `main.js`, `manifest.json`, and `styles.css` as release assets
