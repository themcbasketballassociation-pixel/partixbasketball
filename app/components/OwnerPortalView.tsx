"use client";
import { useEffect, useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Team = { id: string; name: string; abbreviation: string; color2: string | null; division: string | null; logo_url: string | null };
type Player = { mc_uuid: string; mc_username: string };
type Contract = { id: string; mc_uuid: string; team_id: string; amount: number; is_two_season: boolean; season: string | null; phase: number; status: string; players: Player };
type CapRetention = { id: string; mc_uuid: string; retention_amount: number; status: string };
type Bid = { id: string; team_id: string; amount: number; is_two_season: boolean; effective_value: number; placed_at: string; is_valid: boolean; teams: Team };
type Auction = { id: string; mc_uuid: string; min_price: number; status: string; closes_at: string; phase: number; season: string | null; players: Player; auction_bids: Bid[] };
type DraftPick = { id: string; season: string; round: number; pick_number: number | null; notes: string | null; original_team: { id: string; name: string; abbreviation: string } | null };
type TradeAsset = {
  id: string; from_team_id: string;
  contract_id: string | null; retention_amount: number;
  pick_id: string | null;
  contracts: { id: string; mc_uuid: string; amount: number; is_two_season: boolean; players: Player } | null;
  draft_picks: { id: string; season: string; round: number; pick_number: number | null; original_team: { id: string; name: string; abbreviation: string } | null } | null;
};
type Trade = { id: string; proposing_team_id: string; receiving_team_id: string; status: string; proposed_at: string; notes: string | null; admin_note: string | null; proposing_team: Team; receiving_team: Team; trade_assets: TradeAsset[] };

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString();

const st: Record<string, React.CSSProperties> = {
  innerCard: { background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "12px 14px" },
  input: { background: "#0d0d0d", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 14, width: "100%", boxSizing: "border-box" as const },
};

function ownerBtn(v: "primary" | "secondary" | "danger" | "success" = "secondary"): React.CSSProperties {
  return {
    padding: "8px 16px", borderRadius: 8, border: "1px solid",
    borderColor: v === "primary" ? "#3b82f6" : v === "danger" ? "#7f1d1d" : v === "success" ? "#166534" : "#333",
    background: v === "primary" ? "#1d4ed8" : v === "danger" ? "#450a0a" : v === "success" ? "#052e16" : "#181818",
    color: v === "primary" ? "#fff" : v === "danger" ? "#fca5a5" : v === "success" ? "#86efac" : "#aaa",
    fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const,
  };
}

function Countdown({ closesAt }: { closesAt: string }) {
  const [r, setR] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date(closesAt).getTime() - Date.now();
      if (d <= 0) { setR("Closing…"); return; }
      setR(`${Math.floor(d / 3600000)}h ${String(Math.floor((d % 3600000) / 60000)).padStart(2, "0")}m ${String(Math.floor((d % 60000) / 1000)).padStart(2, "0")}s`);
    };
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [closesAt]);
  return <span style={{ fontVariantNumeric: "tabular-nums", color: "#f97316" }}>{r}</span>;
}

