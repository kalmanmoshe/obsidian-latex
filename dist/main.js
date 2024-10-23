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
            // Handle variable declaration
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
            this.evaledUserInputInfo = this.testMinInputRequirements();
            if (this.evaledUserInputInfo.meetsMinRequirements) {
                submitButton.removeAttribute('disabled');
                tikzGraphContainer.empty();
                MarkdownRenderer.renderMarkdown(createTikzGraph(this.evaledUserInputInfo), tikzGraphContainer, '', new Component);
                temporaryDebugArea.empty();
                MarkdownRenderer.renderMarkdown(`\`\`\`js\n${JSON.stringify(this.evaledUserInputInfo, null, 0.01)}\n\`\`\`` + createTikzGraph(this.evaledUserInputInfo), temporaryDebugArea, '', new Component);
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
    testMinInputRequirements() {
        const objectifiedCoordinates = splitCoordinates(this.userCoordinatesInput), objectifiedSides = splitSides(this.userSidesInput), objectifiedAngles = splitAngles(this.userAnglesInput);
        const shapeName = this.shapesCharacteristics[this.userChoice].name;
        const isShapeValid = checkShapeRequirements(shapeName, objectifiedCoordinates, objectifiedSides, objectifiedAngles);
        if (isShapeValid) {
            if (!this.resultContainer) {
                this.resultContainer = this.contentEl.createEl('div', { cls: 'input-modal-result-container' });
            }
            this.resultContainer.classList.remove('input-modal-result-err');
            this.resultContainer.classList.add('input-modal-result-container');
        }
        else {
            if (!this.resultContainer) {
                this.resultContainer = this.contentEl.createEl('div', { cls: 'input-modal-result-err' });
            }
            this.resultContainer.classList.remove('input-modal-result-container');
            this.resultContainer.classList.add('input-modal-result-err');
        }
        return { meetsMinRequirements: isShapeValid, shape: shapeName, coordinates: objectifiedCoordinates, sides: objectifiedSides, angles: objectifiedAngles };
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
function createTikzGraph(userInput) {
    const shapesCharacteristics = getShapesCharacteristics(), beginGraph = `\`\`\`tikz\n`, endGraph = `\n\`\`\``;
    let displayPictureOption = String.raw `[scale=1pt, x=1cm, y=1cm,white]`;
    userInput = nameTheShape(userInput.shape, userInput.coordinates, userInput.sides, userInput.angles);
    return `\`\`\`js\n` + JSON.stringify(userInput + calculateShape(userInput), null, 0.01) + endGraph;
}
function calculateShape(userInput) {
    const shapesCharacteristics = getShapesCharacteristics();
    let coordinates = userInput.coordinates;
    let lengths = [];
    for (let i = 0; i < coordinates.length; i++) {
        let secondCoordinate = i !== coordinates.length - 1 ? i + 1 : 0;
        console.log(i, coordinates.length, i === coordinates.length - 1);
        lengths.push({
            edge1: coordinates[i].name,
            edge2: coordinates[secondCoordinate].name,
            length: findLength(coordinates[i], coordinates[secondCoordinate])
        });
    }
    return JSON.stringify(lengths);
}
function findLength(coordinate1, coordinate2) {
    const valueX = coordinate1.x - coordinate2.x;
    const valueY = coordinate1.y - coordinate2.y;
    return Math.sqrt(Math.pow(valueX, 2) + Math.pow(valueY, 2));
}
function reconstructCoordinates(coordinates) {
}
function nameTheShape(shape, coordinates, sides, angles) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let unnamedIndex = 0;
    let usedNames = new Set();
    function assignUniqueName() {
        while (usedNames.has(alphabet[unnamedIndex])) {
            unnamedIndex++;
        }
        const newName = alphabet[unnamedIndex++];
        usedNames.add(newName);
        return newName;
    }
    // Process coordinates
    let newCoordinates = coordinates.map(coordinate => {
        if (!coordinate.name) {
            coordinate.name = assignUniqueName();
        }
        usedNames.add(coordinate.name);
        return { name: coordinate.name, x: coordinate.x, y: coordinate.y };
    });
    let newSides = sides.map(side => {
        if (!side.name) {
            side.name = assignUniqueName();
        }
        usedNames.add(side.name);
        return { name: side.name, length: side.length };
    });
    let newAngles = angles.map(angle => {
        if (!angle.name) {
            angle.name = assignUniqueName();
        }
        usedNames.add(angle.name);
        return { name: angle.name, degrees: angle.degrees };
    });
    return {
        shape: shape,
        coordinates: newCoordinates,
        sides: newSides,
        angles: newAngles
    };
}
function checkShapeRequirements(shapeName, objectifiedCoordinates, objectifiedSides, objectifiedAngles) {
    const shapesCharacteristics = getShapesCharacteristics();
    const shape = shapesCharacteristics.find(s => s.name === shapeName);
    if (!shape) {
        throw new Error(`criteria for shape "${shapeName}" not found`);
    }
    const isValidCombination = shape.combinations.some(combo => {
        const hasValidcoords = combo.coordinates ? objectifiedCoordinates.length >= combo.coordinates : true;
        const hasValidSides = combo.sides ? objectifiedSides.length >= combo.sides : true;
        const hasValidAngles = combo.angles ? objectifiedAngles.length >= combo.angles : true;
        return hasValidSides && hasValidAngles && hasValidcoords;
    });
    return isValidCombination;
}
function splitCoordinates(input) {
    input = input.replace(/\s/g, "");
    const regex = /\((\d+),(\d+)\)([a-zA-Z]{1,5})?/g;
    const matches = [];
    let match;
    while ((match = regex.exec(input)) !== null) {
        const [fullInput, x, y, name] = match;
        matches.push(Object.assign({ x: Number(x), y: Number(y) }, (name ? { name } : {})));
    }
    return matches;
}
function splitSides(input) {
    input = input.replace(/\s/g, "");
    const regex = /([a-zA-Z]{1,5})?=?(\d+)/g;
    const matches = [];
    let match;
    while ((match = regex.exec(input)) !== null) {
        const [fullInput, name, value] = match;
        matches.push(Object.assign({ value: Number(value) }, (name ? { name } : {})));
    }
    return matches;
}
function splitAngles(input) {
    input = input.replace(/\s/g, "");
    const regex = /([a-zA-Z]{1,5})?=?(\d+)/g;
    const matches = [];
    let match;
    while ((match = regex.exec(input)) !== null) {
        const [fullInput, name, value] = match;
        matches.push(Object.assign({ value: Number(value) }, (name ? { name } : {})));
    }
    return matches;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQWdCLGdCQUFnQixFQUFFLGdCQUFnQixFQUFPLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBMEIsTUFBTSxVQUFVLENBQUM7QUFDcEosT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBYzdDLE1BQU0sZ0JBQWdCLEdBQXVCO0lBQzNDLGdCQUFnQixFQUFFLE1BQU07SUFDeEIsVUFBVSxFQUFFLFNBQVM7SUFDckIsaUJBQWlCLEVBQUUsU0FBUztJQUM1QixnQkFBZ0IsRUFBRSxTQUFTO0lBQzNCLG1CQUFtQixFQUFFLFNBQVM7SUFDOUIsUUFBUSxFQUFFLFFBQVE7SUFDbEIsVUFBVSxFQUFFLFVBQVU7SUFDdEIsUUFBUSxFQUFFLE1BQU07SUFDaEIsY0FBYyxFQUFFLEVBQUU7Q0FDbkIsQ0FBQztBQUVGLE1BQU0sQ0FBQyxPQUFPLE9BQU8sVUFBVyxTQUFRLE1BQU07SUFHdEMsTUFBTTs7WUFDVixvREFBb0Q7WUFDcEQsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM3RCxJQUFJLENBQUMsa0NBQWtDLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFFcEIsSUFBSSxDQUFDLFVBQVUsQ0FBQztnQkFDZCxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQixJQUFJLEVBQUUsaUJBQWlCO2dCQUN2QixRQUFRLEVBQUUsR0FBRyxFQUFFO29CQUNiLElBQUksZ0JBQWdCLENB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QUFDO1FBQ3RCLFFBQUcsR0FBVyxDQUFDLENBQUM7UUFDaEIsYUFBUSxHQUFXLENBQUMsQ0FBQztRQUkzQixJQUFJLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQixJQUFJLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMzQixJQUFJLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3QixDQUFDO0lBRUQsTUFBTTtRQUNKLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3pCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsOEJBQThCLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFDTSxRQUFRLEtBQVcsQ0FBQyxDQUFBLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFBLENBQUEsQ0FBQztJQUUvRCxTQUFTLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxDQUFTO1FBQy9DLElBQUksR0FBRyxHQUFHLENBQUMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxDQUFDLENBQUM7UUFFakMsdUJBQXVCO1FBQ3ZCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDM0IsR0FBRyxJQUFJLENBQUMsQ0FBQztZQUNULElBQUksQ0FBQyxLQUFLLENBQUM7Z0JBQUUsSUFBSSxHQUFHLEdBQUcsQ0FBQztZQUN4QixJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQUUsS0FBSyxHQUFHLEdBQUcsQ0FBQztTQUNoQztRQUNELE9BQU8sR0FBRyxHQUFHLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVPLGlCQUFpQjtRQUN2QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNoQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxFQUFFO2dCQUFDLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFBQztZQUNuRSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxFQUFFO2dCQUFDLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFBQztZQUNqRSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFO2dCQUFDLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFBQztZQUN2RSxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxFQUFFO2dCQUFDLElBQUksQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFBQztZQUNoRSxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFO2dCQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFBQztTQUN2RTtJQUNILENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFBsdWdpbiwgTWFya2Rvd25WaWV3LCBNYXJrZG93blJlbmRlcmVyLCBQbHVnaW5TZXR0aW5nVGFiLCBBcHAsIFNldHRpbmcsIE1vZGFsLCBOb3RpY2UsIENvbXBvbmVudCwgRWRpdG9yLCBFZGl0b3JQb3NpdGlvbiB9IGZyb20gJ29ic2lkaWFuJztcclxuaW1wb3J0IHsgY29udHJvbGxlciB9IGZyb20gJy4vbWF0aEVuZ2luZS5qcyc7XHJcbi8vIERlZmluZSB0aGUgaW50ZXJmYWNlIGZvciBwbHVnaW4gc2V0dGluZ3NcclxuaW50ZXJmYWNlIE1hdGhQbHVnaW5TZXR0aW5ncyB7XHJcbiAgbnVtYmVyRm9ybWF0dGluZzogc3RyaW5nXHJcbiAgYmFja2dyb3VuZDogc3RyaW5nO1xyXG4gIGV2ZW5Sb3dCYWNrZ3JvdW5kOiBzdHJpbmc7XHJcbiAgb2RkUm93QmFja2dyb3VuZDogc3RyaW5nO1xyXG4gIGluZm9Nb2RhbEJhY2tncm91bmQ6IHN0cmluZztcclxuICBmb250U2l6ZTogc3RyaW5nO1xyXG4gIHJvd1BhZGRpbmc6IHN0cmluZztcclxuICBpY29uU2l6ZTogc3RyaW5nO1xyXG4gIHNlc3Npb25IaXN0b3J5OiB7IGlucHV0OiBzdHJpbmcsIHJlc3VsdDogc3RyaW5nIH1bXTsgXHJcbn1cclxuXHJcbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IE1hdGhQbHVnaW5TZXR0aW5ncyA9IHtcclxuICBudW1iZXJGb3JtYXR0aW5nOiAnLjAwMCcsXHJcbiAgYmFja2dyb3VuZDogYCM0NDQ3NUFgLFxyXG4gIGV2ZW5Sb3dCYWNrZ3JvdW5kOiAnI2Y5ZjlmOScsXHJcbiAgb2RkUm93QmFja2dyb3VuZDogJyM3NDc2ODgnLFxyXG4gIGluZm9Nb2RhbEJhY2tncm91bmQ6ICcjMDAyQjM2JyxcclxuICBmb250U2l6ZTogJzAuODVlbScsXHJcbiAgcm93UGFkZGluZzogJzVweCAxMHB4JyxcclxuICBpY29uU2l6ZTogJzE0cHgnLFxyXG4gIHNlc3Npb25IaXN0b3J5OiBbXVxyXG59O1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWF0aFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHJcbiAgc2V0dGluZ3M6IE1hdGhQbHVnaW5TZXR0aW5ncztcclxuICBcclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICAvLyBMb2FkIHNldHRpbmdzIGFuZCByZWdpc3RlciB0aGUgbWFya2Rvd24gcHJvY2Vzc29yXHJcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBNYXRoUGx1Z2luU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKCdtYXRoLWVuZ2luZScsIHRoaXMucHJvY2Vzc01hdGhCbG9jay5iaW5kKHRoaXMpKTtcclxuICAgIHRoaXMudXBkYXRlU3R5bGVzKCk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6ICdvcGVuLWlucHV0LWZvcm0nLFxyXG4gICAgICBuYW1lOiAnT3BlbiBJbnB1dCBGb3JtJyxcclxuICAgICAgY2FsbGJhY2s6ICgpID0+IHtcclxuICAgICAgICBuZXcgQ3VzdG9tSW5wdXRNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiAndmlldy1zZXNzaW9uLWhpc3RvcnknLFxyXG4gICAgICBuYW1lOiAnVmlldyBTZXNzaW9uIEhpc3RvcnknLFxyXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xyXG4gICAgICAgIG5ldyBIaXN0b3J5TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIFxyXG4gIHByaXZhdGUgcHJvY2Vzc01hdGhCbG9jayhzb3VyY2U6IHN0cmluZywgZWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBsZXQgdXNlclZhcmlhYmxlczogYW55W10gPSBbXTtcclxuICAgIGxldCBza2lwcGVkSW5kZXhlcz0wXHJcbiAgICBlbC5jbGFzc0xpc3QuYWRkKCdtYXRoLWNvbnRhaW5lcicpO1xyXG5cclxuICAgIGxldCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKTtcclxuICAgIGlmIChleHByZXNzaW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgZXhwcmVzc2lvbnMgPSBbJzAnXTtcclxuICAgIH1cclxuXHJcbiAgICBleHByZXNzaW9ucy5mb3JFYWNoKChleHByZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgICBleHByZXNzaW9uID0gZXhwcmVzc2lvbi5yZXBsYWNlKC9cXHMvZywgXCJcIik7XHJcbiAgICAgIHVzZXJWYXJpYWJsZXMuZm9yRWFjaCgoeyB2YXJpYWJsZSwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlUmVnZXggPSBuZXcgUmVnRXhwKGBcXFxcYiR7dmFyaWFibGUudHJpbSgpfVxcXFxiYCwgJ2cnKTsgXHJcbiAgICAgICAgZXhwcmVzc2lvbiA9IGV4cHJlc3Npb24ucmVwbGFjZSh2YXJpYWJsZVJlZ2V4LCB2YWx1ZS50cmltKCkpO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIC8vIEhhbmRsZSB2YXJpYWJsZSBkZWNsYXJhdGlvblxyXG4gICAgICBpZiAoZXhwcmVzc2lvbi5zdGFydHNXaXRoKCd2YXInKSAmJiBleHByZXNzaW9uLmluY2x1ZGVzKCc9JykpIHtcclxuICAgICAgICBsZXQgc3BsaXRWYXIgPSBleHByZXNzaW9uLnN1YnN0cmluZygzKS5zcGxpdCgnPScpO1xyXG4gICAgICAgIGNvbnN0IGluZGV4ID0gdXNlclZhcmlhYmxlcy5maW5kSW5kZXgodiA9PiB2LnZhcmlhYmxlID09PSBzcGxpdFZhclswXS50cmltKCkpO1xyXG4gICAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgIHVzZXJWYXJpYWJsZXNbaW5kZXhdLnZhbHVlID0gc3BsaXRWYXJbMV0udHJpbSgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB1c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZTogc3BsaXRWYXJbMF0udHJpbSgpLCB2YWx1ZTogc3BsaXRWYXJbMV0udHJpbSgpIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBza2lwcGVkSW5kZXhlcysrO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgbGluZUNvbnRhaW5lciA9IGVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtbGluZS1jb250YWluZXInIH0pO1xyXG4gICAgICBsaW5lQ29udGFpbmVyLmFkZENsYXNzKChpbmRleC1za2lwcGVkSW5kZXhlcyklMiA9PT0gMCA/ICdtYXRoLXJvdy1ldmVuJyA6ICdtYXRoLXJvdy1vZGQnKTtcclxuICAgICAgY29uc3QgaW5wdXREaXYgPSBsaW5lQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtaW5wdXQnIH0pO1xyXG4gICAgICBjb25zdCByZXN1bHREaXYgPSBsaW5lQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21hdGgtcmVzdWx0JyB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGJpbm9tUmVnZXggPSAvYmlub21cXCgoW1xcZC5dKyksKFtcXGQuXSspLChbXFxkLl0rKVxcKS87XHJcbiAgICAgIGNvbnN0IG1hdGNoID0gZXhwcmVzc2lvbi5tYXRjaChiaW5vbVJlZ2V4KTtcclxuXHJcbiAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgIGxldCBiaW5vbT1uZXcgYmlub21JbmZvTW9kZWwodGhpcy5hcHAsIG1hdGNoIClcclxuICAgICAgICBpbnB1dERpdi5pbm5lclRleHQgPSBgJHtleHByZXNzaW9ufWA7XHJcbiAgICAgICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGAke2Jpbm9tLmdldEVxdWFsKCl9YDtcclxuICAgICAgICBjb25zdCBpY29uc0RpdiA9IHRoaXMuY3JlYXRlSWNvbnNDb250YWluZXIoKTtcclxuICAgICAgICB0aGlzLmFkZEljb25MaXN0ZW5lcnMoaWNvbnNEaXYsIG1hdGNoLCdiaW5vbScpO1xyXG4gICAgICAgIGxpbmVDb250YWluZXIuYXBwZW5kKGlucHV0RGl2LCByZXN1bHREaXYsIGljb25zRGl2KTtcclxuICAgICAgICBlbC5hcHBlbmRDaGlsZChsaW5lQ29udGFpbmVyKTtcclxuICAgICAgICByZXR1cm5cclxuICAgICAgfVxyXG5cclxuICAgICAgbGV0IHJlc3VsdDtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICByZXN1bHQgPSBjb250cm9sbGVyKGV4cHJlc3Npb24pO1xyXG4gICAgICAgIGlmICh0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgJFxceyR7cmVzdWx0LnByb2Nlc3NlZGlucHV0fVxcfSRgLCBpbnB1dERpdiwgJycsIHRoaXMpO1xyXG4gICAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bigvKHRydWV8ZmFsc2UpLy50ZXN0KHJlc3VsdC5zb2x1dGlvbikgPyByZXN1bHQuc29sdXRpb24gOiBgJFxceyR7cmVzdWx0LnNvbHV0aW9ufVxcfSRgLCByZXN1bHREaXYsICcnLCB0aGlzKTtcclxuICAgICAgICAgIGNvbnN0IGljb25zRGl2ID0gdGhpcy5jcmVhdGVJY29uc0NvbnRhaW5lcigpO1xyXG4gICAgICAgICAgdGhpcy5hZGRJY29uTGlzdGVuZXJzKGljb25zRGl2LCByZXN1bHQsJ2RlZmF1bHQnKTtcclxuICAgICAgICAgIGxpbmVDb250YWluZXIuYXBwZW5kKGlucHV0RGl2LCByZXN1bHREaXYsIGljb25zRGl2KTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oZXhwcmVzc2lvbiwgaW5wdXREaXYsICcnLCB0aGlzKTtcclxuICAgICAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiZXJyb3ItdGV4dFwiPiR7ZXJyLm1lc3NhZ2V9PC9zcGFuPmA7XHJcbiAgICAgICAgbGluZUNvbnRhaW5lci5hZGRDbGFzcygnbWF0aC1lcnJvci1saW5lJyk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGVsLmFwcGVuZENoaWxkKGxpbmVDb250YWluZXIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICAvLyBDcmVhdGUgaWNvbnMgY29udGFpbmVyXHJcbiAgcHJpdmF0ZSBjcmVhdGVJY29uc0NvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB7XHJcbiAgICBjb25zdCBpY29uc0RpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgaWNvbnNEaXYuY2xhc3NMaXN0LmFkZCgnbWF0aC1pY29ucycpO1xyXG4gICAgaWNvbnNEaXYuaW5uZXJIVE1MID0gYFxyXG4gICAgICA8c3BhbiBjbGFzcz1cIm1hdGgtaW5mby1pY29uXCI+8J+biDwvc3Bhbj5cclxuICAgICAgPHNwYW4gY2xhc3M9XCJtYXRoLWRlYnVnLWljb25cIj7wn5CePC9zcGFuPmA7XHJcbiAgICByZXR1cm4gaWNvbnNEaXY7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZEljb25MaXN0ZW5lcnMoaWNvbnNEaXY6IEhUTUxFbGVtZW50LCByZXN1bHQ6IGFueSxpbmZvTW9kZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBpY29uc0Rpdi5xdWVyeVNlbGVjdG9yKCcubWF0aC1pbmZvLWljb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIHN3aXRjaCAoaW5mb01vZGUpIHtcclxuICAgICAgICBjYXNlICdiaW5vbSc6XHJcbiAgICAgICAgICBuZXcgYmlub21JbmZvTW9kZWwodGhpcy5hcHAsIHJlc3VsdCkub3BlbigpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHJlc3VsdC5tYXRoSW5mbywgcmVzdWx0LnNvbHV0aW9uSW5mbykub3BlbigpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIGljb25zRGl2LnF1ZXJ5U2VsZWN0b3IoJy5tYXRoLWRlYnVnLWljb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCByZXN1bHQuZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vIExvYWQgc2V0dGluZ3NcclxuICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcclxuICB9XHJcblxyXG4gIC8vIFNhdmUgc2V0dGluZ3NcclxuICBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XHJcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xyXG4gIH1cclxuXHJcbiAgLy8gVXBkYXRlIHN0eWxlcyBiYXNlZCBvbiBzZXR0aW5nc1xyXG4gIHVwZGF0ZVN0eWxlcygpIHtcclxuICAgIGNvbnN0IHJvb3QgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLXJvdy1iYWNrZ3JvdW5kJywgdGhpcy5zZXR0aW5ncy5iYWNrZ3JvdW5kKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tZXZlbi1yb3ctYmFja2dyb3VuZCcsIHRoaXMuc2V0dGluZ3MuZXZlblJvd0JhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1vZGQtcm93LWJhY2tncm91bmQnLCB0aGlzLnNldHRpbmdzLm9kZFJvd0JhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1pbmZvLW1vZGFsLWNvbHVtbi1iYWNrZ3JvdW5kJywgdGhpcy5zZXR0aW5ncy5pbmZvTW9kYWxCYWNrZ3JvdW5kKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tZm9udC1zaXplJywgdGhpcy5zZXR0aW5ncy5mb250U2l6ZSk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLXJvdy1wYWRkaW5nJywgdGhpcy5zZXR0aW5ncy5yb3dQYWRkaW5nKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0taWNvbi1zaXplJywgdGhpcy5zZXR0aW5ncy5pY29uU2l6ZSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgQ3VzdG9tSW5wdXRNb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgdXNlckNob2ljZTogbnVtYmVyID0gMDtcclxuICB1c2VyQ29vcmRpbmF0ZXNJbnB1dDogc3RyaW5nID0gJygwLDApLCgxLDApLCgxLDEpJztcclxuICB1c2VyU2lkZXNJbnB1dDogc3RyaW5nID0gJyc7XHJcbiAgdXNlckFuZ2xlc0lucHV0OiBzdHJpbmcgPSAnJztcclxuICByZXN1bHRDb250YWluZXI6IEhUTUxFbGVtZW50O1xyXG4gIHNoYXBlc0NoYXJhY3RlcmlzdGljczogYW55O1xyXG4gIGV2YWxlZFVzZXJJbnB1dEluZm86IGFueSA9IG51bGw7XHJcbiAgc2F2ZWRWYWx1ZXM6IGFueSA9IHt9O1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBNYXRoUGx1Z2luKSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdFbnRlciBNYXRoIEV4cHJlc3Npb24nIH0pO1xyXG5cclxuICAgIC8vIEFzc2lnbiBzaGFwZXNDaGFyYWN0ZXJpc3RpY3MgZ2xvYmFsbHlcclxuICAgIHRoaXMuc2hhcGVzQ2hhcmFjdGVyaXN0aWNzID0gZ2V0U2hhcGVzQ2hhcmFjdGVyaXN0aWNzKCk7XHJcblxyXG4gICAgY29uc3Qgc2V0dGluZ3NDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiAnc2V0dGluZ3MtY29udGFpbmVyJyB9KTtcclxuICAgIGNvbnN0IGR5bmFtaWNGaWVsZENvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICdkeW5hbWljLWZpZWxkLWNvbnRhaW5lcicgfSk7XHJcbiAgICBjb25zdCB0aWt6R3JhcGhDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiAnZHluYW1pYy1maWVsZC1jb250YWluZXInIH0pO1xyXG4gICAgY29uc3Qgc3VibWl0QnV0dG9uID0gY29udGVudEVsLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdTdWJtaXQnLCBhdHRyOiB7IGRpc2FibGVkOiAndHJ1ZScgfSB9KTtcclxuICAgIGNvbnN0IHRlbXBvcmFyeURlYnVnQXJlYSA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICd0ZW1wb3JhcnktZGVidWctYXJlYScgfSk7XHJcbiAgICBzdWJtaXRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLmV2YWxlZFVzZXJJbnB1dEluZm8gJiYgdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvLm1lZXRzTWluUmVxdWlyZW1lbnRzKSB7XHJcbiAgICAgICAgdGhpcy5oYW5kbGVTdWJtaXQoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBuZXcgTm90aWNlKCdQbGVhc2UgZW50ZXIgdmFsaWQgaW5wdXQuJyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKHNldHRpbmdzQ29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnQ2hvb3NlIHNoYXBlJylcclxuICAgICAgLnNldERlc2MoJ1NlbGVjdCB0aGUgc2hhcGUgdG8gcGVyZm9ybSB0aGUgb3BlcmF0aW9ucyBvbi4nKVxyXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4ge1xyXG4gICAgICAgIHRoaXMuc2hhcGVzQ2hhcmFjdGVyaXN0aWNzLmZvckVhY2goKHNoYXBlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihpbmRleC50b1N0cmluZygpLCBzaGFwZS5uYW1lKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnVzZXJDaG9pY2UgPSAwO1xyXG4gICAgICAgIHRoaXMucmVuZGVyRHluYW1pY0ZpZWxkcyhkeW5hbWljRmllbGRDb250YWluZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGRyb3Bkb3duLm9uQ2hhbmdlKHZhbHVlID0+IHtcclxuICAgICAgICAgIHRoaXMudXNlckNob2ljZSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICAgICAgICB0aGlzLnJlbmRlckR5bmFtaWNGaWVsZHMoZHluYW1pY0ZpZWxkQ29udGFpbmVyKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICBcclxuICAgIGNvbnRlbnRFbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHtcclxuICAgICAgdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvID0gdGhpcy50ZXN0TWluSW5wdXRSZXF1aXJlbWVudHMoKTtcclxuICAgICAgaWYgKHRoaXMuZXZhbGVkVXNlcklucHV0SW5mby5tZWV0c01pblJlcXVpcmVtZW50cykge1xyXG4gICAgICAgIHN1Ym1pdEJ1dHRvbi5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XHJcbiAgICAgICAgdGlrekdyYXBoQ29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihjcmVhdGVUaWt6R3JhcGgodGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvKSwgdGlrekdyYXBoQ29udGFpbmVyLCAnJywgbmV3IENvbXBvbmVudCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGVtcG9yYXJ5RGVidWdBcmVhLmVtcHR5KCk7XHJcbiAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFxgXFxgXFxganNcXG4ke0pTT04uc3RyaW5naWZ5KHRoaXMuZXZhbGVkVXNlcklucHV0SW5mbywgbnVsbCwgMC4wMSl9XFxuXFxgXFxgXFxgYCtjcmVhdGVUaWt6R3JhcGgodGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvKSwgdGVtcG9yYXJ5RGVidWdBcmVhLCAnJywgbmV3IENvbXBvbmVudCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc3VibWl0QnV0dG9uLnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAndHJ1ZScpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIFxyXG4gIH1cclxuXHJcbiAgcmVuZGVyRHluYW1pY0ZpZWxkcyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIuZmluZEFsbCgnLmR5bmFtaWMtZmllbGQnKS5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZSgpKTtcclxuICAgIGNvbnN0IHNoYXBlID0gdGhpcy5zaGFwZXNDaGFyYWN0ZXJpc3RpY3NbdGhpcy51c2VyQ2hvaWNlXTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdDb29yZGluYXRlcycpXHJcbiAgICAgIC5zZXREZXNjKGBFbnRlciAke3NoYXBlLmNvb3JkaW5hdGVzfSBjb29yZGluYXRlcyBmb3IgJHtzaGFwZS5uYW1lfSBpbiAoeCwgeSkgZm9ybWF0YClcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnVzZXJDb29yZGluYXRlc0lucHV0fHwnJyk7IFxyXG4gICAgICAgIHRleHQub25DaGFuZ2UodmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy51c2VyQ29vcmRpbmF0ZXNJbnB1dCA9IHZhbHVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KVxyXG4gICAgICAuc2V0dGluZ0VsLmFkZENsYXNzKCdkeW5hbWljLWZpZWxkJyk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnU2lkZXMnKVxyXG4gICAgICAuc2V0RGVzYyhgRW50ZXIgJHtzaGFwZS5jb29yZGluYXRlc30gc2lkZXMgZm9yICR7c2hhcGUubmFtZX1gKVxyXG4gICAgICAuYWRkVGV4dCh0ZXh0ID0+IHtcclxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMudXNlclNpZGVzSW5wdXR8fCcnKTsgXHJcbiAgICAgICAgdGV4dC5vbkNoYW5nZSh2YWx1ZSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnVzZXJTaWRlc0lucHV0ID0gdmFsdWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5zZXR0aW5nRWwuYWRkQ2xhc3MoJ2R5bmFtaWMtZmllbGQnKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdBbmdsZXMnKVxyXG4gICAgICAuc2V0RGVzYyhgRW50ZXIgJHtzaGFwZS5jb29yZGluYXRlc30gYW5nbGVzIGZvciAke3NoYXBlLm5hbWV9YClcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnVzZXJBbmdsZXNJbnB1dHx8JycpO1xyXG4gICAgICAgIHRleHQub25DaGFuZ2UodmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy51c2VyQW5nbGVzSW5wdXQgPSB2YWx1ZTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSlcclxuICAgICAgLnNldHRpbmdFbC5hZGRDbGFzcygnZHluYW1pYy1maWVsZCcpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lcilcclxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cclxuICAgICAgICBidXR0b25cclxuICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDbGVhcicpXHJcbiAgICAgICAgICAuc2V0VG9vbHRpcCgnQ2xlYXIgYWxsIHByZXZpb3VzIGZpZWxkcycpXHJcbiAgICAgICAgICAub25DbGljaygoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudXNlckNvb3JkaW5hdGVzSW5wdXQ9Jyc7XHJcbiAgICAgICAgICAgIHRoaXMudXNlclNpZGVzSW5wdXQ9Jyc7XHJcbiAgICAgICAgICAgIHRoaXMudXNlckFuZ2xlc0lucHV0PScnO1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlckR5bmFtaWNGaWVsZHMoY29udGFpbmVyKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgIClcclxuICAgICAgLnNldHRpbmdFbC5hZGRDbGFzcygnZHluYW1pYy1maWVsZCcpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSB0ZXN0TWluSW5wdXRSZXF1aXJlbWVudHMoKSB7XHJcbiAgICBjb25zdCBvYmplY3RpZmllZENvb3JkaW5hdGVzID0gc3BsaXRDb29yZGluYXRlcyh0aGlzLnVzZXJDb29yZGluYXRlc0lucHV0KSxcclxuICAgICAgICAgIG9iamVjdGlmaWVkU2lkZXMgPSBzcGxpdFNpZGVzKHRoaXMudXNlclNpZGVzSW5wdXQpLFxyXG4gICAgICAgICAgb2JqZWN0aWZpZWRBbmdsZXMgPSBzcGxpdEFuZ2xlcyh0aGlzLnVzZXJBbmdsZXNJbnB1dCk7XHJcblxyXG4gICAgY29uc3Qgc2hhcGVOYW1lID0gdGhpcy5zaGFwZXNDaGFyYWN0ZXJpc3RpY3NbdGhpcy51c2VyQ2hvaWNlXS5uYW1lO1xyXG5cclxuICAgIGNvbnN0IGlzU2hhcGVWYWxpZCA9IGNoZWNrU2hhcGVSZXF1aXJlbWVudHMoc2hhcGVOYW1lLCBvYmplY3RpZmllZENvb3JkaW5hdGVzLCBvYmplY3RpZmllZFNpZGVzLCBvYmplY3RpZmllZEFuZ2xlcyk7XHJcblxyXG4gICAgaWYgKGlzU2hhcGVWYWxpZCkge1xyXG4gICAgICBpZiAoIXRoaXMucmVzdWx0Q29udGFpbmVyKSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRDb250YWluZXIgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbnB1dC1tb2RhbC1yZXN1bHQtY29udGFpbmVyJyB9KTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLnJlc3VsdENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdpbnB1dC1tb2RhbC1yZXN1bHQtZXJyJyk7XHJcbiAgICAgIHRoaXMucmVzdWx0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2lucHV0LW1vZGFsLXJlc3VsdC1jb250YWluZXInKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGlmICghdGhpcy5yZXN1bHRDb250YWluZXIpIHtcclxuICAgICAgICB0aGlzLnJlc3VsdENvbnRhaW5lciA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2lucHV0LW1vZGFsLXJlc3VsdC1lcnInIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMucmVzdWx0Q29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2lucHV0LW1vZGFsLXJlc3VsdC1jb250YWluZXInKTtcclxuICAgICAgdGhpcy5yZXN1bHRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaW5wdXQtbW9kYWwtcmVzdWx0LWVycicpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHsgbWVldHNNaW5SZXF1aXJlbWVudHM6IGlzU2hhcGVWYWxpZCxzaGFwZTogc2hhcGVOYW1lLCBjb29yZGluYXRlczogb2JqZWN0aWZpZWRDb29yZGluYXRlcywgc2lkZXM6IG9iamVjdGlmaWVkU2lkZXMsIGFuZ2xlczogb2JqZWN0aWZpZWRBbmdsZXMgfTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlU3VibWl0KCkge1xyXG5cclxuICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvO1xyXG4gICAgICB0aGlzLnJlc3VsdENvbnRhaW5lci50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdCk7XHJcblxyXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeS5wdXNoKHtcclxuICAgICAgICBpbnB1dDogdGhpcy51c2VyQW5nbGVzSW5wdXQsXHJcbiAgICAgICAgcmVzdWx0OiByZXN1bHRcclxuICAgICAgfSk7XHJcbiAgICAgIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgXHJcbiAgfVxyXG4gIG9uQ2xvc2UoKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlVGlrekdyYXBoKHVzZXJJbnB1dDogYW55KXtcclxuICBjb25zdCBzaGFwZXNDaGFyYWN0ZXJpc3RpY3M9Z2V0U2hhcGVzQ2hhcmFjdGVyaXN0aWNzKCksYmVnaW5HcmFwaD1gXFxgXFxgXFxgdGlrelxcbmAsZW5kR3JhcGg9YFxcblxcYFxcYFxcYGA7XHJcbiAgbGV0IGRpc3BsYXlQaWN0dXJlT3B0aW9uPVN0cmluZy5yYXdgW3NjYWxlPTFwdCwgeD0xY20sIHk9MWNtLHdoaXRlXWA7XHJcbiAgdXNlcklucHV0ID0gbmFtZVRoZVNoYXBlKFxyXG4gICAgdXNlcklucHV0LnNoYXBlLFxyXG4gICAgdXNlcklucHV0LmNvb3JkaW5hdGVzLFxyXG4gICAgdXNlcklucHV0LnNpZGVzLFxyXG4gICAgdXNlcklucHV0LmFuZ2xlc1xyXG4gICk7XHJcbiAgcmV0dXJuIGBcXGBcXGBcXGBqc1xcbmArSlNPTi5zdHJpbmdpZnkodXNlcklucHV0K2NhbGN1bGF0ZVNoYXBlKHVzZXJJbnB1dCksbnVsbCwwLjAxKStlbmRHcmFwaDtcclxufVxyXG5cclxuZnVuY3Rpb24gY2FsY3VsYXRlU2hhcGUodXNlcklucHV0OiBhbnkpIHtcclxuICBjb25zdCBzaGFwZXNDaGFyYWN0ZXJpc3RpY3MgPSBnZXRTaGFwZXNDaGFyYWN0ZXJpc3RpY3MoKTtcclxuICBsZXQgY29vcmRpbmF0ZXMgPSB1c2VySW5wdXQuY29vcmRpbmF0ZXM7XHJcbiAgbGV0IGxlbmd0aHM6IHsgZWRnZTE6IHN0cmluZywgZWRnZTI6IHN0cmluZywgbGVuZ3RoOiBudW1iZXIgfVtdID0gW107XHJcblxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29vcmRpbmF0ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGxldCBzZWNvbmRDb29yZGluYXRlID0gaSE9PWNvb3JkaW5hdGVzLmxlbmd0aC0xP2krMTowO1xyXG4gICAgY29uc29sZS5sb2coaSxjb29yZGluYXRlcy5sZW5ndGgsaT09PWNvb3JkaW5hdGVzLmxlbmd0aC0xKVxyXG4gICAgbGVuZ3Rocy5wdXNoKHtcclxuICAgICAgZWRnZTE6IGNvb3JkaW5hdGVzW2ldLm5hbWUsXHJcbiAgICAgIGVkZ2UyOiBjb29yZGluYXRlc1tzZWNvbmRDb29yZGluYXRlXS5uYW1lLFxyXG4gICAgICBsZW5ndGg6IGZpbmRMZW5ndGgoY29vcmRpbmF0ZXNbaV0sIGNvb3JkaW5hdGVzW3NlY29uZENvb3JkaW5hdGVdKVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIFxyXG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShsZW5ndGhzKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGZpbmRMZW5ndGgoY29vcmRpbmF0ZTE6IGFueSxjb29yZGluYXRlMjogYW55KXtcclxuICBjb25zdCB2YWx1ZVg9Y29vcmRpbmF0ZTEueC1jb29yZGluYXRlMi54O1xyXG4gIGNvbnN0IHZhbHVlWT1jb29yZGluYXRlMS55LWNvb3JkaW5hdGUyLnk7XHJcbiAgcmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyh2YWx1ZVgsMikrTWF0aC5wb3codmFsdWVZLDIpKVxyXG59XHJcbmZ1bmN0aW9uIHJlY29uc3RydWN0Q29vcmRpbmF0ZXMoY29vcmRpbmF0ZXM6IGFueSl7XHJcbiAgXHJcbn1cclxuZnVuY3Rpb24gbmFtZVRoZVNoYXBlKFxyXG4gIHNoYXBlOiBzdHJpbmcsIFxyXG4gIGNvb3JkaW5hdGVzOiB7IG5hbWU/OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyIH1bXSwgXHJcbiAgc2lkZXM6IHsgbmFtZT86IHN0cmluZywgbGVuZ3RoOiBudW1iZXIgfVtdLCBcclxuICBhbmdsZXM6IHsgbmFtZT86IHN0cmluZywgZGVncmVlczogbnVtYmVyIH1bXVxyXG4pIHtcclxuICBjb25zdCBhbHBoYWJldDogcmVhZG9ubHkgc3RyaW5nW10gPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonLnNwbGl0KCcnKTtcclxuXHJcbiAgbGV0IHVubmFtZWRJbmRleCA9IDA7XHJcbiAgbGV0IHVzZWROYW1lczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcblxyXG5cclxuICBmdW5jdGlvbiBhc3NpZ25VbmlxdWVOYW1lKCk6IHN0cmluZyB7XHJcbiAgICB3aGlsZSAodXNlZE5hbWVzLmhhcyhhbHBoYWJldFt1bm5hbWVkSW5kZXhdKSkge1xyXG4gICAgICB1bm5hbWVkSW5kZXgrKztcclxuICAgIH1cclxuICAgIGNvbnN0IG5ld05hbWUgPSBhbHBoYWJldFt1bm5hbWVkSW5kZXgrK107XHJcbiAgICB1c2VkTmFtZXMuYWRkKG5ld05hbWUpO1xyXG4gICAgcmV0dXJuIG5ld05hbWU7XHJcbiAgfVxyXG5cclxuICAvLyBQcm9jZXNzIGNvb3JkaW5hdGVzXHJcbiAgbGV0IG5ld0Nvb3JkaW5hdGVzOiB7IG5hbWU6IHN0cmluZywgeDogbnVtYmVyLCB5OiBudW1iZXIgfVtdID0gY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4ge1xyXG4gICAgaWYgKCFjb29yZGluYXRlLm5hbWUpIHtcclxuICAgICAgY29vcmRpbmF0ZS5uYW1lID0gYXNzaWduVW5pcXVlTmFtZSgpO1xyXG4gICAgfVxyXG4gICAgdXNlZE5hbWVzLmFkZChjb29yZGluYXRlLm5hbWUpOyBcclxuICAgIHJldHVybiB7IG5hbWU6IGNvb3JkaW5hdGUubmFtZSwgeDogY29vcmRpbmF0ZS54LCB5OiBjb29yZGluYXRlLnkgfTtcclxuICB9KTtcclxuXHJcbiAgbGV0IG5ld1NpZGVzOiB7IG5hbWU6IHN0cmluZywgbGVuZ3RoOiBudW1iZXIgfVtdID0gc2lkZXMubWFwKHNpZGUgPT4ge1xyXG4gICAgaWYgKCFzaWRlLm5hbWUpIHtcclxuICAgICAgc2lkZS5uYW1lID0gYXNzaWduVW5pcXVlTmFtZSgpO1xyXG4gICAgfVxyXG4gICAgdXNlZE5hbWVzLmFkZChzaWRlLm5hbWUpOyBcclxuICAgIHJldHVybiB7IG5hbWU6IHNpZGUubmFtZSwgbGVuZ3RoOiBzaWRlLmxlbmd0aCB9O1xyXG4gIH0pO1xyXG4gIGxldCBuZXdBbmdsZXM6IHsgbmFtZTogc3RyaW5nLCBkZWdyZWVzOiBudW1iZXIgfVtdID0gYW5nbGVzLm1hcChhbmdsZSA9PiB7XHJcbiAgICBpZiAoIWFuZ2xlLm5hbWUpIHtcclxuICAgICAgYW5nbGUubmFtZSA9IGFzc2lnblVuaXF1ZU5hbWUoKTtcclxuICAgIH1cclxuXHJcbiAgICB1c2VkTmFtZXMuYWRkKGFuZ2xlLm5hbWUpOyBcclxuICAgIFxyXG4gICAgcmV0dXJuIHsgbmFtZTogYW5nbGUubmFtZSwgZGVncmVlczogYW5nbGUuZGVncmVlcyB9O1xyXG4gIH0pO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgY29vcmRpbmF0ZXM6IG5ld0Nvb3JkaW5hdGVzLFxyXG4gICAgc2lkZXM6IG5ld1NpZGVzLFxyXG4gICAgYW5nbGVzOiBuZXdBbmdsZXNcclxuICB9O1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gY2hlY2tTaGFwZVJlcXVpcmVtZW50cyhzaGFwZU5hbWU6IHN0cmluZywgb2JqZWN0aWZpZWRDb29yZGluYXRlczogYW55W10sIG9iamVjdGlmaWVkU2lkZXM6IGFueVtdLCBvYmplY3RpZmllZEFuZ2xlczogYW55W10pOiBib29sZWFuIHtcclxuICBjb25zdCBzaGFwZXNDaGFyYWN0ZXJpc3RpY3MgPSBnZXRTaGFwZXNDaGFyYWN0ZXJpc3RpY3MoKTtcclxuICBjb25zdCBzaGFwZSA9IHNoYXBlc0NoYXJhY3RlcmlzdGljcy5maW5kKHMgPT4gcy5uYW1lID09PSBzaGFwZU5hbWUpO1xyXG4gIGlmICghc2hhcGUpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgY3JpdGVyaWEgZm9yIHNoYXBlIFwiJHtzaGFwZU5hbWV9XCIgbm90IGZvdW5kYCk7XHJcbiAgfVxyXG4gIFxyXG4gIGNvbnN0IGlzVmFsaWRDb21iaW5hdGlvbiA9IHNoYXBlLmNvbWJpbmF0aW9ucy5zb21lKGNvbWJvID0+IHtcclxuICAgIGNvbnN0IGhhc1ZhbGlkY29vcmRzID0gY29tYm8uY29vcmRpbmF0ZXMgPyBvYmplY3RpZmllZENvb3JkaW5hdGVzLmxlbmd0aCA+PSBjb21iby5jb29yZGluYXRlcyA6IHRydWU7XHJcbiAgICBjb25zdCBoYXNWYWxpZFNpZGVzID0gY29tYm8uc2lkZXMgPyBvYmplY3RpZmllZFNpZGVzLmxlbmd0aCA+PSBjb21iby5zaWRlcyA6IHRydWU7XHJcbiAgICBjb25zdCBoYXNWYWxpZEFuZ2xlcyA9IGNvbWJvLmFuZ2xlcyA/IG9iamVjdGlmaWVkQW5nbGVzLmxlbmd0aCA+PSBjb21iby5hbmdsZXMgOiB0cnVlO1xyXG4gICAgcmV0dXJuIGhhc1ZhbGlkU2lkZXMgJiYgaGFzVmFsaWRBbmdsZXMmJmhhc1ZhbGlkY29vcmRzO1xyXG4gIH0pO1xyXG4gIFxyXG4gIHJldHVybiBpc1ZhbGlkQ29tYmluYXRpb247XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNwbGl0Q29vcmRpbmF0ZXMoaW5wdXQ6IHN0cmluZyk6IHsgeDogbnVtYmVyLCB5OiBudW1iZXIsIG5hbWU/OiBzdHJpbmcgfVtdIHtcclxuICBpbnB1dD1pbnB1dC5yZXBsYWNlKC9cXHMvZyxcIlwiKVxyXG4gIGNvbnN0IHJlZ2V4ID0gL1xcKChcXGQrKSwoXFxkKylcXCkoW2EtekEtWl17MSw1fSk/L2c7XHJcbiAgY29uc3QgbWF0Y2hlcyA9IFtdO1xyXG4gIGxldCBtYXRjaDtcclxuXHJcbiAgd2hpbGUgKChtYXRjaCA9IHJlZ2V4LmV4ZWMoaW5wdXQpKSAhPT0gbnVsbCkge1xyXG4gICAgY29uc3QgW2Z1bGxJbnB1dCwgeCwgeSxuYW1lXSA9IG1hdGNoO1xyXG4gICAgbWF0Y2hlcy5wdXNoKHtcclxuICAgICAgeDogTnVtYmVyKHgpLFxyXG4gICAgICB5OiBOdW1iZXIoeSksXHJcbiAgICAgIC4uLihuYW1lID8geyBuYW1lIH0gOiB7fSkgXHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIG1hdGNoZXM7XHJcbn1cclxuZnVuY3Rpb24gc3BsaXRTaWRlcyhpbnB1dDogc3RyaW5nKTogeyB2YWx1ZTogbnVtYmVyLCBuYW1lPzogc3RyaW5nIH1bXSB7XHJcbiAgaW5wdXQ9aW5wdXQucmVwbGFjZSgvXFxzL2csXCJcIilcclxuICBjb25zdCByZWdleCA9IC8oW2EtekEtWl17MSw1fSk/PT8oXFxkKykvZztcclxuICBjb25zdCBtYXRjaGVzID0gW107XHJcbiAgbGV0IG1hdGNoO1xyXG5cclxuICB3aGlsZSAoKG1hdGNoID0gcmVnZXguZXhlYyhpbnB1dCkpICE9PSBudWxsKSB7XHJcbiAgICBjb25zdCBbZnVsbElucHV0LCBuYW1lLCB2YWx1ZV0gPSBtYXRjaDtcclxuICAgIG1hdGNoZXMucHVzaCh7XHJcbiAgICAgIHZhbHVlOiBOdW1iZXIodmFsdWUpLFxyXG4gICAgICAuLi4obmFtZSA/IHsgbmFtZSB9IDoge30pIFxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIHJldHVybiBtYXRjaGVzO1xyXG59XHJcbmZ1bmN0aW9uIHNwbGl0QW5nbGVzKGlucHV0OiBzdHJpbmcpOiB7IHZhbHVlOiBudW1iZXIsIG5hbWU/OiBzdHJpbmcgfVtdIHtcclxuICBpbnB1dD1pbnB1dC5yZXBsYWNlKC9cXHMvZyxcIlwiKVxyXG4gIGNvbnN0IHJlZ2V4ID0gLyhbYS16QS1aXXsxLDV9KT89PyhcXGQrKS9nO1xyXG4gIGNvbnN0IG1hdGNoZXMgPSBbXTtcclxuICBsZXQgbWF0Y2g7XHJcblxyXG4gIHdoaWxlICgobWF0Y2ggPSByZWdleC5leGVjKGlucHV0KSkgIT09IG51bGwpIHtcclxuICAgIGNvbnN0IFtmdWxsSW5wdXQsIG5hbWUsIHZhbHVlXSA9IG1hdGNoO1xyXG4gICAgbWF0Y2hlcy5wdXNoKHtcclxuICAgICAgdmFsdWU6IE51bWJlcih2YWx1ZSksXHJcbiAgICAgIC4uLihuYW1lID8geyBuYW1lIH0gOiB7fSkgXHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIG1hdGNoZXM7XHJcbn1cclxuXHJcbi8vIEN1c3RvbSBIaXN0b3J5IE1vZGFsIGNsYXNzIGZvciBzZXNzaW9uIGhpc3RvcnlcclxuY2xhc3MgSGlzdG9yeU1vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnU2Vzc2lvbiBIaXN0b3J5JyB9KTtcclxuXHJcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBoaXN0b3J5LCBkaXNwbGF5IGEgbWVzc2FnZVxyXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnNlc3Npb25IaXN0b3J5Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICdObyBzZXNzaW9uIGhpc3RvcnkgZm91bmQuJyB9KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc3BsYXkgZWFjaCBzZXNzaW9uIGluIHRoZSBoaXN0b3J5XHJcbiAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeS5mb3JFYWNoKChzZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgICBjb25zdCBzZXNzaW9uRGl2ID0gY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2hpc3Rvcnktc2Vzc2lvbicgfSk7XHJcbiAgICAgIHNlc3Npb25EaXYuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiBgU2Vzc2lvbiAke2luZGV4ICsgMX1gIH0pO1xyXG4gICAgICBzZXNzaW9uRGl2LmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgSW5wdXQ6ICR7c2Vzc2lvbi5pbnB1dH1gIH0pO1xyXG4gICAgICBzZXNzaW9uRGl2LmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUmVzdWx0OiAke3Nlc3Npb24ucmVzdWx0fWAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDbG9zZSBidXR0b25cclxuICAgIGNvbnN0IGNsb3NlQnV0dG9uID0gY29udGVudEVsLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdDbG9zZScgfSk7XHJcbiAgICBjbG9zZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuZW1wdHkoKTsgLy8gQ2xlYW4gdXAgbW9kYWwgY29udGVudCBvbiBjbG9zZVxyXG4gIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIEluZm9Nb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBtYXRoSW5mbzogc3RyaW5nW107XHJcbiAgc29sdXRpb25JbmZvOiBzdHJpbmdbXTtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIG1hdGhJbmZvOiBzdHJpbmdbXSwgc29sdXRpb25JbmZvOiBzdHJpbmdbXSkge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMubWF0aEluZm8gPSBtYXRoSW5mbztcclxuICAgIHRoaXMuc29sdXRpb25JbmZvID0gc29sdXRpb25JbmZvO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoJ2luZm8tbW9kYWwtc3R5bGUnKTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdSZXN1bHQgRGV0YWlscycsIGNsczogJ2luZm8tbW9kYWwtdGl0bGUnIH0pO1xyXG5cclxuICAgIC8vIEFkZCBjb250ZW50IGFuZCBidXR0b24gZm9yIGNvcHlpbmcgZGV0YWlsc1xyXG4gICAgdGhpcy5wb3B1bGF0ZUNvbnRlbnQoY29udGVudEVsKTtcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBwb3B1bGF0ZUNvbnRlbnQoY29udGVudEVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgXHJcbiAgICBjb25zdCBjb2x1bW5Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnaW5mby1tb2RhbC1tYWluLWNvbnRhaW5lcicgfSk7XHJcbiAgICBcclxuICAgIHRoaXMubWF0aEluZm8uZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgY29uc3QgbGluZUNvbnRhaW5lciA9IGNvbHVtbkNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLWxpbmUtY29udGFpbmVyJyB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGxlZnRMaW5lID0gbGluZUNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLWxlZnQtbGluZScgfSk7XHJcbiAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYCRcXHtcXFxcYmVnaW57YWxpZ25lZH0mJHtsaW5lfVxcXFxlbmR7YWxpZ25lZH1cXH0kYCwgbGVmdExpbmUsICcnLCBuZXcgQ29tcG9uZW50KCkpO1xyXG5cclxuICAgICAgY29uc3QgcmlnaHRMaW5lID0gbGluZUNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLXJpZ2h0LWxpbmUnIH0pO1xyXG4gICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGAkXFx7XFxcXGJlZ2lue2FsaWduZWR9JiR7dGhpcy5zb2x1dGlvbkluZm9baW5kZXhdIHx8ICcnfVxcXFxlbmR7YWxpZ25lZH1cXH0kYCwgcmlnaHRMaW5lLCAnJywgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLUNvcHktYnV0dG9uLWNvbnRhaW5lcicgfSk7XHJcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0NvcHkgRGV0YWlscycsIGNsczogJ2luZm8tbW9kYWwtQ29weS1idXR0b24nIH0pO1xyXG5cclxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy5tYXRoSW5mby5qb2luKCdcXG4nKSk7XHJcbiAgICAgIG5ldyBOb3RpY2UoJ0RldGFpbHMgY29waWVkIHRvIGNsaXBib2FyZCEnKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgb25DbG9zZSgpIHtcclxuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBEZWJ1Z01vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIGRlYnVnSW5mbzogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgZGVidWdJbmZvOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICB0aGlzLmRlYnVnSW5mbyA9IGRlYnVnSW5mbztcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmFkZENsYXNzKCdjdXN0b20tbW9kYWwtc3R5bGUnKTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdEZWJ1ZyBJbmZvcm1hdGlvbicsIGNsczogJ2RlYnVnLU1vZGFsLXRpdGxlJyB9KTtcclxuXHJcbiAgICBjb25zdCBkZWJ1Z0NvbnRlbnQgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnZGVidWctaW5mby1jb250YWluZXInIH0pO1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFxgXFxgXFxganNcXG4ke3RoaXMuZGVidWdJbmZvfVxcblxcYFxcYFxcYGAsIGRlYnVnQ29udGVudCwgJycsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCkge1xyXG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuY2xhc3MgTWF0aFBsdWdpblNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcclxuICBwbHVnaW46IE1hdGhQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE1hdGhQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcbiAgICBjb25zdCB0b1NldE9wdGlvbnM9W1xyXG4gICAgICB7dmFsdWU6IDEwMDAsZGlzcGxheTogJ2Zvcm1hdHRlZCAuMDAwJyB9LFxyXG4gICAgICB7dmFsdWU6IDEwMDAwLGRpc3BsYXk6ICdmb3JtYXR0ZWQgLjAwMDAnIH0sXHJcbiAgICAgIHt2YWx1ZTogMTAwMDAwLGRpc3BsYXk6ICdmb3JtYXR0ZWQgLjAwMDAwJyB9LFxyXG4gICAgXVxyXG5cclxuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdNYXRoIFBsdWdpbiBTZXR0aW5ncycgfSk7XHJcbiAgICB0aGlzLmFkZE11bHRpQ2hvaWNlU2V0dGluZyhjb250YWluZXJFbCwgJ1JlbmRlcmVkIG51bWJlciBmb3JtYXQnLCAnQ2hvb3NlIGhvdyB0byBmb3JtYXQgbnVtYmVycyBpbiB0aGUgcmVzdWx0JywgdG9TZXRPcHRpb25zLCdudW1iZXJGb3JtYXR0aW5nJyk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdNYXRoIFBsdWdpbiBzdHlsZScgfSk7XHJcblxyXG4gICAgLy8gQWRkIHZhcmlvdXMgc2V0dGluZ3NcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnQmFja2dyb3VuZCBDb2xvcicsICdTZXQgdGhlIGJhY2tncm91bmQgY29sb3IuJywgJ2JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnRXZlbiBSb3cgQmFja2dyb3VuZCBDb2xvcicsICdTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIGV2ZW4gcm93cy4nLCAnZXZlblJvd0JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnT2RkIFJvdyBCYWNrZ3JvdW5kIENvbG9yJywgJ1NldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3Igb2RkIHJvd3MuJywgJ29kZFJvd0JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnaW5mb01vZGFsIEJhY2tncm91bmQgQ29sb3InLCAnU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciB0aGUgaW5mbyBtb2RhbC4nLCAnaW5mb01vZGFsQmFja2dyb3VuZCcpO1xyXG4gICAgdGhpcy5hZGRGb250U2V0dGluZyhjb250YWluZXJFbCwgJ0ZvbnQgU2l6ZScsICdTZXQgdGhlIGZvbnQgc2l6ZSBmb3IgdGhlIHJvd3MuJywgJ2ZvbnRTaXplJyk7XHJcbiAgICB0aGlzLmFkZEZvbnRTZXR0aW5nKGNvbnRhaW5lckVsLCAnUm93IFBhZGRpbmcnLCAnU2V0IHRoZSBwYWRkaW5nIGZvciB0aGUgcm93cy4nLCAncm93UGFkZGluZycpO1xyXG4gICAgdGhpcy5hZGRGb250U2V0dGluZyhjb250YWluZXJFbCwgJ0ljb24gU2l6ZScsICdTZXQgdGhlIHNpemUgb2YgdGhlIGljb25zLicsICdpY29uU2l6ZScpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxyXG4gICAgICAgIGJ1dHRvblxyXG4gICAgICAgICAgLnNldEJ1dHRvblRleHQoJ1dpcGUgSGlzdG9yeSBNb2R1bGUnKVxyXG4gICAgICAgICAgLy8uc2V0VG9vbHRpcCgnUmVzZXQgYWxsIHNldHRpbmdzIHRvIHRoZWlyIGRlZmF1bHQgdmFsdWVzJylcclxuICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2Vzc2lvbkhpc3RvcnkgPSBbXTtcclxuICAgICAgICAgICBuZXcgTm90aWNlKCdIaXN0b3J5IHdhcyB3aXBlZC4nKVxyXG4gICAgICAgICAgfSkpO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxyXG4gICAgICBidXR0b25cclxuICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUmVzZXQgdG8gRGVmYXVsdCcpXHJcbiAgICAgICAgLnNldFRvb2x0aXAoJ1Jlc2V0IGFsbCBzZXR0aW5ncyB0byB0aGVpciBkZWZhdWx0IHZhbHVlcycpXHJcbiAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5yZXNldFRvRGVmYXVsdCgpO1xyXG4gICAgICAgIH0pKTtcclxuICB9XHJcbiAgcHJpdmF0ZSBhZGRNdWx0aUNob2ljZVNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIGNob2ljZXM6IGFueSxzZXR0aW5nS2V5OiBrZXlvZiBNYXRoUGx1Z2luU2V0dGluZ3MpIHtcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRGb250U2V0dGluZyAoc3RyaW5nIGV4cGVjdGVkKS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcclxuICAgICAgICBjaG9pY2VzLmZvckVhY2goKGNob2ljZTogYW55KSA9PiB7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oY2hvaWNlLnZhbHVlLGNob2ljZS5kaXNwbGF5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBrZXlvZiBNYXRoUGx1Z2luU2V0dGluZ3MpIHtcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRTZXR0aW5nIChzdHJpbmcgZXhwZWN0ZWQpLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKG5hbWUpXHJcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxyXG4gICAgICAuYWRkQ29sb3JQaWNrZXIoY29sb3JQaWNrZXIgPT4ge1xyXG4gICAgICAgIGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzW3NldHRpbmdLZXldO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0eXBlb2Ygc2V0dGluZ1ZhbHVlID09PSAnc3RyaW5nJykgeyBcclxuICAgICAgICAgIGNvbG9yUGlja2VyLnNldFZhbHVlKHNldHRpbmdWYWx1ZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbG9yUGlja2VyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnBsdWdpbi5zZXR0aW5nc1tzZXR0aW5nS2V5XSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgQ2Fubm90IGFzc2lnbiBhIHN0cmluZyB2YWx1ZSB0byAke3NldHRpbmdLZXl9IChub24tc3RyaW5nIHNldHRpbmcpLmApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBhZGRGb250U2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleToga2V5b2YgTWF0aFBsdWdpblNldHRpbmdzKSB7XHJcbiAgICAvLyBFbnN1cmUgdGhhdCAnc2Vzc2lvbkhpc3RvcnknIGlzIG5vdCBiZWluZyBwcm9jZXNzZWQgYnkgYWRkRm9udFNldHRpbmdcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRGb250U2V0dGluZyAoc3RyaW5nIGV4cGVjdGVkKS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICBcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ1ZhbHVlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIHNldHRpbmcgaXMgYSBzdHJpbmdcclxuICAgICAgICBpZiAodHlwZW9mIHNldHRpbmdWYWx1ZSA9PT0gJ3N0cmluZycpIHsgXHJcbiAgICAgICAgICB0ZXh0LnNldFBsYWNlaG9sZGVyKHNldHRpbmdWYWx1ZSkuc2V0VmFsdWUoc2V0dGluZ1ZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGV4dC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIC8vIEVuc3VyZSB3ZSBhcmUgb25seSBhc3NpZ25pbmcgdG8gc3RyaW5nIHNldHRpbmdzXHJcbiAgICAgICAgICBpZiAodHlwZW9mIHRoaXMucGx1Z2luLnNldHRpbmdzW3NldHRpbmdLZXldID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5nc1tzZXR0aW5nS2V5XSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4udXBkYXRlU3R5bGVzKCk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBDYW5ub3QgYXNzaWduIGEgc3RyaW5nIHZhbHVlIHRvICR7c2V0dGluZ0tleX0gKG5vbi1zdHJpbmcgc2V0dGluZykuYCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuICBcclxuICAvLyBSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0IHZhbHVlc1xyXG4gIHByaXZhdGUgYXN5bmMgcmVzZXRUb0RlZmF1bHQoKSB7XHJcbiAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xyXG4gICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB0aGlzLnBsdWdpbi51cGRhdGVTdHlsZXMoKTtcclxuICAgIG5ldyBOb3RpY2UoJ1NldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byBkZWZhdWx0LicpO1xyXG4gICAgdGhpcy5kaXNwbGF5KCk7IC8vIFJlZnJlc2ggdGhlIHNldHRpbmdzIGRpc3BsYXlcclxuICB9XHJcbn1cclxuZnVuY3Rpb24gZ2V0U2hhcGVzQ2hhcmFjdGVyaXN0aWNzKCl7XHJcbiAgcmV0dXJuIFtcclxuICAgIHtcclxuICAgICAgbmFtZTogJ2xpbmUnLCBcclxuICAgICAgY29vcmRpbmF0ZXM6IDIsXHJcbiAgICAgIHNpZGVzOiAxLFxyXG4gICAgICBhbmdsZXM6MCxcclxuICAgICAgY29tYmluYXRpb25zOiBbXHJcbiAgICAgICAgeyBjb29yZGluYXRlczogMn0sXHJcbiAgICAgICAgeyBzaWRlczogMSxhbmdsZXM6IDAsY29vcmRpbmF0ZXM6IDB9LFxyXG4gICAgICBdXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAndHJpYW5nbGUnLCBcclxuICAgICAgY29vcmRpbmF0ZXM6IDMsIFxyXG4gICAgICBzaWRlczogMSxcclxuICAgICAgYW5nbGVzOjAsXHJcbiAgICAgIGNvbWJpbmF0aW9uczogW1xyXG4gICAgICAgIHsgY29vcmRpbmF0ZXM6IDN9LFxyXG4gICAgICAgIHsgc2lkZXM6IDMsIGFuZ2xlczogMCB9LCAvLyAzIHNpZGVzLCBhdCBsZWFzdCAxIGFuZ2xlXHJcbiAgICAgICAgeyBzaWRlczogMiwgYW5nbGVzOiAxIH0sIC8vIDIgc2lkZXMgYW5kIDEgYW5nbGUgKFNBUylcclxuICAgICAgICB7IGFuZ2xlczogMiwgc2lkZXM6IDEgfSAgLy8gMiBhbmdsZXMgYW5kIDEgc2lkZSAoQVNBKVxyXG4gICAgICBdXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAnc3F1YXJlJyxcclxuICAgICAgY29vcmRpbmF0ZXM6IDQsXHJcbiAgICAgIHNpZGVzOiAxLFxyXG4gICAgICBhbmdsZXM6MCxcclxuICAgICAgY29tYmluYXRpb25zOiBbXHJcbiAgICAgICAgeyBjb29yZGluYXRlczogM30sIFxyXG4gICAgICAgIHsgc2lkZXM6IDJ9LFxyXG4gICAgICAgIHsgYW5nbGVzOiAwfSwgIFxyXG4gICAgICBdXHJcbiAgICB9XHJcbiAgXTtcclxufVxyXG5cclxuY2xhc3MgYmlub21JbmZvTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcblxyXG4gIHByaXZhdGUgZXF1YWw6IG51bWJlciA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgbGVzc0VxdWFsOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgYmlnOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWw6IG51bWJlciA9IDA7XHJcbiAgXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogYW55KSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy5uID0gTnVtYmVyKHNvdXJjZVsxXSk7IFxyXG4gICAgdGhpcy5rID0gTnVtYmVyKHNvdXJjZVsyXSk7IFxyXG4gICAgdGhpcy5wID0gTnVtYmVyKHNvdXJjZVszXSk7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICB0aGlzLmFzc2lnblByb2JhYmlsaXR5KCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzJyB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcclxuICB9XHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlcns7cmV0dXJuIHRoaXMuZmFjdG9yaWFsKHRoaXMubix0aGlzLmssdGhpcy5wKX1cclxuXHJcbiAgcHJpdmF0ZSBmYWN0b3JpYWwobjogbnVtYmVyLCBrOiBudW1iZXIsIHA6IG51bWJlcikge1xyXG4gICAgbGV0IHN1bSA9IDEsIHN1bUsgPSAxLCBzdW1OSyA9IDE7XHJcbiAgICBcclxuICAgIC8vIENhbGN1bGF0ZSBmYWN0b3JpYWxzXHJcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBuOyBpKyspIHtcclxuICAgICAgc3VtICo9IGk7XHJcbiAgICAgIGlmIChpID09PSBrKSBzdW1LID0gc3VtO1xyXG4gICAgICBpZiAoaSA9PT0gKG4gLSBrKSkgc3VtTksgPSBzdW07XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3VtIC8gKHN1bUsgKiBzdW1OSykgKiBNYXRoLnBvdyhwLCBrKSAqIE1hdGgucG93KDEgLSBwLCBuIC0gayk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzc2lnblByb2JhYmlsaXR5KCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykge3RoaXMuZXF1YWwgPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA8IHRoaXMuaykge3RoaXMubGVzcyArPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHt0aGlzLmxlc3NFcXVhbCArPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA+IHRoaXMuaykge3RoaXMuYmlnICs9IHRoaXMuZmFjdG9yaWFsKHRoaXMubiwgaSwgdGhpcy5wKTt9XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykge3RoaXMuYmlnRXF1YWwgKz0gdGhpcy5mYWN0b3JpYWwodGhpcy5uLCBpLCB0aGlzLnApO31cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuIl19