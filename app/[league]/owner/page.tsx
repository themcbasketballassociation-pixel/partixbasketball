"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────────
type Team = { id: string; name: string; abbreviation: string; color2: string | null; division: string | null; logo_url: string | null; season?: string | null };
type Player = { mc_uuid: string; mc_username: string };
type Contract = { id: string; league: string; mc_uuid: string; team_id: string; amount: number; is_two_season: boolean; season: string | null; phase: number; status: string; players: Player; teams: Team };
type CapRetention = { id: string; mc_uuid: string; retention_amount: number; original_contract_id: string; status: string };
type Bid = { id: string; team_id: string; amount: number; is_two_season: boolean; effective_value: number; placed_at: string; is_valid: boolean; teams: Team };
type Auction = { id: string; mc_uuid: string; min_price: number; status: string; closes_at: string; phase: number; season: string | null; players: Player; winning_team_id: string | null; auction_bids: Bid[] };
type TradeAsset = { id: string; from_team_id: string; contract_id: string; retention_amount: number; contracts: { id: string; mc_uuid: string; amount: number; is_two_season: boolean; players: Player } | null; from_team: { id: string; name: string; abbreviation: string } | null };
type Trade = { id: string; league: string; proposing_team_id: string; receiving_team_id: string; status: string; proposed_at: string; resolved_at: string | null; notes: string | null; admin_note: string | null; proposing_team: Team; receiving_team: Team; trade_assets: TradeAsset[] };

// ── Style helpers ──────────────────────────────────────────────────────────────
const card = { background: "#111", border: "1px solid #222", borderRadius: 16, overflow: "hidden" as const };
const innerCard = { background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 14px" };
const input: React.CSSProperties = { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14, width: "100%", boxSizing: "border-box" };
const btn = (variant: "primary" | "secondary" | "danger" | "success" = "secondary"): React.CSSProperties => ({
  padding: "8px 16px", borderRadius: 8, border: "1px solid",
  borderColor: variant === "primary" ? "#3b82f6" : variant === "danger" ? "#7f1d1d" : variant === "success" ? "#166534" : "#333",
  background: variant === "primary" ? "#1d4ed8" : variant === "danger" ? "#450a0a" : variant === "success" ? "#052e16" : "#181818",
  color: variant === "primary" ? "#fff" : variant === "danger" ? "#fca5a5" : variant === "success" ? "#86efac" : "#aaa",
  fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const,
});

function fmt(n: number) { return n.toLocaleString(); }

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
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{remaining}</span>;
}

// ── CapBar ─────────────────────────────────────────────────────────────────────
function CapBar({ contracts, retentions }: { contracts: Contract[]; retentions: CapRetention[] }) {
  const TOTAL_CAP = 25000; // per team
  const COURT_CAP = 22000; // per team, active roster

  const used = contracts.reduce((s, c) => s + c.amount, 0);
  const retentionTotal = retentions.filter((r) => r.status === "active").reduce((s, r) => s + r.retention_amount, 0);
  const totalHit = used + retentionTotal;
  const pct = Math.min((totalHit / TOTAL_CAP) * 100, 100);
  const courtPct = Math.min((used / COURT_CAP) * 100, 100);

  const color = totalHit > TOTAL_CAP * 0.9 ? "#ef4444" : totalHit > TOTAL_CAP * 0.75 ? "#f97316" : "#22d3ee";

  return (
    <div style={{ ...innerCard, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: "#888", fontSize: 13 }}>Your Team Cap Used</span>
        <span style={{ color, fontWeight: 700 }}>{fmt(totalHit)} / {fmt(TOTAL_CAP)}</span>
      </div>
      <div style={{ background: "#1a1a1a", borderRadius: 4, height: 8, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ background: color, width: `${pct}%`, height: "100%", transition: "width 0.3s", borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: "#555", fontSize: 12 }}>Court cap: {fmt(used + retentionTotal)} / {fmt(COURT_CAP)}</span>
        <span style={{ color: "#555", fontSize: 12 }}>Remaining: {fmt(TOTAL_CAP - totalHit)}</span>
      </div>
      {retentionTotal > 0 && (
        <div style={{ color: "#a78bfa", fontSize: 12, marginTop: 4 }}>
          Includes {fmt(retentionTotal)} in retained salary
        </div>
      )}
    </div>
  );
}

