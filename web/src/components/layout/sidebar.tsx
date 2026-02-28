'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { VisuallyHidden } from 'radix-ui';
import {
  LayoutDashboard,
  Users,
  Target,
  Crosshair,
  UserCircle,
  List,
  Zap,
  Activity,
  Settings,
  Radio,
  DollarSign,
  Menu,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Users },
  { href: '/icps', label: 'ICPs', icon: Crosshair },
  { href: '/personas', label: 'Personas', icon: UserCircle },
  { href: '/lists', label: 'Lists', icon: List },
  { href: '/signals', label: 'Signals', icon: Radio },
  { href: '/enrichment', label: 'Enrichment', icon: Zap },
  { href: '/jobs', label: 'Jobs', icon: Activity },
  { href: '/costs', label: 'Costs', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function NavLink({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function SidebarContent({ onLinkClick }: { onLinkClick?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="flex h-14 items-center border-b px-4">
        <Target className="mr-2 h-5 w-5 text-primary" />
        <span className="text-lg font-semibold">Data Layer</span>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.href}
              item={item}
              isActive={isActive}
              onClick={onLinkClick}
            />
          );
        })}
      </nav>

      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">GTM Data Infrastructure</p>
      </div>
    </>
  );
}

export function DesktopSidebar() {
  return (
    <aside className="hidden md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex md:w-60 md:flex-col border-r bg-card">
      <SidebarContent />
    </aside>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0" showCloseButton={false}>
        <VisuallyHidden.Root>
          <SheetTitle>Navigation Menu</SheetTitle>
        </VisuallyHidden.Root>
        <SidebarContent onLinkClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
