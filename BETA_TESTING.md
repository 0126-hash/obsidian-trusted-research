# Beta Testing

`Trusted Research` is not ready for the public Obsidian Community Plugins directory yet because most users still need either:

- their own Runtime backend, or
- a Control Plane service

For private beta testing, the simplest path is:

1. install the plugin from this GitHub repo with BRAT
2. start the bundled mock Runtime
3. point the plugin to `http://127.0.0.1:8787`

## Suggested beta flow

### 1. Install via BRAT

Use the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) in Obsidian and add this repo:

```text
https://github.com/0126-hash/obsidian-trusted-research
```

### 2. Start the mock Runtime

```bash
cd /Users/xuziming/Obsitian/obsidian-research-report
npm run runtime:mock
```

Or:

```bash
docker compose -f docker-compose.mock.yml up
```

### 3. Configure the plugin

- `服务模式`: `Runtime 兼容模式`
- `Research API 地址`: `http://127.0.0.1:8787`
- `模型提供商`: `本地 Mock（离线调试）`

## What beta users should expect

- Quick Check, Fact Guard, and Deep Research all work end-to-end
- Deep Research plan / confirm / polling / export are functional
- results are mock data for UI and integration testing only
- no real retrieval, model inference, quota, or account behavior is included in the mock Runtime

## When to move beyond beta

Move to a public release only after:

- a real Runtime backend exists, or
- a real Control Plane service exists, and
- at least one end-to-end manual verification pass has been completed against that real backend
