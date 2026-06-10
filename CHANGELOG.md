# Changelog

All notable changes to `@nugehs/bouncer` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-06-10

### Added

- README: demo GIF showing `bouncer check` against a demo Next.js app.
- Release workflow now publishes `server.json` to the MCP Registry (GitHub OIDC),
  which 0.1.x releases were silently skipping.
- `version` lifecycle hook keeps `server.json` in sync with `package.json`.

### Changed

- README badges use semantic colors instead of brand red.

## [0.1.1] - 2026-06-09
### Added

- Brand alignment: toolchain footer/badges.
- README: badge row (npm version, CI, license, node, zero dependencies).
- README: "bouncer vs semgrep / policy-as-code" positioning section.
- README: prominent note that the shipped adapters today are `next` and
  `react-native`, with an invitation for adapter PRs (nuxt, sveltekit, remix,
  flutter, django).
- README: Tests section documenting the Node built-in test suite and CI matrix.
- Tag-triggered release workflow (`.github/workflows/release.yml`): runs tests,
  creates a GitHub Release with notes extracted from this changelog, publishes
  to npm.

### Changed

- Replaced a personal example target path with a generic `./my-app` in the
  README and the repo-root `bouncer.config.json`.
- README link to tieline now points at its npm package page.

## [0.1.0] - 2026-06-07

Initial release.

### Added

- Static compliance-controls engine: deterministic rule packs evaluated against a
  target repo, with `pass` / `fail` / `unknown` verdicts. `unknown` (surface not
  located) is never reported as a pass.
- Assertion probes: `find`, `allOf` / `anyOf` / `not`, and `allInFile` with an
  optional `within` line-window for co-occurrence precision.
- Built-in rule packs:
  - `uk-osa` — UK Online Safety Act 2023 (age assurance, report/block on UGC,
    content moderation, illegal-content risk assessment, CSEA route, terms).
  - `uk-aadc` — ICO Children's Code (age-appropriate application, high-privacy
    defaults, geolocation off, parental consent under 13, DPIA, no nudge patterns).
- Stack adapters mapping regulation surfaces to file globs: `next`, `react-native`.
- CLI: `check`, `report`, `list`, `explain`, `packs`, `init`, `doctor`, `mcp`.
- Self-contained HTML audit report (compliance ring, per-pack control tables,
  file-level evidence).
- MCP server (stdio) exposing `compliance_check`, `list_rules`, `explain_rule`,
  `list_packs`.
- Zero runtime dependencies; Node >= 18.

[0.1.0]: https://github.com/nugehs/bouncer/releases/tag/v0.1.0
