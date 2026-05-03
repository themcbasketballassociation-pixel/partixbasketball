"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Link from "next/link";

type LinkedPlayer = { mc_uuid: string; mc_username: string; discord_id: string };
type Team = { id: string; name: string; abbreviation: string; logo_url: string | null };
type PinnedGame = {
  id: string; scheduled_at: string; status: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};
type Comment = {
  id: string; game_id: string; discord_id: string; discord_name: string | null;
  content: string; created_at: string; mc_username: string | null;
};

export default function ProfilePage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved.league ?? "";

  const { data: session, status } = useSession();
  const discordId = (session?.user as any)?.id as string | undefined;

  const [linkedPlayer, setLinkedPlayer]   = useState<LinkedPlayer | null | "loading">("loading");
  const [pinnedGames, setPinnedGames]     = useState<PinnedGame[]>([]);
  const [myComments, setMyComments]       = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Check if Discord is linked to an MC account
  useEffect(() => {
    if (!discordId) { setLinkedPlayer(null); return; }
    fetch("/api/players")
      .then(r => r.json())
      .then((players: LinkedPlayer[]) => {
        const match = Array.isArray(players)
          ? players.find(p => p.discord_id === discordId) ?? null
          : null;
        setLinkedPlayer(match);
      })
      .catch(() => setLinkedPlayer(null));
  }, [discordId]);

  // Load pinned games from localStorage then fetch their data
  useEffect(() => {
    if (!slug || typeof window === "undefined") return;
    const ids = JSON.parse(localStorage.getItem(`partix:pinned:${slug}`) ?? "[]") as string[];
    if (!ids.length) { setPinnedGames([]); return; }
    Promise.all(ids.map(id => fetch(`/api/games/${id}`).then(r => r.json()).catch(() => null)))
      .then(games => setPinnedGames(games.filter(Boolean) as PinnedGame[]));
  }, [slug]);

  // Load this user's comments
  useEffect(() => {
    if (!discordId) return;
    setCommentsLoading(true);
    fetch(`/api/comments?discord_id=${discordId}`)
      .then(r => r.json())
      .then(d => { setMyComments(Array.isArray(d) ? d : []); setCommentsLoading(false); })
      .catch(() => setCommentsLoading(false));
  }, [discordId]);

  const unpinGame = (id: string) => {
    const key = `partix:pinned:${slug}`;
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    localStorage.setItem(key, JSON.stringify(saved.filter((i: string) => i !== id)));
    setPinnedGames(prev => prev.filter(g => g.id !== id));
  };

  // ── Not signed in ───────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-16 text-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Profile</h2>
          <p className="text-slate-500 text-sm mt-0.5">Sign in to access your profile</p>
        </div>
        <div className="p-12 flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-full bg-indigo-950 border border-indigo-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.031.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
          </div>
          <div>
            <p className="text-white font-bold text-lg">Sign in with Discord</p>
            <p className="text-slate-500 text-sm mt-1">Comment on box scores, pin games, and more</p>
          </div>
          <button
            onClick={() => signIn("discord")}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition text-white font-bold text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.031.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
            </svg>
            Sign in with Discord
          </button>
        </div>
      </div>
    );
  }

  const isLinked  = linkedPlayer !== "loading" && linkedPlayer !== null;
  const player    = linkedPlayer !== "loading" ? linkedPlayer : null;

  return (
    <div className="space-y-4">

      {/* ── User card ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {session.user?.image && (
              <img src={session.user.image} className="w-10 h-10 rounded-full ring-2 ring-slate-700" alt="" />
            )}
            <div>
              <h2 className="text-lg font-bold text-white">{session.user?.name}</h2>
              <p className="text-slate-500 text-xs">Discord Account</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:border-slate-500 transition"
          >
            Sign out
          </button>
        </div>

        {/* MC account status */}
        <div className="p-6">
          {linkedPlayer === "loading" ? (
            <p className="text-slate-600 text-sm">Checking account link…</p>
          ) : isLinked && player ? (
            <div className="flex items-center gap-4">
              <img
                src={`https://minotar.net/helm/${player.mc_username}/80`}
                className="w-16 h-16 rounded-xl ring-2 ring-slate-700"
                style={{ imageRendering: "pixelated" }}
                alt={player.mc_username}
                onError={e => { (e.currentTarget as HTMLImageElement).src = "https://minotar.net/helm/MHF_Steve/80"; }}
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-lg">{player.mc_username}</span>
                  <span className="text-[10px] bg-green-950 text-green-400 border border-green-800 rounded-full px-2 py-0.5 font-bold">✓ Linked</span>
                </div>
                <p className="text-slate-500 text-sm mt-0.5">Minecraft Account</p>
                <Link
                  href={`/${slug}/players/${encodeURIComponent(player.mc_username)}`}
                  className="text-blue-400 text-xs hover:underline mt-1 inline-block"
                >
                  View player profile →
                </Link>
              </div>
            </div>
          ) : (
            /* ── Not linked ─────────────────────────────────────────────── */
            <div className="rounded-xl border border-amber-800 bg-amber-950/40 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-lg">⚠️</span>
                <span className="text-amber-300 font-bold text-sm">No Minecraft Account Linked</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Your Discord isn't linked to a Minecraft account yet. To link your accounts:
              </p>
              <ol className="space-y-2 text-sm text-slate-300">
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold flex-shrink-0">1.</span>
                  <span>Join the Minecraft server and type <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded text-xs font-mono">/discordlink</code></span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold flex-shrink-0">2.</span>
                  <span>Copy the link code you receive in-game</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-amber-400 font-bold flex-shrink-0">3.</span>
                  <span>In the Discord server, run <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded text-xs font-mono">/discordlink</code> and paste the code</span>
                </li>
              </ol>
              <p className="text-slate-500 text-xs">
                Once linked, your comments will show your Minecraft username and head.
                If an admin has already linked your account, refresh this page.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Pinned Box Scores ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h3 className="font-bold text-white">📌 Pinned Box Scores</h3>
          <p className="text-slate-500 text-xs mt-0.5">Games you've pinned — pin them from any box score page</p>
        </div>
        <div className="p-6">
          {pinnedGames.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-4">No pinned games yet. Open a box score and click "Pin Game".</p>
          ) : (
            <div className="space-y-2">
              {pinnedGames.map(g => {
                const homeWon = (g.home_score ?? 0) > (g.away_score ?? 0);
                const awayWon = (g.away_score ?? 0) > (g.home_score ?? 0);
                return (
                  <div key={g.id} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                    <Link href={`/${slug}/boxscores/${g.id}`} className="flex-1 flex items-center gap-3 hover:opacity-80 transition">
                      {g.home_team?.logo_url && <img src={g.home_team.logo_url} className="w-7 h-7 object-contain flex-shrink-0" alt="" />}
                      <span className={`font-semibold text-sm ${homeWon ? "text-white" : "text-slate-500"}`}>{g.home_team?.abbreviation}</span>
                      <span className={`font-black tabular-nums text-sm ${homeWon ? "text-white" : "text-slate-600"}`}>{g.home_score}</span>
                      <span className="text-slate-700 text-xs">–</span>
                      <span className={`font-black tabular-nums text-sm ${awayWon ? "text-white" : "text-slate-600"}`}>{g.away_score}</span>
                      <span className={`font-semibold text-sm ${awayWon ? "text-white" : "text-slate-500"}`}>{g.away_team?.abbreviation}</span>
                      {g.away_team?.logo_url && <img src={g.away_team.logo_url} className="w-7 h-7 object-contain flex-shrink-0" alt="" />}
                      <span className="text-slate-600 text-xs ml-auto">
                        {new Date(g.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </Link>
                    <button onClick={() => unpinGame(g.id)} className="text-slate-600 hover:text-red-400 text-sm transition" title="Unpin">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── My Comments ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h3 className="font-bold text-white">My Comments</h3>
          <p className="text-slate-500 text-xs mt-0.5">All comments you've left under box scores</p>
        </div>
        <div className="p-6">
          {commentsLoading ? (
            <p className="text-slate-600 text-sm text-center py-4">Loading…</p>
          ) : myComments.length === 0 ? (
            <p className="text-slate-600 text-sm text-center py-4">You haven't commented on any games yet.</p>
          ) : (
            <div className="space-y-3">
              {myComments.map(c => (
                <div key={c.id} className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <Link href={`/${slug}/boxscores/${c.game_id}`} className="text-xs text-blue-400 hover:underline">
                      View box score →
                    </Link>
                    <span className="text-slate-600 text-xs">
                      {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
