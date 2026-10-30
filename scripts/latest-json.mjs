// Writes latest.json for the Tauri updater after a universal release build.
// Usage: pnpm release:json "What changed in this version"
// Upload latest.json, Fermata.app.tar.gz and the DMG to the GitHub release for this version.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const bundleDir = join(root, 'src-tauri/target/universal-apple-darwin/release/bundle/macos');
const sigPath = join(bundleDir, 'Fermata.app.tar.gz.sig');

if (!existsSync(sigPath)) {
	console.error(`Missing ${sigPath}`);
	console.error('Run the release build with TAURI_SIGNING_PRIVATE_KEY set first.');
	process.exit(1);
}

const url = `https://github.com/matthew-fernando/Fermata/releases/download/v${version}/Fermata.app.tar.gz`;
const signature = readFileSync(sigPath, 'utf8').trim();
// One universal build serves both chip types
const platform = { signature, url };

const latest = {
	version,
	notes: process.argv[2] ?? '',
	pub_date: new Date().toISOString(),
	platforms: {
		'darwin-aarch64': platform,
		'darwin-x86_64': platform
	}
};

const outPath = join(bundleDir, 'latest.json');
writeFileSync(outPath, JSON.stringify(latest, null, 2) + '\n');
console.log(`Wrote ${outPath} for v${version}`);
