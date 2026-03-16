/**
 * scripts/apply_migration_002.ts
 * 
 * 마이그레이션 002 적용: 화력 15점 미만 및 source_track NULL 방지
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ 환경변수가 설정되지 않았습니다.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
    console.log('🔧 마이그레이션 002 적용 시작\n')
    
    // SQL 파일 읽기
    const sqlPath = path.join(process.cwd(), 'supabase/migrations/002_prevent_low_heat_and_null_source_track.sql')
    const sql = fs.readFileSync(sqlPath, 'utf-8')
    
    console.log('📄 SQL 파일 로드 완료')
    console.log(`📍 경로: ${sqlPath}\n`)
    
    try {
        // SQL 실행
        const { error } = await supabase.rpc('exec_sql', { sql_string: sql }).single()
        
        if (error) {
            // rpc가 없으면 직접 실행
            console.log('⚙️  SQL 직접 실행 중...\n')
            
            // SQL을 구문별로 분리
            const statements = sql
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'))
            
            for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i]
                if (!stmt) continue
                
                console.log(`${i + 1}/${statements.length}: 실행 중...`)
                
                // Supabase REST API로 SQL 실행
                const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseServiceKey,
                        'Authorization': `Bearer ${supabaseServiceKey}`,
                    },
                    body: JSON.stringify({ query: stmt + ';' })
                })
                
                if (!response.ok) {
                    const errorText = await response.text()
                    console.error(`  ❌ 실행 실패: ${errorText}`)
                    
                    // 트리거가 이미 존재하는 경우 무시
                    if (errorText.includes('already exists') || errorText.includes('이미 존재')) {
                        console.log(`  ℹ️  이미 존재함 (무시)`)
                        continue
                    }
                    throw new Error(errorText)
                }
                
                console.log(`  ✓ 완료`)
            }
        } else {
            console.log('✅ SQL 실행 완료\n')
        }
        
        console.log('🎉 마이그레이션 002 적용 완료!\n')
        console.log('적용된 내용:')
        console.log('  1. ✅ source_track NULL → track_a 자동 설정')
        console.log('  2. ✅ created_heat_index < 15점 → 생성 차단')
        console.log()
        
        // 테스트
        console.log('🧪 트리거 동작 테스트...\n')
        
        // 테스트 1: source_track NULL (자동 수정되어야 함)
        console.log('테스트 1: source_track NULL')
        try {
            const { data: test1, error: err1 } = await supabase
                .from('issues')
                .insert({
                    title: '__TEST__ source_track null 테스트',
                    category: '사회',
                    approval_status: '대기',
                    created_heat_index: 20,
                    // source_track: 의도적으로 설정 안 함
                })
                .select('id, source_track')
                .single()
            
            if (err1) {
                console.log(`  ❌ 실패: ${err1.message}`)
            } else if (test1) {
                console.log(`  ✓ 성공: source_track = ${test1.source_track}`)
                // 테스트 데이터 삭제
                await supabase.from('issues').delete().eq('id', test1.id)
                console.log(`  🗑️  테스트 데이터 삭제 완료`)
            }
        } catch (e: any) {
            console.log(`  ❌ 에러: ${e.message}`)
        }
        
        console.log()
        
        // 테스트 2: 화력 15점 미만 (차단되어야 함)
        console.log('테스트 2: created_heat_index < 15점')
        try {
            const { error: err2 } = await supabase
                .from('issues')
                .insert({
                    title: '__TEST__ 화력 미달 테스트',
                    category: '사회',
                    source_track: 'track_a',
                    approval_status: '대기',
                    created_heat_index: 10,  // 15점 미만
                })
            
            if (err2) {
                console.log(`  ✓ 성공: 생성 차단됨`)
                console.log(`  📝 에러 메시지: ${err2.message}`)
            } else {
                console.log(`  ❌ 실패: 생성이 허용되어서는 안 됨`)
            }
        } catch (e: any) {
            console.log(`  ✓ 성공: 생성 차단됨 (${e.message})`)
        }
        
        console.log()
        console.log('✅ 모든 테스트 완료!')
        
    } catch (error) {
        console.error('❌ 마이그레이션 실패:', error)
        process.exit(1)
    }
}

applyMigration()
    .catch(error => {
        console.error('❌ 실행 오류:', error)
        process.exit(1)
    })
