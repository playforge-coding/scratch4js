/**
 * Headless Scratch runtime for **running and testing** projects, built on
 * {@link https://github.com/TurboWarp/scratch-vm TurboWarp's scratch-vm} (the
 * fork with a JIT compiler). It runs entirely in this Node process — no browser,
 * no WebGL — and exposes the project's *runtime* state as structured data an
 * agent can assert on: variables, lists, monitors, sprite positions, say/think
 * bubbles, the current question, running-thread count and any runtime errors.
 *
 * The VM is heavy, so it is `require`d lazily on first use: a server that only
 * edits projects never pays for it.
 *
 * What is intentionally absent and why it is fine:
 *   - **No renderer.** Costume *metadata* still loads (names, costume number),
 *     so logic that switches costumes by name/number works. Pixel output and the
 *     handful of renderer-backed blocks (touching-colour/sprite/edge, pen) are
 *     covered instead by the live TurboWarp editor via the screenshot bridge.
 *   - **No audio engine.** Sounds don't play; their blocks no-op.
 *
 * scratch-vm logs these absences once per asset through its bundled `nanolog`,
 * which ignores `disable()`; we mute the output streams around VM calls instead.
 *
 * @module scratch-mcp/runtime
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** @type {typeof import('scratch-vm') | null} */
let VM = null;
/** @type {(new () => object) | null} */
let ScratchStorage = null;

/** Lazily load the VM and storage modules (both CommonJS). */
function ensureDeps() {
  if (VM) return;
  VM = require('scratch-vm');
  ScratchStorage = require('scratch-storage').ScratchStorage;
}

/**
 * Run `fn` with stdout/stderr writes swallowed. scratch-vm's logger writes
 * straight to the streams, so this is the only reliable way to keep its
 * "no renderer / no audio" chatter out of the MCP stdio channel. `fn` must be
 * synchronous or return a promise that settles quickly; we restore on both
 * success and failure.
 *
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function muted(fn) {
  const out = process.stdout.write;
  const err = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  const restore = () => {
    process.stdout.write = out;
    process.stderr.write = err;
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (e) {
    restore();
    throw e;
  }
}

/** @param {Uint8Array} bytes @returns {ArrayBuffer} A standalone copy. */
const toArrayBuffer = (bytes) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cap on the tool-facing event log between drains, to bound memory. */
const MAX_EVENT_LOG = 1000;

/**
 * Drives one project through a headless scratch-vm, kept loaded between calls
 * so an agent can green-flag, step, inspect, send input and repeat.
 */
export class HeadlessRuntime {
  constructor() {
    /** @type {import('scratch-vm') | null} */
    this.vm = null;
    /** Latest say/think bubble per target id. @type {Map<string, object>} */
    this.bubbles = new Map();
    /** Text of the pending `ask and wait` question, or null. @type {string|null} */
    this.question = null;
    /** Runtime errors seen since the last green flag. @type {string[]} */
    this.errors = [];
    /**
     * Optional sink for notable runtime events, set by the server to forward
     * them as MCP log notifications. Receives `{ level, type, message,
     * ...fields }`. Independent of the tool-facing event log below: events are
     * always recorded for {@link drainEvents}, whether or not this is set.
     * @type {((event: object) => void) | null}
     */
    this.onEvent = null;
    /**
     * Tool-facing event log: every event since the last {@link drainEvents},
     * returned by `vm_run`. Capped at {@link MAX_EVENT_LOG} (oldest dropped).
     * @type {object[]}
     */
    this._eventLog = [];
    /** How many events were dropped from `_eventLog` to stay under the cap. */
    this._droppedEvents = 0;
    /**
     * Events awaiting delivery to {@link onEvent}. Drained by {@link _flush},
     * which is called only where stdout is live (never mid-muted-step).
     * @type {object[]}
     */
    this._notifyQueue = [];
  }

