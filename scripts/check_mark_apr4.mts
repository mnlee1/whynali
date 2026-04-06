import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://banhuygrqgezhlpyytyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbmh1eWdycWdlemhscHl5dHljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMzQ0MSwiZXhwIjoyMDg2MTc5NDQxfQ.dMrfD0-TAl7fTfdBVQHNMQ0e5w8XCl7aT0oh7lmAVvY'
)

const { data: posts } = await supabase
  .from('community_data')
  .select('title, source_site')
  .ilike('title', '%마크%')
  .gte('created_at', '2026-04-04T00:00:00')
  .lte('created_at', '2026-04-04T23:59:59')

// Track-A와 동일한 방식으로 공동출현 키워드 빈도 계산
const STOPWORDS = new Set([
  '이','가','을','를','의','에','도','는','은','과','와','로','으로',
  '이다','입니다','합니다','했다','한다','하다','되다','이라',
  '진짜','정말','완전','너무','대박','엄청','같은','다른','이런','저런','그런',
  '근데','그런데','그리고','그래서','그러면','그러나','하지만',
  '그냥','좀','걍','막','아니','아','오','우와','헐','와','어','음',
  '이거','저거','그거','오늘','내일','어제','지금','이제','나중','다시','또',
  '있다','없다','되다','하다','이유','때문','사람','거','것',
  '뭐','왜','어떻게','언제','누구','얼마',
  '마크', // 버스트 키워드 자체 제외
])

const freq = new Map<string, number>()
posts?.forEach(p => {
  const words = p.title
    .replace(/[^\wㄱ-ㅎㅏ-ㅣ가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w: string) => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()))
  words.forEach((w: string) => freq.set(w, (freq.get(w) ?? 0) + 1))
})

const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
console.log('=== "마크" 포스트 공동출현 키워드 TOP 20 ===')
sorted.forEach(([w, c]) => console.log(`  ${w}: ${c}건`))
console.log(`\n총 포스트: ${posts?.length}개`)
