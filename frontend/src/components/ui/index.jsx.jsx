@import "tailwindcss";

@theme {
  --color-boxer-bg:        #0f1117;
  --color-boxer-surface:   #1a1d27;
  --color-boxer-card:      #21253a;
  --color-boxer-border:    #2e3347;
  --color-boxer-accent:    #4f6ef7;
  --color-boxer-accent-h:  #3d5ce5;
  --color-boxer-text:      #e8eaf0;
  --color-boxer-muted:     #8b91a8;
  --color-boxer-success:   #22c55e;
  --color-boxer-warning:   #f59e0b;
  --color-boxer-danger:    #ef4444;
}

* { box-sizing: border-box; }

body {
  background-color: var(--color-boxer-bg);
  color: var(--color-boxer-text);
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  -webkit-font-smoothing: antialiased;
}

/* Scrollbar customizada para combinar com o dark theme */
::-webkit-scrollbar       { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--color-boxer-bg); }
::-webkit-scrollbar-thumb { background: var(--color-boxer-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--color-boxer-muted); }
