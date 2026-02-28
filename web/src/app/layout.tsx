import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { DesktopSidebar, MobileNav } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Target } from 'lucide-react';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Data Layer',
  description: 'GTM Data Infrastructure',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
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
        </Providers>
      </body>
    </html>
  );
}
