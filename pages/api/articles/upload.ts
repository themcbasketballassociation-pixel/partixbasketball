import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../lib/supabase";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Allow any authenticated user (admin or press member) to upload article images
  const session = await getServerSession(req, res, authOptions);
  const discordId = (session?.user as { id?: string })?.id;
  if (!discordId) return res.status(401).json({ error: "Not authenticated" });

  const { base64, filename, contentType } = req.body;
  if (!base64 || !filename) return res.status(400).json({ error: "base64 and filename required" });

  const buffer = Buffer.from(base64, "base64");
  const ext = filename.split(".").pop() ?? "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("article-images")
    .upload(path, buffer, { contentType: contentType ?? "image/jpeg", upsert: false });

  if (error) return res.status(500).json({ error: error.message });

  const { data: { publicUrl } } = supabase.storage.from("article-images").getPublicUrl(path);

  return res.status(200).json({ url: publicUrl });
}
