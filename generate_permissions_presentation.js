const pptxgen = require('pptxgenjs');
const path = require('path');

// 프레젠테이션 인스턴스 생성
const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9'; // 16:9 와이드스크린 (10 x 5.625 inches)
pres.author = 'TW Automation Team';
pres.company = '(주)티더블유';
pres.title = '프로젝트 관리 시스템 권한별 기능 및 제한사항 가이드';

// 공통 디자인 토큰 (Design Tokens)
const COLORS = {
  bgLight: 'F8FAFC',
  bgCard: 'FFFFFF',
  textDark: '0F172A',
  textMuted: '475569',
  border: 'CBD5E1',
  navyDark: '0A0F1D',
  navyHeader: '1E293B',
  bluePrimary: '2563EB',
  blueLight: 'EFF6FF',
  emerald: '059669',
  emeraldLight: 'ECFDF5',
  amber: 'D97706',
  amberLight: 'FFFBEB',
  rose: 'E11D48',
  roseLight: 'FFF1F2',
  grayLight: 'F1F5F9'
};

const FONT = 'Malgun Gothic';

// 공통 슬라이드 헤더 헬퍼
function addSlideHeader(slide, category, title, subtitle) {
  // 상단 바
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.8, y: 0.38, w: 1.2, h: 0.06,
    fill: { color: COLORS.bluePrimary }
  });
  
  // 카테고리 태그
  slide.addText(category.toUpperCase(), {
    x: 0.8, y: 0.5, w: 7.0, h: 0.25,
    fontFace: FONT, fontSize: 10, bold: true, color: COLORS.bluePrimary,
    characterSpacing: 1.5
  });

  // 슬라이드 타이틀
  slide.addText(title, {
    x: 0.8, y: 0.76, w: 7.2, h: 0.45,
    fontFace: FONT, fontSize: 19, bold: true, color: COLORS.textDark
  });

  // 서브 타이틀
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.8, y: 1.22, w: 7.5, h: 0.25,
      fontFace: FONT, fontSize: 10.5, color: COLORS.textMuted
    });
  }

  // 우측 상단 로고/시스템명
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 8.0, y: 0.45, w: 1.2, h: 0.32,
    fill: { color: 'F1F5F9' },
    line: { color: 'CBD5E1', width: 0.8 },
    rectRadius: 0.05
  });
  slide.addText('TW PM GUIDE', {
    x: 8.0, y: 0.45, w: 1.2, h: 0.32,
    fontFace: FONT, fontSize: 8.5, bold: true, color: '64748B', align: 'center', valign: 'middle'
  });
}

// ==========================================
// SLIDE 1: 표지 (Cover)
// ==========================================
{
  const slide = pres.addSlide();
  // 배경색 어두운 네이비
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: COLORS.navyDark }
  });

  // 장식용 배경 사각형들
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 6.8, y: -0.5, w: 4.5, h: 4.5,
    fill: { color: '1E293B', transparency: 70 },
    line: { color: '334155', width: 1, transparency: 60 },
    rectRadius: 0.4
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 7.6, y: 2.2, w: 3.5, h: 4.0,
    fill: { color: '1E3A8A', transparency: 80 },
    line: { color: '2563EB', width: 1, transparency: 70 },
    rectRadius: 0.3
  });

  // 배지
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.0, y: 1.25, w: 2.7, h: 0.38,
    fill: { color: '1E293B' },
    line: { color: '3B82F6', width: 1 },
    rectRadius: 0.08
  });
  slide.addText('SYSTEM PERMISSIONS & ROLES', {
    x: 1.0, y: 1.25, w: 2.7, h: 0.38,
    fontFace: FONT, fontSize: 9.5, bold: true, color: '60A5FA', align: 'center', valign: 'middle'
  });

  // 메인 타이틀
  slide.addText('프로젝트 관리 시스템\n권한별 기능 및 제한사항 가이드', {
    x: 1.0, y: 1.8, w: 7.8, h: 1.45,
    fontFace: FONT, fontSize: 30, bold: true, color: 'FFFFFF', lineSpacing: 40
  });

  // 서브 타이틀
  slide.addText('Admin · Grade 3 · Grade 2 · Grade 1 계층별 상세 기능 및 접근 제어 명세서', {
    x: 1.0, y: 3.35, w: 7.0, h: 0.4,
    fontFace: FONT, fontSize: 13, color: '94A3B8'
  });

  // 하단 구분선
  slide.addShape(pres.shapes.LINE, {
    x: 1.0, y: 4.1, w: 8.0, h: 0,
    line: { color: '334155', width: 1 }
  });

  // 하단 메타 정보
  slide.addText([
    { text: '발행 부서: ', options: { bold: true, color: '94A3B8' } },
    { text: '(주)티더블유 스마트팩토리/제어팀    ', options: { color: 'CBD5E1' } },
    { text: '시스템 총괄: ', options: { bold: true, color: '94A3B8' } },
    { text: '조민재 선임    ', options: { color: 'CBD5E1' } },
    { text: '기준 일자: ', options: { bold: true, color: '94A3B8' } },
    { text: '2026. 10. 01', options: { color: 'CBD5E1' } }
  ], {
    x: 1.0, y: 4.35, w: 8.0, h: 0.4,
    fontFace: FONT, fontSize: 10
  });
}

