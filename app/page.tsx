"use client";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-lg">
          <h2 className="text-3xl font-bold">Welcome to Minecraft Basketball</h2>
          <p className="mt-3 max-w-2xl text-slate-400">
            Use the tabs in the header to switch between leagues and views.
          </p>
        </div>
      </section>
    </main>
  );
}