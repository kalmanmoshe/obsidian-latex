import { EditorView,} from "@codemirror/view";
import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  setIcon,
} from "obsidian";
import MosheMathPlugin from "../main";
import { CompilerType, DEFAULT_SETTINGS, OverflowStrategy } from "./settings";
import {
  addDropdownSetting,
  addToggleSetting,
  setPluginInstance,
  createSetting,
  addButtonSetting,
  addFileSearchSetting,
} from "obsidian-dev-utils";

export class MosheMathSettingTab extends PluginSettingTab {
  plugin: MosheMathPlugin;
  snippetsEditor: EditorView;
  snippetsFileLocEl: HTMLElement;
  snippetVariablesFileLocEl: HTMLElement;

  constructor(plugin: MosheMathPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    setPluginInstance(plugin);
  }

  addHeading(containerEl: HTMLElement, name: string, icon = "math") {
    const heading = new Setting(containerEl).setName(name).setHeading();
    const parentEl = heading.settingEl;
    const iconEl = parentEl.createDiv();
    setIcon(iconEl, icon);
    iconEl.addClass("moshe-math-settings-icon");
    parentEl.prepend(iconEl);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.displayGraphSettings();
    this.displayCachedSettings();
    this.displayPreambleSettings();
  }

  private displayGraphSettings() {
    const containerEl = this.containerEl;
    this.addHeading(containerEl, "graph", "ballpen");
    addToggleSetting(
      containerEl,
      (value: boolean) => {
        (this.plugin.settings.invertColorsInDarkMode = value),
          this.plugin.saveSettings();
      },
      {
        name: "Invert colors in dark mode",
        description:
          "Invert colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.",
        defValue: this.plugin.settings.invertColorsInDarkMode,
      },
    );
    addDropdownSetting(
      containerEl,
      (value: string) => {
        this.plugin.settings.overflowStrategy = value as OverflowStrategy
        this.plugin.saveSettings();
      },
      {
        name: "Overflow strategy",
        description:
          "What to do when the content overflows the container. 'downscale' - downscale the content, 'scroll' - add a scrollbar, 'hidden' - do nothing, content will overflow.",
        dropDownOptions: {
          downscale: "Downscale",
          scroll: "Scroll",
          hidden: "Hidden",
        },
        defValue: this.plugin.settings.overflowStrategy,
      },
    );
    const setting = createSetting(containerEl, {
      name: "PDF Engine Cooldown Time",
      description:
        "The interval (in seconds) between PDF rendering jobs. A higher value decreases performance.",
    });
    setting.addSlider((slider) => {
      slider.setLimits(0, 5, 1);
      slider.setValue(this.plugin.settings.pdfEngineCooldown / 1000);
      slider.setDynamicTooltip();
      slider.onChange((value) => {
        this.plugin.settings.pdfEngineCooldown = value * 1000;
        this.plugin.saveSettings();
      });
    });
    addDropdownSetting(
      containerEl,
      (value: string) => {
        this.plugin.settings.compiler = value as CompilerType;
        this.plugin.saveSettings();
        this.plugin.swiftlatexRender.switchCompiler();
      },
      {
        name: "Compiler",
        description:
          "Choose the LaTeX compiler for rendering diagrams. 'TeX' is the classic engine, while 'XeTeX' offers better Unicode and modern font support. Changing this may affect compatibility and output.",
        dropDownOptions: {
          tex: "TeX",
          xetex: "XeTeX",
        },
        defValue: this.plugin.settings.compiler,
      },
    );

    addToggleSetting(
      containerEl,
      (value: boolean) => {
        (this.plugin.settings.saveLogs = value), this.plugin.saveSettings();
      },
      {
        name: "Save latex logs",
        description:
          "Whether to save the latex render logs (memory only not physical)",
        defValue: this.plugin.settings.saveLogs,
      },
    );
  }
  private displayCachedSettings() {
    const containerEl = this.containerEl;
    this.addHeading(containerEl, "cache", "database");

    addToggleSetting(
      containerEl,
      (value: boolean) => {
        this.plugin.settings.physicalCache = value;
        this.plugin.saveSettings();
        this.plugin.swiftlatexRender.cache.resultFileCache.togglePhysicalCache();
        physicalCacheLocationSetting.settingEl.toggleClass("hidden", !value);
      },
      {
        name: "Physical cache enabled",
        description:
          "Whether to use a physical cache for rendered diagrams. If enabled, rendered diagrams are stored on disk, improving performance for subsequent loads. When disabled, diagrams are cached in memory only, which may lead to slower performance on startup but reduces disk usage.",
        defValue: this.plugin.settings.physicalCache,
      },
    );

    const physicalCacheLocationSetting = addFileSearchSetting(
      containerEl,
      async (value) => {
        this.plugin.settings.physicalCacheLocation = value;
        await this.plugin.saveSettings();
        this.plugin.swiftlatexRender.cache.resultFileCache.changeCacheDirectory();
      },
      {
      name: "Physical cache location",
      description: "The directory where rendered diagrams are stored. Empty for default, \"/\" for the vault root, or a specific path.",
      placeholder: DEFAULT_SETTINGS.physicalCacheLocation,
      defValue: this.plugin.settings.physicalCacheLocation,
      debounce: {timeout: 1000, resetTimer: true},
    });
    physicalCacheLocationSetting.settingEl.toggleClass("hidden",!this.plugin.settings.physicalCache);
    addButtonSetting(
      containerEl,
      () => {
        this.plugin.swiftlatexRender.cache.resultFileCache.removeAllCached();
        new Notice("Cleared cached SVGs");
      },
      {
        name: "Clear cached SVGs",
        description:
          "SVGs rendered with SwiftLatex are stored in a database, so diagrams don't have to be re-rendered from scratch every time you open a page. Use this to clear the cache and force all diagrams to be re-rendered.",
        elText: "Clear cached SVGs",
        icon: "trash",
        tooltip: "Clear cached SVGs",
      },
    );
  }

