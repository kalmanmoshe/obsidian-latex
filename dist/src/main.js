import { Plugin, MarkdownRenderer, Modal, Component, Notice, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, MathPluginSettingTab, } from "./settings";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities.js";
import { Axis, Coordinate, Draw, FormatTikzjax, Formatting, Tikzjax } from "./tikzjax/tikzjax";
import { NumeralsSuggestor } from "./suggestor.js";
import { TikzSvg } from "./tikzjax/myTikz.js";
export default class MathPlugin extends Plugin {
    settings;
    tikzProcessor;
    async onload() {
        await this.loadSettings();
        this.tikzProcessor = new Tikzjax(this.app, this);
        this.tikzProcessor.readyLayout();
        this.tikzProcessor.addSyntaxHighlighting();
        this.tikzProcessor.registerTikzCodeBlock();
        this.addSettingTab(new MathPluginSettingTab(this.app, this));
        this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
        this.registerMarkdownCodeBlockProcessor("tikzjax", this.processTikzBlock.bind(this));
        this.registerCommands();
        this.registerEditorSuggest(new NumeralsSuggestor(this));
        // Execute the `a()` method to log and modify all divs
        this.processDivs();
    }
    onunload() {
        this.tikzProcessor.unloadTikZJaxAllWindows();
        this.tikzProcessor.removeSyntaxHighlighting();
    }
    processDivs() {
        const cmLines = document.querySelectorAll('div.cm-line');
        console.log(`Found ${cmLines.length} cm-line div(s).`);
        cmLines.forEach((line) => {
            // Explicitly cast `line` to `HTMLElement`
            const htmlLine = line;
            if (htmlLine.textContent?.startsWith('a')) {
                htmlLine.setAttribute('dir', 'rtl');
                htmlLine.style.backgroundColor = "lightyellow";
            }
        });
    }
    observeDynamicChanges() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === "childList") {
                    mutation.addedNodes.forEach((node) => {
                        if (node instanceof HTMLElement && node.classList.contains('cm-line')) {
                            console.log("Detected a new cm-line element:", node);
                            // Apply changes to the new node
                            if (node.textContent?.startsWith('a')) {
                                node.setAttribute('dir', 'rtl');
                                node.style.backgroundColor = "lightyellow";
                            }
                        }
                    });
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log("Observer is set and running.");
    }
    processTikzBlock(source, container) {
        const svg = new TikzSvg(source);
        const icon = Object.assign(container.createEl("div"), {
            className: "math-debug-icon",
            textContent: "🛈",
        });
        const graph = Object.assign(document.createElement("div"), {
            style: "display: flex; justify-content: center; align-items: center;"
        });
        graph.appendChild(svg.getSvg());
        svg.debugInfo += graph.outerHTML;
        console.log(graph.outerHTML);
        icon.onclick = () => new DebugModal(this.app, svg.debugInfo).open();
        container.appendChild(icon);
        container.appendChild(graph);
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
            callback: () => new VecInputModel(this.app, this).open(),
        });
        this.addCommand({
            id: "view-session-history",
            name: "View Session History",
            //callback: () => new HistoryModal(this.app, this).open(),
        });
        this.addCommand({
            id: "test-mathEngine",
            name: "test math engine",
            callback: () => testMathEngine(),
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
            //if (expression.match(/^\/\//)){}
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
        inputDiv.appendChild(renderMath(input, true));
        //MarkdownRenderer.renderMarkdown(`\${${input}}$`, inputDiv, "", new Component());
        //const resultOutput = /(true|false)/.test(result) ? result : `\${${result}}$`;
        resultDiv.appendChild(renderMath(result.toString(), true));
        //MarkdownRenderer.renderMarkdown(resultOutput, resultDiv, "", new Component());
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
        this.userInput = mathInput;
        const match = environment.match(/([+-]?)([+-]?)/);
        this.environment = { X: match?.[1] ?? "+", Y: match?.[2] ?? "+" };
        this.modifier = modifier.length > 0 ? getUsableDegrees(Number(modifier)) : 0;
        this.axis = new Axis().universal(this.userInput);
        if (!this.axis.polarAngle)
            this.axis.cartesianToPolar();
        this.vecInfo.addDebugInfo("axis", this.axis);
        this.addResult();
        this.addGraph();
    }
    addResult() {
        if (this.userInput.includes(":"))
            this.result = `x = ${this.axis.cartesianX}\\quad,y = ${this.axis.cartesianY}`;
        else
            this.result = `angle = ${this.axis.polarAngle}\\quad,length = ${this.axis.polarLength}`;
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
        const ancer = new Axis(0, 0);
        const draw = [ancer, '--', new Coordinate({ mode: "node-inline", label: this.axis.polarLength.toString() }), this.axis];
        const drawX = [ancer, '--', new Coordinate({ mode: "node-inline", label: this.axis.cartesianX.toString() }), new Axis(this.axis.cartesianX, 0)];
        const drawY = [ancer, '--', new Coordinate({ mode: "node-inline", label: this.axis.cartesianY.toString() }), new Axis(0, this.axis.cartesianY)];
        this.graph = [
            new Formatting("globol", { color: "white", scale: 1, }),
            new Draw({ drawArr: draw, formattingObj: { lineWidth: 1, draw: "red", arror: "-{Stealth}" } }),
            new Draw({ drawArr: drawX, formattingObj: { lineWidth: 1, draw: "yellow", arror: "-{Stealth}" } }),
            new Draw({ drawArr: drawY, formattingObj: { lineWidth: 1, draw: "yellow", arror: "-{Stealth}" } }),
        ];
        this.vecInfo.addDebugInfo("this.graph", JSON.stringify(this.graph.tokens, null, 1));
        this.vecInfo.addDebugInfo("this.graph.toString()\n", JSON.stringify(this.graph.toString()));
        /* Generate LaTeX code for vector components and main vector
        const t = String.raw`
    
          % Angle Annotation
          %\ang{X}{anc}{vec}{}{${roundBySettings(vectorAngle)}$^{\circ}$}
        `.replace(/^\s+/gm, "");*/
        this.vecInfo.addDebugInfo("Scaling factor", scale);
    }
}
class tikzGraph extends Modal {
    tikz;
    constructor(app, tikzCode) {
        super(app);
        this.tikz = new FormatTikzjax(tikzCode);
    }
    onOpen() {
        const { contentEl } = this;
        const code = this.tikz;
        const script = contentEl.createEl("script");
        script.setAttribute("type", "text/tikz");
        script.setAttribute("data-show-console", "true");
        script.setText(code.getCode());
        const actionButton = contentEl.createEl("button", { text: "Copy graph", cls: "info-modal-Copy-button" });
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
    x;
    mu;
    sigma;
    variance;
    // For Binomial Distribution
    trials;
    probability;
    // For Poisson Distribution
    lambda;
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
function testMathEngine() {
    const expressions = [
        { expression: String.raw `2 \frac{(5-3)34}{\sqrt{2^{2}}}0.5`, expectedOutput: '34' },
        { expression: String.raw `(x+1)(x+3)=2`, expectedOutput: 'x_1=-0.26795,x_2=-3.73205' },
        { expression: String.raw `\frac{132}{1260+x^{2}}=0.05`, expectedOutput: 'x_1=-37.14835,x_2=37.14835' },
    ];
    const results = [];
    try {
        expressions.forEach(expression => {
            const math = new MathPraiser(expression.expression);
            if (math.solution !== expression.expectedOutput) {
                results.push({ expression: expression.expression, expectedOutput: expression.expectedOutput, actualOutput: math.solution });
            }
        });
    }
    catch (e) {
        console.log(e);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEVBQThCLFVBQVUsRUFBZSxNQUFNLFVBQVUsQ0FBQztBQUUvSSxPQUFPLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDdkQsT0FBTyxFQUE4QyxhQUFhLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDbkYsT0FBTyxFQUFxQixnQkFBZ0IsRUFBRSxvQkFBb0IsR0FBRSxNQUFNLFlBQVksQ0FBQztBQUN2RixPQUFPLEVBQUUsY0FBYyxFQUFvQixxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBc0MsZUFBZSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDcEssT0FBTyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDL0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDbkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBUTlDLE1BQU0sQ0FBQyxPQUFPLE9BQU8sVUFBVyxTQUFRLE1BQU07SUFDNUMsUUFBUSxDQUFxQjtJQUM3QixhQUFhLENBQVM7SUFDdEIsS0FBSyxDQUFDLE1BQU07UUFDVixNQUFNLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsYUFBYSxHQUFDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUMsSUFBSSxDQUFDLENBQUE7UUFDN0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUUs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Q0FBQyxDQUFDO0tBQ0o7SUFDRCxPQUFNLENBQUMsRUFBQztRQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7S0FDZjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1BsdWdpbiwgTWFya2Rvd25SZW5kZXJlciwgQXBwLCBNb2RhbCwgQ29tcG9uZW50LCBTZXR0aW5nLE5vdGljZSwgV29ya3NwYWNlV2luZG93LGxvYWRNYXRoSmF4LHJlbmRlck1hdGgsIE1hcmtkb3duVmlld30gZnJvbSBcIm9ic2lkaWFuXCI7XHJcblxyXG5pbXBvcnQgeyBNYXRoSW5mbywgTWF0aFByYWlzZXIgfSBmcm9tIFwiLi9tYXRoRW5naW5lLmpzXCI7XHJcbmltcG9ydCB7IEluZm9Nb2RhbCwgRGVidWdNb2RhbCB9IGZyb20gXCIuL2Rlc3BseU1vZGFsc1wiO1xyXG5pbXBvcnQgeyBDdXN0b21JbnB1dE1vZGFsLCBIaXN0b3J5TW9kYWwsIElucHV0TW9kYWwsIFZlY0lucHV0TW9kZWwgfSBmcm9tIFwiLi90ZW1wXCI7XHJcbmltcG9ydCB7TWF0aFBsdWdpblNldHRpbmdzLCBERUZBVUxUX1NFVFRJTkdTLCBNYXRoUGx1Z2luU2V0dGluZ1RhYix9IGZyb20gXCIuL3NldHRpbmdzXCI7XHJcbmltcG9ydCB7IGNhbGN1bGF0ZUJpbm9tLCBkZWdyZWVzVG9SYWRpYW5zLCBmaW5kQW5nbGVCeUNvc2luZVJ1bGUsIGdldFVzYWJsZURlZ3JlZXMsIHBvbGFyVG9DYXJ0ZXNpYW4sIHJhZGlhbnNUb0RlZ3JlZXMsIHJvdW5kQnlTZXR0aW5ncyB9IGZyb20gXCIuL21hdGhVdGlsaXRpZXMuanNcIjtcclxuaW1wb3J0IHsgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0VGlrempheCwgRm9ybWF0dGluZywgVGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvdGlrempheFwiO1xyXG5pbXBvcnQgeyBOdW1lcmFsc1N1Z2dlc3RvciB9IGZyb20gXCIuL3N1Z2dlc3Rvci5qc1wiO1xyXG5pbXBvcnQgeyBUaWt6U3ZnIH0gZnJvbSBcIi4vdGlrempheC9teVRpa3ouanNcIjtcclxuXHJcbmltcG9ydCB7IEVkaXRvclN0YXRlLCBTZWxlY3Rpb25SYW5nZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdQbHVnaW4sIFZpZXdVcGRhdGUgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5cclxuXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRoUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcclxuICBzZXR0aW5nczogTWF0aFBsdWdpblNldHRpbmdzO1xyXG4gIHRpa3pQcm9jZXNzb3I6IFRpa3pqYXhcclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG4gICAgdGhpcy50aWt6UHJvY2Vzc29yPW5ldyBUaWt6amF4KHRoaXMuYXBwLHRoaXMpXHJcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3IucmVhZHlMYXlvdXQoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZWdpc3RlclRpa3pDb2RlQmxvY2soKTtcclxuICAgIFxyXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBNYXRoUGx1Z2luU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibWF0aC1lbmdpbmVcIiwgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrempheFwiLCB0aGlzLnByb2Nlc3NUaWt6QmxvY2suYmluZCh0aGlzKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcclxuICAgIHRoaXMucmVnaXN0ZXJFZGl0b3JTdWdnZXN0KG5ldyBOdW1lcmFsc1N1Z2dlc3Rvcih0aGlzKSk7XHJcblxyXG4gICAgLy8gRXhlY3V0ZSB0aGUgYGEoKWAgbWV0aG9kIHRvIGxvZyBhbmQgbW9kaWZ5IGFsbCBkaXZzXHJcbiAgICB0aGlzLnByb2Nlc3NEaXZzKCk7XHJcbiAgfVxyXG4gIG9udW5sb2FkKCkge1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XHJcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IucmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCk7XHJcblx0fVxyXG4gIHByb2Nlc3NEaXZzKCkge1xyXG4gICAgY29uc3QgY21MaW5lcyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2Rpdi5jbS1saW5lJyk7XHJcbiAgXHJcbiAgICBjb25zb2xlLmxvZyhgRm91bmQgJHtjbUxpbmVzLmxlbmd0aH0gY20tbGluZSBkaXYocykuYCk7XHJcbiAgXHJcbiAgICBjbUxpbmVzLmZvckVhY2goKGxpbmUpID0+IHtcclxuICAgICAgLy8gRXhwbGljaXRseSBjYXN0IGBsaW5lYCB0byBgSFRNTEVsZW1lbnRgXHJcbiAgICAgIGNvbnN0IGh0bWxMaW5lID0gbGluZSBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgaWYgKGh0bWxMaW5lLnRleHRDb250ZW50Py5zdGFydHNXaXRoKCdhJykpIHtcclxuICAgICAgICBodG1sTGluZS5zZXRBdHRyaWJ1dGUoJ2RpcicsICdydGwnKTsgXHJcbiAgICAgICAgaHRtbExpbmUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJsaWdodHllbGxvd1wiOyBcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIFxyXG4gIG9ic2VydmVEeW5hbWljQ2hhbmdlcygpIHtcclxuICAgIGNvbnN0IG9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9ucykgPT4ge1xyXG4gICAgICBtdXRhdGlvbnMuZm9yRWFjaCgobXV0YXRpb24pID0+IHtcclxuICAgICAgICBpZiAobXV0YXRpb24udHlwZSA9PT0gXCJjaGlsZExpc3RcIikge1xyXG4gICAgICAgICAgbXV0YXRpb24uYWRkZWROb2Rlcy5mb3JFYWNoKChub2RlKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgJiYgbm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NtLWxpbmUnKSkge1xyXG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRGV0ZWN0ZWQgYSBuZXcgY20tbGluZSBlbGVtZW50OlwiLCBub2RlKTtcclxuICAgIFxyXG4gICAgICAgICAgICAgIC8vIEFwcGx5IGNoYW5nZXMgdG8gdGhlIG5ldyBub2RlXHJcbiAgICAgICAgICAgICAgaWYgKG5vZGUudGV4dENvbnRlbnQ/LnN0YXJ0c1dpdGgoJ2EnKSkge1xyXG4gICAgICAgICAgICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoJ2RpcicsICdydGwnKTtcclxuICAgICAgICAgICAgICAgIG5vZGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJsaWdodHllbGxvd1wiO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICBvYnNlcnZlci5vYnNlcnZlKGRvY3VtZW50LmJvZHksIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xyXG4gICAgY29uc29sZS5sb2coXCJPYnNlcnZlciBpcyBzZXQgYW5kIHJ1bm5pbmcuXCIpO1xyXG4gIFxyXG4gIH1cclxuXHJcbiAgcHJvY2Vzc1Rpa3pCbG9jayhzb3VyY2U6IHN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gIGNvbnN0IHN2ZyA9IG5ldyBUaWt6U3ZnKHNvdXJjZSk7XHJcbiAgXHJcbiAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XHJcbiAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgfSk7XHJcbiAgXHJcblxyXG4gIGNvbnN0IGdyYXBoID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICBzdHlsZTogXCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjtcIlxyXG4gIH0pO1xyXG4gIGdyYXBoLmFwcGVuZENoaWxkKHN2Zy5nZXRTdmcoKSk7XHJcbiAgc3ZnLmRlYnVnSW5mbys9Z3JhcGgub3V0ZXJIVE1MXHJcbiAgY29uc29sZS5sb2coZ3JhcGgub3V0ZXJIVE1MKVxyXG4gIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCBzdmcuZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgXHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xyXG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmFwaCk7XHJcblxyXG59XHJcblxyXG5cclxuICBwcml2YXRlIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcclxuICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcclxuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlZ2lzdGVyQ29tbWFuZHMoKSB7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJvcGVuLWlucHV0LWZvcm1cIixcclxuICAgICAgbmFtZTogXCJPcGVuIElucHV0IEZvcm1cIixcclxuICAgICAgY2FsbGJhY2s6ICgpID0+IG5ldyBWZWNJbnB1dE1vZGVsKHRoaXMuYXBwLHRoaXMpLm9wZW4oKSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiBcInZpZXctc2Vzc2lvbi1oaXN0b3J5XCIsXHJcbiAgICAgIG5hbWU6IFwiVmlldyBTZXNzaW9uIEhpc3RvcnlcIixcclxuICAgICAgLy9jYWxsYmFjazogKCkgPT4gbmV3IEhpc3RvcnlNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpLFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJ0ZXN0LW1hdGhFbmdpbmVcIixcclxuICAgICAgbmFtZTogXCJ0ZXN0IG1hdGggZW5naW5lXCIsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PnRlc3RNYXRoRW5naW5lKCksXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcHJvY2Vzc01hdGhCbG9jayhzb3VyY2U6IHN0cmluZywgbWFpbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICAgIG1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtY29udGFpbmVyXCIpO1xyXG4gICAgXHJcbiAgICBjb25zdCB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgICBsZXQgc2tpcHBlZEluZGV4ZXMgPSAwO1xyXG5cclxuICAgIGNvbnN0IGV4cHJlc3Npb25zID0gc291cmNlLnNwbGl0KFwiXFxuXCIpLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKS5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuICAgIGlmIChleHByZXNzaW9ucy5sZW5ndGggPT09IDApIHtyZXR1cm47fVxyXG5cclxuICAgIFxyXG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaCgoZXhwcmVzc2lvbiwgaW5kZXgpID0+IHtcclxuICAgICAgbGV0IGxpbmVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgbGluZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1saW5lLWNvbnRhaW5lclwiLCAoaW5kZXgtc2tpcHBlZEluZGV4ZXMpICUgMiA9PT0gMCA/IFwibWF0aC1yb3ctZXZlblwiIDogXCJtYXRoLXJvdy1vZGRcIik7XHJcbiAgICAgIC8vaWYgKGV4cHJlc3Npb24ubWF0Y2goL15cXC9cXC8vKSl7fVxyXG4gICAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xyXG4gICAgICBwcm9jZXNzTWF0aC5pbml0aWFsaXplKCk7XHJcblxyXG4gICAgICBpZihwcm9jZXNzTWF0aC5tb2RlIT09XCJ2YXJpYWJsZVwiKXtcclxuICAgICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xyXG4gICAgICAgIG1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgUHJvY2Vzc01hdGgge1xyXG4gIG1hdGhJbnB1dDogYW55O1xyXG4gIHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcclxuICBtb2RlID0gXCJtYXRoXCI7XHJcbiAgcmVzdWx0OiBhbnk7XHJcbiAgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcclxuICBpY29uc0RpdjogSFRNTEVsZW1lbnQ7XHJcbiAgYXBwOiBBcHA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKG1hdGhJbnB1dDogc3RyaW5nLHVzZXJWYXJpYWJsZXM6IGFueSwgYXBwOiBBcHAsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcclxuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xyXG4gICAgdGhpcy51c2VyVmFyaWFibGVzPXVzZXJWYXJpYWJsZXM7XHJcbiAgICB0aGlzLmFwcCA9IGFwcDtcclxuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xyXG4gICAgdGhpcy5pY29uc0RpdiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pY29uc1wiLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBpbml0aWFsaXplKCkge1xyXG4gICAgdGhpcy5hc3NpZ25Nb2RlKCk7XHJcbiAgICB0aGlzLnNldHVwQ29udGFpbmVyKCk7XHJcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xyXG4gICAgdGhpcy5yZW5kZXJNYXRoKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNldHVwQ29udGFpbmVyKCkge1xyXG4gICAgW1wibWF0aC1pbnB1dFwiLCBcIm1hdGgtcmVzdWx0XCJdLmZvckVhY2goY2xhc3NOYW1lID0+IHtcclxuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgZGl2LmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcclxuICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcclxuICAgIH0pO1xyXG4gICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pY29uc0Rpdik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlbmRlck1hdGgoKSB7XHJcbiAgICBjb25zdCBpbnB1dERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1pbnB1dFwiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB0cnkge1xyXG4gICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBiaW5vbU1vZGVsID0gbmV3IEJpbm9tSW5mb01vZGVsKHRoaXMuYXBwLCB0aGlzLm1hdGhJbnB1dCk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gYmlub21Nb2RlbC5nZXRFcXVhbCgpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBbICwgc2lkZUEsIHNpZGVCLCBzaWRlQyBdID0gdGhpcy5tYXRoSW5wdXQubWFwKE51bWJlcik7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9bmV3IFZlY1Byb2Nlc3Nvcih0aGlzLm1hdGhJbnB1dFsxXSx0aGlzLm1hdGhJbnB1dFsyXSx0aGlzLm1hdGhJbnB1dFszXSk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgdGlrekdyYXBoKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5ncmFwaCkpO1xyXG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9dGhpcy5yZXN1bHQucmVzdWx0XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gbmV3IE1hdGhQcmFpc2VyKHRoaXMubWF0aElucHV0KTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5tYXRoSW5wdXQ9dGhpcy5yZXN1bHQuaW5wdXQ7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IHRoaXMucmVzdWx0LnNvbHV0aW9uO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICB0aGlzLmFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2LCByZXN1bHREaXYsIHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCI/dGhpcy5tYXRoSW5wdXQ6dGhpcy5tYXRoSW5wdXRbMF0sIHJvdW5kQnlTZXR0aW5ncyh0aGlzLnJlc3VsdCkpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIHRoaXMuZGlzcGxheUVycm9yKGlucHV0RGl2LCByZXN1bHREaXYsIGVycik7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaGUgaW5pdGlhbCBwcmFpc2luZyBmYWlsZWRcIixlcnIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGlucHV0OiBzdHJpbmcsIHJlc3VsdDogYW55KSB7XHJcbiAgICBpbnB1dERpdi5hcHBlbmRDaGlsZChyZW5kZXJNYXRoKGlucHV0LHRydWUpKVxyXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCR7JHtpbnB1dH19JGAsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gICAgLy9jb25zdCByZXN1bHRPdXRwdXQgPSAvKHRydWV8ZmFsc2UpLy50ZXN0KHJlc3VsdCkgPyByZXN1bHQgOiBgXFwkeyR7cmVzdWx0fX0kYDtcclxuICAgIHJlc3VsdERpdi5hcHBlbmRDaGlsZChyZW5kZXJNYXRoKHJlc3VsdC50b1N0cmluZygpLHRydWUpKVxyXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHJlc3VsdE91dHB1dCwgcmVzdWx0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBkaXNwbGF5RXJyb3IoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBlcnI6IEVycm9yKSB7XHJcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHRoaXMubWF0aElucHV0LCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+JHtlcnIubWVzc2FnZX08L3NwYW4+YDtcclxuICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWVycm9yLWxpbmVcIik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzc2lnbk1vZGUoKSB7XHJcbiAgICBjb25zdCByZWdleExpc3QgPSBHZXRNYXRoQ29udGV4dFJlZ2V4KCk7XHJcbiAgICBjb25zdCBtYXRjaE9iamVjdCA9IHJlZ2V4TGlzdC5maW5kKHJlZ2V4T2JqID0+IHJlZ2V4T2JqLnJlZ2V4LnRlc3QodGhpcy5tYXRoSW5wdXQpKTtcclxuICAgIGlmIChtYXRjaE9iamVjdCkge1xyXG4gICAgICB0aGlzLm1vZGUgPSBtYXRjaE9iamVjdC52YWx1ZTtcclxuICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5tYXRjaChtYXRjaE9iamVjdC5yZWdleCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZEluZm9Nb2RhbChtb2RhbDogYW55KSB7XHJcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWluZm8taWNvblwiLFxyXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgICB9KTtcclxuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcclxuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZERlYnVnTW9kZWwobW9kYWw6IGFueSkge1xyXG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICAgIHRleHRDb250ZW50OiBcIvCfkJ5cIixcclxuICAgIH0pO1xyXG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xyXG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVzKCkge1xyXG4gICAgaWYgKHRoaXMubW9kZT09PVwidmFyaWFibGVcIikge1xyXG4gICAgICB0aGlzLmhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMucmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCkge1xyXG4gICAgY29uc3QgW18sdmFyaWFibGUsIHZhbHVlXSA9IHRoaXMubWF0aElucHV0Lm1hcCgocGFydDogc3RyaW5nKSA9PiBwYXJ0LnRyaW0oKSk7XHJcbiAgICBpZiAoIXZhcmlhYmxlIHx8ICF2YWx1ZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYEludmFsaWQgdmFyaWFibGUgZGVjbGFyYXRpb246ICR7dGhpcy5tYXRoSW5wdXR9YCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGV4aXN0aW5nVmFySW5kZXggPSB0aGlzLnVzZXJWYXJpYWJsZXMuZmluZEluZGV4KHYgPT4gdi52YXJpYWJsZSA9PT0gdmFyaWFibGUpO1xyXG4gICAgaWYgKGV4aXN0aW5nVmFySW5kZXggIT09IC0xKSB7XHJcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlc1tleGlzdGluZ1ZhckluZGV4XS52YWx1ZSA9IHZhbHVlO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy51c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZSwgdmFsdWUgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKXtcclxuICAgIHRoaXMudXNlclZhcmlhYmxlcy5mb3JFYWNoKCh7IHZhcmlhYmxlLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0LnJlcGxhY2UodmFyaWFibGUsIHZhbHVlKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gR2V0TWF0aENvbnRleHRSZWdleCgpIHtcclxuICByZXR1cm4gW1xyXG4gICAgeyByZWdleDogL2Jpbm9tXFwoKFxcZCspLChcXGQrKSwoXFxkKylcXCkvLCB2YWx1ZTogXCJiaW5vbVwiIH0sXHJcbiAgICB7IHJlZ2V4OiAvdmVjKFsrLV17MCwyfSlcXCgoW1xcZC4rLV0rWzosXVtcXGQuKy1dKylcXCkoW1xcZC4rLV0qKS8sIHZhbHVlOiBcInZlY1wiIH0sXHJcbiAgICB7IHJlZ2V4OiAvY29zXFwoKFtcXGQuXSspLChbXFxkLl0rKSwoW1xcZC5dKylcXCkvLCB2YWx1ZTogXCJjb3NcIiB9LFxyXG4gICAgeyByZWdleDogL3ZhclxccyooW1xcd10rKVxccyo9XFxzKihbXFxkLl0rKS8sIHZhbHVlOiBcInZhcmlhYmxlXCIgfSxcclxuICBdO1xyXG59XHJcblxyXG5cclxuY2xhc3MgVmVjUHJvY2Vzc29yIHtcclxuICB1c2VySW5wdXQ6IGFueTtcclxuICBlbnZpcm9ubWVudDogeyBYOiBzdHJpbmc7IFk6IHN0cmluZyB9O1xyXG4gIHZlY0luZm8gPSBuZXcgTWF0aEluZm8oKTtcclxuICBheGlzOiBBeGlzO1xyXG4gIG1vZGlmaWVyOiBudW1iZXI7XHJcbiAgcmVzdWx0OiBzdHJpbmc7XHJcbiAgZ3JhcGg/OiBhbnk7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGVudmlyb25tZW50OiBzdHJpbmcsIG1hdGhJbnB1dDogc3RyaW5nLCBtb2RpZmllcjogc3RyaW5nKSB7XHJcbiAgICB0aGlzLnVzZXJJbnB1dD1tYXRoSW5wdXQ7XHJcbiAgICBjb25zdCBtYXRjaCA9IGVudmlyb25tZW50Lm1hdGNoKC8oWystXT8pKFsrLV0/KS8pO1xyXG4gICAgdGhpcy5lbnZpcm9ubWVudCA9IHsgWDogbWF0Y2g/LlsxXSA/PyBcIitcIiwgWTogbWF0Y2g/LlsyXSA/PyBcIitcIiB9O1xyXG5cclxuICAgIHRoaXMubW9kaWZpZXIgPSBtb2RpZmllci5sZW5ndGggPiAwID8gZ2V0VXNhYmxlRGVncmVlcyhOdW1iZXIobW9kaWZpZXIpKSA6IDA7XHJcblxyXG4gICAgdGhpcy5heGlzPW5ldyBBeGlzKCkudW5pdmVyc2FsKHRoaXMudXNlcklucHV0KVxyXG4gICAgaWYgKCF0aGlzLmF4aXMucG9sYXJBbmdsZSlcclxuICAgICAgdGhpcy5heGlzLmNhcnRlc2lhblRvUG9sYXIoKTtcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJheGlzXCIsdGhpcy5heGlzKTtcclxuICAgIHRoaXMuYWRkUmVzdWx0KCk7XHJcbiAgICB0aGlzLmFkZEdyYXBoKCk7XHJcbiAgfVxyXG4gIGFkZFJlc3VsdCgpe1xyXG4gICAgaWYgKHRoaXMudXNlcklucHV0LmluY2x1ZGVzKFwiOlwiKSlcclxuICAgICAgdGhpcy5yZXN1bHQ9YHggPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5YfVxcXFxxdWFkLHkgPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5ZfWBcclxuICAgIGVsc2VcclxuICAgICAgdGhpcy5yZXN1bHQ9YGFuZ2xlID0gJHt0aGlzLmF4aXMucG9sYXJBbmdsZX1cXFxccXVhZCxsZW5ndGggPSAke3RoaXMuYXhpcy5wb2xhckxlbmd0aH1gXHJcbiAgfVxyXG4gIFxyXG4gIGFkZEdyYXBoKCkge1xyXG4gICAgY29uc3QgdGFyZ2V0U2l6ZSA9IDEwO1xyXG4gICAgY29uc3QgbWF4Q29tcG9uZW50ID0gTWF0aC5tYXgoTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblgpLCBNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWSkpO1xyXG5cclxuICAgIC8vIERldGVybWluZSBzY2FsaW5nIGZhY3RvclxyXG4gICAgbGV0IHNjYWxlID0gMTtcclxuICAgIGlmIChtYXhDb21wb25lbnQgPCB0YXJnZXRTaXplKSB7XHJcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcclxuICAgIH0gZWxzZSBpZiAobWF4Q29tcG9uZW50ID4gdGFyZ2V0U2l6ZSkge1xyXG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XHJcbiAgICB9XHJcbiAgICAvLyBpIG5lZWQgdG8gbWFrZSBpdCBcInRvIFggYXhpc1wiXHJcbiAgICAvL2NvbnN0IHZlY3RvckFuZ2xlID0gZ2V0VXNhYmxlRGVncmVlcyhyYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbjIoc2NhbGVkWSwgc2NhbGVkWCkpKTtcclxuICAgIFxyXG4gICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoMCwwKTtcclxuXHJcblxyXG4gICAgY29uc3QgZHJhdz0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMucG9sYXJMZW5ndGgudG9TdHJpbmcoKX0pLHRoaXMuYXhpc107XHJcbiAgICBjb25zdCBkcmF3WD0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWC50b1N0cmluZygpfSksbmV3IEF4aXModGhpcy5heGlzLmNhcnRlc2lhblgsMCldO1xyXG4gICAgY29uc3QgZHJhd1k9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblkudG9TdHJpbmcoKX0pLG5ldyBBeGlzKDAsdGhpcy5heGlzLmNhcnRlc2lhblkpXTtcclxuXHJcbiAgICB0aGlzLmdyYXBoPVtcclxuICAgICAgbmV3IEZvcm1hdHRpbmcoXCJnbG9ib2xcIix7Y29sb3I6IFwid2hpdGVcIixzY2FsZTogMSx9KSxcclxuICAgICAgbmV3IERyYXcoe2RyYXdBcnI6IGRyYXcsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInJlZFwiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcclxuICAgICAgbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdYLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXHJcbiAgICAgIG5ldyBEcmF3KHtkcmF3QXJyOiBkcmF3WSxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxyXG4gICAgXVxyXG4gICAgXHJcbiAgICBcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b2tlbnMsbnVsbCwxKSk7XHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaC50b1N0cmluZygpXFxuXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b1N0cmluZygpKSk7XHJcbiAgICAvKiBHZW5lcmF0ZSBMYVRlWCBjb2RlIGZvciB2ZWN0b3IgY29tcG9uZW50cyBhbmQgbWFpbiB2ZWN0b3JcclxuICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxyXG5cclxuICAgICAgJSBBbmdsZSBBbm5vdGF0aW9uXHJcbiAgICAgICVcXGFuZ3tYfXthbmN9e3ZlY317fXske3JvdW5kQnlTZXR0aW5ncyh2ZWN0b3JBbmdsZSl9JF57XFxjaXJjfSR9XHJcbiAgICBgLnJlcGxhY2UoL15cXHMrL2dtLCBcIlwiKTsqL1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIlNjYWxpbmcgZmFjdG9yXCIsIHNjYWxlKTtcclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgdGlrekdyYXBoIGV4dGVuZHMgTW9kYWwge1xyXG4gIHRpa3o6IEZvcm1hdFRpa3pqYXg7XHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsdGlrekNvZGU6IGFueSl7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy50aWt6PW5ldyBGb3JtYXRUaWt6amF4KHRpa3pDb2RlKTtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29uc3QgY29kZT10aGlzLnRpa3o7XHJcbiAgICBjb25zdCBzY3JpcHQgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcclxuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XHJcbiAgICBzY3JpcHQuc2V0VGV4dChjb2RlLmdldENvZGUoKSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGFjdGlvbkJ1dHRvbiA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ29weSBncmFwaFwiLCBjbHM6IFwiaW5mby1tb2RhbC1Db3B5LWJ1dHRvblwiIH0pO1xyXG5cclxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0aGlzLnRpa3ouZ2V0Q29kZSgpKTtcclxuICAgICAgbmV3IE5vdGljZShcIkdyYXBoIGNvcGllZCB0byBjbGlwYm9hcmQhXCIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIG9uQ2xvc2UoKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG50eXBlIERpc3RyaWJ1dGlvblR5cGUgPSAnbm9ybWFsJyB8ICdiaW5vbWlhbCcgfCAncG9pc3Nvbic7XHJcblxyXG5jbGFzcyBEaXN0cmlidXRpb24ge1xyXG4gIHByaXZhdGUgdHlwZTogRGlzdHJpYnV0aW9uVHlwZTtcclxuICBwcml2YXRlIHg6IG51bWJlcjtcclxuICBwcml2YXRlIG11OiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBzaWdtYTogbnVtYmVyXHJcbiAgcHJpdmF0ZSB2YXJpYW5jZTogbnVtYmVyXHJcblxyXG4gIFxyXG5cclxuICAvLyBGb3IgQmlub21pYWwgRGlzdHJpYnV0aW9uXHJcbiAgcHJpdmF0ZSB0cmlhbHM6IG51bWJlcjtcclxuICBwcml2YXRlIHByb2JhYmlsaXR5OiBudW1iZXI7XHJcblxyXG4gIC8vIEZvciBQb2lzc29uIERpc3RyaWJ1dGlvblxyXG4gIHByaXZhdGUgbGFtYmRhOiBudW1iZXI7XHJcbiAgLypcclxuICBjb25zdHJ1Y3Rvcih0eXBlOiBEaXN0cmlidXRpb25UeXBlLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pIHtcclxuICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSBiYXNlZCBvbiBkaXN0cmlidXRpb24gdHlwZVxyXG4gICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgIGNhc2UgJ25vcm1hbCc6XHJcbiAgICAgICAgdGhpcy5tZWFuID0gcGFyYW1zLm1lYW4gfHwgMDtcclxuICAgICAgICB0aGlzLnN0ZERldiA9IHBhcmFtcy5zdGREZXYgfHwgMTtcclxuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5zdGREZXYgKiogMjtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnYmlub21pYWwnOlxyXG4gICAgICAgIHRoaXMudHJpYWxzID0gcGFyYW1zLnRyaWFscyB8fCAxO1xyXG4gICAgICAgIHRoaXMucHJvYmFiaWxpdHkgPSBwYXJhbXMucHJvYmFiaWxpdHkgfHwgMC41O1xyXG4gICAgICAgIHRoaXMubWVhbiA9IHRoaXMudHJpYWxzICogdGhpcy5wcm9iYWJpbGl0eTtcclxuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5tZWFuICogKDEgLSB0aGlzLnByb2JhYmlsaXR5KTtcclxuICAgICAgICB0aGlzLnN0ZERldiA9IE1hdGguc3FydCh0aGlzLnZhcmlhbmNlKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAncG9pc3Nvbic6XHJcbiAgICAgICAgdGhpcy5sYW1iZGEgPSBwYXJhbXMubGFtYmRhIHx8IDE7XHJcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy5sYW1iZGE7XHJcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubGFtYmRhO1xyXG4gICAgICAgIHRoaXMuc3RkRGV2ID0gTWF0aC5zcXJ0KHRoaXMudmFyaWFuY2UpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZGlzdHJpYnV0aW9uIHR5cGUnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB1YmxpYyBub3JtYWxQREYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdub3JtYWwnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignUERGIG9ubHkgYXBwbGllcyB0byB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbicpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZXhwUGFydCA9IE1hdGguZXhwKC0oKHggLSB0aGlzLm1lYW4pICoqIDIpIC8gKDIgKiB0aGlzLnZhcmlhbmNlKSk7XHJcbiAgICByZXR1cm4gKDEgLyAodGhpcy5zdGREZXYgKiBNYXRoLnNxcnQoMiAqIE1hdGguUEkpKSkgKiBleHBQYXJ0O1xyXG4gIH1cclxuXHJcbiAgcHVibGljIG5vcm1hbENERih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ25vcm1hbCcpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gMC41ICogKDEgKyB0aGlzLmVyZigoeCAtIHRoaXMubWVhbikgLyAoTWF0aC5zcXJ0KDIpICogdGhpcy5zdGREZXYpKSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgYmlub21pYWxQTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdiaW5vbWlhbCcpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQTUYgb25seSBhcHBsaWVzIHRvIHRoZSBCaW5vbWlhbCBEaXN0cmlidXRpb24nKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbWJpbmF0aW9uID0gdGhpcy5mYWN0b3JpYWwodGhpcy50cmlhbHMpIC9cclxuICAgICAgKHRoaXMuZmFjdG9yaWFsKHgpICogdGhpcy5mYWN0b3JpYWwodGhpcy50cmlhbHMgLSB4KSk7XHJcbiAgICByZXR1cm4gY29tYmluYXRpb24gKiBNYXRoLnBvdyh0aGlzLnByb2JhYmlsaXR5LCB4KSAqIE1hdGgucG93KDEgLSB0aGlzLnByb2JhYmlsaXR5LCB0aGlzLnRyaWFscyAtIHgpO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIHBvaXNzb25QTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdwb2lzc29uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BNRiBvbmx5IGFwcGxpZXMgdG8gdGhlIFBvaXNzb24gRGlzdHJpYnV0aW9uJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gKE1hdGgucG93KHRoaXMubGFtYmRhLCB4KSAqIE1hdGguZXhwKC10aGlzLmxhbWJkYSkpIC8gdGhpcy5mYWN0b3JpYWwoeCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGVyZih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgY29uc3Qgc2lnbiA9IHggPCAwID8gLTEgOiAxO1xyXG4gICAgY29uc3QgYSA9IDAuMzI3NTkxMTtcclxuICAgIGNvbnN0IHAgPSAwLjI1NDgyOTU5MjtcclxuICAgIGNvbnN0IHEgPSAtMC4yODQ0OTY3MzY7XHJcbiAgICBjb25zdCByID0gMS40MjE0MTM3NDE7XHJcbiAgICBjb25zdCBzID0gLTEuNDUzMTUyMDI3O1xyXG4gICAgY29uc3QgdCA9IDEuMDYxNDA1NDI5O1xyXG4gICAgY29uc3QgdSA9IDEgKyBhICogTWF0aC5hYnMoeCk7XHJcbiAgICBjb25zdCBwb2x5ID0gKCgoKChwICogdSArIHEpICogdSArIHIpICogdSArIHMpICogdSArIHQpICogdSk7XHJcbiAgICByZXR1cm4gc2lnbiAqICgxIC0gcG9seSAqIE1hdGguZXhwKC14ICogeCkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBmYWN0b3JpYWwobjogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmIChuIDwgMCkgcmV0dXJuIE5hTjtcclxuICAgIGxldCByZXN1bHQgPSAxO1xyXG4gICAgZm9yIChsZXQgaSA9IDI7IGkgPD0gbjsgaSsrKSByZXN1bHQgKj0gaTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfSovXHJcbn1cclxuXHJcblxyXG5jbGFzcyBEaXN0cmlidXRpb25Nb2RlbCBleHRlbmRzIE1vZGFsIHtcclxuICBwcml2YXRlIG46IG51bWJlcjtcclxuICBwcml2YXRlIGs6IG51bWJlcjtcclxuICBwcml2YXRlIHA6IG51bWJlcjtcclxuICBwcml2YXRlIGVxdWFsID0gMDtcclxuICBwcml2YXRlIGxlc3MgPSAwO1xyXG4gIHByaXZhdGUgbGVzc0VxdWFsID0gMDtcclxuICBwcml2YXRlIGJpZyA9IDA7XHJcbiAgcHJpdmF0ZSBiaWdFcXVhbCA9IDA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIGNvbnN0IFtfLCBuLCBrLCBwXSA9IHNvdXJjZS5tYXRjaCgvXFxkKy9nKSEubWFwKE51bWJlcik7XHJcbiAgICB0aGlzLm4gPSBuO1xyXG4gICAgdGhpcy5rID0gaztcclxuICAgIHRoaXMucCA9IHA7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkJpbm9taWFsIFByb2JhYmlsaXR5IFJlc3VsdHNcIiB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPCAke3RoaXMua30pID0gJHt0aGlzLmxlc3N9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+PSAke3RoaXMua30pID0gJHt0aGlzLmJpZ0VxdWFsfWAgfSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgZ2V0RXF1YWwoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIHRoaXMuaywgdGhpcy5wKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpIHtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IHByb2JhYmlsaXR5ID0gY2FsY3VsYXRlQmlub20odGhpcy5uLCBpLCB0aGlzLnApO1xyXG4gICAgICBpZiAoaSA9PT0gdGhpcy5rKSB0aGlzLmVxdWFsID0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDw9IHRoaXMuaykgdGhpcy5sZXNzRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID4gdGhpcy5rKSB0aGlzLmJpZyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgQmlub21JbmZvTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzID0gMDtcclxuICBwcml2YXRlIGxlc3NFcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBiaWcgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICBjb25zdCBbXywgbiwgaywgcF0gPSBzb3VyY2UubWF0Y2goL1xcZCsvZykhLm1hcChOdW1iZXIpO1xyXG4gICAgdGhpcy5uID0gbjtcclxuICAgIHRoaXMuayA9IGs7XHJcbiAgICB0aGlzLnAgPSBwO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzXCIgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8PSAke3RoaXMua30pID0gJHt0aGlzLmxlc3NFcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gY2FsY3VsYXRlQmlub20odGhpcy5uLCB0aGlzLmssIHRoaXMucCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xyXG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykgdGhpcy5lcXVhbCA9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+IHRoaXMuaykgdGhpcy5iaWcgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gdGVzdE1hdGhFbmdpbmUoKXtcclxuICBjb25zdCBleHByZXNzaW9ucz1bXHJcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2AyIFxcZnJhY3soNS0zKTM0fXtcXHNxcnR7Ml57Mn19fTAuNWAsZXhwZWN0ZWRPdXRwdXQ6ICczNCd9LFxyXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgKHgrMSkoeCszKT0yYCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMC4yNjc5NSx4XzI9LTMuNzMyMDUnfSxcclxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YFxcZnJhY3sxMzJ9ezEyNjAreF57Mn19PTAuMDVgLGV4cGVjdGVkT3V0cHV0OiAneF8xPS0zNy4xNDgzNSx4XzI9MzcuMTQ4MzUnfSxcclxuICBdXHJcbiAgY29uc3QgcmVzdWx0cz1bXVxyXG4gIHRyeXtcclxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goZXhwcmVzc2lvbiA9PiB7XHJcbiAgICAgIGNvbnN0IG1hdGg9bmV3IE1hdGhQcmFpc2VyKGV4cHJlc3Npb24uZXhwcmVzc2lvbik7XHJcbiAgICAgIGlmIChtYXRoLnNvbHV0aW9uIT09ZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCl7XHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtleHByZXNzaW9uOiBleHByZXNzaW9uLmV4cHJlc3Npb24sZXhwZWN0ZWRPdXRwdXQ6IGV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQsYWN0dWFsT3V0cHV0OiBtYXRoLnNvbHV0aW9ufSlcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGNhdGNoKGUpe1xyXG4gICAgY29uc29sZS5sb2coZSlcclxuICB9XHJcbn0iXX0=