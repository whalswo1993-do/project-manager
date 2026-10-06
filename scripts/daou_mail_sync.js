/**
 * 다우오피스(DaouOffice) 메일 자동 동기화 데몬 (Background Sync Daemon)
 * 
 * [동작 원리]
 * 1. 본인 및 이은성 주임의 다우오피스 웹메일 IMAP(포트 993 SSL)에 주기적으로 연결합니다.
 * 2. 새로 도착한 [스택파트] 관련 메일을 감지하여 Supabase DB 또는 웹 앱으로 실시간 전송합니다.
 * 3. 고객사 회신/답장 여부를 감지하여 상태를 '완료' 또는 '재회신 접수(진행중)'로 자동 갱신합니다.
 * 
 * [사용 방법]
 * 1. 필요한 패키지 설치: npm install imap-simple mailparser @supabase/supabase-js
 * 2. 아래 설정값(계정 정보, Supabase 키) 입력
 * 3. 실행: node scripts/daou_mail_sync.js
 */

import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

// 1. Supabase 연동 설정
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://tebtuzxafkymlplmlhzu.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || "sb_publishable_grHTjPexU7_f9M8w4IrEYQ_o7_gx160";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. 다우오피스 계정 설정 (본인 + 이은성 주임)
const DAOU_ACCOUNTS = [
  {
    name: "본인 (선임)",
    email: process.env.MY_EMAIL || "cmj1012@twgroup.co.kr",
    password: process.env.MY_PASSWORD || "daou_password_here",
    host: "mail.twgroup.co.kr", // 또는 imap.daouoffice.com (회사 메일 도메인)
    port: 993,
    tls: true
  },
  {
    name: "이은성 주임",
    email: process.env.EUNSEONG_EMAIL || "eslee@twgroup.co.kr",
    password: process.env.EUNSEONG_PASSWORD || "daou_password_here",
    host: "mail.twgroup.co.kr",
    port: 993,
    tls: true
  }
];

// 고객사 도메인/키워드 식별 규칙
const CUSTOMER_DOMAINS = ["sk.com", "samsung.com", "hyundai.com", "partner.com"];

function identifySenderType(emailAddr) {
  const lower = (emailAddr || "").toLowerCase();
  if (lower.includes("twgroup.co.kr")) return "internal";
  for (const c of CUSTOMER_DOMAINS) {
    if (lower.includes(c)) return "customer";
  }
  return "external";
}

async function syncAccountMail(account) {
  console.log(`[Daou Sync] ${account.name}(${account.email}) 메일함 연결 시도...`);
  const config = {
    imap: {
      user: account.email,
      password: account.password,
      host: account.host,
      port: account.port,
      tls: account.tls,
      authTimeout: 5000
    }
  };

  try {
    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');

    // 최근 24시간 동안 수신된 읽지 않은 메일 또는 전체 메일 검색
    const delay = 24 * 3600 * 1000;
    const yesterday = new Date(Date.now() - delay).toISOString();
    const searchCriteria = ['UNSEEN', ['SINCE', yesterday]];
    const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true, markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[Daou Sync] ${account.name}: 신규 메일 ${messages.length}건 발견`);

    for (const item of messages) {
      const allParts = item.parts.find(part => part.which === '');
      const parsed = await simpleParser(allParts.body);

      const subject = parsed.subject || "(제목 없음)";
      const sender = parsed.from?.text || "";
      const recipients = parsed.to?.text || "";
      const sentDate = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
      const bodyText = parsed.text || parsed.html || "";

      // 스택파트 관련 메일 필터링 (스택, Stacking, 부품, 설비 등)
      const isStackPart = /스택|stack|극판|셀|조립|공정|도면|사양|개조/i.test(subject + bodyText);
      if (!isStackPart) continue;

      const senderType = identifySenderType(sender);
      console.log(`[Daou Sync] 스택파트 메일 수집: [${subject}] from ${sender} (${senderType})`);

      // Supabase Broadcast 채널로 전송하여 실시간 웹 앱에 반영
      const channel = supabase.channel('stack_assistant_realtime');
      await channel.send({
        type: 'broadcast',
        event: 'new_daou_mail',
        payload: {
          accountName: account.name,
          accountEmail: account.email,
          subject,
          sender,
          recipients,
          sentDate,
          bodyText: bodyText.slice(0, 3000),
          senderType
        }
      });
    }

    connection.end();
  } catch (err) {
    console.error(`[Daou Sync Error] ${account.name} 메일 조회 실패:`, err.message);
  }
}

// 60초마다 주기적 폴링 실행
async function runDaemon() {
  console.log("🚀 다우오피스 스택파트 메일 자동 동기화 데몬이 시작되었습니다.");
  for (const acc of DAOU_ACCOUNTS) {
    if (acc.password !== "daou_password_here") {
      await syncAccountMail(acc);
    }
  }
}

runDaemon();
setInterval(runDaemon, 60000);
