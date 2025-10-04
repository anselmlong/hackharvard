"use client";
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '~/lib/supabaseClient';
import { computeFaceEmbedding } from '~/lib/faceMeshEmbed';

interface EmbeddingResponse { success: boolean; vectorId?: string; error?: string; dimensions?: number; userId?: string }

export default function FaceEnrollPage() {
  const supabase = supabaseBrowser();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<string>("Not enrolled");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) {
        window.location.href = '/auth';
      } else {
        setUserEmail(data.user.email ?? null);
        // Check enrollment status
        fetch('/api/face/status').then(r => r.json()).then(json => {
          if (json.enrolled) setStatus('Already enrolled');
        }).catch(() => {});
      }
    });

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(()=>{});
        }
      } catch (e) {
        setStreamError(e instanceof Error ? e.message : 'Camera error');
      }
    };
    init();
    return () => { active = false; const tracks = (videoRef.current?.srcObject as MediaStream | null)?.getTracks(); tracks?.forEach(t=>t.stop()); };
  }, [supabase]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    setCapturedDataUrl(dataUrl);
  };

  const upload = async () => {
    if (!videoRef.current) return;
    setUploading(true);
    try {
      setStatus('Computing landmarks…');
      const embedding = await computeFaceEmbedding(videoRef.current);
      if (!embedding) {
        setStatus('Embedding failed. Try again.');
        setUploading(false);
        return;
      }
      // Retrieve current session to forward access token (needed for server route auth)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus('No active session (401). Please re-login.');
        setUploading(false);
        return;
      }
      setStatus('Uploading vector…');
      const res = await fetch('/api/face/enroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ vector: embedding.vector })
      });
      if (res.status === 401) {
        setStatus('Unauthorized (401). Session expired or missing. Re-login.');
        setUploading(false);
        return;
      }
      const json: EmbeddingResponse = await res.json();
      if (json.success) {
        const dims = json.dimensions ? `${json.dimensions} dims` : '';
        setStatus(`Enrollment complete ${dims && '(' + dims + ')'}`);
        setTimeout(()=>{ window.location.href = '/'; }, 1000);
      } else {
        setStatus('Failed: ' + (json.error || 'Unknown error'));
      }
    } catch (e) {
      setStatus('Embedding error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-3xl flex flex-col gap-8">
        <header className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-fuchsia-400 to-sky-300 bg-clip-text text-transparent">Facial Enrollment</h1>
          <p className="text-sm text-white/60">Capture a single reference image. We'll embed it and store a vector for future verification.</p>
          {userEmail && <p className="text-xs text-white/40">Signed in as {userEmail}</p>}
          <p className="text-xs text-emerald-400">Status: {status}</p>
        </header>

        <section className="grid md:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
              {streamError && <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm p-4 text-center">{streamError}</div>}
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
            </div>
            <div className="flex gap-3">
              <button onClick={capture} className="flex-1 bg-fuchsia-600 hover:bg-fuchsia-500 rounded-md py-2 text-sm font-semibold disabled:opacity-50" disabled={!!streamError}>Capture</button>
              <button onClick={()=>setCapturedDataUrl(null)} className="px-3 bg-white/10 hover:bg-white/20 rounded-md text-xs">Reset</button>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">Lighting tip: ensure even front lighting, avoid strong backlight. Your image is processed client-side then sent for embedding. Raw image can be discarded server-side after vectorization.</p>
          </div>

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white/70 tracking-wide">Preview & Upload</h2>
            <div className="relative rounded-lg border border-white/10 bg-white/5 aspect-video flex items-center justify-center overflow-hidden">
              {capturedDataUrl ? (
                <img src={capturedDataUrl} alt="Captured" className="object-cover w-full h-full" />
              ) : (
                <span className="text-xs text-white/40">No capture yet</span>
              )}
            </div>
            <button disabled={uploading} onClick={upload} className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-md py-2 text-sm font-semibold">
              {uploading ? 'Processing…' : 'Detect & Embed'}
            </button>
            <p className="text-[11px] text-white/40">We will convert this image to a face embedding vector (placeholder). Later: integrate real model & vector DB (Pinecone / Supabase Vector / Weaviate).</p>
          </div>
        </section>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}
