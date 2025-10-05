import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

// We now use FaceNet embeddings (512 dims) produced by external model server (/face/embed)
const FACENET_DIM = 512;
const MODEL_SERVER_URL = process.env.MODEL_SERVER_URL || 'http://localhost:8000';

export async function POST(req: Request) {
  try {
    // Extract bearer token from Authorization header
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    let accessToken: string | undefined;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      accessToken = authHeader.slice(7).trim();
    }
    const supabase = createServerSupabaseClient(accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ success: false, error: 'Expected application/json with { image: base64 }' }, { status: 400 });
    }
    const body = await req.json().catch(() => null) as { image?: string } | null;
    if (!body?.image) {
      return NextResponse.json({ success: false, error: 'Missing image' }, { status: 400 });
    }

    // Forward to model server for embedding
    let embedResp: Response;
    try {
      embedResp = await fetch(`${MODEL_SERVER_URL}/face/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: body.image })
      });
    } catch (err) {
      return NextResponse.json({ success: false, error: 'Model server unreachable', detail: (err as Error).message }, { status: 502 });
    }
    const embedJson = await embedResp.json().catch(()=>null) as { embedding?: number[]; error?: string; dimension?: number } | null;
    if (!embedResp.ok || !embedJson || embedJson.error) {
      return NextResponse.json({ success: false, error: embedJson?.error || 'Embedding failed (model server)' }, { status: 500 });
    }
    const vector = (embedJson.embedding || []).map(v => typeof v === 'number' && isFinite(v) ? v : 0);
    if (vector.length !== FACENET_DIM) {
      return NextResponse.json({ success: false, error: 'Unexpected embedding dimension', got: vector.length, expected: FACENET_DIM }, { status: 500 });
    }

    // Store vector in a table (placeholder): ensure a table `face_vectors (user_id uuid primary key, embedding jsonb)` exists.
    const { data: rows, error: upsertError } = await supabase
      .from('face_vectors')
      .upsert({ id: user.id, embedding: vector })
      .select('id');
    if (upsertError) {
      return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, userId: rows?.[0]?.id, dimensions: vector.length });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
  }
}
