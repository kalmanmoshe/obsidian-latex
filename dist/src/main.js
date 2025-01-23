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
import { Prec } from "@codemirror/state";
import { FormatTikzjax } from "./tikzjax/interpret/tokenizeTikzjax.js";
import { onFileCreate, onFileChange, onFileDelete, getSnippetsFromFiles, getFileSets, getVariablesFromFiles, tryGetVariablesFromUnknownFiles } from "./settings/file_watch";
import { ICONS } from "./settings/ui/icons";
import { getEditorCommands } from "./features/editor_commands";
import { parseSnippetVariables, parseSnippets } from "./snippets/parse";
import { tabstopsStateField } from "./snippets/codemirror/tabstops_state_field";
import { snippetQueueStateField } from "./snippets/codemirror/snippet_queue_state_field";
import { snippetInvertedEffects } from "./snippets/codemirror/history";
import { EditorView, tooltips, } from "@codemirror/view";
import { HtmlBackgroundPlugin, rtlForcePlugin } from "./editorDecorations";
import { getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { snippetExtensions } from "./snippets/codemirror/extensions";
import { colorPairedBracketsPlugin, highlightCursorBracketsPlugin } from "./editor_extensions/highlight_brackets";
import { mkConcealPlugin } from "./editor_extensions/conceal";
import { cursorTooltipBaseTheme, cursorTooltipField } from "./editor_extensions/math_tooltip";
import { onClick, onKeydown, onMove, onScroll, onTransaction } from "./ inputMonitors";
// i want to make some code that will outo insot metadata to fillls
export default class Moshe extends Plugin {
    settings;
    CMSettings;
    tikzProcessor;
    editorExtensions = [];
    async onload() {
        console.log("new lod");
        //new LatexRender(this.app,this)
        await this.loadSettings();
        this.loadIcons();
        this.addSettingTab(new LatexSuiteSettingTab(this.app, this));
        loadMathJax();
        // Register Latex Suite extensions and optional editor extensions for editor enhancements
        //this.registerEditorExtension(this.editorExtensions);
        // Watch for changes to the snippet variables and snippets files
        this.watchFiles();
        this.addEditorCommands();
        this.tikzProcessor = new Tikzjax(this.app, this);
        this.tikzProcessor.readyLayout();
        this.tikzProcessor.addSyntaxHighlighting();
        this.tikzProcessor.registerTikzCodeBlock();
        this.registerMarkdownCodeBlockProcessor("math-engine", processMathBlock.bind(this));
        this.registerMarkdownCodeBlockProcessor("tikzjax", processTikzBlock.bind(this));
    }
    setEditorExtensions() {
        while (this.editorExtensions.length)
            this.editorExtensions.pop();
        this.editorExtensions.push([
            getLatexSuiteConfigExtension(this.CMSettings),
            Prec.highest(EditorView.domEventHandlers({ "keydown": onKeydown })),
            Prec.default(EditorView.domEventHandlers({ "scroll": onScroll, "click": onClick, "mousemove": onMove })),
            Prec.lowest([colorPairedBracketsPlugin.extension, rtlForcePlugin.extension, HtmlBackgroundPlugin.extension]),
            EditorView.updateListener.of(onTransaction),
            snippetExtensions,
            highlightCursorBracketsPlugin.extension,
            cursorTooltipField.extension,
            cursorTooltipBaseTheme,
            tabstopsStateField.extension,
            snippetQueueStateField.extension,
            snippetInvertedEffects,
            tooltips({ position: "absolute" }),
        ]);
        if (this.CMSettings.concealEnabled) {
            const timeout = this.CMSettings.concealRevealTimeout;
            this.editorExtensions.push(mkConcealPlugin(timeout).extension);
        }
        this.registerEditorExtension(this.editorExtensions.flat());
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
        this.setEditorExtensions();
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
function processMathBlock(source, mainContainer) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLGtCQUFrQjtBQUNsQixZQUFZO0FBQ1osT0FBTyxFQUFDLE1BQU0sRUFBRSxnQkFBZ0IsRUFBQyxPQUFPLEVBQU8sS0FBSyxFQUFFLFNBQVMsRUFBVSxNQUFNLEVBQWtCLFdBQVcsRUFBQyxVQUFVLEVBQTZHLE1BQU0sVUFBVSxDQUFDO0FBQ3JQLE9BQU8sRUFBRSxJQUFJLElBQUksWUFBWSxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQ25ELE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUN2RCxPQUFPLEVBQTJCLGdCQUFnQixFQUF3Qix5QkFBeUIsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBQ2hJLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxjQUFjLEVBQW9CLHFCQUFxQixFQUFFLGdCQUFnQixFQUFzQyxlQUFlLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM5SyxPQUFPLEVBQUUsSUFBSSxFQUFnQyxPQUFPLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUVoRixPQUFPLEVBQVksSUFBSSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDbkQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBR3ZFLE9BQU8sRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBRSxXQUFXLEVBQUUscUJBQXFCLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1SyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFNUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDL0QsT0FBTyxFQUFvQixxQkFBcUIsRUFBRSxhQUFhLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUUxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNoRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV2RSxPQUFPLEVBQUUsVUFBVSxFQUFzQyxRQUFRLEdBQUcsTUFBTSxrQkFBa0IsQ0FBQztBQUM3RixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsY0FBYyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFM0UsT0FBTyxFQUF1Qiw0QkFBNEIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2pHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx5QkFBeUIsRUFBdUMsNkJBQTZCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN2SixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDOUQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGtCQUFrQixFQUFxQixNQUFNLGtDQUFrQyxDQUFDO0FBQ2pILE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFFdkYsbUVBQW1FO0FBR25FLE1BQU0sQ0FBQyxPQUFPLE9BQU8sS0FBTSxTQUFRLE1BQU07SUFDdkMsUUFBUSxDQUEyQjtJQUNwQyxVQUFVLENBQXVCO0lBQ2hDLGFBQWEsQ0FBUztJQUN0QixnQkFBZ0IsR0FBYyxFQUFFLENBQUM7SUFFakMsS0FBSyxDQUFDLE1BQU07UUFDVixPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFBO1FBQ3RCLGdDQUFnQztRQUVoQyxNQUFNLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUM1QixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM3RCxXQUFXLEVBQUUsQ0FBQztRQUVkLHlGQUF5RjtRQUN6RixzREFBc0Q7UUFFdEQsZ0VBQWdFO1FBQ2hFLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUVsQixJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsYUFBYSxHQUFDLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUMsSUFBSSxDQUFDLENBQUE7UUFDN0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDM0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBRXpDLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxhQUFhLEVBQUUsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLGtDQUFrQyxDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUVsRixDQUFDO0lBQ0QsbUJBQW1CO1FBQ25CLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU07WUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFakUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQztZQUMxQiw0QkFBNEIsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1lBQzdDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsRUFBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7WUFDdkcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLHlCQUF5QixDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsU0FBUyxFQUFDLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQzNHLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLGFBQWEsQ0FBQztZQUM5QyxpQkFBaUI7WUFFakIsNkJBQTZCLENBQUMsU0FBUztZQUN2QyxrQkFBa0IsQ0FBQyxTQUFTO1lBQzVCLHNCQUFzQjtZQUVuQixrQkFBa0IsQ0FBQyxTQUFTO1lBQy9CLHNCQUFzQixDQUFDLFNBQVM7WUFDaEMsc0JBQXNCO1lBQ3RCLFFBQVEsQ0FBQyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQztTQUNsQyxDQUFDLENBQUM7UUFFSCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDcEMsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQztZQUNyRCxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNoRSxDQUFDO1FBRUQsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFQSxpQkFBaUI7UUFDakIsS0FBSyxNQUFNLE9BQU8sSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQy9DLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUIsQ0FBQztJQUNGLENBQUM7SUFDQSxRQUFRO1FBQ1IsSUFBSSxDQUFDLGFBQWEsQ0FBQyx1QkFBdUIsRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQyxhQUFhLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztJQUMvQyxDQUFDO0lBRUEsS0FBSyxDQUFDLG1CQUFtQixDQUFDLGdCQUFrQztRQUM1RCxJQUFJLENBQUM7WUFDSixPQUFPLE1BQU0sYUFBYSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLGdCQUFnQixDQUFDLENBQUM7UUFDdEUsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixJQUFJLE1BQU0sQ0FBQywwQ0FBMEMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMxRCxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0lBR0EsU0FBUztRQUNQLEtBQUssTUFBTSxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDekQsT0FBTyxDQUFDLE1BQU0sRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM5QixDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUssQ0FBQyxZQUFZO1FBQ2hCLElBQUksSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBRWpDLHdDQUF3QztRQUN4QyxNQUFNLHFCQUFxQixHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsZUFBZSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1FBRXJFLGFBQWE7UUFDYixTQUFTLGVBQWUsQ0FBQyxXQUFXO1lBQ2xDLE9BQU87Z0JBQ0wsR0FBRyxXQUFXLENBQUMsYUFBYTtnQkFDNUIsR0FBRyxXQUFXLENBQUMsV0FBVztnQkFDMUIsUUFBUSxFQUFFLFdBQVcsQ0FBQyxRQUFRO2FBQy9CLENBQUM7UUFDSixDQUFDO1FBRUQsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO1lBQzFCLElBQUksR0FBRyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDL0IsQ0FBQztRQUVELElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFHMUQsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztZQUNyRixNQUFNLG9CQUFvQixHQUFHLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7WUFDdEUsTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQUMsb0JBQW9CLENBQUMsQ0FBQztZQUUxRSxJQUFJLENBQUMsVUFBVSxHQUFHLHlCQUF5QixDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFekUsNkVBQTZFO1lBQzdFLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUU7Z0JBQ3BDLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN6QixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUM7YUFDSSxDQUFDO1lBQ0osTUFBTSxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7UUFDL0IsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsWUFBWSxDQUFDLHFCQUFxQixHQUFHLEtBQUs7UUFDaEQsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNuQyxJQUFJLENBQUMsZUFBZSxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVBLEtBQUssQ0FBQyxlQUFlLENBQUMsMEJBQTBCLEdBQUcsS0FBSyxFQUFFLGtCQUFrQixHQUFHLEtBQUs7UUFDcEYsSUFBSSxDQUFDLFVBQVUsR0FBRyx5QkFBeUIsQ0FBQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsMEJBQTBCLEVBQUUsa0JBQWtCLENBQUMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDakksSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFDN0IsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUVBLEtBQUssQ0FBQywyQkFBMkI7UUFDakMsSUFBSSxDQUFDO1lBQ0osT0FBTyxNQUFNLHFCQUFxQixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNwRSxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLElBQUksTUFBTSxDQUFDLG1EQUFtRCxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsbURBQW1ELENBQUMsRUFBRSxDQUFDLENBQUM7WUFDcEUsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO0lBQ0YsQ0FBQztJQUNBLEtBQUssQ0FBQyxXQUFXLENBQUMsMEJBQW1DLEVBQUUsa0JBQTJCO1FBQ2xGLHlDQUF5QztRQUN6QywwRUFBMEU7UUFDMUUsTUFBTSxLQUFLLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWhDLE1BQU0sZ0JBQWdCLEdBQ3JCLElBQUksQ0FBQyxRQUFRLENBQUMsNEJBQTRCO1lBQ3pDLENBQUMsQ0FBQyxNQUFNLHFCQUFxQixDQUFDLElBQUksRUFBRSxLQUFLLENBQUM7WUFDMUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7UUFFN0MscUZBQXFGO1FBQ3JGLE1BQU0sb0JBQW9CLEdBQUcsTUFBTSwrQkFBK0IsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEYsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLENBQUM7WUFDaEQsb0RBQW9EO1lBQ3BELE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUN2RCxDQUFDO1FBRUQsTUFBTSxRQUFRLEdBQ2IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0I7WUFDakMsQ0FBQyxDQUFDLE1BQU0sb0JBQW9CLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQztZQUMzRCxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsd0JBQXdCLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsTUFBTSxFQUFHLDBCQUEwQixFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFFdEksT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQU1BLHdCQUF3QixDQUFDLFNBQWlCLEVBQUUsaUJBQXlCLEVBQUUsMEJBQW1DLEVBQUUsa0JBQTJCO1FBQ3ZJLElBQUksQ0FBQyxDQUFDLDBCQUEwQixJQUFJLGtCQUFrQixDQUFDO1lBQ3RELE9BQU87UUFFUixNQUFNLE1BQU0sR0FBRywwQkFBMEIsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQztRQUNqRixNQUFNLElBQUksR0FBRyxFQUFFLENBQUM7UUFFaEIsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQjtZQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsU0FBUyxXQUFXLENBQUMsQ0FBQztRQUNwQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsNEJBQTRCO1lBQzdDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxpQkFBaUIsb0JBQW9CLENBQUMsQ0FBQztRQUVyRCxNQUFNLE1BQU0sR0FBRyxjQUFjLENBQUM7UUFDOUIsSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3hELENBQUM7SUFJQSxVQUFVO1FBQ1YscURBQXFEO1FBQ3JELDBGQUEwRjtRQUMxRix1Q0FBdUM7UUFFdkMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUVyQyxNQUFNLGtCQUFrQixHQUFHO2dCQUMxQixRQUFRLEVBQUUsWUFBWTtnQkFDdEIsUUFBUSxFQUFFLFlBQVk7Z0JBQ3RCLFFBQVEsRUFBRSxZQUFZO2FBQ3RCLENBQUM7WUFFRixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUM7Z0JBQy9ELG1CQUFtQjtnQkFDbkIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN6RSxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0Q7QUFHRCxTQUFTLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxhQUEwQjtJQUVsRSxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRTlDLE1BQU0sYUFBYSxHQUEwQyxFQUFFLENBQUM7SUFDaEUsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO0lBRXZCLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFDbkksSUFBSSxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQUEsT0FBTztJQUFBLENBQUM7SUFFdkMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsRUFBRTtRQUN4QyxJQUFJLGFBQWEsR0FBbUIsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsRSxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLEtBQUssR0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3hILGtDQUFrQztRQUNsQyxNQUFNLFdBQVcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxVQUFVLEVBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUMsYUFBYSxDQUFDLENBQUM7UUFDdEYsV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRXpCLElBQUcsV0FBVyxDQUFDLElBQUksS0FBRyxVQUFVLEVBQUMsQ0FBQztZQUNoQyxhQUFhLEdBQUcsV0FBVyxDQUFDLFNBQTJCLENBQUM7WUFDeEQsYUFBYSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUMzQyxDQUFDO2FBQ0csQ0FBQztZQUFBLGNBQWMsRUFBRSxDQUFDO1FBQUEsQ0FBQztJQUN6QixDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxTQUFTLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxTQUFzQjtJQUM5RCxJQUFHLENBQUM7UUFDRixNQUFNLENBQUMsR0FBQyxJQUFJLGFBQWEsQ0FBQyxNQUFNLEVBQUMsSUFBSSxDQUFDLENBQUE7UUFDeEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNkLENBQUM7SUFBQSxPQUFNLENBQUMsRUFBQyxDQUFDO1FBQ1IsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNsQixDQUFDO0lBRUQsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFO1FBQzlELEtBQUssRUFBRSw4REFBOEQ7S0FDeEUsQ0FBQyxDQUFDO0lBQ0gsWUFBWSxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxDQUFDO0lBQzFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDcEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUE7QUFDcEUsQ0FBQztBQUlELFNBQVMsYUFBYTtJQUdwQixNQUFNLEdBQUcsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLDRCQUE0QixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRTFFLE1BQU0sTUFBTSxHQUFDLElBQUksU0FBUyxFQUFFLENBQUE7SUFDNUIsTUFBTSxJQUFJLEdBQUcsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDbEMsTUFBTSxHQUFHLEdBQUMsRUFBRSxDQUFBO0lBQ1osS0FBSSxJQUFJLENBQUMsR0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLElBQUUsQ0FBQyxFQUFDLENBQUMsRUFBRSxFQUFDLENBQUM7UUFDckIsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUMvQixDQUFDO0lBQ0QsTUFBTSxLQUFLLEdBQUc7UUFDWixJQUFJLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUNyRDs7OEZBRXNGO0tBQ3ZGLENBQUM7SUFFRixLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFBO0lBQ3JELHFCQUFxQjtJQUVyQixHQUFHLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDbEQsR0FBRyxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsR0FBRyxNQUFNLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BELHVDQUF1QztJQUN2QyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvRCxPQUFPLEdBQUcsQ0FBQTtBQUNaLENBQUM7QUFHRCxNQUFNLE9BQU8sU0FBUztJQUNwQixHQUFHLENBQU87SUFDVixHQUFHLENBQU87SUFFVixZQUFZLEdBQVUsRUFBQyxHQUFVO1FBQy9CLElBQUksQ0FBQyxHQUFHLEdBQUMsR0FBRyxJQUFFLElBQUksSUFBSSxFQUFFLENBQUM7UUFDekIsSUFBSSxDQUFDLEdBQUcsR0FBQyxHQUFHLElBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQztJQUMzQixDQUFDO0lBQ0QsYUFBYSxDQUFDLElBQXNCO1FBQ2xDLE1BQU0sWUFBWSxHQUFHLENBQUMsS0FBYSxFQUFFLEdBQVksRUFBRSxHQUFZLEVBQW9CLEVBQUU7WUFDbkYsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLEdBQUcsSUFBRSxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLElBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzNFLENBQUMsQ0FBQztRQUNGLE1BQU0sZUFBZSxHQUFHLENBQUMsU0FBZSxFQUFRLEVBQUU7WUFDaEQsTUFBTSxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxHQUFHLFNBQVMsQ0FBQztZQUNuRCxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEdBQUcsWUFBWSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLFVBQVUsQ0FBQyxDQUFDO1lBQ3pHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsR0FBRyxZQUFZLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBVSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDM0csQ0FBQyxDQUFDO1FBQ0YsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFdBQXNCLEVBQVEsRUFBRTtZQUN6RCxlQUFlLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2pDLGVBQWUsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkMsQ0FBQyxDQUFDO1FBQ0YsSUFBSSxJQUFJLFlBQVksU0FBUyxFQUFFLENBQUM7WUFDOUIsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUIsQ0FBQzthQUFNLENBQUM7WUFDTixlQUFlLENBQUMsSUFBWSxDQUFDLENBQUM7UUFDaEMsQ0FBQztJQUNILENBQUM7SUFDRCxRQUFRLEtBQUcsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxHQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUEsQ0FBQSxDQUFDO0lBQ3BFLFNBQVMsS0FBRyxPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLEdBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQSxDQUFBLENBQUM7SUFDckUsT0FBTyxDQUFDLEtBQWdCO0lBRXhCLENBQUM7SUFDRCxLQUFLO1FBQ0gsT0FBTyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtJQUN6QyxDQUFDO0lBQ0QsTUFBTSxDQUFDLGNBQWM7SUFFckIsQ0FBQztDQUNGO0FBQ0QsTUFBTSxZQUFZO0lBQ2hCLFVBQVUsQ0FBTztJQUNqQixXQUFXLENBQVM7Q0FFckI7QUFFRCxNQUFNLE9BQU87SUFDWCxJQUFJLENBQVM7SUFDYixVQUFVLENBQTJEO0lBRXJFLFlBQVksV0FBbUIsRUFBRSxhQUF1RSxFQUFFO1FBQ3RHLElBQUksQ0FBQyxJQUFJLEdBQUcsV0FBVyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO0lBQ2pDLENBQUM7SUFDRCxTQUFTO1FBQ1AsTUFBTSxNQUFNLEdBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQTtRQUM1QixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUN2QixNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzdCLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxNQUFNLENBQUM7SUFDaEIsQ0FBQztJQUNELFNBQVMsQ0FBQyxNQUFpQjtRQUN2QixNQUFNLFdBQVcsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ25GLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1lBQzVDLE1BQU0sT0FBTyxHQUFHLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQ3hDLE9BQU8sR0FBRyxPQUFPLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQ3JELENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUM7UUFFcEIsV0FBVyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFeEMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU07WUFBRSxXQUFXLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZGLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1lBQUUsV0FBVyxDQUFDLFlBQVksQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUNsSCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSTtZQUFFLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7O1lBQzVFLFdBQVcsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRTlDLE9BQU8sV0FBVyxDQUFDO0lBQ3ZCLENBQUM7Q0FDRjtBQUtELE1BQU0sV0FBVztJQUNmLFNBQVMsQ0FBTTtJQUNmLGFBQWEsR0FBMEMsRUFBRSxDQUFDO0lBQzFELElBQUksR0FBRyxNQUFNLENBQUM7SUFDZCxNQUFNLENBQU07SUFDWixTQUFTLENBQWM7SUFDdkIsUUFBUSxDQUFjO0lBQ3RCLEdBQUcsQ0FBTTtJQUVULFlBQVksU0FBaUIsRUFBQyxhQUFrQixFQUFFLEdBQVEsRUFBRSxTQUFzQjtRQUNoRixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsYUFBYSxHQUFDLGFBQWEsQ0FBQztRQUNqQyxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQzNELFNBQVMsRUFBRSxZQUFZO1NBQ3hCLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxLQUFLLENBQUMsVUFBVTtRQUNkLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNsQixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRU8sY0FBYztRQUNwQixDQUFDLFlBQVksRUFBRSxhQUFhLENBQUMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDaEQsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMxQyxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUM3QixJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUM1QyxDQUFDO0lBRU8sYUFBYTtRQUNuQixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxhQUFhLENBQWdCLENBQUM7UUFDNUUsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFnQixDQUFDO1FBQzlFLElBQUksQ0FBQztZQUNILFFBQVEsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNsQixLQUFLLE9BQU87b0JBQ1YsZ0RBQWdEO29CQUNoRCxNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDaEUsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDOUIsSUFBSSxDQUFDLE1BQU0sR0FBRyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQ3BDLE1BQU07Z0JBQ1IsS0FBSyxLQUFLO29CQUNSLGdEQUFnRDtvQkFDaEQsTUFBTSxDQUFFLEFBQUQsRUFBRyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBRSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUM3RCxJQUFJLENBQUMsTUFBTSxHQUFDLHFCQUFxQixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUE7b0JBQ3RELE1BQU07Z0JBQ1IsS0FBSyxLQUFLO29CQUNSLGdEQUFnRDtvQkFDaEQsSUFBSSxDQUFDLE1BQU0sR0FBQyxJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNwRixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO29CQUM5RCxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDNUUsSUFBSSxDQUFDLE1BQU0sR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQTtvQkFDOUIsTUFBTTtnQkFDUixLQUFLLFVBQVU7b0JBQ2IsTUFBTTtnQkFDUjtvQkFDRSxnREFBZ0Q7b0JBQ2hELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO29CQUM5QyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUNqRSxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztvQkFDN0UsSUFBSSxDQUFDLFNBQVMsR0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztvQkFDakMsTUFBTTtZQUNWLENBQUM7WUFDRixJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLElBQUksQ0FBQyxTQUFTLEtBQUcsUUFBUSxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFBLENBQUMsQ0FBQSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUEsZ0NBQWdDLENBQUMsQ0FBQztRQUNoSyxDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNiLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM1QyxPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixFQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25ELENBQUM7SUFDSCxDQUFDO0lBRU8sb0JBQW9CLENBQUMsUUFBcUIsRUFBRSxTQUFzQixFQUFFLEtBQWEsRUFBRSxNQUFXO1FBQ3BHLFFBQVEsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLEtBQUssRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO1FBQzVDLGtGQUFrRjtRQUNsRiwrRUFBK0U7UUFDL0UsU0FBUyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQyxDQUFDLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtRQUMxRixnRkFBZ0Y7SUFDbEYsQ0FBQztJQUVPLFlBQVksQ0FBQyxRQUFxQixFQUFFLFNBQXNCLEVBQUUsR0FBVTtRQUM1RSxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFLElBQUksU0FBUyxFQUFFLENBQUMsQ0FBQztRQUMvRSxTQUFTLENBQUMsU0FBUyxHQUFHLDRCQUE0QixHQUFHLENBQUMsT0FBTyxTQUFTLENBQUM7UUFDdkUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVPLFVBQVU7UUFDaEIsTUFBTSxTQUFTLEdBQUcsbUJBQW1CLEVBQUUsQ0FBQztRQUN4QyxNQUFNLFdBQVcsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDcEYsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsSUFBSSxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUM7WUFDOUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0QsQ0FBQztJQUNILENBQUM7SUFFTyxZQUFZLENBQUMsS0FBVTtRQUM3QixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEQsU0FBUyxFQUFFLGdCQUFnQjtZQUMzQixXQUFXLEVBQUUsSUFBSTtTQUNsQixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRU8sYUFBYSxDQUFDLEtBQVU7UUFDOUIsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3hELFNBQVMsRUFBRSxpQkFBaUI7WUFDNUIsV0FBVyxFQUFFLElBQUk7U0FDbEIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUVPLGVBQWU7UUFDckIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFHLFVBQVUsRUFBRSxDQUFDO1lBQzNCLElBQUksQ0FBQyx5QkFBeUIsRUFBRSxDQUFDO1FBQ25DLENBQUM7YUFBTSxDQUFDO1lBQ04sSUFBSSxDQUFDLDRCQUE0QixFQUFFLENBQUM7UUFDdEMsQ0FBQztJQUNILENBQUM7SUFFTyx5QkFBeUI7UUFDL0IsTUFBTSxDQUFDLENBQUMsRUFBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFZLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUN4QixPQUFPLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztZQUNoRSxPQUFPO1FBQ1QsQ0FBQztRQUNELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxLQUFLLFFBQVEsQ0FBQyxDQUFDO1FBQ3BGLElBQUksZ0JBQWdCLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUM1QixJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNyRCxDQUFDO2FBQU0sQ0FBQztZQUNOLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDL0MsQ0FBQztJQUNILENBQUM7SUFFTyw0QkFBNEI7UUFDbEMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQ2pELElBQUksT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFHLFFBQVEsRUFBQyxDQUFDO2dCQUNwQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzRCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFHRCxTQUFTLG1CQUFtQjtJQUMxQixPQUFPO1FBQ0wsRUFBRSxLQUFLLEVBQUUsNEJBQTRCLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRTtRQUN2RCxFQUFFLEtBQUssRUFBRSxvREFBb0QsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFO1FBQzdFLEVBQUUsS0FBSyxFQUFFLG1DQUFtQyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUU7UUFDNUQsRUFBRSxLQUFLLEVBQUUsOEJBQThCLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTtLQUM3RCxDQUFDO0FBQ0osQ0FBQztBQUdELE1BQU0sWUFBWTtJQUNoQixTQUFTLENBQU07SUFDZixXQUFXLENBQTJCO0lBQ3RDLE9BQU8sR0FBRyxJQUFJLFFBQVEsRUFBRSxDQUFDO0lBQ3pCLElBQUksQ0FBTztJQUNYLFFBQVEsQ0FBUztJQUNqQixNQUFNLENBQVM7SUFDZixLQUFLLENBQU87SUFFWixZQUFZLFdBQW1CLEVBQUUsU0FBaUIsRUFBRSxRQUFnQjtRQUNsRSxJQUFJLENBQUMsU0FBUyxHQUFDLFNBQVMsQ0FBQztRQUN6QixNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRWxFLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFN0UsSUFBSSxDQUFDLElBQUksR0FBQyxJQUFJLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDOUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVTtZQUN2QixJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDakIsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO0lBQ2xCLENBQUM7SUFDRCxTQUFTO1FBQ1AsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUM7WUFDOUIsSUFBSSxDQUFDLE1BQU0sR0FBQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxjQUFjLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUE7O1lBRTNFLElBQUksQ0FBQyxNQUFNLEdBQUMsV0FBVyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsbUJBQW1CLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUE7SUFDekYsQ0FBQztJQUNELFFBQVE7UUFDTixNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDdEIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFFOUYsMkJBQTJCO1FBQzNCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksWUFBWSxHQUFHLFVBQVUsRUFBRSxDQUFDO1lBQzlCLEtBQUssR0FBRyxVQUFVLEdBQUcsWUFBWSxDQUFDO1FBQ3BDLENBQUM7YUFBTSxJQUFJLFlBQVksR0FBRyxVQUFVLEVBQUUsQ0FBQztZQUNyQyxLQUFLLEdBQUcsVUFBVSxHQUFHLFlBQVksQ0FBQztRQUNwQyxDQUFDO1FBQ0QsZ0NBQWdDO1FBQ2hDLHVGQUF1RjtRQUV2RixNQUFNLEtBQUssR0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFDLENBQUM7UUFHM0IsbUhBQW1IO1FBQ2xILHlJQUF5STtRQUN6SSx5SUFBeUk7UUFFekksSUFBSSxDQUFDLEtBQUssR0FBQztRQUNULHNEQUFzRDtRQUN0RCwwRkFBMEY7UUFDMUYsOEZBQThGO1FBQzlGLDhGQUE4RjtTQUMvRixDQUFBO1FBR0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsWUFBWSxFQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMseUJBQXlCLEVBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMzRjs7Ozs7a0NBSzBCO1FBQzFCLElBQUksQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3JELENBQUM7Q0FDRjtBQUlELE1BQU0sU0FBVSxTQUFRLEtBQUs7SUFDM0IsSUFBSSxDQUFnQjtJQUNwQixZQUFZLEdBQVEsRUFBQyxRQUFhO1FBQ2hDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxhQUFhLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVELE1BQU07UUFDSixNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQzNCLE1BQU0sSUFBSSxHQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDckIsTUFBTSxNQUFNLEdBQUcsU0FBUyxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QyxNQUFNLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2pELE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUV2QyxNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUV6RyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUMxQyxTQUFTLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUMzRCxJQUFJLE1BQU0sQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1FBQzNDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU87UUFDTCxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsSUFBSSxDQUFDO1FBQ3pCLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUN0QixDQUFDO0NBQ0Y7QUFJRCxNQUFNLGNBQWUsU0FBUSxLQUFLO0lBQ3hCLENBQUMsQ0FBUztJQUNWLENBQUMsQ0FBUztJQUNWLENBQUMsQ0FBUztJQUNWLEtBQUssR0FBRyxDQUFDLENBQUM7SUFDVixJQUFJLEdBQUcsQ0FBQyxDQUFDO0lBQ1QsU0FBUyxHQUFHLENBQUMsQ0FBQztJQUNkLEdBQUcsR0FBRyxDQUFDLENBQUM7SUFDUixRQUFRLEdBQUcsQ0FBQyxDQUFDO0lBRXJCLFlBQVksR0FBUSxFQUFFLE1BQWM7UUFDbEMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFFLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZELElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDWCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNiLENBQUM7SUFFRCxNQUFNO1FBQ0osSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDOUIsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUMzQixTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSw4QkFBOEIsRUFBRSxDQUFDLENBQUM7UUFDbkUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdEUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDckUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDM0UsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsU0FBUyxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxJQUFJLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDNUUsQ0FBQztJQUVNLFFBQVE7UUFDYixPQUFPLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFTyxzQkFBc0I7UUFDNUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNqQyxNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RELElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDO1lBQzNDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxJQUFJLElBQUksV0FBVyxDQUFDO1lBQ3pDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxTQUFTLElBQUksV0FBVyxDQUFDO1lBQy9DLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxHQUFHLElBQUksV0FBVyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxRQUFRLElBQUksV0FBVyxDQUFDO1FBQ2hELENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUFPRCxTQUFTLGNBQWM7SUFDckIsTUFBTSxXQUFXLEdBQUM7UUFDaEIsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSxtQ0FBbUMsRUFBQyxjQUFjLEVBQUUsSUFBSSxFQUFDO1FBQ2hGLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsY0FBYyxFQUFDLGNBQWMsRUFBRSwyQkFBMkIsRUFBQztRQUNsRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLDZCQUE2QixFQUFDLGNBQWMsRUFBRSw0QkFBNEIsRUFBQztLQUNuRyxDQUFBO0lBQ0QsTUFBTSxPQUFPLEdBQUMsRUFBRSxDQUFBO0lBQ2hCLElBQUcsQ0FBQztRQUNGLFdBQVcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxJQUFJLEdBQUMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2xELElBQUksSUFBSSxDQUFDLFFBQVEsS0FBRyxVQUFVLENBQUMsY0FBYyxFQUFDLENBQUM7Z0JBQzdDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsRUFBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsRUFBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBQyxDQUFDLENBQUE7WUFDekgsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU0sQ0FBQyxFQUFDLENBQUM7UUFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ2hCLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy9naXQgcmVzZXQgLS1oYXJkXG4vL2dpdCBicmFuY2hcbmltcG9ydCB7UGx1Z2luLCBNYXJrZG93blJlbmRlcmVyLGFkZEljb24sIEFwcCwgTW9kYWwsIENvbXBvbmVudCwgU2V0dGluZyxOb3RpY2UsIFdvcmtzcGFjZVdpbmRvdyxsb2FkTWF0aEpheCxyZW5kZXJNYXRoLCBNYXJrZG93blZpZXcsIEVkaXRvclN1Z2dlc3QsIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbywgRWRpdG9yUG9zaXRpb24sIEVkaXRvciwgVEZpbGUsIEVkaXRvclN1Z2dlc3RDb250ZXh0fSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCB7IGh0bWwgYXMgYmVhdXRpZnlIVE1MIH0gZnJvbSAnanMtYmVhdXRpZnknO1xuaW1wb3J0IHsgTWF0aEluZm8sIE1hdGhQcmFpc2VyIH0gZnJvbSBcIi4vbWF0aFBhcnNlci9tYXRoRW5naW5lXCI7XG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcbmltcG9ydCB7TGF0ZXhTdWl0ZVBsdWdpblNldHRpbmdzLCBERUZBVUxUX1NFVFRJTkdTLCBMYXRleFN1aXRlQ01TZXR0aW5ncywgcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5nc30gZnJvbSBcIi4vc2V0dGluZ3Mvc2V0dGluZ3NcIjtcbmltcG9ydCB7IExhdGV4U3VpdGVTZXR0aW5nVGFiIH0gZnJvbSBcIi4vc2V0dGluZ3Mvc2V0dGluZ3NfdGFiXCI7XG5pbXBvcnQgeyBjYWxjdWxhdGVCaW5vbSwgZGVncmVlc1RvUmFkaWFucywgZmluZEFuZ2xlQnlDb3NpbmVSdWxlLCBnZXRVc2FibGVEZWdyZWVzLCBwb2xhclRvQ2FydGVzaWFuLCByYWRpYW5zVG9EZWdyZWVzLCByb3VuZEJ5U2V0dGluZ3MgfSBmcm9tIFwic3JjL21hdGhQYXJzZXIvbWF0aFV0aWxpdGllc1wiO1xuaW1wb3J0IHsgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0dGluZywgVGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvdGlrempheFwiO1xuXG5pbXBvcnQge0V4dGVuc2lvbiwgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRm9ybWF0VGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC5qc1wiO1xuXG5cbmltcG9ydCB7IG9uRmlsZUNyZWF0ZSwgb25GaWxlQ2hhbmdlLCBvbkZpbGVEZWxldGUsIGdldFNuaXBwZXRzRnJvbUZpbGVzLCBnZXRGaWxlU2V0cywgZ2V0VmFyaWFibGVzRnJvbUZpbGVzLCB0cnlHZXRWYXJpYWJsZXNGcm9tVW5rbm93bkZpbGVzIH0gZnJvbSBcIi4vc2V0dGluZ3MvZmlsZV93YXRjaFwiO1xuaW1wb3J0IHsgSUNPTlMgfSBmcm9tIFwiLi9zZXR0aW5ncy91aS9pY29uc1wiO1xuXG5pbXBvcnQgeyBnZXRFZGl0b3JDb21tYW5kcyB9IGZyb20gXCIuL2ZlYXR1cmVzL2VkaXRvcl9jb21tYW5kc1wiO1xuaW1wb3J0IHsgU25pcHBldFZhcmlhYmxlcywgcGFyc2VTbmlwcGV0VmFyaWFibGVzLCBwYXJzZVNuaXBwZXRzIH0gZnJvbSBcIi4vc25pcHBldHMvcGFyc2VcIjtcbmltcG9ydCB7IExhdGV4UmVuZGVyIH0gZnJvbSBcIi4vbGF0ZXhSZW5kZXIvbWFpblwiO1xuaW1wb3J0IHsgdGFic3RvcHNTdGF0ZUZpZWxkIH0gZnJvbSBcIi4vc25pcHBldHMvY29kZW1pcnJvci90YWJzdG9wc19zdGF0ZV9maWVsZFwiO1xuaW1wb3J0IHsgc25pcHBldFF1ZXVlU3RhdGVGaWVsZCB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3Ivc25pcHBldF9xdWV1ZV9zdGF0ZV9maWVsZFwiO1xuaW1wb3J0IHsgc25pcHBldEludmVydGVkRWZmZWN0cyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvaGlzdG9yeVwiO1xuXG5pbXBvcnQgeyBFZGl0b3JWaWV3LCBWaWV3UGx1Z2luLCBWaWV3VXBkYXRlICxEZWNvcmF0aW9uLCB0b29sdGlwcywgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xuaW1wb3J0IHsgSHRtbEJhY2tncm91bmRQbHVnaW4sIHJ0bEZvcmNlUGx1Z2luIH0gZnJvbSBcIi4vZWRpdG9yRGVjb3JhdGlvbnNcIjtcblxuaW1wb3J0IHsgZ2V0TGF0ZXhTdWl0ZUNvbmZpZywgZ2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbiB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvY29uZmlnXCI7XG5pbXBvcnQgeyBzbmlwcGV0RXh0ZW5zaW9ucyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvZXh0ZW5zaW9uc1wiO1xuaW1wb3J0IHsgY29sb3JQYWlyZWRCcmFja2V0c1BsdWdpbiwgY29sb3JQYWlyZWRCcmFja2V0c1BsdWdpbkxvd2VzdFByZWMsIGhpZ2hsaWdodEN1cnNvckJyYWNrZXRzUGx1Z2luIH0gZnJvbSBcIi4vZWRpdG9yX2V4dGVuc2lvbnMvaGlnaGxpZ2h0X2JyYWNrZXRzXCI7XG5pbXBvcnQgeyBta0NvbmNlYWxQbHVnaW4gfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9jb25jZWFsXCI7XG5pbXBvcnQgeyBjdXJzb3JUb29sdGlwQmFzZVRoZW1lLCBjdXJzb3JUb29sdGlwRmllbGQsIGhhbmRsZU1hdGhUb29sdGlwIH0gZnJvbSBcIi4vZWRpdG9yX2V4dGVuc2lvbnMvbWF0aF90b29sdGlwXCI7XG5pbXBvcnQgeyBvbkNsaWNrLCBvbktleWRvd24sIG9uTW92ZSwgb25TY3JvbGwsIG9uVHJhbnNhY3Rpb24gfSBmcm9tIFwiLi8gaW5wdXRNb25pdG9yc1wiO1xuXG4vLyBpIHdhbnQgdG8gbWFrZSBzb21lIGNvZGUgdGhhdCB3aWxsIG91dG8gaW5zb3QgbWV0YWRhdGEgdG8gZmlsbGxzXG5cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9zaGUgZXh0ZW5kcyBQbHVnaW4ge1xuICBzZXR0aW5nczogTGF0ZXhTdWl0ZVBsdWdpblNldHRpbmdzO1xuXHRDTVNldHRpbmdzOiBMYXRleFN1aXRlQ01TZXR0aW5ncztcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxuICBlZGl0b3JFeHRlbnNpb25zOiBFeHRlbnNpb25bXT1bXTtcblxuICBhc3luYyBvbmxvYWQoKSB7XG4gICAgY29uc29sZS5sb2coXCJuZXcgbG9kXCIpXG4gICAgLy9uZXcgTGF0ZXhSZW5kZXIodGhpcy5hcHAsdGhpcylcblxuICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG5cdFx0dGhpcy5sb2FkSWNvbnMoKTtcblx0XHR0aGlzLmFkZFNldHRpbmdUYWIobmV3IExhdGV4U3VpdGVTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cdFx0bG9hZE1hdGhKYXgoKTtcblxuXHRcdC8vIFJlZ2lzdGVyIExhdGV4IFN1aXRlIGV4dGVuc2lvbnMgYW5kIG9wdGlvbmFsIGVkaXRvciBleHRlbnNpb25zIGZvciBlZGl0b3IgZW5oYW5jZW1lbnRzXG5cdFx0Ly90aGlzLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKHRoaXMuZWRpdG9yRXh0ZW5zaW9ucyk7XG5cblx0XHQvLyBXYXRjaCBmb3IgY2hhbmdlcyB0byB0aGUgc25pcHBldCB2YXJpYWJsZXMgYW5kIHNuaXBwZXRzIGZpbGVzXG5cdFx0dGhpcy53YXRjaEZpbGVzKCk7XG5cblx0XHR0aGlzLmFkZEVkaXRvckNvbW1hbmRzKCk7XG4gICAgdGhpcy50aWt6UHJvY2Vzc29yPW5ldyBUaWt6amF4KHRoaXMuYXBwLHRoaXMpXG4gICAgdGhpcy50aWt6UHJvY2Vzc29yLnJlYWR5TGF5b3V0KCk7XG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLmFkZFN5bnRheEhpZ2hsaWdodGluZygpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZWdpc3RlclRpa3pDb2RlQmxvY2soKTtcbiAgICBcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJtYXRoLWVuZ2luZVwiLCBwcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pqYXhcIiwgcHJvY2Vzc1Rpa3pCbG9jay5iaW5kKHRoaXMpKTtcbiAgICBcbiAgfVxuICBzZXRFZGl0b3JFeHRlbnNpb25zKCkge1xuXHRcdHdoaWxlICh0aGlzLmVkaXRvckV4dGVuc2lvbnMubGVuZ3RoKSB0aGlzLmVkaXRvckV4dGVuc2lvbnMucG9wKCk7XG5cdFx0XG5cdFx0dGhpcy5lZGl0b3JFeHRlbnNpb25zLnB1c2goW1xuXHRcdFx0Z2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbih0aGlzLkNNU2V0dGluZ3MpLFxuXHRcdFx0UHJlYy5oaWdoZXN0KEVkaXRvclZpZXcuZG9tRXZlbnRIYW5kbGVycyh7IFwia2V5ZG93blwiOiBvbktleWRvd24gfSkpLFxuICAgICAgUHJlYy5kZWZhdWx0KEVkaXRvclZpZXcuZG9tRXZlbnRIYW5kbGVycyh7XCJzY3JvbGxcIjogb25TY3JvbGwsIFwiY2xpY2tcIjogb25DbGljaywgXCJtb3VzZW1vdmVcIjogb25Nb3ZlIH0pKSxcbiAgICAgIFByZWMubG93ZXN0KFtjb2xvclBhaXJlZEJyYWNrZXRzUGx1Z2luLmV4dGVuc2lvbiwgcnRsRm9yY2VQbHVnaW4uZXh0ZW5zaW9uLEh0bWxCYWNrZ3JvdW5kUGx1Z2luLmV4dGVuc2lvbl0pLFxuICAgICAgRWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZihvblRyYW5zYWN0aW9uKSxcblx0XHRcdHNuaXBwZXRFeHRlbnNpb25zLFxuXG5cdFx0XHRoaWdobGlnaHRDdXJzb3JCcmFja2V0c1BsdWdpbi5leHRlbnNpb24sXG5cdFx0XHRjdXJzb3JUb29sdGlwRmllbGQuZXh0ZW5zaW9uLFxuXHRcdFx0Y3Vyc29yVG9vbHRpcEJhc2VUaGVtZSxcblxuICAgICAgdGFic3RvcHNTdGF0ZUZpZWxkLmV4dGVuc2lvbixcblx0XHRcdHNuaXBwZXRRdWV1ZVN0YXRlRmllbGQuZXh0ZW5zaW9uLFxuXHRcdFx0c25pcHBldEludmVydGVkRWZmZWN0cyxcblx0XHRcdHRvb2x0aXBzKHsgcG9zaXRpb246IFwiYWJzb2x1dGVcIiB9KSxcblx0XHRdKTtcblxuXHRcdGlmICh0aGlzLkNNU2V0dGluZ3MuY29uY2VhbEVuYWJsZWQpIHtcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSB0aGlzLkNNU2V0dGluZ3MuY29uY2VhbFJldmVhbFRpbWVvdXQ7XG5cdFx0XHR0aGlzLmVkaXRvckV4dGVuc2lvbnMucHVzaChta0NvbmNlYWxQbHVnaW4odGltZW91dCkuZXh0ZW5zaW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKHRoaXMuZWRpdG9yRXh0ZW5zaW9ucy5mbGF0KCkpO1xuXHR9XG5cbiAgYWRkRWRpdG9yQ29tbWFuZHMoKSB7XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGdldEVkaXRvckNvbW1hbmRzKHRoaXMpKSB7XG5cdFx0XHR0aGlzLmFkZENvbW1hbmQoY29tbWFuZCk7XG5cdFx0fVxuXHR9XG4gIG9udW5sb2FkKCkge1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0fVxuXG4gIGFzeW5jIGdldFNldHRpbmdzU25pcHBldHMoc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcykge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcGFyc2VTbmlwcGV0cyh0aGlzLnNldHRpbmdzLnNuaXBwZXRzLCBzbmlwcGV0VmFyaWFibGVzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRuZXcgTm90aWNlKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0cyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblxuICBsb2FkSWNvbnMoKSB7XG4gICAgZm9yIChjb25zdCBbaWNvbklkLCBzdmdDb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhJQ09OUykpIHtcbiAgICAgIGFkZEljb24oaWNvbklkLCBzdmdDb250ZW50KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG4gICAgbGV0IGRhdGEgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XG5cbiAgICAvLyBNaWdyYXRlIHNldHRpbmdzIGZyb20gdjEuOC4wIC0gdjEuOC40XG4gICAgY29uc3Qgc2hvdWxkTWlncmF0ZVNldHRpbmdzID0gZGF0YSA/IFwiYmFzaWNTZXR0aW5nc1wiIGluIGRhdGEgOiBmYWxzZTtcblxuICAgIC8vIEB0cy1pZ25vcmVcbiAgICBmdW5jdGlvbiBtaWdyYXRlU2V0dGluZ3Mob2xkU2V0dGluZ3MpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLm9sZFNldHRpbmdzLmJhc2ljU2V0dGluZ3MsXG4gICAgICAgIC4uLm9sZFNldHRpbmdzLnJhd1NldHRpbmdzLFxuICAgICAgICBzbmlwcGV0czogb2xkU2V0dGluZ3Muc25pcHBldHMsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmIChzaG91bGRNaWdyYXRlU2V0dGluZ3MpIHtcbiAgICAgIGRhdGEgPSBtaWdyYXRlU2V0dGluZ3MoZGF0YSk7XG4gICAgfVxuXG4gICAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGRhdGEpO1xuXG5cbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSB8fCB0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpIHtcbiAgICAgIGNvbnN0IHRlbXBTbmlwcGV0VmFyaWFibGVzID0gYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRWYXJpYWJsZXMoKTtcbiAgICAgIGNvbnN0IHRlbXBTbmlwcGV0cyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyh0ZW1wU25pcHBldFZhcmlhYmxlcyk7XG5cbiAgICAgIHRoaXMuQ01TZXR0aW5ncyA9IHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3ModGVtcFNuaXBwZXRzLCB0aGlzLnNldHRpbmdzKTtcblxuICAgICAgLy8gVXNlIG9uTGF5b3V0UmVhZHkgc28gdGhhdCB3ZSBkb24ndCB0cnkgdG8gcmVhZCB0aGUgc25pcHBldHMgZmlsZSB0b28gZWFybHlcbiAgICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcbiAgICAgICAgdGhpcy5wcm9jZXNzU2V0dGluZ3MoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMucHJvY2Vzc1NldHRpbmdzKCk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKGRpZEZpbGVMb2NhdGlvbkNoYW5nZSA9IGZhbHNlKSB7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0XHR0aGlzLnByb2Nlc3NTZXR0aW5ncyhkaWRGaWxlTG9jYXRpb25DaGFuZ2UpO1xuXHR9XG5cbiAgYXN5bmMgcHJvY2Vzc1NldHRpbmdzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID0gZmFsc2UsIGJlY2F1c2VGaWxlVXBkYXRlZCA9IGZhbHNlKSB7XG5cdFx0dGhpcy5DTVNldHRpbmdzID0gcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5ncyhhd2FpdCB0aGlzLmdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkLCBiZWNhdXNlRmlsZVVwZGF0ZWQpLCB0aGlzLnNldHRpbmdzKTtcbiAgICB0aGlzLnNldEVkaXRvckV4dGVuc2lvbnMoKTtcblx0XHR0aGlzLmFwcC53b3Jrc3BhY2UudXBkYXRlT3B0aW9ucygpO1xuXHR9XG4gIFxuICBhc3luYyBnZXRTZXR0aW5nc1NuaXBwZXRWYXJpYWJsZXMoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwYXJzZVNuaXBwZXRWYXJpYWJsZXModGhpcy5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRuZXcgTm90aWNlKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XG5cdFx0XHRjb25zb2xlLmxvZyhgRmFpbGVkIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0fVxuICBhc3luYyBnZXRTbmlwcGV0cyhiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZDogYm9vbGVhbiwgYmVjYXVzZUZpbGVVcGRhdGVkOiBib29sZWFuKSB7XG5cdFx0Ly8gR2V0IGZpbGVzIGluIHNuaXBwZXQvdmFyaWFibGUgZm9sZGVycy5cblx0XHQvLyBJZiBlaXRoZXIgaXMgc2V0IHRvIGJlIGxvYWRlZCBmcm9tIHNldHRpbmdzIHRoZSBzZXQgd2lsbCBqdXN0IGJlIGVtcHR5LlxuXHRcdGNvbnN0IGZpbGVzID0gZ2V0RmlsZVNldHModGhpcyk7XG5cblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzID1cblx0XHRcdHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZVxuXHRcdFx0XHQ/IGF3YWl0IGdldFZhcmlhYmxlc0Zyb21GaWxlcyh0aGlzLCBmaWxlcylcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpO1xuXG5cdFx0Ly8gVGhpcyBtdXN0IGJlIGRvbmUgaW4gZWl0aGVyIGNhc2UsIGJlY2F1c2UgaXQgYWxzbyB1cGRhdGVzIHRoZSBzZXQgb2Ygc25pcHBldCBmaWxlc1xuXHRcdGNvbnN0IHVua25vd25GaWxlVmFyaWFibGVzID0gYXdhaXQgdHJ5R2V0VmFyaWFibGVzRnJvbVVua25vd25GaWxlcyh0aGlzLCBmaWxlcyk7XG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSkge1xuXHRcdFx0Ly8gQnV0IHdlIG9ubHkgdXNlIHRoZSB2YWx1ZXMgaWYgdGhlIHVzZXIgd2FudHMgdGhlbVxuXHRcdFx0T2JqZWN0LmFzc2lnbihzbmlwcGV0VmFyaWFibGVzLCB1bmtub3duRmlsZVZhcmlhYmxlcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc25pcHBldHMgPVxuXHRcdFx0dGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZVxuXHRcdFx0XHQ/IGF3YWl0IGdldFNuaXBwZXRzRnJvbUZpbGVzKHRoaXMsIGZpbGVzLCBzbmlwcGV0VmFyaWFibGVzKVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzKTtcblx0XHR0aGlzLnNob3dTbmlwcGV0c0xvYWRlZE5vdGljZShzbmlwcGV0cy5sZW5ndGgsIE9iamVjdC5rZXlzKHNuaXBwZXRWYXJpYWJsZXMpLmxlbmd0aCwgIGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkLCBiZWNhdXNlRmlsZVVwZGF0ZWQpO1xuXG5cdFx0cmV0dXJuIHNuaXBwZXRzO1xuXHR9XG5cblxuXG4gIFxuICBcbiAgc2hvd1NuaXBwZXRzTG9hZGVkTm90aWNlKG5TbmlwcGV0czogbnVtYmVyLCBuU25pcHBldFZhcmlhYmxlczogbnVtYmVyLCBiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZDogYm9vbGVhbiwgYmVjYXVzZUZpbGVVcGRhdGVkOiBib29sZWFuKSB7XG5cdFx0aWYgKCEoYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQgfHwgYmVjYXVzZUZpbGVVcGRhdGVkKSlcblx0XHRcdHJldHVybjtcblxuXHRcdGNvbnN0IHByZWZpeCA9IGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID8gXCJMb2FkZWQgXCIgOiBcIlN1Y2Nlc3NmdWxseSByZWxvYWRlZCBcIjtcblx0XHRjb25zdCBib2R5ID0gW107XG5cblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSlcblx0XHRcdGJvZHkucHVzaChgJHtuU25pcHBldHN9IHNuaXBwZXRzYCk7XG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSlcblx0XHRcdGJvZHkucHVzaChgJHtuU25pcHBldFZhcmlhYmxlc30gc25pcHBldCB2YXJpYWJsZXNgKTtcblxuXHRcdGNvbnN0IHN1ZmZpeCA9IFwiIGZyb20gZmlsZXMuXCI7XG5cdFx0bmV3IE5vdGljZShwcmVmaXggKyBib2R5LmpvaW4oXCIgYW5kIFwiKSArIHN1ZmZpeCwgNTAwMCk7XG5cdH1cblxuXG5cbiAgd2F0Y2hGaWxlcygpIHtcblx0XHQvLyBPbmx5IGJlZ2luIHdhdGNoaW5nIGZpbGVzIG9uY2UgdGhlIGxheW91dCBpcyByZWFkeVxuXHRcdC8vIE90aGVyd2lzZSwgd2UnbGwgYmUgdW5uZWNlc3NhcmlseSByZWFjdGluZyB0byBtYW55IG9uRmlsZUNyZWF0ZSBldmVudHMgb2Ygc25pcHBldCBmaWxlc1xuXHRcdC8vIHRoYXQgb2NjdXIgd2hlbiBPYnNpZGlhbiBmaXJzdCBsb2Fkc1xuXG5cdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBldmVudHNBbmRDYWxsYmFja3MgPSB7XG5cdFx0XHRcdFwibW9kaWZ5XCI6IG9uRmlsZUNoYW5nZSxcblx0XHRcdFx0XCJkZWxldGVcIjogb25GaWxlRGVsZXRlLFxuXHRcdFx0XHRcImNyZWF0ZVwiOiBvbkZpbGVDcmVhdGVcblx0XHRcdH07XG4gICAgICAgXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhldmVudHNBbmRDYWxsYmFja3MpKSB7XG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKGtleSwgKGZpbGUpID0+IHZhbHVlKHRoaXMsIGZpbGUpKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBwcm9jZXNzTWF0aEJsb2NrKHNvdXJjZTogc3RyaW5nLCBtYWluQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICAgIFxuICBtYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWNvbnRhaW5lclwiKTtcbiAgXG4gIGNvbnN0IHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcbiAgbGV0IHNraXBwZWRJbmRleGVzID0gMDtcbiAgXG4gIGNvbnN0IGV4cHJlc3Npb25zID0gc291cmNlLnNwbGl0KFwiXFxuXCIpLm1hcChsaW5lID0+IGxpbmUucmVwbGFjZSgvW1xcc10rLywnJykudHJpbSgpKS5maWx0ZXIobGluZSA9PiBsaW5lICYmICFsaW5lLnN0YXJ0c1dpdGgoXCIvL1wiKSk7XG4gIGlmIChleHByZXNzaW9ucy5sZW5ndGggPT09IDApIHtyZXR1cm47fVxuXG4gIGV4cHJlc3Npb25zLmZvckVhY2goKGV4cHJlc3Npb24sIGluZGV4KSA9PiB7XG4gICAgbGV0IGxpbmVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICBsaW5lQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWxpbmUtY29udGFpbmVyXCIsIChpbmRleC1za2lwcGVkSW5kZXhlcykgJSAyID09PSAwID8gXCJtYXRoLXJvdy1ldmVuXCIgOiBcIm1hdGgtcm93LW9kZFwiKTtcbiAgICAvL2lmIChleHByZXNzaW9uLm1hdGNoKC9eXFwvXFwvLykpe31cbiAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xuICAgIHByb2Nlc3NNYXRoLmluaXRpYWxpemUoKTtcblxuICAgIGlmKHByb2Nlc3NNYXRoLm1vZGUhPT1cInZhcmlhYmxlXCIpe1xuICAgICAgbGluZUNvbnRhaW5lciA9IHByb2Nlc3NNYXRoLmNvbnRhaW5lciBhcyBIVE1MRGl2RWxlbWVudDtcbiAgICAgIG1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XG4gICAgfVxuICAgIGVsc2V7c2tpcHBlZEluZGV4ZXMrKzt9XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzVGlrekJsb2NrKHNvdXJjZTogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIHRyeXtcbiAgICBjb25zdCBhPW5ldyBGb3JtYXRUaWt6amF4KHNvdXJjZSx0cnVlKVxuICBjb25zb2xlLmxvZyhhKVxuICB9Y2F0Y2goZSl7XG4gICAgY29uc29sZS5lcnJvcihlKVxuICB9XG4gIFxuICBjb25zdCBzdmdDb250YWluZXIgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIHN0eWxlOiBcImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1wiXG4gIH0pO1xuICBzdmdDb250YWluZXIuYXBwZW5kQ2hpbGQoZHVtbXlGdW5jdGlvbigpKTtcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKHN2Z0NvbnRhaW5lcik7XG4gIGNvbnNvbGUubG9nKGJlYXV0aWZ5SFRNTChjb250YWluZXIuaW5uZXJIVE1MLCB7IGluZGVudF9zaXplOiAyIH0pKVxufVxuXG5cblxuZnVuY3Rpb24gZHVtbXlGdW5jdGlvbigpOlNWR1NWR0VsZW1lbnR7XG4gIFxuXG4gIGNvbnN0IHN2ZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsIFwic3ZnXCIpO1xuICBcbiAgY29uc3QgYm91bmRzPW5ldyBTdmdCb3VuZHMoKVxuICBjb25zdCBmdW5jID0gKHg6IG51bWJlcikgPT4geCAqIHg7XG4gIGNvbnN0IGFycj1bXVxuICBmb3IobGV0IGk9LTU7aTw9NTtpKyspe1xuICAgIGFyci5wdXNoKG5ldyBBeGlzKGksZnVuYyhpKSkpXG4gIH1cbiAgY29uc3QgcGF0aHMgPSBbXG4gICAgbmV3IFNWR3BhdGgoYXJyLCB7IHN0cm9rZTogXCJibGFja1wiLCBzdHJva2VXaWR0aDogMSB9KSxcbiAgICAvKm5ldyBTVkdwYXRoKFtuZXcgQXhpcygwLDMwKSxuZXcgQXhpcygxMDAsMzApXSwgeyBzdHJva2U6IFwiYmxhY2tcIiwgc3Ryb2tlV2lkdGg6IDEgfSksXG4gICAgbmV3IFNWR3BhdGgoW25ldyBBeGlzKDAsNjApLG5ldyBBeGlzKDEwMCw2MCldLCB7IHN0cm9rZTogXCJibGFja1wiLCBzdHJva2VXaWR0aDogMSB9KSxcbiAgICBuZXcgU1ZHcGF0aChbbmV3IEF4aXMoMCw5MCksbmV3IEF4aXMoMTAwLDkwKV0sIHsgc3Ryb2tlOiBcImJsYWNrXCIsIHN0cm9rZVdpZHRoOiAxIH0pLCovXG4gIF07XG4gIFxuICBwYXRocy5mb3JFYWNoKHA9PmJvdW5kcy5pbXByb3ZlQm91bmRzKHAuZ2V0Qm91bmRzKCkpKVxuICAvL2NvbnNvbGUubG9nKGJvdW5kcylcblxuICBzdmcuc2V0QXR0cmlidXRlKFwid2lkdGhcIiwgYCR7Ym91bmRzLmdldFdpZHRoKCl9YCk7XG4gIHN2Zy5zZXRBdHRyaWJ1dGUoXCJoZWlnaHRcIiwgYCR7Ym91bmRzLmdldEhlaWdodCgpfWApO1xuICAvL3N2Zy5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCBibGFja1wiO1xuICBwYXRocy5mb3JFYWNoKHBhdGggPT4gc3ZnLmFwcGVuZENoaWxkKHBhdGgudG9FbGVtZW50KGJvdW5kcykpKTtcbiAgcmV0dXJuIHN2Z1xufVxuXG5cbmV4cG9ydCBjbGFzcyBTdmdCb3VuZHN7XG4gIG1pbjogQXhpcztcbiAgbWF4OiBBeGlzO1xuXG4gIGNvbnN0cnVjdG9yKG1pbj86IEF4aXMsbWF4PzogQXhpcyl7XG4gICAgdGhpcy5taW49bWluPz9uZXcgQXhpcygpO1xuICAgIHRoaXMubWF4PW1heD8/bmV3IEF4aXMoKTtcbiAgfVxuICBpbXByb3ZlQm91bmRzKGF4aXM6IEF4aXMgfCBTdmdCb3VuZHMpOiB2b2lkIHtcbiAgICBjb25zdCB1cGRhdGVCb3VuZHMgPSAodmFsdWU6IG51bWJlciwgbWluPzogbnVtYmVyLCBtYXg/OiBudW1iZXIpOiBbbnVtYmVyLCBudW1iZXJdID0+IHtcbiAgICAgIHJldHVybiBbTWF0aC5taW4odmFsdWUsIG1pbj8/SW5maW5pdHkpLCBNYXRoLm1heCh2YWx1ZSwgbWF4Pz8tSW5maW5pdHkpXTtcbiAgICB9O1xuICAgIGNvbnN0IGltcHJvdmVXaXRoQXhpcyA9IChpbnB1dEF4aXM6IEF4aXMpOiB2b2lkID0+IHtcbiAgICAgIGNvbnN0IHsgY2FydGVzaWFuWDogeCwgY2FydGVzaWFuWTogeSB9ID0gaW5wdXRBeGlzO1xuICAgICAgW3RoaXMubWluLmNhcnRlc2lhblgsIHRoaXMubWF4LmNhcnRlc2lhblhdID0gdXBkYXRlQm91bmRzKHgsIHRoaXMubWluPy5jYXJ0ZXNpYW5YLCB0aGlzLm1heD8uY2FydGVzaWFuWCk7XG4gICAgICBbdGhpcy5taW4uY2FydGVzaWFuWSwgdGhpcy5tYXguY2FydGVzaWFuWV0gPSB1cGRhdGVCb3VuZHMoeSwgdGhpcy5taW4/LmNhcnRlc2lhblksIHRoaXMubWF4Py5jYXJ0ZXNpYW5ZKTtcbiAgICB9O1xuICAgIGNvbnN0IGltcHJvdmVXaXRoQm91bmRzID0gKGlucHV0Qm91bmRzOiBTdmdCb3VuZHMpOiB2b2lkID0+IHtcbiAgICAgIGltcHJvdmVXaXRoQXhpcyhpbnB1dEJvdW5kcy5taW4pO1xuICAgICAgaW1wcm92ZVdpdGhBeGlzKGlucHV0Qm91bmRzLm1heCk7XG4gICAgfTtcbiAgICBpZiAoYXhpcyBpbnN0YW5jZW9mIFN2Z0JvdW5kcykge1xuICAgICAgaW1wcm92ZVdpdGhCb3VuZHMoYXhpcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGltcHJvdmVXaXRoQXhpcyhheGlzIGFzIEF4aXMpO1xuICAgIH1cbiAgfVxuICBnZXRXaWR0aCgpe3JldHVybiBNYXRoLmFicyh0aGlzLm1heC5jYXJ0ZXNpYW5YLXRoaXMubWluLmNhcnRlc2lhblgpfVxuICBnZXRIZWlnaHQoKXtyZXR1cm4gTWF0aC5hYnModGhpcy5tYXguY2FydGVzaWFuWS10aGlzLm1pbi5jYXJ0ZXNpYW5ZKX1cbiAgY29tcGFyZShvdGhlcjogU3ZnQm91bmRzKXtcbiAgICBcbiAgfVxuICBjbG9uZSgpe1xuICAgIHJldHVybiBuZXcgU3ZnQm91bmRzKHRoaXMubWluLHRoaXMubWF4KVxuICB9XG4gIHN0YXRpYyBpbXByb3ZlZEJvdW5kcygpe1xuXG4gIH1cbn1cbmNsYXNzIG1hdGhGdW5jdGlvbntcbiAgeUludGVyc2VjdDogQXhpcztcbiAgeEludGVyc2VjdHM6IEF4aXNbXTtcblxufVxuXG5jbGFzcyBTVkdwYXRoIHtcbiAgYXhlczogQXhpc1tdO1xuICBmb3JtYXR0aW5nOiB7IHN0cm9rZT86IHN0cmluZywgc3Ryb2tlV2lkdGg/OiBudW1iZXIsIGZpbGw/OiBzdHJpbmcgfTtcbiAgXG4gIGNvbnN0cnVjdG9yKGNvb3JkaW5hdGVzOiBBeGlzW10sIGZvcm1hdHRpbmc6IHsgc3Ryb2tlPzogc3RyaW5nLCBzdHJva2VXaWR0aD86IG51bWJlciwgZmlsbD86IHN0cmluZyB9ID0ge30pIHtcbiAgICAgIHRoaXMuYXhlcyA9IGNvb3JkaW5hdGVzO1xuICAgICAgdGhpcy5mb3JtYXR0aW5nID0gZm9ybWF0dGluZztcbiAgfVxuICBnZXRCb3VuZHMoKXtcbiAgICBjb25zdCBib3VuZHM9bmV3IFN2Z0JvdW5kcygpXG4gICAgdGhpcy5heGVzLmZvckVhY2goYXhpcyA9PiB7XG4gICAgICBib3VuZHMuaW1wcm92ZUJvdW5kcyhheGlzKTtcbiAgICB9KTtcbiAgICByZXR1cm4gYm91bmRzO1xuICB9XG4gIHRvRWxlbWVudChib3VuZHM6IFN2Z0JvdW5kcyk6IFNWR1BhdGhFbGVtZW50IHtcbiAgICAgIGNvbnN0IHBhdGhFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKFwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiwgXCJwYXRoXCIpO1xuICAgICAgY29uc3QgcGF0aERhdGEgPSB0aGlzLmF4ZXMubWFwKChjb29yZCwgaW5kZXgpID0+IHtcbiAgICAgICAgICBjb25zdCBjb21tYW5kID0gaW5kZXggPT09IDAgPyAnTScgOiAnTCc7XG4gICAgICAgICAgcmV0dXJuIGAke2NvbW1hbmR9ICR7Y29vcmQudG9TdHJpbmdTVkcoYm91bmRzKX1gO1xuICAgICAgfSkuam9pbignICcpICsgJyBaJztcblxuICAgICAgcGF0aEVsZW1lbnQuc2V0QXR0cmlidXRlKFwiZFwiLCBwYXRoRGF0YSk7XG5cbiAgICAgIGlmICh0aGlzLmZvcm1hdHRpbmcuc3Ryb2tlKSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJzdHJva2VcIiwgdGhpcy5mb3JtYXR0aW5nLnN0cm9rZSk7XG4gICAgICBpZiAodGhpcy5mb3JtYXR0aW5nLnN0cm9rZVdpZHRoKSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJzdHJva2Utd2lkdGhcIiwgdGhpcy5mb3JtYXR0aW5nLnN0cm9rZVdpZHRoLnRvU3RyaW5nKCkpO1xuICAgICAgaWYgKHRoaXMuZm9ybWF0dGluZy5maWxsKSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJmaWxsXCIsIHRoaXMuZm9ybWF0dGluZy5maWxsKTtcbiAgICAgIGVsc2UgcGF0aEVsZW1lbnQuc2V0QXR0cmlidXRlKFwiZmlsbFwiLCBcIm5vbmVcIik7XG5cbiAgICAgIHJldHVybiBwYXRoRWxlbWVudDtcbiAgfVxufVxuXG5cblxuXG5jbGFzcyBQcm9jZXNzTWF0aCB7XG4gIG1hdGhJbnB1dDogYW55O1xuICB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XG4gIG1vZGUgPSBcIm1hdGhcIjtcbiAgcmVzdWx0OiBhbnk7XG4gIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG4gIGljb25zRGl2OiBIVE1MRWxlbWVudDtcbiAgYXBwOiBBcHA7XG5cbiAgY29uc3RydWN0b3IobWF0aElucHV0OiBzdHJpbmcsdXNlclZhcmlhYmxlczogYW55LCBhcHA6IEFwcCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xuICAgIHRoaXMudXNlclZhcmlhYmxlcz11c2VyVmFyaWFibGVzO1xuICAgIHRoaXMuYXBwID0gYXBwO1xuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuICAgIHRoaXMuaWNvbnNEaXYgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWljb25zXCIsXG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBpbml0aWFsaXplKCkge1xuICAgIHRoaXMuYXNzaWduTW9kZSgpO1xuICAgIHRoaXMuc2V0dXBDb250YWluZXIoKTtcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xuICAgIHRoaXMuY2FsY3VsYXRlTWF0aCgpO1xuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cENvbnRhaW5lcigpIHtcbiAgICBbXCJtYXRoLWlucHV0XCIsIFwibWF0aC1yZXN1bHRcIl0uZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGRpdi5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG4gICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xuICAgIH0pO1xuICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuaWNvbnNEaXYpO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVNYXRoKCkge1xuICAgIGNvbnN0IGlucHV0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLWlucHV0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XG4gICAgdHJ5IHtcbiAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIGNvbnN0IGJpbm9tTW9kZWwgPSBuZXcgQmlub21JbmZvTW9kZWwodGhpcy5hcHAsIHRoaXMubWF0aElucHV0KTtcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IGJpbm9tTW9kZWwuZ2V0RXF1YWwoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcImNvc1wiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIGNvbnN0IFsgLCBzaWRlQSwgc2lkZUIsIHNpZGVDIF0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoTnVtYmVyKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInZlY1wiOlxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xuICAgICAgICAgIHRoaXMucmVzdWx0PW5ldyBWZWNQcm9jZXNzb3IodGhpcy5tYXRoSW5wdXRbMV0sdGhpcy5tYXRoSW5wdXRbMl0sdGhpcy5tYXRoSW5wdXRbM10pO1xuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyB0aWt6R3JhcGgodGhpcy5hcHAsIHRoaXMucmVzdWx0LmdyYXBoKSk7XG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xuICAgICAgICAgIHRoaXMucmVzdWx0PXRoaXMucmVzdWx0LnJlc3VsdFxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IG5ldyBNYXRoUHJhaXNlcih0aGlzLm1hdGhJbnB1dCk7XG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8pKTtcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xuICAgICAgICAgIHRoaXMubWF0aElucHV0PXRoaXMucmVzdWx0LmlucHV0O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICB0aGlzLmFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2LCByZXN1bHREaXYsIHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCI/dGhpcy5tYXRoSW5wdXQ6dGhpcy5tYXRoSW5wdXRbMF0sIHRoaXMucmVzdWx0Lypyb3VuZEJ5U2V0dGluZ3ModGhpcy5yZXN1bHQpKi8pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgdGhpcy5kaXNwbGF5RXJyb3IoaW5wdXREaXYsIHJlc3VsdERpdiwgZXJyKTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaGUgaW5pdGlhbCBwcmFpc2luZyBmYWlsZWRcIixlcnIpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBpbnB1dDogc3RyaW5nLCByZXN1bHQ6IGFueSkge1xuICAgIGlucHV0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoaW5wdXQsdHJ1ZSkpXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCR7JHtpbnB1dH19JGAsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xuICAgIC8vY29uc3QgcmVzdWx0T3V0cHV0ID0gLyh0cnVlfGZhbHNlKS8udGVzdChyZXN1bHQpID8gcmVzdWx0IDogYFxcJHske3Jlc3VsdH19JGA7XG4gICAgcmVzdWx0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoU3RyaW5nKHJvdW5kQnlTZXR0aW5ncyhyZXN1bHQuc29sdXRpb25Ub1N0cmluZygpKSksdHJ1ZSkpXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHJlc3VsdE91dHB1dCwgcmVzdWx0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xuICB9XG5cbiAgcHJpdmF0ZSBkaXNwbGF5RXJyb3IoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBlcnI6IEVycm9yKSB7XG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bih0aGlzLm1hdGhJbnB1dCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj4ke2Vyci5tZXNzYWdlfTwvc3Bhbj5gO1xuICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWVycm9yLWxpbmVcIik7XG4gIH1cblxuICBwcml2YXRlIGFzc2lnbk1vZGUoKSB7XG4gICAgY29uc3QgcmVnZXhMaXN0ID0gR2V0TWF0aENvbnRleHRSZWdleCgpO1xuICAgIGNvbnN0IG1hdGNoT2JqZWN0ID0gcmVnZXhMaXN0LmZpbmQocmVnZXhPYmogPT4gcmVnZXhPYmoucmVnZXgudGVzdCh0aGlzLm1hdGhJbnB1dCkpO1xuICAgIGlmIChtYXRjaE9iamVjdCkge1xuICAgICAgdGhpcy5tb2RlID0gbWF0Y2hPYmplY3QudmFsdWU7XG4gICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0Lm1hdGNoKG1hdGNoT2JqZWN0LnJlZ2V4KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFkZEluZm9Nb2RhbChtb2RhbDogYW55KSB7XG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtaW5mby1pY29uXCIsXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXG4gICAgfSk7XG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XG4gIH1cblxuICBwcml2YXRlIGFkZERlYnVnTW9kZWwobW9kYWw6IGFueSkge1xuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcbiAgICAgIHRleHRDb250ZW50OiBcIvCfkJ5cIixcbiAgICB9KTtcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVzKCkge1xuICAgIGlmICh0aGlzLm1vZGU9PT1cInZhcmlhYmxlXCIpIHtcbiAgICAgIHRoaXMuaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKSB7XG4gICAgY29uc3QgW18sdmFyaWFibGUsIHZhbHVlXSA9IHRoaXMubWF0aElucHV0Lm1hcCgocGFydDogc3RyaW5nKSA9PiBwYXJ0LnRyaW0oKSk7XG4gICAgaWYgKCF2YXJpYWJsZSB8fCAhdmFsdWUpIHtcbiAgICAgIGNvbnNvbGUud2FybihgSW52YWxpZCB2YXJpYWJsZSBkZWNsYXJhdGlvbjogJHt0aGlzLm1hdGhJbnB1dH1gKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgZXhpc3RpbmdWYXJJbmRleCA9IHRoaXMudXNlclZhcmlhYmxlcy5maW5kSW5kZXgodiA9PiB2LnZhcmlhYmxlID09PSB2YXJpYWJsZSk7XG4gICAgaWYgKGV4aXN0aW5nVmFySW5kZXggIT09IC0xKSB7XG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXNbZXhpc3RpbmdWYXJJbmRleF0udmFsdWUgPSB2YWx1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy51c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZSwgdmFsdWUgfSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCl7XG4gICAgdGhpcy51c2VyVmFyaWFibGVzLmZvckVhY2goKHsgdmFyaWFibGUsIHZhbHVlIH0pID0+IHtcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5yZXBsYWNlKHZhcmlhYmxlLCB2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBHZXRNYXRoQ29udGV4dFJlZ2V4KCkge1xuICByZXR1cm4gW1xuICAgIHsgcmVnZXg6IC9iaW5vbVxcKChcXGQrKSwoXFxkKyksKFxcZCspXFwpLywgdmFsdWU6IFwiYmlub21cIiB9LFxuICAgIHsgcmVnZXg6IC92ZWMoWystXXswLDJ9KVxcKChbXFxkListXStbOixdW1xcZC4rLV0rKVxcKShbXFxkListXSopLywgdmFsdWU6IFwidmVjXCIgfSxcbiAgICB7IHJlZ2V4OiAvY29zXFwoKFtcXGQuXSspLChbXFxkLl0rKSwoW1xcZC5dKylcXCkvLCB2YWx1ZTogXCJjb3NcIiB9LFxuICAgIHsgcmVnZXg6IC92YXJcXHMqKFtcXHddKylcXHMqPVxccyooW1xcZC5dKykvLCB2YWx1ZTogXCJ2YXJpYWJsZVwiIH0sXG4gIF07XG59XG5cblxuY2xhc3MgVmVjUHJvY2Vzc29yIHtcbiAgdXNlcklucHV0OiBhbnk7XG4gIGVudmlyb25tZW50OiB7IFg6IHN0cmluZzsgWTogc3RyaW5nIH07XG4gIHZlY0luZm8gPSBuZXcgTWF0aEluZm8oKTtcbiAgYXhpczogQXhpcztcbiAgbW9kaWZpZXI6IG51bWJlcjtcbiAgcmVzdWx0OiBzdHJpbmc7XG4gIGdyYXBoPzogYW55O1xuXG4gIGNvbnN0cnVjdG9yKGVudmlyb25tZW50OiBzdHJpbmcsIG1hdGhJbnB1dDogc3RyaW5nLCBtb2RpZmllcjogc3RyaW5nKSB7XG4gICAgdGhpcy51c2VySW5wdXQ9bWF0aElucHV0O1xuICAgIGNvbnN0IG1hdGNoID0gZW52aXJvbm1lbnQubWF0Y2goLyhbKy1dPykoWystXT8pLyk7XG4gICAgdGhpcy5lbnZpcm9ubWVudCA9IHsgWDogbWF0Y2g/LlsxXSA/PyBcIitcIiwgWTogbWF0Y2g/LlsyXSA/PyBcIitcIiB9O1xuXG4gICAgdGhpcy5tb2RpZmllciA9IG1vZGlmaWVyLmxlbmd0aCA+IDAgPyBnZXRVc2FibGVEZWdyZWVzKE51bWJlcihtb2RpZmllcikpIDogMDtcblxuICAgIHRoaXMuYXhpcz1uZXcgQXhpcygpLnVuaXZlcnNhbCh0aGlzLnVzZXJJbnB1dClcbiAgICBpZiAoIXRoaXMuYXhpcy5wb2xhckFuZ2xlKVxuICAgICAgdGhpcy5heGlzLmNhcnRlc2lhblRvUG9sYXIoKTtcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiYXhpc1wiLHRoaXMuYXhpcyk7XG4gICAgdGhpcy5hZGRSZXN1bHQoKTtcbiAgICB0aGlzLmFkZEdyYXBoKCk7XG4gIH1cbiAgYWRkUmVzdWx0KCl7XG4gICAgaWYgKHRoaXMudXNlcklucHV0LmluY2x1ZGVzKFwiOlwiKSlcbiAgICAgIHRoaXMucmVzdWx0PWB4ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWH1cXFxccXVhZCx5ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWX1gXG4gICAgZWxzZVxuICAgICAgdGhpcy5yZXN1bHQ9YGFuZ2xlID0gJHt0aGlzLmF4aXMucG9sYXJBbmdsZX1cXFxccXVhZCxsZW5ndGggPSAke3RoaXMuYXhpcy5wb2xhckxlbmd0aH1gXG4gIH1cbiAgYWRkR3JhcGgoKSB7XG4gICAgY29uc3QgdGFyZ2V0U2l6ZSA9IDEwO1xuICAgIGNvbnN0IG1heENvbXBvbmVudCA9IE1hdGgubWF4KE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YKSwgTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblkpKTtcblxuICAgIC8vIERldGVybWluZSBzY2FsaW5nIGZhY3RvclxuICAgIGxldCBzY2FsZSA9IDE7XG4gICAgaWYgKG1heENvbXBvbmVudCA8IHRhcmdldFNpemUpIHtcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcbiAgICB9IGVsc2UgaWYgKG1heENvbXBvbmVudCA+IHRhcmdldFNpemUpIHtcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcbiAgICB9XG4gICAgLy8gaSBuZWVkIHRvIG1ha2UgaXQgXCJ0byBYIGF4aXNcIlxuICAgIC8vY29uc3QgdmVjdG9yQW5nbGUgPSBnZXRVc2FibGVEZWdyZWVzKHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuMihzY2FsZWRZLCBzY2FsZWRYKSkpO1xuICAgIFxuICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKDAsMCk7XG5cblxuICAgLy8gY29uc3QgZHJhdz0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMucG9sYXJMZW5ndGgudG9TdHJpbmcoKX0pLHRoaXMuYXhpc107XG4gICAgLy9jb25zdCBkcmF3WD0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWC50b1N0cmluZygpfSksbmV3IEF4aXModGhpcy5heGlzLmNhcnRlc2lhblgsMCldO1xuICAgIC8vY29uc3QgZHJhd1k9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblkudG9TdHJpbmcoKX0pLG5ldyBBeGlzKDAsdGhpcy5heGlzLmNhcnRlc2lhblkpXTtcblxuICAgIHRoaXMuZ3JhcGg9W1xuICAgICAgLy9uZXcgRm9ybWF0dGluZyhcImdsb2JvbFwiLHtjb2xvcjogXCJ3aGl0ZVwiLHNjYWxlOiAxLH0pLFxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhdyxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwicmVkXCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhd1gsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdZLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXG4gICAgXVxuICAgIFxuICAgIFxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b2tlbnMsbnVsbCwxKSk7XG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGgudG9TdHJpbmcoKVxcblwiLEpTT04uc3RyaW5naWZ5KHRoaXMuZ3JhcGgudG9TdHJpbmcoKSkpO1xuICAgIC8qIEdlbmVyYXRlIExhVGVYIGNvZGUgZm9yIHZlY3RvciBjb21wb25lbnRzIGFuZCBtYWluIHZlY3RvclxuICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxuXG4gICAgICAlIEFuZ2xlIEFubm90YXRpb25cbiAgICAgICVcXGFuZ3tYfXthbmN9e3ZlY317fXske3JvdW5kQnlTZXR0aW5ncyh2ZWN0b3JBbmdsZSl9JF57XFxjaXJjfSR9XG4gICAgYC5yZXBsYWNlKC9eXFxzKy9nbSwgXCJcIik7Ki9cbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiU2NhbGluZyBmYWN0b3JcIiwgc2NhbGUpO1xuICB9XG59XG5cblxuXG5jbGFzcyB0aWt6R3JhcGggZXh0ZW5kcyBNb2RhbCB7XG4gIHRpa3o6IEZvcm1hdFRpa3pqYXg7XG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLHRpa3pDb2RlOiBhbnkpe1xuICAgIHN1cGVyKGFwcCk7XG4gICAgdGhpcy50aWt6PW5ldyBGb3JtYXRUaWt6amF4KHRpa3pDb2RlKTtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb25zdCBjb2RlPXRoaXMudGlrejtcbiAgICBjb25zdCBzY3JpcHQgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcbiAgICBzY3JpcHQuc2V0VGV4dChjb2RlLmdldENvZGUodGhpcy5hcHApKTtcbiAgICBcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcblxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6LmdldENvZGUodGhpcy5hcHApKTtcbiAgICAgIG5ldyBOb3RpY2UoXCJHcmFwaCBjb3BpZWQgdG8gY2xpcGJvYXJkIVwiKTtcbiAgICB9KTtcbiAgfVxuICBvbkNsb3NlKCk6IHZvaWQge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gIH1cbn1cblxuXG5cbmNsYXNzIEJpbm9tSW5mb01vZGVsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG46IG51bWJlcjtcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XG4gIHByaXZhdGUgcDogbnVtYmVyO1xuICBwcml2YXRlIGVxdWFsID0gMDtcbiAgcHJpdmF0ZSBsZXNzID0gMDtcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xuICBwcml2YXRlIGJpZyA9IDA7XG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuayA9IGs7XG4gICAgdGhpcy5wID0gcDtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xuICB9XG5cbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgIH1cbiAgfVxufVxuXG5cblxuXG5cblxuZnVuY3Rpb24gdGVzdE1hdGhFbmdpbmUoKXtcbiAgY29uc3QgZXhwcmVzc2lvbnM9W1xuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YDIgXFxmcmFjeyg1LTMpMzR9e1xcc3FydHsyXnsyfX19MC41YCxleHBlY3RlZE91dHB1dDogJzM0J30sXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgKHgrMSkoeCszKT0yYCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMC4yNjc5NSx4XzI9LTMuNzMyMDUnfSxcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2BcXGZyYWN7MTMyfXsxMjYwK3heezJ9fT0wLjA1YCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMzcuMTQ4MzUseF8yPTM3LjE0ODM1J30sXG4gIF1cbiAgY29uc3QgcmVzdWx0cz1bXVxuICB0cnl7XG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaChleHByZXNzaW9uID0+IHtcbiAgICAgIGNvbnN0IG1hdGg9bmV3IE1hdGhQcmFpc2VyKGV4cHJlc3Npb24uZXhwcmVzc2lvbik7XG4gICAgICBpZiAobWF0aC5zb2x1dGlvbiE9PWV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQpe1xuICAgICAgICByZXN1bHRzLnB1c2goe2V4cHJlc3Npb246IGV4cHJlc3Npb24uZXhwcmVzc2lvbixleHBlY3RlZE91dHB1dDogZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCxhY3R1YWxPdXRwdXQ6IG1hdGguc29sdXRpb259KVxuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIGNhdGNoKGUpe1xuICAgIGNvbnNvbGUubG9nKGUpXG4gIH1cbn1cblxuXG5cblxuIl19