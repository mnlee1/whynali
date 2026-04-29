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
import NextTopLoader from 'nextjs-toploader'

export const metadata: Metadata = {
    title: '왜난리 - 요즘 난리, 한눈에',
    description: '지금 한국에서 가장 뜨거운 이슈를 한눈에 확인하세요. 연예, 정치, 사회, 스포츠 실시간 화제와 논란을 빠르게 파악할 수 있는 이슈 뉴스 내비게이션 서비스.',
    keywords: ['왜난리', '왜 난리', '이슈', '논란', '실시간 이슈', '화제', '뉴스', '연예이슈', '정치이슈', '사회이슈'],
    openGraph: {
        title: '왜난리 - 요즘 난리, 한눈에',
        description: '지금 한국에서 가장 뜨거운 이슈를 한눈에 확인하세요.',
        url: 'https://whynali.com',
        siteName: '왜난리',
        locale: 'ko_KR',
        type: 'website',
    },
    verification: {
        google: ['J9cnf6UOrn5T_W38YOde3BnpgoLRpxbzMPjuM23QazE', 'oLeSnP_W1iS3crjqf9RtO1koomeIm860DTAP-WSclWg'],
        other: {
            'naver-site-verification': '7308faf20b068eccbe33fbe3794875d9db9f676d',
        },
    },
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="ko">
            <body className="min-h-screen bg-surface-muted text-content-primary antialiased font-pretendard">
                <NextTopLoader color="#a202e3" showSpinner={false} />
                <Header />
                <main className="min-h-screen flex flex-col pb-8 md:pb-14 xl:pb-24">
                    {children}
                </main>
                <Footer />
            </body>
        </html>
    )
}
