/**
 * =============================================
 * Moduz+ | Next.js Config
 * Arquivo: next.config.js
 * Etapa: PWA (Service Worker)
 * Descrição:
 *  - Gera service worker em produção (public/)
 *  - Necessário para experiência PWA sólida (Android)
 * =============================================
 */

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development"
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
}

module.exports = withPWA(nextConfig)