// ==========================================
// SLIDE 2: 권한 체계 총괄 개요 (Role Overview)
// ==========================================
{
  const slide = pres.addSlide();
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: COLORS.bgLight } });
  addSlideHeader(slide, '01. Architecture Overview', '사용자 권한 계층 구조 및 역할 정의', '역할과 책임(R&R)에 최적화된 4단계 역할 기반 접근 제어(RBAC) 시스템');

  const roles = [
    {
      grade: 'ADMIN',
      sub: '최고 관리자',
      color: COLORS.rose,
      lightBg: COLORS.roseLight,
      target: '시스템 총괄 운영자',
      desc: '사용자 권한 승격/강등, 계정 활성화/삭제 및 시스템 전역의 모든 데이터에 대한 완전한 생성/수정/삭제 권한 보유'
    },
    {
      grade: 'GRADE 3',
      sub: '총괄 관리자 (PM / 소장)',
      color: COLORS.bluePrimary,
      lightBg: COLORS.blueLight,
      target: '프로젝트 총괄 책임자, 현장 소장',
      desc: '신규 프로젝트 생성, 마스터 플랜 등록, 프로젝트 삭제, 견적서 등록/삭제/수정, 공사일보 및 AI 분석 보고서 생성 전권'
    },
    {
      grade: 'GRADE 2',
      sub: '실무 담당자 (부서 엔지니어)',
      color: COLORS.emerald,
      lightBg: COLORS.emeraldLight,
      target: '설계 · 설비기술 · 제어 · 비전 담당자',
      desc: '담당 프로젝트 마일스톤 및 진행률 업데이트, 견적 조회 전용 모드(단가/마진 열람), 공사일보 등록/수정/삭제 및 AI 분석'
    },
    {
      grade: 'GRADE 1',
      sub: '일반 사용자 (조회 전용)',
      color: '64748B',
      lightBg: COLORS.grayLight,
      target: '일반 사원, 협력사, 게스트',
      desc: '프로젝트 목록, 간트차트, 일정 캘린더, 공수 현황, 로컬 Vision SPC 분석기 등 안전한 데이터 열람 및 모니터링 전용'
    }
  ];

  const cardW = 2.05;
  const cardH = 3.65;
  const startX = 0.8;
  const startY = 1.55;
  const gap = 0.17;

  roles.forEach((r, idx) => {
    const x = startX + idx * (cardW + gap);
    
    // 카드 배경
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: COLORS.bgCard },
      line: { color: COLORS.border, width: 1 },
      rectRadius: 0.1
    });

    // 상단 컬러 포인트 바
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.15, y: startY + 0.15, w: cardW - 0.3, h: 0.7,
      fill: { color: r.lightBg },
      line: { color: r.color, width: 1 },
      rectRadius: 0.08
    });

    // 역할 뱃지 & 이름
    slide.addText(r.grade, {
      x: x + 0.2, y: startY + 0.22, w: cardW - 0.4, h: 0.3,
      fontFace: FONT, fontSize: 13, bold: true, color: r.color, align: 'center'
    });
    slide.addText(r.sub, {
      x: x + 0.2, y: startY + 0.52, w: cardW - 0.4, h: 0.25,
      fontFace: FONT, fontSize: 9.5, bold: true, color: COLORS.textDark, align: 'center'
    });

    // 대상자 섹션
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.15, y: startY + 1.0, w: cardW - 0.3, h: 0.02,
      fill: { color: COLORS.border }
    });
    
    slide.addText('주요 대상', {
      x: x + 0.15, y: startY + 1.1, w: cardW - 0.3, h: 0.22,
      fontFace: FONT, fontSize: 8.5, bold: true, color: '64748B'
    });
    slide.addText(r.target, {
      x: x + 0.15, y: startY + 1.32, w: cardW - 0.3, h: 0.45,
      fontFace: FONT, fontSize: 9.5, bold: true, color: COLORS.textDark
    });

    // 역할 설명 섹션
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.15, y: startY + 1.85, w: cardW - 0.3, h: 0.02,
      fill: { color: COLORS.border }
    });

    slide.addText('권한 및 역할 요약', {
      x: x + 0.15, y: startY + 1.95, w: cardW - 0.3, h: 0.22,
      fontFace: FONT, fontSize: 8.5, bold: true, color: '64748B'
    });
    slide.addText(r.desc, {
      x: x + 0.15, y: startY + 2.2, w: cardW - 0.3, h: 1.3,
      fontFace: FONT, fontSize: 8.5, color: COLORS.textMuted, lineSpacing: 12
    });
  });
}

