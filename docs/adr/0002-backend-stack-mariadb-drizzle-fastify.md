# ADR-0002: حزمة الخادم وقاعدة البيانات وأداة ORM

- **الحالة:** مقبول (اختيار MariaDB من المدير بتاريخ 2026-10-18؛ باقي الحزمة مقترح من Claude وقُبل ضمنيًا مع هذا الاختيار)
- **التاريخ:** 2026-10-18

## السياق

البند 2 في `TASKS.md` يشترط توثيق اختيار إطار الخادم وقاعدة البيانات وأداة ORM قبل كتابة كود الخادم. نظام STARK الحالي يعمل بـ Node.js/TypeScript مع Drizzle ORM وMariaDB، وسيكون أول نظام داخل AXOR.

## القرار

| الطبقة | الاختيار |
|---|---|
| بيئة التشغيل | Node.js 22 + TypeScript (strict) |
| إطار HTTP | Fastify |
| التحقق من المدخلات | Zod |
| قاعدة البيانات | **MariaDB** |
| ORM / migrations | Drizzle ORM (dialect: MySQL عبر `mysql2`) + Drizzle Kit |
| الاختبارات | Vitest |

## الأسباب

- **MariaDB:** نفس قاعدة STARK، فالخبرة والاستضافة والنسخ الاحتياطي موحّدة، ويسهل التكامل بين النظامين.
- **Drizzle:** نفس الأداة المستخدمة في STARK، وأنواع TypeScript مولّدة من schema، واستعلامات parameterized تمنع SQL injection.
- **Fastify + Zod:** أداء جيد، ودعم أصيل للـ schemas والـ hooks والـ plugins، ويفصل Routes عن Controllers وServices كما يطلب البند 4.

## المقايضات والمخاطر

- MariaDB لا تدعم Row-Level Security، فعزل الشركات (tenant isolation) **يجب أن يُفرض في طبقة التطبيق**:
  - كل استعلام يمر عبر Repository مقيّد بـ `tenant_id`، ولا يُسمح بالوصول المباشر للجداول من Services أو Controllers.
  - اختبارات عزل صريحة (شركة A لا ترى بيانات شركة B) تُكتب قبل أول endpoint يقرأ بيانات شركة.
- استراتيجية Multi-tenancy النهائية (قاعدة مشتركة مع `tenant_id` أو غيرها) تُحسم في ADR منفصل بعد مراجعة STARK.
- لا يُستخدم أي ORM أو query builder آخر بجانب Drizzle.
