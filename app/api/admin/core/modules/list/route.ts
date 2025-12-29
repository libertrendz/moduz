import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Json = Record<string, unknown>;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
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

function getEmpresaId(req: Request): string | null {
  return req.headers.get("x-empresa-id") || req.headers.get("X-Empresa-Id");
}

function getBearer(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  cookieHeader.split(";").forEach((part) => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = rest.join("=") ?? "";
  });
  return out;
}

/**
 * Tenta extrair access_token de cookies Supabase (auth-helpers/SSR).
 * Normalmente a cookie é "sb-<project-ref>-auth-token" e contém JSON (urlencoded)
 * ou uma string base64/compactada dependendo do setup.
 */
function getAccessTokenFromCookies(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const authCookieKey = Object.keys(cookies).find((k) => k.includes("auth-token") && k.startsWith("sb-"));
  if (!authCookieKey) return null;

  const raw = cookies[authCookieKey];
  if (!raw) return null;

  // 1) URL decode
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  // 2) Alguns setups guardam JSON direto
  const tryJson = (s: string): any | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  // 3) Alguns setups guardam "base64-<...>"
  const tryBase64Json = (s: string): any | null => {
    const val = s.startsWith("base64-") ? s.slice("base64-".length) : s;
    try {
      const buff =
        typeof Buffer !== "undefined"
          ? Buffer.from(val, "base64").toString("utf8")
          : atob(val);
      return tryJson(buff);
    } catch {
      return null;
    }
  };

  const j1 = tryJson(decoded);
  const j2 = j1 ? null : tryBase64Json(decoded);

  const payload = j1 ?? j2;
  const token = payload?.access_token ?? payload?.currentSession?.access_token ?? null;

  return typeof token === "string" && token.length > 20 ? token : null;
}

function getAccessToken(req: Request): string | null {
  return getBearer(req) ?? getAccessTokenFromCookies(req);
}

async function assertAdmin(accessToken: string, empresaId: string) {
  const anon = supabaseAnonWithToken(accessToken);
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

export async function GET(req: Request) {
  try {
    const empresaId = getEmpresaId(req);
    if (!empresaId) return NextResponse.json({ error: "MISSING_EMPRESA_ID" }, { status: 400 });

    const accessToken = getAccessToken(req);
    if (!accessToken) return NextResponse.json({ error: "MISSING_SESSION" }, { status: 401 });

    const adminCheck = await assertAdmin(accessToken, empresaId);
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

    return NextResponse.json(
      {
        empresa_id: empresaId,
        modules: data ?? [],
      } as Json,
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 });
  }
}
