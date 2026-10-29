<script lang="ts">
  import { tick, startWork, startBreak, startIdle, resetTimers, restStage, type TimerState } from './lib/timer';
  import { loadState, saveState } from './lib/store';
  import { formatTime } from './lib/utils';
  import { untrack } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';

  let state = $state<TimerState>({
    mode: "idle",
    workElapsed: 0,
    workSinceBreak: 0,
    breakBalance: 0,
    wasOnBreak: false,
    sinceLongBreak: 0,
    longBreakEarned: false,
    longBreakThreshold: 7200,
    longBreakLength: 1500,
    ratio: 5,
    trayMode: "breakBalance",
    theme: "dark"
  });

  let currentView = $state<'main' | 'settings'>('main');
  let lastTrayText = "";
  let lastTrayIcon = "fermata";

  $effect(() => {
    // untrack: reading `state` here must not make this effect re-run when the
    // loaded state is assigned, or it would reload forever and never tick
    untrack(() => loadState(state)).then((loaded) => state = loaded);
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
        else if (state.trayMode === "longBreak") trayText = `${Math.floor((state.sinceLongBreak / state.longBreakThreshold) * 100)}%`;

        if (trayText !== lastTrayText) {
          invoke('update_tray_text', { text: trayText }).catch(() => {});
          lastTrayText = trayText;
        }

        const trayIcon = restStage(state);
        if (trayIcon !== lastTrayIcon) {
          invoke('set_tray_icon', { stage: trayIcon }).catch(() => {});
          lastTrayIcon = trayIcon;
        }
      }
    }, 1000);

    // Count any seconds the interval missed while the window was hidden
    const catchUp = () => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastTickTime) / 1000);
      if (elapsedSeconds >= 1) {
        for (let i = 0; i < elapsedSeconds; i++) {
          state = tick(state);
        }
        lastTickTime += elapsedSeconds * 1000;
        if (state.mode !== "idle") saveState(state);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) catchUp();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Sent by the native three dots menu
    const unlistenSettings = listen('open-settings', () => { currentView = 'settings'; });

    // Sent when the tray icon reopens the window: settle elapsed time, then pause
    const unlistenShown = listen('window-shown', () => {
      catchUp();
      handleAction(startIdle);
    });

    return () => {
      clearInterval(intervalId);
      unlistenSettings.then((unlisten) => unlisten());
      unlistenShown.then((unlisten) => unlisten());
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  });

  function handleAction(actionFn: (s: TimerState) => TimerState) {
    state = actionFn(state);
    saveState(state);
  }

  function setTheme(theme: TimerState['theme']) {
    state.theme = theme;
    saveState(state);
  }

  async function hideWindow() {
    await invoke('hide_window');
  }

  // Native popup menu under the three dots button
  async function openMenu(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    await invoke('show_menu', { x: rect.left, y: rect.bottom + 4 });
  }

  // No native app menu in a menu bar only app, so shortcuts are handled here
  function handleKeydown(e: KeyboardEvent) {
    if (!e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === ',') currentView = 'settings';
    else if (key === 'q') invoke('quit_app');
    else if (key === 'w') hideWindow();
    else return;
    e.preventDefault();
  }

  // The whole window drags, except its interactive parts
  function handleDrag(e: MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, label, textarea')) return;
    invoke('start_drag');
  }

  let breakStage = $derived(restStage(state));

  let longBreakProgress = $derived(
    Math.min(100, Math.round((state.sinceLongBreak / state.longBreakThreshold) * 100))
  );
</script>

