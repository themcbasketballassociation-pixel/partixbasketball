"use client";
import React, { useEffect, useState } from "react";

type Article = { id: string; league: string; title: string; body: string; created_at: string; image_url?: string | null };

const leagueLabel: Record<string, string> = {
  pba: "MBA", mba: "MBA",
  pcaa: "MCAA", mcaa: "MCAA",
  pbgl: "MBGL", mbgl: "MBGL",
};
const leagueColor: Record<string, string> = {
  pba: "#C8102E", mba: "#C8102E",
  pcaa: "#003087", mcaa: "#003087",
  pbgl: "#BB3430", mbgl: "#BB3430",
};

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/articles")
      .then(r => r.json())
      .then(d => { setArticles(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen" style={{ background: "#080808" }}>
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
        {/* Hero */}
        <div className="mb-8 rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #111 0%, #1a1a1a 100%)", border: "1px solid #1e1e1e" }}>
          <div className="px-8 py-10">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🏀</span>
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: "#C8102E" }}>Minecraft Basketball</span>
            </div>
            <h1 className="text-4xl font-black text-white leading-tight mb-2">Latest News</h1>
            <p className="text-sm" style={{ color: "#555" }}>Updates, announcements, and highlights from all leagues</p>
          </div>
        </div>

        {/* Articles */}
        {loading ? (
          <div className="py-20 text-center" style={{ color: "#444" }}>Loading...</div>
        ) : articles.length === 0 ? (
          <div className="py-20 text-center rounded-2xl" style={{ background: "#111", border: "1px solid #1e1e1e", color: "#444" }}>
            No articles yet.
          </div>
        ) : (
          <div className="space-y-4">
            {articles.map(a => (
              <article
                key={a.id}
                className="rounded-2xl p-6 transition-all duration-150 hover:scale-[1.005]"
                style={{ background: "#111", border: "1px solid #1e1e1e" }}
              >
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span
                    className="text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded-md"
                    style={{ background: leagueColor[a.league] ?? "#333", color: "white" }}
                  >
                    {leagueLabel[a.league] ?? a.league.toUpperCase()}
                  </span>
                  <span className="text-xs" style={{ color: "#444" }}>
                    {new Date(a.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                {a.image_url && <img src={a.image_url} alt="" className="rounded-xl mb-3 max-h-64 object-cover w-full" />}
                <h2 className="text-xl font-bold text-white mb-2 leading-snug">{a.title}</h2>
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#888" }}>{a.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
