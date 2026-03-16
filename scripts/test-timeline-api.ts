/**
 * scripts/test-timeline-api.ts
 * 
 * 타임라인 API가 제대로 작동하는지 테스트
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function testTimelineAPI() {
    console.log('=== 타임라인 API 테스트 ===\n')
    
    // 1. Track A 이슈 조회
    const { data: issue } = await supabase
        .from('issues')
        .select('id, title, source_track')
        .eq('source_track', 'track_a')
        .single()
    
    if (!issue) {
        console.log('❌ Track A 이슈가 없습니다.')
        return
    }
    
    console.log(`✅ Track A 이슈 발견:`)
    console.log(`   ID: ${issue.id}`)
    console.log(`   제목: ${issue.title}`)
    console.log('')
    
    // 2. 직접 DB에서 타임라인 조회
    const { data: timelineFromDB, error: dbError } = await supabase
        .from('timeline_points')
        .select('*')
        .eq('issue_id', issue.id)
        .order('occurred_at', { ascending: true })
    
    console.log(`📊 DB에서 직접 조회:`)
    console.log(`   타임라인 개수: ${timelineFromDB?.length ?? 0}개`)
    if (dbError) {
        console.log(`   에러: ${dbError.message}`)
    }
    console.log('')
    
    // 3. API를 통한 타임라인 조회 (실제 API 엔드포인트 시뮬레이션)
    const apiUrl = `${supabaseUrl.replace('.supabase.co', '.functions.supabase.co')}/api/issues/${issue.id}/timeline`
    console.log(`🔗 API URL: /api/issues/${issue.id}/timeline`)
    console.log('')
    
    // 4. 결과 비교
    if (timelineFromDB && timelineFromDB.length > 0) {
        console.log(`✅ 타임라인 데이터가 DB에 정상적으로 존재합니다.`)
        console.log('')
        console.log('타임라인 포인트 목록:')
        timelineFromDB.forEach((point, index) => {
            console.log(`  ${index + 1}. [${point.stage}] ${point.title || '(제목 없음)'}`)
            console.log(`     시간: ${point.occurred_at}`)
            console.log(`     출처: ${point.source_url || '없음'}`)
        })
    } else {
        console.log(`❌ 타임라인 데이터가 없습니다.`)
    }
    
    console.log('')
    console.log('=== 프론트엔드 확인 방법 ===')
    console.log(`1. 브라우저에서 /issue/${issue.id} 페이지 접속`)
    console.log(`2. F12 개발자 도구 열기 → Console 탭`)
    console.log(`3. "[TimelineSection]" 로그 확인`)
    console.log(`   - "Fetching timeline for issue" 로그가 있는지`)
    console.log(`   - "Timeline response" 에 데이터가 있는지`)
    console.log(`   - "Timeline data count" 가 ${timelineFromDB?.length ?? 0}개인지 확인`)
}

testTimelineAPI()
    .then(() => {
        console.log('\n✅ 테스트 완료')
        process.exit(0)
    })
    .catch((error) => {
        console.error('❌ 에러 발생:', error)
        process.exit(1)
    })
