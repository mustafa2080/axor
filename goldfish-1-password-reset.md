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

Target: `docs/designs/password-reset-email-verification.md` كله. مفيش ملف تاني: المستند مكتفي بنفسه، وأي حاجة بيشاور عليها وما اتعرّفتش جواه سجّلها كـ finding.

ملحوظة من المُستدعي: ده تصميم لميزة **لسه ما اتنفّذتش** (مفيش كود)، فراجعه كمواصفة قبل التنفيذ.

ابدأ بالـ paraphrase تحت العنوانين المطلوبين، وبعدين الـ findings.

# ===== الجزء 3: المستند المستهدف =====

الملف: `docs/designs/password-reset-email-verification.md`

```markdown
# تصميم: استعادة كلمة المرور والتحقق من البريد

> **حالة المراجعة: مسودة من غير مراجعة goldfish.** الكاتب هو الـ Elephant (الـ agent اللي معاه سياق المشروع). حزمتا المراجعة (`goldfish-1-password-reset.md` و`goldfish-2-password-reset.md`) جاهزتين، والمدير بيلصقهم في محادثتين جداد فاضيين ويرجّع التقريرين (TASKS.md §22.2، الوضع اليدوي). **مفيش أي كود اتكتب لهذا التصميم.**
>
> ملاحظة منهجية: اللي في قسم 3 اتقرا من الكود وقت الكتابة (`auth.routes.ts` و`auth.service.ts` و`refresh-token.ts` و`login-throttle.ts` و`schema/users.ts` و`schema/enums.ts` و`server.ts`) ومن ADR-0004. كل الأرقام في قسم 4 (المدد والحدود) **اختيارات مني مش قرارات معتمدة**. اللي مكتوب «محتاج تحقق من الكود» ما اتفحصش.
>
> التصنيف في TASKS.md §22.2: **محتاج تصميم** (بيمس الأمان والجلسات وبيعتمد على قرارات منتج مفتوحة).

## 1. المشكلة

1. **مفيش طريقة لاستعادة حساب نسي صاحبه كلمة السر.** الدخول الوحيد بكلمة السر، ومسارات `/auth` الموجودة هي: `register` و`login` و`refresh` و`logout` و`change-password` (بيحتاج كلمة السر الحالية) و`me`. مفيش مسار استعادة، يعني صاحب شركة ينسى كلمة السر يتقفل حسابه لحد تدخل يدوي.
2. **التسجيل بيرد 409 صريح لو البريد متسجل**، وده بيسمح بمعرفة مين عنده حساب. الكود نفسه مكتوب فيه إن الحل الكامل هو التحقق من البريد (ADR-0004 §10)، وthreat-model بيسجّله كفجوة معروفة.
3. **العمود `users.email_verified_at` موجود في الـ schema** لكن مفيش مسار بيأكّد ملكية البريد. فحصت استخدامه في `backend/src`: بيتقرا بس في `members.repository.ts` و`tenant-users.repository.ts` (قوائم الأعضاء)، **ومفيش أي كود بيكتب فيه**.
4. **مفيش بنية لإرسال بريد أصلاً** في الباك: ما لقيتش `nodemailer` ولا SMTP ولا أي mailer. واختيار مزود البريد قرار مفتوح عندك في TASKS.md.
5. **المستخدم المدعو** (`status = 'invited'` و`password_hash` فاضي حسب تعليق الـ schema) محتاج مسار يحط بيه أول كلمة سر. الدعوات نفسها لسه مش مبنية (TASKS.md §4.2 Tenants)، فالتصميم ده بيسيب لها مكان بس.

## 2. الأهداف وغير الأهداف

**الأهداف**
1. طلب استعادة بالبريد **من غير ما الرد يكشف** إن البريد مسجل ولا لأ.
2. رمز **للاستخدام مرة واحدة** وعمره قصير، ومخزّن في قاعدة البيانات كـ hash بس (زي الـ refresh token).
3. بعد الاستعادة: **كل الجلسات القديمة تتقفل** بنفس آلية `change-password` الموجودة (ADR-0004 §14)، ورمز الاستعادة المستخدم ما يتكررش.
4. تأكيد ملكية البريد بنفس نوع الرمز، وكتابة `email_verified_at`.
5. **تشغيل التصميم محلياً من غير مزود بريد حقيقي:** واجهة `Mailer` وتنفيذ للتطوير بس. وفي الإنتاج الميزة **مقفولة** لحد ما يتحدد المزود (قسم 4.4).
6. تسجيل أحداث التدقيق من غير أي رمز أو رابط في السجلات.

**غير الأهداف**
- مش بنختار مزود البريد ولا الاستضافة ولا الـ domain ولا إعدادات SPF وDKIM (قرارات تشغيل).
- مش بنكتب نص الرسائل النهائي (محتوى، قرار منتج) ولا الترجمة.
- مش بنبني الدعوات (بس الجدول والمسار صالحين يتوسّعوا ليها، قسم 4.1).
- مش بنضيف MFA ولا دخول بالرابط السحري.
- مش بنقرر هل الدخول يتطلب بريد متحقق (قسم 7، سؤال 2). التصميم بيكتب العلامة بس.
- مش بنغيّر رحلة التسجيل ولا رد الـ 409 (قسم 4.6 وسؤال 3).
- **تغيير البريد غير موجود أصلاً:** `PATCH /auth/me` بيعدّل `fullName` بس (`updateProfileBody` strict)، وفحصت كل ملفات `*.routes.ts` في الباك: مفيش غير `auth.routes.ts` بيذكر `email` في body، يعني مفيش endpoint بيغيّر بريد مستخدم (حتى الإدارة). لو اتضاف تغيير بريد بعدين، التحقق بيتكرر للبريد الجديد.

## 3. النظام الحالي (من الكود)

- **الجلسات:** access token قصير (`ACCESS_TOKEN_TTL_SECONDS` الافتراضي 900) وrefresh token في cookie `HttpOnly`، `SameSite=Strict`، على المسار `/api/v1/auth`. الـ refresh token = 32 بايت عشوائي base64url (43 حرف) والمخزّن SHA-256 بتاعه بس (`refresh-token.ts`)، وأي شكل غير ده بيترفض من غير hash ولا استعلام.
- **تغيير كلمة السر:** في transaction واحدة: بيكتب الـ hash الجديد و`password_changed_at` وبيعلّم كل `refresh_sessions` للمستخدم `revokedAt`. و`authenticate` بيرفض أي access token صدر قبل `password_changed_at` (اتأكدت في جلسة سابقة من التست `signs out every other device`).
- **سياسة كلمة السر:** `checkPasswordPolicy(password, { email })` وهي اللي بتتطبّق على التسجيل وتغيير كلمة السر، والتجزئة Argon2id مع NFKC (ADR-0004 §1).
- **الحدود:** `@fastify/rate-limit` على كل `/auth/*` بحد 30 طلب في الدقيقة لكل IP، وعدّاد فشل في الذاكرة (`login-throttle.ts`: 5 محاولات لكل IP+بريد، وحد تاني للبريد لوحده) **في ذاكرة process واحد**، ومكتوب في ADR-0004 §6 إنه صح لـ instance واحد بس.
- **CSRF:** كل POST في `auth.routes.ts` بيستدعي `requireTrustedOrigin` (لازم `Origin` = `WEB_ORIGIN`).
- **التدقيق:** `recordAudit` في `auth.service.ts` بيكتب حدث ولا بيرمي خطأ أبداً (جدول `audit_logs` من غير FKs)، وفي الدخول الفاشل بيتكتب من غير انتظار.
- **الحالات:** `userStatuses = active | invited | disabled`، و`mayAuthenticate` بيشترط `status = 'active'` والشركة `active` (أو مستخدم منصة).
- **المهام المجدولة:** `startExpiryJob` من `subscriptions/expiry-job.ts` بيتستخدم لتنضيف الجلسات (كل ساعة) وidempotency keys، موصّلين في `server.ts`.
- **الوقت:** فيه خطأ معروف في أعمدة `DEFAULT CURRENT_TIMESTAMP(3)` (إزاحة توقيت MariaDB محلي مقابل UTC، TASKS.md §10). التطبيق بيحسب الـ timestamps بنفسه (`now()` في `changePassword`).

## 4. التصميم المقترح

### 4.1 جدول جديد `auth_tokens` (migration `0007`)

| العمود | النوع | ملاحظة |
|---|---|---|
| `id` | uuid v7 | زي باقي الجداول |
| `user_id` | uuid | مرجع لـ `users` |
| `purpose` | `password_reset` أو `email_verify` | عمود `purpose` بيخلّي الجدول يخدم الدعوات بعدين (`invite`) من غير جدول تاني |
| `token_hash` | char(64) | SHA-256 hex، **UNIQUE**. الرمز نفسه عمره ما بيتخزّن |
| `email` | varchar(320) | البريد وقت الإصدار. في `email_verify` بيتأكد إنه لسه هو بريد المستخدم وقت التأكيد |
| `expires_at` | datetime | **بيحسبه التطبيق** (`now() + TTL`)، مش `DEFAULT CURRENT_TIMESTAMP` بسبب خطأ الإزاحة (قسم 3) |
| `used_at` | datetime null | لما يتستهلك أو يتلغى |
| `created_at` | datetime | |

- **الرمز:** نفس نمط الـ refresh token في `refresh-token.ts` (التوليد بـ `randomBytes(32).toString('base64url')`، 43 حرف)، والتحقق من الشكل بـ regex قبل أي hash أو استعلام. 256 بت عشوائية، فمفيش حاجة اسمها تخمين ومفيش حاجة تحتاج عدّاد محاولات على الرمز نفسه.
- **الاستخدام مرة واحدة (ذرّي):** `UPDATE auth_tokens SET used_at = :now WHERE token_hash = :h AND purpose = :p AND used_at IS NULL AND expires_at > :now`، والنجاح = `affectedRows = 1`. أي حالة تانية (مش موجود، مستخدم، منتهي، purpose غلط) ترجع **نفس الخطأ**. ده بيمنع استخدام نفس الرمز مرتين حتى لو جه طلبين متزامنين.
- **رمز حي واحد لكل (مستخدم، purpose):** إصدار رمز جديد في نفس الـ transaction بيعلّم القديم `used_at`. فالرابط الأخير هو الوحيد الشغّال.
- **المدد المقترحة (اختياري مني):** `password_reset` = 30 دقيقة، و`email_verify` = 24 ساعة. ثوابت في الكود زي `SESSION_PURGE_INTERVAL_MS`، مش متغيرات بيئة.
- **التنضيف:** مهمة بنفس `startExpiryJob` بتحذف الصفوف المنتهية أو المستخدمة بعد فترة سماح قصيرة (للتدقيق)، بدفعات زي `session-purge.ts`. **محتاج تحقق من الكود:** شكل `purgeExpiredSessions` عشان يتكرر نفس النمط.
- **الـ migration:** بنفس الإجراء اللي اتعمل في `0005` و`0006`: `pnpm db:lock` لقفل الـ checksum، وADR جديد.

### 4.2 مسارات الاستعادة

**`POST /auth/password-reset/request`** body: `{ email }` (strict، نفس تنظيف الـ email في `loginBody`).
- **دايماً `202`** بنفس الجسم، سواء البريد موجود أو لأ.
- لو المستخدم موجود وبيستوفي شرط `mayAuthenticate` (نشط وشركته نشطة) **وعنده `password_hash`**: بيتصدر رمز جديد (4.1) وبيتبعت له رابط. غير كده: ما بيتبعتش حاجة.
- **الإرسال بعد الـ commit ومش مستني** (fire-and-forget)، فزمن الرد ما بيعتمدش على بطء مزود البريد. فشل الإرسال بيتسجّل في الـ log بنوعه من غير الرمز ولا الرابط، والرد للعميل مش بيتغيّر.
- **الحد:** بالإضافة لحد الـ IP العام (30/دقيقة)، عدّاد للطلبات (مش للفشل) لكل بريد، **3 طلبات في الساعة** وفترة انتظار 60 ثانية بين طلب والتاني، ولكل IP **10 في الساعة**. لما يتعدّى الحد: نفس الـ `202` من غير إرسال (مش 429)، عشان الـ 429 ما يكشفش البريد. الأرقام اختياري مني.
- التدقيق: `auth.password_reset_requested` **للمستخدمين الموجودين بس** (userId وtenantId). البريد غير المسجل بيتسجّل في الـ request log كـ `knownAccount: false` زي الدخول الفاشل.

**`POST /auth/password-reset/confirm`** body: `{ token, newPassword }` (strict، حدود الحجم زي `changePasswordBody`).
- الشكل الأول: لو الرمز مش 43 حرف base64url يرجع الخطأ العام فوراً.
- في **transaction واحدة** (مع `retryOnDeadlock` زي `changePassword`): استهلاك الرمز بالـ UPDATE الذرّي، ثم تحميل المستخدم والتأكد إنه لسه `mayAuthenticate`، ثم فحص `checkPasswordPolicy(newPassword, { email })`، ثم كتابة `password_hash` و`password_changed_at`، وتعليم كل `refresh_sessions` المفتوحة `revokedAt`، وتعليم أي رموز `auth_tokens` حية تانية للمستخدم.
  - **الترتيب مهم:** لو سياسة كلمة السر رفضت الباسورد الجديد، الـ transaction بترجع **من غير ما تحرق الرمز**، والمستخدم يقدر يجرب تاني بنفس الرابط. ده سؤال تصميم مفتوح للمراجعة (هل استمرار صلاحية الرمز بعد رفض الباسورد آمن؟ أنا شايفه آمن لأن الرمز نفسه ما اتكشفش).
- **ما بيعملش دخول تلقائي:** بيرجع `204` والمستخدم يسجّل دخول بكلمة السر الجديدة. السبب: رمز البريد ما يبقاش مفتاح جلسة.
- الأخطاء: رمز مش صالح (مش موجود/مستخدم/منتهي/purpose غلط) = `400` بكود واحد `INVALID_OR_EXPIRED_TOKEN`. سياسة كلمة السر = `400 VALIDATION_ERROR` بنفس شكل `changePassword`.
- الحد: نفس حد الـ IP العام + عدّاد فشل لكل IP (زي `login-throttle`) للرموز الغلط.
- التدقيق: `auth.password_reset_completed` (من غير الرمز).

**تعديل على كود موجود:** `changePassword` لازم يعلّم رموز `password_reset` الحية للمستخدم (لو غيّر الباسورد وفي رابط استعادة قديم لسه صالح، المفروض يتبطل).

### 4.3 مسارات التحقق من البريد

**`POST /auth/email-verification/request`** (مسجّل دخول، `authenticate` + `requireTrustedOrigin`): بيصدر رمز `email_verify` للبريد الحالي وبيبعته. لو `email_verified_at` مش فاضي: `204` من غير إرسال. حد: 3 في الساعة لكل مستخدم.

**`POST /auth/email-verification/confirm`** body: `{ token }`، **من غير تسجيل دخول** (الرابط ممكن يتفتح من جهاز أو متصفح تاني، والرمز نفسه هو التفويض). بيستهلك الرمز ذرياً ويتأكد إن `auth_tokens.email` = `users.email` الحالي وإلا الخطأ العام، وبيكتب `email_verified_at = now()` لو كان فاضي. التدقيق: `auth.email_verified`.

**القرار المفتوح:** هل الدخول أو الوصول لميزات معيّنة يشترط `email_verified_at`؟ التصميم **ما بيفرضش حاجة**. كل الحسابات الحالية `email_verified_at` فاضي عندها، فأي شرط لازم يجي مع سياسة لحسابات موجودة (سؤال 2).

### 4.4 الـ Mailer وقفل الميزة

- واجهة صغيرة `Mailer { send(message): Promise<void> }` تتحقن في `AuthService` زي `audit`. رسالة = `{ to, template, link }`، والنص النهائي بره التصميم ده.
- تنفيذ واحد بس دلوقتي: `ConsoleMailer` للتطوير والتست، بيكتب الرابط في الـ log **لما `NODE_ENV` مش production**. في الإنتاج التنفيذ ده بيرفض يتحمّل.
- **علم `AUTH_EMAIL_ENABLED`** (الافتراضي `false`): لما يكون `false` المسارات الأربعة **ما بتتسجّلش** (404). الهدف إننا ما نطلّعش نسخة بتقول للمستخدم «اتبعتلك بريد» وهو مفيش مزود. التفعيل في الإنتاج بيشترط إعدادات مزود صالحة (بنفس فكرة ADR-0016/0017 اللي بترفض إعدادات إنتاج ضعيفة).
- **الروابط بتتبني من `WEB_ORIGIN` من الإعدادات بس**، أبداً من `Host` أو `X-Forwarded-Host` أو أي header في الطلب (host header injection).

### 4.5 الواجهة (frontend، توصيف فقط)

- صفحتين عامتين جوه `PublicLayout`: «نسيت كلمة السر» (حقل بريد، رسالة ثابتة بعد الإرسال) و«كلمة سر جديدة» (حقلين وتأكيد). وصفحة نتيجة تأكيد البريد. رابط «نسيت كلمة السر؟» في صفحة الدخول. كلها RTL ومن غير inline style ولا مكتبة (ADR-0014 وADR-0021).
- **الرمز في الـ fragment مش في الـ path ولا الـ query بتاع الخادم:** الرابط شكله `{WEB_ORIGIN}/#/reset-password?token=<token>`. كل اللي بعد `#` ما بيتبعتش للخادم ولا بيظهر في access logs. الراوتر الحالي (`frontend/src/lib/routes.ts`) بيقارن المسار بمجموعات ثابتة بعد ما يشيل `?query` (`hashPath`، زي `#/register?plan=x`)، فالمسارين الجداد (`#/forgot-password` و`#/reset-password`) بيتضافوا لمجموعة `PUBLIC` من غير segment ديناميكي، والرمز بيتقرا من الـ query بعد `#`. أول ما الصفحة تتحمّل بتقرا الرمز وتشيله من العنوان بـ `history.replaceState`، وبتبعته في body الـ POST. و`Referrer-Policy: no-referrer` مضبوطة فعلاً في `app.ts` (مغطاة باختبار في `app.test.ts`) لكن دي على ردود الـ API، **محتاج تحقق** إنها كمان على صفحة الـ HTML المخدومة.
- فتح الرابط (GET) **ما بيغيّر حالة**. التغيير بيحصل بـ POST صريح، عشان ماسحات البريد اللي بتفتح الروابط تلقائياً ما تحرقش الرمز.

### 4.6 اللي ما بنغيّره (وليه)

رد التسجيل 409 هيفضل زي ما هو. إصلاحه (رد موحد + رسالة بريد «لو ما سجّلتش اعتبر الرسالة غلط») بيغيّر رحلة التسجيل نفسها ويشترط بريد شغّال، وده قرار منتج (سؤال 3). التصميم ده بيوفّر الأساس بس.

### 4.7 الاختبارات المخططة (مش مكتوبة)

وحدة: شكل الرمز والـ hash، والـ throttles. تكامل على `axor_test`:
1. بريد موجود وغير موجود ← نفس الـ status ونفس الجسم.
2. الرمز مرة واحدة: طلبين confirm متزامنين، واحد بس بينجح.
3. منتهي / مستخدم / purpose غلط / رمز مصدر لمستخدم تاني ← نفس الخطأ.
4. بعد الاستعادة: الـ refresh القديم والـ access القديم مرفوضين، والدخول بالقديم 401 وبالجديد ينجح.
5. إصدار رمز جديد بيبطّل القديم، و`changePassword` بيبطّل رموز الاستعادة الحية.
6. مستخدم `disabled` أو `invited` أو شركته `suspended` ← ما بيتبعتلوش.
7. رفض الباسورد بالسياسة ما بيحرقش الرمز.
8. مفيش رمز ولا رابط في سجلات الـ audit ولا الـ request log (فحص على المخرجات).
9. علم `AUTH_EMAIL_ENABLED=false` ← 404 للمسارات الأربعة.
10. تخريب متعمد: شيل شرط `used_at IS NULL` وتأكد إن اختبار الاستخدام المتزامن بيفشل (زي ما اتعمل في جلسات تانية).
11. `expires_at` بيتكتب من ساعة التطبيق: اختبار بيثبت إن رمز `password_reset` عمره 30 دقيقة بالظبط في الـ UTC مهما كان توقيت MariaDB.

## 5. بدائل اتدرست

| البديل | سبب عدم الاختيار الآن |
|---|---|
| **رمز موقّع من غير جدول** (JWT أو HMAC فيه `userId` و`exp`) | أبسط (من غير migration)، لكن **الاستخدام مرة واحدة مش ممكن من غير حالة مخزّنة**: نفس الرابط يفضل شغال لحد انتهاء المدة ومفيش طريقة لإبطال رابط قديم لما يتصدر جديد. ممكن تربطه ببصمة من `password_hash` فيتبطل بعد التغيير، لكن لسه ما بيتبطلش لما المستخدم يطلب رابط تاني. الجدول أبسط في الإثبات والاختبار. |
| **كود رقمي 6 خانات** بدل الرابط | أسهل على الموبايل ومفيش رابط يتسرّب، لكن 10^6 احتمال محتاجة عدّاد محاولات لكل رمز ومحتاجة التزامن مع الـ throttles اللي في الذاكرة (instance واحد بس). الرمز 256 بت مبيحتاجش عدّاد أصلاً. ممكن يتضاف بعدين لو الاستخدام على الموبايل بيستاهل. |
| **دخول تلقائي بعد الاستعادة** | أحسن تجربة، لكن بيحوّل رمز بريد لمفتاح جلسة كاملة، ولازم يتأكد إنه ما بيتجاوزش أي شرط بيتفرض على الدخول العادي (شركة موقوفة، حالة المستخدم، وأي MFA مستقبلاً). مرفوض في النسخة الأولى. |
| **الإرسال داخل الطلب ومستني** | بيخلّي زمن الرد مختلف بين بريد موجود وغير موجود (إرسال فعلي مقابل لا شيء)، وده بيكشف الحساب بالتوقيت، وبيربط زمن الرد بمزود خارجي. |
| **جدول outbox وjob للإرسال والإعادة** | أمتن (إعادة المحاولة، ومفيش فقد لو الـ process وقع بين الـ commit والإرسال)، لكنه جدول ومهمة تانيين وبيزود تعقيد قبل ما يكون عندنا مزود. المخاطرة المقبولة دلوقتي: لو الإرسال فشل المستخدم يطلب تاني (حد الـ 60 ثانية). بنراجعه لما المزود يتحدد (سؤال 1). |
| **الرمز في الـ query string** | بيتسجّل في access logs وفي `Referer` وفي ماسحات الروابط. الـ fragment بيتفادى ده كله. |
| **تفويض الاستعادة لمزود هوية خارجي** (SaaS) | بيشيل الكود ده، لكنه قرار مورّد وتكلفة وبيانات مستخدمين بره، وبيغيّر ADR-0004 بالكامل. خارج النطاق. |
| **أسئلة أمان للاستعادة** | أضعف من البريد وبتتخمّن، ومفيش سبب لإضافتها. |

## 6. المخاطر والقيود

1. **اختراق صندوق البريد = اختراق الحساب.** ده جوهر أي استعادة بالبريد ومش مشكلة بتتحل هنا. التخفيف: مدة قصيرة، رمز واحد حي، استخدام مرة واحدة، وإلغاء كل الجلسات بعد الاستعادة، وسجل تدقيق. تنبيه المستخدم برسالة «كلمة السر اتغيّرت» مفيدة لكنها بتروح لنفس الصندوق (محتاج قرار، ملحق في سؤال 4).
2. **تسريب البريد المسجل بالتوقيت أو الرد.** الرد موحد والإرسال مش مستني، لكن المسار الموجود بيعمل استعلام DB وغير الموجود لا. الفرق صغير لكن **مش مقاس**، ومحتاج اختبار توقيت بتسامح مكتوب (مش هيثبت المساواة، هيثبت عدم وجود فرق كبير).
3. **الـ 409 في التسجيل لسه بيكشف الحسابات** (قسم 4.6). التصميم ده ما بيصلحهوش.
4. **إغراق صندوق ضحية برسائل (mail bombing).** حد لكل بريد (3/ساعة وانتظار 60 ثانية) وحد لكل IP. **لكن العدّادات في ذاكرة instance واحد** (ADR-0004 §6): بتتصفّر مع كل restart، ومش بتتشارك لو اتشغّل أكتر من instance. لازم تتنقل لمخزن مشترك قبل أي نشر متعدد الـ instances.
5. **تسريب الرمز:** الـ fragment بدل الـ query بتاع الخادم، وإزالته من العنوان، وPOST للتأكيد، وعدم وضعه في أي log. `Referrer-Policy: no-referrer` مضبوطة على ردود الـ API (`app.ts`)، **ومحتاج تحقق** إنها كمان على صفحة الـ HTML اللي بتفتح الرابط (4.5).
6. **Host header injection في بناء الرابط:** مغطاة بـ `WEB_ORIGIN` من الإعدادات (4.4).
7. **حسابات المنصة (`platformRole`)** أخطر من حسابات الشركات. لو استخدمت نفس المسار، اختراق البريد بيدّي صلاحيات إدارة كاملة. سؤال 5.
8. **المستخدم `invited`** (من غير `password_hash`): التصميم ما بيبعتلوش (4.2). لما الدعوات تتبني لازم تتحدد قواعد مسار «تعيين أول كلمة سر».
9. **تفعيل التحقق على حسابات موجودة:** كل الحسابات الحالية غير متحقق منها. أي شرط على `email_verified_at` لازم يجي مع خطة (تحقق إجباري عند الدخول الجاي؟ مهلة؟).
10. **الإزاحة الزمنية في MariaDB:** لو حد استخدم `DEFAULT CURRENT_TIMESTAMP` لـ `expires_at` بالغلط، الرمز ممكن يبان منتهي أو يعيش أطول. لذلك بيحسبه التطبيق، ومخطط له اختبار (قسم 4.7، بند 11).
11. **نمو الجدول:** تنضيف بمهمة (4.1). المعدل المتوقع صغير لكن غير مقاس.
12. **بريد الجهاز المحلي:** `ConsoleMailer` بيطبع روابط حية في الـ log في التطوير، ومفيش حاجة تمنع حد يشغّله بـ `NODE_ENV=development` على سيرفر حقيقي. حارس الإنتاج بيمنع `production` بس.
13. **المراجعة المستقلة:** ده تصميم لسه ما اتراجعش. مفيش حاجة هنا مثبتة بتجربة.

## 7. أسئلة للمدير

1. **مزود البريد:** تحب تحدد دلوقتي (SMTP عادي، ولا خدمة)؟ لحد القرار التنفيذ بيكون `ConsoleMailer` والميزة مقفولة في الإنتاج. وهل نبني outbox مع المزود ولا نكتفي بالإرسال المباشر؟
2. **التحقق من البريد:** هل الدخول (أو ميزة معيّنة زي بدء تجربة) يشترط بريد متحقق؟ وإيه المصير للحسابات الحالية؟
3. **التسجيل:** نغيّر الـ 409 لرد موحد (بيشترط رسالة بريد وتغيير في رحلة التسجيل) ولا نسيبه؟
4. **المدد والحدود:** 30 دقيقة للاستعادة و24 ساعة للتحقق و3 طلبات في الساعة، مناسبين؟ ونبعت رسالة «كلمة السر اتغيّرت» بعد الاستعادة؟
5. **حسابات المنصة:** تستخدم نفس المسار، ولا تتقفل الاستعادة عليها (وتتغيّر بتدخل يدوي) لحد ما يبقى فيه MFA؟
6. **المدعوين (`invited`):** نفس الجدول يخدم «تعيين أول كلمة سر» لما الدعوات تتبني؟ (التصميم جاهز لده بـ `purpose`.)

```
