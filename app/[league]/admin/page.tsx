"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import React from "react";
import OwnerPortalView from "../../components/OwnerPortalView";

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = { mc_uuid: string; mc_username: string; discord_id: string | null };
type Team = { id: string; league: string; name: string; abbreviation: string; division: string | null; logo_url: string | null; color: string | null; color2: string | null };
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
type Article = { id: string; league: string; title: string; body: string; created_at: string; image_url?: string | null };

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

// NBA team colors [primary, secondary]
const NBA_COLORS: Record<string, [string, string]> = {
  "atlanta hawks":          ["#E03A3E","#C1D32F"],
  "boston celtics":         ["#007A33","#BA9653"],
  "brooklyn nets":          ["#000000","#FFFFFF"],
  "charlotte hornets":      ["#1D1160","#00788C"],
  "chicago bulls":          ["#CE1141","#000000"],
  "cleveland cavaliers":    ["#860038","#FDBB30"],
  "dallas mavericks":       ["#00538C","#002B5E"],
  "denver nuggets":         ["#0E2240","#FEC524"],
  "detroit pistons":        ["#C8102E","#1D428A"],
  "golden state warriors":  ["#1D428A","#FFC72C"],
  "houston rockets":        ["#CE1141","#000000"],
  "indiana pacers":         ["#002D62","#FDBB30"],
  "los angeles clippers":   ["#C8102E","#1D428A"],
  "los angeles lakers":     ["#552583","#FDB927"],
  "memphis grizzlies":      ["#5D76A9","#12173F"],
  "miami heat":             ["#98002E","#F9A01B"],
  "milwaukee bucks":        ["#00471B","#EEE1C6"],
  "minnesota timberwolves": ["#0C2340","#236192"],
  "new orleans pelicans":   ["#0C2340","#C8102E"],
  "new york knicks":        ["#006BB6","#F58426"],
  "oklahoma city thunder":  ["#007AC1","#EF3B24"],
  "orlando magic":          ["#0077C0","#C4CED4"],
  "philadelphia 76ers":     ["#006BB6","#ED174C"],
  "phoenix suns":           ["#1D1160","#E56020"],
  "portland trail blazers": ["#E03A3E","#000000"],
  "sacramento kings":       ["#5A2D81","#63727A"],
  "san antonio spurs":      ["#C4CED4","#000000"],
  "toronto raptors":        ["#CE1141","#000000"],
  "utah jazz":              ["#002B5C","#00471B"],
  "washington wizards":     ["#002B5C","#E31837"],
};

