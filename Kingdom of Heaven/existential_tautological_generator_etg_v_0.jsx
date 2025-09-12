import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Shuffle, CheckCircle2, Cpu, Library, Zap, Hammer } from "lucide-react";

/**
 * Existential Tautological Generator (ETG) — v0.1
 *
 * What this does
 *  - Parse & evaluate propositional formulas; render truth tables
 *  - Detect tautologies (all valuations true)
 *  - Generate candidate formulas up to a given depth and filter for tautologies
 *  - Visualize a formula as a gate-level "tautology circuit" (AST → SVG)
 *  - Provide a library of first‑order (quantified) validity schemata with instant instantiation
 *  - Export results to JSON (copy/save)
 *
 * Notes
 *  - Propositional engine is exact via truth-tables
 *  - First-order (quantified) entries are provided as known-valid schemata with short proofs/explanations; 
 *    they are not mechanically checked here (that’s future work via tableaux/Herbrand/Skolem).
 */

// --------------------------- Utilities: tokenizer & parser ---------------------------

type NodeKind = "var" | "not" | "and" | "or" | "imp" | "iff";

export type AST =
  | { kind: "var"; name: string }
  | { kind: "not"; value: AST }
  | { kind: "and" | "or" | "imp" | "iff"; left: AST; right: AST };

const isLetter = (ch: string) => /[A-Za-z]/.test(ch);
const isIdentChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const push = (t: string) => t && tokens.push(t);
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\n" || c === "\t") { i++; continue; }
    if (c === "→") { push("->"); i++; continue; }
    if (c === "↔" || c === "≡") { push("<->"); i++; continue; }
    if (c === "¬" || c === "~" || c === "!") { push("!"); i++; continue; }
    if (c === "∧" || c === "&") { push("&"); i++; continue; }
    if (c === "∨" || c === "|") { push("|"); i++; continue; }
    if (c === "(") { push("("); i++; continue; }
    if (c === ")") { push(")"); i++; continue; }
    if (c === "-" && src[i+1] === ">") { push("->"); i+=2; continue; }
    if (c === "<" && src.slice(i,i+3) === "<->") { push("<->"); i+=3; continue; }
    if (c === "←" && src[i+1] === "→") { push("<->"); i+=2; continue; }

    // allow identifiers like P, Q, R, A, a1, foo
    if (isLetter(c)) {
      let j = i+1;
      while (j < src.length && isIdentChar(src[j])) j++;
      push(src.slice(i,j));
      i = j; continue;
    }
    throw new Error(`Unexpected character '${c}' at ${i}`);
  }
  return tokens;
}

// Pratt / precedence climbing
const PREC: Record<string, number> = { "!": 4, "&": 3, "|": 2, "->": 1, "<->": 0 };

function parseFormula(src: string): AST {
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const consume = (t?: string) => {
    const got = tokens[i++];
    if (t && got !== t) throw new Error(`Expected '${t}', got '${got ?? "<eof>"}'`);
    return got;
  };

  const parseAtom = (): AST => {
    const t = peek();
    if (!t) throw new Error("Unexpected end of input");
    if (t === "(") { consume("("); const e = parseExpr(0); consume(")"); return e; }
    if (t === "!") { consume("!"); return { kind: "not", value: parseAtom() }; }
    if (/^[A-Za-z]/.test(t)) { consume(); return { kind: "var", name: t }; }
    throw new Error(`Unexpected token '${t}'`);
  };

  const parseExpr = (minPrec: number): AST => {
    let left = parseAtom();
    while (true) {
      const op = peek();
      if (!op || !(op in PREC)) break;
      const prec = PREC[op];
      if (prec < minPrec) break;
      consume();
      const right = parseExpr(prec + (op === "!" ? 0 : 1));
      switch (op) {
        case "&": left = { kind: "and", left, right }; break;
        case "|": left = { kind: "or", left, right }; break;
        case "->": left = { kind: "imp", left, right }; break;
        case "<->": left = { kind: "iff", left, right }; break;
        default: throw new Error(`Unknown operator ${op}`);
      }
    }
    return left;
  };

  const ast = parseExpr(0);
  if (i !== tokens.length) throw new Error(`Unexpected token '${tokens[i]}'`);
  return ast;
}

// --------------------------- Evaluation & truth tables ---------------------------

