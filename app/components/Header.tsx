"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const leagues = [
  { short: "PBA", full: "Partix Basketball Association", slug: "pba" },
  { short: "PCAA", full: "College", slug: "pcaa" },
  { short: "PBGL", full: "G League", slug: "pbgl" },
];

const tabs = [
  { label: "Home", path: "" },
  { label: "Teams", path: "/teams" },
  { label: "Standings", path: "/standings" },
  { label: "Schedule", path: "/schedule" },
  { label: "Box Scores", path: "/boxscores" },
  { label: "Stats", path: "/stats" },
  { label: "Accolades", path: "/accolades" },
  { label: "Admin", path: "/admin" },
];

export default function Header() {
  const pathname = usePathname() ?? "/";
  const [selected, setSelected] = useState<string>("pba");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("partix:selectedLeague");
    if (saved) setSelected(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("partix:selectedLeague", selected);
  }, [selected]);

  const currentLeague = leagues.find((l) => l.slug === selected) ?? leagues[0];

  // Determine active tab path segment
  const parts = pathname.split("/");
  const section = parts.length >= 3 ? `/${parts[2]}` : "";

  return (
    <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-40">
      {/* Top bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 h-14">
        {/* Logo + league name */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 2 Q6 8 6 12 Q6 16 12 22" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M12 2 Q18 8 18 12 Q18 16 12 22" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight">Partix Basketball</div>
            <div className="text-xs text-slate-400 leading-tight">{currentLeague.full}</div>
          </div>
        </div>

        {/* League switcher */}
        <div className="flex items-center gap-1 bg-slate-950 rounded-lg border border-slate-800 p-0.5">
          {leagues.map((l) => (
            <button
              key={l.slug}
              onClick={() => setSelected(l.slug)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
                selected === l.slug
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {l.short}
            </button>
          ))}
        </div>
      </div>

      {/* Nav tabs */}
      <div className="border-t border-slate-800/60 bg-slate-950 overflow-x-auto">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex">
          {tabs.map((tab) => {
            const href = `/${selected}${tab.path}`;
            const isActive =
              tab.path === ""
                ? section === "" || section === undefined
                : section === tab.path;
            return (
              <Link
                key={tab.label}
                href={href}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  isActive
                    ? "border-blue-500 text-white"
                    : "border-transparent text-slate-400 hover:text-white hover:border-slate-600"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
