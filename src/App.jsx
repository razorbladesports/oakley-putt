import { useState, useEffect, useMemo } from 'react';

const COURSES = {
  black: {
    id: 'black',
    name: 'Black Course',
    label: 'BLACK',
    pars: [2, 2, 3, 2, 2, 3, 3, 2, 2, 3, 2, 3, 2, 3, 3, 3, 3, 2],
    total: 45,
  },
  white: {
    id: 'white',
    name: 'White Course',
    label: 'WHITE',
    pars: [2, 2, 3, 2, 2, 3, 2, 2, 2, 3, 3, 3, 2, 3, 2, 3, 2, 3],
    total: 44,
  },
};

const GAME_KEY = 'oakley_putt_game_v2';
const STATS_KEY = 'oakley_putt_stats_v1';
const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap');

.app-root {
  --bg: #EDE6D3;
  --surface: #F8F3E6;
  --surface-2: #FCFAF1;
  --ink: #0F0F0F;
  --ink-soft: #3A3631;
  --muted: #8E8676;
  --border: #D8CFB8;
  --border-strong: #1F1B16;
  --accent: #FF5C2B;
  --accent-ink: #FFFFFF;
  --green: #2C7A3B;
  --red: #C8351E;
  font-family: 'DM Sans', system-ui, sans-serif;
  background: var(--bg);
  color: var(--ink);
  min-height: 100vh;
  background-image: radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px);
  background-size: 5px 5px;
  -webkit-tap-highlight-color: transparent;
}

.app-root * { box-sizing: border-box; }

.font-display {
  font-family: 'Anton', sans-serif;
  letter-spacing: 0.01em;
  line-height: 0.95;
}

.font-mono {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
}

.tag {
  font-family: 'Anton', sans-serif;
  letter-spacing: 0.14em;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted);
}

.tag-ink {
  font-family: 'Anton', sans-serif;
  letter-spacing: 0.14em;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--ink);
}

.card {
  background: var(--surface);
  border: 1.5px solid var(--border-strong);
  border-radius: 14px;
}

.card-inset {
  background: var(--surface-2);
  border: 1.5px solid var(--border);
  border-radius: 12px;
}

.btn-primary {
  background: var(--ink);
  color: var(--bg);
  border: 1.5px solid var(--ink);
  font-family: 'Anton', sans-serif;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: transform 0.08s, background 0.15s, border-color 0.15s;
  cursor: pointer;
  border-radius: 12px;
}
.btn-primary:not(:disabled):hover { background: var(--accent); border-color: var(--accent); }
.btn-primary:not(:disabled):active { transform: translateY(1.5px); }
.btn-primary:disabled { background: var(--muted); border-color: var(--muted); cursor: not-allowed; opacity: 0.6; }

.btn-accent {
  background: var(--accent);
  color: var(--accent-ink);
  border: 1.5px solid var(--accent);
  font-family: 'Anton', sans-serif;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: transform 0.08s, filter 0.15s;
  cursor: pointer;
  border-radius: 12px;
}
.btn-accent:not(:disabled):hover { filter: brightness(1.08); }
.btn-accent:not(:disabled):active { transform: translateY(1.5px); }
.btn-accent:disabled { background: var(--muted); border-color: var(--muted); cursor: not-allowed; opacity: 0.6; }

.btn-ghost {
  background: transparent;
  color: var(--ink);
  border: 1.5px solid var(--border-strong);
  font-family: 'Anton', sans-serif;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: background 0.15s, color 0.15s;
  cursor: pointer;
  border-radius: 12px;
}
.btn-ghost:not(:disabled):hover { background: var(--ink); color: var(--bg); }
.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-danger {
  background: transparent;
  color: var(--red);
  border: 1.5px solid var(--red);
  font-family: 'Anton', sans-serif;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: background 0.15s, color 0.15s;
  cursor: pointer;
  border-radius: 12px;
}
.btn-danger:hover { background: var(--red); color: white; }
.btn-danger.confirming {
  background: var(--red);
  color: white;
}

.score-btn {
  background: var(--surface-2);
  border: 1.5px solid var(--border);
  color: var(--ink-soft);
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  transition: transform 0.08s, background 0.12s, color 0.12s, border-color 0.12s;
  cursor: pointer;
  border-radius: 10px;
  font-size: 18px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  padding: 0;
}
.score-btn:active { transform: translateY(1.5px); }
.score-btn.selected { background: var(--ink); border-color: var(--ink); color: var(--bg); }
.score-btn.ace { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

.input-text {
  background: var(--surface-2);
  border: 1.5px solid var(--border-strong);
  border-radius: 10px;
  color: var(--ink);
  font-family: 'DM Sans', sans-serif;
  font-weight: 500;
  font-size: 16px;
  padding: 12px 14px;
  width: 100%;
}
.input-text:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
.input-text::placeholder { color: var(--muted); }

.divider-dashed { border-top: 1.5px dashed var(--border-strong); }

.course-card-black {
  background: var(--ink);
  color: var(--bg);
  border: 1.5px solid var(--ink);
  cursor: pointer;
  transition: transform 0.1s;
  border-radius: 18px;
}
.course-card-black:active { transform: translateY(2px); }

.course-card-white {
  background: var(--surface-2);
  color: var(--ink);
  border: 1.5px solid var(--border-strong);
  cursor: pointer;
  transition: transform 0.1s;
  border-radius: 18px;
}
.course-card-white:active { transform: translateY(2px); }

.hole-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--border-strong);
  background: transparent;
  transition: all 0.15s;
  flex-shrink: 0;
  cursor: pointer;
  padding: 0;
}
.hole-dot.partial { background: var(--muted); border-color: var(--muted); }
.hole-dot.filled { background: var(--ink); }
.hole-dot.current { background: var(--accent); border-color: var(--accent); transform: scale(1.5); }

