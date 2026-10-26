# Changelog

All notable changes to `@nugehs/bouncer` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `bouncer --version` (`-v`) prints the package version.

### Changed
- `check` exits 1 when every rule is `unknown`, whatever `failOn` says: no surface was located, so nothing was verified. `--no-fail` still exits 0.
- A pass with no hits (an `expect: "absent"` rule) now says `nothing offending in N files scanned` in the terminal and HTML report instead of a blank cell.
- Config keys starting with `_` are comments and no longer warn.
- `--ignore` / `ignore` ids only warn when no pack defines them, so `--pack` no longer warns about rules from the packs it leaves out. The warning now reads `is not defined by any pack`.

### Fixed
- An unknown command printed "Run `bouncer help`" twice.

## [0.3.0] - 2026-10-13

### Added
- **Language-agnostic scanning.** New default adapter `auto` scans TS/JS, Go, Java, Kotlin, Scala, C#, C/C++, Rust, Swift, Dart, PHP, Python, Ruby, Elixir, SQL and templates, plus docs/data. `next`/`react-native` remain as aliases (TS/JS only). Optional `target.languages`.
- Surfaces are matched by directory/file names across camelCase, snake_case and kebab-case. New surfaces: `privacy`, `location`, `moderation`, `consent`, `legal`, `dsr`, `security`, `retention`, `breach`, `processors`, `payments`, `invoice`.
- Rule fields: `appliesWhen` (precondition), `languages`, and `scope: "file"` on `find` (multi-line matches).
- Config: `exclude`, `docs`, `defaultExcludes`. Findings gain `reason` (for `unknown`) and `unreadable`; `meta` gains `excluded`, `languages`, `missingRoots`, `warnings`.
- Table output for `check`, `list`, `packs`, `explain`, `doctor`; per-pack summary in the HTML report.
- Pack validation (shape, regex, severity, unknown surfaces, duplicate rule ids, pack id conflicts).

### Changed (verdicts may change — intentional)
- Comments (all supported languages) and test/fixture/mock/story files are no longer counted as evidence.
- Default `target.roots` is now `["."]`; governance doc folders are always walked.
- Rules no longer fall back to the `any` surface (risk assessment, DPIA, CSAM, terms, age assurance, geolocation).
- Tightened: high-privacy default, geolocation default-off (now only applies when a location feature exists), self-declared age checkbox (multi-line), encryption (bcrypt alone no longer passes), VAT rate (must be 7.5%), drip pricing.
- PDFs are located but not read; PDF-only evidence is `unknown` (`unreadable-only`).

### Fixed
- Missing repo / no scannable files now exit 2 instead of a silent green.
- Boolean flags no longer swallow the next argument; unknown flags/invalid `--status` are usage errors (exit 2); `--ignore` is applied.
- Errors and warnings go to stderr (clean `--json` stdout).
- MCP: no replies to notifications, protocol version negotiation, `status` validated.
- Regex `g`/`y` flags stripped (stateful matching bug).

## [0.2.0] - 2026-06-16

### Added

- **Nigeria rule packs** — three deterministic packs for a platform operating in
  Nigeria, validated against a real Next.js front end and a NestJS API:
  - `ng-ndpc` (10 rules) — Nigeria Data Protection Act 2023 / NDPC: privacy
    notice, opt-in & granular consent, data-subject rights (access/erasure),
    encryption at rest, retention/erasure lifecycle, NDPA localization, DPO
    designation, 72-hour breach plan, and cross-border transfer safeguards.
  - `ng-fccpc` (5 rules) — consumer protection (FCCPC): blanket "no refund / all
    sales final" clauses flagged as void (high-precision — a tiered/conditional
    refund policy does not trip it), refund policy present, no drip pricing,
    explicit terms acceptance, and terms of service present.
  - `ng-firs` (4 rules) — tax (FIRS): 7.5% VAT rate, VAT on the platform
    commission, WHT on organiser payouts, and VAT tax invoices.

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
