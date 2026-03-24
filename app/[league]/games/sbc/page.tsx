"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";

const EPOCH_MS   = new Date("2026-03-19T15:00:00Z").getTime();
const SEASON_SEED = Math.floor(EPOCH_MS / 86400000);
function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

// ── Seeded RNG ────────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed | 1;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 0xffffffff; };
}
function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Player       = { mc_uuid: string; mc_username: string };
type PlayerTeam   = { mc_uuid: string; team_id: string; teams: { id: string; name: string; abbreviation: string } | null };
type StatRow      = { mc_uuid: string; ppg: number | null; rpg: number | null; apg: number | null; gp: number | null };
type SbcChoice    = "start" | "bench" | "cut" | null;

const CHOICE_COLORS: Record<"start" | "bench" | "cut", string> = {
  start: "bg-green-700 border-green-500 text-green-100",
  bench: "bg-yellow-700 border-yellow-500 text-yellow-100",
  cut:   "bg-red-800   border-red-600   text-red-100",
};
const CHOICE_LABEL: Record<"start" | "bench" | "cut", string> = {
  start: "▶ Start",
  bench: "⏸ Bench",
  cut:   "✕ Cut",
};
const BAR_COLORS: Record<"start" | "bench" | "cut", string> = {
  start: "bg-green-600",
  bench: "bg-yellow-500",
  cut:   "bg-red-700",
};

// ── Pick 3 players for the day ────────────────────────────────────────────────

function pickDaily(dayNum: number, players: Player[], statsMap: Record<string, StatRow>): Player[] {
  // Prefer players who have stats
  const withStats = players.filter(p => statsMap[p.mc_uuid]);
  const pool = withStats.length >= 3 ? withStats : players;
  const rng = seededRng((SEASON_SEED + dayNum) * 97 + 13);
  return shuffled(pool, rng).slice(0, 3);
}

// ── Result bar ────────────────────────────────────────────────────────────────

