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
let currentRefine = false;

async function loadFaceMesh(refine: boolean): Promise<FaceMeshLike> {
  if (faceMeshInstance) {
    if (refine && !currentRefine) {
      try {
        faceMeshInstance.setOptions({ refineLandmarks: true });
        currentRefine = true;
        await new Promise(r => setTimeout(r, 10));
      } catch { /* ignore */ }
    }
    return faceMeshInstance;
  }
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
      refineLandmarks: refine,
    });
    faceMeshInstance = fm;
    currentRefine = !!refine;
    return fm;
  })();
  return faceMeshInitPromise;
}


export interface ComputeEmbeddingOptions {
  frames?: number;           // number of frames to accumulate (>=1)
  maxAttemptsPerFrame?: number; // attempts per frame capture
  frameDelayMs?: number;     // delay between attempts
  refineLandmarks?: boolean; // enable iris/depth refinement
}

export async function computeFaceEmbedding(
  video: HTMLVideoElement,
  options: ComputeEmbeddingOptions = {}
): Promise<FaceEmbeddingResult | null> {
  const {
    frames = 1,
    maxAttemptsPerFrame = 6,
    frameDelayMs = 80,
    refineLandmarks = false,
  } = options;

  const fm = await loadFaceMesh(refineLandmarks);

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

  // Accumulators
  const accum: number[] | null = null; // placeholder (we'll allocate after first frame)
  const collected: number[][] = [];
  let lastLandmarks: MPFaceLandmark[] | null = null;

  function processLandmarks(landmarks: MPFaceLandmark[]): number[] {
      try {
        const count = landmarks.length;
        // Common landmark indices (FaceMesh canonical):
        // 1 ~ nose tip (actually landmark 1 is near center). We'll fallback if missing.
        const NOSE = 1;
        const LEFT_EYE = 33; // left eye outer corner
        const RIGHT_EYE = 263; // right eye outer corner
        const nose = landmarks[NOSE] || landmarks[Math.floor(count/2)];
        const leftEye = landmarks[LEFT_EYE];
        const rightEye = landmarks[RIGHT_EYE];
        if (!nose || !leftEye || !rightEye) {
          // Fallback to original simple embedding if anchor points missing
          const vecSimple: number[] = new Array(count * 3);
            for (let i = 0; i < count; i++) {
              const lm = landmarks[i];
              vecSimple[i*3] = lm?.x ?? 0; vecSimple[i*3+1] = lm?.y ?? 0; vecSimple[i*3+2] = lm?.z ?? 0;
            }
            // L2 norm
            let n0 = 0; for (const v of vecSimple) n0 += v*v; n0 = Math.sqrt(n0)||1;
            for (let i=0;i<vecSimple.length;i++) vecSimple[i] = (vecSimple[i] ?? 0) / n0;
            return vecSimple;
        }
        // Step 1: translate so nose at origin
        const tx = nose.x, ty = nose.y, tz = nose.z ?? 0;
        const translated: {x:number; y:number; z:number}[] = new Array(count);
        for (let i=0;i<count;i++) {
          const lm = landmarks[i];
          translated[i] = { x: (lm?.x ?? 0) - tx, y: (lm?.y ?? 0) - ty, z: (lm?.z ?? 0) - tz };
        }
        // Step 2: rotate so eye line horizontal
        const ex = (rightEye.x - leftEye.x);
        const ey = (rightEye.y - leftEye.y);
        const angle = Math.atan2(ey, ex); // angle of eye line
        const cosA = Math.cos(-angle); // rotate by -angle
        const sinA = Math.sin(-angle);
        for (let i=0;i<count;i++) {
          const p = translated[i]!;
          const rx = p.x * cosA - p.y * sinA;
          const ry = p.x * sinA + p.y * cosA;
          p.x = rx; p.y = ry; // z unchanged
        }
        // Step 3: scale by inter-eye distance
        const eyeDist = Math.sqrt(ex*ex + ey*ey) || 1;
        for (let i=0;i<count;i++) {
          const p = translated[i]!;
          p.x /= eyeDist; p.y /= eyeDist; p.z /= eyeDist;
        }
        // Step 4: per-axis mean/std normalization
        let sumX=0,sumY=0,sumZ=0;
  for (const p of translated) { sumX+=p!.x; sumY+=p!.y; sumZ+=p!.z; }
        const meanX=sumX/count, meanY=sumY/count, meanZ=sumZ/count;
        let varX=0,varY=0,varZ=0;
        for (const p of translated) {
          varX += (p!.x-meanX)**2; varY += (p!.y-meanY)**2; varZ += (p!.z-meanZ)**2;
        }
        const stdX = Math.sqrt(varX/count) || 1e-6;
        const stdY = Math.sqrt(varY/count) || 1e-6;
        const stdZ = Math.sqrt(varZ/count) || 1e-6;
        // Flatten
        const flat: number[] = new Array(count*3);
        for (let i=0;i<count;i++) {
          const p = translated[i]!;
          flat[i*3] = (p.x - meanX)/stdX;
          flat[i*3+1] = (p.y - meanY)/stdY;
          flat[i*3+2] = (p.z - meanZ)/stdZ;
        }
        // Step 5: final L2 norm
        let norm = 0; for (const v of flat) norm += v*v; norm = Math.sqrt(norm) || 1;
  for (let i=0;i<flat.length;i++) flat[i] = (flat[i] ?? 0) / norm;
        return flat;
      } catch {
        return [];
      }
  }

  return new Promise(async (resolve) => {
    let framesCollected = 0;
    let done = false;
    fm.onResults((results: MPFaceMeshResults) => {
      if (done) return;
      const lm = results.multiFaceLandmarks?.[0];
      if (!lm) return;
      const vec = processLandmarks(lm);
      if (vec.length === 0) return;
      collected.push(vec);
      lastLandmarks = lm;
      framesCollected++;
      if (framesCollected >= frames) {
        // Average BEFORE final renorm? We already L2'd each vector; to reduce bias, we can sum raw then renorm.
        // Simpler: sum and renorm again.
        const dim = vec.length;
        const sum = new Array(dim).fill(0);
        for (const v of collected) {
          for (let i=0;i<dim;i++) sum[i] += v[i];
        }
        for (let i=0;i<dim;i++) sum[i] /= collected.length;
        // Final L2
        let n = 0; for (const x of sum) n += x*x; n = Math.sqrt(n)||1;
        for (let i=0;i<dim;i++) sum[i] /= n;
        done = true;
        resolve({ vector: sum, landmarks: lastLandmarks });
      }
    });

    // Drive capture loop
    for (let f = 0; f < frames && !done; f++) {
      let attempts = 0;
      while (attempts < maxAttemptsPerFrame && !done && collected.length <= f) {
        attempts++;
        try { await fm.send({ image: video }); } catch {/* ignore */}
        if (collected.length <= f) {
          await new Promise(r => setTimeout(r, frameDelayMs));
        }
      }
    }
    if (!done) resolve(null);
  });
}