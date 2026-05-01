"use client";

import { motion, AnimatePresence } from "framer-motion";
import { JetBrains_Mono } from "next/font/google";
import { useCallback, useEffect, useRef, useState } from "react";
import VirtualKeyboard from "@/components/VirtualKeyboard";

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = "Junior" | "Middle" | "Senior";
type Device = "Win" | "Mac";
type Lang = "TypeScript" | "Python" | "Rust";
type TypedEntry = { char: string; correct: boolean } | null;
type HotkeyCombo = {
  id: string;
  label: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};
type BestStats = { wpm: number; accuracy: number };
type FetchStatus = "idle" | "loading" | "ready" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

const BEST_STATS_KEY = "keyflow.best-stats.v1";
const SNIPPET_CACHE_KEY = "keyflow.snippet-cache.v2";
const SESSION_MIN = 1;
const SESSION_MAX = 20;
const PREFETCH_COUNT = 8; // how many snippets to buffer ahead

// ─── GitHub targets ───────────────────────────────────────────────────────────

const GITHUB_TARGETS: Record<Lang, Record<Level, { repo: string; paths: string[] }[]>> = {
  TypeScript: {
    Junior: [
      { repo: "microsoft/vscode", paths: ["src/vs/base/common/"] },
      { repo: "facebook/react", paths: ["packages/react/src/"] },
      { repo: "vercel/next.js", paths: ["packages/next/src/client/"] },
    ],
    Middle: [
      { repo: "microsoft/vscode", paths: ["src/vs/editor/common/"] },
      { repo: "vercel/next.js", paths: ["packages/next/src/server/"] },
      { repo: "trpc/trpc", paths: ["packages/server/src/"] },
    ],
    Senior: [
      { repo: "microsoft/TypeScript", paths: ["src/compiler/"] },
      { repo: "microsoft/vscode", paths: ["src/vs/workbench/"] },
      { repo: "prisma/prisma", paths: ["packages/client/src/"] },
    ],
  },
  Python: {
    Junior: [
      { repo: "django/django", paths: ["django/utils/"] },
      { repo: "pallets/flask", paths: ["src/flask/"] },
      { repo: "psf/requests", paths: ["requests/"] },
    ],
    Middle: [
      { repo: "django/django", paths: ["django/db/"] },
      { repo: "fastapi/fastapi", paths: ["fastapi/"] },
      { repo: "sqlalchemy/sqlalchemy", paths: ["lib/sqlalchemy/"] },
    ],
    Senior: [
      { repo: "django/django", paths: ["django/core/"] },
      { repo: "python/cpython", paths: ["Lib/asyncio/"] },
      { repo: "celery/celery", paths: ["celery/"] },
    ],
  },
  Rust: {
    Junior: [
      { repo: "rust-lang/rust", paths: ["library/std/src/"] },
      { repo: "tokio-rs/tokio", paths: ["tokio/src/"] },
      { repo: "serde-rs/serde", paths: ["serde/src/"] },
    ],
    Middle: [
      { repo: "rust-lang/rust", paths: ["compiler/rustc_ast/src/"] },
      { repo: "tokio-rs/tokio", paths: ["tokio/src/runtime/"] },
      { repo: "diesel-rs/diesel", paths: ["diesel/src/"] },
    ],
    Senior: [
      { repo: "rust-lang/rust", paths: ["compiler/rustc_typeck/src/"] },
      { repo: "rust-lang/rust", paths: ["compiler/rustc_middle/src/"] },
      { repo: "tokio-rs/tokio", paths: ["tokio/src/sync/"] },
    ],
  },
};

// ─── Fallback snippets (local) ────────────────────────────────────────────────

