/**
 * scripts/restore-db.mjs
 * 
 * DB 복원 스크립트
 * 
 * 백업된 데이터를 Supabase로 복원합니다.
 * 
 * 사용법:
 *   node scripts/restore-db.mjs 2026-04-09          # 특정 날짜 전체 복원
 *   node scripts/restore-db.mjs 2026-04-09 issues   # 특정 테이블만 복원
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import readline from 'readline'
import { config } from 'dotenv'

// 환경 변수 로드 (.env.local)
config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 사용자 확인 받기
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

async function restoreTable(tableName, backupDate) {
    console.log(`\n📦 복원 중: ${tableName}...`)
    
    // 백업 파일 읽기
    const backupPath = path.join(process.cwd(), 'backups', backupDate, `${tableName}.json`)
    
    try {
        const fileContent = await fs.readFile(backupPath, 'utf-8')
        const data = JSON.parse(fileContent)
        
        console.log(`   📄 ${data.length}개 행 발견`)
        
        if (data.length === 0) {
            console.log(`   ⚠️  데이터 없음. 건너뜁니다.`)
            return { success: true, rows: 0 }
        }
        
        // 배치 단위로 복원 (한 번에 너무 많이 넣으면 실패할 수 있음)
        const BATCH_SIZE = 100
        let insertedCount = 0
        
        for (let i = 0; i < data.length; i += BATCH_SIZE) {
            const batch = data.slice(i, i + BATCH_SIZE)
            
            const { error } = await supabase
                .from(tableName)
                .upsert(batch, { onConflict: 'id' }) // id가 같으면 업데이트
            
            if (error) {
                console.error(`   ❌ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 실패:`, error.message)
                return { success: false, rows: insertedCount, error: error.message }
            }
            
            insertedCount += batch.length
            process.stdout.write(`\r   진행: ${insertedCount}/${data.length}`)
        }
        
        console.log(`\n   ✅ ${insertedCount}개 행 복원 완료`)
        return { success: true, rows: insertedCount }
        
    } catch (err) {
        console.error(`   ❌ 오류:`, err.message)
        return { success: false, rows: 0, error: err.message }
    }
}

async function main() {
    const args = process.argv.slice(2)
    
    if (args.length === 0) {
        console.error('❌ 사용법: node scripts/restore-db.mjs <날짜> [테이블명]')
        console.error('   예시: node scripts/restore-db.mjs 2026-04-09')
        console.error('   예시: node scripts/restore-db.mjs 2026-04-09 issues')
        process.exit(1)
    }
    
    const backupDate = args[0]
    const targetTable = args[1] || null
    
    console.log('='.repeat(50))
    console.log('🔄 DB 복원 시작')
    console.log('='.repeat(50))
    console.log(`📅 백업 날짜: ${backupDate}`)
    
    // 백업 폴더 확인
    const backupDir = path.join(process.cwd(), 'backups', backupDate)
    
    try {
        await fs.access(backupDir)
    } catch {
        console.error(`❌ 백업을 찾을 수 없습니다: ${backupDir}`)
        process.exit(1)
    }
    
    // 메타 정보 읽기
    const metaPath = path.join(backupDir, '_meta.json')
    let meta = null
    
    try {
        const metaContent = await fs.readFile(metaPath, 'utf-8')
        meta = JSON.parse(metaContent)
        console.log(`📊 백업 정보:`)
        console.log(`   - 백업 시간: ${meta.timestamp}`)
        console.log(`   - 총 테이블: ${meta.total_tables}개`)
        console.log(`   - 총 행 수: ${meta.total_rows.toLocaleString()}개`)
    } catch {
        console.warn('⚠️  메타 정보를 찾을 수 없습니다.')
    }
    
    // 복원할 테이블 결정
    let tablesToRestore = []
    
    if (targetTable) {
        tablesToRestore = [targetTable]
        console.log(`📋 복원 대상: ${targetTable} 테이블만`)
    } else if (meta) {
        tablesToRestore = meta.tables
            .filter(t => t.success)
            .map(t => t.table)
        console.log(`📋 복원 대상: 전체 ${tablesToRestore.length}개 테이블`)
    } else {
        console.error('❌ 복원할 테이블 목록을 확인할 수 없습니다.')
        process.exit(1)
    }
    
    // 경고 메시지
    console.log('\n⚠️  경고: 기존 데이터가 덮어쓰여질 수 있습니다!')
    
    const confirmed = await askConfirmation('\n계속하시겠습니까?')
    
    if (!confirmed) {
        console.log('❌ 복원 취소됨')
        process.exit(0)
    }
    
    // 복원 시작
    const startTime = Date.now()
    const results = []
    
    for (const tableName of tablesToRestore) {
        const result = await restoreTable(tableName, backupDate)
        results.push({
            table: tableName,
            ...result
        })
    }
    
    // 요약
    console.log('\n' + '='.repeat(50))
    console.log('✅ 복원 완료!')
    console.log('='.repeat(50))
    
    const successCount = results.filter(r => r.success).length
    const totalRows = results.reduce((sum, r) => sum + r.rows, 0)
    
    console.log(`📊 총 ${successCount}/${results.length}개 테이블 복원`)
    console.log(`📈 총 ${totalRows.toLocaleString()}개 행 복원`)
    console.log(`⏱️  소요 시간: ${Math.round((Date.now() - startTime) / 1000)}초`)
    console.log('='.repeat(50))
    
    // 실패한 테이블
    const failed = results.filter(r => !r.success)
    if (failed.length > 0) {
        console.warn('\n⚠️  일부 테이블 복원 실패:')
        failed.forEach(r => {
            console.warn(`   - ${r.table}: ${r.error}`)
        })
    }
}

main().catch(err => {
    console.error('❌ 복원 실패:', err)
    process.exit(1)
})
