import { NextResponse } from "next/server";
import { cookies as nextCookies } from "next/headers";
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

function isJwtLike(s: string): boolean {
  const t = (s ?? "").trim();
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

function readChunkedCookie(all: Record<string, string>, base: string): string | null {
  const keys = Object.keys(all).filter((k) => k === base || k.startsWith(base + "."));
  if (keys.length === 0) return null;

  keys.sort((a, b) => {
    const ai = a.includes(".") ? Number(a.split(".").pop()) : -1;
    const bi = b.includes(".") ? Number(b.split(".").pop()) : -1;
    return ai - bi;
  });

  return keys.map((k) => all[k] ?? "").join("");
}

function extractAccessToken(raw: string): string | null {
  const decoded = decodeMaybe(raw);

  // JWT puro (muito comum)
  if (isJwtLike(decoded)) return decoded;

  // JSON (urlencoded) com access_token
  try {
    const j = JSON.parse(decoded);
    const tok = j?.access_token ?? j?.currentSession?.access_token;
    if (typeof tok === "string" && tok.length > 20) return tok;
  } catch {
    // ignore
  }

  // base64 JSON (alguns setups)
  try {
    const val = decoded.startsWith("base64-") ? decoded.slice("base64-".length) : decoded;
    const txt = Buffer.from(val, "base64").toString("utf8");
    const j = JSON.parse(txt);
    const tok = j?.access_token ?? j?.currentSession?.access_token;
    if (typeof tok === "string" && tok.length > 20) return tok;
  } catch {
    // ignore
  }

  return null;
}

function getAccessTokenFromCookies(): { token: string | null; cookieNames: string[] } {
  const store = nextCookies();
  const allList = store.getAll();
  const all: Record<string, string> = {};
  for (const c of allList) all[c.name] = c.value;

  const cookieNames = allList.map((c) => c.name);

  // 1) cookies diretas
  for (const k of ["sb-access-token", "sb:token"]) {
    if (all[k]) {
      const tok = extractAccessToken(all[k]);
      if (tok) return { token: tok, cookieNames };
    }
  }

  // 2) cookies sb-*-auth-token / sb-*-access-token (chunked ou não)
  const bases = new Set<string>();
  for (const name of Object.keys(all)) {
    if (!name.startsWith("sb-")) continue;
    if (!(name.includes("auth-token") || name.includes("access-token"))) continue;
    bases.add(name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name);
  }

  for (const base of bases) {
    const combined = readChunkedCookie(all, base);
    if (!combined) continue;
    const tok = extractAccessToken(combined);
    if (tok) return { token: tok, cookieNames };
  }

  return { token: null, cookieNames };
}

async function assertAdmin(accessToken: string, empresaId: string) {
  const anon = supabaseAnonWithToken(accessToken);
  const { data: userRes, error: userErr } = await anon.auth.getUser();
  if (userErr || !userRes?.user) return { ok: false as const, status: 401, error: "UNAUTHENTICATED" as const };

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

    const bearer = getBearer(req);
    const { token: cookieToken, cookieNames } = getAccessTokenFromCookies();
    const accessToken = bearer ?? cookieToken;

    if (!accessToken) {
      // debug seguro: só nomes de cookies, sem valores
      return NextResponse.json({ error: "MISSING_SESSION", cookie_names: cookieNames }, { status: 401 });
    }

    const adminCheck = await assertAdmin(accessToken, empresaId);
    if (!adminCheck.ok) return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });

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