.player-row {
  background: var(--surface);
  border: 1.5px solid var(--border-strong);
  border-radius: 14px;
  padding: 14px;
}

.icon-btn {
  background: transparent;
  border: 1.5px solid var(--border-strong);
  color: var(--ink);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  flex-shrink: 0;
  padding: 0;
}
.icon-btn:hover { background: var(--ink); color: var(--bg); }
.icon-btn.danger:hover { background: var(--red); border-color: var(--red); color: white; }
.icon-btn.confirming {
  background: var(--red);
  border-color: var(--red);
  color: white;
}

.rank-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Anton', sans-serif;
  font-size: 14px;
  flex-shrink: 0;
}
.rank-1 { background: var(--accent); color: white; }
.rank-2 { background: var(--ink); color: var(--bg); }
.rank-3 { background: var(--muted); color: white; }
.rank-other { background: var(--surface-2); color: var(--ink); border: 1.5px solid var(--border-strong); }

.scorecard-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}
.scorecard-table th, .scorecard-table td {
  border: 1px solid var(--border);
  padding: 6px 4px;
  text-align: center;
  min-width: 28px;
}
.scorecard-table th {
  background: var(--surface);
  font-family: 'Anton', sans-serif;
  font-weight: 400;
  font-size: 11px;
  letter-spacing: 0.05em;
}
.scorecard-table .name-col {
  text-align: left;
  font-family: 'DM Sans', sans-serif;
  font-weight: 600;
  min-width: 70px;
  padding-left: 8px;
}
.scorecard-table .par-row { background: var(--surface); color: var(--muted); }
.scorecard-table .total-col { background: var(--surface); font-weight: 700; }

.chip {
  background: var(--surface-2);
  border: 1.5px solid var(--border-strong);
  color: var(--ink);
  border-radius: 999px;
  padding: 7px 14px;
  font-family: 'DM Sans', sans-serif;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.08s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.chip:hover { background: var(--ink); color: var(--bg); }
.chip:active { transform: translateY(1px); }
.chip-plus {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  opacity: 0.5;
}

.saved-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--green);
  color: white;
  border-radius: 999px;
  padding: 4px 10px;
  font-family: 'Anton', sans-serif;
  letter-spacing: 0.12em;
  font-size: 10px;
  text-transform: uppercase;
}

