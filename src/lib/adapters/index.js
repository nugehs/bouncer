// Adapters only narrow WHICH languages are scanned. Surfaces are shared and
// language-agnostic (see ../surfaces.js). `auto` scans every registered language;
// `next` / `react-native` are kept as aliases for existing configs.
export const ADAPTERS = {
  auto: { id: "auto", languages: null },
  next: { id: "next", languages: ["typescript", "javascript"] },
  "react-native": { id: "react-native", languages: ["typescript", "javascript"] },
};

export function getAdapter(id = "auto") {
  const adapter = ADAPTERS[id];
  if (!adapter) throw new Error(`Unknown target adapter: ${id}. Known: ${Object.keys(ADAPTERS).join(", ")}.`);
  return adapter;
}
