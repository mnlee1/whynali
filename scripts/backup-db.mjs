/**
 * scripts/backup-db.mjs
 * 
 * Supabase DB 자동 백업 스크립트
 * 
 * 매일 새벽에 GitHub Actions가 자동으로 실행합니다.
 * 핵심 테이블(이슈, 댓글, 투표 등)을 JSON 파일로 저장합니다.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import { config } from 'dotenv'

// 환경 변수 로드 (.env.local)
config({ path: '.env.local' })

// Supabase 연결
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 백업할 테이블 목록 (중요한 것만)
const BACKUP_TABLES = [
    { name: 'issues', orderBy: 'created_at' },
    { 
        name: 'users', 
        orderBy: 'created_at',
        excludeFields: ['contact_email', 'provider_id']  // 민감 정보 제외
    },
    { name: 'comments', orderBy: 'created_at' },
    { name: 'reactions', orderBy: 'created_at' },
    { name: 'votes', orderBy: 'created_at' },
    { name: 'discussion_topics', orderBy: 'created_at' },
    { name: 'news_data', orderBy: 'published_at' },
    { name: 'timeline_points', orderBy: 'created_at' },
    // { name: 'banned_words', orderBy: 'created_at' },  // 테이블 없음 (나중에 추가)
]

async function backupTable(tableName, orderBy = 'created_at', excludeFields = []) {
    console.log(`📦 백업 중: ${tableName}...`)
    
    try {
        const { data, error, count } = await supabase
            .from(tableName)
            .select('*', { count: 'exact' })
            .order(orderBy, { ascending: false })
        
        if (error) {
            console.error(`❌ ${tableName} 백업 실패:`, error.message)
            return null
        }
        
        // 민감한 필드 제거
        let filteredData = data
        if (excludeFields.length > 0 && data) {
            filteredData = data.map(row => {
                const filtered = { ...row }
                excludeFields.forEach(field => {
                    delete filtered[field]
                })
                return filtered
            })
            console.log(`   ⚠️  민감 정보 제외: ${excludeFields.join(', ')}`)
        }
        
        console.log(`   ✓ ${count}개 행 백업 완료`)
        return { data: filteredData, count }
        
    } catch (err) {
        console.error(`❌ ${tableName} 백업 중 오류:`, err.message)
        return null
    }
}

async function main() {
    console.log('='.repeat(50))
    console.log('🔄 Supabase DB 백업 시작')
    console.log('='.repeat(50))
    
    const startTime = Date.now()
    const timestamp = new Date().toISOString()
    const dateStr = timestamp.split('T')[0] // YYYY-MM-DD
    const timeStr = timestamp.split('T')[1].split('.')[0].replace(/:/g, '-') // HH-MM-SS
    
    // 백업 폴더 생성
    const backupDir = path.join(process.cwd(), 'backups', dateStr)
    await fs.mkdir(backupDir, { recursive: true })
    
    const results = []
    let totalRows = 0
    
    // 각 테이블 백업
    for (const table of BACKUP_TABLES) {
        const result = await backupTable(table.name, table.orderBy, table.excludeFields || [])
        
        if (result && result.data) {
            // JSON 파일로 저장
            const filename = `${table.name}.json`
            const filepath = path.join(backupDir, filename)
            
            await fs.writeFile(
                filepath,
                JSON.stringify(result.data, null, 2),
                'utf-8'
            )
            
            results.push({
                table: table.name,
                rows: result.count,
                file: filename,
                success: true
            })
            
            totalRows += result.count || 0
        } else {
            results.push({
                table: table.name,
                rows: 0,
                file: null,
                success: false
            })
        }
    }
    
    // 메타 정보 저장
    const meta = {
        backup_date: dateStr,
        backup_time: timeStr,
        timestamp: timestamp,
        total_tables: BACKUP_TABLES.length,
        total_rows: totalRows,
        success_count: results.filter(r => r.success).length,
        failed_count: results.filter(r => !r.success).length,
        tables: results,
        duration_ms: Date.now() - startTime
    }
    
    await fs.writeFile(
        path.join(backupDir, '_meta.json'),
        JSON.stringify(meta, null, 2),
        'utf-8'
    )
    
    // 요약 출력
    console.log('\n' + '='.repeat(50))
    console.log('✅ 백업 완료!')
    console.log('='.repeat(50))
    console.log(`📅 날짜: ${dateStr} ${timeStr}`)
    console.log(`📊 총 ${meta.success_count}/${meta.total_tables}개 테이블`)
    console.log(`📈 총 ${totalRows.toLocaleString()}개 행`)
    console.log(`⏱️  소요 시간: ${Math.round(meta.duration_ms / 1000)}초`)
    console.log(`📁 저장 위치: ${backupDir}`)
    console.log('='.repeat(50))
    
    // 실패한 테이블이 있으면 경고
    if (meta.failed_count > 0) {
        console.warn('\n⚠️  일부 테이블 백업 실패:')
        results.filter(r => !r.success).forEach(r => {
            console.warn(`   - ${r.table}`)
        })
    }
}

main().catch(err => {
    console.error('❌ 백업 실패:', err)
    process.exit(1)
})
