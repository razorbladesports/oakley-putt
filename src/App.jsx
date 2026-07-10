import { useState, useEffect, useMemo, useRef } from 'react';

/* ============================================================
   Oakley Putt — mobile-first redesign
   Single-file React app. App owns all state; views are
   presentational. Storage goes through window.storage (Claude
   persistent KV) via one seam; swap to browser storage later.
   ============================================================ */

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

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const GAME_KEY = "oakley_putt_game_v2";
const STATS_KEY = "oakley_putt_stats_v1";
const DEMO_UNLOCK_KEY = "oakley_demo_unlocked_v1";
const DEMO_LOCK_ENABLED = import.meta.env.VITE_DEMO_LOCK_ENABLED === "true";
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "OAKLEY2026";

/* ---------- storage seam ----------
   Single place all persistence flows through. Backed by
   localStorage today; swap the three methods for IndexedDB later
   without touching any call site. Every call is guarded so it
   degrades to a no-op if storage is unavailable/blocked. */
const storage = {
  get(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        const v = localStorage.getItem(key);
        return v != null ? JSON.parse(v) : null;
      }
    } catch {
      /* missing key, blocked storage, or parse failure => no data */
    }
    return null;
  },
  set(key, value) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      /* storage full or blocked (e.g. private mode) => skip persist */
    }
  },
  del(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      /* storage unavailable => nothing to remove */
    }
  },
};

