# AGENTS.md — MetSim Studio v2.0

## Qué es esto

App vanilla JS de una sola página (Vite, sin framework). Simulador de molino de bolas + hidrociclón con matemática PBM en tiempo real, control PID y sistema de alarmas. La UI está en español.

## Comandos

```
npm install        # ejecutar primero
npm run dev        # servidor Vite en localhost
npm run build      # build de producción → dist/
npm run preview    # previsualizar build de producción
```

No hay suite de tests, linter ni typechecker configurado.

## Arquetura

Toda la lógica está en `src/`, sin config de bundler más allá de los defaults de Vite:

- `simulationEngine.js` — matemática central: PBM 20 clases (Austin), curva de Tromp, control PID, balance de agua. Exporta la clase `Simulator` y `DEFAULT_PARAMS`. Es lo principal que hay que entender.
- `main.js` — orquestador: conecta sim + UI + charts + alarmas + gestor de casos. Event listeners del DOM, loop de simulación con `requestAnimationFrame`.
- `chartsManager.js` — wrappers de Chart.js para 8 paneles de tendencias + gráfico PSD
- `alarmSystem.js` — evaluador de alarmas basado en reglas (nivel sump, P80, potencia, etc.)
- `caseManager.js` — guardar/cargar casos en `localStorage`, exportar a Excel vía SheetJS
- `style.css` — estilos custom + overrides de Tailwind
- `counter.js` — artefacto de scaffold de Vite que no se usa

## Detalles clave

- **Tailwind por CDN** (`cdn.tailwindcss.com` en `index.html`), no es un build local. Dark mode usa estrategia `class`.
- **SheetJS** cargado desde CDN para exportación `.xlsx` — no está en `package.json`.
- **Sin config de bundler** — Vite maneja todo. El código fuente son ES modules estándar.
- **La UI está en español** — etiquetas de botones, nombres de KPIs, mensajes de alarma.
- **`window._metSimUtils`** — expuesto en `main.js:19` para exportación a Excel. No quitar.
- **La simulación usa `requestAnimationFrame`** — dt se calcula reloj de pared × multiplicador de velocidad. `sim.step(dtMin)` es el update principal.
- **`caseManager.js` usa `window._metSimUtils`** para tamaños de malla y helpers de PSD — evita dependencia circular vía global.

## Al editar

- La matemática de la simulación vive enteramente en `simulationEngine.js`. El wiring de UI es `main.js`.
- Para agregar un nuevo parámetro: añadirlo a `DEFAULT_PARAMS` en `simulationEngine.js` Y al array `paramMap` en `main.js` para el binding con inputs.
- Las reglas de alarma están definidas en `alarmSystem.js:10` — las funciones de check reciben la instancia `sim`.
- Las instancias de chart las maneja la clase `ChartsManager`. Paneles nuevos necesitan un `<canvas>` en `index.html` y un `update` correspondiente en el loop de simulación.
