import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";
import { resolveLeague } from "../../../lib/leagueMapping";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { league: leagueRaw } = req.body;
  const league = resolveLeague(leagueRaw);
  if (!league) return res.status(400).json({ error: "league required" });

  const { data, error } = await supabase
    .from("auctions")
    .update({ status: "cancelled" })
    .eq("league", league)
    .eq("status", "active")
    .lt("closes_at", new Date().toISOString())
    .select("id");

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ cancelled: data?.length ?? 0 });
}
