# ADR-0014: سياسة CSP والحماية من XSS في الواجهة

- **الحالة:** منفّذ (2026-11-01) — الواجهة. السياسة بتتحط في `dist/index.html` وقت الـ build. السياسة نفسها لازم تتبعت كـ header من الخادم اللي هيقدّم `dist/` (النشر لسه مش مكتوب في `infra/deployment`).
- **السياق:** الواجهة React عادية: كل قيمة بتتعرض كنص، ومفيش HTML جاي من بيانات المستخدم. بند XSS في TASKS.md بيطلب تجنّب HTML غير الموثوق وترميز المخرجات وسياسة CSP مناسبة. الباك (`@fastify/helmet`، ADR-0004 §12) بيحمي ردود الـ API بس، مش صفحة الواجهة.

## القرار

1. **ترميز المخرجات:** بنعتمد على escape بتاع React، ومفيش مكان بيكتب HTML خام. حارس ساكن في `csp.test.ts` بيفشل لو ظهر `dangerouslySetInnerHTML` أو `innerHTML` أو `outerHTML` أو `insertAdjacentHTML` أو `document.write` أو `eval` أو `new Function` أو `javascript:` في أي ملف مصدر (من غير التعليقات).
2. **سياسة صارمة:** `default-src 'none'` وبعدها بنفتح بس اللي التطبيق محتاجه من نفس الأصل: `script-src` و`style-src` و`font-src` و`connect-src` على `'self'`، و`img-src 'self' data:` (علشان سهم SVG واحد في `index.css`)، و`base-uri 'none'` و`object-src 'none'` و`form-action 'self'`. مفيش `unsafe-inline` ولا `unsafe-eval` ولا wildcard ولا أصل خارجي.
3. **من غير inline:** الكود مفيهوش `style=` ولا `<style>` ولا سكربت أو event handler داخل `index.html`. الحارس بيفشل لو اتضاف واحد منهم، فالسياسة تفضل صارمة من غير ما نحتاج نخفّفها.
4. **التطبيق وقت الـ build بس:** `vite.config.ts` بيحقن `<meta http-equiv="Content-Security-Policy">` في `dist/index.html`. سيرفر التطوير سايبينه من غير سياسة لأن الـ hot reload محتاج inline script.
5. **فحص بعد الـ build:** `frontend/scripts/check-dist.mjs` بيشتغل بعد `vite build` جوّه أمر `build`، وبيفشل الـ build لو السياسة مش موجودة أو ناقصها directive أساسي أو فيها `unsafe-*` أو wildcard أو أصل خارجي، أو لو الصفحة النهائية فيها سكربت أو style أو handler inline أو رابط لأصل غير محلي.
6. **الروابط:** كلها روابط `#/...` ثابتة، ما عدا رابط التسجيل اللي بيتبني بـ `registerHash` (بيعمل `encodeURIComponent`). والقراءة من الرابط في `parsePlanChoice` بتقبل أكواد بشكل `^[a-z0-9][a-z0-9_-]{0,49}$` بس.
7. **التوكنات:** الـ access token في الذاكرة بس (مش `localStorage`)، والـ refresh token في كوكي `HttpOnly`. فلو XSS حصل، مفيش توكن طويل العمر يتسرق من التخزين.

## خارج النطاق

- `frame-ancestors` و`report-uri` و`sandbox`: مش بيشتغلوا في `<meta>`. لازم السياسة نفسها (`buildCspHeader()` في `csp.ts` بتضيف `frame-ancestors 'none'`) تتبعت كـ header من الخادم اللي بيقدّم `dist/`. ده بند نشر لسه ما اتكتبش.
- Trusted Types وnonces: مش محتاجينهم طالما مفيش inline ولا HTML خام.
- Subresource Integrity: كل الملفات بتتقدّم من نفس الأصل.

## النتائج

- أي ميزة هتحتاج inline style أو سكربت خارجي أو خط من CDN لازم تعدّل الـ ADR ده الأول، لأن الحارس والـ check هيفشلوا.
- مشاكل CSP بتظهر في `build` و`preview` بس، مش في سيرفر التطوير. `check-dist.mjs` بيغطي أغلبها.
- الحارس regex على نص الملف: مش بيمسك استدعاء HTML خام متبني ديناميكياً (`el['inner'+'HTML']`). المراجعة والـ lint بيغطوا ده.
