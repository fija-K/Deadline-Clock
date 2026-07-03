(function () {
  const STORAGE_KEY = "problemClock.v1";
  const THEME_KEY = "problemClock.theme";
  const FIREBASE_IMPORTS = {
    app: "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js",
    auth: "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js",
    firestore: "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js"
  };
  const dayKey = () => new Date().toISOString().slice(0, 10);
  const weekKey = () => {
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const pastDays = Math.floor((date - firstDay) / 86400000);
    return `${date.getFullYear()}-${Math.ceil((pastDays + firstDay.getDay() + 1) / 7)}`;
  };

  const baseWorkflows = {
    easy: [
      step("read", "Read & Restate", 2, "Understand first. Code later.", "", "icon-eye", "Read carefully, then explain the problem to yourself without rereading it."),
      step("solve", "Solve (No Hints)", 8, "Solve it on your own.", "No hints, no searching.", "icon-brain", "Write your approach before coding."),
      step("hints", "Hint Allowed", 5, "Use hints carefully.", "Maximum three hints.", "icon-bulb", "Bridge brute force toward optimal."),
      step("decision", "Did you solve it?", 0, "Choose your path.", "Answer honestly.", "icon-question", "The roadmap updates from here."),
      step("compare", "Compare w/ Optimal", 2, "Compare approaches.", "Understand why optimal is better.", "icon-zap", "Name the bottleneck your solution had."),
      step("learn", "Learn Solution", 8, "Learn the missing idea.", "Do not copy blindly.", "icon-book", "Explain the key pattern before coding."),
      step("analyze", "Analyze", 2, "Understand your code and clean it.", "", "icon-search", "Remove unnecessary conditions."),
      step("notes", "Notes", 2, "Write the pattern.", "Record what made it work.", "icon-note", "Write the trigger that reveals the pattern.")
    ],
    medium: [
      step("read", "Read & Restate", 2, "Understand first. Code later.", "", "icon-eye", "Read carefully, then explain the problem to yourself without rereading it."),
      step("solve", "Solve (No Hints)", 10, "Solve it on your own.", "No hints, no searching.", "icon-brain", "Start with brute force if needed."),
      step("hints", "Hint Allowed", 10, "Use hints carefully.", "Maximum three hints.", "icon-bulb", "Convert the hint into your own invariant."),
      step("decision", "Did you solve it?", 0, "Choose your path.", "Answer honestly.", "icon-question", "The roadmap updates from here."),
      step("compare", "Compare w/ Optimal", 4, "Compare approaches.", "Understand why optimal is better.", "icon-zap", "Look for saved work or removed loops."),
      step("learn", "Learn Solution", 15, "Learn the missing idea.", "Do not copy blindly.", "icon-book", "Rebuild the logic from first principles."),
      step("analyze", "Analyze", 3, "Understand your code and clean it.", "", "icon-search", "Remove unnecessary conditions."),
      step("notes", "Notes", 2, "Write the pattern.", "Record what made it work.", "icon-note", "Keep the note short and reusable.")
    ],
    hard: [
      step("read", "Read & Restate", 3, "Understand first. Code later.", "", "icon-eye", "Read carefully, then explain the problem to yourself without rereading it."),
      step("solve", "Solve (No Hints)", 20, "Solve it on your own.", "No hints, no searching.", "icon-brain", "Write invariants before implementation."),
      step("hints", "Hint Allowed", 25, "Use hints carefully.", "Maximum three hints.", "icon-bulb", "Pause after each hint and derive the next move."),
      step("decision", "Did you solve it?", 0, "Choose your path.", "Answer honestly.", "icon-question", "The roadmap updates from here."),
      step("compare", "Compare w/ Optimal", 5, "Compare approaches.", "Understand why optimal is better.", "icon-zap", "Identify the data structure doing the work."),
      step("learn", "Learn Solution", 20, "Learn the missing idea.", "Apply it yourself.", "icon-book", "Learn and apply the solution."),
      step("analyze", "Analyze", 3, "Understand your code and clean it.", "", "icon-search", "Remove unnecessary conditions."),
      step("notes", "Notes", 2, "Write the pattern.", "Record what made it work.", "icon-note", "Write the failure mode that taught you.")
    ]
  };

  const themes = [
    ["midnight", "Midnight", ["#070b14", "#5157ff", "#37da7e"]],
    ["gotham", "Gotham", ["#050b0d", "#2dd4bf", "#3b82f6"]],
    ["sakura", "Sakura", ["#1a120d", "#f2b16a", "#f7dfbd"]],
    ["matcha", "Matcha", ["#09110c", "#8bd450", "#35c287"]],
    ["batman", "Batman", ["#030405", "#f5c542", "#1c2430"]],
    ["ironman", "Ironman", ["#090909", "#d71920", "#f4c542"]]
  ];

  const thresholds = [20, 25, 30, 35, 40, 45, 60];
  const breakDurations = [5, 10, 15];
  const branchAfterDecision = { yes: ["compare", "analyze", "notes"], no: ["learn", "analyze", "notes"] };

  const defaultState = {
    difficulty: "easy",
    theme: "midnight",
    timers: {},
    customSteps: [],
    currentIndex: 0,
    remaining: 2 * 60,
    running: false,
    completedIds: [],
    decision: null,
    sessionComplete: false,
    focusTime: 0,
    sound: true,
    pinned: false,
    hintsUsed: 0,
    breakThreshold: 30,
    breakDuration: 5,
    settingsVersion: 3,
    stats: { date: dayKey(), week: weekKey(), todayFocus: 0, weekFocus: 0, streak: 0 },
    breakPending: false,
    breakActive: false,
    breakRemaining: 0,
    nickname: ""
  };

  let state = loadState();
  let tickHandle = null;
  let breakHandle = null;
  let pipWindow = null;
  let cloudSaveHandle = null;
  const cloud = {
    configured: false,
    ready: false,
    loading: false,
    suppressSave: false,
    user: null,
    auth: null,
    db: null,
    authApi: null,
    firestore: null
  };

  const $ = (selector) => document.querySelector(selector);
  const els = {
    difficultyGrid: $("#difficultyGrid"),
    estimatedTime: $("#estimatedTime"),
    solvedBadge: $("#solvedBadge"),
    roadmap: $("#roadmap"),
    timerContent: $("#timerContent"),
    decisionScreen: $("#decisionScreen"),
    stepHeroIcon: $("#stepHeroIcon"),
    stepTitle: $("#stepTitle"),
    stepPurpose: $("#stepPurpose"),
    stepSubtitle: $("#stepSubtitle"),
    hintHearts: $("#hintHearts"),
    timeReadout: $("#timeReadout"),
    stepDuration: $("#stepDuration"),
    progressFill: $("#progressFill"),
    toggleRun: $("#toggleRun"),
    skipStep: $("#skipStep"),
    resetStep: $("#resetStep"),
    tipText: $("#tipText"),
    workspaceDrawer: $("#workspaceDrawer"),
    backdrop: $("#backdrop"),
    drawerTitle: $("#drawerTitle"),
    themeList: $("#themeList"),
    timerSettings: $("#timerSettings"),
    customForm: $("#customForm"),
    customName: $("#customName"),
    customDuration: $("#customDuration"),
    customPosition: $("#customPosition"),
    customList: $("#customList"),
    breakThreshold: $("#breakThreshold"),
    breakDuration: $("#breakDuration"),
    breakModal: $("#breakModal"),
    breakFocused: $("#breakFocused"),
    breakCount: $("#breakCount"),
    todayTimeStat: $("#todayTimeStat"),
    weekTimeStat: $("#weekTimeStat"),
    streakStat: $("#streakStat"),
    pinBtn: $("#pinBtn"),
    miniClock: $("#miniClock"),
    miniClockStep: $("#miniClockStep"),
    miniClockTime: $("#miniClockTime"),
    miniProgressFill: $("#miniProgressFill"),
    miniStepDuration: $("#miniStepDuration"),
    miniHearts: $("#miniHearts"),
    miniToggleRun: $("#miniToggleRun"),
    miniSkipStep: $("#miniSkipStep"),
    miniPipBack: $("#miniPipBack"),
    applyBreakSettings: $("#applyBreakSettings"),
    doneToast: $("#doneToast"),
    nextQuestionBtn: $("#nextQuestionBtn"),
    welcomeName: $("#welcomeName"),
    nicknameInput: $("#nicknameInput"),
    authStatus: $("#authStatus"),
    syncStatus: $("#syncStatus"),
    authGoogleSignIn: $("#authGoogleSignIn"),
    authSignOut: $("#authSignOut")
  };

  function step(id, name, minutes, purpose, subtitle, detailOrIcon, iconOrTip, maybeTip) {
    const hasDetail = !String(detailOrIcon).startsWith("icon-");
    return {
      id,
      name,
      minutes,
      purpose,
      subtitle: hasDetail ? detailOrIcon : subtitle,
      icon: hasDetail ? iconOrTip : detailOrIcon,
      tip: hasDetail ? maybeTip : iconOrTip
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const savedTheme = localStorage.getItem(THEME_KEY);
      return normalizeState({ ...defaultState, ...(saved || {}), ...(savedTheme ? { theme: savedTheme } : {}) });
    } catch {
      const savedTheme = localStorage.getItem(THEME_KEY);
      return normalizeState({ ...defaultState, ...(savedTheme ? { theme: savedTheme } : {}) });
    }
  }

  function normalizeState(next) {
    next.timers = next.timers || {};
    next.customSteps = Array.isArray(next.customSteps) ? next.customSteps : [];
    next.completedIds = Array.isArray(next.completedIds) ? next.completedIds : [];
    next.sessionComplete = Boolean(next.sessionComplete);
    if (!Number.isFinite(next.settingsVersion)) next.settingsVersion = 0;
    if (next.settingsVersion < 3) {
      next.timers["hard:solve"] = 20;
      next.timers["hard:hints"] = 25;
      next.timers["hard:learn"] = 20;
      next.settingsVersion = 3;
    }
    if (!Number.isFinite(next.hintsUsed)) next.hintsUsed = 0;
    next.hintsUsed = Math.max(0, Math.min(3, next.hintsUsed));
    next.nickname = normalizeNickname(next.nickname || "");
    const hadLegacyStats = next.stats && (
      Object.prototype.hasOwnProperty.call(next.stats, "today") ||
      Object.prototype.hasOwnProperty.call(next.stats, "weeklyGoal")
    );
    next.stats = hadLegacyStats ? { ...defaultState.stats } : { ...defaultState.stats, ...(next.stats || {}) };
    if (next.stats.todayFocusSeconds == null && Number.isFinite(next.stats.todayFocus)) next.stats.todayFocusSeconds = next.stats.todayFocus * 60;
    if (next.stats.weekFocusSeconds == null && Number.isFinite(next.stats.weekFocus)) next.stats.weekFocusSeconds = next.stats.weekFocus * 60;
    if (!Number.isFinite(next.stats.todayFocusSeconds)) next.stats.todayFocusSeconds = 0;
    if (!Number.isFinite(next.stats.weekFocusSeconds)) next.stats.weekFocusSeconds = 0;
    if (!Number.isFinite(next.stats.todayFocus)) next.stats.todayFocus = 0;
    if (!Number.isFinite(next.stats.weekFocus)) next.stats.weekFocus = 0;
    if (!Number.isFinite(next.stats.streak)) next.stats.streak = 0;
    if (next.stats.date !== dayKey()) {
      next.stats.date = dayKey();
      next.stats.todayFocus = 0;
      next.stats.todayFocusSeconds = 0;
    }
    if (next.stats.week !== weekKey()) {
      next.stats.week = weekKey();
      next.stats.weekFocus = 0;
      next.stats.weekFocusSeconds = 0;
    }
    if (hadLegacyStats) {
      next.currentIndex = 0;
      next.completedIds = [];
      next.decision = null;
      next.focusTime = 0;
      next.hintsUsed = 0;
      next.breakActive = false;
      next.breakPending = false;
      next.breakRemaining = 0;
    }
    if (!baseWorkflows[next.difficulty]) next.difficulty = "easy";
    if (!themes.some(([id]) => id === next.theme)) {
      next.theme = next.theme === "paper" || next.theme === "amoled" ? "batman" : next.theme === "create" ? "ironman" : "midnight";
    }
    next.running = false;
    const workflow = getWorkflow(next);
    if (next.currentIndex >= workflow.length) next.currentIndex = 0;
    if (hadLegacyStats || !Number.isFinite(next.remaining) || next.remaining < 0) {
      next.remaining = getDurationSeconds(workflow[next.currentIndex], next);
    }
    return next;
  }

  function save() {
    const payload = serializeState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(THEME_KEY, payload.theme);
    scheduleCloudSave();
  }

  function serializeState(source = state) {
    return {
      ...source,
      running: false,
      pinned: false,
      breakActive: false,
      breakRemaining: 0
    };
  }

  function getWorkflow(source = state) {
    const base = baseWorkflows[source.difficulty].map((item) => ({ ...item }));
    const activeIds = source.decision ? ["read", "solve", "hints", ...branchAfterDecision[source.decision]] : base.map((item) => item.id);
    let filtered = base.filter((item) => activeIds.includes(item.id));
    source.customSteps
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((custom) => {
        const insertAt = Math.max(0, filtered.findIndex((item) => item.id === custom.afterId) + 1);
        filtered.splice(insertAt || filtered.length, 0, {
          id: custom.id,
          name: custom.name,
          minutes: custom.minutes,
          purpose: "Custom focus step.",
          subtitle: "Keep it intentional.",
          icon: "icon-clock",
          tip: "Use custom steps for small rituals that help you reset."
        });
      });
    return filtered;
  }

  function timerKey(stepId, source = state) {
    return `${source.difficulty}:${stepId}`;
  }

  function getDurationMinutes(item, source = state) {
    return source.timers[timerKey(item.id, source)] ?? item.minutes;
  }

  function getDurationSeconds(item, source = state) {
    return Math.max(0, getDurationMinutes(item, source) * 60);
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    const mins = String(Math.floor(safe / 60)).padStart(2, "0");
    const secs = String(safe % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function getElapsedSeconds(item) {
    if (!item || item.id === "decision") return 0;
    const duration = getDurationSeconds(item);
    return Math.max(0, Math.min(duration, duration - state.remaining));
  }

  function init() {
    document.documentElement.dataset.theme = state.theme;
    renderAll();
    bindEvents();
    initCloudSync();
    if (state.running) startTimer();
    if (state.breakActive) showBreakModal(true);
  }

  function renderAll() {
    skipZeroDurationSteps();
    const workflow = getWorkflow();
    if (state.currentIndex >= workflow.length) state.currentIndex = 0;
    renderDifficulty();
    renderRoadmap(workflow);
    renderTimer(workflow);
    renderWorkspace();
    renderStats();
    renderTopButtons();
    renderAccount();
    save();
  }

  function renderDifficulty() {
    els.difficultyGrid.innerHTML = ["easy", "medium", "hard"].map((id) => (
      `<button class="difficulty-btn ${id} ${state.difficulty === id ? "active" : ""}" data-difficulty="${id}">${title(id)}</button>`
    )).join("");
  }

  function renderRoadmap(workflow) {
    const total = workflow.reduce((sum, item) => sum + getDurationMinutes(item), 0);
    els.estimatedTime.textContent = `~ ${total} min`;
    els.solvedBadge.textContent = state.decision === "yes" ? "(Solved)" : "";
    els.roadmap.innerHTML = workflow.map((item, index) => {
      const status = state.completedIds.includes(item.id) ? "completed" : index === state.currentIndex ? "current" : "";
      const minutes = getDurationMinutes(item);
      return `<div class="step-row ${status}" data-index="${index}">
        <span class="node">${status === "completed" ? "✓" : ""}</span>
        <span class="step-icon"><svg><use href="#${item.icon}"></use></svg></span>
        <span class="step-name">${index + 1}. ${escapeHtml(item.name)}</span>
        <span class="mini-editor" data-step-id="${item.id}">
          <button data-delta="-1" title="Decrease">−</button>
          <span>${minutes}</span>
          <button data-delta="1" title="Increase">+</button>
        </span>
        <span class="step-min">min</span>
      </div>`;
    }).join("");
  }

  function renderTimer(workflow) {
    const item = workflow[state.currentIndex];
    const isDecision = item && item.id === "decision";
    els.timerContent.classList.toggle("hidden", isDecision);
    els.decisionScreen.classList.toggle("hidden", !isDecision);
    if (!item) return;
    els.doneToast.classList.toggle("show", state.sessionComplete);
    els.doneToast.setAttribute("aria-hidden", String(!state.sessionComplete));
    if (isDecision) {
      els.hintHearts.classList.add("hidden");
      els.miniHearts.classList.add("hidden");
      els.miniClockStep.textContent = item.name;
      els.miniClockTime.textContent = "Yes / No";
      els.miniStepDuration.textContent = "--:--";
      els.miniProgressFill.style.width = "0%";
      updatePiP();
      return;
    }

    const duration = getDurationSeconds(item);
    if (state.remaining > duration && duration > 0) state.remaining = duration;
    const elapsed = getElapsedSeconds(item);
    els.stepHeroIcon.innerHTML = `<use href="#${item.icon}"></use>`;
    els.stepTitle.textContent = `${state.currentIndex + 1}. ${item.name}`;
    els.stepPurpose.textContent = item.purpose;
    els.stepSubtitle.textContent = item.subtitle;
    els.stepSubtitle.classList.toggle("hidden", !item.subtitle);
    renderHintHearts(item);
    els.timeReadout.textContent = formatTime(elapsed);
    els.stepDuration.textContent = formatTime(duration);
    els.tipText.textContent = item.tip;
    const progress = duration ? ((duration - state.remaining) / duration) * 100 : 0;
    els.progressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    els.toggleRun.innerHTML = state.running
      ? `<svg><use href="#icon-pause"></use></svg><span>Pause</span>`
      : `<svg><use href="#icon-play"></use></svg><span>Start</span>`;
    els.miniClockStep.textContent = item.name;
    els.miniClockTime.textContent = formatTime(elapsed);
    els.miniStepDuration.textContent = formatTime(duration);
    els.miniProgressFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    els.miniToggleRun.innerHTML = state.running ? `<svg><use href="#icon-pause"></use></svg>` : `<svg><use href="#icon-play"></use></svg>`;
    updatePiP();
  }

  function renderWorkspace() {
    els.themeList.innerHTML = themes.map(([id, name, swatches]) => `<div class="theme-card">
      <div><strong>${name}</strong><div class="swatches">${swatches.map((c) => `<i style="background:${c}"></i>`).join("")}</div></div>
      <button data-theme-id="${id}">${state.theme === id ? "Active" : "Use"}</button>
    </div>`).join("");

    const workflow = getWorkflow();
    els.timerSettings.innerHTML = workflow.filter((item) => item.id !== "decision").map((item) => `<div class="setting-row">
      <span>${escapeHtml(item.name)}</span>
      <span class="mini-editor" data-step-id="${item.id}">
        <button data-delta="-1">−</button><span>${getDurationMinutes(item)}</span><button data-delta="1">+</button>
      </span>
    </div>`).join("");

    const basePositions = baseWorkflows[state.difficulty].filter((item) => item.id !== "decision");
    els.customPosition.innerHTML = basePositions.map((item) => `<option value="${item.id}">After ${escapeHtml(item.name)}</option>`).join("");
    els.customList.innerHTML = state.customSteps.length
      ? state.customSteps.map((item, index) => `<div class="custom-item">
          <div><strong>${escapeHtml(item.name)}</strong><br><small>${item.minutes} min after ${escapeHtml(labelFor(item.afterId))}</small></div>
          <div class="custom-item-controls">
            <button data-custom-move="${item.id}" data-dir="-1" title="Move up">↑</button>
            <button data-custom-move="${item.id}" data-dir="1" title="Move down">↓</button>
            <button data-custom-remove="${item.id}" title="Remove">×</button>
          </div>
        </div>`).join("")
      : `<p class="drawer-copy">No custom steps yet.</p>`;

    if (document.activeElement !== els.breakThreshold) {
      els.breakThreshold.innerHTML = thresholds.map((value) => `<option value="${value}" ${state.breakThreshold === value ? "selected" : ""}>${value} minutes</option>`).join("");
    }
    if (document.activeElement !== els.breakDuration) {
      els.breakDuration.innerHTML = breakDurations.map((value) => `<option value="${value}" ${state.breakDuration === value ? "selected" : ""}>${value} minutes</option>`).join("");
    }
  }

  function renderStats() {
    els.todayTimeStat.textContent = humanSeconds(state.stats.todayFocusSeconds);
    els.weekTimeStat.textContent = humanSeconds(state.stats.weekFocusSeconds);
    els.streakStat.textContent = state.stats.streak;
  }

  function renderTopButtons() {
    els.pinBtn.classList.toggle("active", state.pinned);
    document.body.classList.toggle("is-pinned", state.pinned);
    document.body.classList.toggle("has-real-pip", Boolean(pipWindow && !pipWindow.closed));
    els.miniClock.setAttribute("aria-hidden", String(!state.pinned));
    updatePiP();
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const difficulty = event.target.closest("[data-difficulty]");
      if (difficulty) changeDifficulty(difficulty.dataset.difficulty);

      const deltaBtn = event.target.closest("[data-delta]");
      if (deltaBtn) adjustDuration(deltaBtn.closest("[data-step-id]").dataset.stepId, Number(deltaBtn.dataset.delta));

      const themeBtn = event.target.closest("[data-theme-id]");
      if (themeBtn) setTheme(themeBtn.dataset.themeId);

      const tabBtn = event.target.closest("[data-tab]");
      if (tabBtn) setDrawerTab(tabBtn.dataset.tab);

      const decision = event.target.closest("[data-decision]");
      if (decision) chooseDecision(decision.dataset.decision);

      const removeCustom = event.target.closest("[data-custom-remove]");
      if (removeCustom) removeCustomStep(removeCustom.dataset.customRemove);

      const moveCustom = event.target.closest("[data-custom-move]");
      if (moveCustom) moveCustomStep(moveCustom.dataset.customMove, Number(moveCustom.dataset.dir));
    });

    $("#workspaceBtn").addEventListener("click", () => openDrawer("themes"));
    $("#openCustomStep").addEventListener("click", () => openDrawer("custom"));
    $("#breakBtn").addEventListener("click", () => openDrawer("breaks"));
    $("#closeDrawer").addEventListener("click", closeDrawer);
    els.backdrop.addEventListener("click", closeDrawer);
    $("#resetBtn").addEventListener("click", resetSession);
    $("#factoryReset").addEventListener("click", factoryReset);
    els.toggleRun.addEventListener("click", toggleRun);
    els.skipStep.addEventListener("click", () => completeCurrentStep(false));
    els.resetStep.addEventListener("click", resetCurrentStep);
    els.pinBtn.addEventListener("click", togglePinned);
    $("#fullscreenBtn").addEventListener("click", toggleFullscreen);
    $("#startBreak").addEventListener("click", startBreak);
    $("#skipBreak").addEventListener("click", finishBreak);
    els.applyBreakSettings.addEventListener("click", applyBreakSettings);
    els.customForm.addEventListener("submit", addCustomStep);
    els.miniToggleRun.addEventListener("click", toggleRun);
    els.miniSkipStep.addEventListener("click", () => completeCurrentStep(false));
    els.miniPipBack.addEventListener("click", closeMiniMode);
    els.hintHearts.addEventListener("click", handleHintClick);
    els.miniHearts.addEventListener("click", handleHintClick);
    els.nextQuestionBtn.addEventListener("click", nextQuestion);
    els.nicknameInput.addEventListener("input", updateNickname);
    els.authGoogleSignIn.addEventListener("click", signInWithGoogle);
    els.authSignOut.addEventListener("click", signOutOfCloud);
  }

  function changeDifficulty(difficulty) {
    const was = currentStep();
    state.difficulty = difficulty;
    state.decision = null;
    state.sessionComplete = false;
    state.completedIds = [];
    state.hintsUsed = 0;
    state.currentIndex = Math.min(was?.id === "solve" ? 1 : 0, getWorkflow().length - 1);
    state.remaining = getDurationSeconds(getWorkflow()[state.currentIndex]);
    state.running = false;
    renderAll();
    stopTimer();
  }

  function adjustDuration(stepId, delta) {
    const workflow = getWorkflow();
    const item = workflow.find((candidate) => candidate.id === stepId);
    if (!item || item.id === "decision") return;
    const key = timerKey(stepId);
    const isCurrentStep = currentStep()?.id === stepId;
    const elapsed = isCurrentStep ? getElapsedSeconds(item) : 0;
    const next = Math.max(0, Math.min(90, getDurationMinutes(item) + delta));
    state.timers[key] = next;
    if (isCurrentStep) state.remaining = Math.max(0, (next * 60) - elapsed);
    skipZeroDurationSteps();
    renderAll();
  }

  function setTheme(theme) {
    if (!themes.some(([id]) => id === theme)) return;
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    save();
    renderAll();
  }

  function setDrawerTab(tab) {
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
    els.drawerTitle.textContent = title(tab === "breaks" ? "Break Settings" : tab === "custom" ? "Custom Steps" : tab);
    renderAuthUI();
  }

  function openDrawer(tab) {
    setDrawerTab(tab);
    els.workspaceDrawer.classList.add("open");
    els.workspaceDrawer.setAttribute("aria-hidden", "false");
    els.backdrop.classList.add("show");
  }

  function closeDrawer() {
    els.workspaceDrawer.classList.remove("open");
    els.workspaceDrawer.setAttribute("aria-hidden", "true");
    els.backdrop.classList.remove("show");
  }

  function toggleRun() {
    if (state.sessionComplete) return;
    state.running = !state.running;
    state.running ? startTimer() : stopTimer();
    renderAll();
  }

  function startTimer() {
    stopTimer();
    if (currentStep()?.id === "decision" || state.breakActive) return;
    if (state.remaining <= 0) {
      completeCurrentStep(false);
      return;
    }
    tickHandle = setInterval(() => {
      if (!state.running) return;
      state.remaining -= 1;
      addFocusSecond();
      if (state.remaining <= 0) {
        completeCurrentStep(true);
      } else {
        renderTimer(getWorkflow());
        renderStats();
        save();
      }
    }, 1000);
  }

  function stopTimer() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = null;
  }

  function completeCurrentStep(countFocusTime) {
    const item = currentStep();
    if (!item || item.id === "decision") return;
    const durationSeconds = getDurationSeconds(item);
    markCompleted(item.id);
    if (item.id === "notes") {
      if (!state.sessionComplete) {
        state.stats.streak += 1;
      }
      state.sessionComplete = true;
      state.running = false;
      state.remaining = 0;
      stopTimer();
      notify();
      renderAll();
      return;
    }
    if (item.id === "hints") {
      state.currentIndex = getWorkflow().findIndex((candidate) => candidate.id === "decision");
      state.remaining = 0;
      state.running = false;
      stopTimer();
      notify();
      renderAll();
      return;
    }
    if (item.id !== "hints") state.hintsUsed = 0;
    state.currentIndex = Math.min(state.currentIndex + 1, getWorkflow().length - 1);
    const next = currentStep();
    state.remaining = getDurationSeconds(next);
    notify();
    checkBreakOrContinue(state.running);
  }

  function chooseDecision(value) {
    state.decision = value;
    state.sessionComplete = false;
    state.hintsUsed = 0;
    const workflow = getWorkflow();
    state.currentIndex = workflow.findIndex((item) => item.id === branchAfterDecision[value][0]);
    state.remaining = getDurationSeconds(workflow[state.currentIndex]);
    checkBreakOrContinue(false);
  }

  function checkBreakOrContinue(shouldRun) {
    skipZeroDurationSteps();
    if (state.sessionComplete) {
      renderAll();
      return;
    }
    if (state.focusTime >= state.breakThreshold) {
      state.breakPending = true;
      state.running = false;
      stopTimer();
      renderAll();
      showBreakModal(false);
      return;
    }
    state.running = shouldRun;
    renderAll();
    if (state.running) startTimer();
  }

  function skipZeroDurationSteps() {
    const workflow = getWorkflow();
    while (!state.sessionComplete) {
      const item = workflow[state.currentIndex];
      if (!item || item.id === "decision" || getDurationSeconds(item) > 0) return;
      markCompleted(item.id);
      state.remaining = 0;
      if (item.id === "notes") {
        if (!state.sessionComplete) state.stats.streak += 1;
        state.sessionComplete = true;
        state.running = false;
        stopTimer();
        return;
      }
      if (item.id === "hints") {
        state.currentIndex = workflow.findIndex((candidate) => candidate.id === "decision");
        state.running = false;
        stopTimer();
        return;
      }
      state.hintsUsed = 0;
      if (state.currentIndex >= workflow.length - 1) {
        state.sessionComplete = true;
        state.running = false;
        stopTimer();
        return;
      }
      state.currentIndex = Math.min(state.currentIndex + 1, workflow.length - 1);
      state.remaining = getDurationSeconds(workflow[state.currentIndex]);
    }
  }

  function showBreakModal(resumeExisting) {
    state.breakActive = true;
    state.breakPending = false;
    if (!resumeExisting) state.breakRemaining = state.breakDuration * 60;
    els.breakFocused.textContent = `${state.focusTime} minutes.`;
    els.breakCount.textContent = state.breakRemaining ? formatTime(state.breakRemaining) : "";
    els.breakModal.classList.remove("hidden");
    save();
  }

  function startBreak() {
    if (!state.breakRemaining) state.breakRemaining = state.breakDuration * 60;
    if (breakHandle) clearInterval(breakHandle);
    breakHandle = setInterval(() => {
      state.breakRemaining -= 1;
      els.breakCount.textContent = formatTime(state.breakRemaining);
      save();
      if (state.breakRemaining <= 0) finishBreak();
    }, 1000);
  }

  function finishBreak() {
    if (breakHandle) clearInterval(breakHandle);
    breakHandle = null;
    state.breakActive = false;
    state.breakRemaining = 0;
    state.focusTime = 0;
    state.running = false;
    els.breakModal.classList.add("hidden");
    renderAll();
    stopTimer();
  }

  function resetCurrentStep() {
    const item = currentStep();
    if (!item || item.id === "decision") return;
    state.remaining = getDurationSeconds(item);
    renderAll();
  }

  function resetSession() {
    state.completedIds = [];
    state.decision = null;
    state.sessionComplete = false;
    state.hintsUsed = 0;
    state.currentIndex = 0;
    state.focusTime = 0;
    state.remaining = getDurationSeconds(getWorkflow()[0]);
    state.running = false;
    renderAll();
    stopTimer();
  }

  function factoryReset() {
    stopTimer();
    if (breakHandle) clearInterval(breakHandle);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(THEME_KEY);
    state = normalizeState({ ...defaultState });
    document.documentElement.dataset.theme = state.theme;
    els.breakModal.classList.add("hidden");
    els.doneToast.classList.remove("show");
    closeDrawer();
    renderAll();
    stopTimer();
  }

  function addCustomStep(event) {
    event.preventDefault();
    const name = els.customName.value.trim();
    const minutes = Number(els.customDuration.value);
    if (!name || !Number.isFinite(minutes)) return;
    state.customSteps.push({
      id: `custom-${Date.now()}`,
      name,
      minutes: Math.max(0, Math.min(60, minutes)),
      afterId: els.customPosition.value,
      order: Date.now()
    });
    els.customForm.reset();
    els.customDuration.value = 3;
    renderAll();
  }

  function removeCustomStep(id) {
    state.customSteps = state.customSteps.filter((item) => item.id !== id);
    renderAll();
  }

  function moveCustomStep(id, dir) {
    const index = state.customSteps.findIndex((item) => item.id === id);
    const next = index + dir;
    if (index < 0 || next < 0 || next >= state.customSteps.length) return;
    const copy = state.customSteps.slice();
    [copy[index], copy[next]] = [copy[next], copy[index]];
    copy.forEach((item, order) => item.order = order);
    state.customSteps = copy;
    renderAll();
  }

  function toggleSound() {
    state.sound = !state.sound;
    if (state.sound) notify();
    renderAll();
  }

  async function togglePinned() {
    if (!state.pinned) {
      state.pinned = true;
      await openPictureInPicture();
    } else {
      closeMiniMode();
    }
    renderAll();
  }

  function closeMiniMode() {
    state.pinned = false;
    if (pipWindow && !pipWindow.closed) pipWindow.close();
    pipWindow = null;
    renderAll();
  }

  async function openPictureInPicture() {
    if (!("documentPictureInPicture" in window)) {
      showMiniFallbackMessage("Floating mini is blocked here, so mini opened on the page.");
      return;
    }
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({ width: 220, height: 220 });
      pipWindow.document.title = "Problem Clock";
      pipWindow.document.body.innerHTML = `
        <style>
          :root { color-scheme: dark; }
          * { box-sizing: border-box; }
          html { overflow: hidden; }
          body {
            margin: 0;
            width: 100vw;
            height: 100vh;
            display: grid;
            place-items: center;
            background: var(--pip-bg);
            color: #f6f7fb;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            overflow: hidden;
          }
          .pip-card {
            width: 100vw;
            height: 100vh;
            display: grid;
            align-content: center;
            justify-items: stretch;
            gap: 9px;
            padding: 16px;
            background:
              radial-gradient(circle at 80% 18%, var(--pip-soft), transparent 34%),
              linear-gradient(180deg, var(--pip-surface-strong), var(--pip-surface));
          }
          .pip-step {
            color: var(--pip-primary);
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .pip-time {
            font-size: 38px;
            line-height: 1;
            font-weight: 780;
            font-variant-numeric: tabular-nums;
            text-align: center;
          }
          .pip-progress-row {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 8px;
          }
          .pip-track {
            height: 7px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(70, 88, 118, .25);
          }
          .pip-fill {
            width: 0;
            height: 100%;
            border-radius: inherit;
            background: linear-gradient(90deg, var(--pip-primary), var(--pip-primary-2));
            box-shadow: 0 0 14px var(--pip-primary);
          }
          .pip-total {
            color: #aab2c4;
            font-size: 11px;
            font-variant-numeric: tabular-nums;
          }
          .pip-hearts { display: none; gap: 6px; }
          .pip-hearts.show { display: flex; }
          .pip-hearts button {
            border: 0;
            padding: 0;
            width: 20px;
            height: 20px;
            transform: none;
            background: transparent;
            box-shadow: none;
            color: #ff4d6d;
            font-size: 20px;
            line-height: 1;
            cursor: pointer;
          }
          .pip-hearts button::before {
            content: "♡";
          }
          .pip-hearts button.used::before {
            content: "♥";
            text-shadow: 0 0 14px rgba(255, 77, 109, .55);
          }
          .pip-actions { display: flex; gap: 7px; margin-top: 2px; }
          .pip-actions.hidden,
          .pip-progress-row.hidden,
          .pip-decision.hidden,
          .pip-complete.hidden {
            display: none;
          }
          .pip-decision {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
          }
          .pip-decision button:first-child {
            background: #42d77b;
            color: #04110a;
            border-color: transparent;
            font-weight: 800;
          }
          .pip-decision button:last-child {
            background: #f43f5e;
            border-color: transparent;
            font-weight: 800;
          }
          .pip-complete {
            display: grid;
            gap: 10px;
            text-align: center;
          }
          .pip-complete strong {
            color: var(--pip-primary);
            font-size: 15px;
          }
          .pip-complete button {
            background: linear-gradient(135deg, var(--pip-primary), var(--pip-primary-2));
            border-color: transparent;
            font-weight: 800;
          }
          button {
            flex: 1;
            height: 31px;
            border: 1px solid #27395d;
            border-radius: 8px;
            background: rgba(255,255,255,.04);
            color: #f6f7fb;
            font: inherit;
            cursor: pointer;
          }
          .pip-hearts button {
            flex: none;
            width: 20px;
            height: 20px;
            border: 0;
            background: transparent;
            color: #ff4d6d;
            font-size: 20px;
            line-height: 1;
          }
        </style>
        <div class="pip-card">
          <div class="pip-step" id="pipStep"></div>
          <div class="pip-time" id="pipTime"></div>
          <div class="pip-progress-row" id="pipProgressRow">
            <div class="pip-track"><div class="pip-fill" id="pipProgress"></div></div>
            <div class="pip-total" id="pipTotal">02:00</div>
          </div>
          <div class="pip-hearts" id="pipHearts">
            <button data-hint="1" title="Use hint 1"></button>
            <button data-hint="2" title="Use hint 2"></button>
            <button data-hint="3" title="Use hint 3"></button>
          </div>
          <div class="pip-decision hidden" id="pipDecision">
            <button data-pip-decision="yes">Yes</button>
            <button data-pip-decision="no">No</button>
          </div>
          <div class="pip-complete hidden" id="pipComplete">
            <strong>Question complete.</strong>
            <button id="pipNextQuestion">Next Question</button>
          </div>
          <div class="pip-actions" id="pipActions">
            <button id="pipToggle">Start</button>
            <button id="pipSkip">Skip</button>
            <button id="pipClose">Back</button>
          </div>
        </div>`;
      pipWindow.document.querySelector("#pipToggle").addEventListener("click", () => {
        toggleRun();
        updatePiP();
      });
      pipWindow.document.querySelector("#pipSkip").addEventListener("click", () => {
        completeCurrentStep(false);
        updatePiP();
      });
      pipWindow.document.querySelector("#pipClose").addEventListener("click", closeMiniMode);
      pipWindow.document.querySelector("#pipHearts").addEventListener("click", handleHintClick);
      pipWindow.document.querySelector("#pipDecision").addEventListener("click", (event) => {
        const button = event.target.closest("[data-pip-decision]");
        if (!button) return;
        chooseDecision(button.dataset.pipDecision);
        updatePiP();
      });
      pipWindow.document.querySelector("#pipNextQuestion").addEventListener("click", nextQuestion);
      pipWindow.addEventListener("pagehide", () => {
        pipWindow = null;
        if (state.pinned) {
          state.pinned = false;
          renderAll();
        }
      });
      document.body.classList.add("has-real-pip");
      updatePiP();
    } catch {
      pipWindow = null;
      showMiniFallbackMessage("Floating mini was blocked, so mini opened on the page.");
    }
  }

  function updatePiP() {
    const item = currentStep();
    const isHint = item?.id === "hints";
    const isDecision = item?.id === "decision";
    els.miniHearts.classList.toggle("hidden", !isHint);
    if (!pipWindow || pipWindow.closed || !item) return;
    applyPiPTheme();
    pipWindow.document.querySelector("#pipStep").textContent = item.name;
    pipWindow.document.querySelector("#pipTime").textContent = state.sessionComplete ? "Done" : isDecision ? "Yes / No" : formatTime(getElapsedSeconds(item));
    const duration = isDecision ? 0 : getDurationSeconds(item);
    const progress = duration ? ((duration - state.remaining) / duration) * 100 : 0;
    pipWindow.document.querySelector("#pipProgress").style.width = `${Math.max(0, Math.min(100, progress))}%`;
    pipWindow.document.querySelector("#pipTotal").textContent = duration ? formatTime(duration) : "--:--";
    pipWindow.document.querySelector("#pipToggle").textContent = state.running ? "Pause" : "Start";
    pipWindow.document.querySelector("#pipHearts").classList.toggle("show", isHint);
    pipWindow.document.querySelector("#pipProgressRow").classList.toggle("hidden", isDecision || state.sessionComplete);
    pipWindow.document.querySelector("#pipActions").classList.toggle("hidden", isDecision || state.sessionComplete);
    pipWindow.document.querySelector("#pipDecision").classList.toggle("hidden", !isDecision || state.sessionComplete);
    pipWindow.document.querySelector("#pipComplete").classList.toggle("hidden", !state.sessionComplete);
    pipWindow.document.querySelectorAll("#pipHearts button").forEach((button) => {
      button.classList.toggle("used", Number(button.dataset.hint) <= state.hintsUsed);
    });
  }

  function renderHintHearts(item) {
    const show = item.id === "hints";
    els.hintHearts.classList.toggle("hidden", !show);
    els.miniHearts.classList.toggle("hidden", !show);
    [els.hintHearts, els.miniHearts].forEach((group) => {
      group.querySelectorAll("button").forEach((button) => {
        button.classList.toggle("used", Number(button.dataset.hint) <= state.hintsUsed);
      });
    });
  }

  function applyBreakSettings() {
    state.breakThreshold = Number(els.breakThreshold.value);
    state.breakDuration = Number(els.breakDuration.value);
    els.applyBreakSettings.classList.add("applied");
    els.applyBreakSettings.textContent = "Applied";
    window.setTimeout(() => {
      els.applyBreakSettings.classList.remove("applied");
      els.applyBreakSettings.textContent = "Apply Change";
    }, 950);
    renderAll();
  }

  function handleHintClick(event) {
    const button = event.target.closest("[data-hint]");
    if (!button || currentStep()?.id !== "hints") return;
    state.hintsUsed = Number(button.dataset.hint);
    renderAll();
  }

  function addFocusSecond() {
    state.focusTime += 1 / 60;
    state.stats.todayFocusSeconds += 1;
    state.stats.weekFocusSeconds += 1;
    state.stats.todayFocus = Math.floor(state.stats.todayFocusSeconds / 60);
    state.stats.weekFocus = Math.floor(state.stats.weekFocusSeconds / 60);
  }

  function nextQuestion() {
    stopTimer();
    state.completedIds = [];
    state.decision = null;
    state.sessionComplete = false;
    state.hintsUsed = 0;
    state.currentIndex = 0;
    state.remaining = getDurationSeconds(getWorkflow()[0]);
    state.running = false;
    els.doneToast.classList.remove("show");
    els.doneToast.setAttribute("aria-hidden", "true");
    renderAll();
  }

  async function initCloudSync() {
    const config = window.PROBLEM_CLOCK_FIREBASE_CONFIG;
    cloud.configured = Boolean(config && config.apiKey && config.projectId);
    renderAuthUI();
    if (!cloud.configured) return;
    try {
      cloud.loading = true;
      renderAuthUI("Loading Firebase sync...");
      const [appMod, authMod, firestoreMod] = await Promise.all([
        import(FIREBASE_IMPORTS.app),
        import(FIREBASE_IMPORTS.auth),
        import(FIREBASE_IMPORTS.firestore)
      ]);
      const app = appMod.initializeApp(config);
      cloud.auth = authMod.getAuth(app);
      cloud.db = firestoreMod.getFirestore(app);
      cloud.authApi = authMod;
      cloud.firestore = firestoreMod;
      cloud.ready = true;
      authMod.onAuthStateChanged(cloud.auth, async (user) => {
        cloud.user = user;
        if (user) {
          await loadCloudState();
        } else {
          renderAuthUI();
        }
      });
    } catch {
      cloud.ready = false;
      renderAuthUI("Firebase could not load. Local save is still working.");
    } finally {
      cloud.loading = false;
      renderAuthUI();
    }
  }

  async function signInWithGoogle() {
    if (!cloud.ready || !cloud.authApi) {
      renderAuthUI("Add Firebase config first, then redeploy.");
      return;
    }
    try {
      renderAuthUI("Opening Google sign in...");
      const provider = new cloud.authApi.GoogleAuthProvider();
      await cloud.authApi.signInWithPopup(cloud.auth, provider);
    } catch (error) {
      renderAuthUI(cleanFirebaseMessage(error));
    }
  }

  function updateNickname() {
    const nickname = normalizeNickname(els.nicknameInput.value);
    state.nickname = nickname;
    els.nicknameInput.value = nickname;
    renderAccount();
    save();
  }

  async function signOutOfCloud() {
    if (!cloud.ready || !cloud.authApi) return;
    await cloud.authApi.signOut(cloud.auth);
    cloud.user = null;
    renderAuthUI("Signed out. This browser will keep saving locally.");
  }

  async function loadCloudState() {
    if (!cloud.ready || !cloud.user) return;
    try {
      renderAuthUI("Loading synced progress...");
      const ref = cloudStateRef();
      const snap = await cloud.firestore.getDoc(ref);
      if (snap.exists() && snap.data()?.state) {
        cloud.suppressSave = true;
        state = normalizeState({ ...defaultState, ...snap.data().state });
        document.documentElement.dataset.theme = state.theme;
        cloud.suppressSave = false;
        renderAll();
      } else {
        await saveCloudState();
      }
      renderAuthUI("Synced with your account.");
    } catch {
      cloud.suppressSave = false;
      renderAuthUI("Could not load cloud progress. Local save is still working.");
    }
  }

  function scheduleCloudSave() {
    if (cloud.suppressSave || !cloud.ready || !cloud.user) return;
    if (cloudSaveHandle) clearTimeout(cloudSaveHandle);
    cloudSaveHandle = window.setTimeout(saveCloudState, 650);
  }

  async function saveCloudState() {
    if (!cloud.ready || !cloud.user) return;
    try {
      const ref = cloudStateRef();
      await cloud.firestore.setDoc(ref, {
        state: serializeState(),
        updatedAt: cloud.firestore.serverTimestamp()
      }, { merge: true });
      renderAuthUI("Synced just now.");
    } catch {
      renderAuthUI("Cloud save failed. Local save is still working.");
    }
  }

  function cloudStateRef() {
    return cloud.firestore.doc(cloud.db, "users", cloud.user.uid, "state", "current");
  }

  function renderAuthUI(message) {
    if (!els.authStatus || !els.syncStatus) return;
    const signedIn = Boolean(cloud.user);
    els.authStatus.textContent = signedIn ? "Signed in" : cloud.configured ? "Account sync" : "Local only";
    els.syncStatus.textContent = message || (signedIn
      ? `Saving as ${cloud.user.email || "your account"}`
      : cloud.configured
        ? "Sign in to sync across browsers and devices."
        : "Firebase sync is not configured.");
    els.authGoogleSignIn.disabled = signedIn || cloud.loading || !cloud.configured;
    els.authGoogleSignIn.classList.toggle("hidden", signedIn);
    els.authSignOut.classList.toggle("hidden", !signedIn);
    renderAccount();
  }

  function renderAccount() {
    if (!els.nicknameInput || !els.welcomeName) return;
    if (document.activeElement !== els.nicknameInput) {
      els.nicknameInput.value = state.nickname || "";
    }
    const showWelcome = Boolean(cloud.user && state.nickname);
    els.welcomeName.textContent = showWelcome ? `wlcm @${state.nickname}` : "";
    els.welcomeName.classList.toggle("hidden", !showWelcome);
  }

  function normalizeNickname(value) {
    return String(value || "")
      .trim()
      .replace(/^@+/, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 18);
  }

  function cleanFirebaseMessage(error) {
    const code = error?.code ? error.code.replace("auth/", "").replaceAll("-", " ") : "Firebase error";
    return code.charAt(0).toUpperCase() + code.slice(1) + ".";
  }

  function showMiniFallbackMessage(message) {
    els.pinBtn.title = message;
    window.setTimeout(() => {
      els.pinBtn.title = "Mini clock";
    }, 2500);
  }

  function applyPiPTheme() {
    if (!pipWindow || pipWindow.closed) return;
    const styles = getComputedStyle(document.documentElement);
    const root = pipWindow.document.documentElement;
    root.style.setProperty("--pip-bg", styles.getPropertyValue("--bg").trim());
    root.style.setProperty("--pip-surface", styles.getPropertyValue("--surface").trim());
    root.style.setProperty("--pip-surface-strong", styles.getPropertyValue("--surface-strong").trim());
    root.style.setProperty("--pip-primary", styles.getPropertyValue("--primary").trim());
    root.style.setProperty("--pip-primary-2", styles.getPropertyValue("--primary-2").trim());
    root.style.setProperty("--pip-soft", styles.getPropertyValue("--primary-soft").trim());
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function notify() {
    if (!state.sound) return;
    try {
      const audio = new (window.AudioContext || window.webkitAudioContext)();
      const gain = audio.createGain();
      const osc = audio.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.14, audio.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.28);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.3);
    } catch {}
  }

  function currentStep() {
    return getWorkflow()[state.currentIndex];
  }

  function markCompleted(id) {
    if (!state.completedIds.includes(id)) state.completedIds.push(id);
  }

  function title(value) {
    return value.charAt(0).toUpperCase() + value.slice(1).replace(/([A-Z])/g, " $1");
  }

  function humanMinutes(minutes) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  function humanSeconds(seconds) {
    const safe = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  function labelFor(id) {
    return baseWorkflows[state.difficulty].find((item) => item.id === id)?.name || "workflow";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  init();
})();