  /**
   * Record a notable event. It goes to two independent places: the tool-facing
   * `_eventLog` (always, so `vm_run` can return it) and, if a sink is attached,
   * the `_notifyQueue` for MCP log notifications. Notifications are queued
   * rather than sent inline because many events fire synchronously inside a
   * muted VM step, where a stdout write would be swallowed by the mute.
   *
   * @param {string} level - An MCP log level (`debug`, `info`, `error`, …).
   * @param {string} type - Short event kind, e.g. `say`, `broadcast`.
   * @param {string} message - Human-readable one-liner.
   * @param {object} [fields] - Extra structured data.
   * @private
   */
  _emit(level, type, message, fields = {}) {
    const event = { level, type, message, ...fields };
    this._eventLog.push(event);
    if (this._eventLog.length > MAX_EVENT_LOG) {
      this._eventLog.shift();
      this._droppedEvents++;
    }
    if (this.onEvent) this._notifyQueue.push(event);
  }

  /** Deliver and clear queued log notifications. Call only when stdout is live. @private */
  _flush() {
    if (!this.onEvent || this._notifyQueue.length === 0) return;
    const batch = this._notifyQueue;
    this._notifyQueue = [];
    for (const event of batch) this.onEvent(event);
  }

  /**
   * Return and clear the events recorded since the last call. This is the
   * AI-facing event timeline (`vm_run` includes it in its result).
   *
   * @returns {{ events: object[], dropped: number }}
   */
  drainEvents() {
    const events = this._eventLog;
    const dropped = this._droppedEvents;
    this._eventLog = [];
    this._droppedEvents = 0;
    return { events, dropped };
  }

  /** @returns {import('scratch-vm')} The loaded VM, or throws. */
  _vm() {
    if (!this.vm)
      throw new Error(
        'No project loaded in the runtime. Call `vm_load` first.',
      );
    return this.vm;
  }

  /**
   * Load project bytes (an in-memory `.sb3`) into a fresh VM, replacing any
   * previously loaded project. Returns a summary of what loaded.
   *
   * @param {Uint8Array} bytes
   * @returns {Promise<object>}
   */
  async loadFromBytes(bytes) {
    ensureDeps();
    this.dispose();
    const vm = muted(() => {
      // Constructing the VM also touches a process-global "central dispatch",
      // which warns when replaced on a second load — mute it along with the load.
      const v = new VM();
      v.attachStorage(new ScratchStorage());
      v.clear();
      return v;
    });
    this.vm = vm;
    this._wireEvents();
    await muted(() => vm.loadProject(toArrayBuffer(bytes)));
    const summary = this.summary();
    this._emit('info', 'load', `loaded ${summary.targets.length} targets`, {
      targets: summary.targets.map((t) => t.name),
    });
    this._flush();
    return summary;
  }

  /** Subscribe to the runtime events we surface as state and log events. @private */
  _wireEvents() {
    const vm = this.vm;
    const rt = vm.runtime;

    // SAY fires for both `say` and `think`; empty text clears the bubble. We
    // only emit a log event when the bubble actually changes, so a `say` inside
    // a loop doesn't spam one event per frame.
    vm.on('SAY', (target, type, text) => {
      const id = target?.id;
      if (!id) return;
      const name = target.getName?.() ?? id;
      if (text === '' || text == null) {
        if (this.bubbles.delete(id))
          this._emit('debug', 'bubble', `${name} bubble cleared`, {
            sprite: name,
          });
        return;
      }
      const next = { sprite: name, type, text: String(text) };
      const prev = this.bubbles.get(id);
      this.bubbles.set(id, next);
      if (!prev || prev.text !== next.text || prev.type !== next.type)
        this._emit(
          'info',
          type,
          `${name} ${type}s: ${JSON.stringify(next.text)}`,
          {
            sprite: name,
            text: next.text,
          },
        );
    });

    // QUESTION carries the prompt string while an `ask and wait` is pending,
    // and null once it is answered.
    vm.on('QUESTION', (question) => {
      this.question = question == null ? null : String(question);
      if (this.question !== null)
        this._emit(
          'info',
          'question',
          `asks: ${JSON.stringify(this.question)}`,
          {
            text: this.question,
          },
        );
    });

    rt.on('RUNTIME_ERROR', (msg) => {
      this.errors.push(String(msg));
      this._emit('error', 'error', `runtime error: ${msg}`, {
        error: String(msg),
      });
    });
    rt.on('COMPILE_ERROR', (_target, error) => {
      this.errors.push(`compile error: ${error}`);
      this._emit('error', 'error', `compile error: ${error}`, {
        error: String(error),
      });
    });

    // The runtime has no broadcast event, so observe the hat-start call the
    // broadcast blocks make. One call per broadcast send, carrying its name.
    const startHats = rt.startHats.bind(rt);
    rt.startHats = (opcode, matchFields, target) => {
      if (opcode === 'event_whenbroadcastreceived' && matchFields) {
        const name = matchFields.BROADCAST_OPTION;
        if (name)
          this._emit('info', 'broadcast', `broadcast ${JSON.stringify(name)}`, {
            name,
          });
      }
      return startHats(opcode, matchFields, target);
    };

    // Coarse run boundaries, useful at debug level.
    rt.on('PROJECT_RUN_START', () =>
      this._emit('debug', 'run-start', 'scripts started running'),
    );
    rt.on('PROJECT_RUN_STOP', () =>
      this._emit('debug', 'run-stop', 'scripts finished running'),
    );
  }

