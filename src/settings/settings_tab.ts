import { EditorState, Extension } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { App, ButtonComponent,Notice, ExtraButtonComponent, Modal, PluginSettingTab, Setting, debounce, setIcon } from "obsidian";
import { parseSnippetVariables, parseSnippets } from "src/snippets/parse";
import { DEFAULT_SNIPPETS } from "src/utils/default_snippets";
import LatexSuitePlugin from "../main";
import { DEFAULT_SETTINGS } from "./settings";
import { FileSuggest } from "./ui/file_suggest";
import { basicSetup } from "./ui/snippets_editor/extensions";
import * as localForage from "localforage";

export class LatexSuiteSettingTab extends PluginSettingTab {
	plugin: LatexSuitePlugin;
	snippetsEditor: EditorView;
	snippetsFileLocEl: HTMLElement;
	snippetVariablesFileLocEl: HTMLElement;

	constructor(app: App, plugin: LatexSuitePlugin) {
		super(app, plugin);
		this.plugin = plugin;
    try {
      localForage.config({ name: "TikzJax", storeName: "svgImages" });
    } catch (error) {
      console.log(error);
    }
	}

	hide() {
		this.snippetsEditor?.destroy();
	}

	addHeading(containerEl: HTMLElement, name: string, icon = "math") {
		const heading = new Setting(containerEl).setName(name).setHeading();

		const parentEl = heading.settingEl;
		const iconEl = parentEl.createDiv();
		setIcon(iconEl, icon);
		iconEl.addClass("latex-suite-settings-icon");

		parentEl.prepend(iconEl);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.displaySnippetSettings();
		this.displayConcealSettings();
		this.displayColorHighlightBracketsSettings();
		this.displayPopupPreviewSettings();
		this.displayAutofractionSettings();
		this.displayMatrixShortcutsSettings();
		this.displayTaboutSettings();
		this.displayAutoEnlargeBracketsSettings();
		this.displayAdvancedSnippetSettings();
	}

	private displaySnippetSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Snippets", "ballpen");

		new Setting(containerEl)
			.setName("Enabled")
			.setDesc("Whether snippets are enabled.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.snippetsEnabled)
				.onChange(async (value) => {
					this.plugin.settings.snippetsEnabled = value;
					await this.plugin.saveSettings();
				}));


		const snippetsSetting = new Setting(containerEl)
			.setName("Snippets")
			.setDesc("Enter snippets here.  Remember to add a comma after each snippet, and escape all backslashes with an extra \\. Lines starting with \"//\" will be treated as comments and ignored.")
			.setClass("snippets-text-area");


		this.createSnippetsEditor(snippetsSetting);


