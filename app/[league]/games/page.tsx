"use client";
import React from "react";
import Link from "next/link";

export default function GamesPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800">
        <h2 className="text-2xl font-bold text-white">Games</h2>
        <p className="text-slate-400 text-sm mt-0.5">Daily mini-games — refreshes at midnight</p>
      </div>
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href={`/${slug}/games/wordle`}
          className="block rounded-xl border border-slate-700 bg-slate-950 p-6 hover:border-blue-600 hover:bg-slate-800/40 transition group"
        >
          <div className="text-4xl mb-3">🏀</div>
          <h3 className="text-xl font-bold text-white mb-1">Player Wordle</h3>
          <p className="text-slate-400 text-sm">
            Guess the mystery player in 5 tries. Each guess shows hints about their team, division, stats, and rings.
          </p>
          <p className="text-blue-500 text-xs mt-3 font-semibold group-hover:text-blue-400">Play →</p>
        </Link>
        <Link
          href={`/${slug}/games/grid`}
          className="block rounded-xl border border-slate-700 bg-slate-950 p-6 hover:border-blue-600 hover:bg-slate-800/40 transition group"
        >
          <div className="text-4xl mb-3">🔲</div>
          <h3 className="text-xl font-bold text-white mb-1">Player Grid</h3>
          <p className="text-slate-400 text-sm">
            Fill a 3×3 grid with players matching both their row and column category. 9 total guesses — just like NBA Grid.
          </p>
          <p className="text-blue-500 text-xs mt-3 font-semibold group-hover:text-blue-400">Play →</p>
        </Link>
      </div>
    </div>
  );
}
