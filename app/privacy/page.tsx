/**
 * app/privacy/page.tsx
 *
 * 개인정보 처리방침 공개 페이지
 */

export const metadata = {
    title: '개인정보 처리방침 | 왜난리',
}

export default function PrivacyPage() {
    return (
        <div className="container mx-auto px-4 py-12 max-w-2xl">
            <h1 className="text-2xl font-bold mb-8">개인정보 처리방침</h1>

            <div className="prose prose-sm max-w-none space-y-6 text-gray-700">
                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제1조 수집하는 개인정보 항목</h2>
                    <p>왜난리는 서비스 제공을 위해 다음과 같은 최소한의 개인정보를 수집합니다.</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>소셜 계정 식별자 (Google, Kakao, Naver 고유 ID)</li>
                        <li>이메일 주소 (소셜 로그인 제공 시)</li>
                        <li>닉네임 (서비스 내 표시용, 직접 설정)</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제2조 개인정보 수집 및 이용 목적</h2>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>서비스 이용자 식별 및 인증</li>
                        <li>댓글, 투표 등 참여형 서비스 기능 제공</li>
                        <li>서비스 품질 개선 및 이용 통계 분석</li>
                        <li>마케팅 수신 동의 시 서비스 관련 안내 발송</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제3조 개인정보 보유 및 이용 기간</h2>
                    <p>
                        수집된 개인정보는 회원 탈퇴 시까지 보유합니다.
                        단, 관계 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보유합니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제4조 개인정보 제3자 제공</h2>
                    <p>
                        왜난리는 이용자의 개인정보를 제3자에게 제공하지 않습니다.
                        단, 이용자의 사전 동의가 있거나 법령에 의한 경우는 예외입니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제5조 개인정보 처리 위탁</h2>
                    <p>왜난리는 서비스 운영을 위해 다음 업체에 개인정보 처리를 위탁합니다.</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>Supabase Inc. — 사용자 인증 및 데이터 저장</li>
                        <li>Vercel Inc. — 서비스 호스팅</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제6조 이용자 권리</h2>
                    <p>
                        이용자는 언제든지 개인정보 열람, 정정, 삭제를 요청할 수 있습니다.
                        요청은 서비스 내 탈퇴 기능을 이용하거나 아래 담당자에게 문의하여 처리합니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-lg font-semibold text-gray-900 mb-2">제7조 개인정보 보호 담당자</h2>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>담당: 왜난리 운영팀</li>
                        <li>이메일: whynali.contact@gmail.com</li>
                    </ul>
                    <p className="mt-2 text-sm">
                        개인정보와 관련한 불만, 피해 구제는 위 연락처로 문의하시거나
                        개인정보분쟁조정위원회(www.kopico.go.kr) 또는 한국인터넷진흥원(privacy.kisa.or.kr)에 신청하실 수 있습니다.
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
