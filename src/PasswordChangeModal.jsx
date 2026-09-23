import { useState } from "react";
import { updateUserPassword } from "./authService";

export default function PasswordChangeModal({
  isOpen,
  onClose,
  mode = "change", // "change" | "recovery"
  userEmail = "",
  onSuccess,
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  if (!isOpen) return null;

  const isLengthValid = newPassword.length >= 6;
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = isLengthValid && isMatch && !submitting;

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!isLengthValid) {
      setErrorMsg("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    if (!isMatch) {
      setErrorMsg("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await updateUserPassword(newPassword, userEmail);
      if (!result.success) {
        setErrorMsg(result.error || "비밀번호 변경에 실패했습니다.");
        return;
      }

      setSuccessMsg(result.message || "비밀번호가 성공적으로 변경되었습니다.");
      setTimeout(() => {
        if (onSuccess) onSuccess(result.message);
        if (onClose) onClose();
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || "비밀번호 변경 중 예기치 않은 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="back"
      style={{
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mode !== "recovery") {
          onClose();
        }
      }}
    >
      <div
        className="modal"
        style={{
          maxWidth: "440px",
          width: "92vw",
          padding: "28px 24px",
          borderRadius: "16px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
        }}
      >
        {mode !== "recovery" && (
          <button
            className="close"
            onClick={onClose}
            style={{
              top: "16px",
              right: "16px",
              color: "#64748b",
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            &times;
          </button>
        )}

        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 12px",
              background: mode === "recovery" ? "#eff6ff" : "#f0fdf4",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            {mode === "recovery" ? "🔄" : "🔑"}
          </div>
          <h2 style={{ margin: "0 0 6px", fontSize: "20px", color: "#1e293b", fontWeight: 700 }}>
            {mode === "recovery" ? "비밀번호 재설정" : "비밀번호 변경"}
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: 1.4 }}>
            {mode === "recovery"
              ? "이메일 인증이 확인되었습니다. 사용할 새 비밀번호를 입력해 주세요."
              : userEmail
              ? `계정: ${userEmail}`
              : "안전한 새 비밀번호를 설정해 주세요."}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
              새 비밀번호
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6자리 이상 입력"
                minLength={6}
                required
                style={{
                  paddingRight: "40px",
                  fontSize: "14px",
                  borderRadius: "8px",
                  borderColor: newPassword && !isLengthValid ? "#f87171" : "#cbd5e1",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  color: "#64748b",
                  padding: "4px 8px",
                  fontSize: "13px",
                }}
              >
                {showPassword ? "숨김" : "보기"}
              </button>
            </div>
            <div style={{ marginTop: "4px", fontSize: "11px", color: isLengthValid ? "#16a34a" : "#94a3b8" }}>
              {isLengthValid ? "✓ 6자리 이상 충족" : "• 최소 6자 이상 필요"}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
              새 비밀번호 확인
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 다시 입력"
              minLength={6}
              required
              style={{
                fontSize: "14px",
                borderRadius: "8px",
                borderColor: confirmPassword && !isMatch ? "#f87171" : "#cbd5e1",
              }}
            />
            <div style={{ marginTop: "4px", fontSize: "11px", color: isMatch ? "#16a34a" : confirmPassword ? "#dc2626" : "#94a3b8" }}>
              {isMatch
                ? "✓ 비밀번호가 일치합니다."
                : confirmPassword
                ? "✕ 비밀번호가 일치하지 않습니다."
                : "• 동일한 비밀번호를 다시 입력하세요."}
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                fontSize: "12px",
                lineHeight: 1.4,
                textAlign: "center",
              }}
            >
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#16a34a",
                fontSize: "12px",
                lineHeight: 1.4,
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              ✓ {successMsg}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            {mode !== "recovery" && (
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  flex: 1,
                  background: "#f1f5f9",
                  color: "#475569",
                  fontWeight: 600,
                  fontSize: "14px",
                  height: "42px",
                  borderRadius: "8px",
                }}
              >
                취소
              </button>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              className="primary"
              style={{
                flex: 2,
                height: "42px",
                fontSize: "14px",
                fontWeight: 600,
                borderRadius: "8px",
                opacity: canSubmit ? 1 : 0.6,
                cursor: canSubmit ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "저장 중..." : mode === "recovery" ? "비밀번호 재설정 완료" : "비밀번호 변경 저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
