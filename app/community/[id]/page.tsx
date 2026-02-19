export default function DiscussionTopicPage({ params }: { params: { id: string } }) {
    return (
        <div className="container mx-auto px-4 py-6 md:py-8">
            <h1 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6">토론 주제 상세</h1>
            <p className="text-sm md:text-base text-gray-600">토론 주제 ID: {params.id}</p>
            <p className="text-sm md:text-base text-gray-600 mt-4">
                토론 댓글, 해당 이슈 보기 링크 등 API 연동 예정
            </p>
        </div>
    )
}
