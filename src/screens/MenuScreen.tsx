import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { GAMES, type GameMeta } from '../store/gameRegistry';
import { InstallCard } from '../components/InstallCard';
import type { GameStats } from '../store/types';

const CATEGORIES = ['all', 'arcade', 'puzzle', 'strategy', 'classic'] as const;
type Category = typeof CATEGORIES[number];

export function MenuScreen() {
  const { navigate, activeProfile, toggleFavoriteGame } = useApp();
  const [category, setCategory] = useState<Category>('all');
  const [search, setSearch] = useState('');

  // (Screensaver code removed per user request)

  const filtered = GAMES.filter(g => {
    const matchCat = category === 'all' || g.category === category;
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const favoriteIds = new Set(activeProfile.favoriteGameIds);
  const gamesById = new Map(GAMES.map((game) => [game.id, game]));
  const recentlyPlayed = [...GAMES]
    .map((game) => ({
      game,
      playedAt: getLastPlayedAt(activeProfile.stats[game.id]),
      gamesPlayed: activeProfile.stats[game.id]?.gamesPlayed ?? 0,
    }))
    .filter((entry) => entry.gamesPlayed > 0)
    .sort((a, b) => b.playedAt - a.playedAt);

  const continuePlaying = recentlyPlayed.slice(0, 3).map((entry) => entry.game);
  const latestGame = continuePlaying[0] ?? null;
  const recentGames = recentlyPlayed.slice(0, 6).map((entry) => entry.game);
  const favoriteGames = activeProfile.favoriteGameIds
    .map((id) => gamesById.get(id))
    .filter((game): game is GameMeta => Boolean(game));

  const totalGames = activeProfile.globalStats.totalGames;
  const totalPlaytime = activeProfile.globalStats.globalPlaytime;
  const playtimeStr = totalPlaytime < 60
    ? `${Math.floor(totalPlaytime)}s`
    : totalPlaytime < 3600
      ? `${Math.floor(totalPlaytime / 60)}m`
      : `${Math.floor(totalPlaytime / 3600)}h ${Math.floor((totalPlaytime % 3600) / 60)}m`;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="pt-safe px-4 pb-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>
              🕹️ Arcade Hub
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {totalGames} games played · {playtimeStr} playtime
            </p>
          </div>
          <div className="flex gap-2">
            <NavButton icon="👤" label="Profile" onClick={() => navigate('profile')} />
            <NavButton icon="🏆" label="Awards" onClick={() => navigate('achievements')} />
            <NavButton icon="⚙️" label="Settings" onClick={() => navigate('settings')} />
          </div>
        </div>

        {latestGame && !search && category === 'all' && (
          <button
            onClick={() => navigate('game', latestGame.id)}
            className="pressable mb-3 flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left"
            style={{
              background: `linear-gradient(135deg, ${latestGame.color}22, rgba(255,255,255,0.04))`,
              borderColor: `${latestGame.color}55`,
            }}
          >
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em]" style={{ color: latestGame.color }}>Quick Resume</div>
              <div className="mt-1 text-sm font-black" style={{ color: 'var(--text-primary)' }}>{latestGame.name}</div>
            </div>
            <div className="text-2xl">{latestGame.icon}</div>
          </button>
        )}

        {/* Search */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>🔍</span>
          <input
            type="text"
            placeholder="Search games..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mt-2 overflow-x-auto pb-1 no-scrollbar">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all pressable"
              style={{
                background: category === cat ? 'var(--accent-blue)' : 'var(--card-bg)',
                color: category === cat ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${category === cat ? 'var(--accent-blue)' : 'var(--card-border)'}`,
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Game grid */}
      <div className="flex-1 scrollable px-4 py-3">
        {!search && category === 'all' && continuePlaying.length > 0 && (
          <GameSection title="Continue Playing" subtitle="Jump back into the games you touched most recently.">
            <div className="grid gap-3">
              {continuePlaying.map((game) => (
                <FeatureCard
                  key={game.id}
                  game={game}
                  played
                  bestScore={activeProfile.stats[game.id]?.bestScore ?? 0}
                  favorite={favoriteIds.has(game.id)}
                  onFavorite={() => toggleFavoriteGame(game.id)}
                  onClick={() => navigate('game', game.id)}
                />
              ))}
            </div>
          </GameSection>
        )}

        {!search && category === 'all' && favoriteGames.length > 0 && (
          <GameSection title="Favorites" subtitle="Your pinned quick-launch games.">
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {favoriteGames.map((game) => (
                <div key={game.id} className="min-w-[210px] max-w-[210px] flex-shrink-0">
                  <GameCard
                    game={game}
                    played={(activeProfile.stats[game.id]?.gamesPlayed ?? 0) > 0}
                    bestScore={activeProfile.stats[game.id]?.bestScore ?? 0}
                    favorite
                    onFavorite={() => toggleFavoriteGame(game.id)}
                    onClick={() => navigate('game', game.id)}
                  />
                </div>
              ))}
            </div>
          </GameSection>
        )}

        {!search && category === 'all' && recentGames.length > 0 && (
          <GameSection title="Recent" subtitle="Last completed sessions from this profile.">
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {recentGames.map((game) => (
                <div key={game.id} className="min-w-[210px] max-w-[210px] flex-shrink-0">
                  <GameCard
                    game={game}
                    played
                    bestScore={activeProfile.stats[game.id]?.bestScore ?? 0}
                    favorite={favoriteIds.has(game.id)}
                    onFavorite={() => toggleFavoriteGame(game.id)}
                    onClick={() => navigate('game', game.id)}
                  />
                </div>
              ))}
            </div>
          </GameSection>
        )}

        <InstallCard />
        <div className="mb-3 mt-4">
          <div className="text-sm font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>All Games</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Browse the full catalog or use favorites to pin your regular rotation.
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="text-4xl">🔍</span>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No games found</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-4 game-grid-gap">
            {filtered.map(game => (
              <GameCard
                key={game.id}
                game={game}
                played={(activeProfile.stats[game.id]?.gamesPlayed ?? 0) > 0}
                bestScore={activeProfile.stats[game.id]?.bestScore ?? 0}
                favorite={favoriteIds.has(game.id)}
                onFavorite={() => toggleFavoriteGame(game.id)}
                onClick={() => navigate('game', game.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NavButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 p-2 rounded-lg pressable"
      style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      aria-label={label}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
    </button>
  );
}

function GameCard({ game, played, bestScore, favorite = false, onFavorite, onClick }: {
  game: GameMeta;
  played: boolean;
  bestScore: number;
  favorite?: boolean;
  onFavorite?: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="rounded-xl border p-1"
      style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
    >
      <div className="flex justify-end px-2 pt-2">
        <button
          onClick={onFavorite}
          className="pressable h-8 w-8 rounded-full text-sm"
          style={{ background: favorite ? game.color + '22' : 'rgba(255,255,255,0.06)', color: favorite ? game.color : 'var(--text-muted)' }}
          aria-label={favorite ? `Remove ${game.name} from favorites` : `Add ${game.name} to favorites`}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>
      <button
        onClick={onClick}
        className="pressable text-left rounded-xl px-3 pb-3 pt-1 flex w-full flex-col gap-2 transition-all"
        style={{ minHeight: '110px' }}
      >
        <div className="flex items-start justify-between">
          <span className="text-3xl">{game.icon}</span>
          {played && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: game.color + '22', color: game.color }}>
              PLAYED
            </span>
          )}
        </div>
        <div>
          <h3 className="font-bold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
            {game.name}
          </h3>
          <p className="text-xs mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>
            {game.description}
          </p>
        </div>
        <div className="flex items-center justify-between mt-auto">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {game.controls}
          </span>
          {bestScore > 0 && (
            <span className="text-[10px] font-bold" style={{ color: game.color }}>
              {bestScore.toLocaleString()}
            </span>
          )}
        </div>
        <div className="h-0.5 rounded-full opacity-60" style={{ background: game.color }} />
      </button>
    </div>
  );
}

function FeatureCard({ game, played, bestScore, favorite, onFavorite, onClick }: {
  game: GameMeta;
  played: boolean;
  bestScore: number;
  favorite: boolean;
  onFavorite: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="rounded-[24px] border p-4"
      style={{
        background: `linear-gradient(135deg, ${game.color}22, rgba(255,255,255,0.03)), var(--card-bg)`,
        borderColor: game.color + '44',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-3xl">{game.icon}</div>
          <div className="mt-3 text-lg font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{game.name}</div>
          <div className="mt-1 text-sm leading-5" style={{ color: 'var(--text-secondary)' }}>{game.description}</div>
        </div>
        <button
          onClick={onFavorite}
          className="pressable h-9 w-9 rounded-full text-sm"
          style={{ background: favorite ? game.color + '22' : 'rgba(255,255,255,0.06)', color: favorite ? game.color : 'var(--text-muted)' }}
          aria-label={favorite ? `Remove ${game.name} from favorites` : `Add ${game.name} to favorites`}
        >
          {favorite ? '★' : '☆'}
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{played ? 'Recently played' : 'Ready to launch'}</span>
        {bestScore > 0 && <span style={{ color: game.color }}>Best {bestScore.toLocaleString()}</span>}
      </div>
      <button
        onClick={onClick}
        className="pressable mt-4 h-12 w-full rounded-2xl text-sm font-black"
        style={{ background: game.color, color: '#fff' }}
      >
        Play Now
      </button>
    </div>
  );
}

function GameSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2">
        <div className="text-sm font-black tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
      {children}
    </section>
  );
}

function getLastPlayedAt(stats?: GameStats): number {
  if (!stats) return 0;
  return stats.topScores.reduce((latest, score) => Math.max(latest, Date.parse(score.date) || 0), 0);
}
