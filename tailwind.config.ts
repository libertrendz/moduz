/**
 * =============================================
 * Moduz+ | Tailwind
 * Arquivo: tailwind.config.ts
 * Etapa: Tailwind pipeline (v1)
 * =============================================
 */

import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
