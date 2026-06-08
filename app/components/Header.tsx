"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

const leagues = [
  { short: "MBA", full: "Minecraft Basketball Association", slug: "mba", logo: "/logos/mba.webp", accent: "#c8102e" },
  { short: "MCAA", full: "College", slug: "mcaa", logo: "/logos/mcaa.webp", accent: "#1f5eff" },
];

const tabs: { label: string; path: string; global: boolean; only: string[] | null; top?: boolean }[] = [
  { label: "Home", path: "", global: false, only: null, top: true },
  { label: "Teams", path: "/teams", global: false, only: null, top: true },
  { label: "Schedule", path: "/schedule", global: false, only: null, top: true },
  { label: "Stats", path: "/stats", global: false, only: null, top: true },
  { label: "Players", path: "/players", global: false, only: null, top: true },
  { label: "Box Scores", path: "/boxscores", global: false, only: null, top: true },
  { label: "Games", path: "/games", global: false, only: null, top: true },
  { label: "Portal", path: "/portal", global: false, only: ["mcaa"], top: true },
  { label: "Admin", path: "/admin", global: false, only: null, top: true },
  { label: "Auction", path: "/auction", global: false, only: ["mba"] },
  { label: "Standings", path: "/standings", global: false, only: null },
  { label: "Advanced Stats", path: "/players/advanced", global: false, only: null },
  { label: "News", path: "/articles", global: false, only: null },
  { label: "Links", path: "/links", global: true, only: null },
];

export default function Header() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [selected, setSelected] = useState("mba");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    const saved = localStorage.getItem("partix:selectedLeague");
    const migrated = saved === "pba" ? "mba" : saved === "pcaa" ? "mcaa" : saved === "pbgl" || saved === "mbgl" ? "mba" : saved;
    if (migrated) setSelected(migrated);
  }, []);

  useEffect(() => {
    const leagueFromPath = pathname.split("/").filter(Boolean)[0];
    if (leagues.some((league) => league.slug === leagueFromPath) && leagueFromPath !== selected) {
      setSelected(leagueFromPath);
    }
  }, [pathname, selected]);

  useEffect(() => {
    localStorage.setItem("partix:selectedLeague", selected);
  }, [selected]);

  const currentLeague = leagues.find((l) => l.slug === selected) ?? leagues[0];
  const visibleTabs = tabs.filter((tab) => !tab.only || tab.only.includes(selected));
  const topTabs = visibleTabs.filter((tab) => tab.top);
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const activeTab = visibleTabs
    .filter((tab) => !tab.global && tab.path !== "")
    .map((tab) => ({ tab, href: `/${selected}${tab.path}`.replace(/\/$/, "") }))
    .filter(({ href }) => normalizedPath === href || normalizedPath.startsWith(`${href}/`))
    .sort((a, b) => b.tab.path.length - a.tab.path.length)[0]?.tab;

  const changeLeague = (slug: string) => {
    setSelected(slug);
    const currentTab = activeTab ?? tabs.find((tab) => !tab.global && tab.path === "");
    router.push(currentTab && !currentTab.global ? `/${slug}${currentTab.path}` : `/${slug}`);
  };

  return (
    <header className="site-header">
      <div className="site-header__bar">
        <Link href={`/${selected}`} className="brand-lockup" style={{ ["--league-accent" as string]: currentLeague.accent }}>
          <span className="brand-lockup__logo">
            <Image src={currentLeague.logo} alt={currentLeague.short} width={42} height={50} unoptimized />
          </span>
          <span className="brand-lockup__copy">
            <span className="brand-lockup__eyebrow">Minecraft Basketball</span>
            <span className="brand-lockup__title">{currentLeague.short}</span>
          </span>
        </Link>

        <nav className="nav-pill" aria-label="Primary navigation">
          {topTabs.map((tab) => {
            const href = tab.global ? tab.path : `/${selected}${tab.path}`;
            const isActive = tab.global
              ? normalizedPath === tab.path
              : tab.path === ""
                ? normalizedPath === `/${selected}`
                : activeTab?.path === tab.path || !!activeTab?.path.startsWith(`${tab.path}/`);
            return (
              <Link
                key={tab.label}
                href={href}
                className={`nav-pill__link ${isActive ? "nav-pill__link--active" : ""}`}
                style={isActive ? { ["--league-accent" as string]: currentLeague.accent } : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-actions">
          <div className="league-switcher" aria-label="League switcher">
            {leagues.map((league) => (
              <button
                key={league.slug}
                type="button"
                onClick={() => changeLeague(league.slug)}
                className={selected === league.slug ? "league-switcher__btn league-switcher__btn--active" : "league-switcher__btn"}
                style={selected === league.slug ? { ["--league-accent" as string]: league.accent } : undefined}
              >
                {league.short}
              </button>
            ))}
          </div>

          {session ? (
            <Link href={`/${selected}/profile`} className="account-chip" title="Your Profile">
              {session.user?.image ? (
                <img src={session.user.image} referrerPolicy="no-referrer" alt="" />
              ) : (
                <span>{session.user?.name?.[0] ?? "?"}</span>
              )}
              <strong>{session.user?.name ?? "Profile"}</strong>
            </Link>
          ) : (
            <button type="button" onClick={() => signIn("discord")} className="signin-chip">
              Sign In
            </button>
          )}

          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="mobile-nav">
          {visibleTabs.map((tab) => {
            const href = tab.global ? tab.path : `/${selected}${tab.path}`;
            const isActive = tab.global
              ? normalizedPath === tab.path
              : tab.path === ""
                ? normalizedPath === `/${selected}`
                : activeTab?.path === tab.path;
            return (
              <Link
                key={tab.label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={isActive ? "mobile-nav__link mobile-nav__link--active" : "mobile-nav__link"}
                style={isActive ? { ["--league-accent" as string]: currentLeague.accent } : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
