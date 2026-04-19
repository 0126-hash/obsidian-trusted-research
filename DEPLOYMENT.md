# Backend Deployment Notes

This plugin ships only the Obsidian client. You must provide one of the following backend modes.

## Option 1: Runtime mode

Configure `Research API 地址` to a service that exposes:

- `POST /research/quick-check`
- `POST /research/fact-guard`
- `POST /research/tasks`
- `GET /research/tasks/:taskId`
- `POST /research/tasks/:taskId/confirm`
- `POST /research/tasks/:taskId/cancel`
- `POST /research/tasks/:taskId/export-markdown`

Expected request headers may include:

- `X-Provider`
- `X-DashScope-API-Key`
- `X-Quick-Check-Model`
- `X-Deep-Research-Model`

## Option 2: Control Plane mode

Configure `Control Plane 地址` to a service that exposes:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/devices/register`
- `GET /api/v1/bootstrap`
- `POST /api/v1/capabilities/:capabilityKey/invoke`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/:taskId`
- `POST /api/v1/tasks/:taskId/cancel`

The plugin also sends:

- `Authorization: Bearer <token>`
- `x-device-id`
- `x-client-version`

## Release checklist

- Keep `manifest.json` and `package.json` versions aligned.
- Update `versions.json` when changing `minAppVersion`.
- Build the plugin before creating a GitHub release.
- Upload `main.js`, `manifest.json`, and `styles.css` as release assets.

## Security notes

- Access and refresh tokens are session-only in the client.
- The configured email and password are still stored in plugin settings if you use Control Plane mode.
- Treat note content as sensitive: the plugin sends note body and selections to the configured backend.
