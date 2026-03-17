/**
 * scripts/run-merge-migration.ts
 * 
 * 이슈 병합 기능을 위한 DB 마이그레이션 실행
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

async function runMergeMigration() {
    console.log('=== 이슈 병합 마이그레이션 시작 ===\n')

    try {
        // 1. merged_into_id 컬럼 추가
        console.log('1. merged_into_id 컬럼 추가 중...')
        await supabaseAdmin.rpc('exec_sql', {
            sql: `
                ALTER TABLE issues
                ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES issues(id) ON DELETE SET NULL;
            `
        }).then(() => console.log('  ✅ 완료')).catch((err) => {
            if (err.message?.includes('already exists')) {
                console.log('  ⏭️  이미 존재함')
            } else {
                console.log('  ℹ️  수동 실행 필요 (RPC 함수 없을 수 있음)')
            }
        })

        // 2. approval_status 제약 업데이트
        console.log('\n2. approval_status 제약 업데이트 중...')
        console.log('  ℹ️  Supabase Dashboard → SQL Editor에서 수동 실행 필요:')
        console.log(`
ALTER TABLE issues
DROP CONSTRAINT IF EXISTS issues_approval_status_check;

ALTER TABLE issues
ADD CONSTRAINT issues_approval_status_check
CHECK (approval_status IN ('대기', '승인', '반려', '병합됨'));
        `)

        // 3. 현재 스키마 확인
        console.log('\n3. 현재 issues 테이블 스키마 확인...')
        const { data: columns, error } = await supabaseAdmin
            .rpc('exec_sql', {
                sql: `
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = 'issues'
                    ORDER BY ordinal_position;
                `
            })

        if (error) {
            console.log('  ℹ️  직접 확인 방법:')
            console.log('  Supabase Dashboard → Table Editor → issues')
        } else {
            console.log('  컬럼 목록:', columns)
        }

        console.log('\n=== 마이그레이션 안내 ===\n')
        console.log('Supabase Dashboard에서 다음 SQL을 실행하세요:')
        console.log('https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new\n')
        console.log('--- SQL 시작 ---')
        console.log(`
-- 1. merged_into_id 컬럼 추가
ALTER TABLE issues
ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES issues(id) ON DELETE SET NULL;

-- 2. approval_status 제약 업데이트
ALTER TABLE issues
DROP CONSTRAINT IF EXISTS issues_approval_status_check;

ALTER TABLE issues
ADD CONSTRAINT issues_approval_status_check
CHECK (approval_status IN ('대기', '승인', '반려', '병합됨'));

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_issues_merged_into 
ON issues(merged_into_id)
WHERE merged_into_id IS NOT NULL;

-- 4. 제목 중복 방지 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_unique_title_active
ON issues(title)
WHERE approval_status IN ('대기', '승인');

-- 5. 확인
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'issues'
ORDER BY ordinal_position;
        `)
        console.log('--- SQL 끝 ---\n')

    } catch (error) {
        console.error('마이그레이션 에러:', error)
    }
}

runMergeMigration().catch(console.error)
