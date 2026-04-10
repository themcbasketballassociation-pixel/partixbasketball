import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../../lib/supabase";
import { requireAdmin } from "../../../../lib/adminAuth";

const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
const LEAGUE_COLORS: Record<string, number>  = { pba: 0xC8102E, pcaa: 0x003087, pbgl: 0xBB3430 };
const LEAGUE_SLUGS:  Record<string, string>  = { pba: "mba",   pcaa: "mcaa",   pbgl: "mbgl" };

type StatRow = {
  mc_uuid: string;
  points: number | null; rebounds_off: number | null; rebounds_def: number | null;
  assists: number | null; steals: number | null; blocks: number | null;
  turnovers: number | null; fg_made: number | null; fg_attempted: number | null;
  players: { mc_username: string | null; discord_id: string | null } | null;
};

function pad(s: string, n: number, right = false) {
  return right ? s.slice(0, n).padStart(n) : s.slice(0, n).padEnd(n);
}

function potgScore(s: StatRow) {
  const pts = s.points ?? 0, reb = (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0);
  const ast = s.assists ?? 0, stl = s.steals ?? 0, blk = s.blocks ?? 0, tov = s.turnovers ?? 0;
  const miss = (s.fg_attempted ?? 0) - (s.fg_made ?? 0);
  return pts + reb * 1.2 + ast * 1.5 + stl * 2 + blk * 2 - tov - miss * 0.5;
}

