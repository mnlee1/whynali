/**
 * app/admin/issues/page.tsx
 * 
 * [관리자 - 이슈 관리 페이지]
 * 
 * 자동/수동 생성된 이슈를 관리합니다.
 * 이슈 승인·거부·수정·삭제 기능을 제공합니다.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Issue } from '@/types/issue'
import IssuePreviewDrawer from '@/components/admin/IssuePreviewDrawer'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'
import CategoryBadge from '@/components/common/CategoryBadge'
import AdminTabFilter from '@/components/admin/AdminTabFilter'

type SortField = 'title' | 'status' | 'approval_status' | 'heat_index' | 'created_at'
type SortOrder = 'asc' | 'desc'
type FilterValue = '' | '대기' | '승인전체' | '자동승인' | '관리자승인' | '관리자반려'

const FILTER_LABELS: { value: FilterValue; label: string }[] = [
    { value: '', label: '전체' },
    { value: '대기', label: '대기' },
    { value: '승인전체', label: '승인 전체' },
    { value: '자동승인', label: '자동 승인' },
    { value: '관리자승인', label: '관리자 승인' },
    { value: '관리자반려', label: '관리자 반려' },
]

const TAB_API_PARAMS: Record<FilterValue, Record<string, string>> = {
    '': {},
    '대기': { approval_status: '대기' },
    '승인전체': { approval_status: '승인' },
    '자동승인': { approval_status: '승인', approval_type: 'auto' },
    '관리자승인': { approval_status: '승인', approval_type: 'manual' },
    '관리자반려': { approval_status: '반려', approval_type: 'manual' },
}

export default function AdminIssuesPage() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [filter, setFilter] = useState<FilterValue>('대기')
    const [tabCounts, setTabCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [previewIssue, setPreviewIssue] = useState<Issue | null>(null)
    const [criteriaOpen, setCriteriaOpen] = useState(false)
    const [sortField, setSortField] = useState<SortField>('created_at')
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

    const STATUS_ORDER: Record<string, number> = { '대기': 0, '승인': 1, '반려': 2 }

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortOrder('desc')
        }
    }

    const sortIssues = (list: Issue[]) => {
        return [...list].sort((a, b) => {
            let compareResult = 0

            switch (sortField) {
                case 'title':
                    compareResult = a.title.localeCompare(b.title)
                    break
                case 'status':
                    compareResult = a.status.localeCompare(b.status)
                    break
                case 'approval_status':
                    compareResult = (STATUS_ORDER[a.approval_status] ?? 9) - (STATUS_ORDER[b.approval_status] ?? 9)
                    break
                case 'heat_index':
                    compareResult = (a.heat_index ?? 0) - (b.heat_index ?? 0)
                    break
                case 'created_at':
                    compareResult = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    break
            }

            return sortOrder === 'asc' ? compareResult : -compareResult
        })
    }

    const loadTabCounts = useCallback(async () => {
        try {
            const results = await Promise.all(
                FILTER_LABELS.map(({ value }) => {
                    const p = new URLSearchParams({ limit: '1', offset: '0', ...TAB_API_PARAMS[value] })
                    return fetch(`/api/admin/issues?${p}`).then(r => r.ok ? r.json() : null)
                })
            )
            const counts: Record<string, number> = {}
            FILTER_LABELS.forEach(({ value }, i) => {
                counts[value] = results[i]?.total ?? 0
            })
            setTabCounts(counts)
        } catch {
            // 카운트 로드 실패 시 무시
        }
    }, [])

    useEffect(() => {
        loadTabCounts()
    }, [loadTabCounts])

    useEffect(() => {
        fetchIssues()
    }, [filter])

    useEffect(() => {
        if (issues.length > 0) {
            setIssues(sortIssues(issues))
        }
    }, [sortField, sortOrder])

    const fetchIssues = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams()
            
            // 필터 값에 따라 approval_status와 approval_type 설정
            if (filter) {
                if (filter === '승인전체') {
                    // 승인 전체: 자동 승인 + 관리자 승인 모두
                    params.append('approval_status', '승인')
                } else if (filter === '자동승인') {
                    // 자동 승인만
                    params.append('approval_status', '승인')
                    params.append('approval_type', 'auto')
                } else if (filter === '관리자승인') {
                    // 관리자 승인만
                    params.append('approval_status', '승인')
                    params.append('approval_type', 'manual')
                } else if (filter === '관리자반려') {
                    // 관리자 반려만
                    params.append('approval_status', '반려')
                    params.append('approval_type', 'manual')
                } else {
                    // 대기 또는 기타
                    params.append('approval_status', filter)
                }
            }
            
            const url = `/api/admin/issues?${params.toString()}`
            console.log('[관리자 이슈] API 호출:', url)
            const response = await fetch(url)
            if (!response.ok) throw new Error('이슈 조회 실패')
            const data = await response.json()
            const list: Issue[] = data.data ?? []
            console.log('[관리자 이슈] 응답:', list.length, '개 이슈')
            if (list.length > 0) {
                console.log('[관리자 이슈] 첫 번째 이슈:', {
                    title: list[0].title,
                    approval_status: list[0].approval_status,
                    approval_type: list[0].approval_type,
                })
            }
            setIssues(sortIssues(list))
        } catch (err) {
            setError(err instanceof Error ? err.message : '오류 발생')
        } finally {
            setLoading(false)
        }
    }

    const handleApprove = async (id: string) => {
        if (!confirm('이 이슈를 승인하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/approve`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('승인 실패')
            alert('승인되었습니다')
            fetchIssues()
            loadTabCounts()
        } catch (err) {
            alert(err instanceof Error ? err.message : '승인 실패')
        }
    }

    const handleReject = async (id: string) => {
        if (!confirm('이 이슈를 거부하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/reject`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('거부 실패')
            alert('거부되었습니다')
            fetchIssues()
            loadTabCounts()
        } catch (err) {
            alert(err instanceof Error ? err.message : '거부 실패')
        }
    }

    const handleRestore = async (id: string) => {
        if (!confirm('이 이슈를 대기 상태로 복구하시겠습니까?')) return

        try {
            const response = await fetch(`/api/admin/issues/${id}/restore`, {
                method: 'POST',
            })
            if (!response.ok) throw new Error('복구 실패')
            fetchIssues()
            loadTabCounts()
        } catch (err) {
            alert(err instanceof Error ? err.message : '복구 실패')
        }
    }

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const hour = String(date.getHours()).padStart(2, '0')
        const minute = String(date.getMinutes()).padStart(2, '0')
        return `${year}-${month}-${day} ${hour}:${minute}`
    }

    const getApprovalDisplay = (issue: Issue): { label: string; className: string } => {
        if (issue.approval_status === '대기') {
            return {
                label: '대기',
                className: 'bg-yellow-100 text-yellow-700 border-yellow-200'
            }
        }
        
        if (issue.approval_status === '승인') {
            // approval_type으로 자동/관리자 구분
            if (issue.approval_type === 'auto') {
                return {
                    label: '자동 승인',
                    className: 'bg-blue-100 text-blue-700 border-blue-200'
                }
            } else {
                return {
                    label: '관리자 승인',
                    className: 'bg-green-100 text-green-700 border-green-200'
                }
            }
        }
        
        if (issue.approval_status === '반려') {
            // approval_type으로 자동/관리자 구분
            if (issue.approval_type === 'auto') {
                return {
                    label: '자동 반려',
                    className: 'bg-gray-100 text-gray-700 border-gray-200'
                }
            } else {
                return {
                    label: '관리자 반려',
                    className: 'bg-red-100 text-red-700 border-red-200'
                }
            }
        }
        
        return {
            label: issue.approval_status,
            className: 'bg-gray-100 text-gray-700 border-gray-200'
        }
    }

    const getHeatMeta = (heat: number | null | undefined): { label: string; className: string } => {
        if (heat == null) return { label: '-', className: 'text-content-muted' }
        
        let label = ''
        let className = ''
        
        if (heat >= 70) {
            label = `${heat}점`
            className = 'font-semibold text-red-600'
        } else if (heat >= 30) {
            label = `${heat}점`
            className = 'font-medium text-amber-600'
        } else if (heat >= 15) {
            label = `${heat}점`
            className = 'text-content-secondary'
        } else {
            label = `${heat}점`
            className = 'text-content-muted'
        }
        
        return { label, className }
    }

    if (loading) {
        return (
            <div>
                <p className="text-content-secondary">로딩 중...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div>
                <p className="text-red-600">{error}</p>
            </div>
        )
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-content-primary">이슈 관리</h1>
            </div>

            {/* 이슈 생성 프로세스 안내 */}
            <div className="mb-6 border border-border rounded-xl overflow-hidden">
                <button
                    onClick={() => setCriteriaOpen(prev => !prev)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left bg-surface-subtle hover:bg-surface-muted transition-colors"
                >
                    <h2 className="text-sm font-bold text-content-primary">이슈 생성 프로세스 안내</h2>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`text-content-muted transition-transform duration-200 ${criteriaOpen ? 'rotate-180' : ''}`}
                    >
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </button>

                {criteriaOpen && <div className="px-4 pb-4 space-y-4 border-t border-border">
                    <div className="p-4 bg-surface border border-border rounded-xl mt-4">
                        <h3 className="font-semibold text-content-primary mb-3 text-sm flex items-center gap-2">
                            <span className="text-primary">💬</span>
                            커뮤니티 급증 감지 (10분 주기) <span className="font-normal text-amber-600">※ 현재 임시: 1시간 주기 (AI API 비용 절감)</span>
                        </h3>
                        <div className="space-y-3 ml-4">
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">1단계:</span>
                                <p className="text-xs text-content-primary">
                                    커뮤니티 글에서 <span className="font-semibold">10분간 특정 키워드가 10건 이상</span> 급증하면 감지
                                    <span className="block text-content-secondary mt-1">
                                        (임계값: 10건, 시간창: 10분)
                                    </span>
                                    <span className="block text-amber-600 mt-1">
                                        ※ 현재 임시 적용: 3건 (이슈 수집량 확보를 위해 완화)
                                    </span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">2단계:</span>
                                <p className="text-xs text-content-primary">
                                    <span className="font-semibold text-primary-dark">AI가 진짜 이슈인지 검증</span> (밈, 드립, jpg 같은 무의미한 키워드 자동 필터링, 신뢰도 70% 이상)
                                    <span className="block text-content-secondary mt-1">• 키워드 메타데이터만 사용 (법적 안전)</span>
                                    <span className="block text-content-secondary mt-1">• AI가 임시 제목 및 검색 키워드 제안</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">3단계:</span>
                                <p className="text-xs text-content-primary">
                                    네이버 뉴스를 검색해서 <span className="font-semibold">관련 뉴스 1건 이상</span> 확인 (언론 팩트 체크)
                                    <span className="block text-content-secondary mt-1">• 최근 30일 이내 뉴스만 검색</span>
                                    <span className="block text-content-secondary mt-1">• 뉴스 0건이면 등록 보류 (루머 가능성)</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">4단계:</span>
                                <p className="text-xs text-content-primary">
                                    <span className="font-semibold text-blue-700">AI 중복 체크 (4단계 검증)</span>
                                    <span className="block text-content-secondary mt-1">• 1단계: 정확한 제목 일치</span>
                                    <span className="block text-content-secondary mt-1">• 2단계: 키워드 필터링 (공통 키워드 2개 이상)</span>
                                    <span className="block text-content-secondary mt-1">• 3단계: 반대어/연속사건 감지 ("복귀" vs "사퇴", "1차" vs "2차")</span>
                                    <span className="block text-content-secondary mt-1">• 4단계: AI 정밀 비교 (신뢰도 80% 이상)</span>
                                    <span className="block text-blue-600 mt-1">• 중복 발견 시: 커뮤니티 글만 기존 이슈에 추가 (새 이슈 생성 안 함)</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">5단계:</span>
                                <p className="text-xs text-content-primary">
                                    <span className="font-semibold text-orange-700">AI 통합 작업: 뉴스 필터링 + 커뮤니티 필터링 + 최종 제목 생성</span>
                                    <span className="block text-content-secondary mt-1">• AI가 키워드와 무관한 뉴스 제거 (예: "WBC" 검색 시 "WBC 이탈리아" 제외)</span>
                                    <span className="block text-content-secondary mt-1">• AI가 이슈 제목과 무관한 커뮤니티 글 제거</span>
                                    <span className="block text-content-secondary mt-1">• AI가 필터링된 뉴스 제목들을 분석하여 최종 이슈 제목 생성 (8-15자, 사실 중심)</span>
                                    <span className="block text-red-600 mt-1">• 관련 커뮤니티 글 0건이면 이슈 생성 건너뛰기</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">6단계:</span>
                                <p className="text-xs text-content-primary">
                                    <span className="font-semibold text-blue-700">이슈 등록</span> (대기 상태로 생성)
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">7단계:</span>
                                <p className="text-xs text-content-primary">
                                    커뮤니티 글 연결 (이미 필터링됨)
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">8단계:</span>
                                <p className="text-xs text-content-primary">
                                    뉴스 연결 (필터링된 관련 뉴스만)
                                    <span className="block text-red-600 mt-1">• 연결된 뉴스 0건이면 이슈 삭제 (다른 이슈에 이미 연결됨)</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">9단계:</span>
                                <p className="text-xs text-content-primary">
                                    <span className="font-semibold text-amber-700">타임라인 자동 생성 (필수)</span>
                                    <span className="block text-content-secondary mt-1">• 연결된 뉴스 기준으로 발단/전개 단계 자동 생성 (최대 5개)</span>
                                    <span className="block text-red-600 mt-1">• 타임라인 생성 실패 시 이슈 삭제</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-primary font-semibold text-xs">10단계:</span>
                                <p className="text-xs text-content-primary">
                                    화력 계산 및 최종 승인 판단
                                    <span className="block text-red-600 mt-1">• 화력 15점 미만이면 이슈 삭제 (등록하지 않음)</span>
                                    <span className="block text-amber-600 mt-1">※ 현재 임시 적용: 8점 (이슈 수집량 확보를 위해 완화)</span>
                                    <span className="block text-content-secondary mt-1">• 화력 30점 이상 + 자동 승인 카테고리(사회/경제/기술/세계/스포츠) → 자동 승인</span>
                                    <span className="block text-amber-600 mt-1">• 그 외(연예/정치는 수동 승인 필수, 또는 화력 15-29점) → 대기 (관리자 승인 필수)</span>
                                    <span className="block text-blue-600 mt-1">• 등록 후 화력이 15점 미만으로 떨어져도 대기 상태 유지 (자동 반려 안 함)</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                            <p className="text-xs font-medium text-blue-800 mb-1">급증 임계값</p>
                            <p className="text-xs text-content-primary">10분간 10건 이상 <span className="text-amber-600">(임시: 3건)</span></p>
                        </div>
                        <div className="p-3 bg-surface-subtle rounded-xl border border-border">
                            <p className="text-xs font-medium text-content-secondary mb-1">화력 기준</p>
                            <p className="text-xs text-content-primary">15점 이상 <span className="text-amber-600">(임시: 8점)</span></p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                            <p className="text-xs font-medium text-green-800 mb-1">승인 정책</p>
                            <p className="text-xs text-content-primary">화력 30점 이상 + 자동 승인 카테고리 (사회/경제/기술/세계/스포츠, 연예/정치는 수동 필수)</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                            <p className="text-xs font-medium text-red-800 mb-1">품질 관리</p>
                            <p className="text-xs text-content-primary">화력 15점 미만, 뉴스 0건, 커뮤니티 0건, 타임라인 실패 시 자동 삭제</p>
                        </div>
                    </div>
                </div>}
            </div>

            {/* 필터 */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <AdminTabFilter
                    tabs={FILTER_LABELS}
                    active={filter}
                    counts={tabCounts}
                    onChange={setFilter}
                />
            </div>

            {/* 이슈 목록 */}
            <div className="border border-border rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-subtle">
                        <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase">
                                <button
                                    onClick={() => handleSort('title')}
                                    className="flex items-center gap-1 hover:text-content-secondary"
                                >
                                    제목
                                    {sortField === 'title' && (
                                        <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase w-24">
                                카테고리
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase w-24">
                                <button
                                    onClick={() => handleSort('status')}
                                    className="flex items-center gap-1 hover:text-content-secondary"
                                >
                                    상태
                                    {sortField === 'status' && (
                                        <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase w-28">
                                <button
                                    onClick={() => handleSort('approval_status')}
                                    className="flex items-center gap-1 hover:text-content-secondary"
                                >
                                    승인
                                    {sortField === 'approval_status' && (
                                        <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase w-36">
                                <button
                                    onClick={() => handleSort('heat_index')}
                                    className="flex items-center gap-1 hover:text-content-secondary"
                                >
                                    <div className="flex flex-col items-start">
                                        <span>화력 추이</span>
                                        <span className="text-sm text-content-muted font-normal normal-case">등록 시 → 현재</span>
                                    </div>
                                    {sortField === 'heat_index' && (
                                        <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-content-muted uppercase w-32">
                                <button
                                    onClick={() => handleSort('created_at')}
                                    className="flex items-center gap-1 hover:text-content-secondary"
                                >
                                    생성일
                                    {sortField === 'created_at' && (
                                        <span className="text-primary">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-2 py-3 text-left text-sm font-medium text-content-muted uppercase w-40">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-surface divide-y divide-border">
                        {issues.map((issue) => (
                            <tr key={issue.id} className="hover:bg-surface-subtle">
                                <td className="px-4 py-3 text-sm font-medium">
                                    <a
                                        href={`/issue/${issue.id}`}
                                        target="_blank"
                                        className="text-primary hover:underline line-clamp-2"
                                    >
                                        {decodeHtml(issue.title)}
                                    </a>
                                </td>
                                <td className="px-4 py-3 w-24 whitespace-nowrap">
                                    <CategoryBadge category={issue.category} size="sm" />
                                </td>
                                <td className="px-4 py-3 w-24 whitespace-nowrap">
                                    <StatusBadge status={issue.status} />
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap w-28">
                                    {(() => {
                                        const approvalMeta = getApprovalDisplay(issue)
                                        return (
                                            <span className={`px-2 py-1 text-xs rounded border font-medium ${approvalMeta.className}`}>
                                                {approvalMeta.label}
                                            </span>
                                        )
                                    })()}
                                </td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap w-36">
                                    {(() => {
                                        const currentHeat = issue.heat_index ?? 0
                                        const createdHeat = issue.created_heat_index
                                        const heatMeta = getHeatMeta(currentHeat)
                                        // 등록 시점 화력은 한 번만 저장되며 이후 변동하지 않음. null이면 현재 화력으로 대체하지 않음(대체 시 재계산마다 변동처럼 보이는 버그)
                                        const diff = createdHeat != null ? currentHeat - createdHeat : 0
                                        const diffIcon = diff > 0 ? '↑' : diff < 0 ? '↓' : ''
                                        const diffColor = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-content-muted'
                                        return (
                                            <div className="flex items-center gap-1">
                                                <span className={createdHeat != null ? heatMeta.className : 'text-content-muted'}>
                                                    {createdHeat != null ? `${createdHeat}점` : '—'}
                                                </span>
                                                <span className="text-content-muted">→</span>
                                                <span className={heatMeta.className}>
                                                    {currentHeat}점
                                                </span>
                                                {createdHeat != null && diff !== 0 && (
                                                    <span className={`text-xs ${diffColor}`}>
                                                        {diffIcon}
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </td>
                                <td className="px-4 py-3 text-sm text-content-secondary whitespace-nowrap w-32">
                                    {formatDate(issue.created_at)}
                                </td>
                                <td className="px-2 py-3 text-sm w-40">
                                    <div className="flex flex-nowrap justify-start gap-1.5">
                                        <button
                                            onClick={() => setPreviewIssue(issue)}
                                            className="btn-neutral btn-sm text-xs whitespace-nowrap"
                                        >
                                            미리보기
                                        </button>

                                        {issue.approval_status === '대기' && (
                                            <>
                                                <button
                                                    onClick={() => handleApprove(issue.id)}
                                                    className="text-xs px-2.5 py-1.5 bg-green-500 text-white rounded-full hover:bg-green-600 whitespace-nowrap"
                                                >
                                                    승인
                                                </button>
                                                <button
                                                    onClick={() => handleReject(issue.id)}
                                                    className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 whitespace-nowrap"
                                                >
                                                    반려
                                                </button>
                                            </>
                                        )}

                                        {issue.approval_status === '승인' && (
                                            <button
                                                onClick={() => handleReject(issue.id)}
                                                className="text-xs px-2.5 py-1.5 bg-orange-500 text-white rounded-full hover:bg-orange-600 whitespace-nowrap"
                                            >
                                                반려
                                            </button>
                                        )}

                                        {issue.approval_status === '반려' && (
                                            <button
                                                onClick={() => handleRestore(issue.id)}
                                                className="btn-neutral btn-sm text-xs whitespace-nowrap"
                                            >
                                                복구
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {issues.length === 0 && (
                <p className="text-center py-8 text-content-secondary">이슈가 없습니다</p>
            )}

            <IssuePreviewDrawer
                issue={previewIssue}
                onClose={() => setPreviewIssue(null)}
                onApprove={handleApprove}
                onReject={handleReject}
            />
        </div>
    )
}
