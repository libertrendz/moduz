/**
 * =============================================
 * Moduz+ | API Admin
 * Arquivo: app/api/admin/core/modules/list/route.ts
 * Módulo: Core (Gestão de Módulos)
 * Etapa: Listar módulos habilitados (v1.1)
 * Descrição:
 *  - Autentica via Supabase SSR (cookies)
 *  - Verifica perfil admin em public.profiles por empresa_id + user_id
 *  - Garante seed idempotente e retorna modules_enabled
 *
 * Patch v1.1 (cirúrgico):
 *  - Se x-empresa-id não vier (ex.: request com //api/...), resolve fallback:
 *      - escolhe a 1ª empresa ativa onde o user tem profile admin
 *  - Evita 400 MISSING_EMPRESA_ID em casos de chamada “sem header”
 * =============================================
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

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
    .select("id, role, ativo")
    .eq("user_id", userId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (profErr) {
    return { ok: false as const, status: 500, error: "PROFILE_LOOKUP_FAILED" as const, details: profErr.message };
  }

  if (!profile || profile.ativo === false) {
    return { ok: false as const, status: 403, error: "NO_PROFILE" as const };
  }

  if (profile.role !== "admin") {
    return { ok: false as const, status: 403, error: "NOT_ADMIN" as const };
  }

  return { ok: true as const, profileId: profile.id };
}

/**
 * Fallback seguro para quando x-empresa-id não vem:
 * - procura a 1ª empresa (por created_at) onde o user tem profile admin ativo.
 */
async function resolveEmpresaIdFallback(userId: string): Promise<{ empresaId: string; profileId: string } | null> {
  const admin = supabaseAdmin();

  const { data: p, error } = await admin
    .from("profiles")
    .select("id, empresa_id, role, ativo, created_at")
    .eq("user_id", userId)
    .eq("role", "admin")
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  if (!p?.empresa_id || !p?.id) return null;

  return { empresaId: String(p.empresa_id), profileId: String(p.id) };
}

export async function GET(req: Request) {
  try {
    // 1) autenticar primeiro (para poder fallback por user)
    const supabase = createSupabaseServerClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;

    if (userErr || !user) return NextResponse.json({ error: "MISSING_SESSION" }, { status: 401 });

    // 2) empresa: header -> fallback
    let empresaId = getEmpresaId(req);

    // Se não veio header, tentamos fallback seguro (evita 400 fantasma)
    let profileIdFromFallback: string | null = null;
    if (!empresaId) {
      const fb = await resolveEmpresaIdFallback(user.id);
      if (!fb) return NextResponse.json({ error: "MISSING_EMPRESA_ID" }, { status: 400 });
      empresaId = fb.empresaId;
      profileIdFromFallback = fb.profileId;
    }

    // 3) confirmar admin (se veio do fallback, já é admin, mas mantemos check p/ robustez)
    const adminCheck =
      profileIdFromFallback
        ? ({ ok: true as const, profileId: profileIdFromFallback } as const)
        : await assertAdmin(user.id, empresaId);

    if (!adminCheck.ok) {
      return NextResponse.json(
        { error: adminCheck.error, details: (adminCheck as any).details ?? null },
        { status: adminCheck.status }
      );
    }

    const admin = supabaseAdmin();

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