// ── RosterTab ──────────────────────────────────────────────────────────────────
function RosterTab({ contracts, retentions, leagueSlug }: { contracts: Contract[]; retentions: CapRetention[]; leagueSlug: string }) {
  const showCap = leagueSlug !== "mcaa" && leagueSlug !== "mbgl";
  const players = contracts.filter((c) => c.phase !== 0);
  const coaches = contracts.filter((c) => c.phase === 0);
  return (
    <div>
      {showCap && <CapBar contracts={contracts} retentions={retentions} />}
      {contracts.length === 0 ? (
        <div style={{ color: "#444", textAlign: "center", padding: "32px 0" }}>No active contracts.</div>
      ) : (
        <>
          {players.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {players.map((c) => (
                <div key={c.id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                  <img
                    src={`https://minotar.net/avatar/${c.players.mc_username}/36`}
                    style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #222", flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }}
                    alt=""
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 600 }}>{c.players.mc_username}</div>
                    {c.season && <div style={{ color: "#555", fontSize: 12 }}>S{c.season}</div>}
                  </div>
                  {showCap && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#22d3ee", fontWeight: 700, fontSize: 18 }}>{fmt(c.amount)}</div>
                      {c.is_two_season && <div style={{ color: "#a855f7", fontSize: 11 }}>2-season</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {coaches.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Coaches</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {coaches.map((c) => (
                  <div key={c.id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                    <img
                      src={`https://minotar.net/avatar/${c.players.mc_username}/36`}
                      style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #222", flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }}
                      alt=""
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 600 }}>{c.players.mc_username}</div>
                    </div>
                    <span style={{ color: "#a78bfa", background: "#1e1b4b", border: "1px solid #4c1d95", borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>Coach</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {showCap && retentions.filter((r) => r.status === "active").length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Cap Retentions</div>
          {retentions.filter((r) => r.status === "active").map((r) => (
            <div key={r.id} style={{ ...innerCard, display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#aaa", fontSize: 13 }}>Retained: {r.mc_uuid.slice(0, 8)}…</span>
              <span style={{ color: "#a855f7", fontWeight: 600 }}>{fmt(r.retention_amount)}/yr</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── BidTab ─────────────────────────────────────────────────────────────────────
function BidTab({ auctions, teamId, contracts, retentions, onRefresh }: {
  auctions: Auction[]; teamId: string; contracts: Contract[]; retentions: CapRetention[]; onRefresh: () => void;
}) {
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({});
  const [twoSeason, setTwoSeason] = useState<Record<string, boolean>>({});
  const [msgs, setMsgs] = useState<Record<string, { type: "ok" | "err"; text: string }>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const activeAuctions = auctions.filter((a) => a.status === "active");
  const filteredAuctions = search.trim()
    ? activeAuctions.filter((a) => (a.players?.mc_username ?? "").toLowerCase().includes(search.toLowerCase()))
    : activeAuctions;
  const TOTAL_CAP = 25000;
  const MAX_VIABILITY = 20000;

  const existingTotal = (contracts ?? []).reduce((s, c) => s + c.amount, 0);
  const maxExisting = (contracts ?? []).reduce((m, c) => Math.max(m, c.amount), 0);
  const retentionTotal = (retentions ?? []).filter((r) => r.status === "active").reduce((s, r) => s + r.retention_amount, 0);

  const myBids = (auction: Auction) =>
    (auction.auction_bids ?? []).filter((b) => b.is_valid && b.team_id === teamId);
  const topBid = (auction: Auction) =>
    (auction.auction_bids ?? [])
      .filter((b) => b.is_valid)
      .reduce((best: Bid | null, b) => (!best || b.effective_value > best.effective_value ? b : best), null);

  // Pending cap hold: auctions where player can still accept (within 500 of top = player choice window)
  const pendingCapHold = activeAuctions.reduce((sum, auction) => {
    const top = topBid(auction);
    const myTop = myBids(auction).sort((a, b) => b.effective_value - a.effective_value)[0];
    if (!myTop || !top) return sum;
    return myTop.effective_value >= top.effective_value - 500 ? sum + myTop.amount : sum;
  }, 0);

  const placeBid = async (auctionId: string) => {
    const rawAmt = parseInt(bidAmounts[auctionId] ?? "");
    if (!rawAmt) return setMsgs((m) => ({ ...m, [auctionId]: { type: "err", text: "Enter an amount" } }));
    setLoading((l) => ({ ...l, [auctionId]: true }));
    setMsgs((m) => ({ ...m, [auctionId]: { type: "ok", text: "" } }));
    const r = await fetch("/api/auction/bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auction_id: auctionId, team_id: teamId, amount: rawAmt, is_two_season: twoSeason[auctionId] ?? false }),
    });
    const d = await r.json();
    setLoading((l) => ({ ...l, [auctionId]: false }));
    if (!r.ok) {
      setMsgs((m) => ({ ...m, [auctionId]: { type: "err", text: d.error } }));
    } else {
      setBidAmounts((b) => ({ ...b, [auctionId]: "" }));
      setMsgs((m) => ({ ...m, [auctionId]: { type: "ok", text: d.warning ?? "Bid placed!" } }));
      onRefresh();
    }
  };

  if (activeAuctions.length === 0)
    return <div style={{ color: "#444", textAlign: "center", padding: "40px 0" }}>No live auctions right now.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <input
        type="text"
        placeholder={`Search ${activeAuctions.length} player${activeAuctions.length !== 1 ? "s" : ""}…`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ ...input }}
      />
      <div style={{ ...innerCard, display: "flex", gap: 20, flexWrap: "wrap" as const }}>
        <div><span style={{ color: "#555", fontSize: 12 }}>Cap remaining: </span><span style={{ color: "#22d3ee", fontWeight: 700 }}>{fmt(TOTAL_CAP - existingTotal - retentionTotal - pendingCapHold)}</span></div>
        {pendingCapHold > 0 && <div><span style={{ color: "#555", fontSize: 12 }}>Bid holds: </span><span style={{ color: "#f59e0b", fontWeight: 600 }}>{fmt(pendingCapHold)}</span></div>}
        {retentionTotal > 0 && <div><span style={{ color: "#555", fontSize: 12 }}>Retained: </span><span style={{ color: "#a78bfa", fontWeight: 600 }}>{fmt(retentionTotal)}</span></div>}
        <div><span style={{ color: "#555", fontSize: 12 }}>Highest contract: </span><span style={{ color: "#fff", fontWeight: 600 }}>{fmt(maxExisting)}</span></div>
        <div><span style={{ color: "#555", fontSize: 12 }}>Viability max new: </span><span style={{ color: "#f97316", fontWeight: 600 }}>{fmt(MAX_VIABILITY - maxExisting)}</span></div>
      </div>

      {filteredAuctions.length === 0 && search && (
        <div style={{ color: "#555", textAlign: "center", padding: "20px 0", fontSize: 13 }}>No players matching "{search}"</div>
      )}
      {filteredAuctions.map((auction) => {
        const top = topBid(auction);
        const myLatest = myBids(auction).sort((a, b) => b.effective_value - a.effective_value)[0];
        const amt = parseInt(bidAmounts[auction.id] ?? "") || 0;
        const is2s = twoSeason[auction.id] ?? false;
        const effPreview = amt + (is2s ? 500 : 0);
        const msg = msgs[auction.id];
        const iAmTop = top && top.team_id === teamId;

        return (
          <div key={auction.id} style={{ background: "#0d0d0d", border: `1px solid ${iAmTop ? "#164e63" : "#1a1a1a"}`, borderRadius: 12, padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <img
                src={`https://minotar.net/avatar/${auction.players?.mc_username ?? "MHF_Steve"}/40`}
                style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid #222" }}
                onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/40"; }}
                alt=""
              />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{auction.players?.mc_username ?? auction.mc_uuid.slice(0, 8)}</div>
                <div style={{ color: "#555", fontSize: 12 }}>{auction.season ? `S${auction.season} · ` : ""}Closes in <span style={{ color: "#f97316" }}><Countdown closesAt={auction.closes_at} /></span></div>
              </div>
              {iAmTop && <span style={{ color: "#22d3ee", fontSize: 12, background: "#0a1a1f", border: "1px solid #164e63", borderRadius: 6, padding: "2px 8px" }}>You're leading</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: "#444", fontSize: 11 }}>Min Price</div>
                <div style={{ color: "#aaa", fontWeight: 600 }}>{fmt(auction.min_price)}</div>
              </div>
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ color: "#444", fontSize: 11 }}>Current Top (eff.)</div>
                <div style={{ color: top ? "#22d3ee" : "#444", fontWeight: 600 }}>
                  {top ? fmt(top.effective_value) : `${fmt(auction.min_price)} (no bids)`}
                </div>
                {top && <div style={{ color: "#444", fontSize: 11 }}>{top.teams?.abbreviation}</div>}
              </div>
            </div>

            {myLatest && (
              <div style={{ background: "#0a1a1f", border: "1px solid #164e63", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12 }}>
                <span style={{ color: "#555" }}>Your bid: </span>
                <span style={{ color: "#22d3ee", fontWeight: 600 }}>{fmt(myLatest.effective_value)} eff.</span>
                <span style={{ color: "#555" }}> ({fmt(myLatest.amount)}{myLatest.is_two_season ? " 2yr" : ""})</span>
              </div>
            )}

            {/* Bid form */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" as const }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <input
                  type="number"
                  placeholder={`e.g. ${top ? top.effective_value + 250 : auction.min_price}`}
                  value={bidAmounts[auction.id] ?? ""}
                  onChange={(e) => setBidAmounts((b) => ({ ...b, [auction.id]: e.target.value }))}
                  step={250}
                  min={auction.min_price}
                  max={12000}
                  style={{ ...input }}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#a855f7", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                <input
                  type="checkbox"
                  checked={twoSeason[auction.id] ?? false}
                  onChange={(e) => setTwoSeason((t) => ({ ...t, [auction.id]: e.target.checked }))}
                  style={{ accentColor: "#a855f7" }}
                />
                2-season (+500 eff.)
              </label>
              <button
                onClick={() => placeBid(auction.id)}
                disabled={loading[auction.id]}
                style={{ ...btn("primary"), opacity: loading[auction.id] ? 0.5 : 1 }}
              >
                {loading[auction.id] ? "Bidding…" : "Place Bid"}
              </button>
            </div>
            {amt > 0 && (
              <div style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
                Preview: {fmt(amt)} bid → {fmt(effPreview)} effective value{is2s && amt >= 5000 ? " (2-season)" : is2s ? " ⚠ 2-season requires min 5,000" : ""}
              </div>
            )}
            {msg?.text && (
              <div style={{ marginTop: 8, color: msg.type === "err" ? "#fca5a5" : "#86efac", fontSize: 13, background: msg.type === "err" ? "#450a0a" : "#052e16", border: `1px solid ${msg.type === "err" ? "#7f1d1d" : "#166534"}`, borderRadius: 8, padding: "8px 12px" }}>
                {msg.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── TradeProposer ──────────────────────────────────────────────────────────────
function TradeTab({ teamId, league, leagueSlug, contracts, allTeams, seasonTeamIds, onRefresh }: {
  teamId: string; league: string; leagueSlug: string; contracts: Contract[]; allTeams: Team[]; seasonTeamIds: string[]; onRefresh: () => void;
}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loadingTrades, setLoadingTrades] = useState(true);

  // Propose form state
  const [targetTeamId, setTargetTeamId] = useState("");
  const [myAssets, setMyAssets] = useState<{ contract_id: string; retention: string }[]>([{ contract_id: "", retention: "" }]);
  const [theirContracts, setTheirContracts] = useState<Contract[]>([]);
  const [theirAssets, setTheirAssets] = useState<{ contract_id: string; retention: string }[]>([{ contract_id: "", retention: "" }]);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTrades = useCallback(async () => {
    const r = await fetch(`/api/trades?league=${leagueSlug}&team_id=${teamId}`);
    const d = await r.json();
    setTrades(Array.isArray(d) ? d : []);
    setLoadingTrades(false);
  }, [leagueSlug, teamId]);

  useEffect(() => { loadTrades(); }, [loadTrades]);

  useEffect(() => {
    if (!targetTeamId) { setTheirContracts([]); return; }
    fetch(`/api/contracts?league=${leagueSlug}&team_id=${targetTeamId}`)
      .then((r) => r.json())
      .then((d) => setTheirContracts(Array.isArray(d) ? d : []));
  }, [targetTeamId, leagueSlug]);

  // Only show teams from the same season (via team_owners season filter)
  const otherTeams = allTeams.filter((t) => t.id !== teamId && (seasonTeamIds.length === 0 || seasonTeamIds.includes(t.id)));

  const submitTrade = async () => {
    if (!targetTeamId) return setErr("Select a team to trade with");
    setErr(""); setSubmitting(true);

    const assets = [
      ...myAssets.filter((a) => a.contract_id || (parseInt(a.retention) > 0)).map((a) => ({
        from_team_id: teamId, contract_id: a.contract_id || null,
        retention_amount: Math.min(parseInt(a.retention) || 0, 1000),
      })),
      ...theirAssets.filter((a) => a.contract_id || (parseInt(a.retention) > 0)).map((a) => ({
        from_team_id: targetTeamId, contract_id: a.contract_id || null,
        retention_amount: Math.min(parseInt(a.retention) || 0, 1000),
      })),
    ];
    if (assets.length === 0) { setSubmitting(false); return setErr("Add at least one asset"); }

    const r = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league: leagueSlug, proposing_team_id: teamId, receiving_team_id: targetTeamId, assets, notes }),
    });
    const d = await r.json();
    setSubmitting(false);
    if (!r.ok) return setErr(d.error);
    setMyAssets([{ contract_id: "", retention: "" }]);
    setTheirAssets([{ contract_id: "", retention: "" }]);
    setNotes(""); setTargetTeamId("");
    loadTrades(); onRefresh();
  };

  const respondTrade = async (tradeId: string, action: string) => {
    const r = await fetch(`/api/trades/${tradeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (r.ok) loadTrades();
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { color: string; bg: string; border: string }> = {
      pending: { color: "#fbbf24", bg: "#1c1200", border: "#78350f" },
      admin_review: { color: "#a855f7", bg: "#1a0a2e", border: "#4c1d95" },
      approved: { color: "#22c55e", bg: "#052e16", border: "#166534" },
      rejected: { color: "#ef4444", bg: "#450a0a", border: "#7f1d1d" },
      denied: { color: "#ef4444", bg: "#450a0a", border: "#7f1d1d" },
      cancelled: { color: "#555", bg: "#111", border: "#222" },
    };
    const s = map[status] ?? { color: "#888", bg: "#111", border: "#222" };
    return (
      <span style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 6, fontSize: 11, padding: "2px 8px", fontWeight: 600 }}>
        {status.replace("_", " ")}
      </span>
    );
  };

  const AssetRow = ({ assets, setAssets, contracts: ctrts, label }: { assets: typeof myAssets; setAssets: React.Dispatch<React.SetStateAction<typeof myAssets>>; contracts: Contract[]; label: string }) => (
    <div>
      <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      {assets.map((a, i) => {
        const selectedContract = ctrts.find(c => c.id === a.contract_id);
        return (
          <div key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <select
                style={{ ...input, flex: 2 }}
                value={a.contract_id}
                onChange={(e) => setAssets((prev) => prev.map((x, j) => j === i ? { ...x, contract_id: e.target.value, retention: "" } : x))}
              >
                <option value="">— Select player —</option>
                {ctrts.map((c) => <option key={c.id} value={c.id}>{c.players.mc_username} ({fmt(c.amount)})</option>)}
              </select>
              <input
                type="number"
                placeholder="Retain $"
                value={a.retention}
                onChange={(e) => setAssets((prev) => prev.map((x, j) => j === i ? { ...x, retention: e.target.value } : x))}
                style={{ ...input, flex: 1, minWidth: 80 }}
                step={250}
                min={0}
                max={1000}
              />
              <button onClick={() => setAssets((prev) => prev.filter((_, j) => j !== i))} style={{ ...btn("danger"), padding: "6px 10px" }}>✕</button>
            </div>
            {selectedContract && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "#555", paddingLeft: 2 }}>
                <span>Max retention: <span style={{ color: "#a855f7" }}>1,000</span></span>
                <button
                  onClick={() => setAssets((prev) => prev.map((x, j) => j === i ? { ...x, retention: "1000" } : x))}
                  style={{ ...btn(), fontSize: 11, padding: "2px 6px", color: "#a855f7", borderColor: "#4c1d95" }}
                >
                  Set max
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button onClick={() => setAssets((prev) => [...prev, { contract_id: "", retention: "" }])} style={{ ...btn(), fontSize: 12, padding: "4px 10px" }}>+ Add player</button>
    </div>
  );

  return (
    <div>
      {/* Propose trade form */}
      <div style={{ ...innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 16 }}>Propose a Trade</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 4 }}>Trade with</label>
          <select style={input} value={targetTeamId} onChange={(e) => setTargetTeamId(e.target.value)}>
            <option value="">— Select team —</option>
            {otherTeams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 12 }}>
          <AssetRow assets={myAssets} setAssets={setMyAssets} contracts={contracts} label="You send" />
          <AssetRow assets={theirAssets} setAssets={setTheirAssets} contracts={theirContracts} label="You receive" />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 4 }}>Notes (optional)</label>
          <input style={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes for the other team / admin…" />
        </div>
        <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#555" }}>
          Retention: max 1,000 per team total · contracts + retention must exceed 22k and stay ≤ 23k · leave player blank to offer retention cash
        </div>
        {err && <div style={{ color: "#fca5a5", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>{err}</div>}
        <button onClick={submitTrade} disabled={submitting} style={{ ...btn("primary"), opacity: submitting ? 0.5 : 1 }}>
          {submitting ? "Submitting…" : "Propose Trade"}
        </button>
      </div>

      {/* Trade history */}
      <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Your Trades</div>
      {loadingTrades ? (
        <div style={{ color: "#444", padding: "20px 0", textAlign: "center" }}>Loading…</div>
      ) : trades.length === 0 ? (
        <div style={{ color: "#444", padding: "20px 0", textAlign: "center" }}>No trades yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {trades.map((t) => {
            const iProposed = t.proposing_team_id === teamId;
            const canAccept = !iProposed && t.status === "pending";
            const canCancel = iProposed && t.status === "pending";
            return (
              <div key={t.id} style={{ ...innerCard }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ color: "#aaa", fontSize: 13, fontWeight: 600 }}>
                    {iProposed ? `You → ${t.receiving_team.name}` : `${t.proposing_team.name} → You`}
                  </div>
                  {statusBadge(t.status)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: iProposed ? "You send" : "They send", assets: (t.trade_assets ?? []).filter((a) => a.from_team_id === t.proposing_team_id) },
                    { label: iProposed ? "You receive" : "They receive", assets: (t.trade_assets ?? []).filter((a) => a.from_team_id === t.receiving_team_id) },
                  ].map((side) => (
                    <div key={side.label}>
                      <div style={{ color: "#444", fontSize: 11, marginBottom: 4 }}>{side.label}</div>
                      {side.assets.length === 0 ? <div style={{ color: "#333", fontSize: 12 }}>—</div> : side.assets.map((a) => (
                        <div key={a.id} style={{ color: "#888", fontSize: 12, marginBottom: 2 }}>
                          {a.contracts?.players.mc_username ?? "Unknown"} ({fmt(a.contracts?.amount ?? 0)})
                          {(a.retention_amount ?? 0) > 0 && <span style={{ color: "#a855f7", marginLeft: 4 }}>ret. {fmt(a.retention_amount)}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {t.notes && <div style={{ color: "#555", fontSize: 12, fontStyle: "italic", marginBottom: 8 }}>"{t.notes}"</div>}
                {t.admin_note && <div style={{ color: "#a78bfa", fontSize: 12, marginBottom: 8 }}>Admin: {t.admin_note}</div>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  {canAccept && <button onClick={() => respondTrade(t.id, "accept")} style={btn("success")}>Accept</button>}
                  {canAccept && <button onClick={() => respondTrade(t.id, "reject")} style={btn("danger")}>Reject</button>}
                  {canCancel && <button onClick={() => respondTrade(t.id, "cancel")} style={btn("danger")}>Cancel</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── SigningsTab ────────────────────────────────────────────────────────────────
type SigningPlayer = { mc_uuid: string; mc_username: string; min_price: number };
type ContractOffer = {
  id: string; league: string; mc_uuid: string; team_id: string; amount: number;
  is_two_season: boolean; season: string | null; status: string; offered_at: string;
  dm_sent_at: string | null;
  players: { mc_uuid: string; mc_username: string; discord_id: string | null };
  teams: { id: string; name: string; abbreviation: string };
};

function OfferCountdown({ offeredAt }: { offeredAt: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const HOURS_12_MS = 12 * 60 * 60 * 1000;
    const tick = () => {
      const elapsed = Date.now() - new Date(offeredAt).getTime();
      const remaining = HOURS_12_MS - elapsed;
      if (remaining <= 0) { setLabel("Player can accept now"); return; }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      setLabel(`Acceptable in ${h}h ${m.toString().padStart(2, "0")}m`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [offeredAt]);
  return <span>{label}</span>;
}

function SigningsTab({ teamId, leagueSlug, contracts, onRefresh }: {
  teamId: string; league: string; leagueSlug: string; contracts: Contract[]; ownerSeason: string | null; onRefresh: () => void;
}) {
  const isMcaa = leagueSlug === "mcaa";
  const hideCap = leagueSlug === "mcaa" || leagueSlug === "mbgl";
  const TOTAL_CAP = 25000;
  const [available, setAvailable] = useState<SigningPlayer[]>([]);
  const [pendingSignings, setPendingSignings] = useState<Contract[]>([]);
  const [sentOffers, setSentOffers] = useState<ContractOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [signingRole, setSigningRole] = useState<"player" | "coach">("player");
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [faRes, pendingRes, offersRes] = await Promise.all([
      fetch(`/api/contracts/sign?league=${leagueSlug}`),
      fetch(`/api/contracts?league=${leagueSlug}&team_id=${teamId}&status=pending_approval`),
      fetch(`/api/contract-offers?league=${leagueSlug}&team_id=${teamId}`),
    ]);
    const fa = await faRes.json();
    const pending = await pendingRes.json();
    const offers = await offersRes.json();
    setAvailable(Array.isArray(fa) ? fa : []);
    setPendingSignings(Array.isArray(pending) ? pending : []);
    setSentOffers(Array.isArray(offers) ? offers : []);
    setLoading(false);
  }, [leagueSlug, teamId]);

  useEffect(() => { loadData(); }, [loadData]);

  const capUsed = contracts.reduce((s, c) => s + c.amount, 0);
  const capRemaining = TOTAL_CAP - capUsed;
  const selectedInfo = available.find((p) => p.mc_uuid === selectedPlayer);

  // For players already sent an offer, filter them from available list
  const offeredUuids = new Set(sentOffers.map((o) => o.mc_uuid));
  const availableFiltered = available.filter((p) => !offeredUuids.has(p.mc_uuid));

  const makeOffer = async () => {
    if (!selectedPlayer) return setErr("Select a player");
    setErr(""); setSuccessMsg(""); setSubmitting(true);
    const isCoach = isMcaa && signingRole === "coach";

    if (isCoach) {
      // Coaches still go through old direct sign flow
      const r = await fetch("/api/contracts/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league: leagueSlug, mc_username: selectedInfo?.mc_username }),
      });
      const d = await r.json();
      setSubmitting(false);
      if (!r.ok) return setErr(d.error);
      setSuccessMsg(`Coach request submitted for ${selectedInfo?.mc_username ?? "player"} — waiting for admin approval.`);
      setSelectedPlayer("");
      loadData(); onRefresh();
      return;
    }

    // Players → create a contract offer (player must accept)
    const r = await fetch("/api/contract-offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league: leagueSlug, mc_uuid: selectedPlayer, amount: selectedInfo?.min_price ?? 0 }),
    });
    const d = await r.json();
    setSubmitting(false);
    if (!r.ok) return setErr(d.error);
    setSuccessMsg(`Offer sent to ${selectedInfo?.mc_username ?? "player"}${!hideCap ? ` for $${fmt(selectedInfo?.min_price ?? 0)}` : ""}. They'll be notified after 12 hours and can accept via Discord or their profile.`);
    setSelectedPlayer("");
    loadData(); onRefresh();
  };

  const withdrawOffer = async (offerId: string) => {
    setWithdrawing(offerId);
    const r = await fetch(`/api/contract-offers/${offerId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    setWithdrawing(null);
    if (r.ok) { loadData(); onRefresh(); }
  };

  return (
    <div>
      {!hideCap && (
        <div style={{ ...innerCard, marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap" as const }}>
          <div><span style={{ color: "#555", fontSize: 12 }}>Cap remaining: </span><span style={{ color: "#22d3ee", fontWeight: 700 }}>{fmt(capRemaining)}</span></div>
        </div>
      )}
      <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#555" }}>
        {isMcaa
          ? "Send offers to available players · Player must accept · Coach signings go directly to admin approval"
          : "Post-auction signings only · Send an offer at the auction minimum price · Player accepts after a 12-hour window"}
      </div>

      {/* Make Offer / Coach Sign form */}
      <div style={{ ...innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 14 }}>
          {isMcaa ? "Send an Offer / Coach Request" : "Send a Contract Offer"}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 4 }}>
            {isMcaa ? "Available player" : "Player (closed auction — no winner)"}
          </label>
          {loading ? (
            <div style={{ color: "#444", fontSize: 13 }}>Loading…</div>
          ) : availableFiltered.length === 0 ? (
            <div style={{ color: "#555", fontSize: 13 }}>
              {isMcaa ? "No players available." : "No players available. Players appear here after their auction closes without a bid."}
            </div>
          ) : (
            <select style={input} value={selectedPlayer} onChange={(e) => setSelectedPlayer(e.target.value)}>
              <option value="">— Select player —</option>
              {availableFiltered.map((p) => (
                <option key={p.mc_uuid} value={p.mc_uuid}>
                  {p.mc_username}{!hideCap ? ` — $${fmt(p.min_price)}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {isMcaa && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 6 }}>Role</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["player", "coach"] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => setSigningRole(role)}
                  style={{
                    padding: "6px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid",
                    borderColor: signingRole === role ? "#3b82f6" : "#222",
                    background: signingRole === role ? "#1e3a5f" : "#0d1117",
                    color: signingRole === role ? "#93c5fd" : "#555",
                  }}
                >
                  {role === "player" ? "🏀 Player" : "🎓 Coach"}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedInfo && !hideCap && signingRole === "player" && (
          <div style={{ ...innerCard, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#555", fontSize: 13 }}>Offer salary (auction minimum)</span>
            <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 18 }}>${fmt(selectedInfo.min_price)}</span>
          </div>
        )}
        {selectedInfo && !hideCap && signingRole === "player" && capUsed + selectedInfo.min_price > TOTAL_CAP && (
          <div style={{ color: "#fca5a5", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>
            ⚠ Exceeds cap: {fmt(capUsed)} + {fmt(selectedInfo.min_price)} = {fmt(capUsed + selectedInfo.min_price)} / {fmt(TOTAL_CAP)}
          </div>
        )}
        {err && <div style={{ color: "#fca5a5", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>{err}</div>}
        {successMsg && <div style={{ color: "#86efac", background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>{successMsg}</div>}

        <button
          onClick={makeOffer}
          disabled={submitting || !selectedPlayer || (!hideCap && signingRole === "player" && selectedInfo ? capUsed + selectedInfo.min_price > TOTAL_CAP : false)}
          style={{ ...btn("primary"), opacity: (submitting || !selectedPlayer) ? 0.5 : 1 }}
        >
          {submitting ? "Submitting…" : isMcaa && signingRole === "coach" ? "Submit Coach Request" : "📨 Send Offer"}
        </button>
      </div>

      {/* Sent Offers (pending) */}
      {sentOffers.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
            Sent Offers ({sentOffers.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sentOffers.map((o) => {
              const HOURS_12_MS = 12 * 60 * 60 * 1000;
              const elapsed = Date.now() - new Date(o.offered_at).getTime();
              const canAccept = elapsed >= HOURS_12_MS;
              return (
                <div key={o.id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 10 }}>
                  <img
                    src={`https://minotar.net/avatar/${o.players.mc_username}/32`}
                    style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #222", flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }}
                    alt=""
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{o.players.mc_username}</div>
                    <div style={{ color: canAccept ? "#4ade80" : "#888", fontSize: 11 }}>
                      <OfferCountdown offeredAt={o.offered_at} />
                      {o.dm_sent_at && <span style={{ color: "#6366f1", marginLeft: 8 }}>✉ DM sent</span>}
                      {!o.players.discord_id && <span style={{ color: "#ef4444", marginLeft: 8 }}>⚠ No Discord linked</span>}
                    </div>
                  </div>
                  {!hideCap && <span style={{ color: "#22d3ee", fontWeight: 700, flexShrink: 0 }}>${fmt(o.amount)}</span>}
                  <button
                    onClick={() => withdrawOffer(o.id)}
                    disabled={withdrawing === o.id}
                    style={{ ...btn("danger"), fontSize: 12, padding: "4px 10px", flexShrink: 0, opacity: withdrawing === o.id ? 0.5 : 1 }}
                  >
                    {withdrawing === o.id ? "…" : "Withdraw"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending admin-approval contracts (accepted offers + coach requests) */}
      {pendingSignings.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Pending Admin Approval</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingSignings.map((c) => (
              <div key={c.id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                <img src={`https://minotar.net/avatar/${c.players.mc_username}/32`} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #222" }} onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }} alt="" />
                <span style={{ color: "#fff", fontWeight: 600, flex: 1 }}>{c.players.mc_username}</span>
                {!hideCap && <span style={{ color: "#22d3ee", fontWeight: 700 }}>${fmt(c.amount)}</span>}
                <span style={{ color: "#fbbf24", background: "#1c1200", border: "1px solid #78350f", borderRadius: 6, fontSize: 11, padding: "2px 8px", fontWeight: 600 }}>pending approval</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {contracts.length > 0 && (
        <div>
          <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Active Roster</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {contracts.map((c) => (
              <div key={c.id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                <img src={`https://minotar.net/avatar/${c.players.mc_username}/32`} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #222" }} onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }} alt="" />
                <span style={{ color: "#aaa", flex: 1 }}>{c.players.mc_username}</span>
                {!hideCap && <span style={{ color: "#22d3ee", fontWeight: 700 }}>${fmt(c.amount)}</span>}
                {!hideCap && c.is_two_season && <span style={{ color: "#a855f7", fontSize: 11 }}>2yr</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CoachesTab ─────────────────────────────────────────────────────────────────
const MAX_COACHES = 4;

function CoachesTab({ teamId, leagueSlug, contracts, onRefresh }: {
  teamId: string; leagueSlug: string; contracts: Contract[]; onRefresh: () => void;
}) {
  const [mcUsername, setMcUsername] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeCoaches = contracts.filter((c) => c.phase === 0 && (c.status === "active" || c.status === "pending_approval"));
  const coachCount = activeCoaches.length;

  const submit = async () => {
    if (!mcUsername.trim()) return setMsg({ type: "err", text: "Enter a Minecraft username" });
    setMsg(null); setSubmitting(true);
    const r = await fetch("/api/contracts/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mc_username: mcUsername.trim(), league: leagueSlug }),
    });
    const d = await r.json();
    setSubmitting(false);
    if (!r.ok) return setMsg({ type: "err", text: d.error });
    setMsg({ type: "ok", text: `Coach signing request submitted for ${mcUsername} — awaiting admin approval.` });
    setMcUsername("");
    onRefresh();
  };

  return (
    <div>
      <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#555" }}>
        Sign coaches to your staff — max {MAX_COACHES} total · No salary · Requires admin approval
      </div>

      <div style={{ ...innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 14 }}>
          Sign a Coach <span style={{ color: "#555", fontWeight: 400, fontSize: 13 }}>({coachCount} / {MAX_COACHES})</span>
        </div>
        {coachCount >= MAX_COACHES ? (
          <div style={{ color: "#f97316", fontSize: 13 }}>You've reached the maximum of {MAX_COACHES} coaches.</div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 4 }}>Minecraft Username</label>
              <input
                style={input}
                value={mcUsername}
                onChange={(e) => setMcUsername(e.target.value)}
                placeholder="e.g. Steve"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
            {msg && (
              <div style={{ color: msg.type === "err" ? "#fca5a5" : "#86efac", background: msg.type === "err" ? "#450a0a" : "#052e16", border: `1px solid ${msg.type === "err" ? "#7f1d1d" : "#166534"}`, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>
                {msg.text}
              </div>
            )}
            <button onClick={submit} disabled={submitting || !mcUsername.trim()} style={{ ...btn("primary"), opacity: (submitting || !mcUsername.trim()) ? 0.5 : 1 }}>
              {submitting ? "Submitting…" : "Submit Coach Request"}
            </button>
          </>
        )}
      </div>

      {activeCoaches.length > 0 && (
        <div>
          <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Your Coaches</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activeCoaches.map((c) => (
              <div key={c.id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                <img src={`https://minotar.net/avatar/${c.players.mc_username}/32`} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #222" }} onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }} alt="" />
                <span style={{ color: "#fff", fontWeight: 600, flex: 1 }}>{c.players.mc_username}</span>
                {c.status === "pending_approval"
                  ? <span style={{ color: "#fbbf24", background: "#1c1200", border: "1px solid #78350f", borderRadius: 6, fontSize: 11, padding: "2px 8px", fontWeight: 600 }}>pending</span>
                  : <span style={{ color: "#a78bfa", background: "#1e1b4b", border: "1px solid #4c1d95", borderRadius: 6, fontSize: 11, padding: "2px 8px", fontWeight: 600 }}>Coach</span>
                }
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CutTab ─────────────────────────────────────────────────────────────────────
function CutTab({ teamId, leagueSlug, contracts, onRefresh }: {
  teamId: string; leagueSlug: string; contracts: Contract[]; onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeContracts = contracts.filter((c) => c.status === "active");

  const submit = async () => {
    if (!selectedId) return setMsg({ type: "err", text: "Select a player" });
    setMsg(null); setSubmitting(true);
    const r = await fetch("/api/contracts/cut", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_id: selectedId, league: leagueSlug }),
    });
    const d = await r.json();
    setSubmitting(false);
    if (!r.ok) return setMsg({ type: "err", text: d.error });
    setMsg({ type: "ok", text: d.message });
    setSelectedId("");
    onRefresh();
  };

  return (
    <div>
      <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#555" }}>
        Request to cut a player from your roster. Requires admin approval before taking effect.
      </div>
      <div style={{ ...innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 14 }}>Cut a Player</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 4 }}>Select player to cut</label>
          {activeContracts.length === 0 ? (
            <div style={{ color: "#555", fontSize: 13 }}>No active contracts on your roster.</div>
          ) : (
            <select style={input} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">— Select player —</option>
              {activeContracts.map((c) => <option key={c.id} value={c.id}>{c.players.mc_username}{c.amount > 0 ? ` (${fmt(c.amount)})` : ""}</option>)}
            </select>
          )}
        </div>
        {msg && (
          <div style={{ color: msg.type === "err" ? "#fca5a5" : "#86efac", background: msg.type === "err" ? "#450a0a" : "#052e16", border: `1px solid ${msg.type === "err" ? "#7f1d1d" : "#166534"}`, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>
            {msg.text}
          </div>
        )}
        <button onClick={submit} disabled={submitting || !selectedId} style={{ ...btn("danger"), opacity: (submitting || !selectedId) ? 0.5 : 1 }}>
          {submitting ? "Submitting…" : "Request Cut"}
        </button>
      </div>
    </div>
  );
}

// ── PortalTab ──────────────────────────────────────────────────────────────────
type PortalPlayer = { id: string; mc_uuid: string; season: string | null; players: { mc_uuid: string; mc_username: string }; teams: { name: string; abbreviation: string; logo_url?: string | null } };

function PortalTab({ teamId, leagueSlug, contracts, onRefresh }: {
  teamId: string; leagueSlug: string; contracts: Contract[]; onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [portalPlayers, setPortalPlayers] = useState<PortalPlayer[]>([]);
  const [pendingClaims, setPendingClaims] = useState<PortalPlayer[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<Record<string, { type: "ok" | "err"; text: string }>>({});

  const activeContracts = contracts.filter((c) => c.status === "active");

  const loadPortal = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch(`/api/contracts?league=${leagueSlug}&status=in_portal`),
      fetch(`/api/contracts?league=${leagueSlug}&team_id=${teamId}&status=portal_claim`),
    ]);
    const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
    setPortalPlayers(Array.isArray(d1) ? d1 : []);
    setPendingClaims(Array.isArray(d2) ? d2 : []);
  }, [leagueSlug, teamId]);

  useEffect(() => { loadPortal(); }, [loadPortal]);

  const submit = async () => {
    if (!selectedId) return setMsg({ type: "err", text: "Select a player" });
    setMsg(null); setSubmitting(true);
    const r = await fetch("/api/contracts/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_id: selectedId, league: leagueSlug }),
    });
    const d = await r.json();
    setSubmitting(false);
    if (!r.ok) return setMsg({ type: "err", text: d.error });
    setMsg({ type: "ok", text: d.message });
    setSelectedId("");
    onRefresh(); loadPortal();
  };

  const claimPlayer = async (mc_uuid: string, username: string) => {
    setClaimingId(mc_uuid);
    const r = await fetch("/api/contracts/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league: leagueSlug, mc_uuid }),
    });
    const d = await r.json();
    setClaimingId(null);
    if (!r.ok) {
      setClaimMsg((m) => ({ ...m, [mc_uuid]: { type: "err", text: d.error } }));
    } else {
      setClaimMsg((m) => ({ ...m, [mc_uuid]: { type: "ok", text: `Claim request for ${username} submitted — awaiting admin approval.` } }));
      loadPortal(); onRefresh();
    }
  };

  return (
    <div>
      {/* ── Portal Pool ── */}
      <div style={{ ...innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          🚪 Players in Transfer Portal
          <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>· Claiming requires admin approval</span>
        </div>
        {portalPlayers.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13 }}>No players currently in the portal.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {portalPlayers.map((p) => {
              const cm = claimMsg[p.players.mc_uuid];
              return (
                <div key={p.id}>
                  <div style={{ ...innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                    <img src={`https://minotar.net/avatar/${p.players.mc_username}/36`} style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #222", imageRendering: "pixelated" as const }} onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }} alt="" />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{p.players.mc_username}</div>
                      <div style={{ color: "#555", fontSize: 11 }}>From: {p.teams?.name ?? "Unknown"}{p.season ? ` · ${p.season}` : ""}</div>
                    </div>
                    <span style={{ fontSize: 11, color: "#f59e0b", background: "#1c1200", border: "1px solid #78350f", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>In Portal</span>
                    <button
                      onClick={() => claimPlayer(p.players.mc_uuid, p.players.mc_username)}
                      disabled={claimingId === p.players.mc_uuid}
                      style={{ ...btn("primary"), fontSize: 12, padding: "6px 14px", opacity: claimingId === p.players.mc_uuid ? 0.5 : 1 }}
                    >
                      {claimingId === p.players.mc_uuid ? "Claiming…" : "Claim"}
                    </button>
                  </div>
                  {cm && (
                    <div style={{ color: cm.type === "err" ? "#fca5a5" : "#86efac", background: cm.type === "err" ? "#450a0a" : "#052e16", border: `1px solid ${cm.type === "err" ? "#7f1d1d" : "#166534"}`, borderRadius: 6, padding: "6px 10px", marginTop: 4, fontSize: 12 }}>
                      {cm.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── My Pending Claims ── */}
      {pendingClaims.length > 0 && (
        <div style={{ ...innerCard, marginBottom: 20 }}>
          <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            ⏳ Your Pending Portal Claims
            <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>· Awaiting admin approval</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingClaims.map((p) => (
              <div key={p.id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                <img src={`https://minotar.net/avatar/${p.players.mc_username}/36`} style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #222", imageRendering: "pixelated" as const }} onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }} alt="" />
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{p.players.mc_username}</div>
                  <div style={{ color: "#555", fontSize: 11 }}>From portal{p.season ? ` · ${p.season}` : ""}</div>
                </div>
                <span style={{ fontSize: 11, color: "#f59e0b", background: "#1c1200", border: "1px solid #78350f", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>Claim Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Send to Portal ── */}
      <div style={{ ...innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 14 }}>Send Player to Portal</div>
        <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#555" }}>
          Once approved, the player enters the portal and can be claimed by any team.
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 4 }}>Select player to portal</label>
          {activeContracts.length === 0 ? (
            <div style={{ color: "#555", fontSize: 13 }}>No active contracts on your roster.</div>
          ) : (
            <select style={input} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">— Select player —</option>
              {activeContracts.map((c) => <option key={c.id} value={c.id}>{c.players.mc_username}</option>)}
            </select>
          )}
        </div>
        {msg && (
          <div style={{ color: msg.type === "err" ? "#fca5a5" : "#86efac", background: msg.type === "err" ? "#450a0a" : "#052e16", border: `1px solid ${msg.type === "err" ? "#7f1d1d" : "#166534"}`, borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>
            {msg.text}
          </div>
        )}
        <button onClick={submit} disabled={submitting || !selectedId} style={{ ...btn("primary"), opacity: (submitting || !selectedId) ? 0.5 : 1 }}>
          {submitting ? "Submitting…" : "Submit Portal Request"}
        </button>
      </div>
    </div>
  );
}

// ── GMTab — owner manages their general managers ───────────────────────────────
function GMTab({ teamId, league, season, onRefresh }: { teamId: string; league: string; season: string | null; onRefresh: () => void }) {
  const [gmList, setGmList] = useState<{ id: string; discord_id: string | null; owner_name: string | null; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDiscordId, setNewDiscordId] = useState("");
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ league });
    if (season) params.set("season", season);
    const res = await fetch(`/api/team-owners?${params}`);
    const data = await res.json().catch(() => []);
    // Only show GMs (not the current owner themselves)
    setGmList(Array.isArray(data) ? data.filter((r: any) => r.team_id === teamId && r.role === "gm") : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [teamId, league, season]);

  const addGM = async () => {
    if (!newDiscordId.trim()) return;
    setSubmitting(true);
    setMsg(null);
    const res = await fetch("/api/team-owners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discord_id: newDiscordId.trim(), team_id: teamId, league, season: season ?? undefined, owner_name: newName.trim() || null, role: "gm" }),
    });
    const data = await res.json();
    if (!res.ok) { setMsg({ type: "err", text: data.error ?? "Failed to add GM" }); }
    else { setMsg({ type: "ok", text: "GM added!" }); setNewDiscordId(""); setNewName(""); load(); onRefresh(); }
    setSubmitting(false);
  };

  const removeGM = async (id: string) => {
    if (!confirm("Remove this General Manager?")) return;
    const res = await fetch("/api/team-owners", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) { load(); onRefresh(); }
    else { const d = await res.json(); alert(d.error ?? "Failed to remove"); }
  };

  return (
    <div>
      <div style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>
        General Managers have full access to this team's portal. Add their Discord user ID below.
      </div>
      {loading ? (
        <div style={{ color: "#444", textAlign: "center", padding: "20px 0" }}>Loading…</div>
      ) : gmList.length === 0 ? (
        <div style={{ color: "#444", textAlign: "center", padding: "20px 0" }}>No General Managers assigned yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {gmList.map((gm) => (
            <div key={gm.id} style={{ ...innerCard, display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={`https://cdn.discordapp.com/embed/avatars/0.png`}
                style={{ width: 32, height: 32, borderRadius: "50%", background: "#1a1a1a" }}
                alt=""
              />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{gm.owner_name ?? "Unnamed GM"}</div>
                <div style={{ color: "#555", fontSize: 12 }}>ID: {gm.discord_id}</div>
              </div>
              <span style={{ background: "#1e3a5f", border: "1px solid #1d4ed8", borderRadius: 6, color: "#93c5fd", fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>GM</span>
              <button onClick={() => removeGM(gm.id)} style={{ ...btn("danger"), padding: "4px 10px", fontSize: 12 }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ ...innerCard }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Add General Manager</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 4 }}>Discord User ID *</label>
            <input style={input} placeholder="e.g. 123456789012345678" value={newDiscordId} onChange={(e) => setNewDiscordId(e.target.value)} />
          </div>
          <div>
            <label style={{ color: "#555", fontSize: 12, display: "block", marginBottom: 4 }}>Display Name (optional)</label>
            <input style={input} placeholder="e.g. CoachJoe" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          {msg && (
            <div style={{ color: msg.type === "err" ? "#fca5a5" : "#86efac", background: msg.type === "err" ? "#450a0a" : "#052e16", border: `1px solid ${msg.type === "err" ? "#7f1d1d" : "#166534"}`, borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
              {msg.text}
            </div>
          )}
          <button onClick={addGM} disabled={submitting || !newDiscordId.trim()} style={{ ...btn("primary"), opacity: (submitting || !newDiscordId.trim()) ? 0.5 : 1 }}>
            {submitting ? "Adding…" : "Add GM"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function OwnerPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const leagueSlug = (params?.league as string) ?? "mba";

  const [ownerRecord, setOwnerRecord] = useState<{ id: string; discord_id: string; league: string; season?: string | null; role?: string | null; teams: Team } | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [retentions, setRetentions] = useState<CapRetention[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [seasonTeamIds, setSeasonTeamIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"roster" | "bid" | "trades" | "signings" | "cut" | "portal" | "coaches" | "management">("roster");
  const [isBoardMember, setIsBoardMember] = useState(false);

  const loadAll = useCallback(async () => {
    if (status === "loading") return;
    if (status !== "authenticated") { setLoading(false); return; }
    try {
      const [ownerRes, auctionsRes, teamsRes, boardRes] = await Promise.all([
        fetch(`/api/owner/team?league=${leagueSlug}`),
        fetch(`/api/auction?league=${leagueSlug}&status=active`),
        fetch(`/api/teams?league=${leagueSlug}`),
        fetch(`/api/board-members?league=${leagueSlug}&check=me`),
      ]);
      const boardData = await boardRes.json().catch(() => ({}));
      setIsBoardMember(!!boardData.isMember);
      const ownerData = await ownerRes.json();
      const auctionData = await auctionsRes.json();
      const teamsData = await teamsRes.json();

      const record = Array.isArray(ownerData) ? ownerData[0] : null;
      setOwnerRecord(record);
      setAuctions(Array.isArray(auctionData) ? auctionData : []);
      setAllTeams(Array.isArray(teamsData) ? teamsData : []);

      // Load team IDs for the owner's season to filter the trade dropdown
      if (record?.season) {
        const ownersRes = await fetch(`/api/team-owners?league=${leagueSlug}&season=${encodeURIComponent(record.season)}`);
        const ownersData = await ownersRes.json().catch(() => []);
        setSeasonTeamIds(Array.isArray(ownersData) ? ownersData.map((o: any) => o.team_id).filter(Boolean) : []);
      } else {
        setSeasonTeamIds([]);
      }

      if (record?.teams?.id) {
        const [contractsRes, retentionsRes] = await Promise.all([
          fetch(`/api/contracts?league=${leagueSlug}&team_id=${record.teams.id}`),
          fetch(`/api/cap-retentions?league=${leagueSlug}&team_id=${record.teams.id}`),
        ]);
        const c = await contractsRes.json();
        const ret = await retentionsRes.json();
        setContracts(Array.isArray(c) ? c : []);
        setRetentions(Array.isArray(ret) ? ret : []);
      }
    } finally {
      setLoading(false);
    }
  }, [status, leagueSlug]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // MBGL has no owner portal
  if (leagueSlug === "mbgl") {
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", background: "#111", border: "1px solid #222", borderRadius: 16, padding: 40, textAlign: "center" as const }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Not Available</div>
        <div style={{ color: "#555", fontSize: 14 }}>The team owner portal is not available for the MBGL.</div>
      </div>
    );
  }

  if (status === "loading" || loading)
    return <div style={{ color: "#444", textAlign: "center", padding: 60 }}>Loading…</div>;

  if (status !== "authenticated") {
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", ...card, padding: 40, textAlign: "center" as const }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>Team Owner Portal</div>
        <div style={{ color: "#555", fontSize: 14, marginBottom: 24 }}>Sign in with Discord to access your team dashboard.</div>
        <button onClick={() => signIn("discord")} style={{ ...btn("primary"), padding: "10px 28px", fontSize: 15 }}>Sign in with Discord</button>
      </div>
    );
  }

  if (!ownerRecord) {
    return (
      <div style={{ maxWidth: 480, margin: "60px auto", ...card, padding: 40, textAlign: "center" as const }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 22, marginBottom: 8 }}>No Team Found</div>
        <div style={{ color: "#555", fontSize: 14, marginBottom: 24 }}>Your Discord account isn't linked to a team in {leagueSlug.toUpperCase()}. Contact the commissioner.</div>
        <button onClick={() => signOut()} style={btn()}>Sign out</button>
      </div>
    );
  }

  const team = ownerRecord.teams;
  const totalUsed = contracts.reduce((s, c) => s + c.amount, 0);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      {/* Team header */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid #1a1a1a", flexWrap: "wrap" }}>
          {team.logo_url ? (
            <img src={team.logo_url} style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8, border: "1px solid #222" }} alt="" />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 8, background: team.color2 ? `${team.color2}22` : "#1a1a1a", border: `2px solid ${team.color2 ?? "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", color: team.color2 ?? "#444", fontWeight: 800, fontSize: 16 }}>
              {team.abbreviation}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 22 }}>{team.name}</span>
              {ownerRecord.role === "gm" && (
                <span style={{ background: "#1e3a5f", border: "1px solid #1d4ed8", borderRadius: 6, color: "#93c5fd", fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>GM</span>
              )}
            </div>
            <div style={{ color: "#555", fontSize: 13 }}>{leagueSlug.toUpperCase()} · {team.division ?? "League"}</div>
          </div>
          {leagueSlug !== "mcaa" && leagueSlug !== "mbgl" && (
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#22d3ee", fontWeight: 700, fontSize: 22 }}>{fmt(totalUsed)} <span style={{ color: "#333", fontSize: 16 }}>/ 25,000</span></div>
              <div style={{ color: "#555", fontSize: 12 }}>cap used</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6, alignItems: "flex-end" }}>
            {isBoardMember && (
              <a href={`/${leagueSlug}/board`}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #7c3aed", background: "#4c1d95", color: "#c4b5fd", fontSize: 12, fontWeight: 700, textDecoration: "none", cursor: "pointer" }}>
                🗳 Board Portal
              </a>
            )}
            <button onClick={() => signOut()} style={{ ...btn(), fontSize: 12, padding: "6px 12px" }}>Sign out</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", overflowX: "auto" }}>
          {[
            ...(leagueSlug === "mcaa"
              ? [["roster", "My Roster"], ["coaches", "Coaches"], ["signings", "Signings"], ["cut", "Cut Player"], ["portal", "Transfer Portal"]]
              : [["roster", "My Roster"], ["signings", "Signings"], ["bid", `Live Auctions (${auctions.filter((a) => a.status === "active").length})`], ["trades", "Trades"]]
            ),
            // Only actual owners (not GMs) can manage the GM roster
            ...(ownerRecord.role !== "gm" ? [["management", "👑 Owner"]] : []),
          ].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t as typeof tab)}
              style={{
                padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                background: "none", borderBottom: `2px solid ${tab === t ? "#3b82f6" : "transparent"}`,
                color: tab === t ? "#fff" : "#555", whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: "16px" }}>
          {tab === "roster" && <RosterTab contracts={contracts} retentions={retentions} leagueSlug={leagueSlug} />}
          {tab === "signings" && <SigningsTab teamId={team.id} league={ownerRecord.league} leagueSlug={leagueSlug} contracts={contracts} ownerSeason={ownerRecord.season ?? null} onRefresh={loadAll} />}
          {tab === "bid" && <BidTab auctions={auctions} teamId={team.id} contracts={contracts} retentions={retentions} onRefresh={loadAll} />}
          {tab === "trades" && <TradeTab teamId={team.id} league={ownerRecord.league} leagueSlug={leagueSlug} contracts={contracts} allTeams={allTeams} seasonTeamIds={seasonTeamIds} onRefresh={loadAll} />}
          {tab === "coaches" && <CoachesTab teamId={team.id} leagueSlug={leagueSlug} contracts={contracts} onRefresh={loadAll} />}
          {tab === "cut" && <CutTab teamId={team.id} leagueSlug={leagueSlug} contracts={contracts} onRefresh={loadAll} />}
          {tab === "portal" && <PortalTab teamId={team.id} leagueSlug={leagueSlug} contracts={contracts} onRefresh={loadAll} />}
          {tab === "management" && ownerRecord.role !== "gm" && (
            <GMTab teamId={team.id} league={ownerRecord.league} season={ownerRecord.season ?? null} onRefresh={loadAll} />
          )}
        </div>
      </div>
    </div>
  );
}
