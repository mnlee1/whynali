/**
 * app/layout.tsx
 *
 * [루트 레이아웃]
 *
 * 상단 헤더, 메인, 하단 푸터. 공통 레이아웃(97_1단계_기초픽스 §5.2 기준).
 */

import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'

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
            <body className="min-h-screen bg-white text-neutral-900 antialiased font-pretendard">
                <Header />
                <main className="min-h-screen flex flex-col">
                    {children}
                </main>
                <Footer />
            </body>
        </html>
    )
}
