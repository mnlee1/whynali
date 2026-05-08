# Meta for Developers 앱 설정 가이드

Instagram과 Threads API를 사용하기 위한 Meta 앱 생성 및 설정 가이드입니다.

## 사전 준비

- Facebook 계정
- Instagram 계정 (Business 또는 Creator 계정으로 전환 필요)
- Facebook Page (Instagram과 연결)

## 1단계: Instagram Business 계정 전환

### 1-1. Instagram 앱에서 설정

1. Instagram 앱 실행
2. 프로필 → 설정 (톱니바퀴) 클릭
3. **계정** → **전문 계정으로 전환** 선택
4. 카테고리 선택: **뉴스/미디어 웹사이트**
5. **비즈니스** 또는 **크리에이터** 선택 (비즈니스 권장)
6. 계정 정보 입력
   - 계정명: `@whynali`
   - 이름: `왜난리 | 이슈 내비게이션`
   - Bio: 마케팅 가이드 참고

### 1-2. Facebook Page 생성 및 연결

1. [Facebook Pages](https://www.facebook.com/pages/create) 접속
2. **페이지 만들기** 클릭
3. 페이지 정보 입력
   - 페이지 이름: `왜난리`
   - 카테고리: `뉴스/미디어 웹사이트`
4. Instagram 앱 → 설정 → **Facebook에 연결** → 방금 만든 페이지 선택

## 2단계: Meta for Developers 앱 생성

### 2-1. 앱 생성

1. [Meta for Developers](https://developers.facebook.com/) 접속
2. 우측 상단 **내 앱** → **앱 만들기** 클릭
3. 사용 사례 선택
   - **기타** 선택 → 계속
4. 앱 유형 선택
   - **비즈니스** 선택 → 계속
5. 앱 세부정보 입력
   - 앱 이름: `WhyNali SNS Auto Publisher`
   - 앱 연락처 이메일: 본인 이메일
   - 비즈니스 계정: 선택 (없으면 스킵)
6. **앱 만들기** 클릭

### 2-2. 앱에 제품 추가

앱 대시보드에서 다음 제품을 추가:

#### Instagram Graph API
1. **제품 추가** → **Instagram** 찾기
2. **설정** 버튼 클릭

#### Threads API
1. **제품 추가** → **Threads** 찾기
2. **설정** 버튼 클릭

## 3단계: 권한 신청

### 3-1. Tech Provider Verification

Threads API 사용을 위해 필수입니다.

1. 앱 대시보드 → **앱 설정** → **기본 설정**
2. 하단의 **Tech Provider Verification** 섹션
3. **시작하기** 클릭
4. 필요 정보 입력
   - 비즈니스 정보
   - 개인 정보
   - 웹사이트: `https://whynali.com`
5. 제출 (승인까지 약 1주일)

### 3-2. 권한 신청 (App Review)

#### Instagram 권한

1. 앱 대시보드 → **앱 검수** → **권한 및 기능**
2. 다음 권한 추가:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
3. 각 권한별 **세부정보 추가** 클릭
4. 사용 목적 작성 (영문)
   ```
   Purpose: Automated publishing of weekly card news (carousel posts) 
   to Instagram Business account for WhyNali, a Korean trending issues 
   tracking service.
   
   Use case: 
   - Fetch top 3 trending issues from database every Wed/Sat
   - Generate card news images (8 slides) with AI-generated text
   - Publish carousel posts automatically via Instagram Graph API
   
   Frequency: 2 times per week
   Content: Public trending issues summary with links to whynali.com
   ```
5. 스크린샷/영상 업로드 (선택)
6. **제출** 클릭

#### Threads 권한

1. 앱 대시보드 → **앱 검수** → **권한 및 기능**
2. 다음 권한 추가:
   - `threads_basic`
   - `threads_content_publish`
3. 각 권한별 사용 목적 작성 (Instagram과 동일한 내용)
4. **제출** 클릭

**승인 기간:** 1-4주 (일반적으로 1-2주)

## 4단계: 액세스 토큰 발급

권한 승인 후 진행합니다.

### 4-1. Instagram 액세스 토큰

1. 앱 대시보드 → **Instagram** → **도구**
2. **User Access Token Generator** 섹션
3. Instagram Business 계정 선택
4. 권한 허용
5. **단기 토큰** 발급됨 (1시간 유효)

### 4-2. 단기 토큰 → 장기 토큰 변환

터미널에서 다음 명령 실행:

```bash
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token?\
  grant_type=fb_exchange_token&\
  client_id=YOUR_APP_ID&\
  client_secret=YOUR_APP_SECRET&\
  fb_exchange_token=SHORT_LIVED_TOKEN"
```

응답에서 `access_token` 값이 **장기 토큰** (60일 유효)

### 4-3. Instagram User ID 확인

```bash
curl -X GET "https://graph.facebook.com/v18.0/me?\
  fields=id,username&\
  access_token=YOUR_LONG_LIVED_TOKEN"
```

응답의 `id` 값이 `IG_USER_ID`

### 4-4. Threads 액세스 토큰

Threads는 Instagram과 동일한 앱을 사용하지만, 별도 인증이 필요합니다.

1. 다음 URL로 브라우저 접속 (YOUR_APP_ID 교체):
```
https://www.threads.net/oauth/authorize?
  client_id=YOUR_APP_ID&
  redirect_uri=https://localhost/&
  scope=threads_basic,threads_content_publish&
  response_type=code
```

2. 로그인 및 권한 허용
3. 리다이렉트된 URL에서 `code` 파라미터 복사
   ```
   https://localhost/?code=THIS_IS_THE_CODE
   ```

4. 터미널에서 액세스 토큰 발급:
```bash
curl -X POST "https://graph.threads.net/oauth/access_token?\
  client_id=YOUR_APP_ID&\
  client_secret=YOUR_APP_SECRET&\
  grant_type=authorization_code&\
  redirect_uri=https://localhost/&\
  code=CODE_FROM_STEP_3"
```

응답에서 `access_token`과 `user_id` 확인

### 4-5. Threads 장기 토큰 변환

```bash
curl -X GET "https://graph.threads.net/access_token?\
  grant_type=th_exchange_token&\
  client_secret=YOUR_APP_SECRET&\
  access_token=SHORT_LIVED_TOKEN"
```

## 5단계: 환경 변수 설정

`.env.local` 파일에 다음 값 추가:

```env
# Instagram
IG_USER_ID=your_instagram_user_id_from_step_4-3
IG_ACCESS_TOKEN=your_long_lived_token_from_step_4-2

# Threads
THREADS_USER_ID=your_threads_user_id_from_step_4-4
THREADS_ACCESS_TOKEN=your_long_lived_token_from_step_4-5
```

## 토큰 갱신

Instagram과 Threads 토큰은 60일 후 만료됩니다.

### 자동 갱신 (권장)

다음 API 호출로 토큰을 갱신할 수 있습니다 (만료 전에 실행):

```bash
# Instagram
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token?\
  grant_type=fb_exchange_token&\
  client_id=YOUR_APP_ID&\
  client_secret=YOUR_APP_SECRET&\
  fb_exchange_token=CURRENT_LONG_LIVED_TOKEN"

# Threads
curl -X GET "https://graph.threads.net/refresh_access_token?\
  grant_type=th_refresh_token&\
  access_token=CURRENT_LONG_LIVED_TOKEN"
```

### GitHub Actions로 자동화 (향후 작업)

토큰 갱신을 자동화하는 GitHub Actions 워크플로우를 추가할 수 있습니다.

## 문제 해결

### "Tech Provider Verification 필요" 오류
- Threads API는 Tech Provider Verification 승인 후 사용 가능
- 승인까지 약 1주일 소요

### "권한 부족" 오류
- 앱 검수에서 필요한 권한이 승인되었는지 확인
- 액세스 토큰 생성 시 올바른 권한을 선택했는지 확인

### "토큰 만료" 오류
- 60일이 지났다면 토큰 갱신 필요
- 위의 토큰 갱신 명령어 실행

## 참고 자료

- [Instagram Graph API 문서](https://developers.facebook.com/docs/instagram-api/)
- [Threads API 문서](https://developers.facebook.com/docs/threads/)
- [액세스 토큰 관리](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/)
- 86_SNS_마케팅_완벽_가이드.md
- 87_카드뉴스_파이프라인_사용_가이드.md
