
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
		this.addToggleSetting(
			containerEl,
			"Invert dark colors in dark mode",
			"Invert dark colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.",
			this.plugin.settings.invertColorsInDarkMode
		);
		this.addButtonSetting(
			containerEl,
			() =>{
				this.plugin.swiftlatexRender.removeAllCachedSvgs();
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
			(value: boolean)=>{this.plugin.settings.preambleEnabled=value,this.plugin.saveSettings()},
			{
				name: "Enabled",
				description: "Whether to load a preamble file for mathjax.",
				defValue: this.plugin.settings.preambleEnabled
			}
		)

		const preambleFileLoc = createSetting(
			containerEl, 
			{
			name: "Preamble file location",
			description: "The file to load the preamble from."
			}
		)
		let inputEl: HTMLInputElement | undefined; // Define with a possible undefined type

		preambleFileLoc.addSearch((component) => {
			component
				.setPlaceholder(DEFAULT_SETTINGS.preambleFileLocation)
				.setValue(this.plugin.settings.preambleFileLocation)
				.onChange(
					debounce(async (value) => {
						this.plugin.settings.preambleFileLocation = value;
						await this.plugin.saveSettings(true);
					}, 500, true)
				);

			// Ensure inputEl is assigned
			inputEl = component.inputEl as HTMLInputElement;
			inputEl.addClass("moshe-typing-location-input-el");
		});
    
		// Ensure inputEl is defined before passing to FileSuggest
		if (inputEl) {
			this.snippetsFileLocEl = preambleFileLoc.settingEl;
			new staticMosheMathTypingApi!.fileSuggest(this.app, inputEl);
		} else {
			console.error("Input element is undefined.");
		}
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
  private addToggleSetting(containerEl: HTMLElement, name: string, description: string, settingKey: any) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((toggle: ToggleComponent) => {
        toggle.setValue(settingKey)
        toggle.onChange(async (value) => {
          settingKey = value;
          await this.plugin.saveSettings();
        });
      });
  }

}

function createSetting(containerEl: HTMLElement, basicAppearance:{name?: string, description?: string}) {
	const setting = new Setting(containerEl);
	const { name, description } = basicAppearance;
	name && setting.setName(name);
	description && setting.setDesc(description);
	return setting;
}