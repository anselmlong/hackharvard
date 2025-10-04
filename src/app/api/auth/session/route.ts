import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '~/lib/supabaseServer';

export async function GET(_request: Request) { // unused param prefixed with _ to satisfy lint
  try {
    // Extract bearer token from cookies (supabase sets sb-<ref>-auth-token) — we only get access token via client
    // For simplicity, rely on client forwarding no token, just attempt anonymous user fetch (will fail gracefully)
    const supabase = createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    
    return NextResponse.json({ authenticated: true, user: { id: data.user.id, email: data.user.email } });
  } catch (e) {
    return NextResponse.json({ authenticated: false, error: (e as Error).message }, { status: 200 });
  }
}
