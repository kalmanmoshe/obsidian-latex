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
class context {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi3igajXntep15TiganigJlzIOKBqExhcHRvcOKBqS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21haW4t4oGo157XqdeU4oGp4oCZcyDigahMYXB0b3DigakudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQWdCLGdCQUFnQixFQUFFLGdCQUFnQixFQUFPLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBMEIsTUFBTSxVQUFVLENBQUM7QUFDcEosT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBYzdDLE1BQU0sZ0JBQWdCLEdBQXVCO0lBQzNDLGdCQUFnQixFQUFFLE1BQU07SUFDeEIsVUFBVSxFQUFFLFNBQVM7SUFDckIsaUJBQWlCLEVBQUUsU0FBUztJQUM1QixnQkFBZ0IsRUFBRSxTQUFTO0lBQzNCLG1CQUFtQixFQUFFLFNBQVM7SUFDOUIsUUFBUSxFQUFFLFFBQVE7SUFDbEIsVUFBVSxFQUFFLFVBQVU7SUFDdEIsUUFBUSxFQUFFLE1BQU07SUFDaEIsY0FBYyxFQUFFLEVBQUU7Q0FDbkIsQ0FBQztBQUVGLE1BQU0sQ0FBQyxPQUFPLE9BQU8sVUFBVyxTQUFRLE1BQU07SUFHdEMsTUFBTTs7WUFDVixvREFBb0Q7WUFDcEQsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM3RCxJQUFJLENBQUMsa0NBQWtDLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFFcEIsSUFBSSxDQUFDLFVBQVUsQ0FBQztnQkFDZCxFQUFFLEVBQUUsaUJBQWlCO2dCQUNyQixJQUFJ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RSxFQUFFO1lBQ2hDLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLEVBQUU7Z0JBQUMsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUFDO1lBQ25FLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLEVBQUU7Z0JBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUFDO1lBQ2pFLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUU7Z0JBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUFDO1lBQ3ZFLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLEVBQUU7Z0JBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUFDO1lBQ2hFLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUU7Z0JBQUMsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUFDO1NBQ3ZFO0lBQ0gsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGx1Z2luLCBNYXJrZG93blZpZXcsIE1hcmtkb3duUmVuZGVyZXIsIFBsdWdpblNldHRpbmdUYWIsIEFwcCwgU2V0dGluZywgTW9kYWwsIE5vdGljZSwgQ29tcG9uZW50LCBFZGl0b3IsIEVkaXRvclBvc2l0aW9uIH0gZnJvbSAnb2JzaWRpYW4nO1xyXG5pbXBvcnQgeyBjb250cm9sbGVyIH0gZnJvbSAnLi9tYXRoRW5naW5lLmpzJztcclxuLy8gRGVmaW5lIHRoZSBpbnRlcmZhY2UgZm9yIHBsdWdpbiBzZXR0aW5nc1xyXG5pbnRlcmZhY2UgTWF0aFBsdWdpblNldHRpbmdzIHtcclxuICBudW1iZXJGb3JtYXR0aW5nOiBzdHJpbmdcclxuICBiYWNrZ3JvdW5kOiBzdHJpbmc7XHJcbiAgZXZlblJvd0JhY2tncm91bmQ6IHN0cmluZztcclxuICBvZGRSb3dCYWNrZ3JvdW5kOiBzdHJpbmc7XHJcbiAgaW5mb01vZGFsQmFja2dyb3VuZDogc3RyaW5nO1xyXG4gIGZvbnRTaXplOiBzdHJpbmc7XHJcbiAgcm93UGFkZGluZzogc3RyaW5nO1xyXG4gIGljb25TaXplOiBzdHJpbmc7XHJcbiAgc2Vzc2lvbkhpc3Rvcnk6IHsgaW5wdXQ6IHN0cmluZywgcmVzdWx0OiBzdHJpbmcgfVtdOyBcclxufVxyXG5cclxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTWF0aFBsdWdpblNldHRpbmdzID0ge1xyXG4gIG51bWJlckZvcm1hdHRpbmc6ICcuMDAwJyxcclxuICBiYWNrZ3JvdW5kOiBgIzQ0NDc1QWAsXHJcbiAgZXZlblJvd0JhY2tncm91bmQ6ICcjZjlmOWY5JyxcclxuICBvZGRSb3dCYWNrZ3JvdW5kOiAnIzc0NzY4OCcsXHJcbiAgaW5mb01vZGFsQmFja2dyb3VuZDogJyMwMDJCMzYnLFxyXG4gIGZvbnRTaXplOiAnMC44NWVtJyxcclxuICByb3dQYWRkaW5nOiAnNXB4IDEwcHgnLFxyXG4gIGljb25TaXplOiAnMTRweCcsXHJcbiAgc2Vzc2lvbkhpc3Rvcnk6IFtdXHJcbn07XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRoUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcclxuICBzZXR0aW5nczogTWF0aFBsdWdpblNldHRpbmdzO1xyXG4gIFxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcclxuICAgIC8vIExvYWQgc2V0dGluZ3MgYW5kIHJlZ2lzdGVyIHRoZSBtYXJrZG93biBwcm9jZXNzb3JcclxuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XHJcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IE1hdGhQbHVnaW5TZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ21hdGgtZW5naW5lJywgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcclxuXHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogJ29wZW4taW5wdXQtZm9ybScsXHJcbiAgICAgIG5hbWU6ICdPcGVuIElucHV0IEZvcm0nLFxyXG4gICAgICBjYWxsYmFjazogKCkgPT4ge1xyXG4gICAgICAgIG5ldyBDdXN0b21JbnB1dE1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6ICd2aWV3LXNlc3Npb24taGlzdG9yeScsXHJcbiAgICAgIG5hbWU6ICdWaWV3IFNlc3Npb24gSGlzdG9yeScsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiB7XHJcbiAgICAgICAgbmV3IEhpc3RvcnlNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBwcm9jZXNzTWF0aEJsb2NrKHNvdXJjZTogc3RyaW5nLCBlbDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgIGxldCB1c2VyVmFyaWFibGVzOiBhbnlbXSA9IFtdO1xyXG4gICAgbGV0IHNraXBwZWRJbmRleGVzPTBcclxuICAgIGVsLmNsYXNzTGlzdC5hZGQoJ21hdGgtY29udGFpbmVyJyk7XHJcblxyXG4gICAgbGV0IGV4cHJlc3Npb25zID0gc291cmNlLnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLnRyaW0oKSAhPT0gJycpO1xyXG4gICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBleHByZXNzaW9ucyA9IFsnMCddO1xyXG4gICAgfVxyXG5cclxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XHJcbiAgICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLnJlcGxhY2UoL1xccy9nLCBcIlwiKTtcclxuICAgICAgdXNlclZhcmlhYmxlcy5mb3JFYWNoKCh7IHZhcmlhYmxlLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgICAgY29uc3QgdmFyaWFibGVSZWdleCA9IG5ldyBSZWdFeHAoYFxcXFxiJHt2YXJpYWJsZS50cmltKCl9XFxcXGJgLCAnZycpOyBcclxuICAgICAgICBleHByZXNzaW9uID0gZXhwcmVzc2lvbi5yZXBsYWNlKHZhcmlhYmxlUmVnZXgsIHZhbHVlLnRyaW0oKSk7XHJcbiAgICAgIH0pO1xyXG5cclxuICAgICAgLy8gSGFuZGxlIHZhcmlhYmxlIGRlY2xhcmF0aW9uXHJcbiAgICAgIGlmIChleHByZXNzaW9uLnN0YXJ0c1dpdGgoJ3ZhcicpICYmIGV4cHJlc3Npb24uaW5jbHVkZXMoJz0nKSkge1xyXG4gICAgICAgIGxldCBzcGxpdFZhciA9IGV4cHJlc3Npb24uc3Vic3RyaW5nKDMpLnNwbGl0KCc9Jyk7XHJcbiAgICAgICAgY29uc3QgaW5kZXggPSB1c2VyVmFyaWFibGVzLmZpbmRJbmRleCh2ID0+IHYudmFyaWFibGUgPT09IHNwbGl0VmFyWzBdLnRyaW0oKSk7XHJcbiAgICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgdXNlclZhcmlhYmxlc1tpbmRleF0udmFsdWUgPSBzcGxpdFZhclsxXS50cmltKCk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHVzZXJWYXJpYWJsZXMucHVzaCh7IHZhcmlhYmxlOiBzcGxpdFZhclswXS50cmltKCksIHZhbHVlOiBzcGxpdFZhclsxXS50cmltKCkgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHNraXBwZWRJbmRleGVzKys7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCBsaW5lQ29udGFpbmVyID0gZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1saW5lLWNvbnRhaW5lcicgfSk7XHJcbiAgICAgIGxpbmVDb250YWluZXIuYWRkQ2xhc3MoKGluZGV4LXNraXBwZWRJbmRleGVzKSUyID09PSAwID8gJ21hdGgtcm93LWV2ZW4nIDogJ21hdGgtcm93LW9kZCcpO1xyXG4gICAgICBjb25zdCBpbnB1dERpdiA9IGxpbmVDb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1pbnB1dCcgfSk7XHJcbiAgICAgIGNvbnN0IHJlc3VsdERpdiA9IGxpbmVDb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1yZXN1bHQnIH0pO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgYmlub21SZWdleCA9IC9iaW5vbVxcKChbXFxkLl0rKSwoW1xcZC5dKyksKFtcXGQuXSspXFwpLztcclxuICAgICAgY29uc3QgbWF0Y2ggPSBleHByZXNzaW9uLm1hdGNoKGJpbm9tUmVnZXgpO1xyXG5cclxuICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgbGV0IGJpbm9tPW5ldyBiaW5vbUluZm9Nb2RlbCh0aGlzLmFwcCwgbWF0Y2ggKVxyXG4gICAgICAgIGlucHV0RGl2LmlubmVyVGV4dCA9IGAke2V4cHJlc3Npb259YDtcclxuICAgICAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYCR7Ymlub20uZ2V0RXF1YWwoKX1gO1xyXG4gICAgICAgIGNvbnN0IGljb25zRGl2ID0gdGhpcy5jcmVhdGVJY29uc0NvbnRhaW5lcigpO1xyXG4gICAgICAgIHRoaXMuYWRkSWNvbkxpc3RlbmVycyhpY29uc0RpdiwgbWF0Y2gsJ2Jpbm9tJyk7XHJcbiAgICAgICAgbGluZUNvbnRhaW5lci5hcHBlbmQoaW5wdXREaXYsIHJlc3VsdERpdiwgaWNvbnNEaXYpO1xyXG4gICAgICAgIGVsLmFwcGVuZENoaWxkKGxpbmVDb250YWluZXIpO1xyXG4gICAgICAgIHJldHVyblxyXG4gICAgICB9XHJcblxyXG4gICAgICBsZXQgcmVzdWx0O1xyXG4gICAgICB0cnkge1xyXG4gICAgICAgIHJlc3VsdCA9IGNvbnRyb2xsZXIoZXhwcmVzc2lvbik7XHJcbiAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGAkXFx7JHtyZXN1bHQucHJvY2Vzc2VkaW5wdXR9XFx9JGAsIGlucHV0RGl2LCAnJywgdGhpcyk7XHJcbiAgICAgICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKC8odHJ1ZXxmYWxzZSkvLnRlc3QocmVzdWx0LnNvbHV0aW9uKSA/IHJlc3VsdC5zb2x1dGlvbiA6IGAkXFx7JHtyZXN1bHQuc29sdXRpb259XFx9JGAsIHJlc3VsdERpdiwgJycsIHRoaXMpO1xyXG4gICAgICAgICAgY29uc3QgaWNvbnNEaXYgPSB0aGlzLmNyZWF0ZUljb25zQ29udGFpbmVyKCk7XHJcbiAgICAgICAgICB0aGlzLmFkZEljb25MaXN0ZW5lcnMoaWNvbnNEaXYsIHJlc3VsdCwnZGVmYXVsdCcpO1xyXG4gICAgICAgICAgbGluZUNvbnRhaW5lci5hcHBlbmQoaW5wdXREaXYsIHJlc3VsdERpdiwgaWNvbnNEaXYpO1xyXG4gICAgICAgIH1cclxuICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihleHByZXNzaW9uLCBpbnB1dERpdiwgJycsIHRoaXMpO1xyXG4gICAgICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+JHtlcnIubWVzc2FnZX08L3NwYW4+YDtcclxuICAgICAgICBsaW5lQ29udGFpbmVyLmFkZENsYXNzKCdtYXRoLWVycm9yLWxpbmUnKTtcclxuICAgICAgfVxyXG4gICAgICBcclxuICAgICAgZWwuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8vIENyZWF0ZSBpY29ucyBjb250YWluZXJcclxuICBwcml2YXRlIGNyZWF0ZUljb25zQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcclxuICAgIGNvbnN0IGljb25zRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICBpY29uc0Rpdi5jbGFzc0xpc3QuYWRkKCdtYXRoLWljb25zJyk7XHJcbiAgICBpY29uc0Rpdi5pbm5lckhUTUwgPSBgXHJcbiAgICAgIDxzcGFuIGNsYXNzPVwibWF0aC1pbmZvLWljb25cIj7wn5uIPC9zcGFuPlxyXG4gICAgICA8c3BhbiBjbGFzcz1cIm1hdGgtZGVidWctaWNvblwiPvCfkJ48L3NwYW4+YDtcclxuICAgIHJldHVybiBpY29uc0RpdjtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkSWNvbkxpc3RlbmVycyhpY29uc0RpdjogSFRNTEVsZW1lbnQsIHJlc3VsdDogYW55LGluZm9Nb2RlOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIGljb25zRGl2LnF1ZXJ5U2VsZWN0b3IoJy5tYXRoLWluZm8taWNvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgc3dpdGNoIChpbmZvTW9kZSkge1xyXG4gICAgICAgIGNhc2UgJ2Jpbm9tJzpcclxuICAgICAgICAgIG5ldyBiaW5vbUluZm9Nb2RlbCh0aGlzLmFwcCwgcmVzdWx0KS5vcGVuKCk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgbmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgcmVzdWx0Lm1hdGhJbmZvLCByZXN1bHQuc29sdXRpb25JbmZvKS5vcGVuKCk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgaWNvbnNEaXYucXVlcnlTZWxlY3RvcignLm1hdGgtZGVidWctaWNvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgbmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHJlc3VsdC5kZWJ1Z0luZm8pLm9wZW4oKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLy8gTG9hZCBzZXR0aW5nc1xyXG4gIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcclxuICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xyXG4gIH1cclxuXHJcbiAgLy8gU2F2ZSBzZXR0aW5nc1xyXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcclxuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcbiAgfVxyXG5cclxuICAvLyBVcGRhdGUgc3R5bGVzIGJhc2VkIG9uIHNldHRpbmdzXHJcbiAgdXBkYXRlU3R5bGVzKCkge1xyXG4gICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tcm93LWJhY2tncm91bmQnLCB0aGlzLnNldHRpbmdzLmJhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1ldmVuLXJvdy1iYWNrZ3JvdW5kJywgdGhpcy5zZXR0aW5ncy5ldmVuUm93QmFja2dyb3VuZCk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLW9kZC1yb3ctYmFja2dyb3VuZCcsIHRoaXMuc2V0dGluZ3Mub2RkUm93QmFja2dyb3VuZCk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLWluZm8tbW9kYWwtY29sdW1uLWJhY2tncm91bmQnLCB0aGlzLnNldHRpbmdzLmluZm9Nb2RhbEJhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1mb250LXNpemUnLCB0aGlzLnNldHRpbmdzLmZvbnRTaXplKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tcm93LXBhZGRpbmcnLCB0aGlzLnNldHRpbmdzLnJvd1BhZGRpbmcpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1pY29uLXNpemUnLCB0aGlzLnNldHRpbmdzLmljb25TaXplKTtcclxuICB9XHJcbn1cclxuY2xhc3MgY29udGV4dCB7XHJcbiAgXHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgQ3VzdG9tSW5wdXRNb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgdXNlckNob2ljZTogbnVtYmVyID0gMDtcclxuICB1c2VyQ29vcmRpbmF0ZXNJbnB1dDogc3RyaW5nID0gJygwLDApLCgxLDApLCgxLDEpJztcclxuICB1c2VyU2lkZXNJbnB1dDogc3RyaW5nID0gJyc7XHJcbiAgdXNlckFuZ2xlc0lucHV0OiBzdHJpbmcgPSAnJztcclxuICByZXN1bHRDb250YWluZXI6IEhUTUxFbGVtZW50O1xyXG4gIHNoYXBlc0NoYXJhY3RlcmlzdGljczogYW55O1xyXG4gIGV2YWxlZFVzZXJJbnB1dEluZm86IGFueSA9IG51bGw7XHJcbiAgc2F2ZWRWYWx1ZXM6IGFueSA9IHt9O1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBNYXRoUGx1Z2luKSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdFbnRlciBNYXRoIEV4cHJlc3Npb24nIH0pO1xyXG5cclxuICAgIC8vIEFzc2lnbiBzaGFwZXNDaGFyYWN0ZXJpc3RpY3MgZ2xvYmFsbHlcclxuICAgIHRoaXMuc2hhcGVzQ2hhcmFjdGVyaXN0aWNzID0gZ2V0U2hhcGVzQ2hhcmFjdGVyaXN0aWNzKCk7XHJcblxyXG4gICAgY29uc3Qgc2V0dGluZ3NDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiAnc2V0dGluZ3MtY29udGFpbmVyJyB9KTtcclxuICAgIGNvbnN0IGR5bmFtaWNGaWVsZENvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICdkeW5hbWljLWZpZWxkLWNvbnRhaW5lcicgfSk7XHJcbiAgICBjb25zdCB0aWt6R3JhcGhDb250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRGl2KHsgY2xzOiAnZHluYW1pYy1maWVsZC1jb250YWluZXInIH0pO1xyXG4gICAgY29uc3Qgc3VibWl0QnV0dG9uID0gY29udGVudEVsLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdTdWJtaXQnLCBhdHRyOiB7IGRpc2FibGVkOiAndHJ1ZScgfSB9KTtcclxuICAgIGNvbnN0IHRlbXBvcmFyeURlYnVnQXJlYSA9IGNvbnRlbnRFbC5jcmVhdGVEaXYoeyBjbHM6ICd0ZW1wb3JhcnktZGVidWctYXJlYScgfSk7XHJcbiAgICBzdWJtaXRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIGlmICh0aGlzLmV2YWxlZFVzZXJJbnB1dEluZm8gJiYgdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvLm1lZXRzTWluUmVxdWlyZW1lbnRzKSB7XHJcbiAgICAgICAgdGhpcy5oYW5kbGVTdWJtaXQoKTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBuZXcgTm90aWNlKCdQbGVhc2UgZW50ZXIgdmFsaWQgaW5wdXQuJyk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKHNldHRpbmdzQ29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnQ2hvb3NlIHNoYXBlJylcclxuICAgICAgLnNldERlc2MoJ1NlbGVjdCB0aGUgc2hhcGUgdG8gcGVyZm9ybSB0aGUgb3BlcmF0aW9ucyBvbi4nKVxyXG4gICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4ge1xyXG4gICAgICAgIHRoaXMuc2hhcGVzQ2hhcmFjdGVyaXN0aWNzLmZvckVhY2goKHNoYXBlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgIGRyb3Bkb3duLmFkZE9wdGlvbihpbmRleC50b1N0cmluZygpLCBzaGFwZS5uYW1lKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnVzZXJDaG9pY2UgPSAwO1xyXG4gICAgICAgIHRoaXMucmVuZGVyRHluYW1pY0ZpZWxkcyhkeW5hbWljRmllbGRDb250YWluZXIpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGRyb3Bkb3duLm9uQ2hhbmdlKHZhbHVlID0+IHtcclxuICAgICAgICAgIHRoaXMudXNlckNob2ljZSA9IE51bWJlcih2YWx1ZSk7XHJcbiAgICAgICAgICB0aGlzLnJlbmRlckR5bmFtaWNGaWVsZHMoZHluYW1pY0ZpZWxkQ29udGFpbmVyKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICBcclxuICAgIGNvbnRlbnRFbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsICgpID0+IHtcclxuICAgICAgdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvID0gdGhpcy50ZXN0TWluSW5wdXRSZXF1aXJlbWVudHMoKTtcclxuICAgICAgaWYgKHRoaXMuZXZhbGVkVXNlcklucHV0SW5mby5tZWV0c01pblJlcXVpcmVtZW50cykge1xyXG4gICAgICAgIHN1Ym1pdEJ1dHRvbi5yZW1vdmVBdHRyaWJ1dGUoJ2Rpc2FibGVkJyk7XHJcbiAgICAgICAgdGlrekdyYXBoQ29udGFpbmVyLmVtcHR5KCk7XHJcbiAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihjcmVhdGVUaWt6R3JhcGgodGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvKSwgdGlrekdyYXBoQ29udGFpbmVyLCAnJywgbmV3IENvbXBvbmVudCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGVtcG9yYXJ5RGVidWdBcmVhLmVtcHR5KCk7XHJcbiAgICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFxgXFxgXFxganNcXG4ke0pTT04uc3RyaW5naWZ5KHRoaXMuZXZhbGVkVXNlcklucHV0SW5mbywgbnVsbCwgMC4wMSl9XFxuXFxgXFxgXFxgYCtjcmVhdGVUaWt6R3JhcGgodGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvKSwgdGVtcG9yYXJ5RGVidWdBcmVhLCAnJywgbmV3IENvbXBvbmVudCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgc3VibWl0QnV0dG9uLnNldEF0dHJpYnV0ZSgnZGlzYWJsZWQnLCAndHJ1ZScpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICAgIFxyXG4gIH1cclxuXHJcbiAgcmVuZGVyRHluYW1pY0ZpZWxkcyhjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICBjb250YWluZXIuZmluZEFsbCgnLmR5bmFtaWMtZmllbGQnKS5mb3JFYWNoKGVsID0+IGVsLnJlbW92ZSgpKTtcclxuICAgIGNvbnN0IHNoYXBlID0gdGhpcy5zaGFwZXNDaGFyYWN0ZXJpc3RpY3NbdGhpcy51c2VyQ2hvaWNlXTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdDb29yZGluYXRlcycpXHJcbiAgICAgIC5zZXREZXNjKGBFbnRlciAke3NoYXBlLmNvb3JkaW5hdGVzfSBjb29yZGluYXRlcyBmb3IgJHtzaGFwZS5uYW1lfSBpbiAoeCwgeSkgZm9ybWF0YClcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnVzZXJDb29yZGluYXRlc0lucHV0fHwnJyk7IFxyXG4gICAgICAgIHRleHQub25DaGFuZ2UodmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy51c2VyQ29vcmRpbmF0ZXNJbnB1dCA9IHZhbHVlO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KVxyXG4gICAgICAuc2V0dGluZ0VsLmFkZENsYXNzKCdkeW5hbWljLWZpZWxkJyk7XHJcblxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyKVxyXG4gICAgICAuc2V0TmFtZSgnU2lkZXMnKVxyXG4gICAgICAuc2V0RGVzYyhgRW50ZXIgJHtzaGFwZS5jb29yZGluYXRlc30gc2lkZXMgZm9yICR7c2hhcGUubmFtZX1gKVxyXG4gICAgICAuYWRkVGV4dCh0ZXh0ID0+IHtcclxuICAgICAgICB0ZXh0LnNldFZhbHVlKHRoaXMudXNlclNpZGVzSW5wdXR8fCcnKTsgXHJcbiAgICAgICAgdGV4dC5vbkNoYW5nZSh2YWx1ZSA9PiB7XHJcbiAgICAgICAgICB0aGlzLnVzZXJTaWRlc0lucHV0ID0gdmFsdWU7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5zZXR0aW5nRWwuYWRkQ2xhc3MoJ2R5bmFtaWMtZmllbGQnKTtcclxuXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXIpXHJcbiAgICAgIC5zZXROYW1lKCdBbmdsZXMnKVxyXG4gICAgICAuc2V0RGVzYyhgRW50ZXIgJHtzaGFwZS5jb29yZGluYXRlc30gYW5nbGVzIGZvciAke3NoYXBlLm5hbWV9YClcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgdGV4dC5zZXRWYWx1ZSh0aGlzLnVzZXJBbmdsZXNJbnB1dHx8JycpO1xyXG4gICAgICAgIHRleHQub25DaGFuZ2UodmFsdWUgPT4ge1xyXG4gICAgICAgICAgdGhpcy51c2VyQW5nbGVzSW5wdXQgPSB2YWx1ZTtcclxuICAgICAgICB9KTtcclxuICAgICAgfSlcclxuICAgICAgLnNldHRpbmdFbC5hZGRDbGFzcygnZHluYW1pYy1maWVsZCcpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lcilcclxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cclxuICAgICAgICBidXR0b25cclxuICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDbGVhcicpXHJcbiAgICAgICAgICAuc2V0VG9vbHRpcCgnQ2xlYXIgYWxsIHByZXZpb3VzIGZpZWxkcycpXHJcbiAgICAgICAgICAub25DbGljaygoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMudXNlckNvb3JkaW5hdGVzSW5wdXQ9Jyc7XHJcbiAgICAgICAgICAgIHRoaXMudXNlclNpZGVzSW5wdXQ9Jyc7XHJcbiAgICAgICAgICAgIHRoaXMudXNlckFuZ2xlc0lucHV0PScnO1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlckR5bmFtaWNGaWVsZHMoY29udGFpbmVyKTtcclxuICAgICAgICAgIH0pXHJcbiAgICAgIClcclxuICAgICAgLnNldHRpbmdFbC5hZGRDbGFzcygnZHluYW1pYy1maWVsZCcpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSB0ZXN0TWluSW5wdXRSZXF1aXJlbWVudHMoKSB7XHJcbiAgICBjb25zdCBvYmplY3RpZmllZENvb3JkaW5hdGVzID0gc3BsaXRDb29yZGluYXRlcyh0aGlzLnVzZXJDb29yZGluYXRlc0lucHV0KSxcclxuICAgICAgICAgIG9iamVjdGlmaWVkU2lkZXMgPSBzcGxpdFNpZGVzKHRoaXMudXNlclNpZGVzSW5wdXQpLFxyXG4gICAgICAgICAgb2JqZWN0aWZpZWRBbmdsZXMgPSBzcGxpdEFuZ2xlcyh0aGlzLnVzZXJBbmdsZXNJbnB1dCk7XHJcblxyXG4gICAgY29uc3Qgc2hhcGVOYW1lID0gdGhpcy5zaGFwZXNDaGFyYWN0ZXJpc3RpY3NbdGhpcy51c2VyQ2hvaWNlXS5uYW1lO1xyXG5cclxuICAgIGNvbnN0IGlzU2hhcGVWYWxpZCA9IGNoZWNrU2hhcGVSZXF1aXJlbWVudHMoc2hhcGVOYW1lLCBvYmplY3RpZmllZENvb3JkaW5hdGVzLCBvYmplY3RpZmllZFNpZGVzLCBvYmplY3RpZmllZEFuZ2xlcyk7XHJcblxyXG4gICAgaWYgKGlzU2hhcGVWYWxpZCkge1xyXG4gICAgICBpZiAoIXRoaXMucmVzdWx0Q29udGFpbmVyKSB7XHJcbiAgICAgICAgdGhpcy5yZXN1bHRDb250YWluZXIgPSB0aGlzLmNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbnB1dC1tb2RhbC1yZXN1bHQtY29udGFpbmVyJyB9KTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLnJlc3VsdENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdpbnB1dC1tb2RhbC1yZXN1bHQtZXJyJyk7XHJcbiAgICAgIHRoaXMucmVzdWx0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2lucHV0LW1vZGFsLXJlc3VsdC1jb250YWluZXInKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGlmICghdGhpcy5yZXN1bHRDb250YWluZXIpIHtcclxuICAgICAgICB0aGlzLnJlc3VsdENvbnRhaW5lciA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2lucHV0LW1vZGFsLXJlc3VsdC1lcnInIH0pO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMucmVzdWx0Q29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2lucHV0LW1vZGFsLXJlc3VsdC1jb250YWluZXInKTtcclxuICAgICAgdGhpcy5yZXN1bHRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaW5wdXQtbW9kYWwtcmVzdWx0LWVycicpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHsgbWVldHNNaW5SZXF1aXJlbWVudHM6IGlzU2hhcGVWYWxpZCxzaGFwZTogc2hhcGVOYW1lLCBjb29yZGluYXRlczogb2JqZWN0aWZpZWRDb29yZGluYXRlcywgc2lkZXM6IG9iamVjdGlmaWVkU2lkZXMsIGFuZ2xlczogb2JqZWN0aWZpZWRBbmdsZXMgfTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlU3VibWl0KCkge1xyXG5cclxuICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5ldmFsZWRVc2VySW5wdXRJbmZvO1xyXG4gICAgICB0aGlzLnJlc3VsdENvbnRhaW5lci50ZXh0Q29udGVudCA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdCk7XHJcblxyXG4gICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeS5wdXNoKHtcclxuICAgICAgICBpbnB1dDogdGhpcy51c2VyQW5nbGVzSW5wdXQsXHJcbiAgICAgICAgcmVzdWx0OiByZXN1bHRcclxuICAgICAgfSk7XHJcbiAgICAgIHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xyXG4gICAgXHJcbiAgfVxyXG4gIG9uQ2xvc2UoKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlVGlrekdyYXBoKHVzZXJJbnB1dDogYW55KXtcclxuICBjb25zdCBzaGFwZXNDaGFyYWN0ZXJpc3RpY3M9Z2V0U2hhcGVzQ2hhcmFjdGVyaXN0aWNzKCksYmVnaW5HcmFwaD1gXFxgXFxgXFxgdGlrelxcbmAsZW5kR3JhcGg9YFxcblxcYFxcYFxcYGA7XHJcbiAgbGV0IGRpc3BsYXlQaWN0dXJlT3B0aW9uPVN0cmluZy5yYXdgW3NjYWxlPTFwdCwgeD0xY20sIHk9MWNtLHdoaXRlXWA7XHJcbiAgdXNlcklucHV0ID0gbmFtZVRoZVNoYXBlKFxyXG4gICAgdXNlcklucHV0LnNoYXBlLFxyXG4gICAgdXNlcklucHV0LmNvb3JkaW5hdGVzLFxyXG4gICAgdXNlcklucHV0LnNpZGVzLFxyXG4gICAgdXNlcklucHV0LmFuZ2xlc1xyXG4gICk7XHJcbiAgcmV0dXJuIGBcXGBcXGBcXGBqc1xcbmArSlNPTi5zdHJpbmdpZnkodXNlcklucHV0K2NhbGN1bGF0ZVNoYXBlKHVzZXJJbnB1dCksbnVsbCwwLjAxKStlbmRHcmFwaDtcclxufVxyXG5cclxuZnVuY3Rpb24gY2FsY3VsYXRlU2hhcGUodXNlcklucHV0OiBhbnkpIHtcclxuICBjb25zdCBzaGFwZXNDaGFyYWN0ZXJpc3RpY3MgPSBnZXRTaGFwZXNDaGFyYWN0ZXJpc3RpY3MoKTtcclxuICBsZXQgY29vcmRpbmF0ZXMgPSB1c2VySW5wdXQuY29vcmRpbmF0ZXM7XHJcbiAgbGV0IGxlbmd0aHM6IHsgZWRnZTE6IHN0cmluZywgZWRnZTI6IHN0cmluZywgbGVuZ3RoOiBudW1iZXIgfVtdID0gW107XHJcblxyXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgY29vcmRpbmF0ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgIGxldCBzZWNvbmRDb29yZGluYXRlID0gaSE9PWNvb3JkaW5hdGVzLmxlbmd0aC0xP2krMTowO1xyXG4gICAgY29uc29sZS5sb2coaSxjb29yZGluYXRlcy5sZW5ndGgsaT09PWNvb3JkaW5hdGVzLmxlbmd0aC0xKVxyXG4gICAgbGVuZ3Rocy5wdXNoKHtcclxuICAgICAgZWRnZTE6IGNvb3JkaW5hdGVzW2ldLm5hbWUsXHJcbiAgICAgIGVkZ2UyOiBjb29yZGluYXRlc1tzZWNvbmRDb29yZGluYXRlXS5uYW1lLFxyXG4gICAgICBsZW5ndGg6IGZpbmRMZW5ndGgoY29vcmRpbmF0ZXNbaV0sIGNvb3JkaW5hdGVzW3NlY29uZENvb3JkaW5hdGVdKVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIFxyXG4gIHJldHVybiBKU09OLnN0cmluZ2lmeShsZW5ndGhzKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGZpbmRMZW5ndGgoY29vcmRpbmF0ZTE6IGFueSxjb29yZGluYXRlMjogYW55KXtcclxuICBjb25zdCB2YWx1ZVg9Y29vcmRpbmF0ZTEueC1jb29yZGluYXRlMi54O1xyXG4gIGNvbnN0IHZhbHVlWT1jb29yZGluYXRlMS55LWNvb3JkaW5hdGUyLnk7XHJcbiAgcmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyh2YWx1ZVgsMikrTWF0aC5wb3codmFsdWVZLDIpKVxyXG59XHJcbmZ1bmN0aW9uIHJlY29uc3RydWN0Q29vcmRpbmF0ZXMoY29vcmRpbmF0ZXM6IGFueSl7XHJcbiAgXHJcbn1cclxuZnVuY3Rpb24gbmFtZVRoZVNoYXBlKFxyXG4gIHNoYXBlOiBzdHJpbmcsIFxyXG4gIGNvb3JkaW5hdGVzOiB7IG5hbWU/OiBzdHJpbmcsIHg6IG51bWJlciwgeTogbnVtYmVyIH1bXSwgXHJcbiAgc2lkZXM6IHsgbmFtZT86IHN0cmluZywgbGVuZ3RoOiBudW1iZXIgfVtdLCBcclxuICBhbmdsZXM6IHsgbmFtZT86IHN0cmluZywgZGVncmVlczogbnVtYmVyIH1bXVxyXG4pIHtcclxuICBjb25zdCBhbHBoYWJldDogcmVhZG9ubHkgc3RyaW5nW10gPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVonLnNwbGl0KCcnKTtcclxuXHJcbiAgbGV0IHVubmFtZWRJbmRleCA9IDA7XHJcbiAgbGV0IHVzZWROYW1lczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XHJcblxyXG5cclxuICBmdW5jdGlvbiBhc3NpZ25VbmlxdWVOYW1lKCk6IHN0cmluZyB7XHJcbiAgICB3aGlsZSAodXNlZE5hbWVzLmhhcyhhbHBoYWJldFt1bm5hbWVkSW5kZXhdKSkge1xyXG4gICAgICB1bm5hbWVkSW5kZXgrKztcclxuICAgIH1cclxuICAgIGNvbnN0IG5ld05hbWUgPSBhbHBoYWJldFt1bm5hbWVkSW5kZXgrK107XHJcbiAgICB1c2VkTmFtZXMuYWRkKG5ld05hbWUpO1xyXG4gICAgcmV0dXJuIG5ld05hbWU7XHJcbiAgfVxyXG5cclxuICAvLyBQcm9jZXNzIGNvb3JkaW5hdGVzXHJcbiAgbGV0IG5ld0Nvb3JkaW5hdGVzOiB7IG5hbWU6IHN0cmluZywgeDogbnVtYmVyLCB5OiBudW1iZXIgfVtdID0gY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4ge1xyXG4gICAgaWYgKCFjb29yZGluYXRlLm5hbWUpIHtcclxuICAgICAgY29vcmRpbmF0ZS5uYW1lID0gYXNzaWduVW5pcXVlTmFtZSgpO1xyXG4gICAgfVxyXG4gICAgdXNlZE5hbWVzLmFkZChjb29yZGluYXRlLm5hbWUpOyBcclxuICAgIHJldHVybiB7IG5hbWU6IGNvb3JkaW5hdGUubmFtZSwgeDogY29vcmRpbmF0ZS54LCB5OiBjb29yZGluYXRlLnkgfTtcclxuICB9KTtcclxuXHJcbiAgbGV0IG5ld1NpZGVzOiB7IG5hbWU6IHN0cmluZywgbGVuZ3RoOiBudW1iZXIgfVtdID0gc2lkZXMubWFwKHNpZGUgPT4ge1xyXG4gICAgaWYgKCFzaWRlLm5hbWUpIHtcclxuICAgICAgc2lkZS5uYW1lID0gYXNzaWduVW5pcXVlTmFtZSgpO1xyXG4gICAgfVxyXG4gICAgdXNlZE5hbWVzLmFkZChzaWRlLm5hbWUpOyBcclxuICAgIHJldHVybiB7IG5hbWU6IHNpZGUubmFtZSwgbGVuZ3RoOiBzaWRlLmxlbmd0aCB9O1xyXG4gIH0pO1xyXG4gIGxldCBuZXdBbmdsZXM6IHsgbmFtZTogc3RyaW5nLCBkZWdyZWVzOiBudW1iZXIgfVtdID0gYW5nbGVzLm1hcChhbmdsZSA9PiB7XHJcbiAgICBpZiAoIWFuZ2xlLm5hbWUpIHtcclxuICAgICAgYW5nbGUubmFtZSA9IGFzc2lnblVuaXF1ZU5hbWUoKTtcclxuICAgIH1cclxuXHJcbiAgICB1c2VkTmFtZXMuYWRkKGFuZ2xlLm5hbWUpOyBcclxuICAgIFxyXG4gICAgcmV0dXJuIHsgbmFtZTogYW5nbGUubmFtZSwgZGVncmVlczogYW5nbGUuZGVncmVlcyB9O1xyXG4gIH0pO1xyXG5cclxuICByZXR1cm4ge1xyXG4gICAgc2hhcGU6IHNoYXBlLFxyXG4gICAgY29vcmRpbmF0ZXM6IG5ld0Nvb3JkaW5hdGVzLFxyXG4gICAgc2lkZXM6IG5ld1NpZGVzLFxyXG4gICAgYW5nbGVzOiBuZXdBbmdsZXNcclxuICB9O1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gY2hlY2tTaGFwZVJlcXVpcmVtZW50cyhzaGFwZU5hbWU6IHN0cmluZywgb2JqZWN0aWZpZWRDb29yZGluYXRlczogYW55W10sIG9iamVjdGlmaWVkU2lkZXM6IGFueVtdLCBvYmplY3RpZmllZEFuZ2xlczogYW55W10pOiBib29sZWFuIHtcclxuICBjb25zdCBzaGFwZXNDaGFyYWN0ZXJpc3RpY3MgPSBnZXRTaGFwZXNDaGFyYWN0ZXJpc3RpY3MoKTtcclxuICBjb25zdCBzaGFwZSA9IHNoYXBlc0NoYXJhY3RlcmlzdGljcy5maW5kKHMgPT4gcy5uYW1lID09PSBzaGFwZU5hbWUpO1xyXG4gIGlmICghc2hhcGUpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihgY3JpdGVyaWEgZm9yIHNoYXBlIFwiJHtzaGFwZU5hbWV9XCIgbm90IGZvdW5kYCk7XHJcbiAgfVxyXG4gIFxyXG4gIGNvbnN0IGlzVmFsaWRDb21iaW5hdGlvbiA9IHNoYXBlLmNvbWJpbmF0aW9ucy5zb21lKGNvbWJvID0+IHtcclxuICAgIGNvbnN0IGhhc1ZhbGlkY29vcmRzID0gY29tYm8uY29vcmRpbmF0ZXMgPyBvYmplY3RpZmllZENvb3JkaW5hdGVzLmxlbmd0aCA+PSBjb21iby5jb29yZGluYXRlcyA6IHRydWU7XHJcbiAgICBjb25zdCBoYXNWYWxpZFNpZGVzID0gY29tYm8uc2lkZXMgPyBvYmplY3RpZmllZFNpZGVzLmxlbmd0aCA+PSBjb21iby5zaWRlcyA6IHRydWU7XHJcbiAgICBjb25zdCBoYXNWYWxpZEFuZ2xlcyA9IGNvbWJvLmFuZ2xlcyA/IG9iamVjdGlmaWVkQW5nbGVzLmxlbmd0aCA+PSBjb21iby5hbmdsZXMgOiB0cnVlO1xyXG4gICAgcmV0dXJuIGhhc1ZhbGlkU2lkZXMgJiYgaGFzVmFsaWRBbmdsZXMmJmhhc1ZhbGlkY29vcmRzO1xyXG4gIH0pO1xyXG4gIFxyXG4gIHJldHVybiBpc1ZhbGlkQ29tYmluYXRpb247XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNwbGl0Q29vcmRpbmF0ZXMoaW5wdXQ6IHN0cmluZyk6IHsgeDogbnVtYmVyLCB5OiBudW1iZXIsIG5hbWU/OiBzdHJpbmcgfVtdIHtcclxuICBpbnB1dD1pbnB1dC5yZXBsYWNlKC9cXHMvZyxcIlwiKVxyXG4gIGNvbnN0IHJlZ2V4ID0gL1xcKChcXGQrKSwoXFxkKylcXCkoW2EtekEtWl17MSw1fSk/L2c7XHJcbiAgY29uc3QgbWF0Y2hlcyA9IFtdO1xyXG4gIGxldCBtYXRjaDtcclxuXHJcbiAgd2hpbGUgKChtYXRjaCA9IHJlZ2V4LmV4ZWMoaW5wdXQpKSAhPT0gbnVsbCkge1xyXG4gICAgY29uc3QgW2Z1bGxJbnB1dCwgeCwgeSxuYW1lXSA9IG1hdGNoO1xyXG4gICAgbWF0Y2hlcy5wdXNoKHtcclxuICAgICAgeDogTnVtYmVyKHgpLFxyXG4gICAgICB5OiBOdW1iZXIoeSksXHJcbiAgICAgIC4uLihuYW1lID8geyBuYW1lIH0gOiB7fSkgXHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIG1hdGNoZXM7XHJcbn1cclxuZnVuY3Rpb24gc3BsaXRTaWRlcyhpbnB1dDogc3RyaW5nKTogeyB2YWx1ZTogbnVtYmVyLCBuYW1lPzogc3RyaW5nIH1bXSB7XHJcbiAgaW5wdXQ9aW5wdXQucmVwbGFjZSgvXFxzL2csXCJcIilcclxuICBjb25zdCByZWdleCA9IC8oW2EtekEtWl17MSw1fSk/PT8oXFxkKykvZztcclxuICBjb25zdCBtYXRjaGVzID0gW107XHJcbiAgbGV0IG1hdGNoO1xyXG5cclxuICB3aGlsZSAoKG1hdGNoID0gcmVnZXguZXhlYyhpbnB1dCkpICE9PSBudWxsKSB7XHJcbiAgICBjb25zdCBbZnVsbElucHV0LCBuYW1lLCB2YWx1ZV0gPSBtYXRjaDtcclxuICAgIG1hdGNoZXMucHVzaCh7XHJcbiAgICAgIHZhbHVlOiBOdW1iZXIodmFsdWUpLFxyXG4gICAgICAuLi4obmFtZSA/IHsgbmFtZSB9IDoge30pIFxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIHJldHVybiBtYXRjaGVzO1xyXG59XHJcbmZ1bmN0aW9uIHNwbGl0QW5nbGVzKGlucHV0OiBzdHJpbmcpOiB7IHZhbHVlOiBudW1iZXIsIG5hbWU/OiBzdHJpbmcgfVtdIHtcclxuICBpbnB1dD1pbnB1dC5yZXBsYWNlKC9cXHMvZyxcIlwiKVxyXG4gIGNvbnN0IHJlZ2V4ID0gLyhbYS16QS1aXXsxLDV9KT89PyhcXGQrKS9nO1xyXG4gIGNvbnN0IG1hdGNoZXMgPSBbXTtcclxuICBsZXQgbWF0Y2g7XHJcblxyXG4gIHdoaWxlICgobWF0Y2ggPSByZWdleC5leGVjKGlucHV0KSkgIT09IG51bGwpIHtcclxuICAgIGNvbnN0IFtmdWxsSW5wdXQsIG5hbWUsIHZhbHVlXSA9IG1hdGNoO1xyXG4gICAgbWF0Y2hlcy5wdXNoKHtcclxuICAgICAgdmFsdWU6IE51bWJlcih2YWx1ZSksXHJcbiAgICAgIC4uLihuYW1lID8geyBuYW1lIH0gOiB7fSkgXHJcbiAgICB9KTtcclxuICB9XHJcbiAgcmV0dXJuIG1hdGNoZXM7XHJcbn1cclxuXHJcbi8vIEN1c3RvbSBIaXN0b3J5IE1vZGFsIGNsYXNzIGZvciBzZXNzaW9uIGhpc3RvcnlcclxuY2xhc3MgSGlzdG9yeU1vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnU2Vzc2lvbiBIaXN0b3J5JyB9KTtcclxuXHJcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBoaXN0b3J5LCBkaXNwbGF5IGEgbWVzc2FnZVxyXG4gICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLnNlc3Npb25IaXN0b3J5Lmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICdObyBzZXNzaW9uIGhpc3RvcnkgZm91bmQuJyB9KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIERpc3BsYXkgZWFjaCBzZXNzaW9uIGluIHRoZSBoaXN0b3J5XHJcbiAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5zZXNzaW9uSGlzdG9yeS5mb3JFYWNoKChzZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgICBjb25zdCBzZXNzaW9uRGl2ID0gY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2hpc3Rvcnktc2Vzc2lvbicgfSk7XHJcbiAgICAgIHNlc3Npb25EaXYuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiBgU2Vzc2lvbiAke2luZGV4ICsgMX1gIH0pO1xyXG4gICAgICBzZXNzaW9uRGl2LmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgSW5wdXQ6ICR7c2Vzc2lvbi5pbnB1dH1gIH0pO1xyXG4gICAgICBzZXNzaW9uRGl2LmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUmVzdWx0OiAke3Nlc3Npb24ucmVzdWx0fWAgfSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDbG9zZSBidXR0b25cclxuICAgIGNvbnN0IGNsb3NlQnV0dG9uID0gY29udGVudEVsLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdDbG9zZScgfSk7XHJcbiAgICBjbG9zZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgdGhpcy5jbG9zZSgpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuZW1wdHkoKTsgLy8gQ2xlYW4gdXAgbW9kYWwgY29udGVudCBvbiBjbG9zZVxyXG4gIH1cclxufVxyXG5cclxuXHJcbmNsYXNzIEluZm9Nb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICBtYXRoSW5mbzogc3RyaW5nW107XHJcbiAgc29sdXRpb25JbmZvOiBzdHJpbmdbXTtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIG1hdGhJbmZvOiBzdHJpbmdbXSwgc29sdXRpb25JbmZvOiBzdHJpbmdbXSkge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMubWF0aEluZm8gPSBtYXRoSW5mbztcclxuICAgIHRoaXMuc29sdXRpb25JbmZvID0gc29sdXRpb25JbmZvO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoJ2luZm8tbW9kYWwtc3R5bGUnKTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdSZXN1bHQgRGV0YWlscycsIGNsczogJ2luZm8tbW9kYWwtdGl0bGUnIH0pO1xyXG5cclxuICAgIC8vIEFkZCBjb250ZW50IGFuZCBidXR0b24gZm9yIGNvcHlpbmcgZGV0YWlsc1xyXG4gICAgdGhpcy5wb3B1bGF0ZUNvbnRlbnQoY29udGVudEVsKTtcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBwb3B1bGF0ZUNvbnRlbnQoY29udGVudEVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgXHJcbiAgICBjb25zdCBjb2x1bW5Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnaW5mby1tb2RhbC1tYWluLWNvbnRhaW5lcicgfSk7XHJcbiAgICBcclxuICAgIHRoaXMubWF0aEluZm8uZm9yRWFjaCgobGluZSwgaW5kZXgpID0+IHtcclxuICAgICAgY29uc3QgbGluZUNvbnRhaW5lciA9IGNvbHVtbkNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLWxpbmUtY29udGFpbmVyJyB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGxlZnRMaW5lID0gbGluZUNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLWxlZnQtbGluZScgfSk7XHJcbiAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYCRcXHtcXFxcYmVnaW57YWxpZ25lZH0mJHtsaW5lfVxcXFxlbmR7YWxpZ25lZH1cXH0kYCwgbGVmdExpbmUsICcnLCBuZXcgQ29tcG9uZW50KCkpO1xyXG5cclxuICAgICAgY29uc3QgcmlnaHRMaW5lID0gbGluZUNvbnRhaW5lci5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLXJpZ2h0LWxpbmUnIH0pO1xyXG4gICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGAkXFx7XFxcXGJlZ2lue2FsaWduZWR9JiR7dGhpcy5zb2x1dGlvbkluZm9baW5kZXhdIHx8ICcnfVxcXFxlbmR7YWxpZ25lZH1cXH0kYCwgcmlnaHRMaW5lLCAnJywgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLUNvcHktYnV0dG9uLWNvbnRhaW5lcicgfSk7XHJcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0NvcHkgRGV0YWlscycsIGNsczogJ2luZm8tbW9kYWwtQ29weS1idXR0b24nIH0pO1xyXG5cclxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy5tYXRoSW5mby5qb2luKCdcXG4nKSk7XHJcbiAgICAgIG5ldyBOb3RpY2UoJ0RldGFpbHMgY29waWVkIHRvIGNsaXBib2FyZCEnKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgb25DbG9zZSgpIHtcclxuICAgIHRoaXMuY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG5jbGFzcyBEZWJ1Z01vZGFsIGV4dGVuZHMgTW9kYWwge1xyXG4gIGRlYnVnSW5mbzogc3RyaW5nO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgZGVidWdJbmZvOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICB0aGlzLmRlYnVnSW5mbyA9IGRlYnVnSW5mbztcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmFkZENsYXNzKCdjdXN0b20tbW9kYWwtc3R5bGUnKTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdEZWJ1ZyBJbmZvcm1hdGlvbicsIGNsczogJ2RlYnVnLU1vZGFsLXRpdGxlJyB9KTtcclxuXHJcbiAgICBjb25zdCBkZWJ1Z0NvbnRlbnQgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnZGVidWctaW5mby1jb250YWluZXInIH0pO1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFxgXFxgXFxganNcXG4ke3RoaXMuZGVidWdJbmZvfVxcblxcYFxcYFxcYGAsIGRlYnVnQ29udGVudCwgJycsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCkge1xyXG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuY2xhc3MgTWF0aFBsdWdpblNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcclxuICBwbHVnaW46IE1hdGhQbHVnaW47XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBwbHVnaW46IE1hdGhQbHVnaW4pIHtcclxuICAgIHN1cGVyKGFwcCwgcGx1Z2luKTtcclxuICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xyXG4gIH1cclxuXHJcbiAgZGlzcGxheSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XHJcbiAgICBjb25zdCB0b1NldE9wdGlvbnM9W1xyXG4gICAgICB7dmFsdWU6IDEwMDAsZGlzcGxheTogJ2Zvcm1hdHRlZCAuMDAwJyB9LFxyXG4gICAgICB7dmFsdWU6IDEwMDAwLGRpc3BsYXk6ICdmb3JtYXR0ZWQgLjAwMDAnIH0sXHJcbiAgICAgIHt2YWx1ZTogMTAwMDAwLGRpc3BsYXk6ICdmb3JtYXR0ZWQgLjAwMDAwJyB9LFxyXG4gICAgXVxyXG5cclxuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdNYXRoIFBsdWdpbiBTZXR0aW5ncycgfSk7XHJcbiAgICB0aGlzLmFkZE11bHRpQ2hvaWNlU2V0dGluZyhjb250YWluZXJFbCwgJ1JlbmRlcmVkIG51bWJlciBmb3JtYXQnLCAnQ2hvb3NlIGhvdyB0byBmb3JtYXQgbnVtYmVycyBpbiB0aGUgcmVzdWx0JywgdG9TZXRPcHRpb25zLCdudW1iZXJGb3JtYXR0aW5nJyk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdNYXRoIFBsdWdpbiBzdHlsZScgfSk7XHJcblxyXG4gICAgLy8gQWRkIHZhcmlvdXMgc2V0dGluZ3NcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnQmFja2dyb3VuZCBDb2xvcicsICdTZXQgdGhlIGJhY2tncm91bmQgY29sb3IuJywgJ2JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnRXZlbiBSb3cgQmFja2dyb3VuZCBDb2xvcicsICdTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIGV2ZW4gcm93cy4nLCAnZXZlblJvd0JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnT2RkIFJvdyBCYWNrZ3JvdW5kIENvbG9yJywgJ1NldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3Igb2RkIHJvd3MuJywgJ29kZFJvd0JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsLCAnaW5mb01vZGFsIEJhY2tncm91bmQgQ29sb3InLCAnU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGZvciB0aGUgaW5mbyBtb2RhbC4nLCAnaW5mb01vZGFsQmFja2dyb3VuZCcpO1xyXG4gICAgdGhpcy5hZGRGb250U2V0dGluZyhjb250YWluZXJFbCwgJ0ZvbnQgU2l6ZScsICdTZXQgdGhlIGZvbnQgc2l6ZSBmb3IgdGhlIHJvd3MuJywgJ2ZvbnRTaXplJyk7XHJcbiAgICB0aGlzLmFkZEZvbnRTZXR0aW5nKGNvbnRhaW5lckVsLCAnUm93IFBhZGRpbmcnLCAnU2V0IHRoZSBwYWRkaW5nIGZvciB0aGUgcm93cy4nLCAncm93UGFkZGluZycpO1xyXG4gICAgdGhpcy5hZGRGb250U2V0dGluZyhjb250YWluZXJFbCwgJ0ljb24gU2l6ZScsICdTZXQgdGhlIHNpemUgb2YgdGhlIGljb25zLicsICdpY29uU2l6ZScpO1xyXG5cclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxyXG4gICAgICAgIGJ1dHRvblxyXG4gICAgICAgICAgLnNldEJ1dHRvblRleHQoJ1dpcGUgSGlzdG9yeSBNb2R1bGUnKVxyXG4gICAgICAgICAgLy8uc2V0VG9vbHRpcCgnUmVzZXQgYWxsIHNldHRpbmdzIHRvIHRoZWlyIGRlZmF1bHQgdmFsdWVzJylcclxuICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Muc2Vzc2lvbkhpc3RvcnkgPSBbXTtcclxuICAgICAgICAgICBuZXcgTm90aWNlKCdIaXN0b3J5IHdhcyB3aXBlZC4nKVxyXG4gICAgICAgICAgfSkpO1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PlxyXG4gICAgICBidXR0b25cclxuICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUmVzZXQgdG8gRGVmYXVsdCcpXHJcbiAgICAgICAgLnNldFRvb2x0aXAoJ1Jlc2V0IGFsbCBzZXR0aW5ncyB0byB0aGVpciBkZWZhdWx0IHZhbHVlcycpXHJcbiAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgYXdhaXQgdGhpcy5yZXNldFRvRGVmYXVsdCgpO1xyXG4gICAgICAgIH0pKTtcclxuICB9XHJcbiAgcHJpdmF0ZSBhZGRNdWx0aUNob2ljZVNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIGNob2ljZXM6IGFueSxzZXR0aW5nS2V5OiBrZXlvZiBNYXRoUGx1Z2luU2V0dGluZ3MpIHtcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRGb250U2V0dGluZyAoc3RyaW5nIGV4cGVjdGVkKS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZERyb3Bkb3duKGRyb3Bkb3duID0+IHtcclxuICAgICAgICBjaG9pY2VzLmZvckVhY2goKGNob2ljZTogYW55KSA9PiB7XHJcbiAgICAgICAgICBkcm9wZG93bi5hZGRPcHRpb24oY2hvaWNlLnZhbHVlLGNob2ljZS5kaXNwbGF5KTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBkcm9wZG93bi5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkQ29sb3JTZXR0aW5nKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgbmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBzZXR0aW5nS2V5OiBrZXlvZiBNYXRoUGx1Z2luU2V0dGluZ3MpIHtcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRTZXR0aW5nIChzdHJpbmcgZXhwZWN0ZWQpLlwiKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKG5hbWUpXHJcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxyXG4gICAgICAuYWRkQ29sb3JQaWNrZXIoY29sb3JQaWNrZXIgPT4ge1xyXG4gICAgICAgIGNvbnN0IHNldHRpbmdWYWx1ZSA9IHRoaXMucGx1Z2luLnNldHRpbmdzW3NldHRpbmdLZXldO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICh0eXBlb2Ygc2V0dGluZ1ZhbHVlID09PSAnc3RyaW5nJykgeyBcclxuICAgICAgICAgIGNvbG9yUGlja2VyLnNldFZhbHVlKHNldHRpbmdWYWx1ZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbG9yUGlja2VyLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0aGlzLnBsdWdpbi5zZXR0aW5nc1tzZXR0aW5nS2V5XSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgQ2Fubm90IGFzc2lnbiBhIHN0cmluZyB2YWx1ZSB0byAke3NldHRpbmdLZXl9IChub24tc3RyaW5nIHNldHRpbmcpLmApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuICB9XHJcbiAgXHJcbiAgcHJpdmF0ZSBhZGRGb250U2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleToga2V5b2YgTWF0aFBsdWdpblNldHRpbmdzKSB7XHJcbiAgICAvLyBFbnN1cmUgdGhhdCAnc2Vzc2lvbkhpc3RvcnknIGlzIG5vdCBiZWluZyBwcm9jZXNzZWQgYnkgYWRkRm9udFNldHRpbmdcclxuICAgIGlmIChzZXR0aW5nS2V5ID09PSAnc2Vzc2lvbkhpc3RvcnknKSB7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJzZXNzaW9uSGlzdG9yeSBjYW5ub3QgYmUgbW9kaWZpZWQgd2l0aCBhZGRGb250U2V0dGluZyAoc3RyaW5nIGV4cGVjdGVkKS5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICBcclxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxyXG4gICAgICAuc2V0TmFtZShuYW1lKVxyXG4gICAgICAuc2V0RGVzYyhkZXNjcmlwdGlvbilcclxuICAgICAgLmFkZFRleHQodGV4dCA9PiB7XHJcbiAgICAgICAgY29uc3Qgc2V0dGluZ1ZhbHVlID0gdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIHNldHRpbmcgaXMgYSBzdHJpbmdcclxuICAgICAgICBpZiAodHlwZW9mIHNldHRpbmdWYWx1ZSA9PT0gJ3N0cmluZycpIHsgXHJcbiAgICAgICAgICB0ZXh0LnNldFBsYWNlaG9sZGVyKHNldHRpbmdWYWx1ZSkuc2V0VmFsdWUoc2V0dGluZ1ZhbHVlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGV4dC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgIC8vIEVuc3VyZSB3ZSBhcmUgb25seSBhc3NpZ25pbmcgdG8gc3RyaW5nIHNldHRpbmdzXHJcbiAgICAgICAgICBpZiAodHlwZW9mIHRoaXMucGx1Z2luLnNldHRpbmdzW3NldHRpbmdLZXldID09PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5nc1tzZXR0aW5nS2V5XSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4udXBkYXRlU3R5bGVzKCk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBDYW5ub3QgYXNzaWduIGEgc3RyaW5nIHZhbHVlIHRvICR7c2V0dGluZ0tleX0gKG5vbi1zdHJpbmcgc2V0dGluZykuYCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuICBcclxuICAvLyBSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0IHZhbHVlc1xyXG4gIHByaXZhdGUgYXN5bmMgcmVzZXRUb0RlZmF1bHQoKSB7XHJcbiAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xyXG4gICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB0aGlzLnBsdWdpbi51cGRhdGVTdHlsZXMoKTtcclxuICAgIG5ldyBOb3RpY2UoJ1NldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byBkZWZhdWx0LicpO1xyXG4gICAgdGhpcy5kaXNwbGF5KCk7IC8vIFJlZnJlc2ggdGhlIHNldHRpbmdzIGRpc3BsYXlcclxuICB9XHJcbn1cclxuZnVuY3Rpb24gZ2V0U2hhcGVzQ2hhcmFjdGVyaXN0aWNzKCl7XHJcbiAgcmV0dXJuIFtcclxuICAgIHtcclxuICAgICAgbmFtZTogJ2xpbmUnLCBcclxuICAgICAgY29vcmRpbmF0ZXM6IDIsXHJcbiAgICAgIHNpZGVzOiAxLFxyXG4gICAgICBhbmdsZXM6MCxcclxuICAgICAgY29tYmluYXRpb25zOiBbXHJcbiAgICAgICAgeyBjb29yZGluYXRlczogMn0sXHJcbiAgICAgICAgeyBzaWRlczogMSxhbmdsZXM6IDAsY29vcmRpbmF0ZXM6IDB9LFxyXG4gICAgICBdXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAndHJpYW5nbGUnLCBcclxuICAgICAgY29vcmRpbmF0ZXM6IDMsIFxyXG4gICAgICBzaWRlczogMSxcclxuICAgICAgYW5nbGVzOjAsXHJcbiAgICAgIGNvbWJpbmF0aW9uczogW1xyXG4gICAgICAgIHsgY29vcmRpbmF0ZXM6IDN9LFxyXG4gICAgICAgIHsgc2lkZXM6IDMsIGFuZ2xlczogMCB9LCAvLyAzIHNpZGVzLCBhdCBsZWFzdCAxIGFuZ2xlXHJcbiAgICAgICAgeyBzaWRlczogMiwgYW5nbGVzOiAxIH0sIC8vIDIgc2lkZXMgYW5kIDEgYW5nbGUgKFNBUylcclxuICAgICAgICB7IGFuZ2xlczogMiwgc2lkZXM6IDEgfSAgLy8gMiBhbmdsZXMgYW5kIDEgc2lkZSAoQVNBKVxyXG4gICAgICBdXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBuYW1lOiAnc3F1YXJlJyxcclxuICAgICAgY29vcmRpbmF0ZXM6IDQsXHJcbiAgICAgIHNpZGVzOiAxLFxyXG4gICAgICBhbmdsZXM6MCxcclxuICAgICAgY29tYmluYXRpb25zOiBbXHJcbiAgICAgICAgeyBjb29yZGluYXRlczogM30sIFxyXG4gICAgICAgIHsgc2lkZXM6IDJ9LFxyXG4gICAgICAgIHsgYW5nbGVzOiAwfSwgIFxyXG4gICAgICBdXHJcbiAgICB9XHJcbiAgXTtcclxufVxyXG5cclxuY2xhc3MgYmlub21JbmZvTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcblxyXG4gIHByaXZhdGUgZXF1YWw6IG51bWJlciA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgbGVzc0VxdWFsOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgYmlnOiBudW1iZXIgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWw6IG51bWJlciA9IDA7XHJcbiAgXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogYW55KSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy5uID0gTnVtYmVyKHNvdXJjZVsxXSk7IFxyXG4gICAgdGhpcy5rID0gTnVtYmVyKHNvdXJjZVsyXSk7IFxyXG4gICAgdGhpcy5wID0gTnVtYmVyKHNvdXJjZVszXSk7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICB0aGlzLmFzc2lnblByb2JhYmlsaXR5KCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzJyB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcclxuICB9XHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlcns7cmV0dXJuIHRoaXMuZmFjdG9yaWFsKHRoaXMubix0aGlzLmssdGhpcy5wKX1cclxuXHJcbiAgcHJpdmF0ZSBmYWN0b3JpYWwobjogbnVtYmVyLCBrOiBudW1iZXIsIHA6IG51bWJlcikge1xyXG4gICAgbGV0IHN1bSA9IDEsIHN1bUsgPSAxLCBzdW1OSyA9IDE7XHJcbiAgICBcclxuICAgIC8vIENhbGN1bGF0ZSBmYWN0b3JpYWxzXHJcbiAgICBmb3IgKGxldCBpID0gMTsgaSA8PSBuOyBpKyspIHtcclxuICAgICAgc3VtICo9IGk7XHJcbiAgICAgIGlmIChpID09PSBrKSBzdW1LID0gc3VtO1xyXG4gICAgICBpZiAoaSA9PT0gKG4gLSBrKSkgc3VtTksgPSBzdW07XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3VtIC8gKHN1bUsgKiBzdW1OSykgKiBNYXRoLnBvdyhwLCBrKSAqIE1hdGgucG93KDEgLSBwLCBuIC0gayk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzc2lnblByb2JhYmlsaXR5KCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykge3RoaXMuZXF1YWwgPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA8IHRoaXMuaykge3RoaXMubGVzcyArPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHt0aGlzLmxlc3NFcXVhbCArPSB0aGlzLmZhY3RvcmlhbCh0aGlzLm4sIGksIHRoaXMucCk7fVxyXG4gICAgICBpZiAoaSA+IHRoaXMuaykge3RoaXMuYmlnICs9IHRoaXMuZmFjdG9yaWFsKHRoaXMubiwgaSwgdGhpcy5wKTt9XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykge3RoaXMuYmlnRXF1YWwgKz0gdGhpcy5mYWN0b3JpYWwodGhpcy5uLCBpLCB0aGlzLnApO31cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuIl19