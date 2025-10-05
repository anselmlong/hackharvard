"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GestureDetector } from "~/components/GestureDetector";
import { supabaseBrowser } from "~/lib/supabaseClient";

interface Emoji {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
}

const TONGUE_FACTS = [
  "The human tongue has about 10,000 taste buds that are replaced every 2 weeks.",
  "Your tongue is the only muscle in your body attached at only one end.",
  "The tongue is the strongest muscle in the human body relative to its size.",
  "Blue whales have tongues that weigh as much as an elephant (about 2,700 kg).",
  "Tongues have a unique print, just like fingerprints.",
  "The longest human tongue on record measures 10.1 cm (3.97 inches).",
  "Dogs use their tongues to regulate body temperature since they can't sweat.",
  "A chameleon's tongue can be up to twice the length of its body.",
  "The average tongue is about 3.3 inches long for men and 3.1 inches for women.",
  "Taste buds can detect five basic tastes: sweet, salty, sour, bitter, and umami.",
];

export default function Home() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const redirectTimerRef = useRef<number | null>(null);
  const hasRedirectedRef = useRef(false);
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [currentFact, setCurrentFact] = useState(0);

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

  // Initialize and animate emojis
  useEffect(() => {
    const initialEmojis: Emoji[] = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 4,
    }));

    setEmojis(initialEmojis);

    const interval = setInterval(() => {
      setEmojis((prev) =>
        prev.map((emoji) => {
          let { x, y, vx, vy, rotation, rotationSpeed } = emoji;

          x += vx;
          y += vy;
          rotation += rotationSpeed;

          if (x <= 0 || x >= 100) vx *= -1;
          if (y <= 0 || y >= 100) vy *= -1;

          if (x < 0) x = 0;
          if (x > 100) x = 100;
          if (y < 0) y = 0;
          if (y > 100) y = 100;

          return { ...emoji, x, y, vx, vy, rotation };
        })
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  // Rotate tongue facts
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFact((prev) => (prev + 1) % TONGUE_FACTS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/auth");
  };

  if (checking) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-black text-white overflow-hidden">
        {/* Flying emojis */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          {emojis.map((emoji) => (
            <div
              key={emoji.id}
              className="absolute text-4xl"
              style={{
                left: `${emoji.x}%`,
                top: `${emoji.y}%`,
                transform: `rotate(${emoji.rotation}deg)`,
              }}
            >
              👅
            </div>
          ))}
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-xs tracking-wide text-white/60">
            Checking session…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen w-full flex-col items-center bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white overflow-hidden">
      {/* Flying emojis */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {emojis.map((emoji) => (
          <div
            key={emoji.id}
            className="absolute text-4xl"
            style={{
              left: `${emoji.x}%`,
              top: `${emoji.y}%`,
              transform: `rotate(${emoji.rotation}deg)`,
            }}
          >
            👅
          </div>
        ))}
      </div>

      {/* Sign out button */}
      <div className="absolute top-4 right-4 z-50">
        {email && (
          <button
            onClick={signOut}
            className="rounded border border-white/10 bg-white/10 px-3 py-1 text-xs transition hover:bg-white/20"
          >
            Sign out
          </button>
        )}
      </div>

      {/* Main content - centered */}
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-6 px-4 py-8 max-w-screen-2xl mx-auto">
        <h1 className="bg-gradient-to-r from-fuchsia-400 via-violet-300 to-sky-300 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-6xl md:text-6xl">
          Welcome to Freak-cha
        </h1>
        {email && <p className="text-sm text-white/50">Signed in as {email}</p>}

        {/* Live Video Feed with Detection */}
        <div className="w-full max-w-3xl">
          <GestureDetector showDebug />
        </div>

        {/* Tongue Facts */}
        <div className="w-full max-w-4xl rounded-xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm">
          <p className="mb-3 text-base font-semibold uppercase tracking-wide text-fuchsia-400">
            👅 Tongue Fact
          </p>
          <p className="text-xl leading-relaxed text-white/90 transition-all duration-500">
            {TONGUE_FACTS[currentFact]}
          </p>
        </div>

        {/* Credits */}
        <p className="mt-2 text-sm text-white/40">
          Created by Anselm • Isa • Jensen • Junjie
        </p>
      </div>
    </main>
  );
}
