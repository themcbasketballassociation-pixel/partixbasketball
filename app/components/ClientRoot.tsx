"use client";
import { SessionProvider } from "next-auth/react";
import Header from "./Header";

export default function ClientRoot({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Header />
      <main className="site-main">{children}</main>
    </SessionProvider>
  );
}
