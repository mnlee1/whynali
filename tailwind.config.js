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
                    DEFAULT: '#7b3aed',
                    dark:    '#5b21b6',
                    light:   '#ede9fe',
                    muted:   '#c4b5fd',
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
            borderRadius: {
                btn: '9999px',
            },
            boxShadow: {
                card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
                'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.08)',
            },
            keyframes: {
                'rolling-in': {
                    '0%':   { opacity: '0', transform: 'translateY(6px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
            animation: {
                'rolling-in': 'rolling-in 0.25s ease forwards',
            },
        },
    },
    plugins: [],
}
