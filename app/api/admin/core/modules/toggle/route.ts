import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function getAccessTokenFromCookies(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));
  const authCookieKey = Object.keys(cookies).find((k) => k.includes("auth-token") && k.startsWith("sb-"));
  if (!authCookieKey) return null;

  const raw = cookies[authCookieKey];
  if (!raw) return null;

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const tryJson = (s: string): any | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

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
    const empresaId = getEmpresaId(req);
    if (!empresaId) return NextResponse.json({ error: "MISSING_EMPRESA_ID" }, { status: 400 });

    const accessToken = getAccessToken(req);
    if (!accessToken) return NextResponse.json({ error: "MISSING_SESSION" }, { status: 401 });

    const adminCheck = await assertAdmin(accessToken, empresaId);
    if (!adminCheck.ok) return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });

    const body = await req.json().catch(() => null);
    const moduleKey = String(body?.module_key ?? body?.modulo ?? "").trim().toLowerCase();
    const enabled = Boolean(body?.enabled ?? body?.ativo);

    if (!VALID_MODULES.has(moduleKey)) {
      return NextResponse.json({ error: "INVALID_MODULE_KEY" }, { status: 400 });
    }
    if (moduleKey === "core" && enabled === false) {
      return NextResponse.json({ error: "CORE_CANNOT_BE_DISABLED" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    // Seed idempotente
    const { error: seedErr } = await admin.rpc("moduz_core_seed_modules", { p_empresa_id: empresaId });
    if (seedErr) return NextResponse.json({ error: "SEED_FAILED", details: seedErr.message }, { status: 500 });

    // enabled_at é NOT NULL no teu schema:
    // - ao ligar: enabled_at = now()
    // - ao desligar: mantém enabled_at (histórico)
    const patch: Record<string, any> = {
      empresa_id: empresaId,
      module_key: moduleKey,
      enabled,
    };
    if (enabled) patch.enabled_at = new Date().toISOString();

    const { data, error } = await admin
      .from("modules_enabled")
      .upsert(patch, { onConflict: "empresa_id,module_key" })
      .select("module_key, enabled, enabled_at, updated_at")
      .single();

    if (error) return NextResponse.json({ error: "DB_ERROR", details: error.message }, { status: 500 });

    // Auditoria (se a tabela existir; se não existir, não bloqueia)
    const { error: auditErr } = await admin.from("audit_log").insert({
      empresa_id: empresaId,
      actor_user_id: adminCheck.userId,
      actor_profile_id: adminCheck.profileId,
      action: "MODULE_TOGGLED",
      entity: "modules_enabled",
      payload: { module_key: moduleKey, enabled },
    });

    return NextResponse.json({
      ok: true,
      module: data,
      audit: auditErr ? "FAILED" : "OK",
      audit_details: auditErr?.message ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "UNEXPECTED", details: e?.message ?? String(e) }, { status: 500 });
  }
}
