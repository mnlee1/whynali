import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'
import Groq from 'groq-sdk'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const groqKeys = (process.env.GROQ_API_KEY ?? '').split(',').map(k => k.trim()).filter(Boolean)

// 1. 전체 vote_choices 페이지네이션 조회
let allChoices = []
let from = 0
while (true) {
  const { data, error } = await supabase.from('vote_choices').select('id, vote_id, label').range(from, from + 999)
  if (error) { console.error('조회 에러:', error); process.exit(1) }
  if (!data || data.length === 0) break
  allChoices = allChoices.concat(data)
  if (data.length < 1000) break
  from += 1000
}
console.log(`전체 선택지 ${allChoices.length}개 로드`)

// vote_id별로 그룹핑
const byVote = new Map()
for (const c of allChoices) {
  if (!byVote.has(c.vote_id)) byVote.set(c.vote_id, [])
  byVote.get(c.vote_id).push(c)
}
console.log(`전체 투표 ${byVote.size}개`)

const EMOJI_RE = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]+\s*/u

let voteIdx = 0
let successVotes = 0
let failedVotes = []
let updatedChoices = 0

for (const [voteId, choices] of byVote) {
  voteIdx++
  const key = groqKeys[voteIdx % groqKeys.length]
  const originals = choices.map(c => c.label)
  try {
    const groq = new Groq({ apiKey: key })
    const prompt = `다음은 한 투표의 선택지 목록입니다. 각 선택지 텍스트는 절대 바꾸지 말고 그대로 유지한 채, 맨 앞에 그 내용과 어울리는 이모지를 정확히 1개만 붙여주세요. 선택지끼리 이모지가 겹치지 않게 서로 다른 것을 고르세요.

선택지: ${JSON.stringify(originals)}

JSON으로만 응답: {"choices": ["이모지 원문텍스트", ...]}`
    const completion = await groq.chat.completions.create({
      model: 'qwen/qwen3.6-27b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    })
    const raw = completion.choices[0]?.message?.content?.trim() ?? ''
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('JSON 매칭 실패: ' + raw.slice(0, 200))
    const parsed = JSON.parse(match[0])
    const results = parsed.choices
    if (!Array.isArray(results) || results.length !== originals.length) {
      throw new Error(`개수 불일치 (원본 ${originals.length}, 응답 ${results?.length})`)
    }

    // 검증: 이모지 뗀 나머지가 원문과 완전히 같은지
    const usedEmojis = new Set()
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const m = r.match(EMOJI_RE)
      if (!m) throw new Error(`이모지 없음: "${r}"`)
      const emoji = m[0].trim()
      const rest = r.slice(m[0].length).trim()
      if (rest !== originals[i].trim()) throw new Error(`텍스트 변형됨: "${originals[i]}" -> "${rest}"`)
      if (usedEmojis.has(emoji)) throw new Error(`이모지 중복: "${emoji}" in vote ${voteId}`)
      usedEmojis.add(emoji)
    }

    // 검증 통과 -> DB 업데이트
    for (let i = 0; i < choices.length; i++) {
      const { error: updErr } = await supabase.from('vote_choices').update({ label: results[i] }).eq('id', choices[i].id)
      if (updErr) throw new Error(`DB 업데이트 실패: ${updErr.message}`)
      updatedChoices++
    }
    successVotes++
    if (voteIdx % 20 === 0) console.log(`진행: ${voteIdx}/${byVote.size}`)
  } catch (e) {
    failedVotes.push({ voteId, originals, error: e.message })
    console.warn(`✗ [${voteId}] 실패:`, e.message)
  }
}

console.log(`\n완료 — 성공 ${successVotes}개 투표 (${updatedChoices}개 선택지), 실패 ${failedVotes.length}개`)
if (failedVotes.length > 0) {
  console.log('실패 목록:', JSON.stringify(failedVotes, null, 2))
}
