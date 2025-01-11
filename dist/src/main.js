//git reset --hard
import { Plugin, MarkdownRenderer, addIcon, Modal, Component, Notice, loadMathJax, renderMath } from "obsidian";
import { html as beautifyHTML } from 'js-beautify';
import { MathInfo, MathPraiser } from "./mathParser/mathEngine";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
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
export default class Moshe extends Plugin {
    settings;
    CMSettings;
    editorExtensions = [];
    tikzProcessor;
    editorExtensions2 = new EditorExtensions();
    async onload() {
        console.log("new lod");
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
        this.registerMarkdownCodeBlockProcessor("tikzjax", this.processTikzBlock.bind(this));
        this.registerCommands();
        //this.registerEditorSuggest(new NumeralsSuggestor(this));
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
    processTikzBlock(source, container) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLGtCQUFrQjtBQUNsQixPQUFPLEVBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFDLE9BQU8sRUFBTyxLQUFLLEVBQUUsU0FBUyxFQUFVLE1BQU0sRUFBa0IsV0FBVyxFQUFDLFVBQVUsRUFBNkcsTUFBTSxVQUFVLENBQUM7QUFDclAsT0FBTyxFQUFFLElBQUksSUFBSSxZQUFZLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDbkQsT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3ZELE9BQU8sRUFBOEMsYUFBYSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ25GLE9BQU8sRUFBMkIsZ0JBQWdCLEVBQXdCLHlCQUF5QixFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFDaEksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBb0IscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQXNDLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzlLLE9BQU8sRUFBRSxJQUFJLEVBQWdDLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBR2hGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLHFCQUFxQixFQUFFLCtCQUErQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUssT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixD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LFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLDZCQUE2QixFQUFDLGNBQWMsRUFBRSw0QkFBNEIsRUFBQztLQUNuRyxDQUFBO0lBQ0QsTUFBTSxPQUFPLEdBQUMsRUFBRSxDQUFBO0lBQ2hCLElBQUcsQ0FBQztRQUNGLFdBQVcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxJQUFJLEdBQUMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2xELElBQUksSUFBSSxDQUFDLFFBQVEsS0FBRyxVQUFVLENBQUMsY0FBYyxFQUFDLENBQUM7Z0JBQzdDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsRUFBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsRUFBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBQyxDQUFDLENBQUE7WUFDekgsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU0sQ0FBQyxFQUFDLENBQUM7UUFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ2hCLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy9naXQgcmVzZXQgLS1oYXJkXHJcbmltcG9ydCB7UGx1Z2luLCBNYXJrZG93blJlbmRlcmVyLGFkZEljb24sIEFwcCwgTW9kYWwsIENvbXBvbmVudCwgU2V0dGluZyxOb3RpY2UsIFdvcmtzcGFjZVdpbmRvdyxsb2FkTWF0aEpheCxyZW5kZXJNYXRoLCBNYXJrZG93blZpZXcsIEVkaXRvclN1Z2dlc3QsIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbywgRWRpdG9yUG9zaXRpb24sIEVkaXRvciwgVEZpbGUsIEVkaXRvclN1Z2dlc3RDb250ZXh0fSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IHsgaHRtbCBhcyBiZWF1dGlmeUhUTUwgfSBmcm9tICdqcy1iZWF1dGlmeSc7XHJcbmltcG9ydCB7IE1hdGhJbmZvLCBNYXRoUHJhaXNlciB9IGZyb20gXCIuL21hdGhQYXJzZXIvbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcclxuaW1wb3J0IHsgQ3VzdG9tSW5wdXRNb2RhbCwgSGlzdG9yeU1vZGFsLCBJbnB1dE1vZGFsLCBWZWNJbnB1dE1vZGVsIH0gZnJvbSBcIi4vdGVtcFwiO1xyXG5pbXBvcnQge0xhdGV4U3VpdGVQbHVnaW5TZXR0aW5ncywgREVGQVVMVF9TRVRUSU5HUywgTGF0ZXhTdWl0ZUNNU2V0dGluZ3MsIHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3N9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzXCI7XHJcbmltcG9ydCB7IExhdGV4U3VpdGVTZXR0aW5nVGFiIH0gZnJvbSBcIi4vc2V0dGluZ3Mvc2V0dGluZ3NfdGFiXCI7XHJcbmltcG9ydCB7IGNhbGN1bGF0ZUJpbm9tLCBkZWdyZWVzVG9SYWRpYW5zLCBmaW5kQW5nbGVCeUNvc2luZVJ1bGUsIGdldFVzYWJsZURlZ3JlZXMsIHBvbGFyVG9DYXJ0ZXNpYW4sIHJhZGlhbnNUb0RlZ3JlZXMsIHJvdW5kQnlTZXR0aW5ncyB9IGZyb20gXCJzcmMvbWF0aFBhcnNlci9tYXRoVXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdHRpbmcsIFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuXHJcbmltcG9ydCB7RXh0ZW5zaW9uLCBFZGl0b3JTdGF0ZSwgU2VsZWN0aW9uUmFuZ2UsUmFuZ2VTZXQsIFByZWMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivc3RhdGVcIjtcclxuaW1wb3J0IHsgRm9ybWF0VGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC5qc1wiO1xyXG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zIH0gZnJvbSBcIi4vc2V0RWRpdG9yRXh0ZW5zaW9ucy5qc1wiO1xyXG5cclxuaW1wb3J0IHsgb25GaWxlQ3JlYXRlLCBvbkZpbGVDaGFuZ2UsIG9uRmlsZURlbGV0ZSwgZ2V0U25pcHBldHNGcm9tRmlsZXMsIGdldEZpbGVTZXRzLCBnZXRWYXJpYWJsZXNGcm9tRmlsZXMsIHRyeUdldFZhcmlhYmxlc0Zyb21Vbmtub3duRmlsZXMgfSBmcm9tIFwiLi9zZXR0aW5ncy9maWxlX3dhdGNoXCI7XHJcbmltcG9ydCB7IElDT05TIH0gZnJvbSBcIi4vc2V0dGluZ3MvdWkvaWNvbnNcIjtcclxuXHJcbmltcG9ydCB7IGdldEVkaXRvckNvbW1hbmRzIH0gZnJvbSBcIi4vZmVhdHVyZXMvZWRpdG9yX2NvbW1hbmRzXCI7XHJcbmltcG9ydCB7IFNuaXBwZXRWYXJpYWJsZXMsIHBhcnNlU25pcHBldFZhcmlhYmxlcywgcGFyc2VTbmlwcGV0cyB9IGZyb20gXCIuL3NuaXBwZXRzL3BhcnNlXCI7XHJcblxyXG5cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1vc2hlIGV4dGVuZHMgUGx1Z2luIHtcclxuICBzZXR0aW5nczogTGF0ZXhTdWl0ZVBsdWdpblNldHRpbmdzO1xyXG5cdENNU2V0dGluZ3M6IExhdGV4U3VpdGVDTVNldHRpbmdzO1xyXG5cdGVkaXRvckV4dGVuc2lvbnM6IEV4dGVuc2lvbltdID0gW107XHJcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxyXG4gIGVkaXRvckV4dGVuc2lvbnMyOiBFZGl0b3JFeHRlbnNpb25zPSBuZXcgRWRpdG9yRXh0ZW5zaW9ucygpO1xyXG5cclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIm5ldyBsb2RcIilcclxuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XHJcblxyXG5cdFx0dGhpcy5sb2FkSWNvbnMoKTtcclxuXHRcdHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgTGF0ZXhTdWl0ZVNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcclxuXHRcdGxvYWRNYXRoSmF4KCk7XHJcblxyXG5cdFx0Ly8gUmVnaXN0ZXIgTGF0ZXggU3VpdGUgZXh0ZW5zaW9ucyBhbmQgb3B0aW9uYWwgZWRpdG9yIGV4dGVuc2lvbnMgZm9yIGVkaXRvciBlbmhhbmNlbWVudHNcclxuXHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24odGhpcy5lZGl0b3JFeHRlbnNpb25zKTtcclxuXHJcblx0XHQvLyBXYXRjaCBmb3IgY2hhbmdlcyB0byB0aGUgc25pcHBldCB2YXJpYWJsZXMgYW5kIHNuaXBwZXRzIGZpbGVzXHJcblx0XHR0aGlzLndhdGNoRmlsZXMoKTtcclxuXHJcblx0XHR0aGlzLmFkZEVkaXRvckNvbW1hbmRzKCk7XHJcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3I9bmV3IFRpa3pqYXgodGhpcy5hcHAsdGhpcylcclxuICAgIHRoaXMudGlrelByb2Nlc3Nvci5yZWFkeUxheW91dCgpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLmFkZFN5bnRheEhpZ2hsaWdodGluZygpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlZ2lzdGVyVGlrekNvZGVCbG9jaygpO1xyXG4gICAgXHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJtYXRoLWVuZ2luZVwiLCB0aGlzLnByb2Nlc3NNYXRoQmxvY2suYmluZCh0aGlzKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6amF4XCIsIHRoaXMucHJvY2Vzc1Rpa3pCbG9jay5iaW5kKHRoaXMpKTtcclxuICAgIHRoaXMucmVnaXN0ZXJDb21tYW5kcygpO1xyXG4gICAgXHJcbiAgICAgIFxyXG4gICAgLy90aGlzLnJlZ2lzdGVyRWRpdG9yU3VnZ2VzdChuZXcgTnVtZXJhbHNTdWdnZXN0b3IodGhpcykpO1xyXG4gICAgXHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHByb2Nlc3NNYXRoQmxvY2soc291cmNlOiBzdHJpbmcsIG1haW5Db250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBcclxuICAgIG1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtY29udGFpbmVyXCIpO1xyXG4gICAgXHJcbiAgICBjb25zdCB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgICBsZXQgc2tpcHBlZEluZGV4ZXMgPSAwO1xyXG4gICAgXHJcbiAgICBjb25zdCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKS5tYXAobGluZSA9PiBsaW5lLnJlcGxhY2UoL1tcXHNdKy8sJycpLnRyaW0oKSkuZmlsdGVyKGxpbmUgPT4gbGluZSAmJiAhbGluZS5zdGFydHNXaXRoKFwiLy9cIikpO1xyXG4gICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCA9PT0gMCkge3JldHVybjt9XHJcblxyXG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaCgoZXhwcmVzc2lvbiwgaW5kZXgpID0+IHtcclxuICAgICAgbGV0IGxpbmVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgbGluZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1saW5lLWNvbnRhaW5lclwiLCAoaW5kZXgtc2tpcHBlZEluZGV4ZXMpICUgMiA9PT0gMCA/IFwibWF0aC1yb3ctZXZlblwiIDogXCJtYXRoLXJvdy1vZGRcIik7XHJcbiAgICAgIC8vaWYgKGV4cHJlc3Npb24ubWF0Y2goL15cXC9cXC8vKSl7fVxyXG4gICAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xyXG4gICAgICBwcm9jZXNzTWF0aC5pbml0aWFsaXplKCk7XHJcblxyXG4gICAgICBpZihwcm9jZXNzTWF0aC5tb2RlIT09XCJ2YXJpYWJsZVwiKXtcclxuICAgICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xyXG4gICAgICAgIG1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgYWRkRWRpdG9yQ29tbWFuZHMoKSB7XHJcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgZ2V0RWRpdG9yQ29tbWFuZHModGhpcykpIHtcclxuXHRcdFx0dGhpcy5hZGRDb21tYW5kKGNvbW1hbmQpO1xyXG5cdFx0fVxyXG5cdH1cclxuICBvbnVubG9hZCgpIHtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpO1xyXG5cdH1cclxuXHJcbiAgYXN5bmMgZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKSB7XHJcblx0XHR0cnkge1xyXG5cdFx0XHRyZXR1cm4gYXdhaXQgcGFyc2VTbmlwcGV0cyh0aGlzLnNldHRpbmdzLnNuaXBwZXRzLCBzbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGxvYWQgc25pcHBldHMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRyZXR1cm4gW107XHJcblx0XHR9XHJcblx0fVxyXG5cclxuICBwcm9jZXNzVGlrekJsb2NrKHNvdXJjZTogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICB0cnl7XHJcbiAgICAgIGNvbnN0IGE9bmV3IEZvcm1hdFRpa3pqYXgoc291cmNlLHRydWUpXHJcbiAgICBjb25zb2xlLmxvZyhhKVxyXG4gICAgfWNhdGNoKGUpe1xyXG4gICAgICBjb25zb2xlLmVycm9yKGUpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNvbnN0IHN2Z0NvbnRhaW5lciA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICAgIHN0eWxlOiBcImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1wiXHJcbiAgICB9KTtcclxuICAgIHN2Z0NvbnRhaW5lci5hcHBlbmRDaGlsZChkdW1teUZ1bmN0aW9uKCkpO1xyXG4gICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHN2Z0NvbnRhaW5lcik7XHJcbiAgICBjb25zb2xlLmxvZyhiZWF1dGlmeUhUTUwoY29udGFpbmVyLmlubmVySFRNTCwgeyBpbmRlbnRfc2l6ZTogMiB9KSlcclxufVxyXG5cclxuXHJcblxyXG5sb2FkSWNvbnMoKSB7XHJcbiAgZm9yIChjb25zdCBbaWNvbklkLCBzdmdDb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhJQ09OUykpIHtcclxuICAgIGFkZEljb24oaWNvbklkLCBzdmdDb250ZW50KTtcclxuICB9XHJcbn1cclxuYXN5bmMgbG9hZFNldHRpbmdzKCkge1xyXG4gIGxldCBkYXRhID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpO1xyXG5cclxuICAvLyBNaWdyYXRlIHNldHRpbmdzIGZyb20gdjEuOC4wIC0gdjEuOC40XHJcbiAgY29uc3Qgc2hvdWxkTWlncmF0ZVNldHRpbmdzID0gZGF0YSA/IFwiYmFzaWNTZXR0aW5nc1wiIGluIGRhdGEgOiBmYWxzZTtcclxuXHJcbiAgLy8gQHRzLWlnbm9yZVxyXG4gIGZ1bmN0aW9uIG1pZ3JhdGVTZXR0aW5ncyhvbGRTZXR0aW5ncykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgLi4ub2xkU2V0dGluZ3MuYmFzaWNTZXR0aW5ncyxcclxuICAgICAgLi4ub2xkU2V0dGluZ3MucmF3U2V0dGluZ3MsXHJcbiAgICAgIHNuaXBwZXRzOiBvbGRTZXR0aW5ncy5zbmlwcGV0cyxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBpZiAoc2hvdWxkTWlncmF0ZVNldHRpbmdzKSB7XHJcbiAgICBkYXRhID0gbWlncmF0ZVNldHRpbmdzKGRhdGEpO1xyXG4gIH1cclxuXHJcbiAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGRhdGEpO1xyXG5cclxuXHJcbiAgaWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUgfHwgdGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKSB7XHJcbiAgICBjb25zdCB0ZW1wU25pcHBldFZhcmlhYmxlcyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0VmFyaWFibGVzKCk7XHJcbiAgICBjb25zdCB0ZW1wU25pcHBldHMgPSBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldHModGVtcFNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cclxuICAgIHRoaXMuQ01TZXR0aW5ncyA9IHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3ModGVtcFNuaXBwZXRzLCB0aGlzLnNldHRpbmdzKTtcclxuXHJcbiAgICAvLyBVc2Ugb25MYXlvdXRSZWFkeSBzbyB0aGF0IHdlIGRvbid0IHRyeSB0byByZWFkIHRoZSBzbmlwcGV0cyBmaWxlIHRvbyBlYXJseVxyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xyXG4gICAgICB0aGlzLnByb2Nlc3NTZXR0aW5ncygpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGVsc2Uge1xyXG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzU2V0dGluZ3MoKTtcclxuICB9XHJcbn1cclxuXHJcbiAgYXN5bmMgc2F2ZVNldHRpbmdzKGRpZEZpbGVMb2NhdGlvbkNoYW5nZSA9IGZhbHNlKSB7XHJcblx0XHRhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xyXG5cdFx0dGhpcy5wcm9jZXNzU2V0dGluZ3MoZGlkRmlsZUxvY2F0aW9uQ2hhbmdlKTtcclxuXHR9XHJcblxyXG4gIGFzeW5jIHByb2Nlc3NTZXR0aW5ncyhiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCA9IGZhbHNlLCBiZWNhdXNlRmlsZVVwZGF0ZWQgPSBmYWxzZSkge1xyXG5cdFx0dGhpcy5DTVNldHRpbmdzID0gcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5ncyhhd2FpdCB0aGlzLmdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkLCBiZWNhdXNlRmlsZVVwZGF0ZWQpLCB0aGlzLnNldHRpbmdzKTtcclxuICAgIHRoaXMuZWRpdG9yRXh0ZW5zaW9uczIuc2V0RWRpdG9yRXh0ZW5zaW9ucyh0aGlzKVxyXG4gICAgLy90aGlzLnNldEVkaXRvckV4dGVuc2lvbnMoKTtcclxuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS51cGRhdGVPcHRpb25zKCk7XHJcblx0fVxyXG4gIFxyXG4gIGFzeW5jIGdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpIHtcclxuXHRcdHRyeSB7XHJcblx0XHRcdHJldHVybiBhd2FpdCBwYXJzZVNuaXBwZXRWYXJpYWJsZXModGhpcy5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRjb25zb2xlLmxvZyhgRmFpbGVkIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRyZXR1cm4ge307XHJcblx0XHR9XHJcblx0fVxyXG4gIGFzeW5jIGdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcclxuXHRcdC8vIEdldCBmaWxlcyBpbiBzbmlwcGV0L3ZhcmlhYmxlIGZvbGRlcnMuXHJcblx0XHQvLyBJZiBlaXRoZXIgaXMgc2V0IHRvIGJlIGxvYWRlZCBmcm9tIHNldHRpbmdzIHRoZSBzZXQgd2lsbCBqdXN0IGJlIGVtcHR5LlxyXG5cdFx0Y29uc3QgZmlsZXMgPSBnZXRGaWxlU2V0cyh0aGlzKTtcclxuXHJcblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzID1cclxuXHRcdFx0dGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlXHJcblx0XHRcdFx0PyBhd2FpdCBnZXRWYXJpYWJsZXNGcm9tRmlsZXModGhpcywgZmlsZXMpXHJcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpO1xyXG5cclxuXHRcdC8vIFRoaXMgbXVzdCBiZSBkb25lIGluIGVpdGhlciBjYXNlLCBiZWNhdXNlIGl0IGFsc28gdXBkYXRlcyB0aGUgc2V0IG9mIHNuaXBwZXQgZmlsZXNcclxuXHRcdGNvbnN0IHVua25vd25GaWxlVmFyaWFibGVzID0gYXdhaXQgdHJ5R2V0VmFyaWFibGVzRnJvbVVua25vd25GaWxlcyh0aGlzLCBmaWxlcyk7XHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKSB7XHJcblx0XHRcdC8vIEJ1dCB3ZSBvbmx5IHVzZSB0aGUgdmFsdWVzIGlmIHRoZSB1c2VyIHdhbnRzIHRoZW1cclxuXHRcdFx0T2JqZWN0LmFzc2lnbihzbmlwcGV0VmFyaWFibGVzLCB1bmtub3duRmlsZVZhcmlhYmxlcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldHMgPVxyXG5cdFx0XHR0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlXHJcblx0XHRcdFx0PyBhd2FpdCBnZXRTbmlwcGV0c0Zyb21GaWxlcyh0aGlzLCBmaWxlcywgc25pcHBldFZhcmlhYmxlcylcclxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdHRoaXMuc2hvd1NuaXBwZXRzTG9hZGVkTm90aWNlKHNuaXBwZXRzLmxlbmd0aCwgT2JqZWN0LmtleXMoc25pcHBldFZhcmlhYmxlcykubGVuZ3RoLCAgYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQsIGJlY2F1c2VGaWxlVXBkYXRlZCk7XHJcblxyXG5cdFx0cmV0dXJuIHNuaXBwZXRzO1xyXG5cdH1cclxuICBzaG93U25pcHBldHNMb2FkZWROb3RpY2UoblNuaXBwZXRzOiBudW1iZXIsIG5TbmlwcGV0VmFyaWFibGVzOiBudW1iZXIsIGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcclxuXHRcdGlmICghKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkIHx8IGJlY2F1c2VGaWxlVXBkYXRlZCkpXHJcblx0XHRcdHJldHVybjtcclxuXHJcblx0XHRjb25zdCBwcmVmaXggPSBiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCA/IFwiTG9hZGVkIFwiIDogXCJTdWNjZXNzZnVsbHkgcmVsb2FkZWQgXCI7XHJcblx0XHRjb25zdCBib2R5ID0gW107XHJcblxyXG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUpXHJcblx0XHRcdGJvZHkucHVzaChgJHtuU25pcHBldHN9IHNuaXBwZXRzYCk7XHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKVxyXG5cdFx0XHRib2R5LnB1c2goYCR7blNuaXBwZXRWYXJpYWJsZXN9IHNuaXBwZXQgdmFyaWFibGVzYCk7XHJcblxyXG5cdFx0Y29uc3Qgc3VmZml4ID0gXCIgZnJvbSBmaWxlcy5cIjtcclxuXHRcdG5ldyBOb3RpY2UocHJlZml4ICsgYm9keS5qb2luKFwiIGFuZCBcIikgKyBzdWZmaXgsIDUwMDApO1xyXG5cdH1cclxuICBwcml2YXRlIHJlZ2lzdGVyQ29tbWFuZHMoKSB7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJvcGVuLWlucHV0LWZvcm1cIixcclxuICAgICAgbmFtZTogXCJPcGVuIElucHV0IEZvcm1cIixcclxuICAgICAgY2FsbGJhY2s6ICgpID0+IG5ldyBWZWNJbnB1dE1vZGVsKHRoaXMuYXBwLHRoaXMpLm9wZW4oKSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiBcInZpZXctc2Vzc2lvbi1oaXN0b3J5XCIsXHJcbiAgICAgIG5hbWU6IFwiVmlldyBTZXNzaW9uIEhpc3RvcnlcIixcclxuICAgICAgLy9jYWxsYmFjazogKCkgPT4gbmV3IEhpc3RvcnlNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpLFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJ0ZXN0LW1hdGhFbmdpbmVcIixcclxuICAgICAgbmFtZTogXCJ0ZXN0IG1hdGggZW5naW5lXCIsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PnRlc3RNYXRoRW5naW5lKCksXHJcbiAgICB9KTtcclxuICB9XHJcbiAgd2F0Y2hGaWxlcygpIHtcclxuXHRcdC8vIE9ubHkgYmVnaW4gd2F0Y2hpbmcgZmlsZXMgb25jZSB0aGUgbGF5b3V0IGlzIHJlYWR5XHJcblx0XHQvLyBPdGhlcndpc2UsIHdlJ2xsIGJlIHVubmVjZXNzYXJpbHkgcmVhY3RpbmcgdG8gbWFueSBvbkZpbGVDcmVhdGUgZXZlbnRzIG9mIHNuaXBwZXQgZmlsZXNcclxuXHRcdC8vIHRoYXQgb2NjdXIgd2hlbiBPYnNpZGlhbiBmaXJzdCBsb2Fkc1xyXG5cclxuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcclxuXHJcblx0XHRcdGNvbnN0IGV2ZW50c0FuZENhbGxiYWNrcyA9IHtcclxuXHRcdFx0XHRcIm1vZGlmeVwiOiBvbkZpbGVDaGFuZ2UsXHJcblx0XHRcdFx0XCJkZWxldGVcIjogb25GaWxlRGVsZXRlLFxyXG5cdFx0XHRcdFwiY3JlYXRlXCI6IG9uRmlsZUNyZWF0ZVxyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZXZlbnRzQW5kQ2FsbGJhY2tzKSkge1xyXG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3JcclxuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oa2V5LCAoZmlsZSkgPT4gdmFsdWUodGhpcywgZmlsZSkpKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuICBcclxufVxyXG5cclxuZnVuY3Rpb24gZHVtbXlGdW5jdGlvbigpOlNWR1NWR0VsZW1lbnR7XHJcbiAgXHJcblxyXG4gIGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsIFwic3ZnXCIpO1xyXG4gIFxyXG4gIGNvbnN0IGJvdW5kcz1uZXcgU3ZnQm91bmRzKClcclxuICBjb25zdCBmdW5jID0gKHg6IG51bWJlcikgPT4geCAqIHg7XHJcbiAgY29uc3QgYXJyPVtdXHJcbiAgZm9yKGxldCBpPS01O2k8PTU7aSsrKXtcclxuICAgIGFyci5wdXNoKG5ldyBBeGlzKGksZnVuYyhpKSkpXHJcbiAgfVxyXG4gIGNvbnN0IHBhdGhzID0gW1xyXG4gICAgbmV3IFNWR3BhdGgoYXJyLCB7IHN0cm9rZTogXCJibGFja1wiLCBzdHJva2VXaWR0aDogMSB9KSxcclxuICAgIC8qbmV3IFNWR3BhdGgoW25ldyBBeGlzKDAsMzApLG5ldyBBeGlzKDEwMCwzMCldLCB7IHN0cm9rZTogXCJibGFja1wiLCBzdHJva2VXaWR0aDogMSB9KSxcclxuICAgIG5ldyBTVkdwYXRoKFtuZXcgQXhpcygwLDYwKSxuZXcgQXhpcygxMDAsNjApXSwgeyBzdHJva2U6IFwiYmxhY2tcIiwgc3Ryb2tlV2lkdGg6IDEgfSksXHJcbiAgICBuZXcgU1ZHcGF0aChbbmV3IEF4aXMoMCw5MCksbmV3IEF4aXMoMTAwLDkwKV0sIHsgc3Ryb2tlOiBcImJsYWNrXCIsIHN0cm9rZVdpZHRoOiAxIH0pLCovXHJcbiAgXTtcclxuICBcclxuICBwYXRocy5mb3JFYWNoKHA9PmJvdW5kcy5pbXByb3ZlQm91bmRzKHAuZ2V0Qm91bmRzKCkpKVxyXG4gIC8vY29uc29sZS5sb2coYm91bmRzKVxyXG5cclxuICBzdmcuc2V0QXR0cmlidXRlKFwid2lkdGhcIiwgYCR7Ym91bmRzLmdldFdpZHRoKCl9YCk7XHJcbiAgc3ZnLnNldEF0dHJpYnV0ZShcImhlaWdodFwiLCBgJHtib3VuZHMuZ2V0SGVpZ2h0KCl9YCk7XHJcbiAgLy9zdmcuc3R5bGUuYm9yZGVyID0gXCIxcHggc29saWQgYmxhY2tcIjtcclxuICBwYXRocy5mb3JFYWNoKHBhdGggPT4gc3ZnLmFwcGVuZENoaWxkKHBhdGgudG9FbGVtZW50KGJvdW5kcykpKTtcclxuICByZXR1cm4gc3ZnXHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgU3ZnQm91bmRze1xyXG4gIG1pbjogQXhpcztcclxuICBtYXg6IEF4aXM7XHJcblxyXG4gIGNvbnN0cnVjdG9yKG1pbj86IEF4aXMsbWF4PzogQXhpcyl7XHJcbiAgICB0aGlzLm1pbj1taW4/P25ldyBBeGlzKCk7XHJcbiAgICB0aGlzLm1heD1tYXg/P25ldyBBeGlzKCk7XHJcbiAgfVxyXG4gIGltcHJvdmVCb3VuZHMoYXhpczogQXhpcyB8IFN2Z0JvdW5kcyk6IHZvaWQge1xyXG4gICAgY29uc3QgdXBkYXRlQm91bmRzID0gKHZhbHVlOiBudW1iZXIsIG1pbj86IG51bWJlciwgbWF4PzogbnVtYmVyKTogW251bWJlciwgbnVtYmVyXSA9PiB7XHJcbiAgICAgIHJldHVybiBbTWF0aC5taW4odmFsdWUsIG1pbj8/SW5maW5pdHkpLCBNYXRoLm1heCh2YWx1ZSwgbWF4Pz8tSW5maW5pdHkpXTtcclxuICAgIH07XHJcbiAgICBjb25zdCBpbXByb3ZlV2l0aEF4aXMgPSAoaW5wdXRBeGlzOiBBeGlzKTogdm9pZCA9PiB7XHJcbiAgICAgIGNvbnN0IHsgY2FydGVzaWFuWDogeCwgY2FydGVzaWFuWTogeSB9ID0gaW5wdXRBeGlzO1xyXG4gICAgICBbdGhpcy5taW4uY2FydGVzaWFuWCwgdGhpcy5tYXguY2FydGVzaWFuWF0gPSB1cGRhdGVCb3VuZHMoeCwgdGhpcy5taW4/LmNhcnRlc2lhblgsIHRoaXMubWF4Py5jYXJ0ZXNpYW5YKTtcclxuICAgICAgW3RoaXMubWluLmNhcnRlc2lhblksIHRoaXMubWF4LmNhcnRlc2lhblldID0gdXBkYXRlQm91bmRzKHksIHRoaXMubWluPy5jYXJ0ZXNpYW5ZLCB0aGlzLm1heD8uY2FydGVzaWFuWSk7XHJcbiAgICB9O1xyXG4gICAgY29uc3QgaW1wcm92ZVdpdGhCb3VuZHMgPSAoaW5wdXRCb3VuZHM6IFN2Z0JvdW5kcyk6IHZvaWQgPT4ge1xyXG4gICAgICBpbXByb3ZlV2l0aEF4aXMoaW5wdXRCb3VuZHMubWluKTtcclxuICAgICAgaW1wcm92ZVdpdGhBeGlzKGlucHV0Qm91bmRzLm1heCk7XHJcbiAgICB9O1xyXG4gICAgaWYgKGF4aXMgaW5zdGFuY2VvZiBTdmdCb3VuZHMpIHtcclxuICAgICAgaW1wcm92ZVdpdGhCb3VuZHMoYXhpcyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpbXByb3ZlV2l0aEF4aXMoYXhpcyBhcyBBeGlzKTtcclxuICAgIH1cclxuICB9XHJcbiAgZ2V0V2lkdGgoKXtyZXR1cm4gTWF0aC5hYnModGhpcy5tYXguY2FydGVzaWFuWC10aGlzLm1pbi5jYXJ0ZXNpYW5YKX1cclxuICBnZXRIZWlnaHQoKXtyZXR1cm4gTWF0aC5hYnModGhpcy5tYXguY2FydGVzaWFuWS10aGlzLm1pbi5jYXJ0ZXNpYW5ZKX1cclxuICBjb21wYXJlKG90aGVyOiBTdmdCb3VuZHMpe1xyXG4gICAgXHJcbiAgfVxyXG4gIGNsb25lKCl7XHJcbiAgICByZXR1cm4gbmV3IFN2Z0JvdW5kcyh0aGlzLm1pbix0aGlzLm1heClcclxuICB9XHJcbiAgc3RhdGljIGltcHJvdmVkQm91bmRzKCl7XHJcblxyXG4gIH1cclxufVxyXG5jbGFzcyBtYXRoRnVuY3Rpb257XHJcbiAgeUludGVyc2VjdDogQXhpcztcclxuICB4SW50ZXJzZWN0czogQXhpc1tdO1xyXG5cclxufVxyXG5cclxuY2xhc3MgU1ZHcGF0aCB7XHJcbiAgYXhlczogQXhpc1tdO1xyXG4gIGZvcm1hdHRpbmc6IHsgc3Ryb2tlPzogc3RyaW5nLCBzdHJva2VXaWR0aD86IG51bWJlciwgZmlsbD86IHN0cmluZyB9O1xyXG4gIFxyXG4gIGNvbnN0cnVjdG9yKGNvb3JkaW5hdGVzOiBBeGlzW10sIGZvcm1hdHRpbmc6IHsgc3Ryb2tlPzogc3RyaW5nLCBzdHJva2VXaWR0aD86IG51bWJlciwgZmlsbD86IHN0cmluZyB9ID0ge30pIHtcclxuICAgICAgdGhpcy5heGVzID0gY29vcmRpbmF0ZXM7XHJcbiAgICAgIHRoaXMuZm9ybWF0dGluZyA9IGZvcm1hdHRpbmc7XHJcbiAgfVxyXG4gIGdldEJvdW5kcygpe1xyXG4gICAgY29uc3QgYm91bmRzPW5ldyBTdmdCb3VuZHMoKVxyXG4gICAgdGhpcy5heGVzLmZvckVhY2goYXhpcyA9PiB7XHJcbiAgICAgIGJvdW5kcy5pbXByb3ZlQm91bmRzKGF4aXMpO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gYm91bmRzO1xyXG4gIH1cclxuICB0b0VsZW1lbnQoYm91bmRzOiBTdmdCb3VuZHMpOiBTVkdQYXRoRWxlbWVudCB7XHJcbiAgICAgIGNvbnN0IHBhdGhFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJwYXRoXCIpO1xyXG4gICAgICBjb25zdCBwYXRoRGF0YSA9IHRoaXMuYXhlcy5tYXAoKGNvb3JkLCBpbmRleCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgY29tbWFuZCA9IGluZGV4ID09PSAwID8gJ00nIDogJ0wnO1xyXG4gICAgICAgICAgcmV0dXJuIGAke2NvbW1hbmR9ICR7Y29vcmQudG9TdHJpbmdTVkcoYm91bmRzKX1gO1xyXG4gICAgICB9KS5qb2luKCcgJykgKyAnIFonO1xyXG5cclxuICAgICAgcGF0aEVsZW1lbnQuc2V0QXR0cmlidXRlKFwiZFwiLCBwYXRoRGF0YSk7XHJcblxyXG4gICAgICBpZiAodGhpcy5mb3JtYXR0aW5nLnN0cm9rZSkgcGF0aEVsZW1lbnQuc2V0QXR0cmlidXRlKFwic3Ryb2tlXCIsIHRoaXMuZm9ybWF0dGluZy5zdHJva2UpO1xyXG4gICAgICBpZiAodGhpcy5mb3JtYXR0aW5nLnN0cm9rZVdpZHRoKSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJzdHJva2Utd2lkdGhcIiwgdGhpcy5mb3JtYXR0aW5nLnN0cm9rZVdpZHRoLnRvU3RyaW5nKCkpO1xyXG4gICAgICBpZiAodGhpcy5mb3JtYXR0aW5nLmZpbGwpIHBhdGhFbGVtZW50LnNldEF0dHJpYnV0ZShcImZpbGxcIiwgdGhpcy5mb3JtYXR0aW5nLmZpbGwpO1xyXG4gICAgICBlbHNlIHBhdGhFbGVtZW50LnNldEF0dHJpYnV0ZShcImZpbGxcIiwgXCJub25lXCIpO1xyXG5cclxuICAgICAgcmV0dXJuIHBhdGhFbGVtZW50O1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgUHJvY2Vzc01hdGgge1xyXG4gIG1hdGhJbnB1dDogYW55O1xyXG4gIHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcclxuICBtb2RlID0gXCJtYXRoXCI7XHJcbiAgcmVzdWx0OiBhbnk7XHJcbiAgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcclxuICBpY29uc0RpdjogSFRNTEVsZW1lbnQ7XHJcbiAgYXBwOiBBcHA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKG1hdGhJbnB1dDogc3RyaW5nLHVzZXJWYXJpYWJsZXM6IGFueSwgYXBwOiBBcHAsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcclxuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xyXG4gICAgdGhpcy51c2VyVmFyaWFibGVzPXVzZXJWYXJpYWJsZXM7XHJcbiAgICB0aGlzLmFwcCA9IGFwcDtcclxuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xyXG4gICAgdGhpcy5pY29uc0RpdiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pY29uc1wiLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBpbml0aWFsaXplKCkge1xyXG4gICAgdGhpcy5hc3NpZ25Nb2RlKCk7XHJcbiAgICB0aGlzLnNldHVwQ29udGFpbmVyKCk7XHJcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xyXG4gICAgdGhpcy5jYWxjdWxhdGVNYXRoKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNldHVwQ29udGFpbmVyKCkge1xyXG4gICAgW1wibWF0aC1pbnB1dFwiLCBcIm1hdGgtcmVzdWx0XCJdLmZvckVhY2goY2xhc3NOYW1lID0+IHtcclxuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgZGl2LmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcclxuICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcclxuICAgIH0pO1xyXG4gICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pY29uc0Rpdik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhbGN1bGF0ZU1hdGgoKSB7XHJcbiAgICBjb25zdCBpbnB1dERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1pbnB1dFwiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB0cnkge1xyXG4gICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBiaW5vbU1vZGVsID0gbmV3IEJpbm9tSW5mb01vZGVsKHRoaXMuYXBwLCB0aGlzLm1hdGhJbnB1dCk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gYmlub21Nb2RlbC5nZXRFcXVhbCgpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBbICwgc2lkZUEsIHNpZGVCLCBzaWRlQyBdID0gdGhpcy5tYXRoSW5wdXQubWFwKE51bWJlcik7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9bmV3IFZlY1Byb2Nlc3Nvcih0aGlzLm1hdGhJbnB1dFsxXSx0aGlzLm1hdGhJbnB1dFsyXSx0aGlzLm1hdGhJbnB1dFszXSk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgdGlrekdyYXBoKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5ncmFwaCkpO1xyXG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9dGhpcy5yZXN1bHQucmVzdWx0XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gbmV3IE1hdGhQcmFpc2VyKHRoaXMubWF0aElucHV0KTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5tYXRoSW5wdXQ9dGhpcy5yZXN1bHQuaW5wdXQ7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgIHRoaXMuYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXYsIHJlc3VsdERpdiwgdHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIj90aGlzLm1hdGhJbnB1dDp0aGlzLm1hdGhJbnB1dFswXSwgdGhpcy5yZXN1bHQvKnJvdW5kQnlTZXR0aW5ncyh0aGlzLnJlc3VsdCkqLyk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgdGhpcy5kaXNwbGF5RXJyb3IoaW5wdXREaXYsIHJlc3VsdERpdiwgZXJyKTtcclxuICAgICAgY29uc29sZS5lcnJvcihcIlRoZSBpbml0aWFsIHByYWlzaW5nIGZhaWxlZFwiLGVycik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2OiBIVE1MRWxlbWVudCwgcmVzdWx0RGl2OiBIVE1MRWxlbWVudCwgaW5wdXQ6IHN0cmluZywgcmVzdWx0OiBhbnkpIHtcclxuICAgIGlucHV0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoaW5wdXQsdHJ1ZSkpXHJcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcJHske2lucHV0fX0kYCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgICAvL2NvbnN0IHJlc3VsdE91dHB1dCA9IC8odHJ1ZXxmYWxzZSkvLnRlc3QocmVzdWx0KSA/IHJlc3VsdCA6IGBcXCR7JHtyZXN1bHR9fSRgO1xyXG4gICAgcmVzdWx0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoU3RyaW5nKHJvdW5kQnlTZXR0aW5ncyhyZXN1bHQuc29sdXRpb25Ub1N0cmluZygpKSksdHJ1ZSkpXHJcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24ocmVzdWx0T3V0cHV0LCByZXN1bHREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGRpc3BsYXlFcnJvcihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGVycjogRXJyb3IpIHtcclxuICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24odGhpcy5tYXRoSW5wdXQsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj4ke2Vyci5tZXNzYWdlfTwvc3Bhbj5gO1xyXG4gICAgdGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtZXJyb3ItbGluZVwiKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXNzaWduTW9kZSgpIHtcclxuICAgIGNvbnN0IHJlZ2V4TGlzdCA9IEdldE1hdGhDb250ZXh0UmVnZXgoKTtcclxuICAgIGNvbnN0IG1hdGNoT2JqZWN0ID0gcmVnZXhMaXN0LmZpbmQocmVnZXhPYmogPT4gcmVnZXhPYmoucmVnZXgudGVzdCh0aGlzLm1hdGhJbnB1dCkpO1xyXG4gICAgaWYgKG1hdGNoT2JqZWN0KSB7XHJcbiAgICAgIHRoaXMubW9kZSA9IG1hdGNoT2JqZWN0LnZhbHVlO1xyXG4gICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0Lm1hdGNoKG1hdGNoT2JqZWN0LnJlZ2V4KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkSW5mb01vZGFsKG1vZGFsOiBhbnkpIHtcclxuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtaW5mby1pY29uXCIsXHJcbiAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcclxuICAgIH0pO1xyXG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xyXG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkRGVidWdNb2RlbChtb2RhbDogYW55KSB7XHJcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcclxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+QnlwiLFxyXG4gICAgfSk7XHJcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XHJcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZXMoKSB7XHJcbiAgICBpZiAodGhpcy5tb2RlPT09XCJ2YXJpYWJsZVwiKSB7XHJcbiAgICAgIHRoaXMuaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5yZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKSB7XHJcbiAgICBjb25zdCBbXyx2YXJpYWJsZSwgdmFsdWVdID0gdGhpcy5tYXRoSW5wdXQubWFwKChwYXJ0OiBzdHJpbmcpID0+IHBhcnQudHJpbSgpKTtcclxuICAgIGlmICghdmFyaWFibGUgfHwgIXZhbHVlKSB7XHJcbiAgICAgIGNvbnNvbGUud2FybihgSW52YWxpZCB2YXJpYWJsZSBkZWNsYXJhdGlvbjogJHt0aGlzLm1hdGhJbnB1dH1gKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZXhpc3RpbmdWYXJJbmRleCA9IHRoaXMudXNlclZhcmlhYmxlcy5maW5kSW5kZXgodiA9PiB2LnZhcmlhYmxlID09PSB2YXJpYWJsZSk7XHJcbiAgICBpZiAoZXhpc3RpbmdWYXJJbmRleCAhPT0gLTEpIHtcclxuICAgICAgdGhpcy51c2VyVmFyaWFibGVzW2V4aXN0aW5nVmFySW5kZXhdLnZhbHVlID0gdmFsdWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXMucHVzaCh7IHZhcmlhYmxlLCB2YWx1ZSB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpe1xyXG4gICAgdGhpcy51c2VyVmFyaWFibGVzLmZvckVhY2goKHsgdmFyaWFibGUsIHZhbHVlIH0pID0+IHtcclxuICAgICAgaWYgKHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCIpe1xyXG4gICAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQucmVwbGFjZSh2YXJpYWJsZSwgdmFsdWUpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBHZXRNYXRoQ29udGV4dFJlZ2V4KCkge1xyXG4gIHJldHVybiBbXHJcbiAgICB7IHJlZ2V4OiAvYmlub21cXCgoXFxkKyksKFxcZCspLChcXGQrKVxcKS8sIHZhbHVlOiBcImJpbm9tXCIgfSxcclxuICAgIHsgcmVnZXg6IC92ZWMoWystXXswLDJ9KVxcKChbXFxkListXStbOixdW1xcZC4rLV0rKVxcKShbXFxkListXSopLywgdmFsdWU6IFwidmVjXCIgfSxcclxuICAgIHsgcmVnZXg6IC9jb3NcXCgoW1xcZC5dKyksKFtcXGQuXSspLChbXFxkLl0rKVxcKS8sIHZhbHVlOiBcImNvc1wiIH0sXHJcbiAgICB7IHJlZ2V4OiAvdmFyXFxzKihbXFx3XSspXFxzKj1cXHMqKFtcXGQuXSspLywgdmFsdWU6IFwidmFyaWFibGVcIiB9LFxyXG4gIF07XHJcbn1cclxuXHJcblxyXG5jbGFzcyBWZWNQcm9jZXNzb3Ige1xyXG4gIHVzZXJJbnB1dDogYW55O1xyXG4gIGVudmlyb25tZW50OiB7IFg6IHN0cmluZzsgWTogc3RyaW5nIH07XHJcbiAgdmVjSW5mbyA9IG5ldyBNYXRoSW5mbygpO1xyXG4gIGF4aXM6IEF4aXM7XHJcbiAgbW9kaWZpZXI6IG51bWJlcjtcclxuICByZXN1bHQ6IHN0cmluZztcclxuICBncmFwaD86IGFueTtcclxuXHJcbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgbWF0aElucHV0OiBzdHJpbmcsIG1vZGlmaWVyOiBzdHJpbmcpIHtcclxuICAgIHRoaXMudXNlcklucHV0PW1hdGhJbnB1dDtcclxuICAgIGNvbnN0IG1hdGNoID0gZW52aXJvbm1lbnQubWF0Y2goLyhbKy1dPykoWystXT8pLyk7XHJcbiAgICB0aGlzLmVudmlyb25tZW50ID0geyBYOiBtYXRjaD8uWzFdID8/IFwiK1wiLCBZOiBtYXRjaD8uWzJdID8/IFwiK1wiIH07XHJcblxyXG4gICAgdGhpcy5tb2RpZmllciA9IG1vZGlmaWVyLmxlbmd0aCA+IDAgPyBnZXRVc2FibGVEZWdyZWVzKE51bWJlcihtb2RpZmllcikpIDogMDtcclxuXHJcbiAgICB0aGlzLmF4aXM9bmV3IEF4aXMoKS51bml2ZXJzYWwodGhpcy51c2VySW5wdXQpXHJcbiAgICBpZiAoIXRoaXMuYXhpcy5wb2xhckFuZ2xlKVxyXG4gICAgICB0aGlzLmF4aXMuY2FydGVzaWFuVG9Qb2xhcigpO1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcImF4aXNcIix0aGlzLmF4aXMpO1xyXG4gICAgdGhpcy5hZGRSZXN1bHQoKTtcclxuICAgIHRoaXMuYWRkR3JhcGgoKTtcclxuICB9XHJcbiAgYWRkUmVzdWx0KCl7XHJcbiAgICBpZiAodGhpcy51c2VySW5wdXQuaW5jbHVkZXMoXCI6XCIpKVxyXG4gICAgICB0aGlzLnJlc3VsdD1geCA9ICR7dGhpcy5heGlzLmNhcnRlc2lhblh9XFxcXHF1YWQseSA9ICR7dGhpcy5heGlzLmNhcnRlc2lhbll9YFxyXG4gICAgZWxzZVxyXG4gICAgICB0aGlzLnJlc3VsdD1gYW5nbGUgPSAke3RoaXMuYXhpcy5wb2xhckFuZ2xlfVxcXFxxdWFkLGxlbmd0aCA9ICR7dGhpcy5heGlzLnBvbGFyTGVuZ3RofWBcclxuICB9XHJcbiAgYWRkR3JhcGgoKSB7XHJcbiAgICBjb25zdCB0YXJnZXRTaXplID0gMTA7XHJcbiAgICBjb25zdCBtYXhDb21wb25lbnQgPSBNYXRoLm1heChNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWCksIE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKSk7XHJcblxyXG4gICAgLy8gRGV0ZXJtaW5lIHNjYWxpbmcgZmFjdG9yXHJcbiAgICBsZXQgc2NhbGUgPSAxO1xyXG4gICAgaWYgKG1heENvbXBvbmVudCA8IHRhcmdldFNpemUpIHtcclxuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xyXG4gICAgfSBlbHNlIGlmIChtYXhDb21wb25lbnQgPiB0YXJnZXRTaXplKSB7XHJcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcclxuICAgIH1cclxuICAgIC8vIGkgbmVlZCB0byBtYWtlIGl0IFwidG8gWCBheGlzXCJcclxuICAgIC8vY29uc3QgdmVjdG9yQW5nbGUgPSBnZXRVc2FibGVEZWdyZWVzKHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuMihzY2FsZWRZLCBzY2FsZWRYKSkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygwLDApO1xyXG5cclxuXHJcbiAgIC8vIGNvbnN0IGRyYXc9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLnBvbGFyTGVuZ3RoLnRvU3RyaW5nKCl9KSx0aGlzLmF4aXNdO1xyXG4gICAgLy9jb25zdCBkcmF3WD0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWC50b1N0cmluZygpfSksbmV3IEF4aXModGhpcy5heGlzLmNhcnRlc2lhblgsMCldO1xyXG4gICAgLy9jb25zdCBkcmF3WT0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWS50b1N0cmluZygpfSksbmV3IEF4aXMoMCx0aGlzLmF4aXMuY2FydGVzaWFuWSldO1xyXG5cclxuICAgIHRoaXMuZ3JhcGg9W1xyXG4gICAgICAvL25ldyBGb3JtYXR0aW5nKFwiZ2xvYm9sXCIse2NvbG9yOiBcIndoaXRlXCIsc2NhbGU6IDEsfSksXHJcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXcsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInJlZFwiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcclxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhd1gsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcclxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhd1ksZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcclxuICAgIF1cclxuICAgIFxyXG4gICAgXHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaFwiLEpTT04uc3RyaW5naWZ5KHRoaXMuZ3JhcGgudG9rZW5zLG51bGwsMSkpO1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGgudG9TdHJpbmcoKVxcblwiLEpTT04uc3RyaW5naWZ5KHRoaXMuZ3JhcGgudG9TdHJpbmcoKSkpO1xyXG4gICAgLyogR2VuZXJhdGUgTGFUZVggY29kZSBmb3IgdmVjdG9yIGNvbXBvbmVudHMgYW5kIG1haW4gdmVjdG9yXHJcbiAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcclxuXHJcbiAgICAgICUgQW5nbGUgQW5ub3RhdGlvblxyXG4gICAgICAlXFxhbmd7WH17YW5jfXt2ZWN9e317JHtyb3VuZEJ5U2V0dGluZ3ModmVjdG9yQW5nbGUpfSRee1xcY2lyY30kfVxyXG4gICAgYC5yZXBsYWNlKC9eXFxzKy9nbSwgXCJcIik7Ki9cclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJTY2FsaW5nIGZhY3RvclwiLCBzY2FsZSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIHRpa3pHcmFwaCBleHRlbmRzIE1vZGFsIHtcclxuICB0aWt6OiBGb3JtYXRUaWt6amF4O1xyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLHRpa3pDb2RlOiBhbnkpe1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMudGlrej1uZXcgRm9ybWF0VGlrempheCh0aWt6Q29kZSk7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnN0IGNvZGU9dGhpcy50aWt6O1xyXG4gICAgY29uc3Qgc2NyaXB0ID0gY29udGVudEVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xyXG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XHJcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgc2NyaXB0LnNldFRleHQoY29kZS5nZXRDb2RlKCkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcclxuXHJcbiAgICBhY3Rpb25CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6LmdldENvZGUoKSk7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJHcmFwaCBjb3BpZWQgdG8gY2xpcGJvYXJkIVwiKTtcclxuICAgIH0pO1xyXG4gIH1cclxuICBvbkNsb3NlKCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyBCaW5vbUluZm9Nb2RlbCBleHRlbmRzIE1vZGFsIHtcclxuICBwcml2YXRlIG46IG51bWJlcjtcclxuICBwcml2YXRlIGs6IG51bWJlcjtcclxuICBwcml2YXRlIHA6IG51bWJlcjtcclxuICBwcml2YXRlIGVxdWFsID0gMDtcclxuICBwcml2YXRlIGxlc3MgPSAwO1xyXG4gIHByaXZhdGUgbGVzc0VxdWFsID0gMDtcclxuICBwcml2YXRlIGJpZyA9IDA7XHJcbiAgcHJpdmF0ZSBiaWdFcXVhbCA9IDA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIGNvbnN0IFtfLCBuLCBrLCBwXSA9IHNvdXJjZS5tYXRjaCgvXFxkKy9nKSEubWFwKE51bWJlcik7XHJcbiAgICB0aGlzLm4gPSBuO1xyXG4gICAgdGhpcy5rID0gaztcclxuICAgIHRoaXMucCA9IHA7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkJpbm9taWFsIFByb2JhYmlsaXR5IFJlc3VsdHNcIiB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPCAke3RoaXMua30pID0gJHt0aGlzLmxlc3N9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+PSAke3RoaXMua30pID0gJHt0aGlzLmJpZ0VxdWFsfWAgfSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgZ2V0RXF1YWwoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIHRoaXMuaywgdGhpcy5wKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpIHtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IHByb2JhYmlsaXR5ID0gY2FsY3VsYXRlQmlub20odGhpcy5uLCBpLCB0aGlzLnApO1xyXG4gICAgICBpZiAoaSA9PT0gdGhpcy5rKSB0aGlzLmVxdWFsID0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDw9IHRoaXMuaykgdGhpcy5sZXNzRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID4gdGhpcy5rKSB0aGlzLmJpZyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiB0ZXN0TWF0aEVuZ2luZSgpe1xyXG4gIGNvbnN0IGV4cHJlc3Npb25zPVtcclxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YDIgXFxmcmFjeyg1LTMpMzR9e1xcc3FydHsyXnsyfX19MC41YCxleHBlY3RlZE91dHB1dDogJzM0J30sXHJcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2AoeCsxKSh4KzMpPTJgLGV4cGVjdGVkT3V0cHV0OiAneF8xPS0wLjI2Nzk1LHhfMj0tMy43MzIwNSd9LFxyXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgXFxmcmFjezEzMn17MTI2MCt4XnsyfX09MC4wNWAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTM3LjE0ODM1LHhfMj0zNy4xNDgzNSd9LFxyXG4gIF1cclxuICBjb25zdCByZXN1bHRzPVtdXHJcbiAgdHJ5e1xyXG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaChleHByZXNzaW9uID0+IHtcclxuICAgICAgY29uc3QgbWF0aD1uZXcgTWF0aFByYWlzZXIoZXhwcmVzc2lvbi5leHByZXNzaW9uKTtcclxuICAgICAgaWYgKG1hdGguc29sdXRpb24hPT1leHByZXNzaW9uLmV4cGVjdGVkT3V0cHV0KXtcclxuICAgICAgICByZXN1bHRzLnB1c2goe2V4cHJlc3Npb246IGV4cHJlc3Npb24uZXhwcmVzc2lvbixleHBlY3RlZE91dHB1dDogZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCxhY3R1YWxPdXRwdXQ6IG1hdGguc29sdXRpb259KVxyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcbiAgY2F0Y2goZSl7XHJcbiAgICBjb25zb2xlLmxvZyhlKVxyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuIl19