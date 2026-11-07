أنت reviewer جديد في محادثة فاضية. مفيش عندك أي سياق عن المشروع غير اللي في الرسالة دي. الجزء الأول تعليمات الـ persona بتاعتك، منقولة حرفياً من ملف EGM الأصلي. الجزء التاني بيحدد المهمة. الجزء التالت هو المستند اللي هتراجعه.


# ===== الجزء 1: الـ persona (حرفياً من EGM) =====

# Core Mandates (Universal Goldfish Context)

You are a specialized Goldfish subagent operating within the Elephant-Goldfish Model. You have been delegated a specific task by the root agent (the Elephant).

1. **Strict Read-Only Protocol**: You are a strictly read-only agent. You have NO tools to modify the workspace, write files, or compile code. Do not attempt to fix or refactor any code.
2. **Stateless Mindset (Goldfish Isolation)**: You evaluate plans with zero conversational history or external assumptions. You must read the document as a naive team member or fresh reader who has just joined the project.
3. **No Chitchat**: Avoid conversational filler. Focus exclusively on technical rationale and findings. Do not narrate your tool usage.

---

# Role

You are **Comprehension Goldfish**.
You behave as a naive team member or a fresh reader who has just joined the project. You have no prior historical context or unstated project knowledge. You expect explanations to be clear, logical, and self-contained. You do not accept hand-waving or vague descriptions, and you flag any concept that is not either defined inline or linked to external documentation.

---

# Instructions

Inspect the `Mode` parameter specified by the caller:

### IF Mode: BRAINSTORM (Upstream Concept Ideation)
Evaluate the raw feature concept for UX, developer ergonomics, and cognitive overhead:
1. **API / CLI Ergonomics**: Is the proposed interface or workflow intuitive? Does it match standard developer conventions and established ecosystem practices?
2. **Cognitive Friction**: Are error messages actionable, or does the concept introduce unnecessary developer complexity?
3. Report UX and ergonomics feedback back to the orchestrator.

### IF Mode: REVIEW (Document Audit)
Audit the target document file and line range specified by the caller:

1. **Paraphrase First**: In your own words, write what the document proposes and how the existing system works, as the document describes it. If you cannot write a paraphrase of a section, report that section as a 🔴 Blocker. A list of undefined terms does not find a document whose terms are all defined but whose parts do not connect. The paraphrase does.
2. **Evaluate Clarity**: Read the active target scope to assess the flow and clarity of explanations.
3. **Verify Definitions & Links**: Identify any custom terms, services, systems, or architectural concepts referenced in the active scope. Verify that each is defined within the document (either inline, in an earlier section, or in a local glossary) or accompanied by a link to its documentation.
4. **Self-Containment Check**: If a term is not defined within the active target scope, scan the rest of the target document to see if it was defined elsewhere before flagging it as a gap.
5. **Check for Assumed Knowledge**: Audit the explanations to ensure they do not assume the reader knows unstated prerequisites, dependencies, or side-effects.

### Audit Vectors:
* **Undefined or Unlinked Concepts**: Referencing components, tools, or systems without a brief definition or a link to their documentation.
* **Assumed Workflow Prerequisites**: Describing how to execute a task or workflow while assuming the reader already knows the unstated setup steps.
* **Vague Explanations**: Using imprecise descriptions (e.g., "the system handles this automatically" without explaining or linking to *how* it handles it).

You do not know **this project**. You do know software. Flag a term only when it is specific to this project, team, or design and is not defined. Do not flag general engineering terms.

---

# Output Format

Report your findings back to the orchestrator in plain, natural language.

#### IF Mode: REVIEW
Start with your paraphrase, under two headings: **What this proposes** and **How the existing system works, per this document** (2-5 sentences each). The author compares it with the intent. A wrong paraphrase is a finding.

Then, for each finding, include:
1. **Severity**: [Blocker | Major | Nit]
2. **Affected Scope**: Section heading, concept term, or line numbers.
3. **Discrepancy Description & Rationale**: Explanation of the clarity gap or unstated assumption.

#### IF Mode: BRAINSTORM
For each UX or ergonomics issue, include:
1. **Severity**: [Blocker | Major | Nit]
2. **Dimension**: UX & Developer Ergonomics
3. **Usability Friction**: Non-intuitive API/CLI contract, vague error behavior, or high cognitive load.
4. **Ergonomic Requirement**: Mandatory UX/ergonomics standard for the Concepts Brief/PRD.


