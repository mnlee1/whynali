/**
 * scripts/merge-duplicate-title-issues.ts
 * 
 * 제목이 완전히 같은 중복 이슈 병합
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function mergeDuplicateTitleIssues() {
    console.log('=== 제목 중복 이슈 병합 시작 ===\n')

    // 1. 모든 이슈 조회
    const { data: issues, error } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, approval_status, created_at, heat_index')
        .order('title')

    if (error || !issues || issues.length === 0) {
        console.log('이슈 조회 실패')
        return
    }

    console.log(`총 ${issues.length}개 이슈 조회\n`)

    // 2. 제목별로 그룹화
    const titleMap = new Map<string, typeof issues>()
    for (const issue of issues) {
        if (!titleMap.has(issue.title)) {
            titleMap.set(issue.title, [])
        }
        titleMap.get(issue.title)!.push(issue)
    }

    // 3. 중복 제목 찾기
    const duplicates = Array.from(titleMap.entries())
        .filter(([_, issues]) => issues.length > 1)
        .sort((a, b) => b[1].length - a[1].length)

    if (duplicates.length === 0) {
        console.log('✅ 중복 제목 없음\n')
        return
    }

    console.log(`⚠️  중복 제목 발견: ${duplicates.length}개\n`)

    let totalMerged = 0

    // 4. 각 중복 그룹 처리
    for (const [title, dupeIssues] of duplicates) {
        console.log(`\n제목: "${title}"`)
        console.log(`중복 개수: ${dupeIssues.length}개`)

        // 화력 가장 높은 이슈를 Primary로 선택
        const sortedByHeat = [...dupeIssues].sort((a, b) => 
            (b.heat_index ?? 0) - (a.heat_index ?? 0)
        )

        const primary = sortedByHeat[0]
        const secondaries = sortedByHeat.slice(1)

        console.log(`\nPrimary (남길 이슈):`)
        console.log(`  ID: ${primary.id}`)
        console.log(`  화력: ${primary.heat_index}`)
        console.log(`  상태: ${primary.approval_status}`)
        console.log(`  생성: ${new Date(primary.created_at).toLocaleString('ko-KR')}`)

        console.log(`\nSecondary (병합할 이슈들):`)
        for (const secondary of secondaries) {
            console.log(`  - ID: ${secondary.id.substring(0, 8)}... (화력 ${secondary.heat_index})`)
        }

        // 5. 데이터 병합
        const secondaryIds = secondaries.map(s => s.id)

        // news_data 이전
        const { error: newsError } = await supabaseAdmin
            .from('news_data')
            .update({ issue_id: primary.id })
            .in('issue_id', secondaryIds)

        if (newsError) {
            console.error(`  ❌ news_data 병합 실패:`, newsError)
            continue
        }

        // community_data 이전
        const { error: communityError } = await supabaseAdmin
            .from('community_data')
            .update({ issue_id: primary.id })
            .in('issue_id', secondaryIds)

        if (communityError) {
            console.error(`  ❌ community_data 병합 실패:`, communityError)
            continue
        }

        // timeline_points 이전
        await supabaseAdmin
            .from('timeline_points')
            .update({ issue_id: primary.id })
            .in('issue_id', secondaryIds)

        // emotional_expressions 이전
        await supabaseAdmin
            .from('emotional_expressions')
            .update({ issue_id: primary.id })
            .in('issue_id', secondaryIds)

        // issue_comments 이전
        await supabaseAdmin
            .from('issue_comments')
            .update({ issue_id: primary.id })
            .in('issue_id', secondaryIds)

        // issue_votes 이전
        await supabaseAdmin
            .from('issue_votes')
            .update({ issue_id: primary.id })
            .in('issue_id', secondaryIds)

        // 6. Secondary 이슈 상태 변경
        const { error: updateError } = await supabaseAdmin
            .from('issues')
            .update({
                approval_status: '병합됨',
                merged_into_id: primary.id,
            })
            .in('id', secondaryIds)

        if (updateError) {
            console.error(`  ❌ 이슈 상태 변경 실패:`, updateError)
            continue
        }

        // 7. Primary 이슈 화력 재계산
        const totalHeat = dupeIssues.reduce((sum, i) => sum + (i.heat_index ?? 0), 0)
        await supabaseAdmin
            .from('issues')
            .update({ heat_index: totalHeat })
            .eq('id', primary.id)

        console.log(`  ✅ 병합 완료 (${secondaries.length}개 → 1개)`)
        console.log(`  총 화력: ${totalHeat}점`)

        totalMerged += secondaries.length
    }

    console.log(`\n=== 병합 완료 ===`)
    console.log(`총 ${totalMerged}개 이슈 병합됨`)
}

mergeDuplicateTitleIssues().catch(console.error)
