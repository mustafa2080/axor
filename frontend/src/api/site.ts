import { api } from './client.ts'
import type { HomeContent } from '../lib/home-content.ts'
import type { PageContents, PageKey } from '../lib/page-content.ts'

// GET /site/home (عام) وGET/PUT /admin/site/home (موظفو المنصة): backend/src/modules/site و
// backend/src/modules/admin/site-admin.routes.ts. `content: null` = ما اتحفظش حاجة، يعني الافتراضي.
// المحتوى بييجي كـ unknown عن قصد: الصفحة بتمرّره على `readHomeContent` قبل ما تعرضه.

export interface HomeSetting {
  content: unknown
  /** 0 لو ما اتحفظش حاجة قبل كده. بيتبعت تاني مع الحفظ عشان مفيش اتنين يكتبوا فوق بعض. */
  version: number
}

export const getPublicHome = () => api<HomeSetting>('GET', '/site/home')

export const getAdminHome = () => api<HomeSetting>('GET', '/admin/site/home')

/** `content: null` بيرجّع المحتوى الافتراضي. 409 `CONTENT_CHANGED` لو حد حفظ بعد ما الصفحة اتفتحت. */
export const saveAdminHome = (expectedVersion: number, content: HomeContent | null) =>
  api<HomeSetting>('PUT', '/admin/site/home', { expectedVersion, content })

// صفحات المعلومات الأربع (ADR-0028): نفس الشكل. `content: null` = ما اتنشرتش. PUT بـ null بيلغي النشر.
export const getPublicPage = (key: PageKey) => api<HomeSetting>('GET', `/site/pages/${key}`)

export const getAdminPage = (key: PageKey) => api<HomeSetting>('GET', `/admin/site/pages/${key}`)

export const saveAdminPage = (key: PageKey, expectedVersion: number, content: PageContents[PageKey] | null) =>
  api<HomeSetting>('PUT', `/admin/site/pages/${key}`, { expectedVersion, content })
