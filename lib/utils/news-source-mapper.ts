/**
 * lib/utils/news-source-mapper.ts
 *
 * 뉴스 출처 도메인을 언론사 이름으로 변환하는 유틸리티
 */

const NEWS_SOURCE_MAP: Record<string, string> = {
    // 종합 일간지
    'chosun.com': '조선일보',
    'joongang.co.kr': '중앙일보',
    'donga.com': '동아일보',
    'hani.co.kr': '한겨레',
    'khan.co.kr': '경향신문',
    'kyunghyang.com': '경향신문',
    'kmib.co.kr': '국민일보',
    'seoul.co.kr': '서울신문',
    'segye.com': '세계일보',
    'dt.co.kr': '디지털타임스',
    'mt.co.kr': '머니투데이',
    'mk.co.kr': '매일경제',
    'sedaily.com': '서울경제',
    'hankyung.com': '한국경제',
    'fnnews.com': '파이낸셜뉴스',
    'etnews.com': '전자신문',
    'hankookilbo.com': '한국일보',
    'munhwa.com': '문화일보',

    // 방송사
    'kbs.co.kr': 'KBS',
    'sbs.co.kr': 'SBS',
    'mbc.co.kr': 'MBC',
    'jtbc.co.kr': 'JTBC',
    'ytn.co.kr': 'YTN',
    'news1.kr': '뉴스1',
    'mbn.co.kr': 'MBN',
    'tvchosun.com': 'TV조선',
    'ichannela.com': '채널A',

    // 통신사
    'yna.co.kr': '연합뉴스',
    'newsis.com': '뉴시스',
    'newspim.com': '뉴스핌',
    'moneytoday.co.kr': '머니투데이',

    // IT/경제 전문지
    'zdnet.co.kr': 'ZDNet Korea',
    'bloter.net': '블로터',
    'ddaily.co.kr': '디지털데일리',
    'boannews.com': '보안뉴스',
    'techm.kr': '테크M',
    'econovill.com': '이코노믹리뷰',
    'viva100.com': '비바100',
    'ajunews.com': '아주경제',
    'edaily.co.kr': '이데일리',
    'asiae.co.kr': '아시아경제',
    'inews24.com': '아이뉴스24',
    'wowtv.co.kr': '한국경제TV',

    // 스포츠/연예
    'sports.chosun.com': '스포츠조선',
    'sports.khan.co.kr': '스포츠경향',
    'sportalkorea.com': '스포탈코리아',
    'osen.co.kr': 'OSEN',
    'sportsworldi.com': '스포츠월드',
    'xportsnews.com': '엑스포츠뉴스',
    'starnewskorea.com': '스타뉴스',
    'dispatch.co.kr': '디스패치',
    'mydaily.co.kr': '마이데일리',
    'topstarnews.net': '톱스타뉴스',

    // 네이버 뉴스
    'n.news.naver.com': '네이버뉴스',
    'news.naver.com': '네이버뉴스',

    // 기타
    'ohmynews.com': '오마이뉴스',
    'mediatoday.co.kr': '미디어오늘',
    'pressian.com': '프레시안',
    'sisain.co.kr': '시사IN',
}

export function getNewsSourceName(domain: string): string {
    const cleanDomain = domain.toLowerCase().replace('www.', '')
    return NEWS_SOURCE_MAP[cleanDomain] || domain
}

export function extractDomainFromUrl(url: string): string {
    try {
        const urlObj = new URL(url)
        return urlObj.hostname.replace('www.', '')
    } catch {
        return 'Unknown'
    }
}
