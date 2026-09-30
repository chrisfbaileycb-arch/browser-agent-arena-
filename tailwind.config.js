export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F8F6F0",
        sand: "#F4F0E6",
        ink: "#121316",
        obsidian: "#121316",
        scout: {
          DEFAULT: "#E08A28",
          tint: "#FEF7EE",
          dark: "#B45309",
        },
        extractor: {
          DEFAULT: "#7C3AED",
          tint: "#F5F3FF",
          dark: "#6D28D9",
        },
        gatekeeper: {
          DEFAULT: "#059669",
          tint: "#ECFDF5",
          dark: "#047857",
        },
        settlement: {
          DEFAULT: "#E11D48",
          tint: "#FFF1F2",
          dark: "#BE123C",
        },
        solo: {
          DEFAULT: "#EA580C",
          dark: "#C2410C",
          tint: "#FFF7ED",
        }
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["'Plus Jakarta Sans'", "'Inter'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        luxury: "0 10px 30px -10px rgba(0,0,0,0.08)",
        tactile: "0 4px 0 rgba(0,0,0,0.08), 0 12px 24px -6px rgba(0,0,0,0.06)",
        card: "0 8px 30px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(255,255,255,0.7)",
      }
    }
  },
  plugins: []
};

