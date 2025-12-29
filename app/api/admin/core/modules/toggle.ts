import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getBearer(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getEmpresaId(req: Request): string | null {
  return req.headers.get("x-empresa-id") || req.headers.get("X-Empresa-Id");
}

function supabaseAnonWithToken(token: string) {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function supabaseAdmin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function assertAdmin(token: string, empresaId: string) {
  const anon = supabaseAnonWithToken(token);
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) {
    return { ok: false as const, status: 401, error: "UNAUTHENTICATED" as const };
  }

  const admin = supabaseAdmin();
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, papel, ativo")
    .eq("user_id", userRes.user.id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (profErr) return { ok: false as const, status: 500, error: "PROFILE_LOOKUP_FAILED" as const };
  if (!profile || profile.ativo === false) return { ok: false as const, status: 403, error: "NO_PROFILE" as const };
  if (profile.papel !== "admin") return { ok: false as const, status: 403, error: "NOT_ADMIN" as const };

  return { ok: true as const, userId: userRes.user.id, profileId: profile.id };
}

const VALID_MODULES = new Set([
  "core",
  "docs",
  "people",
  "track",
  "finance",
  "bizz",
  "stock",
  "assets",
  "flow",
]);

export async function POST(req: Request) {
  try {
    const token = getBearer(req);
    const empresaId = getEmpresaId(req);

    if (!token) return NextResponse.json({ error: "MISSING_BEARER" }, { status: 401 });
    if (!empresaId) return NextResponse.json({ error: "MISSING_EMPRESA_ID" }, { status: 400 });

    const adminCheck = await assertAdmin(token, empresaId);
    if (!adminCheck.ok) return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });

    const body = await req.json().catch(() => null);
    const moduloRaw = String(body?.modulo ?? "").trim().toLowerCase();
    const ativo = Boolean(body?.ativo);

    if (!VALID_MODULES.has(moduloRaw)) {
      return NextResponse.json({ error: "INVALID_MODULO" }, { status: 400 });
    }
    if (moduloRaw === "core" && ativo === false) {
      return NextResponse.json({ error: "CORE_CANNOT_BE_DISABLED" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Garante seed antes (idempotente)
    const { error: seedErr } = await admin.rpc("moduz_core_seed_modules", { p_empresa_id: empresaId });
    if (seedErr) return NextResponse.json({ error: "SEED_FAILED", details: seedErr.message }, { status: 500 });

    const { data, error } = await admin
      .from("modules_enabled")
      .upsert({ empresa_id: empresaId, modulo: moduloRaw, ativo }, { onConflict: "empresa_id,modulo" })
      .select("modulo, ativo, updated_at")
      .single();

    if (error) return NextResponse.json({ error: "DB_ERROR", details: error.message }, { status: 500 });

    // Auditoria (mínimo)
    const { error: auditErr } = await admin.from("audit_log").insert({
      empresa_id: empresaId,
      actor_user_id: adminCheck.userId,
      actor_profile_id: adminCheck.profileId,
      action: "MODULE_TOGGLED",
      entity: "modules_enabled",
      payload: { modulo: moduloRaw, ativo },
    });

    if (auditErr) {
      // Não quebramos a operação de toggle por falha de auditoria,
      // mas devolvemos aviso.
      return NextResponse.json({ ok: true, module: data, audit: "FAILED", audit_details: auditErr.message });
    }

    return NextResponse.json({ ok: true, module: data, audit: "OK" });
  } catch (e: any) {
    return NextResponse.json({ error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 });
  }
}
