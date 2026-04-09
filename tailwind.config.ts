import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#050508",
        surface: "#0a0a12",
        "surface-alt": "#0f0f1a",
        "surface-elevated": "#13131f",
        border: {
          DEFAULT: "#1a1a2e",
          glow: "#2a2a4a",
        },
        cyan: {
          DEFAULT: "#00f5ff",
          dim: "rgba(0, 245, 255, 0.25)",
          glow: "rgba(0, 245, 255, 0.08)",
        },
        magenta: {
          DEFAULT: "#ff0080",
          dim: "rgba(255, 0, 128, 0.25)",
          glow: "rgba(255, 0, 128, 0.08)",
        },
        green: {
          DEFAULT: "#00ff88",
          dim: "rgba(0, 255, 136, 0.25)",
          glow: "rgba(0, 255, 136, 0.08)",
        },
        purple: {
          DEFAULT: "#a855f7",
          dim: "rgba(168, 85, 247, 0.25)",
          glow: "rgba(168, 85, 247, 0.08)",
        },
        orange: {
          DEFAULT: "#ff8c00",
          dim: "rgba(255, 140, 0, 0.25)",
        },
        gold: {
          DEFAULT: "#ffd700",
          dim: "rgba(255, 215, 0, 0.25)",
        },
        muted: {
          DEFAULT: "#44445a",
          secondary: "#8888aa",
        },
        primary: "#00f5ff",
        background: "#050508",
        foreground: "#e8e8f0",
        card: {
          DEFAULT: "#0a0a12",
          foreground: "#e8e8f0",
        },
        bullish: "#00ff88",
        bearish: "#ff0080",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        sans: ["Space Grotesk", "sans-serif"],
        display: ["Orbitron", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      animation: {
        "pulse-live": "pulse-live 2s ease-in-out infinite",
        "pulse-cyan": "pulse-cyan 3s ease-in-out infinite",
        "pulse-green": "pulse-green 3s ease-in-out infinite",
        "pulse-magenta": "pulse-magenta 3s ease-in-out infinite",
        "shimmer": "shimmer-sweep 1.5s ease-in-out infinite",
        "fade-in": "fade-in 0.5s ease-out",
        "fade-in-up": "fade-in-up 0.4s ease-out",
        "slide-in-right": "slide-in-right 0.4s ease-out",
        "float": "float 6s ease-in-out infinite",
        "float-slow": "float-slow 8s ease-in-out infinite",
        "breathe": "breathe 4s ease-in-out infinite",
        "spin": "spin 1s linear infinite",
        "orb-drift": "orb-drift 20s ease-in-out infinite",
        "scan": "scan-line 8s linear infinite",
        "hex-pulse": "hex-pulse 8s ease-in-out infinite",
      },
      keyframes: {
        pulseLive: {
          "0%, 100%": { opacity: "1", boxShadow: "0 0 4px var(--green), 0 0 8px var(--green-dim)" },
          "50%": { opacity: "0.6", boxShadow: "0 0 8px var(--green), 0 0 16px var(--green-dim)" },
        },
        pulseCyan: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(0,245,255,0.25), 0 0 2px #00f5ff" },
          "50%": { boxShadow: "0 0 20px rgba(0,245,255,0.25), 0 0 6px #00f5ff" },
        },
        pulseGreen: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(0,255,136,0.25), 0 0 2px #00ff88" },
          "50%": { boxShadow: "0 0 20px rgba(0,255,136,0.25), 0 0 6px #00ff88" },
        },
        pulseMagenta: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(255,0,128,0.25), 0 0 2px #ff0080" },
          "50%": { boxShadow: "0 0 20px rgba(255,0,128,0.25), 0 0 6px #ff0080" },
        },
        shimmerSweep: {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(-16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px) rotate(0deg)" },
          "50%": { transform: "translateY(-8px) rotate(1deg)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)", opacity: "0.8" },
          "50%": { transform: "scale(1.02)", opacity: "1" },
        },
        orbDrift: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(30px, -20px) scale(1.1)" },
          "50%": { transform: "translate(-10px, 30px) scale(0.95)" },
          "75%": { transform: "translate(-25px, -15px) scale(1.05)" },
        },
        scanLine: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        hexPulse: {
          "0%, 100%": { opacity: "0.03" },
          "50%": { opacity: "0.06" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glow: "0 0 12px rgba(0, 245, 255, 0.25), 0 0 2px rgba(0, 245, 255, 0.5)",
        "glow-green": "0 0 12px rgba(0, 255, 136, 0.25), 0 0 2px rgba(0, 255, 136, 0.5)",
        "glow-magenta": "0 0 12px rgba(255, 0, 128, 0.25), 0 0 2px rgba(255, 0, 128, 0.5)",
        "glow-purple": "0 0 12px rgba(168, 85, 247, 0.25), 0 0 2px rgba(168, 85, 247, 0.5)",
        panel: "0 4px 24px rgba(0, 0, 0, 0.4), 0 0 1px rgba(0, 245, 255, 0.1)",
        "panel-hover": "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 245, 255, 0.15), 0 0 1px rgba(0, 245, 255, 0.3)",
      },
    },
  },
  plugins: [],
}
export default config
