"use client";

import * as React from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

export default function AuthLoginPage() {
  const supabase = React.useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    // força refresh para middleware/SSR sincronizar cookies
    window.location.href = "/adm";
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={onSubmit} style={{ width: 420, maxWidth: "100%", display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Entrar</h1>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="email"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            autoComplete="current-password"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #000",
            background: "#000",
            color: "#fff",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "A entrar..." : "Entrar"}
        </button>

        {msg ? <p style={{ color: "crimson", marginTop: 8 }}>{msg}</p> : null}

        <p style={{ opacity: 0.7, fontSize: 13 }}>
          Nota: este login usa Supabase SSR (cookies). Depois de entrar, testa /api/admin/**
        </p>
      </form>
    </div>
  );
}
