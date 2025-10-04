"use client";

import { useEffect, useRef, useState } from "react";


export const LiveVideoFeed = () => {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [status, setStatus] = useState<
		"idle" | "requesting" | "ready" | "error"
	>("idle");
	const [error, setError] = useState<string | null>(null);
	const [resolution, setResolution] = useState<string>("");

	useEffect(() => {
		let stream: MediaStream | null = null;
		const start = async () => {
			setStatus("requesting");
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
					audio: false,
				});
				if (videoRef.current) {
					videoRef.current.srcObject = stream;
					await videoRef.current.play().catch(() => { /* autoplay blocked */ });
					const track = stream.getVideoTracks()[0];
					const settings = track?.getSettings();
					if (settings?.width && settings?.height) {
						setResolution(`${settings.width}x${settings.height}`);
					}
					setStatus("ready");
				}
			} catch (e) {
				setStatus("error");
				setError(e instanceof Error ? e.message : "Unknown error requesting camera");
			}
		};
		void start();
		return () => { stream?.getTracks().forEach(t => t.stop()); };
	}, []);

	return (
		<div className="relative w-full max-w-xl aspect-video rounded-xl overflow-hidden bg-black border border-white/10">
			<video
				ref={videoRef}
				playsInline
				muted
				className="w-full h-full object-cover transform scale-x-[-1]"
			/>
			{/* Overlay */}
			<div className="absolute inset-x-0 top-0 p-2 flex justify-between text-[10px] font-mono pointer-events-none select-none">
				<span className="px-2 py-1 rounded bg-black/50 backdrop-blur text-white">
					{status === "ready" ? "LIVE" : status.toUpperCase()}
				</span>
				{resolution && status === "ready" && (
					<span className="px-2 py-1 rounded bg-black/50 backdrop-blur text-white">
						{resolution}
					</span>
				)}
			</div>
			{status === "requesting" && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white text-sm">
					<div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
					Requesting Camera...
				</div>
			)}
			{status === "error" && (
				<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-center p-4 text-red-200 text-xs">
					<p className="font-semibold text-red-300">Camera Error</p>
					<p>{error}</p>
					<p className="text-[10px] opacity-70">
						Check browser permissions & ensure no other app is using the camera.
					</p>
				</div>
			)}
		</div>
	);
};
