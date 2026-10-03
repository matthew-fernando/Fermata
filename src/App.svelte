<script lang="ts">
  import { tick, startWork, startBreak, startIdle, type TimerState } from './lib/timer';
  import { loadState, saveState } from './lib/store';
  import { formatTime } from './lib/utils';

  let state = $state<TimerState>({
    mode: "idle",
    workElapsed: 0,
    workSinceBreak: 0,
    breakBalance: 0,
    wasOnBreak: false,
    sinceLongBreak: 0,
    longBreakThreshold: 7200, // 2 hours default
    longBreakLength: 1500,     // 25 mins bonus default
    ratio: 5,
  });

  let showSettings = $state(false);

  $effect(() => {
    loadState(state).then((loaded) => {
      state = loaded;
    });

    const intervalId = setInterval(() => {
      state = tick(state);
      if (state.mode !== "idle") {
        saveState(state);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  });

  function handleAction(actionFn: (s: TimerState) => TimerState) {
    state = actionFn(state);
    saveState(state);
  }

  // Calculate percentage toward next long break bonus
  let longBreakProgress = $derived(
    Math.min(100, Math.round((state.sinceLongBreak / state.longBreakThreshold) * 100))
  );
</script>

<main class="container">
  <header>
    <h1>Fermata</h1>
    <button class="icon-btn" onclick={() => showSettings = !showSettings} title="Settings">
      ⚙️
    </button>
  </header>

  <!-- Status Badge -->
  <div class="status-badge mode-{state.mode}">
    {#if state.mode === 'working'}
      <span>● Working</span>
    {:else if state.mode === 'onBreak'}
      <span>● On Break</span>
    {:else}
      <span>⏸ Paused</span>
    {/if}
  </div>

  <!-- Primary Stat Cards -->
  <section class="readout-grid">
    <div class="card main-card" class:negative={state.breakBalance <= -1}>
      <span class="card-label">Break Balance</span>
      <span class="card-value">{formatTime(state.breakBalance)}</span>
    </div>

    <div class="card-row">
      <div class="card sub-card">
        <span class="card-label">Current Session</span>
        <span class="card-value">{formatTime(state.workSinceBreak)}</span>
      </div>
      <div class="card sub-card">
        <span class="card-label">Total Work</span>
        <span class="card-value">{formatTime(state.workElapsed)}</span>
      </div>
    </div>
  </section>

  <!-- Long Break Progress Bar -->
  <section class="progress-section">
    <div class="progress-header">
      <span>Next Long Break</span>
      <span>{formatTime(state.sinceLongBreak)} / {formatTime(state.longBreakThreshold)}</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width: {longBreakProgress}%"></div>
    </div>
  </section>

  <!-- Controls -->
  <section class="controls">
    <button 
      class="btn btn-work" 
      class:active={state.mode === 'working'} 
      onclick={() => handleAction(startWork)}
    >
      Work
    </button>
    <button 
      class="btn btn-break" 
      class:active={state.mode === 'onBreak'} 
      onclick={() => handleAction(startBreak)}
    >
      Take Break
    </button>
    <button 
      class="btn btn-idle" 
      class:active={state.mode === 'idle'} 
      onclick={() => handleAction(startIdle)}
    >
      Pause
    </button>
  </section>

  <!-- Settings Drawer / Modal -->
  {#if showSettings}
    <section class="settings-panel">
      <h2>Settings</h2>

      <div class="field">
        <label for="ratio">Work Ratio (1 min break per X min work):</label>
        <input 
          id="ratio" 
          type="number" 
          min="1" 
          max="20" 
          bind:value={state.ratio} 
          onchange={() => saveState(state)} 
        />
      </div>

      <div class="field">
        <label for="threshold">Long Break Interval (minutes):</label>
        <input 
          id="threshold" 
          type="number" 
          min="1" 
          value={Math.round(state.longBreakThreshold / 60)} 
          onchange={(e) => {
            state.longBreakThreshold = Number(e.currentTarget.value) * 60;
            saveState(state);
          }} 
        />
      </div>

      <div class="field">
        <label for="length">Long Break Bonus (minutes):</label>
        <input 
          id="length" 
          type="number" 
          min="1" 
          value={Math.round(state.longBreakLength / 60)} 
          onchange={(e) => {
            state.longBreakLength = Number(e.currentTarget.value) * 60;
            saveState(state);
          }} 
        />
      </div>
    </section>
  {/if}
</main>

<style>
  :root {
    --bg-color: #121214;
    --card-bg: #1e1e24;
    --text-primary: #f0f0f5;
    --text-secondary: #a0a0b0;
    --accent-work: #4e80ee;
    --accent-break: #34d399;
    --accent-idle: #9ca3af;
    --accent-negative: #f87171;
    --border-radius: 12px;
  }

  .container {
    max-width: 420px;
    margin: 0 auto;
    padding: 1.5rem;
    font-family: system-ui, -apple-system, sans-serif;
    color: var(--text-primary);
    background-color: var(--bg-color);
    min-height: 100vh;
    box-sizing: border-box;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  h1 {
    font-size: 1.5rem;
    margin: 0;
    font-weight: 700;
  }

  .icon-btn {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
  }

  .mode-working { background: rgba(78, 128, 238, 0.15); color: var(--accent-work); }
  .mode-onBreak { background: rgba(52, 211, 153, 0.15); color: var(--accent-break); }
  .mode-idle { background: rgba(156, 163, 175, 0.15); color: var(--accent-idle); }

  .readout-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .card {
    background: var(--card-bg);
    padding: 1rem;
    border-radius: var(--border-radius);
    display: flex;
    flex-direction: column;
  }

  .main-card {
    align-items: center;
    padding: 1.5rem 1rem;
  }

  .main-card .card-value {
    font-size: 3rem;
    font-weight: 700;
    font-mono: monospace;
  }

  .main-card.negative .card-value {
    color: var(--accent-negative);
  }

  .card-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .card-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }

  .card-value {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .progress-section {
    margin-bottom: 1.5rem;
  }

  .progress-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-bottom: 0.4rem;
  }

  .progress-bar-bg {
    background: var(--card-bg);
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-bar-fill {
    background: var(--accent-work);
    height: 100%;
    transition: width 0.3s ease;
  }

  .controls {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.75rem 0.5rem;
    border: none;
    border-radius: var(--border-radius);
    font-weight: 600;
    cursor: pointer;
    background: var(--card-bg);
    color: var(--text-primary);
    transition: all 0.2s ease;
  }

  .btn.active.btn-work { background: var(--accent-work); color: #fff; }
  .btn.active.btn-break { background: var(--accent-break); color: #000; }
  .btn.active.btn-idle { background: var(--accent-idle); color: #000; }

  .settings-panel {
    margin-top: 1.5rem;
    padding: 1rem;
    background: var(--card-bg);
    border-radius: var(--border-radius);
  }

  .settings-panel h2 {
    font-size: 1.1rem;
    margin-top: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .field label {
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .field input {
    padding: 0.5rem;
    border-radius: 6px;
    border: 1fr solid #333;
    background: var(--bg-color);
    color: var(--text-primary);
  }
</style>