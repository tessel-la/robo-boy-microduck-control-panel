import type {
  RoboBoyJsonObject,
  RoboBoyPanelConnectionSnapshot,
  RoboBoyPanelContext,
  RoboBoyPanelDefinition,
  RoboBoyPanelInstance,
  RoboBoyRosSubscription,
} from "@tessel-la/roboboy-panel-sdk";

export const PANEL_ID = "la.tessel.roboboy.microduck-control";
export const CMD_TOPIC = "/cmd_vel";
export const POLICY_TOPIC = "/locomotion/policy_cmd";
export const STATUS_TOPIC = "/locomotion/status";

export type DriveControl = "forward" | "back" | "turn-left" | "turn-right";
export type PolicyMotion = "walk" | "stand" | "sit" | "ground_pick" | "kick_left" | "kick_right" | "roulade" | "recover";

export interface Velocity {
  linearX: number;
  linearY: number;
  angularZ: number;
}

export interface MicroduckStatus {
  mode: string;
  enabled: boolean;
  mouthOpen: boolean;
  policyMode: string;
}

const ZERO: Velocity = { linearX: 0, linearY: 0, angularZ: 0 };

// Lateral strafe (linearY) has no drive control here: the walking policy produced
// zero displacement even at its own configured max linearY, unlike linear_x/angularZ
// which just needed a higher magnitude to engage.
export const velocityForControl = (control: DriveControl): Velocity => {
  const commands: Record<DriveControl, Velocity> = {
    // From standing, the walking policy only breaks into a gait above roughly
    // 0.3 m/s of commanded linear_x; 0.2 leaves it standing in place. 0.35/-0.4
    // are measured to engage immediately and reliably from a cold start.
    forward: { linearX: 0.35, linearY: 0, angularZ: 0 },
    back: { linearX: -0.4, linearY: 0, angularZ: 0 },
    // Pure angularZ stalls after one small correction; the same forward bias
    // that unblocks the gait above also lets a turn sustain.
    "turn-left": { linearX: 0.35, linearY: 0, angularZ: 0.65 },
    "turn-right": { linearX: 0.35, linearY: 0, angularZ: -0.65 },
  };
  return commands[control];
};

export const parseStatus = (message: RoboBoyJsonObject): MicroduckStatus | null => {
  if (typeof message.data !== "string") return null;
  try {
    const value = JSON.parse(message.data) as Record<string, unknown>;
    const policy = value.policy as Record<string, unknown> | undefined;
    const mouth = value.mouth as Record<string, unknown> | undefined;
    return {
      mode: typeof value.mode === "string" ? value.mode : "unknown",
      enabled: value.enabled !== false,
      mouthOpen: mouth?.opened === true,
      policyMode: typeof policy?.mode === "string" ? policy.mode : "unknown",
    };
  } catch {
    return null;
  }
};

