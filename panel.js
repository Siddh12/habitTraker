const panel = document.querySelector("#panel");

let session = null;
let state = {
  sections: [],
  trackers: [],
  logs: {},
  expenses: {},
  profile: {
    name: "",
  },
  preferences: {
    appearance: "system",
    timeFormat: "12",
  },
};

let renderedDateKey = "";
let clockTimer = null;

const completionQuotes = [
  "Clean board. Clear mind.",
  "You kept the promise today.",
  "Small wins compound.",
  "Done for today. Keep the rhythm.",
  "Consistency is quiet power.",
];

initPanel();

async function initPanel() {
  if (!window.dailyTrack) {
    renderMessage("Desktop bridge is not available.");
    return;
  }

  session = await window.dailyTrack.getSession();
  if (session) state = await window.dailyTrack.getState();
  window.dailyTrack.onStateUpdated(refreshPanel);
  window.dailyTrack.onSessionUpdated(refreshPanel);
  render();
  startClock();
}

async function refreshPanel() {
  session = await window.dailyTrack.getSession();
  state = session ? await window.dailyTrack.getState() : state;
  render();
}

function render() {
  applyAppearance();

  const today = toDateKey(new Date());
  renderedDateKey = today;
  const trackers = session ? getTrackersForDate(today) : [];
  const done = trackers.filter((tracker) => isTrackerDoneOnDate(tracker, today)).length;
  const remaining = Math.max(0, trackers.length - done);
  const completion = trackers.length ? Math.round((done / trackers.length) * 100) : 0;
  const widgetTasks = getWidgetTasks(trackers, today);
  const visibleWidgetTasks = widgetTasks.slice(0, 3);
  const hiddenWidgetTasks = Math.max(0, widgetTasks.length - visibleWidgetTasks.length);
  const isCompleteDay = Boolean(trackers.length) && remaining === 0;

  panel.innerHTML = `
    <div class="panel-shell">
      <section class="panel-frame">
        <header class="panel-header">
          <button class="panel-launcher" type="button" title="${session ? "Open DailyTrack" : "Sign in"}" data-action="open">
            <h1 class="panel-title" data-panel-greeting>${esc(getGreetingText(new Date()))}</h1>
            <p class="panel-date" data-panel-date>${formatLongDate(today)}</p>
          </button>
        </header>
        ${
          session
            ? `<div class="section upcoming-only" aria-label="DailyTrack upcoming widget">
                <div class="widget-top-grid">
                  ${renderWidgetCount(done, trackers.length, remaining, completion)}
                  ${renderWidgetClock(new Date())}
                </div>
                <section class="widget-section upcoming-section">
                  <div class="section-title-row">
                    <h2 class="section-title">Widget</h2>
                    ${
                      hiddenWidgetTasks
                        ? `<button class="more-chip" type="button" title="Open full app" data-action="open">+${hiddenWidgetTasks} more</button>`
                        : ""
                    }
                  </div>
                  <div class="item-grid compact">
                    ${
                      visibleWidgetTasks.length
                        ? visibleWidgetTasks.map((tracker) => renderWidgetTask(tracker, today)).join("")
                        : isCompleteDay
                          ? renderCelebrationCard(today, done, trackers.length)
                        : `<button class="empty-widget-card" type="button" data-action="open">
                            <strong>No widget tasks</strong>
                            <span>Open DailyTrack to choose what appears here.</span>
                          </button>`
                    }
                  </div>
                </section>
              </div>`
            : `<div class="section">
                <p class="muted">Sign in from the full app to load your tracker panel.</p>
              </div>`
        }
      </section>
    </div>
  `;
  queuePanelResize();
}

panel.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.dataset.action === "open") await openFullApp();
  if (button.dataset.action === "minimize") await window.dailyTrack.minimizePanel();
  if (button.dataset.action === "close") await window.dailyTrack.closePanel();
  if (button.dataset.action === "toggle-complete") await togglePanelComplete(button.dataset.id);
  if (button.dataset.action === "counter-inc") await updatePanelCounter(button.dataset.id, 1);
  if (button.dataset.action === "counter-dec") await updatePanelCounter(button.dataset.id, -1);
});

panel.addEventListener("dblclick", async (event) => {
  if (event.target.closest("button, input, [data-action]")) return;
  await openFullApp();
});

