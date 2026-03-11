import './App.css';
import { AppProvider, useApp } from './store/AppContext';
import { MenuScreen } from './screens/MenuScreen';
import { GameScreen } from './screens/GameScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ToastNotifications } from './components/ToastNotifications';
import { FpsCounter } from './components/FpsCounter';

function AppContent() {
  const { state } = useApp();

  return (
    <div
      className="app-shell mobile-shell w-full h-full flex flex-col overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="flex-1 overflow-hidden relative">
        {/* --- Mounted game instances ---
            Each game is kept alive in the DOM so its state persists across navigation.
            Only the active game is visible; others are hidden via display:none.
            instanceKey changes on a "fresh start" so React fully remounts the component. */}
        {state.mountedGames.map(({ id, instanceKey }) => (
          <div
            key={`${id}_${instanceKey}`}
            className="absolute inset-0 flex flex-col"
            style={{
              display: id === state.activeGame && state.screen === 'game' ? 'flex' : 'none',
            }}
          >
            <GameScreen gameId={id} />
          </div>
        ))}

        {/* --- Non-game screens --- */}
        {state.screen !== 'game' && (
          <div className="absolute inset-0 flex flex-col screen-enter">
            {state.screen === 'menu'         && <MenuScreen />}
            {state.screen === 'profile'      && <ProfileScreen />}
            {state.screen === 'achievements' && <AchievementsScreen />}
            {state.screen === 'settings'     && <SettingsScreen />}
          </div>
        )}
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
