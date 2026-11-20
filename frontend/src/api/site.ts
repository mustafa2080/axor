import { api } from './client.ts'
import type { HomeContent } from '../lib/home-content.ts'

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
