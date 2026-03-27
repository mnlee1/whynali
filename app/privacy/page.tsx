/**
 * app/privacy/page.tsx
 *
 * 개인정보 처리방침 페이지
 *
 * 카카오·네이버 소셜 로그인 검수 요건을 충족하는 실제 처리방침.
 * 개인정보보호법, 정보통신망법 및 국외이전 조항 포함.
 */

export const metadata = {
    title: '개인정보 처리방침 | 왜난리',
}

export default function PrivacyPage() {
    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <h1 className="text-2xl font-bold text-content-primary mb-2">개인정보 처리방침</h1>
            <p className="text-sm text-gray-500 mb-10">시행일: [시행일] &nbsp;|&nbsp; 운영자: [운영자명]</p>

            <div className="space-y-10 text-gray-700 text-sm leading-relaxed">

                <p>
                    NHN AD(이하 &quot;회사&quot;)는 개인정보보호법 및 정보통신망 이용촉진 및 정보보호 등에 관한 법률에 따라
                    이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리하기 위해 다음과 같이
                    개인정보 처리방침을 수립·공개합니다.
                </p>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제1조 (수집하는 개인정보 항목 및 수집 방법)</h2>
                    <p className="mb-3">회사는 서비스 제공을 위해 다음과 같은 최소한의 개인정보를 수집합니다.</p>

                    <p className="font-medium mb-1">① 소셜 로그인 시 수집 항목</p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse border border-gray-200 mb-4">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="border border-gray-200 px-3 py-2 text-left">제공자</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">수집 항목</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">필수/선택</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">수집 시점</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2" rowSpan={2}>카카오</td>
                                    <td className="border border-gray-200 px-3 py-2">카카오 고유 식별자, 프로필 닉네임</td>
                                    <td className="border border-gray-200 px-3 py-2">필수</td>
                                    <td className="border border-gray-200 px-3 py-2" rowSpan={2}>최초 로그인 시</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">이메일 주소</td>
                                    <td className="border border-gray-200 px-3 py-2">필수</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2" rowSpan={2}>네이버</td>
                                    <td className="border border-gray-200 px-3 py-2">네이버 고유 식별자, 이름</td>
                                    <td className="border border-gray-200 px-3 py-2">필수</td>
                                    <td className="border border-gray-200 px-3 py-2" rowSpan={2}>최초 로그인 시</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">이메일 주소</td>
                                    <td className="border border-gray-200 px-3 py-2">필수</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Google</td>
                                    <td className="border border-gray-200 px-3 py-2">Google 고유 식별자, 이름, 이메일 주소</td>
                                    <td className="border border-gray-200 px-3 py-2">필수</td>
                                    <td className="border border-gray-200 px-3 py-2">최초 로그인 시</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="text-gray-500 text-xs mb-4">
                        수집된 프로필 닉네임/이름은 서비스 내 닉네임 설정 전까지 임시 저장 후 즉시 파기됩니다.
                        서비스에서 표시되는 닉네임은 이용자가 온보딩 과정에서 직접 설정한 값을 사용합니다.
                    </p>

                    <p className="font-medium mb-1">② 서비스 이용 중 자동 수집 항목</p>
                    <ul className="list-disc pl-5 space-y-1 mb-3">
                        <li>서비스 이용 기록 (댓글 내용, 투표 참여 기록, 감정 표현 기록)</li>
                        <li>접속 IP 주소, 브라우저 정보, 운영체제 정보 (서버 접속 시 자동 수집)</li>
                        <li>세션 쿠키 (로그인 상태 유지 목적, 브라우저 종료 또는 로그아웃 시 삭제)</li>
                    </ul>
                    <p className="text-gray-500 text-xs mb-2">
                        쿠키는 브라우저 설정에서 거부할 수 있으나, 거부 시 로그인이 필요한 서비스 기능을 이용할 수 없습니다.
                    </p>

                    <p className="text-gray-500">
                        주민등록번호, 금융정보, 민감정보(건강, 신념, 성생활 등)는 수집하지 않습니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제2조 (개인정보의 수집 및 이용 목적)</h2>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>회원 식별 및 로그인 유지</li>
                        <li>댓글, 투표, 감정 표현 등 참여형 서비스 기능 제공</li>
                        <li>중복 참여 방지 (투표 1인 1회 제한)</li>
                        <li>금칙어 자동 필터링(세이프티봇) 적용을 통한 서비스 품질 유지</li>
                        <li>서비스 개선을 위한 이용 통계 분석</li>
                        <li>법령 의무 이행 및 분쟁 처리</li>
                        <li>서비스 업데이트, 이벤트, 혜택 등 마케팅 정보 안내 (마케팅 수신에 별도 동의한 회원에 한함)</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제3조 (개인정보의 보유 및 이용 기간)</h2>
                    <p className="mb-2">
                        수집된 개인정보는 회원 탈퇴 시 즉시 파기합니다.
                        단, 관계 법령에 따라 보존할 필요가 있는 경우 아래 기간 동안 보유합니다.
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>소비자 불만 및 분쟁 처리 기록: 3년 (전자상거래법 제6조)</li>
                        <li>서비스 접속 로그: 3개월 (통신비밀보호법 제15조의2)</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제4조 (개인정보의 제3자 제공)</h2>
                    <p>
                        회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다.
                        단, 다음의 경우는 예외입니다.
                    </p>
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                        <li>이용자가 사전에 동의한 경우</li>
                        <li>수사기관 등이 법령에 정한 절차에 따라 요청하는 경우</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제5조 (개인정보 처리 위탁)</h2>
                    <p className="mb-3">
                        회사는 원활한 서비스 제공을 위해 아래와 같이 개인정보 처리 업무를 위탁합니다.
                        위탁계약 체결 시 개인정보보호법에 따라 개인정보가 안전하게 관리되도록 필요한 조항을 규정합니다.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse border border-gray-200">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="border border-gray-200 px-3 py-2 text-left">수탁업체</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">위탁 업무</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">보유 기간</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Supabase Inc.</td>
                                    <td className="border border-gray-200 px-3 py-2">회원 인증, 데이터베이스 저장</td>
                                    <td className="border border-gray-200 px-3 py-2">위탁 계약 종료 시까지</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Vercel Inc.</td>
                                    <td className="border border-gray-200 px-3 py-2">서비스 호스팅 및 서버 운영</td>
                                    <td className="border border-gray-200 px-3 py-2">위탁 계약 종료 시까지</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Anthropic PBC</td>
                                    <td className="border border-gray-200 px-3 py-2">AI 콘텐츠 생성 (이슈 메타데이터만 전달, 개인정보 미포함)</td>
                                    <td className="border border-gray-200 px-3 py-2">처리 즉시 파기</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Groq Inc.</td>
                                    <td className="border border-gray-200 px-3 py-2">AI 콘텐츠 생성 (이슈 메타데이터만 전달, 개인정보 미포함)</td>
                                    <td className="border border-gray-200 px-3 py-2">처리 즉시 파기</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Resend Inc.</td>
                                    <td className="border border-gray-200 px-3 py-2">이메일 발송 (서비스 알림, 마케팅 수신 동의자에 한함)</td>
                                    <td className="border border-gray-200 px-3 py-2">발송 후 즉시 파기</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제6조 (개인정보의 국외 이전)</h2>
                    <p className="mb-3">
                        회사는 서비스 운영을 위해 이용자의 개인정보를 국외로 이전합니다.
                        이전 내역은 다음과 같습니다.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse border border-gray-200">
                            <thead>
                                <tr className="bg-gray-50">
                                    <th className="border border-gray-200 px-3 py-2 text-left">이전받는 자</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">이전 국가</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">이전 목적</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">이전 항목</th>
                                    <th className="border border-gray-200 px-3 py-2 text-left">보유 기간</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Supabase Inc.</td>
                                    <td className="border border-gray-200 px-3 py-2">미국</td>
                                    <td className="border border-gray-200 px-3 py-2">회원 인증 및 데이터 저장</td>
                                    <td className="border border-gray-200 px-3 py-2">이메일, 소셜 고유 ID, 이용 기록</td>
                                    <td className="border border-gray-200 px-3 py-2">회원 탈퇴 시까지</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Vercel Inc.</td>
                                    <td className="border border-gray-200 px-3 py-2">미국</td>
                                    <td className="border border-gray-200 px-3 py-2">서비스 호스팅</td>
                                    <td className="border border-gray-200 px-3 py-2">접속 IP, 서버 로그</td>
                                    <td className="border border-gray-200 px-3 py-2">3개월</td>
                                </tr>
                                <tr>
                                    <td className="border border-gray-200 px-3 py-2">Resend Inc.</td>
                                    <td className="border border-gray-200 px-3 py-2">미국</td>
                                    <td className="border border-gray-200 px-3 py-2">이메일 발송</td>
                                    <td className="border border-gray-200 px-3 py-2">이메일 주소</td>
                                    <td className="border border-gray-200 px-3 py-2">발송 후 즉시 파기</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3 text-gray-500">
                        이용자는 개인정보 국외 이전에 동의하지 않을 권리가 있으며, 동의하지 않는 경우 서비스 이용이 제한될 수 있습니다.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제7조 (개인정보의 파기)</h2>
                    <p className="mb-2">
                        보유 기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 개인정보를 파기합니다.
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>전자적 파일 형태</strong>: 복구 및 재생이 불가능한 기술적 방법으로 영구 삭제</li>
                        <li><strong>종이 문서</strong>: 해당 없음 (서비스는 전자적 방법으로만 운영)</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제8조 (이용자의 권리)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            이용자(만 14세 미만인 경우 법정 대리인)는 언제든지 다음 권리를 행사할 수 있습니다.
                            <ul className="list-disc pl-5 mt-1 space-y-1">
                                <li>개인정보 처리 현황 열람 요청</li>
                                <li>오류가 있는 개인정보의 정정 요청</li>
                                <li>개인정보 삭제(탈퇴) 요청</li>
                                <li>개인정보 처리 정지 요청</li>
                            </ul>
                        </li>
                        <li>
                            권리 행사는 서비스 내 마이페이지 또는{' '}
                            <a href="mailto:dl_deflow@nhnad.com" className="text-blue-600 underline">dl_deflow@nhnad.com</a>으로
                            문의하시면 지체 없이 처리합니다.
                        </li>
                        <li>
                            소셜 로그인 연동 해제는 각 플랫폼(카카오·네이버·Google) 계정 설정에서도 직접 처리할 수 있습니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제9조 (개인정보 보호책임자)</h2>
                    <p className="mb-2">
                        회사는 개인정보 처리에 관한 업무를 총괄하고, 관련 불만 및 피해 구제를 위해 아래와 같이
                        개인정보 보호책임자를 지정합니다.
                    </p>
                    <ul className="list-none space-y-1">
                        <li>성명: 김경수</li>
                        <li>소속/직위: NHN AD / 이사</li>
                        <li>이메일: <a href="mailto:dl_deflow@nhnad.com" className="text-blue-600 underline">dl_deflow@nhnad.com</a></li>
                    </ul>
                    <p className="mt-3">
                        개인정보와 관련된 불만 처리 및 피해 구제를 위해 아래 기관에 도움을 요청하실 수 있습니다.
                    </p>
                    <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>개인정보분쟁조정위원회: <a href="https://www.kopico.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">www.kopico.go.kr</a> / 1833-6972</li>
                        <li>한국인터넷진흥원 개인정보침해신고센터: <a href="https://privacy.kisa.or.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">privacy.kisa.or.kr</a> / 118</li>
                        <li>대검찰청 사이버범죄수사단: <a href="https://www.spo.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">www.spo.go.kr</a> / 02-3480-3573</li>
                        <li>경찰청 사이버안전국: <a href="https://cyberbureau.police.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">cyberbureau.police.go.kr</a> / 182</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제10조 (쿠키 운용)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            회사는 이용자에게 개인화된 서비스를 제공하기 위해 쿠키를 사용합니다.
                            쿠키는 서버가 이용자의 브라우저에 전송하는 소량의 데이터 파일로, 이용자의 기기에 저장됩니다.
                        </li>
                        <li>
                            쿠키 사용 목적: 로그인 상태 유지, 세션 관리
                        </li>
                        <li>
                            이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나,
                            거부 시 로그인이 필요한 서비스 기능(댓글, 투표, 반응 등)을 이용할 수 없습니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제11조 (마케팅 정보 수신 동의)</h2>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>
                            회사는 회원의 별도 사전 동의를 받은 경우에 한하여 이메일 등을 통해
                            서비스 업데이트, 이벤트, 혜택 등 마케팅 정보를 발송합니다.
                        </li>
                        <li>
                            마케팅 수신 동의 여부는 서비스 가입(온보딩) 또는 마이페이지에서 확인·변경할 수 있습니다.
                        </li>
                        <li>
                            수신 동의는 선택 사항이며, 동의하지 않아도 서비스 이용에 아무런 불이익이 없습니다.
                        </li>
                        <li>
                            마케팅 수신 동의를 철회하려면 발송된 이메일 하단의 수신 거부 링크를 클릭하거나,{' '}
                            <a href="mailto:dl_deflow@nhnad.com" className="text-blue-600 underline">dl_deflow@nhnad.com</a>으로
                            요청하면 영업일 3일 이내에 처리합니다.
                        </li>
                        <li>
                            수신 거부 처리 후에도 약관 변경, 이용 제한 등 서비스 운영상 필수 안내는 계속 발송될 수 있습니다.
                        </li>
                    </ol>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제12조 (개인정보의 안전성 확보 조치)</h2>
                    <p className="mb-2">
                        회사는 개인정보보호법 제29조에 따라 개인정보가 분실·도난·유출·위조·변조·훼손되지 않도록
                        아래와 같은 안전성 확보 조치를 취합니다.
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>접근 권한 최소화</strong>: 개인정보에 접근할 수 있는 관리자 계정을 최소한으로 지정하고 관리합니다.</li>
                        <li><strong>개인정보 암호화</strong>: 이용자의 이메일 및 인증 정보는 Supabase의 암호화 저장 방식으로 보호됩니다.</li>
                        <li><strong>접속 기록 보관</strong>: 서버 접속 기록을 3개월 이상 보관하고 위·변조를 방지합니다.</li>
                        <li><strong>전송 구간 암호화</strong>: 개인정보 전송 시 HTTPS(TLS) 암호화 프로토콜을 적용합니다.</li>
                        <li><strong>보안 취약점 점검</strong>: 정기적으로 취약점을 점검하고 조치합니다.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-gray-900 mb-3">제13조 (처리방침의 변경)</h2>
                    <p>
                        본 처리방침은 법령·정책의 변경 또는 서비스 내용 변경에 따라 개정될 수 있습니다.
                        변경 시 시행 7일 전에 서비스 내 공지 또는 가입 이메일을 통해 고지합니다.
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