const MARKUP = `
  <style>
    .mdc { height: 100%; min-height: 460px; box-sizing: border-box; display: grid; grid-template-rows: auto auto 1fr auto; gap: 12px; padding: 14px; overflow: auto; color: var(--text-color, #f2f5f7); background: var(--background-secondary, #171c24); font: 14px/1.35 var(--font-family-ui, system-ui, sans-serif); user-select: none; -webkit-user-select: none; }
    .mdc * { box-sizing: border-box; }
    .mdc__header, .mdc__connection, .mdc__status, .mdc__row { display: flex; align-items: center; gap: 8px; }
    .mdc__header { justify-content: space-between; flex-wrap: wrap; }
    .mdc__title { margin: 0; font-size: 18px; }
    .mdc__connection { color: var(--text-secondary, #aeb8c4); font-size: 12px; }
    .mdc__dot { width: 9px; height: 9px; border-radius: 50%; background: #77818c; }
    .mdc__dot[data-live="true"] { background: var(--success-color, #57d68d); box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-color, #57d68d) 20%, transparent); }
    .mdc__status { flex-wrap: wrap; padding: 9px 11px; border: 1px solid var(--border-color, #414b59); border-radius: 9px; color: var(--text-secondary, #aeb8c4); background: var(--card-bg, #242b36); font-size: 12px; }
    .mdc__status strong { color: var(--text-color, #f2f5f7); }
    .mdc__grid { min-height: 0; display: grid; grid-template-columns: minmax(210px, .9fr) minmax(250px, 1.1fr); gap: 12px; }
    .mdc__card { min-width: 0; padding: 12px; border: 1px solid var(--card-border, var(--border-color, #414b59)); border-radius: 12px; background: var(--card-bg, #242b36); }
    .mdc__card h3 { margin: 0 0 10px; color: var(--text-secondary, #aeb8c4); font-size: 12px; text-transform: uppercase; letter-spacing: .07em; }
    .mdc__drive { display: grid; grid-template-columns: repeat(3, minmax(52px, 1fr)); gap: 8px; }
    .mdc__drive button { touch-action: none; }
    .mdc__drive [data-drive="forward"] { grid-column: 2; }
    .mdc__drive [data-drive="turn-left"] { grid-column: 1; }
    .mdc__drive [data-drive="turn-right"] { grid-column: 3; }
    .mdc__drive [data-drive="back"] { grid-column: 2; }
    .mdc__modes { display: grid; grid-template-columns: repeat(2, minmax(100px, 1fr)); gap: 8px; }
    .mdc button { min-height: 40px; border: 1px solid var(--border-color, #414b59); border-radius: 9px; padding: 8px 10px; color: var(--text-color, #f2f5f7); background: var(--background-color, #11161d); cursor: pointer; font: 600 13px/1.1 var(--font-family-ui, system-ui, sans-serif); }
    .mdc button:hover:not(:disabled), .mdc button:focus-visible { border-color: var(--primary-color, #5ca9ff); }
    .mdc button:focus-visible { outline: 2px solid var(--primary-color, #5ca9ff); outline-offset: 2px; }
    .mdc button:disabled { opacity: .42; cursor: default; }
    .mdc button[data-active="true"] { color: var(--button-text-color, #fff); border-color: var(--primary-color, #5ca9ff); background: var(--primary-color, #347fc4); }
    .mdc__actions { grid-column: 1 / -1; }
    .mdc__row { flex-wrap: wrap; }
    .mdc__row button { flex: 1 1 120px; }
    .mdc__jump { border-color: var(--warning-color, #ffb454) !important; }
    .mdc__feedback { min-height: 20px; margin: 10px 0 0; color: var(--text-secondary, #aeb8c4); font-size: 12px; }
    @media (max-width: 620px) { .mdc { padding: 10px; } .mdc__grid { grid-template-columns: 1fr; } .mdc__actions { grid-column: auto; } }
  </style>
  <section class="mdc" aria-label="Microduck controls">
    <header class="mdc__header"><h2 class="mdc__title">Microduck Control</h2><span class="mdc__connection"><i class="mdc__dot"></i><span data-role="connection">Disconnected</span></span></header>
    <div class="mdc__status" aria-live="polite"><span>Mode <strong data-role="mode">—</strong></span><span>Policy <strong data-role="policy">—</strong></span><span>Mouth <strong data-role="mouth">—</strong></span></div>
    <div class="mdc__grid">
      <section class="mdc__card"><h3>Hold to drive</h3><div class="mdc__drive">
        <button data-drive="forward" aria-label="Drive forward">↑</button>
        <button data-drive="turn-left" aria-label="Turn left">↶</button><button data-drive="turn-right" aria-label="Turn right">↷</button>
        <button data-drive="back" aria-label="Drive backward">↓</button>
      </div></section>
      <section class="mdc__card"><h3>Learned policy modes</h3><div class="mdc__modes">
        <button data-motion="walk">Walk</button><button data-motion="stand">Stand</button><button data-motion="sit">Sit</button><button data-motion="ground_pick">Ground pick</button><button data-motion="kick_left">Kick left</button><button data-motion="kick_right">Kick right</button><button data-motion="roulade">Roulade</button><button data-motion="recover">Recover</button>
      </div></section>
      <section class="mdc__card mdc__actions"><h3>Robot actions</h3><div class="mdc__row"><button data-mouth="open">Open mouth</button><button data-mouth="close">Close mouth</button><button class="mdc__jump" data-action="jump">Jump</button></div><p class="mdc__feedback" data-role="feedback">Connect to ROS to begin.</p></section>
    </div>
  </section>`;

