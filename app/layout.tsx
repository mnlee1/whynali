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
import ScrollToTopButton from '@/components/common/ScrollToTopButton'
import NextTopLoader from 'nextjs-toploader'
import PageTracker from '@/components/analytics/PageTracker'
import {
    SITE_ALTERNATE_NAMES,
    SITE_DESCRIPTION,
    SITE_KEYWORDS,
    SITE_LOGO,
    SITE_NAME,
    SITE_OG_IMAGE,
    SITE_SOCIAL_LINKS,
    SITE_TAGLINE,
    SITE_URL,
} from '@/lib/seo/site'

const defaultTitle = `${SITE_NAME} - ${SITE_TAGLINE}`

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: defaultTitle,
        template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    keywords: [...SITE_KEYWORDS],
    alternates: {
        canonical: '/',
    },
    openGraph: {
        title: defaultTitle,
        description: SITE_DESCRIPTION,
        url: '/',
        siteName: SITE_NAME,
        locale: 'ko_KR',
        type: 'website',
        images: [
            {
                url: SITE_OG_IMAGE,
                width: 1200,
                height: 630,
                alt: defaultTitle,
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: defaultTitle,
        description: SITE_DESCRIPTION,
        images: [SITE_OG_IMAGE],
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
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: SITE_URL,
    logo: `${SITE_URL}${SITE_LOGO}`,
    sameAs: [...SITE_SOCIAL_LINKS],
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
                <ScrollToTopButton />
            </body>
        </html>
    )
}
