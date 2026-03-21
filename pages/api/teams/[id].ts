import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || typeof id !== "string") return res.status(400).json({ error: "Missing id" });

  if (req.method === "PUT") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { name, abbreviation, division, logo_url, color2 } = req.body;
    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (abbreviation !== undefined) update.abbreviation = abbreviation;
    if (division !== undefined) update.division = division ?? null;
    if (logo_url !== undefined) update.logo_url = logo_url ?? null;
    if (color2 !== undefined) update.color2 = color2 ?? null;
    const { data, error } = await supabase.from("teams").update(update).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