panel.addEventListener("change", async (event) => {
  const target = event.target;
  if (!target?.dataset?.action) return;

  if (target.dataset.action === "set-panel-time") {
    await setPanelTime(target.dataset.id, target.value);
    return;
  }

  if (target.dataset.action === "set-panel-actual-time") {
    await setPanelActualTime(target.dataset.id, target.value);
  }
});

function renderStat(iconName, label, value, detail) {
  return `
    <div class="stat">
      <span class="stat-icon">${icon(iconName)}</span>
      <span class="stat-label">${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(detail)}</small>
    </div>
  `;
}

async function openFullApp() {
  await window.dailyTrack.openFullApp();
}

function renderWidgetCount(done, total, remaining, completion) {
  return `
    <div class="widget-count-card" aria-label="${escAttr(`${done} of ${total} tasks complete, ${remaining} remaining`)}">
      <div class="widget-count-head">
        <small>Done</small>
        <span>${remaining} left</span>
      </div>
      <strong class="widget-count-value">${done}/${total || 0}</strong>
      <div class="widget-meter" aria-label="${completion}% complete today"><span style="width:${completion}%"></span></div>
    </div>
  `;
}

function renderWidgetClock(date) {
  const clock = getClockParts(date);
  return `
    <div class="widget-clock-card" data-widget-clock style="--second-progress:${clock.progress}" aria-label="${escAttr(`Current time ${clock.aria}`)}">
      <span class="clock-period" data-clock-period ${clock.period ? "" : "hidden"}>${esc(clock.period)}</span>
      <div class="clock-face">
        <strong data-clock-time>${esc(clock.time)}</strong>
      </div>
      <span class="clock-second-line" aria-hidden="true"><span></span></span>
    </div>
  `;
}

function renderCelebrationCard(date, done, total) {
  const quote = getCelebrationQuote(new Date());
  const streak = getDailyWinStreak(date);
  return `
    <article class="celebration-card" aria-label="${escAttr(`All tasks complete. ${streak} day streak.`)}">
      <div class="celebration-top">
        <span class="celebration-mark popper">${icon("party-popper")}</span>
        <span class="celebration-mark streak">${icon("flame")}</span>
        <span class="celebration-mark trophy">${icon("trophy")}</span>
      </div>
      <div class="celebration-copy">
        <strong>All done today</strong>
        <span data-celebration-quote data-quote-index="${quote.index}">${esc(quote.text)}</span>
      </div>
      <div class="celebration-meta">
        <span>${icon("flame")} ${streak} day streak</span>
        <span>${icon("trophy")} ${done}/${total}</span>
      </div>
    </article>
  `;
}

function renderWidgetTask(tracker, date) {
  const log = getLog(date, tracker.id);
  const done = isTrackerDoneOnDate(tracker, date);
  const status = getTimingStatus(tracker, log, date);
  const delayLabel = getDelayPillLabel(tracker, date);
  const tone = status?.tone === "late" ? "late" : status?.tone === "waiting" ? "warn" : done ? "good" : "";
  const detail = status?.label || trackerLabel(tracker, log);
  const progress = getTrackerProgress(tracker, date, log, done);
  const plannedTime = getEffectivePlannedTime(tracker, date);
  const kicker = plannedTime ? formatDisplayTime(plannedTime) : trackerTypeLabel(tracker);
  return `
    <article class="item widget-task ${tone} ${delayLabel ? "is-delayed" : ""} ${done ? "is-done" : ""}">
      <div class="item-main">
        <span class="item-kicker">${esc(kicker)}</span>
        <strong>${esc(tracker.name)}</strong>
        ${delayLabel ? `<span class="item-delay">${esc(delayLabel)}</span>` : ""}
        <span>${esc(detail)}</span>
        <div class="item-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
      </div>
      ${renderPanelControl(tracker, date, log, done)}
    </article>
  `;
}

