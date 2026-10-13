// Comment stripping that preserves line structure (comment characters become
// spaces, newlines are kept) so evidence line numbers stay exact. String
// contents are kept: UI copy and identifiers inside strings are real evidence;
// comments ("// TODO: add age verification") are not.

const FAMILIES = {
  js: { line: ["//"], block: [["/*", "*/"]], quotes: ["'", '"'], template: true, regex: true },
  c: { line: ["//"], block: [["/*", "*/"]], quotes: ["'", '"'], multiline: ["`"] },
  php: { line: ["//", "#"], block: [["/*", "*/"]], quotes: ["'", '"'] },
  hash: { line: ["#"], quotes: ["'", '"'] },
  python: { line: ["#"], quotes: ["'", '"'], docstring: true },
  sql: { line: ["--"], block: [["/*", "*/"]], quotes: ["'"] },
  markup: { block: [["<!--", "-->"]] },
};

// After these characters a `/` starts a regex literal rather than a division.
// `<` is deliberately excluded so JSX closing tags (`</p>`) are never regexes.
const REGEX_PREFIX = new Set("(,=:[!&|?{;+-*%>~^".split(""));
const REGEX_KEYWORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "instanceof"]);

export const COMMENT_FAMILIES = Object.keys(FAMILIES);

export function stripComments(text, family) {
  const f = FAMILIES[family];
  if (!f || !text) return text;
  const out = text.split("");
  const n = text.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };

  let state = "code";
  let endTok = "";
  let quote = "";
  let inClass = false;
  let lastSig = "";
  let lastWord = "";
  let prevWord = false;
  const tpl = [];
  let i = 0;

  while (i < n) {
    const c = text[i];
    if (state === "code") {
      if (f.docstring && (text.startsWith('"""', i) || text.startsWith("'''", i))) {
        endTok = text.slice(i, i + 3);
        if (onlyWhitespaceBefore(text, i)) {
          blank(i, i + 3);
          state = "block";
        } else state = "mstring";
        i += 3;
        continue;
      }
      const blk = f.block && f.block.find(([open]) => text.startsWith(open, i));
      if (blk) {
        blank(i, i + blk[0].length);
        endTok = blk[1];
        state = "block";
        i += blk[0].length;
        continue;
      }
      const ln = f.line && f.line.find((t) => text.startsWith(t, i));
      if (ln && lineCommentOk(ln, text[i - 1])) {
        state = "line";
        continue;
      }
      if (f.regex && c === "/" && regexAllowed(lastSig, lastWord)) {
        state = "regex";
        inClass = false;
        i++;
        continue;
      }
      if (f.quotes && f.quotes.includes(c)) {
        state = "string";
        quote = c;
        i++;
        continue;
      }
      if (f.template && c === "`") {
        state = "template";
        i++;
        continue;
      }
      if (f.multiline && f.multiline.includes(c)) {
        state = "mstring";
        endTok = c;
        i++;
        continue;
      }
      if (tpl.length) {
        const top = tpl.length - 1;
        if (c === "{") tpl[top]++;
        else if (c === "}") {
          if (tpl[top] === 0) {
            tpl.pop();
            state = "template";
            i++;
            continue;
          }
          tpl[top]--;
        }
      }
      if (/[\w$]/.test(c)) {
        lastWord = prevWord ? lastWord + c : c;
        prevWord = true;
        lastSig = c;
      } else {
        prevWord = false;
        if (!/\s/.test(c)) {
          lastSig = c;
          lastWord = "";
        }
      }
      i++;
      continue;
    }

    if (state === "line") {
      if (c === "\n") {
        state = "code";
        prevWord = false;
      } else blank(i, i + 1);
      i++;
      continue;
    }

    if (state === "block") {
      if (text.startsWith(endTok, i)) {
        blank(i, i + endTok.length);
        i += endTok.length;
        state = "code";
      } else {
        blank(i, i + 1);
        i++;
      }
      continue;
    }

    if (state === "string") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === quote) lastSig = c;
      // A single/double-quoted string cannot span lines; resetting here keeps a
      // stray apostrophe in JSX text (`Don't`) from swallowing the rest of the file.
      if (c === quote || c === "\n") state = "code";
      i++;
      continue;
    }

    if (state === "template") {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "`") {
        state = "code";
        lastSig = "`";
        i++;
        continue;
      }
      if (c === "$" && text[i + 1] === "{") {
        tpl.push(0);
        state = "code";
        lastSig = "{";
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (state === "mstring") {
      if (c === "\\" && endTok !== "`") {
        i += 2;
        continue;
      }
      if (text.startsWith(endTok, i)) {
        state = "code";
        lastSig = '"';
        i += endTok.length;
        continue;
      }
      i++;
      continue;
    }

    // regex literal
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "\n") state = "code";
    else if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      state = "code";
      lastSig = "/";
      lastWord = "";
      prevWord = false;
    }
    i++;
  }

  return out.join("");
}

function onlyWhitespaceBefore(text, i) {
  let j = i - 1;
  while (j >= 0 && (text[j] === " " || text[j] === "\t")) j--;
  return j < 0 || text[j] === "\n" || text[j] === "\r";
}

function lineCommentOk(tok, prev) {
  if (tok === "//") return prev !== ":"; // keep URLs like http://… in markup/JSX text
  if (tok === "#") return prev === undefined || !/[\w$&/\\]/.test(prev);
  return true;
}

function regexAllowed(lastSig, lastWord) {
  if (lastSig === "") return true;
  if (/[\w$]/.test(lastSig)) return REGEX_KEYWORDS.has(lastWord);
  return REGEX_PREFIX.has(lastSig);
}
