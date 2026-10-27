# AXOR

منصة SaaS لإدارة الأنظمة والاشتراكات. تبدأ بنظام الشحن **STARK**، ويُضاف نظام **CAPRINA** التجاري لاحقًا.

> خطة العمل ومعايير الإنجاز في [`TASKS.md`](./TASKS.md). القرارات المعمارية في [`docs/adr/`](./docs/adr).

## الهيكل

| المسار | المحتوى |
|---|---|
| `frontend/` | واجهة React + TypeScript (Vite) |
| `backend/` | الخادم Fastify + TypeScript (قاعدة البيانات MariaDB + Drizzle قادمة، انظر ADR-0002) |
| `packages/` | حزم مشتركة (أنواع، schemas) |
| `docs/` | architecture, adr, api, security, runbooks |
| `infra/` | النشر والمراقبة |

## المتطلبات

- Node.js 22 أو أحدث
- pnpm 12 (الإصدار مثبت في `package.json` عبر حقل `packageManager`)

## التشغيل محليًا

```powershell
pnpm install          # تثبيت الحزم (يلتزم بـ pnpm-lock.yaml)
pnpm dev:web          # الواجهة على http://localhost:5173
pnpm dev:api          # الخادم على http://127.0.0.1:4000 (فحص: /api/v1/health)
```

## الأوامر الموحدة (من الجذر)

| الأمر | الوظيفة |
|---|---|
| `pnpm typecheck` | فحص TypeScript لكل المشاريع |
| `pnpm lint` | فحص الكود |
| `pnpm test` | تشغيل الاختبارات (Vitest في الخادم) |
| `pnpm build` | بناء كل المشاريع |
| `pnpm check` | تشغيل typecheck ثم lint ثم test ثم build |

> **فحص قبل الـ commit:** `pnpm install` بيفعّل `.githooks/pre-commit` تلقائياً، وهو بيشغّل `pnpm lint` و`pnpm typecheck`. التجاوز بـ `git commit --no-verify` ممكن، لكن الـ CI بيفحص كل push. تحديثات الاعتماديات بتيجي أسبوعياً من Dependabot (ADR-0008).

## قاعدة البيانات (MariaDB)

```powershell
pnpm db:migrate       # يطبّق الـ migrations على DATABASE_URL (الموجود في .env)
pnpm db:generate      # يولّد migration جديدة من المخطط بعد تعديل backend/src/database/schema
pnpm db:lock          # يسجّل checksum الـ migration الجديدة (إجباري بعد db:generate)
```

- الـ migrations للأمام بس ومبتتعدّلش بعد الـ commit (ADR-0009)؛ أي أمر مدمّر (`DROP` وغيره) محتاج سطر `-- destructive-approved: <السبب>`. `pnpm test` بيفحص ده.
- التطوير على `axor_dev`، والاختبارات بتتحول تلقائياً لـ `axor_test` (مش بتلمس بيانات التطوير أبداً).
- `/api/v1/health` للـ liveness، و`/api/v1/health/ready` بيفحص الاتصال بقاعدة البيانات.

## البيئة

انسخ `.env.example` إلى `.env` وعدّل القيم محليًا. لا ترفع `.env` ولا أي أسرار إلى المستودع.
