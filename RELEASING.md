# Releasing

## 1. Bump version

```bash
npm run version:bump -- 0.2.1
```

You can also use `patch`, `minor`, or `major` instead of an explicit version.

## 2. Build and package release assets

```bash
npm install
npm run release:prepare
```

This creates:

- `dist/main.js`
- `dist/manifest.json`
- `dist/styles.css`
- `dist/<plugin-id>-<version>.zip`

## 3. Commit and tag

```bash
git add .
git commit -m "release: 0.2.1"
git tag 0.2.1
git push origin main --tags
```

When the tag reaches GitHub, `.github/workflows/release.yml` creates a GitHub release automatically.

## 4. First-time GitHub setup

After creating the GitHub repository:

```bash
git remote add origin <your-github-repo-url>
git branch -M main
git push -u origin main
```

## 5. Submit to Obsidian Community Plugins

After the first public GitHub release exists, submit the repository to the official community list:

- repository URL: your GitHub repo
- branch: `main`
- manifest path: root `manifest.json`
- release assets: generated automatically by GitHub Actions

Also verify the repo root still contains `README.md`, `LICENSE`, `manifest.json`, and `versions.json`.
