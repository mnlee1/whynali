/**
 * scripts/apply-approval-status-migration.ts
 * 
 * votes 테이블에 approval_status 컬럼 추가 마이그레이션 적용
 * 
 * 실행: NEXT_PUBLIC_SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=yyy npx tsx scripts/apply-approval-status-migration.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('환경변수가 설정되지 않았습니다.')
    console.error('다음 SQL을 Supabase 대시보드의 SQL Editor에서 실행하세요:')
    console.error('=' .repeat(80))
    console.error(`
-- 1. 필드 추가
ALTER TABLE votes ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT '대기';

-- 2. 체크 제약 조건
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_approval_status_check;
ALTER TABLE votes ADD CONSTRAINT votes_approval_status_check 
    CHECK (approval_status IN ('대기', '승인', '반려'));

-- 3. 기존 데이터 마이그레이션
UPDATE votes 
SET approval_status = CASE 
    WHEN phase = '대기' THEN '대기'
    ELSE '승인'
END
WHERE approval_status IS NULL OR approval_status = '대기';

-- 4. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_votes_approval_status ON votes(approval_status);

-- 5. 코멘트
COMMENT ON COLUMN votes.approval_status IS '관리자 검토 상태. 대기=검토 전, 승인=사용자 노출, 반려=거부됨(삭제 전)';
    `)
    console.error('=' .repeat(80))
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function applyMigration() {
    console.log('마이그레이션 적용 시작...')
    
    try {
        // 1. 컬럼 존재 여부 확인
        console.log('\n1. approval_status 컬럼 확인 중...')
        const { data: columns, error: checkError } = await supabase
            .from('votes')
            .select('approval_status')
            .limit(1)
        
        if (!checkError) {
            console.log('✓ approval_status 컬럼이 이미 존재합니다.')
            console.log('마이그레이션이 이미 적용되어 있습니다.')
            return
        }
        
        console.log('✗ approval_status 컬럼이 없습니다.')
        console.log('\n다음 SQL을 Supabase 대시보드의 SQL Editor에서 실행하세요:')
        console.log('=' .repeat(80))
        console.log(`
-- 1. 필드 추가
ALTER TABLE votes ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT '대기';

-- 2. 체크 제약 조건
ALTER TABLE votes DROP CONSTRAINT IF EXISTS votes_approval_status_check;
ALTER TABLE votes ADD CONSTRAINT votes_approval_status_check 
    CHECK (approval_status IN ('대기', '승인', '반려'));

-- 3. 기존 데이터 마이그레이션
UPDATE votes 
SET approval_status = CASE 
    WHEN phase = '대기' THEN '대기'
    ELSE '승인'
END
WHERE approval_status IS NULL OR approval_status = '대기';

-- 4. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_votes_approval_status ON votes(approval_status);

-- 5. 코멘트
COMMENT ON COLUMN votes.approval_status IS '관리자 검토 상태. 대기=검토 전, 승인=사용자 노출, 반려=거부됨(삭제 전)';
        `)
        console.log('=' .repeat(80))
        
        console.log('\nSupabase 대시보드 SQL Editor:')
        const projectRef = supabaseUrl.replace('https://', '').split('.')[0]
        console.log(`https://supabase.com/dashboard/project/${projectRef}/sql/new`)
        
    } catch (error) {
        console.error('에러 발생:', error)
        process.exit(1)
    }
}

applyMigration()
