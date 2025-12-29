import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Json = Record<string, unknown>;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function supabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getEmpresaId(req: Request): string | null {
  return req.headers.get("x-empresa-id") || req.headers.get("X-Empresa-Id");
}

async function assertAdmin(userId: string, empresaId: string) {
  const admin = supabaseAdmin();
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, papel, ativo")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (profErr) return { ok: false as const, status: 500, error: "PROFILE_LOOKUP_FAILED" as const };
  if (!profile || profile.ativo === false) return { ok: false as const, status: 403, error: "NO_PROFILE" as const };
  if (profile.papel !== "admin") return { ok: false as const, status: 403, error: "NOT_ADMIN" as const };

  return { ok: true as const, profileId: profile.id };
}

export async function GET(req: Request) {
  try {
    const empresaId = getEmpresaId(req);
    if (!empresaId) return NextResponse.json({ error: "MISSING_EMPRESA_ID" }, { status: 400 });

    // ✅ Auth via SSR cookies (Supabase oficial)
    const supabase = createSupabaseServerClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();

    const user = userRes?.user;
    if (userErr || !user) return NextResponse.json({ error: "MISSING_SESSION" }, { status: 401 });

    const adminCheck = await assertAdmin(user.id, empresaId);
    if (!adminCheck.ok) return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });

    const admin = supabaseAdmin();

    // Seed idempotente
    const { error: seedErr } = await admin.rpc("moduz_core_seed_modules", { p_empresa_id: empresaId });
    if (seedErr) return NextResponse.json({ error: "SEED_FAILED", details: seedErr.message }, { status: 500 });

    const { data, error } = await admin
      .from("modules_enabled")
      .select("module_key, enabled, enabled_at, updated_at")
      .eq("empresa_id", empresaId)
      .order("module_key", { ascending: true });

    if (error) return NextResponse.json({ error: "DB_ERROR", details: error.message }, { status: 500 });

    return NextResponse.json({ empresa_id: empresaId, modules: data ?? [] } as Json, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 });
  }
}
