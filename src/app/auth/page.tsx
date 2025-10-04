"use client";
import { useState, useEffect } from "react";
import { supabaseBrowser } from "~/lib/supabaseClient";

export default function AuthPage() {
  const supabase = supabaseBrowser();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // If already authenticated, decide where to go immediately
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      if (data.user) {
        try {
          const statusRes = await fetch('/api/face/status');
          const statusJson = await statusRes.json();
          window.location.href = statusJson.enrolled ? '/' : '/face-enroll';
        } catch {
          window.location.href = '/face-enroll';
        }
      }
    });
    return () => { active = false; };
  }, [supabase]);

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
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) {
            setMessage("Account created. Please verify email in Supabase project settings OR disable confirmation to continue.");
            return;
          } else if (signInData.session) {
            window.location.href = "/face-enroll";
            return;
          }
        } else {
          window.location.href = "/face-enroll";
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.href = "/face-enroll";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-950 via-gray-900 to-black px-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur rounded-xl border border-white/10 p-8 space-y-6">
        <h1 className="text-2xl font-bold text-white text-center">
          {mode === "signup" ? "Create Account" : "Sign In"}
        </h1>
        <p className="text-xs text-white/50 text-center">
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
              className="w-full rounded-md bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
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
              className="w-full rounded-md bg-white/10 border border-white/20 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/30 rounded p-2">
              {error}
            </div>
          )}
          {message && (
            <div className="text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded p-2">
              {message}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 text-sm transition"
          >
            {loading ? "Please wait..." : mode === "signup" ? "Sign Up" : "Sign In"}
          </button>
        </form>
        <div className="text-center text-[11px] text-white/50">
          {mode === "signup" ? (
            <button
              onClick={() => setMode("signin")}
              className="text-fuchsia-400 hover:underline"
            >
              Already have an account? Sign in
            </button>
          ) : (
            <button
              onClick={() => setMode("signup")}
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
