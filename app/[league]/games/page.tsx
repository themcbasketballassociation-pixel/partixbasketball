"use client";
import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

const EPOCH_MS = new Date("2026-03-19T15:00:00Z").getTime();
function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

const GAMES = [
  {
    href: "wordle",
    emoji: "🏀",
    title: "Player Wordle",
    desc: "Guess the mystery player in 5 tries. Each guess shows hints about their team, division, stats, and rings.",
  },
  {
    href: "grid",
    emoji: "🔲",
    title: "Player Grid",
    desc: "Fill a 3×3 grid with players matching both the row and column category. 9 total guesses.",
  },
  {
    href: "connections",
    emoji: "🔗",
    title: "Connections",
    desc: "Group 16 players into 4 categories of 4. Watch out for overlapping players — 4 attempts only.",
  },
  {
    href: "sbc",
    emoji: "⚖️",
    title: "Start · Bench · Cut",
    desc: "Three players, three labels. Assign each player Start, Bench, or Cut — then see how everyone else voted.",
  },
];

const STORAGE_PREFIXES = ["partix:wordle", "partix:grid", "partix:conn"];

export default function GamesPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const day = getDayNum();
  const { data: session, status } = useSession();

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Games</h2>
          <p className="text-slate-400 text-sm mt-0.5">Daily mini-games — Day #{day} · resets at 10 AM EST</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {status !== "authenticated" && (
            <span className="text-xs text-slate-600 font-medium">🔐 Sign in with Discord to play</span>
          )}
        </div>
      </div>
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {GAMES.map(g => (
          <Link
            key={g.href}
            href={`/${slug}/games/${g.href}`}
            className="block rounded-xl border border-slate-700 bg-slate-950 p-6 hover:border-zinc-500 hover:bg-slate-800/40 transition group"
          >
            <div className="text-4xl mb-3">{g.emoji}</div>
            <h3 className="text-xl font-bold text-white mb-1">{g.title}</h3>
            <p className="text-slate-400 text-sm">{g.desc}</p>
            <p className="text-zinc-500 text-xs mt-3 font-semibold group-hover:text-zinc-300">Play →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
