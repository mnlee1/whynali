# Vercel 환경 변수 설정 가이드

## 환경별로 다른 값 설정하기

Vercel에서는 같은 환경 변수 이름으로 여러 환경에 다른 값을 설정할 수 있습니다.

### 방법 1: 별도 프로젝트 (권장)

dev-whynali와 whynali가 별도 Vercel 프로젝트인 경우:

**dev-whynali 프로젝트 설정:**
1. Vercel 대시보드 접속
2. dev-whynali 프로젝트 선택
3. Settings → Environment Variables
4. Add New 클릭
5. 입력:
   - Name: `NEXT_PUBLIC_SITE_URL`
   - Value: `https://dev-whynali.vercel.app`
   - Environments: Production, Preview, Development 모두 체크
6. Save

**whynali 프로젝트 설정:**
1. Vercel 대시보드 접속
2. whynali 프로젝트 선택
3. Settings → Environment Variables
4. Add New 클릭
5. 입력:
   - Name: `NEXT_PUBLIC_SITE_URL`
   - Value: `https://whynali.vercel.app`
   - Environments: Production, Preview, Development 모두 체크
6. Save

### 방법 2: 같은 프로젝트에서 환경별 분리

main 브랜치와 dev 브랜치를 사용하는 경우:

**Production 환경 (main 브랜치):**
1. Settings → Environment Variables
2. Add New
3. 입력:
   - Name: `NEXT_PUBLIC_SITE_URL`
   - Value: `https://whynali.vercel.app`
   - Environments: **Production만 체크**
4. Save

**Preview 환경 (dev 브랜치):**
1. 같은 페이지에서 Add New 다시 클릭
2. 입력:
   - Name: `NEXT_PUBLIC_SITE_URL` (같은 이름)
   - Value: `https://dev-whynali.vercel.app`
   - Environments: **Preview만 체크**
3. Save

이렇게 하면 화면에 같은 이름의 환경 변수가 2개 나타나며, 각각 다른 환경에 적용됩니다.

## 환경 변수 확인

설정 후 배포 로그에서 확인:
```bash
Build Environment Variables:
NEXT_PUBLIC_SITE_URL=https://dev-whynali.vercel.app (또는 whynali.vercel.app)
```

## 재배포

환경 변수 추가/수정 후:
1. Deployments 탭으로 이동
2. 최신 배포의 ⋯ 메뉴 클릭
3. Redeploy 선택

또는 Git push로 자동 재배포

## 주의사항

- `NEXT_PUBLIC_` 접두사가 붙은 변수는 클라이언트에 노출됩니다
- 환경 변수 변경 후 반드시 재배포해야 적용됩니다
- Preview 배포는 브랜치별로 별도의 URL을 가집니다
