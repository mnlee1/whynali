/**
 * app/terms/page.tsx
 *
 * 서비스 이용약관 페이지
 *
 * 카카오·네이버 소셜 로그인 검수 요건 및 정보통신망법 OSP 면책 요건 충족.
 */

export const metadata = {
    title: '서비스 이용약관 | 왜난리',
}

export default function TermsPage() {
    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <h1 className="text-2xl font-bold text-content-primary mb-10">서비스 이용약관</h1>

            <div className="space-y-10 text-gray-700 text-sm leading-relaxed">

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제1조 (목적)</h2>
                    <p>
                        본 약관은 NHN AD(이하 &quot;회사&quot;)가 운영하는 왜난리 서비스(이하 &quot;서비스&quot;,{' '}
                        <a href="https://whynali.com" className="text-blue-600 underline">https://whynali.com</a>)의
                        이용 조건 및 절차, 이용자와 회사의 권리·의무·책임을 규정함을 목적으로 합니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제2조 (용어 정의)</h2>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>서비스</strong>: 한국 이슈를 수집·분석하여 타임라인, 화력 지수, 여론 투표, 토론 등의 기능을 제공하는 왜난리 플랫폼 일체.</li>
                        <li><strong>회원</strong>: 소셜 로그인(Google, 네이버, 카카오)을 통해 가입하고 서비스를 이용하는 자.</li>
                        <li><strong>비회원</strong>: 로그인 없이 서비스를 열람하는 자.</li>
                        <li><strong>게시물</strong>: 회원이 서비스 내에 작성한 댓글, 투표 참여 기록, 토론 의견 등 일체.</li>
                        <li><strong>회사</strong>: NHN AD.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제3조 (서비스 내용)</h2>
                    <p>회사가 제공하는 서비스의 주요 내용은 다음과 같습니다.</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>국내 이슈 화력 분석 및 타임라인 정보 제공</li>
                        <li>네이버 뉴스 API 기반 이슈 정보 표시</li>
                        <li>이슈에 대한 감정 표현(좋아요·싫어요·화나요·팝콘각·응원·애도·사이다)</li>
                        <li>댓글 및 대댓글 작성</li>
                        <li>여론 투표 참여</li>
                        <li>토론(커뮤니티) 기능</li>
                    </ul>
                    <p className="mt-2">이슈 열람은 비회원도 가능하며, 감정 표현·댓글·투표·토론 참여는 로그인 후 이용 가능합니다.</p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제4조 (이용 계약)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            이용 계약은 이용자가 소셜 로그인(Google, 네이버, 카카오)을 통해 서비스에 접속하고,
                            본 약관 및 개인정보처리방침에 동의함으로써 성립합니다.
                        </li>
                        <li>
                            <strong>만 14세 미만은 서비스에 가입하거나 이용할 수 없습니다.</strong>
                        </li>
                        <li>
                            회원은 소셜 계정 1개당 1개의 계정을 보유할 수 있습니다.
                            타인의 계정을 도용하거나 부정한 방법으로 복수 계정을 생성할 수 없습니다.
                        </li>
                        <li>
                            회원 탈퇴는 서비스 내 마이페이지에서 언제든지 신청할 수 있으며,
                            탈퇴 즉시 개인정보는 파기됩니다(관계 법령에 따른 보존 의무 기간 제외).
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제5조 (서비스 이용 요금)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            현재 제공하는 모든 서비스는 무료입니다.
                        </li>
                        <li>
                            회사는 추후 유료 서비스를 도입하거나 이용 요금을 변경할 수 있습니다.
                            이 경우 시행 30일 전에 서비스 내 공지 또는 이메일을 통해 사전 고지합니다.
                        </li>
                        <li>
                            유료 서비스 도입 시 이용자가 동의하지 않는 경우 탈퇴할 수 있으며,
                            계속 이용 시 변경된 요금에 동의한 것으로 간주합니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제6조 (마케팅 정보 수신)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            회사는 회원의 <strong>별도 사전 동의</strong>를 받은 경우에 한하여 이메일 등을 통해
                            서비스 업데이트, 이벤트, 혜택 등 마케팅 정보를 발송할 수 있습니다.
                            발송 이메일 주소는 온보딩 또는 마이페이지에서 설정한 서비스 알림 이메일을 사용합니다.
                        </li>
                        <li>
                            마케팅 정보 수신 동의는 선택 사항이며, 동의하지 않아도 서비스 이용에 아무런 불이익이 없습니다.
                        </li>
                        <li>
                            수신에 동의한 회원은 언제든지 동의를 철회할 수 있습니다.
                            수신 거부 방법은 발송되는 이메일 하단의 수신 거부 링크를 클릭하거나,{' '}
                            <a href="mailto:dl_deflow@nhnad.com" className="text-blue-600 underline">dl_deflow@nhnad.com</a>으로
                            요청하면 영업일 3일 이내에 처리합니다.
                        </li>
                        <li>
                            수신 거부 처리 후에도 법령에 따른 서비스 관련 필수 안내(약관 변경, 계정 이용 제한 등)는
                            발송될 수 있습니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제7조 (이용자의 의무 및 금지 행위)</h2>
                    <p>이용자는 다음 행위를 해서는 안 됩니다.</p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>욕설, 비방, 혐오 발언, 차별 표현 게시</li>
                        <li>허위 사실 유포 또는 타인의 명예를 훼손하는 행위</li>
                        <li>타인의 저작권, 개인정보, 초상권 등 권리 침해</li>
                        <li>불법 광고, 스팸, 홍보성 게시물 무단 게재</li>
                        <li>타인의 계정 도용 또는 개인정보 무단 수집</li>
                        <li>서비스 시스템에 대한 자동화 접근(봇, 크롤링 등)</li>
                        <li>서비스 운영을 방해하거나 서버에 과부하를 주는 행위</li>
                        <li>관련 법령을 위반하는 일체의 행위</li>
                    </ul>
                    <p className="mt-2">
                        이용자는 자신의 활동으로 인해 발생한 모든 결과에 대해 법적 책임을 집니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제8조 (이용 제한 및 계정 정지)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            회사는 제7조 금지 행위 위반 시 아래 단계에 따라 조치를 취할 수 있습니다.
                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                <li><strong>1단계 (경고)</strong>: 위반 게시물 삭제 및 이메일 경고</li>
                                <li><strong>2단계 (일시 정지)</strong>: 반복 위반 시 7일~30일 서비스 이용 정지</li>
                                <li><strong>3단계 (영구 차단)</strong>: 중대 위반 또는 반복 위반 시 계정 영구 정지</li>
                            </ul>
                        </li>
                        <li>
                            아동 성착취물 게시, 해킹 시도 등 중대한 위반 행위는 단계를 생략하고 즉시 영구 차단 후
                            관계 기관에 신고할 수 있습니다.
                        </li>
                        <li>
                            이용 제한에 이의가 있는 경우{' '}
                            <a href="mailto:dl_deflow@nhnad.com" className="text-blue-600 underline">dl_deflow@nhnad.com</a>으로
                            이의를 제기할 수 있으며, 회사는 영업일 7일 이내에 검토 결과를 회신합니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제9조 (게시물 정책)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            회원이 작성한 게시물의 저작권은 해당 작성자에게 귀속됩니다.
                            단, 회원은 서비스 운영·개선·홍보 목적에 한하여 회사에게 게시물을 사용·복제·편집·배포할 수 있는
                            비독점적·무상 권리를 허락합니다.
                        </li>
                        <li>
                            서비스는 댓글 저장 시 자동 금칙어 필터링(세이프티봇)을 적용합니다.
                            필터에 걸린 게시물은 자동으로 검토 대기 상태로 전환됩니다.
                        </li>
                        <li>
                            회사는 아래 기준에 해당하는 게시물을 사전 고지 없이 삭제하거나 비공개 처리할 수 있습니다.
                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                <li>욕설·비방·혐오·불법 정보 포함</li>
                                <li>타인의 저작권 또는 초상권 침해</li>
                                <li>권리 침해 신고가 접수되고 소명이 없는 경우</li>
                                <li>본 약관 제7조 금지 행위에 해당하는 경우</li>
                            </ul>
                        </li>
                        <li>
                            저작권 침해 등 권리 침해 신고는{' '}
                            <a href="mailto:dl_deflow@nhnad.com" className="text-blue-600 underline">dl_deflow@nhnad.com</a>으로
                            접수합니다. 회사는 <strong>일정 신고 건수 이상 접수 시 자동 임시 숨김 처리</strong>하며,
                            관리자 검토 후 게시자에게 소명 기회(7일)를 부여하고 최종 처리합니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제10조 (서비스 지식재산권)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            서비스 내 회사가 제공하는 콘텐츠(왜난리 브랜드·로고, 화력 지수 알고리즘, UI 디자인,
                            AI 생성 토론 주제·투표 등)의 저작권 및 지식재산권은 회사에게 귀속됩니다.
                        </li>
                        <li>
                            이용자는 서비스를 개인적·비상업적 목적으로만 이용할 수 있으며,
                            회사의 사전 동의 없이 서비스 콘텐츠를 복제·배포·수정·2차 저작물 작성 등으로 활용할 수 없습니다.
                        </li>
                        <li>
                            서비스에서 제공하는 뉴스 출처 링크 및 커뮤니티 출처 링크의 원저작권은 각 원저작자에게 있으며,
                            왜난리는 출처 링크 형태로만 제공합니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제11조 (서비스 변경 및 중단)</h2>
                    <p>
                        회사는 운영상·기술상 필요에 따라 서비스 내용을 변경하거나 중단할 수 있습니다.
                        이 경우 서비스 내 공지 또는 이메일을 통해 사전 고지합니다.
                        단, 긴급한 시스템 장애·보안 사고 등 불가피한 경우에는 사후 고지할 수 있습니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제12조 (면책 조항)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            서비스에서 제공하는 이슈 정보는 네이버 뉴스 API를 기반으로 하며,
                            정보의 정확성·완전성을 보장하지 않습니다.
                        </li>
                        <li>
                            AI가 생성한 토론 주제 및 투표 내용은 참고 목적이며, 사실 확인 없이 신뢰해서는 안 됩니다.
                            AI 생성 콘텐츠에는 서비스 내 &quot;AI 생성&quot; 표시가 부여됩니다.
                        </li>
                        <li>
                            회사는 천재지변, 서비스 장애, 이용자 귀책 사유로 발생한 손해에 대해 책임을 지지 않습니다.
                        </li>
                        <li>
                            이용자가 서비스를 통해 다른 이용자 또는 제3자와 발생한 분쟁에 대해 회사는 개입하지 않으며,
                            이로 인한 손해에 대해 책임지지 않습니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제13조 (약관의 변경)</h2>
                    <p>
                        회사는 관련 법령 또는 서비스 정책 변경에 따라 약관을 개정할 수 있습니다.
                        약관을 변경하는 경우 시행 7일 전에 서비스 내 공지 또는 가입 이메일을 통해 고지하며,
                        이용자가 변경 약관에 동의하지 않을 경우 서비스 이용을 중단하고 탈퇴할 수 있습니다.
                        변경 고지 후 계속 이용 시 변경된 약관에 동의한 것으로 간주합니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제14조 (준거법)</h2>
                    <p>
                        본 약관은 대한민국 법률에 따라 해석되고 적용됩니다.
                    </p>
                </section>

                <section className="border-t pt-6">
                    <p className="text-xs text-gray-500">
                        시행일: 2026년 4월 16일<br />
                        문의: <a href="mailto:dl_deflow@nhnad.com" className="text-blue-600 underline">dl_deflow@nhnad.com</a>
                    </p>
                </section>
            </div>

            <div className="mt-10">
                <a href="/" className="text-sm text-blue-600 hover:underline">← 홈으로</a>
            </div>
        </div>
    )
}
