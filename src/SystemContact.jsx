import { useState } from "react";
import { Icon } from "./icons";
import "./SystemContact.css";

// 시스템 문의 담당자. 권한 요청·오류·기능 제안은 모두 여기로 받는다.
// 권한 제한 팝업, 견적 접근 제한 화면, 사용자 메뉴의 "시스템 문의"가 같은 값을 쓴다.
export const SYSTEM_CONTACT = {
  name: "조민재 선임",
  team: "PM팀",
  email: "cmj1012@twgroup.co.kr",
  tel: "+82 10 5506 8739",
};

const MAIL_SUBJECT = "[TW Project Manager] 시스템 문의";

export function contactMailto({ requester = "", topic = "" } = {}) {
  const lines = [
    `문의자: ${requester || ""}`,
    `문의 종류: ${topic || "권한 요청 / 오류 신고 / 기능 제안 / 기타"}`,
    "화면(메뉴): ",
    "",
    "내용:",
    "",
  ];
  const q = `subject=${encodeURIComponent(MAIL_SUBJECT)}&body=${encodeURIComponent(lines.join("\n"))}`;
  return `mailto:${SYSTEM_CONTACT.email}?${q}`;
}

// 담당자 연락처 상자 (메일은 바로 쓰기, 전화는 걸기 링크)
export function SystemContactBox({ requester, topic, title = "권한 부여 및 시스템 문의" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SYSTEM_CONTACT.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 복사가 막힌 브라우저에서는 글자를 직접 선택해 복사한다 */
    }
  };
  return (
    <div className="sc-box">
      <div className="sc-box-title">
        <Icon name="info" size={14} />
        <span>{title}</span>
      </div>
      <dl className="sc-list">
        <dt>담당자</dt>
        <dd>{SYSTEM_CONTACT.name} ({SYSTEM_CONTACT.team})</dd>
        <dt>E-mail</dt>
        <dd>
          <a href={contactMailto({ requester, topic })}>{SYSTEM_CONTACT.email}</a>
          <button type="button" className="sc-copy" onClick={copy} title="메일 주소 복사">
            <Icon name={copied ? "check" : "copy"} size={13} />
            <span>{copied ? "복사됨" : "복사"}</span>
          </button>
        </dd>
        <dt>Tel</dt>
        <dd>
          <a href={`tel:${SYSTEM_CONTACT.tel.replace(/\s+/g, "")}`}>{SYSTEM_CONTACT.tel}</a>
        </dd>
      </dl>
    </div>
  );
}

// 사용자 메뉴 → "시스템 문의" 창
export function SystemContactModal({ requester, onClose }) {
  return (
    <div className="back" onMouseDown={onClose}>
      <div className="sc-modal" role="dialog" aria-modal="true" aria-labelledby="sc-modal-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sc-modal-head">
          <span className="sc-modal-icon"><Icon name="headset" size={20} /></span>
          <div>
            <div className="eyebrow">SUPPORT</div>
            <h3 id="sc-modal-title">시스템 문의</h3>
          </div>
          <button type="button" className="sc-close" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={16} />
          </button>
        </div>
        <p className="sc-modal-desc">
          권한 요청, 오류 신고, 기능 제안 등 시스템 관련 문의는 아래 담당자에게 메일이나 전화로 연락해 주세요.
          오류는 어느 화면에서 무엇을 눌렀는지와 화면 캡처를 함께 보내 주시면 빨리 확인할 수 있습니다.
        </p>
        <SystemContactBox requester={requester} title="문의 담당자" />
        <div className="sc-modal-actions">
          <a className="sc-mail-btn" href={contactMailto({ requester })}>
            <Icon name="pencil" size={15} />
            <span>메일 쓰기</span>
          </a>
          <button type="button" className="sc-close-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
