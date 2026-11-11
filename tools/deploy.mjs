// Builds the game and publishes dist/ to the gh-pages branch, which GitHub Pages serves.
// Usage: node tools/deploy.mjs <empty work folder>
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const work = process.argv[2] && resolve(process.argv[2])
if (!work) throw new Error('pass an empty work folder')
if (existsSync(work) && readdirSync(work).length) throw new Error(`${work} is not empty`)
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()

const root = resolve(import.meta.dirname, '..')
const remote = run('git', ['remote', 'get-url', 'origin'], root)
const sha = run('git', ['rev-parse', '--short', 'HEAD'], root)
if (run('git', ['status', '--porcelain'], root)) throw new Error('commit your changes before deploying')
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })

mkdirSync(work, { recursive: true })
const hasBranch = run('git', ['ls-remote', '--heads', remote, 'gh-pages'], root) !== ''
if (hasBranch) run('git', ['clone', '--quiet', '--depth', '1', '--branch', 'gh-pages', remote, work], root)
else {
  run('git', ['init', '--quiet', '-b', 'gh-pages', work], root)
  run('git', ['remote', 'add', 'origin', remote], work)
}
for (const name of readdirSync(work)) if (name !== '.git') run('git', ['rm', '-r', '--quiet', '--ignore-unmatch', name], work)
cpSync(join(root, 'dist'), work, { recursive: true })
writeFileSync(join(work, '.nojekyll'), '')
run('git', ['add', '-A'], work)
run('git', ['-c', 'user.name=TheMizeGuy', '-c', 'user.email=70614294+TheMizeGuy@users.noreply.github.com', 'commit', '--quiet', '--allow-empty', '-m', `Deploy ${sha}`], work)
run('git', ['push', '--quiet', 'origin', 'gh-pages'], work)
console.log(`deployed ${sha} to gh-pages`)
