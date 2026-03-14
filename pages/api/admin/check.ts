import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) return res.status(401).json({ authorized: false });
  const adminEnv = process.env.ADMIN_DISCORD_IDS ?? "";
  const admins = adminEnv.split(",").map((s) => s.trim()).filter(Boolean);
  const userId = ((session as any).user as any)?.id?.toString();
  return res.status(200).json({ authorized: !!userId && admins.includes(userId) });
}