const createPanel = (context: RoboBoyPanelContext): RoboBoyPanelInstance => {
  let container: HTMLElement | null = null;
  let root: HTMLElement | null = null;
  let statusSubscription: RoboBoyRosSubscription | null = null;
  let connectionUnsubscribe: (() => void) | null = null;
  let connection: RoboBoyPanelConnectionSnapshot = context.connection.getSnapshot();
  let driveTimer: ReturnType<typeof setInterval> | null = null;
  let lastStatus: MicroduckStatus | null = null;
  let subscriptionGeneration = 0;

  const query = <T extends Element>(selector: string): T => {
    const element = root?.querySelector<T>(selector);
    if (!element) throw new Error(`Microduck Control is missing ${selector}.`);
    return element;
  };

  const connected = () => Boolean(context.ros) && connection.status === "connected";
  const feedback = (value: string) => {
    if (root) query<HTMLElement>('[data-role="feedback"]').textContent = value;
  };

  const render = () => {
    if (!root) return;
    query<HTMLElement>('[data-role="connection"]').textContent = !context.ros ? "ROS unavailable" : `ROS ${connection.status}`;
    query<HTMLElement>(".mdc__dot").dataset.live = String(connected());
    root.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { button.disabled = !connected(); });
    query<HTMLElement>('[data-role="mode"]').textContent = lastStatus?.mode ?? "—";
    query<HTMLElement>('[data-role="policy"]').textContent = lastStatus?.policyMode ?? "—";
    query<HTMLElement>('[data-role="mouth"]').textContent = lastStatus ? (lastStatus.mouthOpen ? "open" : "closed") : "—";
    root.querySelectorAll<HTMLButtonElement>("[data-motion]").forEach((button) => {
      button.dataset.active = String(button.dataset.motion === lastStatus?.policyMode);
    });
  };

  const publishVelocity = async (velocity: Velocity) => {
    if (!context.ros || !connected()) return;
    await context.ros.publish({
      topic: CMD_TOPIC,
      messageType: "geometry_msgs/msg/Twist",
      message: {
        linear: { x: velocity.linearX, y: velocity.linearY, z: 0 },
        angular: { x: 0, y: 0, z: velocity.angularZ },
      },
    });
  };

  const stopDrive = () => {
    if (driveTimer) clearInterval(driveTimer);
    driveTimer = null;
    void publishVelocity(ZERO).catch((error) => context.logger.warn("Could not stop Microduck.", error));
  };

  const startDrive = (control: DriveControl) => {
    stopDrive();
    const velocity = velocityForControl(control);
    void publishVelocity(velocity).catch((error) => feedback(`Drive failed: ${String(error)}`));
    driveTimer = setInterval(() => {
      void publishVelocity(velocity).catch((error) => context.logger.warn("Drive publish failed.", error));
    }, 50);
  };

  const selectMotion = async (motion: PolicyMotion) => {
    if (!context.ros || !connected()) return;
    feedback(`Selecting ${motion.replace(/_/g, " ")}…`);
    try {
      await context.ros.publish({ topic: POLICY_TOPIC, messageType: "std_msgs/msg/String", message: { data: motion } });
      feedback(`${motion.replace(/_/g, " ")} requested.`);
    } catch (error) {
      feedback(`Policy request failed: ${String(error)}`);
    }
  };

  const setMouth = async (opened: boolean) => {
    if (!context.ros || !connected()) return;
    try {
      const response = await context.ros.callService({ service: "/locomotion/mouth", serviceType: "std_srvs/srv/SetBool", request: { data: opened } });
      feedback(response.success === false ? String(response.message ?? "Mouth command failed.") : `Mouth ${opened ? "opening" : "closing"}.`);
    } catch (error) {
      feedback(`Mouth command failed: ${String(error)}`);
    }
  };

  const jump = async () => {
    if (!context.ros || !connected()) return;
    try {
      const response = await context.ros.callService({ service: "/locomotion/jump", serviceType: "std_srvs/srv/Trigger", request: {} });
      feedback(response.success === false ? String(response.message ?? "Jump failed.") : "Jump requested.");
    } catch (error) {
      feedback(`Jump failed: ${String(error)}`);
    }
  };

  const stopSubscription = () => {
    subscriptionGeneration += 1;
    const current = statusSubscription;
    statusSubscription = null;
    if (current) void current.unsubscribe().catch((error) => context.logger.warn("Status cleanup failed.", error));
  };

  const ensureSubscription = () => {
    if (!root || !context.ros || !connected() || statusSubscription) return;
    const generation = ++subscriptionGeneration;
    void context.ros.subscribe(
      { topic: STATUS_TOPIC, messageType: "std_msgs/msg/String", queueLength: 1 },
      (message) => {
        const parsed = parseStatus(message);
        if (parsed) { lastStatus = parsed; render(); }
      },
    ).then((subscription) => {
      if (!root || generation !== subscriptionGeneration || !connected()) { void subscription.unsubscribe(); return; }
      statusSubscription = subscription;
      feedback("Ready. Hold a drive button or choose an action.");
    }, (error) => {
      context.logger.warn("Microduck status subscription failed.", error);
      feedback("Controls are available, but status could not be subscribed.");
    });
  };

  const onPointerDown = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-drive]");
    if (!button?.dataset.drive || !connected()) return;
    event.preventDefault();
    startDrive(button.dataset.drive as DriveControl);
  };
  const onClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (!button || button.disabled) return;
    if (button.dataset.motion) void selectMotion(button.dataset.motion as PolicyMotion);
    else if (button.dataset.mouth) void setMouth(button.dataset.mouth === "open");
    else if (button.dataset.action === "jump") void jump();
  };

  return {
    mount(target) {
      container = target;
      target.innerHTML = MARKUP;
      root = target.querySelector<HTMLElement>(".mdc");
      if (!root) throw new Error("Microduck Control markup could not be created.");
      root.addEventListener("pointerdown", onPointerDown);
      root.addEventListener("click", onClick);
      window.addEventListener("pointerup", stopDrive);
      window.addEventListener("pointercancel", stopDrive);
      window.addEventListener("blur", stopDrive);
      connectionUnsubscribe = context.connection.subscribe((snapshot) => {
        const changed = snapshot.generation !== connection.generation;
        connection = snapshot;
        if (!connected() || changed) { stopDrive(); stopSubscription(); }
        render();
        ensureSubscription();
      });
      render();
      ensureSubscription();
    },
    setActive(active) { if (!active) stopDrive(); root?.toggleAttribute("data-inactive", !active); },
    unmount() {
      stopDrive();
      stopSubscription();
      connectionUnsubscribe?.();
      connectionUnsubscribe = null;
      window.removeEventListener("pointerup", stopDrive);
      window.removeEventListener("pointercancel", stopDrive);
      window.removeEventListener("blur", stopDrive);
      root?.removeEventListener("pointerdown", onPointerDown);
      root?.removeEventListener("click", onClick);
      container?.replaceChildren();
      root = null;
      container = null;
    },
  };
};

const definition: RoboBoyPanelDefinition = { apiVersion: "2.0.0", id: PANEL_ID, activate: createPanel };
export default definition;
