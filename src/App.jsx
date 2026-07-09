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

  if (!loaded)
    return (
      <div className="app-root">
        <style>{STYLES}</style>
        <div className="boot">
          <span className="font-display boot-mark">OAKLEY&nbsp;PUTT</span>
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
          <div className="brand-row">
            <span className="font-display brand">OAKLEY&nbsp;PUTT</span>
            <span className="tag tag-live">LIVE</span>
          </div>
          <p className="lede">
            The digital scorecard. Add players, tap in scores, watch the
            leaderboard move.
          </p>
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
                <span className="how-emoji">⛳</span>
                <span className="how-text">
                  <b>Pick a course</b> and add everyone playing
                </span>
              </div>
              <div className="how-step">
                <span className="how-emoji">✏️</span>
                <span className="how-text">
                  <b>Tap in scores</b> hole by hole — no pencil, no math
                </span>
              </div>
              <div className="how-step">
                <span className="how-emoji">🏆</span>
                <span className="how-text">
                  <b>Watch the leaderboard</b> and settle it live
                </span>
              </div>
              <div className="how-step">
                <span className="how-emoji">🕳️</span>
                <span className="how-text">
                  <b>Track aces & records</b> to brag about later
                </span>
              </div>
            </div>

            <button className="btn btn-stats" onClick={onViewStats}>
              📊 VIEW YOUR STATS & RECORDS
            </button>
          </>
        )}

        <p className="privacy-note">
          🔒 Saved only on this phone. No account, no sign-up — your scores stay
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
        <button className="linkbtn" onClick={onBack}>
          ← BACK
        </button>
        <span className="topbar-title font-display">WHO'S PLAYING?</span>
        <span className="topbar-spacer" />
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
          <button className="home-link" onClick={onHome}>
            ← HOME
          </button>
          <span className="course-pill font-mono">{course.label}</span>
          <span className="hole-count font-mono">{currentHole + 1}/18</span>
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
            <span className="lb-bar-trophy">🏆</span>
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
          <span className="font-display finish-title">FINAL.</span>
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
        <button className="home-link" onClick={onBack}>
          ← HOME
        </button>
        <span className="topbar-spacer" />
      </header>

      <div className="scroll pad">
        <div className="stats-hero">
          <h1 className="stats-title font-display">LOCAL LEADERBOARD</h1>
          <p className="stats-sub">🔒 Saved only on this phone</p>
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
                    <p className="mini-title font-display">ACE KINGS 🕳️</p>
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
                    <p className="mini-title font-display">MOST ROUNDS 🔁</p>
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
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@500;700&display=swap');

.app-root{
  /* Oakley Greens clubhouse palette — pine + fairway + golf gold */
  --bg:#E7EFDF; --surface:#F3F8EC; --surface-2:#FBFCF6;
  --ink:#13241B; --ink-soft:#3A4C40; --muted:#7C8B78;
  --border:#CBD8BE; --border-strong:#13241B;
  --accent:#1F7A3D; --accent-ink:#FFFFFF;      /* fairway green — primary actions */
  --flag:#F0B429; --flag-ink:#13241B;           /* golf gold — trophies, aces, leader */
  --green:#2C8A4E; --red:#BF3D28;               /* under / over par */
  --radius:16px;
  font-family:'DM Sans',system-ui,sans-serif;
  color:var(--ink);
  background:var(--bg);
  -webkit-tap-highlight-color:transparent;
}
.app-root *{box-sizing:border-box;margin:0;padding:0;}
.font-display{font-family:'Bebas Neue',sans-serif;letter-spacing:.02em;font-weight:400;}
.font-mono{font-family:'JetBrains Mono',monospace;font-variant-numeric:tabular-nums;}

/* full-bleed mobile shell */
.screen{
  display:flex;flex-direction:column;
  height:100dvh;min-height:100dvh;
  max-width:560px;margin:0 auto;
  background:var(--bg);
  position:relative;
  overflow:hidden;
}
.scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}
.pad{padding:20px 16px calc(28px + env(safe-area-inset-bottom));}
.pad-h{padding-left:16px;padding-right:16px;}
.footer{padding:12px 16px calc(14px + env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--border);}

.boot{height:100dvh;display:grid;place-items:center;}
.boot-mark{font-size:34px;color:var(--ink);opacity:.35;letter-spacing:.05em;}

