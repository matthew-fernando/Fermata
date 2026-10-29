<script lang="ts">
  import { tick, startWork, startBreak, startIdle, type TimerState } from './lib/timer';
  import { loadState, saveState } from './lib/store';
  import { formatTime } from './lib/utils';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';

  let state = $state<TimerState>({
    mode: "idle",
    workElapsed: 0,
    workSinceBreak: 0,
    breakBalance: 0,
    wasOnBreak: false,
    sinceLongBreak: 0,
    longBreakThreshold: 7200,
    longBreakLength: 1500,
    ratio: 5,
    trayMode: "breakBalance"
  });

  // Replaces the modal concept with full page views
  let currentView = $state<'main' | 'settings'>('main');
  let lastTrayText = "";

  const appWindow = getCurrentWindow();

  $effect(() => {
    loadState(state).then((loaded) => state = loaded);
    let lastTickTime = Date.now();

    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastTickTime) / 1000);

      if (elapsedSeconds >= 1) {
        for (let i = 0; i < elapsedSeconds; i++) {
          state = tick(state);
        }
        lastTickTime += elapsedSeconds * 1000;
        if (state.mode !== "idle") saveState(state);

        let trayText = "";
        if (state.trayMode === "breakBalance") trayText = formatTime(state.breakBalance);
        else if (state.trayMode === "currentPeriod") trayText = formatTime(state.workSinceBreak);
        else if (state.trayMode === "totalSession") trayText = formatTime(state.workElapsed);
        else if (state.trayMode === "longBreak") trayText = formatTime(state.sinceLongBreak);

        if (trayText !== lastTrayText) {
          invoke('update_tray_text', { text: trayText }).catch(() => {});
          lastTrayText = trayText;
        }
      }
    }, 1000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - lastTickTime) / 1000);
        if (elapsedSeconds >= 1) {
          for (let i = 0; i < elapsedSeconds; i++) {
            state = tick(state);
          }
          lastTickTime += elapsedSeconds * 1000;
          if (state.mode !== "idle") saveState(state);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  });

  function handleAction(actionFn: (s: TimerState) => TimerState) {
    state = actionFn(state);
    saveState(state);
  }

  function toggleSettings() {
    currentView = currentView === 'main' ? 'settings' : 'main';
  }

  async function hideWindow() {
    await invoke('hide_window');
  }
  
  function handleDrag(e: MouseEvent) {
    // Prevent dragging if the user clicked the settings or close buttons
    if ((e.target as HTMLElement).closest('.header-right')) return;
    invoke('start_drag');
  }

  let longBreakProgress = $derived(
    Math.min(100, Math.round((state.sinceLongBreak / state.longBreakThreshold) * 100))
  );
</script>