function renderTrackerItem(tracker, date) {
  const log = getLog(date, tracker.id);
  const done = isTrackerDoneToday(tracker);
  const status = getTimingStatus(tracker, log, date);
  const delayLabel = getDelayPillLabel(tracker, date);
  const tone = status?.tone === "late" ? "late" : status?.tone === "waiting" ? "warn" : done ? "good" : "";
  const detail = status?.label || trackerLabel(tracker, log);
  const progress = getTrackerProgress(tracker, date, log, done);
  const plannedTime = getEffectivePlannedTime(tracker, date);

  return `
    <article class="item ${tone} ${delayLabel ? "is-delayed" : ""} ${done ? "is-done" : ""}">
      <div class="item-main">
        <span class="item-kicker">${esc(trackerTypeLabel(tracker))}${plannedTime ? ` - ${esc(formatDisplayTime(plannedTime))}` : ""}</span>
        <strong>${esc(tracker.name)}</strong>
        ${delayLabel ? `<span class="item-delay">${esc(delayLabel)}</span>` : ""}
        <span>${esc(detail)}</span>
        <div class="item-progress" aria-hidden="true"><span style="width:${progress}%"></span></div>
      </div>
      ${renderPanelControl(tracker, date, log, done)}
    </article>
  `;
}

function renderPanelControl(tracker, date, log, done) {
  if (tracker.type === "counter") {
    const count = getCounterCount(date, tracker.id);
    const goal = Number(tracker.goal) || 0;
    const unit = tracker.unit || "unit";
    return `
      <div class="item-actions counter-stepper">
        <button class="mini-control" type="button" title="Decrease" data-action="counter-dec" data-id="${escAttr(tracker.id)}">${icon("minus")}</button>
        <span class="counter-pill" aria-label="${escAttr(`${count}${goal ? ` of ${goal}` : ""} ${unit}`)}">
          <strong>${count}${goal ? `/${goal}` : ""}</strong>
          <small>${esc(unit)}</small>
        </span>
        <button class="mini-control" type="button" title="Increase" data-action="counter-inc" data-id="${escAttr(tracker.id)}">${icon("plus")}</button>
      </div>
    `;
  }

  if (tracker.type === "time") {
    return `
      <div class="item-actions">
        <input class="panel-time-input" type="time" value="${escAttr(log.time || "")}" data-action="set-panel-time" data-id="${escAttr(tracker.id)}" aria-label="${escAttr(`Set time for ${tracker.name}`)}" />
      </div>
    `;
  }

  if (tracker.completionMode === "manual-time") {
    return `
      <div class="item-actions time-complete">
        <input class="panel-time-input" type="time" value="${escAttr(log.actualTime || normalizeTimeValue(log.completedAt) || "")}" data-action="set-panel-actual-time" data-id="${escAttr(tracker.id)}" aria-label="${escAttr(`Set actual time for ${tracker.name}`)}" />
        ${renderCompleteButton(tracker.id, done, tracker.name)}
      </div>
    `;
  }

  return `<div class="item-actions">${renderCompleteButton(tracker.id, done, tracker.name)}</div>`;
}

function renderCompleteButton(id, done, name) {
  return `
    <button class="status-toggle ${done ? "is-done" : ""}" type="button" title="${done ? "Mark pending" : "Mark done"}" data-action="toggle-complete" data-id="${escAttr(id)}" aria-label="${escAttr(`${done ? "Mark pending" : "Mark done"}: ${name}`)}">
      ${icon(done ? "check" : "circle")}
    </button>
  `;
}

function getTrackerProgress(tracker, date, log, done) {
  if (tracker.type === "counter") {
    const goal = Number(tracker.goal) || 0;
    if (!goal) return getCounterCount(date, tracker.id) > 0 ? 100 : 0;
    return Math.min(100, Math.round((getCounterCount(date, tracker.id) / goal) * 100));
  }
  if (tracker.type === "time") return log.time ? 100 : 0;
  return done ? 100 : 0;
}

function trackerTypeLabel(tracker) {
  if (tracker.type === "counter") return "Counter";
  if (tracker.type === "time") return "Time";
  if (tracker.type === "task") return "Task";
  return "Habit";
}

function trackerLabel(tracker, log) {
  if (tracker.type === "counter") {
    const count = getCounterCount(toDateKey(new Date()), tracker.id);
    return `${count}${tracker.goal ? `/${tracker.goal}` : ""} ${tracker.unit || "unit"}`;
  }
  if (tracker.type === "time") return log.time ? `Actual ${formatDisplayTime(log.time)}` : "Waiting for time";
  return log.completed ? "Done" : "Pending";
}

