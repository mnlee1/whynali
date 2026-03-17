/**
 * scripts/delete_null_source_track_issues.ts
 * 
 * source_track이 NULL이고 created_heat_index가 0점인 이슈 삭제
 * 
 * 이런 이슈는 트랙 A 프로세스를 거치지 않은 비정상 이슈입니다.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as readline from 'readline'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    
    return new Promise(resolve => rl.question(query, ans => {
        rl.close()
        resolve(ans)
    }))
}

async function deleteNullSourceTrackIssues() {
    console.log('🧹 비정상 이슈 정리\n')
    
    // source_track이 NULL인 이슈 조회
    const { data: issues, error } = await supabase
        .from('issues')
        .select('id, title, source_track, created_heat_index, heat_index, approval_status, created_at')
        .is('source_track', null)
        .order('created_at', { ascending: false })
    
    if (error || !issues) {
        console.error('❌ 이슈 조회 실패:', error)
        return
    }
    
    if (issues.length === 0) {
        console.log('✅ source_track이 NULL인 이슈가 없습니다!\n')
        return
    }
    
    console.log(`⚠️  ${issues.length}개의 비정상 이슈 발견:\n`)
    
    issues.forEach((issue, index) => {
        console.log(`${index + 1}. "${issue.title}"`)
        console.log(`   ID: ${issue.id}`)
        console.log(`   화력: 등록시 ${issue.created_heat_index ?? 0}점 / 현재 ${issue.heat_index ?? 0}점`)
        console.log(`   승인: ${issue.approval_status}`)
        console.log(`   생성일: ${new Date(issue.created_at).toLocaleString('ko-KR')}`)
        console.log()
    })
    
    const answer = await askQuestion('이 이슈들을 모두 삭제하시겠습니까? (yes/no): ')
    
    if (answer.toLowerCase() !== 'yes') {
        console.log('\n❌ 취소되었습니다.')
        return
    }
    
    console.log('\n🗑️  이슈 삭제 시작...\n')
    
    let successCount = 0
    let failCount = 0
    
    for (const issue of issues) {
        try {
            const { error: deleteError } = await supabase
                .from('issues')
                .delete()
                .eq('id', issue.id)
            
            if (deleteError) {
                console.error(`  ✗ "${issue.title}" 삭제 실패:`, deleteError.message)
                failCount++
            } else {
                console.log(`  ✓ "${issue.title}" 삭제 완료`)
                successCount++
            }
        } catch (error) {
            console.error(`  ✗ "${issue.title}" 삭제 중 오류:`, error)
            failCount++
        }
    }
    
    console.log('\n📊 정리 완료:')
    console.log(`  - 성공: ${successCount}개`)
    console.log(`  - 실패: ${failCount}개`)
    console.log()
    
    if (successCount > 0) {
        console.log('✅ 비정상 이슈 정리가 완료되었습니다.')
    }
}

deleteNullSourceTrackIssues()
    .catch(error => {
        console.error('❌ 실행 오류:', error)
        process.exit(1)
    })