<main class="container">
  <!-- Draggable Custom Title Bar -->
  <header onmousedown={handleDrag}>
    <div class="header-left">
      <h1>Fermata</h1>
      <div class="status-indicator">
        {#if state.mode === 'working'}
          <div class="dot blue-dot"></div>
        {:else if state.mode === 'onBreak'}
          <div class="dot green-dot"></div>
        {:else}
          <span class="pause-icon">⏸</span>
        {/if}
      </div>
    </div>
    
    <div class="header-right">
      <button class="icon-btn" onclick={toggleSettings} title="Settings">⚙️</button>
      <button class="icon-btn close-btn" onclick={hideWindow} title="Hide to Tray">✕</button>
    </div>
  </header>

  <div class="content-area">
    {#if currentView === 'main'}
      <!-- Landscape Split View -->
      <div class="main-view">
        <!-- Left Side: Core Balance & Controls -->
        <div class="left-col">
          <div class="card main-card" class:negative={state.breakBalance <= -1}>
            <span class="card-label">Break Balance</span>
            <span class="card-value">{formatTime(state.breakBalance)}</span>
          </div>
          
          <section class="controls">
            <button class="btn btn-work" class:active={state.mode === 'working'} onclick={() => handleAction(startWork)}>Work</button>
            <button class="btn btn-break" class:active={state.mode === 'onBreak'} onclick={() => handleAction(startBreak)}>Break</button>
            <button class="btn btn-idle" class:active={state.mode === 'idle'} onclick={() => handleAction(startIdle)}>Pause</button>
          </section>
        </div>

        <!-- Right Side: Session Stats & Progress -->
        <div class="right-col">
          <div class="card-row">
            <div class="card sub-card">
              <span class="card-label">Current Period</span>
              <span class="card-value">{formatTime(state.workSinceBreak)}</span>
            </div>
            <div class="card sub-card">
              <span class="card-label">Total Session</span>
              <span class="card-value">{formatTime(state.workElapsed)}</span>
            </div>
          </div>

          <section class="progress-section">
            <div class="progress-header">
              <span>Next Long Break</span>
              <span>{formatTime(state.sinceLongBreak)} / {formatTime(state.longBreakThreshold)}</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: {longBreakProgress}%"></div>
            </div>
          </section>
        </div>
      </div>

    {:else}
      <!-- Settings Page View -->
      <section class="settings-view">
        <div class="field">
          <label for="trayMode">Menu Bar Display:</label>
          <select id="trayMode" bind:value={state.trayMode} onchange={() => saveState(state)}>
            <option value="icon">Icon Only</option>
            <option value="breakBalance">Break Balance</option>
            <option value="currentPeriod">Current Period</option>
            <option value="totalSession">Total Session</option>
            <option value="longBreak">Long Break Progress</option>
          </select>
        </div>

        <div class="settings-row">
          <div class="field">
            <label for="ratio">Work Ratio (1 min break / X min work):</label>
            <input id="ratio" type="number" min="1" max="20" bind:value={state.ratio} onchange={() => saveState(state)} />
          </div>

          <div class="field">
            <label for="threshold">Bonus Interval (mins):</label>
            <input id="threshold" type="number" min="1" value={Math.round(state.longBreakThreshold / 60)} onchange={(e) => {
                state.longBreakThreshold = Number(e.currentTarget.value) * 60;
                saveState(state);
              }} />
          </div>

          <div class="field">
            <label for="length">Bonus Length (mins):</label>
            <input id="length" type="number" min="1" value={Math.round(state.longBreakLength / 60)} onchange={(e) => {
                state.longBreakLength = Number(e.currentTarget.value) * 60;
                saveState(state);
              }} />
          </div>
        </div>
      </section>
    {/if}
  </div>
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

  /* Global Window Container */
  :global(body) {
    margin: 0;
    overflow: hidden; /* Prevents scrollbars in fixed window */
    background: transparent;
  }

  .container {
    width: 100vw;
    height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    color: var(--text-primary);
    background-color: var(--bg-color);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    border: 1px solid #333;
    border-radius: 14px; /* Soft edges for frameless window */
  }

  /* Draggable Header */
  header { 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    padding: 0.75rem 1rem;
    background: #18181b;
    border-bottom: 1px solid #27272a;
    border-top-left-radius: 14px;
    border-top-right-radius: 14px;
    user-select: none;
    cursor: default;
    -webkit-app-region: drag;
  }
  
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  h1 { font-size: 1.1rem; margin: 0; font-weight: 700; pointer-events: none; }
  
  .status-indicator { display: flex; align-items: center; justify-content: center; width: 20px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .blue-dot { background-color: var(--accent-work); box-shadow: 0 0 8px rgba(78, 128, 238, 0.4); }
  .green-dot { background-color: var(--accent-break); box-shadow: 0 0 8px rgba(52, 211, 153, 0.4); }
  .pause-icon { font-size: 0.8rem; color: var(--accent-idle); }

  .header-right { display: flex; gap: 0.5rem; -webkit-app-region: no-drag;}
  .icon-btn { background: none; border: none; font-size: 1.1rem; cursor: pointer; padding: 0.25rem; color: var(--text-secondary); transition: color 0.2s;}
  .icon-btn:hover { color: var(--text-primary); }
  .close-btn:hover { color: var(--accent-negative); }

  /* Content Area */
  .content-area {
    padding: 1rem;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .main-view {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 1.5rem;
    height: 100%;
  }

  .left-col { display: flex; flex-direction: column; gap: 1rem; }
  .right-col { display: flex; flex-direction: column; justify-content: space-between; }

  /* Cards & Stats */
  .card { background: var(--card-bg); padding: 0.75rem 1rem; border-radius: var(--border-radius); display: flex; flex-direction: column; }
  .main-card { align-items: center; padding: 1.5rem 1rem; flex: 1; justify-content: center; }
  .main-card .card-value { font-size: 3rem; font-weight: 700; font-family: monospace; line-height: 1; margin-top: 0.25rem; }
  .main-card.negative .card-value { color: var(--accent-negative); }
  
  .card-row { display: grid; grid-template-columns: 1fr; gap: 0.5rem; }
  .sub-card { padding: 0.75rem; flex-direction: row; justify-content: space-between; align-items: center; }
  
  .card-label { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
  .card-value { font-size: 1.1rem; font-weight: 600; font-family: monospace;}

  /* Progress Bar */
  .progress-section { background: var(--card-bg); padding: 0.75rem; border-radius: var(--border-radius); }
  .progress-header { display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.4rem; }
  .progress-bar-bg { background: var(--bg-color); height: 6px; border-radius: 3px; overflow: hidden; }
  .progress-bar-fill { background: var(--accent-work); height: 100%; transition: width 0.3s ease; }

  /* Controls */
  .controls { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.5rem; }
  .btn { padding: 0.6rem 0.2rem; font-size: 0.85rem; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; background: var(--card-bg); color: var(--text-primary); transition: all 0.2s ease; }
  .btn.active.btn-work { background: var(--accent-work); color: #fff; }
  .btn.active.btn-break { background: var(--accent-break); color: #000; }
  .btn.active.btn-idle { background: var(--accent-idle); color: #000; }

  /* Settings View */
  .settings-view { display: flex; flex-direction: column; gap: 1rem; height: 100%; justify-content: center;}
  .settings-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.4rem; }
  .field label { font-size: 0.8rem; color: var(--text-secondary); }
  .field select, .field input { padding: 0.5rem; border-radius: 6px; border: 1px solid #333; background: var(--card-bg); color: var(--text-primary); font-size: 0.9rem; }
</style>