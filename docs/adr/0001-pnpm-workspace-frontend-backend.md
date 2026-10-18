# ADR-0001: pnpm workspace مع مجلدي `frontend` و`backend`

- **الحالة:** مقبول (مبدئيًا، بانتظار مراجعة المدير)
- **التاريخ:** 2026-10-18

## السياق

`TASKS.md` يقترح هيكل Monorepo بمجلدي `apps/web` و`apps/api`، وينص على أن الهيكل قابل للتعديل حسب التقنية الفعلية. المستودع بدأ فعليًا بمجلدي `frontend` و`backend` في جذر `AXOR`.

## القرار

- استخدام **pnpm workspaces** (`pnpm-workspace.yaml`) مع المسارات: `frontend`، `backend`، `packages/*`.
- إبقاء الاسمين `frontend` و`backend` بدل `apps/web` و`apps/api` لتجنب مستوى تداخل إضافي بلا فائدة الآن.
- تثبيت إصدار pnpm في `package.json` الجذر (`packageManager`) لضمان نفس الإصدار محليًا وفي CI.
- الواجهة: React + TypeScript + Vite. الخادم: Node.js + TypeScript (الإطار وقاعدة البيانات في ADR لاحق).

## النتائج

- أوامر موحدة من الجذر (`pnpm typecheck | lint | test | build | check`).
- يمكن لاحقًا نقل المجلدين إلى `apps/` بسهولة إن لزم، لأن الربط يتم عبر أسماء الحزم لا المسارات.
- مجلد `backend` غير مفعّل كحزمة حتى يُعتمد قرار الخادم.
