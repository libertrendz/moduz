/**
 * =============================================
 * Moduz+ | App Layout
 * Arquivo: app/layout.tsx
 * Etapa: Bootstrap App (v3)
 * Descrição:
 *  - Importa estilos globais (Tailwind)
 *  - Define metadata base (SEO + social)
 *  - Define ícones (favicon/manifest/apple touch)
 * =============================================
 */

import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Moduz+",
    template: "%s | Moduz+",
  },
  description: "ERP modular premium para PMEs.",
  applicationName: "Moduz+",
  metadataBase: new URL("https://app.moduz.eu"),
  icons: {
    // Favicon (browser) simplificado: cyan + fundo escuro
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    // iOS: ícone full (cyan + amarelo + fundo escuro)
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    url: "https://app.moduz.eu",
    title: "Moduz+",
    description: "ERP modular premium para PMEs.",
    siteName: "Moduz+",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Moduz+" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Moduz+",
    description: "ERP modular premium para PMEs.",
    images: ["/og.png"],
  },
}

export const viewport: Viewport = {
  themeColor: "#111214",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-PT">
      <head>
        {/* Fallback explícito (além de metadata/icons) */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link
          rel="icon"
          type="image/png"
          href="/icons/favicon-32x32.png"
          sizes="32x32"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#111214" />
      </head>
      <body>{children}</body>
    </html>
  )
}
