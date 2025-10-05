"use client";

import { useRef, useEffect, useState } from "react";
import { supabaseBrowser } from "~/lib/supabaseClient";

interface GestureDetectorProps {
  onGesture?: (gesture: string) => void;
  onDetection?: (detection: string, confidence: number) => void;
  showDebug?: boolean;
  className?: string;
}

export function GestureDetector({
  onGesture,
  onDetection,
  showDebug = false,
  className = "",
}: GestureDetectorProps) {
  const supabase = supabaseBrowser();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [detection, setDetection] = useState<string>("no_tongue");
  const [confidence, setConfidence] = useState<number>(0);
  const [bufferSize, setBufferSize] = useState<number>(0);

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

    return () => {
      const tracks = (videoRef.current?.srcObject as MediaStream)?.getTracks();
      tracks?.forEach((t) => t.stop());
    };
  }, []);

  // Detection loop
  useEffect(() => {
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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch("/api/gesture/detect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ image: imageData }),
        });

        const data = await res.json();

        setDetection(data.detection);
        setConfidence(data.confidence);
        setBufferSize(data.bufferSize);

        // Callbacks
        if (onDetection) {
          onDetection(data.detection, data.confidence);
        }

        if (data.gesture && onGesture) {
          onGesture(data.gesture);
        }
      } catch (e) {
        console.error(e);
      }
    };

    const interval = setInterval(detect, 100);
    return () => clearInterval(interval);
  }, [supabase, onGesture, onDetection]);

  return (
    <div className={className}>
      <video
        ref={videoRef}
        className="w-full aspect-video bg-gray-900 rounded-lg transform scale-x-[-1]"
        playsInline
        muted
      />

      {showDebug && (
        <div className="mt-4 bg-gray-900 rounded-lg p-4 flex justify-between text-sm">
          <div>
            <span className="text-gray-400">Detection: </span>
            <span className="font-mono text-green-400">{detection}</span>
          </div>
          <div>
            <span className="text-gray-400">Confidence: </span>
            <span className="font-mono">{(confidence * 100).toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-gray-400">Buffer: </span>
            <span className="font-mono">{bufferSize}/10</span>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
