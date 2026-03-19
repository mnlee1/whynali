/**
 * app/terms/page.tsx
 *
 * 서비스 이용약관 공개 페이지
 */

export const metadata = {
    title: '서비스 이용약관 | 왜난리',
}

export default function TermsPage() {
    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl">
            <h1 className="text-2xl font-bold mb-8">서비스 이용약관</h1>

            <div className="prose prose-sm max-w-none space-y-6 text-gray-700">
                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제1조 목적 및 범위</h2>
                    <p>
                        본 서비스(왜난리)는 한국의 주요 이슈를 확인하고 여론을 파악하기 위한 정보 제공 서비스입니다.
                        본 약관은 왜난리 서비스의 이용 조건 및 절차, 이용자와 운영자의 권리·의무를 규정합니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제2조 이용자의 의무</h2>
                    <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>욕설, 혐오 표현, 허위 정보 유포</li>
                        <li>타인의 명예를 훼손하거나 권리를 침해하는 행위</li>
                        <li>서비스 운영을 방해하는 행위</li>
                        <li>타인의 계정을 도용하거나 개인정보를 무단 수집하는 행위</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제3조 운영자 콘텐츠 관리 권한</h2>
                    <p>
                        운영자는 서비스 품질 유지를 위해 부적절한 콘텐츠를 사전 고지 없이 삭제하거나 제한할 수 있습니다.
                        반복적인 약관 위반 시 서비스 이용이 제한될 수 있습니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제4조 서비스 변경 및 중단</h2>
                    <p>
                        서비스는 운영상·기술상 필요에 의해 사전 고지 후 변경되거나 중단될 수 있습니다.
                        단, 긴급한 경우에는 사후 고지할 수 있습니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제5조 책임 제한</h2>
                    <p>
                        운영자는 천재지변, 서비스 장애, 이용자 귀책 사유로 발생한 손해에 대해 책임을 지지 않습니다.
                        이용자가 서비스 내에 게시한 정보·자료의 신뢰성·정확성에 대해서도 책임지지 않으며,
                        이용자 간 또는 이용자와 제3자 사이의 분쟁에 대해 개입하지 않습니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제6조 준거법 및 관할 법원</h2>
                    <p>
                        본 약관은 대한민국 법률에 따라 해석되고 적용됩니다.
                        서비스 이용과 관련하여 분쟁이 발생한 경우 서울중앙지방법원을 전속 관할 법원으로 합니다.
                    </p>
                </section>

                <p className="text-xs text-gray-400 pt-4 border-t">시행일: 2025년 1월 1일</p>
            </div>

            <div className="mt-8">
                <a href="/" className="text-sm text-blue-500 hover:underline">← 홈으로</a>
            </div>
        </div>
    )
}
