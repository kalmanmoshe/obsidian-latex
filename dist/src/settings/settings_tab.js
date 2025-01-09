import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { ButtonComponent, Notice, ExtraButtonComponent, Modal, PluginSettingTab, Setting, debounce, setIcon } from "obsidian";
import { parseSnippetVariables, parseSnippets } from "src/snippets/parse";
import { DEFAULT_SNIPPETS } from "src/utils/default_snippets";
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
        this.displayAutofractionSettings();
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
    displayAutofractionSettings() {
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
                this.snippetsEditor.setState(EditorState.create({ doc: DEFAULT_SNIPPETS, extensions: extensions }));
                updateValidityIndicator(true);
                this.plugin.settings.snippets = DEFAULT_SNIPPETS;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NfdGFiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzX3RhYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsV0FBVyxFQUFhLE1BQU0sbUJBQW1CLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQzFELE9BQU8sRUFBTyxlQUFlLEVBQUMsTUFBTSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNsSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxLQUFLLFdBQVcsTUFBTSxhQUFhLENBQUM7QUFFM0MsTUFBTSxPQUFPLG9CQUFxQixTQUFRLGdCQUFnQjtJQUN6RCxNQUFNLENBQW1CO0lBQ3pCLGNBQWMsQ0FBYTtJQUMzQixpQkFBaUIsQ0FBYztJQUMvQix5QkFBeUIsQ0FBYztJQUV2QyxZQUFZLEdBQVEsRUFBRSxNQUF3QjtRQUM3QyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQztZQUNILFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FB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UyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTTthQUN6QixhQUFhLENBQUMsUUFBUSxDQUFDO2FBQ3ZCLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7Q0FDRDtBQUVELFNBQVMsY0FBYyxDQUFDLE9BQWUsRUFBRSxVQUF1QjtJQUMvRCxNQUFNLElBQUksR0FBRyxJQUFJLFVBQVUsQ0FBQztRQUMzQixLQUFLLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUM7S0FDdkQsQ0FBQyxDQUFDO0lBRUgsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRWRpdG9yU3RhdGUsIEV4dGVuc2lvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3VXBkYXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgQXBwLCBCdXR0b25Db21wb25lbnQsTm90aWNlLCBFeHRyYUJ1dHRvbkNvbXBvbmVudCwgTW9kYWwsIFBsdWdpblNldHRpbmdUYWIsIFNldHRpbmcsIGRlYm91bmNlLCBzZXRJY29uIH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCB7IHBhcnNlU25pcHBldFZhcmlhYmxlcywgcGFyc2VTbmlwcGV0cyB9IGZyb20gXCJzcmMvc25pcHBldHMvcGFyc2VcIjtcclxuaW1wb3J0IHsgREVGQVVMVF9TTklQUEVUUyB9IGZyb20gXCJzcmMvdXRpbHMvZGVmYXVsdF9zbmlwcGV0c1wiO1xyXG5pbXBvcnQgTGF0ZXhTdWl0ZVBsdWdpbiBmcm9tIFwiLi4vbWFpblwiO1xyXG5pbXBvcnQgeyBERUZBVUxUX1NFVFRJTkdTIH0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcclxuaW1wb3J0IHsgRmlsZVN1Z2dlc3QgfSBmcm9tIFwiLi91aS9maWxlX3N1Z2dlc3RcIjtcclxuaW1wb3J0IHsgYmFzaWNTZXR1cCB9IGZyb20gXCIuL3VpL3NuaXBwZXRzX2VkaXRvci9leHRlbnNpb25zXCI7XHJcbmltcG9ydCAqIGFzIGxvY2FsRm9yYWdlIGZyb20gXCJsb2NhbGZvcmFnZVwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIExhdGV4U3VpdGVTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XHJcblx0cGx1Z2luOiBMYXRleFN1aXRlUGx1Z2luO1xyXG5cdHNuaXBwZXRzRWRpdG9yOiBFZGl0b3JWaWV3O1xyXG5cdHNuaXBwZXRzRmlsZUxvY0VsOiBIVE1MRWxlbWVudDtcclxuXHRzbmlwcGV0VmFyaWFibGVzRmlsZUxvY0VsOiBIVE1MRWxlbWVudDtcclxuXHJcblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTGF0ZXhTdWl0ZVBsdWdpbikge1xyXG5cdFx0c3VwZXIoYXBwLCBwbHVnaW4pO1xyXG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgICB0cnkge1xyXG4gICAgICBsb2NhbEZvcmFnZS5jb25maWcoeyBuYW1lOiBcIlRpa3pKYXhcIiwgc3RvcmVOYW1lOiBcInN2Z0ltYWdlc1wiIH0pO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc29sZS5sb2coZXJyb3IpO1xyXG4gICAgfVxyXG5cdH1cclxuXHJcblx0aGlkZSgpIHtcclxuXHRcdHRoaXMuc25pcHBldHNFZGl0b3I/LmRlc3Ryb3koKTtcclxuXHR9XHJcblxyXG5cdGFkZEhlYWRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGljb24gPSBcIm1hdGhcIikge1xyXG5cdFx0Y29uc3QgaGVhZGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKG5hbWUpLnNldEhlYWRpbmcoKTtcclxuXHJcblx0XHRjb25zdCBwYXJlbnRFbCA9IGhlYWRpbmcuc2V0dGluZ0VsO1xyXG5cdFx0Y29uc3QgaWNvbkVsID0gcGFyZW50RWwuY3JlYXRlRGl2KCk7XHJcblx0XHRzZXRJY29uKGljb25FbCwgaWNvbik7XHJcblx0XHRpY29uRWwuYWRkQ2xhc3MoXCJsYXRleC1zdWl0ZS1zZXR0aW5ncy1pY29uXCIpO1xyXG5cclxuXHRcdHBhcmVudEVsLnByZXBlbmQoaWNvbkVsKTtcclxuXHR9XHJcblxyXG5cdGRpc3BsYXkoKTogdm9pZCB7XHJcblx0XHRjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xyXG5cdFx0Y29udGFpbmVyRWwuZW1wdHkoKTtcclxuXHJcblx0XHR0aGlzLmRpc3BsYXlTbmlwcGV0U2V0dGluZ3MoKTtcclxuXHRcdHRoaXMuZGlzcGxheUNvbmNlYWxTZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5kaXNwbGF5Q29sb3JIaWdobGlnaHRCcmFja2V0c1NldHRpbmdzKCk7XHJcblx0XHR0aGlzLmRpc3BsYXlQb3B1cFByZXZpZXdTZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5kaXNwbGF5QXV0b2ZyYWN0aW9uU2V0dGluZ3MoKTtcclxuXHRcdHRoaXMuZGlzcGxheU1hdHJpeFNob3J0Y3V0c1NldHRpbmdzKCk7XHJcblx0XHR0aGlzLmRpc3BsYXlUYWJvdXRTZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5kaXNwbGF5QXV0b0VubGFyZ2VCcmFja2V0c1NldHRpbmdzKCk7XHJcblx0XHR0aGlzLmRpc3BsYXlBZHZhbmNlZFNuaXBwZXRTZXR0aW5ncygpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5U25pcHBldFNldHRpbmdzKCkge1xyXG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIlNuaXBwZXRzXCIsIFwiYmFsbHBlblwiKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciBzbmlwcGV0cyBhcmUgZW5hYmxlZC5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzRW5hYmxlZClcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldHNTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiU25pcHBldHNcIilcclxuXHRcdFx0LnNldERlc2MoXCJFbnRlciBzbmlwcGV0cyBoZXJlLiAgUmVtZW1iZXIgdG8gYWRkIGEgY29tbWEgYWZ0ZXIgZWFjaCBzbmlwcGV0LCBhbmQgZXNjYXBlIGFsbCBiYWNrc2xhc2hlcyB3aXRoIGFuIGV4dHJhIFxcXFwuIExpbmVzIHN0YXJ0aW5nIHdpdGggXFxcIi8vXFxcIiB3aWxsIGJlIHRyZWF0ZWQgYXMgY29tbWVudHMgYW5kIGlnbm9yZWQuXCIpXHJcblx0XHRcdC5zZXRDbGFzcyhcInNuaXBwZXRzLXRleHQtYXJlYVwiKTtcclxuXHJcblxyXG5cdFx0dGhpcy5jcmVhdGVTbmlwcGV0c0VkaXRvcihzbmlwcGV0c1NldHRpbmcpO1xyXG5cclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJMb2FkIHNuaXBwZXRzIGZyb20gZmlsZSBvciBmb2xkZXJcIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIGxvYWQgc25pcHBldHMgZnJvbSBhIHNwZWNpZmllZCBmaWxlLCBvciBmcm9tIGFsbCBmaWxlcyB3aXRoaW4gYSBmb2xkZXIgKGluc3RlYWQgb2YgZnJvbSB0aGUgcGx1Z2luIHNldHRpbmdzKS5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0c25pcHBldHNTZXR0aW5nLnNldHRpbmdFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCB2YWx1ZSk7XHJcblx0XHRcdFx0XHRpZiAodGhpcy5zbmlwcGV0c0ZpbGVMb2NFbCAhPSB1bmRlZmluZWQpXHJcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIXZhbHVlKTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cclxuXHRcdGNvbnN0IHNuaXBwZXRzRmlsZUxvY0Rlc2MgPSBuZXcgRG9jdW1lbnRGcmFnbWVudCgpO1xyXG5cdFx0c25pcHBldHNGaWxlTG9jRGVzYy5jcmVhdGVEaXYoe30sIGRpdiA9PiB7XHJcblx0XHRcdGRpdi5pbm5lckhUTUwgPSBgXHJcblx0XHRcdFRoZSBmaWxlIG9yIGZvbGRlciB0byBsb2FkIHNuaXBwZXRzIGZyb20uIFRoZSBmaWxlIG9yIGZvbGRlciBtdXN0IGJlIHdpdGhpbiB5b3VyIHZhdWx0LCBhbmQgbm90IHdpdGhpbiBhIGhpZGRlbiBmb2xkZXIgKHN1Y2ggYXMgPGNvZGU+Lm9ic2lkaWFuLzwvY29kZT4pLmA7XHJcblx0XHR9KTtcclxuXHJcblx0XHRjb25zdCBzbmlwcGV0c0ZpbGVMb2MgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgIC5zZXROYW1lKFwiU25pcHBldHMgZmlsZSBvciBmb2xkZXIgbG9jYXRpb25cIilcclxuICAgIC5zZXREZXNjKHNuaXBwZXRzRmlsZUxvY0Rlc2MpO1xyXG5cclxuICAgIGxldCBpbnB1dEVsOiBIVE1MSW5wdXRFbGVtZW50IHwgdW5kZWZpbmVkOyAvLyBEZWZpbmUgd2l0aCBhIHBvc3NpYmxlIHVuZGVmaW5lZCB0eXBlXHJcblxyXG4gICAgc25pcHBldHNGaWxlTG9jLmFkZFNlYXJjaCgoY29tcG9uZW50KSA9PiB7XHJcbiAgICAgICAgY29tcG9uZW50XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRzRmlsZUxvY2F0aW9uKVxyXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNGaWxlTG9jYXRpb24pXHJcbiAgICAgICAgICAgIC5vbkNoYW5nZShcclxuICAgICAgICAgICAgICAgIGRlYm91bmNlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzRmlsZUxvY2F0aW9uID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgfSwgNTAwLCB0cnVlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgXHJcbiAgICAgICAgLy8gRW5zdXJlIGlucHV0RWwgaXMgYXNzaWduZWRcclxuICAgICAgICBpbnB1dEVsID0gY29tcG9uZW50LmlucHV0RWwgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICBpbnB1dEVsLmFkZENsYXNzKFwibGF0ZXgtc3VpdGUtbG9jYXRpb24taW5wdXQtZWxcIik7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gRW5zdXJlIGlucHV0RWwgaXMgZGVmaW5lZCBiZWZvcmUgcGFzc2luZyB0byBGaWxlU3VnZ2VzdFxyXG4gICAgaWYgKGlucHV0RWwpIHtcclxuICAgICAgICB0aGlzLnNuaXBwZXRzRmlsZUxvY0VsID0gc25pcHBldHNGaWxlTG9jLnNldHRpbmdFbDtcclxuICAgICAgICBuZXcgRmlsZVN1Z2dlc3QodGhpcy5hcHAsIGlucHV0RWwpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiSW5wdXQgZWxlbWVudCBpcyB1bmRlZmluZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuXHJcblx0XHQvLyBIaWRlIHNldHRpbmdzIHRoYXQgYXJlIG5vdCByZWxldmFudCB3aGVuIFwibG9hZFNuaXBwZXRzRnJvbUZpbGVcIiBpcyBzZXQgdG8gdHJ1ZS9mYWxzZVxyXG5cdFx0Y29uc3QgbG9hZFNuaXBwZXRzRnJvbUZpbGUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZTtcclxuXHRcdHNuaXBwZXRzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgbG9hZFNuaXBwZXRzRnJvbUZpbGUpO1xyXG5cdFx0dGhpcy5zbmlwcGV0c0ZpbGVMb2NFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCAhbG9hZFNuaXBwZXRzRnJvbUZpbGUpO1xyXG5cclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJLZXkgdHJpZ2dlciBmb3Igbm9uLWF1dG8gc25pcHBldHNcIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGF0IGtleSB0byBwcmVzcyB0byBleHBhbmQgbm9uLWF1dG8gc25pcHBldHMuXCIpXHJcblx0XHRcdC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+IGRyb3Bkb3duXHJcblx0XHRcdFx0LmFkZE9wdGlvbihcIlRhYlwiLCBcIlRhYlwiKVxyXG5cdFx0XHRcdC5hZGRPcHRpb24oXCIgXCIsIFwiU3BhY2VcIilcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNUcmlnZ2VyKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzVHJpZ2dlciA9IHZhbHVlIGFzIFwiVGFiXCIgfFxyXG5cdFx0XHRcdFx0XHRcIiBcIjtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pXHJcblx0XHRcdCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlDb25jZWFsU2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiQ29uY2VhbFwiLCBcIm1hdGgtaW50ZWdyYWwteFwiKTtcclxuXHJcblx0XHRjb25zdCBmcmFnbWVudCA9IG5ldyBEb2N1bWVudEZyYWdtZW50KCk7XHJcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIk1ha2UgZXF1YXRpb25zIG1vcmUgcmVhZGFibGUgYnkgaGlkaW5nIExhVGVYIHN5bnRheCBhbmQgaW5zdGVhZCBkaXNwbGF5aW5nIGl0IGluIGEgcHJldHR5IGZvcm1hdC5cIikpO1xyXG5cdFx0ZnJhZ21lbnQuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LmlubmVySFRNTCA9IGBcclxuXHRcdFx0ZS5nLiA8Y29kZT5cXFxcZG90e3h9XnsyfSArIFxcXFxkb3R7eX1eezJ9PC9jb2RlPiB3aWxsIGRpc3BsYXkgYXMg4bqLwrIgKyDhuo/CsiwgYW5kIDxjb2RlPlxcXFxzcXJ0eyAxLVxcXFxiZXRhXnsyfSB9PC9jb2RlPiB3aWxsIGRpc3BsYXkgYXMg4oiaeyAxLc6ywrIgfS5cclxuXHRcdGApO1xyXG5cdFx0ZnJhZ21lbnQuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJMYVRlWCBiZW5lYXRoIHRoZSBjdXJzb3Igd2lsbCBiZSByZXZlYWxlZC5cIikpO1xyXG5cdFx0ZnJhZ21lbnQuY3JlYXRlRWwoXCJiclwiKTtcclxuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiRGlzYWJsZWQgYnkgZGVmYXVsdCB0byBub3QgY29uZnVzZSBuZXcgdXNlcnMuIEhvd2V2ZXIsIEkgcmVjb21tZW5kIHR1cm5pbmcgdGhpcyBvbiBvbmNlIHlvdSBhcmUgY29tZm9ydGFibGUgd2l0aCB0aGUgcGx1Z2luIVwiKSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhmcmFnbWVudClcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxFbmFibGVkKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxFbmFibGVkID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KVxyXG5cdFx0XHQpO1xyXG5cclxuXHRcdGNvbnN0IGZyYWdtZW50MiA9IG5ldyBEb2N1bWVudEZyYWdtZW50KCk7XHJcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJIb3cgbG9uZyB0byBkZWxheSB0aGUgcmV2ZWFsIG9mIExhVGVYIGZvciwgaW4gbWlsbGlzZWNvbmRzLCB3aGVuIHRoZSBjdXJzb3IgbW92ZXMgb3ZlciBMYVRlWC4gRGVmYXVsdHMgdG8gMCAoTGFUZVggdW5kZXIgdGhlIGN1cnNvciBpcyByZXZlYWxlZCBpbW1lZGlhdGVseSkuXCIpKTtcclxuXHRcdGZyYWdtZW50Mi5jcmVhdGVFbChcImJyXCIpO1xyXG5cdFx0ZnJhZ21lbnQyLmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiQ2FuIGJlIHNldCB0byBhIHBvc2l0aXZlIG51bWJlciwgZS5nLiAzMDAsIHRvIGRlbGF5IHRoZSByZXZlYWwgb2YgTGFUZVgsIG1ha2luZyBpdCBtdWNoIGVhc2llciB0byBuYXZpZ2F0ZSBlcXVhdGlvbnMgdXNpbmcgYXJyb3cga2V5cy5cIikpO1xyXG5cdFx0ZnJhZ21lbnQyLmNyZWF0ZUVsKFwiYnJcIik7XHJcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJNdXN0IGJlIGFuIGludGVnZXIg4omlIDAuXCIpKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJSZXZlYWwgZGVsYXkgKG1zKVwiKVxyXG5cdFx0XHQuc2V0RGVzYyhmcmFnbWVudDIpXHJcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihTdHJpbmcoREVGQVVMVF9TRVRUSU5HUy5jb25jZWFsUmV2ZWFsVGltZW91dCkpXHJcblx0XHRcdFx0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb25jZWFsUmV2ZWFsVGltZW91dCkpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKHZhbHVlID0+IHtcclxuXHRcdFx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgdmFsdWUgaXMgYSBub24tbmVnYXRpdmUgaW50ZWdlclxyXG5cdFx0XHRcdFx0Y29uc3Qgb2sgPSAvXlxcZCskLy50ZXN0KHZhbHVlKTtcclxuXHRcdFx0XHRcdGlmIChvaykge1xyXG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb25jZWFsUmV2ZWFsVGltZW91dCA9IE51bWJlcih2YWx1ZSk7XHJcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH0pXHJcblx0XHRcdCk7XHJcblxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5Q29sb3JIaWdobGlnaHRCcmFja2V0c1NldHRpbmdzKCkge1xyXG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkhpZ2hsaWdodCBhbmQgY29sb3IgYnJhY2tldHNcIiwgXCJwYXJlbnRoZXNlc1wiKTtcclxuICAgIHRoaXMuYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbCxcIkNvbG9yIHBhaXJlZCBicmFja2V0c1wiLFwiV2hldGhlciB0byBjb2xvcml6ZSBtYXRjaGluZyBicmFja2V0cy5cIix0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb2xvclBhaXJlZEJyYWNrZXRzRW5hYmxlZClcclxuICAgIHRoaXMuYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbCxcIkhpZ2hsaWdodCBtYXRjaGluZyBicmFja2V0IGJlbmVhdGggY3Vyc29yXCIsXCJXaGVuIHRoZSBjdXJzb3IgaXMgYWRqYWNlbnQgdG8gYSBicmFja2V0LCBoaWdobGlnaHQgdGhlIG1hdGNoaW5nIGJyYWNrZXQuXCIsdGhpcy5wbHVnaW4uc2V0dGluZ3MuaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNFbmFibGVkKVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5UG9wdXBQcmV2aWV3U2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiTWF0aCBwb3B1cCBwcmV2aWV3XCIsIFwic3VwZXJzY3JpcHRcIik7XHJcblxyXG5cdFx0Y29uc3QgcG9wdXBfZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XHJcblx0XHRjb25zdCBwb3B1cF9saW5lMSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblx0XHRwb3B1cF9saW5lMS5zZXRUZXh0KFwiV2hlbiBpbnNpZGUgYW4gZXF1YXRpb24sIHNob3cgYSBwb3B1cCBwcmV2aWV3IHdpbmRvdyBvZiB0aGUgcmVuZGVyZWQgbWF0aC5cIik7XHJcblx0XHRjb25zdCBwb3B1cF9zcGFjZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJiclwiKTtcclxuXHRcdGNvbnN0IHBvcHVwX2xpbmUyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuXHRcdHBvcHVwX2xpbmUyLnNldFRleHQoXCJUaGUgcG9wdXAgcHJldmlldyB3aWxsIGJlIHNob3duIGZvciBhbGwgaW5saW5lIG1hdGggZXF1YXRpb25zLCBhcyB3ZWxsIGFzIGZvciBibG9jayBtYXRoIGVxdWF0aW9ucyBpbiBTb3VyY2UgbW9kZS5cIik7XHJcblx0XHRwb3B1cF9mcmFnbWVudC5hcHBlbmQocG9wdXBfbGluZTEsIHBvcHVwX3NwYWNlLCBwb3B1cF9saW5lMik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhwb3B1cF9mcmFnbWVudClcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdGhQcmV2aWV3RW5hYmxlZClcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiUG9zaXRpb25cIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGVyZSB0byBkaXNwbGF5IHRoZSBwb3B1cCBwcmV2aWV3IHJlbGF0aXZlIHRvIHRoZSBlcXVhdGlvbiBzb3VyY2UuXCIpXHJcblx0XHRcdC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+IGRyb3Bkb3duXHJcblx0XHRcdFx0LmFkZE9wdGlvbihcIkFib3ZlXCIsIFwiQWJvdmVcIilcclxuXHRcdFx0XHQuYWRkT3B0aW9uKFwiQmVsb3dcIiwgXCJCZWxvd1wiKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld1Bvc2l0aW9uSXNBYm92ZSA/IFwiQWJvdmVcIiA6IFwiQmVsb3dcIilcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld1Bvc2l0aW9uSXNBYm92ZSA9ICh2YWx1ZSA9PT0gXCJBYm92ZVwiKTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pXHJcblx0XHRcdCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlBdXRvZnJhY3Rpb25TZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBdXRvLWZyYWN0aW9uXCIsIFwibWF0aC14LWRpdmlkZS15LTJcIik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgYXV0by1mcmFjdGlvbiBpcyBlbmFibGVkLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uRW5hYmxlZClcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25FbmFibGVkID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRnJhY3Rpb24gc3ltYm9sXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiVGhlIGZyYWN0aW9uIHN5bWJvbCB0byB1c2UgaW4gdGhlIHJlcGxhY2VtZW50LiBlLmcuIFxcXFxmcmFjLCBcXFxcZGZyYWMsIFxcXFx0ZnJhY1wiKVxyXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5hdXRvZnJhY3Rpb25TeW1ib2wpXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvblN5bWJvbClcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25TeW1ib2wgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkV4Y2x1ZGVkIGVudmlyb25tZW50c1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBlbnZpcm9ubWVudHMgdG8gZXhjbHVkZSBhdXRvLWZyYWN0aW9uIGZyb20gcnVubmluZyBpbi4gRm9yIGV4YW1wbGUsIHRvIGV4Y2x1ZGUgYXV0by1mcmFjdGlvbiBmcm9tIHJ1bm5pbmcgd2hpbGUgaW5zaWRlIGFuIGV4cG9uZW50LCBzdWNoIGFzIGVeey4uLn0sIHVzZSAgW1xcXCJee1xcXCIsIFxcXCJ9XFxcIl1cIilcclxuXHRcdFx0LmFkZFRleHRBcmVhKHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcIlsgW1xcXCJee1xcXCIsIFxcXCJ9XSBdXCIpXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkV4Y2x1ZGVkRW52cylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25FeGNsdWRlZEVudnMgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiQnJlYWtpbmcgY2hhcmFjdGVyc1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBjaGFyYWN0ZXJzIHRoYXQgZGVub3RlIHRoZSBzdGFydC9lbmQgb2YgYSBmcmFjdGlvbi4gZS5nLiBpZiArIGlzIGluY2x1ZGVkIGluIHRoZSBsaXN0LCBcXFwiYStiL2NcXFwiIHdpbGwgZXhwYW5kIHRvIFxcXCJhK1xcXFxmcmFje2J9e2N9XFxcIi4gSWYgKyBpcyBub3QgaW4gdGhlIGxpc3QsIGl0IHdpbGwgZXhwYW5kIHRvIFxcXCJcXFxcZnJhY3thK2J9e2N9XFxcIi5cIilcclxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuYXV0b2ZyYWN0aW9uQnJlYWtpbmdDaGFycylcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uQnJlYWtpbmdDaGFycylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25CcmVha2luZ0NoYXJzID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5TWF0cml4U2hvcnRjdXRzU2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiTWF0cml4IHNob3J0Y3V0c1wiLCBcImJyYWNrZXRzLWNvbnRhaW5cIik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgbWF0cml4IHNob3J0Y3V0cyBhcmUgZW5hYmxlZC5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkVudmlyb25tZW50c1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBlbnZpcm9ubWVudCBuYW1lcyB0byBydW4gdGhlIG1hdHJpeCBzaG9ydGN1dHMgaW4sIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXHJcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLm1hdHJpeFNob3J0Y3V0c0Vudk5hbWVzKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbnZOYW1lcylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbnZOYW1lcyA9IHZhbHVlO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlUYWJvdXRTZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJUYWJvdXRcIiwgXCJ0YWJvdXRcIik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdGFib3V0IGlzIGVuYWJsZWQuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YWJvdXRFbmFibGVkKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnRhYm91dEVuYWJsZWQgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGlzcGxheUF1dG9FbmxhcmdlQnJhY2tldHNTZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBdXRvLWVubGFyZ2UgYnJhY2tldHNcIiwgXCJwYXJlbnRoZXNlc1wiKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBhdXRvbWF0aWNhbGx5IGVubGFyZ2UgYnJhY2tldHMgY29udGFpbmluZyBlLmcuIHN1bSwgaW50LCBmcmFjLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0cylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIlRyaWdnZXJzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiQSBsaXN0IG9mIHN5bWJvbHMgdGhhdCBzaG91bGQgdHJpZ2dlciBhdXRvLWVubGFyZ2UgYnJhY2tldHMsIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXHJcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmF1dG9FbmxhcmdlQnJhY2tldHNUcmlnZ2VycylcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9FbmxhcmdlQnJhY2tldHNUcmlnZ2VycyA9IHZhbHVlO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGlzcGxheUFkdmFuY2VkU25pcHBldFNldHRpbmdzKCkge1xyXG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkFkdmFuY2VkIHNuaXBwZXQgc2V0dGluZ3NcIik7XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJTbmlwcGV0IHZhcmlhYmxlc1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkFzc2lnbiBzbmlwcGV0IHZhcmlhYmxlcyB0aGF0IGNhbiBiZSB1c2VkIGFzIHNob3J0Y3V0cyB3aGVuIHdyaXRpbmcgc25pcHBldHMuXCIpXHJcblx0XHRcdC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlcylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KVxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRWYXJpYWJsZXMpKVxyXG5cdFx0XHQuc2V0Q2xhc3MoXCJsYXRleC1zdWl0ZS1zbmlwcGV0LXZhcmlhYmxlcy1zZXR0aW5nXCIpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBmaWxlIG9yIGZvbGRlclwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIGEgc3BlY2lmaWVkIGZpbGUsIG9yIGZyb20gYWxsIGZpbGVzIHdpdGhpbiBhIGZvbGRlciAoaW5zdGVhZCBvZiBmcm9tIHRoZSBwbHVnaW4gc2V0dGluZ3MpLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSlcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0c25pcHBldFZhcmlhYmxlc1NldHRpbmcuc2V0dGluZ0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsIHZhbHVlKTtcclxuXHRcdFx0XHRcdGlmICh0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwgIT0gdW5kZWZpbmVkKVxyXG5cdFx0XHRcdFx0XHR0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIXZhbHVlKTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NEZXNjID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcclxuXHRcdHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRGVzYy5jcmVhdGVEaXYoe30sIChkaXYpID0+IHtcclxuXHRcdFx0ZGl2LmlubmVySFRNTCA9IGBcclxuXHRcdFx0VGhlIGZpbGUgb3IgZm9sZGVyIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbS4gVGhlIGZpbGUgb3IgZm9sZGVyIG11c3QgYmUgd2l0aGluIHlvdXIgdmF1bHQsIGFuZCBub3Qgd2l0aGluIGEgaGlkZGVuIGZvbGRlciAoc3VjaCBhcyA8Y29kZT4ub2JzaWRpYW4vPC9jb2RlPikuYDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdGNvbnN0IHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAuc2V0TmFtZShcIlNuaXBwZXQgdmFyaWFibGVzIGZpbGUgb3IgZm9sZGVyIGxvY2F0aW9uXCIpXHJcbiAgICAuc2V0RGVzYyhzbmlwcGV0VmFyaWFibGVzRmlsZUxvY0Rlc2MpO1xyXG5cclxuXHJcbiAgICBsZXQgaW5wdXRWYXJpYWJsZXNFbDogSFRNTElucHV0RWxlbWVudCB8IHVuZGVmaW5lZDsgLy8gQWxsb3cgcG90ZW50aWFsIHVuZGVmaW5lZCB2YWx1ZXNcclxuXHJcbiAgICBzbmlwcGV0VmFyaWFibGVzRmlsZUxvYy5hZGRTZWFyY2goKGNvbXBvbmVudCkgPT4ge1xyXG4gICAgICAgIGNvbXBvbmVudFxyXG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY2F0aW9uKVxyXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NhdGlvbilcclxuICAgICAgICAgICAgLm9uQ2hhbmdlKFxyXG4gICAgICAgICAgICAgICAgZGVib3VuY2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NhdGlvbiA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncyh0cnVlKTtcclxuICAgICAgICAgICAgICAgIH0sIDUwMCwgdHJ1ZSlcclxuICAgICAgICAgICAgKTtcclxuICAgIFxyXG4gICAgICAgIC8vIEVuc3VyZSBpbnB1dFZhcmlhYmxlc0VsIGlzIGFzc2lnbmVkIGNvcnJlY3RseVxyXG4gICAgICAgIGlucHV0VmFyaWFibGVzRWwgPSBjb21wb25lbnQuaW5wdXRFbCBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgIGlucHV0VmFyaWFibGVzRWwuYWRkQ2xhc3MoXCJsYXRleC1zdWl0ZS1sb2NhdGlvbi1pbnB1dC1lbFwiKTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBFbnN1cmUgaW5wdXRWYXJpYWJsZXNFbCBpcyBkZWZpbmVkIGJlZm9yZSBwYXNzaW5nIGl0IHRvIEZpbGVTdWdnZXN0XHJcbiAgICBpZiAoaW5wdXRWYXJpYWJsZXNFbCkge1xyXG4gICAgICAgIHRoaXMuc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbCA9IHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jLnNldHRpbmdFbDtcclxuICAgICAgICBuZXcgRmlsZVN1Z2dlc3QodGhpcy5hcHAsIGlucHV0VmFyaWFibGVzRWwpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiSW5wdXQgZWxlbWVudCBmb3IgdmFyaWFibGVzIGlzIHVuZGVmaW5lZC5cIik7XHJcbiAgICB9XHJcblxyXG5cclxuXHRcdC8vIEhpZGUgc2V0dGluZ3MgdGhhdCBhcmUgbm90IHJlbGV2YW50IHdoZW4gXCJsb2FkU25pcHBldHNGcm9tRmlsZVwiIGlzIHNldCB0byB0cnVlL2ZhbHNlXHJcblx0XHRjb25zdCBsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZTtcclxuXHRcdHNuaXBwZXRWYXJpYWJsZXNTZXR0aW5nLnNldHRpbmdFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCBsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKTtcclxuXHRcdHRoaXMuc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCAhbG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiV29yZCBkZWxpbWl0ZXJzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiU3ltYm9scyB0aGF0IHdpbGwgYmUgdHJlYXRlZCBhcyB3b3JkIGRlbGltaXRlcnMsIGZvciB1c2Ugd2l0aCB0aGUgXFxcIndcXFwiIHNuaXBwZXQgb3B0aW9uLlwiKVxyXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy53b3JkRGVsaW1pdGVycylcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud29yZERlbGltaXRlcnMpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Mud29yZERlbGltaXRlcnMgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiUmVtb3ZlIHRyYWlsaW5nIHdoaXRlc3BhY2VzIGluIHNuaXBwZXRzIGluIGlubGluZSBtYXRoXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byByZW1vdmUgdHJhaWxpbmcgd2hpdGVzcGFjZXMgd2hlbiBleHBhbmRpbmcgc25pcHBldHMgYXQgdGhlIGVuZCBvZiBpbmxpbmUgbWF0aCBibG9ja3MuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdmVTbmlwcGV0V2hpdGVzcGFjZSlcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdmVTbmlwcGV0V2hpdGVzcGFjZSA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0LnNldE5hbWUoXCJSZW1vdmUgY2xvc2luZyAkIHdoZW4gYmFja3NwYWNpbmcgaW5zaWRlIGJsYW5rIGlubGluZSBtYXRoXCIpXHJcblx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gYWxzbyByZW1vdmUgdGhlIGNsb3NpbmcgJCB3aGVuIHlvdSBkZWxldGUgdGhlIG9wZW5pbmcgJCBzeW1ib2wgaW5zaWRlIGJsYW5rIGlubGluZSBtYXRoLlwiKVxyXG5cdFx0LmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB0b2dnbGVcclxuXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9EZWxldGUkKVxyXG5cdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0RlbGV0ZSQgPSB2YWx1ZTtcclxuXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0fSkpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkRvbid0IHRyaWdnZXIgc25pcHBldHMgd2hlbiBJTUUgaXMgYWN0aXZlXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBzdXBwcmVzcyBzbmlwcGV0cyB0cmlnZ2VyaW5nIHdoZW4gYW4gSU1FIGlzIGFjdGl2ZS5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSlcclxuXHRcdFx0KTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJDb2RlIGxhbmd1YWdlcyB0byBpbnRlcnByZXQgYXMgbWF0aCBtb2RlXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiQ29kZWJsb2NrIGxhbmd1YWdlcyB3aGVyZSB0aGUgd2hvbGUgY29kZSBibG9jayBzaG91bGQgYmUgdHJlYXRlZCBsaWtlIGEgbWF0aCBibG9jaywgc2VwYXJhdGVkIGJ5IGNvbW1hcy5cIilcclxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuZm9yY2VNYXRoTGFuZ3VhZ2VzKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb3JjZU1hdGhMYW5ndWFnZXMpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9yY2VNYXRoTGFuZ3VhZ2VzID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cdH1cclxuXHJcbiAgcHJpdmF0ZSBkaXNwbGF5U3R5bGVTZXR0aW5ncygpe1xyXG4gICAgY29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIk1hdGggUGx1Z2luIFNldHRpbmdzXCIgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsLFwiSW52ZXJ0IGRhcmsgY29sb3JzIGluIGRhcmsgbW9kZVwiLFwiSW52ZXJ0IGRhcmsgY29sb3JzIGluIGRpYWdyYW1zIChlLmcuIGF4ZXMsIGFycm93cykgd2hlbiBpbiBkYXJrIG1vZGUsIHNvIHRoYXQgdGhleSBhcmUgdmlzaWJsZS5cIix0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKVxyXG5cclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJDbGVhciBjYWNoZWQgU1ZHc1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIlNWR3MgcmVuZGVyZWQgd2l0aCBUaWtaSmF4IGFyZSBzdG9yZWQgaW4gYSBkYXRhYmFzZSwgc28gZGlhZ3JhbXMgZG9uJ3QgaGF2ZSB0byBiZSByZS1yZW5kZXJlZCBmcm9tIHNjcmF0Y2ggZXZlcnkgdGltZSB5b3Ugb3BlbiBhIHBhZ2UuIFVzZSB0aGlzIHRvIGNsZWFyIHRoZSBjYWNoZSBhbmQgZm9yY2UgYWxsIGRpYWdyYW1zIHRvIGJlIHJlLXJlbmRlcmVkLlwiKVxyXG5cdFx0XHQuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cclxuXHRcdFx0XHQuc2V0SWNvbihcInRyYXNoXCIpXHJcblx0XHRcdFx0LnNldFRvb2x0aXAoXCJDbGVhciBjYWNoZWQgU1ZHc1wiKVxyXG5cdFx0XHRcdC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuXHRcdFx0XHRcdGxvY2FsRm9yYWdlLmNsZWFyKChlcnIpID0+IHtcclxuXHRcdFx0XHRcdFx0aWYgKGVycikge1xyXG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKGVycik7XHJcblx0XHRcdFx0XHRcdFx0bmV3IE5vdGljZShlcnIsIDMwMDApO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJUaWtaSmF4OiBTdWNjZXNzZnVsbHkgY2xlYXJlZCBjYWNoZWQgU1ZHcy5cIiwgMzAwMCk7XHJcblx0XHRcdFx0XHRcdH1cclxuICAgICAgICAgICAgXHJcblx0XHRcdFx0XHR9KTtcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUoIFwiUmVuZGVyZWQgbnVtYmVyIGZvcm1hdFwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiQ2hvb3NlIGhvdyB0byBmb3JtYXQgbnVtYmVycyBpbiB0aGUgcmVzdWx0LlwiKVxyXG4gICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oJzEwMDAnLFwiZm9ybWF0dGVkIC4wMDBcIik7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oJzEwMDAwJyxcImZvcm1hdHRlZCAuMDAwMFwiKTtcclxuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbignMTAwMDAwJyxcImZvcm1hdHRlZCAuMDAwMDBcIik7XHJcbiAgICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcblxyXG4gICAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJNYXRoIFBsdWdpbiBzdHlsZVwiIH0pO1xyXG5cclxuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvci5cIiwgXCJiYWNrZ3JvdW5kXCIpO1xyXG4gICAgICB0aGlzLmFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbCwgXCJFdmVuIFJvdyBCYWNrZ3JvdW5kIENvbG9yXCIsIFwiU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciBldmVuIHJvd3MuXCIsIFwiZXZlblJvd0JhY2tncm91bmRcIik7XHJcbiAgICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCBcIk9kZCBSb3cgQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3Igb2RkIHJvd3MuXCIsIFwib2RkUm93QmFja2dyb3VuZFwiKTtcclxuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiaW5mb01vZGFsIEJhY2tncm91bmQgQ29sb3JcIiwgXCJTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIHRoZSBpbmZvIG1vZGFsLlwiLCBcImluZm9Nb2RhbEJhY2tncm91bmRcIik7XHJcbiAgICAgIFxyXG4gICAgICB0aGlzLmFkZFRleHRTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkZvbnQgU2l6ZVwiLCBcIlNldCB0aGUgZm9udCBzaXplIGZvciB0aGUgcm93cy5cIiwgXCJmb250U2l6ZVwiKTtcclxuICAgICAgdGhpcy5hZGRUZXh0U2V0dGluZyhjb250YWluZXJFbCwgXCJSb3cgUGFkZGluZ1wiLCBcIlNldCB0aGUgcGFkZGluZyBmb3IgdGhlIHJvd3MuXCIsIFwicm93UGFkZGluZ1wiKTtcclxuICAgICAgdGhpcy5hZGRUZXh0U2V0dGluZyhjb250YWluZXJFbCwgXCJJY29uIFNpemVcIiwgXCJTZXQgdGhlIHNpemUgb2YgdGhlIGljb25zLlwiLCBcImljb25TaXplXCIpO1xyXG4gIFxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxyXG4gICAgICAgICAgYnV0dG9uXHJcbiAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KFwiV2lwZSBIaXN0b3J5IE1vZHVsZVwiKVxyXG4gICAgICAgICAgICAuc2V0VG9vbHRpcChcIlJlc2V0IGFsbCBzZXR0aW5ncyB0byB0aGVpciBkZWZhdWx0IHZhbHVlc1wiKVxyXG4gICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2Vzc2lvbkhpc3RvcnkgPSBbXTtcclxuICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJIaXN0b3J5IHdhcyB3aXBlZC5cIilcclxuICAgICAgICAgICAgfSkpO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+XHJcbiAgICAgICAgYnV0dG9uXHJcbiAgICAgICAgICAuc2V0QnV0dG9uVGV4dChcIlJlc2V0IHRvIERlZmF1bHRcIilcclxuICAgICAgICAgIC5zZXRUb29sdGlwKFwiUmVzZXQgYWxsIHNldHRpbmdzIHRvIHRoZWlyIGRlZmF1bHQgdmFsdWVzXCIpXHJcbiAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XHJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiU2V0dGluZ3MgaGF2ZSBiZWVuIHJlc2V0IHRvIGRlZmF1bHQuXCIpO1xyXG4gICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcclxuICAgICAgICB9KSk7XHJcblxyXG4gIH1cclxuICBwcml2YXRlIGFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleTogYW55KSB7XHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUobmFtZSlcclxuICAgICAgLnNldERlc2MoZGVzY3JpcHRpb24pXHJcbiAgICAgIC5hZGRDb2xvclBpY2tlcihjb2xvclBpY2tlciA9PiB7XHJcbiAgICAgICAgY29sb3JQaWNrZXIuc2V0VmFsdWUoc2V0dGluZ0tleSk7XHJcbiAgICAgICAgY29sb3JQaWNrZXIub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICBzZXR0aW5nS2V5ID0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuICBwcml2YXRlIGFkZFRvZ2dsZVNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHNldHRpbmdLZXk6IGFueSkge1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKG5hbWUpXHJcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxyXG4gICAgICAuYWRkVG9nZ2xlKCh0b2dnbGUgOiBhbnkpID0+IHtcclxuICAgICAgICB0b2dnbGUuc2V0VmFsdWUoc2V0dGluZ0tleSlcclxuICAgICAgICB0b2dnbGUub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgIHNldHRpbmdLZXk9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB0aGlzLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcbiAgcHJpdmF0ZSBhZGRUZXh0U2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleTogYW55KSB7XHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUobmFtZSlcclxuICAgICAgLnNldERlc2MoZGVzY3JpcHRpb24pXHJcbiAgICAgIC5hZGRUZXh0KCh0ZXh0OiBhbnkpID0+IHtcclxuICAgICAgICB0ZXh0LnNldFBsYWNlaG9sZGVyKHNldHRpbmdLZXkpLnNldFZhbHVlKHNldHRpbmdLZXkpO1xyXG4gICAgICAgIHRleHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBzdHJpbmcpID0+IHtcclxuICAgICAgICAgIHNldHRpbmdLZXk9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB0aGlzLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcbiAgdXBkYXRlU3R5bGVzKCkge1xyXG4gICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLXJvdy1iYWNrZ3JvdW5kXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmJhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tZXZlbi1yb3ctYmFja2dyb3VuZFwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ldmVuUm93QmFja2dyb3VuZCk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1vZGQtcm93LWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3Mub2RkUm93QmFja2dyb3VuZCk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1pbmZvLW1vZGFsLWNvbHVtbi1iYWNrZ3JvdW5kXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmluZm9Nb2RhbEJhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tZm9udC1zaXplXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmZvbnRTaXplKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLXJvdy1wYWRkaW5nXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLnJvd1BhZGRpbmcpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0taWNvbi1zaXplXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmljb25TaXplKTtcclxufVxyXG5cdGNyZWF0ZVNuaXBwZXRzRWRpdG9yKHNuaXBwZXRzU2V0dGluZzogU2V0dGluZykge1xyXG5cdFx0Y29uc3QgY3VzdG9tQ1NTV3JhcHBlciA9IHNuaXBwZXRzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRGl2KFwic25pcHBldHMtZWRpdG9yLXdyYXBwZXJcIik7XHJcblx0XHRjb25zdCBzbmlwcGV0c0Zvb3RlciA9IHNuaXBwZXRzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRGl2KFwic25pcHBldHMtZm9vdGVyXCIpO1xyXG5cdFx0Y29uc3QgdmFsaWRpdHkgPSBzbmlwcGV0c0Zvb3Rlci5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3ItdmFsaWRpdHlcIik7XHJcblxyXG5cdFx0Y29uc3QgdmFsaWRpdHlJbmRpY2F0b3IgPSBuZXcgRXh0cmFCdXR0b25Db21wb25lbnQodmFsaWRpdHkpO1xyXG5cdFx0dmFsaWRpdHlJbmRpY2F0b3Iuc2V0SWNvbihcImNoZWNrbWFya1wiKVxyXG5cdFx0XHQuZXh0cmFTZXR0aW5nc0VsLmFkZENsYXNzKFwic25pcHBldHMtZWRpdG9yLXZhbGlkaXR5LWluZGljYXRvclwiKTtcclxuXHJcblx0XHRjb25zdCB2YWxpZGl0eVRleHQgPSB2YWxpZGl0eS5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3ItdmFsaWRpdHktdGV4dFwiKTtcclxuXHRcdHZhbGlkaXR5VGV4dC5hZGRDbGFzcyhcInNldHRpbmctaXRlbS1kZXNjcmlwdGlvblwiKTtcclxuXHRcdHZhbGlkaXR5VGV4dC5zdHlsZS5wYWRkaW5nID0gXCIwXCI7XHJcblxyXG5cclxuXHRcdGZ1bmN0aW9uIHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHN1Y2Nlc3M6IGJvb2xlYW4pIHtcclxuXHRcdFx0dmFsaWRpdHlJbmRpY2F0b3Iuc2V0SWNvbihzdWNjZXNzID8gXCJjaGVja21hcmtcIiA6IFwiY3Jvc3NcIik7XHJcblx0XHRcdHZhbGlkaXR5SW5kaWNhdG9yLmV4dHJhU2V0dGluZ3NFbC5yZW1vdmVDbGFzcyhzdWNjZXNzID8gXCJpbnZhbGlkXCIgOiBcInZhbGlkXCIpO1xyXG5cdFx0XHR2YWxpZGl0eUluZGljYXRvci5leHRyYVNldHRpbmdzRWwuYWRkQ2xhc3Moc3VjY2VzcyA/IFwidmFsaWRcIiA6IFwiaW52YWxpZFwiKTtcclxuXHRcdFx0dmFsaWRpdHlUZXh0LnNldFRleHQoc3VjY2VzcyA/IFwiU2F2ZWRcIiA6IFwiSW52YWxpZCBzeW50YXguIENoYW5nZXMgbm90IHNhdmVkXCIpO1xyXG5cdFx0fVxyXG5cclxuXHJcblx0XHRjb25zdCBleHRlbnNpb25zID0gYmFzaWNTZXR1cDtcclxuXHJcblx0XHRjb25zdCBjaGFuZ2UgPSBFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKGFzeW5jICh2OiBWaWV3VXBkYXRlKSA9PiB7XHJcblx0XHRcdGlmICh2LmRvY0NoYW5nZWQpIHtcclxuXHRcdFx0XHRjb25zdCBzbmlwcGV0cyA9IHYuc3RhdGUuZG9jLnRvU3RyaW5nKCk7XHJcblx0XHRcdFx0bGV0IHN1Y2Nlc3MgPSB0cnVlO1xyXG5cclxuXHRcdFx0XHRsZXQgc25pcHBldFZhcmlhYmxlcztcclxuXHRcdFx0XHR0cnkge1xyXG5cdFx0XHRcdFx0c25pcHBldFZhcmlhYmxlcyA9IGF3YWl0IHBhcnNlU25pcHBldFZhcmlhYmxlcyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzKVxyXG5cdFx0XHRcdFx0YXdhaXQgcGFyc2VTbmlwcGV0cyhzbmlwcGV0cywgc25pcHBldFZhcmlhYmxlcyk7XHJcblx0XHRcdFx0fVxyXG5cdFx0XHRcdGNhdGNoIChlKSB7XHJcblx0XHRcdFx0XHRzdWNjZXNzID0gZmFsc2U7XHJcblx0XHRcdFx0fVxyXG5cclxuXHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcihzdWNjZXNzKTtcclxuXHJcblx0XHRcdFx0aWYgKCFzdWNjZXNzKSByZXR1cm47XHJcblxyXG5cdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzID0gc25pcHBldHM7XHJcblx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG4gICAgXHJcblx0XHRleHRlbnNpb25zLnB1c2goY2hhbmdlKTtcclxuXHJcblx0XHR0aGlzLnNuaXBwZXRzRWRpdG9yID0gY3JlYXRlQ01FZGl0b3IodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHMsIGV4dGVuc2lvbnMpO1xyXG5cdFx0Y3VzdG9tQ1NTV3JhcHBlci5hcHBlbmRDaGlsZCh0aGlzLnNuaXBwZXRzRWRpdG9yLmRvbSk7XHJcblxyXG5cclxuXHRcdGNvbnN0IGJ1dHRvbnNEaXYgPSBzbmlwcGV0c0Zvb3Rlci5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3ItYnV0dG9uc1wiKTtcclxuXHRcdGNvbnN0IHJlc2V0ID0gbmV3IEJ1dHRvbkNvbXBvbmVudChidXR0b25zRGl2KTtcclxuXHRcdHJlc2V0LnNldEljb24oXCJzd2l0Y2hcIilcclxuXHRcdFx0LnNldFRvb2x0aXAoXCJSZXNldCB0byBkZWZhdWx0IHNuaXBwZXRzXCIpXHJcblx0XHRcdC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuXHRcdFx0XHRuZXcgQ29uZmlybWF0aW9uTW9kYWwodGhpcy5wbHVnaW4uYXBwLFxyXG5cdFx0XHRcdFx0XCJBcmUgeW91IHN1cmU/IFRoaXMgd2lsbCBkZWxldGUgYW55IGN1c3RvbSBzbmlwcGV0cyB5b3UgaGF2ZSB3cml0dGVuLlwiLFxyXG5cdFx0XHRcdFx0YnV0dG9uID0+IGJ1dHRvblxyXG5cdFx0XHRcdFx0XHQuc2V0QnV0dG9uVGV4dChcIlJlc2V0IHRvIGRlZmF1bHQgc25pcHBldHNcIilcclxuXHRcdFx0XHRcdFx0LnNldFdhcm5pbmcoKSxcclxuXHRcdFx0XHRcdGFzeW5jICgpID0+IHtcclxuXHRcdFx0XHRcdFx0dGhpcy5zbmlwcGV0c0VkaXRvci5zZXRTdGF0ZShFZGl0b3JTdGF0ZS5jcmVhdGUoeyBkb2M6IERFRkFVTFRfU05JUFBFVFMsIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMgfSkpO1xyXG5cdFx0XHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcih0cnVlKTtcclxuXHJcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzID0gREVGQVVMVF9TTklQUEVUUztcclxuXHJcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdCkub3BlbigpO1xyXG5cdFx0XHR9KTtcclxuXHJcblx0XHRjb25zdCByZW1vdmUgPSBuZXcgQnV0dG9uQ29tcG9uZW50KGJ1dHRvbnNEaXYpO1xyXG5cdFx0cmVtb3ZlLnNldEljb24oXCJ0cmFzaFwiKVxyXG5cdFx0XHQuc2V0VG9vbHRpcChcIlJlbW92ZSBhbGwgc25pcHBldHNcIilcclxuXHRcdFx0Lm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG5cdFx0XHRcdG5ldyBDb25maXJtYXRpb25Nb2RhbCh0aGlzLnBsdWdpbi5hcHAsXHJcblx0XHRcdFx0XHRcIkFyZSB5b3Ugc3VyZT8gVGhpcyB3aWxsIGRlbGV0ZSBhbnkgY3VzdG9tIHNuaXBwZXRzIHlvdSBoYXZlIHdyaXR0ZW4uXCIsXHJcblx0XHRcdFx0XHRidXR0b24gPT4gYnV0dG9uXHJcblx0XHRcdFx0XHRcdC5zZXRCdXR0b25UZXh0KFwiUmVtb3ZlIGFsbCBzbmlwcGV0c1wiKVxyXG5cdFx0XHRcdFx0XHQuc2V0V2FybmluZygpLFxyXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xyXG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGBbXHJcblxyXG5dYDtcclxuXHRcdFx0XHRcdFx0dGhpcy5zbmlwcGV0c0VkaXRvci5zZXRTdGF0ZShFZGl0b3JTdGF0ZS5jcmVhdGUoeyBkb2M6IHZhbHVlLCBleHRlbnNpb25zOiBleHRlbnNpb25zIH0pKTtcclxuXHRcdFx0XHRcdFx0dXBkYXRlVmFsaWRpdHlJbmRpY2F0b3IodHJ1ZSk7XHJcblxyXG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cyA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHQpLm9wZW4oKTtcclxuXHRcdFx0fSk7XHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBDb25maXJtYXRpb25Nb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuXHJcblx0Y29uc3RydWN0b3IoYXBwOiBBcHAsIGJvZHk6IHN0cmluZywgYnV0dG9uQ2FsbGJhY2s6IChidXR0b246IEJ1dHRvbkNvbXBvbmVudCkgPT4gdm9pZCwgY2xpY2tDYWxsYmFjazogKCkgPT4gUHJvbWlzZTx2b2lkPikge1xyXG5cdFx0c3VwZXIoYXBwKTtcclxuXHJcblx0XHR0aGlzLmNvbnRlbnRFbC5hZGRDbGFzcyhcImxhdGV4LXN1aXRlLWNvbmZpcm1hdGlvbi1tb2RhbFwiKTtcclxuXHRcdHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGJvZHkgfSk7XHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKVxyXG5cdFx0XHQuYWRkQnV0dG9uKGJ1dHRvbiA9PiB7XHJcblx0XHRcdFx0YnV0dG9uQ2FsbGJhY2soYnV0dG9uKTtcclxuXHRcdFx0XHRidXR0b24ub25DbGljayhhc3luYyAoKSA9PiB7XHJcblx0XHRcdFx0XHRhd2FpdCBjbGlja0NhbGxiYWNrKCk7XHJcblx0XHRcdFx0XHR0aGlzLmNsb3NlKCk7XHJcblx0XHRcdFx0fSk7XHJcblx0XHRcdH0pXHJcblx0XHRcdC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxyXG5cdFx0XHRcdC5zZXRCdXR0b25UZXh0KFwiQ2FuY2VsXCIpXHJcblx0XHRcdFx0Lm9uQ2xpY2soKCkgPT4gdGhpcy5jbG9zZSgpKSk7XHJcblx0fVxyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVDTUVkaXRvcihjb250ZW50OiBzdHJpbmcsIGV4dGVuc2lvbnM6IEV4dGVuc2lvbltdKSB7XHJcblx0Y29uc3QgdmlldyA9IG5ldyBFZGl0b3JWaWV3KHtcclxuXHRcdHN0YXRlOiBFZGl0b3JTdGF0ZS5jcmVhdGUoeyBkb2M6IGNvbnRlbnQsIGV4dGVuc2lvbnMgfSksXHJcblx0fSk7XHJcblxyXG5cdHJldHVybiB2aWV3O1xyXG59XHJcblxyXG4iXX0=