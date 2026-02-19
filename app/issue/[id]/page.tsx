export default function IssuePage({ params }: { params: { id: string } }) {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">이슈 상세</h1>
            <p className="text-sm md:text-base text-gray-600">이슈 ID: {params.id}</p>
            <p className="text-sm md:text-base text-gray-600 mt-4">
                화력, 타임라인, 댓글, 투표 등 API 연동 예정
            </p>
        </div>
    )
}
