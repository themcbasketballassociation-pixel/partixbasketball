import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

export const config = {
  api: { bodyParser: false },
};

const LEAGUE_LABELS: Record<string, string> = { pba: "PBA", pcaa: "PCAA", pbgl: "PBGL" };

// ── Signature verification ────────────────────────────────────────────────────

function hexToUint8Array(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer as ArrayBuffer;
}

async function verifyDiscordRequest(req: NextApiRequest, rawBody: string): Promise<boolean> {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return false;
  const signature = req.headers["x-signature-ed25519"] as string;
  const timestamp = req.headers["x-signature-timestamp"] as string;
  if (!signature || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    const message = new TextEncoder().encode(timestamp + rawBody);
    return await crypto.subtle.verify("Ed25519", key, hexToUint8Array(signature), message);
  } catch {
    return false;
  }
}

function getRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// ── Stats helpers ─────────────────────────────────────────────────────────────

type SeasonEntry = { season: string; type: "regular" | "playoffs" };

async function getPlayerSeasons(mc_uuid: string, league: string): Promise<SeasonEntry[]> {
  const seasonSet = new Set<string>();

  // 1. Manual stats table
  const { data: manualRows } = await supabase
    .from("stats")
    .select("season")
    .eq("mc_uuid", mc_uuid)
    .eq("league", league);
  for (const r of manualRows ?? []) if (r.season) seasonSet.add(r.season as string);

  // 2. game_stats via games join
  const { data: gameRows } = await supabase
    .from("games")
    .select("id, season")
    .eq("league", league);

  const gameIds = (gameRows ?? []).map((g) => g.id as string);
  if (gameIds.length > 0) {
    const { data: gsRows } = await supabase
      .from("game_stats")
      .select("game_id")
      .eq("mc_uuid", mc_uuid)
      .in("game_id", gameIds);

    const gameSeasonMap: Record<string, string> = {};
    for (const g of gameRows ?? []) gameSeasonMap[g.id] = g.season;
    for (const gs of gsRows ?? []) {
      const s = gameSeasonMap[gs.game_id as string];
      if (s) seasonSet.add(s);
    }
  }

  const result: SeasonEntry[] = [];
  for (const s of seasonSet) {
    if (s.includes("Playoff")) {
      result.push({ season: s.replace(" Playoffs", ""), type: "playoffs" });
    } else {
      result.push({ season: s, type: "regular" });
    }
  }

  // Sort: newest season first, regular before playoffs within same season
  result.sort((a, b) => {
    const aNum = parseInt(a.season.match(/\d+/)?.[0] ?? "0");
    const bNum = parseInt(b.season.match(/\d+/)?.[0] ?? "0");
    if (aNum !== bNum) return bNum - aNum;
    return a.type === "regular" ? -1 : 1;
  });

  return result;
}

type PlayerStats = {
  gp: number;
  ppg: number | null;
  rpg: number | null;
  apg: number | null;
  spg: number | null;
  bpg: number | null;
  fg_pct: number | null;
  three_pt_made: number;
};

