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
                this.plugin.settings.numberFormatting = value;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NfdGFiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzX3RhYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsV0FBVyxFQUFhLE1BQU0sbUJBQW1CLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQzFELE9BQU8sRUFBTyxlQUFlLEVBQUMsTUFBTSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNsSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxLQUFLLFdBQVcsTUFBTSxhQUFhLENBQUM7QUFFM0MsTUFBTSxPQUFPLG9CQUFxQixTQUFRLGdCQUFnQjtJQUN6RCxNQUFNLENBQW1CO0lBQ3pCLGNBQWMsQ0FBYTtJQUMzQixpQkFBaUIsQ0FBYztJQUMvQix5QkFBeUIsQ0FBYztJQUV2QyxZQUFZLEdBQVEsRUFBRSxNQUF3QjtRQUM3QyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQztZQUNILFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNyQixDQUFDO0lBQ0osQ0FBQztJQUVELElBQUk7UUFDSCxJQUFJLENBQUMsY0FBYyxFQUFFLE9BQU8sRUFBRSxDQUFDO0lBQ2hDLENBQUM7SUFFRCxVQUFVLENBQUMsV0FBd0IsRUFBRSxJQUFZLEVBQUUsSUFBSSxHQUFHLE1BQU07UUFDL0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRXBFLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDbkMsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3BDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEIsTUFBTSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBRTdDLFFBQVEsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVELE9BQU87UUFDTixNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzdCLFdBQVcsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVwQixJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUM5QixJQUFJLENBQUMscUNBQXFDLEVBQUUsQ0FBQztRQUM3QyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsOEJBQThCLEVBQUUsQ0FBQztRQUN0QyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUM3QixJQUFJLENBQUMsa0NBQWtDLEVBQUUsQ0FBQztRQUMxQyxJQUFJLENBQUMsOEJBQThCLEVBQUUsQ0FBQztJQUN2QyxDQUFDO0lBRU8sc0JBQXNCO1FBQzdCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDckMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXBELElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsU0FBUyxDQUFDO2FBQ2xCLE9BQU8sQ0FBQywrQkFBK0IsQ0FBQzthQUN4QyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUM7YUFDOUMsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO1lBQzdDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBR04sTUFBTSxlQUFlLEdBQUcsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQzlDLE9BQU8sQ0FBQyxVQUFVLENBQUM7YUFDbkIsT0FBTyxDQUFDLG9MQUFvTCxDQUFDO2FBQzdMLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBR2pDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUczQyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDdEIsT0FBTyxDQUFDLG1DQUFtQyxDQUFDO2FBQzVDLE9BQU8sQ0FBQywwSEFBMEgsQ0FBQzthQUNuSSxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQzthQUNuRCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG9CQUFvQixHQUFHLEtBQUssQ0FBQztZQUVsRCxlQUFlLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkQsSUFBSSxJQUFJLENBQUMsaUJBQWlCLElBQUksU0FBUztnQkFDdEMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUV0RCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUdOLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1FBQ25ELG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsR0FBRyxDQUFDLEVBQUU7WUFDdkMsR0FBRyxDQUFDLFNBQVMsR0FBRzs2SkFDMEksQ0FBQztRQUM1SixDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sZUFBZSxHQUFHLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUM3QyxPQUFPLENBQUMsa0NBQWtDLENBQUM7YUFDM0MsT0FBTyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFFOUIsSUFBSSxPQUFxQyxDQUFDLENBQUMsd0NBQXdDO1FBRW5GLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRTtZQUNwQyxTQUFTO2lCQUNKLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxvQkFBb0IsQ0FBQztpQkFDckQsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDO2lCQUNuRCxRQUFRLENBQ0wsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtnQkFDckIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO2dCQUNsRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pDLENBQUMsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQ2hCLENBQUM7WUFFTiw2QkFBNkI7WUFDN0IsT0FBTyxHQUFHLFNBQVMsQ0FBQyxPQUEyQixDQUFDO1lBQ2hELE9BQU8sQ0FBQyxRQUFRLENBQUMsK0JBQStCLENBQUMsQ0FBQztRQUN0RCxDQUFDLENBQUMsQ0FBQztRQUVILDBEQUEwRDtRQUMxRCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ1YsSUFBSSxDQUFDLGlCQUFpQixHQUFHLGVBQWUsQ0FBQyxTQUFTLENBQUM7WUFDbkQsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN2QyxDQUFDO2FBQU0sQ0FBQztZQUNKLE9BQU8sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBR0gsdUZBQXVGO1FBQ3ZGLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUM7UUFDdkUsZUFBZSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFDdEUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBR3BFLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsbUNBQW1DLENBQUM7YUFDNUMsT0FBTyxDQUFDLGdEQUFnRCxDQUFDO2FBQ3pELFdBQVcsQ0FBQyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsUUFBUTthQUNqQyxTQUFTLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQzthQUN2QixTQUFTLENBQUMsR0FBRyxFQUFFLE9BQU8sQ0FBQzthQUN2QixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDO2FBQzlDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLEtBQ25DLENBQUM7WUFDTCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQ0YsQ0FBQztJQUNKLENBQUM7SUFFTyxzQkFBc0I7UUFDN0IsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUNyQyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxTQUFTLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUUzRCxNQUFNLFFBQVEsR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7UUFDeEMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLG1HQUFtRyxDQUFDLENBQUMsQ0FBQztRQUNoSixRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUc7O0dBRTdDLENBQUMsQ0FBQztRQUNILFFBQVEsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDLENBQUM7UUFDekYsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QixRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsOEhBQThILENBQUMsQ0FBQyxDQUFDO1FBRTNLLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsU0FBUyxDQUFDO2FBQ2xCLE9BQU8sQ0FBQyxRQUFRLENBQUM7YUFDakIsU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTTthQUN6QixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDO2FBQzdDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxHQUFHLEtBQUssQ0FBQztZQUM1QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQ0YsQ0FBQztRQUVILE1BQU0sU0FBUyxHQUFHLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUN6QyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsK0pBQStKLENBQUMsQ0FBQyxDQUFDO1FBQzdNLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDekIsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLHdJQUF3SSxDQUFDLENBQUMsQ0FBQztRQUN0TCxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3pCLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDLENBQUM7UUFFdkUsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3RCLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQzthQUM1QixPQUFPLENBQUMsU0FBUyxDQUFDO2FBQ2xCLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDbkIsY0FBYyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO2FBQzdELFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsQ0FBQzthQUMzRCxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDakIsZ0RBQWdEO1lBQ2hELE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDL0IsSUFBSSxFQUFFLEVBQUUsQ0FBQztnQkFDUixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzFELElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDNUIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUNGLENBQUM7SUFFSixDQUFDO0lBRU8scUNBQXFDO1FBQzVDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDckMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsOEJBQThCLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFDMUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLFdBQVcsRUFBQyx1QkFBdUIsRUFBQyx3Q0FBd0MsRUFBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFBO1FBQ25KLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxXQUFXLEVBQUMsMkNBQTJDLEVBQUMsMkVBQTJFLEVBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsOEJBQThCLENBQUMsQ0FBQTtJQUNqTixDQUFDO0lBRU8sMkJBQTJCO1FBQ2xDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDckMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsb0JBQW9CLEVBQUUsYUFBYSxDQUFDLENBQUM7UUFFbEUsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDekQsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsRCxXQUFXLENBQUMsT0FBTyxDQUFDLDRFQUE0RSxDQUFDLENBQUM7UUFDbEcsTUFBTSxXQUFXLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNqRCxNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2xELFdBQVcsQ0FBQyxPQUFPLENBQUMsb0hBQW9ILENBQUMsQ0FBQztRQUMxSSxjQUFjLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFN0QsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3RCLE9BQU8sQ0FBQyxTQUFTLENBQUM7YUFDbEIsT0FBTyxDQUFDLGNBQWMsQ0FBQzthQUN2QixTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQzthQUNqRCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztZQUVoRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVOLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsVUFBVSxDQUFDO2FBQ25CLE9BQU8sQ0FBQyxxRUFBcUUsQ0FBQzthQUM5RSxXQUFXLENBQUMsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLFFBQVE7YUFDakMsU0FBUyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7YUFDM0IsU0FBUyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7YUFDM0IsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQzthQUM3RSxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDBCQUEwQixHQUFHLENBQUMsS0FBSyxLQUFLLE9BQU8sQ0FBQyxDQUFDO1lBQ3RFLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FDRixDQUFDO0lBQ0osQ0FBQztJQUVPLDJCQUEyQjtRQUNsQyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLGVBQWUsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRW5FLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsU0FBUyxDQUFDO2FBQ2xCLE9BQU8sQ0FBQyxtQ0FBbUMsQ0FBQzthQUM1QyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQzthQUNsRCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztZQUNqRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVOLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsaUJBQWlCLENBQUM7YUFDMUIsT0FBTyxDQUFDLDhFQUE4RSxDQUFDO2FBQ3ZGLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDbkIsY0FBYyxDQUFDLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDO2FBQ25ELFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQzthQUNqRCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixHQUFHLEtBQUssQ0FBQztZQUVoRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUdOLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsdUJBQXVCLENBQUM7YUFDaEMsT0FBTyxDQUFDLHFMQUFxTCxDQUFDO2FBQzlMLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDdkIsY0FBYyxDQUFDLG1CQUFtQixDQUFDO2FBQ25DLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsQ0FBQzthQUN2RCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHdCQUF3QixHQUFHLEtBQUssQ0FBQztZQUN0RCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUdOLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMscUJBQXFCLENBQUM7YUFDOUIsT0FBTyxDQUFDLDhNQUE4TSxDQUFDO2FBQ3ZOLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDbkIsY0FBYyxDQUFDLGdCQUFnQixDQUFDLHlCQUF5QixDQUFDO2FBQzFELFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsQ0FBQzthQUN4RCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHlCQUF5QixHQUFHLEtBQUssQ0FBQztZQUV2RCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTyw4QkFBOEI7UUFDckMsTUFBTSxXQUFXLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQztRQUNyQyxJQUFJLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBRXJFLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsU0FBUyxDQUFDO2FBQ2xCLE9BQU8sQ0FBQyx1Q0FBdUMsQ0FBQzthQUNoRCxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsQ0FBQzthQUNyRCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixHQUFHLEtBQUssQ0FBQztZQUNwRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVOLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsY0FBYyxDQUFDO2FBQ3ZCLE9BQU8sQ0FBQyxrRkFBa0YsQ0FBQzthQUMzRixPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2FBQ25CLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyx1QkFBdUIsQ0FBQzthQUN4RCxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUM7YUFDdEQsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsR0FBRyxLQUFLLENBQUM7WUFFckQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFUCxDQUFDO0lBRU8scUJBQXFCO1FBQzVCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDckMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRWpELElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsU0FBUyxDQUFDO2FBQ2xCLE9BQU8sQ0FBQyw0QkFBNEIsQ0FBQzthQUNyQyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUM7YUFDNUMsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLEdBQUcsS0FBSyxDQUFDO1lBQzNDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVPLGtDQUFrQztRQUN6QyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLHVCQUF1QixFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRXJFLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsU0FBUyxDQUFDO2FBQ2xCLE9BQU8sQ0FBQywyRUFBMkUsQ0FBQzthQUNwRixTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQzthQUNsRCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLG1CQUFtQixHQUFHLEtBQUssQ0FBQztZQUNqRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUdOLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsVUFBVSxDQUFDO2FBQ25CLE9BQU8sQ0FBQyxtRkFBbUYsQ0FBQzthQUM1RixPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2FBQ25CLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQywyQkFBMkIsQ0FBQzthQUM1RCxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsMkJBQTJCLENBQUM7YUFDMUQsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsR0FBRyxLQUFLLENBQUM7WUFFekQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRU8sOEJBQThCO1FBQ3JDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDckMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztRQUUxRCxNQUFNLHVCQUF1QixHQUFHLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0RCxPQUFPLENBQUMsbUJBQW1CLENBQUM7YUFDNUIsT0FBTyxDQUFDLCtFQUErRSxDQUFDO2FBQ3hGLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUk7YUFDdkIsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDO2FBQy9DLFFBQVEsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO1lBQzlDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQyxDQUFDLENBQUM7YUFDRCxjQUFjLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQzthQUNuRCxRQUFRLENBQUMsdUNBQXVDLENBQUMsQ0FBQztRQUVwRCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDdEIsT0FBTyxDQUFDLDRDQUE0QyxDQUFDO2FBQ3JELE9BQU8sQ0FBQyxtSUFBbUksQ0FBQzthQUM1SSxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQzthQUMzRCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDRCQUE0QixHQUFHLEtBQUssQ0FBQztZQUUxRCx1QkFBdUIsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMvRCxJQUFJLElBQUksQ0FBQyx5QkFBeUIsSUFBSSxTQUFTO2dCQUM5QyxJQUFJLENBQUMseUJBQXlCLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBRTlELE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRU4sTUFBTSwyQkFBMkIsR0FBRyxJQUFJLGdCQUFnQixFQUFFLENBQUM7UUFDM0QsMkJBQTJCLENBQUMsU0FBUyxDQUFDLEVBQUUsRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQ2pELEdBQUcsQ0FBQyxTQUFTLEdBQUc7c0tBQ21KLENBQUM7UUFDckssQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLHVCQUF1QixHQUFHLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNyRCxPQUFPLENBQUMsMkNBQTJDLENBQUM7YUFDcEQsT0FBTyxDQUFDLDJCQUEyQixDQUFDLENBQUM7UUFHdEMsSUFBSSxnQkFBOEMsQ0FBQyxDQUFDLG1DQUFtQztRQUV2Rix1QkFBdUIsQ0FBQyxTQUFTLENBQUMsQ0FBQyxTQUFTLEVBQUUsRUFBRTtZQUM1QyxTQUFTO2lCQUNKLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyw0QkFBNEIsQ0FBQztpQkFDN0QsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLDRCQUE0QixDQUFDO2lCQUMzRCxRQUFRLENBQ0wsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtnQkFDckIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEdBQUcsS0FBSyxDQUFDO2dCQUMxRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3pDLENBQUMsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQ2hCLENBQUM7WUFFTixnREFBZ0Q7WUFDaEQsZ0JBQWdCLEdBQUcsU0FBUyxDQUFDLE9BQTJCLENBQUM7WUFDekQsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDL0QsQ0FBQyxDQUFDLENBQUM7UUFFSCxzRUFBc0U7UUFDdEUsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO1lBQ25CLElBQUksQ0FBQyx5QkFBeUIsR0FBRyx1QkFBdUIsQ0FBQyxTQUFTLENBQUM7WUFDbkUsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2hELENBQUM7YUFBTSxDQUFDO1lBQ0osT0FBTyxDQUFDLEtBQUssQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFHSCx1RkFBdUY7UUFDdkYsTUFBTSw0QkFBNEIsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyw0QkFBNEIsQ0FBQztRQUN2Rix1QkFBdUIsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3RGLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUVwRixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDdEIsT0FBTyxDQUFDLGlCQUFpQixDQUFDO2FBQzFCLE9BQU8sQ0FBQyx5RkFBeUYsQ0FBQzthQUNsRyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2FBQ25CLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUM7YUFDL0MsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQzthQUM3QyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7WUFFNUMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFTixJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDdEIsT0FBTyxDQUFDLHdEQUF3RCxDQUFDO2FBQ2pFLE9BQU8sQ0FBQyxrR0FBa0csQ0FBQzthQUMzRyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsQ0FBQzthQUN0RCxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHVCQUF1QixHQUFHLEtBQUssQ0FBQztZQUNyRCxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVOLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN2QixPQUFPLENBQUMsNERBQTRELENBQUM7YUFDckUsT0FBTyxDQUFDLHFHQUFxRyxDQUFDO2FBQzlHLFNBQVMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTTthQUMzQixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO2FBQzFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDekIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUN6QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVMLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUN0QixPQUFPLENBQUMsMkNBQTJDLENBQUM7YUFDcEQsT0FBTyxDQUFDLGdFQUFnRSxDQUFDO2FBQ3pFLFNBQVMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTTthQUMzQixRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsMkJBQTJCLENBQUM7YUFDMUQsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsR0FBRyxLQUFLLENBQUM7WUFDekQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUNGLENBQUM7UUFFSCxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDdEIsT0FBTyxDQUFDLDBDQUEwQyxDQUFDO2FBQ25ELE9BQU8sQ0FBQywwR0FBMEcsQ0FBQzthQUNuSCxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJO2FBQ25CLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQzthQUNuRCxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUM7YUFDakQsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUN6QixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsR0FBRyxLQUFLLENBQUM7WUFFaEQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRVEsb0JBQW9CO1FBQzFCLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUM7UUFDckMsV0FBVyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ3BCLFdBQVcsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLHNCQUFzQixFQUFFLENBQUMsQ0FBQztRQUU3RCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsV0FBVyxFQUFDLGlDQUFpQyxFQUFDLGlHQUFpRyxFQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLENBQUE7UUFHcE4sSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3RCLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQzthQUM1QixPQUFPLENBQUMsOE1BQThNLENBQUM7YUFDdk4sU0FBUyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTTthQUN6QixPQUFPLENBQUMsT0FBTyxDQUFDO2FBQ2hCLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQzthQUMvQixPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDbkIsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO2dCQUN6QixJQUFJLEdBQUcsRUFBRSxDQUFDO29CQUNULE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ2pCLElBQUksTUFBTSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDdkIsQ0FBQztxQkFDSSxDQUFDO29CQUNMLElBQUksTUFBTSxDQUFDLDRDQUE0QyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUNoRSxDQUFDO1lBRUYsQ0FBQyxDQUFDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBRSx3QkFBd0IsQ0FBQzthQUNsQyxPQUFPLENBQUMsNkNBQTZDLENBQUM7YUFDdEQsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQ3RCLFFBQVEsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFDLGdCQUFnQixDQUFDLENBQUM7WUFDNUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUM5QyxRQUFRLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQ2hELFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUMvQixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7Z0JBQzdDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNyQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBR0wsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQyxDQUFDO1FBRTFELElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLGtCQUFrQixFQUFFLDJCQUEyQixFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQ2pHLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLDJCQUEyQixFQUFFLHlDQUF5QyxFQUFFLG1CQUFtQixDQUFDLENBQUM7UUFDL0gsSUFBSSxDQUFDLGVBQWUsQ0FBQyxXQUFXLEVBQUUsMEJBQTBCLEVBQUUsd0NBQXdDLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUM1SCxJQUFJLENBQUMsZUFBZSxDQUFDLFdBQVcsRUFBRSw0QkFBNEIsRUFBRSw4Q0FBOEMsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBRXZJLElBQUksQ0FBQyxjQUFjLENBQUMsV0FBVyxFQUFFLFdBQVcsRUFBRSxpQ0FBaUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM3RixJQUFJLENBQUMsY0FBYyxDQUFDLFdBQVcsRUFBRSxhQUFhLEVBQUUsK0JBQStCLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFDL0YsSUFBSSxDQUFDLGNBQWMsQ0FBQyxXQUFXLEVBQUUsV0FBVyxFQUFFLDRCQUE0QixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBRXhGLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FDbEIsTUFBTTthQUNILGFBQWEsQ0FBQyxxQkFBcUIsQ0FBQzthQUNwQyxVQUFVLENBQUMsNENBQTRDLENBQUM7YUFDeEQsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ2xCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsR0FBRyxFQUFFLENBQUM7WUFDMUMsSUFBSSxNQUFNLENBQUMsb0JBQW9CLENBQUMsQ0FBQTtRQUNqQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRVYsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3ZCLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUNsQixNQUFNO2FBQ0gsYUFBYSxDQUFDLGtCQUFrQixDQUFDO2FBQ2pDLFVBQVUsQ0FBQyw0Q0FBNEMsQ0FBQzthQUN4RCxPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDbEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEdBQUcsRUFBRSxHQUFHLGdCQUFnQixFQUFFLENBQUM7WUFDL0MsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNwQixJQUFJLE1BQU0sQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO1lBQ25ELElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRVYsQ0FBQztJQUNPLGVBQWUsQ0FBQyxXQUF3QixFQUFFLElBQVksRUFBRSxXQUFtQixFQUFFLFVBQWU7UUFDbEcsSUFBSSxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3JCLE9BQU8sQ0FBQyxJQUFJLENBQUM7YUFDYixPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3BCLGNBQWMsQ0FBQyxXQUFXLENBQUMsRUFBRTtZQUM1QixXQUFXLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2pDLFdBQVcsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUNuQyxVQUFVLEdBQUcsS0FBSyxDQUFDO2dCQUNuQixNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7Z0JBQ2pDLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN0QixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUNPLGdCQUFnQixDQUFDLFdBQXdCLEVBQUUsSUFBWSxFQUFFLFdBQW1CLEVBQUUsVUFBZTtRQUNuRyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDckIsT0FBTyxDQUFDLElBQUksQ0FBQzthQUNiLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDcEIsU0FBUyxDQUFDLENBQUMsTUFBWSxFQUFFLEVBQUU7WUFDMUIsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQTtZQUMzQixNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFhLEVBQUUsRUFBRTtnQkFDdEMsVUFBVSxHQUFFLEtBQUssQ0FBQztnQkFDbEIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDdEIsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDTyxjQUFjLENBQUMsV0FBd0IsRUFBRSxJQUFZLEVBQUUsV0FBbUIsRUFBRSxVQUFlO1FBQ2pHLElBQUksT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNyQixPQUFPLENBQUMsSUFBSSxDQUFDO2FBQ2IsT0FBTyxDQUFDLFdBQVcsQ0FBQzthQUNwQixPQUFPLENBQUMsQ0FBQyxJQUFTLEVBQUUsRUFBRTtZQUNyQixJQUFJLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNyRCxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxLQUFhLEVBQUUsRUFBRTtnQkFDcEMsVUFBVSxHQUFFLEtBQUssQ0FBQztnQkFDbEIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO2dCQUNqQyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDdEIsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFDRCxZQUFZO1FBQ1YsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLGVBQWUsQ0FBQztRQUN0QyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM1RSxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyx1QkFBdUIsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3hGLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLHNCQUFzQixFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDdEYsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsZ0NBQWdDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQztRQUNuRyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDckUsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3pFLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN6RSxDQUFDO0lBQ0Esb0JBQW9CLENBQUMsZUFBd0I7UUFDNUMsTUFBTSxnQkFBZ0IsR0FBRyxlQUFlLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3hGLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLGlCQUFpQixDQUFDLENBQUM7UUFDOUUsTUFBTSxRQUFRLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBRXRFLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxvQkFBb0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3RCxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDO2FBQ3BDLGVBQWUsQ0FBQyxRQUFRLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUVqRSxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLCtCQUErQixDQUFDLENBQUM7UUFDekUsWUFBWSxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ2xELFlBQVksQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQztRQUdqQyxTQUFTLHVCQUF1QixDQUFDLE9BQWdCO1lBQ2hELGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDM0QsaUJBQWlCLENBQUMsZUFBZSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDN0UsaUJBQWlCLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDMUUsWUFBWSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUMvRSxDQUFDO1FBR0QsTUFBTSxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBRTlCLE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFhLEVBQUUsRUFBRTtZQUNuRSxJQUFJLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztnQkFDbEIsTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3hDLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQztnQkFFbkIsSUFBSSxnQkFBZ0IsQ0FBQztnQkFDckIsSUFBSSxDQUFDO29CQUNKLGdCQUFnQixHQUFHLE1BQU0scUJBQXFCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQTtvQkFDckYsTUFBTSxhQUFhLENBQUMsUUFBUSxFQUFFLGdCQUFnQixDQUFDLENBQUM7Z0JBQ2pELENBQUM7Z0JBQ0QsT0FBTyxDQUFDLEVBQUUsQ0FBQztvQkFDVixPQUFPLEdBQUcsS0FBSyxDQUFDO2dCQUNqQixDQUFDO2dCQUVELHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUVqQyxJQUFJLENBQUMsT0FBTztvQkFBRSxPQUFPO2dCQUVyQixJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO2dCQUN6QyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDbEMsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV4QixJQUFJLENBQUMsY0FBYyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDaEYsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7UUFHdEQsTUFBTSxVQUFVLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzlDLEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDO2FBQ3JCLFVBQVUsQ0FBQywyQkFBMkIsQ0FBQzthQUN2QyxPQUFPLENBQUMsS0FBSyxJQUFJLEVBQUU7WUFDbkIsSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFDcEMsc0VBQXNFLEVBQ3RFLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTTtpQkFDZCxhQUFhLENBQUMsMkJBQTJCLENBQUM7aUJBQzFDLFVBQVUsRUFBRSxFQUNkLEtBQUssSUFBSSxFQUFFO2dCQUNWLElBQUksQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsVUFBVSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDcEcsdUJBQXVCLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRTlCLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsR0FBRyxnQkFBZ0IsQ0FBQztnQkFFakQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xDLENBQUMsQ0FDRCxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1YsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLE1BQU0sR0FBRyxJQUFJLGVBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMvQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQzthQUNyQixVQUFVLENBQUMscUJBQXFCLENBQUM7YUFDakMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ25CLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQ3BDLHNFQUFzRSxFQUN0RSxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU07aUJBQ2QsYUFBYSxDQUFDLHFCQUFxQixDQUFDO2lCQUNwQyxVQUFVLEVBQUUsRUFDZCxLQUFLLElBQUksRUFBRTtnQkFDVixNQUFNLEtBQUssR0FBRzs7RUFFbEIsQ0FBQztnQkFDRyxJQUFJLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN6Rix1QkFBdUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFFOUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxHQUFHLEtBQUssQ0FBQztnQkFDdEMsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ2xDLENBQUMsQ0FDRCxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1YsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGlCQUFrQixTQUFRLEtBQUs7SUFFcEMsWUFBWSxHQUFRLEVBQUUsSUFBWSxFQUFFLGNBQWlELEVBQUUsYUFBa0M7UUFDeEgsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRVgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLENBQUMsQ0FBQztRQUMxRCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUc3QyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDO2FBQ3pCLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNuQixjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdkIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksRUFBRTtnQkFDekIsTUFBTSxhQUFhLEVBQUUsQ0FBQztnQkFDdEIsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUM7YUFDRCxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLGFBQWEsQ0FBQyxRQUFRLENBQUM7YUFDdkIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakMsQ0FBQztDQUNEO0FBRUQsU0FBUyxjQUFjLENBQUMsT0FBZSxFQUFFLFVBQXVCO0lBQy9ELE1BQU0sSUFBSSxHQUFHLElBQUksVUFBVSxDQUFDO1FBQzNCLEtBQUssRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQztLQUN2RCxDQUFDLENBQUM7SUFFSCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFZGl0b3JTdGF0ZSwgRXh0ZW5zaW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdVcGRhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBBcHAsIEJ1dHRvbkNvbXBvbmVudCxOb3RpY2UsIEV4dHJhQnV0dG9uQ29tcG9uZW50LCBNb2RhbCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZywgZGVib3VuY2UsIHNldEljb24gfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IHsgcGFyc2VTbmlwcGV0VmFyaWFibGVzLCBwYXJzZVNuaXBwZXRzIH0gZnJvbSBcInNyYy9zbmlwcGV0cy9wYXJzZVwiO1xyXG5pbXBvcnQgeyBERUZBVUxUX1NOSVBQRVRTIH0gZnJvbSBcInNyYy91dGlscy9kZWZhdWx0X3NuaXBwZXRzXCI7XHJcbmltcG9ydCBMYXRleFN1aXRlUGx1Z2luIGZyb20gXCIuLi9tYWluXCI7XHJcbmltcG9ydCB7IERFRkFVTFRfU0VUVElOR1MgfSBmcm9tIFwiLi9zZXR0aW5nc1wiO1xyXG5pbXBvcnQgeyBGaWxlU3VnZ2VzdCB9IGZyb20gXCIuL3VpL2ZpbGVfc3VnZ2VzdFwiO1xyXG5pbXBvcnQgeyBiYXNpY1NldHVwIH0gZnJvbSBcIi4vdWkvc25pcHBldHNfZWRpdG9yL2V4dGVuc2lvbnNcIjtcclxuaW1wb3J0ICogYXMgbG9jYWxGb3JhZ2UgZnJvbSBcImxvY2FsZm9yYWdlXCI7XHJcblxyXG5leHBvcnQgY2xhc3MgTGF0ZXhTdWl0ZVNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcclxuXHRwbHVnaW46IExhdGV4U3VpdGVQbHVnaW47XHJcblx0c25pcHBldHNFZGl0b3I6IEVkaXRvclZpZXc7XHJcblx0c25pcHBldHNGaWxlTG9jRWw6IEhUTUxFbGVtZW50O1xyXG5cdHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWw6IEhUTUxFbGVtZW50O1xyXG5cclxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBMYXRleFN1aXRlUGx1Z2luKSB7XHJcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XHJcblx0XHR0aGlzLnBsdWdpbiA9IHBsdWdpbjtcclxuICAgIHRyeSB7XHJcbiAgICAgIGxvY2FsRm9yYWdlLmNvbmZpZyh7IG5hbWU6IFwiVGlrekpheFwiLCBzdG9yZU5hbWU6IFwic3ZnSW1hZ2VzXCIgfSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zb2xlLmxvZyhlcnJvcik7XHJcbiAgICB9XHJcblx0fVxyXG5cclxuXHRoaWRlKCkge1xyXG5cdFx0dGhpcy5zbmlwcGV0c0VkaXRvcj8uZGVzdHJveSgpO1xyXG5cdH1cclxuXHJcblx0YWRkSGVhZGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgaWNvbiA9IFwibWF0aFwiKSB7XHJcblx0XHRjb25zdCBoZWFkaW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUobmFtZSkuc2V0SGVhZGluZygpO1xyXG5cclxuXHRcdGNvbnN0IHBhcmVudEVsID0gaGVhZGluZy5zZXR0aW5nRWw7XHJcblx0XHRjb25zdCBpY29uRWwgPSBwYXJlbnRFbC5jcmVhdGVEaXYoKTtcclxuXHRcdHNldEljb24oaWNvbkVsLCBpY29uKTtcclxuXHRcdGljb25FbC5hZGRDbGFzcyhcImxhdGV4LXN1aXRlLXNldHRpbmdzLWljb25cIik7XHJcblxyXG5cdFx0cGFyZW50RWwucHJlcGVuZChpY29uRWwpO1xyXG5cdH1cclxuXHJcblx0ZGlzcGxheSgpOiB2b2lkIHtcclxuXHRcdGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcblx0XHRjb250YWluZXJFbC5lbXB0eSgpO1xyXG5cclxuXHRcdHRoaXMuZGlzcGxheVNuaXBwZXRTZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5kaXNwbGF5Q29uY2VhbFNldHRpbmdzKCk7XHJcblx0XHR0aGlzLmRpc3BsYXlDb2xvckhpZ2hsaWdodEJyYWNrZXRzU2V0dGluZ3MoKTtcclxuXHRcdHRoaXMuZGlzcGxheVBvcHVwUHJldmlld1NldHRpbmdzKCk7XHJcblx0XHR0aGlzLmRpc3BsYXlBdXRvZnJhY3Rpb25TZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5kaXNwbGF5TWF0cml4U2hvcnRjdXRzU2V0dGluZ3MoKTtcclxuXHRcdHRoaXMuZGlzcGxheVRhYm91dFNldHRpbmdzKCk7XHJcblx0XHR0aGlzLmRpc3BsYXlBdXRvRW5sYXJnZUJyYWNrZXRzU2V0dGluZ3MoKTtcclxuXHRcdHRoaXMuZGlzcGxheUFkdmFuY2VkU25pcHBldFNldHRpbmdzKCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlTbmlwcGV0U2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiU25pcHBldHNcIiwgXCJiYWxscGVuXCIpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHNuaXBwZXRzIGFyZSBlbmFibGVkLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNFbmFibGVkKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzRW5hYmxlZCA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cclxuXHJcblx0XHRjb25zdCBzbmlwcGV0c1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJTbmlwcGV0c1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkVudGVyIHNuaXBwZXRzIGhlcmUuICBSZW1lbWJlciB0byBhZGQgYSBjb21tYSBhZnRlciBlYWNoIHNuaXBwZXQsIGFuZCBlc2NhcGUgYWxsIGJhY2tzbGFzaGVzIHdpdGggYW4gZXh0cmEgXFxcXC4gTGluZXMgc3RhcnRpbmcgd2l0aCBcXFwiLy9cXFwiIHdpbGwgYmUgdHJlYXRlZCBhcyBjb21tZW50cyBhbmQgaWdub3JlZC5cIilcclxuXHRcdFx0LnNldENsYXNzKFwic25pcHBldHMtdGV4dC1hcmVhXCIpO1xyXG5cclxuXHJcblx0XHR0aGlzLmNyZWF0ZVNuaXBwZXRzRWRpdG9yKHNuaXBwZXRzU2V0dGluZyk7XHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkxvYWQgc25pcHBldHMgZnJvbSBmaWxlIG9yIGZvbGRlclwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gbG9hZCBzbmlwcGV0cyBmcm9tIGEgc3BlY2lmaWVkIGZpbGUsIG9yIGZyb20gYWxsIGZpbGVzIHdpdGhpbiBhIGZvbGRlciAoaW5zdGVhZCBvZiBmcm9tIHRoZSBwbHVnaW4gc2V0dGluZ3MpLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRzbmlwcGV0c1NldHRpbmcuc2V0dGluZ0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsIHZhbHVlKTtcclxuXHRcdFx0XHRcdGlmICh0aGlzLnNuaXBwZXRzRmlsZUxvY0VsICE9IHVuZGVmaW5lZClcclxuXHRcdFx0XHRcdFx0dGhpcy5zbmlwcGV0c0ZpbGVMb2NFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCAhdmFsdWUpO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldHNGaWxlTG9jRGVzYyA9IG5ldyBEb2N1bWVudEZyYWdtZW50KCk7XHJcblx0XHRzbmlwcGV0c0ZpbGVMb2NEZXNjLmNyZWF0ZURpdih7fSwgZGl2ID0+IHtcclxuXHRcdFx0ZGl2LmlubmVySFRNTCA9IGBcclxuXHRcdFx0VGhlIGZpbGUgb3IgZm9sZGVyIHRvIGxvYWQgc25pcHBldHMgZnJvbS4gVGhlIGZpbGUgb3IgZm9sZGVyIG11c3QgYmUgd2l0aGluIHlvdXIgdmF1bHQsIGFuZCBub3Qgd2l0aGluIGEgaGlkZGVuIGZvbGRlciAoc3VjaCBhcyA8Y29kZT4ub2JzaWRpYW4vPC9jb2RlPikuYDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdGNvbnN0IHNuaXBwZXRzRmlsZUxvYyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgLnNldE5hbWUoXCJTbmlwcGV0cyBmaWxlIG9yIGZvbGRlciBsb2NhdGlvblwiKVxyXG4gICAgLnNldERlc2Moc25pcHBldHNGaWxlTG9jRGVzYyk7XHJcblxyXG4gICAgbGV0IGlucHV0RWw6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQ7IC8vIERlZmluZSB3aXRoIGEgcG9zc2libGUgdW5kZWZpbmVkIHR5cGVcclxuXHJcbiAgICBzbmlwcGV0c0ZpbGVMb2MuYWRkU2VhcmNoKChjb21wb25lbnQpID0+IHtcclxuICAgICAgICBjb21wb25lbnRcclxuICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Muc25pcHBldHNGaWxlTG9jYXRpb24pXHJcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0ZpbGVMb2NhdGlvbilcclxuICAgICAgICAgICAgLm9uQ2hhbmdlKFxyXG4gICAgICAgICAgICAgICAgZGVib3VuY2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNGaWxlTG9jYXRpb24gPSB2YWx1ZTtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3ModHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICB9LCA1MDAsIHRydWUpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICBcclxuICAgICAgICAvLyBFbnN1cmUgaW5wdXRFbCBpcyBhc3NpZ25lZFxyXG4gICAgICAgIGlucHV0RWwgPSBjb21wb25lbnQuaW5wdXRFbCBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgIGlucHV0RWwuYWRkQ2xhc3MoXCJsYXRleC1zdWl0ZS1sb2NhdGlvbi1pbnB1dC1lbFwiKTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBFbnN1cmUgaW5wdXRFbCBpcyBkZWZpbmVkIGJlZm9yZSBwYXNzaW5nIHRvIEZpbGVTdWdnZXN0XHJcbiAgICBpZiAoaW5wdXRFbCkge1xyXG4gICAgICAgIHRoaXMuc25pcHBldHNGaWxlTG9jRWwgPSBzbmlwcGV0c0ZpbGVMb2Muc2V0dGluZ0VsO1xyXG4gICAgICAgIG5ldyBGaWxlU3VnZ2VzdCh0aGlzLmFwcCwgaW5wdXRFbCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJJbnB1dCBlbGVtZW50IGlzIHVuZGVmaW5lZC5cIik7XHJcbiAgICB9XHJcblxyXG5cclxuXHRcdC8vIEhpZGUgc2V0dGluZ3MgdGhhdCBhcmUgbm90IHJlbGV2YW50IHdoZW4gXCJsb2FkU25pcHBldHNGcm9tRmlsZVwiIGlzIHNldCB0byB0cnVlL2ZhbHNlXHJcblx0XHRjb25zdCBsb2FkU25pcHBldHNGcm9tRmlsZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlO1xyXG5cdFx0c25pcHBldHNTZXR0aW5nLnNldHRpbmdFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCBsb2FkU25pcHBldHNGcm9tRmlsZSk7XHJcblx0XHR0aGlzLnNuaXBwZXRzRmlsZUxvY0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsICFsb2FkU25pcHBldHNGcm9tRmlsZSk7XHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIktleSB0cmlnZ2VyIGZvciBub24tYXV0byBzbmlwcGV0c1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoYXQga2V5IHRvIHByZXNzIHRvIGV4cGFuZCBub24tYXV0byBzbmlwcGV0cy5cIilcclxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bikgPT4gZHJvcGRvd25cclxuXHRcdFx0XHQuYWRkT3B0aW9uKFwiVGFiXCIsIFwiVGFiXCIpXHJcblx0XHRcdFx0LmFkZE9wdGlvbihcIiBcIiwgXCJTcGFjZVwiKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c1RyaWdnZXIpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNUcmlnZ2VyID0gdmFsdWUgYXMgXCJUYWJcIiB8XHJcblx0XHRcdFx0XHRcdFwiIFwiO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSlcclxuXHRcdFx0KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGlzcGxheUNvbmNlYWxTZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJDb25jZWFsXCIsIFwibWF0aC1pbnRlZ3JhbC14XCIpO1xyXG5cclxuXHRcdGNvbnN0IGZyYWdtZW50ID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcclxuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiTWFrZSBlcXVhdGlvbnMgbW9yZSByZWFkYWJsZSBieSBoaWRpbmcgTGFUZVggc3ludGF4IGFuZCBpbnN0ZWFkIGRpc3BsYXlpbmcgaXQgaW4gYSBwcmV0dHkgZm9ybWF0LlwiKSk7XHJcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuaW5uZXJIVE1MID0gYFxyXG5cdFx0XHRlLmcuIDxjb2RlPlxcXFxkb3R7eH1eezJ9ICsgXFxcXGRvdHt5fV57Mn08L2NvZGU+IHdpbGwgZGlzcGxheSBhcyDhuovCsiArIOG6j8KyLCBhbmQgPGNvZGU+XFxcXHNxcnR7IDEtXFxcXGJldGFeezJ9IH08L2NvZGU+IHdpbGwgZGlzcGxheSBhcyDiiJp7IDEtzrLCsiB9LlxyXG5cdFx0YCk7XHJcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIkxhVGVYIGJlbmVhdGggdGhlIGN1cnNvciB3aWxsIGJlIHJldmVhbGVkLlwiKSk7XHJcblx0XHRmcmFnbWVudC5jcmVhdGVFbChcImJyXCIpO1xyXG5cdFx0ZnJhZ21lbnQuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJEaXNhYmxlZCBieSBkZWZhdWx0IHRvIG5vdCBjb25mdXNlIG5ldyB1c2Vycy4gSG93ZXZlciwgSSByZWNvbW1lbmQgdHVybmluZyB0aGlzIG9uIG9uY2UgeW91IGFyZSBjb21mb3J0YWJsZSB3aXRoIHRoZSBwbHVnaW4hXCIpKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXHJcblx0XHRcdC5zZXREZXNjKGZyYWdtZW50KVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuY29uY2VhbEVuYWJsZWQpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuY29uY2VhbEVuYWJsZWQgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pXHJcblx0XHRcdCk7XHJcblxyXG5cdFx0Y29uc3QgZnJhZ21lbnQyID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcclxuXHRcdGZyYWdtZW50Mi5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIkhvdyBsb25nIHRvIGRlbGF5IHRoZSByZXZlYWwgb2YgTGFUZVggZm9yLCBpbiBtaWxsaXNlY29uZHMsIHdoZW4gdGhlIGN1cnNvciBtb3ZlcyBvdmVyIExhVGVYLiBEZWZhdWx0cyB0byAwIChMYVRlWCB1bmRlciB0aGUgY3Vyc29yIGlzIHJldmVhbGVkIGltbWVkaWF0ZWx5KS5cIikpO1xyXG5cdFx0ZnJhZ21lbnQyLmNyZWF0ZUVsKFwiYnJcIik7XHJcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJDYW4gYmUgc2V0IHRvIGEgcG9zaXRpdmUgbnVtYmVyLCBlLmcuIDMwMCwgdG8gZGVsYXkgdGhlIHJldmVhbCBvZiBMYVRlWCwgbWFraW5nIGl0IG11Y2ggZWFzaWVyIHRvIG5hdmlnYXRlIGVxdWF0aW9ucyB1c2luZyBhcnJvdyBrZXlzLlwiKSk7XHJcblx0XHRmcmFnbWVudDIuY3JlYXRlRWwoXCJiclwiKTtcclxuXHRcdGZyYWdtZW50Mi5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIk11c3QgYmUgYW4gaW50ZWdlciDiiaUgMC5cIikpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIlJldmVhbCBkZWxheSAobXMpXCIpXHJcblx0XHRcdC5zZXREZXNjKGZyYWdtZW50MilcclxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKFN0cmluZyhERUZBVUxUX1NFVFRJTkdTLmNvbmNlYWxSZXZlYWxUaW1lb3V0KSlcclxuXHRcdFx0XHQuc2V0VmFsdWUoU3RyaW5nKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxSZXZlYWxUaW1lb3V0KSlcclxuXHRcdFx0XHQub25DaGFuZ2UodmFsdWUgPT4ge1xyXG5cdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSB2YWx1ZSBpcyBhIG5vbi1uZWdhdGl2ZSBpbnRlZ2VyXHJcblx0XHRcdFx0XHRjb25zdCBvayA9IC9eXFxkKyQvLnRlc3QodmFsdWUpO1xyXG5cdFx0XHRcdFx0aWYgKG9rKSB7XHJcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxSZXZlYWxUaW1lb3V0ID0gTnVtYmVyKHZhbHVlKTtcclxuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0fSlcclxuXHRcdFx0KTtcclxuXHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlDb2xvckhpZ2hsaWdodEJyYWNrZXRzU2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiSGlnaGxpZ2h0IGFuZCBjb2xvciBicmFja2V0c1wiLCBcInBhcmVudGhlc2VzXCIpO1xyXG4gICAgdGhpcy5hZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsLFwiQ29sb3IgcGFpcmVkIGJyYWNrZXRzXCIsXCJXaGV0aGVyIHRvIGNvbG9yaXplIG1hdGNoaW5nIGJyYWNrZXRzLlwiLHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbG9yUGFpcmVkQnJhY2tldHNFbmFibGVkKVxyXG4gICAgdGhpcy5hZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsLFwiSGlnaGxpZ2h0IG1hdGNoaW5nIGJyYWNrZXQgYmVuZWF0aCBjdXJzb3JcIixcIldoZW4gdGhlIGN1cnNvciBpcyBhZGphY2VudCB0byBhIGJyYWNrZXQsIGhpZ2hsaWdodCB0aGUgbWF0Y2hpbmcgYnJhY2tldC5cIix0aGlzLnBsdWdpbi5zZXR0aW5ncy5oaWdobGlnaHRDdXJzb3JCcmFja2V0c0VuYWJsZWQpXHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlQb3B1cFByZXZpZXdTZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJNYXRoIHBvcHVwIHByZXZpZXdcIiwgXCJzdXBlcnNjcmlwdFwiKTtcclxuXHJcblx0XHRjb25zdCBwb3B1cF9mcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcclxuXHRcdGNvbnN0IHBvcHVwX2xpbmUxID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuXHRcdHBvcHVwX2xpbmUxLnNldFRleHQoXCJXaGVuIGluc2lkZSBhbiBlcXVhdGlvbiwgc2hvdyBhIHBvcHVwIHByZXZpZXcgd2luZG93IG9mIHRoZSByZW5kZXJlZCBtYXRoLlwiKTtcclxuXHRcdGNvbnN0IHBvcHVwX3NwYWNlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJyXCIpO1xyXG5cdFx0Y29uc3QgcG9wdXBfbGluZTIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG5cdFx0cG9wdXBfbGluZTIuc2V0VGV4dChcIlRoZSBwb3B1cCBwcmV2aWV3IHdpbGwgYmUgc2hvd24gZm9yIGFsbCBpbmxpbmUgbWF0aCBlcXVhdGlvbnMsIGFzIHdlbGwgYXMgZm9yIGJsb2NrIG1hdGggZXF1YXRpb25zIGluIFNvdXJjZSBtb2RlLlwiKTtcclxuXHRcdHBvcHVwX2ZyYWdtZW50LmFwcGVuZChwb3B1cF9saW5lMSwgcG9wdXBfc3BhY2UsIHBvcHVwX2xpbmUyKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXHJcblx0XHRcdC5zZXREZXNjKHBvcHVwX2ZyYWdtZW50KVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0aFByZXZpZXdFbmFibGVkKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdGhQcmV2aWV3RW5hYmxlZCA9IHZhbHVlO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJQb3NpdGlvblwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXJlIHRvIGRpc3BsYXkgdGhlIHBvcHVwIHByZXZpZXcgcmVsYXRpdmUgdG8gdGhlIGVxdWF0aW9uIHNvdXJjZS5cIilcclxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bikgPT4gZHJvcGRvd25cclxuXHRcdFx0XHQuYWRkT3B0aW9uKFwiQWJvdmVcIiwgXCJBYm92ZVwiKVxyXG5cdFx0XHRcdC5hZGRPcHRpb24oXCJCZWxvd1wiLCBcIkJlbG93XCIpXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdGhQcmV2aWV3UG9zaXRpb25Jc0Fib3ZlID8gXCJBYm92ZVwiIDogXCJCZWxvd1wiKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdGhQcmV2aWV3UG9zaXRpb25Jc0Fib3ZlID0gKHZhbHVlID09PSBcIkFib3ZlXCIpO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSlcclxuXHRcdFx0KTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGlzcGxheUF1dG9mcmFjdGlvblNldHRpbmdzKCkge1xyXG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkF1dG8tZnJhY3Rpb25cIiwgXCJtYXRoLXgtZGl2aWRlLXktMlwiKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciBhdXRvLWZyYWN0aW9uIGlzIGVuYWJsZWQuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25FbmFibGVkKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkVuYWJsZWQgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJGcmFjdGlvbiBzeW1ib2xcIilcclxuXHRcdFx0LnNldERlc2MoXCJUaGUgZnJhY3Rpb24gc3ltYm9sIHRvIHVzZSBpbiB0aGUgcmVwbGFjZW1lbnQuIGUuZy4gXFxcXGZyYWMsIFxcXFxkZnJhYywgXFxcXHRmcmFjXCIpXHJcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmF1dG9mcmFjdGlvblN5bWJvbClcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uU3ltYm9sKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvblN5bWJvbCA9IHZhbHVlO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRXhjbHVkZWQgZW52aXJvbm1lbnRzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiQSBsaXN0IG9mIGVudmlyb25tZW50cyB0byBleGNsdWRlIGF1dG8tZnJhY3Rpb24gZnJvbSBydW5uaW5nIGluLiBGb3IgZXhhbXBsZSwgdG8gZXhjbHVkZSBhdXRvLWZyYWN0aW9uIGZyb20gcnVubmluZyB3aGlsZSBpbnNpZGUgYW4gZXhwb25lbnQsIHN1Y2ggYXMgZV57Li4ufSwgdXNlICBbXFxcIl57XFxcIiwgXFxcIn1cXFwiXVwiKVxyXG5cdFx0XHQuYWRkVGV4dEFyZWEodGV4dCA9PiB0ZXh0XHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKFwiWyBbXFxcIl57XFxcIiwgXFxcIn1dIF1cIilcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uRXhjbHVkZWRFbnZzKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkV4Y2x1ZGVkRW52cyA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJCcmVha2luZyBjaGFyYWN0ZXJzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiQSBsaXN0IG9mIGNoYXJhY3RlcnMgdGhhdCBkZW5vdGUgdGhlIHN0YXJ0L2VuZCBvZiBhIGZyYWN0aW9uLiBlLmcuIGlmICsgaXMgaW5jbHVkZWQgaW4gdGhlIGxpc3QsIFxcXCJhK2IvY1xcXCIgd2lsbCBleHBhbmQgdG8gXFxcImErXFxcXGZyYWN7Yn17Y31cXFwiLiBJZiArIGlzIG5vdCBpbiB0aGUgbGlzdCwgaXQgd2lsbCBleHBhbmQgdG8gXFxcIlxcXFxmcmFje2ErYn17Y31cXFwiLlwiKVxyXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5hdXRvZnJhY3Rpb25CcmVha2luZ0NoYXJzKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25CcmVha2luZ0NoYXJzKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkJyZWFraW5nQ2hhcnMgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlNYXRyaXhTaG9ydGN1dHNTZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJNYXRyaXggc2hvcnRjdXRzXCIsIFwiYnJhY2tldHMtY29udGFpblwiKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciBtYXRyaXggc2hvcnRjdXRzIGFyZSBlbmFibGVkLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZClcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbmFibGVkID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW52aXJvbm1lbnRzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiQSBsaXN0IG9mIGVudmlyb25tZW50IG5hbWVzIHRvIHJ1biB0aGUgbWF0cml4IHNob3J0Y3V0cyBpbiwgc2VwYXJhdGVkIGJ5IGNvbW1hcy5cIilcclxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MubWF0cml4U2hvcnRjdXRzRW52TmFtZXMpXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0Vudk5hbWVzKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0Vudk5hbWVzID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGlzcGxheVRhYm91dFNldHRpbmdzKCkge1xyXG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIlRhYm91dFwiLCBcInRhYm91dFwiKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0YWJvdXQgaXMgZW5hYmxlZC5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnRhYm91dEVuYWJsZWQpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MudGFib3V0RW5hYmxlZCA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5QXV0b0VubGFyZ2VCcmFja2V0c1NldHRpbmdzKCkge1xyXG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkF1dG8tZW5sYXJnZSBicmFja2V0c1wiLCBcInBhcmVudGhlc2VzXCIpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIGF1dG9tYXRpY2FsbHkgZW5sYXJnZSBicmFja2V0cyBjb250YWluaW5nIGUuZy4gc3VtLCBpbnQsIGZyYWMuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9FbmxhcmdlQnJhY2tldHMgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiVHJpZ2dlcnNcIilcclxuXHRcdFx0LnNldERlc2MoXCJBIGxpc3Qgb2Ygc3ltYm9scyB0aGF0IHNob3VsZCB0cmlnZ2VyIGF1dG8tZW5sYXJnZSBicmFja2V0cywgc2VwYXJhdGVkIGJ5IGNvbW1hcy5cIilcclxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzVHJpZ2dlcnMpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5QWR2YW5jZWRTbmlwcGV0U2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiQWR2YW5jZWQgc25pcHBldCBzZXR0aW5nc1wiKTtcclxuXHJcblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIlNuaXBwZXQgdmFyaWFibGVzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiQXNzaWduIHNuaXBwZXQgdmFyaWFibGVzIHRoYXQgY2FuIGJlIHVzZWQgYXMgc2hvcnRjdXRzIHdoZW4gd3JpdGluZyBzbmlwcGV0cy5cIilcclxuXHRcdFx0LmFkZFRleHRBcmVhKHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pXHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Muc25pcHBldFZhcmlhYmxlcykpXHJcblx0XHRcdC5zZXRDbGFzcyhcImxhdGV4LXN1aXRlLXNuaXBwZXQtdmFyaWFibGVzLXNldHRpbmdcIik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiTG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIGZpbGUgb3IgZm9sZGVyXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBsb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gYSBzcGVjaWZpZWQgZmlsZSwgb3IgZnJvbSBhbGwgZmlsZXMgd2l0aGluIGEgZm9sZGVyIChpbnN0ZWFkIG9mIGZyb20gdGhlIHBsdWdpbiBzZXR0aW5ncykuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRzbmlwcGV0VmFyaWFibGVzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgdmFsdWUpO1xyXG5cdFx0XHRcdFx0aWYgKHRoaXMuc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbCAhPSB1bmRlZmluZWQpXHJcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCAhdmFsdWUpO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzRmlsZUxvY0Rlc2MgPSBuZXcgRG9jdW1lbnRGcmFnbWVudCgpO1xyXG5cdFx0c25pcHBldFZhcmlhYmxlc0ZpbGVMb2NEZXNjLmNyZWF0ZURpdih7fSwgKGRpdikgPT4ge1xyXG5cdFx0XHRkaXYuaW5uZXJIVE1MID0gYFxyXG5cdFx0XHRUaGUgZmlsZSBvciBmb2xkZXIgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tLiBUaGUgZmlsZSBvciBmb2xkZXIgbXVzdCBiZSB3aXRoaW4geW91ciB2YXVsdCwgYW5kIG5vdCB3aXRoaW4gYSBoaWRkZW4gZm9sZGVyIChzdWNoIGFzIDxjb2RlPi5vYnNpZGlhbi88L2NvZGU+KS5gO1xyXG5cdFx0fSk7XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc0ZpbGVMb2MgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgIC5zZXROYW1lKFwiU25pcHBldCB2YXJpYWJsZXMgZmlsZSBvciBmb2xkZXIgbG9jYXRpb25cIilcclxuICAgIC5zZXREZXNjKHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRGVzYyk7XHJcblxyXG5cclxuICAgIGxldCBpbnB1dFZhcmlhYmxlc0VsOiBIVE1MSW5wdXRFbGVtZW50IHwgdW5kZWZpbmVkOyAvLyBBbGxvdyBwb3RlbnRpYWwgdW5kZWZpbmVkIHZhbHVlc1xyXG5cclxuICAgIHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jLmFkZFNlYXJjaCgoY29tcG9uZW50KSA9PiB7XHJcbiAgICAgICAgY29tcG9uZW50XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jYXRpb24pXHJcbiAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY2F0aW9uKVxyXG4gICAgICAgICAgICAub25DaGFuZ2UoXHJcbiAgICAgICAgICAgICAgICBkZWJvdW5jZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY2F0aW9uID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgfSwgNTAwLCB0cnVlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgXHJcbiAgICAgICAgLy8gRW5zdXJlIGlucHV0VmFyaWFibGVzRWwgaXMgYXNzaWduZWQgY29ycmVjdGx5XHJcbiAgICAgICAgaW5wdXRWYXJpYWJsZXNFbCA9IGNvbXBvbmVudC5pbnB1dEVsIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XHJcbiAgICAgICAgaW5wdXRWYXJpYWJsZXNFbC5hZGRDbGFzcyhcImxhdGV4LXN1aXRlLWxvY2F0aW9uLWlucHV0LWVsXCIpO1xyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIC8vIEVuc3VyZSBpbnB1dFZhcmlhYmxlc0VsIGlzIGRlZmluZWQgYmVmb3JlIHBhc3NpbmcgaXQgdG8gRmlsZVN1Z2dlc3RcclxuICAgIGlmIChpbnB1dFZhcmlhYmxlc0VsKSB7XHJcbiAgICAgICAgdGhpcy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY0VsID0gc25pcHBldFZhcmlhYmxlc0ZpbGVMb2Muc2V0dGluZ0VsO1xyXG4gICAgICAgIG5ldyBGaWxlU3VnZ2VzdCh0aGlzLmFwcCwgaW5wdXRWYXJpYWJsZXNFbCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJJbnB1dCBlbGVtZW50IGZvciB2YXJpYWJsZXMgaXMgdW5kZWZpbmVkLlwiKTtcclxuICAgIH1cclxuXHJcblxyXG5cdFx0Ly8gSGlkZSBzZXR0aW5ncyB0aGF0IGFyZSBub3QgcmVsZXZhbnQgd2hlbiBcImxvYWRTbmlwcGV0c0Zyb21GaWxlXCIgaXMgc2V0IHRvIHRydWUvZmFsc2VcclxuXHRcdGNvbnN0IGxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlO1xyXG5cdFx0c25pcHBldFZhcmlhYmxlc1NldHRpbmcuc2V0dGluZ0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsIGxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpO1xyXG5cdFx0dGhpcy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsICFsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJXb3JkIGRlbGltaXRlcnNcIilcclxuXHRcdFx0LnNldERlc2MoXCJTeW1ib2xzIHRoYXQgd2lsbCBiZSB0cmVhdGVkIGFzIHdvcmQgZGVsaW1pdGVycywgZm9yIHVzZSB3aXRoIHRoZSBcXFwid1xcXCIgc25pcHBldCBvcHRpb24uXCIpXHJcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLndvcmREZWxpbWl0ZXJzKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy53b3JkRGVsaW1pdGVycylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy53b3JkRGVsaW1pdGVycyA9IHZhbHVlO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJSZW1vdmUgdHJhaWxpbmcgd2hpdGVzcGFjZXMgaW4gc25pcHBldHMgaW4gaW5saW5lIG1hdGhcIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIHJlbW92ZSB0cmFpbGluZyB3aGl0ZXNwYWNlcyB3aGVuIGV4cGFuZGluZyBzbmlwcGV0cyBhdCB0aGUgZW5kIG9mIGlubGluZSBtYXRoIGJsb2Nrcy5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW92ZVNuaXBwZXRXaGl0ZXNwYWNlKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnJlbW92ZVNuaXBwZXRXaGl0ZXNwYWNlID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHQuc2V0TmFtZShcIlJlbW92ZSBjbG9zaW5nICQgd2hlbiBiYWNrc3BhY2luZyBpbnNpZGUgYmxhbmsgaW5saW5lIG1hdGhcIilcclxuXHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBhbHNvIHJlbW92ZSB0aGUgY2xvc2luZyAkIHdoZW4geW91IGRlbGV0ZSB0aGUgb3BlbmluZyAkIHN5bWJvbCBpbnNpZGUgYmxhbmsgaW5saW5lIG1hdGguXCIpXHJcblx0XHQuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHRvZ2dsZVxyXG5cdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0RlbGV0ZSQpXHJcblx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRGVsZXRlJCA9IHZhbHVlO1xyXG5cdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRG9uJ3QgdHJpZ2dlciBzbmlwcGV0cyB3aGVuIElNRSBpcyBhY3RpdmVcIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIHN1cHByZXNzIHNuaXBwZXRzIHRyaWdnZXJpbmcgd2hlbiBhbiBJTUUgaXMgYWN0aXZlLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zdXBwcmVzc1NuaXBwZXRUcmlnZ2VyT25JTUUpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KVxyXG5cdFx0XHQpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkNvZGUgbGFuZ3VhZ2VzIHRvIGludGVycHJldCBhcyBtYXRoIG1vZGVcIilcclxuXHRcdFx0LnNldERlc2MoXCJDb2RlYmxvY2sgbGFuZ3VhZ2VzIHdoZXJlIHRoZSB3aG9sZSBjb2RlIGJsb2NrIHNob3VsZCBiZSB0cmVhdGVkIGxpa2UgYSBtYXRoIGJsb2NrLCBzZXBhcmF0ZWQgYnkgY29tbWFzLlwiKVxyXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5mb3JjZU1hdGhMYW5ndWFnZXMpXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmZvcmNlTWF0aExhbmd1YWdlcylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb3JjZU1hdGhMYW5ndWFnZXMgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblx0fVxyXG5cclxuICBwcml2YXRlIGRpc3BsYXlTdHlsZVNldHRpbmdzKCl7XHJcbiAgICBjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xyXG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiTWF0aCBQbHVnaW4gU2V0dGluZ3NcIiB9KTtcclxuXHJcbiAgICB0aGlzLmFkZFRvZ2dsZVNldHRpbmcoY29udGFpbmVyRWwsXCJJbnZlcnQgZGFyayBjb2xvcnMgaW4gZGFyayBtb2RlXCIsXCJJbnZlcnQgZGFyayBjb2xvcnMgaW4gZGlhZ3JhbXMgKGUuZy4gYXhlcywgYXJyb3dzKSB3aGVuIGluIGRhcmsgbW9kZSwgc28gdGhhdCB0aGV5IGFyZSB2aXNpYmxlLlwiLHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpXHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkNsZWFyIGNhY2hlZCBTVkdzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiU1ZHcyByZW5kZXJlZCB3aXRoIFRpa1pKYXggYXJlIHN0b3JlZCBpbiBhIGRhdGFiYXNlLCBzbyBkaWFncmFtcyBkb24ndCBoYXZlIHRvIGJlIHJlLXJlbmRlcmVkIGZyb20gc2NyYXRjaCBldmVyeSB0aW1lIHlvdSBvcGVuIGEgcGFnZS4gVXNlIHRoaXMgdG8gY2xlYXIgdGhlIGNhY2hlIGFuZCBmb3JjZSBhbGwgZGlhZ3JhbXMgdG8gYmUgcmUtcmVuZGVyZWQuXCIpXHJcblx0XHRcdC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxyXG5cdFx0XHRcdC5zZXRJY29uKFwidHJhc2hcIilcclxuXHRcdFx0XHQuc2V0VG9vbHRpcChcIkNsZWFyIGNhY2hlZCBTVkdzXCIpXHJcblx0XHRcdFx0Lm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG5cdFx0XHRcdFx0bG9jYWxGb3JhZ2UuY2xlYXIoKGVycikgPT4ge1xyXG5cdFx0XHRcdFx0XHRpZiAoZXJyKSB7XHJcblx0XHRcdFx0XHRcdFx0Y29uc29sZS5sb2coZXJyKTtcclxuXHRcdFx0XHRcdFx0XHRuZXcgTm90aWNlKGVyciwgMzAwMCk7XHJcblx0XHRcdFx0XHRcdH1cclxuXHRcdFx0XHRcdFx0ZWxzZSB7XHJcblx0XHRcdFx0XHRcdFx0bmV3IE5vdGljZShcIlRpa1pKYXg6IFN1Y2Nlc3NmdWxseSBjbGVhcmVkIGNhY2hlZCBTVkdzLlwiLCAzMDAwKTtcclxuXHRcdFx0XHRcdFx0fVxyXG4gICAgICAgICAgICBcclxuXHRcdFx0XHRcdH0pO1xyXG4gICAgICB9KSk7XHJcblxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgICAuc2V0TmFtZSggXCJSZW5kZXJlZCBudW1iZXIgZm9ybWF0XCIpXHJcbiAgICAgICAgLnNldERlc2MoXCJDaG9vc2UgaG93IHRvIGZvcm1hdCBudW1iZXJzIGluIHRoZSByZXN1bHQuXCIpXHJcbiAgICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcclxuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbignMTAwMCcsXCJmb3JtYXR0ZWQgLjAwMFwiKTtcclxuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbignMTAwMDAnLFwiZm9ybWF0dGVkIC4wMDAwXCIpO1xyXG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKCcxMDAwMDAnLFwiZm9ybWF0dGVkIC4wMDAwMFwiKTtcclxuICAgICAgICAgIGRyb3Bkb3duLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MubnVtYmVyRm9ybWF0dGluZyA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG5cclxuICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiTWF0aCBQbHVnaW4gc3R5bGVcIiB9KTtcclxuXHJcbiAgICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkJhY2tncm91bmQgQ29sb3JcIiwgXCJTZXQgdGhlIGJhY2tncm91bmQgY29sb3IuXCIsIFwiYmFja2dyb3VuZFwiKTtcclxuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiRXZlbiBSb3cgQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3IgZXZlbiByb3dzLlwiLCBcImV2ZW5Sb3dCYWNrZ3JvdW5kXCIpO1xyXG4gICAgICB0aGlzLmFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbCwgXCJPZGQgUm93IEJhY2tncm91bmQgQ29sb3JcIiwgXCJTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIG9kZCByb3dzLlwiLCBcIm9kZFJvd0JhY2tncm91bmRcIik7XHJcbiAgICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCBcImluZm9Nb2RhbCBCYWNrZ3JvdW5kIENvbG9yXCIsIFwiU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciB0aGUgaW5mbyBtb2RhbC5cIiwgXCJpbmZvTW9kYWxCYWNrZ3JvdW5kXCIpO1xyXG4gICAgICBcclxuICAgICAgdGhpcy5hZGRUZXh0U2V0dGluZyhjb250YWluZXJFbCwgXCJGb250IFNpemVcIiwgXCJTZXQgdGhlIGZvbnQgc2l6ZSBmb3IgdGhlIHJvd3MuXCIsIFwiZm9udFNpemVcIik7XHJcbiAgICAgIHRoaXMuYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWwsIFwiUm93IFBhZGRpbmdcIiwgXCJTZXQgdGhlIHBhZGRpbmcgZm9yIHRoZSByb3dzLlwiLCBcInJvd1BhZGRpbmdcIik7XHJcbiAgICAgIHRoaXMuYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWwsIFwiSWNvbiBTaXplXCIsIFwiU2V0IHRoZSBzaXplIG9mIHRoZSBpY29ucy5cIiwgXCJpY29uU2l6ZVwiKTtcclxuICBcclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cclxuICAgICAgICAgIGJ1dHRvblxyXG4gICAgICAgICAgICAuc2V0QnV0dG9uVGV4dChcIldpcGUgSGlzdG9yeSBNb2R1bGVcIilcclxuICAgICAgICAgICAgLnNldFRvb2x0aXAoXCJSZXNldCBhbGwgc2V0dGluZ3MgdG8gdGhlaXIgZGVmYXVsdCB2YWx1ZXNcIilcclxuICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNlc3Npb25IaXN0b3J5ID0gW107XHJcbiAgICAgICAgICAgICBuZXcgTm90aWNlKFwiSGlzdG9yeSB3YXMgd2lwZWQuXCIpXHJcbiAgICAgICAgICAgIH0pKTtcclxuXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxyXG4gICAgICAgIGJ1dHRvblxyXG4gICAgICAgICAgLnNldEJ1dHRvblRleHQoXCJSZXNldCB0byBEZWZhdWx0XCIpXHJcbiAgICAgICAgICAuc2V0VG9vbHRpcChcIlJlc2V0IGFsbCBzZXR0aW5ncyB0byB0aGVpciBkZWZhdWx0IHZhbHVlc1wiKVxyXG4gICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcclxuICAgICAgICAgICAgbmV3IE5vdGljZShcIlNldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byBkZWZhdWx0LlwiKTtcclxuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XHJcbiAgICAgICAgfSkpO1xyXG5cclxuICB9XHJcbiAgcHJpdmF0ZSBhZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHNldHRpbmdLZXk6IGFueSkge1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKG5hbWUpXHJcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxyXG4gICAgICAuYWRkQ29sb3JQaWNrZXIoY29sb3JQaWNrZXIgPT4ge1xyXG4gICAgICAgIGNvbG9yUGlja2VyLnNldFZhbHVlKHNldHRpbmdLZXkpO1xyXG4gICAgICAgIGNvbG9yUGlja2VyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgc2V0dGluZ0tleSA9IHZhbHVlO1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICB0aGlzLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcbiAgcHJpdmF0ZSBhZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBhbnkpIHtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlIDogYW55KSA9PiB7XHJcbiAgICAgICAgdG9nZ2xlLnNldFZhbHVlKHNldHRpbmdLZXkpXHJcbiAgICAgICAgdG9nZ2xlLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgICBzZXR0aW5nS2V5PSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgfVxyXG4gIHByaXZhdGUgYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHNldHRpbmdLZXk6IGFueSkge1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKG5hbWUpXHJcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxyXG4gICAgICAuYWRkVGV4dCgodGV4dDogYW55KSA9PiB7XHJcbiAgICAgICAgdGV4dC5zZXRQbGFjZWhvbGRlcihzZXR0aW5nS2V5KS5zZXRWYWx1ZShzZXR0aW5nS2V5KTtcclxuICAgICAgICB0ZXh0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgICBzZXR0aW5nS2V5PSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgfVxyXG4gIHVwZGF0ZVN0eWxlcygpIHtcclxuICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1yb3ctYmFja2dyb3VuZFwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5iYWNrZ3JvdW5kKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLWV2ZW4tcm93LWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZXZlblJvd0JhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tb2RkLXJvdy1iYWNrZ3JvdW5kXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLm9kZFJvd0JhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0taW5mby1tb2RhbC1jb2x1bW4tYmFja2dyb3VuZFwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmZvTW9kYWxCYWNrZ3JvdW5kKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLWZvbnQtc2l6ZVwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb250U2l6ZSk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1yb3ctcGFkZGluZ1wiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5yb3dQYWRkaW5nKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLWljb24tc2l6ZVwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5pY29uU2l6ZSk7XHJcbn1cclxuXHRjcmVhdGVTbmlwcGV0c0VkaXRvcihzbmlwcGV0c1NldHRpbmc6IFNldHRpbmcpIHtcclxuXHRcdGNvbnN0IGN1c3RvbUNTU1dyYXBwZXIgPSBzbmlwcGV0c1NldHRpbmcuY29udHJvbEVsLmNyZWF0ZURpdihcInNuaXBwZXRzLWVkaXRvci13cmFwcGVyXCIpO1xyXG5cdFx0Y29uc3Qgc25pcHBldHNGb290ZXIgPSBzbmlwcGV0c1NldHRpbmcuY29udHJvbEVsLmNyZWF0ZURpdihcInNuaXBwZXRzLWZvb3RlclwiKTtcclxuXHRcdGNvbnN0IHZhbGlkaXR5ID0gc25pcHBldHNGb290ZXIuY3JlYXRlRGl2KFwic25pcHBldHMtZWRpdG9yLXZhbGlkaXR5XCIpO1xyXG5cclxuXHRcdGNvbnN0IHZhbGlkaXR5SW5kaWNhdG9yID0gbmV3IEV4dHJhQnV0dG9uQ29tcG9uZW50KHZhbGlkaXR5KTtcclxuXHRcdHZhbGlkaXR5SW5kaWNhdG9yLnNldEljb24oXCJjaGVja21hcmtcIilcclxuXHRcdFx0LmV4dHJhU2V0dGluZ3NFbC5hZGRDbGFzcyhcInNuaXBwZXRzLWVkaXRvci12YWxpZGl0eS1pbmRpY2F0b3JcIik7XHJcblxyXG5cdFx0Y29uc3QgdmFsaWRpdHlUZXh0ID0gdmFsaWRpdHkuY3JlYXRlRGl2KFwic25pcHBldHMtZWRpdG9yLXZhbGlkaXR5LXRleHRcIik7XHJcblx0XHR2YWxpZGl0eVRleHQuYWRkQ2xhc3MoXCJzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb25cIik7XHJcblx0XHR2YWxpZGl0eVRleHQuc3R5bGUucGFkZGluZyA9IFwiMFwiO1xyXG5cclxuXHJcblx0XHRmdW5jdGlvbiB1cGRhdGVWYWxpZGl0eUluZGljYXRvcihzdWNjZXNzOiBib29sZWFuKSB7XHJcblx0XHRcdHZhbGlkaXR5SW5kaWNhdG9yLnNldEljb24oc3VjY2VzcyA/IFwiY2hlY2ttYXJrXCIgOiBcImNyb3NzXCIpO1xyXG5cdFx0XHR2YWxpZGl0eUluZGljYXRvci5leHRyYVNldHRpbmdzRWwucmVtb3ZlQ2xhc3Moc3VjY2VzcyA/IFwiaW52YWxpZFwiIDogXCJ2YWxpZFwiKTtcclxuXHRcdFx0dmFsaWRpdHlJbmRpY2F0b3IuZXh0cmFTZXR0aW5nc0VsLmFkZENsYXNzKHN1Y2Nlc3MgPyBcInZhbGlkXCIgOiBcImludmFsaWRcIik7XHJcblx0XHRcdHZhbGlkaXR5VGV4dC5zZXRUZXh0KHN1Y2Nlc3MgPyBcIlNhdmVkXCIgOiBcIkludmFsaWQgc3ludGF4LiBDaGFuZ2VzIG5vdCBzYXZlZFwiKTtcclxuXHRcdH1cclxuXHJcblxyXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGJhc2ljU2V0dXA7XHJcblxyXG5cdFx0Y29uc3QgY2hhbmdlID0gRWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZihhc3luYyAodjogVmlld1VwZGF0ZSkgPT4ge1xyXG5cdFx0XHRpZiAodi5kb2NDaGFuZ2VkKSB7XHJcblx0XHRcdFx0Y29uc3Qgc25pcHBldHMgPSB2LnN0YXRlLmRvYy50b1N0cmluZygpO1xyXG5cdFx0XHRcdGxldCBzdWNjZXNzID0gdHJ1ZTtcclxuXHJcblx0XHRcdFx0bGV0IHNuaXBwZXRWYXJpYWJsZXM7XHJcblx0XHRcdFx0dHJ5IHtcclxuXHRcdFx0XHRcdHNuaXBwZXRWYXJpYWJsZXMgPSBhd2FpdCBwYXJzZVNuaXBwZXRWYXJpYWJsZXModGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlcylcclxuXHRcdFx0XHRcdGF3YWl0IHBhcnNlU25pcHBldHMoc25pcHBldHMsIHNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cdFx0XHRcdH1cclxuXHRcdFx0XHRjYXRjaCAoZSkge1xyXG5cdFx0XHRcdFx0c3VjY2VzcyA9IGZhbHNlO1xyXG5cdFx0XHRcdH1cclxuXHJcblx0XHRcdFx0dXBkYXRlVmFsaWRpdHlJbmRpY2F0b3Ioc3VjY2Vzcyk7XHJcblxyXG5cdFx0XHRcdGlmICghc3VjY2VzcykgcmV0dXJuO1xyXG5cclxuXHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cyA9IHNuaXBwZXRzO1xyXG5cdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuICAgIFxyXG5cdFx0ZXh0ZW5zaW9ucy5wdXNoKGNoYW5nZSk7XHJcblxyXG5cdFx0dGhpcy5zbmlwcGV0c0VkaXRvciA9IGNyZWF0ZUNNRWRpdG9yKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzLCBleHRlbnNpb25zKTtcclxuXHRcdGN1c3RvbUNTU1dyYXBwZXIuYXBwZW5kQ2hpbGQodGhpcy5zbmlwcGV0c0VkaXRvci5kb20pO1xyXG5cclxuXHJcblx0XHRjb25zdCBidXR0b25zRGl2ID0gc25pcHBldHNGb290ZXIuY3JlYXRlRGl2KFwic25pcHBldHMtZWRpdG9yLWJ1dHRvbnNcIik7XHJcblx0XHRjb25zdCByZXNldCA9IG5ldyBCdXR0b25Db21wb25lbnQoYnV0dG9uc0Rpdik7XHJcblx0XHRyZXNldC5zZXRJY29uKFwic3dpdGNoXCIpXHJcblx0XHRcdC5zZXRUb29sdGlwKFwiUmVzZXQgdG8gZGVmYXVsdCBzbmlwcGV0c1wiKVxyXG5cdFx0XHQub25DbGljayhhc3luYyAoKSA9PiB7XHJcblx0XHRcdFx0bmV3IENvbmZpcm1hdGlvbk1vZGFsKHRoaXMucGx1Z2luLmFwcCxcclxuXHRcdFx0XHRcdFwiQXJlIHlvdSBzdXJlPyBUaGlzIHdpbGwgZGVsZXRlIGFueSBjdXN0b20gc25pcHBldHMgeW91IGhhdmUgd3JpdHRlbi5cIixcclxuXHRcdFx0XHRcdGJ1dHRvbiA9PiBidXR0b25cclxuXHRcdFx0XHRcdFx0LnNldEJ1dHRvblRleHQoXCJSZXNldCB0byBkZWZhdWx0IHNuaXBwZXRzXCIpXHJcblx0XHRcdFx0XHRcdC5zZXRXYXJuaW5nKCksXHJcblx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XHJcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNFZGl0b3Iuc2V0U3RhdGUoRWRpdG9yU3RhdGUuY3JlYXRlKHsgZG9jOiBERUZBVUxUX1NOSVBQRVRTLCBleHRlbnNpb25zOiBleHRlbnNpb25zIH0pKTtcclxuXHRcdFx0XHRcdFx0dXBkYXRlVmFsaWRpdHlJbmRpY2F0b3IodHJ1ZSk7XHJcblxyXG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cyA9IERFRkFVTFRfU05JUFBFVFM7XHJcblxyXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHRcdH1cclxuXHRcdFx0XHQpLm9wZW4oKTtcclxuXHRcdFx0fSk7XHJcblxyXG5cdFx0Y29uc3QgcmVtb3ZlID0gbmV3IEJ1dHRvbkNvbXBvbmVudChidXR0b25zRGl2KTtcclxuXHRcdHJlbW92ZS5zZXRJY29uKFwidHJhc2hcIilcclxuXHRcdFx0LnNldFRvb2x0aXAoXCJSZW1vdmUgYWxsIHNuaXBwZXRzXCIpXHJcblx0XHRcdC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuXHRcdFx0XHRuZXcgQ29uZmlybWF0aW9uTW9kYWwodGhpcy5wbHVnaW4uYXBwLFxyXG5cdFx0XHRcdFx0XCJBcmUgeW91IHN1cmU/IFRoaXMgd2lsbCBkZWxldGUgYW55IGN1c3RvbSBzbmlwcGV0cyB5b3UgaGF2ZSB3cml0dGVuLlwiLFxyXG5cdFx0XHRcdFx0YnV0dG9uID0+IGJ1dHRvblxyXG5cdFx0XHRcdFx0XHQuc2V0QnV0dG9uVGV4dChcIlJlbW92ZSBhbGwgc25pcHBldHNcIilcclxuXHRcdFx0XHRcdFx0LnNldFdhcm5pbmcoKSxcclxuXHRcdFx0XHRcdGFzeW5jICgpID0+IHtcclxuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBgW1xyXG5cclxuXWA7XHJcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNFZGl0b3Iuc2V0U3RhdGUoRWRpdG9yU3RhdGUuY3JlYXRlKHsgZG9jOiB2YWx1ZSwgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyB9KSk7XHJcblx0XHRcdFx0XHRcdHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHRydWUpO1xyXG5cclxuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHMgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0KS5vcGVuKCk7XHJcblx0XHRcdH0pO1xyXG5cdH1cclxufVxyXG5cclxuY2xhc3MgQ29uZmlybWF0aW9uTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcblxyXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBib2R5OiBzdHJpbmcsIGJ1dHRvbkNhbGxiYWNrOiAoYnV0dG9uOiBCdXR0b25Db21wb25lbnQpID0+IHZvaWQsIGNsaWNrQ2FsbGJhY2s6ICgpID0+IFByb21pc2U8dm9pZD4pIHtcclxuXHRcdHN1cGVyKGFwcCk7XHJcblxyXG5cdFx0dGhpcy5jb250ZW50RWwuYWRkQ2xhc3MoXCJsYXRleC1zdWl0ZS1jb25maXJtYXRpb24tbW9kYWxcIik7XHJcblx0XHR0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBib2R5IH0pO1xyXG5cclxuXHJcblx0XHRuZXcgU2V0dGluZyh0aGlzLmNvbnRlbnRFbClcclxuXHRcdFx0LmFkZEJ1dHRvbihidXR0b24gPT4ge1xyXG5cdFx0XHRcdGJ1dHRvbkNhbGxiYWNrKGJ1dHRvbik7XHJcblx0XHRcdFx0YnV0dG9uLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG5cdFx0XHRcdFx0YXdhaXQgY2xpY2tDYWxsYmFjaygpO1xyXG5cdFx0XHRcdFx0dGhpcy5jbG9zZSgpO1xyXG5cdFx0XHRcdH0pO1xyXG5cdFx0XHR9KVxyXG5cdFx0XHQuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cclxuXHRcdFx0XHQuc2V0QnV0dG9uVGV4dChcIkNhbmNlbFwiKVxyXG5cdFx0XHRcdC5vbkNsaWNrKCgpID0+IHRoaXMuY2xvc2UoKSkpO1xyXG5cdH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlQ01FZGl0b3IoY29udGVudDogc3RyaW5nLCBleHRlbnNpb25zOiBFeHRlbnNpb25bXSkge1xyXG5cdGNvbnN0IHZpZXcgPSBuZXcgRWRpdG9yVmlldyh7XHJcblx0XHRzdGF0ZTogRWRpdG9yU3RhdGUuY3JlYXRlKHsgZG9jOiBjb250ZW50LCBleHRlbnNpb25zIH0pLFxyXG5cdH0pO1xyXG5cclxuXHRyZXR1cm4gdmlldztcclxufVxyXG5cclxuIl19