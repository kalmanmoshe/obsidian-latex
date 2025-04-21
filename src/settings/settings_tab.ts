
import { EditorView, ViewUpdate } from "@codemirror/view";
import { App,Notice, PluginSettingTab, Setting,  setIcon, ToggleComponent, debounce} from "obsidian";
import MosheMathPlugin, {staticMosheMathTypingApi} from "../main";
import { DEFAULT_SETTINGS } from "./settings";


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
		if(staticMosheMathTypingApi===null){
			new Notice("Could not find moshe-math-typing plugin. Please install and/or activate it");
			return;
		}
		const { containerEl } = this;
		containerEl.empty();
		this.displayGraphSettings();
		this.displayPreambleSettings();
		this.displayMathBlockSettings();
	}
	
	private displayGraphSettings(){
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "graph", "ballpen");
		staticMosheMathTypingApi!.addToggleSetting(
			containerEl,this.plugin,
			(value: boolean)=>{this.plugin.settings.invertColorsInDarkMode=value,this.plugin.saveSettings()},
			{
				name: "Invert colors in dark mode",
				description: "Invert colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.",
				defValue: this.plugin.settings.invertColorsInDarkMode
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

		staticMosheMathTypingApi!.addToggleSetting(
			containerEl,this.plugin,
			(value: boolean)=>{this.plugin.settings.saveLogs=value,this.plugin.saveSettings()},
			{
				name: "Save latex logs",
				description: "Whether to save the latex render logs (memory only not physical)",
				defValue: this.plugin.settings.saveLogs
			}
		)
		this.addButtonSetting(
			containerEl,
			() =>{
				this.plugin.swiftlatexRender.cache.removeAllCachedSvgs();
				throw new Notice("Cleared cached SVGs");
			},
			{
				name: "Clear cached SVGs",
				description: "SVGs rendered with SwiftLatex are stored in a database, so diagrams don't have to be re-rendered from scratch every time you open a page. Use this to clear the cache and force all diagrams to be re-rendered.",
				elText: "Clear cached SVGs",
				icon: "trash",
				tooltip: "Clear cached SVGs",
			}
		)

	}
	private displayPreambleSettings(){
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Preamble", "pencil");
		staticMosheMathTypingApi!.addToggleSetting(
			containerEl,this.plugin,
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
			new staticMosheMathTypingApi!.fileSuggest(this.app, inputEl1);
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

		staticMosheMathTypingApi!.addToggleSetting(
			containerEl,this.plugin,
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
			new staticMosheMathTypingApi!.fileSuggest(this.app, inputEl2);
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

		staticMosheMathTypingApi!.addToggleSetting(
			containerEl,this.plugin,
			(value: boolean)=>{this.plugin.settings.virtualFilesFromCodeBlocks=value},
			{
				name: "Enable virtual files from code blocks",
				description: descriptionFragment,
				defValue: this.plugin.settings.virtualFilesFromCodeBlocks,
				passToSave: {didFileLocationChange: true}
			}
		);

		staticMosheMathTypingApi!.addTextSetting(
			containerEl,this.plugin,
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

	private displayMathBlockSettings(){
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Math blocks", "math");
		this.addDropdownSetting(
			containerEl, 
			{
				name: "Math block language",
				description: "The language to use for rendering math blocks.",
				dropDownOptions: {
					'1000': "formatted .000",
					"10000": "formatted .0000",
					'100000': "formatted .00000",
				}
			},
			(value: string) => {
				const number=parseInt(value);
				this.plugin.settings.numberFormatting=number;
			}
		)
	}

  private addDropdownSetting(containerEl: HTMLElement, appearance:Appearance,callback: any){
	const setting = createSetting(containerEl, appearance);
	const { dropDownOptions} = appearance;
	setting.addDropdown(dropdown => {
		dropDownOptions&&dropdown.addOptions(dropDownOptions);
		dropdown.onChange(async (value) => {
			callback(value);
			await this.plugin.saveSettings();
		});
	})
  }

  private addButtonSetting(containerEl: HTMLElement,action: any, appearance: Appearance){
	const setting = createSetting(containerEl, appearance);
	const { elText, icon, tooltip } = appearance;
	setting.addButton(button => {
		elText && button.setButtonText(elText);
		icon && button.setIcon(icon);
		tooltip && button.setTooltip(tooltip);
		button.onClick(async () => {
			action();
			await this.plugin.saveSettings();
		});
	});

  }

}

function strToArray(str: string) {
	return str.replace(/\s/g,"").split(",").filter((s)=>s.length>0);
}

function createSetting(containerEl: HTMLElement, basicAppearance:{name?: string, description?: string}) {
	const setting = new Setting(containerEl);
	const { name, description } = basicAppearance;
	name && setting.setName(name);
	description && setting.setDesc(description);
	return setting;
}
