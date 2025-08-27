## PSPO Scrum Game

A small, self-contained browser game to help Scrum teams practice Product Owner decisions aligned with PSPO concepts. It emphasizes ordering the Product Backlog, making tradeoffs, and inspecting/adapting using simple metrics inspired by Evidence-Based Management (EBM): Value, Learning, and Predictability.

### Features
- Backlog ordering and Sprint planning with capacity
- Scenario events prompting PSPO-style decisions
- Discovery work that reduces risk and boosts learning
- Sprint completion with success chance influenced by risk, refinement, and predictability
- Simple metrics dashboard: Value, Learning, Predictability, Sprint number, capacity, planned, velocity trend

### Run
Open `index.html` directly in a browser, or serve the folder:

```bash
cd pspo-game
python3 -m http.server 8080
# then open http://localhost:8080
```

### How to Play
1. Order backlog and plan items up to capacity. Use Auto Plan as a starting point.
2. Click Start Sprint to face a scenario. Choose how to respond.
3. Click Complete Sprint to deliver. Review summary and metrics.
4. Repeat for several sprints to maximize outcomes and predictability.

### Alignment to PSPO
- Ordering for value: Items include Value and Effort; an Auto Plan heuristic is provided, but players should make deliberate tradeoffs.
- Product discovery: Discovery items increase Learning and reduce risk.
- Empiricism: Predictability adjusts based on planned vs. completed; refinement improves outcomes.
- Stakeholder management: Scenarios force decisions on scope changes and quality.

### Notes
- No tracking or network calls; state is saved in local storage only.
- Feel free to edit `script.js` to tweak probabilities and scoring.