  /**
   * Press the green flag. Clears transient state (bubbles, pending question,
   * errors) so a subsequent `vm_state` reflects only this run. Does not advance
   * the VM on its own — call {@link run} to step it.
   */
  greenFlag() {
    const vm = this._vm();
    this.bubbles.clear();
    this.question = null;
    this.errors = [];
    this._emit('info', 'greenflag', 'green flag');
    vm.greenFlag();
    this._flush();
  }

  /** Stop every running script. */
  stop() {
    this._emit('info', 'stop', 'stop all');
    this._vm().stopAll();
    this._flush();
  }

  /**
   * Advance the VM frame by frame. By default it runs in real time (so `wait`,
   * timers and `glide` behave) until every script finishes or the budget is
   * spent. Set `paced: false` to step as fast as possible — faster, but
   * time-based blocks won't elapse correctly.
   *
   * @param {object} [opts]
   * @param {number} [opts.seconds] - Real-time budget. Default 10, capped at 60.
   * @param {number} [opts.frames] - Frame budget instead of `seconds`.
   * @param {boolean} [opts.untilIdle=true] - Stop early once no scripts run.
   * @param {boolean} [opts.paced=true] - Sleep one frame interval between steps.
   * @returns {Promise<object>} Frames run, whether the VM went idle, and state.
   */
  async run({ seconds, frames, untilIdle = true, paced = true } = {}) {
    const vm = this._vm();
    const rt = vm.runtime;
    const fps = rt.frameLoop?.framerate || 30;
    const interval = 1000 / fps;

    let budget;
    if (typeof frames === 'number') budget = frames;
    else budget = Math.ceil(Math.min(seconds ?? 10, 60) * fps);
    budget = Math.max(0, Math.min(budget, 60 * fps));

    let ran = 0;
    for (; ran < budget; ran++) {
      muted(() => rt._step());
      // Deliver events raised during the (muted) step now that stdout is live.
      this._flush();
      if (untilIdle && ran > 0 && rt.threads.length === 0) {
        ran++;
        break;
      }
      if (paced) await delay(interval);
    }
    // The event timeline since the previous `vm_run`: say/think, broadcasts,
    // question/answer, errors, … in the order they happened (a typical
    // load → green-flag → run flow yields load + greenflag + this run's events).
    const { events, dropped } = this.drainEvents();
    return {
      framesRun: ran,
      idle: rt.threads.length === 0,
      threadsRunning: rt.threads.length,
      events,
      ...(dropped ? { eventsDropped: dropped } : {}),
      ...this.summary(),
    };
  }

