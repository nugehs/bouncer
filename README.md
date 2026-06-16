# bouncer

**Static compliance-controls checker — the controls a regulation requires, verified in your code.**

[![npm](https://img.shields.io/npm/v/@nugehs/bouncer?style=flat-square)](https://www.npmjs.com/package/@nugehs/bouncer) [![CI](https://img.shields.io/github/actions/workflow/status/nugehs/bouncer/ci.yml?style=flat-square&label=CI)](https://github.com/nugehs/bouncer/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D18-blue?style=flat-square)](#) [![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)](#)

**[nugehs.github.io/bouncer-web](https://nugehs.github.io/bouncer-web/)** (site)

![bouncer demo](bouncer-demo.gif)

bouncer verifies that the controls a
regulation *requires* actually exist in your code — UK Online Safety Act, ICO
Children's Code (AADC), and Nigeria (NDPC, FCCPC, FIRS) — expressed as
deterministic **rule packs**. It runs in CI,
exits non-zero when a required control is missing, and needs **no LLM**.

It checks IDs at the door so non-compliant code doesn't get in.

> bouncer is an engineering aid, **not legal advice**. A green report means the
> coded controls a rule looks for were found — it is not a substitute for a
> compliance / DPO review.

---

## Why

Regulators now expect *demonstrable* controls: age assurance, high-privacy
defaults for children, report/block affordances on user-generated content, a DPIA,
a risk assessment. Those are concrete things that either exist in a codebase or
don't. bouncer turns a regulation into a set of static checks over your repo, the
same way [tieline](https://www.npmjs.com/package/@nugehs/tieline) turns an API
contract into drift checks — the engine knows nothing about the law; the
**rule packs** do.

### bouncer vs semgrep / policy-as-code

Scanners like semgrep, CodeQL, or Snyk answer *"is there bad code here?"* — they
hunt for vulnerabilities and dangerous patterns that **shouldn't exist**. bouncer
answers the opposite question: *"does the code the regulation requires actually
exist?"* — age assurance on sign-up, report/block on UGC surfaces, high-privacy
defaults for children. A repo can be vulnerability-free and still fail every one
of those obligations. Policy-as-code tools (OPA/Rego, Conftest) gate *configs and
infrastructure* against policy; bouncer gates *application source* against
regulatory rule packs, with `file:line` evidence for every control and an honest
`unknown` when a surface can't be located. In short: **semgrep finds
vulnerabilities; bouncer proves required controls exist.** They complement each
other — run both.

## Install

```bash
npx @nugehs/bouncer init
npx @nugehs/bouncer check
```

Or clone and run with plain Node (zero runtime dependencies, Node ≥ 18).

## Usage

```bash
bouncer init [path]                 # write a starter bouncer.config.json
bouncer check                       # run packs, print report, exit 1 on a missing control
bouncer check --pack uk-aadc        # restrict to one pack
bouncer check --status fail         # show only the failures
bouncer report --out report.html    # self-contained HTML audit report
bouncer list                        # every rule the configured packs apply
bouncer explain <ruleId>            # what a rule requires + how it is checked
bouncer packs                       # rule packs shipped with bouncer
bouncer doctor                      # sanity-check config, adapter, packs
bouncer mcp                         # start the MCP server (stdio)
```

### Verdicts

| Verdict     | Meaning                                                                       |
| ----------- | ---------------------------------------------------------------------------- |
| **pass**    | the required control was found (evidence: `file:line`)                        |
| **fail**    | the surface exists, but no evidence of the control was found                  |
| **unknown** | the surface could not be located in this repo — *can't determine, not a pass* |

`unknown` is deliberate: bouncer never reports a green pass for a surface it could
not find. Missing surface → honest "can't determine".

## Configuration

`bouncer.config.json`:

```json
{
  "target": {
    "adapter": "next",
    "repo": "./my-app",
    "roots": ["app", "src", "components"]
  },
  "packs": ["uk-osa", "uk-aadc"],
  "packDirs": [],
  "ignore": [],
  "failOn": ["fail"]
}
```

- `adapter` — how regulation *surfaces* (sign-up, profile, chat, livestream…) map
  onto files for your stack.

> **Adapters shipped today: `next` (App Router) and `react-native`.** That's it —
> if your stack isn't covered, an adapter is a single small file mapping surface
> aliases to file globs (see `src/lib/adapters/next.js`). **Adapter PRs are very
> welcome** — `nuxt`, `sveltekit`, `remix`, `flutter`, `django` are all natural
> candidates.
- `packs` — which rule packs to run. Built-ins: `uk-osa`, `uk-aadc`, `ng-ndpc`, `ng-fccpc`, `ng-firs`.
- `packDirs` — extra directories of your own `*.json` packs.
- `ignore` — rule ids to skip.
- `failOn` — which buckets make `check` exit non-zero (default `["fail"]`).

## Rule packs

A pack is JSON. Each rule maps a *legal standard* to a static assertion over a
*surface*:

```json
{
  "id": "aadc.geolocation-default-off",
  "standard": "Standard 10 — Geolocation",
  "severity": "high",
  "surface": "profile",
  "intent": "Geolocation must default to off for children.",
  "fix": "Default any location-sharing setting to off.",
  "assert": {
    "find": "(geo|location)[^\\n;,]{0,30}(default|initial)[^\\n;,]{0,15}(false|off)",
    "in": ["profile", "any"],
    "expect": "present"
  }
}
```

Assertion nodes:

- `{ "find": "<regex>", "in": "<surface|glob>", "expect": "present|absent" }`
- `{ "allOf": [ … ] }` · `{ "anyOf": [ … ] }` · `{ "not": … }`

`in` accepts a surface alias (resolved by the adapter), an array of aliases/globs,
or a raw glob. `expect: "absent"` flips the meaning — a match is a *violation*
(used for nudge patterns, self-declared age checkboxes, etc.).

### Surfaces (next adapter)

`any`, `signup`, `auth`, `profile`, `chat`, `livestream`, `ugc`, `governance`.

### Nigeria packs

For a platform operating in Nigeria, three packs ship built-in:

- **`ng-ndpc`** — Nigeria Data Protection Act 2023 (NDPC): privacy notice, opt-in
  & granular consent, data-subject rights, encryption, retention/erasure, NDPA
  localization, DPO designation, 72-hour breach plan, cross-border safeguards.
- **`ng-fccpc`** — consumer protection (FCCPC): blanket "no refund / all sales
  final" clauses flagged as **void** — and high-precision, so a *tiered* or
  conditional refund policy doesn't trip it — plus refund-policy present, no drip
  pricing, explicit terms acceptance, terms of service present.
- **`ng-firs`** — tax (FIRS): 7.5% VAT rate, VAT on commission, WHT on payouts,
  VAT tax invoice.

Some obligations are process, not code — NDPC registration, signed cross-border
DPAs, the WHT remittance itself. Those rules surface as **gaps to track** (add
them to `ignore` with a note), not things a static scan can prove.

## MCP

bouncer is also an MCP server (stdio), so an agent can pull the same deterministic
results:

| Tool               | Purpose                                                       |
| ------------------ | ------------------------------------------------------------ |
| `compliance_check` | run packs, return per-control verdicts + evidence            |
| `list_rules`       | list rules the configured packs apply                        |
| `explain_rule`     | a rule's standard, intent, fix, and how it is checked        |
| `list_packs`       | available rule packs                                          |

```jsonc
// .mcp.json
{ "mcpServers": { "bouncer": { "command": "npx", "args": ["-y", "@nugehs/bouncer", "mcp"] } } }
```

## CI

```yaml
- run: npx @nugehs/bouncer check
```

Fails the build when a required control goes missing — e.g. someone removes an
age-gate or a report button from a UGC surface.

## Tests

```bash
npm test    # node --test — zero dependencies, nothing to install
```

The suite runs on Node's built-in test runner against throwaway fixture repos:
glob/brace expansion, every assertion probe (`find`, `allOf`/`anyOf`/`not`,
`allInFile` + `within` windows, `expect: "absent"`), the pass/fail/`unknown`
verdict semantics, and pack loading. CI runs it on Node 18, 20, and 22.

## License

MIT

---

## Part of the toolchain

**bouncer** is one of four tools that form a deterministic trust layer for AI-assisted development. Each answers a question people keep handing to an LLM — with static analysis instead.

- [repoctx](https://www.npmjs.com/package/@nugehs/repoctx) — context: what does this change actually touch?
- [tieline](https://www.npmjs.com/package/@nugehs/tieline) — contracts: did the front end and back end quietly stop agreeing?
- **bouncer** (this tool) — compliance: could you defend this to Ofcom?
- [aiglare](https://www.npmjs.com/package/@nugehs/aiglare) — governance: where can the model do something you can't undo?

More at [segunolumbe.com](https://segunolumbe.com). *static analysis, never the model.*
