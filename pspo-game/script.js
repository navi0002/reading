/*
  PSPO Scrum Game
  - Core loop: Plan Sprint -> Run Scenario -> Complete Sprint -> Update Metrics
  - Backlog ordering challenge and discovery work
  - Metrics inspired by Evidence-Based Management (Value, Learning) and predictability
*/

/** @typedef {{
 *  id: string,
 *  title: string,
 *  effort: number, // points
 *  value: number,  // outcome value
 *  risk: number,   // risk (0-1)
 *  type: 'feature'|'bug'|'tech'|'discovery',
 *  refine: number // 0-1 reduces risk on refine
 * }} BacklogItem */

/** @typedef {{
 *  sprintNumber: number,
 *  capacity: number,
 *  plannedPoints: number,
 *  completedPoints: number,
 *  velocityHistory: number[],
 *  value: number,
 *  learning: number,
 *  predictability: number,
 *  backlog: BacklogItem[],
 *  sprintPlan: string[], // item ids
 *  rngSeed: number
 * }} GameState */

const dom = {
  backlogList: document.getElementById('backlog-list'),
  sprintPlan: document.getElementById('sprint-plan'),
  btnNewGame: document.getElementById('btn-new-game'),
  btnStart: document.getElementById('btn-start-sprint'),
  btnComplete: document.getElementById('btn-complete-sprint'),
  btnRefine: document.getElementById('btn-refine'),
  btnAddDiscovery: document.getElementById('btn-add-discovery'),
  btnAutoPlan: document.getElementById('btn-auto-plan'),
  btnClearPlan: document.getElementById('btn-clear-plan'),
  metrics: {
    value: document.getElementById('metric-value'),
    learning: document.getElementById('metric-learning'),
    predictability: document.getElementById('metric-predictability'),
    sprint: document.getElementById('metric-sprint'),
    capacity: document.getElementById('stat-capacity'),
    planned: document.getElementById('stat-planned'),
    velocity: document.getElementById('stat-velocity'),
    meterValue: document.getElementById('meter-value'),
    meterLearning: document.getElementById('meter-learning'),
    meterPredictability: document.getElementById('meter-predictability'),
    meterSprint: document.getElementById('meter-sprint'),
  },
  scenarioDialog: /** @type {HTMLDialogElement} */ (document.getElementById('scenario-dialog')),
  scenarioTitle: document.getElementById('scenario-title'),
  scenarioText: document.getElementById('scenario-text'),
  scenarioChoices: document.getElementById('scenario-choices'),
  summaryDialog: /** @type {HTMLDialogElement} */ (document.getElementById('summary-dialog')),
  summaryContent: document.getElementById('summary-content'),
};

const STORAGE_KEY = 'pspo-scrum-game-v1';

function seededRandom(seed) {
  // Mulberry32 PRNG
  let t = seed + 0x6D2B79F5;
  return function() {
    t |= 0; t = t + 0x6D2B79F5 | 0; let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  }
}

/** @returns {BacklogItem[]} */
function generateInitialBacklog(rng) {
  const ideas = [
    ['Onboarding checklist', 5, 9, 0.25, 'feature'],
    ['Performance telemetry', 8, 7, 0.35, 'tech'],
    ['Payment SCA fix', 3, 8, 0.3, 'bug'],
    ['Recommendation engine', 13, 10, 0.55, 'feature'],
    ['Customer interview round', 5, 5, 0.1, 'discovery'],
    ['Search relevance tuning', 8, 8, 0.45, 'feature'],
    ['Refactor CI pipeline', 5, 4, 0.2, 'tech'],
    ['Mobile crash fix', 3, 6, 0.25, 'bug'],
    ['A/B test pricing', 8, 9, 0.4, 'discovery'],
  ];
  return ideas.map((row, idx) => ({
    id: `I${idx+1}`,
    title: row[0],
    effort: row[1],
    value: row[2],
    risk: row[3],
    type: /** @type {BacklogItem['type']} */ (row[4]),
    refine: 0,
  })).sort((a, b) => (b.value - a.value) - 0.2 * (b.risk - a.risk));
}

