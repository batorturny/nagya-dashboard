import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { Nav } from '@/components/layout/Nav';
import { Campaigns } from '@/pages/Campaigns';
import { Compose } from '@/pages/Compose';
import { Dashboard } from '@/pages/Dashboard';

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <Nav />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/compose" element={<Compose />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
