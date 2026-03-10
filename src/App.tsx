import './App.css';
import { AppProvider, useApp } from './store/AppContext';
import { MenuScreen } from './screens/MenuScreen';
import { GameScreen } from './screens/GameScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ToastNotifications } from './components/ToastNotifications';
import { FpsCounter } from './components/FpsCounter';

import { useEffect } from 'react';

function AppContent() {
  const { state, navigate } = useApp();

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        navigate('menu');
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [navigate]);

  return (
    <div className="app-shell mobile-shell w-full h-full flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <div className="flex-1 overflow-hidden relative screen-enter" key={`${state.screen}_${state.activeGame ?? ''}`}>
        {state.screen === 'menu' && <MenuScreen />}
        {state.screen === 'game' && <GameScreen />}
        {state.screen === 'profile' && <ProfileScreen />}
        {state.screen === 'achievements' && <AchievementsScreen />}
        {state.screen === 'settings' && <SettingsScreen />}
      </div>
      <ToastNotifications />
      <FpsCounter />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
