"use client";
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '~/lib/supabaseClient';
import { computeFaceEmbedding } from '~/lib/faceMeshEmbed';

interface VerifyResponse { success: boolean; match?: boolean; similarity?: number; threshold?: number; error?: string }

export default function FaceVerifyPage() {
  const supabase = supabaseBrowser();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState('Initializing camera…');
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [match, setMatch] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) {
        window.location.href = '/auth';
        return;
      }
    });

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(()=>{});
          setStatus('Ready for verification');
        }
      } catch (e) {
        setStatus('Camera error: ' + (e instanceof Error ? e.message : 'unknown'));
      }
    })();
    return () => { active = false; const tracks = (videoRef.current?.srcObject as MediaStream | null)?.getTracks(); tracks?.forEach(t=>t.stop()); };
  }, [supabase]);

  const verify = async () => {
    if (!videoRef.current) return;
    setLoading(true);
    setStatus('Capturing & embedding…');
    try {
      const embedding = await computeFaceEmbedding(videoRef.current);
      if (!embedding) {
        setStatus('No face detected. Try again.');
        setLoading(false);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus('Session missing. Re-login.');
        setLoading(false);
        return;
      }
      setStatus('Verifying…');
      const res = await fetch('/api/face/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ vector: embedding.vector })
      });
      const json: VerifyResponse = await res.json();
      if (!json.success) {
        setStatus('Error: ' + (json.error || 'unknown'));
      } else {
        setMatch(json.match ?? null);
        setSimilarity(json.similarity ?? null);
        setThreshold(json.threshold ?? null);
        if (json.match) {
          setStatus('Match confirmed. Redirecting…');
          setTimeout(()=>{ window.location.href = '/'; }, 800);
        } else {
          setStatus('Face did not match. Try again.');
        }
      }
    } catch (e) {
      setStatus('Verify error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-sky-400 to-fuchsia-400 bg-clip-text text-transparent">Face Verification</h1>
          <p className="text-xs text-white/50">Capture a fresh frame and compare against your enrolled embedding.</p>
          <p className="text-xs text-emerald-400">{status}</p>
          {similarity !== null && threshold !== null && (
            <p className="text-[11px] text-white/40">Similarity: {similarity.toFixed(4)} (threshold {threshold})</p>
          )}
        </header>

        <div className="space-y-4">
          <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
            <video ref={videoRef} playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
          </div>
          <button onClick={verify} disabled={loading} className="w-full bg-sky-600 hover:bg-sky-500 rounded-md py-2 text-sm font-semibold disabled:opacity-40">
            {loading ? 'Processing…' : 'Verify Face'}
          </button>
          {match === false && (
            <p className="text-xs text-red-400">Not a match. Adjust lighting/angle and retry.</p>
          )}
        </div>
      </div>
    </main>
  );
}