// ==========================================
// SLIDE 3: 권한별 기능 비교 매트릭스 (Comparison Matrix)
// ==========================================
{
  const slide = pres.addSlide();
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: COLORS.bgLight } });
  addSlideHeader(slide, '02. Feature Matrix', '시스템 핵심 기능별 권한 매트릭스', '등급에 따른 5대 핵심 메뉴 기능 허용(O), 부분 제한(△), 차단(X) 종합 비교');

  const headers = [
    { text: '메뉴 / 기능 항목', options: { fill: { color: '1E293B' }, color: 'FFFFFF', bold: true, fontSize: 9.5, align: 'center', valign: 'middle' } },
    { text: 'Admin\n(최고 관리자)', options: { fill: { color: '1E293B' }, color: 'FCA5A5', bold: true, fontSize: 9, align: 'center', valign: 'middle' } },
    { text: 'Grade 3\n(PM / 소장)', options: { fill: { color: '1E293B' }, color: '93C5FD', bold: true, fontSize: 9, align: 'center', valign: 'middle' } },
    { text: 'Grade 2\n(부서 담당자)', options: { fill: { color: '1E293B' }, color: '86EFAC', bold: true, fontSize: 9, align: 'center', valign: 'middle' } },
    { text: 'Grade 1\n(조회 전용)', options: { fill: { color: '1E293B' }, color: 'CBD5E1', bold: true, fontSize: 9, align: 'center', valign: 'middle' } }
  ];

  const rows = [
    ['프로젝트 목록 / 간트차트 / 달력 조회', 'O (전체)', 'O (전체)', 'O (전체)', 'O (전체)'],
    ['간트차트 & 일정 달력 PPT 파일 내보내기', 'O (가능)', 'O (가능)', 'O (가능)', 'X (잠금 🔒)'],
    ['새 프로젝트 생성 & 마스터 플랜 등록', 'O (자유 등록)', 'O (자유 등록)', 'X (생성 불가 🔒)', 'X (생성 불가 🔒)'],
    ['프로젝트 정보 수정 (제조번호/Line/담당자 등)', 'O (전체 수정)', 'O (전체 수정)', '△ (메타 잠금 / 일정만 갱신)', 'X (수정 불가 🔒)'],
    ['프로젝트 삭제 (단일 및 체크박스 일괄 삭제)', 'O (삭제 가능)', 'O (삭제 가능)', 'X (삭제 불가 🔒)', 'X (삭제 불가 🔒)'],
    ['Site / 담당자 기초 마스터 데이터 관리', 'O (관리 가능)', 'O (관리 가능)', 'X (권한 제한 🔒)', 'X (권한 제한 🔒)'],
    ['공사일보 파일 첨부(Excel) 및 표 붙여넣기', 'O (등록 가능)', 'O (등록 가능)', 'O (등록 가능)', 'X (입력 불가 🔒)'],
    ['공사일보 수정 / 일보 데이터 개별 삭제', 'O (자유 편집)', 'O (자유 편집)', 'O (자유 편집)', 'X (편집 불가 🔒)'],
    ['AI 프로젝트 통합 분석 & PPT 보고서 생성', 'O (생성 가능)', 'O (생성 가능)', 'O (생성 가능)', 'X (생성 불가 🔒)'],
    ['견적서 메뉴 접근 및 품목/단가 조회', 'O (전체 조회)', 'O (전체 조회)', 'O (조회 전용 모드)', 'X (접근 차단 🔒)'],
    ['신규 견적서 등록 (파일 업로드 & 표 복사)', 'O (등록 가능)', 'O (등록 가능)', 'X (등록 제한 🔒)', 'X (접근 차단 🔒)'],
    ['견적서 수정 및 견적 삭제(단일/전체)', 'O (삭제 가능)', 'O (삭제 가능)', 'X (삭제 제한 🔒)', 'X (접근 차단 🔒)'],
    ['Vision SPC 통계 분석기 사용 (Excel 양식/분석)', 'O (전체 이용)', 'O (전체 이용)', 'O (전체 이용)', 'O (전체 이용)'],
    ['사용자 권한 관리 (등급 변경 / 계정 비활성화)', 'O (전용 모달)', 'X (접근 불가)', 'X (접근 불가)', 'X (접근 불가)']
  ];

  const tableData = [headers];

  rows.forEach((row, rIdx) => {
    const isEven = rIdx % 2 === 0;
    const bg = isEven ? 'FFFFFF' : 'F8FAFC';

    tableData.push([
      { text: row[0], options: { fill: { color: bg }, fontSize: 8.5, bold: true, color: COLORS.textDark, valign: 'middle' } },
      { text: row[1], options: { fill: { color: bg }, fontSize: 8.5, color: COLORS.rose, bold: true, align: 'center', valign: 'middle' } },
      { text: row[2], options: { fill: { color: bg }, fontSize: 8.5, color: COLORS.bluePrimary, bold: true, align: 'center', valign: 'middle' } },
      { text: row[3], options: { fill: { color: bg }, fontSize: 8.5, color: row[3].startsWith('△') ? COLORS.amber : row[3].startsWith('O') ? COLORS.emerald : '94A3B8', bold: true, align: 'center', valign: 'middle' } },
      { text: row[4], options: { fill: { color: bg }, fontSize: 8.5, color: row[4].startsWith('O') ? COLORS.textDark : '94A3B8', bold: true, align: 'center', valign: 'middle' } }
    ]);
  });

  slide.addTable(tableData, {
    x: 0.8, y: 1.55, w: 8.4, h: 3.75,
    colW: [2.8, 1.4, 1.4, 1.4, 1.4],
    border: { pt: 0.5, color: COLORS.border }
  });
}