{#snippet time(seconds: number)}
  {#each formatTime(seconds).split(':') as part, i}{#if i > 0}<span class="colon">:</span>{/if}{part}{/each}
{/snippet}

{#snippet quarterRestIcon()}
  <svg viewBox="0.5 0.4 23 23" aria-hidden="true">
    <path d="M10.3 3 L14.9 8.3 C13.4 9.6 12.6 11 13.1 12.7 L15.6 16.4 C13.4 15.6 11.1 16 10.9 18 C10.8 19.4 11.7 20.6 12.9 21.6 C10.5 21 8.8 19.5 9 17.4 C9.2 15.6 10.8 14.6 12.4 14.7 L9.2 10.6 C10.8 9.3 11.6 8 11.6 6.4 Z" fill="currentColor" />
  </svg>
{/snippet}

<!-- Half rest sits on its line; whole rest hangs below it -->
{#snippet halfRestIcon()}
  <svg viewBox="0.5 0.4 23 23" aria-hidden="true">
    <rect x="3.5" y="13.2" width="17" height="1.5" rx="0.4" fill="currentColor" />
    <rect x="7" y="8.4" width="10" height="5" rx="0.4" fill="currentColor" />
  </svg>
{/snippet}

{#snippet wholeRestIcon()}
  <svg viewBox="0.5 0.4 23 23" aria-hidden="true">
    <rect x="3.5" y="9.3" width="17" height="1.5" rx="0.4" fill="currentColor" />
    <rect x="7" y="10.6" width="10" height="5" rx="0.4" fill="currentColor" />
  </svg>
{/snippet}

{#snippet fermataIcon()}
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 17 A10 10 0 0 1 22 17 L20.4 17 A8.4 7.6 0 0 0 3.6 17 Z" fill="currentColor" />
    <circle cx="12" cy="15.2" r="1.7" fill="currentColor" />
  </svg>
{/snippet}

{#snippet noteIcon()}
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="9" cy="17.6" rx="3.6" ry="2.7" transform="rotate(-22 9 17.6)" fill="currentColor" />
    <rect x="11.6" y="3.5" width="1.5" height="14" fill="currentColor" />
    <path d="M13.1 3.5 C13.6 6.4 18.6 7.4 17.4 12.6 C17 10 15.4 8.9 13.1 8.6 Z" fill="currentColor" />
  </svg>
{/snippet}

{#snippet pauseIcon()}
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="7" y="5" width="3.2" height="14" rx="0.6" fill="currentColor" />
    <rect x="13.8" y="5" width="3.2" height="14" rx="0.6" fill="currentColor" />
  </svg>
{/snippet}

<svelte:window onkeydown={handleKeydown} />

<main class="app" data-theme={state.theme} onmousedown={handleDrag} role="presentation">
  <header>
    {#if currentView === 'settings'}
      <button class="chrome-btn" onclick={() => currentView = 'main'} aria-label="Back" title="Back">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6 L8.5 12 L14.5 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    {:else}
      <button class="chrome-btn" onclick={hideWindow} aria-label="Close window">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7 L17 17 M17 7 L7 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <span class="tip tip-start">Close Window ⌘W</span>
      </button>
    {/if}

    <div class="brand">
      <span class="brand-mark">{@render fermataIcon()}</span>
      <h1>Fermata</h1>
    </div>

    <div class="header-right">
      <button class="chrome-btn" onclick={() => handleAction(resetTimers)} aria-label="Reset timers">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5.5 12 A6.5 6.5 0 1 0 7.4 7.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <path d="M7.6 3.6 L7.4 7.4 L11.2 7.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="tip tip-end">Reset Timers</span>
      </button>
      <button class="chrome-btn" onclick={openMenu} aria-label="More">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.6" fill="currentColor" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <circle cx="18.5" cy="12" r="1.6" fill="currentColor" />
        </svg>
        <span class="tip tip-end">More</span>
      </button>
    </div>
  </header>

  {#if currentView === 'main'}
    <section class="main-view">
      <div class="balance">
        <span class="eyebrow">Break Balance</span>
        <span class="balance-value">{@render time(state.breakBalance)}</span>
      </div>

      <div class="stats">
        <div class="stat">
          <span class="eyebrow">Current Period</span>
          <span class="stat-value">{@render time(state.workSinceBreak)}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat">
          <span class="eyebrow">Total Session</span>
          <span class="stat-value">{@render time(state.workElapsed)}</span>
        </div>
      </div>

      <div
        class="progress"
        title="Next long break: {formatTime(state.sinceLongBreak)} / {formatTime(state.longBreakThreshold)}"
      >
        <div class="progress-fill" style="width: {longBreakProgress}%"></div>
      </div>

      <div class="controls">
        <button
          class="control"
          class:active={state.mode === 'onBreak'}
          onclick={() => handleAction(startBreak)}
          aria-label="Break"
        >
          {#if breakStage === 'whole'}
            {@render wholeRestIcon()}
          {:else if breakStage === 'half'}
            {@render halfRestIcon()}
          {:else if breakStage === 'quarter'}
            {@render quarterRestIcon()}
          {:else}
            {@render fermataIcon()}
          {/if}
          <span class="tip">Break</span>
        </button>
        <button
          class="control"
          class:active={state.mode === 'idle'}
          onclick={() => handleAction(startIdle)}
          aria-label="Pause"
        >
          {@render pauseIcon()}
          <span class="tip">Pause</span>
        </button>
        <button
          class="control"
          class:active={state.mode === 'working'}
          onclick={() => handleAction(startWork)}
          aria-label="Work"
        >
          {@render noteIcon()}
          <span class="tip">Work</span>
        </button>
      </div>
    </section>

  {:else}
    <section class="settings-view">
      <div class="settings-grid">
        <div class="field">
          <span class="eyebrow">Appearance</span>
          <div class="segmented" role="group" aria-label="Appearance">
            <button class:selected={state.theme === 'light'} onclick={() => setTheme('light')}>Light</button>
            <button class:selected={state.theme === 'dark'} onclick={() => setTheme('dark')}>Dark</button>
          </div>
        </div>

        <div class="field">
          <label class="eyebrow" for="trayMode">Menu Bar</label>
          <select id="trayMode" bind:value={state.trayMode} onchange={() => saveState(state)}>
            <option value="icon">Icon only</option>
            <option value="breakBalance">Break balance</option>
            <option value="currentPeriod">Current period</option>
            <option value="totalSession">Total session</option>
            <option value="longBreak">Long break progress</option>
          </select>
        </div>

        <div class="field">
          <label class="eyebrow" for="ratio">Work Ratio</label>
          <input id="ratio" type="number" min="1" max="20" bind:value={state.ratio} onchange={() => saveState(state)} />
          <span class="hint">1 min rest per {state.ratio} min work</span>
        </div>

        <div class="field">
          <label class="eyebrow" for="threshold">Long Break Every</label>
          <input id="threshold" type="number" min="1" value={Math.round(state.longBreakThreshold / 60)} onchange={(e) => {
              state.longBreakThreshold = Number(e.currentTarget.value) * 60;
              saveState(state);
            }} />
          <span class="hint">minutes of work</span>
        </div>

        <div class="field">
          <label class="eyebrow" for="length">Long Break Length</label>
          <input id="length" type="number" min="1" value={Math.round(state.longBreakLength / 60)} onchange={(e) => {
              state.longBreakLength = Number(e.currentTarget.value) * 60;
              saveState(state);
            }} />
          <span class="hint">minutes</span>
        </div>
      </div>
    </section>
  {/if}
</main>

<style>
  .app {
    --bg: #0c0c0c;
    --fg: #f4f4f2;
    --muted: #8c8c8a;
    --line: #2a2a2a;
    --hover: #1a1a1a;

    --serif: "Iowan Old Style", "Palatino", "Palatino Linotype", "Book Antiqua", Georgia, serif;

    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 10px 14px 14px;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--serif);
    border-radius: 16px;
    border: 1px solid var(--line);
    overflow: hidden;
  }

  .app[data-theme="light"] {
    --bg: #fbfbf9;
    --fg: #111111;
    --muted: #767674;
    --line: #dcdcda;
    --hover: #efefed;
  }

  button {
    font-family: inherit;
    color: inherit;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  svg { display: block; width: 100%; height: 100%; }

  /* Header: no banner, just floating controls */
  header {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    height: 38px;
  }

  .header-right {
    display: flex;
    justify-content: flex-end;
    gap: 2px;
  }

  .chrome-btn {
    position: relative;
    width: 26px;
    height: 26px;
    padding: 4px;
    border-radius: 7px;
    color: var(--muted);
    opacity: 0;
    transition: opacity 0.18s ease, color 0.15s ease, background 0.15s ease;
  }

  .app:hover .chrome-btn { opacity: 1; }
  .chrome-btn:hover { color: var(--fg); background: var(--hover); }
  .chrome-btn:focus-visible { opacity: 1; outline: 1px solid var(--muted); }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    pointer-events: none;
  }

  .brand-mark { width: 28px; height: 28px; }

  h1 {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 400;
    font-style: italic;
    letter-spacing: 0.04em;
  }

  .eyebrow {
    font-size: 0.66rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* Main view */
  .main-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding-top: 2px;
  }

  .balance {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .balance-value {
    font-size: 3.75rem;
    line-height: 1;
    font-weight: 400;
    font-variant-numeric: lining-nums tabular-nums;
    letter-spacing: -0.01em;
  }

  .stats {
    display: flex;
    align-items: center;
    gap: 28px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    min-width: 110px;
  }

  .stat-value {
    font-size: 1.25rem;
    font-variant-numeric: lining-nums tabular-nums;
  }

  .stat-divider {
    width: 1px;
    height: 28px;
    background: var(--line);
  }

  .progress {
    width: 60%;
    height: 2px;
    background: var(--line);
    border-radius: 1px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--fg);
    transition: width 0.3s ease;
  }

  .controls {
    display: flex;
    gap: 22px;
    padding-bottom: 12px;
  }

  /* Serif colons sit low, near the x-height; lift them to the middle of the digits */
  .colon {
    display: inline-block;
    transform: translateY(-0.1em);
  }

  .control {
    position: relative;
    width: 46px;
    height: 46px;
    padding: 11px;
    border-radius: 50%;
    border: 1px solid var(--line);
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .control:hover { background: var(--hover); border-color: var(--muted); }

  .control.active {
    background: var(--fg);
    color: var(--bg);
    border-color: var(--fg);
  }

  .tip {
    position: absolute;
    top: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.72rem;
    font-style: italic;
    color: var(--muted);
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease;
  }

  .control:hover .tip { opacity: 1; }

  /* Header tips wait 1.5s before fading in, and vanish right away on mouse out */
  .chrome-btn:hover .tip {
    opacity: 1;
    transition-delay: 1.5s;
  }

  /* Corner buttons: anchor tips to the outer edge so they stay inside the window */
  .tip-start {
    left: 0;
    transform: none;
  }

  .tip-end {
    left: auto;
    right: 0;
    transform: none;
  }

  /* Settings view */
  .settings-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-bottom: 10px;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .hint {
    font-size: 0.7rem;
    font-style: italic;
    color: var(--muted);
  }

  select,
  input {
    font-family: inherit;
    font-size: 0.9rem;
    color: var(--fg);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    padding: 3px 0;
    outline: none;
    appearance: none;
  }

  select { cursor: pointer; }
  select option { color: #111; }
  select:focus,
  input:focus { border-bottom-color: var(--fg); }

  .segmented {
    display: flex;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }

  .segmented button {
    flex: 1;
    padding: 4px 0;
    font-size: 0.85rem;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .segmented button:hover { background: var(--hover); }

  .segmented button.selected {
    background: var(--fg);
    color: var(--bg);
  }
</style>
