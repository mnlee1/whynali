import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: resolve(__dirname, '../.env.local') })

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function check() {
    console.log('============================================================')
    console.log('병합된 이슈 데이터 정합성 점검')
    console.log('============================================================')

    try {
        console.log('\n[1] approval_status="병합됨" + merged_into_id=NULL')
        const { data: case1, error: err1 } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, merged_into_id')
            .eq('approval_status', '병합됨')
            .is('merged_into_id', null)

        if (err1) throw err1
        console.log('발견:', case1?.length || 0, '건')
        if (case1 && case1.length > 0) {
            case1.forEach((i) => console.log('  -', i.id, ':', i.title))
        }

        console.log('\n[2] merged_into_id 존재 + approval_status != "병합됨"')
        const { data: case2, error: err2 } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, merged_into_id')
            .not('merged_into_id', 'is', null)
            .neq('approval_status', '병합됨')

        if (err2) throw err2
        console.log('발견:', case2?.length || 0, '건')
        if (case2 && case2.length > 0) {
            case2.forEach((i) => {
                console.log('  -', i.id, ':', i.title)
                console.log('    approval_status:', i.approval_status)
                console.log('    merged_into_id:', i.merged_into_id)
            })
        }

        console.log('\n[3] approval_status="승인" + merged_into_id 존재 (목록 노출 문제!)')
        const { data: case3, error: err3 } = await supabaseAdmin
            .from('issues')
            .select('id, title, approval_status, merged_into_id, visibility_status')
            .eq('approval_status', '승인')
            .not('merged_into_id', 'is', null)

        if (err3) throw err3
        console.log('발견:', case3?.length || 0, '건')
        if (case3 && case3.length > 0) {
            console.log('⚠️ 이 이슈들은 목록에 잘못 노출될 수 있습니다!')
            case3.forEach((i) => {
                console.log('  -', i.id, ':', i.title)
                console.log('    visibility_status:', i.visibility_status)
                console.log('    merged_into_id:', i.merged_into_id)
            })
        }

        console.log('\n[4] 전체 통계')
        const { data: all, error: err4 } = await supabaseAdmin
            .from('issues')
            .select('approval_status, merged_into_id')
            .or('approval_status.eq.병합됨,merged_into_id.not.is.null')

        if (err4) throw err4
        
        const stats = {
            total: all?.length || 0,
            bothCorrect: all?.filter(i => i.approval_status === '병합됨' && i.merged_into_id !== null).length || 0,
            onlyStatus: all?.filter(i => i.approval_status === '병합됨' && i.merged_into_id === null).length || 0,
            onlyId: all?.filter(i => i.approval_status !== '병합됨' && i.merged_into_id !== null).length || 0,
        }

        console.log('  총 병합 관련 이슈:', stats.total, '건')
        console.log('  정상 (둘 다 설정):', stats.bothCorrect, '건')
        console.log('  비정상 (상태만):', stats.onlyStatus, '건')
        console.log('  비정상 (ID만):', stats.onlyId, '건')

        console.log('\n============================================================')
        console.log('점검 완료')
        console.log('============================================================')

        const needsFix = (case1?.length || 0) + (case2?.length || 0) > 0
        if (needsFix) {
            console.log('\n⚠️ 데이터 정합성 문제가 발견되었습니다.')
        } else {
            console.log('\n✅ 모든 데이터가 정상입니다.')
        }

    } catch (error) {
        console.error('점검 중 오류:', error)
        throw error
    }
}

check().catch(console.error)