/* ---------- buttons ---------- */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  width:100%;border:2px solid var(--border-strong);
  border-radius:14px;padding:15px 16px;
  font-family:'DM Sans',sans-serif;font-weight:700;font-size:15px;
  letter-spacing:.03em;cursor:pointer;background:var(--surface);color:var(--ink);
  transition:transform .06s ease, background .15s ease;
  min-height:52px;
}
.btn:active{transform:scale(.98);}
.btn.big{font-size:16px;padding:17px;min-height:58px;}
.btn.sm{width:auto;padding:9px 14px;min-height:40px;font-size:13px;border-radius:11px;}
.btn:disabled{opacity:.45;cursor:default;}
.btn-accent{background:var(--accent);color:#fff;border-color:var(--border-strong);}
.btn-ink{background:var(--ink);color:var(--surface-2);border-color:var(--ink);}
.btn-ghost{background:transparent;border-color:var(--border);color:var(--ink-soft);font-weight:500;letter-spacing:0;}
.btn-danger{background:var(--red);color:#fff;border-color:var(--border-strong);}
.linkbtn{background:none;border:none;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;letter-spacing:.05em;color:var(--ink-soft);cursor:pointer;padding:6px 2px;}
.confirm-row{display:flex;gap:10px;}
.confirm-row .btn{flex:1;}

/* ---------- topbars ---------- */
.topbar{display:flex;align-items:center;justify-content:space-between;
  padding:calc(10px + env(safe-area-inset-top)) 14px 10px;border-bottom:1px solid var(--border);background:var(--bg);}
.topbar-title{font-size:22px;letter-spacing:.04em;}
.topbar-spacer{width:44px;}

/* ---------- home ---------- */
.home-head{padding-top:calc(8px + env(safe-area-inset-top));margin-bottom:22px;}
.brand-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.brand{font-size:40px;line-height:.9;}
.lede{color:var(--ink-soft);font-size:15px;line-height:1.45;max-width:34ch;}
.tag{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:10px;letter-spacing:.12em;
  padding:4px 8px;border-radius:6px;border:1.5px solid var(--border-strong);}
.tag-live{background:var(--flag);color:var(--flag-ink);border-color:var(--flag);}
.tag-onink{background:transparent;color:var(--surface-2);border-color:var(--surface-2);}
.section-eyebrow{font-size:11px;letter-spacing:.14em;color:var(--muted);margin:22px 0 10px;}

.course-card{display:flex;flex-direction:column;gap:6px;width:100%;text-align:left;
  border:2px solid var(--border-strong);border-radius:var(--radius);
  padding:22px 20px;margin-bottom:12px;cursor:pointer;transition:transform .07s ease;}
.course-card:active{transform:scale(.985);}
.course-black{background:var(--ink);color:var(--surface-2);}
.course-white{background:var(--surface);}
.course-name{font-size:46px;line-height:.85;}
.course-par{font-size:12px;letter-spacing:.08em;opacity:.8;}
.cc-top{display:flex;align-items:center;justify-content:space-between;width:100%;}
.cc-arrow{font-size:22px;font-weight:700;opacity:.55;}

.how-grid{display:flex;flex-direction:column;gap:8px;margin-bottom:16px;}
.how-step{display:flex;align-items:center;gap:12px;background:var(--surface);
  border:1.5px solid var(--border);border-radius:12px;padding:12px 14px;}
.how-emoji{font-size:22px;flex:none;width:26px;text-align:center;}
.how-text{font-size:14px;color:var(--ink-soft);line-height:1.35;}
.how-text b{color:var(--ink);font-weight:700;}

.btn-stats{background:var(--ink);color:var(--surface-2);border:2px solid var(--ink);
  font-family:'Bebas Neue',sans-serif;font-size:19px;letter-spacing:.06em;font-weight:400;}
.btn-stats:active{transform:scale(.98);}

.card{background:var(--surface);border:2px solid var(--border-strong);border-radius:var(--radius);padding:16px;margin-bottom:12px;}
.card-ink{background:var(--ink);color:var(--surface-2);border-color:var(--ink);}
.resume-card{margin-bottom:14px;}
.resume-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.resume-hole{font-size:14px;letter-spacing:.06em;}
.resume-course{font-size:34px;line-height:.9;margin-bottom:12px;}
.resume-meta{font-size:11px;letter-spacing:.06em;opacity:.72;margin-top:12px;}
.chips{display:flex;flex-wrap:wrap;gap:7px;}
.chip{font-size:13px;font-weight:500;padding:6px 11px;border-radius:20px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--ink);}
.chip-onink{background:transparent;border-color:rgba(248,243,230,.35);color:var(--surface-2);}
.chip-btn{cursor:pointer;border-color:var(--border-strong);font-weight:700;}
.chip-btn:active{transform:scale(.96);}

.privacy-note{margin-top:24px;font-size:13px;color:var(--muted);line-height:1.5;text-align:center;}
.privacy-note.tight{margin-top:4px;margin-bottom:14px;text-align:left;}

/* ---------- players ---------- */
.add-row{display:flex;gap:9px;margin-bottom:16px;}
.text-input{flex:1;border:2px solid var(--border-strong);border-radius:13px;
  padding:14px 15px;font-family:'DM Sans',sans-serif;font-size:16px;background:var(--surface-2);color:var(--ink);min-height:52px;}
.text-input::placeholder{color:var(--muted);}
.text-input:focus{outline:none;border-color:var(--accent);}
.add-btn{width:auto;padding:0 20px;}
.roster{margin-bottom:18px;}
.player-list{list-style:none;display:flex;flex-direction:column;gap:9px;margin-top:6px;}
.player-item{display:flex;align-items:center;gap:13px;background:var(--surface);
  border:2px solid var(--border-strong);border-radius:13px;padding:13px 15px;}
.player-num{font-size:13px;color:var(--muted);width:18px;}
.player-name{flex:1;font-size:17px;font-weight:500;}
.remove-x{width:34px;height:34px;border-radius:9px;border:1.5px solid var(--border);
  background:var(--surface-2);color:var(--muted);font-size:20px;line-height:1;cursor:pointer;flex:none;}
.remove-x:active{transform:scale(.94);}

.empty{text-align:center;padding:44px 20px;}
.empty-title{font-size:31px;color:var(--ink);margin-bottom:8px;}
.empty-sub{color:var(--muted);font-size:14px;line-height:1.5;max-width:32ch;margin:0 auto;}

/* ---------- scoring ---------- */
.scoring{background:var(--bg);}
.score-head{padding:calc(10px + env(safe-area-inset-top)) 16px 12px;background:var(--bg);border-bottom:1px solid var(--border);}
.score-head-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
.course-pill{font-size:11px;letter-spacing:.1em;padding:3px 9px;border:1.5px solid var(--border-strong);border-radius:6px;}
.hole-count{font-size:13px;color:var(--ink-soft);letter-spacing:.05em;}
.hole-line{display:flex;align-items:center;gap:11px;animation:pop .28s ease;}
@keyframes pop{from{opacity:.3;transform:translateY(3px);}to{opacity:1;transform:none;}}
.hole-big{font-size:46px;line-height:.85;color:var(--accent);}
.par-badge{font-size:15px;letter-spacing:.05em;font-weight:700;color:var(--flag-ink);
  background:var(--flag);border:none;border-radius:9px;padding:5px 11px;}
.hole-progress{margin-left:auto;font-size:12px;letter-spacing:.05em;color:var(--ink-soft);font-weight:700;}
.home-link{background:var(--surface);border:2px solid var(--border-strong);border-radius:11px;
  font-family:'JetBrains Mono',monospace;font-weight:700;font-size:14px;letter-spacing:.04em;
  color:var(--ink);padding:9px 14px;cursor:pointer;min-height:42px;}
.home-link:active{transform:scale(.97);}

.score-scroll{padding:12px 16px 4px;}

/* player selector strip */
.psel-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -16px 12px;padding:0 16px;}
.psel{display:flex;gap:8px;min-width:min-content;}
.pchip{flex:none;display:flex;flex-direction:column;align-items:center;gap:1px;
  min-width:62px;padding:8px 10px;border-radius:12px;cursor:pointer;
  border:2px solid var(--border);background:var(--surface);color:var(--ink-soft);
  transition:transform .06s ease;}
