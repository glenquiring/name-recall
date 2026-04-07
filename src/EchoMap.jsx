import { useState, useEffect, useRef, useCallback } from "react";

// --- Audio Engine ---
function createAudioContext() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

const CELL_FREQUENCIES = [
  [261.63, 293.66, 329.63, 349.23],
  [392.00, 440.00, 493.88, 523.25],
  [587.33, 659.25, 698.46, 783.99],
  [880.00, 987.77, 1046.50, 1174.66],
];

function playTone(ctx, freq, duration = 0.35) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration + 0.05);
}

function playError(ctx) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(120, ctx.currentTime);
  gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.45);
}

function playSuccess(ctx) {
  if (!ctx) return;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    setTimeout(() => playTone(ctx, f, 0.25), i * 100);
  });
}

function playRepeatSound(ctx) {
  if (!ctx) return;
  [440, 392].forEach((f, i) => {
    setTimeout(() => playTone(ctx, f, 0.18), i * 90);
  });
}

// --- Game Logic ---
const GRID_SIZE = 4;
const SPEED_START = 950;
const SPEED_MIN = 300;
const SPEED_STEP = 28;

// Grows every 3 correct rounds: 3,3,3,4,4,4,5,5,5...
function seqLength(level) {
  return Math.min(3 + Math.floor((level - 1) / 3), 12);
}

function generateSequence(length) {
  return Array.from({ length }, () => ({
    row: Math.floor(Math.random() * GRID_SIZE),
    col: Math.floor(Math.random() * GRID_SIZE),
    silent: false,
    dark: false,
  }));
}

function injectInterference(sequence, level) {
  if (level < 5) return sequence;
  return sequence.map(step => {
    const r = Math.random();
    if (r < 0.08) return { ...step, silent: true };
    if (r < 0.16) return { ...step, dark: true };
    return step;
  });
}

function speedLabel(ms) {
  if (ms >= 850) return "Slow";
  if (ms >= 650) return "Steady";
  if (ms >= 480) return "Brisk";
  if (ms >= 380) return "Fast";
  return "Max";
}

function Cell({ row, col, isLit, isDark, isCorrect, isWrong, onClick, disabled }) {
  const cls = [
    "cell",
    isLit && !isDark ? "cell-lit" : "",
    isLit && isDark ? "cell-dark-lit" : "",
    isCorrect ? "cell-correct" : "",
    isWrong ? "cell-wrong" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cls}
      aria-label={`Cell ${row}-${col}`}
    />
  );
}

const PHASE = {
  IDLE: "idle",
  SHOWING: "showing",
  DELAY: "delay",
  INPUT: "input",
  FEEDBACK: "feedback",
  GAMEOVER: "gameover",
};

