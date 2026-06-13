// Tailwind CSS v4 ships its own PostCSS plugin; that's the only processing the
// app's single stylesheet needs. Rsbuild auto-detects this file.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