function getWidgetTasks(trackers, date) {
  const now = currentTimeMinutes();
  const remaining = trackers.filter((tracker) => !isTrackerDoneOnDate(tracker, date));
  if (!remaining.length) return [];

  const selected = remaining.filter((tracker) => tracker.showInWidget !== false);
  const autoTimed = remaining.filter((tracker) => isInWidgetAutoWindow(tracker, now));
  const source = selected.length || autoTimed.length ? dedupeTrackers([...autoTimed, ...selected]) : remaining;
  return source.sort((a, b) => compareWidgetTasks(a, b, now));
}

function compareWidgetTasks(a, b, now) {
  const aPriority = getWidgetTaskPriority(a, now);
  const bPriority = getWidgetTaskPriority(b, now);
  if (aPriority !== bPriority) return aPriority - bPriority;

  const aBucket = getWidgetTaskBucket(a, now);
  const bBucket = getWidgetTaskBucket(b, now);
  if (aBucket !== bBucket) return aBucket - bBucket;

  const today = toDateKey(new Date());
  const aMinutes = timeToMinutes(getEffectivePlannedTime(a, today));
  const bMinutes = timeToMinutes(getEffectivePlannedTime(b, today));
  if (aMinutes !== null && bMinutes !== null && aMinutes !== bMinutes) return aMinutes - bMinutes;

  return Number(a.order || 0) - Number(b.order || 0);
}

function getWidgetTaskPriority(tracker, now) {
  if (isInWidgetAutoWindow(tracker, now)) return 0;
  if (tracker.showInWidget !== false) return 1;
  return 2;
}

function getWidgetTaskBucket(tracker, now) {
  const minutes = timeToMinutes(getEffectivePlannedTime(tracker, toDateKey(new Date())));
  if (minutes !== null && minutes >= now) return 0;
  if (minutes === null) return 1;
  return 2;
}

function isInWidgetAutoWindow(tracker, now) {
  const minutes = timeToMinutes(getEffectivePlannedTime(tracker, toDateKey(new Date())));
  if (minutes === null) return false;
  return minutes >= now - 60 && minutes <= now + 60;
}

function dedupeTrackers(trackers) {
  const seen = new Set();
  return trackers.filter((tracker) => {
    if (seen.has(tracker.id)) return false;
    seen.add(tracker.id);
    return true;
  });
}

function queuePanelResize() {
  if (!window.dailyTrack?.resizePanel) return;

  requestAnimationFrame(() => {
    const frame = document.querySelector(".panel-frame");
    const header = frame?.querySelector(".panel-header");
    const section = frame?.querySelector(".section");
    if (!frame || !header || !section) return;

    const frameStyle = getComputedStyle(frame);
    const paddingY = parseFloat(frameStyle.paddingTop) + parseFloat(frameStyle.paddingBottom);
    const borderY = parseFloat(frameStyle.borderTopWidth) + parseFloat(frameStyle.borderBottomWidth);
    const gap = parseFloat(frameStyle.rowGap) || parseFloat(frameStyle.gap) || 0;
    const sectionHeight = getChildrenHeight(section);
    const height = Math.ceil(header.getBoundingClientRect().height + gap + sectionHeight + paddingY + borderY);
    window.dailyTrack.resizePanel({ height });
  });
}

function getChildrenHeight(container) {
  const children = Array.from(container.children).filter((child) => child.getClientRects().length);
  if (!children.length) return 0;
  const first = children[0].getBoundingClientRect();
  const last = children[children.length - 1].getBoundingClientRect();
  return Math.ceil(last.bottom - first.top);
}

function startClock() {
  if (clockTimer) return;
  updatePanelClock();
  clockTimer = window.setInterval(updatePanelClock, 1000);
}