// ==========================================
// SLIDE 4: Admin 최고 관리자
// ==========================================
{
  const slide = pres.addSlide();
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: COLORS.bgLight } });
  addSlideHeader(slide, '03. Role Detail', 'Admin (최고 관리자) 상세 권한', '시스템 전역 제어, 보안 및 계정 관리, 데이터 수명 주기 전체 관리 권한');

  // 좌측 카드: 사용 가능 기능 (O)
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: 'FCA5A5', width: 1.5 },
    rectRadius: 0.1
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.0, y: 1.75, w: 3.7, h: 0.45,
    fill: { color: COLORS.roseLight },
    line: { color: COLORS.rose, width: 1 },
    rectRadius: 0.06
  });
  slide.addText('✅ 사용 가능한 핵심 기능 (Full Control)', {
    x: 1.0, y: 1.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 11, bold: true, color: COLORS.rose, align: 'center', valign: 'middle'
  });

  const adminFeatures = [
    { bold: '사용자 권한 관리 모달 (단독 보유)', desc: '가입 회원 등급(Admin/Grade 1~3) 설정, 계정 활성화 토글 및 강제 탈퇴 처리' },
    { bold: '프로젝트 생성 · 수정 · 삭제 전권', desc: '새 프로젝트 등록, 마스터 플랜 일괄 등록, 제조번호/담당자 등 전체 필드 수정, 단일/다중 삭제' },
    { bold: '견적 관리 풀 제어 (Full Control)', desc: '견적서 신규 등록(엑셀 파일/표 복사), 품목 단가 수정, 견적서 및 프로젝트 전체 견적 영구 삭제' },
    { bold: '공사일보 및 AI 분석 보고서', desc: '일보 등록/수정/삭제, 공수 병합, Gemini 기반 AI 심층 종합 분석 및 PPT 슬라이드 생성' },
    { bold: '기초 마스터 데이터 관리', desc: 'Site(사이트/사업장) 및 부서별 담당자(소장/설계/설비/제어/비전) 인력 풀 등록·삭제' }
  ];

  let curY = 2.35;
  adminFeatures.forEach(f => {
    slide.addText([
      { text: `• ${f.bold}: `, options: { bold: true, color: COLORS.textDark, fontSize: 9 } },
      { text: f.desc, options: { color: COLORS.textMuted, fontSize: 8.5 } }
    ], {
      x: 1.05, y: curY, w: 3.6, h: 0.52,
      fontFace: FONT, lineSpacing: 11
    });
    curY += 0.54;
  });

  // 우측 카드: 제한 및 주의사항 (X / Notice)
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.1, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.1
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.3, y: 1.75, w: 3.7, h: 0.45,
    fill: { color: COLORS.grayLight },
    line: { color: '94A3B8', width: 1 },
    rectRadius: 0.06
  });
  slide.addText('⚠️ 시스템 보호 규칙 및 운영 가이드', {
    x: 5.3, y: 1.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 11, bold: true, color: '334155', align: 'center', valign: 'middle'
  });

  const adminLimits = [
    { bold: '슈퍼 어드민(Super Admin) 보호', desc: '시스템 총괄자 계정(cmj1012@twgroup.co.kr)은 권한 강등 및 계정 삭제가 원천 차단됨' },
    { bold: '본인 계정 자체 삭제 불가', desc: '실수 방지를 위해 현재 로그인된 관리자 본인의 계정은 삭제할 수 없음' },
    { bold: '프로젝트 삭제 시 주의사항', desc: '프로젝트 삭제 시 연결된 마일스톤 및 공수 이력이 영구 삭제되므로 사전 확인 필수' },
    { bold: '견적 전체 삭제 신중 처리', desc: '프로젝트 견적 전체 삭제 시 복구가 불가능하므로 백업 권장' },
    { bold: '기능 제한 사항', desc: '시스템상의 기능 제한 없음 (모든 화면 및 액션 100% 개방)' }
  ];

  curY = 2.35;
  adminLimits.forEach(l => {
    slide.addText([
      { text: `• ${l.bold}: `, options: { bold: true, color: '334155', fontSize: 9 } },
      { text: l.desc, options: { color: COLORS.textMuted, fontSize: 8.5 } }
    ], {
      x: 5.35, y: curY, w: 3.6, h: 0.52,
      fontFace: FONT, lineSpacing: 11
    });
    curY += 0.54;
  });
}

// ==========================================
// SLIDE 5: Grade 3 총괄 관리자 (PM / 소장)
// ==========================================
{
  const slide = pres.addSlide();
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: COLORS.bgLight } });
  addSlideHeader(slide, '04. Role Detail', 'Grade 3 (PM / 현장 소장) 상세 권한', '프로젝트 생성부터 완료/삭제까지 프로젝트 사이클 및 견적/일보 운영 전권');

  // 좌측 카드: 사용 가능 기능
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: '93C5FD', width: 1.5 },
    rectRadius: 0.1
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.0, y: 1.75, w: 3.7, h: 0.45,
    fill: { color: COLORS.blueLight },
    line: { color: COLORS.bluePrimary, width: 1 },
    rectRadius: 0.06
  });
  slide.addText('✅ 사용 가능한 핵심 기능', {
    x: 1.0, y: 1.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 11, bold: true, color: COLORS.bluePrimary, align: 'center', valign: 'middle'
  });

  const g3Features = [
    { bold: '프로젝트 생성 및 마스터 등록', desc: '새 프로젝트 추가, 엑셀 마스터 스케줄 표 붙여넣기 및 스마트 파싱 일괄 반영' },
    { bold: '프로젝트 전체 메타정보 편집', desc: '제조번호, Site, Line, 프로젝트명, 시작/종료일, 5대 부서 담당자 자유 변경' },
    { bold: '프로젝트 단일 및 다중 일괄 삭제', desc: '프로젝트 삭제 버튼 활성화 및 하단 체크박스 다중 일괄 삭제 실행 가능' },
    { bold: '견적서 관리 풀 권한 (canManage)', desc: '엑셀 견적서 업로드/AI 추출, 표 붙여넣기 등록, 품목 단가 수정, 견적서 개별/전체 삭제' },
    { bold: '공사일보 관리 및 AI 통합 보고서', desc: '일보 등록/수정/삭제, 공수 자동 병합, AI 프로젝트 통합 분석 및 PPT 보고서 생성' },
    { bold: 'Site 및 담당자 기초 데이터 관리', desc: '사업장(Site) 및 각 부서별 신규 담당자 풀 직접 추가 및 관리' }
  ];

  let curY = 2.35;
  g3Features.forEach(f => {
    slide.addText([
      { text: `• ${f.bold}: `, options: { bold: true, color: COLORS.textDark, fontSize: 8.8 } },
      { text: f.desc, options: { color: COLORS.textMuted, fontSize: 8.3 } }
    ], {
      x: 1.05, y: curY, w: 3.6, h: 0.46,
      fontFace: FONT, lineSpacing: 10
    });
    curY += 0.46;
  });

  // 우측 카드: 제한되는 기능
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.1, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: 'CBD5E1', width: 1 },
    rectRadius: 0.1
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.3, y: 1.75, w: 3.7, h: 0.45,
    fill: { color: COLORS.grayLight },
    line: { color: '64748B', width: 1 },
    rectRadius: 0.06
  });
  slide.addText('⛔ 제한되는 기능 (차단 사항)', {
    x: 5.3, y: 1.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 11, bold: true, color: '475569', align: 'center', valign: 'middle'
  });

  const g3Limits = [
    { bold: '사용자 권한 관리 모달 접근 불가', desc: '상단 네비게이션에 [사용자 권한 관리] 버튼이 노출되지 않으며, 다른 사용자의 권한을 변경할 수 없음' },
    { bold: '사용자 계정 활성화 / 비활성화 불가', desc: '회원의 접근 승인 및 차단 제어는 오직 최고 관리자(Admin)만 수행 가능' },
    { bold: '사용자 강제 탈퇴 및 삭제 불가', desc: '등록된 사용자 프로필 계정을 삭제하거나 데이터베이스에서 제거할 수 없음' },
    { bold: '권한 초과 요청 시 안내', desc: '사용자 관리 등 Admin 전용 영역 조작이 필요한 경우 시스템 관리자(조민재 선임)에게 별도 요청 필요' }
  ];

  curY = 2.45;
  g3Limits.forEach(l => {
    slide.addText([
      { text: `• ${l.bold}: `, options: { bold: true, color: 'DC2626', fontSize: 9 } },
      { text: l.desc, options: { color: COLORS.textMuted, fontSize: 8.5 } }
    ], {
      x: 5.35, y: curY, w: 3.6, h: 0.65,
      fontFace: FONT, lineSpacing: 11
    });
    curY += 0.68;
  });
}

