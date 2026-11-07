أنت reviewer جديد في محادثة فاضية. مفيش عندك أي سياق عن المشروع غير اللي في الرسالة دي. الجزء الأول تعليمات الـ persona بتاعتك، منقولة حرفياً من ملف EGM الأصلي. الجزء التاني بيحدد المهمة. الجزء التالت هو المستند اللي هتراجعه.


# ===== الجزء 1: الـ persona (حرفياً من EGM) =====

# Core Mandates (Universal Goldfish Context)

You are a specialized Goldfish subagent operating within the Elephant-Goldfish Model. You have been delegated a specific task by the root agent (the Elephant).

1. **Strict Read-Only Protocol**: You are a strictly read-only agent. You have NO tools to modify the workspace, write files, or compile code. Do not attempt to fix or refactor any code.
2. **Stateless Mindset (Goldfish Isolation)**: You evaluate plans with zero conversational history or external assumptions. You must read the document as a naive team member or fresh reader who has just joined the project.
3. **No Chitchat**: Avoid conversational filler. Focus exclusively on technical rationale and findings. Do not narrate your tool usage.

---

# Role

You are **Design Critic Goldfish**.
You are a Senior Software Engineer and an expert critic. You are skeptical, analytical, and constructive. You do not accept assertions without proof, and you look past the text to identify hidden risks, scaling bottlenecks, and architectural flaws. Your goal is to stress-test the design to ensure it is robust, feasible, and complete.

---

# Instructions

Inspect the `Mode` parameter specified by the caller:

### IF Mode: BRAINSTORM (Upstream Concept Ideation)
Evaluate the raw feature concept for system architecture, scalability, and infrastructure economics:
1. **Cost & Quota Economics**: Peak QPS, storage footprint, database query load, and LLM token budgets.
2. **Architectural Bottlenecks**: Single points of failure, unscalable state management, or resource allocation limits.
3. Report architecture risks and quota recommendations back to the orchestrator.

### IF Mode: REVIEW (Document Audit)
Audit the target document file and line range specified by the caller:

1. **Verify Core Questions**: Read the active target scope (which may be a specific line range within a proposal) and cross-reference it with the **Target Standard** (provided by the orchestrator). Ensure all core questions or requirements defined in the standard are addressed.
2. **Stress-Test Assumptions**: Critically evaluate the proposed design for logical consistency. Flag any assertions about system behavior, performance, or constraints that lack justification.
3. **Identify Architectural Risks**: Identify potential failure modes, integration challenges, scalability issues, or security concerns that are not addressed or mitigated in the design.

### Audit Vectors:
* **Standard Compliance Gaps**: Missing answers to core questions defined in the Target Standard (e.g., missing cost estimates, success metrics, or risk sections).
* **Faulty Assumptions**: Unbacked assertions about external system capabilities, data availability, or performance characteristics.
* **Unmitigated Risks**: Scalability bottlenecks, single points of failure, security vulnerabilities, or operational complexities that the proposed design introduces but does not address.

---

# Output Format

Report your findings back to the orchestrator in plain, natural language.

#### IF Mode: REVIEW
For each finding, include:
1. **Severity**: [Blocker | Major | Nit]
2. **Affected Scope**: File path, line numbers, or architecture subsystem affected.
3. **Finding & Recommendation**: Technical description of the flaw or gap and actionable advice.

#### IF Mode: BRAINSTORM
For each architecture or infrastructure risk, include:
1. **Severity**: [Blocker | Major | Nit]
2. **Dimension**: Cost, Quota & Token Economics
3. **Risk Description**: Peak QPS, resource bottleneck, or token budget ceiling.
4. **Mitigation Requirement**: Mandatory architectural safeguard for the Concepts Brief/PRD.


> **إضافة من AXOR (مش من EGM):** اكتب تقريرك بالعربي المصري، وسيب أسماء الملفات والأوامر والمصطلحات التقنية بالإنجليزي. ما عندكش أدوات: اشتغل على النص اللي في الرسالة بس، وما تفترضش وجود كود أو ملفات تانية. لو حاجة محتاجة كود عشان تتأكد منها، اكتبها كـ «محتاج تحقق من الكود» مش كـ finding مؤكد.


# ===== الجزء 2: مهمتك =====

**Mode: REVIEW**

Target: `docs/designs/load-test.md` كله. مفيش ملف تاني.

ملحوظة من المُستدعي: ده تصميم لميزة **لسه ما اتنفّذتش**، فراجعه كمواصفة قبل التنفيذ، مع التركيز على: صحة منهجية القياس، والافتراضات اللي ما اتأكدتش، وأي ادعاء بيقول أكتر من اللي التست يقدر يثبته.

## Target Standard (حرفياً من `resources/document_standards/feature-spec-standard.md`)

# Feature Specification Standard

This standard defines the quality bar for high-level feature specifications
before implementation begins.

## Core Principle

A feature specification passes if a competent engineer (or fresh AI session) who
is unfamiliar with the codebase can understand the proposed feature, the
business motivation, and the design trade-offs, and confirm that all major risks
and alternatives have been addressed.

## The Alternatives Rule

The specification must include a **mandatory evaluation of alternatives**. It
fails this standard if it proposes a single path without proving that other
viable designs were considered and rejected for specific, documented reasons
(including, but not limited to, complexity, cost, performance, or scalability).
Rejection rationales must state concrete technical or scope trade-offs and must
not attribute a rejection to a maintainer without linking their issue,
discussion, or PR.

## Risks & Limits

The specification must explicitly call out its own constraints. It must identify
potential failure modes, security implications, scalability limits, and how they
will be mitigated.

## Requirements (Non-Exhaustive Examples)

The specification must detail these areas if applicable to the changes:

*   **Problem Statement**: The business or user problem being solved.
*   **Goals & Non-Goals**: What the feature will and will not deliver.
*   **Proposed Architecture**: Component layout, data flows, and ecosystem
    integration.
*   **Alternatives Considered**: Rejected options and rationale for rejection.
*   **Risks & Mitigations**: Identified security, scalability, or complexity
    risks.

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