function ResultBar({ label, count, total }: { label: "start" | "bench" | "cut"; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-10 flex-shrink-0 capitalize">{label}</span>
      <div className="flex-1 rounded-full bg-slate-800 h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${BAR_COLORS[label]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Player card ───────────────────────────────────────────────────────────────

function PlayerCard({
  player, pos, teamName, stat, choice, onChoice, submitted,
  resultCounts, totalVotes,
}: {
  player: Player; pos: number; teamName: string | null; stat: StatRow | null;
  choice: SbcChoice; onChoice: (v: "start" | "bench" | "cut") => void;
  submitted: boolean; resultCounts: { start: number; bench: number; cut: number } | null; totalVotes: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 overflow-hidden flex flex-col">
      {/* Player info */}
      <div className="p-5 flex items-center gap-4">
        <img
          src={`https://minotar.net/avatar/${player.mc_username}/64`}
          alt={player.mc_username}
          className="w-16 h-16 rounded-xl ring-2 ring-slate-700 flex-shrink-0"
          onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/64"; }}
        />
        <div>
          <div className="text-white font-bold text-lg leading-tight">{player.mc_username}</div>
          {teamName && <div className="text-slate-400 text-sm mt-0.5">{teamName}</div>}
          {stat && (
            <div className="flex gap-3 mt-1.5 text-xs text-slate-500 font-mono">
              {stat.ppg != null && <span>{stat.ppg.toFixed(1)} PPG</span>}
              {stat.rpg != null && <span>{stat.rpg.toFixed(1)} RPG</span>}
              {stat.apg != null && <span>{stat.apg.toFixed(1)} APG</span>}
            </div>
          )}
        </div>
      </div>

      {/* Buttons or result */}
      {!submitted ? (
        <div className="px-5 pb-5 grid grid-cols-3 gap-2">
          {(["start", "bench", "cut"] as const).map(v => (
            <button
              key={v}
              onClick={() => onChoice(v)}
              className={`rounded-xl border py-2 text-xs font-bold transition ${
                choice === v ? CHOICE_COLORS[v] : "border-slate-700 bg-slate-900 text-slate-500 hover:border-slate-500 hover:text-slate-300"
              }`}
            >
              {CHOICE_LABEL[v]}
            </button>
          ))}
        </div>
      ) : (
        <div className={`px-4 py-2 text-center text-xs font-bold uppercase tracking-wider border-t border-slate-800 ${choice ? CHOICE_COLORS[choice] : "text-slate-500"}`}>
          You: {choice ?? "—"}
        </div>
      )}

      {/* Results */}
      {submitted && resultCounts && (
        <div className="px-5 pb-5 pt-3 border-t border-slate-800 flex flex-col gap-1.5">
          <div className="text-xs text-slate-500 mb-1">{totalVotes} response{totalVotes !== 1 ? "s" : ""}</div>
          <ResultBar label="start" count={resultCounts.start} total={totalVotes} />
          <ResultBar label="bench" count={resultCounts.bench} total={totalVotes} />
          <ResultBar label="cut"   count={resultCounts.cut}   total={totalVotes} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SbcPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";
  const dayNum = getDayNum();
  const { data: session, status } = useSession();

  const [players, setPlayers]     = useState<Player[]>([]);
  const [teamMap, setTeamMap]     = useState<Record<string, string>>({});
  const [statsMap, setStatsMap]   = useState<Record<string, StatRow>>({});
  const [daily, setDaily]         = useState<Player[]>([]);
  const [choices, setChoices]     = useState<[SbcChoice, SbcChoice, SbcChoice]>([null, null, null]);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults]     = useState<{ agg: { total: number; p1: any; p2: any; p3: any }; myVote: { v1: string; v2: string; v3: string } | null } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr]             = useState("");

  // Load data
  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/players`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
      fetch(`/api/stats?league=${slug}&season=all&type=combined`).then(r => r.json()),
    ]).then(([allPlayers, pt, stats]) => {
      const playersArr: Player[] = Array.isArray(allPlayers) ? allPlayers : [];
      const ptArr: PlayerTeam[]  = Array.isArray(pt)         ? pt         : [];
      const statsArr: StatRow[]  = Array.isArray(stats)      ? stats      : [];

      // Build team map (most recent team per player)
      const tm: Record<string, string> = {};
      for (const entry of ptArr) {
        if (entry.teams) tm[entry.mc_uuid] = entry.teams.name;
      }
      // Build stats map
      const sm: Record<string, StatRow> = {};
      for (const s of statsArr) sm[s.mc_uuid] = s;

      // Filter to players in this league
      const leagueUuids = new Set(ptArr.map(p => p.mc_uuid));
      const leaguePlayers = playersArr.filter(p => leagueUuids.has(p.mc_uuid));

      setPlayers(leaguePlayers);
      setTeamMap(tm);
      setStatsMap(sm);

      const trio = pickDaily(dayNum, leaguePlayers, sm);
      setDaily(trio);
      setLoading(false);
    });
  }, [slug, dayNum]);

  // Load existing vote + results once we have the daily players
  const fetchResults = useCallback(async () => {
    if (!slug || daily.length < 3) return;
    const r = await fetch(`/api/sbc?league=${slug}&day_num=${dayNum}&season_seed=${SEASON_SEED}`);
    if (!r.ok) return;
    const data = await r.json();
    setResults(data);
    if (data.myVote) {
      const { v1, v2, v3 } = data.myVote;
      setChoices([v1 as SbcChoice, v2 as SbcChoice, v3 as SbcChoice]);
      setSubmitted(true);
    }
  }, [slug, daily, dayNum]);

  useEffect(() => {
    if (status === "authenticated") fetchResults();
  }, [status, fetchResults]);

  const setChoice = (idx: number, val: "start" | "bench" | "cut") => {
    setChoices(prev => {
      const next = [...prev] as [SbcChoice, SbcChoice, SbcChoice];
      next[idx] = next[idx] === val ? null : val;
      return next;
    });
  };

  const canSubmit = choices.every(Boolean) && new Set(choices).size === 3;

  const submit = async () => {
    if (!canSubmit || daily.length < 3) return;
    setSubmitting(true); setErr("");
    const r = await fetch("/api/sbc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league: slug, day_num: dayNum, season_seed: SEASON_SEED,
        p1_uuid: daily[0].mc_uuid, p2_uuid: daily[1].mc_uuid, p3_uuid: daily[2].mc_uuid,
        v1: choices[0], v2: choices[1], v3: choices[2],
      }),
    });
    if (r.ok) {
      setSubmitted(true);
      await fetchResults();
    } else {
      const d = await r.json();
      setErr(d.error ?? "Error submitting");
    }
    setSubmitting(false);
  };

  // ── Gate: sign in ──────────────────────────────────────────────────────────

  if (status === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Start · Bench · Cut</h2>
          <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · 3 players, one choice each</p>
        </div>
        <div className="p-12 flex flex-col items-center gap-5 text-center">
          <div className="text-5xl">🔐</div>
          <div>
            <p className="text-white font-semibold text-lg">Sign in to play</p>
            <p className="text-slate-400 text-sm mt-1">Discord login required</p>
          </div>
          <button onClick={() => signIn("discord")} className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 text-sm transition">
            Sign in with Discord
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg p-10 text-center text-slate-500">
        Loading today's players...
      </div>
    );
  }

  if (daily.length < 3) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Start · Bench · Cut</h2>
        </div>
        <div className="p-10 text-center text-slate-500">Not enough players in this league yet.</div>
      </div>
    );
  }

  const resultAgg = results?.agg ?? null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800">
        <h2 className="text-2xl font-bold text-white">Start · Bench · Cut</h2>
        <p className="text-slate-400 text-sm mt-0.5">Day #{dayNum} · resets at 10 AM EST · {slug.toUpperCase()}</p>
      </div>

      {/* Rules */}
      {!submitted && (
        <div className="px-6 py-3 bg-slate-800/50 border-b border-slate-800 text-xs text-slate-400">
          Assign each player exactly one label: <span className="text-green-400 font-semibold">Start</span>, <span className="text-yellow-400 font-semibold">Bench</span>, or <span className="text-red-400 font-semibold">Cut</span>. No duplicates.
        </div>
      )}

      {/* Player cards */}
      <div className="p-6 grid gap-4 sm:grid-cols-3">
        {daily.map((player, i) => (
          <PlayerCard
            key={player.mc_uuid}
            player={player}
            pos={i}
            teamName={teamMap[player.mc_uuid] ?? null}
            stat={statsMap[player.mc_uuid] ?? null}
            choice={choices[i]}
            onChoice={v => !submitted && setChoice(i, v)}
            submitted={submitted}
            resultCounts={resultAgg ? [resultAgg.p1, resultAgg.p2, resultAgg.p3][i] : null}
            totalVotes={resultAgg?.total ?? 0}
          />
        ))}
      </div>

      {/* Submit */}
      {!submitted && (
        <div className="px-6 pb-6 flex items-center gap-4">
          <button
            disabled={!canSubmit || submitting}
            onClick={submit}
            className={`rounded-xl px-6 py-2.5 text-sm font-bold transition ${canSubmit && !submitting ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-slate-800 text-slate-600 cursor-not-allowed"}`}
          >
            {submitting ? "Submitting..." : "Submit"}
          </button>
          {!canSubmit && <span className="text-slate-500 text-xs">Choose Start, Bench, and Cut for all 3 players</span>}
          {err && <span className="text-red-400 text-xs">{err}</span>}
        </div>
      )}

      {submitted && (
        <div className="px-6 pb-6 text-sm text-slate-400">
          ✓ Submitted · {resultAgg?.total ?? 0} total response{(resultAgg?.total ?? 0) !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
