/**
 * lib/seo/site.ts
 *
 * [SEO 공통 상수]
 *
 * 사이트 URL, 브랜드명, SNS 링크 등 검색 엔진·구조화 데이터에서
 * 반복 사용하는 값을 한곳에서 관리합니다.
 */

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'

export const SITE_NAME = '왜난리'

export const SITE_TAGLINE = '요즘 난리, 한눈에'

export const SITE_DESCRIPTION =
    '왜난리(whynali.com)에서 지금 한국에서 가장 뜨거운 이슈를 한눈에 확인하세요. 연예·정치·사회·스포츠 실시간 논란을 빠르게 파악하세요.'

export const SITE_ALTERNATE_NAMES = ['whynali', 'WhyNali', '왜 난리', 'whynali.com'] as const

export const SITE_KEYWORDS = [
    '왜난리',
    '왜 난리',
    'whynali',
    'whynali.com',
    '이슈',
    '논란',
    '실시간 이슈',
    '화제',
    '뉴스',
    '연예이슈',
    '정치이슈',
    '사회이슈',
    '실시간 화제',
    '논쟁',
    '토론',
] as const

export const SITE_OG_IMAGE = '/whynali-share-og.png'

export const SITE_LOGO = '/whynali-logo.png'

/** Organization sameAs — 검색 엔진 브랜드 연결 신호 */
export const SITE_SOCIAL_LINKS = [
    'https://www.instagram.com/why_nali/',
    'https://www.threads.com/@why_nali',
    'https://x.com/whynali',
    'https://www.youtube.com/@왜난리',
    'https://www.tiktok.com/@whynali',
] as const
