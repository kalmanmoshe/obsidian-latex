import { Plugin, MarkdownRenderer, Modal, Component, Notice, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, MathPluginSettingTab, } from "./settings";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities.js";
import { Axis, Tikzjax } from "./tikzjax/tikzjax";
import { NumeralsSuggestor } from "./suggestor.js";
import { TikzSvg } from "./tikzjax/myTikz.js";
import { Prec } from "@codemirror/state";
import { EditorView, ViewPlugin, Decoration, } from "@codemirror/view";
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
        this.registerCodeMirrorExtensions();
        // Execute the `a()` method to log and modify all divs
        //this.processDivs();
    }
    onunload() {
        this.tikzProcessor.unloadTikZJaxAllWindows();
        this.tikzProcessor.removeSyntaxHighlighting();
    }
    registerCodeMirrorExtensions() {
        this.registerEditorExtension([
            // Keydown handler with highest precedence
            Prec.highest(EditorView.domEventHandlers({ "keydown": this.onKeydown.bind(this) })),
            // Update listener for editor state changes
            EditorView.updateListener.of(this.handleUpdate.bind(this)),
        ]);
    }
    onKeydown(event) {
        console.log("event", event);
    }
    handleUpdate(update) {
        if (update.docChanged) {
            //console.log("Editor content changed:", update.state.doc.toString());
            // Add logic to sync content or reflect changes in the UI
        }
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
        // const draw= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.polarLength.toString()}),this.axis];
        //const drawX= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.cartesianX.toString()}),new Axis(this.axis.cartesianX,0)];
        //const drawY= [ancer,'--',new Coordinate({mode:"node-inline",label: this.axis.cartesianY.toString()}),new Axis(0,this.axis.cartesianY)];
        this.graph = [
        //new Formatting("globol",{color: "white",scale: 1,}),
        //new Draw({drawArr: draw,formattingObj: {lineWidth: 1,draw: "red",arror: "-{Stealth}"}}),
        //new Draw({drawArr: drawX,formattingObj: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"}}),
        //new Draw({drawArr: drawY,formattingObj: {lineWidth: 1,draw: "yellow",arror: "-{Stealth}"}}),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEVBQThCLFVBQVUsRUFBNkcsTUFBTSxVQUFVLENBQUM7QUFFN08sT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3ZELE9BQU8sRUFBOEMsYUFBYSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ25GLE9BQU8sRUFBcUIsZ0JBQWdCLEVBQUUsb0JBQW9CLEdBQUUsTUFBTSxZQUFZLENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBb0IscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQXNDLGVBQWUsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BLLE9BQU8sRUFBRSxJQUFJLEVBQWdDLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxpQkFBaUIsRUFBYSxNQUFNLGdCQUFnQixDQUFDO0FBQzlELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUU5QyxPQUFPLEVBQXdDLElBQUksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRS9FLE9BQU8sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFjLFVBQVUsR0FBRyxNQUFNLGtCQUFrQixDQUFDO0FBQ25GLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQU12RSxNQUFNLE9BQU87SUFDWCxXQUFXLENBQXVCO0lBRWxDLFlBQVksSUFBZ0I7UUFDMUIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkQsQ0FBQztJQUVELE1B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QUFDO1FBQ2hGLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsY0FBYyxFQUFDLGNBQWMsRUFBRSwyQkFBMkIsRUFBQztRQUNsRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLDZCQUE2QixFQUFDLGNBQWMsRUFBRSw0QkFBNEIsRUFBQztLQUNuRyxDQUFBO0lBQ0QsTUFBTSxPQUFPLEdBQUMsRUFBRSxDQUFBO0lBQ2hCLElBQUc7UUFDRCxXQUFXLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQy9CLE1BQU0sSUFBSSxHQUFDLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsRCxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUcsVUFBVSxDQUFDLGNBQWMsRUFBQztnQkFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsVUFBVSxFQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYyxFQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFDLENBQUMsQ0FBQTthQUN4SDtRQUNILENBQUMsQ0FBQyxDQUFDO0tBQ0o7SUFDRCxPQUFNLENBQUMsRUFBQztRQUNOLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7S0FDZjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1BsdWdpbiwgTWFya2Rvd25SZW5kZXJlciwgQXBwLCBNb2RhbCwgQ29tcG9uZW50LCBTZXR0aW5nLE5vdGljZSwgV29ya3NwYWNlV2luZG93LGxvYWRNYXRoSmF4LHJlbmRlck1hdGgsIE1hcmtkb3duVmlldywgRWRpdG9yU3VnZ2VzdCwgRWRpdG9yU3VnZ2VzdFRyaWdnZXJJbmZvLCBFZGl0b3JQb3NpdGlvbiwgRWRpdG9yLCBURmlsZSwgRWRpdG9yU3VnZ2VzdENvbnRleHR9IGZyb20gXCJvYnNpZGlhblwiO1xuXG5pbXBvcnQgeyBNYXRoSW5mbywgTWF0aFByYWlzZXIgfSBmcm9tIFwiLi9tYXRoRW5naW5lLmpzXCI7XG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcbmltcG9ydCB7IEN1c3RvbUlucHV0TW9kYWwsIEhpc3RvcnlNb2RhbCwgSW5wdXRNb2RhbCwgVmVjSW5wdXRNb2RlbCB9IGZyb20gXCIuL3RlbXBcIjtcbmltcG9ydCB7TWF0aFBsdWdpblNldHRpbmdzLCBERUZBVUxUX1NFVFRJTkdTLCBNYXRoUGx1Z2luU2V0dGluZ1RhYix9IGZyb20gXCIuL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBjYWxjdWxhdGVCaW5vbSwgZGVncmVlc1RvUmFkaWFucywgZmluZEFuZ2xlQnlDb3NpbmVSdWxlLCBnZXRVc2FibGVEZWdyZWVzLCBwb2xhclRvQ2FydGVzaWFuLCByYWRpYW5zVG9EZWdyZWVzLCByb3VuZEJ5U2V0dGluZ3MgfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzLmpzXCI7XG5pbXBvcnQgeyBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCBUaWt6amF4IH0gZnJvbSBcIi4vdGlrempheC90aWt6amF4XCI7XG5pbXBvcnQgeyBOdW1lcmFsc1N1Z2dlc3RvciwgU3VnZ2VzdG9yIH0gZnJvbSBcIi4vc3VnZ2VzdG9yLmpzXCI7XG5pbXBvcnQgeyBUaWt6U3ZnIH0gZnJvbSBcIi4vdGlrempheC9teVRpa3ouanNcIjtcblxuaW1wb3J0IHsgRWRpdG9yU3RhdGUsIFNlbGVjdGlvblJhbmdlLFJhbmdlU2V0LCBQcmVjIH0gZnJvbSBcIkBjb2RlbWlycm9yL3N0YXRlXCI7XG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3UGx1Z2luLCBWaWV3VXBkYXRlICxEZWNvcmF0aW9uLCB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XG5pbXBvcnQgeyBGb3JtYXRUaWt6amF4IH0gZnJvbSBcIi4vdGlrempheC9pbnRlcnByZXQvdG9rZW5pemVUaWt6amF4LmpzXCI7XG5cblxuXG5cblxuY2xhc3MgUnRsRm9yYyB7XG4gIGRlY29yYXRpb25zOiBSYW5nZVNldDxEZWNvcmF0aW9uPjtcblxuICBjb25zdHJ1Y3Rvcih2aWV3OiBFZGl0b3JWaWV3KSB7XG4gICAgdGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuY29tcHV0ZURlY29yYXRpb25zKHZpZXcpO1xuICB9XG5cbiAgdXBkYXRlKHVwZGF0ZTogVmlld1VwZGF0ZSkge1xuICAgIGlmICh1cGRhdGUuZG9jQ2hhbmdlZCB8fCB1cGRhdGUudmlld3BvcnRDaGFuZ2VkKSB7XG4gICAgICB0aGlzLmRlY29yYXRpb25zID0gdGhpcy5jb21wdXRlRGVjb3JhdGlvbnModXBkYXRlLnZpZXcpO1xuICAgIH1cbiAgfVxuXG4gIGNvbXB1dGVEZWNvcmF0aW9ucyh2aWV3OiBFZGl0b3JWaWV3KTogUmFuZ2VTZXQ8RGVjb3JhdGlvbj4ge1xuICAgIGNvbnN0IHdpZGdldHMgPSBbXTtcbiAgICBmb3IgKGxldCB7IGZyb20sIHRvIH0gb2Ygdmlldy52aXNpYmxlUmFuZ2VzKSB7XG4gICAgICBmb3IgKGxldCBwb3MgPSBmcm9tOyBwb3MgPD0gdG87ICkge1xuICAgICAgICBjb25zdCBsaW5lID0gdmlldy5zdGF0ZS5kb2MubGluZUF0KHBvcyk7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBsaW5lLnRleHQudHJpbSgpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgY29udGVudFxuICAgICAgICAgICAgLnJlcGxhY2UoL1sjOlxcc1wiPS1cXGRcXFtcXF0uXFwrXFwtXSovZywgXCJcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC88W2Etel0rW1xcd1xcc1xcZF0qPi9nLCBcIlwiKVxuICAgICAgICAgICAgLm1hdGNoKC9eW9eQLdeqXS8pXG4gICAgICAgICkge1xuICAgICAgICAgIHdpZGdldHMucHVzaChcbiAgICAgICAgICAgIERlY29yYXRpb24ubGluZSh7XG4gICAgICAgICAgICAgIGNsYXNzOiBcImN1c3RvbS1ydGwtbGluZVwiLFxuICAgICAgICAgICAgfSkucmFuZ2UobGluZS5mcm9tKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcG9zID0gbGluZS50byArIDE7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBEZWNvcmF0aW9uLnNldCh3aWRnZXRzKTtcbiAgfVxufVxuXG5cblxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNYXRoUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgc2V0dGluZ3M6IE1hdGhQbHVnaW5TZXR0aW5ncztcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3I9bmV3IFRpa3pqYXgodGhpcy5hcHAsdGhpcylcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3IucmVhZHlMYXlvdXQoKTtcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IuYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCk7XG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlZ2lzdGVyVGlrekNvZGVCbG9jaygpO1xuICAgIFxuICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTWF0aFBsdWdpblNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJtYXRoLWVuZ2luZVwiLCB0aGlzLnByb2Nlc3NNYXRoQmxvY2suYmluZCh0aGlzKSk7XG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrempheFwiLCB0aGlzLnByb2Nlc3NUaWt6QmxvY2suYmluZCh0aGlzKSk7XG4gICAgdGhpcy5yZWdpc3RlckNvbW1hbmRzKCk7XG4gICAgdGhpcy5jcmVhdGVDb250ZXh0QmFzZWRMaW5lU3R5bGluZygpXG5cbiAgICB0aGlzLnJlZ2lzdGVyRWRpdG9yU3VnZ2VzdChuZXcgTnVtZXJhbHNTdWdnZXN0b3IodGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJDb2RlTWlycm9yRXh0ZW5zaW9ucygpO1xuICAgIC8vIEV4ZWN1dGUgdGhlIGBhKClgIG1ldGhvZCB0byBsb2cgYW5kIG1vZGlmeSBhbGwgZGl2c1xuICAgIC8vdGhpcy5wcm9jZXNzRGl2cygpO1xuICB9XG4gIG9udW5sb2FkKCkge1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0fVxuXG4gIHJlZ2lzdGVyQ29kZU1pcnJvckV4dGVuc2lvbnMoKSB7XG4gICAgdGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbihbXG4gICAgICAvLyBLZXlkb3duIGhhbmRsZXIgd2l0aCBoaWdoZXN0IHByZWNlZGVuY2VcbiAgICAgIFByZWMuaGlnaGVzdChFZGl0b3JWaWV3LmRvbUV2ZW50SGFuZGxlcnMoeyBcImtleWRvd25cIjogdGhpcy5vbktleWRvd24uYmluZCh0aGlzKSB9KSksXG5cbiAgICAgIC8vIFVwZGF0ZSBsaXN0ZW5lciBmb3IgZWRpdG9yIHN0YXRlIGNoYW5nZXNcbiAgICAgIEVkaXRvclZpZXcudXBkYXRlTGlzdGVuZXIub2YodGhpcy5oYW5kbGVVcGRhdGUuYmluZCh0aGlzKSksXG4gICAgXSk7XG4gIH1cbiAgb25LZXlkb3duKGV2ZW50OiBLZXlib2FyZEV2ZW50KSB7XG4gICAgY29uc29sZS5sb2coXCJldmVudFwiLGV2ZW50KTtcbiAgfVxuICBoYW5kbGVVcGRhdGUodXBkYXRlOiBWaWV3VXBkYXRlKSB7XG4gICAgaWYgKHVwZGF0ZS5kb2NDaGFuZ2VkKSB7XG4gICAgICAvL2NvbnNvbGUubG9nKFwiRWRpdG9yIGNvbnRlbnQgY2hhbmdlZDpcIiwgdXBkYXRlLnN0YXRlLmRvYy50b1N0cmluZygpKTtcbiAgICAgIC8vIEFkZCBsb2dpYyB0byBzeW5jIGNvbnRlbnQgb3IgcmVmbGVjdCBjaGFuZ2VzIGluIHRoZSBVSVxuICAgIH1cbiAgfVxuICBjcmVhdGVDb250ZXh0QmFzZWRMaW5lU3R5bGluZygpe1xuICAgIHRoaXMucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24oXG4gICAgICAgIFZpZXdQbHVnaW4uZnJvbUNsYXNzKFJ0bEZvcmMsIHtcbiAgICAgICAgZGVjb3JhdGlvbnM6ICh2KSA9PiB2LmRlY29yYXRpb25zLFxuICAgICAgfVxuICAgICkpO1xuICB9XG5cbiAgcHJvY2Vzc1Rpa3pCbG9jayhzb3VyY2U6IHN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICBjb25zdCBzdmcgPSBuZXcgVGlrelN2Zyhzb3VyY2UpO1xuICBcbiAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oY29udGFpbmVyLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XG4gICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxuICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcbiAgfSk7XG4gIFxuXG4gIGNvbnN0IGdyYXBoID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XG4gICAgc3R5bGU6IFwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCJcbiAgfSk7XG4gIGdyYXBoLmFwcGVuZENoaWxkKHN2Zy5nZXRTdmcoKSk7XG4gIHN2Zy5kZWJ1Z0luZm8rPWdyYXBoLm91dGVySFRNTFxuICBjb25zb2xlLmxvZyhncmFwaC5vdXRlckhUTUwpXG4gIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCBzdmcuZGVidWdJbmZvKS5vcGVuKCk7XG4gIFxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQoaWNvbik7XG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmFwaCk7XG59XG5cblxuICBwcml2YXRlIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgfVxuXG4gIHByaXZhdGUgcmVnaXN0ZXJDb21tYW5kcygpIHtcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgaWQ6IFwib3Blbi1pbnB1dC1mb3JtXCIsXG4gICAgICBuYW1lOiBcIk9wZW4gSW5wdXQgRm9ybVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+IG5ldyBWZWNJbnB1dE1vZGVsKHRoaXMuYXBwLHRoaXMpLm9wZW4oKSxcbiAgICB9KTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ2aWV3LXNlc3Npb24taGlzdG9yeVwiLFxuICAgICAgbmFtZTogXCJWaWV3IFNlc3Npb24gSGlzdG9yeVwiLFxuICAgICAgLy9jYWxsYmFjazogKCkgPT4gbmV3IEhpc3RvcnlNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpLFxuICAgIH0pO1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJ0ZXN0LW1hdGhFbmdpbmVcIixcbiAgICAgIG5hbWU6IFwidGVzdCBtYXRoIGVuZ2luZVwiLFxuICAgICAgY2FsbGJhY2s6ICgpID0+dGVzdE1hdGhFbmdpbmUoKSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgcHJvY2Vzc01hdGhCbG9jayhzb3VyY2U6IHN0cmluZywgbWFpbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcbiAgICBtYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWNvbnRhaW5lclwiKTtcbiAgICBcbiAgICBjb25zdCB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG4gICAgbGV0IHNraXBwZWRJbmRleGVzID0gMDtcblxuICAgIGNvbnN0IGV4cHJlc3Npb25zID0gc291cmNlLnNwbGl0KFwiXFxuXCIpLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKS5maWx0ZXIobGluZSA9PiBsaW5lKTtcbiAgICBpZiAoZXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7cmV0dXJuO31cblxuICAgIFxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XG4gICAgICBsZXQgbGluZUNvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgbGluZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1saW5lLWNvbnRhaW5lclwiLCAoaW5kZXgtc2tpcHBlZEluZGV4ZXMpICUgMiA9PT0gMCA/IFwibWF0aC1yb3ctZXZlblwiIDogXCJtYXRoLXJvdy1vZGRcIik7XG4gICAgICAvL2lmIChleHByZXNzaW9uLm1hdGNoKC9eXFwvXFwvLykpe31cbiAgICAgIGNvbnN0IHByb2Nlc3NNYXRoID0gbmV3IFByb2Nlc3NNYXRoKGV4cHJlc3Npb24sdXNlclZhcmlhYmxlcywgdGhpcy5hcHAsbGluZUNvbnRhaW5lcik7XG4gICAgICBwcm9jZXNzTWF0aC5pbml0aWFsaXplKCk7XG5cbiAgICAgIGlmKHByb2Nlc3NNYXRoLm1vZGUhPT1cInZhcmlhYmxlXCIpe1xuICAgICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xuICAgICAgICBtYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKGxpbmVDb250YWluZXIpO1xuICAgICAgfVxuICAgICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cbiAgICB9KTtcbiAgfVxufVxuXG5cblxuXG5jbGFzcyBQcm9jZXNzTWF0aCB7XG4gIG1hdGhJbnB1dDogYW55O1xuICB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG4gIG1vZGUgPSBcIm1hdGhcIjtcbiAgcmVzdWx0OiBhbnk7XG4gIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG4gIGljb25zRGl2OiBIVE1MRWxlbWVudDtcbiAgYXBwOiBBcHA7XG5cbiAgY29uc3RydWN0b3IobWF0aElucHV0OiBzdHJpbmcsdXNlclZhcmlhYmxlczogYW55LCBhcHA6IEFwcCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xuICAgIHRoaXMudXNlclZhcmlhYmxlcz11c2VyVmFyaWFibGVzO1xuICAgIHRoaXMuYXBwID0gYXBwO1xuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuICAgIHRoaXMuaWNvbnNEaXYgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWljb25zXCIsXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplKCkge1xuICAgIHRoaXMuYXNzaWduTW9kZSgpO1xuICAgIHRoaXMuc2V0dXBDb250YWluZXIoKTtcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xuICAgIHRoaXMucmVuZGVyTWF0aCgpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cENvbnRhaW5lcigpIHtcbiAgICBbXCJtYXRoLWlucHV0XCIsIFwibWF0aC1yZXN1bHRcIl0uZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGRpdi5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIH0pO1xuICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuaWNvbnNEaXYpO1xuICB9XG5cbiAgcHJpdmF0ZSByZW5kZXJNYXRoKCkge1xuICAgIGNvbnN0IGlucHV0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLWlucHV0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XG4gICAgdHJ5IHtcbiAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIGNvbnN0IGJpbm9tTW9kZWwgPSBuZXcgQmlub21JbmZvTW9kZWwodGhpcy5hcHAsIHRoaXMubWF0aElucHV0KTtcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IGJpbm9tTW9kZWwuZ2V0RXF1YWwoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImNvc1wiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIGNvbnN0IFsgLCBzaWRlQSwgc2lkZUIsIHNpZGVDIF0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoTnVtYmVyKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInZlY1wiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIHRoaXMucmVzdWx0PW5ldyBWZWNQcm9jZXNzb3IodGhpcy5tYXRoSW5wdXRbMV0sdGhpcy5tYXRoSW5wdXRbMl0sdGhpcy5tYXRoSW5wdXRbM10pO1xuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyB0aWt6R3JhcGgodGhpcy5hcHAsIHRoaXMucmVzdWx0LmdyYXBoKSk7XG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xuICAgICAgICAgIHRoaXMucmVzdWx0PXRoaXMucmVzdWx0LnJlc3VsdFxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IG5ldyBNYXRoUHJhaXNlcih0aGlzLm1hdGhJbnB1dCk7XG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8pKTtcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xuICAgICAgICAgIHRoaXMubWF0aElucHV0PXRoaXMucmVzdWx0LmlucHV0O1xuICAgICAgICAgIHRoaXMucmVzdWx0ID0gdGhpcy5yZXN1bHQuc29sdXRpb247XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgIHRoaXMuYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXYsIHJlc3VsdERpdiwgdHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIj90aGlzLm1hdGhJbnB1dDp0aGlzLm1hdGhJbnB1dFswXSwgcm91bmRCeVNldHRpbmdzKHRoaXMucmVzdWx0KSk7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLmRpc3BsYXlFcnJvcihpbnB1dERpdiwgcmVzdWx0RGl2LCBlcnIpO1xuICAgICAgY29uc29sZS5lcnJvcihcIlRoZSBpbml0aWFsIHByYWlzaW5nIGZhaWxlZFwiLGVycik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGlucHV0OiBzdHJpbmcsIHJlc3VsdDogYW55KSB7XG4gICAgaW5wdXREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChpbnB1dCx0cnVlKSlcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcJHske2lucHV0fX0kYCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gICAgLy9jb25zdCByZXN1bHRPdXRwdXQgPSAvKHRydWV8ZmFsc2UpLy50ZXN0KHJlc3VsdCkgPyByZXN1bHQgOiBgXFwkeyR7cmVzdWx0fX0kYDtcbiAgICByZXN1bHREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChyZXN1bHQudG9TdHJpbmcoKSx0cnVlKSlcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24ocmVzdWx0T3V0cHV0LCByZXN1bHREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gIH1cblxuICBwcml2YXRlIGRpc3BsYXlFcnJvcihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGVycjogRXJyb3IpIHtcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHRoaXMubWF0aElucHV0LCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcbiAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiZXJyb3ItdGV4dFwiPiR7ZXJyLm1lc3NhZ2V9PC9zcGFuPmA7XG4gICAgdGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtZXJyb3ItbGluZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXNzaWduTW9kZSgpIHtcbiAgICBjb25zdCByZWdleExpc3QgPSBHZXRNYXRoQ29udGV4dFJlZ2V4KCk7XG4gICAgY29uc3QgbWF0Y2hPYmplY3QgPSByZWdleExpc3QuZmluZChyZWdleE9iaiA9PiByZWdleE9iai5yZWdleC50ZXN0KHRoaXMubWF0aElucHV0KSk7XG4gICAgaWYgKG1hdGNoT2JqZWN0KSB7XG4gICAgICB0aGlzLm1vZGUgPSBtYXRjaE9iamVjdC52YWx1ZTtcbiAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQubWF0Y2gobWF0Y2hPYmplY3QucmVnZXgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYWRkSW5mb01vZGFsKG1vZGFsOiBhbnkpIHtcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pbmZvLWljb25cIixcbiAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcbiAgICB9KTtcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcbiAgfVxuXG4gIHByaXZhdGUgYWRkRGVidWdNb2RlbChtb2RhbDogYW55KSB7XG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+QnlwiLFxuICAgIH0pO1xuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZXMoKSB7XG4gICAgaWYgKHRoaXMubW9kZT09PVwidmFyaWFibGVcIikge1xuICAgICAgdGhpcy5oYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpIHtcbiAgICBjb25zdCBbXyx2YXJpYWJsZSwgdmFsdWVdID0gdGhpcy5tYXRoSW5wdXQubWFwKChwYXJ0OiBzdHJpbmcpID0+IHBhcnQudHJpbSgpKTtcbiAgICBpZiAoIXZhcmlhYmxlIHx8ICF2YWx1ZSkge1xuICAgICAgY29uc29sZS53YXJuKGBJbnZhbGlkIHZhcmlhYmxlIGRlY2xhcmF0aW9uOiAke3RoaXMubWF0aElucHV0fWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBleGlzdGluZ1ZhckluZGV4ID0gdGhpcy51c2VyVmFyaWFibGVzLmZpbmRJbmRleCh2ID0+IHYudmFyaWFibGUgPT09IHZhcmlhYmxlKTtcbiAgICBpZiAoZXhpc3RpbmdWYXJJbmRleCAhPT0gLTEpIHtcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlc1tleGlzdGluZ1ZhckluZGV4XS52YWx1ZSA9IHZhbHVlO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXMucHVzaCh7IHZhcmlhYmxlLCB2YWx1ZSB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKXtcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXMuZm9yRWFjaCgoeyB2YXJpYWJsZSwgdmFsdWUgfSkgPT4ge1xuICAgICAgaWYgKHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCIpe1xuICAgICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0LnJlcGxhY2UodmFyaWFibGUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIEdldE1hdGhDb250ZXh0UmVnZXgoKSB7XG4gIHJldHVybiBbXG4gICAgeyByZWdleDogL2Jpbm9tXFwoKFxcZCspLChcXGQrKSwoXFxkKylcXCkvLCB2YWx1ZTogXCJiaW5vbVwiIH0sXG4gICAgeyByZWdleDogL3ZlYyhbKy1dezAsMn0pXFwoKFtcXGQuKy1dK1s6LF1bXFxkListXSspXFwpKFtcXGQuKy1dKikvLCB2YWx1ZTogXCJ2ZWNcIiB9LFxuICAgIHsgcmVnZXg6IC9jb3NcXCgoW1xcZC5dKyksKFtcXGQuXSspLChbXFxkLl0rKVxcKS8sIHZhbHVlOiBcImNvc1wiIH0sXG4gICAgeyByZWdleDogL3ZhclxccyooW1xcd10rKVxccyo9XFxzKihbXFxkLl0rKS8sIHZhbHVlOiBcInZhcmlhYmxlXCIgfSxcbiAgXTtcbn1cblxuXG5jbGFzcyBWZWNQcm9jZXNzb3Ige1xuICB1c2VySW5wdXQ6IGFueTtcbiAgZW52aXJvbm1lbnQ6IHsgWDogc3RyaW5nOyBZOiBzdHJpbmcgfTtcbiAgdmVjSW5mbyA9IG5ldyBNYXRoSW5mbygpO1xuICBheGlzOiBBeGlzO1xuICBtb2RpZmllcjogbnVtYmVyO1xuICByZXN1bHQ6IHN0cmluZztcbiAgZ3JhcGg/OiBhbnk7XG5cbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgbWF0aElucHV0OiBzdHJpbmcsIG1vZGlmaWVyOiBzdHJpbmcpIHtcbiAgICB0aGlzLnVzZXJJbnB1dD1tYXRoSW5wdXQ7XG4gICAgY29uc3QgbWF0Y2ggPSBlbnZpcm9ubWVudC5tYXRjaCgvKFsrLV0/KShbKy1dPykvKTtcbiAgICB0aGlzLmVudmlyb25tZW50ID0geyBYOiBtYXRjaD8uWzFdID8/IFwiK1wiLCBZOiBtYXRjaD8uWzJdID8/IFwiK1wiIH07XG5cbiAgICB0aGlzLm1vZGlmaWVyID0gbW9kaWZpZXIubGVuZ3RoID4gMCA/IGdldFVzYWJsZURlZ3JlZXMoTnVtYmVyKG1vZGlmaWVyKSkgOiAwO1xuXG4gICAgdGhpcy5heGlzPW5ldyBBeGlzKCkudW5pdmVyc2FsKHRoaXMudXNlcklucHV0KVxuICAgIGlmICghdGhpcy5heGlzLnBvbGFyQW5nbGUpXG4gICAgICB0aGlzLmF4aXMuY2FydGVzaWFuVG9Qb2xhcigpO1xuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJheGlzXCIsdGhpcy5heGlzKTtcbiAgICB0aGlzLmFkZFJlc3VsdCgpO1xuICAgIHRoaXMuYWRkR3JhcGgoKTtcbiAgfVxuICBhZGRSZXN1bHQoKXtcbiAgICBpZiAodGhpcy51c2VySW5wdXQuaW5jbHVkZXMoXCI6XCIpKVxuICAgICAgdGhpcy5yZXN1bHQ9YHggPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5YfVxcXFxxdWFkLHkgPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5ZfWBcbiAgICBlbHNlXG4gICAgICB0aGlzLnJlc3VsdD1gYW5nbGUgPSAke3RoaXMuYXhpcy5wb2xhckFuZ2xlfVxcXFxxdWFkLGxlbmd0aCA9ICR7dGhpcy5heGlzLnBvbGFyTGVuZ3RofWBcbiAgfVxuICBhZGRHcmFwaCgpIHtcbiAgICBjb25zdCB0YXJnZXRTaXplID0gMTA7XG4gICAgY29uc3QgbWF4Q29tcG9uZW50ID0gTWF0aC5tYXgoTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblgpLCBNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWSkpO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHNjYWxpbmcgZmFjdG9yXG4gICAgbGV0IHNjYWxlID0gMTtcbiAgICBpZiAobWF4Q29tcG9uZW50IDwgdGFyZ2V0U2l6ZSkge1xuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xuICAgIH0gZWxzZSBpZiAobWF4Q29tcG9uZW50ID4gdGFyZ2V0U2l6ZSkge1xuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xuICAgIH1cbiAgICAvLyBpIG5lZWQgdG8gbWFrZSBpdCBcInRvIFggYXhpc1wiXG4gICAgLy9jb25zdCB2ZWN0b3JBbmdsZSA9IGdldFVzYWJsZURlZ3JlZXMocmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4yKHNjYWxlZFksIHNjYWxlZFgpKSk7XG4gICAgXG4gICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoMCwwKTtcblxuXG4gICAvLyBjb25zdCBkcmF3PSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5wb2xhckxlbmd0aC50b1N0cmluZygpfSksdGhpcy5heGlzXTtcbiAgICAvL2NvbnN0IGRyYXdYPSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5jYXJ0ZXNpYW5YLnRvU3RyaW5nKCl9KSxuZXcgQXhpcyh0aGlzLmF4aXMuY2FydGVzaWFuWCwwKV07XG4gICAgLy9jb25zdCBkcmF3WT0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWS50b1N0cmluZygpfSksbmV3IEF4aXMoMCx0aGlzLmF4aXMuY2FydGVzaWFuWSldO1xuXG4gICAgdGhpcy5ncmFwaD1bXG4gICAgICAvL25ldyBGb3JtYXR0aW5nKFwiZ2xvYm9sXCIse2NvbG9yOiBcIndoaXRlXCIsc2NhbGU6IDEsfSksXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3LGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJyZWRcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3WCxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhd1ksZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcbiAgICBdXG4gICAgXG4gICAgXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGhcIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRva2VucyxudWxsLDEpKTtcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaC50b1N0cmluZygpXFxuXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b1N0cmluZygpKSk7XG4gICAgLyogR2VuZXJhdGUgTGFUZVggY29kZSBmb3IgdmVjdG9yIGNvbXBvbmVudHMgYW5kIG1haW4gdmVjdG9yXG4gICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXG5cbiAgICAgICUgQW5nbGUgQW5ub3RhdGlvblxuICAgICAgJVxcYW5ne1h9e2FuY317dmVjfXt9eyR7cm91bmRCeVNldHRpbmdzKHZlY3RvckFuZ2xlKX0kXntcXGNpcmN9JH1cbiAgICBgLnJlcGxhY2UoL15cXHMrL2dtLCBcIlwiKTsqL1xuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJTY2FsaW5nIGZhY3RvclwiLCBzY2FsZSk7XG4gIH1cbn1cblxuXG5cbmNsYXNzIHRpa3pHcmFwaCBleHRlbmRzIE1vZGFsIHtcbiAgdGlrejogRm9ybWF0VGlrempheDtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsdGlrekNvZGU6IGFueSl7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnRpa3o9bmV3IEZvcm1hdFRpa3pqYXgodGlrekNvZGUpO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnN0IGNvZGU9dGhpcy50aWt6O1xuICAgIGNvbnN0IHNjcmlwdCA9IGNvbnRlbnRFbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xuICAgIHNjcmlwdC5zZXRUZXh0KGNvZGUuZ2V0Q29kZSgpKTtcbiAgICBcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcblxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6LmdldENvZGUoKSk7XG4gICAgICBuZXcgTm90aWNlKFwiR3JhcGggY29waWVkIHRvIGNsaXBib2FyZCFcIik7XG4gICAgfSk7XG4gIH1cbiAgb25DbG9zZSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICB9XG59XG5cbnR5cGUgRGlzdHJpYnV0aW9uVHlwZSA9ICdub3JtYWwnIHwgJ2Jpbm9taWFsJyB8ICdwb2lzc29uJztcblxuY2xhc3MgRGlzdHJpYnV0aW9uIHtcbiAgcHJpdmF0ZSB0eXBlOiBEaXN0cmlidXRpb25UeXBlO1xuICBwcml2YXRlIHg6IG51bWJlcjtcbiAgcHJpdmF0ZSBtdTogbnVtYmVyO1xuICBwcml2YXRlIHNpZ21hOiBudW1iZXJcbiAgcHJpdmF0ZSB2YXJpYW5jZTogbnVtYmVyXG5cbiAgXG5cbiAgLy8gRm9yIEJpbm9taWFsIERpc3RyaWJ1dGlvblxuICBwcml2YXRlIHRyaWFsczogbnVtYmVyO1xuICBwcml2YXRlIHByb2JhYmlsaXR5OiBudW1iZXI7XG5cbiAgLy8gRm9yIFBvaXNzb24gRGlzdHJpYnV0aW9uXG4gIHByaXZhdGUgbGFtYmRhOiBudW1iZXI7XG4gIC8qXG4gIGNvbnN0cnVjdG9yKHR5cGU6IERpc3RyaWJ1dGlvblR5cGUsIHBhcmFtczogUmVjb3JkPHN0cmluZywgbnVtYmVyPikge1xuICAgIHRoaXMudHlwZSA9IHR5cGU7XG5cbiAgICAvLyBJbml0aWFsaXplIGJhc2VkIG9uIGRpc3RyaWJ1dGlvbiB0eXBlXG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdub3JtYWwnOlxuICAgICAgICB0aGlzLm1lYW4gPSBwYXJhbXMubWVhbiB8fCAwO1xuICAgICAgICB0aGlzLnN0ZERldiA9IHBhcmFtcy5zdGREZXYgfHwgMTtcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMuc3RkRGV2ICoqIDI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnYmlub21pYWwnOlxuICAgICAgICB0aGlzLnRyaWFscyA9IHBhcmFtcy50cmlhbHMgfHwgMTtcbiAgICAgICAgdGhpcy5wcm9iYWJpbGl0eSA9IHBhcmFtcy5wcm9iYWJpbGl0eSB8fCAwLjU7XG4gICAgICAgIHRoaXMubWVhbiA9IHRoaXMudHJpYWxzICogdGhpcy5wcm9iYWJpbGl0eTtcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubWVhbiAqICgxIC0gdGhpcy5wcm9iYWJpbGl0eSk7XG4gICAgICAgIHRoaXMuc3RkRGV2ID0gTWF0aC5zcXJ0KHRoaXMudmFyaWFuY2UpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BvaXNzb24nOlxuICAgICAgICB0aGlzLmxhbWJkYSA9IHBhcmFtcy5sYW1iZGEgfHwgMTtcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy5sYW1iZGE7XG4gICAgICAgIHRoaXMudmFyaWFuY2UgPSB0aGlzLmxhbWJkYTtcbiAgICAgICAgdGhpcy5zdGREZXYgPSBNYXRoLnNxcnQodGhpcy52YXJpYW5jZSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBkaXN0cmlidXRpb24gdHlwZScpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBub3JtYWxQREYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAnbm9ybWFsJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XG4gICAgfVxuICAgIGNvbnN0IGV4cFBhcnQgPSBNYXRoLmV4cCgtKCh4IC0gdGhpcy5tZWFuKSAqKiAyKSAvICgyICogdGhpcy52YXJpYW5jZSkpO1xuICAgIHJldHVybiAoMSAvICh0aGlzLnN0ZERldiAqIE1hdGguc3FydCgyICogTWF0aC5QSSkpKSAqIGV4cFBhcnQ7XG4gIH1cblxuICBwdWJsaWMgbm9ybWFsQ0RGKHg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ25vcm1hbCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ0RGIG9ubHkgYXBwbGllcyB0byB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbicpO1xuICAgIH1cbiAgICByZXR1cm4gMC41ICogKDEgKyB0aGlzLmVyZigoeCAtIHRoaXMubWVhbikgLyAoTWF0aC5zcXJ0KDIpICogdGhpcy5zdGREZXYpKSk7XG4gIH1cblxuICBwdWJsaWMgYmlub21pYWxQTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAnYmlub21pYWwnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BNRiBvbmx5IGFwcGxpZXMgdG8gdGhlIEJpbm9taWFsIERpc3RyaWJ1dGlvbicpO1xuICAgIH1cbiAgICBjb25zdCBjb21iaW5hdGlvbiA9IHRoaXMuZmFjdG9yaWFsKHRoaXMudHJpYWxzKSAvXG4gICAgICAodGhpcy5mYWN0b3JpYWwoeCkgKiB0aGlzLmZhY3RvcmlhbCh0aGlzLnRyaWFscyAtIHgpKTtcbiAgICByZXR1cm4gY29tYmluYXRpb24gKiBNYXRoLnBvdyh0aGlzLnByb2JhYmlsaXR5LCB4KSAqIE1hdGgucG93KDEgLSB0aGlzLnByb2JhYmlsaXR5LCB0aGlzLnRyaWFscyAtIHgpO1xuICB9XG5cbiAgcHVibGljIHBvaXNzb25QTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAncG9pc3NvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUE1GIG9ubHkgYXBwbGllcyB0byB0aGUgUG9pc3NvbiBEaXN0cmlidXRpb24nKTtcbiAgICB9XG4gICAgcmV0dXJuIChNYXRoLnBvdyh0aGlzLmxhbWJkYSwgeCkgKiBNYXRoLmV4cCgtdGhpcy5sYW1iZGEpKSAvIHRoaXMuZmFjdG9yaWFsKHgpO1xuICB9XG5cbiAgcHJpdmF0ZSBlcmYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBzaWduID0geCA8IDAgPyAtMSA6IDE7XG4gICAgY29uc3QgYSA9IDAuMzI3NTkxMTtcbiAgICBjb25zdCBwID0gMC4yNTQ4Mjk1OTI7XG4gICAgY29uc3QgcSA9IC0wLjI4NDQ5NjczNjtcbiAgICBjb25zdCByID0gMS40MjE0MTM3NDE7XG4gICAgY29uc3QgcyA9IC0xLjQ1MzE1MjAyNztcbiAgICBjb25zdCB0ID0gMS4wNjE0MDU0Mjk7XG4gICAgY29uc3QgdSA9IDEgKyBhICogTWF0aC5hYnMoeCk7XG4gICAgY29uc3QgcG9seSA9ICgoKCgocCAqIHUgKyBxKSAqIHUgKyByKSAqIHUgKyBzKSAqIHUgKyB0KSAqIHUpO1xuICAgIHJldHVybiBzaWduICogKDEgLSBwb2x5ICogTWF0aC5leHAoLXggKiB4KSk7XG4gIH1cblxuICBwcml2YXRlIGZhY3RvcmlhbChuOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChuIDwgMCkgcmV0dXJuIE5hTjtcbiAgICBsZXQgcmVzdWx0ID0gMTtcbiAgICBmb3IgKGxldCBpID0gMjsgaSA8PSBuOyBpKyspIHJlc3VsdCAqPSBpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0qL1xufVxuXG5cbmNsYXNzIERpc3RyaWJ1dGlvbk1vZGVsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG46IG51bWJlcjtcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XG4gIHByaXZhdGUgcDogbnVtYmVyO1xuICBwcml2YXRlIGVxdWFsID0gMDtcbiAgcHJpdmF0ZSBsZXNzID0gMDtcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xuICBwcml2YXRlIGJpZyA9IDA7XG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuayA9IGs7XG4gICAgdGhpcy5wID0gcDtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xuICB9XG5cbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgIH1cbiAgfVxufVxuXG5cblxuXG5cblxuXG5jbGFzcyBCaW5vbUluZm9Nb2RlbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XG4gIHByaXZhdGUgazogbnVtYmVyO1xuICBwcml2YXRlIHA6IG51bWJlcjtcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XG4gIHByaXZhdGUgbGVzcyA9IDA7XG4gIHByaXZhdGUgbGVzc0VxdWFsID0gMDtcbiAgcHJpdmF0ZSBiaWcgPSAwO1xuICBwcml2YXRlIGJpZ0VxdWFsID0gMDtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihhcHApO1xuICAgIGNvbnN0IFtfLCBuLCBrLCBwXSA9IHNvdXJjZS5tYXRjaCgvXFxkKy9nKSEubWFwKE51bWJlcik7XG4gICAgdGhpcy5uID0gbjtcbiAgICB0aGlzLmsgPSBrO1xuICAgIHRoaXMucCA9IHA7XG4gIH1cblxuICBvbk9wZW4oKSB7XG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkJpbm9taWFsIFByb2JhYmlsaXR5IFJlc3VsdHNcIiB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRFcXVhbCgpOiBudW1iZXIge1xuICAgIHJldHVybiBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIHRoaXMuaywgdGhpcy5wKTtcbiAgfVxuXG4gIHByaXZhdGUgY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xuICAgICAgY29uc3QgcHJvYmFiaWxpdHkgPSBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIGksIHRoaXMucCk7XG4gICAgICBpZiAoaSA9PT0gdGhpcy5rKSB0aGlzLmVxdWFsID0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPD0gdGhpcy5rKSB0aGlzLmxlc3NFcXVhbCArPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpID4gdGhpcy5rKSB0aGlzLmJpZyArPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcbiAgICB9XG4gIH1cbn1cblxuXG5cblxuXG5cbmZ1bmN0aW9uIHRlc3RNYXRoRW5naW5lKCl7XG4gIGNvbnN0IGV4cHJlc3Npb25zPVtcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2AyIFxcZnJhY3soNS0zKTM0fXtcXHNxcnR7Ml57Mn19fTAuNWAsZXhwZWN0ZWRPdXRwdXQ6ICczNCd9LFxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YCh4KzEpKHgrMyk9MmAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTAuMjY3OTUseF8yPS0zLjczMjA1J30sXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgXFxmcmFjezEzMn17MTI2MCt4XnsyfX09MC4wNWAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTM3LjE0ODM1LHhfMj0zNy4xNDgzNSd9LFxuICBdXG4gIGNvbnN0IHJlc3VsdHM9W11cbiAgdHJ5e1xuICAgIGV4cHJlc3Npb25zLmZvckVhY2goZXhwcmVzc2lvbiA9PiB7XG4gICAgICBjb25zdCBtYXRoPW5ldyBNYXRoUHJhaXNlcihleHByZXNzaW9uLmV4cHJlc3Npb24pO1xuICAgICAgaWYgKG1hdGguc29sdXRpb24hPT1leHByZXNzaW9uLmV4cGVjdGVkT3V0cHV0KXtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtleHByZXNzaW9uOiBleHByZXNzaW9uLmV4cHJlc3Npb24sZXhwZWN0ZWRPdXRwdXQ6IGV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQsYWN0dWFsT3V0cHV0OiBtYXRoLnNvbHV0aW9ufSlcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICBjYXRjaChlKXtcbiAgICBjb25zb2xlLmxvZyhlKVxuICB9XG59XG5cblxuXG5cbiJdfQ==