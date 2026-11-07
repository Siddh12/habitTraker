const STORAGE_KEY = "dailytrack-state-v1";
const NEW_SECTION_VALUE = "__new_section__";

const trackerTypes = {
  checkbox: {
    label: "Habit",
    icon: "check-circle",
    helper: "Done or not done",
  },
  counter: {
    label: "Counter",
    icon: "droplet",
    helper: "Multiple entries per day",
  },
  time: {
    label: "Time",
    icon: "clock",
    helper: "Time or duration",
  },
  task: {
    label: "Task",
    icon: "list-check",
    helper: "One-time or repeatable item",
  },
};

const repeatLabels = {
  none: "No repeat",
  daily: "Every day",
  selected: "Selected days",
  weekly: "Weekly",
  monthly: "Monthly",
};

const appearanceModes = [
  ["system", "settings", "System"],
  ["light", "spark", "Light"],
  ["dark", "circle", "Dark"],
];

const timeFormatModes = [
  ["12", "clock", "12 hour", "5:42 PM"],
  ["24", "clock", "24 hour", "17:42"],
];

const desktopWidgetModes = [
  ["on", "pin", "Show widget", "Keep it on desktop"],
  ["off", "x", "Hide widget", "Use full app only"],
];

const mainAppTabs = [
  ["today", "check-circle", "Today"],
  ["calendar", "calendar", "Calendar"],
  ["trackers", "list-check", "Trackers"],
  ["history", "history", "History"],
  ["reports", "grid", "Reports"],
];

const delayPresets = [
  ["hour", "history", "Delay 1 hour", "Buy a little time"],
  ["day", "calendar", "Move to tomorrow", "Carry the promise forward"],
];

const weekdays = [
  ["0", "Sun"],
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
];

const desktopApi = window.dailyTrack || null;
let state = loadState();
let ui = {
  view: "today",
  activeDate: toDateKey(new Date()),
  modal: null,
  achievement: null,
  achievementTimer: null,
  completionPopover: false,
  session: null,
  auth: {
    name: "",
    email: "",
    otpSent: false,
    message: "",
    devCode: "",
  },
  segmentTransition: null,
};

const app = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");

app.addEventListener("click", handleClick);
app.addEventListener("change", handleChange);
modalRoot.addEventListener("click", handleClick);
modalRoot.addEventListener("change", handleChange);
modalRoot.addEventListener("submit", handleSubmit);
app.addEventListener("submit", handleSubmit);
document.addEventListener?.("keydown", handleKeydown);
window.addEventListener?.("resize", () => syncSegmentedControls());

initApp();

async function initApp() {
  if (desktopApi) {
    ui.session = await desktopApi.getSession();
    if (ui.session) state = await desktopApi.getState();
    desktopApi.onStateUpdated(async () => {
      if (!ui.session) return;
      state = await desktopApi.getState();
      render();
    });
    desktopApi.onSessionUpdated(async () => {
      ui.session = await desktopApi.getSession();
      if (ui.session) state = await desktopApi.getState();
      render();
    });
  }

  render();
}

function loadState() {
  const fallback = {
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
      desktopWidget: true,
    },
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return fallback;
    return {
      sections: Array.isArray(saved.sections) ? saved.sections : [],
      trackers: Array.isArray(saved.trackers) ? saved.trackers : [],
      logs: saved.logs && typeof saved.logs === "object" ? saved.logs : {},
      expenses: saved.expenses && typeof saved.expenses === "object" ? saved.expenses : {},
      profile: normalizeProfile(saved.profile),
      preferences: normalizePreferences(saved.preferences),
    };
  } catch (error) {
    return fallback;
  }
}

