import { Plugin, MarkdownRenderer, Modal, Component, Notice, } from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { CustomInputModal } from "./temp";
import { DEFAULT_SETTINGS, MathPluginSettingTab, } from "./settings";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities.js";
import { Axis, Coordinate, Draw, FormatTikzjax, Formatting, Tikzjax } from "./tikzjax/tikzjax";
import { NumeralsSuggestor } from "./suggestor.js";
export default class MathPlugin extends Plugin {
    settings;
    tikzProcessor;
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new MathPluginSettingTab(this.app, this));
        this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
        this.registerCommands();
        this.registerEditorSuggest(new NumeralsSuggestor(this));
        this.tikzProcessor = new Tikzjax(this.app, this);
        this.tikzProcessor.readyLayout();
        this.tikzProcessor.addSyntaxHighlighting();
        this.tikzProcessor.registerTikzCodeBlock();
    }
    onunload() {
        this.tikzProcessor.unloadTikZJaxAllWindows();
        this.tikzProcessor.removeSyntaxHighlighting();
    }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    registerCommands() {
        this.addCommand({
            id: "open-input-form",
            name: "Open Input Form",
            callback: () => new CustomInputModal(this.app, this).open(),
        });
        this.addCommand({
            id: "view-session-history",
            name: "View Session History",
            //callback: () => new HistoryModal(this.app, this).open(),
        });
    }
    processMathBlock(source, mainContainer) {
        mainContainer.classList.add("math-container");
        const userVariables = [];
        let skippedIndexes = 0;
        const expressions = source.split("\n").map(line => line.trim()).filter(line => line);
        if (expressions.length === 0) {
            return;
        }
        expressions.forEach((expression, index) => {
            let lineContainer = document.createElement("div");
            lineContainer.classList.add("math-line-container", (index - skippedIndexes) % 2 === 0 ? "math-row-even" : "math-row-odd");
            const processMath = new ProcessMath(expression, userVariables, this.app, lineContainer);
            processMath.initialize();
            if (processMath.mode !== "variable") {
                lineContainer = processMath.container;
                mainContainer.appendChild(lineContainer);
            }
            else {
                skippedIndexes++;
            }
        });
    }
}
class ProcessMath {
    mathInput;
    userVariables = [];
    mode = "math";
    result;
    container;
    iconsDiv;
    app;
    constructor(mathInput, userVariables, app, container) {
        this.mathInput = mathInput;
        this.userVariables = userVariables;
        this.app = app;
        this.container = container;
        this.iconsDiv = Object.assign(document.createElement("div"), {
            className: "math-icons",
        });
    }
    async initialize() {
        this.assignMode();
        this.setupContainer();
        this.handleVariables();
        this.renderMath();
    }
    setupContainer() {
        ["math-input", "math-result"].forEach(className => {
            const div = document.createElement("div");
            div.classList.add(className);
            this.container.appendChild(div);
        });
        this.container.appendChild(this.iconsDiv);
    }
    renderMath() {
        const inputDiv = this.container.querySelector(".math-input");
        const resultDiv = this.container.querySelector(".math-result");
        try {
            switch (this.mode) {
                case "binom":
                    // eslint-disable-next-line no-case-declarations
                    const binomModel = new BinomInfoModel(this.app, this.mathInput);
                    this.addInfoModal(binomModel);
                    this.result = binomModel.getEqual();
                    break;
                case "cos":
                    // eslint-disable-next-line no-case-declarations
                    const [, sideA, sideB, sideC] = this.mathInput.map(Number);
                    this.result = findAngleByCosineRule(sideA, sideB, sideC);
                    break;
                case "vec":
                    // eslint-disable-next-line no-case-declarations
                    this.result = new VecProcessor(this.mathInput[1], this.mathInput[2], this.mathInput[3]);
                    this.addInfoModal(new tikzGraph(this.app, this.result.graph));
                    this.addDebugModel(new DebugModal(this.app, this.result.vecInfo.debugInfo));
                    this.result = this.result.result;
                    break;
                case "variable":
                    break;
                default:
                    // eslint-disable-next-line no-case-declarations
                    this.result = new MathPraiser(this.mathInput);
                    this.addInfoModal(new InfoModal(this.app, this.result.mathInfo));
                    this.addDebugModel(new DebugModal(this.app, this.result.mathInfo.debugInfo));
                    this.mathInput = this.result.input;
                    this.result = this.result.solution;
                    break;
            }
            this.addInputAndResultDiv(inputDiv, resultDiv, typeof this.mathInput === "string" ? this.mathInput : this.mathInput[0], roundBySettings(this.result));
        }
        catch (err) {
            this.displayError(inputDiv, resultDiv, err);
            console.error("The initial praising failed", err);
        }
    }
    addInputAndResultDiv(inputDiv, resultDiv, input, result) {
        MarkdownRenderer.renderMarkdown(`\${${input}}$`, inputDiv, "", new Component());
        const resultOutput = /(true|false)/.test(result) ? result : `\${${result}}$`;
        MarkdownRenderer.renderMarkdown(resultOutput, resultDiv, "", new Component());
    }
    displayError(inputDiv, resultDiv, err) {
        MarkdownRenderer.renderMarkdown(this.mathInput, inputDiv, "", new Component());
        resultDiv.innerHTML = `<span class="error-text">${err.message}</span>`;
        this.container.classList.add("math-error-line");
    }
    assignMode() {
        const regexList = GetMathContextRegex();
        const matchObject = regexList.find(regexObj => regexObj.regex.test(this.mathInput));
        if (matchObject) {
            this.mode = matchObject.value;
            this.mathInput = this.mathInput.match(matchObject.regex);
        }
    }
    addInfoModal(modal) {
        const icon = Object.assign(document.createElement("div"), {
            className: "math-info-icon",
            textContent: "🛈",
        });
        icon.onclick = () => modal.open();
        this.iconsDiv.appendChild(icon);
    }
    addDebugModel(modal) {
        const icon = Object.assign(document.createElement("div"), {
            className: "math-debug-icon",
            textContent: "🐞",
        });
        icon.onclick = () => modal.open();
        this.iconsDiv.appendChild(icon);
    }
    handleVariables() {
        if (this.mode === "variable") {
            this.handleVariableDeclaration();
        }
        else {
            this.replaceVariablesInExpression();
        }
    }
    handleVariableDeclaration() {
        const [_, variable, value] = this.mathInput.map((part) => part.trim());
        if (!variable || !value) {
            console.warn(`Invalid variable declaration: ${this.mathInput}`);
            return;
        }
        const existingVarIndex = this.userVariables.findIndex(v => v.variable === variable);
        if (existingVarIndex !== -1) {
            this.userVariables[existingVarIndex].value = value;
        }
        else {
            this.userVariables.push({ variable, value });
        }
    }
    replaceVariablesInExpression() {
        this.userVariables.forEach(({ variable, value }) => {
            if (typeof this.mathInput === "string") {
                this.mathInput = this.mathInput.replace(variable, value);
            }
        });
    }
}
function GetMathContextRegex() {
    return [
        { regex: /binom\((\d+),(\d+),(\d+)\)/, value: "binom" },
        { regex: /vec([+-]{0,2})\(([\d.+-]+[:,][\d.+-]+)\)([\d.+-]*)/, value: "vec" },
        { regex: /cos\(([\d.]+),([\d.]+),([\d.]+)\)/, value: "cos" },
        { regex: /var\s*([\w]+)\s*=\s*([\d.]+)/, value: "variable" },
    ];
}
class VecProcessor {
    userInput;
    environment;
    vecInfo = new MathInfo();
    axis;
    modifier;
    result;
    graph;
    constructor(environment, mathInput, modifier) {
        const match = environment.match(/([+-]?)([+-]?)/);
        this.environment = { X: match?.[1] ?? "+", Y: match?.[2] ?? "+" };
        this.modifier = modifier.length > 0 ? getUsableDegrees(Number(modifier)) : 0;
        this.axis = new Axis().universal(mathInput);
        this.addGraph();
    }
    addGraph() {
        const targetSize = 10;
        const maxComponent = Math.max(Math.abs(this.axis.cartesianX), Math.abs(this.axis.cartesianY));
        // Determine scaling factor
        let scale = 1;
        if (maxComponent < targetSize) {
            scale = targetSize / maxComponent;
        }
        else if (maxComponent > targetSize) {
            scale = targetSize / maxComponent;
        }
        // i need to make it "to X axis"
        //const vectorAngle = getUsableDegrees(radiansToDegrees(Math.atan2(scaledY, scaledX)));
        const ancer = new Axis().addCartesian(0, 0);
        const c1 = new Coordinate().axis.addCartesian(this.axis.cartesianX, 0);
        this.graph = new FormatTikzjax([
            new Formatting().quickAdd("globol", { color: "white", scale: "1", }),
            new Draw({ formatting: { lineWidth: 1, draw: "yellow", arror: "-{Stealth}" }, draw: [ancer, '--', c1, new Axis()] }, undefined, "draw"),
            //new Draw({formatting: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"},draw: [ancer,'--',new Coordinate(),new Axis()]},undefined,"draw",),
            //new Draw({formatting: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"},draw: [ancer,'--',new Coordinate(),new Axis()]},undefined,"draw",),
        ]);
        /* Generate LaTeX code for vector components and main vector
        const t = String.raw`
    
          % Angle Annotation
          %\ang{X}{anc}{vec}{}{${roundBySettings(vectorAngle)}$^{\circ}$}
        `.replace(/^\s+/gm, "");*/
        this.vecInfo.addDebugInfo("Scaling factor", scale);
        //this.vecInfo.addDebugInfo("TikZ graph code", tikzCode);
        //this.graph = tikzCode;
    }
}
class tikzGraph extends Modal {
    tikz;
    constructor(app, tikzCode) {
        super(app);
        this.tikz = tikzCode;
    }
    onOpen() {
        const script = this.contentEl.createEl("script");
        script.setAttribute("type", "text/tikz");
        script.setAttribute("data-show-console", "true");
        script.setText(this.tikz.getCode());
        const actionButton = this.contentEl.createEl("button", { text: "Copy graph", cls: "info-modal-Copy-button" });
        actionButton.addEventListener("click", () => {
            navigator.clipboard.writeText(this.tikz.getCode());
            new Notice("Graph copied to clipboard!");
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
class Distribution {
    type;
    mean;
    variance;
    stdDev;
    // For Binomial Distribution
    trials;
    probability;
    // For Poisson Distribution
    lambda;
    constructor(type, params) {
        this.type = type;
        // Initialize based on distribution type
        switch (type) {
            case 'normal':
                this.mean = params.mean || 0;
                this.stdDev = params.stdDev || 1;
                this.variance = this.stdDev ** 2;
                break;
            case 'binomial':
                this.trials = params.trials || 1;
                this.probability = params.probability || 0.5;
                this.mean = this.trials * this.probability;
                this.variance = this.mean * (1 - this.probability);
                this.stdDev = Math.sqrt(this.variance);
                break;
            case 'poisson':
                this.lambda = params.lambda || 1;
                this.mean = this.lambda;
                this.variance = this.lambda;
                this.stdDev = Math.sqrt(this.variance);
                break;
            default:
                throw new Error('Unsupported distribution type');
        }
    }
    /**
     * Calculate the probability density function (PDF) for the Normal Distribution.
     */
    normalPDF(x) {
        if (this.type !== 'normal') {
            throw new Error('PDF only applies to the Normal Distribution');
        }
        const expPart = Math.exp(-((x - this.mean) ** 2) / (2 * this.variance));
        return (1 / (this.stdDev * Math.sqrt(2 * Math.PI))) * expPart;
    }
    /**
     * Calculate the cumulative distribution function (CDF) for the Normal Distribution.
     */
    normalCDF(x) {
        if (this.type !== 'normal') {
            throw new Error('CDF only applies to the Normal Distribution');
        }
        return 0.5 * (1 + this.erf((x - this.mean) / (Math.sqrt(2) * this.stdDev)));
    }
    /**
     * Calculate the probability mass function (PMF) for the Binomial Distribution.
     */
    binomialPMF(x) {
        if (this.type !== 'binomial') {
            throw new Error('PMF only applies to the Binomial Distribution');
        }
        const combination = this.factorial(this.trials) /
            (this.factorial(x) * this.factorial(this.trials - x));
        return combination * Math.pow(this.probability, x) * Math.pow(1 - this.probability, this.trials - x);
    }
    /**
     * Calculate the probability mass function (PMF) for the Poisson Distribution.
     */
    poissonPMF(x) {
        if (this.type !== 'poisson') {
            throw new Error('PMF only applies to the Poisson Distribution');
        }
        return (Math.pow(this.lambda, x) * Math.exp(-this.lambda)) / this.factorial(x);
    }
    /**
     * Error function approximation for Normal Distribution CDF.
     */
    erf(x) {
        const sign = x < 0 ? -1 : 1;
        const a = 0.3275911;
        const p = 0.254829592;
        const q = -0.284496736;
        const r = 1.421413741;
        const s = -1.453152027;
        const t = 1.061405429;
        const u = 1 + a * Math.abs(x);
        const poly = (((((p * u + q) * u + r) * u + s) * u + t) * u);
        return sign * (1 - poly * Math.exp(-x * x));
    }
    /**
     * Factorial function.
     */
    factorial(n) {
        if (n < 0)
            return NaN;
        let result = 1;
        for (let i = 2; i <= n; i++)
            result *= i;
        return result;
    }
}
class DistributionModel extends Modal {
    n;
    k;
    p;
    equal = 0;
    less = 0;
    lessEqual = 0;
    big = 0;
    bigEqual = 0;
    constructor(app, source) {
        super(app);
        const [_, n, k, p] = source.match(/\d+/g).map(Number);
        this.n = n;
        this.k = k;
        this.p = p;
    }
    onOpen() {
        this.calculateProbabilities();
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Binomial Probability Results" });
        contentEl.createEl("p", { text: `P(X = ${this.k}) = ${this.equal}` });
        contentEl.createEl("p", { text: `P(X < ${this.k}) = ${this.less}` });
        contentEl.createEl("p", { text: `P(X <= ${this.k}) = ${this.lessEqual}` });
        contentEl.createEl("p", { text: `P(X > ${this.k}) = ${this.big}` });
        contentEl.createEl("p", { text: `P(X >= ${this.k}) = ${this.bigEqual}` });
    }
    getEqual() {
        return calculateBinom(this.n, this.k, this.p);
    }
    calculateProbabilities() {
        for (let i = 0; i <= this.n; i++) {
            const probability = calculateBinom(this.n, i, this.p);
            if (i === this.k)
                this.equal = probability;
            if (i < this.k)
                this.less += probability;
            if (i <= this.k)
                this.lessEqual += probability;
            if (i > this.k)
                this.big += probability;
            if (i >= this.k)
                this.bigEqual += probability;
        }
    }
}
class BinomInfoModel extends Modal {
    n;
    k;
    p;
    equal = 0;
    less = 0;
    lessEqual = 0;
    big = 0;
    bigEqual = 0;
    constructor(app, source) {
        super(app);
        const [_, n, k, p] = source.match(/\d+/g).map(Number);
        this.n = n;
        this.k = k;
        this.p = p;
    }
    onOpen() {
        this.calculateProbabilities();
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Binomial Probability Results" });
        contentEl.createEl("p", { text: `P(X = ${this.k}) = ${this.equal}` });
        contentEl.createEl("p", { text: `P(X < ${this.k}) = ${this.less}` });
        contentEl.createEl("p", { text: `P(X <= ${this.k}) = ${this.lessEqual}` });
        contentEl.createEl("p", { text: `P(X > ${this.k}) = ${this.big}` });
        contentEl.createEl("p", { text: `P(X >= ${this.k}) = ${this.bigEqual}` });
    }
    getEqual() {
        return calculateBinom(this.n, this.k, this.p);
    }
    calculateProbabilities() {
        for (let i = 0; i <= this.n; i++) {
            const probability = calculateBinom(this.n, i, this.p);
            if (i === this.k)
                this.equal = probability;
            if (i < this.k)
                this.less += probability;
            if (i <= this.k)
                this.lessEqual += probability;
            if (i > this.k)
                this.big += probability;
            if (i >= this.k)
                this.bigEqual += probability;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEdBQW1CLE1BQU0sVUFBVSxDQUFDO0FBQzNHLE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUN2RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQTJDLE1BQU0sUUFBUSxDQUFDO0FBQ25GLE9BQU8sRUFBcUIsZ0JBQWdCLEVBQUUsb0JBQW9CLEdBQUUsTUFBTSxZQUFZLENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBb0IscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQXNDLGVBQWUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BLLE9BQU8sRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQy9GLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBRW5ELE1BQU0sQ0FBQyxPQUFPLE9BQU8sVUFBVyxTQUFRLE1BQU07SUFDNUMsUUFBUSxDQUFxQjtJQUM3QixhQUFhLENBQVM7SUFDdEIsS0FBSyxDQUFDLE1BQU07UUFDVixNQUFNLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMs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O2dCQUFFLElBQUksQ0FBQyxHQUFHLElBQUksV0FBVyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxRQUFRLElBQUksV0FBVyxDQUFDO1NBQy9DO0lBQ0gsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtQbHVnaW4sIE1hcmtkb3duUmVuZGVyZXIsIEFwcCwgTW9kYWwsIENvbXBvbmVudCwgU2V0dGluZyxOb3RpY2UsIFdvcmtzcGFjZVdpbmRvdyx9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgeyBNYXRoSW5mbywgTWF0aFByYWlzZXIgfSBmcm9tIFwiLi9tYXRoRW5naW5lLmpzXCI7XHJcbmltcG9ydCB7IEluZm9Nb2RhbCwgRGVidWdNb2RhbCB9IGZyb20gXCIuL2Rlc3BseU1vZGFsc1wiO1xyXG5pbXBvcnQgeyBDdXN0b21JbnB1dE1vZGFsLCBIaXN0b3J5TW9kYWwsIElucHV0TW9kYWwsIHZlY0lucG90TW9kZWwgfSBmcm9tIFwiLi90ZW1wXCI7XHJcbmltcG9ydCB7TWF0aFBsdWdpblNldHRpbmdzLCBERUZBVUxUX1NFVFRJTkdTLCBNYXRoUGx1Z2luU2V0dGluZ1RhYix9IGZyb20gXCIuL3NldHRpbmdzXCI7XHJcbmltcG9ydCB7IGNhbGN1bGF0ZUJpbm9tLCBkZWdyZWVzVG9SYWRpYW5zLCBmaW5kQW5nbGVCeUNvc2luZVJ1bGUsIGdldFVzYWJsZURlZ3JlZXMsIHBvbGFyVG9DYXJ0ZXNpYW4sIHJhZGlhbnNUb0RlZ3JlZXMsIHJvdW5kQnlTZXR0aW5ncyB9IGZyb20gXCIuL21hdGhVdGlsaXRpZXMuanNcIjtcclxuaW1wb3J0IHsgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0VGlrempheCwgRm9ybWF0dGluZywgVGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyBOdW1lcmFsc1N1Z2dlc3RvciB9IGZyb20gXCIuL3N1Z2dlc3Rvci5qc1wiO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTWF0aFBsdWdpbiBleHRlbmRzIFBsdWdpbiB7XHJcbiAgc2V0dGluZ3M6IE1hdGhQbHVnaW5TZXR0aW5ncztcclxuICB0aWt6UHJvY2Vzc29yOiBUaWt6amF4XHJcbiAgYXN5bmMgb25sb2FkKCkge1xyXG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcclxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTWF0aFBsdWdpblNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcclxuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcIm1hdGgtZW5naW5lXCIsIHRoaXMucHJvY2Vzc01hdGhCbG9jay5iaW5kKHRoaXMpKTtcclxuICAgIHRoaXMucmVnaXN0ZXJDb21tYW5kcygpO1xyXG4gICAgdGhpcy5yZWdpc3RlckVkaXRvclN1Z2dlc3QobmV3IE51bWVyYWxzU3VnZ2VzdG9yKHRoaXMpKTtcclxuXHJcblxyXG4gICAgdGhpcy50aWt6UHJvY2Vzc29yPW5ldyBUaWt6amF4KHRoaXMuYXBwLHRoaXMpXHJcbiAgICBcclxuXHJcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3IucmVhZHlMYXlvdXQoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZWdpc3RlclRpa3pDb2RlQmxvY2soKTtcclxuICB9XHJcbiAgb251bmxvYWQoKSB7XHJcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IudW5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKTtcclxuXHR9XHJcbiAgXHJcbiAgXHJcbiAgcHJpdmF0ZSBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XHJcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZWdpc3RlckNvbW1hbmRzKCkge1xyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwib3Blbi1pbnB1dC1mb3JtXCIsXHJcbiAgICAgIG5hbWU6IFwiT3BlbiBJbnB1dCBGb3JtXCIsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiBuZXcgQ3VzdG9tSW5wdXRNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwidmlldy1zZXNzaW9uLWhpc3RvcnlcIixcclxuICAgICAgbmFtZTogXCJWaWV3IFNlc3Npb24gSGlzdG9yeVwiLFxyXG4gICAgICAvL2NhbGxiYWNrOiAoKSA9PiBuZXcgSGlzdG9yeU1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCksXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcHJvY2Vzc01hdGhCbG9jayhzb3VyY2U6IHN0cmluZywgbWFpbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgIG1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtY29udGFpbmVyXCIpO1xyXG5cclxuICAgIGNvbnN0IHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcclxuICAgIGxldCBza2lwcGVkSW5kZXhlcyA9IDA7XHJcblxyXG4gICAgY29uc3QgZXhwcmVzc2lvbnMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIikubWFwKGxpbmUgPT4gbGluZS50cmltKCkpLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCA9PT0gMCkge3JldHVybjt9XHJcblxyXG4gICAgXHJcbiAgICBleHByZXNzaW9ucy5mb3JFYWNoKChleHByZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgICBsZXQgbGluZUNvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICBsaW5lQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWxpbmUtY29udGFpbmVyXCIsIChpbmRleC1za2lwcGVkSW5kZXhlcykgJSAyID09PSAwID8gXCJtYXRoLXJvdy1ldmVuXCIgOiBcIm1hdGgtcm93LW9kZFwiKTtcclxuICAgICAgY29uc3QgcHJvY2Vzc01hdGggPSBuZXcgUHJvY2Vzc01hdGgoZXhwcmVzc2lvbix1c2VyVmFyaWFibGVzLCB0aGlzLmFwcCxsaW5lQ29udGFpbmVyKTtcclxuICAgICAgcHJvY2Vzc01hdGguaW5pdGlhbGl6ZSgpO1xyXG4gICAgICBpZihwcm9jZXNzTWF0aC5tb2RlIT09XCJ2YXJpYWJsZVwiKXtcclxuICAgICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xyXG4gICAgICAgIG1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgUHJvY2Vzc01hdGgge1xyXG4gIG1hdGhJbnB1dDogYW55O1xyXG4gIHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcclxuICBtb2RlID0gXCJtYXRoXCI7XHJcbiAgcmVzdWx0OiBhbnk7XHJcbiAgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcclxuICBpY29uc0RpdjogSFRNTEVsZW1lbnQ7XHJcbiAgYXBwOiBBcHA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKG1hdGhJbnB1dDogc3RyaW5nLHVzZXJWYXJpYWJsZXM6IGFueSwgYXBwOiBBcHAsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcclxuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xyXG4gICAgdGhpcy51c2VyVmFyaWFibGVzPXVzZXJWYXJpYWJsZXM7XHJcbiAgICB0aGlzLmFwcCA9IGFwcDtcclxuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xyXG4gICAgdGhpcy5pY29uc0RpdiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pY29uc1wiLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBpbml0aWFsaXplKCkge1xyXG4gICAgdGhpcy5hc3NpZ25Nb2RlKCk7XHJcbiAgICB0aGlzLnNldHVwQ29udGFpbmVyKCk7XHJcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xyXG4gICAgdGhpcy5yZW5kZXJNYXRoKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNldHVwQ29udGFpbmVyKCkge1xyXG4gICAgW1wibWF0aC1pbnB1dFwiLCBcIm1hdGgtcmVzdWx0XCJdLmZvckVhY2goY2xhc3NOYW1lID0+IHtcclxuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgZGl2LmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcclxuICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcclxuICAgIH0pO1xyXG4gICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pY29uc0Rpdik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlbmRlck1hdGgoKSB7XHJcbiAgICBjb25zdCBpbnB1dERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1pbnB1dFwiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB0cnkge1xyXG4gICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBiaW5vbU1vZGVsID0gbmV3IEJpbm9tSW5mb01vZGVsKHRoaXMuYXBwLCB0aGlzLm1hdGhJbnB1dCk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gYmlub21Nb2RlbC5nZXRFcXVhbCgpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBbICwgc2lkZUEsIHNpZGVCLCBzaWRlQyBdID0gdGhpcy5tYXRoSW5wdXQubWFwKE51bWJlcik7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9bmV3IFZlY1Byb2Nlc3Nvcih0aGlzLm1hdGhJbnB1dFsxXSx0aGlzLm1hdGhJbnB1dFsyXSx0aGlzLm1hdGhJbnB1dFszXSk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgdGlrekdyYXBoKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5ncmFwaCkpO1xyXG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9dGhpcy5yZXN1bHQucmVzdWx0XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gbmV3IE1hdGhQcmFpc2VyKHRoaXMubWF0aElucHV0KTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5tYXRoSW5wdXQ9dGhpcy5yZXN1bHQuaW5wdXQ7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IHRoaXMucmVzdWx0LnNvbHV0aW9uO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICB0aGlzLmFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2LCByZXN1bHREaXYsIHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCI/dGhpcy5tYXRoSW5wdXQ6dGhpcy5tYXRoSW5wdXRbMF0sIHJvdW5kQnlTZXR0aW5ncyh0aGlzLnJlc3VsdCkpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIFxyXG4gICAgICB0aGlzLmRpc3BsYXlFcnJvcihpbnB1dERpdiwgcmVzdWx0RGl2LCBlcnIpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiVGhlIGluaXRpYWwgcHJhaXNpbmcgZmFpbGVkXCIsZXJyKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBpbnB1dDogc3RyaW5nLCByZXN1bHQ6IGFueSkge1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFwkeyR7aW5wdXR9fSRgLCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIGNvbnN0IHJlc3VsdE91dHB1dCA9IC8odHJ1ZXxmYWxzZSkvLnRlc3QocmVzdWx0KSA/IHJlc3VsdCA6IGBcXCR7JHtyZXN1bHR9fSRgO1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihyZXN1bHRPdXRwdXQsIHJlc3VsdERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZGlzcGxheUVycm9yKGlucHV0RGl2OiBIVE1MRWxlbWVudCwgcmVzdWx0RGl2OiBIVE1MRWxlbWVudCwgZXJyOiBFcnJvcikge1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bih0aGlzLm1hdGhJbnB1dCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiZXJyb3ItdGV4dFwiPiR7ZXJyLm1lc3NhZ2V9PC9zcGFuPmA7XHJcbiAgICB0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1lcnJvci1saW5lXCIpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3NpZ25Nb2RlKCkge1xyXG4gICAgY29uc3QgcmVnZXhMaXN0ID0gR2V0TWF0aENvbnRleHRSZWdleCgpO1xyXG4gICAgY29uc3QgbWF0Y2hPYmplY3QgPSByZWdleExpc3QuZmluZChyZWdleE9iaiA9PiByZWdleE9iai5yZWdleC50ZXN0KHRoaXMubWF0aElucHV0KSk7XHJcbiAgICBpZiAobWF0Y2hPYmplY3QpIHtcclxuICAgICAgdGhpcy5tb2RlID0gbWF0Y2hPYmplY3QudmFsdWU7XHJcbiAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQubWF0Y2gobWF0Y2hPYmplY3QucmVnZXgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRJbmZvTW9kYWwobW9kYWw6IGFueSkge1xyXG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pbmZvLWljb25cIixcclxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxyXG4gICAgfSk7XHJcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XHJcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGREZWJ1Z01vZGVsKG1vZGFsOiBhbnkpIHtcclxuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxyXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5CeXCIsXHJcbiAgICB9KTtcclxuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcclxuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlcygpIHtcclxuICAgIGlmICh0aGlzLm1vZGU9PT1cInZhcmlhYmxlXCIpIHtcclxuICAgICAgdGhpcy5oYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpIHtcclxuICAgIGNvbnN0IFtfLHZhcmlhYmxlLCB2YWx1ZV0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoKHBhcnQ6IHN0cmluZykgPT4gcGFydC50cmltKCkpO1xyXG4gICAgaWYgKCF2YXJpYWJsZSB8fCAhdmFsdWUpIHtcclxuICAgICAgY29uc29sZS53YXJuKGBJbnZhbGlkIHZhcmlhYmxlIGRlY2xhcmF0aW9uOiAke3RoaXMubWF0aElucHV0fWApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBleGlzdGluZ1ZhckluZGV4ID0gdGhpcy51c2VyVmFyaWFibGVzLmZpbmRJbmRleCh2ID0+IHYudmFyaWFibGUgPT09IHZhcmlhYmxlKTtcclxuICAgIGlmIChleGlzdGluZ1ZhckluZGV4ICE9PSAtMSkge1xyXG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXNbZXhpc3RpbmdWYXJJbmRleF0udmFsdWUgPSB2YWx1ZTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlcy5wdXNoKHsgdmFyaWFibGUsIHZhbHVlIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCl7XHJcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXMuZm9yRWFjaCgoeyB2YXJpYWJsZSwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICBpZiAodHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5yZXBsYWNlKHZhcmlhYmxlLCB2YWx1ZSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIEdldE1hdGhDb250ZXh0UmVnZXgoKSB7XHJcbiAgcmV0dXJuIFtcclxuICAgIHsgcmVnZXg6IC9iaW5vbVxcKChcXGQrKSwoXFxkKyksKFxcZCspXFwpLywgdmFsdWU6IFwiYmlub21cIiB9LFxyXG4gICAgeyByZWdleDogL3ZlYyhbKy1dezAsMn0pXFwoKFtcXGQuKy1dK1s6LF1bXFxkListXSspXFwpKFtcXGQuKy1dKikvLCB2YWx1ZTogXCJ2ZWNcIiB9LFxyXG4gICAgeyByZWdleDogL2Nvc1xcKChbXFxkLl0rKSwoW1xcZC5dKyksKFtcXGQuXSspXFwpLywgdmFsdWU6IFwiY29zXCIgfSxcclxuICAgIHsgcmVnZXg6IC92YXJcXHMqKFtcXHddKylcXHMqPVxccyooW1xcZC5dKykvLCB2YWx1ZTogXCJ2YXJpYWJsZVwiIH0sXHJcbiAgXTtcclxufVxyXG5cclxuXHJcbmNsYXNzIFZlY1Byb2Nlc3NvciB7XHJcbiAgdXNlcklucHV0OiBhbnk7XHJcbiAgZW52aXJvbm1lbnQ6IHsgWDogc3RyaW5nOyBZOiBzdHJpbmcgfTtcclxuICB2ZWNJbmZvID0gbmV3IE1hdGhJbmZvKCk7XHJcbiAgYXhpczogQXhpcztcclxuICBtb2RpZmllcjogbnVtYmVyO1xyXG4gIHJlc3VsdDogc3RyaW5nO1xyXG4gIGdyYXBoPzogRm9ybWF0VGlrempheDtcclxuXHJcbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgbWF0aElucHV0OiBzdHJpbmcsIG1vZGlmaWVyOiBzdHJpbmcpIHtcclxuICAgIGNvbnN0IG1hdGNoID0gZW52aXJvbm1lbnQubWF0Y2goLyhbKy1dPykoWystXT8pLyk7XHJcbiAgICB0aGlzLmVudmlyb25tZW50ID0geyBYOiBtYXRjaD8uWzFdID8/IFwiK1wiLCBZOiBtYXRjaD8uWzJdID8/IFwiK1wiIH07XHJcblxyXG4gICAgdGhpcy5tb2RpZmllciA9IG1vZGlmaWVyLmxlbmd0aCA+IDAgPyBnZXRVc2FibGVEZWdyZWVzKE51bWJlcihtb2RpZmllcikpIDogMDtcclxuXHJcbiAgICB0aGlzLmF4aXM9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0aElucHV0KVxyXG4gICAgdGhpcy5hZGRHcmFwaCgpO1xyXG4gIH1cclxuXHJcbiAgXHJcbiAgYWRkR3JhcGgoKSB7XHJcbiAgICBjb25zdCB0YXJnZXRTaXplID0gMTA7XHJcbiAgICBjb25zdCBtYXhDb21wb25lbnQgPSBNYXRoLm1heChNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWCksIE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKSk7XHJcblxyXG4gICAgLy8gRGV0ZXJtaW5lIHNjYWxpbmcgZmFjdG9yXHJcbiAgICBsZXQgc2NhbGUgPSAxO1xyXG4gICAgaWYgKG1heENvbXBvbmVudCA8IHRhcmdldFNpemUpIHtcclxuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xyXG4gICAgfSBlbHNlIGlmIChtYXhDb21wb25lbnQgPiB0YXJnZXRTaXplKSB7XHJcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcclxuICAgIH1cclxuICAgIC8vIGkgbmVlZCB0byBtYWtlIGl0IFwidG8gWCBheGlzXCJcclxuICAgIC8vY29uc3QgdmVjdG9yQW5nbGUgPSBnZXRVc2FibGVEZWdyZWVzKHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuMihzY2FsZWRZLCBzY2FsZWRYKSkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygpLmFkZENhcnRlc2lhbigwLDApO1xyXG4gICAgY29uc3QgYzE9bmV3IENvb3JkaW5hdGUoKS5heGlzLmFkZENhcnRlc2lhbih0aGlzLmF4aXMuY2FydGVzaWFuWCwwKVxyXG5cclxuICAgIHRoaXMuZ3JhcGg9bmV3IEZvcm1hdFRpa3pqYXgoW1xyXG4gICAgICBuZXcgRm9ybWF0dGluZygpLnF1aWNrQWRkKFwiZ2xvYm9sXCIse2NvbG9yOiBcIndoaXRlXCIsc2NhbGU6IFwiMVwiLH0pLFxyXG4gICAgICBuZXcgRHJhdyh7Zm9ybWF0dGluZzoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn0sZHJhdzogW2FuY2VyLCctLScsYzEsbmV3IEF4aXMoKV19LHVuZGVmaW5lZCxcImRyYXdcIiwpLFxyXG4gICAgICAvL25ldyBEcmF3KHtmb3JtYXR0aW5nOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifSxkcmF3OiBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSgpLG5ldyBBeGlzKCldfSx1bmRlZmluZWQsXCJkcmF3XCIsKSxcclxuICAgICAgLy9uZXcgRHJhdyh7Zm9ybWF0dGluZzoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn0sZHJhdzogW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoKSxuZXcgQXhpcygpXX0sdW5kZWZpbmVkLFwiZHJhd1wiLCksXHJcbiAgICBdKVxyXG4gICAgXHJcbiAgICAvKiBHZW5lcmF0ZSBMYVRlWCBjb2RlIGZvciB2ZWN0b3IgY29tcG9uZW50cyBhbmQgbWFpbiB2ZWN0b3JcclxuICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxyXG5cclxuICAgICAgJSBBbmdsZSBBbm5vdGF0aW9uXHJcbiAgICAgICVcXGFuZ3tYfXthbmN9e3ZlY317fXske3JvdW5kQnlTZXR0aW5ncyh2ZWN0b3JBbmdsZSl9JF57XFxjaXJjfSR9XHJcbiAgICBgLnJlcGxhY2UoL15cXHMrL2dtLCBcIlwiKTsqL1xyXG5cclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJTY2FsaW5nIGZhY3RvclwiLCBzY2FsZSk7XHJcbiAgICAvL3RoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJUaWtaIGdyYXBoIGNvZGVcIiwgdGlrekNvZGUpO1xyXG4gICAgLy90aGlzLmdyYXBoID0gdGlrekNvZGU7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIHRpa3pHcmFwaCBleHRlbmRzIE1vZGFsIHtcclxuICB0aWt6OiBGb3JtYXRUaWt6amF4XHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsdGlrekNvZGU6IEZvcm1hdFRpa3pqYXgpe1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMudGlrej10aWt6Q29kZTtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IHNjcmlwdCA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xyXG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XHJcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgc2NyaXB0LnNldFRleHQodGhpcy50aWt6LmdldENvZGUoKSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGFjdGlvbkJ1dHRvbiA9IHRoaXMuY29udGVudEVsLmNyZWF0ZUVsKFwiYnV0dG9uXCIsIHsgdGV4dDogXCJDb3B5IGdyYXBoXCIsIGNsczogXCJpbmZvLW1vZGFsLUNvcHktYnV0dG9uXCIgfSk7XHJcblxyXG4gICAgYWN0aW9uQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XHJcbiAgICAgIG5hdmlnYXRvci5jbGlwYm9hcmQud3JpdGVUZXh0KHRoaXMudGlrei5nZXRDb2RlKCkpO1xyXG4gICAgICBuZXcgTm90aWNlKFwiR3JhcGggY29waWVkIHRvIGNsaXBib2FyZCFcIik7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgb25DbG9zZSgpOiB2b2lkIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgICBjb250ZW50RWwuZW1wdHkoKTtcclxuICB9XHJcbn1cclxuXHJcbnR5cGUgRGlzdHJpYnV0aW9uVHlwZSA9ICdub3JtYWwnIHwgJ2Jpbm9taWFsJyB8ICdwb2lzc29uJztcclxuXHJcbmNsYXNzIERpc3RyaWJ1dGlvbiB7XHJcbiAgcHJpdmF0ZSB0eXBlOiBEaXN0cmlidXRpb25UeXBlO1xyXG4gIHByaXZhdGUgbWVhbjogbnVtYmVyO1xyXG4gIHByaXZhdGUgdmFyaWFuY2U6IG51bWJlcjtcclxuICBwcml2YXRlIHN0ZERldjogbnVtYmVyO1xyXG5cclxuICAvLyBGb3IgQmlub21pYWwgRGlzdHJpYnV0aW9uXHJcbiAgcHJpdmF0ZSB0cmlhbHM6IG51bWJlcjtcclxuICBwcml2YXRlIHByb2JhYmlsaXR5OiBudW1iZXI7XHJcblxyXG4gIC8vIEZvciBQb2lzc29uIERpc3RyaWJ1dGlvblxyXG4gIHByaXZhdGUgbGFtYmRhOiBudW1iZXI7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHR5cGU6IERpc3RyaWJ1dGlvblR5cGUsIHBhcmFtczogUmVjb3JkPHN0cmluZywgbnVtYmVyPikge1xyXG4gICAgdGhpcy50eXBlID0gdHlwZTtcclxuXHJcbiAgICAvLyBJbml0aWFsaXplIGJhc2VkIG9uIGRpc3RyaWJ1dGlvbiB0eXBlXHJcbiAgICBzd2l0Y2ggKHR5cGUpIHtcclxuICAgICAgY2FzZSAnbm9ybWFsJzpcclxuICAgICAgICB0aGlzLm1lYW4gPSBwYXJhbXMubWVhbiB8fCAwO1xyXG4gICAgICAgIHRoaXMuc3RkRGV2ID0gcGFyYW1zLnN0ZERldiB8fCAxO1xyXG4gICAgICAgIHRoaXMudmFyaWFuY2UgPSB0aGlzLnN0ZERldiAqKiAyO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdiaW5vbWlhbCc6XHJcbiAgICAgICAgdGhpcy50cmlhbHMgPSBwYXJhbXMudHJpYWxzIHx8IDE7XHJcbiAgICAgICAgdGhpcy5wcm9iYWJpbGl0eSA9IHBhcmFtcy5wcm9iYWJpbGl0eSB8fCAwLjU7XHJcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy50cmlhbHMgKiB0aGlzLnByb2JhYmlsaXR5O1xyXG4gICAgICAgIHRoaXMudmFyaWFuY2UgPSB0aGlzLm1lYW4gKiAoMSAtIHRoaXMucHJvYmFiaWxpdHkpO1xyXG4gICAgICAgIHRoaXMuc3RkRGV2ID0gTWF0aC5zcXJ0KHRoaXMudmFyaWFuY2UpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdwb2lzc29uJzpcclxuICAgICAgICB0aGlzLmxhbWJkYSA9IHBhcmFtcy5sYW1iZGEgfHwgMTtcclxuICAgICAgICB0aGlzLm1lYW4gPSB0aGlzLmxhbWJkYTtcclxuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5sYW1iZGE7XHJcbiAgICAgICAgdGhpcy5zdGREZXYgPSBNYXRoLnNxcnQodGhpcy52YXJpYW5jZSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBkaXN0cmlidXRpb24gdHlwZScpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2FsY3VsYXRlIHRoZSBwcm9iYWJpbGl0eSBkZW5zaXR5IGZ1bmN0aW9uIChQREYpIGZvciB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbi5cclxuICAgKi9cclxuICBwdWJsaWMgbm9ybWFsUERGKHg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBpZiAodGhpcy50eXBlICE9PSAnbm9ybWFsJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BERiBvbmx5IGFwcGxpZXMgdG8gdGhlIE5vcm1hbCBEaXN0cmlidXRpb24nKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGV4cFBhcnQgPSBNYXRoLmV4cCgtKCh4IC0gdGhpcy5tZWFuKSAqKiAyKSAvICgyICogdGhpcy52YXJpYW5jZSkpO1xyXG4gICAgcmV0dXJuICgxIC8gKHRoaXMuc3RkRGV2ICogTWF0aC5zcXJ0KDIgKiBNYXRoLlBJKSkpICogZXhwUGFydDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENhbGN1bGF0ZSB0aGUgY3VtdWxhdGl2ZSBkaXN0cmlidXRpb24gZnVuY3Rpb24gKENERikgZm9yIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uLlxyXG4gICAqL1xyXG4gIHB1YmxpYyBub3JtYWxDREYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdub3JtYWwnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ0RGIG9ubHkgYXBwbGllcyB0byB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbicpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIDAuNSAqICgxICsgdGhpcy5lcmYoKHggLSB0aGlzLm1lYW4pIC8gKE1hdGguc3FydCgyKSAqIHRoaXMuc3RkRGV2KSkpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2FsY3VsYXRlIHRoZSBwcm9iYWJpbGl0eSBtYXNzIGZ1bmN0aW9uIChQTUYpIGZvciB0aGUgQmlub21pYWwgRGlzdHJpYnV0aW9uLlxyXG4gICAqL1xyXG4gIHB1YmxpYyBiaW5vbWlhbFBNRih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ2Jpbm9taWFsJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BNRiBvbmx5IGFwcGxpZXMgdG8gdGhlIEJpbm9taWFsIERpc3RyaWJ1dGlvbicpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgY29tYmluYXRpb24gPSB0aGlzLmZhY3RvcmlhbCh0aGlzLnRyaWFscykgL1xyXG4gICAgICAodGhpcy5mYWN0b3JpYWwoeCkgKiB0aGlzLmZhY3RvcmlhbCh0aGlzLnRyaWFscyAtIHgpKTtcclxuICAgIHJldHVybiBjb21iaW5hdGlvbiAqIE1hdGgucG93KHRoaXMucHJvYmFiaWxpdHksIHgpICogTWF0aC5wb3coMSAtIHRoaXMucHJvYmFiaWxpdHksIHRoaXMudHJpYWxzIC0geCk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDYWxjdWxhdGUgdGhlIHByb2JhYmlsaXR5IG1hc3MgZnVuY3Rpb24gKFBNRikgZm9yIHRoZSBQb2lzc29uIERpc3RyaWJ1dGlvbi5cclxuICAgKi9cclxuICBwdWJsaWMgcG9pc3NvblBNRih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ3BvaXNzb24nKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignUE1GIG9ubHkgYXBwbGllcyB0byB0aGUgUG9pc3NvbiBEaXN0cmlidXRpb24nKTtcclxuICAgIH1cclxuICAgIHJldHVybiAoTWF0aC5wb3codGhpcy5sYW1iZGEsIHgpICogTWF0aC5leHAoLXRoaXMubGFtYmRhKSkgLyB0aGlzLmZhY3RvcmlhbCh4KTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEVycm9yIGZ1bmN0aW9uIGFwcHJveGltYXRpb24gZm9yIE5vcm1hbCBEaXN0cmlidXRpb24gQ0RGLlxyXG4gICAqL1xyXG4gIHByaXZhdGUgZXJmKHg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBjb25zdCBzaWduID0geCA8IDAgPyAtMSA6IDE7XHJcbiAgICBjb25zdCBhID0gMC4zMjc1OTExO1xyXG4gICAgY29uc3QgcCA9IDAuMjU0ODI5NTkyO1xyXG4gICAgY29uc3QgcSA9IC0wLjI4NDQ5NjczNjtcclxuICAgIGNvbnN0IHIgPSAxLjQyMTQxMzc0MTtcclxuICAgIGNvbnN0IHMgPSAtMS40NTMxNTIwMjc7XHJcbiAgICBjb25zdCB0ID0gMS4wNjE0MDU0Mjk7XHJcbiAgICBjb25zdCB1ID0gMSArIGEgKiBNYXRoLmFicyh4KTtcclxuICAgIGNvbnN0IHBvbHkgPSAoKCgoKHAgKiB1ICsgcSkgKiB1ICsgcikgKiB1ICsgcykgKiB1ICsgdCkgKiB1KTtcclxuICAgIHJldHVybiBzaWduICogKDEgLSBwb2x5ICogTWF0aC5leHAoLXggKiB4KSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBGYWN0b3JpYWwgZnVuY3Rpb24uXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBmYWN0b3JpYWwobjogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmIChuIDwgMCkgcmV0dXJuIE5hTjtcclxuICAgIGxldCByZXN1bHQgPSAxO1xyXG4gICAgZm9yIChsZXQgaSA9IDI7IGkgPD0gbjsgaSsrKSByZXN1bHQgKj0gaTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuY2xhc3MgRGlzdHJpYnV0aW9uTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzID0gMDtcclxuICBwcml2YXRlIGxlc3NFcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBiaWcgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICBjb25zdCBbXywgbiwgaywgcF0gPSBzb3VyY2UubWF0Y2goL1xcZCsvZykhLm1hcChOdW1iZXIpO1xyXG4gICAgdGhpcy5uID0gbjtcclxuICAgIHRoaXMuayA9IGs7XHJcbiAgICB0aGlzLnAgPSBwO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzXCIgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8PSAke3RoaXMua30pID0gJHt0aGlzLmxlc3NFcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gY2FsY3VsYXRlQmlub20odGhpcy5uLCB0aGlzLmssIHRoaXMucCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xyXG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykgdGhpcy5lcXVhbCA9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+IHRoaXMuaykgdGhpcy5iaWcgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmNsYXNzIEJpbm9tSW5mb01vZGVsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHByaXZhdGUgbjogbnVtYmVyO1xyXG4gIHByaXZhdGUgazogbnVtYmVyO1xyXG4gIHByaXZhdGUgcDogbnVtYmVyO1xyXG4gIHByaXZhdGUgZXF1YWwgPSAwO1xyXG4gIHByaXZhdGUgbGVzcyA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xyXG4gIHByaXZhdGUgYmlnID0gMDtcclxuICBwcml2YXRlIGJpZ0VxdWFsID0gMDtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcclxuICAgIHRoaXMubiA9IG47XHJcbiAgICB0aGlzLmsgPSBrO1xyXG4gICAgdGhpcy5wID0gcDtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIHRoaXMuY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpO1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPSAke3RoaXMua30pID0gJHt0aGlzLmVxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID4gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWd9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBnZXRFcXVhbCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcclxuICAgICAgY29uc3QgcHJvYmFiaWxpdHkgPSBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIGksIHRoaXMucCk7XHJcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPCB0aGlzLmspIHRoaXMubGVzcyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPD0gdGhpcy5rKSB0aGlzLmxlc3NFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+PSB0aGlzLmspIHRoaXMuYmlnRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcbiJdfQ==