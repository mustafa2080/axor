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

Target: `docs/designs/public-pages.md` كله. مفيش ملف تاني.

ملحوظة من المُستدعي: ده تصميم لصفحات عامة جديدة **لسه ما اتنفّذتش**، فراجعه كمواصفة قبل التنفيذ، مع التركيز على: الافتراضات عن النظام الموجود اللي ممكن تكون غلط، وأي نص تسويقي أو قانوني أو وعد بيقول أكتر من اللي النظام بيعمله فعلاً، وحالات الحافة (نظام «قريباً»، كتالوج فاضي، زائر مسجّل)، ووضوح القرارات المفتوحة.

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

الملف: `docs/designs/public-pages.md`

```markdown
# تصميم الصفحات العامة (TASKS.md §5.1)

> **الحالة: مسودة الفيل (Elephant). مش متراجع بـ goldfish.** حزمتا المراجعة (`goldfish-1-public-pages.md` و`goldfish-2-public-pages.md`) جاهزتين، والمدير بيلصقهم في محادثتين جداد فاضيين ويرجّع التقريرين (TASKS.md §22.2، الوضع اليدوي). القرارات المفتوحة في القسم 9 محتاجة رد من المدير قبل أي بناء. **مفيش أي كود اتكتب للصفحات الجديدة** (`systems` و`system` و`trial` و`faq` و`contact` و`terms` و`privacy` ومقارنة الباقات).

## 1. الهدف

الزائر من غير حساب يفهم AXOR، يشوف الأنظمة المتاحة والجاية، يقارن الباقات، يعرف شروط التجربة المجانية قبل التسجيل، ويوصل للتسجيل بأقل خطوات. مفيش اشتراك في نظام «قريباً».

## 2. الموجود دلوقتي (متأكد منه من الكود)

- `#/` الرئيسية (نص ثابت)، `#/plans` الباقات، `#/login`، `#/register`، و404، كلهم جوه `PublicLayout` (navbar + footer، ADR-0023).
- الكتالوج العام بيجي من `loadPublicCatalog()`، و`buildOffers` بيطلّع `offers` (أنظمة متاحة بباقاتها) و`comingSoon`. `OfferCards` بيعرض الاتنين والزرار بييجي من برّه.
- الخادم بيقبل بدء الاشتراك بس لو `products.status = 'available'` (`subscriptions.repository.ts:303`)، فالمنع مفروض من الخادم، والواجهة بس بتخفي الزرار.
- `public-nav.ts` فيه تعليق إن الصفحات غير الموجودة (شروط/خصوصية/تواصل) ما تتحطش في الروابط لحد ما تتبني.

**اللي اتأكد منه على الكود بعد كتابة المسودة (وبيغيّر التصميم):**

- `buildOffers` (`frontend/src/lib/company-offers.ts`) بيطلّع **باقات التجربة بس** (`trialDays > 0`) ويستبعد أي نظام الشركة مشتركة فيه. فجدول المقارنة والأسعار ما ينفعش يتبني على `offers`: لازم يقرا `plansByProduct` من `loadPublicCatalog()` مباشرة، وإلا الباقة من غير تجربة تختفي من المقارنة.
- الكتالوج العام مفيهوش `description` للنظام: `PublicProduct` = `code` و`name` و`status` و`activities[{code,name}]` بس. والباقة `activity: null` معناها «كل الأنشطة».
- الخادم بيستبعد الأنظمة `disabled` والباقات المؤرشفة من الكتالوج العام (`catalog.repository.ts`)، وبيدعم `GET /catalog/products/:code/plans?activity=<code>`، فتصفية الباقات بالنشاط ممكن من الخادم من غير endpoint جديد.
- `OfferCards` (`frontend/src/company/OfferCards.tsx`) بيحط `.card` الباقة جوه `.card` النظام، يعني «بطاقة جوه بطاقة»، وده الشكل الممنوع في قاعدة TASKS.md §21. إعادة استخدامه كما هو في `#/systems` و`#/system` بيكرر المخالفة، فالتصميم الفعلي للكروت (القسم 7) لازم يعالجها بدل ما يورثها، وده مش متفحص بصرياً لسه.
- `#/plans` موجود في مجموعتين في `routes.ts`: `PUBLIC` و`PLATFORM` (صفحة الباقات في لوحة الإدارة). ده مش مشكلة النهارده لأن `Gate` بيعرض الصفحات العامة لـ `anonymous` بس، لكن أي صفحة عامة جديدة (`#/systems` وغيرها) مش هتتعرض لمستخدم مسجّل أصلاً، حتى لو فتح رابط الشروط من داخل لوحته.

