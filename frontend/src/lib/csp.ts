// Content Security Policy for the built single-page app (ADR-0014).
//
// The app is plain React: every value is rendered as text, there is no inline script or style, and
// all assets are bundled by Vite and served from the same origin as the API. So the policy can be
// strict and still allow everything the app needs.
//
// It is injected into dist/index.html as a <meta> tag at build time only (vite.config.ts), because
// the dev server needs inline scripts for hot reload. A <meta> CSP cannot carry frame-ancestors,
// report-uri or sandbox: whoever serves dist/ should also send this same policy as a real response
// header, plus `frame-ancestors 'none'`.

const DIRECTIVES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['default-src', ["'none'"]],
  ['script-src', ["'self'"]],
  ['style-src', ["'self'"]],
  ['font-src', ["'self'"]],
  // data: is for the one inline SVG chevron in index.css.
  ['img-src', ["'self'", 'data:']],
  ['connect-src', ["'self'"]],
  ['base-uri', ["'none'"]],
  ['form-action', ["'self'"]],
  ['object-src', ["'none'"]],
]

/** The policy as one header-style string: `default-src 'none'; script-src 'self'; ...`. */
export function buildCsp(): string {
  return DIRECTIVES.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

/** The same policy, with the one directive that only works as a header added. */
export function buildCspHeader(): string {
  return `${buildCsp()}; frame-ancestors 'none'`
}