const FALLBACK_SNIPPETS: Record<Lang, Record<Level, string[]>> = {
  TypeScript: {
    Junior: [
      "const x = 10;",
      "let name = 'KeyFlow';",
      "console.log(userId);",
      "const isOpen = true;",
      "const total = price + tax;",
      "return value ?? 0;",
    ],
    Middle: [
      "useEffect(() => { fetchData(); }, [userId]);",
      "const view = useMemo(() => build(list), [list]);",
      "function sum(a: number, b: number): number { return a + b; }",
      "const map = new Map<string, number>();",
      "if (!token) throw new Error('Unauthorized');",
      "const grouped = data.reduce((acc, item) => acc + item.count, 0);",
    ],
    Senior: [
      "type Guard<T> = T extends Promise<infer U> ? U : never;",
      "interface Repository<T extends Record<string, unknown>> { find<K extends keyof T>(key: K): Promise<T[K]>; }",
      "const merged = sources.reduce((acc, src) => ({ ...acc, ...src?.payload?.meta }), {} as Record<string, unknown>);",
      "function createStore<TState extends object>(initial: TState): { get: () => TState; set: (p: Partial<TState>) => void } {",
      "export const App = <T extends unknown>({ data }: Props<T>) => {",
    ],
  },
  Python: {
    Junior: [
      "x = 10",
      "name = 'KeyFlow'",
      "print(user_id)",
      "is_open = True",
      "total = price + tax",
    ],
    Middle: [
      "def sum_values(a, b):\n    return a + b",
      "for item in items:\n    process(item)",
      "async def load(url):\n    return await fetch_json(url)",
    ],
    Senior: [
      "@cache\nasync def get_user(user_id: str) -> dict[str, str]:\n    return await repo.fetch(user_id)",
      "class Repo(Generic[T]):\n    async def find(self, key: str) -> T | None:\n        return self.storage.get(key)",
    ],
  },
  Rust: {
    Junior: [
      "let x = 10;",
      "let name = \"KeyFlow\";",
      "println!(\"{}\", user_id);",
      "let fallback = value.unwrap_or(0);",
    ],
    Middle: [
      "for item in items.iter() { process(item); }",
      "let mapped: Vec<i32> = values.iter().map(|v| v * 2).collect();",
      "match status { Ok(v) => v, Err(_) => 0 }",
    ],
    Senior: [
      "fn project<T, F>(items: &[T], key: F) -> HashMap<String, &T> where F: Fn(&T) -> String {",
      "async fn fetch_all<T: DeserializeOwned>(client: &Client, urls: &[String]) -> Result<Vec<T>, Error> {",
    ],
  },
};

// ─── Hotkeys ──────────────────────────────────────────────────────────────────

const HOTKEY_COMBOS_BY_DEVICE: Record<Device, HotkeyCombo[]> = {
  Win: [
    { id: "win-ctrl-shift-p", label: "Ctrl + Shift + P", key: "p", ctrl: true, shift: true },
    { id: "win-ctrl-slash", label: "Ctrl + /", key: "/", ctrl: true },
    { id: "win-ctrl-k", label: "Ctrl + K", key: "k", ctrl: true },
    { id: "win-ctrl-d", label: "Ctrl + D", key: "d", ctrl: true },
  ],
  Mac: [
    { id: "mac-cmd-d", label: "Cmd + D", key: "d", meta: true },
    { id: "mac-cmd-shift-p", label: "Cmd + Shift + P", key: "p", meta: true, shift: true },
    { id: "mac-cmd-k", label: "Cmd + K", key: "k", meta: true },
    { id: "mac-cmd-enter", label: "Cmd + Enter", key: "enter", meta: true },
  ],
};

// ─── GitHub Fetcher ───────────────────────────────────────────────────────────

// ─── Line quality filters ─────────────────────────────────────────────────────