## 3. خريطة الصفحات والمسارات

| بند §5.1 | الصفحة | المسار | ملاحظة |
|---|---|---|---|
| 1 | الرئيسية (موجودة، تتقوّى) | `#/` | تضيف قسم «الأنظمة» (3 كروت من الكتالوج) وقسم أسئلة سريعة |
| 2، 8 | الأنظمة | `#/systems` | كروت: متاح / قريباً |
| 3 | تفاصيل نظام + اختيار النشاط | `#/system?code=<code>` | الأنشطة قايمة، اختيار نشاط يفلتر الباقات |
| 4، 5 | الباقات والمقارنة | `#/plans` (موجودة) | فلتر نظام/نشاط + تبديل «كروت / مقارنة» |
| 6 | شروط التجربة المجانية | `#/trial` | المدة من الباقة (الخادم)، والباقي نص ثابت |
| 7 | الأسعار | تتدمج في `#/plans` | بدل صفحة مكررة |
| 7 | الأسئلة الشائعة | `#/faq` | |
| 7 | تواصل | `#/contact` | |
| 7 | الشروط | `#/terms` | |
| 7 | الخصوصية | `#/privacy` | |

`system?code=` بدل `system/<code>` لأن `hashPath` بيشيل الـ query والراوتر الحالي مطابقة تامة على مجموعة ثابتة؛ كده مفيش راوتر جديد. كود نظام مش معروف أو `disabled` = صفحة «النظام ده مش موجود» جوه نفس الـ layout.

## 4. تفاصيل كل صفحة

**الأنظمة `#/systems`:** كارت لكل نظام (الاسم، الأنشطة كـ chips، الحالة). المتاح: زرار «شوف الباقات» → `#/plans?product=<code>`. القريباً: Badge «قريباً» وزرار معطّل بنص «مش متاح الاشتراك لسه» (مش `disabled` بس، فيه سبب مكتوب). الأنظمة `disabled` ما بتظهرش أصلاً.

**تفاصيل النظام:** عنوان + حالة، قايمة الأنشطة، الباقات المناسبة للنشاط المختار (+«كل الأنشطة»). النظام القريباً بيعرض الاسم والأنشطة بس (مفيش وصف في الكتالوج، قرار 5 في القسم 9)، من غير باقات ولا زرار تسجيل.

**الباقات والمقارنة:** نفس `OfferCards` في وضع الكروت (للباقات اللي ليها تجربة). وضع المقارنة بيقرا `plansByProduct` مباشرة (كل الباقات، مش `offers`، راجع القسم 2). وضع المقارنة جدول واحد لكل نظام: الأعمدة = الباقات، الصفوف = السعر، مدة التجربة، كل حد (limit)، كل ميزة (✓/✗/غير محدود). الصفوف اتجمّع من اتحاد المفاتيح في الباقات، والخلية الناقصة بتتعرض «—». على 390px الجدول جوه حاوية `overflow-x: auto` مع العمود الأول sticky، والصفحة نفسها ما تتحركش أفقياً. الجدول من غير tilt ولا أي 3D (قاعدة §21).

**شروط التجربة `#/trial`:** خطوات مرقمة (سجّل ← اختار الباقة ← التجربة بتبدأ ← إيه اللي بيحصل في آخرها). مدة كل باقة جاية من الخادم ومعروضة في جدول صغير. أي حاجة مش متنفذة فعلاً في النظام (دفع، تحويل تلقائي لمدفوع) **ما تتكتبش**، لأن الدفع لسه قرار مفتوح.

**الأسئلة الشائعة:** `<details>` أصلية (من غير JS، accessible، تشتغل مع CSP). الأسئلة تتكتب من السلوك الحقيقي بس.

**تواصل / الشروط / الخصوصية:** هيكل صفحة + عناوين الأقسام، والنص القانوني وبيانات التواصل الحقيقية مني ما تتألفش (القسم 9).

## 5. التنقل

`PUBLIC_NAV` = الرئيسية، الأنظمة، الباقات. الـ footer يزيد عمود «معلومات»: شروط التجربة، أسئلة، تواصل، الشروط، الخصوصية. أي رابط بيتضاف **بعد** ما صفحته تتبني (قاعدة `public-nav.ts`). `isCurrentPublicLink` يتوسّع عشان `#/system?code=` تضيء «الأنظمة».

