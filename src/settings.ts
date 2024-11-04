import { App, Notice, PluginSettingTab, Setting ,Component} from "obsidian";
import MathPlugin from "./main";
import { Interface } from "readline";
import * as localForage from "localforage";

export interface MathPluginSettings {
    invertColorsInDarkMode: boolean;
    numberFormatting: string
    background: string;
    evenRowBackground: string;
    oddRowBackground: string;
    infoModalBackground: string;
    fontSize: string;
    rowPadding: string;
    iconSize: string;
    sessionHistory: { input: string, result: string }[]; 
}

export const DEFAULT_SETTINGS: MathPluginSettings = {
    invertColorsInDarkMode: true,
    numberFormatting: ".000",
    background: "#44475A",
    evenRowBackground: "#f9f9f9",
    oddRowBackground: "#747688",
    infoModalBackground: "#002B36",
    fontSize: "0.85em",
    rowPadding: "5px 10px",
    iconSize: "14px",
    sessionHistory: []
};

  

export class MathPluginSettingTab extends PluginSettingTab {
    plugin: MathPlugin;
    settings: MathPluginSettings;
    
    constructor(app: App,plugin: MathPlugin) {
      super(app,plugin);
      try {
        localForage.config({ name: "TikzJax", storeName: "svgImages" });
      } catch (error) {
        console.log(error);
      }
    }
    
    updateStyles() {
        const root = document.documentElement;
        root.style.setProperty("--row-background", this.settings.background);
        root.style.setProperty("--even-row-background", this.settings.evenRowBackground);
        root.style.setProperty("--odd-row-background", this.settings.oddRowBackground);
        root.style.setProperty("--info-modal-column-background", this.settings.infoModalBackground);
        root.style.setProperty("--font-size", this.settings.fontSize);
        root.style.setProperty("--row-padding", this.settings.rowPadding);
        root.style.setProperty("--icon-size", this.settings.iconSize);
    }

