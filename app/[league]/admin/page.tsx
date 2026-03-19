"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { mc_uuid: string; mc_username: string; discord_id: string | null };
type Team = { id: string; league: string; name: string; abbreviation: string; division: string | null; logo_url: string | null };
type PlayerTeam = { mc_uuid: string; team_id: string; league: string; players: Player; teams: Team };
type Game = {
  id: string; league: string; scheduled_at: string;
  home_team_id: string; away_team_id: string;
  home_score: number | null; away_score: number | null;
  status: string;
  home_team: Team; away_team: Team;
};
type GameStat = {
  id: string; game_id: string; mc_uuid: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null;
  turnovers: number | null; minutes_played: number | null;
  fg_made: number | null; fg_attempted: number | null;
  three_pt_made: number | null; three_pt_attempted: number | null;
  pass_attempts: number | null; possession_time: number | null;
  players: Player;
};
type Accolade = {
  id: string; league: string; mc_uuid: string; type: string;
  season: string; description: string | null; players: Player;
};
type Article = { id: string; league: string; title: string; body: string; created_at: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const btn = "rounded-lg px-3 py-1.5 text-sm font-medium transition";
const btnPrimary = `${btn} bg-zinc-700 hover:bg-zinc-600 text-white`;
const btnDanger = `${btn} bg-red-900 hover:bg-red-800 text-red-200`;
const btnSecondary = `${btn} bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700`;
const input = "rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-zinc-500 focus:outline-none w-full";
const card = "rounded-xl border border-slate-700 bg-slate-950 p-4";

function ErrMsg({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className="mt-2 text-red-400 text-sm rounded-lg bg-red-950 border border-red-900 px-3 py-2">{msg}</p>;
}

function Avatar({ uuid, username }: { uuid: string; username: string }) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={`https://minotar.net/avatar/${username}/32`}
        alt={username}
        className="w-8 h-8 rounded ring-1 ring-slate-700 flex-shrink-0"
        onError={(e) => { (e.target as HTMLImageElement).src = `https://minotar.net/avatar/MHF_Steve/32`; }}
      />
      <span className="font-semibold text-white">{username}</span>
    </div>
  );
}

