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

Target: `docs/designs/public-pages.md` كله. مفيش ملف تاني: المستند مكتفي بنفسه، وأي حاجة بيشاور عليها وما اتعرّفتش جواه سجّلها كـ finding.

ملحوظة من المُستدعي: ده تصميم لصفحات عامة جديدة **لسه ما اتنفّذتش** (مفيش كود للصفحات الجديدة، والمستند بيوصف كمان صفحات موجودة)، فراجعه كمواصفة قبل التنفيذ.

ابدأ بالـ paraphrase تحت العنوانين المطلوبين، وبعدين الـ findings.

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