function saveState() {
  if (desktopApi && ui.session) {
    desktopApi.saveState(state);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizePreferences(value) {
  return {
    appearance: ["system", "light", "dark"].includes(value?.appearance) ? value.appearance : "system",
    timeFormat: ["12", "24"].includes(String(value?.timeFormat)) ? String(value.timeFormat) : "12",
    desktopWidget: typeof value?.desktopWidget === "boolean" ? value.desktopWidget : true,
  };
}

function normalizeProfile(value) {
  return {
    name: typeof value?.name === "string" ? cleanText(value.name).slice(0, 80) : "",
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

function getDesktopWidgetMode() {
  state.preferences = normalizePreferences(state.preferences);
  return state.preferences.desktopWidget ? "on" : "off";
}

function applyAppearance() {
  const mode = getAppearanceMode();
  if (mode === "system") {
    document.documentElement.removeAttribute("data-theme");
    return;
  }
  document.documentElement.dataset.theme = mode;
}

function render() {
  applyAppearance();

  if (desktopApi && !ui.session) {
    app.innerHTML = renderAuthScreen();
    modalRoot.innerHTML = "";
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      ${renderTopbar()}
      ${ui.view === "today" ? renderToday() : ""}
      ${ui.view === "calendar" ? renderCalendar() : ""}
      ${ui.view === "trackers" ? renderTrackers() : ""}
      ${ui.view === "history" ? renderHistory() : ""}
      ${ui.view === "reports" ? renderReports() : ""}
      ${ui.view === "settings" ? renderSettings() : ""}
      ${renderMobileTabbar()}
    </div>
  `;
  modalRoot.innerHTML = renderModal();
  syncSegmentedControls(ui.segmentTransition);
  ui.segmentTransition = null;
}

function renderAuthScreen() {
  return `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="brand auth-brand">
          <div class="brand-mark">${icon("spark")}</div>
          <div>
            <h1 class="brand-title">DailyTrack</h1>
            <p class="brand-subtitle">Sign in with email OTP</p>
          </div>
        </div>
        <form class="form-grid" data-form="request-otp">
          <div class="field">
            <label for="auth-name">Name</label>
            <input id="auth-name" name="name" value="${escAttr(ui.auth.name)}" placeholder="Your name" autocomplete="name" required />
          </div>
          <div class="field">
            <label for="auth-email">Email</label>
            <input id="auth-email" name="email" type="email" value="${escAttr(ui.auth.email)}" placeholder="you@example.com" required />
          </div>
          <button class="action-button primary" type="submit">${icon("mail")} Send OTP</button>
        </form>
        ${
          ui.auth.otpSent
            ? `<form class="form-grid" data-form="verify-otp">
                <input type="hidden" name="name" value="${escAttr(ui.auth.name)}" />
                <input type="hidden" name="email" value="${escAttr(ui.auth.email)}" />
                <div class="field">
                  <label for="auth-code">OTP</label>
                  <input id="auth-code" name="code" inputmode="numeric" maxlength="6" placeholder="Enter 6 digit OTP" required />
                </div>
                <button class="action-button primary" type="submit">${icon("check")} Verify and open</button>
              </form>`
            : ""
        }
        ${ui.auth.message ? `<p class="auth-message">${esc(ui.auth.message)}</p>` : ""}
        ${ui.auth.devCode ? `<p class="auth-dev-code">Development OTP: <strong>${esc(ui.auth.devCode)}</strong></p>` : ""}
      </section>
    </main>
  `;
}

function renderTopbar() {
  const profileTabs = [
    ["settings", "settings", "Settings"],
  ];

  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">${icon("spark")}</div>
        <div>
          <h1 class="brand-title">DailyTrack</h1>
          <p class="brand-subtitle">Routines, timing, and spend</p>
        </div>
      </div>
      <div class="topbar-actions">
        ${renderSegmentedControl("app", "App sections", mainAppTabs)}
        <div class="profile-section">
          ${renderUserSummary()}
          ${renderSegmentedControl(
            "profile",
            "Profile section",
            profileTabs,
            desktopApi
              ? `<button class="tab-button profile-action" type="button" data-action="logout">
                  ${icon("x")}
                  <span>Logout</span>
                </button>`
              : "",
          )}
        </div>
      </div>
    </header>
  `;
}

function renderMobileTabbar() {
  return `
    <div class="mobile-tabbar" aria-label="Mobile app sections">
      ${renderSegmentedControl("mobile-app", "Mobile app sections", mainAppTabs)}
    </div>
  `;
}

function renderSegmentedControl(name, label, tabs, extra = "") {
  return `
    <nav class="segmented-control ${name}-nav" data-segmented-control="${escAttr(name)}" aria-label="${escAttr(label)}">
      <span class="segment-indicator" aria-hidden="true"></span>
      ${tabs
        .map(
          ([view, iconName, tabLabel]) => `
            <button class="tab-button ${ui.view === view ? "is-active" : ""}" type="button" data-action="set-view" data-view="${view}">
              ${icon(iconName)}
              <span>${tabLabel}</span>
            </button>
          `,
        )
        .join("")}
      ${extra}
    </nav>
  `;
}

function captureSegmentedControlMetrics() {
  const metrics = {};
  document.querySelectorAll("[data-segmented-control]").forEach((control) => {
    const name = control.dataset.segmentedControl;
    const active = control.querySelector(".tab-button.is-active");
    if (!name || !active) return;
    metrics[name] = {
      x: active.offsetLeft,
      width: active.offsetWidth,
    };
  });
  return metrics;
}

function syncSegmentedControls(previousMetrics = null) {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("[data-segmented-control]").forEach((control) => {
    const name = control.dataset.segmentedControl;
    const indicator = control.querySelector(".segment-indicator");
    const active = control.querySelector(".tab-button.is-active");
    if (!indicator) return;

    if (!active) {
      control.classList.remove("has-active-segment");
      indicator.hidden = true;
      return;
    }

    const current = {
      x: active.offsetLeft,
      width: active.offsetWidth,
    };
    indicator.hidden = false;
    control.classList.add("has-active-segment");

    const previous = previousMetrics?.[name];
    if (previous && previous.width > 0 && !reduceMotion) {
      setSegmentPosition(control, previous, false);
      requestAnimationFrame(() => setSegmentPosition(control, current, true));
      return;
    }

    setSegmentPosition(control, current, false);
  });
}

function setSegmentPosition(control, metric, animate) {
  control.classList.toggle("is-measuring", !animate);
  control.style.setProperty("--segment-x", `${Math.round(metric.x)}px`);
  control.style.setProperty("--segment-width", `${Math.round(metric.width)}px`);
  if (!animate) {
    const indicator = control.querySelector(".segment-indicator");
    if (indicator) void indicator.offsetWidth;
    control.classList.remove("is-measuring");
  }
}

function renderUserSummary() {
  const today = toDateKey(new Date());
  const stats = getCompletionStatsForDate(today);
  const completedItems = getCompletedTrackerItems(today);
  const hasSession = Boolean(ui.session?.email);
  if (!hasSession && desktopApi) return "";
  if (!hasSession && !stats.total) return "";

  const userName = hasSession ? formatUserName(ui.session.email) : "Local workspace";
  const userDetail = hasSession ? ui.session.email : "Today";
  const completionLabel = stats.total ? `${completedItems.length} of ${stats.total} completed today` : "No trackers today";
  const completionTone = completedItems.some((item) => item.tone === "late") ? "has-late" : completedItems.length ? "has-wins" : "is-empty";

  return `
    <div class="user-summary">
      <div class="user-summary-text">
        <span class="user-summary-name">${esc(userName)}</span>
        <span class="user-summary-detail">${esc(userDetail)}</span>
      </div>
      ${
        completedItems.length
          ? `<button class="completion-stack ${escAttr(completionTone)} ${ui.completionPopover ? "is-open" : ""}" type="button" data-action="toggle-completion-popover" data-completion-area aria-label="${escAttr(completionLabel)}" aria-expanded="${ui.completionPopover ? "true" : "false"}">
              ${renderCompletionTrophies(completedItems, stats.total)}
            </button>`
          : ""
      }
      ${ui.completionPopover ? renderCompletionPopover(completedItems, stats) : ""}
    </div>
  `;
}

function renderCompletionTrophies(items, total) {
  if (!items.length) {
    const label = total ? "No completed tracker yet" : "No trackers today";
    return `
      <span class="completion-trophy is-empty" role="img" aria-label="${escAttr(label)}" title="${escAttr(label)}" data-tooltip="${escAttr(label)}">
        ${icon("trophy")}
      </span>
    `;
  }

  const visibleItems = items.slice(0, 3);
  const hiddenItems = items.slice(3);
  return `
    <span class="completion-trophies">
      ${visibleItems.map((item) => renderCompletionTrophy(item)).join("")}
      ${
        hiddenItems.length
          ? `<span class="completion-extra" title="${escAttr(hiddenItems.map((item) => item.tooltip).join("\n"))}" data-tooltip="${escAttr(hiddenItems.map((item) => item.label).join(", "))}">+${hiddenItems.length}</span>`
          : ""
      }
    </span>
  `;
}

function renderCompletionTrophy(item) {
  return `
    <span class="completion-trophy ${escAttr(item.tone)}" role="img" aria-label="${escAttr(item.tooltip)}" title="${escAttr(item.tooltip)}" data-tooltip="${escAttr(item.tooltip)}">
      ${icon("trophy")}
    </span>
  `;
}

function renderCompletionPopover(items, stats) {
  const summary = stats.total ? `${items.length}/${stats.total} completed today` : "No trackers today";

  return `
    <section class="completion-popover" data-completion-area role="dialog" aria-label="Today's completed trackers">
      <div class="completion-popover-head">
        <div>
          <strong>Today's completed</strong>
          <span>${esc(summary)}</span>
        </div>
        <button class="icon-button compact" type="button" title="Close" data-action="close-completion-popover">${icon("x")}</button>
      </div>
      ${
        items.length
          ? `<ul class="completion-popover-list">
              ${items.map((item) => renderCompletionPopoverItem(item)).join("")}
            </ul>`
          : `<p class="completion-popover-empty">Completed trackers will appear here.</p>`
      }
    </section>
  `;
}

function renderCompletionPopoverItem(item) {
  return `
    <li class="completion-popover-item ${escAttr(item.tone)}">
      <span class="completion-popover-icon">${icon("trophy")}</span>
      <span class="completion-popover-text">
        <strong>${esc(item.label)}</strong>
        <span>${esc(item.detail)}</span>
      </span>
    </li>
  `;
}

function renderToday() {
  const date = toDateKey(new Date());
  const trackers = getTrackersForDate(date);
  const expenses = getExpenses(date);
  const isEmpty = state.sections.length === 0 && state.trackers.length === 0 && expenses.length === 0;

  return `
    <main class="workspace">
      ${isEmpty ? renderEmptyHero() : renderHeroSummary(date)}
      ${!isEmpty ? renderStats(date) : ""}
      ${!isEmpty ? renderStreakSummary(date) : ""}
      ${!isEmpty ? renderTodayBoard(date, trackers, expenses) : ""}
    </main>
  `;
}

function renderEmptyHero() {
  return `
    <section class="hero-panel hero-panel-empty">
      <div class="hero-copy">
        <p class="eyebrow">${icon("spark")} Blank board</p>
        <h2 class="hero-title">Build your day your way.</h2>
        <p class="hero-text">Start with your own sections and trackers. Add any counter, checkbox, time field, task, or expense source that fits your day.</p>
        <div class="hero-actions">
          <button class="action-button primary" type="button" data-action="open-choose">${icon("plus")} Add item</button>
          <button class="action-button soft" type="button" data-action="open-section-form">${icon("grid")} Add section</button>
        </div>
      </div>
      <div class="hero-docket" aria-label="Starter options">
        ${renderHeroMetric("check-circle", "Habits", "0", "Daily rituals")}
        ${renderHeroMetric("flame", "Streak", "0", "Build consistency")}
        ${renderHeroMetric("clock", "Timing", "0", "Planned vs actual")}
      </div>
    </section>
  `;
}

function renderHeroSummary(date) {
  const overview = getTodayOverview(date);

  return `
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">${icon("calendar")} ${formatLongDate(date)}</p>
        <h2 class="hero-title">${esc(overview.title)}</h2>
        <p class="hero-text">${esc(overview.summary)}</p>
        <div class="hero-progress" aria-label="${escAttr(`${overview.progress}% complete today`)}">
          <span style="width:${overview.progress}%"></span>
        </div>
        <div class="hero-actions">
          <button class="action-button primary" type="button" data-action="open-choose">${icon("plus")} Add item</button>
          <button class="action-button soft" type="button" data-action="open-expense-form">${icon("wallet")} Add expense</button>
        </div>
      </div>
      <div class="hero-docket" aria-label="Today details">
        ${renderHeroMetric("check-circle", "Completion", `${overview.progress}%`, `${overview.done}/${overview.total || 0} complete`, "good")}
        ${renderHeroMetric("clock", "Next", overview.nextLabel, overview.nextDetail, overview.nextTone)}
        ${renderHeroMetric("wallet", "Spent", formatMoney(overview.spent), `${overview.expenses} expense${overview.expenses === 1 ? "" : "s"}`)}
      </div>
    </section>
  `;
}

function getTodayOverview(date) {
  const trackers = getTrackersForDate(date);
  const expenses = getExpenses(date);
  const stats = getCompletionStatsForDate(date);
  const nextTracker = getNextPlannedTracker(trackers, date);
  const progress = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const remaining = Math.max(stats.total - stats.done, 0);

  return {
    done: stats.done,
    total: stats.total,
    progress,
    spent: getExpenseTotal(date),
    expenses: expenses.length,
    title: stats.total ? `${stats.done}/${stats.total} finished` : "Today overview",
    summary: stats.total
      ? remaining
        ? `${remaining} item${remaining === 1 ? "" : "s"} left. Keep the board light and finish what matters.`
        : "Everything planned for today is complete."
      : "No active trackers today. Add one when you are ready.",
    nextLabel: nextTracker ? formatDisplayTime(getEffectivePlannedTime(nextTracker, date)) : "Clear",
    nextDetail: nextTracker ? nextTracker.name : "No upcoming fixed-time item",
    nextTone: nextTracker ? "waiting" : "good",
  };
}

function getNextPlannedTracker(trackers, date) {
  const nowMinutes = timeToMinutes(currentTimeValue());
  return trackers
    .filter((tracker) => getEffectivePlannedTime(tracker, date) && !isTrackerCompleteForDate(tracker, date))
    .filter((tracker) => timeToMinutes(getEffectivePlannedTime(tracker, date)) >= nowMinutes)
    .sort((a, b) => timeToMinutes(getEffectivePlannedTime(a, date)) - timeToMinutes(getEffectivePlannedTime(b, date)))[0];
}

function renderHeroMetric(iconName, label, value, detail, tone = "") {
  return `
    <div class="hero-metric ${escAttr(tone)}">
      <span class="hero-metric-icon">${icon(iconName)}</span>
      <span class="hero-metric-label">${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <span class="hero-metric-detail">${esc(detail)}</span>
    </div>
  `;
}

function renderStats(date) {
  const trackers = getTrackersForDate(date);
  const completionStats = getCompletionStatsForDate(date);
  const countersDone = trackers.filter((tracker) => {
    if (tracker.type !== "counter" || !Number(tracker.goal)) return false;
    return getCounterCount(date, tracker.id) >= Number(tracker.goal);
  }).length;
  const expenseTotal = getExpenseTotal(date);

  return `
    <section class="stats-grid" aria-label="Today summary">
      ${renderStat("check-circle", "Complete", `${completionStats.done}/${completionStats.total || 0}`)}
      ${renderStat("droplet", "Goals hit", String(countersDone))}
      ${renderStat("wallet", "Spent", formatMoney(expenseTotal))}
      ${renderStat("grid", "Trackers", String(trackers.length))}
    </section>
  `;
}

function renderStreakSummary(date) {
  const snapshot = getStreakSnapshot(date);
  const week = snapshot.currentWeek;
  const tone = week.weekWon ? "is-won" : week.dailyWins ? "is-building" : "is-starting";
  const targetLabel = week.targetWins
    ? `${week.dailyWins}/${week.targetWins} win day${week.targetWins === 1 ? "" : "s"}`
    : "No streak items";
  const message = getStreakMessage(snapshot);

  return `
    <section class="streak-card ${tone}" aria-label="Weekly streak">
      <div class="streak-main">
        <div class="streak-flame level-${snapshot.level}" aria-hidden="true">
          ${icon("flame")}
        </div>
        <div>
          <p class="eyebrow">${icon("flame")} Weekly streak</p>
          <h3 class="streak-title">${snapshot.currentStreak} week${snapshot.currentStreak === 1 ? "" : "s"}</h3>
          <p class="streak-copy">${esc(message)}</p>
        </div>
      </div>
      <div class="streak-week" aria-label="${escAttr(targetLabel)}">
        <div class="streak-week-head">
          <span>${esc(targetLabel)}</span>
          <strong>${week.completionPercent}%</strong>
        </div>
        <div class="streak-week-track" aria-hidden="true">
          <span style="transform: scaleX(${Math.min(1, week.targetWins ? week.dailyWins / week.targetWins : 0)})"></span>
        </div>
        <div class="streak-steps">
          ${week.days.map((day, index) => renderStreakStep(day, index)).join("")}
        </div>
        <button class="action-button soft streak-calendar-button" type="button" data-action="set-view" data-view="calendar">
          ${icon("calendar")} Open calendar
        </button>
      </div>
    </section>
  `;
}

function renderStreakStep(day, index) {
  return `
    <span class="streak-step ${escAttr(day.status)}" style="--i:${index}" title="${escAttr(day.tooltip)}" aria-label="${escAttr(day.tooltip)}">
      <span>${esc(shortWeekdayLabel(day.date))}</span>
      <strong>${parseDateKey(day.date).getDate()}</strong>
    </span>
  `;
}

function getStreakMessage(snapshot) {
  const week = snapshot.currentWeek;
  if (!week.scheduledDays) return "Choose which habits count toward streak, then your weekly rhythm starts here.";
  if (week.weekWon && week.perfect) return "Perfect week is alive. Every streak item is complete so far.";
  if (week.weekWon) return "Week saved. Keep showing up and the streak carries forward.";
  const left = Math.max(week.targetWins - week.dailyWins, 0);
  if (left) return `${left} more win day${left === 1 ? "" : "s"} keeps this week on track.`;
  return "You are close. Complete a few more streak items to keep momentum.";
}

function renderStat(iconName, label, value) {
  return `
    <div class="stat-card">
      <span class="stat-label">${icon(iconName)} ${label}</span>
      <strong>${esc(value)}</strong>
    </div>
  `;
}

function renderTodayBoard(date, trackers, expenses) {
  const grouped = groupTrackersBySection(trackers);
  const hasTrackers = grouped.length > 0;

  return `
    <section class="today-grid">
      ${hasTrackers ? grouped.map((group) => renderTrackerGroup(group, date, false)).join("") : renderSmallEmpty("No trackers for today.", "Add a tracker or update repeat settings.")}
      ${renderExpensePanel(date, expenses, true)}
    </section>
  `;
}

function renderTrackers() {
  const sortedTrackers = getSortedTrackers(state.trackers);

  return `
    <main class="workspace">
      <div class="screen-head">
        <div>
          <h2 class="screen-title">Trackers</h2>
          <p class="screen-note">Edit your sections, repeat rules, goals, and daily tracker setup.</p>
        </div>
        <div class="toolbar">
          <button class="action-button primary" type="button" data-action="open-choose">${icon("plus")} Add tracker</button>
          <button class="action-button soft" type="button" data-action="open-section-form">${icon("grid")} Add section</button>
        </div>
      </div>
      <section class="manager-layout">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">${icon("settings")} Active trackers</h3>
              <p class="panel-subtitle">${state.trackers.length} total</p>
            </div>
          </div>
          ${
            state.trackers.length
              ? `<div class="tracker-list">${sortedTrackers.map((tracker) => renderManagerTracker(tracker)).join("")}</div>`
              : renderSmallEmpty("No trackers yet.", "Create your own habit, counter, time tracker, or task.")
          }
        </div>
        <div class="panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">${icon("grid")} Sections</h3>
              <p class="panel-subtitle">${state.sections.length} created</p>
            </div>
          </div>
          ${
            state.sections.length
              ? `<div class="compact-list">${state.sections.map((section) => renderSectionManagerRow(section)).join("")}</div>`
              : renderSmallEmpty("No sections yet.", "Sections can group your board into morning, fitness, study, money, or anything else.")
          }
        </div>
      </section>
    </main>
  `;
}

function renderHistory() {
  const trackers = getTrackersForDate(ui.activeDate, true);
  const expenses = getExpenses(ui.activeDate);

  return `
    <main class="workspace">
      <div class="screen-head">
        <div>
          <h2 class="screen-title">History</h2>
          <p class="screen-note">Pick any date and review saved tracker values and spending.</p>
        </div>
      </div>
      <section class="history-grid">
        <aside class="panel">
          <div class="field">
            <label for="history-date">Date</label>
            <input class="date-input" id="history-date" type="date" value="${escAttr(ui.activeDate)}" data-action="set-history-date" />
          </div>
          <div class="stats-grid" style="grid-template-columns: 1fr; margin-top: 14px;">
            ${renderStat("wallet", "Spent", formatMoney(getExpenseTotal(ui.activeDate)))}
            ${renderStat("grid", "Items", String(trackers.length + expenses.length))}
          </div>
        </aside>
        <section class="workspace">
          ${
            trackers.length
              ? groupTrackersBySection(trackers).map((group) => renderTrackerGroup(group, ui.activeDate, true)).join("")
              : renderSmallEmpty("No tracker data for this date.", "Repeated trackers and saved entries will appear here.")
          }
          ${renderExpensePanel(ui.activeDate, expenses, false)}
        </section>
      </section>
    </main>
  `;
}

function renderCalendar() {
  const today = toDateKey(new Date());
  const selectedDate = ui.activeDate || today;
  const monthDays = getCalendarMonthDays(selectedDate, today);
  const selectedDay = monthDays.find((day) => day.date === selectedDate) || {
    ...getPlannerDay(selectedDate, today),
    ...getCalendarLoad(0, { average: 0, max: 0 }),
  };
  const canPlan = selectedDate >= today;

  return `
    <main class="workspace calendar-workspace">
      <div class="screen-head">
        <div>
          <h2 class="screen-title">Calendar</h2>
          <p class="screen-note">See every day, review past completions, and plan future tasks from one place.</p>
        </div>
        <div class="toolbar">
          <button class="action-button soft" type="button" data-action="calendar-today">${icon("calendar")} Today</button>
          <button class="action-button primary" type="button" data-action="open-planner-task" data-date="${escAttr(selectedDate)}" ${canPlan ? "" : "disabled"}>${icon("plus")} Plan task</button>
        </div>
      </div>
      <section class="calendar-layout">
        <section class="panel planner-calendar-panel">
          <div class="panel-header planner-month-header">
            <div>
              <h3 class="panel-title">${icon("calendar")} ${esc(formatMonthYear(selectedDate))}</h3>
              <p class="panel-subtitle">Tap a day to see scheduled, completed, missed, and upcoming details.</p>
            </div>
            <div class="calendar-nav" aria-label="Change month">
              <button class="icon-button" type="button" title="Previous month" data-action="calendar-prev-month">${icon("chevron-left")}</button>
              <button class="icon-button" type="button" title="Next month" data-action="calendar-next-month">${icon("chevron-right")}</button>
            </div>
          </div>
          <div class="planner-calendar-grid" aria-label="Calendar month">
            ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<div class="planner-weekday">${day}</div>`).join("")}
            ${monthDays.map((day, index) => renderPlannerCalendarDay(day, index)).join("")}
          </div>
          <div class="streak-legend calendar-legend" aria-label="Calendar legend">
            <span><i class="legend-dot win"></i>Complete</span>
            <span><i class="legend-dot partial"></i>Partial</span>
            <span><i class="legend-dot miss"></i>Missed</span>
            <span><i class="legend-dot planned"></i>Future</span>
          </div>
        </section>
        ${renderCalendarDayPanel(selectedDay, today)}
      </section>
      ${renderCalendarAgenda(selectedDate, today)}
    </main>
  `;
}

function renderPlannerCalendarDay(day, index) {
  const dayNumber = parseDateKey(day.date).getDate();
  const detail = getCalendarDayDetail(day);
  const progress = day.total ? Math.min(1, day.done / day.total) : 0;
  const loadTitle = day.total ? ` ${day.total} item${day.total === 1 ? "" : "s"} scheduled. Usual day has ${day.loadAverageLabel}.` : " No scheduled items.";
  const title = `${formatCalendarDate(day.date)}: ${detail}.${loadTitle}`;
  const classes = [
    "planner-day",
    day.status,
    day.total ? `load-${day.loadLevel}` : "",
    day.completedItems.length ? "has-completions" : "",
    day.inMonth ? "" : "out-month",
    day.isToday ? "is-today" : "",
    day.isSelected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <button class="${escAttr(classes)}" type="button" data-action="set-calendar-date" data-date="${escAttr(day.date)}" style="--i:${index}; --load-ratio:${day.loadRatio}" title="${escAttr(title)}" aria-label="${escAttr(title)}">
      ${renderPlannerCompletionTrophies(day.completedItems, day.total)}
      <span class="planner-day-top">
        <span class="planner-day-number">${dayNumber}</span>
        ${day.streak.win ? `<span class="planner-day-flame">${icon("flame")}</span>` : ""}
      </span>
      <span class="planner-day-detail">${esc(detail)}</span>
      <span class="planner-day-progress" aria-hidden="true"><span style="transform: scaleX(${progress})"></span></span>
      <span class="planner-day-dots" aria-hidden="true">
        ${day.done ? `<i class="done"></i>` : ""}
        ${day.total > day.done ? `<i class="${day.isFuture ? "planned" : "pending"}"></i>` : ""}
        ${day.expenseCount ? `<i class="expense"></i>` : ""}
      </span>
      ${day.total ? `<span class="planner-load-strap" aria-hidden="true"><span></span></span>` : ""}
    </button>
  `;
}

function renderPlannerCompletionTrophies(items, total) {
  if (!items.length) return "";

  const visibleItems = items.slice(0, 2);
  const hiddenItems = items.slice(2);
  const label = `${items.length} of ${total || items.length} completed`;

  return `
    <span class="planner-completion-stack" aria-label="${escAttr(label)}">
      ${visibleItems.map((item) => renderCompletionTrophy(item)).join("")}
      ${
        hiddenItems.length
          ? `<span class="completion-extra" title="${escAttr(hiddenItems.map((item) => item.tooltip).join("\n"))}" data-tooltip="${escAttr(hiddenItems.map((item) => item.label).join(", "))}">+${hiddenItems.length}</span>`
          : ""
      }
    </span>
  `;
}

function renderCalendarDayPanel(day, today) {
  const canPlan = day.date >= today;
  const canEditMoney = day.date <= today;
  const mode = getCalendarModeLabel(day.date, today);
  const message = getCalendarDayMessage(day, today);

  return `
    <aside class="panel calendar-day-panel ${escAttr(day.status)}">
      <div class="calendar-day-head">
        <div>
          <span class="calendar-mode-pill">${esc(mode)}</span>
          <h3>${esc(formatLongDate(day.date))}</h3>
          <p>${esc(message)}</p>
        </div>
        <span class="calendar-day-status ${escAttr(day.status)}">${esc(getCalendarStatusLabel(day))}</span>
      </div>
      <div class="calendar-day-summary">
        ${renderCalendarMetric("list-check", "Scheduled", String(day.total), day.total ? `${day.total} planned` : day.isFuture ? "Open day" : "No planned items")}
        ${renderCalendarMetric("check-circle", "Done", `${day.done}/${day.total || 0}`, `${day.progress}% complete`)}
        ${renderCalendarMetric("wallet", "Money", formatMoney(day.expenseTotal), `${day.expenseCount} expense${day.expenseCount === 1 ? "" : "s"}`)}
        ${renderCalendarMetric("flame", "Streak", day.streak.total ? `${day.streak.done}/${day.streak.total}` : "None", day.streak.win ? "Win day" : "Tracked items")}
      </div>
      <div class="calendar-day-actions">
        <button class="action-button primary" type="button" data-action="open-planner-task" data-date="${escAttr(day.date)}" ${canPlan ? "" : "disabled"}>${icon("plus")} Plan task</button>
        <button class="action-button soft" type="button" data-action="open-tracker-form" data-type="checkbox" data-date="${escAttr(day.date)}" ${canPlan ? "" : "disabled"}>${icon("flame")} Start habit</button>
        <button class="action-button soft" type="button" data-action="open-expense-form" data-date="${escAttr(day.date)}" ${canEditMoney ? "" : "disabled"}>${icon("wallet")} Add expense</button>
      </div>
    </aside>
  `;
}

function renderCalendarMetric(iconName, label, value, detail) {
  return `
    <div class="calendar-metric">
      <span>${icon(iconName)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(label)}</small>
      <em>${esc(detail)}</em>
    </div>
  `;
}

function renderCalendarAgenda(date, today) {
  const trackers = getTrackersForDate(date, true);
  const expenses = getExpenses(date);
  const readonly = date !== today;

  return `
    <section class="calendar-agenda-grid">
      <div class="workspace">
        <div class="screen-head calendar-agenda-head">
          <div>
            <h3 class="screen-title">Day Details</h3>
            <p class="screen-note">${esc(date === today ? "Complete today's items from here." : date > today ? "Future items are planned here and become actionable on their day." : "Past days are shown as a read-only history.")}</p>
          </div>
        </div>
        ${
          trackers.length
            ? groupTrackersBySection(trackers).map((group) => renderTrackerGroup(group, date, readonly)).join("")
            : renderSmallEmpty(
                date > today ? "Nothing planned for this day." : "No trackers saved for this day.",
                date > today ? "Use Plan task to add a one-time future task." : "Completed tasks, habits, and logged values will appear here.",
              )
        }
        ${renderExpensePanel(date, expenses, date <= today)}
      </div>
      ${renderDayTimeline(date, today)}
    </section>
  `;
}

function renderDayTimeline(date, today) {
  const items = getDayTimelineItems(date, today);

  return `
    <aside class="panel calendar-timeline-panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">${icon("history")} Timeline</h3>
          <p class="panel-subtitle">Done, missed, future, and money entries in time order.</p>
        </div>
      </div>
      ${
        items.length
          ? `<div class="calendar-timeline">${items.map(renderTimelineItem).join("")}</div>`
          : renderSmallEmpty("No timeline yet.", "When something is planned or logged, it will appear here.")
      }
    </aside>
  `;
}

function renderTimelineItem(item) {
  return `
    <article class="timeline-item ${escAttr(item.tone)}">
      <span class="timeline-icon">${icon(item.icon)}</span>
      <div class="timeline-body">
        <div class="timeline-title-row">
          <strong>${esc(item.title)}</strong>
          <span>${esc(item.timeLabel)}</span>
        </div>
        <p>${esc(item.detail)}</p>
        <span class="tracker-meta">${item.meta.map((entry) => `<span class="pill">${esc(entry)}</span>`).join("")}</span>
      </div>
    </article>
  `;
}

function getPlannerDay(date, today) {
  const trackers = getTrackersForDate(date, true);
  const expenses = getExpenses(date);
  const done = date <= today ? trackers.filter((tracker) => isTrackerCompleteForDate(tracker, date)).length : 0;
  const total = trackers.length;
  const streak = getStreakDay(date, today);
  const completedItems = date <= today ? getCompletedTrackerItems(date) : [];

  return {
    date,
    trackers,
    done,
    total,
    completedItems,
    progress: total ? Math.round((done / total) * 100) : 0,
    expenseCount: expenses.length,
    expenseTotal: getExpenseTotal(date),
    streak,
    status: getCalendarDayStatus(date, today, total, done, expenses.length),
    isPast: date < today,
    isToday: date === today,
    isFuture: date > today,
  };
}

function getCalendarDayStatus(date, today, total, done, expenseCount) {
  if (date > today) return total ? "planned" : "future";
  if (date === today) {
    if (!total && !expenseCount) return "today-empty";
    if (total && done >= total) return "complete";
    if (done > 0) return "partial";
    return "today";
  }
  if (total && done >= total) return "complete";
  if (done > 0) return "partial";
  if (total) return "missed";
  if (expenseCount) return "logged";
  return "rest";
}

function getCalendarDayDetail(day) {
  if (day.isFuture) return day.total ? `${day.total} planned` : "Free";
  if (day.total) return `${day.done}/${day.total} done`;
  if (day.expenseCount) return `${day.expenseCount} expense${day.expenseCount === 1 ? "" : "s"}`;
  return day.isToday ? "Today" : "No activity";
}

function getCalendarStatusLabel(day) {
  const labels = {
    complete: "Complete",
    partial: "Partial",
    missed: "Missed",
    planned: "Planned",
    future: "Future",
    today: "Today",
    "today-empty": "Today",
    logged: "Logged",
    rest: "Open",
  };
  return labels[day.status] || "Open";
}

function getCalendarModeLabel(date, today) {
  if (date === today) return "Today";
  if (date > today) return "Future plan";
  return "History";
}

function getCalendarDayMessage(day, today) {
  if (day.date > today) {
    return day.total
      ? `${day.total} item${day.total === 1 ? "" : "s"} planned. Add one-time tasks or start a habit from this date.`
      : "No task is planned yet. Add one future task to make the day visible in your routine.";
  }

  if (day.date === today) {
    if (!day.total) return "Today is clear. Add a task, habit, timer, counter, or spending entry when you need it.";
    if (day.done >= day.total) return "Everything scheduled for today is complete.";
    return `${Math.max(day.total - day.done, 0)} item${day.total - day.done === 1 ? "" : "s"} still open today.`;
  }

  if (!day.total && !day.expenseCount) return "No saved activity for this date.";
  if (day.total && day.done >= day.total) return "This day was fully completed.";
  if (day.done > 0) return "This day has partial progress saved.";
  return "This day had planned items without saved completion.";
}

function getCalendarMonthDays(date, today) {
  const selected = parseDateKey(date);
  const month = selected.getMonth();
  const firstOfMonth = toDateKey(new Date(selected.getFullYear(), month, 1));
  const gridStart = startOfWeek(firstOfMonth);
  const days = Array.from({ length: 42 }, (_item, index) => {
    const dayDate = addDays(gridStart, index);
    const day = getPlannerDay(dayDate, today);
    return {
      ...day,
      inMonth: parseDateKey(dayDate).getMonth() === month,
      isSelected: dayDate === date,
    };
  });
  const loadStats = getCalendarLoadStats(days.filter((day) => day.inMonth).map((day) => day.total));

  return days.map((day) => ({
    ...day,
    ...getCalendarLoad(day.total, loadStats),
  }));
}

function getCalendarLoadStats(loads) {
  const positiveLoads = loads.filter((load) => load > 0);
  const average = positiveLoads.length ? positiveLoads.reduce((total, load) => total + load, 0) / positiveLoads.length : 0;

  return {
    average,
    max: Math.max(0, ...positiveLoads),
  };
}

function getCalendarLoad(total, stats) {
  const average = stats.average || 0;
  const max = stats.max || total || 1;
  const averageLabel = average ? average.toFixed(average >= 10 ? 0 : 1) : "0";
  const loadRatio = total ? Math.min(1, total / Math.max(max, average * 1.35, 1)) : 0;

  if (!total) {
    return {
      loadLevel: "free",
      loadRatio,
      loadAverageLabel: averageLabel,
    };
  }

  const heavyThreshold = Math.max(3, Math.ceil(average * 1.35));
  const lightThreshold = Math.max(1, Math.floor(average * 0.65));
  let loadLevel = "steady";

  if (total >= heavyThreshold) {
    loadLevel = "heavy";
  } else if (total <= lightThreshold) {
    loadLevel = "light";
  }

  return {
    loadLevel,
    loadRatio,
    loadAverageLabel: averageLabel,
  };
}

function getDayTimelineItems(date, today) {
  const trackerItems = getTrackersForDate(date, true).map((tracker) => {
    const log = getLog(date, tracker.id);
    const done = isTrackerCompleteForDate(tracker, date);
    const actualTime = tracker.type === "counter" ? getLastCounterEntryTime(date, tracker.id) : getActualTimeValue(tracker, log);
    const plannedTime = getEffectivePlannedTime(tracker, date) || "";
    const isFuture = date > today;
    const tone = isFuture ? "planned" : done ? "done" : date < today ? "missed" : "pending";
    const timeValue = actualTime || plannedTime;

    return {
      icon: trackerTypes[tracker.type]?.icon || "circle",
      tone,
      title: tracker.name || trackerTypes[tracker.type]?.label || "Tracker",
      detail: getTrackerTimelineDetail(tracker, date, done, actualTime),
      timeLabel: getTrackerTimelineTimeLabel(actualTime, plannedTime, tone),
      sortValue: timeToMinutes(timeValue) ?? (tone === "missed" ? 1600 : 1500),
      meta: [trackerTypes[tracker.type]?.label || "Tracker", getSectionName(tracker.sectionId)],
    };
  });

  const expenseItems = getExpenses(date).map((expense) => ({
    icon: expense.source === "Credit Card" ? "card" : "wallet",
    tone: "expense",
    title: expense.category || "Expense",
    detail: `${formatMoney(expense.amount)}${expense.note ? ` - ${expense.note}` : ""}`,
    timeLabel: expense.time || "No time",
    sortValue: timeToMinutes(expense.time) ?? 1700,
    meta: [expense.source || "Money"],
  }));

  return [...trackerItems, ...expenseItems].sort((a, b) => a.sortValue - b.sortValue || a.title.localeCompare(b.title));
}

function getTrackerTimelineDetail(tracker, date, done, actualTime) {
  const delayLabel = getDelayPillLabel(tracker, date);
  if (tracker.type === "counter") {
    const count = getCounterCount(date, tracker.id);
    const goal = Number(tracker.goal) || 0;
    const unit = tracker.unit || "unit";
    if (delayLabel && !done) return delayLabel;
    if (done) return goal ? `Goal reached: ${count}/${goal} ${unit}` : `${count} ${unit} logged`;
    return goal ? `Goal ${count}/${goal} ${unit}` : `Waiting for ${unit}`;
  }

  if (tracker.type === "time") {
    if (delayLabel && !actualTime) return delayLabel;
    return actualTime ? `Logged ${formatDisplayTime(actualTime)}` : "Waiting for time entry";
  }

  if (done) return actualTime ? `Done at ${formatDisplayTime(actualTime)}` : "Completed";
  if (delayLabel) return delayLabel;
  if (getEffectivePlannedTime(tracker, date)) return `Planned for ${formatDisplayTime(getEffectivePlannedTime(tracker, date))}`;
  return "No completion saved";
}

function getTrackerTimelineTimeLabel(actualTime, plannedTime, tone) {
  if (actualTime) return formatDisplayTime(actualTime);
  if (plannedTime) return formatDisplayTime(plannedTime);
  if (tone === "planned") return "Future";
  if (tone === "missed") return "Missed";
  return "Any time";
}

function getLastCounterEntryTime(date, trackerId) {
  const entries = getLog(date, trackerId).entries || [];
  const index = findLastIndex(entries, (entry) => Number(entry.amount || 0) > 0);
  return index >= 0 ? entries[index].at || "" : "";
}

function renderReports() {
  const dates = getRecentDateKeys(7);
  const streak = getStreakSnapshot(toDateKey(new Date()));
  const completionSeries = dates.map((date) => {
    const stats = getCompletionStatsForDate(date);
    return {
      date,
      label: shortDateLabel(date),
      value: stats.total ? Math.round((stats.done / stats.total) * 100) : 0,
      detail: `${stats.done}/${stats.total}`,
    };
  });
  const spendingSeries = dates.map((date) => ({
    date,
    label: shortDateLabel(date),
    value: getExpenseTotal(date),
    detail: formatMoney(getExpenseTotal(date)),
  }));
  const timingRows = dates.map((date) => ({
    date,
    label: shortDateLabel(date),
    ...getTimingStatsForDate(date),
  }));
  const weekSpend = spendingSeries.reduce((total, item) => total + item.value, 0);
  const weekCompletion = completionSeries.length
    ? Math.round(completionSeries.reduce((total, item) => total + item.value, 0) / completionSeries.length)
    : 0;
  const lateCount = timingRows.reduce((total, row) => total + row.late, 0);

  return `
    <main class="workspace">
      <div class="screen-head">
        <div>
          <h2 class="screen-title">Reports</h2>
          <p class="screen-note">Simple metrics from your tracker history.</p>
        </div>
      </div>
      <section class="stats-grid">
        ${renderStat("check-circle", "7 day average", `${weekCompletion}%`)}
        ${renderStat("flame", "Weekly streak", `${streak.currentStreak}w`)}
        ${renderStat("wallet", "7 day spend", formatMoney(weekSpend))}
        ${renderStat("clock", "Late items", String(lateCount))}
      </section>
      ${renderStreakCalendar(streak)}
      <section class="report-grid">
        ${renderBarChart("Completion", completionSeries, "%")}
        ${renderBarChart("Spending", spendingSeries, "")}
      </section>
      <section class="panel">
        <div class="panel-header">
          <div>
            <h3 class="panel-title">${icon("clock")} Timing Matrix</h3>
            <p class="panel-subtitle">On-time, waiting, and delayed items by day.</p>
          </div>
        </div>
        <div class="matrix-grid">
          <div class="matrix-head">Day</div>
          <div class="matrix-head good">On time</div>
          <div class="matrix-head warn">Waiting</div>
          <div class="matrix-head late">Late</div>
          ${timingRows
            .map(
              (row) => `
                <div>${esc(row.label)}</div>
                <div><span class="matrix-pill good">${row.good}</span></div>
                <div><span class="matrix-pill warn">${row.waiting}</span></div>
                <div><span class="matrix-pill late">${row.late}</span></div>
              `,
            )
            .join("")}
        </div>
      </section>
    </main>
  `;
}

function renderSettings() {
  const appearance = getAppearanceMode();
  const timeFormat = getTimeFormat();
  const desktopWidget = getDesktopWidgetMode();

  return `
    <main class="workspace">
      <div class="screen-head">
        <div>
          <h2 class="screen-title">Settings</h2>
          <p class="screen-note">Control the DailyTrack window and widget appearance.</p>
        </div>
      </div>
      <section class="settings-layout">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">${icon("settings")} Appearance</h3>
              <p class="panel-subtitle">Choose how the app and widget glass adapt.</p>
            </div>
          </div>
          <div class="appearance-control" role="group" aria-label="Appearance mode">
            ${appearanceModes
              .map(
                ([mode, iconName, label]) => `
                  <button class="appearance-option ${appearance === mode ? "is-active" : ""}" type="button" data-action="set-appearance" data-appearance="${escAttr(mode)}">
                    ${icon(iconName)}
                    <span>${esc(label)}</span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">${icon("clock")} Clock Format</h3>
              <p class="panel-subtitle">Choose how time appears in the widget and task details.</p>
            </div>
          </div>
          <div class="appearance-control time-format-control" role="group" aria-label="Clock format">
            ${timeFormatModes
              .map(
                ([mode, iconName, label, sample]) => `
                  <button class="appearance-option ${timeFormat === mode ? "is-active" : ""}" type="button" data-action="set-time-format" data-time-format="${escAttr(mode)}">
                    ${icon(iconName)}
                    <span>${esc(label)}</span>
                    <small>${esc(sample)}</small>
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
        <div class="panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">${icon("pin")} Desktop Widget</h3>
              <p class="panel-subtitle">Show or hide the glass widget on your desktop.</p>
            </div>
          </div>
          <div class="appearance-control desktop-widget-control" role="group" aria-label="Desktop widget visibility">
            ${desktopWidgetModes
              .map(
                ([mode, iconName, label, detail]) => `
                  <button class="appearance-option ${desktopWidget === mode ? "is-active" : ""}" type="button" data-action="set-desktop-widget" data-desktop-widget="${escAttr(mode)}">
                    ${icon(iconName)}
                    <span>${esc(label)}</span>
                    <small>${esc(detail)}</small>
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderStreakCalendar(snapshot) {
  return `
    <section class="panel streak-calendar-panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">${icon("flame")} Consistency Calendar</h3>
          <p class="panel-subtitle">A week counts with ${snapshot.currentWeek.targetWins || 0} win day${snapshot.currentWeek.targetWins === 1 ? "" : "s"} or 80% completion on finished weeks.</p>
        </div>
        <span class="streak-badge ${snapshot.currentWeek.weekWon ? "is-hot" : ""}">
          ${icon("flame")} ${snapshot.currentStreak} week${snapshot.currentStreak === 1 ? "" : "s"}
        </span>
      </div>
      <div class="streak-calendar-grid" aria-label="Streak calendar">
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `<div class="streak-calendar-head">${day}</div>`).join("")}
        ${snapshot.calendarDays.map((day, index) => renderStreakCalendarDay(day, index)).join("")}
      </div>
      <div class="streak-legend" aria-label="Calendar legend">
        <span><i class="legend-dot win"></i>Win day</span>
        <span><i class="legend-dot partial"></i>In progress</span>
        <span><i class="legend-dot miss"></i>Missed</span>
        <span><i class="legend-dot rest"></i>No streak items</span>
      </div>
    </section>
  `;
}

function renderStreakCalendarDay(day, index) {
  const dayNumber = parseDateKey(day.date).getDate();
  const detail = day.total ? `${day.done}/${day.total}` : "";
  return `
    <article class="streak-day ${escAttr(day.status)} ${day.inMonth ? "" : "out-month"}" style="--i:${index}" title="${escAttr(day.tooltip)}" aria-label="${escAttr(day.tooltip)}">
      <span class="streak-day-number">${dayNumber}</span>
      <span class="streak-day-icon">${day.status === "win" ? icon("flame") : day.status === "partial" ? icon("spark") : day.status === "miss" ? icon("x") : ""}</span>
      <strong>${esc(detail)}</strong>
    </article>
  `;
}

function renderBarChart(title, items, suffix) {
  const max = Math.max(1, ...items.map((item) => Number(item.value || 0)));

  return `
    <section class="panel report-card">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">${icon("grid")} ${esc(title)}</h3>
          <p class="panel-subtitle">Last 7 days</p>
        </div>
      </div>
      <div class="bar-chart">
        ${items
          .map((item) => {
            const height = Math.max(8, Math.round((Number(item.value || 0) / max) * 120));
            const value = suffix ? `${item.value}${suffix}` : item.detail;
            return `
              <div class="bar-item">
                <div class="bar-value">${esc(value)}</div>
                <div class="bar-track"><div class="bar-fill" style="height:${height}px"></div></div>
                <div class="bar-label">${esc(item.label)}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderTrackerGroup(group, date, readonly) {
  return `
    <div class="panel section-group">
      <div class="section-heading">
        <span>${esc(group.name)}</span>
        <span>${group.trackers.length} item${group.trackers.length === 1 ? "" : "s"}</span>
      </div>
      <div class="tracker-list">
        ${group.trackers.map((tracker) => renderTrackerRow(tracker, date, readonly)).join("")}
      </div>
    </div>
  `;
}

function renderTrackerRow(tracker, date, readonly) {
  const meta = trackerMeta(tracker, date);
  const control = renderTrackerControl(tracker, date, readonly);
  const log = getLog(date, tracker.id);
  const timingStatus = getTimingStatus(tracker, log, date);
  const timing = renderTimingPill(timingStatus);
  const delayPill = renderDelayPill(tracker, date);
  const timingClass = timingStatus ? `has-timing timing-${timingStatus.tone}` : "";
  const pinClass = tracker.pinned ? "is-pinned" : "";
  const delayClass = delayPill ? "is-delayed" : "";
  return `
    <article class="tracker-row ${escAttr(`${timingClass} ${pinClass} ${delayClass}`)}">
      <div class="tracker-main">
        <span class="type-icon ${escAttr(tracker.type)}">${icon(trackerTypes[tracker.type]?.icon || "circle")}</span>
        <div class="tracker-text">
          <span class="tracker-name-line">
            <span class="tracker-name">${esc(tracker.name)}</span>
            ${tracker.pinned ? `<span class="pin-marker" title="Pinned">${icon("pin")}</span>` : ""}
          </span>
          <span class="tracker-meta">${meta.map((item) => `<span class="pill">${esc(item)}</span>`).join("")}</span>
          ${timing || delayPill ? `<span class="tracker-meta timing-line">${delayPill}${timing}</span>` : ""}
        </div>
      </div>
      ${control}
    </article>
  `;
}

function renderTrackerControl(tracker, date, readonly) {
  const log = getLog(date, tracker.id);
  const done = isTrackerCompleteForDate(tracker, date);
  const delayButton = renderDelayButton(tracker, date, readonly, done);

  if (tracker.type === "counter") {
    const count = getCounterCount(date, tracker.id);
    const goal = Number(tracker.goal) || 0;
    const progress = goal ? Math.min(100, Math.round((count / goal) * 100)) : 0;
    const celebrating = ui.achievement?.trackerId === tracker.id && ui.achievement?.surface === "counter";
    return `
      <div class="row-actions">
        <div>
          <div class="counter-control">
            <button class="icon-button" type="button" title="Decrease" data-action="counter-dec" data-id="${escAttr(tracker.id)}" ${readonly ? "disabled" : ""}>${icon("minus")}</button>
            <div class="counter-value ${celebrating ? "is-celebrating" : ""}" aria-live="polite">
              ${
                celebrating
                  ? `<span class="counter-burst" aria-hidden="true">${renderConfettiPieces(ui.achievement.pieces)}</span>`
                  : ""
              }
              <span class="counter-display">
                <strong>${count}${goal ? `/${goal}` : ""}</strong>
                <span>${esc(tracker.unit || "unit")}</span>
              </span>
            </div>
            <button class="icon-button" type="button" title="Increase" data-action="counter-inc" data-id="${escAttr(tracker.id)}" ${readonly ? "disabled" : ""}>${icon("plus")}</button>
          </div>
          ${goal ? `<div class="progress-shell" aria-hidden="true"><div class="progress-bar" style="width:${progress}%"></div></div>` : ""}
        </div>
        ${delayButton}
      </div>
    `;
  }

  if (tracker.type === "time") {
    return `
      <div class="row-actions control-stack">
        <input class="time-input" type="time" value="${escAttr(log.time || "")}" data-action="set-time" data-id="${escAttr(tracker.id)}" ${readonly ? "disabled" : ""} />
        ${delayButton}
      </div>
    `;
  }

  if (tracker.completionMode === "manual-time") {
    const celebrating = ui.achievement?.trackerId === tracker.id && ui.achievement?.surface === "button";
    return `
      <div class="row-actions control-stack">
        <input class="time-input" type="time" value="${escAttr(log.actualTime || normalizeTimeValue(log.completedAt) || "")}" data-action="set-actual-time" data-id="${escAttr(tracker.id)}" ${readonly ? "disabled" : ""} />
        ${delayButton}
        <button class="status-button ${log.completed ? "is-done" : ""} ${celebrating ? "is-celebrating" : ""}" type="button" title="Toggle complete" data-action="toggle-complete" data-id="${escAttr(tracker.id)}" ${readonly ? "disabled" : ""}>
          ${icon(log.completed ? "check" : "circle")}
        </button>
      </div>
    `;
  }

  const celebrating = ui.achievement?.trackerId === tracker.id && ui.achievement?.surface === "button";
  return `
    <div class="row-actions">
      ${delayButton}
      <button class="status-button ${log.completed ? "is-done" : ""} ${celebrating ? "is-celebrating" : ""}" type="button" title="Toggle complete" data-action="toggle-complete" data-id="${escAttr(tracker.id)}" ${readonly ? "disabled" : ""}>
        ${icon(log.completed ? "check" : "circle")}
      </button>
    </div>
  `;
}

function renderDelayButton(tracker, date, readonly, done) {
  if (readonly || done) return "";
  return `
    <button class="icon-button delay-button" type="button" title="Delay" data-action="open-delay" data-id="${escAttr(tracker.id)}" data-date="${escAttr(date)}">
      ${icon("history")}
    </button>
  `;
}

function renderManagerTracker(tracker) {
  const section = getSectionName(tracker.sectionId);
  const meta = trackerMeta(tracker);
  const showInWidget = tracker.showInWidget !== false;
  return `
    <article class="tracker-row ${tracker.pinned ? "is-pinned" : ""}">
      <div class="tracker-main">
        <span class="type-icon ${escAttr(tracker.type)}">${icon(trackerTypes[tracker.type]?.icon || "circle")}</span>
        <div class="tracker-text">
          <span class="tracker-name-line">
            <span class="tracker-name">${esc(tracker.name)}</span>
            ${tracker.pinned ? `<span class="pin-marker" title="Pinned">${icon("pin")}</span>` : ""}
          </span>
          <span class="tracker-meta">
            <span class="pill">${esc(trackerTypes[tracker.type]?.label || tracker.type)}</span>
            <span class="pill">${esc(section)}</span>
            ${meta.map((item) => `<span class="pill">${esc(item)}</span>`).join("")}
          </span>
        </div>
      </div>
      <div class="row-actions">
        <button class="icon-button ${tracker.pinned ? "is-active" : ""}" type="button" title="${tracker.pinned ? "Unpin" : "Pin to top"}" data-action="toggle-pin" data-id="${escAttr(tracker.id)}">${icon("pin")}</button>
        <button class="icon-button ${showInWidget ? "is-widget-active" : ""}" type="button" title="${showInWidget ? "Hide from widget" : "Show in widget"}" data-action="toggle-widget" data-id="${escAttr(tracker.id)}">${icon("grid")}</button>
        <button class="icon-button" type="button" title="Edit" data-action="edit-tracker" data-id="${escAttr(tracker.id)}">${icon("edit")}</button>
        <button class="icon-button danger" type="button" title="Delete" data-action="delete-tracker" data-id="${escAttr(tracker.id)}">${icon("trash")}</button>
      </div>
    </article>
  `;
}

function renderSectionManagerRow(section) {
  const count = state.trackers.filter((tracker) => tracker.sectionId === section.id).length;
  return `
    <article class="section-row">
      <div class="section-main">
        <span class="type-icon">${icon("grid")}</span>
        <div class="section-text">
          <span class="section-name">${esc(section.name)}</span>
          <span class="section-meta">${count} tracker${count === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="icon-button" type="button" title="Edit" data-action="edit-section" data-id="${escAttr(section.id)}">${icon("edit")}</button>
        <button class="icon-button danger" type="button" title="Delete" data-action="delete-section" data-id="${escAttr(section.id)}">${icon("trash")}</button>
      </div>
    </article>
  `;
}

function renderExpensePanel(date, expenses, editable) {
  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <h3 class="panel-title">${icon("wallet")} Money</h3>
          <p class="panel-subtitle">Total ${formatMoney(getExpenseTotal(date))}</p>
        </div>
        ${
          editable
            ? `<button class="action-button soft" type="button" data-action="open-expense-form">${icon("plus")} Add expense</button>`
            : ""
        }
      </div>
      ${
        expenses.length
          ? `<div class="expense-list">${expenses.map((expense) => renderExpenseRow(expense, date, editable)).join("")}</div>`
          : renderSmallEmpty("No expenses on this date.", "Add spending only when you need it.")
      }
    </div>
  `;
}

function renderExpenseRow(expense, date, editable) {
  return `
    <article class="expense-row">
      <div class="expense-main">
        <span class="type-icon expense">${icon(expense.source === "Credit Card" ? "card" : "wallet")}</span>
        <div class="expense-text">
          <span class="expense-name">${esc(expense.category || "Expense")}</span>
          <span class="expense-meta">
            <span class="pill">${esc(expense.source || "Source")}</span>
            ${expense.note ? `<span class="pill">${esc(expense.note)}</span>` : ""}
            ${expense.time ? `<span class="pill">${esc(expense.time)}</span>` : ""}
          </span>
        </div>
      </div>
      <div class="row-actions">
        <span class="expense-amount">${formatMoney(expense.amount)}</span>
        ${
          editable
            ? `<button class="icon-button danger" type="button" title="Delete" data-action="delete-expense" data-date="${escAttr(date)}" data-id="${escAttr(expense.id)}">${icon("trash")}</button>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderSmallEmpty(title, text) {
  return `
    <div class="empty-state">
      <div>
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
      </div>
      <div class="empty-art" aria-hidden="true">${miniIllustration()}</div>
    </div>
  `;
}

function renderModal() {
  if (!ui.modal) return "";

  if (ui.modal.kind === "choose") {
    return modalShell(
      "Add item",
      `
        <div class="choice-grid">
          ${Object.entries(trackerTypes)
            .map(
              ([type, item]) => `
                <button class="choice-card" type="button" data-action="open-tracker-form" data-type="${type}">
                  <span class="type-icon ${type}">${icon(item.icon)}</span>
                  <span><strong>${esc(item.label)}</strong><span>${esc(item.helper)}</span></span>
                </button>
              `,
            )
            .join("")}
          <button class="choice-card" type="button" data-action="open-expense-form">
            <span class="type-icon expense">${icon("wallet")}</span>
            <span><strong>Expense</strong><span>Amount, category, source</span></span>
          </button>
          <button class="choice-card" type="button" data-action="open-section-form">
            <span class="type-icon">${icon("grid")}</span>
            <span><strong>Section</strong><span>Group your board</span></span>
          </button>
        </div>
      `,
    );
  }

  if (ui.modal.kind === "tracker") {
    return renderTrackerForm();
  }

  if (ui.modal.kind === "delay") {
    return renderDelayForm();
  }

  if (ui.modal.kind === "section") {
    return renderSectionForm();
  }

  if (ui.modal.kind === "expense") {
    return renderExpenseForm();
  }

  return "";
}

function modalShell(title, body) {
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${escAttr(title)}" data-modal-panel>
        <header class="modal-header">
          <h2>${esc(title)}</h2>
          <button class="icon-button" type="button" title="Close" data-action="close-modal">${icon("x")}</button>
        </header>
        <div class="modal-body">${body}</div>
      </section>
    </div>
  `;
}

function renderTrackerForm() {
  const editTracker = ui.modal.editId ? state.trackers.find((tracker) => tracker.id === ui.modal.editId) : null;
  const type = editTracker?.type || ui.modal.type || "checkbox";
  const repeat = editTracker?.repeat || {};
  const title = editTracker ? `Edit ${trackerTypes[type].label}` : `Add ${trackerTypes[type].label}`;
  const defaultDate = ui.modal.date || toDateKey(new Date());
  const startDate = editTracker?.startDate || defaultDate;
  const repeatMode = editTracker ? repeat.mode || defaultRepeatForType(type) : ui.modal.repeatMode || defaultRepeatForType(type);
  const selectedDays = new Set(getRepeatDaysForForm(repeatMode, repeat.days, startDate));
  const plannedTime = editTracker?.plannedTime || "";
  const graceMinutes = editTracker?.graceMinutes ?? "";
  const completionMode = editTracker?.completionMode || defaultCompletionModeForType(type);
  const countsTowardStreak = editTracker?.countsTowardStreak !== false;
  const showInWidget = editTracker?.showInWidget !== false;

  const form = `
    <form class="form-grid" data-form="tracker">
      <input type="hidden" name="id" value="${escAttr(editTracker?.id || "")}" />
      <input type="hidden" name="type" value="${escAttr(type)}" />
      <div class="field">
        <label for="tracker-name">Name</label>
        <input id="tracker-name" name="name" value="${escAttr(editTracker?.name || "")}" placeholder="Enter tracker name" required />
      </div>
      <label class="pin-option">
        <input type="checkbox" name="pinned" value="1" ${editTracker?.pinned ? "checked" : ""} />
        <span>${icon("pin")}</span>
        <strong>Pin to top</strong>
      </label>
      <label class="pin-option widget-option">
        <input type="checkbox" name="showInWidget" value="1" ${showInWidget ? "checked" : ""} />
        <span>${icon("grid")}</span>
        <strong>Show in widget</strong>
      </label>
      <label class="pin-option streak-option">
        <input type="checkbox" name="countsTowardStreak" value="1" ${countsTowardStreak ? "checked" : ""} />
        <span>${icon("flame")}</span>
        <strong>Counts toward streak</strong>
      </label>
      <div class="split-fields">
        <div class="field">
          <label for="tracker-section">Section / Tag</label>
          <select id="tracker-section" name="sectionId" data-action="choose-section">
            <option value="">No section</option>
            ${state.sections
              .map((section) => `<option value="${escAttr(section.id)}" ${editTracker?.sectionId === section.id ? "selected" : ""}>${esc(section.name)}</option>`)
              .join("")}
            <option value="${NEW_SECTION_VALUE}">+ Create new section</option>
          </select>
          <div class="inline-add-field is-hidden" data-new-section-field>
            <span class="inline-add-icon">${icon("plus")}</span>
            <input name="newSectionName" placeholder="New section name" data-new-section-input />
          </div>
        </div>
        <div class="field">
          <label for="tracker-start">Start or due date</label>
          <input id="tracker-start" type="date" name="startDate" value="${escAttr(startDate)}" required />
        </div>
      </div>
      <div class="split-fields">
        <div class="field">
          <label for="tracker-repeat">Repeat</label>
          <select id="tracker-repeat" name="repeatMode" data-action="choose-repeat">
            ${Object.entries(repeatLabels)
              .map(([value, label]) => `<option value="${value}" ${repeatMode === value ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
        </div>
        ${
          type === "task"
            ? `<div class="field">
                <label for="tracker-category">Category</label>
                <input id="tracker-category" name="category" value="${escAttr(editTracker?.category || "")}" placeholder="Enter category" />
              </div>`
            : ""
        }
        ${
          type === "counter"
            ? `<div class="field">
                <label for="tracker-unit">Unit</label>
                <input id="tracker-unit" name="unit" value="${escAttr(editTracker?.unit || "")}" placeholder="Enter unit" required />
              </div>`
            : ""
        }
      </div>
      ${
        type === "counter"
          ? `<div class="field">
              <label for="tracker-goal">Daily goal</label>
              <input id="tracker-goal" type="number" min="0" step="1" name="goal" value="${escAttr(editTracker?.goal || "")}" placeholder="Enter goal" />
            </div>`
          : ""
      }
      ${
        type !== "counter"
          ? `<div class="timing-card">
              <div>
                <span class="field-label">Fixed time</span>
                <p class="field-help">Optional. Add a planned time to compare planned vs actual.</p>
              </div>
              <div class="split-fields">
                <div class="field">
                  <label for="tracker-planned-time">Planned time</label>
                  <input id="tracker-planned-time" type="time" name="plannedTime" value="${escAttr(plannedTime)}" />
                </div>
                <div class="field">
                  <label for="tracker-grace">Grace minutes</label>
                  <input id="tracker-grace" type="number" min="0" step="1" name="graceMinutes" value="${escAttr(graceMinutes)}" placeholder="0" />
                </div>
              </div>
              ${
                ["checkbox", "task"].includes(type)
                  ? `<div class="field">
                      <label for="tracker-completion-mode">Actual time</label>
                      <select id="tracker-completion-mode" name="completionMode">
                        <option value="tap" ${completionMode === "tap" ? "selected" : ""}>Use the time I tap done</option>
                        <option value="manual-time" ${completionMode === "manual-time" ? "selected" : ""}>I will enter actual time manually</option>
                      </select>
                    </div>`
                  : `<input type="hidden" name="completionMode" value="manual-time" />`
              }
            </div>`
          : ""
      }
      <div class="field">
        <span class="field-label">Selected days</span>
        <p class="field-help">Every day selects all days. Selecting all days also changes repeat to Every day.</p>
        <div class="weekday-grid">
          ${weekdays
            .map(
              ([value, label]) => `
                <label class="weekday-option">
                  <input type="checkbox" name="days" value="${value}" data-action="choose-repeat-day" ${selectedDays.has(value) ? "checked" : ""} />
                  <span>${label}</span>
                </label>
              `,
            )
            .join("")}
        </div>
      </div>
      <div class="modal-actions">
        <button class="action-button" type="button" data-action="close-modal">Cancel</button>
        <button class="action-button primary" type="submit">${icon("check")} Save</button>
      </div>
    </form>
  `;

  return modalShell(title, form);
}

function renderDelayForm() {
  const tracker = state.trackers.find((item) => item.id === ui.modal.id);
  if (!tracker) {
    return modalShell("Delay task", `<p class="field-help">This item is no longer available.</p>`);
  }

  const sourceDate = ui.modal.date || toDateKey(new Date());
  const hourTarget = getDelayPresetTarget(tracker, sourceDate, "hour");
  const dayTarget = getDelayPresetTarget(tracker, sourceDate, "day");
  const delay = getDelayInfo(tracker);
  const customDate = delay?.targetDate || hourTarget.targetDate;
  const customTime = delay?.targetTime || hourTarget.targetTime;

  const body = `
    <form class="form-grid delay-form" data-form="delay">
      <input type="hidden" name="id" value="${escAttr(tracker.id)}" />
      <input type="hidden" name="sourceDate" value="${escAttr(sourceDate)}" />
      <div class="delay-summary">
        <span class="type-icon ${escAttr(tracker.type)}">${icon(trackerTypes[tracker.type]?.icon || "circle")}</span>
        <div>
          <strong>${esc(tracker.name || trackerTypes[tracker.type]?.label || "Task")}</strong>
          <span>${esc(getDelayContextText(tracker, sourceDate))}</span>
        </div>
      </div>
      <div class="delay-choice-grid">
        ${delayPresets
          .map(([preset, iconName, label, helper]) => {
            const target = preset === "day" ? dayTarget : hourTarget;
            return `
              <button class="delay-choice" type="button" data-action="apply-delay" data-id="${escAttr(tracker.id)}" data-date="${escAttr(sourceDate)}" data-delay-preset="${escAttr(preset)}">
                <span>${icon(iconName)}</span>
                <strong>${esc(label)}</strong>
                <small>${esc(helper)} - ${esc(formatDelayTarget(target))}</small>
              </button>
            `;
          })
          .join("")}
      </div>
      <div class="timing-card delay-custom-card">
        <div>
          <span class="field-label">Custom delay</span>
          <p class="field-help">Pick the next honest date and time. DailyTrack will keep a delayed tag so the moved promise stays visible.</p>
        </div>
        <div class="split-fields">
          <div class="field">
            <label for="delay-date">New date</label>
            <input id="delay-date" type="date" name="targetDate" min="${escAttr(sourceDate)}" value="${escAttr(customDate)}" required />
          </div>
          <div class="field">
            <label for="delay-time">New time</label>
            <input id="delay-time" type="time" name="targetTime" value="${escAttr(customTime)}" />
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="action-button" type="button" data-action="close-modal">Cancel</button>
        <button class="action-button danger" type="submit">${icon("history")} Save delay</button>
      </div>
    </form>
  `;

  return modalShell("Delay task", body);
}

function renderSectionForm() {
  const editSection = ui.modal.editId ? state.sections.find((section) => section.id === ui.modal.editId) : null;
  const form = `
    <form class="form-grid" data-form="section">
      <input type="hidden" name="id" value="${escAttr(editSection?.id || "")}" />
      <div class="field">
        <label for="section-name">Section name</label>
        <input id="section-name" name="name" value="${escAttr(editSection?.name || "")}" placeholder="Enter section name" required />
      </div>
      <div class="modal-actions">
        <button class="action-button" type="button" data-action="close-modal">Cancel</button>
        <button class="action-button primary" type="submit">${icon("check")} Save</button>
      </div>
    </form>
  `;
  return modalShell(editSection ? "Edit section" : "Add section", form);
}

function renderExpenseForm() {
  const expenseDate = ui.modal.date || (ui.view === "calendar" || ui.view === "history" ? ui.activeDate : toDateKey(new Date()));
  const form = `
    <form class="form-grid" data-form="expense">
      <div class="split-fields">
        <div class="field">
          <label for="expense-amount">Amount</label>
          <input id="expense-amount" type="number" min="0" step="0.01" name="amount" placeholder="Enter amount" required />
        </div>
        <div class="field">
          <label for="expense-date">Date</label>
          <input id="expense-date" type="date" name="date" value="${escAttr(expenseDate)}" required />
        </div>
      </div>
      <div class="split-fields">
        <div class="field">
          <label for="expense-category">Category</label>
          <input id="expense-category" name="category" placeholder="Enter category" required />
        </div>
        <div class="field">
          <label for="expense-source">Source</label>
          <select id="expense-source" name="source" required>
            <option value="" disabled selected>Select source</option>
            ${["Cash", "UPI", "Credit Card", "Debit Card", "Bank Account", "Wallet", "Other"].map((source) => `<option>${source}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="expense-note">Note</label>
        <textarea id="expense-note" name="note" placeholder="Optional note"></textarea>
      </div>
      <div class="modal-actions">
        <button class="action-button" type="button" data-action="close-modal">Cancel</button>
        <button class="action-button primary" type="submit">${icon("check")} Save</button>
      </div>
    </form>
  `;
  return modalShell("Add expense", form);
}

function handleClick(event) {
  const clickedCompletionArea = event.target.closest("[data-completion-area]");
  const shouldCloseCompletionPopover = ui.completionPopover && !clickedCompletionArea;
  const button = event.target.closest("[data-action]");
  if (!button) {
    if (shouldCloseCompletionPopover) {
      ui.completionPopover = false;
      render();
    }
    return;
  }

  const action = button.dataset.action;
  if (shouldCloseCompletionPopover) ui.completionPopover = false;

  if (button.classList.contains("modal-backdrop") && event.target.closest("[data-modal-panel]")) {
    return;
  }

  if (action === "toggle-completion-popover") {
    ui.completionPopover = !ui.completionPopover;
    render();
    return;
  }

  if (action === "close-completion-popover") {
    ui.completionPopover = false;
    render();
    return;
  }

  if (action === "close-modal") {
    ui.modal = null;
    render();
    return;
  }

  if (action === "set-view") {
    const nextView = button.dataset.view;
    if (!nextView) return;
    if (nextView && nextView !== ui.view) ui.segmentTransition = captureSegmentedControlMetrics();
    ui.view = nextView;
    if (ui.view === "calendar" && !ui.activeDate) ui.activeDate = toDateKey(new Date());
    render();
    return;
  }

  if (action === "set-appearance") {
    const appearance = ["system", "light", "dark"].includes(button.dataset.appearance) ? button.dataset.appearance : "system";
    state.preferences = {
      ...normalizePreferences(state.preferences),
      appearance,
    };
    saveState();
    render();
    return;
  }

  if (action === "set-time-format") {
    const timeFormat = ["12", "24"].includes(String(button.dataset.timeFormat)) ? String(button.dataset.timeFormat) : "12";
    state.preferences = {
      ...normalizePreferences(state.preferences),
      timeFormat,
    };
    saveState();
    render();
    return;
  }

  if (action === "set-desktop-widget") {
    const desktopWidget = button.dataset.desktopWidget !== "off";
    state.preferences = {
      ...normalizePreferences(state.preferences),
      desktopWidget,
    };
    saveState();
    render();
    return;
  }

  if (action === "set-calendar-date") {
    ui.activeDate = button.dataset.date || toDateKey(new Date());
    render();
    return;
  }

  if (action === "calendar-prev-month" || action === "calendar-next-month") {
    ui.activeDate = addMonthsClamped(ui.activeDate || toDateKey(new Date()), action === "calendar-prev-month" ? -1 : 1);
    render();
    return;
  }

  if (action === "calendar-today") {
    ui.activeDate = toDateKey(new Date());
    render();
    return;
  }

  if (action === "logout") {
    if (desktopApi) {
      desktopApi.logout();
      ui.session = null;
      render();
    }
    return;
  }

  if (action === "open-choose") {
    ui.modal = { kind: "choose" };
    render();
    return;
  }

  if (action === "open-tracker-form") {
    ui.modal = {
      kind: "tracker",
      type: button.dataset.type || "checkbox",
      date: button.dataset.date || (ui.view === "calendar" ? ui.activeDate : ""),
    };
    render();
    return;
  }

  if (action === "open-planner-task") {
    ui.modal = {
      kind: "tracker",
      type: "task",
      date: button.dataset.date || ui.activeDate || toDateKey(new Date()),
      repeatMode: "none",
    };
    render();
    return;
  }

  if (action === "open-section-form") {
    ui.modal = { kind: "section" };
    render();
    return;
  }

  if (action === "open-expense-form") {
    ui.modal = {
      kind: "expense",
      date: button.dataset.date || (ui.view === "history" || ui.view === "calendar" ? ui.activeDate : toDateKey(new Date())),
    };
    render();
    return;
  }

  if (action === "edit-tracker") {
    const tracker = state.trackers.find((item) => item.id === button.dataset.id);
    if (!tracker) return;
    ui.modal = { kind: "tracker", editId: tracker.id, type: tracker.type };
    render();
    return;
  }

  if (action === "open-delay") {
    const tracker = state.trackers.find((item) => item.id === button.dataset.id);
    if (!tracker) return;
    ui.modal = {
      kind: "delay",
      id: tracker.id,
      date: button.dataset.date || toDateKey(new Date()),
    };
    render();
    return;
  }

  if (action === "apply-delay") {
    applyDelayPreset(button.dataset.id, button.dataset.date || toDateKey(new Date()), button.dataset.delayPreset || "hour");
    return;
  }

  if (action === "edit-section") {
    ui.modal = { kind: "section", editId: button.dataset.id };
    render();
    return;
  }

  if (action === "toggle-pin") {
    togglePinTracker(button.dataset.id);
    return;
  }

  if (action === "toggle-widget") {
    toggleWidgetTracker(button.dataset.id);
    return;
  }

  if (action === "delete-tracker") {
    deleteTracker(button.dataset.id);
    return;
  }

  if (action === "delete-section") {
    deleteSection(button.dataset.id);
    return;
  }

  if (action === "toggle-complete") {
    const tracker = state.trackers.find((item) => item.id === button.dataset.id);
    const log = ensureLog(toDateKey(new Date()), button.dataset.id);
    let achievement = null;
    log.completed = !log.completed;
    if (log.completed) {
      const now = currentTimeValue();
      log.completedAt = now;
      if (tracker?.completionMode === "manual-time" && !log.actualTime) log.actualTime = now;
      achievement = getCompletionAchievement(tracker, log);
    } else {
      log.completedAt = "";
      log.completionCelebrated = false;
      if (tracker?.completionMode === "manual-time") log.actualTime = "";
    }
    finishStateChange(achievement);
    return;
  }

  if (action === "counter-inc" || action === "counter-dec") {
    updateCounter(button.dataset.id, action === "counter-inc" ? 1 : -1);
    return;
  }

  if (action === "delete-expense") {
    deleteExpense(button.dataset.date, button.dataset.id);
  }
}

function handleKeydown(event) {
  if (event.key !== "Escape" || !ui.completionPopover) return;
  ui.completionPopover = false;
  render();
}

function handleChange(event) {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "set-time") {
    const tracker = state.trackers.find((item) => item.id === target.dataset.id);
    const log = ensureLog(toDateKey(new Date()), target.dataset.id);
    log.time = target.value;
    log.completed = Boolean(target.value);
    if (!log.completed) log.completionCelebrated = false;
    finishStateChange(getCompletionAchievement(tracker, log));
    return;
  }

  if (action === "set-actual-time") {
    const tracker = state.trackers.find((item) => item.id === target.dataset.id);
    const log = ensureLog(toDateKey(new Date()), target.dataset.id);
    log.actualTime = target.value;
    log.completedAt = target.value;
    log.completed = Boolean(target.value);
    if (!log.completed) log.completionCelebrated = false;
    finishStateChange(getCompletionAchievement(tracker, log));
    return;
  }

  if (action === "set-history-date") {
    ui.activeDate = target.value || toDateKey(new Date());
    render();
    return;
  }

  if (action === "choose-section") {
    const form = target.closest("form");
    const field = form?.querySelector("[data-new-section-field]");
    const input = form?.querySelector("[data-new-section-input]");
    const shouldCreate = target.value === NEW_SECTION_VALUE;

    field?.classList.toggle("is-hidden", !shouldCreate);
    if (input) {
      input.required = shouldCreate;
      if (!shouldCreate) input.value = "";
      if (shouldCreate) input.focus();
    }
    return;
  }

  if (action === "choose-repeat") {
    syncRepeatDays(target.closest("form"), target.value);
    return;
  }

  if (action === "choose-repeat-day") {
    syncRepeatModeFromDays(target.closest("form"));
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formType = form.dataset.form;
  const data = new FormData(form);

  if (formType === "request-otp") {
    await requestOtp(data);
    return;
  }

  if (formType === "verify-otp") {
    await verifyOtp(data);
    return;
  }

  if (formType === "tracker") {
    saveTracker(form, data);
  }

  if (formType === "delay") {
    saveDelay(data);
  }

  if (formType === "section") {
    saveSection(data);
  }

  if (formType === "expense") {
    saveExpense(data);
  }
}

async function requestOtp(data) {
  if (!desktopApi) return;
  const name = cleanText(data.get("name"));
  const email = cleanText(data.get("email")).toLowerCase();
  ui.auth.name = name;
  ui.auth.email = email;
  ui.auth.message = "Sending OTP...";
  ui.auth.devCode = "";
  render();

  const result = await desktopApi.requestOtp(email);
  ui.auth.otpSent = Boolean(result.ok);
  ui.auth.message = result.message || (result.ok ? "OTP sent." : "Could not send OTP.");
  ui.auth.devCode = result.devCode || "";
  render();
}

async function verifyOtp(data) {
  if (!desktopApi) return;
  const name = cleanText(data.get("name") || ui.auth.name);
  const email = cleanText(data.get("email")).toLowerCase();
  const code = cleanText(data.get("code"));
  ui.auth.name = name;
  ui.auth.message = "Verifying...";
  render();

  const result = await desktopApi.verifyOtp(email, code);
  if (!result.ok) {
    ui.auth.message = result.message || "OTP verification failed.";
    render();
    return;
  }

  ui.session = result.session;
  state = await desktopApi.getState();
  if (name) {
    state.profile = {
      ...normalizeProfile(state.profile),
      name,
    };
    saveState();
  }
  ui.view = "today";
  ui.auth = { name: "", email: "", otpSent: false, message: "", devCode: "" };
  render();
}

function saveTracker(form, data) {
  const id = String(data.get("id") || "");
  const type = String(data.get("type") || "checkbox");
  const days = Array.from(form.querySelectorAll('input[name="days"]:checked')).map((input) => input.value);
  const existing = state.trackers.find((tracker) => tracker.id === id);
  const repeatMode = String(data.get("repeatMode") || defaultRepeatForType(type));
  const sectionId = resolveSectionId(form, data);
  if (sectionId === null) return;
  const startDate = String(data.get("startDate") || toDateKey(new Date()));
  const repeat = normalizeRepeatRule(repeatMode, days, startDate);

  const tracker = {
    id: existing?.id || createId("tracker"),
    type,
    name: cleanText(data.get("name")),
    sectionId,
    startDate,
    repeat,
    unit: type === "counter" ? cleanText(data.get("unit")) : "",
    goal: type === "counter" ? Number(data.get("goal") || 0) : 0,
    category: type === "task" ? cleanText(data.get("category")) : "",
    plannedTime: type !== "counter" ? cleanText(data.get("plannedTime")) : "",
    graceMinutes: type !== "counter" ? Math.max(0, Number(data.get("graceMinutes") || 0)) : 0,
    completionMode: type !== "counter" ? cleanText(data.get("completionMode")) || defaultCompletionModeForType(type) : "tap",
    pinned: data.get("pinned") === "1",
    showInWidget: data.get("showInWidget") === "1",
    countsTowardStreak: data.get("countsTowardStreak") === "1",
    delay: existing?.delay || null,
    delayHistory: Array.isArray(existing?.delayHistory) ? existing.delayHistory : [],
    createdAt: existing?.createdAt || new Date().toISOString(),
    order: existing?.order ?? state.trackers.length,
  };

  if (existing) {
    state.trackers = state.trackers.map((item) => (item.id === existing.id ? tracker : item));
  } else {
    state.trackers.push(tracker);
  }

  saveState();
  ui.modal = null;
  render();
}

function applyDelayPreset(id, sourceDate, preset) {
  const tracker = state.trackers.find((item) => item.id === id);
  if (!tracker) return;
  delayTracker(tracker, sourceDate, getDelayPresetTarget(tracker, sourceDate, preset), preset);
}

function saveDelay(data) {
  const tracker = state.trackers.find((item) => item.id === String(data.get("id") || ""));
  if (!tracker) return;

  const sourceDate = String(data.get("sourceDate") || toDateKey(new Date()));
  const targetDate = String(data.get("targetDate") || sourceDate);
  const targetTime = normalizeTimeValue(data.get("targetTime")) || "";
  delayTracker(tracker, sourceDate, { targetDate, targetTime }, "custom");
}

function delayTracker(tracker, sourceDate, target, preset) {
  const safeSourceDate = sourceDate || toDateKey(new Date());
  const safeTargetDate = target.targetDate < safeSourceDate ? safeSourceDate : target.targetDate;
  const targetTime = normalizeTimeValue(target.targetTime) || "";
  const previousDelay = getDelayInfo(tracker);
  const count = Math.max(0, Number(previousDelay?.count || 0)) + 1;
  const originalDate = previousDelay?.originalDate || safeSourceDate;
  const originalTime = previousDelay?.originalTime ?? (tracker.plannedTime || "");
  const event = {
    id: createId("delay"),
    preset,
    fromDate: safeSourceDate,
    fromTime: getEffectivePlannedTime(tracker, safeSourceDate) || tracker.plannedTime || "",
    targetDate: safeTargetDate,
    targetTime,
    at: new Date().toISOString(),
  };

  tracker.delay = {
    originalDate,
    originalTime,
    targetDate: safeTargetDate,
    targetTime,
    count,
    updatedAt: event.at,
    preset,
  };
  tracker.delayHistory = [...(Array.isArray(tracker.delayHistory) ? tracker.delayHistory : []), event].slice(-12);

  saveState();
  ui.modal = null;
  render();
}

function resolveSectionId(form, data) {
  const selectedSection = String(data.get("sectionId") || "");
  if (selectedSection !== NEW_SECTION_VALUE) return selectedSection;

  const sectionName = cleanText(data.get("newSectionName"));
  const input = form.querySelector("[data-new-section-input]");

  if (!sectionName) {
    input?.focus();
    return null;
  }

  const existingSection = state.sections.find((section) => section.name.toLowerCase() === sectionName.toLowerCase());
  if (existingSection) return existingSection.id;

  const section = {
    id: createId("section"),
    name: sectionName,
    order: state.sections.length,
  };

  state.sections.push(section);
  return section.id;
}

function getAllWeekdayValues() {
  return weekdays.map(([value]) => value);
}

function getWeekdayValueForDate(dateKey) {
  return String(parseDateKey(dateKey || toDateKey(new Date())).getDay());
}

function getRepeatDaysForForm(mode, days, startDate) {
  const allDays = getAllWeekdayValues();
  const cleanDays = normalizeDayValues(days);

  if (mode === "daily") return allDays;
  if (mode === "selected") return cleanDays.length ? cleanDays : [getWeekdayValueForDate(startDate)];
  return cleanDays.length ? cleanDays : [getWeekdayValueForDate(startDate)];
}

function normalizeRepeatRule(mode, days, fallbackDate) {
  const allDays = getAllWeekdayValues();
  const cleanDays = normalizeDayValues(days);

  if (mode === "daily" || cleanDays.length === allDays.length) {
    return {
      mode: "daily",
      days: allDays,
    };
  }

  if (mode === "selected") {
    return {
      mode: "selected",
      days: cleanDays.length ? cleanDays : [getWeekdayValueForDate(fallbackDate)],
    };
  }

  return {
    mode,
    days: cleanDays.length ? cleanDays : [getWeekdayValueForDate(fallbackDate)],
  };
}

function normalizeDayValues(days) {
  const selected = new Set((days || []).map(String));
  return getAllWeekdayValues().filter((day) => selected.has(day));
}

function syncRepeatDays(form, mode) {
  const boxes = Array.from(form?.querySelectorAll('input[name="days"]') || []);
  if (!boxes.length) return;

  const startDate = form?.querySelector('input[name="startDate"]')?.value || toDateKey(new Date());
  const startDay = getWeekdayValueForDate(startDate);

  if (mode === "daily") {
    boxes.forEach((box) => {
      box.checked = true;
    });
    return;
  }

  if (mode === "selected") {
    if (!boxes.some((box) => box.checked)) {
      boxes.forEach((box) => {
        box.checked = box.value === startDay;
      });
    }
    return;
  }

  boxes.forEach((box) => {
    box.checked = box.value === startDay;
  });
}

function syncRepeatModeFromDays(form) {
  const repeatSelect = form?.querySelector('select[name="repeatMode"]');
  const boxes = Array.from(form?.querySelectorAll('input[name="days"]') || []);
  if (!repeatSelect || !boxes.length) return;

  const checkedCount = boxes.filter((box) => box.checked).length;

  if (checkedCount === boxes.length) {
    repeatSelect.value = "daily";
    return;
  }

  if (checkedCount > 1 || repeatSelect.value === "daily") {
    repeatSelect.value = "selected";
  }
}

function saveSection(data) {
  const id = String(data.get("id") || "");
  const existing = state.sections.find((section) => section.id === id);
  const section = {
    id: existing?.id || createId("section"),
    name: cleanText(data.get("name")),
    order: existing?.order ?? state.sections.length,
  };

  if (existing) {
    state.sections = state.sections.map((item) => (item.id === existing.id ? section : item));
  } else {
    state.sections.push(section);
  }

  saveState();
  ui.modal = null;
  render();
}

function saveExpense(data) {
  const date = String(data.get("date") || toDateKey(new Date()));
  const expense = {
    id: createId("expense"),
    amount: Number(data.get("amount") || 0),
    category: cleanText(data.get("category")),
    source: cleanText(data.get("source")),
    note: cleanText(data.get("note")),
    time: formatTime(new Date()),
  };

  if (!state.expenses[date]) state.expenses[date] = [];
  state.expenses[date].push(expense);
  saveState();
  ui.activeDate = date;
  ui.modal = null;
  render();
}

function deleteTracker(id) {
  const tracker = state.trackers.find((item) => item.id === id);
  if (!tracker || !confirm(`Delete "${tracker.name}"?`)) return;
  state.trackers = state.trackers.filter((item) => item.id !== id);
  Object.values(state.logs).forEach((logsForDay) => {
    delete logsForDay[id];
  });
  saveState();
  render();
}

function deleteSection(id) {
  const section = state.sections.find((item) => item.id === id);
  if (!section || !confirm(`Delete "${section.name}" section? Trackers will stay without a section.`)) return;
  state.sections = state.sections.filter((item) => item.id !== id);
  state.trackers = state.trackers.map((tracker) => (tracker.sectionId === id ? { ...tracker, sectionId: "" } : tracker));
  saveState();
  render();
}

function deleteExpense(date, id) {
  if (!confirm("Delete this expense?")) return;
  state.expenses[date] = getExpenses(date).filter((expense) => expense.id !== id);
  saveState();
  render();
}

function togglePinTracker(id) {
  const tracker = state.trackers.find((item) => item.id === id);
  if (!tracker) return;
  tracker.pinned = !tracker.pinned;
  saveState();
  render();
}

function toggleWidgetTracker(id) {
  const tracker = state.trackers.find((item) => item.id === id);
  if (!tracker) return;
  tracker.showInWidget = tracker.showInWidget === false;
  saveState();
  render();
}

function updateCounter(id, delta) {
  const date = toDateKey(new Date());
  const tracker = state.trackers.find((item) => item.id === id);
  const log = ensureLog(date, id);
  const goal = Number(tracker?.goal) || 0;
  const beforeCount = getCounterCount(date, id);
  let achievement = null;

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

  const afterCount = getCounterCount(date, id);
  if (goal && afterCount < goal) log.goalCelebrated = false;
  if (delta > 0 && goal && beforeCount < goal && afterCount >= goal && !log.goalCelebrated) {
    log.goalCelebrated = true;
    achievement = {
      trackerId: id,
      surface: "counter",
    };
  }

  finishStateChange(achievement);
}

function finishStateChange(achievement) {
  saveState();
  if (achievement) {
    triggerAchievement(achievement);
  } else {
    render();
  }
}

function getCompletionAchievement(tracker, log) {
  if (!tracker || !log.completed || log.completionCelebrated) return null;

  const timing = getTimingStatus(tracker, log, toDateKey(new Date()));
  if (timing && timing.tone !== "good") return null;

  log.completionCelebrated = true;
  return {
    trackerId: tracker.id,
    surface: "button",
  };
}

function triggerAchievement(achievement) {
  window.clearTimeout(ui.achievementTimer);
  ui.achievement = {
    ...achievement,
    pieces: createAchievementPieces(),
  };
  render();
  ui.achievementTimer = window.setTimeout(() => {
    ui.achievement = null;
    render();
  }, 1450);
}

function createAchievementPieces() {
  const colors = ["#426f88", "#3c8078", "#4f7d62", "#9a7339", "#a15c68"];
  return Array.from({ length: 18 }, (_item, index) => {
    const angle = (index / 18) * Math.PI * 2 + Math.random() * 0.28;
    const distance = 18 + Math.random() * 36;
    return {
      x: `${Math.cos(angle) * distance}px`,
      y: `${Math.sin(angle) * distance}px`,
      rotation: `${Math.round(Math.random() * 220 - 80)}deg`,
      delay: `${Math.random() * 0.12}s`,
      color: colors[index % colors.length],
    };
  });
}

function renderConfettiPieces(pieces = []) {
  return pieces
    .map(
      (piece) =>
        `<span class="confetti-piece" style="--x:${piece.x}; --y:${piece.y}; --r:${piece.rotation}; --delay:${piece.delay}; --color:${piece.color};"></span>`,
    )
    .join("");
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
  if (!Array.isArray(state.logs[date][trackerId].entries)) {
    state.logs[date][trackerId].entries = [];
  }
  if (typeof state.logs[date][trackerId].actualTime !== "string") {
    state.logs[date][trackerId].actualTime = "";
  }
  if (typeof state.logs[date][trackerId].completionCelebrated !== "boolean") {
    state.logs[date][trackerId].completionCelebrated = false;
  }
  if (typeof state.logs[date][trackerId].goalCelebrated !== "boolean") {
    state.logs[date][trackerId].goalCelebrated = false;
  }
  return state.logs[date][trackerId];
}

function getLog(date, trackerId) {
  return state.logs[date]?.[trackerId] || {
    completed: false,
    completedAt: "",
    actualTime: "",
    time: "",
    entries: [],
    completionCelebrated: false,
    goalCelebrated: false,
  };
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

function getTrackersForDate(date, includeLogged = false) {
  return state.trackers
    .filter((tracker) => shouldShowTracker(tracker, date) || (includeLogged && state.logs[date]?.[tracker.id]))
    .sort((a, b) => compareTrackersForDate(a, b, date));
}

function getSortedTrackers(trackers) {
  return [...trackers].sort(compareTrackersForDisplay);
}

function compareTrackersForDisplay(a, b) {
  return compareTrackersForDate(a, b, null);
}

function compareTrackersForDate(a, b, date) {
  const pinnedDiff = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
  if (pinnedDiff) return pinnedDiff;

  const aTime = timeToMinutes(date ? getEffectivePlannedTime(a, date) : a.plannedTime);
  const bTime = timeToMinutes(date ? getEffectivePlannedTime(b, date) : b.plannedTime);
  const aHasTime = aTime !== null;
  const bHasTime = bTime !== null;

  if (aHasTime && bHasTime && aTime !== bTime) return aTime - bTime;
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;

  return getTrackerCreatedOrder(a) - getTrackerCreatedOrder(b);
}

function getTrackerCreatedOrder(tracker) {
  const order = Number(tracker.order);
  if (Number.isFinite(order)) return order;
  const createdTime = Date.parse(tracker.createdAt || "");
  return Number.isFinite(createdTime) ? createdTime : 0;
}

function shouldShowTracker(tracker, date) {
  const delay = getDelayInfo(tracker);
  if (delay?.targetDate === date) return true;

  const mode = tracker.repeat?.mode || defaultRepeatForType(tracker.type);
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

function groupTrackersBySection(trackers) {
  const groups = [];
  const sectionIds = new Set(trackers.map((tracker) => tracker.sectionId || ""));

  state.sections
    .filter((section) => sectionIds.has(section.id))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .forEach((section) => {
      groups.push({
        id: section.id,
        name: section.name,
        trackers: trackers.filter((tracker) => tracker.sectionId === section.id),
      });
    });

  const noSection = trackers.filter((tracker) => !tracker.sectionId || !state.sections.some((section) => section.id === tracker.sectionId));
  if (noSection.length) {
    groups.push({
      id: "",
      name: "No section",
      trackers: noSection,
    });
  }

  return groups;
}

function trackerMeta(tracker, date = null) {
  const meta = [repeatLabels[tracker.repeat?.mode || defaultRepeatForType(tracker.type)] || "Repeat"];
  const plannedTime = date ? getEffectivePlannedTime(tracker, date) : tracker.plannedTime;
  if (tracker.pinned) meta.push("Pinned");
  if (plannedTime) meta.push(`Planned ${formatDisplayTime(plannedTime)}`);
  if (tracker.type === "counter" && tracker.goal) meta.push(`Goal ${tracker.goal}${tracker.unit ? ` ${tracker.unit}` : ""}`);
  if (tracker.type === "task" && tracker.category) meta.push(tracker.category);
  if (tracker.type === "time") meta.push("Time entry");
  if (tracker.showInWidget === false) meta.push("Hidden from widget");
  if (tracker.countsTowardStreak === false) meta.push("No streak");
  return meta;
}

function renderTimingPill(timing) {
  if (!timing) return "";
  return `<span class="pill ${escAttr(timing.tone)}">${esc(timing.label)}</span>`;
}

function renderDelayPill(tracker, date) {
  const label = getDelayPillLabel(tracker, date);
  if (!label) return "";
  return `<span class="pill delay">${icon("history")}${esc(label)}</span>`;
}

function getTimingStatus(tracker, log, date = null) {
  const actualTime = getActualTimeValue(tracker, log);
  const plannedMinutes = timeToMinutes(date ? getEffectivePlannedTime(tracker, date) : tracker.plannedTime);
  if (plannedMinutes === null) return null;

  if (!actualTime) {
    return {
      label: `Waiting for actual time`,
      tone: "waiting",
    };
  }

  const actualMinutes = timeToMinutes(actualTime);
  if (actualMinutes === null) return null;

  const grace = Math.max(0, Number(tracker.graceMinutes || 0));
  const diff = actualMinutes - plannedMinutes;

  if (diff > grace) {
    return {
      label: `Late by ${formatDurationMinutes(diff)}`,
      tone: "late",
    };
  }

  if (diff < 0) {
    return {
      label: `Early by ${formatDurationMinutes(Math.abs(diff))}`,
      tone: "good",
    };
  }

  return {
    label: "On time",
    tone: "good",
  };
}

function getActualTimeValue(tracker, log) {
  if (tracker.type === "time") return log.time || "";
  return log.actualTime || normalizeTimeValue(log.completedAt) || "";
}

function getRecentDateKeys(count) {
  return Array.from({ length: count }, (_item, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - 1 - index));
    return toDateKey(date);
  });
}

function getCompletionStatsForDate(date) {
  const trackers = getTrackersForDate(date, true);
  const total = trackers.length;
  const done = trackers.filter((tracker) => isTrackerCompleteForDate(tracker, date)).length;
  return { done, total };
}

function getStreakSnapshot(date) {
  const today = toDateKey(new Date());
  const currentWeek = getStreakWeek(date, today);
  const currentStreak = getCurrentStreakWeeks(today);

  return {
    currentStreak,
    currentWeek,
    level: getStreakLevel(currentStreak, currentWeek),
    calendarDays: getStreakCalendarDays(date, today),
  };
}

function getCurrentStreakWeeks(today) {
  let cursor = startOfWeek(today);
  let count = 0;
  let checked = 0;
  let checkingCurrentWeek = true;

  while (checked < 52) {
    const week = getStreakWeek(cursor, today);

    if (week.scheduledDays === 0) {
      cursor = addDays(cursor, -7);
      checked += 1;
      checkingCurrentWeek = false;
      continue;
    }

    if (checkingCurrentWeek && !week.weekWon) {
      cursor = addDays(cursor, -7);
      checked += 1;
      checkingCurrentWeek = false;
      continue;
    }

    if (!week.weekWon) break;

    count += 1;
    cursor = addDays(cursor, -7);
    checked += 1;
    checkingCurrentWeek = false;
  }

  return count;
}

function getStreakWeek(date, today) {
  const start = startOfWeek(date);
  const dates = getWeekDates(start);
  const todayWeekStart = startOfWeek(today);
  const isCurrentWeek = start === todayWeekStart;
  const dayStats = dates.map((day) => getStreakDay(day, today));
  const elapsedStats = dayStats.filter((day) => day.date <= today);
  const scheduledDays = dayStats.filter((day) => day.total > 0).length;
  const targetWins = scheduledDays ? Math.min(5, scheduledDays) : 0;
  const dailyWins = elapsedStats.filter((day) => day.win).length;
  const done = elapsedStats.reduce((total, day) => total + day.done, 0);
  const total = elapsedStats.reduce((sum, day) => sum + day.total, 0);
  const completionPercent = total ? Math.round((done / total) * 100) : 0;
  const weekWon = targetWins > 0 && (dailyWins >= targetWins || (!isCurrentWeek && completionPercent >= 80));
  const perfect = total > 0 && done === total;

  return {
    start,
    days: dayStats,
    scheduledDays,
    targetWins,
    dailyWins,
    done,
    total,
    completionPercent,
    weekWon,
    perfect,
  };
}

function getStreakDay(date, today) {
  const trackers = getTrackersForDate(date).filter(isStreakEligibleTracker);
  const total = trackers.length;
  const done = date <= today ? trackers.filter((tracker) => isTrackerCompleteForDate(tracker, date)).length : 0;
  const threshold = total <= 2 ? total : Math.ceil(total * 0.8);
  const win = total > 0 && date <= today && done >= threshold;
  const status = getStreakDayStatus(date, today, total, done, win);
  const label = formatCalendarDate(date);
  const tooltip =
    status === "future"
      ? `${label}: upcoming streak day`
      : total
        ? `${label}: ${done}/${total} streak items complete`
        : `${label}: no streak items`;

  return {
    date,
    done,
    total,
    threshold,
    win,
    perfect: total > 0 && done === total,
    status,
    tooltip,
  };
}

function getStreakDayStatus(date, today, total, done, win) {
  if (date > today) return "future";
  if (!total) return "rest";
  if (win) return "win";
  if (done > 0) return "partial";
  return "miss";
}

function isStreakEligibleTracker(tracker) {
  return tracker.countsTowardStreak !== false;
}

function getStreakCalendarDays(date, today) {
  const selected = parseDateKey(date);
  const month = selected.getMonth();
  const firstOfMonth = toDateKey(new Date(selected.getFullYear(), month, 1));
  const gridStart = startOfWeek(firstOfMonth);

  return Array.from({ length: 42 }, (_item, index) => {
    const day = getStreakDay(addDays(gridStart, index), today);
    return {
      ...day,
      inMonth: parseDateKey(day.date).getMonth() === month,
    };
  });
}

function getStreakLevel(currentStreak, week) {
  if (currentStreak >= 8) return 4;
  if (currentStreak >= 4) return 3;
  if (currentStreak >= 1) return 2;
  if (week.dailyWins > 0) return 1;
  return 0;
}

function getCompletedTrackerItems(date) {
  return getTrackersForDate(date, true)
    .map((tracker, index) => ({ tracker, index }))
    .filter(({ tracker }) => isTrackerCompleteForDate(tracker, date))
    .map(({ tracker, index }) => {
      const log = getLog(date, tracker.id);
      const timing = getTimingStatus(tracker, log, date);
      const label = tracker.name || trackerTypes[tracker.type]?.label || "Tracker";
      const detail = getCompletedTrackerDetail(tracker, date, timing);
      const tone = timing?.tone === "late" ? "late" : timing?.tone === "good" ? "good" : "neutral";

      return {
        label,
        detail,
        tone,
        sortValue: getCompletedSortValue(tracker, date, log),
        order: index,
        tooltip: `${label} - ${detail}`,
      };
    })
    .sort((a, b) => b.sortValue - a.sortValue || b.order - a.order);
}

function getCompletedTrackerDetail(tracker, date, timing) {
  if (timing) return timing.label;

  if (tracker.type === "counter") {
    const count = getCounterCount(date, tracker.id);
    const goal = Number(tracker.goal) || 0;
    const unit = tracker.unit || "done";
    return goal ? `Goal ${count}/${goal} ${unit}` : `${count} ${unit}`;
  }

  if (tracker.type === "time") {
    const time = getLog(date, tracker.id).time;
    return time ? `Logged ${formatDisplayTime(time)}` : "Completed today";
  }

  return "Completed today";
}

function getCompletedSortValue(tracker, date, log) {
  if (tracker.type === "counter") {
    const entries = getLog(date, tracker.id).entries || [];
    const index = findLastIndex(entries, (entry) => Number(entry.amount || 0) > 0);
    const lastEntry = index >= 0 ? entries[index] : null;
    return timeToMinutes(lastEntry?.at) ?? -1;
  }

  return timeToMinutes(getActualTimeValue(tracker, log)) ?? -1;
}

function isTrackerCompleteForDate(tracker, date) {
  const log = getLog(date, tracker.id);
  if (tracker.type === "counter") {
    const count = getCounterCount(date, tracker.id);
    return tracker.goal ? count >= Number(tracker.goal) : count > 0;
  }
  if (tracker.type === "time") return Boolean(log.time);
  return Boolean(log.completed);
}

function getTimingStatsForDate(date) {
  return getTrackersForDate(date, true).reduce(
    (stats, tracker) => {
      const status = getTimingStatus(tracker, getLog(date, tracker.id), date);
      if (!status) return stats;
      if (status.tone === "late") stats.late += 1;
      else if (status.tone === "waiting") stats.waiting += 1;
      else stats.good += 1;
      return stats;
    },
    { good: 0, waiting: 0, late: 0 },
  );
}

function shortDateLabel(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function shortWeekdayLabel(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "short",
  }).slice(0, 3);
}

function formatCalendarDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getSectionName(id) {
  return state.sections.find((section) => section.id === id)?.name || "No section";
}

function defaultRepeatForType(type) {
  return type === "task" ? "none" : "daily";
}

function defaultCompletionModeForType(type) {
  return type === "time" ? "manual-time" : "tap";
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(dateKey, amount) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

function addMinutesToDateTime(dateKey, minutes, amount) {
  const date = parseDateKey(dateKey);
  date.setMinutes(Math.max(0, Number(minutes || 0)) + Number(amount || 0));
  return {
    targetDate: toDateKey(date),
    targetTime: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

function getDelayPresetTarget(tracker, sourceDate, preset) {
  const plannedTime = getEffectivePlannedTime(tracker, sourceDate) || tracker.plannedTime || "";
  const fallbackTime = sourceDate === toDateKey(new Date()) ? currentTimeValue() : "09:00";
  const baseTime = normalizeTimeValue(plannedTime) || fallbackTime;
  const baseMinutes = timeToMinutes(baseTime) ?? 9 * 60;

  if (preset === "day") {
    return {
      targetDate: addDays(sourceDate, 1),
      targetTime: baseTime,
    };
  }

  return addMinutesToDateTime(sourceDate, baseMinutes, 60);
}

function getDelayInfo(tracker) {
  const delay = tracker?.delay;
  if (!delay || typeof delay !== "object") return null;
  if (!delay.targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(delay.targetDate))) return null;
  return {
    originalDate: String(delay.originalDate || tracker.startDate || delay.targetDate),
    originalTime: normalizeTimeValue(delay.originalTime) || "",
    targetDate: String(delay.targetDate),
    targetTime: normalizeTimeValue(delay.targetTime) || "",
    count: Math.max(1, Number(delay.count || 1)),
    updatedAt: String(delay.updatedAt || ""),
    preset: String(delay.preset || ""),
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
  if (delay.targetDate === date) {
    const targetTime = delay.targetTime ? formatDisplayTime(delay.targetTime) : "today";
    return `${count}Delayed to ${targetTime}`;
  }
  return "";
}

function getDelayContextText(tracker, date) {
  const delay = getDelayInfo(tracker);
  const plannedTime = getEffectivePlannedTime(tracker, date) || tracker.plannedTime || "";
  const plannedText = plannedTime ? `Current promise: ${formatDisplayTime(plannedTime)}` : `Current promise: ${formatCalendarDate(date)}`;
  if (!delay) return plannedText;
  return `${plannedText}. Delayed ${delay.count} time${delay.count === 1 ? "" : "s"} already.`;
}

function formatDelayTarget(target) {
  const dateLabel = target.targetDate === toDateKey(new Date()) ? "Today" : shortDateLabel(target.targetDate);
  return `${dateLabel}${target.targetTime ? ` ${formatDisplayTime(target.targetTime)}` : ""}`;
}

function addMonthsClamped(dateKey, amount) {
  const date = parseDateKey(dateKey);
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return toDateKey(target);
}

function startOfWeek(dateKey) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const mondayOffset = (day + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return toDateKey(date);
}

function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_item, index) => addDays(weekStart, index));
}

function formatLongDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthYear(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function currentTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
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

function normalizeTimeValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const inputMatch = text.match(/^(\d{1,2}):(\d{2})$/);
  if (inputMatch) {
    const hour = Number(inputMatch[1]);
    const minute = Number(inputMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const displayMatch = text.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (displayMatch) {
    let hour = Number(displayMatch[1]);
    const minute = Number(displayMatch[2]);
    const period = displayMatch[3].toUpperCase();
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      if (period === "PM" && hour !== 12) hour += 12;
      if (period === "AM" && hour === 12) hour = 0;
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  return "";
}

function timeToMinutes(value) {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function formatDurationMinutes(totalMinutes) {
  const minutes = Math.max(0, Number(totalMinutes || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `Rs.${amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
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

function createId(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanText(value) {
  return String(value || "").trim();
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

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index, items)) return index;
  }
  return -1;
}

function boardIllustration() {
  return `
    <svg viewBox="0 0 420 300" role="img">
      <defs>
        <linearGradient id="boardA" x1="30" y1="20" x2="360" y2="270" gradientUnits="userSpaceOnUse">
          <stop stop-color="#426f88" />
          <stop offset="1" stop-color="#3c8078" />
        </linearGradient>
        <linearGradient id="boardB" x1="58" y1="36" x2="330" y2="236" gradientUnits="userSpaceOnUse">
          <stop stop-color="#ffffff" />
          <stop offset="1" stop-color="#f0f0ec" />
        </linearGradient>
      </defs>
      <path d="M56 62c38-44 117-47 170-29 70 24 140 50 158 109 17 56-19 117-73 138-51 20-110-4-159-14-54-10-115-7-136-56C-7 158 18 107 56 62Z" fill="#eeeeea" />
      <path d="M68 76h234c14 0 25 11 25 25v135c0 14-11 25-25 25H68c-14 0-25-11-25-25V101c0-14 11-25 25-25Z" fill="url(#boardB)" stroke="#c9c9c3" stroke-width="3" />
      <path d="M87 108h58M87 136h88M87 164h65" stroke="#8ea2ad" stroke-width="8" stroke-linecap="round" />
      <path d="M214 111h72M214 144h50M214 177h84" stroke="#426f88" stroke-width="10" stroke-linecap="round" opacity=".85" />
      <path d="M96 214h45M171 214h45M246 214h45" stroke="#3c8078" stroke-width="14" stroke-linecap="round" />
      <path d="M327 38l10 32 33 10-33 10-10 32-10-32-33-10 33-10Z" fill="url(#boardA)" opacity=".9" />
      <path d="M339 203c24 0 43 19 43 43s-19 43-43 43-43-19-43-43 19-43 43-43Z" fill="#edf6f0" stroke="#a9c5b4" stroke-width="3" />
      <path d="m321 247 13 13 27-31" fill="none" stroke="#4f7d62" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

function miniIllustration() {
  return `
    <svg viewBox="0 0 220 150" role="img">
      <path d="M33 42h126c9 0 16 7 16 16v61c0 9-7 16-16 16H33c-9 0-16-7-16-16V58c0-9 7-16 16-16Z" fill="#ffffff" stroke="#c9c9c3" stroke-width="3" />
      <path d="M45 70h66M45 94h88M45 118h42" stroke="#8ea2ad" stroke-width="7" stroke-linecap="round" />
      <path d="M159 18l6 20 20 6-20 6-6 20-6-20-20-6 20-6Z" fill="#426f88" opacity=".86" />
      <path d="M172 96c18 0 32 14 32 32s-14 32-32 32-32-14-32-32 14-32 32-32Z" fill="#edf6f0" stroke="#a9c5b4" stroke-width="3" />
      <path d="m158 128 9 9 20-23" fill="none" stroke="#4f7d62" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}
