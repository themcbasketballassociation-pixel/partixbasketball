import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";

export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const adminEnv = process.env.ADMIN_DISCORD_IDS ?? "";
  const admins = adminEnv.split(",").map((s) => s.trim()).filter(Boolean);
  const userId = ((session as any).user as any)?.id?.toString();
  if (!userId || !admins.includes(userId)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return userId;
}
