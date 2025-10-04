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

let faceMeshInstance: any | null = null;
let faceMeshInitPromise: Promise<any> | null = null;

async function loadFaceMesh(): Promise<any> {
  if (faceMeshInstance) return faceMeshInstance;
  if (faceMeshInitPromise) return faceMeshInitPromise;
  // Dynamic import. Different bundlers expose different keys; we probe.
  faceMeshInitPromise = (async () => {
    const mod: any = await import('@mediapipe/face_mesh');
    const FaceMeshCtor = mod.FaceMesh || (mod.default && mod.default.FaceMesh) || (globalThis as any).FaceMesh;
    if (!FaceMeshCtor) {
      throw new Error('Failed to load MediaPipe FaceMesh constructor');
    }
    const fm = new FaceMeshCtor({ locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
    fm.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    faceMeshInstance = fm;
    return fm;
  })();
  return faceMeshInitPromise;
}

/**
 * Extract a simple embedding from FaceMesh landmarks (flatten x,y,z then L2 normalize)
 */
export async function computeFaceEmbedding(video: HTMLVideoElement): Promise<FaceEmbeddingResult | null> {
  const fm = await loadFaceMesh();
  return new Promise((resolve, reject) => {
    // Overwrite handler for this single inference
    fm.onResults((results: MPFaceMeshResults) => {
      const landmarks = results.multiFaceLandmarks?.[0];
      if (!landmarks) { resolve(null); return; }
      const vec: number[] = new Array(landmarks.length * 3);
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (!lm) continue;
        vec[i * 3] = lm.x;
        vec[i * 3 + 1] = lm.y;
        vec[i * 3 + 2] = lm.z ?? 0;
      }
      // Zero-mean + L2 normalize
      const mean = vec.reduce((a, b) => a + b, 0) / vec.length;
      for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) - mean;
      let norm = 0; for (const v of vec) norm += v * v; norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
      resolve({ vector: vec, landmarks });
    });
    fm.send({ image: video }).catch(reject);
  });
}