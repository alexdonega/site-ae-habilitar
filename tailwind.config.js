/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                habilitar: {
                    orange: '#ee7d20',
                    'orange-dark': '#d46a10',
                    'orange-light': '#f59342',
                    gray: '#57565a',
                    'gray-dark': '#39383d',
                }
            }
        },
    },
    plugins: [],
}
