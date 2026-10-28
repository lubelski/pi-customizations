import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const KEY = "pi-customization:copy-feedback";
type FeedbackUI = Pick<ExtensionContext["ui"], "setWidget" | "theme">;

/** Replace persistent transcript notifications with a short, dimming toast. */
export function createCopyFeedback(ui: FeedbackUI) {
	let timers: ReturnType<typeof setTimeout>[] = [];
	let sequence = 0;
	let disposed = false;
	const cancel = () => {
		for (const timer of timers) clearTimeout(timer);
		timers = [];
	};
	return {
		show(message: string, error = false): void {
			if (disposed) return;
			cancel();
			const id = ++sequence;
			// A visible counter distinguishes even rapid, identical results.
			const text = `${message}${id > 1 ? ` · ${id}` : ""}`;
			ui.setWidget(KEY, [ui.theme.fg(error ? "error" : "success", text)]);
			const later = (delay: number, action: () => void) => {
				const timer = setTimeout(() => {
					if (!disposed && sequence === id) action();
				}, delay);
				timer.unref?.();
				timers.push(timer);
			};
			later(error ? 2400 : 900, () => ui.setWidget(KEY, [ui.theme.fg("dim", text)]));
			later(error ? 3200 : 1600, () => ui.setWidget(KEY, undefined));
		},
		dispose(): void {
			disposed = true;
			cancel();
			ui.setWidget(KEY, undefined);
		},
	};
}
