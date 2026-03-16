/**
 * scripts/check_specific_issue_detail.ts
 * 
 * [특정 이슈의 모든 필드 출력]
 * 
 * 윤석준 이슈의 모든 컬럼 값을 확인합니다.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// .env.local 로드
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSpecificIssue() {
    const issueId = '8b9bd371-5692-419a-ab55-16ea295e102e'
    
    const { data, error } = await supabase
        .from('issues')
        .select('*')
        .eq('id', issueId)
        .single()

    if (error) {
        console.error('Error:', error)
        return
    }

    if (!data) {
        console.log('이슈를 찾을 수 없습니다.')
        return
    }

    console.log('=== 이슈 전체 정보 ===\n')
    console.log(JSON.stringify(data, null, 2))
}

checkSpecificIssue().catch(console.error)