function buildTable(rows: StatRow[]): string {
  const sorted = [...rows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  const header = `${pad("Player", 16)} ${pad("PTS", 4, true)} ${pad("REB", 4, true)} ${pad("AST", 4, true)} ${pad("STL", 4, true)} ${pad("BLK", 4, true)} ${pad("TO", 4, true)}  ${pad("FG", 7, true)}`;
  const sep = "─".repeat(header.length);

  const lines = sorted.map((s) => {
    const name = s.players?.mc_username ?? s.mc_uuid.slice(0, 8);
    const reb = (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0);
    const fg = `${s.fg_made ?? 0}/${s.fg_attempted ?? 0}`;
    return `${pad(name, 16)} ${pad(String(s.points ?? 0), 4, true)} ${pad(String(reb), 4, true)} ${pad(String(s.assists ?? 0), 4, true)} ${pad(String(s.steals ?? 0), 4, true)} ${pad(String(s.blocks ?? 0), 4, true)} ${pad(String(s.turnovers ?? 0), 4, true)}  ${pad(fg, 7, true)}`;
  });

  // Totals row
  const totPts = rows.reduce((a, s) => a + (s.points ?? 0), 0);
  const totReb = rows.reduce((a, s) => a + (s.rebounds_off ?? 0) + (s.rebounds_def ?? 0), 0);
  const totAst = rows.reduce((a, s) => a + (s.assists ?? 0), 0);
  const totStl = rows.reduce((a, s) => a + (s.steals ?? 0), 0);
  const totBlk = rows.reduce((a, s) => a + (s.blocks ?? 0), 0);
  const totTov = rows.reduce((a, s) => a + (s.turnovers ?? 0), 0);
  const totFgm = rows.reduce((a, s) => a + (s.fg_made ?? 0), 0);
  const totFga = rows.reduce((a, s) => a + (s.fg_attempted ?? 0), 0);
  const totals = `${pad("TOTALS", 16)} ${pad(String(totPts), 4, true)} ${pad(String(totReb), 4, true)} ${pad(String(totAst), 4, true)} ${pad(String(totStl), 4, true)} ${pad(String(totBlk), 4, true)} ${pad(String(totTov), 4, true)}  ${pad(`${totFgm}/${totFga}`, 7, true)}`;

  return ["```", header, sep, ...lines, sep, totals, "```"].join("\n");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  // Fetch game
  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("*, home_team:home_team_id(id,name,abbreviation,logo_url), away_team:away_team_id(id,name,abbreviation,logo_url)")
    .eq("id", id)
    .single();
  if (gameErr || !game) return res.status(404).json({ error: "Game not found" });

  const league = game.league as string;
  const webhookUrl = process.env[`DISCORD_SCORES_WEBHOOK_${league.toUpperCase()}`];
  if (!webhookUrl) return res.status(400).json({ error: "No webhook configured for this league" });

  // Fetch stats + players
  const { data: stats } = await supabase
    .from("game_stats")
    .select("*, players(mc_uuid, mc_username, discord_id)")
    .eq("game_id", id);

  const allStats = (stats ?? []) as StatRow[];

  // Fetch player→team map
  const { data: playerTeams } = await supabase
    .from("player_teams")
    .select("mc_uuid, team_id")
    .eq("league", league);
  const ptMap: Record<string, string> = {};
  for (const pt of (playerTeams ?? [])) ptMap[pt.mc_uuid] = pt.team_id;

  const home = game.home_team as { id: string; name: string; abbreviation: string; logo_url: string | null };
  const away = game.away_team as { id: string; name: string; abbreviation: string; logo_url: string | null };
  const homeScore = game.home_score as number;
  const awayScore = game.away_score as number;
  const homeWon = homeScore > awayScore;

  const homeStats = allStats.filter((s) => ptMap[s.mc_uuid] === home.id);
  const awayStats = allStats.filter((s) => ptMap[s.mc_uuid] === away.id);

  const gameDate = new Date(game.scheduled_at as string).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const slug = LEAGUE_SLUGS[league] ?? league;
  const baseUrl = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";
  const boxscoreUrl = `${baseUrl}/${slug}/boxscores?game=${id}`;

  // POTG
  let potgField: Record<string, unknown> | null = null;
  let pingContent = "";
  if (allStats.length > 0) {
    const best = allStats.reduce((a, b) => potgScore(a) >= potgScore(b) ? a : b);
    const name = best.players?.mc_username ?? best.mc_uuid;
    const discordId = best.players?.discord_id;
    const reb = (best.rebounds_off ?? 0) + (best.rebounds_def ?? 0);
    const statLine = [
      `**${best.points ?? 0}** PTS`,
      `**${reb}** REB`,
      `**${best.assists ?? 0}** AST`,
      best.steals  ? `**${best.steals}** STL`  : null,
      best.blocks  ? `**${best.blocks}** BLK`  : null,
      best.turnovers ? `**${best.turnovers}** TO` : null,
      `**${best.fg_made ?? 0}/${best.fg_attempted ?? 0}** FG`,
    ].filter(Boolean).join("  ·  ");
    potgField = { name: "🏆 Player of the Game", value: `**${name}**\n${statLine}`, inline: false };
    if (discordId) pingContent = `<@${discordId}> is the Player of the Game!`;
  }

  const fields: Record<string, unknown>[] = [];

  if (homeStats.length > 0) {
    fields.push({ name: `🏠 ${home.name}  —  **${homeScore}**`, value: buildTable(homeStats), inline: false });
  }
  if (awayStats.length > 0) {
    fields.push({ name: `✈  ${away.name}  —  **${awayScore}**`, value: buildTable(awayStats), inline: false });
  }
  if (potgField) fields.push(potgField);

  const embed: Record<string, unknown> = {
    title: `${home.abbreviation}  ${homeScore}  –  ${awayScore}  ${away.abbreviation}   |   FINAL`,
    description: `**${homeWon ? home.name : away.name}** defeat **${homeWon ? away.name : home.name}** · ${gameDate}`,
    color: LEAGUE_COLORS[league] ?? 0x5865F2,
    fields,
    thumbnail: { url: (homeWon ? home.logo_url : away.logo_url) ?? "" },
    footer: { text: `${LEAGUE_LABELS[league] ?? league.toUpperCase()} · View full box score ↗` },
    timestamp: new Date().toISOString(),
    url: boxscoreUrl,
  };

  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: pingContent || undefined, embeds: [embed] }),
    });
    if (!r.ok) return res.status(500).json({ error: `Discord returned ${r.status}` });
  } catch (e) {
    return res.status(500).json({ error: "Failed to reach Discord" });
  }

  return res.status(200).json({ ok: true });
}
