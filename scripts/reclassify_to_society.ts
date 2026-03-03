/**
 * scripts/reclassify_to_society.ts
 * 
 * 하천·계곡 불법 시설 이슈를 사회로 재분류
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// .env.local 파일 직접 파싱
const envPath = join(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
        const key = match[1].trim()
        const value = match[2].trim()
        if (!process.env[key]) {
            process.env[key] = value
        }
    }
})

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
})

async function reclassify() {
    const issueId = 'f6d1fdc7-345e-4319-88fd-e72d5f7a9363'
    const title = '정부, 하천·계곡 불법 시설 전면 재조사'

    console.log('=== 카테고리 재분류 ===\n')
    console.log(`이슈: ${title}`)
    console.log(`ID: ${issueId}`)
    console.log(`정치 → 사회\n`)

    const { error } = await supabase
        .from('issues')
        .update({ 
            category: '사회',
            updated_at: new Date().toISOString()
        })
        .eq('id', issueId)

    if (error) {
        console.error(`✗ 수정 실패:`, error)
    } else {
        console.log(`✓ 수정 완료\n`)
        
        // 확인
        const { data } = await supabase
            .from('issues')
            .select('id, title, category')
            .eq('id', issueId)
            .single()

        if (data) {
            console.log('수정된 이슈 확인:')
            console.log(`제목: ${data.title}`)
            console.log(`카테고리: ${data.category}`)
        }
    }
}

reclassify().then(() => {
    process.exit(0)
}).catch((err) => {
    console.error('오류 발생:', err)
    process.exit(1)
})
