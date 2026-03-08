'use client';

import { usePathname } from 'next/navigation';
import { DesktopSidebar, MobileNav } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Target } from 'lucide-react';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.startsWith('/sign-in');

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header — visible only below md */}
      <div className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-card px-4 md:hidden">
        <MobileNav />
        <Target className="h-5 w-5 text-primary" />
        <span className="font-semibold">Data Layer</span>
      </div>

      {/* Desktop sidebar — fixed position, hidden on mobile */}
      <DesktopSidebar />

      {/* Main content — offset by sidebar width on desktop */}
      <div className="md:pl-60">
        <Header />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
