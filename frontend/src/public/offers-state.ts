import { loadPublicCatalog } from '../api/company.ts'
import { buildOffers } from '../lib/company-offers.ts'
import type { Offers } from '../lib/company-offers.ts'
import { errorMessage } from '../lib/labels.ts'

// حالة تحميل عروض الكتالوج العام: مشتركة بين الرئيسية وصفحة الباقات.
export type OffersState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Offers }

export async function fetchOffers(): Promise<OffersState> {
  try {
    const catalog = await loadPublicCatalog()
    return { status: 'ready', data: buildOffers(catalog.products, catalog.plansByProduct, new Set()) }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

