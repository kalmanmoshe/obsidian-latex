import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ButtonComponent, Notice, ExtraButtonComponent, Modal, PluginSettingTab, Setting, debounce, setIcon } from "obsidian";
import { parseSnippetVariables, parseSnippets } from "src/snippets/parse";
import { DEFAULT_SETTINGS } from "./settings";
import { FileSuggest } from "./ui/file_suggest";
import { basicSetup } from "./ui/snippets_editor/extensions";
import * as localForage from "localforage";
export class LatexSuiteSettingTab extends PluginSettingTab {
    plugin;
    snippetsEditor;
    snippetsFileLocEl;
    snippetVariablesFileLocEl;
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
        try {
            localForage.config({ name: "TikzJax", storeName: "svgImages" });
        }
        catch (error) {
            console.log(error);
        }
    }
    hide() {
        this.snippetsEditor?.destroy();
    }
    addHeading(containerEl, name, icon = "math") {
        const heading = new Setting(containerEl).setName(name).setHeading();
        const parentEl = heading.settingEl;
        const iconEl = parentEl.createDiv();
        setIcon(iconEl, icon);
        iconEl.addClass("latex-suite-settings-icon");
        parentEl.prepend(iconEl);
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        this.displaySnippetSettings();
        this.displayConcealSettings();
        this.displayColorHighlightBracketsSettings();
        this.displayPopupPreviewSettings();
        this.displayMatrixShortcutsSettings();
        this.displayTaboutSettings();
        this.displayAutoEnlargeBracketsSettings();
        this.displayAdvancedSnippetSettings();
    }
    displaySnippetSettings() {
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
        let inputEl; // Define with a possible undefined type
        snippetsFileLoc.addSearch((component) => {
            component
                .setPlaceholder(DEFAULT_SETTINGS.snippetsFileLocation)
                .setValue(this.plugin.settings.snippetsFileLocation)
                .onChange(debounce(async (value) => {
                this.plugin.settings.snippetsFileLocation = value;
                await this.plugin.saveSettings(true);
            }, 500, true));
            // Ensure inputEl is assigned
            inputEl = component.inputEl;
            inputEl.addClass("latex-suite-location-input-el");
        });
        // Ensure inputEl is defined before passing to FileSuggest
        if (inputEl) {
            this.snippetsFileLocEl = snippetsFileLoc.settingEl;
            new FileSuggest(this.app, inputEl);
        }
        else {
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
            this.plugin.settings.snippetsTrigger = value;
            await this.plugin.saveSettings();
        }));
    }
    displayConcealSettings() {
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
        }));
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
        }));
    }
    displayColorHighlightBracketsSettings() {
        const containerEl = this.containerEl;
        this.addHeading(containerEl, "Highlight and color brackets", "parentheses");
        this.addToggleSetting(containerEl, "Color paired brackets", "Whether to colorize matching brackets.", this.plugin.settings.colorPairedBracketsEnabled);
        this.addToggleSetting(containerEl, "Highlight matching bracket beneath cursor", "When the cursor is adjacent to a bracket, highlight the matching bracket.", this.plugin.settings.highlightCursorBracketsEnabled);
    }
    displayPopupPreviewSettings() {
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
        }));
    }
    displayMatrixShortcutsSettings() {
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
    displayTaboutSettings() {
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
    displayAutoEnlargeBracketsSettings() {
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
    displayAdvancedSnippetSettings() {
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
        let inputVariablesEl; // Allow potential undefined values
        snippetVariablesFileLoc.addSearch((component) => {
            component
                .setPlaceholder(DEFAULT_SETTINGS.snippetVariablesFileLocation)
                .setValue(this.plugin.settings.snippetVariablesFileLocation)
                .onChange(debounce(async (value) => {
                this.plugin.settings.snippetVariablesFileLocation = value;
                await this.plugin.saveSettings(true);
            }, 500, true));
            // Ensure inputVariablesEl is assigned correctly
            inputVariablesEl = component.inputEl;
            inputVariablesEl.addClass("latex-suite-location-input-el");
        });
        // Ensure inputVariablesEl is defined before passing it to FileSuggest
        if (inputVariablesEl) {
            this.snippetVariablesFileLocEl = snippetVariablesFileLoc.settingEl;
            new FileSuggest(this.app, inputVariablesEl);
        }
        else {
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
        }));
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
    displayStyleSettings() {
        const containerEl = this.containerEl;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Math Plugin Settings" });
        this.addToggleSetting(containerEl, "Invert dark colors in dark mode", "Invert dark colors in diagrams (e.g. axes, arrows) when in dark mode, so that they are visible.", this.plugin.settings.invertColorsInDarkMode);
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
            .setName("Rendered number format")
            .setDesc("Choose how to format numbers in the result.")
            .addDropdown(dropdown => {
            dropdown.addOption('1000', "formatted .000");
            dropdown.addOption('10000', "formatted .0000");
            dropdown.addOption('100000', "formatted .00000");
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
            .addButton(button => button
            .setButtonText("Wipe History Module")
            .setTooltip("Reset all settings to their default values")
            .onClick(async () => {
            this.plugin.settings.sessionHistory = [];
            new Notice("History was wiped.");
        }));
        new Setting(containerEl)
            .addButton(button => button
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
    addColorSetting(containerEl, name, description, settingKey) {
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
    addToggleSetting(containerEl, name, description, settingKey) {
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addToggle((toggle) => {
            toggle.setValue(settingKey);
            toggle.onChange(async (value) => {
                settingKey = value;
                await this.plugin.saveSettings();
                this.updateStyles();
            });
        });
    }
    addTextSetting(containerEl, name, description, settingKey) {
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addText((text) => {
            text.setPlaceholder(settingKey).setValue(settingKey);
            text.onChange(async (value) => {
                settingKey = value;
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
    createSnippetsEditor(snippetsSetting) {
        const customCSSWrapper = snippetsSetting.controlEl.createDiv("snippets-editor-wrapper");
        const snippetsFooter = snippetsSetting.controlEl.createDiv("snippets-footer");
        const validity = snippetsFooter.createDiv("snippets-editor-validity");
        const validityIndicator = new ExtraButtonComponent(validity);
        validityIndicator.setIcon("checkmark")
            .extraSettingsEl.addClass("snippets-editor-validity-indicator");
        const validityText = validity.createDiv("snippets-editor-validity-text");
        validityText.addClass("setting-item-description");
        validityText.style.padding = "0";
        function updateValidityIndicator(success) {
            validityIndicator.setIcon(success ? "checkmark" : "cross");
            validityIndicator.extraSettingsEl.removeClass(success ? "invalid" : "valid");
            validityIndicator.extraSettingsEl.addClass(success ? "valid" : "invalid");
            validityText.setText(success ? "Saved" : "Invalid syntax. Changes not saved");
        }
        const extensions = basicSetup;
        const change = EditorView.updateListener.of(async (v) => {
            if (v.docChanged) {
                const snippets = v.state.doc.toString();
                let success = true;
                let snippetVariables;
                try {
                    snippetVariables = await parseSnippetVariables(this.plugin.settings.snippetVariables);
                    await parseSnippets(snippets, snippetVariables);
                }
                catch (e) {
                    success = false;
                }
                updateValidityIndicator(success);
                if (!success)
                    return;
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
            new ConfirmationModal(this.plugin.app, "Are you sure? This will delete any custom snippets you have written.", button => button
                .setButtonText("Reset to default snippets")
                .setWarning(), async () => {
                this.snippetsEditor.setState(EditorState.create({ doc: '[]', extensions: extensions }));
                updateValidityIndicator(true);
                this.plugin.settings.snippets = '[]';
                await this.plugin.saveSettings();
            }).open();
        });
        const remove = new ButtonComponent(buttonsDiv);
        remove.setIcon("trash")
            .setTooltip("Remove all snippets")
            .onClick(async () => {
            new ConfirmationModal(this.plugin.app, "Are you sure? This will delete any custom snippets you have written.", button => button
                .setButtonText("Remove all snippets")
                .setWarning(), async () => {
                const value = `[

]`;
                this.snippetsEditor.setState(EditorState.create({ doc: value, extensions: extensions }));
                updateValidityIndicator(true);
                this.plugin.settings.snippets = value;
                await this.plugin.saveSettings();
            }).open();
        });
    }
}
class ConfirmationModal extends Modal {
    constructor(app, body, buttonCallback, clickCallback) {
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
function createCMEditor(content, extensions) {
    const view = new EditorView({
        state: EditorState.create({ doc: content, extensions }),
    });
    return view;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NfdGFiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzX3RhYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsV0FBVyxFQUFhLE1BQU0sbUJBQW1CLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQzFELE9BQU8sRUFBTyxlQUFlLEVBQUMsTUFBTSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNsSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxLQUFLLFdBQVcsTUFBTSxhQUFhLENBQUM7QUFFM0MsTUFBTSxPQUFPLG9CQUFxQixTQUFRLGdCQUFnQjtJQUN6RCxNQUFNLENBQW1CO0lBQ3pCLGNBQWMsQ0FBYTtJQUMzQixpQkFBaUIsQ0FBYztJQUMvQix5QkFBeUIsQ0FBYztJQUV2QyxZQUFZLEdBQVEsRUFBRSxNQUF3QjtRQUM3QyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQztZQUNILFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxD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QUMsS0FBSyxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQzthQUNELFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU07YUFDekIsYUFBYSxDQUFDLFFBQVEsQ0FBQzthQUN2QixPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNqQyxDQUFDO0NBQ0Q7QUFFRCxTQUFTLGNBQWMsQ0FBQyxPQUFlLEVBQUUsVUFBdUI7SUFDL0QsTUFBTSxJQUFJLEdBQUcsSUFBSSxVQUFVLENBQUM7UUFDM0IsS0FBSyxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDO0tBQ3ZELENBQUMsQ0FBQztJQUVILE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVkaXRvclN0YXRlLCBFeHRlbnNpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdVcGRhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgQXBwLCBCdXR0b25Db21wb25lbnQsTm90aWNlLCBFeHRyYUJ1dHRvbkNvbXBvbmVudCwgTW9kYWwsIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIGRlYm91bmNlLCBzZXRJY29uIH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBwYXJzZVNuaXBwZXRWYXJpYWJsZXMsIHBhcnNlU25pcHBldHMgfSBmcm9tIFwic3JjL3NuaXBwZXRzL3BhcnNlXCI7XG5pbXBvcnQgTGF0ZXhTdWl0ZVBsdWdpbiBmcm9tIFwiLi4vbWFpblwiO1xuaW1wb3J0IHsgREVGQVVMVF9TRVRUSU5HUyB9IGZyb20gXCIuL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBGaWxlU3VnZ2VzdCB9IGZyb20gXCIuL3VpL2ZpbGVfc3VnZ2VzdFwiO1xuaW1wb3J0IHsgYmFzaWNTZXR1cCB9IGZyb20gXCIuL3VpL3NuaXBwZXRzX2VkaXRvci9leHRlbnNpb25zXCI7XG5pbXBvcnQgKiBhcyBsb2NhbEZvcmFnZSBmcm9tIFwibG9jYWxmb3JhZ2VcIjtcblxuZXhwb3J0IGNsYXNzIExhdGV4U3VpdGVTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG5cdHBsdWdpbjogTGF0ZXhTdWl0ZVBsdWdpbjtcblx0c25pcHBldHNFZGl0b3I6IEVkaXRvclZpZXc7XG5cdHNuaXBwZXRzRmlsZUxvY0VsOiBIVE1MRWxlbWVudDtcblx0c25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTGF0ZXhTdWl0ZVBsdWdpbikge1xuXHRcdHN1cGVyKGFwcCwgcGx1Z2luKTtcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgICB0cnkge1xuICAgICAgbG9jYWxGb3JhZ2UuY29uZmlnKHsgbmFtZTogXCJUaWt6SmF4XCIsIHN0b3JlTmFtZTogXCJzdmdJbWFnZXNcIiB9KTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5sb2coZXJyb3IpO1xuICAgIH1cblx0fVxuXG5cdGhpZGUoKSB7XG5cdFx0dGhpcy5zbmlwcGV0c0VkaXRvcj8uZGVzdHJveSgpO1xuXHR9XG5cblx0YWRkSGVhZGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgaWNvbiA9IFwibWF0aFwiKSB7XG5cdFx0Y29uc3QgaGVhZGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKG5hbWUpLnNldEhlYWRpbmcoKTtcblxuXHRcdGNvbnN0IHBhcmVudEVsID0gaGVhZGluZy5zZXR0aW5nRWw7XG5cdFx0Y29uc3QgaWNvbkVsID0gcGFyZW50RWwuY3JlYXRlRGl2KCk7XG5cdFx0c2V0SWNvbihpY29uRWwsIGljb24pO1xuXHRcdGljb25FbC5hZGRDbGFzcyhcImxhdGV4LXN1aXRlLXNldHRpbmdzLWljb25cIik7XG5cblx0XHRwYXJlbnRFbC5wcmVwZW5kKGljb25FbCk7XG5cdH1cblxuXHRkaXNwbGF5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKTtcblxuXHRcdHRoaXMuZGlzcGxheVNuaXBwZXRTZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheUNvbmNlYWxTZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheUNvbG9ySGlnaGxpZ2h0QnJhY2tldHNTZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheVBvcHVwUHJldmlld1NldHRpbmdzKCk7XG5cdFx0dGhpcy5kaXNwbGF5TWF0cml4U2hvcnRjdXRzU2V0dGluZ3MoKTtcblx0XHR0aGlzLmRpc3BsYXlUYWJvdXRTZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheUF1dG9FbmxhcmdlQnJhY2tldHNTZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheUFkdmFuY2VkU25pcHBldFNldHRpbmdzKCk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlTbmlwcGV0U2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJTbmlwcGV0c1wiLCBcImJhbGxwZW5cIik7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHNuaXBwZXRzIGFyZSBlbmFibGVkLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cblx0XHRjb25zdCBzbmlwcGV0c1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiU25pcHBldHNcIilcblx0XHRcdC5zZXREZXNjKFwiRW50ZXIgc25pcHBldHMgaGVyZS4gIFJlbWVtYmVyIHRvIGFkZCBhIGNvbW1hIGFmdGVyIGVhY2ggc25pcHBldCwgYW5kIGVzY2FwZSBhbGwgYmFja3NsYXNoZXMgd2l0aCBhbiBleHRyYSBcXFxcLiBMaW5lcyBzdGFydGluZyB3aXRoIFxcXCIvL1xcXCIgd2lsbCBiZSB0cmVhdGVkIGFzIGNvbW1lbnRzIGFuZCBpZ25vcmVkLlwiKVxuXHRcdFx0LnNldENsYXNzKFwic25pcHBldHMtdGV4dC1hcmVhXCIpO1xuXG5cblx0XHR0aGlzLmNyZWF0ZVNuaXBwZXRzRWRpdG9yKHNuaXBwZXRzU2V0dGluZyk7XG5cblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJMb2FkIHNuaXBwZXRzIGZyb20gZmlsZSBvciBmb2xkZXJcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBsb2FkIHNuaXBwZXRzIGZyb20gYSBzcGVjaWZpZWQgZmlsZSwgb3IgZnJvbSBhbGwgZmlsZXMgd2l0aGluIGEgZm9sZGVyIChpbnN0ZWFkIG9mIGZyb20gdGhlIHBsdWdpbiBzZXR0aW5ncykuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUgPSB2YWx1ZTtcblxuXHRcdFx0XHRcdHNuaXBwZXRzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgdmFsdWUpO1xuXHRcdFx0XHRcdGlmICh0aGlzLnNuaXBwZXRzRmlsZUxvY0VsICE9IHVuZGVmaW5lZClcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIXZhbHVlKTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblxuXHRcdGNvbnN0IHNuaXBwZXRzRmlsZUxvY0Rlc2MgPSBuZXcgRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdHNuaXBwZXRzRmlsZUxvY0Rlc2MuY3JlYXRlRGl2KHt9LCBkaXYgPT4ge1xuXHRcdFx0ZGl2LmlubmVySFRNTCA9IGBcblx0XHRcdFRoZSBmaWxlIG9yIGZvbGRlciB0byBsb2FkIHNuaXBwZXRzIGZyb20uIFRoZSBmaWxlIG9yIGZvbGRlciBtdXN0IGJlIHdpdGhpbiB5b3VyIHZhdWx0LCBhbmQgbm90IHdpdGhpbiBhIGhpZGRlbiBmb2xkZXIgKHN1Y2ggYXMgPGNvZGU+Lm9ic2lkaWFuLzwvY29kZT4pLmA7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzbmlwcGV0c0ZpbGVMb2MgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAuc2V0TmFtZShcIlNuaXBwZXRzIGZpbGUgb3IgZm9sZGVyIGxvY2F0aW9uXCIpXG4gICAgLnNldERlc2Moc25pcHBldHNGaWxlTG9jRGVzYyk7XG5cbiAgICBsZXQgaW5wdXRFbDogSFRNTElucHV0RWxlbWVudCB8IHVuZGVmaW5lZDsgLy8gRGVmaW5lIHdpdGggYSBwb3NzaWJsZSB1bmRlZmluZWQgdHlwZVxuXG4gICAgc25pcHBldHNGaWxlTG9jLmFkZFNlYXJjaCgoY29tcG9uZW50KSA9PiB7XG4gICAgICAgIGNvbXBvbmVudFxuICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Muc25pcHBldHNGaWxlTG9jYXRpb24pXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNGaWxlTG9jYXRpb24pXG4gICAgICAgICAgICAub25DaGFuZ2UoXG4gICAgICAgICAgICAgICAgZGVib3VuY2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzRmlsZUxvY2F0aW9uID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncyh0cnVlKTtcbiAgICAgICAgICAgICAgICB9LCA1MDAsIHRydWUpXG4gICAgICAgICAgICApO1xuICAgIFxuICAgICAgICAvLyBFbnN1cmUgaW5wdXRFbCBpcyBhc3NpZ25lZFxuICAgICAgICBpbnB1dEVsID0gY29tcG9uZW50LmlucHV0RWwgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgaW5wdXRFbC5hZGRDbGFzcyhcImxhdGV4LXN1aXRlLWxvY2F0aW9uLWlucHV0LWVsXCIpO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEVuc3VyZSBpbnB1dEVsIGlzIGRlZmluZWQgYmVmb3JlIHBhc3NpbmcgdG8gRmlsZVN1Z2dlc3RcbiAgICBpZiAoaW5wdXRFbCkge1xuICAgICAgICB0aGlzLnNuaXBwZXRzRmlsZUxvY0VsID0gc25pcHBldHNGaWxlTG9jLnNldHRpbmdFbDtcbiAgICAgICAgbmV3IEZpbGVTdWdnZXN0KHRoaXMuYXBwLCBpbnB1dEVsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiSW5wdXQgZWxlbWVudCBpcyB1bmRlZmluZWQuXCIpO1xuICAgIH1cblxuXG5cdFx0Ly8gSGlkZSBzZXR0aW5ncyB0aGF0IGFyZSBub3QgcmVsZXZhbnQgd2hlbiBcImxvYWRTbmlwcGV0c0Zyb21GaWxlXCIgaXMgc2V0IHRvIHRydWUvZmFsc2Vcblx0XHRjb25zdCBsb2FkU25pcHBldHNGcm9tRmlsZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlO1xuXHRcdHNuaXBwZXRzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgbG9hZFNuaXBwZXRzRnJvbUZpbGUpO1xuXHRcdHRoaXMuc25pcHBldHNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIWxvYWRTbmlwcGV0c0Zyb21GaWxlKTtcblxuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIktleSB0cmlnZ2VyIGZvciBub24tYXV0byBzbmlwcGV0c1wiKVxuXHRcdFx0LnNldERlc2MoXCJXaGF0IGtleSB0byBwcmVzcyB0byBleHBhbmQgbm9uLWF1dG8gc25pcHBldHMuXCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PiBkcm9wZG93blxuXHRcdFx0XHQuYWRkT3B0aW9uKFwiVGFiXCIsIFwiVGFiXCIpXG5cdFx0XHRcdC5hZGRPcHRpb24oXCIgXCIsIFwiU3BhY2VcIilcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzVHJpZ2dlcilcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzVHJpZ2dlciA9IHZhbHVlIGFzIFwiVGFiXCIgfFxuXHRcdFx0XHRcdFx0XCIgXCI7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5Q29uY2VhbFNldHRpbmdzKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiQ29uY2VhbFwiLCBcIm1hdGgtaW50ZWdyYWwteFwiKTtcblxuXHRcdGNvbnN0IGZyYWdtZW50ID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIk1ha2UgZXF1YXRpb25zIG1vcmUgcmVhZGFibGUgYnkgaGlkaW5nIExhVGVYIHN5bnRheCBhbmQgaW5zdGVhZCBkaXNwbGF5aW5nIGl0IGluIGEgcHJldHR5IGZvcm1hdC5cIikpO1xuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5pbm5lckhUTUwgPSBgXG5cdFx0XHRlLmcuIDxjb2RlPlxcXFxkb3R7eH1eezJ9ICsgXFxcXGRvdHt5fV57Mn08L2NvZGU+IHdpbGwgZGlzcGxheSBhcyDhuovCsiArIOG6j8KyLCBhbmQgPGNvZGU+XFxcXHNxcnR7IDEtXFxcXGJldGFeezJ9IH08L2NvZGU+IHdpbGwgZGlzcGxheSBhcyDiiJp7IDEtzrLCsiB9LlxuXHRcdGApO1xuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiTGFUZVggYmVuZWF0aCB0aGUgY3Vyc29yIHdpbGwgYmUgcmV2ZWFsZWQuXCIpKTtcblx0XHRmcmFnbWVudC5jcmVhdGVFbChcImJyXCIpO1xuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiRGlzYWJsZWQgYnkgZGVmYXVsdCB0byBub3QgY29uZnVzZSBuZXcgdXNlcnMuIEhvd2V2ZXIsIEkgcmVjb21tZW5kIHR1cm5pbmcgdGhpcyBvbiBvbmNlIHlvdSBhcmUgY29tZm9ydGFibGUgd2l0aCB0aGUgcGx1Z2luIVwiKSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxuXHRcdFx0LnNldERlc2MoZnJhZ21lbnQpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxFbmFibGVkKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuY29uY2VhbEVuYWJsZWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cblx0XHRjb25zdCBmcmFnbWVudDIgPSBuZXcgRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdGZyYWdtZW50Mi5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIkhvdyBsb25nIHRvIGRlbGF5IHRoZSByZXZlYWwgb2YgTGFUZVggZm9yLCBpbiBtaWxsaXNlY29uZHMsIHdoZW4gdGhlIGN1cnNvciBtb3ZlcyBvdmVyIExhVGVYLiBEZWZhdWx0cyB0byAwIChMYVRlWCB1bmRlciB0aGUgY3Vyc29yIGlzIHJldmVhbGVkIGltbWVkaWF0ZWx5KS5cIikpO1xuXHRcdGZyYWdtZW50Mi5jcmVhdGVFbChcImJyXCIpO1xuXHRcdGZyYWdtZW50Mi5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIkNhbiBiZSBzZXQgdG8gYSBwb3NpdGl2ZSBudW1iZXIsIGUuZy4gMzAwLCB0byBkZWxheSB0aGUgcmV2ZWFsIG9mIExhVGVYLCBtYWtpbmcgaXQgbXVjaCBlYXNpZXIgdG8gbmF2aWdhdGUgZXF1YXRpb25zIHVzaW5nIGFycm93IGtleXMuXCIpKTtcblx0XHRmcmFnbWVudDIuY3JlYXRlRWwoXCJiclwiKTtcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJNdXN0IGJlIGFuIGludGVnZXIg4omlIDAuXCIpKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJSZXZlYWwgZGVsYXkgKG1zKVwiKVxuXHRcdFx0LnNldERlc2MoZnJhZ21lbnQyKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihTdHJpbmcoREVGQVVMVF9TRVRUSU5HUy5jb25jZWFsUmV2ZWFsVGltZW91dCkpXG5cdFx0XHRcdC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuY29uY2VhbFJldmVhbFRpbWVvdXQpKVxuXHRcdFx0XHQub25DaGFuZ2UodmFsdWUgPT4ge1xuXHRcdFx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgdmFsdWUgaXMgYSBub24tbmVnYXRpdmUgaW50ZWdlclxuXHRcdFx0XHRcdGNvbnN0IG9rID0gL15cXGQrJC8udGVzdCh2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKG9rKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb25jZWFsUmV2ZWFsVGltZW91dCA9IE51bWJlcih2YWx1ZSk7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlDb2xvckhpZ2hsaWdodEJyYWNrZXRzU2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJIaWdobGlnaHQgYW5kIGNvbG9yIGJyYWNrZXRzXCIsIFwicGFyZW50aGVzZXNcIik7XG4gICAgdGhpcy5hZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsLFwiQ29sb3IgcGFpcmVkIGJyYWNrZXRzXCIsXCJXaGV0aGVyIHRvIGNvbG9yaXplIG1hdGNoaW5nIGJyYWNrZXRzLlwiLHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbG9yUGFpcmVkQnJhY2tldHNFbmFibGVkKVxuICAgIHRoaXMuYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbCxcIkhpZ2hsaWdodCBtYXRjaGluZyBicmFja2V0IGJlbmVhdGggY3Vyc29yXCIsXCJXaGVuIHRoZSBjdXJzb3IgaXMgYWRqYWNlbnQgdG8gYSBicmFja2V0LCBoaWdobGlnaHQgdGhlIG1hdGNoaW5nIGJyYWNrZXQuXCIsdGhpcy5wbHVnaW4uc2V0dGluZ3MuaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNFbmFibGVkKVxuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5UG9wdXBQcmV2aWV3U2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJNYXRoIHBvcHVwIHByZXZpZXdcIiwgXCJzdXBlcnNjcmlwdFwiKTtcblxuXHRcdGNvbnN0IHBvcHVwX2ZyYWdtZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdGNvbnN0IHBvcHVwX2xpbmUxID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRwb3B1cF9saW5lMS5zZXRUZXh0KFwiV2hlbiBpbnNpZGUgYW4gZXF1YXRpb24sIHNob3cgYSBwb3B1cCBwcmV2aWV3IHdpbmRvdyBvZiB0aGUgcmVuZGVyZWQgbWF0aC5cIik7XG5cdFx0Y29uc3QgcG9wdXBfc3BhY2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnJcIik7XG5cdFx0Y29uc3QgcG9wdXBfbGluZTIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXHRcdHBvcHVwX2xpbmUyLnNldFRleHQoXCJUaGUgcG9wdXAgcHJldmlldyB3aWxsIGJlIHNob3duIGZvciBhbGwgaW5saW5lIG1hdGggZXF1YXRpb25zLCBhcyB3ZWxsIGFzIGZvciBibG9jayBtYXRoIGVxdWF0aW9ucyBpbiBTb3VyY2UgbW9kZS5cIik7XG5cdFx0cG9wdXBfZnJhZ21lbnQuYXBwZW5kKHBvcHVwX2xpbmUxLCBwb3B1cF9zcGFjZSwgcG9wdXBfbGluZTIpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcblx0XHRcdC5zZXREZXNjKHBvcHVwX2ZyYWdtZW50KVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQgPSB2YWx1ZTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiUG9zaXRpb25cIilcblx0XHRcdC5zZXREZXNjKFwiV2hlcmUgdG8gZGlzcGxheSB0aGUgcG9wdXAgcHJldmlldyByZWxhdGl2ZSB0byB0aGUgZXF1YXRpb24gc291cmNlLlwiKVxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bikgPT4gZHJvcGRvd25cblx0XHRcdFx0LmFkZE9wdGlvbihcIkFib3ZlXCIsIFwiQWJvdmVcIilcblx0XHRcdFx0LmFkZE9wdGlvbihcIkJlbG93XCIsIFwiQmVsb3dcIilcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdGhQcmV2aWV3UG9zaXRpb25Jc0Fib3ZlID8gXCJBYm92ZVwiIDogXCJCZWxvd1wiKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0aFByZXZpZXdQb3NpdGlvbklzQWJvdmUgPSAodmFsdWUgPT09IFwiQWJvdmVcIik7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5TWF0cml4U2hvcnRjdXRzU2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJNYXRyaXggc2hvcnRjdXRzXCIsIFwiYnJhY2tldHMtY29udGFpblwiKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgbWF0cml4IHNob3J0Y3V0cyBhcmUgZW5hYmxlZC5cIilcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZClcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVudmlyb25tZW50c1wiKVxuXHRcdFx0LnNldERlc2MoXCJBIGxpc3Qgb2YgZW52aXJvbm1lbnQgbmFtZXMgdG8gcnVuIHRoZSBtYXRyaXggc2hvcnRjdXRzIGluLCBzZXBhcmF0ZWQgYnkgY29tbWFzLlwiKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLm1hdHJpeFNob3J0Y3V0c0Vudk5hbWVzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW52TmFtZXMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbnZOYW1lcyA9IHZhbHVlO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5VGFib3V0U2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJUYWJvdXRcIiwgXCJ0YWJvdXRcIik7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRhYm91dCBpcyBlbmFibGVkLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YWJvdXRFbmFibGVkKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MudGFib3V0RW5hYmxlZCA9IHZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlBdXRvRW5sYXJnZUJyYWNrZXRzU2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBdXRvLWVubGFyZ2UgYnJhY2tldHNcIiwgXCJwYXJlbnRoZXNlc1wiKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gYXV0b21hdGljYWxseSBlbmxhcmdlIGJyYWNrZXRzIGNvbnRhaW5pbmcgZS5nLiBzdW0sIGludCwgZnJhYy5cIilcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0cylcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9FbmxhcmdlQnJhY2tldHMgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiVHJpZ2dlcnNcIilcblx0XHRcdC5zZXREZXNjKFwiQSBsaXN0IG9mIHN5bWJvbHMgdGhhdCBzaG91bGQgdHJpZ2dlciBhdXRvLWVubGFyZ2UgYnJhY2tldHMsIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5QWR2YW5jZWRTbmlwcGV0U2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBZHZhbmNlZCBzbmlwcGV0IHNldHRpbmdzXCIpO1xuXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiU25pcHBldCB2YXJpYWJsZXNcIilcblx0XHRcdC5zZXREZXNjKFwiQXNzaWduIHNuaXBwZXQgdmFyaWFibGVzIHRoYXQgY2FuIGJlIHVzZWQgYXMgc2hvcnRjdXRzIHdoZW4gd3JpdGluZyBzbmlwcGV0cy5cIilcblx0XHRcdC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRWYXJpYWJsZXMpKVxuXHRcdFx0LnNldENsYXNzKFwibGF0ZXgtc3VpdGUtc25pcHBldC12YXJpYWJsZXMtc2V0dGluZ1wiKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJMb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gZmlsZSBvciBmb2xkZXJcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBsb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gYSBzcGVjaWZpZWQgZmlsZSwgb3IgZnJvbSBhbGwgZmlsZXMgd2l0aGluIGEgZm9sZGVyIChpbnN0ZWFkIG9mIGZyb20gdGhlIHBsdWdpbiBzZXR0aW5ncykuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlID0gdmFsdWU7XG5cblx0XHRcdFx0XHRzbmlwcGV0VmFyaWFibGVzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgdmFsdWUpO1xuXHRcdFx0XHRcdGlmICh0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwgIT0gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0dGhpcy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsICF2YWx1ZSk7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NEZXNjID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRzbmlwcGV0VmFyaWFibGVzRmlsZUxvY0Rlc2MuY3JlYXRlRGl2KHt9LCAoZGl2KSA9PiB7XG5cdFx0XHRkaXYuaW5uZXJIVE1MID0gYFxuXHRcdFx0VGhlIGZpbGUgb3IgZm9sZGVyIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbS4gVGhlIGZpbGUgb3IgZm9sZGVyIG11c3QgYmUgd2l0aGluIHlvdXIgdmF1bHQsIGFuZCBub3Qgd2l0aGluIGEgaGlkZGVuIGZvbGRlciAoc3VjaCBhcyA8Y29kZT4ub2JzaWRpYW4vPC9jb2RlPikuYDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgLnNldE5hbWUoXCJTbmlwcGV0IHZhcmlhYmxlcyBmaWxlIG9yIGZvbGRlciBsb2NhdGlvblwiKVxuICAgIC5zZXREZXNjKHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRGVzYyk7XG5cblxuICAgIGxldCBpbnB1dFZhcmlhYmxlc0VsOiBIVE1MSW5wdXRFbGVtZW50IHwgdW5kZWZpbmVkOyAvLyBBbGxvdyBwb3RlbnRpYWwgdW5kZWZpbmVkIHZhbHVlc1xuXG4gICAgc25pcHBldFZhcmlhYmxlc0ZpbGVMb2MuYWRkU2VhcmNoKChjb21wb25lbnQpID0+IHtcbiAgICAgICAgY29tcG9uZW50XG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY2F0aW9uKVxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jYXRpb24pXG4gICAgICAgICAgICAub25DaGFuZ2UoXG4gICAgICAgICAgICAgICAgZGVib3VuY2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jYXRpb24gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xuICAgICAgICAgICAgICAgIH0sIDUwMCwgdHJ1ZSlcbiAgICAgICAgICAgICk7XG4gICAgXG4gICAgICAgIC8vIEVuc3VyZSBpbnB1dFZhcmlhYmxlc0VsIGlzIGFzc2lnbmVkIGNvcnJlY3RseVxuICAgICAgICBpbnB1dFZhcmlhYmxlc0VsID0gY29tcG9uZW50LmlucHV0RWwgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgaW5wdXRWYXJpYWJsZXNFbC5hZGRDbGFzcyhcImxhdGV4LXN1aXRlLWxvY2F0aW9uLWlucHV0LWVsXCIpO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEVuc3VyZSBpbnB1dFZhcmlhYmxlc0VsIGlzIGRlZmluZWQgYmVmb3JlIHBhc3NpbmcgaXQgdG8gRmlsZVN1Z2dlc3RcbiAgICBpZiAoaW5wdXRWYXJpYWJsZXNFbCkge1xuICAgICAgICB0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwgPSBzbmlwcGV0VmFyaWFibGVzRmlsZUxvYy5zZXR0aW5nRWw7XG4gICAgICAgIG5ldyBGaWxlU3VnZ2VzdCh0aGlzLmFwcCwgaW5wdXRWYXJpYWJsZXNFbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIklucHV0IGVsZW1lbnQgZm9yIHZhcmlhYmxlcyBpcyB1bmRlZmluZWQuXCIpO1xuICAgIH1cblxuXG5cdFx0Ly8gSGlkZSBzZXR0aW5ncyB0aGF0IGFyZSBub3QgcmVsZXZhbnQgd2hlbiBcImxvYWRTbmlwcGV0c0Zyb21GaWxlXCIgaXMgc2V0IHRvIHRydWUvZmFsc2Vcblx0XHRjb25zdCBsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZTtcblx0XHRzbmlwcGV0VmFyaWFibGVzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgbG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSk7XG5cdFx0dGhpcy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsICFsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJXb3JkIGRlbGltaXRlcnNcIilcblx0XHRcdC5zZXREZXNjKFwiU3ltYm9scyB0aGF0IHdpbGwgYmUgdHJlYXRlZCBhcyB3b3JkIGRlbGltaXRlcnMsIGZvciB1c2Ugd2l0aCB0aGUgXFxcIndcXFwiIHNuaXBwZXQgb3B0aW9uLlwiKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLndvcmREZWxpbWl0ZXJzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud29yZERlbGltaXRlcnMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy53b3JkRGVsaW1pdGVycyA9IHZhbHVlO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJSZW1vdmUgdHJhaWxpbmcgd2hpdGVzcGFjZXMgaW4gc25pcHBldHMgaW4gaW5saW5lIG1hdGhcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byByZW1vdmUgdHJhaWxpbmcgd2hpdGVzcGFjZXMgd2hlbiBleHBhbmRpbmcgc25pcHBldHMgYXQgdGhlIGVuZCBvZiBpbmxpbmUgbWF0aCBibG9ja3MuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW92ZVNuaXBwZXRXaGl0ZXNwYWNlKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3ZlU25pcHBldFdoaXRlc3BhY2UgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0LnNldE5hbWUoXCJSZW1vdmUgY2xvc2luZyAkIHdoZW4gYmFja3NwYWNpbmcgaW5zaWRlIGJsYW5rIGlubGluZSBtYXRoXCIpXG5cdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIGFsc28gcmVtb3ZlIHRoZSBjbG9zaW5nICQgd2hlbiB5b3UgZGVsZXRlIHRoZSBvcGVuaW5nICQgc3ltYm9sIGluc2lkZSBibGFuayBpbmxpbmUgbWF0aC5cIilcblx0XHQuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHRvZ2dsZVxuXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9EZWxldGUkKVxuXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRGVsZXRlJCA9IHZhbHVlO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdH0pKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJEb24ndCB0cmlnZ2VyIHNuaXBwZXRzIHdoZW4gSU1FIGlzIGFjdGl2ZVwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIHN1cHByZXNzIHNuaXBwZXRzIHRyaWdnZXJpbmcgd2hlbiBhbiBJTUUgaXMgYWN0aXZlLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSlcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSA9IHZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJDb2RlIGxhbmd1YWdlcyB0byBpbnRlcnByZXQgYXMgbWF0aCBtb2RlXCIpXG5cdFx0XHQuc2V0RGVzYyhcIkNvZGVibG9jayBsYW5ndWFnZXMgd2hlcmUgdGhlIHdob2xlIGNvZGUgYmxvY2sgc2hvdWxkIGJlIHRyZWF0ZWQgbGlrZSBhIG1hdGggYmxvY2ssIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuZm9yY2VNYXRoTGFuZ3VhZ2VzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9yY2VNYXRoTGFuZ3VhZ2VzKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9yY2VNYXRoTGFuZ3VhZ2VzID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXHR9XG5cbiAgcHJpdmF0ZSBkaXNwbGF5U3R5bGVTZXR0aW5ncygpe1xuICAgIGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIk1hdGggUGx1Z2luIFNldHRpbmdzXCIgfSk7XG5cbiAgICB0aGlzLmFkZFRvZ2dsZVNldHRpbmcoY29udGFpbmVyRWwsXCJJbnZlcnQgZGFyayBjb2xvcnMgaW4gZGFyayBtb2RlXCIsXCJJbnZlcnQgZGFyayBjb2xvcnMgaW4gZGlhZ3JhbXMgKGUuZy4gYXhlcywgYXJyb3dzKSB3aGVuIGluIGRhcmsgbW9kZSwgc28gdGhhdCB0aGV5IGFyZSB2aXNpYmxlLlwiLHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpXG5cblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJDbGVhciBjYWNoZWQgU1ZHc1wiKVxuXHRcdFx0LnNldERlc2MoXCJTVkdzIHJlbmRlcmVkIHdpdGggVGlrWkpheCBhcmUgc3RvcmVkIGluIGEgZGF0YWJhc2UsIHNvIGRpYWdyYW1zIGRvbid0IGhhdmUgdG8gYmUgcmUtcmVuZGVyZWQgZnJvbSBzY3JhdGNoIGV2ZXJ5IHRpbWUgeW91IG9wZW4gYSBwYWdlLiBVc2UgdGhpcyB0byBjbGVhciB0aGUgY2FjaGUgYW5kIGZvcmNlIGFsbCBkaWFncmFtcyB0byBiZSByZS1yZW5kZXJlZC5cIilcblx0XHRcdC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuXHRcdFx0XHQuc2V0SWNvbihcInRyYXNoXCIpXG5cdFx0XHRcdC5zZXRUb29sdGlwKFwiQ2xlYXIgY2FjaGVkIFNWR3NcIilcblx0XHRcdFx0Lm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGxvY2FsRm9yYWdlLmNsZWFyKChlcnIpID0+IHtcblx0XHRcdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coZXJyKTtcblx0XHRcdFx0XHRcdFx0bmV3IE5vdGljZShlcnIsIDMwMDApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJUaWtaSmF4OiBTdWNjZXNzZnVsbHkgY2xlYXJlZCBjYWNoZWQgU1ZHcy5cIiwgMzAwMCk7XG5cdFx0XHRcdFx0XHR9XG4gICAgICAgICAgICBcblx0XHRcdFx0XHR9KTtcbiAgICAgIH0pKTtcblxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgIC5zZXROYW1lKCBcIlJlbmRlcmVkIG51bWJlciBmb3JtYXRcIilcbiAgICAgICAgLnNldERlc2MoXCJDaG9vc2UgaG93IHRvIGZvcm1hdCBudW1iZXJzIGluIHRoZSByZXN1bHQuXCIpXG4gICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKCcxMDAwJyxcImZvcm1hdHRlZCAuMDAwXCIpO1xuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbignMTAwMDAnLFwiZm9ybWF0dGVkIC4wMDAwXCIpO1xuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbignMTAwMDAwJyxcImZvcm1hdHRlZCAuMDAwMDBcIik7XG4gICAgICAgICAgZHJvcGRvd24ub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cblxuICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiTWF0aCBQbHVnaW4gc3R5bGVcIiB9KTtcblxuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvci5cIiwgXCJiYWNrZ3JvdW5kXCIpO1xuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiRXZlbiBSb3cgQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3IgZXZlbiByb3dzLlwiLCBcImV2ZW5Sb3dCYWNrZ3JvdW5kXCIpO1xuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiT2RkIFJvdyBCYWNrZ3JvdW5kIENvbG9yXCIsIFwiU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciBvZGQgcm93cy5cIiwgXCJvZGRSb3dCYWNrZ3JvdW5kXCIpO1xuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiaW5mb01vZGFsIEJhY2tncm91bmQgQ29sb3JcIiwgXCJTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIHRoZSBpbmZvIG1vZGFsLlwiLCBcImluZm9Nb2RhbEJhY2tncm91bmRcIik7XG4gICAgICBcbiAgICAgIHRoaXMuYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWwsIFwiRm9udCBTaXplXCIsIFwiU2V0IHRoZSBmb250IHNpemUgZm9yIHRoZSByb3dzLlwiLCBcImZvbnRTaXplXCIpO1xuICAgICAgdGhpcy5hZGRUZXh0U2V0dGluZyhjb250YWluZXJFbCwgXCJSb3cgUGFkZGluZ1wiLCBcIlNldCB0aGUgcGFkZGluZyBmb3IgdGhlIHJvd3MuXCIsIFwicm93UGFkZGluZ1wiKTtcbiAgICAgIHRoaXMuYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWwsIFwiSWNvbiBTaXplXCIsIFwiU2V0IHRoZSBzaXplIG9mIHRoZSBpY29ucy5cIiwgXCJpY29uU2l6ZVwiKTtcbiAgXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cbiAgICAgICAgICBidXR0b25cbiAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KFwiV2lwZSBIaXN0b3J5IE1vZHVsZVwiKVxuICAgICAgICAgICAgLnNldFRvb2x0aXAoXCJSZXNldCBhbGwgc2V0dGluZ3MgdG8gdGhlaXIgZGVmYXVsdCB2YWx1ZXNcIilcbiAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2Vzc2lvbkhpc3RvcnkgPSBbXTtcbiAgICAgICAgICAgICBuZXcgTm90aWNlKFwiSGlzdG9yeSB3YXMgd2lwZWQuXCIpXG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cbiAgICAgICAgYnV0dG9uXG4gICAgICAgICAgLnNldEJ1dHRvblRleHQoXCJSZXNldCB0byBEZWZhdWx0XCIpXG4gICAgICAgICAgLnNldFRvb2x0aXAoXCJSZXNldCBhbGwgc2V0dGluZ3MgdG8gdGhlaXIgZGVmYXVsdCB2YWx1ZXNcIilcbiAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVN0eWxlcygpO1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIlNldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byBkZWZhdWx0LlwiKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICB9KSk7XG5cbiAgfVxuICBwcml2YXRlIGFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleTogYW55KSB7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShuYW1lKVxuICAgICAgLnNldERlc2MoZGVzY3JpcHRpb24pXG4gICAgICAuYWRkQ29sb3JQaWNrZXIoY29sb3JQaWNrZXIgPT4ge1xuICAgICAgICBjb2xvclBpY2tlci5zZXRWYWx1ZShzZXR0aW5nS2V5KTtcbiAgICAgICAgY29sb3JQaWNrZXIub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgc2V0dGluZ0tleSA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcHJpdmF0ZSBhZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBhbnkpIHtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKG5hbWUpXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSA6IGFueSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUoc2V0dGluZ0tleSlcbiAgICAgICAgdG9nZ2xlLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgc2V0dGluZ0tleT0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICBwcml2YXRlIGFkZFRleHRTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBhbnkpIHtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKG5hbWUpXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0OiBhbnkpID0+IHtcbiAgICAgICAgdGV4dC5zZXRQbGFjZWhvbGRlcihzZXR0aW5nS2V5KS5zZXRWYWx1ZShzZXR0aW5nS2V5KTtcbiAgICAgICAgdGV4dC5vbkNoYW5nZShhc3luYyAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgICAgICAgIHNldHRpbmdLZXk9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgdXBkYXRlU3R5bGVzKCkge1xuICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tcm93LWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYmFja2dyb3VuZCk7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tZXZlbi1yb3ctYmFja2dyb3VuZFwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ldmVuUm93QmFja2dyb3VuZCk7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tb2RkLXJvdy1iYWNrZ3JvdW5kXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLm9kZFJvd0JhY2tncm91bmQpO1xuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLWluZm8tbW9kYWwtY29sdW1uLWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5mb01vZGFsQmFja2dyb3VuZCk7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tZm9udC1zaXplXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmZvbnRTaXplKTtcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1yb3ctcGFkZGluZ1wiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yb3dQYWRkaW5nKTtcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1pY29uLXNpemVcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaWNvblNpemUpO1xufVxuXHRjcmVhdGVTbmlwcGV0c0VkaXRvcihzbmlwcGV0c1NldHRpbmc6IFNldHRpbmcpIHtcblx0XHRjb25zdCBjdXN0b21DU1NXcmFwcGVyID0gc25pcHBldHNTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3Itd3JhcHBlclwiKTtcblx0XHRjb25zdCBzbmlwcGV0c0Zvb3RlciA9IHNuaXBwZXRzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRGl2KFwic25pcHBldHMtZm9vdGVyXCIpO1xuXHRcdGNvbnN0IHZhbGlkaXR5ID0gc25pcHBldHNGb290ZXIuY3JlYXRlRGl2KFwic25pcHBldHMtZWRpdG9yLXZhbGlkaXR5XCIpO1xuXG5cdFx0Y29uc3QgdmFsaWRpdHlJbmRpY2F0b3IgPSBuZXcgRXh0cmFCdXR0b25Db21wb25lbnQodmFsaWRpdHkpO1xuXHRcdHZhbGlkaXR5SW5kaWNhdG9yLnNldEljb24oXCJjaGVja21hcmtcIilcblx0XHRcdC5leHRyYVNldHRpbmdzRWwuYWRkQ2xhc3MoXCJzbmlwcGV0cy1lZGl0b3ItdmFsaWRpdHktaW5kaWNhdG9yXCIpO1xuXG5cdFx0Y29uc3QgdmFsaWRpdHlUZXh0ID0gdmFsaWRpdHkuY3JlYXRlRGl2KFwic25pcHBldHMtZWRpdG9yLXZhbGlkaXR5LXRleHRcIik7XG5cdFx0dmFsaWRpdHlUZXh0LmFkZENsYXNzKFwic2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uXCIpO1xuXHRcdHZhbGlkaXR5VGV4dC5zdHlsZS5wYWRkaW5nID0gXCIwXCI7XG5cblxuXHRcdGZ1bmN0aW9uIHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHN1Y2Nlc3M6IGJvb2xlYW4pIHtcblx0XHRcdHZhbGlkaXR5SW5kaWNhdG9yLnNldEljb24oc3VjY2VzcyA/IFwiY2hlY2ttYXJrXCIgOiBcImNyb3NzXCIpO1xuXHRcdFx0dmFsaWRpdHlJbmRpY2F0b3IuZXh0cmFTZXR0aW5nc0VsLnJlbW92ZUNsYXNzKHN1Y2Nlc3MgPyBcImludmFsaWRcIiA6IFwidmFsaWRcIik7XG5cdFx0XHR2YWxpZGl0eUluZGljYXRvci5leHRyYVNldHRpbmdzRWwuYWRkQ2xhc3Moc3VjY2VzcyA/IFwidmFsaWRcIiA6IFwiaW52YWxpZFwiKTtcblx0XHRcdHZhbGlkaXR5VGV4dC5zZXRUZXh0KHN1Y2Nlc3MgPyBcIlNhdmVkXCIgOiBcIkludmFsaWQgc3ludGF4LiBDaGFuZ2VzIG5vdCBzYXZlZFwiKTtcblx0XHR9XG5cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBiYXNpY1NldHVwO1xuXG5cdFx0Y29uc3QgY2hhbmdlID0gRWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZihhc3luYyAodjogVmlld1VwZGF0ZSkgPT4ge1xuXHRcdFx0aWYgKHYuZG9jQ2hhbmdlZCkge1xuXHRcdFx0XHRjb25zdCBzbmlwcGV0cyA9IHYuc3RhdGUuZG9jLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGxldCBzdWNjZXNzID0gdHJ1ZTtcblxuXHRcdFx0XHRsZXQgc25pcHBldFZhcmlhYmxlcztcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRzbmlwcGV0VmFyaWFibGVzID0gYXdhaXQgcGFyc2VTbmlwcGV0VmFyaWFibGVzKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMpXG5cdFx0XHRcdFx0YXdhaXQgcGFyc2VTbmlwcGV0cyhzbmlwcGV0cywgc25pcHBldFZhcmlhYmxlcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRzdWNjZXNzID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcihzdWNjZXNzKTtcblxuXHRcdFx0XHRpZiAoIXN1Y2Nlc3MpIHJldHVybjtcblxuXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cyA9IHNuaXBwZXRzO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdH1cblx0XHR9KTtcbiAgICBcblx0XHRleHRlbnNpb25zLnB1c2goY2hhbmdlKTtcblxuXHRcdHRoaXMuc25pcHBldHNFZGl0b3IgPSBjcmVhdGVDTUVkaXRvcih0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cywgZXh0ZW5zaW9ucyk7XG5cdFx0Y3VzdG9tQ1NTV3JhcHBlci5hcHBlbmRDaGlsZCh0aGlzLnNuaXBwZXRzRWRpdG9yLmRvbSk7XG5cblxuXHRcdGNvbnN0IGJ1dHRvbnNEaXYgPSBzbmlwcGV0c0Zvb3Rlci5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3ItYnV0dG9uc1wiKTtcblx0XHRjb25zdCByZXNldCA9IG5ldyBCdXR0b25Db21wb25lbnQoYnV0dG9uc0Rpdik7XG5cdFx0cmVzZXQuc2V0SWNvbihcInN3aXRjaFwiKVxuXHRcdFx0LnNldFRvb2x0aXAoXCJSZXNldCB0byBkZWZhdWx0IHNuaXBwZXRzXCIpXG5cdFx0XHQub25DbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG5ldyBDb25maXJtYXRpb25Nb2RhbCh0aGlzLnBsdWdpbi5hcHAsXG5cdFx0XHRcdFx0XCJBcmUgeW91IHN1cmU/IFRoaXMgd2lsbCBkZWxldGUgYW55IGN1c3RvbSBzbmlwcGV0cyB5b3UgaGF2ZSB3cml0dGVuLlwiLFxuXHRcdFx0XHRcdGJ1dHRvbiA9PiBidXR0b25cblx0XHRcdFx0XHRcdC5zZXRCdXR0b25UZXh0KFwiUmVzZXQgdG8gZGVmYXVsdCBzbmlwcGV0c1wiKVxuXHRcdFx0XHRcdFx0LnNldFdhcm5pbmcoKSxcblx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnNuaXBwZXRzRWRpdG9yLnNldFN0YXRlKEVkaXRvclN0YXRlLmNyZWF0ZSh7IGRvYzogJ1tdJywgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyB9KSk7XG5cdFx0XHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcih0cnVlKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHMgPSAnW10nO1xuXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCkub3BlbigpO1xuXHRcdFx0fSk7XG5cblx0XHRjb25zdCByZW1vdmUgPSBuZXcgQnV0dG9uQ29tcG9uZW50KGJ1dHRvbnNEaXYpO1xuXHRcdHJlbW92ZS5zZXRJY29uKFwidHJhc2hcIilcblx0XHRcdC5zZXRUb29sdGlwKFwiUmVtb3ZlIGFsbCBzbmlwcGV0c1wiKVxuXHRcdFx0Lm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRuZXcgQ29uZmlybWF0aW9uTW9kYWwodGhpcy5wbHVnaW4uYXBwLFxuXHRcdFx0XHRcdFwiQXJlIHlvdSBzdXJlPyBUaGlzIHdpbGwgZGVsZXRlIGFueSBjdXN0b20gc25pcHBldHMgeW91IGhhdmUgd3JpdHRlbi5cIixcblx0XHRcdFx0XHRidXR0b24gPT4gYnV0dG9uXG5cdFx0XHRcdFx0XHQuc2V0QnV0dG9uVGV4dChcIlJlbW92ZSBhbGwgc25pcHBldHNcIilcblx0XHRcdFx0XHRcdC5zZXRXYXJuaW5nKCksXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBgW1xuXG5dYDtcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNFZGl0b3Iuc2V0U3RhdGUoRWRpdG9yU3RhdGUuY3JlYXRlKHsgZG9jOiB2YWx1ZSwgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyB9KSk7XG5cdFx0XHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcih0cnVlKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHMgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0KS5vcGVuKCk7XG5cdFx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBDb25maXJtYXRpb25Nb2RhbCBleHRlbmRzIE1vZGFsIHtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgYm9keTogc3RyaW5nLCBidXR0b25DYWxsYmFjazogKGJ1dHRvbjogQnV0dG9uQ29tcG9uZW50KSA9PiB2b2lkLCBjbGlja0NhbGxiYWNrOiAoKSA9PiBQcm9taXNlPHZvaWQ+KSB7XG5cdFx0c3VwZXIoYXBwKTtcblxuXHRcdHRoaXMuY29udGVudEVsLmFkZENsYXNzKFwibGF0ZXgtc3VpdGUtY29uZmlybWF0aW9uLW1vZGFsXCIpO1xuXHRcdHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGJvZHkgfSk7XG5cblxuXHRcdG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKVxuXHRcdFx0LmFkZEJ1dHRvbihidXR0b24gPT4ge1xuXHRcdFx0XHRidXR0b25DYWxsYmFjayhidXR0b24pO1xuXHRcdFx0XHRidXR0b24ub25DbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgY2xpY2tDYWxsYmFjaygpO1xuXHRcdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KVxuXHRcdFx0LmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG5cdFx0XHRcdC5zZXRCdXR0b25UZXh0KFwiQ2FuY2VsXCIpXG5cdFx0XHRcdC5vbkNsaWNrKCgpID0+IHRoaXMuY2xvc2UoKSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNNRWRpdG9yKGNvbnRlbnQ6IHN0cmluZywgZXh0ZW5zaW9uczogRXh0ZW5zaW9uW10pIHtcblx0Y29uc3QgdmlldyA9IG5ldyBFZGl0b3JWaWV3KHtcblx0XHRzdGF0ZTogRWRpdG9yU3RhdGUuY3JlYXRlKHsgZG9jOiBjb250ZW50LCBleHRlbnNpb25zIH0pLFxuXHR9KTtcblxuXHRyZXR1cm4gdmlldztcbn1cblxuIl19