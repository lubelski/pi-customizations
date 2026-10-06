import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";

// Default to the lockfile-pinned runtime. Optionally probe a separately installed Pi.
export const piRoot = process.env.PI_PACKAGE_ROOT
	? resolve(process.env.PI_PACKAGE_ROOT)
	: dirname(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))));
const runtimeRequire = createRequire(`${piRoot}/package.json`);
const tuiEntry = runtimeRequire.resolve("@earendil-works/pi-tui");
const importFile = (path: string) => import(pathToFileURL(path).href);
export const themeModule = await importFile(`${piRoot}/dist/modes/interactive/theme/theme.js`);
export const keybindingsModule = await importFile(`${piRoot}/dist/core/keybindings.js`);
export const tuiModule = await importFile(tuiEntry);
export const layoutModule = await importFile(`${dirname(tuiEntry)}/layout.js`);
export const jiti = createJiti(import.meta.url, {
	alias: {
		"@earendil-works/pi-coding-agent": `${piRoot}/dist/index.js`,
		"@earendil-works/pi-tui": tuiEntry,
	},
});
