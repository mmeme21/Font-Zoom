const { Plugin, PluginSettingTab, Setting, Notice } = require("obsidian");

const DEFAULTS = { fontSize: null, minSize: 10, maxSize: 40 };
const NOTE_SELECTOR =
  ".markdown-source-view, .markdown-reading-view, .markdown-preview-view";
const LEAF = '.workspace-leaf-content[data-type="markdown"]';

// Injected from JS so it always loads (no separate styles.css needed).
// Only note content is targeted; toolbars, menus and sidebars are untouched.
const CSS = `
.markdown-source-view .cm-scroller,
.markdown-reading-view,
.markdown-preview-view { touch-action: pan-x pan-y; }

body.pinch-font-active ${LEAF} .view-content {
  --font-text-size: var(--pinch-font-size);
}
body.pinch-font-active ${LEAF} .cm-content,
body.pinch-font-active ${LEAF} .markdown-preview-view,
body.pinch-font-active ${LEAF} .markdown-rendered {
  font-size: var(--pinch-font-size) !important;
}
`;

module.exports = class PinchFontSizePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.pinching = false;
    this.startDistance = 0;
    this.startSize = 16;
    this.saveTimer = null;
    this.notice = null;
    this.noticeTimer = null;

    this.styleEl = document.createElement("style");
    this.styleEl.id = "pinch-font-size-style";
    this.styleEl.textContent = CSS;
    document.head.appendChild(this.styleEl);

    if (this.settings.fontSize) this.applySize(this.settings.fontSize);

    this.registerDomEvent(document, "touchstart", (e) => this.onStart(e), {
      passive: true,
      capture: true,
    });
    this.registerDomEvent(document, "touchmove", (e) => this.onMove(e), {
      passive: false,
      capture: true,
    });
    this.registerDomEvent(document, "touchend", (e) => this.onEnd(e), true);
    this.registerDomEvent(document, "touchcancel", (e) => this.onEnd(e), true);

    this.addCommand({
      id: "reset-font-size",
      name: "Reset note font size",
      callback: () => this.resetSize(),
    });
    this.addSettingTab(new PinchSettingTab(this.app, this));
  }

  onunload() {
    this.clearSize();
    if (this.styleEl) this.styleEl.remove();
  }

  inNote(touch) {
    const el = touch && touch.target;
    return !!(el && el.closest && el.closest(NOTE_SELECTOR));
  }

  distance(t) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }

  currentSize() {
    if (this.settings.fontSize) return this.settings.fontSize;
    const el = document.querySelector(
      ".workspace-leaf.mod-active .cm-content, .workspace-leaf.mod-active .markdown-preview-view"
    );
    const v = el ? parseFloat(getComputedStyle(el).fontSize) : NaN;
    return Number.isFinite(v) && v > 0 ? v : 16;
  }

  applySize(px) {
    document.body.style.setProperty("--pinch-font-size", px + "px");
    document.body.classList.add("pinch-font-active");
  }

  clearSize() {
    document.body.style.removeProperty("--pinch-font-size");
    document.body.classList.remove("pinch-font-active");
  }

  showSize(px) {
    clearTimeout(this.noticeTimer);
    if (!this.notice) this.notice = new Notice("", 0);
    this.notice.setMessage("Font size: " + px + "px");
  }

  hideSize() {
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      if (this.notice) this.notice.hide();
      this.notice = null;
    }, 800);
  }

  onStart(e) {
    if (e.touches.length === 2 && this.inNote(e.touches[0]) && this.inNote(e.touches[1])) {
      this.pinching = true;
      this.startDistance = this.distance(e.touches);
      this.startSize = this.currentSize();
    } else if (e.touches.length !== 2) {
      this.pinching = false;
    }
  }

  onMove(e) {
    if (!this.pinching || e.touches.length !== 2 || this.startDistance === 0) return;
    if (e.cancelable) e.preventDefault();
    const scale = this.distance(e.touches) / this.startDistance;
    let size = this.startSize * scale;
    size = Math.min(this.settings.maxSize, Math.max(this.settings.minSize, size));
    size = Math.round(size * 2) / 2;
    this.settings.fontSize = size;
    this.applySize(size);
    this.showSize(size);
  }

  onEnd(e) {
    if (this.pinching && e.touches.length < 2) {
      this.pinching = false;
      this.hideSize();
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveData(this.settings), 300);
    }
  }

  async resetSize() {
    this.settings.fontSize = null;
    this.clearSize();
    await this.saveData(this.settings);
  }
};

class PinchSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl).setName("Minimum font size").addSlider((sl) =>
      sl.setLimits(8, 20, 1).setValue(s.minSize).setDynamicTooltip()
        .onChange(async (v) => { s.minSize = v; await this.plugin.saveData(s); })
    );

    new Setting(containerEl).setName("Maximum font size").addSlider((sl) =>
      sl.setLimits(24, 72, 1).setValue(s.maxSize).setDynamicTooltip()
        .onChange(async (v) => { s.maxSize = v; await this.plugin.saveData(s); })
    );

    new Setting(containerEl)
      .setName("Reset font size")
      .setDesc("Go back to your normal Obsidian font size.")
      .addButton((b) => b.setButtonText("Reset").onClick(() => this.plugin.resetSize()));
  }
}
