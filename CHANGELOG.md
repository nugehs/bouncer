# Changelog

All notable changes to `@nugehs/bouncer` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
