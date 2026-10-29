# 𝄐 Fermata

A minimal menu bar break timer for macOS. As you work, you accrue break time, and longer stretches of work earn you a long break.

A *fermata* is the musical symbol for "hold this note"; a pause, and it's up the musician how long to hold it.

I built this app because I didn't like how Pomodoro apps worked. I always found I would be forced to take breaks when I didn't want to, or I would find myself watching the clock until I earned a break, which lowered productivity. With Fermata, you choose when to take your break, and it will let you know how much you've earned. This method has proven to be very effective in maximizing productivity.

## How it works

- **Work** (♪) earns break time. With the default ratio of 5, every 5 minutes of work earns 1 minute of break.
- **Break** (𝄐) spends it. Your **Break Balance** counts down while you rest and can go negative if you overdo it.
- **Pause** stops the clock without earning or spending anything.

Keep working and you earn a **long break bonus**: by default, an extra 25 minutes after every 2 hours of work.

## Features

- **Lives in the menu bar.** There's no Dock icon, and closing the window keeps the timer running.
- **Choose what the menu bar shows:** break balance, current period, total session or long break progress (%).
- **Adjustable:** work ratio, long break interval and long break length, plus a one-click Pomodoro preset.
- **Light and dark mode**, and an optional **always on top** window.
- **Remembers your progress** between launches.

- The Break button and the menu bar icon show your progress towards your long break:

| Progress | Symbol |
|---|---|
| Under 25% | Fermata |
| 25% | Quarter rest |
| 50% | Half rest |
| Long break earned | Whole rest, until your next break |

### Shortcuts

| Shortcut | Action |
|---|---|
| ⌘ , | Settings |
| ⌘ W | Close window (Fermata keeps running in the menu bar) |
| ⌘ Q | Quit |

## Install
### Homebrew

```bash
brew install --cask matthew-fernando/tap/fermata
```

### Manual download

1. Download the latest `Fermata_x.x.x_universal.dmg` from [Releases](https://github.com/matthew-fernando/Fermata/releases/latest). It runs on both Apple Silicon and Intel Macs.
2. Open the DMG and drag **Fermata** into **Applications**.
3. Open Fermata. macOS will warn that it can't verify the developer, because Fermata isn't notarized by Apple. Click **Done**.
4. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to Fermata.

You only need to do this once.

**If macOS says the app is "damaged":** run this in Terminal, then open Fermata again.

```bash
xattr -dr com.apple.quarantine /Applications/Fermata.app
```

To start Fermata automatically, add it in **System Settings → General → Login Items**.

## Building from source

Requirements: [Node.js](https://nodejs.org/), [pnpm](https://pnpm.io/), [Rust](https://rustup.rs/), and the Xcode Command Line Tools (`xcode-select --install`).

```bash
pnpm install
```

Run in development mode. Interface changes reload instantly, and Rust changes rebuild automatically.

```bash
pnpm tauri dev
```

Build a universal app and DMG:

```bash
rustup target add x86_64-apple-darwin
```

```bash
pnpm tauri build --target universal-apple-darwin
```

The output is in `src-tauri/target/universal-apple-darwin/release/bundle/`.

## Built with

[Tauri 2](https://tauri.app/), [Svelte 5](https://svelte.dev/), TypeScript and Rust.
