"use client";

import Link from "next/link";
import React from "react";

type Team = { id: string; name: string; abbreviation: string; logo_url: string | null };
type Game = {
  id: string;
  scheduled_at: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  home_team: Team;
  away_team: Team;
};

const EPOCH_MS = new Date("2026-04-13T14:00:00Z").getTime();
const TARGET_WINS = 82;

function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

function seededRng(seed: number) {
  let s = seed | 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function shuffle<T>(items: T[], seed: number) {
  const rng = seededRng(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function TeamButton({ team, onClick, disabled }: { team: Team; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-24 items-center gap-4 rounded-xl border border-slate-700 bg-slate-950 p-4 text-left transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-slate-700 bg-slate-900">
        {team.logo_url ? (
          <img src={team.logo_url} alt="" className="h-11 w-11 object-contain" />
        ) : (
          <span className="text-xs font-black text-slate-500">{team.abbreviation}</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-black text-white">{team.name}</span>
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{team.abbreviation}</span>
      </span>
    </button>
  );
}

export default function EightyTwoOhPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const league = resolved.league ?? "mba";
  const day = getDayNum();
  const storageKey = `partix:82-0:${league}:${day}`;

  const [games, setGames] = React.useState<Game[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [streak, setStreak] = React.useState(0);
  const [missed, setMissed] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<string | null>(null);

  React.useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { streak?: number; missed?: boolean; lastResult?: string | null };
        setStreak(parsed.streak ?? 0);
        setMissed(parsed.missed ?? false);
        setLastResult(parsed.lastResult ?? null);
      } catch {}
    }
  }, [storageKey]);

  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/games?league=${league}`)
      .then((r) => r.json())
      .then((data) => {
        const finalGames = Array.isArray(data)
          ? data.filter((g: Game) => (g.status === "final" || g.status === "completed") && g.home_score != null && g.away_score != null)
          : [];
        setGames(shuffle(finalGames, day * 820).slice(0, TARGET_WINS));
        setLoading(false);
      })
      .catch(() => {
        setGames([]);
        setLoading(false);
      });
  }, [league, day]);

  React.useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ streak, missed, lastResult }));
  }, [storageKey, streak, missed, lastResult]);

  const current = games[streak] ?? null;
  const complete = streak >= TARGET_WINS;

  const pick = (teamId: string) => {
    if (!current || missed || complete) return;
    const homeWon = (current.home_score ?? 0) > (current.away_score ?? 0);
    const winner = homeWon ? current.home_team : current.away_team;
    const loser = homeWon ? current.away_team : current.home_team;
    if (teamId === winner.id) {
      setStreak((s) => Math.min(TARGET_WINS, s + 1));
      setLastResult(`${winner.name} beat ${loser.name}`);
    } else {
      setMissed(true);
      setLastResult(`${winner.name} beat ${loser.name}`);
    }
  };

  const reset = () => {
    setStreak(0);
    setMissed(false);
    setLastResult(null);
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="border-b border-slate-800 px-6 py-5">
        <Link href={`/${league}/games`} className="text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-white">
          Back to games
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-white">82-0</h2>
            <p className="mt-1 text-sm text-slate-400">Pick winners from real completed games. One miss ends the run.</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950 px-5 py-3 text-right">
            <div className="text-3xl font-black text-amber-300">{streak}</div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500">wins</div>
          </div>
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-10 text-center text-slate-500">Loading games...</div>
        ) : games.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-10 text-center text-slate-500">No completed games yet.</div>
        ) : complete ? (
          <div className="rounded-xl border border-amber-700 bg-amber-950/30 p-10 text-center">
            <div className="text-4xl font-black text-amber-300">82-0</div>
            <p className="mt-2 text-slate-300">Perfect season. You cleared the full gauntlet.</p>
            <button type="button" onClick={reset} className="mt-5 rounded-lg bg-amber-600 px-5 py-2 text-sm font-bold text-white hover:bg-amber-500">
              Play again
            </button>
          </div>
        ) : missed ? (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-10 text-center">
            <div className="text-3xl font-black text-red-300">{streak}-1</div>
            <p className="mt-2 text-slate-300">{lastResult}</p>
            <button type="button" onClick={reset} className="mt-5 rounded-lg bg-slate-800 px-5 py-2 text-sm font-bold text-white hover:bg-slate-700">
              Try again
            </button>
          </div>
        ) : current ? (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Game {streak + 1} of {TARGET_WINS}</div>
                <div className="mt-1 text-sm text-slate-400">Who won this matchup?</div>
              </div>
              {lastResult && <div className="text-sm font-semibold text-emerald-300">{lastResult}</div>}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TeamButton team={current.home_team} onClick={() => pick(current.home_team.id)} disabled={missed} />
              <TeamButton team={current.away_team} onClick={() => pick(current.away_team.id)} disabled={missed} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
