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

Target: `docs/designs/load-test.md` كله. مفيش ملف تاني: المستند مكتفي بنفسه، وأي حاجة بيشاور عليها وما اتعرّفتش جواه سجّلها كـ finding.

ملحوظة من المُستدعي: ده تصميم لميزة **لسه ما اتنفّذتش** (مفيش كود)، فراجعه كمواصفة قبل التنفيذ.

ابدأ بالـ paraphrase تحت العنوانين المطلوبين، وبعدين الـ findings.

# ===== الجزء 3: المستند المستهدف =====

الملف: `docs/designs/load-test.md`

```markdown
# تصميم: Load test محلي لقيم الـ pool والـ timeout

> **حالة المراجعة: مسودة من غير مراجعة goldfish.** الكاتب هو الـ Elephant (الـ agent اللي معاه سياق المشروع). حزمتا المراجعة (`goldfish-1-load-test.md` و`goldfish-2-load-test.md`) جاهزتين، والمدير بيلصقهم في محادثتين جداد فاضيين ويرجّع التقريرين (TASKS.md §22.2، الوضع اليدوي). **مفيش أي كود اتكتب لهذا التصميم.**
>
> ملاحظة منهجية: كل رقم «افتراضي» في المستند ده نقلته من `backend/src/config/env.ts` و`.env.example` و`backend/src/database/client.ts`. اللي مكتوب «محتاج تحقق من الكود» ما اتفحصش وأنا بكتب.

## 1. المشكلة

AXOR عنده قيم تشغيل اتحطت بالتخمين، ومكتوب في TASKS.md وADR-0019 وADR-0020 إنها «محتاجة load test»:

| الإعداد | الافتراضي | معناه |
|---|---|---|
| `DB_POOL_SIZE` | 10 | أقصى عدد اتصالات مفتوحة بقاعدة البيانات من الـ process |
| `DB_POOL_QUEUE_LIMIT` | 100 | أقصى عدد طلبات واقفة تستنى اتصال حر، وبعده بترفض فوراً |
| `DB_STATEMENT_TIMEOUT_MS` | 15000 | أقصى زمن لاستعلام واحد، وبعده بيتقتل فعلاً والعميل بياخد 503 آمن للإعادة |
| `REQUEST_HANDLER_TIMEOUT_MS` | 30000 | أقصى زمن لتنفيذ الطلب كله، وبعده 504 (الـ handler نفسه بيكمّل ومش بيتلغي، ADR-0020) |

وكمان بنود في TASKS.md §10 («أهداف أداء قابلة للقياس» و«قياس بخط أساس قبل التحسين») لسه مفتوحة. النتيجة: مفيش رقم واحد عن سلوك الخادم تحت ضغط، فمش عارفين لو الـ pool بيتشبّع عند كام طلب متزامن، ولا لو الـ 30 ثانية صح ولا بتخبّي مشكلة.

## 2. الأهداف وغير الأهداف

**الأهداف**
1. خط أساس مقاس لزمن الاستجابة ومعدل الأخطاء لكل سيناريو على جهاز التطوير، بخطوات تزايد في التزامن.
2. تحديد نقطة التشبّع: عند أي تزامن بيبدأ الـ pool يطلّع 503 (طابور ممتلئ) أو بيطلع زمن الانتظار.
3. فحص سلوك الأخطاء تحت الضغط: إن الرد 503/504/429 بالشكل الموثّق، ومفيش تسريب تفاصيل داخلية، ومفيش crash.
4. نتيجة قابلة للإعادة: نفس الأمر بيطلّع تقرير بنفس الشكل.

**غير الأهداف**
- **مش بنثبت قدرة تحمّل الإنتاج.** جهاز التطوير (عليه كمان `httpd` شغال، حسب جلسة سابقة) مش بيمثّل الاستضافة، والأرقام المحلية مقارنة مش سعة.
- مش بنختار أهداف أداء نهائية: ده قرار المدير بناءً على عدد المستخدمين المتوقع (غير معروف دلوقتي).
- مش بنختبر الواجهة (frontend) ولا STARK ولا البريد ولا الدفع (مش موجودين).
- مش بنغيّر أي قيمة افتراضية في الكود من نتيجة التست ده. التغيير قرار منفصل بـ ADR.

## 3. النظام الحالي (من الكود، محتاج تحقق باقي التفاصيل)

- الـ pool في `database/client.ts`: `connectionLimit` و`queueLimit` من الإعدادات، و`waitForConnections: true`، و`connectTimeout: 5000`.
- `limits.integration.test.ts` بيجرّب الطابور بـ `poolSize: 1` و`queueLimit: 1` (سلوك الرفض، مش الحمل).
- مسارات عامة بتقرا من قاعدة البيانات من غير تسجيل دخول: `GET /api/v1/catalog/products` و`GET /api/v1/catalog/products/:productCode/plans`. ومسار من غير قاعدة بيانات: `GET /api/v1/health`، ومعاه `GET /api/v1/health/ready` اللي بيفحص قاعدة البيانات.
- التسجيل والدخول بيحسبوا Argon2id (`@node-rs/argon2`) يعني ثقيلين على الـ CPU، والتسجيل محدود بـ 5 محاولات لكل IP في الساعة (ADR-0004 §10).
- مسارات الإدارة عليها `@fastify/rate-limit` بحد `max: 120` (الفترة والمفتاح **محتاج تحقق من الكود**).
- **محتاج تحقق من الكود:** هل حدود الـ rate limit قابلة للضبط من البيئة، ولا لازم تتعطّل أو يتغيّر مفتاحها في التست. ده بيحدد لو سيناريوهات الدخول والإدارة ممكن تتقاس أصلاً (تفاصيل في قسم 6).

## 4. التصميم المقترح

### 4.1 البيئة

- **قاعدة منفصلة `axor_load`** على نفس MariaDB المحلي، بمستخدم `axor_app` الحالي (محتاج `GRANT` لها، قرار المدير لأنه بيعدّل صلاحيات). مش `axor_dev` ولا `axor_test`، عشان التست ما يلمسش بيانات التطوير ولا يتصادم مع اختبارات التكامل.
- بيانات **اصطناعية فقط**: كتالوج صغير من الـ seed الحالي، وعدد من الشركات والاشتراكات المولّدة بأسماء وهمية. ممنوع نسخ بيانات من `axor_dev`.
- الخادم بيتشغّل بالبناء المنشور (`pnpm build` ثم `pnpm --filter backend start`) و`NODE_ENV=production`، على `127.0.0.1`، مش بـ `tsx watch`، عشان القياس يمثّل الكود الفعلي.
- مولّد الحمل على **نفس الجهاز** (مفيش بديل محلي)، وده بياخد CPU من الخادم، فبنسجّل عدد الأنوية واستهلاك الـ CPU وقت التست كقيد مكتوب في التقرير.

### 4.2 الأداة

الاقتراح: سكربت Node واحد `scripts/loadtest.mjs` بيستخدم `fetch` المدمج من غير أي dependency جديدة، على نمط باقي سكربتات `scripts/` (secret-scan وغيره). بيشغّل **N عميل متزامن** كل واحد بيبعت الطلب اللي بعده بعد ما اللي قبله يرد (closed-loop)، ويقيس زمن كل طلب بـ `performance.now()` ويجمّع النتايج.

القيد الصريح: closed-loop بيقلّل الأزمنة المقاسة تحت التشبّع (لما الخادم يبطّأ، العملاء بيبعتوا أقل). ده اسمه coordinated omission. التست هنا هدفه تحديد نقطة التشبّع وسلوك الأخطاء، مش قياس p99 دقيق لحمل ثابت، والتقرير بيكتب ده.

### 4.3 السيناريوهات

| # | الطلب | بيختبر إيه | ملاحظة |
|---|---|---|---|
| S1 | `GET /health` | خط أساس من غير DB: تكلفة Fastify والشبكة المحلية | أي فرق بين S1 وS2 هو تكلفة الاستعلام |
| S2 | `GET /catalog/products` | قراءة بسيطة بتاخد اتصال من الـ pool | الأقرب لاختبار الـ pool |
| S3 | `GET /catalog/products/:productCode/plans` | قراءة أثقل (join على الباقات والإصدارات) | `productCode` من الـ seed |
| S4 | `GET /health/ready` | فحص قاعدة البيانات بس | بيبيّن لو الـ readiness بيتأثر تحت الضغط |

سيناريوهات الدخول والتسجيل ومسارات الإدارة **مش في النطاق الأول**، لأنها بتصطدم بـ rate limit وبـ Argon2 (قسم 6، سؤال 3). إضافتها بند منفصل بعد القرار.

### 4.4 الإجراء

لكل سيناريو، خطوات تزامن: 1 و5 و10 و25 و50 و100 عميل، كل خطوة 30 ثانية، وقبلها 5 ثواني إحماء بتتهمل. الأرقام دي اختياري مني (10 هو حجم الـ pool الافتراضي، و100 هو حد الطابور) ومفتوحة للتعديل في المراجعة.

اللي بيتسجّل لكل خطوة: عدد الطلبات والـ RPS الفعلي، و p50 وp95 وp99 والأقصى، وتوزيع الـ status codes (200 و429 و503 و504 وأي حاجة تانية وأخطاء الاتصال)، واستهلاك CPU والذاكرة للخادم (من `process.cpuUsage` و`memoryUsage` عبر مراقبة خارجية للـ PID، **طريقة القياس محتاجة تفصيل**).

### 4.5 تجارب الإعدادات

بعد خط الأساس بالقيم الافتراضية، تجربتين صغيرتين على S2 بس:
1. `DB_POOL_SIZE` = 5 و10 و20، لمقارنة زمن الانتظار ونقطة التشبّع.
2. `DB_POOL_QUEUE_LIMIT` = 10 و100، لرؤية نقطة بدء الـ 503.

**حد صريح:** `DB_STATEMENT_TIMEOUT_MS` و`REQUEST_HANDLER_TIMEOUT_MS` **ما بيتقاسوش بالتصميم ده**: مفيش في المسارات العامة استعلام بطيء بيوصل لـ 15 أو 30 ثانية، فالتست مش هيقدر يثبت إن القيمتين صح. اللي بيقدر يقوله: إن زمن الاستجابة الطبيعي بعيد قد إيه عنهم. اختبار بطء مقصود (استعلام بيعمل `SLEEP` مثلاً) محتاج endpoint أو hook للتست بس، وده تغيير في كود الإنتاج، مؤجل لحد قرار.

### 4.6 المخرجات

- `scripts/loadtest.mjs` (لو القرار على الأداة في 4.2) وتعليمات التشغيل.
- تقرير واحد `docs/performance/load-test-<التاريخ>.md` بأرقام الخطوات والقيود (جهاز، أنوية، قاعدة بيانات، النسخة، commit) وأي ملاحظة غير متوقعة. الأرقام الخام مش بتتعمل لها commit، التقرير بس.
- سطر في سجل التقدم بالنتيجة والمحدودية.
- مفيش `[x]` على بند «load test» في TASKS.md §10 غير لما يتعمل تشغيل فعلي وتتسجّل النتيجة، ومفيش ادعاء إن القيم «صح» من تست محلي لوحده.

## 5. بدائل اتدرست

| البديل | سبب عدم الاختيار الآن |
|---|---|
| **autocannon** (أداة Node جاهزة) | بتدّي histograms وقياس أنضج، لكنها dependency جديدة في سلسلة التوريد (TASKS.md §21.2 بيعامل ده كقرار منفصل) ومش لازم لأربع سيناريوهات GET بسيطة. بديل قوي لو المراجعة شافت إن السكربت اليدوي مش كفاية. |
| **k6** | مناسب للأحمال المعقدة والـ open-loop، لكنه binary خارجي مش في الحزمة ومحتاج تثبيت على جهاز المدير. كبير على الغرض الحالي. |
| **التست على staging** | الأنسب للأرقام الحقيقية، لكن مفيش staging لسه (TASKS.md §13). مؤجل لحد وجود بيئة. |
| **التست على `axor_dev`** | أسهل، لكنه بيلوّث بيانات التطوير ويضيف صفوف حقيقية. مرفوض. |
| **open-loop بمعدل ثابت** | أدق (بيتفادى coordinated omission)، لكنه أصعب في الكتابة اليدوية ومحتاج ضبط معدل لكل سيناريو. ممكن مرحلة تانية. |

## 6. المخاطر والقيود

1. **أرقام محلية مضللة:** مولّد الحمل والخادم وMariaDB (وhttpd) على جهاز واحد بيتنافسوا على CPU. التقرير بيذكر الجهاز، والأرقام بتُقرا كمقارنة بين إعدادات مش كسعة.
2. **coordinated omission** (قسم 4.2): بيخبّي جزء من الأزمنة تحت التشبّع.
3. **الـ rate limit بيحجب سيناريوهات الإدارة والتسجيل** (120 لكل فترة و5 في الساعة للتسجيل): التست عليهم يا إما يقيس الـ 429 مش الأداء، يا إما محتاج تعطيل الحد في بيئة التست. تعطيل حد أمني، حتى محلياً، قرار صريح ومحتاج حارس إنه ما يوصلش للإنتاج (الـ env بيرفض في الإنتاج زي `REQUEST_HANDLER_TIMEOUT_MS`، **لو اتعمل**).
4. **إساءة استخدام الأداة:** سكربت بيبعت آلاف الطلبات لو اتوجّه لعنوان خارجي هيبقى هجوم DoS. التصميم بيقصر الأداة على `127.0.0.1`/`localhost` وبيرفض أي host تاني من غير flag صريح، وده شرط في الكود لما يتكتب.
5. **قاعدة `axor_load` بتحتاج `GRANT`:** تعديل صلاحيات MariaDB بيعمله المدير (مفيش كلمة سر هنا، ولا بتتبعت في المحادثة).
6. **جدول `idempotency_keys` وجداول التنضيف:** لو الخادم شغّل الـ jobs (التنضيف كل ساعة) وقت التست، ممكن تتحسب في الأرقام. بنسجّل ده أو بنعطّلها لو فيه flag (**محتاج تحقق من الكود**).
7. **خطر على بيانات حقيقية معدوم بالتصميم** لأن القاعدة اصطناعية، بس التسجيل في logs الخادم بيحتاج مراجعة إنه ما بيطبعش بيانات اصطناعية بشكل يملّى السجل: بنخلّي مستوى الـ log مناسب وقت التست.

## 7. أسئلة للمدير

1. **الأداة:** سكربت Node بدون dependencies (الاقتراح) ولا autocannon؟
2. **الأهداف:** عندك تقدير لعدد المستخدمين أو الطلبات المتوقعة في أول 6 شهور؟ من غيره الأهداف بتتكتب بعد خط الأساس.
3. **حد الـ rate limit:** نعطّله في بيئة التست عشان نقيس الدخول والإدارة (محتاج تعديل كود + حارس)، ولا نكتفي بالمسارات العامة دلوقتي؟
4. **قاعدة `axor_load`:** توافق تعمل `CREATE DATABASE` و`GRANT` لـ `axor_app` عليها؟
5. **اختبار البطء المقصود** لـ `DB_STATEMENT_TIMEOUT_MS` و`REQUEST_HANDLER_TIMEOUT_MS`: يستاهل hook للتست بس في كود الإنتاج، ولا نكتفي بإن القيمتين مش مقاستين؟
```