.pchip:active{transform:scale(.95);}
.pchip-num{font-size:9px;color:var(--muted);letter-spacing:.05em;}
.pchip-name{font-size:13px;font-weight:700;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.pchip-val{font-size:15px;font-weight:700;line-height:1;}
.pchip-done{border-color:var(--border-strong);}
.pchip-done .pchip-val{color:var(--green);}
.pchip-active{background:var(--ink);border-color:var(--ink);color:var(--surface-2);transform:translateY(-1px);
  box-shadow:0 3px 0 var(--flag);}
.pchip-active .pchip-num{color:rgba(251,252,246,.6);}
.pchip-active .pchip-val{color:var(--flag);}

/* focused single-player card */
.focus-card{background:var(--surface);border:2.5px solid var(--ink);border-radius:18px;
  padding:16px 16px 14px;animation:pop .22s ease;}
.focus-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;}
.focus-eyebrow{font-size:10px;letter-spacing:.14em;color:var(--muted);}
.focus-totals{display:flex;align-items:baseline;gap:9px;}
.focus-total{font-size:20px;font-weight:700;}
.focus-vs{font-size:15px;font-weight:700;}
.focus-name{font-size:40px;line-height:.9;margin:2px 0 15px;}
.focus-grid{gap:9px;}
.focus-grid .score-btn{min-height:66px;font-size:26px;}
.focus-hint{margin-top:12px;font-size:12px;color:var(--muted);line-height:1.4;text-align:center;}

