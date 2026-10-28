import { visibleWidth, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import { codeBlocks } from "./message-controls.ts";

export const PLAIN_MARKDOWN = Symbol.for("will.pi.plain-markdown");
const ORIGINAL = Symbol.for("will.pi.code-copy.original-render");
const MOUSE = Symbol.for("will.pi.code-copy.original-mouse");
const MARKER = /\x1b\]777;pi-code;(\d+)\x07/g;
type Block = {
 text: string;
 render(width: number): string[];
 handleMouse?(event: TuiMouseEvent): TuiMouseEventResult | undefined;
 [PLAIN_MARKDOWN]?: boolean;
};
type State = { next: number; hits: Map<string, number>; source?: string; blocks: string[] };
let states = new WeakMap<object, State>();
function state(block: object): State {
 let value = states.get(block);
 if (!value) { value = { next: 0, hits: new Map(), blocks: [] }; states.set(block, value); }
 return value;
}

/** Zero-width layout metadata, removed before lines reach the terminal. */
export function codeCopyMarker(block: object): string {
 return `\x1b]777;pi-code;${state(block).next++}\x07`;
}

export function installCodeCopy(target: Block & Record<PropertyKey, unknown>, copy: (text: string) => Promise<void>,
 notify: (message: string, error?: boolean) => void): void {
 states = new WeakMap();
 const render = (target[ORIGINAL] ?? target.render) as Block["render"];
 const mouse = (Object.hasOwn(target, MOUSE) ? target[MOUSE] : target.handleMouse) as Block["handleMouse"];
 Object.defineProperty(target, ORIGINAL, { value: render, configurable: true });
 // Save absence too, so reload never delegates to its own old handler.
 Object.defineProperty(target, MOUSE, { value: mouse ?? null, configurable: true });
 target.render = function (width) {
  const s = state(this);
  s.next = 0;
  s.hits.clear();
  if (s.source !== this.text) { s.source = this.text; s.blocks = codeBlocks(this.text); }
  return render.call(this, width).map((line, y) => line.replace(MARKER, (marker, id, offset) => {
   s.hits.set(`${visibleWidth(line.slice(0, offset))},${y}`, Number(id));
   return "";
  }));
 };
 target.handleMouse = function (event) {
  if (!this[PLAIN_MARKDOWN] && event.type === "click" && event.button === "left" && !event.shift && !event.alt && !event.ctrl) {
   const s = state(this);
   const index = s.hits.get(`${event.x},${event.y}`);
   if (index !== undefined && s.blocks[index] !== undefined) {
    void copy(s.blocks[index]).then(() => notify("Copied"), () => notify("Could not copy code", true));
    return { handled: true, render: false };
   }
  }
  return mouse?.call(this, event);
 };
}
