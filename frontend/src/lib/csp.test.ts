/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCsp, buildCspHeader } from './csp.ts'

// Two things keep the strict policy in csp.ts honest (ADR-0014): the policy itself must stay strict,
// and the source must never need anything it forbids (inline style, inline script, raw HTML).

const srcDir = path.resolve(import.meta.dirname, '..')
const appDir = path.resolve(srcDir, '..')

function sourceFiles(extensions: string[]): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => extensions.some((ext) => file.endsWith(ext)) && !file.includes('.test.'))
}

// Comments are removed so that prose like "never use innerHTML" cannot trip a rule.
function code(file: string): string {
  return readFileSync(path.join(srcDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

describe('Content Security Policy', () => {
  const directives = new Map(
    buildCsp()
      .split('; ')
      .map((part) => {
        const [name = '', ...sources] = part.split(' ')
        return [name, sources] as const
      }),
  )

  it('denies everything by default and allows scripts only from the same origin', () => {
    expect(directives.get('default-src')).toEqual(["'none'"])
    expect(directives.get('script-src')).toEqual(["'self'"])
    expect(directives.get('object-src')).toEqual(["'none'"])
    expect(directives.get('base-uri')).toEqual(["'none'"])
  })

  it('never allows unsafe-inline, unsafe-eval, wildcards or remote origins', () => {
    expect(buildCspHeader()).not.toMatch(/unsafe-|\*|https?:|\/\//)
  })

  it('keeps frame-ancestors only in the header form, where it works', () => {
    expect(buildCsp()).not.toContain('frame-ancestors')
    expect(buildCspHeader()).toContain("frame-ancestors 'none'")
  })
})

describe('source stays compatible with the policy and free of raw HTML', () => {
  it('finds the source files, so the checks below are not vacuous', () => {
    expect(sourceFiles(['.tsx']).length).toBeGreaterThanOrEqual(10)
    expect(sourceFiles(['.ts', '.tsx']).length).toBeGreaterThanOrEqual(30)
  })

  it('never writes raw HTML or runs strings as code', () => {
    const forbidden =
      /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\b|javascript:/
    for (const file of sourceFiles(['.ts', '.tsx'])) {
      expect(code(file), `${file} uses raw HTML or runs a string as code`).not.toMatch(forbidden)
    }
  })

  it('never uses inline styles or a style element (style-src is self only)', () => {
    for (const file of sourceFiles(['.tsx'])) {
      expect(code(file), `${file} uses an inline style`).not.toMatch(/\sstyle\s*=|<style\b/)
    }
  })

  it('has no inline script, style or event handler in index.html', () => {
    const html = readFileSync(path.join(appDir, 'index.html'), 'utf8')
    for (const script of html.matchAll(/<script\b([^>]*)>/gi)) {
      expect(script[1], 'inline <script> in index.html').toMatch(/\bsrc=/)
    }
    expect(html).not.toMatch(/<style\b|\sstyle\s*=|\son[a-z]+\s*=/i)
  })
})
