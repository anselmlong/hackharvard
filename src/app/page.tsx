"use client";

import { LiveVideoFeed } from "./_components/LiveVideoFeed";

export default function Home() {
  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white flex flex-col items-center py-12 px-4">
      <header className="w-full max-w-5xl mb-10 flex flex-col items-center gap-4 text-center">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-fuchsia-400 via-violet-300 to-sky-300 bg-clip-text text-transparent">
          Facial Interaction Captcha (Prototype)
        </h1>
        <p className="text-sm md:text-base text-white/60 max-w-2xl leading-relaxed">
          Skeleton page: live camera feed only. Security levels, challenges &
          detection logic will be layered on later. Your video never leaves the
          browser—this is a local preview feed.
        </p>
      </header>

      <section className="w-full max-w-5xl flex flex-col items-center gap-8">
        <LiveVideoFeed />

        <div className="grid gap-4 w-full max-w-xl text-xs text-white/50">
          <div className="border border-white/10 rounded-lg p-4 bg-white/5 backdrop-blur-sm">
            <p className="font-semibold mb-1 text-white/80">Planned Next Layers</p>
            <ul className="list-disc list-inside space-y-1 marker:text-fuchsia-400">
              <li>Expression prompts (😃 😗 😉 😧 😬)</li>
              <li>Tongue True/False gesture capture</li>
              <li>Adaptive challenge sequencing</li>
              <li>Real-time overlay & confidence scores</li>
              <li>Benchmark / endless reasoning mode</li>
            </ul>
          </div>

          <div className="border border-white/10 rounded-lg p-4 bg-white/5 backdrop-blur-sm">
            <p className="font-semibold mb-1 text-white/80">Troubleshooting</p>
            <ul className="list-disc list-inside space-y-1">
              <li>If the feed is black: ensure only one tab/app uses the camera.</li>
              <li>Check site permissions (camera) in the browser bar.</li>
              <li>Reload after granting access.</li>
              <li>Incognito windows sometimes block permissions by policy.</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="mt-14 text-[10px] text-white/40 tracking-wide">
        Prototype build — no data stored or transmitted.
      </footer>
    </main>
  );
}
