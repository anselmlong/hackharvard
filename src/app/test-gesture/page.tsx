"use client";

import { useRef, useEffect, useState } from "react";
import { supabaseBrowser } from "~/lib/supabaseClient";

export default function TestGesturePage() {
  const supabase = supabaseBrowser();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [detection, setDetection] = useState<string>("no_tongue");
  const [confidence, setConfidence] = useState<number>(0);
  const [bufferSize, setBufferSize] = useState<number>(0);
  const [gesture, setGesture] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [fps, setFps] = useState<number>(0);

  // Start camera
  useEffect(() => {
    const start = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    };
    start();
  }, []);

  // Detection loop
  useEffect(() => {
    let frameCount = 0;
    let lastTime = Date.now();

    const detect = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const video = videoRef.current;

      if (video.videoWidth === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.8);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch("/api/gesture/detect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ image: imageData }),
        });

        const data = await res.json();

        setDetection(data.detection);
        setConfidence(data.confidence);
        setBufferSize(data.bufferSize);
        setDistribution(data.distribution || {});

        if (data.gesture) {
          setGesture(data.gesture);
        }

        // FPS
        frameCount++;
        const now = Date.now();
        if (now - lastTime >= 1000) {
          setFps(frameCount);
          frameCount = 0;
          lastTime = now;
        }
      } catch (e) {
        console.error(e);
      }
    };

    const interval = setInterval(detect, 100); // 10fps
    return () => clearInterval(interval);
  }, [supabase]);

  const clearBuffer = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch("/api/gesture/detect", {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${session.access_token}` },
    });

    setBufferSize(0);
    setGesture(null);
    setDistribution({});
  };

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Gesture Detection Test</h1>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Video */}
          <div>
            <video
              ref={videoRef}
              className="w-full aspect-video bg-gray-900 rounded-lg transform scale-x-[-1]"
              playsInline
              muted
            />
          </div>

          {/* Info */}
          <div className="space-y-4">
            {/* Current Detection */}
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400">Current Detection</div>
              <div className="text-2xl font-mono font-bold text-green-400">
                {detection}
              </div>
              <div className="text-sm text-gray-400">
                {(confidence * 100).toFixed(1)}% | {fps} FPS
              </div>
            </div>

            {/* Buffer */}
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-2">Buffer</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${(bufferSize / 20) * 100}%` }}
                  />
                </div>
                <div className="text-sm font-mono">{bufferSize}/20</div>
              </div>
            </div>

            {/* Distribution */}
            {Object.keys(distribution).length > 0 && (
              <div className="bg-gray-900 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-2">Distribution</div>
                <div className="space-y-1">
                  {Object.entries(distribution).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="w-24 font-mono">{key}:</span>
                      <div className="flex-1 h-3 bg-gray-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-yellow-500"
                          style={{ width: `${value * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right">{(value * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Detected Gesture */}
            {gesture && (
              <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
                <div className="text-sm text-green-400">Gesture Detected!</div>
                <div className="text-2xl font-bold text-green-400">
                  {gesture}
                </div>
              </div>
            )}

            {/* Controls */}
            <button
              onClick={clearBuffer}
              className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded"
            >
              Clear Buffer
            </button>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </main>
  );
}