function updatePanelClock() {
  const now = new Date();
  const today = toDateKey(now);
  if (renderedDateKey && today !== renderedDateKey) {
    render();
    return;
  }

  const clock = document.querySelector("[data-widget-clock]");
  if (clock) {
    const parts = getClockParts(now);
    const time = clock.querySelector("[data-clock-time]");
    const period = clock.querySelector("[data-clock-period]");
    if (time) time.textContent = parts.time;
    if (period) {
      period.textContent = parts.period;
      period.hidden = !parts.period;
    }
    if (parts.seconds === "00") clock.classList.add("is-resetting-second");
    clock.style.setProperty("--second-progress", parts.progress);
    if (parts.seconds === "00") requestAnimationFrame(() => clock.classList.remove("is-resetting-second"));
    clock.setAttribute("aria-label", `Current time ${parts.aria}`);
  }

  const greeting = document.querySelector("[data-panel-greeting]");
  if (greeting) greeting.textContent = getGreetingText(now);
  const dateLabel = document.querySelector("[data-panel-date]");
  if (dateLabel) dateLabel.textContent = formatLongDate(today);
  updateCelebrationQuote(now);
}

function updateCelebrationQuote(date) {
  const quoteNode = document.querySelector("[data-celebration-quote]");
  if (!quoteNode) return;

  const quote = getCelebrationQuote(date);
  if (quoteNode.dataset.quoteIndex === String(quote.index)) return;

  quoteNode.dataset.quoteIndex = String(quote.index);
  quoteNode.classList.remove("is-swapping");
  void quoteNode.offsetWidth;
  quoteNode.textContent = quote.text;
  quoteNode.classList.add("is-swapping");
}

function normalizePreferences(value) {
  return {
    appearance: ["system", "light", "dark"].includes(value?.appearance) ? value.appearance : "system",
    timeFormat: ["12", "24"].includes(String(value?.timeFormat)) ? String(value.timeFormat) : "12",
  };
}

function normalizeProfile(value) {
  return {
    name: typeof value?.name === "string" ? value.name.trim().slice(0, 80) : "",
  };
}

function getAppearanceMode() {
  state.preferences = normalizePreferences(state.preferences);
  return state.preferences.appearance;
}

function getTimeFormat() {
  state.preferences = normalizePreferences(state.preferences);
  return state.preferences.timeFormat;
}

function applyAppearance() {
  const mode = getAppearanceMode();
  if (mode === "system") {
    document.documentElement.removeAttribute("data-theme");
    return;
  }
  document.documentElement.dataset.theme = mode;
}

async function togglePanelComplete(id) {
  const tracker = state.trackers.find((item) => item.id === id);
  if (!tracker) return;

  const log = ensureLog(toDateKey(new Date()), id);
  log.completed = !log.completed;
  if (log.completed) {
    const now = currentTimeValue();
    log.completedAt = now;
    if (tracker.completionMode === "manual-time" && !log.actualTime) log.actualTime = now;
  } else {
    log.completedAt = "";
    log.completionCelebrated = false;
    if (tracker.completionMode === "manual-time") log.actualTime = "";
  }
  await finishPanelChange();
}

async function updatePanelCounter(id, delta) {
  const date = toDateKey(new Date());
  const tracker = state.trackers.find((item) => item.id === id);
  if (!tracker) return;

  const log = ensureLog(date, id);
  if (delta > 0) {
    log.entries.push({
      id: createId("entry"),
      amount: 1,
      at: formatTime(new Date()),
    });
  } else {
    const index = findLastIndex(log.entries, (entry) => Number(entry.amount) > 0);
    if (index >= 0) log.entries.splice(index, 1);
  }

  const goal = Number(tracker.goal) || 0;
  if (goal && getCounterCount(date, id) < goal) log.goalCelebrated = false;
  await finishPanelChange();
}

async function setPanelTime(id, value) {
  const log = ensureLog(toDateKey(new Date()), id);
  log.time = value;
  log.completed = Boolean(value);
  if (!log.completed) log.completionCelebrated = false;
  await finishPanelChange();
}

async function setPanelActualTime(id, value) {
  const log = ensureLog(toDateKey(new Date()), id);
  log.actualTime = value;
  log.completedAt = value;
  log.completed = Boolean(value);
  if (!log.completed) log.completionCelebrated = false;
  await finishPanelChange();
}

async function finishPanelChange() {
  if (!window.dailyTrack || !session) return;
  await window.dailyTrack.saveState(state);
  render();
}

function getTrackersForDate(date) {
  return state.trackers
    .filter((tracker) => shouldShowTracker(tracker, date))
    .sort((a, b) => compareTrackersForDate(a, b, date));
}