/** @returns {GameState} */
function newGameState() {
  const seed = Math.floor(Math.random() * 1e9);
  const rng = seededRandom(seed);
  const capacity = 20;
  return {
    sprintNumber: 1,
    capacity,
    plannedPoints: 0,
    completedPoints: 0,
    velocityHistory: [],
    value: 0,
    learning: 0,
    predictability: 50,
    backlog: generateInitialBacklog(rng),
    sprintPlan: [],
    rngSeed: seed,
  };
}

/** @type {GameState} */
let state = loadState() ?? newGameState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function render() {
  // Metrics
  dom.metrics.value.textContent = String(state.value);
  dom.metrics.learning.textContent = String(state.learning);
  dom.metrics.predictability.textContent = String(Math.round(state.predictability));
  dom.metrics.sprint.textContent = String(state.sprintNumber);
  dom.metrics.capacity.textContent = String(state.capacity);
  dom.metrics.planned.textContent = String(state.plannedPoints);
  const avgVelocity = state.velocityHistory.length ? Math.round(state.velocityHistory.reduce((a,b)=>a+b,0)/state.velocityHistory.length) : 0;
  dom.metrics.velocity.textContent = String(avgVelocity);
  dom.metrics.meterValue.style.width = `${Math.min(100, state.value)}%`;
  dom.metrics.meterLearning.style.width = `${Math.min(100, state.learning)}%`;
  dom.metrics.meterPredictability.style.width = `${Math.max(0, Math.min(100, state.predictability))}%`;
  dom.metrics.meterSprint.style.width = `${Math.min(100, (state.sprintNumber/10)*100)}%`;

  // Backlog
  dom.backlogList.innerHTML = '';
  for (const item of state.backlog) {
    dom.backlogList.appendChild(renderBacklogItem(item, false));
  }
  // Sprint plan
  dom.sprintPlan.innerHTML = '';
  for (const id of state.sprintPlan) {
    const item = state.backlog.find(b => b.id === id);
    if (item) dom.sprintPlan.appendChild(renderBacklogItem(item, true));
  }

  saveState();
}

/** @param {BacklogItem} item */
function renderBacklogItem(item, inPlan) {
  const li = document.createElement('li');
  li.className = 'card';
  li.draggable = true;
  li.dataset.id = item.id;
  li.addEventListener('dragstart', onDragStart);
  li.addEventListener('dragend', onDragEnd);

  const left = document.createElement('div');
  const right = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = `${item.title}`;
  left.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.innerHTML = `Effort <span class="effort">${item.effort}</span> • Value <span class="value">${item.value}</span> • Risk <span class="risk">${Math.round(item.risk*100)}%</span>`;
  left.appendChild(meta);

  const badges = document.createElement('div');
  badges.className = 'badges';
  const typeBadge = document.createElement('span');
  typeBadge.className = 'badge';
  typeBadge.textContent = item.type;
  badges.appendChild(typeBadge);
  if (item.refine > 0) {
    const refineBadge = document.createElement('span');
    refineBadge.className = 'badge';
    refineBadge.textContent = `refined ${(item.refine*100)|0}%`;
    badges.appendChild(refineBadge);
  }
  left.appendChild(badges);

  const action = document.createElement('button');
  action.className = 'btn small';
  action.textContent = inPlan ? 'Remove' : 'Plan';
  action.addEventListener('click', () => {
    if (inPlan) removeFromPlan(item.id); else addToPlan(item.id);
  });
  right.appendChild(action);

  li.appendChild(left);
  li.appendChild(right);
  return li;
}

function addToPlan(id) {
  if (!state.sprintPlan.includes(id)) {
    state.sprintPlan.push(id);
    recalcPlannedPoints();
    render();
  }
}
function removeFromPlan(id) {
  state.sprintPlan = state.sprintPlan.filter(x => x !== id);
  recalcPlannedPoints();
  render();
}
function recalcPlannedPoints() {
  state.plannedPoints = state.sprintPlan
    .map(id => state.backlog.find(b=>b.id===id))
    .filter(Boolean)
    .reduce((sum, item) => sum + (item?.effort ?? 0), 0);
}

