"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type KeyPress = {
  id: number;
  display: string; // what to show on the badge
  correct: boolean | null; // null = neutral (e.g. backspace)
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDisplayLabel(event: KeyboardEvent): string {
  switch (event.key) {
    case " ":          return "Space";
    case "Backspace":  return "⌫";
    case "Enter":      return "↵";
    case "Tab":        return "Tab";
    case "Escape":     return "Esc";
    case "ArrowLeft":  return "←";
    case "ArrowRight": return "→";
    case "ArrowUp":    return "↑";
    case "ArrowDown":  return "↓";
    case "Shift":      return "Shift";
    case "Control":    return "Ctrl";
    case "Alt":        return "Alt";
    case "Meta":       return "⌘";
    default:
      // For printable chars just show the character
      return event.key.length === 1 ? event.key : event.key;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

let uid = 0;

interface VirtualKeyboardProps {
  /** Pass the last typed char result so we can colour it. */
  lastResult?: { char: string; correct: boolean } | null;
}

export default function VirtualKeyboard({ lastResult }: VirtualKeyboardProps) {
  const [keys, setKeys] = useState<KeyPress[]>([]);

  // Listen to raw keydown events
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore pure modifier taps
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;

      const display = getDisplayLabel(e);

      setKeys((prev) => {
        const entry: KeyPress = {
          id: uid++,
          display,
          correct: null, // correctness injected via lastResult below
        };
        // Keep max 1 visible at a time (stack looks cluttered otherwise)
        return [entry];
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Sync correctness from the typing engine
  useEffect(() => {
    if (!lastResult) return;
    setKeys((prev) =>
      prev.map((k, i) =>
        i === prev.length - 1 ? { ...k, correct: lastResult.correct } : k
      )
    );
  }, [lastResult]);

  // Auto-clear keys after animation
  useEffect(() => {
    if (keys.length === 0) return;
    const id = setTimeout(() => setKeys([]), 500);
    return () => clearTimeout(id);
  }, [keys]);

  return (
    // Fixed to bottom-right corner
    <div className="fixed top-6 right-6 z-20 flex flex-col items-end gap-2 pointer-events-none select-none">
      <AnimatePresence>
        {keys.map((k) => (
          <motion.div
            key={k.id}
            initial={{ opacity: 0, scale: 0.5, y: -20, x: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -16 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={[
              "flex min-w-[3.5rem] items-center justify-center rounded-xl border px-4 py-3",
              "text-lg font-semibold shadow-2xl backdrop-blur-md",
              k.correct === null
                ? "border-white/20 bg-white/10 text-white"
                : k.correct
                ? "border-emerald-400/40 bg-emerald-400/20 text-emerald-200 shadow-[0_0_18px_2px_rgba(52,211,153,0.25)]"
                : "border-red-400/40 bg-red-400/20 text-red-200 shadow-[0_0_18px_2px_rgba(248,113,113,0.25)]",
            ].join(" ")}
          >
            {k.display}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}