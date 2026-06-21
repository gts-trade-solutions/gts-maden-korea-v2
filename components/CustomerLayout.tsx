import { Header } from './Header';
import { Footer } from './Footer';
import { EmailVerificationBanner } from './EmailVerificationBanner';

export function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    // overflow-x-clip prevents page-wide horizontal scroll when any
    // descendant (a long brand name, a wide native select, an absolute
    // overlay, etc.) tries to push past the viewport. `clip` is
    // preferred over `hidden` because it does not break sticky/fixed
    // positioning of children.
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <EmailVerificationBanner />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
