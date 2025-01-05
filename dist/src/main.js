//git reset --hard
import { Plugin, MarkdownRenderer, addIcon, Modal, Component, Notice, loadMathJax, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathParser/mathEngine";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, processLatexSuiteSettings } from "./settings/settings";
import { LatexSuiteSettingTab } from "./settings/settings_tab";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees, roundBySettings } from "src/mathParser/mathUtilities";
import { Axis, Tikzjax } from "./tikzjax/tikzjax";
import { TikzSvg } from "./tikzjax/myTikz.js";
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
        console.log(result);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLGtCQUFrQjtBQUNsQixPQUFPLEVBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFDLE9BQU8sRUFBTyxLQUFLLEVBQUUsU0FBUyxFQUFVLE1BQU0sRUFBa0IsV0FBVyxFQUFDLFVBQVUsRUFBNkcsTUFBTSxVQUFVLENBQUM7QUFFclAsT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3ZELE9BQU8sRUFBOEMsYUFBYSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ25GLE9BQU8sRUFBMkIsZ0JBQWdCLEVBQXdCLHlCQUF5QixFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFDaEksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBb0IscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQXNDLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzlLLE9BQU8sRUFBRSxJQUFJLEVBQWdDLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRWhGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUc5QyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDdkUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFNUQsT0FBTyxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVLLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUU1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QUFDLFFBQVEsSUFBSSxXQUFXLENBQUM7UUFDaEQsQ0FBQztJQUNILENBQUM7Q0FDRjtBQU9ELFNBQVMsY0FBYztJQUNyQixNQUFNLFdBQVcsR0FBQztRQUNoQixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLG1DQUFtQyxFQUFDLGNBQWMsRUFBRSxJQUFJLEVBQUM7UUFDaEYsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSxjQUFjLEVBQUMsY0FBYyxFQUFFLDJCQUEyQixFQUFDO1FBQ2xGLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsNkJBQTZCLEVBQUMsY0FBYyxFQUFFLDRCQUE0QixFQUFDO0tBQ25HLENBQUE7SUFDRCxNQUFNLE9BQU8sR0FBQyxFQUFFLENBQUE7SUFDaEIsSUFBRyxDQUFDO1FBQ0YsV0FBVyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUMvQixNQUFNLElBQUksR0FBQyxJQUFJLFdBQVcsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbEQsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFHLFVBQVUsQ0FBQyxjQUFjLEVBQUMsQ0FBQztnQkFDN0MsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFDLFVBQVUsRUFBRSxVQUFVLENBQUMsVUFBVSxFQUFDLGNBQWMsRUFBRSxVQUFVLENBQUMsY0FBYyxFQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsUUFBUSxFQUFDLENBQUMsQ0FBQTtZQUN6SCxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBTSxDQUFDLEVBQUMsQ0FBQztRQUNQLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7SUFDaEIsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvL2dpdCByZXNldCAtLWhhcmRcbmltcG9ydCB7UGx1Z2luLCBNYXJrZG93blJlbmRlcmVyLGFkZEljb24sIEFwcCwgTW9kYWwsIENvbXBvbmVudCwgU2V0dGluZyxOb3RpY2UsIFdvcmtzcGFjZVdpbmRvdyxsb2FkTWF0aEpheCxyZW5kZXJNYXRoLCBNYXJrZG93blZpZXcsIEVkaXRvclN1Z2dlc3QsIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbywgRWRpdG9yUG9zaXRpb24sIEVkaXRvciwgVEZpbGUsIEVkaXRvclN1Z2dlc3RDb250ZXh0fSBmcm9tIFwib2JzaWRpYW5cIjtcblxuaW1wb3J0IHsgTWF0aEluZm8sIE1hdGhQcmFpc2VyIH0gZnJvbSBcIi4vbWF0aFBhcnNlci9tYXRoRW5naW5lXCI7XG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcbmltcG9ydCB7IEN1c3RvbUlucHV0TW9kYWwsIEhpc3RvcnlNb2RhbCwgSW5wdXRNb2RhbCwgVmVjSW5wdXRNb2RlbCB9IGZyb20gXCIuL3RlbXBcIjtcbmltcG9ydCB7TGF0ZXhTdWl0ZVBsdWdpblNldHRpbmdzLCBERUZBVUxUX1NFVFRJTkdTLCBMYXRleFN1aXRlQ01TZXR0aW5ncywgcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5nc30gZnJvbSBcIi4vc2V0dGluZ3Mvc2V0dGluZ3NcIjtcbmltcG9ydCB7IExhdGV4U3VpdGVTZXR0aW5nVGFiIH0gZnJvbSBcIi4vc2V0dGluZ3Mvc2V0dGluZ3NfdGFiXCI7XG5pbXBvcnQgeyBjYWxjdWxhdGVCaW5vbSwgZGVncmVlc1RvUmFkaWFucywgZmluZEFuZ2xlQnlDb3NpbmVSdWxlLCBnZXRVc2FibGVEZWdyZWVzLCBwb2xhclRvQ2FydGVzaWFuLCByYWRpYW5zVG9EZWdyZWVzLCByb3VuZEJ5U2V0dGluZ3MgfSBmcm9tIFwic3JjL21hdGhQYXJzZXIvbWF0aFV0aWxpdGllc1wiO1xuaW1wb3J0IHsgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0dGluZywgVGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvdGlrempheFwiO1xuaW1wb3J0IHsgU3VnZ2VzdG9yIH0gZnJvbSBcIi4vc3VnZ2VzdG9yLmpzXCI7XG5pbXBvcnQgeyBUaWt6U3ZnIH0gZnJvbSBcIi4vdGlrempheC9teVRpa3ouanNcIjtcblxuaW1wb3J0IHtFeHRlbnNpb24sIEVkaXRvclN0YXRlLCBTZWxlY3Rpb25SYW5nZSxSYW5nZVNldCwgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xuaW1wb3J0IHsgRm9ybWF0VGlrempheCB9IGZyb20gXCIuL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC5qc1wiO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucyB9IGZyb20gXCIuL3NldEVkaXRvckV4dGVuc2lvbnMuanNcIjtcblxuaW1wb3J0IHsgb25GaWxlQ3JlYXRlLCBvbkZpbGVDaGFuZ2UsIG9uRmlsZURlbGV0ZSwgZ2V0U25pcHBldHNGcm9tRmlsZXMsIGdldEZpbGVTZXRzLCBnZXRWYXJpYWJsZXNGcm9tRmlsZXMsIHRyeUdldFZhcmlhYmxlc0Zyb21Vbmtub3duRmlsZXMgfSBmcm9tIFwiLi9zZXR0aW5ncy9maWxlX3dhdGNoXCI7XG5pbXBvcnQgeyBJQ09OUyB9IGZyb20gXCIuL3NldHRpbmdzL3VpL2ljb25zXCI7XG5cbmltcG9ydCB7IGdldEVkaXRvckNvbW1hbmRzIH0gZnJvbSBcIi4vZmVhdHVyZXMvZWRpdG9yX2NvbW1hbmRzXCI7XG5pbXBvcnQgeyBTbmlwcGV0VmFyaWFibGVzLCBwYXJzZVNuaXBwZXRWYXJpYWJsZXMsIHBhcnNlU25pcHBldHMgfSBmcm9tIFwiLi9zbmlwcGV0cy9wYXJzZVwiO1xuaW1wb3J0IHsgIFBsdWdpbk1hbmlmZXN0LCBQbHVnaW5TZXR0aW5nVGFiLCAgfSBmcm9tICdvYnNpZGlhbic7XG5cblxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNb3NoZSBleHRlbmRzIFBsdWdpbiB7XG4gIHNldHRpbmdzOiBMYXRleFN1aXRlUGx1Z2luU2V0dGluZ3M7XG5cdENNU2V0dGluZ3M6IExhdGV4U3VpdGVDTVNldHRpbmdzO1xuXHRlZGl0b3JFeHRlbnNpb25zOiBFeHRlbnNpb25bXSA9IFtdO1xuICB0aWt6UHJvY2Vzc29yOiBUaWt6amF4XG4gIGVkaXRvckV4dGVuc2lvbnMyOiBFZGl0b3JFeHRlbnNpb25zPSBuZXcgRWRpdG9yRXh0ZW5zaW9ucygpO1xuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBjb25zb2xlLmxvZyhcIm5ldyBsb2RcIilcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuXG5cdFx0dGhpcy5sb2FkSWNvbnMoKTtcblx0XHR0aGlzLmFkZFNldHRpbmdUYWIobmV3IExhdGV4U3VpdGVTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cdFx0bG9hZE1hdGhKYXgoKTtcblxuXHRcdC8vIFJlZ2lzdGVyIExhdGV4IFN1aXRlIGV4dGVuc2lvbnMgYW5kIG9wdGlvbmFsIGVkaXRvciBleHRlbnNpb25zIGZvciBlZGl0b3IgZW5oYW5jZW1lbnRzXG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckV4dGVuc2lvbih0aGlzLmVkaXRvckV4dGVuc2lvbnMpO1xuXG5cdFx0Ly8gV2F0Y2ggZm9yIGNoYW5nZXMgdG8gdGhlIHNuaXBwZXQgdmFyaWFibGVzIGFuZCBzbmlwcGV0cyBmaWxlc1xuXHRcdHRoaXMud2F0Y2hGaWxlcygpO1xuXG5cdFx0dGhpcy5hZGRFZGl0b3JDb21tYW5kcygpO1xuICAgIHRoaXMudGlrelByb2Nlc3Nvcj1uZXcgVGlrempheCh0aGlzLmFwcCx0aGlzKVxuICAgIHRoaXMudGlrelByb2Nlc3Nvci5yZWFkeUxheW91dCgpO1xuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcblx0XHR0aGlzLnRpa3pQcm9jZXNzb3IucmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCk7XG4gICAgXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibWF0aC1lbmdpbmVcIiwgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pqYXhcIiwgdGhpcy5wcm9jZXNzVGlrekJsb2NrLmJpbmQodGhpcykpO1xuICAgIHRoaXMucmVnaXN0ZXJDb21tYW5kcygpO1xuICAgIFxuICAgICAgXG4gICAgLy90aGlzLnJlZ2lzdGVyRWRpdG9yU3VnZ2VzdChuZXcgTnVtZXJhbHNTdWdnZXN0b3IodGhpcykpO1xuICAgIFxuICB9XG5cbiAgcHJpdmF0ZSBwcm9jZXNzTWF0aEJsb2NrKHNvdXJjZTogc3RyaW5nLCBtYWluQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuICAgIFxuICAgIG1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtY29udGFpbmVyXCIpO1xuICAgIFxuICAgIGNvbnN0IHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcbiAgICBsZXQgc2tpcHBlZEluZGV4ZXMgPSAwO1xuICAgIFxuICAgIGNvbnN0IGV4cHJlc3Npb25zID0gc291cmNlLnNwbGl0KFwiXFxuXCIpLm1hcChsaW5lID0+IGxpbmUucmVwbGFjZSgvW1xcc10rLywnJykudHJpbSgpKS5maWx0ZXIobGluZSA9PiBsaW5lICYmICFsaW5lLnN0YXJ0c1dpdGgoXCIvL1wiKSk7XG4gICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCA9PT0gMCkge3JldHVybjt9XG5cbiAgICBleHByZXNzaW9ucy5mb3JFYWNoKChleHByZXNzaW9uLCBpbmRleCkgPT4ge1xuICAgICAgbGV0IGxpbmVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgIGxpbmVDb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtbGluZS1jb250YWluZXJcIiwgKGluZGV4LXNraXBwZWRJbmRleGVzKSAlIDIgPT09IDAgPyBcIm1hdGgtcm93LWV2ZW5cIiA6IFwibWF0aC1yb3ctb2RkXCIpO1xuICAgICAgLy9pZiAoZXhwcmVzc2lvbi5tYXRjaCgvXlxcL1xcLy8pKXt9XG4gICAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xuICAgICAgcHJvY2Vzc01hdGguaW5pdGlhbGl6ZSgpO1xuXG4gICAgICBpZihwcm9jZXNzTWF0aC5tb2RlIT09XCJ2YXJpYWJsZVwiKXtcbiAgICAgICAgbGluZUNvbnRhaW5lciA9IHByb2Nlc3NNYXRoLmNvbnRhaW5lciBhcyBIVE1MRGl2RWxlbWVudDtcbiAgICAgICAgbWFpbkNvbnRhaW5lci5hcHBlbmRDaGlsZChsaW5lQ29udGFpbmVyKTtcbiAgICAgIH1cbiAgICAgIGVsc2V7c2tpcHBlZEluZGV4ZXMrKzt9XG4gICAgfSk7XG4gIH1cblxuICBhZGRFZGl0b3JDb21tYW5kcygpIHtcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgZ2V0RWRpdG9yQ29tbWFuZHModGhpcykpIHtcblx0XHRcdHRoaXMuYWRkQ29tbWFuZChjb21tYW5kKTtcblx0XHR9XG5cdH1cbiAgb251bmxvYWQoKSB7XG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpO1xuXHR9XG5cbiAgYXN5bmMgZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwYXJzZVNuaXBwZXRzKHRoaXMuc2V0dGluZ3Muc25pcHBldHMsIHNuaXBwZXRWYXJpYWJsZXMpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG5ldyBOb3RpY2UoYEZhaWxlZCB0byBsb2FkIHNuaXBwZXRzIGZyb20gc2V0dGluZ3M6ICR7ZX1gKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuICBwcm9jZXNzVGlrekJsb2NrKHNvdXJjZTogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG4gIGNvbnN0IHN2ZyA9IG5ldyBUaWt6U3ZnKHNvdXJjZSk7XG4gIFxuICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiksIHtcbiAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXG4gICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxuICB9KTtcbiAgXG5cbiAgY29uc3QgZ3JhcGggPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcbiAgICBzdHlsZTogXCJkaXNwbGF5OiBmbGV4OyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgYWxpZ24taXRlbXM6IGNlbnRlcjtcIlxuICB9KTtcbiAgZ3JhcGguYXBwZW5kQ2hpbGQoc3ZnLmdldFN2ZygpKTtcbiAgc3ZnLmRlYnVnSW5mbys9Z3JhcGgub3V0ZXJIVE1MXG4gIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCBzdmcuZGVidWdJbmZvKS5vcGVuKCk7XG4gIFxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQoaWNvbik7XG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmFwaCk7XG59XG5cbmxvYWRJY29ucygpIHtcbiAgZm9yIChjb25zdCBbaWNvbklkLCBzdmdDb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhJQ09OUykpIHtcbiAgICBhZGRJY29uKGljb25JZCwgc3ZnQ29udGVudCk7XG4gIH1cbn1cbmFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgbGV0IGRhdGEgPSBhd2FpdCB0aGlzLmxvYWREYXRhKCk7XG5cbiAgLy8gTWlncmF0ZSBzZXR0aW5ncyBmcm9tIHYxLjguMCAtIHYxLjguNFxuICBjb25zdCBzaG91bGRNaWdyYXRlU2V0dGluZ3MgPSBkYXRhID8gXCJiYXNpY1NldHRpbmdzXCIgaW4gZGF0YSA6IGZhbHNlO1xuXG4gIC8vIEB0cy1pZ25vcmVcbiAgZnVuY3Rpb24gbWlncmF0ZVNldHRpbmdzKG9sZFNldHRpbmdzKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLm9sZFNldHRpbmdzLmJhc2ljU2V0dGluZ3MsXG4gICAgICAuLi5vbGRTZXR0aW5ncy5yYXdTZXR0aW5ncyxcbiAgICAgIHNuaXBwZXRzOiBvbGRTZXR0aW5ncy5zbmlwcGV0cyxcbiAgICB9O1xuICB9XG5cbiAgaWYgKHNob3VsZE1pZ3JhdGVTZXR0aW5ncykge1xuICAgIGRhdGEgPSBtaWdyYXRlU2V0dGluZ3MoZGF0YSk7XG4gIH1cblxuICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgZGF0YSk7XG5cblxuICBpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSB8fCB0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0VmFyaWFibGVzRnJvbUZpbGUpIHtcbiAgICBjb25zdCB0ZW1wU25pcHBldFZhcmlhYmxlcyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0VmFyaWFibGVzKCk7XG4gICAgY29uc3QgdGVtcFNuaXBwZXRzID0gYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRzKHRlbXBTbmlwcGV0VmFyaWFibGVzKTtcblxuICAgIHRoaXMuQ01TZXR0aW5ncyA9IHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3ModGVtcFNuaXBwZXRzLCB0aGlzLnNldHRpbmdzKTtcblxuICAgIC8vIFVzZSBvbkxheW91dFJlYWR5IHNvIHRoYXQgd2UgZG9uJ3QgdHJ5IHRvIHJlYWQgdGhlIHNuaXBwZXRzIGZpbGUgdG9vIGVhcmx5XG4gICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xuICAgICAgdGhpcy5wcm9jZXNzU2V0dGluZ3MoKTtcbiAgICB9KTtcbiAgfVxuICBlbHNlIHtcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3NTZXR0aW5ncygpO1xuICB9XG59XG5cbiAgYXN5bmMgc2F2ZVNldHRpbmdzKGRpZEZpbGVMb2NhdGlvbkNoYW5nZSA9IGZhbHNlKSB7XG5cdFx0YXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcblx0XHR0aGlzLnByb2Nlc3NTZXR0aW5ncyhkaWRGaWxlTG9jYXRpb25DaGFuZ2UpO1xuXHR9XG5cbiAgYXN5bmMgcHJvY2Vzc1NldHRpbmdzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID0gZmFsc2UsIGJlY2F1c2VGaWxlVXBkYXRlZCA9IGZhbHNlKSB7XG5cdFx0dGhpcy5DTVNldHRpbmdzID0gcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5ncyhhd2FpdCB0aGlzLmdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkLCBiZWNhdXNlRmlsZVVwZGF0ZWQpLCB0aGlzLnNldHRpbmdzKTtcbiAgICB0aGlzLmVkaXRvckV4dGVuc2lvbnMyLnNldEVkaXRvckV4dGVuc2lvbnModGhpcylcbiAgICAvL3RoaXMuc2V0RWRpdG9yRXh0ZW5zaW9ucygpO1xuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS51cGRhdGVPcHRpb25zKCk7XG5cdH1cbiAgXG4gIGFzeW5jIGdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHBhcnNlU25pcHBldFZhcmlhYmxlcyh0aGlzLnNldHRpbmdzLnNuaXBwZXRWYXJpYWJsZXMpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdG5ldyBOb3RpY2UoYEZhaWxlZCB0byBsb2FkIHNuaXBwZXQgdmFyaWFibGVzIGZyb20gc2V0dGluZ3M6ICR7ZX1gKTtcblx0XHRcdGNvbnNvbGUubG9nKGBGYWlsZWQgdG8gbG9hZCBzbmlwcGV0IHZhcmlhYmxlcyBmcm9tIHNldHRpbmdzOiAke2V9YCk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG4gIGFzeW5jIGdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcblx0XHQvLyBHZXQgZmlsZXMgaW4gc25pcHBldC92YXJpYWJsZSBmb2xkZXJzLlxuXHRcdC8vIElmIGVpdGhlciBpcyBzZXQgdG8gYmUgbG9hZGVkIGZyb20gc2V0dGluZ3MgdGhlIHNldCB3aWxsIGp1c3QgYmUgZW1wdHkuXG5cdFx0Y29uc3QgZmlsZXMgPSBnZXRGaWxlU2V0cyh0aGlzKTtcblxuXHRcdGNvbnN0IHNuaXBwZXRWYXJpYWJsZXMgPVxuXHRcdFx0dGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlXG5cdFx0XHRcdD8gYXdhaXQgZ2V0VmFyaWFibGVzRnJvbUZpbGVzKHRoaXMsIGZpbGVzKVxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0VmFyaWFibGVzKCk7XG5cblx0XHQvLyBUaGlzIG11c3QgYmUgZG9uZSBpbiBlaXRoZXIgY2FzZSwgYmVjYXVzZSBpdCBhbHNvIHVwZGF0ZXMgdGhlIHNldCBvZiBzbmlwcGV0IGZpbGVzXG5cdFx0Y29uc3QgdW5rbm93bkZpbGVWYXJpYWJsZXMgPSBhd2FpdCB0cnlHZXRWYXJpYWJsZXNGcm9tVW5rbm93bkZpbGVzKHRoaXMsIGZpbGVzKTtcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKSB7XG5cdFx0XHQvLyBCdXQgd2Ugb25seSB1c2UgdGhlIHZhbHVlcyBpZiB0aGUgdXNlciB3YW50cyB0aGVtXG5cdFx0XHRPYmplY3QuYXNzaWduKHNuaXBwZXRWYXJpYWJsZXMsIHVua25vd25GaWxlVmFyaWFibGVzKTtcblx0XHR9XG5cblx0XHRjb25zdCBzbmlwcGV0cyA9XG5cdFx0XHR0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlXG5cdFx0XHRcdD8gYXdhaXQgZ2V0U25pcHBldHNGcm9tRmlsZXModGhpcywgZmlsZXMsIHNuaXBwZXRWYXJpYWJsZXMpXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5nZXRTZXR0aW5nc1NuaXBwZXRzKHNuaXBwZXRWYXJpYWJsZXMpO1xuXHRcdHRoaXMuc2hvd1NuaXBwZXRzTG9hZGVkTm90aWNlKHNuaXBwZXRzLmxlbmd0aCwgT2JqZWN0LmtleXMoc25pcHBldFZhcmlhYmxlcykubGVuZ3RoLCAgYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQsIGJlY2F1c2VGaWxlVXBkYXRlZCk7XG5cblx0XHRyZXR1cm4gc25pcHBldHM7XG5cdH1cbiAgc2hvd1NuaXBwZXRzTG9hZGVkTm90aWNlKG5TbmlwcGV0czogbnVtYmVyLCBuU25pcHBldFZhcmlhYmxlczogbnVtYmVyLCBiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZDogYm9vbGVhbiwgYmVjYXVzZUZpbGVVcGRhdGVkOiBib29sZWFuKSB7XG5cdFx0aWYgKCEoYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQgfHwgYmVjYXVzZUZpbGVVcGRhdGVkKSlcblx0XHRcdHJldHVybjtcblxuXHRcdGNvbnN0IHByZWZpeCA9IGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkID8gXCJMb2FkZWQgXCIgOiBcIlN1Y2Nlc3NmdWxseSByZWxvYWRlZCBcIjtcblx0XHRjb25zdCBib2R5ID0gW107XG5cblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldHNGcm9tRmlsZSlcblx0XHRcdGJvZHkucHVzaChgJHtuU25pcHBldHN9IHNuaXBwZXRzYCk7XG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRWYXJpYWJsZXNGcm9tRmlsZSlcblx0XHRcdGJvZHkucHVzaChgJHtuU25pcHBldFZhcmlhYmxlc30gc25pcHBldCB2YXJpYWJsZXNgKTtcblxuXHRcdGNvbnN0IHN1ZmZpeCA9IFwiIGZyb20gZmlsZXMuXCI7XG5cdFx0bmV3IE5vdGljZShwcmVmaXggKyBib2R5LmpvaW4oXCIgYW5kIFwiKSArIHN1ZmZpeCwgNTAwMCk7XG5cdH1cbiAgcHJpdmF0ZSByZWdpc3RlckNvbW1hbmRzKCkge1xuICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICBpZDogXCJvcGVuLWlucHV0LWZvcm1cIixcbiAgICAgIG5hbWU6IFwiT3BlbiBJbnB1dCBGb3JtXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT4gbmV3IFZlY0lucHV0TW9kZWwodGhpcy5hcHAsdGhpcykub3BlbigpLFxuICAgIH0pO1xuXG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInZpZXctc2Vzc2lvbi1oaXN0b3J5XCIsXG4gICAgICBuYW1lOiBcIlZpZXcgU2Vzc2lvbiBIaXN0b3J5XCIsXG4gICAgICAvL2NhbGxiYWNrOiAoKSA9PiBuZXcgSGlzdG9yeU1vZGFsKHRoaXMuYXBwLCB0aGlzKS5vcGVuKCksXG4gICAgfSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgIGlkOiBcInRlc3QtbWF0aEVuZ2luZVwiLFxuICAgICAgbmFtZTogXCJ0ZXN0IG1hdGggZW5naW5lXCIsXG4gICAgICBjYWxsYmFjazogKCkgPT50ZXN0TWF0aEVuZ2luZSgpLFxuICAgIH0pO1xuICB9XG4gIHdhdGNoRmlsZXMoKSB7XG5cdFx0Ly8gT25seSBiZWdpbiB3YXRjaGluZyBmaWxlcyBvbmNlIHRoZSBsYXlvdXQgaXMgcmVhZHlcblx0XHQvLyBPdGhlcndpc2UsIHdlJ2xsIGJlIHVubmVjZXNzYXJpbHkgcmVhY3RpbmcgdG8gbWFueSBvbkZpbGVDcmVhdGUgZXZlbnRzIG9mIHNuaXBwZXQgZmlsZXNcblx0XHQvLyB0aGF0IG9jY3VyIHdoZW4gT2JzaWRpYW4gZmlyc3QgbG9hZHNcblxuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcblxuXHRcdFx0Y29uc3QgZXZlbnRzQW5kQ2FsbGJhY2tzID0ge1xuXHRcdFx0XHRcIm1vZGlmeVwiOiBvbkZpbGVDaGFuZ2UsXG5cdFx0XHRcdFwiZGVsZXRlXCI6IG9uRmlsZURlbGV0ZSxcblx0XHRcdFx0XCJjcmVhdGVcIjogb25GaWxlQ3JlYXRlXG5cdFx0XHR9O1xuXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhldmVudHNBbmRDYWxsYmFja3MpKSB7XG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKGtleSwgKGZpbGUpID0+IHZhbHVlKHRoaXMsIGZpbGUpKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuICBcbn1cblxuXG5cblxuY2xhc3MgUHJvY2Vzc01hdGgge1xuICBtYXRoSW5wdXQ6IGFueTtcbiAgdXNlclZhcmlhYmxlczogeyB2YXJpYWJsZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSA9IFtdO1xuICBtb2RlID0gXCJtYXRoXCI7XG4gIHJlc3VsdDogYW55O1xuICBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICBpY29uc0RpdjogSFRNTEVsZW1lbnQ7XG4gIGFwcDogQXBwO1xuXG4gIGNvbnN0cnVjdG9yKG1hdGhJbnB1dDogc3RyaW5nLHVzZXJWYXJpYWJsZXM6IGFueSwgYXBwOiBBcHAsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcbiAgICB0aGlzLm1hdGhJbnB1dCA9IG1hdGhJbnB1dDtcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXM9dXNlclZhcmlhYmxlcztcbiAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcbiAgICB0aGlzLmljb25zRGl2ID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pY29uc1wiLFxuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcbiAgICB0aGlzLmFzc2lnbk1vZGUoKTtcbiAgICB0aGlzLnNldHVwQ29udGFpbmVyKCk7XG4gICAgdGhpcy5oYW5kbGVWYXJpYWJsZXMoKTtcbiAgICB0aGlzLmNhbGN1bGF0ZU1hdGgoKTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBDb250YWluZXIoKSB7XG4gICAgW1wibWF0aC1pbnB1dFwiLCBcIm1hdGgtcmVzdWx0XCJdLmZvckVhY2goY2xhc3NOYW1lID0+IHtcbiAgICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICBkaXYuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcbiAgICB9KTtcbiAgICB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmljb25zRGl2KTtcbiAgfVxuXG4gIHByaXZhdGUgY2FsY3VsYXRlTWF0aCgpIHtcbiAgICBjb25zdCBpbnB1dERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1pbnB1dFwiKSBhcyBIVE1MRWxlbWVudDtcbiAgICBjb25zdCByZXN1bHREaXYgPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKFwiLm1hdGgtcmVzdWx0XCIpIGFzIEhUTUxFbGVtZW50O1xuICAgIHRyeSB7XG4gICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xuICAgICAgICBjYXNlIFwiYmlub21cIjpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICBjb25zdCBiaW5vbU1vZGVsID0gbmV3IEJpbm9tSW5mb01vZGVsKHRoaXMuYXBwLCB0aGlzLm1hdGhJbnB1dCk7XG4gICAgICAgICAgdGhpcy5hZGRJbmZvTW9kYWwoYmlub21Nb2RlbCk7XG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSBiaW5vbU1vZGVsLmdldEVxdWFsKCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJjb3NcIjpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICBjb25zdCBbICwgc2lkZUEsIHNpZGVCLCBzaWRlQyBdID0gdGhpcy5tYXRoSW5wdXQubWFwKE51bWJlcik7XG4gICAgICAgICAgdGhpcy5yZXN1bHQ9ZmluZEFuZ2xlQnlDb3NpbmVSdWxlKHNpZGVBLCBzaWRlQiwgc2lkZUMpXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgXCJ2ZWNcIjpcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcbiAgICAgICAgICB0aGlzLnJlc3VsdD1uZXcgVmVjUHJvY2Vzc29yKHRoaXMubWF0aElucHV0WzFdLHRoaXMubWF0aElucHV0WzJdLHRoaXMubWF0aElucHV0WzNdKTtcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgdGlrekdyYXBoKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5ncmFwaCkpO1xuICAgICAgICAgIHRoaXMuYWRkRGVidWdNb2RlbChuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgdGhpcy5yZXN1bHQudmVjSW5mby5kZWJ1Z0luZm8pKTtcbiAgICAgICAgICB0aGlzLnJlc3VsdD10aGlzLnJlc3VsdC5yZXN1bHRcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBcInZhcmlhYmxlXCI6XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXG4gICAgICAgICAgdGhpcy5yZXN1bHQgPSBuZXcgTWF0aFByYWlzZXIodGhpcy5tYXRoSW5wdXQpO1xuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvKSk7XG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5tYXRoSW5mby5kZWJ1Z0luZm8pKTtcbiAgICAgICAgICB0aGlzLm1hdGhJbnB1dD10aGlzLnJlc3VsdC5pbnB1dDtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgdGhpcy5hZGRJbnB1dEFuZFJlc3VsdERpdihpbnB1dERpdiwgcmVzdWx0RGl2LCB0eXBlb2YgdGhpcy5tYXRoSW5wdXQ9PT1cInN0cmluZ1wiP3RoaXMubWF0aElucHV0OnRoaXMubWF0aElucHV0WzBdLCB0aGlzLnJlc3VsdC8qcm91bmRCeVNldHRpbmdzKHRoaXMucmVzdWx0KSovKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRoaXMuZGlzcGxheUVycm9yKGlucHV0RGl2LCByZXN1bHREaXYsIGVycik7XG4gICAgICBjb25zb2xlLmVycm9yKFwiVGhlIGluaXRpYWwgcHJhaXNpbmcgZmFpbGVkXCIsZXJyKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2OiBIVE1MRWxlbWVudCwgcmVzdWx0RGl2OiBIVE1MRWxlbWVudCwgaW5wdXQ6IHN0cmluZywgcmVzdWx0OiBhbnkpIHtcbiAgICBpbnB1dERpdi5hcHBlbmRDaGlsZChyZW5kZXJNYXRoKGlucHV0LHRydWUpKVxuICAgIC8vTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihgXFwkeyR7aW5wdXR9fSRgLCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcbiAgICAvL2NvbnN0IHJlc3VsdE91dHB1dCA9IC8odHJ1ZXxmYWxzZSkvLnRlc3QocmVzdWx0KSA/IHJlc3VsdCA6IGBcXCR7JHtyZXN1bHR9fSRgO1xuICAgIGNvbnNvbGUubG9nKHJlc3VsdClcbiAgICByZXN1bHREaXYuYXBwZW5kQ2hpbGQocmVuZGVyTWF0aChTdHJpbmcocm91bmRCeVNldHRpbmdzKHJlc3VsdC5zb2x1dGlvblRvU3RyaW5nKCkpKSx0cnVlKSlcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24ocmVzdWx0T3V0cHV0LCByZXN1bHREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XG4gIH1cblxuICBwcml2YXRlIGRpc3BsYXlFcnJvcihpbnB1dERpdjogSFRNTEVsZW1lbnQsIHJlc3VsdERpdjogSFRNTEVsZW1lbnQsIGVycjogRXJyb3IpIHtcbiAgICBNYXJrZG93blJlbmRlcmVyLnJlbmRlck1hcmtkb3duKHRoaXMubWF0aElucHV0LCBpbnB1dERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcbiAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiZXJyb3ItdGV4dFwiPiR7ZXJyLm1lc3NhZ2V9PC9zcGFuPmA7XG4gICAgdGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtZXJyb3ItbGluZVwiKTtcbiAgfVxuXG4gIHByaXZhdGUgYXNzaWduTW9kZSgpIHtcbiAgICBjb25zdCByZWdleExpc3QgPSBHZXRNYXRoQ29udGV4dFJlZ2V4KCk7XG4gICAgY29uc3QgbWF0Y2hPYmplY3QgPSByZWdleExpc3QuZmluZChyZWdleE9iaiA9PiByZWdleE9iai5yZWdleC50ZXN0KHRoaXMubWF0aElucHV0KSk7XG4gICAgaWYgKG1hdGNoT2JqZWN0KSB7XG4gICAgICB0aGlzLm1vZGUgPSBtYXRjaE9iamVjdC52YWx1ZTtcbiAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQubWF0Y2gobWF0Y2hPYmplY3QucmVnZXgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYWRkSW5mb01vZGFsKG1vZGFsOiBhbnkpIHtcbiAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLCB7XG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pbmZvLWljb25cIixcbiAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcbiAgICB9KTtcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XG4gICAgdGhpcy5pY29uc0Rpdi5hcHBlbmRDaGlsZChpY29uKTtcbiAgfVxuXG4gIHByaXZhdGUgYWRkRGVidWdNb2RlbChtb2RhbDogYW55KSB7XG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+QnlwiLFxuICAgIH0pO1xuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xuICB9XG5cbiAgcHJpdmF0ZSBoYW5kbGVWYXJpYWJsZXMoKSB7XG4gICAgaWYgKHRoaXMubW9kZT09PVwidmFyaWFibGVcIikge1xuICAgICAgdGhpcy5oYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucmVwbGFjZVZhcmlhYmxlc0luRXhwcmVzc2lvbigpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpIHtcbiAgICBjb25zdCBbXyx2YXJpYWJsZSwgdmFsdWVdID0gdGhpcy5tYXRoSW5wdXQubWFwKChwYXJ0OiBzdHJpbmcpID0+IHBhcnQudHJpbSgpKTtcbiAgICBpZiAoIXZhcmlhYmxlIHx8ICF2YWx1ZSkge1xuICAgICAgY29uc29sZS53YXJuKGBJbnZhbGlkIHZhcmlhYmxlIGRlY2xhcmF0aW9uOiAke3RoaXMubWF0aElucHV0fWApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBleGlzdGluZ1ZhckluZGV4ID0gdGhpcy51c2VyVmFyaWFibGVzLmZpbmRJbmRleCh2ID0+IHYudmFyaWFibGUgPT09IHZhcmlhYmxlKTtcbiAgICBpZiAoZXhpc3RpbmdWYXJJbmRleCAhPT0gLTEpIHtcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlc1tleGlzdGluZ1ZhckluZGV4XS52YWx1ZSA9IHZhbHVlO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXMucHVzaCh7IHZhcmlhYmxlLCB2YWx1ZSB9KTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKXtcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXMuZm9yRWFjaCgoeyB2YXJpYWJsZSwgdmFsdWUgfSkgPT4ge1xuICAgICAgaWYgKHR5cGVvZiB0aGlzLm1hdGhJbnB1dD09PVwic3RyaW5nXCIpe1xuICAgICAgICB0aGlzLm1hdGhJbnB1dCA9IHRoaXMubWF0aElucHV0LnJlcGxhY2UodmFyaWFibGUsIHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIEdldE1hdGhDb250ZXh0UmVnZXgoKSB7XG4gIHJldHVybiBbXG4gICAgeyByZWdleDogL2Jpbm9tXFwoKFxcZCspLChcXGQrKSwoXFxkKylcXCkvLCB2YWx1ZTogXCJiaW5vbVwiIH0sXG4gICAgeyByZWdleDogL3ZlYyhbKy1dezAsMn0pXFwoKFtcXGQuKy1dK1s6LF1bXFxkListXSspXFwpKFtcXGQuKy1dKikvLCB2YWx1ZTogXCJ2ZWNcIiB9LFxuICAgIHsgcmVnZXg6IC9jb3NcXCgoW1xcZC5dKyksKFtcXGQuXSspLChbXFxkLl0rKVxcKS8sIHZhbHVlOiBcImNvc1wiIH0sXG4gICAgeyByZWdleDogL3ZhclxccyooW1xcd10rKVxccyo9XFxzKihbXFxkLl0rKS8sIHZhbHVlOiBcInZhcmlhYmxlXCIgfSxcbiAgXTtcbn1cblxuXG5jbGFzcyBWZWNQcm9jZXNzb3Ige1xuICB1c2VySW5wdXQ6IGFueTtcbiAgZW52aXJvbm1lbnQ6IHsgWDogc3RyaW5nOyBZOiBzdHJpbmcgfTtcbiAgdmVjSW5mbyA9IG5ldyBNYXRoSW5mbygpO1xuICBheGlzOiBBeGlzO1xuICBtb2RpZmllcjogbnVtYmVyO1xuICByZXN1bHQ6IHN0cmluZztcbiAgZ3JhcGg/OiBhbnk7XG5cbiAgY29uc3RydWN0b3IoZW52aXJvbm1lbnQ6IHN0cmluZywgbWF0aElucHV0OiBzdHJpbmcsIG1vZGlmaWVyOiBzdHJpbmcpIHtcbiAgICB0aGlzLnVzZXJJbnB1dD1tYXRoSW5wdXQ7XG4gICAgY29uc3QgbWF0Y2ggPSBlbnZpcm9ubWVudC5tYXRjaCgvKFsrLV0/KShbKy1dPykvKTtcbiAgICB0aGlzLmVudmlyb25tZW50ID0geyBYOiBtYXRjaD8uWzFdID8/IFwiK1wiLCBZOiBtYXRjaD8uWzJdID8/IFwiK1wiIH07XG5cbiAgICB0aGlzLm1vZGlmaWVyID0gbW9kaWZpZXIubGVuZ3RoID4gMCA/IGdldFVzYWJsZURlZ3JlZXMoTnVtYmVyKG1vZGlmaWVyKSkgOiAwO1xuXG4gICAgdGhpcy5heGlzPW5ldyBBeGlzKCkudW5pdmVyc2FsKHRoaXMudXNlcklucHV0KVxuICAgIGlmICghdGhpcy5heGlzLnBvbGFyQW5nbGUpXG4gICAgICB0aGlzLmF4aXMuY2FydGVzaWFuVG9Qb2xhcigpO1xuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJheGlzXCIsdGhpcy5heGlzKTtcbiAgICB0aGlzLmFkZFJlc3VsdCgpO1xuICAgIHRoaXMuYWRkR3JhcGgoKTtcbiAgfVxuICBhZGRSZXN1bHQoKXtcbiAgICBpZiAodGhpcy51c2VySW5wdXQuaW5jbHVkZXMoXCI6XCIpKVxuICAgICAgdGhpcy5yZXN1bHQ9YHggPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5YfVxcXFxxdWFkLHkgPSAke3RoaXMuYXhpcy5jYXJ0ZXNpYW5ZfWBcbiAgICBlbHNlXG4gICAgICB0aGlzLnJlc3VsdD1gYW5nbGUgPSAke3RoaXMuYXhpcy5wb2xhckFuZ2xlfVxcXFxxdWFkLGxlbmd0aCA9ICR7dGhpcy5heGlzLnBvbGFyTGVuZ3RofWBcbiAgfVxuICBhZGRHcmFwaCgpIHtcbiAgICBjb25zdCB0YXJnZXRTaXplID0gMTA7XG4gICAgY29uc3QgbWF4Q29tcG9uZW50ID0gTWF0aC5tYXgoTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblgpLCBNYXRoLmFicyh0aGlzLmF4aXMuY2FydGVzaWFuWSkpO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHNjYWxpbmcgZmFjdG9yXG4gICAgbGV0IHNjYWxlID0gMTtcbiAgICBpZiAobWF4Q29tcG9uZW50IDwgdGFyZ2V0U2l6ZSkge1xuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xuICAgIH0gZWxzZSBpZiAobWF4Q29tcG9uZW50ID4gdGFyZ2V0U2l6ZSkge1xuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xuICAgIH1cbiAgICAvLyBpIG5lZWQgdG8gbWFrZSBpdCBcInRvIFggYXhpc1wiXG4gICAgLy9jb25zdCB2ZWN0b3JBbmdsZSA9IGdldFVzYWJsZURlZ3JlZXMocmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4yKHNjYWxlZFksIHNjYWxlZFgpKSk7XG4gICAgXG4gICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoMCwwKTtcblxuXG4gICAvLyBjb25zdCBkcmF3PSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5wb2xhckxlbmd0aC50b1N0cmluZygpfSksdGhpcy5heGlzXTtcbiAgICAvL2NvbnN0IGRyYXdYPSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5jYXJ0ZXNpYW5YLnRvU3RyaW5nKCl9KSxuZXcgQXhpcyh0aGlzLmF4aXMuY2FydGVzaWFuWCwwKV07XG4gICAgLy9jb25zdCBkcmF3WT0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMuY2FydGVzaWFuWS50b1N0cmluZygpfSksbmV3IEF4aXMoMCx0aGlzLmF4aXMuY2FydGVzaWFuWSldO1xuXG4gICAgdGhpcy5ncmFwaD1bXG4gICAgICAvL25ldyBGb3JtYXR0aW5nKFwiZ2xvYm9sXCIse2NvbG9yOiBcIndoaXRlXCIsc2NhbGU6IDEsfSksXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3LGZvcm1hdHRpbmdPYmo6IHtsaW5lV2lkdGg6IDEsZHJhdzogXCJyZWRcIixhcnJvcjogXCIte1N0ZWFsdGh9XCJ9fSksXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3WCxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhd1ksZm9ybWF0dGluZ09iajoge2xpbmVXaWR0aDogMSxkcmF3OiBcInllbGxvd1wiLGFycm9yOiBcIi17U3RlYWx0aH1cIn19KSxcbiAgICBdXG4gICAgXG4gICAgXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcInRoaXMuZ3JhcGhcIixKU09OLnN0cmluZ2lmeSh0aGlzLmdyYXBoLnRva2VucyxudWxsLDEpKTtcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaC50b1N0cmluZygpXFxuXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b1N0cmluZygpKSk7XG4gICAgLyogR2VuZXJhdGUgTGFUZVggY29kZSBmb3IgdmVjdG9yIGNvbXBvbmVudHMgYW5kIG1haW4gdmVjdG9yXG4gICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXG5cbiAgICAgICUgQW5nbGUgQW5ub3RhdGlvblxuICAgICAgJVxcYW5ne1h9e2FuY317dmVjfXt9eyR7cm91bmRCeVNldHRpbmdzKHZlY3RvckFuZ2xlKX0kXntcXGNpcmN9JH1cbiAgICBgLnJlcGxhY2UoL15cXHMrL2dtLCBcIlwiKTsqL1xuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJTY2FsaW5nIGZhY3RvclwiLCBzY2FsZSk7XG4gIH1cbn1cblxuXG5cbmNsYXNzIHRpa3pHcmFwaCBleHRlbmRzIE1vZGFsIHtcbiAgdGlrejogRm9ybWF0VGlrempheDtcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsdGlrekNvZGU6IGFueSl7XG4gICAgc3VwZXIoYXBwKTtcbiAgICB0aGlzLnRpa3o9bmV3IEZvcm1hdFRpa3pqYXgodGlrekNvZGUpO1xuICB9XG5cbiAgb25PcGVuKCkge1xuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgIGNvbnN0IGNvZGU9dGhpcy50aWt6O1xuICAgIGNvbnN0IHNjcmlwdCA9IGNvbnRlbnRFbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xuICAgIHNjcmlwdC5zZXRUZXh0KGNvZGUuZ2V0Q29kZSgpKTtcbiAgICBcbiAgICBjb25zdCBhY3Rpb25CdXR0b24gPSBjb250ZW50RWwuY3JlYXRlRWwoXCJidXR0b25cIiwgeyB0ZXh0OiBcIkNvcHkgZ3JhcGhcIiwgY2xzOiBcImluZm8tbW9kYWwtQ29weS1idXR0b25cIiB9KTtcblxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xuICAgICAgbmF2aWdhdG9yLmNsaXBib2FyZC53cml0ZVRleHQodGhpcy50aWt6LmdldENvZGUoKSk7XG4gICAgICBuZXcgTm90aWNlKFwiR3JhcGggY29waWVkIHRvIGNsaXBib2FyZCFcIik7XG4gICAgfSk7XG4gIH1cbiAgb25DbG9zZSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICB9XG59XG5cbnR5cGUgRGlzdHJpYnV0aW9uVHlwZSA9ICdub3JtYWwnIHwgJ2Jpbm9taWFsJyB8ICdwb2lzc29uJztcblxuY2xhc3MgRGlzdHJpYnV0aW9uIHtcbiAgcHJpdmF0ZSB0eXBlOiBEaXN0cmlidXRpb25UeXBlO1xuICBwcml2YXRlIHg6IG51bWJlcjtcbiAgcHJpdmF0ZSBtdTogbnVtYmVyO1xuICBwcml2YXRlIHNpZ21hOiBudW1iZXJcbiAgcHJpdmF0ZSB2YXJpYW5jZTogbnVtYmVyXG5cbiAgXG5cbiAgLy8gRm9yIEJpbm9taWFsIERpc3RyaWJ1dGlvblxuICBwcml2YXRlIHRyaWFsczogbnVtYmVyO1xuICBwcml2YXRlIHByb2JhYmlsaXR5OiBudW1iZXI7XG5cbiAgLy8gRm9yIFBvaXNzb24gRGlzdHJpYnV0aW9uXG4gIHByaXZhdGUgbGFtYmRhOiBudW1iZXI7XG4gIC8qXG4gIGNvbnN0cnVjdG9yKHR5cGU6IERpc3RyaWJ1dGlvblR5cGUsIHBhcmFtczogUmVjb3JkPHN0cmluZywgbnVtYmVyPikge1xuICAgIHRoaXMudHlwZSA9IHR5cGU7XG5cbiAgICAvLyBJbml0aWFsaXplIGJhc2VkIG9uIGRpc3RyaWJ1dGlvbiB0eXBlXG4gICAgc3dpdGNoICh0eXBlKSB7XG4gICAgICBjYXNlICdub3JtYWwnOlxuICAgICAgICB0aGlzLm1lYW4gPSBwYXJhbXMubWVhbiB8fCAwO1xuICAgICAgICB0aGlzLnN0ZERldiA9IHBhcmFtcy5zdGREZXYgfHwgMTtcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMuc3RkRGV2ICoqIDI7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnYmlub21pYWwnOlxuICAgICAgICB0aGlzLnRyaWFscyA9IHBhcmFtcy50cmlhbHMgfHwgMTtcbiAgICAgICAgdGhpcy5wcm9iYWJpbGl0eSA9IHBhcmFtcy5wcm9iYWJpbGl0eSB8fCAwLjU7XG4gICAgICAgIHRoaXMubWVhbiA9IHRoaXMudHJpYWxzICogdGhpcy5wcm9iYWJpbGl0eTtcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubWVhbiAqICgxIC0gdGhpcy5wcm9iYWJpbGl0eSk7XG4gICAgICAgIHRoaXMuc3RkRGV2ID0gTWF0aC5zcXJ0KHRoaXMudmFyaWFuY2UpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BvaXNzb24nOlxuICAgICAgICB0aGlzLmxhbWJkYSA9IHBhcmFtcy5sYW1iZGEgfHwgMTtcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy5sYW1iZGE7XG4gICAgICAgIHRoaXMudmFyaWFuY2UgPSB0aGlzLmxhbWJkYTtcbiAgICAgICAgdGhpcy5zdGREZXYgPSBNYXRoLnNxcnQodGhpcy52YXJpYW5jZSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBkaXN0cmlidXRpb24gdHlwZScpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBub3JtYWxQREYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAnbm9ybWFsJykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XG4gICAgfVxuICAgIGNvbnN0IGV4cFBhcnQgPSBNYXRoLmV4cCgtKCh4IC0gdGhpcy5tZWFuKSAqKiAyKSAvICgyICogdGhpcy52YXJpYW5jZSkpO1xuICAgIHJldHVybiAoMSAvICh0aGlzLnN0ZERldiAqIE1hdGguc3FydCgyICogTWF0aC5QSSkpKSAqIGV4cFBhcnQ7XG4gIH1cblxuICBwdWJsaWMgbm9ybWFsQ0RGKHg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ25vcm1hbCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ0RGIG9ubHkgYXBwbGllcyB0byB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbicpO1xuICAgIH1cbiAgICByZXR1cm4gMC41ICogKDEgKyB0aGlzLmVyZigoeCAtIHRoaXMubWVhbikgLyAoTWF0aC5zcXJ0KDIpICogdGhpcy5zdGREZXYpKSk7XG4gIH1cblxuICBwdWJsaWMgYmlub21pYWxQTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAnYmlub21pYWwnKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BNRiBvbmx5IGFwcGxpZXMgdG8gdGhlIEJpbm9taWFsIERpc3RyaWJ1dGlvbicpO1xuICAgIH1cbiAgICBjb25zdCBjb21iaW5hdGlvbiA9IHRoaXMuZmFjdG9yaWFsKHRoaXMudHJpYWxzKSAvXG4gICAgICAodGhpcy5mYWN0b3JpYWwoeCkgKiB0aGlzLmZhY3RvcmlhbCh0aGlzLnRyaWFscyAtIHgpKTtcbiAgICByZXR1cm4gY29tYmluYXRpb24gKiBNYXRoLnBvdyh0aGlzLnByb2JhYmlsaXR5LCB4KSAqIE1hdGgucG93KDEgLSB0aGlzLnByb2JhYmlsaXR5LCB0aGlzLnRyaWFscyAtIHgpO1xuICB9XG5cbiAgcHVibGljIHBvaXNzb25QTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAodGhpcy50eXBlICE9PSAncG9pc3NvbicpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUE1GIG9ubHkgYXBwbGllcyB0byB0aGUgUG9pc3NvbiBEaXN0cmlidXRpb24nKTtcbiAgICB9XG4gICAgcmV0dXJuIChNYXRoLnBvdyh0aGlzLmxhbWJkYSwgeCkgKiBNYXRoLmV4cCgtdGhpcy5sYW1iZGEpKSAvIHRoaXMuZmFjdG9yaWFsKHgpO1xuICB9XG5cbiAgcHJpdmF0ZSBlcmYoeDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBjb25zdCBzaWduID0geCA8IDAgPyAtMSA6IDE7XG4gICAgY29uc3QgYSA9IDAuMzI3NTkxMTtcbiAgICBjb25zdCBwID0gMC4yNTQ4Mjk1OTI7XG4gICAgY29uc3QgcSA9IC0wLjI4NDQ5NjczNjtcbiAgICBjb25zdCByID0gMS40MjE0MTM3NDE7XG4gICAgY29uc3QgcyA9IC0xLjQ1MzE1MjAyNztcbiAgICBjb25zdCB0ID0gMS4wNjE0MDU0Mjk7XG4gICAgY29uc3QgdSA9IDEgKyBhICogTWF0aC5hYnMoeCk7XG4gICAgY29uc3QgcG9seSA9ICgoKCgocCAqIHUgKyBxKSAqIHUgKyByKSAqIHUgKyBzKSAqIHUgKyB0KSAqIHUpO1xuICAgIHJldHVybiBzaWduICogKDEgLSBwb2x5ICogTWF0aC5leHAoLXggKiB4KSk7XG4gIH1cblxuICBwcml2YXRlIGZhY3RvcmlhbChuOiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmIChuIDwgMCkgcmV0dXJuIE5hTjtcbiAgICBsZXQgcmVzdWx0ID0gMTtcbiAgICBmb3IgKGxldCBpID0gMjsgaSA8PSBuOyBpKyspIHJlc3VsdCAqPSBpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0qL1xufVxuXG5cbmNsYXNzIERpc3RyaWJ1dGlvbk1vZGVsIGV4dGVuZHMgTW9kYWwge1xuICBwcml2YXRlIG46IG51bWJlcjtcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XG4gIHByaXZhdGUgcDogbnVtYmVyO1xuICBwcml2YXRlIGVxdWFsID0gMDtcbiAgcHJpdmF0ZSBsZXNzID0gMDtcbiAgcHJpdmF0ZSBsZXNzRXF1YWwgPSAwO1xuICBwcml2YXRlIGJpZyA9IDA7XG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xuXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xuICAgIHN1cGVyKGFwcCk7XG4gICAgY29uc3QgW18sIG4sIGssIHBdID0gc291cmNlLm1hdGNoKC9cXGQrL2cpIS5tYXAoTnVtYmVyKTtcbiAgICB0aGlzLm4gPSBuO1xuICAgIHRoaXMuayA9IGs7XG4gICAgdGhpcy5wID0gcDtcbiAgfVxuXG4gIG9uT3BlbigpIHtcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJoMlwiLCB7IHRleHQ6IFwiQmlub21pYWwgUHJvYmFiaWxpdHkgUmVzdWx0c1wiIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPD0gJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzRXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xuICB9XG5cbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgdGhpcy5rLCB0aGlzLnApO1xuICB9XG5cbiAgcHJpdmF0ZSBjYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcbiAgICAgIGlmIChpID09PSB0aGlzLmspIHRoaXMuZXF1YWwgPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPiB0aGlzLmspIHRoaXMuYmlnICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xuICAgIH1cbiAgfVxufVxuXG5cblxuXG5cblxuXG5jbGFzcyBCaW5vbUluZm9Nb2RlbCBleHRlbmRzIE1vZGFsIHtcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XG4gIHByaXZhdGUgazogbnVtYmVyO1xuICBwcml2YXRlIHA6IG51bWJlcjtcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XG4gIHByaXZhdGUgbGVzcyA9IDA7XG4gIHByaXZhdGUgbGVzc0VxdWFsID0gMDtcbiAgcHJpdmF0ZSBiaWcgPSAwO1xuICBwcml2YXRlIGJpZ0VxdWFsID0gMDtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcbiAgICBzdXBlcihhcHApO1xuICAgIGNvbnN0IFtfLCBuLCBrLCBwXSA9IHNvdXJjZS5tYXRjaCgvXFxkKy9nKSEubWFwKE51bWJlcik7XG4gICAgdGhpcy5uID0gbjtcbiAgICB0aGlzLmsgPSBrO1xuICAgIHRoaXMucCA9IHA7XG4gIH1cblxuICBvbk9wZW4oKSB7XG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XG4gICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkJpbm9taWFsIFByb2JhYmlsaXR5IFJlc3VsdHNcIiB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc31gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID49ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnRXF1YWx9YCB9KTtcbiAgfVxuXG4gIHB1YmxpYyBnZXRFcXVhbCgpOiBudW1iZXIge1xuICAgIHJldHVybiBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIHRoaXMuaywgdGhpcy5wKTtcbiAgfVxuXG4gIHByaXZhdGUgY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xuICAgICAgY29uc3QgcHJvYmFiaWxpdHkgPSBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIGksIHRoaXMucCk7XG4gICAgICBpZiAoaSA9PT0gdGhpcy5rKSB0aGlzLmVxdWFsID0gcHJvYmFiaWxpdHk7XG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xuICAgICAgaWYgKGkgPD0gdGhpcy5rKSB0aGlzLmxlc3NFcXVhbCArPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpID4gdGhpcy5rKSB0aGlzLmJpZyArPSBwcm9iYWJpbGl0eTtcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcbiAgICB9XG4gIH1cbn1cblxuXG5cblxuXG5cbmZ1bmN0aW9uIHRlc3RNYXRoRW5naW5lKCl7XG4gIGNvbnN0IGV4cHJlc3Npb25zPVtcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2AyIFxcZnJhY3soNS0zKTM0fXtcXHNxcnR7Ml57Mn19fTAuNWAsZXhwZWN0ZWRPdXRwdXQ6ICczNCd9LFxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YCh4KzEpKHgrMyk9MmAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTAuMjY3OTUseF8yPS0zLjczMjA1J30sXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgXFxmcmFjezEzMn17MTI2MCt4XnsyfX09MC4wNWAsZXhwZWN0ZWRPdXRwdXQ6ICd4XzE9LTM3LjE0ODM1LHhfMj0zNy4xNDgzNSd9LFxuICBdXG4gIGNvbnN0IHJlc3VsdHM9W11cbiAgdHJ5e1xuICAgIGV4cHJlc3Npb25zLmZvckVhY2goZXhwcmVzc2lvbiA9PiB7XG4gICAgICBjb25zdCBtYXRoPW5ldyBNYXRoUHJhaXNlcihleHByZXNzaW9uLmV4cHJlc3Npb24pO1xuICAgICAgaWYgKG1hdGguc29sdXRpb24hPT1leHByZXNzaW9uLmV4cGVjdGVkT3V0cHV0KXtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtleHByZXNzaW9uOiBleHByZXNzaW9uLmV4cHJlc3Npb24sZXhwZWN0ZWRPdXRwdXQ6IGV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQsYWN0dWFsT3V0cHV0OiBtYXRoLnNvbHV0aW9ufSlcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICBjYXRjaChlKXtcbiAgICBjb25zb2xlLmxvZyhlKVxuICB9XG59XG5cblxuXG5cbiJdfQ==