function lookupNbaColors(teamName: string): [string, string] | null {
  const key = teamName.toLowerCase().trim();
  if (NBA_COLORS[key]) return NBA_COLORS[key];
  // fuzzy: check if name contains a known team name substring
  for (const [k, v] of Object.entries(NBA_COLORS)) {
    const words = k.split(" ");
    if (words.some(w => w.length > 4 && key.includes(w))) return v;
  }
  return null;
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
  const [savingColor, setSavingColor] = useState<string | null>(null);
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

  // Keep internal season in sync when parent season prop changes
  useEffect(() => {
    setSeason(SEASONS.includes(initialSeason) ? initialSeason : SEASONS[SEASONS.length - 1]);
  }, [initialSeason]);

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

  const deleteLogo = async (teamId: string) => {
    const r = await fetch("/api/teams/logo", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Logo delete failed"); }
    refresh();
  };

  const saveColors = async (teamId: string, color2: string | null) => {
    setSavingColor(teamId);
    await fetch(`/api/teams/${teamId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color2 }),
    });
    setSavingColor(null);
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
                      {/* Team color */}
                      <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                        <div style={{ width:16, height:16, borderRadius:3, background: t.color2 ?? "#1e293b", border:"1px solid #334155", flexShrink:0 }} />
                        <input
                          defaultValue={t.color2 ?? ""}
                          placeholder="Color #hex"
                          onBlur={e => { const v = e.target.value.trim(); if (v !== (t.color2 ?? "")) saveColors(t.id, v||null); }}
                          onKeyDown={e => { if (e.key==="Enter") (e.target as HTMLInputElement).blur(); }}
                          style={{ width:90, background:"#0d0d0d", border:"1px solid #222", borderRadius:5, color:"#ccc", fontSize:"0.72rem", padding:"3px 6px", outline:"none" }}
                        />
                        {(() => { const nba = lookupNbaColors(t.name); return nba ? (
                          <button
                            title={`Auto-fill NBA primary color: ${nba[0]}`}
                            onClick={() => saveColors(t.id, nba[0])}
                            disabled={savingColor===t.id}
                            style={{ background:"#1a1a2e", border:"1px solid #3730a3", borderRadius:5, color:"#818cf8", fontSize:"0.68rem", fontWeight:700, padding:"3px 7px", cursor:"pointer", whiteSpace:"nowrap" }}
                          >
                            🏀 NBA
                          </button>
                        ) : null; })()}
                      </div>
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
                      {t.logo_url && (
                        <button className={btnDanger} onClick={() => deleteLogo(t.id)}>Delete Logo</button>
                      )}
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
                              onChange={(uuid) => { setAddingToTeam((prev) => ({ ...prev, [t.id]: uuid })); setErr(""); }}
                              placeholder="Add player..."
                            />
                            <button
                              className={btnPrimary}
                              onClick={() => addToTeam(t.id)}
                              disabled={!addingToTeam[t.id]}
                              style={{ whiteSpace: "nowrap" }}
                            >Add</button>
                          </div>
                          {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
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

  // Keep internal season in sync when parent season prop changes
  useEffect(() => {
    setSeason(REGULAR_SEASONS.includes(initialSeason) ? initialSeason : REGULAR_SEASONS[REGULAR_SEASONS.length - 1]);
  }, [initialSeason]);

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [discordWebhook, setDiscordWebhook] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem(`discord_webhook_${league}`) ?? "";
    return "";
  });
  const [err, setErr] = useState("");
  const [posting, setPosting] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetch(`/api/articles?league=${league}`).then((r) => r.json());
    setArticles(Array.isArray(data) ? data : []);
  }, [league]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const saveWebhook = (val: string) => {
    setDiscordWebhook(val);
    if (typeof window !== "undefined") localStorage.setItem(`discord_webhook_${league}`, val);
  };

  const addArticle = async () => {
    if (!newTitle.trim() || !newBody.trim()) { setErr("Title and body are required."); return; }
    setErr(""); setPosting(true);

    let image_url: string | null = null;
    if (imageFile) {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
      const up = await fetch("/api/articles/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, filename: imageFile.name, contentType: imageFile.type }),
      });
      if (!up.ok) { const d = await up.json(); setErr(d.error ?? "Image upload failed"); setPosting(false); return; }
      const upData = await up.json();
      image_url = upData.url;
    }

    const r = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league,
        title: newTitle.trim(),
        body: newBody.trim(),
        image_url,
        discord_webhook: discordWebhook.trim() || null,
      }),
    });
    const data = await r.json();
    if (!r.ok) { setErr(data.error ?? "Failed to post"); setPosting(false); return; }
    setNewTitle(""); setNewBody(""); setImageFile(null); setImagePreview(null); setPosting(false); refresh();
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
          {/* Image upload */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Image / Logo (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 cursor-pointer"
            />
            {imagePreview && (
              <div className="mt-2 relative inline-block">
                <img src={imagePreview} alt="preview" className="max-h-40 rounded-lg border border-slate-700 object-contain" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-1 right-1 rounded-full bg-slate-900/80 text-slate-400 hover:text-red-400 text-xs px-1.5 py-0.5"
                >✕</button>
              </div>
            )}
          </div>
          {/* Discord webhook */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Discord Webhook URL (optional — posts to channel on submit)</label>
            <input
              className={input}
              placeholder="https://discord.com/api/webhooks/..."
              value={discordWebhook}
              onChange={(e) => saveWebhook(e.target.value)}
            />
          </div>
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
                    {a.image_url && <img src={a.image_url} alt="" className="mt-2 max-h-24 rounded-lg object-contain border border-slate-800" />}
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
  const isS6Plus = seasonNum >= 6;
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
    ...(isS6Plus ? [
      { key: "min_total", label: "MIN", hint: "Total Minutes",              slash: false },
    ] : []),
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
  const [loadedMpg, setLoadedMpg] = useState<number | null>(null);

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
    setLoadedMpg(row.mpg ?? null);
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
      min_total: gp && row.mpg != null ? String(Math.round(row.mpg * gp * 10) / 10) : "",
    });
  }, []);

  // When player is selected, pre-fill from cached allStats immediately, then
  // also fetch their exact season-specific row for accurate season data
  useEffect(() => {
    if (!selectedUuid) return;
    setFields({});
    setHasExisting(false);
    setLoadedFgPct(null); setLoadedThreePct(null); setLoadedThreeMade(null);
    setLoadedTopg(null); setLoadedPassPg(null); setLoadedPossPg(null); setLoadedMpg(null);

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
    setLoadedTopg(null); setLoadedPassPg(null); setLoadedPossPg(null); setLoadedMpg(null);
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
    const min_tot   = fields.min_total?.trim()  ? parseFloat(fields.min_total)  || null : null;
    const topg             = (gp && to_total != null) ? r1(to_total / gp) : loadedTopg;
    const pass_attempts_pg = (gp && pass_tot != null) ? r1(pass_tot / gp) : loadedPassPg;
    const possession_time_pg = (gp && poss_tot != null) ? Math.round(poss_tot / gp) : loadedPossPg;
    const mpg              = (gp && min_tot != null) ? r1(min_tot / gp) : loadedMpg;
    const r = await fetch(`/api/stats?league=${encodeURIComponent(league)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league, season: initialSeason, mc_uuid: selectedUuid,
        gp, ppg, rpg, orpg, drpg, apg, spg, bpg, fg_pct, three_pt_made, three_pt_pct,
        topg, pass_attempts_pg, possession_time_pg, mpg,
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
  team1?: { id: string; name: string; abbreviation: string; logo_url?: string | null; color?: string | null; color2?: string | null } | null;
  team2?: { id: string; name: string; abbreviation: string; logo_url?: string | null; color?: string | null; color2?: string | null } | null;
};

const SLOT_H    = 58;   // height of each individual team box (pill shape)
const INNER_GAP = 6;    // gap between team1 and team2 boxes within a matchup
const MATCHUP_H = SLOT_H * 2 + INNER_GAP;  // = 122
const BASE_GAP  = 48;

function gapForRound(ri: number) { return (Math.pow(2, ri) - 1) * (MATCHUP_H + BASE_GAP) + BASE_GAP; }
function topOffsetForRound(ri: number) { return ((Math.pow(2, ri) - 1) * (MATCHUP_H + BASE_GAP)) / 2; }
function nextPow2(n: number) { let p = 1; while (p < n) p *= 2; return p; }

function buildBracketSlots(P: number): number[] {
  if (P === 2) return [1, 2];
  const half = buildBracketSlots(P / 2);
  const result: number[] = [];
  for (const s of half) { result.push(s); result.push(P + 1 - s); }
  return result;
}

function getRoundNames(total: number): string[] {
  return Array.from({ length: total }, (_, i) => {
    const fromEnd = total - i;
    if (fromEnd === 1) return "Finals";
    if (fromEnd === 2) return "Semifinals";
    if (fromEnd === 3) return "Quarterfinals";
    return `Round ${i + 1}`;
  });
}

// ── Conference-aware Seed Picker ──────────────────────────────────────────────
function ConferenceSeedPicker({
  allTeams, eastSeeds, westSeeds, onChangeEast, onChangeWest
}: {
  allTeams: Team[]; eastSeeds: Team[]; westSeeds: Team[];
  onChangeEast: (t: Team[]) => void; onChangeWest: (t: Team[]) => void;
}) {
  const assigned = new Set([...eastSeeds, ...westSeeds].map(t => t.id));
  const available = allTeams.filter(t => !assigned.has(t.id));
  const addE = (team: Team) => onChangeEast([...eastSeeds, team]);
  const addW = (team: Team) => onChangeWest([...westSeeds, team]);
  const removeE = (i: number) => onChangeEast(eastSeeds.filter((_, j) => j !== i));
  const removeW = (i: number) => onChangeWest(westSeeds.filter((_, j) => j !== i));
  const moveE = (i: number, d: -1|1) => { const a=[...eastSeeds]; [a[i],a[i+d]]=[a[i+d],a[i]]; onChangeEast(a); };
  const moveW = (i: number, d: -1|1) => { const a=[...westSeeds]; [a[i],a[i+d]]=[a[i+d],a[i]]; onChangeWest(a); };
  const PE = eastSeeds.length >= 1 ? nextPow2(eastSeeds.length) : 0;
  const PW = westSeeds.length >= 1 ? nextPow2(westSeeds.length) : 0;
  const byesE = PE - eastSeeds.length, byesW = PW - westSeeds.length;

  function SeedList({ seeds, byes, conf, onMove, onRemove }: {
    seeds: Team[]; byes: number; conf: "E"|"W";
    onMove: (i: number, d: -1|1) => void; onRemove: (i: number) => void;
  }) {
    const accent = conf === "E" ? "#3b82f6" : "#ef4444";
    if (seeds.length === 0) return <div style={{ color:"#444", fontSize:"0.8rem", padding:"10px 0" }}>None yet</div>;
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
        {seeds.map((team, i) => (
          <div key={team.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#161616", border:"1px solid #222", borderRadius:8, padding:"6px 10px" }}>
            <span style={{ fontSize:"0.7rem", fontWeight:700, color:accent, width:22, textAlign:"center", flexShrink:0 }}>#{i+1}</span>
            {team.logo_url && <img src={team.logo_url} style={{ width:20, height:20, objectFit:"contain", borderRadius:3, flexShrink:0 }} alt="" />}
            <span style={{ flex:1, fontSize:"0.85rem", color:"#ddd", fontWeight:600 }}>{team.name}</span>
            {i < byes && <span style={{ fontSize:"0.6rem", color:"#facc15", background:"rgba(234,179,8,0.08)", border:"1px solid rgba(234,179,8,0.2)", borderRadius:4, padding:"1px 5px", flexShrink:0 }}>BYE</span>}
            <div style={{ display:"flex", flexDirection:"column" }}>
              <button onClick={() => onMove(i,-1)} disabled={i===0} style={{ background:"none", border:"none", color:i===0?"#2a2a2a":"#555", cursor:i===0?"default":"pointer", padding:"0 3px", fontSize:"0.55rem", lineHeight:1.4 }}>▲</button>
              <button onClick={() => onMove(i,1)} disabled={i===seeds.length-1} style={{ background:"none", border:"none", color:i===seeds.length-1?"#2a2a2a":"#555", cursor:i===seeds.length-1?"default":"pointer", padding:"0 3px", fontSize:"0.55rem", lineHeight:1.4 }}>▼</button>
            </div>
            <button onClick={() => onRemove(i)} style={{ background:"none", border:"none", color:"#3a1a1a", cursor:"pointer", fontSize:"0.75rem", padding:"0 2px" }} onMouseEnter={e=>(e.currentTarget.style.color="#f87171")} onMouseLeave={e=>(e.currentTarget.style.color="#3a1a1a")}>✕</button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
      {/* East Conference */}
      <div style={{ flex:"1 1 210px" }}>
        <div style={{ fontSize:"0.7rem", fontWeight:700, color:"#3b82f6", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>
          🔵 East Conference
          {eastSeeds.length>=1 && <span style={{ color:"#444", fontWeight:400, marginLeft:8 }}>{eastSeeds.length} teams · {byesE} bye{byesE!==1?"s":""}</span>}
        </div>
        <SeedList seeds={eastSeeds} byes={byesE} conf="E" onMove={moveE} onRemove={removeE} />
      </div>
      {/* West Conference */}
      <div style={{ flex:"1 1 210px" }}>
        <div style={{ fontSize:"0.7rem", fontWeight:700, color:"#ef4444", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>
          🔴 West Conference
          {westSeeds.length>=1 && <span style={{ color:"#444", fontWeight:400, marginLeft:8 }}>{westSeeds.length} teams · {byesW} bye{byesW!==1?"s":""}</span>}
        </div>
        <SeedList seeds={westSeeds} byes={byesW} conf="W" onMove={moveW} onRemove={removeW} />
      </div>
      {/* Available teams */}
      <div style={{ flex:"1 1 160px" }}>
        <div style={{ fontSize:"0.7rem", fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Add Team</div>
        {available.length===0
          ? <div style={{ color:"#444", fontSize:"0.8rem" }}>All assigned.</div>
          : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {available.map(team => (
                <div key={team.id} style={{ background:"#111", border:"1px solid #1e1e1e", borderRadius:8, padding:"7px 10px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                    {team.logo_url && <img src={team.logo_url} style={{ width:18, height:18, objectFit:"contain" }} alt="" />}
                    <span style={{ fontSize:"0.82rem", fontWeight:600, color:"#aaa" }}>{team.name}</span>
                  </div>
                  <div style={{ display:"flex", gap:5 }}>
                    <button onClick={() => addE(team)} style={{ flex:1, background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.2)", borderRadius:5, color:"#3b82f6", fontSize:"0.7rem", fontWeight:700, padding:"3px 0", cursor:"pointer" }}>+ East</button>
                    <button onClick={() => addW(team)} style={{ flex:1, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:5, color:"#ef4444", fontSize:"0.7rem", fontWeight:700, padding:"3px 0", cursor:"pointer" }}>+ West</button>
                  </div>
                </div>
              ))}
            </div>
        }
      </div>
    </div>
  );
}

// ── Individual team slot (bold sport-pill, one box per team) ─────────────────
const CONF_COLORS: Record<string, { bg: string; darkBg: string }> = {
  W: { bg: "#991b1b", darkBg: "#7f1d1d" },   // West = red
  E: { bg: "#1d4ed8", darkBg: "#1e3a8a" },   // East = blue
  F: { bg: "#78350f", darkBg: "#451a03" },   // Finals = gold-brown
};

function TeamSlot({ m, side, teams, saving, onUpdate, slotRef, conf }: {
  m: BracketMatchup; side: "team1"|"team2"; teams: Team[];
  saving: boolean; onUpdate: (p: object) => void;
  slotRef: (el: HTMLElement | null) => void;
  conf: "W"|"E"|"F";
}) {
  const idKey    = side === "team1" ? "team1_id" : "team2_id";
  const scoreKey = side === "team1" ? "team1_score" : "team2_score";
  const teamId   = m[idKey];
  const score    = m[scoreKey];
  const team     = (m[side] ?? teams.find(t => t.id === teamId)) as Team | null;
  const isWinner = !!(m.winner_id && teamId && m.winner_id === teamId);

  const confColors = CONF_COLORS[conf] ?? CONF_COLORS.W;
  const isLoser = !!(m.winner_id && teamId && m.winner_id !== teamId);
  const teamColor = team?.color2 ?? team?.color ?? null;
  const pillBg  = isWinner ? (teamColor ?? "#166534") : isLoser ? (teamColor ?? confColors.bg) : teamColor ?? confColors.bg;
  const logoBg  = teamColor ?? confColors.darkBg;

  return (
    <div ref={slotRef as React.Ref<HTMLDivElement>}
      style={{ display:"flex", alignItems:"center", height:SLOT_H, borderRadius:10,
        background: pillBg,
        border: `2px solid ${isWinner ? "#fff" : isLoser ? "transparent" : team ? "transparent" : "#252525"}`,
        overflow:"hidden", flexShrink:0, position:"relative",
        opacity: isLoser ? 0.35 : 1,
        filter: isWinner ? "brightness(1.15)" : isLoser ? "brightness(0.45) saturate(0.6)" : "none",
        transition: "opacity 0.2s, filter 0.2s" }}>

      {/* Left: team abbreviation / TBD picker */}
      <div style={{ flex:1, padding:"0 14px", minWidth:0, overflow:"hidden" }}>
        {team
          ? <span style={{ fontSize:"1.15rem", fontWeight:900, color: isLoser ? "#666" : "#fff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", display:"block", letterSpacing:"0.04em", textShadow:"0 1px 3px rgba(0,0,0,0.4)" }}>
              {team.abbreviation}
            </span>
          : <select value={teamId ?? ""} onChange={e => onUpdate({ [idKey]: e.target.value||null, winner_id:null })} disabled={saving}
              style={{ width:"100%", background:"transparent", border:"none", outline:"none", color:"#555", fontSize:"0.75rem", cursor:"pointer" }}>
              <option value="">— TBD —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
        }
      </div>

      {/* Wins input */}
      <div style={{ display:"flex", alignItems:"center", gap:4, padding:"0 6px 0 0", flexShrink:0 }}>
        <input type="number" min="0" placeholder="W" value={score ?? ""}
          onChange={e => onUpdate({ [scoreKey]: e.target.value !== "" ? parseInt(e.target.value) : null })}
          style={{ width:30, background:"rgba(0,0,0,0.25)", border:"none", outline:"none", borderRadius:4, color:"rgba(255,255,255,0.85)", fontSize:"0.9rem", fontWeight:700, textAlign:"center", padding:"2px 0" }} />
        {teamId && (
          <button onClick={() => onUpdate({ winner_id: m.winner_id === teamId ? null : teamId })}
            title="Mark winner"
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:"0.8rem", lineHeight:1, opacity: m.winner_id === teamId ? 1 : 0.25, transition:"opacity 0.15s", padding:"1px 2px" }}>
            🏆
          </button>
        )}
      </div>

      {/* Right: logo panel */}
      <div style={{ width:58, height:SLOT_H, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", background:logoBg, borderLeft:"1px solid rgba(0,0,0,0.35)", boxShadow:"inset 0 0 0 1000px rgba(0,0,0,0.18)" }}>
        {team?.logo_url
          ? <img src={team.logo_url} style={{ width:44, height:44, objectFit:"contain" }} alt="" />
          : <div style={{ width:36, height:36, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.85rem", fontWeight:700, color:"#2a2a2a" }}>?</div>
        }
      </div>
    </div>
  );
}

// ── Flat Seed Picker ──────────────────────────────────────────────────────────
function FlatSeedPicker({ allTeams, seeds, onChange }: {
  allTeams: Team[]; seeds: Team[]; onChange: (t: Team[]) => void;
}) {
  const assigned = new Set(seeds.map(t => t.id));
  const available = allTeams.filter(t => !assigned.has(t.id));
  const add = (team: Team) => onChange([...seeds, team]);
  const remove = (i: number) => onChange(seeds.filter((_, j) => j !== i));
  const move = (i: number, d: -1|1) => { const a=[...seeds]; [a[i],a[i+d]]=[a[i+d],a[i]]; onChange(a); };
  const P = seeds.length >= 1 ? nextPow2(seeds.length) : 0;
  const byes = P - seeds.length;

  return (
    <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
      <div style={{ flex:"1 1 220px", minWidth:180 }}>
        <div style={{ fontSize:"0.7rem", fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>
          Seeded Teams ({seeds.length}{byes>0?`, ${byes} bye${byes>1?"s":""}`:""})
        </div>
        {seeds.length===0 && <div style={{ color:"#444", fontSize:"0.8rem", padding:"10px 0" }}>None yet</div>}
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          {seeds.map((team, i) => (
            <div key={team.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#161616", border:"1px solid #222", borderRadius:8, padding:"6px 10px" }}>
              <span style={{ fontSize:"0.7rem", fontWeight:700, color:"#888", width:22, textAlign:"center", flexShrink:0 }}>#{i+1}</span>
              {team.logo_url && <img src={team.logo_url} style={{ width:20, height:20, objectFit:"contain", borderRadius:3, flexShrink:0 }} alt="" />}
              <span style={{ flex:1, fontSize:"0.85rem", color:"#ddd", fontWeight:600 }}>{team.name}</span>
              <button onClick={()=>move(i,-1)} disabled={i===0} style={{ background:"none", border:"none", color:"#555", cursor:i===0?"default":"pointer", fontSize:"0.8rem" }}>▲</button>
              <button onClick={()=>move(i,1)} disabled={i===seeds.length-1} style={{ background:"none", border:"none", color:"#555", cursor:i===seeds.length-1?"default":"pointer", fontSize:"0.8rem" }}>▼</button>
              <button onClick={()=>remove(i)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:"0.9rem" }}>✕</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex:"1 1 200px", minWidth:160 }}>
        <div style={{ fontSize:"0.7rem", fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>Available</div>
        {available.length===0 && <div style={{ color:"#444", fontSize:"0.8rem", padding:"10px 0" }}>All teams seeded</div>}
        <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
          {available.map(team=>(
            <div key={team.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#111", border:"1px solid #1a1a1a", borderRadius:8, padding:"6px 10px" }}>
              {team.logo_url && <img src={team.logo_url} style={{ width:20, height:20, objectFit:"contain", borderRadius:3, flexShrink:0 }} alt="" />}
              <span style={{ flex:1, fontSize:"0.82rem", color:"#aaa", fontWeight:600 }}>{team.name}</span>
              <button onClick={()=>add(team)} style={{ background:"rgba(100,100,100,0.1)", border:"1px solid #333", borderRadius:5, color:"#aaa", fontSize:"0.7rem", fontWeight:700, padding:"3px 8px", cursor:"pointer" }}>+ Add</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main PlayoffsTab ──────────────────────────────────────────────────────────
function PlayoffsTab({ league, season }: { league: string; season: string }) {
  const [matchups, setMatchups]       = useState<BracketMatchup[]>([]);
  const [teams, setTeams]             = useState<Team[]>([]);
  const [bracketMode, setBracketMode] = useState<"conferences"|"flat">("conferences");
  const [eastSeeds, setEastSeeds]     = useState<Team[]>([]);
  const [westSeeds, setWestSeeds]     = useState<Team[]>([]);
  const [flatSeeds, setFlatSeeds]     = useState<Team[]>([]);
  const [view, setView]               = useState<"setup"|"bracket">("setup");
  const [err, setErr]                 = useState("");
  const [saving, setSaving]           = useState<string|null>(null);
  const [generating, setGenerating]   = useState(false);
  const [clearing, setClearing]       = useState(false);
  const [connectors, setConnectors]   = useState<{d:string;key:string}[]>([]);
  const seedsInit = useRef(false);
  const innerRef   = useRef<HTMLDivElement>(null);
  const slotEls = useRef<Map<string,HTMLElement>>(new Map());

  const refresh = useCallback(async () => {
    const [m, t] = await Promise.all([
      fetch(`/api/playoff-brackets?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`).then(r=>r.json()),
      fetch(`/api/teams?league=${league}&season=${encodeURIComponent(season)}`).then(r=>r.json()),
    ]);
    const ms: BracketMatchup[] = Array.isArray(m) ? m : [];
    const ts: Team[] = Array.isArray(t) ? t : [];
    setMatchups(ms); setTeams(ts);
    if (ms.length > 0) setView("bracket");
  }, [league, season]);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-populate seeds from team division field (once per load)
  useEffect(() => {
    if (!seedsInit.current && teams.length > 0) {
      setEastSeeds(teams.filter(t => t.division === "East"));
      setWestSeeds(teams.filter(t => t.division === "West"));
      setFlatSeeds([...teams]);
      seedsInit.current = true;
    }
  }, [teams]);

  // Reset when season changes
  useEffect(() => {
    seedsInit.current = false;
    setEastSeeds([]); setWestSeeds([]); setFlatSeeds([]);
    setMatchups([]); setView("setup");
  }, [season]);

  // Detect conference-style bracket
  const isConferenceBracket = useMemo(() =>
    matchups.some(m => m.round_name.startsWith("East ") || m.round_name.startsWith("West ")),
  [matchups]);

  // Flat bracket rounds
  const rounds = useMemo(() => {
    const map = new Map<string,{name:string;order:number;matchups:BracketMatchup[]}>();
    for (const m of matchups) {
      if (!map.has(m.round_name)) map.set(m.round_name, {name:m.round_name, order:m.round_order, matchups:[]});
      map.get(m.round_name)!.matchups.push(m);
    }
    const arr = [...map.values()].sort((a,b)=>a.order-b.order);
    for (const r of arr) r.matchups.sort((a,b)=>a.matchup_index-b.matchup_index);
    return arr;
  }, [matchups]);

  // Conference rounds grouped by name, sorted by round_order — separate East/West/Finals
  const westRounds = useMemo(() => {
    const map = new Map<string,{name:string;order:number;matchups:BracketMatchup[]}>();
    for (const m of matchups.filter(m=>m.round_name.startsWith("West "))) {
      if (!map.has(m.round_name)) map.set(m.round_name, {name:m.round_name, order:m.round_order, matchups:[]});
      map.get(m.round_name)!.matchups.push(m);
    }
    return [...map.values()].sort((a,b)=>a.order-b.order).map(r=>({...r, matchups: r.matchups.sort((a,b)=>a.matchup_index-b.matchup_index)}));
  }, [matchups]);

  const eastRounds = useMemo(() => {
    const map = new Map<string,{name:string;order:number;matchups:BracketMatchup[]}>();
    for (const m of matchups.filter(m=>m.round_name.startsWith("East "))) {
      if (!map.has(m.round_name)) map.set(m.round_name, {name:m.round_name, order:m.round_order, matchups:[]});
      map.get(m.round_name)!.matchups.push(m);
    }
    return [...map.values()].sort((a,b)=>a.order-b.order).map(r=>({...r, matchups: r.matchups.sort((a,b)=>a.matchup_index-b.matchup_index)}));
  }, [matchups]);

  const finalsMatchup = useMemo(() => matchups.find(m=>m.round_name==="Finals") ?? null, [matchups]);

  // Connector lines: draw classic bracket shape from two team slots to one winner slot
  const recalcConnectors = useCallback(() => {
    const inner = innerRef.current; if (!inner) return;
    const ir = inner.getBoundingClientRect();
    const sv = inner.scrollTop, sh = inner.scrollLeft;
    const paths: {d:string;key:string}[] = [];

    const sl = slotEls.current;

    // Draw bracket: two slots (T1, T2) connect to one winner slot
    // direction: "LR" = exit right/enter left, "RL" = exit left/enter right
    const drawBracket = (
      s1Id: string, s2Id: string, winId: string, key: string, dir: "LR"|"RL"
    ) => {
      const e1=sl.get(s1Id), e2=sl.get(s2Id), ew=sl.get(winId);
      if (!e1 || !e2 || !ew) return;
      const r1=e1.getBoundingClientRect(), r2=e2.getBoundingClientRect(), rw=ew.getBoundingClientRect();
      if (dir==="LR") {
        const x1=r1.right-ir.left+sh, y1=r1.top+r1.height/2-ir.top+sv;
        const x2=r2.right-ir.left+sh, y2=r2.top+r2.height/2-ir.top+sv;
        const xw=rw.left-ir.left+sh,  yw=rw.top+rw.height/2-ir.top+sv;
        const mx=(Math.max(x1,x2)+xw)/2, ym=(y1+y2)/2;
        paths.push({d:`M ${x1} ${y1} H ${mx} V ${y2} H ${x2} M ${mx} ${ym} V ${yw} H ${xw}`,key});
      } else {
        const x1=r1.left-ir.left+sh, y1=r1.top+r1.height/2-ir.top+sv;
        const x2=r2.left-ir.left+sh, y2=r2.top+r2.height/2-ir.top+sv;
        const xw=rw.right-ir.left+sh, yw=rw.top+rw.height/2-ir.top+sv;
        const mx=(Math.min(x1,x2)+xw)/2, ym=(y1+y2)/2;
        paths.push({d:`M ${x1} ${y1} H ${mx} V ${y2} H ${x2} M ${mx} ${ym} V ${yw} H ${xw}`,key});
      }
    };

    // Simple line from one slot to another (for Finals connection)
    const drawLine = (fromId: string, toId: string, key: string, dir: "LR"|"RL") => {
      const ef=sl.get(fromId), et=sl.get(toId);
      if (!ef || !et) return;
      const rf=ef.getBoundingClientRect(), rt=et.getBoundingClientRect();
      if (dir==="LR") {
        const fx=rf.right-ir.left+sh, fy=rf.top+rf.height/2-ir.top+sv;
        const tx=rt.left-ir.left+sh,  ty=rt.top+rt.height/2-ir.top+sv;
        paths.push({d:`M ${fx} ${fy} H ${(fx+tx)/2} V ${ty} H ${tx}`,key});
      } else {
        const fx=rf.left-ir.left+sh,  fy=rf.top+rf.height/2-ir.top+sv;
        const tx=rt.right-ir.left+sh, ty=rt.top+rt.height/2-ir.top+sv;
        paths.push({d:`M ${fx} ${fy} H ${(fx+tx)/2} V ${ty} H ${tx}`,key});
      }
    };

    if (isConferenceBracket) {
      // West: left-to-right
      for (let ri=0; ri<westRounds.length-1; ri++) {
        const curMs=westRounds[ri].matchups, nextMs=westRounds[ri+1].matchups;
        for (let mi=0; mi<curMs.length; mi++) {
          const nM=nextMs[Math.floor(mi/2)]; if(!nM) continue;
          // Connect to whichever slot in the next round is empty (TBD); fall back to even/odd
          const winSlot = nM.team1_id != null && nM.team2_id == null ? "2"
                        : nM.team1_id == null && nM.team2_id != null ? "1"
                        : mi%2===0 ? "1" : "2";
          drawBracket(`${curMs[mi].id}-1`,`${curMs[mi].id}-2`,`${nM.id}-${winSlot}`,`${curMs[mi].id}-${nM.id}`,"LR");
        }
      }
      // West Conf Finals → Championship team2 slot (bottom); East gets top
      if (finalsMatchup && westRounds.length>0) {
        const lastW=westRounds[westRounds.length-1].matchups;
        for (const m of lastW) {
          drawBracket(`${m.id}-1`,`${m.id}-2`,`${finalsMatchup.id}-2`,`${m.id}-wf`,"LR");
        }
      }
      // East: right-to-left (from outer R1 toward center)
      for (let ri=0; ri<eastRounds.length-1; ri++) {
        const curMs=eastRounds[ri].matchups, nextMs=eastRounds[ri+1].matchups;
        for (let mi=0; mi<curMs.length; mi++) {
          const nM=nextMs[Math.floor(mi/2)]; if(!nM) continue;
          const winSlot = nM.team1_id != null && nM.team2_id == null ? "2"
                        : nM.team1_id == null && nM.team2_id != null ? "1"
                        : mi%2===0 ? "1" : "2";
          drawBracket(`${curMs[mi].id}-1`,`${curMs[mi].id}-2`,`${nM.id}-${winSlot}`,`${curMs[mi].id}-${nM.id}`,"RL");
        }
      }
      // East Conf Finals → Championship team1 slot (top)
      if (finalsMatchup && eastRounds.length>0) {
        const lastE=eastRounds[eastRounds.length-1].matchups;
        for (const m of lastE) {
          drawBracket(`${m.id}-1`,`${m.id}-2`,`${finalsMatchup.id}-1`,`${m.id}-ef`,"RL");
        }
      }
    } else {
      for (let ri=0; ri<rounds.length-1; ri++) {
        const cur=rounds[ri],next=rounds[ri+1];
        for (let mi=0; mi<cur.matchups.length; mi++) {
          const m=cur.matchups[mi],nM=next.matchups[Math.floor(mi/2)]; if(!nM) continue;
          const winSlot=mi%2===0?"1":"2";
          drawBracket(`${m.id}-1`,`${m.id}-2`,`${nM.id}-${winSlot}`,`${m.id}-${nM.id}`,"LR");
        }
      }
    }
    setConnectors(paths);
  }, [rounds, westRounds, eastRounds, finalsMatchup, isConferenceBracket]);

  useLayoutEffect(() => {
    // Double-rAF after timeout to ensure layout (including padding shifts) is fully painted
    let raf1: number, raf2: number;
    const t = setTimeout(() => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(recalcConnectors);
      });
    }, 60);
    return () => { clearTimeout(t); cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [recalcConnectors]);

  const upsert = async (payload: object) => {
    const r = await fetch("/api/playoff-brackets", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    if (!r.ok) { const d=await r.json(); setErr(d.error??"Save failed"); return false; }
    return true;
  };

  const updateMatchup = async (m: BracketMatchup, patch: object) => {
    setSaving(m.id); setErr("");
    const merged = { league, season, round_name:m.round_name, round_order:m.round_order, matchup_index:m.matchup_index, team1_id:m.team1_id, team2_id:m.team2_id, team1_score:m.team1_score, team2_score:m.team2_score, winner_id:m.winner_id, ...patch } as Record<string,unknown>;
    await upsert(merged);

    // Auto-advance winner to next round
    const winnerId = merged.winner_id as string | null;
    if (winnerId) {
      // Determine which "track" this matchup belongs to and find the next round matchup
      const findNext = (roundsList: {name:string;order:number;matchups:BracketMatchup[]}[], dir: "LR"|"RL") => {
        for (let ri=0; ri<roundsList.length; ri++) {
          const idx = roundsList[ri].matchups.findIndex(x=>x.id===m.id);
          if (idx === -1) continue;
          const nextRound = roundsList[ri+1];
          if (!nextRound) return null;
          const nextIdx = Math.floor(idx/2);
          const nextMatchup = nextRound.matchups[nextIdx];
          if (!nextMatchup) return null;
          const slot = idx%2===0 ? "team1_id" : "team2_id";
          return { nextMatchup, slot };
        }
        return null;
      };

      let found = findNext(westRounds,"LR") ?? findNext(eastRounds,"RL") ?? findNext(rounds,"LR");

      // If it's a conference finals (last west/east round), advance to Finals
      if (!found && finalsMatchup) {
        const inLastWest = westRounds.length>0 && westRounds[westRounds.length-1].matchups.some(x=>x.id===m.id);
        const inLastEast = eastRounds.length>0 && eastRounds[eastRounds.length-1].matchups.some(x=>x.id===m.id);
        if (inLastWest) found = { nextMatchup: finalsMatchup, slot: "team1_id" };
        if (inLastEast) found = { nextMatchup: finalsMatchup, slot: "team2_id" };
      }

      if (found) {
        const { nextMatchup, slot } = found;
        await upsert({ league, season, round_name:nextMatchup.round_name, round_order:nextMatchup.round_order, matchup_index:nextMatchup.matchup_index,
          team1_id: slot==="team1_id" ? winnerId : nextMatchup.team1_id,
          team2_id: slot==="team2_id" ? winnerId : nextMatchup.team2_id,
          team1_score:nextMatchup.team1_score, team2_score:nextMatchup.team2_score, winner_id:nextMatchup.winner_id });
      }
    }

    setSaving(null); refresh();
  };

  // Build a bracket for a list of seeds with a given name prefix (or no prefix for flat)
  const buildBracketFromSeeds = async (seeds: Team[], prefix: string, roundOffset: number) => {
    const N = seeds.length;
    if (N < 2) return;
    const P = nextPow2(N);
    const totalR = Math.log2(P);
    const makeName = (i: number) => {
      const f = totalR - i;
      const base = f===1 ? "Finals" : f===2 ? "Semifinals" : f===3 ? "Quarterfinals" : `Round ${i+1}`;
      return prefix ? `${prefix} ${base}` : base;
    };
    const names = Array.from({length:totalR},(_,i)=>makeName(i));
    const slots = buildBracketSlots(P);
    const r2pre = new Map<number,{t1:string|null,t2:string|null}>();
    for (let i=0; i<P/2; i++) {
      const s1=slots[i*2], s2=slots[i*2+1];
      const t1=s1<=N?seeds[s1-1]:null, t2=s2<=N?seeds[s2-1]:null;
      if (t1&&t2) {
        await upsert({league,season,round_name:names[0],round_order:roundOffset,matchup_index:i,team1_id:t1.id,team2_id:t2.id,winner_id:null,team1_score:null,team2_score:null});
      } else if (t1) {
        const r2i=Math.floor(i/2);
        if (!r2pre.has(r2i)) r2pre.set(r2i,{t1:null,t2:null});
        const slot=r2pre.get(r2i)!;
        if (i%2===0) slot.t1=t1.id; else slot.t2=t1.id;
      }
    }
    for (let r=1; r<totalR; r++) {
      const mc=P>>(r+1);
      for (let i=0; i<mc; i++) {
        const pf=r===1?r2pre.get(i):undefined;
        await upsert({league,season,round_name:names[r],round_order:roundOffset+r,matchup_index:i,team1_id:pf?.t1??null,team2_id:pf?.t2??null,winner_id:null,team1_score:null,team2_score:null});
      }
    }
  };

  const generateBracket = async () => {
    if (bracketMode === "flat") {
      if (flatSeeds.length < 2) { setErr("Need at least 2 teams."); return; }
      if (matchups.length>0 && !confirm("Overwrite existing bracket?")) return;
      setGenerating(true); setErr("");
      for (const m of matchups) await fetch(`/api/playoff-brackets?id=${m.id}`,{method:"DELETE"});
      await buildBracketFromSeeds(flatSeeds, "", 0);
    } else {
      const NE=eastSeeds.length, NW=westSeeds.length;
      if (NE<1||NW<1) { setErr("Each conference needs at least 1 team."); return; }
      if (matchups.length>0 && !confirm("Overwrite existing bracket?")) return;
      setGenerating(true); setErr("");
      for (const m of matchups) await fetch(`/api/playoff-brackets?id=${m.id}`,{method:"DELETE"});

      const PE=nextPow2(NE), PW=nextPow2(NW);
      const rE=Math.log2(PE), rW=Math.log2(PW);
      const maxConf=Math.max(rE,rW);

      // Build conference brackets (single-team shortcut for solo teams)
      const buildConf = async (seeds: Team[], prefix: string): Promise<Team|null> => {
        if (seeds.length === 1) return seeds[0];
        await buildBracketFromSeeds(seeds, prefix, 0);
        return null;
      };

      const [eastSolo, westSolo] = await Promise.all([
        buildConf(eastSeeds,"East"),
        buildConf(westSeeds,"West"),
      ]);
      await upsert({league,season,round_name:"Finals",round_order:maxConf,matchup_index:0,
        team1_id:westSolo?.id??null, team2_id:eastSolo?.id??null, winner_id:null,team1_score:null,team2_score:null});
    }

    setGenerating(false);
    await refresh();
    setView("bracket");
  };

  const clearBracket = async () => {
    if (!confirm("Delete the entire bracket? This cannot be undone.")) return;
    setClearing(true); setErr("");
    for (const m of matchups) await fetch(`/api/playoff-brackets?id=${m.id}`,{method:"DELETE"});
    setClearing(false); setMatchups([]); setEastSeeds([]); setWestSeeds([]); setView("setup");
    seedsInit.current = false;
  };

  // Compute absolute top position for a first-round matchup aligned to its target slot in next round
  const calcFirstRoundTop = useCallback((fullIdx: number, ri: number, nextMatchups: BracketMatchup[]): number => {
    const nM = nextMatchups[Math.floor(fullIdx / 2)];
    if (!nM) return topOffsetForRound(ri) + fullIdx * (MATCHUP_H + gapForRound(ri));
    const nMBaseTop = topOffsetForRound(ri + 1) + Math.floor(fullIdx / 2) * (MATCHUP_H + gapForRound(ri + 1));
    if (nM.team1_id != null && nM.team2_id == null) {
      // Bye is team1 → winner goes to team2 (bottom) → center matchup at team2 center
      return Math.max(0, nMBaseTop + SLOT_H + INNER_GAP + SLOT_H / 2 - MATCHUP_H / 2);
    }
    if (nM.team1_id == null && nM.team2_id != null) {
      // Bye is team2 → winner goes to team1 (top) → center matchup at team1 center
      return Math.max(0, nMBaseTop + SLOT_H / 2 - MATCHUP_H / 2);
    }
    // No bye: even matchup → team1 slot, odd → team2 slot
    return topOffsetForRound(ri) + fullIdx * (MATCHUP_H + gapForRound(ri));
  }, []);

  const canvasH = useMemo(() => {
    const colH = (col: {matchups: BracketMatchup[]}, ri: number, nextMs: BracketMatchup[] | null) => {
      if (nextMs) {
        // First round with bye alignment: absolute positioned
        const visMs = col.matchups.filter(m => m.team1_id && m.team2_id);
        return visMs.reduce((max, _, vi) => Math.max(max, calcFirstRoundTop(vi, ri, nextMs) + MATCHUP_H), MATCHUP_H);
      }
      const n = col.matchups.length;
      return topOffsetForRound(ri) + n * MATCHUP_H + Math.max(0, n - 1) * gapForRound(ri);
    };
    if (isConferenceBracket) {
      let maxH = MATCHUP_H;
      westRounds.forEach((col,ri)=>{
        const h = colH(col, ri, ri===0 && ri+1<westRounds.length ? westRounds[ri+1].matchups : null);
        if(h>maxH) maxH=h;
      });
      eastRounds.forEach((col,i)=>{
        const h = colH(col, i, i===0 && i+1<eastRounds.length ? eastRounds[i+1].matchups : null);
        if(h>maxH) maxH=h;
      });
      return maxH + 80;
    }
    let max=200;
    for (let ri=0;ri<rounds.length;ri++) { const n=rounds[ri].matchups.length; const h=topOffsetForRound(ri)+n*MATCHUP_H+Math.max(0,n-1)*gapForRound(ri); if(h>max) max=h; }
    return max+80;
  }, [rounds, westRounds, eastRounds, isConferenceBracket, calcFirstRoundTop]);

  // Matchup group: two separate sport-pill boxes (one per team)
  const MatchupGroup = ({ m, conf }: { m: BracketMatchup; conf: "W"|"E"|"F" }) => (
    <div style={{ display:"flex", flexDirection:"column", gap:INNER_GAP, flexShrink:0 }}>
      <TeamSlot m={m} side="team1" teams={teams} saving={saving===m.id} onUpdate={p=>updateMatchup(m,p)} conf={conf}
        slotRef={el=>{ if(el) slotEls.current.set(`${m.id}-1`,el); else slotEls.current.delete(`${m.id}-1`); }} />
      <TeamSlot m={m} side="team2" teams={teams} saving={saving===m.id} onUpdate={p=>updateMatchup(m,p)} conf={conf}
        slotRef={el=>{ if(el) slotEls.current.set(`${m.id}-2`,el); else slotEls.current.delete(`${m.id}-2`); }} />
    </div>
  );

  const hasEnoughTeams = bracketMode === "flat" ? flatSeeds.length >= 2 : (eastSeeds.length>=1 && westSeeds.length>=1);
  // Finals vertical centering
  const finalsTopPad = Math.max(0, Math.floor((canvasH - 80 - MATCHUP_H) / 2));

  return (
    <div>
      <ErrMsg msg={err} />

      {view === "setup" ? (
        <div style={{ background:"#111", borderRadius:"1rem", border:"1px solid #1e1e1e", padding:20 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
            <div style={{ fontWeight:700, color:"#fff", fontSize:"0.9rem" }}>Setup Bracket — {season}</div>
            {matchups.length>0 && (
              <button onClick={()=>setView("bracket")} style={{ background:"transparent", border:"1px solid #2a2a2a", borderRadius:8, color:"#888", fontSize:"0.8rem", padding:"5px 12px", cursor:"pointer" }}>
                View Existing Bracket →
              </button>
            )}
          </div>

          {/* Mode toggle */}
          <div style={{ display:"flex", gap:0, marginBottom:20, borderRadius:8, overflow:"hidden", border:"1px solid #2a2a2a", width:"fit-content" }}>
            {(["conferences","flat"] as const).map(mode=>(
              <button key={mode} onClick={()=>setBracketMode(mode)}
                style={{ padding:"7px 18px", fontSize:"0.8rem", fontWeight:700, cursor:"pointer", border:"none", borderRight: mode==="conferences" ? "1px solid #2a2a2a" : "none",
                  background: bracketMode===mode ? "#2563eb" : "#161616",
                  color: bracketMode===mode ? "#fff" : "#666" }}>
                {mode==="conferences" ? "🏟 Conferences" : "📋 No Conferences"}
              </button>
            ))}
          </div>

          {bracketMode === "conferences"
            ? <ConferenceSeedPicker allTeams={teams} eastSeeds={eastSeeds} westSeeds={westSeeds} onChangeEast={setEastSeeds} onChangeWest={setWestSeeds} />
            : <FlatSeedPicker allTeams={teams} seeds={flatSeeds} onChange={setFlatSeeds} />
          }

          <div style={{ marginTop:20, paddingTop:16, borderTop:"1px solid #1e1e1e", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
            <button onClick={generateBracket} disabled={generating||!hasEnoughTeams}
              style={{ background:!hasEnoughTeams?"#1a1a1a":"#2563eb", border:"none", borderRadius:8, color:!hasEnoughTeams?"#444":"#fff", fontWeight:700, fontSize:"0.85rem", padding:"8px 20px", cursor:!hasEnoughTeams?"default":"pointer" }}>
              {generating ? "Generating…" : matchups.length>0 ? "↻ Regenerate Bracket" : "Generate Bracket →"}
            </button>
            {!hasEnoughTeams && <span style={{ color:"#444", fontSize:"0.75rem" }}>{bracketMode==="flat" ? "Add at least 2 teams" : "Add at least 1 team per conference"}</span>}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, flexWrap:"wrap", gap:8 }}>
            <button onClick={()=>setView("setup")} style={{ background:"transparent", border:"1px solid #2a2a2a", borderRadius:8, color:"#888", fontSize:"0.8rem", padding:"5px 12px", cursor:"pointer" }}>← Edit Teams</button>
            <span style={{ color:"#555", fontSize:"0.75rem" }}>{matchups.length} matchups · {season}</span>
            <button onClick={clearBracket} disabled={clearing} style={{ background:"#2a0a0a", border:"1px solid #5a1a1a", borderRadius:8, color:"#f87171", fontSize:"0.8rem", padding:"5px 12px", cursor:"pointer" }}>
              {clearing?"Clearing…":"Clear Bracket"}
            </button>
          </div>

          <div style={{ overflowX:"auto", background:"#0a0a0a", borderRadius:"1rem", border:"1px solid #1e1e1e" }}>
            <div ref={innerRef} style={{ position:"relative", minWidth:"max-content", height:canvasH, padding:"28px 36px" }}>
              <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", pointerEvents:"none", overflow:"visible", zIndex:1 }}>
                {connectors.map(c=><path key={c.key} d={c.d} fill="none" stroke="#2a2a2a" strokeWidth={2}/>)}
              </svg>

              {isConferenceBracket ? (
                /* Mirrored conference bracket:
                   WEST (left→right) | Finals (center) | EAST (right→left, rendered Finals→R1) */
                <div style={{ display:"flex", gap:56, alignItems:"flex-start", position:"relative", zIndex:2 }}>

                  {/* ── WEST side: R1 leftmost, Conf Finals rightmost before center ── */}
                  {westRounds.map((col,ri)=>{
                    const isFirstRound = ri === 0;
                    const nextMs = isFirstRound && ri+1 < westRounds.length ? westRounds[ri+1].matchups : null;
                    const visibleMatchups = isFirstRound
                      ? col.matchups.filter(m => m.team1_id && m.team2_id)
                      : col.matchups;
                    return (
                      <div key={col.name} style={{ width:240, flexShrink:0 }}>
                        <div style={{ fontSize:"0.6rem", fontWeight:700, color:"#ef4444", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10, textAlign:"center" }}>
                          {col.name}
                        </div>
                        {nextMs ? (
                          /* First round with bye: absolutely position each matchup */
                          <div style={{ position:"relative", height: visibleMatchups.reduce((mx,_,vi)=>Math.max(mx,calcFirstRoundTop(vi,ri,nextMs)+MATCHUP_H),MATCHUP_H) }}>
                            {visibleMatchups.map((m,vi)=>(
                              <div key={m.id} style={{ position:"absolute", top:calcFirstRoundTop(vi,ri,nextMs), left:0, right:0 }}>
                                <MatchupGroup m={m} conf="W" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display:"flex", flexDirection:"column", paddingTop:topOffsetForRound(ri), gap:gapForRound(ri) }}>
                            {visibleMatchups.map(m=><MatchupGroup key={m.id} m={m} conf="W" />)}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ── CHAMPIONSHIP FINALS: centered vertically ── */}
                  {finalsMatchup && (
                    <div style={{ width:240, flexShrink:0 }}>
                      <div style={{ height: finalsTopPad }} />
                      <div style={{ fontSize:"0.63rem", fontWeight:700, color:"#facc15", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:10, textAlign:"center" }}>🏆 Championship</div>
                      <MatchupGroup m={finalsMatchup} conf="F" />
                    </div>
                  )}

                  {/* ── EAST side: East Finals leftmost (closest to center), East R1 rightmost ── */}
                  {[...eastRounds].reverse().map((col,reverseIdx)=>{
                    const riFromRight = eastRounds.length - 1 - reverseIdx;
                    const isFirstRound = riFromRight === 0;
                    const nextMs = isFirstRound && riFromRight+1 < eastRounds.length ? eastRounds[riFromRight+1].matchups : null;
                    const visibleMatchups = isFirstRound
                      ? col.matchups.filter(m => m.team1_id && m.team2_id)
                      : col.matchups;
                    return (
                      <div key={col.name} style={{ width:240, flexShrink:0 }}>
                        <div style={{ fontSize:"0.6rem", fontWeight:700, color:"#3b82f6", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10, textAlign:"center" }}>
                          {col.name}
                        </div>
                        {nextMs ? (
                          /* First round with bye: absolutely position each matchup */
                          <div style={{ position:"relative", height: visibleMatchups.reduce((mx,_,vi)=>Math.max(mx,calcFirstRoundTop(vi,riFromRight,nextMs)+MATCHUP_H),MATCHUP_H) }}>
                            {visibleMatchups.map((m,vi)=>(
                              <div key={m.id} style={{ position:"absolute", top:calcFirstRoundTop(vi,riFromRight,nextMs), left:0, right:0 }}>
                                <MatchupGroup m={m} conf="E" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display:"flex", flexDirection:"column", paddingTop:topOffsetForRound(riFromRight), gap:gapForRound(riFromRight) }}>
                            {visibleMatchups.map(m=><MatchupGroup key={m.id} m={m} conf="E" />)}
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>
              ) : (
                /* Flat bracket */
                <div style={{ display:"flex", gap:56, alignItems:"flex-start", position:"relative", zIndex:2 }}>
                  {rounds.map((round,ri)=>{
                    const isFirstRound = ri === 0;
                    const visibleMatchups = isFirstRound
                      ? round.matchups.filter(m => m.team1_id && m.team2_id)
                      : round.matchups;
                    return (
                      <div key={round.name} style={{ width:240, flexShrink:0 }}>
                        <div style={{ fontSize:"0.7rem", fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #1e1e1e", textAlign:"center" }}>
                          {round.name}
                        </div>
                        <div style={{ display:"flex", flexDirection:"column", paddingTop:topOffsetForRound(ri), gap:gapForRound(ri) }}>
                          {visibleMatchups.map(m=><MatchupGroup key={m.id} m={m} conf="W" />)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Owners ──────────────────────────────────────────────────────────────

function OwnersTab({ league }: { league: string }) {
  type OwnerRow = { id: string; discord_id: string; league: string; season: string | null; teams: { id: string; name: string; abbreviation: string } };
  type TeamRow = { id: string; name: string; abbreviation: string };
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [discordId, setDiscordId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [season, setSeason] = useState("Season 7");
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    const [o, t] = await Promise.all([
      fetch(`/api/team-owners?league=${league}`).then((r) => r.json()),
      fetch(`/api/teams?league=${league}`).then((r) => r.json()),
    ]);
    setOwners(Array.isArray(o) ? o : []);
    setTeams(Array.isArray(t) ? t : []);
  }, [league]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async () => {
    setErr("");
    if (!discordId.trim() || !teamId) return setErr("Discord ID and team required");
    const r = await fetch("/api/team-owners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discord_id: discordId.trim(), team_id: teamId, league, season }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setDiscordId(""); setTeamId(""); refresh();
  };

  const remove = async (id: string) => {
    await fetch("/api/team-owners", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refresh();
  };

  // Group by season for display
  const bySeason = owners.reduce<Record<string, OwnerRow[]>>((acc, o) => {
    const s = o.season ?? "Unknown";
    if (!acc[s]) acc[s] = [];
    acc[s].push(o);
    return acc;
  }, {});

  return (
    <div>
      <div className={card} style={{ marginBottom: 16 }}>
        <div className="text-sm font-semibold text-slate-300 mb-4">Assign Team Owner</div>
        <div className="flex gap-3 flex-wrap mb-2">
          <input className={input} placeholder="Discord User ID" value={discordId} onChange={(e) => setDiscordId(e.target.value)} style={{ flex: 2, minWidth: 160 }} />
          <select className={input} value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ flex: 2, minWidth: 160 }}>
            <option value="">— Select team —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
          </select>
          <select className={input} value={season} onChange={(e) => setSeason(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
            {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className={btnPrimary} onClick={add}>Assign</button>
        </div>
        <ErrMsg msg={err} />
        <p className="text-xs text-slate-500 mt-2">Discord ID is the numeric user ID. Use Developer Mode in Discord to copy it.</p>
      </div>
      {Object.keys(bySeason).sort((a, b) => b.localeCompare(a)).map(s => (
        <div key={s} className="mb-4">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2 px-1">{s}</div>
          <div className="flex flex-col gap-2">
            {bySeason[s].map((o) => (
              <div key={o.id} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                <div className="flex-1">
                  <div className="text-white font-medium text-sm">{o.teams?.name ?? "Unknown Team"} <span className="text-slate-500">({o.teams?.abbreviation})</span></div>
                  <div className="text-slate-500 text-xs font-mono">{o.discord_id}</div>
                </div>
                <button className={btnDanger} onClick={() => remove(o.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {owners.length === 0 && <div className="text-slate-600 text-sm text-center py-6">No team owners assigned yet.</div>}
    </div>
  );
}

// ─── Tab: Draft Picks ──────────────────────────────────────────────────────────

function DraftPicksTab({ league }: { league: string }) {
  type Pick = {
    id: string; league: string; season: string; round: number; pick_number: number | null;
    notes: string | null; status: string;
    original_team: { id: string; name: string; abbreviation: string; color2: string | null } | null;
    current_team: { id: string; name: string; abbreviation: string; color2: string | null } | null;
  };
  type TeamRow = { id: string; name: string; abbreviation: string };

  const [picks, setPicks] = useState<Pick[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [filterSeason, setFilterSeason] = useState("Season 7");
  const [err, setErr] = useState("");
  const [seedMsg, setSeedMsg] = useState("");
  const [seedBusy, setSeedBusy] = useState(false);
  const [seedSeason, setSeedSeason] = useState("Season 7");
  const [showManual, setShowManual] = useState(false);

  // Manual override form
  const [season, setSeason] = useState("Season 7");
  const [round, setRound] = useState("1");
  const [pickNum, setPickNum] = useState("");
  const [origTeam, setOrigTeam] = useState("");
  const [currTeam, setCurrTeam] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = useCallback(async () => {
    const [p, t] = await Promise.all([
      fetch(`/api/draft-picks?league=${league}&season=${encodeURIComponent(filterSeason)}&status=all`).then(r => r.json()),
      fetch(`/api/teams?league=${league}`).then(r => r.json()),
    ]);
    setPicks(Array.isArray(p) ? p : []);
    setTeams(Array.isArray(t) ? t : []);
  }, [league, filterSeason]);

  useEffect(() => { refresh(); }, [refresh]);

  const seed = async () => {
    setSeedMsg(""); setSeedBusy(true);
    const r = await fetch("/api/draft-picks/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, base_season: seedSeason }),
    });
    const d = await r.json();
    setSeedBusy(false);
    if (!r.ok) { setSeedMsg(`Error: ${d.error}`); return; }
    setSeedMsg(d.created === 0
      ? `All picks already exist (${d.skipped} skipped)`
      : `Created ${d.created} picks for ${d.teams} teams across ${d.seasons?.join(", ")}`
    );
    refresh();
  };

  const add = async () => {
    setErr("");
    if (!origTeam || !round || !season) return setErr("Season, round, and original team required");
    const r = await fetch("/api/draft-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, season, round: Number(round), pick_number: pickNum ? Number(pickNum) : null, original_team_id: origTeam, current_team_id: currTeam || origTeam, notes: notes || null }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setRound("1"); setPickNum(""); setOrigTeam(""); setCurrTeam(""); setNotes(""); refresh();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this draft pick?")) return;
    await fetch("/api/draft-picks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refresh();
  };

  const pickLbl = (p: Pick) => `${p.season} R${p.round}${p.pick_number != null ? ` #${p.pick_number}` : ""}`;

  // Group picks by season → round → team for cleaner display
  const grouped: Record<string, Record<number, Pick[]>> = {};
  for (const p of picks) {
    if (!grouped[p.season]) grouped[p.season] = {};
    if (!grouped[p.season][p.round]) grouped[p.season][p.round] = [];
    grouped[p.season][p.round].push(p);
  }

  return (
    <div>
      {/* Auto-generate section */}
      <div className={card} style={{ marginBottom: 16 }}>
        <div className="text-sm font-semibold text-slate-300 mb-1">Auto-Generate Picks</div>
        <p className="text-xs text-slate-500 mb-3">
          Every team gets Round 1 &amp; Round 2 picks for the base season + next season (2 seasons total). Skips picks that already exist.
        </p>
        <div className="flex gap-3 items-center flex-wrap">
          <div>
            <div className="text-xs text-slate-500 mb-1">Base season (current)</div>
            <select className={input} value={seedSeason} onChange={e => setSeedSeason(e.target.value)} style={{ minWidth: 140 }}>
              {SEASONS.filter(s => !s.includes("Playoff")).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className={btnPrimary} onClick={seed} disabled={seedBusy} style={{ marginTop: 16 }}>
            {seedBusy ? "Generating…" : "Generate Picks for All Teams"}
          </button>
        </div>
        {seedMsg && (
          <p className={`text-xs mt-2 ${seedMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{seedMsg}</p>
        )}
      </div>

      {/* Manual override */}
      <button className={`${btnSecondary} text-xs mb-3`} onClick={() => setShowManual(v => !v)}>
        {showManual ? "▲ Hide manual override" : "▼ Manual pick override"}
      </button>
      {showManual && (
        <div className={card} style={{ marginBottom: 16 }}>
          <div className="text-sm font-semibold text-slate-300 mb-3">Add Single Pick (override)</div>
          <div className="flex gap-3 flex-wrap mb-3">
            <select className={input} value={season} onChange={e => setSeason(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
              {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className={input} type="number" placeholder="Round" min={1} max={2} value={round} onChange={e => setRound(e.target.value)} style={{ width: 80, flex: "none" }} />
            <input className={input} type="number" placeholder="Pick # (opt)" value={pickNum} onChange={e => setPickNum(e.target.value)} style={{ width: 110, flex: "none" }} />
          </div>
          <div className="flex gap-3 flex-wrap mb-3">
            <select className={input} value={origTeam} onChange={e => { setOrigTeam(e.target.value); if (!currTeam) setCurrTeam(e.target.value); }} style={{ flex: 1, minWidth: 160 }}>
              <option value="">— Original team —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
            </select>
            <select className={input} value={currTeam} onChange={e => setCurrTeam(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
              <option value="">— Current owner (defaults to original) —</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <input className={input} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
            <button className={btnPrimary} onClick={add}>Add Pick</button>
          </div>
          <ErrMsg msg={err} />
        </div>
      )}

      {/* Season filter + list */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["Season 7", "Season 8", "Season 6"].map(s => (
          <button key={s} className={filterSeason === s ? btnPrimary : btnSecondary} onClick={() => setFilterSeason(s)}>{s}</button>
        ))}
      </div>

      {picks.length === 0 ? (
        <div className="text-slate-600 text-sm text-center py-6">No picks for {filterSeason}. Use "Generate Picks" above.</div>
      ) : (
        Object.keys(grouped).sort().map(s => (
          <div key={s} className="mb-4">
            {[1, 2].map(rnd => grouped[s]?.[rnd] ? (
              <div key={rnd} className="mb-3">
                <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2 px-1">{s} · Round {rnd}</div>
                <div className="flex flex-col gap-1.5">
                  {grouped[s][rnd].sort((a, b) => (a.original_team?.abbreviation ?? "").localeCompare(b.original_team?.abbreviation ?? "")).map(p => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5">
                      <div className="flex-1 flex items-center gap-3">
                        <span className="text-white font-medium text-sm w-10">{p.original_team?.abbreviation ?? "?"}</span>
                        {p.current_team?.id !== p.original_team?.id ? (
                          <span className="text-xs">
                            <span className="text-slate-500 line-through">{p.original_team?.abbreviation}</span>
                            <span className="text-cyan-400 ml-1">→ {p.current_team?.abbreviation}</span>
                            <span className="text-amber-400 ml-1.5 font-semibold">TRADED</span>
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">owns original pick</span>
                        )}
                        {p.notes && <span className="text-slate-500 text-xs italic">{p.notes}</span>}
                        {p.status !== "active" && <span className="text-xs text-slate-500 bg-slate-800 rounded px-1.5">{p.status}</span>}
                      </div>
                      <button className={btnDanger} onClick={() => remove(p.id)} style={{ padding: "3px 10px", fontSize: 12 }}>Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null)}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Tab: Auction ──────────────────────────────────────────────────────────────

function AuctionAdminTab({ league }: { league: string }) {
  type AuctionRow = {
    id: string; mc_uuid: string; min_price: number; status: string; phase: number;
    season: string | null; closes_at: string; nominated_at: string;
    winning_bid: number | null; winning_is_two_season: boolean; winning_team_id: string | null;
    players: { mc_uuid: string; mc_username: string };
    winning_team: { id: string; name: string; abbreviation: string } | null;
    auction_bids: { id: string; team_id: string; amount: number; is_two_season: boolean; effective_value: number; placed_at: string; is_valid: boolean; teams: { id: string; name: string; abbreviation: string; color2: string | null } }[];
  };
  type TeamRow = { id: string; name: string; abbreviation: string };

  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [filterStatus, setFilterStatus] = useState("active");

  // Nominate form
  const [nomUuid, setNomUuid] = useState("");
  const [nomMinPrice, setNomMinPrice] = useState("1000");
  const [nomPhase, setNomPhase] = useState("1");
  const [nomSeason, setNomSeason] = useState("");
  const [nomErr, setNomErr] = useState("");

  // Close/winner state
  const [closingId, setClosingId] = useState<string | null>(null);
  const [winnerTeam, setWinnerTeam] = useState("");
  const [winnerBid, setWinnerBid] = useState("");
  const [winnerIs2s, setWinnerIs2s] = useState(false);
  const [closeErr, setCloseErr] = useState("");

  // Finalize (create contract) state
  const [finalizeId, setFinalizeId] = useState<string | null>(null);
  const [finalizeErr, setFinalizeErr] = useState("");

  const refresh = useCallback(async () => {
    const [a, p, t] = await Promise.all([
      fetch(`/api/auction?league=${league}${filterStatus !== "all" ? `&status=${filterStatus}` : ""}`).then((r) => r.json()),
      fetch("/api/players").then((r) => r.json()),
      fetch(`/api/teams?league=${league}`).then((r) => r.json()),
    ]);
    setAuctions(Array.isArray(a) ? a : []);
    setPlayers(Array.isArray(p) ? p : []);
    setTeams(Array.isArray(t) ? t : []);
  }, [league, filterStatus]);

  useEffect(() => { refresh(); }, [refresh]);

  const nominate = async () => {
    setNomErr("");
    if (!nomUuid) return setNomErr("Select a player");
    const r = await fetch("/api/auction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, mc_uuid: nomUuid, min_price: parseInt(nomMinPrice) || 1000, phase: parseInt(nomPhase) || 1, season: nomSeason || null }),
    });
    const d = await r.json();
    if (!r.ok) return setNomErr(d.error);
    setNomUuid(""); setNomMinPrice("1000"); refresh();
  };

  const closeAuction = async (auctionId: string) => {
    setCloseErr("");
    if (!winnerTeam) return setCloseErr("Select winning team");
    if (!winnerBid) return setCloseErr("Enter winning bid");
    const r = await fetch(`/api/auction/${auctionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed", winning_team_id: winnerTeam, winning_bid: parseInt(winnerBid), winning_is_two_season: winnerIs2s }),
    });
    if (!r.ok) { const d = await r.json(); return setCloseErr(d.error); }
    setClosingId(null); setWinnerTeam(""); setWinnerBid(""); setWinnerIs2s(false); refresh();
  };

  const setPlayerChoice = async (auctionId: string) => {
    await fetch(`/api/auction/${auctionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "player_choice" }),
    });
    refresh();
  };

  const finalizeContract = async (auction: AuctionRow) => {
    setFinalizeErr("");
    if (!auction.winning_team_id || !auction.winning_bid) return setFinalizeErr("Set a winning team and bid first");
    const r = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        league, mc_uuid: auction.mc_uuid, team_id: auction.winning_team_id,
        amount: auction.winning_bid, is_two_season: auction.winning_is_two_season,
        phase: auction.phase, season: auction.season,
      }),
    });
    if (!r.ok) { const d = await r.json(); return setFinalizeErr(d.error); }
    // Mark auction as signed
    await fetch(`/api/auction/${auction.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "signed" }),
    });
    setFinalizeId(null); refresh();
  };

  const PLAYER_CHOICE_WINDOW = 500;

  return (
    <div>
      {/* Nominate player */}
      <div className={card} style={{ marginBottom: 16 }}>
        <div className="text-sm font-semibold text-slate-300 mb-4">Nominate Player for Auction</div>
        <div className="flex gap-3 flex-wrap mb-3">
          <div style={{ flex: 2, minWidth: 160 }}>
            <PlayerSearchSelect players={players} value={nomUuid} onChange={setNomUuid} placeholder="Search player…" />
          </div>
          <input className={input} type="number" placeholder="Min Price" value={nomMinPrice} onChange={(e) => setNomMinPrice(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
          <input className={input} type="number" placeholder="Phase" value={nomPhase} onChange={(e) => setNomPhase(e.target.value)} style={{ flex: 1, minWidth: 80 }} />
          <input className={input} placeholder="Season (opt)" value={nomSeason} onChange={(e) => setNomSeason(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
          <button className={btnPrimary} onClick={nominate}>Start Auction</button>
        </div>
        <ErrMsg msg={nomErr} />
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {["active", "player_choice", "closed", "signed", "all"].map((s) => (
          <button key={s} className={`${btn} text-xs ${filterStatus === s ? "bg-zinc-600 text-white" : "bg-slate-800 text-slate-400"} border border-slate-700`} onClick={() => setFilterStatus(s)}>
            {s}
          </button>
        ))}
        <button className={`${btnSecondary} text-xs ml-auto`} onClick={refresh}>Refresh</button>
      </div>

      {/* Auction list */}
      {auctions.length === 0 ? (
        <div className="text-slate-600 text-sm text-center py-8">No auctions found.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {auctions.map((a) => {
            const validBids = (a.auction_bids ?? []).filter((b) => b.is_valid);
            const sortedBids = [...validBids].sort((x, y) => y.effective_value - x.effective_value);
            const topBid = sortedBids[0] ?? null;
            const isExpired = new Date(a.closes_at) < new Date() && a.status === "active";
            const choiceBids = topBid ? sortedBids.filter((b) => topBid.effective_value - b.effective_value <= PLAYER_CHOICE_WINDOW) : [];
            const needsChoice = choiceBids.length > 1;

            return (
              <div key={a.id} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <img src={`https://minotar.net/avatar/${a.players.mc_username}/40`} className="w-10 h-10 rounded-lg border border-slate-700" onError={(e) => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/40"; }} alt="" />
                  <div className="flex-1">
                    <div className="text-white font-bold">{a.players.mc_username}</div>
                    <div className="text-slate-500 text-xs">Phase {a.phase}{a.season ? ` · S${a.season}` : ""} · Min: {a.min_price.toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${
                      a.status === "active" ? "border-cyan-800 bg-cyan-950 text-cyan-400" :
                      a.status === "player_choice" ? "border-purple-800 bg-purple-950 text-purple-400" :
                      a.status === "signed" ? "border-green-800 bg-green-950 text-green-400" :
                      "border-slate-700 bg-slate-900 text-slate-500"
                    }`}>{a.status}</span>
                    {isExpired && <span className="text-xs px-2 py-0.5 rounded-full border border-orange-800 bg-orange-950 text-orange-400 font-semibold">EXPIRED</span>}
                  </div>
                </div>

                {/* Bid list */}
                {sortedBids.length > 0 && (
                  <div className="mb-3 flex flex-col gap-1">
                    {sortedBids.slice(0, 6).map((b, i) => (
                      <div key={b.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${i === 0 ? "bg-slate-800 border border-slate-600" : "bg-slate-900 border border-slate-800"}`}>
                        <span className="text-slate-400 w-5 text-center">{i + 1}</span>
                        <span className="text-white flex-1">{b.teams?.name ?? b.team_id.slice(0, 8)}</span>
                        <span className="text-cyan-400 font-bold">{b.effective_value.toLocaleString()}</span>
                        <span className="text-slate-500 text-xs">{b.amount.toLocaleString()}{b.is_two_season ? " 2yr" : ""}</span>
                        {topBid && i > 0 && topBid.effective_value - b.effective_value <= PLAYER_CHOICE_WINDOW && (
                          <span className="text-xs text-yellow-400 border border-yellow-800 rounded px-1">choice</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {a.winning_team && (
                  <div className="mb-3 rounded-lg border border-green-800 bg-green-950 px-3 py-2 text-sm text-green-300">
                    Winner: {a.winning_team.name} — {(a.winning_bid ?? 0).toLocaleString()}{a.winning_is_two_season ? " (2-season)" : ""}
                  </div>
                )}

                {/* Actions */}
                {(a.status === "active" || a.status === "player_choice") && (
                  <div className="mt-3">
                    {closingId === a.id ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 flex-wrap">
                          <select className={input} value={winnerTeam} onChange={(e) => setWinnerTeam(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
                            <option value="">— Winner —</option>
                            {teams.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>)}
                          </select>
                          <input className={input} type="number" placeholder="Winning bid" value={winnerBid} onChange={(e) => setWinnerBid(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
                          <label className="flex items-center gap-1 text-purple-400 text-sm cursor-pointer">
                            <input type="checkbox" checked={winnerIs2s} onChange={(e) => setWinnerIs2s(e.target.checked)} style={{ accentColor: "#a855f7" }} /> 2-season
                          </label>
                          <button className={btnPrimary} onClick={() => closeAuction(a.id)}>Confirm Close</button>
                          <button className={btnSecondary} onClick={() => setClosingId(null)}>Cancel</button>
                        </div>
                        <ErrMsg msg={closeErr} />
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap">
                        <button className={btnSecondary} onClick={() => { setClosingId(a.id); setCloseErr(""); if (topBid) { setWinnerTeam(topBid.team_id); setWinnerBid(String(topBid.amount)); setWinnerIs2s(topBid.is_two_season); } }}>Close Auction</button>
                        {needsChoice && a.status === "active" && (
                          <button className="rounded-lg px-3 py-1.5 text-sm font-medium transition bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800" onClick={() => setPlayerChoice(a.id)}>Set Player Choice</button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Finalize → create contract */}
                {a.status === "closed" && a.winning_team_id && (
                  <div className="mt-3">
                    {finalizeId === a.id ? (
                      <div>
                        <p className="text-slate-400 text-sm mb-2">Create contract: {a.players.mc_username} → {a.winning_team?.name} for {(a.winning_bid ?? 0).toLocaleString()}{a.winning_is_two_season ? " (2-season)" : ""}?</p>
                        <div className="flex gap-2">
                          <button className={btnPrimary} onClick={() => finalizeContract(a)}>Confirm & Sign</button>
                          <button className={btnSecondary} onClick={() => setFinalizeId(null)}>Cancel</button>
                        </div>
                        <ErrMsg msg={finalizeErr} />
                      </div>
                    ) : (
                      <button className="rounded-lg px-3 py-1.5 text-sm font-medium transition bg-green-950 hover:bg-green-900 text-green-300 border border-green-800" onClick={() => { setFinalizeId(a.id); setFinalizeErr(""); }}>Finalize Signing</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Trades ───────────────────────────────────────────────────────────────

function TradesAdminTab({ league }: { league: string }) {
  type TradeRow = {
    id: string; league: string; proposing_team_id: string; receiving_team_id: string;
    status: string; proposed_at: string; resolved_at: string | null; notes: string | null; admin_note: string | null;
    proposing_team: { id: string; name: string; abbreviation: string; color2: string | null };
    receiving_team: { id: string; name: string; abbreviation: string; color2: string | null };
    trade_assets: {
      id: string; from_team_id: string;
      contract_id: string | null; retention_amount: number; pick_id: string | null;
      contracts: { id: string; mc_uuid: string; amount: number; is_two_season: boolean; players: { mc_uuid: string; mc_username: string } } | null;
      draft_picks: { id: string; season: string; round: number; pick_number: number | null; original_team: { id: string; name: string; abbreviation: string } | null } | null;
      from_team: { id: string; name: string; abbreviation: string } | null;
    }[];
  };
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [filterStatus, setFilterStatus] = useState("admin_review");
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<Record<string, boolean>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/trades?league=${league}${filterStatus !== "all" ? `&status=${filterStatus}` : ""}`);
    const d = await r.json();
    setTrades(Array.isArray(d) ? d : []);
  }, [league, filterStatus]);

  useEffect(() => { refresh(); }, [refresh]);

  const act = async (tradeId: string, action: string) => {
    setActing((a) => ({ ...a, [tradeId]: true }));
    setErrs((e) => ({ ...e, [tradeId]: "" }));
    const r = await fetch(`/api/trades/${tradeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, admin_note: adminNotes[tradeId] ?? null }),
    });
    const d = await r.json();
    setActing((a) => ({ ...a, [tradeId]: false }));
    if (!r.ok) setErrs((e) => ({ ...e, [tradeId]: d.error }));
    else refresh();
  };

  const statusColors: Record<string, string> = {
    pending: "text-yellow-400 border-yellow-800 bg-yellow-950",
    admin_review: "text-purple-400 border-purple-800 bg-purple-950",
    approved: "text-green-400 border-green-800 bg-green-950",
    rejected: "text-red-400 border-red-800 bg-red-950",
    denied: "text-red-400 border-red-800 bg-red-950",
    cancelled: "text-slate-500 border-slate-700 bg-slate-900",
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {["admin_review", "pending", "approved", "rejected", "denied", "all"].map((s) => (
          <button key={s} className={`${btn} text-xs ${filterStatus === s ? "bg-zinc-600 text-white" : "bg-slate-800 text-slate-400"} border border-slate-700`} onClick={() => setFilterStatus(s)}>
            {s.replace("_", " ")}
          </button>
        ))}
        <button className={`${btnSecondary} text-xs ml-auto`} onClick={refresh}>Refresh</button>
      </div>

      {trades.length === 0 ? (
        <div className="text-slate-600 text-sm text-center py-8">No trades found with status "{filterStatus}".</div>
      ) : (
        <div className="flex flex-col gap-4">
          {trades.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="text-white font-semibold">
                  {t.proposing_team.name} <span className="text-slate-500">→</span> {t.receiving_team.name}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${statusColors[t.status] ?? "text-slate-400 border-slate-700 bg-slate-900"}`}>
                  {t.status.replace("_", " ")}
                </span>
              </div>

              {/* Assets */}
              <div className="grid grid-cols-2 gap-4 mb-3">
                {[
                  { label: `${t.proposing_team.abbreviation} sends`, assets: (t.trade_assets ?? []).filter((a) => a.from_team_id === t.proposing_team_id) },
                  { label: `${t.receiving_team.abbreviation} sends`, assets: (t.trade_assets ?? []).filter((a) => a.from_team_id === t.receiving_team_id) },
                ].map((side) => (
                  <div key={side.label}>
                    <div className="text-slate-500 text-xs mb-1.5">{side.label}</div>
                    {side.assets.length === 0 ? <div className="text-slate-700 text-sm">—</div> : side.assets.map((a) => (
                      <div key={a.id} className="text-sm mb-1">
                        {a.pick_id && a.draft_picks ? (
                          <span className="text-yellow-400">
                            🏀 {a.draft_picks.season} R{a.draft_picks.round}{a.draft_picks.pick_number != null ? ` #${a.draft_picks.pick_number}` : ""}
                            {a.draft_picks.original_team && <span className="text-slate-500 ml-1 text-xs">({a.draft_picks.original_team.abbreviation})</span>}
                          </span>
                        ) : (
                          <span className="text-slate-300">
                            {a.contracts?.players.mc_username ?? "?"} — {(a.contracts?.amount ?? 0).toLocaleString()}
                            {a.contracts?.is_two_season && <span className="text-purple-400 ml-1 text-xs">2yr</span>}
                            {(a.retention_amount ?? 0) > 0 && <span className="text-yellow-400 ml-1 text-xs">ret. {a.retention_amount.toLocaleString()}</span>}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {t.notes && <div className="text-slate-500 text-sm italic mb-3">"{t.notes}"</div>}

              {/* Admin actions */}
              {t.status === "admin_review" && (
                <div className="flex flex-col gap-2">
                  <input
                    className={input}
                    placeholder="Admin note (optional)"
                    value={adminNotes[t.id] ?? ""}
                    onChange={(e) => setAdminNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button className="rounded-lg px-3 py-1.5 text-sm font-medium bg-green-950 hover:bg-green-900 text-green-300 border border-green-800 transition" disabled={acting[t.id]} onClick={() => act(t.id, "approve")}>Approve</button>
                    <button className={btnDanger} disabled={acting[t.id]} onClick={() => act(t.id, "deny")}>Deny</button>
                  </div>
                  {errs[t.id] && <ErrMsg msg={errs[t.id]} />}
                </div>
              )}
              {t.admin_note && <div className="text-purple-400 text-sm mt-2">Admin note: {t.admin_note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Board: constants ─────────────────────────────────────────────────────────

const BOARD_SEASONS = ["Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7"];
const BOARD_AWARDS = [
  { key: "MVP",  label: "Most Valuable Player" },
  { key: "DPOY", label: "Defensive Player of the Year" },
  { key: "ROY",  label: "Rookie of the Year" },
  { key: "MIP",  label: "Most Improved Player" },
  { key: "SMOY", label: "6th Man of the Year" },
];
// Points: player rank 1=10 … 10=1; team rank 1=N … N=1; award 1=5, 2=3, 3=1
function boardPlayerPts(rank: number) { return Math.max(0, 11 - rank); }
function boardAwardPts(rank: number)  { return rank === 1 ? 5 : rank === 2 ? 3 : 1; }

// ─── Tab: Board Members (admin) ───────────────────────────────────────────────

function BoardMembersTab({ league }: { league: string }) {
  type Member = { id: string; discord_id: string; league: string; season: string; name: string | null };
  const [members, setMembers] = useState<Member[]>([]);
  const [discordId, setDiscordId] = useState("");
  const [season, setLocalSeason] = useState("Season 7");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const refresh = useCallback(async () => {
    const data = await fetch(`/api/board-members?league=${league}`).then(r => r.json());
    setMembers(Array.isArray(data) ? data : []);
  }, [league]);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async () => {
    setErr("");
    if (!discordId.trim()) return setErr("Discord ID required");
    const r = await fetch("/api/board-members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discord_id: discordId.trim(), league, season, name: name.trim() || null }),
    });
    const d = await r.json();
    if (!r.ok) return setErr(d.error);
    setDiscordId(""); setName(""); refresh();
  };

  const remove = async (id: string) => {
    await fetch("/api/board-members", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refresh();
  };

  const bySeason = members.reduce<Record<string, Member[]>>((acc, m) => {
    const s = m.season ?? "Unknown";
    if (!acc[s]) acc[s] = [];
    acc[s].push(m); return acc;
  }, {});

  return (
    <div>
      <div className={card} style={{ marginBottom: 16 }}>
        <div className="text-sm font-semibold text-slate-300 mb-4">Add Board Member</div>
        <div className="flex gap-3 flex-wrap mb-2">
          <input className={input} placeholder="Discord User ID" value={discordId} onChange={e => setDiscordId(e.target.value)} style={{ flex: 2, minWidth: 160 }} />
          <input className={input} placeholder="Display name (optional)" value={name} onChange={e => setName(e.target.value)} style={{ flex: 2, minWidth: 140 }} />
          <select className={input} value={season} onChange={e => setLocalSeason(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
            {BOARD_SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className={btnPrimary} onClick={add}>Add</button>
        </div>
        <ErrMsg msg={err} />
        <p className="text-xs text-slate-500 mt-2">Use Developer Mode in Discord to copy the numeric User ID.</p>
      </div>
      {Object.keys(bySeason).sort((a, b) => b.localeCompare(a)).map(s => (
        <div key={s} className="mb-4">
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2 px-1">{s}</div>
          <div className="flex flex-col gap-2">
            {bySeason[s].map(m => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">
                <div className="flex-1">
                  <div className="text-white font-medium text-sm">{m.name ?? "Unnamed"}</div>
                  <div className="text-slate-500 text-xs font-mono">{m.discord_id}</div>
                </div>
                <button className={btnDanger} onClick={() => remove(m.id)}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {members.length === 0 && <div className="text-slate-600 text-sm text-center py-6">No board members registered yet.</div>}
    </div>
  );
}

// ─── Board Portal View ────────────────────────────────────────────────────────

function BoardPortalView({ league, onBack }: { league: string; onBack?: () => void }) {
  type PlayerRow = { mc_uuid: string; mc_username: string };
  type TeamRow   = { id: string; name: string; abbreviation: string };

  const [ballotSeason, setBallotSeason] = useState(BOARD_SEASONS[BOARD_SEASONS.length - 1]);
  const [boardTab, setBoardTab] = useState<"players" | "teams" | "awards">("players");

  // Data
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [teams, setTeams]     = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Ballot state
  const [playerRanks, setPlayerRanks] = useState<string[]>(Array(10).fill(""));
  const [teamRanks, setTeamRanks]     = useState<string[]>([]);
  const [awardVotes, setAwardVotes]   = useState<Record<string, Record<string, string>>>({});

  // Save state
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Results
  const [results, setResults]             = useState<any>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  // Load teams per season (season-aware)
  useEffect(() => {
    fetch(`/api/teams?league=${league}&season=${encodeURIComponent(ballotSeason)}`)
      .then(r => r.json())
      .then(t => {
        const ts: TeamRow[] = Array.isArray(t) ? t : [];
        setTeams(ts);
        setTeamRanks(Array(ts.length).fill(""));
      });
  }, [league, ballotSeason]);

  // Load players per season
  useEffect(() => {
    setLoading(true);
    fetch(`/api/teams/players?league=${league}&season=${encodeURIComponent(ballotSeason)}`)
      .then(r => r.json())
      .then(pt => {
        const seen = new Set<string>();
        const ps: PlayerRow[] = [];
        for (const entry of (Array.isArray(pt) ? pt : [])) {
          if (entry.players && !seen.has(entry.mc_uuid)) {
            seen.add(entry.mc_uuid);
            ps.push({ mc_uuid: entry.mc_uuid, mc_username: entry.players.mc_username });
          }
        }
        ps.sort((a, b) => a.mc_username.localeCompare(b.mc_username));
        setPlayers(ps);
        setLoading(false);
      });
  }, [league, ballotSeason]);

  // Load my existing votes when season changes
  useEffect(() => {
    fetch(`/api/board-votes?league=${league}&season=${encodeURIComponent(ballotSeason)}`)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!Array.isArray(data)) return;
        const pr = Array(10).fill("");
        const tr: Record<number, string> = {};
        const av: Record<string, Record<string, string>> = {};
        for (const v of data) {
          if (v.vote_type === "player" && v.rank >= 1 && v.rank <= 10) pr[v.rank - 1] = v.mc_uuid ?? "";
          else if (v.vote_type === "team" && v.rank >= 1) tr[v.rank - 1] = v.team_id ?? "";
          else if (v.vote_type === "award" && v.category) {
            if (!av[v.category]) av[v.category] = {};
            av[v.category][String(v.rank)] = v.mc_uuid ?? "";
          }
        }
        setPlayerRanks(pr);
        setTeamRanks(prev => {
          const next = [...prev];
          Object.entries(tr).forEach(([i, tid]) => { if (parseInt(i) < next.length) next[parseInt(i)] = tid; });
          return next;
        });
        setAwardVotes(av);
      });
  }, [league, ballotSeason]);

  // Load results
  const loadResults = useCallback(() => {
    setResultsLoading(true);
    fetch(`/api/board-votes/results?league=${league}&season=${encodeURIComponent(ballotSeason)}`)
      .then(r => r.json())
      .then(d => { setResults(d); setResultsLoading(false); })
      .catch(() => setResultsLoading(false));
  }, [league, ballotSeason]);

  useEffect(() => { loadResults(); }, [loadResults]);

  const saveBallot = async () => {
    setSaving(true); setSaveMsg("");
    const votes: any[] = [];
    playerRanks.forEach((uuid, i) => { if (uuid) votes.push({ vote_type: "player", rank: i + 1, mc_uuid: uuid }); });
    teamRanks.forEach((tid, i)   => { if (tid)  votes.push({ vote_type: "team",   rank: i + 1, team_id: tid }); });
    for (const [aKey, ranks] of Object.entries(awardVotes)) {
      for (const [rank, uuid] of Object.entries(ranks)) {
        if (uuid) votes.push({ vote_type: "award", category: aKey, rank: parseInt(rank), mc_uuid: uuid });
      }
    }
    const r = await fetch("/api/board-votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ league, season: ballotSeason, votes }),
    });
    if (r.ok) { setSaveMsg("✓ Saved!"); loadResults(); }
    else { const d = await r.json(); setSaveMsg(d.error ?? "Error saving"); }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 4000);
  };

  function playerOpts(selectedUuids: string[], thisVal: string) {
    const used = new Set(selectedUuids.filter(u => u && u !== thisVal));
    return players.filter(p => !used.has(p.mc_uuid));
  }
  function teamOpts(selectedIds: string[], thisVal: string) {
    const used = new Set(selectedIds.filter(u => u && u !== thisVal));
    return teams.filter(t => !used.has(t.id));
  }
  function awardPlayerOpts(awardKey: string, thisRank: string) {
    const ranks = awardVotes[awardKey] ?? {};
    const used = new Set(Object.entries(ranks).filter(([r]) => r !== thisRank).map(([, u]) => u).filter(Boolean));
    return players.filter(p => !used.has(p.mc_uuid));
  }

  const ordinal = (n: number) => ["1st","2nd","3rd","4th","5th","6th","7th","8th","9th","10th"][n] ?? `${n+1}th`;

  // ── shared save bar ──
  const SaveBar = () => (
    <div className="flex items-center gap-4 pt-4 mt-2 border-t border-slate-800">
      <button
        className={`rounded-lg px-6 py-2.5 text-sm font-semibold transition ${saving ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-purple-700 hover:bg-purple-600 text-white"}`}
        onClick={saveBallot} disabled={saving}>
        {saving ? "Saving..." : "Save Ballot"}
      </button>
      {saveMsg && <span className={`text-sm font-medium ${saveMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>{saveMsg}</span>}
    </div>
  );

  // ── results side panel ──
  const ResultsPanel = () => {
    if (resultsLoading) return <div className="text-slate-600 text-xs text-center py-6">Loading results…</div>;
    if (!results) return <div className="text-slate-700 text-xs text-center py-6">No results yet.</div>;
    const voterLine = <div className="text-xs text-slate-600 mb-3">{results.totalVoters} voter{results.totalVoters !== 1 ? "s" : ""}</div>;

    if (boardTab === "players") {
      if (!results.players?.length) return <>{voterLine}<div className="text-slate-600 text-xs">No player votes yet.</div></>;
      return (
        <>
          {voterLine}
          <div className="flex flex-col gap-1.5">
            {results.players.map((row: any) => {
              const p = players.find(pl => pl.mc_uuid === row.mc_uuid);
              return (
                <div key={row.mc_uuid} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <span className="text-slate-500 font-mono text-xs w-5 flex-shrink-0">#{row.place}</span>
                  <img src={`https://minotar.net/avatar/${p?.mc_username ?? "MHF_Steve"}/20`} className="w-5 h-5 rounded flex-shrink-0" alt="" onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/20"; }} />
                  <span className="text-white text-xs flex-1 truncate">{p?.mc_username ?? row.mc_uuid}</span>
                  <span className="text-purple-400 text-xs font-bold flex-shrink-0">{row.points}pt</span>
                </div>
              );
            })}
          </div>
        </>
      );
    }

    if (boardTab === "teams") {
      if (!results.teams?.length) return <>{voterLine}<div className="text-slate-600 text-xs">No team votes yet.</div></>;
      return (
        <>
          {voterLine}
          <div className="flex flex-col gap-1.5">
            {results.teams.map((row: any) => {
              const t = teams.find(tm => tm.id === row.team_id);
              return (
                <div key={row.team_id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <span className="text-slate-500 font-mono text-xs w-5 flex-shrink-0">#{row.place}</span>
                  <span className="text-white text-xs flex-1 truncate">{t ? `${t.name} (${t.abbreviation})` : row.team_id}</span>
                  <span className="text-purple-400 text-xs font-bold flex-shrink-0">{row.points}pt</span>
                </div>
              );
            })}
          </div>
        </>
      );
    }

    // awards tab
    const hasAwards = Object.keys(results.awards ?? {}).some(k => results.awards[k]?.length > 0);
    if (!hasAwards) return <>{voterLine}<div className="text-slate-600 text-xs">No award votes yet.</div></>;
    return (
      <>
        {voterLine}
        <div className="flex flex-col gap-4">
          {BOARD_AWARDS.filter(a => results.awards?.[a.key]?.length > 0).map(award => (
            <div key={award.key}>
              <div className="text-xs font-semibold text-purple-400 mb-1.5">{award.label}</div>
              {results.awards[award.key].map((row: any) => {
                const p = players.find(pl => pl.mc_uuid === row.mc_uuid);
                return (
                  <div key={row.mc_uuid} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 mb-1">
                    <span className="text-slate-500 font-mono text-xs w-5 flex-shrink-0">#{row.place}</span>
                    <img src={`https://minotar.net/avatar/${p?.mc_username ?? "MHF_Steve"}/18`} className="w-4 h-4 rounded flex-shrink-0" alt="" onError={e => { (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/18"; }} />
                    <span className="text-white text-xs flex-1 truncate">{p?.mc_username ?? row.mc_uuid}</span>
                    <span className="text-purple-400 text-xs font-bold flex-shrink-0">{row.points}pt</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </>
    );
  };

  if (loading) return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-3">
        {onBack && <button className={btnSecondary} onClick={onBack}>← Back</button>}
        <h2 className="text-xl font-bold text-white">Board Portal</h2>
      </div>
      <div className="p-10 text-center text-slate-500">Loading…</div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {onBack && <button className={btnSecondary} onClick={onBack}>← Back</button>}
          <h2 className="text-xl font-bold text-white">Board Portal</h2>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-medium">Season:</label>
          <select className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-zinc-500 focus:outline-none"
            value={ballotSeason} onChange={e => setBallotSeason(e.target.value)}>
            {BOARD_SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs: Players | Teams | Awards */}
      <div className="flex border-b border-slate-800">
        {(["players", "teams", "awards"] as const).map(t => (
          <button key={t} onClick={() => setBoardTab(t)}
            className={`px-5 py-3 text-sm font-medium capitalize transition ${boardTab === t ? "border-b-2 border-purple-500 text-white" : "text-slate-500 hover:text-slate-300"}`}>
            {t === "players" ? "Players" : t === "teams" ? `Teams (${teams.length})` : "Awards"}
          </button>
        ))}
      </div>

      <div className="p-6">
        {/* Side-by-side: ballot left, results right */}
        <div className="flex gap-6" style={{ alignItems: "flex-start" }}>

          {/* ── LEFT: Ballot ── */}
          <div className="flex-1 min-w-0">

            {/* Players tab */}
            {boardTab === "players" && (
              <div>
                <div className="text-base font-bold text-white mb-1">Top 10 Players</div>
                <div className="text-xs text-slate-500 mb-4">1st = 10 pts · 10th = 1 pt</div>
                <div className="flex flex-col gap-2">
                  {playerRanks.map((val, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-slate-500 text-xs font-mono w-7 text-right flex-shrink-0">{ordinal(i)}</span>
                      <select
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                        value={val}
                        onChange={e => { const n = [...playerRanks]; n[i] = e.target.value; setPlayerRanks(n); }}>
                        <option value="">— Select player —</option>
                        {playerOpts(playerRanks, val).map(p => (
                          <option key={p.mc_uuid} value={p.mc_uuid}>{p.mc_username}</option>
                        ))}
                      </select>
                      <span className="text-xs font-bold text-purple-400 w-10 flex-shrink-0 text-right">{val ? `+${boardPlayerPts(i + 1)}` : ""}</span>
                    </div>
                  ))}
                </div>
                <SaveBar />
              </div>
            )}

            {/* Teams tab */}
            {boardTab === "teams" && (
              <div>
                <div className="text-base font-bold text-white mb-1">Team Rankings</div>
                <div className="text-xs text-slate-500 mb-4">Rank all {teams.length} teams · 1st = {teams.length} pts · last = 1 pt</div>
                {teams.length === 0
                  ? <div className="text-slate-600 text-sm py-4">No teams found for {ballotSeason}.</div>
                  : (
                    <div className="flex flex-col gap-2">
                      {teamRanks.map((val, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-slate-500 text-xs font-mono w-7 text-right flex-shrink-0">{ordinal(i)}</span>
                          <select
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
                            value={val}
                            onChange={e => { const n = [...teamRanks]; n[i] = e.target.value; setTeamRanks(n); }}>
                            <option value="">— Select team —</option>
                            {teamOpts(teamRanks, val).map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.abbreviation})</option>
                            ))}
                          </select>
                          <span className="text-xs font-bold text-purple-400 w-10 flex-shrink-0 text-right">{val ? `+${teams.length - i}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                <SaveBar />
              </div>
            )}

            {/* Awards tab */}
            {boardTab === "awards" && (
              <div>
                <div className="text-base font-bold text-white mb-1">Award Votes</div>
                <div className="text-xs text-slate-500 mb-4">Top 3 per award · 1st = 5 pts · 2nd = 3 pts · 3rd = 1 pt</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {BOARD_AWARDS.map(award => (
                    <div key={award.key} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                      <div className="text-sm font-semibold text-purple-300 mb-3">{award.label}</div>
                      <div className="flex flex-col gap-2">
                        {[1, 2, 3].map(rank => {
                          const val = awardVotes[award.key]?.[String(rank)] ?? "";
                          return (
                            <div key={rank} className="flex items-center gap-2">
                              <span className="text-slate-500 text-xs w-6 flex-shrink-0">{ordinal(rank - 1)}</span>
                              <select
                                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white focus:border-purple-500 focus:outline-none"
                                value={val}
                                onChange={e => setAwardVotes(prev => ({ ...prev, [award.key]: { ...(prev[award.key] ?? {}), [String(rank)]: e.target.value } }))}>
                                <option value="">— Select player —</option>
                                {awardPlayerOpts(award.key, String(rank)).map(p => (
                                  <option key={p.mc_uuid} value={p.mc_uuid}>{p.mc_username}</option>
                                ))}
                              </select>
                              {val && <span className="text-xs text-purple-400 font-bold w-8 flex-shrink-0 text-right">+{boardAwardPts(rank)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <SaveBar />
              </div>
            )}
          </div>

          {/* ── RIGHT: Results ── */}
          <div className="w-64 flex-shrink-0 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Live Results</div>
            <ResultsPanel />
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Backup / Restore Tab (super-admin only) ──────────────────────────────────

const SUPER_ADMIN_ID = "692814756695900191";

function BackupTab() {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [restoreResults, setRestoreResults] = useState<Record<string, string> | null>(null);

  const handleBackup = async () => {
    setBusy(true);
    setStatus("Fetching backup…");
    setRestoreResults(null);
    try {
      const r = await fetch("/api/admin/backup");
      if (!r.ok) { setStatus("Error: " + (await r.json()).error); return; }
      const json = await r.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `partix-backup-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const total = Object.values(json.data as Record<string,unknown[]>).reduce((s,t)=>s+t.length,0);
      setStatus(`Backup saved — ${total} total rows across ${Object.keys(json.data).length} tables.${json.errors?.length ? " ⚠️ Some tables had errors: " + json.errors.join("; ") : ""}`);
    } catch (e: any) {
      setStatus("Failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (file: File) => {
    const text = await file.text();
    let payload: any;
    try { payload = JSON.parse(text); } catch { setStatus("Invalid JSON file."); return; }
    if (!payload.data) { setStatus("Invalid backup format — missing 'data' field."); return; }

    const confirmed = window.confirm(
      `Restore backup from ${payload.created_at ?? "unknown date"}?\n\nThis will UPSERT all rows from the backup into the database. Existing rows with matching primary keys will be overwritten.\n\nAre you sure?`
    );
    if (!confirmed) return;

    setBusy(true);
    setStatus("Restoring…");
    setRestoreResults(null);
    try {
      const r = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload.data, confirmRestore: true }),
      });
      const result = await r.json();
      if (!r.ok) { setStatus("Error: " + result.error); return; }
      setRestoreResults(result.results);
      setStatus("Restore complete.");
    } catch (e: any) {
      setStatus("Failed: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-950 p-5 space-y-3">
        <h3 className="text-white font-bold text-lg">Save Backup</h3>
        <p className="text-slate-400 text-sm">Downloads a full JSON backup of all database tables.</p>
        <button
          onClick={handleBackup}
          disabled={busy}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "Working…" : "Download Backup"}
        </button>
      </div>

      <div className="rounded-xl border border-red-900 bg-slate-950 p-5 space-y-3">
        <h3 className="text-white font-bold text-lg">Restore from Backup</h3>
        <p className="text-slate-400 text-sm">
          Select a previously downloaded backup JSON file. Rows will be upserted — existing data with matching IDs will be overwritten.
        </p>
        <label className={`inline-block px-5 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-white text-sm font-semibold cursor-pointer ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          {busy ? "Working…" : "Choose Backup File…"}
          <input
            type="file"
            accept=".json"
            className="hidden"
            disabled={busy}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleRestore(f); e.target.value = ""; }}
          />
        </label>
      </div>

      {status && (
        <p className={`text-sm font-medium ${status.startsWith("Error") || status.startsWith("Failed") || status.startsWith("Invalid") ? "text-red-400" : "text-green-400"}`}>
          {status}
        </p>
      )}

      {restoreResults && (
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-1">
          <p className="text-slate-400 text-xs font-bold uppercase mb-2">Restore Results</p>
          {Object.entries(restoreResults).map(([table, res]) => (
            <div key={table} className="flex justify-between text-xs">
              <span className="text-slate-300 font-mono">{table}</span>
              <span className={res.startsWith("error") ? "text-red-400" : res.startsWith("skipped") ? "text-slate-500" : "text-green-400"}>{res}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

const TABS = ["Players", "Teams", "Schedule", "Box Scores", "Accolades", "Champions", "Articles", "Stats", "Playoffs", "Owners", "Draft Picks", "Auction", "Trades", "Board"] as const;
type Tab = typeof TABS[number] | "Backup";
const SEASONS = ["Season 1","Season 1 Playoffs","Season 2","Season 2 Playoffs","Season 3","Season 3 Playoffs","Season 4","Season 4 Playoffs","Season 5","Season 5 Playoffs","Season 6","Season 6 Playoffs","Season 7","Season 7 Playoffs"];

export default function AdminPage({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const league = resolved.league ?? "";

  const { data: session, status } = useSession();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [ownerRecord, setOwnerRecord] = useState<{ teams: { id: string; name: string; abbreviation: string; color2: string | null; division: string | null; logo_url: string | null } } | null | "loading">("loading");
  const [isBoardMember, setIsBoardMember] = useState<boolean | "loading">("loading");
  const [portal, setPortal] = useState<"admin" | "owner" | "board" | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Players");
  const [dbError, setDbError] = useState("");
  const [season, setSeason] = useState("Season 7");

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/admin/check")
        .then((r) => r.json())
        .then((data) => setAuthorized(data.authorized));
      fetch(`/api/owner/team?league=${league}`)
        .then((r) => r.json())
        .then((data) => setOwnerRecord(Array.isArray(data) && data.length > 0 ? data[0] : null))
        .catch(() => setOwnerRecord(null));
      fetch(`/api/board-members?league=${league}&check=me`)
        .then((r) => r.json())
        .then((data) => setIsBoardMember(data.isMember === true))
        .catch(() => setIsBoardMember(false));
    } else if (status !== "loading") {
      setOwnerRecord(null);
      setIsBoardMember(false);
    }
  }, [status, league]);

  useEffect(() => {
    if (!league) return;
    fetch(`/api/teams?league=${league}`)
      .then((r) => {
        if (!r.ok) setDbError("Database unreachable — make sure your Supabase project is active at supabase.com and tables have been created.");
        else setDbError("");
      })
      .catch(() => setDbError("Database unreachable — make sure your Supabase project is active at supabase.com and tables have been created."));
  }, [league]);

  if (status === "loading" || ownerRecord === "loading" || isBoardMember === "loading")
    return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">Loading...</div>;

  if (status !== "authenticated") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800">
          <h2 className="text-2xl font-bold text-white">Portal Login</h2>
          <p className="text-slate-400 text-sm mt-0.5">Sign in with Discord to access your portal.</p>
        </div>
        <div className="p-8">
          <button className={`${btnPrimary} text-base px-6 py-3`} onClick={() => signIn("discord")}>Sign in with Discord</button>
        </div>
      </div>
    );
  }

  const isAdmin = authorized === true;
  const isOwner = ownerRecord !== null;
  const isBoardMemberBool = isBoardMember === true;
  const hasAccess = isAdmin || isOwner || isBoardMemberBool;

  // Still checking admin status
  if (authorized === null)
    return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">Checking access...</div>;

  if (!hasAccess) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800"><h2 className="text-2xl font-bold text-white">No Access</h2></div>
        <div className="p-8">
          <p className="text-slate-400 mb-4">Your Discord account is not linked to any team or admin role. Contact the commissioner.</p>
          <button className={btnSecondary} onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  // ── Portal hub landing ─────────────────────────────────────────────────────
  if (portal === null) {
    const portals = [
      {
        id: "admin" as const,
        label: "Admin",
        desc: "Manage players, teams, games, auctions, and trades",
        color: "#3b82f6",
        border: "#1d4ed8",
        bg: "#0a1628",
        available: isAdmin,
        badge: isAdmin ? null : "No Access",
      },
      {
        id: "owner" as const,
        label: "Team Owner Portal",
        desc: isOwner
          ? `${(ownerRecord as any).teams?.name ?? "Your Team"} — roster, bidding, trades`
          : "Your Discord account is not linked to a team",
        color: "#f59e0b",
        border: "#b45309",
        bg: "#1c1000",
        available: isAdmin || isOwner,
        badge: (!isAdmin && !isOwner) ? "No Access" : null,
      },
      {
        id: "board" as const,
        label: "Board Portal",
        desc: (isAdmin || isBoardMemberBool)
          ? "Cast your player, team, and award rankings"
          : "You are not registered as a board member",
        color: "#8b5cf6",
        border: "#6d28d9",
        bg: "#0d0a1a",
        available: isAdmin || isBoardMemberBool,
        badge: (!isAdmin && !isBoardMemberBool) ? "No Access" : null,
      },
    ];

    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Portals</h2>
            <p className="text-slate-500 text-sm mt-0.5">{league.toUpperCase()} · {session?.user?.name}</p>
          </div>
          <button className={btnSecondary} onClick={() => signOut()}>Sign out</button>
        </div>
        <div className="p-6 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {portals.map((p) => (
            <button
              key={p.id}
              disabled={!p.available}
              onClick={p.available ? () => setPortal(p.id) : undefined}
              className="text-left rounded-xl border p-5 transition-all duration-150 flex flex-col gap-3"
              style={{
                background: p.available ? p.bg : "#0a0a0a",
                borderColor: p.available ? p.border : "#1a1a1a",
                opacity: p.available ? 1 : 0.5,
                cursor: p.available ? "pointer" : "default",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-bold" style={{ color: p.available ? p.color : "#444" }}>{p.label}</span>
                {p.badge && (
                  <span className="text-xs px-2 py-0.5 rounded-full border" style={{ color: "#666", borderColor: "#2a2a2a", background: "#111" }}>{p.badge}</span>
                )}
              </div>
              <p className="text-sm" style={{ color: p.available ? "#888" : "#444" }}>{p.desc}</p>
              {p.available && (
                <span className="text-xs font-semibold" style={{ color: p.color }}>Enter →</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Board portal ───────────────────────────────────────────────────────────
  if (portal === "board") {
    return <BoardPortalView league={league} onBack={() => setPortal(null)} />;
  }

  // ── Owner portal ───────────────────────────────────────────────────────────
  if (portal === "owner") {
    const record = isOwner ? ownerRecord as any : null;
    if (!record) {
      return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-3">
            <button className={btnSecondary} onClick={() => setPortal(null)}>← Back</button>
            <h2 className="text-xl font-bold text-white">Team Owner Portal</h2>
          </div>
          <div className="p-8 text-slate-500">You are not assigned to a team in this league.</div>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="p-6">
          <OwnerPortalView teamRecord={record} leagueSlug={league} onBack={() => setPortal(null)} />
        </div>
      </div>
    );
  }

  // ── Admin portal ───────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
      {dbError && (
        <div className="px-6 py-3 bg-red-950 border-b border-red-800 flex items-center gap-2">
          <span className="text-red-300 text-sm">⚠ {dbError}</span>
        </div>
      )}

      <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button className={btnSecondary} onClick={() => setPortal(null)}>← Portals</button>
          <div>
            <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
            <p className="text-slate-400 text-sm mt-0.5">{league.toUpperCase()} · {session?.user?.name}</p>
          </div>
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
        {(session as any)?.user?.id?.toString() === SUPER_ADMIN_ID && (
          <button
            onClick={() => setActiveTab("Backup")}
            className={`px-5 py-3.5 text-sm font-medium transition whitespace-nowrap border-b-2 ${activeTab === "Backup" ? "border-yellow-400 text-yellow-400" : "border-transparent text-yellow-600 hover:text-yellow-400 hover:border-yellow-600"}`}
          >
            Backup
          </button>
        )}
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
        {activeTab === "Owners" && <OwnersTab league={league} />}
        {activeTab === "Draft Picks" && <DraftPicksTab league={league} />}
        {activeTab === "Auction" && <AuctionAdminTab league={league} />}
        {activeTab === "Trades" && <TradesAdminTab league={league} />}
        {activeTab === "Board" && <BoardMembersTab league={league} />}
        {activeTab === "Backup" && (session as any)?.user?.id?.toString() === SUPER_ADMIN_ID && <BackupTab />}
      </div>
    </div>
  );
}