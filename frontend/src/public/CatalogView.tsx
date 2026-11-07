import type { ReactNode } from 'react'
import type { PublicPlan, PublicProduct } from '../api/company.ts'
import { ErrorNote, Loading } from '../components/ui.tsx'
import { usePublicCatalog } from './usePublicCatalog.ts'

export interface CatalogData {
  products: PublicProduct[]
  plansByProduct: Record<string, PublicPlan[]>
}

/**
 * بيحمّل الكتالوج العام (من غير دخول) ويعرض حالة التحميل أو الخطأ مع إعادة المحاولة، وبعدين بيسلّم
 * البيانات للصفحة. كل صفحة عامة بتعرض أنظمة أو باقات بتعدّي من هنا عشان الحالات تبقى واحدة.
 */
export function CatalogView({ children }: { children: (data: CatalogData) => ReactNode }) {
  const { state, reload } = usePublicCatalog()
  if (state.status === 'loading') return <Loading />
  if (state.status === 'error') {
    return (
      <>
        <ErrorNote message={state.message} />
        <button type="button" className="btn" onClick={reload}>
          إعادة المحاولة
        </button>
      </>
    )
  }
  return <>{children({ products: state.products, plansByProduct: state.plansByProduct })}</>
}
