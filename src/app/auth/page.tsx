"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "~/lib/supabaseClient";
import { Captcha } from "~/components/Captcha";

export default function AuthPage() {
  const supabase = supabaseBrowser();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);

  // If already authenticated, decide where to go immediately
  const router = useRouter();
  const redirectTimerRef = useRef<number | null>(null);
  const hasRedirectedRef = useRef(false);
  // useEffect(() => {
  //   let active = true;
  //   const run = async () => {
  //     const { data } = await supabase.auth.getUser();
  //     if (!active) return;
  //     if (!data.user) return;
  //     if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
  //     redirectTimerRef.current = window.setTimeout(async () => {
  //       if (!active) return;
  //       const { data: latest } = await supabase.auth.getUser();
  //       if (!latest.user || hasRedirectedRef.current) return;
  //       try {
  //         const {
  //           data: { session },
  //         } = await supabase.auth.getSession();
  //         const headers: Record<string, string> = session?.access_token
  //           ? { Authorization: `Bearer ${session.access_token}` }
  //           : {};
  //         const statusRes = await fetch("/api/face/status", { headers });
  //         const statusJson = (await statusRes.json()) as { enrolled?: boolean };
  //         hasRedirectedRef.current = true;
  //         router.replace(statusJson.enrolled ? "/face-verify" : "/face-enroll");
  //       } catch {
  //         /* ignore */
  //       }
  //     }, 300);
  //   };
  //   const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
  //     if (!active) return;
  //     if (event === "SIGNED_IN") {
  //       if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
  //       hasRedirectedRef.current = false;
  //       void run();
  //     }
  //   });

  //   void run();
  //   return () => {
  //     active = false;
  //     if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
  //     authListener.subscription.unsubscribe();
  //   };
  // }, [supabase, router]);

  const postAuthRedirect = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      router.replace("/face-enroll"); // fallback
      return;
    }
    try {
      const statusRes = await fetch("/api/face/status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const statusJson = (await statusRes.json()) as { enrolled?: boolean };
      router.replace(statusJson.enrolled ? "/face-verify" : "/face-enroll");
    } catch {
      router.replace("/face-enroll");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Attempt immediate session (depends on Supabase email confirmation settings)
        if (!data.session) {
          // Try sign in directly (if email confirmation disabled)
          const { data: signInData, error: signInErr } =
            await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) {
            setMessage("Account created.");
            return;
          } else if (signInData.session) {
            await postAuthRedirect(); // uses router.replace internally now
            return;
          }
        } else {
          await postAuthRedirect();
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await postAuthRedirect();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-950 via-gray-900 to-black px-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <h1 className="text-center text-2xl font-bold text-white">
          {mode === "signup" ? "Create Account" : "Sign In"}
        </h1>
        <p className="text-center text-xs text-white/50">
          {mode === "signup"
            ? "Sign up to access the facial interaction demo."
            : "Welcome back."}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-white/60">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-fuchsia-500 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-white/60">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-fuchsia-500 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="rounded border border-red-400/30 bg-red-400/10 p-2 text-xs text-red-400">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded border border-emerald-400/30 bg-emerald-400/10 p-2 text-xs text-emerald-400">
              {message}
            </div>
          )}
          <div className="flex justify-center pt-2">
            <Captcha
              key={captchaKey}
              onSuccess={() => setCaptchaVerified(true)}
              onError={(error) => console.error(error)}
              failurePercentage={100}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !captchaVerified}
            className="w-full rounded-md bg-fuchsia-600 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : !captchaVerified
                ? "Complete CAPTCHA first"
                : mode === "signup"
                  ? "Sign Up"
                  : "Sign In"}
          </button>
        </form>
        <div className="text-center text-[11px] text-white/50">
          {mode === "signup" ? (
            <button
              onClick={() => {
                setMode("signin");
                setCaptchaVerified(false);
                setCaptchaKey((prev) => prev + 1);
              }}
              className="text-fuchsia-400 hover:underline"
            >
              Already have an account? Sign in
            </button>
          ) : (
            <button
              onClick={() => {
                setMode("signup");
                setCaptchaVerified(false);
                setCaptchaKey((prev) => prev + 1);
              }}
              className="text-fuchsia-400 hover:underline"
            >
              Need an account? Create one
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