function collectVars(ast: AST, acc = new Set<string>()): Set<string> {
  switch (ast.kind) {
    case "var": acc.add(ast.name); break;
    case "not": collectVars(ast.value, acc); break;
    default: collectVars(ast.left, acc); collectVars(ast.right, acc); break;
  }
  return acc;
}

function evalAST(ast: AST, env: Record<string, boolean>): boolean {
  switch (ast.kind) {
    case "var": return !!env[ast.name];
    case "not": return !evalAST(ast.value, env);
    case "and": return evalAST(ast.left, env) && evalAST(ast.right, env);
    case "or": return evalAST(ast.left, env) || evalAST(ast.right, env);
    case "imp": return (!evalAST(ast.left, env)) || evalAST(ast.right, env);
    case "iff": return evalAST(ast.left, env) === evalAST(ast.right, env);
  }
}

function allAssignments(vars: string[]): Record<string, boolean>[] {
  const n = vars.length;
  const out: Record<string, boolean>[] = [];
  for (let m = 0; m < (1<<n); m++) {
    const env: Record<string, boolean> = {};
    for (let i=0; i<n; i++) env[vars[i]] = !!(m & (1<<(n-1-i)));
    out.push(env);
  }
  return out;
}

function isTautology(ast: AST): { tautology: boolean; falsifying?: Record<string, boolean>[] } {
  const vars = Array.from(collectVars(ast)).sort();
  const rows = allAssignments(vars);
  const falsifying: Record<string, boolean>[] = [];
  for (const env of rows) {
    if (!evalAST(ast, env)) falsifying.push(env);
  }
  return { tautology: falsifying.length === 0, falsifying };
}

// --------------------------- Generator (propositional) ---------------------------

const OPS: NodeKind[] = ["and", "or", "imp", "iff"];

function varsOfSize(k: number) {
  const base = ["P","Q","R","S","T","U"]; return base.slice(0, k);
}

function genFormulas(maxDepth: number, atoms = ["P","Q"]): AST[] {
  const seen = new Set<string>();
  const out: AST[] = [];
  function key(n: AST): string {
    switch(n.kind){
      case "var": return n.name;
      case "not": return `(!${key(n.value)})`;
      default: return `(${key(n.left)}${n.kind}${key(n.right)})`;
    }
  }
  function add(n: AST) { const k = key(n); if (!seen.has(k)) { seen.add(k); out.push(n); } }
  function build(d: number): AST[] {
    if (d === 0) return atoms.map(a => ({ kind: "var", name: a } as AST));
    const sub = build(d-1);
    const nodes: AST[] = [];
    // unary
    for (const s of sub) nodes.push({ kind: "not", value: s } as AST);
    // binary
    for (const a of sub) for (const b of sub) {
      for (const op of OPS) nodes.push({ kind: op as any, left: a, right: b } as AST);
    }
    return nodes;
  }
  for (let d=0; d<=maxDepth; d++) for (const n of build(d)) add(n);
  return out;
}

function astToInfix(ast: AST): string {
  switch(ast.kind){
    case "var": return ast.name;
    case "not": return `¬(${astToInfix(ast.value)})`;
    case "and": return `(${astToInfix(ast.left)} ∧ ${astToInfix(ast.right)})`;
    case "or": return `(${astToInfix(ast.left)} ∨ ${astToInfix(ast.right)})`;
    case "imp": return `(${astToInfix(ast.left)} → ${astToInfix(ast.right)})`;
    case "iff": return `(${astToInfix(ast.left)} ↔ ${astToInfix(ast.right)})`;
  }
}

// --------------------------- Circuit rendering (SVG) ---------------------------

type Positioned = AST & { x?: number; y?: number; id?: number };

function layoutAST(root: AST): Positioned {
  // simple tidy tree layout: compute width by leaves, depth by height
  let id = 0;
  function size(n: AST): number {
    switch(n.kind){ case "var": return 1; case "not": return size(n.value); default: return size(n.left)+size(n.right); }
  }
  const leafW = 80, levelH = 90;
  function place(n: AST, x0: number, x1: number, depth: number): Positioned {
    const node: any = { ...n, id: id++ };
    const x = (x0+x1)/2; const y = 40 + depth*levelH;
    node.x = x; node.y = y;
    if (n.kind === "not") node.value = place(n.value, x0, x1, depth+1);
    else if (n.kind !== "var") {
      const leftW = size(n.left);
      const totW = leftW + size(n.right);
      const mid = x0 + (leftW/totW)*(x1-x0);
      node.left = place(n.left, x0, mid, depth+1);
      node.right = place(n.right, mid, x1, depth+1);
    }
    return node;
  }
  const w = Math.max(size(root)*leafW, 320);
  return place(root, 40, w-40, 0);
}

