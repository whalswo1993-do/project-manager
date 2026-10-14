-- 견적조회 고도화: AI 분석 → 규칙 기반 파서 전환에 필요한 컬럼
-- 모두 nullable 추가라 기존 견적 9건 / 품목 392건에는 영향이 없다. RLS 정책(admin·grade3)은 그대로 적용된다.

alter table public.quotations
  add column if not exists quote_no      text,     -- 견적번호 (TQ-BA-SMO-2608101107)
  add column if not exists revision      text,     -- 리비전 (R12, 파일명 규칙에서)
  add column if not exists quote_date    date,     -- 견적일자 (견적서 내용)
  add column if not exists rfq_no        text,     -- 접수번호 (RFQ)
  add column if not exists client        text,     -- 고객사 표기
  add column if not exists source_name   text,     -- 원본 파일명 또는 '표 붙여넣기' (파일 자체는 저장하지 않음)
  add column if not exists sheet_names   text[],   -- 분석한 시트
  add column if not exists parse_summary jsonb;    -- 정합성 검증 결과 요약

alter table public.quotation_items
  add column if not exists section      text,      -- 견적서 대분류 (기구 Mechanism Part / 인건비 Labor ...)
  add column if not exists parent_item  text,      -- 상세 품목이 속한 견적 라인 (예: Stack unit)
  add column if not exists maker        text,      -- Maker / 재질 (SMC, A6061 ...)
  add column if not exists spec         text,      -- 규격·후처리 / 인건비는 공종(기구·제어·비전)
  add column if not exists uom          text,      -- 단위 (SET, EA, MD, PLT)
  add column if not exists remark       text,
  add column if not exists source       text,      -- 'quotation'(견적 라인) | 'detail'(상세 리스트)
  add column if not exists line_no      integer,   -- 원본 순서
  add column if not exists check_status text;      -- 'ok' | 'mismatch'(수량×단가≠금액) | 'no-amount'

create index if not exists quotation_items_quotation_id_idx on public.quotation_items (quotation_id);
create index if not exists quotations_quote_no_idx on public.quotations (quote_no);