  private displayPreambleSettings() {
    const containerEl = this.containerEl;
    this.addHeading(containerEl, "Preamble", "pencil");

    addToggleSetting(
      containerEl,
      (value: boolean) => {
        this.plugin.settings.mathjaxPreambleEnabled = value;
        this.plugin.saveSettings();
        mathjaxPreambleFileLoc.settingEl.toggleClass("hidden",!this.plugin.settings.mathjaxPreambleEnabled,);
      },
      {
        name: "Mathjax preamble enabled.",
        description: "Whether to load mathjax preamble",
        defValue: this.plugin.settings.mathjaxPreambleEnabled,
      },
    );

    const mathjaxPreambleFileLoc = addFileSearchSetting(
      containerEl,
      async (value) => {
        this.plugin.settings.mathjaxPreambleFileLocation = value;
        await this.plugin.saveSettings();
      },
      {
        name: "Mathjax preamble file location",
        description:
          "the file/directory containing the preamble for MathJax requirs reload to take effect",
        placeholder: DEFAULT_SETTINGS.mathjaxPreambleFileLocation,
        defValue: this.plugin.settings.mathjaxPreambleFileLocation,
        debounce: { timeout: 1000, resetTimer: true },
      }
    )
    mathjaxPreambleFileLoc.settingEl.toggleClass("hidden",!this.plugin.settings.mathjaxPreambleEnabled,);
    const virtualFilesDescription = document.createDocumentFragment();

    const description = document.createElement("span");
    description.textContent =
      "Allows the LaTeX engine to load external files into its virtual filesystem. " +
      "Enabling this lets you use commands such as \\include{} to reference external files. " +
      "When disabled, all LaTeX commands must rely solely on content provided directly in the code block.";

    virtualFilesDescription.appendChild(description);
    addToggleSetting(
      containerEl,
      (value: boolean) => {
        this.plugin.settings.compilerVfsEnabled = value;
        virtualFilesFromCodeBlocks.settingEl.toggleClass("hidden", !value);
        autoloadedVfsFilesDir.settingEl.toggleClass("hidden", !value);
      },
      {
        name: "Enable virtual files",
        description: virtualFilesDescription,
        defValue: this.plugin.settings.compilerVfsEnabled,
        passToSave: { didFileLocationChange: true },
      },
    );
    const descriptionFragment = document.createDocumentFragment();
    const descriptionDetails = document.createElement("span");
    descriptionDetails.textContent =
      "When enabled, code blocks with a header specifying a name (e.g., 'name: someAwesomeCode') " +
      "can be included directly in your LaTeX code using commands like \\include{}. " +
      "The name provided in the header identifies the code block as a virtual file. " +
      "If disabled, this functionality is unavailable. " +
      "Note: the default file extension is '.tex', unless explicitly specified.";
    descriptionFragment.appendChild(descriptionDetails);

    const virtualFilesFromCodeBlocks = addToggleSetting(
      containerEl,
      (value: boolean) => {
        this.plugin.settings.virtualFilesFromCodeBlocks = value;
      },
      {
        name: "Enable virtual files from code blocks",
        description: descriptionFragment,
        defValue: this.plugin.settings.virtualFilesFromCodeBlocks,
        passToSave: { didFileLocationChange: true },
      },
    );
    virtualFilesFromCodeBlocks.settingEl.toggleClass("hidden", !this.plugin.settings.compilerVfsEnabled);
    const autoloadedVfsFilesDir = addFileSearchSetting(
      containerEl,
      async (value) => {
        this.plugin.settings.autoloadedVfsFilesDir = value;
        await this.plugin.saveSettings();
        this.plugin.processLatexPreambles(true);
      },
      {
        name: "Autoloaded virtual files",
        description:
          "Specify a directory containing virtual files to automatically include in every LaTeX render. " ,
        placeholder: DEFAULT_SETTINGS.autoloadedVfsFilesDir,
        defValue: this.plugin.settings.autoloadedVfsFilesDir,
        debounce: { timeout: 1000, resetTimer: true },
      },
    )
    autoloadedVfsFilesDir.settingEl.toggleClass("hidden", !this.plugin.settings.compilerVfsEnabled);
  }
}
