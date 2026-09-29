/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f5f6f7", 100: "#e4e7e9", 200: "#cdd3d6", 300: "#a4adb2",
          400: "#758187", 500: "#5d6970", 600: "#48545a", 700: "#354147",
          800: "#232e34", 900: "#182228", DEFAULT: "#354147",
        },
        moss: {
          50: "#eff7f3", 100: "#dceee5", 200: "#b8d9c9", 300: "#8cbea7",
          400: "#609f84", 500: "#398367", 600: "#23684f", 700: "#1d5542",
          800: "#184536", 900: "#12372c", DEFAULT: "#23684f",
        },
      },
      borderRadius: { lg: "6px", xl: "8px", "2xl": "8px" },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out",
      },
    },
  },
  plugins: [],
};
