# bouncer

**Static compliance-controls checker.** bouncer verifies that the controls a
regulation *requires* actually exist in your code — UK Online Safety Act, ICO
Children's Code (AADC) — expressed as deterministic **rule packs**. It runs in CI,
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
same way [tieline](https://github.com/nugehs/tieline) turns an API contract into
drift checks — the engine knows nothing about the law; the **rule packs** do.

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
    "repo": "../bashbop-event-web",
    "roots": ["app", "src", "components", "redux"]
  },
  "packs": ["uk-osa", "uk-aadc"],
  "packDirs": [],
  "ignore": [],
  "failOn": ["fail"]
}
```

- `adapter` — how regulation *surfaces* (sign-up, profile, chat, livestream…) map
  onto files for your stack. Ships with `next` (App Router).
- `packs` — which rule packs to run. Built-ins: `uk-osa`, `uk-aadc`.
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

## License

MIT
