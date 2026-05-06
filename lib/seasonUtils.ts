/** Normalize a season string — strips duplicate leading "S" characters (e.g. "SSeason 7" → "Season 7") */
export function normalizeSeason(season: string | null | undefined): string | null {
  if (!season) return season ?? null;
  return season.replace(/^S+(?=eason\s)/i, "S");
}
