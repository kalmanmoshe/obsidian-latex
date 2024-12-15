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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2V0dGluZ3NfdGFiLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NldHRpbmdzL3NldHRpbmdzX3RhYi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsV0FBVyxFQUFhLE1BQU0sbUJBQW1CLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQzFELE9BQU8sRUFBTyxlQUFlLEVBQUMsTUFBTSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNsSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxLQUFLLFdBQVcsTUFBTSxhQUFhLENBQUM7QUFFM0MsTUFBTSxPQUFPLG9CQUFxQixTQUFRLGdCQUFnQjtJQUN6RCxNQUFNLENBQW1CO0lBQ3pCLGNBQWMsQ0FBYTtJQUMzQixpQkFBaUIsQ0FBYztJQUMvQix5QkFBeUIsQ0FBYztJQUV2QyxZQUFZLEdBQVEsRUFBRSxNQUF3QjtRQUM3QyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQztZQUNILFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FB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LEtBQUssRUFBRSxDQUFDO1lBQ2QsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDLENBQUM7YUFDRCxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNO2FBQ3pCLGFBQWEsQ0FBQyxRQUFRLENBQUM7YUFDdkIsT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakMsQ0FBQztDQUNEO0FBRUQsU0FBUyxjQUFjLENBQUMsT0FBZSxFQUFFLFVBQXVCO0lBQy9ELE1BQU0sSUFBSSxHQUFHLElBQUksVUFBVSxDQUFDO1FBQzNCLEtBQUssRUFBRSxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxVQUFVLEVBQUUsQ0FBQztLQUN2RCxDQUFDLENBQUM7SUFFSCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBFZGl0b3JTdGF0ZSwgRXh0ZW5zaW9uIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3VXBkYXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcbmltcG9ydCB7IEFwcCwgQnV0dG9uQ29tcG9uZW50LE5vdGljZSwgRXh0cmFCdXR0b25Db21wb25lbnQsIE1vZGFsLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nLCBkZWJvdW5jZSwgc2V0SWNvbiB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IHsgcGFyc2VTbmlwcGV0VmFyaWFibGVzLCBwYXJzZVNuaXBwZXRzIH0gZnJvbSBcInNyYy9zbmlwcGV0cy9wYXJzZVwiO1xuaW1wb3J0IHsgREVGQVVMVF9TTklQUEVUUyB9IGZyb20gXCJzcmMvdXRpbHMvZGVmYXVsdF9zbmlwcGV0c1wiO1xuaW1wb3J0IExhdGV4U3VpdGVQbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcbmltcG9ydCB7IERFRkFVTFRfU0VUVElOR1MgfSBmcm9tIFwiLi9zZXR0aW5nc1wiO1xuaW1wb3J0IHsgRmlsZVN1Z2dlc3QgfSBmcm9tIFwiLi91aS9maWxlX3N1Z2dlc3RcIjtcbmltcG9ydCB7IGJhc2ljU2V0dXAgfSBmcm9tIFwiLi91aS9zbmlwcGV0c19lZGl0b3IvZXh0ZW5zaW9uc1wiO1xuaW1wb3J0ICogYXMgbG9jYWxGb3JhZ2UgZnJvbSBcImxvY2FsZm9yYWdlXCI7XG5cbmV4cG9ydCBjbGFzcyBMYXRleFN1aXRlU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuXHRwbHVnaW46IExhdGV4U3VpdGVQbHVnaW47XG5cdHNuaXBwZXRzRWRpdG9yOiBFZGl0b3JWaWV3O1xuXHRzbmlwcGV0c0ZpbGVMb2NFbDogSFRNTEVsZW1lbnQ7XG5cdHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWw6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IExhdGV4U3VpdGVQbHVnaW4pIHtcblx0XHRzdXBlcihhcHAsIHBsdWdpbik7XG5cdFx0dGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgdHJ5IHtcbiAgICAgIGxvY2FsRm9yYWdlLmNvbmZpZyh7IG5hbWU6IFwiVGlrekpheFwiLCBzdG9yZU5hbWU6IFwic3ZnSW1hZ2VzXCIgfSk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUubG9nKGVycm9yKTtcbiAgICB9XG5cdH1cblxuXHRoaWRlKCkge1xuXHRcdHRoaXMuc25pcHBldHNFZGl0b3I/LmRlc3Ryb3koKTtcblx0fVxuXG5cdGFkZEhlYWRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGljb24gPSBcIm1hdGhcIikge1xuXHRcdGNvbnN0IGhlYWRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShuYW1lKS5zZXRIZWFkaW5nKCk7XG5cblx0XHRjb25zdCBwYXJlbnRFbCA9IGhlYWRpbmcuc2V0dGluZ0VsO1xuXHRcdGNvbnN0IGljb25FbCA9IHBhcmVudEVsLmNyZWF0ZURpdigpO1xuXHRcdHNldEljb24oaWNvbkVsLCBpY29uKTtcblx0XHRpY29uRWwuYWRkQ2xhc3MoXCJsYXRleC1zdWl0ZS1zZXR0aW5ncy1pY29uXCIpO1xuXG5cdFx0cGFyZW50RWwucHJlcGVuZChpY29uRWwpO1xuXHR9XG5cblx0ZGlzcGxheSgpOiB2b2lkIHtcblx0XHRjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuXHRcdGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cblx0XHR0aGlzLmRpc3BsYXlTbmlwcGV0U2V0dGluZ3MoKTtcblx0XHR0aGlzLmRpc3BsYXlDb25jZWFsU2V0dGluZ3MoKTtcblx0XHR0aGlzLmRpc3BsYXlDb2xvckhpZ2hsaWdodEJyYWNrZXRzU2V0dGluZ3MoKTtcblx0XHR0aGlzLmRpc3BsYXlQb3B1cFByZXZpZXdTZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheUF1dG9mcmFjdGlvblNldHRpbmdzKCk7XG5cdFx0dGhpcy5kaXNwbGF5TWF0cml4U2hvcnRjdXRzU2V0dGluZ3MoKTtcblx0XHR0aGlzLmRpc3BsYXlUYWJvdXRTZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheUF1dG9FbmxhcmdlQnJhY2tldHNTZXR0aW5ncygpO1xuXHRcdHRoaXMuZGlzcGxheUFkdmFuY2VkU25pcHBldFNldHRpbmdzKCk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlTbmlwcGV0U2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJTbmlwcGV0c1wiLCBcImJhbGxwZW5cIik7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHNuaXBwZXRzIGFyZSBlbmFibGVkLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cblx0XHRjb25zdCBzbmlwcGV0c1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiU25pcHBldHNcIilcblx0XHRcdC5zZXREZXNjKFwiRW50ZXIgc25pcHBldHMgaGVyZS4gIFJlbWVtYmVyIHRvIGFkZCBhIGNvbW1hIGFmdGVyIGVhY2ggc25pcHBldCwgYW5kIGVzY2FwZSBhbGwgYmFja3NsYXNoZXMgd2l0aCBhbiBleHRyYSBcXFxcLiBMaW5lcyBzdGFydGluZyB3aXRoIFxcXCIvL1xcXCIgd2lsbCBiZSB0cmVhdGVkIGFzIGNvbW1lbnRzIGFuZCBpZ25vcmVkLlwiKVxuXHRcdFx0LnNldENsYXNzKFwic25pcHBldHMtdGV4dC1hcmVhXCIpO1xuXG5cblx0XHR0aGlzLmNyZWF0ZVNuaXBwZXRzRWRpdG9yKHNuaXBwZXRzU2V0dGluZyk7XG5cblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJMb2FkIHNuaXBwZXRzIGZyb20gZmlsZSBvciBmb2xkZXJcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBsb2FkIHNuaXBwZXRzIGZyb20gYSBzcGVjaWZpZWQgZmlsZSwgb3IgZnJvbSBhbGwgZmlsZXMgd2l0aGluIGEgZm9sZGVyIChpbnN0ZWFkIG9mIGZyb20gdGhlIHBsdWdpbiBzZXR0aW5ncykuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUgPSB2YWx1ZTtcblxuXHRcdFx0XHRcdHNuaXBwZXRzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgdmFsdWUpO1xuXHRcdFx0XHRcdGlmICh0aGlzLnNuaXBwZXRzRmlsZUxvY0VsICE9IHVuZGVmaW5lZClcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIXZhbHVlKTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblxuXHRcdGNvbnN0IHNuaXBwZXRzRmlsZUxvY0Rlc2MgPSBuZXcgRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdHNuaXBwZXRzRmlsZUxvY0Rlc2MuY3JlYXRlRGl2KHt9LCBkaXYgPT4ge1xuXHRcdFx0ZGl2LmlubmVySFRNTCA9IGBcblx0XHRcdFRoZSBmaWxlIG9yIGZvbGRlciB0byBsb2FkIHNuaXBwZXRzIGZyb20uIFRoZSBmaWxlIG9yIGZvbGRlciBtdXN0IGJlIHdpdGhpbiB5b3VyIHZhdWx0LCBhbmQgbm90IHdpdGhpbiBhIGhpZGRlbiBmb2xkZXIgKHN1Y2ggYXMgPGNvZGU+Lm9ic2lkaWFuLzwvY29kZT4pLmA7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzbmlwcGV0c0ZpbGVMb2MgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAuc2V0TmFtZShcIlNuaXBwZXRzIGZpbGUgb3IgZm9sZGVyIGxvY2F0aW9uXCIpXG4gICAgLnNldERlc2Moc25pcHBldHNGaWxlTG9jRGVzYyk7XG5cbiAgICBsZXQgaW5wdXRFbDogSFRNTElucHV0RWxlbWVudCB8IHVuZGVmaW5lZDsgLy8gRGVmaW5lIHdpdGggYSBwb3NzaWJsZSB1bmRlZmluZWQgdHlwZVxuXG4gICAgc25pcHBldHNGaWxlTG9jLmFkZFNlYXJjaCgoY29tcG9uZW50KSA9PiB7XG4gICAgICAgIGNvbXBvbmVudFxuICAgICAgICAgICAgLnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Muc25pcHBldHNGaWxlTG9jYXRpb24pXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNGaWxlTG9jYXRpb24pXG4gICAgICAgICAgICAub25DaGFuZ2UoXG4gICAgICAgICAgICAgICAgZGVib3VuY2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzRmlsZUxvY2F0aW9uID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncyh0cnVlKTtcbiAgICAgICAgICAgICAgICB9LCA1MDAsIHRydWUpXG4gICAgICAgICAgICApO1xuICAgIFxuICAgICAgICAvLyBFbnN1cmUgaW5wdXRFbCBpcyBhc3NpZ25lZFxuICAgICAgICBpbnB1dEVsID0gY29tcG9uZW50LmlucHV0RWwgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgaW5wdXRFbC5hZGRDbGFzcyhcImxhdGV4LXN1aXRlLWxvY2F0aW9uLWlucHV0LWVsXCIpO1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEVuc3VyZSBpbnB1dEVsIGlzIGRlZmluZWQgYmVmb3JlIHBhc3NpbmcgdG8gRmlsZVN1Z2dlc3RcbiAgICBpZiAoaW5wdXRFbCkge1xuICAgICAgICB0aGlzLnNuaXBwZXRzRmlsZUxvY0VsID0gc25pcHBldHNGaWxlTG9jLnNldHRpbmdFbDtcbiAgICAgICAgbmV3IEZpbGVTdWdnZXN0KHRoaXMuYXBwLCBpbnB1dEVsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiSW5wdXQgZWxlbWVudCBpcyB1bmRlZmluZWQuXCIpO1xuICAgIH1cblxuXG5cdFx0Ly8gSGlkZSBzZXR0aW5ncyB0aGF0IGFyZSBub3QgcmVsZXZhbnQgd2hlbiBcImxvYWRTbmlwcGV0c0Zyb21GaWxlXCIgaXMgc2V0IHRvIHRydWUvZmFsc2Vcblx0XHRjb25zdCBsb2FkU25pcHBldHNGcm9tRmlsZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlO1xuXHRcdHNuaXBwZXRzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgbG9hZFNuaXBwZXRzRnJvbUZpbGUpO1xuXHRcdHRoaXMuc25pcHBldHNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIWxvYWRTbmlwcGV0c0Zyb21GaWxlKTtcblxuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIktleSB0cmlnZ2VyIGZvciBub24tYXV0byBzbmlwcGV0c1wiKVxuXHRcdFx0LnNldERlc2MoXCJXaGF0IGtleSB0byBwcmVzcyB0byBleHBhbmQgbm9uLWF1dG8gc25pcHBldHMuXCIpXG5cdFx0XHQuYWRkRHJvcGRvd24oKGRyb3Bkb3duKSA9PiBkcm9wZG93blxuXHRcdFx0XHQuYWRkT3B0aW9uKFwiVGFiXCIsIFwiVGFiXCIpXG5cdFx0XHRcdC5hZGRPcHRpb24oXCIgXCIsIFwiU3BhY2VcIilcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzVHJpZ2dlcilcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzVHJpZ2dlciA9IHZhbHVlIGFzIFwiVGFiXCIgfFxuXHRcdFx0XHRcdFx0XCIgXCI7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5Q29uY2VhbFNldHRpbmdzKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiQ29uY2VhbFwiLCBcIm1hdGgtaW50ZWdyYWwteFwiKTtcblxuXHRcdGNvbnN0IGZyYWdtZW50ID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIk1ha2UgZXF1YXRpb25zIG1vcmUgcmVhZGFibGUgYnkgaGlkaW5nIExhVGVYIHN5bnRheCBhbmQgaW5zdGVhZCBkaXNwbGF5aW5nIGl0IGluIGEgcHJldHR5IGZvcm1hdC5cIikpO1xuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5pbm5lckhUTUwgPSBgXG5cdFx0XHRlLmcuIDxjb2RlPlxcXFxkb3R7eH1eezJ9ICsgXFxcXGRvdHt5fV57Mn08L2NvZGU+IHdpbGwgZGlzcGxheSBhcyDhuovCsiArIOG6j8KyLCBhbmQgPGNvZGU+XFxcXHNxcnR7IDEtXFxcXGJldGFeezJ9IH08L2NvZGU+IHdpbGwgZGlzcGxheSBhcyDiiJp7IDEtzrLCsiB9LlxuXHRcdGApO1xuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiTGFUZVggYmVuZWF0aCB0aGUgY3Vyc29yIHdpbGwgYmUgcmV2ZWFsZWQuXCIpKTtcblx0XHRmcmFnbWVudC5jcmVhdGVFbChcImJyXCIpO1xuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiRGlzYWJsZWQgYnkgZGVmYXVsdCB0byBub3QgY29uZnVzZSBuZXcgdXNlcnMuIEhvd2V2ZXIsIEkgcmVjb21tZW5kIHR1cm5pbmcgdGhpcyBvbiBvbmNlIHlvdSBhcmUgY29tZm9ydGFibGUgd2l0aCB0aGUgcGx1Z2luIVwiKSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxuXHRcdFx0LnNldERlc2MoZnJhZ21lbnQpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxFbmFibGVkKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuY29uY2VhbEVuYWJsZWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cblx0XHRjb25zdCBmcmFnbWVudDIgPSBuZXcgRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdGZyYWdtZW50Mi5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIkhvdyBsb25nIHRvIGRlbGF5IHRoZSByZXZlYWwgb2YgTGFUZVggZm9yLCBpbiBtaWxsaXNlY29uZHMsIHdoZW4gdGhlIGN1cnNvciBtb3ZlcyBvdmVyIExhVGVYLiBEZWZhdWx0cyB0byAwIChMYVRlWCB1bmRlciB0aGUgY3Vyc29yIGlzIHJldmVhbGVkIGltbWVkaWF0ZWx5KS5cIikpO1xuXHRcdGZyYWdtZW50Mi5jcmVhdGVFbChcImJyXCIpO1xuXHRcdGZyYWdtZW50Mi5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIkNhbiBiZSBzZXQgdG8gYSBwb3NpdGl2ZSBudW1iZXIsIGUuZy4gMzAwLCB0byBkZWxheSB0aGUgcmV2ZWFsIG9mIExhVGVYLCBtYWtpbmcgaXQgbXVjaCBlYXNpZXIgdG8gbmF2aWdhdGUgZXF1YXRpb25zIHVzaW5nIGFycm93IGtleXMuXCIpKTtcblx0XHRmcmFnbWVudDIuY3JlYXRlRWwoXCJiclwiKTtcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJNdXN0IGJlIGFuIGludGVnZXIg4omlIDAuXCIpKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJSZXZlYWwgZGVsYXkgKG1zKVwiKVxuXHRcdFx0LnNldERlc2MoZnJhZ21lbnQyKVxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihTdHJpbmcoREVGQVVMVF9TRVRUSU5HUy5jb25jZWFsUmV2ZWFsVGltZW91dCkpXG5cdFx0XHRcdC5zZXRWYWx1ZShTdHJpbmcodGhpcy5wbHVnaW4uc2V0dGluZ3MuY29uY2VhbFJldmVhbFRpbWVvdXQpKVxuXHRcdFx0XHQub25DaGFuZ2UodmFsdWUgPT4ge1xuXHRcdFx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgdmFsdWUgaXMgYSBub24tbmVnYXRpdmUgaW50ZWdlclxuXHRcdFx0XHRcdGNvbnN0IG9rID0gL15cXGQrJC8udGVzdCh2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKG9rKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb25jZWFsUmV2ZWFsVGltZW91dCA9IE51bWJlcih2YWx1ZSk7XG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlDb2xvckhpZ2hsaWdodEJyYWNrZXRzU2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJIaWdobGlnaHQgYW5kIGNvbG9yIGJyYWNrZXRzXCIsIFwicGFyZW50aGVzZXNcIik7XG4gICAgdGhpcy5hZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsLFwiQ29sb3IgcGFpcmVkIGJyYWNrZXRzXCIsXCJXaGV0aGVyIHRvIGNvbG9yaXplIG1hdGNoaW5nIGJyYWNrZXRzLlwiLHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbG9yUGFpcmVkQnJhY2tldHNFbmFibGVkKVxuICAgIHRoaXMuYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbCxcIkhpZ2hsaWdodCBtYXRjaGluZyBicmFja2V0IGJlbmVhdGggY3Vyc29yXCIsXCJXaGVuIHRoZSBjdXJzb3IgaXMgYWRqYWNlbnQgdG8gYSBicmFja2V0LCBoaWdobGlnaHQgdGhlIG1hdGNoaW5nIGJyYWNrZXQuXCIsdGhpcy5wbHVnaW4uc2V0dGluZ3MuaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNFbmFibGVkKVxuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5UG9wdXBQcmV2aWV3U2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJNYXRoIHBvcHVwIHByZXZpZXdcIiwgXCJzdXBlcnNjcmlwdFwiKTtcblxuXHRcdGNvbnN0IHBvcHVwX2ZyYWdtZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdGNvbnN0IHBvcHVwX2xpbmUxID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRwb3B1cF9saW5lMS5zZXRUZXh0KFwiV2hlbiBpbnNpZGUgYW4gZXF1YXRpb24sIHNob3cgYSBwb3B1cCBwcmV2aWV3IHdpbmRvdyBvZiB0aGUgcmVuZGVyZWQgbWF0aC5cIik7XG5cdFx0Y29uc3QgcG9wdXBfc3BhY2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYnJcIik7XG5cdFx0Y29uc3QgcG9wdXBfbGluZTIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXHRcdHBvcHVwX2xpbmUyLnNldFRleHQoXCJUaGUgcG9wdXAgcHJldmlldyB3aWxsIGJlIHNob3duIGZvciBhbGwgaW5saW5lIG1hdGggZXF1YXRpb25zLCBhcyB3ZWxsIGFzIGZvciBibG9jayBtYXRoIGVxdWF0aW9ucyBpbiBTb3VyY2UgbW9kZS5cIik7XG5cdFx0cG9wdXBfZnJhZ21lbnQuYXBwZW5kKHBvcHVwX2xpbmUxLCBwb3B1cF9zcGFjZSwgcG9wdXBfbGluZTIpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcblx0XHRcdC5zZXREZXNjKHBvcHVwX2ZyYWdtZW50KVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQgPSB2YWx1ZTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiUG9zaXRpb25cIilcblx0XHRcdC5zZXREZXNjKFwiV2hlcmUgdG8gZGlzcGxheSB0aGUgcG9wdXAgcHJldmlldyByZWxhdGl2ZSB0byB0aGUgZXF1YXRpb24gc291cmNlLlwiKVxuXHRcdFx0LmFkZERyb3Bkb3duKChkcm9wZG93bikgPT4gZHJvcGRvd25cblx0XHRcdFx0LmFkZE9wdGlvbihcIkFib3ZlXCIsIFwiQWJvdmVcIilcblx0XHRcdFx0LmFkZE9wdGlvbihcIkJlbG93XCIsIFwiQmVsb3dcIilcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdGhQcmV2aWV3UG9zaXRpb25Jc0Fib3ZlID8gXCJBYm92ZVwiIDogXCJCZWxvd1wiKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0aFByZXZpZXdQb3NpdGlvbklzQWJvdmUgPSAodmFsdWUgPT09IFwiQWJvdmVcIik7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5QXV0b2ZyYWN0aW9uU2V0dGluZ3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBdXRvLWZyYWN0aW9uXCIsIFwibWF0aC14LWRpdmlkZS15LTJcIik7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIGF1dG8tZnJhY3Rpb24gaXMgZW5hYmxlZC5cIilcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uRW5hYmxlZClcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkVuYWJsZWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkZyYWN0aW9uIHN5bWJvbFwiKVxuXHRcdFx0LnNldERlc2MoXCJUaGUgZnJhY3Rpb24gc3ltYm9sIHRvIHVzZSBpbiB0aGUgcmVwbGFjZW1lbnQuIGUuZy4gXFxcXGZyYWMsIFxcXFxkZnJhYywgXFxcXHRmcmFjXCIpXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuYXV0b2ZyYWN0aW9uU3ltYm9sKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uU3ltYm9sKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uU3ltYm9sID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRXhjbHVkZWQgZW52aXJvbm1lbnRzXCIpXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBlbnZpcm9ubWVudHMgdG8gZXhjbHVkZSBhdXRvLWZyYWN0aW9uIGZyb20gcnVubmluZyBpbi4gRm9yIGV4YW1wbGUsIHRvIGV4Y2x1ZGUgYXV0by1mcmFjdGlvbiBmcm9tIHJ1bm5pbmcgd2hpbGUgaW5zaWRlIGFuIGV4cG9uZW50LCBzdWNoIGFzIGVeey4uLn0sIHVzZSAgW1xcXCJee1xcXCIsIFxcXCJ9XFxcIl1cIilcblx0XHRcdC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKFwiWyBbXFxcIl57XFxcIiwgXFxcIn1dIF1cIilcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkV4Y2x1ZGVkRW52cylcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkV4Y2x1ZGVkRW52cyA9IHZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJCcmVha2luZyBjaGFyYWN0ZXJzXCIpXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBjaGFyYWN0ZXJzIHRoYXQgZGVub3RlIHRoZSBzdGFydC9lbmQgb2YgYSBmcmFjdGlvbi4gZS5nLiBpZiArIGlzIGluY2x1ZGVkIGluIHRoZSBsaXN0LCBcXFwiYStiL2NcXFwiIHdpbGwgZXhwYW5kIHRvIFxcXCJhK1xcXFxmcmFje2J9e2N9XFxcIi4gSWYgKyBpcyBub3QgaW4gdGhlIGxpc3QsIGl0IHdpbGwgZXhwYW5kIHRvIFxcXCJcXFxcZnJhY3thK2J9e2N9XFxcIi5cIilcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5hdXRvZnJhY3Rpb25CcmVha2luZ0NoYXJzKVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uQnJlYWtpbmdDaGFycylcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkJyZWFraW5nQ2hhcnMgPSB2YWx1ZTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlNYXRyaXhTaG9ydGN1dHNTZXR0aW5ncygpIHtcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIk1hdHJpeCBzaG9ydGN1dHNcIiwgXCJicmFja2V0cy1jb250YWluXCIpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciBtYXRyaXggc2hvcnRjdXRzIGFyZSBlbmFibGVkLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbmFibGVkKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCA9IHZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHRcdC5zZXROYW1lKFwiRW52aXJvbm1lbnRzXCIpXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBlbnZpcm9ubWVudCBuYW1lcyB0byBydW4gdGhlIG1hdHJpeCBzaG9ydGN1dHMgaW4sIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MubWF0cml4U2hvcnRjdXRzRW52TmFtZXMpXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbnZOYW1lcylcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0Vudk5hbWVzID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlUYWJvdXRTZXR0aW5ncygpIHtcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIlRhYm91dFwiLCBcInRhYm91dFwiKTtcblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdGFib3V0IGlzIGVuYWJsZWQuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLnRhYm91dEVuYWJsZWQpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy50YWJvdXRFbmFibGVkID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcGxheUF1dG9FbmxhcmdlQnJhY2tldHNTZXR0aW5ncygpIHtcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkF1dG8tZW5sYXJnZSBicmFja2V0c1wiLCBcInBhcmVudGhlc2VzXCIpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkVuYWJsZWRcIilcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBhdXRvbWF0aWNhbGx5IGVubGFyZ2UgYnJhY2tldHMgY29udGFpbmluZyBlLmcuIHN1bSwgaW50LCBmcmFjLlwiKVxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0cyA9IHZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJUcmlnZ2Vyc1wiKVxuXHRcdFx0LnNldERlc2MoXCJBIGxpc3Qgb2Ygc3ltYm9scyB0aGF0IHNob3VsZCB0cmlnZ2VyIGF1dG8tZW5sYXJnZSBicmFja2V0cywgc2VwYXJhdGVkIGJ5IGNvbW1hcy5cIilcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5hdXRvRW5sYXJnZUJyYWNrZXRzVHJpZ2dlcnMpXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzVHJpZ2dlcnMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzVHJpZ2dlcnMgPSB2YWx1ZTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3BsYXlBZHZhbmNlZFNuaXBwZXRTZXR0aW5ncygpIHtcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkFkdmFuY2VkIHNuaXBwZXQgc2V0dGluZ3NcIik7XG5cblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuXHRcdFx0LnNldE5hbWUoXCJTbmlwcGV0IHZhcmlhYmxlc1wiKVxuXHRcdFx0LnNldERlc2MoXCJBc3NpZ24gc25pcHBldCB2YXJpYWJsZXMgdGhhdCBjYW4gYmUgdXNlZCBhcyBzaG9ydGN1dHMgd2hlbiB3cml0aW5nIHNuaXBwZXRzLlwiKVxuXHRcdFx0LmFkZFRleHRBcmVhKHRleHQgPT4gdGV4dFxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlcylcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMgPSB2YWx1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Muc25pcHBldFZhcmlhYmxlcykpXG5cdFx0XHQuc2V0Q2xhc3MoXCJsYXRleC1zdWl0ZS1zbmlwcGV0LXZhcmlhYmxlcy1zZXR0aW5nXCIpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBmaWxlIG9yIGZvbGRlclwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBhIHNwZWNpZmllZCBmaWxlLCBvciBmcm9tIGFsbCBmaWxlcyB3aXRoaW4gYSBmb2xkZXIgKGluc3RlYWQgb2YgZnJvbSB0aGUgcGx1Z2luIHNldHRpbmdzKS5cIilcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSlcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUgPSB2YWx1ZTtcblxuXHRcdFx0XHRcdHNuaXBwZXRWYXJpYWJsZXNTZXR0aW5nLnNldHRpbmdFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCB2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbCAhPSB1bmRlZmluZWQpXG5cdFx0XHRcdFx0XHR0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIXZhbHVlKTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzRmlsZUxvY0Rlc2MgPSBuZXcgRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRGVzYy5jcmVhdGVEaXYoe30sIChkaXYpID0+IHtcblx0XHRcdGRpdi5pbm5lckhUTUwgPSBgXG5cdFx0XHRUaGUgZmlsZSBvciBmb2xkZXIgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tLiBUaGUgZmlsZSBvciBmb2xkZXIgbXVzdCBiZSB3aXRoaW4geW91ciB2YXVsdCwgYW5kIG5vdCB3aXRoaW4gYSBoaWRkZW4gZm9sZGVyIChzdWNoIGFzIDxjb2RlPi5vYnNpZGlhbi88L2NvZGU+KS5gO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc0ZpbGVMb2MgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAuc2V0TmFtZShcIlNuaXBwZXQgdmFyaWFibGVzIGZpbGUgb3IgZm9sZGVyIGxvY2F0aW9uXCIpXG4gICAgLnNldERlc2Moc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NEZXNjKTtcblxuXG4gICAgbGV0IGlucHV0VmFyaWFibGVzRWw6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQ7IC8vIEFsbG93IHBvdGVudGlhbCB1bmRlZmluZWQgdmFsdWVzXG5cbiAgICBzbmlwcGV0VmFyaWFibGVzRmlsZUxvYy5hZGRTZWFyY2goKGNvbXBvbmVudCkgPT4ge1xuICAgICAgICBjb21wb25lbnRcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jYXRpb24pXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NhdGlvbilcbiAgICAgICAgICAgIC5vbkNoYW5nZShcbiAgICAgICAgICAgICAgICBkZWJvdW5jZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NhdGlvbiA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3ModHJ1ZSk7XG4gICAgICAgICAgICAgICAgfSwgNTAwLCB0cnVlKVxuICAgICAgICAgICAgKTtcbiAgICBcbiAgICAgICAgLy8gRW5zdXJlIGlucHV0VmFyaWFibGVzRWwgaXMgYXNzaWduZWQgY29ycmVjdGx5XG4gICAgICAgIGlucHV0VmFyaWFibGVzRWwgPSBjb21wb25lbnQuaW5wdXRFbCBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBpbnB1dFZhcmlhYmxlc0VsLmFkZENsYXNzKFwibGF0ZXgtc3VpdGUtbG9jYXRpb24taW5wdXQtZWxcIik7XG4gICAgfSk7XG4gICAgXG4gICAgLy8gRW5zdXJlIGlucHV0VmFyaWFibGVzRWwgaXMgZGVmaW5lZCBiZWZvcmUgcGFzc2luZyBpdCB0byBGaWxlU3VnZ2VzdFxuICAgIGlmIChpbnB1dFZhcmlhYmxlc0VsKSB7XG4gICAgICAgIHRoaXMuc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbCA9IHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jLnNldHRpbmdFbDtcbiAgICAgICAgbmV3IEZpbGVTdWdnZXN0KHRoaXMuYXBwLCBpbnB1dFZhcmlhYmxlc0VsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiSW5wdXQgZWxlbWVudCBmb3IgdmFyaWFibGVzIGlzIHVuZGVmaW5lZC5cIik7XG4gICAgfVxuXG5cblx0XHQvLyBIaWRlIHNldHRpbmdzIHRoYXQgYXJlIG5vdCByZWxldmFudCB3aGVuIFwibG9hZFNuaXBwZXRzRnJvbUZpbGVcIiBpcyBzZXQgdG8gdHJ1ZS9mYWxzZVxuXHRcdGNvbnN0IGxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlO1xuXHRcdHNuaXBwZXRWYXJpYWJsZXNTZXR0aW5nLnNldHRpbmdFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCBsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKTtcblx0XHR0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIWxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIldvcmQgZGVsaW1pdGVyc1wiKVxuXHRcdFx0LnNldERlc2MoXCJTeW1ib2xzIHRoYXQgd2lsbCBiZSB0cmVhdGVkIGFzIHdvcmQgZGVsaW1pdGVycywgZm9yIHVzZSB3aXRoIHRoZSBcXFwid1xcXCIgc25pcHBldCBvcHRpb24uXCIpXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1Mud29yZERlbGltaXRlcnMpXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy53b3JkRGVsaW1pdGVycylcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLndvcmREZWxpbWl0ZXJzID0gdmFsdWU7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIlJlbW92ZSB0cmFpbGluZyB3aGl0ZXNwYWNlcyBpbiBzbmlwcGV0cyBpbiBpbmxpbmUgbWF0aFwiKVxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIHJlbW92ZSB0cmFpbGluZyB3aGl0ZXNwYWNlcyB3aGVuIGV4cGFuZGluZyBzbmlwcGV0cyBhdCB0aGUgZW5kIG9mIGlubGluZSBtYXRoIGJsb2Nrcy5cIilcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MucmVtb3ZlU25pcHBldFdoaXRlc3BhY2UpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdmVTbmlwcGV0V2hpdGVzcGFjZSA9IHZhbHVlO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcblx0XHQuc2V0TmFtZShcIlJlbW92ZSBjbG9zaW5nICQgd2hlbiBiYWNrc3BhY2luZyBpbnNpZGUgYmxhbmsgaW5saW5lIG1hdGhcIilcblx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gYWxzbyByZW1vdmUgdGhlIGNsb3NpbmcgJCB3aGVuIHlvdSBkZWxldGUgdGhlIG9wZW5pbmcgJCBzeW1ib2wgaW5zaWRlIGJsYW5rIGlubGluZSBtYXRoLlwiKVxuXHRcdC5hZGRUb2dnbGUoKHRvZ2dsZSkgPT4gdG9nZ2xlXG5cdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0RlbGV0ZSQpXG5cdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9EZWxldGUkID0gdmFsdWU7XG5cdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0fSkpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkRvbid0IHRyaWdnZXIgc25pcHBldHMgd2hlbiBJTUUgaXMgYWN0aXZlXCIpXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gc3VwcHJlc3Mgc25pcHBldHMgdHJpZ2dlcmluZyB3aGVuIGFuIElNRSBpcyBhY3RpdmUuXCIpXG5cdFx0XHQuYWRkVG9nZ2xlKCh0b2dnbGUpID0+IHRvZ2dsZVxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FKVxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FID0gdmFsdWU7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkNvZGUgbGFuZ3VhZ2VzIHRvIGludGVycHJldCBhcyBtYXRoIG1vZGVcIilcblx0XHRcdC5zZXREZXNjKFwiQ29kZWJsb2NrIGxhbmd1YWdlcyB3aGVyZSB0aGUgd2hvbGUgY29kZSBibG9jayBzaG91bGQgYmUgdHJlYXRlZCBsaWtlIGEgbWF0aCBibG9jaywgc2VwYXJhdGVkIGJ5IGNvbW1hcy5cIilcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5mb3JjZU1hdGhMYW5ndWFnZXMpXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb3JjZU1hdGhMYW5ndWFnZXMpXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb3JjZU1hdGhMYW5ndWFnZXMgPSB2YWx1ZTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHR9KSk7XG5cdH1cblxuICBwcml2YXRlIGRpc3BsYXlTdHlsZVNldHRpbmdzKCl7XG4gICAgY29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG4gICAgY29udGFpbmVyRWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiTWF0aCBQbHVnaW4gU2V0dGluZ3NcIiB9KTtcblxuICAgIHRoaXMuYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbCxcIkludmVydCBkYXJrIGNvbG9ycyBpbiBkYXJrIG1vZGVcIixcIkludmVydCBkYXJrIGNvbG9ycyBpbiBkaWFncmFtcyAoZS5nLiBheGVzLCBhcnJvd3MpIHdoZW4gaW4gZGFyayBtb2RlLCBzbyB0aGF0IHRoZXkgYXJlIHZpc2libGUuXCIsdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSlcblxuXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG5cdFx0XHQuc2V0TmFtZShcIkNsZWFyIGNhY2hlZCBTVkdzXCIpXG5cdFx0XHQuc2V0RGVzYyhcIlNWR3MgcmVuZGVyZWQgd2l0aCBUaWtaSmF4IGFyZSBzdG9yZWQgaW4gYSBkYXRhYmFzZSwgc28gZGlhZ3JhbXMgZG9uJ3QgaGF2ZSB0byBiZSByZS1yZW5kZXJlZCBmcm9tIHNjcmF0Y2ggZXZlcnkgdGltZSB5b3Ugb3BlbiBhIHBhZ2UuIFVzZSB0aGlzIHRvIGNsZWFyIHRoZSBjYWNoZSBhbmQgZm9yY2UgYWxsIGRpYWdyYW1zIHRvIGJlIHJlLXJlbmRlcmVkLlwiKVxuXHRcdFx0LmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG5cdFx0XHRcdC5zZXRJY29uKFwidHJhc2hcIilcblx0XHRcdFx0LnNldFRvb2x0aXAoXCJDbGVhciBjYWNoZWQgU1ZHc1wiKVxuXHRcdFx0XHQub25DbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0bG9jYWxGb3JhZ2UuY2xlYXIoKGVycikgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdFx0XHRjb25zb2xlLmxvZyhlcnIpO1xuXHRcdFx0XHRcdFx0XHRuZXcgTm90aWNlKGVyciwgMzAwMCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdFx0bmV3IE5vdGljZShcIlRpa1pKYXg6IFN1Y2Nlc3NmdWxseSBjbGVhcmVkIGNhY2hlZCBTVkdzLlwiLCAzMDAwKTtcblx0XHRcdFx0XHRcdH1cbiAgICAgICAgICAgIFxuXHRcdFx0XHRcdH0pO1xuICAgICAgfSkpO1xuXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgLnNldE5hbWUoIFwiUmVuZGVyZWQgbnVtYmVyIGZvcm1hdFwiKVxuICAgICAgICAuc2V0RGVzYyhcIkNob29zZSBob3cgdG8gZm9ybWF0IG51bWJlcnMgaW4gdGhlIHJlc3VsdC5cIilcbiAgICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oJzEwMDAnLFwiZm9ybWF0dGVkIC4wMDBcIik7XG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKCcxMDAwMCcsXCJmb3JtYXR0ZWQgLjAwMDBcIik7XG4gICAgICAgICAgZHJvcGRvd24uYWRkT3B0aW9uKCcxMDAwMDAnLFwiZm9ybWF0dGVkIC4wMDAwMFwiKTtcbiAgICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5udW1iZXJGb3JtYXR0aW5nID0gdmFsdWU7XG4gICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcblxuXG4gICAgICBjb250YWluZXJFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJNYXRoIFBsdWdpbiBzdHlsZVwiIH0pO1xuXG4gICAgICB0aGlzLmFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbCwgXCJCYWNrZ3JvdW5kIENvbG9yXCIsIFwiU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yLlwiLCBcImJhY2tncm91bmRcIik7XG4gICAgICB0aGlzLmFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbCwgXCJFdmVuIFJvdyBCYWNrZ3JvdW5kIENvbG9yXCIsIFwiU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciBldmVuIHJvd3MuXCIsIFwiZXZlblJvd0JhY2tncm91bmRcIik7XG4gICAgICB0aGlzLmFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbCwgXCJPZGQgUm93IEJhY2tncm91bmQgQ29sb3JcIiwgXCJTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIG9kZCByb3dzLlwiLCBcIm9kZFJvd0JhY2tncm91bmRcIik7XG4gICAgICB0aGlzLmFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbCwgXCJpbmZvTW9kYWwgQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3IgdGhlIGluZm8gbW9kYWwuXCIsIFwiaW5mb01vZGFsQmFja2dyb3VuZFwiKTtcbiAgICAgIFxuICAgICAgdGhpcy5hZGRUZXh0U2V0dGluZyhjb250YWluZXJFbCwgXCJGb250IFNpemVcIiwgXCJTZXQgdGhlIGZvbnQgc2l6ZSBmb3IgdGhlIHJvd3MuXCIsIFwiZm9udFNpemVcIik7XG4gICAgICB0aGlzLmFkZFRleHRTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlJvdyBQYWRkaW5nXCIsIFwiU2V0IHRoZSBwYWRkaW5nIGZvciB0aGUgcm93cy5cIiwgXCJyb3dQYWRkaW5nXCIpO1xuICAgICAgdGhpcy5hZGRUZXh0U2V0dGluZyhjb250YWluZXJFbCwgXCJJY29uIFNpemVcIiwgXCJTZXQgdGhlIHNpemUgb2YgdGhlIGljb25zLlwiLCBcImljb25TaXplXCIpO1xuICBcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxuICAgICAgICAgIGJ1dHRvblxuICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoXCJXaXBlIEhpc3RvcnkgTW9kdWxlXCIpXG4gICAgICAgICAgICAuc2V0VG9vbHRpcChcIlJlc2V0IGFsbCBzZXR0aW5ncyB0byB0aGVpciBkZWZhdWx0IHZhbHVlc1wiKVxuICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeSA9IFtdO1xuICAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJIaXN0b3J5IHdhcyB3aXBlZC5cIilcbiAgICAgICAgICAgIH0pKTtcblxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxuICAgICAgICBidXR0b25cbiAgICAgICAgICAuc2V0QnV0dG9uVGV4dChcIlJlc2V0IHRvIERlZmF1bHRcIilcbiAgICAgICAgICAuc2V0VG9vbHRpcChcIlJlc2V0IGFsbCBzZXR0aW5ncyB0byB0aGVpciBkZWZhdWx0IHZhbHVlc1wiKVxuICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzID0geyAuLi5ERUZBVUxUX1NFVFRJTkdTIH07XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFwiU2V0dGluZ3MgaGF2ZSBiZWVuIHJlc2V0IHRvIGRlZmF1bHQuXCIpO1xuICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgIH0pKTtcblxuICB9XG4gIHByaXZhdGUgYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBhbnkpIHtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgIC5zZXROYW1lKG5hbWUpXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcbiAgICAgIC5hZGRDb2xvclBpY2tlcihjb2xvclBpY2tlciA9PiB7XG4gICAgICAgIGNvbG9yUGlja2VyLnNldFZhbHVlKHNldHRpbmdLZXkpO1xuICAgICAgICBjb2xvclBpY2tlci5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICBzZXR0aW5nS2V5ID0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICBwcml2YXRlIGFkZFRvZ2dsZVNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHNldHRpbmdLZXk6IGFueSkge1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUobmFtZSlcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxuICAgICAgLmFkZFRvZ2dsZSgodG9nZ2xlIDogYW55KSA9PiB7XG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZShzZXR0aW5nS2V5KVxuICAgICAgICB0b2dnbGUub25DaGFuZ2UoYXN5bmMgKHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICBzZXR0aW5nS2V5PSB2YWx1ZTtcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICB0aGlzLnVwZGF0ZVN0eWxlcygpO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG4gIHByaXZhdGUgYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHNldHRpbmdLZXk6IGFueSkge1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgLnNldE5hbWUobmFtZSlcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxuICAgICAgLmFkZFRleHQoKHRleHQ6IGFueSkgPT4ge1xuICAgICAgICB0ZXh0LnNldFBsYWNlaG9sZGVyKHNldHRpbmdLZXkpLnNldFZhbHVlKHNldHRpbmdLZXkpO1xuICAgICAgICB0ZXh0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgc2V0dGluZ0tleT0gdmFsdWU7XG4gICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICB1cGRhdGVTdHlsZXMoKSB7XG4gICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1yb3ctYmFja2dyb3VuZFwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5iYWNrZ3JvdW5kKTtcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1ldmVuLXJvdy1iYWNrZ3JvdW5kXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmV2ZW5Sb3dCYWNrZ3JvdW5kKTtcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1vZGQtcm93LWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3Mub2RkUm93QmFja2dyb3VuZCk7XG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0taW5mby1tb2RhbC1jb2x1bW4tYmFja2dyb3VuZFwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbmZvTW9kYWxCYWNrZ3JvdW5kKTtcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1mb250LXNpemVcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9udFNpemUpO1xuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLXJvdy1wYWRkaW5nXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLnJvd1BhZGRpbmcpO1xuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLWljb24tc2l6ZVwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5pY29uU2l6ZSk7XG59XG5cdGNyZWF0ZVNuaXBwZXRzRWRpdG9yKHNuaXBwZXRzU2V0dGluZzogU2V0dGluZykge1xuXHRcdGNvbnN0IGN1c3RvbUNTU1dyYXBwZXIgPSBzbmlwcGV0c1NldHRpbmcuY29udHJvbEVsLmNyZWF0ZURpdihcInNuaXBwZXRzLWVkaXRvci13cmFwcGVyXCIpO1xuXHRcdGNvbnN0IHNuaXBwZXRzRm9vdGVyID0gc25pcHBldHNTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVEaXYoXCJzbmlwcGV0cy1mb290ZXJcIik7XG5cdFx0Y29uc3QgdmFsaWRpdHkgPSBzbmlwcGV0c0Zvb3Rlci5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3ItdmFsaWRpdHlcIik7XG5cblx0XHRjb25zdCB2YWxpZGl0eUluZGljYXRvciA9IG5ldyBFeHRyYUJ1dHRvbkNvbXBvbmVudCh2YWxpZGl0eSk7XG5cdFx0dmFsaWRpdHlJbmRpY2F0b3Iuc2V0SWNvbihcImNoZWNrbWFya1wiKVxuXHRcdFx0LmV4dHJhU2V0dGluZ3NFbC5hZGRDbGFzcyhcInNuaXBwZXRzLWVkaXRvci12YWxpZGl0eS1pbmRpY2F0b3JcIik7XG5cblx0XHRjb25zdCB2YWxpZGl0eVRleHQgPSB2YWxpZGl0eS5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3ItdmFsaWRpdHktdGV4dFwiKTtcblx0XHR2YWxpZGl0eVRleHQuYWRkQ2xhc3MoXCJzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb25cIik7XG5cdFx0dmFsaWRpdHlUZXh0LnN0eWxlLnBhZGRpbmcgPSBcIjBcIjtcblxuXG5cdFx0ZnVuY3Rpb24gdXBkYXRlVmFsaWRpdHlJbmRpY2F0b3Ioc3VjY2VzczogYm9vbGVhbikge1xuXHRcdFx0dmFsaWRpdHlJbmRpY2F0b3Iuc2V0SWNvbihzdWNjZXNzID8gXCJjaGVja21hcmtcIiA6IFwiY3Jvc3NcIik7XG5cdFx0XHR2YWxpZGl0eUluZGljYXRvci5leHRyYVNldHRpbmdzRWwucmVtb3ZlQ2xhc3Moc3VjY2VzcyA/IFwiaW52YWxpZFwiIDogXCJ2YWxpZFwiKTtcblx0XHRcdHZhbGlkaXR5SW5kaWNhdG9yLmV4dHJhU2V0dGluZ3NFbC5hZGRDbGFzcyhzdWNjZXNzID8gXCJ2YWxpZFwiIDogXCJpbnZhbGlkXCIpO1xuXHRcdFx0dmFsaWRpdHlUZXh0LnNldFRleHQoc3VjY2VzcyA/IFwiU2F2ZWRcIiA6IFwiSW52YWxpZCBzeW50YXguIENoYW5nZXMgbm90IHNhdmVkXCIpO1xuXHRcdH1cblxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGJhc2ljU2V0dXA7XG5cblx0XHRjb25zdCBjaGFuZ2UgPSBFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKGFzeW5jICh2OiBWaWV3VXBkYXRlKSA9PiB7XG5cdFx0XHRpZiAodi5kb2NDaGFuZ2VkKSB7XG5cdFx0XHRcdGNvbnN0IHNuaXBwZXRzID0gdi5zdGF0ZS5kb2MudG9TdHJpbmcoKTtcblx0XHRcdFx0bGV0IHN1Y2Nlc3MgPSB0cnVlO1xuXG5cdFx0XHRcdGxldCBzbmlwcGV0VmFyaWFibGVzO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHNuaXBwZXRWYXJpYWJsZXMgPSBhd2FpdCBwYXJzZVNuaXBwZXRWYXJpYWJsZXModGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlcylcblx0XHRcdFx0XHRhd2FpdCBwYXJzZVNuaXBwZXRzKHNuaXBwZXRzLCBzbmlwcGV0VmFyaWFibGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHN1Y2Nlc3MgPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHN1Y2Nlc3MpO1xuXG5cdFx0XHRcdGlmICghc3VjY2VzcykgcmV0dXJuO1xuXG5cdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzID0gc25pcHBldHM7XG5cdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuICAgIFxuXHRcdGV4dGVuc2lvbnMucHVzaChjaGFuZ2UpO1xuXG5cdFx0dGhpcy5zbmlwcGV0c0VkaXRvciA9IGNyZWF0ZUNNRWRpdG9yKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzLCBleHRlbnNpb25zKTtcblx0XHRjdXN0b21DU1NXcmFwcGVyLmFwcGVuZENoaWxkKHRoaXMuc25pcHBldHNFZGl0b3IuZG9tKTtcblxuXG5cdFx0Y29uc3QgYnV0dG9uc0RpdiA9IHNuaXBwZXRzRm9vdGVyLmNyZWF0ZURpdihcInNuaXBwZXRzLWVkaXRvci1idXR0b25zXCIpO1xuXHRcdGNvbnN0IHJlc2V0ID0gbmV3IEJ1dHRvbkNvbXBvbmVudChidXR0b25zRGl2KTtcblx0XHRyZXNldC5zZXRJY29uKFwic3dpdGNoXCIpXG5cdFx0XHQuc2V0VG9vbHRpcChcIlJlc2V0IHRvIGRlZmF1bHQgc25pcHBldHNcIilcblx0XHRcdC5vbkNsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdFx0bmV3IENvbmZpcm1hdGlvbk1vZGFsKHRoaXMucGx1Z2luLmFwcCxcblx0XHRcdFx0XHRcIkFyZSB5b3Ugc3VyZT8gVGhpcyB3aWxsIGRlbGV0ZSBhbnkgY3VzdG9tIHNuaXBwZXRzIHlvdSBoYXZlIHdyaXR0ZW4uXCIsXG5cdFx0XHRcdFx0YnV0dG9uID0+IGJ1dHRvblxuXHRcdFx0XHRcdFx0LnNldEJ1dHRvblRleHQoXCJSZXNldCB0byBkZWZhdWx0IHNuaXBwZXRzXCIpXG5cdFx0XHRcdFx0XHQuc2V0V2FybmluZygpLFxuXHRcdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNFZGl0b3Iuc2V0U3RhdGUoRWRpdG9yU3RhdGUuY3JlYXRlKHsgZG9jOiBERUZBVUxUX1NOSVBQRVRTLCBleHRlbnNpb25zOiBleHRlbnNpb25zIH0pKTtcblx0XHRcdFx0XHRcdHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHRydWUpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cyA9IERFRkFVTFRfU05JUFBFVFM7XG5cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0KS5vcGVuKCk7XG5cdFx0XHR9KTtcblxuXHRcdGNvbnN0IHJlbW92ZSA9IG5ldyBCdXR0b25Db21wb25lbnQoYnV0dG9uc0Rpdik7XG5cdFx0cmVtb3ZlLnNldEljb24oXCJ0cmFzaFwiKVxuXHRcdFx0LnNldFRvb2x0aXAoXCJSZW1vdmUgYWxsIHNuaXBwZXRzXCIpXG5cdFx0XHQub25DbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdG5ldyBDb25maXJtYXRpb25Nb2RhbCh0aGlzLnBsdWdpbi5hcHAsXG5cdFx0XHRcdFx0XCJBcmUgeW91IHN1cmU/IFRoaXMgd2lsbCBkZWxldGUgYW55IGN1c3RvbSBzbmlwcGV0cyB5b3UgaGF2ZSB3cml0dGVuLlwiLFxuXHRcdFx0XHRcdGJ1dHRvbiA9PiBidXR0b25cblx0XHRcdFx0XHRcdC5zZXRCdXR0b25UZXh0KFwiUmVtb3ZlIGFsbCBzbmlwcGV0c1wiKVxuXHRcdFx0XHRcdFx0LnNldFdhcm5pbmcoKSxcblx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGBbXG5cbl1gO1xuXHRcdFx0XHRcdFx0dGhpcy5zbmlwcGV0c0VkaXRvci5zZXRTdGF0ZShFZGl0b3JTdGF0ZS5jcmVhdGUoeyBkb2M6IHZhbHVlLCBleHRlbnNpb25zOiBleHRlbnNpb25zIH0pKTtcblx0XHRcdFx0XHRcdHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHRydWUpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cyA9IHZhbHVlO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpLm9wZW4oKTtcblx0XHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIENvbmZpcm1hdGlvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xuXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBib2R5OiBzdHJpbmcsIGJ1dHRvbkNhbGxiYWNrOiAoYnV0dG9uOiBCdXR0b25Db21wb25lbnQpID0+IHZvaWQsIGNsaWNrQ2FsbGJhY2s6ICgpID0+IFByb21pc2U8dm9pZD4pIHtcblx0XHRzdXBlcihhcHApO1xuXG5cdFx0dGhpcy5jb250ZW50RWwuYWRkQ2xhc3MoXCJsYXRleC1zdWl0ZS1jb25maXJtYXRpb24tbW9kYWxcIik7XG5cdFx0dGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYm9keSB9KTtcblxuXG5cdFx0bmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpXG5cdFx0XHQuYWRkQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0XHRcdGJ1dHRvbkNhbGxiYWNrKGJ1dHRvbik7XG5cdFx0XHRcdGJ1dHRvbi5vbkNsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCBjbGlja0NhbGxiYWNrKCk7XG5cdFx0XHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pXG5cdFx0XHQuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cblx0XHRcdFx0LnNldEJ1dHRvblRleHQoXCJDYW5jZWxcIilcblx0XHRcdFx0Lm9uQ2xpY2soKCkgPT4gdGhpcy5jbG9zZSgpKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQ01FZGl0b3IoY29udGVudDogc3RyaW5nLCBleHRlbnNpb25zOiBFeHRlbnNpb25bXSkge1xuXHRjb25zdCB2aWV3ID0gbmV3IEVkaXRvclZpZXcoe1xuXHRcdHN0YXRlOiBFZGl0b3JTdGF0ZS5jcmVhdGUoeyBkb2M6IGNvbnRlbnQsIGV4dGVuc2lvbnMgfSksXG5cdH0pO1xuXG5cdHJldHVybiB2aWV3O1xufVxuXG4iXX0=