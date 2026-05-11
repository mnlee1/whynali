import { generateIssueThumbnail } from '../lib/generate-issue-thumbnail'
import { writeFileSync } from 'fs'

const samples = [
  { title: '아이유 콘서트 매진 대란', category: '연예', hot: false },
  { title: '손흥민 시즌 20골 돌파',   category: '스포츠', hot: true },
  { title: 'AI 스타트업 투자 열풍',   category: '기술', hot: false },
  { title: '카페 창업 열풍',          category: '생활문화', hot: false },
]

async function main() {
  for (const s of samples) {
    const buf = await generateIssueThumbnail(s.title, s.category, { hot: s.hot })
    writeFileSync(`/tmp/thumb-${s.category}.png`, buf)
    console.log('saved:', s.category)
  }
}
main()
