/** @type {import('tailwindcss').Config} */
// Tasarım dili: derin yeşil yüzey, pastel kırmızı yalnızca dikkat gerektiren yerde, sıcak kırık beyaz zemin.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        baslik: ["Poppins", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        yesil: { DEFAULT: "#0B3B2C", acik: "#124A38", cizgi: "#2E6150", soluk: "#B5CFC4", yazi: "#D3E4DC" },
        mercan: { DEFAULT: "#F08891", zemin: "#F9C9CD", acik: "#FDE3E5", koyu: "#8E0D19", yazi: "#B3101F" },
        nane: { DEFAULT: "#DDF2E8", koyu: "#0B5A3E" },
        mavi: { DEFAULT: "#E8ECFF", koyu: "#2E3BA8" },
        zemin: "#F7F3EF",
        ray: "#ECE5DF",
        cizgi: "#EFE8E2",
        murekkep: "#22110F",
        soluk: "#6B5C57",
        silik: "#8F807A",
      },
      borderRadius: { kart: "20px", buyuk: "28px" },
    },
  },
  plugins: [],
};
