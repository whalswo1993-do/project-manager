// 서버 함수(api/)가 공통으로 쓰는 오류. status 는 HTTP 상태, code 는 클라이언트(src/ai.js)가 분기하는 식별자.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}
