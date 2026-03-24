"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────
type Team = { id: string; name: string; abbreviation: string; color2: string | null };
type Player = { mc_uuid: string; mc_username: string };
type Bid = { id: string; team_id: string; amount: number; is_two_season: boolean; effective_value: number; placed_at: string; is_valid: boolean; teams: Team };
type Auction = {
  id: string; league: string; mc_uuid: string; season: string | null; phase: number;
  min_price: number; status: string; nominated_at: string; closes_at: string;
  winning_team_id: string | null; winning_bid: number | null; winning_is_two_season: boolean;
  players: Player; winning_team: Team | null; auction_bids: Bid[];
};

// ── Constants ──────────────────────────────────────────────────────────────────
const PLAYER_CHOICE_WINDOW = 500;

function fmt(n: number) {
  return n.toLocaleString();
}

function Countdown({ closesAt }: { closesAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const tick = () => {
      const diff = new Date(closesAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Closing…"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h}h ${m.toString().padStart(2,"0")}m ${s.toString().padStart(2,"0")}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [closesAt]);

  const diff = new Date(closesAt).getTime() - Date.now();
  const urgent = diff < 60 * 60 * 1000; // < 1 hour

  return (
    <span style={{ color: urgent ? "#f97316" : "#22d3ee", fontVariantNumeric: "tabular-nums" }}>
      {remaining}
    </span>
  );
}

function AuctionCard({ auction }: { auction: Auction }) {
  const validBids = (auction.auction_bids ?? []).filter((b) => b.is_valid);
  const sortedBids = [...validBids].sort((a, b) => b.effective_value - a.effective_value);
  const topBid = sortedBids[0] ?? null;
  const isActive = auction.status === "active";
  const isPlayerChoice = auction.status === "player_choice";
  const isClosed = ["closed", "signed"].includes(auction.status);

  // Player choice window: bids within 500 of top
  const choiceBids = topBid
    ? sortedBids.filter((b) => topBid.effective_value - b.effective_value <= PLAYER_CHOICE_WINDOW)
    : [];

  const statusColor = isActive ? "#22d3ee" : isPlayerChoice ? "#a855f7" : isClosed ? "#22c55e" : "#6b7280";
  const statusLabel = isActive ? "Live" : isPlayerChoice ? "Player Choice" : isClosed ? (auction.status === "signed" ? "Signed" : "Closed") : auction.status;

  return (
    <div style={{
      background: "#111", border: "1px solid #222", borderRadius: 16,
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src={`https://minotar.net/avatar/${auction.players.mc_username}/48`}
          alt={auction.players.mc_username}
          style={{ width: 48, height: 48, borderRadius: 8, border: "2px solid #222", flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/48"; }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>{auction.players.mc_username}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            {auction.season && <span style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888", fontSize: 11, padding: "1px 8px", borderRadius: 6 }}>Season {auction.season}</span>}
            <span style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#888", fontSize: 11, padding: "1px 8px", borderRadius: 6 }}>Phase {auction.phase}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#1a1a1a", border: `1px solid ${statusColor}44`, borderRadius: 99, padding: "3px 10px" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, boxShadow: isActive ? `0 0 6px ${statusColor}` : undefined }} />
            <span style={{ color: statusColor, fontSize: 12, fontWeight: 600 }}>{statusLabel}</span>
          </div>
          {isActive && (
            <div style={{ color: "#666", fontSize: 11, marginTop: 4 }}>
              Closes in <Countdown closesAt={auction.closes_at} />
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px 20px", flex: 1 }}>
        {/* Current bid summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ color: "#555", fontSize: 11, marginBottom: 4 }}>Min Price</div>
            <div style={{ color: "#aaa", fontWeight: 700, fontSize: 18 }}>{fmt(auction.min_price)}</div>
          </div>
          <div style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ color: "#555", fontSize: 11, marginBottom: 4 }}>
              {topBid ? "Top Bid (eff.)" : "No Bids Yet"}
            </div>
            <div style={{ color: topBid ? "#22d3ee" : "#444", fontWeight: 700, fontSize: 18 }}>
              {topBid ? fmt(topBid.effective_value) : "—"}
            </div>
            {topBid && (
              <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>
                {fmt(topBid.amount)}{topBid.is_two_season ? " + 500 (2-season)" : ""} · {topBid.teams?.abbreviation}
              </div>
            )}
          </div>
        </div>

        {/* Winning team (if closed) */}
        {isClosed && auction.winning_team && (
          <div style={{ background: "#0d2a0d", border: "1px solid #166534", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <div style={{ color: "#86efac", fontSize: 12, marginBottom: 2 }}>Winner</div>
            <div style={{ color: "#fff", fontWeight: 700 }}>
              {auction.winning_team.name} — {fmt(auction.winning_bid ?? 0)}
              {auction.winning_is_two_season && " (2-season)"}
            </div>
          </div>
        )}

        {/* Player choice notice */}
        {isPlayerChoice && choiceBids.length > 1 && (
          <div style={{ background: "#1a0a2e", border: "1px solid #7c3aed", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <div style={{ color: "#c4b5fd", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Player Choice — {choiceBids.length} teams within window</div>
            <div style={{ color: "#a78bfa", fontSize: 11 }}>All bids within 500 of top effective value. Player selects their team.</div>
          </div>
        )}

        {/* Bid history */}
        {sortedBids.length > 0 && (
          <div>
            <div style={{ color: "#444", fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Bid History ({validBids.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {sortedBids.slice(0, 8).map((bid, i) => {
                const inWindow = topBid && topBid.effective_value - bid.effective_value <= PLAYER_CHOICE_WINDOW;
                return (
                  <div key={bid.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: i === 0 ? "#0a1a1f" : "#0d0d0d",
                    border: `1px solid ${i === 0 ? "#164e63" : inWindow ? "#4c1d95" : "#1a1a1a"}`,
                    borderRadius: 8, padding: "6px 10px",
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 4,
                      background: bid.teams?.color2 ? `${bid.teams.color2}33` : "#1a1a1a",
                      border: `1px solid ${bid.teams?.color2 ?? "#333"}55`,
                      flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      color: bid.teams?.color2 ?? "#666", fontSize: 9, fontWeight: 800,
                    }}>
                      {bid.teams?.abbreviation?.slice(0, 2) ?? "—"}
                    </div>
                    <span style={{ color: "#ccc", fontSize: 13, fontWeight: i === 0 ? 700 : 400, flex: 1 }}>
                      {bid.teams?.name ?? "Unknown Team"}
                    </span>
                    <span style={{ color: i === 0 ? "#22d3ee" : "#888", fontSize: 13, fontWeight: 700 }}>
                      {fmt(bid.effective_value)}
                    </span>
                    {bid.is_two_season && (
                      <span style={{ color: "#a855f7", fontSize: 10, background: "#1a0a2e", border: "1px solid #4c1d95", borderRadius: 4, padding: "1px 5px" }}>2yr</span>
                    )}
                    {inWindow && i > 0 && (
                      <span style={{ color: "#f59e0b", fontSize: 10, background: "#1c1000", border: "1px solid #78350f", borderRadius: 4, padding: "1px 5px" }}>within 500</span>
                    )}
                  </div>
                );
              })}
              {sortedBids.length > 8 && (
                <div style={{ color: "#444", fontSize: 11, textAlign: "center", padding: "4px 0" }}>
                  +{sortedBids.length - 8} more bids
                </div>
              )}
            </div>
          </div>
        )}

        {validBids.length === 0 && (
          <div style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "12px 0" }}>
            No bids yet. Opening bid: {fmt(auction.min_price)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuctionPage() {
  const params = useParams();
  const leagueSlug = (params?.league as string) ?? "mba";
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all">("active");

  const load = useCallback(async () => {
    const url = `/api/auction?league=${leagueSlug}${filter === "active" ? "&status=active" : ""}`;
    const r = await fetch(url);
    const d = await r.json();
    setAuctions(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [leagueSlug, filter]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds for live auctions
  useEffect(() => {
    if (filter !== "active") return;
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load, filter]);

  const activeCount = auctions.filter((a) => a.status === "active").length;
  const playerChoiceCount = auctions.filter((a) => a.status === "player_choice").length;

  if (leagueSlug !== "mba") {
    return (
      <div style={{ maxWidth: 600, margin: "60px auto", textAlign: "center", padding: "0 16px" }}>
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 16, padding: 40 }}>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>MBA Auction Only</div>
          <div style={{ color: "#555", fontSize: 14 }}>The auction system is only available for the Minecraft Basketball Association (MBA).</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 800, margin: 0 }}>
          {leagueSlug.toUpperCase()} Auction House
        </h1>
        <p style={{ color: "#555", fontSize: 14, margin: "6px 0 0" }}>
          Live player bidding. 6-hour window · bids in multiples of 250 · 2-season bonus +500 (min bid 5,000)
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Live Auctions", value: activeCount, color: "#22d3ee" },
          { label: "Player Choice", value: playerChoiceCount, color: "#a855f7" },
          { label: "Total Cap / Team", value: "25,000", color: "#888" },
          { label: "Court Cap / Team", value: "22,000", color: "#888" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "10px 16px", minWidth: 110 }}>
            <div style={{ color: "#555", fontSize: 11 }}>{s.label}</div>
            <div style={{ color: s.color, fontWeight: 700, fontSize: 20 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["active", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 16px", borderRadius: 8, border: "1px solid",
              borderColor: filter === f ? "#22d3ee" : "#333",
              background: filter === f ? "#0a1a1f" : "#0d0d0d",
              color: filter === f ? "#22d3ee" : "#666",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {f === "active" ? "Live Only" : "All Auctions"}
          </button>
        ))}
        <button
          onClick={load}
          style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "1px solid #333", background: "#0d0d0d", color: "#555", fontSize: 12, cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {/* Auction grid */}
      {loading ? (
        <div style={{ color: "#444", textAlign: "center", padding: 60 }}>Loading auctions…</div>
      ) : auctions.length === 0 ? (
        <div style={{ color: "#444", textAlign: "center", padding: 60, background: "#111", border: "1px solid #222", borderRadius: 16 }}>
          {filter === "active" ? "No live auctions right now." : "No auctions found."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 16 }}>
          {auctions.map((a) => <AuctionCard key={a.id} auction={a} />)}
        </div>
      )}

      {/* Rules reference */}
      <div style={{ marginTop: 40, background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 16, padding: "20px 24px" }}>
        <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: "0 0 14px" }}>Quick Rules Reference</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {[
            { title: "Salary Caps (per team)", items: ["Total cap: 25,000 per team", "Court cap: 22,000 per team", "Max per player: 12,000", "Min bid: 1,000", "Pending bids hold cap until player signs"] },
            { title: "Bid Rules", items: ["Increments of 250 only", "Must beat current effective value", "After 12 hours of no new bids, the player can accept a team's offer", "Max 2 signings per phase"] },
            { title: "2-Season Contracts", items: ["Available on bids ≥ 5,000", "Adds +500 effective value", "Must declare at time of bid", "Cap hit = actual bid only"] },
            { title: "Player Choice", items: ["If any bid within 500 of top", "Player picks their team", "Based on effective values", "All qualifying bids eligible"] },
            { title: "Roster Viability", items: ["Owner's contract + highest bid ≤ 20,000", "Must fit 2 more min-salary players", "Invalid bids are void", "Clock doesn't reset on void bids"] },
            { title: "Trades & Retention", items: ["Retention = the trading team reduces a player's contract amount", "Max 10% off any single contract", "Max 2 contracts retained per team total", "Retained amount stays on the sending team's cap"] },
          ].map((section) => (
            <div key={section.title}>
              <div style={{ color: "#aaa", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{section.title}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {section.items.map((item) => (
                  <li key={item} style={{ color: "#555", fontSize: 12, display: "flex", gap: 6, marginBottom: 3 }}>
                    <span style={{ color: "#22d3ee" }}>·</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
