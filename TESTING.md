# Trusted Research Manual Test Plan

## Build

```bash
cd /Users/xuziming/Obsitian/obsidian-research-report
npm install
npm run build
```

Expected result:

- `tsc --noEmit` passes
- `main.js` is regenerated

## Install

Copy these files into your vault:

- `main.js`
- `manifest.json`
- `styles.css`

Target directory:

```text
<vault>/.obsidian/plugins/research-report/
```

## Runtime mode checks

1. Open plugin settings.
2. Set `服务模式` to `Runtime 兼容模式`.
3. For local mock testing, start `npm run runtime:mock` and fill `Research API 地址` with `http://127.0.0.1:8787`.
4. Set `模型提供商` to `本地 Mock（离线调试）`, or fill provider credentials if using your own Runtime.
5. Open a note with non-empty content.
6. Run `Quick Check` and verify:
   - request succeeds
   - result shows conclusion, evidence, and uncertainties
7. Run `Fact Guard` and verify:
   - request succeeds
   - verdict and evidence sections render
8. Run `Deep Research` and verify:
   - task is created
   - status updates render
   - final result renders
   - runtime export works if the backend supports `/export-markdown`

## Control Plane mode checks

1. Open plugin settings.
2. Set `服务模式` to `Control Plane 服务模式`.
3. Fill `Control Plane 地址`, `邮箱`, and `密码`.
4. Click `测试登录并拉取 Bootstrap`.
5. Verify:
   - plan type is shown
   - capability quotas are shown when available
   - no token fields are written back into plugin settings data
6. Run `Quick Check`, `Fact Guard`, and `Deep Research`.
7. Verify capability gating:
   - disabled capabilities show the backend-provided reason
   - quota values refresh after successful calls when bootstrap changes

## Regression checks

- Disable and re-enable the plugin: it should not crash when no backend URL is configured.
- Leave Runtime URL blank and trigger a feature: the plugin should show a clear configuration error.
- Leave Control Plane URL blank and click bootstrap test: the plugin should show a clear configuration error.
- Confirm the plugin is desktop-only in Obsidian metadata.
