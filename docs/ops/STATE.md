<!--
=============================================
Moduz+ | Ops State (Fonte de Verdade)
Arquivo: docs/ops/STATE.md
Etapa: MVP Técnico – Fase A (Rastreabilidade)
Descrição: Estado atual da infraestrutura (domínios, projetos, redirects, env var NAMES).
Regra: Nunca colocar segredos aqui (sem keys/tokens).
=============================================
-->

# Moduz+ — Ops State

## Domínios
- Site institucional: `https://www.moduz.eu`
- App: `https://app.moduz.eu` (a criar/configurar)

## Vercel
- Projeto Site: (por definir)
- Projeto App: `https://vercel.com/libertrendz/moduz` (confirmar se é APP ou SITE)

## Supabase
- Project Ref: `clmkgbftjosydoqvzgfk`

## Auth (Supabase)
- Site URL (desejado): `https://app.moduz.eu`
- Redirect URLs (desejado):
  - `https://app.moduz.eu/auth/confirm`
  - `https://app.moduz.eu/auth/reset`

## Env Vars (NOMES apenas)
### App (Next.js / Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
