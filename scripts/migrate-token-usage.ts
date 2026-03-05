/**
 * scripts/migrate-token-usage.ts
 *
 * API 사용량 테이블에 토큰 사용량 컬럼 추가 마이그레이션
 *
 * 실행:
 * npx tsx scripts/migrate-token-usage.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('환경변수가 설정되지 않았습니다.')
        console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
        console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
        process.exit(1)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('마이그레이션 파일 읽기...')
    const migrationPath = path.join(
        process.cwd(),
        'supabase/migrations/add_token_usage_to_api_usage.sql'
    )

    const sql = fs.readFileSync(migrationPath, 'utf-8')

    console.log('SQL 실행 중...')
    console.log(sql)

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (error) {
        console.error('마이그레이션 실패:', error)
        process.exit(1)
    }

    console.log('마이그레이션 완료!')
    console.log('결과:', data)
}

main().catch(console.error)
