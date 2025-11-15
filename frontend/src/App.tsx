// src/App.tsx
import { useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Portfolio } from './pages/Portfolio';
import { OptionChainTable } from './components/OptionChainTable';
import { useAppStore } from './store/useAppStore';
import { Home } from './pages/Home';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
import { Profile } from './pages/Profile';
import { Analytics } from './pages/Analytics';

function App() {
  const activeView = useAppStore((state) => state.activeView);
  const theme = useAppStore((state) => state.theme);

  // Apply theme to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <div
      className={`h-screen grid grid-rows-[auto_1fr] overflow-hidden ${
        theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
      }`}
    >
      {/* Navbar */}
      <Navbar />

      {/* Main Layout: Sidebar + Content */}
      <div className="grid grid-cols-[auto_1fr] overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <main
          className={`${
            theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'
          } overflow-y-auto transition-colors`}
        >
          {/* Content based on active view */}
          {activeView === 'home' && <Home />}
          {activeView === 'dashboard' && <Dashboard />}
          {activeView === 'optionchain' && <OptionChainTable />}
          {activeView === 'analytics' && <Analytics />}
          {activeView === 'portfolio' && <Portfolio />}
          {activeView === 'signin' && <SignIn />}
          {activeView === 'signup' && <SignUp />}
          {activeView === 'profile' && <Profile />}
        </main>
      </div>
    </div>
  );
}

export default App;
