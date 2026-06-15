/**
 * app/api/admin/issues/manual/route.ts
 *
 * 관리자 수동 이슈 등록
 *
 * track-a 파이프라인과 동일하게 흐르되 차이점:
 * - 버스트 감지 없음 — 관리자 키워드가 직접 진입점
 * - AI isIssue 판단 무시 (관리자가 이미 판단)
 * - 커뮤니티 0건이어도 등록 허용 (경고만 포함)
 * - 화력 최소값 체크 없음 (관리자 등록은 삭제 안 함)
 * - approval_status = '승인', approval_type = 'manual'
 * - source_track = 'manual'
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin'
import { searchNaverNewsByKeyword } from '@/lib/collectors/naver-news'
import { checkDuplicateIssue } from '@/lib/candidate/duplicate-checker'
import { findParentIssue, countKeywordOverlap } from '@/lib/candidate/parent-issue-finder'
import { calculateHeatIndex } from '@/lib/analysis/heat'
import { tokenize } from '@/lib/candidate/tokenizer'
import { validateIssueCreation } from '@/lib/validation/issue-creation'
import { searchAndLinkCauseArticles } from '@/lib/candidate/cause-article-searcher'
import {
    verifyIssueByAI,
    filterAndTitleByAI,
    classifyAndSummarizeTimeline,
    samplePostTitles,
    cleanupOrphanedRecords,
} from '@/lib/pipeline/issue-pipeline'
import type { TimelineStageName } from '@/lib/pipeline/issue-pipeline'
import { generateAndCacheSummaries } from '@/lib/ai/generate-timeline-summary'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await request.json()
    const keyword: string = (body.keyword ?? '').trim()

    if (!keyword || keyword.length < 2) {
        return NextResponse.json({ error: '키워드를 2자 이상 입력하세요' }, { status: 400 })
    }

    console.log(`[수동 등록] 시작: "${keyword}"`)

    // 1. community_data에서 키워드 매칭 게시글 조회 (최근 48시간, DB ilike 직접 필터)
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const tokens = tokenize(keyword).filter(t => t.length >= 2)
    const effectiveTokens = tokens.length > 0 ? tokens : [keyword]

    let communityQuery = supabaseAdmin
        .from('community_data')
        .select('id, title, source_site, created_at')
        .gte('updated_at', cutoff48h)

    for (const token of effectiveTokens) {
        communityQuery = communityQuery.ilike('title', `%${token}%`)
    }

    const { data: communityPostsData } = await communityQuery
        .order('updated_at', { ascending: false })
        .limit(200)

    const communityPosts = communityPostsData ?? []

    const communityWarning = communityPosts.length === 0
        ? '커뮤니티 반응 없음 — 뉴스만으로 등록합니다'
        : undefined

    console.log(`  커뮤니티 매칭: ${communityPosts.length}건${communityWarning ? ' (경고)' : ''}`)

    // 2. AI 이슈 검증 (isIssue 무시, 분류/키워드/제목 생성에만 사용)
    const sourceSites = [...new Set(communityPosts.map(p => p.source_site))]
    const sampleTitles = communityPosts.length > 0
        ? samplePostTitles(communityPosts)
        : [keyword]

    const aiResult = await verifyIssueByAI(keyword, communityPosts.length, sourceSites, sampleTitles)
    // 수동 등록은 AI가 이슈 아님으로 판단해도 계속 진행
    console.log(`  AI 판단: ${aiResult.isIssue ? '이슈' : '이슈 아님'} (신뢰도 ${aiResult.confidence}%) — 수동 등록이므로 계속 진행`)
    console.log(`  카테고리: ${aiResult.category}, 검색 키워드: "${aiResult.searchKeyword}"`)

    // 3. 네이버 뉴스 검색
    const newsItems = await searchNaverNewsByKeyword(aiResult.searchKeyword, aiResult.category)

    if (newsItems.length === 0) {
        return NextResponse.json({
            success: false,
            reason: 'no_news',
            message: `네이버 뉴스 0건 — "${aiResult.searchKeyword}" 검색 결과가 없습니다. 키워드를 수정해보세요.`,
        })
    }

    console.log(`  뉴스: ${newsItems.length}건`)

    // 4. 중복 체크
    const duplicateCheck = await checkDuplicateIssue(supabaseAdmin, aiResult.tentativeTitle)
    if (duplicateCheck.isDuplicate) {
        return NextResponse.json({
            success: false,
            reason: 'duplicate',
            message: `유사 이슈가 이미 존재합니다: "${duplicateCheck.existingIssue?.title}"`,
            existingIssue: duplicateCheck.existingIssue,
        })
    }

    // 5. 파생 이벤트 체크 (부모 이슈 탐색)
    const parentResult = await findParentIssue(supabaseAdmin, aiResult.tentativeTitle, aiResult.category)
    if (parentResult) {
        console.log(`  부모 이슈 감지: "${parentResult.parentIssueTitle}" — 수동 등록이므로 새 이슈로 생성`)
    }

    // 6. AI 통합 작업: 뉴스/커뮤니티 필터링 + 최종 제목 생성
    const { finalIssueTitle, relevantNewsIds, relevantCommunityIds } = await filterAndTitleByAI(
        keyword,
        aiResult.tentativeTitle,
        newsItems,
        communityPosts,
    )

    if (relevantNewsIds.length === 0) {
        return NextResponse.json({
            success: false,
            reason: 'no_relevant_news',
            message: 'AI 필터링 후 관련 뉴스가 없습니다. 키워드를 더 구체적으로 입력해보세요.',
        })
    }

    console.log(`  최종 제목: "${finalIssueTitle}"`)

    // 7. 이슈 생성
    const issueValidation = validateIssueCreation({
        title: finalIssueTitle,
        category: aiResult.category,
        source_track: 'manual',
        approval_status: '승인',
        approval_type: 'manual',
        status: '점화',
        topic: aiResult.topic,
        topic_description: aiResult.topicDescription,
    })

    if (!issueValidation.isValid) {
        return NextResponse.json({ success: false, reason: 'validation', message: issueValidation.error })
    }

    const { data: newIssue, error: createError } = await supabaseAdmin
        .from('issues')
        .insert({
            ...issueValidation.validated!,
            approved_at: new Date().toISOString(),
        })
        .select('id, created_at')
        .single()

    if (createError || !newIssue) {
        console.error('[수동 등록] 이슈 생성 에러:', createError)
        return NextResponse.json({ success: false, reason: 'db_error', message: '이슈 생성 실패' }, { status: 500 })
    }

    // 8. 커뮤니티 연결
    if (relevantCommunityIds.length > 0) {
        await supabaseAdmin
            .from('community_data')
            .update({ issue_id: newIssue.id })
            .in('id', relevantCommunityIds)
        console.log(`  커뮤니티 연결: ${relevantCommunityIds.length}건`)
    }

    // 9. 뉴스 연결
    const relevantNews = newsItems.filter(n => relevantNewsIds.includes(n.id))
    const { data: linkedNews } = await supabaseAdmin
        .from('news_data')
        .update({ issue_id: newIssue.id })
        .in('id', relevantNewsIds)
        .is('issue_id', null)
        .select('id')

    const linkedNewsCount = linkedNews?.length ?? 0
    console.log(`  뉴스 연결: ${linkedNewsCount}건`)

    if (linkedNewsCount === 0) {
        // 모든 뉴스가 다른 이슈에 이미 연결됨 — 이슈 삭제
        await cleanupOrphanedRecords(newIssue.id)
        await supabaseAdmin.from('issues').delete().eq('id', newIssue.id)
        return NextResponse.json({
            success: false,
            reason: 'no_news_linked',
            message: '해당 뉴스들이 이미 다른 이슈에 연결되어 있습니다.',
        })
    }

    // 10. 타임라인 생성
    const sortedNews = [...(linkedNews ?? [])].sort((a, b) => {
        const aTime = relevantNews.find(n => n.id === a.id)?.published_at ?? ''
        const bTime = relevantNews.find(n => n.id === b.id)?.published_at ?? ''
        return new Date(aTime).getTime() - new Date(bTime).getTime()
    })

    const sampledNews = sortedNews.slice(0, 5)
    const newsForClassify = sampledNews.map(news => {
        const item = relevantNews.find(n => n.id === news.id)
        return {
            id: news.id,
            title: item?.title ?? '',
            published_at: item?.published_at ?? new Date().toISOString(),
            link: item?.link ?? '',
        }
    })

    const { stageMap, pointSummaries, briefSummary } = await classifyAndSummarizeTimeline(
        finalIssueTitle,
        newsForClassify,
        '점화',
    )

    const timelinePoints = sampledNews.map(news => {
        const newsItem = relevantNews.find(n => n.id === news.id)
        return {
            issue_id: newIssue.id,
            title: newsItem?.title ?? '',
            occurred_at: newsItem?.published_at ?? new Date().toISOString(),
            source_url: newsItem?.link ?? '',
            stage: (stageMap.get(news.id) ?? '전개') as TimelineStageName,
            ai_summary: pointSummaries.get(news.id) ?? null,
        }
    })

    if (timelinePoints.length === 0) {
        await cleanupOrphanedRecords(newIssue.id)
        await supabaseAdmin.from('issues').delete().eq('id', newIssue.id)
        return NextResponse.json({ success: false, reason: 'no_timeline', message: '타임라인 생성 실패' })
    }

    const { error: timelineError } = await supabaseAdmin.from('timeline_points').insert(timelinePoints)
    if (timelineError) {
        await cleanupOrphanedRecords(newIssue.id)
        await supabaseAdmin.from('issues').delete().eq('id', newIssue.id)
        return NextResponse.json({ success: false, reason: 'timeline_error', message: '타임라인 저장 실패' })
    }

    // 타임라인 요약 생성 (bullets 형식으로 즉시 캐싱)
    await generateAndCacheSummaries(newIssue.id, finalIssueTitle, aiResult.topicDescription ?? null)
        .catch(err => console.warn('  ⚠️ [타임라인 요약 생성 실패]', err))

    // 브리핑 저장
    if (briefSummary) {
        await supabaseAdmin
            .from('issues')
            .update({ brief_summary: briefSummary })
            .eq('id', newIssue.id)
    }

    // 원인 기사 역방향 탐색 (비동기)
    searchAndLinkCauseArticles(
        newIssue.id, finalIssueTitle, aiResult.topicDescription ?? null,
        newIssue.created_at, aiResult.category,
    ).catch(() => null)

    // 11. 화력 계산 (삭제 없음 — 수동 등록은 관리자 판단 존중)
    const heatIndex = await calculateHeatIndex(newIssue.id).catch(() => 0)
    await supabaseAdmin
        .from('issues')
        .update({ heat_index: heatIndex, created_heat_index: heatIndex })
        .eq('id', newIssue.id)

    // 이미지 자동 생성 (비동기)
    const _newsLinks = relevantNews.slice(0, 5).map(n => n.link).filter(Boolean)
    Promise.resolve().then(async () => {
        try {
            const { fetchPexelsImages } = await import('@/lib/pexels')
            const thumbnailUrls = await fetchPexelsImages(finalIssueTitle, aiResult.category)
            if (thumbnailUrls.length > 0) {
                await supabaseAdmin
                    .from('issues')
                    .update({ thumbnail_urls: thumbnailUrls, primary_thumbnail_index: 0 })
                    .eq('id', newIssue.id)
            }
        } catch { /* 이미지 실패는 무시 */ }
    })

    console.log(`  ✅ [수동 등록 완료] "${finalIssueTitle}" (ID: ${newIssue.id}, 화력: ${heatIndex}점)`)

    return NextResponse.json({
        success: true,
        issueId: newIssue.id,
        issueTitle: finalIssueTitle,
        category: aiResult.category,
        heatIndex,
        communityCount: relevantCommunityIds.length,
        newsCount: linkedNewsCount,
        ...(communityWarning && { warning: communityWarning }),
        ...(parentResult && {
            parentWarning: `관련 이슈 "${parentResult.parentIssueTitle}"가 있었지만 별개 이슈로 등록했습니다`,
        }),
    })
}
