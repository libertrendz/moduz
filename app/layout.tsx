/**
 * =============================================
 * Moduz+ | App Layout
 * Arquivo: app/layout.tsx
 * Etapa: Bootstrap App
 * =============================================
 */
import "./globals.css"
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  )
}
