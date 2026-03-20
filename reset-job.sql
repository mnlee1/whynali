-- 케이팝 데몬 헌터스 오스카 2관왕 이슈의 job을 대기 상태로 초기화

UPDATE shortform_jobs
SET 
    video_path = NULL,
    approval_status = 'pending',
    upload_status = NULL,
    ai_validation = NULL
WHERE 
    issue_id = '12f35c66-da31-4f6e-8e98-357a72eeeac8'
    AND approval_status = 'approved';

-- 결과 확인
SELECT 
    id,
    issue_title,
    approval_status,
    video_path,
    upload_status,
    created_at
FROM shortform_jobs
WHERE issue_id = '12f35c66-da31-4f6e-8e98-357a72eeeac8'
ORDER BY created_at DESC
LIMIT 1;