## 6. الكود (بعد الاعتماد)

- `routes.ts`: ثوابت جديدة + نوع `PublicRoute` يزيد `systems|system|trial|faq|contact|terms|privacy` + `publicRouteOf` + `isKnownPublicHash`، مع اختبارات (بما فيها query وslash زيادة وحالة الحروف).
- `Gate` في `App.tsx`: `switch` بدل السلسلة الشرطية.
- ملفات جديدة تحت `frontend/src/public/`: `SystemsPage`, `SystemPage`, `PlanCompare`, `TrialPage`, `FaqPage`, `ContactPage`, `LegalPage` (مكوّن واحد للشروط والخصوصية بأقسام).
- منطق نقي قابل للاختبار في `lib/`: `compare-plans.ts` (اتحاد الصفوف)، وفلترة الأنشطة. مفيش endpoints جديدة: الكتالوج العام كفاية.

## 7. التصميم (§21)

RTL، خط Cairo المحلي، CSP صارم (من غير inline style/script)، توكنز العمق `--slab-*`/`--inset`، `prefers-reduced-motion` محترم، فاتح/غامق. كروت الأنظمة ممكن تاخد `rotateX` بسيط عند hover (مش الجداول ولا الفورم). مفيش شكل «قالب AI» افتراضي: مفيش تدرجات بنفسجية، ولا 3 كروت متطابقة بأيقونات عامة؛ التمييز بالعمق والحالة (متاح/قريباً) مش بالزخرفة. الـ skills المعتمدة مش منصّبة، هتتطبق يدوياً.

## 8. خطة التحقق قبل علامة ✓ (لكل صفحة)

فاتح وغامق، 390px من غير overflow أفقي، `prefers-reduced-motion: reduce`، RTL، صفر أخطاء CSP في الـ console، لقطة شاشة في اللوج، حالات: تحميل، خطأ + إعادة محاولة، كتالوج فاضي، نظام مش موجود. اختبارات: الراوتر، `compare-plans`، وإن نظام «قريباً» ما بيطلعلهوش زرار تسجيل. وفحص sabotage: لو الزرار ظهر لنظام قريباً الاختبار يقع.

## 9. قرارات مفتوحة (محتاجة ردك)

1. **النطاق (MVP):** كل الصفحات دفعة واحدة، ولا نبدأ بـ `systems` + `system` + مقارنة `plans` + `trial`، ونأجّل faq/contact/terms/privacy؟ (توصيتي: الأول، لأن التاني محتاج نصوص منك.)
2. **الأسعار:** تتدمج في `#/plans` (توصيتي) ولا صفحة `#/pricing` منفصلة؟
3. **النص القانوني (شروط/خصوصية):** مين بيكتبه؟ لحد ما يتحدد أعرض الصفحة بعلامة «مسودة» واضحة، أو ما أبنيهاش.
4. **بيانات التواصل:** إيميل/تليفون/نموذج؟ مفيش مزوّد إيميل متحدد (قرار مفتوح)، فنموذج الإرسال مش ممكن دلوقتي؛ البديل إيميل `mailto:` بعنوان تديهولي.
5. **وصف كل نظام:** الكتالوج فيه الاسم والأنشطة بس. محتاج وصف قصير، حقل جديد في الكتالوج (`description`، مهاجرة DB وAPI) ولا نكتفي بالاسم والأنشطة؟
6. **FAQ:** إيه الأسئلة المسموح بها؟ أنا هكتب بس اللي السلوك الفعلي بيأكده.
7. **الزائر المسجّل:** `Gate` بيعرض الصفحات العامة للزائر (`anonymous`) بس، فمستخدم مسجّل مش هيقدر يفتح الشروط أو الخصوصية من لوحته. نسيبها كده (الصفحات تسويقية للزائر بس)، ولا الشروط والخصوصية بالذات تتعرض للمسجّل كمان؟ ولو اتعرضت، `#/plans` اللي في مجموعة `PLATFORM` (لوحة الإدارة) هيتعارض مع صفحة الباقات العامة لمستخدم المنصة.

## 10. مخاطر

- نصوص تسويقية أو قانونية مخترَعة = وعود مش حقيقية. الحل: ما تتكتبش من غير مصدر.
- جدول المقارنة مع باقات كتير: حد أقصى للأعمدة المعروضة (3-4) والباقي scroll.
- الراوتر بـ query: لو اتغيّر لاحقاً لمسارات حقيقية، `system?code=` لازم يتحدّث (موثق هنا).
```
