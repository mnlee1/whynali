/**
 * app/api/test/thumbnail-graphic/route.ts
 * 배경 이미지 + HTML overlay — 라이트모드 / 실제 메인 레이아웃
 */

import { generateIssueBg } from '@/lib/generate-issue-thumbnail'

// 카테고리별 딤 컬러 (파스텔 배경의 짙은 계열)
const CATEGORY_DIM: Record<string, string> = {
    '연예':    '109,40,217',   // violet
    '스포츠':  '37,99,235',    // blue
    '정치':    '71,85,105',    // slate
    '사회':    '225,29,72',    // rose
    '경제':    '22,163,74',    // green
    '기술':    '2,132,199',    // sky
    '세계':    '79,70,229',    // indigo
    '생활문화': '217,119,6',   // amber
}

const SAMPLES = [
    { blob: 'neon-01',   title: '아이유 콘서트 매진 대란',     category: '연예' },
    { blob: 'dark-01',   title: '손흥민 시즌 20골 돌파',       category: '스포츠', hot: true },
    { blob: 'neon-02',   title: 'AI 스타트업 투자 열풍',       category: '기술' },
    { blob: 'dark-02',   title: '묻지마 범죄 급증',            category: '사회', hot: true },
    { blob: 'bright-01', title: 'G7 정상회담 개막',            category: '세계' },
    { blob: 'neon-03',   title: '코스피 사상 최고치 돌파',     category: '경제', hot: true },
    { blob: 'dark-03',   title: '국회의원 막말 논란',          category: '정치' },
    { blob: 'bright-02', title: '카페 창업 열풍',              category: '생활문화' },
    { blob: 'bright-03', title: '반도체 수출 역대 최고',       category: '경제' },
    { blob: 'light-01',  title: '봄 나들이 명소 TOP10',        category: '생활문화' },
    { blob: 'light-02',  title: '넷플릭스 한국 드라마 흥행',   category: '연예' },
    { blob: 'light-03',  title: '기후변화 국제협약 체결',      category: '세계' },
]

export async function GET() {
    // 16:9 배경 (슬라이드용) + 정사각형 배경 (급상승용) 동시 생성
    const items: Array<{
        blob: string; title: string; category: string; hot?: boolean
        src: string; srcSq: string
    }> = []

    for (const s of SAMPLES) {
        try {
            const [buf, bufSq] = await Promise.all([
                generateIssueBg(s.category, s.blob),
                generateIssueBg(s.category, s.blob, { square: true }),
            ])
            items.push({
                ...s,
                src:   `data:image/png;base64,${buf.toString('base64')}`,
                srcSq: `data:image/png;base64,${bufSq.toString('base64')}`,
            })
        } catch (e) {
            console.error(`실패: ${s.blob}`, e)
        }
    }

    const slides  = items.slice(0, 5)
    const ranking = items.slice(0, 12)

    const slideHtml = slides.map((it, i) => {
        const rgb = CATEGORY_DIM[it.category] ?? '0,0,0'
        const ov  = `linear-gradient(to top, rgba(${rgb},.82) 0%, rgba(${rgb},.3) 45%, transparent 100%)`
        return `
    <div class="slide ${i === 0 ? 'active' : ''}">
      <div class="slide-bg" style="background-image:url('${it.src}')"></div>
      <div class="slide-overlay" style="background:${ov}"></div>
      <div class="slide-content">
        <span class="cat-badge">${it.category}</span>
        ${it.hot ? '<span class="hot-badge">🔥 HOT</span>' : ''}
        <h2 class="slide-title">${it.title}</h2>
      </div>
    </div>`
    }).join('')

    const rankHtml = ranking.map((it, i) => `
    <li class="rank-item ${i === 0 ? 'active' : ''}">
      <span class="rank-num">${i + 1}</span>
      <div class="rank-info">
        <p class="rank-title">${it.title}</p>
        <div class="rank-meta">
          <span>${it.category}</span>
          ${it.hot ? '<span class="rank-hot">급상승</span>' : ''}
        </div>
      </div>
      <div class="rank-thumb" style="background-image:url('${it.srcSq}')"></div>
    </li>`).join('')

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>썸네일 미리보기</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #fafafa; color: #111827; font-family: -apple-system, 'Pretendard', sans-serif; min-height: 100vh; }

    /* 헤더 */
    .header { background: #fff; border-bottom: 1px solid #e4e4e7; padding: 0 24px; height: 56px; display: flex; align-items: center; }
    .header-logo { font-size: 18px; font-weight: 900; color: #111; letter-spacing: -.02em; }

    /* 컨텐츠 */
    .container { max-width: 1080px; margin: 0 auto; padding: 24px 20px; }
    .section-label { font-size: 12px; color: #9ca3af; margin-bottom: 20px; text-transform: uppercase; letter-spacing: .08em; }

    /* 메인 레이아웃 */
    .main-layout { display: grid; grid-template-columns: 1fr 300px; gap: 16px; margin-bottom: 48px; }

    /* 슬라이드 */
    .slider-wrap { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 16/9; background: #e5e7eb; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .slide { position: absolute; inset: 0; opacity: 0; transition: opacity .6s; }
    .slide.active { opacity: 1; }
    .slide-bg { position: absolute; inset: 0; background-size: cover; background-position: center right; }
    .slide-overlay { position: absolute; inset: 0; }
    .slide-content { position: absolute; bottom: 0; left: 0; right: 0; padding: 20px 24px 52px; }
    .cat-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(255,255,255,.18); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,.25); color: #fff; font-size: 12px; font-weight: 700; margin-bottom: 10px; }
    .hot-badge { display: inline-block; margin-left: 8px; padding: 3px 10px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 11px; font-weight: 700; }
    .slide-title { font-size: clamp(18px, 2vw, 24px); font-weight: 800; color: #fff; line-height: 1.35; text-shadow: 0 2px 12px rgba(0,0,0,.7); }
    .top-badge { position: absolute; top: 12px; right: 12px; z-index: 10; padding: 6px 14px; border-radius: 999px; background: linear-gradient(to right, #f59e0b, #ea580c); color: #fff; font-size: 11px; font-weight: 700; }
    .dots { position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 10; }
    .dot { width: 6px; height: 6px; border-radius: 999px; background: rgba(255,255,255,.35); transition: all .3s; cursor: pointer; }
    .dot.active { background: #fff; width: 20px; }

    /* 급상승 */
    .ranking-wrap { display: flex; flex-direction: column; }
    .rank-header { font-size: 17px; font-weight: 800; color: #111827; margin-bottom: 14px; }
    .rank-list { display: flex; flex-direction: column; gap: 8px; list-style: none; flex: 1; }
    .rank-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid #e4e4e7; background: #fff; transition: all .3s; box-shadow: 0 1px 4px rgba(0,0,0,.04); }
    .rank-item.active { border-color: #7c3aed; background: linear-gradient(to right, rgba(109,40,217,.06), transparent); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,.08); }
    .rank-num { flex-shrink: 0; width: 18px; text-align: center; font-size: 13px; font-weight: 800; color: #7c3aed; }
    .rank-info { flex: 1; min-width: 0; }
    .rank-title { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
    .rank-meta { font-size: 11px; color: #9ca3af; display: flex; gap: 6px; }
    .rank-hot { color: #ef4444; font-weight: 600; }
    .rank-thumb { flex-shrink: 0; width: 44px; height: 44px; border-radius: 8px; background-size: cover; background-position: center; }

    /* 전체 그리드 */
    .divider { border: none; border-top: 1px solid #e4e4e7; margin-bottom: 32px; }
    .all-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 14px; }
    .all-card { position: relative; aspect-ratio: 16/9; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    .all-card .bg { position: absolute; inset: 0; background-size: cover; background-position: center right; }
    .all-card .ov { position: absolute; inset: 0; }
    .all-card .ct { position: absolute; bottom: 0; left: 0; right: 0; padding: 14px 16px 20px; }
    .all-card .ct span { display: inline-block; padding: 2px 10px; border-radius: 999px; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.2); color: #fff; font-size: 11px; font-weight: 700; margin-bottom: 6px; }
    .all-card .ct p { font-size: 15px; font-weight: 800; color: #fff; line-height: 1.35; text-shadow: 0 2px 8px rgba(0,0,0,.6); }
    .all-card .lbl { position: absolute; top: 8px; right: 10px; font-size: 10px; color: rgba(255,255,255,.35); font-family: monospace; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logo">왜난리</div>
  </div>

  <div class="container">
    <div class="section-label">메인 슬라이드 + 급상승 중 미리보기</div>

    <div class="main-layout">
      <div class="slider-wrap">
        <div class="top-badge">실시간 화력 상위</div>
        ${slideHtml}
        <div class="dots">
          ${slides.map((_, i) => `<div class="dot ${i === 0 ? 'active' : ''}" data-dot="${i}"></div>`).join('')}
        </div>
      </div>

      <div class="ranking-wrap">
        <div class="rank-header">🔥 급상승 중</div>
        <ol class="rank-list">${rankHtml}</ol>
      </div>
    </div>

    <hr class="divider"/>
    <div class="section-label">전체 12종</div>
    <div class="all-grid">
      ${items.map(it => {
        const rgb = CATEGORY_DIM[it.category] ?? '0,0,0'
        const ov  = `linear-gradient(to top, rgba(${rgb},.78) 0%, rgba(${rgb},.2) 45%, transparent 100%)`
        return `
      <div class="all-card">
        <div class="bg" style="background-image:url('${it.src}')"></div>
        <div class="ov" style="background:${ov}"></div>
        <div class="ct">
          <span>${it.category}</span>
          <p>${it.title}</p>
        </div>
        <div class="lbl">${it.blob}</div>
      </div>`
      }).join('')}
    </div>
  </div>

  <script>
    let cur = 0
    const slides = document.querySelectorAll('.slide')
    const dots   = document.querySelectorAll('.dot')
    const ranks  = document.querySelectorAll('.rank-item')

    function goTo(i) {
      slides[cur].classList.remove('active')
      dots[cur].classList.remove('active')
      cur = i
      slides[cur].classList.add('active')
      dots[cur].classList.add('active')
    }
    dots.forEach(d => d.addEventListener('click', () => goTo(+d.dataset.dot)))
    setInterval(() => goTo((cur + 1) % slides.length), 4000)

    let rankCur = 0
    setInterval(() => {
      ranks[rankCur].classList.remove('active')
      rankCur = (rankCur + 1) % ranks.length
      ranks[rankCur].classList.add('active')
    }, 2500)
  </script>
</body>
</html>`

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
