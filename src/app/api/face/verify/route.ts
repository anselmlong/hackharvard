import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0; const y = b[i] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
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
    const stored: number[] = existing.embedding as number[];

    // Both vectors should already be (roughly) normalized; compute cosine similarity
    const similarity = cosine(stored, body.vector);
    const threshold = 0.85; // Placeholder threshold; tune later
    const match = similarity >= threshold;

    return NextResponse.json({ success: true, match, similarity, threshold });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
