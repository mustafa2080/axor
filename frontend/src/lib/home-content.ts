// المحتوى القابل للتعديل للصفحة الرئيسية (ADR-0027). نفس الشكل والحدود اللي الخادم بيتحقق منها في
// backend/src/modules/site/home-content.ts: الخادم هو المرجع، والنسخة دي بس عشان الشاشة تقول للمدير
// المشكلة قبل ما يضغط حفظ، وعشان الصفحة العامة ما تعرضش حاجة غريبة لو الشكل المخزّن اتغيّر.
// من غير React هنا عشان csp.ts وvite.config.ts يستوردوا القائمة دي.

/** الأماكن الوحيدة اللي المتصفح بيحمّل منها صور. نفس قائمة الخادم وقائمة CSP (`csp.test.ts` بيقارنهم). */
export const IMAGE_HOSTS = ['images.unsplash.com', 'images.pexels.com'] as const

export function isAllowedImageUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    (IMAGE_HOSTS as readonly string[]).includes(url.hostname) &&
    url.username === '' &&
    url.password === '' &&
    url.port === ''
  )
}

export const POINT_ICONS = ['building', 'shield', 'box', 'layers', 'repeat'] as const
export type PointIcon = (typeof POINT_ICONS)[number]

export const pointIconLabel: Record<PointIcon, string> = {
  building: 'مبنى',
  shield: 'درع',
  box: 'صندوق',
  layers: 'طبقات',
  repeat: 'تكرار',
}

export interface SceneImage {
  url: string
  alt: string
}
export interface GalleryItem extends SceneImage {
  caption: string
}
export interface Step {
  title: string
  text: string
}
export interface Point extends Step {
  icon: PointIcon
}

export interface HomeContent {
  hero: { title: string; lead: string; primaryLabel: string; secondaryLabel: string }
  scene: { enabled: boolean; images: SceneImage[] }
  steps: { title: string; items: Step[] }
  points: { title: string; items: Point[] }
  gallery: { title: string; items: GalleryItem[] }
  final: { title: string; button: string }
}

// حدود الأطوال والأعداد (نفس حدود الخادم).
export const MAX = {
  sceneImages: 3,
  galleryItems: 4,
  steps: 6,
  points: 6,
  url: 500,
  alt: 150,
  caption: 100,
  heroTitle: 120,
  heroLead: 400,
  button: 40,
  heading: 80,
  itemTitle: 60,
  itemText: 200,
} as const

