-- supabase/migrations/add_shortform_storage_bucket.sql
--
-- 숏폼 이미지 저장용 Supabase Storage 버킷 RLS 정책
--
-- 주의: 이 SQL 실행 전에 Supabase Dashboard에서 버킷을 먼저 생성해야 합니다.
-- 
-- 버킷 생성 방법:
-- 1. Supabase Dashboard → Storage 메뉴
-- 2. "New bucket" 클릭
-- 3. 설정:
--    - Name: shortform
--    - Public bucket: ✅ 체크
--    - File size limit: 5 MB
--    - Allowed MIME types: image/png
-- 4. "Create bucket" 클릭
--
-- 버킷 생성 후 이 SQL을 실행하면 RLS 정책이 설정됩니다.
-- (공개 버킷은 기본 정책이 자동 생성되므로 이 SQL은 선택사항입니다)

-- 2. RLS 정책 설정

-- 2-1. 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Public read access for shortform images" ON storage.objects;
DROP POLICY IF EXISTS "Service role upload for shortform images" ON storage.objects;
DROP POLICY IF EXISTS "Service role delete for shortform images" ON storage.objects;

-- 2-2. 읽기 정책: 모든 사용자가 공개 접근 가능
CREATE POLICY "Public read access for shortform images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'shortform');

-- 2-3. 쓰기 정책: 서비스 역할만 업로드 가능 (어드민 API에서만 사용)
-- 일반 사용자는 업로드 불가
CREATE POLICY "Service role upload for shortform images"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'shortform' 
    AND auth.role() = 'service_role'
);

-- 2-4. 삭제 정책: 서비스 역할만 삭제 가능
CREATE POLICY "Service role delete for shortform images"
ON storage.objects
FOR DELETE
USING (
    bucket_id = 'shortform' 
    AND auth.role() = 'service_role'
);

COMMENT ON TABLE storage.buckets IS '숏폼 이미지 저장소 (공개 읽기, 서비스 역할만 쓰기)';
