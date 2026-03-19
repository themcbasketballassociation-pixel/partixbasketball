"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";

const leagues = [
  { short: "MBA",  full: "Minecraft Basketball Association", slug: "mba",  logo: "/logos/mba.webp",  accent: "#C8102E" },
  { short: "MCAA", full: "College",                          slug: "mcaa", logo: "/logos/mcaa.webp", accent: "#003087" },
  { short: "MBGL", full: "G League",                         slug: "mbgl", logo: "/logos/mbgl.svg",  accent: "#BB3430" },
];

const tabs = [
  { label: "Home",       path: "",           global: false },
  { label: "Teams",      path: "/teams",     global: false },
  { label: "Standings",  path: "/standings", global: false },
  { label: "Schedule",   path: "/schedule",  global: false },
  { label: "Box Scores", path: "/boxscores", global: false },
  { label: "Stats",      path: "/stats",     global: false },
  { label: "Players",    path: "/players",   global: false },
  { label: "Accolades",  path: "/accolades", global: false },
  { label: "Games",      path: "/games",     global: false },
  { label: "Links",      path: "/links",     global: true  },
  { label: "Admin",      path: "/admin",     global: false },
];

export default function Header() {
  const pathname = usePathname() ?? "/";
  const [selected, setSelected] = useState<string>("mba");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("partix:selectedLeague");
    // migrate old pba/pcaa/pbgl keys
    const migrated = saved === "pba" ? "mba" : saved === "pcaa" ? "mcaa" : saved === "pbgl" ? "mbgl" : saved;
    if (migrated) setSelected(migrated);
  }, []);

  useEffect(() => {
    localStorage.setItem("partix:selectedLeague", selected);
  }, [selected]);

  const currentLeague = leagues.find((l) => l.slug === selected) ?? leagues[0];

  const parts = pathname.split("/");
  const section = parts.length >= 3 ? `/${parts[2]}` : "";

  return (
    <header className="sticky top-0 z-40" style={{ background: "#0e0e0e", borderBottom: "1px solid #1e1e1e" }}>
      {/* Top bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 h-16">
        {/* Logo + league name */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-12 flex-shrink-0 drop-shadow-lg">
            <Image
              src={currentLeague.logo}
              alt={currentLeague.short}
              width={40}
              height={48}
              className="w-full h-full object-contain"
              unoptimized
            />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-tight tracking-wide">Minecraft Basketball</div>
            <div className="text-xs leading-tight" style={{ color: "#888" }}>{currentLeague.full}</div>
          </div>
        </div>

        {/* League switcher */}
        <div className="flex items-center gap-0.5 rounded-xl p-1" style={{ background: "#161616", border: "1px solid #252525" }}>
          {leagues.map((l) => (
            <button
              key={l.slug}
              onClick={() => setSelected(l.slug)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all duration-150"
              style={selected === l.slug
                ? { background: l.accent, color: "white", boxShadow: `0 2px 8px ${l.accent}55` }
                : { color: "#666", background: "transparent" }
              }
            >
              {l.short}
            </button>
          ))}
        </div>
      </div>

      {/* Nav tabs */}
      <div className="overflow-x-auto" style={{ background: "#0a0a0a", borderTop: "1px solid #181818" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex">
          {tabs.map((tab) => {
            const href = tab.global ? tab.path : `/${selected}${tab.path}`;
            const isActive = tab.global
              ? pathname === tab.path
              : tab.path === ""
                ? section === "" || section === undefined
                : section === tab.path;
            return (
              <Link
                key={tab.label}
                href={href}
                className="px-4 py-2.5 text-xs font-semibold whitespace-nowrap tracking-wide transition-all duration-150"
                style={isActive
                  ? { borderBottom: `2px solid ${currentLeague.accent}`, color: "white" }
                  : { borderBottom: "2px solid transparent", color: "#555" }
                }
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#aaa"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "#555"; }}
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
