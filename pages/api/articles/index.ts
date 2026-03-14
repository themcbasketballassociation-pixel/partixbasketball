import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const { league } = req.query;
    let query = supabase.from("articles").select("*").order("created_at", { ascending: false });
    if (league) query = query.eq("league", league as string);
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { league, title, body } = req.body;
    if (!league || !title || !body) return res.status(400).json({ error: "league, title, and body are required" });
    const { data, error } = await supabase.from("articles").insert([{ league, title, body }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