function compareTrackersForDate(a, b, date) {
  const aMinutes = timeToMinutes(getEffectivePlannedTime(a, date));
  const bMinutes = timeToMinutes(getEffectivePlannedTime(b, date));
  if (aMinutes !== null && bMinutes !== null && aMinutes !== bMinutes) return aMinutes - bMinutes;
  if (aMinutes !== null || bMinutes !== null) return aMinutes !== null ? -1 : 1;
  return Number(a.order || 0) - Number(b.order || 0);
}

function isTrackerDoneToday(tracker) {
  return isTrackerDoneOnDate(tracker, toDateKey(new Date()));
}

function isTrackerDoneOnDate(tracker, date) {
  const log = getLog(date, tracker.id);
  if (tracker.type === "counter") return tracker.goal ? getCounterCount(date, tracker.id) >= Number(tracker.goal) : getCounterCount(date, tracker.id) > 0;
  if (tracker.type === "time") return Boolean(log.time);
  return Boolean(log.completed);
}

function shouldShowTracker(tracker, date) {
  const delay = getDelayInfo(tracker);
  if (delay?.targetDate === date) return true;

  const mode = tracker.repeat?.mode || (tracker.type === "task" ? "none" : "daily");
  const startDate = tracker.startDate || toDateKey(new Date(tracker.createdAt || Date.now()));
  if (date < startDate) return false;

  const day = parseDateKey(date).getDay();
  const start = parseDateKey(startDate);

  if (mode === "none") return date === startDate;
  if (mode === "daily") return true;
  if (mode === "selected") return (tracker.repeat?.days || []).map(String).includes(String(day));
  if (mode === "weekly") return day === start.getDay();
  if (mode === "monthly") return parseDateKey(date).getDate() === start.getDate();
  return true;
}

function getLog(date, trackerId) {
  return state.logs[date]?.[trackerId] || { completed: false, completedAt: "", actualTime: "", time: "", entries: [] };
}

function ensureLog(date, trackerId) {
  if (!state.logs[date]) state.logs[date] = {};
  if (!state.logs[date][trackerId]) {
    state.logs[date][trackerId] = {
      completed: false,
      completedAt: "",
      actualTime: "",
      time: "",
      entries: [],
      completionCelebrated: false,
      goalCelebrated: false,
    };
  }
  if (!Array.isArray(state.logs[date][trackerId].entries)) state.logs[date][trackerId].entries = [];
  if (typeof state.logs[date][trackerId].actualTime !== "string") state.logs[date][trackerId].actualTime = "";
  if (typeof state.logs[date][trackerId].completionCelebrated !== "boolean") state.logs[date][trackerId].completionCelebrated = false;
  if (typeof state.logs[date][trackerId].goalCelebrated !== "boolean") state.logs[date][trackerId].goalCelebrated = false;
  return state.logs[date][trackerId];
}

function getCounterCount(date, trackerId) {
  const entries = getLog(date, trackerId).entries || [];
  return entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
}

function getExpenses(date) {
  return Array.isArray(state.expenses[date]) ? state.expenses[date] : [];
}

function getExpenseTotal(date) {
  return getExpenses(date).reduce((total, expense) => total + Number(expense.amount || 0), 0);
}

function getDelayInfo(tracker) {
  const delay = tracker?.delay;
  if (!delay || typeof delay !== "object") return null;
  if (!delay.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(delay.targetDate))) return null;
  return {
    originalDate: String(delay.originalDate || tracker.startDate || delay.targetDate),
    targetDate: String(delay.targetDate),
    targetTime: normalizeTimeValue(delay.targetTime) || "",
    count: Math.max(1, Number(delay.count || 1)),
  };
}

function getEffectivePlannedTime(tracker, date) {
  const delay = getDelayInfo(tracker);
  if (delay?.targetDate === date && delay.targetTime) return delay.targetTime;
  return normalizeTimeValue(tracker?.plannedTime) || "";
}

function getDelayPillLabel(tracker, date) {
  const delay = getDelayInfo(tracker);
  if (!delay) return "";
  const count = delay.count > 1 ? `${delay.count}x ` : "";
  const target = formatDelayTarget(delay);
  if (delay.originalDate === date && delay.targetDate !== date) return `${count}Delayed to ${target}`;
  if (delay.targetDate === date) return `${count}Delayed to ${delay.targetTime ? formatDisplayTime(delay.targetTime) : "today"}`;
  return "";
}

