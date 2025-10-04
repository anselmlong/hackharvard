"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveVideoFeed } from "./_components/LiveVideoFeed";
import { supabaseBrowser } from "~/lib/supabaseClient";

export default function Home() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) {
        router.replace('/auth');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string,string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
      try {
        const res = await fetch('/api/face/status', { headers });
        const status: { enrolled?: boolean } = await res.json();
        if (!status.enrolled) {
          router.replace('/face-enroll');
          return;
        }
        setEmail(user.email ?? null);
        setChecking(false);
      } catch {
        setEmail(user.email ?? null);
        setChecking(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [supabase, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-9 h-9 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          <p className="text-xs tracking-wide text-white/60">Checking session…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white flex flex-col items-center py-12 px-4">
      <header className="w-full max-w-5xl mb-10 flex flex-col items-center gap-3 text-center">
        <div className="flex w-full justify-end mb-2">
          {email && (
            <button
              onClick={signOut}
              className="text-xs px-3 py-1 rounded bg-white/10 hover:bg-white/20 transition border border-white/10"
            >
              Sign out
            </button>
          )}
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-fuchsia-400 via-violet-300 to-sky-300 bg-clip-text text-transparent">
          Facial Interaction Captcha (Prototype)
        </h1>
        {email && (
          <p className="text-xs text-white/50">Signed in as {email}</p>
        )}
        <p className="text-sm md:text-base text-white/60 max-w-2xl leading-relaxed">
          Skeleton page: live camera feed only. Security levels & challenges will
          be added later.
        </p>
      </header>

      <section className="w-full max-w-5xl flex flex-col items-center gap-8">
        <LiveVideoFeed />

        <div className="grid gap-4 w-full max-w-xl text-xs text-white/50">
          <div className="border border-white/10 rounded-lg p-4 bg-white/5 backdrop-blur-sm">
            <p className="font-semibold mb-1 text-white/80">Planned Next Layers</p>
            <ul className="list-disc list-inside space-y-1 marker:text-fuchsia-400">
              <li>Expression prompts (😃 😗 😉 😧 😬)</li>
              <li>Tongue True/False gesture capture</li>
              <li>Adaptive challenge sequencing</li>
              <li>Real-time overlay & confidence scores</li>
              <li>Benchmark / endless reasoning mode</li>
            </ul>
          </div>

          <div className="border border-white/10 rounded-lg p-4 bg-white/5 backdrop-blur-sm">
            <p className="font-semibold mb-1 text-white/80">Troubleshooting</p>
            <ul className="list-disc list-inside space-y-1">
              <li>If the feed is black: ensure only one tab/app uses the camera.</li>
              <li>Check site permissions (camera) in the browser bar.</li>
              <li>Reload after granting access.</li>
              <li>Incognito windows sometimes block permissions by policy.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="mt-14 text-[10px] text-white/40 tracking-wide">
        Prototype build — no data stored or transmitted.
      </footer>
    </main>
  );
}
