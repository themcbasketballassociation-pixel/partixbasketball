import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "crypto";

function generateUUID(username: string): string {
  const hash = createHash("md5").update("OfflinePlayer:" + username).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.toString("hex");
  return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20,32);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { username } = req.query;
  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "No username" });
  }
  try {
    const mojang = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
    if (mojang.ok) {
      const data = await mojang.json();
      const raw: string = data.id;
      const uuid = raw.slice(0,8)+"-"+raw.slice(8,12)+"-"+raw.slice(12,16)+"-"+raw.slice(16,20)+"-"+raw.slice(20);
      return res.status(200).json({ uuid, username: data.name, found: true });
    }
  } catch (_e) {}
  return res.status(200).json({ uuid: generateUUID(username), username, found: false });
}