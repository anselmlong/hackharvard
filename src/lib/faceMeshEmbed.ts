"use client";
// Dynamic import wrapper for MediaPipe FaceMesh to avoid missing named export errors in ESM/Next bundling.
// We DO NOT rely on a static named export since some builds provide only a UMD global or different export shape.
// We load it on demand in the browser.

// Minimal shape for the results we care about
export interface MPFaceLandmark { x: number; y: number; z?: number }
export interface MPFaceMeshResults { multiFaceLandmarks?: MPFaceLandmark[][] }

export interface FaceEmbeddingResult {
  vector: number[]; // length 1404 (468 * 3) normalized
  landmarks: MPFaceLandmark[] | null;
}

// Use a minimal interface for the FaceMesh instance we depend on
interface FaceMeshLike {
  setOptions(options: Record<string, unknown>): void;
  onResults(cb: (r: MPFaceMeshResults) => void): void;
  send(arg: { image: HTMLVideoElement }): Promise<void>;
  initialize?(): Promise<void>;
}

let faceMeshInstance: FaceMeshLike | null = null;
let faceMeshInitPromise: Promise<FaceMeshLike> | null = null;

async function loadFaceMesh(): Promise<FaceMeshLike> {
  if (faceMeshInstance) return faceMeshInstance;
  if (faceMeshInitPromise) return faceMeshInitPromise;
  // Dynamic import. Different bundlers expose different keys; we probe.
  faceMeshInitPromise = (async () => {
    const mod = await import('@mediapipe/face_mesh');
    const globalCandidate = (globalThis as unknown as { FaceMesh?: unknown }).FaceMesh;
    const FaceMeshCtor = (mod as unknown as { FaceMesh?: unknown }).FaceMesh
      ?? (mod as unknown as { default?: { FaceMesh?: unknown } }).default?.FaceMesh
      ?? globalCandidate;
    if (!FaceMeshCtor) {
      throw new Error('Failed to load MediaPipe FaceMesh constructor');
    }
    const fm = new (FaceMeshCtor as new (args: { locateFile: (file: string) => string }) => FaceMeshLike)({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    fm.setOptions({
      maxNumFaces: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      refineLandmarks: false,
    });
    faceMeshInstance = fm;
    return fm;
  })();
  return faceMeshInitPromise;
}

/**
 * Extract a simple embedding from FaceMesh landmarks (flatten x,y,z then L2 normalize)
 */
export async function computeFaceEmbedding(video: HTMLVideoElement, maxAttempts = 6, frameDelayMs = 80): Promise<FaceEmbeddingResult | null> {
  const fm = await loadFaceMesh();

  // Ensure video has dimensions; wait briefly if needed
  if ((video.readyState < 2 || video.videoWidth === 0) && typeof window !== 'undefined') {
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => resolve(), 600);
      const handler = () => {
        if (video.videoWidth > 0) {
          clearTimeout(timeout);
          video.removeEventListener('loadeddata', handler);
          resolve();
        }
      };
      video.addEventListener('loadeddata', handler);
    });
  }

  // Optional initialize if library exposes it
  if (typeof fm.initialize === 'function') {
    try { await fm.initialize(); } catch {/* ignore */}
  }

  return new Promise(async (resolve) => {
    let resolved = false;
    fm.onResults((results: MPFaceMeshResults) => {
      if (resolved) return;
      const landmarks = results.multiFaceLandmarks?.[0];
      if (!landmarks) return; // let retries continue
      const vec: number[] = new Array(landmarks.length * 3);
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (!lm) continue;
        vec[i * 3] = lm.x;
        vec[i * 3 + 1] = lm.y;
        vec[i * 3 + 2] = lm.z ?? 0;
      }
      const mean = vec.reduce((a, b) => a + b, 0) / vec.length;
      for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) - mean;
      let norm = 0; for (const v of vec) norm += v * v; norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
      resolved = true;
      resolve({ vector: vec, landmarks });
    });

    for (let attempt = 0; attempt < maxAttempts && !resolved; attempt++) {
      try {
        await fm.send({ image: video });
      } catch {
        // swallow per-attempt errors
      }
      if (!resolved) {
        await new Promise(r => setTimeout(r, frameDelayMs));
      }
    }
    if (!resolved) resolve(null);
  });
}