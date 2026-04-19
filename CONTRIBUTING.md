# Contributing

## Local setup

```bash
npm install
npm run build
```

## Development rules

- keep `package.json`, `manifest.json`, and `versions.json` aligned
- do not reintroduce localhost or demo credentials as public defaults
- keep the plugin desktop-only unless Node/Electron dependencies are removed
- document any backend contract changes in `DEPLOYMENT.md`

## Before opening a PR

```bash
npm run build
```

The build includes type checking.
