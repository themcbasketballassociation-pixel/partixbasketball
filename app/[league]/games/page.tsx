"use client";

import Link from "next/link";
import React from "react";
import { useSession } from "next-auth/react";

const EPOCH_MS = new Date("2026-04-13T14:00:00Z").getTime();
function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

const GAMES = [
  {
    href: "wordle",
    badge: "🟩",
    kicker: "Daily Deduction",
    title: "Player Wordle",
    desc: "Guess the mystery player in 5 tries with color-coded clues for team, stats, and awards.",
    accent: "from-emerald-500/25 via-slate-950 to-slate-950",
    border: "hover:border-emerald-400/70",
  },
  {
    href: "grid",
    badge: "🎯",
    kicker: "Immaculate Grid",
    title: "Player Grid",
    desc: "Fill a 3x3 board by matching both row and column categories before your guesses run out.",
    accent: "from-cyan-500/25 via-slate-950 to-slate-950",
    border: "hover:border-cyan-400/70",
  },
  {
    href: "82-0",
    badge: "🏆",
    kicker: "Perfect Season Draft",
    title: "82-0",
    desc: "Draft #1, #2, #3, and Bench from team-season pools and chase the impossible record.",
    accent: "from-amber-500/25 via-slate-950 to-slate-950",
    border: "hover:border-amber-400/70",
  },
  {
    href: "sbc",
    badge: "⚖️",
    kicker: "Start Bench Cut",
    title: "Start Bench Cut",
    desc: "Rank three player seasons, lock your call, and see how the rest of the league voted.",
    accent: "from-rose-500/25 via-slate-950 to-slate-950",
    border: "hover:border-rose-400/70",
  },
];

export default function GamesPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const day = getDayNum();
  const { status } = useSession();

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#070a10] shadow-2xl">
      <div className="border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-950 to-red-950/25 px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-red-500/40 bg-red-950/35 text-3xl shadow-lg shadow-red-950/30">
              🕹️
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-300">Minecraft Basketball Arcade</p>
              <h2 className="mt-1 text-3xl font-black tracking-tight text-white">Games</h2>
              <p className="mt-1 text-sm text-slate-400">Daily challenges · Day #{day} · resets at 10 AM EST</p>
            </div>
          </div>
          {status !== "authenticated" && (
            <span className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-bold text-slate-400">Sign in with Discord to play</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
        {GAMES.map((game) => (
          <Link
            key={game.href}
            href={`/${slug}/games/${game.href}`}
            className={`group relative min-h-52 overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br ${game.accent} p-5 transition hover:-translate-y-0.5 hover:bg-slate-900 ${game.border}`}
          >
            <div className="absolute right-4 top-4 text-6xl opacity-10 transition group-hover:scale-110 group-hover:opacity-20">{game.badge}</div>
            <div className="relative z-10 flex h-full flex-col justify-between gap-5">
              <div>
                <div className="mb-5 inline-grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5 text-3xl shadow-inner">
                  {game.badge}
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{game.kicker}</p>
                <h3 className="mt-1 text-2xl font-black tracking-tight text-white">{game.title}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">{game.desc}</p>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800 pt-4">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">Daily mode</span>
                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-black text-white transition group-hover:border-white/30">Play →</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
