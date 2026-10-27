// نصوص صفحات الخطأ. الشكل: إيه اللي حصل + ليه + المستخدم يعمل إيه. من غير مصطلحات تقنية
// ولا تفاصيل داخلية (ولا stack)، لأن اللي بيشوفها عميل مش مطوّر.

export type ErrorPageKind = 'forbidden' | 'not-found' | 'crashed'

export interface ErrorPageCopy {
  code: string
  title: string
  message: string
}

export const errorPageCopy: Record<ErrorPageKind, ErrorPageCopy> = {
  forbidden: {
    code: '403',
    title: 'مش مسموح لك بالدخول هنا',
    message: 'الحساب ده ما عندوش صلاحية للصفحة دي. لو شايف إن ده غلط، كلّم مسؤول حسابك.',
  },
  'not-found': {
    code: '404',
    title: 'الصفحة مش موجودة',
    message: 'الرابط ده غلط أو الصفحة اتنقلت. ارجع للصفحة الرئيسية وكمّل من هناك.',
  },
  crashed: {
    code: '500',
    title: 'حصل خطأ غير متوقع',
    message: 'الصفحة وقفت وماقدرناش نكمّلها. جرّب تعيد المحاولة، ولو المشكلة فضلت حمّل الصفحة من جديد.',
  },
}

export const offlineMessage = 'انقطع الاتصال بالإنترنت. أي تغيير هتعمله مش هيتحفظ لحد ما الاتصال يرجع.'
