import { __awaiter } from "tslib";
import { Plugin, MarkdownRenderer, PluginSettingTab, Setting, Modal, Notice, Component } from 'obsidian';
import { controller } from './mathEngine.js';
// Default settings
const DEFAULT_SETTINGS = {
    background: `#44475A`,
    evenRowBackground: '#f9f9f9',
    oddRowBackground: '#747688',
    infoModalBackground: '#002B36',
    fontSize: '0.85em',
    rowPadding: '5px 10px',
    iconSize: '14px',
};
// Main plugin class
export default class MathPlugin extends Plugin {
    onload() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSettings();
            this.addSettingTab(new MathPluginSettingTab(this.app, this));
            this.registerMarkdownCodeBlockProcessor('math-engine', this.processMathBlock.bind(this));
            this.updateStyles();
        });
    }
    onunload() {
        // Clean up resources if needed
    }
    // Markdown code block processor
    processMathBlock(source, el) {
        el.classList.add('math-container');
        let expressions = source.split('\n').filter(line => line.trim() !== '');
        if (expressions.length === 0) {
            expressions = ['0'];
        }
        // Process each expression and create line containers
        expressions.forEach((expression, index) => {
            const lineContainer = el.createEl('div', { cls: 'math-line-container' });
            // Alternate row styling
            lineContainer.addClass(index % 2 === 0 ? 'math-row-even' : 'math-row-odd');
            // Create input and result containers
            const inputDiv = lineContainer.createEl('div', { cls: 'math-input' });
            const resultDiv = lineContainer.createEl('div', { cls: 'math-result' });
            let result; // Declare result here, outside the try block
            try {
                // Mock result, replace this with actual logic
                result = controller(expression);
                if (typeof result === 'object') {
                    MarkdownRenderer.renderMarkdown(`$\{${result.processedinput}\}$`, inputDiv, '', this);
                    MarkdownRenderer.renderMarkdown(/(true|false)/.test(result.solution) ? result.solution : `$\{${result.solution}\}$`, resultDiv, '', this);
                    console.log('', result.solutionInfo);
                    const iconsDiv = this.createIconsContainer();
                    this.addIconListeners(iconsDiv, result);
                    lineContainer.append(inputDiv, resultDiv, iconsDiv);
                }
            }
            catch (err) {
                MarkdownRenderer.renderMarkdown(expression, inputDiv, '', this);
                resultDiv.innerHTML = `<span class="error-text">${err.message}</span>`;
                lineContainer.addClass('math-error-line');
            }
            // Append the line container to the main element
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
    // Add event listeners to icons
    addIconListeners(iconsDiv, result) {
        var _a, _b;
        (_a = iconsDiv.querySelector('.math-info-icon')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
            new InfoModal(this.app, result.mathinfo, result.solutionInfo).open();
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
// Settings tab class
class MathPluginSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Math Plugin Settings' });
        // Add various settings
        this.addSetting(containerEl, 'Background Color', 'Set the background color.', 'background');
        this.addSetting(containerEl, 'Even Row Background Color', 'Set the background color for even rows.', 'evenRowBackground');
        this.addSetting(containerEl, 'Odd Row Background Color', 'Set the background color for odd rows.', 'oddRowBackground');
        this.addSetting(containerEl, 'info model Background Color', 'Set the background color for the info model.', 'infoModalBackground');
        this.addFontSetting(containerEl, 'Font Size', 'Set the font size for the rows.', 'fontSize');
        this.addFontSetting(containerEl, 'Row Padding', 'Set the padding for the rows.', 'rowPadding');
        this.addFontSetting(containerEl, 'Icon Size', 'Set the size of the icons.', 'iconSize');
        // Add a "Reset to Default" button
        new Setting(containerEl)
            .addButton(button => button
            .setButtonText('Reset to Default')
            .setTooltip('Reset all settings to their default values')
            .onClick(() => __awaiter(this, void 0, void 0, function* () {
            yield this.resetToDefault();
        })));
    }
    addSetting(containerEl, name, description, settingKey) {
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addColorPicker(colorPicker => colorPicker.setValue(this.plugin.settings[settingKey])
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings[settingKey] = value;
            yield this.plugin.saveSettings();
            this.plugin.updateStyles();
        })));
    }
    addFontSetting(containerEl, name, description, settingKey) {
        new Setting(containerEl)
            .setName(name)
            .setDesc(description)
            .addText(text => text.setPlaceholder(this.plugin.settings[settingKey])
            .setValue(this.plugin.settings[settingKey])
            .onChange((value) => __awaiter(this, void 0, void 0, function* () {
            this.plugin.settings[settingKey] = value;
            yield this.plugin.saveSettings();
            this.plugin.updateStyles();
        })));
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
// Custom modal classes for Info and Debug modals
class InfoModal extends Modal {
    constructor(app, result, solutionInfo) {
        super(app);
        this.result = result;
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
        const resultLines = this.result.split('\n');
        const solutionLines = this.solutionInfo.split('\n');
        resultLines.forEach((line, index) => {
            const lineContainer = columnContainer.createEl('div', { cls: 'info-modal-line-container' });
            const leftLine = lineContainer.createEl('div', { cls: 'info-modal-left-line' });
            MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${line}\\end{aligned}\}$`, leftLine, '', new Component());
            const rightLine = lineContainer.createEl('div', { cls: 'info-modal-right-line' });
            MarkdownRenderer.renderMarkdown(`$\{\\begin{aligned}&${solutionLines[index] || ''}\\end{aligned}\}$`, rightLine, '', new Component());
        });
        const buttonContainer = contentEl.createEl('div', { cls: 'info-modal-Copy-button-container' });
        const actionButton = buttonContainer.createEl('button', { text: 'Copy Details', cls: 'info-modal-Copy-button' });
        actionButton.addEventListener('click', () => {
            navigator.clipboard.writeText(this.result);
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
function getMathJsSymbols() {
    const mathjsBuiltInSymbols = [
        "f|abs()",
        "f|acos()",
        "f|acosh()",
        "f|acot()",
        "f|acoth()",
        "f|acsc()",
        "f|acsch()",
        "f|add()",
        "f|and()",
        "f|apply()",
        "f|arg()",
        "f|asec()",
        "f|asech()",
        "f|asin()",
        "f|asinh()",
        "f|atan()",
        "f|atan2()",
        "f|atanh()",
        "p|atm",
        "p|atomicMass",
        "p|avogadro",
        "f|bellNumbers()",
        "f|bin()",
        "f|bitAnd()",
        "f|bitNot()",
        "f|bitOr()",
        "f|bitXor()",
        "p|bohrMagneton",
        "p|bohrRadius",
        "p|boltzmann",
        "f|catalan()",
        "f|cbrt()",
        "f|ceil()",
        "p|classicalElectronRadius",
        "f|clone()",
        "f|column()",
        "f|combinations()",
        "f|combinationsWithRep()",
        "f|compare()",
        "f|compareNatural()",
        "f|compareText()",
        "f|compile()",
        "f|composition()",
        "f|concat()",
        "p|conductanceQuantum",
        "f|conj()",
        "f|cos()",
        "f|cosh()",
        "f|cot()",
        "f|coth()",
        "p|coulomb",
        "f|count()",
        "f|cross()",
        "f|csc()",
        "f|csch()",
        "f|ctranspose()",
        "f|cube()",
        "f|cumsum()",
        "f|deepEqual()",
        "f|derivative()",
        "f|det()",
        "p|deuteronMass",
        "f|diag()",
        "f|diff()",
        "f|distance()",
        "f|divide()",
        "f|dot()",
        "f|dotDivide()",
        "f|dotMultiply()",
        "f|dotPow()",
        "c|e",
        "p|efimovFactor",
        "f|eigs()",
        "p|electricConstant",
        "p|electronMass",
        "p|elementaryCharge",
        "f|equal()",
        "f|equalText()",
        "f|erf()",
        "f|evaluate()",
        "f|exp()",
        "f|expm()",
        "f|expm1()",
        "f|factorial()",
        "p|faraday",
        "p|fermiCoupling",
        "f|fft()",
        "f|filter()",
        "p|fineStructure",
        "p|firstRadiation",
        "f|fix()",
        "f|flatten()",
        "f|floor()",
        "f|forEach()",
        "f|format()",
        "f|gamma()",
        "p|gasConstant",
        "f|gcd()",
        "f|getMatrixDataType()",
        "p|gravitationConstant",
        "p|gravity",
        "p|hartreeEnergy",
        "f|hasNumericValue()",
        "f|help()",
        "f|hex()",
        "f|hypot()",
        "c|i",
        "f|identity()",
        "f|ifft()",
        "f|im()",
        "c|Infinity",
        "f|intersect()",
        "f|inv()",
        "p|inverseConductanceQuantum",
        "f|invmod()",
        "f|isInteger()",
        "f|isNaN()",
        "f|isNegative()",
        "f|isNumeric()",
        "f|isPositive()",
        "f|isPrime()",
        "f|isZero()",
        "f|kldivergence()",
        "p|klitzing",
        "f|kron()",
        "f|larger()",
        "f|largerEq()",
        "f|lcm()",
        "f|leafCount()",
        "f|leftShift()",
        "f|lgamma()",
        "c|LN10",
        "c|LN2",
        "f|log()",
        "f|log10()",
        "c|LOG10E",
        "f|log1p()",
        "f|log2()",
        "c|LOG2E",
        "p|loschmidt",
        "f|lsolve()",
        "f|lsolveAll()",
        "f|lup()",
        "f|lusolve()",
        "f|lyap()",
        "f|mad()",
        "p|magneticConstant",
        "p|magneticFluxQuantum",
        "f|map()",
        "f|matrixFromColumns()",
        "f|matrixFromFunction()",
        "f|matrixFromRows()",
        "f|max()",
        "f|mean()",
        "f|median()",
        "f|min()",
        "f|mod()",
        "f|mode()",
        "p|molarMass",
        "p|molarMassC12",
        "p|molarPlanckConstant",
        "p|molarVolume",
        "f|multinomial()",
        "f|multiply()",
        "c|NaN",
        "p|neutronMass",
        "f|norm()",
        "f|not()",
        "f|nthRoot()",
        "f|nthRoots()",
        "p|nuclearMagneton",
        "c|null",
        "f|numeric()",
        "f|oct()",
        "f|ones()",
        "f|or()",
        "f|parser()",
        "f|partitionSelect()",
        "f|permutations()",
        "c|phi",
        "c|pi",
        "f|pickRandom()",
        "f|pinv()",
        "p|planckCharge",
        "p|planckConstant",
        "p|planckLength",
        "p|planckMass",
        "p|planckTemperature",
        "p|planckTime",
        "f|polynomialRoot()",
        "f|pow()",
        "f|print()",
        "f|prod()",
        "p|protonMass",
        "f|qr()",
        "f|quantileSeq()",
        "p|quantumOfCirculation",
        "f|random()",
        "f|randomInt()",
        "f|range()",
        "f|rationalize()",
        "f|re()",
        "p|reducedPlanckConstant",
        "f|reshape()",
        "f|resize()",
        "f|resolve()",
        "f|rightArithShift()",
        "f|rightLogShift()",
        "f|rotate()",
        "f|rotationMatrix()",
        "f|round()",
        "f|row()",
        "p|rydberg",
        "p|sackurTetrode",
        "f|schur()",
        "f|sec()",
        "f|sech()",
        "p|secondRadiation",
        "f|setCartesian()",
        "f|setDifference()",
        "f|setDistinct()",
        "f|setIntersect()",
        "f|setIsSubset()",
        "f|setMultiplicity()",
        "f|setPowerset()",
        "f|setSize()",
        "f|setSymDifference()",
        "f|setUnion()",
        "f|sign()",
        "f|simplify()",
        "f|simplifyConstant()",
        "f|simplifyCore()",
        "f|sin()",
        "f|sinh()",
        "f|size()",
        "f|slu()",
        "f|smaller()",
        "f|smallerEq()",
        "f|sort()",
        "p|speedOfLight",
        "f|sqrt()",
        "c|SQRT1_2",
        "c|SQRT2",
        "f|sqrtm()",
        "f|square()",
        "f|squeeze()",
        "f|std()",
        "p|stefanBoltzmann",
        "f|stirlingS2()",
        "f|subset()",
        "f|subtract()",
        "f|sum()",
        "f|sylvester()",
        "f|symbolicEqual()",
        "f|tan()",
        "f|tanh()",
        "c|tau",
        "p|thomsonCrossSection",
        "f|to()",
        "f|trace()",
        "f|transpose()",
        "f|typeOf()",
        "f|unaryMinus()",
        "f|unaryPlus()",
        "f|unequal()",
        "f|usolve()",
        "f|usolveAll()",
        "p|vacuumImpedance",
        "f|variance()",
        "p|weakMixingAngle",
        "p|wienDisplacement",
        "f|xgcd()",
        "f|xor()",
        "f|zeros()"
    ];
    return mathjsBuiltInSymbols;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL21haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsZ0JBQWdCLEVBQU8sT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQzlHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQWE3QyxtQkFBbUI7QUFDbkIsTUFBTSxnQkFBZ0IsR0FBdUI7SUFDM0MsVUFBVSxFQUFFLFNBQVM7SUFDckIsaUJBQWlCLEVBQUUsU0FBUztJQUM1QixnQkFBZ0IsRUFBRSxTQUFTO0lBQzNCLG1CQUFtQixFQUFFLFNBQVM7SUFDOUIsUUFBUSxFQUFFLFFBQVE7SUFDbEIsVUFBVSxFQUFFLFVBQVU7SUFDdEIsUUFBUSxFQUFFLE1BQU07Q0FDakIsQ0FBQztBQUVGLG9CQUFvQjtBQUNwQixNQUFNLENBQUMsT0FBTyxPQUFPLFVBQVcsU0FBUSxNQUFNO0lBR3RDLE1BQU07O1lBQ1YsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUM3RCxJQUFJLENBQUMsa0NBQWtDLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN6RixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDdEIsQ0FBQztLQUFBO0lBRUQsUUFBUTtRQUNOLCtCQUErQjtJQUNqQyxDQUFDO0lBRUQsZ0NBQWdDO0lBQ3hCLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxFQUFlO1FBQ3RELEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFbkMs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ZW50IjpbImltcG9ydCB7IFBsdWdpbiwgTWFya2Rvd25SZW5kZXJlciwgUGx1Z2luU2V0dGluZ1RhYiwgQXBwLCBTZXR0aW5nLCBNb2RhbCwgTm90aWNlLCBDb21wb25lbnQgfSBmcm9tICdvYnNpZGlhbic7XHJcbmltcG9ydCB7IGNvbnRyb2xsZXIgfSBmcm9tICcuL21hdGhFbmdpbmUuanMnO1xyXG5cclxuLy8gRGVmaW5lIHRoZSBpbnRlcmZhY2UgZm9yIHBsdWdpbiBzZXR0aW5nc1xyXG5pbnRlcmZhY2UgTWF0aFBsdWdpblNldHRpbmdzIHtcclxuICBiYWNrZ3JvdW5kOiBzdHJpbmc7XHJcbiAgZXZlblJvd0JhY2tncm91bmQ6IHN0cmluZztcclxuICBvZGRSb3dCYWNrZ3JvdW5kOiBzdHJpbmc7XHJcbiAgaW5mb01vZGFsQmFja2dyb3VuZDogc3RyaW5nO1xyXG4gIGZvbnRTaXplOiBzdHJpbmc7XHJcbiAgcm93UGFkZGluZzogc3RyaW5nO1xyXG4gIGljb25TaXplOiBzdHJpbmc7XHJcbn1cclxuXHJcbi8vIERlZmF1bHQgc2V0dGluZ3NcclxuY29uc3QgREVGQVVMVF9TRVRUSU5HUzogTWF0aFBsdWdpblNldHRpbmdzID0ge1xyXG4gIGJhY2tncm91bmQ6IGAjNDQ0NzVBYCxcclxuICBldmVuUm93QmFja2dyb3VuZDogJyNmOWY5ZjknLFxyXG4gIG9kZFJvd0JhY2tncm91bmQ6ICcjNzQ3Njg4JyxcclxuICBpbmZvTW9kYWxCYWNrZ3JvdW5kOiAnIzAwMkIzNicsXHJcbiAgZm9udFNpemU6ICcwLjg1ZW0nLFxyXG4gIHJvd1BhZGRpbmc6ICc1cHggMTBweCcsXHJcbiAgaWNvblNpemU6ICcxNHB4JyxcclxufTtcclxuXHJcbi8vIE1haW4gcGx1Z2luIGNsYXNzXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1hdGhQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xyXG4gIHNldHRpbmdzOiBNYXRoUGx1Z2luU2V0dGluZ3M7XHJcblxyXG4gIGFzeW5jIG9ubG9hZCgpIHtcclxuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XHJcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IE1hdGhQbHVnaW5TZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoJ21hdGgtZW5naW5lJywgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy51cGRhdGVTdHlsZXMoKTtcclxuICB9XHJcblxyXG4gIG9udW5sb2FkKCkge1xyXG4gICAgLy8gQ2xlYW4gdXAgcmVzb3VyY2VzIGlmIG5lZWRlZFxyXG4gIH1cclxuXHJcbiAgLy8gTWFya2Rvd24gY29kZSBibG9jayBwcm9jZXNzb3JcclxuICBwcml2YXRlIHByb2Nlc3NNYXRoQmxvY2soc291cmNlOiBzdHJpbmcsIGVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgZWwuY2xhc3NMaXN0LmFkZCgnbWF0aC1jb250YWluZXInKTtcclxuICBcclxuICAgIGxldCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS50cmltKCkgIT09ICcnKTtcclxuICAgIGlmIChleHByZXNzaW9ucy5sZW5ndGggPT09IDApIHtcclxuICAgICAgZXhwcmVzc2lvbnMgPSBbJzAnXTtcclxuICAgIH1cclxuICBcclxuICAgIC8vIFByb2Nlc3MgZWFjaCBleHByZXNzaW9uIGFuZCBjcmVhdGUgbGluZSBjb250YWluZXJzXHJcbiAgICBleHByZXNzaW9ucy5mb3JFYWNoKChleHByZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgICBjb25zdCBsaW5lQ29udGFpbmVyID0gZWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1saW5lLWNvbnRhaW5lcicgfSk7XHJcbiAgXHJcbiAgICAgIC8vIEFsdGVybmF0ZSByb3cgc3R5bGluZ1xyXG4gICAgICBsaW5lQ29udGFpbmVyLmFkZENsYXNzKGluZGV4ICUgMiA9PT0gMCA/ICdtYXRoLXJvdy1ldmVuJyA6ICdtYXRoLXJvdy1vZGQnKTtcclxuICBcclxuICAgICAgLy8gQ3JlYXRlIGlucHV0IGFuZCByZXN1bHQgY29udGFpbmVyc1xyXG4gICAgICBjb25zdCBpbnB1dERpdiA9IGxpbmVDb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1pbnB1dCcgfSk7XHJcbiAgICAgIGNvbnN0IHJlc3VsdERpdiA9IGxpbmVDb250YWluZXIuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbWF0aC1yZXN1bHQnIH0pO1xyXG4gIFxyXG4gICAgICBsZXQgcmVzdWx0OyAgLy8gRGVjbGFyZSByZXN1bHQgaGVyZSwgb3V0c2lkZSB0aGUgdHJ5IGJsb2NrXHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgLy8gTW9jayByZXN1bHQsIHJlcGxhY2UgdGhpcyB3aXRoIGFjdHVhbCBsb2dpY1xyXG4gICAgICAgIHJlc3VsdCA9IGNvbnRyb2xsZXIoZXhwcmVzc2lvbik7XHJcbiAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGAkXFx7JHtyZXN1bHQucHJvY2Vzc2VkaW5wdXR9XFx9JGAsIGlucHV0RGl2LCAnJywgdGhpcyk7XHJcbiAgICAgICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKC8odHJ1ZXxmYWxzZSkvLnRlc3QocmVzdWx0LnNvbHV0aW9uKSA/IHJlc3VsdC5zb2x1dGlvbiA6IGAkXFx7JHtyZXN1bHQuc29sdXRpb259XFx9JGAsIHJlc3VsdERpdiwgJycsIHRoaXMpO1xyXG4gICAgICAgICAgY29uc29sZS5sb2coJycscmVzdWx0LnNvbHV0aW9uSW5mbylcclxuICAgICAgICAgIGNvbnN0IGljb25zRGl2ID0gdGhpcy5jcmVhdGVJY29uc0NvbnRhaW5lcigpO1xyXG4gICAgICAgICAgdGhpcy5hZGRJY29uTGlzdGVuZXJzKGljb25zRGl2LCByZXN1bHQpOyAgXHJcbiAgICAgICAgICBsaW5lQ29udGFpbmVyLmFwcGVuZChpbnB1dERpdiwgcmVzdWx0RGl2LCBpY29uc0Rpdik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGV4cHJlc3Npb24sIGlucHV0RGl2LCAnJywgdGhpcyk7XHJcbiAgICAgICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj4ke2Vyci5tZXNzYWdlfTwvc3Bhbj5gO1xyXG4gICAgICAgIGxpbmVDb250YWluZXIuYWRkQ2xhc3MoJ21hdGgtZXJyb3ItbGluZScpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBBcHBlbmQgdGhlIGxpbmUgY29udGFpbmVyIHRvIHRoZSBtYWluIGVsZW1lbnRcclxuICAgICAgZWwuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgXHJcbiAgXHJcbiAgLy8gQ3JlYXRlIGljb25zIGNvbnRhaW5lclxyXG4gIHByaXZhdGUgY3JlYXRlSWNvbnNDb250YWluZXIoKTogSFRNTEVsZW1lbnQge1xyXG4gICAgY29uc3QgaWNvbnNEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcclxuICAgIGljb25zRGl2LmNsYXNzTGlzdC5hZGQoJ21hdGgtaWNvbnMnKTtcclxuICAgIGljb25zRGl2LmlubmVySFRNTCA9IGBcclxuICAgICAgPHNwYW4gY2xhc3M9XCJtYXRoLWluZm8taWNvblwiPvCfm4g8L3NwYW4+XHJcbiAgICAgIDxzcGFuIGNsYXNzPVwibWF0aC1kZWJ1Zy1pY29uXCI+8J+Qnjwvc3Bhbj5gO1xyXG4gICAgcmV0dXJuIGljb25zRGl2O1xyXG4gIH1cclxuXHJcbiAgLy8gQWRkIGV2ZW50IGxpc3RlbmVycyB0byBpY29uc1xyXG4gIHByaXZhdGUgYWRkSWNvbkxpc3RlbmVycyhpY29uc0RpdjogSFRNTEVsZW1lbnQsIHJlc3VsdDogYW55KTogdm9pZCB7XHJcbiAgICBpY29uc0Rpdi5xdWVyeVNlbGVjdG9yKCcubWF0aC1pbmZvLWljb24nKT8uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHJlc3VsdC5tYXRoaW5mbywgcmVzdWx0LnNvbHV0aW9uSW5mbykub3BlbigpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgaWNvbnNEaXYucXVlcnlTZWxlY3RvcignLm1hdGgtZGVidWctaWNvbicpPy5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcclxuICAgICAgbmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHJlc3VsdC5kZWJ1Z0luZm8pLm9wZW4oKTtcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLy8gTG9hZCBzZXR0aW5nc1xyXG4gIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcclxuICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xyXG4gIH1cclxuXHJcbiAgLy8gU2F2ZSBzZXR0aW5nc1xyXG4gIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcclxuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcbiAgfVxyXG5cclxuICAvLyBVcGRhdGUgc3R5bGVzIGJhc2VkIG9uIHNldHRpbmdzXHJcbiAgdXBkYXRlU3R5bGVzKCkge1xyXG4gICAgY29uc3Qgcm9vdCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tcm93LWJhY2tncm91bmQnLCB0aGlzLnNldHRpbmdzLmJhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1ldmVuLXJvdy1iYWNrZ3JvdW5kJywgdGhpcy5zZXR0aW5ncy5ldmVuUm93QmFja2dyb3VuZCk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLW9kZC1yb3ctYmFja2dyb3VuZCcsIHRoaXMuc2V0dGluZ3Mub2RkUm93QmFja2dyb3VuZCk7XHJcbiAgICByb290LnN0eWxlLnNldFByb3BlcnR5KCctLWluZm8tbW9kYWwtY29sdW1uLWJhY2tncm91bmQnLCB0aGlzLnNldHRpbmdzLmluZm9Nb2RhbEJhY2tncm91bmQpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1mb250LXNpemUnLCB0aGlzLnNldHRpbmdzLmZvbnRTaXplKTtcclxuICAgIHJvb3Quc3R5bGUuc2V0UHJvcGVydHkoJy0tcm93LXBhZGRpbmcnLCB0aGlzLnNldHRpbmdzLnJvd1BhZGRpbmcpO1xyXG4gICAgcm9vdC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1pY29uLXNpemUnLCB0aGlzLnNldHRpbmdzLmljb25TaXplKTtcclxuICB9XHJcbn1cclxuXHJcbi8vIFNldHRpbmdzIHRhYiBjbGFzc1xyXG5jbGFzcyBNYXRoUGx1Z2luU2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xyXG4gIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xyXG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XHJcbiAgfVxyXG5cclxuICBkaXNwbGF5KCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250YWluZXJFbCB9ID0gdGhpcztcclxuICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XHJcbiAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdNYXRoIFBsdWdpbiBTZXR0aW5ncycgfSk7XHJcblxyXG4gICAgLy8gQWRkIHZhcmlvdXMgc2V0dGluZ3NcclxuICAgIHRoaXMuYWRkU2V0dGluZyhjb250YWluZXJFbCwgJ0JhY2tncm91bmQgQ29sb3InLCAnU2V0IHRoZSBiYWNrZ3JvdW5kIGNvbG9yLicsICdiYWNrZ3JvdW5kJyk7XHJcbiAgICB0aGlzLmFkZFNldHRpbmcoY29udGFpbmVyRWwsICdFdmVuIFJvdyBCYWNrZ3JvdW5kIENvbG9yJywgJ1NldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3IgZXZlbiByb3dzLicsICdldmVuUm93QmFja2dyb3VuZCcpO1xyXG4gICAgdGhpcy5hZGRTZXR0aW5nKGNvbnRhaW5lckVsLCAnT2RkIFJvdyBCYWNrZ3JvdW5kIENvbG9yJywgJ1NldCB0aGUgYmFja2dyb3VuZCBjb2xvciBmb3Igb2RkIHJvd3MuJywgJ29kZFJvd0JhY2tncm91bmQnKTtcclxuICAgIHRoaXMuYWRkU2V0dGluZyhjb250YWluZXJFbCwgJ2luZm8gbW9kZWwgQmFja2dyb3VuZCBDb2xvcicsICdTZXQgdGhlIGJhY2tncm91bmQgY29sb3IgZm9yIHRoZSBpbmZvIG1vZGVsLicsICdpbmZvTW9kYWxCYWNrZ3JvdW5kJyk7XHJcbiAgICB0aGlzLmFkZEZvbnRTZXR0aW5nKGNvbnRhaW5lckVsLCAnRm9udCBTaXplJywgJ1NldCB0aGUgZm9udCBzaXplIGZvciB0aGUgcm93cy4nLCAnZm9udFNpemUnKTtcclxuICAgIHRoaXMuYWRkRm9udFNldHRpbmcoY29udGFpbmVyRWwsICdSb3cgUGFkZGluZycsICdTZXQgdGhlIHBhZGRpbmcgZm9yIHRoZSByb3dzLicsICdyb3dQYWRkaW5nJyk7XHJcbiAgICB0aGlzLmFkZEZvbnRTZXR0aW5nKGNvbnRhaW5lckVsLCAnSWNvbiBTaXplJywgJ1NldCB0aGUgc2l6ZSBvZiB0aGUgaWNvbnMuJywgJ2ljb25TaXplJyk7XHJcblxyXG4gICAgLy8gQWRkIGEgXCJSZXNldCB0byBEZWZhdWx0XCIgYnV0dG9uXHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT5cclxuICAgICAgICBidXR0b25cclxuICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdSZXNldCB0byBEZWZhdWx0JylcclxuICAgICAgICAgIC5zZXRUb29sdGlwKCdSZXNldCBhbGwgc2V0dGluZ3MgdG8gdGhlaXIgZGVmYXVsdCB2YWx1ZXMnKVxyXG4gICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnJlc2V0VG9EZWZhdWx0KCk7XHJcbiAgICAgICAgICB9KSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZFNldHRpbmcoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHNldHRpbmdLZXk6IGtleW9mIE1hdGhQbHVnaW5TZXR0aW5ncykge1xyXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXHJcbiAgICAgIC5zZXROYW1lKG5hbWUpXHJcbiAgICAgIC5zZXREZXNjKGRlc2NyaXB0aW9uKVxyXG4gICAgICAuYWRkQ29sb3JQaWNrZXIoY29sb3JQaWNrZXIgPT5cclxuICAgICAgICBjb2xvclBpY2tlci5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5nc1tzZXR0aW5nS2V5XSlcclxuICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3Nbc2V0dGluZ0tleV0gPSB2YWx1ZTtcclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnVwZGF0ZVN0eWxlcygpO1xyXG4gICAgICAgICAgfSkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRGb250U2V0dGluZyhjb250YWluZXJFbDogSFRNTEVsZW1lbnQsIG5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgc2V0dGluZ0tleToga2V5b2YgTWF0aFBsdWdpblNldHRpbmdzKSB7XHJcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcclxuICAgICAgLnNldE5hbWUobmFtZSlcclxuICAgICAgLnNldERlc2MoZGVzY3JpcHRpb24pXHJcbiAgICAgIC5hZGRUZXh0KHRleHQgPT5cclxuICAgICAgICB0ZXh0LnNldFBsYWNlaG9sZGVyKHRoaXMucGx1Z2luLnNldHRpbmdzW3NldHRpbmdLZXldKVxyXG4gICAgICAgICAgLnNldFZhbHVlKHRoaXMucGx1Z2luLnNldHRpbmdzW3NldHRpbmdLZXldKVxyXG4gICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5nc1tzZXR0aW5nS2V5XSA9IHZhbHVlO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcclxuICAgICAgICAgICAgdGhpcy5wbHVnaW4udXBkYXRlU3R5bGVzKCk7XHJcbiAgICAgICAgICB9KSk7XHJcbiAgfVxyXG5cclxuICAvLyBSZXNldCBzZXR0aW5ncyB0byBkZWZhdWx0IHZhbHVlc1xyXG4gIHByaXZhdGUgYXN5bmMgcmVzZXRUb0RlZmF1bHQoKSB7XHJcbiAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUyB9O1xyXG4gICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XHJcbiAgICB0aGlzLnBsdWdpbi51cGRhdGVTdHlsZXMoKTtcclxuICAgIG5ldyBOb3RpY2UoJ1NldHRpbmdzIGhhdmUgYmVlbiByZXNldCB0byBkZWZhdWx0LicpO1xyXG4gICAgdGhpcy5kaXNwbGF5KCk7IC8vIFJlZnJlc2ggdGhlIHNldHRpbmdzIGRpc3BsYXlcclxuICB9XHJcbn1cclxuXHJcblxyXG4vLyBDdXN0b20gbW9kYWwgY2xhc3NlcyBmb3IgSW5mbyBhbmQgRGVidWcgbW9kYWxzXHJcbmNsYXNzIEluZm9Nb2RhbCBleHRlbmRzIE1vZGFsIHtcclxuICByZXN1bHQ6IHN0cmluZztcclxuICBzb2x1dGlvbkluZm86IHN0cmluZztcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHJlc3VsdDogc3RyaW5nLCBzb2x1dGlvbkluZm86IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMucmVzdWx0ID0gcmVzdWx0O1xyXG4gICAgdGhpcy5zb2x1dGlvbkluZm8gPSBzb2x1dGlvbkluZm87XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5hZGRDbGFzcygnaW5mby1tb2RhbC1zdHlsZScpO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ1Jlc3VsdCBEZXRhaWxzJywgY2xzOiAnaW5mby1tb2RhbC10aXRsZScgfSk7XHJcblxyXG4gICAgLy8gQWRkIGNvbnRlbnQgYW5kIGJ1dHRvbiBmb3IgY29weWluZyBkZXRhaWxzXHJcbiAgICB0aGlzLnBvcHVsYXRlQ29udGVudChjb250ZW50RWwpO1xyXG4gIH1cclxuICBcclxuICBwcml2YXRlIHBvcHVsYXRlQ29udGVudChjb250ZW50RWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBcclxuICAgIGNvbnN0IGNvbHVtbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdpbmZvLW1vZGFsLW1haW4tY29udGFpbmVyJyB9KTtcclxuICAgIGNvbnN0IHJlc3VsdExpbmVzID0gdGhpcy5yZXN1bHQuc3BsaXQoJ1xcbicpO1xyXG4gICAgY29uc3Qgc29sdXRpb25MaW5lcyA9IHRoaXMuc29sdXRpb25JbmZvLnNwbGl0KCdcXG4nKTtcclxuXHJcbiAgICByZXN1bHRMaW5lcy5mb3JFYWNoKChsaW5lLCBpbmRleCkgPT4ge1xyXG4gICAgICBjb25zdCBsaW5lQ29udGFpbmVyID0gY29sdW1uQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2luZm8tbW9kYWwtbGluZS1jb250YWluZXInIH0pO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgbGVmdExpbmUgPSBsaW5lQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2luZm8tbW9kYWwtbGVmdC1saW5lJyB9KTtcclxuICAgICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgJFxce1xcXFxiZWdpbnthbGlnbmVkfSYke2xpbmV9XFxcXGVuZHthbGlnbmVkfVxcfSRgLCBsZWZ0TGluZSwgJycsIG5ldyBDb21wb25lbnQoKSk7XHJcblxyXG4gICAgICBjb25zdCByaWdodExpbmUgPSBsaW5lQ29udGFpbmVyLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ2luZm8tbW9kYWwtcmlnaHQtbGluZScgfSk7XHJcbiAgICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYCRcXHtcXFxcYmVnaW57YWxpZ25lZH0mJHtzb2x1dGlvbkxpbmVzW2luZGV4XSB8fCAnJ31cXFxcZW5ke2FsaWduZWR9XFx9JGAsIHJpZ2h0TGluZSwgJycsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBidXR0b25Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnaW5mby1tb2RhbC1Db3B5LWJ1dHRvbi1jb250YWluZXInIH0pO1xyXG4gICAgY29uc3QgYWN0aW9uQnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdDb3B5IERldGFpbHMnLCBjbHM6ICdpbmZvLW1vZGFsLUNvcHktYnV0dG9uJyB9KTtcclxuXHJcbiAgICBhY3Rpb25CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiB7XHJcbiAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRoaXMucmVzdWx0KTtcclxuICAgICAgbmV3IE5vdGljZSgnRGV0YWlscyBjb3BpZWQgdG8gY2xpcGJvYXJkIScpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBvbkNsb3NlKCkge1xyXG4gICAgdGhpcy5jb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuXHJcbmNsYXNzIERlYnVnTW9kYWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgZGVidWdJbmZvOiBzdHJpbmc7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBkZWJ1Z0luZm86IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMuZGVidWdJbmZvID0gZGVidWdJbmZvO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuYWRkQ2xhc3MoJ2N1c3RvbS1tb2RhbC1zdHlsZScpO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMicsIHsgdGV4dDogJ0RlYnVnIEluZm9ybWF0aW9uJywgY2xzOiAnZGVidWctTW9kYWwtdGl0bGUnIH0pO1xyXG5cclxuICAgIGNvbnN0IGRlYnVnQ29udGVudCA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdkZWJ1Zy1pbmZvLWNvbnRhaW5lcicgfSk7XHJcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXGBcXGBcXGBqc1xcbiR7dGhpcy5kZWJ1Z0luZm99XFxuXFxgXFxgXFxgYCwgZGVidWdDb250ZW50LCAnJywgbmV3IENvbXBvbmVudCgpKTtcclxuICB9XHJcblxyXG4gIG9uQ2xvc2UoKSB7XHJcbiAgICB0aGlzLmNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldE1hdGhKc1N5bWJvbHMoKSB7XHJcbiAgY29uc3QgbWF0aGpzQnVpbHRJblN5bWJvbHMgPSBbXHJcbiAgICBcImZ8YWJzKClcIixcclxuICAgIFwiZnxhY29zKClcIixcclxuICAgIFwiZnxhY29zaCgpXCIsXHJcbiAgICBcImZ8YWNvdCgpXCIsXHJcbiAgICBcImZ8YWNvdGgoKVwiLFxyXG4gICAgXCJmfGFjc2MoKVwiLFxyXG4gICAgXCJmfGFjc2NoKClcIixcclxuICAgIFwiZnxhZGQoKVwiLFxyXG4gICAgXCJmfGFuZCgpXCIsXHJcbiAgICBcImZ8YXBwbHkoKVwiLFxyXG4gICAgXCJmfGFyZygpXCIsXHJcbiAgICBcImZ8YXNlYygpXCIsXHJcbiAgICBcImZ8YXNlY2goKVwiLFxyXG4gICAgXCJmfGFzaW4oKVwiLFxyXG4gICAgXCJmfGFzaW5oKClcIixcclxuICAgIFwiZnxhdGFuKClcIixcclxuICAgIFwiZnxhdGFuMigpXCIsXHJcbiAgICBcImZ8YXRhbmgoKVwiLFxyXG4gICAgXCJwfGF0bVwiLFxyXG4gICAgXCJwfGF0b21pY01hc3NcIixcclxuICAgIFwicHxhdm9nYWRyb1wiLFxyXG4gICAgXCJmfGJlbGxOdW1iZXJzKClcIixcclxuICAgIFwiZnxiaW4oKVwiLFxyXG4gICAgXCJmfGJpdEFuZCgpXCIsXHJcbiAgICBcImZ8Yml0Tm90KClcIixcclxuICAgIFwiZnxiaXRPcigpXCIsXHJcbiAgICBcImZ8Yml0WG9yKClcIixcclxuICAgIFwicHxib2hyTWFnbmV0b25cIixcclxuICAgIFwicHxib2hyUmFkaXVzXCIsXHJcbiAgICBcInB8Ym9sdHptYW5uXCIsXHJcbiAgICBcImZ8Y2F0YWxhbigpXCIsXHJcbiAgICBcImZ8Y2JydCgpXCIsXHJcbiAgICBcImZ8Y2VpbCgpXCIsXHJcbiAgICBcInB8Y2xhc3NpY2FsRWxlY3Ryb25SYWRpdXNcIixcclxuICAgIFwiZnxjbG9uZSgpXCIsXHJcbiAgICBcImZ8Y29sdW1uKClcIixcclxuICAgIFwiZnxjb21iaW5hdGlvbnMoKVwiLFxyXG4gICAgXCJmfGNvbWJpbmF0aW9uc1dpdGhSZXAoKVwiLFxyXG4gICAgXCJmfGNvbXBhcmUoKVwiLFxyXG4gICAgXCJmfGNvbXBhcmVOYXR1cmFsKClcIixcclxuICAgIFwiZnxjb21wYXJlVGV4dCgpXCIsXHJcbiAgICBcImZ8Y29tcGlsZSgpXCIsXHJcbiAgICBcImZ8Y29tcG9zaXRpb24oKVwiLFxyXG4gICAgXCJmfGNvbmNhdCgpXCIsXHJcbiAgICBcInB8Y29uZHVjdGFuY2VRdWFudHVtXCIsXHJcbiAgICBcImZ8Y29uaigpXCIsXHJcbiAgICBcImZ8Y29zKClcIixcclxuICAgIFwiZnxjb3NoKClcIixcclxuICAgIFwiZnxjb3QoKVwiLFxyXG4gICAgXCJmfGNvdGgoKVwiLFxyXG4gICAgXCJwfGNvdWxvbWJcIixcclxuICAgIFwiZnxjb3VudCgpXCIsXHJcbiAgICBcImZ8Y3Jvc3MoKVwiLFxyXG4gICAgXCJmfGNzYygpXCIsXHJcbiAgICBcImZ8Y3NjaCgpXCIsXHJcbiAgICBcImZ8Y3RyYW5zcG9zZSgpXCIsXHJcbiAgICBcImZ8Y3ViZSgpXCIsXHJcbiAgICBcImZ8Y3Vtc3VtKClcIixcclxuICAgIFwiZnxkZWVwRXF1YWwoKVwiLFxyXG4gICAgXCJmfGRlcml2YXRpdmUoKVwiLFxyXG4gICAgXCJmfGRldCgpXCIsXHJcbiAgICBcInB8ZGV1dGVyb25NYXNzXCIsXHJcbiAgICBcImZ8ZGlhZygpXCIsXHJcbiAgICBcImZ8ZGlmZigpXCIsXHJcbiAgICBcImZ8ZGlzdGFuY2UoKVwiLFxyXG4gICAgXCJmfGRpdmlkZSgpXCIsXHJcbiAgICBcImZ8ZG90KClcIixcclxuICAgIFwiZnxkb3REaXZpZGUoKVwiLFxyXG4gICAgXCJmfGRvdE11bHRpcGx5KClcIixcclxuICAgIFwiZnxkb3RQb3coKVwiLFxyXG4gICAgXCJjfGVcIixcclxuICAgIFwicHxlZmltb3ZGYWN0b3JcIixcclxuICAgIFwiZnxlaWdzKClcIixcclxuICAgIFwicHxlbGVjdHJpY0NvbnN0YW50XCIsXHJcbiAgICBcInB8ZWxlY3Ryb25NYXNzXCIsXHJcbiAgICBcInB8ZWxlbWVudGFyeUNoYXJnZVwiLFxyXG4gICAgXCJmfGVxdWFsKClcIixcclxuICAgIFwiZnxlcXVhbFRleHQoKVwiLFxyXG4gICAgXCJmfGVyZigpXCIsXHJcbiAgICBcImZ8ZXZhbHVhdGUoKVwiLFxyXG4gICAgXCJmfGV4cCgpXCIsXHJcbiAgICBcImZ8ZXhwbSgpXCIsXHJcbiAgICBcImZ8ZXhwbTEoKVwiLFxyXG4gICAgXCJmfGZhY3RvcmlhbCgpXCIsXHJcbiAgICBcInB8ZmFyYWRheVwiLFxyXG4gICAgXCJwfGZlcm1pQ291cGxpbmdcIixcclxuICAgIFwiZnxmZnQoKVwiLFxyXG4gICAgXCJmfGZpbHRlcigpXCIsXHJcbiAgICBcInB8ZmluZVN0cnVjdHVyZVwiLFxyXG4gICAgXCJwfGZpcnN0UmFkaWF0aW9uXCIsXHJcbiAgICBcImZ8Zml4KClcIixcclxuICAgIFwiZnxmbGF0dGVuKClcIixcclxuICAgIFwiZnxmbG9vcigpXCIsXHJcbiAgICBcImZ8Zm9yRWFjaCgpXCIsXHJcbiAgICBcImZ8Zm9ybWF0KClcIixcclxuICAgIFwiZnxnYW1tYSgpXCIsXHJcbiAgICBcInB8Z2FzQ29uc3RhbnRcIixcclxuICAgIFwiZnxnY2QoKVwiLFxyXG4gICAgXCJmfGdldE1hdHJpeERhdGFUeXBlKClcIixcclxuICAgIFwicHxncmF2aXRhdGlvbkNvbnN0YW50XCIsXHJcbiAgICBcInB8Z3Jhdml0eVwiLFxyXG4gICAgXCJwfGhhcnRyZWVFbmVyZ3lcIixcclxuICAgIFwiZnxoYXNOdW1lcmljVmFsdWUoKVwiLFxyXG4gICAgXCJmfGhlbHAoKVwiLFxyXG4gICAgXCJmfGhleCgpXCIsXHJcbiAgICBcImZ8aHlwb3QoKVwiLFxyXG4gICAgXCJjfGlcIixcclxuICAgIFwiZnxpZGVudGl0eSgpXCIsXHJcbiAgICBcImZ8aWZmdCgpXCIsXHJcbiAgICBcImZ8aW0oKVwiLFxyXG4gICAgXCJjfEluZmluaXR5XCIsXHJcbiAgICBcImZ8aW50ZXJzZWN0KClcIixcclxuICAgIFwiZnxpbnYoKVwiLFxyXG4gICAgXCJwfGludmVyc2VDb25kdWN0YW5jZVF1YW50dW1cIixcclxuICAgIFwiZnxpbnZtb2QoKVwiLFxyXG4gICAgXCJmfGlzSW50ZWdlcigpXCIsXHJcbiAgICBcImZ8aXNOYU4oKVwiLFxyXG4gICAgXCJmfGlzTmVnYXRpdmUoKVwiLFxyXG4gICAgXCJmfGlzTnVtZXJpYygpXCIsXHJcbiAgICBcImZ8aXNQb3NpdGl2ZSgpXCIsXHJcbiAgICBcImZ8aXNQcmltZSgpXCIsXHJcbiAgICBcImZ8aXNaZXJvKClcIixcclxuICAgIFwiZnxrbGRpdmVyZ2VuY2UoKVwiLFxyXG4gICAgXCJwfGtsaXR6aW5nXCIsXHJcbiAgICBcImZ8a3JvbigpXCIsXHJcbiAgICBcImZ8bGFyZ2VyKClcIixcclxuICAgIFwiZnxsYXJnZXJFcSgpXCIsXHJcbiAgICBcImZ8bGNtKClcIixcclxuICAgIFwiZnxsZWFmQ291bnQoKVwiLFxyXG4gICAgXCJmfGxlZnRTaGlmdCgpXCIsXHJcbiAgICBcImZ8bGdhbW1hKClcIixcclxuICAgIFwiY3xMTjEwXCIsXHJcbiAgICBcImN8TE4yXCIsXHJcbiAgICBcImZ8bG9nKClcIixcclxuICAgIFwiZnxsb2cxMCgpXCIsXHJcbiAgICBcImN8TE9HMTBFXCIsXHJcbiAgICBcImZ8bG9nMXAoKVwiLFxyXG4gICAgXCJmfGxvZzIoKVwiLFxyXG4gICAgXCJjfExPRzJFXCIsXHJcbiAgICBcInB8bG9zY2htaWR0XCIsXHJcbiAgICBcImZ8bHNvbHZlKClcIixcclxuICAgIFwiZnxsc29sdmVBbGwoKVwiLFxyXG4gICAgXCJmfGx1cCgpXCIsXHJcbiAgICBcImZ8bHVzb2x2ZSgpXCIsXHJcbiAgICBcImZ8bHlhcCgpXCIsXHJcbiAgICBcImZ8bWFkKClcIixcclxuICAgIFwicHxtYWduZXRpY0NvbnN0YW50XCIsXHJcbiAgICBcInB8bWFnbmV0aWNGbHV4UXVhbnR1bVwiLFxyXG4gICAgXCJmfG1hcCgpXCIsXHJcbiAgICBcImZ8bWF0cml4RnJvbUNvbHVtbnMoKVwiLFxyXG4gICAgXCJmfG1hdHJpeEZyb21GdW5jdGlvbigpXCIsXHJcbiAgICBcImZ8bWF0cml4RnJvbVJvd3MoKVwiLFxyXG4gICAgXCJmfG1heCgpXCIsXHJcbiAgICBcImZ8bWVhbigpXCIsXHJcbiAgICBcImZ8bWVkaWFuKClcIixcclxuICAgIFwiZnxtaW4oKVwiLFxyXG4gICAgXCJmfG1vZCgpXCIsXHJcbiAgICBcImZ8bW9kZSgpXCIsXHJcbiAgICBcInB8bW9sYXJNYXNzXCIsXHJcbiAgICBcInB8bW9sYXJNYXNzQzEyXCIsXHJcbiAgICBcInB8bW9sYXJQbGFuY2tDb25zdGFudFwiLFxyXG4gICAgXCJwfG1vbGFyVm9sdW1lXCIsXHJcbiAgICBcImZ8bXVsdGlub21pYWwoKVwiLFxyXG4gICAgXCJmfG11bHRpcGx5KClcIixcclxuICAgIFwiY3xOYU5cIixcclxuICAgIFwicHxuZXV0cm9uTWFzc1wiLFxyXG4gICAgXCJmfG5vcm0oKVwiLFxyXG4gICAgXCJmfG5vdCgpXCIsXHJcbiAgICBcImZ8bnRoUm9vdCgpXCIsXHJcbiAgICBcImZ8bnRoUm9vdHMoKVwiLFxyXG4gICAgXCJwfG51Y2xlYXJNYWduZXRvblwiLFxyXG4gICAgXCJjfG51bGxcIixcclxuICAgIFwiZnxudW1lcmljKClcIixcclxuICAgIFwiZnxvY3QoKVwiLFxyXG4gICAgXCJmfG9uZXMoKVwiLFxyXG4gICAgXCJmfG9yKClcIixcclxuICAgIFwiZnxwYXJzZXIoKVwiLFxyXG4gICAgXCJmfHBhcnRpdGlvblNlbGVjdCgpXCIsXHJcbiAgICBcImZ8cGVybXV0YXRpb25zKClcIixcclxuICAgIFwiY3xwaGlcIixcclxuICAgIFwiY3xwaVwiLFxyXG4gICAgXCJmfHBpY2tSYW5kb20oKVwiLFxyXG4gICAgXCJmfHBpbnYoKVwiLFxyXG4gICAgXCJwfHBsYW5ja0NoYXJnZVwiLFxyXG4gICAgXCJwfHBsYW5ja0NvbnN0YW50XCIsXHJcbiAgICBcInB8cGxhbmNrTGVuZ3RoXCIsXHJcbiAgICBcInB8cGxhbmNrTWFzc1wiLFxyXG4gICAgXCJwfHBsYW5ja1RlbXBlcmF0dXJlXCIsXHJcbiAgICBcInB8cGxhbmNrVGltZVwiLFxyXG4gICAgXCJmfHBvbHlub21pYWxSb290KClcIixcclxuICAgIFwiZnxwb3coKVwiLFxyXG4gICAgXCJmfHByaW50KClcIixcclxuICAgIFwiZnxwcm9kKClcIixcclxuICAgIFwicHxwcm90b25NYXNzXCIsXHJcbiAgICBcImZ8cXIoKVwiLFxyXG4gICAgXCJmfHF1YW50aWxlU2VxKClcIixcclxuICAgIFwicHxxdWFudHVtT2ZDaXJjdWxhdGlvblwiLFxyXG4gICAgXCJmfHJhbmRvbSgpXCIsXHJcbiAgICBcImZ8cmFuZG9tSW50KClcIixcclxuICAgIFwiZnxyYW5nZSgpXCIsXHJcbiAgICBcImZ8cmF0aW9uYWxpemUoKVwiLFxyXG4gICAgXCJmfHJlKClcIixcclxuICAgIFwicHxyZWR1Y2VkUGxhbmNrQ29uc3RhbnRcIixcclxuICAgIFwiZnxyZXNoYXBlKClcIixcclxuICAgIFwiZnxyZXNpemUoKVwiLFxyXG4gICAgXCJmfHJlc29sdmUoKVwiLFxyXG4gICAgXCJmfHJpZ2h0QXJpdGhTaGlmdCgpXCIsXHJcbiAgICBcImZ8cmlnaHRMb2dTaGlmdCgpXCIsXHJcbiAgICBcImZ8cm90YXRlKClcIixcclxuICAgIFwiZnxyb3RhdGlvbk1hdHJpeCgpXCIsXHJcbiAgICBcImZ8cm91bmQoKVwiLFxyXG4gICAgXCJmfHJvdygpXCIsXHJcbiAgICBcInB8cnlkYmVyZ1wiLFxyXG4gICAgXCJwfHNhY2t1clRldHJvZGVcIixcclxuICAgIFwiZnxzY2h1cigpXCIsXHJcbiAgICBcImZ8c2VjKClcIixcclxuICAgIFwiZnxzZWNoKClcIixcclxuICAgIFwicHxzZWNvbmRSYWRpYXRpb25cIixcclxuICAgIFwiZnxzZXRDYXJ0ZXNpYW4oKVwiLFxyXG4gICAgXCJmfHNldERpZmZlcmVuY2UoKVwiLFxyXG4gICAgXCJmfHNldERpc3RpbmN0KClcIixcclxuICAgIFwiZnxzZXRJbnRlcnNlY3QoKVwiLFxyXG4gICAgXCJmfHNldElzU3Vic2V0KClcIixcclxuICAgIFwiZnxzZXRNdWx0aXBsaWNpdHkoKVwiLFxyXG4gICAgXCJmfHNldFBvd2Vyc2V0KClcIixcclxuICAgIFwiZnxzZXRTaXplKClcIixcclxuICAgIFwiZnxzZXRTeW1EaWZmZXJlbmNlKClcIixcclxuICAgIFwiZnxzZXRVbmlvbigpXCIsXHJcbiAgICBcImZ8c2lnbigpXCIsXHJcbiAgICBcImZ8c2ltcGxpZnkoKVwiLFxyXG4gICAgXCJmfHNpbXBsaWZ5Q29uc3RhbnQoKVwiLFxyXG4gICAgXCJmfHNpbXBsaWZ5Q29yZSgpXCIsXHJcbiAgICBcImZ8c2luKClcIixcclxuICAgIFwiZnxzaW5oKClcIixcclxuICAgIFwiZnxzaXplKClcIixcclxuICAgIFwiZnxzbHUoKVwiLFxyXG4gICAgXCJmfHNtYWxsZXIoKVwiLFxyXG4gICAgXCJmfHNtYWxsZXJFcSgpXCIsXHJcbiAgICBcImZ8c29ydCgpXCIsXHJcbiAgICBcInB8c3BlZWRPZkxpZ2h0XCIsXHJcbiAgICBcImZ8c3FydCgpXCIsXHJcbiAgICBcImN8U1FSVDFfMlwiLFxyXG4gICAgXCJjfFNRUlQyXCIsXHJcbiAgICBcImZ8c3FydG0oKVwiLFxyXG4gICAgXCJmfHNxdWFyZSgpXCIsXHJcbiAgICBcImZ8c3F1ZWV6ZSgpXCIsXHJcbiAgICBcImZ8c3RkKClcIixcclxuICAgIFwicHxzdGVmYW5Cb2x0em1hbm5cIixcclxuICAgIFwiZnxzdGlybGluZ1MyKClcIixcclxuICAgIFwiZnxzdWJzZXQoKVwiLFxyXG4gICAgXCJmfHN1YnRyYWN0KClcIixcclxuICAgIFwiZnxzdW0oKVwiLFxyXG4gICAgXCJmfHN5bHZlc3RlcigpXCIsXHJcbiAgICBcImZ8c3ltYm9saWNFcXVhbCgpXCIsXHJcbiAgICBcImZ8dGFuKClcIixcclxuICAgIFwiZnx0YW5oKClcIixcclxuICAgIFwiY3x0YXVcIixcclxuICAgIFwicHx0aG9tc29uQ3Jvc3NTZWN0aW9uXCIsXHJcbiAgICBcImZ8dG8oKVwiLFxyXG4gICAgXCJmfHRyYWNlKClcIixcclxuICAgIFwiZnx0cmFuc3Bvc2UoKVwiLFxyXG4gICAgXCJmfHR5cGVPZigpXCIsXHJcbiAgICBcImZ8dW5hcnlNaW51cygpXCIsXHJcbiAgICBcImZ8dW5hcnlQbHVzKClcIixcclxuICAgIFwiZnx1bmVxdWFsKClcIixcclxuICAgIFwiZnx1c29sdmUoKVwiLFxyXG4gICAgXCJmfHVzb2x2ZUFsbCgpXCIsXHJcbiAgICBcInB8dmFjdXVtSW1wZWRhbmNlXCIsXHJcbiAgICBcImZ8dmFyaWFuY2UoKVwiLFxyXG4gICAgXCJwfHdlYWtNaXhpbmdBbmdsZVwiLFxyXG4gICAgXCJwfHdpZW5EaXNwbGFjZW1lbnRcIixcclxuICAgIFwiZnx4Z2NkKClcIixcclxuICAgIFwiZnx4b3IoKVwiLFxyXG4gICAgXCJmfHplcm9zKClcIlxyXG4gIF07XHJcbiAgcmV0dXJuIG1hdGhqc0J1aWx0SW5TeW1ib2xzO1xyXG59Il19