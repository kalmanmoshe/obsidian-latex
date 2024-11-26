import { Plugin, MarkdownRenderer, Modal, Component, Notice, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, MathPluginSettingTab, } from "./settings";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities.js";
import { Axis, Coordinate, Draw, FormatTikzjax, Formatting, Tikzjax } from "./tikzjax/tikzjax";
import { NumeralsSuggestor } from "./suggestor.js";
import { TikzSvg } from "./tikzjax/myTikz.js";
import { ViewPlugin, Decoration, } from "@codemirror/view";
// CodeMirror Extension to style lines dynamically
function createContextBasedLineStyling() {
    // Define the plugin
    return ViewPlugin.fromClass(class {
        decorations;
        constructor(view) {
            this.decorations = this.computeDecorations(view);
        }
        update(update) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = this.computeDecorations(update.view);
            }
        }
        computeDecorations(view) {
            const widgets = [];
            for (let { from, to } of view.visibleRanges) {
                for (let pos = from; pos <= to;) {
                    const line = view.state.doc.lineAt(pos);
                    const content = line.text.trim();
                    if (content
                        .replace(/[#:\s"=-\d\[\].\+\-]*/g, '')
                        .replace(/<[a-z]+[\w\s\d]*>/g, '')
                        .match(/^[א-ת]/)) {
                        widgets.push(Decoration.line({
                            class: "custom-rtl-line"
                        }).range(line.from));
                    }
                    pos = line.to + 1;
                }
            }
            return Decoration.set(widgets);
        }
    }, {
        decorations: (v) => v.decorations,
    });
}
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
        this.registerEditorExtension(createContextBasedLineStyling());
        // Execute the `a()` method to log and modify all divs
        //this.processDivs();
    }
    onunload() {
        this.tikzProcessor.unloadTikZJaxAllWindows();
        this.tikzProcessor.removeSyntaxHighlighting();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEVBQThCLFVBQVUsRUFBZSxNQUFNLFVBQVUsQ0FBQztBQUUvSSxPQUFPLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDdkQsT0FBTyxFQUE4QyxhQUFhLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDbkYsT0FBTyxFQUFxQixnQkFBZ0IsRUFBRSxvQkFBb0IsR0FBRSxNQUFNLFlBQVksQ0FBQztBQUN2RixPQUFPLEVBQUUsY0FBYyxFQUFvQixxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBc0MsZUFBZSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDcEssT0FBTyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDL0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDbkQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBSTlDLE9BQU8sRUFBYyxVQUFVLEVBQWMsVUFBVSxHQUFHLE1BQU0sa0JBQWtCLENBQUM7QUFHbkYsa0RBQWtEO0FBQ2xELFNBQVMsNkJBQTZCO0lBRXBDLG9CQUFvQjtJQUNwQixPQUFPLFVBQVUsQ0FBQyxTQUFTLENBQ3pCO1FBQ0ksV0FBVyxDQUF1QjtRQUVsQyxZQUFZLElBQWdCO1lBQ3hCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3JELENBQUM7UUFFRCxNQUFNLENBQUMsTUFBa0I7WUFDckIsSUFBSSxNQUFNLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxlQUFlLEVBQUU7Z0JBQzdDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUMzRDtRQUNMLENBQUM7UUFFRCxrQkFBa0IsQ0FBQyxJQUFnQjtZQUMvQixNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDbkIsS0FBSyxJQUFJLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUU7Z0JBQ3pDLEtBQUssSUFBSSxHQUFHLEdBQUcsSUFBSSxFQUFFLEdBQUcsSUFBSSxFQUFFLEdBQUk7b0JBQzlCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDakMsSUFBSSxPQUFPO3lCQUNSLE9BQU8sQ0FBQyx3QkFBd0IsRUFBQyxFQUFFLENBQUM7eUJBQ3BDLE9BQU8sQ0FBQyxvQkFBb0IsRUFBQyxFQUFFLENBQUM7eUJBQ2hDLEtBQUssQ0FBQyxRQUFRLENBQUMsRUFBRTt3QkFDaEIsT0FBTyxDQUFDLElBQUksQ0FDUixVQUFVLENBQUMsSUFBSSxDQUFDOzRCQUNkLEtBQUssRUFBRSxpQkFBaUI7eUJBQ3pCLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUN0QixDQUFDO3FCQUNMO29CQUNELEdBQUcsR0FBRyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztpQkFDckI7YUFDSjtZQUNELE9BQU8sVUFBVSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNuQyxDQUFDO0tBQ0osRUFDRDtRQUNFLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVc7S0FDbEMsQ0FDSixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sQ0FBQyxPQUFPLE9BQU8sVUFBVyxTQUFRLE1BQU07SUFDNUMsUUFBUSxDQUFxQjtJQUM3QixhQUFhLENBQVM7SUFDdEIsS0FBSyxDQUFDLE1BQU07UUFDVixNQUFNLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsYUFBYSxHQUFDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUMsSUFBSSxDQUFDLENBQUE7UUFDN0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDM0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBRXpDLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDN0QsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDekYsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDckYsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLHFCQUFxQixDQUFDLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN4RCxJQUFJLENBQUMsdUJBQXVCLENBQUMsNkJBQTZCLEVBQUUsQ0FBQyxDQUFDO1FBQzlELHNEQUFzRDtRQUN0RCxxQkFBcUI7SUFDdkIsQ0FBQztJQUNELFFBQVE7UUFDUixJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDN0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO0lBQy9DLENBQUM7SUFFQSxnQkFBZ0IsQ0FBQyxNQUFjLEVBQUUsU0FBc0I7UUFDdkQsTUFBTSxHQUFHLEdBQUcsSUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFaEMsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3BELFNBQVMsRUFBRSxpQkFBaUI7WUFDNUIsV0FBVyxFQUFFLElBQUk7U0FDbEIsQ0FBQyxDQUFDO1FBR0gsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3pELEtBQUssRUFBRSw4REFBOEQ7U0FDdEUsQ0FBQyxDQUFDO1FBQ0gsS0FBSyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUNoQyxHQUFHLENBQUMsU0FBUyxJQUFFLEtBQUssQ0FBQyxTQUFTLENBQUE7UUFDOUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDNUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVwRSxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVCLFNBQVMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUdTLEtBQUssQ0FBQyxZQUFZO1FBQ3hCLElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUM3RSxDQUFDO0lBRU0sS0FBSyxDQUFDLFlBQVk7UUFDdkIsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRU8sZ0JBQWdCO1FBQ3RCLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDZCxFQUFFLEVBQUUsaUJBQWlCO1lBQ3JCLElBQUksRUFBRSxpQkFBaUI7WUFDdkIsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFO1NBQ3hELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLENBQUM7WUFDZCxFQUFFLEVBQUUsc0JBQXNCO1lBQzFCLElBQUksRUFBRSxzQkFBc0I7WUFDNUIsMERBQTBEO1NBQzNELENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxVQUFVLENBQUM7WUFDZCxFQUFFLEVBQUUsaUJBQWlCO1lBQ3JCLElBQUksRUFBRSxrQkFBa0I7WUFDeEIsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFBLGNBQWMsRUFBRTtTQUNoQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sZ0JBQWdCLENBQUMsTUFBYyxFQUFFLGFBQTBCO1FBQ2pFLGFBQWEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFOUMsTUFBTSxhQUFhLEdBQTBDLEVBQUUsQ0FBQztRQUNoRSxJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUM7UUFFdkIsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNyRixJQUFJLFdBQVcsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQUMsT0FBTztTQUFDO1FBR3ZDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLEVBQUU7WUFDeEMsSUFBSSxhQUFhLEdBQW1CLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDbEUsYUFBYSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMscUJBQXFCLEVBQUUsQ0FBQyxLQUFLLEdBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUN4SCxrQ0FBa0M7WUFDbEMsTUFBTSxXQUFXLEdBQUcsSUFBSSxXQUFXLENBQUMsVUFBVSxFQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ3RGLFdBQVcsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUV6QixJQUFHLFdBQVcsQ0FBQyxJQUFJLEtBQUcsVUFBVSxFQUFDO2dCQUMvQixhQUFhLEdBQUcsV0FBVyxDQUFDLFNBQTJCLENBQUM7Z0JBQ3hELGFBQWEsQ0FBQyxXQUFXLENBQUMsYUFBYSxDQUFDLENBQUM7YUFDMUM7aUJBQ0c7Z0JBQUMsY0FBYyxFQUFFLENBQUM7YUFBQztRQUN6QixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQUtELE1BQU0sV0FBVztJQUNmLFNBQVMsQ0FBTTtJQUNmLGFBQWEsR0FBMEMsRUFBRSxDQUFDO0lBQzFELElBQUksR0FBRyxNQUFNLENBQUM7SUFDZCxNQUFNLENBQU07SUFDWixTQUFTLENBQWM7SUFDdkIsUUFBUSxDQUFjO0lBQ3RCLEdBQUcsQ0FBTTtJQUVULFlBQVksU0FBaUIsRUFBQyxhQUFrQixFQUFFLEdBQVEsRUFBRSxTQUFzQjtRQUNoRixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsYUFBYSxHQUFDLGFBQWEsQ0FBQztRQUNqQyxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQzNELFNBQVMsRUFBRSxZQUFZO1NBQ3hCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxLQUFLLENBQUMsVUFBVTtRQUNkLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNsQixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUNwQixDQUFDO0lBRU8sY0FBYztRQUNwQixDQUFDLFlBQVksRUFBRSxhQUFhLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDaEQsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxQyxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM3QixJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRU8sVUFBVTtRQUNoQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQWdCLENBQUM7UUFDNUUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFnQixDQUFDO1FBQzlFLElBQUk7WUFDRixRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2pCLEtBQUssT0FBTztvQkFDVixnREFBZ0Q7b0JBQ2hELE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUNoRSxJQUFJLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUM5QixJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztvQkFDcEMsTUFBTTtnQkFDUixLQUFLLEtBQUs7b0JBQ1IsZ0RBQWdEO29CQUNoRCxNQUFNLENBQUUsQUFBRCxFQUFHLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQzdELElBQUksQ0FBQyxNQUFNLEdBQUMscUJBQXFCLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQTtvQkFDdEQsTUFBTTtnQkFDUixLQUFLLEtBQUs7b0JBQ1IsZ0RBQWdEO29CQUNoRCxJQUFJLENBQUMsTUFBTSxHQUFDLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3BGLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQzlELElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUM1RSxJQUFJLENBQUMsTUFBTSxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFBO29CQUM5QixNQUFNO2dCQUNSLEtBQUssVUFBVTtvQkFDYixNQUFNO2dCQUNSO29CQUNFLGdEQUFnRDtvQkFDaEQsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzlDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxTQUFTLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7b0JBQ2pFLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUM3RSxJQUFJLENBQUMsU0FBUyxHQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDO29CQUNqQyxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO29CQUNuQyxNQUFNO2FBQ1Q7WUFDRixJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLElBQUksQ0FBQyxTQUFTLEtBQUcsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztTQUNoSjtRQUFDLE9BQU8sR0FBRyxFQUFFO1lBQ1osSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzVDLE9BQU8sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEVBQUMsR0FBRyxDQUFDLENBQUM7U0FDbEQ7SUFDSCxDQUFDO0lBRU8sb0JBQW9CLENBQUMsUUFBcUIsRUFBRSxTQUFzQixFQUFFLEtBQWEsRUFBRSxNQUFXO1FBQ3BHLFFBQVEsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO1FBQzVDLGtGQUFrRjtRQUNsRiwrRUFBK0U7UUFDL0UsU0FBUyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFDLElBQUksQ0FBQyxDQUFDLENBQUE7UUFDekQsZ0ZBQWdGO0lBQ2xGLENBQUM7SUFFTyxZQUFZLENBQUMsUUFBcUIsRUFBRSxTQUFzQixFQUFFLEdBQVU7UUFDNUUsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLEVBQUUsRUFBRSxJQUFJLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDL0UsU0FBUyxDQUFDLFNBQVMsR0FBRyw0QkFBNEIsR0FBRyxDQUFDLE9BQU8sU0FBUyxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFTyxVQUFVO1FBQ2hCLE1BQU0sU0FBUyxHQUFHLG1CQUFtQixFQUFFLENBQUM7UUFDeEMsTUFBTSxXQUFXLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLElBQUksV0FBVyxFQUFFO1lBQ2YsSUFBSSxDQUFDLElBQUksR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDO1lBQzlCLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQzFEO0lBQ0gsQ0FBQztJQUVPLFlBQVksQ0FBQyxLQUFVO1FBQzdCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN4RCxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLFdBQVcsRUFBRSxJQUFJO1NBQ2xCLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFTyxhQUFhLENBQUMsS0FBVTtRQUM5QixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEQsU0FBUyxFQUFFLGlCQUFpQjtZQUM1QixXQUFXLEVBQUUsSUFBSTtTQUNsQixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRU8sZUFBZTtRQUNyQixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUcsVUFBVSxFQUFFO1lBQzFCLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1NBQ2xDO2FBQU07WUFDTCxJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztTQUNyQztJQUNILENBQUM7SUFFTyx5QkFBeUI7UUFDL0IsTUFBTSxDQUFDLENBQUMsRUFBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFZLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDdkIsT0FBTyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDaEUsT0FBTztTQUNSO1FBQ0QsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUM7UUFDcEYsSUFBSSxnQkFBZ0IsS0FBSyxDQUFDLENBQUMsRUFBRTtZQUMzQixJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztTQUNwRDthQUFNO1lBQ0wsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztTQUM5QztJQUNILENBQUM7SUFFTyw0QkFBNEI7UUFDbEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2pELElBQUksT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFHLFFBQVEsRUFBQztnQkFDbkMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLENBQUM7YUFDMUQ7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQUdELFNBQVMsbUJBQW1CO0lBQzFCLE9BQU87UUFDTCxFQUFFLEtBQUssRUFBRSw0QkFBNEIsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFO1FBQ3ZELEVBQUUsS0FBSyxFQUFFLG9EQUFvRCxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUU7UUFDN0UsRUFBRSxLQUFLLEVBQUUsbUNBQW1DLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTtRQUM1RCxFQUFFLEtBQUssRUFBRSw4QkFBOEIsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFO0tBQzdELENBQUM7QUFDSixDQUFDO0FBR0QsTUFBTSxZQUFZO0lBQ2hCLFNBQVMsQ0FBTTtJQUNmLFdBQVcsQ0FBMkI7SUFDdEMsT0FBTyxHQUFHLElBQUksUUFBUSxFQUFFLENBQUM7SUFDekIsSUFBSSxDQUFPO0lBQ1gsUUFBUSxDQUFTO0lBQ2pCLE1BQU0sQ0FBUztJQUNmLEtBQUssQ0FBTztJQUVaLFlBQVksV0FBbUIsRUFBRSxTQUFpQixFQUFFLFFBQWdCO1FBQ2xFLElBQUksQ0FBQyxTQUFTLEdBQUMsU0FBUyxDQUFDO1FBQ3pCLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUM7UUFFbEUsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3RSxJQUFJLENBQUMsSUFBSSxHQUFDLElBQUksSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQTtRQUM5QyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVO1lBQ3ZCLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNqQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUNELFNBQVM7UUFDUCxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztZQUM5QixJQUFJLENBQUMsTUFBTSxHQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLGNBQWMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQTs7WUFFM0UsSUFBSSxDQUFDLE1BQU0sR0FBQyxXQUFXLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxtQkFBbUIsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQTtJQUN6RixDQUFDO0lBRUQsUUFBUTtRQUNOLE1BQU0sVUFBVSxHQUFHLEVBQUUsQ0FBQztRQUN0QixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUU5RiwyQkFBMkI7UUFDM0IsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsSUFBSSxZQUFZLEdBQUcsVUFBVSxFQUFFO1lBQzdCLEtBQUssR0FBRyxVQUFVLEdBQUcsWUFBWSxDQUFDO1NBQ25DO2FBQU0sSUFBSSxZQUFZLEdBQUcsVUFBVSxFQUFFO1lBQ3BDLEtBQUssR0FBRyxVQUFVLEdBQUcsWUFBWSxDQUFDO1NBQ25DO1FBQ0QsZ0NBQWdDO1FBQ2hDLHVGQUF1RjtRQUV2RixNQUFNLEtBQUssR0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUM7UUFHMUIsTUFBTSxJQUFJLEdBQUUsQ0FBQyxLQUFLLEVBQUMsSUFBSSxFQUFDLElBQUksVUFBVSxDQUFDLEVBQUMsSUFBSSxFQUFDLGFBQWEsRUFBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLEVBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNoSCxNQUFNLEtBQUssR0FBRSxDQUFDLEtBQUssRUFBQyxJQUFJLEVBQUMsSUFBSSxVQUFVLENBQUMsRUFBQyxJQUFJLEVBQUMsYUFBYSxFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsRUFBQyxDQUFDLEVBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2SSxNQUFNLEtBQUssR0FBRSxDQUFDLEtBQUssRUFBQyxJQUFJLEVBQUMsSUFBSSxVQUFVLENBQUMsRUFBQyxJQUFJLEVBQUMsYUFBYSxFQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsRUFBQyxDQUFDLEVBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUV2SSxJQUFJLENBQUMsS0FBSyxHQUFDO1lBQ1QsSUFBSSxVQUFVLENBQUMsUUFBUSxFQUFDLEVBQUMsS0FBSyxFQUFFLE9BQU8sRUFBQyxLQUFLLEVBQUUsQ0FBQyxHQUFFLENBQUM7WUFDbkQsSUFBSSxJQUFJLENBQUMsRUFBQyxPQUFPLEVBQUUsSUFBSSxFQUFDLGFBQWEsRUFBRSxFQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUMsSUFBSSxFQUFFLEtBQUssRUFBQyxLQUFLLEVBQUUsWUFBWSxFQUFDLEVBQUMsQ0FBQztZQUN2RixJQUFJLElBQUksQ0FBQyxFQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUMsYUFBYSxFQUFFLEVBQUMsU0FBUyxFQUFFLENBQUMsRUFBQyxJQUFJLEVBQUUsUUFBUSxFQUFDLEtBQUssRUFBRSxZQUFZLEVBQUMsRUFBQyxDQUFDO1lBQzNGLElBQUksSUFBSSxDQUFDLEVBQUMsT0FBTyxFQUFFLEtBQUssRUFBQyxhQUFhLEVBQUUsRUFBQyxTQUFTLEVBQUUsQ0FBQyxFQUFDLElBQUksRUFBRSxRQUFRLEVBQUMsS0FBSyxFQUFFLFlBQVksRUFBQyxFQUFDLENBQUM7U0FDNUYsQ0FBQTtRQUdELElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLFlBQVksRUFBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFDLElBQUksRUFBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pGLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLHlCQUF5QixFQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0Y7Ozs7O2tDQUswQjtRQUMxQixJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNyRCxDQUFDO0NBQ0Y7QUFJRCxNQUFNLFNBQVUsU0FBUSxLQUFLO0lBQzNCLElBQUksQ0FBZ0I7SUFDcEIsWUFBWSxHQUFRLEVBQUMsUUFBYTtRQUNoQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLENBQUMsSUFBSSxHQUFDLElBQUksYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxNQUFNO1FBQ0osTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixNQUFNLElBQUksR0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3JCLE1BQU0sTUFBTSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDekMsTUFBTSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNqRCxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRS9CLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDO1FBRXpHLFlBQVksQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFO1lBQzFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztZQUNuRCxJQUFJLE1BQU0sQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU87UUFDTCxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN0QixDQUFDO0NBQ0Y7QUFJRCxNQUFNLFlBQVk7SUFDUixJQUFJLENBQW1CO0lBQ3ZCLENBQUMsQ0FBUztJQUNWLEVBQUUsQ0FBUztJQUNYLEtBQUssQ0FBUTtJQUNiLFFBQVEsQ0FBUTtJQUl4Qiw0QkFBNEI7SUFDcEIsTUFBTSxDQUFTO0lBQ2YsV0FBVyxDQUFTO0lBRTVCLDJCQUEyQjtJQUNuQixNQUFNLENBQVM7Q0FnRnhCO0FBR0QsTUFBTSxpQkFBa0IsU0FBUSxLQUFLO0lBQzNCLENBQUMsQ0FBUztJQUNWLENBQUMsQ0FBUztJQUNWLENBQUMsQ0FBUztJQUNWLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDVixJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ1QsU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNkLEdBQUcsR0FBRyxDQUFDLENBQUM7SUFDUixRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBRXJCLFlBQVksR0FBUSxFQUFFLE1BQWM7UUFDbEMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRCxNQUFNO1FBQ0osSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDOUIsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSw4QkFBOEIsRUFBRSxDQUFDLENBQUM7UUFDbkUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0UsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDNUUsQ0FBQztJQUVNLFFBQVE7UUFDYixPQUFPLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFTyxzQkFBc0I7UUFDNUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDaEMsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0RCxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsS0FBSyxHQUFHLFdBQVcsQ0FBQztZQUMzQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLFdBQVcsQ0FBQztZQUN6QyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLFdBQVcsQ0FBQztZQUMvQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsR0FBRyxJQUFJLFdBQVcsQ0FBQztZQUN4QyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsUUFBUSxJQUFJLFdBQVcsQ0FBQztTQUMvQztJQUNILENBQUM7Q0FDRjtBQVFELE1BQU0sY0FBZSxTQUFRLEtBQUs7SUFDeEIsQ0FBQyxDQUFTO0lBQ1YsQ0FBQyxDQUFTO0lBQ1YsQ0FBQyxDQUFTO0lBQ1YsS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNWLElBQUksR0FBRyxDQUFDLENBQUM7SUFDVCxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2QsR0FBRyxHQUFHLENBQUMsQ0FBQztJQUNSLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFFckIsWUFBWSxHQUFRLEVBQUUsTUFBYztRQUNsQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsQ0FBQztJQUVELE1BQU07UUFDSixJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUM5QixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLDhCQUE4QixFQUFFLENBQUMsQ0FBQztRQUNuRSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNyRSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzRSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwRSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRU0sUUFBUTtRQUNiLE9BQU8sY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVPLHNCQUFzQjtRQUM1QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNoQyxNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RELElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDO1lBQzNDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDO1lBQ3pDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxTQUFTLElBQUksV0FBVyxDQUFDO1lBQy9DLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxHQUFHLElBQUksV0FBVyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxRQUFRLElBQUksV0FBVyxDQUFDO1NBQy9DO0lBQ0gsQ0FBQztDQUNGO0FBT0QsU0FBUyxjQUFjO0lBQ3JCLE1BQU0sV0FBVyxHQUFDO1FBQ2hCLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsbUNBQW1DLEVBQUMsY0FBYyxFQUFFLElBQUksRUFBQztRQUNoRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLGNBQWMsRUFBQyxjQUFjLEVBQUUsMkJBQTJCLEVBQUM7UUFDbEYsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSw2QkFBNkIsRUFBQyxjQUFjLEVBQUUsNEJBQTRCLEVBQUM7S0FDbkcsQ0FBQTtJQUNELE1BQU0sT0FBTyxHQUFDLEVBQUUsQ0FBQTtJQUNoQixJQUFHO1FBQ0QsV0FBVyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUMvQixNQUFNLElBQUksR0FBQyxJQUFJLFdBQVcsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbEQsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFHLFVBQVUsQ0FBQyxjQUFjLEVBQUM7Z0JBQzVDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsRUFBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsRUFBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBQyxDQUFDLENBQUE7YUFDeEg7UUFDSCxDQUFDLENBQUMsQ0FBQztLQUNKO0lBQ0QsT0FBTSxDQUFDLEVBQUM7UUFDTixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0tBQ2Y7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtQbHVnaW4sIE1hcmtkb3duUmVuZGVyZXIsIEFwcCwgTW9kYWwsIENvbXBvbmVudCwgU2V0dGluZyxOb3RpY2UsIFdvcmtzcGFjZVdpbmRvdyxsb2FkTWF0aEpheCxyZW5kZXJNYXRoLCBNYXJrZG93blZpZXd9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBNYXRoSW5mbywgTWF0aFByYWlzZXIgfSBmcm9tIFwiLi9tYXRoRW5naW5lLmpzXCI7XG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcbmltcG9ydCB7IEN1c3RvbUlucHV0TW9kYWwsIEhpc3RvcnlNb2RhbCwgSW5wdXRNb2RhbCwgVmVjSW5wdXRNb2RlbCB9IGZyb20gXCIuL3RlbXBcIjtcbmltcG9ydCB7TWF0aFBsdWdpblNldHRpbmdzLCBERUZBVUxUX1NFVFRJTkdTLCBNYXRoUGx1Z2luU2V0dGluZ1RhYix9IGZyb20gXCIuL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBjYWxjdWxhdGVCaW5vbSwgZGVncmVlc1RvUmFkaWFucywgZmluZEFuZ2xlQnlDb3NpbmVSdWxlLCBnZXRVc2FibGVEZWdyZWVzLCBwb2xhclRvQ2FydGVzaWFuLCByYWRpYW5zVG9EZWdyZWVzLCByb3VuZEJ5U2V0dGluZ3MgfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzLmpzXCI7XG5pbXBvcnQgeyBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXRUaWt6amF4LCBGb3JtYXR0aW5nLCBUaWt6amF4IH0gZnJvbSBcIi4vdGlrempheC90aWt6amF4XCI7XG5pbXBvcnQgeyBOdW1lcmFsc1N1Z2dlc3RvciB9IGZyb20gXCIuL3N1Z2dlc3Rvci5qc1wiO1xuaW1wb3J0IHsgVGlrelN2ZyB9IGZyb20gXCIuL3Rpa3pqYXgvbXlUaWt6LmpzXCI7XG5cbmltcG9ydCB7IEVkaXRvclN0YXRlLCBTZWxlY3Rpb25SYW5nZSB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xuaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1BsdWdpbiwgVmlld1VwZGF0ZSAsRGVjb3JhdGlvbiwgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgUmFuZ2VTZXQgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcblxuLy8gQ29kZU1pcnJvciBFeHRlbnNpb24gdG8gc3R5bGUgbGluZXMgZHluYW1pY2FsbHlcbmZ1bmN0aW9uIGNyZWF0ZUNvbnRleHRCYXNlZExpbmVTdHlsaW5nKCkge1xuXG4gIC8vIERlZmluZSB0aGUgcGx1Z2luXG4gIHJldHVybiBWaWV3UGx1Z2luLmZyb21DbGFzcyhcbiAgICBjbGFzcyB7XG4gICAgICAgIGRlY29yYXRpb25zOiBSYW5nZVNldDxEZWNvcmF0aW9uPjtcblxuICAgICAgICBjb25zdHJ1Y3Rvcih2aWV3OiBFZGl0b3JWaWV3KSB7XG4gICAgICAgICAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5jb21wdXRlRGVjb3JhdGlvbnModmlldyk7XG4gICAgICAgIH1cblxuICAgICAgICB1cGRhdGUodXBkYXRlOiBWaWV3VXBkYXRlKSB7XG4gICAgICAgICAgICBpZiAodXBkYXRlLmRvY0NoYW5nZWQgfHwgdXBkYXRlLnZpZXdwb3J0Q2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmNvbXB1dGVEZWNvcmF0aW9ucyh1cGRhdGUudmlldyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBjb21wdXRlRGVjb3JhdGlvbnModmlldzogRWRpdG9yVmlldyk6IFJhbmdlU2V0PERlY29yYXRpb24+IHtcbiAgICAgICAgICAgIGNvbnN0IHdpZGdldHMgPSBbXTtcbiAgICAgICAgICAgIGZvciAobGV0IHsgZnJvbSwgdG8gfSBvZiB2aWV3LnZpc2libGVSYW5nZXMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBwb3MgPSBmcm9tOyBwb3MgPD0gdG87ICkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBsaW5lLnRleHQudHJpbSgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29udGVudFxuICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9bIzpcXHNcIj0tXFxkXFxbXFxdLlxcK1xcLV0qL2csJycpXG4gICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLzxbYS16XStbXFx3XFxzXFxkXSo+L2csJycpXG4gICAgICAgICAgICAgICAgICAgICAgLm1hdGNoKC9eW9eQLdeqXS8pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3aWRnZXRzLnB1c2goXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgRGVjb3JhdGlvbi5saW5lKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsYXNzOiBcImN1c3RvbS1ydGwtbGluZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkucmFuZ2UobGluZS5mcm9tKVxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwb3MgPSBsaW5lLnRvICsgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gRGVjb3JhdGlvbi5zZXQod2lkZ2V0cyk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHtcbiAgICAgIGRlY29yYXRpb25zOiAodikgPT4gdi5kZWNvcmF0aW9ucyxcbiAgICB9XG4pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRoUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgc2V0dGluZ3M6IE1hdGhQbHVnaW5TZXR0aW5ncztcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3I9bmV3IFRpa3pqYXgodGhpcy5hcHAsdGhpcylcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3IucmVhZHlMYXlvdXQoKTtcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IuYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCk7XG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlZ2lzdGVyVGlrekNvZGVCbG9jaygpO1xuICAgIFxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTWF0aFBsdWdpblNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJtYXRoLWVuZ2luZVwiLCB0aGlzLnByb2Nlc3NNYXRoQmxvY2suYmluZCh0aGlzKSk7XG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrempheFwiLCB0aGlzLnByb2Nlc3NUaWt6QmxvY2suYmluZCh0aGlzKSk7XG4gICAgdGhpcy5yZWdpc3RlckNvbW1hbmRzKCk7XG4gICAgdGhpcy5yZWdpc3RlckVkaXRvclN1Z2dlc3QobmV3IE51bWVyYWxzU3VnZ2VzdG9yKHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKGNyZWF0ZUNvbnRleHRCYXNlZExpbmVTdHlsaW5nKCkpO1xuICAgIC8vIEV4ZWN1dGUgdGhlIGBhKClgIG1ldGhvZCB0byBsb2cgYW5kIG1vZGlmeSBhbGwgZGl2c1xuICAgIC8vdGhpcy5wcm9jZXNzRGl2cygpO1xuICB9XG4gIG9udW5sb2FkKCkge1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0fVxuXG4gIHByb2Nlc3NUaWt6QmxvY2soc291cmNlOiBzdHJpbmcsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgY29uc3Qgc3ZnID0gbmV3IFRpa3pTdmcoc291cmNlKTtcbiAgXG4gIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiKSwge1xuICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcbiAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXG4gIH0pO1xuICBcblxuICBjb25zdCBncmFwaCA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgIHN0eWxlOiBcImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1wiXG4gIH0pO1xuICBncmFwaC5hcHBlbmRDaGlsZChzdmcuZ2V0U3ZnKCkpO1xuICBzdmcuZGVidWdJbmZvKz1ncmFwaC5vdXRlckhUTUxcbiAgY29uc29sZS5sb2coZ3JhcGgub3V0ZXJIVE1MKVxuICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgc3ZnLmRlYnVnSW5mbykub3BlbigpO1xuICBcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xuICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JhcGgpO1xufVxuXG5cbiAgcHJpdmF0ZSBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG4gICAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgIGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XG4gIH1cblxuICBwcml2YXRlIHJlZ2lzdGVyQ29tbWFuZHMoKSB7XG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcIm9wZW4taW5wdXQtZm9ybVwiLFxuICAgICAgbmFtZTogXCJPcGVuIElucHV0IEZvcm1cIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiBuZXcgVmVjSW5wdXRNb2RlbCh0aGlzLmFwcCx0aGlzKS5vcGVuKCksXG4gICAgfSk7XG5cbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidmlldy1zZXNzaW9uLWhpc3RvcnlcIixcbiAgICAgIG5hbWU6IFwiVmlldyBTZXNzaW9uIEhpc3RvcnlcIixcbiAgICAgIC8vY2FsbGJhY2s6ICgpID0+IG5ldyBIaXN0b3J5TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSxcbiAgICB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwidGVzdC1tYXRoRW5naW5lXCIsXG4gICAgICBuYW1lOiBcInRlc3QgbWF0aCBlbmdpbmVcIixcbiAgICAgIGNhbGxiYWNrOiAoKSA9PnRlc3RNYXRoRW5naW5lKCksXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIHByb2Nlc3NNYXRoQmxvY2soc291cmNlOiBzdHJpbmcsIG1haW5Db250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgbWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1jb250YWluZXJcIik7XG4gICAgXG4gICAgY29uc3QgdXNlclZhcmlhYmxlczogeyB2YXJpYWJsZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuICAgIGxldCBza2lwcGVkSW5kZXhlcyA9IDA7XG5cbiAgICBjb25zdCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKS5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSkuZmlsdGVyKGxpbmUgPT4gbGluZSk7XG4gICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCA9PT0gMCkge3JldHVybjt9XG5cbiAgICBcbiAgICBleHByZXNzaW9ucy5mb3JFYWNoKChleHByZXNzaW9uLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IGxpbmVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGxpbmVDb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtbGluZS1jb250YWluZXJcIiwgKGluZGV4LXNraXBwZWRJbmRleGVzKSAlIDIgPT09IDAgPyBcIm1hdGgtcm93LWV2ZW5cIiA6IFwibWF0aC1yb3ctb2RkXCIpO1xuICAgICAgLy9pZiAoZXhwcmVzc2lvbi5tYXRjaCgvXlxcL1xcLy8pKXt9XG4gICAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xuICAgICAgcHJvY2Vzc01hdGguaW5pdGlhbGl6ZSgpO1xuXG4gICAgICBpZihwcm9jZXNzTWF0aC5tb2RlIT09XCJ2YXJpYWJsZVwiKXtcbiAgICAgICAgbGluZUNvbnRhaW5lciA9IHByb2Nlc3NNYXRoLmNvbnRhaW5lciBhcyBIVE1MRGl2RWxlbWVudDtcbiAgICAgICAgbWFpbkNvbnRhaW5lci5hcHBlbmRDaGlsZChsaW5lQ29udGFpbmVyKTtcbiAgICAgIH1cbiAgICAgIGVsc2V7c2tpcHBlZEluZGV4ZXMrKzt9XG4gICAgfSk7XG4gIH1cbn1cblxuXG5cblxuY2xhc3MgUHJvY2Vzc01hdGgge1xuICBtYXRoSW5wdXQ6IGFueTtcbiAgdXNlclZhcmlhYmxlczogeyB2YXJpYWJsZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuICBtb2RlID0gXCJtYXRoXCI7XG4gIHJlc3VsdDogYW55O1xuICBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICBpY29uc0RpdjogSFRNTEVsZW1lbnQ7XG4gIGFwcDogQXBwO1xuXG4gIGNvbnN0cnVjdG9yKG1hdGhJbnB1dDogc3RyaW5nLHVzZXJWYXJpYWJsZXM6IGFueSwgYXBwOiBBcHAsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICB0aGlzLm1hdGhJbnB1dCA9IG1hdGhJbnB1dDtcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXM9dXNlclZhcmlhYmxlcztcbiAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcbiAgICB0aGlzLmljb25zRGl2ID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pY29uc1wiLFxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcbiAgICB0aGlzLmFzc2lnbk1vZGUoKTtcbiAgICB0aGlzLnNldHVwQ29udGFpbmVyKCk7XG4gICAgdGhpcy5oYW5kbGVWYXJpYWJsZXMoKTtcbiAgICB0aGlzLnJlbmRlck1hdGgoKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBDb250YWluZXIoKSB7XG4gICAgW1wibWF0aC1pbnB1dFwiLCBcIm1hdGgtcmVzdWx0XCJdLmZvckVhY2goY2xhc3NOYW1lID0+IHtcbiAgICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICBkaXYuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICB9KTtcbiAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmljb25zRGl2KTtcbiAgfVxuXG4gIHByaXZhdGUgcmVuZGVyTWF0aCgpIHtcbiAgICBjb25zdCBpbnB1dERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1pbnB1dFwiKSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCByZXN1bHREaXYgPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFwiLm1hdGgtcmVzdWx0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgIHRyeSB7XG4gICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xuICAgICAgICBjYXNlIFwiYmlub21cIjpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICBjb25zdCBiaW5vbU1vZGVsID0gbmV3IEJpbm9tSW5mb01vZGVsKHRoaXMuYXBwLCB0aGlzLm1hdGhJbnB1dCk7XG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwoYmlub21Nb2RlbCk7XG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSBiaW5vbU1vZGVsLmdldEVxdWFsKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJjb3NcIjpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICBjb25zdCBbICwgc2lkZUEsIHNpZGVCLCBzaWRlQyBdID0gdGhpcy5tYXRoSW5wdXQubWFwKE51bWJlcik7XG4gICAgICAgICAgdGhpcy5yZXN1bHQ9ZmluZEFuZ2xlQnlDb3NpbmVSdWxlKHNpZGVBLCBzaWRlQiwgc2lkZUMpXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJ2ZWNcIjpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICB0aGlzLnJlc3VsdD1uZXcgVmVjUHJvY2Vzc29yKHRoaXMubWF0aElucHV0WzFdLHRoaXMubWF0aElucHV0WzJdLHRoaXMubWF0aElucHV0WzNdKTtcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgdGlrekdyYXBoKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5ncmFwaCkpO1xuICAgICAgICAgIHRoaXMuYWRkRGVidWdNb2RlbChuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQudmVjSW5mby5kZWJ1Z0luZm8pKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdD10aGlzLnJlc3VsdC5yZXN1bHRcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSBuZXcgTWF0aFByYWlzZXIodGhpcy5tYXRoSW5wdXQpO1xuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvKSk7XG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5tYXRoSW5mby5kZWJ1Z0luZm8pKTtcbiAgICAgICAgICB0aGlzLm1hdGhJbnB1dD10aGlzLnJlc3VsdC5pbnB1dDtcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IHRoaXMucmVzdWx0LnNvbHV0aW9uO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICB0aGlzLmFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2LCByZXN1bHREaXYsIHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCI/dGhpcy5tYXRoSW5wdXQ6dGhpcy5tYXRoSW5wdXRbMF0sIHJvdW5kQnlTZXR0aW5ncyh0aGlzLnJlc3VsdCkpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgdGhpcy5kaXNwbGF5RXJyb3IoaW5wdXREaXYsIHJlc3VsdERpdiwgZXJyKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaGUgaW5pdGlhbCBwcmFpc2luZyBmYWlsZWRcIixlcnIpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBpbnB1dDogc3RyaW5nLCByZXN1bHQ6IGFueSkge1xuICAgIGlucHV0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoaW5wdXQsdHJ1ZSkpXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCR7JHtpbnB1dH19JGAsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xuICAgIC8vY29uc3QgcmVzdWx0T3V0cHV0ID0gLyh0cnVlfGZhbHNlKS8udGVzdChyZXN1bHQpID8gcmVzdWx0IDogYFxcJHske3Jlc3VsdH19JGA7XG4gICAgcmVzdWx0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgocmVzdWx0LnRvU3RyaW5nKCksdHJ1ZSkpXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHJlc3VsdE91dHB1dCwgcmVzdWx0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBkaXNwbGF5RXJyb3IoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBlcnI6IEVycm9yKSB7XG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bih0aGlzLm1hdGhJbnB1dCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj4ke2Vyci5tZXNzYWdlfTwvc3Bhbj5gO1xuICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWVycm9yLWxpbmVcIik7XG4gIH1cblxuICBwcml2YXRlIGFzc2lnbk1vZGUoKSB7XG4gICAgY29uc3QgcmVnZXhMaXN0ID0gR2V0TWF0aENvbnRleHRSZWdleCgpO1xuICAgIGNvbnN0IG1hdGNoT2JqZWN0ID0gcmVnZXhMaXN0LmZpbmQocmVnZXhPYmogPT4gcmVnZXhPYmoucmVnZXgudGVzdCh0aGlzLm1hdGhJbnB1dCkpO1xuICAgIGlmIChtYXRjaE9iamVjdCkge1xuICAgICAgdGhpcy5tb2RlID0gbWF0Y2hPYmplY3QudmFsdWU7XG4gICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0Lm1hdGNoKG1hdGNoT2JqZWN0LnJlZ2V4KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFkZEluZm9Nb2RhbChtb2RhbDogYW55KSB7XG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtaW5mby1pY29uXCIsXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXG4gICAgfSk7XG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XG4gIH1cblxuICBwcml2YXRlIGFkZERlYnVnTW9kZWwobW9kYWw6IGFueSkge1xuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcbiAgICAgIHRleHRDb250ZW50OiBcIvCfkJ5cIixcbiAgICB9KTtcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVzKCkge1xuICAgIGlmICh0aGlzLm1vZGU9PT1cInZhcmlhYmxlXCIpIHtcbiAgICAgIHRoaXMuaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKSB7XG4gICAgY29uc3QgW18sdmFyaWFibGUsIHZhbHVlXSA9IHRoaXMubWF0aElucHV0Lm1hcCgocGFydDogc3RyaW5nKSA9PiBwYXJ0LnRyaW0oKSk7XG4gICAgaWYgKCF2YXJpYWJsZSB8fCAhdmFsdWUpIHtcbiAgICAgIGNvbnNvbGUud2FybihgSW52YWxpZCB2YXJpYWJsZSBkZWNsYXJhdGlvbjogJHt0aGlzLm1hdGhJbnB1dH1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZXhpc3RpbmdWYXJJbmRleCA9IHRoaXMudXNlclZhcmlhYmxlcy5maW5kSW5kZXgodiA9PiB2LnZhcmlhYmxlID09PSB2YXJpYWJsZSk7XG4gICAgaWYgKGV4aXN0aW5nVmFySW5kZXggIT09IC0xKSB7XG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXNbZXhpc3RpbmdWYXJJbmRleF0udmFsdWUgPSB2YWx1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZSwgdmFsdWUgfSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCl7XG4gICAgdGhpcy51c2VyVmFyaWFibGVzLmZvckVhY2goKHsgdmFyaWFibGUsIHZhbHVlIH0pID0+IHtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5yZXBsYWNlKHZhcmlhYmxlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBHZXRNYXRoQ29udGV4dFJlZ2V4KCkge1xuICByZXR1cm4gW1xuICAgIHsgcmVnZXg6IC9iaW5vbVxcKChcXGQrKSwoXFxkKyksKFxcZCspXFwpLywgdmFsdWU6IFwiYmlub21cIiB9LFxuICAgIHsgcmVnZXg6IC92ZWMoWystXXswLDJ9KVxcKChbXFxkListXStbOixdW1xcZC4rLV0rKVxcKShbXFxkListXSopLywgdmFsdWU6IFwidmVjXCIgfSxcbiAgICB7IHJlZ2V4OiAvY29zXFwoKFtcXGQuXSspLChbXFxkLl0rKSwoW1xcZC5dKylcXCkvLCB2YWx1ZTogXCJjb3NcIiB9LFxuICAgIHsgcmVnZXg6IC92YXJcXHMqKFtcXHddKylcXHMqPVxccyooW1xcZC5dKykvLCB2YWx1ZTogXCJ2YXJpYWJsZVwiIH0sXG4gIF07XG59XG5cblxuY2xhc3MgVmVjUHJvY2Vzc29yIHtcbiAgdXNlcklucHV0OiBhbnk7XG4gIGVudmlyb25tZW50OiB7IFg6IHN0cmluZzsgWTogc3RyaW5nIH07XG4gIHZlY0luZm8gPSBuZXcgTWF0aEluZm8oKTtcbiAgYXhpczogQXhpcztcbiAgbW9kaWZpZXI6IG51bWJlcjtcbiAgcmVzdWx0OiBzdHJpbmc7XG4gIGdyYXBoPzogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGVudmlyb25tZW50OiBzdHJpbmcsIG1hdGhJbnB1dDogc3RyaW5nLCBtb2RpZmllcjogc3RyaW5nKSB7XG4gICAgdGhpcy51c2VySW5wdXQ9bWF0aElucHV0O1xuICAgIGNvbnN0IG1hdGNoID0gZW52aXJvbm1lbnQubWF0Y2goLyhbKy1dPykoWystXT8pLyk7XG4gICAgdGhpcy5lbnZpcm9ubWVudCA9IHsgWDogbWF0Y2g/LlsxXSA/PyBcIitcIiwgWTogbWF0Y2g/LlsyXSA/PyBcIitcIiB9O1xuXG4gICAgdGhpcy5tb2RpZmllciA9IG1vZGlmaWVyLmxlbmd0aCA+IDAgPyBnZXRVc2FibGVEZWdyZWVzKE51bWJlcihtb2RpZmllcikpIDogMDtcblxuICAgIHRoaXMuYXhpcz1uZXcgQXhpcygpLnVuaXZlcnNhbCh0aGlzLnVzZXJJbnB1dClcbiAgICBpZiAoIXRoaXMuYXhpcy5wb2xhckFuZ2xlKVxuICAgICAgdGhpcy5heGlzLmNhcnRlc2lhblRvUG9sYXIoKTtcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiYXhpc1wiLHRoaXMuYXhpcyk7XG4gICAgdGhpcy5hZGRSZXN1bHQoKTtcbiAgICB0aGlzLmFkZEdyYXBoKCk7XG4gIH1cbiAgYWRkUmVzdWx0KCl7XG4gICAgaWYgKHRoaXMudXNlcklucHV0LmluY2x1ZGVzKFwiOlwiKSlcbiAgICAgIHRoaXMucmVzdWx0PWB4ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWH1cXFxccXVhZCx5ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWX1gXG4gICAgZWxzZVxuICAgICAgdGhpcy5yZXN1bHQ9YGFuZ2xlID0gJHt0aGlzLmF4aXMucG9sYXJBbmdsZX1cXFxccXVhZCxsZW5ndGggPSAke3RoaXMuYXhpcy5wb2xhckxlbmd0aH1gXG4gIH1cbiAgXG4gIGFkZEdyYXBoKCkge1xuICAgIGNvbnN0IHRhcmdldFNpemUgPSAxMDtcbiAgICBjb25zdCBtYXhDb21wb25lbnQgPSBNYXRoLm1heChNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWCksIE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKSk7XG5cbiAgICAvLyBEZXRlcm1pbmUgc2NhbGluZyBmYWN0b3JcbiAgICBsZXQgc2NhbGUgPSAxO1xuICAgIGlmIChtYXhDb21wb25lbnQgPCB0YXJnZXRTaXplKSB7XG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XG4gICAgfSBlbHNlIGlmIChtYXhDb21wb25lbnQgPiB0YXJnZXRTaXplKSB7XG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XG4gICAgfVxuICAgIC8vIGkgbmVlZCB0byBtYWtlIGl0IFwidG8gWCBheGlzXCJcbiAgICAvL2NvbnN0IHZlY3RvckFuZ2xlID0gZ2V0VXNhYmxlRGVncmVlcyhyYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbjIoc2NhbGVkWSwgc2NhbGVkWCkpKTtcbiAgICBcbiAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygwLDApO1xuXG5cbiAgICBjb25zdCBkcmF3PSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5wb2xhckxlbmd0aC50b1N0cmluZygpfSksdGhpcy5heGlzXTtcbiAgICBjb25zdCBkcmF3WD0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWC50b1N0cmluZygpfSksbmV3IEF4aXModGhpcy5heGlzLmNhcnRlc2lhblgsMCldO1xuICAgIGNvbnN0IGRyYXdZPSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZLnRvU3RyaW5nKCl9KSxuZXcgQXhpcygwLHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKV07XG5cbiAgICB0aGlzLmdyYXBoPVtcbiAgICAgIG5ldyBGb3JtYXR0aW5nKFwiZ2xvYm9sXCIse2NvbG9yOiBcIndoaXRlXCIsc2NhbGU6IDEsfSksXG4gICAgICBuZXcgRHJhdyh7ZHJhd0FycjogZHJhdyxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwicmVkXCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxuICAgICAgbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdYLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXG4gICAgICBuZXcgRHJhdyh7ZHJhd0FycjogZHJhd1ksZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcbiAgICBdXG4gICAgXG4gICAgXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGhcIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRva2VucyxudWxsLDEpKTtcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaC50b1N0cmluZygpXFxuXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b1N0cmluZygpKSk7XG4gICAgLyogR2VuZXJhdGUgTGFUZVggY29kZSBmb3IgdmVjdG9yIGNvbXBvbmVudHMgYW5kIG1haW4gdmVjdG9yXG4gICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXG5cbiAgICAgICUgQW5nbGUgQW5ub3RhdGlvblxuICAgICAgJVxcYW5ne1h9e2FuY317dmVjfXt9eyR7cm91bmRCeVNldHRpbmdzKHZlY3RvckFuZ2xlKX0kXntcXGNpcmN9JH1cbiAgICBgLnJlcGxhY2UoL15cXHMrL2dtLCBcIlwiKTsqL1xuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJTY2FsaW5nIGZhY3RvclwiLCBzY2FsZSk7XG4gIH1cbn1cblxuXG5cbmNsYXNzIHRpa3pHcmFwaCBleHRlbmRzIE1vZGFsIHtcbiAgdGlrejogRm9ybWF0VGlrempheDtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsdGlrekNvZGU6IGFueSl7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnRpa3o9bmV3IEZvcm1hdFRpa3pqYXgodGlrekNvZGUpO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnN0IGNvZGU9dGhpcy50aWt6O1xuICAgIGNvbnN0IHNjcmlwdCA9IGNvbnRlbnRFbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xuICAgIHNjcmlwdC5zZXRUZXh0KGNvZGUuZ2V0Q29kZSgpKTtcbiAgICBcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcblxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6LmdldENvZGUoKSk7XG4gICAgICBuZXcgTm90aWNlKFwiR3JhcGggY29waWVkIHRvIGNsaXBib2FyZCFcIik7XG4gICAgfSk7XG4gIH1cbiAgb25DbG9zZSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICB9XG59XG5cbnR5cGUgRGlzdHJpYnV0aW9uVHlwZSA9ICdub3JtYWwnIHwgJ2Jpbm9taWFsJyB8ICdwb2lzc29uJztcblxuY2xhc3MgRGlzdHJpYnV0aW9uIHtcbiAgcHJpdmF0ZSB0eXBlOiBEaXN0cmlidXRpb25UeXBlO1xuICBwcml2YXRlIHg6IG51bWJlcjtcbiAgcHJpdmF0ZSBtdTogbnVtYmVyO1xuICBwcml2YXRlIHNpZ21hOiBudW1iZXJcbiAgcHJpdmF0ZSB2YXJpYW5jZTogbnVtYmVyXG5cbiAgXG5cbiAgLy8gRm9yIEJpbm9taWFsIERpc3RyaWJ1dGlvblxuICBwcml2YXRlIHRyaWFsczogbnVtYmVyO1xuICBwcml2YXRlIHByb2JhYmlsaXR5OiBudW1iZXI7XG5cbiAgLy8gRm9yIFBvaXNzb24gRGlzdHJpYnV0aW9uXG4gIHByaXZhdGUgbGFtYmRhOiBudW1iZXI7XG4gIC8qXG4gIGNvbnN0cnVjdG9yKHR5cGU6IERpc3RyaWJ1dGlvblR5cGUsIHBhcmFtczogUmVjb3JkPHN0cmluZywgbnVtYmVyPikge1xuICAgIHRoaXMudHlwZSA9IHR5cGU7XG5cbiAgICAvLyBJbml0aWFsaXplIGJhc2VkIG9uIGRpc3RyaWJ1dGlvbiB0eXBlXG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdub3JtYWwnOlxuICAgICAgICB0aGlzLm1lYW4gPSBwYXJhbXMubWVhbiB8fCAwO1xuICAgICAgICB0aGlzLnN0ZERldiA9IHBhcmFtcy5zdGREZXYgfHwgMTtcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMuc3RkRGV2ICoqIDI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnYmlub21pYWwnOlxuICAgICAgICB0aGlzLnRyaWFscyA9IHBhcmFtcy50cmlhbHMgfHwgMTtcbiAgICAgICAgdGhpcy5wcm9iYWJpbGl0eSA9IHBhcmFtcy5wcm9iYWJpbGl0eSB8fCAwLjU7XG4gICAgICAgIHRoaXMubWVhbiA9IHRoaXMudHJpYWxzICogdGhpcy5wcm9iYWJpbGl0eTtcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubWVhbiAqICgxIC0gdGhpcy5wcm9iYWJpbGl0eSk7XG4gICAgICAgIHRoaXMuc3RkRGV2ID0gTWF0aC5zcXJ0KHRoaXMudmFyaWFuY2UpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BvaXNzb24nOlxuICAgICAgICB0aGlzLmxhbWJkYSA9IHBhcmFtcy5sYW1iZGEgfHwgMTtcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy5sYW1iZGE7XG4gICAgICAgIHRoaXMudmFyaWFuY2UgPSB0aGlzLmxhbWJkYTtcbiAgICAgICAgdGhpcy5zdGREZXYgPSBNYXRoLnNxcnQodGhpcy52YXJpYW5jZSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBkaXN0cmlidXRpb24gdHlwZScpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBub3JtYWxQREYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAnbm9ybWFsJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XG4gICAgfVxuICAgIGNvbnN0IGV4cFBhcnQgPSBNYXRoLmV4cCgtKCh4IC0gdGhpcy5tZWFuKSAqKiAyKSAvICgyICogdGhpcy52YXJpYW5jZSkpO1xuICAgIHJldHVybiAoMSAvICh0aGlzLnN0ZERldiAqIE1hdGguc3FydCgyICogTWF0aC5QSSkpKSAqIGV4cFBhcnQ7XG4gIH1cblxuICBwdWJsaWMgbm9ybWFsQ0RGKHg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ25vcm1hbCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ0RGIG9ubHkgYXBwbGllcyB0byB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbicpO1xuICAgIH1cbiAgICByZXR1cm4gMC41ICogKDEgKyB0aGlzLmVyZigoeCAtIHRoaXMubWVhbikgLyAoTWF0aC5zcXJ0KDIpICogdGhpcy5zdGREZXYpKSk7XG4gIH1cblxuICBwdWJsaWMgYmlub21pYWxQTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAnYmlub21pYWwnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BNRiBvbmx5IGFwcGxpZXMgdG8gdGhlIEJpbm9taWFsIERpc3RyaWJ1dGlvbicpO1xuICAgIH1cbiAgICBjb25zdCBjb21iaW5hdGlvbiA9IHRoaXMuZmFjdG9yaWFsKHRoaXMudHJpYWxzKSAvXG4gICAgICAodGhpcy5mYWN0b3JpYWwoeCkgKiB0aGlzLmZhY3RvcmlhbCh0aGlzLnRyaWFscyAtIHgpKTtcbiAgICByZXR1cm4gY29tYmluYXRpb24gKiBNYXRoLnBvdyh0aGlzLnByb2JhYmlsaXR5LCB4KSAqIE1hdGgucG93KDEgLSB0aGlzLnByb2JhYmlsaXR5LCB0aGlzLnRyaWFscyAtIHgpO1xuICB9XG5cbiAgcHVibGljIHBvaXNzb25QTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAncG9pc3NvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUE1GIG9ubHkgYXBwbGllcyB0byB0aGUgUG9pc3NvbiBEaXN0cmlidXRpb24nKTtcbiAgICB9XG4gICAgcmV0dXJuIChNYXRoLnBvdyh0aGlzLmxhbWJkYSwgeCkgKiBNYXRoLmV4cCgtdGhpcy5sYW1iZGEpKSAvIHRoaXMuZmFjdG9yaWFsKHgpO1xuICB9XG5cbiAgcHJpdmF0ZSBlcmYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBzaWduID0geCA8IDAgPyAtMSA6IDE7XG4gICAgY29uc3QgYSA9IDAuMzI3NTkxMTtcbiAgICBjb25zdCBwID0gMC4yNTQ4Mjk1OTI7XG4gICAgY29uc3QgcSA9IC0wLjI4NDQ5NjczNjtcbiAgICBjb25zdCByID0gMS40MjE0MTM3NDE7XG4gICAgY29uc3QgcyA9IC0xLjQ1MzE1MjAyNztcbiAgICBjb25zdCB0ID0gMS4wNjE0MDU0Mjk7XG4gICAgY29uc3QgdSA9IDEgKyBhICogTWF0aC5hYnMoeCk7XG4gICAgY29uc3QgcG9seSA9ICgoKCgocCAqIHUgKyBxKSAqIHUgKyByKSAqIHUgKyBzKSAqIHUgKyB0KSAqIHUpO1xuICAgIHJldHVybiBzaWduICogKDEgLSBwb2x5ICogTWF0aC5leHAoLXggKiB4KSk7XG4gIH1cblxuICBwcml2YXRlIGZhY3RvcmlhbChuOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChuIDwgMCkgcmV0dXJuIE5hTjtcbiAgICBsZXQgcmVzdWx0ID0gMTtcbiAgICBmb3IgKGxldCBpID0gMjsgaSA8PSBuOyBpKyspIHJlc3VsdCAqPSBpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0qL1xufVxuXG5cbmNsYXNzIERpc3RyaWJ1dGlvbk1vZGVsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG46IG51bWJlcjtcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XG4gIHByaXZhdGUgcDogbnVtYmVyO1xuICBwcml2YXRlIGVxdWFsID0gMDtcbiAgcHJpdmF0ZSBsZXNzID0gMDtcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xuICBwcml2YXRlIGJpZyA9IDA7XG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuayA9IGs7XG4gICAgdGhpcy5wID0gcDtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xuICB9XG5cbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgIH1cbiAgfVxufVxuXG5cblxuXG5cblxuXG5jbGFzcyBCaW5vbUluZm9Nb2RlbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XG4gIHByaXZhdGUgazogbnVtYmVyO1xuICBwcml2YXRlIHA6IG51bWJlcjtcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XG4gIHByaXZhdGUgbGVzcyA9IDA7XG4gIHByaXZhdGUgbGVzc0VxdWFsID0gMDtcbiAgcHJpdmF0ZSBiaWcgPSAwO1xuICBwcml2YXRlIGJpZ0VxdWFsID0gMDtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihhcHApO1xuICAgIGNvbnN0IFtfLCBuLCBrLCBwXSA9IHNvdXJjZS5tYXRjaCgvXFxkKy9nKSEubWFwKE51bWJlcik7XG4gICAgdGhpcy5uID0gbjtcbiAgICB0aGlzLmsgPSBrO1xuICAgIHRoaXMucCA9IHA7XG4gIH1cblxuICBvbk9wZW4oKSB7XG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkJpbm9taWFsIFByb2JhYmlsaXR5IFJlc3VsdHNcIiB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRFcXVhbCgpOiBudW1iZXIge1xuICAgIHJldHVybiBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIHRoaXMuaywgdGhpcy5wKTtcbiAgfVxuXG4gIHByaXZhdGUgY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xuICAgICAgY29uc3QgcHJvYmFiaWxpdHkgPSBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIGksIHRoaXMucCk7XG4gICAgICBpZiAoaSA9PT0gdGhpcy5rKSB0aGlzLmVxdWFsID0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPD0gdGhpcy5rKSB0aGlzLmxlc3NFcXVhbCArPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpID4gdGhpcy5rKSB0aGlzLmJpZyArPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcbiAgICB9XG4gIH1cbn1cblxuXG5cblxuXG5cbmZ1bmN0aW9uIHRlc3RNYXRoRW5naW5lKCl7XG4gIGNvbnN0IGV4cHJlc3Npb25zPVtcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2AyIFxcZnJhY3soNS0zKTM0fXtcXHNxcnR7Ml57Mn19fTAuNWAsZXhwZWN0ZWRPdXRwdXQ6ICczNCd9LFxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YCh4KzEpKHgrMyk9MmAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTAuMjY3OTUseF8yPS0zLjczMjA1J30sXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgXFxmcmFjezEzMn17MTI2MCt4XnsyfX09MC4wNWAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTM3LjE0ODM1LHhfMj0zNy4xNDgzNSd9LFxuICBdXG4gIGNvbnN0IHJlc3VsdHM9W11cbiAgdHJ5e1xuICAgIGV4cHJlc3Npb25zLmZvckVhY2goZXhwcmVzc2lvbiA9PiB7XG4gICAgICBjb25zdCBtYXRoPW5ldyBNYXRoUHJhaXNlcihleHByZXNzaW9uLmV4cHJlc3Npb24pO1xuICAgICAgaWYgKG1hdGguc29sdXRpb24hPT1leHByZXNzaW9uLmV4cGVjdGVkT3V0cHV0KXtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtleHByZXNzaW9uOiBleHByZXNzaW9uLmV4cHJlc3Npb24sZXhwZWN0ZWRPdXRwdXQ6IGV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQsYWN0dWFsT3V0cHV0OiBtYXRoLnNvbHV0aW9ufSlcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICBjYXRjaChlKXtcbiAgICBjb25zb2xlLmxvZyhlKVxuICB9XG59Il19