// ==========================================
// SLIDE 6: Grade 2 실무 담당자 (부서 엔지니어)
// ==========================================
{
  const slide = pres.addSlide();
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: COLORS.bgLight } });
  addSlideHeader(slide, '05. Role Detail', 'Grade 2 (각 부서 실무 담당자) 상세 권한', '현장 실무 중심: 일정/진행률 업데이트 및 일보 등록 허용, 프로젝트 메타 및 견적은 보호');

  // 좌측 카드: 사용 가능 기능
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: '86EFAC', width: 1.5 },
    rectRadius: 0.1
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.0, y: 1.75, w: 3.7, h: 0.45,
    fill: { color: COLORS.emeraldLight },
    line: { color: COLORS.emerald, width: 1 },
    rectRadius: 0.06
  });
  slide.addText('✅ 사용 가능한 핵심 기능', {
    x: 1.0, y: 1.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 11, bold: true, color: COLORS.emerald, align: 'center', valign: 'middle'
  });

  const g2Features = [
    { bold: '마일스톤 일정 및 진행률 업데이트', desc: '담당 프로젝트의 마일스톤 날짜 조정, 단계별 진척도 및 진행 상태(진행중/완료) 저장' },
    { bold: '공사일보 등록 및 실시간 편집', desc: '엑셀 파일 첨부 AI 분석, 작업내용 및 공수 표 붙여넣기(Ctrl+V), 일자별 일보 등록/수정/삭제' },
    { bold: 'AI 프로젝트 통합 분석 & PPT 생성', desc: '공사일보 텍스트를 AI로 요약하고 종합 현황 PPT 보고서를 다운로드' },
    { bold: '견적 조회 전용 모드 (Read-Only)', desc: '품목별 단가 검색, 공정/프로젝트/구분 다차원 필터링, 총 견적 비용 및 부품 단가 열람' },
    { bold: 'PPT 내보내기', desc: '간트차트 및 일정 캘린더 화면을 파워포인트(PPT) 파일로 다운로드' },
    { bold: 'Vision SPC 통계 분석기', desc: '측정 데이터 엑셀 업로드, 규격 설정 및 공정능력지수(Cp/Cpk) 정밀 분석' }
  ];

  let curY = 2.35;
  g2Features.forEach(f => {
    slide.addText([
      { text: `• ${f.bold}: `, options: { bold: true, color: COLORS.textDark, fontSize: 8.8 } },
      { text: f.desc, options: { color: COLORS.textMuted, fontSize: 8.3 } }
    ], {
      x: 1.05, y: curY, w: 3.6, h: 0.46,
      fontFace: FONT, lineSpacing: 10
    });
    curY += 0.46;
  });

  // 우측 카드: 제한되는 기능
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.1, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: 'FCD34D', width: 1.5 },
    rectRadius: 0.1
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.3, y: 1.75, w: 3.7, h: 0.45,
    fill: { color: COLORS.amberLight },
    line: { color: COLORS.amber, width: 1 },
    rectRadius: 0.06
  });
  slide.addText('🔒 엄격하게 제한되는 기능', {
    x: 5.3, y: 1.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 11, bold: true, color: COLORS.amber, align: 'center', valign: 'middle'
  });

  const g2Limits = [
    { bold: '프로젝트 메타 필드 수정 잠금 (Disabled)', desc: '제조번호, Site, Line, 프로젝트명, 시작/종료일, 5대 부서 담당자 입력 필드가 비활성화되어 임의 변경 불가' },
    { bold: '새 프로젝트 생성 & 마스터 플랜 등록 차단', desc: '신규 프로젝트를 단독 생성하거나 엑셀 마스터 플랜으로 신규 프로젝트를 등록할 수 없음' },
    { bold: '프로젝트 삭제 권한 차단', desc: '프로젝트 삭제 버튼 클릭 시 권한 안내 모달이 발생하며 삭제가 차단됨' },
    { bold: '견적서 신규 등록 및 견적 삭제 불가', desc: '새 견적서 등록 인풋 및 삭제 버튼이 비활성화되며 오직 단가/비용 조회만 가능' },
    { bold: 'Site 및 담당자 관리 모달 접근 차단', desc: '기초 사업장 및 담당자 마스터 데이터를 수정할 수 없음' }
  ];

  curY = 2.35;
  g2Limits.forEach(l => {
    slide.addText([
      { text: `• ${l.bold}: `, options: { bold: true, color: 'B45309', fontSize: 8.8 } },
      { text: l.desc, options: { color: COLORS.textMuted, fontSize: 8.3 } }
    ], {
      x: 5.35, y: curY, w: 3.6, h: 0.46,
      fontFace: FONT, lineSpacing: 10
    });
    curY += 0.46;
  });
}

