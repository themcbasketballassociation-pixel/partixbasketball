import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { supabase } from "../../../lib/supabase";

const SUPER_ADMIN_ID = "692814756695900191";

async function getSuperAdmin(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
  const session = await getServerSession(req, res, authOptions as any);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const userId = ((session as any).user as any)?.id?.toString();
  if (userId !== SUPER_ADMIN_ID) { res.status(403).json({ error: "Forbidden" }); return null; }
  return userId;
}

const TABLES = [
  "teams",
  "players",
  "player_teams",
  "games",
  "game_stats",
  "accolades",
  "playoff_brackets",
  "contracts",
  "team_owners",
  "auction_items",
  "auction_bids",
  "trades",
  "trade_assets",
  "draft_picks",
  "cap_retentions",
  "articles",
  "board_members",
  "board_votes",
  "sbc_entries",
];

export const config = { api: { bodyParser: { sizeLimit: "50mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await getSuperAdmin(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    // Export all tables
    const backup: Record<string, unknown[]> = {};
    const errors: string[] = [];

    for (const table of TABLES) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        errors.push(`${table}: ${error.message}`);
        backup[table] = [];
      } else {
        backup[table] = data ?? [];
      }
    }

    return res.status(200).json({
      version: 1,
      created_at: new Date().toISOString(),
      errors: errors.length ? errors : undefined,
      data: backup,
    });
  }

  if (req.method === "POST") {
    // Restore from backup
    const { data: backup, confirmRestore } = req.body;
    if (!confirmRestore) return res.status(400).json({ error: "Must set confirmRestore: true" });
    if (!backup || typeof backup !== "object") return res.status(400).json({ error: "Invalid backup payload" });

    const results: Record<string, string> = {};

    // Restore in dependency order (parents before children)
    const order = [
      "teams",
      "players",
      "player_teams",
      "games",
      "game_stats",
      "accolades",
      "playoff_brackets",
      "contracts",
      "team_owners",
      "auction_items",
      "auction_bids",
      "trades",
      "trade_assets",
      "draft_picks",
      "cap_retentions",
      "articles",
      "board_members",
      "board_votes",
      "sbc_entries",
    ];

    for (const table of order) {
      const rows = backup[table];
      if (!Array.isArray(rows) || rows.length === 0) {
        results[table] = "skipped (no data)";
        continue;
      }
      // Upsert all rows
      const { error } = await supabase.from(table).upsert(rows, { ignoreDuplicates: false });
      if (error) {
        results[table] = `error: ${error.message}`;
      } else {
        results[table] = `restored ${rows.length} rows`;
      }
    }

    return res.status(200).json({ restored: true, results });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
