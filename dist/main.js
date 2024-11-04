import { __awaiter } from "tslib";
import { Plugin, MarkdownRenderer, PluginSettingTab, Setting, Modal, Notice, Component } from 'obsidian';
import { controller } from './mathEngine.js';
const DEFAULT_SETTINGS = {
    numberFormatting: '.000',
    background: `#44475A`,
    evenRowBackground: '#f9f9f9',
    oddRowBackground: '#747688',
    infoModalBackground: '#002B36',
    fontSize: '0.85em',
    rowPadding: '5px 10px',
    iconSize: '14px',
    sessionHistory: []
};
export default class MathPlugin extends Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            // Load settings and register the markdown processor
            yield this.loadSettings();
            this.addSettingTab(new MathPluginSettingTab(this.app, this));
            this.registerMarkdownCodeBlockProcessor('math-engine', this.processMathBlock.bind(this));
            this.updateStyles();
            this.addCommand({
                id: 'open-input-form',
                name: 'Open Input Form',
                callback: () => {
                    new CustomInputModal(this.app, this).open();
                }
            });
            this.addCommand({
                id: 'view-session-history',
                name: 'View Session History',
                callback: () => {
                    new HistoryModal(this.app, this).open();
                }
            });
        });
    }
    processMathBlock(source, el) {
        let userVariables = [];
        let skippedIndexes = 0;
        el.classList.add('math-container');
        let expressions = source.split('\n').filter(line => line.trim() !== '');
        if (expressions.length === 0) {
            expressions = ['0'];
        }
        expressions.forEach((expression, index) => {
            expression = expression.replace(/\s/g, "");
            userVariables.forEach(({ variable, value }) => {
                const variableRegex = new RegExp(`\\b${variable.trim()}\\b`, 'g');
                expression = expression.replace(variableRegex, value.trim());
            });
            if (expression.startsWith('var') && expression.includes('=')) {
                let splitVar = expression.substring(3).split('=');
                const index = userVariables.findIndex(v => v.variable === splitVar[0].trim());
                if (index !== -1) {
                    userVariables[index].value = splitVar[1].trim();
                }
                else {
                    userVariables.push({ variable: splitVar[0].trim(), value: splitVar[1].trim() });
                }
                skippedIndexes++;
                return;
            }
            const lineContainer = el.createEl('div', { cls: 'math-line-container' });
            lineContainer.addClass((index - skippedIndexes) % 2 === 0 ? 'math-row-even' : 'math-row-odd');
            const inputDiv = lineContainer.createEl('div', { cls: 'math-input' });
            const resultDiv = lineContainer.createEl('div', { cls: 'math-result' });
            const binomRegex = /binom\(([\d.]+),([\d.]+),([\d.]+)\)/;
            const match = expression.match(binomRegex);
            if (match) {
                let binom = new binomInfoModel(this.app, match);
                inputDiv.innerText = `${expression}`;
                resultDiv.innerHTML = `${binom.getEqual()}`;
                const iconsDiv = this.createIconsContainer();
                this.addIconListeners(iconsDiv, match, 'binom');
                lineContainer.append(inputDiv, resultDiv, iconsDiv);
                el.appendChild(lineContainer);
                return;
            }
            let result;
            try {
                result = controller(expression);
                if (typeof result === 'object') {
                    MarkdownRenderer.renderMarkdown(`$\{${result.processedinput}\}$`, inputDiv, '', this);
                    MarkdownRenderer.renderMarkdown(/(true|false)/.test(result.solution) ? result.solution : `$\{${result.solution}\}$`, resultDiv, '', this);
                    const iconsDiv = this.createIconsContainer();
                    this.addIconListeners(iconsDiv, result, 'default');
                    lineContainer.append(inputDiv, resultDiv, iconsDiv);
                }
            }
            catch (err) {
                MarkdownRenderer.renderMarkdown(expression, inputDiv, '', this);
                resultDiv.innerHTML = `<span class="error-text">${err.message}</span>`;
                lineContainer.addClass('math-error-line');
            }
            el.appendChild(lineContainer);
        });
    }
    // Create icons container
    createIconsContainer() {
        const iconsDiv = document.createElement('div');
        iconsDiv.classList.add('math-icons');
        iconsDiv.innerHTML = `
      <span class="math-info-icon">🛈</span>
      <span class="math-debug-icon">🐞</span>`;
        return iconsDiv;
    }
    addIconListeners(iconsDiv, result, infoMode) {
        var _a, _b;
        (_a = iconsDiv.querySelector('.math-info-icon')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
            switch (infoMode) {
                case 'binom':
                    new binomInfoModel(this.app, result).open();
                    break;
                default:
                    new InfoModal(this.app, result.mathInfo, result.solutionInfo).open();
            }
        });
        (_b = iconsDiv.querySelector('.math-debug-icon')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => {
            new DebugModal(this.app, result.debugInfo).open();
        });
    }
    // Load settings
    loadSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
        });
    }
    // Save settings
    saveSettings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.saveData(this.settings);
        });
    }
    // Update styles based on settings
    updateStyles() {
        const root = document.documentElement;
        root.style.setProperty('--row-background', this.settings.background);
        root.style.setProperty('--even-row-background', this.settings.evenRowBackground);
        root.style.setProperty('--odd-row-background', this.settings.oddRowBackground);
        root.style.setProperty('--info-modal-column-background', this.settings.infoModalBackground);
        root.style.setProperty('--font-size', this.settings.fontSize);
        root.style.setProperty('--row-padding', this.settings.rowPadding);
        root.style.setProperty('--icon-size', this.settings.iconSize);
    }
}
class CustomInputModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.userChoice = 0;
        this.userCoordinatesInput = '(0,0),(1,0),(1,1)';
        this.userSidesInput = '';
        this.userAnglesInput = '';
        this.evaledUserInputInfo = null;
        this.savedValues = {};
        this.plugin = plugin;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Enter Math Expression' });
        // Assign shapesCharacteristics globally
        this.shapesCharacteristics = getShapesCharacteristics();
        const settingsContainer = contentEl.createDiv({ cls: 'settings-container' });
        const dynamicFieldContainer = contentEl.createDiv({ cls: 'dynamic-field-container' });
        const tikzGraphContainer = contentEl.createDiv({ cls: 'dynamic-field-container' });
        const submitButton = contentEl.createEl('button', { text: 'Submit', attr: { disabled: 'true' } });
        const temporaryDebugArea = contentEl.createDiv({ cls: 'temporary-debug-area' });
        submitButton.addEventListener('click', () => {
            if (this.evaledUserInputInfo && this.evaledUserInputInfo.meetsMinRequirements) {
                this.handleSubmit();
            }
            else {
                new Notice('Please enter valid input.');
            }
        });
        new Setting(settingsContainer)
            .setName('Choose shape')
            .setDesc('Select the shape to perform the operations on.')
            .addDropdown(dropdown => {
            this.shapesCharacteristics.forEach((shape, index) => {
                dropdown.addOption(index.toString(), shape.name);
            });
            this.userChoice = 0;
            this.renderDynamicFields(dynamicFieldContainer);
            dropdown.onChange(value => {
                this.userChoice = Number(value);
                this.renderDynamicFields(dynamicFieldContainer);
            });
        });
        contentEl.addEventListener('input', () => {
            if (this.evaledUserInputInfo.meetsMinRequirements) {
                submitButton.removeAttribute('disabled');
                tikzGraphContainer.empty();
                temporaryDebugArea.empty();
            }
            else {
                submitButton.setAttribute('disabled', 'true');
            }
        });
    }
    renderDynamicFields(container) {
        container.findAll('.dynamic-field').forEach(el => el.remove());
        const shape = this.shapesCharacteristics[this.userChoice];
        new Setting(container)
            .setName('Coordinates')
            .setDesc(`Enter ${shape.coordinates} coordinates for ${shape.name} in (x, y) format`)
            .addText(text => {
            text.setValue(this.userCoordinatesInput || '');
            text.onChange(value => {
                this.userCoordinatesInput = value;
            });
        })
            .settingEl.addClass('dynamic-field');
        new Setting(container)
            .setName('Sides')
            .setDesc(`Enter ${shape.coordinates} sides for ${shape.name}`)
            .addText(text => {
            text.setValue(this.userSidesInput || '');
            text.onChange(value => {
                this.userSidesInput = value;
            });
        })
            .settingEl.addClass('dynamic-field');
        new Setting(container)
            .setName('Angles')
            .setDesc(`Enter ${shape.coordinates} angles for ${shape.name}`)
            .addText(text => {
            text.setValue(this.userAnglesInput || '');
            text.onChange(value => {
                this.userAnglesInput = value;
            });
        })
            .settingEl.addClass('dynamic-field');
        new Setting(container)
            .addButton(button => button
            .setButtonText('Clear')
            .setTooltip('Clear all previous fields')
            .onClick(() => {
            this.userCoordinatesInput = '';
            this.userSidesInput = '';
            this.userAnglesInput = '';
            this.renderDynamicFields(container);
        }))
            .settingEl.addClass('dynamic-field');
    }
    handleSubmit() {
        const result = this.evaledUserInputInfo;
        this.resultContainer.textContent = JSON.stringify(result);
        this.plugin.settings.sessionHistory.push({
            input: this.userAnglesInput,
            result: result
        });
        this.plugin.saveSettings();
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
// Custom History Modal class for session history
class HistoryModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Session History' });
        // If there is no history, display a message
        if (this.plugin.settings.sessionHistory.length === 0) {
            contentEl.createEl('p', { text: 'No session history found.' });
            return;
        }
        // Display each session in the history
        this.plugin.settings.sessionHistory.forEach((session, index) => {
            const sessionDiv = contentEl.createEl('div', { cls: 'history-session' });
            sessionDiv.createEl('h3', { text: `Session ${index + 1}` });
            sessionDiv.createEl('p', { text: `Input: ${session.input}` });
            sessionDiv.createEl('p', { text: `Result: ${session.result}` });
        });
        // Close button
        const closeButton = contentEl.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => {
            this.close();
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty(); // Clean up modal content on close
    }
}
class InfoModal extends Modal {
    constructor(app, mathInfo, solutionInfo) {
        super(app);
        this.mathInfo = mathInfo;
        this.solutionInfo = solutionInfo;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('info-modal-style');
        contentEl.createEl('h2', { text: 'Result Details', cls: 'info-modal-title' });
        // Add content and button for copying details
        this.populateContent(contentEl);
    }
    populateContent(contentEl) {
        const columnContainer = contentEl.createEl('div', { cls: 'info-modal-main-container' });
        this.mathInfo.forEach((line, index) => {
            const lineContainer = columnContainer.createEl('div', { cls: 'info-modal-line-container' });
            const leftLine = lineContainer.createEl('div', { cls: 'info-modal-left-line' });
            MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${line}\\end{aligned}\}$`, leftLine, '', new Component());
            const rightLine = lineContainer.createEl('div', { cls: 'info-modal-right-line' });
            MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${this.solutionInfo[index] || ''}\\end{aligned}\}$`, rightLine, '', new Component());
        });
        const buttonContainer = contentEl.createEl('div', { cls: 'info-modal-Copy-button-container' });
        const actionButton = buttonContainer.createEl('button', { text: 'Copy Details', cls: 'info-modal-Copy-button' });
        actionButton.addEventListener('click', () => {
            navigator.clipboard.writeText(this.mathInfo.join('\n'));
            new Notice('Details copied to clipboard!');
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}
class DebugModal extends Modal {
    constructor(app, debugInfo) {
        super(app);
        this.debugInfo = debugInfo;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('custom-modal-style');
        contentEl.createEl('h2', { text: 'Debug Information', cls: 'debug-Modal-title' });
        const debugContent = contentEl.createEl('div', { cls: 'debug-info-container' });
        MarkdownRenderer.renderMarkdown(`\`\`\`js\n${this.debugInfo}\n\`\`\``, debugContent, '', new Component());
    }
    onClose() {
        this.contentEl.empty();
    }
}
class MathPluginSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        const toSetOptions = [
            { value: 1000, display: 'formatted .000' },
            { value: 10000, display: 'formatted .0000' },
            { value: 100000, display: 'formatted .00000' },
        ];
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Math Plugin Settings' });
        this.addMultiChoiceSetting(containerEl, 'Rendered number format', 'Choose how to format numbers in the result', toSetOptions, 'numberFormatting');
        containerEl.createEl('h2', { text: 'Math Plugin style' });
        // Add various settings
        this.addColorSetting(containerEl, 'Background Color', 'Set the background color.', 'background');
        this.addColorSetting(containerEl, 'Even Row Background Color', 'Set the background color for even rows.', 'evenRowBackground');
        this.addColorSetting(containerEl, 'Odd Row Background Color', 'Set the background color for odd rows.', 'oddRowBackground');
        this.addColorSetting(containerEl, 'infoModal Background Color', 'Set the background color for the info modal.', 'infoModalBackground');
        this.addFontSetting(containerEl, 'Font Size', 'Set the font size for the rows.', 'fontSize');
        this.addFontSetting(containerEl, 'Row Padding', 'Set the padding for the rows.', 'rowPadding');
        this.addFontSetting(containerEl, 'Icon Size', 'Set the size of the icons.', 'iconSize');
        new Setting(containerEl)
            .addButton(button => button
            .setButtonText('Wipe History Module')
            //.setTooltip('Reset all settings to their default values')
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings.sessionHistory = [];
            new Notice('History was wiped.');
        })));
        new Setting(containerEl)
            .addButton(button => button
            .setButtonText('Reset to Default')
            .setTooltip('Reset all settings to their default values')
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            yield this.resetToDefault();
        })));
    }
    addMultiChoiceSetting(containerEl, name, description, choices, settingKey) {
        if (settingKey === 'sessionHistory') {
            console.error("sessionHistory cannot be modified with addFontSetting (string expected).");
            return;
        }
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addDropdown(dropdown => {
            choices.forEach((choice) => {
                dropdown.addOption(choice.value, choice.display);
            });
            dropdown.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                this.plugin.settings[settingKey] = value;
                yield this.plugin.saveSettings();
                this.plugin.updateStyles();
            }));
        });
    }
    addColorSetting(containerEl, name, description, settingKey) {
        if (settingKey === 'sessionHistory') {
            console.error("sessionHistory cannot be modified with addSetting (string expected).");
            return;
        }
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addColorPicker(colorPicker => {
            const settingValue = this.plugin.settings[settingKey];
            if (typeof settingValue === 'string') {
                colorPicker.setValue(settingValue);
            }
            colorPicker.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                if (typeof this.plugin.settings[settingKey] === 'string') {
                    this.plugin.settings[settingKey] = value;
                    yield this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }
                else {
                    console.error(`Cannot assign a string value to ${settingKey} (non-string setting).`);
                }
            }));
        });
    }
    addFontSetting(containerEl, name, description, settingKey) {
        // Ensure that 'sessionHistory' is not being processed by addFontSetting
        if (settingKey === 'sessionHistory') {
            console.error("sessionHistory cannot be modified with addFontSetting (string expected).");
            return;
        }
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addText(text => {
            const settingValue = this.plugin.settings[settingKey];
            // Ensure that the setting is a string
            if (typeof settingValue === 'string') {
                text.setPlaceholder(settingValue).setValue(settingValue);
            }
            text.onChange((value) => __awaiter(this, void 0, void 0, function* () {
                // Ensure we are only assigning to string settings
                if (typeof this.plugin.settings[settingKey] === 'string') {
                    this.plugin.settings[settingKey] = value;
                    yield this.plugin.saveSettings();
                    this.plugin.updateStyles();
                }
                else {
                    console.error(`Cannot assign a string value to ${settingKey} (non-string setting).`);
                }
            }));
        });
    }
    // Reset settings to default values
    resetToDefault() {
        return __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
            yield this.plugin.saveSettings();
            this.plugin.updateStyles();
            new Notice('Settings have been reset to default.');
            this.display(); // Refresh the settings display
        });
    }
}
function getShapesCharacteristics() {
    return [
        {
            name: 'line',
            coordinates: 2,
            sides: 1,
            angles: 0,
            combinations: [
                { coordinates: 2 },
                { sides: 1, angles: 0, coordinates: 0 },
            ]
        },
        {
            name: 'triangle',
            coordinates: 3,
            sides: 1,
            angles: 0,
            combinations: [
                { coordinates: 3 },
                { sides: 3, angles: 0 },
                { sides: 2, angles: 1 },
                { angles: 2, sides: 1 } // 2 angles and 1 side (ASA)
            ]
        },
        {
            name: 'square',
            coordinates: 4,
            sides: 1,
            angles: 0,
            combinations: [
                { coordinates: 3 },
                { sides: 2 },
                { angles: 0 },
            ]
        }
    ];
}
class binomInfoModel extends Modal {
    constructor(app, source) {
        super(app);
        this.equal = 0;
        this.less = 0;
        this.lessEqual = 0;
        this.big = 0;
        this.bigEqual = 0;
        this.n = Number(source[1]);
        this.k = Number(source[2]);
        this.p = Number(source[3]);
    }
    onOpen() {
        this.assignProbability();
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Binomial Probability Results' });
        contentEl.createEl('p', { text: `P(X = ${this.k}) = ${this.equal}` });
        contentEl.createEl('p', { text: `P(X < ${this.k}) = ${this.less}` });
        contentEl.createEl('p', { text: `P(X <= ${this.k}) = ${this.lessEqual}` });
        contentEl.createEl('p', { text: `P(X > ${this.k}) = ${this.big}` });
        contentEl.createEl('p', { text: `P(X >= ${this.k}) = ${this.bigEqual}` });
    }
    getEqual() { ; return this.factorial(this.n, this.k, this.p); }
    factorial(n, k, p) {
        let sum = 1, sumK = 1, sumNK = 1;
        // Calculate factorials
        for (let i = 1; i <= n; i++) {
            sum *= i;
            if (i === k)
                sumK = sum;
            if (i === (n - k))
                sumNK = sum;
        }
        return sum / (sumK * sumNK) * Math.pow(p, k) * Math.pow(1 - p, n - k);
    }
    assignProbability() {
        for (let i = 0; i <= this.n; i++) {
            if (i === this.k) {
                this.equal = this.factorial(this.n, i, this.p);
            }
            if (i < this.k) {
                this.less += this.factorial(this.n, i, this.p);
            }
            if (i <= this.k) {
                this.lessEqual += this.factorial(this.n, i, this.p);
            }
            if (i > this.k) {
                this.big += this.factorial(this.n, i, this.p);
            }
            if (i >= this.k) {
                this.bigEqual += this.factorial(this.n, i, this.p);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQWdCLGdCQUFnQixFQUFFLGdCQUFnQixFQUFPLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBMEIsTUFBTSxVQUFVLENBQUM7QUFDcEosT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBYzdDLE1BQU0sZ0JBQWdCLEdBQXVCO0lBQzNDLGdCQUFnQixFQUFFLE1BQU07SUFDeEIsVUFBVSxFQUFFLFNBQVM7SUFDckIsaUJBQWlCLEVBQUUsU0FBUztJQUM1QixnQkFBZ0IsRUFBRSxTQUFTO0lBQzNCLG1CQUFtQixFQUFFLFNBQVM7SUFDOUIsUUFBUSxFQUFFLFFBQVE7SUFDbEIsVUFBVSxFQUFFLFVBQVU7SUFDdEIsUUFBUSxFQUFFLE1BQU07SUFDaEIsY0FBYyxFQUFFLEVBQUU7Q0FDbkIsQ0FBQztBQUVGLE1BQU0sQ0FBQyxPQUFPLE9BQU8sVUFBVyxTQUFRLE1BQU07SUFHdEMsTUFBTTs7WUFDVixvREFBb0Q7WUFDcEQsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM3RCxJQUFJLENBQUMsa0NBQWtDLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFFcEIsSUFBSSxDQUFDLFVBQVUsQ0FBQztnQkFDZCxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQixJQUFJLEVBQUUsaUJBQWlCO2dCQUN2QixRQUFRLEVBQUUsR0FBRyxFQUFFO29CQUNiLElBQUksZ0JBQWdCLENB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UyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQUM7WUFDdkUsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUMsRUFBRTtnQkFBQyxJQUFJLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQUM7WUFDaEUsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRTtnQkFBQyxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQUM7U0FDdkU7SUFDSCxDQUFDO0NBQ0YiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQbHVnaW4sIE1hcmtkb3duVmlldywgTWFya2Rvd25SZW5kZXJlciwgUGx1Z2luU2V0dGluZ1RhYiwgQXBwLCBTZXR0aW5nLCBNb2RhbCwgTm90aWNlLCBDb21wb25lbnQsIEVkaXRvciwgRWRpdG9yUG9zaXRpb24gfSBmcm9tICdvYnNpZGlhbic7XHJcbmltcG9ydCB7IGNvbnRyb2xsZXIgfSBmcm9tICcuL21hdGhFbmdpbmUuanMnO1xyXG4vLyBEZWZpbmUgdGhlIGludGVyZmFjZSBmb3IgcGx1Z2luIHNldHRpbmdzXHJcbmludGVyZmFjZSBNYXRoUGx1Z2luU2V0dGluZ3Mge1xyXG4gIG51bWJlckZvcm1hdHRpbmc6IHN0cmluZ1xyXG4gIGJhY2tncm91bmQ6IHN0cmluZztcclxuICBldmVuUm93QmFja2dyb3VuZDogc3RyaW5nO1xyXG4gIG9kZFJvd0JhY2tncm91bmQ6IHN0cmluZztcclxuICBpbmZvTW9kYWxCYWNrZ3JvdW5kOiBzdHJpbmc7XHJcbiAgZm9udFNpemU6IHN0cmluZztcclxuICByb3dQYWRkaW5nOiBzdHJpbmc7XHJcbiAgaWNvblNpemU6IHN0cmluZztcclxuICBzZXNzaW9uSGlzdG9yeTogeyBpbnB1dDogc3RyaW5nLCByZXN1bHQ6IHN0cmluZyB9W107IFxyXG59XHJcblxyXG5jb25zdCBERUZBVUxUX1NFVFRJTkdTOiBNYXRoUGx1Z2luU2V0dGluZ3MgPSB7XHJcbiAgbnVtYmVyRm9ybWF0dGluZzogJy4wMDAnLFxyXG4gIGJhY2tncm91bmQ6IGAjNDQ0NzVBYCxcclxuICBldmVuUm93QmFja2dyb3VuZDogJyNmOWY5ZjknLFxyXG4gIG9kZFJvd0JhY2tncm91bmQ6ICcjNzQ3Njg4JyxcclxuICBpbmZvTW9kYWxCYWNrZ3JvdW5kOiAnIzAwMkIzNicsXHJcbiAgZm9udFNpemU6ICcwLjg1ZW0nLFxyXG4gIHJvd1BhZGRpbmc6ICc1cHggMTBweCcsXHJcbiAgaWNvblNpemU6ICcxNHB4JyxcclxuICBzZXNzaW9uSGlzdG9yeTogW11cclxufTtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1hdGhQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xyXG4gIHNldHRpbmdzOiBNYXRoUGx1Z2luU2V0dGluZ3M7XHJcbiAgXHJcbiAgYXN5bmMgb25sb2FkKCkge1xyXG4gICAgLy8gTG9hZCBzZXR0aW5ncyBhbmQgcmVnaXN0ZXIgdGhlIG1hcmtkb3duIHByb2Nlc3NvclxyXG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcclxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTWF0aFBsdWdpblNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcignbWF0aC1lbmdpbmUnLCB0aGlzLnByb2Nlc3NNYXRoQmxvY2suYmluZCh0aGlzKSk7XHJcbiAgICB0aGlzLnVwZGF0ZVN0eWxlcygpO1xyXG5cclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiAnb3Blbi1pbnB1dC1mb3JtJyxcclxuICAgICAgbmFtZTogJ09wZW4gSW5wdXQgRm9ybScsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XHJcbiAgICAgICAgbmV3IEN1c3RvbUlucHV0TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogJ3ZpZXctc2Vzc2lvbi1oaXN0b3J5JyxcclxuICAgICAgbmFtZTogJ1ZpZXcgU2Vzc2lvbiBIaXN0b3J5JyxcclxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcclxuICAgICAgICBuZXcgSGlzdG9yeU1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuICBcclxuICBwcml2YXRlIHByb2Nlc3NNYXRoQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgbGV0IHVzZXJWYXJpYWJsZXM6IGFueVtdID0gW107XHJcbiAgICBsZXQgc2tpcHBlZEluZGV4ZXM9MFxyXG4gICAgZWwuY2xhc3NMaXN0LmFkZCgnbWF0aC1jb250YWluZXInKTtcclxuXHJcbiAgICBsZXQgZXhwcmVzc2lvbnMgPSBzb3VyY2Uuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+IGxpbmUudHJpbSgpICE9PSAnJyk7XHJcbiAgICBpZiAoZXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIGV4cHJlc3Npb25zID0gWycwJ107XHJcbiAgICB9XHJcblxyXG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaCgoZXhwcmVzc2lvbiwgaW5kZXgpID0+IHtcclxuICAgICAgZXhwcmVzc2lvbiA9IGV4cHJlc3Npb24ucmVwbGFjZSgvXFxzL2csIFwiXCIpO1xyXG4gICAgICB1c2VyVmFyaWFibGVzLmZvckVhY2goKHsgdmFyaWFibGUsIHZhbHVlIH0pID0+IHtcclxuICAgICAgICBjb25zdCB2YXJpYWJsZVJlZ2V4ID0gbmV3IFJlZ0V4cChgXFxcXGIke3ZhcmlhYmxlLnRyaW0oKX1cXFxcYmAsICdnJyk7IFxyXG4gICAgICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLnJlcGxhY2UodmFyaWFibGVSZWdleCwgdmFsdWUudHJpbSgpKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBpZiAoZXhwcmVzc2lvbi5zdGFydHNXaXRoKCd2YXInKSAmJiBleHByZXNzaW9uLmluY2x1ZGVzKCc9JykpIHtcclxuICAgICAgICBsZXQgc3BsaXRWYXIgPSBleHByZXNzaW9uLnN1YnN0cmluZygzKS5zcGxpdCgnPScpO1xyXG4gICAgICAgIGNvbnN0IGluZGV4ID0gdXNlclZhcmlhYmxlcy5maW5kSW5kZXgodiA9PiB2LnZhcmlhYmxlID09PSBzcGxpdFZhclswXS50cmltKCkpO1xyXG4gICAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgIHVzZXJWYXJpYWJsZXNbaW5kZXhdLnZhbHVlID0gc3BsaXRWYXJbMV0udHJpbSgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB1c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZTogc3BsaXRWYXJbMF0udHJpbSgpLCB2YWx1ZTogc3BsaXRWYXJbMV0udHJpbSgpIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBza2lwcGVkSW5kZXhlcysrO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgbGluZUNvbnRhaW5lciA9IGVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtbGluZS1jb250YWluZXInIH0pO1xyXG4gICAgICBsaW5lQ29udGFpbmVyLmFkZENsYXNzKChpbmRleC1za2lwcGVkSW5kZXhlcyklMiA9PT0gMCA/ICdtYXRoLXJvdy1ldmVuJyA6ICdtYXRoLXJvdy1vZGQnKTtcclxuICAgICAgY29uc3QgaW5wdXREaXYgPSBsaW5lQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtaW5wdXQnIH0pO1xyXG4gICAgICBjb25zdCByZXN1bHREaXYgPSBsaW5lQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtcmVzdWx0JyB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGJpbm9tUmVnZXggPSAvYmlub21cXCgoW1xcZC5dKyksKFtcXGQuXSspLChbXFxkLl0rKVxcKS87XHJcbiAgICAgIGNvbnN0IG1hdGNoID0gZXhwcmVzc2lvbi5tYXRjaChiaW5vbVJlZ2V4KTtcclxuXHJcbiAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgIGxldCBiaW5vbT1uZXcgYmlub21JbmZvTW9kZWwodGhpcy5hcHAsIG1hdGNoIClcclxuICAgICAgICBpbnB1dERpdi5pbm5lclRleHQgPSBgJHtleHByZXNzaW9ufWA7XHJcbiAgICAgICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGAke2Jpbm9tLmdldEVxdWFsKCl9YDtcclxuICAgICAgICBjb25zdCBpY29uc0RpdiA9IHRoaXMuY3JlYXRlSWNvbnNDb250YWluZXIoKTtcclxuICAgICAgICB0aGlzLmFkZEljb25MaXN0ZW5lcnMoaWNvbnNEaXYsIG1hdGNoLCdiaW5vbScpO1xyXG4gICAgICAgIGxpbmVDb250YWluZXIuYXBwZW5kKGlucHV0RGl2LCByZXN1bHREaXYsIGljb25zRGl2KTtcclxuICAgICAgICBlbC5hcHBlbmRDaGlsZChsaW5lQ29udGFpbmVyKTtcclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG5cclxuICAgICAgbGV0IHJlc3VsdDtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICByZXN1bHQgPSBjb250cm9sbGVyKGV4cHJlc3Npb24pO1xyXG4gICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgJFxceyR7cmVzdWx0LnByb2Nlc3NlZGlucHV0fVxcfSRgLCBpbnB1dERpdiwgJycsIHRoaXMpO1xyXG4gICAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bigvKHRydWV8ZmFsc2UpLy50ZXN0KHJlc3VsdC5zb2x1dGlvbikgPyByZXN1bHQuc29sdXRpb24gOiBgJFxceyR7cmVzdWx0LnNvbHV0aW9ufVxcfSRgLCByZXN1bHREaXYsICcnLCB0aGlzKTtcclxuICAgICAgICAgIGNvbnN0IGljb25zRGl2ID0gdGhpcy5jcmVhdGVJY29uc0NvbnRhaW5lcigpO1xyXG4gICAgICAgICAgdGhpcy5hZGRJY29uTGlzdGVuZXJzKGljb25zRGl2LCByZXN1bHQsJ2RlZmF1bHQnKTtcclxuICAgICAgICAgIGxpbmVDb250YWluZXIuYXBwZW5kKGlucHV0RGl2LCByZXN1bHREaXYsIGljb25zRGl2KTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oZXhwcmVzc2lvbiwgaW5wdXREaXYsICcnLCB0aGlzKTtcclxuICAgICAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiZXJyb3ItdGV4dFwiPiR7ZXJyLm1lc3NhZ2V9PC9zcGFuPmA7XHJcbiAgICAgICAgbGluZUNvbnRhaW5lci5hZGRDbGFzcygnbWF0aC1lcnJvci1saW5lJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGVsLmFwcGVuZENoaWxkKGxpbmVDb250YWluZXIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyBDcmVhdGUgaWNvbnMgY29udGFpbmVyXHJcbiAgcHJpdmF0ZSBjcmVhdGVJY29uc0NvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XHJcbiAgICBjb25zdCBpY29uc0RpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgaWNvbnNEaXYuY2xhc3NMaXN0LmFkZCgnbWF0aC1pY29ucycpO1xyXG4gICAgaWNvbnNEaXYuaW5uZXJIVE1MID0gYFxyXG4gICAgICA8c3BhbiBjbGFzcz1cIm1hdGgtaW5mby1pY29uXCI+8J+biDwvc3Bhbj5cclxuICAgICAgPHNwYW4gY2xhc3M9XCJtYXRoLWRlYnVnLWljb25cIj7wn5CePC9zcGFuPmA7XHJcbiAgICByZXR1cm4gaWNvbnNEaXY7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZEljb25MaXN0ZW5lcnMoaWNvbnNEaXY6IEhUTUxFbGVtZW50LCByZXN1bHQ6IGFueSxpbmZvTW9kZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBpY29uc0Rpdi5xdWVyeVNlbGVjdG9yKCcubWF0aC1pbmZvLWljb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIHN3aXRjaCAoaW5mb01vZGUpIHtcclxuICAgICAgICBjYXNlICdiaW5vbSc6XHJcbiAgICAgICAgICBuZXcgYmlub21JbmZvTW9kZWwodGhpcy5hcHAsIHJlc3VsdCkub3BlbigpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHJlc3VsdC5tYXRoSW5mbywgcmVzdWx0LnNvbHV0aW9uSW5mbykub3BlbigpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIGljb25zRGl2LnF1ZXJ5U2VsZWN0b3IoJy5tYXRoLWRlYnVnLWljb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCByZXN1bHQuZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vIExvYWQgc2V0dGluZ3NcclxuICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcclxuICB9XHJcblxyXG4gIC8vIFNhdmUgc2V0dGluZ3NcclxuICBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XHJcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xyXG4gIH1cclxuXHJcbiAgLy8gVXBkYXRlIHN0eWxlcyBiYXNlZCBvbiBzZXR0aW5nc1xyXG4gIHVwZGF0ZVN0eWxlcygpIHtcclxuICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLXJvdy1iYWNrZ3JvdW5kJywgdGhpcy5zZXR0aW5ncy5iYWNrZ3JvdW5kKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tZXZlbi1yb3ctYmFja2dyb3VuZCcsIHRoaXMuc2V0dGluZ3MuZXZlblJvd0JhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1vZGQtcm93LWJhY2tncm91bmQnLCB0aGlzLnNldHRpbmdzLm9kZFJvd0JhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1pbmZvLW1vZGFsLWNvbHVtbi1iYWNrZ3JvdW5kJywgdGhpcy5zZXR0aW5ncy5pbmZvTW9kYWxCYWNrZ3JvdW5kKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tZm9udC1zaXplJywgdGhpcy5zZXR0aW5ncy5mb250U2l6ZSk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLXJvdy1wYWRkaW5nJywgdGhpcy5zZXR0aW5ncy5yb3dQYWRkaW5nKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0taWNvbi1zaXplJywgdGhpcy5zZXR0aW5ncy5pY29uU2l6ZSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgQ3VzdG9tSW5wdXRNb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgdXNlckNob2ljZTogbnVtYmVyID0gMDtcclxuICB1c2VyQ29vcmRpbmF0ZXNJbnB1dDogc3RyaW5nID0gJygwLDApLCgxLDApLCgxLDEpJztcclxuICB1c2VyU2lkZXNJbnB1dDogc3RyaW5nID0gJyc7XHJcbiAgdXNlckFuZ2xlc0lucHV0OiBzdHJpbmcgPSAnJztcclxuICByZXN1bHRDb250YWluZXI6IEhUTUxFbGVtZW50O1xyXG4gIHNoYXBlc0NoYXJhY3RlcmlzdGljczogYW55O1xyXG4gIGV2YWxlZFVzZXJJbnB1dEluZm86IGFueSA9IG51bGw7XHJcbiAgc2F2ZWRWYWx1ZXM6IGFueSA9IHt9O1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBNYXRoUGx1Z2luKSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdFbnRlciBNYXRoIEV4cHJlc3Npb24nIH0pO1xyXG5cclxuICAgIC8vIEFzc2lnbiBzaGFwZXNDaGFyYWN0ZXJpc3RpY3MgZ2xvYmFsbHlcclxuICAgIHRoaXMuc2hhcGVzQ2hhcmFjdGVyaXN0aWNzID0gZ2V0U2hhcGVzQ2hhcmFjdGVyaXN0aWNzKCk7XHJcblxyXG4gICAgY29uc3Qgc2V0dGluZ3NDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiAnc2V0dGluZ3MtY29udGFpbmVyJyB9KTtcclxuICAgIGNvbnN0IGR5bmFtaWNGaWVsZENvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICdkeW5hbWljLWZpZWxkLWNvbnRhaW5lcicgfSk7XHJcbiAgICBjb25zdCB0aWt6R3JhcGhDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiAnZHluYW1pYy1maWVsZC1jb250YWluZXInIH0pO1xyXG4gICAgY29uc3Qgc3VibWl0QnV0dG9uID0gY29udGVudEVsLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdTdWJtaXQnLCBhdHRyOiB7IGRpc2FibGVkOiAndHJ1ZScgfSB9KTtcclxuICAgIGNvbnN0IHRlbXBvcmFyeURlYnVnQXJlYSA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICd0ZW1wb3JhcnktZGVidWctYXJlYScgfSk7XHJcbiAgICBzdWJtaXRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLmV2YWxlZFVzZXJJbnB1dEluZm8gJiYgdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvLm1lZXRzTWluUmVxdWlyZW1lbnRzKSB7XHJcbiAgICAgICAgdGhpcy5oYW5kbGVTdWJtaXQoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBuZXcgTm90aWNlKCdQbGVhc2UgZW50ZXIgdmFsaWQgaW5wdXQuJyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKHNldHRpbmdzQ29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnQ2hvb3NlIHNoYXBlJylcclxuICAgICAgLnNldERlc2MoJ1NlbGVjdCB0aGUgc2hhcGUgdG8gcGVyZm9ybSB0aGUgb3BlcmF0aW9ucyBvbi4nKVxyXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4ge1xyXG4gICAgICAgIHRoaXMuc2hhcGVzQ2hhcmFjdGVyaXN0aWNzLmZvckVhY2goKHNoYXBlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihpbmRleC50b1N0cmluZygpLCBzaGFwZS5uYW1lKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnVzZXJDaG9pY2UgPSAwO1xyXG4gICAgICAgIHRoaXMucmVuZGVyRHluYW1pY0ZpZWxkcyhkeW5hbWljRmllbGRDb250YWluZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGRyb3Bkb3duLm9uQ2hhbmdlKHZhbHVlID0+IHtcclxuICAgICAgICAgIHRoaXMudXNlckNob2ljZSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICAgICAgICB0aGlzLnJlbmRlckR5bmFtaWNGaWVsZHMoZHluYW1pY0ZpZWxkQ29udGFpbmVyKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICBcclxuICAgIGNvbnRlbnRFbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHtcclxuICAgICAgaWYgKHRoaXMuZXZhbGVkVXNlcklucHV0SW5mby5tZWV0c01pblJlcXVpcmVtZW50cykge1xyXG4gICAgICAgIHN1Ym1pdEJ1dHRvbi5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XHJcbiAgICAgICAgdGlrekdyYXBoQ29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAgICAgdGVtcG9yYXJ5RGVidWdBcmVhLmVtcHR5KCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc3VibWl0QnV0dG9uLnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAndHJ1ZScpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIFxyXG4gIH1cclxuXHJcbiAgcmVuZGVyRHluYW1pY0ZpZWxkcyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIuZmluZEFsbCgnLmR5bmFtaWMtZmllbGQnKS5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZSgpKTtcclxuICAgIGNvbnN0IHNoYXBlID0gdGhpcy5zaGFwZXNDaGFyYWN0ZXJpc3RpY3NbdGhpcy51c2VyQ2hvaWNlXTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdDb29yZGluYXRlcycpXHJcbiAgICAgIC5zZXREZXNjKGBFbnRlciAke3NoYXBlLmNvb3JkaW5hdGVzfSBjb29yZGluYXRlcyBmb3IgJHtzaGFwZS5uYW1lfSBpbiAoeCwgeSkgZm9ybWF0YClcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnVzZXJDb29yZGluYXRlc0lucHV0fHwnJyk7IFxyXG4gICAgICAgIHRleHQub25DaGFuZ2UodmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy51c2VyQ29vcmRpbmF0ZXNJbnB1dCA9IHZhbHVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KVxyXG4gICAgICAuc2V0dGluZ0VsLmFkZENsYXNzKCdkeW5hbWljLWZpZWxkJyk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnU2lkZXMnKVxyXG4gICAgICAuc2V0RGVzYyhgRW50ZXIgJHtzaGFwZS5jb29yZGluYXRlc30gc2lkZXMgZm9yICR7c2hhcGUubmFtZX1gKVxyXG4gICAgICAuYWRkVGV4dCh0ZXh0ID0+IHtcclxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMudXNlclNpZGVzSW5wdXR8fCcnKTsgXHJcbiAgICAgICAgdGV4dC5vbkNoYW5nZSh2YWx1ZSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnVzZXJTaWRlc0lucHV0ID0gdmFsdWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5zZXR0aW5nRWwuYWRkQ2xhc3MoJ2R5bmFtaWMtZmllbGQnKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdBbmdsZXMnKVxyXG4gICAgICAuc2V0RGVzYyhgRW50ZXIgJHtzaGFwZS5jb29yZGluYXRlc30gYW5nbGVzIGZvciAke3NoYXBlLm5hbWV9YClcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnVzZXJBbmdsZXNJbnB1dHx8JycpO1xyXG4gICAgICAgIHRleHQub25DaGFuZ2UodmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy51c2VyQW5nbGVzSW5wdXQgPSB2YWx1ZTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSlcclxuICAgICAgLnNldHRpbmdFbC5hZGRDbGFzcygnZHluYW1pYy1maWVsZCcpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lcilcclxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cclxuICAgICAgICBidXR0b25cclxuICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDbGVhcicpXHJcbiAgICAgICAgICAuc2V0VG9vbHRpcCgnQ2xlYXIgYWxsIHByZXZpb3VzIGZpZWxkcycpXHJcbiAgICAgICAgICAub25DbGljaygoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudXNlckNvb3JkaW5hdGVzSW5wdXQ9Jyc7XHJcbiAgICAgICAgICAgIHRoaXMudXNlclNpZGVzSW5wdXQ9Jyc7XHJcbiAgICAgICAgICAgIHRoaXMudXNlckFuZ2xlc0lucHV0PScnO1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlckR5bmFtaWNGaWVsZHMoY29udGFpbmVyKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgIClcclxuICAgICAgLnNldHRpbmdFbC5hZGRDbGFzcygnZHluYW1pYy1maWVsZCcpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVTdWJtaXQoKSB7XHJcblxyXG4gICAgICBjb25zdCByZXN1bHQgPSB0aGlzLmV2YWxlZFVzZXJJbnB1dEluZm87XHJcbiAgICAgIHRoaXMucmVzdWx0Q29udGFpbmVyLnRleHRDb250ZW50ID0gSlNPTi5zdHJpbmdpZnkocmVzdWx0KTtcclxuXHJcbiAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnNlc3Npb25IaXN0b3J5LnB1c2goe1xyXG4gICAgICAgIGlucHV0OiB0aGlzLnVzZXJBbmdsZXNJbnB1dCxcclxuICAgICAgICByZXN1bHQ6IHJlc3VsdFxyXG4gICAgICB9KTtcclxuICAgICAgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICBcclxuICB9XHJcbiAgb25DbG9zZSgpIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcbi8vIEN1c3RvbSBIaXN0b3J5IE1vZGFsIGNsYXNzIGZvciBzZXNzaW9uIGhpc3RvcnlcclxuY2xhc3MgSGlzdG9yeU1vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnU2Vzc2lvbiBIaXN0b3J5JyB9KTtcclxuXHJcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBoaXN0b3J5LCBkaXNwbGF5IGEgbWVzc2FnZVxyXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnNlc3Npb25IaXN0b3J5Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICdObyBzZXNzaW9uIGhpc3RvcnkgZm91bmQuJyB9KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc3BsYXkgZWFjaCBzZXNzaW9uIGluIHRoZSBoaXN0b3J5XHJcbiAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeS5mb3JFYWNoKChzZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgICBjb25zdCBzZXNzaW9uRGl2ID0gY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2hpc3Rvcnktc2Vzc2lvbicgfSk7XHJcbiAgICAgIHNlc3Npb25EaXYuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiBgU2Vzc2lvbiAke2luZGV4ICsgMX1gIH0pO1xyXG4gICAgICBzZXNzaW9uRGl2LmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgSW5wdXQ6ICR7c2Vzc2lvbi5pbnB1dH1gIH0pO1xyXG4gICAgICBzZXNzaW9uRGl2LmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUmVzdWx0OiAke3Nlc3Npb24ucmVzdWx0fWAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDbG9zZSBidXR0b25cclxuICAgIGNvbnN0IGNsb3NlQnV0dG9uID0gY29udGVudEVsLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdDbG9zZScgfSk7XHJcbiAgICBjbG9zZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuZW1wdHkoKTsgLy8gQ2xlYW4gdXAgbW9kYWwgY29udGVudCBvbiBjbG9zZVxyXG4gIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIEluZm9Nb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBtYXRoSW5mbzogc3RyaW5nW107XHJcbiAgc29sdXRpb25JbmZvOiBzdHJpbmdbXTtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIG1hdGhJbmZvOiBzdHJpbmdbXSwgc29sdXRpb25JbmZvOiBzdHJpbmdbXSkge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMubWF0aEluZm8gPSBtYXRoSW5mbztcclxuICAgIHRoaXMuc29sdXRpb25JbmZvID0gc29sdXRpb25JbmZvO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoJ2luZm8tbW9kYWwtc3R5bGUnKTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdSZXN1bHQgRGV0YWlscycsIGNsczogJ2luZm8tbW9kYWwtdGl0bGUnIH0pO1xyXG5cclxuICAgIC8vIEFkZCBjb250ZW50IGFuZCBidXR0b24gZm9yIGNvcHlpbmcgZGV0YWlsc1xyXG4gICAgdGhpcy5wb3B1bGF0ZUNvbnRlbnQoY29udGVudEVsKTtcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBwb3B1bGF0ZUNvbnRlbnQoY29udGVudEVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgXHJcbiAgICBjb25zdCBjb2x1bW5Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnaW5mby1tb2RhbC1tYWluLWNvbnRhaW5lcicgfSk7XHJcbiAgICBcclxuICAgIHRoaXMubWF0aEluZm8uZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgY29uc3QgbGluZUNvbnRhaW5lciA9IGNvbHVtbkNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLWxpbmUtY29udGFpbmVyJyB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGxlZnRMaW5lID0gbGluZUNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLWxlZnQtbGluZScgfSk7XHJcbiAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYCRcXHtcXFxcYmVnaW57YWxpZ25lZH0mJHtsaW5lfVxcXFxlbmR7YWxpZ25lZH1cXH0kYCwgbGVmdExpbmUsICcnLCBuZXcgQ29tcG9uZW50KCkpO1xyXG5cclxuICAgICAgY29uc3QgcmlnaHRMaW5lID0gbGluZUNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLXJpZ2h0LWxpbmUnIH0pO1xyXG4gICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGAkXFx7XFxcXGJlZ2lue2FsaWduZWR9JiR7dGhpcy5zb2x1dGlvbkluZm9baW5kZXhdIHx8ICcnfVxcXFxlbmR7YWxpZ25lZH1cXH0kYCwgcmlnaHRMaW5lLCAnJywgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLUNvcHktYnV0dG9uLWNvbnRhaW5lcicgfSk7XHJcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0NvcHkgRGV0YWlscycsIGNsczogJ2luZm8tbW9kYWwtQ29weS1idXR0b24nIH0pO1xyXG5cclxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy5tYXRoSW5mby5qb2luKCdcXG4nKSk7XHJcbiAgICAgIG5ldyBOb3RpY2UoJ0RldGFpbHMgY29waWVkIHRvIGNsaXBib2FyZCEnKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgb25DbG9zZSgpIHtcclxuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBEZWJ1Z01vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIGRlYnVnSW5mbzogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgZGVidWdJbmZvOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICB0aGlzLmRlYnVnSW5mbyA9IGRlYnVnSW5mbztcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmFkZENsYXNzKCdjdXN0b20tbW9kYWwtc3R5bGUnKTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdEZWJ1ZyBJbmZvcm1hdGlvbicsIGNsczogJ2RlYnVnLU1vZGFsLXRpdGxlJyB9KTtcclxuXHJcbiAgICBjb25zdCBkZWJ1Z0NvbnRlbnQgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnZGVidWctaW5mby1jb250YWluZXInIH0pO1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFxgXFxgXFxganNcXG4ke3RoaXMuZGVidWdJbmZvfVxcblxcYFxcYFxcYGAsIGRlYnVnQ29udGVudCwgJycsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCkge1xyXG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuY2xhc3MgTWF0aFBsdWdpblNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcclxuICBwbHVnaW46IE1hdGhQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE1hdGhQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcbiAgICBjb25zdCB0b1NldE9wdGlvbnM9W1xyXG4gICAgICB7dmFsdWU6IDEwMDAsZGlzcGxheTogJ2Zvcm1hdHRlZCAuMDAwJyB9LFxyXG4gICAgICB7dmFsdWU6IDEwMDAwLGRpc3BsYXk6ICdmb3JtYXR0ZWQgLjAwMDAnIH0sXHJcbiAgICAgIHt2YWx1ZTogMTAwMDAwLGRpc3BsYXk6ICdmb3JtYXR0ZWQgLjAwMDAwJyB9LFxyXG4gICAgXVxyXG5cclxuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdNYXRoIFBsdWdpbiBTZXR0aW5ncycgfSk7XHJcbiAgICB0aGlzLmFkZE11bHRpQ2hvaWNlU2V0dGluZyhjb250YWluZXJFbCwgJ1JlbmRlcmVkIG51bWJlciBmb3JtYXQnLCAnQ2hvb3NlIGhvdyB0byBmb3JtYXQgbnVtYmVycyBpbiB0aGUgcmVzdWx0JywgdG9TZXRPcHRpb25zLCdudW1iZXJGb3JtYXR0aW5nJyk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdNYXRoIFBsdWdpbiBzdHlsZScgfSk7XHJcblxyXG4gICAgLy8gQWRkIHZhcmlvdXMgc2V0dGluZ3NcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnQmFja2dyb3VuZCBDb2xvcicsICdTZXQgdGhlIGJhY2tncm91bmQgY29sb3IuJywgJ2JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnRXZlbiBSb3cgQmFja2dyb3VuZCBDb2xvcicsICdTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIGV2ZW4gcm93cy4nLCAnZXZlblJvd0JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnT2RkIFJvdyBCYWNrZ3JvdW5kIENvbG9yJywgJ1NldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3Igb2RkIHJvd3MuJywgJ29kZFJvd0JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnaW5mb01vZGFsIEJhY2tncm91bmQgQ29sb3InLCAnU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciB0aGUgaW5mbyBtb2RhbC4nLCAnaW5mb01vZGFsQmFja2dyb3VuZCcpO1xyXG4gICAgdGhpcy5hZGRGb250U2V0dGluZyhjb250YWluZXJFbCwgJ0ZvbnQgU2l6ZScsICdTZXQgdGhlIGZvbnQgc2l6ZSBmb3IgdGhlIHJvd3MuJywgJ2ZvbnRTaXplJyk7XHJcbiAgICB0aGlzLmFkZEZvbnRTZXR0aW5nKGNvbnRhaW5lckVsLCAnUm93IFBhZGRpbmcnLCAnU2V0IHRoZSBwYWRkaW5nIGZvciB0aGUgcm93cy4nLCAncm93UGFkZGluZycpO1xyXG4gICAgdGhpcy5hZGRGb250U2V0dGluZyhjb250YWluZXJFbCwgJ0ljb24gU2l6ZScsICdTZXQgdGhlIHNpemUgb2YgdGhlIGljb25zLicsICdpY29uU2l6ZScpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxyXG4gICAgICAgIGJ1dHRvblxyXG4gICAgICAgICAgLnNldEJ1dHRvblRleHQoJ1dpcGUgSGlzdG9yeSBNb2R1bGUnKVxyXG4gICAgICAgICAgLy8uc2V0VG9vbHRpcCgnUmVzZXQgYWxsIHNldHRpbmdzIHRvIHRoZWlyIGRlZmF1bHQgdmFsdWVzJylcclxuICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2Vzc2lvbkhpc3RvcnkgPSBbXTtcclxuICAgICAgICAgICBuZXcgTm90aWNlKCdIaXN0b3J5IHdhcyB3aXBlZC4nKVxyXG4gICAgICAgICAgfSkpO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxyXG4gICAgICBidXR0b25cclxuICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUmVzZXQgdG8gRGVmYXVsdCcpXHJcbiAgICAgICAgLnNldFRvb2x0aXAoJ1Jlc2V0IGFsbCBzZXR0aW5ncyB0byB0aGVpciBkZWZhdWx0IHZhbHVlcycpXHJcbiAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5yZXNldFRvRGVmYXVsdCgpO1xyXG4gICAgICAgIH0pKTtcclxuICB9XHJcbiAgcHJpdmF0ZSBhZGRNdWx0aUNob2ljZVNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIGNob2ljZXM6IGFueSxzZXR0aW5nS2V5OiBrZXlvZiBNYXRoUGx1Z2luU2V0dGluZ3MpIHtcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRGb250U2V0dGluZyAoc3RyaW5nIGV4cGVjdGVkKS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcclxuICAgICAgICBjaG9pY2VzLmZvckVhY2goKGNob2ljZTogYW55KSA9PiB7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oY2hvaWNlLnZhbHVlLGNob2ljZS5kaXNwbGF5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBrZXlvZiBNYXRoUGx1Z2luU2V0dGluZ3MpIHtcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRTZXR0aW5nIChzdHJpbmcgZXhwZWN0ZWQpLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKG5hbWUpXHJcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxyXG4gICAgICAuYWRkQ29sb3JQaWNrZXIoY29sb3JQaWNrZXIgPT4ge1xyXG4gICAgICAgIGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzW3NldHRpbmdLZXldO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0eXBlb2Ygc2V0dGluZ1ZhbHVlID09PSAnc3RyaW5nJykgeyBcclxuICAgICAgICAgIGNvbG9yUGlja2VyLnNldFZhbHVlKHNldHRpbmdWYWx1ZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbG9yUGlja2VyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnBsdWdpbi5zZXR0aW5nc1tzZXR0aW5nS2V5XSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgQ2Fubm90IGFzc2lnbiBhIHN0cmluZyB2YWx1ZSB0byAke3NldHRpbmdLZXl9IChub24tc3RyaW5nIHNldHRpbmcpLmApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBhZGRGb250U2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleToga2V5b2YgTWF0aFBsdWdpblNldHRpbmdzKSB7XHJcbiAgICAvLyBFbnN1cmUgdGhhdCAnc2Vzc2lvbkhpc3RvcnknIGlzIG5vdCBiZWluZyBwcm9jZXNzZWQgYnkgYWRkRm9udFNldHRpbmdcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRGb250U2V0dGluZyAoc3RyaW5nIGV4cGVjdGVkKS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICBcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ1ZhbHVlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIHNldHRpbmcgaXMgYSBzdHJpbmdcclxuICAgICAgICBpZiAodHlwZW9mIHNldHRpbmdWYWx1ZSA9PT0gJ3N0cmluZycpIHsgXHJcbiAgICAgICAgICB0ZXh0LnNldFBsYWNlaG9sZGVyKHNldHRpbmdWYWx1ZSkuc2V0VmFsdWUoc2V0dGluZ1ZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGV4dC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIC8vIEVuc3VyZSB3ZSBhcmUgb25seSBhc3NpZ25pbmcgdG8gc3RyaW5nIHNldHRpbmdzXHJcbiAgICAgICAgICBpZiAodHlwZW9mIHRoaXMucGx1Z2luLnNldHRpbmdzW3NldHRpbmdLZXldID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5nc1tzZXR0aW5nS2V5XSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4udXBkYXRlU3R5bGVzKCk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBDYW5ub3QgYXNzaWduIGEgc3RyaW5nIHZhbHVlIHRvICR7c2V0dGluZ0tleX0gKG5vbi1zdHJpbmcgc2V0dGluZykuYCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuICBcclxuICAvLyBSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0IHZhbHVlc1xyXG4gIHByaXZhdGUgYXN5bmMgcmVzZXRUb0RlZmF1bHQoKSB7XHJcbiAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xyXG4gICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB0aGlzLnBsdWdpbi51cGRhdGVTdHlsZXMoKTtcclxuICAgIG5ldyBOb3RpY2UoJ1NldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byBkZWZhdWx0LicpO1xyXG4gICAgdGhpcy5kaXNwbGF5KCk7IC8vIFJlZnJlc2ggdGhlIHNldHRpbmdzIGRpc3BsYXlcclxuICB9XHJcbn1cclxuZnVuY3Rpb24gZ2V0U2hhcGVzQ2hhcmFjdGVyaXN0aWNzKCl7XHJcbiAgcmV0dXJuIFtcclxuICAgIHtcclxuICAgICAgbmFtZTogJ2xpbmUnLCBcclxuICAgICAgY29vcmRpbmF0ZXM6IDIsXHJcbiAgICAgIHNpZGVzOiAxLFxyXG4gICAgICBhbmdsZXM6MCxcclxuICAgICAgY29tYmluYXRpb25zOiBbXHJcbiAgICAgICAgeyBjb29yZGluYXRlczogMn0sXHJcbiAgICAgICAgeyBzaWRlczogMSxhbmdsZXM6IDAsY29vcmRpbmF0ZXM6IDB9LFxyXG4gICAgICBdXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAndHJpYW5nbGUnLCBcclxuICAgICAgY29vcmRpbmF0ZXM6IDMsIFxyXG4gICAgICBzaWRlczogMSxcclxuICAgICAgYW5nbGVzOjAsXHJcbiAgICAgIGNvbWJpbmF0aW9uczogW1xyXG4gICAgICAgIHsgY29vcmRpbmF0ZXM6IDN9LFxyXG4gICAgICAgIHsgc2lkZXM6IDMsIGFuZ2xlczogMCB9LCAvLyAzIHNpZGVzLCBhdCBsZWFzdCAxIGFuZ2xlXHJcbiAgICAgICAgeyBzaWRlczogMiwgYW5nbGVzOiAxIH0sIC8vIDIgc2lkZXMgYW5kIDEgYW5nbGUgKFNBUylcclxuICAgICAgICB7IGFuZ2xlczogMiwgc2lkZXM6IDEgfSAgLy8gMiBhbmdsZXMgYW5kIDEgc2lkZSAoQVNBKVxyXG4gICAgICBdXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAnc3F1YXJlJyxcclxuICAgICAgY29vcmRpbmF0ZXM6IDQsXHJcbiAgICAgIHNpZGVzOiAxLFxyXG4gICAgICBhbmdsZXM6MCxcclxuICAgICAgY29tYmluYXRpb25zOiBbXHJcbiAgICAgICAgeyBjb29yZGluYXRlczogM30sIFxyXG4gICAgICAgIHsgc2lkZXM6IDJ9LFxyXG4gICAgICAgIHsgYW5nbGVzOiAwfSwgIFxyXG4gICAgICBdXHJcbiAgICB9XHJcbiAgXTtcclxufVxyXG5cclxuY2xhc3MgYmlub21JbmZvTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcblxyXG4gIHByaXZhdGUgZXF1YWw6IG51bWJlciA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgbGVzc0VxdWFsOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgYmlnOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWw6IG51bWJlciA9IDA7XHJcbiAgXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogYW55KSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy5uID0gTnVtYmVyKHNvdXJjZVsxXSk7IFxyXG4gICAgdGhpcy5rID0gTnVtYmVyKHNvdXJjZVsyXSk7IFxyXG4gICAgdGhpcy5wID0gTnVtYmVyKHNvdXJjZVszXSk7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICB0aGlzLmFzc2lnblByb2JhYmlsaXR5KCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzJyB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcclxuICB9XHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlcns7cmV0dXJuIHRoaXMuZmFjdG9yaWFsKHRoaXMubix0aGlzLmssdGhpcy5wKX1cclxuXHJcbiAgcHJpdmF0ZSBmYWN0b3JpYWwobjogbnVtYmVyLCBrOiBudW1iZXIsIHA6IG51bWJlcikge1xyXG4gICAgbGV0IHN1bSA9IDEsIHN1bUsgPSAxLCBzdW1OSyA9IDE7XHJcbiAgICBcclxuICAgIC8vIENhbGN1bGF0ZSBmYWN0b3JpYWxzXHJcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBuOyBpKyspIHtcclxuICAgICAgc3VtICo9IGk7XHJcbiAgICAgIGlmIChpID09PSBrKSBzdW1LID0gc3VtO1xyXG4gICAgICBpZiAoaSA9PT0gKG4gLSBrKSkgc3VtTksgPSBzdW07XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3VtIC8gKHN1bUsgKiBzdW1OSykgKiBNYXRoLnBvdyhwLCBrKSAqIE1hdGgucG93KDEgLSBwLCBuIC0gayk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzc2lnblByb2JhYmlsaXR5KCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykge3RoaXMuZXF1YWwgPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA8IHRoaXMuaykge3RoaXMubGVzcyArPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHt0aGlzLmxlc3NFcXVhbCArPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA+IHRoaXMuaykge3RoaXMuYmlnICs9IHRoaXMuZmFjdG9yaWFsKHRoaXMubiwgaSwgdGhpcy5wKTt9XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykge3RoaXMuYmlnRXF1YWwgKz0gdGhpcy5mYWN0b3JpYWwodGhpcy5uLCBpLCB0aGlzLnApO31cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuIl19