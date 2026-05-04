"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────────

type Article = {
  id: string;
  league: string;
  title: string;
  body: string;
  image_url: string | null;
  created_at: string;
  submitted_by_name: string | null;
  status: string;
};

type Comment = {
  id: string;
  article_id: string;
  discord_id: string;
  discord_name: string | null;
  content: string;
  created_at: string;
  mc_username: string | null;
  mc_uuid: string | null;
};

// ── League badge colors ───────────────────────────────────────────────────────

const leagueBadgeClass: Record<string, string> = {
  pba:  "bg-red-700",
  pcaa: "bg-blue-700",
  pbgl: "bg-orange-700",
};

const leagueLabel: Record<string, string> = {
  pba:  "MBA",
  pcaa: "MCAA",
  pbgl: "MBGL",
};

// ── Comment text with @mention rendering ─────────────────────────────────────

function CommentText({
  content,
  slug,
  myMcUsername,
}: {
  content: string;
  slug: string;
  myMcUsername?: string | null;
}) {
  const parts = content.split(/(@\w+)/g);
  return (
    <p className="text-slate-300 text-sm leading-relaxed">
      {parts.map((part, i) => {
        if (!/^@\w+$/.test(part)) return <span key={i}>{part}</span>;
        const username = part.slice(1);
        const isSelf =
          myMcUsername &&
          username.toLowerCase() === myMcUsername.toLowerCase();
        if (isSelf)
          return (
            <span
              key={i}
              className="bg-blue-500/20 text-blue-300 font-bold rounded px-0.5"
            >
              {part}
            </span>
          );
        return (
          <Link
            key={i}
            href={`/${slug}/players/${encodeURIComponent(username)}`}
            className="text-blue-400 font-semibold hover:underline"
          >
            {part}
          </Link>
        );
      })}
    </p>
  );
}

// ── Comments section ──────────────────────────────────────────────────────────

