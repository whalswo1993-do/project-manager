-- 출장자 관리: PM(manager) 자리에 기구(mechanical) 인원도 배정할 수 있게 한다
-- 상태: 2026-10-27 운영 DB에 적용함(서버 기록 버전 20261027072355, 이름 trip_manager_slots). 사용자가 SQL 확인 후 직접 적용 지시.
-- 영향: 배정 검사 함수 trip_assignment_check() 한 개만 바꾼다(테이블·정책·데이터는 그대로).
--   예전: 배정하는 사람의 부서 = 자리의 부서여야 함.
--   이후: 위 규칙에 더해 "PM 자리에는 기구 인원도 가능". 다른 조합(비전 인원을 기구 자리에 등)은 여전히 막는다.
-- 되돌리기: 맨 아래 "롤백" 구간(기구 인원이 이미 PM 자리에 배정돼 있으면 그 배정은 그대로 남는다).

create or replace function public.trip_assignment_check()
returns trigger
language plpgsql security definer set search_path to ''
as $$
declare v_dept text; v_active boolean;
begin
  -- 이미 있는 배정의 기간·메모만 고칠 때는(담당자가 그 뒤에 비활성이 됐더라도) 막지 않는다
  if tg_op = 'UPDATE' and new.member_id is not distinct from old.member_id and new.dept = old.dept then
    return new;
  end if;
  if new.member_id is not null then
    select dept, active into v_dept, v_active from public.trip_members where id = new.member_id;
    -- PM(manager) 자리에는 PM 인원과 기구(mechanical) 인원을 모두 넣을 수 있다. 그 밖에는 같은 부서만.
    if v_dept is distinct from new.dept and not (new.dept = 'manager' and v_dept = 'mechanical') then
      raise exception 'trip_member_dept_mismatch' using errcode = 'P0001';
    end if;
    if not v_active then
      raise exception 'trip_member_inactive' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- 롤백: 20261027053311_trip_management.sql 의 trip_assignment_check() 정의로 되돌린다
--   (v_dept is distinct from new.dept 만 검사하는 원래 버전)
