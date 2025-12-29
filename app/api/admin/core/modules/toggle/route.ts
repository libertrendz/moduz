import { NextResponse } from "next/server";
import { cookies as nextCookies } from "next/headers";
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

function isJwtLike(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t.startsWith("eyJ")) return false;
  const parts = t.split(".");
  return parts.length === 3 && parts[0].length > 10;
}

function decodeMaybe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function tryJson(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function tryBase64Json(s: string): any | null {
  const val = s.startsWith("base64-") ? s.slice("base64-".length) : s;
  try {
    const text =
      typeof Buffer !== "undefined" ? Buffer.from(val, "base64").toString("utf8") : atob(val);
    return tryJson(text);
  } catch {
    return null;
  }
}

function extractAccessTokenFromCookieValue(rawVal: string): string | null {
  const decoded = decodeMaybe(rawVal);
  if (isJwtLike(decoded)) return decoded;

  const j1 = tryJson(decoded);
  const j2 = j1 ? null : tryBase64Json(decoded);

  const payload = j1 ?? j2;
  const token = payload?.access_token ?? payload?.currentSession?.access_token ?? null;

  if (typeof token === "string" && token.length > 20) return token;

  const m = decoded.match(/access_token["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (m?.[1] && isJwtLike(m[1])) return m[1];

  return null;
}

function getAllCookiesFromNext(): Record<string, string> {
  const store = nextCookies();
  const out: Record<string, string> = {};
  for (const c of store.getAll()) out[c.name] = c.value;
  return out;
}

function readChunkedCookie(cookies: Record<string, string>, baseName: string): string | null {
  const keys = Object.keys(cookies).filter((k) => k === baseName || k.startsWith(baseName + "."));
  if (keys.length === 0) return null;

  keys.sort((a, b) => {
    const ai = a.includes(".") ? Number(a.split(".").pop()) : -1;
    const bi = b.includes(".") ? Number(b.split(".").pop()) : -1;
    return ai - bi;
  });

  return keys.map((k) => cookies[k] ?? "").join("");
}

function getAccessTokenFromCookies(): string | null {
  const cookies = getAllCookiesFromNext();

  const directKeys = ["sb-access-token", "sb:token"];
  for (const k of directKeys) {
    if (!cookies[k]) continue;
    const tok = extractAccessTokenFromCookieValue(cookies[k]);
    if (tok) return tok;
  }

  const bases = new Set<string>();
  for (const name of Object.keys(cookies)) {
    if (!name.startsWith("sb-")) continue;
    if (!(name.includes("auth-token") || name.includes("access-token"))) continue;
    bases.add(name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name);
  }

  for (const base of bases) {
    const combined = readChunkedCookie(cookies, base);
    if (!combined) continue;
    const tok = extractAccessTokenFromCookieValue(combined);
    if (tok) return tok;
  }

  for (const [name, val] of Object.entries(cookies)) {
    if (!name.startsWith("sb")) continue;
    const decoded = decodeMaybe(val);
    if (isJwtLike(decoded)) return decoded;
  }

  return null;
}

function getAccessToken(req: Request): string | null {
  return getBearer(req) ?? getAccessTokenFromCookies();
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
    if (!accessToken) {
      const names = Object.keys(getAllCookiesFromNext()).slice(0, 80);
      return NextResponse.json({ error: "MISSING_SESSION", cookie_names: names }, { status: 401 });
    }

    const adminCheck = await assertAdmin(accessToken, empresaId);
    if (!adminCheck.ok) return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });

    const body = await req.json().catch(() => null);
    const moduleKey = String(body?.module_key ?? body?.modulo ?? "").trim().toLowerCase();
    const enabled = Boolean(body?.enabled ?? body?.ativo);

    if (!VALID_MODULES.has(moduleKey)) return NextResponse.json({ error: "INVALID_MODULE_KEY" }, { status: 400 });
    if (moduleKey === "core" && enabled === false) {
      return NextResponse.json({ error: "CORE_CANNOT_BE_DISABLED" }, { status: 400 });
    }

    const admin = supabaseAdmin();

    const { error: seedErr } = await admin.rpc("moduz_core_seed_modules", { p_empresa_id: empresaId });
    if (seedErr) return NextResponse.json({ error: "SEED_FAILED", details: seedErr.message }, { status: 500 });

    const patch: Record<string, any> = {
      empresa_id: empresaId,
      module_key: moduleKey,
      enabled,
    };

    // enabled_at é NOT NULL: ao ligar atualiza, ao desligar mantém
    if (enabled) patch.enabled_at = new Date().toISOString();

    const { data, error } = await admin
      .from("modules_enabled")
      .upsert(patch, { onConflict: "empresa_id,module_key" })
      .select("module_key, enabled, enabled_at, updated_at")
      .single();

    if (error) return NextResponse.json({ error: "DB_ERROR", details: error.message }, { status: 500 });

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
