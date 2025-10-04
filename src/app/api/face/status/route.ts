import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '../../../../lib/supabaseServer';

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ enrolled: false, authenticated: false });

    const { data, error } = await supabase.from('face_vectors').select('user_id').eq('user_id', user.id).maybeSingle();
    if (error) return NextResponse.json({ enrolled: false, authenticated: true, error: error.message }, { status: 500 });

    return NextResponse.json({ enrolled: !!data, authenticated: true });
  } catch (e) {
    return NextResponse.json({ enrolled: false, error: (e as Error).message }, { status: 500 });
  }
}