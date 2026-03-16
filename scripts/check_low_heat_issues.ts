/**
 * scripts/check_low_heat_issues.ts
 * 
 * 화력 15점 미만 이슈 검증
 * 
 * 등록 시점(created_heat_index)과 현재 화력(heat_index) 모두 확인
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const MIN_HEAT = 15

interface Issue {
    id: string
    title: string
    source_track: string | null
    heat_index: number | null
    created_heat_index: number | null
    approval_status: string
    approval_type: string | null
    status: string
    created_at: string
    category: string
}

async function checkLowHeatIssues() {
    console.log('🔍 화력 15점 미만 이슈 검증\n')
    
    // 모든 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, source_track, heat_index, created_heat_index, approval_status, approval_type, status, created_at, category')
        .order('created_at', { ascending: false })
    
    if (error || !issues) {
        console.error('❌ 이슈 조회 실패:', error)
        return
    }
    
    console.log(`📊 총 ${issues.length}개 이슈\n`)
    
    // 분류
    const lowHeatIssues: Issue[] = []
    const normalIssues: Issue[] = []
    
    for (const issue of issues) {
        const createdHeat = issue.created_heat_index ?? 0
        const currentHeat = issue.heat_index ?? 0
        
        // 등록 시점 화력이 15점 미만
        if (createdHeat < MIN_HEAT) {
            lowHeatIssues.push(issue)
        } else {
            normalIssues.push(issue)
        }
    }
    
    console.log('📈 화력 분포:')
    console.log(`  - 정상 (등록시 15점 이상): ${normalIssues.length}개`)
    console.log(`  - 비정상 (등록시 15점 미만): ${lowHeatIssues.length}개\n`)
    
    if (lowHeatIssues.length > 0) {
        console.log('⚠️  화력 15점 미만인데 등록된 이슈:\n')
        
        for (let i = 0; i < lowHeatIssues.length; i++) {
            const issue = lowHeatIssues[i]
            
            // 뉴스, 커뮤니티 확인
            const { data: newsData } = await supabase
                .from('news_data')
                .select('id')
                .eq('issue_id', issue.id)
            const newsCount = newsData?.length ?? 0
            
            const { data: communityData } = await supabase
                .from('community_data')
                .select('id')
                .eq('issue_id', issue.id)
            const communityCount = communityData?.length ?? 0
            
            const createdHeat = issue.created_heat_index ?? 0
            const currentHeat = issue.heat_index ?? 0
            
            console.log(`${i + 1}. "${issue.title}"`)
            console.log(`   ID: ${issue.id}`)
            console.log(`   source_track: ${issue.source_track ?? 'NULL'}`)
            console.log(`   카테고리: ${issue.category}`)
            console.log(`   상태: ${issue.status} / 승인: ${issue.approval_status}`)
            console.log(`   승인 타입: ${issue.approval_type ?? 'NULL'}`)
            console.log(`   생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
            console.log(`   화력: 등록시 ${createdHeat}점 → 현재 ${currentHeat}점`)
            console.log(`   연결: 뉴스 ${newsCount}건 / 커뮤니티 ${communityCount}건`)
            
            // 문제 진단
            if (issue.source_track === 'track_a') {
                console.log(`   ❌ 문제: 트랙 A는 15점 미만 이슈를 삭제해야 하는데 등록됨`)
            } else if (issue.source_track === 'manual') {
                console.log(`   ℹ️  수동 생성 이슈 (화력 체크 안 함 - 과거 버그)`)
            } else {
                console.log(`   ⚠️  source_track이 null 또는 비정상`)
            }
            console.log()
        }
    } else {
        console.log('✅ 모든 이슈가 등록 시점에 화력 15점 이상입니다!\n')
    }
    
    // 현재 화력 15점 미만으로 떨어진 이슈
    const droppedIssues = normalIssues.filter(i => (i.heat_index ?? 0) < MIN_HEAT)
    
    if (droppedIssues.length > 0) {
        console.log(`\n📉 등록 후 화력이 15점 미만으로 떨어진 이슈: ${droppedIssues.length}개`)
        console.log('(정상 - 등록 후 하락은 허용됨)\n')
    }
}

checkLowHeatIssues()
    .catch(error => {
        console.error('❌ 실행 오류:', error)
        process.exit(1)
    })
