/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Azul marinho — cor institucional principal
        navy: {
          50: "#eef2f8",
          100: "#d5dded",
          300: "#8ea3c6",
          500: "#2e4c74",
          600: "#233c5e",
          700: "#1b2f4a",
          800: "#152439",
          900: "#0f1a2c",
          DEFAULT: "#1b2f4a",
        },
        // Verde musgo — cor de destaque / acento
        moss: {
          50: "#f1f3ea",
          100: "#dde2cb",
          300: "#b0bd8c",
          500: "#7d8f56",
          600: "#697a45",
          700: "#546237",
          800: "#414c2c",
          DEFAULT: "#697a45",
        },
      },
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
