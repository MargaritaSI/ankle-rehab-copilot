-- ============================================================================
-- Leg-RAG: scope чанка. 'general' — можно отдавать всем; 'personal' — описывает
-- ОДНОГО конкретного пациента (калибровка нагрузки, личные противопоказания,
-- «у этого пациента…») и отдаётся только владельцу бота (env.OWNER_TG_ID).
-- ============================================================================

ALTER TABLE leg_kb ADD COLUMN scope TEXT NOT NULL DEFAULT 'general';

-- ocd_talus / ocd_talus_personal — весь файл ocd_talus_rehab.json: протокол
-- консервативного лечения хронического ОХД одного пациента (другая ситуация,
-- чем операция) + «Персональная калибровка», мониторинг N=1.
-- micro_rehab «что НЕ делать сейчас» — личный порог нагрузки («около 2 часов ходьбы»).
UPDATE leg_kb SET scope = 'personal'
WHERE topic IN ('ocd_talus', 'ocd_talus_personal')
   OR text LIKE '%этого пациента%'
   OR source_title LIKE '%Персональная калибровка%'
   OR source_title LIKE '%что НЕ делать сейчас%';

CREATE INDEX IF NOT EXISTS idx_leg_kb_scope ON leg_kb(scope);