async function getPlayerStats(
  mc_uuid: string,
  league: string,
  season: string,
  type: "regular" | "playoffs"
): Promise<PlayerStats | null> {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const isAll = season === "all";
  const seasonStr = !isAll && type === "playoffs" ? `${season} Playoffs` : season;

  // Manual stats
  let statsQuery = supabase.from("stats").select("*").eq("mc_uuid", mc_uuid).eq("league", league);
  if (!isAll) {
    statsQuery = statsQuery.eq("season", seasonStr);
  } else if (type === "playoffs") {
    statsQuery = statsQuery.ilike("season", "%Playoff%");
  } else {
    statsQuery = statsQuery.not("season", "ilike", "%Playoff%");
  }
  const { data: manualRows } = await statsQuery;

  if (manualRows && manualRows.length > 0) {
    let gp = 0, wPts = 0, wReb = 0, wAst = 0, wStl = 0, wBlk = 0, wFg = 0, fgGames = 0, totalTpm = 0;
    for (const r of manualRows) {
      const g = (r.gp as number) ?? 0;
      gp += g;
      wPts += ((r.ppg as number) ?? 0) * g;
      wReb += ((r.rpg as number) ?? 0) * g;
      wAst += ((r.apg as number) ?? 0) * g;
      wStl += ((r.spg as number) ?? 0) * g;
      wBlk += ((r.bpg as number) ?? 0) * g;
      const fgP = (r.fg_pct as number) ?? 0;
      if (fgP > 0) { wFg += fgP * g; fgGames += g; }
      totalTpm += (r.three_pt_made as number) ?? 0;
    }
    return {
      gp,
      ppg: gp > 0 ? r1(wPts / gp) : null,
      rpg: gp > 0 ? r1(wReb / gp) : null,
      apg: gp > 0 ? r1(wAst / gp) : null,
      spg: gp > 0 ? r1(wStl / gp) : null,
      bpg: gp > 0 ? r1(wBlk / gp) : null,
      fg_pct: fgGames > 0 ? r1(wFg / fgGames) : null,
      three_pt_made: totalTpm,
    };
  }

  // Computed from game_stats
  let gamesQuery = supabase.from("games").select("id").eq("league", league).not("home_score", "is", null);
  if (!isAll) {
    gamesQuery = gamesQuery.eq("season", seasonStr);
  } else if (type === "playoffs") {
    gamesQuery = (gamesQuery as typeof gamesQuery).ilike("season", "%Playoff%");
  } else {
    gamesQuery = (gamesQuery as typeof gamesQuery).not("season", "ilike", "%Playoff%");
  }
  const { data: completedGames } = await gamesQuery;
  const gameIds = (completedGames ?? []).map((g) => g.id as string);
  if (!gameIds.length) return null;

  const { data: gsRows } = await supabase
    .from("game_stats")
    .select("points, rebounds_off, rebounds_def, assists, steals, blocks, fg_made, fg_attempted, three_pt_made")
    .eq("mc_uuid", mc_uuid)
    .in("game_id", gameIds);

  if (!gsRows || gsRows.length === 0) return null;

  let gp = 0, pts = 0, reb = 0, ast = 0, stl = 0, blk = 0, fgm = 0, fga = 0, tpm = 0;
  for (const s of gsRows) {
    gp++;
    pts += (s.points as number) ?? 0;
    reb += (((s.rebounds_off as number) ?? 0) + ((s.rebounds_def as number) ?? 0));
    ast += (s.assists as number) ?? 0;
    stl += (s.steals as number) ?? 0;
    blk += (s.blocks as number) ?? 0;
    fgm += (s.fg_made as number) ?? 0;
    fga += (s.fg_attempted as number) ?? 0;
    tpm += (s.three_pt_made as number) ?? 0;
  }

  return {
    gp,
    ppg: gp > 0 ? r1(pts / gp) : null,
    rpg: gp > 0 ? r1(reb / gp) : null,
    apg: gp > 0 ? r1(ast / gp) : null,
    spg: gp > 0 ? r1(stl / gp) : null,
    bpg: gp > 0 ? r1(blk / gp) : null,
    fg_pct: fga > 0 ? r1((fgm / fga) * 100) : null,
    three_pt_made: tpm,
  };
}

// ── Discord payload builders ──────────────────────────────────────────────────

function buildEmbed(
  mc_username: string,
  mc_uuid: string,
  stats: PlayerStats | null,
  league: string,
  season: string,
  type: "regular" | "playoffs",
  accolades: { type: string; season: string | null; description: string | null }[]
) {
  const isAll = season === "all";
  const seasonLabel = isAll
    ? type === "playoffs" ? "All-Time Playoffs" : "All-Time Regular Season"
    : type === "playoffs" ? `${season} Playoffs` : season;

  const leagueLabel = LEAGUE_LABELS[league] ?? league.toUpperCase();
  const skinUrl = `https://crafatar.com/avatars/${mc_uuid}?size=64&default=MHF_Steve&overlay`;

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (stats) {
    if (stats.ppg != null) fields.push({ name: "PPG", value: `${stats.ppg}`, inline: true });
    if (stats.rpg != null) fields.push({ name: "RPG", value: `${stats.rpg}`, inline: true });
    if (stats.apg != null) fields.push({ name: "APG", value: `${stats.apg}`, inline: true });
    if (stats.spg != null) fields.push({ name: "SPG", value: `${stats.spg}`, inline: true });
    if (stats.bpg != null) fields.push({ name: "BPG", value: `${stats.bpg}`, inline: true });
    if (stats.fg_pct != null) fields.push({ name: "FG%", value: `${stats.fg_pct}%`, inline: true });
    fields.push({ name: "GP", value: `${stats.gp}`, inline: true });
    if (stats.three_pt_made > 0) fields.push({ name: "3PM", value: `${stats.three_pt_made}`, inline: true });
  } else {
    fields.push({ name: "No Stats", value: "No stats recorded for this period.", inline: false });
  }

  if (accolades.length > 0) {
    const text = accolades
      .map((a) => `🏆 **${a.type}**${a.season ? ` *(${a.season})*` : ""}`)
      .join("\n");
    fields.push({ name: "Accolades", value: text.slice(0, 1024), inline: false });
  }

  return {
    title: `${mc_username}`,
    description: `**${leagueLabel}** — ${seasonLabel}`,
    color: 0x3b82f6,
    thumbnail: { url: skinUrl },
    fields,
    footer: { text: "Partix Basketball" },
  };
}

