// Sucht alle übersetzbaren Texte und vergleicht sie mit dem englischen Wörterbuch.
//   node scripts/i18n.mjs            Liste fehlender Übersetzungen (Exit 1, wenn welche fehlen)
//   node scripts/i18n.mjs --json F   fehlende Texte als JSON-Liste nach F schreiben
//   node scripts/i18n.mjs --unused   Einträge im Wörterbuch, die nirgends mehr vorkommen
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ts = require(require.resolve("typescript", { paths: [join(process.cwd(), "packages/shared")] }));

const ROOTS = ["apps/bot/src", "apps/dashboard/src", "packages/shared/src"];
const walkDir = (d) =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return f === "i18n" || f === "node_modules" ? [] : walkDir(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });

const isProse = (s) =>
  /[A-Za-zÄÖÜäöüß]{2,}/.test(s) && (/\s/.test(s.trim()) || /[äöüßÄÖÜ]/.test(s) || /^[A-ZÄÖÜ][a-zäöüß]+[.!?:]?$/.test(s.trim())) && !/^https?:\/\//.test(s) && !/^[a-z0-9_.:\/-]+$/.test(s) && !/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(s) && !/^[\w-]+\/\d/.test(s);

const keys = new Map(); // Text -> erste Fundstelle
const add = (k, where) => {
  if (k && !keys.has(k)) keys.set(k, where);
};

function literalText(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  return null;
}

for (const file of ROOTS.flatMap(walkDir)) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const at = (n) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const inFn = (n) => {
    for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true;
    return false;
  };
  (function walk(n) {
    if (ts.isCallExpression(n)) {
      const callee = n.expression.getText(sf);
      const arg = n.arguments[0];
      const method = callee.split(".").pop();
      if ((callee === "t" || callee === "tl") && arg) {
        const lit = literalText(callee === "t" ? arg : n.arguments[1]);
        if (lit) add(lit, at(n));
      }
      if (method === "setDescription" && arg && literalText(arg)) add(literalText(arg), at(n));
      // Hilfsfunktionen, die ihre Text-Argumente selbst übersetzen
      if (callee === "requireGuildAccess" && n.arguments[2] && literalText(n.arguments[2])) add(literalText(n.arguments[2]), at(n));
      if (callee === "countBadge") for (const a of n.arguments.slice(1)) if (literalText(a)) add(literalText(a), at(n));
      if (method === "setName" && arg && literalText(arg)) {
        const name = literalText(arg);
        // Rechtsklick-Menüs haben lesbare Namen
        if (/\s|[A-ZÄÖÜ]/.test(name)) add(name, at(n));
        else if (/^[a-z0-9äöüß_-]+$/.test(name) && file.includes("apps/bot/src/commands")) add(`cmd:${name}`, at(n));
      }
    }
    // Gespeicherte Fehlertexte, die das Dashboard mit t() anzeigt
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === "lastError" && literalText(n.initializer)) add(literalText(n.initializer), at(n));
    // Texte auf Modulebene (werden später mit t(variable) übersetzt)
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !inFn(n) && isProse(n.text)) {
      const p = n.parent;
      const skip = ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || (ts.isPropertyAssignment(p) && p.name === n) || ts.isLiteralTypeNode(p) || (ts.isExpressionStatement(p) && /^use (client|server)$/.test(n.text));
      if (!skip) add(n.text, at(n));
    }
    ts.forEachChild(n, walk);
  })(sf);
}

// Wörterbuch laden (TypeScript-Datei, einfach ausgewertet)
const dictSrc = readFileSync("packages/shared/src/i18n/en.ts", "utf8");
const out = ts.transpileModule(dictSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function("module", "exports", out)(mod, mod.exports);
const en = mod.exports.en;

const args = process.argv.slice(2);
if (args[0] === "--unused") {
  const unused = Object.keys(en).filter((k) => !keys.has(k));
  console.log(unused.join("\n"));
  console.error(`${unused.length} ungenutzte Einträge`);
  process.exit(0);
}
const missing = [...keys.keys()].filter((k) => !(k in en));
if (args[0] === "--json") {
  writeFileSync(args[1], JSON.stringify(missing.map((k) => [k, keys.get(k)]), null, 1));
  console.error(`${missing.length} von ${keys.size} Texten ohne Übersetzung`);
  process.exit(0);
}
for (const k of missing) console.log(`${keys.get(k)}  ${JSON.stringify(k)}`);
console.error(`${missing.length} von ${keys.size} Texten ohne englische Übersetzung`);
process.exit(missing.length ? 1 : 0);