// Patterns that definitively mark a line as NON-code (prose, comments, annotations)
const REJECT_RE = [
  /^\/\//, // TS/Rust single-line comment
  /^#/, // Python comment (with or without space)
  /^\*/, // JSDoc continuation
  /^"""/, /^'''/, // Python docstring delimiters
  /[.!?]\s*$/, // ends with sentence punctuation → prose
  /\b(are|is|the|and|or|but|for|with|that|this|from|have|been|will|would|should|could|might|may|when|where|which|these|those|their|there|they|was|were|a |an )\b/i,
  /TODO|FIXME|HACK|NOTE|WARN|XXX/i,
  /^\s*\d+[\s.):]/, // numbered list
  /^[-*+]\s/, // markdown bullet
  /^import\s+\w+\s*$/, // bare "import foo" (trivial)
  /^use\s+\w+::\*;?$/, // Rust glob import
  /^(pub\s+)?(use|mod)\s+[\w:]+;$/, // simple Rust use/mod
];

// Extra patterns that mark a line as TOO COMPLEX for Junior
const SENIOR_ONLY_RE = [
  /\bwhere\b/, // Rust/TS generic constraints
  /<[A-Z][A-Za-z]*(\s*,\s*[A-Z])*>/, // generics <T>, <T, U>
  /Callable\[|Coroutine\[|TypeVar\(|Protocol\b/, // Python advanced types
  /ft\.|t\.Any|t\.Optional|typing\./, // Django-style typing helpers
  /\bimpl\b.*\bfor\b/, // Rust impl Trait for Type
  /\bdyn\b/, // Rust dyn Trait
  /Result<|Option<|Vec<|HashMap</, // Rust generic containers
  /\binfer\b|\bnever\b/, // TS conditional types
  /\bRecord<|Partial<|Required<|Readonly</, // TS utility types
  /#\[(?!derive)/, // Rust attributes (non-derive)
];

function isCodeLine(line: string): boolean {
  const t = line.trim();
  // Must have at least one code signal
  if (!/[(){}\[\]=;:<>|&!?]/.test(t) && !/=>|->|\.\w+\(/.test(t)) return false;
  // Reject prose / comment lines
  for (const re of REJECT_RE) {
    if (re.test(t)) return false;
  }
  return true;
}

function specialCharDensity(s: string): number {
  const special = s.replace(/[a-zA-Z0-9\s_]/g, "").length;
  return special / Math.max(s.length, 1);
}

// Difficulty score 0..1
function difficultyScore(line: string): number {
  const density = specialCharDensity(line);
  // Bonus points for each complexity signal
  let bonus = 0;
  if (/<[A-Z]/.test(line) || /\bwhere\b/.test(line)) bonus += 0.18; // generics
  if (/async|await|Promise|Future|tokio/.test(line)) bonus += 0.10;
  if (/:\s*[A-Z]|\btype\b|\binterface\b|\bimpl\b|\btrait\b|->/.test(line)) bonus += 0.10;
  if (/Callable\[|TypeVar|Protocol|Generic/.test(line)) bonus += 0.15; // Python advanced
  if (/self\._\w+.*:\s*\w+.*=/.test(line)) bonus += 0.15; // Python typed self attrs
  if (/Result<|Option<|Vec<|HashMap</.test(line)) bonus += 0.12; // Rust containers
  const lenScore = Math.min(line.length / 180, 1) * 0.08;
  return Math.min(density + bonus + lenScore, 1);
}

const MIN_LINE_LEN = 20;
const MAX_LINE_LEN = 160;

// Non-overlapping difficulty bands
const DIFFICULTY_RANGE: Record<Level, [number, number]> = {
  Junior: [0.04, 0.20], // simple assignments, basic calls, no types
  Middle: [0.20, 0.42], // typed functions, closures, basic generics
  Senior: [0.42, 1.00], // generics, traits, complex types
};

function extractSnippet(code: string, level: Level): string | null {
  const [minD, maxD] = DIFFICULTY_RANGE[level];

  let candidates = code
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= MIN_LINE_LEN && l.length <= MAX_LINE_LEN)
    .filter(isCodeLine)
    .filter((l) => {
      // Hard-reject senior-only patterns for Junior and Middle
      if (level !== "Senior") {
        for (const re of SENIOR_ONLY_RE) {
          if (re.test(l)) return false;
        }
      }
      const score = difficultyScore(l);
      return score >= minD && score <= maxD;
    });

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function fetchGithubFileList(
  repo: string,
  path: string,
  lang: Lang,
  token?: string
): Promise<string[]> {
  const ext: Record<Lang, string> = { TypeScript: ".ts", Python: ".py", Rust: ".rs" };
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const items: { name: string; download_url: string | null; type: string }[] = await res.json();

  return items
    .filter((item) => item.type === "file" && item.name.endsWith(ext[lang]) && item.download_url)
    .map((item) => item.download_url!);
}

async function fetchRawFile(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Raw fetch ${res.status}`);
  return res.text();
}

async function fetchSnippetFromGitHub(
  lang: Lang,
  level: Level,
  token?: string
): Promise<string> {
  const targets = GITHUB_TARGETS[lang][level];
  const target = targets[Math.floor(Math.random() * targets.length)];
  const path = target.paths[Math.floor(Math.random() * target.paths.length)];

  const urls = await fetchGithubFileList(target.repo, path, lang, token);
  if (urls.length === 0) throw new Error("No files found");

  // Try up to 5 random files
  for (let attempt = 0; attempt < 5; attempt++) {
    const url = urls[Math.floor(Math.random() * urls.length)];
    try {
      const raw = await fetchRawFile(url);
      const snippet = extractSnippet(raw, level);
      if (snippet) return snippet;
    } catch {
      continue;
    }
  }
  throw new Error("Could not extract a valid snippet");
}

// ─── Snippet Cache / Pool ─────────────────────────────────────────────────────

type SnippetPool = { lang: Lang; level: Level; snippets: string[] };

async function buildSnippetPool(
  lang: Lang,
  level: Level,
  count: number,
  token?: string
): Promise<string[]> {
  const results: string[] = [];
  const promises = Array.from({ length: count }, () =>
    fetchSnippetFromGitHub(lang, level, token).catch(() => null)
  );
  const settled = await Promise.all(promises);
  for (const s of settled) {
    if (s) results.push(s);
  }

  // Fill with fallbacks if needed
  while (results.length < count) {
    const fb = FALLBACK_SNIPPETS[lang][level];
    results.push(fb[Math.floor(Math.random() * fb.length)]);
  }

  return results;
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function SkeletonLoader() {
  return (
    <section className="rounded-xl border border-white/10 bg-black/30 p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white/60" />
          <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
        </div>
      </div>
      <div className="space-y-3 min-h-24">
        {[90, 75, 85, 60, 70].map((w, i) => (
          <div
            key={i}
            className="h-5 animate-pulse rounded bg-white/8"
            style={{
              width: `${w}%`,
              animationDelay: `${i * 80}ms`,
              opacity: 1 - i * 0.12,
            }}
          />
        ))}
      </div>
      <p className="mt-4 text-xs text-zinc-600 animate-pulse">Fetching real code from GitHub…</p>
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DifficultyTabs({ value, onChange }: { value: Level; onChange: (level: Level) => void }) {
  const levels: Level[] = ["Junior", "Middle", "Senior"];
  return (
    <div className="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
      {levels.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={`rounded-lg px-4 py-2 text-sm transition ${
            value === level ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

function LanguageTabs({
  value,
  onChange,
  fetchStatus,
}: {
  value: Lang;
  onChange: (lang: Lang) => void;
  fetchStatus: FetchStatus;
}) {
  const langs: Lang[] = ["TypeScript", "Python", "Rust"];
  return (
    <div className="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
      {langs.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          className={`relative rounded-lg px-4 py-2 text-sm transition ${
            value === lang ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          {lang}
          {value === lang && fetchStatus === "loading" && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          )}
          {value === lang && fetchStatus === "ready" && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400" />
          )}
          {value === lang && fetchStatus === "error" && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-400" />
          )}
        </button>
      ))}
    </div>
  );
}

function DeviceTabs({ value, onChange }: { value: Device; onChange: (device: Device) => void }) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
      {(["Win", "Mac"] as Device[]).map((device) => (
        <button
          key={device}
          type="button"
          onClick={() => onChange(device)}
          className={`rounded-lg px-3 py-2 text-sm transition ${
            value === device ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10 hover:text-white"
          }`}
        >
          {device}
        </button>
      ))}
    </div>
  );
}

function StatsBar({ wpm, accuracy, best }: { wpm: number; accuracy: number; best: BestStats }) {
  return (
    <section className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
      {[
        { label: "WPM", value: wpm.toFixed(0) },
        { label: "Accuracy", value: `${accuracy.toFixed(1)}%` },
        { label: "Best WPM", value: best.wpm.toFixed(0) },
        { label: "Best Accuracy", value: `${best.accuracy.toFixed(1)}%` },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-xl border border-white/10 bg-black/30 p-4">
          <p className="text-zinc-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
        </div>
      ))}
    </section>
  );
}

function FetchBadge({ status, usingFallback }: { status: FetchStatus; usingFallback: boolean }) {
  if (status === "idle") return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
          status === "loading"
            ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
            : status === "error" || usingFallback
            ? "border-red-400/30 bg-red-400/10 text-red-300"
            : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
        }`}
      >
        {status === "loading" && (
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        )}
        {(status === "error" || usingFallback) && (
          <span className="h-2 w-2 rounded-full bg-red-400" />
        )}
        {status === "ready" && !usingFallback && (
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        )}
        {status === "loading"
          ? "Fetching from GitHub…"
          : usingFallback
          ? "Offline — using local snippets"
          : ""}
      </motion.div>
    </AnimatePresence>
  );
}

function TypingEngine({
  text,
  entries,
  cursorIndex,
  caretPos,
  caretVisible,
  shakeNonce,
  isHotkeySnippet,
}: {
  text: string;
  entries: TypedEntry[];
  cursorIndex: number;
  caretPos: { x: number; y: number; h: number };
  caretVisible: boolean;
  shakeNonce: number;
  isHotkeySnippet: boolean;
}) {
  const x = shakeNonce > 0 ? [0, -10, 10, -8, 8, -4, 4, 0] : 0;
  return (
    <motion.section
      className="rounded-xl border border-white/10 bg-black/30 p-5 md:p-6"
      animate={{ x }}
      transition={{ duration: 0.35 }}
    >
      <div className="mb-4 flex items-center justify-between text-xs text-zinc-400">
        <span>Type to start</span>
        {isHotkeySnippet && <span className="text-amber-300 animate-pulse">⌨ Hotkey Challenge</span>}
      </div>
      <div className="relative min-h-24 leading-8">
        <div className="flex flex-wrap">
          {text.split("").map((char, index) => {
            const entry = entries[index];
            let colorClass = "text-zinc-600";
            if (entry?.correct) colorClass = "text-white";
            else if (entry && !entry.correct) colorClass = "text-red-500";
            return (
              <span
                key={`${index}-${char}`}
                className={`${colorClass} relative text-[20px]`}
                data-char-index={index}
              >
                {char === " " ? "\u00A0" : char === "\n" ? "↵\n" : char}
              </span>
            );
          })}
        </div>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 w-[2px] rounded bg-white shadow-[0_0_12px_2px_rgba(255,255,255,0.8)]"
          animate={{ x: caretPos.x, y: caretPos.y, height: caretPos.h }}
          transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.2 }}
          style={{
            opacity:
              !isHotkeySnippet && cursorIndex <= text.length && caretVisible ? 1 : 0,
          }}
        />
      </div>
    </motion.section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [level, setLevel] = useState<Level>("Junior");
  const [lang, setLang] = useState<Lang>("TypeScript");
  const [sessionLength, setSessionLength] = useState(5);
  const [device, setDevice] = useState<Device>("Win");
  const [hotkeysMode, setHotkeysMode] = useState(false);

  // Snippet pool state
  const [snippetPool, setSnippetPool] = useState<string[]>([]);
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>("idle");
  const [usingFallback, setUsingFallback] = useState(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // Session state
  const [queue, setQueue] = useState<string[]>([]);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [entries, setEntries] = useState<TypedEntry[]>([]);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [lockedErrorIndex, setLockedErrorIndex] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [errorCount, setErrorCount] = useState(0);
  const [caretPos, setCaretPos] = useState({ x: 0, y: 0, h: 28 });
  const [caretVisible, setCaretVisible] = useState(true);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [bestStats, setBestStats] = useState<BestStats>({ wpm: 0, accuracy: 0 });
  const [currentHotkeyCombo, setCurrentHotkeyCombo] = useState<HotkeyCombo | null>(null);
  const [hotkeyTriggerPoints, setHotkeyTriggerPoints] = useState<number[]>([]);
  const [lastResult, setLastResult] = useState<{ char: string; correct: boolean } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const charRefs = useRef<Array<HTMLSpanElement | null>>([]);

  const currentSnippet = queue[segmentIndex] ?? "";
  const targetText = currentHotkeyCombo
    ? `HOTKEY >> ${currentHotkeyCombo.label}`
    : currentSnippet;

  // ── GitHub fetch pool ──────────────────────────────────────────────────────

  const githubToken =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_GITHUB_TOKEN
      : undefined;

  const loadSnippetPool = useCallback(
    async (l: Lang, lv: Level) => {
      // Cancel any in-flight fetch
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      setFetchStatus("loading");
      setUsingFallback(false);

      try {
        const pool = await buildSnippetPool(l, lv, PREFETCH_COUNT, githubToken);
        if (controller.signal.aborted) return;
        setSnippetPool(pool);
        setFetchStatus("ready");
        setUsingFallback(false);
      } catch {
        if (controller.signal.aborted) return;
        // Fallback to local
        const fb = FALLBACK_SNIPPETS[l][lv];
        const filled = Array.from(
          { length: PREFETCH_COUNT },
          () => fb[Math.floor(Math.random() * fb.length)]
        );
        setSnippetPool(filled);
        setFetchStatus("error");
        setUsingFallback(true);
      }
    },
    [githubToken]
  );

  // Trigger fetch when lang or level changes
  useEffect(() => {
    loadSnippetPool(lang, level);
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [lang, level, loadSnippetPool]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const buildHotkeyTriggers = useCallback((snippetLength: number) => {
    if (snippetLength < 10) return [];
    const points: number[] = [];
    const count = Math.max(1, Math.floor(snippetLength / 28));
    for (let i = 0; i < count; i++) {
      const point = 4 + Math.floor(Math.random() * Math.max(4, snippetLength - 8));
      if (!points.includes(point)) points.push(point);
    }
    return points.sort((a, b) => a - b);
  }, []);

  const pickSessionQueue = useCallback(
    (pool: string[]) => {
      const source = pool.length >= sessionLength ? pool : FALLBACK_SNIPPETS[lang][level];
      const result: string[] = [];
      let previous: string | null = null;
      for (let i = 0; i < sessionLength; i++) {
        const candidates = source.filter((item) => item !== previous);
        const base = candidates.length > 0 ? candidates : source;
        const selected = base[Math.floor(Math.random() * base.length)];
        result.push(selected);
        previous = selected;
      }
      return result;
    },
    [lang, level, sessionLength]
  );

  const initSession = useCallback(
    (pool?: string[]) => {
      const currentPool = pool ?? snippetPool;
      const nextQueue = pickSessionQueue(
        currentPool.length > 0 ? currentPool : FALLBACK_SNIPPETS[lang][level]
      );
      setQueue(nextQueue);
      setSegmentIndex(0);
      setEntries([]);
      setCursorIndex(0);
      setLockedErrorIndex(null);
      setStartedAt(null);
      setCompletedAt(null);
      setSessionComplete(false);
      setErrorCount(0);
      setShakeNonce(0);
      setCurrentHotkeyCombo(null);
      setHotkeyTriggerPoints(
        hotkeysMode ? buildHotkeyTriggers(nextQueue[0]?.length ?? 0) : []
      );

      // Background-refill pool if running low
      if (currentPool.length < sessionLength + 2) {
        loadSnippetPool(lang, level);
      }
    },
    [
      buildHotkeyTriggers,
      hotkeysMode,
      lang,
      level,
      loadSnippetPool,
      pickSessionQueue,
      sessionLength,
      snippetPool,
    ]
  );

  // Auto-start session once pool is ready the first time
  const poolReadyOnce = useRef(false);
  useEffect(() => {
    if (fetchStatus === "ready" || fetchStatus === "error") {
      if (!poolReadyOnce.current || queue.length === 0) {
        poolReadyOnce.current = true;
        initSession(snippetPool);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchStatus]);

  // Reset pool-ready flag when lang/level changes so next ready triggers new session
  useEffect(() => {
    poolReadyOnce.current = false;
    setQueue([]);
  }, [lang, level]);

  // ── Timers / caretVisible ──────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(BEST_STATS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as BestStats;
      if (typeof parsed.wpm === "number") setBestStats(parsed);
    } catch {
      window.localStorage.removeItem(BEST_STATS_KEY);
    }
  }, []);

  useEffect(() => {
    if (!startedAt || sessionComplete) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sessionComplete, startedAt]);

  useEffect(() => {
    const id = window.setInterval(() => setCaretVisible((prev) => !prev), 520);
    return () => window.clearInterval(id);
  }, []);

  // ── Caret position ─────────────────────────────────────────────────────────

  const updateCaretPosition = useCallback(() => {
    const currentChar = charRefs.current[cursorIndex];
    if (currentChar) {
      setCaretPos({
        x: currentChar.offsetLeft - 1,
        y: currentChar.offsetTop,
        h: currentChar.offsetHeight,
      });
      return;
    }
    const lastChar = charRefs.current[targetText.length - 1];
    if (lastChar) {
      setCaretPos({
        x: lastChar.offsetLeft + lastChar.offsetWidth - 1,
        y: lastChar.offsetTop,
        h: lastChar.offsetHeight,
      });
      return;
    }
    setCaretPos({ x: 0, y: 0, h: 28 });
  }, [cursorIndex, targetText.length]);

  useEffect(() => {
    updateCaretPosition();
  }, [entries, updateCaretPosition]);

  useEffect(() => {
    const onResize = () => updateCaretPosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updateCaretPosition]);

  // ── Keyboard handler ───────────────────────────────────────────────────────

  const isComboMatch = useCallback((event: KeyboardEvent, combo: HotkeyCombo) => {
    return (
      event.key.toLowerCase() === combo.key &&
      !!combo.ctrl === event.ctrlKey &&
      !!combo.shift === event.shiftKey &&
      !!combo.alt === event.altKey &&
      !!combo.meta === event.metaKey
    );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        initSession();
        return;
      }
      if (sessionComplete) return;

      if (currentHotkeyCombo) {
        event.preventDefault();
        if (isComboMatch(event, currentHotkeyCombo)) setCurrentHotkeyCombo(null);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key === "Tab") event.preventDefault();

      if (key === "Backspace") {
        event.preventDefault();
        if (lockedErrorIndex !== null) {
          setEntries((prev) => {
            const next = [...prev];
            next[lockedErrorIndex] = null;
            return next;
          });
          setCursorIndex(lockedErrorIndex);
          setLockedErrorIndex(null);
          return;
        }
        setEntries((prev) => {
          const next = [...prev];
          const deleteIndex = Math.max(cursorIndex - 1, 0);
          next[deleteIndex] = null;
          return next;
        });
        setCursorIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (key.length !== 1 || cursorIndex >= targetText.length) return;
      event.preventDefault();

      if (!startedAt) {
        const t = Date.now();
        setStartedAt(t);
        setNow(t);
      }

      if (level === "Senior" && lockedErrorIndex !== null) {
        if (key === targetText[lockedErrorIndex]) {
          setEntries((prev) => {
            const next = [...prev];
            next[lockedErrorIndex] = { char: key, correct: true };
            return next;
          });
          setCursorIndex(lockedErrorIndex + 1);
          setLockedErrorIndex(null);
        }
        return;
      }

      const expected = targetText[cursorIndex];
      const isCorrect = key === expected;
      setLastResult({ char: key, correct: isCorrect });
      setEntries((prev) => {
        const next = [...prev];
        next[cursorIndex] = { char: key, correct: isCorrect };
        return next;
      });

      if (isCorrect) {
        const nextIndex = Math.min(cursorIndex + 1, targetText.length);
        setCursorIndex(nextIndex);
        if (hotkeysMode && !currentHotkeyCombo && hotkeyTriggerPoints.includes(nextIndex)) {
          const pool = HOTKEY_COMBOS_BY_DEVICE[device];
          setCurrentHotkeyCombo(pool[Math.floor(Math.random() * pool.length)]);
        }
        return;
      }

      setErrorCount((prev) => prev + 1);
      if (level === "Senior") {
        setLockedErrorIndex(cursorIndex);
        setShakeNonce((prev) => prev + 1);
        return;
      }
      setCursorIndex((prev) => Math.min(prev + 1, targetText.length));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cursorIndex,
    currentHotkeyCombo,
    device,
    hotkeyTriggerPoints,
    hotkeysMode,
    initSession,
    isComboMatch,
    level,
    lockedErrorIndex,
    sessionComplete,
    startedAt,
    targetText,
  ]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const typedCount = entries.reduce((acc, e) => (e ? acc + 1 : acc), 0);
  const correctCount = entries.reduce((acc, e) => (e?.correct ? acc + 1 : acc), 0);
  const elapsedMinutes = startedAt ? Math.max((now - startedAt) / 60000, 1 / 60000) : 0;
  const wpm = elapsedMinutes > 0 ? correctCount / 5 / elapsedMinutes : 0;
  const accuracy = typedCount > 0 ? (correctCount / typedCount) * 100 : 100;
  const overallSegments = Math.max(queue.length, 1);
  const segmentProgress = targetText.length > 0 ? cursorIndex / targetText.length : 0;
  const progress = ((segmentIndex + segmentProgress) / overallSegments) * 100;
  const durationSeconds = startedAt
    ? Math.max(0, Math.floor(((completedAt ?? now) - startedAt) / 1000))
    : 0;

  // ── Session advance ────────────────────────────────────────────────────────

  useEffect(() => {
    if (sessionComplete || currentHotkeyCombo) return;
    if (cursorIndex < targetText.length || lockedErrorIndex !== null) return;
    if (level === "Middle" && entries.some((e) => e && !e.correct)) return;

    if (segmentIndex < queue.length - 1) {
      const nextSegment = segmentIndex + 1;
      const nextSnippet = queue[nextSegment] ?? "";
      setSegmentIndex(nextSegment);
      setEntries([]);
      setCursorIndex(0);
      setLockedErrorIndex(null);
      setCurrentHotkeyCombo(null);
      setHotkeyTriggerPoints(hotkeysMode ? buildHotkeyTriggers(nextSnippet.length) : []);
      return;
    }

    setSessionComplete(true);
    setCompletedAt(Date.now());
  }, [
    buildHotkeyTriggers,
    cursorIndex,
    currentHotkeyCombo,
    entries,
    hotkeysMode,
    level,
    lockedErrorIndex,
    queue,
    segmentIndex,
    sessionComplete,
    targetText.length,
  ]);

  // ── Best stats persistence ─────────────────────────────────────────────────

  useEffect(() => {
    if (typedCount === 0) return;
    setBestStats((prev) => {
      const next = {
        wpm: Math.max(prev.wpm, wpm),
        accuracy: Math.max(prev.accuracy, accuracy),
      };
      if (typeof window !== "undefined")
        window.localStorage.setItem(BEST_STATS_KEY, JSON.stringify(next));
      return next;
    });
  }, [accuracy, typedCount, wpm]);

  // ── Char refs sync ─────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll<HTMLSpanElement>("[data-char-index]");
    charRefs.current = Array.from(nodes);
    updateCaretPosition();
  }, [targetText, updateCaretPosition]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const isPoolLoading = fetchStatus === "loading" && queue.length === 0;

  return (
    <div className={`${jetBrainsMono.className} min-h-screen bg-[#050505] px-4 py-10 text-zinc-100`}>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl md:p-10">
        {/* Progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-white"
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ type: "spring", stiffness: 240, damping: 28 }}
          />
        </div>

        {/* Top controls row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DifficultyTabs value={level} onChange={setLevel} />
          <div className="flex items-center gap-2 flex-wrap">
            <FetchBadge status={fetchStatus} usingFallback={usingFallback} />
            <button
              type="button"
              onClick={() => setHotkeysMode((prev) => !prev)}
              className={`rounded-xl border px-4 py-2 text-sm transition ${
                hotkeysMode
                  ? "border-white/30 bg-white/20 text-white"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              Hotkeys: {hotkeysMode ? "On" : "Off"}
            </button>
            <DeviceTabs value={device} onChange={setDevice} />
          </div>
        </div>

        {/* Language tabs */}
        <LanguageTabs value={lang} onChange={setLang} fetchStatus={fetchStatus} />

        {/* Session length control */}
        <section className="rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center justify-between text-sm text-zinc-300">
            <span>Session Length: {sessionLength} fragments</span>
            <span>
              Segment {Math.min(segmentIndex + 1, overallSegments)}/{overallSegments}
            </span>
          </div>
          <input
            type="range"
            min={SESSION_MIN}
            max={SESSION_MAX}
            value={sessionLength}
            onChange={(e) => setSessionLength(Number(e.target.value))}
            className="mt-3 w-full accent-white"
          />
        </section>

        {/* Typing area */}
        <AnimatePresence mode="wait">
          {isPoolLoading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <SkeletonLoader />
            </motion.div>
          ) : !sessionComplete ? (
            <motion.div
              key="engine"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              ref={containerRef}
            >
              <TypingEngine
                text={targetText}
                entries={entries}
                cursorIndex={cursorIndex}
                caretPos={caretPos}
                caretVisible={caretVisible}
                shakeNonce={shakeNonce}
                isHotkeySnippet={Boolean(currentHotkeyCombo)}
              />
            </motion.div>
          ) : (
            <motion.section
              key="summary"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-white/10 bg-black/30 p-6"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Summary</p>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { label: "WPM", value: wpm.toFixed(0) },
                  { label: "Accuracy", value: `${accuracy.toFixed(1)}%` },
                  { label: "Time", value: `${durationSeconds}s` },
                  { label: "Errors", value: String(errorCount) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-zinc-400">{label}</p>
                    <p className="text-xl text-white">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => initSession()}
                  className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20"
                >
                  Next Session
                </button>
                <button
                  type="button"
                  onClick={() => loadSnippetPool(lang, level)}
                  className="rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 transition hover:bg-white/10"
                >
                  Refresh Pool
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Stats bar */}
        <StatsBar wpm={wpm} accuracy={accuracy} best={bestStats} />
      </main>

      {/* Floating key indicator */}
      <VirtualKeyboard lastResult={lastResult} />
    </div>
  );
}