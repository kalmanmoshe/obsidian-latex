
import { EditorView, ViewUpdate } from "@codemirror/view";
import { App,Notice, PluginSettingTab, Setting,  setIcon, ToggleComponent, debounce} from "obsidian";
import MosheMathPlugin from "../main";
import { CompilerType, DEFAULT_SETTINGS } from "./settings";
import { addDropdownSetting, addToggleSetting, setPluginInstance,FileSuggest,FolderSuggest, addTextSetting, createSetting, addButtonSetting } from "obsidian-dev-utils";


interface Appearance{
	name?: string,
	description?: string,
	elText?: string,
	icon?: string,
	tooltip?: string,
	defValue?: any,
	dropDownOptions?: Record<string, string>
}

export class MosheMathSettingTab extends PluginSettingTab {
	plugin: MosheMathPlugin;
	snippetsEditor: EditorView;
	snippetsFileLocEl: HTMLElement;
	snippetVariablesFileLocEl: HTMLElement;

	constructor(app: App, plugin: MosheMathPlugin) {
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
	
	private displayGraphSettings(){
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "graph", "ballpen");
		addToggleSetting(
			containerEl,
			(value: boolean)=>{this.plugin.settings.invertColorsInDarkMode=value,this.plugin.saveSettings()},
			{
				name: "Invert colors in dark mode",
				description: "Invert colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.",
				defValue: this.plugin.settings.invertColorsInDarkMode
			}
		);
		addDropdownSetting(
			containerEl,
			(value: string) => {
				this.plugin.settings.overflowStrategy = value as "downscale" | "scroll" | "hidden";
				this.plugin.saveSettings();
			},
			{
				name: "Overflow strategy",
				description: "What to do when the content overflows the container. 'downscale' - downscale the content, 'scroll' - add a scrollbar, 'hidden' - do nothing, content will overflow.",
				dropDownOptions: {
					"downscale": "Downscale",
					"scroll": "Scroll",
					"hidden": "Hidden"
				},
				defValue: this.plugin.settings.overflowStrategy
			}
		);
		const setting = createSetting(
			containerEl, 
			{
			name: "PDF Engine Cooldown Time",
			description: "The interval (in seconds) between PDF rendering jobs. A higher value decreases performance."
			}
		);
		setting.addSlider(slider => {
			slider.setLimits(0, 5, 1);
			slider.setValue(this.plugin.settings.pdfEngineCooldown / 1000);
			slider.setDynamicTooltip();
			slider.onChange(value => {
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
				description: "Choose the LaTeX compiler for rendering diagrams. 'TeX' is the classic engine, while 'XeTeX' offers better Unicode and modern font support. Changing this may affect compatibility and output.",
				dropDownOptions: {
					"tex": "TeX",
					"xetex": "XeTeX"
				},
				defValue: this.plugin.settings.compiler
			}
		)

		addToggleSetting(
			containerEl,
			(value: boolean)=>{this.plugin.settings.saveLogs=value,this.plugin.saveSettings()},
			{
				name: "Save latex logs",
				description: "Whether to save the latex render logs (memory only not physical)",
				defValue: this.plugin.settings.saveLogs
			}
		)


	}
	private displayCachedSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "cache", "database");

		addToggleSetting(
			containerEl,
			(value: boolean) => {
				this.plugin.settings.physicalCache = value;
				this.plugin.saveSettings();
				this.plugin.swiftlatexRender.cache.togglePhysicalCache();
				physicalCacheLocationSetting.settingEl.toggleClass("hidden", !value);
			},
			{
				name: "Physical cache enabled",
				description:
					"Whether to use a physical cache for rendered diagrams. If enabled, rendered diagrams are stored on disk, improving performance for subsequent loads. When disabled, diagrams are cached in memory only, which may lead to slower performance on startup but reduces disk usage.",
				defValue: this.plugin.settings.physicalCache,
			}
		);

		const physicalCacheLocationSetting = createSetting(containerEl, {
			name: "Physical cache location",
			description: "The directory where rendered diagrams are stored. Empty for default, \"/\" for the vault root, or a specific path.",
		});

		let inputEl: HTMLInputElement | undefined;
		physicalCacheLocationSetting.addSearch((component) => {
			component
				.setPlaceholder(DEFAULT_SETTINGS.physicalCacheLocation)
				.setValue(this.plugin.settings.physicalCacheLocation)
				.onChange(
					debounce(async (value) => {
						this.plugin.settings.physicalCacheLocation = value;
						await this.plugin.saveSettings();
						this.plugin.swiftlatexRender.cache.changeCacheDirectory();
					}, 500, true)
				);
			inputEl = component.inputEl as HTMLInputElement;
			inputEl.addClass("moshe-typing-location-input-el");
		});
		if (inputEl) {
			this.snippetsFileLocEl = physicalCacheLocationSetting.settingEl;
			new FolderSuggest(this.app, inputEl);
		} else {
			console.error("Input element is undefined.");
		}

		physicalCacheLocationSetting.settingEl.toggleClass("hidden", !this.plugin.settings.physicalCache);

		addButtonSetting(
			containerEl,
			() => {
				this.plugin.swiftlatexRender.cache.removeAllCachedFiles();
				throw new Notice("Cleared cached SVGs");
			},
			{
				name: "Clear cached SVGs",
				description:
					"SVGs rendered with SwiftLatex are stored in a database, so diagrams don't have to be re-rendered from scratch every time you open a page. Use this to clear the cache and force all diagrams to be re-rendered.",
				elText: "Clear cached SVGs",
				icon: "trash",
				tooltip: "Clear cached SVGs",
			}
		);
	}