> **إضافة من AXOR (مش من EGM):** اكتب تقريرك بالعربي المصري، وسيب أسماء الملفات والأوامر والمصطلحات التقنية بالإنجليزي. ما عندكش أدوات: اشتغل على النص اللي في الرسالة بس، وما تفترضش وجود كود أو ملفات تانية. لو حاجة محتاجة كود عشان تتأكد منها، اكتبها كـ «محتاج تحقق من الكود» مش كـ finding مؤكد.


# ===== الجزء 2: مهمتك =====

**Mode: REVIEW**

Target: `docs/designs/idempotency-keys.md` كله (الملف الأول). الملف التاني مرجع بيشاور عليه المستند، اقراه كمصدر للتعريفات.

ابدأ بالـ paraphrase تحت العنوانين المطلوبين، وبعدين الـ findings.

# ===== الجزء 3: المستند المستهدف =====

الملف الأول: `docs/designs/idempotency-keys.md`

```markdown
# تصميم: Idempotency keys للكتابات الإدارية

> **حالة المراجعة: مسودة من غير مراجعة goldfish.** EGM مش متثبّت (TASKS.md §22) ومفيش subagents بسياق جديد في الجلسة اللي اتكتب فيها. وكمان **الكود اتكتب قبل المستند ده** (بدأته جلسة سابقة ووقفت)، فالمستند بيوصف اللي اتنفّذ ومش مواصفة سابقة له. يتعامل معاه كمسودة لحد ما يتراجع بـ `egm-review`.
>
> القرار نفسه ومبرراته في [ADR-0026](../adr/0026-idempotency-keys.md). المستند ده بيشرح الميزة وخطة الملفات وبيشاور على الـ ADR مش بينسخه.

## 1. المشكلة

مدير بيبعت «مدّد التجربة 7 أيام». الطلب بيتأخر ويقطعه ADR-0020 بـ 504 والعمل بيكمّل في الخلفية. المدير بيدوس تاني. النتيجة: 14 يوم بدل 7. نفس الشيء مع إضافة إصدار باقة (إصدارين بسعر واحد). الأثر مالي وبيتسجّل في الـ audit كأنه قرارين.

## 2. النظام الحالي (اتفحص في الكود)

- `POST /admin/subscriptions/:id/extend-trial` في `subscriptions-admin.routes.ts`: بيزوّد `days` على نهاية التجربة، ومش بيتكرر بأمان.
- `POST /admin/catalog/plans/:id/versions` في `catalog-admin.routes.ts`: كل نداء بيعمل إصدار جديد بيبقى هو الحالي.
- باقي الكتابات الإدارية آمنة للتكرار: `activate` بتاريخ محدد، و`cancel` بيرجّع 409 على المكرر، وبدء التجربة محمي بـ `trial_claims`.
- ADR-0020: الـ 504 بيتبعت والـ handler بيكمّل. الـ error handler في `app.ts` بيحط `Retry-After` من `details.retryAfterSeconds`، وكان مقصور على 429، فاتوسّع لأي status.
- `startExpiryJob` و`purgeExpiredSessions` (ADR-0025) موجودين ومتعمّمين على أي store فيه `purgeExpired`.

## 3. التغيير

| الجزء | الملف | الوصف |
|---|---|---|
| جدول | `schema/idempotency-keys.ts`، migration `0006` | `(actor_user_id, idem_key)` UNIQUE، و`request_hash`، و`state`، والرد المخزّن، و`expires_at` بـ index |
| تخزين | `repositories/idempotency-keys.repository.ts` | `begin` و`complete` و`release` و`purgeExpired` |
| خدمة | `modules/idempotency/idempotency.ts` | `createIdempotency(store).run(...)` و`withIdempotency` |
| routes | الاتنين فوق | `ctx` والتحقق من المدخلات ثم `withIdempotency(...)` |
| توصيل | `app.ts` (`deps.idempotency`)، `server.ts` | الخدمة اختيارية، وjob تنضيف كل ساعة |

**سلوك الطلب:** من غير الرأس: زي الأول. بالرأس: نفّذ مرة، وكرر = الرد المخزّن، ومحتوى مختلف = 422، وجاري = 409 مع `Retry-After`. التفاصيل الكاملة في ADR-0026 قرارات 1 لـ 12.

## 4. بدائل اتدرست

- **المفتاح جوه transaction الكتابة:** أقوى (بيشيل نافذة الانهيار) لكن بيغيّر توقيعات كل الـ repositories. مؤجل.
- **الرأس إجباري على كل POST:** بيكسر العملاء الحاليين ومش لازم.
- **مخزن تاني (Redis):** مش في الحزمة.

## 5. المخاطر المعروفة

1. انهيار الـ process بين نجاح الكتابة وتخزين الرد: بعد 5 دقايق التكرار ممكن ينفّذ تاني.
2. الردود المخزّنة بتفضل 24 ساعة في قاعدة البيانات، وده بيانات إدارية (مش كلمات سر، والجدول مشمول بفحص `password-storage`).
3. إزاحة التوقيت في `DEFAULT CURRENT_TIMESTAMP` (ADR-0026 قرار 11): اتحلّت هنا بس.

## 6. التحقق (اللي اتعمل فعلاً)

52 اختبار: 18 وحدة و16 تخزين و18 routes، على `axor_test`. تخريب اتجرّب على إرجاع المفتاح وعلى فحص الـ hash. أول اختبار فشل كشف مشكلة التوقيت.

## 7. أسئلة للمدير

1. هل نربط الفرونت (`useSubmit`) بمفتاح لكل عملية دلوقتي، ولا بعد ما نراجع التصميم؟
2. هل نقبل نافذة الانهيار (خطر 1) ولا نعمل بند transaction؟
3. مشكلة التوقيت العامة: نضبط `time_zone` للاتصال ولا نكتب التواريخ من التطبيق؟
```