function formatDelayTarget(target) {
  const dateLabel = target.targetDate === toDateKey(new Date()) ? "Today" : shortDateLabel(target.targetDate);
  return `${dateLabel}${target.targetTime ? ` ${formatDisplayTime(target.targetTime)}` : ""}`;
}

function getTimingStatus(tracker, log, date = null) {
  const plannedTime = date ? getEffectivePlannedTime(tracker, date) : tracker.plannedTime;
  if (!plannedTime) return null;
  const actualTime = tracker.type === "time" ? log.time : log.actualTime || normalizeTimeValue(log.completedAt);
  const plannedMinutes = timeToMinutes(plannedTime);
  if (plannedMinutes === null) return null;
  if (!actualTime) return { label: "Waiting for actual time", tone: "waiting" };

  const actualMinutes = timeToMinutes(actualTime);
  if (actualMinutes === null) return null;
  const diff = actualMinutes - plannedMinutes;
  const grace = Math.max(0, Number(tracker.graceMinutes || 0));
  if (diff > grace) return { label: `Late by ${formatDurationMinutes(diff)}`, tone: "late" };
  if (diff < 0) return { label: `Early by ${formatDurationMinutes(Math.abs(diff))}`, tone: "good" };
  return { label: "On time", tone: "good" };
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLongDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function shortDateLabel(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getGreetingText(date) {
  const hour = date.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${greeting}, ${getGreetingName()}`;
}

function getGreetingName() {
  const name = getDisplayName();
  return name.split(/\s+/).filter(Boolean)[0] || "there";
}

function getDisplayName() {
  state.profile = normalizeProfile(state.profile);
  if (state.profile.name) return state.profile.name;
  if (session?.name) return session.name;
  if (session?.email) return formatUserName(session.email);
  return "there";
}

function getCelebrationQuote(date) {
  const index = Math.floor(date.getTime() / 6000) % completionQuotes.length;
  return {
    index,
    text: completionQuotes[index],
  };
}

function getDailyWinStreak(dateKey) {
  let streak = 0;
  for (let offset = 0; offset < 60; offset += 1) {
    const date = addDays(dateKey, -offset);
    const trackers = getTrackersForDate(date);
    if (!trackers.length) {
      if (offset === 0) return 0;
      continue;
    }
    const done = trackers.filter((tracker) => isTrackerDoneOnDate(tracker, date)).length;
    if (done !== trackers.length) break;
    streak += 1;
  }
  return streak;
}

function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function formatUserName(email) {
  const localPart = String(email || "").split("@")[0] || "User";
  const words = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!words.length) return localPart;
  return words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join(" ");
}

function getClockParts(date) {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const progress = Math.min(1, Math.max(0, (date.getSeconds() + date.getMilliseconds() / 1000) / 60)).toFixed(4);
  if (getTimeFormat() === "24") {
    const time = `${String(hours).padStart(2, "0")}:${minutes}`;
    return { time, seconds, period: "", progress, aria: `${time}:${seconds}` };
  }

  const period = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  const time = `${hour}:${minutes}`;
  return { time, seconds, period, progress, aria: `${time}:${seconds} ${period}` };
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `Rs.${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function currentTimeMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function normalizeTimeValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const inputMatch = text.match(/^(\d{1,2}):(\d{2})$/);
  if (inputMatch) return `${inputMatch[1].padStart(2, "0")}:${inputMatch[2]}`;
  const displayMatch = text.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!displayMatch) return "";
  let hour = Number(displayMatch[1]);
  const period = displayMatch[3].toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${displayMatch[2]}`;
}

function timeToMinutes(value) {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function formatDisplayTime(value) {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return "";
  if (getTimeFormat() === "24") return normalized;
  const [hourValue, minuteValue] = normalized.split(":").map(Number);
  const period = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minuteValue).padStart(2, "0")} ${period}`;
}

function formatDurationMinutes(totalMinutes) {
  const minutes = Math.max(0, Number(totalMinutes || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function currentTimeValue() {
  return formatTime(new Date());
}

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escAttr(value) {
  return esc(value);
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index, items)) return index;
  }
  return -1;
}

function renderMessage(message) {
  panel.innerHTML = `<div class="panel-shell"><section class="panel-frame"><p class="muted">${esc(message)}</p></section></div>`;
}
