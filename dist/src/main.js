import { Plugin, MarkdownRenderer, Modal, Component, Notice, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, MathPluginSettingTab, } from "./settings";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities.js";
import { Axis, Coordinate, Draw, Tikzjax } from "./tikzjax/tikzjax";
import { NumeralsSuggestor } from "./suggestor.js";
import { TikzSvg } from "./tikzjax/myTikz.js";
import { ViewPlugin, Decoration, } from "@codemirror/view";
import { FormatTikzjax } from "./tikzjax/interpret/tokenizeTikzjax.js";
class RtlForc {
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
                    .replace(/[#:\s"=-\d\[\].\+\-]*/g, "")
                    .replace(/<[a-z]+[\w\s\d]*>/g, "")
                    .match(/^[א-ת]/)) {
                    widgets.push(Decoration.line({
                        class: "custom-rtl-line",
                    }).range(line.from));
                }
                pos = line.to + 1;
            }
        }
        return Decoration.set(widgets);
    }
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
        this.createContextBasedLineStyling();
        this.registerEditorSuggest(new NumeralsSuggestor(this));
        // Execute the `a()` method to log and modify all divs
        //this.processDivs();
    }
    onunload() {
        this.tikzProcessor.unloadTikZJaxAllWindows();
        this.tikzProcessor.removeSyntaxHighlighting();
    }
    createContextBasedLineStyling() {
        this.registerEditorExtension(ViewPlugin.fromClass(RtlForc, {
            decorations: (v) => v.decorations,
        }));
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
            //new Formatting("globol",{color: "white",scale: 1,}),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEVBQThCLFVBQVUsRUFBNkcsTUFBTSxVQUFVLENBQUM7QUFFN08sT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3ZELE9BQU8sRUFBOEMsYUFBYSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ25GLE9BQU8sRUFBcUIsZ0JBQWdCLEVBQUUsb0JBQW9CLEdBQUUsTUFBTSxZQUFZLENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBb0IscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQXNDLGVBQWUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BLLE9BQU8sRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBYyxPQUFPLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUNoRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNuRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFJOUMsT0FBTyxFQUFjLFVBQVUsRUFBYyxVQUFVLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQztBQUNuRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHdkUsTUFBTSxPQUFPO0lBQ1gsV0FBVyxDQUF1QjtJQUVsQyxZQUFZLElBQWdCO1FBQzFCLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ25ELENBQUM7SUFFRCxNQUFNLENBQUMsTUFBa0I7UUFDdkIsSUFBSSxNQUFNLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxlQUFlLEVBQUU7WUFDL0MsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3pEO0lBQ0gsQ0FBQztJQUVELGtCQUFrQixDQUFDLElBQWdCO1FBQ2pDLE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQztRQUNuQixLQUFLLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksSUFBSSxDQUFDLGFBQWEsRUFBRTtZQUMzQyxLQUFLLElBQUksR0FBRyxHQUFHLElBQUksRUFBRSxHQUFHLElBQUksRUFBRSxHQUFJO2dCQUNoQyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3hDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ2pDLElBQ0UsT0FBTztxQkFDSixPQUFPLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxDQUFDO3FCQUNyQyxPQUFPLENBQUMsb0JBQW9CLEVBQUUsRUFBRSxDQUFDO3FCQUNqQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQ2xCO29CQUNBLE9BQU8sQ0FBQyxJQUFJLENBQ1YsVUFBVSxDQUFDLElBQUksQ0FBQzt3QkFDZCxLQUFLLEVBQUUsaUJBQWlCO3FCQUN6QixDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FDcEIsQ0FBQztpQkFDSDtnQkFDRCxHQUFHLEdBQUcsSUFBSSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7YUFDbkI7U0FDRjtRQUNELE9BQU8sVUFBVSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNqQyxDQUFDO0NBQ0Y7QUFLRCxNQUFNLENBQUMsT0FBTyxPQUFPLFVBQVcsU0FBUSxNQUFNO0lBQzVDLFFBQVEsQ0FBcUI7SUFDN0IsYUFBYSxDQUFTO0lBQ3RCLEtBQUssQ0FBQyxNQUFNO1FBQ1YsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDMUIsSUFBSSxDQUFDLGFBQWEsR0FBQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFDLElBQUksQ0FBQyxDQUFBO1FBQzdDLElBQUksQ0FBQyxhQUFhLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzNDLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUV6QyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzdELElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3pGLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxDQUFBO1FBRXBDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFFeEQsc0RBQXNEO1FBQ3RELHFCQUFxQjtJQUN2QixDQUFDO0lBQ0QsUUFBUTtRQUNSLElBQUksQ0FBQyxhQUFhLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUM3QyxJQUFJLENBQUMsYUFBYSxDQUFDLHdCQUF3QixFQUFFLENBQUM7SUFDL0MsQ0FBQztJQUNBLDZCQUE2QjtRQUMzQixJQUFJLENBQUMsdUJBQXVCLENBQ3hCLFVBQVUsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFO1lBQzlCLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVc7U0FDbEMsQ0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsZ0JBQWdCLENBQUMsTUFBYyxFQUFFLFNBQXNCO1FBQ3ZELE1BQU0sR0FBRyxHQUFHLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRWhDLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNwRCxTQUFTLEVBQUUsaUJBQWlCO1lBQzVCLFdBQVcsRUFBRSxJQUFJO1NBQ2xCLENBQUMsQ0FBQztRQUdILE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN6RCxLQUFLLEVBQUUsOERBQThEO1NBQ3RFLENBQUMsQ0FBQztRQUNILEtBQUssQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDaEMsR0FBRyxDQUFDLFNBQVMsSUFBRSxLQUFLLENBQUMsU0FBUyxDQUFBO1FBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFBO1FBQzVCLElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUMsSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFcEUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QixTQUFTLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFHUyxLQUFLLENBQUMsWUFBWTtRQUN4QixJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDN0UsQ0FBQztJQUVNLEtBQUssQ0FBQyxZQUFZO1FBQ3ZCLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVPLGdCQUFnQjtRQUN0QixJQUFJLENBQUMsVUFBVSxDQUFDO1lBQ2QsRUFBRSxFQUFFLGlCQUFpQjtZQUNyQixJQUFJLEVBQUUsaUJBQWlCO1lBQ3ZCLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRTtTQUN4RCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsVUFBVSxDQUFDO1lBQ2QsRUFBRSxFQUFFLHNCQUFzQjtZQUMxQixJQUFJLEVBQUUsc0JBQXNCO1lBQzVCLDBEQUEwRDtTQUMzRCxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsVUFBVSxDQUFDO1lBQ2QsRUFBRSxFQUFFLGlCQUFpQjtZQUNyQixJQUFJLEVBQUUsa0JBQWtCO1lBQ3hCLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQSxjQUFjLEVBQUU7U0FDaEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxhQUEwQjtRQUNqRSxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTlDLE1BQU0sYUFBYSxHQUEwQyxFQUFFLENBQUM7UUFDaEUsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO1FBRXZCLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckYsSUFBSSxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtZQUFDLE9BQU87U0FBQztRQUd2QyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQ3hDLElBQUksYUFBYSxHQUFtQixRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xFLGFBQWEsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLENBQUMsS0FBSyxHQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDeEgsa0NBQWtDO1lBQ2xDLE1BQU0sV0FBVyxHQUFHLElBQUksV0FBVyxDQUFDLFVBQVUsRUFBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBQyxhQUFhLENBQUMsQ0FBQztZQUN0RixXQUFXLENBQUMsVUFBVSxFQUFFLENBQUM7WUFFekIsSUFBRyxXQUFXLENBQUMsSUFBSSxLQUFHLFVBQVUsRUFBQztnQkFDL0IsYUFBYSxHQUFHLFdBQVcsQ0FBQyxTQUEyQixDQUFDO2dCQUN4RCxhQUFhLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO2FBQzFDO2lCQUNHO2dCQUFDLGNBQWMsRUFBRSxDQUFDO2FBQUM7UUFDekIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFLRCxNQUFNLFdBQVc7SUFDZixTQUFTLENBQU07SUFDZixhQUFhLEdBQTBDLEVBQUUsQ0FBQztJQUMxRCxJQUFJLEdBQUcsTUFBTSxDQUFDO0lBQ2QsTUFBTSxDQUFNO0lBQ1osU0FBUyxDQUFjO0lBQ3ZCLFFBQVEsQ0FBYztJQUN0QixHQUFHLENBQU07SUFFVCxZQUFZLFNBQWlCLEVBQUMsYUFBa0IsRUFBRSxHQUFRLEVBQUUsU0FBc0I7UUFDaEYsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLGFBQWEsR0FBQyxhQUFhLENBQUM7UUFDakMsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUMzRCxTQUFTLEVBQUUsWUFBWTtTQUN4QixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLFVBQVU7UUFDZCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDcEIsQ0FBQztJQUVPLGNBQWM7UUFDcEIsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ2hELE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDN0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVPLFVBQVU7UUFDaEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFnQixDQUFDO1FBQzVFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBZ0IsQ0FBQztRQUM5RSxJQUFJO1lBQ0YsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUNqQixLQUFLLE9BQU87b0JBQ1YsZ0RBQWdEO29CQUNoRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDaEUsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDOUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ3BDLE1BQU07Z0JBQ1IsS0FBSyxLQUFLO29CQUNSLGdEQUFnRDtvQkFDaEQsTUFBTSxDQUFFLEFBQUQsRUFBRyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBRSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUM3RCxJQUFJLENBQUMsTUFBTSxHQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUE7b0JBQ3RELE1BQU07Z0JBQ1IsS0FBSyxLQUFLO29CQUNSLGdEQUFnRDtvQkFDaEQsSUFBSSxDQUFDLE1BQU0sR0FBQyxJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNwRixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUM5RCxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDNUUsSUFBSSxDQUFDLE1BQU0sR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQTtvQkFDOUIsTUFBTTtnQkFDUixLQUFLLFVBQVU7b0JBQ2IsTUFBTTtnQkFDUjtvQkFDRSxnREFBZ0Q7b0JBQ2hELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUM5QyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUNqRSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDN0UsSUFBSSxDQUFDLFNBQVMsR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztvQkFDakMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztvQkFDbkMsTUFBTTthQUNUO1lBQ0YsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFHLFFBQVEsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7U0FDaEo7UUFBQyxPQUFPLEdBQUcsRUFBRTtZQUNaLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM1QyxPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixFQUFDLEdBQUcsQ0FBQyxDQUFDO1NBQ2xEO0lBQ0gsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFFBQXFCLEVBQUUsU0FBc0IsRUFBRSxLQUFhLEVBQUUsTUFBVztRQUNwRyxRQUFRLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtRQUM1QyxrRkFBa0Y7UUFDbEYsK0VBQStFO1FBQy9FLFNBQVMsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO1FBQ3pELGdGQUFnRjtJQUNsRixDQUFDO0lBRU8sWUFBWSxDQUFDLFFBQXFCLEVBQUUsU0FBc0IsRUFBRSxHQUFVO1FBQzVFLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsSUFBSSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLFNBQVMsQ0FBQyxTQUFTLEdBQUcsNEJBQTRCLEdBQUcsQ0FBQyxPQUFPLFNBQVMsQ0FBQztRQUN2RSxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNsRCxDQUFDO0lBRU8sVUFBVTtRQUNoQixNQUFNLFNBQVMsR0FBRyxtQkFBbUIsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNwRixJQUFJLFdBQVcsRUFBRTtZQUNmLElBQUksQ0FBQyxJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQztZQUM5QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUMxRDtJQUNILENBQUM7SUFFTyxZQUFZLENBQUMsS0FBVTtRQUM3QixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEQsU0FBUyxFQUFFLGdCQUFnQjtZQUMzQixXQUFXLEVBQUUsSUFBSTtTQUNsQixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRU8sYUFBYSxDQUFDLEtBQVU7UUFDOUIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3hELFNBQVMsRUFBRSxpQkFBaUI7WUFDNUIsV0FBVyxFQUFFLElBQUk7U0FDbEIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVPLGVBQWU7UUFDckIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsRUFBRTtZQUMxQixJQUFJLENBQUMseUJBQXlCLEVBQUUsQ0FBQztTQUNsQzthQUFNO1lBQ0wsSUFBSSxDQUFDLDRCQUE0QixFQUFFLENBQUM7U0FDckM7SUFDSCxDQUFDO0lBRU8seUJBQXlCO1FBQy9CLE1BQU0sQ0FBQyxDQUFDLEVBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBWSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM5RSxJQUFJLENBQUMsUUFBUSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ3ZCLE9BQU8sQ0FBQyxJQUFJLENBQUMsaUNBQWlDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2hFLE9BQU87U0FDUjtRQUNELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxDQUFDO1FBQ3BGLElBQUksZ0JBQWdCLEtBQUssQ0FBQyxDQUFDLEVBQUU7WUFDM0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7U0FDcEQ7YUFBTTtZQUNMLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7U0FDOUM7SUFDSCxDQUFDO0lBRU8sNEJBQTRCO1FBQ2xDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUNqRCxJQUFJLE9BQU8sSUFBSSxDQUFDLFNBQVMsS0FBRyxRQUFRLEVBQUM7Z0JBQ25DLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO2FBQzFEO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFHRCxTQUFTLG1CQUFtQjtJQUMxQixPQUFPO1FBQ0wsRUFBRSxLQUFLLEVBQUUsNEJBQTRCLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRTtRQUN2RCxFQUFFLEtBQUssRUFBRSxvREFBb0QsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFO1FBQzdFLEVBQUUsS0FBSyxFQUFFLG1DQUFtQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUU7UUFDNUQsRUFBRSxLQUFLLEVBQUUsOEJBQThCLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTtLQUM3RCxDQUFDO0FBQ0osQ0FBQztBQUdELE1BQU0sWUFBWTtJQUNoQixTQUFTLENBQU07SUFDZixXQUFXLENBQTJCO0lBQ3RDLE9BQU8sR0FBRyxJQUFJLFFBQVEsRUFBRSxDQUFDO0lBQ3pCLElBQUksQ0FBTztJQUNYLFFBQVEsQ0FBUztJQUNqQixNQUFNLENBQVM7SUFDZixLQUFLLENBQU87SUFFWixZQUFZLFdBQW1CLEVBQUUsU0FBaUIsRUFBRSxRQUFnQjtRQUNsRSxJQUFJLENBQUMsU0FBUyxHQUFDLFNBQVMsQ0FBQztRQUN6QixNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRWxFLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0UsSUFBSSxDQUFDLElBQUksR0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDOUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVTtZQUN2QixJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2xCLENBQUM7SUFDRCxTQUFTO1FBQ1AsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUM7WUFDOUIsSUFBSSxDQUFDLE1BQU0sR0FBQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxjQUFjLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUE7O1lBRTNFLElBQUksQ0FBQyxNQUFNLEdBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsbUJBQW1CLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUE7SUFDekYsQ0FBQztJQUNELFFBQVE7UUFDTixNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDdEIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFFOUYsMkJBQTJCO1FBQzNCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksWUFBWSxHQUFHLFVBQVUsRUFBRTtZQUM3QixLQUFLLEdBQUcsVUFBVSxHQUFHLFlBQVksQ0FBQztTQUNuQzthQUFNLElBQUksWUFBWSxHQUFHLFVBQVUsRUFBRTtZQUNwQyxLQUFLLEdBQUcsVUFBVSxHQUFHLFlBQVksQ0FBQztTQUNuQztRQUNELGdDQUFnQztRQUNoQyx1RkFBdUY7UUFFdkYsTUFBTSxLQUFLLEdBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFDLENBQUMsQ0FBQyxDQUFDO1FBRzFCLE1BQU0sSUFBSSxHQUFFLENBQUMsS0FBSyxFQUFDLElBQUksRUFBQyxJQUFJLFVBQVUsQ0FBQyxFQUFDLElBQUksRUFBQyxhQUFhLEVBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxFQUFDLENBQUMsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEgsTUFBTSxLQUFLLEdBQUUsQ0FBQyxLQUFLLEVBQUMsSUFBSSxFQUFDLElBQUksVUFBVSxDQUFDLEVBQUMsSUFBSSxFQUFDLGFBQWEsRUFBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLEVBQUMsQ0FBQyxFQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkksTUFBTSxLQUFLLEdBQUUsQ0FBQyxLQUFLLEVBQUMsSUFBSSxFQUFDLElBQUksVUFBVSxDQUFDLEVBQUMsSUFBSSxFQUFDLGFBQWEsRUFBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLEVBQUMsQ0FBQyxFQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFFdkksSUFBSSxDQUFDLEtBQUssR0FBQztZQUNULHNEQUFzRDtZQUN0RCxJQUFJLElBQUksQ0FBQyxFQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUMsYUFBYSxFQUFFLEVBQUMsU0FBUyxFQUFFLENBQUMsRUFBQyxJQUFJLEVBQUUsS0FBSyxFQUFDLEtBQUssRUFBRSxZQUFZLEVBQUMsRUFBQyxDQUFDO1lBQ3ZGLElBQUksSUFBSSxDQUFDLEVBQUMsT0FBTyxFQUFFLEtBQUssRUFBQyxhQUFhLEVBQUUsRUFBQyxTQUFTLEVBQUUsQ0FBQyxFQUFDLElBQUksRUFBRSxRQUFRLEVBQUMsS0FBSyxFQUFFLFlBQVksRUFBQyxFQUFDLENBQUM7WUFDM0YsSUFBSSxJQUFJLENBQUMsRUFBQyxPQUFPLEVBQUUsS0FBSyxFQUFDLGFBQWEsRUFBRSxFQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUMsSUFBSSxFQUFFLFFBQVEsRUFBQyxLQUFLLEVBQUUsWUFBWSxFQUFDLEVBQUMsQ0FBQztTQUM1RixDQUFBO1FBR0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMseUJBQXlCLEVBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRjs7Ozs7a0NBSzBCO1FBQzFCLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JELENBQUM7Q0FDRjtBQUlELE1BQU0sU0FBVSxTQUFRLEtBQUs7SUFDM0IsSUFBSSxDQUFnQjtJQUNwQixZQUFZLEdBQVEsRUFBQyxRQUFhO1FBQ2hDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELE1BQU07UUFDSixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLE1BQU0sSUFBSSxHQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDckIsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7UUFFL0IsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSx3QkFBd0IsRUFBRSxDQUFDLENBQUM7UUFFekcsWUFBWSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxHQUFHLEVBQUU7WUFDMUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1lBQ25ELElBQUksTUFBTSxDQUFDLDRCQUE0QixDQUFDLENBQUM7UUFDM0MsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTztRQUNMLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDekIsU0FBUyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3RCLENBQUM7Q0FDRjtBQUlELE1BQU0sWUFBWTtJQUNSLElBQUksQ0FBbUI7SUFDdkIsQ0FBQyxDQUFTO0lBQ1YsRUFBRSxDQUFTO0lBQ1gsS0FBSyxDQUFRO0lBQ2IsUUFBUSxDQUFRO0lBSXhCLDRCQUE0QjtJQUNwQixNQUFNLENBQVM7SUFDZixXQUFXLENBQVM7SUFFNUIsMkJBQTJCO0lBQ25CLE1BQU0sQ0FBUztDQWdGeEI7QUFHRCxNQUFNLGlCQUFrQixTQUFRLEtBQUs7SUFDM0IsQ0FBQyxDQUFTO0lBQ1YsQ0FBQyxDQUFTO0lBQ1YsQ0FBQyxDQUFTO0lBQ1YsS0FBSyxHQUFHLENBQUMsQ0FBQztJQUNWLElBQUksR0FBRyxDQUFDLENBQUM7SUFDVCxTQUFTLEdBQUcsQ0FBQyxDQUFDO0lBQ2QsR0FBRyxHQUFHLENBQUMsQ0FBQztJQUNSLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFFckIsWUFBWSxHQUFRLEVBQUUsTUFBYztRQUNsQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2IsQ0FBQztJQUVELE1BQU07UUFDSixJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUM5QixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLDhCQUE4QixFQUFFLENBQUMsQ0FBQztRQUNuRSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN0RSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNyRSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUMzRSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxTQUFTLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNwRSxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksRUFBRSxVQUFVLElBQUksQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRU0sUUFBUTtRQUNiLE9BQU8sY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVPLHNCQUFzQjtRQUM1QixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNoQyxNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RELElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDO1lBQzNDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDO1lBQ3pDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxTQUFTLElBQUksV0FBVyxDQUFDO1lBQy9DLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxHQUFHLElBQUksV0FBVyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxRQUFRLElBQUksV0FBVyxDQUFDO1NBQy9DO0lBQ0gsQ0FBQztDQUNGO0FBUUQsTUFBTSxjQUFlLFNBQVEsS0FBSztJQUN4QixDQUFDLENBQVM7SUFDVixDQUFDLENBQVM7SUFDVixDQUFDLENBQVM7SUFDVixLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ1YsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUNULFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDZCxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ1IsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUVyQixZQUFZLEdBQVEsRUFBRSxNQUFjO1FBQ2xDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDYixDQUFDO0lBRUQsTUFBTTtRQUNKLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQzlCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsOEJBQThCLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFTSxRQUFRO1FBQ2IsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRU8sc0JBQXNCO1FBQzVCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ2hDLE1BQU0sV0FBVyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdEQsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUM7WUFDM0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLElBQUksSUFBSSxXQUFXLENBQUM7WUFDekMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLFNBQVMsSUFBSSxXQUFXLENBQUM7WUFDL0MsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLEdBQUcsSUFBSSxXQUFXLENBQUM7WUFDeEMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUM7Z0JBQUUsSUFBSSxDQUFDLFFBQVEsSUFBSSxXQUFXLENBQUM7U0FDL0M7SUFDSCxDQUFDO0NBQ0Y7QUFPRCxTQUFTLGNBQWM7SUFDckIsTUFBTSxXQUFXLEdBQUM7UUFDaEIsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSxtQ0FBbUMsRUFBQyxjQUFjLEVBQUUsSUFBSSxFQUFDO1FBQ2hGLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsY0FBYyxFQUFDLGNBQWMsRUFBRSwyQkFBMkIsRUFBQztRQUNsRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLDZCQUE2QixFQUFDLGNBQWMsRUFBRSw0QkFBNEIsRUFBQztLQUNuRyxDQUFBO0lBQ0QsTUFBTSxPQUFPLEdBQUMsRUFBRSxDQUFBO0lBQ2hCLElBQUc7UUFDRCxXQUFXLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQy9CLE1BQU0sSUFBSSxHQUFDLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsRCxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUcsVUFBVSxDQUFDLGNBQWMsRUFBQztnQkFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsVUFBVSxFQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYyxFQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFDLENBQUMsQ0FBQTthQUN4SDtRQUNILENBQUMsQ0FBQyxDQUFDO0tBQ0o7SUFDRCxPQUFNLENBQUMsRUFBQztRQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7S0FDZjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1BsdWdpbiwgTWFya2Rvd25SZW5kZXJlciwgQXBwLCBNb2RhbCwgQ29tcG9uZW50LCBTZXR0aW5nLE5vdGljZSwgV29ya3NwYWNlV2luZG93LGxvYWRNYXRoSmF4LHJlbmRlck1hdGgsIE1hcmtkb3duVmlldywgRWRpdG9yU3VnZ2VzdCwgRWRpdG9yU3VnZ2VzdFRyaWdnZXJJbmZvLCBFZGl0b3JQb3NpdGlvbiwgRWRpdG9yLCBURmlsZSwgRWRpdG9yU3VnZ2VzdENvbnRleHR9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5cclxuaW1wb3J0IHsgTWF0aEluZm8sIE1hdGhQcmFpc2VyIH0gZnJvbSBcIi4vbWF0aEVuZ2luZS5qc1wiO1xyXG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcclxuaW1wb3J0IHsgQ3VzdG9tSW5wdXRNb2RhbCwgSGlzdG9yeU1vZGFsLCBJbnB1dE1vZGFsLCBWZWNJbnB1dE1vZGVsIH0gZnJvbSBcIi4vdGVtcFwiO1xyXG5pbXBvcnQge01hdGhQbHVnaW5TZXR0aW5ncywgREVGQVVMVF9TRVRUSU5HUywgTWF0aFBsdWdpblNldHRpbmdUYWIsfSBmcm9tIFwiLi9zZXR0aW5nc1wiO1xyXG5pbXBvcnQgeyBjYWxjdWxhdGVCaW5vbSwgZGVncmVlc1RvUmFkaWFucywgZmluZEFuZ2xlQnlDb3NpbmVSdWxlLCBnZXRVc2FibGVEZWdyZWVzLCBwb2xhclRvQ2FydGVzaWFuLCByYWRpYW5zVG9EZWdyZWVzLCByb3VuZEJ5U2V0dGluZ3MgfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzLmpzXCI7XHJcbmltcG9ydCB7IEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdHRpbmcsIFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgTnVtZXJhbHNTdWdnZXN0b3IgfSBmcm9tIFwiLi9zdWdnZXN0b3IuanNcIjtcclxuaW1wb3J0IHsgVGlrelN2ZyB9IGZyb20gXCIuL3Rpa3pqYXgvbXlUaWt6LmpzXCI7XHJcblxyXG5pbXBvcnQgeyBFZGl0b3JTdGF0ZSwgU2VsZWN0aW9uUmFuZ2UsUmFuZ2VTZXQgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgc3ludGF4VHJlZSB9IGZyb20gXCJAY29kZW1pcnJvci9sYW5ndWFnZVwiO1xyXG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3UGx1Z2luLCBWaWV3VXBkYXRlICxEZWNvcmF0aW9uLCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcbmltcG9ydCB7IEZvcm1hdFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L2ludGVycHJldC90b2tlbml6ZVRpa3pqYXguanNcIjtcclxuXHJcblxyXG5jbGFzcyBSdGxGb3JjIHtcclxuICBkZWNvcmF0aW9uczogUmFuZ2VTZXQ8RGVjb3JhdGlvbj47XHJcblxyXG4gIGNvbnN0cnVjdG9yKHZpZXc6IEVkaXRvclZpZXcpIHtcclxuICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmNvbXB1dGVEZWNvcmF0aW9ucyh2aWV3KTtcclxuICB9XHJcblxyXG4gIHVwZGF0ZSh1cGRhdGU6IFZpZXdVcGRhdGUpIHtcclxuICAgIGlmICh1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUudmlld3BvcnRDaGFuZ2VkKSB7XHJcbiAgICAgIHRoaXMuZGVjb3JhdGlvbnMgPSB0aGlzLmNvbXB1dGVEZWNvcmF0aW9ucyh1cGRhdGUudmlldyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjb21wdXRlRGVjb3JhdGlvbnModmlldzogRWRpdG9yVmlldyk6IFJhbmdlU2V0PERlY29yYXRpb24+IHtcclxuICAgIGNvbnN0IHdpZGdldHMgPSBbXTtcclxuICAgIGZvciAobGV0IHsgZnJvbSwgdG8gfSBvZiB2aWV3LnZpc2libGVSYW5nZXMpIHtcclxuICAgICAgZm9yIChsZXQgcG9zID0gZnJvbTsgcG9zIDw9IHRvOyApIHtcclxuICAgICAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XHJcbiAgICAgICAgY29uc3QgY29udGVudCA9IGxpbmUudGV4dC50cmltKCk7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgY29udGVudFxyXG4gICAgICAgICAgICAucmVwbGFjZSgvWyM6XFxzXCI9LVxcZFxcW1xcXS5cXCtcXC1dKi9nLCBcIlwiKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvPFthLXpdK1tcXHdcXHNcXGRdKj4vZywgXCJcIilcclxuICAgICAgICAgICAgLm1hdGNoKC9eW9eQLdeqXS8pXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICB3aWRnZXRzLnB1c2goXHJcbiAgICAgICAgICAgIERlY29yYXRpb24ubGluZSh7XHJcbiAgICAgICAgICAgICAgY2xhc3M6IFwiY3VzdG9tLXJ0bC1saW5lXCIsXHJcbiAgICAgICAgICAgIH0pLnJhbmdlKGxpbmUuZnJvbSlcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHBvcyA9IGxpbmUudG8gKyAxO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gRGVjb3JhdGlvbi5zZXQod2lkZ2V0cyk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRoUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcclxuICBzZXR0aW5nczogTWF0aFBsdWdpblNldHRpbmdzO1xyXG4gIHRpa3pQcm9jZXNzb3I6IFRpa3pqYXhcclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG4gICAgdGhpcy50aWt6UHJvY2Vzc29yPW5ldyBUaWt6amF4KHRoaXMuYXBwLHRoaXMpXHJcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3IucmVhZHlMYXlvdXQoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZWdpc3RlclRpa3pDb2RlQmxvY2soKTtcclxuICAgIFxyXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBNYXRoUGx1Z2luU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibWF0aC1lbmdpbmVcIiwgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrempheFwiLCB0aGlzLnByb2Nlc3NUaWt6QmxvY2suYmluZCh0aGlzKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcclxuICAgIHRoaXMuY3JlYXRlQ29udGV4dEJhc2VkTGluZVN0eWxpbmcoKVxyXG5cclxuICAgIHRoaXMucmVnaXN0ZXJFZGl0b3JTdWdnZXN0KG5ldyBOdW1lcmFsc1N1Z2dlc3Rvcih0aGlzKSk7XHJcblxyXG4gICAgLy8gRXhlY3V0ZSB0aGUgYGEoKWAgbWV0aG9kIHRvIGxvZyBhbmQgbW9kaWZ5IGFsbCBkaXZzXHJcbiAgICAvL3RoaXMucHJvY2Vzc0RpdnMoKTtcclxuICB9XHJcbiAgb251bmxvYWQoKSB7XHJcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IudW5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKTtcclxuXHR9XHJcbiAgY3JlYXRlQ29udGV4dEJhc2VkTGluZVN0eWxpbmcoKXtcclxuICAgIHRoaXMucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXHJcbiAgICAgICAgVmlld1BsdWdpbi5mcm9tQ2xhc3MoUnRsRm9yYywge1xyXG4gICAgICAgIGRlY29yYXRpb25zOiAodikgPT4gdi5kZWNvcmF0aW9ucyxcclxuICAgICAgfVxyXG4gICAgKSk7XHJcbiAgfVxyXG5cclxuICBwcm9jZXNzVGlrekJsb2NrKHNvdXJjZTogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgY29uc3Qgc3ZnID0gbmV3IFRpa3pTdmcoc291cmNlKTtcclxuICBcclxuICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiksIHtcclxuICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcclxuICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcclxuICB9KTtcclxuICBcclxuXHJcbiAgY29uc3QgZ3JhcGggPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgIHN0eWxlOiBcImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1wiXHJcbiAgfSk7XHJcbiAgZ3JhcGguYXBwZW5kQ2hpbGQoc3ZnLmdldFN2ZygpKTtcclxuICBzdmcuZGVidWdJbmZvKz1ncmFwaC5vdXRlckhUTUxcclxuICBjb25zb2xlLmxvZyhncmFwaC5vdXRlckhUTUwpXHJcbiAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHN2Zy5kZWJ1Z0luZm8pLm9wZW4oKTtcclxuICBcclxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQoaWNvbik7XHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGdyYXBoKTtcclxufVxyXG5cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XHJcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XHJcbiAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZWdpc3RlckNvbW1hbmRzKCkge1xyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwib3Blbi1pbnB1dC1mb3JtXCIsXHJcbiAgICAgIG5hbWU6IFwiT3BlbiBJbnB1dCBGb3JtXCIsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiBuZXcgVmVjSW5wdXRNb2RlbCh0aGlzLmFwcCx0aGlzKS5vcGVuKCksXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJ2aWV3LXNlc3Npb24taGlzdG9yeVwiLFxyXG4gICAgICBuYW1lOiBcIlZpZXcgU2Vzc2lvbiBIaXN0b3J5XCIsXHJcbiAgICAgIC8vY2FsbGJhY2s6ICgpID0+IG5ldyBIaXN0b3J5TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwidGVzdC1tYXRoRW5naW5lXCIsXHJcbiAgICAgIG5hbWU6IFwidGVzdCBtYXRoIGVuZ2luZVwiLFxyXG4gICAgICBjYWxsYmFjazogKCkgPT50ZXN0TWF0aEVuZ2luZSgpLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHByb2Nlc3NNYXRoQmxvY2soc291cmNlOiBzdHJpbmcsIG1haW5Db250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBtYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWNvbnRhaW5lclwiKTtcclxuICAgIFxyXG4gICAgY29uc3QgdXNlclZhcmlhYmxlczogeyB2YXJpYWJsZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xyXG4gICAgbGV0IHNraXBwZWRJbmRleGVzID0gMDtcclxuXHJcbiAgICBjb25zdCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKS5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSkuZmlsdGVyKGxpbmUgPT4gbGluZSk7XHJcbiAgICBpZiAoZXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7cmV0dXJuO31cclxuXHJcbiAgICBcclxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XHJcbiAgICAgIGxldCBsaW5lQ29udGFpbmVyOiBIVE1MRGl2RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgIGxpbmVDb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtbGluZS1jb250YWluZXJcIiwgKGluZGV4LXNraXBwZWRJbmRleGVzKSAlIDIgPT09IDAgPyBcIm1hdGgtcm93LWV2ZW5cIiA6IFwibWF0aC1yb3ctb2RkXCIpO1xyXG4gICAgICAvL2lmIChleHByZXNzaW9uLm1hdGNoKC9eXFwvXFwvLykpe31cclxuICAgICAgY29uc3QgcHJvY2Vzc01hdGggPSBuZXcgUHJvY2Vzc01hdGgoZXhwcmVzc2lvbix1c2VyVmFyaWFibGVzLCB0aGlzLmFwcCxsaW5lQ29udGFpbmVyKTtcclxuICAgICAgcHJvY2Vzc01hdGguaW5pdGlhbGl6ZSgpO1xyXG5cclxuICAgICAgaWYocHJvY2Vzc01hdGgubW9kZSE9PVwidmFyaWFibGVcIil7XHJcbiAgICAgICAgbGluZUNvbnRhaW5lciA9IHByb2Nlc3NNYXRoLmNvbnRhaW5lciBhcyBIVE1MRGl2RWxlbWVudDtcclxuICAgICAgICBtYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKGxpbmVDb250YWluZXIpO1xyXG4gICAgICB9XHJcbiAgICAgIGVsc2V7c2tpcHBlZEluZGV4ZXMrKzt9XHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmNsYXNzIFByb2Nlc3NNYXRoIHtcclxuICBtYXRoSW5wdXQ6IGFueTtcclxuICB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgbW9kZSA9IFwibWF0aFwiO1xyXG4gIHJlc3VsdDogYW55O1xyXG4gIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XHJcbiAgaWNvbnNEaXY6IEhUTUxFbGVtZW50O1xyXG4gIGFwcDogQXBwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihtYXRoSW5wdXQ6IHN0cmluZyx1c2VyVmFyaWFibGVzOiBhbnksIGFwcDogQXBwLCBjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICB0aGlzLm1hdGhJbnB1dCA9IG1hdGhJbnB1dDtcclxuICAgIHRoaXMudXNlclZhcmlhYmxlcz11c2VyVmFyaWFibGVzO1xyXG4gICAgdGhpcy5hcHAgPSBhcHA7XHJcbiAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcclxuICAgIHRoaXMuaWNvbnNEaXYgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtaWNvbnNcIixcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcclxuICAgIHRoaXMuYXNzaWduTW9kZSgpO1xyXG4gICAgdGhpcy5zZXR1cENvbnRhaW5lcigpO1xyXG4gICAgdGhpcy5oYW5kbGVWYXJpYWJsZXMoKTtcclxuICAgIHRoaXMucmVuZGVyTWF0aCgpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzZXR1cENvbnRhaW5lcigpIHtcclxuICAgIFtcIm1hdGgtaW5wdXRcIiwgXCJtYXRoLXJlc3VsdFwiXS5mb3JFYWNoKGNsYXNzTmFtZSA9PiB7XHJcbiAgICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgIGRpdi5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XHJcbiAgICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGRpdik7XHJcbiAgICB9KTtcclxuICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuaWNvbnNEaXYpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZW5kZXJNYXRoKCkge1xyXG4gICAgY29uc3QgaW5wdXREaXYgPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFwiLm1hdGgtaW5wdXRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICBjb25zdCByZXN1bHREaXYgPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFwiLm1hdGgtcmVzdWx0XCIpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgdHJ5IHtcclxuICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcclxuICAgICAgICBjYXNlIFwiYmlub21cIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgY29uc3QgYmlub21Nb2RlbCA9IG5ldyBCaW5vbUluZm9Nb2RlbCh0aGlzLmFwcCwgdGhpcy5tYXRoSW5wdXQpO1xyXG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwoYmlub21Nb2RlbCk7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IGJpbm9tTW9kZWwuZ2V0RXF1YWwoKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJjb3NcIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgY29uc3QgWyAsIHNpZGVBLCBzaWRlQiwgc2lkZUMgXSA9IHRoaXMubWF0aElucHV0Lm1hcChOdW1iZXIpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9ZmluZEFuZ2xlQnlDb3NpbmVSdWxlKHNpZGVBLCBzaWRlQiwgc2lkZUMpXHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidmVjXCI6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIHRoaXMucmVzdWx0PW5ldyBWZWNQcm9jZXNzb3IodGhpcy5tYXRoSW5wdXRbMV0sdGhpcy5tYXRoSW5wdXRbMl0sdGhpcy5tYXRoSW5wdXRbM10pO1xyXG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IHRpa3pHcmFwaCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQuZ3JhcGgpKTtcclxuICAgICAgICAgIHRoaXMuYWRkRGVidWdNb2RlbChuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQudmVjSW5mby5kZWJ1Z0luZm8pKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0PXRoaXMucmVzdWx0LnJlc3VsdFxyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IG5ldyBNYXRoUHJhaXNlcih0aGlzLm1hdGhJbnB1dCk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgSW5mb01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5tYXRoSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5tYXRoSW5mby5kZWJ1Z0luZm8pKTtcclxuICAgICAgICAgIHRoaXMubWF0aElucHV0PXRoaXMucmVzdWx0LmlucHV0O1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSB0aGlzLnJlc3VsdC5zb2x1dGlvbjtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICB9XHJcbiAgICAgdGhpcy5hZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdiwgcmVzdWx0RGl2LCB0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiP3RoaXMubWF0aElucHV0OnRoaXMubWF0aElucHV0WzBdLCByb3VuZEJ5U2V0dGluZ3ModGhpcy5yZXN1bHQpKTtcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICB0aGlzLmRpc3BsYXlFcnJvcihpbnB1dERpdiwgcmVzdWx0RGl2LCBlcnIpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKFwiVGhlIGluaXRpYWwgcHJhaXNpbmcgZmFpbGVkXCIsZXJyKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBpbnB1dDogc3RyaW5nLCByZXN1bHQ6IGFueSkge1xyXG4gICAgaW5wdXREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChpbnB1dCx0cnVlKSlcclxuICAgIC8vTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFwkeyR7aW5wdXR9fSRgLCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIC8vY29uc3QgcmVzdWx0T3V0cHV0ID0gLyh0cnVlfGZhbHNlKS8udGVzdChyZXN1bHQpID8gcmVzdWx0IDogYFxcJHske3Jlc3VsdH19JGA7XHJcbiAgICByZXN1bHREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChyZXN1bHQudG9TdHJpbmcoKSx0cnVlKSlcclxuICAgIC8vTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihyZXN1bHRPdXRwdXQsIHJlc3VsdERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZGlzcGxheUVycm9yKGlucHV0RGl2OiBIVE1MRWxlbWVudCwgcmVzdWx0RGl2OiBIVE1MRWxlbWVudCwgZXJyOiBFcnJvcikge1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bih0aGlzLm1hdGhJbnB1dCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiZXJyb3ItdGV4dFwiPiR7ZXJyLm1lc3NhZ2V9PC9zcGFuPmA7XHJcbiAgICB0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1lcnJvci1saW5lXCIpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3NpZ25Nb2RlKCkge1xyXG4gICAgY29uc3QgcmVnZXhMaXN0ID0gR2V0TWF0aENvbnRleHRSZWdleCgpO1xyXG4gICAgY29uc3QgbWF0Y2hPYmplY3QgPSByZWdleExpc3QuZmluZChyZWdleE9iaiA9PiByZWdleE9iai5yZWdleC50ZXN0KHRoaXMubWF0aElucHV0KSk7XHJcbiAgICBpZiAobWF0Y2hPYmplY3QpIHtcclxuICAgICAgdGhpcy5tb2RlID0gbWF0Y2hPYmplY3QudmFsdWU7XHJcbiAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQubWF0Y2gobWF0Y2hPYmplY3QucmVnZXgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRJbmZvTW9kYWwobW9kYWw6IGFueSkge1xyXG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pbmZvLWljb25cIixcclxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxyXG4gICAgfSk7XHJcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XHJcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGREZWJ1Z01vZGVsKG1vZGFsOiBhbnkpIHtcclxuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxyXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5CeXCIsXHJcbiAgICB9KTtcclxuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcclxuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlcygpIHtcclxuICAgIGlmICh0aGlzLm1vZGU9PT1cInZhcmlhYmxlXCIpIHtcclxuICAgICAgdGhpcy5oYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpIHtcclxuICAgIGNvbnN0IFtfLHZhcmlhYmxlLCB2YWx1ZV0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoKHBhcnQ6IHN0cmluZykgPT4gcGFydC50cmltKCkpO1xyXG4gICAgaWYgKCF2YXJpYWJsZSB8fCAhdmFsdWUpIHtcclxuICAgICAgY29uc29sZS53YXJuKGBJbnZhbGlkIHZhcmlhYmxlIGRlY2xhcmF0aW9uOiAke3RoaXMubWF0aElucHV0fWApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBleGlzdGluZ1ZhckluZGV4ID0gdGhpcy51c2VyVmFyaWFibGVzLmZpbmRJbmRleCh2ID0+IHYudmFyaWFibGUgPT09IHZhcmlhYmxlKTtcclxuICAgIGlmIChleGlzdGluZ1ZhckluZGV4ICE9PSAtMSkge1xyXG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXNbZXhpc3RpbmdWYXJJbmRleF0udmFsdWUgPSB2YWx1ZTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlcy5wdXNoKHsgdmFyaWFibGUsIHZhbHVlIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCl7XHJcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXMuZm9yRWFjaCgoeyB2YXJpYWJsZSwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICBpZiAodHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5yZXBsYWNlKHZhcmlhYmxlLCB2YWx1ZSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIEdldE1hdGhDb250ZXh0UmVnZXgoKSB7XHJcbiAgcmV0dXJuIFtcclxuICAgIHsgcmVnZXg6IC9iaW5vbVxcKChcXGQrKSwoXFxkKyksKFxcZCspXFwpLywgdmFsdWU6IFwiYmlub21cIiB9LFxyXG4gICAgeyByZWdleDogL3ZlYyhbKy1dezAsMn0pXFwoKFtcXGQuKy1dK1s6LF1bXFxkListXSspXFwpKFtcXGQuKy1dKikvLCB2YWx1ZTogXCJ2ZWNcIiB9LFxyXG4gICAgeyByZWdleDogL2Nvc1xcKChbXFxkLl0rKSwoW1xcZC5dKyksKFtcXGQuXSspXFwpLywgdmFsdWU6IFwiY29zXCIgfSxcclxuICAgIHsgcmVnZXg6IC92YXJcXHMqKFtcXHddKylcXHMqPVxccyooW1xcZC5dKykvLCB2YWx1ZTogXCJ2YXJpYWJsZVwiIH0sXHJcbiAgXTtcclxufVxyXG5cclxuXHJcbmNsYXNzIFZlY1Byb2Nlc3NvciB7XHJcbiAgdXNlcklucHV0OiBhbnk7XHJcbiAgZW52aXJvbm1lbnQ6IHsgWDogc3RyaW5nOyBZOiBzdHJpbmcgfTtcclxuICB2ZWNJbmZvID0gbmV3IE1hdGhJbmZvKCk7XHJcbiAgYXhpczogQXhpcztcclxuICBtb2RpZmllcjogbnVtYmVyO1xyXG4gIHJlc3VsdDogc3RyaW5nO1xyXG4gIGdyYXBoPzogYW55O1xyXG5cclxuICBjb25zdHJ1Y3RvcihlbnZpcm9ubWVudDogc3RyaW5nLCBtYXRoSW5wdXQ6IHN0cmluZywgbW9kaWZpZXI6IHN0cmluZykge1xyXG4gICAgdGhpcy51c2VySW5wdXQ9bWF0aElucHV0O1xyXG4gICAgY29uc3QgbWF0Y2ggPSBlbnZpcm9ubWVudC5tYXRjaCgvKFsrLV0/KShbKy1dPykvKTtcclxuICAgIHRoaXMuZW52aXJvbm1lbnQgPSB7IFg6IG1hdGNoPy5bMV0gPz8gXCIrXCIsIFk6IG1hdGNoPy5bMl0gPz8gXCIrXCIgfTtcclxuXHJcbiAgICB0aGlzLm1vZGlmaWVyID0gbW9kaWZpZXIubGVuZ3RoID4gMCA/IGdldFVzYWJsZURlZ3JlZXMoTnVtYmVyKG1vZGlmaWVyKSkgOiAwO1xyXG5cclxuICAgIHRoaXMuYXhpcz1uZXcgQXhpcygpLnVuaXZlcnNhbCh0aGlzLnVzZXJJbnB1dClcclxuICAgIGlmICghdGhpcy5heGlzLnBvbGFyQW5nbGUpXHJcbiAgICAgIHRoaXMuYXhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKCk7XHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiYXhpc1wiLHRoaXMuYXhpcyk7XHJcbiAgICB0aGlzLmFkZFJlc3VsdCgpO1xyXG4gICAgdGhpcy5hZGRHcmFwaCgpO1xyXG4gIH1cclxuICBhZGRSZXN1bHQoKXtcclxuICAgIGlmICh0aGlzLnVzZXJJbnB1dC5pbmNsdWRlcyhcIjpcIikpXHJcbiAgICAgIHRoaXMucmVzdWx0PWB4ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWH1cXFxccXVhZCx5ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWX1gXHJcbiAgICBlbHNlXHJcbiAgICAgIHRoaXMucmVzdWx0PWBhbmdsZSA9ICR7dGhpcy5heGlzLnBvbGFyQW5nbGV9XFxcXHF1YWQsbGVuZ3RoID0gJHt0aGlzLmF4aXMucG9sYXJMZW5ndGh9YFxyXG4gIH1cclxuICBhZGRHcmFwaCgpIHtcclxuICAgIGNvbnN0IHRhcmdldFNpemUgPSAxMDtcclxuICAgIGNvbnN0IG1heENvbXBvbmVudCA9IE1hdGgubWF4KE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YKSwgTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblkpKTtcclxuXHJcbiAgICAvLyBEZXRlcm1pbmUgc2NhbGluZyBmYWN0b3JcclxuICAgIGxldCBzY2FsZSA9IDE7XHJcbiAgICBpZiAobWF4Q29tcG9uZW50IDwgdGFyZ2V0U2l6ZSkge1xyXG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XHJcbiAgICB9IGVsc2UgaWYgKG1heENvbXBvbmVudCA+IHRhcmdldFNpemUpIHtcclxuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xyXG4gICAgfVxyXG4gICAgLy8gaSBuZWVkIHRvIG1ha2UgaXQgXCJ0byBYIGF4aXNcIlxyXG4gICAgLy9jb25zdCB2ZWN0b3JBbmdsZSA9IGdldFVzYWJsZURlZ3JlZXMocmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4yKHNjYWxlZFksIHNjYWxlZFgpKSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKDAsMCk7XHJcblxyXG5cclxuICAgIGNvbnN0IGRyYXc9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLnBvbGFyTGVuZ3RoLnRvU3RyaW5nKCl9KSx0aGlzLmF4aXNdO1xyXG4gICAgY29uc3QgZHJhd1g9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblgudG9TdHJpbmcoKX0pLG5ldyBBeGlzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YLDApXTtcclxuICAgIGNvbnN0IGRyYXdZPSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZLnRvU3RyaW5nKCl9KSxuZXcgQXhpcygwLHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKV07XHJcblxyXG4gICAgdGhpcy5ncmFwaD1bXHJcbiAgICAgIC8vbmV3IEZvcm1hdHRpbmcoXCJnbG9ib2xcIix7Y29sb3I6IFwid2hpdGVcIixzY2FsZTogMSx9KSxcclxuICAgICAgbmV3IERyYXcoe2RyYXdBcnI6IGRyYXcsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInJlZFwiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcclxuICAgICAgbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdYLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXHJcbiAgICAgIG5ldyBEcmF3KHtkcmF3QXJyOiBkcmF3WSxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxyXG4gICAgXVxyXG4gICAgXHJcbiAgICBcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b2tlbnMsbnVsbCwxKSk7XHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaC50b1N0cmluZygpXFxuXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b1N0cmluZygpKSk7XHJcbiAgICAvKiBHZW5lcmF0ZSBMYVRlWCBjb2RlIGZvciB2ZWN0b3IgY29tcG9uZW50cyBhbmQgbWFpbiB2ZWN0b3JcclxuICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxyXG5cclxuICAgICAgJSBBbmdsZSBBbm5vdGF0aW9uXHJcbiAgICAgICVcXGFuZ3tYfXthbmN9e3ZlY317fXske3JvdW5kQnlTZXR0aW5ncyh2ZWN0b3JBbmdsZSl9JF57XFxjaXJjfSR9XHJcbiAgICBgLnJlcGxhY2UoL15cXHMrL2dtLCBcIlwiKTsqL1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIlNjYWxpbmcgZmFjdG9yXCIsIHNjYWxlKTtcclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgdGlrekdyYXBoIGV4dGVuZHMgTW9kYWwge1xyXG4gIHRpa3o6IEZvcm1hdFRpa3pqYXg7XHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsdGlrekNvZGU6IGFueSl7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy50aWt6PW5ldyBGb3JtYXRUaWt6amF4KHRpa3pDb2RlKTtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29uc3QgY29kZT10aGlzLnRpa3o7XHJcbiAgICBjb25zdCBzY3JpcHQgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcclxuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XHJcbiAgICBzY3JpcHQuc2V0VGV4dChjb2RlLmdldENvZGUoKSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGFjdGlvbkJ1dHRvbiA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ29weSBncmFwaFwiLCBjbHM6IFwiaW5mby1tb2RhbC1Db3B5LWJ1dHRvblwiIH0pO1xyXG5cclxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0aGlzLnRpa3ouZ2V0Q29kZSgpKTtcclxuICAgICAgbmV3IE5vdGljZShcIkdyYXBoIGNvcGllZCB0byBjbGlwYm9hcmQhXCIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIG9uQ2xvc2UoKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG50eXBlIERpc3RyaWJ1dGlvblR5cGUgPSAnbm9ybWFsJyB8ICdiaW5vbWlhbCcgfCAncG9pc3Nvbic7XHJcblxyXG5jbGFzcyBEaXN0cmlidXRpb24ge1xyXG4gIHByaXZhdGUgdHlwZTogRGlzdHJpYnV0aW9uVHlwZTtcclxuICBwcml2YXRlIHg6IG51bWJlcjtcclxuICBwcml2YXRlIG11OiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBzaWdtYTogbnVtYmVyXHJcbiAgcHJpdmF0ZSB2YXJpYW5jZTogbnVtYmVyXHJcblxyXG4gIFxyXG5cclxuICAvLyBGb3IgQmlub21pYWwgRGlzdHJpYnV0aW9uXHJcbiAgcHJpdmF0ZSB0cmlhbHM6IG51bWJlcjtcclxuICBwcml2YXRlIHByb2JhYmlsaXR5OiBudW1iZXI7XHJcblxyXG4gIC8vIEZvciBQb2lzc29uIERpc3RyaWJ1dGlvblxyXG4gIHByaXZhdGUgbGFtYmRhOiBudW1iZXI7XHJcbiAgLypcclxuICBjb25zdHJ1Y3Rvcih0eXBlOiBEaXN0cmlidXRpb25UeXBlLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pIHtcclxuICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSBiYXNlZCBvbiBkaXN0cmlidXRpb24gdHlwZVxyXG4gICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgIGNhc2UgJ25vcm1hbCc6XHJcbiAgICAgICAgdGhpcy5tZWFuID0gcGFyYW1zLm1lYW4gfHwgMDtcclxuICAgICAgICB0aGlzLnN0ZERldiA9IHBhcmFtcy5zdGREZXYgfHwgMTtcclxuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5zdGREZXYgKiogMjtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnYmlub21pYWwnOlxyXG4gICAgICAgIHRoaXMudHJpYWxzID0gcGFyYW1zLnRyaWFscyB8fCAxO1xyXG4gICAgICAgIHRoaXMucHJvYmFiaWxpdHkgPSBwYXJhbXMucHJvYmFiaWxpdHkgfHwgMC41O1xyXG4gICAgICAgIHRoaXMubWVhbiA9IHRoaXMudHJpYWxzICogdGhpcy5wcm9iYWJpbGl0eTtcclxuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5tZWFuICogKDEgLSB0aGlzLnByb2JhYmlsaXR5KTtcclxuICAgICAgICB0aGlzLnN0ZERldiA9IE1hdGguc3FydCh0aGlzLnZhcmlhbmNlKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAncG9pc3Nvbic6XHJcbiAgICAgICAgdGhpcy5sYW1iZGEgPSBwYXJhbXMubGFtYmRhIHx8IDE7XHJcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy5sYW1iZGE7XHJcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubGFtYmRhO1xyXG4gICAgICAgIHRoaXMuc3RkRGV2ID0gTWF0aC5zcXJ0KHRoaXMudmFyaWFuY2UpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZGlzdHJpYnV0aW9uIHR5cGUnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB1YmxpYyBub3JtYWxQREYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdub3JtYWwnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignUERGIG9ubHkgYXBwbGllcyB0byB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbicpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZXhwUGFydCA9IE1hdGguZXhwKC0oKHggLSB0aGlzLm1lYW4pICoqIDIpIC8gKDIgKiB0aGlzLnZhcmlhbmNlKSk7XHJcbiAgICByZXR1cm4gKDEgLyAodGhpcy5zdGREZXYgKiBNYXRoLnNxcnQoMiAqIE1hdGguUEkpKSkgKiBleHBQYXJ0O1xyXG4gIH1cclxuXHJcbiAgcHVibGljIG5vcm1hbENERih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ25vcm1hbCcpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gMC41ICogKDEgKyB0aGlzLmVyZigoeCAtIHRoaXMubWVhbikgLyAoTWF0aC5zcXJ0KDIpICogdGhpcy5zdGREZXYpKSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgYmlub21pYWxQTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdiaW5vbWlhbCcpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQTUYgb25seSBhcHBsaWVzIHRvIHRoZSBCaW5vbWlhbCBEaXN0cmlidXRpb24nKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbWJpbmF0aW9uID0gdGhpcy5mYWN0b3JpYWwodGhpcy50cmlhbHMpIC9cclxuICAgICAgKHRoaXMuZmFjdG9yaWFsKHgpICogdGhpcy5mYWN0b3JpYWwodGhpcy50cmlhbHMgLSB4KSk7XHJcbiAgICByZXR1cm4gY29tYmluYXRpb24gKiBNYXRoLnBvdyh0aGlzLnByb2JhYmlsaXR5LCB4KSAqIE1hdGgucG93KDEgLSB0aGlzLnByb2JhYmlsaXR5LCB0aGlzLnRyaWFscyAtIHgpO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIHBvaXNzb25QTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdwb2lzc29uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BNRiBvbmx5IGFwcGxpZXMgdG8gdGhlIFBvaXNzb24gRGlzdHJpYnV0aW9uJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gKE1hdGgucG93KHRoaXMubGFtYmRhLCB4KSAqIE1hdGguZXhwKC10aGlzLmxhbWJkYSkpIC8gdGhpcy5mYWN0b3JpYWwoeCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGVyZih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgY29uc3Qgc2lnbiA9IHggPCAwID8gLTEgOiAxO1xyXG4gICAgY29uc3QgYSA9IDAuMzI3NTkxMTtcclxuICAgIGNvbnN0IHAgPSAwLjI1NDgyOTU5MjtcclxuICAgIGNvbnN0IHEgPSAtMC4yODQ0OTY3MzY7XHJcbiAgICBjb25zdCByID0gMS40MjE0MTM3NDE7XHJcbiAgICBjb25zdCBzID0gLTEuNDUzMTUyMDI3O1xyXG4gICAgY29uc3QgdCA9IDEuMDYxNDA1NDI5O1xyXG4gICAgY29uc3QgdSA9IDEgKyBhICogTWF0aC5hYnMoeCk7XHJcbiAgICBjb25zdCBwb2x5ID0gKCgoKChwICogdSArIHEpICogdSArIHIpICogdSArIHMpICogdSArIHQpICogdSk7XHJcbiAgICByZXR1cm4gc2lnbiAqICgxIC0gcG9seSAqIE1hdGguZXhwKC14ICogeCkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBmYWN0b3JpYWwobjogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmIChuIDwgMCkgcmV0dXJuIE5hTjtcclxuICAgIGxldCByZXN1bHQgPSAxO1xyXG4gICAgZm9yIChsZXQgaSA9IDI7IGkgPD0gbjsgaSsrKSByZXN1bHQgKj0gaTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfSovXHJcbn1cclxuXHJcblxyXG5jbGFzcyBEaXN0cmlidXRpb25Nb2RlbCBleHRlbmRzIE1vZGFsIHtcclxuICBwcml2YXRlIG46IG51bWJlcjtcclxuICBwcml2YXRlIGs6IG51bWJlcjtcclxuICBwcml2YXRlIHA6IG51bWJlcjtcclxuICBwcml2YXRlIGVxdWFsID0gMDtcclxuICBwcml2YXRlIGxlc3MgPSAwO1xyXG4gIHByaXZhdGUgbGVzc0VxdWFsID0gMDtcclxuICBwcml2YXRlIGJpZyA9IDA7XHJcbiAgcHJpdmF0ZSBiaWdFcXVhbCA9IDA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIGNvbnN0IFtfLCBuLCBrLCBwXSA9IHNvdXJjZS5tYXRjaCgvXFxkKy9nKSEubWFwKE51bWJlcik7XHJcbiAgICB0aGlzLm4gPSBuO1xyXG4gICAgdGhpcy5rID0gaztcclxuICAgIHRoaXMucCA9IHA7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkJpbm9taWFsIFByb2JhYmlsaXR5IFJlc3VsdHNcIiB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPCAke3RoaXMua30pID0gJHt0aGlzLmxlc3N9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+PSAke3RoaXMua30pID0gJHt0aGlzLmJpZ0VxdWFsfWAgfSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgZ2V0RXF1YWwoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIHRoaXMuaywgdGhpcy5wKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpIHtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IHByb2JhYmlsaXR5ID0gY2FsY3VsYXRlQmlub20odGhpcy5uLCBpLCB0aGlzLnApO1xyXG4gICAgICBpZiAoaSA9PT0gdGhpcy5rKSB0aGlzLmVxdWFsID0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDw9IHRoaXMuaykgdGhpcy5sZXNzRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID4gdGhpcy5rKSB0aGlzLmJpZyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgQmlub21JbmZvTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzID0gMDtcclxuICBwcml2YXRlIGxlc3NFcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBiaWcgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICBjb25zdCBbXywgbiwgaywgcF0gPSBzb3VyY2UubWF0Y2goL1xcZCsvZykhLm1hcChOdW1iZXIpO1xyXG4gICAgdGhpcy5uID0gbjtcclxuICAgIHRoaXMuayA9IGs7XHJcbiAgICB0aGlzLnAgPSBwO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzXCIgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8PSAke3RoaXMua30pID0gJHt0aGlzLmxlc3NFcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gY2FsY3VsYXRlQmlub20odGhpcy5uLCB0aGlzLmssIHRoaXMucCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xyXG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykgdGhpcy5lcXVhbCA9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+IHRoaXMuaykgdGhpcy5iaWcgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gdGVzdE1hdGhFbmdpbmUoKXtcclxuICBjb25zdCBleHByZXNzaW9ucz1bXHJcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2AyIFxcZnJhY3soNS0zKTM0fXtcXHNxcnR7Ml57Mn19fTAuNWAsZXhwZWN0ZWRPdXRwdXQ6ICczNCd9LFxyXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgKHgrMSkoeCszKT0yYCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMC4yNjc5NSx4XzI9LTMuNzMyMDUnfSxcclxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YFxcZnJhY3sxMzJ9ezEyNjAreF57Mn19PTAuMDVgLGV4cGVjdGVkT3V0cHV0OiAneF8xPS0zNy4xNDgzNSx4XzI9MzcuMTQ4MzUnfSxcclxuICBdXHJcbiAgY29uc3QgcmVzdWx0cz1bXVxyXG4gIHRyeXtcclxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goZXhwcmVzc2lvbiA9PiB7XHJcbiAgICAgIGNvbnN0IG1hdGg9bmV3IE1hdGhQcmFpc2VyKGV4cHJlc3Npb24uZXhwcmVzc2lvbik7XHJcbiAgICAgIGlmIChtYXRoLnNvbHV0aW9uIT09ZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCl7XHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtleHByZXNzaW9uOiBleHByZXNzaW9uLmV4cHJlc3Npb24sZXhwZWN0ZWRPdXRwdXQ6IGV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQsYWN0dWFsT3V0cHV0OiBtYXRoLnNvbHV0aW9ufSlcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGNhdGNoKGUpe1xyXG4gICAgY29uc29sZS5sb2coZSlcclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbiJdfQ==