"use client";
import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function PressRowRedirect() {
  const router = useRouter();
  const params = useParams();
  const league = (params?.league as string) ?? "mba";

  useEffect(() => {
    router.replace(`/${league}/admin`);
  }, [router, league]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-500">
      Redirecting to Press Portal…
    </div>
  );
}
