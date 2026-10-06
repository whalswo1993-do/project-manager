import React, { useState, useEffect, useMemo, useRef } from 'react';
import './StackPartAssistant.css';
import { supabase } from './supabase';
import * as XLSX from 'xlsx';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 기본 초기 샘플 데이터 (스택파트 실무 현장: 본인 + 이은성 주임)
const INITIAL_TASKS = [
  {
    id: 'task-1',
    threadId: 'th-sk-stack-01',
    customer: 'SK on',
    equipment: '헝가리 이반차 Stacking #3',
    subject: '[긴급] Stacking 매거진 공급부 얼라인 센서 감도 재조정 요청의 건',
    status: '재회신접수', // 고객사에서 추가 회신이 도착해 자동 재오픈된 건
    priority: '긴급',
    assignee: '본인(선임)',
    isSoloEunseong: false,
    lastSender: '김원규 책임 (SK on 이반차 기술팀)',
    lastRecipient: '나(선임), 이은성 주임',
    receivedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10),
    summary: '지난주 센서 세팅 조치 후에도 특정 로트에서 간헐적 오검출 발생. 현장 재티칭 및 파라미터 값 회신 요청.',
    actionPlan: '이은성 주임이 어제 측정한 오프셋 로그 취합 후 17시 이전 고객사 기술팀에 최종 수정안 회신 예정',
    history: [
      {
        id: 'mail-1',
        direction: 'inbound_customer',
        sender: '김원규 책임 <wgkim@sk.com>',
        recipient: '내 메일, 이은성 주임 메일',
        sentAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        subject: '[요청] Stacking #3 매거진 얼라인 센서 확인 요청',
        body: '안녕하십니까, TW 스택파트 담당자님. SK on 이반차 현장 김원규입니다.\n#3호기 매거진 투입 시 센서 오검출이 발생하여 라인 정지가 있었습니다. 파라미터 점검 부탁드립니다.'
      },
      {
        id: 'mail-2',
        direction: 'internal',
        sender: '나(선임) <cmj1012@twgroup.co.kr>',
        recipient: '이은성 주임 메일 <les0415@twgroup.co.kr>',
        sentAt: new Date(Date.now() - 40 * 3600 * 1000).toISOString(),
        subject: 'Fwd: [요청] Stacking #3 매거진 얼라인 센서 확인 요청',
        body: '이은성 주임님, 지난주 출장 시 기록한 광량 감도 로그 파일 확인해서 센서 거리 보정치 먼저 계산해주세요.'
      },
      {
        id: 'mail-3',
        direction: 'outbound_customer',
        sender: '나(선임) <cmj1012@twgroup.co.kr>',
        recipient: '김원규 책임 <wgkim@sk.com>',
        sentAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
        subject: 'Re: [요청] Stacking #3 매거진 얼라인 센서 1차 가이드 회신',
        body: '김 책임님 안녕하십니까. TW 스택파트입니다. 1차 조치로 PLC 감도 설정값을 120 -> 145로 상향 조정 권고드립니다.'
      },
      {
        id: 'mail-4',
        direction: 'inbound_customer',
        sender: '김원규 책임 <wgkim@sk.com>',
        recipient: '내 메일, 이은성 주임 메일',
        sentAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        subject: 'Re: Re: [요청] Stacking #3 센서 재조정 관련 추가 문의',
        body: '알려주신 145 값 적용 후 주간은 양호하나 야간 특정 조도에서 여전히 간헐적 감지 불량이 있습니다. 긴급 재점검 바랍니다.'
      }
    ]
  },
  {
    id: 'task-2',
    threadId: 'th-sdi-stack-02',
    customer: 'Samsung SDI',
    equipment: '울산 Stacking M라인',
    subject: '스택 유닛 세퍼레이터 텐션 롤러 구동부 윤활 주기 및 사양 문의',
    status: '고객사회신완료', // 고객사에 답변 완료되어 '완료' 처리된 건
    priority: '보통',
    assignee: '이은성 주임',
    isSoloEunseong: true, // ⭐️ 이은성 주임님 단독 수신 건 (선임 미참조 메일)
    lastSender: '박민우 프로 (SDI 울산 품질팀)',
    lastRecipient: '이은성 주임 <les0415@twgroup.co.kr>',
    receivedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    summary: '세퍼레이터 텐션 롤러 베어링 그리스 사양 및 주기적 주유 매뉴얼 회신 요청 (이은성 주임 단독 수신건 자동 감지).',
    actionPlan: '이은성 주임이 표준 유지보수 매뉴얼 PDF 및 그리스 품번 직접 고객사 송부 완료. (상태: 완료)',
    history: [
      {
        id: 'mail-2-1',
        direction: 'inbound_customer',
        sender: '박민우 프로 <mw.park@samsung.com>',
        recipient: '이은성 주임 <les0415@twgroup.co.kr>', // 선임 미참조!
        sentAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
        subject: '[SDI 울산] 스택 텐션 롤러 윤활 매뉴얼 요청',
        body: '이은성 주임님 안녕하십니까, SDI 울산 품질팀 박민우 프로입니다. 스택 텐션 롤러 윤활 오일 교체 주기 매뉴얼 공유 부탁드립니다.'
      },
      {
        id: 'mail-2-2',
        direction: 'outbound_customer',
        sender: '이은성 주임 <les0415@twgroup.co.kr>',
        recipient: '박민우 프로 <mw.park@samsung.com>',
        sentAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
        subject: 'Re: [SDI 울산] 스택 텐션 롤러 윤활 매뉴얼 송부의 건',
        body: '박 프로님 안녕하십니까, TW 스택파트 이은성 주임입니다. 요청하신 롤러 그리스 사양서 및 주유 주기 가이드 첨부 송부드립니다.'
      }
    ]
  },
  {
    id: 'task-3',
    threadId: 'th-hyundai-stack-01',
    customer: 'Hyundai',
    equipment: '남양연구소 차세대 셀 Stacker',
    subject: '극판 적층 흡착 패드 정전기 방지(ESD) 재질 변경 검토 건',
    status: '내부진행중',
    priority: '높음',
    assignee: '공동',
    isSoloEunseong: false,
    lastSender: '최정훈 책임 (현대차 배터리선행개발팀)',
    lastRecipient: '내 메일, 이은성 주임 메일',
    receivedAt: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    summary: '신규 음극/양극 극판 진공 픽업 시 대전 방지 고무 패드 적용 가능성 및 가공 납기 검토 요청.',
    actionPlan: '부품 구매팀에 ESD 실리콘 패드 샘플 발주 확인 중. 내일 오전 설계팀과 인터페이스 도면 미팅 후 회신 예정.',
    history: [
      {
        id: 'mail-3-1',
        direction: 'inbound_customer',
        sender: '최정훈 책임 <jhchoi@hyundai.com>',
        recipient: '내 메일, 이은성 주임 메일',
        sentAt: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
        subject: '[현대차 남양] 스택 진공 패드 ESD 재질 변경 기술 검토 요청',
        body: 'TW 스택파트 담당자님. 정전기 발생 억제를 위해 기존 우레탄 패드를 전도성 실리콘으로 변경 가능한지 검토 부탁드립니다.'
      }
    ]
  }
];

// 기존 캐시/데이터에 남아있을 수 있는 '부사수' 및 예전 메일 주소를 '이은성 주임' 및 'les0415@twgroup.co.kr'로 자동 정제
function sanitizeTasks(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList.map(t => {
    let nextAssignee = t.assignee;
    if (t.assignee === '부사수') {
      nextAssignee = '이은성 주임';
    }
    const nextLastSender = (t.lastSender || '').replace(/부사수/g, '이은성 주임').replace(/eslee@twgroup\.co\.kr/gi, 'les0415@twgroup.co.kr').replace(/junior@twgroup\.co\.kr/gi, 'les0415@twgroup.co.kr');
    const nextLastRecipient = (t.lastRecipient || '').replace(/부사수/g, '이은성 주임').replace(/eslee@twgroup\.co\.kr/gi, 'les0415@twgroup.co.kr').replace(/junior@twgroup\.co\.kr/gi, 'les0415@twgroup.co.kr');
    const nextSummary = (t.summary || '').replace(/부사수/g, '이은성 주임');
    const nextActionPlan = (t.actionPlan || '').replace(/부사수/g, '이은성 주임');
    const nextHistory = (t.history || []).map(h => ({
      ...h,
      sender: (h.sender || '').replace(/부사수/g, '이은성 주임').replace(/eslee@twgroup\.co\.kr/gi, 'les0415@twgroup.co.kr').replace(/junior@twgroup\.co\.kr/gi, 'les0415@twgroup.co.kr'),
      recipient: (h.recipient || '').replace(/부사수/g, '이은성 주임').replace(/eslee@twgroup\.co\.kr/gi, 'les0415@twgroup.co.kr').replace(/junior@twgroup\.co\.kr/gi, 'les0415@twgroup.co.kr'),
      body: (h.body || '').replace(/부사수/g, '이은성 주임')
    }));

    // 이은성 주임 단독 수신 여부 재계산
    const recipLower = (nextLastRecipient || '').toLowerCase();
    const hasEunseong = recipLower.includes('les0415') || recipLower.includes('이은성');
    const hasMe = recipLower.includes('cmj1012') || recipLower.includes('나') || recipLower.includes('선임');
    const isSoloEunseong = t.isSoloEunseong !== undefined ? t.isSoloEunseong : (hasEunseong && !hasMe);

    return {
      ...t,
      assignee: nextAssignee,
      isSoloEunseong,
      lastSender: nextLastSender,
      lastRecipient: nextLastRecipient,
      summary: nextSummary,
      actionPlan: nextActionPlan,
      history: nextHistory
    };
  });
}

