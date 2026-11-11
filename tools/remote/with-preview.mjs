// Builds nothing: serves dist/ on a free port, runs one command with {url} replaced by its address, then stops the server.
// Usage: node tools/remote/with-preview.mjs <command> [args... with {url}]
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) throw new Error('usage: with-preview.mjs <command> [args with {url}]')
const port = await new Promise(resolve => { const s = createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)) }) })
const url = `http://localhost:${port}/`
const shell = process.platform === 'win32'
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', shell })
const up = async () => { for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) return true } catch { /* not yet */ } await new Promise(r => setTimeout(r, 250)) } return false }
let code = 1
try {
  if (!(await up())) throw new Error('the preview server did not start')
  const run = spawn(cmd, args.map(a => a.replaceAll('{url}', url)), { stdio: 'inherit', shell, env: { ...process.env, BASE_URL: url } })
  code = await new Promise(resolve => run.on('exit', c => resolve(c ?? 1)))
} finally {
  if (shell) spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else server.kill()
}
process.exit(code)
