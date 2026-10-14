import { basename, dirname } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { mcpServerNamesFromTools } from "./mcp-footer.ts";

const STATUS_PREFIX = "pi-customization:";
type Source = { path: string; source: string; origin: string };
type Tool = { name: string; exposure?: string; namespace?: { name: string }; sourceInfo?: Source };
type Command = { source: string; sourceInfo?: Source };

function clean(value: string): string {
	return stripVTControlCharacters(value).replace(/[\r\n\t]/g, " ").trim();
}

function sourceName(info: Source | undefined): string | undefined {
	if (!info || info.path.startsWith("builtin:") || info.source === "builtin") return undefined;
	if (info.origin === "package") {
		// Keep package identity, not generic entry-point names such as dist/index.js.
		if (info.source.startsWith("npm:")) return info.source.slice(4).replace(/@[^/]*$/, "");
		return basename(info.source.replace(/\/+$/, "").replace(/(?:#|@)[^/]*$/, "")).replace(/\.git$/, "");
	}
	const stem = basename(info.path).replace(/\.[cm]?[jt]s$/, "");
	return stem === "index" ? basename(dirname(info.path)) : stem;
}

/** Available non-built-in tool/command providers plus opt-in UI status publishers.
 * No disk scan: installed-but-disabled resources must not look active.
 */
export function extensionNamesFromRuntime(
	tools: readonly Tool[],
	activeTools: readonly string[],
	commands: readonly Command[],
	statuses: ReadonlyMap<string, string>,
): string[] {
	const active = new Set(activeTools);
	const names = new Set<string>();
	const customizations = new Set<string>();
	const add = (source: Source | undefined) => {
		const name = sourceName(source);
		if (name) {
			const label = clean(name);
			names.add(label);
			if (label === "pi-customizations" || /(?:^|[/\\])pi-customizations(?:[/\\]|$)/.test(source?.path ?? "")) {
				customizations.add(label);
			}
		}
	};
	for (const tool of tools) {
		if (tool.exposure === "hidden" || mcpServerNamesFromTools([tool]).length > 0) continue;
		if (tool.exposure === "codemode" || tool.exposure === "deferred" || active.has(tool.name)) add(tool.sourceInfo);
	}
	for (const command of commands) {
		if (command.source === "extension") add(command.sourceInfo);
	}
	for (const [key, value] of statuses) {
		if (!key.startsWith(STATUS_PREFIX) || !clean(value)) continue;
		names.delete(key.slice(STATUS_PREFIX.length));
		names.add(clean(value));
		customizations.add(clean(value));
	}
	return [...names].filter(Boolean).sort((a, b) =>
		Number(customizations.has(a)) - Number(customizations.has(b)) || a.localeCompare(b));
}
