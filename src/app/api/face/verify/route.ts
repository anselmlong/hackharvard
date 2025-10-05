import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

const BASE_DIM = 1404; // legacy without iris
const IRIS_DIM = 1434; // with refineLandmarks iris points (+30)
const EXPECTED_DIM = 1434; // default to 1434 now

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0; const y = b[i] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  if (denom === 0) return 0;
  return dot / denom;
}

export async function POST(req: Request) {
  try {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    let accessToken: string | undefined;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      accessToken = authHeader.slice(7).trim();
    }
    const supabase = createServerSupabaseClient(accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    if (!(req.headers.get('content-type') ?? '').includes('application/json')) {
      return NextResponse.json({ success: false, error: 'Expected application/json { vector:number[] }' }, { status: 400 });
    }
    const body = await req.json().catch(()=>null) as { vector?: number[] } | null;
    if (!body?.vector || !Array.isArray(body.vector) || body.vector.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid vector' }, { status: 400 });
    }

    const { data: existing, error } = await supabase.from('face_vectors').select('embedding').eq('id', user.id).maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!existing?.embedding) {
      return NextResponse.json({ success: false, error: 'No enrollment', enrolled: false }, { status: 400 });
    }

    const parseEmbedding = (raw: any): { vec: number[]; rawType: string; rawCharLength?: number } => {
      if (Array.isArray(raw)) {
        // Already an array – ensure numbers
        const nums = raw.map(x => typeof x === 'number' ? x : Number(x)).filter(x => Number.isFinite(x));
        return { vec: nums, rawType: 'array' };
      }
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        // Remove enclosing brackets / parens / braces if present
        const inner = trimmed.replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
        const parts = inner.split(/[\s,]+/).filter(Boolean);
        const nums = parts.map(Number).filter(x => Number.isFinite(x));
        return { vec: nums, rawType: 'string', rawCharLength: raw.length };
      }
      return { vec: [], rawType: typeof raw };
    };

    const parsedStored = parseEmbedding(existing.embedding);
    const incomingRaw: number[] = body.vector;

    // Dimension adaptation & upgrade logic
    let storedVec = parsedStored.vec.slice();
    let incomingVec = incomingRaw.slice();
    let upgraded = false;

    const padTo = (vec: number[], dim: number) => {
      while (vec.length < dim) vec.push(0);
      return vec;
    };

    // Upgrade legacy stored 1404 -> 1434 if expecting IRIS_DIM
    if (EXPECTED_DIM === IRIS_DIM && storedVec.length === BASE_DIM) {
      storedVec = padTo(storedVec, IRIS_DIM);
      upgraded = true;
    }
    // Accept incoming legacy 1404 by padding
    if (EXPECTED_DIM === IRIS_DIM && incomingVec.length === BASE_DIM) {
      incomingVec = padTo(incomingVec, IRIS_DIM);
    }
    
    if (storedVec.length !== EXPECTED_DIM || incomingVec.length !== EXPECTED_DIM) {
      return NextResponse.json({
        success: false,
        error: 'Embedding dimension mismatch',
        storedLength: storedVec.length,
        incomingLength: incomingVec.length,
        expectedDim: EXPECTED_DIM,
        debug: process.env.NODE_ENV !== 'production' ? {
          rawType: parsedStored.rawType,
          rawCharLength: parsedStored.rawCharLength,
          note: 'Unexpected dimension after adaptation'
        } : undefined
      }, { status: 400 });
    }

    // Persist upgrade if we expanded or trimmed the stored vector
    if (upgraded) {
      const { error: upErr } = await supabase.from('face_vectors').update({ embedding: storedVec }).eq('id', user.id);
      // Non-fatal if it fails; we continue.
    }

    const renorm = (v: number[]) => {
      let n = 0; for (const x of v) n += (x ?? 0) * (x ?? 0); n = Math.sqrt(n) || 1;
      if (!isFinite(n) || n === 0) return { vec: v.map(()=>0), norm: 0 };
      return { vec: v.map(x => (x ?? 0) / n), norm: 1 };
    };
  const { vec: stored, norm: storedNormFlag } = renorm(storedVec);
  const { vec: incoming, norm: incomingNormFlag } = renorm(incomingVec);
    let similarity = cosine(stored, incoming);
    if (!isFinite(similarity)) similarity = 0;
    const threshold = 0.7;
    const match = similarity >= threshold;
    return NextResponse.json({
      success: true,
      match,
      similarity,
      threshold,
      debug: process.env.NODE_ENV !== 'production' ? {
        storedNorm: storedNormFlag,
        incomingNorm: incomingNormFlag,
        length: stored.length,
        rawType: parsedStored.rawType,
        rawCharLength: parsedStored.rawCharLength,
        expectedDim: EXPECTED_DIM,
        upgraded
      } : undefined
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