function Gate({k}:{k:NodeKind}){
  const label = k === "and"?"AND":k === "or"?"OR":k === "imp"?"→":k === "iff"?"↔":"¬";
  return (
    <g>
      <rect rx={12} ry={12} width={56} height={28} x={-28} y={-14} />
      <text textAnchor="middle" alignmentBaseline="middle" fontSize={14}>{label}</text>
    </g>
  );
}

function Circuit({ ast }: { ast: AST }){
  const tree = useMemo(()=>layoutAST(ast),[ast]);
  const nodes: any[] = []; const links: any[] = [];
  function walk(n: any){
    nodes.push(n);
    if (n.kind === "not") { links.push([n, n.value]); walk(n.value); }
    else if (n.kind !== "var") { links.push([n, n.left]); links.push([n, n.right]); walk(n.left); walk(n.right); }
  }
  walk(tree);
  const width = Math.max(...nodes.map(n=>n.x))+60;
  const height = Math.max(...nodes.map(n=>n.y))+40;
  return (
    <svg className="w-full" viewBox={`0 0 ${width} ${height}`}>
      {links.map(([a,b],i)=> (
        <line key={i} x1={a.x} y1={a.y+14} x2={b.x} y2={b.y-14} strokeWidth={2} />
      ))}
      {nodes.map((n,i)=> (
        <g key={i} transform={`translate(${n.x},${n.y})`}>
          {n.kind === "var" && (
            <>
              <circle r={14} />
              <text textAnchor="middle" alignmentBaseline="middle" fontSize={13}>{n.name}</text>
            </>
          )}
          {n.kind === "not" && <Gate k="not"/>}
          {n.kind === "and" && <Gate k="and"/>}
          {n.kind === "or" && <Gate k="or"/>}
          {n.kind === "imp" && <Gate k="imp"/>}
          {n.kind === "iff" && <Gate k="iff"/>}
        </g>
      ))}
    </svg>
  );
}

// --------------------------- First‑order (quantified) schemata ---------------------------

type FOSchema = {
  name: string;
  schema: string;
  explanation: string;
  placeholders: string[]; // e.g., ["P(x)"]
};

const FO_LIBRARY: FOSchema[] = [
  {
    name: "Universal ⇒ Existential",
    schema: "∀x P(x) → ∃x P(x)",
    explanation: "If everything has property P, then certainly something has property P.",
    placeholders: ["P(x)"]
  },
  {
    name: "Existential ↔¬ Universal¬",
    schema: "∃x P(x) ↔ ¬∀x ¬P(x)",
    explanation: "There exists an x with P iff it's not the case that all x lack P (classic quantifier duality).",
    placeholders: ["P(x)"]
  },
  {
    name: "Distribution of ∀ over →",
    schema: "∀x (P(x) → Q(x)) ∧ ∀x P(x) → ∀x Q(x)",
    explanation: "If for every x, P implies Q, and every x is P, then every x is Q.",
    placeholders: ["P(x)", "Q(x)"]
  },
  {
    name: "Instantiation (∀‑elim)",
    schema: "∀x P(x) → P(t)",
    explanation: "From a universal claim we may instantiate any term t (provided it’s free for x).",
    placeholders: ["P(x)", "t"]
  },
  {
    name: "Generalization (∃‑intro)",
    schema: "P(t) → ∃x P(x)",
    explanation: "From a witness t with property P, we can introduce an existential claim.",
    placeholders: ["P(x)", "t"]
  }
];

