// بيتحمّل قبل أول رسم (script كلاسيكي في <head>) عشان ما يحصلش وميض فاتح قبل الداكن.
// ملف خارجي مش inline لأن الـ CSP بتمنع inline script (ADR-0014). نفس منطق src/lib/theme.ts.
;(function () {
  var stored = null
  try {
    stored = localStorage.getItem('axor-theme')
  } catch {
    stored = null
  }
  var dark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
})()
