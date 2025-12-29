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
  // JWT geralmente começa com eyJ... e tem 2 pontos (3 partes)
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

  // 0) Se já for JWT puro, usa direto
  if (isJwtLike(decoded)) return decoded;

  // 1) JSON direto
  const j1 = tryJson(decoded);

  // 2) base64 JSON
  const j2 = j1 ? null : tryBase64Json(decoded);

  const payload = j1 ?? j2;
  const token = payload?.access_token ?? payload?.currentSession?.access_token ?? null;

  if (typeof token === "string" && token.length > 20) return token;

  // 3) fallback: alguns setups guardam algo tipo "access_token=<jwt>"
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

function readChunkedCookie(cookies: Record<string, st
