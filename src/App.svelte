<script lang="ts">
  import { tick, startWork, startBreak, startIdle, resetTimers, restStage, POMODORO_SETTINGS, MAX_RATIO, type TimerState } from './lib/timer';
  import { loadState, saveState } from './lib/store';
  import { formatTime } from './lib/utils';
  import { updateBrowserTab } from './lib/browserTab';
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getVersion } from '@tauri-apps/api/app';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { check, type Update } from '@tauri-apps/plugin-updater';
  import { relaunch } from '@tauri-apps/plugin-process';
  import { ask, message } from '@tauri-apps/plugin-dialog';

  // Mac app or the web version at app.fermata.study; both run this same code
  const isDesktop = isTauri();

  let state = $state<TimerState>({
    mode: "idle",
    workElapsed: 0,
    workSinceBreak: 0,
    breakBalance: 0,
    wasOnBreak: false,
    sinceLongBreak: 0,
    longBreakEarned: false,
    longBreakToCelebrate: false,
    ...POMODORO_SETTINGS,
    trayMode: "breakBalance",
    // The web version starts out matching the visitor's system
    theme: !isDesktop && matchMedia('(prefers-color-scheme: light)').matches ? "light" : "dark",
    alwaysOnTop: false,
    hasSeenIntro: false
  });

  let currentView = $state<'main' | 'settings' | 'howItWorks'>('main');
  let webMenuOpen = $state(false);

  // Long break reward: what's on screen now, and whether the balance is doing its
  // little pop after the reward closes
  type CelebrationSymbol = { icon: 'note' | 'quarter' | 'fermata'; style: string };
  let celebration = $state<{ minutes: number; symbols: CelebrationSymbol[] } | null>(null);
  let balancePop = $state(false);
  let celebrationTimeoutId: ReturnType<typeof setTimeout> | undefined;
  // document.hidden can lag behind hiding the window, so track that directly too
  let windowVisible = true;

  // Update found by the launch check or the menu's Check for Updates.
  // Dismissing the banner lasts until the app is quit and reopened.
  let availableUpdate = $state<Update | null>(null);
  let bannerDismissed = $state(false);
  let updating = $state(false);
  let lastTrayText = "";
  let lastTrayIcon = "fermata";

  $effect(() => {
    // untrack: reading `state` here must not make this effect re-run when the
    // loaded state is assigned, or it would reload forever and never tick
    untrack(() => loadState(state)).then((loaded) => {
      // Every launch starts paused; hiding and reopening the window doesn't
      state = startIdle(loaded);
      if (!state.hasSeenIntro) {
        currentView = 'howItWorks';
        state.hasSeenIntro = true;
      }
      saveState(state);
      if (isDesktop) {
        invoke('set_always_on_top', { enabled: state.alwaysOnTop })
          .then(() => invoke('bring_to_front'))
          .catch(() => {});
      }
      celebrateIfVisible();
    });
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
        celebrateIfVisible();
        if (!isDesktop) return;

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
      if (!document.hidden) {
        catchUp();
        celebrateIfVisible();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Sent by the native three dots menu
    const unlisteners = !isDesktop ? [] : [
      listen('open-settings', () => { currentView = 'settings'; }),
      listen('open-how-it-works', () => { currentView = 'howItWorks'; }),
      listen('check-updates', () => checkForUpdates(true)),
      // Sent whenever the window is shown from the menu bar or by reopening the app
      listen('window-shown', () => {
        windowVisible = true;
        catchUp();
        celebrateIfVisible();
      })
    ];

    // Check quietly on launch, then every 6 hours for long-running sessions
    if (isDesktop) checkForUpdates(false);
    const updateCheckId = isDesktop ? setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000) : undefined;

    return () => {
      clearInterval(intervalId);
      clearInterval(updateCheckId);
      unlisteners.forEach((unlistener) => unlistener.then((unlisten) => unlisten()));
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  });

  // Quiet checks only update the banner; a manual check always answers with a dialog
  async function checkForUpdates(manual: boolean) {
    let update: Update | null;
    try {
      update = await check();
    } catch {
      if (manual) {
        await message(`You're on Fermata ${await getVersion()}. Couldn't check for updates, so check your internet connection and try again.`, {
          title: 'Update Check Failed',
          kind: 'error'
        });
      }
      return;
    }

    availableUpdate = update;
    if (!manual) return;

    if (update) {
      const wantsUpdate = await ask(`Fermata ${update.version} is available. You're on ${update.currentVersion}.`, {
        title: 'Update Available',
        okLabel: 'Update',
        cancelLabel: 'Later'
      });
      if (wantsUpdate) installUpdate();
    } else {
      await message(`You're on Fermata ${await getVersion()}, the latest version.`, { title: "You're Up to Date" });
    }
  }

  // Downloads, verifies against the updater public key, installs, then restarts
  async function installUpdate() {
    if (!availableUpdate || updating) return;
    updating = true;
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch {
      updating = false;
      await message("The update couldn't be installed. Try again later.", {
        title: 'Update Failed',
        kind: 'error'
      });
    }
  }

  function handleAction(actionFn: (s: TimerState) => TimerState) {
    state = actionFn(state);
    saveState(state);
  }

  // 1 min rest per 5 min work, plus a 20 min long break every 100 min
  function usePomodoroRatio() {
    Object.assign(state, POMODORO_SETTINGS);
    saveState(state);
  }

  // Applies from the next second on; break time already earned is kept. Half-typed
  // values (empty, 0) are ignored so the timer never divides by nothing.
  function setRatio(ratio: number) {
    if (ratio >= 1 && ratio <= MAX_RATIO) {
      state.ratio = ratio;
      saveState(state);
    }
  }

  // When the field is left, clamp over-limit values and undo invalid ones
  function commitRatio(input: HTMLInputElement) {
    setRatio(Math.min(input.valueAsNumber, MAX_RATIO));
    input.value = String(state.ratio);
  }

  function commitMinutes(input: HTMLInputElement, field: 'longBreakThreshold' | 'longBreakLength') {
    if (input.valueAsNumber >= 1) {
      state[field] = Math.round(input.valueAsNumber * 60);
      saveState(state);
    }
    input.value = String(Math.round(state[field] / 60));
  }

  function minutesText(minutes: number) {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }

  // Plays the long break reward once the user can see it. If the window is hidden
  // the reward waits, and this runs again when the window comes back.
  function celebrateIfVisible() {
    if (!state.longBreakToCelebrate || !windowVisible || document.hidden) return;
    state.longBreakToCelebrate = false;
    saveState(state);

    const icons: CelebrationSymbol['icon'][] = ['note', 'quarter', 'fermata'];
    const symbols = Array.from({ length: 18 }, (_, i) => ({
      icon: icons[i % icons.length],
      style: `left: ${Math.random() * 96}%; --size: ${14 + Math.random() * 16}px; --delay: ${Math.random() * 1.4}s; --duration: ${2 + Math.random() * 1.2}s; --drift: ${-30 + Math.random() * 60}px; --spin: ${-40 + Math.random() * 80}deg;`
    }));
    celebration = { minutes: Math.round(state.longBreakLength / 60), symbols };
    celebrationTimeoutId = setTimeout(dismissCelebration, 4000);
  }

  function dismissCelebration() {
    clearTimeout(celebrationTimeoutId);
    if (!celebration) return;
    celebration = null;
    balancePop = true;
  }

  function setAlwaysOnTop(enabled: boolean) {
    state.alwaysOnTop = enabled;
    invoke('set_always_on_top', { enabled }).catch(() => {});
    saveState(state);
  }

  function setTheme(theme: TimerState['theme']) {
    state.theme = theme;
    saveState(state);
  }

  async function hideWindow() {
    windowVisible = false;
    await invoke('hide_window');
  }

  // Native popup menu under the three dots button
  async function openMenu(e: MouseEvent) {
    if (!isDesktop) {
      webMenuOpen = !webMenuOpen;
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    await invoke('show_menu', { x: rect.left, y: rect.bottom + 4 });
  }

  // No native app menu in a menu bar only app, so shortcuts are handled here
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') webMenuOpen = false;
    // Browsers keep Cmd+W and Cmd+Q for themselves, so the web version leaves them alone
    if (!isDesktop && e.key !== ',') return;
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
    if (!isDesktop) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, label, textarea')) return;
    invoke('start_drag');
  }

  let logoStage = $derived(restStage(state));

  $effect(() => {
    if (isDesktop) return;
    updateBrowserTab(formatTime(state.breakBalance), logoStage);
    document.documentElement.dataset.theme = state.theme;
  });

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

{#snippet stageIcon(stage: string)}
  {#if stage === 'whole'}
    {@render wholeRestIcon()}
  {:else if stage === 'half'}
    {@render halfRestIcon()}
  {:else if stage === 'quarter'}
    {@render quarterRestIcon()}
  {:else}
    {@render fermataIcon()}
  {/if}
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

<svelte:window
  onkeydown={handleKeydown}
  onclick={(e) => {
    if (!(e.target as HTMLElement).closest('.menu-anchor')) webMenuOpen = false;
  }}
/>

<main class="app" class:web={!isDesktop} data-theme={state.theme} onmousedown={handleDrag} role="presentation">
  {#if availableUpdate && !bannerDismissed}
    <div class="update-banner" role="status">
      <span class="banner-text">Update available <span class="banner-version">v{availableUpdate.version}</span></span>
      <button class="banner-action" onclick={installUpdate} disabled={updating}>
        {updating ? 'Updating…' : 'Update Now'}
      </button>
      <button class="banner-close" onclick={() => bannerDismissed = true} aria-label="Dismiss update banner">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7 L17 17 M17 7 L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  {/if}

  <header>
    {#if currentView !== 'main'}
      <button class="chrome-btn" onclick={() => currentView = 'main'} aria-label="Back" title="Back">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6 L8.5 12 L14.5 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    {:else if !isDesktop}
      <!-- Nothing to close in a browser tab; keeps the logo centered -->
      <span></span>
    {:else}
      <button class="chrome-btn" onclick={hideWindow} aria-label="Close window">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7 L17 17 M17 7 L7 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <span class="tip tip-start">Close Window ⌘W</span>
      </button>
    {/if}

    <div class="brand">
      <span class="brand-mark">{@render stageIcon(logoStage)}</span>
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
      <div class="menu-anchor">
        <button class="chrome-btn" class:menu-open={webMenuOpen} onclick={openMenu} aria-label="More" aria-expanded={webMenuOpen}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5.5" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="18.5" cy="12" r="1.6" fill="currentColor" />
          </svg>
          <span class="tip tip-end">More</span>
        </button>
        {#if webMenuOpen}
          <div class="web-menu" role="menu">
            <button role="menuitem" onclick={() => { currentView = 'settings'; webMenuOpen = false; }}>Settings</button>
            <button role="menuitem" onclick={() => { currentView = 'howItWorks'; webMenuOpen = false; }}>How It Works</button>
            <div class="web-menu-rule"></div>
            <a role="menuitem" href="https://fermata.study">Get the Mac App</a>
          </div>
        {/if}
      </div>
    </div>
  </header>

  {#if currentView === 'main'}
    <section class="main-view">
      <div class="balance">
        <span class="eyebrow">Break Balance</span>
        <span class="balance-value" class:pop={balancePop} onanimationend={() => balancePop = false}>{@render time(state.breakBalance)}</span>
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
          {@render fermataIcon()}
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

  {:else if currentView === 'howItWorks'}
    <section class="guide-view">
      <div class="guide-row">
        <span class="guide-icon">{@render noteIcon()}</span>
        <p><strong>Work</strong> earns break time. Every {minutesText(state.ratio)} of work earns 1 minute of break.</p>
      </div>
      <div class="guide-row">
        <span class="guide-icon">{@render fermataIcon()}</span>
        <p><strong>Break</strong> spends it, whenever you choose. Your balance can dip below zero if you linger.</p>
      </div>
      <div class="guide-row">
        <span class="guide-icon">{@render pauseIcon()}</span>
        <p><strong>Pause</strong> stops the clock, so nothing is earned or spent.</p>
      </div>
      <div class="guide-row">
        <span class="guide-icon">{@render wholeRestIcon()}</span>
        <p><strong>Long breaks</strong> are a bonus: every {minutesText(Math.round(state.longBreakThreshold / 60))} of work adds {minutesText(Math.round(state.longBreakLength / 60))}. The progress bar shows how close you are, and the logo up top changes with it, from fermata to quarter, half, then whole rest.</p>
      </div>
      <div class="guide-footer">
        <span class="hint">
          {#if isDesktop}
            Closing this window keeps Fermata running in your menu bar.
          {:else}
            Your progress saves in this browser. Closing the tab stops the timer.
          {/if}
        </span>
        <button class="preset" onclick={() => currentView = 'main'}>Got It</button>
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

        {#if isDesktop}
        <div class="field">
          <span class="eyebrow">Always on Top</span>
          <div class="segmented" role="group" aria-label="Always on Top">
            <button class:selected={!state.alwaysOnTop} onclick={() => setAlwaysOnTop(false)}>Off</button>
            <button class:selected={state.alwaysOnTop} onclick={() => setAlwaysOnTop(true)}>On</button>
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
        {/if}

        <div class="field">
          <label class="eyebrow" for="ratio">Work Ratio</label>
          <input id="ratio" type="number" min="1" max={MAX_RATIO} value={state.ratio}
            oninput={(e) => setRatio(e.currentTarget.valueAsNumber)}
            onchange={(e) => commitRatio(e.currentTarget)} />
          <span class="hint">1 min rest per {state.ratio} min work</span>
        </div>

        <div class="field">
          <label class="eyebrow" for="threshold">Long Break Every</label>
          <input id="threshold" type="number" min="1" value={Math.round(state.longBreakThreshold / 60)}
            onchange={(e) => commitMinutes(e.currentTarget, 'longBreakThreshold')} />
          <span class="hint">minutes of work</span>
        </div>

        <div class="field">
          <label class="eyebrow" for="length">Long Break Length</label>
          <input id="length" type="number" min="1" value={Math.round(state.longBreakLength / 60)}
            onchange={(e) => commitMinutes(e.currentTarget, 'longBreakLength')} />
          <span class="hint">minutes</span>
        </div>

        <div class="field preset-field">
          <button class="preset" onclick={usePomodoroRatio}>Use Pomodoro Ratio</button>
        </div>
      </div>
    </section>
  {/if}

  {#if celebration}
    <button class="celebration" onclick={dismissCelebration} out:fade={{ duration: 350 }} aria-label="Long break earned. Dismiss.">
      {#each celebration.symbols as symbol}
        <span class="floating-symbol" style={symbol.style}>
          {#if symbol.icon === 'note'}
            {@render noteIcon()}
          {:else if symbol.icon === 'quarter'}
            {@render quarterRestIcon()}
          {:else}
            {@render fermataIcon()}
          {/if}
        </span>
      {/each}
      <span class="celebration-mark">{@render wholeRestIcon()}</span>
      <span class="celebration-title">Long break earned</span>
      <span class="celebration-detail">{minutesText(celebration.minutes)} added to your break balance</span>
    </button>
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

    position: relative;
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

  /* Web version: a card on the page instead of a whole window */
  .app.web {
    width: min(470px, 100%);
    height: auto;
    min-height: 310px;
  }

  /* Plenty of room on a desktop browser, so show it larger */
  @media (min-width: 900px) and (min-height: 620px) {
    .app.web { zoom: 1.35; }
  }

  @media (max-width: 500px) {
    .app.web .settings-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  /* Touchscreens can't hover to reveal these */
  @media (hover: none), (max-width: 500px) {
    .app .chrome-btn { opacity: 1; }
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

  /* Keep keyboard focus rings black and white instead of the system accent color */
  button:focus-visible {
    outline: 1px solid var(--muted);
    outline-offset: 2px;
  }

  svg { display: block; width: 100%; height: 100%; }

  /* Update banner: inverted colors (white in dark mode, black in light) so it stands out */
  .update-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: -10px -14px 4px;
    padding: 6px 8px 6px 16px;
    background: var(--fg);
    color: var(--bg);
    font-size: 0.8rem;
  }

  .banner-text {
    flex: 1;
    font-style: italic;
  }

  .banner-version {
    font-style: normal;
    opacity: 0.7;
    margin-left: 2px;
  }

  .banner-action {
    padding: 3px 11px;
    font-size: 0.75rem;
    background: var(--bg);
    color: var(--fg);
    border-radius: 999px;
    transition: opacity 0.15s ease;
  }

  .banner-action:hover { opacity: 0.85; }
  .banner-action:disabled { opacity: 0.6; cursor: default; }

  .banner-close {
    width: 20px;
    height: 20px;
    padding: 3px;
    border-radius: 5px;
    opacity: 0.7;
    transition: opacity 0.15s ease;
  }

  .banner-close:hover { opacity: 1; }

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
  .chrome-btn.menu-open { opacity: 1; color: var(--fg); background: var(--hover); }
  .chrome-btn.menu-open .tip { display: none; }

  /* Web version's menu, standing in for the Mac app's native one */
  .menu-anchor { position: relative; }

  .web-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    min-width: 150px;
    padding: 5px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
  }

  .web-menu button,
  .web-menu a {
    padding: 5px 9px;
    font-size: 0.85rem;
    text-align: left;
    text-decoration: none;
    color: var(--fg);
    border-radius: 6px;
  }

  .web-menu button:hover,
  .web-menu a:hover { background: var(--hover); }

  .web-menu-rule {
    height: 1px;
    margin: 4px 5px;
    background: var(--line);
  }

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

  /* After the long break reward closes, draw the eye to the new balance */
  .balance-value.pop { animation: balance-pop 0.7s ease; }

  @keyframes balance-pop {
    40% { transform: scale(1.1); }
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

  /* How It Works view */
  .guide-view {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }

  .guide-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .guide-icon {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    padding: 5px;
    border: 1px solid var(--line);
    border-radius: 50%;
  }

  .guide-row p {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.35;
    color: var(--muted);
  }

  .guide-row strong {
    font-weight: 400;
    font-style: italic;
    color: var(--fg);
  }

  .guide-footer .preset { flex-shrink: 0; white-space: nowrap; }

  .guide-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  /* Long break reward: the window floods with the inverse color while symbols
     drift up behind a whole rest settling onto its line */
  .celebration {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    overflow: hidden;
    background: var(--fg);
    color: var(--bg);
    cursor: pointer;
    animation: celebration-flood 0.7s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes celebration-flood {
    from { clip-path: circle(0% at 50% 45%); }
    to { clip-path: circle(120% at 50% 45%); }
  }

  .floating-symbol {
    position: absolute;
    bottom: -40px;
    width: var(--size);
    height: var(--size);
    opacity: 0;
    animation: symbol-float var(--duration) ease-out var(--delay) forwards;
  }

  @keyframes symbol-float {
    15% { opacity: 0.45; }
    70% { opacity: 0.35; }
    to {
      opacity: 0;
      transform: translate(var(--drift), -340px) rotate(var(--spin));
    }
  }

  .celebration-mark {
    position: relative;
    width: 76px;
    height: 76px;
    animation: rest-settle 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.25s backwards;
  }

  @keyframes rest-settle {
    from {
      opacity: 0;
      transform: translateY(-46px) scale(0.7);
    }
  }

  .celebration-title,
  .celebration-detail {
    position: relative;
    animation: celebration-rise 0.5s ease-out backwards;
  }

  .celebration-title {
    font-size: 1.85rem;
    font-style: italic;
    letter-spacing: 0.02em;
    animation-delay: 0.55s;
  }

  .celebration-detail {
    font-size: 0.88rem;
    opacity: 0.85;
    animation-delay: 0.75s;
  }

  @keyframes celebration-rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .celebration,
    .celebration-mark,
    .celebration-title,
    .celebration-detail,
    .balance-value.pop { animation: none; }
    .floating-symbol { display: none; }
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
    /* minmax(0, ...) stops wide controls (the select, the segmented
       control) from stretching their column past the others */
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 14px;
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

  /* Narrower columns here, so keep each label on one line */
  .settings-view .eyebrow {
    letter-spacing: 0.1em;
    white-space: nowrap;
  }

  .preset-field { justify-content: flex-start; padding-top: 14px; }

  .preset {
    padding: 5px 10px;
    font-size: 0.78rem;
    font-style: italic;
    border: 1px solid var(--line);
    border-radius: 8px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .preset:hover { background: var(--hover); border-color: var(--muted); }

  select,
  input {
    width: 100%;
    min-width: 0;
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
