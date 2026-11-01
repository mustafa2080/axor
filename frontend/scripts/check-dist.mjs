// Runs after `vite build` (see the "build" script). Fails the build if dist/index.html would not
// work under the Content Security Policy, or if the policy did not make it into the file (ADR-0014).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../dist/index.html', import.meta.url))
const html = readFileSync(file, 'utf8')
const problems = []

const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i)
if (meta === null) {
  problems.push('no Content-Security-Policy <meta> tag')
} else {
  // Vite writes ' as &#39; inside the attribute; the browser reads it back as '.
  const policy = meta[1].replaceAll('&#39;', "'")
  const required = ["default-src 'none'", "script-src 'self'", "base-uri 'none'", "object-src 'none'"]
  for (const directive of required) {
    if (!policy.includes(directive)) problems.push(`policy is missing ${directive}`)
  }
  if (/unsafe-|\*|https?:/.test(policy)) {
    problems.push('policy allows unsafe-*, a wildcard or a remote origin')
  }
}

// Anything inline would be blocked by the policy and the page would load blank.
for (const script of html.matchAll(/<script\b([^>]*)>/gi)) {
  if (!/\bsrc="\/[^/"]/.test(script[1])) {
    problems.push(`script without a same-origin src: <script${script[1]}>`)
  }
}
if (/<style\b/i.test(html)) problems.push('inline <style> block')
if (/\sstyle\s*=/i.test(html)) problems.push('inline style attribute')
if (/\son[a-z]+\s*=/i.test(html)) problems.push('inline event handler attribute')
for (const link of html.matchAll(/<link\b[^>]*\bhref="([^"]*)"/gi)) {
  if (!link[1].startsWith('/') || link[1].startsWith('//')) {
    problems.push(`link to a non-local href: ${link[1]}`)
  }
}

if (problems.length > 0) {
  console.error(`dist/index.html CSP check failed:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log('dist/index.html CSP check passed')
