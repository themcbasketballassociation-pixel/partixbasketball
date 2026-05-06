import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";
import { sendWebhookEmbed, getWebhookUrl } from "../../../lib/discordWebhook";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league: leagueRaw, season } = req.query;
    const league = resolveLeague(leagueRaw);
    let query = supabase
      .from("team_owners")
      .select("*, teams(id, name, abbreviation, color2)")
      .order("created_at", { ascending: false });
    if (league) query = query.eq("league", league as string);
    if (season) query = query.eq("season", season as string);
    const { data, error } = await query;
    if (error) {
      // If season column doesn't exist, retry without season filter
      if (error.message.includes("season")) {
        let q2 = supabase
          .from("team_owners")
          .select("*, teams(id, name, abbreviation, color2)")
          .order("created_at", { ascending: false });
        if (league) q2 = q2.eq("league", league as string);
        const { data: d2, error: e2 } = await q2;
        if (e2) return res.status(500).json({ error: e2.message });
        return res.status(200).json(d2);
      }
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("../auth/[...nextauth]");
    const session = await getServerSession(req, res, authOptions as any);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const callerId = ((session as any).user as any)?.id?.toString();
    const isAdmin = process.env.ADMIN_DISCORD_IDS?.split(",").map((s) => s.trim()).includes(callerId ?? "");

    const { discord_id, team_id, league: leagueRaw, season, owner_name, role } = req.body;
    const league = resolveLeague(leagueRaw);
    if (!discord_id || !team_id || !league)
      return res.status(400).json({ error: "discord_id, team_id, league required" });

    // Non-admins can only add GMs to their own team (must be owner, not gm)
    if (!isAdmin) {
      if (role !== "gm") return res.status(403).json({ error: "Only admins can assign owners" });
      const { data: callerRecord } = await supabase
        .from("team_owners")
        .select("role")
        .eq("discord_id", callerId ?? "")
        .eq("team_id", team_id)
        .eq("league", league)
        .maybeSingle();
      if (!callerRecord || (callerRecord as any).role !== "owner")
        return res.status(403).json({ error: "Only the team owner can add a GM" });
    }

    // Remove any existing assignment for this discord+team+league (owner or gm)
    await supabase.from("team_owners").delete().match({ discord_id, team_id, league });

    const payload: Record<string, string | null> = { discord_id, team_id, league };
    if (season) payload.season = season;
    if (owner_name !== undefined) payload.owner_name = owner_name || null;
    if (role) payload.role = role;

    const { data, error } = await supabase
      .from("team_owners")
      .insert([payload])
      .select("*, teams(id, name, abbreviation, color2)")
      .single();

    if (error) {
      // If new columns don't exist yet, retry with only base fields
      if (error.message.includes("season") || error.message.includes("owner_name") || error.message.includes("role")) {
        const basePayload = { discord_id, team_id, league };
        const { data: d2, error: e2 } = await supabase
          .from("team_owners")
          .insert([basePayload])
          .select("*, teams(id, name, abbreviation, color2)")
          .single();
        if (e2) return res.status(500).json({ error: e2.message });
        return res.status(200).json(d2);
      }
      return res.status(500).json({ error: error.message });
    }

    // Fire transactions webhook for GM assignments
    if (role === "gm" && data) {
      const LEAGUE_LABELS: Record<string, string> = { pba: "MBA", pcaa: "MCAA", pbgl: "MBGL" };
      const LEAGUE_COLORS: Record<string, number> = { pba: 0xC8102E, pcaa: 0x003087, pbgl: 0xBB3430 };
      const BASE_URL = process.env.NEXTAUTH_URL ?? "https://partixbasketball.com";
      const teamName = (data as any).teams?.name ?? team_id;
      const teamAbbr = (data as any).teams?.abbreviation ?? "";
      const teamColor = (data as any).teams?.color2;
      const leagueDisplay = LEAGUE_LABELS[league] ?? league.toUpperCase();
      const displayName = (payload.owner_name as string | null) ?? discord_id;
      const embed: Record<string, unknown> = {
        color: teamColor ? parseInt(teamColor.replace("#", ""), 16) : (LEAGUE_COLORS[league] ?? 0x9333ea),
        title: "👔 GM Named",
        description: `**${displayName}** has been named General Manager of the **${teamName}**`,
        footer: {
          text: `${leagueDisplay} · ${teamAbbr}`,
          icon_url: `${BASE_URL}/logos/${league === "pba" ? "mba" : league === "pcaa" ? "mcaa" : "MBGL"}.${league === "pbgl" ? "png" : "webp"}`,
        },
        timestamp: new Date().toISOString(),
      };
      await sendWebhookEmbed(getWebhookUrl(league, "transaction"), embed);
    }

    return res.status(200).json(data);
  }

  // PATCH — update role (owner promotes/demotes GM); must be team owner or admin
  if (req.method === "PATCH") {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("../auth/[...nextauth]");
    const session = await getServerSession(req, res, authOptions as any);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const discordId = ((session as { user?: { id?: string } }).user as { id?: string })?.id;
    const { id, role } = req.body;
    if (!id || !role) return res.status(400).json({ error: "id and role required" });
    if (!["owner", "gm"].includes(role)) return res.status(400).json({ error: "role must be owner or gm" });

    // Verify the caller is either an admin or the owner of the same team/season
    const isAdmin = process.env.ADMIN_DISCORD_IDS?.split(",").map((s) => s.trim()).includes(discordId ?? "");

    if (!isAdmin) {
      // Caller must be an owner (not gm) of the same team
      const { data: target } = await supabase.from("team_owners").select("team_id, league, season").eq("id", id).maybeSingle();
      if (!target) return res.status(404).json({ error: "Record not found" });
      const { data: callerRecord } = await supabase.from("team_owners")
        .select("role")
        .eq("discord_id", discordId ?? "")
        .eq("team_id", (target as { team_id: string }).team_id)
        .eq("league", (target as { league: string }).league)
        .maybeSingle();
      if (!callerRecord || (callerRecord as { role: string }).role !== "owner") {
        return res.status(403).json({ error: "Only the team owner can manage GMs" });
      }
    }

    const { data, error } = await supabase.from("team_owners").update({ role }).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("../auth/[...nextauth]");
    const session = await getServerSession(req, res, authOptions as any);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const discordId = ((session as { user?: { id?: string } }).user as { id?: string })?.id;
    const isAdmin = process.env.ADMIN_DISCORD_IDS?.split(",").map((s) => s.trim()).includes(discordId ?? "");

    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });

    if (!isAdmin) {
      // Only allow owner to remove GMs from their own team
      const { data: target } = await supabase.from("team_owners").select("team_id, league, role").eq("id", id).maybeSingle();
      if (!target) return res.status(404).json({ error: "Not found" });
      if ((target as { role: string }).role !== "gm") return res.status(403).json({ error: "Only admins can remove owners" });
      const { data: callerRecord } = await supabase.from("team_owners")
        .select("role")
        .eq("discord_id", discordId ?? "")
        .eq("team_id", (target as { team_id: string }).team_id)
        .eq("league", (target as { league: string }).league)
        .maybeSingle();
      if (!callerRecord || (callerRecord as { role: string }).role !== "owner") {
        return res.status(403).json({ error: "Only the team owner can remove GMs" });
      }
    }

    const { error } = await supabase.from("team_owners").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
