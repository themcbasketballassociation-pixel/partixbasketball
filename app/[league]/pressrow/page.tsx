"use client";
import { useSession, signIn } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type Team = { id: string; name: string; abbreviation: string; logo_url: string | null };
type Game = {
  id: string; league: string; scheduled_at: string;
  home_team: Team; away_team: Team;
  status: string; season: string | null;
  home_score: number | null; away_score: number | null;
};
type CrewClaim = {
  id: string; game_id: string; discord_id: string; discord_name: string;
  role: string; league: string; claimed_at: string;
};

const ROLES = [
  { key: "streamer",    label: "Streamer",    cap: 1, coins: 1000, color: "#7c3aed", dim: "#3b1f7a" },
  { key: "ref",         label: "Ref",         cap: 2, coins: 500,  color: "#b45309", dim: "#5c2d0a" },
  { key: "commentator", label: "Commentator", cap: 2, coins: 500,  color: "#0e7490", dim: "#0a3a4a" },
] as const;

const ROLE_COINS: Record<string, number> = { streamer: 1000, ref: 500, commentator: 500 };

export default function PressRowPage() {
  const params = useParams();
  const leagueSlug = (params?.league as string) ?? "mba";
  const { data: session, status } = useSession();
  const discordId = (session?.user as any)?.id as string | undefined;

  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [claims, setClaims] = useState<CrewClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (!discordId) { setHasAccess(null); return; }
    fetch(`/api/crew-access?discord_id=${discordId}`)
      .then((r) => r.json())
      .then((d) => setHasAccess(d.hasAccess ?? false))
      .catch(() => setHasAccess(false));
  }, [discordId]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [gRes, cRes] = await Promise.all([
      fetch(`/api/games?league=${leagueSlug}`),
      fetch(`/api/game-crew?league=${leagueSlug}`),
    ]);
    const gData = await gRes.json().catch(() => []);
    const cData = await cRes.json().catch(() => []);
    setGames(Array.isArray(gData) ? gData : []);
    setClaims(Array.isArray(cData) ? cData : []);
    setLoading(false);
  }, [leagueSlug]);

  useEffect(() => { reload(); }, [reload]);

  const myCoins = claims
    .filter((c) => c.discord_id === discordId)
    .reduce((sum, c) => sum + (ROLE_COINS[c.role] ?? 0), 0);

  const handleClaim = async (gameId: string, role: string) => {
    const key = `${gameId}-${role}`;
    setClaiming(key);
    const r = await fetch("/api/game-crew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId, role, league: leagueSlug }),
    });
    const data = await r.json();
    if (r.ok) {
      setClaims((prev) => [...prev, data]);
    } else {
      alert(data.error ?? "Failed to claim");
    }
    setClaiming(null);
  };

  const handleUnclaim = async (claimId: string) => {
    const r = await fetch(`/api/game-crew/${claimId}`, { method: "DELETE" });
    if (r.ok) setClaims((prev) => prev.filter((c) => c.id !== claimId));
  };

  if (status === "loading") {
    return <div style={{ color: "#444", textAlign: "center", padding: "80px 0" }}>Loading…</div>;
  }

  if (!session) {
    return (
      <div style={{ maxWidth: 460, margin: "80px auto", background: "#111", border: "1px solid #222", borderRadius: 16, padding: "40px 32px", textAlign: "center" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginBottom: 6 }}>Press Row</div>
        <div style={{ color: "#555", fontSize: 14, marginBottom: 28 }}>
          Sign in with Discord to claim crew spots and earn coins.
        </div>
        <button
          onClick={() => signIn("discord")}
          style={{ background: "#5865F2", color: "#fff", border: "none", borderRadius: 8, padding: "11px 28px", fontWeight: 700, cursor: "pointer", fontSize: 15 }}
        >
          Sign in with Discord
        </button>
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div style={{ maxWidth: 460, margin: "80px auto", background: "#111", border: "1px solid #222", borderRadius: 16, padding: "40px 32px", textAlign: "center" }}>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 24, marginBottom: 6 }}>Press Row</div>
        <div style={{ color: "#555", fontSize: 14 }}>
          You don&apos;t have access to claim crew spots yet. Contact an admin to get approved.
        </div>
      </div>
    );
  }

  const sorted = [...games].sort(
    (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  );

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, marginBottom: 4 }}>Press Row</div>
          <div style={{ color: "#555", fontSize: 13 }}>Claim a crew spot for games and earn coins.</div>
        </div>
        {hasAccess && (
          <div style={{ background: "#0a0f1a", border: "1px solid #1e3050", borderRadius: 12, padding: "14px 22px", textAlign: "center", minWidth: 120 }}>
            <div style={{ color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Your Coins</div>
            <div style={{ color: "#fff", fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{myCoins.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Rates reference */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {ROLES.map((r) => (
          <div key={r.key} style={{ background: "#0a0a0a", border: `1px solid #1a1a1a`, borderRadius: 8, padding: "6px 14px", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: r.color, fontWeight: 700, fontSize: 12 }}>{r.label}</span>
            <span style={{ color: "#444", fontSize: 11 }}>·</span>
            <span style={{ color: "#777", fontSize: 12 }}>{r.coins.toLocaleString()} coins</span>
            <span style={{ color: "#333", fontSize: 11 }}>·</span>
            <span style={{ color: "#444", fontSize: 11 }}>max {r.cap}</span>
          </div>
        ))}
      </div>

      {/* Games */}
      {loading ? (
        <div style={{ color: "#444", textAlign: "center", padding: "60px 0" }}>Loading games…</div>
      ) : sorted.length === 0 ? (
        <div style={{ color: "#444", textAlign: "center", padding: "60px 0" }}>No games found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              claims={claims.filter((c) => c.game_id === game.id)}
              discordId={discordId ?? ""}
              hasAccess={!!hasAccess}
              claiming={claiming}
              onClaim={handleClaim}
              onUnclaim={handleUnclaim}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GameCard({
  game, claims, discordId, hasAccess, claiming, onClaim, onUnclaim,
}: {
  game: Game;
  claims: CrewClaim[];
  discordId: string;
  hasAccess: boolean;
  claiming: string | null;
  onClaim: (gameId: string, role: string) => void;
  onUnclaim: (claimId: string) => void;
}) {
  const date = new Date(game.scheduled_at);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const isCompleted = game.status === "completed";

  return (
    <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 12, overflow: "hidden" }}>
      {/* Game header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #161616", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
            {game.away_team.abbreviation} @ {game.home_team.abbreviation}
          </span>
          {game.season && (
            <span style={{ color: "#333", fontSize: 11 }}>{game.season}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "#444", fontSize: 11 }}>{dateStr} · {timeStr}</span>
          <span style={{
            background: isCompleted ? "#111" : "#0a1a0a",
            border: `1px solid ${isCompleted ? "#222" : "#14532d"}`,
            color: isCompleted ? "#444" : "#4ade80",
            borderRadius: 5, fontSize: 10, fontWeight: 700, padding: "2px 7px", textTransform: "uppercase",
          }}>
            {game.status}
          </span>
        </div>
      </div>

      {/* Role slots */}
      <div style={{ padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ROLES.map((role) => {
          const roleClaims = claims.filter((c) => c.role === role.key);
          const myClaim = roleClaims.find((c) => c.discord_id === discordId);
          const claimingThis = claiming === `${game.id}-${role.key}`;

          return (
            <div
              key={role.key}
              style={{ flex: 1, minWidth: 140, background: "#080808", border: "1px solid #161616", borderRadius: 8, padding: "10px 12px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: role.color, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {role.label}
                </span>
                <span style={{ color: "#333", fontSize: 10 }}>{role.coins} coins</span>
              </div>

              {Array.from({ length: role.cap }).map((_, i) => {
                const slot = roleClaims[i];
                const isMe = slot?.discord_id === discordId;
                return (
                  <div key={i} style={{ marginTop: i > 0 ? 4 : 0 }}>
                    {slot ? (
                      <div style={{
                        background: isMe ? "#0a1020" : "#0d0d0d",
                        border: `1px solid ${isMe ? "#1e3a6a" : "#1a1a1a"}`,
                        borderRadius: 6, padding: "5px 8px",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
                      }}>
                        <span style={{ color: isMe ? "#93c5fd" : "#666", fontSize: 12, fontWeight: isMe ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {isMe ? "You" : (slot.discord_name || slot.discord_id)}
                        </span>
                        {isMe && (
                          <button
                            onClick={() => onUnclaim(slot.id)}
                            style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                            title="Unclaim"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ) : hasAccess && !myClaim ? (
                      <button
                        onClick={() => onClaim(game.id, role.key)}
                        disabled={!!claimingThis}
                        style={{
                          width: "100%", background: "#0a120a", border: "1px dashed #1a3a1a",
                          borderRadius: 6, padding: "5px 8px", color: "#4ade80",
                          fontSize: 12, cursor: "pointer", fontWeight: 600,
                        }}
                      >
                        {claimingThis ? "…" : "+ Claim"}
                      </button>
                    ) : (
                      <div style={{
                        background: "#080808", border: "1px dashed #161616",
                        borderRadius: 6, padding: "5px 8px", color: "#2a2a2a",
                        fontSize: 11, textAlign: "center",
                      }}>
                        Open
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
