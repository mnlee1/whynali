/**
 * scripts/restore-auth-users.mjs
 * 
 * Supabase Auth 사용자 복원 스크립트
 * 
 * 백업된 auth.users 정보를 새 Supabase 프로젝트로 복원합니다.
 * 
 * ⚠️  주의:
 * - 비밀번호는 복원되지 않습니다 (해시를 옮길 수 없음)
 * - 사용자는 "비밀번호 재설정"으로 다시 로그인해야 합니다
 * - OAuth 사용자는 다시 로그인하면 자동으로 연결됩니다
 * 
 * 사용법:
 *   node scripts/restore-auth-users.mjs 2026-04-09
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import readline from 'readline'
import { config } from 'dotenv'

// 환경 변수 로드
config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ 환경 변수가 설정되지 않았습니다.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
})

function askConfirmation(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    
    return new Promise(resolve => {
        rl.question(question + ' (yes/no): ', answer => {
            rl.close()
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y')
        })
    })
}

async function restoreAuthUsers(backupDate) {
    console.log('='.repeat(60))
    console.log('🔐 Supabase Auth 사용자 복원 시작')
    console.log('='.repeat(60))
    console.log(`📅 백업 날짜: ${backupDate}`)
    
    // 백업 파일 읽기
    const backupFile = path.join(process.cwd(), 'backups-auth', backupDate, 'auth_users.json')
    
    try {
        const fileContent = await fs.readFile(backupFile, 'utf-8')
        const users = JSON.parse(fileContent)
        
        console.log(`\n👥 백업된 사용자: ${users.length}명`)
        console.log('\n⚠️  중요 안내:')
        console.log('   - 비밀번호는 복원되지 않습니다')
        console.log('   - OAuth 사용자는 다시 로그인하면 자동 연결됩니다')
        console.log('   - 이메일 사용자는 "비밀번호 재설정"이 필요합니다')
        
        const confirmed = await askConfirmation('\n계속하시겠습니까?')
        
        if (!confirmed) {
            console.log('❌ 복원 취소됨')
            process.exit(0)
        }
        
        console.log('\n📥 사용자 복원 중...')
        
        let successCount = 0
        let failCount = 0
        
        for (const user of users) {
            try {
                // 사용자 생성 (비밀번호 없이)
                const { data, error } = await supabase.auth.admin.createUser({
                    email: user.email,
                    email_confirm: !!user.email_confirmed_at,
                    user_metadata: user.user_metadata || {},
                    app_metadata: user.app_metadata || {}
                })
                
                if (error) {
                    console.error(`   ❌ ${user.email}: ${error.message}`)
                    failCount++
                } else {
                    console.log(`   ✅ ${user.email}`)
                    successCount++
                }
                
            } catch (err) {
                console.error(`   ❌ ${user.email}: ${err.message}`)
                failCount++
            }
        }
        
        console.log('\n' + '='.repeat(60))
        console.log('✅ Auth 사용자 복원 완료!')
        console.log('='.repeat(60))
        console.log(`✅ 성공: ${successCount}명`)
        console.log(`❌ 실패: ${failCount}명`)
        console.log(`📊 총합: ${users.length}명`)
        console.log('='.repeat(60))
        console.log('\n📧 다음 단계:')
        console.log('   1. 사용자에게 "비밀번호 재설정" 메일 발송')
        console.log('   2. OAuth 사용자는 다시 로그인하면 자동 연결됨')
        console.log('='.repeat(60))
        
    } catch (error) {
        console.error('\n❌ 복원 실패:', error.message)
        process.exit(1)
    }
}

// 사용법 체크
const args = process.argv.slice(2)

if (args.length === 0) {
    console.error('❌ 사용법: node scripts/restore-auth-users.mjs <날짜>')
    console.error('   예시: node scripts/restore-auth-users.mjs 2026-04-09')
    process.exit(1)
}

restoreAuthUsers(args[0])
