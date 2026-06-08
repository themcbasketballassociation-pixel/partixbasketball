import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { resolveLeague } from "../../../lib/leagueMapping";

const ALL_REGULAR_SEASONS = [
  "Season 1","Season 2","Season 3","Season 4","Season 5","Season 6","Season 7",
];

// VORP constants. This is intentionally scaled like plus/minus:
// player impact per game vs league average, adjusted by minutes and games played.
// No replacement-level bonus is added, so weak seasons can go negative.
const GAME_MIN = 24;
const SEASON_GP_NORM = 13; // season length in this league
const VORP_SCALE = 0.28;
const VORP_MAX = 9.9;
const VORP_DEFAULT_MPG = 18;
const VORP_MIN_MINUTES = 30; // minimum total minutes before VORP is shown

const clampVorp = (n: number) => Math.max(-VORP_MAX, Math.min(VORP_MAX, n));

function num(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function possessionAdjustedTurnovers(topg: number, possPg: number, leagueAvgTopg = 1.4, leagueAvgPossPg = 220) {
  if (topg <= 0) return 0;
  if (possPg <= 0 || leagueAvgPossPg <= 0) return topg;
  const expected = Math.max(0.45, leagueAvgTopg * clamp(possPg / leagueAvgPossPg, 0.45, 1.85));
  return topg - expected;
}

function shootingTrustFromTurnovers(turnoverOverExpected: number, topg: number) {
  const pressure = Math.max(0, turnoverOverExpected) * 0.22 + Math.max(0, topg - 3.5) * 0.12;
  return clamp(1 - pressure, 0.45, 1);
}

function manualImpact(row: Record<string, unknown>, leagueAvgFg: number, leagueAvgThree: number) {
  const fg = num(row, "fg_pct");
  const three = num(row, "three_pt_pct");
  const tppg = num(row, "tppg");
  const topg = num(row, "topg");
  const possPg = num(row, "possession_time_pg");
  const tovOverExpected = possessionAdjustedTurnovers(topg, possPg);
  const shootingTrust = shootingTrustFromTurnovers(tovOverExpected, topg);
  const fgEff = fg > 0 && leagueAvgFg > 0 ? (fg - leagueAvgFg) * 0.055 * shootingTrust : 0;
  const threeEff = three > 0 && leagueAvgThree > 0 ? (three - leagueAvgThree) * 0.035 * shootingTrust : 0;
  const playmaking = 0.82 * num(row, "apg") - Math.max(0, tovOverExpected) * 0.9 + Math.max(0, -tovOverExpected) * 0.18;
  return (
    num(row, "ppg") +
    0.55 * num(row, "rpg") +
    playmaking +
    1.7 * num(row, "spg") +
    1.5 * num(row, "bpg") +
    0.25 * tppg -
    0.45 * Math.max(0, topg - 4) +
    fgEff +
    threeEff
  );
}

function addManualVorp(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const bySeason: Record<string, Record<string, unknown>[]> = {};
  for (const row of rows) {
    const season = String(row.season ?? "Unknown");
    if (!bySeason[season]) bySeason[season] = [];
    bySeason[season].push(row);
  }

  return rows.map((row) => {
    const seasonRows = bySeason[String(row.season ?? "Unknown")] ?? [];
    const fgRows = seasonRows.filter((r) => num(r, "fg_pct") > 0);
    const threeRows = seasonRows.filter((r) => num(r, "three_pt_pct") > 0);
    const leagueAvgFg = fgRows.length ? fgRows.reduce((s, r) => s + num(r, "fg_pct"), 0) / fgRows.length : 0;
    const leagueAvgThree = threeRows.length ? threeRows.reduce((s, r) => s + num(r, "three_pt_pct"), 0) / threeRows.length : 0;
    const impacts = seasonRows.map((r) => manualImpact(r, leagueAvgFg, leagueAvgThree));
    const leagueAvgImpact = impacts.length ? impacts.reduce((s, v) => s + v, 0) / impacts.length : 0;
    const gp = num(row, "gp");
    const mpg = num(row, "mpg") > 0 ? num(row, "mpg") : VORP_DEFAULT_MPG;
    const impactDiff = manualImpact(row, leagueAvgFg, leagueAvgThree) - leagueAvgImpact;
    const vorp = gp > 0
      ? r2(clampVorp(impactDiff * VORP_SCALE * (mpg / GAME_MIN) * (gp / SEASON_GP_NORM)))
      : null;
    return { ...row, vorp };
  });
}

function getQuerySeasons(season: string, type: string): string[] {
  const base = season === "all" ? ALL_REGULAR_SEASONS : [season];
  if (type === "playoffs") return base.map((s) => `${s} Playoffs`);
  if (type === "combined") return [...base, ...base.map((s) => `${s} Playoffs`)];
  return base; // regular (default)
}

function mergePlayerRows(rows: Record<string, unknown>[]) {
  let gp = 0, wPts = 0, wReb = 0, wAst = 0, wStl = 0, wBlk = 0;
  let totalThree = 0, wTo = 0, wPass = 0, wPoss = 0;
  let wFg = 0, fgGames = 0;
  let wThreePct = 0, threeGames = 0;
  let wOReb = 0, oRebGames = 0;
  let wDReb = 0, dRebGames = 0;
  let wMpg = 0, mpgGames = 0;
  let vorpSum = 0, hasVorp = false;
  for (const r of rows) {
    const g = (r.gp as number) ?? 0;
    gp += g;
    wPts += ((r.ppg as number) ?? 0) * g;
    wReb += ((r.rpg as number) ?? 0) * g;
    wAst += ((r.apg as number) ?? 0) * g;
    wStl += ((r.spg as number) ?? 0) * g;
    wBlk += ((r.bpg as number) ?? 0) * g;
    const fgP = (r.fg_pct as number) ?? 0;
    if (fgP > 0) { wFg += fgP * g; fgGames += g; }
    totalThree += (r.three_pt_made as number) ?? 0;
    const tpP = (r.three_pt_pct as number) ?? 0;
    if (tpP > 0) { wThreePct += tpP * g; threeGames += g; }
    wTo   += ((r.topg              as number) ?? 0) * g;
    wPass += ((r.pass_attempts_pg  as number) ?? 0) * g;
    wPoss += ((r.possession_time_pg as number) ?? 0) * g;
    // Off/def rebounds — only tracked Season 5+
    const orP = (r.orpg as number) ?? 0;
    if (orP > 0) { wOReb += orP * g; oRebGames += g; }
    const drP = (r.drpg as number) ?? 0;
    if (drP > 0) { wDReb += drP * g; dRebGames += g; }
    // Minutes per game — only tracked Season 6+
    const mpgP = (r.mpg as number) ?? 0;
    if (mpgP > 0) { wMpg += mpgP * g; mpgGames += g; }
    // VORP — sum across seasons (it's a counting stat)
    if ((r.vorp as number | null) != null) { vorpSum += (r.vorp as number); hasVorp = true; }
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    gp,
    ppg: gp > 0 ? r1(wPts / gp) : null,
    rpg: gp > 0 ? r1(wReb / gp) : null,
    orpg: oRebGames > 0 ? r1(wOReb / oRebGames) : null,
    drpg: dRebGames > 0 ? r1(wDReb / dRebGames) : null,
    apg: gp > 0 ? r1(wAst / gp) : null,
    spg: gp > 0 ? r1(wStl / gp) : null,
    bpg: gp > 0 ? r1(wBlk / gp) : null,
    fg_pct: fgGames > 0 ? r1(wFg / fgGames) : null,
    three_pt_made: totalThree,
    tppg: gp > 0 ? r1(totalThree / gp) : null,
    three_pt_pct: threeGames > 0 ? r1(wThreePct / threeGames) : null,
    topg: gp > 0 ? r1(wTo / gp) : null,
    pass_attempts_pg: gp > 0 ? r1(wPass / gp) : null,
    possession_time_pg: gp > 0 ? Math.round(wPoss / gp) : null,
    mpg: mpgGames > 0 ? r1(wMpg / mpgGames) : null,
    vorp: hasVorp ? r2(vorpSum) : null,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { league: leagueRaw } = req.query;
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  // POST — save manual season-level stats for a player
  if (req.method === "POST") {
    const { mc_uuid, season, gp, ppg, rpg, orpg, drpg, apg, spg, bpg, fg_pct, three_pt_made, three_pt_pct, topg, pass_attempts_pg, possession_time_pg, mpg } = req.body;
    if (!mc_uuid || !season) return res.status(400).json({ error: "mc_uuid, season required" });
    const payload: Record<string, unknown> = { mc_uuid, league, season, gp: gp ?? null, ppg: ppg ?? null, rpg: rpg ?? null, orpg: orpg ?? null, drpg: drpg ?? null, apg: apg ?? null, spg: spg ?? null, bpg: bpg ?? null, fg_pct: fg_pct ?? null, three_pt_made: three_pt_made ?? null, three_pt_pct: three_pt_pct ?? null, topg: topg ?? null, pass_attempts_pg: pass_attempts_pg ?? null, possession_time_pg: possession_time_pg ?? null, mpg: mpg ?? null };
    let result = await supabase.from("stats").upsert([payload], { onConflict: "mc_uuid,league,season" }).select().single();
    // If mpg column doesn't exist in the schema yet, retry without it
    if (result.error?.message?.includes("mpg")) {
      const { mpg: _omit, ...payloadNoMpg } = payload;
      result = await supabase.from("stats").upsert([payloadNoMpg], { onConflict: "mc_uuid,league,season" }).select().single();
    }
    const { data, error } = result;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // DELETE — remove a player's stats for a season
  if (req.method === "DELETE") {
    const { mc_uuid: delUuid, season: delSeason } = req.query;
    if (!delUuid || !delSeason) return res.status(400).json({ error: "mc_uuid, season required" });
    const { error } = await supabase
      .from("stats")
      .delete()
      .eq("mc_uuid", delUuid as string)
      .eq("league", league as string)
      .eq("season", delSeason as string);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  const { mc_uuid, season, type, strictTeamSeason } = req.query;

  // GET with mc_uuid + season — load a single player's manual stats (used by admin)
  if (mc_uuid && season) {
    const { data, error } = await supabase
      .from("stats")
      .select("*")
      .eq("mc_uuid", mc_uuid as string)
      .eq("league", league as string)
      .eq("season", season as string)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data ? [data] : []);
  }

  // GET with season (and optional type) — leaderboard
  if (season) {
    const typeStr = (type as string) ?? "regular";
    const seasonStr = season as string;
    const querySeasons = seasonStr === "all" ? null : getQuerySeasons(seasonStr, typeStr);

    // ── 1. Manual stats from stats table ──────────────────────────────────
    let statsQuery = supabase.from("stats").select("*").eq("league", league as string);
    if (querySeasons) {
      statsQuery = statsQuery.in("season", querySeasons);
    } else if (typeStr === "playoffs") {
      statsQuery = statsQuery.ilike("season", "%Playoff%");
    } else if (typeStr === "regular") {
      statsQuery = statsQuery.not("season", "ilike", "%Playoff%");
    }
    const { data: manualData, error } = await statsQuery;
    if (error) return res.status(500).json({ error: error.message });
    const manualRows = addManualVorp((manualData ?? []) as Record<string, unknown>[]);

    // Set of players who have manual stats — these won't be overwritten
    const manualUuids = new Set(manualRows.map((r) => r.mc_uuid as string));

    // ── 2. Compute stats from game_stats for this season ──────────────────
    let gamesQuery = supabase
      .from("games")
      .select("id")
      .eq("league", league as string)
      .not("home_score", "is", null);
    if (querySeasons) {
      gamesQuery = gamesQuery.in("season", querySeasons);
    } else if (typeStr === "playoffs") {
      gamesQuery = (gamesQuery as typeof gamesQuery).ilike("season", "%Playoff%");
    } else if (typeStr === "regular") {
      gamesQuery = (gamesQuery as typeof gamesQuery).not("season", "ilike", "%Playoff%");
    }
    const { data: completedGames } = await gamesQuery;
    const gameIds = (completedGames ?? []).map((g) => g.id as string);

    // Aggregate game_stats per player (only for players WITHOUT manual stats)
    const computedByUuid: Record<string, Record<string, unknown>> = {};
    if (gameIds.length > 0) {
      const { data: gameStatsRows } = await supabase
        .from("game_stats")
        .select("mc_uuid, points, rebounds_off, rebounds_def, assists, steals, blocks, turnovers, minutes_played, fg_made, fg_attempted, three_pt_made, three_pt_attempted, pass_attempts, possession_time")
        .in("game_id", gameIds);

      for (const s of gameStatsRows ?? []) {
        const uuid = s.mc_uuid as string;
        if (manualUuids.has(uuid)) continue; // manual entry takes priority
        if (!computedByUuid[uuid]) {
          computedByUuid[uuid] = { gp: 0, pts: 0, reb: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, min: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, pass: 0, passGames: 0, poss: 0, possGames: 0 };
        }
        const c = computedByUuid[uuid] as Record<string, number>;
        c.gp  += 1;
        c.pts += (s.points           ?? 0) as number;
        c.orb += (s.rebounds_off     ?? 0) as number;
        c.drb += (s.rebounds_def     ?? 0) as number;
        c.reb += ((s.rebounds_off ?? 0) + (s.rebounds_def ?? 0)) as number;
        c.ast += (s.assists          ?? 0) as number;
        c.stl += (s.steals           ?? 0) as number;
        c.blk += (s.blocks           ?? 0) as number;
        c.tov += (s.turnovers        ?? 0) as number;
        c.min += (s.minutes_played   ?? 0) as number;
        c.fgm += (s.fg_made          ?? 0) as number;
        c.fga += (s.fg_attempted     ?? 0) as number;
        c.tpm += (s.three_pt_made    ?? 0) as number;
        c.tpa += (s.three_pt_attempted ?? 0) as number;
        if (s.pass_attempts != null)   { c.pass += s.pass_attempts as number;  c.passGames += 1; }
        if (s.possession_time != null) { c.poss += s.possession_time as number; c.possGames += 1; }
      }
    }

    const r1 = (n: number) => Math.round(n * 10) / 10;
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // ── VORP multi-pass ───────────────────────────────────────────────────
    // Pass 1: collect league averages for TOV/pg, 3FG%, and possession time/pg
    let leagueAvgBoxPg = 0;
    const playerBoxPg: Record<string, number> = {};
    if (Object.keys(computedByUuid).length > 0) {
      let topgSum = 0, topgN = 0;
      let tpctSum = 0, tpctN = 0;
      let possSum = 0, possN = 0;
      for (const [, c] of Object.entries(computedByUuid)) {
        const cv = c as Record<string, number>;
        if (cv.gp === 0) continue;
        topgSum += cv.tov / cv.gp; topgN++;
        if (cv.tpa > 0) { tpctSum += cv.tpm / cv.tpa; tpctN++; }
        if (cv.possGames > 0) { possSum += cv.poss / cv.possGames; possN++; }
      }
      const leagueAvgTopg   = topgN > 0 ? topgSum / topgN : 0;
      const leagueAvgTpct   = tpctN > 0 ? tpctSum / tpctN : 0;
      const leagueAvgPossPg = possN > 0 ? possSum / possN : 0;

      // Pass 2: compute adjusted box impact per game for each player.
      // This is not meant to be NBA BPM. It is tuned for this league so MVP seasons
      // separate upward while inefficient / low-impact seasons can fall below zero.
      for (const [uuid, c] of Object.entries(computedByUuid)) {
        const cv = c as Record<string, number>;
        if (cv.gp === 0) continue;
        const gp    = cv.gp;
        const fgaPg = cv.fga / gp;
        const tpaPg = cv.tpa / gp;
        const fgPct = cv.fga > 0 ? cv.fgm / cv.fga : 0;
        const tpPct = cv.tpa > 0 ? cv.tpm / cv.tpa : 0;
        const boxPg =
          (cv.pts +
            0.55 * cv.reb +
            0.75 * cv.ast +
            1.7 * cv.stl +
            1.5 * cv.blk +
            0.35 * cv.tpm -
            1.15 * cv.tov) / gp;

        const possPg = cv.possGames > 0 ? cv.poss / cv.possGames : 0;
        const passPg = cv.passGames > 0 ? cv.pass / cv.passGames : 0;
        const topg = cv.tov / gp;
        const tovOverExpected = possessionAdjustedTurnovers(topg, possPg, leagueAvgTopg, leagueAvgPossPg);
        const shootingTrust = shootingTrustFromTurnovers(tovOverExpected, topg);

        // Efficiency matters, but high-turnover ball handlers get less shooting credit.
        const fgEff = (fgPct - 0.45) * fgaPg * 1.8 * shootingTrust;
        const threeEff = leagueAvgTpct > 0 ? (tpPct - leagueAvgTpct) * tpaPg * 1.25 * shootingTrust : 0;

        // High possession time with low passing is a drag; low-turnover creation gets credit.
        const possBalance = leagueAvgPossPg > 0
          ? Math.max(-1.5, Math.min(1.5, (leagueAvgPossPg - possPg) / Math.max(leagueAvgPossPg, 1))) * Math.min(cv.tpm / Math.max(gp, 1), 3) * 0.18
          : 0;
        const playmakingBalance =
          (passPg > 0 ? Math.min(passPg / 45, 1.2) * 0.35 : 0) +
          Math.max(0, -tovOverExpected) * 0.25 -
          Math.max(0, tovOverExpected) * 0.85;

        playerBoxPg[uuid] = boxPg + fgEff + threeEff + possBalance + playmakingBalance;
      }

      const vals = Object.values(playerBoxPg);
      if (vals.length > 0) leagueAvgBoxPg = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    // Pass 3: compute VORP as plus/minus-style impact over league average.
    const computedRows = Object.entries(computedByUuid).map(([uuid, c]) => {
      const cv = c as Record<string, number>;
      const gp = cv.gp;
      const totalMin = cv.min / 60;
      const mpg = gp > 0 ? totalMin / gp : 0;
      const impactDiff = (playerBoxPg[uuid] ?? 0) - leagueAvgBoxPg;
      const vorp = (totalMin >= VORP_MIN_MINUTES && gp > 0)
        ? r2(clampVorp(impactDiff * VORP_SCALE * (mpg / GAME_MIN) * (gp / SEASON_GP_NORM)))
        : null;
      return {
        mc_uuid: uuid,
        season: seasonStr,
        gp,
        vorp,
        ppg:  gp > 0 ? r1(cv.pts / gp) : null,
        rpg:  gp > 0 ? r1(cv.reb / gp) : null,
        orpg: gp > 0 ? r1(cv.orb / gp) : null,
        drpg: gp > 0 ? r1(cv.drb / gp) : null,
        apg:  gp > 0 ? r1(cv.ast / gp) : null,
        spg:  gp > 0 ? r1(cv.stl / gp) : null,
        bpg:  gp > 0 ? r1(cv.blk / gp) : null,
        topg: gp > 0 ? r1(cv.tov / gp) : null,
        mpg:  gp > 0 ? r1(mpg) : null,
        fg_pct: cv.fga > 0 ? r1((cv.fgm / cv.fga) * 100) : null,
        three_pt_made: cv.tpm,
        three_pt_pct: cv.tpa > 0 ? r1((cv.tpm / cv.tpa) * 100) : null,
        tppg: gp > 0 ? r1(cv.tpm / gp) : null,
        pass_attempts_pg:   cv.passGames > 0 ? r1(cv.pass / cv.passGames) : null,
        possession_time_pg: cv.possGames > 0 ? Math.round(cv.poss / cv.possGames) : null,
      };
    });

    // ── 3. Merge: manual rows + computed rows ─────────────────────────────
    const allRows = [...manualRows, ...computedRows];

    const byPlayer: Record<string, Record<string, unknown>[]> = {};
    for (const row of allRows) {
      const uuid = row.mc_uuid as string;
      if (!byPlayer[uuid]) byPlayer[uuid] = [];
      byPlayer[uuid].push(row as Record<string, unknown>);
    }

    const uuids = Object.keys(byPlayer);
    const { data: playerRows } = uuids.length
      ? await supabase.from("players").select("mc_uuid, mc_username").in("mc_uuid", uuids)
      : { data: [] };
    const playerMap: Record<string, string> = {};
    for (const p of playerRows ?? []) playerMap[p.mc_uuid] = p.mc_username;

    // 1. Try player_teams with season variants (works for historical seasons)
    const lookupSeason = seasonStr === "all" ? null : seasonStr.replace(/ Playoffs$/, "");
    const lookupSeasonNumber = lookupSeason?.match(/\d+/)?.[0] ?? null;
    const seasonCandidates = lookupSeason
      ? [...new Set([lookupSeason, lookupSeasonNumber, lookupSeasonNumber ? `S${lookupSeasonNumber}` : null].filter((s): s is string => !!s))]
      : [];
    let ptQuery = supabase
      .from("player_teams")
      .select("mc_uuid, teams(id, name, abbreviation, logo_url)")
      .eq("league", league as string)
      .in("mc_uuid", uuids);
    if (seasonCandidates.length > 0) ptQuery = ptQuery.in("season", seasonCandidates);
    const { data: teamRows } = await ptQuery;
    const teamMap: Record<string, unknown> = {};
    for (const row of teamRows ?? []) {
      if (row.mc_uuid && row.teams) teamMap[row.mc_uuid] = row.teams;
    }
    // 2. Fallback to contracts for players still unresolved.
    // When a specific season is requested, match by season (any status) so old seasons don't
    // bleed the current active contract's team. For season=all, use active contracts only.
    const unresolvedUuids = uuids.filter((u) => !teamMap[u]);
    if (unresolvedUuids.length > 0) {
      let contractQuery = supabase
        .from("contracts")
        .select("mc_uuid, teams(id, name, abbreviation, logo_url)")
        .eq("league", league as string)
        .in("mc_uuid", unresolvedUuids);
      if (seasonCandidates.length > 0) {
        contractQuery = contractQuery.in("season", seasonCandidates);
      } else {
        contractQuery = contractQuery.eq("status", "active");
      }
      const { data: contractTeamRows } = await contractQuery;
      for (const row of contractTeamRows ?? []) {
        if (row.mc_uuid && row.teams && !teamMap[row.mc_uuid]) teamMap[row.mc_uuid] = row.teams;
      }
    }

    // 3. Last historical fallback: old roster rows may not have season filled in.
    const stillUnresolvedUuids = uuids.filter((u) => !teamMap[u]);
    if (stillUnresolvedUuids.length > 0 && lookupSeason && strictTeamSeason !== "1") {
      const { data: anySeasonTeamRows } = await supabase
        .from("player_teams")
        .select("mc_uuid, teams(id, name, abbreviation, logo_url)")
        .eq("league", league as string)
        .in("mc_uuid", stillUnresolvedUuids);
      for (const row of anySeasonTeamRows ?? []) {
        if (row.mc_uuid && row.teams && !teamMap[row.mc_uuid]) teamMap[row.mc_uuid] = row.teams;
      }
    }

    const result = uuids.map((uuid) => {
      const merged = mergePlayerRows(byPlayer[uuid]);
      return {
        rank: 0,
        mc_uuid: uuid,
        mc_username: playerMap[uuid] ?? uuid,
        team: teamMap[uuid] ?? null,
        ...merged,
      };
    });

    result.sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
    result.forEach((s, i) => { s.rank = i + 1; });
    return res.status(200).json(result);
  }

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  return res.status(400).json({ error: "season param required" });
}
