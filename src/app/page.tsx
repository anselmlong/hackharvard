"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveVideoFeed } from "./_components/LiveVideoFeed";
import { supabaseBrowser } from "~/lib/supabaseClient";

export default function Home() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const redirectTimerRef = useRef<number | null>(null);
  const hasRedirectedRef = useRef(false);
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = window.setTimeout(async () => {
          if (cancelled || hasRedirectedRef.current) return;
          const { data: latest } = await supabase.auth.getUser();
          if (!latest.user) {
            hasRedirectedRef.current = true;
            router.replace("/auth");
          }
        }, 800);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      try {
        const res = await fetch("/api/face/status", { headers });
        const status: { enrolled?: boolean } = await res.json();
        if (!status.enrolled) {
          router.replace("/face-enroll");
          return;
        }
        setEmail(user.email ?? null);
        setChecking(false);
      } catch {
        setEmail(user.email ?? null);
        setChecking(false);
      }
    };
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "SIGNED_IN") {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        hasRedirectedRef.current = false;
        void run();
      }
    });

    void run();
    return () => {
      cancelled = true;
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      authListener.subscription.unsubscribe();
    };
  }, [supabase, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-xs tracking-wide text-white/60">
            Checking session…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen w-full flex-col items-center bg-gradient-to-b from-gray-950 via-gray-900 to-black px-4 py-12 text-white">
      <header className="mb-10 flex w-full max-w-5xl flex-col items-center gap-3 text-center">
        <div className="mb-2 flex w-full justify-end">
          {email && (
            <button
              onClick={signOut}
              className="rounded border border-white/10 bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
            >
              Sign out
            </button>
          )}
        </div>
        <h1 className="bg-gradient-to-r from-fuchsia-400 via-violet-300 to-sky-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent md:text-5xl">
          Facial Interaction Captcha (Prototype)
        </h1>
        {email && <p className="text-xs text-white/50">Signed in as {email}</p>}
        <p className="max-w-2xl text-sm leading-relaxed text-white/60 md:text-base">
          Skeleton page: live camera feed only. Security levels & challenges
          will be added later.
        </p>
      </header>

      <section className="flex w-full max-w-5xl flex-col items-center gap-8">
        <LiveVideoFeed />

        <div className="grid w-full max-w-xl gap-4 text-xs text-white/50">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <p className="mb-1 font-semibold text-white/80">
              Planned Next Layers
            </p>
            <ul className="list-inside list-disc space-y-1 marker:text-fuchsia-400">
              <li>Expression prompts (😃 😗 😉 😧 😬)</li>
              <li>Tongue True/False gesture capture</li>
              <li>Adaptive challenge sequencing</li>
              <li>Real-time overlay & confidence scores</li>
              <li>Benchmark / endless reasoning mode</li>
            </ul>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <p className="mb-1 font-semibold text-white/80">Troubleshooting</p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                If the feed is black: ensure only one tab/app uses the camera.
              </li>
              <li>Check site permissions (camera) in the browser bar.</li>
              <li>Reload after granting access.</li>
              <li>Incognito windows sometimes block permissions by policy.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="mt-14 text-[10px] tracking-wide text-white/40">
        Prototype build — no data stored or transmitted.
      </footer>
    </main>
  );
}