    display(): void {
      const { containerEl } = this;
      const toSetOptions=[
        {value: 1000,display: "formatted .000" },
        {value: 10000,display: "formatted .0000" },
        {value: 100000,display: "formatted .00000" },
      ]
  
      containerEl.empty();
      containerEl.createEl("h2", { text: "Math Plugin Settings" });
      new Setting(containerEl)
			.setName("Invert dark colors in dark mode")
			.setDesc("Invert dark colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.invertColorsInDarkMode)
				.onChange(async (value) => {
					this.plugin.settings.invertColorsInDarkMode = value;

					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName("Clear cached SVGs")
			.setDesc("SVGs rendered with TikZJax are stored in a database, so diagrams don't have to be re-rendered from scratch every time you open a page. Use this to clear the cache and force all diagrams to be re-rendered.")
			.addButton(button => button
				.setIcon("trash")
				.setTooltip("Clear cached SVGs")
				.onClick(async () => {
					localForage.clear((err) => {
						if (err) {
							console.log(err);
							new Notice(err, 3000);
						}
						else {
							new Notice("TikZJax: Successfully cleared cached SVGs.", 3000);
						}
					});
				}));
      this.addMultiChoiceSetting(containerEl, "Rendered number format", "Choose how to format numbers in the result", toSetOptions,"numberFormatting");
      containerEl.createEl("h2", { text: "Math Plugin style" });
      
      // Add various settings
      this.addColorSetting(containerEl, "Background Color", "Set the background color.", "background");
      this.addColorSetting(containerEl, "Even Row Background Color", "Set the background color for even rows.", "evenRowBackground");
      this.addColorSetting(containerEl, "Odd Row Background Color", "Set the background color for odd rows.", "oddRowBackground");
      this.addColorSetting(containerEl, "infoModal Background Color", "Set the background color for the info modal.", "infoModalBackground");
      
      this.addFontSetting(containerEl, "Font Size", "Set the font size for the rows.", "fontSize");
      this.addFontSetting(containerEl, "Row Padding", "Set the padding for the rows.", "rowPadding");
      this.addFontSetting(containerEl, "Icon Size", "Set the size of the icons.", "iconSize");
  
      new Setting(containerEl)
        .addButton(button =>
          button
            .setButtonText("Wipe History Module")
            .setTooltip("Reset all settings to their default values")
            .onClick(async () => {
              this.plugin.settings.sessionHistory = [];
             new Notice("History was wiped.")
            }));

      new Setting(containerEl)
      .addButton(button =>
        button
          .setButtonText("Reset to Default")
          .setTooltip("Reset all settings to their default values")
          .onClick(async () => {
            await this.resetToDefault();
          }));
    }

    private addMultiChoiceSetting(containerEl: HTMLElement, name: string, description: string, choices: any,settingKey: keyof MathPluginSettings) {
      if (settingKey === "sessionHistory") {
        console.error("sessionHistory cannot be modified with addFontSetting (string expected).");
        return;
      }
  
        new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addDropdown(dropdown => {
          choices.forEach((choice: any) => {
            dropdown.addOption(choice.value,choice.display);
          });
          dropdown.onChange(async (value) => {
             (this.plugin.settings[settingKey]as string) = value;
              await this.plugin.saveSettings();
              this.updateStyles();
          });
        });
    }
  
    private addColorSetting(containerEl: HTMLElement, name: string, description: string, settingKey: keyof MathPluginSettings) {
      if (settingKey === "sessionHistory") {
        console.error("sessionHistory cannot be modified with addSetting (string expected).");
        return;
      }
    
      new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addColorPicker(colorPicker => {
          const settingValue = this.plugin.settings[settingKey];
          
          if (typeof settingValue === "string") { 
            colorPicker.setValue(settingValue);
          }
          
          colorPicker.onChange(async (value) => {
            if (typeof this.plugin.settings[settingKey] === "string") {
              (this.plugin.settings[settingKey]as string)  = value;
              await this.plugin.saveSettings();
              this.updateStyles();
            } else {
              console.error(`Cannot assign a string value to ${settingKey} (non-string setting).`);
            }
          });
        });
    }
    
    private addFontSetting(containerEl: HTMLElement, name: string, description: string, settingKey: keyof MathPluginSettings) {
      // Ensure that 'sessionHistory' is not being processed by addFontSetting
      if (settingKey === "sessionHistory") {
        console.error("sessionHistory cannot be modified with addFontSetting (string expected).");
        return;
      }
    
      new Setting(containerEl)
        .setName(name)
        .setDesc(description)
        .addText((text: any) => {
          const settingValue = this.plugin.settings[settingKey];
          
          // Ensure that the setting is a string
          if (typeof settingValue === "string") { 
            text.setPlaceholder(settingValue).setValue(settingValue);
          }
          
          text.onChange(async (value: string) => {
            // Ensure we are only assigning to string settings
            if (typeof this.plugin.settings[settingKey] === "string") {
              (this.plugin.settings[settingKey]as string)  = value;
              await this.plugin.saveSettings();
              this.updateStyles();
            } else {
              console.error(`Cannot assign a string value to ${settingKey} (non-string setting).`);
            }
          });
        });
    }
    
    // Reset settings to default values
    private async resetToDefault() {
      this.plugin.settings = { ...DEFAULT_SETTINGS };
      await this.plugin.saveSettings();
      this.updateStyles();
      new Notice("Settings have been reset to default.");
      this.display();
    }
  }

export function createTextInputSetting(
    container: HTMLElement,
    name: string,
    description: string,
    placeholder = "",
    settingKey?: string,
    additionalClass?: string
  ): string | void {
    let currentValue = settingKey || "";
  
    const setting = new Setting(container)
      .setName(name || "")
      .setDesc(description || "")
      .addText(text => {
        text.setPlaceholder(placeholder);
        text.setValue(currentValue);
        text.onChange(value => {
          currentValue = value;
          if (settingKey !== undefined) settingKey = currentValue; // only update if settingKey is passed
        });
      });
  
    if (additionalClass) {
      setting.settingEl.addClass(additionalClass);
    }
  
    return settingKey ? currentValue : undefined;
  }
  