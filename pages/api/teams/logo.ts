import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { requireAdmin } from "../../../lib/adminAuth";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { team_id, base64, mime, ext } = req.body;
  if (!team_id || !base64) return res.status(400).json({ error: "team_id and base64 required" });
  const buffer = Buffer.from(base64, "base64");
  const filePath = `${team_id}.${ext ?? "png"}`;
  const { error: uploadError } = await supabase.storage.from("team-logos").upload(filePath, buffer, { upsert: true, contentType: mime ?? "image/png" });
  if (uploadError) return res.status(500).json({ error: uploadError.message });
  const { data: urlData } = supabase.storage.from("team-logos").getPublicUrl(filePath);
  const logo_url = urlData.publicUrl;
  const { data, error } = await supabase.from("teams").update({ logo_url }).eq("id", team_id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json(data);
}
