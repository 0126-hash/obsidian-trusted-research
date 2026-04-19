# Trusted Research

Desktop-only Obsidian plugin for source-aware research workflows:

- `Quick Check`: fast credibility checks for a question against the current note context
- `Fact Guard`: claim verification against the current note context
- `Deep Research`: longer-running research tasks with progress, synthesis, and export hooks

This repo is the plugin client only. It does not bundle the backend services.

For local beta testing, the repo now includes a minimal runnable mock Runtime in [deploy/mock-runtime.mjs](./deploy/mock-runtime.mjs).

For GitHub prerelease installs, see [BETA_TESTING.md](./BETA_TESTING.md).

## Current scope

- Supported platform: desktop Obsidian only
- Supported backends:
  - `Runtime`: direct calls to a research API you host yourself
  - `Control Plane`: account, device, quota, and capability-aware flow behind your own gateway
- Not included:
  - public SaaS endpoint
  - account service
  - ready-to-run backend container images

## Local development

```bash
npm install
npm run build
```

`npm run build` now includes `tsc --noEmit`, so the plugin must stay type-clean before bundling.

To prepare GitHub release assets:

```bash
npm run release:prepare
```

To run the local mock Runtime for plugin testing:

```bash
npm run runtime:mock
```

See [RELEASING.md](./RELEASING.md) for the release flow and [DEPLOYMENT.md](./DEPLOYMENT.md) for backend expectations.

## Install into Obsidian for local testing

1. Build the plugin in this repo.
2. Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<your-vault>/.obsidian/plugins/research-report/
```

3. Enable `Trusted Research` in Obsidian Community Plugins.

## Required configuration

Open `Settings -> Community plugins -> Trusted Research`.

### Runtime mode

Fill in:

- `Research API 地址`
- `模型提供商`
- provider credentials if your runtime expects them, such as `DashScope API Key`
- optional per-feature timeouts for `Quick Check`, `Fact Guard`, `Deep Research`, and `Deep Research 导出`
- optional `文档上下文上限 (字符)` to control client-side truncation before sending note content

For local beta testing with the bundled mock backend:

- `Research API 地址`: `http://127.0.0.1:8787`
- `模型提供商`: `本地 Mock（离线调试）`

### Control Plane mode

Fill in:

- `Control Plane 地址`
- `Control Plane 邮箱`
- `Control Plane 密码`

Then click `测试登录并拉取 Bootstrap`.

Access and refresh tokens are kept in memory for the current session only. They are no longer persisted in plugin settings.

## Backend expectations

See [DEPLOYMENT.md](./DEPLOYMENT.md).

At a minimum:

- Runtime mode expects HTTP endpoints for Quick Check, Fact Guard, Deep Research, and export.
- Control Plane mode expects auth, device registration, bootstrap, capability invocation, and task APIs.

## Privacy

The plugin sends the following content to your configured backend:

- the user query
- current selection
- current note body (truncated on the client to the configured context limit)
- current note title and path

Do not enable this plugin against a backend you do not trust with note content.

See [PRIVACY.md](./PRIVACY.md) for the storage model and credential notes.

## Repository notes

- Legacy `Research Report` modal code is still present in the repo for migration purposes, but it is no longer exposed by the public plugin entrypoints.
- Release metadata is aligned for Obsidian packaging: `manifest.json`, `versions.json`, and semver-compatible version numbers.
