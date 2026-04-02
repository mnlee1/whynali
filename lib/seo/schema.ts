/**
 * lib/seo/schema.ts
 * 
 * [Schema.org JSON-LD 스키마 생성 유틸리티]
 * 
 * 구조화된 데이터를 생성하여 검색 엔진과 AI가 콘텐츠를 이해하도록 돕습니다.
 * - Article: 이슈 상세 페이지
 * - BreadcrumbList: 네비게이션 경로
 * - WebSite: 홈페이지 + 사이트 검색
 * 
 * Schema.org 규격: https://schema.org/
 * Google 구조화된 데이터 가이드: https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
 */

import type { Issue, IssueCategory } from '@/types/issue'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'

/**
 * Article 스키마 - 이슈 상세 페이지
 * 검색 결과에 작성자, 날짜, 카테고리 등 풍부한 정보 표시
 */
export function generateArticleSchema(issue: Issue) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: issue.title,
        description: issue.description || `${issue.category} 카테고리의 ${issue.status} 이슈`,
        articleSection: issue.category,
        datePublished: issue.created_at,
        dateModified: issue.updated_at,
        author: {
            '@type': 'Organization',
            name: '왜난리',
            url: BASE_URL,
        },
        publisher: {
            '@type': 'Organization',
            name: '왜난리',
            url: BASE_URL,
            logo: {
                '@type': 'ImageObject',
                url: `${BASE_URL}/logo.png`,
            },
        },
        mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `${BASE_URL}/issue/${issue.id}`,
        },
        url: `${BASE_URL}/issue/${issue.id}`,
        image: `${BASE_URL}/og-image.png`,
        keywords: [issue.title, issue.category, '이슈', '논란', '왜난리'].join(', '),
        inLanguage: 'ko-KR',
        isAccessibleForFree: true,
    }
}

/**
 * BreadcrumbList 스키마 - 네비게이션 경로
 * 검색 결과에 "홈 > 카테고리 > 이슈" 경로 표시
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.name,
            item: item.url,
        })),
    }
}

/**
 * WebSite 스키마 - 홈페이지
 * 사이트 검색 기능을 검색 엔진에 알림
 */
export function generateWebSiteSchema() {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: '왜난리',
        alternateName: 'WhyNali',
        url: BASE_URL,
        description: '한국의 모든 이슈를 한눈에. 연예, 스포츠, 정치, 사회 등 실시간 논란과 사건을 타임라인으로 정리해서 보여드립니다.',
        inLanguage: 'ko-KR',
        potentialAction: {
            '@type': 'SearchAction',
            target: {
                '@type': 'EntryPoint',
                urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
        },
    }
}

/**
 * CollectionPage 스키마 - 카테고리 페이지
 * 카테고리별 이슈 목록 페이지
 */
export function generateCollectionPageSchema(category: IssueCategory) {
    const categoryNames: Record<IssueCategory, string> = {
        '연예': '연예 이슈',
        '스포츠': '스포츠 이슈',
        '정치': '정치 이슈',
        '사회': '사회 이슈',
        '경제': '경제 이슈',
        '기술': '기술 이슈',
        '세계': '세계 이슈',
    }

    const categoryUrls: Record<IssueCategory, string> = {
        '연예': '/entertain',
        '스포츠': '/sports',
        '정치': '/politics',
        '사회': '/society',
        '경제': '/economy',
        '기술': '/tech',
        '세계': '/world',
    }

    return {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: categoryNames[category],
        description: `${categoryNames[category]}를 한눈에 확인하세요. 최신 논란과 사건을 타임라인으로 정리해서 보여드립니다.`,
        url: `${BASE_URL}${categoryUrls[category]}`,
        inLanguage: 'ko-KR',
        isPartOf: {
            '@type': 'WebSite',
            name: '왜난리',
            url: BASE_URL,
        },
    }
}

/**
 * JSON-LD 스크립트 태그 생성
 * Next.js Script 컴포넌트에 사용
 */
export function createJsonLd(data: object) {
    return {
        __html: JSON.stringify(data, null, 0),
    }
}
