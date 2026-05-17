type ShellSettings = { [key: string]: unknown };

type PaneTabBinding = {
  activate: (tab: string) => void;
  buttons: HTMLButtonElement[];
  current: () => string;
};

type PaneTabOptions = {
  buttonAttr?: string;
  buttonsSelector: string;
  initialTab?: string;
  onActivate?: (tab: string) => void;
  paneAttr?: string;
  paneRoot?: ParentNode;
  paneSelector?: string;
  validate?: (tab: string) => boolean;
};

type ToolbarTooltipOptions = {
  getSettings?: () => Promise<ShellSettings>;
  onSettingsChanged?: (handler: (settings: ShellSettings) => void) => void;
  selector?: string;
};

type ThemeName = "light" | "dark";

type ThemeSyncOptions = {
  getSettings?: () => Promise<ShellSettings>;
  onSettingsChanged?: (handler: (settings: ShellSettings) => void) => void;
};

type Chem0ShellApi = {
  applyPlatformClass: (platform?: string) => void;
  applyTheme: (theme: ThemeName) => void;
  bindPaneTabs: (options: PaneTabOptions) => PaneTabBinding;
  installThemeSync: (options?: ThemeSyncOptions) => void;
  installToolbarTooltips: (options?: ToolbarTooltipOptions) => void;
};

interface Window {
  Chem0Shell: Chem0ShellApi;
}

function shellAttrValue(element: Element, attr: string): string {
  return element.getAttribute(attr) ?? "";
}

function shellApplyPlatformClass(platform = "darwin"): void {
  document.body.classList.add(`platform-${platform}`);
}

function shellBindPaneTabs(options: PaneTabOptions): PaneTabBinding {
  const buttonAttr = options.buttonAttr ?? "data-tab";
  const paneAttr = options.paneAttr ?? buttonAttr;
  const paneRoot = options.paneRoot ?? document;
  const paneSelector = options.paneSelector ?? ".sidebar-pane";
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(options.buttonsSelector));
  let activeTab = "";

  function activate(tab: string): void {
    if (!tab || (options.validate && !options.validate(tab))) return;
    activeTab = tab;
    for (const pane of paneRoot.querySelectorAll<HTMLElement>(paneSelector)) {
      pane.classList.toggle("active", shellAttrValue(pane, paneAttr) === tab);
    }
    for (const btn of buttons) {
      btn.classList.toggle("active", shellAttrValue(btn, buttonAttr) === tab);
    }
    options.onActivate?.(tab);
  }

  for (const btn of buttons) {
    btn.addEventListener("click", () => activate(shellAttrValue(btn, buttonAttr)));
  }

  if (options.initialTab) activate(options.initialTab);

  return {
    activate,
    buttons,
    current: () => activeTab
  };
}

function shellInstallToolbarTooltips(options: ToolbarTooltipOptions = {}): void {
  const selector = options.selector ?? ".icon-btn";
  const tooltipEl = document.createElement("div");
  tooltipEl.className = "tooltip";
  tooltipEl.setAttribute("role", "tooltip");
  tooltipEl.style.display = "none";
  document.body.appendChild(tooltipEl);

  let enabled = true;
  let target: HTMLElement | null = null;

  function hide(): void {
    tooltipEl.style.display = "none";
    target = null;
  }

  function show(nextTarget: HTMLElement): void {
    if (!enabled) return;
    const text = nextTarget.dataset.tip ?? nextTarget.getAttribute("title") ?? "";
    if (!text) return;
    if (nextTarget.hasAttribute("title")) {
      nextTarget.dataset.tip = text;
      nextTarget.removeAttribute("title");
    }
    tooltipEl.textContent = text;
    tooltipEl.style.display = "block";
    const rect = nextTarget.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    const left = Math.max(4, Math.min(window.innerWidth - tipRect.width - 4, rect.left + rect.width / 2 - tipRect.width / 2));
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${rect.bottom + 4}px`;
    target = nextTarget;
  }

  document.addEventListener("mouseover", (event) => {
    const nextTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>(selector);
    if (!nextTarget || nextTarget === target) return;
    show(nextTarget);
  });

  document.addEventListener("mouseout", (event) => {
    const currentTarget = (event.target as HTMLElement | null)?.closest<HTMLElement>(selector);
    if (!currentTarget) return;
    const related = (event.relatedTarget as HTMLElement | null)?.closest<HTMLElement>(selector);
    if (related === currentTarget) return;
    hide();
  });

  document.addEventListener("mousedown", hide);
  window.addEventListener("blur", hide);

  function applySettings(settings: ShellSettings): void {
    enabled = settings.showToolbarTooltips !== false;
    if (!enabled) hide();
  }

  void options.getSettings?.().then(applySettings);
  options.onSettingsChanged?.(applySettings);
}

const THEME_STORAGE_KEY = "chem0.theme";

function shellApplyTheme(theme: ThemeName): void {
  const normalized: ThemeName = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", normalized);
  try { window.localStorage?.setItem(THEME_STORAGE_KEY, normalized); } catch { /* ignore */ }
}

function shellInstallThemeSync(options: ThemeSyncOptions = {}): void {
  // Apply cached theme synchronously to avoid flash-of-wrong-theme.
  let cached: ThemeName = "light";
  try {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") cached = stored;
  } catch { /* ignore */ }
  shellApplyTheme(cached);

  function applySettings(settings: ShellSettings): void {
    const next = settings.theme === "dark" ? "dark" : "light";
    shellApplyTheme(next);
  }

  void options.getSettings?.().then(applySettings).catch(() => { /* ignore */ });
  options.onSettingsChanged?.(applySettings);
}

// Apply cached theme as early as possible (before any IPC round-trip).
(function bootstrapTheme(): void {
  try {
    const stored = window.localStorage?.getItem(THEME_STORAGE_KEY);
    shellApplyTheme(stored === "dark" ? "dark" : "light");
  } catch {
    shellApplyTheme("light");
  }
})();

window.Chem0Shell = {
  applyPlatformClass: shellApplyPlatformClass,
  applyTheme: shellApplyTheme,
  bindPaneTabs: shellBindPaneTabs,
  installThemeSync: shellInstallThemeSync,
  installToolbarTooltips: shellInstallToolbarTooltips
};
