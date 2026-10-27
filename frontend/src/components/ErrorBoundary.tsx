import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ErrorPage } from './ErrorPage.tsx'

interface State {
  failed: boolean
}

/**
 * آخر شبكة أمان: لو أي component رمى خطأ أثناء الرسم، بدل الشاشة البيضا بنعرض صفحة 500 بزرار
 * إعادة المحاولة. بنسجّل في الكونسول بس (مفيش خدمة مراقبة أخطاء لسه، TASKS.md §12)، وبنعرض للمستخدم
 * نص ثابت من غير رسالة الخطأ أو الـ stack.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('UI crashed', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="login">
        <div className="login-card">
          <ErrorPage kind="crashed">
            <button type="button" className="btn btn-primary" onClick={() => this.setState({ failed: false })}>
              إعادة المحاولة
            </button>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              تحميل الصفحة من جديد
            </button>
          </ErrorPage>
        </div>
      </main>
    )
  }
}
