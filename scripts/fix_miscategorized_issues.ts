/**
 * scripts/fix_miscategorized_issues.ts
 * 
 * 오분류된 이슈의 카테고리 수정
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

async function fixIssues() {
    console.log('=== 오분류된 이슈 카테고리 수정 ===\n')

    const issuesToFix = [
        {
            id: 'f6d1fdc7-345e-4319-88fd-e72d5f7a9363',
            title: '정부, 하천·계곡 불법 시설 전면 재조사',
            currentCategory: '스포츠',
            newCategory: '정치',
            reason: '정부·행안부·대통령 관련 정치 이슈'
        },
        {
            id: '3745fe2d-d2ad-49a9-85ec-393b4bb61434',
            title: '넥센타이어, 신형 BMW iX3에 신차용 타이어로 엔페라 스포츠 공급',
            currentCategory: '스포츠',
            newCategory: '기술',
            reason: '타이어 신차용 OE 공급 기술/산업 뉴스'
        }
    ]

    for (const issue of issuesToFix) {
        console.log(`\n이슈: ${issue.title}`)
        console.log(`ID: ${issue.id}`)
        console.log(`현재 카테고리: ${issue.currentCategory}`)
        console.log(`수정 카테고리: ${issue.newCategory}`)
        console.log(`수정 이유: ${issue.reason}`)

        const { error } = await supabase
            .from('issues')
            .update({ 
                category: issue.newCategory,
                updated_at: new Date().toISOString()
            })
            .eq('id', issue.id)

        if (error) {
            console.error(`✗ 수정 실패:`, error)
        } else {
            console.log(`✓ 수정 완료`)
        }
    }

    console.log('\n\n=== 수정된 이슈 확인 ===\n')

    for (const issue of issuesToFix) {
        const { data, error } = await supabase
            .from('issues')
            .select('id, title, category')
            .eq('id', issue.id)
            .single()

        if (error) {
            console.error(`조회 실패:`, error)
        } else if (data) {
            console.log(`\n[${data.id}]`)
            console.log(`제목: ${data.title}`)
            console.log(`카테고리: ${data.category}`)
        }
    }

    console.log('\n\n완료!')
}

fixIssues().then(() => {
    process.exit(0)
}).catch((err) => {
    console.error('오류 발생:', err)
    process.exit(1)
})