.score-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.score-btn{
  min-height:56px;border:2px solid var(--border-strong);border-radius:12px;
  background:var(--surface-2);color:var(--ink);
  font-family:'JetBrains Mono',monospace;font-weight:700;font-size:22px;
  cursor:pointer;transition:transform .05s ease,background .1s ease;
}
.score-btn:active{transform:scale(.93);}
.score-btn.sel{background:var(--ink);color:var(--surface-2);border-color:var(--ink);}
.score-btn.sel-ace{background:var(--flag);color:var(--flag-ink);border-color:var(--flag);box-shadow:0 0 0 3px rgba(240,180,41,.28);}
.scroll-tail{height:4px;}

/* footer: leaderboard bar + nav + dots */
.score-footer{background:var(--bg);border-top:1px solid var(--border);
  padding:9px 16px calc(9px + env(safe-area-inset-bottom));}
.lb-bar{display:flex;align-items:center;justify-content:space-between;width:100%;
  background:var(--ink);color:var(--surface-2);border:none;border-radius:11px;
  padding:11px 14px;margin-bottom:9px;cursor:pointer;}
.lb-bar:active{transform:scale(.99);}
.lb-bar-left{display:flex;align-items:center;gap:8px;min-width:0;flex:1;}
.lb-bar-trophy{font-size:15px;flex:none;}
.lb-bar-name{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;letter-spacing:.05em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lb-bar-mid{display:flex;align-items:center;gap:13px;flex:none;}
.lb-bar-vs{font-size:25px;line-height:.9;}
.lb-bar-right{font-size:10px;letter-spacing:.08em;opacity:.7;}

.warn{background:#FBF1D6;border:2px solid var(--flag);border-radius:12px;padding:11px 13px;margin-bottom:9px;}
.warn-text{display:block;font-size:13px;color:var(--ink);line-height:1.4;margin-bottom:9px;font-weight:500;}
.warn-actions{display:flex;gap:9px;}
.warn-actions .btn{flex:1;}

.nav-row{display:flex;gap:10px;margin-bottom:9px;}
.nav-prev{flex:1;}
.nav-next{flex:1.6;}

.dots{display:flex;gap:5px;justify-content:space-between;}
.dot{flex:1;height:9px;border-radius:3px;border:none;background:var(--border);cursor:pointer;padding:0;transition:background .15s ease;}
.dot-partial{background:#E7CD8C;}
.dot-full{background:var(--ink);}
.dot-current{outline:2px solid var(--accent);outline-offset:1px;}

/* ---------- leaderboard sheet ---------- */
.sheet-scrim{position:fixed;inset:0;background:rgba(15,15,15,.42);
  display:flex;align-items:flex-end;justify-content:center;z-index:40;animation:fade .18s ease;}
@keyframes fade{from{opacity:0;}to{opacity:1;}}
.sheet{width:100%;max-width:560px;background:var(--bg);
  border-top-left-radius:22px;border-top-right-radius:22px;
  border:2px solid var(--border-strong);border-bottom:none;
  padding:10px 16px calc(22px + env(safe-area-inset-bottom));
  max-height:82dvh;overflow-y:auto;animation:slideup .26s cubic-bezier(.2,.8,.2,1);}
@keyframes slideup{from{transform:translateY(30px);opacity:.6;}to{transform:none;opacity:1;}}
.sheet-grip{width:40px;height:4px;border-radius:2px;background:var(--border);margin:2px auto 12px;}
.sheet-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.sheet-title{font-size:29px;}
.lb-row{display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:11px;
  padding:12px 14px;border:2px solid var(--border);border-radius:12px;margin-bottom:8px;background:var(--surface);}
.lb-row.rank-1{border-color:var(--flag);background:var(--surface);border-width:2.5px;}
.lb-rank{font-size:26px;line-height:1;color:var(--muted);text-align:center;}
.rank-1 .lb-rank{color:#B8860B;}
.lb-id{display:flex;flex-direction:column;gap:1px;min-width:0;}
.lb-name{font-size:17px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lb-thru{font-size:10px;color:var(--muted);letter-spacing:.03em;}
.lb-vs{font-size:36px;line-height:.85;text-align:right;min-width:56px;}

/* ---------- finished ---------- */
.finish-head{display:flex;align-items:center;gap:12px;padding-top:calc(6px + env(safe-area-inset-top));margin-bottom:16px;}
.finish-title{font-size:54px;line-height:.85;}
.saved-pill{background:var(--green);color:#fff;font-family:'JetBrains Mono',monospace;font-weight:700;
  font-size:11px;letter-spacing:.08em;padding:5px 10px;border-radius:7px;animation:fade .3s ease;}
.winner-card{padding:18px;}
.winner-name{font-size:42px;line-height:.9;margin:8px 0 6px;}
.winner-score{font-size:15px;letter-spacing:.05em;opacity:.85;}
.standing{display:flex;align-items:center;gap:13px;padding:13px 15px;}
.rank-badge{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;font-size:15px;font-weight:700;flex:none;border:2px solid var(--border-strong);}
.rk-1{background:var(--flag);color:var(--flag-ink);border-color:var(--flag);}
.rk-2{background:var(--ink);color:var(--surface-2);border-color:var(--ink);}
.rk-3{background:var(--surface-2);color:var(--ink);}
.rk-x{background:transparent;color:var(--muted);border-color:var(--border);}
.standing-name{flex:1;font-size:17px;font-weight:700;}
.standing-nums{display:flex;align-items:baseline;gap:9px;}
.standing-total{font-size:20px;font-weight:700;}
.standing-vs{font-size:13px;font-weight:700;}

.scorecard-wrap{overflow-x:auto;border:2px solid var(--border-strong);border-radius:12px;-webkit-overflow-scrolling:touch;}
.scorecard{border-collapse:collapse;font-size:12px;min-width:100%;}
.scorecard th,.scorecard td{padding:7px 6px;text-align:center;border-bottom:1px solid var(--border);white-space:nowrap;}
.scorecard thead th{background:var(--ink);color:var(--surface-2);font-size:11px;}
.sc-par th{background:var(--surface);color:var(--muted);font-weight:500;}
.sc-name{text-align:left !important;position:sticky;left:0;background:var(--surface);font-weight:700;padding-left:11px !important;padding-right:11px !important;}
.scorecard thead .sc-name{background:var(--ink);}
.sc-tot{font-weight:700;background:var(--surface-2);}
.sc-under{color:var(--green);font-weight:700;}
.sc-over{color:var(--red);}
.sc-even{color:var(--ink);}
.sc-muted{color:var(--border);}

.finish-actions{border-top:1px solid var(--border);}
.finish-row{display:flex;gap:10px;margin-bottom:10px;}
.finish-row .btn{flex:1;}

/* ---------- stats / local leaderboard ---------- */
.inline-confirm{display:flex;gap:8px;}

.stats-hero{margin:2px 0 16px;}
.stats-title{font-size:40px;line-height:.85;color:var(--ink);}
.stats-sub{font-size:13px;color:var(--muted);margin-top:6px;letter-spacing:.02em;}

/* segmented control */
.segmented{display:flex;gap:4px;background:var(--surface);border:2px solid var(--border-strong);
  border-radius:13px;padding:4px;margin-bottom:16px;}
.segmented-btn{flex:1;border:none;background:transparent;border-radius:9px;padding:11px 6px;
  font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px;letter-spacing:.06em;
  color:var(--ink-soft);cursor:pointer;transition:background .12s ease;min-height:42px;}
.segmented-btn.seg-active{background:var(--ink);color:var(--surface-2);}

/* summary strip */
.score-strip{display:flex;align-items:center;background:var(--ink);border-radius:14px;
  padding:14px 8px;margin-bottom:16px;}
.strip-cell{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;}
.strip-num{font-size:32px;line-height:.9;color:var(--surface-2);}
.strip-lbl{font-size:9px;letter-spacing:.12em;font-family:'JetBrains Mono',monospace;color:rgba(251,252,246,.6);}
.strip-div{width:1.5px;align-self:stretch;background:rgba(251,252,246,.18);margin:2px 0;}

/* podium */
.podium{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:20px;align-items:end;}
.podium-card{display:flex;flex-direction:column;align-items:center;gap:2px;
  border:2px solid var(--border-strong);border-radius:14px;padding:12px 6px 11px;background:var(--surface);}
.podium-medal{font-size:20px;line-height:1;}
.podium-name{font-size:13px;font-weight:700;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.podium-best{font-size:34px;line-height:.85;margin-top:2px;}
.podium-vs{font-size:12px;font-weight:700;}
.podium-rounds{font-size:9px;color:var(--muted);letter-spacing:.06em;margin-top:1px;}
.podium-card.medal-1{background:var(--flag);border-color:var(--flag);order:2;padding-top:18px;padding-bottom:15px;}
.podium-card.medal-1 .podium-name,.podium-card.medal-1 .podium-best{color:var(--flag-ink);}
.podium-card.medal-1 .podium-rounds{color:rgba(19,36,27,.65);}
.podium-card.medal-2{order:1;border-color:#9AA7A0;}
.podium-card.medal-3{order:3;border-color:#C08A57;}

/* main leaderboard */
.board-heading{font-size:11px;letter-spacing:.12em;color:var(--muted);margin:0 0 10px;}
.leaderboard-list{display:flex;flex-direction:column;gap:8px;margin-bottom:22px;}
.leaderboard-row{display:flex;align-items:center;gap:12px;background:var(--surface);
  border:2px solid var(--border);border-radius:13px;padding:12px 14px;}
.leaderboard-row.lb-first{border-color:var(--flag);border-width:2.5px;}
.rank-medal{font-size:22px;line-height:1;min-width:34px;text-align:center;color:var(--muted);flex:none;}
.rank-medal.medal-1,.rank-medal.medal-2,.rank-medal.medal-3{font-size:24px;}
.lb-main{flex:1;min-width:0;}
.lb-line1{display:flex;align-items:baseline;justify-content:space-between;gap:10px;}
.lb-player{font-size:17px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.lb-scorewrap{display:flex;align-items:baseline;gap:8px;flex:none;}
.lb-best{font-size:22px;font-weight:700;}
.stat-pill{font-size:13px;font-weight:700;border:1.5px solid var(--border);border-radius:7px;padding:1px 6px;}
.lb-line2{font-size:11px;color:var(--muted);letter-spacing:.03em;margin-top:3px;}

/* secondary mini-boards */
.mini-boards{display:flex;flex-direction:column;gap:12px;margin-bottom:20px;}
.mini-board{background:var(--surface-2);border:1.5px solid var(--border);border-radius:14px;padding:14px 15px;}
.mini-title{font-size:19px;line-height:1;margin-bottom:9px;color:var(--ink);}
.mini-row{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:8px 0;border-top:1px solid var(--border);}
.mini-row:first-of-type{border-top:none;}
.mini-name{font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mini-val{font-size:16px;font-weight:700;flex:none;}
.mini-unit{font-size:11px;color:var(--muted);font-weight:400;}
.mini-empty{font-size:13px;color:var(--muted);padding:4px 0;}

/* manage data (quiet) */
.manage-data{margin-top:6px;border-top:1px solid var(--border);padding-top:12px;}
.manage-toggle{background:none;border:none;color:var(--muted);font-family:'DM Sans',sans-serif;
  font-size:13px;cursor:pointer;padding:6px 0;}
.manage-body{margin-top:8px;}
.manage-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-top:1px solid var(--border);}
.manage-name{font-size:15px;color:var(--ink-soft);}
.manage-del{background:none;border:none;color:var(--red);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;cursor:pointer;padding:6px 4px;}
.manage-all{margin-top:12px;}

.board-empty{padding:40px 20px;}

@media (prefers-reduced-motion: reduce){
  *{animation:none !important;transition:none !important;}
}
`;
