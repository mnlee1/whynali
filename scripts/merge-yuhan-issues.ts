/**
 * scripts/merge-yuhan-issues.ts
 * 
 * 유한재단 중복 이슈 병합
 */

import dotenv from 'dotenv'
import { resolve } from 'path'
dotenv.config({ path: resolve(__dirname, '../.env.local') })

import { supabaseAdmin } from '../lib/supabase/server'

// ID로 직접 찾기
const id1 = 'acd6ba1b-261b-4d23-bc42-11a4eaf1c7a4'
const id2 = '879fe3b1-451c-49e8-a375-810080e66e3f'

async function mergeYuhanIssues() {
    console.log('=== 유한재단 중복 이슈 병합 ===\n')

    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, category, created_at, created_heat_index')
        .in('id', [id1, id2])
        .order('created_at', { ascending: true })

    if (!issues || issues.length < 2) {
        console.log(`❌ 이슈를 찾을 수 없습니다. (${issues?.length || 0}건)`)
        return
    }

    const [keep, del] = issues

    console.log('유지할 이슈:')
    console.log(`  제목: ${keep.title}`)
    console.log(`  ID: ${keep.id}`)
    console.log(`  카테고리: ${keep.category}`)
    console.log(`  생성: ${new Date(keep.created_at).toLocaleString()}\n`)

    console.log('삭제할 이슈:')
    console.log(`  제목: ${del.title}`)
    console.log(`  ID: ${del.id}`)
    console.log(`  카테고리: ${del.category}`)
    console.log(`  생성: ${new Date(del.created_at).toLocaleString()}\n`)

    // 뉴스 이동
    const { error: e1 } = await supabaseAdmin
        .from('news_data')
        .update({ issue_id: keep.id })
        .eq('issue_id', del.id)

    if (e1) {
        console.error('❌ 뉴스 이동 실패:', e1)
        return
    }
    console.log('✅ 뉴스 이동 완료')

    // 커뮤니티 이동
    const { error: e2 } = await supabaseAdmin
        .from('community_data')
        .update({ issue_id: keep.id })
        .eq('issue_id', del.id)

    if (e2) {
        console.error('❌ 커뮤니티 이동 실패:', e2)
        return
    }
    console.log('✅ 커뮤니티 이동 완료')

    // 이슈 삭제
    const { error: e3 } = await supabaseAdmin
        .from('issues')
        .delete()
        .eq('id', del.id)

    if (e3) {
        console.error('❌ 이슈 삭제 실패:', e3)
        return
    }
    console.log('✅ 중복 이슈 삭제 완료')

    console.log('\n━'.repeat(80) + '\n')
    console.log('✅ 병합 완료!\n')
    console.log('💡 향후 방지:')
    console.log('  토크나이저 개선으로 이런 케이스는 자동으로 묶입니다.')
    console.log('  - "XXX과/와" 조사 자동 제거')
    console.log('  - "한국XXX" → "XXX" 정규화\n')
}

mergeYuhanIssues().catch(console.error)
