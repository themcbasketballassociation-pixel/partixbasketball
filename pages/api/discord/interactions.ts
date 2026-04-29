import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

export const config = {
  api: { bodyParser: false },
};

const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };

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

  // ── 1. Always fetch game_stats (used for three_pt_made totals and as fallback) ──
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

  // Per-stat accumulators — each stat tracks its own "games where it was recorded"
  let gsGp = 0;
  let gsPts = 0, gpPts = 0;
  let gsReb = 0, gpReb = 0;
  let gsAst = 0, gpAst = 0;
  let gsStl = 0, gpStl = 0;
  let gsBlk = 0, gpBlk = 0;
  let gsFgm = 0, gsFga = 0, gpFg = 0;
  let gsTpm = 0;
  let hasGameStats = false;

  if (gameIds.length > 0) {
    const { data: gsRows } = await supabase
      .from("game_stats")
      .select("points, rebounds_off, rebounds_def, assists, steals, blocks, fg_made, fg_attempted, three_pt_made")
      .eq("mc_uuid", mc_uuid)
      .in("game_id", gameIds);

    if (gsRows && gsRows.length > 0) {
      hasGameStats = true;
      for (const s of gsRows) {
        gsGp++;
        // Only add to a stat's total + denominator when the field was actually recorded (not null)
        if (s.points != null)   { gsPts += s.points as number; gpPts++; }
        const hasReb = s.rebounds_off != null || s.rebounds_def != null;
        if (hasReb) { gsReb += ((s.rebounds_off as number) ?? 0) + ((s.rebounds_def as number) ?? 0); gpReb++; }
        if (s.assists != null)  { gsAst += s.assists as number; gpAst++; }
        if (s.steals  != null)  { gsStl += s.steals  as number; gpStl++; }
        if (s.blocks  != null)  { gsBlk += s.blocks  as number; gpBlk++; }
        if (s.fg_attempted != null && (s.fg_attempted as number) > 0) {
          gsFgm += (s.fg_made as number) ?? 0;
          gsFga += s.fg_attempted as number;
          gpFg++;
        }
        gsTpm += (s.three_pt_made as number) ?? 0;
      }
    }
  }

  // ── 2. Fetch manual stats (used for averages when present) ───────────────────
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
    // Per-stat weighted sums — only include a season's GP in the denominator
    // for a given stat if that stat was actually recorded (non-null) that season.
    let gp = 0;
    let wPts = 0, gpMPts = 0;
    let wReb = 0, gpMReb = 0;
    let wAst = 0, gpMAst = 0;
    let wStl = 0, gpMStl = 0;
    let wBlk = 0, gpMBlk = 0;
    let wFg  = 0, gpMFg  = 0;
    let manualTpm = 0;

    for (const r of manualRows) {
      const g = (r.gp as number) ?? 0;
      gp += g;
      if (r.ppg    != null) { wPts += (r.ppg as number) * g; gpMPts += g; }
      if (r.rpg    != null) { wReb += (r.rpg as number) * g; gpMReb += g; }
      if (r.apg    != null) { wAst += (r.apg as number) * g; gpMAst += g; }
      if (r.spg    != null) { wStl += (r.spg as number) * g; gpMStl += g; }
      if (r.bpg    != null) { wBlk += (r.bpg as number) * g; gpMBlk += g; }
      if (r.fg_pct != null && (r.fg_pct as number) > 0) { wFg += (r.fg_pct as number) * g; gpMFg += g; }
      manualTpm += (r.three_pt_made as number) ?? 0;
    }
    return {
      gp,
      ppg:    gpMPts > 0 ? r1(wPts / gpMPts) : null,
      rpg:    gpMReb > 0 ? r1(wReb / gpMReb) : null,
      apg:    gpMAst > 0 ? r1(wAst / gpMAst) : null,
      spg:    gpMStl > 0 ? r1(wStl / gpMStl) : null,
      bpg:    gpMBlk > 0 ? r1(wBlk / gpMBlk) : null,
      fg_pct: gpMFg  > 0 ? r1(wFg  / gpMFg)  : null,
      // Always prefer game_stats three_pt_made — manual entries often leave this blank
      three_pt_made: hasGameStats ? gsTpm : manualTpm,
    };
  }

  // ── 3. Fall back to pure game_stats ──────────────────────────────────────────
  if (!hasGameStats) return null;

  return {
    gp:    gsGp,
    ppg:   gpPts  > 0 ? r1(gsPts / gpPts)  : null,
    rpg:   gpReb  > 0 ? r1(gsReb / gpReb)  : null,
    apg:   gpAst  > 0 ? r1(gsAst / gpAst)  : null,
    spg:   gpStl  > 0 ? r1(gsStl / gpStl)  : null,
    bpg:   gpBlk  > 0 ? r1(gsBlk / gpBlk)  : null,
    fg_pct: gsFga > 0 ? r1((gsFgm / gsFga) * 100) : null,
    three_pt_made: gsTpm,
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

  // mc-heads.net is more reliable for Discord embeds than crafatar
  const skinUrl = `https://mc-heads.net/avatar/${mc_uuid}/64`;

  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (stats) {
    // Stats grid — bold values to stand out
    const statCells: [string, string | number | null][] = [
      ["GP",   stats.gp],
      ["PPG",  stats.ppg],
      ["RPG",  stats.rpg],
      ["APG",  stats.apg],
      ["SPG",  stats.spg],
      ["BPG",  stats.bpg],
      ["FG%",  stats.fg_pct != null ? `${stats.fg_pct}%` : null],
      ["3PM",  stats.three_pt_made > 0 ? stats.three_pt_made : null],
    ];
    for (const [name, val] of statCells) {
      if (val != null) fields.push({ name, value: `**${val}**`, inline: true });
    }
  } else {
    fields.push({ name: "​", value: "*No stats recorded for this period.*", inline: false });
  }

  // Compact accolades: group by type, show count + seasons on one line each
  if (accolades.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const a of accolades) {
      if (!grouped[a.type]) grouped[a.type] = [];
      if (a.season) grouped[a.type].push(a.season.replace("Season ", "S"));
    }

    const AWARD_EMOJI: Record<string, string> = {
      "Finals Champion": "🏆",
      "MVP": "🥇",
      "Finals MVP": "🥇",
      "Defensive Player of the Year": "🛡️",
      "DPOY": "🛡️",
      "Rookie of the Year": "🌟",
      "ROY": "🌟",
      "All-Star": "⭐",
      "Scoring Champion": "🎯",
      "All-PBA": "🏅",
      "All-PCAA": "🏅",
      "All-PBGL": "🏅",
    };

    const lines = Object.entries(grouped).map(([type, seasons]) => {
      const emoji = AWARD_EMOJI[type] ?? "🏆";
      const count = seasons.length;
      const seasonStr = seasons.length > 0 ? ` *(${seasons.join(", ")})*` : "";
      return count > 1
        ? `${emoji} **${type}** ×${count}${seasonStr}`
        : `${emoji} **${type}**${seasonStr}`;
    });

    fields.push({
      name: "🎖️ Accolades",
      value: lines.join("\n").slice(0, 1024),
      inline: false,
    });
  }

  return {
    author: { name: `${leagueLabel} · ${seasonLabel}` },
    title: mc_username,
    color: type === "playoffs" ? 0xf59e0b : 0x3b82f6, // gold for playoffs, blue for regular
    thumbnail: { url: skinUrl },
    fields,
    footer: { text: "Partix Basketball · /stats @player" },
  };
}