		new Setting(containerEl)
			.setName("Load snippets from file or folder")
			.setDesc("Whether to load snippets from a specified file, or from all files within a folder (instead of from the plugin settings).")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.loadSnippetsFromFile)
				.onChange(async (value) => {
					this.plugin.settings.loadSnippetsFromFile = value;

					snippetsSetting.settingEl.toggleClass("hidden", value);
					if (this.snippetsFileLocEl != undefined)
						this.snippetsFileLocEl.toggleClass("hidden", !value);

					await this.plugin.saveSettings();
				}));


		const snippetsFileLocDesc = new DocumentFragment();
		snippetsFileLocDesc.createDiv({}, div => {
			div.innerHTML = `
			The file or folder to load snippets from. The file or folder must be within your vault, and not within a hidden folder (such as <code>.obsidian/</code>).`;
		});

		const snippetsFileLoc = new Setting(containerEl)
    .setName("Snippets file or folder location")
    .setDesc(snippetsFileLocDesc);

    let inputEl: HTMLInputElement | undefined; // Define with a possible undefined type

    snippetsFileLoc.addSearch((component) => {
        component
            .setPlaceholder(DEFAULT_SETTINGS.snippetsFileLocation)
            .setValue(this.plugin.settings.snippetsFileLocation)
            .onChange(
                debounce(async (value) => {
                    this.plugin.settings.snippetsFileLocation = value;
                    await this.plugin.saveSettings(true);
                }, 500, true)
            );
    
        // Ensure inputEl is assigned
        inputEl = component.inputEl as HTMLInputElement;
        inputEl.addClass("latex-suite-location-input-el");
    });
    
    // Ensure inputEl is defined before passing to FileSuggest
    if (inputEl) {
        this.snippetsFileLocEl = snippetsFileLoc.settingEl;
        new FileSuggest(this.app, inputEl);
    } else {
        console.error("Input element is undefined.");
    }


		// Hide settings that are not relevant when "loadSnippetsFromFile" is set to true/false
		const loadSnippetsFromFile = this.plugin.settings.loadSnippetsFromFile;
		snippetsSetting.settingEl.toggleClass("hidden", loadSnippetsFromFile);
		this.snippetsFileLocEl.toggleClass("hidden", !loadSnippetsFromFile);


		new Setting(containerEl)
			.setName("Key trigger for non-auto snippets")
			.setDesc("What key to press to expand non-auto snippets.")
			.addDropdown((dropdown) => dropdown
				.addOption("Tab", "Tab")
				.addOption(" ", "Space")
				.setValue(this.plugin.settings.snippetsTrigger)
				.onChange(async (value) => {
					this.plugin.settings.snippetsTrigger = value as "Tab" |
						" ";
					await this.plugin.saveSettings();
				})
			);
	}

	private displayConcealSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Conceal", "math-integral-x");

		const fragment = new DocumentFragment();
		fragment.createDiv({}, div => div.setText("Make equations more readable by hiding LaTeX syntax and instead displaying it in a pretty format."));
		fragment.createDiv({}, div => div.innerHTML = `
			e.g. <code>\\dot{x}^{2} + \\dot{y}^{2}</code> will display as ẋ² + ẏ², and <code>\\sqrt{ 1-\\beta^{2} }</code> will display as √{ 1-β² }.
		`);
		fragment.createDiv({}, div => div.setText("LaTeX beneath the cursor will be revealed."));
		fragment.createEl("br");
		fragment.createDiv({}, div => div.setText("Disabled by default to not confuse new users. However, I recommend turning this on once you are comfortable with the plugin!"));

		new Setting(containerEl)
			.setName("Enabled")
			.setDesc(fragment)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.concealEnabled)
				.onChange(async (value) => {
					this.plugin.settings.concealEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		const fragment2 = new DocumentFragment();
		fragment2.createDiv({}, div => div.setText("How long to delay the reveal of LaTeX for, in milliseconds, when the cursor moves over LaTeX. Defaults to 0 (LaTeX under the cursor is revealed immediately)."));
		fragment2.createEl("br");
		fragment2.createDiv({}, div => div.setText("Can be set to a positive number, e.g. 300, to delay the reveal of LaTeX, making it much easier to navigate equations using arrow keys."));
		fragment2.createEl("br");
		fragment2.createDiv({}, div => div.setText("Must be an integer ≥ 0."));

		new Setting(containerEl)
			.setName("Reveal delay (ms)")
			.setDesc(fragment2)
			.addText(text => text
				.setPlaceholder(String(DEFAULT_SETTINGS.concealRevealTimeout))
				.setValue(String(this.plugin.settings.concealRevealTimeout))
				.onChange(value => {
					// Make sure the value is a non-negative integer
					const ok = /^\d+$/.test(value);
					if (ok) {
						this.plugin.settings.concealRevealTimeout = Number(value);
						this.plugin.saveSettings();
					}
				})
			);

	}

	private displayColorHighlightBracketsSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Highlight and color brackets", "parentheses");
    this.addToggleSetting(containerEl,"Color paired brackets","Whether to colorize matching brackets.",this.plugin.settings.colorPairedBracketsEnabled)
    this.addToggleSetting(containerEl,"Highlight matching bracket beneath cursor","When the cursor is adjacent to a bracket, highlight the matching bracket.",this.plugin.settings.highlightCursorBracketsEnabled)
	}

	private displayPopupPreviewSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Math popup preview", "superscript");

		const popup_fragment = document.createDocumentFragment();
		const popup_line1 = document.createElement("div");
		popup_line1.setText("When inside an equation, show a popup preview window of the rendered math.");
		const popup_space = document.createElement("br");
		const popup_line2 = document.createElement("div");
		popup_line2.setText("The popup preview will be shown for all inline math equations, as well as for block math equations in Source mode.");
		popup_fragment.append(popup_line1, popup_space, popup_line2);

		new Setting(containerEl)
			.setName("Enabled")
			.setDesc(popup_fragment)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.mathPreviewEnabled)
				.onChange(async (value) => {
					this.plugin.settings.mathPreviewEnabled = value;

					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Position")
			.setDesc("Where to display the popup preview relative to the equation source.")
			.addDropdown((dropdown) => dropdown
				.addOption("Above", "Above")
				.addOption("Below", "Below")
				.setValue(this.plugin.settings.mathPreviewPositionIsAbove ? "Above" : "Below")
				.onChange(async (value) => {
					this.plugin.settings.mathPreviewPositionIsAbove = (value === "Above");
					await this.plugin.saveSettings();
				})
			);
	}

	private displayAutofractionSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Auto-fraction", "math-x-divide-y-2");

		new Setting(containerEl)
			.setName("Enabled")
			.setDesc("Whether auto-fraction is enabled.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autofractionEnabled)
				.onChange(async (value) => {
					this.plugin.settings.autofractionEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Fraction symbol")
			.setDesc("The fraction symbol to use in the replacement. e.g. \\frac, \\dfrac, \\tfrac")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.autofractionSymbol)
				.setValue(this.plugin.settings.autofractionSymbol)
				.onChange(async (value) => {
					this.plugin.settings.autofractionSymbol = value;

					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName("Excluded environments")
			.setDesc("A list of environments to exclude auto-fraction from running in. For example, to exclude auto-fraction from running while inside an exponent, such as e^{...}, use  [\"^{\", \"}\"]")
			.addTextArea(text => text
				.setPlaceholder("[ [\"^{\", \"}] ]")
				.setValue(this.plugin.settings.autofractionExcludedEnvs)
				.onChange(async (value) => {
					this.plugin.settings.autofractionExcludedEnvs = value;
					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName("Breaking characters")
			.setDesc("A list of characters that denote the start/end of a fraction. e.g. if + is included in the list, \"a+b/c\" will expand to \"a+\\frac{b}{c}\". If + is not in the list, it will expand to \"\\frac{a+b}{c}\".")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.autofractionBreakingChars)
				.setValue(this.plugin.settings.autofractionBreakingChars)
				.onChange(async (value) => {
					this.plugin.settings.autofractionBreakingChars = value;

					await this.plugin.saveSettings();
				}));
	}

	private displayMatrixShortcutsSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Matrix shortcuts", "brackets-contain");

		new Setting(containerEl)
			.setName("Enabled")
			.setDesc("Whether matrix shortcuts are enabled.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.matrixShortcutsEnabled)
				.onChange(async (value) => {
					this.plugin.settings.matrixShortcutsEnabled = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Environments")
			.setDesc("A list of environment names to run the matrix shortcuts in, separated by commas.")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.matrixShortcutsEnvNames)
				.setValue(this.plugin.settings.matrixShortcutsEnvNames)
				.onChange(async (value) => {
					this.plugin.settings.matrixShortcutsEnvNames = value;

					await this.plugin.saveSettings();
				}));

	}

	private displayTaboutSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Tabout", "tabout");

		new Setting(containerEl)
			.setName("Enabled")
			.setDesc("Whether tabout is enabled.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.taboutEnabled)
				.onChange(async (value) => {
					this.plugin.settings.taboutEnabled = value;
					await this.plugin.saveSettings();
				}));
	}

	private displayAutoEnlargeBracketsSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Auto-enlarge brackets", "parentheses");

		new Setting(containerEl)
			.setName("Enabled")
			.setDesc("Whether to automatically enlarge brackets containing e.g. sum, int, frac.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoEnlargeBrackets)
				.onChange(async (value) => {
					this.plugin.settings.autoEnlargeBrackets = value;
					await this.plugin.saveSettings();
				}));


		new Setting(containerEl)
			.setName("Triggers")
			.setDesc("A list of symbols that should trigger auto-enlarge brackets, separated by commas.")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.autoEnlargeBracketsTriggers)
				.setValue(this.plugin.settings.autoEnlargeBracketsTriggers)
				.onChange(async (value) => {
					this.plugin.settings.autoEnlargeBracketsTriggers = value;

					await this.plugin.saveSettings();
				}));
	}

	private displayAdvancedSnippetSettings() {
		const containerEl = this.containerEl;
		this.addHeading(containerEl, "Advanced snippet settings");

		const snippetVariablesSetting = new Setting(containerEl)
			.setName("Snippet variables")
			.setDesc("Assign snippet variables that can be used as shortcuts when writing snippets.")
			.addTextArea(text => text
				.setValue(this.plugin.settings.snippetVariables)
				.onChange(async (value) => {
					this.plugin.settings.snippetVariables = value;
					await this.plugin.saveSettings();
				})
				.setPlaceholder(DEFAULT_SETTINGS.snippetVariables))
			.setClass("latex-suite-snippet-variables-setting");

		new Setting(containerEl)
			.setName("Load snippet variables from file or folder")
			.setDesc("Whether to load snippet variables from a specified file, or from all files within a folder (instead of from the plugin settings).")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.loadSnippetVariablesFromFile)
				.onChange(async (value) => {
					this.plugin.settings.loadSnippetVariablesFromFile = value;

					snippetVariablesSetting.settingEl.toggleClass("hidden", value);
					if (this.snippetVariablesFileLocEl != undefined)
						this.snippetVariablesFileLocEl.toggleClass("hidden", !value);

					await this.plugin.saveSettings();
				}));

		const snippetVariablesFileLocDesc = new DocumentFragment();
		snippetVariablesFileLocDesc.createDiv({}, (div) => {
			div.innerHTML = `
			The file or folder to load snippet variables from. The file or folder must be within your vault, and not within a hidden folder (such as <code>.obsidian/</code>).`;
		});

		const snippetVariablesFileLoc = new Setting(containerEl)
    .setName("Snippet variables file or folder location")
    .setDesc(snippetVariablesFileLocDesc);


    let inputVariablesEl: HTMLInputElement | undefined; // Allow potential undefined values

    snippetVariablesFileLoc.addSearch((component) => {
        component
            .setPlaceholder(DEFAULT_SETTINGS.snippetVariablesFileLocation)
            .setValue(this.plugin.settings.snippetVariablesFileLocation)
            .onChange(
                debounce(async (value) => {
                    this.plugin.settings.snippetVariablesFileLocation = value;
                    await this.plugin.saveSettings(true);
                }, 500, true)
            );
    
        // Ensure inputVariablesEl is assigned correctly
        inputVariablesEl = component.inputEl as HTMLInputElement;
        inputVariablesEl.addClass("latex-suite-location-input-el");
    });
    
    // Ensure inputVariablesEl is defined before passing it to FileSuggest
    if (inputVariablesEl) {
        this.snippetVariablesFileLocEl = snippetVariablesFileLoc.settingEl;
        new FileSuggest(this.app, inputVariablesEl);
    } else {
        console.error("Input element for variables is undefined.");
    }


		// Hide settings that are not relevant when "loadSnippetsFromFile" is set to true/false
		const loadSnippetVariablesFromFile = this.plugin.settings.loadSnippetVariablesFromFile;
		snippetVariablesSetting.settingEl.toggleClass("hidden", loadSnippetVariablesFromFile);
		this.snippetVariablesFileLocEl.toggleClass("hidden", !loadSnippetVariablesFromFile);

		new Setting(containerEl)
			.setName("Word delimiters")
			.setDesc("Symbols that will be treated as word delimiters, for use with the \"w\" snippet option.")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.wordDelimiters)
				.setValue(this.plugin.settings.wordDelimiters)
				.onChange(async (value) => {
					this.plugin.settings.wordDelimiters = value;

					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Remove trailing whitespaces in snippets in inline math")
			.setDesc("Whether to remove trailing whitespaces when expanding snippets at the end of inline math blocks.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeSnippetWhitespace)
				.onChange(async (value) => {
					this.plugin.settings.removeSnippetWhitespace = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName("Remove closing $ when backspacing inside blank inline math")
		.setDesc("Whether to also remove the closing $ when you delete the opening $ symbol inside blank inline math.")
		.addToggle((toggle) => toggle
			.setValue(this.plugin.settings.autoDelete$)
			.onChange(async (value) => {
				this.plugin.settings.autoDelete$ = value;
				await this.plugin.saveSettings();
			}));

		new Setting(containerEl)
			.setName("Don't trigger snippets when IME is active")
			.setDesc("Whether to suppress snippets triggering when an IME is active.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.suppressSnippetTriggerOnIME)
				.onChange(async (value) => {
					this.plugin.settings.suppressSnippetTriggerOnIME = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Code languages to interpret as math mode")
			.setDesc("Codeblock languages where the whole code block should be treated like a math block, separated by commas.")
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.forceMathLanguages)
				.setValue(this.plugin.settings.forceMathLanguages)
				.onChange(async (value) => {
					this.plugin.settings.forceMathLanguages = value;

					await this.plugin.saveSettings();
				}));
	}

  private displayStyleSettings(){
    const containerEl = this.containerEl;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Math Plugin Settings" });

    this.addToggleSetting(containerEl,"Invert dark colors in dark mode","Invert dark colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.",this.plugin.settings.invertColorsInDarkMode)


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

      new Setting(containerEl)
        .setName( "Rendered number format")
        .setDesc("Choose how to format numbers in the result.")
        .addDropdown(dropdown => {
          dropdown.addOption('1000',"formatted .000");
          dropdown.addOption('10000',"formatted .0000");
          dropdown.addOption('100000',"formatted .00000");
          dropdown.onChange(async (value) => {
			await this.plugin.saveSettings();
          });
        });


      containerEl.createEl("h2", { text: "Math Plugin style" });

      this.addColorSetting(containerEl, "Background Color", "Set the background color.", "background");
      this.addColorSetting(containerEl, "Even Row Background Color", "Set the background color for even rows.", "evenRowBackground");
      this.addColorSetting(containerEl, "Odd Row Background Color", "Set the background color for odd rows.", "oddRowBackground");
      this.addColorSetting(containerEl, "infoModal Background Color", "Set the background color for the info modal.", "infoModalBackground");
      
      this.addTextSetting(containerEl, "Font Size", "Set the font size for the rows.", "fontSize");
      this.addTextSetting(containerEl, "Row Padding", "Set the padding for the rows.", "rowPadding");
      this.addTextSetting(containerEl, "Icon Size", "Set the size of the icons.", "iconSize");
  
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
            this.plugin.settings = { ...DEFAULT_SETTINGS };
            await this.plugin.saveSettings();
            this.updateStyles();
            new Notice("Settings have been reset to default.");
            this.display();
        }));

  }
  private addColorSetting(containerEl: HTMLElement, name: string, description: string, settingKey: any) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addColorPicker(colorPicker => {
        colorPicker.setValue(settingKey);
        colorPicker.onChange(async (value) => {
          settingKey = value;
          await this.plugin.saveSettings();
          this.updateStyles();
        });
      });
  }
  private addToggleSetting(containerEl: HTMLElement, name: string, description: string, settingKey: any) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((toggle : any) => {
        toggle.setValue(settingKey)
        toggle.onChange(async (value: string) => {
          settingKey= value;
          await this.plugin.saveSettings();
          this.updateStyles();
        });
      });
  }
  private addTextSetting(containerEl: HTMLElement, name: string, description: string, settingKey: any) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addText((text: any) => {
        text.setPlaceholder(settingKey).setValue(settingKey);
        text.onChange(async (value: string) => {
          settingKey= value;
          await this.plugin.saveSettings();
          this.updateStyles();
        });
      });
  }
  updateStyles() {
    const root = document.documentElement;
    root.style.setProperty("--row-background", this.plugin.settings.background);
    root.style.setProperty("--even-row-background", this.plugin.settings.evenRowBackground);
    root.style.setProperty("--odd-row-background", this.plugin.settings.oddRowBackground);
    root.style.setProperty("--info-modal-column-background", this.plugin.settings.infoModalBackground);
    root.style.setProperty("--font-size", this.plugin.settings.fontSize);
    root.style.setProperty("--row-padding", this.plugin.settings.rowPadding);
    root.style.setProperty("--icon-size", this.plugin.settings.iconSize);
}
	createSnippetsEditor(snippetsSetting: Setting) {
		const customCSSWrapper = snippetsSetting.controlEl.createDiv("snippets-editor-wrapper");
		const snippetsFooter = snippetsSetting.controlEl.createDiv("snippets-footer");
		const validity = snippetsFooter.createDiv("snippets-editor-validity");

		const validityIndicator = new ExtraButtonComponent(validity);
		validityIndicator.setIcon("checkmark")
			.extraSettingsEl.addClass("snippets-editor-validity-indicator");

		const validityText = validity.createDiv("snippets-editor-validity-text");
		validityText.addClass("setting-item-description");
		validityText.style.padding = "0";


		function updateValidityIndicator(success: boolean) {
			validityIndicator.setIcon(success ? "checkmark" : "cross");
			validityIndicator.extraSettingsEl.removeClass(success ? "invalid" : "valid");
			validityIndicator.extraSettingsEl.addClass(success ? "valid" : "invalid");
			validityText.setText(success ? "Saved" : "Invalid syntax. Changes not saved");
		}


		const extensions = basicSetup;

		const change = EditorView.updateListener.of(async (v: ViewUpdate) => {
			if (v.docChanged) {
				const snippets = v.state.doc.toString();
				let success = true;

				let snippetVariables;
				try {
					snippetVariables = await parseSnippetVariables(this.plugin.settings.snippetVariables)
					await parseSnippets(snippets, snippetVariables);
				}
				catch (e) {
					success = false;
				}

				updateValidityIndicator(success);

				if (!success) return;

				this.plugin.settings.snippets = snippets;
				await this.plugin.saveSettings();
			}
		});
    
		extensions.push(change);

		this.snippetsEditor = createCMEditor(this.plugin.settings.snippets, extensions);
		customCSSWrapper.appendChild(this.snippetsEditor.dom);


		const buttonsDiv = snippetsFooter.createDiv("snippets-editor-buttons");
		const reset = new ButtonComponent(buttonsDiv);
		reset.setIcon("switch")
			.setTooltip("Reset to default snippets")
			.onClick(async () => {
				new ConfirmationModal(this.plugin.app,
					"Are you sure? This will delete any custom snippets you have written.",
					button => button
						.setButtonText("Reset to default snippets")
						.setWarning(),
					async () => {
						this.snippetsEditor.setState(EditorState.create({ doc: DEFAULT_SNIPPETS, extensions: extensions }));
						updateValidityIndicator(true);

						this.plugin.settings.snippets = DEFAULT_SNIPPETS;

						await this.plugin.saveSettings();
					}
				).open();
			});

		const remove = new ButtonComponent(buttonsDiv);
		remove.setIcon("trash")
			.setTooltip("Remove all snippets")
			.onClick(async () => {
				new ConfirmationModal(this.plugin.app,
					"Are you sure? This will delete any custom snippets you have written.",
					button => button
						.setButtonText("Remove all snippets")
						.setWarning(),
					async () => {
						const value = `[

]`;
						this.snippetsEditor.setState(EditorState.create({ doc: value, extensions: extensions }));
						updateValidityIndicator(true);

						this.plugin.settings.snippets = value;
						await this.plugin.saveSettings();
					}
				).open();
			});
	}
}

class ConfirmationModal extends Modal {

	constructor(app: App, body: string, buttonCallback: (button: ButtonComponent) => void, clickCallback: () => Promise<void>) {
		super(app);

		this.contentEl.addClass("latex-suite-confirmation-modal");
		this.contentEl.createEl("p", { text: body });


		new Setting(this.contentEl)
			.addButton(button => {
				buttonCallback(button);
				button.onClick(async () => {
					await clickCallback();
					this.close();
				});
			})
			.addButton(button => button
				.setButtonText("Cancel")
				.onClick(() => this.close()));
	}
}

function createCMEditor(content: string, extensions: Extension[]) {
	const view = new EditorView({
		state: EditorState.create({ doc: content, extensions }),
	});

	return view;
}