// ==========================================
// SLIDE 7: Grade 1 일반 사용자 (조회 전용)
// ==========================================
{
  const slide = pres.addSlide();
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: COLORS.bgLight } });
  addSlideHeader(slide, '06. Role Detail', 'Grade 1 (일반 사원 / 조회 전용) 상세 권한', '데이터 훼손 방지를 위한 안전 모드: 전 메뉴 수정/삭제 및 견적·리포트 출력 차단');

  // 좌측 카드: 사용 가능 기능
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.1
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.0, y: 1.75, w: 3.7, h: 0.45,
    fill: { color: COLORS.grayLight },
    line: { color: '64748B', width: 1 },
    rectRadius: 0.06
  });
  slide.addText('✅ 사용 가능한 기능 (조회 전용)', {
    x: 1.0, y: 1.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 11, bold: true, color: '334155', align: 'center', valign: 'middle'
  });

  const g1Features = [
    { bold: '프로젝트 목록 및 검색/필터링', desc: '제조번호, Site, 라인, 상태(진행중/완료/지연), 담당자별 자유로운 검색 및 필터' },
    { bold: '간트차트(Gantt) 및 마일스톤 열람', desc: '프로젝트별 전체 마일스톤 일정, 일정 진행률 바 및 타임라인 확인' },
    { bold: '월간 일정 달력(Calendar) 모니터링', desc: '월별 마일스톤 일정, 제조번호별 일정 배치 현황 조회' },
    { bold: '부서별/프로젝트별 공수 분석', desc: 'M/D 차트 및 인원 투입 현황 데이터 시각화 화면 열람' },
    { bold: '공사일보 열람', desc: '등록되어 있는 과거 및 최근 공사일보 작업내용과 투입 인원 조회' },
    { bold: 'Vision SPC 통계 분석기 이용', desc: '스프레드시트 양식 다운로드 및 데이터 측정치 공정능력 통계 분석 수행' }
  ];

  let curY = 2.35;
  g1Features.forEach(f => {
    slide.addText([
      { text: `• ${f.bold}: `, options: { bold: true, color: COLORS.textDark, fontSize: 8.8 } },
      { text: f.desc, options: { color: COLORS.textMuted, fontSize: 8.3 } }
    ], {
      x: 1.05, y: curY, w: 3.6, h: 0.46,
      fontFace: FONT, lineSpacing: 10
    });
    curY += 0.46;
  });

  // 우측 카드: 제한되는 기능
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.1, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: 'FCA5A5', width: 1.5 },
    rectRadius: 0.1
  });
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.3, y: 1.75, w: 3.7, h: 0.45,
    fill: { color: COLORS.roseLight },
    line: { color: COLORS.rose, width: 1 },
    rectRadius: 0.06
  });
  slide.addText('🔒 전면 차단되는 기능 (Access Denied)', {
    x: 5.3, y: 1.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 11, bold: true, color: COLORS.rose, align: 'center', valign: 'middle'
  });

  const g1Limits = [
    { bold: '견적 조회 메뉴 진입 전면 차단', desc: '상단 [견적 조회 💰🔒] 탭 클릭 시 즉시 권한 제한 안내 팝업이 노출되며 화면 진입 불가' },
    { bold: '프로젝트 생성 · 수정 · 삭제 차단', desc: '신규 등록, 기존 프로젝트의 수정 버튼 클릭, 삭제 실행 등 모든 쓰기 액션 차단' },
    { bold: '간트차트 및 달력 PPT 내보내기 불가', desc: '상단 [PPT 내보내기 🔒] 버튼 클릭 시 권한 제한 모달 발생' },
    { bold: '공사일보 등록 · 수정 · 삭제 차단', desc: '엑셀 파일 첨부, 표 붙여넣기, Save All, 개별 수정/삭제 버튼 모두 비활성화' },
    { bold: 'AI 프로젝트 통합 분석 & PPT 생성 불가', desc: 'AI 분석 및 파워포인트 보고서 자동 생성 기능 잠금 처리' },
    { bold: 'Site / 담당자 / 사용자 권한 관리 불가', desc: '모든 관리자 설정 모달 접근 불가' }
  ];

  let curY2 = 2.35;
  g1Limits.forEach(l => {
    slide.addText([
      { text: `• ${l.bold}: `, options: { bold: true, color: 'DC2626', fontSize: 8.8 } },
      { text: l.desc, options: { color: COLORS.textMuted, fontSize: 8.3 } }
    ], {
      x: 5.35, y: curY2, w: 3.6, h: 0.46,
      fontFace: FONT, lineSpacing: 10
    });
    curY2 += 0.46;
  });
}

