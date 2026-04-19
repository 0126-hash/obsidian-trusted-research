# Changelog

## 0.3.0

- added a bundled mock Runtime for local beta testing and frontend integration
- added Docker Compose and deployment guidance for the mock Runtime and production backend paths
- split timeout settings for Quick Check, Fact Guard, Deep Research, and export
- added client-side truncation for selection and document context before requests leave the vault
- hardened Deep Research polling to avoid overlapping requests and to recover from transient status refresh failures
- upgraded Fact Guard evidence rendering to preserve source locator, timestamps, and support/conflict relationships
- added a dedicated DashScope model setting for Fact Guard

## 0.2.0

- renamed the public-facing plugin to `Trusted Research`
- aligned release metadata to semver and desktop-only support
- removed public entrypoints for the legacy industry-report modal flow
- fixed the TypeScript bootstrap promise mismatch
- stopped persisting control-plane access and refresh tokens in plugin settings
- replaced localhost and demo credentials with empty release defaults
- added deployment, release, privacy, testing, and contribution documentation
- added CI and automated GitHub release workflows
- split timeout settings for Quick Check, Fact Guard, Deep Research, and export
- added client-side truncation for selection and document context before requests leave the vault
- hardened Deep Research polling to avoid overlapping requests and to recover from transient status refresh failures
- upgraded Fact Guard evidence rendering to preserve source locator, timestamps, and support/conflict relationships
- added a dedicated DashScope model setting for Fact Guard
