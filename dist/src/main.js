//git reset --hard
import { Plugin, MarkdownRenderer, addIcon, Modal, Component, Notice, loadMathJax, renderMath } from "obsidian";
import { MathInfo, MathPraiser } from "./mathParser/mathEngine";
import { InfoModal, DebugModal } from "./desplyModals";
import { VecInputModel } from "./temp";
import { DEFAULT_SETTINGS, processLatexSuiteSettings } from "./settings/settings";
import { LatexSuiteSettingTab } from "./settings/settings_tab";
import { calculateBinom, findAngleByCosineRule, getUsableDegrees } from "src/mathParser/mathUtilities";
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
        console.log('this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));');
        this.registerMarkdownCodeBlockProcessor("math-engine", this.processMathBlock.bind(this));
        this.registerMarkdownCodeBlockProcessor("tikzjax", this.processTikzBlock.bind(this));
        this.registerCommands();
        //this.registerEditorSuggest(new NumeralsSuggestor(this));
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
    processMathBlock(source, mainContainer) {
        console.log('processMathBlock');
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
        resultDiv.appendChild(renderMath(result.solutionToString() || "", true));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLGtCQUFrQjtBQUNsQixPQUFPLEVBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFDLE9BQU8sRUFBTyxLQUFLLEVBQUUsU0FBUyxFQUFVLE1BQU0sRUFBa0IsV0FBVyxFQUFDLFVBQVUsRUFBNkcsTUFBTSxVQUFVLENBQUM7QUFFclAsT0FBTyxFQUFFLFFBQVEsRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNoRSxPQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3ZELE9BQU8sRUFBOEMsYUFBYSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ25GLE9BQU8sRUFBMkIsZ0JBQWdCLEVBQXdCLHlCQUF5QixFQUFDLE1BQU0scUJBQXFCLENBQUM7QUFDaEksT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGNBQWMsRUFBb0IscUJBQXFCLEVBQUUsZ0JBQWdCLEVBQXVELE1BQU0sOEJBQThCLENBQUM7QUFDOUssT0FBTyxFQUFFLElBQUksRUFBZ0MsT0FBTyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFaEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRzlDLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN2RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUU1RCxPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQUUsV0FBVyxFQUFFLHFCQUFxQixFQUFFLCtCQUErQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDNUssT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRTVDLE9BQU8sRUFB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QUksQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO2dCQUFFLElBQUksQ0FBQyxRQUFRLElBQUksV0FBVyxDQUFDO1FBQ2hELENBQUM7SUFDSCxDQUFDO0NBQ0Y7QUFPRCxTQUFTLGNBQWM7SUFDckIsTUFBTSxXQUFXLEdBQUM7UUFDaEIsRUFBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQSxtQ0FBbUMsRUFBQyxjQUFjLEVBQUUsSUFBSSxFQUFDO1FBQ2hGLEVBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUEsY0FBYyxFQUFDLGNBQWMsRUFBRSwyQkFBMkIsRUFBQztRQUNsRixFQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFBLDZCQUE2QixFQUFDLGNBQWMsRUFBRSw0QkFBNEIsRUFBQztLQUNuRyxDQUFBO0lBQ0QsTUFBTSxPQUFPLEdBQUMsRUFBRSxDQUFBO0lBQ2hCLElBQUcsQ0FBQztRQUNGLFdBQVcsQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxJQUFJLEdBQUMsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2xELElBQUksSUFBSSxDQUFDLFFBQVEsS0FBRyxVQUFVLENBQUMsY0FBYyxFQUFDLENBQUM7Z0JBQzdDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBQyxVQUFVLEVBQUUsVUFBVSxDQUFDLFVBQVUsRUFBQyxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsRUFBQyxZQUFZLEVBQUUsSUFBSSxDQUFDLFFBQVEsRUFBQyxDQUFDLENBQUE7WUFDekgsQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU0sQ0FBQyxFQUFDLENBQUM7UUFDUCxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO0lBQ2hCLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy9naXQgcmVzZXQgLS1oYXJkXHJcbmltcG9ydCB7UGx1Z2luLCBNYXJrZG93blJlbmRlcmVyLGFkZEljb24sIEFwcCwgTW9kYWwsIENvbXBvbmVudCwgU2V0dGluZyxOb3RpY2UsIFdvcmtzcGFjZVdpbmRvdyxsb2FkTWF0aEpheCxyZW5kZXJNYXRoLCBNYXJrZG93blZpZXcsIEVkaXRvclN1Z2dlc3QsIEVkaXRvclN1Z2dlc3RUcmlnZ2VySW5mbywgRWRpdG9yUG9zaXRpb24sIEVkaXRvciwgVEZpbGUsIEVkaXRvclN1Z2dlc3RDb250ZXh0fSBmcm9tIFwib2JzaWRpYW5cIjtcclxuXHJcbmltcG9ydCB7IE1hdGhJbmZvLCBNYXRoUHJhaXNlciB9IGZyb20gXCIuL21hdGhQYXJzZXIvbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyBJbmZvTW9kYWwsIERlYnVnTW9kYWwgfSBmcm9tIFwiLi9kZXNwbHlNb2RhbHNcIjtcclxuaW1wb3J0IHsgQ3VzdG9tSW5wdXRNb2RhbCwgSGlzdG9yeU1vZGFsLCBJbnB1dE1vZGFsLCBWZWNJbnB1dE1vZGVsIH0gZnJvbSBcIi4vdGVtcFwiO1xyXG5pbXBvcnQge0xhdGV4U3VpdGVQbHVnaW5TZXR0aW5ncywgREVGQVVMVF9TRVRUSU5HUywgTGF0ZXhTdWl0ZUNNU2V0dGluZ3MsIHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3N9IGZyb20gXCIuL3NldHRpbmdzL3NldHRpbmdzXCI7XHJcbmltcG9ydCB7IExhdGV4U3VpdGVTZXR0aW5nVGFiIH0gZnJvbSBcIi4vc2V0dGluZ3Mvc2V0dGluZ3NfdGFiXCI7XHJcbmltcG9ydCB7IGNhbGN1bGF0ZUJpbm9tLCBkZWdyZWVzVG9SYWRpYW5zLCBmaW5kQW5nbGVCeUNvc2luZVJ1bGUsIGdldFVzYWJsZURlZ3JlZXMsIHBvbGFyVG9DYXJ0ZXNpYW4sIHJhZGlhbnNUb0RlZ3JlZXMsIHJvdW5kQnlTZXR0aW5ncyB9IGZyb20gXCJzcmMvbWF0aFBhcnNlci9tYXRoVXRpbGl0aWVzXCI7XHJcbmltcG9ydCB7IEF4aXMsIENvb3JkaW5hdGUsIERyYXcsIEZvcm1hdHRpbmcsIFRpa3pqYXggfSBmcm9tIFwiLi90aWt6amF4L3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgU3VnZ2VzdG9yIH0gZnJvbSBcIi4vc3VnZ2VzdG9yLmpzXCI7XHJcbmltcG9ydCB7IFRpa3pTdmcgfSBmcm9tIFwiLi90aWt6amF4L215VGlrei5qc1wiO1xyXG5cclxuaW1wb3J0IHtFeHRlbnNpb24sIEVkaXRvclN0YXRlLCBTZWxlY3Rpb25SYW5nZSxSYW5nZVNldCwgUHJlYyB9IGZyb20gXCJAY29kZW1pcnJvci9zdGF0ZVwiO1xyXG5pbXBvcnQgeyBGb3JtYXRUaWt6amF4IH0gZnJvbSBcIi4vdGlrempheC9pbnRlcnByZXQvdG9rZW5pemVUaWt6amF4LmpzXCI7XHJcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tIFwiLi9zZXRFZGl0b3JFeHRlbnNpb25zLmpzXCI7XHJcblxyXG5pbXBvcnQgeyBvbkZpbGVDcmVhdGUsIG9uRmlsZUNoYW5nZSwgb25GaWxlRGVsZXRlLCBnZXRTbmlwcGV0c0Zyb21GaWxlcywgZ2V0RmlsZVNldHMsIGdldFZhcmlhYmxlc0Zyb21GaWxlcywgdHJ5R2V0VmFyaWFibGVzRnJvbVVua25vd25GaWxlcyB9IGZyb20gXCIuL3NldHRpbmdzL2ZpbGVfd2F0Y2hcIjtcclxuaW1wb3J0IHsgSUNPTlMgfSBmcm9tIFwiLi9zZXR0aW5ncy91aS9pY29uc1wiO1xyXG5cclxuaW1wb3J0IHsgZ2V0RWRpdG9yQ29tbWFuZHMgfSBmcm9tIFwiLi9mZWF0dXJlcy9lZGl0b3JfY29tbWFuZHNcIjtcclxuaW1wb3J0IHsgU25pcHBldFZhcmlhYmxlcywgcGFyc2VTbmlwcGV0VmFyaWFibGVzLCBwYXJzZVNuaXBwZXRzIH0gZnJvbSBcIi4vc25pcHBldHMvcGFyc2VcIjtcclxuaW1wb3J0IHsgIFBsdWdpbk1hbmlmZXN0LCBQbHVnaW5TZXR0aW5nVGFiLCAgfSBmcm9tICdvYnNpZGlhbic7XHJcblxyXG5cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1vc2hlIGV4dGVuZHMgUGx1Z2luIHtcclxuICBzZXR0aW5nczogTGF0ZXhTdWl0ZVBsdWdpblNldHRpbmdzO1xyXG5cdENNU2V0dGluZ3M6IExhdGV4U3VpdGVDTVNldHRpbmdzO1xyXG5cdGVkaXRvckV4dGVuc2lvbnM6IEV4dGVuc2lvbltdID0gW107XHJcbiAgdGlrelByb2Nlc3NvcjogVGlrempheFxyXG4gIGVkaXRvckV4dGVuc2lvbnMyOiBFZGl0b3JFeHRlbnNpb25zPSBuZXcgRWRpdG9yRXh0ZW5zaW9ucygpO1xyXG5cclxuICBhc3luYyBvbmxvYWQoKSB7XHJcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xyXG5cclxuXHRcdHRoaXMubG9hZEljb25zKCk7XHJcblx0XHR0aGlzLmFkZFNldHRpbmdUYWIobmV3IExhdGV4U3VpdGVTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XHJcblx0XHRsb2FkTWF0aEpheCgpO1xyXG5cclxuXHRcdC8vIFJlZ2lzdGVyIExhdGV4IFN1aXRlIGV4dGVuc2lvbnMgYW5kIG9wdGlvbmFsIGVkaXRvciBleHRlbnNpb25zIGZvciBlZGl0b3IgZW5oYW5jZW1lbnRzXHJcblx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yRXh0ZW5zaW9uKHRoaXMuZWRpdG9yRXh0ZW5zaW9ucyk7XHJcblxyXG5cdFx0Ly8gV2F0Y2ggZm9yIGNoYW5nZXMgdG8gdGhlIHNuaXBwZXQgdmFyaWFibGVzIGFuZCBzbmlwcGV0cyBmaWxlc1xyXG5cdFx0dGhpcy53YXRjaEZpbGVzKCk7XHJcblxyXG5cdFx0dGhpcy5hZGRFZGl0b3JDb21tYW5kcygpO1xyXG4gICAgdGhpcy50aWt6UHJvY2Vzc29yPW5ldyBUaWt6amF4KHRoaXMuYXBwLHRoaXMpXHJcbiAgICB0aGlzLnRpa3pQcm9jZXNzb3IucmVhZHlMYXlvdXQoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5hZGRTeW50YXhIaWdobGlnaHRpbmcoKTtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci5yZWdpc3RlclRpa3pDb2RlQmxvY2soKTtcclxuICAgIFxyXG4gICAgY29uc29sZS5sb2coJ3RoaXMucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcIm1hdGgtZW5naW5lXCIsIHRoaXMucHJvY2Vzc01hdGhCbG9jay5iaW5kKHRoaXMpKTsnKVxyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwibWF0aC1lbmdpbmVcIiwgdGhpcy5wcm9jZXNzTWF0aEJsb2NrLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrempheFwiLCB0aGlzLnByb2Nlc3NUaWt6QmxvY2suYmluZCh0aGlzKSk7XHJcbiAgICB0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcclxuICAgIFxyXG4gICAgICBcclxuICAgIC8vdGhpcy5yZWdpc3RlckVkaXRvclN1Z2dlc3QobmV3IE51bWVyYWxzU3VnZ2VzdG9yKHRoaXMpKTtcclxuICAgIFxyXG4gIH1cclxuXHJcbiAgYWRkRWRpdG9yQ29tbWFuZHMoKSB7XHJcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgZ2V0RWRpdG9yQ29tbWFuZHModGhpcykpIHtcclxuXHRcdFx0dGhpcy5hZGRDb21tYW5kKGNvbW1hbmQpO1xyXG5cdFx0fVxyXG5cdH1cclxuICBvbnVubG9hZCgpIHtcclxuXHRcdHRoaXMudGlrelByb2Nlc3Nvci51bmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG5cdFx0dGhpcy50aWt6UHJvY2Vzc29yLnJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpO1xyXG5cdH1cclxuXHJcbiAgYXN5bmMgZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKSB7XHJcblx0XHR0cnkge1xyXG5cdFx0XHRyZXR1cm4gYXdhaXQgcGFyc2VTbmlwcGV0cyh0aGlzLnNldHRpbmdzLnNuaXBwZXRzLCBzbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGxvYWQgc25pcHBldHMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRjb25zb2xlLmxvZyhgRmFpbGVkIHRvIGxvYWQgc25pcHBldHMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRyZXR1cm4gW107XHJcblx0XHR9XHJcblx0fVxyXG5cclxuICBwcm9jZXNzVGlrekJsb2NrKHNvdXJjZTogc3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgY29uc3Qgc3ZnID0gbmV3IFRpa3pTdmcoc291cmNlKTtcclxuICBcclxuICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihjb250YWluZXIuY3JlYXRlRWwoXCJkaXZcIiksIHtcclxuICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcclxuICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcclxuICB9KTtcclxuICBcclxuXHJcbiAgY29uc3QgZ3JhcGggPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgIHN0eWxlOiBcImRpc3BsYXk6IGZsZXg7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBhbGlnbi1pdGVtczogY2VudGVyO1wiXHJcbiAgfSk7XHJcbiAgZ3JhcGguYXBwZW5kQ2hpbGQoc3ZnLmdldFN2ZygpKTtcclxuICBzdmcuZGVidWdJbmZvKz1ncmFwaC5vdXRlckhUTUxcclxuICAvL2NvbnNvbGUubG9nKGdyYXBoLm91dGVySFRNTClcclxuICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCwgc3ZnLmRlYnVnSW5mbykub3BlbigpO1xyXG4gIFxyXG4gIGNvbnRhaW5lci5hcHBlbmRDaGlsZChpY29uKTtcclxuICBjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JhcGgpO1xyXG59XHJcblxyXG5sb2FkSWNvbnMoKSB7XHJcbiAgZm9yIChjb25zdCBbaWNvbklkLCBzdmdDb250ZW50XSBvZiBPYmplY3QuZW50cmllcyhJQ09OUykpIHtcclxuICAgIGFkZEljb24oaWNvbklkLCBzdmdDb250ZW50KTtcclxuICB9XHJcbn1cclxuYXN5bmMgbG9hZFNldHRpbmdzKCkge1xyXG4gIGxldCBkYXRhID0gYXdhaXQgdGhpcy5sb2FkRGF0YSgpO1xyXG5cclxuICAvLyBNaWdyYXRlIHNldHRpbmdzIGZyb20gdjEuOC4wIC0gdjEuOC40XHJcbiAgY29uc3Qgc2hvdWxkTWlncmF0ZVNldHRpbmdzID0gZGF0YSA/IFwiYmFzaWNTZXR0aW5nc1wiIGluIGRhdGEgOiBmYWxzZTtcclxuXHJcbiAgLy8gQHRzLWlnbm9yZVxyXG4gIGZ1bmN0aW9uIG1pZ3JhdGVTZXR0aW5ncyhvbGRTZXR0aW5ncykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgLi4ub2xkU2V0dGluZ3MuYmFzaWNTZXR0aW5ncyxcclxuICAgICAgLi4ub2xkU2V0dGluZ3MucmF3U2V0dGluZ3MsXHJcbiAgICAgIHNuaXBwZXRzOiBvbGRTZXR0aW5ncy5zbmlwcGV0cyxcclxuICAgIH07XHJcbiAgfVxyXG5cclxuICBpZiAoc2hvdWxkTWlncmF0ZVNldHRpbmdzKSB7XHJcbiAgICBkYXRhID0gbWlncmF0ZVNldHRpbmdzKGRhdGEpO1xyXG4gIH1cclxuXHJcbiAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGRhdGEpO1xyXG5cclxuXHJcbiAgaWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUgfHwgdGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKSB7XHJcbiAgICBjb25zdCB0ZW1wU25pcHBldFZhcmlhYmxlcyA9IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0VmFyaWFibGVzKCk7XHJcbiAgICBjb25zdCB0ZW1wU25pcHBldHMgPSBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldHModGVtcFNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cclxuICAgIHRoaXMuQ01TZXR0aW5ncyA9IHByb2Nlc3NMYXRleFN1aXRlU2V0dGluZ3ModGVtcFNuaXBwZXRzLCB0aGlzLnNldHRpbmdzKTtcclxuXHJcbiAgICAvLyBVc2Ugb25MYXlvdXRSZWFkeSBzbyB0aGF0IHdlIGRvbid0IHRyeSB0byByZWFkIHRoZSBzbmlwcGV0cyBmaWxlIHRvbyBlYXJseVxyXG4gICAgdGhpcy5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xyXG4gICAgICB0aGlzLnByb2Nlc3NTZXR0aW5ncygpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGVsc2Uge1xyXG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzU2V0dGluZ3MoKTtcclxuICB9XHJcbn1cclxuXHJcbiAgYXN5bmMgc2F2ZVNldHRpbmdzKGRpZEZpbGVMb2NhdGlvbkNoYW5nZSA9IGZhbHNlKSB7XHJcblx0XHRhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xyXG5cdFx0dGhpcy5wcm9jZXNzU2V0dGluZ3MoZGlkRmlsZUxvY2F0aW9uQ2hhbmdlKTtcclxuXHR9XHJcblxyXG4gIGFzeW5jIHByb2Nlc3NTZXR0aW5ncyhiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCA9IGZhbHNlLCBiZWNhdXNlRmlsZVVwZGF0ZWQgPSBmYWxzZSkge1xyXG5cdFx0dGhpcy5DTVNldHRpbmdzID0gcHJvY2Vzc0xhdGV4U3VpdGVTZXR0aW5ncyhhd2FpdCB0aGlzLmdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkLCBiZWNhdXNlRmlsZVVwZGF0ZWQpLCB0aGlzLnNldHRpbmdzKTtcclxuICAgIHRoaXMuZWRpdG9yRXh0ZW5zaW9uczIuc2V0RWRpdG9yRXh0ZW5zaW9ucyh0aGlzKVxyXG4gICAgLy90aGlzLnNldEVkaXRvckV4dGVuc2lvbnMoKTtcclxuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS51cGRhdGVPcHRpb25zKCk7XHJcblx0fVxyXG4gIFxyXG4gIGFzeW5jIGdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpIHtcclxuXHRcdHRyeSB7XHJcblx0XHRcdHJldHVybiBhd2FpdCBwYXJzZVNuaXBwZXRWYXJpYWJsZXModGhpcy5zZXR0aW5ncy5zbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0bmV3IE5vdGljZShgRmFpbGVkIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRjb25zb2xlLmxvZyhgRmFpbGVkIHRvIGxvYWQgc25pcHBldCB2YXJpYWJsZXMgZnJvbSBzZXR0aW5nczogJHtlfWApO1xyXG5cdFx0XHRyZXR1cm4ge307XHJcblx0XHR9XHJcblx0fVxyXG4gIGFzeW5jIGdldFNuaXBwZXRzKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcclxuXHRcdC8vIEdldCBmaWxlcyBpbiBzbmlwcGV0L3ZhcmlhYmxlIGZvbGRlcnMuXHJcblx0XHQvLyBJZiBlaXRoZXIgaXMgc2V0IHRvIGJlIGxvYWRlZCBmcm9tIHNldHRpbmdzIHRoZSBzZXQgd2lsbCBqdXN0IGJlIGVtcHR5LlxyXG5cdFx0Y29uc3QgZmlsZXMgPSBnZXRGaWxlU2V0cyh0aGlzKTtcclxuXHJcblx0XHRjb25zdCBzbmlwcGV0VmFyaWFibGVzID1cclxuXHRcdFx0dGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlXHJcblx0XHRcdFx0PyBhd2FpdCBnZXRWYXJpYWJsZXNGcm9tRmlsZXModGhpcywgZmlsZXMpXHJcblx0XHRcdFx0OiBhd2FpdCB0aGlzLmdldFNldHRpbmdzU25pcHBldFZhcmlhYmxlcygpO1xyXG5cclxuXHRcdC8vIFRoaXMgbXVzdCBiZSBkb25lIGluIGVpdGhlciBjYXNlLCBiZWNhdXNlIGl0IGFsc28gdXBkYXRlcyB0aGUgc2V0IG9mIHNuaXBwZXQgZmlsZXNcclxuXHRcdGNvbnN0IHVua25vd25GaWxlVmFyaWFibGVzID0gYXdhaXQgdHJ5R2V0VmFyaWFibGVzRnJvbVVua25vd25GaWxlcyh0aGlzLCBmaWxlcyk7XHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKSB7XHJcblx0XHRcdC8vIEJ1dCB3ZSBvbmx5IHVzZSB0aGUgdmFsdWVzIGlmIHRoZSB1c2VyIHdhbnRzIHRoZW1cclxuXHRcdFx0T2JqZWN0LmFzc2lnbihzbmlwcGV0VmFyaWFibGVzLCB1bmtub3duRmlsZVZhcmlhYmxlcyk7XHJcblx0XHR9XHJcblxyXG5cdFx0Y29uc3Qgc25pcHBldHMgPVxyXG5cdFx0XHR0aGlzLnNldHRpbmdzLmxvYWRTbmlwcGV0c0Zyb21GaWxlXHJcblx0XHRcdFx0PyBhd2FpdCBnZXRTbmlwcGV0c0Zyb21GaWxlcyh0aGlzLCBmaWxlcywgc25pcHBldFZhcmlhYmxlcylcclxuXHRcdFx0XHQ6IGF3YWl0IHRoaXMuZ2V0U2V0dGluZ3NTbmlwcGV0cyhzbmlwcGV0VmFyaWFibGVzKTtcclxuXHRcdHRoaXMuc2hvd1NuaXBwZXRzTG9hZGVkTm90aWNlKHNuaXBwZXRzLmxlbmd0aCwgT2JqZWN0LmtleXMoc25pcHBldFZhcmlhYmxlcykubGVuZ3RoLCAgYmVjYXVzZUZpbGVMb2NhdGlvblVwZGF0ZWQsIGJlY2F1c2VGaWxlVXBkYXRlZCk7XHJcblxyXG5cdFx0cmV0dXJuIHNuaXBwZXRzO1xyXG5cdH1cclxuICBzaG93U25pcHBldHNMb2FkZWROb3RpY2UoblNuaXBwZXRzOiBudW1iZXIsIG5TbmlwcGV0VmFyaWFibGVzOiBudW1iZXIsIGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkOiBib29sZWFuLCBiZWNhdXNlRmlsZVVwZGF0ZWQ6IGJvb2xlYW4pIHtcclxuXHRcdGlmICghKGJlY2F1c2VGaWxlTG9jYXRpb25VcGRhdGVkIHx8IGJlY2F1c2VGaWxlVXBkYXRlZCkpXHJcblx0XHRcdHJldHVybjtcclxuXHJcblx0XHRjb25zdCBwcmVmaXggPSBiZWNhdXNlRmlsZUxvY2F0aW9uVXBkYXRlZCA/IFwiTG9hZGVkIFwiIDogXCJTdWNjZXNzZnVsbHkgcmVsb2FkZWQgXCI7XHJcblx0XHRjb25zdCBib2R5ID0gW107XHJcblxyXG5cdFx0aWYgKHRoaXMuc2V0dGluZ3MubG9hZFNuaXBwZXRzRnJvbUZpbGUpXHJcblx0XHRcdGJvZHkucHVzaChgJHtuU25pcHBldHN9IHNuaXBwZXRzYCk7XHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5sb2FkU25pcHBldFZhcmlhYmxlc0Zyb21GaWxlKVxyXG5cdFx0XHRib2R5LnB1c2goYCR7blNuaXBwZXRWYXJpYWJsZXN9IHNuaXBwZXQgdmFyaWFibGVzYCk7XHJcblxyXG5cdFx0Y29uc3Qgc3VmZml4ID0gXCIgZnJvbSBmaWxlcy5cIjtcclxuXHRcdG5ldyBOb3RpY2UocHJlZml4ICsgYm9keS5qb2luKFwiIGFuZCBcIikgKyBzdWZmaXgsIDUwMDApO1xyXG5cdH1cclxuICBwcml2YXRlIHJlZ2lzdGVyQ29tbWFuZHMoKSB7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJvcGVuLWlucHV0LWZvcm1cIixcclxuICAgICAgbmFtZTogXCJPcGVuIElucHV0IEZvcm1cIixcclxuICAgICAgY2FsbGJhY2s6ICgpID0+IG5ldyBWZWNJbnB1dE1vZGVsKHRoaXMuYXBwLHRoaXMpLm9wZW4oKSxcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuYWRkQ29tbWFuZCh7XHJcbiAgICAgIGlkOiBcInZpZXctc2Vzc2lvbi1oaXN0b3J5XCIsXHJcbiAgICAgIG5hbWU6IFwiVmlldyBTZXNzaW9uIEhpc3RvcnlcIixcclxuICAgICAgLy9jYWxsYmFjazogKCkgPT4gbmV3IEhpc3RvcnlNb2RhbCh0aGlzLmFwcCwgdGhpcykub3BlbigpLFxyXG4gICAgfSk7XHJcbiAgICB0aGlzLmFkZENvbW1hbmQoe1xyXG4gICAgICBpZDogXCJ0ZXN0LW1hdGhFbmdpbmVcIixcclxuICAgICAgbmFtZTogXCJ0ZXN0IG1hdGggZW5naW5lXCIsXHJcbiAgICAgIGNhbGxiYWNrOiAoKSA9PnRlc3RNYXRoRW5naW5lKCksXHJcbiAgICB9KTtcclxuICB9XHJcbiAgd2F0Y2hGaWxlcygpIHtcclxuXHRcdC8vIE9ubHkgYmVnaW4gd2F0Y2hpbmcgZmlsZXMgb25jZSB0aGUgbGF5b3V0IGlzIHJlYWR5XHJcblx0XHQvLyBPdGhlcndpc2UsIHdlJ2xsIGJlIHVubmVjZXNzYXJpbHkgcmVhY3RpbmcgdG8gbWFueSBvbkZpbGVDcmVhdGUgZXZlbnRzIG9mIHNuaXBwZXQgZmlsZXNcclxuXHRcdC8vIHRoYXQgb2NjdXIgd2hlbiBPYnNpZGlhbiBmaXJzdCBsb2Fkc1xyXG5cclxuXHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcclxuXHJcblx0XHRcdGNvbnN0IGV2ZW50c0FuZENhbGxiYWNrcyA9IHtcclxuXHRcdFx0XHRcIm1vZGlmeVwiOiBvbkZpbGVDaGFuZ2UsXHJcblx0XHRcdFx0XCJkZWxldGVcIjogb25GaWxlRGVsZXRlLFxyXG5cdFx0XHRcdFwiY3JlYXRlXCI6IG9uRmlsZUNyZWF0ZVxyXG5cdFx0XHR9O1xyXG5cclxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZXZlbnRzQW5kQ2FsbGJhY2tzKSkge1xyXG5cdFx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3JcclxuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oa2V5LCAoZmlsZSkgPT4gdmFsdWUodGhpcywgZmlsZSkpKTtcclxuXHRcdFx0fVxyXG5cdFx0fSk7XHJcblx0fVxyXG5cclxuICBwcml2YXRlIHByb2Nlc3NNYXRoQmxvY2soc291cmNlOiBzdHJpbmcsIG1haW5Db250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XHJcbiAgICBcclxuICAgIGNvbnNvbGUubG9nKCdwcm9jZXNzTWF0aEJsb2NrJylcclxuICAgIG1haW5Db250YWluZXIuY2xhc3NMaXN0LmFkZChcIm1hdGgtY29udGFpbmVyXCIpO1xyXG4gICAgXHJcbiAgICBjb25zdCB1c2VyVmFyaWFibGVzOiB7IHZhcmlhYmxlOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfVtdID0gW107XHJcbiAgICBsZXQgc2tpcHBlZEluZGV4ZXMgPSAwO1xyXG4gICAgXHJcbiAgICBjb25zdCBleHByZXNzaW9ucyA9IHNvdXJjZS5zcGxpdChcIlxcblwiKS5tYXAobGluZSA9PiBsaW5lLnJlcGxhY2UoL1tcXHNdKy8sJycpLnRyaW0oKSkuZmlsdGVyKGxpbmUgPT4gbGluZSAmJiAhbGluZS5zdGFydHNXaXRoKFwiLy9cIikpO1xyXG4gICAgaWYgKGV4cHJlc3Npb25zLmxlbmd0aCA9PT0gMCkge3JldHVybjt9XHJcblxyXG4gICAgZXhwcmVzc2lvbnMuZm9yRWFjaCgoZXhwcmVzc2lvbiwgaW5kZXgpID0+IHtcclxuICAgICAgbGV0IGxpbmVDb250YWluZXI6IEhUTUxEaXZFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgbGluZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1saW5lLWNvbnRhaW5lclwiLCAoaW5kZXgtc2tpcHBlZEluZGV4ZXMpICUgMiA9PT0gMCA/IFwibWF0aC1yb3ctZXZlblwiIDogXCJtYXRoLXJvdy1vZGRcIik7XHJcbiAgICAgIC8vaWYgKGV4cHJlc3Npb24ubWF0Y2goL15cXC9cXC8vKSl7fVxyXG4gICAgICBjb25zdCBwcm9jZXNzTWF0aCA9IG5ldyBQcm9jZXNzTWF0aChleHByZXNzaW9uLHVzZXJWYXJpYWJsZXMsIHRoaXMuYXBwLGxpbmVDb250YWluZXIpO1xyXG4gICAgICBwcm9jZXNzTWF0aC5pbml0aWFsaXplKCk7XHJcblxyXG4gICAgICBpZihwcm9jZXNzTWF0aC5tb2RlIT09XCJ2YXJpYWJsZVwiKXtcclxuICAgICAgICBsaW5lQ29udGFpbmVyID0gcHJvY2Vzc01hdGguY29udGFpbmVyIGFzIEhUTUxEaXZFbGVtZW50O1xyXG4gICAgICAgIG1haW5Db250YWluZXIuYXBwZW5kQ2hpbGQobGluZUNvbnRhaW5lcik7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZXtza2lwcGVkSW5kZXhlcysrO31cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgUHJvY2Vzc01hdGgge1xyXG4gIG1hdGhJbnB1dDogYW55O1xyXG4gIHVzZXJWYXJpYWJsZXM6IHsgdmFyaWFibGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10gPSBbXTtcclxuICBtb2RlID0gXCJtYXRoXCI7XHJcbiAgcmVzdWx0OiBhbnk7XHJcbiAgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcclxuICBpY29uc0RpdjogSFRNTEVsZW1lbnQ7XHJcbiAgYXBwOiBBcHA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKG1hdGhJbnB1dDogc3RyaW5nLHVzZXJWYXJpYWJsZXM6IGFueSwgYXBwOiBBcHAsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcclxuICAgIHRoaXMubWF0aElucHV0ID0gbWF0aElucHV0O1xyXG4gICAgdGhpcy51c2VyVmFyaWFibGVzPXVzZXJWYXJpYWJsZXM7XHJcbiAgICB0aGlzLmFwcCA9IGFwcDtcclxuICAgIHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xyXG4gICAgdGhpcy5pY29uc0RpdiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pY29uc1wiLFxyXG4gICAgfSk7XHJcbiAgfVxyXG5cclxuICBhc3luYyBpbml0aWFsaXplKCkge1xyXG4gICAgdGhpcy5hc3NpZ25Nb2RlKCk7XHJcbiAgICB0aGlzLnNldHVwQ29udGFpbmVyKCk7XHJcbiAgICB0aGlzLmhhbmRsZVZhcmlhYmxlcygpO1xyXG4gICAgdGhpcy5jYWxjdWxhdGVNYXRoKCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIHNldHVwQ29udGFpbmVyKCkge1xyXG4gICAgW1wibWF0aC1pbnB1dFwiLCBcIm1hdGgtcmVzdWx0XCJdLmZvckVhY2goY2xhc3NOYW1lID0+IHtcclxuICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgZGl2LmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lKTtcclxuICAgICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQoZGl2KTtcclxuICAgIH0pO1xyXG4gICAgdGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5pY29uc0Rpdik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhbGN1bGF0ZU1hdGgoKSB7XHJcbiAgICBjb25zdCBpbnB1dERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1pbnB1dFwiKSBhcyBIVE1MRWxlbWVudDtcclxuICAgIGNvbnN0IHJlc3VsdERpdiA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIubWF0aC1yZXN1bHRcIikgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICB0cnkge1xyXG4gICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgIGNhc2UgXCJiaW5vbVwiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBiaW5vbU1vZGVsID0gbmV3IEJpbm9tSW5mb01vZGVsKHRoaXMuYXBwLCB0aGlzLm1hdGhJbnB1dCk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChiaW5vbU1vZGVsKTtcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gYmlub21Nb2RlbC5nZXRFcXVhbCgpO1xyXG4gICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSBcImNvc1wiOlxyXG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNhc2UtZGVjbGFyYXRpb25zXHJcbiAgICAgICAgICBjb25zdCBbICwgc2lkZUEsIHNpZGVCLCBzaWRlQyBdID0gdGhpcy5tYXRoSW5wdXQubWFwKE51bWJlcik7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdD1maW5kQW5nbGVCeUNvc2luZVJ1bGUoc2lkZUEsIHNpZGVCLCBzaWRlQylcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jYXNlLWRlY2xhcmF0aW9uc1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9bmV3IFZlY1Byb2Nlc3Nvcih0aGlzLm1hdGhJbnB1dFsxXSx0aGlzLm1hdGhJbnB1dFsyXSx0aGlzLm1hdGhJbnB1dFszXSk7XHJcbiAgICAgICAgICB0aGlzLmFkZEluZm9Nb2RhbChuZXcgdGlrekdyYXBoKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC5ncmFwaCkpO1xyXG4gICAgICAgICAgdGhpcy5hZGREZWJ1Z01vZGVsKG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLCB0aGlzLnJlc3VsdC52ZWNJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5yZXN1bHQ9dGhpcy5yZXN1bHQucmVzdWx0XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIFwidmFyaWFibGVcIjpcclxuICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY2FzZS1kZWNsYXJhdGlvbnNcclxuICAgICAgICAgIHRoaXMucmVzdWx0ID0gbmV3IE1hdGhQcmFpc2VyKHRoaXMubWF0aElucHV0KTtcclxuICAgICAgICAgIHRoaXMuYWRkSW5mb01vZGFsKG5ldyBJbmZvTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvKSk7XHJcbiAgICAgICAgICB0aGlzLmFkZERlYnVnTW9kZWwobmV3IERlYnVnTW9kYWwodGhpcy5hcHAsIHRoaXMucmVzdWx0Lm1hdGhJbmZvLmRlYnVnSW5mbykpO1xyXG4gICAgICAgICAgdGhpcy5tYXRoSW5wdXQ9dGhpcy5yZXN1bHQuaW5wdXQ7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgfVxyXG4gICAgIHRoaXMuYWRkSW5wdXRBbmRSZXN1bHREaXYoaW5wdXREaXYsIHJlc3VsdERpdiwgdHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIj90aGlzLm1hdGhJbnB1dDp0aGlzLm1hdGhJbnB1dFswXSwgdGhpcy5yZXN1bHQvKnJvdW5kQnlTZXR0aW5ncyh0aGlzLnJlc3VsdCkqLyk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgdGhpcy5kaXNwbGF5RXJyb3IoaW5wdXREaXYsIHJlc3VsdERpdiwgZXJyKTtcclxuICAgICAgY29uc29sZS5lcnJvcihcIlRoZSBpbml0aWFsIHByYWlzaW5nIGZhaWxlZFwiLGVycik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGFkZElucHV0QW5kUmVzdWx0RGl2KGlucHV0RGl2OiBIVE1MRWxlbWVudCwgcmVzdWx0RGl2OiBIVE1MRWxlbWVudCwgaW5wdXQ6IHN0cmluZywgcmVzdWx0OiBhbnkpIHtcclxuICAgIGlucHV0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgoaW5wdXQsdHJ1ZSkpXHJcbiAgICAvL01hcmtkb3duUmVuZGVyZXIucmVuZGVyTWFya2Rvd24oYFxcJHske2lucHV0fX0kYCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgICAvL2NvbnN0IHJlc3VsdE91dHB1dCA9IC8odHJ1ZXxmYWxzZSkvLnRlc3QocmVzdWx0KSA/IHJlc3VsdCA6IGBcXCR7JHtyZXN1bHR9fSRgO1xyXG4gICAgcmVzdWx0RGl2LmFwcGVuZENoaWxkKHJlbmRlck1hdGgocmVzdWx0LnNvbHV0aW9uVG9TdHJpbmcoKXx8XCJcIix0cnVlKSlcclxuICAgIC8vTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bihyZXN1bHRPdXRwdXQsIHJlc3VsdERpdiwgXCJcIiwgbmV3IENvbXBvbmVudCgpKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgZGlzcGxheUVycm9yKGlucHV0RGl2OiBIVE1MRWxlbWVudCwgcmVzdWx0RGl2OiBIVE1MRWxlbWVudCwgZXJyOiBFcnJvcikge1xyXG4gICAgTWFya2Rvd25SZW5kZXJlci5yZW5kZXJNYXJrZG93bih0aGlzLm1hdGhJbnB1dCwgaW5wdXREaXYsIFwiXCIsIG5ldyBDb21wb25lbnQoKSk7XHJcbiAgICByZXN1bHREaXYuaW5uZXJIVE1MID0gYDxzcGFuIGNsYXNzPVwiZXJyb3ItdGV4dFwiPiR7ZXJyLm1lc3NhZ2V9PC9zcGFuPmA7XHJcbiAgICB0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFwibWF0aC1lcnJvci1saW5lXCIpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3NpZ25Nb2RlKCkge1xyXG4gICAgY29uc3QgcmVnZXhMaXN0ID0gR2V0TWF0aENvbnRleHRSZWdleCgpO1xyXG4gICAgY29uc3QgbWF0Y2hPYmplY3QgPSByZWdleExpc3QuZmluZChyZWdleE9iaiA9PiByZWdleE9iai5yZWdleC50ZXN0KHRoaXMubWF0aElucHV0KSk7XHJcbiAgICBpZiAobWF0Y2hPYmplY3QpIHtcclxuICAgICAgdGhpcy5tb2RlID0gbWF0Y2hPYmplY3QudmFsdWU7XHJcbiAgICAgIHRoaXMubWF0aElucHV0ID0gdGhpcy5tYXRoSW5wdXQubWF0Y2gobWF0Y2hPYmplY3QucmVnZXgpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGRJbmZvTW9kYWwobW9kYWw6IGFueSkge1xyXG4gICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSwge1xyXG4gICAgICBjbGFzc05hbWU6IFwibWF0aC1pbmZvLWljb25cIixcclxuICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxyXG4gICAgfSk7XHJcbiAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBtb2RhbC5vcGVuKCk7XHJcbiAgICB0aGlzLmljb25zRGl2LmFwcGVuZENoaWxkKGljb24pO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhZGREZWJ1Z01vZGVsKG1vZGFsOiBhbnkpIHtcclxuICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksIHtcclxuICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxyXG4gICAgICB0ZXh0Q29udGVudDogXCLwn5CeXCIsXHJcbiAgICB9KTtcclxuICAgIGljb24ub25jbGljayA9ICgpID0+IG1vZGFsLm9wZW4oKTtcclxuICAgIHRoaXMuaWNvbnNEaXYuYXBwZW5kQ2hpbGQoaWNvbik7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGhhbmRsZVZhcmlhYmxlcygpIHtcclxuICAgIGlmICh0aGlzLm1vZGU9PT1cInZhcmlhYmxlXCIpIHtcclxuICAgICAgdGhpcy5oYW5kbGVWYXJpYWJsZURlY2xhcmF0aW9uKCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLnJlcGxhY2VWYXJpYWJsZXNJbkV4cHJlc3Npb24oKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgaGFuZGxlVmFyaWFibGVEZWNsYXJhdGlvbigpIHtcclxuICAgIGNvbnN0IFtfLHZhcmlhYmxlLCB2YWx1ZV0gPSB0aGlzLm1hdGhJbnB1dC5tYXAoKHBhcnQ6IHN0cmluZykgPT4gcGFydC50cmltKCkpO1xyXG4gICAgaWYgKCF2YXJpYWJsZSB8fCAhdmFsdWUpIHtcclxuICAgICAgY29uc29sZS53YXJuKGBJbnZhbGlkIHZhcmlhYmxlIGRlY2xhcmF0aW9uOiAke3RoaXMubWF0aElucHV0fWApO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBleGlzdGluZ1ZhckluZGV4ID0gdGhpcy51c2VyVmFyaWFibGVzLmZpbmRJbmRleCh2ID0+IHYudmFyaWFibGUgPT09IHZhcmlhYmxlKTtcclxuICAgIGlmIChleGlzdGluZ1ZhckluZGV4ICE9PSAtMSkge1xyXG4gICAgICB0aGlzLnVzZXJWYXJpYWJsZXNbZXhpc3RpbmdWYXJJbmRleF0udmFsdWUgPSB2YWx1ZTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMudXNlclZhcmlhYmxlcy5wdXNoKHsgdmFyaWFibGUsIHZhbHVlIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSByZXBsYWNlVmFyaWFibGVzSW5FeHByZXNzaW9uKCl7XHJcbiAgICB0aGlzLnVzZXJWYXJpYWJsZXMuZm9yRWFjaCgoeyB2YXJpYWJsZSwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICBpZiAodHlwZW9mIHRoaXMubWF0aElucHV0PT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgdGhpcy5tYXRoSW5wdXQgPSB0aGlzLm1hdGhJbnB1dC5yZXBsYWNlKHZhcmlhYmxlLCB2YWx1ZSk7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIEdldE1hdGhDb250ZXh0UmVnZXgoKSB7XHJcbiAgcmV0dXJuIFtcclxuICAgIHsgcmVnZXg6IC9iaW5vbVxcKChcXGQrKSwoXFxkKyksKFxcZCspXFwpLywgdmFsdWU6IFwiYmlub21cIiB9LFxyXG4gICAgeyByZWdleDogL3ZlYyhbKy1dezAsMn0pXFwoKFtcXGQuKy1dK1s6LF1bXFxkListXSspXFwpKFtcXGQuKy1dKikvLCB2YWx1ZTogXCJ2ZWNcIiB9LFxyXG4gICAgeyByZWdleDogL2Nvc1xcKChbXFxkLl0rKSwoW1xcZC5dKyksKFtcXGQuXSspXFwpLywgdmFsdWU6IFwiY29zXCIgfSxcclxuICAgIHsgcmVnZXg6IC92YXJcXHMqKFtcXHddKylcXHMqPVxccyooW1xcZC5dKykvLCB2YWx1ZTogXCJ2YXJpYWJsZVwiIH0sXHJcbiAgXTtcclxufVxyXG5cclxuXHJcbmNsYXNzIFZlY1Byb2Nlc3NvciB7XHJcbiAgdXNlcklucHV0OiBhbnk7XHJcbiAgZW52aXJvbm1lbnQ6IHsgWDogc3RyaW5nOyBZOiBzdHJpbmcgfTtcclxuICB2ZWNJbmZvID0gbmV3IE1hdGhJbmZvKCk7XHJcbiAgYXhpczogQXhpcztcclxuICBtb2RpZmllcjogbnVtYmVyO1xyXG4gIHJlc3VsdDogc3RyaW5nO1xyXG4gIGdyYXBoPzogYW55O1xyXG5cclxuICBjb25zdHJ1Y3RvcihlbnZpcm9ubWVudDogc3RyaW5nLCBtYXRoSW5wdXQ6IHN0cmluZywgbW9kaWZpZXI6IHN0cmluZykge1xyXG4gICAgdGhpcy51c2VySW5wdXQ9bWF0aElucHV0O1xyXG4gICAgY29uc3QgbWF0Y2ggPSBlbnZpcm9ubWVudC5tYXRjaCgvKFsrLV0/KShbKy1dPykvKTtcclxuICAgIHRoaXMuZW52aXJvbm1lbnQgPSB7IFg6IG1hdGNoPy5bMV0gPz8gXCIrXCIsIFk6IG1hdGNoPy5bMl0gPz8gXCIrXCIgfTtcclxuXHJcbiAgICB0aGlzLm1vZGlmaWVyID0gbW9kaWZpZXIubGVuZ3RoID4gMCA/IGdldFVzYWJsZURlZ3JlZXMoTnVtYmVyKG1vZGlmaWVyKSkgOiAwO1xyXG5cclxuICAgIHRoaXMuYXhpcz1uZXcgQXhpcygpLnVuaXZlcnNhbCh0aGlzLnVzZXJJbnB1dClcclxuICAgIGlmICghdGhpcy5heGlzLnBvbGFyQW5nbGUpXHJcbiAgICAgIHRoaXMuYXhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKCk7XHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwiYXhpc1wiLHRoaXMuYXhpcyk7XHJcbiAgICB0aGlzLmFkZFJlc3VsdCgpO1xyXG4gICAgdGhpcy5hZGRHcmFwaCgpO1xyXG4gIH1cclxuICBhZGRSZXN1bHQoKXtcclxuICAgIGlmICh0aGlzLnVzZXJJbnB1dC5pbmNsdWRlcyhcIjpcIikpXHJcbiAgICAgIHRoaXMucmVzdWx0PWB4ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWH1cXFxccXVhZCx5ID0gJHt0aGlzLmF4aXMuY2FydGVzaWFuWX1gXHJcbiAgICBlbHNlXHJcbiAgICAgIHRoaXMucmVzdWx0PWBhbmdsZSA9ICR7dGhpcy5heGlzLnBvbGFyQW5nbGV9XFxcXHF1YWQsbGVuZ3RoID0gJHt0aGlzLmF4aXMucG9sYXJMZW5ndGh9YFxyXG4gIH1cclxuICBhZGRHcmFwaCgpIHtcclxuICAgIGNvbnN0IHRhcmdldFNpemUgPSAxMDtcclxuICAgIGNvbnN0IG1heENvbXBvbmVudCA9IE1hdGgubWF4KE1hdGguYWJzKHRoaXMuYXhpcy5jYXJ0ZXNpYW5YKSwgTWF0aC5hYnModGhpcy5heGlzLmNhcnRlc2lhblkpKTtcclxuXHJcbiAgICAvLyBEZXRlcm1pbmUgc2NhbGluZyBmYWN0b3JcclxuICAgIGxldCBzY2FsZSA9IDE7XHJcbiAgICBpZiAobWF4Q29tcG9uZW50IDwgdGFyZ2V0U2l6ZSkge1xyXG4gICAgICBzY2FsZSA9IHRhcmdldFNpemUgLyBtYXhDb21wb25lbnQ7XHJcbiAgICB9IGVsc2UgaWYgKG1heENvbXBvbmVudCA+IHRhcmdldFNpemUpIHtcclxuICAgICAgc2NhbGUgPSB0YXJnZXRTaXplIC8gbWF4Q29tcG9uZW50O1xyXG4gICAgfVxyXG4gICAgLy8gaSBuZWVkIHRvIG1ha2UgaXQgXCJ0byBYIGF4aXNcIlxyXG4gICAgLy9jb25zdCB2ZWN0b3JBbmdsZSA9IGdldFVzYWJsZURlZ3JlZXMocmFkaWFuc1RvRGVncmVlcyhNYXRoLmF0YW4yKHNjYWxlZFksIHNjYWxlZFgpKSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKDAsMCk7XHJcblxyXG5cclxuICAgLy8gY29uc3QgZHJhdz0gW2FuY2VyLCctLScsbmV3IENvb3JkaW5hdGUoe21vZGU6XCJub2RlLWlubGluZVwiLGxhYmVsOiB0aGlzLmF4aXMucG9sYXJMZW5ndGgudG9TdHJpbmcoKX0pLHRoaXMuYXhpc107XHJcbiAgICAvL2NvbnN0IGRyYXdYPSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5jYXJ0ZXNpYW5YLnRvU3RyaW5nKCl9KSxuZXcgQXhpcyh0aGlzLmF4aXMuY2FydGVzaWFuWCwwKV07XHJcbiAgICAvL2NvbnN0IGRyYXdZPSBbYW5jZXIsJy0tJyxuZXcgQ29vcmRpbmF0ZSh7bW9kZTpcIm5vZGUtaW5saW5lXCIsbGFiZWw6IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZLnRvU3RyaW5nKCl9KSxuZXcgQXhpcygwLHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZKV07XHJcblxyXG4gICAgdGhpcy5ncmFwaD1bXHJcbiAgICAgIC8vbmV3IEZvcm1hdHRpbmcoXCJnbG9ib2xcIix7Y29sb3I6IFwid2hpdGVcIixzY2FsZTogMSx9KSxcclxuICAgICAgLy9uZXcgRHJhdyh7ZHJhd0FycjogZHJhdyxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwicmVkXCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxyXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3WCxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxyXG4gICAgICAvL25ldyBEcmF3KHtkcmF3QXJyOiBkcmF3WSxmb3JtYXR0aW5nT2JqOiB7bGluZVdpZHRoOiAxLGRyYXc6IFwieWVsbG93XCIsYXJyb3I6IFwiLXtTdGVhbHRofVwifX0pLFxyXG4gICAgXVxyXG4gICAgXHJcbiAgICBcclxuICAgIHRoaXMudmVjSW5mby5hZGREZWJ1Z0luZm8oXCJ0aGlzLmdyYXBoXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b2tlbnMsbnVsbCwxKSk7XHJcbiAgICB0aGlzLnZlY0luZm8uYWRkRGVidWdJbmZvKFwidGhpcy5ncmFwaC50b1N0cmluZygpXFxuXCIsSlNPTi5zdHJpbmdpZnkodGhpcy5ncmFwaC50b1N0cmluZygpKSk7XHJcbiAgICAvKiBHZW5lcmF0ZSBMYVRlWCBjb2RlIGZvciB2ZWN0b3IgY29tcG9uZW50cyBhbmQgbWFpbiB2ZWN0b3JcclxuICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxyXG5cclxuICAgICAgJSBBbmdsZSBBbm5vdGF0aW9uXHJcbiAgICAgICVcXGFuZ3tYfXthbmN9e3ZlY317fXske3JvdW5kQnlTZXR0aW5ncyh2ZWN0b3JBbmdsZSl9JF57XFxjaXJjfSR9XHJcbiAgICBgLnJlcGxhY2UoL15cXHMrL2dtLCBcIlwiKTsqL1xyXG4gICAgdGhpcy52ZWNJbmZvLmFkZERlYnVnSW5mbyhcIlNjYWxpbmcgZmFjdG9yXCIsIHNjYWxlKTtcclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuY2xhc3MgdGlrekdyYXBoIGV4dGVuZHMgTW9kYWwge1xyXG4gIHRpa3o6IEZvcm1hdFRpa3pqYXg7XHJcbiAgY29uc3RydWN0b3IoYXBwOiBBcHAsdGlrekNvZGU6IGFueSl7XHJcbiAgICBzdXBlcihhcHApO1xyXG4gICAgdGhpcy50aWt6PW5ldyBGb3JtYXRUaWt6amF4KHRpa3pDb2RlKTtcclxuICB9XHJcblxyXG4gIG9uT3BlbigpIHtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29uc3QgY29kZT10aGlzLnRpa3o7XHJcbiAgICBjb25zdCBzY3JpcHQgPSBjb250ZW50RWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcclxuICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XHJcbiAgICBzY3JpcHQuc2V0VGV4dChjb2RlLmdldENvZGUoKSk7XHJcbiAgICBcclxuICAgIGNvbnN0IGFjdGlvbkJ1dHRvbiA9IGNvbnRlbnRFbC5jcmVhdGVFbChcImJ1dHRvblwiLCB7IHRleHQ6IFwiQ29weSBncmFwaFwiLCBjbHM6IFwiaW5mby1tb2RhbC1Db3B5LWJ1dHRvblwiIH0pO1xyXG5cclxuICAgIGFjdGlvbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgKCkgPT4ge1xyXG4gICAgICBuYXZpZ2F0b3IuY2xpcGJvYXJkLndyaXRlVGV4dCh0aGlzLnRpa3ouZ2V0Q29kZSgpKTtcclxuICAgICAgbmV3IE5vdGljZShcIkdyYXBoIGNvcGllZCB0byBjbGlwYm9hcmQhXCIpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG4gIG9uQ2xvc2UoKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgICAgY29udGVudEVsLmVtcHR5KCk7XHJcbiAgfVxyXG59XHJcblxyXG50eXBlIERpc3RyaWJ1dGlvblR5cGUgPSAnbm9ybWFsJyB8ICdiaW5vbWlhbCcgfCAncG9pc3Nvbic7XHJcblxyXG5jbGFzcyBEaXN0cmlidXRpb24ge1xyXG4gIHByaXZhdGUgdHlwZTogRGlzdHJpYnV0aW9uVHlwZTtcclxuICBwcml2YXRlIHg6IG51bWJlcjtcclxuICBwcml2YXRlIG11OiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBzaWdtYTogbnVtYmVyXHJcbiAgcHJpdmF0ZSB2YXJpYW5jZTogbnVtYmVyXHJcblxyXG4gIFxyXG5cclxuICAvLyBGb3IgQmlub21pYWwgRGlzdHJpYnV0aW9uXHJcbiAgcHJpdmF0ZSB0cmlhbHM6IG51bWJlcjtcclxuICBwcml2YXRlIHByb2JhYmlsaXR5OiBudW1iZXI7XHJcblxyXG4gIC8vIEZvciBQb2lzc29uIERpc3RyaWJ1dGlvblxyXG4gIHByaXZhdGUgbGFtYmRhOiBudW1iZXI7XHJcbiAgLypcclxuICBjb25zdHJ1Y3Rvcih0eXBlOiBEaXN0cmlidXRpb25UeXBlLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4pIHtcclxuICAgIHRoaXMudHlwZSA9IHR5cGU7XHJcblxyXG4gICAgLy8gSW5pdGlhbGl6ZSBiYXNlZCBvbiBkaXN0cmlidXRpb24gdHlwZVxyXG4gICAgc3dpdGNoICh0eXBlKSB7XHJcbiAgICAgIGNhc2UgJ25vcm1hbCc6XHJcbiAgICAgICAgdGhpcy5tZWFuID0gcGFyYW1zLm1lYW4gfHwgMDtcclxuICAgICAgICB0aGlzLnN0ZERldiA9IHBhcmFtcy5zdGREZXYgfHwgMTtcclxuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5zdGREZXYgKiogMjtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAnYmlub21pYWwnOlxyXG4gICAgICAgIHRoaXMudHJpYWxzID0gcGFyYW1zLnRyaWFscyB8fCAxO1xyXG4gICAgICAgIHRoaXMucHJvYmFiaWxpdHkgPSBwYXJhbXMucHJvYmFiaWxpdHkgfHwgMC41O1xyXG4gICAgICAgIHRoaXMubWVhbiA9IHRoaXMudHJpYWxzICogdGhpcy5wcm9iYWJpbGl0eTtcclxuICAgICAgICB0aGlzLnZhcmlhbmNlID0gdGhpcy5tZWFuICogKDEgLSB0aGlzLnByb2JhYmlsaXR5KTtcclxuICAgICAgICB0aGlzLnN0ZERldiA9IE1hdGguc3FydCh0aGlzLnZhcmlhbmNlKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgY2FzZSAncG9pc3Nvbic6XHJcbiAgICAgICAgdGhpcy5sYW1iZGEgPSBwYXJhbXMubGFtYmRhIHx8IDE7XHJcbiAgICAgICAgdGhpcy5tZWFuID0gdGhpcy5sYW1iZGE7XHJcbiAgICAgICAgdGhpcy52YXJpYW5jZSA9IHRoaXMubGFtYmRhO1xyXG4gICAgICAgIHRoaXMuc3RkRGV2ID0gTWF0aC5zcXJ0KHRoaXMudmFyaWFuY2UpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgZGlzdHJpYnV0aW9uIHR5cGUnKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHB1YmxpYyBub3JtYWxQREYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdub3JtYWwnKSB7XHJcbiAgICAgIHRocm93IG5ldyBFcnJvcignUERGIG9ubHkgYXBwbGllcyB0byB0aGUgTm9ybWFsIERpc3RyaWJ1dGlvbicpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZXhwUGFydCA9IE1hdGguZXhwKC0oKHggLSB0aGlzLm1lYW4pICoqIDIpIC8gKDIgKiB0aGlzLnZhcmlhbmNlKSk7XHJcbiAgICByZXR1cm4gKDEgLyAodGhpcy5zdGREZXYgKiBNYXRoLnNxcnQoMiAqIE1hdGguUEkpKSkgKiBleHBQYXJ0O1xyXG4gIH1cclxuXHJcbiAgcHVibGljIG5vcm1hbENERih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgaWYgKHRoaXMudHlwZSAhPT0gJ25vcm1hbCcpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdDREYgb25seSBhcHBsaWVzIHRvIHRoZSBOb3JtYWwgRGlzdHJpYnV0aW9uJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gMC41ICogKDEgKyB0aGlzLmVyZigoeCAtIHRoaXMubWVhbikgLyAoTWF0aC5zcXJ0KDIpICogdGhpcy5zdGREZXYpKSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgYmlub21pYWxQTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdiaW5vbWlhbCcpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdQTUYgb25seSBhcHBsaWVzIHRvIHRoZSBCaW5vbWlhbCBEaXN0cmlidXRpb24nKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbWJpbmF0aW9uID0gdGhpcy5mYWN0b3JpYWwodGhpcy50cmlhbHMpIC9cclxuICAgICAgKHRoaXMuZmFjdG9yaWFsKHgpICogdGhpcy5mYWN0b3JpYWwodGhpcy50cmlhbHMgLSB4KSk7XHJcbiAgICByZXR1cm4gY29tYmluYXRpb24gKiBNYXRoLnBvdyh0aGlzLnByb2JhYmlsaXR5LCB4KSAqIE1hdGgucG93KDEgLSB0aGlzLnByb2JhYmlsaXR5LCB0aGlzLnRyaWFscyAtIHgpO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIHBvaXNzb25QTUYoeDogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmICh0aGlzLnR5cGUgIT09ICdwb2lzc29uJykge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1BNRiBvbmx5IGFwcGxpZXMgdG8gdGhlIFBvaXNzb24gRGlzdHJpYnV0aW9uJyk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gKE1hdGgucG93KHRoaXMubGFtYmRhLCB4KSAqIE1hdGguZXhwKC10aGlzLmxhbWJkYSkpIC8gdGhpcy5mYWN0b3JpYWwoeCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGVyZih4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgY29uc3Qgc2lnbiA9IHggPCAwID8gLTEgOiAxO1xyXG4gICAgY29uc3QgYSA9IDAuMzI3NTkxMTtcclxuICAgIGNvbnN0IHAgPSAwLjI1NDgyOTU5MjtcclxuICAgIGNvbnN0IHEgPSAtMC4yODQ0OTY3MzY7XHJcbiAgICBjb25zdCByID0gMS40MjE0MTM3NDE7XHJcbiAgICBjb25zdCBzID0gLTEuNDUzMTUyMDI3O1xyXG4gICAgY29uc3QgdCA9IDEuMDYxNDA1NDI5O1xyXG4gICAgY29uc3QgdSA9IDEgKyBhICogTWF0aC5hYnMoeCk7XHJcbiAgICBjb25zdCBwb2x5ID0gKCgoKChwICogdSArIHEpICogdSArIHIpICogdSArIHMpICogdSArIHQpICogdSk7XHJcbiAgICByZXR1cm4gc2lnbiAqICgxIC0gcG9seSAqIE1hdGguZXhwKC14ICogeCkpO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBmYWN0b3JpYWwobjogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGlmIChuIDwgMCkgcmV0dXJuIE5hTjtcclxuICAgIGxldCByZXN1bHQgPSAxO1xyXG4gICAgZm9yIChsZXQgaSA9IDI7IGkgPD0gbjsgaSsrKSByZXN1bHQgKj0gaTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbiAgfSovXHJcbn1cclxuXHJcblxyXG5jbGFzcyBEaXN0cmlidXRpb25Nb2RlbCBleHRlbmRzIE1vZGFsIHtcclxuICBwcml2YXRlIG46IG51bWJlcjtcclxuICBwcml2YXRlIGs6IG51bWJlcjtcclxuICBwcml2YXRlIHA6IG51bWJlcjtcclxuICBwcml2YXRlIGVxdWFsID0gMDtcclxuICBwcml2YXRlIGxlc3MgPSAwO1xyXG4gIHByaXZhdGUgbGVzc0VxdWFsID0gMDtcclxuICBwcml2YXRlIGJpZyA9IDA7XHJcbiAgcHJpdmF0ZSBiaWdFcXVhbCA9IDA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKGFwcDogQXBwLCBzb3VyY2U6IHN0cmluZykge1xyXG4gICAgc3VwZXIoYXBwKTtcclxuICAgIGNvbnN0IFtfLCBuLCBrLCBwXSA9IHNvdXJjZS5tYXRjaCgvXFxkKy9nKSEubWFwKE51bWJlcik7XHJcbiAgICB0aGlzLm4gPSBuO1xyXG4gICAgdGhpcy5rID0gaztcclxuICAgIHRoaXMucCA9IHA7XHJcbiAgfVxyXG5cclxuICBvbk9wZW4oKSB7XHJcbiAgICB0aGlzLmNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKTtcclxuICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwiaDJcIiwgeyB0ZXh0OiBcIkJpbm9taWFsIFByb2JhYmlsaXR5IFJlc3VsdHNcIiB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYID0gJHt0aGlzLmt9KSA9ICR7dGhpcy5lcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPCAke3RoaXMua30pID0gJHt0aGlzLmxlc3N9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDw9ICR7dGhpcy5rfSkgPSAke3RoaXMubGVzc0VxdWFsfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+ICR7dGhpcy5rfSkgPSAke3RoaXMuYmlnfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA+PSAke3RoaXMua30pID0gJHt0aGlzLmJpZ0VxdWFsfWAgfSk7XHJcbiAgfVxyXG5cclxuICBwdWJsaWMgZ2V0RXF1YWwoKTogbnVtYmVyIHtcclxuICAgIHJldHVybiBjYWxjdWxhdGVCaW5vbSh0aGlzLm4sIHRoaXMuaywgdGhpcy5wKTtcclxuICB9XHJcblxyXG4gIHByaXZhdGUgY2FsY3VsYXRlUHJvYmFiaWxpdGllcygpIHtcclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDw9IHRoaXMubjsgaSsrKSB7XHJcbiAgICAgIGNvbnN0IHByb2JhYmlsaXR5ID0gY2FsY3VsYXRlQmlub20odGhpcy5uLCBpLCB0aGlzLnApO1xyXG4gICAgICBpZiAoaSA9PT0gdGhpcy5rKSB0aGlzLmVxdWFsID0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDwgdGhpcy5rKSB0aGlzLmxlc3MgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpIDw9IHRoaXMuaykgdGhpcy5sZXNzRXF1YWwgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID4gdGhpcy5rKSB0aGlzLmJpZyArPSBwcm9iYWJpbGl0eTtcclxuICAgICAgaWYgKGkgPj0gdGhpcy5rKSB0aGlzLmJpZ0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuY2xhc3MgQmlub21JbmZvTW9kZWwgZXh0ZW5kcyBNb2RhbCB7XHJcbiAgcHJpdmF0ZSBuOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBrOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBwOiBudW1iZXI7XHJcbiAgcHJpdmF0ZSBlcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBsZXNzID0gMDtcclxuICBwcml2YXRlIGxlc3NFcXVhbCA9IDA7XHJcbiAgcHJpdmF0ZSBiaWcgPSAwO1xyXG4gIHByaXZhdGUgYmlnRXF1YWwgPSAwO1xyXG5cclxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgc291cmNlOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGFwcCk7XHJcbiAgICBjb25zdCBbXywgbiwgaywgcF0gPSBzb3VyY2UubWF0Y2goL1xcZCsvZykhLm1hcChOdW1iZXIpO1xyXG4gICAgdGhpcy5uID0gbjtcclxuICAgIHRoaXMuayA9IGs7XHJcbiAgICB0aGlzLnAgPSBwO1xyXG4gIH1cclxuXHJcbiAgb25PcGVuKCkge1xyXG4gICAgdGhpcy5jYWxjdWxhdGVQcm9iYWJpbGl0aWVzKCk7XHJcbiAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcImgyXCIsIHsgdGV4dDogXCJCaW5vbWlhbCBQcm9iYWJpbGl0eSBSZXN1bHRzXCIgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA9ICR7dGhpcy5rfSkgPSAke3RoaXMuZXF1YWx9YCB9KTtcclxuICAgIGNvbnRlbnRFbC5jcmVhdGVFbChcInBcIiwgeyB0ZXh0OiBgUChYIDwgJHt0aGlzLmt9KSA9ICR7dGhpcy5sZXNzfWAgfSk7XHJcbiAgICBjb250ZW50RWwuY3JlYXRlRWwoXCJwXCIsIHsgdGV4dDogYFAoWCA8PSAke3RoaXMua30pID0gJHt0aGlzLmxlc3NFcXVhbH1gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPiAke3RoaXMua30pID0gJHt0aGlzLmJpZ31gIH0pO1xyXG4gICAgY29udGVudEVsLmNyZWF0ZUVsKFwicFwiLCB7IHRleHQ6IGBQKFggPj0gJHt0aGlzLmt9KSA9ICR7dGhpcy5iaWdFcXVhbH1gIH0pO1xyXG4gIH1cclxuXHJcbiAgcHVibGljIGdldEVxdWFsKCk6IG51bWJlciB7XHJcbiAgICByZXR1cm4gY2FsY3VsYXRlQmlub20odGhpcy5uLCB0aGlzLmssIHRoaXMucCk7XHJcbiAgfVxyXG5cclxuICBwcml2YXRlIGNhbGN1bGF0ZVByb2JhYmlsaXRpZXMoKSB7XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSB0aGlzLm47IGkrKykge1xyXG4gICAgICBjb25zdCBwcm9iYWJpbGl0eSA9IGNhbGN1bGF0ZUJpbm9tKHRoaXMubiwgaSwgdGhpcy5wKTtcclxuICAgICAgaWYgKGkgPT09IHRoaXMuaykgdGhpcy5lcXVhbCA9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8IHRoaXMuaykgdGhpcy5sZXNzICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA8PSB0aGlzLmspIHRoaXMubGVzc0VxdWFsICs9IHByb2JhYmlsaXR5O1xyXG4gICAgICBpZiAoaSA+IHRoaXMuaykgdGhpcy5iaWcgKz0gcHJvYmFiaWxpdHk7XHJcbiAgICAgIGlmIChpID49IHRoaXMuaykgdGhpcy5iaWdFcXVhbCArPSBwcm9iYWJpbGl0eTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gdGVzdE1hdGhFbmdpbmUoKXtcclxuICBjb25zdCBleHByZXNzaW9ucz1bXHJcbiAgICB7ZXhwcmVzc2lvbjogU3RyaW5nLnJhd2AyIFxcZnJhY3soNS0zKTM0fXtcXHNxcnR7Ml57Mn19fTAuNWAsZXhwZWN0ZWRPdXRwdXQ6ICczNCd9LFxyXG4gICAge2V4cHJlc3Npb246IFN0cmluZy5yYXdgKHgrMSkoeCszKT0yYCxleHBlY3RlZE91dHB1dDogJ3hfMT0tMC4yNjc5NSx4XzI9LTMuNzMyMDUnfSxcclxuICAgIHtleHByZXNzaW9uOiBTdHJpbmcucmF3YFxcZnJhY3sxMzJ9ezEyNjAreF57Mn19PTAuMDVgLGV4cGVjdGVkT3V0cHV0OiAneF8xPS0zNy4xNDgzNSx4XzI9MzcuMTQ4MzUnfSxcclxuICBdXHJcbiAgY29uc3QgcmVzdWx0cz1bXVxyXG4gIHRyeXtcclxuICAgIGV4cHJlc3Npb25zLmZvckVhY2goZXhwcmVzc2lvbiA9PiB7XHJcbiAgICAgIGNvbnN0IG1hdGg9bmV3IE1hdGhQcmFpc2VyKGV4cHJlc3Npb24uZXhwcmVzc2lvbik7XHJcbiAgICAgIGlmIChtYXRoLnNvbHV0aW9uIT09ZXhwcmVzc2lvbi5leHBlY3RlZE91dHB1dCl7XHJcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtleHByZXNzaW9uOiBleHByZXNzaW9uLmV4cHJlc3Npb24sZXhwZWN0ZWRPdXRwdXQ6IGV4cHJlc3Npb24uZXhwZWN0ZWRPdXRwdXQsYWN0dWFsT3V0cHV0OiBtYXRoLnNvbHV0aW9ufSlcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG4gIGNhdGNoKGUpe1xyXG4gICAgY29uc29sZS5sb2coZSlcclxuICB9XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbiJdfQ==