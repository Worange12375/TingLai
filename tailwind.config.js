/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        leaf: {
          50: '#f1f8f1', 100: '#dcefd9', 200: '#bce0b6', 300: '#92cb8a',
          400: '#66b35f', 500: '#469a42', 600: '#368132', 700: '#2c6729',
          800: '#255223', 900: '#20451f',
        },
        cream: '#fdfaf3',
      },
      borderRadius: { xl2: '1.25rem' },
      fontFamily: {
        rounded: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
