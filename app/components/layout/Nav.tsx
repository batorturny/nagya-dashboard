import { NavLink } from 'react-router-dom';

import { WeatherBadge } from '@/components/layout/WeatherBadge';
import aldiLogo from '@/assets/aldi-it-logo.png';

const links = [
  { to: '/', label: 'Termékek' },
  { to: '/compose', label: 'Hírlevél összeállítása' },
  { to: '/campaigns', label: 'Korábbi kampányok' },
] as const;

export function Nav() {
  return (
    <nav className="sticky top-0 z-20">
      {/* ALDI blue top bar */}
      <div className="bg-[#003865] text-white">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={aldiLogo} alt="ALDI" className="h-9 w-9 rounded object-cover" />
            <div>
              <div className="text-[10px] uppercase tracking-widest text-white/60 font-medium leading-none">
                ALDI International IT Services
              </div>
              <div className="text-sm font-bold leading-tight">
                Promóciós hírlevél
              </div>
            </div>
          </div>
          <WeatherBadge />
        </div>
      </div>

      {/* Orange accent */}
      <div className="h-[3px] bg-[#E2450C]" />

      {/* Nav links */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 flex items-center gap-0">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ' +
                (isActive
                  ? 'border-[#E2450C] text-[#003865]'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300')
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