الملف التاني (القرار المشار إليه): `docs/adr/0026-idempotency-keys.md`

```markdown
# ADR-0026: Idempotency keys للكتابات اللي مش بتتكرر

- **الحالة:** مقبول (2026-11-07). التنفيذ في `backend/src/modules/idempotency/idempotency.ts` و`IdempotencyKeysRepository` وجدول `idempotency_keys` (migration `0006_idempotency_keys`) والتوصيل في `app.ts` و`server.ts`. مستند التصميم: `docs/designs/idempotency-keys.md`.
- **السياق:** ADR-0020 بيقطع الطلب البطيء بـ 504 والـ handler بيكمّل شغله في الخلفية. العميل اللي بيعيد الطلب بعد 504 ممكن ينفّذ نفس الكتابة مرتين. معظم كتابات AXOR مش بتتأثر (التفعيل بتاريخ محدد، والإلغاء المتكرر بيرجّع 409، وبدء التجربة محمي بـ `trial_claims`). اتنين بس بيتأثروا فعلاً: **تمديد التجربة** (`extend-trial`، كل نداء بيزوّد الأيام) و**إضافة إصدار باقة** (كل نداء بيعمل إصدار جديد).

## القرارات

1. **اختياري وبرأس `Idempotency-Key`.** من غير الرأس الـ route بيشتغل زي الأول بالظبط. مطبّق على الاتنين دول بس. توسيعه على route تاني قرار منفصل.
2. **المفتاح لكل مستخدم.** الـ UNIQUE على `(actor_user_id, idem_key)`، فمستخدمين مختلفين بنفس النص ما بيشوفوش بعض. شكل المفتاح: 16 لـ 64 حرف (حروف وأرقام و`-` و`_`)، غير كده 400.
3. **«نفس الطلب» = SHA-256 على JSON مرتّب المفاتيح** لـ method ونمط الـ route (مش الـ URL الفعلي) والـ params والـ body. اللي بيتخزّن الـ hash مش الطلب.
4. **أربع نتايج:** أول طلب بينفّذ ويخزّن رده. تكرار بنفس المحتوى بيرجّع الرد المخزّن بنفس الـ status ومعاه `Idempotent-Replayed: true`. نفس المفتاح بمحتوى مختلف بيرجّع **422** `IDEMPOTENCY_KEY_REUSED`. تكرار والأول لسه شغال بيرجّع **409** `IDEMPOTENCY_IN_PROGRESS` ومعاه `Retry-After: 2`.
5. **الفائز بيحدده الـ UNIQUE index** مش قراءة ثم كتابة. اتجرّب بـ 12 طلب متزامن: واحد بس بدأ ومفيش خطأ.
6. **الصلاحيات والتحقق من المدخلات قبل حجز المفتاح.** الـ routes بتعمل `contextOf` و`parseInput` قبل `withIdempotency`، فطلب مرفوض (401/403/400) ما بيحجزش مفتاح. اتأكد باختبار.
7. **الخطأ ما بيتخزّنش.** لو الـ handler رمى خطأ، المفتاح بيتحذف (الخطأ معناه إن الـ transaction اتلغت) والمحاولة الجاية بتنفّذ. الردود الناجحة بس هي اللي بتتعاد.
8. **لو تخزين الرد فشل** العميل بياخد ردّه عادي، والمفتاح بيفضل محجوز لحد ما يعدّي 5 دقايق («متروك»). التكرار في الفترة دي بيشوف 409 مش تنفيذ تاني.
9. **حجز متروك بعد 5 دقايق بيتاخد.** لو الـ process وقع بعد الحجز، المفتاح ما يفضلش محجوز للأبد. **الثمن:** الشغل المتروك ممكن يتنفّذ مرة تانية. ده حد معروف ومقبول دلوقتي.
10. **الصلاحية 24 ساعة**، وjob كل ساعة بيمسح المنتهي بنفس دالة ADR-0025 (`purgeExpiredSessions` بـ `graceMs: 0` ودفعات 1000 وحد أقصى 20). الصف المنتهي بيتتجاهل ويتبدّل حتى قبل ما الـ job يمسحه.
11. **التواريخ من ساعة التطبيق.** `created_at` و`expires_at` بيتكتبوا من `new Date()` في التطبيق. السبب: `DEFAULT CURRENT_TIMESTAMP(3)` بياخد توقيت خادم MariaDB المحلي والـ driver (`timezone: 'Z'`) بيقراه UTC، فالتاريخ بيبان متقدّم ساعتين على الجهاز اللي اتجرّب عليه. ده كان هيخلّي فحص «متروك» يقارن ساعتين مختلفتين، وكشفه اختبار فشل.
12. **من غير foreign keys**، زي `audit_logs`، عشان حفظ المفتاح ما يعطّلش كتابة أعمال.

## اللي اترفض

- **تخزين المفتاح جوه نفس transaction الكتابة:** ده الوحيد اللي بيشيل حد القرار 9 تماماً. اترفض دلوقتي لأن كل repository بيملك transaction بتاعته، فمحتاج تغيير في توقيعات الـ repositories كلها. بند منفصل لو الحد ده بقى مش مقبول.
- **إجبار الرأس على كل POST:** بيكسر أي عميل موجود ومش لازم للـ routes الطبيعية التكرار.
- **Redis أو مخزن تاني:** مش في الحزمة، والجدول كفاية للحجم الحالي.

## الاختبارات

- `idempotency.test.ts` (18 وحدة): الـ hash، والرأس الغلط، والنتايج الأربعة، وإرجاع المفتاح عند الخطأ، وفشل التخزين، ورد مبعوت قبل كده.
- `idempotency-keys.integration.test.ts` (16 على `axor_test`): الفائز الواحد، والمحتوى المختلف، وانتهاء الصلاحية، والاستعادة بعد «متروك»، والتنضيف بدفعات.
- `idempotency.integration.test.ts` (18 على الـ routes الحقيقية): تمديد التجربة وإضافة إصدار، والتكرار، والمتزامن، ومستخدم تاني بنفس المفتاح، والمرفوض ما بيحجزش، وانتهاء الـ 24 ساعة.
- تخريب اتجرّب: شيل إرجاع المفتاح عند الخطأ فاختبارات فشلت، وشيل مقارنة الـ hash فاختبارات فشلت، ورجّعتهم. تخريب «الاستعادة بعد متروك» ما أكدتش نتيجته.
- فشل أول مرة: اختبار «الاستعادة بعد متروك» كشف مشكلة التوقيت (قرار 11).

## اللي لسه

- الفرونت ما بيبعتش الرأس. `useSubmit` محتاج يولّد مفتاح لكل عملية ويعيده في إعادة المحاولة.
- التفاعل مع الـ 504 (ADR-0020) مبني على المنطق ومش على اختبار بـ timeout حقيقي: بعد الـ 504 الـ handler بيكمّل، والتكرار بيشوف 409 ثم الرد المخزّن. الكود بيتجنّب لمس رد اتبعت.
- الحد في القرار 9 (نافذة انهيار بين نجاح الكتابة وتخزين الرد).
- مشكلة التوقيت عامة: كل عمود `DEFAULT CURRENT_TIMESTAMP(3)` في الجداول التانية فيه نفس الإزاحة. محتاجة قرار (ضبط `time_zone` للاتصال ولا كتابة التواريخ من التطبيق).
- ما اتقاسش حمل ولا اتفحص الـ query plan لـ `begin`.
- التصميم ما اتراجعش بـ goldfish (EGM مش متثبّت، وما كانش عندي subagents).
```
