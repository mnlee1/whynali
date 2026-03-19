# Google OAuth Playground 문제 해결 가이드

YouTube API 설정 중 OAuth Playground(6-4 단계)에서 발생하는 문제 해결 방법

---

## 문제 1: "액세스가 차단됨: 승인 오류" 

### 증상
"Authorize APIs" 버튼 클릭 후 빨간색 에러:
```
액세스가 차단됨: whynali의 승인 오류
redirect_uri_mismatch
```

### 원인
OAuth 클라이언트의 승인된 리디렉션 URI에 OAuth Playground 주소가 없음

### 해결 방법

1. **구글 클라우드 콘솔 접속**
   - https://console.cloud.google.com
   - whynali 프로젝트 선택

2. **YouTube용 OAuth 클라이언트 수정**
   - 왼쪽 메뉴 → API 및 서비스 → 사용자 인증 정보
   - "Whynali YouTube Upload" 클라이언트 이름 클릭

3. **리디렉션 URI 확인/추가**
   - "승인된 리디렉션 URI" 섹션에서 아래 주소가 있는지 확인:
   ```
   https://developers.google.com/oauthplayground
   ```
   - 없다면 "URI 추가" 클릭해서 추가
   - **정확히 복사 붙여넣기** (끝에 슬래시 없음)

4. **저장 후 재시도**
   - 하단 "저장" 버튼 클릭
   - OAuth Playground로 돌아가서 처음부터 다시 시도

---

## 문제 2: "앱이 확인되지 않음" 경고에서 진행이 안 됨

### 증상
로그인 후 회색 화면에:
```
Google에서 whynali 앱을 확인하지 못했습니다.
```

### 이것은 정상입니다!

OAuth 동의 화면을 "외부"로 설정했고, Google의 공식 검증을 받지 않았기 때문에 나타나는 경고입니다.

### 진행 방법

1. **화면 왼쪽 하단 "고급" 링크 클릭**
   - 작은 글씨로 되어 있음
   - 클릭하면 추가 옵션 표시

2. **"whynali(으)로 이동" 링크 클릭**
   - 파란색 링크
   - 또는 "whynali(안전하지 않음)로 이동" 표시될 수 있음

3. **권한 승인 화면으로 이동**
   - 정상적으로 권한 요청 화면이 나타남

---

## 문제 3: 권한 승인 화면이 영어로 나와요

### 증상
"whynali wants to access your Google Account" 등 영어로 표시

### 해결 방법

**이것도 정상입니다.** 그대로 진행하면 됩니다.

확인할 권한 목록:
- "View and manage your YouTube videos and channels"
- "See, edit, and permanently delete your YouTube videos"

아래 권한이 표시되면:
1. **"Allow" 버튼 클릭** (허용)
2. OAuth Playground로 리디렉션됨

---

## 문제 4: "OAuth 클라이언트 ID가 잘못되었습니다" 에러

### 증상
```
The OAuth client was not found.
```

### 원인
OAuth Playground 설정에 입력한 Client ID나 Secret이 잘못됨

### 해결 방법

1. **구글 클라우드 콘솔에서 정보 재확인**
   - API 및 서비스 → 사용자 인증 정보
   - "Whynali YouTube Upload" 클라이언트 클릭
   - 클라이언트 ID 전체 복사 (끝까지 다 복사)

2. **OAuth Playground 설정 다시 입력**
   - 오른쪽 상단 톱니바퀴 클릭
   - 기존 값 전부 지우고 다시 붙여넣기
   - **공백, 줄바꿈 없는지 확인**

3. **Client Secret도 동일하게**
   - 클라우드 콘솔에서 "보기" 클릭해서 Secret 복사
   - OAuth Playground에 붙여넣기

---

## 문제 5: 권한을 승인했는데 "Authorization code" 가 안 나타나요

### 증상
권한 승인 후 OAuth Playground 화면이 비어있거나, Step 1에 머물러 있음

### 해결 방법

1. **페이지 새로고침 후 재시도**
   - F5 또는 Ctrl/Cmd + R

2. **다른 브라우저 사용**
   - Chrome → Firefox
   - 또는 시크릿/프라이빗 모드

3. **캐시 삭제 후 재시도**
   - Chrome: Ctrl/Cmd + Shift + Delete
   - "쿠키 및 기타 사이트 데이터" 체크
   - "캐시된 이미지 및 파일" 체크
   - "데이터 삭제" 클릭

---

## 문제 6: 계정 선택 화면에서 "이 앱을 사용할 수 없습니다" 에러

### 증상
구글 계정 선택 후:
```
whynali 개발자가 소유하지 않은 계정입니다.
```

### 원인
OAuth 동의 화면이 "테스트" 모드이고, 로그인하려는 계정이 "테스트 사용자"에 등록되지 않음

### 해결 방법

**방법 1: 테스트 사용자 추가 (권장)**

1. 구글 클라우드 콘솔 → API 및 서비스 → OAuth 동의 화면
2. "테스트 사용자" 섹션에서 "+ ADD USERS" 클릭
3. YouTube 채널 관리자 이메일 입력
4. "저장" 클릭
5. OAuth Playground에서 다시 시도

**방법 2: 앱을 프로덕션으로 게시 (나중에)**

1. OAuth 동의 화면에서 "앱 게시" 클릭
2. Google 검토 없이도 사용 가능
3. 모든 계정으로 로그인 가능해짐

---

## 단계별 체크리스트

OAuth Playground에서 문제 발생 시 순서대로 확인:

- [ ] 1. OAuth Playground 설정(톱니바퀴)에서 Client ID/Secret 정확히 입력했나?
- [ ] 2. 구글 클라우드 콘솔에서 YouTube API가 활성화되어 있나?
- [ ] 3. OAuth 클라이언트의 리디렉션 URI에 `https://developers.google.com/oauthplayground` 있나?
- [ ] 4. 로그인하려는 계정이 YouTube 채널 소유자 또는 관리자인가?
- [ ] 5. OAuth 동의 화면의 테스트 사용자에 해당 계정이 등록되어 있나?
- [ ] 6. 브라우저 팝업 차단이 해제되어 있나?
- [ ] 7. 시크릿/프라이빗 모드에서도 동일한 문제가 발생하나?

---

## 여전히 안 되면: 전체 재설정

모든 방법을 시도했는데도 안 되면, OAuth 클라이언트를 새로 만드는 게 빠를 수 있습니다.

1. **기존 클라이언트 삭제**
   - 구글 클라우드 콘솔 → 사용자 인증 정보
   - "Whynali YouTube Upload" 오른쪽 휴지통 아이콘 클릭
   - 삭제 확인

2. **새 클라이언트 생성**
   - 가이드의 5단계부터 다시 진행
   - 이번에는 더 신중하게 입력

3. **OAuth Playground 재시도**
   - 새 Client ID/Secret으로 6단계 진행

---

## 성공 화면

모든 단계가 정상적으로 완료되면:

1. **Step 2에서 Authorization code 표시**:
   ```
   4/0AXXXXXXXXXXXXxxxxxxxxxxx
   ```

2. **"Exchange authorization code for tokens" 버튼 클릭**

3. **Step 2 오른쪽에 Refresh token 표시**:
   ```
   1//0gXXXXXXXXXXXXXXXXXXXXXX
   ```

이 Refresh token을 복사해서 `.env.local` 파일에 `YOUTUBE_REFRESH_TOKEN`으로 저장하면 완료!

---

**최종 업데이트**: 2026-03-19
**관련 가이드**: 구글 클라우드 프로젝트 설정 가이드
