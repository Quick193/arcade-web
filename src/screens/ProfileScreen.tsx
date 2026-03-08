import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { GAMES } from '../store/gameRegistry';

const AVATAR_COLORS = ['#5c86ff', '#26c6da', '#66bb6a', '#ffa726', '#f06292', '#ab47bc', '#ffee58', '#ef5350'];

export function ProfileScreen() {
  const { state, navigate, updateProfile, addProfile, switchProfile, deleteProfile, activeProfile, resetStats, resetAchievements } = useApp();
  const [view, setView] = useState<'profiles' | 'detail'>('profiles');
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(activeProfile.name);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(AVATAR_COLORS[0]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const profile = activeProfile;

  const totalWins = Object.values(profile.stats).reduce((s, g) => s + g.gamesWon, 0);
  const totalGames = profile.globalStats.totalGames;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  const playtime = profile.globalStats.globalPlaytime;
  const playtimeStr = playtime < 60
    ? `${Math.floor(playtime)}s`
    : playtime < 3600
    ? `${Math.floor(playtime / 60)}m`
    : `${Math.floor(playtime / 3600)}h ${Math.floor((playtime % 3600) / 60)}m`;

  const favGame = Object.entries(profile.stats)
    .sort(([, a], [, b]) => b.gamesPlayed - a.gamesPlayed)[0];
  const favGameMeta = favGame ? GAMES.find(g => g.id === favGame[0]) : null;
  const favorites = activeProfile.favoriteGameIds
    .map((id) => GAMES.find((game) => game.id === id))
    .filter((game): game is (typeof GAMES)[number] => Boolean(game))
    .slice(0, 4);
  const recentGames = [...GAMES]
    .filter((game) => (profile.stats[game.id]?.gamesPlayed ?? 0) > 0)
    .sort((a, b) => getLastPlayedAt(profile.stats[b.id]) - getLastPlayedAt(profile.stats[a.id]))
    .slice(0, 4);

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) updateProfile({ name: trimmed });
    setEditing(false);
  };

  const handleCreateProfile = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    addProfile(trimmed, newColor);
    setCreatingNew(false);
    setNewName('');
    setNewColor(AVATAR_COLORS[0]);
  };

  const handleDelete = (id: string) => {
    if (state.profiles.length <= 1) return;
    deleteProfile(id);
    setConfirmDelete(null);
  };

  // Profiles list view
  if (view === 'profiles') {
    return (
      <div className="flex flex-col h-full screen-enter" style={{ background: 'var(--bg-primary)' }}>
        {/* Header */}
        <div className="pt-safe px-4 py-3 flex items-center gap-3 flex-shrink-0"
          style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}>
          <button onClick={() => navigate('menu')} className="pressable text-xl">←</button>
          <h1 className="text-lg font-bold flex-1" style={{ color: 'var(--text-primary)' }}>Profiles</h1>
          <button
            onClick={() => setView('detail')}
            className="text-xs px-3 py-1.5 rounded-lg pressable font-semibold"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            My Stats
          </button>
        </div>

        <div className="flex-1 scrollable px-4 py-4 flex flex-col gap-3">
          {/* Profiles list */}
          {state.profiles.map(p => (
            <div key={p.id}
              className="card p-4 flex items-center gap-3"
              style={{ border: p.id === state.activeProfileId ? '2px solid var(--accent-blue)' : '1px solid var(--card-border)' }}
            >
              {/* Avatar */}
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
                style={{ background: p.avatarColor + '33', border: `2px solid ${p.avatarColor}` }}
              >
                {p.name[0]?.toUpperCase() ?? '?'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                  {p.id === state.activeProfileId && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{ background: 'var(--accent-blue)', color: '#fff' }}>ACTIVE</span>
                  )}
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {p.globalStats.totalGames} games · {p.unlockedAchievements.length} achievements
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-shrink-0">
                {p.id !== state.activeProfileId && (
                  <button
                    onClick={() => switchProfile(p.id)}
                    className="text-xs px-3 py-1.5 rounded-lg pressable font-semibold"
                    style={{ background: 'var(--accent-green)', color: '#fff' }}
                  >
                    Switch
                  </button>
                )}
                {state.profiles.length > 1 && (
                  confirmDelete === p.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-xs px-2 py-1 rounded pressable font-bold"
                        style={{ background: '#ef5350', color: '#fff' }}
                      >✓</button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs px-2 py-1 rounded pressable"
                        style={{ background: 'var(--card-bg)', color: 'var(--text-muted)' }}
                      >✗</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(p.id)}
                      className="text-xs px-2 py-1 rounded pressable"
                      style={{ background: 'var(--card-bg)', color: '#ef5350', border: '1px solid #ef535044' }}
                    >🗑️</button>
                  )
                )}
              </div>
            </div>
          ))}

          {/* Create new profile */}
          {creatingNew ? (
            <div className="card p-4 flex flex-col gap-3">
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>New Profile</div>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value.slice(0, 24))}
                onKeyDown={e => e.key === 'Enter' && handleCreateProfile()}
                placeholder="Enter name..."
                className="px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent-blue)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className="w-7 h-7 rounded-full pressable transition-transform"
                    style={{
                      background: color,
                      transform: newColor === color ? 'scale(1.3)' : 'scale(1)',
                      boxShadow: newColor === color ? `0 0 8px ${color}` : 'none',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateProfile}
                  className="flex-1 py-2 rounded-lg font-bold pressable text-sm"
                  style={{ background: 'var(--accent-blue)', color: '#fff' }}
                >Create</button>
                <button
                  onClick={() => { setCreatingNew(false); setNewName(''); }}
                  className="flex-1 py-2 rounded-lg font-bold pressable text-sm"
                  style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreatingNew(true)}
              className="card p-4 flex items-center justify-center gap-2 pressable"
              style={{ border: '2px dashed var(--card-border)' }}
            >
              <span className="text-xl">➕</span>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Add New Profile</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Detail / stats view for active profile
  return (
    <div className="flex flex-col h-full screen-enter" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="pt-safe px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}>
        <button onClick={() => setView('profiles')} className="pressable text-xl">←</button>
        <h1 className="text-lg font-bold flex-1" style={{ color: 'var(--text-primary)' }}>Profile</h1>
      </div>

      <div className="flex-1 scrollable px-4 py-4 flex flex-col gap-4">
        {(recentGames.length > 0 || favorites.length > 0) && (
          <div className="card p-4">
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Back To Play</div>
            {recentGames.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Recent</div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {recentGames.map((game) => (
                    <button
                      key={game.id}
                      onClick={() => navigate('game', game.id)}
                      className="pressable min-w-[126px] rounded-2xl border px-3 py-3 text-left"
                      style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--card-border)' }}
                    >
                      <div className="text-2xl">{game.icon}</div>
                      <div className="mt-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{game.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Play again</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {favorites.length > 0 && (
              <div className="mt-4">
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Favorites</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {favorites.map((game) => (
                    <button
                      key={game.id}
                      onClick={() => navigate('game', game.id)}
                      className="pressable rounded-full px-3 py-2 text-xs font-bold"
                      style={{ background: `${game.color}22`, color: game.color, border: `1px solid ${game.color}55` }}
                    >
                      {game.icon} {game.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Avatar + name */}
        <div className="card p-4 flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black"
            style={{ background: profile.avatarColor + '33', border: `3px solid ${profile.avatarColor}` }}
          >
            {profile.name[0]?.toUpperCase() ?? '?'}
          </div>

          {editing ? (
            <div className="flex gap-2 w-full">
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value.slice(0, 24))}
                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--accent-blue)',
                  color: 'var(--text-primary)',
                }}
              />
              <button onClick={handleSaveName}
                className="px-3 py-2 rounded-lg text-sm font-bold pressable"
                style={{ background: 'var(--accent-blue)', color: '#fff' }}>
                Save
              </button>
            </div>
          ) : (
            <button onClick={() => { setEditing(true); setNameInput(profile.name); }}
              className="pressable flex items-center gap-2">
              <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{profile.name}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>✏️</span>
            </button>
          )}

          {/* Avatar color picker */}
          <div className="flex gap-2 flex-wrap justify-center">
            {AVATAR_COLORS.map(color => (
              <button
                key={color}
                onClick={() => updateProfile({ avatarColor: color })}
                className="w-7 h-7 rounded-full pressable transition-transform"
                style={{
                  background: color,
                  transform: profile.avatarColor === color ? 'scale(1.3)' : 'scale(1)',
                  boxShadow: profile.avatarColor === color ? `0 0 8px ${color}` : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Stats overview */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Games Played" value={totalGames.toString()} icon="🎮" color="var(--accent-blue)" />
          <StatCard label="Win Rate" value={`${winRate}%`} icon="🏆" color="var(--accent-green)" />
          <StatCard label="Total Wins" value={totalWins.toString()} icon="⭐" color="var(--accent-yellow)" />
          <StatCard label="Play Time" value={playtimeStr} icon="⏱️" color="var(--accent-cyan)" />
          {favGameMeta && (
            <StatCard label="Fave Game" value={favGameMeta.name} icon={favGameMeta.icon} color="var(--accent-orange)" />
          )}
          <StatCard
            label="Achievements"
            value={`${profile.unlockedAchievements.length}`}
            icon="🎖️"
            color="var(--accent-purple)"
          />
        </div>

        {/* Per-game stats */}
        <div className="card">
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--card-border)' }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Game Stats</h2>
              <button
                onClick={() => navigate('menu')}
                className="pressable rounded-full px-3 py-1.5 text-[11px] font-bold"
                style={{ background: 'rgba(92, 134, 255, 0.14)', color: 'var(--accent-blue)' }}
              >
                Return To Hub
              </button>
            </div>
          </div>
          {GAMES.map(game => {
            const gs = profile.stats[game.id];
            if (!gs || gs.gamesPlayed === 0) return null;
            const wr = gs.gamesPlayed > 0 ? Math.round((gs.gamesWon / gs.gamesPlayed) * 100) : 0;
            return (
              <div key={game.id} className="px-4 py-3 flex items-center gap-3 border-b last:border-0"
                style={{ borderColor: 'var(--card-border)' }}>
                <span className="text-xl w-8">{game.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{game.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {gs.gamesPlayed} played · {wr}% won
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-sm" style={{ color: game.color }}>
                    {gs.bestScore > 0 ? gs.bestScore.toLocaleString() : '—'}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>best score</p>
                </div>
              </div>
            );
          })}
          {Object.keys(profile.stats).length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No games played yet. Start playing!</p>
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="card p-4 flex flex-col gap-3">
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Reset</div>
          <div className="flex gap-2">
            <button onClick={() => { if (confirm('Reset all stats for this profile?')) resetStats(); }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold pressable"
              style={{ background: '#ef535022', color: '#ef5350', border: '1px solid #ef535044' }}>
              Reset Stats
            </button>
            <button onClick={() => { if (confirm('Reset all achievements for this profile?')) resetAchievements(); }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold pressable"
              style={{ background: '#ef535022', color: '#ef5350', border: '1px solid #ef535044' }}>
              Reset Achievements
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getLastPlayedAt(stats?: { topScores: { date: string }[] }) {
  if (!stats) return 0;
  return stats.topScores.reduce((latest, score) => Math.max(latest, Date.parse(score.date) || 0), 0);
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div className="card p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="font-black text-lg leading-tight" style={{ color }}>{value}</p>
    </div>
  );
}