// Drag & drop
let draggedId = null;
function onDragStart(e) {
  const id = /** @type {HTMLElement} */(e.target).dataset.id;
  draggedId = id ?? null;
  e.dataTransfer?.setData('text/plain', draggedId ?? '');
  dom.sprintPlan.classList.add('active');
}
function onDragEnd() {
  dom.sprintPlan.classList.remove('active');
}
dom.sprintPlan.addEventListener('dragover', (e) => {
  e.preventDefault();
});
dom.sprintPlan.addEventListener('drop', (e) => {
  e.preventDefault();
  if (draggedId) addToPlan(draggedId);
});

// Buttons
dom.btnNewGame?.addEventListener('click', () => {
  state = newGameState();
  render();
});

dom.btnClearPlan?.addEventListener('click', () => {
  state.sprintPlan = [];
  recalcPlannedPoints();
  render();
});

dom.btnAutoPlan?.addEventListener('click', () => {
  // WSJF-like: value / effort with risk adjustment
  const capacity = state.capacity;
  const candidates = state.backlog
    .filter(i => !state.sprintPlan.includes(i.id))
    .sort((a,b) => (b.value / (b.effort+1))*(1+b.risk) - (a.value / (a.effort+1))*(1+a.risk));
  let total = state.plannedPoints;
  for (const c of candidates) {
    if (total + c.effort <= capacity) {
      state.sprintPlan.push(c.id);
      total += c.effort;
    }
  }
  recalcPlannedPoints();
  render();
});

dom.btnRefine?.addEventListener('click', () => {
  // Refinement reduces risk on 3 random items and increases predictability
  const rng = seededRandom(state.rngSeed + state.sprintNumber);
  const indices = new Set();
  while (indices.size < 3 && indices.size < state.backlog.length) {
    indices.add(Math.floor(rng() * state.backlog.length));
  }
  indices.forEach(idx => {
    const item = state.backlog[idx];
    const delta = 0.1;
    item.refine = Math.min(1, item.refine + delta);
    item.risk = Math.max(0, item.risk - delta * 0.5);
  });
  state.predictability = Math.min(100, state.predictability + 2);
  render();
});

dom.btnAddDiscovery?.addEventListener('click', () => {
  // Add a discovery item to improve learning and reduce risk globally when completed
  const id = `D${Date.now().toString(36)}`;
  state.backlog.unshift({
    id,
    title: 'Discovery: Explore customer problem',
    effort: 5,
    value: 4,
    risk: 0.05,
    type: 'discovery',
    refine: 0,
  });
  render();
});

dom.btnStart?.addEventListener('click', () => {
  if (state.plannedPoints === 0) {
    alert('Plan some work first.');
    return;
  }
  // A mid-sprint scenario surfaces
  showScenario();
});

dom.btnComplete?.addEventListener('click', completeSprint);

function showScenario() {
  const rng = seededRandom(state.rngSeed + state.sprintNumber * 7);
  const scenarios = buildScenarios();
  const scenario = scenarios[Math.floor(rng() * scenarios.length)];
  dom.scenarioTitle.textContent = scenario.title;
  dom.scenarioText.textContent = scenario.text;
  dom.scenarioChoices.innerHTML = '';
  for (const choice of scenario.choices) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = choice.label;
    btn.addEventListener('click', () => {
      choice.apply(state);
      render();
      dom.scenarioDialog.close();
    });
    dom.scenarioChoices.appendChild(btn);
  }
  dom.scenarioDialog.showModal();
}

