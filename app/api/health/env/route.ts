import { NextResponse } from "next/server";

export async function GET() {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasAnon = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return NextResponse.json(
    {
      ok: true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: hasUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: hasAnon,
        SUPABASE_SERVICE_ROLE_KEY: hasService,
      },
    },
    { status: 200 }
  );
}