	private displayPreambleSettings(){
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Preamble", "pencil");
		addToggleSetting(
			containerEl,
			(value: boolean)=>{this.plugin.settings.mathjaxPreamblePreambleEnabled=value,this.plugin.saveSettings();},
			{
				name: "Mathjax preamble enabled.",
				description: "Whether to load mathjax preamble",
				defValue: this.plugin.settings.mathjaxPreamblePreambleEnabled
			}
		)
		const mathjaxPreambleFileLoc = createSetting(
			containerEl, 
			{
			name: "Mathjax preamble file location",
			description: "the file/directory containing the preamble for MathJax requirs reload to take effect",
			}
		)
		let inputEl1: HTMLInputElement | undefined; // Define with a possible undefined type
		mathjaxPreambleFileLoc.addSearch((component) => {
			component
				.setPlaceholder(DEFAULT_SETTINGS.mathjaxPreambleFileLocation)
				.setValue(this.plugin.settings.mathjaxPreambleFileLocation)
				.onChange(
					debounce(async (value) => {
						this.plugin.settings.mathjaxPreambleFileLocation = value;
						await this.plugin.saveSettings();
					}, 500, true)
				);

			// Ensure inputEl is assigned
			inputEl1 = component.inputEl as HTMLInputElement;
			inputEl1.addClass("moshe-typing-location-input-el");
		});
    
		// Ensure inputEl is defined before passing to FileSuggest
		if (inputEl1) {
			this.snippetsFileLocEl = mathjaxPreambleFileLoc.settingEl;
			new FileSuggest(this.app, inputEl1);
		} else {
			console.error("Input element is undefined.");
		}
		
		const virtualFilesDescription = document.createDocumentFragment();

		const description = document.createElement("span");
		description.textContent = 
		"Allows the LaTeX engine to load external files into its virtual filesystem. " + 
		"Enabling this lets you use commands such as \\include{} to reference external files. " + 
		"When disabled, all LaTeX commands must rely solely on content provided directly in the code block.";

		virtualFilesDescription.appendChild(description);

		addToggleSetting(
			containerEl,
			(value: boolean)=>{this.plugin.settings.pdfTexEnginevirtualFileSystemFilesEnabled=value;},
			{
				name: "Enable virtual files",
				description: virtualFilesDescription,
				defValue: this.plugin.settings.pdfTexEnginevirtualFileSystemFilesEnabled,
				passToSave: {didFileLocationChange: true}
			}
	);
		const virtualFilesFileLoc = createSetting(
			containerEl, 
			{
				name: "Virtual files file location",
				description: "the file/directory containing the virtual files",
			}
		)
		let inputEl2: HTMLInputElement | undefined; // Define with a possible undefined type
		virtualFilesFileLoc.addSearch((component) => {
			component
				.setPlaceholder(DEFAULT_SETTINGS.virtualFilesFileLocation)
				.setValue(this.plugin.settings.virtualFilesFileLocation)
				.onChange(
					debounce(async (value) => {
						this.plugin.settings.virtualFilesFileLocation = value;
						await this.plugin.saveSettings(true);
					}, 500, true)
				);

			// Ensure inputEl is assigned
			inputEl2 = component.inputEl as HTMLInputElement;
			inputEl2.addClass("moshe-typing-location-input-el");
		});
    
		// Ensure inputEl is defined before passing to FileSuggest
		if (inputEl2) {
			this.snippetsFileLocEl = virtualFilesFileLoc.settingEl;
			new FileSuggest(this.app, inputEl2);
		} else {
			console.error("Input element is undefined.");
		}
		const descriptionFragment = document.createDocumentFragment();
		const descriptionDetails = document.createElement("span");
		descriptionDetails.textContent = 
			"When enabled, code blocks with a header specifying a name (e.g., 'name: someAwesomeCode') " +
			"can be included directly in your LaTeX code using commands like \\include{}. " +
			"The name provided in the header identifies the code block as a virtual file. " +
			"If disabled, this functionality is unavailable. " +
			"Note: the default file extension is '.tex', unless explicitly specified.";
		descriptionFragment.appendChild(descriptionDetails);

		addToggleSetting(
			containerEl,
			(value: boolean)=>{this.plugin.settings.virtualFilesFromCodeBlocks=value},
			{
				name: "Enable virtual files from code blocks",
				description: descriptionFragment,
				defValue: this.plugin.settings.virtualFilesFromCodeBlocks,
				passToSave: {didFileLocationChange: true}
			}
		);

		addTextSetting(
			containerEl,
			(value: string)=>{this.plugin.settings.autoloadedVirtualFileSystemFiles=strToArray(value);this.plugin.updateCoorVirtualFiles()},
			{
				name: "Autoloaded virtual files",
				description: "Specify virtual files to automatically include in every LaTeX render, separated by commas. "+
				"Files listed here must exist either as named code blocks (if code-block loading is enabled) " +
				"or within the configured virtual files directory.",
				defValue: this.plugin.settings.autoloadedVirtualFileSystemFiles.join(", "),
				passToSave: {didFileLocationChange: true}
			}
		)

	}
}

function strToArray(str: string) {
	return str.replace(/\s/g,"").split(",").filter((s)=>s.length>0);
}
