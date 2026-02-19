import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/layout/Header'

export const metadata: Metadata = {
    title: '왜난리 - 한국 이슈 내비게이션',
    description: '한국 이슈를 한눈에 파악하고 여론을 확인하세요',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="ko">
            <body>
                <Header />
                <main className="min-h-screen">
                    {children}
                </main>
            </body>
        </html>
    )
}
