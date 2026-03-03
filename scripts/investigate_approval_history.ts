/**
 * scripts/investigate_approval_history.ts
 * 
 * 승인 히스토리 조사
 */

import { supabaseAdmin } from '../lib/supabase/server'

async function main() {
    console.log('=== 승인 히스토리 조사 ===\n')

    const titles = [
        '%1억 공천헌금%',
        '%KT, MWC 2026%'
    ]

    for (const pattern of titles) {
        const { data: issues } = await supabaseAdmin
            .from('issues')
            .select('*')
            .ilike('title', pattern)
            .eq('approval_status', '승인')
            .limit(1)
            .single()

        if (!issues) {
            console.log(`"${pattern}" 없음\n`)
            continue
        }

        console.log(`[ ${issues.title} ]`)
        console.log(`ID: ${issues.id}`)
        console.log(`생성일: ${new Date(issues.created_at).toLocaleString('ko-KR')}`)
        console.log(`승인일: ${issues.approved_at ? new Date(issues.approved_at).toLocaleString('ko-KR') : 'null'}`)
        console.log(`승인상태: ${issues.approval_status}`)
        console.log(`승인타입: ${issues.approval_type ?? 'null'}`)
        console.log(`화력: ${issues.heat_index}점`)
        console.log(`카테고리: ${issues.category}`)
        
        // 시간 차이 계산
        if (issues.approved_at && issues.created_at) {
            const createdTime = new Date(issues.created_at).getTime()
            const approvedTime = new Date(issues.approved_at).getTime()
            const diffMinutes = Math.floor((approvedTime - createdTime) / (1000 * 60))
            console.log(`생성→승인 시간차: ${diffMinutes}분`)
            
            if (diffMinutes < 1) {
                console.log(`⚠️ 즉시 승인됨 (자동 승인 가능성)`)
            } else {
                console.log(`⏱️ ${diffMinutes}분 후 승인 (수동 승인 가능성)`)
            }
        }
        console.log()
    }

    // 최근 7일 내 화력 10점 미만인데 승인된 이슈들 찾기
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    
    const { data: lowHeatApproved } = await supabaseAdmin
        .from('issues')
        .select('id, title, approval_status, approval_type, heat_index, created_at, approved_at')
        .eq('approval_status', '승인')
        .lt('heat_index', 10)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })

    console.log(`[ 최근 7일 화력 10점 미만 승인 이슈 ]\n`)
    if (lowHeatApproved && lowHeatApproved.length > 0) {
        console.log(`총 ${lowHeatApproved.length}개\n`)
        lowHeatApproved.forEach((issue, idx) => {
            const createdTime = new Date(issue.created_at).getTime()
            const approvedTime = issue.approved_at ? new Date(issue.approved_at).getTime() : 0
            const diffMinutes = approvedTime > 0 ? Math.floor((approvedTime - createdTime) / (1000 * 60)) : 0
            
            console.log(`${idx + 1}. ${issue.title}`)
            console.log(`   화력: ${issue.heat_index}점 | 승인타입: ${issue.approval_type ?? 'null'}`)
            console.log(`   생성→승인: ${diffMinutes}분 | 생성: ${new Date(issue.created_at).toLocaleDateString('ko-KR')}\n`)
        })
    } else {
        console.log('없음')
    }
}

main().catch(console.error)