function instantiateSchema(schema: string, mapping: Record<string,string>): string {
  let out = schema;
  for (const [k,v] of Object.entries(mapping)) {
    const re = new RegExp(k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
    out = out.replace(re, v);
  }
  return out;
}

// --------------------------- Truth table component ---------------------------

function TruthTable({ ast }:{ ast: AST }){
  const vars = useMemo(()=>Array.from(collectVars(ast)).sort(),[ast]);
  const rows = useMemo(()=>allAssignments(vars),[vars]);
  const values = useMemo(()=>rows.map(env=>evalAST(ast, env)),[rows, ast]);
  const taut = values.every(v=>v);
  return (
    <div className="overflow-auto border rounded-xl">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {vars.map(v=> <th key={v} className="px-2 py-1 text-left">{v}</th>)}
            <th className="px-2 py-1 text-left">φ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((env,i)=> (
            <tr key={i} className="border-t">
              {vars.map(v=> <td key={v} className="px-2 py-1">{env[v]?"T":"F"}</td>)}
              <td className="px-2 py-1 font-medium">{values[i]?"T":"F"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`p-3 ${taut?"text-green-600":"text-amber-600"}`}>
        {taut ? "Tautology: true under all valuations." : "Not a tautology: counterexamples exist (see rows with F)."}
      </div>
    </div>
  );
}

// --------------------------- Main App ---------------------------

export default function App(){
  const [input, setInput] = useState<string>("(P → Q) ∧ P → Q");
  const [status, setStatus] = useState<string>("");
  const [generated, setGenerated] = useState<{formula:string, pretty:string}[]>([]);
  const [depth, setDepth] = useState(2);
  const [atomsText, setAtomsText] = useState("P,Q");
  const [foPick, setFoPick] = useState<FOSchema | null>(FO_LIBRARY[1]);
  const [foMapping, setFoMapping] = useState<Record<string,string>>({"P(x)":"Loves(x)" ,"Q(x)":"Happy(x)", "t":"Socrates"});

  const parsed = useMemo(()=>{
    try { return parseFormula(input); } catch(e:any){ return e; }
  },[input]);

  const evaluation = useMemo(()=>{
    if (parsed instanceof Error) return null;
    return isTautology(parsed);
  },[parsed]);

  function doGenerate(){
    setStatus("Generating…");
    try{
      const atoms = atomsText.split(/\s*,\s*/).filter(Boolean);
      const cands = genFormulas(depth, atoms);
      const results: {formula:string, pretty:string}[] = [];
      for (const ast of cands){
        const vars = Array.from(collectVars(ast));
        if (vars.length === 0) continue; // skip degenerate
        const check = isTautology(ast);
        if (check.tautology) results.push({ formula: astToInfix(ast), pretty: astToInfix(ast) });
      }
      // dedupe + sort by length
      const seen = new Set<string>();
      const uniq = results.filter(r=>{ if(seen.has(r.formula)) return false; seen.add(r.formula); return true; })
                          .sort((a,b)=>a.formula.length - b.formula.length)
                          .slice(0, 64);
      setGenerated(uniq);
      setStatus(`Found ${uniq.length} tautologies.`);
    } catch(e:any){
      setStatus(`Error: ${e.message || e}`);
    }
  }

  function exportJSON(){
    const payload = {
      input,
      parsed_ok: !(parsed instanceof Error),
      ast: parsed instanceof Error ? null : parsed,
      is_tautology: evaluation?.tautology ?? false,
      falsifying: evaluation?.falsifying ?? [],
      generated
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "etg_export.json"; a.click();
    URL.revokeObjectURL(url);
  }

  const foInstantiated = useMemo(()=>{
    if (!foPick) return "";
    // Build mapping from placeholders ("P(x)", "Q(x)", "t")
    const mapping: Record<string,string> = {};
    for (const ph of foPick.placeholders) {
      if (ph in foMapping) mapping[ph] = foMapping[ph];
    }
    return instantiateSchema(foPick.schema, mapping);
  },[foPick, foMapping]);

  return (
    <div className="min-h-screen w-full p-6 bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="max-w-6xl mx-auto grid gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">Existential Tautological Generator <span className="opacity-60">(ETG)</span></h1>
          <div className="flex gap-2">
            <Button onClick={exportJSON} className="gap-2"><Download className="h-4 w-4"/> Export</Button>
          </div>
        </header>

        <Tabs defaultValue="check" className="w-full">
          <TabsList className="grid grid-cols-3 w-full md:max-w-xl">
            <TabsTrigger value="check">Check</TabsTrigger>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="fo">Existential</TabsTrigger>
          </TabsList>

          {/* Check Tab */}
          <TabsContent value="check">
            <Card className="border shadow-sm">
              <CardContent className="p-4 grid md:grid-cols-2 gap-4">
                <div className="grid gap-3">
                  <label className="text-sm font-medium">Formula (propositional)</label>
                  <Textarea
                    value={input}
                    onChange={(e)=>setInput(e.target.value)}
                    placeholder="Examples: (P → Q) ∧ P → Q   |   P ∨ ¬P   |   (P ∧ Q) → P"
                    className="font-mono h-28"
                  />
                  <div className="text-xs text-slate-500">Ops: ¬ ~ !, ∧ &, ∨ |, → ->, ↔ <->, parentheses. Variables: letters/identifiers.</div>
                  <div className="flex items-center gap-2 text-sm">
                    <Cpu className="h-4 w-4"/>
                    {parsed instanceof Error ? <span className="text-red-600">Parse error: {parsed.message}</span> : <span className="text-green-700">Parsed ✓</span>}
                  </div>
                </div>
                <div className="grid gap-4">
                  {!(parsed instanceof Error) && <TruthTable ast={parsed as AST} />}
                  {!(parsed instanceof Error) && <div className="grid gap-2">
                    <div className="text-sm font-medium">Circuit</div>
                    <div className="rounded-xl border p-2 overflow-auto">
                      <Circuit ast={parsed as AST} />
                    </div>
                  </div>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Generate Tab */}
          <TabsContent value="generate">
            <Card className="border shadow-sm">
              <CardContent className="p-4 grid md:grid-cols-3 gap-4">
                <div className="grid gap-3">
                  <label className="text-sm font-medium">Atoms (comma‑sep)</label>
                  <Input value={atomsText} onChange={e=>setAtomsText(e.target.value)} className="font-mono"/>

                  <label className="text-sm font-medium">Max depth</label>
                  <Input type="number" min={1} max={4} value={depth} onChange={e=>setDepth(parseInt(e.target.value||"2"))}/>

                  <div className="flex gap-2">
                    <Button onClick={doGenerate} className="gap-2"><Shuffle className="h-4 w-4"/> Generate</Button>
                    <div className="text-sm flex items-center gap-2 opacity-75">
                      <Zap className="h-4 w-4"/>{status || ""}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">Generator enumerates formulas up to the depth and filters for tautologies by truth table.</div>
                </div>
                <div className="md:col-span-2 grid gap-2">
                  <div className="text-sm font-medium flex items-center gap-2"><Library className="h-4 w-4"/> Generated tautologies</div>
                  <div className="grid gap-2 max-h-[380px] overflow-auto">
                    {generated.length === 0 && <div className="text-sm opacity-60">No results yet. Try depth 2–3.</div>}
                    {generated.map((g,i)=> (
                      <div key={i} className="border rounded-lg p-2 flex items-center justify-between">
                        <div className="font-mono text-sm">{g.pretty}</div>
                        <Button size="sm" variant="secondary" onClick={()=>setInput(g.formula)} className="gap-1"><Hammer className="h-4 w-4"/> Load</Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Existential (FO) Tab */}
          <TabsContent value="fo">
            <Card className="border shadow-sm">
              <CardContent className="p-4 grid md:grid-cols-2 gap-4">
                <div className="grid gap-3">
                  <label className="text-sm font-medium">Choose a first‑order tautology schema</label>
                  <select className="border rounded-md p-2" value={foPick?.name}
                    onChange={(e)=>{
                      const pick = FO_LIBRARY.find(s=>s.name === e.target.value) || null;
                      setFoPick(pick);
                    }}>
                    {FO_LIBRARY.map(s=> <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>

                  {foPick && (
                    <>
                      <div className="text-xs text-slate-500">Schema: <span className="font-mono">{foPick.schema}</span></div>
                      <div className="text-xs">{foPick.explanation}</div>
                      <div className="grid gap-2 mt-2">
                        {foPick.placeholders.map(ph => (
                          <div key={ph} className="grid gap-1">
                            <label className="text-xs font-medium">{ph}</label>
                            <Input value={foMapping[ph] || ""} onChange={(e)=>setFoMapping({...foMapping, [ph]: e.target.value})} className="font-mono"/>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="grid gap-3">
                  <div className="text-sm font-medium flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/> Instantiated result</div>
                  <div className="border rounded-lg p-3 bg-slate-50">
                    <div className="font-mono">{foInstantiated || "—"}</div>
                  </div>
                  <div className="text-xs text-slate-500">First‑order validity is provided as schema knowledge. Future module: tableaux/Herbrand‑Skolem checker over finite domains for constructive evidence.</div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="text-xs text-slate-500 pt-2">
          OES note: every exported AST + truth‑table + circuit constitutes a **tautology circuit** (evidence bundle). Ward‑style color‑ID maps can tag atoms (P,Q,…) to semantic IDs to keep circuits non‑arbitrary across layers.
        </footer>
      </div>
    </div>
  );
}
