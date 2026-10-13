# bouncer agent guide

## Mission and boundary

`bouncer` is a deterministic static checker for code-level controls required by regulatory rule packs. It produces file-and-line evidence and must distinguish a verified control, a missing control, and an unknown/unlocatable surface honestly. A green result is not legal certification.

The marketing site is a separate repository at `/Users/segzy/dev/bouncer-web`. Do not edit it unless the task explicitly includes that repository.

## Working safely

- Preserve the current branch and all existing work. Check `git status --short --branch` first.
- Use npm and keep `package-lock.json` authoritative.
- Do not publish, bump versions, or change package/server metadata unless explicitly asked.
- Treat rule identifiers, JSON fields, CLI exit codes, evidence locations, config, and MCP tools as public interfaces.
- Do not weaken a control merely to make a sample repository pass; fix detection or document the limitation.

## Code map

- `src/cli.js`: CLI entry and command orchestration.
- `src/`: repository scanning, rule evaluation, evidence, reporting, and MCP support.
- `tests/`: Node test-runner suites and fixtures.
- `scripts/`: version/release metadata helpers.

Keep the engine regulation-agnostic and rule-pack behaviour explicit. Regulatory wording and mappings require source-backed review. Preserve `unknown` when the static evidence is insufficient; do not infer compliance from filenames or weak keywords alone.

## Validation

Run:

```bash
npm test
```

For CLI changes, verify `check`, `doctor`, terminal/JSON output, and non-zero gate behaviour. For MCP changes, keep stdout protocol-clean and diagnostics on stderr.
