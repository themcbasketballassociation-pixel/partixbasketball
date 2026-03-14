"use client";
import React from "react";

const leagueNames: Record<string, string> = {
  pba: "Partix Basketball Association",
  pcaa: "College",
  pbgl: "G League",
};

type Article = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

export default function LeagueHome({ params }: { params?: Promise<{ league?: string }> }) {
  const resolved = React.use(params ?? Promise.resolve({})) as { league?: string };
  const slug = resolved?.league ?? "";
  const leagueName = leagueNames[slug] ?? (slug ? slug.toUpperCase() : "League");

  const [articles, setArticles] = React.useState<Article[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!slug) { setLoading(false); return; }
    fetch(`/api/articles?league=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setArticles(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  return (
    <div className="space-y-6">
      {/* League header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg px-6 py-5">
        <h2 className="text-2xl font-bold text-white">{leagueName}</h2>
        <p className="text-slate-400 text-sm mt-1">
          Use the tabs above to view teams, standings, schedule, box scores, stats, and accolades.
        </p>
      </div>

      {/* Articles / Announcements */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-bold text-white">Announcements</h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading...</div>
        ) : articles.length === 0 ? (
          <div className="p-8 text-center text-slate-600 text-sm">No announcements yet.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {articles.map((a) => (
              <div key={a.id} className="px-6 py-5 hover:bg-slate-950 transition">
                <div className="flex items-start justify-between gap-4">
                  <h4 className="font-semibold text-white text-base">{a.title}</h4>
                  <span className="text-slate-500 text-xs flex-shrink-0 mt-0.5">
                    {new Date(a.created_at).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </span>
                </div>
                <p className="mt-2 text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{a.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}