function CommentsSection({
  articleId,
  slug,
}: {
  articleId: string;
  slug: string;
}) {
  const { data: session } = useSession();
  const discordId = (session?.user as any)?.id as string | undefined;

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState("");

  // @ mention autocomplete
  const [allPlayers, setAllPlayers] = useState<{ mc_username: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/players")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setAllPlayers(d);
      })
      .catch(() => {});
  }, []);

  const mentionMatches =
    mentionQuery !== null
      ? allPlayers
          .filter((p) =>
            p.mc_username.toLowerCase().startsWith(mentionQuery.toLowerCase())
          )
          .slice(0, 6)
      : [];

  const loadComments = useCallback(async () => {
    const data = await fetch(`/api/comments?article_id=${articleId}`)
      .then((r) => r.json())
      .catch(() => []);
    setComments(Array.isArray(data) ? data : []);
    setCommentsLoading(false);
  }, [articleId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Derive myMcUsername from loaded comments
  const myMcUsername =
    discordId && comments.length > 0
      ? (comments.find((c) => c.discord_id === discordId && c.mc_username)
          ?.mc_username ?? null)
      : null;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCommentText(val);
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
    const after = commentText.slice(cursor);
    const next = `${prefix}@${username} ${after}`;
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
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionMatches.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionMatches[mentionIndex].mc_username);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postComment();
  };

  const postComment = async () => {
    if (!commentText.trim()) return;
    setPosting(true);
    setPostErr("");
    const r = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ article_id: articleId, content: commentText.trim() }),
    });
    setPosting(false);
    if (r.ok) {
      setCommentText("");
      setMentionQuery(null);
      loadComments();
    } else {
      const d = await r.json();
      setPostErr(d.error ?? "Failed to post");
    }
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
          <span className="text-xs text-slate-500 bg-slate-800 rounded-full px-2 py-0.5">
            {comments.length}
          </span>
        )}
      </div>

      <div className="p-6 space-y-4">
        {/* Comment list */}
        {commentsLoading ? (
          <p className="text-slate-600 text-sm text-center py-4">
            Loading comments…
          </p>
        ) : comments.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-6">
            No comments yet. Be the first!
          </p>
        ) : (
          <div className="space-y-4">
            {comments.map((c) => {
              const isOwn = c.discord_id === discordId;
              const displayName =
                c.mc_username ?? c.discord_name ?? "Discord User";
              return (
                <div key={c.id} className="flex gap-3 group">
                  {c.mc_username ? (
                    <img
                      src={`https://minotar.net/helm/${c.mc_username}/40`}
                      alt={c.mc_username}
                      className="w-9 h-9 rounded-lg flex-shrink-0 ring-1 ring-slate-700"
                      style={{ imageRendering: "pixelated" }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src =
                          "https://minotar.net/helm/MHF_Steve/40";
                      }}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 bg-indigo-950 border border-indigo-800 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-indigo-400"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.031.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                      </svg>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {c.mc_username ? (
                        <Link
                          href={`/${slug}/players/${encodeURIComponent(c.mc_username)}`}
                          className="font-semibold text-white text-sm hover:text-blue-400 transition"
                        >
                          {displayName}
                        </Link>
                      ) : (
                        <span className="font-semibold text-white text-sm">
                          {displayName}
                        </span>
                      )}
                      {!c.mc_username && (
                        <span className="text-[9px] bg-indigo-950 text-indigo-400 border border-indigo-800 rounded px-1.5 py-0.5 font-bold">
                          Discord
                        </span>
                      )}
                      <span className="text-slate-600 text-xs">
                        {new Date(c.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {" · "}
                        {new Date(c.created_at).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {isOwn && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-red-600 hover:text-red-400 transition font-semibold"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <CommentText
                      content={c.content}
                      slug={slug}
                      myMcUsername={myMcUsername}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {comments.length > 0 && <div className="border-t border-slate-800" />}

        {!session ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950 px-5 py-4">
            <p className="text-slate-500 text-sm">
              Sign in with Discord to leave a comment
            </p>
            <button
              onClick={() => signIn("discord")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition text-white text-sm font-semibold flex-shrink-0"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.031.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Sign in
            </button>
          </div>
        ) : (
          <div className="space-y-2">
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
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-800">
                    Mention a player
                  </div>
                  {mentionMatches.map((p, i) => (
                    <div
                      key={p.mc_username}
                      className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition text-sm ${
                        i === mentionIndex
                          ? "bg-blue-600 text-white"
                          : "text-slate-200 hover:bg-slate-800"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(p.mc_username);
                      }}
                    >
                      <img
                        src={`https://minotar.net/helm/${p.mc_username}/24`}
                        className="w-6 h-6 rounded flex-shrink-0"
                        style={{ imageRendering: "pixelated" }}
                        alt=""
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "https://minotar.net/helm/MHF_Steve/24";
                        }}
                      />
                      <span className="font-semibold">@{p.mc_username}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {postErr && <p className="text-red-400 text-xs">{postErr}</p>}
            <div className="flex items-center justify-between">
              <span className="text-slate-600 text-xs">
                {commentText.length}/500 · Ctrl+Enter to post
              </span>
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

export default function ArticlePage() {
  const params = useParams();
  const slug = (params?.league as string) ?? "mba";
  const articleId = (params?.articleId as string) ?? "";

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!articleId) return;
    fetch(`/api/articles/${articleId}`)
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) {
          setArticle(d);
          setLoading(false);
        }
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [articleId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0d12] py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-16 text-center text-slate-500">
            Loading article…
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="min-h-screen bg-[#0a0d12] py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-16 text-center">
            <p className="text-slate-400 font-semibold mb-4">Article not found</p>
            <Link
              href={`/${slug}/board`}
              className="text-blue-400 text-sm hover:underline"
            >
              ← Back to Press Board
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const dateStr = new Date(article.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const badgeClass =
    leagueBadgeClass[article.league] ?? "bg-slate-700";
  const badgeLabel =
    leagueLabel[article.league] ?? article.league.toUpperCase();

  return (
    <div className="min-h-screen bg-[#0a0d12] py-6 px-4">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Back link */}
        <Link
          href={`/${slug}/board`}
          className="inline-flex items-center gap-1.5 text-slate-500 text-sm hover:text-slate-300 transition"
        >
          ← Press Board
        </Link>

        {/* Article card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">

          {/* Header */}
          <div className="px-6 py-6 border-b border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <span
                className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full text-white ${badgeClass}`}
              >
                {badgeLabel}
              </span>
              <span className="text-slate-500 text-xs">{dateStr}</span>
            </div>
            <h1 className="text-2xl font-bold text-white leading-snug mb-2">
              {article.title}
            </h1>
            {article.submitted_by_name && (
              <p className="text-slate-500 text-sm">
                By {article.submitted_by_name}
              </p>
            )}
          </div>

          {/* Optional image */}
          {article.image_url && (
            <div className="px-6 pt-6">
              <img
                src={article.image_url}
                alt={article.title}
                className="rounded-xl max-h-96 object-cover w-full"
              />
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-6">
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
              {article.body}
            </p>
          </div>
        </div>

        {/* Comments */}
        <CommentsSection articleId={articleId} slug={slug} />

      </div>
    </div>
  );
}
