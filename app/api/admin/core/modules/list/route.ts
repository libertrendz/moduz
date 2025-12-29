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

function readChunkedCookie(cookies: Record<string, string>, baseName: string): string | null {
  // Ex.: baseName="sb-xxx-auth-token"
  // procura sb-xxx-auth-token.0, .1, .2...
  const parts = Object.keys(cookies)
    .filter((k) => k === baseName || k.startsWith(baseName + "."))
    .sort((a, b) => {
      const ai = a.includes(".") ? Number(a.split(".").pop()) : -1;
      const bi = b.includes(".") ? Number(b.split(".").pop()) : -1;
      return ai - bi;
    });

  if (parts.length === 0) return null;
  return parts.map((k) => cookies[k] ?? "").join("");
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
      typeof Buffer !== "undefined"
        ? Buffer.from(val, "base64").toString("utf8")
        : atob(val);
    return tryJson(text);
  } catch {
    return null;
  }
}

function extractAccessTokenFromCookieValue(rawVal: string): string | null {
  const decoded = decodeMaybe(rawVal);

  // 1) JSON direto
  const j1 = tryJson(decoded);

  // 2) base64 JSON
  const j2 = j1 ? null : tryBase64Json(decoded);

  const payload = j1 ?? j2;
  const token = payload?.access_token ?? payload?.currentSession?.access_token ?? null;

  return typeof token === "string" && token.length > 20 ? token : null;
}

function getAccessTokenFromCookies(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.get("cookie"));

  // Supabase costuma usar sb-<projectRef>-auth-token[.N]
  // e em alguns setups sb-<projectRef>-access-token[.N]
  const candidates = Object.keys(cookies)
    .filter((k) => k.startsWith("sb-") && (k.includes("auth-token") || k.includes("access-token")))
    .map((k) => (k.includes(".") ? k.slice(0, k.lastIndexOf(".")) : k));

  // baseNames únicos
  const baseNames = Array.from(new Set(candidates));

  for (const base of baseNames) {
    const combined = readChunkedCookie(cookies, base);
    if (!combined) continue;

    const token = extractAccessTokenFromCookieValue(combined);
    if (token) return token;
  }

  return null;
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
    if (!accessToken) return NextResponse.json({ error: "MISSING_SESSION" }_