function buildSelectMenu(
  mc_uuid: string,
  league: string,
  seasons: SeasonEntry[],
  currentSeason: string,
  currentType: "regular" | "playoffs"
) {
  const options: { label: string; value: string; default?: boolean }[] = [];

  for (const { season, type } of seasons) {
    const label = type === "playoffs" ? `${season} Playoffs` : season;
    options.push({
      label,
      value: `${season}|${type}`,
      default: season === currentSeason && type === currentType,
    });
  }

  options.push({
    label: "All-Time Regular Season",
    value: "all|regular",
    default: currentSeason === "all" && currentType === "regular",
  });
  options.push({
    label: "All-Time Playoffs",
    value: "all|playoffs",
    default: currentSeason === "all" && currentType === "playoffs",
  });

  return {
    type: 1, // ACTION_ROW
    components: [
      {
        type: 3, // STRING_SELECT
        custom_id: `stats:${mc_uuid}:${league}`,
        placeholder: "Switch season / view",
        options: options.slice(0, 25),
      },
    ],
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const rawBody = await getRawBody(req);

  const isValid = await verifyDiscordRequest(req, rawBody);
  if (!isValid) return res.status(401).json({ error: "Invalid request signature" });

  const body = JSON.parse(rawBody);

  // ── PING ──────────────────────────────────────────────────────────────────
  if (body.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  // ── APPLICATION_COMMAND — /stats ─────────────────────────────────────────
  if (body.type === 2) {
    if (body.data?.name !== "stats") {
      return res.status(200).json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
    }

    const options = (body.data?.options ?? []) as { name: string; value: string }[];
    const playerOption = options.find((o) => o.name === "player");
    const leagueOption = options.find((o) => o.name === "league");

    const mentionedUserId = playerOption?.value;
    const leagueRaw = leagueOption?.value ?? "pba";
    const league = resolveLeague(leagueRaw) || "pba";

    if (!mentionedUserId) {
      return res.status(200).json({
        type: 4,
        data: { content: "Please mention a player.", flags: 64 },
      });
    }

    const { data: player } = await supabase
      .from("players")
      .select("mc_uuid, mc_username")
      .eq("discord_id", mentionedUserId)
      .maybeSingle();

    if (!player) {
      return res.status(200).json({
        type: 4,
        data: {
          content: `No player found for <@${mentionedUserId}>. They may not be registered yet.`,
          flags: 64,
        },
      });
    }

    const { mc_uuid, mc_username } = player as { mc_uuid: string; mc_username: string };

    const seasons = await getPlayerSeasons(mc_uuid, league);

    if (seasons.length === 0) {
      return res.status(200).json({
        type: 4,
        data: {
          content: `**${mc_username}** has no stats recorded in ${LEAGUE_LABELS[league] ?? league}.`,
          flags: 64,
        },
      });
    }

    const defaultEntry = seasons[0];
    const stats = await getPlayerStats(mc_uuid, league, defaultEntry.season, defaultEntry.type);

    const { data: accolades } = await supabase
      .from("accolades")
      .select("type, season, description")
      .eq("mc_uuid", mc_uuid)
      .eq("league", league);

    const embed = buildEmbed(mc_username, mc_uuid, stats, league, defaultEntry.season, defaultEntry.type, accolades ?? []);
    const selectMenu = buildSelectMenu(mc_uuid, league, seasons, defaultEntry.season, defaultEntry.type);

    return res.status(200).json({
      type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
      data: { embeds: [embed], components: [selectMenu] },
    });
  }

  // ── MESSAGE_COMPONENT — season switcher ───────────────────────────────────
  if (body.type === 3) {
    const customId = (body.data?.custom_id ?? "") as string;
    const selectedValue = (body.data?.values?.[0] ?? "") as string;

    if (!customId.startsWith("stats:") || !selectedValue) {
      return res.status(200).json({ type: 6 }); // DEFERRED_UPDATE_MESSAGE
    }

    const parts = customId.split(":");
    const mc_uuid = parts[1];
    const league = parts[2];
    const [season, type] = selectedValue.split("|") as [string, "regular" | "playoffs"];

    const { data: player } = await supabase
      .from("players")
      .select("mc_uuid, mc_username")
      .eq("mc_uuid", mc_uuid)
      .maybeSingle();

    if (!player) return res.status(200).json({ type: 6 });

    const { mc_username } = player as { mc_uuid: string; mc_username: string };

    const [seasons, stats, accoladesResult] = await Promise.all([
      getPlayerSeasons(mc_uuid, league),
      getPlayerStats(mc_uuid, league, season, type),
      supabase
        .from("accolades")
        .select("type, season, description")
        .eq("mc_uuid", mc_uuid)
        .eq("league", league),
    ]);

    const embed = buildEmbed(mc_username, mc_uuid, stats, league, season, type, accoladesResult.data ?? []);
    const selectMenu = buildSelectMenu(mc_uuid, league, seasons, season, type);

    return res.status(200).json({
      type: 7, // UPDATE_MESSAGE
      data: { embeds: [embed], components: [selectMenu] },
    });
  }

  return res.status(400).json({ error: "Unknown interaction type" });
}
