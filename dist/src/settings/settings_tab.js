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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NfdGFiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzX3RhYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsV0FBVyxFQUFhLE1BQU0sbUJBQW1CLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQzFELE9BQU8sRUFBTyxlQUFlLEVBQUMsTUFBTSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNsSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxLQUFLLFdBQVcsTUFBTSxhQUFhLENBQUM7QUFFM0MsTUFBTSxPQUFPLG9CQUFxQixTQUFRLGdCQUFnQjtJQUN6RCxNQUFNLENBQW1CO0lBQ3pCLGNBQWMsQ0FBYTtJQUMzQixpQkFBaUIsQ0FBYztJQUMvQix5QkFBeUIsQ0FBYztJQUV2QyxZQUFZLEdBQVEsRUFBRSxNQUF3QjtRQUM3QyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQztZQUNILFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FB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UyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTTthQUN6QixhQUFhLENBQUMsUUFBUSxDQUFDO2FBQ3ZCLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7Q0FDRDtBQUVELFNBQVMsY0FBYyxDQUFDLE9BQWUsRUFBRSxVQUF1QjtJQUMvRCxNQUFNLElBQUksR0FBRyxJQUFJLFVBQVUsQ0FBQztRQUMzQixLQUFLLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsVUFBVSxFQUFFLENBQUM7S0FDdkQsQ0FBQyxDQUFDO0lBRUgsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRWRpdG9yU3RhdGUsIEV4dGVuc2lvbiB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1VwZGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5pbXBvcnQgeyBBcHAsIEJ1dHRvbkNvbXBvbmVudCxOb3RpY2UsIEV4dHJhQnV0dG9uQ29tcG9uZW50LCBNb2RhbCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZywgZGVib3VuY2UsIHNldEljb24gfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IHBhcnNlU25pcHBldFZhcmlhYmxlcywgcGFyc2VTbmlwcGV0cyB9IGZyb20gXCJzcmMvc25pcHBldHMvcGFyc2VcIjtcbmltcG9ydCB7IERFRkFVTFRfU05JUFBFVFMgfSBmcm9tIFwic3JjL3V0aWxzL2RlZmF1bHRfc25pcHBldHNcIjtcbmltcG9ydCBMYXRleFN1aXRlUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XG5pbXBvcnQgeyBERUZBVUxUX1NFVFRJTkdTIH0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7IEZpbGVTdWdnZXN0IH0gZnJvbSBcIi4vdWkvZmlsZV9zdWdnZXN0XCI7XG5pbXBvcnQgeyBiYXNpY1NldHVwIH0gZnJvbSBcIi4vdWkvc25pcHBldHNfZWRpdG9yL2V4dGVuc2lvbnNcIjtcbmltcG9ydCAqIGFzIGxvY2FsRm9yYWdlIGZyb20gXCJsb2NhbGZvcmFnZVwiO1xuXG5leHBvcnQgY2xhc3MgTGF0ZXhTdWl0ZVNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcblx0cGx1Z2luOiBMYXRleFN1aXRlUGx1Z2luO1xuXHRzbmlwcGV0c0VkaXRvcjogRWRpdG9yVmlldztcblx0c25pcHBldHNGaWxlTG9jRWw6IEhUTUxFbGVtZW50O1xuXHRzbmlwcGV0VmFyaWFibGVzRmlsZUxvY0VsOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBMYXRleFN1aXRlUGx1Z2luKSB7XG5cdFx0c3VwZXIoYXBwLCBwbHVnaW4pO1xuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIHRyeSB7XG4gICAgICBsb2NhbEZvcmFnZS5jb25maWcoeyBuYW1lOiBcIlRpa3pKYXhcIiwgc3RvcmVOYW1lOiBcInN2Z0ltYWdlc1wiIH0pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XG4gICAgfVxuXHR9XG5cblx0aGlkZSgpIHtcblx0XHR0aGlzLnNuaXBwZXRzRWRpdG9yPy5kZXN0cm95KCk7XG5cdH1cblxuXHRhZGRIZWFkaW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBpY29uID0gXCJtYXRoXCIpIHtcblx0XHRjb25zdCBoZWFkaW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUobmFtZSkuc2V0SGVhZGluZygpO1xuXG5cdFx0Y29uc3QgcGFyZW50RWwgPSBoZWFkaW5nLnNldHRpbmdFbDtcblx0XHRjb25zdCBpY29uRWwgPSBwYXJlbnRFbC5jcmVhdGVEaXYoKTtcblx0XHRzZXRJY29uKGljb25FbCwgaWNvbik7XG5cdFx0aWNvbkVsLmFkZENsYXNzKFwibGF0ZXgtc3VpdGUtc2V0dGluZ3MtaWNvblwiKTtcblxuXHRcdHBhcmVudEVsLnByZXBlbmQoaWNvbkVsKTtcblx0fVxuXG5cdGRpc3BsYXkoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcblx0XHRjb250YWluZXJFbC5lbXB0eSgpO1xuXG5cdFx0dGhpcy5kaXNwbGF5U25pcHBldFNldHRpbmdzKCk7XG5cdFx0dGhpcy5kaXNwbGF5Q29uY2VhbFNldHRpbmdzKCk7XG5cdFx0dGhpcy5kaXNwbGF5Q29sb3JIaWdobGlnaHRCcmFja2V0c1NldHRpbmdzKCk7XG5cdFx0dGhpcy5kaXNwbGF5UG9wdXBQcmV2aWV3U2V0dGluZ3MoKTtcblx0XHR0aGlzLmRpc3BsYXlBdXRvZnJhY3Rpb25TZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheU1hdHJpeFNob3J0Y3V0c1NldHRpbmdzKCk7XG5cdFx0dGhpcy5kaXNwbGF5VGFib3V0U2V0dGluZ3MoKTtcblx0XHR0aGlzLmRpc3BsYXlBdXRvRW5sYXJnZUJyYWNrZXRzU2V0dGluZ3MoKTtcblx0XHR0aGlzLmRpc3BsYXlBZHZhbmNlZFNuaXBwZXRTZXR0aW5ncygpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5U25pcHBldFNldHRpbmdzKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiU25pcHBldHNcIiwgXCJiYWxscGVuXCIpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciBzbmlwcGV0cyBhcmUgZW5hYmxlZC5cIilcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNFbmFibGVkKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNFbmFibGVkID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pKTtcblxuXG5cdFx0Y29uc3Qgc25pcHBldHNTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIlNuaXBwZXRzXCIpXG5cdFx0XHQuc2V0RGVzYyhcIkVudGVyIHNuaXBwZXRzIGhlcmUuICBSZW1lbWJlciB0byBhZGQgYSBjb21tYSBhZnRlciBlYWNoIHNuaXBwZXQsIGFuZCBlc2NhcGUgYWxsIGJhY2tzbGFzaGVzIHdpdGggYW4gZXh0cmEgXFxcXC4gTGluZXMgc3RhcnRpbmcgd2l0aCBcXFwiLy9cXFwiIHdpbGwgYmUgdHJlYXRlZCBhcyBjb21tZW50cyBhbmQgaWdub3JlZC5cIilcblx0XHRcdC5zZXRDbGFzcyhcInNuaXBwZXRzLXRleHQtYXJlYVwiKTtcblxuXG5cdFx0dGhpcy5jcmVhdGVTbmlwcGV0c0VkaXRvcihzbmlwcGV0c1NldHRpbmcpO1xuXG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiTG9hZCBzbmlwcGV0cyBmcm9tIGZpbGUgb3IgZm9sZGVyXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gbG9hZCBzbmlwcGV0cyBmcm9tIGEgc3BlY2lmaWVkIGZpbGUsIG9yIGZyb20gYWxsIGZpbGVzIHdpdGhpbiBhIGZvbGRlciAoaW5zdGVhZCBvZiBmcm9tIHRoZSBwbHVnaW4gc2V0dGluZ3MpLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSlcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlID0gdmFsdWU7XG5cblx0XHRcdFx0XHRzbmlwcGV0c1NldHRpbmcuc2V0dGluZ0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsIHZhbHVlKTtcblx0XHRcdFx0XHRpZiAodGhpcy5zbmlwcGV0c0ZpbGVMb2NFbCAhPSB1bmRlZmluZWQpXG5cdFx0XHRcdFx0XHR0aGlzLnNuaXBwZXRzRmlsZUxvY0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsICF2YWx1ZSk7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cblx0XHRjb25zdCBzbmlwcGV0c0ZpbGVMb2NEZXNjID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRzbmlwcGV0c0ZpbGVMb2NEZXNjLmNyZWF0ZURpdih7fSwgZGl2ID0+IHtcblx0XHRcdGRpdi5pbm5lckhUTUwgPSBgXG5cdFx0XHRUaGUgZmlsZSBvciBmb2xkZXIgdG8gbG9hZCBzbmlwcGV0cyBmcm9tLiBUaGUgZmlsZSBvciBmb2xkZXIgbXVzdCBiZSB3aXRoaW4geW91ciB2YXVsdCwgYW5kIG5vdCB3aXRoaW4gYSBoaWRkZW4gZm9sZGVyIChzdWNoIGFzIDxjb2RlPi5vYnNpZGlhbi88L2NvZGU+KS5gO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc25pcHBldHNGaWxlTG9jID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgLnNldE5hbWUoXCJTbmlwcGV0cyBmaWxlIG9yIGZvbGRlciBsb2NhdGlvblwiKVxuICAgIC5zZXREZXNjKHNuaXBwZXRzRmlsZUxvY0Rlc2MpO1xuXG4gICAgbGV0IGlucHV0RWw6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQ7IC8vIERlZmluZSB3aXRoIGEgcG9zc2libGUgdW5kZWZpbmVkIHR5cGVcblxuICAgIHNuaXBwZXRzRmlsZUxvYy5hZGRTZWFyY2goKGNvbXBvbmVudCkgPT4ge1xuICAgICAgICBjb21wb25lbnRcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRzRmlsZUxvY2F0aW9uKVxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzRmlsZUxvY2F0aW9uKVxuICAgICAgICAgICAgLm9uQ2hhbmdlKFxuICAgICAgICAgICAgICAgIGRlYm91bmNlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0ZpbGVMb2NhdGlvbiA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3ModHJ1ZSk7XG4gICAgICAgICAgICAgICAgfSwgNTAwLCB0cnVlKVxuICAgICAgICAgICAgKTtcbiAgICBcbiAgICAgICAgLy8gRW5zdXJlIGlucHV0RWwgaXMgYXNzaWduZWRcbiAgICAgICAgaW5wdXRFbCA9IGNvbXBvbmVudC5pbnB1dEVsIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGlucHV0RWwuYWRkQ2xhc3MoXCJsYXRleC1zdWl0ZS1sb2NhdGlvbi1pbnB1dC1lbFwiKTtcbiAgICB9KTtcbiAgICBcbiAgICAvLyBFbnN1cmUgaW5wdXRFbCBpcyBkZWZpbmVkIGJlZm9yZSBwYXNzaW5nIHRvIEZpbGVTdWdnZXN0XG4gICAgaWYgKGlucHV0RWwpIHtcbiAgICAgICAgdGhpcy5zbmlwcGV0c0ZpbGVMb2NFbCA9IHNuaXBwZXRzRmlsZUxvYy5zZXR0aW5nRWw7XG4gICAgICAgIG5ldyBGaWxlU3VnZ2VzdCh0aGlzLmFwcCwgaW5wdXRFbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIklucHV0IGVsZW1lbnQgaXMgdW5kZWZpbmVkLlwiKTtcbiAgICB9XG5cblxuXHRcdC8vIEhpZGUgc2V0dGluZ3MgdGhhdCBhcmUgbm90IHJlbGV2YW50IHdoZW4gXCJsb2FkU25pcHBldHNGcm9tRmlsZVwiIGlzIHNldCB0byB0cnVlL2ZhbHNlXG5cdFx0Y29uc3QgbG9hZFNuaXBwZXRzRnJvbUZpbGUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZTtcblx0XHRzbmlwcGV0c1NldHRpbmcuc2V0dGluZ0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsIGxvYWRTbmlwcGV0c0Zyb21GaWxlKTtcblx0XHR0aGlzLnNuaXBwZXRzRmlsZUxvY0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsICFsb2FkU25pcHBldHNGcm9tRmlsZSk7XG5cblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJLZXkgdHJpZ2dlciBmb3Igbm9uLWF1dG8gc25pcHBldHNcIilcblx0XHRcdC5zZXREZXNjKFwiV2hhdCBrZXkgdG8gcHJlc3MgdG8gZXhwYW5kIG5vbi1hdXRvIHNuaXBwZXRzLlwiKVxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bikgPT4gZHJvcGRvd25cblx0XHRcdFx0LmFkZE9wdGlvbihcIlRhYlwiLCBcIlRhYlwiKVxuXHRcdFx0XHQuYWRkT3B0aW9uKFwiIFwiLCBcIlNwYWNlXCIpXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c1RyaWdnZXIpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c1RyaWdnZXIgPSB2YWx1ZSBhcyBcIlRhYlwiIHxcblx0XHRcdFx0XHRcdFwiIFwiO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcGxheUNvbmNlYWxTZXR0aW5ncygpIHtcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkNvbmNlYWxcIiwgXCJtYXRoLWludGVncmFsLXhcIik7XG5cblx0XHRjb25zdCBmcmFnbWVudCA9IG5ldyBEb2N1bWVudEZyYWdtZW50KCk7XG5cdFx0ZnJhZ21lbnQuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJNYWtlIGVxdWF0aW9ucyBtb3JlIHJlYWRhYmxlIGJ5IGhpZGluZyBMYVRlWCBzeW50YXggYW5kIGluc3RlYWQgZGlzcGxheWluZyBpdCBpbiBhIHByZXR0eSBmb3JtYXQuXCIpKTtcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuaW5uZXJIVE1MID0gYFxuXHRcdFx0ZS5nLiA8Y29kZT5cXFxcZG90e3h9XnsyfSArIFxcXFxkb3R7eX1eezJ9PC9jb2RlPiB3aWxsIGRpc3BsYXkgYXMg4bqLwrIgKyDhuo/CsiwgYW5kIDxjb2RlPlxcXFxzcXJ0eyAxLVxcXFxiZXRhXnsyfSB9PC9jb2RlPiB3aWxsIGRpc3BsYXkgYXMg4oiaeyAxLc6ywrIgfS5cblx0XHRgKTtcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIkxhVGVYIGJlbmVhdGggdGhlIGN1cnNvciB3aWxsIGJlIHJldmVhbGVkLlwiKSk7XG5cdFx0ZnJhZ21lbnQuY3JlYXRlRWwoXCJiclwiKTtcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIkRpc2FibGVkIGJ5IGRlZmF1bHQgdG8gbm90IGNvbmZ1c2UgbmV3IHVzZXJzLiBIb3dldmVyLCBJIHJlY29tbWVuZCB0dXJuaW5nIHRoaXMgb24gb25jZSB5b3UgYXJlIGNvbWZvcnRhYmxlIHdpdGggdGhlIHBsdWdpbiFcIikpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcblx0XHRcdC5zZXREZXNjKGZyYWdtZW50KVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb25jZWFsRW5hYmxlZClcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxFbmFibGVkID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXG5cdFx0Y29uc3QgZnJhZ21lbnQyID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJIb3cgbG9uZyB0byBkZWxheSB0aGUgcmV2ZWFsIG9mIExhVGVYIGZvciwgaW4gbWlsbGlzZWNvbmRzLCB3aGVuIHRoZSBjdXJzb3IgbW92ZXMgb3ZlciBMYVRlWC4gRGVmYXVsdHMgdG8gMCAoTGFUZVggdW5kZXIgdGhlIGN1cnNvciBpcyByZXZlYWxlZCBpbW1lZGlhdGVseSkuXCIpKTtcblx0XHRmcmFnbWVudDIuY3JlYXRlRWwoXCJiclwiKTtcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJDYW4gYmUgc2V0IHRvIGEgcG9zaXRpdmUgbnVtYmVyLCBlLmcuIDMwMCwgdG8gZGVsYXkgdGhlIHJldmVhbCBvZiBMYVRlWCwgbWFraW5nIGl0IG11Y2ggZWFzaWVyIHRvIG5hdmlnYXRlIGVxdWF0aW9ucyB1c2luZyBhcnJvdyBrZXlzLlwiKSk7XG5cdFx0ZnJhZ21lbnQyLmNyZWF0ZUVsKFwiYnJcIik7XG5cdFx0ZnJhZ21lbnQyLmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiTXVzdCBiZSBhbiBpbnRlZ2VyIOKJpSAwLlwiKSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiUmV2ZWFsIGRlbGF5IChtcylcIilcblx0XHRcdC5zZXREZXNjKGZyYWdtZW50Milcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoU3RyaW5nKERFRkFVTFRfU0VUVElOR1MuY29uY2VhbFJldmVhbFRpbWVvdXQpKVxuXHRcdFx0XHQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxSZXZlYWxUaW1lb3V0KSlcblx0XHRcdFx0Lm9uQ2hhbmdlKHZhbHVlID0+IHtcblx0XHRcdFx0XHQvLyBNYWtlIHN1cmUgdGhlIHZhbHVlIGlzIGEgbm9uLW5lZ2F0aXZlIGludGVnZXJcblx0XHRcdFx0XHRjb25zdCBvayA9IC9eXFxkKyQvLnRlc3QodmFsdWUpO1xuXHRcdFx0XHRcdGlmIChvaykge1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuY29uY2VhbFJldmVhbFRpbWVvdXQgPSBOdW1iZXIodmFsdWUpO1xuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5Q29sb3JIaWdobGlnaHRCcmFja2V0c1NldHRpbmdzKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiSGlnaGxpZ2h0IGFuZCBjb2xvciBicmFja2V0c1wiLCBcInBhcmVudGhlc2VzXCIpO1xuICAgIHRoaXMuYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbCxcIkNvbG9yIHBhaXJlZCBicmFja2V0c1wiLFwiV2hldGhlciB0byBjb2xvcml6ZSBtYXRjaGluZyBicmFja2V0cy5cIix0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb2xvclBhaXJlZEJyYWNrZXRzRW5hYmxlZClcbiAgICB0aGlzLmFkZFRvZ2dsZVNldHRpbmcoY29udGFpbmVyRWwsXCJIaWdobGlnaHQgbWF0Y2hpbmcgYnJhY2tldCBiZW5lYXRoIGN1cnNvclwiLFwiV2hlbiB0aGUgY3Vyc29yIGlzIGFkamFjZW50IHRvIGEgYnJhY2tldCwgaGlnaGxpZ2h0IHRoZSBtYXRjaGluZyBicmFja2V0LlwiLHRoaXMucGx1Z2luLnNldHRpbmdzLmhpZ2hsaWdodEN1cnNvckJyYWNrZXRzRW5hYmxlZClcblx0fVxuXG5cdHByaXZhdGUgZGlzcGxheVBvcHVwUHJldmlld1NldHRpbmdzKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiTWF0aCBwb3B1cCBwcmV2aWV3XCIsIFwic3VwZXJzY3JpcHRcIik7XG5cblx0XHRjb25zdCBwb3B1cF9mcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRjb25zdCBwb3B1cF9saW5lMSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdFx0cG9wdXBfbGluZTEuc2V0VGV4dChcIldoZW4gaW5zaWRlIGFuIGVxdWF0aW9uLCBzaG93IGEgcG9wdXAgcHJldmlldyB3aW5kb3cgb2YgdGhlIHJlbmRlcmVkIG1hdGguXCIpO1xuXHRcdGNvbnN0IHBvcHVwX3NwYWNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJyXCIpO1xuXHRcdGNvbnN0IHBvcHVwX2xpbmUyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRwb3B1cF9saW5lMi5zZXRUZXh0KFwiVGhlIHBvcHVwIHByZXZpZXcgd2lsbCBiZSBzaG93biBmb3IgYWxsIGlubGluZSBtYXRoIGVxdWF0aW9ucywgYXMgd2VsbCBhcyBmb3IgYmxvY2sgbWF0aCBlcXVhdGlvbnMgaW4gU291cmNlIG1vZGUuXCIpO1xuXHRcdHBvcHVwX2ZyYWdtZW50LmFwcGVuZChwb3B1cF9saW5lMSwgcG9wdXBfc3BhY2UsIHBvcHVwX2xpbmUyKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXG5cdFx0XHQuc2V0RGVzYyhwb3B1cF9mcmFnbWVudClcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0aFByZXZpZXdFbmFibGVkKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0aFByZXZpZXdFbmFibGVkID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIlBvc2l0aW9uXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXJlIHRvIGRpc3BsYXkgdGhlIHBvcHVwIHByZXZpZXcgcmVsYXRpdmUgdG8gdGhlIGVxdWF0aW9uIHNvdXJjZS5cIilcblx0XHRcdC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+IGRyb3Bkb3duXG5cdFx0XHRcdC5hZGRPcHRpb24oXCJBYm92ZVwiLCBcIkFib3ZlXCIpXG5cdFx0XHRcdC5hZGRPcHRpb24oXCJCZWxvd1wiLCBcIkJlbG93XCIpXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld1Bvc2l0aW9uSXNBYm92ZSA/IFwiQWJvdmVcIiA6IFwiQmVsb3dcIilcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdGhQcmV2aWV3UG9zaXRpb25Jc0Fib3ZlID0gKHZhbHVlID09PSBcIkFib3ZlXCIpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcGxheUF1dG9mcmFjdGlvblNldHRpbmdzKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiQXV0by1mcmFjdGlvblwiLCBcIm1hdGgteC1kaXZpZGUteS0yXCIpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciBhdXRvLWZyYWN0aW9uIGlzIGVuYWJsZWQuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkVuYWJsZWQpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25FbmFibGVkID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJGcmFjdGlvbiBzeW1ib2xcIilcblx0XHRcdC5zZXREZXNjKFwiVGhlIGZyYWN0aW9uIHN5bWJvbCB0byB1c2UgaW4gdGhlIHJlcGxhY2VtZW50LiBlLmcuIFxcXFxmcmFjLCBcXFxcZGZyYWMsIFxcXFx0ZnJhY1wiKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmF1dG9mcmFjdGlvblN5bWJvbClcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvblN5bWJvbClcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvblN5bWJvbCA9IHZhbHVlO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pKTtcblxuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkV4Y2x1ZGVkIGVudmlyb25tZW50c1wiKVxuXHRcdFx0LnNldERlc2MoXCJBIGxpc3Qgb2YgZW52aXJvbm1lbnRzIHRvIGV4Y2x1ZGUgYXV0by1mcmFjdGlvbiBmcm9tIHJ1bm5pbmcgaW4uIEZvciBleGFtcGxlLCB0byBleGNsdWRlIGF1dG8tZnJhY3Rpb24gZnJvbSBydW5uaW5nIHdoaWxlIGluc2lkZSBhbiBleHBvbmVudCwgc3VjaCBhcyBlXnsuLi59LCB1c2UgIFtcXFwiXntcXFwiLCBcXFwifVxcXCJdXCIpXG5cdFx0XHQuYWRkVGV4dEFyZWEodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcIlsgW1xcXCJee1xcXCIsIFxcXCJ9XSBdXCIpXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25FeGNsdWRlZEVudnMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25FeGNsdWRlZEVudnMgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiQnJlYWtpbmcgY2hhcmFjdGVyc1wiKVxuXHRcdFx0LnNldERlc2MoXCJBIGxpc3Qgb2YgY2hhcmFjdGVycyB0aGF0IGRlbm90ZSB0aGUgc3RhcnQvZW5kIG9mIGEgZnJhY3Rpb24uIGUuZy4gaWYgKyBpcyBpbmNsdWRlZCBpbiB0aGUgbGlzdCwgXFxcImErYi9jXFxcIiB3aWxsIGV4cGFuZCB0byBcXFwiYStcXFxcZnJhY3tifXtjfVxcXCIuIElmICsgaXMgbm90IGluIHRoZSBsaXN0LCBpdCB3aWxsIGV4cGFuZCB0byBcXFwiXFxcXGZyYWN7YStifXtjfVxcXCIuXCIpXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuYXV0b2ZyYWN0aW9uQnJlYWtpbmdDaGFycylcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkJyZWFraW5nQ2hhcnMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25CcmVha2luZ0NoYXJzID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5TWF0cml4U2hvcnRjdXRzU2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJNYXRyaXggc2hvcnRjdXRzXCIsIFwiYnJhY2tldHMtY29udGFpblwiKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgbWF0cml4IHNob3J0Y3V0cyBhcmUgZW5hYmxlZC5cIilcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZClcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVudmlyb25tZW50c1wiKVxuXHRcdFx0LnNldERlc2MoXCJBIGxpc3Qgb2YgZW52aXJvbm1lbnQgbmFtZXMgdG8gcnVuIHRoZSBtYXRyaXggc2hvcnRjdXRzIGluLCBzZXBhcmF0ZWQgYnkgY29tbWFzLlwiKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLm1hdHJpeFNob3J0Y3V0c0Vudk5hbWVzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW52TmFtZXMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbnZOYW1lcyA9IHZhbHVlO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5VGFib3V0U2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJUYWJvdXRcIiwgXCJ0YWJvdXRcIik7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRhYm91dCBpcyBlbmFibGVkLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YWJvdXRFbmFibGVkKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MudGFib3V0RW5hYmxlZCA9IHZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlBdXRvRW5sYXJnZUJyYWNrZXRzU2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBdXRvLWVubGFyZ2UgYnJhY2tldHNcIiwgXCJwYXJlbnRoZXNlc1wiKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gYXV0b21hdGljYWxseSBlbmxhcmdlIGJyYWNrZXRzIGNvbnRhaW5pbmcgZS5nLiBzdW0sIGludCwgZnJhYy5cIilcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0cylcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9FbmxhcmdlQnJhY2tldHMgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiVHJpZ2dlcnNcIilcblx0XHRcdC5zZXREZXNjKFwiQSBsaXN0IG9mIHN5bWJvbHMgdGhhdCBzaG91bGQgdHJpZ2dlciBhdXRvLWVubGFyZ2UgYnJhY2tldHMsIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5QWR2YW5jZWRTbmlwcGV0U2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBZHZhbmNlZCBzbmlwcGV0IHNldHRpbmdzXCIpO1xuXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiU25pcHBldCB2YXJpYWJsZXNcIilcblx0XHRcdC5zZXREZXNjKFwiQXNzaWduIHNuaXBwZXQgdmFyaWFibGVzIHRoYXQgY2FuIGJlIHVzZWQgYXMgc2hvcnRjdXRzIHdoZW4gd3JpdGluZyBzbmlwcGV0cy5cIilcblx0XHRcdC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRWYXJpYWJsZXMpKVxuXHRcdFx0LnNldENsYXNzKFwibGF0ZXgtc3VpdGUtc25pcHBldC12YXJpYWJsZXMtc2V0dGluZ1wiKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJMb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gZmlsZSBvciBmb2xkZXJcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBsb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gYSBzcGVjaWZpZWQgZmlsZSwgb3IgZnJvbSBhbGwgZmlsZXMgd2l0aGluIGEgZm9sZGVyIChpbnN0ZWFkIG9mIGZyb20gdGhlIHBsdWdpbiBzZXR0aW5ncykuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlID0gdmFsdWU7XG5cblx0XHRcdFx0XHRzbmlwcGV0VmFyaWFibGVzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgdmFsdWUpO1xuXHRcdFx0XHRcdGlmICh0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwgIT0gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0dGhpcy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsICF2YWx1ZSk7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NEZXNjID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRzbmlwcGV0VmFyaWFibGVzRmlsZUxvY0Rlc2MuY3JlYXRlRGl2KHt9LCAoZGl2KSA9PiB7XG5cdFx0XHRkaXYuaW5uZXJIVE1MID0gYFxuXHRcdFx0VGhlIGZpbGUgb3IgZm9sZGVyIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbS4gVGhlIGZpbGUgb3IgZm9sZGVyIG11c3QgYmUgd2l0aGluIHlvdXIgdmF1bHQsIGFuZCBub3Qgd2l0aGluIGEgaGlkZGVuIGZvbGRlciAoc3VjaCBhcyA8Y29kZT4ub2JzaWRpYW4vPC9jb2RlPikuYDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgLnNldE5hbWUoXCJTbmlwcGV0IHZhcmlhYmxlcyBmaWxlIG9yIGZvbGRlciBsb2NhdGlvblwiKVxuICAgIC5zZXREZXNjKHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRGVzYyk7XG5cblxuICAgIGxldCBpbnB1dFZhcmlhYmxlc0VsOiBIVE1MSW5wdXRFbGVtZW50IHwgdW5kZWZpbmVkOyAvLyBBbGxvdyBwb3RlbnRpYWwgdW5kZWZpbmVkIHZhbHVlc1xuXG4gICAgc25pcHBldFZhcmlhYmxlc0ZpbGVMb2MuYWRkU2VhcmNoKChjb21wb25lbnQpID0+IHtcbiAgICAgICAgY29tcG9uZW50XG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY2F0aW9uKVxuICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jYXRpb24pXG4gICAgICAgICAgICAub25DaGFuZ2UoXG4gICAgICAgICAgICAgICAgZGVib3VuY2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jYXRpb24gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xuICAgICAgICAgICAgICAgIH0sIDUwMCwgdHJ1ZSlcbiAgICAgICAgICAgICk7XG4gICAgXG4gICAgICAgIC8vIEVuc3VyZSBpbnB1dFZhcmlhYmxlc0VsIGlzIGFzc2lnbmVkIGNvcnJlY3RseVxuICAgICAgICBpbnB1dFZhcmlhYmxlc0VsID0gY29tcG9uZW50LmlucHV0RWwgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgaW5wdXRWYXJpYWJsZXNFbC5hZGRDbGFzcyhcImxhdGV4LXN1aXRlLWxvY2F0aW9uLWlucHV0LWVsXCIpO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEVuc3VyZSBpbnB1dFZhcmlhYmxlc0VsIGlzIGRlZmluZWQgYmVmb3JlIHBhc3NpbmcgaXQgdG8gRmlsZVN1Z2dlc3RcbiAgICBpZiAoaW5wdXRWYXJpYWJsZXNFbCkge1xuICAgICAgICB0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwgPSBzbmlwcGV0VmFyaWFibGVzRmlsZUxvYy5zZXR0aW5nRWw7XG4gICAgICAgIG5ldyBGaWxlU3VnZ2VzdCh0aGlzLmFwcCwgaW5wdXRWYXJpYWJsZXNFbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIklucHV0IGVsZW1lbnQgZm9yIHZhcmlhYmxlcyBpcyB1bmRlZmluZWQuXCIpO1xuICAgIH1cblxuXG5cdFx0Ly8gSGlkZSBzZXR0aW5ncyB0aGF0IGFyZSBub3QgcmVsZXZhbnQgd2hlbiBcImxvYWRTbmlwcGV0c0Zyb21GaWxlXCIgaXMgc2V0IHRvIHRydWUvZmFsc2Vcblx0XHRjb25zdCBsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZTtcblx0XHRzbmlwcGV0VmFyaWFibGVzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgbG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSk7XG5cdFx0dGhpcy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsICFsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJXb3JkIGRlbGltaXRlcnNcIilcblx0XHRcdC5zZXREZXNjKFwiU3ltYm9scyB0aGF0IHdpbGwgYmUgdHJlYXRlZCBhcyB3b3JkIGRlbGltaXRlcnMsIGZvciB1c2Ugd2l0aCB0aGUgXFxcIndcXFwiIHNuaXBwZXQgb3B0aW9uLlwiKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLndvcmREZWxpbWl0ZXJzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud29yZERlbGltaXRlcnMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy53b3JkRGVsaW1pdGVycyA9IHZhbHVlO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJSZW1vdmUgdHJhaWxpbmcgd2hpdGVzcGFjZXMgaW4gc25pcHBldHMgaW4gaW5saW5lIG1hdGhcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byByZW1vdmUgdHJhaWxpbmcgd2hpdGVzcGFjZXMgd2hlbiBleHBhbmRpbmcgc25pcHBldHMgYXQgdGhlIGVuZCBvZiBpbmxpbmUgbWF0aCBibG9ja3MuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW92ZVNuaXBwZXRXaGl0ZXNwYWNlKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3ZlU25pcHBldFdoaXRlc3BhY2UgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0LnNldE5hbWUoXCJSZW1vdmUgY2xvc2luZyAkIHdoZW4gYmFja3NwYWNpbmcgaW5zaWRlIGJsYW5rIGlubGluZSBtYXRoXCIpXG5cdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIGFsc28gcmVtb3ZlIHRoZSBjbG9zaW5nICQgd2hlbiB5b3UgZGVsZXRlIHRoZSBvcGVuaW5nICQgc3ltYm9sIGluc2lkZSBibGFuayBpbmxpbmUgbWF0aC5cIilcblx0XHQuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHRvZ2dsZVxuXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9EZWxldGUkKVxuXHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRGVsZXRlJCA9IHZhbHVlO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdH0pKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJEb24ndCB0cmlnZ2VyIHNuaXBwZXRzIHdoZW4gSU1FIGlzIGFjdGl2ZVwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIHN1cHByZXNzIHNuaXBwZXRzIHRyaWdnZXJpbmcgd2hlbiBhbiBJTUUgaXMgYWN0aXZlLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSlcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSA9IHZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJDb2RlIGxhbmd1YWdlcyB0byBpbnRlcnByZXQgYXMgbWF0aCBtb2RlXCIpXG5cdFx0XHQuc2V0RGVzYyhcIkNvZGVibG9jayBsYW5ndWFnZXMgd2hlcmUgdGhlIHdob2xlIGNvZGUgYmxvY2sgc2hvdWxkIGJlIHRyZWF0ZWQgbGlrZSBhIG1hdGggYmxvY2ssIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuZm9yY2VNYXRoTGFuZ3VhZ2VzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9yY2VNYXRoTGFuZ3VhZ2VzKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9yY2VNYXRoTGFuZ3VhZ2VzID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXHR9XG5cbiAgcHJpdmF0ZSBkaXNwbGF5U3R5bGVTZXR0aW5ncygpe1xuICAgIGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIk1hdGggUGx1Z2luIFNldHRpbmdzXCIgfSk7XG5cbiAgICB0aGlzLmFkZFRvZ2dsZVNldHRpbmcoY29udGFpbmVyRWwsXCJJbnZlcnQgZGFyayBjb2xvcnMgaW4gZGFyayBtb2RlXCIsXCJJbnZlcnQgZGFyayBjb2xvcnMgaW4gZGlhZ3JhbXMgKGUuZy4gYXhlcywgYXJyb3dzKSB3aGVuIGluIGRhcmsgbW9kZSwgc28gdGhhdCB0aGV5IGFyZSB2aXNpYmxlLlwiLHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpXG5cblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJDbGVhciBjYWNoZWQgU1ZHc1wiKVxuXHRcdFx0LnNldERlc2MoXCJTVkdzIHJlbmRlcmVkIHdpdGggVGlrWkpheCBhcmUgc3RvcmVkIGluIGEgZGF0YWJhc2UsIHNvIGRpYWdyYW1zIGRvbid0IGhhdmUgdG8gYmUgcmUtcmVuZGVyZWQgZnJvbSBzY3JhdGNoIGV2ZXJ5IHRpbWUgeW91IG9wZW4gYSBwYWdlLiBVc2UgdGhpcyB0byBjbGVhciB0aGUgY2FjaGUgYW5kIGZvcmNlIGFsbCBkaWFncmFtcyB0byBiZSByZS1yZW5kZXJlZC5cIilcblx0XHRcdC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuXHRcdFx0XHQuc2V0SWNvbihcInRyYXNoXCIpXG5cdFx0XHRcdC5zZXRUb29sdGlwKFwiQ2xlYXIgY2FjaGVkIFNWR3NcIilcblx0XHRcdFx0Lm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGxvY2FsRm9yYWdlLmNsZWFyKChlcnIpID0+IHtcblx0XHRcdFx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coZXJyKTtcblx0XHRcdFx0XHRcdFx0bmV3IE5vdGljZShlcnIsIDMwMDApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJUaWtaSmF4OiBTdWNjZXNzZnVsbHkgY2xlYXJlZCBjYWNoZWQgU1ZHcy5cIiwgMzAwMCk7XG5cdFx0XHRcdFx0XHR9XG4gICAgICAgICAgICBcblx0XHRcdFx0XHR9KTtcbiAgICAgIH0pKTtcblxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgIC5zZXROYW1lKCBcIlJlbmRlcmVkIG51bWJlciBmb3JtYXRcIilcbiAgICAgICAgLnNldERlc2MoXCJDaG9vc2UgaG93IHRvIGZvcm1hdCBudW1iZXJzIGluIHRoZSByZXN1bHQuXCIpXG4gICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKCcxMDAwJyxcImZvcm1hdHRlZCAuMDAwXCIpO1xuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbignMTAwMDAnLFwiZm9ybWF0dGVkIC4wMDAwXCIpO1xuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbignMTAwMDAwJyxcImZvcm1hdHRlZCAuMDAwMDBcIik7XG4gICAgICAgICAgZHJvcGRvd24ub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG5cblxuICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiTWF0aCBQbHVnaW4gc3R5bGVcIiB9KTtcblxuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvci5cIiwgXCJiYWNrZ3JvdW5kXCIpO1xuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiRXZlbiBSb3cgQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3IgZXZlbiByb3dzLlwiLCBcImV2ZW5Sb3dCYWNrZ3JvdW5kXCIpO1xuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiT2RkIFJvdyBCYWNrZ3JvdW5kIENvbG9yXCIsIFwiU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciBvZGQgcm93cy5cIiwgXCJvZGRSb3dCYWNrZ3JvdW5kXCIpO1xuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiaW5mb01vZGFsIEJhY2tncm91bmQgQ29sb3JcIiwgXCJTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIHRoZSBpbmZvIG1vZGFsLlwiLCBcImluZm9Nb2RhbEJhY2tncm91bmRcIik7XG4gICAgICBcbiAgICAgIHRoaXMuYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWwsIFwiRm9udCBTaXplXCIsIFwiU2V0IHRoZSBmb250IHNpemUgZm9yIHRoZSByb3dzLlwiLCBcImZvbnRTaXplXCIpO1xuICAgICAgdGhpcy5hZGRUZXh0U2V0dGluZyhjb250YWluZXJFbCwgXCJSb3cgUGFkZGluZ1wiLCBcIlNldCB0aGUgcGFkZGluZyBmb3IgdGhlIHJvd3MuXCIsIFwicm93UGFkZGluZ1wiKTtcbiAgICAgIHRoaXMuYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWwsIFwiSWNvbiBTaXplXCIsIFwiU2V0IHRoZSBzaXplIG9mIHRoZSBpY29ucy5cIiwgXCJpY29uU2l6ZVwiKTtcbiAgXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cbiAgICAgICAgICBidXR0b25cbiAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KFwiV2lwZSBIaXN0b3J5IE1vZHVsZVwiKVxuICAgICAgICAgICAgLnNldFRvb2x0aXAoXCJSZXNldCBhbGwgc2V0dGluZ3MgdG8gdGhlaXIgZGVmYXVsdCB2YWx1ZXNcIilcbiAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2Vzc2lvbkhpc3RvcnkgPSBbXTtcbiAgICAgICAgICAgICBuZXcgTm90aWNlKFwiSGlzdG9yeSB3YXMgd2lwZWQuXCIpXG4gICAgICAgICAgICB9KSk7XG5cbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cbiAgICAgICAgYnV0dG9uXG4gICAgICAgICAgLnNldEJ1dHRvblRleHQoXCJSZXNldCB0byBEZWZhdWx0XCIpXG4gICAgICAgICAgLnNldFRvb2x0aXAoXCJSZXNldCBhbGwgc2V0dGluZ3MgdG8gdGhlaXIgZGVmYXVsdCB2YWx1ZXNcIilcbiAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZVN0eWxlcygpO1xuICAgICAgICAgICAgbmV3IE5vdGljZShcIlNldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byBkZWZhdWx0LlwiKTtcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICB9KSk7XG5cbiAgfVxuICBwcml2YXRlIGFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleTogYW55KSB7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuc2V0TmFtZShuYW1lKVxuICAgICAgLnNldERlc2MoZGVzY3JpcHRpb24pXG4gICAgICAuYWRkQ29sb3JQaWNrZXIoY29sb3JQaWNrZXIgPT4ge1xuICAgICAgICBjb2xvclBpY2tlci5zZXRWYWx1ZShzZXR0aW5nS2V5KTtcbiAgICAgICAgY29sb3JQaWNrZXIub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgc2V0dGluZ0tleSA9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgcHJpdmF0ZSBhZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBhbnkpIHtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKG5hbWUpXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSA6IGFueSkgPT4ge1xuICAgICAgICB0b2dnbGUuc2V0VmFsdWUoc2V0dGluZ0tleSlcbiAgICAgICAgdG9nZ2xlLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgc2V0dGluZ0tleT0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICBwcml2YXRlIGFkZFRleHRTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBhbnkpIHtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKG5hbWUpXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcbiAgICAgIC5hZGRUZXh0KCh0ZXh0OiBhbnkpID0+IHtcbiAgICAgICAgdGV4dC5zZXRQbGFjZWhvbGRlcihzZXR0aW5nS2V5KS5zZXRWYWx1ZShzZXR0aW5nS2V5KTtcbiAgICAgICAgdGV4dC5vbkNoYW5nZShhc3luYyAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgICAgICAgIHNldHRpbmdLZXk9IHZhbHVlO1xuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cbiAgdXBkYXRlU3R5bGVzKCkge1xuICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tcm93LWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYmFja2dyb3VuZCk7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tZXZlbi1yb3ctYmFja2dyb3VuZFwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5ldmVuUm93QmFja2dyb3VuZCk7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tb2RkLXJvdy1iYWNrZ3JvdW5kXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLm9kZFJvd0JhY2tncm91bmQpO1xuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLWluZm8tbW9kYWwtY29sdW1uLWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5mb01vZGFsQmFja2dyb3VuZCk7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tZm9udC1zaXplXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmZvbnRTaXplKTtcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1yb3ctcGFkZGluZ1wiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yb3dQYWRkaW5nKTtcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1pY29uLXNpemVcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaWNvblNpemUpO1xufVxuXHRjcmVhdGVTbmlwcGV0c0VkaXRvcihzbmlwcGV0c1NldHRpbmc6IFNldHRpbmcpIHtcblx0XHRjb25zdCBjdXN0b21DU1NXcmFwcGVyID0gc25pcHBldHNTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3Itd3JhcHBlclwiKTtcblx0XHRjb25zdCBzbmlwcGV0c0Zvb3RlciA9IHNuaXBwZXRzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRGl2KFwic25pcHBldHMtZm9vdGVyXCIpO1xuXHRcdGNvbnN0IHZhbGlkaXR5ID0gc25pcHBldHNGb290ZXIuY3JlYXRlRGl2KFwic25pcHBldHMtZWRpdG9yLXZhbGlkaXR5XCIpO1xuXG5cdFx0Y29uc3QgdmFsaWRpdHlJbmRpY2F0b3IgPSBuZXcgRXh0cmFCdXR0b25Db21wb25lbnQodmFsaWRpdHkpO1xuXHRcdHZhbGlkaXR5SW5kaWNhdG9yLnNldEljb24oXCJjaGVja21hcmtcIilcblx0XHRcdC5leHRyYVNldHRpbmdzRWwuYWRkQ2xhc3MoXCJzbmlwcGV0cy1lZGl0b3ItdmFsaWRpdHktaW5kaWNhdG9yXCIpO1xuXG5cdFx0Y29uc3QgdmFsaWRpdHlUZXh0ID0gdmFsaWRpdHkuY3JlYXRlRGl2KFwic25pcHBldHMtZWRpdG9yLXZhbGlkaXR5LXRleHRcIik7XG5cdFx0dmFsaWRpdHlUZXh0LmFkZENsYXNzKFwic2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uXCIpO1xuXHRcdHZhbGlkaXR5VGV4dC5zdHlsZS5wYWRkaW5nID0gXCIwXCI7XG5cblxuXHRcdGZ1bmN0aW9uIHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHN1Y2Nlc3M6IGJvb2xlYW4pIHtcblx0XHRcdHZhbGlkaXR5SW5kaWNhdG9yLnNldEljb24oc3VjY2VzcyA/IFwiY2hlY2ttYXJrXCIgOiBcImNyb3NzXCIpO1xuXHRcdFx0dmFsaWRpdHlJbmRpY2F0b3IuZXh0cmFTZXR0aW5nc0VsLnJlbW92ZUNsYXNzKHN1Y2Nlc3MgPyBcImludmFsaWRcIiA6IFwidmFsaWRcIik7XG5cdFx0XHR2YWxpZGl0eUluZGljYXRvci5leHRyYVNldHRpbmdzRWwuYWRkQ2xhc3Moc3VjY2VzcyA/IFwidmFsaWRcIiA6IFwiaW52YWxpZFwiKTtcblx0XHRcdHZhbGlkaXR5VGV4dC5zZXRUZXh0KHN1Y2Nlc3MgPyBcIlNhdmVkXCIgOiBcIkludmFsaWQgc3ludGF4LiBDaGFuZ2VzIG5vdCBzYXZlZFwiKTtcblx0XHR9XG5cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBiYXNpY1NldHVwO1xuXG5cdFx0Y29uc3QgY2hhbmdlID0gRWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZihhc3luYyAodjogVmlld1VwZGF0ZSkgPT4ge1xuXHRcdFx0aWYgKHYuZG9jQ2hhbmdlZCkge1xuXHRcdFx0XHRjb25zdCBzbmlwcGV0cyA9IHYuc3RhdGUuZG9jLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGxldCBzdWNjZXNzID0gdHJ1ZTtcblxuXHRcdFx0XHRsZXQgc25pcHBldFZhcmlhYmxlcztcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRzbmlwcGV0VmFyaWFibGVzID0gYXdhaXQgcGFyc2VTbmlwcGV0VmFyaWFibGVzKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMpXG5cdFx0XHRcdFx0YXdhaXQgcGFyc2VTbmlwcGV0cyhzbmlwcGV0cywgc25pcHBldFZhcmlhYmxlcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRzdWNjZXNzID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcihzdWNjZXNzKTtcblxuXHRcdFx0XHRpZiAoIXN1Y2Nlc3MpIHJldHVybjtcblxuXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cyA9IHNuaXBwZXRzO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdH1cblx0XHR9KTtcbiAgICBcblx0XHRleHRlbnNpb25zLnB1c2goY2hhbmdlKTtcblxuXHRcdHRoaXMuc25pcHBldHNFZGl0b3IgPSBjcmVhdGVDTUVkaXRvcih0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cywgZXh0ZW5zaW9ucyk7XG5cdFx0Y3VzdG9tQ1NTV3JhcHBlci5hcHBlbmRDaGlsZCh0aGlzLnNuaXBwZXRzRWRpdG9yLmRvbSk7XG5cblxuXHRcdGNvbnN0IGJ1dHRvbnNEaXYgPSBzbmlwcGV0c0Zvb3Rlci5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3ItYnV0dG9uc1wiKTtcblx0XHRjb25zdCByZXNldCA9IG5ldyBCdXR0b25Db21wb25lbnQoYnV0dG9uc0Rpdik7XG5cdFx0cmVzZXQuc2V0SWNvbihcInN3aXRjaFwiKVxuXHRcdFx0LnNldFRvb2x0aXAoXCJSZXNldCB0byBkZWZhdWx0IHNuaXBwZXRzXCIpXG5cdFx0XHQub25DbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG5ldyBDb25maXJtYXRpb25Nb2RhbCh0aGlzLnBsdWdpbi5hcHAsXG5cdFx0XHRcdFx0XCJBcmUgeW91IHN1cmU/IFRoaXMgd2lsbCBkZWxldGUgYW55IGN1c3RvbSBzbmlwcGV0cyB5b3UgaGF2ZSB3cml0dGVuLlwiLFxuXHRcdFx0XHRcdGJ1dHRvbiA9PiBidXR0b25cblx0XHRcdFx0XHRcdC5zZXRCdXR0b25UZXh0KFwiUmVzZXQgdG8gZGVmYXVsdCBzbmlwcGV0c1wiKVxuXHRcdFx0XHRcdFx0LnNldFdhcm5pbmcoKSxcblx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnNuaXBwZXRzRWRpdG9yLnNldFN0YXRlKEVkaXRvclN0YXRlLmNyZWF0ZSh7IGRvYzogREVGQVVMVF9TTklQUEVUUywgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyB9KSk7XG5cdFx0XHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcih0cnVlKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHMgPSBERUZBVUxUX1NOSVBQRVRTO1xuXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCkub3BlbigpO1xuXHRcdFx0fSk7XG5cblx0XHRjb25zdCByZW1vdmUgPSBuZXcgQnV0dG9uQ29tcG9uZW50KGJ1dHRvbnNEaXYpO1xuXHRcdHJlbW92ZS5zZXRJY29uKFwidHJhc2hcIilcblx0XHRcdC5zZXRUb29sdGlwKFwiUmVtb3ZlIGFsbCBzbmlwcGV0c1wiKVxuXHRcdFx0Lm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRuZXcgQ29uZmlybWF0aW9uTW9kYWwodGhpcy5wbHVnaW4uYXBwLFxuXHRcdFx0XHRcdFwiQXJlIHlvdSBzdXJlPyBUaGlzIHdpbGwgZGVsZXRlIGFueSBjdXN0b20gc25pcHBldHMgeW91IGhhdmUgd3JpdHRlbi5cIixcblx0XHRcdFx0XHRidXR0b24gPT4gYnV0dG9uXG5cdFx0XHRcdFx0XHQuc2V0QnV0dG9uVGV4dChcIlJlbW92ZSBhbGwgc25pcHBldHNcIilcblx0XHRcdFx0XHRcdC5zZXRXYXJuaW5nKCksXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBgW1xuXG5dYDtcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNFZGl0b3Iuc2V0U3RhdGUoRWRpdG9yU3RhdGUuY3JlYXRlKHsgZG9jOiB2YWx1ZSwgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyB9KSk7XG5cdFx0XHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcih0cnVlKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHMgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0KS5vcGVuKCk7XG5cdFx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBDb25maXJtYXRpb25Nb2RhbCBleHRlbmRzIE1vZGFsIHtcblxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgYm9keTogc3RyaW5nLCBidXR0b25DYWxsYmFjazogKGJ1dHRvbjogQnV0dG9uQ29tcG9uZW50KSA9PiB2b2lkLCBjbGlja0NhbGxiYWNrOiAoKSA9PiBQcm9taXNlPHZvaWQ+KSB7XG5cdFx0c3VwZXIoYXBwKTtcblxuXHRcdHRoaXMuY29udGVudEVsLmFkZENsYXNzKFwibGF0ZXgtc3VpdGUtY29uZmlybWF0aW9uLW1vZGFsXCIpO1xuXHRcdHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGJvZHkgfSk7XG5cblxuXHRcdG5ldyBTZXR0aW5nKHRoaXMuY29udGVudEVsKVxuXHRcdFx0LmFkZEJ1dHRvbihidXR0b24gPT4ge1xuXHRcdFx0XHRidXR0b25DYWxsYmFjayhidXR0b24pO1xuXHRcdFx0XHRidXR0b24ub25DbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgY2xpY2tDYWxsYmFjaygpO1xuXHRcdFx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KVxuXHRcdFx0LmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG5cdFx0XHRcdC5zZXRCdXR0b25UZXh0KFwiQ2FuY2VsXCIpXG5cdFx0XHRcdC5vbkNsaWNrKCgpID0+IHRoaXMuY2xvc2UoKSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNNRWRpdG9yKGNvbnRlbnQ6IHN0cmluZywgZXh0ZW5zaW9uczogRXh0ZW5zaW9uW10pIHtcblx0Y29uc3QgdmlldyA9IG5ldyBFZGl0b3JWaWV3KHtcblx0XHRzdGF0ZTogRWRpdG9yU3RhdGUuY3JlYXRlKHsgZG9jOiBjb250ZW50LCBleHRlbnNpb25zIH0pLFxuXHR9KTtcblxuXHRyZXR1cm4gdmlldztcbn1cblxuIl19