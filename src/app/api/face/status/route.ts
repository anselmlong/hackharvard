import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

export async function GET(req: Request) {
  try {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    let accessToken: string | undefined;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      accessToken = authHeader.slice(7).trim();
    }
    const supabase = createServerSupabaseClient(accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ enrolled: false, authenticated: false });

    const { data, error } = await supabase.from('face_vectors').select('id').eq('id', user.id).maybeSingle();
    if (error) return NextResponse.json({ enrolled: false, authenticated: true, error: error.message }, { status: 500 });

    return NextResponse.json({ enrolled: !!data, authenticated: true });
  } catch (e) {
    return NextResponse.json({ enrolled: false, error: (e as Error).message }, { status: 500 });
  }
}