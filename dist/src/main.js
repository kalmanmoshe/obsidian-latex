import { Plugin, MarkdownRenderer, addIcon, Modal, Component, Notice, loadMathJax, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathEngine.js";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, processLatexSuiteSettings } from "./settings/settings";
import { LatexSuiteSettingTab } from "./settings/settings_tab";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "./mathUtilities.js";
import { Axis, Tikzjax } from "./tikzjax/tikzjax";
import { TikzSvg } from "./tikzjax/myTikz.js";
import { Prec } from "@codemirror/state";
import { EditorView, tooltips } from "@codemirror/view";
import { FormatTikzjax } from "./tikzjax/interpret/tokenizeTikzjax.js";
import { EditorExtensions } from "./editorExtensions.js";
import { onFileCreate, onFileChange, onFileDelete, getSnippetsFromFiles, getFileSets, getVariablesFromFiles, tryGetVariablesFromUnknownFiles } from "./settings/file_watch";
import { ICONS } from "./settings/ui/icons";
import { getEditorCommands } from "./features/editor_commands";
import { getLatexSuiteConfigExtension } from "./snippets/codemirror/config";
import { parseSnippetVariables, parseSnippets } from "./snippets/parse";
import { handleUpdate, onKeydown } from "src/latex_suite";
import { snippetExtensions } from "./snippets/codemirror/extensions";
import { mkConcealPlugin } from "./editor_extensions/conceal";
import { colorPairedBracketsPluginLowestPrec, highlightCursorBracketsPlugin } from "./editor_extensions/highlight_brackets";
import { cursorTooltipBaseTheme, cursorTooltipField } from "./editor_extensions/math_tooltip";
export default class Moshe extends Plugin {
    settings;
    CMSettings;
    editorExtensions = [];
    tikzProcessor;
    async onload() {
        await this.loadSettings();
        this.loadIcons();
        this.addSettingTab(new LatexSuiteSettingTab(this.app, this));
        loadMathJax();
        this.legacyEditorWarning();
        // Register Latex Suite extensions and optional editor extensions for editor enhancements
        this.registerEditorExtension(this.editorExtensions);
        // Watch for changes to the snippet variables and snippets files
        this.watchFiles();
        this.addEditorCommands();
        this.tikzProcessor = new Tikzjax(this.app, this);
        this.tikzProcessor.readyLayout();
        this.tikzProcessor.addSyntaxHighlighting();
        this.tikzProcessor.registerTikzCodeBlock();
        this.addSettingTab(new LatexSuiteSettingTab(this.app, this));
        this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
        this.registerMarkdownCodeBlockProcessor("tikzjax", this.processTikzBlock.bind(this));
        this.registerCommands();
        new EditorExtensions().setEditorExtensions(this);
        //this.registerEditorSuggest(new NumeralsSuggestor(this));
    }
    legacyEditorWarning() {
        // @ts-ignore
        if (this.app.vault.config?.legacyEditor) {
            const message = "Obsidian Latex Suite: This plugin does not support the legacy editor. Switch to Live Preview mode to use this plugin.";
            new Notice(message, 100000);
            console.log(message);
            return;
        }
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
            console.log(`Failed to load snippets from settings: ${e}`);
            return [];
        }
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
        //console.log(graph.outerHTML)
        icon.onclick = () => new DebugModal(this.app, svg.debugInfo).open();
        container.appendChild(icon);
        container.appendChild(graph);
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
        if (shouldMigrateSettings) {
            this.saveSettings();
        }
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
        // Request Obsidian to reconfigure CM extensions
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
        console.log('this.settings.snippets', snippets);
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
    setEditorExtensions() {
        // Remove all currently loaded CM extensions
        // In order for 'this.app.workspace.updateOptions()' to function as
        // expected, you cannot assign a new array to 'this.editorExtensions'.
        while (this.editorExtensions.length)
            this.editorExtensions.pop();
        // Compulsory extensions
        this.editorExtensions.push([
            getLatexSuiteConfigExtension(this.CMSettings),
            Prec.highest(EditorView.domEventHandlers({ "keydown": onKeydown })),
            EditorView.updateListener.of(handleUpdate),
            snippetExtensions,
        ]);
        // Optional extensions
        if (this.CMSettings.concealEnabled) {
            const timeout = this.CMSettings.concealRevealTimeout;
            this.editorExtensions.push(mkConcealPlugin(timeout).extension);
        }
        if (this.CMSettings.colorPairedBracketsEnabled)
            this.editorExtensions.push(colorPairedBracketsPluginLowestPrec);
        if (this.CMSettings.highlightCursorBracketsEnabled)
            this.editorExtensions.push(highlightCursorBracketsPlugin.extension);
        if (this.CMSettings.mathPreviewEnabled)
            this.editorExtensions.push([
                cursorTooltipField.extension,
                cursorTooltipBaseTheme,
                tooltips({ position: "absolute" }),
            ]);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQUMsT0FBTyxFQUFPLEtBQUssRUFBRSxTQUFTLEVBQVUsTUFBTSxFQUFrQixXQUFXLEVBQUMsVUFBVSxFQUE2RyxNQUFNLFVBQVUsQ0FBQztBQUVyUCxPQUFPLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDdkQsT0FBTyxFQUE4QyxhQUFhLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDbkYsT0FBTyxFQUEyQixnQkFBZ0IsRUFBd0IseUJBQXlCLEVBQUMsTUFBTSxxQkFBcUIsQ0FBQztBQUNoSSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsY0FBYyxFQUFvQixxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBc0MsZUFBZSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDcEssT0FBTyxFQUFFLElBQUksRUFBZ0MsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTlDLE9BQU8sRUFBa0QsSUFBSSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFekYsT0FBTyxFQUFFLFVBQVUsRUFBcUMsUUFBUSxFQUFFLE1BQU0sa0JBQWtCLENBQUM7QUFDM0YsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRXpELE9BQU8sRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBRSxXQUFXLEVBQUUscUJBQXFCLEVBQUUsK0JBQStCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1SyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFFNUMsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDL0QsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDNUUsT0FBTyxFQUFvQixxQkFBcUIsRUFBRSxhQUFhLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUMxRixPQUFPLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzFELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM5RCxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM1SCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUs5RixNQUFNLENBQUMsT0FBTyxPQUFPLEtBQU0sU0FBUSxNQUFNO0lBQ3ZDLFFBQVEsQ0FBMkI7SUFDcEMsVUFBVSxDQUF1QjtJQUNqQyxnQkFBZ0IsR0FBZ0IsRUFBRSxDQUFDO0lBQ2xDLGFBQWEsQ0FBUztJQUV0QixLQUFLLENBQUMsTUFBTTtRQUNWLE1BQU0sSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1FBRTVCLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNqQixJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksb0JBQW9CLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQzdELFdBQVcsRUFBRSxDQUFDO1FBRWQsSUFBSSxDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFM0IseUZBQXlGO1FBQ3pGLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUVwRCxnRUFBZ0U7UUFDaEUsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBRWxCLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxhQUFhLEdBQUMsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBQyxJQUFJLENBQUMsQ0FBQTtRQUM3QyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLEVBQUUsQ0FBQztRQUMzQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFFekMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsa0NBQWtDLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUN6RixJQUFJLENBQUMsa0NBQWtDLENBQUMsU0FBUyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNyRixJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUN4QixJQUFJLGdCQUFnQixFQUFFLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLENBQUE7UUFFaEQsMERBQTBEO0lBRTVELENBQUM7SUFFRixtQkFBbUI7UUFDbEIsYUFBYTtRQUNiLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLFlBQVksRUFBRSxDQUFDO1lBQ3pDLE1BQU0sT0FBTyxHQUFHLHVIQUF1SCxDQUFDO1lBRXhJLElBQUksTUFBTSxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUM1QixPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRXJCLE9BQU87UUFDUixDQUFDO0lBQ0YsQ0FBQztJQUNBLGlCQUFpQjtRQUNqQixLQUFLLE1BQU0sT0FBTyxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDL0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMxQixDQUFDO0lBQ0YsQ0FBQztJQUNBLFFBQVE7UUFDUixJQUFJLENBQUMsYUFBYSxDQUFDLHVCQUF1QixFQUFFLENBQUM7UUFDN0MsSUFBSSxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO0lBQy9DLENBQUM7SUFFQSxLQUFLLENBQUMsbUJBQW1CLENBQUMsZ0JBQWtDO1FBQzVELElBQUksQ0FBQztZQUNKLE9BQU8sTUFBTSxhQUFhLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUN0RSxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLElBQUksTUFBTSxDQUFDLDBDQUEwQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzFELE9BQU8sQ0FBQyxHQUFHLENBQUMsMENBQTBDLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDM0QsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO0lBQ0YsQ0FBQztJQUVBLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxTQUFzQjtRQUN2RCxNQUFNLEdBQUcsR0FBRyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVoQyxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDcEQsU0FBUyxFQUFFLGlCQUFpQjtZQUM1QixXQUFXLEVBQUUsSUFBSTtTQUNsQixDQUFDLENBQUM7UUFHSCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDekQsS0FBSyxFQUFFLDhEQUE4RDtTQUN0RSxDQUFDLENBQUM7UUFDSCxLQUFLLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ2hDLEdBQUcsQ0FBQyxTQUFTLElBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQTtRQUM5Qiw4QkFBOEI7UUFDOUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxHQUFHLEVBQUUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUVwRSxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVCLFNBQVMsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVELFNBQVM7UUFDUCxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3pELE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDOUIsQ0FBQztJQUNILENBQUM7SUFDRCxLQUFLLENBQUMsWUFBWTtRQUNoQixJQUFJLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUVqQyx3Q0FBd0M7UUFDeEMsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLGVBQWUsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUVyRSxhQUFhO1FBQ2IsU0FBUyxlQUFlLENBQUMsV0FBVztZQUNsQyxPQUFPO2dCQUNMLEdBQUcsV0FBVyxDQUFDLGFBQWE7Z0JBQzVCLEdBQUcsV0FBVyxDQUFDLFdBQVc7Z0JBQzFCLFFBQVEsRUFBRSxXQUFXLENBQUMsUUFBUTthQUMvQixDQUFDO1FBQ0osQ0FBQztRQUVELElBQUkscUJBQXFCLEVBQUUsQ0FBQztZQUMxQixJQUFJLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQy9CLENBQUM7UUFFRCxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTFELElBQUkscUJBQXFCLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDdEIsQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLENBQUM7WUFDckYsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLElBQUksQ0FBQywyQkFBMkIsRUFBRSxDQUFDO1lBQ3RFLE1BQU0sWUFBWSxHQUFHLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFFMUUsSUFBSSxDQUFDLFVBQVUsR0FBRyx5QkFBeUIsQ0FBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBRXpFLDZFQUE2RTtZQUM3RSxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFO2dCQUNwQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDekIsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO2FBQ0ksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQy9CLENBQUM7SUFDSCxDQUFDO0lBRUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxxQkFBcUIsR0FBRyxLQUFLO1FBQ2hELE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDbkMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFQSxLQUFLLENBQUMsZUFBZSxDQUFDLDBCQUEwQixHQUFHLEtBQUssRUFBRSxrQkFBa0IsR0FBRyxLQUFLO1FBQ3BGLElBQUksQ0FBQyxVQUFVLEdBQUcseUJBQXlCLENBQUMsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLDBCQUEwQixFQUFFLGtCQUFrQixDQUFDLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ25JLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQzNCLGdEQUFnRDtRQUNoRCxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBRUEsS0FBSyxDQUFDLDJCQUEyQjtRQUNqQyxJQUFJLENBQUM7WUFDSixPQUFPLE1BQU0scUJBQXFCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ3BFLENBQUM7UUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ1osSUFBSSxNQUFNLENBQUMsbURBQW1ELENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtREFBbUQsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwRSxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0lBQ0EsS0FBSyxDQUFDLFdBQVcsQ0FBQywwQkFBbUMsRUFBRSxrQkFBMkI7UUFDbEYseUNBQXlDO1FBQ3pDLDBFQUEwRTtRQUMxRSxNQUFNLEtBQUssR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFaEMsTUFBTSxnQkFBZ0IsR0FDckIsSUFBSSxDQUFDLFFBQVEsQ0FBQyw0QkFBNEI7WUFDekMsQ0FBQyxDQUFDLE1BQU0scUJBQXFCLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQztZQUMxQyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUU3QyxxRkFBcUY7UUFDckYsTUFBTSxvQkFBb0IsR0FBRyxNQUFNLCtCQUErQixDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoRixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztZQUNoRCxvREFBb0Q7WUFDcEQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3ZELENBQUM7UUFFRCxNQUFNLFFBQVEsR0FDYixJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQjtZQUNqQyxDQUFDLENBQUMsTUFBTSxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLGdCQUFnQixDQUFDO1lBQzNELENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ25ELE9BQU8sQ0FBQyxHQUFHLENBQUMsd0JBQXdCLEVBQUMsUUFBUSxDQUFDLENBQUE7UUFDaEQsSUFBSSxDQUFDLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLE1BQU0sRUFBRywwQkFBMEIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBRXRJLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFDQSx3QkFBd0IsQ0FBQyxTQUFpQixFQUFFLGlCQUF5QixFQUFFLDBCQUFtQyxFQUFFLGtCQUEyQjtRQUN2SSxJQUFJLENBQUMsQ0FBQywwQkFBMEIsSUFBSSxrQkFBa0IsQ0FBQztZQUN0RCxPQUFPO1FBRVIsTUFBTSxNQUFNLEdBQUcsMEJBQTBCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsd0JBQXdCLENBQUM7UUFDakYsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRWhCLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0I7WUFDckMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLFNBQVMsV0FBVyxDQUFDLENBQUM7UUFDcEMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLDRCQUE0QjtZQUM3QyxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsaUJBQWlCLG9CQUFvQixDQUFDLENBQUM7UUFFckQsTUFBTSxNQUFNLEdBQUcsY0FBYyxDQUFDO1FBQzlCLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN4RCxDQUFDO0lBQ0EsbUJBQW1CO1FBQ25CLDRDQUE0QztRQUM1QyxtRUFBbUU7UUFDbkUsc0VBQXNFO1FBQ3RFLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU07WUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUM7UUFFakUsd0JBQXdCO1FBQ3hCLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7WUFDMUIsNEJBQTRCLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUM3QyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ25FLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQztZQUMxQyxpQkFBaUI7U0FDakIsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNwQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLG9CQUFvQixDQUFDO1lBQ3JELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2hFLENBQUM7UUFDRCxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsMEJBQTBCO1lBQzdDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNqRSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsOEJBQThCO1lBQ2pELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckUsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLGtCQUFrQjtZQUNyQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDO2dCQUMxQixrQkFBa0IsQ0FBQyxTQUFTO2dCQUM1QixzQkFBc0I7Z0JBQ3RCLFFBQVEsQ0FBQyxFQUFFLFFBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQzthQUNsQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ1EsZ0JBQWdCO1FBQ3RCLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDZCxFQUFFLEVBQUUsaUJBQWlCO1lBQ3JCLElBQUksRUFBRSxpQkFBaUI7WUFDdkIsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFO1NBQ3hELENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxVQUFVLENBQUM7WUFDZCxFQUFFLEVBQUUsc0JBQXNCO1lBQzFCLElBQUksRUFBRSxzQkFBc0I7WUFDNUIsMERBQTBEO1NBQzNELENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxVQUFVLENBQUM7WUFDZCxFQUFFLEVBQUUsaUJBQWlCO1lBQ3JCLElBQUksRUFBRSxrQkFBa0I7WUFDeEIsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFBLGNBQWMsRUFBRTtTQUNoQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsVUFBVTtRQUNWLHFEQUFxRDtRQUNyRCwwRkFBMEY7UUFDMUYsdUNBQXVDO1FBRXZDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUU7WUFFckMsTUFBTSxrQkFBa0IsR0FBRztnQkFDMUIsUUFBUSxFQUFFLFlBQVk7Z0JBQ3RCLFFBQVEsRUFBRSxZQUFZO2dCQUN0QixRQUFRLEVBQUUsWUFBWTthQUN0QixDQUFDO1lBRUYsS0FBSyxNQUFNLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO2dCQUMvRCxtQkFBbUI7Z0JBQ25CLElBQUksQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDekUsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLGdCQUFnQixDQUFDLE1BQWMsRUFBRSxhQUEwQjtRQUNqRSxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBRTlDLE1BQU0sYUFBYSxHQUEwQyxFQUFFLENBQUM7UUFDaEUsSUFBSSxjQUFjLEdBQUcsQ0FBQyxDQUFDO1FBRXZCLE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckYsSUFBSSxXQUFXLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQUEsT0FBTztRQUFBLENBQUM7UUFHdkMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUN4QyxJQUFJLGFBQWEsR0FBbUIsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNsRSxhQUFhLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDLEtBQUssR0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ3hILGtDQUFrQztZQUNsQyxNQUFNLFdBQVcsR0FBRyxJQUFJLFdBQVcsQ0FBQyxVQUFVLEVBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUMsYUFBYSxDQUFDLENBQUM7WUFDdEYsV0FBVyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBRXpCLElBQUcsV0FBVyxDQUFDLElBQUksS0FBRyxVQUFVLEVBQUMsQ0FBQztnQkFDaEMsYUFBYSxHQUFHLFdBQVcsQ0FBQyxTQUEyQixDQUFDO2dCQUN4RCxhQUFhLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQzNDLENBQUM7aUJBQ0csQ0FBQztnQkFBQSxjQUFjLEVBQUUsQ0FBQztZQUFBLENBQUM7UUFDekIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFLRCxNQUFNLFdBQVc7SUFDZixTQUFTLENBQU07SUFDZixhQUFhLEdBQTBDLEVBQUUsQ0FBQztJQUMxRCxJQUFJLEdBQUcsTUFBTSxDQUFDO0lBQ2QsTUFBTSxDQUFNO0lBQ1osU0FBUyxDQUFjO0lBQ3ZCLFFBQVEsQ0FBYztJQUN0QixHQUFHLENBQU07SUFFVCxZQUFZLFNBQWlCLEVBQUMsYUFBa0IsRUFBRSxHQUFRLEVBQUUsU0FBc0I7UUFDaEYsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLGFBQWEsR0FBQyxhQUFhLENBQUM7UUFDakMsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztRQUMzQixJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUMzRCxTQUFTLEVBQUUsWUFBWTtTQUN4QixDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLFVBQVU7UUFDZCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7SUFDcEIsQ0FBQztJQUVPLGNBQWM7UUFDcEIsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ2hELE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDN0IsSUFBSSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbEMsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVPLFVBQVU7UUFDaEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFnQixDQUFDO1FBQzVFLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBZ0IsQ0FBQztRQUM5RSxJQUFJLENBQUM7WUFDSCxRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDbEIsS0FBSyxPQUFPO29CQUNWLGdEQUFnRDtvQkFDaEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQ2hFLElBQUksQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQzlCLElBQUksQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUNwQyxNQUFNO2dCQUNSLEtBQUssS0FBSztvQkFDUixnREFBZ0Q7b0JBQ2hELE1BQU0sQ0FBRSxBQUFELEVBQUcsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDN0QsSUFBSSxDQUFDLE1BQU0sR0FBQyxxQkFBcUIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFBO29CQUN0RCxNQUFNO2dCQUNSLEtBQUssS0FBSztvQkFDUixnREFBZ0Q7b0JBQ2hELElBQUksQ0FBQyxNQUFNLEdBQUMsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDcEYsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDOUQsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQzVFLElBQUksQ0FBQyxNQUFNLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUE7b0JBQzlCLE1BQU07Z0JBQ1IsS0FBSyxVQUFVO29CQUNiLE1BQU07Z0JBQ1I7b0JBQ0UsZ0RBQWdEO29CQUNoRCxJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksV0FBVyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztvQkFDOUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztvQkFDakUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQzdFLElBQUksQ0FBQyxTQUFTLEdBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7b0JBQ2pDLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7b0JBQ25DLE1BQU07WUFDVixDQUFDO1lBQ0YsSUFBSSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsT0FBTyxJQUFJLENBQUMsU0FBUyxLQUFHLFFBQVEsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxlQUFlLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDakosQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDYixJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsRUFBQyxHQUFHLENBQUMsQ0FBQztRQUNuRCxDQUFDO0lBQ0gsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFFBQXFCLEVBQUUsU0FBc0IsRUFBRSxLQUFhLEVBQUUsTUFBVztRQUNwRyxRQUFRLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQTtRQUM1QyxrRkFBa0Y7UUFDbEYsK0VBQStFO1FBQy9FLFNBQVMsQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBQyxJQUFJLENBQUMsQ0FBQyxDQUFBO1FBQ3pELGdGQUFnRjtJQUNsRixDQUFDO0lBRU8sWUFBWSxDQUFDLFFBQXFCLEVBQUUsU0FBc0IsRUFBRSxHQUFVO1FBQzVFLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsSUFBSSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQy9FLFNBQVMsQ0FBQyxTQUFTLEdBQUcsNEJBQTRCLEdBQUcsQ0FBQyxPQUFPLFNBQVMsQ0FBQztRQUN2RSxJQUFJLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNsRCxDQUFDO0lBRU8sVUFBVTtRQUNoQixNQUFNLFNBQVMsR0FBRyxtQkFBbUIsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sV0FBVyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztRQUNwRixJQUFJLFdBQVcsRUFBRSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxJQUFJLEdBQUcsV0FBVyxDQUFDLEtBQUssQ0FBQztZQUM5QixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0gsQ0FBQztJQUVPLFlBQVksQ0FBQyxLQUFVO1FBQzdCLE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN4RCxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLFdBQVcsRUFBRSxJQUFJO1NBQ2xCLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFFTyxhQUFhLENBQUMsS0FBVTtRQUM5QixNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDeEQsU0FBUyxFQUFFLGlCQUFpQjtZQUM1QixXQUFXLEVBQUUsSUFBSTtTQUNsQixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRU8sZUFBZTtRQUNyQixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUcsVUFBVSxFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDbkMsQ0FBQzthQUFNLENBQUM7WUFDTixJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztRQUN0QyxDQUFDO0lBQ0gsQ0FBQztJQUVPLHlCQUF5QjtRQUMvQixNQUFNLENBQUMsQ0FBQyxFQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQVksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDOUUsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3hCLE9BQU8sQ0FBQyxJQUFJLENBQUMsaUNBQWlDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2hFLE9BQU87UUFDVCxDQUFDO1FBQ0QsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLEtBQUssUUFBUSxDQUFDLENBQUM7UUFDcEYsSUFBSSxnQkFBZ0IsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQzVCLElBQUksQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ3JELENBQUM7YUFBTSxDQUFDO1lBQ04sSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztRQUMvQyxDQUFDO0lBQ0gsQ0FBQztJQUVPLDRCQUE0QjtRQUNsQyxJQUFJLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDakQsSUFBSSxPQUFPLElBQUksQ0FBQyxTQUFTLEtBQUcsUUFBUSxFQUFDLENBQUM7Z0JBQ3BDLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNELENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQUdELFNBQVMsbUJBQW1CO0lBQzFCLE9BQU87UUFDTCxFQUFFLEtBQUssRUFBRSw0QkFBNEIsRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFO1FBQ3ZELEVBQUUsS0FBSyxFQUFFLG9EQUFvRCxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUU7UUFDN0UsRUFBRSxLQUFLLEVBQUUsbUNBQW1DLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTtRQUM1RCxFQUFFLEtBQUssRUFBRSw4QkFBOEIsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFO0tBQzdELENBQUM7QUFDSixDQUFDO0FBR0QsTUFBTSxZQUFZO0lBQ2hCLFNBQVMsQ0FBTTtJQUNmLFdBQVcsQ0FBMkI7SUFDdEMsT0FBTyxHQUFHLElBQUksUUFBUSxFQUFFLENBQUM7SUFDekIsSUFBSSxDQUFPO0lBQ1gsUUFBUSxDQUFTO0lBQ2pCLE1BQU0sQ0FBUztJQUNmLEtBQUssQ0FBTztJQUVaLFlBQVksV0FBbUIsRUFBRSxTQUFpQixFQUFFLFFBQWdCO1FBQ2xFLElBQUksQ0FBQyxTQUFTLEdBQUMsU0FBUyxDQUFDO1FBQ3pCLE1BQU0sS0FBSyxHQUFHLFdBQVcsQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsV0FBVyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxFQUFFLENBQUM7UUFFbEUsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUU3RSxJQUFJLENBQUMsSUFBSSxHQUFDLElBQUksSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQTtRQUM5QyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVO1lBQ3ZCLElBQUksQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUNqQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDbEIsQ0FBQztJQUNELFNBQVM7UUFDUCxJQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQztZQUM5QixJQUFJLENBQUMsTUFBTSxHQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLGNBQWMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQTs7WUFFM0UsSUFBSSxDQUFDLE1BQU0sR0FBQyxXQUFXLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxtQkFBbUIsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQTtJQUN6RixDQUFDO0lBQ0QsUUFBUTtRQUNOLE1BQU0sVUFBVSxHQUFHLEVBQUUsQ0FBQztRQUN0QixNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUU5RiwyQkFBMkI7UUFDM0IsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsSUFBSSxZQUFZLEdBQUcsVUFBVSxFQUFFLENBQUM7WUFDOUIsS0FBSyxHQUFHLFVBQVUsR0FBRyxZQUFZLENBQUM7UUFDcEMsQ0FBQzthQUFNLElBQUksWUFBWSxHQUFHLFVBQVUsRUFBRSxDQUFDO1lBQ3JDLEtBQUssR0FBRyxVQUFVLEdBQUcsWUFBWSxDQUFDO1FBQ3BDLENBQUM7UUFDRCxnQ0FBZ0M7UUFDaEMsdUZBQXVGO1FBRXZGLE1BQU0sS0FBSyxHQUFDLElBQUksSUFBSSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQztRQUczQixtSEFBbUg7UUFDbEgseUlBQXlJO1FBQ3pJLHlJQUF5STtRQUV6SSxJQUFJLENBQUMsS0FBSyxHQUFDO1FBQ1Qsc0RBQXNEO1FBQ3RELDBGQUEwRjtRQUMxRiw4RkFBOEY7UUFDOUYsOEZBQThGO1NBQy9GLENBQUE7UUFHRCxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxZQUFZLEVBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBQyxJQUFJLEVBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqRixJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyx5QkFBeUIsRUFBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzNGOzs7OztrQ0FLMEI7UUFDMUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDckQsQ0FBQztDQUNGO0FBSUQsTUFBTSxTQUFVLFNBQVEsS0FBSztJQUMzQixJQUFJLENBQWdCO0lBQ3BCLFlBQVksR0FBUSxFQUFDLFFBQWE7UUFDaEMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLElBQUksR0FBQyxJQUFJLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN4QyxDQUFDO0lBRUQsTUFBTTtRQUNKLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsTUFBTSxJQUFJLEdBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztRQUNyQixNQUFNLE1BQU0sR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDakQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUUvQixNQUFNLFlBQVksR0FBRyxTQUFTLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLElBQUksRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLHdCQUF3QixFQUFFLENBQUMsQ0FBQztRQUV6RyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRTtZQUMxQyxTQUFTLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDbkQsSUFBSSxNQUFNLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUMzQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFPO1FBQ0wsTUFBTSxFQUFFLFNBQVMsRUFBRSxHQUFHLElBQUksQ0FBQztRQUN6QixTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdEIsQ0FBQztDQUNGO0FBSUQsTUFBTSxZQUFZO0lBQ1IsSUFBSSxDQUFtQjtJQUN2QixDQUFDLENBQVM7SUFDVixFQUFFLENBQVM7SUFDWCxLQUFLLENBQVE7SUFDYixRQUFRLENBQVE7SUFJeEIsNEJBQTRCO0lBQ3BCLE1BQU0sQ0FBUztJQUNmLFdBQVcsQ0FBUztJQUU1QiwyQkFBMkI7SUFDbkIsTUFBTSxDQUFTO0NBZ0Z4QjtBQUdELE1BQU0saUJBQWtCLFNBQVEsS0FBSztJQUMzQixDQUFDLENBQVM7SUFDVixDQUFDLENBQVM7SUFDVixDQUFDLENBQVM7SUFDVixLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ1YsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUNULFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDZCxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ1IsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUVyQixZQUFZLEdBQVEsRUFBRSxNQUFjO1FBQ2xDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDYixDQUFDO0lBRUQsTUFBTTtRQUNKLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQzlCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsOEJBQThCLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFTSxRQUFRO1FBQ2IsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRU8sc0JBQXNCO1FBQzVCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDakMsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0RCxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsS0FBSyxHQUFHLFdBQVcsQ0FBQztZQUMzQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLFdBQVcsQ0FBQztZQUN6QyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLFdBQVcsQ0FBQztZQUMvQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsR0FBRyxJQUFJLFdBQVcsQ0FBQztZQUN4QyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsUUFBUSxJQUFJLFdBQVcsQ0FBQztRQUNoRCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBUUQsTUFBTSxjQUFlLFNBQVEsS0FBSztJQUN4QixDQUFDLENBQVM7SUFDVixDQUFDLENBQVM7SUFDVixDQUFDLENBQVM7SUFDVixLQUFLLEdBQUcsQ0FBQyxDQUFDO0lBQ1YsSUFBSSxHQUFHLENBQUMsQ0FBQztJQUNULFNBQVMsR0FBRyxDQUFDLENBQUM7SUFDZCxHQUFHLEdBQUcsQ0FBQyxDQUFDO0lBQ1IsUUFBUSxHQUFHLENBQUMsQ0FBQztJQUVyQixZQUFZLEdBQVEsRUFBRSxNQUFjO1FBQ2xDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBRSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNYLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDYixDQUFDO0lBRUQsTUFBTTtRQUNKLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxDQUFDO1FBQzlCLE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLENBQUM7UUFDM0IsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsOEJBQThCLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsSUFBSSxFQUFFLFVBQVUsSUFBSSxDQUFDLENBQUMsT0FBTyxJQUFJLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFTSxRQUFRO1FBQ2IsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRU8sc0JBQXNCO1FBQzVCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDakMsTUFBTSxXQUFXLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0RCxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsS0FBSyxHQUFHLFdBQVcsQ0FBQztZQUMzQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsSUFBSSxJQUFJLFdBQVcsQ0FBQztZQUN6QyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsU0FBUyxJQUFJLFdBQVcsQ0FBQztZQUMvQyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsR0FBRyxJQUFJLFdBQVcsQ0FBQztZQUN4QyxJQUFJLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQztnQkFBRSxJQUFJLENBQUMsUUFBUSxJQUFJLFdBQVcsQ0FBQztRQUNoRCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBT0QsU0FBUyxjQUFjO0lBQ3JCLE1BQU0sV0FBVyxHQUFDO1FBQ2hCLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsbUNBQW1DLEVBQUMsY0FBYyxFQUFFLElBQUksRUFBQztRQUNoRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLGNBQWMsRUFBQyxjQUFjLEVBQUUsMkJBQTJCLEVBQUM7UUFDbEYsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSw2QkFBNkIsRUFBQyxjQUFjLEVBQUUsNEJBQTRCLEVBQUM7S0FDbkcsQ0FBQTtJQUNELE1BQU0sT0FBTyxHQUFDLEVBQUUsQ0FBQTtJQUNoQixJQUFHLENBQUM7UUFDRixXQUFXLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxFQUFFO1lBQy9CLE1BQU0sSUFBSSxHQUFDLElBQUksV0FBVyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsRCxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUcsVUFBVSxDQUFDLGNBQWMsRUFBQyxDQUFDO2dCQUM3QyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxVQUFVLEVBQUMsY0FBYyxFQUFFLFVBQVUsQ0FBQyxjQUFjLEVBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUMsQ0FBQyxDQUFBO1lBQ3pILENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFDRCxPQUFNLENBQUMsRUFBQyxDQUFDO1FBQ1AsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNoQixDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7UGx1Z2luLCBNYXJrZG93blJlbmRlcmVyLGFkZEljb24sIEFwcCwgTW9kYWwsIENvbXBvbmVudCwgU2V0dGluZyxOb3RpY2UsIFdvcmtzcGFjZVdpbmRvdyxsb2FkTWF0aEpheCxyZW5kZXJNYXRoLCBNYXJrZG93blZpZXcsIEVkaXRvclN1Z2dlc3QsIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbywgRWRpdG9yUG9zaXRpb24sIEVkaXRvciwgVEZpbGUsIEVkaXRvclN1Z2dlc3RDb250ZXh0fSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmltcG9ydCB7IE1hdGhJbmZvLCBNYXRoUHJhaXNlciB9IGZyb20gXCIuL21hdGhFbmdpbmUuanNcIjtcclxuaW1wb3J0IHsgSW5mb01vZGFsLCBEZWJ1Z01vZGFsIH0gZnJvbSBcIi4vZGVzcGx5TW9kYWxzXCI7XHJcbmltcG9ydCB7IEN1c3RvbUlucHV0TW9kYWwsIEhpc3RvcnlNb2RhbCwgSW5wdXRNb2RhbCwgVmVjSW5wdXRNb2RlbCB9IGZyb20gXCIuL3RlbXBcIjtcclxuaW1wb3J0IHtMYXRleFN1aXRlUGx1Z2luU2V0dGluZ3MsIERFRkFVTFRfU0VUVElOR1MsIExhdGV4U3VpdGVDTVNldHRpbmdzLCBwcm9jZXNzTGF0ZXhTdWl0ZVNldHRpbmdzfSBmcm9tIFwiLi9zZXR0aW5ncy9zZXR0aW5nc1wiO1xyXG5pbXBvcnQgeyBMYXRleFN1aXRlU2V0dGluZ1RhYiB9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzX3RhYlwiO1xyXG5pbXBvcnQgeyBjYWxjdWxhdGVCaW5vbSwgZGVncmVlc1RvUmFkaWFucywgZmluZEFuZ2xlQnlDb3NpbmVSdWxlLCBnZXRVc2FibGVEZWdyZWVzLCBwb2xhclRvQ2FydGVzaWFuLCByYWRpYW5zVG9EZWdyZWVzLCByb3VuZEJ5U2V0dGluZ3MgfSBmcm9tIFwiLi9tYXRoVXRpbGl0aWVzLmpzXCI7XHJcbmltcG9ydCB7IEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdHRpbmcsIFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgU3VnZ2VzdG9yIH0gZnJvbSBcIi4vc3VnZ2VzdG9yLmpzXCI7XHJcbmltcG9ydCB7IFRpa3pTdmcgfSBmcm9tIFwiLi90aWt6amF4L215VGlrei5qc1wiO1xyXG5cclxuaW1wb3J0IHtFeHRlbnNpb24sIEVkaXRvclN0YXRlLCBTZWxlY3Rpb25SYW5nZSxSYW5nZVNldCwgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBzeW50YXhUcmVlIH0gZnJvbSBcIkBjb2RlbWlycm9yL2xhbmd1YWdlXCI7XHJcbmltcG9ydCB7IEVkaXRvclZpZXcsIFZpZXdQbHVnaW4sIFZpZXdVcGRhdGUgLERlY29yYXRpb24sdG9vbHRpcHMgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5pbXBvcnQgeyBGb3JtYXRUaWt6amF4IH0gZnJvbSBcIi4vdGlrempheC9pbnRlcnByZXQvdG9rZW5pemVUaWt6amF4LmpzXCI7XHJcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tIFwiLi9lZGl0b3JFeHRlbnNpb25zLmpzXCI7XHJcblxyXG5pbXBvcnQgeyBvbkZpbGVDcmVhdGUsIG9uRmlsZUNoYW5nZSwgb25GaWxlRGVsZXRlLCBnZXRTbmlwcGV0c0Zyb21GaWxlcywgZ2V0RmlsZVNldHMsIGdldFZhcmlhYmxlc0Zyb21GaWxlcywgdHJ5R2V0VmFyaWFibGVzRnJvbVVua25vd25GaWxlcyB9IGZyb20gXCIuL3NldHRpbmdzL2ZpbGVfd2F0Y2hcIjtcclxuaW1wb3J0IHsgSUNPTlMgfSBmcm9tIFwiLi9zZXR0aW5ncy91aS9pY29uc1wiO1xyXG5cclxuaW1wb3J0IHsgZ2V0RWRpdG9yQ29tbWFuZHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9lZGl0b3JfY29tbWFuZHNcIjtcclxuaW1wb3J0IHsgZ2V0TGF0ZXhTdWl0ZUNvbmZpZ0V4dGVuc2lvbiB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvY29uZmlnXCI7XHJcbmltcG9ydCB7IFNuaXBwZXRWYXJpYWJsZXMsIHBhcnNlU25pcHBldFZhcmlhYmxlcywgcGFyc2VTbmlwcGV0cyB9IGZyb20gXCIuL3NuaXBwZXRzL3BhcnNlXCI7XHJcbmltcG9ydCB7IGhhbmRsZVVwZGF0ZSwgb25LZXlkb3duIH0gZnJvbSBcInNyYy9sYXRleF9zdWl0ZVwiO1xyXG5pbXBvcnQgeyBzbmlwcGV0RXh0ZW5zaW9ucyB9IGZyb20gXCIuL3NuaXBwZXRzL2NvZGVtaXJyb3IvZXh0ZW5zaW9uc1wiO1xyXG5pbXBvcnQgeyBta0NvbmNlYWxQbHVnaW4gfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9jb25jZWFsXCI7XHJcbmltcG9ydCB7IGNvbG9yUGFpcmVkQnJhY2tldHNQbHVnaW5Mb3dlc3RQcmVjLCBoaWdobGlnaHRDdXJzb3JCcmFja2V0c1BsdWdpbiB9IGZyb20gXCIuL2VkaXRvcl9leHRlbnNpb25zL2hpZ2hsaWdodF9icmFja2V0c1wiO1xyXG5pbXBvcnQgeyBjdXJzb3JUb29sdGlwQmFzZVRoZW1lLCBjdXJzb3JUb29sdGlwRmllbGQgfSBmcm9tIFwiLi9lZGl0b3JfZXh0ZW5zaW9ucy9tYXRoX3Rvb2x0aXBcIjtcclxuXHJcblxyXG5cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1vc2hlIGV4dGVuZHMgUGx1Z2luIHtcclxuICBzZXR0aW5nczogTGF0ZXhTdWl0ZVBsdWdpblNldHRpbmdzO1xyXG5cdENNU2V0dGluZ3M6IExhdGV4U3VpdGVDTVNldHRpbmdzO1xyXG5cdGVkaXRvckV4dGVuc2lvbnM6IEV4dGVuc2lvbltdID0gW107XHJcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxyXG5cclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG5cclxuXHRcdHRoaXMubG9hZEljb25zKCk7XHJcblx0XHR0aGlzLmFkZFNldHRpbmdUYWIobmV3IExhdGV4U3VpdGVTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XHJcblx0XHRsb2FkTWF0aEpheCgpO1xyXG5cclxuXHRcdHRoaXMubGVnYWN5RWRpdG9yV2FybmluZygpO1xyXG5cclxuXHRcdC8vIFJlZ2lzdGVyIExhdGV4IFN1aXRlIGV4dGVuc2lvbnMgYW5kIG9wdGlvbmFsIGVkaXRvciBleHRlbnNpb25zIGZvciBlZGl0b3IgZW5oYW5jZW1lbnRzXHJcblx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKHRoaXMuZWRpdG9yRXh0ZW5zaW9ucyk7XHJcblxyXG5cdFx0Ly8gV2F0Y2ggZm9yIGNoYW5nZXMgdG8gdGhlIHNuaXBwZXQgdmFyaWFibGVzIGFuZCBzbmlwcGV0cyBmaWxlc1xyXG5cdFx0dGhpcy53YXRjaEZpbGVzKCk7XHJcblxyXG5cdFx0dGhpcy5hZGRFZGl0b3JDb21tYW5kcygpO1xyXG4gICAgdGhpcy50aWt6UHJvY2Vzc29yPW5ldyBUaWt6amF4KHRoaXMuYXBwLHRoaXMpXHJcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3IucmVhZHlMYXlvdXQoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZWdpc3RlclRpa3pDb2RlQmxvY2soKTtcclxuICAgIFxyXG4gICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBMYXRleFN1aXRlU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibWF0aC1lbmdpbmVcIiwgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrempheFwiLCB0aGlzLnByb2Nlc3NUaWt6QmxvY2suYmluZCh0aGlzKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcclxuICAgIG5ldyBFZGl0b3JFeHRlbnNpb25zKCkuc2V0RWRpdG9yRXh0ZW5zaW9ucyh0aGlzKVxyXG4gICAgXHJcbiAgICAvL3RoaXMucmVnaXN0ZXJFZGl0b3JTdWdnZXN0KG5ldyBOdW1lcmFsc1N1Z2dlc3Rvcih0aGlzKSk7XHJcbiAgICBcclxuICB9XHJcblxyXG5cdGxlZ2FjeUVkaXRvcldhcm5pbmcoKSB7XHJcblx0XHQvLyBAdHMtaWdub3JlXHJcblx0XHRpZiAodGhpcy5hcHAudmF1bHQuY29uZmlnPy5sZWdhY3lFZGl0b3IpIHtcclxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IFwiT2JzaWRpYW4gTGF0ZXggU3VpdGU6IFRoaXMgcGx1Z2luIGRvZXMgbm90IHN1cHBvcnQgdGhlIGxlZ2FjeSBlZGl0b3IuIFN3aXRjaCB0byBMaXZlIFByZXZpZXcgbW9kZSB0byB1c2UgdGhpcyBwbHVnaW4uXCI7XHJcblxyXG5cdFx0XHRuZXcgTm90aWNlKG1lc3NhZ2UsIDEwMDAwMCk7XHJcblx0XHRcdGNvbnNvbGUubG9nKG1lc3NhZ2UpO1xyXG5cclxuXHRcdFx0cmV0dXJuO1xyXG5cdFx0fVxyXG5cdH1cclxuICBhZGRFZGl0b3JDb21tYW5kcygpIHtcclxuXHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBnZXRFZGl0b3JDb21tYW5kcyh0aGlzKSkge1xyXG5cdFx0XHR0aGlzLmFkZENvbW1hbmQoY29tbWFuZCk7XHJcblx0XHR9XHJcblx0fVxyXG4gIG9udW5sb2FkKCkge1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XHJcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IucmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCk7XHJcblx0fVxyXG5cclxuICBhc3luYyBnZXRTZXR0aW5nc1NuaXBwZXRzKHNuaXBwZXRWYXJpYWJsZXM6IFNuaXBwZXRWYXJpYWJsZXMpIHtcclxuXHRcdHRyeSB7XHJcblx0XHRcdHJldHVybiBhd2FpdCBwYXJzZVNuaXBwZXRzKHRoaXMuc2V0dGluZ3Muc25pcHBldHMsIHNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cdFx0fSBjYXRjaCAoZSkge1xyXG5cdFx0XHRuZXcgTm90aWNlKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0cyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XHJcblx0XHRcdGNvbnNvbGUubG9nKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0cyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XHJcblx0XHRcdHJldHVybiBbXTtcclxuXHRcdH1cclxuXHR9XHJcblxyXG4gIHByb2Nlc3NUaWt6QmxvY2soc291cmNlOiBzdHJpbmcsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcclxuICBjb25zdCBzdmcgPSBuZXcgVGlrelN2Zyhzb3VyY2UpO1xyXG4gIFxyXG4gIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGNvbnRhaW5lci5jcmVhdGVFbChcImRpdlwiKSwge1xyXG4gICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxyXG4gICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxyXG4gIH0pO1xyXG4gIFxyXG5cclxuICBjb25zdCBncmFwaCA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgc3R5bGU6IFwiZGlzcGxheTogZmxleDsganVzdGlmeS1jb250ZW50OiBjZW50ZXI7IGFsaWduLWl0ZW1zOiBjZW50ZXI7XCJcclxuICB9KTtcclxuICBncmFwaC5hcHBlbmRDaGlsZChzdmcuZ2V0U3ZnKCkpO1xyXG4gIHN2Zy5kZWJ1Z0luZm8rPWdyYXBoLm91dGVySFRNTFxyXG4gIC8vY29uc29sZS5sb2coZ3JhcGgub3V0ZXJIVE1MKVxyXG4gIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCBzdmcuZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgXHJcbiAgY29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xyXG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmFwaCk7XHJcbn1cclxuXHJcbmxvYWRJY29ucygpIHtcclxuICBmb3IgKGNvbnN0IFtpY29uSWQsIHN2Z0NvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKElDT05TKSkge1xyXG4gICAgYWRkSWNvbihpY29uSWQsIHN2Z0NvbnRlbnQpO1xyXG4gIH1cclxufVxyXG5hc3luYyBsb2FkU2V0dGluZ3MoKSB7XHJcbiAgbGV0IGRhdGEgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XHJcblxyXG4gIC8vIE1pZ3JhdGUgc2V0dGluZ3MgZnJvbSB2MS44LjAgLSB2MS44LjRcclxuICBjb25zdCBzaG91bGRNaWdyYXRlU2V0dGluZ3MgPSBkYXRhID8gXCJiYXNpY1NldHRpbmdzXCIgaW4gZGF0YSA6IGZhbHNlO1xyXG5cclxuICAvLyBAdHMtaWdub3JlXHJcbiAgZnVuY3Rpb24gbWlncmF0ZVNldHRpbmdzKG9sZFNldHRpbmdzKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAuLi5vbGRTZXR0aW5ncy5iYXNpY1NldHRpbmdzLFxyXG4gICAgICAuLi5vbGRTZXR0aW5ncy5yYXdTZXR0aW5ncyxcclxuICAgICAgc25pcHBldHM6IG9sZFNldHRpbmdzLnNuaXBwZXRzLFxyXG4gICAgfTtcclxuICB9XHJcblxyXG4gIGlmIChzaG91bGRNaWdyYXRlU2V0dGluZ3MpIHtcclxuICAgIGRhdGEgPSBtaWdyYXRlU2V0dGluZ3MoZGF0YSk7XHJcbiAgfVxyXG5cclxuICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgZGF0YSk7XHJcblxyXG4gIGlmIChzaG91bGRNaWdyYXRlU2V0dGluZ3MpIHtcclxuICAgIHRoaXMuc2F2ZVNldHRpbmdzKCk7XHJcbiAgfVxyXG5cclxuICBpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSB8fCB0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpIHtcclxuICAgIGNvbnN0IHRlbXBTbmlwcGV0VmFyaWFibGVzID0gYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRWYXJpYWJsZXMoKTtcclxuICAgIGNvbnN0IHRlbXBTbmlwcGV0cyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyh0ZW1wU25pcHBldFZhcmlhYmxlcyk7XHJcblxyXG4gICAgdGhpcy5DTVNldHRpbmdzID0gcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5ncyh0ZW1wU25pcHBldHMsIHRoaXMuc2V0dGluZ3MpO1xyXG5cclxuICAgIC8vIFVzZSBvbkxheW91dFJlYWR5IHNvIHRoYXQgd2UgZG9uJ3QgdHJ5IHRvIHJlYWQgdGhlIHNuaXBwZXRzIGZpbGUgdG9vIGVhcmx5XHJcbiAgICB0aGlzLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XHJcbiAgICAgIHRoaXMucHJvY2Vzc1NldHRpbmdzKCk7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgZWxzZSB7XHJcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3NTZXR0aW5ncygpO1xyXG4gIH1cclxufVxyXG5cclxuICBhc3luYyBzYXZlU2V0dGluZ3MoZGlkRmlsZUxvY2F0aW9uQ2hhbmdlID0gZmFsc2UpIHtcclxuXHRcdGF3YWl0IHRoaXMuc2F2ZURhdGEodGhpcy5zZXR0aW5ncyk7XHJcblx0XHR0aGlzLnByb2Nlc3NTZXR0aW5ncyhkaWRGaWxlTG9jYXRpb25DaGFuZ2UpO1xyXG5cdH1cclxuXHJcbiAgYXN5bmMgcHJvY2Vzc1NldHRpbmdzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID0gZmFsc2UsIGJlY2F1c2VGaWxlVXBkYXRlZCA9IGZhbHNlKSB7XHJcblx0XHR0aGlzLkNNU2V0dGluZ3MgPSBwcm9jZXNzTGF0ZXhTdWl0ZVNldHRpbmdzKGF3YWl0IHRoaXMuZ2V0U25pcHBldHMoYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQsIGJlY2F1c2VGaWxlVXBkYXRlZCksIHRoaXMuc2V0dGluZ3MpO1xyXG5cdFx0dGhpcy5zZXRFZGl0b3JFeHRlbnNpb25zKCk7XHJcblx0XHQvLyBSZXF1ZXN0IE9ic2lkaWFuIHRvIHJlY29uZmlndXJlIENNIGV4dGVuc2lvbnNcclxuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS51cGRhdGVPcHRpb25zKCk7XHJcblx0fVxyXG4gIFxyXG4gIGFzeW5jIGdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpIHtcclxuXHRcdHRyeSB7XHJcblx0XHRcdHJldHVybiBhd2FpdCBwYXJzZVNuaXBwZXRWYXJpYWJsZXModGhpcy5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRjb25zb2xlLmxvZyhgRmFpbGVkIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRyZXR1cm4ge307XHJcblx0XHR9XHJcblx0fVxyXG4gIGFzeW5jIGdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcclxuXHRcdC8vIEdldCBmaWxlcyBpbiBzbmlwcGV0L3ZhcmlhYmxlIGZvbGRlcnMuXHJcblx0XHQvLyBJZiBlaXRoZXIgaXMgc2V0IHRvIGJlIGxvYWRlZCBmcm9tIHNldHRpbmdzIHRoZSBzZXQgd2lsbCBqdXN0IGJlIGVtcHR5LlxyXG5cdFx0Y29uc3QgZmlsZXMgPSBnZXRGaWxlU2V0cyh0aGlzKTtcclxuXHJcblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzID1cclxuXHRcdFx0dGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlXHJcblx0XHRcdFx0PyBhd2FpdCBnZXRWYXJpYWJsZXNGcm9tRmlsZXModGhpcywgZmlsZXMpXHJcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpO1xyXG5cclxuXHRcdC8vIFRoaXMgbXVzdCBiZSBkb25lIGluIGVpdGhlciBjYXNlLCBiZWNhdXNlIGl0IGFsc28gdXBkYXRlcyB0aGUgc2V0IG9mIHNuaXBwZXQgZmlsZXNcclxuXHRcdGNvbnN0IHVua25vd25GaWxlVmFyaWFibGVzID0gYXdhaXQgdHJ5R2V0VmFyaWFibGVzRnJvbVVua25vd25GaWxlcyh0aGlzLCBmaWxlcyk7XHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKSB7XHJcblx0XHRcdC8vIEJ1dCB3ZSBvbmx5IHVzZSB0aGUgdmFsdWVzIGlmIHRoZSB1c2VyIHdhbnRzIHRoZW1cclxuXHRcdFx0T2JqZWN0LmFzc2lnbihzbmlwcGV0VmFyaWFibGVzLCB1bmtub3duRmlsZVZhcmlhYmxlcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldHMgPVxyXG5cdFx0XHR0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlXHJcblx0XHRcdFx0PyBhd2FpdCBnZXRTbmlwcGV0c0Zyb21GaWxlcyh0aGlzLCBmaWxlcywgc25pcHBldFZhcmlhYmxlcylcclxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzKTtcclxuICAgIGNvbnNvbGUubG9nKCd0aGlzLnNldHRpbmdzLnNuaXBwZXRzJyxzbmlwcGV0cylcclxuXHRcdHRoaXMuc2hvd1NuaXBwZXRzTG9hZGVkTm90aWNlKHNuaXBwZXRzLmxlbmd0aCwgT2JqZWN0LmtleXMoc25pcHBldFZhcmlhYmxlcykubGVuZ3RoLCAgYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQsIGJlY2F1c2VGaWxlVXBkYXRlZCk7XHJcblxyXG5cdFx0cmV0dXJuIHNuaXBwZXRzO1xyXG5cdH1cclxuICBzaG93U25pcHBldHNMb2FkZWROb3RpY2UoblNuaXBwZXRzOiBudW1iZXIsIG5TbmlwcGV0VmFyaWFibGVzOiBudW1iZXIsIGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcclxuXHRcdGlmICghKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkIHx8IGJlY2F1c2VGaWxlVXBkYXRlZCkpXHJcblx0XHRcdHJldHVybjtcclxuXHJcblx0XHRjb25zdCBwcmVmaXggPSBiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCA/IFwiTG9hZGVkIFwiIDogXCJTdWNjZXNzZnVsbHkgcmVsb2FkZWQgXCI7XHJcblx0XHRjb25zdCBib2R5ID0gW107XHJcblxyXG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUpXHJcblx0XHRcdGJvZHkucHVzaChgJHtuU25pcHBldHN9IHNuaXBwZXRzYCk7XHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKVxyXG5cdFx0XHRib2R5LnB1c2goYCR7blNuaXBwZXRWYXJpYWJsZXN9IHNuaXBwZXQgdmFyaWFibGVzYCk7XHJcblxyXG5cdFx0Y29uc3Qgc3VmZml4ID0gXCIgZnJvbSBmaWxlcy5cIjtcclxuXHRcdG5ldyBOb3RpY2UocHJlZml4ICsgYm9keS5qb2luKFwiIGFuZCBcIikgKyBzdWZmaXgsIDUwMDApO1xyXG5cdH1cclxuICBzZXRFZGl0b3JFeHRlbnNpb25zKCkge1xyXG5cdFx0Ly8gUmVtb3ZlIGFsbCBjdXJyZW50bHkgbG9hZGVkIENNIGV4dGVuc2lvbnNcclxuXHRcdC8vIEluIG9yZGVyIGZvciAndGhpcy5hcHAud29ya3NwYWNlLnVwZGF0ZU9wdGlvbnMoKScgdG8gZnVuY3Rpb24gYXNcclxuXHRcdC8vIGV4cGVjdGVkLCB5b3UgY2Fubm90IGFzc2lnbiBhIG5ldyBhcnJheSB0byAndGhpcy5lZGl0b3JFeHRlbnNpb25zJy5cclxuXHRcdHdoaWxlICh0aGlzLmVkaXRvckV4dGVuc2lvbnMubGVuZ3RoKSB0aGlzLmVkaXRvckV4dGVuc2lvbnMucG9wKCk7XHJcblxyXG5cdFx0Ly8gQ29tcHVsc29yeSBleHRlbnNpb25zXHJcblx0XHR0aGlzLmVkaXRvckV4dGVuc2lvbnMucHVzaChbXHJcblx0XHRcdGdldExhdGV4U3VpdGVDb25maWdFeHRlbnNpb24odGhpcy5DTVNldHRpbmdzKSxcclxuXHRcdFx0UHJlYy5oaWdoZXN0KEVkaXRvclZpZXcuZG9tRXZlbnRIYW5kbGVycyh7IFwia2V5ZG93blwiOiBvbktleWRvd24gfSkpLFxyXG5cdFx0XHRFZGl0b3JWaWV3LnVwZGF0ZUxpc3RlbmVyLm9mKGhhbmRsZVVwZGF0ZSksXHJcblx0XHRcdHNuaXBwZXRFeHRlbnNpb25zLFxyXG5cdFx0XSk7XHJcblxyXG5cdFx0Ly8gT3B0aW9uYWwgZXh0ZW5zaW9uc1xyXG5cdFx0aWYgKHRoaXMuQ01TZXR0aW5ncy5jb25jZWFsRW5hYmxlZCkge1xyXG5cdFx0XHRjb25zdCB0aW1lb3V0ID0gdGhpcy5DTVNldHRpbmdzLmNvbmNlYWxSZXZlYWxUaW1lb3V0O1xyXG5cdFx0XHR0aGlzLmVkaXRvckV4dGVuc2lvbnMucHVzaChta0NvbmNlYWxQbHVnaW4odGltZW91dCkuZXh0ZW5zaW9uKTtcclxuXHRcdH1cclxuXHRcdGlmICh0aGlzLkNNU2V0dGluZ3MuY29sb3JQYWlyZWRCcmFja2V0c0VuYWJsZWQpXHJcblx0XHRcdHRoaXMuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKGNvbG9yUGFpcmVkQnJhY2tldHNQbHVnaW5Mb3dlc3RQcmVjKTtcclxuXHRcdGlmICh0aGlzLkNNU2V0dGluZ3MuaGlnaGxpZ2h0Q3Vyc29yQnJhY2tldHNFbmFibGVkKVxyXG5cdFx0XHR0aGlzLmVkaXRvckV4dGVuc2lvbnMucHVzaChoaWdobGlnaHRDdXJzb3JCcmFja2V0c1BsdWdpbi5leHRlbnNpb24pO1xyXG5cdFx0aWYgKHRoaXMuQ01TZXR0aW5ncy5tYXRoUHJldmlld0VuYWJsZWQpXHJcblx0XHRcdHRoaXMuZWRpdG9yRXh0ZW5zaW9ucy5wdXNoKFtcclxuXHRcdFx0XHRjdXJzb3JUb29sdGlwRmllbGQuZXh0ZW5zaW9uLFxyXG5cdFx0XHRcdGN1cnNvclRvb2x0aXBCYXNlVGhlbWUsXHJcblx0XHRcdFx0dG9vbHRpcHMoeyBwb3NpdGlvbjogXCJhYnNvbHV0ZVwiIH0pLFxyXG5cdFx0XHRdKTtcclxuXHR9XHJcbiAgcHJpdmF0ZSByZWdpc3RlckNvbW1hbmRzKCkge1xyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwib3Blbi1pbnB1dC1mb3JtXCIsXHJcbiAgICAgIG5hbWU6IFwiT3BlbiBJbnB1dCBGb3JtXCIsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PiBuZXcgVmVjSW5wdXRNb2RlbCh0aGlzLmFwcCx0aGlzKS5vcGVuKCksXHJcbiAgICB9KTtcclxuXHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJ2aWV3LXNlc3Npb24taGlzdG9yeVwiLFxyXG4gICAgICBuYW1lOiBcIlZpZXcgU2Vzc2lvbiBIaXN0b3J5XCIsXHJcbiAgICAgIC8vY2FsbGJhY2s6ICgpID0+IG5ldyBIaXN0b3J5TW9kYWwodGhpcy5hcHAsIHRoaXMpLm9wZW4oKSxcclxuICAgIH0pO1xyXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcclxuICAgICAgaWQ6IFwidGVzdC1tYXRoRW5naW5lXCIsXHJcbiAgICAgIG5hbWU6IFwidGVzdCBtYXRoIGVuZ2luZVwiLFxyXG4gICAgICBjYWxsYmFjazogKCkgPT50ZXN0TWF0aEVuZ2luZSgpLFxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIHdhdGNoRmlsZXMoKSB7XHJcblx0XHQvLyBPbmx5IGJlZ2luIHdhdGNoaW5nIGZpbGVzIG9uY2UgdGhlIGxheW91dCBpcyByZWFkeVxyXG5cdFx0Ly8gT3RoZXJ3aXNlLCB3ZSdsbCBiZSB1bm5lY2Vzc2FyaWx5IHJlYWN0aW5nIHRvIG1hbnkgb25GaWxlQ3JlYXRlIGV2ZW50cyBvZiBzbmlwcGV0IGZpbGVzXHJcblx0XHQvLyB0aGF0IG9jY3VyIHdoZW4gT2JzaWRpYW4gZmlyc3QgbG9hZHNcclxuXHJcblx0XHR0aGlzLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XHJcblxyXG5cdFx0XHRjb25zdCBldmVudHNBbmRDYWxsYmFja3MgPSB7XHJcblx0XHRcdFx0XCJtb2RpZnlcIjogb25GaWxlQ2hhbmdlLFxyXG5cdFx0XHRcdFwiZGVsZXRlXCI6IG9uRmlsZURlbGV0ZSxcclxuXHRcdFx0XHRcImNyZWF0ZVwiOiBvbkZpbGVDcmVhdGVcclxuXHRcdFx0fTtcclxuXHJcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGV2ZW50c0FuZENhbGxiYWNrcykpIHtcclxuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yXHJcblx0XHRcdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKGtleSwgKGZpbGUpID0+IHZhbHVlKHRoaXMsIGZpbGUpKSk7XHJcblx0XHRcdH1cclxuXHRcdH0pO1xyXG5cdH1cclxuXHJcbiAgcHJpdmF0ZSBwcm9jZXNzTWF0aEJsb2NrKHNvdXJjZTogc3RyaW5nLCBtYWluQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xyXG4gICAgbWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1jb250YWluZXJcIik7XHJcbiAgICBcclxuICAgIGNvbnN0IHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcclxuICAgIGxldCBza2lwcGVkSW5kZXhlcyA9IDA7XHJcblxyXG4gICAgY29uc3QgZXhwcmVzc2lvbnMgPSBzb3VyY2Uuc3BsaXQoXCJcXG5cIikubWFwKGxpbmUgPT4gbGluZS50cmltKCkpLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCA9PT0gMCkge3JldHVybjt9XHJcblxyXG4gICAgXHJcbiAgICBleHByZXNzaW9ucy5mb3JFYWNoKChleHByZXNzaW9uLCBpbmRleCkgPT4ge1xyXG4gICAgICBsZXQgbGluZUNvbnRhaW5lcjogSFRNTERpdkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICBsaW5lQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJtYXRoLWxpbmUtY29udGFpbmVyXCIsIChpbmRleC1za2lwcGVkSW5kZXhlcykgJSAyID09PSAwID8gXCJtYXRoLXJvdy1ldmVuXCIgOiBcIm1hdGgtcm93LW9kZFwiKTtcclxuICAgICAgLy9pZiAoZXhwcmVzc2lvbi5tYXRjaCgvXlxcL1xcLy8pKXt9XHJcbiAgICAgIGNvbnN0IHByb2Nlc3NNYXRoID0gbmV3IFByb2Nlc3NNYXRoKGV4cHJlc3Npb24sdXNlclZhcmlhYmxlcywgdGhpcy5hcHAsbGluZUNvbnRhaW5lcik7XHJcbiAgICAgIHByb2Nlc3NNYXRoLmluaXRpYWxpemUoKTtcclxuXHJcbiAgICAgIGlmKHByb2Nlc3NNYXRoLm1vZGUhPT1cInZhcmlhYmxlXCIpe1xyXG4gICAgICAgIGxpbmVDb250YWluZXIgPSBwcm9jZXNzTWF0aC5jb250YWluZXIgYXMgSFRNTERpdkVsZW1lbnQ7XHJcbiAgICAgICAgbWFpbkNvbnRhaW5lci5hcHBlbmRDaGlsZChsaW5lQ29udGFpbmVyKTtcclxuICAgICAgfVxyXG4gICAgICBlbHNle3NraXBwZWRJbmRleGVzKys7fVxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5jbGFzcyBQcm9jZXNzTWF0aCB7XHJcbiAgbWF0aElucHV0OiBhbnk7XHJcbiAgdXNlclZhcmlhYmxlczogeyB2YXJpYWJsZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xyXG4gIG1vZGUgPSBcIm1hdGhcIjtcclxuICByZXN1bHQ6IGFueTtcclxuICBjb250YWluZXI6IEhUTUxFbGVtZW50O1xyXG4gIGljb25zRGl2OiBIVE1MRWxlbWVudDtcclxuICBhcHA6IEFwcDtcclxuXHJcbiAgY29uc3RydWN0b3IobWF0aElucHV0OiBzdHJpbmcsdXNlclZhcmlhYmxlczogYW55LCBhcHA6IEFwcCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xyXG4gICAgdGhpcy5tYXRoSW5wdXQgPSBtYXRoSW5wdXQ7XHJcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXM9dXNlclZhcmlhYmxlcztcclxuICAgIHRoaXMuYXBwID0gYXBwO1xyXG4gICAgdGhpcy5jb250YWluZXIgPSBjb250YWluZXI7XHJcbiAgICB0aGlzLmljb25zRGl2ID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWljb25zXCIsXHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIGFzeW5jIGluaXRpYWxpemUoKSB7XHJcbiAgICB0aGlzLmFzc2lnbk1vZGUoKTtcclxuICAgIHRoaXMuc2V0dXBDb250YWluZXIoKTtcclxuICAgIHRoaXMuaGFuZGxlVmFyaWFibGVzKCk7XHJcbiAgICB0aGlzLnJlbmRlck1hdGgoKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgc2V0dXBDb250YWluZXIoKSB7XHJcbiAgICBbXCJtYXRoLWlucHV0XCIsIFwibWF0aC1yZXN1bHRcIl0uZm9yRWFjaChjbGFzc05hbWUgPT4ge1xyXG4gICAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICBkaXYuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xyXG4gICAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXYpO1xyXG4gICAgfSk7XHJcbiAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmljb25zRGl2KTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVuZGVyTWF0aCgpIHtcclxuICAgIGNvbnN0IGlucHV0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLWlucHV0XCIpIGFzIEhUTUxFbGVtZW50O1xyXG4gICAgY29uc3QgcmVzdWx0RGl2ID0gdGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcihcIi5tYXRoLXJlc3VsdFwiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIHRyeSB7XHJcbiAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XHJcbiAgICAgICAgY2FzZSBcImJpbm9tXCI6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIGNvbnN0IGJpbm9tTW9kZWwgPSBuZXcgQmlub21JbmZvTW9kZWwodGhpcy5hcHAsIHRoaXMubWF0aElucHV0KTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKGJpbm9tTW9kZWwpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSBiaW5vbU1vZGVsLmdldEVxdWFsKCk7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwiY29zXCI6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIGNvbnN0IFsgLCBzaWRlQSwgc2lkZUIsIHNpZGVDIF0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoTnVtYmVyKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0PWZpbmRBbmdsZUJ5Q29zaW5lUnVsZShzaWRlQSwgc2lkZUIsIHNpZGVDKVxyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcInZlY1wiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD1uZXcgVmVjUHJvY2Vzc29yKHRoaXMubWF0aElucHV0WzFdLHRoaXMubWF0aElucHV0WzJdLHRoaXMubWF0aElucHV0WzNdKTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyB0aWt6R3JhcGgodGhpcy5hcHAsIHRoaXMucmVzdWx0LmdyYXBoKSk7XHJcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0LnZlY0luZm8uZGVidWdJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD10aGlzLnJlc3VsdC5yZXN1bHRcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ2YXJpYWJsZVwiOlxyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSBuZXcgTWF0aFByYWlzZXIodGhpcy5tYXRoSW5wdXQpO1xyXG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwobmV3IEluZm9Nb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8pKTtcclxuICAgICAgICAgIHRoaXMuYWRkRGVidWdNb2RlbChuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQubWF0aEluZm8uZGVidWdJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLm1hdGhJbnB1dD10aGlzLnJlc3VsdC5pbnB1dDtcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gdGhpcy5yZXN1bHQuc29sdXRpb247XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgIHRoaXMuYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXYsIHJlc3VsdERpdiwgdHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIj90aGlzLm1hdGhJbnB1dDp0aGlzLm1hdGhJbnB1dFswXSwgcm91bmRCeVNldHRpbmdzKHRoaXMucmVzdWx0KSk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgdGhpcy5kaXNwbGF5RXJyb3IoaW5wdXREaXYsIHJlc3VsdERpdiwgZXJyKTtcclxuICAgICAgY29uc29sZS5lcnJvcihcIlRoZSBpbml0aWFsIHByYWlzaW5nIGZhaWxlZFwiLGVycik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2OiBIVE1MRWxlbWVudCwgcmVzdWx0RGl2OiBIVE1MRWxlbWVudCwgaW5wdXQ6IHN0cmluZywgcmVzdWx0OiBhbnkpIHtcclxuICAgIGlucHV0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoaW5wdXQsdHJ1ZSkpXHJcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcJHske2lucHV0fX0kYCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgICAvL2NvbnN0IHJlc3VsdE91dHB1dCA9IC8odHJ1ZXxmYWxzZSkvLnRlc3QocmVzdWx0KSA/IHJlc3VsdCA6IGBcXCR7JHtyZXN1bHR9fSRgO1xyXG4gICAgcmVzdWx0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgocmVzdWx0LnRvU3RyaW5nKCksdHJ1ZSkpXHJcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24ocmVzdWx0T3V0cHV0LCByZXN1bHREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGRpc3BsYXlFcnJvcihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGVycjogRXJyb3IpIHtcclxuICAgIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24odGhpcy5tYXRoSW5wdXQsIGlucHV0RGl2LCBcIlwiLCBuZXcgQ29tcG9uZW50KCkpO1xyXG4gICAgcmVzdWx0RGl2LmlubmVySFRNTCA9IGA8c3BhbiBjbGFzcz1cImVycm9yLXRleHRcIj4ke2Vyci5tZXNzYWdlfTwvc3Bhbj5gO1xyXG4gICAgdGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtZXJyb3ItbGluZVwiKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXNzaWduTW9kZSgpIHtcclxuICAgIGNvbnN0IHJlZ2V4TGlzdCA9IEdldE1hdGhDb250ZXh0UmVnZXgoKTtcclxuICAgIGNvbnN0IG1hdGNoT2JqZWN0ID0gcmVnZXhMaXN0LmZpbmQocmVnZXhPYmogPT4gcmVnZXhPYmoucmVnZXgudGVzdCh0aGlzLm1hdGhJbnB1dCkpO1xyXG4gICAgaWYgKG1hdGNoT2JqZWN0KSB7XHJcbiAgICAgIHRoaXMubW9kZSA9IG1hdGNoT2JqZWN0LnZhbHVlO1xyXG4gICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0Lm1hdGNoKG1hdGNoT2JqZWN0LnJlZ2V4KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkSW5mb01vZGFsKG1vZGFsOiBhbnkpIHtcclxuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtaW5mby1pY29uXCIsXHJcbiAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcclxuICAgIH0pO1xyXG4gICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbW9kYWwub3BlbigpO1xyXG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYWRkRGVidWdNb2RlbChtb2RhbDogYW55KSB7XHJcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XHJcbiAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcclxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+QnlwiLFxyXG4gICAgfSk7XHJcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XHJcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZXMoKSB7XHJcbiAgICBpZiAodGhpcy5tb2RlPT09XCJ2YXJpYWJsZVwiKSB7XHJcbiAgICAgIHRoaXMuaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5yZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlRGVjbGFyYXRpb24oKSB7XHJcbiAgICBjb25zdCBbXyx2YXJpYWJsZSwgdmFsdWVdID0gdGhpcy5tYXRoSW5wdXQubWFwKChwYXJ0OiBzdHJpbmcpID0+IHBhcnQudHJpbSgpKTtcclxuICAgIGlmICghdmFyaWFibGUgfHwgIXZhbHVlKSB7XHJcbiAgICAgIGNvbnNvbGUud2FybihgSW52YWxpZCB2YXJpYWJsZSBkZWNsYXJhdGlvbjogJHt0aGlzLm1hdGhJbnB1dH1gKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZXhpc3RpbmdWYXJJbmRleCA9IHRoaXMudXNlclZhcmlhYmxlcy5maW5kSW5kZXgodiA9PiB2LnZhcmlhYmxlID09PSB2YXJpYWJsZSk7XHJcbiAgICBpZiAoZXhpc3RpbmdWYXJJbmRleCAhPT0gLTEpIHtcclxuICAgICAgdGhpcy51c2VyVmFyaWFibGVzW2V4aXN0aW5nVmFySW5kZXhdLnZhbHVlID0gdmFsdWU7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXMucHVzaCh7IHZhcmlhYmxlLCB2YWx1ZSB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgcmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpe1xyXG4gICAgdGhpcy51c2VyVmFyaWFibGVzLmZvckVhY2goKHsgdmFyaWFibGUsIHZhbHVlIH0pID0+IHtcclxuICAgICAgaWYgKHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCIpe1xyXG4gICAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQucmVwbGFjZSh2YXJpYWJsZSwgdmFsdWUpO1xyXG4gICAgICB9XHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBHZXRNYXRoQ29udGV4dFJlZ2V4KCkge1xyXG4gIHJldHVybiBbXHJcbiAgICB7IHJlZ2V4OiAvYmlub21cXCgoXFxkKyksKFxcZCspLChcXGQrKVxcKS8sIHZhbHVlOiBcImJpbm9tXCIgfSxcclxuICAgIHsgcmVnZXg6IC92ZWMoWystXXswLDJ9KVxcKChbXFxkListXStbOixdW1xcZC4rLV0rKVxcKShbXFxkListXSopLywgdmFsdWU6IFwidmVjXCIgfSxcclxuICAgIHsgcmVnZXg6IC9jb3NcXCgoW1xcZC5dKyksKFtcXGQuXSspLChbXFxkLl0rKVxcKS8sIHZhbHVlOiBcImNvc1wiIH0sXHJcbiAgICB7IHJlZ2V4OiAvdmFyXFxzKihbXFx3XSspXFxzKj1cXHMqKFtcXGQuXSspLywgdmFsdWU6IFwidmFyaWFibGVcIiB9LFxyXG4gIF07XHJcbn1cclxuXHJcblxyXG5jbGFzcyBWZWNQcm9jZXNzb3Ige1xyXG4gIHVzZXJJbnB1dDogYW55O1xyXG4gIGVudmlyb25tZW50OiB7IFg6IHN0cmluZzsgWTogc3RyaW5nIH07XHJcbiAgdmVjSW5mbyA9IG5ldyBNYXRoSW5mbygpO1xyXG4gIGF4aXM6IEF4aXM7XHJcbiAgbW9kaWZpZXI6IG51bWJlcjtcclxuICByZXN1bHQ6IHN0cmluZztcclxuICBncmFwaD86IGFueTtcclxuXHJcbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgbWF0aElucHV0OiBzdHJpbmcsIG1vZGlmaWVyOiBzdHJpbmcpIHtcclxuICAgIHRoaXMudXNlcklucHV0PW1hdGhJbnB1dDtcclxuICAgIGNvbnN0IG1hdGNoID0gZW52aXJvbm1lbnQubWF0Y2goLyhbKy1dPykoWystXT8pLyk7XHJcbiAgICB0aGlzLmVudmlyb25tZW50ID0geyBYOiBtYXRjaD8uWzFdID8/IFwiK1wiLCBZOiBtYXRjaD8uWzJdID8/IFwiK1wiIH07XHJcblxyXG4gICAgdGhpcy5tb2RpZmllciA9IG1vZGlmaWVyLmxlbmd0aCA+IDAgPyBnZXRVc2FibGVEZWdyZWVzKE51bWJlcihtb2RpZmllcikpIDogMDtcclxuXHJcbiAgICB0aGlzLmF4aXM9bmV3IEF4aXMoKS51bml2ZXJzYWwodGhpcy51c2VySW5wdXQpXHJcbiAgICBpZiAoIXRoaXMuYXhpcy5wb2xhckFuZ2xlKVxyXG4gICAgICB0aGlzLmF4aXMuY2FydGVzaWFuVG9Qb2xhcigpO1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcImF4aXNcIix0aGlzLmF4aXMpO1xyXG4gICAgdGhpcy5hZGRSZXN1bHQoKTtcclxuICAgIHRoaXMuYWRkR3JhcGgoKTtcclxuICB9XHJcbiAgYWRkUmVzdWx0KCl7XHJcbiAgICBpZiAodGhpcy51c2VySW5wdXQuaW5jbHVkZXMoXCI6XCIpKVxyXG4gICAgICB0aGlzLnJlc3VsdD1geCA9ICR7dGhpcy5heGlzLmNhcnRlc2lhblh9XFxcXHF1YWQseSA9ICR7dGhpcy5heGlzLmNhcnRlc2lhbll9YFxyXG4gICAgZWxzZVxyXG4gICAgICB0aGlzLnJlc3VsdD1gYW5nbGUgPSAke3RoaXMuYXhpcy5wb2xhckFuZ2xlfVxcXFxxdWFkLGxlbmd0aCA9ICR7dGhpcy5heGlzLnBvbGFyTGVuZ3RofWBcclxuICB9XHJcbiAgYWRkR3JhcGgoKSB7XHJcbiAgICBjb25zdCB0YXJnZXRTaXplID0gMTA7XHJcbiAgICBjb25zdCBtYXhDb21wb25lbnQgPSBNYXRoLm1heChNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWCksIE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKSk7XHJcblxyXG4gICAgLy8gRGV0ZXJtaW5lIHNjYWxpbmcgZmFjdG9yXHJcbiAgICBsZXQgc2NhbGUgPSAxO1xyXG4gICAgaWYgKG1heENvbXBvbmVudCA8IHRhcmdldFNpemUpIHtcclxuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xyXG4gICAgfSBlbHNlIGlmIChtYXhDb21wb25lbnQgPiB0YXJnZXRTaXplKSB7XHJcbiAgICAgIHNjYWxlID0gdGFyZ2V0U2l6ZSAvIG1heENvbXBvbmVudDtcclxuICAgIH1cclxuICAgIC8vIGkgbmVlZCB0byBtYWtlIGl0IFwidG8gWCBheGlzXCJcclxuICAgIC8vY29uc3QgdmVjdG9yQW5nbGUgPSBnZXRVc2FibGVEZWdyZWVzKHJhZGlhbnNUb0RlZ3JlZXMoTWF0aC5hdGFuMihzY2FsZWRZLCBzY2FsZWRYKSkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygwLDApO1xyXG5cclxuXHJcbiAgIC8vIGNvbnN0IGRyYXc9IFthbmNlciwnLS0nLG5ldyBDb29yZGluYXRlKHttb2RlOlwibm9kZS1pbmxpbmVcIixsYWJlbDogdGhpcy5heGlzLnBvbGFyTGVuZ3RoLnRvU3RyaW5nKCl9KSx0aGlzLmF4aXNdO1xyXG4gICAgLy9jb25zdCBkcmF3WD0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWC50b1N0cmluZygpfSksbmV3IEF4aXModGhpcy5heGlzLmNhcnRlc2lhblgsMCldO1xyXG4gICAgLy9jb25zdCBkcmF3WT0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWS50b1N0cmluZygpfSksbmV3IEF4aXMoMCx0aGlzLmF4aXMuY2FydGVzaWFuWSldO1xyXG5cclxuICAgIHRoaXMuZ3JhcGg9W1xyXG4gICAgICAvL25ldyBGb3JtYXR0aW5nKFwiZ2xvYm9sXCIse2NvbG9yOiBcIndoaXRlXCIsc2NhbGU6IDEsfSksXHJcbiAgICAgIC8vbmV3IERyYXcoe2RyYXdBcnI6IGRyYXcsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInJlZFwiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcclxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhd1gsZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcclxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhd1ksZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcclxuICAgIF1cclxuICAgIFxyXG4gICAgXHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaFwiLEpTT04uc3RyaW5naWZ5KHRoaXMuZ3JhcGgudG9rZW5zLG51bGwsMSkpO1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGgudG9TdHJpbmcoKVxcblwiLEpTT04uc3RyaW5naWZ5KHRoaXMuZ3JhcGgudG9TdHJpbmcoKSkpO1xyXG4gICAgLyogR2VuZXJhdGUgTGFUZVggY29kZSBmb3IgdmVjdG9yIGNvbXBvbmVudHMgYW5kIG1haW4gdmVjdG9yXHJcbiAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcclxuXHJcbiAgICAgICUgQW5nbGUgQW5ub3RhdGlvblxyXG4gICAgICAlXFxhbmd7WH17YW5jfXt2ZWN9e317JHtyb3VuZEJ5U2V0dGluZ3ModmVjdG9yQW5nbGUpfSRee1xcY2lyY30kfVxyXG4gICAgYC5yZXBsYWNlKC9eXFxzKy9nbSwgXCJcIik7Ki9cclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJTY2FsaW5nIGZhY3RvclwiLCBzY2FsZSk7XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIHRpa3pHcmFwaCBleHRlbmRzIE1vZGFsIHtcclxuICB0aWt6OiBGb3JtYXRUaWt6amF4O1xyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLHRpa3pDb2RlOiBhbnkpe1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIHRoaXMudGlrej1uZXcgRm9ybWF0VGlrempheCh0aWt6Q29kZSk7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnN0IGNvZGU9dGhpcy50aWt6O1xyXG4gICAgY29uc3Qgc2NyaXB0ID0gY29udGVudEVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xyXG4gICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XHJcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgc2NyaXB0LnNldFRleHQoY29kZS5nZXRDb2RlKCkpO1xyXG4gICAgXHJcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcclxuXHJcbiAgICBhY3Rpb25CdXR0b24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6LmdldENvZGUoKSk7XHJcbiAgICAgIG5ldyBOb3RpY2UoXCJHcmFwaCBjb3BpZWQgdG8gY2xpcGJvYXJkIVwiKTtcclxuICAgIH0pO1xyXG4gIH1cclxuICBvbkNsb3NlKCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xyXG4gIH1cclxufVxyXG5cclxudHlwZSBEaXN0cmlidXRpb25UeXBlID0gJ25vcm1hbCcgfCAnYmlub21pYWwnIHwgJ3BvaXNzb24nO1xyXG5cclxuY2xhc3MgRGlzdHJpYnV0aW9uIHtcclxuICBwcml2YXRlIHR5cGU6IERpc3RyaWJ1dGlvblR5cGU7XHJcbiAgcHJpdmF0ZSB4OiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBtdTogbnVtYmVyO1xyXG4gIHByaXZhdGUgc2lnbWE6IG51bWJlclxyXG4gIHByaXZhdGUgdmFyaWFuY2U6IG51bWJlclxyXG5cclxuICBcclxuXHJcbiAgLy8gRm9yIEJpbm9taWFsIERpc3RyaWJ1dGlvblxyXG4gIHByaXZhdGUgdHJpYWxzOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwcm9iYWJpbGl0eTogbnVtYmVyO1xyXG5cclxuICAvLyBGb3IgUG9pc3NvbiBEaXN0cmlidXRpb25cclxuICBwcml2YXRlIGxhbWJkYTogbnVtYmVyO1xyXG4gIC8qXHJcbiAgY29uc3RydWN0b3IodHlwZTogRGlzdHJpYnV0aW9uVHlwZSwgcGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+KSB7XHJcbiAgICB0aGlzLnR5cGUgPSB0eXBlO1xyXG5cclxuICAgIC8vIEluaXRpYWxpemUgYmFzZWQgb24gZGlzdHJpYnV0aW9uIHR5cGVcclxuICAgIHN3aXRjaCAodHlwZSkge1xyXG4gICAgICBjYXNlICdub3JtYWwnOlxyXG4gICAgICAgIHRoaXMubWVhbiA9IHBhcmFtcy5tZWFuIHx8IDA7XHJcbiAgICAgICAgdGhpcy5zdGREZXYgPSBwYXJhbXMuc3RkRGV2IHx8IDE7XHJcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMuc3RkRGV2ICoqIDI7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgJ2Jpbm9taWFsJzpcclxuICAgICAgICB0aGlzLnRyaWFscyA9IHBhcmFtcy50cmlhbHMgfHwgMTtcclxuICAgICAgICB0aGlzLnByb2JhYmlsaXR5ID0gcGFyYW1zLnByb2JhYmlsaXR5IHx8IDAuNTtcclxuICAgICAgICB0aGlzLm1lYW4gPSB0aGlzLnRyaWFscyAqIHRoaXMucHJvYmFiaWxpdHk7XHJcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubWVhbiAqICgxIC0gdGhpcy5wcm9iYWJpbGl0eSk7XHJcbiAgICAgICAgdGhpcy5zdGREZXYgPSBNYXRoLnNxcnQodGhpcy52YXJpYW5jZSk7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgIGNhc2UgJ3BvaXNzb24nOlxyXG4gICAgICAgIHRoaXMubGFtYmRhID0gcGFyYW1zLmxhbWJkYSB8fCAxO1xyXG4gICAgICAgIHRoaXMubWVhbiA9IHRoaXMubGFtYmRhO1xyXG4gICAgICAgIHRoaXMudmFyaWFuY2UgPSB0aGlzLmxhbWJkYTtcclxuICAgICAgICB0aGlzLnN0ZERldiA9IE1hdGguc3FydCh0aGlzLnZhcmlhbmNlKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIGRpc3RyaWJ1dGlvbiB0eXBlJyk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgbm9ybWFsUERGKHg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBpZiAodGhpcy50eXBlICE9PSAnbm9ybWFsJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BERiBvbmx5IGFwcGxpZXMgdG8gdGhlIE5vcm1hbCBEaXN0cmlidXRpb24nKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGV4cFBhcnQgPSBNYXRoLmV4cCgtKCh4IC0gdGhpcy5tZWFuKSAqKiAyKSAvICgyICogdGhpcy52YXJpYW5jZSkpO1xyXG4gICAgcmV0dXJuICgxIC8gKHRoaXMuc3RkRGV2ICogTWF0aC5zcXJ0KDIgKiBNYXRoLlBJKSkpICogZXhwUGFydDtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBub3JtYWxDREYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdub3JtYWwnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ0RGIG9ubHkgYXBwbGllcyB0byB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbicpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIDAuNSAqICgxICsgdGhpcy5lcmYoKHggLSB0aGlzLm1lYW4pIC8gKE1hdGguc3FydCgyKSAqIHRoaXMuc3RkRGV2KSkpO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGJpbm9taWFsUE1GKHg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBpZiAodGhpcy50eXBlICE9PSAnYmlub21pYWwnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignUE1GIG9ubHkgYXBwbGllcyB0byB0aGUgQmlub21pYWwgRGlzdHJpYnV0aW9uJyk7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjb21iaW5hdGlvbiA9IHRoaXMuZmFjdG9yaWFsKHRoaXMudHJpYWxzKSAvXHJcbiAgICAgICh0aGlzLmZhY3RvcmlhbCh4KSAqIHRoaXMuZmFjdG9yaWFsKHRoaXMudHJpYWxzIC0geCkpO1xyXG4gICAgcmV0dXJuIGNvbWJpbmF0aW9uICogTWF0aC5wb3codGhpcy5wcm9iYWJpbGl0eSwgeCkgKiBNYXRoLnBvdygxIC0gdGhpcy5wcm9iYWJpbGl0eSwgdGhpcy50cmlhbHMgLSB4KTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBwb2lzc29uUE1GKHg6IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBpZiAodGhpcy50eXBlICE9PSAncG9pc3NvbicpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQTUYgb25seSBhcHBsaWVzIHRvIHRoZSBQb2lzc29uIERpc3RyaWJ1dGlvbicpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIChNYXRoLnBvdyh0aGlzLmxhbWJkYSwgeCkgKiBNYXRoLmV4cCgtdGhpcy5sYW1iZGEpKSAvIHRoaXMuZmFjdG9yaWFsKHgpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBlcmYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGNvbnN0IHNpZ24gPSB4IDwgMCA/IC0xIDogMTtcclxuICAgIGNvbnN0IGEgPSAwLjMyNzU5MTE7XHJcbiAgICBjb25zdCBwID0gMC4yNTQ4Mjk1OTI7XHJcbiAgICBjb25zdCBxID0gLTAuMjg0NDk2NzM2O1xyXG4gICAgY29uc3QgciA9IDEuNDIxNDEzNzQxO1xyXG4gICAgY29uc3QgcyA9IC0xLjQ1MzE1MjAyNztcclxuICAgIGNvbnN0IHQgPSAxLjA2MTQwNTQyOTtcclxuICAgIGNvbnN0IHUgPSAxICsgYSAqIE1hdGguYWJzKHgpO1xyXG4gICAgY29uc3QgcG9seSA9ICgoKCgocCAqIHUgKyBxKSAqIHUgKyByKSAqIHUgKyBzKSAqIHUgKyB0KSAqIHUpO1xyXG4gICAgcmV0dXJuIHNpZ24gKiAoMSAtIHBvbHkgKiBNYXRoLmV4cCgteCAqIHgpKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZmFjdG9yaWFsKG46IG51bWJlcik6IG51bWJlciB7XHJcbiAgICBpZiAobiA8IDApIHJldHVybiBOYU47XHJcbiAgICBsZXQgcmVzdWx0ID0gMTtcclxuICAgIGZvciAobGV0IGkgPSAyOyBpIDw9IG47IGkrKykgcmVzdWx0ICo9IGk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG4gIH0qL1xyXG59XHJcblxyXG5cclxuY2xhc3MgRGlzdHJpYnV0aW9uTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzID0gMDtcclxuICBwcml2YXRlIGxlc3NFcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBiaWcgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICBjb25zdCBbXywgbiwgaywgcF0gPSBzb3VyY2UubWF0Y2goL1xcZCsvZykhLm1hcChOdW1iZXIpO1xyXG4gICAgdGhpcy5uID0gbjtcclxuICAgIHRoaXMuayA9IGs7XHJcbiAgICB0aGlzLnAgPSBwO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzXCIgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8PSAke3RoaXMua30pID0gJHt0aGlzLmxlc3NFcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gY2FsY3VsYXRlQmlub20odGhpcy5uLCB0aGlzLmssIHRoaXMucCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xyXG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykgdGhpcy5lcXVhbCA9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+IHRoaXMuaykgdGhpcy5iaWcgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmNsYXNzIEJpbm9tSW5mb01vZGVsIGV4dGVuZHMgTW9kYWwge1xyXG4gIHByaXZhdGUgbjogbnVtYmVyO1xyXG4gIHByaXZhdGUgazogbnVtYmVyO1xyXG4gIHByaXZhdGUgcDogbnVtYmVyO1xyXG4gIHByaXZhdGUgZXF1YWwgPSAwO1xyXG4gIHByaXZhdGUgbGVzcyA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xyXG4gIHByaXZhdGUgYmlnID0gMDtcclxuICBwcml2YXRlIGJpZ0VxdWFsID0gMDtcclxuXHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcclxuICAgIHRoaXMubiA9IG47XHJcbiAgICB0aGlzLmsgPSBrO1xyXG4gICAgdGhpcy5wID0gcDtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIHRoaXMuY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpO1xyXG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPSAke3RoaXMua30pID0gJHt0aGlzLmVxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID4gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWd9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcclxuICB9XHJcblxyXG4gIHB1YmxpYyBnZXRFcXVhbCgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gdGhpcy5uOyBpKyspIHtcclxuICAgICAgY29uc3QgcHJvYmFiaWxpdHkgPSBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIGksIHRoaXMucCk7XHJcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPCB0aGlzLmspIHRoaXMubGVzcyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPD0gdGhpcy5rKSB0aGlzLmxlc3NFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+PSB0aGlzLmspIHRoaXMuYmlnRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIHRlc3RNYXRoRW5naW5lKCl7XHJcbiAgY29uc3QgZXhwcmVzc2lvbnM9W1xyXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgMiBcXGZyYWN7KDUtMykzNH17XFxzcXJ0ezJeezJ9fX0wLjVgLGV4cGVjdGVkT3V0cHV0OiAnMzQnfSxcclxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YCh4KzEpKHgrMyk9MmAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTAuMjY3OTUseF8yPS0zLjczMjA1J30sXHJcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2BcXGZyYWN7MTMyfXsxMjYwK3heezJ9fT0wLjA1YCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMzcuMTQ4MzUseF8yPTM3LjE0ODM1J30sXHJcbiAgXVxyXG4gIGNvbnN0IHJlc3VsdHM9W11cclxuICB0cnl7XHJcbiAgICBleHByZXNzaW9ucy5mb3JFYWNoKGV4cHJlc3Npb24gPT4ge1xyXG4gICAgICBjb25zdCBtYXRoPW5ldyBNYXRoUHJhaXNlcihleHByZXNzaW9uLmV4cHJlc3Npb24pO1xyXG4gICAgICBpZiAobWF0aC5zb2x1dGlvbiE9PWV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQpe1xyXG4gICAgICAgIHJlc3VsdHMucHVzaCh7ZXhwcmVzc2lvbjogZXhwcmVzc2lvbi5leHByZXNzaW9uLGV4cGVjdGVkT3V0cHV0OiBleHByZXNzaW9uLmV4cGVjdGVkT3V0cHV0LGFjdHVhbE91dHB1dDogbWF0aC5zb2x1dGlvbn0pXHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxuICBjYXRjaChlKXtcclxuICAgIGNvbnNvbGUubG9nKGUpXHJcbiAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG4iXX0=