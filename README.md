# Trusted Research

Desktop-only Obsidian plugin for source-aware research workflows:

- `Quick Check`: fast credibility checks for a question against the current note context
- `Fact Guard`: claim verification against the current note context
- `Deep Research`: longer-running research tasks with progress, synthesis, and export hooks

This repo is the plugin client only. It does not bundle the backend services.

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
- current note body
- current note title and path

Do not enable this plugin against a backend you do not trust with note content.

See [PRIVACY.md](./PRIVACY.md) for the storage model and credential notes.

## Repository notes

- Legacy `Research Report` modal code is still present in the repo for migration purposes, but it is no longer exposed by the public plugin entrypoints.
- Release metadata is aligned for Obsidian packaging: `manifest.json`, `versions.json`, and semver-compatible version numbers.
