/**
 * app/admin/issues/track-a/page.tsx
 * 
 * [관리자 - 트랙 A 이슈 관리 페이지]
 * 
 * 새로운 트랙 A 프로세스로 생성된 이슈 전용 관리 페이지
 */

'use client'

import { useState, useEffect } from 'react'
import type { Issue } from '@/types/issue'
import IssuePreviewDrawer from '@/components/admin/IssuePreviewDrawer'
import { decodeHtml } from '@/lib/utils/decode-html'
import StatusBadge from '@/components/common/StatusBadge'
import CategoryBadge from '@/components/common/CategoryBadge'

type SortField = 'title' | 'status' | 'approval_status' | 'heat_index' | 'created_at'
type SortOrder = 'asc' | 'desc'

export default function TrackAIssuesPage() {
    const [issues, setIssues] = useState<Issue[]>([])
    const [filter, setFilter] = useState<string>('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
    const [previewIssue, setPreviewIssue] = useState<Issue | null>(null)
    const [sortField, setSortField] = useState<SortField>('created_at')
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

    useEffect(() => {
        fetchIssues()
    }, [filter])

    useEffect(() => {
        if (issues.length > 0) {
            setIssues(sortIssues(issues))
        }
    }, [sortField, sortOrder])

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

    const fetchIssues = async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams()
            params.append('source_track', 'track_a')
            if (filter) {
                params.append('approval_status', filter)
            }
            
            const url = `/api/admin/issues?${params.toString()}`
            const response = await fetch(url)
            if (!response.ok) throw new Error('이슈 조회 실패')
            const data = await response.json()
            const list: Issue[] = data.data ?? []
            setIssues(sortIssues(list))
            setLastRefreshedAt(new Date())
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
            return {
                label: '승인',
                className: 'bg-green-100 text-green-700 border-green-200'
            }
        }
        
        if (issue.approval_status === '반려') {
            return {
                label: '반려',
                className: 'bg-red-100 text-red-700 border-red-200'
            }
        }
        
        return {
            label: issue.approval_status,
            className: 'bg-gray-100 text-gray-700 border-gray-200'
        }
    }

    const getHeatMeta = (heat: number | null | undefined): { label: string; className: string } => {
        if (heat == null) return { label: '-', className: 'text-gray-400' }
        
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
            className = 'text-gray-500'
        } else {
            label = `${heat}점`
            className = 'text-gray-400'
        }
        
        return { label, className }
    }

    if (loading) {
        return (
            <div>
                <p className="text-gray-500">로딩 중...</p>
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                <div>
                    <h1 className="text-2xl font-bold">트랙 A 이슈 관리</h1>
                    <p className="text-sm text-gray-600 mt-1">커뮤니티 급증 기반 AI 검증 이슈</p>
                </div>
                <div className="flex items-center gap-3">
                    {lastRefreshedAt && (
                        <span className="text-xs text-gray-400">
                            마지막 갱신: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <button
                        onClick={fetchIssues}
                        className="px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                        새로고침
                    </button>
                </div>
            </div>

            {/* 트랙 A 프로세스 기준 안내 */}
            <div className="mb-6 p-6 bg-purple-50 border border-purple-200 rounded-lg">
                <h2 className="text-lg font-bold text-purple-900 mb-4">트랙 A 이슈 생성 기준 (신규 프로세스)</h2>
                
                <div className="space-y-4">
                    <div className="p-4 bg-white border border-purple-100 rounded">
                        <h3 className="font-semibold text-purple-900 mb-3 text-sm flex items-center gap-2">
                            <span className="text-purple-600">💬</span>
                            트랙 A: 커뮤니티 급증 감지 (3분 주기)
                        </h3>
                        <div className="space-y-3 ml-4">
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">1단계:</span>
                                <p className="text-xs text-gray-700">
                                    커뮤니티 글에서 <span className="font-semibold">24시간간 특정 키워드가 3건 이상</span> 급증하면 감지
                                    <span className="block text-gray-500 mt-1">
                                        (테스트 환경: 임계값 3건, 윈도우 24시간 - 프로덕션 환경에서는 10분간 10건으로 조정 예정)
                                    </span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">2단계:</span>
                                <p className="text-xs text-gray-700">
                                    <span className="font-semibold text-purple-700">AI가 진짜 이슈인지 검증</span> (밈, 드립, jpg 같은 무의미한 키워드 자동 필터링, 신뢰도 70% 이상)
                                    <span className="block text-gray-500 mt-1">• 키워드 메타데이터만 사용 (법적 안전)</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">3단계:</span>
                                <p className="text-xs text-gray-700">
                                    네이버 뉴스를 검색해서 <span className="font-semibold">관련 뉴스 1건 이상</span> 확인 (언론 팩트 체크)
                                    <span className="block text-gray-500 mt-1">• 최근 30일 이내 뉴스만 검색</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">4단계:</span>
                                <p className="text-xs text-gray-700">
                                    <span className="font-semibold text-blue-700">AI가 뉴스 필터링</span> - 키워드와 무관한 뉴스 제거
                                    <span className="block text-gray-500 mt-1">• 예: "WBC" 검색 시 "WBC 이탈리아", "WBC 멕시코" 등 한국과 무관한 뉴스 자동 필터링</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">5단계:</span>
                                <p className="text-xs text-gray-700">
                                    <span className="font-semibold text-green-700">관련 뉴스 제목 기반 이슈 제목 생성</span>
                                    <span className="block text-gray-500 mt-1">• AI가 필터링된 뉴스 제목들을 분석하여 정확한 이슈 제목 생성 (뉴스 헤드라인 스타일)</span>
                                    <span className="block text-gray-500 mt-1">• 예: "WBC 한국 8강 확정" (관련 뉴스 9건 분석)</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">6단계:</span>
                                <p className="text-xs text-gray-700">
                                    <span className="font-semibold text-blue-700">AI 중복 체크 (4단계)</span>
                                    <span className="block text-gray-500 mt-1">• 1단계: 정확한 제목 일치 → 2단계: 키워드 필터링 (공통 2개 이상)</span>
                                    <span className="block text-gray-500 mt-1">• 3단계: 반대어/연속사건 감지 ("복귀" vs "사퇴", "1차" vs "2차")</span>
                                    <span className="block text-gray-500 mt-1">• 4단계: AI 정밀 비교 (신뢰도 80% 이상)</span>
                                    <span className="block text-gray-500 mt-1">• 중복 발견 시: 기존 이슈에 필터링된 데이터만 추가</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">7단계:</span>
                                <p className="text-xs text-gray-700">
                                    <span className="font-semibold text-orange-700">AI가 커뮤니티 글 필터링 (이슈 등록 전)</span>
                                    <span className="block text-gray-500 mt-1">• 이슈 제목과 관련된 커뮤니티 글만 선별</span>
                                    <span className="block text-gray-500 mt-1">• 예: "WBC 한국 8강" 이슈 → "WBC 이탈리아" 글 제외</span>
                                    <span className="block text-red-600 mt-1">• 관련 글 0건이면 이슈 생성 건너뛰기 (효율성)</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">8단계:</span>
                                <p className="text-xs text-gray-700">
                                    <span className="font-semibold text-blue-700">이슈 등록</span> (필터링된 관련 커뮤니티 글 보장)
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">9단계:</span>
                                <p className="text-xs text-gray-700">
                                    커뮤니티 글 연결 (이미 필터링됨)
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">10단계:</span>
                                <p className="text-xs text-gray-700">
                                    뉴스 연결 (필터링된 관련 뉴스만)
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">11단계:</span>
                                <p className="text-xs text-gray-700">
                                    <span className="font-semibold text-amber-700">타임라인 자동 생성 (필수)</span>
                                    <span className="block text-gray-500 mt-1">• 연결된 뉴스 기준으로 발단/전개 단계 자동 생성</span>
                                    <span className="block text-gray-500 mt-1">• 타임라인 생성 실패 시 이슈 삭제</span>
                                </p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-600 font-semibold text-xs">12단계:</span>
                                <p className="text-xs text-gray-700">
                                    화력 15점 이상 확인 후 <span className="font-semibold text-amber-700">'대기' 상태로 등록 완료</span>
                                    <span className="block text-gray-500 mt-1">• 15점 미만이면 이슈 삭제</span>
                                    <span className="block text-red-600 mt-1">• 트랙 A는 자동 승인 없음 (관리자 승인 필수)</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-green-50 border border-green-200 rounded">
                        <h3 className="font-semibold text-green-900 mb-3 text-sm">✅ 트랙 A 개선 효과</h3>
                        <ul className="space-y-2 text-xs text-gray-700 ml-4">
                            <li>• <span className="font-semibold">뉴스 필터링</span>: AI가 키워드와 관련 없는 뉴스 자동 제거 (정확도 대폭 향상)</li>
                            <li>• <span className="font-semibold">커뮤니티 필터링</span>: AI가 이슈와 무관한 커뮤니티 글 자동 제거 (이슈 등록 전 필터링으로 효율성 향상)</li>
                            <li>• <span className="font-semibold">이슈 제목 품질</span>: 실제 뉴스 제목 기반 생성으로 팩트 체크됨</li>
                            <li>• <span className="font-semibold">타임라인 필수</span>: 모든 이슈가 타임라인 포함 (생성 실패 시 이슈 삭제)</li>
                            <li>• <span className="font-semibold">법적 안전</span>: 커뮤니티 게시글 내용 사용 안 함 (메타데이터만 사용)</li>
                            <li>• <span className="font-semibold">중복 방지 (4단계)</span>: 제목 일치 → 키워드 필터 → 반대어/숫자 감지 → AI 정밀 비교 (신뢰도 80%)</li>
                        </ul>
                    </div>

                    <div className="p-4 bg-amber-50 border border-amber-200 rounded">
                        <h3 className="font-semibold text-amber-900 mb-3 text-sm">⚠️ 관리자 확인 포인트</h3>
                        <ul className="space-y-2 text-xs text-gray-700 ml-4">
                            <li>• <span className="font-semibold">이슈 제목</span>: 뉴스 기반 생성으로 정확하지만, 맥락 확인 필요</li>
                            <li>• <span className="font-semibold">연결된 뉴스</span>: AI 필터링으로 관련 뉴스만 연결 (무관한 뉴스 제거됨)</li>
                            <li>• <span className="font-semibold">연결된 커뮤니티</span>: AI 필터링으로 관련 글만 연결 (무관한 글 제거됨)</li>
                            <li>• <span className="font-semibold">타임라인</span>: 발단/전개가 논리적으로 연결되는지 확인 (자동 생성)</li>
                            <li>• <span className="font-semibold">중복 체크</span>: AI가 4단계 검증했지만 최종 확인 권장</li>
                        </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-blue-50 rounded border border-blue-200">
                            <p className="text-xs font-medium text-blue-800 mb-1">화력 기준</p>
                            <p className="text-xs text-gray-700">15점 이상 (이슈 등록 최소 기준)</p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded border border-purple-200">
                            <p className="text-xs font-medium text-purple-800 mb-1">승인 정책</p>
                            <p className="text-xs text-gray-700">자동 승인 없음 (관리자 필수)</p>
                        </div>
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                            <p className="text-xs font-medium text-green-800 mb-1">타임라인</p>
                            <p className="text-xs text-gray-700">모든 이슈에 필수 (없으면 삭제)</p>
                        </div>
                        <div className="p-3 bg-red-50 rounded border border-red-200">
                            <p className="text-xs font-medium text-red-800 mb-1">법적 안전</p>
                            <p className="text-xs text-gray-700">메타데이터만 사용 (콘텐츠 미사용)</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 필터 */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="flex flex-wrap gap-2">
                    {[
                        { value: '', label: '전체' },
                        { value: '대기', label: '대기' },
                        { value: '승인', label: '승인' },
                        { value: '반려', label: '반려' },
                    ].map(({ value, label }) => (
                        <button
                            key={label}
                            onClick={() => setFilter(value)}
                            className={`px-3 py-1.5 rounded text-sm ${
                                filter === value
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 이슈 목록 */}
            <div className="border rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                <button
                                    onClick={() => handleSort('title')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    제목
                                    {sortField === 'title' && (
                                        <span className="text-purple-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">
                                카테고리
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">
                                <button
                                    onClick={() => handleSort('status')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    상태
                                    {sortField === 'status' && (
                                        <span className="text-purple-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">
                                <button
                                    onClick={() => handleSort('approval_status')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    승인
                                    {sortField === 'approval_status' && (
                                        <span className="text-purple-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">
                                <button
                                    onClick={() => handleSort('heat_index')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    화력
                                    {sortField === 'heat_index' && (
                                        <span className="text-purple-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">
                                <button
                                    onClick={() => handleSort('created_at')}
                                    className="flex items-center gap-1 hover:text-gray-700"
                                >
                                    생성일
                                    {sortField === 'created_at' && (
                                        <span className="text-purple-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </button>
                            </th>
                            <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase w-24">
                                액션
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {issues.map((issue) => (
                            <tr key={issue.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm font-medium">
                                    <a
                                        href={`/issue/${issue.id}`}
                                        target="_blank"
                                        className="text-blue-600 hover:underline"
                                    >
                                        {decodeHtml(issue.title)}
                                    </a>
                                </td>
                                <td className="px-4 py-3 w-28">
                                    <CategoryBadge category={issue.category} size="sm" />
                                </td>
                                <td className="px-4 py-3 w-32 whitespace-nowrap">
                                    <StatusBadge status={issue.status} />
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap w-32">
                                    {(() => {
                                        const approvalMeta = getApprovalDisplay(issue)
                                        return (
                                            <span className={`px-2 py-1 text-xs rounded border font-medium ${approvalMeta.className}`}>
                                                {approvalMeta.label}
                                            </span>
                                        )
                                    })()}
                                </td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap w-24">
                                    {(() => {
                                        const heatMeta = getHeatMeta(issue.heat_index)
                                        return (
                                            <span className={heatMeta.className}>
                                                {heatMeta.label}
                                            </span>
                                        )
                                    })()}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap w-40">
                                    {formatDate(issue.created_at)}
                                </td>
                                <td className="px-2 py-3 text-sm w-24">
                                    <div className="flex justify-center gap-1">
                                        <div className="relative group">
                                            <button
                                                onClick={() => setPreviewIssue(issue)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            </button>
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                미리보기
                                            </span>
                                        </div>
                                        
                                        {issue.approval_status === '대기' && (
                                            <>
                                                <div className="relative group">
                                                    <button
                                                        onClick={() => handleApprove(issue.id)}
                                                        className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </button>
                                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                        승인
                                                    </span>
                                                </div>
                                                <div className="relative group">
                                                    <button
                                                        onClick={() => handleReject(issue.id)}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                        반려
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                        
                                        {issue.approval_status === '승인' && (
                                            <div className="relative group">
                                                <button
                                                    onClick={() => handleReject(issue.id)}
                                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                    반려
                                                </span>
                                            </div>
                                        )}
                                        
                                        {issue.approval_status === '반려' && (
                                            <div className="relative group">
                                                <button
                                                    onClick={() => handleRestore(issue.id)}
                                                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                </button>
                                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                    복구
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {issues.length === 0 && (
                <p className="text-center py-8 text-gray-500">트랙 A 이슈가 없습니다</p>
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
