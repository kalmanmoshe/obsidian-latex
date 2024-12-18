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
            console.log('this.plugin.settings.snippetsEnabled', this.plugin.settings.snippetsEnabled);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3NldHRpbmdzL3RlbXBDb2RlUnVubmVyRmlsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsV0FBVyxFQUFhLE1BQU0sbUJBQW1CLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBYyxNQUFNLGtCQUFrQixDQUFDO0FBQzFELE9BQU8sRUFBTyxlQUFlLEVBQUMsTUFBTSxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNsSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN0QsT0FBTyxLQUFLLFdBQVcsTUFBTSxhQUFhLENBQUM7QUFFM0MsTUFBTSxPQUFPLG9CQUFxQixTQUFRLGdCQUFnQjtJQUN6RCxNQUFNLENBQW1CO0lBQ3pCLGNBQWMsQ0FBYTtJQUMzQixpQkFBaUIsQ0FBYztJQUMvQix5QkFBeUIsQ0FBYztJQUV2QyxZQUFZLEdBQVEsRUFBRSxNQUF3QjtRQUM3QyxLQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25CLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ25CLElBQUksQ0FBQztZQUNILFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUUs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LENBQUMsQ0FBQztZQUN2QixNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssSUFBSSxFQUFFO2dCQUN6QixNQUFNLGFBQWEsRUFBRSxDQUFDO2dCQUN0QixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDZCxDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQzthQUNELFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU07YUFDekIsYUFBYSxDQUFDLFFBQVEsQ0FBQzthQUN2QixPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNqQyxDQUFDO0NBQ0Q7QUFFRCxTQUFTLGNBQWMsQ0FBQyxPQUFlLEVBQUUsVUFBdUI7SUFDL0QsTUFBTSxJQUFJLEdBQUcsSUFBSSxVQUFVLENBQUM7UUFDM0IsS0FBSyxFQUFFLFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDO0tBQ3ZELENBQUMsQ0FBQztJQUVILE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEVkaXRvclN0YXRlLCBFeHRlbnNpb24gfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1VwZGF0ZSB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcbmltcG9ydCB7IEFwcCwgQnV0dG9uQ29tcG9uZW50LE5vdGljZSwgRXh0cmFCdXR0b25Db21wb25lbnQsIE1vZGFsLCBQbHVnaW5TZXR0aW5nVGFiLCBTZXR0aW5nLCBkZWJvdW5jZSwgc2V0SWNvbiB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgeyBwYXJzZVNuaXBwZXRWYXJpYWJsZXMsIHBhcnNlU25pcHBldHMgfSBmcm9tIFwic3JjL3NuaXBwZXRzL3BhcnNlXCI7XHJcbmltcG9ydCB7IERFRkFVTFRfU05JUFBFVFMgfSBmcm9tIFwic3JjL3V0aWxzL2RlZmF1bHRfc25pcHBldHNcIjtcclxuaW1wb3J0IExhdGV4U3VpdGVQbHVnaW4gZnJvbSBcIi4uL21haW5cIjtcclxuaW1wb3J0IHsgREVGQVVMVF9TRVRUSU5HUyB9IGZyb20gXCIuL3NldHRpbmdzXCI7XHJcbmltcG9ydCB7IEZpbGVTdWdnZXN0IH0gZnJvbSBcIi4vdWkvZmlsZV9zdWdnZXN0XCI7XHJcbmltcG9ydCB7IGJhc2ljU2V0dXAgfSBmcm9tIFwiLi91aS9zbmlwcGV0c19lZGl0b3IvZXh0ZW5zaW9uc1wiO1xyXG5pbXBvcnQgKiBhcyBsb2NhbEZvcmFnZSBmcm9tIFwibG9jYWxmb3JhZ2VcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBMYXRleFN1aXRlU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG5cdHBsdWdpbjogTGF0ZXhTdWl0ZVBsdWdpbjtcclxuXHRzbmlwcGV0c0VkaXRvcjogRWRpdG9yVmlldztcclxuXHRzbmlwcGV0c0ZpbGVMb2NFbDogSFRNTEVsZW1lbnQ7XHJcblx0c25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbDogSFRNTEVsZW1lbnQ7XHJcblxyXG5cdGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IExhdGV4U3VpdGVQbHVnaW4pIHtcclxuXHRcdHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuXHRcdHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gICAgdHJ5IHtcclxuICAgICAgbG9jYWxGb3JhZ2UuY29uZmlnKHsgbmFtZTogXCJUaWt6SmF4XCIsIHN0b3JlTmFtZTogXCJzdmdJbWFnZXNcIiB9KTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKGVycm9yKTtcclxuICAgIH1cclxuXHR9XHJcblxyXG5cdGhpZGUoKSB7XHJcblx0XHR0aGlzLnNuaXBwZXRzRWRpdG9yPy5kZXN0cm95KCk7XHJcblx0fVxyXG5cclxuXHRhZGRIZWFkaW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBpY29uID0gXCJtYXRoXCIpIHtcclxuXHRcdGNvbnN0IGhlYWRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShuYW1lKS5zZXRIZWFkaW5nKCk7XHJcblxyXG5cdFx0Y29uc3QgcGFyZW50RWwgPSBoZWFkaW5nLnNldHRpbmdFbDtcclxuXHRcdGNvbnN0IGljb25FbCA9IHBhcmVudEVsLmNyZWF0ZURpdigpO1xyXG5cdFx0c2V0SWNvbihpY29uRWwsIGljb24pO1xyXG5cdFx0aWNvbkVsLmFkZENsYXNzKFwibGF0ZXgtc3VpdGUtc2V0dGluZ3MtaWNvblwiKTtcclxuXHJcblx0XHRwYXJlbnRFbC5wcmVwZW5kKGljb25FbCk7XHJcblx0fVxyXG5cclxuXHRkaXNwbGF5KCk6IHZvaWQge1xyXG5cdFx0Y29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcclxuXHRcdGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcblxyXG5cdFx0dGhpcy5kaXNwbGF5U25pcHBldFNldHRpbmdzKCk7XHJcblx0XHR0aGlzLmRpc3BsYXlDb25jZWFsU2V0dGluZ3MoKTtcclxuXHRcdHRoaXMuZGlzcGxheUNvbG9ySGlnaGxpZ2h0QnJhY2tldHNTZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5kaXNwbGF5UG9wdXBQcmV2aWV3U2V0dGluZ3MoKTtcclxuXHRcdHRoaXMuZGlzcGxheUF1dG9mcmFjdGlvblNldHRpbmdzKCk7XHJcblx0XHR0aGlzLmRpc3BsYXlNYXRyaXhTaG9ydGN1dHNTZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5kaXNwbGF5VGFib3V0U2V0dGluZ3MoKTtcclxuXHRcdHRoaXMuZGlzcGxheUF1dG9FbmxhcmdlQnJhY2tldHNTZXR0aW5ncygpO1xyXG5cdFx0dGhpcy5kaXNwbGF5QWR2YW5jZWRTbmlwcGV0U2V0dGluZ3MoKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGlzcGxheVNuaXBwZXRTZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJTbmlwcGV0c1wiLCBcImJhbGxwZW5cIik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgc25pcHBldHMgYXJlIGVuYWJsZWQuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0c0VuYWJsZWQpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNFbmFibGVkID0gdmFsdWU7XHJcblx0XHRcdFx0XHRjb25zb2xlLmxvZygndGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNFbmFibGVkJyAsdGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNFbmFibGVkIClcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldHNTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiU25pcHBldHNcIilcclxuXHRcdFx0LnNldERlc2MoXCJFbnRlciBzbmlwcGV0cyBoZXJlLiAgUmVtZW1iZXIgdG8gYWRkIGEgY29tbWEgYWZ0ZXIgZWFjaCBzbmlwcGV0LCBhbmQgZXNjYXBlIGFsbCBiYWNrc2xhc2hlcyB3aXRoIGFuIGV4dHJhIFxcXFwuIExpbmVzIHN0YXJ0aW5nIHdpdGggXFxcIi8vXFxcIiB3aWxsIGJlIHRyZWF0ZWQgYXMgY29tbWVudHMgYW5kIGlnbm9yZWQuXCIpXHJcblx0XHRcdC5zZXRDbGFzcyhcInNuaXBwZXRzLXRleHQtYXJlYVwiKTtcclxuXHJcblxyXG5cdFx0dGhpcy5jcmVhdGVTbmlwcGV0c0VkaXRvcihzbmlwcGV0c1NldHRpbmcpO1xyXG5cclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJMb2FkIHNuaXBwZXRzIGZyb20gZmlsZSBvciBmb2xkZXJcIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGV0aGVyIHRvIGxvYWQgc25pcHBldHMgZnJvbSBhIHNwZWNpZmllZCBmaWxlLCBvciBmcm9tIGFsbCBmaWxlcyB3aXRoaW4gYSBmb2xkZXIgKGluc3RlYWQgb2YgZnJvbSB0aGUgcGx1Z2luIHNldHRpbmdzKS5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0c25pcHBldHNTZXR0aW5nLnNldHRpbmdFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCB2YWx1ZSk7XHJcblx0XHRcdFx0XHRpZiAodGhpcy5zbmlwcGV0c0ZpbGVMb2NFbCAhPSB1bmRlZmluZWQpXHJcblx0XHRcdFx0XHRcdHRoaXMuc25pcHBldHNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIXZhbHVlKTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cclxuXHRcdGNvbnN0IHNuaXBwZXRzRmlsZUxvY0Rlc2MgPSBuZXcgRG9jdW1lbnRGcmFnbWVudCgpO1xyXG5cdFx0c25pcHBldHNGaWxlTG9jRGVzYy5jcmVhdGVEaXYoe30sIGRpdiA9PiB7XHJcblx0XHRcdGRpdi5pbm5lckhUTUwgPSBgXHJcblx0XHRcdFRoZSBmaWxlIG9yIGZvbGRlciB0byBsb2FkIHNuaXBwZXRzIGZyb20uIFRoZSBmaWxlIG9yIGZvbGRlciBtdXN0IGJlIHdpdGhpbiB5b3VyIHZhdWx0LCBhbmQgbm90IHdpdGhpbiBhIGhpZGRlbiBmb2xkZXIgKHN1Y2ggYXMgPGNvZGU+Lm9ic2lkaWFuLzwvY29kZT4pLmA7XHJcblx0XHR9KTtcclxuXHJcblx0XHRjb25zdCBzbmlwcGV0c0ZpbGVMb2MgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgIC5zZXROYW1lKFwiU25pcHBldHMgZmlsZSBvciBmb2xkZXIgbG9jYXRpb25cIilcclxuICAgIC5zZXREZXNjKHNuaXBwZXRzRmlsZUxvY0Rlc2MpO1xyXG5cclxuICAgIGxldCBpbnB1dEVsOiBIVE1MSW5wdXRFbGVtZW50IHwgdW5kZWZpbmVkOyAvLyBEZWZpbmUgd2l0aCBhIHBvc3NpYmxlIHVuZGVmaW5lZCB0eXBlXHJcblxyXG4gICAgc25pcHBldHNGaWxlTG9jLmFkZFNlYXJjaCgoY29tcG9uZW50KSA9PiB7XHJcbiAgICAgICAgY29tcG9uZW50XHJcbiAgICAgICAgICAgIC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRzRmlsZUxvY2F0aW9uKVxyXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNGaWxlTG9jYXRpb24pXHJcbiAgICAgICAgICAgIC5vbkNoYW5nZShcclxuICAgICAgICAgICAgICAgIGRlYm91bmNlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzRmlsZUxvY2F0aW9uID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKHRydWUpO1xyXG4gICAgICAgICAgICAgICAgfSwgNTAwLCB0cnVlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgXHJcbiAgICAgICAgLy8gRW5zdXJlIGlucHV0RWwgaXMgYXNzaWduZWRcclxuICAgICAgICBpbnB1dEVsID0gY29tcG9uZW50LmlucHV0RWwgYXMgSFRNTElucHV0RWxlbWVudDtcclxuICAgICAgICBpbnB1dEVsLmFkZENsYXNzKFwibGF0ZXgtc3VpdGUtbG9jYXRpb24taW5wdXQtZWxcIik7XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gRW5zdXJlIGlucHV0RWwgaXMgZGVmaW5lZCBiZWZvcmUgcGFzc2luZyB0byBGaWxlU3VnZ2VzdFxyXG4gICAgaWYgKGlucHV0RWwpIHtcclxuICAgICAgICB0aGlzLnNuaXBwZXRzRmlsZUxvY0VsID0gc25pcHBldHNGaWxlTG9jLnNldHRpbmdFbDtcclxuICAgICAgICBuZXcgRmlsZVN1Z2dlc3QodGhpcy5hcHAsIGlucHV0RWwpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiSW5wdXQgZWxlbWVudCBpcyB1bmRlZmluZWQuXCIpO1xyXG4gICAgfVxyXG5cclxuXHJcblx0XHQvLyBIaWRlIHNldHRpbmdzIHRoYXQgYXJlIG5vdCByZWxldmFudCB3aGVuIFwibG9hZFNuaXBwZXRzRnJvbUZpbGVcIiBpcyBzZXQgdG8gdHJ1ZS9mYWxzZVxyXG5cdFx0Y29uc3QgbG9hZFNuaXBwZXRzRnJvbUZpbGUgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZTtcclxuXHRcdHNuaXBwZXRzU2V0dGluZy5zZXR0aW5nRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgbG9hZFNuaXBwZXRzRnJvbUZpbGUpO1xyXG5cdFx0dGhpcy5zbmlwcGV0c0ZpbGVMb2NFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCAhbG9hZFNuaXBwZXRzRnJvbUZpbGUpO1xyXG5cclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJLZXkgdHJpZ2dlciBmb3Igbm9uLWF1dG8gc25pcHBldHNcIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGF0IGtleSB0byBwcmVzcyB0byBleHBhbmQgbm9uLWF1dG8gc25pcHBldHMuXCIpXHJcblx0XHRcdC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+IGRyb3Bkb3duXHJcblx0XHRcdFx0LmFkZE9wdGlvbihcIlRhYlwiLCBcIlRhYlwiKVxyXG5cdFx0XHRcdC5hZGRPcHRpb24oXCIgXCIsIFwiU3BhY2VcIilcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHNUcmlnZ2VyKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzVHJpZ2dlciA9IHZhbHVlIGFzIFwiVGFiXCIgfFxyXG5cdFx0XHRcdFx0XHRcIiBcIjtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pXHJcblx0XHRcdCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlDb25jZWFsU2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiQ29uY2VhbFwiLCBcIm1hdGgtaW50ZWdyYWwteFwiKTtcclxuXHJcblx0XHRjb25zdCBmcmFnbWVudCA9IG5ldyBEb2N1bWVudEZyYWdtZW50KCk7XHJcblx0XHRmcmFnbWVudC5jcmVhdGVEaXYoe30sIGRpdiA9PiBkaXYuc2V0VGV4dChcIk1ha2UgZXF1YXRpb25zIG1vcmUgcmVhZGFibGUgYnkgaGlkaW5nIExhVGVYIHN5bnRheCBhbmQgaW5zdGVhZCBkaXNwbGF5aW5nIGl0IGluIGEgcHJldHR5IGZvcm1hdC5cIikpO1xyXG5cdFx0ZnJhZ21lbnQuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LmlubmVySFRNTCA9IGBcclxuXHRcdFx0ZS5nLiA8Y29kZT5cXFxcZG90e3h9XnsyfSArIFxcXFxkb3R7eX1eezJ9PC9jb2RlPiB3aWxsIGRpc3BsYXkgYXMg4bqLwrIgKyDhuo/CsiwgYW5kIDxjb2RlPlxcXFxzcXJ0eyAxLVxcXFxiZXRhXnsyfSB9PC9jb2RlPiB3aWxsIGRpc3BsYXkgYXMg4oiaeyAxLc6ywrIgfS5cclxuXHRcdGApO1xyXG5cdFx0ZnJhZ21lbnQuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJMYVRlWCBiZW5lYXRoIHRoZSBjdXJzb3Igd2lsbCBiZSByZXZlYWxlZC5cIikpO1xyXG5cdFx0ZnJhZ21lbnQuY3JlYXRlRWwoXCJiclwiKTtcclxuXHRcdGZyYWdtZW50LmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiRGlzYWJsZWQgYnkgZGVmYXVsdCB0byBub3QgY29uZnVzZSBuZXcgdXNlcnMuIEhvd2V2ZXIsIEkgcmVjb21tZW5kIHR1cm5pbmcgdGhpcyBvbiBvbmNlIHlvdSBhcmUgY29tZm9ydGFibGUgd2l0aCB0aGUgcGx1Z2luIVwiKSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhmcmFnbWVudClcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxFbmFibGVkKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmNvbmNlYWxFbmFibGVkID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KVxyXG5cdFx0XHQpO1xyXG5cclxuXHRcdGNvbnN0IGZyYWdtZW50MiA9IG5ldyBEb2N1bWVudEZyYWdtZW50KCk7XHJcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJIb3cgbG9uZyB0byBkZWxheSB0aGUgcmV2ZWFsIG9mIExhVGVYIGZvciwgaW4gbWlsbGlzZWNvbmRzLCB3aGVuIHRoZSBjdXJzb3IgbW92ZXMgb3ZlciBMYVRlWC4gRGVmYXVsdHMgdG8gMCAoTGFUZVggdW5kZXIgdGhlIGN1cnNvciBpcyByZXZlYWxlZCBpbW1lZGlhdGVseSkuXCIpKTtcclxuXHRcdGZyYWdtZW50Mi5jcmVhdGVFbChcImJyXCIpO1xyXG5cdFx0ZnJhZ21lbnQyLmNyZWF0ZURpdih7fSwgZGl2ID0+IGRpdi5zZXRUZXh0KFwiQ2FuIGJlIHNldCB0byBhIHBvc2l0aXZlIG51bWJlciwgZS5nLiAzMDAsIHRvIGRlbGF5IHRoZSByZXZlYWwgb2YgTGFUZVgsIG1ha2luZyBpdCBtdWNoIGVhc2llciB0byBuYXZpZ2F0ZSBlcXVhdGlvbnMgdXNpbmcgYXJyb3cga2V5cy5cIikpO1xyXG5cdFx0ZnJhZ21lbnQyLmNyZWF0ZUVsKFwiYnJcIik7XHJcblx0XHRmcmFnbWVudDIuY3JlYXRlRGl2KHt9LCBkaXYgPT4gZGl2LnNldFRleHQoXCJNdXN0IGJlIGFuIGludGVnZXIg4omlIDAuXCIpKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJSZXZlYWwgZGVsYXkgKG1zKVwiKVxyXG5cdFx0XHQuc2V0RGVzYyhmcmFnbWVudDIpXHJcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihTdHJpbmcoREVGQVVMVF9TRVRUSU5HUy5jb25jZWFsUmV2ZWFsVGltZW91dCkpXHJcblx0XHRcdFx0LnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb25jZWFsUmV2ZWFsVGltZW91dCkpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKHZhbHVlID0+IHtcclxuXHRcdFx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgdmFsdWUgaXMgYSBub24tbmVnYXRpdmUgaW50ZWdlclxyXG5cdFx0XHRcdFx0Y29uc3Qgb2sgPSAvXlxcZCskLy50ZXN0KHZhbHVlKTtcclxuXHRcdFx0XHRcdGlmIChvaykge1xyXG5cdFx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb25jZWFsUmV2ZWFsVGltZW91dCA9IE51bWJlcih2YWx1ZSk7XHJcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdH0pXHJcblx0XHRcdCk7XHJcblxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5Q29sb3JIaWdobGlnaHRCcmFja2V0c1NldHRpbmdzKCkge1xyXG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkhpZ2hsaWdodCBhbmQgY29sb3IgYnJhY2tldHNcIiwgXCJwYXJlbnRoZXNlc1wiKTtcclxuICAgIHRoaXMuYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbCxcIkNvbG9yIHBhaXJlZCBicmFja2V0c1wiLFwiV2hldGhlciB0byBjb2xvcml6ZSBtYXRjaGluZyBicmFja2V0cy5cIix0aGlzLnBsdWdpbi5zZXR0aW5ncy5jb2xvclBhaXJlZEJyYWNrZXRzRW5hYmxlZClcclxuICAgIHRoaXMuYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbCxcIkhpZ2hsaWdodCBtYXRjaGluZyBicmFja2V0IGJlbmVhdGggY3Vyc29yXCIsXCJXaGVuIHRoZSBjdXJzb3IgaXMgYWRqYWNlbnQgdG8gYSBicmFja2V0LCBoaWdobGlnaHQgdGhlIG1hdGNoaW5nIGJyYWNrZXQuXCIsdGhpcy5wbHVnaW4uc2V0dGluZ3MuaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNFbmFibGVkKVxyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5UG9wdXBQcmV2aWV3U2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiTWF0aCBwb3B1cCBwcmV2aWV3XCIsIFwic3VwZXJzY3JpcHRcIik7XHJcblxyXG5cdFx0Y29uc3QgcG9wdXBfZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XHJcblx0XHRjb25zdCBwb3B1cF9saW5lMSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcblx0XHRwb3B1cF9saW5lMS5zZXRUZXh0KFwiV2hlbiBpbnNpZGUgYW4gZXF1YXRpb24sIHNob3cgYSBwb3B1cCBwcmV2aWV3IHdpbmRvdyBvZiB0aGUgcmVuZGVyZWQgbWF0aC5cIik7XHJcblx0XHRjb25zdCBwb3B1cF9zcGFjZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJiclwiKTtcclxuXHRcdGNvbnN0IHBvcHVwX2xpbmUyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuXHRcdHBvcHVwX2xpbmUyLnNldFRleHQoXCJUaGUgcG9wdXAgcHJldmlldyB3aWxsIGJlIHNob3duIGZvciBhbGwgaW5saW5lIG1hdGggZXF1YXRpb25zLCBhcyB3ZWxsIGFzIGZvciBibG9jayBtYXRoIGVxdWF0aW9ucyBpbiBTb3VyY2UgbW9kZS5cIik7XHJcblx0XHRwb3B1cF9mcmFnbWVudC5hcHBlbmQocG9wdXBfbGluZTEsIHBvcHVwX3NwYWNlLCBwb3B1cF9saW5lMik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhwb3B1cF9mcmFnbWVudClcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdGhQcmV2aWV3RW5hYmxlZClcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiUG9zaXRpb25cIilcclxuXHRcdFx0LnNldERlc2MoXCJXaGVyZSB0byBkaXNwbGF5IHRoZSBwb3B1cCBwcmV2aWV3IHJlbGF0aXZlIHRvIHRoZSBlcXVhdGlvbiBzb3VyY2UuXCIpXHJcblx0XHRcdC5hZGREcm9wZG93bigoZHJvcGRvd24pID0+IGRyb3Bkb3duXHJcblx0XHRcdFx0LmFkZE9wdGlvbihcIkFib3ZlXCIsIFwiQWJvdmVcIilcclxuXHRcdFx0XHQuYWRkT3B0aW9uKFwiQmVsb3dcIiwgXCJCZWxvd1wiKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld1Bvc2l0aW9uSXNBYm92ZSA/IFwiQWJvdmVcIiA6IFwiQmVsb3dcIilcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRoUHJldmlld1Bvc2l0aW9uSXNBYm92ZSA9ICh2YWx1ZSA9PT0gXCJBYm92ZVwiKTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pXHJcblx0XHRcdCk7XHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlBdXRvZnJhY3Rpb25TZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBdXRvLWZyYWN0aW9uXCIsIFwibWF0aC14LWRpdmlkZS15LTJcIik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgYXV0by1mcmFjdGlvbiBpcyBlbmFibGVkLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uRW5hYmxlZClcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25FbmFibGVkID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRnJhY3Rpb24gc3ltYm9sXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiVGhlIGZyYWN0aW9uIHN5bWJvbCB0byB1c2UgaW4gdGhlIHJlcGxhY2VtZW50LiBlLmcuIFxcXFxmcmFjLCBcXFxcZGZyYWMsIFxcXFx0ZnJhY1wiKVxyXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5hdXRvZnJhY3Rpb25TeW1ib2wpXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvblN5bWJvbClcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25TeW1ib2wgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkV4Y2x1ZGVkIGVudmlyb25tZW50c1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBlbnZpcm9ubWVudHMgdG8gZXhjbHVkZSBhdXRvLWZyYWN0aW9uIGZyb20gcnVubmluZyBpbi4gRm9yIGV4YW1wbGUsIHRvIGV4Y2x1ZGUgYXV0by1mcmFjdGlvbiBmcm9tIHJ1bm5pbmcgd2hpbGUgaW5zaWRlIGFuIGV4cG9uZW50LCBzdWNoIGFzIGVeey4uLn0sIHVzZSAgW1xcXCJee1xcXCIsIFxcXCJ9XFxcIl1cIilcclxuXHRcdFx0LmFkZFRleHRBcmVhKHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihcIlsgW1xcXCJee1xcXCIsIFxcXCJ9XSBdXCIpXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9mcmFjdGlvbkV4Y2x1ZGVkRW52cylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25FeGNsdWRlZEVudnMgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiQnJlYWtpbmcgY2hhcmFjdGVyc1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBjaGFyYWN0ZXJzIHRoYXQgZGVub3RlIHRoZSBzdGFydC9lbmQgb2YgYSBmcmFjdGlvbi4gZS5nLiBpZiArIGlzIGluY2x1ZGVkIGluIHRoZSBsaXN0LCBcXFwiYStiL2NcXFwiIHdpbGwgZXhwYW5kIHRvIFxcXCJhK1xcXFxmcmFje2J9e2N9XFxcIi4gSWYgKyBpcyBub3QgaW4gdGhlIGxpc3QsIGl0IHdpbGwgZXhwYW5kIHRvIFxcXCJcXFxcZnJhY3thK2J9e2N9XFxcIi5cIilcclxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuYXV0b2ZyYWN0aW9uQnJlYWtpbmdDaGFycylcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b2ZyYWN0aW9uQnJlYWtpbmdDaGFycylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvZnJhY3Rpb25CcmVha2luZ0NoYXJzID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cdH1cclxuXHJcblx0cHJpdmF0ZSBkaXNwbGF5TWF0cml4U2hvcnRjdXRzU2V0dGluZ3MoKSB7XHJcblx0XHRjb25zdCBjb250YWluZXJFbCA9IHRoaXMuY29udGFpbmVyRWw7XHJcblx0XHR0aGlzLmFkZEhlYWRpbmcoY29udGFpbmVyRWwsIFwiTWF0cml4IHNob3J0Y3V0c1wiLCBcImJyYWNrZXRzLWNvbnRhaW5cIik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgbWF0cml4IHNob3J0Y3V0cyBhcmUgZW5hYmxlZC5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXHJcblx0XHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLm1hdHJpeFNob3J0Y3V0c0VuYWJsZWQpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MubWF0cml4U2hvcnRjdXRzRW5hYmxlZCA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkVudmlyb25tZW50c1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkEgbGlzdCBvZiBlbnZpcm9ubWVudCBuYW1lcyB0byBydW4gdGhlIG1hdHJpeCBzaG9ydGN1dHMgaW4sIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXHJcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLm1hdHJpeFNob3J0Y3V0c0Vudk5hbWVzKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbnZOYW1lcylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5tYXRyaXhTaG9ydGN1dHNFbnZOYW1lcyA9IHZhbHVlO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHJcblx0fVxyXG5cclxuXHRwcml2YXRlIGRpc3BsYXlUYWJvdXRTZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJUYWJvdXRcIiwgXCJ0YWJvdXRcIik7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiRW5hYmxlZFwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdGFib3V0IGlzIGVuYWJsZWQuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YWJvdXRFbmFibGVkKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnRhYm91dEVuYWJsZWQgPSB2YWx1ZTtcclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGlzcGxheUF1dG9FbmxhcmdlQnJhY2tldHNTZXR0aW5ncygpIHtcclxuXHRcdGNvbnN0IGNvbnRhaW5lckVsID0gdGhpcy5jb250YWluZXJFbDtcclxuXHRcdHRoaXMuYWRkSGVhZGluZyhjb250YWluZXJFbCwgXCJBdXRvLWVubGFyZ2UgYnJhY2tldHNcIiwgXCJwYXJlbnRoZXNlc1wiKTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJFbmFibGVkXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBhdXRvbWF0aWNhbGx5IGVubGFyZ2UgYnJhY2tldHMgY29udGFpbmluZyBlLmcuIHN1bSwgaW50LCBmcmFjLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0cylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5hdXRvRW5sYXJnZUJyYWNrZXRzID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIlRyaWdnZXJzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiQSBsaXN0IG9mIHN5bWJvbHMgdGhhdCBzaG91bGQgdHJpZ2dlciBhdXRvLWVubGFyZ2UgYnJhY2tldHMsIHNlcGFyYXRlZCBieSBjb21tYXMuXCIpXHJcblx0XHRcdC5hZGRUZXh0KHRleHQgPT4gdGV4dFxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLmF1dG9FbmxhcmdlQnJhY2tldHNUcmlnZ2VycylcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0VubGFyZ2VCcmFja2V0c1RyaWdnZXJzKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9FbmxhcmdlQnJhY2tldHNUcmlnZ2VycyA9IHZhbHVlO1xyXG5cclxuXHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdH0pKTtcclxuXHR9XHJcblxyXG5cdHByaXZhdGUgZGlzcGxheUFkdmFuY2VkU25pcHBldFNldHRpbmdzKCkge1xyXG5cdFx0Y29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG5cdFx0dGhpcy5hZGRIZWFkaW5nKGNvbnRhaW5lckVsLCBcIkFkdmFuY2VkIHNuaXBwZXQgc2V0dGluZ3NcIik7XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJTbmlwcGV0IHZhcmlhYmxlc1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIkFzc2lnbiBzbmlwcGV0IHZhcmlhYmxlcyB0aGF0IGNhbiBiZSB1c2VkIGFzIHNob3J0Y3V0cyB3aGVuIHdyaXRpbmcgc25pcHBldHMuXCIpXHJcblx0XHRcdC5hZGRUZXh0QXJlYSh0ZXh0ID0+IHRleHRcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlcylcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzID0gdmFsdWU7XHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KVxyXG5cdFx0XHRcdC5zZXRQbGFjZWhvbGRlcihERUZBVUxUX1NFVFRJTkdTLnNuaXBwZXRWYXJpYWJsZXMpKVxyXG5cdFx0XHQuc2V0Q2xhc3MoXCJsYXRleC1zdWl0ZS1zbmlwcGV0LXZhcmlhYmxlcy1zZXR0aW5nXCIpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBmaWxlIG9yIGZvbGRlclwiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIGEgc3BlY2lmaWVkIGZpbGUsIG9yIGZyb20gYWxsIGZpbGVzIHdpdGhpbiBhIGZvbGRlciAoaW5zdGVhZCBvZiBmcm9tIHRoZSBwbHVnaW4gc2V0dGluZ3MpLlwiKVxyXG5cdFx0XHQuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSlcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0c25pcHBldFZhcmlhYmxlc1NldHRpbmcuc2V0dGluZ0VsLnRvZ2dsZUNsYXNzKFwiaGlkZGVuXCIsIHZhbHVlKTtcclxuXHRcdFx0XHRcdGlmICh0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwgIT0gdW5kZWZpbmVkKVxyXG5cdFx0XHRcdFx0XHR0aGlzLnNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRWwudG9nZ2xlQ2xhc3MoXCJoaWRkZW5cIiwgIXZhbHVlKTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NEZXNjID0gbmV3IERvY3VtZW50RnJhZ21lbnQoKTtcclxuXHRcdHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jRGVzYy5jcmVhdGVEaXYoe30sIChkaXYpID0+IHtcclxuXHRcdFx0ZGl2LmlubmVySFRNTCA9IGBcclxuXHRcdFx0VGhlIGZpbGUgb3IgZm9sZGVyIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbS4gVGhlIGZpbGUgb3IgZm9sZGVyIG11c3QgYmUgd2l0aGluIHlvdXIgdmF1bHQsIGFuZCBub3Qgd2l0aGluIGEgaGlkZGVuIGZvbGRlciAoc3VjaCBhcyA8Y29kZT4ub2JzaWRpYW4vPC9jb2RlPikuYDtcclxuXHRcdH0pO1xyXG5cclxuXHRcdGNvbnN0IHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAuc2V0TmFtZShcIlNuaXBwZXQgdmFyaWFibGVzIGZpbGUgb3IgZm9sZGVyIGxvY2F0aW9uXCIpXHJcbiAgICAuc2V0RGVzYyhzbmlwcGV0VmFyaWFibGVzRmlsZUxvY0Rlc2MpO1xyXG5cclxuXHJcbiAgICBsZXQgaW5wdXRWYXJpYWJsZXNFbDogSFRNTElucHV0RWxlbWVudCB8IHVuZGVmaW5lZDsgLy8gQWxsb3cgcG90ZW50aWFsIHVuZGVmaW5lZCB2YWx1ZXNcclxuXHJcbiAgICBzbmlwcGV0VmFyaWFibGVzRmlsZUxvYy5hZGRTZWFyY2goKGNvbXBvbmVudCkgPT4ge1xyXG4gICAgICAgIGNvbXBvbmVudFxyXG4gICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy5zbmlwcGV0VmFyaWFibGVzRmlsZUxvY2F0aW9uKVxyXG4gICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NhdGlvbilcclxuICAgICAgICAgICAgLm9uQ2hhbmdlKFxyXG4gICAgICAgICAgICAgICAgZGVib3VuY2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NhdGlvbiA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncyh0cnVlKTtcclxuICAgICAgICAgICAgICAgIH0sIDUwMCwgdHJ1ZSlcclxuICAgICAgICAgICAgKTtcclxuICAgIFxyXG4gICAgICAgIC8vIEVuc3VyZSBpbnB1dFZhcmlhYmxlc0VsIGlzIGFzc2lnbmVkIGNvcnJlY3RseVxyXG4gICAgICAgIGlucHV0VmFyaWFibGVzRWwgPSBjb21wb25lbnQuaW5wdXRFbCBhcyBIVE1MSW5wdXRFbGVtZW50O1xyXG4gICAgICAgIGlucHV0VmFyaWFibGVzRWwuYWRkQ2xhc3MoXCJsYXRleC1zdWl0ZS1sb2NhdGlvbi1pbnB1dC1lbFwiKTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBFbnN1cmUgaW5wdXRWYXJpYWJsZXNFbCBpcyBkZWZpbmVkIGJlZm9yZSBwYXNzaW5nIGl0IHRvIEZpbGVTdWdnZXN0XHJcbiAgICBpZiAoaW5wdXRWYXJpYWJsZXNFbCkge1xyXG4gICAgICAgIHRoaXMuc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbCA9IHNuaXBwZXRWYXJpYWJsZXNGaWxlTG9jLnNldHRpbmdFbDtcclxuICAgICAgICBuZXcgRmlsZVN1Z2dlc3QodGhpcy5hcHAsIGlucHV0VmFyaWFibGVzRWwpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwiSW5wdXQgZWxlbWVudCBmb3IgdmFyaWFibGVzIGlzIHVuZGVmaW5lZC5cIik7XHJcbiAgICB9XHJcblxyXG5cclxuXHRcdC8vIEhpZGUgc2V0dGluZ3MgdGhhdCBhcmUgbm90IHJlbGV2YW50IHdoZW4gXCJsb2FkU25pcHBldHNGcm9tRmlsZVwiIGlzIHNldCB0byB0cnVlL2ZhbHNlXHJcblx0XHRjb25zdCBsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZTtcclxuXHRcdHNuaXBwZXRWYXJpYWJsZXNTZXR0aW5nLnNldHRpbmdFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCBsb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKTtcclxuXHRcdHRoaXMuc25pcHBldFZhcmlhYmxlc0ZpbGVMb2NFbC50b2dnbGVDbGFzcyhcImhpZGRlblwiLCAhbG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiV29yZCBkZWxpbWl0ZXJzXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiU3ltYm9scyB0aGF0IHdpbGwgYmUgdHJlYXRlZCBhcyB3b3JkIGRlbGltaXRlcnMsIGZvciB1c2Ugd2l0aCB0aGUgXFxcIndcXFwiIHNuaXBwZXQgb3B0aW9uLlwiKVxyXG5cdFx0XHQuYWRkVGV4dCh0ZXh0ID0+IHRleHRcclxuXHRcdFx0XHQuc2V0UGxhY2Vob2xkZXIoREVGQVVMVF9TRVRUSU5HUy53b3JkRGVsaW1pdGVycylcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Mud29yZERlbGltaXRlcnMpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Mud29yZERlbGltaXRlcnMgPSB2YWx1ZTtcclxuXHJcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0XHR9KSk7XHJcblxyXG5cdFx0bmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcblx0XHRcdC5zZXROYW1lKFwiUmVtb3ZlIHRyYWlsaW5nIHdoaXRlc3BhY2VzIGluIHNuaXBwZXRzIGluIGlubGluZSBtYXRoXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byByZW1vdmUgdHJhaWxpbmcgd2hpdGVzcGFjZXMgd2hlbiBleHBhbmRpbmcgc25pcHBldHMgYXQgdGhlIGVuZCBvZiBpbmxpbmUgbWF0aCBibG9ja3MuXCIpXHJcblx0XHRcdC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdmVTbmlwcGV0V2hpdGVzcGFjZSlcclxuXHRcdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0XHR0aGlzLnBsdWdpbi5zZXR0aW5ncy5yZW1vdmVTbmlwcGV0V2hpdGVzcGFjZSA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0LnNldE5hbWUoXCJSZW1vdmUgY2xvc2luZyAkIHdoZW4gYmFja3NwYWNpbmcgaW5zaWRlIGJsYW5rIGlubGluZSBtYXRoXCIpXHJcblx0XHQuc2V0RGVzYyhcIldoZXRoZXIgdG8gYWxzbyByZW1vdmUgdGhlIGNsb3NpbmcgJCB3aGVuIHlvdSBkZWxldGUgdGhlIG9wZW5pbmcgJCBzeW1ib2wgaW5zaWRlIGJsYW5rIGlubGluZSBtYXRoLlwiKVxyXG5cdFx0LmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB0b2dnbGVcclxuXHRcdFx0LnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzLmF1dG9EZWxldGUkKVxyXG5cdFx0XHQub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XHJcblx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuYXV0b0RlbGV0ZSQgPSB2YWx1ZTtcclxuXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0fSkpO1xyXG5cclxuXHRcdG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG5cdFx0XHQuc2V0TmFtZShcIkRvbid0IHRyaWdnZXIgc25pcHBldHMgd2hlbiBJTUUgaXMgYWN0aXZlXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiV2hldGhlciB0byBzdXBwcmVzcyBzbmlwcGV0cyB0cmlnZ2VyaW5nIHdoZW4gYW4gSU1FIGlzIGFjdGl2ZS5cIilcclxuXHRcdFx0LmFkZFRvZ2dsZSgodG9nZ2xlKSA9PiB0b2dnbGVcclxuXHRcdFx0XHQuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3Muc3VwcHJlc3NTbmlwcGV0VHJpZ2dlck9uSU1FKVxyXG5cdFx0XHRcdC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuXHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnN1cHByZXNzU25pcHBldFRyaWdnZXJPbklNRSA9IHZhbHVlO1xyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSlcclxuXHRcdFx0KTtcclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJDb2RlIGxhbmd1YWdlcyB0byBpbnRlcnByZXQgYXMgbWF0aCBtb2RlXCIpXHJcblx0XHRcdC5zZXREZXNjKFwiQ29kZWJsb2NrIGxhbmd1YWdlcyB3aGVyZSB0aGUgd2hvbGUgY29kZSBibG9jayBzaG91bGQgYmUgdHJlYXRlZCBsaWtlIGEgbWF0aCBibG9jaywgc2VwYXJhdGVkIGJ5IGNvbW1hcy5cIilcclxuXHRcdFx0LmFkZFRleHQodGV4dCA9PiB0ZXh0XHJcblx0XHRcdFx0LnNldFBsYWNlaG9sZGVyKERFRkFVTFRfU0VUVElOR1MuZm9yY2VNYXRoTGFuZ3VhZ2VzKVxyXG5cdFx0XHRcdC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5mb3JjZU1hdGhMYW5ndWFnZXMpXHJcblx0XHRcdFx0Lm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG5cdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9yY2VNYXRoTGFuZ3VhZ2VzID0gdmFsdWU7XHJcblxyXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0fSkpO1xyXG5cdH1cclxuXHJcbiAgcHJpdmF0ZSBkaXNwbGF5U3R5bGVTZXR0aW5ncygpe1xyXG4gICAgY29uc3QgY29udGFpbmVyRWwgPSB0aGlzLmNvbnRhaW5lckVsO1xyXG4gICAgY29udGFpbmVyRWwuZW1wdHkoKTtcclxuICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIk1hdGggUGx1Z2luIFNldHRpbmdzXCIgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRUb2dnbGVTZXR0aW5nKGNvbnRhaW5lckVsLFwiSW52ZXJ0IGRhcmsgY29sb3JzIGluIGRhcmsgbW9kZVwiLFwiSW52ZXJ0IGRhcmsgY29sb3JzIGluIGRpYWdyYW1zIChlLmcuIGF4ZXMsIGFycm93cykgd2hlbiBpbiBkYXJrIG1vZGUsIHNvIHRoYXQgdGhleSBhcmUgdmlzaWJsZS5cIix0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKVxyXG5cclxuXHJcblx0XHRuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuXHRcdFx0LnNldE5hbWUoXCJDbGVhciBjYWNoZWQgU1ZHc1wiKVxyXG5cdFx0XHQuc2V0RGVzYyhcIlNWR3MgcmVuZGVyZWQgd2l0aCBUaWtaSmF4IGFyZSBzdG9yZWQgaW4gYSBkYXRhYmFzZSwgc28gZGlhZ3JhbXMgZG9uJ3QgaGF2ZSB0byBiZSByZS1yZW5kZXJlZCBmcm9tIHNjcmF0Y2ggZXZlcnkgdGltZSB5b3Ugb3BlbiBhIHBhZ2UuIFVzZSB0aGlzIHRvIGNsZWFyIHRoZSBjYWNoZSBhbmQgZm9yY2UgYWxsIGRpYWdyYW1zIHRvIGJlIHJlLXJlbmRlcmVkLlwiKVxyXG5cdFx0XHQuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cclxuXHRcdFx0XHQuc2V0SWNvbihcInRyYXNoXCIpXHJcblx0XHRcdFx0LnNldFRvb2x0aXAoXCJDbGVhciBjYWNoZWQgU1ZHc1wiKVxyXG5cdFx0XHRcdC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuXHRcdFx0XHRcdGxvY2FsRm9yYWdlLmNsZWFyKChlcnIpID0+IHtcclxuXHRcdFx0XHRcdFx0aWYgKGVycikge1xyXG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUubG9nKGVycik7XHJcblx0XHRcdFx0XHRcdFx0bmV3IE5vdGljZShlcnIsIDMwMDApO1xyXG5cdFx0XHRcdFx0XHR9XHJcblx0XHRcdFx0XHRcdGVsc2Uge1xyXG5cdFx0XHRcdFx0XHRcdG5ldyBOb3RpY2UoXCJUaWtaSmF4OiBTdWNjZXNzZnVsbHkgY2xlYXJlZCBjYWNoZWQgU1ZHcy5cIiwgMzAwMCk7XHJcblx0XHRcdFx0XHRcdH1cclxuICAgICAgICAgICAgXHJcblx0XHRcdFx0XHR9KTtcclxuICAgICAgfSkpO1xyXG5cclxuICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgICAgLnNldE5hbWUoIFwiUmVuZGVyZWQgbnVtYmVyIGZvcm1hdFwiKVxyXG4gICAgICAgIC5zZXREZXNjKFwiQ2hvb3NlIGhvdyB0byBmb3JtYXQgbnVtYmVycyBpbiB0aGUgcmVzdWx0LlwiKVxyXG4gICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiB7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oJzEwMDAnLFwiZm9ybWF0dGVkIC4wMDBcIik7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oJzEwMDAwJyxcImZvcm1hdHRlZCAuMDAwMFwiKTtcclxuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbignMTAwMDAwJyxcImZvcm1hdHRlZCAuMDAwMDBcIik7XHJcbiAgICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLm51bWJlckZvcm1hdHRpbmcgPSB2YWx1ZTtcclxuICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuXHJcbiAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIk1hdGggUGx1Z2luIHN0eWxlXCIgfSk7XHJcblxyXG4gICAgICB0aGlzLmFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbCwgXCJCYWNrZ3JvdW5kIENvbG9yXCIsIFwiU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yLlwiLCBcImJhY2tncm91bmRcIik7XHJcbiAgICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkV2ZW4gUm93IEJhY2tncm91bmQgQ29sb3JcIiwgXCJTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIGV2ZW4gcm93cy5cIiwgXCJldmVuUm93QmFja2dyb3VuZFwiKTtcclxuICAgICAgdGhpcy5hZGRDb2xvclNldHRpbmcoY29udGFpbmVyRWwsIFwiT2RkIFJvdyBCYWNrZ3JvdW5kIENvbG9yXCIsIFwiU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciBvZGQgcm93cy5cIiwgXCJvZGRSb3dCYWNrZ3JvdW5kXCIpO1xyXG4gICAgICB0aGlzLmFkZENvbG9yU2V0dGluZyhjb250YWluZXJFbCwgXCJpbmZvTW9kYWwgQmFja2dyb3VuZCBDb2xvclwiLCBcIlNldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3IgdGhlIGluZm8gbW9kYWwuXCIsIFwiaW5mb01vZGFsQmFja2dyb3VuZFwiKTtcclxuICAgICAgXHJcbiAgICAgIHRoaXMuYWRkVGV4dFNldHRpbmcoY29udGFpbmVyRWwsIFwiRm9udCBTaXplXCIsIFwiU2V0IHRoZSBmb250IHNpemUgZm9yIHRoZSByb3dzLlwiLCBcImZvbnRTaXplXCIpO1xyXG4gICAgICB0aGlzLmFkZFRleHRTZXR0aW5nKGNvbnRhaW5lckVsLCBcIlJvdyBQYWRkaW5nXCIsIFwiU2V0IHRoZSBwYWRkaW5nIGZvciB0aGUgcm93cy5cIiwgXCJyb3dQYWRkaW5nXCIpO1xyXG4gICAgICB0aGlzLmFkZFRleHRTZXR0aW5nKGNvbnRhaW5lckVsLCBcIkljb24gU2l6ZVwiLCBcIlNldCB0aGUgc2l6ZSBvZiB0aGUgaWNvbnMuXCIsIFwiaWNvblNpemVcIik7XHJcbiAgXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+XHJcbiAgICAgICAgICBidXR0b25cclxuICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoXCJXaXBlIEhpc3RvcnkgTW9kdWxlXCIpXHJcbiAgICAgICAgICAgIC5zZXRUb29sdGlwKFwiUmVzZXQgYWxsIHNldHRpbmdzIHRvIHRoZWlyIGRlZmF1bHQgdmFsdWVzXCIpXHJcbiAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeSA9IFtdO1xyXG4gICAgICAgICAgICAgbmV3IE5vdGljZShcIkhpc3Rvcnkgd2FzIHdpcGVkLlwiKVxyXG4gICAgICAgICAgICB9KSk7XHJcblxyXG4gICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cclxuICAgICAgICBidXR0b25cclxuICAgICAgICAgIC5zZXRCdXR0b25UZXh0KFwiUmVzZXQgdG8gRGVmYXVsdFwiKVxyXG4gICAgICAgICAgLnNldFRvb2x0aXAoXCJSZXNldCBhbGwgc2V0dGluZ3MgdG8gdGhlaXIgZGVmYXVsdCB2YWx1ZXNcIilcclxuICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MgfTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XHJcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXCJTZXR0aW5ncyBoYXZlIGJlZW4gcmVzZXQgdG8gZGVmYXVsdC5cIik7XHJcbiAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xyXG4gICAgICAgIH0pKTtcclxuXHJcbiAgfVxyXG4gIHByaXZhdGUgYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBhbnkpIHtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZENvbG9yUGlja2VyKGNvbG9yUGlja2VyID0+IHtcclxuICAgICAgICBjb2xvclBpY2tlci5zZXRWYWx1ZShzZXR0aW5nS2V5KTtcclxuICAgICAgICBjb2xvclBpY2tlci5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIHNldHRpbmdLZXkgPSB2YWx1ZTtcclxuICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgICAgICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgfVxyXG4gIHByaXZhdGUgYWRkVG9nZ2xlU2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleTogYW55KSB7XHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUobmFtZSlcclxuICAgICAgLnNldERlc2MoZGVzY3JpcHRpb24pXHJcbiAgICAgIC5hZGRUb2dnbGUoKHRvZ2dsZSA6IGFueSkgPT4ge1xyXG4gICAgICAgIHRvZ2dsZS5zZXRWYWx1ZShzZXR0aW5nS2V5KVxyXG4gICAgICAgIHRvZ2dsZS5vbkNoYW5nZShhc3luYyAodmFsdWU6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgc2V0dGluZ0tleT0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuICBwcml2YXRlIGFkZFRleHRTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBhbnkpIHtcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZFRleHQoKHRleHQ6IGFueSkgPT4ge1xyXG4gICAgICAgIHRleHQuc2V0UGxhY2Vob2xkZXIoc2V0dGluZ0tleSkuc2V0VmFsdWUoc2V0dGluZ0tleSk7XHJcbiAgICAgICAgdGV4dC5vbkNoYW5nZShhc3luYyAodmFsdWU6IHN0cmluZykgPT4ge1xyXG4gICAgICAgICAgc2V0dGluZ0tleT0gdmFsdWU7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuICB1cGRhdGVTdHlsZXMoKSB7XHJcbiAgICBjb25zdCByb290ID0gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50O1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tcm93LWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuYmFja2dyb3VuZCk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1ldmVuLXJvdy1iYWNrZ3JvdW5kXCIsIHRoaXMucGx1Z2luLnNldHRpbmdzLmV2ZW5Sb3dCYWNrZ3JvdW5kKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLW9kZC1yb3ctYmFja2dyb3VuZFwiLCB0aGlzLnBsdWdpbi5zZXR0aW5ncy5vZGRSb3dCYWNrZ3JvdW5kKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoXCItLWluZm8tbW9kYWwtY29sdW1uLWJhY2tncm91bmRcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaW5mb01vZGFsQmFja2dyb3VuZCk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1mb250LXNpemVcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZm9udFNpemUpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eShcIi0tcm93LXBhZGRpbmdcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3Mucm93UGFkZGluZyk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KFwiLS1pY29uLXNpemVcIiwgdGhpcy5wbHVnaW4uc2V0dGluZ3MuaWNvblNpemUpO1xyXG59XHJcblx0Y3JlYXRlU25pcHBldHNFZGl0b3Ioc25pcHBldHNTZXR0aW5nOiBTZXR0aW5nKSB7XHJcblx0XHRjb25zdCBjdXN0b21DU1NXcmFwcGVyID0gc25pcHBldHNTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVEaXYoXCJzbmlwcGV0cy1lZGl0b3Itd3JhcHBlclwiKTtcclxuXHRcdGNvbnN0IHNuaXBwZXRzRm9vdGVyID0gc25pcHBldHNTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVEaXYoXCJzbmlwcGV0cy1mb290ZXJcIik7XHJcblx0XHRjb25zdCB2YWxpZGl0eSA9IHNuaXBwZXRzRm9vdGVyLmNyZWF0ZURpdihcInNuaXBwZXRzLWVkaXRvci12YWxpZGl0eVwiKTtcclxuXHJcblx0XHRjb25zdCB2YWxpZGl0eUluZGljYXRvciA9IG5ldyBFeHRyYUJ1dHRvbkNvbXBvbmVudCh2YWxpZGl0eSk7XHJcblx0XHR2YWxpZGl0eUluZGljYXRvci5zZXRJY29uKFwiY2hlY2ttYXJrXCIpXHJcblx0XHRcdC5leHRyYVNldHRpbmdzRWwuYWRkQ2xhc3MoXCJzbmlwcGV0cy1lZGl0b3ItdmFsaWRpdHktaW5kaWNhdG9yXCIpO1xyXG5cclxuXHRcdGNvbnN0IHZhbGlkaXR5VGV4dCA9IHZhbGlkaXR5LmNyZWF0ZURpdihcInNuaXBwZXRzLWVkaXRvci12YWxpZGl0eS10ZXh0XCIpO1xyXG5cdFx0dmFsaWRpdHlUZXh0LmFkZENsYXNzKFwic2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uXCIpO1xyXG5cdFx0dmFsaWRpdHlUZXh0LnN0eWxlLnBhZGRpbmcgPSBcIjBcIjtcclxuXHJcblxyXG5cdFx0ZnVuY3Rpb24gdXBkYXRlVmFsaWRpdHlJbmRpY2F0b3Ioc3VjY2VzczogYm9vbGVhbikge1xyXG5cdFx0XHR2YWxpZGl0eUluZGljYXRvci5zZXRJY29uKHN1Y2Nlc3MgPyBcImNoZWNrbWFya1wiIDogXCJjcm9zc1wiKTtcclxuXHRcdFx0dmFsaWRpdHlJbmRpY2F0b3IuZXh0cmFTZXR0aW5nc0VsLnJlbW92ZUNsYXNzKHN1Y2Nlc3MgPyBcImludmFsaWRcIiA6IFwidmFsaWRcIik7XHJcblx0XHRcdHZhbGlkaXR5SW5kaWNhdG9yLmV4dHJhU2V0dGluZ3NFbC5hZGRDbGFzcyhzdWNjZXNzID8gXCJ2YWxpZFwiIDogXCJpbnZhbGlkXCIpO1xyXG5cdFx0XHR2YWxpZGl0eVRleHQuc2V0VGV4dChzdWNjZXNzID8gXCJTYXZlZFwiIDogXCJJbnZhbGlkIHN5bnRheC4gQ2hhbmdlcyBub3Qgc2F2ZWRcIik7XHJcblx0XHR9XHJcblxyXG5cclxuXHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBiYXNpY1NldHVwO1xyXG5cclxuXHRcdGNvbnN0IGNoYW5nZSA9IEVkaXRvclZpZXcudXBkYXRlTGlzdGVuZXIub2YoYXN5bmMgKHY6IFZpZXdVcGRhdGUpID0+IHtcclxuXHRcdFx0aWYgKHYuZG9jQ2hhbmdlZCkge1xyXG5cdFx0XHRcdGNvbnN0IHNuaXBwZXRzID0gdi5zdGF0ZS5kb2MudG9TdHJpbmcoKTtcclxuXHRcdFx0XHRsZXQgc3VjY2VzcyA9IHRydWU7XHJcblxyXG5cdFx0XHRcdGxldCBzbmlwcGV0VmFyaWFibGVzO1xyXG5cdFx0XHRcdHRyeSB7XHJcblx0XHRcdFx0XHRzbmlwcGV0VmFyaWFibGVzID0gYXdhaXQgcGFyc2VTbmlwcGV0VmFyaWFibGVzKHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMpXHJcblx0XHRcdFx0XHRhd2FpdCBwYXJzZVNuaXBwZXRzKHNuaXBwZXRzLCBzbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0Y2F0Y2ggKGUpIHtcclxuXHRcdFx0XHRcdHN1Y2Nlc3MgPSBmYWxzZTtcclxuXHRcdFx0XHR9XHJcblxyXG5cdFx0XHRcdHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHN1Y2Nlc3MpO1xyXG5cclxuXHRcdFx0XHRpZiAoIXN1Y2Nlc3MpIHJldHVybjtcclxuXHJcblx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHMgPSBzbmlwcGV0cztcclxuXHRcdFx0XHRhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcbiAgICBcclxuXHRcdGV4dGVuc2lvbnMucHVzaChjaGFuZ2UpO1xyXG5cclxuXHRcdHRoaXMuc25pcHBldHNFZGl0b3IgPSBjcmVhdGVDTUVkaXRvcih0aGlzLnBsdWdpbi5zZXR0aW5ncy5zbmlwcGV0cywgZXh0ZW5zaW9ucyk7XHJcblx0XHRjdXN0b21DU1NXcmFwcGVyLmFwcGVuZENoaWxkKHRoaXMuc25pcHBldHNFZGl0b3IuZG9tKTtcclxuXHJcblxyXG5cdFx0Y29uc3QgYnV0dG9uc0RpdiA9IHNuaXBwZXRzRm9vdGVyLmNyZWF0ZURpdihcInNuaXBwZXRzLWVkaXRvci1idXR0b25zXCIpO1xyXG5cdFx0Y29uc3QgcmVzZXQgPSBuZXcgQnV0dG9uQ29tcG9uZW50KGJ1dHRvbnNEaXYpO1xyXG5cdFx0cmVzZXQuc2V0SWNvbihcInN3aXRjaFwiKVxyXG5cdFx0XHQuc2V0VG9vbHRpcChcIlJlc2V0IHRvIGRlZmF1bHQgc25pcHBldHNcIilcclxuXHRcdFx0Lm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG5cdFx0XHRcdG5ldyBDb25maXJtYXRpb25Nb2RhbCh0aGlzLnBsdWdpbi5hcHAsXHJcblx0XHRcdFx0XHRcIkFyZSB5b3Ugc3VyZT8gVGhpcyB3aWxsIGRlbGV0ZSBhbnkgY3VzdG9tIHNuaXBwZXRzIHlvdSBoYXZlIHdyaXR0ZW4uXCIsXHJcblx0XHRcdFx0XHRidXR0b24gPT4gYnV0dG9uXHJcblx0XHRcdFx0XHRcdC5zZXRCdXR0b25UZXh0KFwiUmVzZXQgdG8gZGVmYXVsdCBzbmlwcGV0c1wiKVxyXG5cdFx0XHRcdFx0XHQuc2V0V2FybmluZygpLFxyXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xyXG5cdFx0XHRcdFx0XHR0aGlzLnNuaXBwZXRzRWRpdG9yLnNldFN0YXRlKEVkaXRvclN0YXRlLmNyZWF0ZSh7IGRvYzogREVGQVVMVF9TTklQUEVUUywgZXh0ZW5zaW9uczogZXh0ZW5zaW9ucyB9KSk7XHJcblx0XHRcdFx0XHRcdHVwZGF0ZVZhbGlkaXR5SW5kaWNhdG9yKHRydWUpO1xyXG5cclxuXHRcdFx0XHRcdFx0dGhpcy5wbHVnaW4uc2V0dGluZ3Muc25pcHBldHMgPSBERUZBVUxUX1NOSVBQRVRTO1xyXG5cclxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcblx0XHRcdFx0XHR9XHJcblx0XHRcdFx0KS5vcGVuKCk7XHJcblx0XHRcdH0pO1xyXG5cclxuXHRcdGNvbnN0IHJlbW92ZSA9IG5ldyBCdXR0b25Db21wb25lbnQoYnV0dG9uc0Rpdik7XHJcblx0XHRyZW1vdmUuc2V0SWNvbihcInRyYXNoXCIpXHJcblx0XHRcdC5zZXRUb29sdGlwKFwiUmVtb3ZlIGFsbCBzbmlwcGV0c1wiKVxyXG5cdFx0XHQub25DbGljayhhc3luYyAoKSA9PiB7XHJcblx0XHRcdFx0bmV3IENvbmZpcm1hdGlvbk1vZGFsKHRoaXMucGx1Z2luLmFwcCxcclxuXHRcdFx0XHRcdFwiQXJlIHlvdSBzdXJlPyBUaGlzIHdpbGwgZGVsZXRlIGFueSBjdXN0b20gc25pcHBldHMgeW91IGhhdmUgd3JpdHRlbi5cIixcclxuXHRcdFx0XHRcdGJ1dHRvbiA9PiBidXR0b25cclxuXHRcdFx0XHRcdFx0LnNldEJ1dHRvblRleHQoXCJSZW1vdmUgYWxsIHNuaXBwZXRzXCIpXHJcblx0XHRcdFx0XHRcdC5zZXRXYXJuaW5nKCksXHJcblx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XHJcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gYFtcclxuXHJcbl1gO1xyXG5cdFx0XHRcdFx0XHR0aGlzLnNuaXBwZXRzRWRpdG9yLnNldFN0YXRlKEVkaXRvclN0YXRlLmNyZWF0ZSh7IGRvYzogdmFsdWUsIGV4dGVuc2lvbnM6IGV4dGVuc2lvbnMgfSkpO1xyXG5cdFx0XHRcdFx0XHR1cGRhdGVWYWxpZGl0eUluZGljYXRvcih0cnVlKTtcclxuXHJcblx0XHRcdFx0XHRcdHRoaXMucGx1Z2luLnNldHRpbmdzLnNuaXBwZXRzID0gdmFsdWU7XHJcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG5cdFx0XHRcdFx0fVxyXG5cdFx0XHRcdCkub3BlbigpO1xyXG5cdFx0XHR9KTtcclxuXHR9XHJcbn1cclxuXHJcbmNsYXNzIENvbmZpcm1hdGlvbk1vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG5cclxuXHRjb25zdHJ1Y3RvcihhcHA6IEFwcCwgYm9keTogc3RyaW5nLCBidXR0b25DYWxsYmFjazogKGJ1dHRvbjogQnV0dG9uQ29tcG9uZW50KSA9PiB2b2lkLCBjbGlja0NhbGxiYWNrOiAoKSA9PiBQcm9taXNlPHZvaWQ+KSB7XHJcblx0XHRzdXBlcihhcHApO1xyXG5cclxuXHRcdHRoaXMuY29udGVudEVsLmFkZENsYXNzKFwibGF0ZXgtc3VpdGUtY29uZmlybWF0aW9uLW1vZGFsXCIpO1xyXG5cdFx0dGhpcy5jb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYm9keSB9KTtcclxuXHJcblxyXG5cdFx0bmV3IFNldHRpbmcodGhpcy5jb250ZW50RWwpXHJcblx0XHRcdC5hZGRCdXR0b24oYnV0dG9uID0+IHtcclxuXHRcdFx0XHRidXR0b25DYWxsYmFjayhidXR0b24pO1xyXG5cdFx0XHRcdGJ1dHRvbi5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuXHRcdFx0XHRcdGF3YWl0IGNsaWNrQ2FsbGJhY2soKTtcclxuXHRcdFx0XHRcdHRoaXMuY2xvc2UoKTtcclxuXHRcdFx0XHR9KTtcclxuXHRcdFx0fSlcclxuXHRcdFx0LmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXHJcblx0XHRcdFx0LnNldEJ1dHRvblRleHQoXCJDYW5jZWxcIilcclxuXHRcdFx0XHQub25DbGljaygoKSA9PiB0aGlzLmNsb3NlKCkpKTtcclxuXHR9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUNNRWRpdG9yKGNvbnRlbnQ6IHN0cmluZywgZXh0ZW5zaW9uczogRXh0ZW5zaW9uW10pIHtcclxuXHRjb25zdCB2aWV3ID0gbmV3IEVkaXRvclZpZXcoe1xyXG5cdFx0c3RhdGU6IEVkaXRvclN0YXRlLmNyZWF0ZSh7IGRvYzogY29udGVudCwgZXh0ZW5zaW9ucyB9KSxcclxuXHR9KTtcclxuXHJcblx0cmV0dXJuIHZpZXc7XHJcbn1cclxuXHJcbiJdfQ==