/* ---------- pure helpers ---------- */
const generateRoundId = () =>
  `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const sumOfArr = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

/* ---------- stats leaderboard helpers ---------- */
const formatStatVs = (v) => (v > 0 ? `+${v}` : v === 0 ? "E" : `${v}`);

// completed rounds for a profile matching the course filter ('all'|'black'|'white')
function getFilteredRounds(profile, filter) {
  return profile.rounds.filter(
    (r) => r.complete && (filter === "all" || r.course === filter)
  );
}

// one ranked row per player who has >=1 completed round for the filter
function buildStatsLeaderboard(playerStats, filter) {
  const rows = [];
  Object.keys(playerStats).forEach((name) => {
    const rounds = getFilteredRounds(playerStats[name], filter);
    if (!rounds.length) return;
    let bestR = rounds[0];
    rounds.forEach((r) => {
      if (r.total < bestR.total || (r.total === bestR.total && r.vsPar < bestR.vsPar)) {
        bestR = r;
      }
    });
    const avg = Math.round((rounds.reduce((a, r) => a + r.total, 0) / rounds.length) * 10) / 10;
    const avgVs = Math.round((rounds.reduce((a, r) => a + r.vsPar, 0) / rounds.length) * 10) / 10;
    const aces = rounds.reduce((a, r) => a + r.scores.filter((s) => s === 1).length, 0);
    rows.push({
      name,
      best: bestR.total,
      bestVs: bestR.vsPar,
      avg,
      avgVs,
      rounds: rounds.length,
      aces,
    });
  });
  rows.sort(
    (a, b) =>
      a.best - b.best ||
      a.bestVs - b.bestVs ||
      a.avg - b.avg ||
      b.rounds - a.rounds ||
      a.name.localeCompare(b.name)
  );
  return rows;
}

/* ============================================================
   ROOT
   ============================================================ */
export default function App() {
  // active round
  const [view, setView] = useState("home");
  const [courseId, setCourseId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [currentHole, setCurrentHole] = useState(0);
  const [roundId, setRoundId] = useState(null);
  const [activePlayer, setActivePlayer] = useState(null); // who we're scoring now
  const advanceTimer = useRef(null);
  const clearAdvanceTimer = () => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };

  // persistent stats
  const [playerStats, setPlayerStats] = useState({});

  // lightweight demo gate (only enabled by Vercel env vars)
  const [demoUnlocked, setDemoUnlocked] = useState(
    () => !DEMO_LOCK_ENABLED || storage.get(DEMO_UNLOCK_KEY) === true
  );

  // ui ephemeral
  const [newPlayerName, setNewPlayerName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [showSavedPill, setShowSavedPill] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [pendingAdvance, setPendingAdvance] = useState(null); // null | 'next' | 'finish'

  const course = courseId ? COURSES[courseId] : null;

  /* ---------- load (hydrate once from storage on mount) ---------- */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const data = storage.get(GAME_KEY);
    if (data && data.players && data.players.length > 0 && data.courseId) {
      setCourseId(data.courseId ?? null);
      setPlayers(data.players ?? []);
      setScores(data.scores ?? {});
      setCurrentHole(data.currentHole ?? 0);
      setRoundId(data.roundId ?? generateRoundId());
      // a reload mid-scoring drops the user at home (resume card)
      if (data.view === "scoring") setView("home");
      else if (["finished", "players"].includes(data.view)) setView(data.view);
      else setView("home");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const data = storage.get(STATS_KEY);
    if (data && typeof data === "object") setPlayerStats(data);
    setStatsLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // best-effort durability nudge (helps Chrome / installed PWA)
  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }, []);

  /* ---------- persist ---------- */
  useEffect(() => {
    if (!loaded) return;
    storage.set(GAME_KEY, { view, courseId, players, scores, currentHole, roundId });
  }, [view, courseId, players, scores, currentHole, roundId, loaded]);

  useEffect(() => {
    if (!statsLoaded) return;
    storage.set(STATS_KEY, playerStats);
  }, [playerStats, statsLoaded]);

  /* ---------- save to stats on finish (dedup by roundId) ---------- */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (view !== "finished") return;
    if (!course || !roundId || players.length === 0) return;
    const date = new Date().toISOString();
    setPlayerStats((prev) => {
      const next = { ...prev };
      players.forEach((p) => {
        const profile = next[p]
          ? { ...next[p], rounds: [...next[p].rounds] }
          : { displayName: p, rounds: [] };
        const pScores = scores[p] || Array(18).fill(null);
        const played = pScores.filter((s) => s !== null);
        const total = sumOfArr(pScores);
        const parPlayed = pScores.reduce(
          (a, s, i) => a + (s !== null ? course.pars[i] : 0),
          0
        );
        const record = {
          roundId,
          course: course.id,
          date,
          total,
          vsPar: total - parPlayed,
          scores: [...pScores],
          coursePar: course.total,
          complete: played.length === 18,
        };
        profile.rounds = profile.rounds.filter((r) => r.roundId !== roundId);
        profile.rounds.push(record);
        next[p] = profile;
      });
      return next;
    });
    setShowSavedPill(true);
    const t = setTimeout(() => setShowSavedPill(false), 2600);
    return () => clearTimeout(t);
    // deps intentionally [view, roundId]: dedup-by-roundId handles
    // Review -> re-finish; a fresh roundId (Play Again) re-triggers save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, roundId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ---------- score computation ---------- */
  const totalForPlayer = (name) => sumOfArr(scores[name] || []);
  const parPlayedFor = (name) =>
    (scores[name] || []).reduce(
      (a, s, i) => a + (s !== null ? course.pars[i] : 0),
      0
    );
  const playedCountFor = (name) =>
    (scores[name] || []).filter((s) => s !== null).length;
  const versusPar = (name) => totalForPlayer(name) - parPlayedFor(name);
  const formatVs = (v) => (v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`);
  const vsColor = (v) =>
    v < 0 ? "var(--green)" : v > 0 ? "var(--red)" : "var(--ink)";

  const holeCompleteness = useMemo(() => {
    if (!players.length) return Array(18).fill("empty");
    return Array.from({ length: 18 }, (_, h) => {
      const vals = players.map((p) => (scores[p] || [])[h]);
      const scored = vals.filter((v) => v !== null && v !== undefined).length;
      if (scored === 0) return "empty";
      if (scored === players.length) return "full";
      return "partial";
    });
  }, [players, scores]);

  const leaderboard = useMemo(() => {
    const rows = players.map((p) => ({
      name: p,
      total: totalForPlayer(p),
      vs: versusPar(p),
      played: playedCountFor(p),
    }));
    rows.sort((a, b) => a.total - b.total);
    // assign competition ranks (ties share a rank)
    let lastTotal = null;
    let lastRank = 0;
    rows.forEach((r, i) => {
      if (r.total !== lastTotal) {
        lastRank = i + 1;
        lastTotal = r.total;
      }
      r.rank = lastRank;
    });
    return rows;
    // score helpers close over players/scores, which are the real deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, scores]);

  const suggestedPlayers = useMemo(() => {
    const lower = players.map((p) => p.toLowerCase());
    return Object.keys(playerStats)
      .filter((n) => !lower.includes(n.toLowerCase()))
      .sort(
        (a, b) =>
          (playerStats[b]?.rounds.length || 0) -
          (playerStats[a]?.rounds.length || 0)
      )
      .slice(0, 12);
  }, [playerStats, players]);

  const hasActiveRound =
    !!courseId && players.length > 0 && roundId && view !== "finished";

  const currentHoleScored = players.filter(
    (p) => (scores[p] || [])[currentHole] != null
  ).length;
  const holeComplete = players.length > 0 && currentHoleScored === players.length;
  const unscoredThisHole = players.length - currentHoleScored;

  /* ---------- actions ---------- */
  const selectCourse = (id) => {
    setCourseId(id);
    setPlayers([]);
    setScores({});
    setCurrentHole(0);
    setRoundId(null);
    setView("players");
  };

  const addPlayer = (raw) => {
    const name = (raw ?? newPlayerName).trim();
    if (!name) return;
    if (players.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setNewPlayerName("");
      return;
    }
    setPlayers((p) => [...p, name]);
    setScores((s) => ({ ...s, [name]: Array(18).fill(null) }));
    setNewPlayerName("");
  };

  const removePlayer = (name) => {
    setPlayers((p) => p.filter((x) => x !== name));
    setScores((s) => {
      const n = { ...s };
      delete n[name];
      return n;
    });
  };

  const startRound = () => {
    if (!players.length) return;
    setScores((s) => {
      const n = { ...s };
      players.forEach((p) => {
        if (!n[p]) n[p] = Array(18).fill(null);
      });
      return n;
    });
    setCurrentHole(0);
    setActivePlayer(players[0] || null);
    setRoundId(generateRoundId());
    setView("scoring");
  };

  // first player with no score on a hole (falls back to first player)
  const firstUnscoredOnHole = (holeIdx) =>
    players.find((p) => (scores[p] || [])[holeIdx] == null) || players[0] || null;

  const setScore = (name, value) => {
    clearAdvanceTimer();
    const prev = (scores[name] || [])[currentHole];
    const erasing = prev === value;
    setScores((s) => {
      const arr = [...(s[name] || Array(18).fill(null))];
      arr[currentHole] = arr[currentHole] === value ? null : value; // re-tap erases
      return { ...s, [name]: arr };
    });
    if (erasing) return;
    // find the next player (after this one) who still needs a score
    const idx = players.indexOf(name);
    let nextP = null;
    for (let i = 1; i <= players.length; i++) {
      const cand = players[(idx + i) % players.length];
      if (cand === name) continue;
      if ((scores[cand] || [])[currentHole] == null) {
        nextP = cand;
        break;
      }
    }
    if (nextP) {
      setActivePlayer(nextP);
    } else if (prev == null && currentHole < 17) {
      // this entry just completed the hole -> auto-advance after a beat
      const target = currentHole + 1;
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        setPendingAdvance(null);
        setCurrentHole(target);
        setActivePlayer(firstUnscoredOnHole(target));
      }, 650);
    }
  };

  const selectActivePlayer = (name) => {
    clearAdvanceTimer();
    setActivePlayer(name);
  };

  const jumpToHole = (h) => {
    clearAdvanceTimer();
    setCurrentHole(h);
    setActivePlayer(firstUnscoredOnHole(h));
    setPendingAdvance(null);
  };
  const prevHole = () => {
    clearAdvanceTimer();
    setPendingAdvance(null);
    const h = Math.max(0, currentHole - 1);
    setCurrentHole(h);
    setActivePlayer(firstUnscoredOnHole(h));
  };

  const goNext = () => {
    clearAdvanceTimer();
    setPendingAdvance(null);
    if (currentHole >= 17) setView("finished");
    else {
      const h = currentHole + 1;
      setCurrentHole(h);
      setActivePlayer(firstUnscoredOnHole(h));
    }
  };
  const tryNext = () => {
    if (unscoredThisHole > 0 && pendingAdvance == null) {
      setPendingAdvance(currentHole >= 17 ? "finish" : "next");
      return;
    }
    goNext();
  };

  const exitToHome = () => {
    clearAdvanceTimer();
    setLeaderboardOpen(false);
    setPendingAdvance(null);
    setView("home");
  };
  const resumeRound = () => {
    setActivePlayer(firstUnscoredOnHole(currentHole));
    setView("scoring");
  };

  const discardRound = () => {
    setConfirmingDiscard(false);
    fullReset();
  };

  const playAgain = () => {
    const fresh = {};
    players.forEach((p) => (fresh[p] = Array(18).fill(null)));
    setScores(fresh);
    setCurrentHole(0);
    setActivePlayer(players[0] || null);
    setRoundId(generateRoundId());
    setShowSavedPill(false);
    setView("scoring");
  };

  const fullReset = () => {
    setCourseId(null);
    setPlayers([]);
    setScores({});
    setCurrentHole(0);
    setRoundId(null);
    setShowSavedPill(false);
    storage.del(GAME_KEY);
    setView("home");
  };

  const reviewRound = () => {
    setCurrentHole(17);
    setView("scoring");
  };

  const deletePlayerStats = (name) => {
    setPlayerStats((s) => {
      const n = { ...s };
      delete n[name];
      return n;
    });
    setConfirmingDelete(null);
  };
  const deleteAllStats = () => {
    setPlayerStats({});
    setConfirmingDelete(null);
  };

  const unlockDemo = (code) => {
    if (!DEMO_LOCK_ENABLED) return true;
    if (code.trim() !== DEMO_PASSWORD) return false;
    storage.set(DEMO_UNLOCK_KEY, true);
    setDemoUnlocked(true);
    return true;
  };

  if (DEMO_LOCK_ENABLED && !demoUnlocked) {
    return (
      <div className="app-root">
        <style>{STYLES}</style>
        <DemoLockScreen onUnlock={unlockDemo} />
      </div>
    );
  }

  if (!loaded)
    return (
      <div className="app-root">
        <style>{STYLES}</style>
        <div className="boot">
          <span className="font-display boot-mark">Oakley Greens</span>
        </div>
      </div>
    );

  const shared = {
    course,
    COURSES,
    players,
    scores,
    currentHole,
    setScore,
    totalForPlayer,
    parPlayedFor,
    playedCountFor,
    versusPar,
    formatVs,
    vsColor,
    leaderboard,
    holeCompleteness,
    playerStats,
  };

  return (
    <div className="app-root">
      <style>{STYLES}</style>

      {view === "home" && (
        <HomeView
          {...shared}
          hasActiveRound={hasActiveRound}
          courseId={courseId}
          roundId={roundId}
          onSelectCourse={selectCourse}
          onResume={resumeRound}
          onViewStats={() => setView("stats")}
          confirmingDiscard={confirmingDiscard}
          setConfirmingDiscard={setConfirmingDiscard}
          onDiscard={discardRound}
        />
      )}

      {view === "players" && (
        <PlayersView
          {...shared}
          newPlayerName={newPlayerName}
          setNewPlayerName={setNewPlayerName}
          onAdd={addPlayer}
          onRemove={removePlayer}
          suggestedPlayers={suggestedPlayers}
          onStart={startRound}
          onBack={() => setView("home")}
        />
      )}

      {view === "scoring" && (
        <ScoringView
          {...shared}
          holeComplete={holeComplete}
          unscoredThisHole={unscoredThisHole}
          activePlayer={activePlayer}
          onSelectPlayer={selectActivePlayer}
          onScore={setScore}
          onPrev={prevHole}
          onNext={tryNext}
          onJump={jumpToHole}
          onHome={exitToHome}
          onOpenLeaderboard={() => setLeaderboardOpen(true)}
          pendingAdvance={pendingAdvance}
          onCancelAdvance={() => setPendingAdvance(null)}
          onConfirmAdvance={goNext}
        />
      )}

      {view === "finished" && (
        <FinishedView
          {...shared}
          showSavedPill={showSavedPill}
          onReview={reviewRound}
          onPlayAgain={playAgain}
          onNewGame={fullReset}
        />
      )}

      {view === "stats" && (
        <StatsView
          {...shared}
          onBack={() => setView("home")}
          confirmingDelete={confirmingDelete}
          setConfirmingDelete={setConfirmingDelete}
          onDeletePlayer={deletePlayerStats}
          onDeleteAll={deleteAllStats}
        />
      )}

      {leaderboardOpen && (
        <LeaderboardSheet
          leaderboard={leaderboard}
          formatVs={formatVs}
          vsColor={vsColor}
          onClose={() => setLeaderboardOpen(false)}
        />
      )}
    </div>
  );
}

/* ============================================================
   DEMO LOCK
   ============================================================ */
function DemoLockScreen({ onUnlock }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const ok = onUnlock(code);
    setError(!ok);
    if (!ok) setCode("");
  };

  return (
    <div className="screen demo-screen">
      <div className="demo-lock-shell pad">
        <div className="demo-lock-card">
          <p className="venue-kicker font-mono">PRIVATE DEMO</p>
          <h1 className="demo-lock-title">Oakley Greens</h1>
          <p className="demo-lock-sub">
            Enter the demo code to preview the mobile scorecard.
          </p>

          <form className="demo-lock-form" onSubmit={submit}>
            <input
              className={`demo-code-input ${error ? "demo-error" : ""}`}
              type="password"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              placeholder="Demo code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(false);
              }}
              aria-label="Demo code"
            />
            {error && (
              <p className="demo-error-text">That code did not work. Try again.</p>
            )}
            <button className="btn btn-accent big" type="submit">
              ENTER DEMO →
            </button>
          </form>

          <p className="demo-lock-note">
            Scores and stats still save only on this device once unlocked.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   HOME
   ============================================================ */
function HomeView({
  hasActiveRound,
  courseId,
  COURSES,
  players,
  currentHole,
  holeCompleteness,
  onSelectCourse,
  onResume,
  onViewStats,
  confirmingDiscard,
  setConfirmingDiscard,
  onDiscard,
}) {
  const done = holeCompleteness.filter((c) => c === "full").length;
  return (
    <div className="screen">
      <div className="scroll pad">
        <header className="home-head">
          <div className="brand-lockup">
            <span className="font-brand brand-script">Oakley Greens</span>
            <span className="brand-kicker font-mono">GOLF & GATHER</span>
          </div>
          <p className="home-slogan font-display">All the fun. All the time.</p>
          <p className="lede">
            Add players, tap to score, and watch the leaderboard update live.
          </p>
          <div className="venue-strip font-mono">
            <span>OAKLEY STATION</span>
            <span>36 HOLES</span>
            <span>2 COURSES</span>
          </div>
        </header>

        {hasActiveRound ? (
          <>
            <div className="card card-ink resume-card">
              <div className="resume-top">
                <span className="tag tag-onink">ROUND IN PROGRESS</span>
                <span className="font-mono resume-hole">
                  HOLE {currentHole + 1}
                </span>
              </div>
              <div className="resume-course font-display">
                {COURSES[courseId].label} COURSE
              </div>
              <div className="chips">
                {players.map((p) => (
                  <span key={p} className="chip chip-onink">
                    {p}
                  </span>
                ))}
              </div>
              <div className="resume-meta font-mono">
                {done}/18 HOLES COMPLETE · {players.length} PLAYER
                {players.length > 1 ? "S" : ""}
              </div>
            </div>

            <button className="btn btn-accent big" onClick={onResume}>
              RESUME ROUND →
            </button>

            {!confirmingDiscard ? (
              <button
                className="btn btn-ghost"
                onClick={() => setConfirmingDiscard(true)}
              >
                Discard round
              </button>
            ) : (
              <div className="confirm-row">
                <button
                  className="btn btn-ghost"
                  onClick={() => setConfirmingDiscard(false)}
                >
                  Keep it
                </button>
                <button className="btn btn-danger" onClick={onDiscard}>
                  Discard round
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="section-eyebrow font-mono">PICK A COURSE TO START</p>
            <button
              className="course-card course-black"
              onClick={() => onSelectCourse("black")}
            >
              <span className="cc-top">
                <span className="font-display course-name">BLACK</span>
                <span className="cc-arrow">→</span>
              </span>
              <span className="font-mono course-par">
                PAR {COURSES.black.total} · 18 HOLES
              </span>
            </button>
            <button
              className="course-card course-white"
              onClick={() => onSelectCourse("white")}
            >
              <span className="cc-top">
                <span className="font-display course-name">WHITE</span>
                <span className="cc-arrow">→</span>
              </span>
              <span className="font-mono course-par">
                PAR {COURSES.white.total} · 18 HOLES
              </span>
            </button>

            <p className="section-eyebrow font-mono">HOW IT WORKS</p>
            <div className="how-grid">
              <div className="how-step">
                <span className="how-step-num font-mono">01</span>
                <span className="how-text">
                  <b>Pick a course</b> and add your group
                </span>
              </div>
              <div className="how-step">
                <span className="how-step-num font-mono">02</span>
                <span className="how-text">
                  <b>Tap in scores</b> hole by hole — totals update automatically
                </span>
              </div>
              <div className="how-step">
                <span className="how-step-num font-mono">03</span>
                <span className="how-text">
                  <b>Watch the leaderboard</b> and settle it live
                </span>
              </div>
              <div className="how-step">
                <span className="how-step-num font-mono">04</span>
                <span className="how-text">
                  <b>Save local records</b>, best rounds, and aces for next time
                </span>
              </div>
            </div>

            <button className="btn btn-stats" onClick={onViewStats}>
              VIEW LOCAL LEADERBOARD
            </button>
          </>
        )}

        <p className="privacy-note">
          Saved only on this phone. No account, no sign-up — your scores stay
          with you.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   PLAYERS
   ============================================================ */
function PlayersView({
  course,
  players,
  newPlayerName,
  setNewPlayerName,
  onAdd,
  onRemove,
  suggestedPlayers,
  onStart,
  onBack,
}) {
  const inputRef = useRef(null);
  return (
    <div className="screen">
      <header className="topbar">
        <button className="nav-pill" onClick={onBack}>
          ← BACK
        </button>
        <span className="topbar-title font-display">WHO'S PLAYING?</span>
        {course ? (
          <span className={`topbar-course font-mono ${course.id === "black" ? "topbar-course-black" : "topbar-course-white"}`}>
            {course.label}
          </span>
        ) : (
          <span className="topbar-spacer" />
        )}
      </header>

      <div className="scroll pad">
        <div className="add-row">
          <input
            ref={inputRef}
            className="text-input"
            placeholder="Add a player"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onAdd();
                inputRef.current && inputRef.current.focus();
              }
            }}
            enterKeyHint="done"
          />
          <button
            className="btn btn-ink add-btn"
            onClick={() => {
              onAdd();
              inputRef.current && inputRef.current.focus();
            }}
          >
            ADD
          </button>
        </div>

        {suggestedPlayers.length > 0 && (
          <div className="roster">
            <p className="section-eyebrow font-mono">ADD A REGULAR</p>
            <div className="chips">
              {suggestedPlayers.map((n) => (
                <button key={n} className="chip chip-btn" onClick={() => onAdd(n)}>
                  + {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {players.length === 0 ? (
          <div className="empty">
            <p className="empty-title font-display">NO PLAYERS YET</p>
            <p className="empty-sub">
              Add everyone in your group. You can score them all on each hole.
            </p>
          </div>
        ) : (
          <ul className="player-list">
            {players.map((p, i) => (
              <li key={p} className="player-item">
                <span className="player-num font-mono">{i + 1}</span>
                <span className="player-name">{p}</span>
                <button
                  className="remove-x"
                  onClick={() => onRemove(p)}
                  aria-label={`Remove ${p}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="footer pad-h">
        <button
          className="btn btn-accent big"
          disabled={players.length === 0}
          onClick={onStart}
        >
          {players.length === 0
            ? "ADD A PLAYER TO START"
            : `START ROUND · ${players.length} PLAYER${
                players.length > 1 ? "S" : ""
              }`}
        </button>
      </footer>
    </div>
  );
}

/* ============================================================
   SCORING  (the core loop)
   ============================================================ */
function ScoringView({
  course,
  players,
  scores,
  currentHole,
  activePlayer,
  onSelectPlayer,
  onScore,
  totalForPlayer,
  versusPar,
  formatVs,
  vsColor,
  holeCompleteness,
  holeComplete,
  unscoredThisHole,
  leaderboard,
  onPrev,
  onNext,
  onJump,
  onHome,
  onOpenLeaderboard,
  pendingAdvance,
  onCancelAdvance,
  onConfirmAdvance,
}) {
  const par = course.pars[currentHole];
  const leader = leaderboard[0];
  const isLast = currentHole >= 17;
  const scoredCount = players.length - unscoredThisHole;

  // resolve the focused player (fallback if active is stale)
  const active =
    activePlayer && players.includes(activePlayer)
      ? activePlayer
      : players.find((p) => (scores[p] || [])[currentHole] == null) ||
        players[0];
  const activeVal = (scores[active] || [])[currentHole];
  const activeVs = versusPar(active);

  return (
    <div className="screen scoring">
      {/* compact sticky header */}
      <header className="score-head">
        <div className="score-head-row">
          <button className="nav-pill" onClick={onHome}>
            ← HOME
          </button>
          <div
            className={`course-badge ${
              course.id === "black" ? "badge-black" : "badge-white"
            }`}
          >
            <span className="course-badge-name font-display">
              {course.label} COURSE
            </span>
            <span className="course-badge-sub font-mono">
              Hole {currentHole + 1} of 18 · Par {par}
            </span>
          </div>
        </div>
        <div className="hole-line" key={currentHole}>
          <span className="font-display hole-big">HOLE {currentHole + 1}</span>
          <span className="par-badge font-mono">PAR {par}</span>
          <span className="hole-progress font-mono">
            {scoredCount}/{players.length} in
          </span>
        </div>
      </header>

      <div className="scroll score-scroll">
        {/* player selector strip */}
        <div className="psel-wrap">
          <div className="psel">
            {players.map((p, i) => {
              const v = (scores[p] || [])[currentHole];
              const isActive = p === active;
              return (
                <button
                  key={p}
                  className={`pchip ${isActive ? "pchip-active" : ""} ${
                    v != null ? "pchip-done" : ""
                  }`}
                  onClick={() => onSelectPlayer(p)}
                >
                  <span className="pchip-num font-mono">{i + 1}</span>
                  <span className="pchip-name">{p}</span>
                  <span className="pchip-val font-mono">
                    {v != null ? v : "–"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* single focused scoring card */}
        <div className="focus-card" key={active + currentHole}>
          <div className="focus-top">
            <span className="focus-eyebrow font-mono">NOW SCORING</span>
            <span className="focus-totals">
              <span className="font-mono focus-total">
                {totalForPlayer(active)}
              </span>
              <span
                className="font-mono focus-vs"
                style={{ color: vsColor(activeVs) }}
              >
                {formatVs(activeVs)}
              </span>
            </span>
          </div>
          <div className="focus-name font-display">{active}</div>

          <div className="score-grid focus-grid">
            {SCORE_OPTIONS.map((n) => {
              const selected = activeVal === n;
              return (
                <button
                  key={n}
                  className={`score-btn ${
                    selected ? (n === 1 ? "sel-ace" : "sel") : ""
                  }`}
                  onClick={() => onScore(active, n)}
                >
                  {n}
                </button>
              );
            })}
          </div>

          <div className="focus-hint">
            {holeComplete
              ? "Everyone's in — tap Next for the next hole."
              : "Tap a score — it jumps to the next player. Tap a name to pick."}
          </div>
        </div>
        <div className="scroll-tail" />
      </div>

      {/* footer: leaderboard bar + warning + nav + dots */}
      <footer className="score-footer">
        <button className="lb-bar" onClick={onOpenLeaderboard}>
          <span className="lb-bar-left">
            <span className="lb-bar-trophy font-mono">LEAD</span>
            <span className="lb-bar-name">
              {leader ? leader.name.toUpperCase() : "—"}
            </span>
          </span>
          <span className="lb-bar-mid">
            {leader && (
              <span
                className="lb-bar-vs font-display"
                style={{
                  color:
                    leader.vs === 0 ? "var(--surface-2)" : vsColor(leader.vs),
                }}
              >
                {formatVs(leader.vs)}
              </span>
            )}
            <span className="lb-bar-right font-mono">STANDINGS ▲</span>
          </span>
        </button>

        {pendingAdvance && (
          <div className="warn">
            <span className="warn-text">
              {unscoredThisHole} player{unscoredThisHole > 1 ? "s" : ""} still
              need{unscoredThisHole > 1 ? "" : "s"} a score on this hole.
            </span>
            <div className="warn-actions">
              <button className="btn btn-ghost sm" onClick={onCancelAdvance}>
                Go back
              </button>
              <button className="btn btn-ink sm" onClick={onConfirmAdvance}>
                {pendingAdvance === "finish" ? "Finish anyway" : "Skip anyway"}
              </button>
            </div>
          </div>
        )}

        <div className="nav-row">
          <button
            className="btn btn-ghost nav-prev"
            onClick={onPrev}
            disabled={currentHole === 0}
          >
            ← PREV
          </button>
          <button
            className={`btn nav-next ${holeComplete ? "btn-accent" : "btn-ink"}`}
            onClick={onNext}
          >
            {isLast ? "FINISH ROUND ★" : "NEXT →"}
          </button>
        </div>

        <div className="dots">
          {holeCompleteness.map((c, i) => (
            <button
              key={i}
              className={`dot dot-${c} ${i === currentHole ? "dot-current" : ""}`}
              onClick={() => onJump(i)}
              aria-label={`Go to hole ${i + 1}`}
            />
          ))}
        </div>
      </footer>
    </div>
  );
}

/* ============================================================
   LIVE LEADERBOARD SHEET
   ============================================================ */
function LeaderboardSheet({ leaderboard, formatVs, vsColor, onClose }) {
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <span className="font-display sheet-title">LEADERBOARD</span>
          <button className="linkbtn" onClick={onClose}>
            CLOSE ×
          </button>
        </div>
        <div className="sheet-body">
          {leaderboard.map((r) => (
            <div key={r.name} className={`lb-row rank-${r.rank}`}>
              <span className="lb-rank font-display">{r.rank}</span>
              <span className="lb-id">
                <span className="lb-name">{r.name}</span>
                <span className="lb-thru font-mono">
                  thru {r.played} · {r.total} strokes
                </span>
              </span>
              <span
                className="lb-vs font-display"
                style={{ color: vsColor(r.vs) }}
              >
                {formatVs(r.vs)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   FINISHED
   ============================================================ */
function FinishedView({
  course,
  players,
  scores,
  leaderboard,
  totalForPlayer,
  formatVs,
  vsColor,
  showSavedPill,
  onReview,
  onPlayAgain,
  onNewGame,
}) {
  const best = leaderboard.length ? leaderboard[0].total : 0;
  const winners = leaderboard.filter((r) => r.total === best).map((r) => r.name);
  const rankStyle = (rank) =>
    rank === 1 ? "rk-1" : rank === 2 ? "rk-2" : rank === 3 ? "rk-3" : "rk-x";

  return (
    <div className="screen">
      <div className="scroll pad">
        <header className="finish-head">
          <span className="font-display finish-title">FINAL ROUND</span>
          {showSavedPill && <span className="saved-pill">✓ SAVED</span>}
        </header>

        <div className="card card-ink winner-card">
          <span className="tag tag-onink">
            {winners.length > 1 ? "TIED" : "WINNER"}
          </span>
          <div className="winner-name font-display">{winners.join(" / ")}</div>
          <div className="winner-score font-mono">
            {best} · {formatVs(leaderboard[0]?.vs ?? 0)}
          </div>
        </div>

        <p className="section-eyebrow font-mono">FINAL STANDINGS</p>
        {leaderboard.map((r) => (
          <div key={r.name} className="card standing">
            <span className={`rank-badge font-mono ${rankStyle(r.rank)}`}>
              {r.rank}
            </span>
            <span className="standing-name">{r.name}</span>
            <span className="standing-nums">
              <span className="font-mono standing-total">{r.total}</span>
              <span
                className="font-mono standing-vs"
                style={{ color: vsColor(r.vs) }}
              >
                {formatVs(r.vs)}
              </span>
            </span>
          </div>
        ))}

        <p className="section-eyebrow font-mono">SCORECARD</p>
        <div className="scorecard-wrap">
          <table className="scorecard font-mono">
            <thead>
              <tr>
                <th className="sc-name">HOLE</th>
                {Array.from({ length: 18 }, (_, i) => (
                  <th key={i}>{i + 1}</th>
                ))}
                <th className="sc-tot">T</th>
              </tr>
              <tr className="sc-par">
                <th className="sc-name">PAR</th>
                {course.pars.map((p, i) => (
                  <th key={i}>{p}</th>
                ))}
                <th className="sc-tot">{course.total}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p}>
                  <td className="sc-name">{p}</td>
                  {(scores[p] || []).map((s, i) => {
                    const par = course.pars[i];
                    let cls = "sc-muted";
                    if (s != null)
                      cls =
                        s < par ? "sc-under" : s > par ? "sc-over" : "sc-even";
                    return (
                      <td key={i} className={cls}>
                        {s ?? "·"}
                      </td>
                    );
                  })}
                  <td className="sc-tot">{totalForPlayer(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="footer pad-h finish-actions">
        <div className="finish-row">
          <button className="btn btn-ghost" onClick={onReview}>
            ← REVIEW
          </button>
          <button className="btn btn-ink" onClick={onPlayAgain}>
            PLAY AGAIN
          </button>
        </div>
        <button className="btn btn-accent big" onClick={onNewGame}>
          NEW GAME ★
        </button>
      </footer>
    </div>
  );
}

/* ============================================================
   STATS
   ============================================================ */
function StatsView({
  playerStats,
  vsColor,
  onBack,
  confirmingDelete,
  setConfirmingDelete,
  onDeletePlayer,
  onDeleteAll,
}) {
  const [courseFilter, setCourseFilter] = useState("all");
  const [manageOpen, setManageOpen] = useState(false);

  const allNames = Object.keys(playerStats);
  const board = buildStatsLeaderboard(playerStats, courseFilter);

  const totalPlayers = board.length;
  const totalRounds = board.reduce((a, r) => a + r.rounds, 0);
  const totalAces = board.reduce((a, r) => a + r.aces, 0);

  const filterLabel =
    courseFilter === "black"
      ? "BLACK COURSE"
      : courseFilter === "white"
      ? "WHITE COURSE"
      : "ALL COURSES";
  const filterWord =
    courseFilter === "black"
      ? "Black Course "
      : courseFilter === "white"
      ? "White Course "
      : "";

  const podium = board.slice(0, 3);
  const medalClass = (i) =>
    i === 0 ? "medal-1" : i === 1 ? "medal-2" : i === 2 ? "medal-3" : "";
  const medalGlyph = (i) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;

  const aceKings = board
    .filter((r) => r.aces > 0)
    .slice()
    .sort((a, b) => b.aces - a.aces || a.best - b.best);
  const mostRounds = board
    .slice()
    .sort((a, b) => b.rounds - a.rounds || a.best - b.best);

  return (
    <div className="screen">
      <header className="topbar">
        <button className="nav-pill" onClick={onBack}>
          ← HOME
        </button>
        <span className="topbar-spacer" />
      </header>

      <div className="scroll pad">
        <div className="stats-hero">
          <h1 className="stats-title font-display">LOCAL LEADERBOARD</h1>
          <p className="stats-sub">Saved only on this phone</p>
        </div>

        {allNames.length === 0 ? (
          <div className="empty board-empty">
            <p className="empty-title font-display">NO LOCAL SCORES YET</p>
            <p className="empty-sub">
              Finish a round and this phone starts building its leaderboard.
            </p>
          </div>
        ) : (
          <>
            <div className="segmented">
              {[
                ["all", "ALL"],
                ["black", "BLACK"],
                ["white", "WHITE"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={`segmented-btn ${
                    courseFilter === id ? "seg-active" : ""
                  }`}
                  onClick={() => setCourseFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {board.length === 0 ? (
              <div className="empty board-empty">
                <p className="empty-title font-display">
                  NO {filterLabel} SCORES YET
                </p>
                <p className="empty-sub">
                  Finish a {filterWord}round to unlock this leaderboard.
                </p>
              </div>
            ) : (
              <>
                <div className="score-strip">
                  <div className="strip-cell">
                    <span className="strip-num font-display">
                      {totalPlayers}
                    </span>
                    <span className="strip-lbl">PLAYERS</span>
                  </div>
                  <span className="strip-div" />
                  <div className="strip-cell">
                    <span className="strip-num font-display">
                      {totalRounds}
                    </span>
                    <span className="strip-lbl">ROUNDS</span>
                  </div>
                  <span className="strip-div" />
                  <div className="strip-cell">
                    <span className="strip-num font-display">{totalAces}</span>
                    <span className="strip-lbl">ACES</span>
                  </div>
                </div>

                {podium.length > 1 && (
                  <div className="podium">
                    {podium.map((r, i) => (
                      <div key={r.name} className={`podium-card ${medalClass(i)}`}>
                        <span className="podium-medal">{medalGlyph(i)}</span>
                        <span className="podium-name">{r.name}</span>
                        <span className="podium-best font-display">
                          {r.best}
                        </span>
                        <span
                          className="podium-vs font-mono"
                          style={{ color: vsColor(r.bestVs) }}
                        >
                          {formatStatVs(r.bestVs)}
                        </span>
                        <span className="podium-rounds font-mono">
                          {r.rounds} RD{r.rounds === 1 ? "" : "S"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="board-heading font-mono">BEST SCORES · {filterLabel}</p>
                <div className="leaderboard-list">
                  {board.map((r, i) => (
                    <div
                      key={r.name}
                      className={`leaderboard-row ${i === 0 ? "lb-first" : ""}`}
                    >
                      <span className={`rank-medal font-display ${medalClass(i)}`}>
                        {i < 3 ? medalGlyph(i) : `#${i + 1}`}
                      </span>
                      <div className="lb-main">
                        <div className="lb-line1">
                          <span className="lb-player">{r.name}</span>
                          <span className="lb-scorewrap">
                            <span className="lb-best font-mono">{r.best}</span>
                            <span
                              className="stat-pill font-mono"
                              style={{ color: vsColor(r.bestVs) }}
                            >
                              {formatStatVs(r.bestVs)}
                            </span>
                          </span>
                        </div>
                        <div className="lb-line2 font-mono">
                          AVG {r.avg} · {r.rounds} ROUND
                          {r.rounds === 1 ? "" : "S"} · {r.aces} ACE
                          {r.aces === 1 ? "" : "S"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mini-boards">
                  <div className="mini-board">
                    <p className="mini-title font-display">ACE LEADERS</p>
                    {aceKings.length ? (
                      aceKings.map((r) => (
                        <div key={r.name} className="mini-row">
                          <span className="mini-name">{r.name}</span>
                          <span className="mini-val font-mono">
                            {r.aces}
                            <span className="mini-unit">
                              {" "}
                              ace{r.aces === 1 ? "" : "s"}
                            </span>
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="mini-empty">No aces yet — be the first.</p>
                    )}
                  </div>

                  <div className="mini-board">
                    <p className="mini-title font-display">MOST ROUNDS</p>
                    {mostRounds.map((r) => (
                      <div key={r.name} className="mini-row">
                        <span className="mini-name">{r.name}</span>
                        <span className="mini-val font-mono">
                          {r.rounds}
                          <span className="mini-unit"> · avg {r.avg}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="manage-data">
              <button
                className="manage-toggle"
                onClick={() => setManageOpen((o) => !o)}
              >
                Manage local data {manageOpen ? "▲" : "▼"}
              </button>
              {manageOpen && (
                <div className="manage-body">
                  {allNames.map((n) => {
                    const confirming = confirmingDelete === n;
                    return (
                      <div key={n} className="manage-row">
                        <span className="manage-name">{n}</span>
                        {!confirming ? (
                          <button
                            className="manage-del"
                            onClick={() => setConfirmingDelete(n)}
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="inline-confirm">
                            <button
                              className="btn btn-ghost sm"
                              onClick={() => setConfirmingDelete(null)}
                            >
                              Cancel
                            </button>
                            <button
                              className="btn btn-danger sm"
                              onClick={() => onDeletePlayer(n)}
                            >
                              Delete
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="manage-all">
                    {confirmingDelete !== "all" ? (
                      <button
                        className="btn btn-ghost sm"
                        onClick={() => setConfirmingDelete("all")}
                      >
                        Delete all local data
                      </button>
                    ) : (
                      <div className="confirm-row">
                        <button
                          className="btn btn-ghost sm"
                          onClick={() => setConfirmingDelete(null)}
                        >
                          Cancel
                        </button>
                        <button className="btn btn-danger sm" onClick={onDeleteAll}>
                          Delete everything
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Archivo+Black&family=JetBrains+Mono:wght@500;700&family=Lobster+Two:wght@700&display=swap');

.app-root{
  /* Oakley Greens inspired system: script signage, dark container green, warm concrete, turf, flag gold */
  --bg:#F2F0E6;
  --bg-dim:#E6E8DA;
  --surface:#FFFCF2;
  --surface-2:#F8F4E8;
  --surface-3:#EDE8D8;
  --ink:#101914;
  --ink-soft:#31463A;
  --muted:#768272;
  --border:#D2D0BF;
  --border-strong:#101914;
  --club:#0B2C1C;
  --club-2:#123C27;
  --turf:#216B3F;
  --turf-bright:#35A05E;
  --gold:#E1B348;
  --gold-soft:#F7E3A3;
  --cream:#FFFCF2;
  --blue:#183C54;
  --purple:#5B4AD4;
  --green:#20834A;
  --red:#B64B35;
  --shadow:0 16px 34px rgba(16,25,20,.10);
  --shadow-sm:0 8px 18px rgba(16,25,20,.08);
  --radius:18px;
  font-family:'Archivo',system-ui,sans-serif;
  color:var(--ink);
  background:
    radial-gradient(circle at 20% -5%, rgba(53,160,94,.16), transparent 34%),
    radial-gradient(circle at 110% 8%, rgba(225,179,72,.18), transparent 28%),
    linear-gradient(180deg,var(--bg),var(--bg-dim));
  -webkit-tap-highlight-color:transparent;
}
.app-root *{box-sizing:border-box;margin:0;padding:0;}
.font-display{font-family:'Archivo Black','Archivo',sans-serif;letter-spacing:-.035em;font-weight:900;text-transform:uppercase;}
.font-brand{font-family:'Lobster Two',cursive;font-weight:700;letter-spacing:.01em;}
.font-mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;}

/* full-bleed mobile shell */
.screen{
  display:flex;flex-direction:column;
  height:100dvh;min-height:100dvh;
  max-width:560px;margin:0 auto;
  background:
    linear-gradient(90deg, rgba(16,25,20,.035) 1px, transparent 1px) 0 0 / 18px 18px,
    linear-gradient(180deg,var(--bg),var(--bg-dim));
  position:relative;overflow:hidden;
}
.screen:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,252,242,.82),rgba(255,252,242,0) 22%,rgba(16,25,20,.035));z-index:0;}
.screen > *{position:relative;z-index:1;}
.scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
.pad{padding:22px 16px calc(30px + env(safe-area-inset-bottom));}
.pad-h{padding-left:16px;padding-right:16px;}
.footer{padding:12px 16px calc(14px + env(safe-area-inset-bottom));background:rgba(242,240,230,.96);backdrop-filter:blur(14px);border-top:1.5px solid var(--border);}
.boot{height:100dvh;display:grid;place-items:center;background:var(--club);}
.boot-mark{font-family:'Lobster Two',cursive;font-size:42px;color:var(--cream);opacity:.94;letter-spacing:.01em;}

/* ---------- buttons ---------- */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;
  border:2px solid var(--border-strong);border-radius:16px;padding:15px 16px;
  font-family:'Archivo',sans-serif;font-weight:800;font-size:14px;letter-spacing:.035em;text-transform:uppercase;
  cursor:pointer;background:var(--surface);color:var(--ink);min-height:52px;
  box-shadow:0 3px 0 var(--border-strong);transition:transform .06s ease, box-shadow .06s ease, background .15s ease;
}
.btn:active{transform:translateY(2px);box-shadow:0 1px 0 var(--border-strong);}
.btn.big{font-size:15px;padding:17px;min-height:58px;border-radius:18px;}
.btn.sm{width:auto;padding:9px 13px;min-height:39px;font-size:12px;border-radius:12px;box-shadow:none;}
.btn:disabled{opacity:.45;cursor:default;box-shadow:none;}
.btn-accent{background:linear-gradient(180deg,var(--turf),var(--club-2));color:var(--cream);border-color:var(--ink);}
.btn-ink{background:var(--club);color:var(--cream);border-color:var(--ink);}
.btn-ghost{background:rgba(255,252,242,.55);border-color:var(--border);color:var(--ink-soft);box-shadow:none;text-transform:none;font-weight:700;letter-spacing:0;}
.btn-danger{background:var(--red);color:#fff;border-color:var(--ink);}
.linkbtn{background:none;border:none;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;letter-spacing:.05em;color:var(--ink-soft);cursor:pointer;padding:8px 2px;text-transform:uppercase;}
.confirm-row{display:flex;gap:10px;}
.confirm-row .btn{flex:1;}

/* ---------- topbars ---------- */
.topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(12px + env(safe-area-inset-top)) 16px 12px;border-bottom:1.5px solid var(--border);background:rgba(242,240,230,.94);backdrop-filter:blur(14px);}
.topbar-title{font-size:21px;line-height:.9;letter-spacing:-.04em;text-align:center;color:var(--club);}
.topbar-spacer{width:74px;}
.topbar-course{border:2px solid var(--ink);border-radius:999px;padding:7px 10px;font-size:11px;font-weight:700;letter-spacing:.07em;min-width:64px;text-align:center;}
.topbar-course-black{background:var(--club);color:var(--cream);}
.topbar-course-white{background:var(--cream);color:var(--club);}
.nav-pill{background:var(--surface);border:2px solid var(--border-strong);border-radius:999px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;letter-spacing:.04em;color:var(--ink);padding:10px 14px;cursor:pointer;min-height:42px;box-shadow:0 3px 0 var(--border-strong);}
.nav-pill:active{transform:translateY(2px);box-shadow:0 1px 0 var(--border-strong);}

/* ---------- demo lock ---------- */
.demo-screen{background:var(--deep-green);}
.demo-lock-shell{
  min-height:100dvh;
  display:flex;
  align-items:center;
  justify-content:center;
  background:
    radial-gradient(circle at 20% 12%, rgba(226,190,101,.24), transparent 30%),
    radial-gradient(circle at 90% 10%, rgba(122,158,90,.18), transparent 28%),
    linear-gradient(180deg, var(--deep-green) 0%, var(--ink) 100%);
}
.demo-lock-card{
  width:100%;
  max-width:410px;
  background:var(--surface);
  border:2px solid var(--gold);
  border-radius:26px;
  padding:28px 22px 22px;
  box-shadow:0 22px 55px rgba(5,24,16,.35);
}
.demo-lock-title{
  font-family:var(--script-font);
  font-size:48px;
  line-height:.9;
  color:var(--deep-green);
  margin:4px 0 12px;
}
.demo-lock-sub{font-size:15px;line-height:1.45;color:var(--ink-soft);max-width:28ch;margin-bottom:18px;}
.demo-lock-form{display:flex;flex-direction:column;gap:10px;}
.demo-code-input{
  width:100%;
  border:2px solid var(--border-strong);
  border-radius:14px;
  background:var(--surface-2);
  color:var(--ink);
  font-family:'JetBrains Mono',monospace;
  font-size:17px;
  font-weight:700;
  letter-spacing:.08em;
  padding:15px 16px;
  min-height:54px;
}
.demo-code-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(36,116,72,.14);}
.demo-code-input.demo-error{border-color:var(--red);}
.demo-error-text{font-size:13px;color:var(--red);font-weight:700;}
.demo-lock-note{font-size:12px;line-height:1.45;color:var(--muted);text-align:center;margin-top:16px;}

/* ---------- home ---------- */
.home-head{position:relative;padding:calc(12px + env(safe-area-inset-top)) 0 4px;margin-bottom:20px;}
.home-head:after{content:"";display:block;height:4px;width:78px;margin-top:18px;border-radius:999px;background:linear-gradient(90deg,var(--turf),var(--gold));}
.brand-lockup{display:inline-flex;flex-direction:column;align-items:flex-start;gap:0;margin-bottom:10px;}
.brand-script{font-size:49px;line-height:.78;color:var(--club);text-shadow:0 1px 0 rgba(255,252,242,.7);}
.brand-kicker{display:inline-block;margin-top:1px;padding-left:6px;font-size:11px;font-weight:700;letter-spacing:.22em;color:var(--ink-soft);}
.home-slogan{max-width:9ch;font-size:56px;line-height:.82;color:var(--ink);margin:10px 0 11px;}
.lede{color:var(--ink-soft);font-size:15px;line-height:1.45;max-width:34ch;font-weight:500;}
.venue-strip{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;}
.venue-strip span{font-size:10px;font-weight:700;letter-spacing:.08em;border:1.5px solid var(--border);background:rgba(255,252,242,.72);border-radius:999px;padding:7px 9px;color:var(--ink-soft);}
.section-eyebrow{font-size:10px;font-weight:700;letter-spacing:.16em;color:var(--muted);margin:22px 0 10px;text-transform:uppercase;}
.tag{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:10px;letter-spacing:.12em;padding:5px 9px;border-radius:999px;border:1.5px solid var(--border-strong);}
.tag-onink{background:transparent;color:var(--cream);border-color:rgba(255,252,242,.52);}

.course-card{position:relative;display:flex;flex-direction:column;gap:8px;width:100%;text-align:left;border:2px solid var(--border-strong);border-radius:24px;padding:22px 20px;margin-bottom:12px;cursor:pointer;overflow:hidden;box-shadow:0 5px 0 var(--border-strong);transition:transform .07s ease,box-shadow .07s ease;}
.course-card:active{transform:translateY(3px);box-shadow:0 2px 0 var(--border-strong);}
.course-card:after{content:"";position:absolute;right:-30px;top:-36px;width:130px;height:130px;border-radius:999px;border:22px solid rgba(255,252,242,.12);}
.course-black{background:linear-gradient(135deg,var(--club),#07170F);color:var(--cream);}
.course-white{background:linear-gradient(135deg,var(--cream),var(--surface-3));color:var(--ink);}
.course-white:after{border-color:rgba(11,44,28,.08);}
.cc-top{display:flex;align-items:center;justify-content:space-between;width:100%;position:relative;z-index:1;}
.course-name{font-size:48px;line-height:.82;letter-spacing:-.04em;}
.course-par{position:relative;z-index:1;font-size:11px;font-weight:700;letter-spacing:.08em;opacity:.78;}
.cc-arrow{font-size:24px;font-weight:900;opacity:.65;}
.how-grid{display:flex;flex-direction:column;gap:9px;margin-bottom:16px;}
.how-step{display:flex;align-items:center;gap:13px;background:rgba(255,252,242,.82);border:1.5px solid var(--border);border-radius:18px;padding:13px 14px;box-shadow:var(--shadow-sm);}
.how-step-num{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:12px;background:var(--club);color:var(--cream);font-size:11px;font-weight:700;letter-spacing:.04em;box-shadow:inset 0 -3px rgba(255,255,255,.08);}
.how-text{font-size:14px;color:var(--ink-soft);line-height:1.35;font-weight:500;}
.how-text b{color:var(--ink);font-weight:800;}
.btn-stats{background:linear-gradient(90deg,var(--club),var(--turf));color:var(--cream);border:2px solid var(--ink);font-family:'Archivo Black','Archivo',sans-serif;font-size:15px;letter-spacing:.02em;box-shadow:0 4px 0 var(--ink);}
.card{background:rgba(255,252,242,.86);border:2px solid var(--border-strong);border-radius:var(--radius);padding:16px;margin-bottom:12px;box-shadow:var(--shadow-sm);}
.card-ink{background:linear-gradient(145deg,var(--club),#07170F);color:var(--cream);border-color:var(--ink);}
.resume-card{margin-bottom:14px;border-radius:24px;padding:18px;}
.resume-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.resume-hole{font-size:13px;letter-spacing:.06em;}
.resume-course{font-size:38px;line-height:.82;letter-spacing:-.04em;margin-bottom:12px;}
.resume-meta{font-size:11px;letter-spacing:.06em;opacity:.76;margin-top:12px;}
.chips{display:flex;flex-wrap:wrap;gap:7px;}
.chip{font-size:13px;font-weight:700;padding:7px 11px;border-radius:999px;border:1.5px solid var(--border);background:var(--surface);color:var(--ink);}
.chip-onink{background:rgba(255,252,242,.08);border-color:rgba(255,252,242,.32);color:var(--cream);}
.chip-btn{cursor:pointer;border-color:var(--border-strong);font-weight:800;background:var(--surface);}
.chip-btn:active{transform:scale(.96);}
.privacy-note{margin-top:23px;font-size:12px;color:var(--muted);line-height:1.5;text-align:center;font-weight:500;}
.privacy-note.tight{margin-top:4px;margin-bottom:14px;text-align:left;}

/* ---------- players ---------- */
.add-row{display:flex;gap:9px;margin-bottom:16px;}
.text-input{flex:1;border:2px solid var(--border-strong);border-radius:16px;padding:14px 15px;font-family:'Archivo',sans-serif;font-size:16px;background:var(--surface);color:var(--ink);min-height:54px;box-shadow:0 3px 0 var(--border-strong);}
.text-input::placeholder{color:var(--muted);}
.text-input:focus{outline:none;border-color:var(--turf);box-shadow:0 3px 0 var(--turf);}
.add-btn{width:auto;padding:0 20px;}
.roster{margin-bottom:18px;}
.player-list{list-style:none;display:flex;flex-direction:column;gap:9px;margin-top:6px;}
.player-item{display:flex;align-items:center;gap:13px;background:var(--surface);border:2px solid var(--border-strong);border-radius:17px;padding:13px 15px;box-shadow:0 3px 0 var(--border-strong);}
.player-num{font-size:12px;color:var(--muted);width:20px;font-weight:700;}
.player-name{flex:1;font-size:17px;font-weight:800;}
.remove-x{width:36px;height:36px;border-radius:999px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--muted);font-size:22px;line-height:1;cursor:pointer;flex:none;}
.remove-x:active{transform:scale(.94);}
.empty{text-align:center;padding:44px 20px;}
.empty-title{font-size:31px;color:var(--club);margin-bottom:8px;line-height:.88;}
.empty-sub{color:var(--muted);font-size:14px;line-height:1.5;max-width:32ch;margin:0 auto;font-weight:500;}

/* ---------- scoring ---------- */
.scoring{background:var(--bg);}
.score-head{padding:calc(10px + env(safe-area-inset-top)) 16px 12px;background:rgba(242,240,230,.95);backdrop-filter:blur(14px);border-bottom:1.5px solid var(--border);}
.score-head-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}
.course-badge{display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right;border:2px solid var(--border-strong);border-radius:18px;padding:8px 13px;min-width:155px;box-shadow:0 3px 0 var(--border-strong);}
.course-badge-name{font-size:20px;line-height:.86;letter-spacing:-.04em;}
.course-badge-sub{font-size:10px;letter-spacing:.03em;font-weight:700;text-transform:uppercase;}
.badge-black{background:linear-gradient(135deg,var(--club),#06160E);border-color:var(--ink);}
.badge-black .course-badge-name{color:var(--cream);}
.badge-black .course-badge-sub{color:rgba(255,252,242,.68);}
.badge-white{background:var(--cream);}
.badge-white .course-badge-name{color:var(--club);}
.badge-white .course-badge-sub{color:var(--muted);}
.hole-line{display:flex;align-items:center;gap:10px;animation:pop .28s ease;}
@keyframes pop{from{opacity:.3;transform:translateY(3px);}to{opacity:1;transform:none;}}
.hole-big{font-size:46px;line-height:.82;color:var(--club);}
.par-badge{font-size:12px;letter-spacing:.06em;font-weight:700;color:var(--ink);background:var(--gold);border:2px solid var(--ink);border-radius:999px;padding:7px 11px;box-shadow:0 2px 0 var(--ink);}
.hole-progress{margin-left:auto;font-size:11px;letter-spacing:.05em;color:var(--ink-soft);font-weight:700;text-transform:uppercase;}
.score-scroll{padding:12px 16px 4px;}
.psel-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -16px 12px;padding:0 16px;}
.psel{display:flex;gap:8px;min-width:min-content;}
.pchip{flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:64px;padding:9px 10px;border-radius:16px;cursor:pointer;border:2px solid var(--border);background:rgba(255,252,242,.78);color:var(--ink-soft);transition:transform .06s ease, background .12s ease;}
.pchip:active{transform:scale(.95);}
.pchip-num{font-size:9px;color:var(--muted);letter-spacing:.05em;font-weight:700;}
.pchip-name{font-size:13px;font-weight:800;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pchip-val{font-size:15px;font-weight:700;line-height:1;}
.pchip-done{border-color:var(--club);background:var(--surface);}
.pchip-done .pchip-val{color:var(--green);}
.pchip-active{background:var(--club);border-color:var(--ink);color:var(--cream);transform:translateY(-1px);box-shadow:0 4px 0 var(--gold);}
.pchip-active .pchip-num{color:rgba(255,252,242,.62);}
.pchip-active .pchip-val{color:var(--gold);}
.focus-card{background:rgba(255,252,242,.92);border:2.5px solid var(--ink);border-radius:24px;padding:17px 16px 15px;animation:pop .22s ease;box-shadow:var(--shadow);}
.focus-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;}
.focus-eyebrow{font-size:10px;letter-spacing:.14em;color:var(--muted);font-weight:700;}
.focus-totals{display:flex;align-items:baseline;gap:9px;}
.focus-total{font-size:20px;font-weight:700;}
.focus-vs{font-size:15px;font-weight:700;}
.focus-name{font-size:44px;line-height:.85;margin:3px 0 16px;color:var(--club);}
.score-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.focus-grid{gap:9px;}
.score-btn{min-height:58px;border:2px solid var(--border-strong);border-radius:17px;background:var(--surface);color:var(--ink);font-family:'JetBrains Mono',monospace;font-weight:700;font-size:22px;cursor:pointer;transition:transform .05s ease,background .1s ease;box-shadow:0 3px 0 var(--border-strong);}
.focus-grid .score-btn{min-height:68px;font-size:27px;}
.score-btn:active{transform:translateY(2px) scale(.98);box-shadow:0 1px 0 var(--border-strong);}
.score-btn.sel{background:var(--club);color:var(--cream);border-color:var(--ink);}
.score-btn.sel-ace{background:var(--gold);color:var(--ink);border-color:var(--ink);box-shadow:0 0 0 4px rgba(225,179,72,.24),0 3px 0 var(--ink);}
.focus-hint{margin-top:13px;font-size:12px;color:var(--muted);line-height:1.4;text-align:center;font-weight:500;}
.scroll-tail{height:4px;}
.score-footer{background:rgba(242,240,230,.97);backdrop-filter:blur(16px);border-top:1.5px solid var(--border);padding:9px 16px calc(9px + env(safe-area-inset-bottom));}
.lb-bar{display:flex;align-items:center;justify-content:space-between;width:100%;background:linear-gradient(90deg,var(--club),var(--turf));color:var(--cream);border:2px solid var(--ink);border-radius:16px;padding:10px 12px;margin-bottom:9px;cursor:pointer;box-shadow:0 3px 0 var(--ink);}
.lb-bar:active{transform:translateY(2px);box-shadow:0 1px 0 var(--ink);}
.lb-bar-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;}
.lb-bar-trophy{font-size:9px;flex:none;border:1.5px solid rgba(255,252,242,.55);border-radius:999px;padding:4px 6px;color:var(--gold);font-weight:700;letter-spacing:.06em;}
.lb-bar-name{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;letter-spacing:.05em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lb-bar-mid{display:flex;align-items:center;gap:13px;flex:none;}
.lb-bar-vs{font-size:25px;line-height:.9;color:var(--cream);}
.lb-bar-right{font-size:10px;letter-spacing:.08em;opacity:.82;}
.warn{background:var(--gold-soft);border:2px solid var(--gold);border-radius:16px;padding:11px 13px;margin-bottom:9px;}
.warn-text{display:block;font-size:13px;color:var(--ink);line-height:1.4;margin-bottom:9px;font-weight:700;}
.warn-actions{display:flex;gap:9px;}
.warn-actions .btn{flex:1;}
.nav-row{display:flex;gap:10px;margin-bottom:9px;}
.nav-prev{flex:1;}
.nav-next{flex:1.6;}
.dots{display:flex;gap:5px;justify-content:space-between;}
.dot{flex:1;height:9px;border-radius:999px;border:none;background:var(--border);cursor:pointer;padding:0;transition:background .15s ease;}
.dot-partial{background:#D6C06E;}
.dot-full{background:var(--club);}
.dot-current{outline:2px solid var(--turf);outline-offset:2px;}

/* ---------- leaderboard sheet ---------- */
.sheet-scrim{position:fixed;inset:0;background:rgba(16,25,20,.54);display:flex;align-items:flex-end;justify-content:center;z-index:40;animation:fade .18s ease;}
@keyframes fade{from{opacity:0;}to{opacity:1;}}
.sheet{width:100%;max-width:560px;background:linear-gradient(180deg,var(--surface),var(--bg));border-top-left-radius:28px;border-top-right-radius:28px;border:2px solid var(--border-strong);border-bottom:none;padding:10px 16px calc(22px + env(safe-area-inset-bottom));max-height:82dvh;overflow-y:auto;animation:slideup .26s cubic-bezier(.2,.8,.2,1);}
@keyframes slideup{from{transform:translateY(30px);opacity:.6;}to{transform:none;opacity:1;}}
.sheet-grip{width:46px;height:5px;border-radius:999px;background:var(--border);margin:2px auto 12px;}
.sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.sheet-title{font-size:30px;color:var(--club);line-height:.9;}
.sheet-body{display:flex;flex-direction:column;gap:8px;}
.lb-row{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:11px;padding:13px 14px;border:2px solid var(--border);border-radius:17px;background:rgba(255,252,242,.9);}
.lb-row.rank-1{border-color:var(--gold);background:linear-gradient(90deg,var(--gold-soft),var(--surface));border-width:2.5px;}
.lb-rank{font-size:27px;line-height:1;color:var(--muted);text-align:center;}
.rank-1 .lb-rank{color:#9C7618;}
.lb-id{display:flex;flex-direction:column;gap:1px;min-width:0;}
.lb-name{font-size:17px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lb-thru{font-size:10px;color:var(--muted);letter-spacing:.03em;text-transform:uppercase;font-weight:700;}
.lb-vs{font-size:36px;line-height:.85;text-align:right;min-width:56px;}

/* ---------- finished ---------- */
.finish-head{display:flex;align-items:center;gap:12px;padding-top:calc(6px + env(safe-area-inset-top));margin-bottom:16px;}
.finish-title{font-size:48px;line-height:.84;color:var(--club);}
.saved-pill{background:var(--green);color:#fff;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;letter-spacing:.08em;padding:6px 10px;border-radius:999px;animation:fade .3s ease;}
.winner-card{padding:20px;border-radius:24px;}
.winner-name{font-size:44px;line-height:.85;margin:10px 0 7px;}
.winner-score{font-size:15px;letter-spacing:.05em;opacity:.85;}
.standing{display:flex;align-items:center;gap:13px;padding:13px 15px;border-radius:17px;}
.rank-badge{width:32px;height:32px;border-radius:999px;display:grid;place-items:center;font-size:14px;font-weight:700;flex:none;border:2px solid var(--border-strong);}
.rk-1{background:var(--gold);color:var(--ink);border-color:var(--ink);}
.rk-2{background:var(--club);color:var(--cream);border-color:var(--ink);}
.rk-3{background:var(--surface);color:var(--ink);}
.rk-x{background:transparent;color:var(--muted);border-color:var(--border);}
.standing-name{flex:1;font-size:17px;font-weight:800;}
.standing-nums{display:flex;align-items:baseline;gap:9px;}
.standing-total{font-size:20px;font-weight:700;}
.standing-vs{font-size:13px;font-weight:700;}
.scorecard-wrap{overflow-x:auto;border:2px solid var(--border-strong);border-radius:17px;-webkit-overflow-scrolling:touch;background:var(--surface);box-shadow:var(--shadow-sm);}
.scorecard{border-collapse:collapse;font-size:12px;min-width:100%;}
.scorecard th,.scorecard td{padding:8px 7px;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap;}
.scorecard thead th{background:var(--club);color:var(--cream);font-size:11px;}
.sc-par th{background:var(--surface-3);color:var(--muted);font-weight:700;}
.sc-name{text-align:left !important;position:sticky;left:0;background:var(--surface);font-weight:700;padding-left:11px !important;padding-right:11px !important;}
.scorecard thead .sc-name{background:var(--club);}
.sc-tot{font-weight:700;background:var(--surface-2);}
.sc-under{color:var(--green);font-weight:700;}
.sc-over{color:var(--red);}
.sc-even{color:var(--ink);}
.sc-muted{color:var(--border);}
.finish-actions{border-top:1.5px solid var(--border);}
.finish-row{display:flex;gap:10px;margin-bottom:10px;}
.finish-row .btn{flex:1;}

/* ---------- stats / local leaderboard ---------- */
.inline-confirm{display:flex;gap:8px;}
.stats-hero{margin:2px 0 16px;}
.stats-title{font-size:41px;line-height:.85;color:var(--club);}
.stats-sub{font-size:13px;color:var(--muted);margin-top:7px;letter-spacing:.02em;font-weight:600;}
.segmented{display:flex;gap:4px;background:var(--surface);border:2px solid var(--border-strong);border-radius:16px;padding:4px;margin-bottom:16px;box-shadow:0 3px 0 var(--border-strong);}
.segmented-btn{flex:1;border:none;background:transparent;border-radius:12px;padding:11px 6px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;letter-spacing:.06em;color:var(--ink-soft);cursor:pointer;transition:background .12s ease;min-height:42px;}
.segmented-btn.seg-active{background:var(--club);color:var(--cream);}
.score-strip{display:flex;align-items:center;background:linear-gradient(90deg,var(--club),var(--turf));border:2px solid var(--ink);border-radius:18px;padding:14px 8px;margin-bottom:16px;box-shadow:0 4px 0 var(--ink);}
.strip-cell{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;}
.strip-num{font-size:32px;line-height:.9;color:var(--cream);}
.strip-lbl{font-size:9px;letter-spacing:.12em;font-family:'JetBrains Mono',monospace;color:rgba(255,252,242,.68);font-weight:700;}
.strip-div{width:1.5px;align-self:stretch;background:rgba(255,252,242,.2);margin:2px 0;}
.podium{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;align-items:end;}
.podium-card{display:flex;flex-direction:column;align-items:center;gap:3px;border:2px solid var(--border-strong);border-radius:18px;padding:12px 6px 11px;background:var(--surface);box-shadow:0 3px 0 var(--border-strong);}
.podium-medal{font-size:20px;line-height:1;}
.podium-name{font-size:13px;font-weight:800;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.podium-best{font-size:34px;line-height:.85;margin-top:2px;}
.podium-vs{font-size:12px;font-weight:700;}
.podium-rounds{font-size:9px;color:var(--muted);letter-spacing:.06em;margin-top:1px;font-weight:700;}
.podium-card.medal-1{background:var(--gold);border-color:var(--ink);order:2;padding-top:18px;padding-bottom:15px;}
.podium-card.medal-2{order:1;}
.podium-card.medal-3{order:3;}
.board-heading{font-size:10px;letter-spacing:.13em;color:var(--muted);margin:0 0 10px;font-weight:700;}
.leaderboard-list{display:flex;flex-direction:column;gap:8px;margin-bottom:22px;}
.leaderboard-row{display:flex;align-items:center;gap:12px;background:rgba(255,252,242,.9);border:2px solid var(--border);border-radius:17px;padding:12px 14px;box-shadow:var(--shadow-sm);}
.leaderboard-row.lb-first{border-color:var(--gold);border-width:2.5px;background:linear-gradient(90deg,var(--gold-soft),var(--surface));}
.rank-medal{font-size:22px;line-height:1;min-width:34px;text-align:center;color:var(--muted);flex:none;}
.rank-medal.medal-1,.rank-medal.medal-2,.rank-medal.medal-3{font-size:24px;}
.lb-main{flex:1;min-width:0;}
.lb-line1{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
.lb-player{font-size:17px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lb-scorewrap{display:flex;align-items:baseline;gap:8px;flex:none;}
.lb-best{font-size:22px;font-weight:700;}
.stat-pill{font-size:13px;font-weight:700;border:1.5px solid var(--border);border-radius:999px;padding:2px 7px;background:rgba(255,252,242,.62);}
.lb-line2{font-size:10px;color:var(--muted);letter-spacing:.03em;margin-top:4px;font-weight:700;text-transform:uppercase;}
.mini-boards{display:flex;flex-direction:column;gap:12px;margin-bottom:20px;}
.mini-board{background:rgba(255,252,242,.9);border:1.5px solid var(--border);border-radius:18px;padding:14px 15px;box-shadow:var(--shadow-sm);}
.mini-title{font-size:19px;line-height:1;margin-bottom:9px;color:var(--club);}
.mini-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--border);}
.mini-row:first-of-type{border-top:none;}
.mini-name{font-size:15px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mini-val{font-size:16px;font-weight:700;flex:none;}
.mini-unit{font-size:11px;color:var(--muted);font-weight:500;}
.mini-empty{font-size:13px;color:var(--muted);padding:4px 0;font-weight:500;}
.manage-data{margin-top:6px;border-top:1px solid var(--border);padding-top:12px;}
.manage-toggle{background:none;border:none;color:var(--muted);font-family:'Archivo',sans-serif;font-size:13px;font-weight:700;cursor:pointer;padding:8px 0;}
.manage-body{margin-top:8px;}
.manage-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--border);}
.manage-name{font-size:15px;color:var(--ink-soft);font-weight:700;}
.manage-del{background:none;border:none;color:var(--red);font-family:'Archivo',sans-serif;font-size:13px;font-weight:700;cursor:pointer;padding:6px 4px;}
.manage-all{margin-top:12px;}
.board-empty{padding:40px 20px;}

@media (max-width: 360px){
  .home-slogan{font-size:50px;}
  .brand-script{font-size:44px;}
  .course-badge{min-width:138px;padding:8px 10px;}
  .course-badge-name{font-size:18px;}
  .hole-big{font-size:40px;}
  .focus-name{font-size:39px;}
}
@media (prefers-reduced-motion: reduce){
  *{animation:none !important;transition:none !important;}
}
`;
