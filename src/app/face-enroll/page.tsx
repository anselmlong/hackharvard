"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "~/lib/supabaseClient";
import { computeFaceEmbedding } from "~/lib/faceMeshEmbed";

interface EmbeddingResponse {
  success: boolean;
  vectorId?: string;
  error?: string;
  dimensions?: number;
  userId?: string;
}

export default function FaceEnrollPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const redirectTimerRef = useRef<number | null>(null);
  const hasRedirectedRef = useRef(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string>("Not enrolled");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const setup = async () => {
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
      setUserEmail(data.user.email ?? null);
      // Include bearer token for status
      const {
        data: { session },
      } = await supabase.auth.getSession();
      try {
        const headers: Record<string, string> = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};
        const statusRes = await fetch("/api/face/status", { headers });
        const statusJson: { enrolled?: boolean } = await statusRes.json();
        if (statusJson.enrolled) setStatus("Already enrolled");
      } catch {
        /* ignore */
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        setStreamError(e instanceof Error ? e.message : "Camera error");
      }
    };
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "SIGNED_IN") {
        if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
        void setup();
      }
    });

    void setup();
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

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    setCapturedDataUrl(dataUrl);
  };

  const upload = async () => {
    if (!videoRef.current) return;
    setUploading(true);
    try {
      setStatus("Computing landmarks (5 frames)…");
      const embedding = await computeFaceEmbedding(videoRef.current, { frames: 5, refineLandmarks: true });
      if (!embedding) {
        setStatus("Embedding failed. Try again.");
        setUploading(false);
        return;
      }
      console.debug('[enroll] embedding length', embedding.vector.length);
      // Retrieve current session to forward access token (needed for server route auth)
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus("No active session (401). Please re-login.");
        setUploading(false);
        return;
      }
  setStatus(`Uploading vector (${embedding.vector.length} dims)…`);
      const res = await fetch("/api/face/enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ vector: embedding.vector }),
      });
      if (res.status === 401) {
        setStatus("Unauthorized (401). Session expired or missing. Re-login.");
        setUploading(false);
        return;
      }
      const json: EmbeddingResponse = await res.json();
      if (json.success) {
        const dims = json.dimensions ? `${json.dimensions} dims` : "";
        setStatus(`Enrollment complete ${dims && "(" + dims + ")"}`);
        setTimeout(() => {
          router.replace("/");
        }, 1000);
      } else {
        setStatus("Failed: " + (json.error || "Unknown error"));
      }
    } catch (_e) {
      setStatus("Embedding error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-gray-950 via-gray-900 to-black px-4 py-10 text-white">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-2 text-center">
          <h1 className="bg-gradient-to-r from-fuchsia-400 to-sky-300 bg-clip-text text-3xl font-bold text-transparent">
            Facial Enrollment
          </h1>
          <p className="text-sm text-white/60">
            Capture a single reference image. We'll embed it and store a vector
            for future verification.
          </p>
          {userEmail && (
            <p className="text-xs text-white/40">Signed in as {userEmail}</p>
          )}
          <p className="text-xs text-emerald-400">Status: {status}</p>
        </header>

        <section className="grid items-start gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black">
              {streamError && (
                <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-400">
                  {streamError}
                </div>
              )}
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full scale-x-[-1] transform object-cover"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={capture}
                className="flex-1 rounded-md bg-fuchsia-600 py-2 text-sm font-semibold hover:bg-fuchsia-500 disabled:opacity-50"
                disabled={!!streamError}
              >
                Capture
              </button>
              <button
                onClick={() => setCapturedDataUrl(null)}
                className="rounded-md bg-white/10 px-3 text-xs hover:bg-white/20"
              >
                Reset
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-white/40">
              Lighting tip: ensure even front lighting, avoid strong backlight.
              Your image is processed client-side then sent for embedding. Raw
              image can be discarded server-side after vectorization.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold tracking-wide text-white/70">
              Preview & Upload
            </h2>
            <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
              {capturedDataUrl ? (
                <img
                  src={capturedDataUrl}
                  alt="Captured"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-white/40">No capture yet</span>
              )}
            </div>
            <button
              disabled={uploading}
              onClick={upload}
              className="w-full rounded-md bg-sky-600 py-2 text-sm font-semibold hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {uploading ? "Processing…" : "Detect & Embed"}
            </button>
            <p className="text-[11px] text-white/40">
              We will convert this image to a face embedding vector
              (placeholder). Later: integrate real model & vector DB (Pinecone /
              Supabase Vector / Weaviate).
            </p>
          </div>
        </section>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}