const photo = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`

/** المحتوى الافتراضي: بيظهر لحد ما حد يحفظ تعديل، وبيرجع لو المدير ضغط «رجّع الافتراضي». */
export const DEFAULT_HOME: HomeContent = {
  hero: {
    title: 'منصة واحدة لإدارة أنظمة شركتك',
    lead: 'سجّل شركتك مرة واحدة، واختار الأنظمة والباقات اللي تناسبك، وابدأ بتجربة مجانية.',
    primaryLabel: 'شوف الباقات',
    secondaryLabel: 'عندي حساب',
  },
  scene: {
    enabled: true,
    images: [
      { url: photo('photo-1553413077-190dd305871c'), alt: 'ممر مخزن كبير برفوف عالية' },
      { url: photo('photo-1494412574643-ff11b0a5c1c3'), alt: 'ميناء حاويات من فوق' },
      { url: photo('photo-1601584115197-04ecc0da31d7'), alt: 'شاحنة نقل على الطريق' },
    ],
  },
  steps: {
    title: 'إزاي تبدأ',
    items: [
      { title: 'اختار النظام', text: 'شوف الأنظمة المتاحة واختار اللي يناسب نشاطك.' },
      { title: 'قارن الباقات', text: 'كل باقة بمميزاتها وحدودها واضحة قبل ما تسجّل.' },
      { title: 'ابدأ تجربة مجانية', text: 'سجّل شركتك وابدأ التجربة، والمدة والحالة بيحددهم الخادم.' },
    ],
  },
  points: {
    title: 'ليه AXOR',
    items: [
      { icon: 'building', title: 'حساب لكل شركة', text: 'الشركة بتدير أعضاءها واشتراكاتها من لوحة واحدة.' },
      { icon: 'shield', title: 'بيانات معزولة', text: 'بيانات كل شركة مفصولة عن باقي الشركات على مستوى التطبيق.' },
      { icon: 'box', title: 'منصة واحدة', text: 'أنظمة متعددة تحت حساب واحد، من غير ما تسجّل من الأول كل مرة.' },
    ],
  },
  gallery: {
    title: 'من عالم الشحن والمخازن',
    items: [
      { url: photo('photo-1586528116311-ad8dd3c8310d'), alt: 'مخزن مليان طرود على رفوف', caption: 'المخازن' },
      { url: photo('photo-1578575437130-527eed3abbec'), alt: 'رافعات ميناء وسفينة حاويات', caption: 'الموانئ والشحن' },
      { url: photo('photo-1519003722824-194d4455a60c'), alt: 'شاحنة على طريق جبلي', caption: 'النقل والتوصيل' },
      { url: photo('photo-1460925895917-afdab827c52f'), alt: 'لابتوب بيعرض لوحة أرقام', caption: 'المتابعة والتقارير' },
    ],
  },
  final: { title: 'جاهز تبدأ؟', button: 'اختار الباقة وابدأ' },
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max
const isList = (value: unknown, min: number, max: number): value is unknown[] =>
  Array.isArray(value) && value.length >= min && value.length <= max
const isImage = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.url === 'string' &&
  isAllowedImageUrl(value.url) &&
  isText(value.alt, MAX.alt)

/**
 * بيرجّع المحتوى لو شكله سليم، وإلا الافتراضي. الخادم بيتحقق قبل التخزين، فده خط دفاع تاني بس:
 * الصفحة العامة ما بتتكسرش ولا بتحمّل صورة من مكان غير مسموح مهما كان اللي جاي.
 */
export function readHomeContent(value: unknown): HomeContent {
  if (!isRecord(value)) return DEFAULT_HOME
  const { hero, scene, steps, points, gallery, final } = value
  const ok =
    isRecord(hero) &&
    isText(hero.title, MAX.heroTitle) &&
    isText(hero.lead, MAX.heroLead) &&
    isText(hero.primaryLabel, MAX.button) &&
    isText(hero.secondaryLabel, MAX.button) &&
    isRecord(scene) &&
    typeof scene.enabled === 'boolean' &&
    isList(scene.images, 0, MAX.sceneImages) &&
    scene.images.every(isImage) &&
    isRecord(steps) &&
    isText(steps.title, MAX.heading) &&
    isList(steps.items, 1, MAX.steps) &&
    steps.items.every((s) => isRecord(s) && isText(s.title, MAX.itemTitle) && isText(s.text, MAX.itemText)) &&
    isRecord(points) &&
    isText(points.title, MAX.heading) &&
    isList(points.items, 1, MAX.points) &&
    points.items.every(
      (p) =>
        isRecord(p) &&
        (POINT_ICONS as readonly unknown[]).includes(p.icon) &&
        isText(p.title, MAX.itemTitle) &&
        isText(p.text, MAX.itemText),
    ) &&
    isRecord(gallery) &&
    isText(gallery.title, MAX.heading) &&
    isList(gallery.items, 0, MAX.galleryItems) &&
    gallery.items.every((g) => isImage(g) && isText((g as Record<string, unknown>).caption, MAX.caption)) &&
    isRecord(final) &&
    isText(final.title, MAX.heading) &&
    isText(final.button, MAX.button)
  return ok ? (value as unknown as HomeContent) : DEFAULT_HOME
}

const hasControl = (text: string): boolean => [...text].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)

function textProblem(label: string, value: string, max: number): string | null {
  const text = value.trim()
  if (text === '') return `${label}: لازم تكتب حاجة.`
  if (text.length > max) return `${label}: أقصى طول ${max} حرف.`
  if (hasControl(text)) return `${label}: ممنوع أسطر جديدة أو رموز تحكم.`
  return null
}

function imageProblem(label: string, url: string, alt: string): string | null {
  const trimmed = url.trim()
  if (trimmed === '') return `${label}: اكتب رابط الصورة.`
  if (trimmed.length > MAX.url) return `${label}: الرابط أطول من ${MAX.url} حرف.`
  if (!isAllowedImageUrl(trimmed)) {
    return `${label}: الرابط لازم يكون https ومن ${IMAGE_HOSTS.join(' أو ')} بس.`
  }
  return textProblem(`${label} (الوصف)`, alt, MAX.alt)
}

/** أول مشكلة في المحتوى بالعربي، أو null لو سليم. بيتنده قبل الحفظ؛ الخادم بيعيد نفس الفحص. */
export function homeContentProblem(c: HomeContent): string | null {
  const checks: Array<string | null> = [
    textProblem('عنوان الواجهة', c.hero.title, MAX.heroTitle),
    textProblem('الوصف تحت العنوان', c.hero.lead, MAX.heroLead),
    textProblem('زر الباقات', c.hero.primaryLabel, MAX.button),
    textProblem('زر الدخول', c.hero.secondaryLabel, MAX.button),
    ...c.scene.images.map((image, i) => imageProblem(`صورة المجسم ${i + 1}`, image.url, image.alt)),
    textProblem('عنوان قسم الخطوات', c.steps.title, MAX.heading),
    ...c.steps.items.flatMap((s, i) => [
      textProblem(`خطوة ${i + 1} (العنوان)`, s.title, MAX.itemTitle),
      textProblem(`خطوة ${i + 1} (الشرح)`, s.text, MAX.itemText),
    ]),
    textProblem('عنوان قسم المميزات', c.points.title, MAX.heading),
    ...c.points.items.flatMap((p, i) => [
      textProblem(`ميزة ${i + 1} (العنوان)`, p.title, MAX.itemTitle),
      textProblem(`ميزة ${i + 1} (الشرح)`, p.text, MAX.itemText),
    ]),
    textProblem('عنوان معرض الصور', c.gallery.title, MAX.heading),
    ...c.gallery.items.flatMap((g, i) => [
      imageProblem(`صورة المعرض ${i + 1}`, g.url, g.alt),
      textProblem(`صورة المعرض ${i + 1} (التعليق)`, g.caption, MAX.caption),
    ]),
    textProblem('عنوان الدعوة الأخيرة', c.final.title, MAX.heading),
    textProblem('زر الدعوة الأخيرة', c.final.button, MAX.button),
  ]
  return checks.find((problem) => problem !== null) ?? null
}

/** نسخة منظّفة جاهزة للإرسال (المسافات الزايدة اتشالت). */
export function trimHomeContent(c: HomeContent): HomeContent {
  const t = (s: string) => s.trim()
  return {
    hero: { title: t(c.hero.title), lead: t(c.hero.lead), primaryLabel: t(c.hero.primaryLabel), secondaryLabel: t(c.hero.secondaryLabel) },
    scene: { enabled: c.scene.enabled, images: c.scene.images.map((i) => ({ url: t(i.url), alt: t(i.alt) })) },
    steps: { title: t(c.steps.title), items: c.steps.items.map((s) => ({ title: t(s.title), text: t(s.text) })) },
    points: { title: t(c.points.title), items: c.points.items.map((p) => ({ icon: p.icon, title: t(p.title), text: t(p.text) })) },
    gallery: {
      title: t(c.gallery.title),
      items: c.gallery.items.map((g) => ({ url: t(g.url), alt: t(g.alt), caption: t(g.caption) })),
    },
    final: { title: t(c.final.title), button: t(c.final.button) },
  }
}
