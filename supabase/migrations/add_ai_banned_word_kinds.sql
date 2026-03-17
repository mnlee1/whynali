-- safety_rules.kind CHECK 제약에 ai_banned_word, excluded_word 추가
ALTER TABLE safety_rules DROP CONSTRAINT IF EXISTS safety_rules_kind_check;
ALTER TABLE safety_rules
    ADD CONSTRAINT safety_rules_kind_check
    CHECK (kind IN ('banned_word', 'ai_banned_word', 'excluded_word'));