function fmtMins(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}
function parseMins(str: string): number {
  const [m, s] = (str || "0:00").split(":");
  return (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
}

// ─── PlayerSearchSelect ────────────────────────────────────────────────────────

function PlayerSearchSelect({
  players,
  value,
  onChange,
  placeholder = "Search for a player...",
  renderSuffix,
}: {
  players: Player[];
  value: string;
  onChange: (uuid: string) => void;
  placeholder?: string;
  renderSuffix?: (p: Player) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const selected = players.find((p) => p.mc_uuid === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? players.filter((p) => p.mc_username.toLowerCase().includes(query.toLowerCase()))
    : players;

  return (
    <div ref={ref} className="relative">
      {selected && !open ? (
        <button
          type="button"
          className={`${input} flex items-center gap-2 text-left`}
          onClick={() => { setQuery(""); setOpen(true); }}
        >
          <img
            src={`https://minotar.net/avatar/${selected.mc_username}/24`}
            className="w-5 h-5 rounded flex-shrink-0"
            alt=""
            onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
          />
          <span className="flex-1">{selected.mc_username}</span>
          {renderSuffix && renderSuffix(selected)}
          <span className="text-slate-500 text-xs ml-auto">▼</span>
        </button>
      ) : (
        <input
          autoFocus={open}
          className={input}
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 shadow-xl max-h-60 overflow-y-auto">
          {value && (
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-500 hover:bg-slate-800 transition border-b border-slate-800"
              onClick={() => { onChange(""); setQuery(""); setOpen(false); }}
            >
              Clear selection
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No players found</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.mc_uuid}
                type="button"
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-slate-800 transition ${p.mc_uuid === value ? "bg-slate-800" : ""}`}
                onClick={() => { onChange(p.mc_uuid); setQuery(""); setOpen(false); }}
              >
                <img
                  src={`https://minotar.net/avatar/${p.mc_username}/24`}
                  className="w-5 h-5 rounded flex-shrink-0"
                  alt=""
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/24"; }}
                />
                <span className="text-white flex-1">{p.mc_username}</span>
                {renderSuffix && renderSuffix(p)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Players ─────────────────────────────────────────────────────────────

function PlayersTab({ league }: { league: string }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [newDiscord, setNewDiscord] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");

  // Bulk paste state
  const [bulkText, setBulkText] = useState("");
  const [bulkOpen, setBulkOpen] = useState(true);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResults, setBulkResults] = useState<{ uuid: string; status: "ok" | "error"; msg: string }[]>([]);

  const refresh = useCallback(async () => {
    fetch("/api/players")
      .then((r) => r.json())
      .then((p) => setPlayers(Array.isArray(p) ? p : []))
      .catch(() => setPlayers([]));
  }, [league]);

  useEffect(() => { refresh(); }, [refresh]);

  const [newName, setNewName] = useState("");
  const [newUuidField, setNewUuidField] = useState("");
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "notfound">("idle");
  const [lookedUpUuid, setLookedUpUuid] = useState("");
  const lookupTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const lookupName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { setLookupState("idle"); setLookedUpUuid(""); return; }
    setLookupState("loading");
    try {
      const res = await fetch(`/api/mojang/${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.found) {
        setLookedUpUuid(data.uuid);
        setNewUuidField(data.uuid);
        setLookupState("found");
      } else {
        setLookedUpUuid("");
        setNewUuidField("");
        setLookupState("notfound");
      }
    } catch {
      setLookedUpUuid("");
      setNewUuidField("");
      setLookupState("notfound");
    }
  };

  const handleNameChange = (val: string) => {
    setNewName(val);
    setLookupState("idle");
    setLookedUpUuid("");
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    if (val.trim()) {
      lookupTimerRef.current = setTimeout(() => lookupName(val), 600);
    }
  };

  const addPlayer = async () => {
    if (!newName.trim()) return;
    setAdding(true); setErr("");
    let uuid = newUuidField.trim() || lookedUpUuid;
    if (!uuid) {
      const enc = new TextEncoder();
      const bytes = enc.encode(newName.trim());
      uuid = "00000000-0000-3000-8000-" + Array.from(bytes).map(b => b.toString(16).padStart(2,"0")).join("").slice(0,12).padEnd(12,"0");
    }
    const r = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mc_uuid: uuid, mc_username_override: newName.trim(), discord_id: newDiscord.trim() || null }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Failed to add player"); setAdding(false); return; }
    setNewName(""); setNewUuidField(""); setNewDiscord(""); setLookupState("idle"); setLookedUpUuid(""); setAdding(false);
    refresh();
  };

  const bulkAdd = async () => {
    const names = bulkText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return;
    setBulkRunning(true);
    setBulkResults([]);
    const results: typeof bulkResults = [];
    for (const name of names) {
      // Try Mojang lookup first
      let uuid = "";
      let foundMC = false;
      try {
        const lres = await fetch(`/api/mojang/${encodeURIComponent(name)}`);
        const ldata = await lres.json();
        if (ldata.found) { uuid = ldata.uuid; foundMC = true; }
      } catch {}
      if (!uuid) {
        const enc = new TextEncoder();
        const bytes = enc.encode(name);
        uuid = "00000000-0000-3000-8000-" + Array.from(bytes).map(b => b.toString(16).padStart(2,"0")).join("").slice(0,12).padEnd(12,"0");
      }
      const r = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mc_uuid: uuid, mc_username_override: name, discord_id: null }),
      });
      const data = await r.json();
      results.push({
        uuid: name,
        status: r.ok ? "ok" : "error",
        msg: r.ok ? `${data.mc_username ?? name}${foundMC ? " (MC found)" : " (Steve skin)"}` : (data.error ?? "Failed"),
      });
      setBulkResults([...results]);
    }
    setBulkRunning(false);
    refresh();
  };

  const deletePlayer = async (uuid: string) => {
    if (!confirm(`Delete player ${uuid}? This will remove all their stats.`)) return;
    const r = await fetch(`/api/players/${uuid}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Delete failed"); return; }
    refresh();
  };

  const deleteAllPlayers = async () => {
    if (!confirm(`Delete ALL ${players.length} players? This will remove all their stats and team assignments. This cannot be undone.`)) return;
    setErr("");
    for (const p of players) {
      const r = await fetch(`/api/players/${p.mc_uuid}`, { method: "DELETE" });
      if (!r.ok) { const d = await r.json(); setErr(d.error ?? `Failed to delete ${p.mc_username}`); return; }
    }
    refresh();
  };

  const [refreshingNames, setRefreshingNames] = useState(false);
  const [refreshResult, setRefreshResult] = useState<{ updated: number; failed: number; total: number } | null>(null);

  const refreshUsernames = async () => {
    setRefreshingNames(true);
    setRefreshResult(null);
    try {
      const r = await fetch("/api/cron/refresh-usernames", { method: "POST" });
      const data = await r.json();
      setRefreshResult(data);
      if (data.updated > 0) refresh();
    } catch {
      setRefreshResult({ updated: 0, failed: -1, total: 0 });
    }
    setRefreshingNames(false);
  };

  return (
    <div className="space-y-5">
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add Player</h3>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Skin preview */}
          <div className="flex-shrink-0 w-10 h-10 rounded ring-1 ring-slate-700 bg-slate-800 flex items-center justify-center overflow-hidden">
            {lookupState === "loading" ? (
              <span className="text-slate-500 text-xs animate-pulse">...</span>
            ) : lookupState === "found" && newName.trim() ? (
              <img
                src={`https://minotar.net/avatar/${newName.trim()}/40`}
                alt="skin"
                className="w-10 h-10"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/40"; }}
              />
            ) : (
              <img
                src="https://minotar.net/avatar/MHF_Steve/40"
                alt="Steve"
                className="w-10 h-10 opacity-40"
              />
            )}
          </div>
          <div className="flex-1 min-w-[180px] relative">
            <input
              className={`${input}`}
              placeholder="MC username or display name"
              value={newName}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlayer()}
            />
            {lookupState === "found" && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-green-400 text-xs font-medium pointer-events-none">✓ found</span>
            )}
            {lookupState === "notfound" && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">Steve skin</span>
            )}
          </div>
          <input
            className={`${input} flex-1 min-w-[260px]`}
            placeholder="UUID (auto-filled if MC account found)"
            value={newUuidField}
            onChange={(e) => { setNewUuidField(e.target.value); setLookedUpUuid(e.target.value); }}
          />
          <input
            className={`${input} w-44`}
            placeholder="Discord ID (optional)"
            value={newDiscord}
            onChange={(e) => setNewDiscord(e.target.value)}
          />
          <button className={btnPrimary} onClick={addPlayer} disabled={adding || !newName.trim() || lookupState === "loading"}>
            {adding ? "Adding..." : "Add Player"}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-2">Type a MC username — UUID auto-fills if found. If not a MC account, player is added with Steve skin.</p>
        <ErrMsg msg={err} />
      </div>

      {/* Bulk Paste Card */}
      <div className={card}>
        <button
          className="w-full flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-widest"
          onClick={() => { setBulkOpen((v) => !v); setBulkResults([]); }}
        >
          <span>Bulk Add Players by Username</span>
          <span className="text-slate-500 text-base leading-none">{bulkOpen ? "▲" : "▼"}</span>
        </button>

        {bulkOpen && (
          <div className="mt-3 space-y-3">
            <p className="text-slate-500 text-xs">Paste one username per line. Each name is looked up against Mojang — real MC accounts get their skin automatically. Unrecognized names get Steve skin.</p>
            <textarea
              className={`${input} h-36 resize-y font-mono text-xs`}
              placeholder={"Notch\nDream\nTechnoblade\n..."}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              disabled={bulkRunning}
            />
            <div className="flex items-center gap-3">
              <button
                className={btnPrimary}
                onClick={bulkAdd}
                disabled={bulkRunning || !bulkText.trim()}
              >
                {bulkRunning ? "Adding..." : "Add All"}
              </button>
              {bulkResults.length > 0 && !bulkRunning && (
                <span className="text-xs text-slate-400">
                  {bulkResults.filter((r) => r.status === "ok").length} added ·{" "}
                  {bulkResults.filter((r) => r.status === "error").length} failed
                </span>
              )}
            </div>

            {bulkResults.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800 max-h-52 overflow-y-auto">
                {bulkResults.map((r) => (
                  <div key={r.uuid} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <span className={r.status === "ok" ? "text-green-400" : "text-red-400"}>
                      {r.status === "ok" ? "✓" : "✗"}
                    </span>
                    <span className="font-mono text-slate-400 truncate flex-1">{r.uuid}</span>
                    <span className={r.status === "ok" ? "text-green-300 font-semibold" : "text-red-300"}>
                      {r.msg}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Players ({players.length})</h3>
          <div className="flex items-center gap-2">
            <button className={btnSecondary} onClick={refreshUsernames} disabled={refreshingNames} title="Re-fetch MC usernames for all players from Mojang">
              {refreshingNames ? "Refreshing..." : "Refresh Usernames"}
            </button>
            {players.length > 0 && (
              <button className={btnDanger} onClick={deleteAllPlayers}>Delete All</button>
            )}
          </div>
        </div>
        {refreshResult && (
          <p className={`text-xs mb-3 ${refreshResult.failed === -1 ? "text-red-400" : "text-slate-400"}`}>
            {refreshResult.failed === -1
              ? "Failed to refresh usernames."
              : `Refreshed ${refreshResult.total} players — ${refreshResult.updated} name${refreshResult.updated !== 1 ? "s" : ""} updated${refreshResult.failed > 0 ? `, ${refreshResult.failed} failed` : ""}.`
            }
          </p>
        )}
        {players.length === 0 ? (
          <p className="text-slate-600 text-sm">No players yet.</p>
        ) : (
          <div className="space-y-2">
            {players.map((p) => (
              <div key={p.mc_uuid} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 hover:border-slate-700 transition">
                <Avatar uuid={p.mc_uuid} username={p.mc_username} />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button className={btnDanger} onClick={() => deletePlayer(p.mc_uuid)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Teams ───────────────────────────────────────────────────────────────

function TeamLogoAdmin({ team }: { team: Team }) {
  if (team.logo_url) {
    return <img src={team.logo_url} alt={team.abbreviation} className="w-9 h-9 rounded object-contain border border-slate-700 flex-shrink-0" />;
  }
  return (
    <div className="w-9 h-9 rounded bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
      <span className="text-xs font-bold text-slate-400">{team.abbreviation}</span>
    </div>
  );
}

function TeamsTab({ league, season: initialSeason }: { league: string; season: string }) {
  const SEASONS = ["Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7"];
  const [season, setSeason] = useState(
    SEASONS.includes(initialSeason) ? initialSeason : SEASONS[SEASONS.length - 1]
  );
  const [teams, setTeams] = useState<Team[]>([]);
  const [newName, setNewName] = useState("");
  const [newAbbr, setNewAbbr] = useState("");
  const [newDivision, setNewDivision] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAbbr, setEditAbbr] = useState("");
  const [editDivision, setEditDivision] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkParsed, setBulkParsed] = useState<{ name: string; abbr: string; division: string }[] | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [err, setErr] = useState("");
  const [records, setRecords] = useState<Record<string, { wins: number; losses: number }>>({});
  const [recordInputs, setRecordInputs] = useState<Record<string, { wins: string; losses: string }>>({});
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [playerTeams, setPlayerTeams] = useState<{ mc_uuid: string; team_id: string; players: Player }[]>([]);
  const [addingToTeam, setAddingToTeam] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [teamsData, recData, playersData, ptData] = await Promise.all([
      fetch(`/api/teams?league=${league}&season=${encodeURIComponent(season)}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/teams/records?league=${league}&season=${encodeURIComponent(season)}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/players`).then((r) => r.json()).catch(() => []),
      fetch(`/api/teams/players?league=${league}&season=${encodeURIComponent(season)}`).then((r) => r.json()).catch(() => []),
    ]);
    setTeams(Array.isArray(teamsData) ? teamsData : []);
    if (Array.isArray(recData)) {
      const map: Record<string, { wins: number; losses: number }> = {};
      for (const rec of recData) map[rec.team_id] = { wins: rec.wins, losses: rec.losses };
      setRecords(map);
    }
    setAllPlayers(Array.isArray(playersData) ? playersData : []);
    setPlayerTeams(Array.isArray(ptData) ? ptData : []);
  }, [league, season]);

  useEffect(() => { refresh(); }, [refresh]);

  const addTeam = async () => {
    if (!newName.trim() || !newAbbr.trim()) { setErr("Name and abbreviation are required."); return; }
    setErr("");
    const r = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, name: newName.trim(), abbreviation: newAbbr.trim().toUpperCase(), division: newDivision || null, season }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Failed to add team"); return; }
    setNewName(""); setNewAbbr(""); setNewDivision(""); refresh();
  };

  const saveEdit = async (id: string) => {
    const r = await fetch(`/api/teams/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, abbreviation: editAbbr.toUpperCase(), division: editDivision || null }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Failed to save"); return; }
    setEditing(null); refresh();
  };

  const deleteTeam = async (id: string) => {
    if (!confirm("Delete this team? Players will become unassigned.")) return;
    const r = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Delete failed"); return; }
    refresh();
  };

  const saveRecord = async (teamId: string) => {
    const inp = recordInputs[teamId];
    if (!inp) return;
    const wins = parseInt(inp.wins) || 0;
    const losses = parseInt(inp.losses) || 0;
    const r = await fetch("/api/teams/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, league, wins, losses }),
    });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Record save failed"); return; }
    setRecords((prev) => ({ ...prev, [teamId]: { wins, losses } }));
    setRecordInputs((prev) => { const n = { ...prev }; delete n[teamId]; return n; });
  };

  const addToTeam = async (teamId: string) => {
    const uuid = addingToTeam[teamId];
    if (!uuid) return;
    const r = await fetch("/api/teams/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mc_uuid: uuid, team_id: teamId, league, season }),
    });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Failed to add player to team"); return; }
    setAddingToTeam((prev) => { const n = { ...prev }; delete n[teamId]; return n; });
    refresh();
  };

  const removeFromTeam = async (uuid: string) => {
    const params = new URLSearchParams({ mc_uuid: uuid, league, season });
    const r = await fetch(`/api/teams/players?${params}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Failed to remove player"); return; }
    refresh();
  };

  const uploadLogo = async (teamId: string, file: File) => {
    setUploadingLogo(teamId);
    const ext = file.name.split(".").pop() ?? "png";
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = (e.target?.result as string).split(",")[1];
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const r = await fetch("/api/teams/logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, base64, mime: file.type, ext }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Logo upload failed"); }
    setUploadingLogo(null);
    refresh();
  };

  const parseBulk = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const result: { name: string; abbr: string; division: string }[] = [];
    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length < 2) continue;
      const name = parts[0];
      const abbr = parts[1].toUpperCase();
      const division = parts[2] ?? "";
      if (name && abbr) result.push({ name, abbr, division });
    }
    setBulkParsed(result);
  };

  const runBulkImport = async () => {
    if (!bulkParsed?.length) return;
    setBulkImporting(true); setErr("");
    for (const t of bulkParsed) {
      const r = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league, name: t.name, abbreviation: t.abbr, division: t.division || null, season }),
      });
      if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Import failed"); setBulkImporting(false); return; }
    }
    setBulkImporting(false); setBulkText(""); setBulkParsed(null); setShowBulk(false);
    refresh();
  };

  return (
    <div className="space-y-5">
      {/* Bulk Import */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Bulk Import Teams</h3>
          <button className={btnSecondary} onClick={() => { setShowBulk(!showBulk); setBulkParsed(null); }}>
            {showBulk ? "Cancel" : "Paste Teams"}
          </button>
        </div>
        {showBulk && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">One team per line: <span className="font-mono text-slate-400">Name, ABV, Division</span> (Division optional: East or West)</p>
            <textarea
              className={`${input} h-36 font-mono text-xs resize-y`}
              placeholder={"Miami Falcons, MIA, East\nLA Lakers, LAL, West\nChicago Bulls, CHI"}
              value={bulkText}
              onChange={(e) => { setBulkText(e.target.value); setBulkParsed(null); }}
            />
            <button className={btnPrimary} onClick={parseBulk} disabled={!bulkText.trim()}>Preview Import</button>
            {bulkParsed && (
              <div className="mt-2 space-y-2">
                {bulkParsed.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
                    <span className="font-semibold text-white">{t.name}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-400">{t.abbr}</span>
                    {t.division && <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${t.division === "East" ? "bg-orange-950 text-orange-400" : "bg-blue-950 text-blue-400"}`}>{t.division}</span>}
                  </div>
                ))}
                <button className={btnPrimary} onClick={runBulkImport} disabled={bulkImporting || !bulkParsed.length}>
                  {bulkImporting ? "Importing..." : `Import ${bulkParsed.length} Teams`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Single Team */}
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add Team</h3>
        <div className="flex gap-2 flex-wrap">
          <input className={`${input} flex-1 min-w-[160px]`} placeholder="Team name (e.g. Miami Falcons)" value={newName} onChange={(e) => { setNewName(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && addTeam()} />
          <input className={`${input} w-24`} placeholder="ABV" value={newAbbr} onChange={(e) => { setNewAbbr(e.target.value); setErr(""); }} maxLength={5} />
          <select className={`${input} w-32`} value={newDivision} onChange={(e) => setNewDivision(e.target.value)}>
            <option value="">No Division</option>
            <option value="East">East</option>
            <option value="West">West</option>
          </select>
          <button className={btnPrimary} onClick={addTeam}>Add Team</button>
        </div>
        <ErrMsg msg={err} />
      </div>

      {/* Teams List */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Teams ({teams.length}) — {season}</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Season:</label>
            <select
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white focus:border-zinc-500 focus:outline-none"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {teams.length === 0 ? (
          <p className="text-slate-600 text-sm">No teams yet.</p>
        ) : (
          <div className="space-y-2">
            {teams.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 hover:border-slate-700 transition">
                {editing === t.id ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input className={`${input} flex-1 min-w-[140px]`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <input className={`${input} w-24`} value={editAbbr} onChange={(e) => setEditAbbr(e.target.value)} maxLength={5} />
                    <select className={`${input} w-32`} value={editDivision} onChange={(e) => setEditDivision(e.target.value)}>
                      <option value="">No Division</option>
                      <option value="East">East</option>
                      <option value="West">West</option>
                    </select>
                    <button className={btnPrimary} onClick={() => saveEdit(t.id)}>Save</button>
                    <button className={btnSecondary} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <TeamLogoAdmin team={t} />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white">{t.name}</span>
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-400">{t.abbreviation}</span>
                            {t.division && (
                              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${t.division === "East" ? "bg-orange-950 text-orange-400" : "bg-blue-950 text-blue-400"}`}>{t.division}</span>
                            )}
                          </div>
                          {t.logo_url && <p className="text-xs text-slate-600 mt-0.5">Logo uploaded</p>}
                        </div>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                      {/* W/L Record */}
                      {recordInputs[t.id] ? (
                        <div className="flex items-center gap-1">
                          <input
                            className="w-10 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-center text-white focus:outline-none"
                            value={recordInputs[t.id].wins}
                            onChange={(e) => setRecordInputs((prev) => ({ ...prev, [t.id]: { ...prev[t.id], wins: e.target.value } }))}
                            placeholder="W"
                          />
                          <span className="text-slate-500 text-xs font-bold">-</span>
                          <input
                            className="w-10 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-xs text-center text-white focus:outline-none"
                            value={recordInputs[t.id].losses}
                            onChange={(e) => setRecordInputs((prev) => ({ ...prev, [t.id]: { ...prev[t.id], losses: e.target.value } }))}
                            placeholder="L"
                          />
                          <button className={btnPrimary} onClick={() => saveRecord(t.id)} style={{ padding: "4px 10px", fontSize: "12px" }}>Save</button>
                          <button className={btnSecondary} onClick={() => setRecordInputs((prev) => { const n = { ...prev }; delete n[t.id]; return n; })} style={{ padding: "4px 8px", fontSize: "12px" }}>✕</button>
                        </div>
                      ) : (
                        <button
                          className={`${btnSecondary} text-xs`}
                          onClick={() => setRecordInputs((prev) => ({ ...prev, [t.id]: { wins: String(records[t.id]?.wins ?? 0), losses: String(records[t.id]?.losses ?? 0) } }))}
                        >
                          {records[t.id] != null ? `${records[t.id].wins}-${records[t.id].losses}` : "Set W-L"}
                        </button>
                      )}
                      {/* Logo upload */}
                      <label className={`${btnSecondary} cursor-pointer`}>
                        {uploadingLogo === t.id ? "Uploading..." : "Upload Logo"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingLogo === t.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadLogo(t.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                        <button className={btnSecondary} onClick={() => { setEditing(t.id); setEditName(t.name); setEditAbbr(t.abbreviation); setEditDivision(t.division ?? ""); setErr(""); }}>Edit</button>
                        <button className={btnDanger} onClick={() => deleteTeam(t.id)}>Delete</button>
                      </div>
                    </div>
                    {/* Roster */}
                    {(() => {
                      const roster = playerTeams.filter((pt) => pt.team_id === t.id);
                      const assigned = new Set(playerTeams.map((pt) => pt.mc_uuid));
                      const unassigned = allPlayers.filter((p) => !assigned.has(p.mc_uuid));
                      return (
                        <div className="mt-3 pt-3 border-t border-slate-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Roster ({roster.length})</span>
                          </div>
                          {roster.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {roster.map((pt) => (
                                <div key={pt.mc_uuid} className="flex items-center gap-1.5 rounded-full bg-slate-800 border border-slate-700 pl-1 pr-2 py-0.5">
                                  <img
                                    src={`https://minotar.net/avatar/${pt.players?.mc_username ?? "MHF_Steve"}/20`}
                                    alt={pt.players?.mc_username}
                                    className="w-5 h-5 rounded-full flex-shrink-0"
                                    onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }}
                                  />
                                  <span className="text-xs text-white">{pt.players?.mc_username}</span>
                                  <button
                                    className="text-slate-500 hover:text-red-400 transition text-xs leading-none ml-0.5"
                                    onClick={() => removeFromTeam(pt.mc_uuid)}
                                    title="Remove from team"
                                  >✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <PlayerSearchSelect
                              players={unassigned}
                              value={addingToTeam[t.id] ?? ""}
                              onChange={(uuid) => setAddingToTeam((prev) => ({ ...prev, [t.id]: uuid }))}
                              placeholder="Add player..."
                            />
                            <button
                              className={btnPrimary}
                              onClick={() => addToTeam(t.id)}
                              disabled={!addingToTeam[t.id]}
                              style={{ whiteSpace: "nowrap" }}
                            >Add</button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Schedule parser helpers ──────────────────────────────────────────────────

const DAY_OFFSETS: Record<string, number> = {
  monday: -3, tuesday: -2, wednesday: -1,
  thursday: 0, friday: 1, saturday: 2, sunday: 3,
};

function parseScheduleText(text: string) {
  const results: Array<{ week: number; day: string; time: string; home: string; away: string }> = [];
  const sections = text.split(/Week\s+(\d+)/i);
  for (let i = 1; i < sections.length; i += 2) {
    const weekNum = parseInt(sections[i]);
    const lines = (sections[i + 1] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    let currentDay = "Thursday";
    let currentTime = "7:00 PM";
    for (const line of lines) {
      // Update current day if line starts with a day name
      const dayM = line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i);
      if (dayM) currentDay = dayM[1];
      // Update current time if line contains a time
      const timeM = line.match(/(\d+:\d+\s*[AP]M)/i);
      if (timeM) currentTime = timeM[1].trim();
      // Parse "Team A vs Team B"
      const vsM = line.match(/^(.+?)\s+vs\s+(.+)$/i);
      if (vsM) {
        let home = vsM[1]
          .replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+/i, "")
          .replace(/\d+:\d+\s*[AP]M\s*/i, "")
          .trim();
        const away = vsM[2].trim();
        if (home && away) results.push({ week: weekNum, day: currentDay, time: currentTime, home, away });
      }
    }
  }
  return results;
}

function buildGameDate(startThursday: string, weekNum: number, day: string, timeStr: string): string {
  const base = new Date(startThursday + "T00:00:00");
  const offset = (weekNum - 1) * 7 + (DAY_OFFSETS[day.toLowerCase()] ?? 0);
  base.setDate(base.getDate() + offset);
  const tm = timeStr.match(/(\d+):(\d+)\s*([AP]M)/i);
  if (tm) {
    let h = parseInt(tm[1]); const min = parseInt(tm[2]); const ap = tm[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    base.setHours(h, min, 0, 0);
  }
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
}

function matchTeam(teams: Team[], name: string): Team | undefined {
  const n = name.toLowerCase().trim();
  return (
    teams.find((t) => t.name.toLowerCase() === n) ||
    teams.find((t) => t.name.toLowerCase().endsWith(n)) ||
    teams.find((t) => t.name.toLowerCase().includes(n)) ||
    teams.find((t) => n.includes(t.name.toLowerCase())) ||
    teams.find((t) => t.abbreviation.toLowerCase() === n)
  );
}

type ParsedGame = { week: number; day: string; time: string; home: string; away: string; homeTeam?: Team; awayTeam?: Team; date: string };

// ─── Tab: Schedule ────────────────────────────────────────────────────────────

function ScheduleTab({ league, season }: { league: string; season: string }) {
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newHome, setNewHome] = useState("");
  const [newAway, setNewAway] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState("");
  const [awayScore, setAwayScore] = useState("");
  const [err, setErr] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importStart, setImportStart] = useState("");
  const [parsed, setParsed] = useState<ParsedGame[] | null>(null);
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(async () => {
    const [g, t] = await Promise.all([
      fetch(`/api/games?league=${league}&season=${encodeURIComponent(season)}`).then((r) => r.json()),
      fetch(`/api/teams?league=${league}`).then((r) => r.json()),
    ]);
    setGames(Array.isArray(g) ? g : []);
    setTeams(Array.isArray(t) ? t : []);
  }, [league, season]);

  useEffect(() => { refresh(); }, [refresh]);

  const addGame = async () => {
    if (!newDate || !newHome || !newAway) { setErr("All fields are required."); return; }
    setErr("");
    const r = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, scheduled_at: newDate, home_team_id: newHome, away_team_id: newAway, season }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Failed to add game"); return; }
    setNewDate(""); setNewHome(""); setNewAway(""); refresh();
  };

  const markCompleted = async (id: string) => {
    if (!homeScore || !awayScore) { setErr("Both scores are required."); return; }
    setErr("");
    const r = await fetch(`/api/games/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", home_score: parseInt(homeScore), away_score: parseInt(awayScore) }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Failed to save score"); return; }
    setCompletingId(null); setHomeScore(""); setAwayScore(""); refresh();
  };

  const deleteGame = async (id: string) => {
    if (!confirm("Delete this game? Box scores will also be deleted.")) return;
    const r = await fetch(`/api/games/${id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Delete failed"); return; }
    refresh();
  };

  const parseImport = () => {
    if (!importText.trim() || !importStart) return;
    const raw = parseScheduleText(importText);
    setParsed(raw.map((g) => ({
      ...g,
      date: buildGameDate(importStart, g.week, g.day, g.time),
      homeTeam: matchTeam(teams, g.home),
      awayTeam: matchTeam(teams, g.away),
    })));
  };

  const runImport = async () => {
    if (!parsed) return;
    const valid = parsed.filter((g) => g.homeTeam && g.awayTeam);
    if (!valid.length) return;
    setImporting(true); setErr("");
    for (const g of valid) {
      const r = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ league, scheduled_at: g.date, home_team_id: g.homeTeam!.id, away_team_id: g.awayTeam!.id, season }),
      });
      if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Import failed"); setImporting(false); return; }
    }
    setImporting(false); setImportText(""); setImportStart(""); setParsed(null); setShowImport(false);
    refresh();
  };

  const grouped = games.reduce<Record<string, Game[]>>((acc, g) => {
    const d = new Date(g.scheduled_at);
    const dow = d.getDay();
    const daysToThu = dow >= 4 ? dow - 4 : dow + 3;
    const thu = new Date(d); thu.setDate(d.getDate() - daysToThu);
    const key = thu.toISOString().slice(0, 10);
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {});
  const weekKeys = Object.keys(grouped).sort();

  return (
    <div className="space-y-5">
      <ErrMsg msg={err} />

      {/* Bulk Import */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Bulk Import from Text</h3>
          <button className={btnSecondary} onClick={() => { setShowImport(!showImport); setParsed(null); }}>
            {showImport ? "Cancel" : "Paste Schedule"}
          </button>
        </div>
        {showImport && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Week 1 Thursday Date</label>
              <input type="date" className={`${input} w-48`} value={importStart} onChange={(e) => setImportStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Paste full schedule here</label>
              <textarea
                className={`${input} h-48 font-mono text-xs resize-y`}
                placeholder={"Week 1\nThursday7:30 PMFalcons vs Wolves\n..."}
                value={importText}
                onChange={(e) => { setImportText(e.target.value); setParsed(null); }}
              />
            </div>
            <button className={btnPrimary} onClick={parseImport} disabled={!importText.trim() || !importStart}>Parse Schedule</button>
            {parsed && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-300">
                    <span className="font-bold text-white">{parsed.length}</span> games ·{" "}
                    <span className="text-green-400">{parsed.filter(g => g.homeTeam && g.awayTeam).length} matched</span>
                    {parsed.filter(g => !g.homeTeam || !g.awayTeam).length > 0 && (
                      <span className="text-red-400 ml-1">· {parsed.filter(g => !g.homeTeam || !g.awayTeam).length} unmatched</span>
                    )}
                  </span>
                  <button className={btnPrimary} onClick={runImport} disabled={importing || !parsed.filter(g => g.homeTeam && g.awayTeam).length}>
                    {importing ? "Importing..." : `Import ${parsed.filter(g => g.homeTeam && g.awayTeam).length} Games`}
                  </button>
                </div>
                {Array.from(new Set(parsed.map(g => g.week))).sort((a,b) => a-b).map(week => (
                  <div key={week} className="mb-3">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1">Week {week}</div>
                    <div className="space-y-1">
                      {parsed.filter(g => g.week === week).map((g, i) => (
                        <div key={i} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${g.homeTeam && g.awayTeam ? "bg-slate-900 border border-slate-800" : "bg-red-950 border border-red-900"}`}>
                          <span className="text-slate-500 w-28 flex-shrink-0">{g.day} {g.time}</span>
                          <span className={g.homeTeam ? "text-white font-semibold" : "text-red-400 font-semibold"}>{g.homeTeam ? g.homeTeam.name : `⚠ ${g.home}`}</span>
                          <span className="text-slate-500">vs</span>
                          <span className={g.awayTeam ? "text-white font-semibold" : "text-red-400 font-semibold"}>{g.awayTeam ? g.awayTeam.name : `⚠ ${g.away}`}</span>
                          <span className="text-slate-600 text-xs ml-auto">{new Date(g.date).toLocaleDateString(undefined, {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Single game */}
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add Single Game</h3>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-slate-500 mb-1">Date & Time</label>
            <input type="datetime-local" className={input} value={newDate} onChange={(e) => { setNewDate(e.target.value); setErr(""); }} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-slate-500 mb-1">Home Team</label>
            <select className={input} value={newHome} onChange={(e) => { setNewHome(e.target.value); setErr(""); }}>
              <option value="">Select...</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs text-slate-500 mb-1">Away Team</label>
            <select className={input} value={newAway} onChange={(e) => { setNewAway(e.target.value); setErr(""); }}>
              <option value="">Select...</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button className={`${btnPrimary} self-end`} onClick={addGame}>Schedule</button>
        </div>
      </div>

      {/* Games list */}
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">All Games ({games.length})</h3>
        {games.length === 0 ? (
          <p className="text-slate-600 text-sm">No games yet.</p>
        ) : (
          <div className="space-y-5">
            {weekKeys.map((wk, wi) => (
              <div key={wk}>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Week {wi + 1}</div>
                <div className="space-y-2">
                  {grouped[wk].sort((a,b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()).map((g) => (
                    <div key={g.id} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 hover:border-slate-700 transition">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-semibold text-white">{g.home_team?.name ?? "?"} vs {g.away_team?.name ?? "?"}</span>
                          <span className="text-slate-500 text-xs">{new Date(g.scheduled_at).toLocaleString(undefined, {weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                          {g.status === "completed" && <span className="font-bold text-green-400">{g.home_score} – {g.away_score}</span>}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${g.status === "completed" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>{g.status === "completed" ? "Final" : "Scheduled"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {g.status !== "completed" && (
                            <button className={btnSecondary} onClick={() => { setCompletingId(completingId === g.id ? null : g.id); setErr(""); }}>
                              {completingId === g.id ? "Cancel" : "Enter Score"}
                            </button>
                          )}
                          <button className={btnDanger} onClick={() => deleteGame(g.id)}>Delete</button>
                        </div>
                      </div>
                      {completingId === g.id && (
                        <div className="mt-3 flex gap-2 items-center flex-wrap">
                          <input className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white focus:border-zinc-500 focus:outline-none w-28" type="number" placeholder={`${g.home_team?.abbreviation} score`} value={homeScore} onChange={(e) => setHomeScore(e.target.value)} />
                          <span className="text-slate-400">–</span>
                          <input className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-white focus:border-zinc-500 focus:outline-none w-28" type="number" placeholder={`${g.away_team?.abbreviation} score`} value={awayScore} onChange={(e) => setAwayScore(e.target.value)} />
                          <button className={btnPrimary} onClick={() => markCompleted(g.id)}>Save</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat block parser ────────────────────────────────────────────────────────

type ParsedStat = { name: string; matched: Player | null; fields: Record<string, string> };

function parseStatBlock(text: string, players: Player[]): ParsedStat[] {
  const results: ParsedStat[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("===") || line.startsWith("//")) continue;
    if (!line.includes("|")) continue;
    const parts = line.split("|").map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;

    let fields: Record<string, string>;

    if (/\bPTS\b/i.test(line)) {
      // Labeled format: "PlayerName | MIN 0:14 | PTS 2 | FG 1/2 | 3FG 1/3 | OREB 0 | ..."
      const ext = (pat: RegExp) => line.match(pat)?.[1] ?? "";
      const fgM = line.match(/\bFG\s+(\d+)\/(\d+)/i);
      const tfgM = line.match(/\b3FG\s+(\d+)\/(\d+)/i);
      fields = {
        minutes_played: ext(/\bMIN\s+(\d+:\d+)/i),
        points: ext(/\bPTS\s+(\d+)/i),
        fg: fgM ? `${fgM[1]}/${fgM[2]}` : "",
        three_fg: tfgM ? `${tfgM[1]}/${tfgM[2]}` : "",
        assists: ext(/\bAST(?:\/PASS)?\s+(\d+)/i),
        rebounds_off: ext(/\bOREB\s+(\d+)/i),
        rebounds_def: ext(/\bDREB\s+(\d+)/i),
        steals: ext(/\bSTL\s+(\d+)/i),
        blocks: ext(/\bBLK\s+(\d+)/i),
        turnovers: ext(/\bTOV\s+(\d+)/i),
        pass_attempts: ext(/\bPASS\s+(\d+)/i),
        possession_time: ext(/\bPOSS\s+(\d+)/i),
      };
    } else {
      // Positional format: "Name | Min | PTS | FGM/FGA | 3PM/3PA | ORB | DRB | AST | STL | BLK | TOV"
      const hasTwoShotCols = parts.length > 10;
      const offset = hasTwoShotCols ? 1 : 0;
      fields = {
        minutes_played: parts[1] ?? "",
        points: parts[2] ?? "",
        fg: parts[3] ?? "",
        three_fg: hasTwoShotCols ? (parts[4] ?? "") : "",
        rebounds_off: parts[4 + offset] ?? "",
        rebounds_def: parts[5 + offset] ?? "",
        assists: parts[6 + offset] ?? "",
        steals: parts[7 + offset] ?? "",
        blocks: parts[8 + offset] ?? "",
        turnovers: parts[9 + offset] ?? "",
      };
    }

    const n = name.toLowerCase().trim();
    const matched =
      players.find((p) => p.mc_uuid === name.trim()) ??
      players.find((p) => p.mc_uuid.toLowerCase() === n) ??
      players.find((p) => p.mc_username.toLowerCase() === n) ??
      players.find((p) => p.mc_username.toLowerCase().includes(n)) ??
      players.find((p) => n.includes(p.mc_username.toLowerCase())) ??
      null;

    results.push({ name, matched, fields });
  }
  return results;
}

// ─── Tab: Box Scores ──────────────────────────────────────────────────────────

function BoxScoresTab({ league, season }: { league: string; season: string }) {
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [statForm, setStatForm] = useState<Record<string, Record<string, string>>>({});
  const [activeUuids, setActiveUuids] = useState<string[]>([]); // uuids shown in table
  const [addUuid, setAddUuid] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState<ParsedStat[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/games?league=${league}`).then((r) => r.json()),
      fetch("/api/players").then((r) => r.json()),
    ]).then(([g, p]) => {
      setGames(Array.isArray(g) ? g.filter((x: Game) => x.status === "completed") : []);
      setPlayers(Array.isArray(p) ? p : []);
    });
  }, [league]);

  useEffect(() => {
    if (!selectedGameId) return;
    setActiveUuids([]);
    setAddUuid("");
    fetch(`/api/game-stats?game_id=${selectedGameId}`)
      .then((r) => r.json())
      .then((data) => {
        const form: Record<string, Record<string, string>> = {};
        const fmtSlash = (m: number | null, a: number | null) =>
          m === null && a === null ? "" : `${m ?? 0}/${a ?? 0}`;
        const rows = (Array.isArray(data) ? data : []) as GameStat[];
        for (const s of rows) {
          form[s.mc_uuid] = {
            points: s.points === null ? "" : String(s.points),
            rebounds_off: s.rebounds_off === null ? "" : String(s.rebounds_off),
            rebounds_def: s.rebounds_def === null ? "" : String(s.rebounds_def),
            assists: s.assists === null ? "" : String(s.assists),
            steals: s.steals === null ? "" : String(s.steals),
            blocks: s.blocks === null ? "" : String(s.blocks),
            turnovers: s.turnovers === null ? "" : String(s.turnovers),
            minutes_played: s.minutes_played === null ? "" : fmtMins(s.minutes_played),
            fg: fmtSlash(s.fg_made, s.fg_attempted),
            three_fg: fmtSlash(s.three_pt_made, s.three_pt_attempted),
            pass_attempts: s.pass_attempts === null ? "" : String(s.pass_attempts),
            possession_time: s.possession_time === null ? "" : String(s.possession_time),
          };
        }
        setStatForm(form);
        setActiveUuids(rows.map(s => s.mc_uuid));
      });
  }, [selectedGameId]);

  const setField = (uuid: string, field: string, val: string) =>
    setStatForm((prev) => ({ ...prev, [uuid]: { ...(prev[uuid] ?? {}), [field]: val } }));

  const saveStats = async () => {
    setSaving(true); setErr("");
    const ni = (s: string | undefined) => (s === undefined || s.trim() === "") ? null : (parseInt(s) || 0);
    const nm = (s: string | undefined) => (s === undefined || s.trim() === "") ? null : parseMins(s);
    const parseSlash = (s: string | undefined): [number | null, number | null] => {
      if (!s || s.trim() === "") return [null, null];
      const [m, a] = s.split("/");
      const mi = parseInt(m); const ai = parseInt(a);
      return [isNaN(mi) ? null : mi, isNaN(ai) ? null : ai];
    };
    for (const [uuid, fields] of Object.entries(statForm)) {
      const [fgMade, fgAtt] = parseSlash(fields.fg);
      const [tpMade, tpAtt] = parseSlash(fields.three_fg);
      const r = await fetch("/api/game-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_id: selectedGameId, mc_uuid: uuid,
          points: ni(fields.points), rebounds_off: ni(fields.rebounds_off),
          rebounds_def: ni(fields.rebounds_def), assists: ni(fields.assists),
          steals: ni(fields.steals), blocks: ni(fields.blocks),
          turnovers: ni(fields.turnovers), minutes_played: nm(fields.minutes_played),
          fg_made: fgMade, fg_attempted: fgAtt,
          three_pt_made: tpMade, three_pt_attempted: tpAtt,
          pass_attempts: ni(fields.pass_attempts),
          possession_time: ni(fields.possession_time),
        }),
      });
      if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Save failed"); setSaving(false); return; }
    }
    setSaving(false);
    alert("Box scores saved!");
  };

  const statCols = ["points","rebounds_off","rebounds_def","assists","steals","blocks","turnovers","minutes_played","fg","three_fg","pass_attempts","possession_time"] as const;
  const colLabels: Record<string, string> = { points:"PTS", rebounds_off:"ORB", rebounds_def:"DRB", assists:"AST", steals:"STL", blocks:"BLK", turnovers:"TO", minutes_played:"MIN", fg:"FG", three_fg:"3FG", pass_attempts:"PASS", possession_time:"POSS" };

  const applyPastePreview = () => {
    if (!pastePreview) return;
    const newUuids: string[] = [];
    for (const entry of pastePreview) {
      if (!entry.matched) continue;
      setStatForm((prev) => ({ ...prev, [entry.matched!.mc_uuid]: entry.fields }));
      newUuids.push(entry.matched.mc_uuid);
    }
    setActiveUuids(prev => {
      const merged = [...prev];
      for (const u of newUuids) if (!merged.includes(u)) merged.push(u);
      return merged;
    });
    setShowPaste(false);
    setPasteText("");
    setPastePreview(null);
  };

  return (
    <div className="space-y-5">
      <ErrMsg msg={err} />
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Select Completed Game</h3>
        <select className={input} value={selectedGameId} onChange={(e) => { setSelectedGameId(e.target.value); setShowPaste(false); setPastePreview(null); }}>
          <option value="">Choose a game...</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>{g.home_team?.abbreviation} {g.home_score}–{g.away_score} {g.away_team?.abbreviation} · {new Date(g.scheduled_at).toLocaleDateString()}</option>
          ))}
        </select>
        {games.length === 0 && <p className="mt-2 text-slate-600 text-sm">No completed games yet. Mark games as completed in the Schedule tab.</p>}
      </div>

      {selectedGameId && (
        <>
          {/* Paste Stats panel */}
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Paste Stats</h3>
                {!showPaste && <p className="text-xs text-slate-600 mt-0.5">Paste your stat block to auto-fill the form</p>}
              </div>
              <button className={btnSecondary} onClick={() => { setShowPaste(!showPaste); setPastePreview(null); }}>
                {showPaste ? "Cancel" : "Paste Stats"}
              </button>
            </div>
            {showPaste && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-400 font-mono space-y-0.5">
                  <div className="text-slate-300 mb-1 font-semibold not-italic" style={{fontFamily:'inherit'}}>Use player names — they'll be matched to your playerbase automatically. All stats are optional:</div>
                  <div>Notch | 0:14 | 2 | 1/2 | 1/3 | 0 | 0 | 3 | 0 | 0 | 1</div>
                  <div className="text-slate-600 mt-1">— or labeled format —</div>
                  <div>Notch | MIN 0:14 | PTS 2 | FG 1/2 | 3FG 1/3 | OREB 0 | DREB 0 | AST 3 | STL 0 | BLK 0 | TOV 1</div>
                  <div className="text-slate-600 mt-1">Order (positional): Name | MIN | PTS | FGM/FGA | 3PM/3PA | ORB | DRB | AST | STL | BLK | TOV</div>
                </div>
                <textarea
                  className={`${input} h-44 font-mono text-xs resize-y`}
                  placeholder="Paste your stat block here..."
                  value={pasteText}
                  onChange={(e) => { setPasteText(e.target.value); setPastePreview(null); }}
                />
                <button className={btnPrimary} onClick={() => setPastePreview(parseStatBlock(pasteText, players))} disabled={!pasteText.trim()}>
                  Parse Stats
                </button>
                {pastePreview && (
                  <div className="space-y-2 mt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">
                        <span className="text-green-400 font-semibold">{pastePreview.filter(e => e.matched).length} matched</span>
                        {pastePreview.filter(e => !e.matched).length > 0 && (
                          <span className="text-red-400 ml-2">{pastePreview.filter(e => !e.matched).length} unmatched</span>
                        )}
                      </span>
                      <button className={btnPrimary} onClick={applyPastePreview} disabled={!pastePreview.some(e => e.matched)}>
                        Apply to Form
                      </button>
                    </div>
                    {pastePreview.map((entry, i) => (
                      <div key={i} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm ${entry.matched ? "border-slate-800 bg-slate-900" : "border-red-900 bg-red-950"}`}>
                        {entry.matched ? (
                          <>
                            <img src={`https://minotar.net/avatar/${entry.matched.mc_username}/24`} className="w-6 h-6 rounded" alt="" />
                            <span className="text-green-400 font-semibold">{entry.matched.mc_username}</span>
                            <span className="text-slate-600 text-xs">← {entry.name}</span>
                          </>
                        ) : (
                          <span className="text-red-400 font-semibold">⚠ {entry.name} — no match found</span>
                        )}
                        <span className="ml-auto text-xs text-slate-600 font-mono">
                          {entry.fields.points || "—"}pts {entry.fields.fg || "—"}fg {entry.fields.three_fg || "—"}3fg {entry.fields.minutes_played || "—"}min
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats table */}
          <div className={`${card} overflow-x-auto`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Player Stats
                <span className="ml-2 text-slate-600 normal-case font-normal">{activeUuids.length} player{activeUuids.length !== 1 ? "s" : ""}</span>
              </h3>
              <button className={btnPrimary} onClick={saveStats} disabled={saving}>{saving ? "Saving..." : "Save All"}</button>
            </div>

            {/* Add player row */}
            <div className="flex items-center gap-2 mb-4">
              <select
                className={`${input} flex-1`}
                value={addUuid}
                onChange={e => setAddUuid(e.target.value)}
              >
                <option value="">+ Add player to this game...</option>
                {players
                  .filter(p => !activeUuids.includes(p.mc_uuid))
                  .map(p => <option key={p.mc_uuid} value={p.mc_uuid}>{p.mc_username}</option>)}
              </select>
              <button
                className={btnSecondary}
                disabled={!addUuid}
                onClick={() => {
                  if (!addUuid) return;
                  setActiveUuids(prev => [...prev, addUuid]);
                  setStatForm(prev => ({ ...prev, [addUuid]: prev[addUuid] ?? {} }));
                  setAddUuid("");
                }}
              >Add</button>
            </div>

            {activeUuids.length === 0 ? (
              <p className="text-slate-600 text-sm">No stats entered yet. Add players above or paste a stat block.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-3 py-2 text-left text-xs text-slate-400 uppercase tracking-widest">Player</th>
                    {statCols.map((c) => <th key={c} className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest whitespace-nowrap">{colLabels[c]}</th>)}
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {activeUuids.map((uuid) => {
                    const p = players.find(pl => pl.mc_uuid === uuid);
                    if (!p) return null;
                    return (
                      <tr key={uuid} className="hover:bg-slate-900/60 transition">
                        <td className="px-3 py-2 whitespace-nowrap"><Avatar uuid={p.mc_uuid} username={p.mc_username} /></td>
                        {statCols.map((c) => (
                          <td key={c} className="px-1 py-1">
                            <input
                              className={`rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-sm text-white focus:border-zinc-500 focus:outline-none text-center ${c === "fg" || c === "three_fg" ? "w-16" : c === "minutes_played" ? "w-14" : "w-12"}`}
                              placeholder={c === "minutes_played" ? "0:00" : c === "fg" || c === "three_fg" ? "0/0" : ""}
                              value={statForm[uuid]?.[c] ?? ""}
                              onChange={(e) => setField(uuid, c, e.target.value)}
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button
                            className="text-slate-600 hover:text-red-400 text-xs px-1 transition"
                            title="Remove from list"
                            onClick={() => setActiveUuids(prev => prev.filter(u => u !== uuid))}
                          >✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab: Accolades ───────────────────────────────────────────────────────────

function AccoladesTab({ league, season: initialSeason }: { league: string; season: string }) {
  const [accolades, setAccolades] = useState<Accolade[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayer, setNewPlayer] = useState("");
  const [newType, setNewType] = useState("");
  const [newSeason, setNewSeason] = useState(initialSeason);
  const [newDesc, setNewDesc] = useState("");
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    const [a, p] = await Promise.all([
      fetch(`/api/accolades?league=${league}`).then((r) => r.json()),
      fetch("/api/players").then((r) => r.json()),
    ]);
    setAccolades(Array.isArray(a) ? a : []);
    setPlayers(Array.isArray(p) ? p : []);
  }, [league]);

  useEffect(() => { refresh(); }, [refresh]);

  const addAccolade = async () => {
    if (!newPlayer || !newType || !newSeason) { setErr("Player, type, and season are required."); return; }
    setErr("");
    const r = await fetch("/api/accolades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, mc_uuid: newPlayer, type: newType, season: newSeason, description: newDesc || null }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Failed to add accolade"); return; }
    setNewPlayer(""); setNewType(""); setNewSeason(""); setNewDesc(""); refresh();
  };

  const deleteAccolade = async (id: string) => {
    if (!confirm("Delete this accolade?")) return;
    const r = await fetch(`/api/accolades/${id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Delete failed"); return; }
    refresh();
  };

  return (
    <div className="space-y-5">
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Add Accolade</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div><label className="block text-xs text-slate-500 mb-1">Player</label>
            <PlayerSearchSelect players={players} value={newPlayer} onChange={(uuid) => { setNewPlayer(uuid); setErr(""); }} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Award Type</label>
            <input className={input} placeholder="MVP, All-Star, etc." value={newType} onChange={(e) => { setNewType(e.target.value); setErr(""); }} /></div>
          <div><label className="block text-xs text-slate-500 mb-1">Season</label>
            <select className={input} value={newSeason} onChange={(e) => { setNewSeason(e.target.value); setErr(""); }}>
              <option value="">Select season...</option>
              {["Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select></div>
          <div><label className="block text-xs text-slate-500 mb-1">Description (optional)</label>
            <input className={input} placeholder="Additional notes" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} /></div>
        </div>
        <button className={`${btnPrimary} mt-3`} onClick={addAccolade}>Add Accolade</button>
        <ErrMsg msg={err} />
      </div>
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Accolades ({accolades.length})</h3>
        {accolades.length === 0 ? <p className="text-slate-600 text-sm">No accolades yet.</p> : (
          <div className="space-y-2">
            {accolades.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 hover:border-slate-700 transition">
                <div className="flex items-center gap-3">
                  <Avatar uuid={a.mc_uuid} username={(a as any).players?.mc_username ?? a.mc_uuid} />
                  <div>
                    <span className="font-semibold text-zinc-300">{a.type}</span>
                    <span className="ml-2 text-slate-400 text-sm">{a.season}</span>
                    {a.description && <span className="ml-2 text-slate-500 text-sm">— {a.description}</span>}
                  </div>
                </div>
                <button className={btnDanger} onClick={() => deleteAccolade(a.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Champions ───────────────────────────────────────────────────────────

const REGULAR_SEASONS = ["Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7"];

function ChampionsTab({ league, season: initialSeason }: { league: string; season: string }) {
  const [season, setSeason] = useState(
    REGULAR_SEASONS.includes(initialSeason) ? initialSeason : REGULAR_SEASONS[REGULAR_SEASONS.length - 1]
  );
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [champions, setChampions] = useState<Accolade[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const refreshTeams = useCallback(() => {
    fetch(`/api/teams?league=${league}&season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((d) => { setTeams(Array.isArray(d) ? d : []); setSelectedTeam(""); });
  }, [league, season]);

  const refreshChampions = useCallback(() => {
    fetch(`/api/accolades/champion?league=${league}`)
      .then((r) => r.json())
      .then((d) => setChampions(Array.isArray(d) ? d : []));
  }, [league]);

  useEffect(() => { refreshTeams(); }, [refreshTeams]);
  useEffect(() => { refreshChampions(); }, [refreshChampions]);

  const setChampion = async () => {
    if (!selectedTeam) { setErr("Select a team first."); return; }
    setSaving(true); setErr("");
    const r = await fetch("/api/accolades/champion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, season, team_id: selectedTeam }),
    });
    const data = await r.json();
    setSaving(false);
    if (!r.ok) { setErr(data.error ?? "Failed"); return; }
    refreshChampions();
  };

  const removeChampions = async (s: string) => {
    if (!confirm(`Remove all Finals Champion rings for ${s}?`)) return;
    const r = await fetch(`/api/accolades/champion?league=${league}&season=${encodeURIComponent(s)}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Delete failed"); return; }
    refreshChampions();
  };

  // Group champions by season
  const bySeason: Record<string, Accolade[]> = {};
  for (const c of champions) {
    if (!bySeason[c.season]) bySeason[c.season] = [];
    bySeason[c.season].push(c);
  }

  return (
    <div className="space-y-5">
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Set Finals Champions</h3>
        <p className="text-slate-500 text-sm mb-3">Select the season and winning team. All players on that team will receive a Finals Champion ring visible on their player card.</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Season</label>
            <select className={input} style={{ width: "auto" }} value={season} onChange={(e) => setSeason(e.target.value)}>
              {REGULAR_SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">Champion Team</label>
            <select className={input} value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
              <option value="">Select team...</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
            </select>
          </div>
          <button className={btnPrimary} onClick={setChampion} disabled={saving}>
            {saving ? "Saving..." : "🏆 Set Champions"}
          </button>
        </div>
        <ErrMsg msg={err} />
      </div>

      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Finals Champions by Season</h3>
        {Object.keys(bySeason).length === 0 ? (
          <p className="text-slate-600 text-sm">No champions set yet.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(bySeason).sort(([a], [b]) => b.localeCompare(a)).map(([s, players]) => (
              <div key={s}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-yellow-400">🏆 {s} Champions</span>
                  <button className={btnDanger} onClick={() => removeChampions(s)}>Remove</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {players.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 rounded-full bg-yellow-950 border border-yellow-800 px-3 py-1 text-xs text-yellow-300">
                      <img
                        src={`https://crafatar.com/avatars/${p.mc_uuid}?size=16&default=MHF_Steve&overlay`}
                        className="w-4 h-4 rounded-full"
                        alt=""
                      />
                      <span>{(p as any).players?.mc_username ?? p.mc_uuid}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Articles ────────────────────────────────────────────────────────────

function ArticlesTab({ league }: { league: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [err, setErr] = useState("");
  const [posting, setPosting] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetch(`/api/articles?league=${league}`).then((r) => r.json());
    setArticles(Array.isArray(data) ? data : []);
  }, [league]);

  useEffect(() => { refresh(); }, [refresh]);

  const addArticle = async () => {
    if (!newTitle.trim() || !newBody.trim()) { setErr("Title and body are required."); return; }
    setErr(""); setPosting(true);
    const r = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, title: newTitle.trim(), body: newBody.trim() }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Failed to post"); setPosting(false); return; }
    setNewTitle(""); setNewBody(""); setPosting(false); refresh();
  };

  const deleteArticle = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const r = await fetch(`/api/articles/${id}`, { method: "DELETE" });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Delete failed"); return; }
    refresh();
  };

  return (
    <div className="space-y-5">
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Post Announcement</h3>
        <div className="space-y-2">
          <input className={input} placeholder="Title" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); setErr(""); }} />
          <textarea className={`${input} h-28 resize-y`} placeholder="Write your announcement here..." value={newBody} onChange={(e) => { setNewBody(e.target.value); setErr(""); }} />
        </div>
        <button className={`${btnPrimary} mt-3`} onClick={addArticle} disabled={posting}>{posting ? "Posting..." : "Post"}</button>
        <ErrMsg msg={err} />
      </div>

      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Announcements ({articles.length})</h3>
        {articles.length === 0 ? <p className="text-slate-600 text-sm">No announcements yet.</p> : (
          <div className="space-y-2">
            {articles.map((a) => (
              <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 hover:border-slate-700 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{a.title}</span>
                      <span className="text-slate-500 text-xs">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="mt-1 text-slate-400 text-sm line-clamp-2">{a.body}</p>
                  </div>
                  <button className={btnDanger} onClick={() => deleteArticle(a.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Stats (read-only) ───────────────────────────────────────────────────

function StatsViewTab({ league, season: initialSeason }: { league: string; season: string }) {
  const seasonNum = parseInt(initialSeason.replace(/\D/g, "")) || 0;
  const isS5Plus = seasonNum >= 5;
  const STAT_FIELDS = [
    { key: "gp",       label: "GP",   hint: "Games Played",       slash: false },
    { key: "pts",      label: "PTS",  hint: "Total Points",        slash: false },
    ...(isS5Plus ? [
      { key: "oreb", label: "OREB", hint: "Total Off. Rebounds",  slash: false },
      { key: "dreb", label: "DREB", hint: "Total Def. Rebounds",  slash: false },
    ] : [
      { key: "reb",  label: "REB",  hint: "Total Rebounds",       slash: false },
    ]),
    { key: "ast",      label: "AST",  hint: "Total Assists",       slash: false },
    { key: "stl",      label: "STL",  hint: "Total Steals",        slash: false },
    { key: "blk",      label: "BLK",  hint: "Total Blocks",        slash: false },
    { key: "to_total", label: "TO",   hint: "Total Turnovers",     slash: false },
    { key: "fg",       label: "FG%",  hint: "14/25 or just 46.7", slash: false },
    { key: "three_fg", label: "3FG%", hint: "5/12 or just 44.9",  slash: false },
    { key: "pass_total",  label: "PASS", hint: "Total Pass Attempts",      slash: false },
    { key: "poss_total",  label: "POSS", hint: "Total Possession Seconds", slash: false },
  ];

  const [players, setPlayers] = useState<Player[]>([]);
  const [allStats, setAllStats] = useState<Record<string, any>>({});
  const [selectedUuid, setSelectedUuid] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [savedPlayers, setSavedPlayers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [loadedFgPct, setLoadedFgPct] = useState<number | null>(null);
  const [loadedThreePct, setLoadedThreePct] = useState<number | null>(null);
  const [loadedThreeMade, setLoadedThreeMade] = useState<number | null>(null);
  const [loadedTopg, setLoadedTopg] = useState<number | null>(null);
  const [loadedPassPg, setLoadedPassPg] = useState<number | null>(null);
  const [loadedPossPg, setLoadedPossPg] = useState<number | null>(null);

  const refreshAllStats = useCallback(() => {
    fetch(`/api/stats?league=${league}&season=${encodeURIComponent(initialSeason)}`)
      .then(r => r.json())
      .then(data => {
        const map: Record<string, any> = {};
        for (const row of (Array.isArray(data) ? data : [])) map[row.mc_uuid] = row;
        setAllStats(map);
      }).catch(() => {});
  }, [league, initialSeason]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/players").then(r => r.json()),
    ]).then(([p]) => {
      setPlayers(Array.isArray(p) ? p : []);
      setLoading(false);
    }).catch(() => setLoading(false));
    refreshAllStats();
  }, [league, refreshAllStats]);

  // Convert a stats row into form field values
  const applyStatsRow = useCallback((row: any) => {
    if (!row || !row.mc_uuid) return;
    const gp = parseInt(String(row.gp ?? 0)) || 0;
    const round = (v: number) => Math.round(v);
    const tpMade = row.three_pt_made ?? null;
    const tpPct  = row.three_pt_pct  ?? null;
    const tpAtt  = (tpMade != null && tpPct != null && tpPct > 0)
      ? Math.round(tpMade * 100 / tpPct) : null;
    setLoadedFgPct(row.fg_pct ?? null);
    setLoadedThreePct(row.three_pt_pct ?? null);
    setLoadedThreeMade(row.three_pt_made ?? null);
    setLoadedTopg(row.topg ?? null);
    setLoadedPassPg(row.pass_attempts_pg ?? null);
    setLoadedPossPg(row.possession_time_pg ?? null);
    setHasExisting(true);
    setFields({
      gp:   String(row.gp ?? ""),
      pts:  gp ? String(round((row.ppg ?? 0) * gp)) : "",
      reb:  gp && !row.orpg ? String(round((row.rpg ?? 0) * gp)) : "",
      oreb: gp && row.orpg != null ? String(round(row.orpg * gp)) : "",
      dreb: gp && row.drpg != null ? String(round(row.drpg * gp)) : "",
      ast:  gp ? String(round((row.apg ?? 0) * gp)) : "",
      stl:  gp ? String(round((row.spg ?? 0) * gp)) : "",
      blk:  gp ? String(round((row.bpg ?? 0) * gp)) : "",
      fg:        row.fg_pct != null ? String(row.fg_pct) : "",
      three_fg:  tpMade != null && tpAtt != null ? `${tpMade}/${tpAtt}` : row.three_pt_pct != null ? String(row.three_pt_pct) : "",
      to_total:  gp && row.topg != null ? String(round(row.topg * gp)) : "",
      pass_total: gp && row.pass_attempts_pg != null ? String(round(row.pass_attempts_pg * gp)) : "",
      poss_total: gp && row.possession_time_pg != null ? String(Math.round(row.possession_time_pg * gp)) : "",
    });
  }, []);

  // When player is selected, pre-fill from cached allStats immediately, then
  // also fetch their exact season-specific row for accurate season data
  useEffect(() => {
    if (!selectedUuid) return;
    setFields({});
    setHasExisting(false);
    setLoadedFgPct(null); setLoadedThreePct(null); setLoadedThreeMade(null);
    setLoadedTopg(null); setLoadedPassPg(null); setLoadedPossPg(null);

    // Immediate pre-fill from cached overview stats so form isn't blank
    if (allStats[selectedUuid]) applyStatsRow(allStats[selectedUuid]);

    // Then fetch season-specific row (for accurate season-level save)
    fetch(`/api/stats?league=${league}&season=${encodeURIComponent(initialSeason)}&mc_uuid=${selectedUuid}`)
      .then((r) => r.json())
      .then((data) => {
        const row = Array.isArray(data) ? data[0] : data;
        if (row && row.mc_uuid) applyStatsRow(row);
      })
      .catch(() => {});
  }, [selectedUuid, league, initialSeason, allStats, applyStatsRow]);

  const deletePlayer = async () => {
    if (!selectedUuid) return;
    setDeleting(true); setErr("");
    const r = await fetch(`/api/stats?league=${encodeURIComponent(league)}&mc_uuid=${selectedUuid}&season=${encodeURIComponent(initialSeason)}`, { method: "DELETE" });
    setDeleting(false);
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Delete failed"); return; }
    setFields({});
    setHasExisting(false);
    setLoadedFgPct(null); setLoadedThreePct(null); setLoadedThreeMade(null);
    setLoadedTopg(null); setLoadedPassPg(null); setLoadedPossPg(null);
    setSavedPlayers((prev) => { const s = new Set(prev); s.delete(selectedUuid); return s; });
    refreshAllStats();
  };

  const parseSlash = (s: string): [number | null, number | null] => {
    if (!s || !s.trim()) return [null, null];
    const parts = s.split("/").map((x) => x.trim());
    if (parts.length === 2) {
      const m = parseFloat(parts[0]);
      const a = parseFloat(parts[1]);
      return [isNaN(m) ? null : m, isNaN(a) ? null : a];
    }
    return [null, null];
  };

  const savePlayer = async () => {
    if (!selectedUuid) return;
    setSaving(true); setErr("");
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const gp   = fields.gp   ? parseInt(fields.gp)    || null : null;
    const pts  = fields.pts  ? parseFloat(fields.pts)  || null : null;
    const oreb = fields.oreb ? parseFloat(fields.oreb) || null : null;
    const dreb = fields.dreb ? parseFloat(fields.dreb) || null : null;
    const reb  = fields.reb  ? parseFloat(fields.reb)  || null : null;
    const ast  = fields.ast  ? parseFloat(fields.ast)  || null : null;
    const stl  = fields.stl  ? parseFloat(fields.stl)  || null : null;
    const blk  = fields.blk  ? parseFloat(fields.blk)  || null : null;
    const ppg  = gp && pts  ? r1(pts  / gp) : null;
    const orpg = gp && oreb != null ? r1(oreb / gp) : null;
    const drpg = gp && dreb != null ? r1(dreb / gp) : null;
    // For S5+: rpg = orpg + drpg; for earlier seasons: from reb field
    const rpg  = orpg != null && drpg != null ? r1(orpg + drpg)
               : gp && reb ? r1(reb / gp) : null;
    const apg  = gp && ast ? r1(ast / gp) : null;
    const spg  = gp && stl ? r1(stl / gp) : null;
    const bpg  = gp && blk ? r1(blk / gp) : null;
    // FG%: accept "14/25" slash OR direct "46.7" percentage
    const parseShooting = (s: string): { pct: number | null; made: number | null } => {
      if (!s?.trim()) return { pct: null, made: null };
      if (s.includes("/")) {
        const [m, a] = parseSlash(s);
        if (m !== null && a !== null && a > 0) return { pct: Math.round(m / a * 1000) / 10, made: m };
        return { pct: null, made: null };
      }
      const pct = parseFloat(s);
      return { pct: isNaN(pct) ? null : pct, made: null };
    };
    const { pct: fgPctParsed } = parseShooting(fields.fg ?? "");
    const { pct: tpPctParsed, made: tpMadeParsed } = parseShooting(fields.three_fg ?? "");
    const fg_pct        = fgPctParsed  !== null ? fgPctParsed  : loadedFgPct;
    const three_pt_pct  = tpPctParsed  !== null ? tpPctParsed  : loadedThreePct;
    const three_pt_made = tpMadeParsed !== null ? tpMadeParsed : loadedThreeMade;
    const to_total  = fields.to_total?.trim()   ? parseFloat(fields.to_total)  || null : null;
    const pass_tot  = fields.pass_total?.trim() ? parseFloat(fields.pass_total) || null : null;
    const poss_tot  = fields.poss_total?.trim() ? parseInt(fields.poss_total)   || null : null;
    const topg             = (gp && to_total != null) ? r1(to_total / gp) : loadedTopg;
    const pass_attempts_pg = (gp && pass_tot != null) ? r1(pass_tot / gp) : loadedPassPg;
    const possession_time_pg = (gp && poss_tot != null) ? Math.round(poss_tot / gp) : loadedPossPg;
    const r = await fetch(`/api/stats?league=${encodeURIComponent(league)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league, season: initialSeason, mc_uuid: selectedUuid,
        gp, ppg, rpg, orpg, drpg, apg, spg, bpg, fg_pct, three_pt_made, three_pt_pct,
        topg, pass_attempts_pg, possession_time_pg,
      }),
    });
    setSaving(false);
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Save failed"); return; }
    setSaved(true);
    setSavedPlayers((prev) => new Set([...prev, selectedUuid]));
    setTimeout(() => setSaved(false), 2000);
    refreshAllStats();
  };

  const selectedPlayer = players.find((p) => p.mc_uuid === selectedUuid);

  if (loading) return <div className={`${card} text-slate-500 text-sm`}>Loading...</div>;

  const playersWithStats = players.filter(p => allStats[p.mc_uuid]);
  const fmt1 = (v: number | null | undefined) => v != null ? v.toFixed(1) : "—";
  const fmtPct = (v: number | null | undefined) => v != null && v > 0 ? `${v.toFixed(1)}%` : "—";

  return (
    <div className="space-y-4">
      {/* All-players overview table */}
      <div className={`${card} overflow-x-auto`}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            All Stats — {initialSeason}
            <span className="ml-2 text-slate-600 normal-case font-normal">{playersWithStats.length} player{playersWithStats.length !== 1 ? "s" : ""} · click a row to edit</span>
          </h3>
        </div>
        {playersWithStats.length === 0 ? (
          <p className="text-slate-600 text-sm">No stats saved for this season yet.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="px-3 py-2 text-left text-xs text-slate-400 uppercase tracking-widest">Player</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">GP</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">PPG</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">RPG</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">APG</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">SPG</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">BPG</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">FG%</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">3PM</th>
                <th className="px-2 py-2 text-center text-xs text-slate-400 uppercase tracking-widest">3P%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {playersWithStats.map(p => {
                const s = allStats[p.mc_uuid];
                const isSelected = selectedUuid === p.mc_uuid;
                return (
                  <tr
                    key={p.mc_uuid}
                    onClick={() => { setSelectedUuid(p.mc_uuid); setErr(""); setSaved(false); setTimeout(() => document.getElementById("stats-edit-form")?.scrollIntoView({ behavior: "smooth" }), 50); }}
                    className={`cursor-pointer transition ${isSelected ? "bg-zinc-800/60 border-l-2 border-zinc-500" : "hover:bg-slate-800/60"} ${savedPlayers.has(p.mc_uuid) ? "opacity-70" : ""}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <img src={`https://minotar.net/avatar/${p.mc_username}/20`} className="w-5 h-5 rounded" onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }} />
                        <span className="text-white font-medium">{p.mc_username}</span>
                        {savedPlayers.has(p.mc_uuid) && <span className="text-green-400 text-xs">✓</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-300">{s.gp ?? "—"}</td>
                    <td className="px-2 py-2 text-center text-slate-300">{fmt1(s.ppg)}</td>
                    <td className="px-2 py-2 text-center text-slate-300">{fmt1(s.rpg)}</td>
                    <td className="px-2 py-2 text-center text-slate-300">{fmt1(s.apg)}</td>
                    <td className="px-2 py-2 text-center text-slate-300">{fmt1(s.spg)}</td>
                    <td className="px-2 py-2 text-center text-slate-300">{fmt1(s.bpg)}</td>
                    <td className="px-2 py-2 text-center text-slate-300">{fmtPct(s.fg_pct)}</td>
                    <td className="px-2 py-2 text-center text-slate-300">{s.three_pt_made ?? "—"}</td>
                    <td className={`px-2 py-2 text-center font-medium ${s.three_pt_pct != null && (s.three_pt_pct < 0 || s.three_pt_pct > 100) ? "text-red-400" : "text-slate-300"}`}>
                      {fmtPct(s.three_pt_pct)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Player picker */}
      <div id="stats-edit-form" className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          Add / Edit Player Stats — {initialSeason}
        </h3>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">Select Player</label>
            <PlayerSearchSelect
              players={players}
              value={selectedUuid}
              onChange={(uuid) => { setSelectedUuid(uuid); setErr(""); setSaved(false); }}
              placeholder="Search for a player..."
              renderSuffix={(p) => savedPlayers.has(p.mc_uuid) ? <span className="text-green-400 text-xs">✓</span> : null}
            />
          </div>
        </div>
      </div>

      {/* Stat entry form */}
      {selectedPlayer && (
        <div className={card}>
          <div className="flex items-center gap-3 mb-5">
            <img
              src={`https://minotar.net/avatar/${selectedPlayer.mc_username}/40`}
              alt={selectedPlayer.mc_username}
              className="w-10 h-10 rounded ring-1 ring-slate-700"
              onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/40"; }}
            />
            <div>
              <div className="font-bold text-white text-lg">{selectedPlayer.mc_username}</div>
              <div className="text-xs text-slate-500">{initialSeason}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-5">
            {STAT_FIELDS.map(({ key, label, hint, slash }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
                  {label} <span className="text-slate-600 normal-case font-normal">— {hint}</span>
                </label>
                <input
                  className={input}
                  placeholder={slash ? "0/0" : "0"}
                  value={fields[key] ?? ""}
                  onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button className={btnPrimary} onClick={savePlayer} disabled={saving}>
              {saving ? "Saving..." : saved ? "✓ Saved" : `Save ${selectedPlayer.mc_username}'s Stats`}
            </button>
            <button className={btnSecondary} onClick={() => { setFields({}); setSaved(false); }}>
              Clear
            </button>
            {hasExisting && (
              <button className={btnDanger} onClick={deletePlayer} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete Stats"}
              </button>
            )}
          </div>
          <ErrMsg msg={err} />
        </div>
      )}

      {/* Summary of who has stats saved */}
      {savedPlayers.size > 0 && (
        <div className={card}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Saved This Session</h3>
          <div className="flex flex-wrap gap-2">
            {[...savedPlayers].map((uuid) => {
              const p = players.find((x) => x.mc_uuid === uuid);
              return p ? (
                <div key={uuid} className="flex items-center gap-1.5 rounded-full bg-green-950 border border-green-800 px-3 py-1 text-xs text-green-300">
                  <span>✓</span>
                  <span>{p.mc_username}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Playoffs ────────────────────────────────────────────────────────────

type BracketMatchup = {
  id: string; round_name: string; round_order: number; matchup_index: number;
  team1_id: string | null; team2_id: string | null;
  team1_score: number | null; team2_score: number | null;
  winner_id: string | null;
  team1?: { id: string; name: string; abbreviation: string } | null;
  team2?: { id: string; name: string; abbreviation: string } | null;
};

const ROUND_NAMES_FROM_END = ["Finals","Semifinals","Quarterfinals","Round of 16","Round of 32","Round of 64"];
const CONF_NAMES_FROM_END  = ["Conf. Finals","Conf. Semifinals","First Round","Round of 16","Round of 32","Round of 64"];

function buildRawCounts(n: number): number[] {
  const counts: number[] = [];
  let t = n;
  while (t >= 2) { const mc = Math.ceil(t / 2); counts.push(mc); t = mc; }
  return counts;
}

function getRoundStructure(n: number): { name: string; order: number; matchupCount: number }[] {
  const counts = buildRawCounts(n);
  return counts.map((mc, i) => ({
    matchupCount: mc,
    order: i,
    name: ROUND_NAMES_FROM_END[counts.length - 1 - i] ?? `Round ${i + 1}`,
  }));
}

function getConfRoundStructure(n: number, confName: string): { name: string; order: number; matchupCount: number }[] {
  const counts = buildRawCounts(n);
  return counts.map((mc, i) => ({
    matchupCount: mc,
    order: i,
    name: `${confName} — ${CONF_NAMES_FROM_END[counts.length - 1 - i] ?? `Round ${i + 1}`}`,
  }));
}

function PlayoffsTab({ league, season }: { league: string; season: string }) {
  const [matchups, setMatchups] = useState<BracketMatchup[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [numTeams, setNumTeams] = useState("8");
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [useConferences, setUseConferences] = useState(false);
  const [conferences, setConferences] = useState([
    { name: "East", teams: "4" },
    { name: "West", teams: "4" },
  ]);

  const refresh = useCallback(async () => {
    const [m, t] = await Promise.all([
      fetch(`/api/playoff-brackets?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`).then(r => r.json()),
      fetch(`/api/teams?league=${league}&season=${encodeURIComponent(season)}`).then(r => r.json()),
    ]);
    setMatchups(Array.isArray(m) ? m : []);
    setTeams(Array.isArray(t) ? t : []);
  }, [league, season]);

  useEffect(() => { refresh(); }, [refresh]);

  const upsert = async (payload: object) => {
    const r = await fetch("/api/playoff-brackets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) { const d = await r.json(); setErr(d.error ?? "Save failed"); return false; }
    return true;
  };

  const generateBracket = async () => {
    if (matchups.length > 0 && !confirm(`This will overwrite the existing bracket for ${season}. Continue?`)) return;
    setGenerating(true); setErr("");

    if (useConferences) {
      // Validate conferences
      for (const c of conferences) {
        const n = parseInt(c.teams);
        if (isNaN(n) || n < 1) { setErr(`Invalid team count for "${c.name}"`); setGenerating(false); return; }
      }
      let maxConfRounds = 0;
      for (const c of conferences) {
        const n = parseInt(c.teams);
        const rounds = getConfRoundStructure(n, c.name);
        maxConfRounds = Math.max(maxConfRounds, rounds.length);
        for (const rnd of rounds) {
          for (let i = 0; i < rnd.matchupCount; i++) {
            const ok = await upsert({ league, season, round_name: rnd.name, round_order: rnd.order, matchup_index: i });
            if (!ok) { setGenerating(false); return; }
          }
        }
      }
      // Finals matchup between conference winners
      await upsert({ league, season, round_name: "Finals", round_order: maxConfRounds, matchup_index: 0 });
    } else {
      const n = parseInt(numTeams);
      if (isNaN(n) || n < 2 || n > 128) { setErr("Enter a number between 2 and 128"); setGenerating(false); return; }
      const rounds = getRoundStructure(n);
      for (const rnd of rounds) {
        for (let i = 0; i < rnd.matchupCount; i++) {
          const ok = await upsert({ league, season, round_name: rnd.name, round_order: rnd.order, matchup_index: i });
          if (!ok) { setGenerating(false); return; }
        }
      }
    }

    setGenerating(false);
    refresh();
  };

  const clearBracket = async () => {
    if (!confirm(`Delete the entire bracket for ${season}? This cannot be undone.`)) return;
    setClearing(true); setErr("");
    for (const m of matchups) {
      await fetch(`/api/playoff-brackets?id=${m.id}`, { method: "DELETE" });
    }
    setClearing(false);
    refresh();
  };

  const updateMatchup = async (m: BracketMatchup, patch: object) => {
    setSaving(m.id); setErr("");
    await upsert({
      league, season,
      round_name: m.round_name, round_order: m.round_order, matchup_index: m.matchup_index,
      team1_id: m.team1_id, team2_id: m.team2_id,
      team1_score: m.team1_score, team2_score: m.team2_score, winner_id: m.winner_id,
      ...patch,
    });
    setSaving(null);
    refresh();
  };

  // Group matchups by round
  const rounds: { name: string; order: number; matchups: BracketMatchup[] }[] = [];
  for (const m of matchups) {
    let rnd = rounds.find(r => r.name === m.round_name);
    if (!rnd) { rnd = { name: m.round_name, order: m.round_order, matchups: [] }; rounds.push(rnd); }
    rnd.matchups.push(m);
  }
  rounds.sort((a, b) => a.order - b.order);
  for (const rnd of rounds) rnd.matchups.sort((a, b) => a.matchup_index - b.matchup_index);

  return (
    <div className="space-y-5">
      <ErrMsg msg={err} />

      {/* Generate / Clear header */}
      <div className={card}>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
          {matchups.length === 0 ? "Generate Bracket" : "Bracket"} — {season}
        </h3>

        {/* Conference toggle */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setUseConferences(false)}
            className={`px-3 py-1.5 rounded-l-lg border text-sm font-medium transition ${!useConferences ? "bg-zinc-700 border-zinc-600 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"}`}
          >
            Single Bracket
          </button>
          <button
            onClick={() => setUseConferences(true)}
            className={`px-3 py-1.5 rounded-r-lg border-t border-r border-b text-sm font-medium transition ${useConferences ? "bg-zinc-700 border-zinc-600 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"}`}
          >
            With Conferences
          </button>
        </div>

        {!useConferences ? (
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Number of Teams</label>
              <div className="flex gap-1 flex-wrap">
                {["4","6","8","16"].map(n => (
                  <button key={n} onClick={() => setNumTeams(n)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition border ${numTeams === n ? "bg-zinc-700 border-zinc-600 text-white" : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"}`}>
                    {n}
                  </button>
                ))}
                <input
                  className={`${input} w-20`} type="number" min="2" max="128" placeholder="Other"
                  value={["4","6","8","16"].includes(numTeams) ? "" : numTeams}
                  onChange={(e) => setNumTeams(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            <label className="block text-xs text-slate-500">Conferences</label>
            {conferences.map((c, ci) => (
              <div key={ci} className="flex items-center gap-2">
                <input
                  className={`${input} flex-1`} placeholder="Conference name (e.g. East)"
                  value={c.name}
                  onChange={e => setConferences(prev => prev.map((x, i) => i === ci ? { ...x, name: e.target.value } : x))}
                />
                <input
                  className={`${input} w-24`} type="number" min="1" placeholder="Teams"
                  value={c.teams}
                  onChange={e => setConferences(prev => prev.map((x, i) => i === ci ? { ...x, teams: e.target.value } : x))}
                />
                {conferences.length > 2 && (
                  <button className={`${btnDanger} text-xs px-2 py-1`} onClick={() => setConferences(prev => prev.filter((_, i) => i !== ci))}>✕</button>
                )}
              </div>
            ))}
            <button
              className={`${btn} text-xs`}
              onClick={() => setConferences(prev => [...prev, { name: `Conference ${prev.length + 1}`, teams: "4" }])}
            >
              + Add Conference
            </button>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button className={btnPrimary} onClick={generateBracket} disabled={generating}>
            {generating ? "Generating..." : matchups.length > 0 ? "↻ Regenerate" : "Generate Bracket"}
          </button>
          {matchups.length > 0 && (
            <button className={btnDanger} onClick={clearBracket} disabled={clearing}>
              {clearing ? "Clearing..." : "Clear Bracket"}
            </button>
          )}
        </div>
        {matchups.length === 0 && (
          <p className="text-xs text-slate-500 mt-3">
            {useConferences
              ? "Set conference names + team counts → Generate → pick teams in each slot."
              : "Choose the number of teams → Generate → pick which team goes in each slot."}
          </p>
        )}
      </div>

      {/* Rounds */}
      {rounds.map((round) => (
        <div key={round.name} className={card}>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
            🏀 {round.name}
          </h3>
          <div className="space-y-3">
            {round.matchups.map((m) => {
              const t1 = m.team1 ?? teams.find(t => t.id === m.team1_id) ?? null;
              const t2 = m.team2 ?? teams.find(t => t.id === m.team2_id) ?? null;
              return (
                <div key={m.id} className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
                  {/* Team rows */}
                  {([{ side: "team1", teamData: t1, scoreKey: "team1_score" as const, idKey: "team1_id" as const },
                     { side: "team2", teamData: t2, scoreKey: "team2_score" as const, idKey: "team2_id" as const }] as const).map(({ side, teamData, scoreKey, idKey }, rowIdx) => {
                    const isWinner = m.winner_id && teamData?.id === m.winner_id;
                    return (
                      <div key={side} className={`flex items-center gap-3 px-4 py-3 ${rowIdx === 0 ? "border-b border-slate-800" : ""} ${isWinner ? "bg-green-950/30" : ""}`}>
                        {/* Logo/abbr */}
                        <div className="w-7 h-7 rounded flex-shrink-0 overflow-hidden flex items-center justify-center bg-slate-800 text-[10px] font-bold text-slate-400">
                          {(teamData as Team | null)?.logo_url
                            ? <img src={(teamData as Team).logo_url!} className="w-full h-full object-contain" alt="" />
                            : (teamData?.abbreviation?.[0] ?? "?")}
                        </div>
                        {/* Team picker */}
                        <select
                          className="flex-1 rounded border border-slate-700 bg-slate-800 text-sm text-white px-2 py-1 focus:border-zinc-500 focus:outline-none"
                          value={m[idKey] ?? ""}
                          onChange={(e) => updateMatchup(m, { [idKey]: e.target.value || null })}
                        >
                          <option value="">— TBD —</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
                        </select>
                        {/* Score */}
                        <input
                          type="number" min="0" placeholder="—"
                          className="w-16 rounded border border-slate-700 bg-slate-800 text-sm text-white px-2 py-1 text-center focus:border-zinc-500 focus:outline-none"
                          value={m[scoreKey] ?? ""}
                          onChange={(e) => updateMatchup(m, { [scoreKey]: e.target.value !== "" ? parseInt(e.target.value) : null })}
                        />
                        {/* Trophy / win button */}
                        {teamData && (
                          <button
                            title={isWinner ? "Clear winner" : "Set as winner"}
                            className={`text-lg transition ${isWinner ? "opacity-100" : "opacity-20 hover:opacity-60"}`}
                            onClick={() => updateMatchup(m, { winner_id: isWinner ? null : teamData.id })}
                            disabled={saving === m.id}
                          >
                            🏆
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

const TABS = ["Players", "Teams", "Schedule", "Box Scores", "Accolades", "Champions", "Articles", "Stats", "Playoffs"] as const;
type Tab = typeof TABS[number];
const SEASONS = ["Season 1","Season 1 Playoffs","Season 2","Season 2 Playoffs","Season 3","Season 3 Playoffs","Season 4","Season 4 Playoffs","Season 5","Season 5 Playoffs","Season 6","Season 6 Playoffs","Season 7","Season 7 Playoffs"];

export default function AdminPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const league = resolved.league ?? "";

  const { data: session, status } = useSession();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Players");
  const [dbError, setDbError] = useState("");
  const [season, setSeason] = useState("Season 7");

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/admin/check")
        .then((r) => r.json())
        .then((data) => setAuthorized(data.authorized));
    }
  }, [status]);

  useEffect(() => {
    if (!league) return;
    fetch(`/api/teams?league=${league}`)
      .then((r) => {
        if (!r.ok) setDbError("Database unreachable — make sure your Supabase project is active at supabase.com and tables have been created.");
        else setDbError("");
      })
      .catch(() => setDbError("Database unreachable — make sure your Supabase project is active at supabase.com and tables have been created."));
  }, [league]);

  if (status === "loading") return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">Loading...</div>;

  if (status !== "authenticated") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Admin Login</h2>
          <p className="text-slate-400 text-sm mt-0.5">Sign in with Discord to access admin tools.</p>
        </div>
        <div className="p-8">
          <button className={`${btnPrimary} text-base px-6 py-3`} onClick={() => signIn("discord")}>Sign in with Discord</button>
        </div>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800"><h2 className="text-2xl font-bold text-white">Access Denied</h2></div>
        <div className="p-8">
          <p className="text-slate-400 mb-4">Your Discord account is not authorized for admin access.</p>
          <button className={btnSecondary} onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  if (authorized === null) return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">Checking access...</div>;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {dbError && (
        <div className="px-6 py-3 bg-red-950 border-b border-red-800 flex items-center gap-2">
          <span className="text-red-300 text-sm">⚠ {dbError}</span>
        </div>
      )}

      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-slate-400 text-sm mt-0.5">{league.toUpperCase()} · {session.user?.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-medium">Season:</label>
            <select
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-zinc-500 focus:outline-none"
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            >
              {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className={btnSecondary} onClick={() => signOut()}>Sign out</button>
        </div>
      </div>

      <div className="flex border-b border-slate-800 bg-slate-950 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3.5 text-sm font-medium transition whitespace-nowrap border-b-2 ${activeTab === tab ? "border-white text-white" : "border-transparent text-slate-400 hover:text-white hover:border-slate-600"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === "Players" && <PlayersTab league={league} />}
        {activeTab === "Teams" && <TeamsTab league={league} season={season} />}
        {activeTab === "Schedule" && <ScheduleTab league={league} season={season} />}
        {activeTab === "Box Scores" && <BoxScoresTab league={league} season={season} />}
        {activeTab === "Accolades" && <AccoladesTab league={league} season={season} />}
        {activeTab === "Champions" && <ChampionsTab league={league} season={season} />}
        {activeTab === "Articles" && <ArticlesTab league={league} />}
        {activeTab === "Stats" && <StatsViewTab league={league} season={season} />}
        {activeTab === "Playoffs" && <PlayoffsTab league={league} season={season} />}
      </div>
    </div>
  );
}