export default function EchoMap() {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [sequence, setSequence] = useState([]);
  const [inputIndex, setInputIndex] = useState(0);
  const [litCell, setLitCell] = useState(null);
  const [litMeta, setLitMeta] = useState({ silent: false, dark: false });
  const [correctCell, setCorrectCell] = useState(null);
  const [wrongCell, setWrongCell] = useState(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [speedMs, setSpeedMs] = useState(SPEED_START);
  const [message, setMessage] = useState("");
  const [delayCountdown, setDelayCountdown] = useState(0);
  const [repeatUsed, setRepeatUsed] = useState(false);
  const [repeatFlash, setRepeatFlash] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const intervalRef = useRef(null);
  const seqRef = useRef([]);
  const speedRef = useRef(SPEED_START);

  const getAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = createAudioContext();
    if (audioRef.current.state === "suspended") audioRef.current.resume();
    return audioRef.current;
  }, []);

  function clearTimers() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  const enterInputPhase = useCallback(() => {
    setPhase(PHASE.INPUT);
    setInputIndex(0);
    setMessage("Reproduce the sequence");
  }, []);

  const playSequence = useCallback((onComplete) => {
    const ctx = getAudio();
    const seq = seqRef.current;
    const sp = speedRef.current;
    let i = 0;

    function showNext() {
      if (i >= seq.length) {
        setLitCell(null);
        onComplete();
        return;
      }
      const step = seq[i];
      setLitCell({ row: step.row, col: step.col });
      setLitMeta({ silent: step.silent, dark: step.dark });
      if (!step.silent) {
        playTone(ctx, CELL_FREQUENCIES[step.row][step.col], Math.max(sp * 0.00032, 0.12));
      }
      i++;
      timerRef.current = setTimeout(() => {
        setLitCell(null);
        timerRef.current = setTimeout(showNext, sp * 0.35);
      }, sp * 0.65);
    }

    timerRef.current = setTimeout(showNext, 500);
  }, [getAudio]);

  const startRound = useCallback((lvl, spd) => {
    clearTimers();
    const len = seqLength(lvl);
    const raw = generateSequence(len);
    const seq = injectInterference(raw, lvl);
    seqRef.current = seq;
    speedRef.current = spd;

    setSequence(seq);
    setInputIndex(0);
    setRepeatUsed(false);
    setLitCell(null);
    setCorrectCell(null);
    setWrongCell(null);
    setMessage("");
    setPhase(PHASE.SHOWING);

    playSequence(() => {
      const delay = lvl >= 6 ? (lvl >= 9 ? 3000 : 2000) : 0;
      if (delay > 0) {
        setPhase(PHASE.DELAY);
        let count = Math.ceil(delay / 1000);
        setDelayCountdown(count);
        intervalRef.current = setInterval(() => {
          count--;
          setDelayCountdown(count);
          if (count <= 0) {
            clearInterval(intervalRef.current);
            enterInputPhase();
          }
        }, 1000);
      } else {
        timerRef.current = setTimeout(enterInputPhase, 450);
      }
    });
  }, [playSequence, enterInputPhase]);

  function handleRepeat() {
    if (repeatUsed || phase !== PHASE.INPUT) return;
    clearTimers();
    const ctx = getAudio();
    playRepeatSound(ctx);
    setRepeatUsed(true);
    setRepeatFlash(true);
    setTimeout(() => setRepeatFlash(false), 600);
    setPhase(PHASE.SHOWING);
    setLitCell(null);
    setInputIndex(0);
    setMessage("");

    playSequence(() => {
      timerRef.current = setTimeout(enterInputPhase, 450);
    });
  }

  function handleCellClick(row, col) {
    if (phase !== PHASE.INPUT) return;
    const ctx = getAudio();
    const expected = sequence[inputIndex];

    if (row === expected.row && col === expected.col) {
      playTone(ctx, CELL_FREQUENCIES[row][col], 0.25);
      setCorrectCell({ row, col });
      setTimeout(() => setCorrectCell(null), 280);

      const nextIndex = inputIndex + 1;
      if (nextIndex >= sequence.length) {
        const newSpeed = Math.max(speedMs - SPEED_STEP, SPEED_MIN);
        const points = sequence.length * level * 10;
        const newScore = score + points;
        const newStreak = streak + 1;
        const newLevel = level + 1;

        setScore(newScore);
        setStreak(newStreak);
        setSpeedMs(newSpeed);
        speedRef.current = newSpeed;
        if (newScore > bestScore) setBestScore(newScore);
        playSuccess(ctx);
        setPhase(PHASE.FEEDBACK);
        setMessage(`+${points}  ·  ${speedLabel(newSpeed)}`);
        setLevel(newLevel);

        timerRef.current = setTimeout(() => startRound(newLevel, newSpeed), 1800);
      } else {
        setInputIndex(nextIndex);
      }
    } else {
      playError(ctx);
      setWrongCell({ row, col });
      setPhase(PHASE.GAMEOVER);
      if (score > bestScore) setBestScore(score);
      setMessage("Sequence broken");
      setStreak(0);
    }
  }

  function beginGame() {
    clearTimers();
    setScore(0);
    setLevel(1);
    setStreak(0);
    setSpeedMs(SPEED_START);
    speedRef.current = SPEED_START;
    startRound(1, SPEED_START);
  }

  function resetGame() {
    clearTimers();
    setPhase(PHASE.IDLE);
    setScore(0);
    setLevel(1);
    setStreak(0);
    setSpeedMs(SPEED_START);
    speedRef.current = SPEED_START;
    setSequence([]);
    setLitCell(null);
    setCorrectCell(null);
    setWrongCell(null);
    setMessage("");
    setRepeatUsed(false);
  }

  useEffect(() => () => clearTimers(), []);

  const isShowing = phase === PHASE.SHOWING;
  const isInput = phase === PHASE.INPUT;
  const isOver = phase === PHASE.GAMEOVER;
  const isIdle = phase === PHASE.IDLE;
  const isDelay = phase === PHASE.DELAY;
  const isFeedback = phase === PHASE.FEEDBACK;
  const seqLen = seqLength(level);
  const progressPct = isInput ? (inputIndex / sequence.length) * 100 : isFeedback ? 100 : 0;
  const speedPct = ((SPEED_START - speedMs) / (SPEED_START - SPEED_MIN)) * 100;

  return (
    <div className="echomap-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Syne:wght@400;600;800&display=swap');
        .echomap-root, .echomap-root *, .echomap-root *::before, .echomap-root *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .echomap-root {
          background: #040d1a;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Syne', sans-serif;
          border-radius: 12px;
          margin: -16px;
          padding: 12px;
        }
        .echomap-root .em-app {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 16px 12px 20px;
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
          position: relative;
        }
        .echomap-root .em-app::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 40% at 50% 10%, rgba(0,180,255,0.07) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 80% 80%, rgba(100,0,255,0.05) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }
        .echomap-root .em-header {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          position: relative;
          z-index: 1;
        }
        .echomap-root .logo {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 1.5rem;
          letter-spacing: 0.15em;
          color: #e8f4ff;
          text-transform: uppercase;
        }
        .echomap-root .logo span { color: #00c8ff; }
        .echomap-root .tagline {
          font-family: 'Space Mono', monospace;
          font-size: 0.65rem;
          letter-spacing: 0.2em;
          color: #4a7090;
          text-transform: uppercase;
        }
        .echomap-root .stats {
          width: 100%;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          position: relative;
          z-index: 1;
        }
        .echomap-root .stat {
          flex: 1;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px;
          padding: 6px 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .echomap-root .stat-label {
          font-family: 'Space Mono', monospace;
          font-size: 0.52rem;
          letter-spacing: 0.16em;
          color: #3a6080;
          text-transform: uppercase;
        }
        .echomap-root .stat-value {
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 1.05rem;
          color: #c8e8ff;
        }
        .echomap-root .stat-value.accent { color: #00c8ff; }

        .echomap-root .speed-meter-wrap {
          width: 100%;
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .echomap-root .speed-meter-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .echomap-root .speed-meter-label {
          font-family: 'Space Mono', monospace;
          font-size: 0.55rem;
          letter-spacing: 0.14em;
          color: #2a4a60;
          text-transform: uppercase;
        }
        .echomap-root .speed-meter-value {
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.1em;
          color: #4a8090;
          text-transform: uppercase;
        }
        .echomap-root .speed-bar-bg {
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.05);
          border-radius: 2px;
          overflow: hidden;
        }
        .echomap-root .speed-bar-fill {
          height: 100%;
          border-radius: 2px;
          transition: width 0.7s ease, background 0.7s ease;
        }

        .echomap-root .round-info {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
          position: relative;
          z-index: 1;
        }
        .echomap-root .pill {
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.1em;
          color: #4a7090;
          background: rgba(0,200,255,0.04);
          border: 1px solid rgba(0,200,255,0.12);
          border-radius: 20px;
          padding: 4px 12px;
          text-transform: uppercase;
        }
        .echomap-root .pill.active { color: #00c8ff; border-color: rgba(0,200,255,0.4); }

        .echomap-root .grid-wrap { position: relative; z-index: 1; }
        .echomap-root .grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: clamp(6px, 2vw, 10px);
          padding: clamp(10px, 3vw, 18px);
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          box-shadow: 0 0 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .echomap-root .cell {
          width: clamp(52px, 16vw, 72px);
          height: clamp(52px, 16vw, 72px);
          border-radius: 12px;
          background: rgba(10,30,60,0.8);
          border: 1px solid rgba(0,150,220,0.12);
          cursor: pointer;
          transition: background 0.08s, border-color 0.08s, box-shadow 0.08s, transform 0.08s;
          position: relative;
          overflow: hidden;
        }
        .echomap-root .cell::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at 40% 35%, rgba(255,255,255,0.08) 0%, transparent 65%);
        }
        .echomap-root .cell:hover:not(:disabled) {
          background: rgba(0,100,180,0.3);
          border-color: rgba(0,200,255,0.3);
          transform: scale(1.04);
        }
        .echomap-root .cell:active:not(:disabled) { transform: scale(0.96); }
        .echomap-root .cell:disabled { cursor: default; }
        .echomap-root .cell-lit {
          background: rgba(0,180,255,0.55) !important;
          border-color: rgba(0,220,255,0.9) !important;
          box-shadow: 0 0 20px rgba(0,200,255,0.6), 0 0 50px rgba(0,150,255,0.3), inset 0 0 15px rgba(255,255,255,0.15) !important;
          transform: scale(1.06) !important;
        }
        .echomap-root .cell-dark-lit {
          background: rgba(80,0,200,0.45) !important;
          border-color: rgba(140,0,255,0.8) !important;
          box-shadow: 0 0 20px rgba(120,0,255,0.5) !important;
          transform: scale(1.06) !important;
        }
        .echomap-root .cell-correct {
          background: rgba(0,220,120,0.5) !important;
          border-color: rgba(0,255,140,0.8) !important;
          box-shadow: 0 0 20px rgba(0,220,120,0.5) !important;
        }
        .echomap-root .cell-wrong {
          background: rgba(255,60,60,0.5) !important;
          border-color: rgba(255,80,80,0.9) !important;
          box-shadow: 0 0 25px rgba(255,60,60,0.6) !important;
          animation: echomap-shake 0.35s ease;
        }
        @keyframes echomap-shake {
          0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)}
          40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)}
        }

        .echomap-root .progress-bar {
          width: 100%;
          height: 3px;
          background: rgba(255,255,255,0.05);
          border-radius: 2px;
          overflow: hidden;
          position: relative;
          z-index: 1;
        }
        .echomap-root .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #0088cc, #00c8ff);
          border-radius: 2px;
          transition: width 0.2s ease;
        }

        .echomap-root .message-area {
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
        }
        .echomap-root .message {
          font-family: 'Space Mono', monospace;
          font-size: 0.7rem;
          letter-spacing: 0.12em;
          color: #5090b0;
          text-transform: uppercase;
          text-align: center;
        }
        .echomap-root .message.bright { color: #00c8ff; }
        .echomap-root .message.success { color: #00dd88; }
        .echomap-root .message.error { color: #ff5060; }
        .echomap-root .message.delay { color: #c8a000; font-size: 0.85rem; font-weight: 700; }

        .echomap-root .repeat-row {
          display: flex;
          justify-content: center;
          position: relative;
          z-index: 1;
          min-height: 38px;
          align-items: center;
        }
        .echomap-root .btn-repeat {
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 8px 22px;
          border-radius: 20px;
          border: 1px solid rgba(255,170,0,0.35);
          background: rgba(255,170,0,0.06);
          color: #bb8800;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .echomap-root .btn-repeat:hover:not(:disabled) {
          background: rgba(255,170,0,0.14);
          border-color: rgba(255,170,0,0.65);
          color: #ffbb00;
        }
        .echomap-root .btn-repeat:disabled {
          color: #263a50;
          border-color: rgba(255,255,255,0.05);
          background: transparent;
          cursor: default;
        }
        .echomap-root .btn-repeat.flashing {
          background: rgba(255,170,0,0.22) !important;
          border-color: rgba(255,200,0,0.8) !important;
          color: #ffcc00 !important;
        }

        .echomap-root .em-btn {
          font-family: 'Syne', sans-serif;
          font-weight: 700;
          font-size: 0.9rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 14px 36px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
          position: relative;
          z-index: 1;
        }
        .echomap-root .em-btn-primary {
          background: linear-gradient(135deg, #0066cc, #00a8ff);
          color: #fff;
          box-shadow: 0 4px 20px rgba(0,150,255,0.35);
        }
        .echomap-root .em-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,150,255,0.5); }
        .echomap-root .em-btn-ghost {
          background: transparent;
          color: #3a6080;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .echomap-root .em-btn-ghost:hover { color: #7ab0d0; border-color: rgba(255,255,255,0.18); }
        .echomap-root .em-btn-row { display: flex; gap: 10px; }

        .echomap-root .over-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          position: relative;
          z-index: 1;
          width: 100%;
        }
        .echomap-root .over-title {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 1.3rem;
          letter-spacing: 0.1em;
          color: #ff5060;
          text-transform: uppercase;
        }
        .echomap-root .over-score {
          font-family: 'Space Mono', monospace;
          font-size: 2.2rem;
          font-weight: 700;
          color: #c8e8ff;
        }
        .echomap-root .over-sub {
          font-family: 'Space Mono', monospace;
          font-size: 0.62rem;
          letter-spacing: 0.14em;
          color: #3a6080;
          text-transform: uppercase;
          text-align: center;
          line-height: 1.9;
        }

        .echomap-root .idle-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          text-align: center;
          position: relative;
          z-index: 1;
        }
        .echomap-root .idle-desc {
          font-family: 'Space Mono', monospace;
          font-size: 0.66rem;
          line-height: 1.95;
          color: #3a6080;
          letter-spacing: 0.05em;
          max-width: 320px;
        }
        .echomap-root .idle-desc b { color: #5a9ab8; }

        .echomap-root .legend {
          display: flex;
          gap: 16px;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
        }
        .echomap-root .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'Space Mono', monospace;
          font-size: 0.56rem;
          letter-spacing: 0.08em;
          color: #2a4a60;
          text-transform: uppercase;
        }
        .echomap-root .legend-dot { width: 10px; height: 10px; border-radius: 3px; }
        .echomap-root .dot-blue { background: rgba(0,180,255,0.6); border: 1px solid rgba(0,220,255,0.8); }
        .echomap-root .dot-purple { background: rgba(100,0,220,0.5); border: 1px solid rgba(140,0,255,0.7); }

        .echomap-root .tip-toggle {
          font-family: 'Space Mono', monospace;
          font-size: 0.58rem;
          letter-spacing: 0.14em;
          color: #2a4a60;
          text-transform: uppercase;
          cursor: pointer;
          background: none;
          border: none;
          padding: 4px 0;
          position: relative;
          z-index: 1;
          text-decoration: underline;
          text-decoration-color: #1a3040;
        }
        .echomap-root .tip-toggle:hover { color: #4a7090; }
        .echomap-root .tip-box {
          background: rgba(0,180,255,0.03);
          border: 1px solid rgba(0,180,255,0.1);
          border-radius: 12px;
          padding: 16px 18px;
          width: 100%;
          position: relative;
          z-index: 1;
        }
        .echomap-root .tip-text {
          font-family: 'Space Mono', monospace;
          font-size: 0.63rem;
          line-height: 1.75;
          color: #3a6080;
          letter-spacing: 0.04em;
        }
        .echomap-root .tip-text b { color: #0090b8; }

        @media (max-width: 400px) {
          .echomap-root .em-app { gap: 8px; padding: 10px 8px 14px; }
          .echomap-root .logo { font-size: 1.2rem; }
          .echomap-root .tagline { font-size: 0.55rem; }
          .echomap-root .stat { padding: 4px 4px; }
          .echomap-root .stat-value { font-size: 0.9rem; }
          .echomap-root .stat-label { font-size: 0.45rem; }
          .echomap-root .idle-desc { font-size: 0.58rem; line-height: 1.7; }
          .echomap-root .em-btn { padding: 12px 28px; font-size: 0.8rem; }
        }
        @media (max-height: 700px) {
          .echomap-root .em-app { gap: 6px; padding: 8px 8px 12px; }
          .echomap-root .em-header { gap: 2px; }
          .echomap-root .logo { font-size: 1.1rem; }
          .echomap-root .tagline { display: none; }
          .echomap-root .stat { padding: 4px 4px; }
          .echomap-root .stat-value { font-size: 0.85rem; }
          .echomap-root .idle-desc { font-size: 0.56rem; line-height: 1.6; }
          .echomap-root .idle-desc br + br { display: none; }
          .echomap-root .em-btn { padding: 10px 24px; font-size: 0.78rem; }
          .echomap-root .over-score { font-size: 1.6rem; }
          .echomap-root .over-title { font-size: 1rem; }
        }
      `}</style>

      <div className="em-app">

        <div className="em-header">
          <div className="logo">Echo<span>Map</span></div>
          <div className="tagline">Visual · Auditory · Memory Training</div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat-label">Score</div>
            <div className="stat-value accent">{score.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Level</div>
            <div className="stat-value">{level}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Streak</div>
            <div className="stat-value">{streak}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Best</div>
            <div className="stat-value">{bestScore.toLocaleString()}</div>
          </div>
        </div>

        {!isIdle && !isOver && (
          <div className="speed-meter-wrap">
            <div className="speed-meter-header">
              <div className="speed-meter-label">Playback speed — earns with correct rounds</div>
              <div className="speed-meter-value">{speedLabel(speedMs)}</div>
            </div>
            <div className="speed-bar-bg">
              <div
                className="speed-bar-fill"
                style={{
                  width: `${speedPct}%`,
                  background: speedMs > 650
                    ? "linear-gradient(90deg, #0055aa, #0099cc)"
                    : speedMs > 430
                    ? "linear-gradient(90deg, #006699, #00ccaa)"
                    : "linear-gradient(90deg, #00aa66, #00ffaa)",
                }}
              />
            </div>
          </div>
        )}

        {!isIdle && !isOver && (
          <div className="round-info">
            <div className={`pill ${isShowing ? "active" : ""}`}>
              {isShowing ? "▶ Watch"
                : isDelay ? `Hold · ${delayCountdown}s`
                : isInput ? "● Recall"
                : isFeedback ? "✓ Correct"
                : "···"}
            </div>
            <div className="pill">{seqLen} step{seqLen !== 1 ? "s" : ""}</div>
          </div>
        )}

        <div className="grid-wrap">
          <div className="grid">
            {Array.from({ length: GRID_SIZE }, (_, row) =>
              Array.from({ length: GRID_SIZE }, (_, col) => {
                const isLit = litCell?.row === row && litCell?.col === col;
                const isCorrect = correctCell?.row === row && correctCell?.col === col;
                const isWrong = wrongCell?.row === row && wrongCell?.col === col;
                return (
                  <Cell
                    key={`${row}-${col}`}
                    row={row} col={col}
                    isLit={isLit}
                    isDark={isLit && litMeta.dark}
                    isCorrect={isCorrect}
                    isWrong={isWrong}
                    onClick={() => handleCellClick(row, col)}
                    disabled={!isInput}
                  />
                );
              })
            )}
          </div>
        </div>

        {!isIdle && !isOver && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        )}

        <div className="message-area">
          {isDelay ? (
            <div className="message delay">{delayCountdown}</div>
          ) : message ? (
            <div className={`message ${
              message.includes("+") ? "success" :
              message.includes("broken") ? "error" :
              message.includes("Reproduce") ? "bright" : ""
            }`}>{message}</div>
          ) : isShowing ? (
            <div className="message bright">Watch the sequence</div>
          ) : null}
        </div>

        {!isIdle && !isOver && (
          <div className="repeat-row">
            <button
              className={`btn-repeat ${repeatFlash ? "flashing" : ""}`}
              onClick={handleRepeat}
              disabled={repeatUsed || phase !== PHASE.INPUT}
              title={repeatUsed ? "Already used this round" : "Replay the sequence once"}
            >
              {repeatUsed ? "↺  Replay used" : "↺  Replay sequence"}
            </button>
          </div>
        )}

        {isIdle && (
          <div className="idle-content">
            <div className="idle-desc">
              Watch the pattern. Reproduce it from memory.<br />
              <b>Speed increases only when you succeed.</b><br />
              <b>One replay per round.</b>
            </div>
            <button className="em-btn em-btn-primary" onClick={beginGame}>
              Begin Training
            </button>
            <button className="tip-toggle" onClick={() => setShowTip(t => !t)}>
              {showTip ? "Hide" : "Why this works"} ↓
            </button>
            {showTip && (
              <div className="tip-box">
                <div className="tip-text">
                  <b>Echo Map trains multimodal binding</b> — linking visual location, spatial memory, and auditory tone into a single chunk. <b>Speed increases only on correct responses</b>, so your pace reflects actual capacity. The <b>replay option</b> mirrors spaced repetition logic.
                </div>
              </div>
            )}
          </div>
        )}

        {isOver && (
          <div className="over-panel">
            <div className="over-title">Sequence Broken</div>
            <div className="over-score">{score.toLocaleString()}</div>
            <div className="over-sub">
              Level {level}  ·  Speed: {speedLabel(speedMs)}<br />
              {streak > 0 ? `${streak}-round streak` : "No streak built"}
            </div>
            <div className="em-btn-row">
              <button className="em-btn em-btn-primary" onClick={beginGame}>Try Again</button>
              <button className="em-btn em-btn-ghost" onClick={resetGame}>Reset</button>
            </div>
          </div>
        )}

        {!isIdle && !isOver && level >= 5 && (
          <div className="legend">
            <div className="legend-item"><div className="legend-dot dot-blue" />Flash + Tone</div>
            <div className="legend-item"><div className="legend-dot dot-purple" />Flash only</div>
          </div>
        )}

      </div>
    </div>
  );
}
