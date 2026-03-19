"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";

const MAX_GUESSES = 5;
// Day 1 starts 2026-03-17 at 10 AM EST (15:00 UTC). Advances every 24 h at 10 AM EST.
const EPOCH_MS = new Date("2026-03-19T15:00:00Z").getTime();
const SEASON_SEED = Math.floor(EPOCH_MS / 86400000); // auto-changes with epoch
function getDayNum() {
  return Math.max(1, Math.floor((Date.now() - EPOCH_MS) / 86400000) + 1);
}

// ── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; abbreviation: string; division: string | null };
type StatRow = { mc_uuid: string; ppg: number | null; rpg: number | null; apg: number | null; gp: number | null };
type Accolade = { mc_uuid: string; type: string };
type PlayerTeamEntry = { mc_uuid: string; team_id: string; season: string | null; teams: Team };
type RawPlayer = { mc_uuid: string; mc_username: string };

type Profile = {
  mc_uuid: string; mc_username: string;
  team: Team | null; division: string | null;
  ppg: number; rpg: number; apg: number; rings: number;
  hasStats: boolean;
};

type Color = "green" | "yellow" | "gray";
type CellResult = { color: Color; arrow?: "up" | "down" };

type GuessResult = {
  profile: Profile;
  team: CellResult; division: CellResult;
  ppg: CellResult; rpg: CellResult; apg: CellResult; rings: CellResult;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pick the team from the most-recent season the player was on. */
function getMostRecentTeam(uuid: string, ptArr: PlayerTeamEntry[]): Team | null {
  const mine = ptArr.filter(pt => pt.mc_uuid === uuid);
  if (!mine.length) return null;
  const sorted = [...mine].sort((a, b) => {
    const na = a.season ? parseInt(a.season.replace(/\D/g, "") || "0") : -1;
    const nb = b.season ? parseInt(b.season.replace(/\D/g, "") || "0") : -1;
    return nb - na;
  });
  return sorted[0].teams ?? null;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed | 1;
  for (let i = a.length - 1; i > 0; i--) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    const j = ((s >>> 0) % (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function numCmp(g: number, s: number, greenRange: number, yellowRange: number): CellResult {
  const diff = Math.abs(g - s);
  const color: Color = diff === 0 ? "green" : diff <= greenRange ? "yellow" : "gray";
  const arrow = g < s ? "up" : g > s ? "down" : undefined;
  return { color, arrow };
}

function compareProfiles(guess: Profile, secret: Profile): GuessResult {
  return {
    profile:  guess,
    team:     { color: (guess.team?.name ?? null) === (secret.team?.name ?? null) ? "green" : "gray" },
    division: { color: (guess.division ?? "None") === (secret.division ?? "None") ? "green" : "gray" },
    ppg:   numCmp(guess.ppg,   secret.ppg,   2,   5),
    rpg:   numCmp(guess.rpg,   secret.rpg,   1.5, 3),
    apg:   numCmp(guess.apg,   secret.apg,   1,   2),
    rings: numCmp(guess.rings, secret.rings, 0,   1),
  };
}

const colorCls: Record<Color, string> = {
  green:  "bg-green-950  border-green-800  text-green-200",
  yellow: "bg-yellow-950 border-yellow-800 text-yellow-200",
  gray:   "bg-slate-900  border-slate-700  text-slate-400",
};

const COLOR_EMOJI: Record<Color, string> = { green: "🟩", yellow: "🟨", gray: "⬛" };

function buildShareText(guesses: GuessResult[], gameState: string, dayNum: number): string {
  const result = gameState === "won"
    ? `${guesses.length}/${MAX_GUESSES} 🏀`
    : `X/${MAX_GUESSES} 💀`;
  const lines = [`Minecraft Basketball Wordle – Day #${dayNum}`, result, ""];
  for (const g of guesses) {
    lines.push([g.team, g.division, g.ppg, g.rpg, g.apg, g.rings]
      .map(c => COLOR_EMOJI[c.color]).join(""));
  }
  return lines.join("\n");
}

// ── Components ────────────────────────────────────────────────────────────────

function ShareModal({ guesses, gameState, dayNum, onClose }: {
  guesses: GuessResult[];
  gameState: "won" | "lost";
  dayNum: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = buildShareText(guesses, gameState, dayNum);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold">Share Result</h3>
            <p className="text-slate-400 text-xs mt-0.5">
              Day #{dayNum} · {gameState === "won" ? `${guesses.length}/${MAX_GUESSES} 🏀` : `X/${MAX_GUESSES} 💀`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Emoji grid */}
          <div className="flex flex-col items-center gap-1.5">
            {guesses.map((g, i) => (
              <div key={i} className="flex gap-1">
                {[g.team, g.division, g.ppg, g.rpg, g.apg, g.rings].map((c, j) => (
                  <span key={j} className="text-2xl leading-none">{COLOR_EMOJI[c.color]}</span>
                ))}
              </div>
            ))}
            {Array.from({ length: MAX_GUESSES - guesses.length }).map((_, i) => (
              <div key={i} className="flex gap-1 opacity-20">
                {Array.from({ length: 6 }).map((_, j) => (
                  <span key={j} className="text-2xl leading-none">⬜</span>
                ))}
              </div>
            ))}
          </div>
          {/* Column labels */}
          <div className="flex gap-1 justify-center">
            {["Team", "Div", "PPG", "RPG", "APG", "🏆"].map(l => (
              <div key={l} className="text-[9px] text-slate-600 uppercase tracking-wide" style={{ width: "2rem", textAlign: "center" }}>{l}</div>
            ))}
          </div>
          {/* Copy button */}
          <button
            onClick={copy}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold transition ${
              copied ? "bg-green-700 text-green-200" : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            {copied ? "✓ Copied!" : "📋 Copy to Clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GuessRow({ result, reveal }: { result: GuessResult; reveal: boolean }) {
  const cols: { key: keyof Omit<GuessResult, "profile">; label: string; val: string }[] = [
    { key: "team",     label: "Team",  val: result.profile.team?.abbreviation ?? ""  },
    { key: "division", label: "Div",   val: result.profile.division ?? "—"           },
    { key: "ppg",      label: "PPG",   val: result.profile.ppg.toFixed(1)            },
    { key: "rpg",      label: "RPG",   val: result.profile.rpg.toFixed(1)            },
    { key: "apg",      label: "APG",   val: result.profile.apg.toFixed(1)            },
    { key: "rings",    label: "Rings", val: String(result.profile.rings)             },
  ];

  return (
    <div className="flex items-stretch gap-1.5">
      <div className="flex items-center gap-2 w-36 flex-shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5">
        <img
          src={`https://minotar.net/avatar/${result.profile.mc_username}/28`}
          className="w-7 h-7 rounded ring-1 ring-slate-700 flex-shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }}
        />
        <span className="text-xs font-semibold text-white truncate">
          {reveal ? result.profile.mc_username : "???"}
        </span>
      </div>
      {cols.map(({ key, label, val }) => {
        const cell = result[key] as CellResult;
        return (
          <div key={key} className={`flex flex-col items-center justify-center rounded-lg border ${colorCls[cell.color]} flex-1 min-w-0 px-1 py-1.5 text-center`}>
            <div className="text-[9px] leading-none text-slate-500 mb-0.5 uppercase tracking-wider">{label}</div>
            <div className="text-xs font-bold flex items-center gap-0.5 leading-none">
              {cell.arrow === "up"   && <span className="text-[10px]">↑</span>}
              {cell.arrow === "down" && <span className="text-[10px]">↓</span>}
              <span>{val}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="flex items-stretch gap-1.5 opacity-20">
      <div className="w-36 flex-shrink-0 h-12 rounded-lg border border-slate-800 bg-slate-950" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex-1 min-w-0 h-12 rounded-lg border border-slate-800 bg-slate-950" />
      ))}
    </div>
  );
}

// ── Inner page (needs useSearchParams → must be inside Suspense) ──────────────

function WordleContent({ slug, today }: { slug: string; today: number }) {
  const { data: session, status: authStatus } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlDay = parseInt(searchParams?.get("day") ?? "") || today;
  const [viewDay, setViewDay] = useState<number>(Math.min(Math.max(1, urlDay), today));

  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [secretPool,  setSecretPool]  = useState<Profile[]>([]);
  const [dataLoaded,  setDataLoaded]  = useState(false);
  const [secret,      setSecret]      = useState<Profile | null>(null);
  const [guesses,     setGuesses]     = useState<GuessResult[]>([]);
  const [gameState,   setGameState]   = useState<"playing" | "won" | "lost">("playing");
  const [stateLoaded, setStateLoaded] = useState(false);
  const [selected,    setSelected]    = useState<Profile | null>(null);
  const [search,      setSearch]      = useState("");
  const [open,        setOpen]        = useState(false);
  const [showShare,   setShowShare]   = useState(false);

  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Load player data (once per league) ────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/stats?league=${slug}&season=all&type=combined`).then(r => r.json()),
      fetch(`/api/accolades?league=${slug}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
      fetch(`/api/players`).then(r => r.json()),
    ]).then(([stats, accolades, playerTeams, players]) => {
      const statsArr:   StatRow[]         = Array.isArray(stats)       ? stats       : [];
      const accsArr:    Accolade[]        = Array.isArray(accolades)   ? accolades   : [];
      const ptArr:      PlayerTeamEntry[] = Array.isArray(playerTeams) ? playerTeams : [];
      const playersArr: RawPlayer[]       = Array.isArray(players)     ? players     : [];

      const statsMap: Record<string, StatRow> = {};
      const ringMap:  Record<string, number>  = {};
      for (const s of statsArr) statsMap[s.mc_uuid] = s;
      for (const a of accsArr) {
        if (a.type === "Finals Champion") ringMap[a.mc_uuid] = (ringMap[a.mc_uuid] ?? 0) + 1;
      }

      const leagueUuids = new Set([
        ...ptArr.map(pt => pt.mc_uuid),
        ...statsArr.map(s => s.mc_uuid),
      ]);

      const all: Profile[] = playersArr
        .filter(p => leagueUuids.has(p.mc_uuid))
        .map(p => {
          const s    = statsMap[p.mc_uuid];
          const team = getMostRecentTeam(p.mc_uuid, ptArr);
          return {
            mc_uuid:     p.mc_uuid,
            mc_username: p.mc_username,
            team,
            division:    team?.division ?? null,
            ppg:         s?.ppg  ?? 0,
            rpg:         s?.rpg  ?? 0,
            apg:         s?.apg  ?? 0,
            rings:       ringMap[p.mc_uuid] ?? 0,
            hasStats:    (s?.gp  ?? 0) > 0,
          };
        });

      const pool = seededShuffle(all.filter(p => p.hasStats), 1337);
      setAllProfiles(all);
      setSecretPool(pool);
      setDataLoaded(true);
    });
  }, [slug]);

  // ── Load game state for current viewDay ───────────────────────────────────
  useEffect(() => {
    if (!dataLoaded || !secretPool.length) return;

    const pick = secretPool[(SEASON_SEED + viewDay - 1) % secretPool.length];
    setSecret(pick);
    setGuesses([]);
    setGameState("playing");
    setSelected(null);
    setSearch("");
    setOpen(false);
    setShowShare(false);
    setStateLoaded(false);

    // No session yet — wait
    if (authStatus === "loading") return;

    // Not signed in — no server state
    if (authStatus === "unauthenticated") {
      setStateLoaded(true);
      return;
    }

    // Signed in — load saved state
    fetch(`/api/wordle/state?league=${slug}&day=${viewDay}`)
      .then(r => r.json())
      .then(data => {
        if (data.exists && Array.isArray(data.guesses)) {
          setGuesses(data.guesses as GuessResult[]);
          setGameState(data.game_state as "playing" | "won" | "lost");
        }
        setStateLoaded(true);
      })
      .catch(() => setStateLoaded(true));
  }, [viewDay, dataLoaded, secretPool, authStatus, slug]);

  // ── Save state after each guess ───────────────────────────────────────────
  const saveState = async (newGuesses: GuessResult[], newGameState: string) => {
    if (!session?.user) return;
    try {
      await fetch("/api/wordle/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league: slug, day_num: viewDay, guesses: newGuesses, game_state: newGameState }),
      });
    } catch { /* ignore */ }
  };

  const guessedIds = new Set(guesses.map(g => g.profile.mc_uuid));
  const isDone     = gameState !== "playing";
  const isWon      = gameState === "won";

  const filtered = allProfiles.filter(p =>
    !guessedIds.has(p.mc_uuid) &&
    (search.trim() ? p.mc_username.toLowerCase().includes(search.toLowerCase()) : true)
  );

  const submitGuess = () => {
    if (!selected || !secret || isDone) return;
    const result    = compareProfiles(selected, secret);
    const next      = [...guesses, result];
    const nextState: "playing" | "won" | "lost" =
      selected.mc_uuid === secret.mc_uuid ? "won" :
      next.length >= MAX_GUESSES          ? "lost" : "playing";
    setGuesses(next);
    setSelected(null); setSearch(""); setOpen(false);
    setGameState(nextState);
    if (nextState !== "playing") setTimeout(() => setShowShare(true), 600);
    saveState(next, nextState);
  };

  const goToDay = (d: number) => {
    const clamped = Math.min(Math.max(1, d), today);
    setViewDay(clamped);
    const qs = clamped !== today ? `?day=${clamped}` : "";
    router.replace(`/${slug}/games/wordle${qs}`, { scroll: false });
  };

  const loading = !dataLoaded || !stateLoaded;

  // ── Login wall ────────────────────────────────────────────────────────────
  if (authStatus === "unauthenticated") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Player Wordle</h2>
          <p className="text-slate-400 text-sm mt-0.5">Day #{viewDay} · Guess the mystery player in {MAX_GUESSES} tries</p>
        </div>
        <div className="p-12 flex flex-col items-center gap-5 text-center">
          <div className="text-5xl">🔐</div>
          <div>
            <p className="text-white font-semibold text-lg">Sign in to play</p>
            <p className="text-slate-400 text-sm mt-1">
              Discord login is required to track your daily result and prevent replays.
            </p>
          </div>
          <button
            onClick={() => signIn("discord")}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 transition"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.017.012.033.026.044a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Sign in with Discord
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {showShare && isDone && (
        <ShareModal
          guesses={guesses}
          gameState={gameState as "won" | "lost"}
          dayNum={viewDay}
          onClose={() => setShowShare(false)}
        />
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-white">Player Wordle</h2>
            <p className="text-slate-400 text-sm mt-0.5">Day #{viewDay} · Guess the mystery player in {MAX_GUESSES} tries</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Day navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToDay(viewDay - 1)}
                disabled={viewDay <= 1}
                className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-1.5 text-sm font-medium transition"
              >←</button>
              <span className="text-slate-400 text-xs px-2 min-w-[56px] text-center font-medium">
                {viewDay === today ? "Today" : `Day ${viewDay}`}
              </span>
              <button
                onClick={() => goToDay(viewDay + 1)}
                disabled={viewDay >= today}
                className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-1.5 text-sm font-medium transition"
              >→</button>
            </div>
            {isDone && (
              <>
                <div className={`text-sm font-semibold px-3 py-1.5 rounded-lg border ${isWon ? "bg-green-950 border-green-800 text-green-300" : "bg-red-950 border-red-900 text-red-300"}`}>
                  {isWon ? `🎉 ${guesses.length}/${MAX_GUESSES}` : `💀 ${guesses.length}/${MAX_GUESSES}`}
                </div>
                <button
                  onClick={() => setShowShare(true)}
                  className="rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 text-sm transition"
                  title="Share result"
                >📋</button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">Loading...</div>
        ) : !secret ? (
          <div className="p-10 text-center text-slate-500">No player data available.</div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-950 border border-green-800 inline-block" /> Exact match</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-950 border border-yellow-800 inline-block" /> Close (↑↓ = direction to answer)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-900 border border-slate-700 inline-block" /> No match</span>
            </div>

            {/* Column headers */}
            {guesses.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-36 flex-shrink-0" />
                {["Team", "Div", "PPG", "RPG", "APG", "Rings"].map(h => (
                  <div key={h} className="flex-1 min-w-0 text-center text-[10px] text-slate-600 uppercase tracking-wider">{h}</div>
                ))}
              </div>
            )}

            {/* Guess rows */}
            <div className="space-y-1.5">
              {guesses.map((g, i) => (
                <GuessRow key={i} result={g} reveal={isDone || g.profile.mc_uuid === secret.mc_uuid} />
              ))}
              {Array.from({ length: MAX_GUESSES - guesses.length }).map((_, i) => (
                <EmptyRow key={i} />
              ))}
            </div>

            {/* Result banner */}
            {isDone && (
              <div className={`rounded-xl border p-4 text-center ${isWon ? "border-green-800 bg-green-950" : "border-red-900 bg-red-950"}`}>
                {isWon ? (
                  <>
                    <div className="text-2xl font-bold text-green-300 mb-1">🎉 Correct!</div>
                    <div className="text-green-400 text-sm mb-3">
                      Got it in {guesses.length} guess{guesses.length !== 1 ? "es" : ""}!
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xl font-bold text-red-300 mb-2">Better luck tomorrow!</div>
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <img
                        src={`https://minotar.net/avatar/${secret.mc_username}/36`}
                        className="w-9 h-9 rounded-lg ring-2 ring-red-800"
                        onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }}
                      />
                      <span className="text-white font-bold text-lg">{secret.mc_username}</span>
                    </div>
                  </>
                )}
                <button
                  onClick={() => setShowShare(true)}
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-sm font-medium px-5 py-2 transition"
                >
                  📋 Share Result
                </button>
              </div>
            )}

            {/* Guess input */}
            {!isDone && (
              <div ref={dropRef} className="relative">
                <div className="flex gap-2">
                  {selected ? (
                    <button
                      className="flex-1 flex items-center gap-2 rounded-lg border border-blue-600 bg-slate-800 px-3 py-2 text-sm text-left hover:border-slate-500 transition"
                      onClick={() => { setSelected(null); setSearch(""); setOpen(true); }}
                    >
                      <img
                        src={`https://minotar.net/avatar/${selected.mc_username}/24`}
                        className="w-5 h-5 rounded flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
                      />
                      <span className="text-white flex-1">{selected.mc_username}</span>
                      <span className="text-slate-500 text-xs">▼</span>
                    </button>
                  ) : (
                    <input
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                      placeholder="Search for a player..."
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
                      onFocus={() => setOpen(true)}
                    />
                  )}
                  <button
                    className="rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    onClick={submitGuess}
                    disabled={!selected}
                  >Guess</button>
                </div>
                {open && !selected && (
                  <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 shadow-xl max-h-64 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-slate-500">No players found</div>
                    ) : (
                      filtered.map(p => (
                        <button
                          key={p.mc_uuid}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-slate-800 transition"
                          onClick={() => { setSelected(p); setSearch(""); setOpen(false); }}
                        >
                          <img
                            src={`https://minotar.net/avatar/${p.mc_username}/24`}
                            className="w-5 h-5 rounded flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
                          />
                          <span className="text-white flex-1">{p.mc_username}</span>
                          {p.team && <span className="text-slate-500 text-xs">{p.team.abbreviation}</span>}
                          {p.rings > 0 && <span className="text-yellow-500 text-xs">{"🏆".repeat(Math.min(p.rings, 3))}</span>}
                          {!p.hasStats && <span className="text-slate-600 text-[10px]">no stats</span>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {!isDone && (
              <p className="text-xs text-slate-600 text-center">
                {MAX_GUESSES - guesses.length} guess{MAX_GUESSES - guesses.length !== 1 ? "es" : ""} remaining
                · {secretPool.length} possible answers · {allProfiles.length} guessable players
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Page wrapper (Suspense required for useSearchParams in App Router) ────────

export default function WordlePage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug     = resolved.league ?? "";
  const today    = getDayNum();
  return (
    <Suspense fallback={
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg p-10 text-center text-slate-500">
        Loading...
      </div>
    }>
      <WordleContent slug={slug} today={today} />
    </Suspense>
  );
}
