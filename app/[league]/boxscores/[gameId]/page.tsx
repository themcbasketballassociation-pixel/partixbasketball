"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

type Team = { id: string; name: string; abbreviation: string; logo_url?: string | null };
type Game = {
  id: string; league: string; scheduled_at: string; status: string;
  home_score: number | null; away_score: number | null;
  home_team: Team; away_team: Team;
};
type GameStat = {
  id: string; mc_uuid: string; game_id: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null;
  minutes_played: number | null; fg_made: number | null; fg_attempted: number | null;
  three_pt_made: number | null; three_pt_attempted: number | null; possession_time: number | null;
  players: { mc_uuid: string; mc_username: string };
};
type PlayerTeam = {
  mc_uuid: string; team_id: string; season?: string | null;
  teams?: { id: string; name: string; abbreviation: string } | null;
};
type Comment = {
  id: string; game_id: string; discord_id: string;
  discord_name: string | null; content: string; created_at: string;
  mc_username: string | null; mc_uuid: string | null;
};

// ── Stat helpers ─────────────────────────────────────────────────────────────

const fmtMins = (s: number | null) =>
  s === null ? "—" : `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const na = (v: number | null) => (v === null ? "—" : String(v));
const fmtFg = (m: number | null, a: number | null) =>
  m === null && a === null ? "—" : `${m ?? 0}/${a ?? 0}`;

const COLS: { key: string; label: string; render: (s: GameStat) => string }[] = [
  { key: "min", label: "MIN", render: s => fmtMins(s.minutes_played) },
  { key: "pts", label: "PTS", render: s => na(s.points) },
  { key: "orb", label: "ORB", render: s => na(s.rebounds_off) },
  { key: "drb", label: "DRB", render: s => na(s.rebounds_def) },
  { key: "trb", label: "REB", render: s => String((s.rebounds_off ?? 0) + (s.rebounds_def ?? 0)) },
  { key: "ast", label: "AST", render: s => na(s.assists) },
  { key: "stl", label: "STL", render: s => na(s.steals) },
  { key: "blk", label: "BLK", render: s => na(s.blocks) },
  { key: "tov", label: "TO",  render: s => na(s.turnovers) },
  { key: "fg",  label: "FG",  render: s => fmtFg(s.fg_made, s.fg_attempted) },
  { key: "3fg", label: "3FG", render: s => fmtFg(s.three_pt_made, s.three_pt_attempted) },
  { key: "pt",  label: "PT",  render: s => s.possession_time === null ? "—" : String(s.possession_time) },
];

function sumCol(stats: GameStat[], key: string): string {
  if (!stats.length) return "—";
  switch (key) {
    case "min": return fmtMins(stats.reduce((a, s) => a + (s.minutes_played ?? 0), 0));
    case "pts": return String(stats.reduce((a, s) => a + (s.points ?? 0), 0));
    case "orb": return String(stats.reduce((a, s) => a + (s.rebounds_off ?? 0), 0));
    case "drb": return String(stats.reduce((a, s) => a + (s.rebounds_def ?? 0), 0));
    case "trb": return String(stats.reduce((a, s) => a + (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0), 0));
    case "ast": return String(stats.reduce((a, s) => a + (s.assists ?? 0), 0));
    case "stl": return String(stats.reduce((a, s) => a + (s.steals ?? 0), 0));
    case "blk": return String(stats.reduce((a, s) => a + (s.blocks ?? 0), 0));
    case "tov": return String(stats.reduce((a, s) => a + (s.turnovers ?? 0), 0));
    case "fg":  return `${stats.reduce((a,s)=>a+(s.fg_made??0),0)}/${stats.reduce((a,s)=>a+(s.fg_attempted??0),0)}`;
    case "3fg": return `${stats.reduce((a,s)=>a+(s.three_pt_made??0),0)}/${stats.reduce((a,s)=>a+(s.three_pt_attempted??0),0)}`;
    case "pt":  return String(stats.reduce((a, s) => a + (s.possession_time ?? 0), 0));
    default: return "—";
  }
}

// ── Team stat table ───────────────────────────────────────────────────────────

function TeamTable({ team, stats, slug }: { team: Team; stats: GameStat[]; slug: string }) {
  const sorted = [...stats].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800 bg-slate-900">
        {team.logo_url
          ? <img src={team.logo_url} className="w-10 h-10 object-contain flex-shrink-0" alt="" />
          : <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-500">{team.abbreviation}</div>}
        <div>
          <div className="font-bold text-white text-base">{team.name}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{team.abbreviation}</div>
        </div>
      </div>
      {stats.length === 0 ? (
        <p className="text-slate-600 text-sm py-8 text-center">No stats entered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800">
                <th className="px-6 py-3 text-left text-blue-500 font-bold uppercase tracking-wider text-[11px] whitespace-nowrap">Player</th>
                {COLS.map(c => (
                  <th key={c.key} className="px-3 py-3 text-center text-slate-600 font-bold uppercase tracking-wider text-[11px]">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, si) => {
                const isTop = si === 0 && (s.points ?? 0) > 0;
                return (
                  <tr key={s.id} className={`border-b border-slate-800/50 transition hover:bg-slate-800/30 ${si % 2 === 0 ? "" : "bg-slate-950/40"}`}>
                    <td className="px-6 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={`https://minotar.net/avatar/${s.players?.mc_username ?? s.mc_uuid}/28`}
                          alt=""
                          className="w-7 h-7 rounded-md flex-shrink-0"
                          style={{ imageRendering: "pixelated" }}
                          onError={e => { (e.currentTarget as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/28"; }}
                        />
                        <Link
                          href={`/${slug}/players/${encodeURIComponent(s.players?.mc_username ?? s.mc_uuid)}`}
                          className="font-semibold text-slate-200 hover:text-white transition text-[13px]"
                        >
                          {s.players?.mc_username ?? s.mc_uuid}
                        </Link>
                        {isTop && (
                          <span className="text-[9px] bg-blue-950 text-blue-400 border border-blue-800 rounded px-1.5 py-0.5 font-bold">TOP</span>
                        )}
                      </div>
                    </td>
                    {COLS.map(c => {
                      const val = c.render(s);
                      const isPts = c.key === "pts";
                      return (
                        <td key={c.key} className={`px-3 py-2.5 text-center tabular-nums ${isPts ? "font-bold text-white text-sm" : "text-slate-500"}`}>
                          {val}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-950 border-t border-slate-700">
                <td className="px-6 py-2.5 text-slate-600 text-[10px] font-bold uppercase tracking-widest">Totals</td>
                {COLS.map(c => (
                  <td key={c.key} className="px-3 py-2.5 text-center tabular-nums text-slate-400 font-semibold">
                    {sumCol(sorted, c.key)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Split stats by team ───────────────────────────────────────────────────────

function splitStats(stats: GameStat[], game: Game, allPlayerTeams: PlayerTeam[]) {
  const homeId   = game.home_team?.id;
  const awayId   = game.away_team?.id;
  const homeAbbr = game.home_team?.abbreviation?.toUpperCase();
  const awayAbbr = game.away_team?.abbreviation?.toUpperCase();

  let homeStats = stats.filter(s => allPlayerTeams.some(pt => pt.mc_uuid === s.mc_uuid && pt.team_id === homeId));
  let awayStats = stats.filter(s => allPlayerTeams.some(pt => pt.mc_uuid === s.mc_uuid && pt.team_id === awayId));
  let matched = homeStats.length + awayStats.length;

  if (matched < Math.ceil(stats.length / 2)) {
    homeStats = stats.filter(s => allPlayerTeams.some(pt => pt.mc_uuid === s.mc_uuid && pt.teams?.abbreviation?.toUpperCase() === homeAbbr));
    awayStats = stats.filter(s => allPlayerTeams.some(pt => pt.mc_uuid === s.mc_uuid && pt.teams?.abbreviation?.toUpperCase() === awayAbbr));
    matched = homeStats.length + awayStats.length;
  }

  const allFallback = stats.length > 0 && matched < Math.ceil(stats.length / 2) ? stats : null;
  return { homeStats, awayStats, allFallback };
}

// ── Render comment text with @mention highlighting ────────────────────────────

function CommentText({ content, slug, myMcUsername }: { content: string; slug: string; myMcUsername?: string | null }) {
  const parts = content.split(/(@\w+)/g);
  return (
    <p className="text-slate-300 text-sm leading-relaxed">
      {parts.map((part, i) => {
        if (!/^@\w+$/.test(part)) return <span key={i}>{part}</span>;
        const username = part.slice(1);
        const isSelf = myMcUsername && username.toLowerCase() === myMcUsername.toLowerCase();
        if (isSelf) return (
          <span key={i} className="bg-blue-500/20 text-blue-300 font-bold rounded px-0.5">{part}</span>
        );
        return (
          <Link key={i} href={`/${slug}/players/${encodeURIComponent(username)}`} className="text-blue-400 font-semibold hover:underline">
            {part}
          </Link>
        );
      })}
    </p>
  );
}

// ── Comments section ──────────────────────────────────────────────────────────

function CommentsSection({ gameId, slug }: { gameId: string; slug: string }) {
  const { data: session } = useSession();
  const discordId = (session?.user as any)?.id as string | undefined;

  const [comments, setComments]             = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText]       = useState("");
  const [posting, setPosting]               = useState(false);
  const [postErr, setPostErr]               = useState("");
  const [replyingTo, setReplyingTo]         = useState<string | null>(null); // mc_username or discord_name

  // @ mention autocomplete
  const [allPlayers, setAllPlayers]         = useState<{ mc_username: string }[]>([]);
  const [mentionQuery, setMentionQuery]     = useState<string | null>(null);
  const [mentionIndex, setMentionIndex]     = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Derive own MC username from any comment this user posted with mc_username set
  const myMcUsername = comments.find(c => c.discord_id === discordId && c.mc_username)?.mc_username ?? null;

  useEffect(() => {
    fetch("/api/players").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setAllPlayers(d);
    }).catch(() => {});
  }, []);

  const mentionMatches = mentionQuery !== null
    ? allPlayers.filter(p => p.mc_username.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  const loadComments = useCallback(async () => {
    const data = await fetch(`/api/comments?game_id=${gameId}`).then(r => r.json()).catch(() => []);
    setComments(Array.isArray(data) ? data : []);
    setCommentsLoading(false);
  }, [gameId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);
    if (!val.trim()) setReplyingTo(null);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const m = before.match(/@(\w*)$/);
    setMentionQuery(m ? m[1] : null);
    setMentionIndex(0);
  };

  const insertMention = (username: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? commentText.length;
    const before = commentText.slice(0, cursor);
    const m = before.match(/@(\w*)$/);
    if (!m) return;
    const prefix = before.slice(0, before.length - m[0].length);
    const after  = commentText.slice(cursor);
    const next   = `${prefix}@${username} ${after}`;
    setCommentText(next);
    setMentionQuery(null);
    setTimeout(() => {
      ta.focus();
      const pos = prefix.length + username.length + 2;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionMatches.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[mentionIndex].mc_username); return; }
      if (e.key === "Escape")    { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment();
  };

  const handleReply = (username: string) => {
    const mention = `@${username} `;
    setReplyingTo(username);
    setCommentText(mention);
    setMentionQuery(null);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(mention.length, mention.length);
      ta.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  const postComment = async () => {
    if (!commentText.trim()) return;
    setPosting(true); setPostErr("");
    const r = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId, content: commentText.trim() }),
    });
    setPosting(false);
    if (r.ok) { setCommentText(""); setMentionQuery(null); setReplyingTo(null); loadComments(); }
    else { const d = await r.json(); setPostErr(d.error ?? "Failed to post"); }
  };

  const deleteComment = async (id: string) => {
    await fetch(`/api/comments/${id}`, { method: "DELETE" });
    loadComments();
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-2 rounded-t-2xl overflow-hidden">
        <h2 className="text-base font-bold text-white">Comments</h2>
        {comments.length > 0 && (
          <span className="text-xs text-slate-500 bg-slate-800 rounded-full px-2 py-0.5">{comments.length}</span>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Comment list */}
        {commentsLoading ? (
          <p className="text-slate-600 text-sm text-center py-4">Loading comments…</p>
        ) : comments.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-6">No comments yet. Be the first!</p>
        ) : (
          <div className="space-y-4">
            {comments.map(c => {
              const isOwn = c.discord_id === discordId;
              const displayName = c.mc_username ?? c.discord_name ?? "Discord User";
              return (
                <div key={c.id} className="flex gap-3 group">
                  {c.mc_username ? (
                    <img
                      src={`https://minotar.net/helm/${c.mc_username}/40`}
                      alt={c.mc_username}
                      className="w-9 h-9 rounded-lg flex-shrink-0 ring-1 ring-slate-700"
                      style={{ imageRendering: "pixelated" }}
                      onError={e => { (e.currentTarget as HTMLImageElement).src = "https://minotar.net/helm/MHF_Steve/40"; }}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 bg-indigo-950 border border-indigo-800 flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.031.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                      </svg>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {c.mc_username ? (
                        <Link href={`/${slug}/players/${encodeURIComponent(c.mc_username)}`} className="font-semibold text-white text-sm hover:text-blue-400 transition">
                          {displayName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-white text-sm">{displayName}</span>
                      )}
                      {!c.mc_username && (
                        <span className="text-[9px] bg-indigo-950 text-indigo-400 border border-indigo-800 rounded px-1.5 py-0.5 font-bold">Discord</span>
                      )}
                      <span className="text-slate-600 text-xs">
                        {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" · "}
                        {new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                      {session && (
                        <button
                          onClick={() => handleReply(c.mc_username ?? c.discord_name ?? "user")}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-500 hover:text-blue-400 transition font-semibold"
                        >
                          Reply
                        </button>
                      )}
                      {isOwn && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-red-600 hover:text-red-400 transition font-semibold"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <CommentText content={c.content} slug={slug} myMcUsername={myMcUsername} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {comments.length > 0 && <div className="border-t border-slate-800" />}

        {!session ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950 px-5 py-4">
            <p className="text-slate-500 text-sm">Sign in with Discord to leave a comment</p>
            <button
              onClick={() => signIn("discord")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition text-white text-sm font-semibold flex-shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.031.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
              </svg>
              Sign in
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Replying-to pill */}
            {replyingTo && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-800/50 w-fit">
                <span className="text-blue-400 text-xs">↩ Replying to <span className="font-bold">@{replyingTo}</span></span>
                <button
                  onClick={() => { setReplyingTo(null); setCommentText(""); }}
                  className="text-blue-600 hover:text-blue-300 text-xs leading-none transition"
                  aria-label="Cancel reply"
                >✕</button>
              </div>
            )}
            {/* Textarea with @ mention autocomplete */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={commentText}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                placeholder="Write a comment… type @name to mention a player"
                maxLength={500}
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 text-white text-sm px-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none placeholder:text-slate-600"
              />
              {/* Mention autocomplete dropdown */}
              {mentionMatches.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-50">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">Mention a player</div>
                  {mentionMatches.map((p, i) => (
                    <div
                      key={p.mc_username}
                      className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition text-sm ${i === mentionIndex ? "bg-blue-600 text-white" : "text-slate-200 hover:bg-slate-800"}`}
                      onMouseDown={e => { e.preventDefault(); insertMention(p.mc_username); }}
                    >
                      <img
                        src={`https://minotar.net/helm/${p.mc_username}/24`}
                        className="w-6 h-6 rounded flex-shrink-0"
                        style={{ imageRendering: "pixelated" }}
                        alt=""
                        onError={e => { (e.currentTarget as HTMLImageElement).src = "https://minotar.net/helm/MHF_Steve/24"; }}
                      />
                      <span className="font-semibold">@{p.mc_username}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {postErr && <p className="text-red-400 text-xs">{postErr}</p>}
            <div className="flex items-center justify-between">
              <span className="text-slate-600 text-xs">{commentText.length}/500 · Ctrl+Enter to post</span>
              <button
                onClick={postComment}
                disabled={posting || !commentText.trim()}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-semibold transition"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BoxscorePage({ params }: { params?: Promise<{ league?: string; gameId?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string; gameId?: string };
  const slug   = resolved.league ?? "";
  const gameId = resolved.gameId ?? "";

  const [game, setGame]               = useState<Game | null>(null);
  const [stats, setStats]             = useState<GameStat[]>([]);
  const [playerTeams, setPlayerTeams] = useState<PlayerTeam[]>([]);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);
  const [pinned, setPinned]           = useState(false);

  useEffect(() => {
    if (!slug || !gameId || typeof window === "undefined") return;
    const saved = JSON.parse(localStorage.getItem(`partix:pinned:${slug}`) ?? "[]") as string[];
    setPinned(saved.includes(gameId));
  }, [slug, gameId]);

  const togglePin = () => {
    const key = `partix:pinned:${slug}`;
    const saved = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    const next = pinned ? saved.filter((id: string) => id !== gameId) : [...saved, gameId];
    localStorage.setItem(key, JSON.stringify(next));
    setPinned(!pinned);
  };

  useEffect(() => {
    if (!slug || !gameId) return;
    Promise.all([
      fetch(`/api/games/${gameId}`).then(r => r.json()),
      fetch(`/api/game-stats?game_id=${gameId}`).then(r => r.json()),
      fetch(`/api/teams/players?league=${slug}`).then(r => r.json()),
    ]).then(([g, s, pt]) => {
      if (!g || g.error) { setNotFound(true); setLoading(false); return; }
      setGame(g);
      setStats(Array.isArray(s) ? s : []);
      setPlayerTeams(Array.isArray(pt) ? pt : []);
      setLoading(false);
    }).catch(() => { setNotFound(true); setLoading(false); });
  }, [slug, gameId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-16 text-center text-slate-500">
        Loading box score…
      </div>
    );
  }

  if (notFound || !game) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-16 text-center">
        <p className="text-slate-400 font-semibold mb-4">Game not found</p>
        <Link href={`/${slug}/boxscores`} className="text-blue-400 text-sm hover:underline">← Back to Box Scores</Link>
      </div>
    );
  }

  const homeWon = (game.home_score ?? 0) > (game.away_score ?? 0);
  const awayWon = (game.away_score ?? 0) > (game.home_score ?? 0);
  const { homeStats, awayStats, allFallback } = splitStats(stats, game, playerTeams);
  const dateStr = new Date(game.scheduled_at).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "Etc/GMT+5",
  });

  return (
    <div className="space-y-4">

      {/* Back + actions bar */}
      <div className="flex items-center justify-between">
        <Link
          href={`/${slug}/boxscores`}
          className="inline-flex items-center gap-1.5 text-slate-500 text-sm hover:text-slate-300 transition"
        >
          ← Box Scores
        </Link>
        <button
          onClick={togglePin}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
            pinned
              ? "bg-yellow-950 border-yellow-700 text-yellow-300 hover:bg-yellow-900"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
          }`}
        >
          📌 {pinned ? "Pinned" : "Pin Game"}
        </button>
      </div>

      {/* Score header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="flex items-center justify-center p-6 gap-4" style={{ flexWrap: "wrap" }}>

          {/* Home team */}
          <div className="flex flex-col items-end gap-2 text-right" style={{ minWidth: 0 }}>
            {game.home_team.logo_url
              ? <img src={game.home_team.logo_url} className={`w-16 h-16 object-contain ${homeWon ? "" : "opacity-40"}`} alt="" />
              : <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 font-bold">{game.home_team.abbreviation}</div>}
            <div className={`text-xl font-black leading-tight ${homeWon ? "text-white" : "text-slate-500"}`} style={{ wordBreak: "break-word" }}>{game.home_team.name}</div>
            <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">{game.home_team.abbreviation} · HOME</div>
          </div>

          {/* Score */}
          <div className="text-center px-4">
            <div className="flex items-center justify-center gap-4">
              <span className={`text-6xl font-black tabular-nums leading-none ${homeWon ? "text-white" : "text-slate-600"}`}>
                {game.home_score}
              </span>
              <span className="text-slate-700 text-2xl font-light">—</span>
              <span className={`text-6xl font-black tabular-nums leading-none ${awayWon ? "text-white" : "text-slate-600"}`}>
                {game.away_score}
              </span>
            </div>
            <div className="flex items-center justify-center gap-3 mt-3">
              <span className="text-[10px] font-bold text-green-400 bg-green-950 border border-green-800 rounded-full px-3 py-1 tracking-wide">
                FINAL
              </span>
              <span className="text-slate-500 text-xs">{dateStr}</span>
            </div>
          </div>

          {/* Away team */}
          <div className="flex flex-col items-start gap-2" style={{ minWidth: 0 }}>
            {game.away_team.logo_url
              ? <img src={game.away_team.logo_url} className={`w-16 h-16 object-contain ${awayWon ? "" : "opacity-40"}`} alt="" />
              : <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 font-bold">{game.away_team.abbreviation}</div>}
            <div className={`text-xl font-black leading-tight ${awayWon ? "text-white" : "text-slate-500"}`} style={{ wordBreak: "break-word" }}>{game.away_team.name}</div>
            <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">{game.away_team.abbreviation} · AWAY</div>
          </div>
        </div>
      </div>

      {/* Stat tables */}
      {stats.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-600">
          No box score data entered for this game yet.
        </div>
      ) : allFallback ? (
        <TeamTable team={game.home_team} stats={allFallback} slug={slug} />
      ) : (
        <>
          <TeamTable team={game.home_team} stats={homeStats} slug={slug} />
          <TeamTable team={game.away_team} stats={awayStats} slug={slug} />
        </>
      )}

      {/* Comments */}
      <CommentsSection gameId={gameId} slug={slug} />
    </div>
  );
}
