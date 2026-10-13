// Language-agnostic surfaces. A surface is a regulation-level concept (sign-up,
// profile, chat…) located by directory / file NAMES rather than framework
// conventions. Path segments and file basenames are split into words
// (camelCase, snake_case, kebab-case, dots), and a surface matches when any
// contiguous run of words, joined, equals one of its tokens. So `signup`
// matches `signup/`, `sign_up.py`, `SignUpController.java`, `sign-up.go` —
// but `auth` does not match `author.ts`.
//
// `kinds` restricts which file kinds a surface covers (code | doc | data | binary).
// `globs` add explicit path globs (relative to the repo root).

const CODE = ["code"];
const CODE_AND_DATA = ["code", "data"];
const ALL = ["code", "doc", "data", "binary"];

const GOV_GLOBS = [
  "**/{docs,doc,compliance,legal,governance,policies,policy,security,privacy}/**/*.{md,mdx,markdown,txt,rst,adoc,pdf,docx,html}",
];

export const SURFACES = {
  any: { kinds: CODE, all: true },
  signup: { names: ["signup", "register", "registration", "onboarding", "onboard", "createaccount", "join"], kinds: CODE },
  auth: { names: ["auth", "login", "signin", "logon", "authentication", "session", "sessions"], kinds: CODE },
  profile: { names: ["profile", "profiles", "account", "accounts", "settings", "preferences", "me", "user", "users"], kinds: CODE_AND_DATA },
  privacy: { names: ["privacy", "privacypolicy", "privacynotice", "gdpr", "dataprotection", "compliance"], kinds: ALL },
  location: { names: ["location", "locations", "geo", "geolocation", "gps", "map", "maps"], kinds: CODE },
  chat: { names: ["chat", "chats", "message", "messages", "messaging", "dm", "dms", "inbox", "conversation", "conversations"], kinds: CODE },
  livestream: { names: ["livestream", "live", "stream", "streams", "streaming", "broadcast", "meet", "meeting", "call", "viewer"], kinds: CODE },
  ugc: {
    names: [
      "chat", "chats", "message", "messages", "messaging", "dm", "inbox", "conversation", "conversations",
      "livestream", "live", "stream", "streaming", "broadcast", "meet",
      "comment", "comments", "review", "reviews", "post", "posts", "feed", "forum", "thread", "threads",
      "profile", "profiles", "event", "events", "upload", "uploads",
    ],
    kinds: CODE,
  },
  moderation: { names: ["moderation", "moderator", "moderate", "trustandsafety", "safety", "abuse", "report", "reports", "reporting"], kinds: CODE },
  consent: { names: ["consent", "consents", "cookie", "cookies", "cmp", "tracking"], kinds: CODE_AND_DATA },
  legal: {
    names: ["terms", "tos", "termsofservice", "termsofuse", "legal", "policy", "policies", "disclaimer", "refund", "refunds", "cancel", "cancellation", "guidelines", "acceptableuse", "contentpolicy", "communityguidelines"],
    kinds: ALL,
    globs: GOV_GLOBS,
  },
  // Customer-facing terms only (no docs/ globs): internal notes that *quote* a banned clause are not terms.
  terms: { names: ["terms", "tos", "termsofservice", "termsofuse", "termsandconditions", "refund", "refundpolicy", "cancellation", "disclaimer"], kinds: ["code", "doc", "data"] },
  dsr: { names: ["gdpr", "dsr", "dataexport", "exportdata", "deleteaccount", "dataaccess", "datarequest", "erasure", "settings", "account"], kinds: CODE },
  security: { names: ["security", "encryption", "encrypt", "crypto", "cipher", "kms", "vault", "dataencryption", "privacy"], kinds: CODE },
  retention: { names: ["retention", "softdelete", "purge", "cleanup", "scheduled", "scheduledtasks", "cron", "jobs", "worker", "workers"], kinds: CODE },
  breach: { names: ["breach", "incident", "incidents", "incidentresponse", "runbook", "runbooks"], kinds: ALL, globs: GOV_GLOBS },
  processors: { names: ["processor", "processors", "subprocessor", "subprocessors", "transfer", "transfers"], kinds: ALL },
  payments: {
    names: ["payment", "payments", "payout", "payouts", "checkout", "billing", "invoice", "invoices", "receipt", "receipts", "fee", "fees", "pricing", "price", "tax", "taxes", "vat", "commission", "seller", "sellers", "vendor", "paystack", "stripe", "flutterwave", "settlement", "withdrawal", "booking", "order", "orders", "cart"],
    kinds: CODE,
  },
  invoice: { names: ["invoice", "invoices", "receipt", "receipts", "pdf", "ticketgenerator", "tickets"], kinds: CODE },
  governance: {
    names: ["dpia", "dataprotection", "riskassessment", "impactassessment", "governance", "childrensriskassessment"],
    kinds: ALL,
    globs: GOV_GLOBS,
  },
};

export const SURFACE_NAMES = Object.keys(SURFACES);
const MAX_RUN = 4;

/** Split a single path segment into lowercase words. */
export function words(segment) {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Every contiguous word-run (joined) across the path's directories and basename (sans extension). */
export function nameRuns(relPath) {
  const segs = relPath.split("/");
  const base = segs.pop();
  const dot = base.indexOf(".");
  segs.push(dot > 0 ? base.slice(0, dot) : base);
  const runs = new Set();
  for (const seg of segs) {
    const w = words(seg);
    for (let a = 0; a < w.length; a++) {
      let joined = "";
      for (let b = a; b < w.length && b - a < MAX_RUN; b++) {
        joined += w[b];
        runs.add(joined);
      }
    }
  }
  return runs;
}

const GLOB_CHARS = /[/*?{}.]/;
export const looksLikeGlob = (s) => GLOB_CHARS.test(s);
