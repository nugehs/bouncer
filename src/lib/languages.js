// Language registry. bouncer is language-agnostic: a language is just a set of
// file extensions plus a comment syntax (so comments are never counted as
// evidence). Adding a language = adding one entry here.

export const LANGUAGES = [
  { id: "typescript", exts: [".ts", ".tsx", ".mts", ".cts"], comments: "js" },
  { id: "javascript", exts: [".js", ".jsx", ".mjs", ".cjs"], comments: "js" },
  { id: "vue", exts: [".vue", ".svelte", ".astro"], comments: "js" },
  {
    id: "html",
    exts: [".html", ".htm", ".ejs", ".hbs", ".handlebars", ".jinja", ".jinja2", ".j2", ".twig", ".erb", ".cshtml", ".razor", ".jsp"],
    comments: "markup",
  },
  { id: "go", exts: [".go"], comments: "c" },
  { id: "java", exts: [".java"], comments: "c" },
  { id: "kotlin", exts: [".kt", ".kts"], comments: "c" },
  { id: "scala", exts: [".scala"], comments: "c" },
  { id: "groovy", exts: [".groovy"], comments: "c" },
  { id: "csharp", exts: [".cs"], comments: "c" },
  { id: "c", exts: [".c", ".h"], comments: "c" },
  { id: "cpp", exts: [".cc", ".cpp", ".cxx", ".hpp", ".hh", ".hxx"], comments: "c" },
  { id: "rust", exts: [".rs"], comments: "c" },
  { id: "swift", exts: [".swift"], comments: "c" },
  { id: "dart", exts: [".dart"], comments: "c" },
  { id: "php", exts: [".php"], comments: "php" },
  { id: "python", exts: [".py"], comments: "python" },
  { id: "ruby", exts: [".rb", ".rake"], comments: "hash" },
  { id: "elixir", exts: [".ex", ".exs"], comments: "hash" },
  { id: "sql", exts: [".sql"], comments: "sql" },
];

export const LANGUAGE_IDS = LANGUAGES.map((l) => l.id);

// Non-code files. Docs and data are scanned (governance artifacts, i18n copy,
// config) but are never part of the `any` (code) surface.
const DOCS = { ".md": "markup", ".mdx": "markup", ".markdown": "markup", ".txt": "none", ".rst": "none", ".adoc": "none" };
const DATA = { ".json": "none", ".yaml": "hash", ".yml": "hash", ".toml": "hash", ".properties": "hash", ".xml": "markup" };
// Binary documents can be located but not read as text -> they never count as evidence.
const BINARY = new Set([".pdf", ".docx", ".doc", ".odt"]);

const BY_EXT = new Map();
for (const lang of LANGUAGES) for (const ext of lang.exts) BY_EXT.set(ext, { kind: "code", lang: lang.id, comments: lang.comments });

/** Classify a path into { kind: code|doc|data|binary, lang, comments } or null (not scanned). */
export function classify(relPath) {
  const base = relPath.slice(relPath.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot).toLowerCase();
  if (BY_EXT.has(ext)) return BY_EXT.get(ext);
  if (ext in DOCS) return { kind: "doc", lang: null, comments: DOCS[ext] };
  if (ext in DATA) return { kind: "data", lang: null, comments: DATA[ext] };
  if (BINARY.has(ext)) return { kind: "binary", lang: null, comments: "none" };
  return null;
}
