import { supabaseAdmin } from '../lib/supabase/server'

async function analyze() {
    const { data: issues } = await supabaseAdmin
        .from('issues')
        .select('id, title, heat_index, approval_status, category')
        .not('approval_status', 'is', null)
        
    if (!issues) return
    
    const heats = issues.map(i => i.heat_index || 0).sort((a, b) => a - b)
    
    console.log(`\n=== 전체 이슈 화력(Heat Index) 분포 분석 ===`)
    console.log(`총 분석 대상 이슈: ${heats.length}개`)
    
    // 점수대별 분포
    const distribution = {
        '0점': heats.filter(h => h === 0).length,
        '1~9점': heats.filter(h => h >= 1 && h < 10).length,
        '10~19점': heats.filter(h => h >= 10 && h < 20).length,
        '20~29점': heats.filter(h => h >= 20 && h < 30).length,
        '30~49점': heats.filter(h => h >= 30 && h < 50).length,
        '50점 이상': heats.filter(h => h >= 50).length,
    }
    
    console.log('\n[점수대별 분포]')
    Object.entries(distribution).forEach(([range, count]) => {
        const percentage = Math.round((count / heats.length) * 100)
        console.log(`- ${range}: ${count}개 (${percentage}%)`)
    })
    
    // 예시 출력
    console.log('\n[점수대별 실제 이슈 예시]')
    const ranges = [
        { max: 50, label: '30점~50점 (중간 화력)' },
        { max: 20, label: '10점~20점 (낮은 화력)' },
        { max: 9, label: '1점~9점 (매우 낮은 화력)' },
        { max: 0, label: '0점 (노이즈/반응 없음)' },
    ]
    
    ranges.forEach(r => {
        const sample = issues.find(i => (i.heat_index || 0) <= r.max && (r.max === 0 ? (i.heat_index || 0) === 0 : (i.heat_index || 0) > (r.max === 50 ? 30 : r.max === 20 ? 10 : 0)))
        if (sample) {
            console.log(`- [${r.label}] ${sample.heat_index}점: ${sample.title.slice(0, 40)}...`)
        }
    })
}

analyze()
