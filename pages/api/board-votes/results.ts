import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getSessionDiscordId } from "../../../lib/ownerAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

// Points per rank
function playerPoints(rank: number): number { return Math.max(0, 11 - rank); }        // 1st=10, 10th=1
function awardPoints(rank: number): number { return rank === 1 ? 5 : rank === 2 ? 3 : 1; } // 1st=5, 2nd=3, 3rd=1

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { league: leagueRaw, season } = req.query;
  const league = resolveLeague(leagueRaw);

  // Must be authenticated
  const discordId = await getSessionDiscordId(req, res);
  if (!discordId) return;

  // Must be a board member or admin for this league+season
  const { data: members } = await supabase
    .from("board_members")
    .select("id")
    .eq("discord_id", discordId)
    .eq("league", league as string)
    .eq("season", season as string);
  const isMember = members && members.length > 0;

  const adminEnv = process.env.ADMIN_DISCORD_IDS ?? "";
  const isAdmin = adminEnv.split(",").map(s => s.trim()).includes(discordId);

  if (!isMember && !isAdmin) return res.status(403).json({ error: "Access denied" });

  // Fetch all votes for this league+season
  let q = supabase.from("board_votes").select("*");
  if (league) q = q.eq("league", league as string);
  if (season) q = q.eq("season", season as string);
  const { data: votes, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  // Count total board members who submitted votes
  const submittedMemberIds = new Set((votes ?? []).map((v: any) => v.board_member_id));

  // Aggregate player rankings (vote_type='player')
  const playerPoints_map: Record<string, number> = {};
  const playerVoteCount: Record<string, number> = {};

  // Aggregate team rankings (vote_type='team')
  const teamPoints_map: Record<string, number> = {};
  const teamVoteCount: Record<string, number> = {};

  // Aggregate award votes (vote_type='award'), keyed by category
  const awardPoints_map: Record<string, Record<string, number>> = {};
  const awardVoteCount: Record<string, Record<string, number>> = {};

  for (const v of (votes ?? [])) {
    if (v.vote_type === "player" && v.mc_uuid) {
      const pts = playerPoints(v.rank);
      playerPoints_map[v.mc_uuid] = (playerPoints_map[v.mc_uuid] ?? 0) + pts;
      playerVoteCount[v.mc_uuid] = (playerVoteCount[v.mc_uuid] ?? 0) + 1;
    } else if (v.vote_type === "team" && v.team_id) {
      playerPoints_map; // unused here
      teamPoints_map[v.team_id] = (teamPoints_map[v.team_id] ?? 0) + playerPoints(v.rank);
      teamVoteCount[v.team_id] = (teamVoteCount[v.team_id] ?? 0) + 1;
    } else if (v.vote_type === "award" && v.category && v.mc_uuid) {
      if (!awardPoints_map[v.category]) awardPoints_map[v.category] = {};
      if (!awardVoteCount[v.category]) awardVoteCount[v.category] = {};
      awardPoints_map[v.category][v.mc_uuid] = (awardPoints_map[v.category][v.mc_uuid] ?? 0) + awardPoints(v.rank);
      awardVoteCount[v.category][v.mc_uuid] = (awardVoteCount[v.category][v.mc_uuid] ?? 0) + 1;
    }
  }

  // Sort and rank player results
  const playerResults = Object.entries(playerPoints_map)
    .map(([mc_uuid, points]) => ({ mc_uuid, points, votes: playerVoteCount[mc_uuid] ?? 0 }))
    .sort((a, b) => b.points - a.points || b.votes - a.votes)
    .map((r, i) => ({ ...r, place: i + 1 }));

  // Sort and rank team results
  const teamResults = Object.entries(teamPoints_map)
    .map(([team_id, points]) => ({ team_id, points, votes: teamVoteCount[team_id] ?? 0 }))
    .sort((a, b) => b.points - a.points || b.votes - a.votes)
    .map((r, i) => ({ ...r, place: i + 1 }));

  // Sort award results per category
  const awardResults: Record<string, { mc_uuid: string; points: number; votes: number; place: number }[]> = {};
  for (const [cat, map] of Object.entries(awardPoints_map)) {
    awardResults[cat] = Object.entries(map)
      .map(([mc_uuid, points]) => ({ mc_uuid, points, votes: awardVoteCount[cat][mc_uuid] ?? 0 }))
      .sort((a, b) => b.points - a.points || b.votes - a.votes)
      .map((r, i) => ({ ...r, place: i + 1 }));
  }

  return res.status(200).json({
    totalVoters: submittedMemberIds.size,
    players: playerResults,
    teams: teamResults,
    awards: awardResults,
  });
}