// ── Cap Bar ────────────────────────────────────────────────────────────────────
function CapBar({ contracts, retentions }: { contracts: Contract[]; retentions: CapRetention[] }) {
  const TOTAL = 25000, COURT = 22000;
  const used = contracts.reduce((s, c) => s + c.amount, 0);
  const ret = retentions.filter(r => r.status === "active").reduce((s, r) => s + r.retention_amount, 0);
  const total = used + ret;
  const pct = Math.min((total / TOTAL) * 100, 100);
  const color = total > TOTAL * 0.9 ? "#ef4444" : total > TOTAL * 0.75 ? "#f97316" : "#22d3ee";
  return (
    <div style={{ ...st.innerCard, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#888", fontSize: 13 }}>Your Team Cap</span>
        <span style={{ color, fontWeight: 700 }}>{fmt(total)} / {fmt(TOTAL)}</span>
      </div>
      <div style={{ background: "#1a1a1a", borderRadius: 4, height: 7, overflow: "hidden", marginBottom: 6 }}>
        <div style={{ background: color, width: `${pct}%`, height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span style={{ color: "#555", fontSize: 12 }}>Contracts: {fmt(used)}</span>
        <span style={{ color: "#555", fontSize: 12 }}>Court cap: {fmt(used + ret)} / {fmt(COURT)}</span>
        <span style={{ color: "#555", fontSize: 12 }}>Remaining: {fmt(TOTAL - total)}</span>
        {ret > 0 && <span style={{ color: "#a78bfa", fontSize: 12 }}>Retained: {fmt(ret)}</span>}
      </div>
    </div>
  );
}

// ── Roster ────────────────────────────────────────────────────────────────────
function RosterView({ contracts, retentions, leagueSlug }: { contracts: Contract[]; retentions: CapRetention[]; leagueSlug: string }) {
  const showCap = leagueSlug !== "mcaa" && leagueSlug !== "mbgl";
  const players = contracts.filter(c => c.phase !== 0);
  const coaches = contracts.filter(c => c.phase === 0);
  return (
    <div>
      {showCap && <CapBar contracts={contracts} retentions={retentions} />}
      {contracts.length === 0
        ? <div style={{ color: "#444", textAlign: "center", padding: "24px 0" }}>{showCap ? "No active contracts." : "No players assigned."}</div>
        : (
          <>
            {players.map(c => (
              <div key={c.id} style={{ ...st.innerCard, display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <img src={`https://minotar.net/avatar/${c.players.mc_username}/32`} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #222" }} onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }} alt="" />
                <span style={{ color: "#fff", fontWeight: 600, flex: 1 }}>{c.players.mc_username}</span>
                {showCap && <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 17 }}>{fmt(c.amount)}</span>}
                {showCap && c.is_two_season && <span style={{ color: "#a855f7", fontSize: 11, background: "#1a0a2e", border: "1px solid #4c1d95", borderRadius: 4, padding: "1px 5px" }}>2yr</span>}
              </div>
            ))}
            {coaches.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ color: "#555", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Coaches</div>
                {coaches.map(c => (
                  <div key={c.id} style={{ ...st.innerCard, display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <img src={`https://minotar.net/avatar/${c.players.mc_username}/32`} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #222" }} onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }} alt="" />
                    <span style={{ color: "#fff", fontWeight: 600, flex: 1 }}>{c.players.mc_username}</span>
                    <span style={{ color: "#a78bfa", background: "#1e1b4b", border: "1px solid #4c1d95", borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>Coach</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      }
    </div>
  );
}

// ── Bidding ────────────────────────────────────────────────────────────────────
function BidView({ auctions, teamId, contracts, retentions, onRefresh }: { auctions: Auction[]; teamId: string; contracts: Contract[]; retentions: CapRetention[]; onRefresh: () => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [twos, setTwos] = useState<Record<string, boolean>>({});
  const [msgs, setMsgs] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const maxExisting = contracts.reduce((m, c) => Math.max(m, c.amount), 0);
  const existingTotal = contracts.reduce((s, c) => s + c.amount, 0);
  const retentionTotal = (retentions ?? []).filter(r => r.status === "active").reduce((s, r) => s + r.retention_amount, 0);
  const active = auctions.filter(a => a.status === "active");
  const filtered = search.trim()
    ? active.filter(a => (a.players?.mc_username ?? "").toLowerCase().includes(search.toLowerCase()))
    : active;

  // Declare helpers BEFORE they are used in pendingHolds to avoid TDZ crash
  const topBid = (a: Auction) => [...(a.auction_bids ?? [])].filter(b => b.is_valid).sort((x, y) => y.effective_value - x.effective_value)[0] ?? null;
  const myBid = (a: Auction) => [...(a.auction_bids ?? [])].filter(b => b.is_valid && b.team_id === teamId).sort((x, y) => y.effective_value - x.effective_value)[0] ?? null;

  // Pending cap holds: auctions where player can still accept (within 500 of top = player choice window)
  const pendingHolds = active.reduce((sum, a) => {
    const top = topBid(a);
    const my = myBid(a);
    if (!my || !top) return sum;
    return my.effective_value >= top.effective_value - 500 ? sum + my.amount : sum;
  }, 0);
  const availableCap = Math.max(0, 25000 - existingTotal - retentionTotal - pendingHolds);

  const placeBid = async (aId: string) => {
    const amt = parseInt(amounts[aId] ?? "");
    if (!amt) return setMsgs(m => ({ ...m, [aId]: { ok: false, text: "Enter an amount" } }));
    setBusy(b => ({ ...b, [aId]: true }));
    const r = await fetch("/api/auction/bid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auction_id: aId, team_id: teamId, amount: amt, is_two_season: twos[aId] ?? false }) });
    const d = await r.json();
    setBusy(b => ({ ...b, [aId]: false }));
    if (!r.ok) setMsgs(m => ({ ...m, [aId]: { ok: false, text: d.error } }));
    else { setAmounts(a => ({ ...a, [aId]: "" })); setMsgs(m => ({ ...m, [aId]: { ok: true, text: d.warning ?? "Bid placed!" } })); onRefresh(); }
  };

  if (active.length === 0) return <div style={{ color: "#444", textAlign: "center", padding: "32px 0" }}>No live auctions right now.</div>;

  return (
    <div>
      {/* Search bar */}
      <input
        type="text"
        placeholder={`Search ${active.length} player${active.length !== 1 ? "s" : ""}…`}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ ...st.input, marginBottom: 12 }}
      />

      <div style={{ ...st.innerCard, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 6 }}>
          <span style={{ color: "#555", fontSize: 13 }}>Signed: <strong style={{ color: "#ccc" }}>{fmt(existingTotal)}</strong></span>
          {retentionTotal > 0 && <span style={{ color: "#555", fontSize: 13 }}>Retained: <strong style={{ color: "#a78bfa" }}>{fmt(retentionTotal)}</strong></span>}
          {pendingHolds > 0 && <span style={{ color: "#555", fontSize: 13 }}>Bid holds: <strong style={{ color: "#f59e0b" }}>{fmt(pendingHolds)}</strong></span>}
          <span style={{ color: "#555", fontSize: 13 }}>Available cap: <strong style={{ color: availableCap < 2000 ? "#ef4444" : "#22d3ee" }}>{fmt(availableCap)}</strong></span>
          <span style={{ color: "#555", fontSize: 13 }}>Max new bid: <strong style={{ color: "#f97316" }}>{fmt(Math.max(0, 20000 - maxExisting))}</strong></span>
        </div>
        {pendingHolds > 0 && (
          <div style={{ color: "#78350f", background: "#1c1000", border: "1px solid #78350f", borderRadius: 6, padding: "5px 10px", fontSize: 12 }}>
            Your pending bids hold <strong style={{ color: "#f59e0b" }}>{fmt(pendingHolds)}</strong> of cap space. This is released if the player signs elsewhere. You cannot bid beyond your available cap.
          </div>
        )}
      </div>
      {filtered.length === 0 && search && (
        <div style={{ color: "#555", textAlign: "center", padding: "24px 0", fontSize: 13 }}>No players matching "{search}"</div>
      )}
      {filtered.map(a => {
        const top = topBid(a); const my = myBid(a);
        const iAmTop = top?.team_id === teamId;
        const amt = parseInt(amounts[a.id] ?? "") || 0;
        const is2 = twos[a.id] ?? false;
        const msg = msgs[a.id];
        return (
          <div key={a.id} style={{ background: "#0d0d0d", border: `1px solid ${iAmTop ? "#164e63" : "#1a1a1a"}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <img src={`https://minotar.net/avatar/${a.players?.mc_username ?? "MHF_Steve"}/36`} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #222" }} onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }} alt="" />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#fff", fontWeight: 700 }}>{a.players?.mc_username ?? a.mc_uuid.slice(0, 8)}</div>
                <div style={{ color: "#555", fontSize: 12 }}>Phase {a.phase} · Closes in <Countdown closesAt={a.closes_at} /></div>
              </div>
              {iAmTop && <span style={{ color: "#22d3ee", fontSize: 11, background: "#0a1a1f", border: "1px solid #164e63", borderRadius: 6, padding: "2px 8px" }}>Leading</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ color: "#444", fontSize: 11 }}>Min</div>
                <div style={{ color: "#888", fontWeight: 600 }}>{fmt(a.min_price)}</div>
              </div>
              <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ color: "#444", fontSize: 11 }}>Top (eff.)</div>
                <div style={{ color: top ? "#22d3ee" : "#444", fontWeight: 600 }}>{top ? fmt(top.effective_value) : "No bids"}</div>
                {top && <div style={{ color: "#444", fontSize: 11 }}>{top.teams?.abbreviation}</div>}
              </div>
            </div>
            {my && <div style={{ color: "#22d3ee", fontSize: 12, marginBottom: 8 }}>Your bid: {fmt(my.effective_value)} eff. ({fmt(my.amount)}{my.is_two_season ? " 2yr" : ""})</div>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="number" step={250} min={a.min_price} max={12000} placeholder={`e.g. ${top ? top.effective_value + 250 : a.min_price}`} value={amounts[a.id] ?? ""} onChange={e => setAmounts(x => ({ ...x, [a.id]: e.target.value }))} style={{ ...st.input, flex: 1, minWidth: 120 }} />
              <label style={{ display: "flex", alignItems: "center", gap: 5, color: "#a855f7", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={twos[a.id] ?? false} onChange={e => setTwos(x => ({ ...x, [a.id]: e.target.checked }))} style={{ accentColor: "#a855f7" }} /> 2-season
              </label>
              <button onClick={() => placeBid(a.id)} disabled={busy[a.id]} style={{ ...ownerBtn("primary"), opacity: busy[a.id] ? 0.5 : 1 }}>{busy[a.id] ? "…" : "Bid"}</button>
            </div>
            {amt > 0 && <div style={{ color: "#555", fontSize: 11, marginTop: 4 }}>Preview: {fmt(amt)} → {fmt(amt + (is2 ? 500 : 0))} eff.{is2 && amt < 5000 ? " ⚠ min 5,000 for 2-season" : ""}</div>}
            {msg?.text && <div style={{ marginTop: 8, color: msg.ok ? "#86efac" : "#fca5a5", background: msg.ok ? "#052e16" : "#450a0a", border: `1px solid ${msg.ok ? "#166534" : "#7f1d1d"}`, borderRadius: 8, padding: "7px 12px", fontSize: 13 }}>{msg.text}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ── Trades ────────────────────────────────────────────────────────────────────
type AssetRow = { type: "contract" | "pick"; cid: string; ret: string; pickId: string };
const emptyAsset = (): AssetRow => ({ type: "contract", cid: "", ret: "", pickId: "" });

function pickLabel(p: DraftPick) {
  return `${p.season} R${p.round}${p.pick_number != null ? ` #${p.pick_number}` : ""}${p.original_team ? ` (${p.original_team.abbreviation})` : ""}`;
}

function TradeAssetDisplay({ asset }: { asset: TradeAsset }) {
  if (asset.pick_id && asset.draft_picks) {
    const p = asset.draft_picks;
    return (
      <div style={{ color: "#fbbf24", fontSize: 12 }}>
        🏀 {p.season} R{p.round}{p.pick_number != null ? ` #${p.pick_number}` : ""}
        {p.original_team && <span style={{ color: "#555" }}> ({p.original_team.abbreviation})</span>}
      </div>
    );
  }
  if (!asset.contract_id && !asset.pick_id && (asset.retention_amount ?? 0) > 0) {
    return (
      <div style={{ color: "#a78bfa", fontSize: 12 }}>
        💰 Retention Cash: {fmt(asset.retention_amount)}
      </div>
    );
  }
  if (asset.contract_id && asset.contracts) {
    return (
      <div style={{ color: "#888", fontSize: 12 }}>
        {asset.contracts.players.mc_username} ({fmt(asset.contracts.amount)})
        {(asset.retention_amount ?? 0) > 0 && <span style={{ color: "#a855f7", marginLeft: 4 }}>ret. {fmt(asset.retention_amount)}</span>}
      </div>
    );
  }
  return <div style={{ color: "#333", fontSize: 12 }}>?</div>;
}

function TradesView({ teamId, leagueSlug, contracts, allTeams, myPicks, onRefresh }: {
  teamId: string; leagueSlug: string; contracts: Contract[]; allTeams: Team[];
  myPicks: DraftPick[]; onRefresh: () => void;
}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [targetTeam, setTargetTeam] = useState("");
  const [theirContracts, setTheirContracts] = useState<Contract[]>([]);
  const [theirPicks, setTheirPicks] = useState<DraftPick[]>([]);
  const [myAssets, setMyAssets] = useState<AssetRow[]>([emptyAsset()]);
  const [theirAssets, setTheirAssets] = useState<AssetRow[]>([emptyAsset()]);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTrades = useCallback(async () => {
    const r = await fetch(`/api/trades?league=${leagueSlug}&team_id=${teamId}`);
    const d = await r.json();
    setTrades(Array.isArray(d) ? d : []);
  }, [leagueSlug, teamId]);

  useEffect(() => { loadTrades(); }, [loadTrades]);

  useEffect(() => {
    if (!targetTeam) { setTheirContracts([]); setTheirPicks([]); return; }
    Promise.all([
      fetch(`/api/contracts?league=${leagueSlug}&team_id=${targetTeam}`).then(r => r.json()),
      fetch(`/api/draft-picks?league=${leagueSlug}&team_id=${targetTeam}`).then(r => r.json()),
    ]).then(([c, p]) => {
      setTheirContracts(Array.isArray(c) ? c : []);
      setTheirPicks(Array.isArray(p) ? p : []);
    });
  }, [targetTeam, leagueSlug]);

  const submit = async () => {
    if (!targetTeam) return setErr("Select a team");
    setErr(""); setBusy(true);

    const buildAssets = (rows: AssetRow[], fromTeamId: string, ctrts: Contract[], picks: DraftPick[]) =>
      rows.filter(a => {
        if (a.type === "pick") return !!a.pickId;
        return !!a.cid || (Math.min(parseInt(a.ret) || 0, 1000) > 0);
      }).map(a => {
        if (a.type === "pick") return { from_team_id: fromTeamId, pick_id: a.pickId };
        const ret = Math.min(parseInt(a.ret) || 0, 1000);
        return { from_team_id: fromTeamId, contract_id: a.cid || null, retention_amount: ret };
      });

    const assets = [
      ...buildAssets(myAssets, teamId, contracts, myPicks),
      ...buildAssets(theirAssets, targetTeam, theirContracts, theirPicks),
    ];
    if (!assets.length) { setBusy(false); return setErr("Add at least one asset"); }

    const r = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league: leagueSlug, proposing_team_id: teamId, receiving_team_id: targetTeam, assets, notes }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    setMyAssets([emptyAsset()]); setTheirAssets([emptyAsset()]); setNotes(""); setTargetTeam(""); loadTrades(); onRefresh();
  };

  const respond = async (id: string, action: string) => {
    await fetch(`/api/trades/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    loadTrades();
  };

  const badge = (s: string) => {
    const m: Record<string, string> = { pending: "#fbbf24", admin_review: "#a855f7", approved: "#22c55e", rejected: "#ef4444", denied: "#ef4444", cancelled: "#555" };
    return <span style={{ color: m[s] ?? "#888", fontSize: 11, fontWeight: 600 }}>{s.replace("_", " ")}</span>;
  };

  const AssetPicker = ({ assets, set, ctrts, picks, label }: {
    assets: AssetRow[];
    set: React.Dispatch<React.SetStateAction<AssetRow[]>>;
    ctrts: Contract[]; picks: DraftPick[]; label: string;
  }) => (
    <div>
      <div style={{ color: "#555", fontSize: 12, marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {assets.map((a, i) => (
        <div key={i} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: "8px", marginBottom: 6 }}>
          {/* Type toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            {(["contract", "pick"] as const).map(t => (
              <button key={t} onClick={() => set(p => p.map((x, j) => j === i ? { ...emptyAsset(), type: t } : x))}
                style={{ padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", border: "1px solid",
                  background: a.type === t ? (t === "contract" ? "#1d4ed8" : "#78350f") : "#181818",
                  borderColor: a.type === t ? (t === "contract" ? "#3b82f6" : "#f59e0b") : "#333",
                  color: a.type === t ? "#fff" : "#555" }}>
                {t === "contract" ? "Player" : "Pick"}
              </button>
            ))}
            <button onClick={() => set(p => p.filter((_, j) => j !== i))} style={{ marginLeft: "auto", ...ownerBtn("danger"), padding: "2px 8px", fontSize: 11 }}>✕</button>
          </div>

          {a.type === "contract" ? (
            <div style={{ display: "flex", gap: 6 }}>
              <select style={{ ...st.input, flex: 1 }} value={a.cid} onChange={e => set(p => p.map((x, j) => j === i ? { ...x, cid: e.target.value, ret: "" } : x))}>
                <option value="">— Player —</option>
                {ctrts.map(c => <option key={c.id} value={c.id}>{c.players.mc_username} ({fmt(c.amount)})</option>)}
              </select>
              {a.type === "contract" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <input type="number" placeholder="Retain $" min={0} max={1000} step={250} value={a.ret}
                    onChange={e => set(p => p.map((x, j) => j === i ? { ...x, ret: e.target.value } : x))}
                    style={{ ...st.input, width: 90, flex: "none" }} />
                  <span style={{ color: "#555", fontSize: 10, textAlign: "center" }}>max 1,000</span>
                </div>
              )}
            </div>
          ) : (
            <select style={st.input} value={a.pickId} onChange={e => set(p => p.map((x, j) => j === i ? { ...x, pickId: e.target.value } : x))}>
              <option value="">— Draft Pick —</option>
              {picks.map(p => <option key={p.id} value={p.id}>{pickLabel(p)}</option>)}
            </select>
          )}
        </div>
      ))}
      <button onClick={() => set(p => [...p, emptyAsset()])} style={{ ...ownerBtn(), fontSize: 12, padding: "4px 10px" }}>+ Add</button>
    </div>
  );

  return (
    <div>
      {/* Propose form */}
      <div style={{ ...st.innerCard, marginBottom: 16 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 12 }}>Propose Trade</div>
        <div style={{ marginBottom: 10 }}>
          <select style={st.input} value={targetTeam} onChange={e => setTargetTeam(e.target.value)}>
            <option value="">— Trade with —</option>
            {allTeams.filter(t => t.id !== teamId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <AssetPicker assets={myAssets} set={setMyAssets} ctrts={contracts} picks={myPicks} label="You send" />
          <AssetPicker assets={theirAssets} set={setTheirAssets} ctrts={theirContracts} picks={theirPicks} label="You receive" />
        </div>
        <input style={{ ...st.input, marginBottom: 10 }} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
        <div style={{ background: "#0a0d12", border: "1px solid #1a2030", borderRadius: 8, padding: "7px 12px", marginBottom: 10, color: "#444", fontSize: 12 }}>
          Retention: max 1,000 per team total · contracts + retention must exceed 22k (court cap) and stay ≤ 23k · leave player blank to offer retention cash
        </div>
        {err && <div style={{ color: "#fca5a5", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 13 }}>{err}</div>}
        <button onClick={submit} disabled={busy} style={{ ...ownerBtn("primary"), opacity: busy ? 0.5 : 1 }}>{busy ? "Submitting…" : "Propose Trade"}</button>
      </div>

      {/* Trade list */}
      {trades.length === 0
        ? <div style={{ color: "#444", textAlign: "center", padding: "20px 0" }}>No trades yet.</div>
        : trades.map(t => {
          const iProp = t.proposing_team_id === teamId;
          return (
            <div key={t.id} style={{ ...st.innerCard, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ color: "#aaa", fontSize: 13, fontWeight: 600 }}>{iProp ? `You → ${t.receiving_team.name}` : `${t.proposing_team.name} → You`}</span>
                {badge(t.status)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                {[
                  { label: iProp ? "You send" : "They send", assets: (t.trade_assets ?? []).filter(a => a.from_team_id === t.proposing_team_id) },
                  { label: iProp ? "You receive" : "They receive", assets: (t.trade_assets ?? []).filter(a => a.from_team_id === t.receiving_team_id) },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ color: "#444", fontSize: 11, marginBottom: 4 }}>{s.label}</div>
                    {s.assets.length === 0
                      ? <span style={{ color: "#333", fontSize: 12 }}>—</span>
                      : s.assets.map(a => <TradeAssetDisplay key={a.id} asset={a} />)
                    }
                  </div>
                ))}
              </div>
              {t.notes && <div style={{ color: "#555", fontSize: 12, fontStyle: "italic", marginBottom: 6 }}>"{t.notes}"</div>}
              {t.admin_note && <div style={{ color: "#a78bfa", fontSize: 12, marginBottom: 6 }}>Admin: {t.admin_note}</div>}
              {t.status === "admin_review" && (
                <div style={{ color: "#a855f7", fontSize: 12, background: "#1a0a2e", border: "1px solid #4c1d95", borderRadius: 6, padding: "5px 10px", marginBottom: 6 }}>
                  Both sides agreed — awaiting admin approval
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {!iProp && t.status === "pending" && <button onClick={() => respond(t.id, "accept")} style={ownerBtn("success")}>Accept</button>}
                {!iProp && t.status === "pending" && <button onClick={() => respond(t.id, "reject")} style={ownerBtn("danger")}>Reject</button>}
                {iProp && t.status === "pending" && <button onClick={() => respond(t.id, "cancel")} style={ownerBtn("danger")}>Cancel</button>}
              </div>
            </div>
          );
        })
      }
    </div>
  );
}

// ── Signings ──────────────────────────────────────────────────────────────────
type SigningPlayer = { mc_uuid: string; mc_username: string; min_price: number };

function SigningsView({ teamId, leagueSlug, contracts, onRefresh }: {
  teamId: string; leagueSlug: string; contracts: Contract[]; onRefresh: () => void;
}) {
  const isMcaa = leagueSlug === "mcaa";
  const hideCap = leagueSlug === "mcaa" || leagueSlug === "mbgl";
  const TOTAL_CAP = 25000;
  const [available, setAvailable] = useState<SigningPlayer[]>([]);
  const [pendingSignings, setPendingSignings] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [signingRole, setSigningRole] = useState<"player" | "coach">("player");
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [signing, setSigning] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [faRes, pendingRes] = await Promise.all([
      fetch(`/api/contracts/sign?league=${leagueSlug}`),
      fetch(`/api/contracts?league=${leagueSlug}&team_id=${teamId}&status=pending_approval`),
    ]);
    const fa = await faRes.json();
    const pending = await pendingRes.json();
    setAvailable(Array.isArray(fa) ? fa : []);
    setPendingSignings(Array.isArray(pending) ? pending : []);
    setLoading(false);
  }, [leagueSlug, teamId]);

  useEffect(() => { loadData(); }, [loadData]);

  const capUsed = contracts.reduce((s, c) => s + c.amount, 0);
  const capRemaining = TOTAL_CAP - capUsed;
  const selectedInfo = available.find(p => p.mc_uuid === selectedPlayer);

  const signPlayer = async () => {
    if (!selectedPlayer) return setErr("Select a player");
    setErr(""); setSuccessMsg(""); setSigning(true);
    const isCoach = isMcaa && signingRole === "coach";
    const r = await fetch(isCoach ? "/api/contracts/coach" : "/api/contracts/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isCoach
        ? { league: leagueSlug, mc_username: selectedInfo?.mc_username }
        : { league: leagueSlug, mc_uuid: selectedPlayer }),
    });
    const d = await r.json();
    setSigning(false);
    if (!r.ok) {
      setErr(d.error);
    } else {
      setSuccessMsg(`${isCoach ? "Coach" : "Signing"} request submitted for ${selectedInfo?.mc_username ?? "player"}${!hideCap && !isCoach ? ` at ${fmt(selectedInfo?.min_price ?? 0)}` : ""} — waiting for admin approval.`);
      setSelectedPlayer("");
      loadData(); onRefresh();
    }
  };

  return (
    <div>
      {!hideCap && (
        <div style={{ ...st.innerCard, marginBottom: 14, display: "flex", gap: 20, flexWrap: "wrap" as const }}>
          <span style={{ color: "#555", fontSize: 13 }}>Cap remaining: <strong style={{ color: "#22d3ee" }}>{fmt(capRemaining)}</strong></span>
        </div>
      )}
      <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#555" }}>
        {isMcaa
          ? "Sign available players · Requires admin approval"
          : "Post-auction signings only · Players signed at their auction minimum price · No 2-season contracts · Requires admin approval"}
      </div>

      {/* Form */}
      <div style={{ ...st.innerCard, marginBottom: 16 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 12 }}>Request a Signing</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#555", fontSize: 12, marginBottom: 4 }}>{isMcaa ? "Available player" : "Player (went undrafted in auction)"}</div>
          {loading
            ? <div style={{ color: "#444", fontSize: 13 }}>Loading…</div>
            : available.length === 0
            ? <div style={{ color: "#555", fontSize: 13 }}>{isMcaa ? "No players available for signing." : "No players available for signing yet. Players appear here after the auction closes without a bid."}</div>
            : <select style={st.input} value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
                <option value="">— Select player —</option>
                {available.map(p => <option key={p.mc_uuid} value={p.mc_uuid}>{p.mc_username}{!hideCap ? ` — ${fmt(p.min_price)}` : ""}</option>)}
              </select>
          }
        </div>
        {isMcaa && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#555", fontSize: 12, marginBottom: 6 }}>Signing as</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["player", "coach"] as const).map(role => (
                <button key={role} onClick={() => setSigningRole(role)} style={{
                  padding: "6px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid",
                  borderColor: signingRole === role ? "#3b82f6" : "#222",
                  background: signingRole === role ? "#1e3a5f" : "#0d1117",
                  color: signingRole === role ? "#93c5fd" : "#555",
                }}>
                  {role === "player" ? "🏀 Player" : "🎓 Coach"}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedInfo && !hideCap && signingRole === "player" && (
          <div style={{ ...st.innerCard, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#555", fontSize: 13 }}>Signing salary (auction minimum)</span>
            <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 18 }}>{fmt(selectedInfo.min_price)}</span>
          </div>
        )}
        {selectedInfo && !hideCap && signingRole === "player" && capUsed + selectedInfo.min_price > TOTAL_CAP && (
          <div style={{ color: "#fca5a5", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 13 }}>
            ⚠ This signing would exceed your cap ({fmt(capUsed)} + {fmt(selectedInfo.min_price)} = {fmt(capUsed + selectedInfo.min_price)} / {fmt(TOTAL_CAP)})
          </div>
        )}
        {err && <div style={{ color: "#fca5a5", background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 13 }}>{err}</div>}
        {successMsg && <div style={{ color: "#86efac", background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 13 }}>{successMsg}</div>}
        <button
          onClick={signPlayer}
          disabled={signing || !selectedPlayer || (!hideCap && signingRole === "player" && selectedInfo ? capUsed + selectedInfo.min_price > TOTAL_CAP : false)}
          style={{ ...ownerBtn("primary"), opacity: (signing || !selectedPlayer) ? 0.5 : 1 }}
        >
          {signing ? "Submitting…" : isMcaa && signingRole === "coach" ? "Submit Coach Request" : "Submit Signing Request"}
        </button>
      </div>

      {/* Pending requests */}
      {pendingSignings.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Pending Requests</div>
          {pendingSignings.map(c => (
            <div key={c.id} style={{ ...st.innerCard, display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <img src={`https://minotar.net/avatar/${c.players.mc_username}/32`} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #222" }} onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }} alt="" />
              <span style={{ color: "#fff", fontWeight: 600, flex: 1 }}>{c.players.mc_username}</span>
              {!hideCap && <span style={{ color: "#22d3ee", fontWeight: 700 }}>{fmt(c.amount)}</span>}
              <span style={{ color: "#fbbf24", background: "#1c1200", border: "1px solid #78350f", borderRadius: 6, fontSize: 11, padding: "2px 7px", fontWeight: 600 }}>pending approval</span>
            </div>
          ))}
        </div>
      )}

      {/* Active roster */}
      {contracts.length > 0 && (
        <div>
          <div style={{ color: "#555", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Active Roster</div>
          {contracts.map(c => (
            <div key={c.id} style={{ ...st.innerCard, display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <img src={`https://minotar.net/avatar/${c.players.mc_username}/32`} style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #222" }} onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/32"; }} alt="" />
              <span style={{ color: "#fff", fontWeight: 600, flex: 1 }}>{c.players.mc_username}</span>
              {!hideCap && <span style={{ color: "#22d3ee", fontWeight: 700 }}>{fmt(c.amount)}</span>}
              {c.is_two_season && <span style={{ color: "#a855f7", fontSize: 11 }}>2yr</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cut ───────────────────────────────────────────────────────────────────────
function CutView({ teamId, leagueSlug, contracts, onRefresh }: {
  teamId: string; leagueSlug: string; contracts: Contract[]; onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeContracts = contracts.filter(c => c.status === "active");

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
    setMsg({ type: "ok", text: d.message ?? "Cut request submitted — awaiting admin approval." });
    setSelectedId(""); onRefresh();
  };

  return (
    <div>
      <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: 8, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#555" }}>
        Request to cut a player from your roster. Requires admin approval.
      </div>
      <div style={{ ...st.innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 12 }}>Cut a Player</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#555", fontSize: 12, marginBottom: 4 }}>Select player to cut</div>
          {activeContracts.length === 0
            ? <div style={{ color: "#555", fontSize: 13 }}>No active contracts on your roster.</div>
            : <select style={st.input} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                <option value="">— Select player —</option>
                {activeContracts.map(c => <option key={c.id} value={c.id}>{c.players.mc_username}{(leagueSlug !== "mcaa" && leagueSlug !== "mbgl" && c.amount > 0) ? ` (${fmt(c.amount)})` : ""}</option>)}
              </select>
          }
        </div>
        {msg && <div style={{ color: msg.type === "err" ? "#fca5a5" : "#86efac", background: msg.type === "err" ? "#450a0a" : "#052e16", border: `1px solid ${msg.type === "err" ? "#7f1d1d" : "#166534"}`, borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 13 }}>{msg.text}</div>}
        <button onClick={submit} disabled={submitting || !selectedId} style={{ ...ownerBtn("danger"), opacity: (submitting || !selectedId) ? 0.5 : 1 }}>
          {submitting ? "Submitting…" : "Request Cut"}
        </button>
      </div>
    </div>
  );
}

// ── Portal ────────────────────────────────────────────────────────────────────
type PortalPlayer = { id: string; mc_uuid: string; season: string | null; players: { mc_uuid: string; mc_username: string }; teams: { name: string; abbreviation: string } };

function PortalView({ teamId, leagueSlug, contracts, onRefresh }: {
  teamId: string; leagueSlug: string; contracts: Contract[]; onRefresh: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [portalPlayers, setPortalPlayers] = useState<PortalPlayer[]>([]);
  const [pendingClaims, setPendingClaims] = useState<PortalPlayer[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimMsg, setClaimMsg] = useState<Record<string, { type: "ok" | "err"; text: string }>>({});

  const activeContracts = contracts.filter(c => c.status === "active");

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
    setMsg({ type: "ok", text: d.message ?? "Portal request submitted — awaiting admin approval." });
    setSelectedId(""); onRefresh(); loadPortal();
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
      setClaimMsg(m => ({ ...m, [mc_uuid]: { type: "err", text: d.error } }));
    } else {
      setClaimMsg(m => ({ ...m, [mc_uuid]: { type: "ok", text: `Claim submitted for ${username} — awaiting admin approval.` } }));
      loadPortal(); onRefresh();
    }
  };

  return (
    <div>
      {/* ── Portal Pool ── */}
      <div style={{ ...st.innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          🚪 Players in Transfer Portal
          <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>· Claiming requires admin approval</span>
        </div>
        {portalPlayers.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13 }}>No players currently in the portal.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {portalPlayers.map(p => {
              const cm = claimMsg[p.players.mc_uuid];
              return (
                <div key={p.id}>
                  <div style={{ ...st.innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                    <img src={`https://minotar.net/avatar/${p.players.mc_username}/36`} style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #222", imageRendering: "pixelated" as const }} onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }} alt="" />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{p.players.mc_username}</div>
                      <div style={{ color: "#555", fontSize: 11 }}>From: {p.teams?.name ?? "Unknown"}{p.season ? ` · ${p.season}` : ""}</div>
                    </div>
                    <span style={{ fontSize: 11, color: "#f59e0b", background: "#1c1200", border: "1px solid #78350f", borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>In Portal</span>
                    <button
                      onClick={() => claimPlayer(p.players.mc_uuid, p.players.mc_username)}
                      disabled={claimingId === p.players.mc_uuid}
                      style={{ ...ownerBtn("primary"), fontSize: 12, padding: "6px 14px", opacity: claimingId === p.players.mc_uuid ? 0.5 : 1 }}
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
        <div style={{ ...st.innerCard, marginBottom: 20 }}>
          <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            ⏳ Your Pending Portal Claims
            <span style={{ fontSize: 11, color: "#555", fontWeight: 400 }}>· Awaiting admin approval</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingClaims.map(p => (
              <div key={p.id} style={{ ...st.innerCard, display: "flex", alignItems: "center", gap: 12 }}>
                <img src={`https://minotar.net/avatar/${p.players.mc_username}/36`} style={{ width: 36, height: 36, borderRadius: 6, border: "1px solid #222", imageRendering: "pixelated" as const }} onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/36"; }} alt="" />
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
      <div style={{ ...st.innerCard, marginBottom: 20 }}>
        <div style={{ color: "#aaa", fontWeight: 700, marginBottom: 12 }}>Send Player to Portal</div>
        <div style={{ background: "#0d1117", border: "1px solid #1a2030", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 12, color: "#555" }}>
          Once approved, the player enters the portal and can be claimed by any team.
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#555", fontSize: 12, marginBottom: 4 }}>Select player to portal</div>
          {activeContracts.length === 0
            ? <div style={{ color: "#555", fontSize: 13 }}>No active contracts on your roster.</div>
            : <select style={st.input} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                <option value="">— Select player —</option>
                {activeContracts.map(c => <option key={c.id} value={c.id}>{c.players.mc_username}</option>)}
              </select>
          }
        </div>
        {msg && <div style={{ color: msg.type === "err" ? "#fca5a5" : "#86efac", background: msg.type === "err" ? "#450a0a" : "#052e16", border: `1px solid ${msg.type === "err" ? "#7f1d1d" : "#166534"}`, borderRadius: 8, padding: "7px 12px", marginBottom: 8, fontSize: 13 }}>{msg.text}</div>}
        <button onClick={submit} disabled={submitting || !selectedId} style={{ ...ownerBtn("primary"), opacity: (submitting || !selectedId) ? 0.5 : 1 }}>
          {submitting ? "Submitting…" : "Submit Portal Request"}
        </button>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function OwnerPortalView({ teamRecord, leagueSlug, onBack }: {
  teamRecord: { teams: Team; season?: string | null };
  leagueSlug: string;
  onBack: () => void;
}) {
  const team = teamRecord.teams;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [retentions, setRetentions] = useState<CapRetention[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [myPicks, setMyPicks] = useState<DraftPick[]>([]);
  const [seasonTeamIds, setSeasonTeamIds] = useState<string[]>([]);
  const [tab, setTab] = useState<"roster" | "bid" | "trades" | "signings" | "cut" | "portal">("roster");
  const isMcaa = leagueSlug === "mcaa";

  const load = useCallback(async () => {
    const [c, ret, a, teams, picks] = await Promise.all([
      fetch(`/api/contracts?league=${leagueSlug}&team_id=${team.id}`).then(r => r.json()),
      fetch(`/api/cap-retentions?league=${leagueSlug}&team_id=${team.id}`).then(r => r.json()),
      fetch(`/api/auction?league=${leagueSlug}&status=active`).then(r => r.json()),
      fetch(`/api/teams?league=${leagueSlug}`).then(r => r.json()),
      fetch(`/api/draft-picks?league=${leagueSlug}&team_id=${team.id}`).then(r => r.json()),
    ]);
    setContracts(Array.isArray(c) ? c : []);
    setRetentions(Array.isArray(ret) ? ret : []);
    setAuctions(Array.isArray(a) ? a : []);
    setAllTeams(Array.isArray(teams) ? teams : []);
    setMyPicks(Array.isArray(picks) ? picks : []);

    if (teamRecord.season) {
      const ownersRes = await fetch(`/api/team-owners?league=${leagueSlug}&season=${encodeURIComponent(teamRecord.season)}`);
      const ownersData = await ownersRes.json().catch(() => []);
      setSeasonTeamIds(Array.isArray(ownersData) ? ownersData.map((o: any) => o.team_id).filter(Boolean) : []);
    }
  }, [leagueSlug, team.id, teamRecord.season]);

  useEffect(() => { load(); }, [load]);

  const totalUsed = contracts.reduce((s, c) => s + c.amount, 0);
  const activeAuctions = auctions.filter(a => a.status === "active");
  const seasonFilteredTeams = seasonTeamIds.length > 0 ? allTeams.filter(t => seasonTeamIds.includes(t.id)) : allTeams;

  return (
    <div>
      {/* Team header */}
      <div style={{ marginBottom: 20, padding: "20px 0", borderBottom: "1px solid #1a1a1a" }}>
        <button onClick={onBack} style={{ ...ownerBtn(), padding: "6px 12px", fontSize: 12, marginBottom: 16 }}>← Back to Portal</button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {team.logo_url
            ? <img src={team.logo_url} style={{ width: 72, height: 72, objectFit: "contain", borderRadius: 12, border: "1px solid #222", flexShrink: 0 }} alt={team.name} />
            : <div style={{ width: 72, height: 72, borderRadius: 12, background: team.color2 ? `${team.color2}22` : "#1a1a1a", border: `2px solid ${team.color2 ?? "#333"}`, display: "flex", alignItems: "center", justifyContent: "center", color: team.color2 ?? "#444", fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{team.abbreviation}</div>
          }
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 24 }}>{team.name}</div>
            <div style={{ color: "#555", fontSize: 13, marginTop: 2 }}>{team.division ? `${team.division} Division · ` : ""}{leagueSlug.toUpperCase()} Owner Portal</div>
          </div>
          {leagueSlug !== "mcaa" && leagueSlug !== "mbgl" && (
            <div style={{ textAlign: "right", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 10, padding: "10px 16px" }}>
              <div style={{ color: "#888", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Salary Cap</div>
              <div style={{ color: totalUsed > 22500 ? "#ef4444" : "#22d3ee", fontWeight: 700, fontSize: 22 }}>{(totalUsed).toLocaleString()}</div>
              <div style={{ color: "#333", fontSize: 13 }}>/ 25,000</div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", marginBottom: 20, gap: 4, flexWrap: "wrap" as const }}>
        {(isMcaa
          ? [["roster", "Roster"], ["signings", "Sign Players"], ["cut", "Cut Player"], ["portal", "Transfer Portal"]] as const
          : [["roster", "Roster & Cap"], ["signings", "Sign Players"], ["bid", `Auctions${activeAuctions.length > 0 ? ` (${activeAuctions.length})` : ""}`], ["trades", "Trades"], ["cut", "Cut Player"]] as const
        ).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t as typeof tab)} style={{ padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "none", borderBottom: `2px solid ${tab === t ? "#3b82f6" : "transparent"}`, color: tab === t ? "#fff" : "#555", transition: "color 0.15s" }}>{label}</button>
        ))}
      </div>

      {tab === "roster" && <RosterView contracts={contracts} retentions={retentions} leagueSlug={leagueSlug} />}
      {tab === "signings" && <SigningsView teamId={team.id} leagueSlug={leagueSlug} contracts={contracts} onRefresh={load} />}
      {tab === "bid" && <BidView auctions={auctions} teamId={team.id} contracts={contracts} retentions={retentions} onRefresh={load} />}
      {tab === "trades" && (
        <TradesView teamId={team.id} leagueSlug={leagueSlug} contracts={contracts} allTeams={seasonFilteredTeams} myPicks={myPicks} onRefresh={load} />
      )}
      {tab === "cut" && <CutView teamId={team.id} leagueSlug={leagueSlug} contracts={contracts} onRefresh={load} />}
      {tab === "portal" && <PortalView teamId={team.id} leagueSlug={leagueSlug} contracts={contracts} onRefresh={load} />}
    </div>
  );
}
