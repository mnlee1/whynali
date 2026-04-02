/**
 * app/robots.ts
 * 
 * [robots.txt 생성]
 * 
 * 검색 엔진 크롤러에게 크롤링 정책을 알려줍니다.
 * - 허용: 공개 콘텐츠 (이슈, 카테고리, 커뮤니티 등)
 * - 차단: 관리자 페이지, API, 인증 페이지, 개인 페이지
 * 
 * Next.js 15 App Router의 robots.ts 규격을 따릅니다.
 * https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */

import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'

    return {
        rules: [
            {
                userAgent: '*',
                allow: [
                    '/',
                    '/issue/*',
                    '/entertain',
                    '/sports',
                    '/politics',
                    '/society',
                    '/economy',
                    '/tech',
                    '/world',
                    '/community',
                    '/search',
                    '/privacy',
                    '/terms',
                ],
                disallow: [
                    '/admin/*',
                    '/api/*',
                    '/auth/*',
                    '/onboarding',
                    '/mypage',
                    '/login',
                    '/debug-env',
                ],
            },
        ],
        sitemap: `${baseUrl}/sitemap.xml`,
    }
}
