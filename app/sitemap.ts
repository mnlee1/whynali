/**
 * app/sitemap.ts
 * 
 * [sitemap.xml 생성]
 * 
 * 검색 엔진이 사이트의 모든 페이지를 효율적으로 크롤링할 수 있도록 도와줍니다.
 * - 정적 페이지: 홈, 카테고리, 커뮤니티 등
 * - 동적 페이지: 승인된 모든 이슈 상세 페이지
 * 
 * 우선순위 전략:
 * - 점화/논란중 이슈: 0.8 (높은 우선순위, 최신 콘텐츠)
 * - 종결 이슈: 0.5 (낮은 우선순위, 아카이브)
 * - 카테고리 페이지: 0.7
 * - 기타 페이지: 0.6
 * 
 * Next.js 15 App Router의 sitemap.ts 규격을 따릅니다.
 * https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import { MetadataRoute } from 'next'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { IssueStatus } from '@/types/issue'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://whynali.com'

    // 승인된 이슈 목록 가져오기 (visibility_status='visible'만)
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, status, updated_at')
        .eq('approval_status', '승인')
        .eq('visibility_status', 'visible')
        .is('merged_into_id', null)
        .order('updated_at', { ascending: false })

    // 정적 페이지
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'hourly',
            priority: 1,
        },
        {
            url: `${baseUrl}/entertain`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/sports`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/politics`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/society`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/economy`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/tech`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/world`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/community`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.6,
        },
        {
            url: `${baseUrl}/search`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.5,
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/terms`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.3,
        },
    ]

    // 동적 페이지 (이슈 상세)
    const issuePages: MetadataRoute.Sitemap = (issues ?? []).map((issue: { id: string; status: IssueStatus; updated_at: string }) => {
        // 이슈 상태에 따라 우선순위 차등 적용
        const isActive = issue.status === '점화' || issue.status === '논란중'
        const priority = isActive ? 0.8 : 0.5
        const changeFrequency = isActive ? 'hourly' : 'weekly'

        return {
            url: `${baseUrl}/issue/${issue.id}`,
            lastModified: new Date(issue.updated_at),
            changeFrequency,
            priority,
        }
    })

    return [...staticPages, ...issuePages]
}