// ==========================================
// SLIDE 8: 권한 신청 및 관리자 문의 안내
// ==========================================
{
  const slide = pres.addSlide();
  slide.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: COLORS.bgLight } });
  addSlideHeader(slide, '07. Support & Workflow', '권한 부족 시 안내 팝업 및 권한 신청 절차', '권한 제한 안내 인터페이스 및 운영자 승급 신청 프로세스');

  // 좌측 카드: 시스템 팝업 안내 화면 모사
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.8, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.12
  });

  // 모달 상단 아이콘 및 타이틀
  slide.addShape(pres.shapes.OVAL, {
    x: 2.55, y: 1.75, w: 0.6, h: 0.6,
    fill: { color: COLORS.roseLight }
  });
  slide.addText('🔒', {
    x: 2.55, y: 1.75, w: 0.6, h: 0.6,
    fontSize: 16, align: 'center', valign: 'middle'
  });

  slide.addText('접근 권한 제한 안내', {
    x: 1.0, y: 2.4, w: 3.7, h: 0.3,
    fontFace: FONT, fontSize: 13, bold: true, color: COLORS.textDark, align: 'center'
  });

  slide.addText('[요청한 기능] 은 현재 등급에서 이용할 수 없습니다.\n해당 기능을 이용하시려면 운영자에게 권한을 부여받으시기 바랍니다.', {
    x: 1.0, y: 2.75, w: 3.7, h: 0.45,
    fontFace: FONT, fontSize: 8.5, color: COLORS.textMuted, align: 'center', lineSpacing: 11
  });

  // 시스템 문의 박스
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.1, y: 3.3, w: 3.5, h: 1.15,
    fill: { color: COLORS.grayLight },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08
  });
  slide.addText('📌 권한 부여 및 시스템 문의', {
    x: 1.25, y: 3.38, w: 3.2, h: 0.22,
    fontFace: FONT, fontSize: 8.5, bold: true, color: COLORS.textDark
  });
  slide.addText([
    { text: '• 담당자: ', options: { bold: true, color: '334155' } },
    { text: '조민재 선임 (Smart Factory / 제어)\n', options: { color: '475569' } },
    { text: '• E-mail: ', options: { bold: true, color: '334155' } },
    { text: 'cmj1012@twgroup.co.kr\n', options: { color: '475569' } },
    { text: '• Tel: ', options: { bold: true, color: '334155' } },
    { text: '+82 10 5506 8739', options: { color: '475569' } }
  ], {
    x: 1.25, y: 3.65, w: 3.2, h: 0.72,
    fontFace: FONT, fontSize: 8, lineSpacing: 11
  });

  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 1.1, y: 4.6, w: 3.5, h: 0.45,
    fill: { color: COLORS.bluePrimary },
    rectRadius: 0.06
  });
  slide.addText('확인 (닫기)', {
    x: 1.1, y: 4.6, w: 3.5, h: 0.45,
    fontFace: FONT, fontSize: 9.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle'
  });

  // 우측 카드: 권한 신청 절차
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 5.1, y: 1.55, w: 4.1, h: 3.7,
    fill: { color: COLORS.bgCard },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.1
  });

  slide.addText('📋 권한 승급 신청 가이드', {
    x: 5.35, y: 1.75, w: 3.6, h: 0.3,
    fontFace: FONT, fontSize: 12, bold: true, color: COLORS.textDark
  });

  const steps = [
    { step: 'STEP 1', title: '계정 가입 및 로그인', desc: '회사 이메일 계정으로 회원가입 완료 (기본값: Grade 1 자동 배정)' },
    { step: 'STEP 2', title: '권한 승급 요청', desc: '담당 업무(PM, 설계, 제어, 설비 등) 및 소속을 기재하여 시스템 관리자에게 메일/메신저 요청' },
    { step: 'STEP 3', title: '관리자 검토 및 등급 반영', desc: 'Admin 관리자 화면에서 해당 사용자의 권한을 Grade 2 또는 Grade 3으로 승격' },
    { step: 'STEP 4', title: '재로그인 또는 즉시 반영', desc: '브라우저 새로고침 시 즉시 승격된 권한으로 프로젝트/견적/일보 편집 가능' }
  ];

  let stepY = 2.15;
  steps.forEach(s => {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: 5.35, y: stepY, w: 0.75, h: 0.25,
      fill: { color: COLORS.blueLight },
      line: { color: COLORS.bluePrimary, width: 0.8 },
      rectRadius: 0.04
    });
    slide.addText(s.step, {
      x: 5.35, y: stepY, w: 0.75, h: 0.25,
      fontFace: FONT, fontSize: 7.5, bold: true, color: COLORS.bluePrimary, align: 'center', valign: 'middle'
    });

    slide.addText(s.title, {
      x: 6.2, y: stepY - 0.02, w: 2.8, h: 0.26,
      fontFace: FONT, fontSize: 9.5, bold: true, color: COLORS.textDark
    });
    slide.addText(s.desc, {
      x: 6.2, y: stepY + 0.24, w: 2.8, h: 0.38,
      fontFace: FONT, fontSize: 8, color: COLORS.textMuted, lineSpacing: 10
    });

    stepY += 0.68;
  });
}

// 파일 저장 실행
const outputPath = path.join(__dirname, 'TW_프로젝트관리시스템_권한별_기능_가이드.pptx');
pres.writeFile({ fileName: outputPath })
  .then(fileName => {
    console.log(`[SUCCESS] Presentation saved successfully: ${fileName}`);
  })
  .catch(err => {
    console.error('[ERROR] Failed to save presentation:', err);
    process.exit(1);
  });