function buildScenarios() {
  /** @type {{title: string, text: string, choices: {label: string, apply: (s: GameState)=>void}[]}[]} */
  const list = [];

  list.push({
    title: 'Stakeholder requests urgent change',
    text: 'A high-profile stakeholder asks to swap in a new item mid-sprint.',
    choices: [
      { label: 'Decline; protect the Sprint Goal', apply: (s) => { s.predictability = Math.min(100, s.predictability + 5); }},
      { label: 'Accept; replan sprint', apply: (s) => {
        // add one high-risk, high-value item and remove some planned work
        const urgent = { id: `U${Date.now()}`, title: 'Urgent stakeholder request', effort: 8, value: 9, risk: 0.5, type: 'feature', refine: 0 };
        s.backlog.unshift(urgent);
        if (s.sprintPlan.length > 0) { s.sprintPlan.pop(); recalcPlannedPoints(); }
        s.predictability = Math.max(0, s.predictability - 8);
      }},
    ],
  });

  list.push({
    title: 'Quality issue emerges',
    text: 'Several defects are reported in production. Address now or later?',
    choices: [
      { label: 'Allocate capacity to fix now', apply: (s) => {
        s.value = Math.max(0, s.value - 2);
        s.predictability = Math.max(0, s.predictability - 2);
        s.backlog.unshift({ id: `B${Date.now()}`, title: 'Bugfix: production defect', effort: 5, value: 6, risk: 0.2, type: 'bug', refine: 0 });
      }},
      { label: 'Plan for next sprint with learning', apply: (s) => {
        s.learning = Math.min(100, s.learning + 3);
        s.backlog.unshift({ id: `R${Date.now()}`, title: 'Root cause analysis', effort: 3, value: 4, risk: 0.05, type: 'discovery', refine: 0 });
      }},
    ],
  });

  list.push({
    title: 'Experiment opportunity',
    text: 'A low-cost experiment could uncover high-value insight.',
    choices: [
      { label: 'Run the experiment', apply: (s) => {
        s.learning = Math.min(100, s.learning + 6);
        // reduce risk moderately across planned items
        for (const id of s.sprintPlan) {
          const item = s.backlog.find(b => b.id === id);
          if (item) item.risk = Math.max(0, item.risk - 0.05);
        }
      }},
      { label: 'Skip; focus on delivery', apply: (s) => {
        s.predictability = Math.min(100, s.predictability + 2);
      }},
    ],
  });

  return list;
}

function completeSprint() {
  const rng = seededRandom(state.rngSeed + state.sprintNumber * 13);
  // Determine completion based on risk and predictability
  let completed = 0;
  let deliveredValue = 0;
  const completedIds = [];
  for (const id of state.sprintPlan) {
    const item = state.backlog.find(b => b.id === id);
    if (!item) continue;
    const effectiveRisk = Math.max(0, item.risk * (1 - item.refine) * (1 - (state.predictability/150)));
    const success = rng() > effectiveRisk;
    if (success) {
      completed += item.effort;
      deliveredValue += item.value;
      completedIds.push(id);
    } else {
      // spillover increases risk slightly
      item.risk = Math.min(0.95, item.risk + 0.05);
    }
  }

  // Remove completed from backlog
  state.backlog = state.backlog.filter(b => !completedIds.includes(b.id));
  state.velocityHistory.push(completed);
  state.completedPoints = completed;

  // Metrics updates
  state.value = Math.min(100, state.value + Math.round(deliveredValue / 2));
  // Learning from any discovery items completed
  const completedDiscovery = completedIds
    .map(id => state.sprintPlan.find(x => x === id))
    .map(id => state.backlog.find(b => b.id === id))
    .filter(Boolean)
    .length;
  if (completedDiscovery > 0) state.learning = Math.min(100, state.learning + completedDiscovery * 5);

  // Predictability adjusts toward ratio of completed/planned
  const ratio = state.plannedPoints ? completed / state.plannedPoints : 1;
  const delta = (ratio - 1) * 12; // gentle correction
  state.predictability = Math.max(0, Math.min(100, state.predictability + delta));

  // Prepare next sprint
  state.sprintNumber += 1;
  state.sprintPlan = [];
  state.plannedPoints = 0;

  // Summary
  showSummary(completed, deliveredValue, ratio);
  render();
}

function showSummary(completed, deliveredValue, ratio) {
  dom.summaryContent.innerHTML = `
    <p><strong>Completed:</strong> ${completed} pts</p>
    <p><strong>Delivered Value:</strong> +${Math.round(deliveredValue/2)}</p>
    <p><strong>Predictability adjustment:</strong> ${ratio.toFixed(2)}x</p>
  `;
  dom.summaryDialog.showModal();
}

// Initial render
render();