  /**
   * Feed input into the VM the way the editor would.
   *
   * @param {object} input
   * @param {Array<{ key: string, isDown?: boolean }>} [input.keys] - Key events.
   *   `key` is a Scratch key name ("space", "up arrow", "a", …). `isDown`
   *   defaults to a full press (down then up).
   * @param {number} [input.mouseX] - Stage x (-240..240) for the mouse.
   * @param {number} [input.mouseY] - Stage y (-180..180) for the mouse.
   * @param {boolean} [input.mouseDown] - Mouse button state.
   * @param {string} [input.answer] - Answer the pending `ask and wait`.
   * @returns {object} What was applied.
   */
  input({ keys, mouseX, mouseY, mouseDown, answer } = {}) {
    const vm = this._vm();
    const applied = {};

    if (Array.isArray(keys) && keys.length) {
      for (const { key, isDown } of keys) {
        if (isDown === undefined) {
          vm.postIOData('keyboard', { key, isDown: true });
          vm.postIOData('keyboard', { key, isDown: false });
        } else {
          vm.postIOData('keyboard', { key, isDown });
        }
      }
      applied.keys = keys;
    }

    if (
      mouseX !== undefined ||
      mouseY !== undefined ||
      mouseDown !== undefined
    ) {
      // The Scratch stage is always 480×360. The mouse handler maps canvas-space
      // coords back to stage coords using the canvas size we report, so feeding
      // a 480×360 canvas makes `data.x/y` a direct stage-coord translation.
      const W = 480;
      const H = 360;
      const data = { canvasWidth: W, canvasHeight: H };
      if (mouseX !== undefined) data.x = mouseX + W / 2;
      if (mouseY !== undefined) data.y = H / 2 - mouseY;
      if (mouseDown !== undefined) data.isDown = mouseDown;
      vm.postIOData('mouse', data);
      applied.mouse = { mouseX, mouseY, mouseDown };
    }

    if (answer !== undefined) {
      // The VM resolves a pending `ask and wait` by emitting ANSWER.
      vm.runtime.emit('ANSWER', String(answer));
      this.question = null;
      applied.answer = String(answer);
      this._emit(
        'info',
        'answer',
        `answered: ${JSON.stringify(applied.answer)}`,
        {
          text: applied.answer,
        },
      );
    }

    this._flush();
    return applied;
  }

  /**
   * A structured snapshot of runtime state. The shape is designed for an agent
   * to assert against: read `variables`, `lists`, `monitors`, sprite positions
   * and `bubbles` rather than guessing from pixels.
   *
   * @returns {object}
   */
  summary() {
    const vm = this._vm();
    const rt = vm.runtime;

    const targets = rt.targets.map((t) => {
      const vars = Object.values(t.variables || {});
      const scalars = vars.filter((v) => v.type !== 'list');
      const lists = vars.filter((v) => v.type === 'list');
      const base = {
        name: t.getName?.() ?? t.id,
        isStage: !!t.isStage,
        isClone: !t.isOriginal,
        variables: Object.fromEntries(scalars.map((v) => [v.name, v.value])),
        lists: Object.fromEntries(lists.map((v) => [v.name, v.value])),
      };
      if (t.isStage) return base;
      const costume = t.sprite?.costumes?.[t.currentCostume];
      return {
        ...base,
        x: round(t.x),
        y: round(t.y),
        direction: round(t.direction),
        size: round(t.size),
        visible: t.visible,
        costume: costume?.name,
        costumeNumber: t.currentCostume + 1,
      };
    });

    return {
      targets,
      monitors: this._monitors(),
      bubbles: [...this.bubbles.values()],
      question: this.question,
      threadsRunning: rt.threads.length,
      errors: this.errors.slice(),
    };
  }

  /** Visible monitors (variable/list watchers, sensing readouts). @private */
  _monitors() {
    const state = this.vm.runtime.getMonitorState?.();
    if (!state) return [];
    const out = [];
    state.valueSeq().forEach((m) => {
      const mon = m.toJS ? m.toJS() : m;
      if (mon.visible === false) return;
      out.push({
        label: mon.opcode === 'data_variable' ? mon.params?.VARIABLE : mon.id,
        value: mon.value,
        mode: mon.mode,
      });
    });
    return out;
  }

  /** Tear down the current VM, if any. */
  dispose() {
    if (this.vm) {
      try {
        muted(() => this.vm.quit?.());
      } catch {
        // best effort
      }
    }
    this.vm = null;
    this.bubbles.clear();
    this.question = null;
    this.errors = [];
    this._eventLog = [];
    this._droppedEvents = 0;
    this._notifyQueue = [];
  }
}

/** Round to one decimal place, leaving non-numbers untouched. */
const round = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);
