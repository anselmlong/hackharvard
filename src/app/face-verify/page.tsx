"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "~/lib/supabaseClient";
import { computeFaceEmbedding } from "~/lib/faceMeshEmbed";

interface VerifyResponse {
  success: boolean;
  match?: boolean;
  similarity?: number;
  threshold?: number;
  error?: string;
}

export default function FaceVerifyPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const redirectTimerRef = useRef<number | null>(null);
  const hasRedirectedRef = useRef(false);
  const [status, setStatus] = useState("Initializing camera…");
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [match, setMatch] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || hasRedirectedRef.current) return;
      if (!data.user) {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = window.setTimeout(async () => {
          if (!active || hasRedirectedRef.current) return;
          const { data: latest } = await supabase.auth.getUser();
          if (!latest.user) {
            hasRedirectedRef.current = true;
            router.replace("/auth");
          }
        }, 800);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setStatus("Ready for verification");
        }
      } catch (e) {
        setStatus(
          "Camera error: " +
            (e instanceof Error ? (e as Error).message : "unknown"),
        );
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "SIGNED_IN") {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        void init();
      }
    });

    void init();
    return () => {
      active = false;
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      authListener.subscription.unsubscribe();
      const tracks = (
        videoRef.current?.srcObject as MediaStream | null
      )?.getTracks();
      tracks?.forEach((t) => t.stop());
    };
  }, [supabase, router]);

  const verify = async () => {
    if (!videoRef.current) return;
    setLoading(true);
    setStatus("Capturing & embedding…");
    try {
      const embedding = await computeFaceEmbedding(videoRef.current);
      if (!embedding) {
        setStatus("No face detected. Try again.");
        setLoading(false);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus("Session missing. Re-login.");
        setLoading(false);
        return;
      }
      setStatus("Verifying…");
      const res = await fetch("/api/face/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ vector: embedding.vector }),
      });
      const json: VerifyResponse = await res.json();
      if (!json.success) {
        setStatus("Error: " + (json.error || "unknown"));
      } else {
        setMatch(json.match ?? null);
        setSimilarity(json.similarity ?? null);
        setThreshold(json.threshold ?? null);
        if (json.match) {
          setStatus("Match confirmed. Redirecting…");
          setTimeout(() => {
            router.replace("/");
          }, 800);
        } else {
          setStatus("Face did not match. Try again.");
        }
      }
    } catch (_e) {
      setStatus("Verify error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-gray-950 via-gray-900 to-black px-4 py-10 text-white">
      <div className="w-full max-w-xl space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="bg-gradient-to-r from-sky-400 to-fuchsia-400 bg-clip-text text-3xl font-bold text-transparent">
            Face Verification
          </h1>
          <p className="text-xs text-white/50">
            Capture a fresh frame and compare against your enrolled embedding.
          </p>
          <p className="text-xs text-emerald-400">{status}</p>
          {similarity !== null && threshold !== null && (
            <p className="text-[11px] text-white/40">
              Similarity: {similarity.toFixed(4)} (threshold {threshold})
            </p>
          )}
        </header>

        <div className="space-y-4">
          <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full scale-x-[-1] transform object-cover"
            />
          </div>
          <button
            onClick={verify}
            disabled={loading}
            className="w-full rounded-md bg-sky-600 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-40"
          >
            {loading ? "Processing…" : "Verify Face"}
          </button>
          {match === false && (
            <p className="text-xs text-red-400">
              Not a match. Adjust lighting/angle and retry.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
