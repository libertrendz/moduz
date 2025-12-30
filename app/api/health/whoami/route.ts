import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function GET() {
  const cookieStore = cookies();
  const cookieNames = cookieStore.getAll().map((c) => c.name);

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  return NextResponse.json(
    {
      ok: true,
      cookie_names: cookieNames,
      authed: Boolean(data?.user && !error),
      user_id: data?.user?.id ?? null,
      auth_error: error?.message ?? null,
    },
    { status: 200 }
  );
}
