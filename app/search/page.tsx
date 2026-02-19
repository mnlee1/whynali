export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string }>
}) {
    const resolved = await searchParams
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">검색 결과</h1>
            {resolved.q && (
                <p className="text-sm md:text-base text-gray-600 mb-4">
                    검색어: {resolved.q}
                </p>
            )}
            <p className="text-sm md:text-base text-gray-600">
                이슈 + 토론 주제 통합 검색 API 연동 예정
            </p>
        </div>
    )
}
