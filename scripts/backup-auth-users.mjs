/**
 * scripts/backup-auth-users.mjs
 * 
 * Supabase Auth 사용자 백업 스크립트
 * 
 * auth.users 테이블의 사용자 정보를 백업합니다.
 * Supabase Management API를 사용합니다.
 * 
 * ⚠️  주의:
 * - 이 백업은 민감한 정보(이메일)를 포함합니다
 * - Private 저장소나 안전한 로컬 저장소에만 보관하세요
 * - 비밀번호 해시는 백업되지만 원본 비밀번호는 복구 불가능합니다
 * 
 * 필요한 환경 변수:
 * - SUPABASE_SERVICE_ROLE_KEY: Service Role Key
 * - NEXT_PUBLIC_SUPABASE_URL: Supabase 프로젝트 URL
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import { config } from 'dotenv'

// 환경 변수 로드
// 환경 변수 로드 (프로덕션 우선, 없으면 개발)
// 실서버(whynali-main) 백업용
config({ path: '.env.production.local' }) || config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ 환경 변수가 설정되지 않았습니다.')
    console.error('   NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 확인하세요.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

async function backupAuthUsers() {
    console.log('='.repeat(60))
    console.log('🔐 Supabase Auth 사용자 백업 시작')
    console.log('='.repeat(60))
    
    const startTime = Date.now()
    
    try {
        // auth.admin.listUsers()로 모든 사용자 가져오기
        console.log('\n📥 사용자 목록 가져오는 중...')
        
        const allUsers = []
        let page = 1
        const perPage = 1000 // 한 번에 가져올 최대 개수
        
        while (true) {
            const { data, error } = await supabase.auth.admin.listUsers({
                page: page,
                perPage: perPage
            })
            
            if (error) {
                throw new Error(`사용자 목록 가져오기 실패: ${error.message}`)
            }
            
            if (!data.users || data.users.length === 0) {
                break
            }
            
            allUsers.push(...data.users)
            console.log(`   페이지 ${page}: ${data.users.length}명`)
            
            // 마지막 페이지 확인
            if (data.users.length < perPage) {
                break
            }
            
            page++
        }
        
        console.log(`\n✅ 총 ${allUsers.length}명의 사용자 정보 가져오기 완료`)
        
        // 백업 데이터 가공 (민감하지 않은 정보만)
        const backupData = allUsers.map(user => ({
            id: user.id,
            email: user.email,
            email_confirmed_at: user.email_confirmed_at,
            phone: user.phone,
            created_at: user.created_at,
            updated_at: user.updated_at,
            last_sign_in_at: user.last_sign_in_at,
            app_metadata: user.app_metadata,
            user_metadata: user.user_metadata,
            identities: user.identities?.map(identity => ({
                id: identity.id,
                provider: identity.provider,
                user_id: identity.user_id,
                identity_data: identity.identity_data,
                created_at: identity.created_at,
                updated_at: identity.updated_at
            }))
        }))
        
        // 백업 폴더 생성
        const timestamp = new Date().toISOString()
        const dateStr = timestamp.split('T')[0]
        const timeStr = timestamp.split('T')[1].split('.')[0].replace(/:/g, '-')
        const backupDir = path.join(process.cwd(), 'backups-auth', dateStr)
        await fs.mkdir(backupDir, { recursive: true })
        
        // JSON 파일로 저장
        const backupFile = path.join(backupDir, 'auth_users.json')
        await fs.writeFile(
            backupFile,
            JSON.stringify(backupData, null, 2),
            'utf-8'
        )
        
        // 메타 정보 저장
        const metaFile = path.join(backupDir, '_meta.json')
        await fs.writeFile(
            metaFile,
            JSON.stringify({
                backup_type: 'auth_users',
                backup_date: dateStr,
                backup_time: timeStr,
                timestamp: timestamp,
                total_users: allUsers.length,
                duration_ms: Date.now() - startTime,
                warning: '⚠️  이 백업은 사용자 이메일과 OAuth 정보를 포함합니다. Private 저장소에만 보관하세요!'
            }, null, 2),
            'utf-8'
        )
        
        console.log('\n' + '='.repeat(60))
        console.log('✅ Auth 사용자 백업 완료!')
        console.log('='.repeat(60))
        console.log(`📅 날짜: ${dateStr} ${timeStr}`)
        console.log(`👥 사용자 수: ${allUsers.length}명`)
        console.log(`⏱️  소요 시간: ${Math.round((Date.now() - startTime) / 1000)}초`)
        console.log(`📁 저장 위치: ${backupDir}`)
        console.log('='.repeat(60))
        console.log('⚠️  주의: 이 백업은 민감한 정보를 포함합니다!')
        console.log('        Private 저장소나 안전한 로컬 저장소에만 보관하세요.')
        console.log('='.repeat(60))
        
    } catch (error) {
        console.error('\n❌ 백업 실패:', error.message)
        process.exit(1)
    }
}

backupAuthUsers()