.fade-in { animation: fadeIn 0.25s ease-out; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.pulse-once { animation: pulseOnce 0.3s ease-out; }
@keyframes pulseOnce {
  0% { transform: scale(1); }
  50% { transform: scale(1.06); }
  100% { transform: scale(1); }
}
`;

const generateRoundId = () =>
  `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function computePlayerStats(profile) {
  if (!profile || !profile.rounds) {
    return { totalRounds: 0, aces: 0, byCourse: {} };
  }
  const rounds = profile.rounds;
  const aces = rounds.reduce(
    (a, r) => a + (r.scores || []).filter((s) => s === 1).length,
    0
  );
  const byCourse = {};
  ['black', 'white'].forEach((cid) => {
    const courseRounds = rounds.filter((r) => r.course === cid);
    const completed = courseRounds.filter((r) => r.complete);
    byCourse[cid] = {
      played: courseRounds.length,
      completed: completed.length,
      best: completed.length ? Math.min(...completed.map((r) => r.total)) : null,
      bestVs: completed.length ? Math.min(...completed.map((r) => r.vsPar)) : null,
      avg: completed.length
        ? Math.round(
            (completed.reduce((a, r) => a + r.total, 0) / completed.length) * 10
          ) / 10
        : null,
    };
  });
  return { totalRounds: rounds.length, aces, byCourse };
}

export default function App() {
  const [view, setView] = useState('home');
  const [courseId, setCourseId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [currentHole, setCurrentHole] = useState(0);
  const [roundId, setRoundId] = useState(null);

  const [playerStats, setPlayerStats] = useState({});

  const [newPlayerName, setNewPlayerName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [showSavedPill, setShowSavedPill] = useState(false);

  const course = courseId ? COURSES[courseId] : null;
  const hasActiveRound =
    players.length > 0 && courseId && view !== 'finished';

  // Load game state
  useEffect(() => {
    (async () => {
      try {
        const value = localStorage.getItem(GAME_KEY);
        if (value) {
          const data = JSON.parse(value);
          if (data && data.players && data.players.length > 0 && data.courseId) {
            setCourseId(data.courseId);
            setPlayers(data.players);
            setScores(data.scores || {});
            setCurrentHole(data.currentHole || 0);
            setRoundId(data.roundId || generateRoundId());
            if (data.view === 'finished') {
              setView('finished');
            } else if (data.view === 'players') {
              setView('players');
            }
            // Otherwise: land on home with a Resume card visible.
          }
        }
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  // Load stats
  useEffect(() => {
    (async () => {
      try {
        const value = localStorage.getItem(STATS_KEY);
        if (value) {
          const data = JSON.parse(value);
          if (data && typeof data === 'object') setPlayerStats(data);
        }
      } catch (e) {}
      setStatsLoaded(true);
    })();
  }, []);

  // Persist game state
  useEffect(() => {
    if (!loaded) return;
    const data = { view, courseId, players, scores, currentHole, roundId };
    localStorage.setItem(GAME_KEY, JSON.stringify(data));
  }, [view, courseId, players, scores, currentHole, roundId, loaded]);

  // Persist stats
  useEffect(() => {
    if (!statsLoaded) return;
    localStorage.setItem(STATS_KEY, JSON.stringify(playerStats));
  }, [playerStats, statsLoaded]);

  // Save round to stats when entering finished view
  useEffect(() => {
    if (view !== 'finished') return;
    if (!course || !roundId || players.length === 0) return;
    setPlayerStats((prev) => {
      const next = { ...prev };
      const now = new Date().toISOString();
      players.forEach((p) => {
        const profile = next[p]
          ? { ...next[p], rounds: [...next[p].rounds] }
          : { displayName: p, rounds: [] };
        const playerScores = scores[p] || [];
        const total = playerScores.reduce((a, s) => a + (s || 0), 0);
        const parPlayed = playerScores.reduce(
          (a, s, i) => a + (s != null ? course.pars[i] : 0),
          0
        );
        const record = {
          roundId,
          course: course.id,
          date: now,
          total,
          vsPar: total - parPlayed,
          scores: [...playerScores],
          coursePar: course.total,
          complete: playerScores.every((s) => s != null),
        };
        profile.rounds = profile.rounds.filter((r) => r.roundId !== roundId);
        profile.rounds.push(record);
        next[p] = profile;
      });
      return next;
    });
    setShowSavedPill(true);
    const t = setTimeout(() => setShowSavedPill(false), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, roundId]);

  // ---- Helpers ----
  const totalForPlayer = (name) =>
    (scores[name] || []).reduce((a, s) => a + (s || 0), 0);
  const parPlayedFor = (name) => {
    if (!course) return 0;
    return (scores[name] || []).reduce(
      (a, s, i) => a + (s != null ? course.pars[i] : 0),
      0
    );
  };
  const playedCountFor = (name) =>
    (scores[name] || []).filter((s) => s != null).length;
  const versusPar = (name) => totalForPlayer(name) - parPlayedFor(name);
  const formatVs = (v) => (v === 0 ? 'E' : v > 0 ? `+${v}` : `${v}`);
  const vsColor = (v) =>
    v < 0 ? 'var(--green)' : v > 0 ? 'var(--red)' : 'var(--ink-soft)';

  // ---- Actions ----
  const selectCourse = (id) => {
    setCourseId(id);
    setPlayers([]);
    setScores({});
    setCurrentHole(0);
    setRoundId(null);
    setView('players');
  };

  const addPlayer = (rawName) => {
    const name = (rawName ?? newPlayerName).trim();
    if (!name) return;
    if (players.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setNewPlayerName('');
      return;
    }
    setPlayers([...players, name]);
    setScores({ ...scores, [name]: Array(18).fill(null) });
    setNewPlayerName('');
  };

  const removePlayer = (name) => {
    setPlayers(players.filter((p) => p !== name));
    const ns = { ...scores };
    delete ns[name];
    setScores(ns);
  };

  const startRound = () => {
    if (players.length === 0) return;
    setCurrentHole(0);
    setRoundId(generateRoundId());
    setView('scoring');
  };

  const setScore = (player, score) => {
    const ps = [...(scores[player] || Array(18).fill(null))];
    ps[currentHole] = ps[currentHole] === score ? null : score;
    setScores({ ...scores, [player]: ps });
  };

  const nextHole = () => {
    if (currentHole < 17) setCurrentHole(currentHole + 1);
    else setView('finished');
  };
  const prevHole = () => {
    if (currentHole > 0) setCurrentHole(currentHole - 1);
  };
  const goToHole = (idx) => setCurrentHole(idx);

  const playAgainSamePlayers = () => {
    const fresh = {};
    players.forEach((p) => {
      fresh[p] = Array(18).fill(null);
    });
    setScores(fresh);
    setCurrentHole(0);
    setRoundId(generateRoundId());
    setView('scoring');
  };

  const exitToHome = () => setView('home');

  const fullReset = () => {
    setView('home');
    setCourseId(null);
    setPlayers([]);
    setScores({});
    setCurrentHole(0);
    setRoundId(null);
    setConfirmingDiscard(false);
    localStorage.removeItem(GAME_KEY);
  };

  const discardRound = () => {
    if (!confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    fullReset();
  };

  const deletePlayerStats = (name) => {
    if (confirmingDelete !== name) {
      setConfirmingDelete(name);
      return;
    }
    setPlayerStats((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setConfirmingDelete(null);
  };

  const deleteAllStats = () => {
    if (confirmingDelete !== 'all') {
      setConfirmingDelete('all');
      return;
    }
    setPlayerStats({});
    setConfirmingDelete(null);
  };

  const holeCompleteness = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => {
      const pc = players.length;
      if (pc === 0) return 'empty';
      const scored = players.filter((p) => (scores[p] || [])[i] != null).length;
      if (scored === 0) return 'empty';
      if (scored === pc) return 'full';
      return 'partial';
    });
  }, [players, scores]);

  const leaderboard = useMemo(() => {
    return [...players]
      .map((p) => ({
        name: p,
        total: totalForPlayer(p),
        vs: versusPar(p),
        played: playedCountFor(p),
      }))
      .sort((a, b) => a.total - b.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, scores, course]);

  const suggestedPlayers = useMemo(() => {
    return Object.keys(playerStats)
      .filter(
        (name) =>
          !players.some((p) => p.toLowerCase() === name.toLowerCase())
      )
      .sort((a, b) => {
        const ra = playerStats[a].rounds?.length || 0;
        const rb = playerStats[b].rounds?.length || 0;
        return rb - ra;
      })
      .slice(0, 12);
  }, [playerStats, players]);

  if (!loaded || !statsLoaded) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="app-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
          <div className="tag">Loading...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="app-root" style={{ maxWidth: 520, margin: '0 auto', padding: '20px 18px 40px' }}>
        {view === 'home' && (
          <HomeView
            hasActiveRound={hasActiveRound}
            course={course}
            currentHole={currentHole}
            players={players}
            holeCompleteness={holeCompleteness}
            confirmingDiscard={confirmingDiscard}
            onResume={() => setView('scoring')}
            onDiscard={discardRound}
            onCancelDiscard={() => setConfirmingDiscard(false)}
            onSelectCourse={selectCourse}
            onViewStats={() => setView('stats')}
            statsPlayerCount={Object.keys(playerStats).length}
          />
        )}
        {view === 'players' && course && (
          <PlayersView
            course={course}
            players={players}
            newPlayerName={newPlayerName}
            setNewPlayerName={setNewPlayerName}
            suggestedPlayers={suggestedPlayers}
            onAdd={() => addPlayer()}
            onAddByName={(n) => addPlayer(n)}
            onRemove={removePlayer}
            onStart={startRound}
            onBack={() => setView('home')}
          />
        )}
        {view === 'scoring' && course && (
          <ScoringView
            course={course}
            players={players}
            scores={scores}
            currentHole={currentHole}
            holeCompleteness={holeCompleteness}
            totalForPlayer={totalForPlayer}
            versusPar={versusPar}
            formatVs={formatVs}
            vsColor={vsColor}
            playedCountFor={playedCountFor}
            onSetScore={setScore}
            onPrev={prevHole}
            onNext={nextHole}
            onGoToHole={goToHole}
            onHome={exitToHome}
            onFinish={() => setView('finished')}
          />
        )}
        {view === 'finished' && course && (
          <FinishedView
            course={course}
            leaderboard={leaderboard}
            scores={scores}
            formatVs={formatVs}
            vsColor={vsColor}
            showSavedPill={showSavedPill}
            onPlayAgain={playAgainSamePlayers}
            onNewGame={fullReset}
            onBackToScoring={() => {
              setCurrentHole(17);
              setView('scoring');
            }}
          />
        )}
        {view === 'stats' && (
          <StatsView
            playerStats={playerStats}
            confirmingDelete={confirmingDelete}
            onDeletePlayer={deletePlayerStats}
            onDeleteAll={deleteAllStats}
            onCancelConfirm={() => setConfirmingDelete(null)}
            onBack={() => {
              setConfirmingDelete(null);
              setView('home');
            }}
          />
        )}
      </div>
    </>
  );
}

// ============================================================
// HOME
// ============================================================
function HomeView({
  hasActiveRound, course, currentHole, players, holeCompleteness,
  confirmingDiscard, onResume, onDiscard, onCancelDiscard,
  onSelectCourse, onViewStats, statsPlayerCount,
}) {
  return (
    <div className="fade-in">
      <div style={{ paddingTop: 8 }}>
        <div className="tag" style={{ marginBottom: 6 }}>Oakley Golf + Gather</div>
        <h1 className="font-display" style={{ fontSize: 88, margin: 0, letterSpacing: '-0.01em' }}>
          PUTT<br />SCORE.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--ink-soft)', marginTop: 14, marginBottom: 0, maxWidth: 340 }}>
          Drop the pencil. Tap to score. Watch the leaderboard sort itself.
        </p>
      </div>

      {hasActiveRound ? (
        <div style={{ marginTop: 28 }}>
          <div className="tag" style={{ marginBottom: 10 }}>Round in progress</div>
          <div className="card" style={{ padding: 18, background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: 'Anton', letterSpacing: '0.14em', fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  {course.label} COURSE
                </div>
                <div className="font-display" style={{ fontSize: 36 }}>
                  HOLE {String(currentHole + 1).padStart(2, '0')} / 18
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="font-mono" style={{ fontSize: 22 }}>
                  {holeCompleteness.filter((c) => c === 'full').length}
                  <span style={{ opacity: 0.5 }}>/18</span>
                </div>
                <div style={{ fontFamily: 'Anton', letterSpacing: '0.14em', fontSize: 10, opacity: 0.7 }}>HOLES DONE</div>
              </div>
            </div>
            <div style={{ paddingTop: 12, borderTop: '1.5px dashed rgba(237,230,211,0.3)' }}>
              <div style={{ fontFamily: 'Anton', letterSpacing: '0.14em', fontSize: 10, opacity: 0.7, marginBottom: 6 }}>PLAYERS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {players.map((p) => (
                  <span key={p} style={{ background: 'rgba(237,230,211,0.12)', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button className="btn-accent" onClick={onResume} style={{ width: '100%', padding: '18px 20px', fontSize: 17, marginTop: 12 }}>
            RESUME ROUND →
          </button>
          {confirmingDiscard ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-ghost" onClick={onCancelDiscard} style={{ flex: 1, padding: '12px 16px', fontSize: 12 }}>CANCEL</button>
              <button className="btn-danger confirming" onClick={onDiscard} style={{ flex: 1, padding: '12px 16px', fontSize: 12 }}>TAP TO CONFIRM</button>
            </div>
          ) : (
            <button className="btn-danger" onClick={onDiscard} style={{ width: '100%', marginTop: 8, padding: '12px 20px', fontSize: 12 }}>
              DISCARD ROUND
            </button>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 32 }}>
          <div className="tag" style={{ marginBottom: 12 }}>Pick a course</div>

          <button onClick={() => onSelectCourse('black')} className="course-card-black" style={{ width: '100%', textAlign: 'left', padding: '22px 22px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'Anton', letterSpacing: '0.14em', fontSize: 11, opacity: 0.7, marginBottom: 6 }}>COURSE 01</div>
                <div className="font-display" style={{ fontSize: 44 }}>BLACK</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="font-mono" style={{ fontSize: 28 }}>45</div>
                <div style={{ fontFamily: 'Anton', letterSpacing: '0.14em', fontSize: 10, opacity: 0.7 }}>TOTAL PAR</div>
              </div>
            </div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1.5px dashed rgba(237,230,211,0.3)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ opacity: 0.7 }}>18 HOLES</span>
              <span style={{ opacity: 0.7 }}>TAP TO START →</span>
            </div>
          </button>

          <button onClick={() => onSelectCourse('white')} className="course-card-white" style={{ width: '100%', textAlign: 'left', padding: '22px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="tag" style={{ marginBottom: 6 }}>COURSE 02</div>
                <div className="font-display" style={{ fontSize: 44 }}>WHITE</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="font-mono" style={{ fontSize: 28 }}>44</div>
                <div className="tag">TOTAL PAR</div>
              </div>
            </div>
            <div className="divider-dashed" style={{ marginTop: 18, paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-soft)' }}>
              <span>18 HOLES</span>
              <span>TAP TO START →</span>
            </div>
          </button>
        </div>
      )}

      <button
        className="btn-ghost"
        onClick={onViewStats}
        style={{ width: '100%', marginTop: 22, padding: '14px 16px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>
          VIEW STATS
          {statsPlayerCount > 0 ? ` · ${statsPlayerCount} PLAYER${statsPlayerCount === 1 ? '' : 'S'}` : ''}
        </span>
        <span style={{ fontSize: 16 }}>→</span>
      </button>
    </div>
  );
}

// ============================================================
// PLAYERS
// ============================================================
function PlayersView({ course, players, newPlayerName, setNewPlayerName, suggestedPlayers, onAdd, onAddByName, onRemove, onStart, onBack }) {
  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '8px 14px', fontSize: 12 }}>← BACK</button>
        <div style={{ textAlign: 'right' }}>
          <div className="tag">Course</div>
          <div className="font-display" style={{ fontSize: 22 }}>{course.label}</div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="tag" style={{ marginBottom: 6 }}>Who's playing</div>
        <h2 className="font-display" style={{ fontSize: 48, margin: 0 }}>ADD PLAYERS.</h2>
      </div>

      <div style={{ marginTop: 22, display: 'flex', gap: 8 }}>
        <input
          className="input-text"
          type="text"
          placeholder="Player name"
          value={newPlayerName}
          onChange={(e) => setNewPlayerName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
          maxLength={20}
          autoCapitalize="words"
        />
        <button className="btn-primary" onClick={onAdd} disabled={!newPlayerName.trim()} style={{ padding: '0 18px', fontSize: 14, whiteSpace: 'nowrap' }}>
          + ADD
        </button>
      </div>

      {suggestedPlayers.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="tag" style={{ marginBottom: 8 }}>Quick add from your roster</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggestedPlayers.map((name) => (
              <button key={name} className="chip" onClick={() => onAddByName(name)}>
                <span className="chip-plus">+</span>{name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {players.length === 0 && (
          <div className="card-inset" style={{ padding: '24px 18px', textAlign: 'center' }}>
            <div className="tag" style={{ marginBottom: 6 }}>No players yet</div>
            <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Add at least one to start the round.</div>
          </div>
        )}
        {players.map((p, idx) => (
          <div key={p} className="player-row" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="font-display" style={{ fontSize: 22, color: 'var(--muted)', width: 26 }}>{String(idx + 1).padStart(2, '0')}</div>
            <div className="font-display" style={{ fontSize: 22, flex: 1, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</div>
            <button className="icon-btn danger" onClick={() => onRemove(p)} aria-label={`Remove ${p}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
            </button>
          </div>
        ))}
      </div>

      <button className="btn-accent" onClick={onStart} disabled={players.length === 0} style={{ width: '100%', padding: '18px 20px', fontSize: 17, marginTop: 18 }}>
        START ROUND →
      </button>
    </div>
  );
}

// ============================================================
// SCORING
// ============================================================
function ScoringView({
  course, players, scores, currentHole, holeCompleteness,
  totalForPlayer, versusPar, formatVs, vsColor, playedCountFor,
  onSetScore, onPrev, onNext, onGoToHole, onHome, onFinish,
}) {
  const par = course.pars[currentHole];
  const isLastHole = currentHole === 17;
  const allScored = players.every((p) => (scores[p] || [])[currentHole] != null);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn-ghost" onClick={onHome} style={{ padding: '8px 14px', fontSize: 12 }}>← HOME</button>
        <div style={{ textAlign: 'right' }}>
          <div className="tag">{course.label} COURSE</div>
          <div className="font-mono" style={{ fontSize: 13 }}>HOLE {currentHole + 1} OF 18</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 18, marginBottom: 22 }}>
        <div className="tag" style={{ marginBottom: 0 }}>HOLE</div>
        <div key={currentHole} className="font-display pulse-once" style={{ fontSize: 140, lineHeight: '1', margin: '0 auto', display: 'inline-block' }}>
          {String(currentHole + 1).padStart(2, '0')}
        </div>
        <div style={{ marginTop: -4 }}>
          <span className="tag-ink" style={{ fontSize: 14 }}>PAR {par}</span>
        </div>
      </div>

      <div>
        {players.map((p) => {
          const playerScore = (scores[p] || [])[currentHole];
          const total = totalForPlayer(p);
          const vs = versusPar(p);
          const played = playedCountFor(p);
          return (
            <div key={p} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div className="font-display" style={{ fontSize: 26, textTransform: 'uppercase', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="font-mono" style={{ fontSize: 22 }}>
                    {total}
                    {played > 0 && (
                      <span style={{ fontSize: 13, marginLeft: 6, color: vsColor(vs) }}>{formatVs(vs)}</span>
                    )}
                  </div>
                  <div className="tag" style={{ fontSize: 9 }}>{played}/18 PLAYED</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                {SCORE_OPTIONS.map((s) => {
                  const isSelected = playerScore === s;
                  const isAce = s === 1 && isSelected;
                  return (
                    <button
                      key={s}
                      className={`score-btn ${isSelected ? (isAce ? 'ace' : 'selected') : ''}`}
                      onClick={() => onSetScore(p, s)}
                      aria-label={`Score ${s} for ${p}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn-ghost" onClick={onPrev} disabled={currentHole === 0} style={{ flex: 1, padding: '14px 16px', fontSize: 14 }}>◀ PREV</button>
        {isLastHole ? (
          <button className="btn-accent" onClick={onFinish} style={{ flex: 2, padding: '14px 16px', fontSize: 15 }}>FINISH ROUND ★</button>
        ) : (
          <button className={allScored ? 'btn-accent' : 'btn-primary'} onClick={onNext} style={{ flex: 2, padding: '14px 16px', fontSize: 15 }}>NEXT HOLE ▶</button>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span className="tag">Round progress</span>
          <span className="font-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>
            {holeCompleteness.filter((c) => c === 'full').length}/18
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, padding: '8px 4px' }}>
          {holeCompleteness.map((c, i) => (
            <button
              key={i}
              className={`hole-dot ${i === currentHole ? 'current' : c === 'full' ? 'filled' : c === 'partial' ? 'partial' : ''}`}
              onClick={() => onGoToHole(i)}
              aria-label={`Go to hole ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FINISHED
// ============================================================
function FinishedView({ course, leaderboard, scores, formatVs, vsColor, showSavedPill, onPlayAgain, onNewGame, onBackToScoring }) {
  const winner = leaderboard[0];
  const winnerLowest = leaderboard.length > 1
    ? leaderboard.filter((p) => p.total === winner.total)
    : [winner];

  return (
    <div className="fade-in">
      <div style={{ paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div className="tag">{course.label} COURSE · COMPLETE</div>
          {showSavedPill && (
            <span className="saved-pill fade-in">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              SAVED TO STATS
            </span>
          )}
        </div>
        <h1 className="font-display" style={{ fontSize: 64, margin: 0 }}>FINAL.</h1>
      </div>

      <div className="card" style={{ padding: 20, marginTop: 20, background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'Anton', letterSpacing: '0.14em', fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
              {winnerLowest.length > 1 ? 'TIED FOR THE WIN' : 'WINNER'}
            </div>
            <div className="font-display" style={{ fontSize: 36, textTransform: 'uppercase', lineHeight: 1 }}>
              {winnerLowest.map((w) => w.name).join(' / ')}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="font-mono" style={{ fontSize: 40, lineHeight: 1 }}>{winner.total}</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{formatVs(winner.vs)}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="tag" style={{ marginBottom: 8 }}>LEADERBOARD</div>
        {leaderboard.map((p, i) => (
          <div key={p.name} className="card" style={{ padding: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className={`rank-badge rank-${i === 0 ? '1' : i === 1 ? '2' : i === 2 ? '3' : 'other'}`}>{i + 1}</div>
            <div className="font-display" style={{ fontSize: 22, textTransform: 'uppercase', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
            <div style={{ textAlign: 'right' }}>
              <div className="font-mono" style={{ fontSize: 20 }}>{p.total}</div>
              <div className="font-mono" style={{ fontSize: 11, color: vsColor(p.vs) }}>{formatVs(p.vs)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="tag" style={{ marginBottom: 8 }}>SCORECARD</div>
        <div className="card" style={{ padding: 8, overflowX: 'auto' }}>
          <table className="scorecard-table">
            <thead>
              <tr>
                <th className="name-col">HOLE</th>
                {Array.from({ length: 18 }, (_, i) => <th key={i}>{i + 1}</th>)}
                <th className="total-col">TOT</th>
              </tr>
              <tr className="par-row">
                <td className="name-col">PAR</td>
                {course.pars.map((p, i) => <td key={i}>{p}</td>)}
                <td className="total-col">{course.total}</td>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(({ name }) => (
                <tr key={name}>
                  <td className="name-col">{name}</td>
                  {(scores[name] || []).map((s, i) => (
                    <td key={i} style={{
                      color: s == null ? 'var(--muted)' : s < course.pars[i] ? 'var(--green)' : s > course.pars[i] ? 'var(--red)' : 'var(--ink)',
                      fontWeight: s != null && s !== course.pars[i] ? 700 : 400,
                    }}>
                      {s == null ? '–' : s}
                    </td>
                  ))}
                  <td className="total-col">{sumOfArr(scores[name])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 22, display: 'flex', gap: 8 }}>
        <button className="btn-ghost" onClick={onBackToScoring} style={{ flex: 1, padding: '14px 16px', fontSize: 12 }}>← REVIEW</button>
        <button className="btn-primary" onClick={onPlayAgain} style={{ flex: 1, padding: '14px 16px', fontSize: 13 }}>PLAY AGAIN</button>
        <button className="btn-accent" onClick={onNewGame} style={{ flex: 1, padding: '14px 16px', fontSize: 13 }}>NEW GAME ★</button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
        "Play again" keeps same players & course. "New game" returns home.
      </p>
    </div>
  );
}

// ============================================================
// STATS
// ============================================================
function StatsView({ playerStats, confirmingDelete, onDeletePlayer, onDeleteAll, onCancelConfirm, onBack }) {
  const names = Object.keys(playerStats);
  const totalRoundsTracked = names.reduce((a, n) => a + (playerStats[n].rounds?.length || 0), 0);
  const totalAces = names.reduce((a, n) => a + computePlayerStats(playerStats[n]).aces, 0);

  const sortedNames = [...names].sort(
    (a, b) => (playerStats[b].rounds?.length || 0) - (playerStats[a].rounds?.length || 0)
  );

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '8px 14px', fontSize: 12 }}>← HOME</button>
        <div className="tag">All time</div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="tag" style={{ marginBottom: 6 }}>Career stats</div>
        <h1 className="font-display" style={{ fontSize: 64, margin: 0 }}>HALL<br/>OF FAME.</h1>
      </div>

      {names.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
          <div className="card" style={{ flex: 1, padding: 14, textAlign: 'center' }}>
            <div className="font-display" style={{ fontSize: 36 }}>{names.length}</div>
            <div className="tag">PLAYER{names.length === 1 ? '' : 'S'}</div>
          </div>
          <div className="card" style={{ flex: 1, padding: 14, textAlign: 'center' }}>
            <div className="font-display" style={{ fontSize: 36 }}>{totalRoundsTracked}</div>
            <div className="tag">ROUND{totalRoundsTracked === 1 ? '' : 'S'}</div>
          </div>
          <div className="card" style={{ flex: 1, padding: 14, textAlign: 'center', background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }}>
            <div className="font-display" style={{ fontSize: 36 }}>{totalAces}</div>
            <div style={{ fontFamily: 'Anton', letterSpacing: '0.14em', fontSize: 11, textTransform: 'uppercase', opacity: 0.9 }}>
              ACE{totalAces === 1 ? '' : 'S'}
            </div>
          </div>
        </div>
      )}

      {names.length === 0 && (
        <div className="card-inset" style={{ padding: '32px 20px', textAlign: 'center', marginTop: 22 }}>
          <div className="font-display" style={{ fontSize: 36, color: 'var(--muted)' }}>NO STATS YET.</div>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 12, marginBottom: 0 }}>
            Finish a round and player stats will start showing up here.
          </p>
        </div>
      )}

      {sortedNames.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="tag" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>By player</span>
            <span style={{ color: 'var(--muted)' }}>Tap × to remove</span>
          </div>
          {sortedNames.map((name) => {
            const stats = computePlayerStats(playerStats[name]);
            const isConfirming = confirmingDelete === name;
            return (
              <div key={name} className="card" style={{ padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="font-display" style={{ fontSize: 28, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {stats.totalRounds} ROUND{stats.totalRounds === 1 ? '' : 'S'}
                      {stats.aces > 0 && (
                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}> · {stats.aces} ACE{stats.aces === 1 ? '' : 'S'} ★</span>
                      )}
                    </div>
                  </div>
                  {isConfirming ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="icon-btn" onClick={onCancelConfirm} aria-label="Cancel">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
                      </button>
                      <button
                        className="icon-btn confirming"
                        onClick={() => onDeletePlayer(name)}
                        aria-label="Confirm delete"
                        style={{ width: 'auto', padding: '0 12px', fontFamily: 'Anton', fontSize: 11, letterSpacing: '0.1em' }}
                      >
                        DELETE
                      </button>
                    </div>
                  ) : (
                    <button className="icon-btn danger" onClick={() => onDeletePlayer(name)} aria-label={`Delete ${name}'s stats`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
                    </button>
                  )}
                </div>

                <div className="divider-dashed" style={{ paddingTop: 10, display: 'flex', gap: 10 }}>
                  <CourseStatCol label="BLACK" stats={stats.byCourse.black} />
                  <div style={{ width: 1, background: 'var(--border)' }} />
                  <CourseStatCol label="WHITE" stats={stats.byCourse.white} />
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 18 }}>
            {confirmingDelete === 'all' ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" onClick={onCancelConfirm} style={{ flex: 1, padding: '14px 16px', fontSize: 13 }}>CANCEL</button>
                <button className="btn-danger confirming" onClick={onDeleteAll} style={{ flex: 2, padding: '14px 16px', fontSize: 13 }}>
                  TAP AGAIN TO DELETE ALL STATS
                </button>
              </div>
            ) : (
              <button className="btn-danger" onClick={onDeleteAll} style={{ width: '100%', padding: '14px 16px', fontSize: 13 }}>
                DELETE ALL STATS
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CourseStatCol({ label, stats }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="tag" style={{ fontSize: 10, marginBottom: 6, color: 'var(--ink-soft)' }}>
        {label} COURSE
      </div>
      {!stats || stats.completed === 0 ? (
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 13, color: 'var(--muted)' }}>—</div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
            <span className="font-mono" style={{ fontSize: 22, lineHeight: 1 }}>{stats.best}</span>
            <span style={{
              fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 12,
              color: stats.bestVs < 0 ? 'var(--green)' : stats.bestVs > 0 ? 'var(--red)' : 'var(--ink-soft)',
            }}>
              {stats.bestVs === 0 ? 'E' : stats.bestVs > 0 ? `+${stats.bestVs}` : stats.bestVs}
            </span>
          </div>
          <div style={{ fontFamily: 'Anton', fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase' }}>
            BEST · AVG {stats.avg}
          </div>
        </div>
      )}
    </div>
  );
}

function sumOfArr(arr) {
  if (!arr) return 0;
  return arr.reduce((acc, s) => acc + (s || 0), 0);
}
