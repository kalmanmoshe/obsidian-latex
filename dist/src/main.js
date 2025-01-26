//git reset --hard #Undo all changes
//git fetch --all #Don't use unless necessity. It will overwrite all local changes
//git branch #Check current branch
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLG9DQUFvQztBQUNwQyxrRkFBa0Y7QUFDbEYsa0NBQWtDO0FBRWxDLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQUMsT0FBTyxFQUFPLEtBQUssRUFBRSxTQUFTLEVBQVUsTUFBTSxFQUFrQixXQUFXLEVBQUMsVUFBVSxFQUE2RyxNQUFNLFVBQVUsQ0FBQztBQUNyUCxPQUFPLEVBQUUsSUFBSSxJQUFJLFlBQVksRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUNuRCxPQUFPLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDdkQsT0FBTyxFQUEyQixnQkFBZ0IsRUFBd0IseUJBQXlCLEVBQUMsTUFBTSxxQkFBcUIsQ0FBQztBQUNoSSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsY0FBYyxFQUFvQixxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBc0MsZUFBZSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDOUssT0FBTyxFQUFFLElBQUksRUFBZ0MsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFaEYsT0FBTyxFQUFZLElBQUksRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQ25ELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUd2RSxPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLHFCQUFxQixFQUFFLCtCQUErQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUssT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTVDLE9BQU8sRUFB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YyxFQUFFLElBQUksRUFBQztRQUNoRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLGNBQWMsRUFBQyxjQUFjLEVBQUUsMkJBQTJCLEVBQUM7UUFDbEYsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSw2QkFBNkIsRUFBQyxjQUFjLEVBQUUsNEJBQTRCLEVBQUM7S0FDbkcsQ0FBQTtJQUNELE1BQU0sT0FBTyxHQUFDLEVBQUUsQ0FBQTtJQUNoQixJQUFHLENBQUM7UUFDRixXQUFXLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQy9CLE1BQU0sSUFBSSxHQUFDLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsRCxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUcsVUFBVSxDQUFDLGNBQWMsRUFBQyxDQUFDO2dCQUM3QyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxVQUFVLEVBQUMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxjQUFjLEVBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUMsQ0FBQyxDQUFBO1lBQ3pILENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFNLENBQUMsRUFBQyxDQUFDO1FBQ1AsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNoQixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vZ2l0IHJlc2V0IC0taGFyZCAjVW5kbyBhbGwgY2hhbmdlc1xyXG4vL2dpdCBmZXRjaCAtLWFsbCAjRG9uJ3QgdXNlIHVubGVzcyBuZWNlc3NpdHkuIEl0IHdpbGwgb3ZlcndyaXRlIGFsbCBsb2NhbCBjaGFuZ2VzXHJcbi8vZ2l0IGJyYW5jaCAjQ2hlY2sgY3VycmVudCBicmFuY2hcclxuXHJcbmltcG9ydCB7UGx1Z2luLCBNYXJrZG93blJlbmRlcmVyLGFkZEljb24sIEFwcCwgTW9kYWwsIENvbXBvbmVudCwgU2V0dGluZyxOb3RpY2UsIFdvcmtzcGFjZVdpbmRvdyxsb2FkTWF0aEpheCxyZW5kZXJNYXRoLCBNYXJrZG93blZpZXcsIEVkaXRvclN1Z2dlc3QsIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbywgRWRpdG9yUG9zaXRpb24sIEVkaXRvciwgVEZpbGUsIEVkaXRvclN1Z2dlc3RDb250ZXh0fSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IHsgaHRtbCBhcyBiZWF1dGlmeUhUTUwgfSBmcm9tICdqcy1iZWF1dGlmeSc7XHJcbmltcG9ydCB7IE1hdGhJbmZvLCBNYXRoUHJhaXNlciB9IGZyb20gXCIuL21hdGhQYXJzZXIvbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcclxuaW1wb3J0IHtMYXRleFN1aXRlUGx1Z2luU2V0dGluZ3MsIERFRkFVTFRfU0VUVElOR1MsIExhdGV4U3VpdGVDTVNldHRpbmdzLCBwcm9jZXNzTGF0ZXhTdWl0ZVNldHRpbmdzfSBmcm9tIFwiLi9zZXR0aW5ncy9zZXR0aW5nc1wiO1xyXG5pbXBvcnQgeyBMYXRleFN1aXRlU2V0dGluZ1RhYiB9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzX3RhYlwiO1xyXG5pbXBvcnQgeyBjYWxjdWxhdGVCaW5vbSwgZGVncmVlc1RvUmFkaWFucywgZmluZEFuZ2xlQnlDb3NpbmVSdWxlLCBnZXRVc2FibGVEZWdyZWVzLCBwb2xhclRvQ2FydGVzaWFuLCByYWRpYW5zVG9EZWdyZWVzLCByb3VuZEJ5U2V0dGluZ3MgfSBmcm9tIFwic3JjL21hdGhQYXJzZXIvbWF0aFV0aWxpdGllc1wiO1xyXG5pbXBvcnQgeyBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCBUaWt6amF4IH0gZnJvbSBcIi4vdGlrempheC90aWt6amF4XCI7XHJcblxyXG5pbXBvcnQge0V4dGVuc2lvbiwgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBGb3JtYXRUaWt6amF4IH0gZnJvbSBcIi4vdGlrempheC9pbnRlcnByZXQvdG9rZW5pemVUaWt6amF4LmpzXCI7XHJcblxyXG5cclxuaW1wb3J0IHsgb25GaWxlQ3JlYXRlLCBvbkZpbGVDaGFuZ2UsIG9uRmlsZURlbGV0ZSwgZ2V0U25pcHBldHNGcm9tRmlsZXMsIGdldEZpbGVTZXRzLCBnZXRWYXJpYWJsZXNGcm9tRmlsZXMsIHRyeUdldFZhcmlhYmxlc0Zyb21Vbmtub3duRmlsZXMgfSBmcm9tIFwiLi9zZXR0aW5ncy9maWxlX3dhdGNoXCI7XHJcbmltcG9ydCB7IElDT05TIH0gZnJvbSBcIi4vc2V0dGluZ3MvdWkvaWNvbnNcIjtcclxuXHJcbmltcG9ydCB7IGdldEVkaXRvckNvbW1hbmRzIH0gZnJvbSBcIi4vZmVhdHVyZXMvZWRpdG9yX2NvbW1hbmRzXCI7XHJcbmltcG9ydCB7IFNuaXBwZXRWYXJpYWJsZXMsIHBhcnNlU25pcHBldFZhcmlhYmxlcywgcGFyc2VTbmlwcGV0cyB9IGZyb20gXCIuL3NuaXBwZXRzL3BhcnNlXCI7XHJcbmltcG9ydCB7IExhdGV4UmVuZGVyIH0gZnJvbSBcIi4vbGF0ZXhSZW5kZXIvbWFpblwiO1xyXG5pbXBvcnQgeyB0YWJzdG9wc1N0YXRlRmllbGQgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL3RhYnN0b3BzX3N0YXRlX2ZpZWxkXCI7XHJcbmltcG9ydCB7IHNuaXBwZXRRdWV1ZVN0YXRlRmllbGQgfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL3NuaXBwZXRfcXVldWVfc3RhdGVfZmllbGRcIjtcclxuaW1wb3J0IHsgc25pcHBldEludmVydGVkRWZmZWN0cyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvaGlzdG9yeVwiO1xyXG5cclxuaW1wb3J0IHsgRWRpdG9yVmlldywgVmlld1BsdWdpbiwgVmlld1VwZGF0ZSAsRGVjb3JhdGlvbiwgdG9vbHRpcHMsIH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgSHRtbEJhY2tncm91bmRQbHVnaW4sIHJ0bEZvcmNlUGx1Z2luIH0gZnJvbSBcIi4vZWRpdG9yRGVjb3JhdGlvbnNcIjtcclxuXHJcbmltcG9ydCB7IGdldExhdGV4U3VpdGVDb25maWcsIGdldExhdGV4U3VpdGVDb25maWdFeHRlbnNpb24gfSBmcm9tIFwiLi9zbmlwcGV0cy9jb2RlbWlycm9yL2NvbmZpZ1wiO1xyXG5pbXBvcnQgeyBzbmlwcGV0RXh0ZW5zaW9ucyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvZXh0ZW5zaW9uc1wiO1xyXG5pbXBvcnQgeyBjb2xvclBhaXJlZEJyYWNrZXRzUGx1Z2luLCBjb2xvclBhaXJlZEJyYWNrZXRzUGx1Z2luTG93ZXN0UHJlYywgaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNQbHVnaW4gfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9oaWdobGlnaHRfYnJhY2tldHNcIjtcclxuaW1wb3J0IHsgbWtDb25jZWFsUGx1Z2luIH0gZnJvbSBcIi4vZWRpdG9yX2V4dGVuc2lvbnMvY29uY2VhbFwiO1xyXG5pbXBvcnQgeyBjdXJzb3JUb29sdGlwQmFzZVRoZW1lLCBjdXJzb3JUb29sdGlwRmllbGQsIGhhbmRsZU1hdGhUb29sdGlwIH0gZnJvbSBcIi4vZWRpdG9yX2V4dGVuc2lvbnMvbWF0aF90b29sdGlwXCI7XHJcbmltcG9ydCB7IG9uQ2xpY2ssIG9uS2V5ZG93biwgb25Nb3ZlLCBvblNjcm9sbCwgb25UcmFuc2FjdGlvbiB9IGZyb20gXCIuLyBpbnB1dE1vbml0b3JzXCI7XHJcblxyXG4vLyBpIHdhbnQgdG8gbWFrZSBzb21lIGNvZGUgdGhhdCB3aWxsIG91dG8gaW5zb3QgbWV0YWRhdGEgdG8gZmlsbGxzXHJcblxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9zaGUgZXh0ZW5kcyBQbHVnaW4ge1xyXG4gIHNldHRpbmdzOiBMYXRleFN1aXRlUGx1Z2luU2V0dGluZ3M7XHJcblx0Q01TZXR0aW5nczogTGF0ZXhTdWl0ZUNNU2V0dGluZ3M7XHJcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxyXG4gIGVkaXRvckV4dGVuc2lvbnM6IEV4dGVuc2lvbltdPVtdO1xyXG5cclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICBjb25zb2xlLmxvZyhcIm5ldyBsb2RcIilcclxuICAgIC8vbmV3IExhdGV4UmVuZGVyKHRoaXMuYXBwLHRoaXMpXHJcblxyXG4gICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcclxuXHRcdHRoaXMubG9hZEljb25zKCk7XHJcblx0XHR0aGlzLmFkZFNldHRpbmdUYWIobmV3IExhdGV4U3VpdGVTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XHJcblx0XHRsb2FkTWF0aEpheCgpO1xyXG5cclxuXHRcdC8vIFJlZ2lzdGVyIExhdGV4IFN1aXRlIGV4dGVuc2lvbnMgYW5kIG9wdGlvbmFsIGVkaXRvciBleHRlbnNpb25zIGZvciBlZGl0b3IgZW5oYW5jZW1lbnRzXHJcblx0XHQvL3RoaXMucmVnaXN0ZXJFZGl0b3JFeHRlbnNpb24odGhpcy5lZGl0b3JFeHRlbnNpb25zKTtcclxuXHJcblx0XHQvLyBXYXRjaCBmb3IgY2hhbmdlcyB0byB0aGUgc25pcHBldCB2YXJpYWJsZXMgYW5kIHNuaXBwZXRzIGZpbGVzXHJcblx0XHR0aGlzLndhdGNoRmlsZXMoKTtcclxuXHJcblx0XHR0aGlzLmFkZEVkaXRvckNvbW1hbmRzKCk7XHJcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3I9bmV3IFRpa3pqYXgodGhpcy5hcHAsdGhpcylcclxuICAgIHRoaXMudGlrelByb2Nlc3Nvci5yZWFkeUxheW91dCgpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLmFkZFN5bnRheEhpZ2hsaWdodGluZygpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlZ2lzdGVyVGlrekNvZGVCbG9jaygpO1xyXG4gICAgXHJcbiAgICB0aGlzLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJtYXRoLWVuZ2luZVwiLCBwcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrempheFwiLCBwcm9jZXNzVGlrekJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgXHJcbiAgfVxyXG4gIHNldEVkaXRvckV4dGVuc2lvbnMoKSB7XHJcblx0XHR3aGlsZSAodGhpcy5lZGl0b3JFeHRlbnNpb25zLmxlbmd0aCkgdGhpcy5lZGl0b3JFeHRlbnNpb25zLnBvcCgpO1xyXG5cdFx0XHJcblx0XHR0aGlzLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXHJcblx0XHRcdGdldExhdGV4U3VpdGVDb25maWdFeHRlbnNpb24odGhpcy5DTVNldHRpbmdzKSxcclxuXHRcdFx0UHJlYy5oaWdoZXN0KEVkaXRvclZpZXcuZG9tRXZlbnRIYW5kbGVycyh7IFwia2V5ZG93blwiOiBvbktleWRvd24gfSkpLFxyXG4gICAgICBQcmVjLmRlZmF1bHQoRWRpdG9yVmlldy5kb21FdmVudEhhbmRsZXJzKHtcInNjcm9sbFwiOiBvblNjcm9sbCwgXCJjbGlja1wiOiBvbkNsaWNrLCBcIm1vdXNlbW92ZVwiOiBvbk1vdmUgfSkpLFxyXG4gICAgICBQcmVjLmxvd2VzdChbY29sb3JQYWlyZWRCcmFja2V0c1BsdWdpbi5leHRlbnNpb24sIHJ0bEZvcmNlUGx1Z2luLmV4dGVuc2lvbixIdG1sQmFja2dyb3VuZFBsdWdpbi5leHRlbnNpb25dKSxcclxuICAgICAgRWRpdG9yVmlldy51cGRhdGVMaXN0ZW5lci5vZihvblRyYW5zYWN0aW9uKSxcclxuXHRcdFx0c25pcHBldEV4dGVuc2lvbnMsXHJcblxyXG5cdFx0XHRoaWdobGlnaHRDdXJzb3JCcmFja2V0c1BsdWdpbi5leHRlbnNpb24sXHJcblx0XHRcdGN1cnNvclRvb2x0aXBGaWVsZC5leHRlbnNpb24sXHJcblx0XHRcdGN1cnNvclRvb2x0aXBCYXNlVGhlbWUsXHJcblxyXG4gICAgICB0YWJzdG9wc1N0YXRlRmllbGQuZXh0ZW5zaW9uLFxyXG5cdFx0XHRzbmlwcGV0UXVldWVTdGF0ZUZpZWxkLmV4dGVuc2lvbixcclxuXHRcdFx0c25pcHBldEludmVydGVkRWZmZWN0cyxcclxuXHRcdFx0dG9vbHRpcHMoeyBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiIH0pLFxyXG5cdFx0XSk7XHJcblxyXG5cdFx0aWYgKHRoaXMuQ01TZXR0aW5ncy5jb25jZWFsRW5hYmxlZCkge1xyXG5cdFx0XHRjb25zdCB0aW1lb3V0ID0gdGhpcy5DTVNldHRpbmdzLmNvbmNlYWxSZXZlYWxUaW1lb3V0O1xyXG5cdFx0XHR0aGlzLmVkaXRvckV4dGVuc2lvbnMucHVzaChta0NvbmNlYWxQbHVnaW4odGltZW91dCkuZXh0ZW5zaW9uKTtcclxuXHRcdH1cclxuXHJcblx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKHRoaXMuZWRpdG9yRXh0ZW5zaW9ucy5mbGF0KCkpO1xyXG5cdH1cclxuXHJcbiAgYWRkRWRpdG9yQ29tbWFuZHMoKSB7XHJcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgZ2V0RWRpdG9yQ29tbWFuZHModGhpcykpIHtcclxuXHRcdFx0dGhpcy5hZGRDb21tYW5kKGNvbW1hbmQpO1xyXG5cdFx0fVxyXG5cdH1cclxuICBvbnVubG9hZCgpIHtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpO1xyXG5cdH1cclxuXHJcbiAgYXN5bmMgZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKSB7XHJcblx0XHR0cnkge1xyXG5cdFx0XHRyZXR1cm4gYXdhaXQgcGFyc2VTbmlwcGV0cyh0aGlzLnNldHRpbmdzLnNuaXBwZXRzLCBzbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGxvYWQgc25pcHBldHMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRyZXR1cm4gW107XHJcblx0XHR9XHJcblx0fVxyXG5cclxuXHJcbiAgbG9hZEljb25zKCkge1xyXG4gICAgZm9yIChjb25zdCBbaWNvbklkLCBzdmdDb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhJQ09OUykpIHtcclxuICAgICAgYWRkSWNvbihpY29uSWQsIHN2Z0NvbnRlbnQpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgbG9hZFNldHRpbmdzKCkge1xyXG4gICAgbGV0IGRhdGEgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XHJcblxyXG4gICAgLy8gTWlncmF0ZSBzZXR0aW5ncyBmcm9tIHYxLjguMCAtIHYxLjguNFxyXG4gICAgY29uc3Qgc2hvdWxkTWlncmF0ZVNldHRpbmdzID0gZGF0YSA/IFwiYmFzaWNTZXR0aW5nc1wiIGluIGRhdGEgOiBmYWxzZTtcclxuXHJcbiAgICAvLyBAdHMtaWdub3JlXHJcbiAgICBmdW5jdGlvbiBtaWdyYXRlU2V0dGluZ3Mob2xkU2V0dGluZ3MpIHtcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICAuLi5vbGRTZXR0aW5ncy5iYXNpY1NldHRpbmdzLFxyXG4gICAgICAgIC4uLm9sZFNldHRpbmdzLnJhd1NldHRpbmdzLFxyXG4gICAgICAgIHNuaXBwZXRzOiBvbGRTZXR0aW5ncy5zbmlwcGV0cyxcclxuICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoc2hvdWxkTWlncmF0ZVNldHRpbmdzKSB7XHJcbiAgICAgIGRhdGEgPSBtaWdyYXRlU2V0dGluZ3MoZGF0YSk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGRhdGEpO1xyXG5cclxuXHJcbiAgICBpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSB8fCB0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpIHtcclxuICAgICAgY29uc3QgdGVtcFNuaXBwZXRWYXJpYWJsZXMgPSBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpO1xyXG4gICAgICBjb25zdCB0ZW1wU25pcHBldHMgPSBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldHModGVtcFNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cclxuICAgICAgdGhpcy5DTVNldHRpbmdzID0gcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5ncyh0ZW1wU25pcHBldHMsIHRoaXMuc2V0dGluZ3MpO1xyXG5cclxuICAgICAgLy8gVXNlIG9uTGF5b3V0UmVhZHkgc28gdGhhdCB3ZSBkb24ndCB0cnkgdG8gcmVhZCB0aGUgc25pcHBldHMgZmlsZSB0b28gZWFybHlcclxuICAgICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMucHJvY2Vzc1NldHRpbmdzKCk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgIGF3YWl0IHRoaXMucHJvY2Vzc1NldHRpbmdzKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBzYXZlU2V0dGluZ3MoZGlkRmlsZUxvY2F0aW9uQ2hhbmdlID0gZmFsc2UpIHtcclxuXHRcdGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcblx0XHR0aGlzLnByb2Nlc3NTZXR0aW5ncyhkaWRGaWxlTG9jYXRpb25DaGFuZ2UpO1xyXG5cdH1cclxuXHJcbiAgYXN5bmMgcHJvY2Vzc1NldHRpbmdzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID0gZmFsc2UsIGJlY2F1c2VGaWxlVXBkYXRlZCA9IGZhbHNlKSB7XHJcblx0XHR0aGlzLkNNU2V0dGluZ3MgPSBwcm9jZXNzTGF0ZXhTdWl0ZVNldHRpbmdzKGF3YWl0IHRoaXMuZ2V0U25pcHBldHMoYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQsIGJlY2F1c2VGaWxlVXBkYXRlZCksIHRoaXMuc2V0dGluZ3MpO1xyXG4gICAgdGhpcy5zZXRFZGl0b3JFeHRlbnNpb25zKCk7XHJcblx0XHR0aGlzLmFwcC53b3Jrc3BhY2UudXBkYXRlT3B0aW9ucygpO1xyXG5cdH1cclxuICBcclxuICBhc3luYyBnZXRTZXR0aW5nc1NuaXBwZXRWYXJpYWJsZXMoKSB7XHJcblx0XHR0cnkge1xyXG5cdFx0XHRyZXR1cm4gYXdhaXQgcGFyc2VTbmlwcGV0VmFyaWFibGVzKHRoaXMuc2V0dGluZ3Muc25pcHBldFZhcmlhYmxlcyk7XHJcblx0XHR9IGNhdGNoIChlKSB7XHJcblx0XHRcdG5ldyBOb3RpY2UoYEZhaWxlZCB0byBsb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gc2V0dGluZ3M6ICR7ZX1gKTtcclxuXHRcdFx0Y29uc29sZS5sb2coYEZhaWxlZCB0byBsb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gc2V0dGluZ3M6ICR7ZX1gKTtcclxuXHRcdFx0cmV0dXJuIHt9O1xyXG5cdFx0fVxyXG5cdH1cclxuICBhc3luYyBnZXRTbmlwcGV0cyhiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZDogYm9vbGVhbiwgYmVjYXVzZUZpbGVVcGRhdGVkOiBib29sZWFuKSB7XHJcblx0XHQvLyBHZXQgZmlsZXMgaW4gc25pcHBldC92YXJpYWJsZSBmb2xkZXJzLlxyXG5cdFx0Ly8gSWYgZWl0aGVyIGlzIHNldCB0byBiZSBsb2FkZWQgZnJvbSBzZXR0aW5ncyB0aGUgc2V0IHdpbGwganVzdCBiZSBlbXB0eS5cclxuXHRcdGNvbnN0IGZpbGVzID0gZ2V0RmlsZVNldHModGhpcyk7XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldFZhcmlhYmxlcyA9XHJcblx0XHRcdHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZVxyXG5cdFx0XHRcdD8gYXdhaXQgZ2V0VmFyaWFibGVzRnJvbUZpbGVzKHRoaXMsIGZpbGVzKVxyXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRWYXJpYWJsZXMoKTtcclxuXHJcblx0XHQvLyBUaGlzIG11c3QgYmUgZG9uZSBpbiBlaXRoZXIgY2FzZSwgYmVjYXVzZSBpdCBhbHNvIHVwZGF0ZXMgdGhlIHNldCBvZiBzbmlwcGV0IGZpbGVzXHJcblx0XHRjb25zdCB1bmtub3duRmlsZVZhcmlhYmxlcyA9IGF3YWl0IHRyeUdldFZhcmlhYmxlc0Zyb21Vbmtub3duRmlsZXModGhpcywgZmlsZXMpO1xyXG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSkge1xyXG5cdFx0XHQvLyBCdXQgd2Ugb25seSB1c2UgdGhlIHZhbHVlcyBpZiB0aGUgdXNlciB3YW50cyB0aGVtXHJcblx0XHRcdE9iamVjdC5hc3NpZ24oc25pcHBldFZhcmlhYmxlcywgdW5rbm93bkZpbGVWYXJpYWJsZXMpO1xyXG5cdFx0fVxyXG5cclxuXHRcdGNvbnN0IHNuaXBwZXRzID1cclxuXHRcdFx0dGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZVxyXG5cdFx0XHRcdD8gYXdhaXQgZ2V0U25pcHBldHNGcm9tRmlsZXModGhpcywgZmlsZXMsIHNuaXBwZXRWYXJpYWJsZXMpXHJcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldHMoc25pcHBldFZhcmlhYmxlcyk7XHJcblx0XHR0aGlzLnNob3dTbmlwcGV0c0xvYWRlZE5vdGljZShzbmlwcGV0cy5sZW5ndGgsIE9iamVjdC5rZXlzKHNuaXBwZXRWYXJpYWJsZXMpLmxlbmd0aCwgIGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkLCBiZWNhdXNlRmlsZVVwZGF0ZWQpO1xyXG5cclxuXHRcdHJldHVybiBzbmlwcGV0cztcclxuXHR9XHJcblxyXG5cclxuXHJcbiAgXHJcbiAgXHJcbiAgc2hvd1NuaXBwZXRzTG9hZGVkTm90aWNlKG5TbmlwcGV0czogbnVtYmVyLCBuU25pcHBldFZhcmlhYmxlczogbnVtYmVyLCBiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZDogYm9vbGVhbiwgYmVjYXVzZUZpbGVVcGRhdGVkOiBib29sZWFuKSB7XHJcblx0XHRpZiAoIShiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCB8fCBiZWNhdXNlRmlsZVVwZGF0ZWQpKVxyXG5cdFx0XHRyZXR1cm47XHJcblxyXG5cdFx0Y29uc3QgcHJlZml4ID0gYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQgPyBcIkxvYWRlZCBcIiA6IFwiU3VjY2Vzc2Z1bGx5IHJlbG9hZGVkIFwiO1xyXG5cdFx0Y29uc3QgYm9keSA9IFtdO1xyXG5cclxuXHRcdGlmICh0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlKVxyXG5cdFx0XHRib2R5LnB1c2goYCR7blNuaXBwZXRzfSBzbmlwcGV0c2ApO1xyXG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSlcclxuXHRcdFx0Ym9keS5wdXNoKGAke25TbmlwcGV0VmFyaWFibGVzfSBzbmlwcGV0IHZhcmlhYmxlc2ApO1xyXG5cclxuXHRcdGNvbnN0IHN1ZmZpeCA9IFwiIGZyb20gZmlsZXMuXCI7XHJcblx0XHRuZXcgTm90aWNlKHByZWZpeCArIGJvZHkuam9pbihcIiBhbmQgXCIpICsgc3VmZml4LCA1MDAwKTtcclxuXHR9XHJcblxyXG5cclxuXHJcbiAgd2F0Y2hGaWxlcygpIHtcclxuXHRcdC8vIE9ubHkgYmVnaW4gd2F0Y2hpbmcgZmlsZXMgb25jZSB0aGUgbGF5b3V0IGlzIHJlYWR5XHJcblx0XHQvLyBPdGhlcndpc2UsIHdlJ2xsIGJlIHVubmVjZXNzYXJpbHkgcmVhY3RpbmcgdG8gbWFueSBvbkZpbGVDcmVhdGUgZXZlbnRzIG9mIHNuaXBwZXQgZmlsZXNcclxuXHRcdC8vIHRoYXQgb2NjdXIgd2hlbiBPYnNpZGlhbiBmaXJzdCBsb2Fkc1xyXG5cclxuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcclxuXHJcblx0XHRcdGNvbnN0IGV2ZW50c0FuZENhbGxiYWNrcyA9IHtcclxuXHRcdFx0XHRcIm1vZGlmeVwiOiBvbkZpbGVDaGFuZ2UsXHJcblx0XHRcdFx0XCJkZWxldGVcIjogb25GaWxlRGVsZXRlLFxyXG5cdFx0XHRcdFwiY3JlYXRlXCI6IG9uRmlsZUNyZWF0ZVxyXG5cdFx0XHR9O1xyXG4gICAgICAgXHJcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGV2ZW50c0FuZENhbGxiYWNrcykpIHtcclxuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXHJcblx0XHRcdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKGtleSwgKGZpbGUpID0+IHZhbHVlKHRoaXMsIGZpbGUpKSk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHByb2Nlc3NNYXRoQmxvY2soc291cmNlOiBzdHJpbmcsIG1haW5Db250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBcclxuICBtYWluQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWNvbnRhaW5lclwiKTtcclxuICBcclxuICBjb25zdCB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgbGV0IHNraXBwZWRJbmRleGVzID0gMDtcclxuICBcclxuICBjb25zdCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKS5tYXAobGluZSA9PiBsaW5lLnJlcGxhY2UoL1tcXHNdKy8sJycpLnRyaW0oKSkuZmlsdGVyKGxpbmUgPT4gbGluZSAmJiAhbGluZS5zdGFydHNXaXRoKFwiLy9cIikpO1xyXG4gIGlmIChleHByZXNzaW9ucy5sZW5ndGggPT09IDApIHtyZXR1cm47fVxyXG5cclxuICBleHByZXNzaW9ucy5mb3JFYWNoKChleHByZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgbGV0IGxpbmVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGxpbmVDb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtbGluZS1jb250YWluZXJcIiwgKGluZGV4LXNraXBwZWRJbmRleGVzKSAlIDIgPT09IDAgPyBcIm1hdGgtcm93LWV2ZW5cIiA6IFwibWF0aC1yb3ctb2RkXCIpO1xyXG4gICAgLy9pZiAoZXhwcmVzc2lvbi5tYXRjaCgvXlxcL1xcLy8pKXt9XHJcbiAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xyXG4gICAgcHJvY2Vzc01hdGguaW5pdGlhbGl6ZSgpO1xyXG5cclxuICAgIGlmKHByb2Nlc3NNYXRoLm1vZGUhPT1cInZhcmlhYmxlXCIpe1xyXG4gICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xyXG4gICAgICBtYWluQ29udGFpbmVyLmFwcGVuZENoaWxkKGxpbmVDb250YWluZXIpO1xyXG4gICAgfVxyXG4gICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cclxuICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gcHJvY2Vzc1Rpa3pCbG9jayhzb3VyY2U6IHN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gIHRyeXtcclxuICAgIGNvbnN0IGE9bmV3IEZvcm1hdFRpa3pqYXgoc291cmNlLHRydWUpXHJcbiAgY29uc29sZS5sb2coYSlcclxuICB9Y2F0Y2goZSl7XHJcbiAgICBjb25zb2xlLmVycm9yKGUpXHJcbiAgfVxyXG4gIFxyXG4gIGNvbnN0IHN2Z0NvbnRhaW5lciA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBzdHlsZTogXCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjtcIlxyXG4gIH0pO1xyXG4gIHN2Z0NvbnRhaW5lci5hcHBlbmRDaGlsZChkdW1teUZ1bmN0aW9uKCkpO1xyXG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZChzdmdDb250YWluZXIpO1xyXG4gIGNvbnNvbGUubG9nKGJlYXV0aWZ5SFRNTChjb250YWluZXIuaW5uZXJIVE1MLCB7IGluZGVudF9zaXplOiAyIH0pKVxyXG59XHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGR1bW15RnVuY3Rpb24oKTpTVkdTVkdFbGVtZW50e1xyXG4gIFxyXG5cclxuICBjb25zdCBzdmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoXCJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Z1wiLCBcInN2Z1wiKTtcclxuICBcclxuICBjb25zdCBib3VuZHM9bmV3IFN2Z0JvdW5kcygpXHJcbiAgY29uc3QgZnVuYyA9ICh4OiBudW1iZXIpID0+IHggKiB4O1xyXG4gIGNvbnN0IGFycj1bXVxyXG4gIGZvcihsZXQgaT0tNTtpPD01O2krKyl7XHJcbiAgICBhcnIucHVzaChuZXcgQXhpcyhpLGZ1bmMoaSkpKVxyXG4gIH1cclxuICBjb25zdCBwYXRocyA9IFtcclxuICAgIG5ldyBTVkdwYXRoKGFyciwgeyBzdHJva2U6IFwiYmxhY2tcIiwgc3Ryb2tlV2lkdGg6IDEgfSksXHJcbiAgICAvKm5ldyBTVkdwYXRoKFtuZXcgQXhpcygwLDMwKSxuZXcgQXhpcygxMDAsMzApXSwgeyBzdHJva2U6IFwiYmxhY2tcIiwgc3Ryb2tlV2lkdGg6IDEgfSksXHJcbiAgICBuZXcgU1ZHcGF0aChbbmV3IEF4aXMoMCw2MCksbmV3IEF4aXMoMTAwLDYwKV0sIHsgc3Ryb2tlOiBcImJsYWNrXCIsIHN0cm9rZVdpZHRoOiAxIH0pLFxyXG4gICAgbmV3IFNWR3BhdGgoW25ldyBBeGlzKDAsOTApLG5ldyBBeGlzKDEwMCw5MCldLCB7IHN0cm9rZTogXCJibGFja1wiLCBzdHJva2VXaWR0aDogMSB9KSwqL1xyXG4gIF07XHJcbiAgXHJcbiAgcGF0aHMuZm9yRWFjaChwPT5ib3VuZHMuaW1wcm92ZUJvdW5kcyhwLmdldEJvdW5kcygpKSlcclxuICAvL2NvbnNvbGUubG9nKGJvdW5kcylcclxuXHJcbiAgc3ZnLnNldEF0dHJpYnV0ZShcIndpZHRoXCIsIGAke2JvdW5kcy5nZXRXaWR0aCgpfWApO1xyXG4gIHN2Zy5zZXRBdHRyaWJ1dGUoXCJoZWlnaHRcIiwgYCR7Ym91bmRzLmdldEhlaWdodCgpfWApO1xyXG4gIC8vc3ZnLnN0eWxlLmJvcmRlciA9IFwiMXB4IHNvbGlkIGJsYWNrXCI7XHJcbiAgcGF0aHMuZm9yRWFjaChwYXRoID0+IHN2Zy5hcHBlbmRDaGlsZChwYXRoLnRvRWxlbWVudChib3VuZHMpKSk7XHJcbiAgcmV0dXJuIHN2Z1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFN2Z0JvdW5kc3tcclxuICBtaW46IEF4aXM7XHJcbiAgbWF4OiBBeGlzO1xyXG5cclxuICBjb25zdHJ1Y3RvcihtaW4/OiBBeGlzLG1heD86IEF4aXMpe1xyXG4gICAgdGhpcy5taW49bWluPz9uZXcgQXhpcygpO1xyXG4gICAgdGhpcy5tYXg9bWF4Pz9uZXcgQXhpcygpO1xyXG4gIH1cclxuICBpbXByb3ZlQm91bmRzKGF4aXM6IEF4aXMgfCBTdmdCb3VuZHMpOiB2b2lkIHtcclxuICAgIGNvbnN0IHVwZGF0ZUJvdW5kcyA9ICh2YWx1ZTogbnVtYmVyLCBtaW4/OiBudW1iZXIsIG1heD86IG51bWJlcik6IFtudW1iZXIsIG51bWJlcl0gPT4ge1xyXG4gICAgICByZXR1cm4gW01hdGgubWluKHZhbHVlLCBtaW4/P0luZmluaXR5KSwgTWF0aC5tYXgodmFsdWUsIG1heD8/LUluZmluaXR5KV07XHJcbiAgICB9O1xyXG4gICAgY29uc3QgaW1wcm92ZVdpdGhBeGlzID0gKGlucHV0QXhpczogQXhpcyk6IHZvaWQgPT4ge1xyXG4gICAgICBjb25zdCB7IGNhcnRlc2lhblg6IHgsIGNhcnRlc2lhblk6IHkgfSA9IGlucHV0QXhpcztcclxuICAgICAgW3RoaXMubWluLmNhcnRlc2lhblgsIHRoaXMubWF4LmNhcnRlc2lhblhdID0gdXBkYXRlQm91bmRzKHgsIHRoaXMubWluPy5jYXJ0ZXNpYW5YLCB0aGlzLm1heD8uY2FydGVzaWFuWCk7XHJcbiAgICAgIFt0aGlzLm1pbi5jYXJ0ZXNpYW5ZLCB0aGlzLm1heC5jYXJ0ZXNpYW5ZXSA9IHVwZGF0ZUJvdW5kcyh5LCB0aGlzLm1pbj8uY2FydGVzaWFuWSwgdGhpcy5tYXg/LmNhcnRlc2lhblkpO1xyXG4gICAgfTtcclxuICAgIGNvbnN0IGltcHJvdmVXaXRoQm91bmRzID0gKGlucHV0Qm91bmRzOiBTdmdCb3VuZHMpOiB2b2lkID0+IHtcclxuICAgICAgaW1wcm92ZVdpdGhBeGlzKGlucHV0Qm91bmRzLm1pbik7XHJcbiAgICAgIGltcHJvdmVXaXRoQXhpcyhpbnB1dEJvdW5kcy5tYXgpO1xyXG4gICAgfTtcclxuICAgIGlmIChheGlzIGluc3RhbmNlb2YgU3ZnQm91bmRzKSB7XHJcbiAgICAgIGltcHJvdmVXaXRoQm91bmRzKGF4aXMpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaW1wcm92ZVdpdGhBeGlzKGF4aXMgYXMgQXhpcyk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIGdldFdpZHRoKCl7cmV0dXJuIE1hdGguYWJzKHRoaXMubWF4LmNhcnRlc2lhblgtdGhpcy5taW4uY2FydGVzaWFuWCl9XHJcbiAgZ2V0SGVpZ2h0KCl7cmV0dXJuIE1hdGguYWJzKHRoaXMubWF4LmNhcnRlc2lhblktdGhpcy5taW4uY2FydGVzaWFuWSl9XHJcbiAgY29tcGFyZShvdGhlcjogU3ZnQm91bmRzKXtcclxuICAgIFxyXG4gIH1cclxuICBjbG9uZSgpe1xyXG4gICAgcmV0dXJuIG5ldyBTdmdCb3VuZHModGhpcy5taW4sdGhpcy5tYXgpXHJcbiAgfVxyXG4gIHN0YXRpYyBpbXByb3ZlZEJvdW5kcygpe1xyXG5cclxuICB9XHJcbn1cclxuY2xhc3MgbWF0aEZ1bmN0aW9ue1xyXG4gIHlJbnRlcnNlY3Q6IEF4aXM7XHJcbiAgeEludGVyc2VjdHM6IEF4aXNbXTtcclxuXHJcbn1cclxuXHJcbmNsYXNzIFNWR3BhdGgge1xyXG4gIGF4ZXM6IEF4aXNbXTtcclxuICBmb3JtYXR0aW5nOiB7IHN0cm9rZT86IHN0cmluZywgc3Ryb2tlV2lkdGg/OiBudW1iZXIsIGZpbGw/OiBzdHJpbmcgfTtcclxuICBcclxuICBjb25zdHJ1Y3Rvcihjb29yZGluYXRlczogQXhpc1tdLCBmb3JtYXR0aW5nOiB7IHN0cm9rZT86IHN0cmluZywgc3Ryb2tlV2lkdGg/OiBudW1iZXIsIGZpbGw/OiBzdHJpbmcgfSA9IHt9KSB7XHJcbiAgICAgIHRoaXMuYXhlcyA9IGNvb3JkaW5hdGVzO1xyXG4gICAgICB0aGlzLmZvcm1hdHRpbmcgPSBmb3JtYXR0aW5nO1xyXG4gIH1cclxuICBnZXRCb3VuZHMoKXtcclxuICAgIGNvbnN0IGJvdW5kcz1uZXcgU3ZnQm91bmRzKClcclxuICAgIHRoaXMuYXhlcy5mb3JFYWNoKGF4aXMgPT4ge1xyXG4gICAgICBib3VuZHMuaW1wcm92ZUJvdW5kcyhheGlzKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIGJvdW5kcztcclxuICB9XHJcbiAgdG9FbGVtZW50KGJvdW5kczogU3ZnQm91bmRzKTogU1ZHUGF0aEVsZW1lbnQge1xyXG4gICAgICBjb25zdCBwYXRoRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUyhcImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIsIFwicGF0aFwiKTtcclxuICAgICAgY29uc3QgcGF0aERhdGEgPSB0aGlzLmF4ZXMubWFwKChjb29yZCwgaW5kZXgpID0+IHtcclxuICAgICAgICAgIGNvbnN0IGNvbW1hbmQgPSBpbmRleCA9PT0gMCA/ICdNJyA6ICdMJztcclxuICAgICAgICAgIHJldHVybiBgJHtjb21tYW5kfSAke2Nvb3JkLnRvU3RyaW5nU1ZHKGJvdW5kcyl9YDtcclxuICAgICAgfSkuam9pbignICcpICsgJyBaJztcclxuXHJcbiAgICAgIHBhdGhFbGVtZW50LnNldEF0dHJpYnV0ZShcImRcIiwgcGF0aERhdGEpO1xyXG5cclxuICAgICAgaWYgKHRoaXMuZm9ybWF0dGluZy5zdHJva2UpIHBhdGhFbGVtZW50LnNldEF0dHJpYnV0ZShcInN0cm9rZVwiLCB0aGlzLmZvcm1hdHRpbmcuc3Ryb2tlKTtcclxuICAgICAgaWYgKHRoaXMuZm9ybWF0dGluZy5zdHJva2VXaWR0aCkgcGF0aEVsZW1lbnQuc2V0QXR0cmlidXRlKFwic3Ryb2tlLXdpZHRoXCIsIHRoaXMuZm9ybWF0dGluZy5zdHJva2VXaWR0aC50b1N0cmluZygpKTtcclxuICAgICAgaWYgKHRoaXMuZm9ybWF0dGluZy5maWxsKSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJmaWxsXCIsIHRoaXMuZm9ybWF0dGluZy5maWxsKTtcclxuICAgICAgZWxzZSBwYXRoRWxlbWVudC5zZXRBdHRyaWJ1dGUoXCJmaWxsXCIsIFwibm9uZVwiKTtcclxuXHJcbiAgICAgIHJldHVybiBwYXRoRWxlbWVudDtcclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmNsYXNzIFByb2Nlc3NNYXRoIHtcclxuICBtYXRoSW5wdXQ6IGFueTtcclxuICB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgbW9kZSA9IFwibWF0aFwiO1xyXG4gIHJlc3VsdDogYW55O1xyXG4gIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XHJcbiAgaWNvbnNEaXY6IEhUTUxFbGVtZW50O1xyXG4gIGFwcDogQXBwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihtYXRoSW5wdXQ6IHN0cmluZyx1c2VyVmFyaWFibGVzOiBhbnksIGFwcDogQXBwLCBjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XHJcbiAgICB0aGlzLm1hdGhJbnB1dCA9IG1hdGhJbnB1dDtcclxuICAgIHRoaXMudXNlclZhcmlhYmxlcz11c2VyVmFyaWFibGVzO1xyXG4gICAgdGhpcy5hcHAgPSBhcHA7XHJcbiAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcclxuICAgIHRoaXMuaWNvbnNEaXYgPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtaWNvbnNcIixcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcclxuICAgIHRoaXMuYXNzaWduTW9kZSgpO1xyXG4gICAgdGhpcy5zZXR1cENvbnRhaW5lcigpO1xyXG4gICAgdGhpcy5oYW5kbGVWYXJpYWJsZXMoKTtcclxuICAgIHRoaXMuY2FsY3VsYXRlTWF0aCgpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBzZXR1cENvbnRhaW5lcigpIHtcclxuICAgIFtcIm1hdGgtaW5wdXRcIiwgXCJtYXRoLXJlc3VsdFwiXS5mb3JFYWNoKGNsYXNzTmFtZSA9PiB7XHJcbiAgICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgIGRpdi5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XHJcbiAgICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGRpdik7XHJcbiAgICB9KTtcclxuICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuaWNvbnNEaXYpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjYWxjdWxhdGVNYXRoKCkge1xyXG4gICAgY29uc3QgaW5wdXREaXYgPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFwiLm1hdGgtaW5wdXRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICBjb25zdCByZXN1bHREaXYgPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFwiLm1hdGgtcmVzdWx0XCIpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgdHJ5IHtcclxuICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcclxuICAgICAgICBjYXNlIFwiYmlub21cIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgY29uc3QgYmlub21Nb2RlbCA9IG5ldyBCaW5vbUluZm9Nb2RlbCh0aGlzLmFwcCwgdGhpcy5tYXRoSW5wdXQpO1xyXG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwoYmlub21Nb2RlbCk7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IGJpbm9tTW9kZWwuZ2V0RXF1YWwoKTtcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJjb3NcIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgY29uc3QgWyAsIHNpZGVBLCBzaWRlQiwgc2lkZUMgXSA9IHRoaXMubWF0aElucHV0Lm1hcChOdW1iZXIpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9ZmluZEFuZ2xlQnlDb3NpbmVSdWxlKHNpZGVBLCBzaWRlQiwgc2lkZUMpXHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidmVjXCI6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIHRoaXMucmVzdWx0PW5ldyBWZWNQcm9jZXNzb3IodGhpcy5tYXRoSW5wdXRbMV0sdGhpcy5tYXRoSW5wdXRbMl0sdGhpcy5tYXRoSW5wdXRbM10pO1xyXG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IHRpa3pHcmFwaCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQuZ3JhcGgpKTtcclxuICAgICAgICAgIHRoaXMuYWRkRGVidWdNb2RlbChuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQudmVjSW5mby5kZWJ1Z0luZm8pKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0PXRoaXMucmVzdWx0LnJlc3VsdFxyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICB0aGlzLnJlc3VsdCA9IG5ldyBNYXRoUHJhaXNlcih0aGlzLm1hdGhJbnB1dCk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgSW5mb01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5tYXRoSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5tYXRoSW5mby5kZWJ1Z0luZm8pKTtcclxuICAgICAgICAgIHRoaXMubWF0aElucHV0PXRoaXMucmVzdWx0LmlucHV0O1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgIH1cclxuICAgICB0aGlzLmFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2LCByZXN1bHREaXYsIHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCI/dGhpcy5tYXRoSW5wdXQ6dGhpcy5tYXRoSW5wdXRbMF0sIHRoaXMucmVzdWx0Lypyb3VuZEJ5U2V0dGluZ3ModGhpcy5yZXN1bHQpKi8pO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIHRoaXMuZGlzcGxheUVycm9yKGlucHV0RGl2LCByZXN1bHREaXYsIGVycik7XHJcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaGUgaW5pdGlhbCBwcmFpc2luZyBmYWlsZWRcIixlcnIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGlucHV0OiBzdHJpbmcsIHJlc3VsdDogYW55KSB7XHJcbiAgICBpbnB1dERpdi5hcHBlbmRDaGlsZChyZW5kZXJNYXRoKGlucHV0LHRydWUpKVxyXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKGBcXCR7JHtpbnB1dH19JGAsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gICAgLy9jb25zdCByZXN1bHRPdXRwdXQgPSAvKHRydWV8ZmFsc2UpLy50ZXN0KHJlc3VsdCkgPyByZXN1bHQgOiBgXFwkeyR7cmVzdWx0fX0kYDtcclxuICAgIHJlc3VsdERpdi5hcHBlbmRDaGlsZChyZW5kZXJNYXRoKFN0cmluZyhyb3VuZEJ5U2V0dGluZ3MocmVzdWx0LnNvbHV0aW9uVG9TdHJpbmcoKSkpLHRydWUpKVxyXG4gICAgLy9NYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHJlc3VsdE91dHB1dCwgcmVzdWx0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBkaXNwbGF5RXJyb3IoaW5wdXREaXY6IEhUTUxFbGVtZW50LCByZXN1bHREaXY6IEhUTUxFbGVtZW50LCBlcnI6IEVycm9yKSB7XHJcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHRoaXMubWF0aElucHV0LCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICAgIHJlc3VsdERpdi5pbm5lckhUTUwgPSBgPHNwYW4gY2xhc3M9XCJlcnJvci10ZXh0XCI+JHtlcnIubWVzc2FnZX08L3NwYW4+YDtcclxuICAgIHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWVycm9yLWxpbmVcIik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFzc2lnbk1vZGUoKSB7XHJcbiAgICBjb25zdCByZWdleExpc3QgPSBHZXRNYXRoQ29udGV4dFJlZ2V4KCk7XHJcbiAgICBjb25zdCBtYXRjaE9iamVjdCA9IHJlZ2V4TGlzdC5maW5kKHJlZ2V4T2JqID0+IHJlZ2V4T2JqLnJlZ2V4LnRlc3QodGhpcy5tYXRoSW5wdXQpKTtcclxuICAgIGlmIChtYXRjaE9iamVjdCkge1xyXG4gICAgICB0aGlzLm1vZGUgPSBtYXRjaE9iamVjdC52YWx1ZTtcclxuICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5tYXRjaChtYXRjaE9iamVjdC5yZWdleCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZEluZm9Nb2RhbChtb2RhbDogYW55KSB7XHJcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWluZm8taWNvblwiLFxyXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgICB9KTtcclxuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcclxuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZERlYnVnTW9kZWwobW9kYWw6IGFueSkge1xyXG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICAgIHRleHRDb250ZW50OiBcIvCfkJ5cIixcclxuICAgIH0pO1xyXG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xyXG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVzKCkge1xyXG4gICAgaWYgKHRoaXMubW9kZT09PVwidmFyaWFibGVcIikge1xyXG4gICAgICB0aGlzLmhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMucmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCkge1xyXG4gICAgY29uc3QgW18sdmFyaWFibGUsIHZhbHVlXSA9IHRoaXMubWF0aElucHV0Lm1hcCgocGFydDogc3RyaW5nKSA9PiBwYXJ0LnRyaW0oKSk7XHJcbiAgICBpZiAoIXZhcmlhYmxlIHx8ICF2YWx1ZSkge1xyXG4gICAgICBjb25zb2xlLndhcm4oYEludmFsaWQgdmFyaWFibGUgZGVjbGFyYXRpb246ICR7dGhpcy5tYXRoSW5wdXR9YCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGNvbnN0IGV4aXN0aW5nVmFySW5kZXggPSB0aGlzLnVzZXJWYXJpYWJsZXMuZmluZEluZGV4KHYgPT4gdi52YXJpYWJsZSA9PT0gdmFyaWFibGUpO1xyXG4gICAgaWYgKGV4aXN0aW5nVmFySW5kZXggIT09IC0xKSB7XHJcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlc1tleGlzdGluZ1ZhckluZGV4XS52YWx1ZSA9IHZhbHVlO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy51c2VyVmFyaWFibGVzLnB1c2goeyB2YXJpYWJsZSwgdmFsdWUgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKXtcclxuICAgIHRoaXMudXNlclZhcmlhYmxlcy5mb3JFYWNoKCh7IHZhcmlhYmxlLCB2YWx1ZSB9KSA9PiB7XHJcbiAgICAgIGlmICh0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0LnJlcGxhY2UodmFyaWFibGUsIHZhbHVlKTtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gR2V0TWF0aENvbnRleHRSZWdleCgpIHtcclxuICByZXR1cm4gW1xyXG4gICAgeyByZWdleDogL2Jpbm9tXFwoKFxcZCspLChcXGQrKSwoXFxkKylcXCkvLCB2YWx1ZTogXCJiaW5vbVwiIH0sXHJcbiAgICB7IHJlZ2V4OiAvdmVjKFsrLV17MCwyfSlcXCgoW1xcZC4rLV0rWzosXVtcXGQuKy1dKylcXCkoW1xcZC4rLV0qKS8sIHZhbHVlOiBcInZlY1wiIH0sXHJcbiAgICB7IHJlZ2V4OiAvY29zXFwoKFtcXGQuXSspLChbXFxkLl0rKSwoW1xcZC5dKylcXCkvLCB2YWx1ZTogXCJjb3NcIiB9LFxyXG4gICAgeyByZWdleDogL3ZhclxccyooW1xcd10rKVxccyo9XFxzKihbXFxkLl0rKS8sIHZhbHVlOiBcInZhcmlhYmxlXCIgfSxcclxuICBdO1xyXG59XHJcblxyXG5cclxuY2xhc3MgVmVjUHJvY2Vzc29yIHtcclxuICB1c2VySW5wdXQ6IGFueTtcclxuICBlbnZpcm9ubWVudDogeyBYOiBzdHJpbmc7IFk6IHN0cmluZyB9O1xyXG4gIHZlY0luZm8gPSBuZXcgTWF0aEluZm8oKTtcclxuICBheGlzOiBBeGlzO1xyXG4gIG1vZGlmaWVyOiBudW1iZXI7XHJcbiAgcmVzdWx0OiBzdHJpbmc7XHJcbiAgZ3JhcGg/OiBhbnk7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGVudmlyb25tZW50OiBzdHJpbmcsIG1hdGhJbnB1dDogc3RyaW5nLCBtb2RpZmllcjogc3RyaW5nKSB7XHJcbiAgICB0aGlzLnVzZXJJbnB1dD1tYXRoSW5wdXQ7XHJcbiAgICBjb25zdCBtYXRjaCA9IGVudmlyb25tZW50Lm1hdGNoKC8oWystXT8pKFsrLV0/KS8pO1xyXG4gICAgdGhpcy5lbnZpcm9ubWVudCA9IHsgWDogbWF0Y2g/LlsxXSA/PyBcIitcIiwgWTogbWF0Y2g/LlsyXSA/PyBcIitcIiB9O1xyXG5cclxuICAgIHRoaXMubW9kaWZpZXIgPSBtb2RpZmllci5sZW5ndGggPiAwID8gZ2V0VXNhYmxlRGVncmVlcyhOdW1iZXIobW9kaWZpZXIpKSA6IDA7XHJcblxyXG4gICAgdGhpcy5heGlzPW5ldyBBeGlzKCkudW5pdmVyc2FsKHRoaXMudXNlcklucHV0KVxyXG4gICAgaWYgKCF0aGlzLmF4aXMucG9sYXJBbmdsZSlcclxuICAgICAgdGhpcy5heGlzLmNhcnRlc2lhblRvUG9sYXIoKTtcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJheGlzXCIsdGhpcy5heGlzKTtcclxuICAgIHRoaXMuYWRkUmVzdWx0KCk7XHJcbiAgICB0aGlzLmFkZEdyYXBoKCk7XHJcbiAgfVxyXG4gIGFkZFJlc3VsdCgpe1xyXG4gICAgaWYgKHRoaXMudXNlcklucHV0LmluY2x1ZGVzKFwiOlwiKSlcclxuICAgICAgdGhpcy5yZXN1bHQ9YHggPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5YfVxcXFxxdWFkLHkgPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5ZfWBcclxuICAgIGVsc2VcclxuICAgICAgdGhpcy5yZXN1bHQ9YGFuZ2xlID0gJHt0aGlzLmF4aXMucG9sYXJBbmdsZX1cXFxccXVhZCxsZW5ndGggPSAke3RoaXMuYXhpcy5wb2xhckxlbmd0aH1gXHJcbiAgfVxyXG4gIGFkZEdyYXBoKCkge1xyXG4gICAgY29uc3QgdGFyZ2V0U2l6ZSA9IDEwO1xyXG4gICAgY29uc3QgbWF4Q29tcG9uZW50ID0gTWF0aC5tYXgoTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblgpLCBNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWSkpO1xyXG5cclxuICAgIC8vIERldGVybWluZSBzY2FsaW5nIGZhY3RvclxyXG4gICAgbGV0IHNjYWxlID0gMTtcclxuICAgIGlmIChtYXhDb21wb25lbnQgPCB0YXJnZXRTaXplKSB7XHJcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcclxuICAgIH0gZWxzZSBpZiAobWF4Q29tcG9uZW50ID4gdGFyZ2V0U2l6ZSkge1xyXG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XHJcbiAgICB9XHJcbiAgICAvLyBpIG5lZWQgdG8gbWFrZSBpdCBcInRvIFggYXhpc1wiXHJcbiAgICAvL2NvbnN0IHZlY3RvckFuZ2xlID0gZ2V0VXNhYmxlRGVncmVlcyhyYWRpYW5zVG9EZWdyZWVzKE1hdGguYXRhbjIoc2NhbGVkWSwgc2NhbGVkWCkpKTtcclxuICAgIFxyXG4gICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoMCwwKTtcclxuXHJcblxyXG4gICAvLyBjb25zdCBkcmF3PSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5wb2xhckxlbmd0aC50b1N0cmluZygpfSksdGhpcy5heGlzXTtcclxuICAgIC8vY29uc3QgZHJhd1g9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblgudG9TdHJpbmcoKX0pLG5ldyBBeGlzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YLDApXTtcclxuICAgIC8vY29uc3QgZHJhd1k9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLmNhcnRlc2lhblkudG9TdHJpbmcoKX0pLG5ldyBBeGlzKDAsdGhpcy5heGlzLmNhcnRlc2lhblkpXTtcclxuXHJcbiAgICB0aGlzLmdyYXBoPVtcclxuICAgICAgLy9uZXcgRm9ybWF0dGluZyhcImdsb2JvbFwiLHtjb2xvcjogXCJ3aGl0ZVwiLHNjYWxlOiAxLH0pLFxyXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3LGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJyZWRcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXHJcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdYLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXHJcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXdZLGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJ5ZWxsb3dcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXHJcbiAgICBdXHJcbiAgICBcclxuICAgIFxyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGhcIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRva2VucyxudWxsLDEpKTtcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoLnRvU3RyaW5nKClcXG5cIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRvU3RyaW5nKCkpKTtcclxuICAgIC8qIEdlbmVyYXRlIExhVGVYIGNvZGUgZm9yIHZlY3RvciBjb21wb25lbnRzIGFuZCBtYWluIHZlY3RvclxyXG4gICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXHJcblxyXG4gICAgICAlIEFuZ2xlIEFubm90YXRpb25cclxuICAgICAgJVxcYW5ne1h9e2FuY317dmVjfXt9eyR7cm91bmRCeVNldHRpbmdzKHZlY3RvckFuZ2xlKX0kXntcXGNpcmN9JH1cclxuICAgIGAucmVwbGFjZSgvXlxccysvZ20sIFwiXCIpOyovXHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiU2NhbGluZyBmYWN0b3JcIiwgc2NhbGUpO1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyB0aWt6R3JhcGggZXh0ZW5kcyBNb2RhbCB7XHJcbiAgdGlrejogRm9ybWF0VGlrempheDtcclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCx0aWt6Q29kZTogYW55KXtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICB0aGlzLnRpa3o9bmV3IEZvcm1hdFRpa3pqYXgodGlrekNvZGUpO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb25zdCBjb2RlPXRoaXMudGlrejtcclxuICAgIGNvbnN0IHNjcmlwdCA9IGNvbnRlbnRFbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcclxuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xyXG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcclxuICAgIHNjcmlwdC5zZXRUZXh0KGNvZGUuZ2V0Q29kZSh0aGlzLmFwcCkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcclxuXHJcbiAgICBhY3Rpb25CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6LmdldENvZGUodGhpcy5hcHApKTtcclxuICAgICAgbmV3IE5vdGljZShcIkdyYXBoIGNvcGllZCB0byBjbGlwYm9hcmQhXCIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIG9uQ2xvc2UoKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIEJpbm9tSW5mb01vZGVsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHByaXZhdGUgbjogbnVtYmVyO1xyXG4gIHByaXZhdGUgazogbnVtYmVyO1xyXG4gIHByaXZhdGUgcDogbnVtYmVyO1xyXG4gIHByaXZhdGUgZXF1YWwgPSAwO1xyXG4gIHByaXZhdGUgbGVzcyA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xyXG4gIHByaXZhdGUgYmlnID0gMDtcclxuICBwcml2YXRlIGJpZ0VxdWFsID0gMDtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcclxuICAgIHRoaXMubiA9IG47XHJcbiAgICB0aGlzLmsgPSBrO1xyXG4gICAgdGhpcy5wID0gcDtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIHRoaXMuY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpO1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPSAke3RoaXMua30pID0gJHt0aGlzLmVxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID4gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWd9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBnZXRFcXVhbCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcclxuICAgICAgY29uc3QgcHJvYmFiaWxpdHkgPSBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIGksIHRoaXMucCk7XHJcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPCB0aGlzLmspIHRoaXMubGVzcyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPD0gdGhpcy5rKSB0aGlzLmxlc3NFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+PSB0aGlzLmspIHRoaXMuYmlnRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIHRlc3RNYXRoRW5naW5lKCl7XHJcbiAgY29uc3QgZXhwcmVzc2lvbnM9W1xyXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgMiBcXGZyYWN7KDUtMykzNH17XFxzcXJ0ezJeezJ9fX0wLjVgLGV4cGVjdGVkT3V0cHV0OiAnMzQnfSxcclxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YCh4KzEpKHgrMyk9MmAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTAuMjY3OTUseF8yPS0zLjczMjA1J30sXHJcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2BcXGZyYWN7MTMyfXsxMjYwK3heezJ9fT0wLjA1YCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMzcuMTQ4MzUseF8yPTM3LjE0ODM1J30sXHJcbiAgXVxyXG4gIGNvbnN0IHJlc3VsdHM9W11cclxuICB0cnl7XHJcbiAgICBleHByZXNzaW9ucy5mb3JFYWNoKGV4cHJlc3Npb24gPT4ge1xyXG4gICAgICBjb25zdCBtYXRoPW5ldyBNYXRoUHJhaXNlcihleHByZXNzaW9uLmV4cHJlc3Npb24pO1xyXG4gICAgICBpZiAobWF0aC5zb2x1dGlvbiE9PWV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQpe1xyXG4gICAgICAgIHJlc3VsdHMucHVzaCh7ZXhwcmVzc2lvbjogZXhwcmVzc2lvbi5leHByZXNzaW9uLGV4cGVjdGVkT3V0cHV0OiBleHByZXNzaW9uLmV4cGVjdGVkT3V0cHV0LGFjdHVhbE91dHB1dDogbWF0aC5zb2x1dGlvbn0pXHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuICBjYXRjaChlKXtcclxuICAgIGNvbnNvbGUubG9nKGUpXHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG4iXX0=