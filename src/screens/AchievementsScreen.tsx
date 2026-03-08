import { useApp } from '../store/AppContext';
import { ACHIEVEMENTS } from '../store/achievements';
import { GAMES } from '../store/gameRegistry';

export function AchievementsScreen() {
  const { navigate, activeProfile } = useApp();
  const unlockedIds = new Set(activeProfile.unlockedAchievements.map(a => a.id));

  const unlocked = ACHIEVEMENTS.filter(a => unlockedIds.has(a.id));
  const locked = ACHIEVEMENTS.filter(a => !unlockedIds.has(a.id) && !a.secret);
  const secret = ACHIEVEMENTS.filter(a => !unlockedIds.has(a.id) && a.secret);

  const totalPoints = unlocked.reduce((s, a) => s + a.points, 0);
  const maxPoints = ACHIEVEMENTS.reduce((s, a) => s + a.points, 0);
  const recentGames = [...GAMES]
    .filter((game) => (activeProfile.stats[game.id]?.gamesPlayed ?? 0) > 0)
    .sort((a, b) => getLastPlayedAt(activeProfile.stats[b.id]) - getLastPlayedAt(activeProfile.stats[a.id]))
    .slice(0, 3);

  return (
    <div className="flex flex-col h-full screen-enter" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="pt-safe px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--card-border)' }}>
        <button onClick={() => navigate('menu')} className="pressable text-xl">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Achievements</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {unlocked.length}/{ACHIEVEMENTS.length} unlocked · {totalPoints}/{maxPoints} pts
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-3 flex-shrink-0" style={{ background: 'var(--bg-secondary)' }}>
        <div className="h-2 rounded-full" style={{ background: 'var(--card-border)' }}>
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width: `${(unlocked.length / ACHIEVEMENTS.length) * 100}%`,
              background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))',
            }}
          />
        </div>
        <p className="text-xs mt-1 text-right" style={{ color: 'var(--text-muted)' }}>
          {Math.round((unlocked.length / ACHIEVEMENTS.length) * 100)}% complete
        </p>
      </div>

      <div className="flex-1 scrollable px-4 py-3 flex flex-col gap-4">
        {recentGames.length > 0 && (
          <div className="card p-4">
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Keep The Streak Going</div>
            <div className="mt-3 grid gap-2">
              {recentGames.map((game) => (
                <button
                  key={game.id}
                  onClick={() => navigate('game', game.id)}
                  className="pressable flex items-center justify-between rounded-2xl border px-3 py-3 text-left"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--card-border)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{game.icon}</div>
                    <div>
                      <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{game.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Jump back in</div>
                    </div>
                  </div>
                  <div className="text-xs font-bold" style={{ color: game.color }}>Play</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Unlocked */}
        {unlocked.length > 0 && (
          <Section title={`Unlocked (${unlocked.length})`}>
            {unlocked.map(ach => {
              const ua = activeProfile.unlockedAchievements.find(a => a.id === ach.id);
              return (
                <AchievementCard
                  key={ach.id}
                  icon={ach.icon}
                  name={ach.name}
                  description={ach.description}
                  color={ach.color}
                  points={ach.points}
                  unlocked
                  date={ua?.unlockedAt}
                />
              );
            })}
          </Section>
        )}

        {/* Locked */}
        {locked.length > 0 && (
          <Section title={`Locked (${locked.length})`}>
            {locked.map(ach => (
              <AchievementCard
                key={ach.id}
                icon={ach.icon}
                name={ach.name}
                description={ach.description}
                color={ach.color}
                points={ach.points}
                unlocked={false}
              />
            ))}
          </Section>
        )}

        {/* Secret */}
        {secret.length > 0 && (
          <Section title={`Secret (${secret.length} hidden)`}>
            {secret.map(ach => (
              <AchievementCard
                key={ach.id}
                icon="🔒"
                name="???"
                description="Keep playing to discover this achievement"
                color="#555"
                points={ach.points}
                unlocked={false}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function getLastPlayedAt(stats?: { topScores: { date: string }[] }) {
  if (!stats) return 0;
  return stats.topScores.reduce((latest, score) => Math.max(latest, Date.parse(score.date) || 0), 0);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-muted)' }}>
        {title}
      </h2>
      <div className="card flex flex-col divide-y" style={{ borderColor: 'var(--card-border)' }}>
        {children}
      </div>
    </div>
  );
}

function AchievementCard({
  icon, name, description, color, points, unlocked, date
}: {
  icon: string; name: string; description: string; color: string;
  points: number; unlocked: boolean; date?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ opacity: unlocked ? 1 : 0.5 }}>
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ background: color + '22', border: `1px solid ${color}44` }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm" style={{ color: unlocked ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {name}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{description}</p>
        {date && (
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {new Date(date).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="text-right flex-shrink-0">
        <span className="text-xs font-bold" style={{ color: unlocked ? color : 'var(--text-muted)' }}>
          {points}pts
        </span>
      </div>
    </div>
  );
}
