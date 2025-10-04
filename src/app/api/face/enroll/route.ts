import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

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
      return NextResponse.json({ success: false, error: 'Expected application/json with { vector:number[] }' }, { status: 400 });
    }
  const body = await req.json().catch(() => null) as unknown as { vector?: number[] } | null;
    if (!body?.vector || !Array.isArray(body.vector) || body.vector.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid or empty vector' }, { status: 400 });
    }
    // Basic sanity clamp & type normalization
    const vector = body.vector.map(v => typeof v === 'number' && isFinite(v) ? v : 0);
    // Optional: re-normalize (L2)
    const norm = Math.sqrt(vector.reduce((a, b) => a + b * b, 0)) || 1;
    for (let i = 0; i < vector.length; i++) vector[i] = (vector[i] ?? 0) / norm;

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
