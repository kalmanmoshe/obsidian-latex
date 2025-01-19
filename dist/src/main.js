//git reset --hard
//git branch
import { Plugin, MarkdownRenderer, addIcon, Modal, Component, Notice, loadMathJax, renderMath } from "obsidian";
import { html as beautifyHTML } from 'js-beautify';
import { MathInfo, MathPraiser } from "./mathParser/mathEngine";
import { InfoModal, DebugModal } from "./desplyModals";
import { DEFAULT_SETTINGS, processLatexSuiteSettings } from "./settings/settings";
import { LatexSuiteSettingTab } from "./settings/settings_tab";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "src/mathParser/mathUtilities";
import { Axis, Tikzjax } from "./tikzjax/tikzjax";
import { FormatTikzjax } from "./tikzjax/interpret/tokenizeTikzjax.js";
import { EditorExtensions } from "./setEditorExtensions.js";
import { onFileCreate, onFileChange, onFileDelete, getSnippetsFromFiles, getFileSets, getVariablesFromFiles, tryGetVariablesFromUnknownFiles } from "./settings/file_watch";
import { ICONS } from "./settings/ui/icons";
import { getEditorCommands } from "./features/editor_commands";
import { parseSnippetVariables, parseSnippets } from "./snippets/parse";
// i want to make some code that will outo insot metadata to fillls
export default class Moshe extends Plugin {
    settings;
    CMSettings;
    editorExtensions = [];
    tikzProcessor;
    editorExtensions2 = new EditorExtensions();
    async onload() {
        console.log("new lod");
        //new LatexRender(this.app,this)
        await this.loadSettings();
        this.loadIcons();
        this.addSettingTab(new LatexSuiteSettingTab(this.app, this));
        loadMathJax();
        // Register Latex Suite extensions and optional editor extensions for editor enhancements
        this.registerEditorExtension(this.editorExtensions);
        // Watch for changes to the snippet variables and snippets files
        this.watchFiles();
        this.addEditorCommands();
        this.tikzProcessor = new Tikzjax(this.app, this);
        this.tikzProcessor.readyLayout();
        this.tikzProcessor.addSyntaxHighlighting();
        this.tikzProcessor.registerTikzCodeBlock();
        this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
        this.registerMarkdownCodeBlockProcessor("tikzjax", processTikzBlock.bind(this));
    }
    addEditorCommands() {
        for (const command of getEditorCommands(this)) {
            this.addCommand(command);
        }
    }
    onunload() {
        this.tikzProcessor.unloadTikZJaxAllWindows();
        this.tikzProcessor.removeSyntaxHighlighting();
    }
    async getSettingsSnippets(snippetVariables) {
        try {
            return await parseSnippets(this.settings.snippets, snippetVariables);
        }
        catch (e) {
            new Notice(`Failed to load snippets from settings: ${e}`);
            return [];
        }
    }
    loadIcons() {
        for (const [iconId, svgContent] of Object.entries(ICONS)) {
            addIcon(iconId, svgContent);
        }
    }
    async loadSettings() {
        let data = await this.loadData();
        // Migrate settings from v1.8.0 - v1.8.4
        const shouldMigrateSettings = data ? "basicSettings" in data : false;
        // @ts-ignore
        function migrateSettings(oldSettings) {
            return {
                ...oldSettings.basicSettings,
                ...oldSettings.rawSettings,
                snippets: oldSettings.snippets,
            };
        }
        if (shouldMigrateSettings) {
            data = migrateSettings(data);
        }
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
        if (this.settings.loadSnippetsFromFile || this.settings.loadSnippetVariablesFromFile) {
            const tempSnippetVariables = await this.getSettingsSnippetVariables();
            const tempSnippets = await this.getSettingsSnippets(tempSnippetVariables);
            this.CMSettings = processLatexSuiteSettings(tempSnippets, this.settings);
            // Use onLayoutReady so that we don't try to read the snippets file too early
            this.app.workspace.onLayoutReady(() => {
                this.processSettings();
            });
        }
        else {
            await this.processSettings();
        }
    }
    async saveSettings(didFileLocationChange = false) {
        await this.saveData(this.settings);
        this.processSettings(didFileLocationChange);
    }
    async processSettings(becauseFileLocationUpdated = false, becauseFileUpdated = false) {
        this.CMSettings = processLatexSuiteSettings(await this.getSnippets(becauseFileLocationUpdated, becauseFileUpdated), this.settings);
        this.editorExtensions2.setEditorExtensions(this);
        //this.setEditorExtensions();
        this.app.workspace.updateOptions();
    }
    async getSettingsSnippetVariables() {
        try {
            return await parseSnippetVariables(this.settings.snippetVariables);
        }
        catch (e) {
            new Notice(`Failed to load snippet variables from settings: ${e}`);
            console.log(`Failed to load snippet variables from settings: ${e}`);
            return {};
        }
    }
    async getSnippets(becauseFileLocationUpdated, becauseFileUpdated) {
        // Get files in snippet/variable folders.
        // If either is set to be loaded from settings the set will just be empty.
        const files = getFileSets(this);
        const snippetVariables = this.settings.loadSnippetVariablesFromFile
            ? await getVariablesFromFiles(this, files)
            : await this.getSettingsSnippetVariables();
        // This must be done in either case, because it also updates the set of snippet files
        const unknownFileVariables = await tryGetVariablesFromUnknownFiles(this, files);
        if (this.settings.loadSnippetVariablesFromFile) {
            // But we only use the values if the user wants them
            Object.assign(snippetVariables, unknownFileVariables);
        }
        const snippets = this.settings.loadSnippetsFromFile
            ? await getSnippetsFromFiles(this, files, snippetVariables)
            : await this.getSettingsSnippets(snippetVariables);
        this.showSnippetsLoadedNotice(snippets.length, Object.keys(snippetVariables).length, becauseFileLocationUpdated, becauseFileUpdated);
        return snippets;
    }
    showSnippetsLoadedNotice(nSnippets, nSnippetVariables, becauseFileLocationUpdated, becauseFileUpdated) {
        if (!(becauseFileLocationUpdated || becauseFileUpdated))
            return;
        const prefix = becauseFileLocationUpdated ? "Loaded " : "Successfully reloaded ";
        const body = [];
        if (this.settings.loadSnippetsFromFile)
            body.push(`${nSnippets} snippets`);
        if (this.settings.loadSnippetVariablesFromFile)
            body.push(`${nSnippetVariables} snippet variables`);
        const suffix = " from files.";
        new Notice(prefix + body.join(" and ") + suffix, 5000);
    }
    processMathBlock(source, mainContainer) {
        mainContainer.classList.add("math-container");
        const userVariables = [];
        let skippedIndexes = 0;
        const expressions = source.split("\n").map(line => line.replace(/[\s]+/, '').trim()).filter(line => line && !line.startsWith("//"));
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
    watchFiles() {
        // Only begin watching files once the layout is ready
        // Otherwise, we'll be unnecessarily reacting to many onFileCreate events of snippet files
        // that occur when Obsidian first loads
        this.app.workspace.onLayoutReady(() => {
            const eventsAndCallbacks = {
                "modify": onFileChange,
                "delete": onFileDelete,
                "create": onFileCreate
            };
            for (const [key, value] of Object.entries(eventsAndCallbacks)) {
                // @ts-expect-error
                this.registerEvent(this.app.vault.on(key, (file) => value(this, file)));
            }
        });
    }
}
function processTikzBlock(source, container) {
    try {
        const a = new FormatTikzjax(source, true);
        console.log(a);
    }
    catch (e) {
        console.error(e);
    }
    const svgContainer = Object.assign(document.createElement("div"), {
        style: "display: flex; justify-content: center; align-items: center;"
    });
    svgContainer.appendChild(dummyFunction());
    container.appendChild(svgContainer);
    console.log(beautifyHTML(container.innerHTML, { indent_size: 2 }));
}
function dummyFunction() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const bounds = new SvgBounds();
    const func = (x) => x * x;
    const arr = [];
    for (let i = -5; i <= 5; i++) {
        arr.push(new Axis(i, func(i)));
    }
    const paths = [
        new SVGpath(arr, { stroke: "black", strokeWidth: 1 }),
        /*new SVGpath([new Axis(0,30),new Axis(100,30)], { stroke: "black", strokeWidth: 1 }),
        new SVGpath([new Axis(0,60),new Axis(100,60)], { stroke: "black", strokeWidth: 1 }),
        new SVGpath([new Axis(0,90),new Axis(100,90)], { stroke: "black", strokeWidth: 1 }),*/
    ];
    paths.forEach(p => bounds.improveBounds(p.getBounds()));
    //console.log(bounds)
    svg.setAttribute("width", `${bounds.getWidth()}`);
    svg.setAttribute("height", `${bounds.getHeight()}`);
    //svg.style.border = "1px solid black";
    paths.forEach(path => svg.appendChild(path.toElement(bounds)));
    return svg;
}
export class SvgBounds {
    min;
    max;
    constructor(min, max) {
        this.min = min ?? new Axis();
        this.max = max ?? new Axis();
    }
    improveBounds(axis) {
        const updateBounds = (value, min, max) => {
            return [Math.min(value, min ?? Infinity), Math.max(value, max ?? -Infinity)];
        };
        const improveWithAxis = (inputAxis) => {
            const { cartesianX: x, cartesianY: y } = inputAxis;
            [this.min.cartesianX, this.max.cartesianX] = updateBounds(x, this.min?.cartesianX, this.max?.cartesianX);
            [this.min.cartesianY, this.max.cartesianY] = updateBounds(y, this.min?.cartesianY, this.max?.cartesianY);
        };
        const improveWithBounds = (inputBounds) => {
            improveWithAxis(inputBounds.min);
            improveWithAxis(inputBounds.max);
        };
        if (axis instanceof SvgBounds) {
            improveWithBounds(axis);
        }
        else {
            improveWithAxis(axis);
        }
    }
    getWidth() { return Math.abs(this.max.cartesianX - this.min.cartesianX); }
    getHeight() { return Math.abs(this.max.cartesianY - this.min.cartesianY); }
    compare(other) {
    }
    clone() {
        return new SvgBounds(this.min, this.max);
    }
    static improvedBounds() {
    }
}
class mathFunction {
    yIntersect;
    xIntersects;
}
class SVGpath {
    axes;
    formatting;
    constructor(coordinates, formatting = {}) {
        this.axes = coordinates;
        this.formatting = formatting;
    }
    getBounds() {
        const bounds = new SvgBounds();
        this.axes.forEach(axis => {
            bounds.improveBounds(axis);
        });
        return bounds;
    }
    toElement(bounds) {
        const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const pathData = this.axes.map((coord, index) => {
            const command = index === 0 ? 'M' : 'L';
            return `${command} ${coord.toStringSVG(bounds)}`;
        }).join(' ') + ' Z';
        pathElement.setAttribute("d", pathData);
        if (this.formatting.stroke)
            pathElement.setAttribute("stroke", this.formatting.stroke);
        if (this.formatting.strokeWidth)
            pathElement.setAttribute("stroke-width", this.formatting.strokeWidth.toString());
        if (this.formatting.fill)
            pathElement.setAttribute("fill", this.formatting.fill);
        else
            pathElement.setAttribute("fill", "none");
        return pathElement;
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
        this.calculateMath();
    }
    setupContainer() {
        ["math-input", "math-result"].forEach(className => {
            const div = document.createElement("div");
            div.classList.add(className);
            this.container.appendChild(div);
        });
        this.container.appendChild(this.iconsDiv);
    }
    calculateMath() {
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
                    break;
            }
            this.addInputAndResultDiv(inputDiv, resultDiv, typeof this.mathInput === "string" ? this.mathInput : this.mathInput[0], this.result /*roundBySettings(this.result)*/);
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
        resultDiv.appendChild(renderMath(String(roundBySettings(result.solutionToString())), true));
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
        script.setText(code.getCode(this.app));
        const actionButton = contentEl.createEl("button", { text: "Copy graph", cls: "info-modal-Copy-button" });
        actionButton.addEventListener("click", () => {
            navigator.clipboard.writeText(this.tikz.getCode(this.app));
            new Notice("Graph copied to clipboard!");
        });
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLGtCQUFrQjtBQUNsQixZQUFZO0FBQ1osT0FBTyxFQUFDLE1BQU0sRUFBRSxnQkFBZ0IsRUFBQyxPQUFPLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEVBQWtCLFdBQVcsRUFBQyxVQUFVLEVBQTZHLE1BQU0sVUFBVSxDQUFDO0FBQ3JQLE9BQU8sRUFBRSxJQUFJLElBQUksWUFBWSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ25ELE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUN2RCxPQUFPLEVBQTJCLGdCQUFnQixFQUF3Qix5QkFBeUIsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBQ2hJLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxjQUFjLEVBQW9CLHFCQUFxQixFQUFFLGdCQUFnQixFQUFzQyxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM5SyxPQUFPLEVBQUUsSUFBSSxFQUFnQyxPQUFPLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUdoRixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFNUQsT0FBTyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVLLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUU1QyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUs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QUNMLENBQUM7SUFDRCxPQUFNLENBQUMsRUFBQyxDQUFDO1FBQ1AsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNoQixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vZ2l0IHJlc2V0IC0taGFyZFxuLy9naXQgYnJhbmNoXG5pbXBvcnQge1BsdWdpbiwgTWFya2Rvd25SZW5kZXJlcixhZGRJY29uLCBBcHAsIE1vZGFsLCBDb21wb25lbnQsIFNldHRpbmcsTm90aWNlLCBXb3Jrc3BhY2VXaW5kb3csbG9hZE1hdGhKYXgscmVuZGVyTWF0aCwgTWFya2Rvd25WaWV3LCBFZGl0b3JTdWdnZXN0LCBFZGl0b3JTdWdnZXN0VHJpZ2dlckluZm8sIEVkaXRvclBvc2l0aW9uLCBFZGl0b3IsIFRGaWxlLCBFZGl0b3JTdWdnZXN0Q29udGV4dH0gZnJvbSBcIm9ic2lkaWFuXCI7XG5pbXBvcnQgeyBodG1sIGFzIGJlYXV0aWZ5SFRNTCB9IGZyb20gJ2pzLWJlYXV0aWZ5JztcbmltcG9ydCB7IE1hdGhJbmZvLCBNYXRoUHJhaXNlciB9IGZyb20gXCIuL21hdGhQYXJzZXIvbWF0aEVuZ2luZVwiO1xuaW1wb3J0IHsgSW5mb01vZGFsLCBEZWJ1Z01vZGFsIH0gZnJvbSBcIi4vZGVzcGx5TW9kYWxzXCI7XG5pbXBvcnQge0xhdGV4U3VpdGVQbHVnaW5TZXR0aW5ncywgREVGQVVMVF9TRVRUSU5HUywgTGF0ZXhTdWl0ZUNNU2V0dGluZ3MsIHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3N9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzXCI7XG5pbXBvcnQgeyBMYXRleFN1aXRlU2V0dGluZ1RhYiB9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzX3RhYlwiO1xuaW1wb3J0IHsgY2FsY3VsYXRlQmlub20sIGRlZ3JlZXNUb1JhZGlhbnMsIGZpbmRBbmdsZUJ5Q29zaW5lUnVsZSwgZ2V0VXNhYmxlRGVncmVlcywgcG9sYXJUb0NhcnRlc2lhbiwgcmFkaWFuc1RvRGVncmVlcywgcm91bmRCeVNldHRpbmdzIH0gZnJvbSBcInNyYy9tYXRoUGFyc2VyL21hdGhVdGlsaXRpZXNcIjtcbmltcG9ydCB7IEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdHRpbmcsIFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L3Rpa3pqYXhcIjtcblxuaW1wb3J0IHtFeHRlbnNpb24sIEVkaXRvclN0YXRlLCBTZWxlY3Rpb25SYW5nZSxSYW5nZVNldCwgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRm9ybWF0VGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC5qc1wiO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucyB9IGZyb20gXCIuL3NldEVkaXRvckV4dGVuc2lvbnMuanNcIjtcblxuaW1wb3J0IHsgb25GaWxlQ3JlYXRlLCBvbkZpbGVDaGFuZ2UsIG9uRmlsZURlbGV0ZSwgZ2V0U25pcHBldHNGcm9tRmlsZXMsIGdldEZpbGVTZXRzLCBnZXRWYXJpYWJsZXNGcm9tRmlsZXMsIHRyeUdldFZhcmlhYmxlc0Zyb21Vbmtub3duRmlsZXMgfSBmcm9tIFwiLi9zZXR0aW5ncy9maWxlX3dhdGNoXCI7XG5pbXBvcnQgeyBJQ09OUyB9IGZyb20gXCIuL3NldHRpbmdzL3VpL2ljb25zXCI7XG5cbmltcG9ydCB7IGdldEVkaXRvckNvbW1hbmRzIH0gZnJvbSBcIi4vZmVhdHVyZXMvZWRpdG9yX2NvbW1hbmRzXCI7XG5pbXBvcnQgeyBTbmlwcGV0VmFyaWFibGVzLCBwYXJzZVNuaXBwZXRWYXJpYWJsZXMsIHBhcnNlU25pcHBldHMgfSBmcm9tIFwiLi9zbmlwcGV0cy9wYXJzZVwiO1xuaW1wb3J0IHsgTGF0ZXhSZW5kZXIgfSBmcm9tIFwiLi9sYXRleFJlbmRlci9tYWluXCI7XG4vLyBpIHdhbnQgdG8gbWFrZSBzb21lIGNvZGUgdGhhdCB3aWxsIG91dG8gaW5zb3QgbWV0YWRhdGEgdG8gZmlsbGxzXG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9zaGUgZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTGF0ZXhTdWl0ZVBsdWdpblNldHRpbmdzO1xuXHRDTVNldHRpbmdzOiBMYXRleFN1aXRlQ01TZXR0aW5ncztcblx0ZWRpdG9yRXh0ZW5zaW9uczogRXh0ZW5zaW9uW10gPSBbXTtcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxuICBlZGl0b3JFeHRlbnNpb25zMjogRWRpdG9yRXh0ZW5zaW9ucz0gbmV3IEVkaXRvckV4dGVuc2lvbnMoKTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgY29uc29sZS5sb2coXCJuZXcgbG9kXCIpXG4gICAgLy9uZXcgTGF0ZXhSZW5kZXIodGhpcy5hcHAsdGhpcylcblxuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG5cdFx0dGhpcy5sb2FkSWNvbnMoKTtcblx0XHR0aGlzLmFkZFNldHRpbmdUYWIobmV3IExhdGV4U3VpdGVTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cdFx0bG9hZE1hdGhKYXgoKTtcblxuXHRcdC8vIFJlZ2lzdGVyIExhdGV4IFN1aXRlIGV4dGVuc2lvbnMgYW5kIG9wdGlvbmFsIGVkaXRvciBleHRlbnNpb25zIGZvciBlZGl0b3IgZW5oYW5jZW1lbnRzXG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbih0aGlzLmVkaXRvckV4dGVuc2lvbnMpO1xuXG5cdFx0Ly8gV2F0Y2ggZm9yIGNoYW5nZXMgdG8gdGhlIHNuaXBwZXQgdmFyaWFibGVzIGFuZCBzbmlwcGV0cyBmaWxlc1xuXHRcdHRoaXMud2F0Y2hGaWxlcygpO1xuXG5cdFx0dGhpcy5hZGRFZGl0b3JDb21tYW5kcygpO1xuICAgIHRoaXMudGlrelByb2Nlc3Nvcj1uZXcgVGlrempheCh0aGlzLmFwcCx0aGlzKVxuICAgIHRoaXMudGlrelByb2Nlc3Nvci5yZWFkeUxheW91dCgpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IucmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCk7XG4gICAgXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibWF0aC1lbmdpbmVcIiwgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pqYXhcIiwgcHJvY2Vzc1Rpa3pCbG9jay5iaW5kKHRoaXMpKTtcbiAgICBcbiAgfVxuXG4gIFxuXG4gIGFkZEVkaXRvckNvbW1hbmRzKCkge1xuXHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBnZXRFZGl0b3JDb21tYW5kcyh0aGlzKSkge1xuXHRcdFx0dGhpcy5hZGRDb21tYW5kKGNvbW1hbmQpO1xuXHRcdH1cblx0fVxuICBvbnVubG9hZCgpIHtcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IudW5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKTtcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IucmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCk7XG5cdH1cblxuICBhc3luYyBnZXRTZXR0aW5nc1NuaXBwZXRzKHNuaXBwZXRWYXJpYWJsZXM6IFNuaXBwZXRWYXJpYWJsZXMpIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHBhcnNlU25pcHBldHModGhpcy5zZXR0aW5ncy5zbmlwcGV0cywgc25pcHBldFZhcmlhYmxlcyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGxvYWQgc25pcHBldHMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cbmxvYWRJY29ucygpIHtcbiAgZm9yIChjb25zdCBbaWNvbklkLCBzdmdDb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhJQ09OUykpIHtcbiAgICBhZGRJY29uKGljb25JZCwgc3ZnQ29udGVudCk7XG4gIH1cbn1cbmFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgbGV0IGRhdGEgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XG5cbiAgLy8gTWlncmF0ZSBzZXR0aW5ncyBmcm9tIHYxLjguMCAtIHYxLjguNFxuICBjb25zdCBzaG91bGRNaWdyYXRlU2V0dGluZ3MgPSBkYXRhID8gXCJiYXNpY1NldHRpbmdzXCIgaW4gZGF0YSA6IGZhbHNlO1xuXG4gIC8vIEB0cy1pZ25vcmVcbiAgZnVuY3Rpb24gbWlncmF0ZVNldHRpbmdzKG9sZFNldHRpbmdzKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLm9sZFNldHRpbmdzLmJhc2ljU2V0dGluZ3MsXG4gICAgICAuLi5vbGRTZXR0aW5ncy5yYXdTZXR0aW5ncyxcbiAgICAgIHNuaXBwZXRzOiBvbGRTZXR0aW5ncy5zbmlwcGV0cyxcbiAgICB9O1xuICB9XG5cbiAgaWYgKHNob3VsZE1pZ3JhdGVTZXR0aW5ncykge1xuICAgIGRhdGEgPSBtaWdyYXRlU2V0dGluZ3MoZGF0YSk7XG4gIH1cblxuICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgZGF0YSk7XG5cblxuICBpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSB8fCB0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpIHtcbiAgICBjb25zdCB0ZW1wU25pcHBldFZhcmlhYmxlcyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0VmFyaWFibGVzKCk7XG4gICAgY29uc3QgdGVtcFNuaXBwZXRzID0gYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRzKHRlbXBTbmlwcGV0VmFyaWFibGVzKTtcblxuICAgIHRoaXMuQ01TZXR0aW5ncyA9IHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3ModGVtcFNuaXBwZXRzLCB0aGlzLnNldHRpbmdzKTtcblxuICAgIC8vIFVzZSBvbkxheW91dFJlYWR5IHNvIHRoYXQgd2UgZG9uJ3QgdHJ5IHRvIHJlYWQgdGhlIHNuaXBwZXRzIGZpbGUgdG9vIGVhcmx5XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xuICAgICAgdGhpcy5wcm9jZXNzU2V0dGluZ3MoKTtcbiAgICB9KTtcbiAgfVxuICBlbHNlIHtcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3NTZXR0aW5ncygpO1xuICB9XG59XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKGRpZEZpbGVMb2NhdGlvbkNoYW5nZSA9IGZhbHNlKSB7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0XHR0aGlzLnByb2Nlc3NTZXR0aW5ncyhkaWRGaWxlTG9jYXRpb25DaGFuZ2UpO1xuXHR9XG5cbiAgYXN5bmMgcHJvY2Vzc1NldHRpbmdzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID0gZmFsc2UsIGJlY2F1c2VGaWxlVXBkYXRlZCA9IGZhbHNlKSB7XG5cdFx0dGhpcy5DTVNldHRpbmdzID0gcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5ncyhhd2FpdCB0aGlzLmdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkLCBiZWNhdXNlRmlsZVVwZGF0ZWQpLCB0aGlzLnNldHRpbmdzKTtcbiAgICB0aGlzLmVkaXRvckV4dGVuc2lvbnMyLnNldEVkaXRvckV4dGVuc2lvbnModGhpcylcbiAgICAvL3RoaXMuc2V0RWRpdG9yRXh0ZW5zaW9ucygpO1xuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS51cGRhdGVPcHRpb25zKCk7XG5cdH1cbiAgXG4gIGFzeW5jIGdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHBhcnNlU25pcHBldFZhcmlhYmxlcyh0aGlzLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG5ldyBOb3RpY2UoYEZhaWxlZCB0byBsb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gc2V0dGluZ3M6ICR7ZX1gKTtcblx0XHRcdGNvbnNvbGUubG9nKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG4gIGFzeW5jIGdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcblx0XHQvLyBHZXQgZmlsZXMgaW4gc25pcHBldC92YXJpYWJsZSBmb2xkZXJzLlxuXHRcdC8vIElmIGVpdGhlciBpcyBzZXQgdG8gYmUgbG9hZGVkIGZyb20gc2V0dGluZ3MgdGhlIHNldCB3aWxsIGp1c3QgYmUgZW1wdHkuXG5cdFx0Y29uc3QgZmlsZXMgPSBnZXRGaWxlU2V0cyh0aGlzKTtcblxuXHRcdGNvbnN0IHNuaXBwZXRWYXJpYWJsZXMgPVxuXHRcdFx0dGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlXG5cdFx0XHRcdD8gYXdhaXQgZ2V0VmFyaWFibGVzRnJvbUZpbGVzKHRoaXMsIGZpbGVzKVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0VmFyaWFibGVzKCk7XG5cblx0XHQvLyBUaGlzIG11c3QgYmUgZG9uZSBpbiBlaXRoZXIgY2FzZSwgYmVjYXVzZSBpdCBhbHNvIHVwZGF0ZXMgdGhlIHNldCBvZiBzbmlwcGV0IGZpbGVzXG5cdFx0Y29uc3QgdW5rbm93bkZpbGVWYXJpYWJsZXMgPSBhd2FpdCB0cnlHZXRWYXJpYWJsZXNGcm9tVW5rbm93bkZpbGVzKHRoaXMsIGZpbGVzKTtcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKSB7XG5cdFx0XHQvLyBCdXQgd2Ugb25seSB1c2UgdGhlIHZhbHVlcyBpZiB0aGUgdXNlciB3YW50cyB0aGVtXG5cdFx0XHRPYmplY3QuYXNzaWduKHNuaXBwZXRWYXJpYWJsZXMsIHVua25vd25GaWxlVmFyaWFibGVzKTtcblx0XHR9XG5cblx0XHRjb25zdCBzbmlwcGV0cyA9XG5cdFx0XHR0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlXG5cdFx0XHRcdD8gYXdhaXQgZ2V0U25pcHBldHNGcm9tRmlsZXModGhpcywgZmlsZXMsIHNuaXBwZXRWYXJpYWJsZXMpXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRzKHNuaXBwZXRWYXJpYWJsZXMpO1xuXHRcdHRoaXMuc2hvd1NuaXBwZXRzTG9hZGVkTm90aWNlKHNuaXBwZXRzLmxlbmd0aCwgT2JqZWN0LmtleXMoc25pcHBldFZhcmlhYmxlcykubGVuZ3RoLCAgYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQsIGJlY2F1c2VGaWxlVXBkYXRlZCk7XG5cblx0XHRyZXR1cm4gc25pcHBldHM7XG5cdH1cblxuXG5cbiAgXG4gIFxuICBzaG93U25pcHBldHNMb2FkZWROb3RpY2UoblNuaXBwZXRzOiBudW1iZXIsIG5TbmlwcGV0VmFyaWFibGVzOiBudW1iZXIsIGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcblx0XHRpZiAoIShiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCB8fCBiZWNhdXNlRmlsZVVwZGF0ZWQpKVxuXHRcdFx0cmV0dXJuO1xuXG5cdFx0Y29uc3QgcHJlZml4ID0gYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQgPyBcIkxvYWRlZCBcIiA6IFwiU3VjY2Vzc2Z1bGx5IHJlbG9hZGVkIFwiO1xuXHRcdGNvbnN0IGJvZHkgPSBbXTtcblxuXHRcdGlmICh0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlKVxuXHRcdFx0Ym9keS5wdXNoKGAke25TbmlwcGV0c30gc25pcHBldHNgKTtcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKVxuXHRcdFx0Ym9keS5wdXNoKGAke25TbmlwcGV0VmFyaWFibGVzfSBzbmlwcGV0IHZhcmlhYmxlc2ApO1xuXG5cdFx0Y29uc3Qgc3VmZml4ID0gXCIgZnJvbSBmaWxlcy5cIjtcblx0XHRuZXcgTm90aWNlKHByZWZpeCArIGJvZHkuam9pbihcIiBhbmQgXCIpICsgc3VmZml4LCA1MDAwKTtcblx0fVxuXG5cblxuICBwcml2YXRlIHByb2Nlc3NNYXRoQmxvY2soc291cmNlOiBzdHJpbmcsIG1haW5Db250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gICAgXG4gICAgbWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1jb250YWluZXJcIik7XG4gICAgXG4gICAgY29uc3QgdXNlclZhcmlhYmxlczogeyB2YXJpYWJsZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuICAgIGxldCBza2lwcGVkSW5kZXhlcyA9IDA7XG4gICAgXG4gICAgY29uc3QgZXhwcmVzc2lvbnMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIikubWFwKGxpbmUgPT4gbGluZS5yZXBsYWNlKC9bXFxzXSsvLCcnKS50cmltKCkpLmZpbHRlcihsaW5lID0+IGxpbmUgJiYgIWxpbmUuc3RhcnRzV2l0aChcIi8vXCIpKTtcbiAgICBpZiAoZXhwcmVzc2lvbnMubGVuZ3RoID09PSAwKSB7cmV0dXJuO31cblxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XG4gICAgICBsZXQgbGluZUNvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgbGluZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1saW5lLWNvbnRhaW5lclwiLCAoaW5kZXgtc2tpcHBlZEluZGV4ZXMpICUgMiA9PT0gMCA/IFwibWF0aC1yb3ctZXZlblwiIDogXCJtYXRoLXJvdy1vZGRcIik7XG4gICAgICAvL2lmIChleHByZXNzaW9uLm1hdGNoKC9eXFwvXFwvLykpe31cbiAgICAgIGNvbnN0IHByb2Nlc3NNYXRoID0gbmV3IFByb2Nlc3NNYXRoKGV4cHJlc3Npb24sdXNlclZhcmlhYmxlcywgdGhpcy5hcHAsbGluZUNvbnRhaW5lcik7XG4gICAgICBwcm9jZXNzTWF0aC5pbml0aWFsaXplKCk7XG5cbiAgICAgIGlmKHByb2Nlc3NNYXRoLm1vZGUhPT1cInZhcmlhYmxlXCIpe1xuICAgICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xuICAgICAgICBtYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKGxpbmVDb250YWluZXIpO1xuICAgICAgfVxuICAgICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cbiAgICB9KTtcbiAgfVxuXG5cbiAgd2F0Y2hGaWxlcygpIHtcblx0XHQvLyBPbmx5IGJlZ2luIHdhdGNoaW5nIGZpbGVzIG9uY2UgdGhlIGxheW91dCBpcyByZWFkeVxuXHRcdC8vIE90aGVyd2lzZSwgd2UnbGwgYmUgdW5uZWNlc3NhcmlseSByZWFjdGluZyB0byBtYW55IG9uRmlsZUNyZWF0ZSBldmVudHMgb2Ygc25pcHBldCBmaWxlc1xuXHRcdC8vIHRoYXQgb2NjdXIgd2hlbiBPYnNpZGlhbiBmaXJzdCBsb2Fkc1xuXG5cdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBldmVudHNBbmRDYWxsYmFja3MgPSB7XG5cdFx0XHRcdFwibW9kaWZ5XCI6IG9uRmlsZUNoYW5nZSxcblx0XHRcdFx0XCJkZWxldGVcIjogb25GaWxlRGVsZXRlLFxuXHRcdFx0XHRcImNyZWF0ZVwiOiBvbkZpbGVDcmVhdGVcblx0XHRcdH07XG4gICAgICAgXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhldmVudHNBbmRDYWxsYmFja3MpKSB7XG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKGtleSwgKGZpbGUpID0+IHZhbHVlKHRoaXMsIGZpbGUpKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBwcm9jZXNzVGlrekJsb2NrKHNvdXJjZTogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIHRyeXtcbiAgICBjb25zdCBhPW5ldyBGb3JtYXRUaWt6amF4KHNvdXJjZSx0cnVlKVxuICBjb25zb2xlLmxvZyhhKVxuICB9Y2F0Y2goZSl7XG4gICAgY29uc29sZS5lcnJvcihlKVxuICB9XG4gIFxuICBjb25zdCBzdmdDb250YWluZXIgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIHN0eWxlOiBcImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1wiXG4gIH0pO1xuICBzdmdDb250YWluZXIuYXBwZW5kQ2hpbGQoZHVtbXlGdW5jdGlvbigpKTtcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKHN2Z0NvbnRhaW5lcik7XG4gIGNvbnNvbGUubG9nKGJlYXV0aWZ5SFRNTChjb250YWluZXIuaW5uZXJIVE1MLCB7IGluZGVudF9zaXplOiAyIH0pKVxufVxuXG5cblxuZnVuY3Rpb24gZHVtbXlGdW5jdGlvbigpOlNWR1NWR0VsZW1lbnR7XG4gIFxuXG4gIGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsIFwic3ZnXCIpO1xuICBcbiAgY29uc3QgYm91bmRzPW5ldyBTdmdCb3VuZHMoKVxuICBjb25zdCBmdW5jID0gKHg6IG51bWJlcikgPT4geCAqIHg7XG4gIGNvbnN0IGFycj1bXVxuICBmb3IobGV0IGk9LTU7aTw9NTtpKyspe1xuICAgIGFyci5wdXNoKG5ldyBBeGlzKGksZnVuYyhpKSkpXG4gIH1cbiAgY29uc3QgcGF0aHMgPSBbXG4gICAgbmV3IFNWR3BhdGgoYXJyLCB7IHN0cm9rZTogXCJibGFja1wiLCBzdHJva2VXaWR0aDogMSB9KSxcbiAgICAvKm5ldyBTVkdwYXRoKFtuZXcgQXhpcygwLDMwKSxuZXcgQXhpcygxMDAsMzApXSwgeyBzdHJva2U6IFwiYmxhY2tcIiwgc3Ryb2tlV2lkdGg6IDEgfSksXG4gICAgbmV3IFNWR3BhdGgoW25ldyBBeGlzKDAsNjApLG5ldyBBeGlzKDEwMCw2MCldLCB7IHN0cm9rZTogXCJibGFja1wiLCBzdHJva2VXaWR0aDogMSB9KSxcbiAgICBuZXcgU1ZHcGF0aChbbmV3IEF4aXMoMCw5MCksbmV3IEF4aXMoMTAwLDkwKV0sIHsgc3Ryb2tlOiBcImJsYWNrXCIsIHN0cm9rZVdpZHRoOiAxIH0pLCovXG4gIF07XG4gIFxuICBwYXRocy5mb3JFYWNoKHA9PmJvdW5kcy5pbXByb3ZlQm91bmRzKHAuZ2V0Qm91bmRzKCkpKVxuICAvL2NvbnNvbGUubG9nKGJvdW5kcylcblxuICBzdmcuc2V0QXR0cmlidXRlKFwid2lkdGhcIiwgYCR7Ym91bmRzLmdldFdpZHRoKCl9YCk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoXCJoZWlnaHRcIiwgYCR7Ym91bmRzLmdldEhlaWdodCgpfWApO1xuICAvL3N2Zy5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCBibGFja1wiO1xuICBwYXRocy5mb3JFYWNoKHBhdGggPT4gc3ZnLmFwcGVuZENoaWxkKHBhdGgudG9FbGVtZW50KGJvdW5kcykpKTtcbiAgcmV0dXJuIHN2Z1xufVxuXG5cbmV4cG9ydCBjbGFzcyBTdmdCb3VuZHN7XG4gIG1pbjogQXhpcztcbiAgbWF4OiBBeGlzO1xuXG4gIGNvbnN0cnVjdG9yKG1pbj86IEF4aXMsbWF4PzogQXhpcyl7XG4gICAgdGhpcy5taW49bWluPz9uZXcgQXhpcygpO1xuICAgIHRoaXMubWF4PW1heD8/bmV3IEF4aXMoKTtcbiAgfVxuICBpbXByb3ZlQm91bmRzKGF4aXM6IEF4aXMgfCBTdmdCb3VuZHMpOiB2b2lkIHtcbiAgICBjb25zdCB1cGRhdGVCb3VuZHMgPSAodmFsdWU6IG51bWJlciwgbWluPzogbnVtYmVyLCBtYXg/OiBudW1iZXIpOiBbbnVtYmVyLCBudW1iZXJdID0+IHtcbiAgICAgIHJldHVybiBbTWF0aC5taW4odmFsdWUsIG1pbj8/SW5maW5pdHkpLCBNYXRoLm1heCh2YWx1ZSwgbWF4Pz8tSW5maW5pdHkpXTtcbiAgICB9O1xuICAgIGNvbnN0IGltcHJvdmVXaXRoQXhpcyA9IChpbnB1dEF4aXM6IEF4aXMpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IHsgY2FydGVzaWFuWDogeCwgY2FydGVzaWFuWTogeSB9ID0gaW5wdXRBeGlzO1xuICAgICAgW3RoaXMubWluLmNhcnRlc2lhblgsIHRoaXMubWF4LmNhcnRlc2lhblhdID0gdXBkYXRlQm91bmRzKHgsIHRoaXMubWluPy5jYXJ0ZXNpYW5YLCB0aGlzLm1heD8uY2FydGVzaWFuWCk7XG4gICAgICBbdGhpcy5taW4uY2FydGVzaWFuWSwgdGhpcy5tYXguY2FydGVzaWFuWV0gPSB1cGRhdGVCb3VuZHMoeSwgdGhpcy5taW4/LmNhcnRlc2lhblksIHRoaXMubWF4Py5jYXJ0ZXNpYW5ZKTtcbiAgICB9O1xuICAgIGNvbnN0IGltcHJvdmVXaXRoQm91bmRzID0gKGlucHV0Qm91bmRzOiBTdmdCb3VuZHMpOiB2b2lkID0+IHtcbiAgICAgIGltcHJvdmVXaXRoQXhpcyhpbnB1dEJvdW5kcy5taW4pO1xuICAgICAgaW1wcm92ZVdpdGhBeGlzKGlucHV0Qm91bmRzLm1heCk7XG4gICAgfTtcbiAgICBpZiAoYXhpcyBpbnN0YW5jZW9mIFN2Z0JvdW5kcykge1xuICAgICAgaW1wcm92ZVdpdGhCb3VuZHMoYXhpcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGltcHJvdmVXaXRoQXhpcyhheGlzIGFzIEF4aXMpO1xuICAgIH1cbiAgfVxuICBnZXRXaWR0aCgpe3JldHVybiBNYXRoLmFicyh0aGlzLm1heC5jYXJ0ZXNpYW5YLXRoaXMubWluLmNhcnRlc2lhblgpfVxuICBnZXRIZWlnaHQoKXtyZXR1cm4gTWF0aC5hYnModGhpcy5tYXguY2FydGVzaWFuWS10aGlzLm1pbi5jYXJ0ZXNpYW5ZKX1cbiAgY29tcGFyZShvdGhlcjogU3ZnQm91bmRzKXtcbiAgICBcbiAgfVxuICBjbG9uZSgpe1xuICAgIHJldHVybiBuZXcgU3ZnQm91bmRzKHRoaXMubWluLHRoaXMubWF4KVxuICB9XG4gIHN0YXRpYyBpbXByb3ZlZEJvdW5kcygpe1xuXG4gIH1cbn1cbmNsYXNzIG1hdGhGdW5jdGlvbntcbiAgeUludGVyc2VjdDogQXhpcztcbiAgeEludGVyc2VjdHM6IEF4aXNbXTtcblxufVxuXG5jbGFzcyBTVkdwYXRoIHtcbiAgYXhlczogQXhpc1tdO1xuICBmb3JtYXR0aW5nOiB7IHN0cm9rZT86IHN0cmluZywgc3Ryb2tlV2lkdGg/OiBudW1iZXIsIGZpbGw/OiBzdHJpbmcgfTtcbiAgXG4gIGNvbnN0cnVjdG9yKGNvb3JkaW5hdGVzOiBBeGlzW10sIGZvcm1hdHRpbmc6IHsgc3Ryb2tlPzogc3RyaW5nLCBzdHJva2VXaWR0aD86IG51bWJlciwgZmlsbD86IHN0cmluZyB9ID0ge30pIHtcbiAgICAgIHRoaXMuYXhlcyA9IGNvb3JkaW5hdGVzO1xuICAgICAgdGhpcy5mb3JtYXR0aW5nID0gZm9ybWF0dGluZztcbiAgfVxuICBnZXRCb3VuZHMoKXtcbiAgICBjb25zdCBib3VuZHM9bmV3IFN2Z0JvdW5kcygpXG4gICAgdGhpcy5heGVzLmZvckVhY2goYXhpcyA9PiB7XG4gICAgICBib3VuZHMuaW1wcm92ZUJvdW5kcyhheGlzKTtcbiAgICB9KTtcbiAgICByZXR1cm4gYm91bmRzO1xuICB9XG4gIHRvRWxlbWVudChib3VuZHM6IFN2Z0JvdW5kcyk6IFNWR1BhdGhFbGVtZW50IHtcbiAgICAgIGNvbnN0IHBhdGhFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJwYXRoXCIpO1xuICAgICAgY29uc3QgcGF0aERhdGEgPSB0aGlzLmF4ZXMubWFwKChjb29yZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICBjb25zdCBjb21tYW5kID0gaW5kZXggPT09IDAgPyAnTScgOiAnTCc7XG4gICAgICAgICAgcmV0dXJuIGAke2NvbW1hbmR9ICR7Y29vcmQudG9TdHJpbmdTVkcoYm91bmRzKX1gO1xuICAgICAgfSkuam9pbignICcpICsgJyBaJztcblxuICAgICAgcGF0aEVsZW1lbnQuc2V0QXR0cmlidXRlKFwiZFwiLCBwYXRoRGF0YSk7XG5cbiAgICAgIGlmICh0aGlzLmZvcm1hdHRpbmcuc3Ryb2tlKSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJzdHJva2VcIiwgdGhpcy5mb3JtYXR0aW5nLnN0cm9rZSk7XG4gICAgICBpZiAodGhpcy5mb3JtYXR0aW5nLnN0cm9rZVdpZHRoKSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJzdHJva2Utd2lkdGhcIiwgdGhpcy5mb3JtYXR0aW5nLnN0cm9rZVdpZHRoLnRvU3RyaW5nKCkpO1xuICAgICAgaWYgKHRoaXMuZm9ybWF0dGluZy5maWxsKSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJmaWxsXCIsIHRoaXMuZm9ybWF0dGluZy5maWxsKTtcbiAgICAgIGVsc2UgcGF0aEVsZW1lbnQuc2V0QXR0cmlidXRlKFwiZmlsbFwiLCBcIm5vbmVcIik7XG5cbiAgICAgIHJldHVybiBwYXRoRWxlbWVudDtcbiAgfVxufVxuXG5cblxuXG5jbGFzcyBQcm9jZXNzTWF0aCB7XG4gIG1hdGhJbnB1dDogYW55O1xuICB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG4gIG1vZGUgPSBcIm1hdGhcIjtcbiAgcmVzdWx0OiBhbnk7XG4gIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG4gIGljb25zRGl2OiBIVE1MRWxlbWVudDtcbiAgYXBwOiBBcHA7XG5cbiAgY29uc3RydWN0b3IobWF0aElucHV0OiBzdHJpbmcsdXNlclZhcmlhYmxlczogYW55LCBhcHA6IEFwcCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xuICAgIHRoaXMudXNlclZhcmlhYmxlcz11c2VyVmFyaWFibGVzO1xuICAgIHRoaXMuYXBwID0gYXBwO1xuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuICAgIHRoaXMuaWNvbnNEaXYgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWljb25zXCIsXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplKCkge1xuICAgIHRoaXMuYXNzaWduTW9kZSgpO1xuICAgIHRoaXMuc2V0dXBDb250YWluZXIoKTtcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xuICAgIHRoaXMuY2FsY3VsYXRlTWF0aCgpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cENvbnRhaW5lcigpIHtcbiAgICBbXCJtYXRoLWlucHV0XCIsIFwibWF0aC1yZXN1bHRcIl0uZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGRpdi5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIH0pO1xuICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuaWNvbnNEaXYpO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVNYXRoKCkge1xuICAgIGNvbnN0IGlucHV0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLWlucHV0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XG4gICAgdHJ5IHtcbiAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIGNvbnN0IGJpbm9tTW9kZWwgPSBuZXcgQmlub21JbmZvTW9kZWwodGhpcy5hcHAsIHRoaXMubWF0aElucHV0KTtcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IGJpbm9tTW9kZWwuZ2V0RXF1YWwoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImNvc1wiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIGNvbnN0IFsgLCBzaWRlQSwgc2lkZUIsIHNpZGVDIF0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoTnVtYmVyKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInZlY1wiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIHRoaXMucmVzdWx0PW5ldyBWZWNQcm9jZXNzb3IodGhpcy5tYXRoSW5wdXRbMV0sdGhpcy5tYXRoSW5wdXRbMl0sdGhpcy5tYXRoSW5wdXRbM10pO1xuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyB0aWt6R3JhcGgodGhpcy5hcHAsIHRoaXMucmVzdWx0LmdyYXBoKSk7XG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xuICAgICAgICAgIHRoaXMucmVzdWx0PXRoaXMucmVzdWx0LnJlc3VsdFxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IG5ldyBNYXRoUHJhaXNlcih0aGlzLm1hdGhJbnB1dCk7XG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8pKTtcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xuICAgICAgICAgIHRoaXMubWF0aElucHV0PXRoaXMucmVzdWx0LmlucHV0O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICB0aGlzLmFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2LCByZXN1bHREaXYsIHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCI/dGhpcy5tYXRoSW5wdXQ6dGhpcy5tYXRoSW5wdXRbMF0sIHRoaXMucmVzdWx0Lypyb3VuZEJ5U2V0dGluZ3ModGhpcy5yZXN1bHQpKi8pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgdGhpcy5kaXNwbGF5RXJyb3IoaW5wdXREaXYsIHJlc3VsdERpdiwgZXJyKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaGUgaW5pdGlhbCBwcmFpc2luZyBmYWlsZWRcIixlcnIpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBpbnB1dDogc3RyaW5nLCByZXN1bHQ6IGFueSkge1xuICAgIGlucHV0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoaW5wdXQsdHJ1ZSkpXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCR7JHtpbnB1dH19JGAsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xuICAgIC8vY29uc3QgcmVzdWx0T3V0cHV0ID0gLyh0cnVlfGZhbHNlKS8udGVzdChyZXN1bHQpID8gcmVzdWx0IDogYFxcJHske3Jlc3VsdH19JGA7XG4gICAgcmVzdWx0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoU3RyaW5nKHJvdW5kQnlTZXR0aW5ncyhyZXN1bHQuc29sdXRpb25Ub1N0cmluZygpKSksdHJ1ZSkpXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHJlc3VsdE91dHB1dCwgcmVzdWx0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBkaXNwbGF5RXJyb3IoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBlcnI6IEVycm9yKSB7XG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bih0aGlzLm1hdGhJbnB1dCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj4ke2Vyci5tZXNzYWdlfTwvc3Bhbj5gO1xuICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWVycm9yLWxpbmVcIik7XG4gIH1cblxuICBwcml2YXRlIGFzc2lnbk1vZGUoKSB7XG4gICAgY29uc3QgcmVnZXhMaXN0ID0gR2V0TWF0aENvbnRleHRSZWdleCgpO1xuICAgIGNvbnN0IG1hdGNoT2JqZWN0ID0gcmVnZXhMaXN0LmZpbmQocmVnZXhPYmogPT4gcmVnZXhPYmoucmVnZXgudGVzdCh0aGlzLm1hdGhJbnB1dCkpO1xuICAgIGlmIChtYXRjaE9iamVjdCkge1xuICAgICAgdGhpcy5tb2RlID0gbWF0Y2hPYmplY3QudmFsdWU7XG4gICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0Lm1hdGNoKG1hdGNoT2JqZWN0LnJlZ2V4KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFkZEluZm9Nb2RhbChtb2RhbDogYW55KSB7XG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtaW5mby1pY29uXCIsXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXG4gICAgfSk7XG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XG4gIH1cblxuICBwcml2YXRlIGFkZERlYnVnTW9kZWwobW9kYWw6IGFueSkge1xuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcbiAgICAgIHRleHRDb250ZW50OiBcIvCfkJ5cIixcbiAgICB9KTtcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVzKCkge1xuICAgIGlmICh0aGlzLm1vZGU9PT1cInZhcmlhYmxlXCIpIHtcbiAgICAgIHRoaXMuaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKSB7XG4gICAgY29uc3QgW18sdmFyaWFibGUsIHZhbHVlXSA9IHRoaXMubWF0aElucHV0Lm1hcCgocGFydDogc3RyaW5nKSA9PiBwYXJ0LnRyaW0oKSk7XG4gICAgaWYgKCF2YXJpYWJsZSB8fCAhdmFsdWUpIHtcbiAgICAgIGNvbnNvbGUud2FybihgSW52YWxpZCB2YXJpYWJsZSBkZWNsYXJhdGlvbjogJHt0aGlzLm1hdGhJbnB1dH1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZXhpc3RpbmdWYXJJbmRleCA9IHRoaXMudXNlclZhcmlhYmxlcy5maW5kSW5kZXgodiA9PiB2LnZhcmlhYmxlID09PSB2YXJpYWJsZSk7XG4gICAgaWYgKGV4aXN0aW5nVmFySW5kZXggIT09IC0xKSB7XG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXNbZXhpc3RpbmdWYXJJbmRleF0udmFsdWUgPSB2YWx1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZSwgdmFsdWUgfSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCl7XG4gICAgdGhpcy51c2VyVmFyaWFibGVzLmZvckVhY2goKHsgdmFyaWFibGUsIHZhbHVlIH0pID0+IHtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5yZXBsYWNlKHZhcmlhYmxlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBHZXRNYXRoQ29udGV4dFJlZ2V4KCkge1xuICByZXR1cm4gW1xuICAgIHsgcmVnZXg6IC9iaW5vbVxcKChcXGQrKSwoXFxkKyksKFxcZCspXFwpLywgdmFsdWU6IFwiYmlub21cIiB9LFxuICAgIHsgcmVnZXg6IC92ZWMoWystXXswLDJ9KVxcKChbXFxkListXStbOixdW1xcZC4rLV0rKVxcKShbXFxkListXSopLywgdmFsdWU6IFwidmVjXCIgfSxcbiAgICB7IHJlZ2V4OiAvY29zXFwoKFtcXGQuXSspLChbXFxkLl0rKSwoW1xcZC5dKylcXCkvLCB2YWx1ZTogXCJjb3NcIiB9LFxuICAgIHsgcmVnZXg6IC92YXJcXHMqKFtcXHddKylcXHMqPVxccyooW1xcZC5dKykvLCB2YWx1ZTogXCJ2YXJpYWJsZVwiIH0sXG4gIF07XG59XG5cblxuY2xhc3MgVmVjUHJvY2Vzc29yIHtcbiAgdXNlcklucHV0OiBhbnk7XG4gIGVudmlyb25tZW50OiB7IFg6IHN0cmluZzsgWTogc3RyaW5nIH07XG4gIHZlY0luZm8gPSBuZXcgTWF0aEluZm8oKTtcbiAgYXhpczogQXhpcztcbiAgbW9kaWZpZXI6IG51bWJlcjtcbiAgcmVzdWx0OiBzdHJpbmc7XG4gIGdyYXBoPzogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGVudmlyb25tZW50OiBzdHJpbmcsIG1hdGhJbnB1dDogc3RyaW5nLCBtb2RpZmllcjogc3RyaW5nKSB7XG4gICAgdGhpcy51c2VySW5wdXQ9bWF0aElucHV0O1xuICAgIGNvbnN0IG1hdGNoID0gZW52aXJvbm1lbnQubWF0Y2goLyhbKy1dPykoWystXT8pLyk7XG4gICAgdGhpcy5lbnZpcm9ubWVudCA9IHsgWDogbWF0Y2g/LlsxXSA/PyBcIitcIiwgWTogbWF0Y2g/LlsyXSA/PyBcIitcIiB9O1xuXG4gICAgdGhpcy5tb2RpZmllciA9IG1vZGlmaWVyLmxlbmd0aCA+IDAgPyBnZXRVc2FibGVEZWdyZWVzKE51bWJlcihtb2RpZmllcikpIDogMDtcblxuICAgIHRoaXMuYXhpcz1uZXcgQXhpcygpLnVuaXZlcnNhbCh0aGlzLnVzZXJJbnB1dClcbiAgICBpZiAoIXRoaXMuYXhpcy5wb2xhckFuZ2xlKVxuICAgICAgdGhpcy5heGlzLmNhcnRlc2lhblRvUG9sYXIoKTtcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiYXhpc1wiLHRoaXMuYXhpcyk7XG4gICAgdGhpcy5hZGRSZXN1bHQoKTtcbiAgICB0aGlzLmFkZEdyYXBoKCk7XG4gIH1cbiAgYWRkUmVzdWx0KCl7XG4gICAgaWYgKHRoaXMudXNlcklucHV0LmluY2x1ZGVzKFwiOlwiKSlcbiAgICAgIHRoaXMucmVzdWx0PWB4ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWH1cXFxccXVhZCx5ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWX1gXG4gICAgZWxzZVxuICAgICAgdGhpcy5yZXN1bHQ9YGFuZ2xlID0gJHt0aGlzLmF4aXMucG9sYXJBbmdsZX1cXFxccXVhZCxsZW5ndGggPSAke3RoaXMuYXhpcy5wb2xhckxlbmd0aH1gXG4gIH1cbiAgYWRkR3JhcGgoKSB7XG4gICAgY29uc3QgdGFyZ2V0U2l6ZSA9IDEwO1xuICAgIGNvbnN0IG1heENvbXBvbmVudCA9IE1hdGgubWF4KE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YKSwgTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblkpKTtcblxuICAgIC8vIERldGVybWluZSBzY2FsaW5nIGZhY3RvclxuICAgIGxldCBzY2FsZSA9IDE7XG4gICAgaWYgKG1heENvbXBvbmVudCA8IHRhcmdldFNpemUpIHtcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcbiAgICB9IGVsc2UgaWYgKG1heENvbXBvbmVudCA+IHRhcmdldFNpemUpIHtcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcbiAgICB9XG4gICAgLy8gaSBuZWVkIHRvIG1ha2UgaXQgXCJ0byBYIGF4aXNcIlxuICAgIC8vY29uc3QgdmVjdG9yQW5nbGUgPSBnZXRVc2FibGVEZWdyZWVzKHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuMihzY2FsZWRZLCBzY2FsZWRYKSkpO1xuICAgIFxuICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKDAsMCk7XG5cblxuICAgLy8gY29uc3QgZHJhdz0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMucG9sYXJMZW5ndGgudG9TdHJpbmcoKX0pLHRoaXMuYXhpc107XG4gICAgLy9jb25zdCBkcmF3WD0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWC50b1N0cmluZygpfSksbmV3IEF4aXModGhpcy5heGlzLmNhcnRlc2lhblgsMCldO1xuICAgIC8vY29uc3QgZHJhd1k9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblkudG9TdHJpbmcoKX0pLG5ldyBBeGlzKDAsdGhpcy5heGlzLmNhcnRlc2lhblkpXTtcblxuICAgIHRoaXMuZ3JhcGg9W1xuICAgICAgLy9uZXcgRm9ybWF0dGluZyhcImdsb2JvbFwiLHtjb2xvcjogXCJ3aGl0ZVwiLHNjYWxlOiAxLH0pLFxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhdyxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwicmVkXCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhd1gsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdZLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXG4gICAgXVxuICAgIFxuICAgIFxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b2tlbnMsbnVsbCwxKSk7XG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGgudG9TdHJpbmcoKVxcblwiLEpTT04uc3RyaW5naWZ5KHRoaXMuZ3JhcGgudG9TdHJpbmcoKSkpO1xuICAgIC8qIEdlbmVyYXRlIExhVGVYIGNvZGUgZm9yIHZlY3RvciBjb21wb25lbnRzIGFuZCBtYWluIHZlY3RvclxuICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxuXG4gICAgICAlIEFuZ2xlIEFubm90YXRpb25cbiAgICAgICVcXGFuZ3tYfXthbmN9e3ZlY317fXske3JvdW5kQnlTZXR0aW5ncyh2ZWN0b3JBbmdsZSl9JF57XFxjaXJjfSR9XG4gICAgYC5yZXBsYWNlKC9eXFxzKy9nbSwgXCJcIik7Ki9cbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiU2NhbGluZyBmYWN0b3JcIiwgc2NhbGUpO1xuICB9XG59XG5cblxuXG5jbGFzcyB0aWt6R3JhcGggZXh0ZW5kcyBNb2RhbCB7XG4gIHRpa3o6IEZvcm1hdFRpa3pqYXg7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLHRpa3pDb2RlOiBhbnkpe1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy50aWt6PW5ldyBGb3JtYXRUaWt6amF4KHRpa3pDb2RlKTtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb25zdCBjb2RlPXRoaXMudGlrejtcbiAgICBjb25zdCBzY3JpcHQgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcbiAgICBzY3JpcHQuc2V0VGV4dChjb2RlLmdldENvZGUodGhpcy5hcHApKTtcbiAgICBcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcblxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6LmdldENvZGUodGhpcy5hcHApKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJHcmFwaCBjb3BpZWQgdG8gY2xpcGJvYXJkIVwiKTtcbiAgICB9KTtcbiAgfVxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gIH1cbn1cblxuXG5cbmNsYXNzIEJpbm9tSW5mb01vZGVsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG46IG51bWJlcjtcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XG4gIHByaXZhdGUgcDogbnVtYmVyO1xuICBwcml2YXRlIGVxdWFsID0gMDtcbiAgcHJpdmF0ZSBsZXNzID0gMDtcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xuICBwcml2YXRlIGJpZyA9IDA7XG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuayA9IGs7XG4gICAgdGhpcy5wID0gcDtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xuICB9XG5cbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgIH1cbiAgfVxufVxuXG5cblxuXG5cblxuZnVuY3Rpb24gdGVzdE1hdGhFbmdpbmUoKXtcbiAgY29uc3QgZXhwcmVzc2lvbnM9W1xuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YDIgXFxmcmFjeyg1LTMpMzR9e1xcc3FydHsyXnsyfX19MC41YCxleHBlY3RlZE91dHB1dDogJzM0J30sXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgKHgrMSkoeCszKT0yYCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMC4yNjc5NSx4XzI9LTMuNzMyMDUnfSxcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2BcXGZyYWN7MTMyfXsxMjYwK3heezJ9fT0wLjA1YCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMzcuMTQ4MzUseF8yPTM3LjE0ODM1J30sXG4gIF1cbiAgY29uc3QgcmVzdWx0cz1bXVxuICB0cnl7XG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaChleHByZXNzaW9uID0+IHtcbiAgICAgIGNvbnN0IG1hdGg9bmV3IE1hdGhQcmFpc2VyKGV4cHJlc3Npb24uZXhwcmVzc2lvbik7XG4gICAgICBpZiAobWF0aC5zb2x1dGlvbiE9PWV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQpe1xuICAgICAgICByZXN1bHRzLnB1c2goe2V4cHJlc3Npb246IGV4cHJlc3Npb24uZXhwcmVzc2lvbixleHBlY3RlZE91dHB1dDogZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCxhY3R1YWxPdXRwdXQ6IG1hdGguc29sdXRpb259KVxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIGNhdGNoKGUpe1xuICAgIGNvbnNvbGUubG9nKGUpXG4gIH1cbn1cblxuXG5cblxuIl19