function buildComponents(
  mc_uuid: string,
  league: string,
  seasons: SeasonEntry[],
  currentSeason: string,
  currentType: "regular" | "playoffs"
) {
  // Unique seasons (no playoff duplicates) + All-Time
  const uniqueSeasons = [...new Set(seasons.map((s) => s.season))];
  const hasPlayoffs = (s: string) => seasons.some((e) => e.season === s && e.type === "playoffs");
  const hasRegular = (s: string) => seasons.some((e) => e.season === s && e.type === "regular");

  const seasonOptions = uniqueSeasons.map((s) => ({
    label: s,
    value: s,
    default: s === currentSeason,
  }));
  seasonOptions.push({ label: "All-Time", value: "all", default: currentSeason === "all" });

  // Row 1: season select
  const seasonRow = {
    type: 1,
    components: [{
      type: 3, // STRING_SELECT
      custom_id: `statsseason:${mc_uuid}:${league}:${currentType}`,
      placeholder: "Switch season",
      options: seasonOptions.slice(0, 25),
    }],
  };

  // Row 2: Regular / Playoffs buttons
  const regularAvailable = currentSeason === "all" || hasRegular(currentSeason);
  const playoffsAvailable = currentSeason === "all" || hasPlayoffs(currentSeason);

  const typeRow = {
    type: 1,
    components: [
      {
        type: 2, // BUTTON
        style: currentType === "regular" ? 1 : 2, // Primary (blue) if active, Secondary if not
        label: "Regular Season",
        custom_id: `statstype:${mc_uuid}:${league}:${currentSeason}:regular`,
        disabled: !regularAvailable,
      },
      {
        type: 2,
        style: currentType === "playoffs" ? 1 : 2,
        label: "Playoffs",
        custom_id: `statstype:${mc_uuid}:${league}:${currentSeason}:playoffs`,
        disabled: !playoffsAvailable,
      },
    ],
  };

  return [seasonRow, typeRow];
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

  // ── APPLICATION_COMMAND ───────────────────────────────────────────────────
  if (body.type === 2) {
    // /site — return website link
    if (body.data?.name === "site") {
      return res.status(200).json({
        type: 4,
        data: { content: "🏀 **Partix Basketball** — https://partixbasketball.vercel.app/" },
      });
    }

    if (body.data?.name !== "stats") {
      return res.status(200).json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
    }

    const options = (body.data?.options ?? []) as { name: string; value: string }[];
    const playerOption = options.find((o) => o.name === "player");
    const leagueOption = options.find((o) => o.name === "league");

    // If no player mentioned, show the command invoker's own stats
    const invokerId = body.member?.user?.id ?? body.user?.id;
    const targetUserId = playerOption?.value ?? invokerId;
    const leagueRaw = leagueOption?.value ?? "pba";
    const league = resolveLeague(leagueRaw) || "pba";

    if (!targetUserId) {
      return res.status(200).json({
        type: 4,
        data: { content: "Could not determine which player to look up.", flags: 64 },
      });
    }

    const { data: player } = await supabase
      .from("players")
      .select("mc_uuid, mc_username")
      .eq("discord_id", targetUserId)
      .maybeSingle();

    if (!player) {
      const isSelf = targetUserId === invokerId && !playerOption;
      return res.status(200).json({
        type: 4,
        data: {
          content: isSelf
            ? "You don't have a player linked to your Discord. Ask an admin to add your Discord ID to your player profile."
            : `No player found for <@${targetUserId}>. They may not be registered yet.`,
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
    const components = buildComponents(mc_uuid, league, seasons, defaultEntry.season, defaultEntry.type);

    return res.status(200).json({
      type: 4,
      data: { embeds: [embed], components },
    });
  }

  // ── MESSAGE_COMPONENT — season select or type button ─────────────────────
  if (body.type === 3) {
    const customId = (body.data?.custom_id ?? "") as string;

    // Helper to load player + rebuild embed
    async function updateEmbed(mc_uuid: string, league: string, season: string, type: "regular" | "playoffs") {
      const { data: player } = await supabase
        .from("players").select("mc_uuid, mc_username").eq("mc_uuid", mc_uuid).maybeSingle();
      if (!player) return res.status(200).json({ type: 6 });

      const { mc_username } = player as { mc_uuid: string; mc_username: string };
      const [seasons, stats, accoladesResult] = await Promise.all([
        getPlayerSeasons(mc_uuid, league),
        getPlayerStats(mc_uuid, league, season, type),
        supabase.from("accolades").select("type, season, description").eq("mc_uuid", mc_uuid).eq("league", league),
      ]);

      // If requested type doesn't exist for this season, fall back to regular
      const hasType = season === "all" || seasons.some((s) => s.season === season && s.type === type);
      const resolvedType = hasType ? type : "regular";

      const embed = buildEmbed(mc_username, mc_uuid, stats ?? null, league, season, resolvedType, accoladesResult.data ?? []);
      const components = buildComponents(mc_uuid, league, seasons, season, resolvedType);
      return res.status(200).json({ type: 7, data: { embeds: [embed], components } });
    }

    // Season dropdown changed
    if (customId.startsWith("statsseason:")) {
      const parts = customId.split(":");
      const mc_uuid = parts[1];
      const league = parts[2];
      const currentType = parts[3] as "regular" | "playoffs";
      const season = (body.data?.values?.[0] ?? "all") as string;
      return updateEmbed(mc_uuid, league, season, currentType);
    }

    // Regular / Playoffs button clicked
    if (customId.startsWith("statstype:")) {
      const parts = customId.split(":");
      const mc_uuid = parts[1];
      const league = parts[2];
      const season = parts[3];
      const type = parts[4] as "regular" | "playoffs";
      return updateEmbed(mc_uuid, league, season, type);
    }

    return res.status(200).json({ type: 6 });
  }

  return res.status(400).json({ error: "Unknown interaction type" });
}
