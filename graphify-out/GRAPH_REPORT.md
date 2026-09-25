# Graph Report - process-sim-app  (2026-09-17)

## Corpus Check
- Corpus is ~13,459 words - fits in a single context window. You may not need a graph.

## Summary
- 111 nodes · 202 edges · 8 communities (6 shown, 2 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Main Orchestrator & UI
- Simulation Engine Core
- Package & Dependencies
- Charts & Visualization
- Alarm System & Run Loop
- UI Update Functions
- OpenCode Config

## God Nodes (most connected - your core abstractions)
1. `updateUI()` - 12 edges
2. `Simulator` - 12 edges
3. `ChartsManager` - 11 edges
4. `AlarmSystem` - 8 edges
5. `passingToRetained()` - 8 edges
6. `clamp()` - 7 edges
7. `generateFeedPSD()` - 7 edges
8. `runLoop()` - 6 edges
9. `resetSimulation()` - 6 edges
10. `setText()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `exportToCSV()` --calls--> `passingToRetained()`  [EXTRACTED]
  src/main.js → src/simulationEngine.js
- `updatePSDTab()` --calls--> `passingToRetained()`  [EXTRACTED]
  src/main.js → src/simulationEngine.js
- `renderCaseList()` --calls--> `listCases()`  [EXTRACTED]
  src/main.js → src/caseManager.js
- `resetSimulation()` --calls--> `makeTrendHistory()`  [EXTRACTED]
  src/main.js → src/chartsManager.js

## Import Cycles
- None detected.

## Communities (8 total, 2 thin omitted)

### Community 0 - "Main Orchestrator & UI"
Cohesion: 0.10
Nodes (22): deleteCase(), exportExcel(), listCases(), loadCase(), saveCase(), alarms, btnExportCsv, btnExportXlsx (+14 more)

### Community 1 - "Simulation Engine Core"
Cohesion: 0.23
Nodes (13): initParamListeners(), clamp(), classifyCyclone(), computeBreakageMatrix(), computeSelectionRates(), computeStreamProps(), computeTrompCurve(), generateFeedPSD() (+5 more)

### Community 2 - "Package & Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, chart.js, lucide, devDependencies, vite, name, private, scripts (+8 more)

### Community 3 - "Charts & Visualization"
Cohesion: 0.18
Nodes (5): ref_chart_js_auto, ChartsManager, makeYAxis(), PANEL_DEFAULTS, MESH_SIZES

### Community 4 - "Alarm System & Run Loop"
Cohesion: 0.17
Nodes (8): ALARM_RULES, AlarmSystem, SEVERITY, makeTrendHistory(), pauseSimulation(), resetSimulation(), runLoop(), startSimulation()

### Community 5 - "UI Update Functions"
Cohesion: 0.25
Nodes (9): setText(), updateAlarmBadge(), updateKPICards(), updatePFDOverlay(), updatePSDTab(), updateQuickStateBar(), updateStatusBar(), updateTelemetryPanel() (+1 more)

## Knowledge Gaps
- **29 isolated node(s):** `$schema`, `plugin`, `name`, `version`, `private` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 39 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ChartsManager` connect `Charts & Visualization` to `Main Orchestrator & UI`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `Simulator` connect `Simulation Engine Core` to `Main Orchestrator & UI`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `AlarmSystem` connect `Alarm System & Run Loop` to `Main Orchestrator & UI`, `UI Update Functions`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `$schema`, `plugin`, `name` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Main Orchestrator & UI` be split into smaller, more focused modules?**
  _Cohesion score 0.09686609686609686 - nodes in this community are weakly interconnected._
- **Should `Package & Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._