/**
 * lib/api/issues.ts
 * 
 * [프론트엔드용 API 호출 함수 모음]
 * 
 * 페이지/컴포넌트에서 백엔드 API를 호출할 때 사용하는 유틸 함수들입니다.
 * fetch를 직접 쓰는 대신 이 함수들을 쓰면 타입 안전하고 재사용하기 쉽습니다.
 * 
 * 예시:
 * - 홈/카테고리 페이지 → getIssues() 로 이슈 목록 가져오기
 * - 이슈 상세 페이지 → getIssue(id), getTimeline(id), getSources(id) 로 상세 정보 가져오기
 */

import type { Issue, TimelinePoint, NewsData, CommunityData } from '@/types/issue'

// 이슈 목록 조회 시 넘길 수 있는 파라미터 (검색, 필터, 정렬 등)
interface GetIssuesParams {
    category?: string       // 카테고리 (연예, 스포츠, 정치, 사회, 기술)
    status?: string         // 상태 (점화, 논란중, 종결)
    q?: string              // 검색 키워드
    sort?: 'latest' | 'heat' // 정렬 (최신순 또는 화력순)
    limit?: number          // 한 번에 가져올 개수
    offset?: number         // 건너뛸 개수 (페이지네이션용)
}

// 이슈 목록 API 응답 형태
interface IssuesResponse {
    data: Issue[]           // 이슈 배열
    total: number           // 전체 개수
}

/**
 * getIssues - 이슈 목록 조회
 * 
 * GET /api/issues 를 호출해서 이슈 목록을 가져옵니다.
 * 홈, 연예, 스포츠 등 목록 화면에서 사용합니다.
 * 
 * 예시:
 *   const { data, total } = await getIssues({ category: '연예', sort: 'heat' })
 */
export async function getIssues(params?: GetIssuesParams): Promise<IssuesResponse> {
    // URL 쿼리 파라미터 만들기
    const searchParams = new URLSearchParams()
    if (params?.category) searchParams.set('category', params.category)
    if (params?.status) searchParams.set('status', params.status)
    if (params?.q) searchParams.set('q', params.q)
    if (params?.sort) searchParams.set('sort', params.sort)
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())

    // API 호출
    const url = `/api/issues${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('이슈 목록 조회 실패')
    return res.json()
}

/**
 * getIssue - 이슈 상세 조회
 * 
 * GET /api/issues/[id] 를 호출해서 특정 이슈의 상세 정보를 가져옵니다.
 * 이슈 상세 페이지(/issue/[id])에서 제목, 상태, 화력 등을 보여줄 때 사용합니다.
 * 
 * 예시:
 *   const { data } = await getIssue('abc-123')
 *   // data = { id, title, status, category, heat_index, ... }
 */
export async function getIssue(id: string): Promise<{ data: Issue }> {
    const res = await fetch(`/api/issues/${id}`)
    if (!res.ok) throw new Error('이슈 조회 실패')
    return res.json()
}

/**
 * getTimeline - 타임라인 조회
 * 
 * GET /api/issues/[id]/timeline 를 호출해서 이슈의 시간순 흐름을 가져옵니다.
 * 이슈 상세 페이지에서 "발단 → 전개 → 파생 → 진정" 단계를 보여줄 때 사용합니다.
 * 
 * 예시:
 *   const { data } = await getTimeline('abc-123')
 *   // data = [{ occurred_at, source_url, stage: '발단' }, ...]
 */
export async function getTimeline(issueId: string): Promise<{ data: TimelinePoint[] }> {
    const res = await fetch(`/api/issues/${issueId}/timeline`)
    if (!res.ok) throw new Error('타임라인 조회 실패')
    return res.json()
}

// 출처 API 응답 형태 (뉴스, 커뮤니티 따로)
interface SourcesResponse {
    news: NewsData[]        // 뉴스 출처 목록
    community: CommunityData[] // 커뮤니티 출처 목록
}

/**
 * getSources - 출처 목록 조회
 * 
 * GET /api/issues/[id]/sources 를 호출해서 이슈 관련 뉴스·커뮤니티 링크를 가져옵니다.
 * 이슈 상세 페이지 하단에 "관련 뉴스", "관련 커뮤니티" 링크 목록을 보여줄 때 사용합니다.
 * 
 * 예시:
 *   const { news, community } = await getSources('abc-123')
 *   // news = [{ title, link, source, published_at }, ...]
 *   // community = [{ title, url, view_count, comment_count }, ...]
 */
export async function getSources(issueId: string): Promise<SourcesResponse> {
    const res = await fetch(`/api/issues/${issueId}/sources`)
    if (!res.ok) throw new Error('출처 조회 실패')
    return res.json()
}
