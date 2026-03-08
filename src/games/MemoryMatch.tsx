import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GameWrapper } from '../components/GameWrapper';
import { useApp } from '../store/AppContext';
import { useAIDemo } from '../hooks/useAIDemo';

const EMOJIS = ['🎮','🎯','🎲','🎸','🎺','🎻','🎨','🎭','🎪','🎡','🎢','🎠'];

type CardState = 'hidden' | 'face_up' | 'matched';

interface Card {
  id: number;
  emoji: string;
  state: CardState;
}

interface Difficulty {
  cols: number;
  rows: number;
  pairs: number;
  label: string;
}

const DIFFICULTIES: Difficulty[] = [
  { cols: 4, rows: 3, pairs: 6, label: 'Easy 4×3' },
  { cols: 4, rows: 4, pairs: 8, label: 'Medium 4×4' },
  { cols: 6, rows: 4, pairs: 12, label: 'Hard 6×4' },
];

function makeCards(pairs: number): Card[] {
  const pool = EMOJIS.slice(0, pairs);
  const doubled = [...pool, ...pool];
  // Fisher-Yates shuffle
  for (let i = doubled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [doubled[i], doubled[j]] = [doubled[j], doubled[i]];
  }
  return doubled.map((emoji, id) => ({ id, emoji, state: 'hidden' as CardState }));
}

interface GS {
  cards: Card[];
  flipped: number[]; // indices of currently face-up (unmatched) cards
  matches: number;
  attempts: number;
  mismatches: number;
  startTime: number;
  elapsed: number;
  won: boolean;
  blocking: boolean; // true while waiting to flip back non-match
  seen: Map<string, number>; // emoji -> index (AI memory)
  aiDisabled: boolean;
}

