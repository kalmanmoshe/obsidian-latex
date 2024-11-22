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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEVBQThCLFVBQVUsRUFBZSxNQUFNLFVBQVUsQ0FBQztBQUUvSSxPQUFPLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDdkQsT0FBTyxFQUE4QyxhQUFhLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDbkYsT0FBTyxFQUFxQixnQkFBZ0IsRUFBRSxvQkFBb0IsR0FBRSxNQUFNLFlBQVksQ0FBQztBQUN2RixPQUFPLEVBQUUsY0FBYyxFQUFvQixxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBc0MsZUFBZSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDcEssT0FBTyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDL0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDbkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBUTlDLE1BQU0sQ0FBQyxPQUFPLE9BQU8sVUFBVyxTQUFRLE1BQU07SUFDNUMsUUFBUSxDQUFxQjtJQUM3QixhQUFhLENBQVM7SUFDdEIsS0FBSyxDQUFDLE1BQU07UUFDVixNQUFNLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsYUFBYSxHQUFDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUMsSUFBSSxDQUFDLENBQUE7UUFDN0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUUs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Q0FBQyxDQUFDO0tBQ0o7SUFDRCxPQUFNLENBQUMsRUFBQztRQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7S0FDZjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1BsdWdpbiwgTWFya2Rvd25SZW5kZXJlciwgQXBwLCBNb2RhbCwgQ29tcG9uZW50LCBTZXR0aW5nLE5vdGljZSwgV29ya3NwYWNlV2luZG93LGxvYWRNYXRoSmF4LHJlbmRlck1hdGgsIE1hcmtkb3duVmlld30gZnJvbSBcIm9ic2lkaWFuXCI7XG5cbmltcG9ydCB7IE1hdGhJbmZvLCBNYXRoUHJhaXNlciB9IGZyb20gXCIuL21hdGhFbmdpbmUuanNcIjtcbmltcG9ydCB7IEluZm9Nb2RhbCwgRGVidWdNb2RhbCB9IGZyb20gXCIuL2Rlc3BseU1vZGFsc1wiO1xuaW1wb3J0IHsgQ3VzdG9tSW5wdXRNb2RhbCwgSGlzdG9yeU1vZGFsLCBJbnB1dE1vZGFsLCBWZWNJbnB1dE1vZGVsIH0gZnJvbSBcIi4vdGVtcFwiO1xuaW1wb3J0IHtNYXRoUGx1Z2luU2V0dGluZ3MsIERFRkFVTFRfU0VUVElOR1MsIE1hdGhQbHVnaW5TZXR0aW5nVGFiLH0gZnJvbSBcIi4vc2V0dGluZ3NcIjtcbmltcG9ydCB7IGNhbGN1bGF0ZUJpbm9tLCBkZWdyZWVzVG9SYWRpYW5zLCBmaW5kQW5nbGVCeUNvc2luZVJ1bGUsIGdldFVzYWJsZURlZ3JlZXMsIHBvbGFyVG9DYXJ0ZXNpYW4sIHJhZGlhbnNUb0RlZ3JlZXMsIHJvdW5kQnlTZXR0aW5ncyB9IGZyb20gXCIuL21hdGhVdGlsaXRpZXMuanNcIjtcbmltcG9ydCB7IEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdFRpa3pqYXgsIEZvcm1hdHRpbmcsIFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L3Rpa3pqYXhcIjtcbmltcG9ydCB7IE51bWVyYWxzU3VnZ2VzdG9yIH0gZnJvbSBcIi4vc3VnZ2VzdG9yLmpzXCI7XG5pbXBvcnQgeyBUaWt6U3ZnIH0gZnJvbSBcIi4vdGlrempheC9teVRpa3ouanNcIjtcblxuaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFNlbGVjdGlvblJhbmdlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3UGx1Z2luLCBWaWV3VXBkYXRlIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcblxuXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1hdGhQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTWF0aFBsdWdpblNldHRpbmdzO1xuICB0aWt6UHJvY2Vzc29yOiBUaWt6amF4XG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuICAgIHRoaXMudGlrelByb2Nlc3Nvcj1uZXcgVGlrempheCh0aGlzLmFwcCx0aGlzKVxuICAgIHRoaXMudGlrelByb2Nlc3Nvci5yZWFkeUxheW91dCgpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IucmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCk7XG4gICAgXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBNYXRoUGx1Z2luU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcIm1hdGgtZW5naW5lXCIsIHRoaXMucHJvY2Vzc01hdGhCbG9jay5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6amF4XCIsIHRoaXMucHJvY2Vzc1Rpa3pCbG9jay5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcbiAgICB0aGlzLnJlZ2lzdGVyRWRpdG9yU3VnZ2VzdChuZXcgTnVtZXJhbHNTdWdnZXN0b3IodGhpcykpO1xuXG4gICAgLy8gRXhlY3V0ZSB0aGUgYGEoKWAgbWV0aG9kIHRvIGxvZyBhbmQgbW9kaWZ5IGFsbCBkaXZzXG4gICAgdGhpcy5wcm9jZXNzRGl2cygpO1xuICB9XG4gIG9udW5sb2FkKCkge1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0fVxuICBwcm9jZXNzRGl2cygpIHtcbiAgICBjb25zdCBjbUxpbmVzID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnZGl2LmNtLWxpbmUnKTtcbiAgXG4gICAgY29uc29sZS5sb2coYEZvdW5kICR7Y21MaW5lcy5sZW5ndGh9IGNtLWxpbmUgZGl2KHMpLmApO1xuICBcbiAgICBjbUxpbmVzLmZvckVhY2goKGxpbmUpID0+IHtcbiAgICAgIC8vIEV4cGxpY2l0bHkgY2FzdCBgbGluZWAgdG8gYEhUTUxFbGVtZW50YFxuICAgICAgY29uc3QgaHRtbExpbmUgPSBsaW5lIGFzIEhUTUxFbGVtZW50O1xuICAgICAgaWYgKGh0bWxMaW5lLnRleHRDb250ZW50Py5zdGFydHNXaXRoKCdhJykpIHtcbiAgICAgICAgaHRtbExpbmUuc2V0QXR0cmlidXRlKCdkaXInLCAncnRsJyk7IFxuICAgICAgICBodG1sTGluZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBcImxpZ2h0eWVsbG93XCI7IFxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIFxuICBvYnNlcnZlRHluYW1pY0NoYW5nZXMoKSB7XG4gICAgY29uc3Qgb2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigobXV0YXRpb25zKSA9PiB7XG4gICAgICBtdXRhdGlvbnMuZm9yRWFjaCgobXV0YXRpb24pID0+IHtcbiAgICAgICAgaWYgKG11dGF0aW9uLnR5cGUgPT09IFwiY2hpbGRMaXN0XCIpIHtcbiAgICAgICAgICBtdXRhdGlvbi5hZGRlZE5vZGVzLmZvckVhY2goKG5vZGUpID0+IHtcbiAgICAgICAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgSFRNTEVsZW1lbnQgJiYgbm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NtLWxpbmUnKSkge1xuICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkRldGVjdGVkIGEgbmV3IGNtLWxpbmUgZWxlbWVudDpcIiwgbm9kZSk7XG4gICAgXG4gICAgICAgICAgICAgIC8vIEFwcGx5IGNoYW5nZXMgdG8gdGhlIG5ldyBub2RlXG4gICAgICAgICAgICAgIGlmIChub2RlLnRleHRDb250ZW50Py5zdGFydHNXaXRoKCdhJykpIHtcbiAgICAgICAgICAgICAgICBub2RlLnNldEF0dHJpYnV0ZSgnZGlyJywgJ3J0bCcpO1xuICAgICAgICAgICAgICAgIG5vZGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gXCJsaWdodHllbGxvd1wiO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICAgIFxuICAgIG9ic2VydmVyLm9ic2VydmUoZG9jdW1lbnQuYm9keSwgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSk7XG4gICAgY29uc29sZS5sb2coXCJPYnNlcnZlciBpcyBzZXQgYW5kIHJ1bm5pbmcuXCIpO1xuICBcbiAgfVxuXG4gIHByb2Nlc3NUaWt6QmxvY2soc291cmNlOiBzdHJpbmcsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3Qgc3ZnID0gbmV3IFRpa3pTdmcoc291cmNlKTtcbiAgXG4gIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiKSwge1xuICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcbiAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXG4gIH0pO1xuICBcblxuICBjb25zdCBncmFwaCA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgIHN0eWxlOiBcImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1wiXG4gIH0pO1xuICBncmFwaC5hcHBlbmRDaGlsZChzdmcuZ2V0U3ZnKCkpO1xuICBzdmcuZGVidWdJbmZvKz1ncmFwaC5vdXRlckhUTUxcbiAgY29uc29sZS5sb2coZ3JhcGgub3V0ZXJIVE1MKVxuICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgc3ZnLmRlYnVnSW5mbykub3BlbigpO1xuICBcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xuICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JhcGgpO1xuXG59XG5cblxuICBwcml2YXRlIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVnaXN0ZXJDb21tYW5kcygpIHtcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwib3Blbi1pbnB1dC1mb3JtXCIsXG4gICAgICBuYW1lOiBcIk9wZW4gSW5wdXQgRm9ybVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IG5ldyBWZWNJbnB1dE1vZGVsKHRoaXMuYXBwLHRoaXMpLm9wZW4oKSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ2aWV3LXNlc3Npb24taGlzdG9yeVwiLFxuICAgICAgbmFtZTogXCJWaWV3IFNlc3Npb24gSGlzdG9yeVwiLFxuICAgICAgLy9jYWxsYmFjazogKCkgPT4gbmV3IEhpc3RvcnlNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpLFxuICAgIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ0ZXN0LW1hdGhFbmdpbmVcIixcbiAgICAgIG5hbWU6IFwidGVzdCBtYXRoIGVuZ2luZVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+dGVzdE1hdGhFbmdpbmUoKSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcHJvY2Vzc01hdGhCbG9jayhzb3VyY2U6IHN0cmluZywgbWFpbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICBtYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWNvbnRhaW5lclwiKTtcbiAgICBcbiAgICBjb25zdCB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG4gICAgbGV0IHNraXBwZWRJbmRleGVzID0gMDtcblxuICAgIGNvbnN0IGV4cHJlc3Npb25zID0gc291cmNlLnNwbGl0KFwiXFxuXCIpLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKS5maWx0ZXIobGluZSA9PiBsaW5lKTtcbiAgICBpZiAoZXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7cmV0dXJuO31cblxuICAgIFxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XG4gICAgICBsZXQgbGluZUNvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgbGluZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1saW5lLWNvbnRhaW5lclwiLCAoaW5kZXgtc2tpcHBlZEluZGV4ZXMpICUgMiA9PT0gMCA/IFwibWF0aC1yb3ctZXZlblwiIDogXCJtYXRoLXJvdy1vZGRcIik7XG4gICAgICAvL2lmIChleHByZXNzaW9uLm1hdGNoKC9eXFwvXFwvLykpe31cbiAgICAgIGNvbnN0IHByb2Nlc3NNYXRoID0gbmV3IFByb2Nlc3NNYXRoKGV4cHJlc3Npb24sdXNlclZhcmlhYmxlcywgdGhpcy5hcHAsbGluZUNvbnRhaW5lcik7XG4gICAgICBwcm9jZXNzTWF0aC5pbml0aWFsaXplKCk7XG5cbiAgICAgIGlmKHByb2Nlc3NNYXRoLm1vZGUhPT1cInZhcmlhYmxlXCIpe1xuICAgICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xuICAgICAgICBtYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKGxpbmVDb250YWluZXIpO1xuICAgICAgfVxuICAgICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cbiAgICB9KTtcbiAgfVxufVxuXG5cblxuXG5jbGFzcyBQcm9jZXNzTWF0aCB7XG4gIG1hdGhJbnB1dDogYW55O1xuICB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG4gIG1vZGUgPSBcIm1hdGhcIjtcbiAgcmVzdWx0OiBhbnk7XG4gIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG4gIGljb25zRGl2OiBIVE1MRWxlbWVudDtcbiAgYXBwOiBBcHA7XG5cbiAgY29uc3RydWN0b3IobWF0aElucHV0OiBzdHJpbmcsdXNlclZhcmlhYmxlczogYW55LCBhcHA6IEFwcCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xuICAgIHRoaXMudXNlclZhcmlhYmxlcz11c2VyVmFyaWFibGVzO1xuICAgIHRoaXMuYXBwID0gYXBwO1xuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuICAgIHRoaXMuaWNvbnNEaXYgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWljb25zXCIsXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplKCkge1xuICAgIHRoaXMuYXNzaWduTW9kZSgpO1xuICAgIHRoaXMuc2V0dXBDb250YWluZXIoKTtcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xuICAgIHRoaXMucmVuZGVyTWF0aCgpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cENvbnRhaW5lcigpIHtcbiAgICBbXCJtYXRoLWlucHV0XCIsIFwibWF0aC1yZXN1bHRcIl0uZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGRpdi5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIH0pO1xuICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuaWNvbnNEaXYpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJNYXRoKCkge1xuICAgIGNvbnN0IGlucHV0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLWlucHV0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XG4gICAgdHJ5IHtcbiAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIGNvbnN0IGJpbm9tTW9kZWwgPSBuZXcgQmlub21JbmZvTW9kZWwodGhpcy5hcHAsIHRoaXMubWF0aElucHV0KTtcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IGJpbm9tTW9kZWwuZ2V0RXF1YWwoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImNvc1wiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIGNvbnN0IFsgLCBzaWRlQSwgc2lkZUIsIHNpZGVDIF0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoTnVtYmVyKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInZlY1wiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIHRoaXMucmVzdWx0PW5ldyBWZWNQcm9jZXNzb3IodGhpcy5tYXRoSW5wdXRbMV0sdGhpcy5tYXRoSW5wdXRbMl0sdGhpcy5tYXRoSW5wdXRbM10pO1xuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyB0aWt6R3JhcGgodGhpcy5hcHAsIHRoaXMucmVzdWx0LmdyYXBoKSk7XG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xuICAgICAgICAgIHRoaXMucmVzdWx0PXRoaXMucmVzdWx0LnJlc3VsdFxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IG5ldyBNYXRoUHJhaXNlcih0aGlzLm1hdGhJbnB1dCk7XG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8pKTtcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xuICAgICAgICAgIHRoaXMubWF0aElucHV0PXRoaXMucmVzdWx0LmlucHV0O1xuICAgICAgICAgIHRoaXMucmVzdWx0ID0gdGhpcy5yZXN1bHQuc29sdXRpb247XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgIHRoaXMuYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXYsIHJlc3VsdERpdiwgdHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIj90aGlzLm1hdGhJbnB1dDp0aGlzLm1hdGhJbnB1dFswXSwgcm91bmRCeVNldHRpbmdzKHRoaXMucmVzdWx0KSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLmRpc3BsYXlFcnJvcihpbnB1dERpdiwgcmVzdWx0RGl2LCBlcnIpO1xuICAgICAgY29uc29sZS5lcnJvcihcIlRoZSBpbml0aWFsIHByYWlzaW5nIGZhaWxlZFwiLGVycik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGlucHV0OiBzdHJpbmcsIHJlc3VsdDogYW55KSB7XG4gICAgaW5wdXREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChpbnB1dCx0cnVlKSlcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcJHske2lucHV0fX0kYCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gICAgLy9jb25zdCByZXN1bHRPdXRwdXQgPSAvKHRydWV8ZmFsc2UpLy50ZXN0KHJlc3VsdCkgPyByZXN1bHQgOiBgXFwkeyR7cmVzdWx0fX0kYDtcbiAgICByZXN1bHREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChyZXN1bHQudG9TdHJpbmcoKSx0cnVlKSlcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24ocmVzdWx0T3V0cHV0LCByZXN1bHREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gIH1cblxuICBwcml2YXRlIGRpc3BsYXlFcnJvcihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGVycjogRXJyb3IpIHtcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHRoaXMubWF0aElucHV0LCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcbiAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiZXJyb3ItdGV4dFwiPiR7ZXJyLm1lc3NhZ2V9PC9zcGFuPmA7XG4gICAgdGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtZXJyb3ItbGluZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXNzaWduTW9kZSgpIHtcbiAgICBjb25zdCByZWdleExpc3QgPSBHZXRNYXRoQ29udGV4dFJlZ2V4KCk7XG4gICAgY29uc3QgbWF0Y2hPYmplY3QgPSByZWdleExpc3QuZmluZChyZWdleE9iaiA9PiByZWdleE9iai5yZWdleC50ZXN0KHRoaXMubWF0aElucHV0KSk7XG4gICAgaWYgKG1hdGNoT2JqZWN0KSB7XG4gICAgICB0aGlzLm1vZGUgPSBtYXRjaE9iamVjdC52YWx1ZTtcbiAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQubWF0Y2gobWF0Y2hPYmplY3QucmVnZXgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYWRkSW5mb01vZGFsKG1vZGFsOiBhbnkpIHtcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pbmZvLWljb25cIixcbiAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcbiAgICB9KTtcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcbiAgfVxuXG4gIHByaXZhdGUgYWRkRGVidWdNb2RlbChtb2RhbDogYW55KSB7XG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+QnlwiLFxuICAgIH0pO1xuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZXMoKSB7XG4gICAgaWYgKHRoaXMubW9kZT09PVwidmFyaWFibGVcIikge1xuICAgICAgdGhpcy5oYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpIHtcbiAgICBjb25zdCBbXyx2YXJpYWJsZSwgdmFsdWVdID0gdGhpcy5tYXRoSW5wdXQubWFwKChwYXJ0OiBzdHJpbmcpID0+IHBhcnQudHJpbSgpKTtcbiAgICBpZiAoIXZhcmlhYmxlIHx8ICF2YWx1ZSkge1xuICAgICAgY29uc29sZS53YXJuKGBJbnZhbGlkIHZhcmlhYmxlIGRlY2xhcmF0aW9uOiAke3RoaXMubWF0aElucHV0fWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBleGlzdGluZ1ZhckluZGV4ID0gdGhpcy51c2VyVmFyaWFibGVzLmZpbmRJbmRleCh2ID0+IHYudmFyaWFibGUgPT09IHZhcmlhYmxlKTtcbiAgICBpZiAoZXhpc3RpbmdWYXJJbmRleCAhPT0gLTEpIHtcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlc1tleGlzdGluZ1ZhckluZGV4XS52YWx1ZSA9IHZhbHVlO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXMucHVzaCh7IHZhcmlhYmxlLCB2YWx1ZSB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKXtcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXMuZm9yRWFjaCgoeyB2YXJpYWJsZSwgdmFsdWUgfSkgPT4ge1xuICAgICAgaWYgKHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCIpe1xuICAgICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0LnJlcGxhY2UodmFyaWFibGUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIEdldE1hdGhDb250ZXh0UmVnZXgoKSB7XG4gIHJldHVybiBbXG4gICAgeyByZWdleDogL2Jpbm9tXFwoKFxcZCspLChcXGQrKSwoXFxkKylcXCkvLCB2YWx1ZTogXCJiaW5vbVwiIH0sXG4gICAgeyByZWdleDogL3ZlYyhbKy1dezAsMn0pXFwoKFtcXGQuKy1dK1s6LF1bXFxkListXSspXFwpKFtcXGQuKy1dKikvLCB2YWx1ZTogXCJ2ZWNcIiB9LFxuICAgIHsgcmVnZXg6IC9jb3NcXCgoW1xcZC5dKyksKFtcXGQuXSspLChbXFxkLl0rKVxcKS8sIHZhbHVlOiBcImNvc1wiIH0sXG4gICAgeyByZWdleDogL3ZhclxccyooW1xcd10rKVxccyo9XFxzKihbXFxkLl0rKS8sIHZhbHVlOiBcInZhcmlhYmxlXCIgfSxcbiAgXTtcbn1cblxuXG5jbGFzcyBWZWNQcm9jZXNzb3Ige1xuICB1c2VySW5wdXQ6IGFueTtcbiAgZW52aXJvbm1lbnQ6IHsgWDogc3RyaW5nOyBZOiBzdHJpbmcgfTtcbiAgdmVjSW5mbyA9IG5ldyBNYXRoSW5mbygpO1xuICBheGlzOiBBeGlzO1xuICBtb2RpZmllcjogbnVtYmVyO1xuICByZXN1bHQ6IHN0cmluZztcbiAgZ3JhcGg/OiBhbnk7XG5cbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgbWF0aElucHV0OiBzdHJpbmcsIG1vZGlmaWVyOiBzdHJpbmcpIHtcbiAgICB0aGlzLnVzZXJJbnB1dD1tYXRoSW5wdXQ7XG4gICAgY29uc3QgbWF0Y2ggPSBlbnZpcm9ubWVudC5tYXRjaCgvKFsrLV0/KShbKy1dPykvKTtcbiAgICB0aGlzLmVudmlyb25tZW50ID0geyBYOiBtYXRjaD8uWzFdID8/IFwiK1wiLCBZOiBtYXRjaD8uWzJdID8/IFwiK1wiIH07XG5cbiAgICB0aGlzLm1vZGlmaWVyID0gbW9kaWZpZXIubGVuZ3RoID4gMCA/IGdldFVzYWJsZURlZ3JlZXMoTnVtYmVyKG1vZGlmaWVyKSkgOiAwO1xuXG4gICAgdGhpcy5heGlzPW5ldyBBeGlzKCkudW5pdmVyc2FsKHRoaXMudXNlcklucHV0KVxuICAgIGlmICghdGhpcy5heGlzLnBvbGFyQW5nbGUpXG4gICAgICB0aGlzLmF4aXMuY2FydGVzaWFuVG9Qb2xhcigpO1xuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJheGlzXCIsdGhpcy5heGlzKTtcbiAgICB0aGlzLmFkZFJlc3VsdCgpO1xuICAgIHRoaXMuYWRkR3JhcGgoKTtcbiAgfVxuICBhZGRSZXN1bHQoKXtcbiAgICBpZiAodGhpcy51c2VySW5wdXQuaW5jbHVkZXMoXCI6XCIpKVxuICAgICAgdGhpcy5yZXN1bHQ9YHggPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5YfVxcXFxxdWFkLHkgPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5ZfWBcbiAgICBlbHNlXG4gICAgICB0aGlzLnJlc3VsdD1gYW5nbGUgPSAke3RoaXMuYXhpcy5wb2xhckFuZ2xlfVxcXFxxdWFkLGxlbmd0aCA9ICR7dGhpcy5heGlzLnBvbGFyTGVuZ3RofWBcbiAgfVxuICBcbiAgYWRkR3JhcGgoKSB7XG4gICAgY29uc3QgdGFyZ2V0U2l6ZSA9IDEwO1xuICAgIGNvbnN0IG1heENvbXBvbmVudCA9IE1hdGgubWF4KE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YKSwgTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblkpKTtcblxuICAgIC8vIERldGVybWluZSBzY2FsaW5nIGZhY3RvclxuICAgIGxldCBzY2FsZSA9IDE7XG4gICAgaWYgKG1heENvbXBvbmVudCA8IHRhcmdldFNpemUpIHtcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcbiAgICB9IGVsc2UgaWYgKG1heENvbXBvbmVudCA+IHRhcmdldFNpemUpIHtcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcbiAgICB9XG4gICAgLy8gaSBuZWVkIHRvIG1ha2UgaXQgXCJ0byBYIGF4aXNcIlxuICAgIC8vY29uc3QgdmVjdG9yQW5nbGUgPSBnZXRVc2FibGVEZWdyZWVzKHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuMihzY2FsZWRZLCBzY2FsZWRYKSkpO1xuICAgIFxuICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKDAsMCk7XG5cblxuICAgIGNvbnN0IGRyYXc9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLnBvbGFyTGVuZ3RoLnRvU3RyaW5nKCl9KSx0aGlzLmF4aXNdO1xuICAgIGNvbnN0IGRyYXdYPSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5jYXJ0ZXNpYW5YLnRvU3RyaW5nKCl9KSxuZXcgQXhpcyh0aGlzLmF4aXMuY2FydGVzaWFuWCwwKV07XG4gICAgY29uc3QgZHJhd1k9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblkudG9TdHJpbmcoKX0pLG5ldyBBeGlzKDAsdGhpcy5heGlzLmNhcnRlc2lhblkpXTtcblxuICAgIHRoaXMuZ3JhcGg9W1xuICAgICAgbmV3IEZvcm1hdHRpbmcoXCJnbG9ib2xcIix7Y29sb3I6IFwid2hpdGVcIixzY2FsZTogMSx9KSxcbiAgICAgIG5ldyBEcmF3KHtkcmF3QXJyOiBkcmF3LGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJyZWRcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXG4gICAgICBuZXcgRHJhdyh7ZHJhd0FycjogZHJhd1gsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcbiAgICAgIG5ldyBEcmF3KHtkcmF3QXJyOiBkcmF3WSxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxuICAgIF1cbiAgICBcbiAgICBcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaFwiLEpTT04uc3RyaW5naWZ5KHRoaXMuZ3JhcGgudG9rZW5zLG51bGwsMSkpO1xuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoLnRvU3RyaW5nKClcXG5cIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRvU3RyaW5nKCkpKTtcbiAgICAvKiBHZW5lcmF0ZSBMYVRlWCBjb2RlIGZvciB2ZWN0b3IgY29tcG9uZW50cyBhbmQgbWFpbiB2ZWN0b3JcbiAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcblxuICAgICAgJSBBbmdsZSBBbm5vdGF0aW9uXG4gICAgICAlXFxhbmd7WH17YW5jfXt2ZWN9e317JHtyb3VuZEJ5U2V0dGluZ3ModmVjdG9yQW5nbGUpfSRee1xcY2lyY30kfVxuICAgIGAucmVwbGFjZSgvXlxccysvZ20sIFwiXCIpOyovXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIlNjYWxpbmcgZmFjdG9yXCIsIHNjYWxlKTtcbiAgfVxufVxuXG5cblxuY2xhc3MgdGlrekdyYXBoIGV4dGVuZHMgTW9kYWwge1xuICB0aWt6OiBGb3JtYXRUaWt6amF4O1xuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCx0aWt6Q29kZTogYW55KXtcbiAgICBzdXBlcihhcHApO1xuICAgIHRoaXMudGlrej1uZXcgRm9ybWF0VGlrempheCh0aWt6Q29kZSk7XG4gIH1cblxuICBvbk9wZW4oKSB7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29uc3QgY29kZT10aGlzLnRpa3o7XG4gICAgY29uc3Qgc2NyaXB0ID0gY29udGVudEVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XG4gICAgc2NyaXB0LnNldFRleHQoY29kZS5nZXRDb2RlKCkpO1xuICAgIFxuICAgIGNvbnN0IGFjdGlvbkJ1dHRvbiA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ29weSBncmFwaFwiLCBjbHM6IFwiaW5mby1tb2RhbC1Db3B5LWJ1dHRvblwiIH0pO1xuXG4gICAgYWN0aW9uQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoKSA9PiB7XG4gICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0aGlzLnRpa3ouZ2V0Q29kZSgpKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJHcmFwaCBjb3BpZWQgdG8gY2xpcGJvYXJkIVwiKTtcbiAgICB9KTtcbiAgfVxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gIH1cbn1cblxudHlwZSBEaXN0cmlidXRpb25UeXBlID0gJ25vcm1hbCcgfCAnYmlub21pYWwnIHwgJ3BvaXNzb24nO1xuXG5jbGFzcyBEaXN0cmlidXRpb24ge1xuICBwcml2YXRlIHR5cGU6IERpc3RyaWJ1dGlvblR5cGU7XG4gIHByaXZhdGUgeDogbnVtYmVyO1xuICBwcml2YXRlIG11OiBudW1iZXI7XG4gIHByaXZhdGUgc2lnbWE6IG51bWJlclxuICBwcml2YXRlIHZhcmlhbmNlOiBudW1iZXJcblxuICBcblxuICAvLyBGb3IgQmlub21pYWwgRGlzdHJpYnV0aW9uXG4gIHByaXZhdGUgdHJpYWxzOiBudW1iZXI7XG4gIHByaXZhdGUgcHJvYmFiaWxpdHk6IG51bWJlcjtcblxuICAvLyBGb3IgUG9pc3NvbiBEaXN0cmlidXRpb25cbiAgcHJpdmF0ZSBsYW1iZGE6IG51bWJlcjtcbiAgLypcbiAgY29uc3RydWN0b3IodHlwZTogRGlzdHJpYnV0aW9uVHlwZSwgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSB7XG4gICAgdGhpcy50eXBlID0gdHlwZTtcblxuICAgIC8vIEluaXRpYWxpemUgYmFzZWQgb24gZGlzdHJpYnV0aW9uIHR5cGVcbiAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ25vcm1hbCc6XG4gICAgICAgIHRoaXMubWVhbiA9IHBhcmFtcy5tZWFuIHx8IDA7XG4gICAgICAgIHRoaXMuc3RkRGV2ID0gcGFyYW1zLnN0ZERldiB8fCAxO1xuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5zdGREZXYgKiogMjtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdiaW5vbWlhbCc6XG4gICAgICAgIHRoaXMudHJpYWxzID0gcGFyYW1zLnRyaWFscyB8fCAxO1xuICAgICAgICB0aGlzLnByb2JhYmlsaXR5ID0gcGFyYW1zLnByb2JhYmlsaXR5IHx8IDAuNTtcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy50cmlhbHMgKiB0aGlzLnByb2JhYmlsaXR5O1xuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5tZWFuICogKDEgLSB0aGlzLnByb2JhYmlsaXR5KTtcbiAgICAgICAgdGhpcy5zdGREZXYgPSBNYXRoLnNxcnQodGhpcy52YXJpYW5jZSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncG9pc3Nvbic6XG4gICAgICAgIHRoaXMubGFtYmRhID0gcGFyYW1zLmxhbWJkYSB8fCAxO1xuICAgICAgICB0aGlzLm1lYW4gPSB0aGlzLmxhbWJkYTtcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubGFtYmRhO1xuICAgICAgICB0aGlzLnN0ZERldiA9IE1hdGguc3FydCh0aGlzLnZhcmlhbmNlKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIGRpc3RyaWJ1dGlvbiB0eXBlJyk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIG5vcm1hbFBERih4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh0aGlzLnR5cGUgIT09ICdub3JtYWwnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BERiBvbmx5IGFwcGxpZXMgdG8gdGhlIE5vcm1hbCBEaXN0cmlidXRpb24nKTtcbiAgICB9XG4gICAgY29uc3QgZXhwUGFydCA9IE1hdGguZXhwKC0oKHggLSB0aGlzLm1lYW4pICoqIDIpIC8gKDIgKiB0aGlzLnZhcmlhbmNlKSk7XG4gICAgcmV0dXJuICgxIC8gKHRoaXMuc3RkRGV2ICogTWF0aC5zcXJ0KDIgKiBNYXRoLlBJKSkpICogZXhwUGFydDtcbiAgfVxuXG4gIHB1YmxpYyBub3JtYWxDREYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAnbm9ybWFsJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XG4gICAgfVxuICAgIHJldHVybiAwLjUgKiAoMSArIHRoaXMuZXJmKCh4IC0gdGhpcy5tZWFuKSAvIChNYXRoLnNxcnQoMikgKiB0aGlzLnN0ZERldikpKTtcbiAgfVxuXG4gIHB1YmxpYyBiaW5vbWlhbFBNRih4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh0aGlzLnR5cGUgIT09ICdiaW5vbWlhbCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUE1GIG9ubHkgYXBwbGllcyB0byB0aGUgQmlub21pYWwgRGlzdHJpYnV0aW9uJyk7XG4gICAgfVxuICAgIGNvbnN0IGNvbWJpbmF0aW9uID0gdGhpcy5mYWN0b3JpYWwodGhpcy50cmlhbHMpIC9cbiAgICAgICh0aGlzLmZhY3RvcmlhbCh4KSAqIHRoaXMuZmFjdG9yaWFsKHRoaXMudHJpYWxzIC0geCkpO1xuICAgIHJldHVybiBjb21iaW5hdGlvbiAqIE1hdGgucG93KHRoaXMucHJvYmFiaWxpdHksIHgpICogTWF0aC5wb3coMSAtIHRoaXMucHJvYmFiaWxpdHksIHRoaXMudHJpYWxzIC0geCk7XG4gIH1cblxuICBwdWJsaWMgcG9pc3NvblBNRih4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh0aGlzLnR5cGUgIT09ICdwb2lzc29uJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQTUYgb25seSBhcHBsaWVzIHRvIHRoZSBQb2lzc29uIERpc3RyaWJ1dGlvbicpO1xuICAgIH1cbiAgICByZXR1cm4gKE1hdGgucG93KHRoaXMubGFtYmRhLCB4KSAqIE1hdGguZXhwKC10aGlzLmxhbWJkYSkpIC8gdGhpcy5mYWN0b3JpYWwoeCk7XG4gIH1cblxuICBwcml2YXRlIGVyZih4OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGNvbnN0IHNpZ24gPSB4IDwgMCA/IC0xIDogMTtcbiAgICBjb25zdCBhID0gMC4zMjc1OTExO1xuICAgIGNvbnN0IHAgPSAwLjI1NDgyOTU5MjtcbiAgICBjb25zdCBxID0gLTAuMjg0NDk2NzM2O1xuICAgIGNvbnN0IHIgPSAxLjQyMTQxMzc0MTtcbiAgICBjb25zdCBzID0gLTEuNDUzMTUyMDI3O1xuICAgIGNvbnN0IHQgPSAxLjA2MTQwNTQyOTtcbiAgICBjb25zdCB1ID0gMSArIGEgKiBNYXRoLmFicyh4KTtcbiAgICBjb25zdCBwb2x5ID0gKCgoKChwICogdSArIHEpICogdSArIHIpICogdSArIHMpICogdSArIHQpICogdSk7XG4gICAgcmV0dXJuIHNpZ24gKiAoMSAtIHBvbHkgKiBNYXRoLmV4cCgteCAqIHgpKTtcbiAgfVxuXG4gIHByaXZhdGUgZmFjdG9yaWFsKG46IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKG4gPCAwKSByZXR1cm4gTmFOO1xuICAgIGxldCByZXN1bHQgPSAxO1xuICAgIGZvciAobGV0IGkgPSAyOyBpIDw9IG47IGkrKykgcmVzdWx0ICo9IGk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfSovXG59XG5cblxuY2xhc3MgRGlzdHJpYnV0aW9uTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XG4gIHByaXZhdGUgbjogbnVtYmVyO1xuICBwcml2YXRlIGs6IG51bWJlcjtcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XG4gIHByaXZhdGUgZXF1YWwgPSAwO1xuICBwcml2YXRlIGxlc3MgPSAwO1xuICBwcml2YXRlIGxlc3NFcXVhbCA9IDA7XG4gIHByaXZhdGUgYmlnID0gMDtcbiAgcHJpdmF0ZSBiaWdFcXVhbCA9IDA7XG5cbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogc3RyaW5nKSB7XG4gICAgc3VwZXIoYXBwKTtcbiAgICBjb25zdCBbXywgbiwgaywgcF0gPSBzb3VyY2UubWF0Y2goL1xcZCsvZykhLm1hcChOdW1iZXIpO1xuICAgIHRoaXMubiA9IG47XG4gICAgdGhpcy5rID0gaztcbiAgICB0aGlzLnAgPSBwO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIHRoaXMuY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpO1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzXCIgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPSAke3RoaXMua30pID0gJHt0aGlzLmVxdWFsfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPCAke3RoaXMua30pID0gJHt0aGlzLmxlc3N9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8PSAke3RoaXMua30pID0gJHt0aGlzLmxlc3NFcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID4gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWd9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+PSAke3RoaXMua30pID0gJHt0aGlzLmJpZ0VxdWFsfWAgfSk7XG4gIH1cblxuICBwdWJsaWMgZ2V0RXF1YWwoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gY2FsY3VsYXRlQmlub20odGhpcy5uLCB0aGlzLmssIHRoaXMucCk7XG4gIH1cblxuICBwcml2YXRlIGNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcbiAgICAgIGNvbnN0IHByb2JhYmlsaXR5ID0gY2FsY3VsYXRlQmlub20odGhpcy5uLCBpLCB0aGlzLnApO1xuICAgICAgaWYgKGkgPT09IHRoaXMuaykgdGhpcy5lcXVhbCA9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPCB0aGlzLmspIHRoaXMubGVzcyArPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDw9IHRoaXMuaykgdGhpcy5sZXNzRXF1YWwgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA+IHRoaXMuaykgdGhpcy5iaWcgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA+PSB0aGlzLmspIHRoaXMuYmlnRXF1YWwgKz0gcHJvYmFiaWxpdHk7XG4gICAgfVxuICB9XG59XG5cblxuXG5cblxuXG5cbmNsYXNzIEJpbm9tSW5mb01vZGVsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG46IG51bWJlcjtcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XG4gIHByaXZhdGUgcDogbnVtYmVyO1xuICBwcml2YXRlIGVxdWFsID0gMDtcbiAgcHJpdmF0ZSBsZXNzID0gMDtcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xuICBwcml2YXRlIGJpZyA9IDA7XG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuayA9IGs7XG4gICAgdGhpcy5wID0gcDtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xuICB9XG5cbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgIH1cbiAgfVxufVxuXG5cblxuXG5cblxuZnVuY3Rpb24gdGVzdE1hdGhFbmdpbmUoKXtcbiAgY29uc3QgZXhwcmVzc2lvbnM9W1xuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YDIgXFxmcmFjeyg1LTMpMzR9e1xcc3FydHsyXnsyfX19MC41YCxleHBlY3RlZE91dHB1dDogJzM0J30sXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgKHgrMSkoeCszKT0yYCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMC4yNjc5NSx4XzI9LTMuNzMyMDUnfSxcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2BcXGZyYWN7MTMyfXsxMjYwK3heezJ9fT0wLjA1YCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMzcuMTQ4MzUseF8yPTM3LjE0ODM1J30sXG4gIF1cbiAgY29uc3QgcmVzdWx0cz1bXVxuICB0cnl7XG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaChleHByZXNzaW9uID0+IHtcbiAgICAgIGNvbnN0IG1hdGg9bmV3IE1hdGhQcmFpc2VyKGV4cHJlc3Npb24uZXhwcmVzc2lvbik7XG4gICAgICBpZiAobWF0aC5zb2x1dGlvbiE9PWV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQpe1xuICAgICAgICByZXN1bHRzLnB1c2goe2V4cHJlc3Npb246IGV4cHJlc3Npb24uZXhwcmVzc2lvbixleHBlY3RlZE91dHB1dDogZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCxhY3R1YWxPdXRwdXQ6IG1hdGguc29sdXRpb259KVxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIGNhdGNoKGUpe1xuICAgIGNvbnNvbGUubG9nKGUpXG4gIH1cbn0iXX0=