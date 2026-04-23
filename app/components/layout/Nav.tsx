import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Mailbox, PenLine } from 'lucide-react';

import { cn } from '@/lib/utils';
import { WeatherBadge } from '@/components/layout/WeatherBadge';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/compose', label: 'Compose', icon: PenLine },
  { to: '/campaigns', label: 'Campaigns', icon: Mailbox },
] as const;

export function Nav() {
  return (
    <nav className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <span className="font-semibold tracking-tight">nagya.app</span>
          <ul className="flex items-center gap-1">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )
                  }
                >
                  <l.icon className="h-4 w-4" />
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
        <WeatherBadge />
      </div>
    </nav>
  );
}
