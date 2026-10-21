// 개발용: 운영 컨테이너(ribs)의 DB 설정을 받아 게임 서버를 켠다 (판 기록을 PostgreSQL에 저장하려고).
// 설정 값은 화면·파일에 남기지 않고 자식 프로세스 환경으로만 넘긴다.
// 컨테이너 안 DB 호스트 이름이 이 PC에서 안 잡히면 같은 PC에 열린 포트(127.0.0.1)로 바꾼다.
// 사용: node app/yeouido-game-server/scripts/dev-with-db.mjs   (그 밖의 BR_* 환경 변수는 그대로 전달)
import { execFileSync, spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';

const KEYS = [ 'DBUSER', 'DBPASS', 'DBHOST', 'DBPORT', 'DB' ];
const container = process.env.DB_FROM_CONTAINER || 'ribs';

const env = { ...process.env };
try {
  const out = execFileSync('docker', [ 'inspect', container, '--format', '{{range .Config.Env}}{{println .}}{{end}}' ], { encoding: 'utf8' });
  const got = [];
  out.split('\n').forEach((line) => {
    const i = line.indexOf('=');
    const k = line.slice(0, i);
    if (i > 0 && KEYS.includes(k)) {
      env[k] = line.slice(i + 1);
      got.push(k);
    }
  });
  console.log(`[dev-with-db] ${container} 컨테이너에서 받은 설정: ${got.join(', ') || '없음'}`);
  if (env.DBHOST) {
    try {
      await lookup(env.DBHOST);
    } catch {
      console.log('[dev-with-db] DB 호스트 이름이 이 PC에서 안 잡혀 127.0.0.1로 연결');
      env.DBHOST = '127.0.0.1';
    }
  }
} catch (e) {
  console.log(`[dev-with-db] 컨테이너 설정을 못 읽음 — 파일로 기록합니다 (${e.message.split('\n')[0]})`);
}

const child = spawn('npx', [ 'nx', 'serve', 'yeouido-game-server' ], { env, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);