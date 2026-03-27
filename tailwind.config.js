/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
        './lib/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                pretendard: ['Pretendard Variable', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
            },
            colors: {
                primary: {
                    DEFAULT: '#a202e3',
                    dark:    '#7700b9',
                    light:   '#f3e6ff',
                    muted:   '#e8c6ff',
                },
                surface: {
                    DEFAULT: '#ffffff',
                    muted:   '#fafafa',
                    subtle:  '#f4f4f5',
                },
                border: {
                    DEFAULT: '#e4e4e7',
                    muted:   '#f1f1f3',
                    strong:  '#d4d4d8',
                },
                content: {
                    primary:   '#18181b',
                    secondary: '#71717a',
                    muted:     '#a1a1aa',
                    disabled:  '#d4d4d8',
                },
            },
            backgroundImage: {
                'gradient-primary': 'linear-gradient(to right, #a202e3, #7700b9)',
            },
            borderRadius: {
                btn: '9999px',
            },
            boxShadow: {
                card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
                'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.08)',
            },
        },
    },
    plugins: [],
}