export default function StackPartAssistant({ currentCustomer = "SK on" }) {
  // ── 0. 메일 계정 연동 설정 상태 (본인 메일 + 이은성 주임 메일: les0415@twgroup.co.kr) ──
  const [myEmail, setMyEmail] = useState(() => {
    try {
      return localStorage.getItem('pm_stack_my_email') || 'cmj1012@twgroup.co.kr';
    } catch (e) {
      return 'cmj1012@twgroup.co.kr';
    }
  });

  const [eunseongEmail, setEunseongEmail] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_stack_eunseong_email');
      if (saved && saved !== 'eslee@twgroup.co.kr' && saved !== 'junior@twgroup.co.kr') {
        return saved;
      }
    } catch (e) {}
    return 'les0415@twgroup.co.kr';
  });

  const saveEmailSettings = (myMail, esMail) => {
    setMyEmail(myMail);
    setEunseongEmail(esMail);
    try {
      localStorage.setItem('pm_stack_my_email', myMail);
      localStorage.setItem('pm_stack_eunseong_email', esMail);
    } catch (e) {}
    showToast("💾 다우오피스 메일 주소 설정이 저장되었습니다.");
  };

  // ── 1. 데이터 및 실시간 동기화 상태 ──
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_stack_tasks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return sanitizeTasks(parsed);
      }
    } catch (e) {
      console.warn("로컬 캐시 로드 실패:", e);
    }
    return INITIAL_TASKS;
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 5000);
  };

  // ── 2. 뷰 및 필터 상태 ──
  const [viewMode, setViewMode] = useState('sheet'); // 'sheet' | 'kanban'
  const [customerFilter, setCustomerFilter] = useState('전체');
  const [assigneeFilter, setAssigneeFilter] = useState('전체'); // '전체' | '내 업무(선임)' | '이은성 주임' | '공동'
  const [statusFilter, setStatusFilter] = useState('전체'); // '전체' | '진행중' | '재회신접수' | '고객사회신완료'
  const [recipientFilter, setRecipientFilter] = useState('전체'); // '전체' | 'solo_eunseong' | 'joint' | 'solo_me'
  const [searchQuery, setSearchQuery] = useState('');

  // ── 3. 선택 및 모달 / 서랍 상태 ──
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);

  // 셀 인라인 편집 상태
  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [editingValue, setEditingValue] = useState('');

  // 메일 스마트 입력 폼 상태
  const [intakeMailText, setIntakeMailText] = useState('');
  const [intakeRecipientType, setIntakeRecipientType] = useState('auto'); // 'auto' | 'to_customer' | 'from_customer' | 'internal'
  const [isIntaking, setIsIntaking] = useState(false);

  // 새 수동 업무 등록 폼 상태
  const [newForm, setNewForm] = useState({
    customer: currentCustomer || 'SK on',
    equipment: '',
    subject: '',
    priority: '보통',
    assignee: '본인(선임)',
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    summary: '',
    actionPlan: ''
  });

  // 서랍 내 빠른 회신/메모 작성 폼
  const [drawerNewNote, setDrawerNewNote] = useState('');
  const [drawerNoteType, setDrawerNoteType] = useState('outbound_customer'); // 'outbound_customer' | 'internal'

  const activeTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  // ── 4. Supabase 실시간 동기화 채널 및 영속성 연동 ──
  useEffect(() => {
    // A. Supabase 클라우드에서 최신 데이터 로드
    const loadRemoteTasks = async () => {
      try {
        const { data, error } = await supabase
          .from('spc_presets')
          .select('data')
          .eq('name', '[STACK_ASSISTANT] shared_tasks')
          .maybeSingle();

        if (!error && data && Array.isArray(data.data) && data.data.length > 0) {
          const cleaned = sanitizeTasks(data.data);
          setTasks(cleaned);
          try {
            localStorage.setItem('pm_stack_tasks', JSON.stringify(cleaned));
          } catch (e) {}
        }
      } catch (e) {
        console.warn("Supabase 태스크 로드 중 오류:", e);
      }
    };

    loadRemoteTasks();

    // B. Supabase Realtime 채널 구독 (Google Sheets 스타일 실시간 브로드캐스트)
    const channel = supabase.channel('stack_assistant_realtime')
      .on('broadcast', { event: 'tasks_updated' }, (payload) => {
        if (payload?.payload?.tasks) {
          const cleaned = sanitizeTasks(payload.payload.tasks);
          setTasks(cleaned);
          try {
            localStorage.setItem('pm_stack_tasks', JSON.stringify(cleaned));
          } catch (e) {}
          if (payload.payload.actionText) {
            showToast(`🔄 [실시간 협업] ${payload.payload.actionText}`);
          }
        }
      })
      .on('broadcast', { event: 'new_daou_mail' }, (payload) => {
        if (payload?.payload) {
          handleIncomingDaouMail(payload.payload);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 태스크 변경 시 클라우드 저장 및 실시간 브로드캐스트 전송
  const saveAndBroadcastTasks = async (nextTasks, actionText = "데이터가 갱신되었습니다.") => {
    const cleaned = sanitizeTasks(nextTasks);
    setTasks(cleaned);
    try {
      localStorage.setItem('pm_stack_tasks', JSON.stringify(cleaned));
    } catch (e) {}

    setIsSyncing(true);
    try {
      // 1. Supabase spc_presets에 영속 저장
      await supabase.from('spc_presets').upsert({
        name: '[STACK_ASSISTANT] shared_tasks',
        data: cleaned
      }, { onConflict: 'name' });

      // 2. 다른 모든 접속자 브라우저에 실시간 브로드캐스트
      const channel = supabase.channel('stack_assistant_realtime');
      await channel.send({
        type: 'broadcast',
        event: 'tasks_updated',
        payload: {
          tasks: cleaned,
          actionText
        }
      });
    } catch (e) {
      console.warn("동기화 전송 실패:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  // ── 5. 핵심: 메일 수신 시 자동 상태 추적 로직 (State Machine) ──
  // 이은성 주임 단독 수신(선임 미포함) 메일도 100% 감지 및 분류!
  const processMailStateTransition = (mailItem, existingTask = null) => {
    const isFromCustomer = mailItem.direction === 'inbound_customer';
    const isOutboundToCustomer = mailItem.direction === 'outbound_customer';
    const isInternalShare = mailItem.direction === 'internal';

    // 수신자 판별 (이은성 단독 수신 vs 공동 수신 vs 나 단독 수신)
    const recipLower = (mailItem.recipient || '').toLowerCase();
    const sendLower = (mailItem.sender || '').toLowerCase();
    const esMailLower = (eunseongEmail || 'les0415@twgroup.co.kr').toLowerCase();
    const myMailLower = (myEmail || 'cmj1012@twgroup.co.kr').toLowerCase();

    const hasEunseong = recipLower.includes('이은성') || recipLower.includes(esMailLower) || recipLower.includes('les0415') || sendLower.includes('이은성') || sendLower.includes(esMailLower);
    const hasMe = recipLower.includes('나') || recipLower.includes('선임') || recipLower.includes(myMailLower) || recipLower.includes('cmj1012') || sendLower.includes(myMailLower);
    const isSoloEunseong = hasEunseong && !hasMe;

    if (existingTask) {
      let nextStatus = existingTask.status;
      let toastAlert = "";

      if (isOutboundToCustomer) {
        // [핵심 조건 1] 고객사로 답변 메일 발송 시 -> '고객사회신완료'로 자동 처리!
        nextStatus = '고객사회신완료';
        toastAlert = `✅ [고객사 답변 완료] '${existingTask.subject}' 업무가 [고객사 회신완료]로 처리되었습니다!`;
      } else if (isFromCustomer) {
        // [핵심 조건 2] 완료 처리되었던 업무에 고객사가 다시 메일(재회신)을 보낸 경우 -> '재회신접수'로 즉각 자동 복구!
        if (existingTask.status === '고객사회신완료' || existingTask.status === '보류') {
          nextStatus = '재회신접수';
          toastAlert = `⚡ [고객사 재회신 감지!] '${existingTask.subject}' 건에 추가 회신이 도착하여 [진행중(재회신)]으로 자동 전환되었습니다!`;
        } else {
          nextStatus = '재회신접수';
          toastAlert = `📬 [고객사 추가 회신] '${existingTask.subject}' 건에 새로운 메일이 접수되었습니다.`;
        }
      } else if (isInternalShare) {
        if (existingTask.status === '요청접수') {
          nextStatus = '내부진행중';
          toastAlert = `📝 [내부 공유 확인] '${existingTask.subject}' 건이 [내부 진행중]으로 변경되었습니다.`;
        }
      }

      // 발신자가 이은성 주임이면 담당자 자동 매칭 확인
      let effectiveAssignee = existingTask.assignee;
      if (mailItem.sender.includes('이은성') || mailItem.sender.includes(eunseongEmail)) {
        if (effectiveAssignee === '미지정') effectiveAssignee = '이은성 주임';
      }

      const updatedTask = {
        ...existingTask,
        status: nextStatus,
        assignee: effectiveAssignee,
        isSoloEunseong: existingTask.isSoloEunseong || isSoloEunseong,
        lastSender: mailItem.sender,
        lastRecipient: mailItem.recipient,
        receivedAt: mailItem.sentAt || new Date().toISOString(),
        history: [mailItem, ...(existingTask.history || [])]
      };

      return { task: updatedTask, isNew: false, toastAlert };
    } else {
      // 신규 업무 생성
      const initialStatus = isFromCustomer ? '요청접수' : '내부진행중';

      // 수신자 기반 초기 담당자 스마트 판별
      let initialAssignee = '본인(선임)';
      if (isSoloEunseong) {
        initialAssignee = '이은성 주임';
      } else if (hasEunseong && hasMe) {
        initialAssignee = '공동';
      } else if (hasEunseong) {
        initialAssignee = '이은성 주임';
      } else {
        initialAssignee = '본인(선임)';
      }

      const newTask = {
        id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        threadId: `th-${Date.now()}`,
        customer: currentCustomer || 'SK on',
        equipment: '스택 설비 파트',
        subject: mailItem.subject,
        status: initialStatus,
        priority: isFromCustomer ? '높음' : '보통',
        assignee: initialAssignee,
        isSoloEunseong,
        lastSender: mailItem.sender,
        lastRecipient: mailItem.recipient,
        receivedAt: mailItem.sentAt || new Date().toISOString(),
        dueDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        summary: mailItem.body?.slice(0, 200) || mailItem.subject,
        actionPlan: isSoloEunseong
          ? '이은성 주임 단독 수신건 (선임 미참조). 이은성 주임 확인 및 기술 검토 진행'
          : '메일 확인 후 담당자 배정 및 기술 검토 진행',
        history: [mailItem]
      };

      const soloMsg = isSoloEunseong ? " [🧑 이은성 주임 단독 수신건 자동 감지]" : "";
      const toastAlert = `✨ [신규 업무 등록${soloMsg}] '${newTask.subject}' 업무가 접수되었습니다. (담당: ${initialAssignee})`;
      return { task: newTask, isNew: true, toastAlert };
    }
  };

  // 제목 정규화 함수 (Re:, Fwd:, [공람] 등 접두사 제거하여 같은 스레드로 매칭)
  const normalizeSubject = (str) => {
    return (str || '')
      .replace(/^(re|fwd|fw|답변|회신|전달|공람)\s*[:：]\s*/gi, '')
      .replace(/\[(re|fwd)\]/gi, '')
      .trim()
      .toLowerCase();
  };

  // 다우오피스 메일 텍스트/헤더 스마트 파서 (les0415@twgroup.co.kr 포함)
  const parseDaouOfficeText = (rawText) => {
    const lines = rawText.split('\n').map(l => l.trim());
    let subject = "";
    let sender = "";
    let recipient = "";
    let sentDate = new Date().toISOString();
    let bodyLines = [];
    let isBody = false;

    for (const line of lines) {
      if (!isBody) {
        if (/^(제목|Subject)\s*[:：]\s*(.*)/i.test(line)) {
          subject = line.replace(/^(제목|Subject)\s*[:：]\s*/i, '').trim();
        } else if (/^(보낸사람|From|발신자|발신)\s*[:：]\s*(.*)/i.test(line)) {
          sender = line.replace(/^(보낸사람|From|발신자|발신)\s*[:：]\s*/i, '').trim();
        } else if (/^(받는사람|To|수신자|수신)\s*[:：]\s*(.*)/i.test(line)) {
          recipient = line.replace(/^(받는사람|To|수신자|수신)\s*[:：]\s*/i, '').trim();
        } else if (/^(날짜|Date|보낸날짜)\s*[:：]\s*(.*)/i.test(line)) {
          const dtStr = line.replace(/^(날짜|Date|보낸날짜)\s*[:：]\s*/i, '').trim();
          try {
            const parsed = new Date(dtStr);
            if (!isNaN(parsed.getTime())) sentDate = parsed.toISOString();
          } catch (e) {}
        } else if (line === "" || line.startsWith("---") || line.startsWith("___")) {
          isBody = true;
        } else {
          bodyLines.push(line);
        }
      } else {
        bodyLines.push(line);
      }
    }

    if (!subject && bodyLines.length > 0) {
      subject = bodyLines[0].slice(0, 80);
    }

    const fullBody = bodyLines.join('\n').trim();

    // 발신자/수신자 성격 판별 (나 + 이은성 주임 les0415@twgroup.co.kr 매칭)
    let direction = 'inbound_customer';
    const lowerSender = sender.toLowerCase();
    const lowerRecip = recipient.toLowerCase();
    const myMailLower = (myEmail || 'cmj1012@twgroup.co.kr').toLowerCase();
    const esMailLower = (eunseongEmail || 'les0415@twgroup.co.kr').toLowerCase();

    const isInternalSender = lowerSender.includes('twgroup.co.kr') ||
                             lowerSender.includes(myMailLower) ||
                             lowerSender.includes(esMailLower) ||
                             lowerSender.includes('les0415') ||
                             lowerSender.includes('나') ||
                             lowerSender.includes('선임') ||
                             lowerSender.includes('이은성') ||
                             lowerSender.includes('은성');

    const isCustomerRecipient = lowerRecip.includes('sk') ||
                                lowerRecip.includes('samsung') ||
                                lowerRecip.includes('hyundai') ||
                                lowerRecip.includes('고객사');

    if (isInternalSender) {
      if (isCustomerRecipient) {
        direction = 'outbound_customer'; // 나와 이은성 주임이 고객사로 보낸 회신 메일 -> 완료 처리
      } else {
        direction = 'internal'; // 본인 ↔ 이은성 주임 간 내부 공유 메일
      }
    } else {
      direction = 'inbound_customer'; // 고객사에서 들어온 메일
    }

    return {
      subject: subject || "다우오피스 수신 메일",
      sender: sender || "고객사 담당자",
      recipient: recipient || `스택파트 (나, 이은성 주임)`,
      sentAt: sentDate,
      body: fullBody || "(본문 내용 없음)",
      direction
    };
  };

  // 다우오피스 수신 메일 처리 핸들러
  const handleIntakeSubmit = async () => {
    if (!intakeMailText.trim()) {
      alert("다우오피스 메일 내용이나 텍스트를 입력해주세요.");
      return;
    }

    setIsIntaking(true);
    try {
      const parsedMail = parseDaouOfficeText(intakeMailText);
      if (intakeRecipientType !== 'auto') {
        parsedMail.direction = intakeRecipientType;
      }

      // 1. 기존 동일 스레드 매칭 (제목 유사도 검사)
      const normInputSubj = normalizeSubject(parsedMail.subject);
      const matched = tasks.find(t => {
        const normExistSubj = normalizeSubject(t.subject);
        return normExistSubj === normInputSubj ||
               (normInputSubj.length > 10 && normExistSubj.includes(normInputSubj)) ||
               (normExistSubj.length > 10 && normInputSubj.includes(normExistSubj));
      });

      const { task: processedTask, isNew, toastAlert } = processMailStateTransition(parsedMail, matched);

      let nextTasks;
      if (isNew) {
        nextTasks = [processedTask, ...tasks];
      } else {
        nextTasks = tasks.map(t => t.id === processedTask.id ? processedTask : t);
      }

      await saveAndBroadcastTasks(nextTasks, toastAlert);
      showToast(toastAlert);
      setIntakeMailText('');
      setShowIntakeModal(false);
      setSelectedTaskId(processedTask.id);
      setShowDrawer(true);
    } catch (e) {
      alert("메일 분석 중 오류가 발생했습니다: " + e.message);
    } finally {
      setIsIntaking(false);
    }
  };

  // 백그라운드 데몬에서 수신된 메일 실시간 반영 (이은성 주임 계정 수신 포함)
  const handleIncomingDaouMail = (payload) => {
    const parsedMail = {
      subject: payload.subject,
      sender: payload.sender,
      recipient: payload.recipients,
      sentAt: payload.sentDate,
      body: payload.bodyText,
      direction: payload.senderType === 'customer' ? 'inbound_customer' : payload.senderType === 'internal' ? 'internal' : 'inbound_customer'
    };

    const normSubj = normalizeSubject(parsedMail.subject);
    const matched = tasks.find(t => normalizeSubject(t.subject) === normSubj);
    const { task: processedTask, isNew, toastAlert } = processMailStateTransition(parsedMail, matched);

    let nextTasks;
    if (isNew) nextTasks = [processedTask, ...tasks];
    else nextTasks = tasks.map(t => t.id === processedTask.id ? processedTask : t);

    saveAndBroadcastTasks(nextTasks, toastAlert);
    showToast(toastAlert);
  };

  // ── 6. 스프레드시트 인라인 셀 편집 핸들러 ──
  const handleStartEdit = (task, field) => {
    setEditingCell({ id: task.id, field });
    setEditingValue(task[field] || '');
  };

  const handleFinishEdit = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const nextTasks = tasks.map(t => {
      if (t.id === id) {
        return { ...t, [field]: editingValue };
      }
      return t;
    });

    setEditingCell(null);
    await saveAndBroadcastTasks(nextTasks, `'${field}' 필드가 수정되었습니다.`);
  };

  // 빠른 상태 변경 (Status 클릭 시)
  const handleCycleStatus = async (task, e) => {
    e?.stopPropagation();
    const statusCycle = ['요청접수', '내부진행중', '고객사회신완료', '재회신접수', '보류'];
    const curIdx = statusCycle.indexOf(task.status);
    const nextStatus = statusCycle[(curIdx + 1) % statusCycle.length];

    const nextTasks = tasks.map(t => t.id === task.id ? { ...t, status: nextStatus } : t);
    await saveAndBroadcastTasks(nextTasks, `'${task.subject}' 상태가 [${nextStatus}]로 변경되었습니다.`);
  };

  // 빠른 담당자 변경 (본인 <-> 이은성 주임 <-> 공동)
  const handleCycleAssignee = async (task, e) => {
    e?.stopPropagation();
    const assigneeCycle = ['본인(선임)', '이은성 주임', '공동', '미지정'];
    const curIdx = assigneeCycle.indexOf(task.assignee);
    const nextAssignee = assigneeCycle[(curIdx + 1) % assigneeCycle.length];

    const nextTasks = tasks.map(t => t.id === task.id ? { ...t, assignee: nextAssignee } : t);
    await saveAndBroadcastTasks(nextTasks, `담당자가 [${nextAssignee}]으로 지정되었습니다.`);
  };

  // 서랍 내 회신/의견 추가
  const handleAddDrawerNote = async () => {
    if (!drawerNewNote.trim() || !activeTask) return;

    const newMail = {
      id: `mail-${Date.now()}`,
      direction: drawerNoteType,
      sender: drawerNoteType === 'outbound_customer' ? `나(선임) <${myEmail}>` : '나(선임)',
      recipient: drawerNoteType === 'outbound_customer' ? activeTask.lastSender : `이은성 주임 <${eunseongEmail}>`,
      sentAt: new Date().toISOString(),
      subject: drawerNoteType === 'outbound_customer' ? `Re: ${activeTask.subject}` : `[내부 협의] ${activeTask.subject}`,
      body: drawerNewNote
    };

    const { task: updatedTask, toastAlert } = processMailStateTransition(newMail, activeTask);
    const nextTasks = tasks.map(t => t.id === activeTask.id ? updatedTask : t);

    await saveAndBroadcastTasks(nextTasks, toastAlert);
    showToast(toastAlert);
    setDrawerNewNote('');
  };

  // ── 7. 엑셀(XLSX) 내보내기 ──
  const handleExportExcel = () => {
    try {
      const exportRows = filteredTasks.map((t, idx) => ({
        "No": idx + 1,
        "상태": t.status,
        "우선순위": t.priority,
        "고객사": t.customer,
        "설비/호기": t.equipment,
        "업무/메일 제목": t.subject,
        "이은성 주임 단독수신 여부": t.isSoloEunseong ? "O (선임 미포함)" : "X",
        "담당자": t.assignee,
        "최근 발신자": t.lastSender,
        "최근 수신일시": t.receivedAt ? t.receivedAt.replace('T', ' ').slice(0, 16) : "",
        "목표 기한": t.dueDate,
        "업무 요약": t.summary,
        "향후 진행 방향 / 비고": t.actionPlan,
        "스레드 메일 수": t.history?.length || 0
      }));

      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "스택파트_업무시트");
      XLSX.writeFile(wb, `스택파트_메일업무종합_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast("📥 엑셀 스프레드시트가 성공적으로 다운로드되었습니다!");
    } catch (e) {
      alert("엑셀 내보내기 실패: " + e.message);
    }
  };

  // ── 8. 필터링 및 통계 계산 ──
  const stats = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter(t => t.status === '요청접수').length;
    const inProgress = tasks.filter(t => t.status === '내부진행중').length;
    const completed = tasks.filter(t => t.status === '고객사회신완료').length;
    const reopened = tasks.filter(t => t.status === '재회신접수').length;
    const soloEunseongCount = tasks.filter(t => t.isSoloEunseong).length;
    return { total, pending, inProgress, completed, reopened, soloEunseongCount };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // 고객사 필터
      if (customerFilter !== '전체' && t.customer !== customerFilter) return false;

      // 담당자 필터 (본인 vs 이은성 주임 vs 공동)
      if (assigneeFilter === '내 업무(선임)' && t.assignee !== '본인(선임)') return false;
      if (assigneeFilter === '이은성 주임' && t.assignee !== '이은성 주임') return false;
      if (assigneeFilter === '공동' && t.assignee !== '공동') return false;

      // 상태 필터
      if (statusFilter === '진행중' && t.status === '고객사회신완료') return false;
      if (statusFilter === '재회신접수' && t.status !== '재회신접수') return false;
      if (statusFilter === '고객사회신완료' && t.status !== '고객사회신완료') return false;

      // 수신처 필터 (이은성 주임 단독 수신 필터링 핵심!)
      if (recipientFilter === 'solo_eunseong' && !t.isSoloEunseong) return false;
      if (recipientFilter === 'joint' && (t.isSoloEunseong || t.assignee !== '공동')) return false;
      if (recipientFilter === 'solo_me' && t.isSoloEunseong) return false;

      // 검색어 필터
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${t.subject} ${t.equipment} ${t.lastSender} ${t.summary} ${t.actionPlan}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [tasks, customerFilter, assigneeFilter, statusFilter, recipientFilter, searchQuery]);

  return (
    <div className="stack-assistant-container">
      {/* ── 토스트 알림 ── */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          zIndex: 3000,
          background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          border: '1.5px solid #8b5cf6',
          fontSize: '13px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'fadeIn 0.2s ease'
        }}>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ── 최상단 헤더 카드 ── */}
      <div className="stack-assistant-header-card">
        <div className="stack-assistant-title-group">
          <div className="stack-assistant-icon-badge">
            📬
          </div>
          <div className="stack-assistant-title-text">
            <h2>
              <span>스택파트 스마트 업무 비서</span>
              <span style={{ fontSize: '12px', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', padding: '2px 8px', borderRadius: '8px' }}>
                나 & 이은성 주임 협업 허브
              </span>
            </h2>
            <p>
              본인(<code style={{ color: '#8b5cf6' }}>{myEmail}</code>) 및 이은성 주임(<code style={{ color: '#0ea5e9', fontWeight: 'bold' }}>{eunseongEmail}</code>) 단독/공동 수신 메일 실시간 통합 추적
            </p>
          </div>
        </div>

        <div className="stack-assistant-header-actions">
          <div className="realtime-sync-badge">
            <span className="realtime-pulse-dot" />
            <span>실시간 협업 동기화 켜짐 (Google Sheets Sync)</span>
            {isSyncing && <span style={{ fontSize: '10px', color: '#6366f1' }}>• 동기화 중...</span>}
          </div>

          <button
            type="button"
            className="sheet-btn daou-btn"
            onClick={() => setShowIntakeModal(true)}
            title="다우오피스 메일을 복사해 붙여넣으면 즉시 스마트 분석하여 시트에 반영합니다"
          >
            <span>✉️</span>
            <span>다우 메일 빠른 등록</span>
          </button>

          <button
            type="button"
            className="sheet-btn primary"
            onClick={() => setShowNewTaskModal(true)}
          >
            <span>➕</span>
            <span>새 업무 추가</span>
          </button>

          <button
            type="button"
            className="sheet-btn"
            onClick={() => setShowGuideModal(true)}
            title="다우오피스 IMAP/수신규칙 및 이은성 주임 메일 연동 설정 가이드"
          >
            <span>⚙️</span>
            <span>다우오피스 연동 설정</span>
          </button>

          <button
            type="button"
            className="sheet-btn"
            onClick={handleExportExcel}
            title="현재 시트 목록을 엑셀 파일로 다운로드합니다"
          >
            <span>📊</span>
            <span>엑셀 다운로드</span>
          </button>
        </div>
      </div>

      {/* ── KPI 상태 요약 카드 ── */}
      <div className="stack-kpi-grid">
        <div
          className={`stack-kpi-card ${statusFilter === '전체' && recipientFilter === '전체' ? 'active-filter' : ''}`}
          onClick={() => { setStatusFilter('전체'); setRecipientFilter('전체'); }}
        >
          <div className="stack-kpi-header">
            <span>전체 관리 업무</span>
            <span>📋</span>
          </div>
          <div className="stack-kpi-value">
            {stats.total}
            <span className="kpi-unit">건</span>
          </div>
          <div className="stack-kpi-sub">본인 및 이은성 주임 취합 전체 건수</div>
        </div>

        {/* ⭐️ 이은성 주임 단독 수신 KPI 카드 */}
        <div
          className={`stack-kpi-card ${recipientFilter === 'solo_eunseong' ? 'active-filter' : ''}`}
          onClick={() => {
            setRecipientFilter(prev => prev === 'solo_eunseong' ? '전체' : 'solo_eunseong');
          }}
          style={{ borderColor: '#0ea5e9' }}
        >
          <div className="stack-kpi-header" style={{ color: '#0ea5e9' }}>
            <span>이은성 주임 단독 수신</span>
            <span>🧑</span>
          </div>
          <div className="stack-kpi-value" style={{ color: '#0ea5e9' }}>
            {stats.soloEunseongCount}
            <span className="kpi-unit">건</span>
          </div>
          <div className="stack-kpi-sub">선임 미참조 · 이은성 주임 단독 수신건</div>
        </div>

        <div
          className={`stack-kpi-card ${statusFilter === '재회신접수' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter('재회신접수')}
          style={{ borderColor: stats.reopened > 0 ? '#f43f5e' : undefined }}
        >
          <div className="stack-kpi-header" style={{ color: '#f43f5e' }}>
            <span>고객사 재회신 (긴급)</span>
            <span>⚡</span>
          </div>
          <div className="stack-kpi-value" style={{ color: '#f43f5e' }}>
            {stats.reopened}
            <span className="kpi-unit">건</span>
          </div>
          <div className="stack-kpi-sub">완료 후 고객사 추가 질문/재오픈</div>
        </div>

        <div
          className={`stack-kpi-card ${statusFilter === '진행중' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter('진행중')}
        >
          <div className="stack-kpi-header" style={{ color: '#3b82f6' }}>
            <span>내부 진행중</span>
            <span>🔄</span>
          </div>
          <div className="stack-kpi-value" style={{ color: '#3b82f6' }}>
            {stats.inProgress + stats.pending}
            <span className="kpi-unit">건</span>
          </div>
          <div className="stack-kpi-sub">검토 및 답변 준비 진행 현황</div>
        </div>

        <div
          className={`stack-kpi-card ${statusFilter === '고객사회신완료' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter('고객사회신완료')}
        >
          <div className="stack-kpi-header" style={{ color: '#10b981' }}>
            <span>고객사 회신완료</span>
            <span>✓</span>
          </div>
          <div className="stack-kpi-value" style={{ color: '#10b981' }}>
            {stats.completed}
            <span className="kpi-unit">건</span>
          </div>
          <div className="stack-kpi-sub">답변 완료 처리 (재회신 시 자동 전환)</div>
        </div>
      </div>

      {/* ── 구글 스프레드시트 툴바 ── */}
      <div className="sheet-toolbar">
        <div className="sheet-toolbar-left">
          {/* 뷰 모드 토글 (스프레드시트 vs 칸반) */}
          <div className="sheet-btn-toggle-group">
            <button
              type="button"
              className={`sheet-btn-toggle ${viewMode === 'sheet' ? 'active' : ''}`}
              onClick={() => setViewMode('sheet')}
            >
              📊 시트 그리드
            </button>
            <button
              type="button"
              className={`sheet-btn-toggle ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => setViewMode('kanban')}
            >
              📌 칸반 보드
            </button>
          </div>

          {/* 수신 대상 필터 (이은성 단독 vs 공동 vs 나 단독) */}
          <select
            className="sheet-select"
            value={recipientFilter}
            onChange={e => setRecipientFilter(e.target.value)}
            style={{ fontWeight: 700, borderColor: recipientFilter === 'solo_eunseong' ? '#0ea5e9' : undefined }}
          >
            <option value="전체">📬 수신처: 전체 메일</option>
            <option value="solo_eunseong">🧑 이은성 주임 단독 수신 (나 미포함) ★</option>
            <option value="joint">👥 나 & 이은성 주임 공동 수신</option>
            <option value="solo_me">👤 나(선임) 단독 수신</option>
          </select>

          {/* 담당자 필터: 본인 vs 이은성 주임 vs 공동 */}
          <select
            className="sheet-select"
            value={assigneeFilter}
            onChange={e => setAssigneeFilter(e.target.value)}
          >
            <option value="전체">👤 담당자: 전체 보기</option>
            <option value="내 업무(선임)">👤 내 업무 (본인 전용)</option>
            <option value="이은성 주임">🧑 이은성 주임 담당 업무</option>
            <option value="공동">👥 공동 협업 건</option>
          </select>

          {/* 고객사 필터 */}
          <select
            className="sheet-select"
            value={customerFilter}
            onChange={e => setCustomerFilter(e.target.value)}
          >
            <option value="전체">🏢 고객사: 전체</option>
            <option value="SK on">SK on</option>
            <option value="Samsung SDI">Samsung SDI</option>
            <option value="Hyundai">Hyundai</option>
          </select>

          {/* 상태 필터 */}
          <select
            className="sheet-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="전체">🏷️ 상태: 전체</option>
            <option value="진행중">🔄 진행중 (미완료 전체)</option>
            <option value="재회신접수">⚡ 재회신 접수 (긴급 건)</option>
            <option value="고객사회신완료">✅ 고객사 회신완료 건</option>
          </select>
        </div>

        <div className="sheet-toolbar-right">
          <input
            type="text"
            className="sheet-search-input"
            placeholder="🔍 제목, 발신자, 설비, 내용 검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            총 <b>{filteredTasks.length}</b>건 표시 중
          </span>
        </div>
      </div>

      {/* ── 메인 뷰: 스프레드시트 그리드 (Google Sheets Style) ── */}
      {viewMode === 'sheet' ? (
        <div className="spreadsheet-grid-wrapper">
          <div className="spreadsheet-table-container">
            <table className="spreadsheet-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>No</th>
                  <th style={{ width: '130px' }}>진행 상태 (클릭 변경)</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>우선순위</th>
                  <th style={{ width: '100px' }}>고객사</th>
                  <th style={{ width: '160px' }}>설비 / 라인</th>
                  <th style={{ width: '340px' }}>업무 / 메일 제목 (클릭 시 스레드)</th>
                  <th style={{ width: '115px' }}>담당자 (클릭)</th>
                  <th style={{ width: '170px' }}>최근 발신자</th>
                  <th style={{ width: '110px' }}>최근 수신일</th>
                  <th style={{ width: '105px' }}>목표 기한</th>
                  <th style={{ minWidth: '220px' }}>향후 진행 방향 / 비고</th>
                  <th style={{ width: '65px', textAlign: 'center' }}>메일</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                      조건에 일치하는 스택파트 업무가 없습니다. '다우 메일 빠른 등록' 또는 '새 업무 추가'를 눌러보세요.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task, idx) => {
                    const isUrgent = task.status === '재회신접수';
                    const isDone = task.status === '고객사회신완료';

                    return (
                      <tr
                        key={task.id}
                        className={`${isUrgent ? 'row-urgent' : ''} ${isDone ? 'row-done' : ''}`}
                      >
                        {/* No */}
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>
                          {idx + 1}
                        </td>

                        {/* 상태 배지 (클릭 시 자동 순환 변경) */}
                        <td>
                          <span
                            className={`status-pill ${
                              task.status === '요청접수' ? 'status-pending' :
                              task.status === '내부진행중' ? 'status-progress' :
                              task.status === '고객사회신완료' ? 'status-done' :
                              task.status === '재회신접수' ? 'status-reopened' : 'status-hold'
                            }`}
                            onClick={(e) => handleCycleStatus(task, e)}
                            title="클릭 시 상태를 빠르게 변경합니다 (고객사 답변 시 '완료', 재회신 시 '재회신접수'로 자동 전환)"
                          >
                            {task.status === '요청접수' && '⏳ 요청접수'}
                            {task.status === '내부진행중' && '🔄 내부진행중'}
                            {task.status === '고객사회신완료' && '✅ 회신완료'}
                            {task.status === '재회신접수' && '⚡ 재회신접수'}
                            {task.status === '보류' && '⏸️ 보류'}
                          </span>
                        </td>

                        {/* 우선순위 */}
                        <td style={{ textAlign: 'center' }}>
                          <span className={`priority-tag ${
                            task.priority === '긴급' ? 'urgent' :
                            task.priority === '높음' ? 'high' :
                            task.priority === '보통' ? 'normal' : 'low'
                          }`}>
                            {task.priority}
                          </span>
                        </td>

                        {/* 고객사 */}
                        <td style={{ fontWeight: 700 }}>
                          {task.customer}
                        </td>

                        {/* 설비/라인 (인라인 편집 지원) */}
                        <td>
                          {editingCell?.id === task.id && editingCell?.field === 'equipment' ? (
                            <input
                              type="text"
                              className="inline-cell-input"
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={handleFinishEdit}
                              onKeyDown={e => e.key === 'Enter' && handleFinishEdit()}
                              autoFocus
                            />
                          ) : (
                            <div
                              className="editable-cell"
                              onDoubleClick={() => handleStartEdit(task, 'equipment')}
                              title="더블클릭하여 설비명을 수정합니다"
                            >
                              {task.equipment || '-'}
                            </div>
                          )}
                        </td>

                        {/* 업무 제목 (이은성 단독 수신 배지 표시) */}
                        <td>
                          <div
                            style={{
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: 'var(--text-primary)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              flexWrap: 'wrap'
                            }}
                            onClick={() => {
                              setSelectedTaskId(task.id);
                              setShowDrawer(true);
                            }}
                            title="클릭하여 오고 간 전체 메일 히스토리 및 회신 작성"
                          >
                            {task.isSoloEunseong && (
                              <span className="solo-eunseong-tag" title="선임(본인)이 참조에 포함되지 않고 이은성 주임님께만 단독으로 온 메일입니다">
                                🧑 이은성 단독
                              </span>
                            )}
                            {task.status === '재회신접수' && (
                              <span style={{ color: '#f43f5e', fontSize: '11px', fontWeight: 900 }}>[재회신]</span>
                            )}
                            <span style={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                              {task.subject}
                            </span>
                          </div>
                        </td>

                        {/* 담당자 (클릭 시 본인/이은성 주임/공동 순환) */}
                        <td>
                          <span
                            className={`assignee-badge ${
                              task.assignee === '본인(선임)' ? 'mine' :
                              task.assignee === '이은성 주임' ? 'junior' :
                              task.assignee === '공동' ? 'shared' : 'unassigned'
                            }`}
                            onClick={(e) => handleCycleAssignee(task, e)}
                            title="클릭 시 담당자를 변경합니다 (본인 ↔ 이은성 주임 ↔ 공동)"
                          >
                            {task.assignee === '본인(선임)' && '👤 본인'}
                            {task.assignee === '이은성 주임' && '🧑 이은성 주임'}
                            {task.assignee === '공동' && '👥 공동'}
                            {task.assignee === '미지정' && '❓ 미지정'}
                          </span>
                        </td>

                        {/* 최근 발신자 */}
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {task.lastSender}
                        </td>

                        {/* 최근 수신일 */}
                        <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {task.receivedAt ? task.receivedAt.slice(5, 16).replace('T', ' ') : '-'}
                        </td>

                        {/* 목표 기한 */}
                        <td>
                          {editingCell?.id === task.id && editingCell?.field === 'dueDate' ? (
                            <input
                              type="date"
                              className="inline-cell-input"
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={handleFinishEdit}
                              autoFocus
                            />
                          ) : (
                            <div
                              className="editable-cell"
                              onDoubleClick={() => handleStartEdit(task, 'dueDate')}
                              style={{
                                color: task.dueDate && new Date(task.dueDate) < new Date() && task.status !== '고객사회신완료' ? '#f43f5e' : undefined,
                                fontWeight: 600
                              }}
                            >
                              {task.dueDate || '-'}
                            </div>
                          )}
                        </td>

                        {/* 향후 진행 방향 / 비고 (인라인 편집) */}
                        <td>
                          {editingCell?.id === task.id && editingCell?.field === 'actionPlan' ? (
                            <input
                              type="text"
                              className="inline-cell-input"
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={handleFinishEdit}
                              onKeyDown={e => e.key === 'Enter' && handleFinishEdit()}
                              autoFocus
                            />
                          ) : (
                            <div
                              className="editable-cell"
                              onDoubleClick={() => handleStartEdit(task, 'actionPlan')}
                              title="더블클릭하여 진행 방향을 수정합니다"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {task.actionPlan || '진행 방향 입력...'}
                            </div>
                          )}
                        </td>

                        {/* 메일 수 */}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            background: 'var(--bg-card-subtle)',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-subtle)'
                          }}>
                            ✉️ {task.history?.length || 0}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── 메인 뷰: 칸반 보드 뷰 (Kanban View) ── */
        <div className="stack-kanban-board">
          {[
            { id: '요청접수', label: '⏳ 신규 요청 접수', color: '#f59e0b' },
            { id: '내부진행중', label: '🔄 내부 검토 / 진행중', color: '#3b82f6' },
            { id: '재회신접수', label: '⚡ 고객사 재회신 (긴급)', color: '#f43f5e' },
            { id: '고객사회신완료', label: '✅ 고객사 회신완료', color: '#10b981' }
          ].map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);

            return (
              <div key={col.id} className="kanban-column">
                <div className="kanban-column-header" style={{ borderColor: col.color }}>
                  <span style={{ color: col.color }}>{col.label}</span>
                  <span style={{ background: 'var(--bg-card)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>
                    {colTasks.length}건
                  </span>
                </div>

                <div className="kanban-cards-list">
                  {colTasks.length === 0 ? (
                    <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                      해당 상태의 업무가 없습니다
                    </div>
                  ) : (
                    colTasks.map(task => (
                      <div
                        key={task.id}
                        className="kanban-card"
                        onClick={() => {
                          setSelectedTaskId(task.id);
                          setShowDrawer(true);
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)' }}>
                              {task.customer} · {task.equipment}
                            </span>
                            {task.isSoloEunseong && (
                              <span className="solo-eunseong-tag" style={{ fontSize: '9.5px', padding: '0 4px' }}>
                                단독
                              </span>
                            )}
                          </div>
                          <span className={`priority-tag ${task.priority === '긴급' ? 'urgent' : task.priority === '높음' ? 'high' : 'normal'}`}>
                            {task.priority}
                          </span>
                        </div>

                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {task.subject}
                        </div>

                        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', background: 'var(--bg-card-subtle)', padding: '6px 8px', borderRadius: '6px' }}>
                          {task.summary?.slice(0, 70)}...
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          <span className={`assignee-badge ${task.assignee === '본인(선임)' ? 'mine' : 'junior'}`}>
                            {task.assignee}
                          </span>
                          <span>기한: {task.dueDate || '-'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 메일 스레드 타임라인 서랍 (Slide-in Drawer) ── */}
      {showDrawer && activeTask && (
        <div className="thread-drawer-overlay" onClick={() => setShowDrawer(false)}>
          <div className="thread-drawer" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <h3>
                  <span>{activeTask.customer}</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>· {activeTask.equipment}</span>
                  {activeTask.isSoloEunseong && (
                    <span className="solo-eunseong-tag" style={{ marginLeft: '8px' }}>
                      🧑 이은성 주임 단독 수신 (선임 미포함)
                    </span>
                  )}
                </h3>
                <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px', color: 'var(--text-primary)' }}>
                  {activeTask.subject}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDrawer(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </div>

            <div className="drawer-body">
              {/* 상태 요약 바 */}
              <div style={{
                background: 'var(--bg-card-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block' }}>현재 상태</span>
                  <span
                    className={`status-pill ${
                      activeTask.status === '고객사회신완료' ? 'status-done' :
                      activeTask.status === '재회신접수' ? 'status-reopened' : 'status-progress'
                    }`}
                    onClick={(e) => handleCycleStatus(activeTask, e)}
                  >
                    {activeTask.status} (클릭 변경)
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block' }}>담당자</span>
                  <span
                    className={`assignee-badge ${activeTask.assignee === '본인(선임)' ? 'mine' : 'junior'}`}
                    onClick={(e) => handleCycleAssignee(activeTask, e)}
                  >
                    {activeTask.assignee} (클릭 변경)
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block' }}>목표 기한</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 700 }}>{activeTask.dueDate || '미지정'}</span>
                </div>
              </div>

              {/* 진행 방향 및 요약 */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '10px', padding: '12px 16px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  🎯 향후 진행 방향 / 기술 조치 계획
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                  {activeTask.actionPlan || '등록된 조치 계획이 없습니다.'}
                </div>
              </div>

              {/* 메일 타임라인 이력 */}
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>📬 주고받은 메일 히스토리 ({activeTask.history?.length || 0}건)</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>최근순 정렬</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {(activeTask.history || []).map((mail, mIdx) => (
                    <div key={mail.id || mIdx} className="timeline-item">
                      <div className="timeline-avatar">
                        {mail.direction === 'inbound_customer' ? '🏢' :
                         mail.direction === 'outbound_customer' ? '📤' : '💬'}
                      </div>

                      <div className={`timeline-content-card ${
                        mail.direction === 'inbound_customer' ? 'inbound-customer' :
                        mail.direction === 'outbound_customer' ? 'outbound-reply' : 'internal-share'
                      }`}>
                        <div className="timeline-meta">
                          <div className="timeline-sender">
                            <span>{mail.sender}</span>
                            <span className={`timeline-badge-tag ${
                              mail.direction === 'inbound_customer' ? 'customer' :
                              mail.direction === 'outbound_customer' ? 'reply' : 'internal'
                            }`}>
                              {mail.direction === 'inbound_customer' ? '고객사 수신' :
                               mail.direction === 'outbound_customer' ? '고객사 회신완료' : '내부 공유'}
                            </span>
                          </div>
                          <span>{mail.sentAt ? mail.sentAt.replace('T', ' ').slice(0, 16) : ''}</span>
                        </div>

                        <div className="timeline-subject">{mail.subject}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          수신자: {mail.recipient}
                        </div>
                        <div className="timeline-body-text">{mail.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 새 회신 / 내부 의견 입력 창 */}
              <div style={{
                background: 'var(--bg-card-subtle)',
                border: '1.5px solid #8b5cf6',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginTop: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    ✍️ 새 메일 회신 또는 내부 의견 등록
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className={`sheet-btn ${drawerNoteType === 'outbound_customer' ? 'primary' : ''}`}
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      onClick={() => setDrawerNoteType('outbound_customer')}
                    >
                      고객사 답변 발송 (상태 자동 완료)
                    </button>
                    <button
                      type="button"
                      className={`sheet-btn ${drawerNoteType === 'internal' ? 'primary' : ''}`}
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                      onClick={() => setDrawerNoteType('internal')}
                    >
                      이은성 주임과 공유 / 내부 메모
                    </button>
                  </div>
                </div>

                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder={drawerNoteType === 'outbound_customer'
                    ? "고객사로 발송한 회신 메일 본문을 입력하세요. 등록 시 상태가 자동으로 [고객사 회신완료]로 처리됩니다."
                    : `이은성 주임(${eunseongEmail}) 또는 내부 관계자와 공유할 메모 내용을 입력하세요.`}
                  value={drawerNewNote}
                  onChange={e => setDrawerNewNote(e.target.value)}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="sheet-btn primary"
                    onClick={handleAddDrawerNote}
                  >
                    <span>{drawerNoteType === 'outbound_customer' ? '✅ 고객사 답변 등록 (완료 처리)' : '💬 내부 메모 추가'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Thread ID: {activeTask.threadId}
              </span>
              <button
                type="button"
                className="sheet-btn"
                onClick={() => setShowDrawer(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 모달: 다우오피스 메일 스마트 빠른 등록 ── */}
      {showIntakeModal && (
        <div className="stack-modal-overlay" onClick={() => setShowIntakeModal(false)}>
          <div className="stack-modal-card" onClick={e => e.stopPropagation()}>
            <div className="stack-modal-header">
              <h3>
                <span>📬</span>
                <span>다우오피스 메일 스마트 빠른 등록</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowIntakeModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div className="stack-modal-body">
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                다우오피스 웹메일에서 <b>[보낸사람 / 받는사람 / 제목 / 본문]</b>을 그대로 복사하여 아래에 붙여넣으세요.<br />
                스마트 파서가 고객사, 설비 및 <b>이은성 주임 단독 수신 여부(선임 미포함)</b>를 자동 식별하여 시트에 자동 등록합니다.
              </p>

              <div className="form-group">
                <label>메일 성격 수동 지정 (기본: 자동 판별)</label>
                <select
                  className="form-select"
                  value={intakeRecipientType}
                  onChange={e => setIntakeRecipientType(e.target.value)}
                >
                  <option value="auto">✨ 자동 판별 (발신자/수신자 분석)</option>
                  <option value="inbound_customer">🏢 고객사에서 온 신규 요청 / 재회신 메일 (이은성 주임 단독 포함)</option>
                  <option value="outbound_customer">📤 나와 이은성 주임이 고객사에 보낸 답변 메일 (등록 시 완료 처리)</option>
                  <option value="internal">💬 본인 ↔ 이은성 주임 간 내부 협의/공유 메일</option>
                </select>
              </div>

              <div className="form-group">
                <label>다우오피스 메일 텍스트 붙여넣기</label>
                <textarea
                  className="form-textarea"
                  rows={9}
                  placeholder={`[이은성 주임 단독 수신 메일 예시]
보낸사람: 박민우 프로 <mw.park@samsung.com>
받는사람: 이은성 주임 <les0415@twgroup.co.kr>
날짜: 2026-10-06 14:30
제목: [SDI 울산] 스택 롤러 부품 변경 사양 문의

이은성 주임님 안녕하십니까.
울산 SDI 현장 박민우입니다.
스택 텐션 롤러 축 가공 도면 및 납기 확인 부탁드립니다.`}
                  value={intakeMailText}
                  onChange={e => setIntakeMailText(e.target.value)}
                />
              </div>
            </div>

            <div className="stack-modal-footer">
              <button
                type="button"
                className="sheet-btn"
                onClick={() => setShowIntakeModal(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="sheet-btn daou-btn"
                disabled={isIntaking}
                onClick={handleIntakeSubmit}
              >
                {isIntaking ? '분석 중...' : '⚡ 스마트 등록 및 시트 반영'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 모달: 새 업무 수동 추가 ── */}
      {showNewTaskModal && (
        <div className="stack-modal-overlay" onClick={() => setShowNewTaskModal(false)}>
          <div className="stack-modal-card" onClick={e => e.stopPropagation()}>
            <div className="stack-modal-header">
              <h3>
                <span>➕</span>
                <span>스택파트 새 업무 수동 등록</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNewTaskModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div className="stack-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>고객사</label>
                  <select
                    className="form-select"
                    value={newForm.customer}
                    onChange={e => setNewForm({ ...newForm, customer: e.target.value })}
                  >
                    <option value="SK on">SK on</option>
                    <option value="Samsung SDI">Samsung SDI</option>
                    <option value="Hyundai">Hyundai</option>
                    <option value="기타">기타</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>담당자 배정</label>
                  <select
                    className="form-select"
                    value={newForm.assignee}
                    onChange={e => setNewForm({ ...newForm, assignee: e.target.value })}
                  >
                    <option value="본인(선임)">본인(선임)</option>
                    <option value="이은성 주임">이은성 주임</option>
                    <option value="공동">공동</option>
                    <option value="미지정">미지정</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>설비 / 라인 / 공정명</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="예: 헝가리 이반차 Stacking #3, 서산 1호기 등"
                  value={newForm.equipment}
                  onChange={e => setNewForm({ ...newForm, equipment: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>업무 / 메일 제목</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="업무 제목을 명확하게 입력하세요"
                  value={newForm.subject}
                  onChange={e => setNewForm({ ...newForm, subject: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label>우선순위</label>
                  <select
                    className="form-select"
                    value={newForm.priority}
                    onChange={e => setNewForm({ ...newForm, priority: e.target.value })}
                  >
                    <option value="보통">보통</option>
                    <option value="높음">높음</option>
                    <option value="긴급">긴급</option>
                    <option value="낮음">낮음</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>목표 회신 기한</label>
                  <input
                    type="date"
                    className="form-input"
                    value={newForm.dueDate}
                    onChange={e => setNewForm({ ...newForm, dueDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>핵심 요청사항 / 요약</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="고객사 또는 유관부서의 핵심 요청 내용"
                  value={newForm.summary}
                  onChange={e => setNewForm({ ...newForm, summary: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>향후 진행 방향 / 답변 계획</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="담당자가 취할 조치 계획 및 답변 일정"
                  value={newForm.actionPlan}
                  onChange={e => setNewForm({ ...newForm, actionPlan: e.target.value })}
                />
              </div>
            </div>

            <div className="stack-modal-footer">
              <button
                type="button"
                className="sheet-btn"
                onClick={() => setShowNewTaskModal(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="sheet-btn primary"
                onClick={async () => {
                  if (!newForm.subject.trim()) {
                    alert("업무 제목을 입력해주세요.");
                    return;
                  }

                  const isSolo = newForm.assignee === '이은성 주임';
                  const createdTask = {
                    id: `task-${Date.now()}`,
                    threadId: `th-${Date.now()}`,
                    customer: newForm.customer,
                    equipment: newForm.equipment || '스택 설비 파트',
                    subject: newForm.subject,
                    status: '내부진행중',
                    priority: newForm.priority,
                    assignee: newForm.assignee,
                    isSoloEunseong: isSolo,
                    lastSender: '직접 등록',
                    lastRecipient: newForm.assignee,
                    receivedAt: new Date().toISOString(),
                    dueDate: newForm.dueDate,
                    summary: newForm.summary,
                    actionPlan: newForm.actionPlan,
                    history: [{
                      id: `mail-${Date.now()}`,
                      direction: 'internal',
                      sender: '직접 등록',
                      recipient: newForm.assignee,
                      sentAt: new Date().toISOString(),
                      subject: newForm.subject,
                      body: newForm.summary || newForm.actionPlan || '업무 등록'
                    }]
                  };

                  const nextTasks = [createdTask, ...tasks];
                  await saveAndBroadcastTasks(nextTasks, `새 업무 '${createdTask.subject}'가 등록되었습니다.`);
                  setShowNewTaskModal(false);
                  showToast("✨ 새 업무가 스프레드시트에 성공적으로 추가되었습니다!");
                }}
              >
                저장 및 시트 추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 모달: 다우오피스 계정 연동 설정 및 가이드 ── */}
      {showGuideModal && (
        <div className="stack-modal-overlay" onClick={() => setShowGuideModal(false)}>
          <div className="stack-modal-card" style={{ width: '760px' }} onClick={e => e.stopPropagation()}>
            <div className="stack-modal-header">
              <h3>
                <span>⚙️</span>
                <span>다우오피스 연동 및 이은성 주임(les0415) 메일 추적 설정</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div className="stack-modal-body" style={{ fontSize: '13px', lineHeight: 1.65 }}>
              {/* 메일 주소 직접 설정 폼 */}
              <div style={{ background: 'var(--bg-card)', padding: '16px 18px', borderRadius: '12px', border: '1.5px solid #8b5cf6', boxShadow: 'var(--shadow-xs)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📬</span>
                  <span>연동할 다우오피스 회사 메일 주소 설정</span>
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>본인(선임) 다우 메일 주소</label>
                    <input
                      type="email"
                      className="form-input"
                      value={myEmail}
                      onChange={e => setMyEmail(e.target.value)}
                      placeholder="예: cmj1012@twgroup.co.kr"
                    />
                  </div>
                  <div className="form-group">
                    <label>이은성 주임 다우 메일 주소</label>
                    <input
                      type="email"
                      className="form-input"
                      value={eunseongEmail}
                      onChange={e => setEunseongEmail(e.target.value)}
                      placeholder="예: les0415@twgroup.co.kr"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="sheet-btn primary"
                    onClick={() => saveEmailSettings(myEmail, eunseongEmail)}
                  >
                    메일 주소 저장 및 동기화 반영
                  </button>
                </div>
              </div>

              <div style={{ background: 'rgba(14, 165, 233, 0.08)', padding: '14px 18px', borderRadius: '10px', border: '1px solid rgba(14, 165, 233, 0.3)', marginTop: '8px' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#0284c7' }}>
                  💡 "이은성 주임 메일로만 간 것(나 미포함)도 추적 가능할까?"에 대한 솔루션
                </h4>
                <div style={{ color: 'var(--text-primary)' }}>
                  <b>네! 100% 추적 가능합니다.</b> 본인이 참조(CC)에 없더라도 다음 <b>2가지 방식</b> 중 하나를 통해 이은성 주임님 편지함의 메일을 완벽하게 끌어올 수 있습니다:
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '6px' }}>
                <div style={{ borderLeft: '3px solid #0ea5e9', paddingLeft: '12px' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                    방식 1. 다우오피스 메일함 '수신 규칙 자동 전달' (가장 쉽고 확실함! 1분 완료)
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    이은성 주임님의 다우오피스 웹메일 환경설정 &gt; <b>[메일] &gt; [자동분류 / 수신규칙]</b>에서:<br />
                    • 조건: 보낸사람이 고객사(SK, SDI, 현대 등)이거나 제목에 <b>[스택], [Stack], [설비]</b> 포함 시<br />
                    • 처리: <b>내 메일(<code style={{ color: '#8b5cf6' }}>{myEmail}</code>)로 자동 전달(Forward)</b> 체크!<br />
                    👉 이렇게 해두면 <b>고객사가 이은성 주임님께만 단독 메일을 보내도, 내 메일함으로 자동 전달되면서 본 앱이 <code>[🧑 이은성 단독]</code>으로 자동 분류</b>합니다!
                  </div>
                </div>

                <div style={{ borderLeft: '3px solid #10b981', paddingLeft: '12px' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                    방식 2. 사내 자동 수집 데몬 (<code style={{ color: '#8b5cf6' }}>scripts/daou_mail_sync.js</code>)
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    제공해드린 데몬 스크립트에 이은성 주임님의 다우오피스 IMAP 계정을 등록해두면,
                    스크립트가 <b>이은성 주임님의 받은편지함(INBOX)을 직접 열어 60초마다 폴링</b>하므로, 선임이 참조되어 있지 않은 단독 메일도 100% 자동으로 시트에 꽂힙니다.
                  </div>
                </div>

                <div style={{ borderLeft: '3px solid #f59e0b', paddingLeft: '12px' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                    방식 3. 이은성 주임님이 '다우 메일 빠른 등록'에 복사/붙여넣기
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    이 웹 앱은 구글 스프레드시트처럼 실시간 공유되므로, 이은성 주임님이 본인 PC에서 단독 메일을 복사해 붙여넣기만 하면 선임 화면에도 0.1초 만에 실시간으로 나타납니다.
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: '8px', padding: '12px 14px', marginTop: '4px' }}>
                <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '12.5px' }}>
                  🚀 백그라운드 데몬 설정 확인:
                </div>
                <pre style={{ margin: 0, fontSize: '12px', background: 'var(--bg-card-subtle)', padding: '8px 12px', borderRadius: '6px', overflowX: 'auto' }}>
{`// scripts/daou_mail_sync.js
EUNSEONG_EMAIL = "${eunseongEmail}"  // les0415@twgroup.co.kr`}
                </pre>
              </div>
            </div>

            <div className="stack-modal-footer">
              <button
                type="button"
                className="sheet-btn primary"
                onClick={() => setShowGuideModal(false)}
              >
                설정 확인 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
