#!/usr/bin/env node
/**
 * scripts/cleanup-old-backups.mjs
 * 
 * 오래된 로컬 백업 파일을 자동 삭제합니다.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// 보관 기간 설정
const KEEP_DAYS = {
    general: 30,    // 일반 백업 30일
    auth: 90        // Auth 백업 90일 (더 중요)
}

async function cleanupBackups(backupDir, keepDays, label) {
    const backupPath = path.join(projectRoot, backupDir)
    
    try {
        const entries = await fs.readdir(backupPath)
        const now = Date.now()
        const cutoffTime = now - (keepDays * 24 * 60 * 60 * 1000)
        
        let deletedCount = 0
        let keptCount = 0
        
        for (const entry of entries) {
            if (entry === 'README.md' || entry === '.gitkeep') {
                continue
            }
            
            const entryPath = path.join(backupPath, entry)
            const stats = await fs.stat(entryPath)
            
            if (stats.isDirectory()) {
                const entryTime = stats.mtimeMs
                
                if (entryTime < cutoffTime) {
                    await fs.rm(entryPath, { recursive: true, force: true })
                    console.log(`   🗑️  삭제: ${entry}`)
                    deletedCount++
                } else {
                    keptCount++
                }
            }
        }
        
        console.log(`\n${label}:`)
        console.log(`   ✅ 보관: ${keptCount}개`)
        console.log(`   🗑️  삭제: ${deletedCount}개`)
        console.log(`   📅 보관 기간: ${keepDays}일`)
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`\n${label}: 폴더 없음 (건너뜀)`)
        } else {
            console.error(`\n${label} 정리 실패:`, error.message)
        }
    }
}

async function main() {
    console.log('==================================================')
    console.log('🧹 오래된 백업 파일 정리')
    console.log('==================================================\n')
    
    await cleanupBackups('backups', KEEP_DAYS.general, '일반 백업')
    await cleanupBackups('backups-auth', KEEP_DAYS.auth, 'Auth 백업')
    
    console.log('\n==================================================')
    console.log('✅ 정리 완료')
    console.log('==================================================')
}

main().catch(console.error)
