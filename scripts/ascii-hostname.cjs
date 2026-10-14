// Vercel CLI 는 os.hostname() 을 HTTP 헤더에 넣는데, 이 PC 이름에 한글이 있어
// "Cannot convert argument to a ByteString" 오류로 모든 명령이 실패한다.
// Node 프리로드로 hostname 을 영문으로 바꿔서 우회한다. (프로젝트 루트에서 실행)
//
//   PowerShell:  $env:NODE_OPTIONS = '--require ./scripts/ascii-hostname.cjs'; vercel ls
//
// 이 파일은 CLI 실행에만 쓰며 앱 코드와는 무관하다.
const os = require('os')
os.hostname = () => 'tw-pc'