export function MemoryMatch() {
  const { recordGame, checkAchievements, bestScore } = useApp();
  const { isEnabled: aiDemoMode, isAdaptive, mode: demoMode, cycleMode, getAdaptiveDelay, getActionWeight, recordPlayerAction } = useAIDemo('memory');
  const aiDemoRef = useRef(aiDemoMode);
  const aiOnRef = useRef(aiDemoMode);
  const demoLabel = demoMode === 'adaptive' ? '🧠 Learn Me' : aiDemoMode ? '🤖 Classic AI' : '🎮 Demo Off';

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [gs, setGs] = useState<GS | null>(null);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aiDemoRef.current = aiDemoMode;
    aiOnRef.current = aiDemoMode;
  }, [aiDemoMode]);

  const stopTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (aiTimerRef.current) { clearTimeout(aiTimerRef.current); aiTimerRef.current = null; }
    if (blockTimerRef.current) { clearTimeout(blockTimerRef.current); blockTimerRef.current = null; }
  }, []);

  const startGame = useCallback((diff: Difficulty) => {
    stopTimers();
    setDifficulty(diff);
    startTimeRef.current = Date.now();
    const cards = makeCards(diff.pairs);
    setGs({ cards, flipped: [], matches: 0, attempts: 0, mismatches: 0, startTime: Date.now(), elapsed: 0, won: false, blocking: false, seen: new Map(), aiDisabled: false });
    timerRef.current = setInterval(() => {
      setGs(g => g && !g.won ? { ...g, elapsed: Math.floor((Date.now() - g.startTime) / 1000) } : g);
    }, 500);
  }, [stopTimers]);

  useEffect(() => () => stopTimers(), [stopTimers]);

  const flipCardRef = useRef<(idx: number) => void>(() => {});

  const flipCard = useCallback((idx: number) => {
    setGs(prev => {
      if (!prev || prev.blocking || prev.won) return prev;
      const card = prev.cards[idx];
      if (card.state !== 'hidden') return prev;
      recordPlayerAction(`flip:${idx}`, { precision: 0.68, exploration: 0.6 });
      recordPlayerAction(`zone:${Math.floor((idx / prev.cards.length) * 4)}`, { exploration: 0.62 });
      const newCards = prev.cards.map((c, i) => i === idx ? { ...c, state: 'face_up' as CardState } : c);
      const newSeen = new Map(prev.seen);
      newSeen.set(card.emoji + '_' + idx, idx);

      if (prev.flipped.length === 0) {
        return { ...prev, cards: newCards, flipped: [idx], seen: newSeen };
      }

      // Second flip
      const firstIdx = prev.flipped[0];
      const firstCard = newCards[firstIdx];
      const newAttempts = prev.attempts + 1;

      if (firstCard.emoji === card.emoji) {
        // Match!
        const matchedCards = newCards.map((c, i) => (i === idx || i === firstIdx) ? { ...c, state: 'matched' as CardState } : c);
        const newMatches = prev.matches + 1;
        const won = newMatches === (prev.cards.length / 2);
        if (won) {
          const dur = (Date.now() - prev.startTime) / 1000;
          const timeBonus = Math.max(0, 300 - Math.floor(dur));
          const perfect = prev.mismatches === 0;
          const score = newMatches * 100 - prev.mismatches * 15 + timeBonus + (perfect ? 300 : 0);
          setTimeout(() => {
            setGs(g => g ? { ...g, won: true } : g);
          }, 300);
          recordGame('memory', true, score, dur);
          checkAchievements('memory', { matches: newMatches, mismatches: prev.mismatches, time: dur });
        }
        return { ...prev, cards: matchedCards, flipped: [], matches: newMatches, attempts: newAttempts, seen: newSeen };
      } else {
        // No match — flip back after 900ms
        const newMismatches = prev.mismatches + 1;
        blockTimerRef.current = setTimeout(() => {
          setGs(g => {
            if (!g) return g;
            const flippedBack = g.cards.map((c, i) => (i === idx || i === firstIdx) && c.state === 'face_up' ? { ...c, state: 'hidden' as CardState } : c);
            return { ...g, cards: flippedBack, flipped: [], blocking: false };
          });
        }, 900);
        return { ...prev, cards: newCards, flipped: [], attempts: newAttempts, mismatches: newMismatches, blocking: true, seen: newSeen };
      }
    });
  }, [checkAchievements, recordGame, recordPlayerAction]);

  // Keep ref in sync so AI effect doesn't need flipCard as a dep
  flipCardRef.current = flipCard;

  // AI Demo
  useEffect(() => {
    if (!aiDemoMode || !gs || gs.won || gs.blocking || gs.aiDisabled) return;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);

    aiTimerRef.current = setTimeout(() => {
      // Read current state snapshot via setGs to avoid stale closure
      setGs(prev => {
        if (!prev || prev.blocking || prev.won || prev.aiDisabled || !aiOnRef.current) return prev;
        const hiddenCards = prev.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.state === 'hidden');
        if (!hiddenCards.length) return prev;

        if (prev.flipped.length === 0) {
          // Look for a known pair
          const emojiGroups = new Map<string, number[]>();
          for (const { c, i } of hiddenCards) {
            const key = c.emoji;
            if (!emojiGroups.has(key)) emojiGroups.set(key, []);
            emojiGroups.get(key)!.push(i);
          }
          for (const [, indices] of emojiGroups) {
            if (indices.length >= 2) {
              // Flip first of known pair using ref (avoids stale dep)
              setTimeout(() => flipCardRef.current(indices[0]), 0);
              return prev;
            }
          }
          // Flip unknown card
          const unknownIdx = isAdaptive
            ? hiddenCards
              .map(({ i }) => ({
                i,
                rank: getActionWeight(`flip:${i}`) + getActionWeight(`zone:${Math.floor((i / prev.cards.length) * 4)}`) * 0.8,
              }))
              .sort((a, b) => b.rank - a.rank)[0]?.i
            : hiddenCards[Math.floor(Math.random() * hiddenCards.length)].i;
          setTimeout(() => flipCardRef.current(unknownIdx), 0);
          return prev;
        } else {
          // One card flipped - look for its pair
          const firstIdx = prev.flipped[0];
          const firstEmoji = prev.cards[firstIdx].emoji;
          const pairIdx = hiddenCards.find(({ c, i }) => c.emoji === firstEmoji && i !== firstIdx);
          if (pairIdx) {
            setTimeout(() => flipCardRef.current(pairIdx.i), 0);
          } else {
            // Flip unknown
            const pool = hiddenCards.filter(({ i }) => i !== firstIdx);
            const unknownIdx = isAdaptive
              ? pool
                .map(({ i }) => ({
                  i,
                  rank: getActionWeight(`flip:${i}`) + getActionWeight(`zone:${Math.floor((i / prev.cards.length) * 4)}`) * 0.8,
                }))
                .sort((a, b) => b.rank - a.rank)[0]?.i
              : pool[Math.floor(Math.random() * pool.length)]?.i;
            if (unknownIdx !== undefined) setTimeout(() => flipCardRef.current(unknownIdx), 0);
          }
          return prev;
        }
      });
    }, getAdaptiveDelay(700));

    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiDemoMode, getActionWeight, getAdaptiveDelay, gs?.aiDisabled, gs?.blocking, gs?.flipped.length, gs?.matches, gs?.won, isAdaptive]);

  // Only re-enable aiDisabled when demo mode itself changes (not on every gs update)
  useEffect(() => {
    if (aiDemoMode) setGs(g => g ? { ...g, aiDisabled: false } : g);
  }, [aiDemoMode]);

  // Stop AI on player input
  useEffect(() => {
    const stopAI = () => { if (aiDemoRef.current) setGs(g => g ? { ...g, aiDisabled: true } : g); };
    window.addEventListener('keydown', stopAI, true);
    return () => window.removeEventListener('keydown', stopAI, true);
  }, []);

  const best = bestScore('memory');

  if (!difficulty) {
    return (
      <GameWrapper title="Memory Match" onRestart={() => setDifficulty(null)}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 24 }}>
          <div style={{ color: '#fff', fontSize: 18, marginBottom: 8 }}>Select Difficulty</div>
          {DIFFICULTIES.map((d, i) => (
            <button key={i} onClick={() => startGame(d)}
              style={{ padding: '12px 32px', fontSize: 16, background: '#3a6186', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', width: 200 }}>
              {d.label}
            </button>
          ))}
          {best > 0 && <div style={{ color: '#aaa', fontSize: 13, marginTop: 8 }}>Best: {best}</div>}
        </div>
      </GameWrapper>
    );
  }

  if (!gs) return null;

  const cols = difficulty.cols;
  const cardSize = difficulty.cols === 6 ? 72 : 90;
  const gap = 8;

  const score = gs.matches * 100 - gs.mismatches * 15;
  const mm = Math.floor(gs.elapsed / 60);
  const ss = gs.elapsed % 60;
  const timeStr = `${mm}:${ss.toString().padStart(2, '0')}`;

  return (
    <GameWrapper title="Memory Match" score={score} onRestart={() => startGame(difficulty)}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 8 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
          <div style={{ background: '#1a1a2e', padding: '4px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa' }}>MATCHES</div>
            <div style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{gs.matches}/{difficulty.pairs}</div>
          </div>
          <div style={{ background: '#1a1a2e', padding: '4px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa' }}>TIME</div>
            <div style={{ fontSize: 18, color: '#fff', fontWeight: 'bold' }}>{timeStr}</div>
          </div>
          <div style={{ background: '#1a1a2e', padding: '4px 12px', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#aaa' }}>MISSES</div>
            <div style={{ fontSize: 18, color: '#f66', fontWeight: 'bold' }}>{gs.mismatches}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cardSize}px)`, gap, userSelect: 'none' }}>
          {gs.cards.map((card, idx) => {
            const isFaceUp = card.state === 'face_up' || card.state === 'matched';
            const isMatched = card.state === 'matched';
            return (
              <div key={card.id}
                onClick={() => !gs.blocking && !gs.won && flipCard(idx)}
                style={{
                  width: cardSize, height: cardSize,
                  perspective: 600,
                  cursor: card.state === 'hidden' ? 'pointer' : 'default',
                }}>
                <div style={{
                  width: '100%', height: '100%',
                  position: 'relative',
                  transition: 'transform 0.2s',
                  transformStyle: 'preserve-3d',
                  transform: isFaceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}>
                  {/* Back face */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    backfaceVisibility: 'hidden',
                    background: '#3a6186',
                    borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  }}>?</div>
                  {/* Front face */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    background: isMatched ? '#1a5c1a' : '#1a1a2e',
                    borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: cardSize > 80 ? 36 : 28,
                    border: isMatched ? '2px solid #4caf50' : '2px solid #3a6186',
                    boxShadow: isMatched ? '0 0 12px rgba(76,175,80,0.5)' : '0 2px 6px rgba(0,0,0,0.4)',
                  }}>{card.emoji}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setDifficulty(null)}
            style={{ padding: '4px 12px', background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Change Difficulty
          </button>
          <button onClick={() => {
            setGs(g => g ? { ...g, aiDisabled: false } : g);
            cycleMode();
          }}
            style={{ padding: '4px 12px', background: demoMode === 'adaptive' ? '#7b1fa2' : aiDemoMode ? '#0288d1' : '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            {demoLabel}
          </button>
        </div>

        {gs.won && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
            <div style={{ fontSize: 36, fontWeight: 'bold', color: '#4caf50' }}>You Win!</div>
            <div style={{ color: '#eee', marginBottom: 4 }}>Matches: {gs.matches} | Misses: {gs.mismatches} | Time: {timeStr}</div>
            <div style={{ color: '#ffd700', fontSize: 20, marginBottom: 16 }}>Score: {score}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => startGame(difficulty)}
                style={{ padding: '10px 20px', fontSize: 16, background: '#3a6186', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Play Again</button>
              <button onClick={() => setDifficulty(null)}
                style={{ padding: '10px 20px', fontSize: 16, background: '#555', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Menu</button>
            </div>
          </div>
        )}
      </div>
    </GameWrapper>
  );
}
