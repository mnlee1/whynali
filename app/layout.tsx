/**
 * app/layout.tsx
 *
 * [루트 레이아웃]
 *
 * 상단 헤더, 메인, 하단 푸터. 공통 레이아웃(97_1단계_기초픽스 §5.2 기준).
 */

import type { Metadata } from 'next'
import Script from 'next/script'
import { Suspense } from 'react'
import './globals.css'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import NextTopLoader from 'nextjs-toploader'
import PageTracker from '@/components/analytics/PageTracker'

export const metadata: Metadata = {
    title: '왜난리 - 요즘 난리, 한눈에',
    description: '지금 한국에서 가장 뜨거운 이슈를 한눈에 확인하세요. 연예·정치·사회·스포츠 실시간 논란을 왜난리에서 빠르게 파악하세요.',
    keywords: ['왜난리', '왜 난리', 'whynali', '이슈', '논란', '실시간 이슈', '화제', '뉴스', '연예이슈', '정치이슈', '사회이슈', '실시간 화제', '논쟁', '토론'],
    openGraph: {
        title: '왜난리 - 요즘 난리, 한눈에',
        description: '왜난리에서 지금 한국에서 가장 뜨거운 이슈를 한눈에 확인하세요.',
        url: 'https://whynali.com',
        siteName: '왜난리',
        locale: 'ko_KR',
        type: 'website',
    },
    verification: {
        google: ['J9cnf6UOrn5T_W38YOde3BnpgoLRpxbzMPjuM23QazE', 'oLeSnP_W1iS3crjqf9RtO1koomeIm860DTAP-WSclWg'],
        other: {
            'naver-site-verification': '7308faf20b068eccbe33fbe3794875d9db9f676d',
            'DaumWebMasterTool': '5f7f0e4ccda02af974ce435e83ce7cdd2f8d81377a2bf3e07ea06dfa64fd08af:URM8VDHRn3s/PsmUxT0Z+w==',
        },
    },
}

const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: '왜난리',
    url: 'https://whynali.com',
    logo: 'https://whynali.com/whynali-logo.png',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

    return (
        <html lang="ko">
            <head>
                {GA_MEASUREMENT_ID && (
                    <>
                        <Script
                            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
                            strategy="afterInteractive"
                        />
                        <Script id="google-analytics" strategy="afterInteractive">
                            {`
                                window.dataLayer = window.dataLayer || [];
                                function gtag(){dataLayer.push(arguments);}
                                gtag('js', new Date());
                                gtag('config', '${GA_MEASUREMENT_ID}', {
                                    page_path: window.location.pathname,
                                    send_page_view: true
                                });
                            `}
                        </Script>
                    </>
                )}
                <script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js" async></script>
            </head>
            <body className="min-h-screen bg-surface-muted text-content-primary antialiased font-pretendard">
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
                <NextTopLoader color="#a202e3" showSpinner={false} />
                <Suspense fallback={null}>
                    <PageTracker />
                </Suspense>
                <Header />
                <main className="min-h-screen flex flex-col pb-8 md:pb-14 xl:pb-24">
                    {children}
                </main>
                <Footer />
            </body>
        </html>
    )
}
