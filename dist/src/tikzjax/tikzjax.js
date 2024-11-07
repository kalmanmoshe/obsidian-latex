import { MarkdownView, WorkspaceWindow } from "obsidian";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { findIntersectionPoint, findSlope, polarToCartesian } from "src/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";
export class Tikzjax {
    app;
    plugin;
    activeView;
    //const editor = activeView?.editor as CodeMirrorEditor | null;
    constructor(app, plugin) {
        this.app = app;
        this.activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        this.plugin = plugin;
    }
    readyLayout() {
        this.plugin.app.workspace.onLayoutReady(() => {
            this.loadTikZJaxAllWindows();
            this.plugin.registerEvent(this.app.workspace.on("window-open", (win, window) => {
                this.loadTikZJax(window.document);
            }));
        });
    }
    loadTikZJax(doc) {
        const s = document.createElement("script");
        s.id = "tikzjax";
        s.type = "text/javascript";
        s.innerText = tikzjaxJs;
        doc.body.appendChild(s);
        doc.addEventListener("tikzjax-load-finished", this.postProcessSvg);
    }
    unloadTikZJax(doc) {
        const s = doc.getElementById("tikzjax");
        s?.remove();
        doc.removeEventListener("tikzjax-load-finished", this.postProcessSvg);
    }
    loadTikZJaxAllWindows() {
        for (const window of this.getAllWindows()) {
            this.loadTikZJax(window.document);
        }
    }
    unloadTikZJaxAllWindows() {
        for (const window of this.getAllWindows()) {
            this.unloadTikZJax(window.document);
        }
    }
    getAllWindows() {
        const windows = [];
        // push the main window's root split to the list
        windows.push(this.app.workspace.rootSplit.win);
        // @ts-ignore floatingSplit is undocumented
        const floatingSplit = this.app.workspace.floatingSplit;
        floatingSplit.children.forEach((child) => {
            // if this is a window, push it to the list 
            if (child instanceof WorkspaceWindow) {
                windows.push(child.win);
            }
        });
        return windows;
    }
    registerTikzCodeBlock() {
        this.plugin.registerMarkdownCodeBlockProcessor("tikz", (source, el, ctx) => {
            const icon = Object.assign(el.createEl("div"), {
                className: "math-debug-icon",
                textContent: "🛈",
            });
            try {
                const script = el.createEl("script");
                script.setAttribute("type", "text/tikz");
                script.setAttribute("data-show-console", "true");
                script.setText(this.tidyTikzSource(source, icon));
            }
            catch (e) {
                el.innerHTML = "";
                const errorDisplay = el.createEl("div", { cls: "math-error-line" });
                errorDisplay.innerText = `Error: ${e.message}`;
                errorDisplay.classList.add("error-text");
                console.error("TikZ Processing Error:", e);
            }
        });
    }
    addSyntaxHighlighting() {
        // @ts-ignore
        window.CodeMirror.modeInfo.push({ name: "Tikz", mime: "text/x-latex", mode: "stex" });
    }
    removeSyntaxHighlighting() {
        // @ts-ignore
        window.CodeMirror.modeInfo = window.CodeMirror.modeInfo.filter(el => el.name != "Tikz");
    }
    tidyTikzSource(tikzSource, icon) {
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");
        let lines = tikzSource.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        const tikzjax = new FormatTikzjax(lines.join("\n"));
        icon.onclick = () => new DebugModal(this.app, tikzjax.debugInfo).open();
        return tikzjax.getCode();
    }
    colorSVGinDarkMode(svg) {
        svg = svg.replaceAll(/("#000"|"black")/g, "\"currentColor\"")
            .replaceAll(/("#fff"|"white")/g, "\"var(--background-primary)\"");
        return svg;
    }
    optimizeSVG(svg) {
        // Optimize the SVG using SVGO
        // Fixes misaligned text nodes on mobile
        return optimize(svg, { plugins: [
                {
                    name: "preset-default",
                    params: {
                        overrides: {
                            cleanupIDs: false
                        }
                    }
                }
            ]
            // @ts-ignore
        })?.data;
    }
    postProcessSvg = (e) => {
        const svgEl = e.target;
        let svg = svgEl.outerHTML;
        if (this.plugin.settings.invertColorsInDarkMode) {
            svg = this.colorSVGinDarkMode(svg);
        }
        svg = this.optimizeSVG(svg);
        svgEl.outerHTML = svg;
    };
}
const parseNumber = (value) => {
    console.log("value", value, parseFloat("-0.5"));
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};
function parseCoordinates(coordinate, tokens, formatting, coordinatesArray) {
    let xValue = 0, yValue = 0;
    const findOriginalValue = (value) => {
        const og = tokens.find((token) => (token instanceof Coordinate || token?.type === "node") && token.coordinateName === value);
        return og instanceof Coordinate ? og : undefined;
    };
    const parseCartesian = (coord) => {
        const [x, y] = coord.split(",").map(parseNumber);
        return { X: x, Y: y };
    };
    const parseIntersection = (coord) => {
        const originalCoords = coord
            .replace(/intersection\s?of\s?/g, "")
            .replace(/(\s*and\s?|--)/g, " ")
            .split(" ")
            .map(findOriginalValue)
            .filter((token) => token !== undefined);
        if (originalCoords.length < 4) {
            throw new Error("Intersection had undefined coordinates or insufficient data");
        }
        const slopes = [
            findSlope(originalCoords[0], originalCoords[1]),
            findSlope(originalCoords[2], originalCoords[3]),
        ];
        return findIntersectionPoint(originalCoords[0], originalCoords[2], slopes[0], slopes[1]);
    };
    const handleFormatting = () => {
        let coor = { X: 0, Y: 0 };
        if (formatting && coordinatesArray && coordinatesArray.length > 0) {
            if (formatting === "--+") {
                const found = coordinatesArray.find((token) => token instanceof Coordinate);
                coor = found && typeof found !== "string" ? found : coor;
            }
            else if (formatting === "--++") {
                const found = [...coordinatesArray].reverse().find((token) => token instanceof Coordinate);
                coor = found && typeof found !== "string" ? found : coor;
            }
        }
        return coor;
    };
    if (typeof coordinate !== "string") {
        throw new Error(`Expected coordinate to be string coordinate was ${typeof coordinate}`);
    }
    const ca = String.raw `[\w\d\s\-,.:]`;
    const regex = new RegExp(String.raw `\$\((${ca}+)\)([\d+\w:!.]+)\((${ca}+)\)\$`);
    const match = coordinate.match(regex);
    if (match) {
        const coordinate1 = parseCoordinates(match[1], tokens);
        const coordinate2 = parseCoordinates(match[3], tokens);
        [xValue, yValue] = [coordinate1.X + coordinate2.X, coordinate1.Y + coordinate2.Y];
    }
    else if (coordinate.includes(",")) {
        ({ X: xValue, Y: yValue } = parseCartesian(coordinate));
    }
    else if (coordinate.includes(":")) {
        ({ X: xValue, Y: yValue } = polarToCartesian(coordinate));
    }
    else if (coordinate.includes("intersection")) {
        ({ X: xValue, Y: yValue } = parseIntersection(coordinate));
    }
    else {
        const tokenMatch = findOriginalValue(coordinate);
        if (tokenMatch) {
            [xValue, yValue] = [tokenMatch.X, tokenMatch.Y];
        }
    }
    // Apply formatting adjustments if available
    const formattingAdjustment = handleFormatting();
    xValue += formattingAdjustment.X;
    yValue += formattingAdjustment.Y;
    if (typeof xValue !== "number" || typeof yValue !== "number") {
        throw new Error("Raising the coordinates failed. Couldn't find appropriate Xvalue or Yvalue");
    }
    return {
        X: xValue,
        Y: yValue,
    };
}
export class Coordinate {
    mode;
    X;
    Y;
    original;
    coordinateName;
    formatting;
    label;
    quadrant;
    asCoordinate(match, tokens) {
        this.mode = "coordinate";
        [this.original, this.coordinateName, this.label, this.formatting] = [match[1], match[2], match[3], match[4]];
        Object.assign(this, parseCoordinates(this.original, tokens));
        return this;
    }
    asNode(match, tokens) {
        this.mode = "node";
        [this.original, this.coordinateName, this.label, this.formatting] = [match[1], match[2], match[3], match[4]];
        Object.assign(this, parseCoordinates(this.original, tokens));
        return this;
    }
    simpleXY(coordinate, tokens, previousFormatting, coordinatesArray) {
        Object.assign(this, parseCoordinates(coordinate, tokens, previousFormatting, coordinatesArray));
        return this;
    }
    addXY(X, Y) {
        [this.X, this.Y] = [X, Y];
        return this;
    }
    toString() {
        return `\\coor{${this.X},${this.Y}}{${this.coordinateName || ""}}{${this.label || ""}}{${generateFormatting(this) || ""}}`;
    }
    toStringDraw() {
        return `(${this.coordinateName ? this.coordinateName : this.X + "," + this.Y})`;
    }
    addQuadrant(midPoint) {
        const xDirection = this.X > midPoint.X ? 1 : -1;
        const yDirection = this.Y > midPoint.Y ? 1 : -1;
        this.quadrant = yDirection === 1 ? (xDirection === 1 ? 1 : 2) : (xDirection === 1 ? 4 : 3);
    }
}
class Draw {
    formatting;
    coordinates;
    constructor(match, tokens) {
        this.formatting = match[1];
        this.coordinates = this.fillCoordinates(this.getSchematic(match[2]), tokens);
    }
    fillCoordinates(schematic, tokens) {
        const coorArr = [];
        for (let i = 0; i < schematic.length; i++) {
            if (schematic[i].type === "coordinate") {
                let previousFormatting;
                if (i > 0 && schematic[i - 1].type === "formatting") {
                    previousFormatting = schematic[i - 1].value;
                }
                else if (i > 1 && schematic[i - 1].type === "node" && schematic[i - 2].type === "formatting") {
                    previousFormatting = schematic[i - 2].value;
                }
                coorArr.push(new Coordinate().simpleXY(schematic[i].value, tokens, previousFormatting, coorArr));
            }
            else {
                coorArr.push({ ...schematic[i] });
            }
        }
        return coorArr;
    }
    getSchematic(draw) {
        const coordinatesArray = [];
        const nodeRegex = new RegExp(String.raw `node\s*\[(${f}*)\]\s*{(${t}+)}`);
        const formattingRegex = /(--cycle|cycle|--\+\+|--\+|--|-\||\|-|grid|circle|rectangle)/;
        const ca = String.raw `\w\d\s\-,.:`; // Define allowed characters for `ca`
        const coordinateRegex = new RegExp(String.raw `(\([${ca}]+\)|\(\$\([${ca}]+\)[${ca}!:+\-]+\([${ca}]+\)\$\))`);
        let i = 0;
        let loops = 0;
        while (i < draw.length && loops < 100) { // Increase loop limit or add condition based on parsed length
            loops++;
            const coordinateMatch = draw.slice(i).match(coordinateRegex);
            console.log(coordinateMatch);
            if (coordinateMatch?.index === 0) {
                coordinatesArray.push({ type: "coordinate", value: coordinateMatch[1] });
                i += coordinateMatch[0].length;
            }
            const formattingMatch = draw.slice(i).match(formattingRegex);
            if (formattingMatch?.index === 0) {
                i += formattingMatch[0].length;
                coordinatesArray.push({ type: "formatting", value: formattingMatch[0] });
            }
            const nodeMatch = draw.slice(i).match(nodeRegex);
            if (nodeMatch?.index === 0) {
                coordinatesArray.push({
                    type: "node",
                    formatting: nodeMatch[1] || "",
                    value: nodeMatch[2]
                });
                i += nodeMatch[0].length;
            }
        }
        if (loops === 100) {
            throw new Error("Parsing exceeded safe loop count");
        }
        return coordinatesArray;
    }
    isCoordinate(obj) {
        return obj && obj instanceof Coordinate;
    }
    toString() {
        let result = `\\draw [${this.formatting}]`;
        let beforeToken;
        let afterToken;
        let slope;
        this.coordinates.forEach((coordinate, index) => {
            switch (coordinate.type) {
                case "node": {
                    // Wrap in braces to create a block scope
                    const afterCoordinates = this.coordinates.slice(index).filter(this.isCoordinate);
                    afterToken = afterCoordinates.length > 0 ? afterCoordinates[0] : undefined;
                    if (!afterToken && this.coordinates.some((token) => token?.value === "cycle")) {
                        afterToken = this.isCoordinate(this.coordinates[0]) ? this.coordinates[0] : undefined;
                    }
                    const beforeCoordinates = this.coordinates.slice(0, index).reverse().filter(this.isCoordinate);
                    beforeToken = beforeCoordinates.length > 0 ? beforeCoordinates[0] : undefined;
                    if (beforeToken && afterToken) {
                        slope = findSlope(beforeToken, afterToken);
                        result += `node [${sideNodeFormatting(coordinate.formatting, slope, beforeToken, afterToken)}] {${coordinate.value}} `;
                    }
                    else {
                        result += `node [${coordinate.formatting}] {${coordinate.value}} `;
                    }
                    break;
                }
                case "formatting": {
                    result += coordinate.value.match(/(--\+\+|--\+|--)/) ? "--" : coordinate.value;
                    break;
                }
                default: {
                    result += coordinate.coordinateName
                        ? `(${coordinate.coordinateName})`
                        : `(${coordinate.X},${coordinate.Y})`;
                    break;
                }
            }
        });
        return result + ";";
    }
}
class FormatTikzjax {
    source;
    tokens = [];
    midPoint;
    processedCode = "";
    debugInfo = "";
    constructor(source) {
        this.source = source.replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "");
        this.debugInfo += this.source;
        this.tokenize();
        this.findMidpoint();
        this.applyQuadrants();
        this.debugInfo += "\n" + JSON.stringify(this.midPoint, null, 0.01) + "\n";
        this.debugInfo += JSON.stringify(this.tokens, null, 0.01) + "\n\n";
        this.processedCode += this.reconstruct();
        this.debugInfo += this.processedCode;
    }
    getCode() {
        return getPreamble() + this.processedCode + "\n\\end{tikzpicture}\\end{document}";
    }
    tokenize() {
        const ca = String.raw `\w\d\s\-,.:`; // Define allowed characters for `ca`
        const c = new RegExp(String.raw `([${ca}]+|\$\([${ca}]+\)[${ca}!:+\-]+\([${ca}]+\)\$)`, "g");
        // Define `coorRegex` with escaped characters for specific matching
        const cn = String.raw `[\w_\d\s]`; // Coordinate name
        const t = String.raw `[\w\d\s\-,.:$(!)_\-\{}\+\\]`; // Text with specific characters
        const f = String.raw `[\w\s\d=:,!';&*\{\}%\-<>]`; // Formatting with specific characters
        // Define `coorRegex` using escaped braces and patterns
        const coorRegex = new RegExp(String.raw `\\coor\{(${c.source})\}\{(${cn}*)\}\{(${t}*)\}\{(${f}*)\}`, "g");
        const nodeRegex = new RegExp(String.raw `\\node\{(${c})\}\{(${cn}*)\}\{(${t}*)\}\{(${f}*)\}`, "g");
        const se = new RegExp(String.raw `\\node\s*(${t}*)\s*at\s*(${c}*)\s*\[(${f}*)\]\s*\{(${t}*)\}`, "g");
        const ss = new RegExp(String.raw `\\coordinate\s*(\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\])?\s*\((${cn}+)\)\s*at\s*\((${c.source})\);`, "g");
        const drawRegex = new RegExp(String.raw `\\draw\[(${f}*)\]([^;]*);`, "g");
        const xyaxisRegex = new RegExp(String.raw `\\xyaxis({['"\`\w\d-<>\$,]+})?({['"\`\w\d-<>$,]+})?`, "g");
        const gridRegex = new RegExp(String.raw `\\grid({[\d-.]+})?`, "g");
        const circleRegex = new RegExp(String.raw `\\circle\{(${c}+)\}\{(${c}+)\}\{(${c}+)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw `\\mass\{(${c}+)\}\{(${t}*)\}\{?([-|>]*)?\}?\{?([-.\s\d]*)?\}?`, "g");
        const vecRegex = new RegExp(String.raw `\\vec\{(${c}+)\}\{(${c}+)\}\{(${t}*)\}\{?([-|>]*)?\}?`, "g");
        const regexPatterns = [coorRegex, se, ss, nodeRegex, drawRegex, xyaxisRegex, gridRegex, circleRegex, massRegex, vecRegex];
        const matches = regexPatterns.flatMap(pattern => [...this.source.matchAll(pattern)]);
        // Sort matches by their index to ensure correct order
        matches.sort((a, b) => (a.index || 0) - (b.index || 0));
        let currentIndex = 0;
        for (const match of matches) {
            if (match.index !== undefined && match.index > currentIndex) {
                this.tokens.push(this.source.slice(currentIndex, match.index));
            }
            if (match[0].startsWith("\\coor")) {
                if (match[0].startsWith("\\coordinate")) {
                    ([match[1], match[2], match[4], match[5]] = [match[5], match[4], match[1], match[2]]);
                }
                //console.log(match)
                this.tokens.push(new Coordinate().asCoordinate(match, this.tokens));
            }
            else if (match[0].startsWith("\\draw")) {
                this.tokens.push(new Draw(match, this.tokens));
            }
            else if (match[0].startsWith("\\xyaxis")) {
                this.tokens.push(dissectXYaxis(match));
            }
            else if (match[0].startsWith("\\grid")) {
                this.tokens.push({ type: "grid", rotate: match[1] });
            }
            else if (match[0].startsWith("\\node")) {
                if (match[0].match(/\\node\s*\(/)) {
                    ([match[1], match[3], match[4], match[3]] = [match[2], match[1], match[3], match[4]]);
                }
                this.tokens.push(new Coordinate().asNode(match, this.tokens));
            }
            else if (match[0].startsWith("\\circle")) {
                this.tokens.push({
                    type: "circle",
                    formatting: match[4],
                    coordinates: [
                        new Coordinate().simpleXY(match[1], this.tokens),
                        new Coordinate().simpleXY(match[2], this.tokens),
                        new Coordinate().simpleXY(match[3], this.tokens),
                    ],
                });
            }
            else if (match[0].startsWith("\\mass")) {
                this.tokens.push({
                    type: "mass",
                    text: match[2] || "",
                    formatting: match[3] || null,
                    rotate: Number(match[4]) || 0,
                    ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[1], this.tokens)),
                });
            }
            else if (match[0].startsWith("\\vec")) {
                this.tokens.push({
                    type: "vec",
                    text: match[3] || "",
                    formatting: match[4] || null,
                    rotate: Number(match[5]) || 0,
                    anchor: { ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[1], this.tokens)), },
                    ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[2], this.tokens)),
                });
            }
            if (match.index !== undefined) {
                currentIndex = match.index + match[0].length;
            }
        }
        if (currentIndex < this.source.length) {
            this.tokens.push(this.source.slice(currentIndex));
        }
    }
    findMidpoint() {
        let coordinates = this.tokens.filter((token) => token instanceof Coordinate);
        this.tokens
            .filter((token) => token instanceof Draw)
            .forEach((object) => {
            coordinates = coordinates.concat(object.coordinates.filter((token) => token instanceof Coordinate));
        });
        let sumOfX = 0, sumOfY = 0;
        coordinates.forEach((coordinate) => {
            sumOfX += Number(coordinate.X);
            sumOfY += Number(coordinate.Y);
        });
        this.midPoint = new Coordinate().addXY(sumOfX / coordinates.length !== 0 ? coordinates.length : 1, sumOfY / coordinates.length !== 0 ? coordinates.length : 1);
    }
    applyQuadrants() {
        this.tokens.forEach((token) => {
            if (typeof token === "object" && token !== null && token.type === "coordinate") {
                token.addQuadrant(this.midPoint);
            }
        });
    }
    reconstruct() {
        let codeBlockOutput = "";
        const extremeXY = getExtremeXY(this.tokens);
        this.tokens.forEach((token) => {
            if (token instanceof Coordinate || token instanceof Draw) {
                codeBlockOutput += token.toString();
            }
            if (typeof token === "object") {
                /*switch(token.type){
                    case "coordinate":
                        codeBlockOutput += token.toString();
                        break;
                    case "node":
                        codeBlockOutput += `\\node (${token.coordinateName}) at (${token.X},${token.Y}) [${generateFormatting(token)}] {${token.label}};`;
                        break;
                    case "draw":
                        codeBlockOutput+=token.toString()
                        break;
                    case "xyaxis":
                        codeBlockOutput+=`\\draw [${token.xDirection==="up"?"-{Stealth}":"{Stealth}-"}](${extremeXY.minX},0)`
                        codeBlockOutput+=`--(${extremeXY.maxX},0)`
                        
                        codeBlockOutput+=token.Xnode?`node [${token.Xformatting.substring(1,token.Xformatting.length-1)}] {${token.Xnode}};`:";"
                        
                        codeBlockOutput+=`\\draw [${token.yDirection==="up"?"-{Stealth}":"{Stealth}-"}](${extremeXY.minY},0)`
                        codeBlockOutput+=`--(0,${extremeXY.maxY})`
                        codeBlockOutput+=token.Ynode?`node [${token.Yformatting.substring(1,token.Yformatting.length-1)}] {${token.Ynode}};`:";"
                        
                        break;
                    case "grid":
                        codeBlockOutput+=`\\draw [] (${extremeXY.minX},${extremeXY.minY}) grid [rotate=${token?.rotate||0},xstep=.75cm,ystep=.75cm] (${extremeXY.maxX},${extremeXY.maxY});`
                        break;
                    case "circle":
                        temp=calculateCircle(token.coordinates[0],token.coordinates[1],token.coordinates[2])
                        codeBlockOutput+=`\\draw [line width=1pt,${token.formatting}] (${temp?.center.X},${temp?.center.Y}) circle [radius=${temp?.radius}];`
                        break;
                    case "mass":
                        temp=token.formatting!==null?token.formatting==="-|"?"south":"north":"north";
                        codeBlockOutput+=`\\node[fill=yellow!60,draw,text=black,anchor= ${temp},rotate=${token.rotate}] at (${token.X},${token.Y}){${token.text}};`
                        break;
                    case "vec":
                        codeBlockOutput+=`\\draw [-{Stealth},${token.formatting||""}](${token.anchor.X},${token.anchor.Y})--node [] {${token.text}}(${token.X+token.anchor.X},${token.Y+token.anchor.Y});`
                }*/
            }
            else {
                codeBlockOutput += token;
            }
        });
        return codeBlockOutput;
    }
}
function dissectXYaxis(match) {
    let Xnode = "", Ynode = "";
    if (match[1] && match[2]) {
        Xnode = match[1].match(/['`"]([\w\d&$]+)['`"]/) || "";
        Ynode = match[2].match(/['`"]([\w\d&$]+)['`"]/) || "";
        Xnode = Xnode[0].substring(1, Xnode.length);
        Ynode = Ynode[0].substring(1, Ynode.length);
    }
    return {
        type: "xyaxis",
        Xformatting: match[1]?.replace(/(->|<-|['`"].*?['`"])/g, ""),
        Yformatting: match[2]?.replace(/(->|<-|['`"].*?['`"])/g, ""),
        xDirection: match[1] && /->/.test(match[1]) ? "left" : "right",
        yDirection: match[2] && /->/.test(match[2]) ? "down" : "up",
        Xnode: Xnode,
        Ynode: Ynode,
    };
}
const ca = String.raw `[\w\d\s-,.:]`;
//const c=`$\((${ca})\)(!([\d.])!|${ca}|+)\((${ca})\)$`;
const c = `(${ca}+|1)`;
const cn = String.raw `[\w_\d\s]`; //coor name
const t = String.raw `[\w\d\s-,.:$(!)_\-\{}+\\]`; //text
const f = String.raw `[\w\s\d=:,!';&*[\]\{\}%-<>]`; //Formatting.
function getExtremeXY(tokens) {
    let maxX = -Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let minY = Infinity;
    tokens.forEach((token) => {
        if (token.type === "coordinate") {
            if (token.X > maxX)
                maxX = token.X;
            if (token.X < minX)
                minX = token.X;
            if (token.Y > maxY)
                maxY = token.Y;
            if (token.Y < minY)
                minY = token.Y;
        }
    });
    return {
        maxX, maxY, minX, minY,
    };
}
function sideNodeFormatting(formatting, slope, beforeToken, afterToken) {
    if (formatting.match(/(above|below|left|right)/)) {
        return formatting;
    }
    formatting += formatting.length > 0 ? "," : "";
    const edge1 = beforeToken.quadrant?.toString() || "";
    const edge2 = afterToken.quadrant?.toString() || "";
    if (slope !== Infinity && slope !== -Infinity) {
        if (slope !== 0) {
            formatting += "sloped, ";
        }
        if (/(3|4)/.test(edge1) && /(3|4)/.test(edge2)) {
            formatting += "below ";
        }
        else if (/(1|2)/.test(edge1) && /(1|2)/.test(edge2)) {
            formatting += "above ";
        }
    }
    if (slope !== 0) {
        if (/(1|4)/.test(edge1) && /(1|4)/.test(edge2)) {
            formatting += "right";
        }
        else if (/(2|3)/.test(edge1) && /(2|3)/.test(edge2)) {
            formatting += "left";
        }
    }
    return formatting;
}
function generateFormatting(coordinate) {
    if (typeof coordinate.label !== "string") {
        return "";
    }
    const formatting = coordinate.formatting?.split(",") || [];
    if (formatting.some((value) => /(above|below|left|right)/.test(value))) {
        return coordinate.formatting;
    }
    if (formatting.length > 0 && !formatting[formatting.length - 1].endsWith(",")) {
        formatting.push(",");
    }
    switch (coordinate.quadrant) {
        case 1:
            formatting.push("above right, ");
            break;
        case 2:
            formatting.push("above left, ");
            break;
        case 3:
            formatting.push("below left, ");
            break;
        case 4:
            formatting.push("below right, ");
            break;
    }
    return formatting.join("");
}
function getPreamble() {
    const ang = "\\tikzset{ang/.style 2 args={fill=black!50,opacity=0.5,text opacity=0.9,draw=orange,<->,angle eccentricity=#1,angle radius=#2cm,text=orange,font=\\large},ang/.default={1.6}{0.5}}";
    const mark = "\\def\\mark#1#2#3{\\path [decoration={markings, mark=at position 0.5 with {\\foreach \\x in {#1} { \\draw[line width=1pt] (\\x,-3pt) -- (\\x,3pt); }}}, postaction=decorate] (#2) -- (#3);}";
    const arr = "\\newcommand{\\arr}[8]{\\coordinate (2) at ($(#2)!#7!(#3)$);\\coordinate (1) at ($(2)!#5mm!90:(#3)$);\\coordinate (3) at ($(2)!#5mm+#4cm!#8:(#3)$);\\draw [line width=1pt,<-] (1)--(3)node [pos=#6] {\\large #1};}";
    const lene = "\\def\\cor#1#2#3#4#5{\\coordinate (#1) at($(#2)!#3!#4:(#5)$);}\\def\\dr#1#2{\\draw [line width=#1,]#2;}\\newcommand{\\len}[6]{\\cor{1}{#2}{#3}{90}{#4}\\cor{3}{#4}{#3}{-90}{#2}\\node (2) at ($(1)!0.5!(3)$) [rotate=#6]{\\large #1};\\dr{#5pt,|<-}{(1)--(2)}\\dr{#5pt,->|}{(2)--(3)}}";
    const spring = "\\newcommand{\\spring}[4]{\\tikzmath{coordinate \\start, \\done;\\start = (#1);\\done = (#2);}\\draw[thick] ($(\\start) + (-1.5,0)$) --++(3,0);\\draw (\\start) --+ (0,-0.25cm);\\draw ($(\\start) + (\\donex+0cm,\\doney+0.25cm)$)--+(0,-0.25);\\draw[decoration={aspect=0.3, segment length=3, amplitude=2mm,coil,},decorate] (\\startx,\\starty-0.25cm) --($(\\start) + (\\donex,\\doney+0.25cm)$)node[midway,right=0.25cm,black]{#4};\\node[fill=yellow!60,draw,text=black,anchor= north] at ($(\\start) + (\\donex,\\doney)$){#3};}";
    const tree = "\\newcommand{\\lenu}[3]{\\tikzset{level distance=20mm,level #1/.style={sibling distance=#2mm, nodes={fill=red!#3,circle,inner sep=1pt,draw=none,text=black,}}}}";
    const table = "\\tikzset{ table/.style={matrix of nodes,row sep=-\\pgflinewidth,column sep=-\\pgflinewidth,nodes={rectangle,draw=black,align=center},minimum height=1.5em,text depth=0.5ex,text height=2ex,nodes in empty cells,every even row/.style={nodes={fill=gray!60,text=black,}},column 1/.style={nodes={text width=5em,font=\\bfseries}},row 1/.style={nodes={font=\\bfseries}}}}";
    const coor = "\\def\\coor#1#2#3#4{\\coordinate [label={[#4]:\\Large #3}] (#2) at ($(#1)$);}";
    //const mass=`\\def\\mass#1#2{\\node[fill=yellow!60,draw,text=black,anchor= north] at (#1){#2};}`
    const dvector = "\\newcommand{\\dvector}[2]{\\coordinate (temp1) at ($(0,0 -| #1)$);\\coordinate (temp2) at ($(0,0 |- #1)$);\\draw [line width=0.7pt,#2] (#1)--(temp1)(#1)--(temp2);}";
    const picAng = "\\newcommand{\\ang}[5]{\\coordinate (ang1) at (#1); \\coordinate (ang2) at (#2); \\coordinate (ang3) at (#3); \\pgfmathanglebetweenpoints{\\pgfpointanchor{ang3}{center}}{\\pgfpointanchor{ang2}{center}}\\let\\angCB\\pgfmathresult\\pgfmathanglebetweenpoints{\\pgfpointanchor{ang2}{center}}{\\pgfpointanchor{ang1}{center}}\\let\\angAB\\pgfmathresult\\pgfmathparse{\\angCB - \\angAB}\\ifdim\\pgfmathresult pt<0pt\\pgfmathparse{\\pgfmathresult + 360}\\fi\\ifdim\\pgfmathresult pt>180pt\\pgfmathparse{360 - \\pgfmathresult}\\fi\\let\\angB\\pgfmathresult\\pgfmathsetmacro{\\angleCheck}{abs(\\angB - 90)}\\ifthenelse{\\lengthtest{\\angleCheck pt < 0.1pt}}{\\pic [ang#5,\"{${#4}\$}\",]{right angle=ang1--ang2--ang3};}{\\pic [ang#5,\"{${#4}\$}\",]{angle=ang1--ang2--ang3};}}";
    const preamble = "\\usepackage{pgfplots,ifthen}\\usetikzlibrary{arrows.meta,angles,quotes,positioning, calc, intersections,decorations.markings,math,spy,matrix,patterns,snakes,decorations.pathmorphing,patterns,shadows,shapes.symbols}";
    return preamble + ang + mark + arr + lene + spring + tree + table + coor + dvector + picAng + "\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUE0QyxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3QyxhQUFhO0FBQ2IsT0FBTyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDNUMsT0FBTyxFQUFvQixxQkFBcUIsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUM1RyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFVakQsTUFBTSxPQUFPLE9BQU87SUFDaEIsR0FBRyxDQUFNO0lBQ1QsTUFBTSxDQUFhO0lBQ25CLFVBQVUsQ0FBc0I7SUFDcEMsK0RBQStEO0lBQzNELFlBQVksR0FBUSxFQUFDLE1BQWtCO1FBQ3JDLElBQUksQ0FBQyxHQUFHLEdBQUMsR0FBRyxDQUFDO1FBQ2IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsTUFBTSxHQUFDLE1BQU0sQ0FBQztJQUNyQixDQUFDO0lBRUQsV0FBVztRQUNULElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFO1lBQzNDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUU7Z0JBQzdFLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFD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QUFNO1FBQ04sS0FBSyxDQUFDO1lBQ04sVUFBVSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUNqQyxNQUFNO0tBQ1Q7SUFDRCxPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDL0IsQ0FBQztBQUlELFNBQVMsV0FBVztJQUNoQixNQUFNLEdBQUcsR0FBQyxvTEFBb0wsQ0FBQTtJQUU5TCxNQUFNLElBQUksR0FBQyw2TEFBNkwsQ0FBQTtJQUV4TSxNQUFNLEdBQUcsR0FBQyxvTkFBb04sQ0FBQTtJQUM5TixNQUFNLElBQUksR0FBQyx3UkFBd1IsQ0FBQTtJQUNuUyxNQUFNLE1BQU0sR0FBQywwZ0JBQTBnQixDQUFBO0lBRXZoQixNQUFNLElBQUksR0FBQyxpS0FBaUssQ0FBQTtJQUU1SyxNQUFNLEtBQUssR0FBQyw2V0FBNlcsQ0FBQTtJQUN6WCxNQUFNLElBQUksR0FBQywrRUFBK0UsQ0FBQTtJQUMxRixpR0FBaUc7SUFDakcsTUFBTSxPQUFPLEdBQUMsc0tBQXNLLENBQUE7SUFFcEwsTUFBTSxNQUFNLEdBQUMsOHZCQUE4dkIsQ0FBQTtJQUMzd0IsTUFBTSxRQUFRLEdBQUMseU5BQXlOLENBQUE7SUFDeE8sT0FBTyxRQUFRLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLE1BQU0sR0FBQyxJQUFJLEdBQUMsS0FBSyxHQUFDLElBQUksR0FBQyxPQUFPLEdBQUMsTUFBTSxHQUFDLGlFQUFpRSxDQUFBO0FBQzdJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIENvbXBvbmVudCwgRWRpdG9yLCBNYXJrZG93blJlbmRlcmVyLCBNYXJrZG93blZpZXcsIFdvcmtzcGFjZVdpbmRvdyB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgTWF0aFBsdWdpbiBmcm9tIFwic3JjL21haW5cIjtcclxuaW1wb3J0IHsgb3B0aW1pemUgfSBmcm9tIFwiLi9zdmdvLmJyb3dzZXIuanNcIjtcclxuLy8gQHRzLWlnbm9yZVxyXG5pbXBvcnQgdGlrempheEpzIGZyb20gXCJpbmxpbmU6Li90aWt6amF4LmpzXCI7XHJcbmltcG9ydCB7IGRlZ3JlZXNUb1JhZGlhbnMsIGZpbmRJbnRlcnNlY3Rpb25Qb2ludCwgZmluZFNsb3BlLCBwb2xhclRvQ2FydGVzaWFuIH0gZnJvbSBcInNyYy9tYXRoVXRpbGl0aWVzLmpzXCI7XHJcbmltcG9ydCB7IERlYnVnTW9kYWwgfSBmcm9tIFwic3JjL2Rlc3BseU1vZGFscy5qc1wiO1xyXG5cclxuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcbmltcG9ydCB7IGVycm9yIH0gZnJvbSBcImNvbnNvbGVcIjtcclxuXHJcbmludGVyZmFjZSBDb2RlTWlycm9yRWRpdG9yIGV4dGVuZHMgRWRpdG9yIHtcclxuICAgIGNtOiBFZGl0b3JWaWV3O1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRpa3pqYXgge1xyXG4gICAgYXBwOiBBcHA7XHJcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgICBhY3RpdmVWaWV3OiBNYXJrZG93blZpZXcgfCBudWxsO1xyXG4vL2NvbnN0IGVkaXRvciA9IGFjdGl2ZVZpZXc/LmVkaXRvciBhcyBDb2RlTWlycm9yRWRpdG9yIHwgbnVsbDtcclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgICB0aGlzLmFwcD1hcHA7XHJcbiAgICAgIHRoaXMuYWN0aXZlVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmVhZHlMYXlvdXQoKXtcclxuICAgICAgdGhpcy5wbHVnaW4uYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcclxuICAgICAgICB0aGlzLmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XHJcbiAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gIFxyXG4gICAgbG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG4gICAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgICBzLmlkID0gXCJ0aWt6amF4XCI7XHJcbiAgICAgICAgICBzLnR5cGUgPSBcInRleHQvamF2YXNjcmlwdFwiO1xyXG4gICAgICAgICAgcy5pbm5lclRleHQgPSB0aWt6amF4SnM7XHJcbiAgICAgICAgICBkb2MuYm9keS5hcHBlbmRDaGlsZChzKTtcclxuICBcclxuICBcclxuICAgICAgICAgIGRvYy5hZGRFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIHVubG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG4gICAgICAgICAgY29uc3QgcyA9IGRvYy5nZXRFbGVtZW50QnlJZChcInRpa3pqYXhcIik7XHJcbiAgICAgICAgICBzPy5yZW1vdmUoKTtcclxuICBcclxuICAgICAgICAgIGRvYy5yZW1vdmVFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIGxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcclxuICAgICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIHVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcclxuICAgICAgICAgICAgICB0aGlzLnVubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICAgIH1cclxuICAgICAgfVxyXG4gIFxyXG4gICAgICBnZXRBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgICAgY29uc3Qgd2luZG93cyA9IFtdO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBwdXNoIHRoZSBtYWluIHdpbmRvdydzIHJvb3Qgc3BsaXQgdG8gdGhlIGxpc3RcclxuICAgICAgICAgIHdpbmRvd3MucHVzaCh0aGlzLmFwcC53b3Jrc3BhY2Uucm9vdFNwbGl0Lndpbik7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmUgZmxvYXRpbmdTcGxpdCBpcyB1bmRvY3VtZW50ZWRcclxuICAgICAgICAgIGNvbnN0IGZsb2F0aW5nU3BsaXQgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZmxvYXRpbmdTcGxpdDtcclxuICAgICAgICAgIGZsb2F0aW5nU3BsaXQuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgYSB3aW5kb3csIHB1c2ggaXQgdG8gdGhlIGxpc3QgXHJcbiAgICAgICAgICAgICAgaWYgKGNoaWxkIGluc3RhbmNlb2YgV29ya3NwYWNlV2luZG93KSB7XHJcbiAgICAgICAgICAgICAgICAgIHdpbmRvd3MucHVzaChjaGlsZC53aW4pO1xyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gIFxyXG4gICAgICAgICAgcmV0dXJuIHdpbmRvd3M7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgIHJlZ2lzdGVyVGlrekNvZGVCbG9jaygpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZWwuY3JlYXRlRWwoXCJkaXZcIiksIHtcclxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcclxuICAgICAgICAgICAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRyeXtcclxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2NyaXB0LnNldFRleHQodGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UsaWNvbikpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoKGUpe1xyXG4gICAgICAgICAgICAgICAgZWwuaW5uZXJIVE1MID0gXCJcIjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yRGlzcGxheSA9IGVsLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm1hdGgtZXJyb3ItbGluZVwiIH0pO1xyXG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmlubmVyVGV4dCA9IGBFcnJvcjogJHtlLm1lc3NhZ2V9YDtcclxuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5jbGFzc0xpc3QuYWRkKFwiZXJyb3ItdGV4dFwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaWtaIFByb2Nlc3NpbmcgRXJyb3I6XCIsIGUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8gPSB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5maWx0ZXIoZWwgPT4gZWwubmFtZSAhPSBcIlRpa3pcIik7XHJcbiAgICAgIH1cclxuICBcclxuICAgIHRpZHlUaWt6U291cmNlKHRpa3pTb3VyY2U6IHN0cmluZyxpY29uOiBIVE1MRWxlbWVudCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XHJcbiAgICAgICAgdGlrelNvdXJjZSA9IHRpa3pTb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHRpa3pTb3VyY2Uuc3BsaXQoXCJcXG5cIik7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuXHJcbiAgICAgICAgY29uc3QgdGlrempheD1uZXcgRm9ybWF0VGlrempheChsaW5lcy5qb2luKFwiXFxuXCIpKTtcclxuICAgICAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCx0aWt6amF4LmRlYnVnSW5mbykub3BlbigpO1xyXG4gICAgICAgIHJldHVybiB0aWt6amF4LmdldENvZGUoKTtcclxuICAgIH1cclxuICBcclxuICAgICAgY29sb3JTVkdpbkRhcmtNb2RlKHN2Zzogc3RyaW5nKSB7XHJcbiAgICAgICAgc3ZnID0gc3ZnLnJlcGxhY2VBbGwoLyhcIiMwMDBcInxcImJsYWNrXCIpL2csIFwiXFxcImN1cnJlbnRDb2xvclxcXCJcIilcclxuICAgICAgICAgICAgICAgIC5yZXBsYWNlQWxsKC8oXCIjZmZmXCJ8XCJ3aGl0ZVwiKS9nLCBcIlxcXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXFxcIlwiKTtcclxuICAgICAgICByZXR1cm4gc3ZnO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgXHJcbiAgICAgIG9wdGltaXplU1ZHKHN2Zzogc3RyaW5nKSB7XHJcbiAgICAgICAgICAvLyBPcHRpbWl6ZSB0aGUgU1ZHIHVzaW5nIFNWR09cclxuICAgICAgICAgIC8vIEZpeGVzIG1pc2FsaWduZWQgdGV4dCBub2RlcyBvbiBtb2JpbGVcclxuICBcclxuICAgICAgICAgIHJldHVybiBvcHRpbWl6ZShzdmcsIHtwbHVnaW5zOlxyXG4gICAgICAgICAgICAgIFtcclxuICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJwcmVzZXQtZGVmYXVsdFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFudXBJRHM6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgfSk/LmRhdGE7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgcG9zdFByb2Nlc3NTdmcgPSAoZTogRXZlbnQpID0+IHtcclxuICBcclxuICAgICAgICAgIGNvbnN0IHN2Z0VsID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICBsZXQgc3ZnID0gc3ZnRWwub3V0ZXJIVE1MO1xyXG4gIFxyXG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpIHtcclxuICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcclxuICBcclxuICAgICAgICAgIHN2Z0VsLm91dGVySFRNTCA9IHN2ZztcclxuICAgICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmludGVyZmFjZSB0b2tlbiAge1xyXG4gICAgWD86IG51bWJlcjtcclxuICAgIFk/OiBudW1iZXI7XHJcbiAgICB0eXBlPzogc3RyaW5nO1xyXG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlcz86IGFueTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xyXG4gICAgY29uc29sZS5sb2coXCJ2YWx1ZVwiLHZhbHVlLHBhcnNlRmxvYXQoXCItMC41XCIpKVxyXG4gICAgY29uc3QgbnVtYmVyVmFsdWUgPSBwYXJzZUZsb2F0KHZhbHVlKTtcclxuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XHJcbn07XHJcblxyXG5cclxuZnVuY3Rpb24gcGFyc2VDb29yZGluYXRlcyhcclxuICAgIGNvb3JkaW5hdGU6IHN0cmluZyxcclxuICAgIHRva2VuczogQXJyYXk8Q29vcmRpbmF0ZSB8IHN0cmluZyB8IERyYXcgfCB0b2tlbj4sXHJcbiAgICBmb3JtYXR0aW5nPzogc3RyaW5nLFxyXG4gICAgY29vcmRpbmF0ZXNBcnJheT86IEFycmF5PENvb3JkaW5hdGUgfCBzdHJpbmc+XHJcbik6IHsgWDogbnVtYmVyOyBZOiBudW1iZXI7fSB7XHJcbiAgICBsZXQgeFZhbHVlID0gMCwgeVZhbHVlID0gMDtcclxuXHJcbiAgICBjb25zdCBmaW5kT3JpZ2luYWxWYWx1ZSA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICAgICAgY29uc3Qgb2cgPSB0b2tlbnMuZmluZChcclxuICAgICAgICAgICAgKHRva2VuOiB0b2tlbikgPT5cclxuICAgICAgICAgICAgICAgICh0b2tlbiBpbnN0YW5jZW9mIENvb3JkaW5hdGUgfHwgdG9rZW4/LnR5cGUgPT09IFwibm9kZVwiKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWVcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZyA6IHVuZGVmaW5lZDtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgcGFyc2VDYXJ0ZXNpYW4gPSAoY29vcmQ6IHN0cmluZykgPT4ge1xyXG4gICAgICAgIGNvbnN0IFt4LCB5XSA9IGNvb3JkLnNwbGl0KFwiLFwiKS5tYXAocGFyc2VOdW1iZXIpO1xyXG4gICAgICAgIHJldHVybiB7IFg6IHgsIFk6IHkgfTtcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgcGFyc2VJbnRlcnNlY3Rpb24gPSAoY29vcmQ6IHN0cmluZykgPT4ge1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcclxuICAgICAgICAgICAgLnJlcGxhY2UoL2ludGVyc2VjdGlvblxccz9vZlxccz8vZywgXCJcIilcclxuICAgICAgICAgICAgLnJlcGxhY2UoLyhcXHMqYW5kXFxzP3wtLSkvZywgXCIgXCIpXHJcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcclxuICAgICAgICAgICAgLm1hcChmaW5kT3JpZ2luYWxWYWx1ZSlcclxuICAgICAgICAgICAgLmZpbHRlcigodG9rZW4pOiB0b2tlbiBpcyBDb29yZGluYXRlID0+IHRva2VuICE9PSB1bmRlZmluZWQpO1xyXG5cclxuICAgICAgICBpZiAob3JpZ2luYWxDb29yZHMubGVuZ3RoIDwgNCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnRlcnNlY3Rpb24gaGFkIHVuZGVmaW5lZCBjb29yZGluYXRlcyBvciBpbnN1ZmZpY2llbnQgZGF0YVwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3Qgc2xvcGVzID0gW1xyXG4gICAgICAgICAgICBmaW5kU2xvcGUob3JpZ2luYWxDb29yZHNbMF0sIG9yaWdpbmFsQ29vcmRzWzFdKSxcclxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLCBvcmlnaW5hbENvb3Jkc1szXSksXHJcbiAgICAgICAgXTtcclxuICAgICAgICByZXR1cm4gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLCBvcmlnaW5hbENvb3Jkc1syXSwgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xyXG4gICAgfTtcclxuXHJcbiAgICBjb25zdCBoYW5kbGVGb3JtYXR0aW5nID0gKCk6IHsgWDogbnVtYmVyOyBZOiBudW1iZXIgfSA9PiB7XHJcbiAgICAgICAgbGV0IGNvb3IgPSB7IFg6IDAsIFk6IDAgfTtcclxuICAgIFxyXG4gICAgICAgIGlmIChmb3JtYXR0aW5nICYmIGNvb3JkaW5hdGVzQXJyYXkgJiYgY29vcmRpbmF0ZXNBcnJheS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIGlmIChmb3JtYXR0aW5nID09PSBcIi0tK1wiKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBmb3VuZCA9IGNvb3JkaW5hdGVzQXJyYXkuZmluZCgodG9rZW46IHN0cmluZyB8IENvb3JkaW5hdGUpID0+IHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSk7XHJcbiAgICAgICAgICAgICAgICBjb29yID0gZm91bmQgJiYgdHlwZW9mIGZvdW5kICE9PSBcInN0cmluZ1wiID8gZm91bmQgOiBjb29yO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZvcm1hdHRpbmcgPT09IFwiLS0rK1wiKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBmb3VuZCA9IFsuLi5jb29yZGluYXRlc0FycmF5XS5yZXZlcnNlKCkuZmluZCgodG9rZW46IHN0cmluZyB8IENvb3JkaW5hdGUpID0+IHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSk7XHJcbiAgICAgICAgICAgICAgICBjb29yID0gZm91bmQgJiYgdHlwZW9mIGZvdW5kICE9PSBcInN0cmluZ1wiID8gZm91bmQgOiBjb29yO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb29yO1xyXG4gICAgfTtcclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgaWYodHlwZW9mIGNvb3JkaW5hdGUhPT1cInN0cmluZ1wiKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGNvb3JkaW5hdGUgdG8gYmUgc3RyaW5nIGNvb3JkaW5hdGUgd2FzICR7dHlwZW9mIGNvb3JkaW5hdGV9YCk7XHJcbiAgICB9XHJcbiAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgW1xcd1xcZFxcc1xcLSwuOl1gOyBcclxuICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcJFxcKCgke2NhfSspXFwpKFtcXGQrXFx3OiEuXSspXFwoKCR7Y2F9KylcXClcXCRgKTtcclxuICAgIGNvbnN0IG1hdGNoID0gY29vcmRpbmF0ZS5tYXRjaChyZWdleCk7XHJcbiAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlMSA9IHBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbMV0sIHRva2Vucyk7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZTIgPSBwYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzNdLCB0b2tlbnMpO1xyXG4gICAgICAgIFt4VmFsdWUsIHlWYWx1ZV0gPSBbY29vcmRpbmF0ZTEuWCArIGNvb3JkaW5hdGUyLlgsIGNvb3JkaW5hdGUxLlkgKyBjb29yZGluYXRlMi5ZXTtcclxuICAgIH0gZWxzZSBpZiAoY29vcmRpbmF0ZS5pbmNsdWRlcyhcIixcIikpIHtcclxuICAgICAgICAoeyBYOiB4VmFsdWUsIFk6IHlWYWx1ZSB9ID0gcGFyc2VDYXJ0ZXNpYW4oY29vcmRpbmF0ZSkpO1xyXG4gICAgfSBlbHNlIGlmIChjb29yZGluYXRlLmluY2x1ZGVzKFwiOlwiKSkge1xyXG4gICAgICAgICh7IFg6IHhWYWx1ZSwgWTogeVZhbHVlIH0gPSBwb2xhclRvQ2FydGVzaWFuKGNvb3JkaW5hdGUpKTtcclxuICAgIH0gZWxzZSBpZiAoY29vcmRpbmF0ZS5pbmNsdWRlcyhcImludGVyc2VjdGlvblwiKSkge1xyXG4gICAgICAgICh7IFg6IHhWYWx1ZSwgWTogeVZhbHVlIH0gPSBwYXJzZUludGVyc2VjdGlvbihjb29yZGluYXRlKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnN0IHRva2VuTWF0Y2ggPSBmaW5kT3JpZ2luYWxWYWx1ZShjb29yZGluYXRlKTtcclxuICAgICAgICBpZiAodG9rZW5NYXRjaCkge1xyXG4gICAgICAgICAgICBbeFZhbHVlLCB5VmFsdWVdID0gW3Rva2VuTWF0Y2guWCwgdG9rZW5NYXRjaC5ZXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQXBwbHkgZm9ybWF0dGluZyBhZGp1c3RtZW50cyBpZiBhdmFpbGFibGVcclxuICAgIGNvbnN0IGZvcm1hdHRpbmdBZGp1c3RtZW50ID0gaGFuZGxlRm9ybWF0dGluZygpO1xyXG4gICAgeFZhbHVlICs9IGZvcm1hdHRpbmdBZGp1c3RtZW50Llg7XHJcbiAgICB5VmFsdWUgKz0gZm9ybWF0dGluZ0FkanVzdG1lbnQuWTtcclxuICAgIFxyXG4gICAgaWYodHlwZW9mIHhWYWx1ZSE9PVwibnVtYmVyXCJ8fHR5cGVvZiB5VmFsdWUhPT1cIm51bWJlclwiKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJSYWlzaW5nIHRoZSBjb29yZGluYXRlcyBmYWlsZWQuIENvdWxkbid0IGZpbmQgYXBwcm9wcmlhdGUgWHZhbHVlIG9yIFl2YWx1ZVwiKTtcclxuICAgIH1cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgWDogeFZhbHVlLFxyXG4gICAgICAgIFk6IHlWYWx1ZSxcclxuICAgIH07XHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQ29vcmRpbmF0ZSB7XHJcbiAgICBtb2RlOiBzdHJpbmc7XHJcbiAgICBYOiBudW1iZXI7XHJcbiAgICBZOiBudW1iZXI7XHJcbiAgICBvcmlnaW5hbDogc3RyaW5nO1xyXG4gICAgY29vcmRpbmF0ZU5hbWU6IHN0cmluZ3x1bmRlZmluZWQ7XHJcbiAgICBmb3JtYXR0aW5nOiBzdHJpbmc7XHJcbiAgICBsYWJlbDogc3RyaW5nO1xyXG4gICAgcXVhZHJhbnQ6IG51bWJlcjtcclxuXHJcbiAgICBhc0Nvb3JkaW5hdGUobWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXksIHRva2VuczogQXJyYXk8YW55Pikge1xyXG4gICAgICAgIHRoaXMubW9kZT1cImNvb3JkaW5hdGVcIjtcclxuICAgICAgICBbdGhpcy5vcmlnaW5hbCwgdGhpcy5jb29yZGluYXRlTmFtZSwgdGhpcy5sYWJlbCwgdGhpcy5mb3JtYXR0aW5nXSA9IFttYXRjaFsxXSwgbWF0Y2hbMl0sIG1hdGNoWzNdLCBtYXRjaFs0XV07XHJcbiAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCBwYXJzZUNvb3JkaW5hdGVzKHRoaXMub3JpZ2luYWwsIHRva2VucykpO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGFzTm9kZShtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSwgdG9rZW5zOiBBcnJheTxhbnk+KSB7XHJcbiAgICAgICAgdGhpcy5tb2RlPVwibm9kZVwiO1xyXG4gICAgICAgIFt0aGlzLm9yaWdpbmFsLCB0aGlzLmNvb3JkaW5hdGVOYW1lLCB0aGlzLmxhYmVsLCB0aGlzLmZvcm1hdHRpbmddID0gW21hdGNoWzFdLCBtYXRjaFsyXSwgbWF0Y2hbM10sIG1hdGNoWzRdXTtcclxuICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIHBhcnNlQ29vcmRpbmF0ZXModGhpcy5vcmlnaW5hbCwgdG9rZW5zKSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgc2ltcGxlWFkoY29vcmRpbmF0ZTogc3RyaW5nLCB0b2tlbnM6IEFycmF5PGFueT4sIHByZXZpb3VzRm9ybWF0dGluZz86IHN0cmluZywgY29vcmRpbmF0ZXNBcnJheT86IGFueSkge1xyXG4gICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgcGFyc2VDb29yZGluYXRlcyhjb29yZGluYXRlLCB0b2tlbnMscHJldmlvdXNGb3JtYXR0aW5nLGNvb3JkaW5hdGVzQXJyYXkpKTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBhZGRYWShYOiBudW1iZXIsIFk6IG51bWJlcikge1xyXG4gICAgICAgIFt0aGlzLlgsIHRoaXMuWV0gPSBbWCwgWV07XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmcoKSB7XHJcbiAgICAgICAgcmV0dXJuIGBcXFxcY29vcnske3RoaXMuWH0sJHt0aGlzLll9fXske3RoaXMuY29vcmRpbmF0ZU5hbWUgfHwgXCJcIn19eyR7dGhpcy5sYWJlbCB8fCBcIlwifX17JHtnZW5lcmF0ZUZvcm1hdHRpbmcodGhpcykgfHwgXCJcIn19YDtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZ0RyYXcoKSB7XHJcbiAgICAgICAgcmV0dXJuIGAoJHt0aGlzLmNvb3JkaW5hdGVOYW1lID8gdGhpcy5jb29yZGluYXRlTmFtZSA6IHRoaXMuWCArIFwiLFwiICsgdGhpcy5ZfSlgO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFF1YWRyYW50KG1pZFBvaW50OiBDb29yZGluYXRlKSB7XHJcbiAgICAgICAgY29uc3QgeERpcmVjdGlvbiA9IHRoaXMuWCA+IG1pZFBvaW50LlggPyAxIDogLTE7XHJcbiAgICAgICAgY29uc3QgeURpcmVjdGlvbiA9IHRoaXMuWSA+IG1pZFBvaW50LlkgPyAxIDogLTE7XHJcbiAgICAgICAgdGhpcy5xdWFkcmFudCA9IHlEaXJlY3Rpb24gPT09IDEgPyAoeERpcmVjdGlvbiA9PT0gMSA/IDEgOiAyKSA6ICh4RGlyZWN0aW9uID09PSAxID8gNCA6IDMpO1xyXG4gICAgfVxyXG59XHJcbnR5cGUgQ29vcmRpbmF0ZVR5cGUgPUFycmF5PENvb3JkaW5hdGUgfCB7IHR5cGU6IHN0cmluZzsgdGV4dDogYW55OyBmb3JtYXR0aW5nOiBhbnksIHZhbHVlPzogYW55fT47XHJcblxyXG5jbGFzcyBEcmF3IHtcclxuICAgIGZvcm1hdHRpbmc6IHN0cmluZztcclxuICAgIGNvb3JkaW5hdGVzOiBDb29yZGluYXRlVHlwZTtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSwgdG9rZW5zOiBBcnJheTx0b2tlbj4pIHtcclxuICAgICAgICB0aGlzLmZvcm1hdHRpbmcgPSBtYXRjaFsxXTtcclxuICAgICAgICB0aGlzLmNvb3JkaW5hdGVzID0gdGhpcy5maWxsQ29vcmRpbmF0ZXModGhpcy5nZXRTY2hlbWF0aWMobWF0Y2hbMl0pLCB0b2tlbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIGZpbGxDb29yZGluYXRlcyhzY2hlbWF0aWM6IGFueVtdLCB0b2tlbnM6IEFycmF5PHRva2VuPikge1xyXG4gICAgICAgIGNvbnN0IGNvb3JBcnI6IENvb3JkaW5hdGVUeXBlPVtdO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NoZW1hdGljLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcclxuICAgICAgICAgICAgICAgIGxldCBwcmV2aW91c0Zvcm1hdHRpbmc7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGkgPiAwICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDFdLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID4gMSAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwibm9kZVwiICYmIHNjaGVtYXRpY1tpIC0gMl0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDJdLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkoc2NoZW1hdGljW2ldLnZhbHVlLCB0b2tlbnMsIHByZXZpb3VzRm9ybWF0dGluZywgY29vckFycikpO1xyXG4gICAgICAgICAgICB9IGVsc2V7XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2goey4uLnNjaGVtYXRpY1tpXX0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb29yQXJyO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNjaGVtYXRpYyhkcmF3OiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XHJcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YG5vZGVcXHMqXFxbKCR7Zn0qKVxcXVxccyp7KCR7dH0rKX1gKTtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nUmVnZXggPSAvKC0tY3ljbGV8Y3ljbGV8LS1cXCtcXCt8LS1cXCt8LS18LVxcfHxcXHwtfGdyaWR8Y2lyY2xlfHJlY3RhbmdsZSkvO1xyXG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHNcXC0sLjpgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YChcXChbJHtjYX1dK1xcKXxcXChcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K1xcLV0rXFwoWyR7Y2F9XStcXClcXCRcXCkpYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IGkgPSAwO1xyXG4gICAgICAgIGxldCBsb29wcyA9IDA7XHJcbiAgICAgICAgd2hpbGUgKGkgPCBkcmF3Lmxlbmd0aCAmJiBsb29wcyA8IDEwMCkgeyAvLyBJbmNyZWFzZSBsb29wIGxpbWl0IG9yIGFkZCBjb25kaXRpb24gYmFzZWQgb24gcGFyc2VkIGxlbmd0aFxyXG4gICAgICAgICAgICBsb29wcysrO1xyXG4gICAgICAgICAgICBjb25zdCBjb29yZGluYXRlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGNvb3JkaW5hdGVSZWdleCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGNvb3JkaW5hdGVNYXRjaClcclxuICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiY29vcmRpbmF0ZVwiLCB2YWx1ZTogY29vcmRpbmF0ZU1hdGNoWzFdIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChmb3JtYXR0aW5nTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBpICs9IGZvcm1hdHRpbmdNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3Qgbm9kZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAobm9kZU1hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm5vZGVcIixcclxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBub2RlTWF0Y2hbMV0gfHwgXCJcIixcclxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogbm9kZU1hdGNoWzJdXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbm9kZU1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobG9vcHMgPT09IDEwMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQYXJzaW5nIGV4Y2VlZGVkIHNhZmUgbG9vcCBjb3VudFwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xyXG4gICAgfVxyXG5cclxuICAgIGlzQ29vcmRpbmF0ZShvYmo6IGFueSk6IG9iaiBpcyBDb29yZGluYXRlIHtcclxuICAgICAgICByZXR1cm4gb2JqICYmIG9iaiBpbnN0YW5jZW9mIENvb3JkaW5hdGU7XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmcoKSB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyBbJHt0aGlzLmZvcm1hdHRpbmd9XWA7XHJcbiAgICAgICAgbGV0IGJlZm9yZVRva2VuOiBDb29yZGluYXRlIHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIGxldCBhZnRlclRva2VuOiBDb29yZGluYXRlIHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIGxldCBzbG9wZTtcclxuXHJcbiAgICAgICAgdGhpcy5jb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoIChjb29yZGluYXRlLnR5cGUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJub2RlXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBXcmFwIGluIGJyYWNlcyB0byBjcmVhdGUgYSBibG9jayBzY29wZVxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFmdGVyQ29vcmRpbmF0ZXMgPSB0aGlzLmNvb3JkaW5hdGVzLnNsaWNlKGluZGV4KS5maWx0ZXIodGhpcy5pc0Nvb3JkaW5hdGUpO1xyXG4gICAgICAgICAgICAgICAgICAgIGFmdGVyVG9rZW4gPSBhZnRlckNvb3JkaW5hdGVzLmxlbmd0aCA+IDAgPyBhZnRlckNvb3JkaW5hdGVzWzBdIDogdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWFmdGVyVG9rZW4gJiYgdGhpcy5jb29yZGluYXRlcy5zb21lKCh0b2tlbjogYW55KSA9PiB0b2tlbj8udmFsdWUgPT09IFwiY3ljbGVcIikpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYWZ0ZXJUb2tlbiA9IHRoaXMuaXNDb29yZGluYXRlKHRoaXMuY29vcmRpbmF0ZXNbMF0pID8gdGhpcy5jb29yZGluYXRlc1swXSA6IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJlZm9yZUNvb3JkaW5hdGVzID0gdGhpcy5jb29yZGluYXRlcy5zbGljZSgwLCBpbmRleCkucmV2ZXJzZSgpLmZpbHRlcih0aGlzLmlzQ29vcmRpbmF0ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgYmVmb3JlVG9rZW4gPSBiZWZvcmVDb29yZGluYXRlcy5sZW5ndGggPiAwID8gYmVmb3JlQ29vcmRpbmF0ZXNbMF0gOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChiZWZvcmVUb2tlbiAmJiBhZnRlclRva2VuKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNsb3BlID0gZmluZFNsb3BlKGJlZm9yZVRva2VuLCBhZnRlclRva2VuKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGBub2RlIFske3NpZGVOb2RlRm9ybWF0dGluZyhjb29yZGluYXRlLmZvcm1hdHRpbmcsIHNsb3BlLCBiZWZvcmVUb2tlbiwgYWZ0ZXJUb2tlbil9XSB7JHtjb29yZGluYXRlLnZhbHVlfX0gYDtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gYG5vZGUgWyR7Y29vcmRpbmF0ZS5mb3JtYXR0aW5nfV0geyR7Y29vcmRpbmF0ZS52YWx1ZX19IGA7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSBcImZvcm1hdHRpbmdcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBjb29yZGluYXRlLnZhbHVlLm1hdGNoKC8oLS1cXCtcXCt8LS1cXCt8LS0pLyk/XCItLVwiOmNvb3JkaW5hdGUudmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGNvb3JkaW5hdGUuY29vcmRpbmF0ZU5hbWVcclxuICAgICAgICAgICAgICAgICAgICAgICAgPyBgKCR7Y29vcmRpbmF0ZS5jb29yZGluYXRlTmFtZX0pYFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA6IGAoJHtjb29yZGluYXRlLlh9LCR7Y29vcmRpbmF0ZS5ZfSlgO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyBGb3JtYXRUaWt6amF4IHtcclxuXHRzb3VyY2U6IHN0cmluZztcclxuICAgIHRva2VuczogQXJyYXk8dG9rZW4gfCBzdHJpbmd8YW55Pj1bXTtcclxuICAgIG1pZFBvaW50OiBDb29yZGluYXRlO1xyXG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcclxuICAgIGRlYnVnSW5mbyA9IFwiXCI7XHJcbiAgICBcclxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZykge1xyXG5cdFx0dGhpcy5zb3VyY2UgPSBzb3VyY2UucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpO1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnNvdXJjZTtcclxuICAgICAgICB0aGlzLnRva2VuaXplKCk7XHJcbiAgICAgICAgdGhpcy5maW5kTWlkcG9pbnQoKTtcclxuICAgICAgICB0aGlzLmFwcGx5UXVhZHJhbnRzKCk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPVwiXFxuXCIrSlNPTi5zdHJpbmdpZnkodGhpcy5taWRQb2ludCxudWxsLDAuMDEpK1wiXFxuXCJcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwwLjAxKStcIlxcblxcblwiXHJcblxyXG4gICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnJlY29uc3RydWN0KCk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcclxuXHR9XHJcbiAgICBnZXRDb2RlKCl7XHJcbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxcc1xcLSwuOmA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcclxuICAgICAgICBjb25zdCBjID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YChbJHtjYX1dK3xcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K1xcLV0rXFwoWyR7Y2F9XStcXClcXCQpYCwgXCJnXCIpO1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgd2l0aCBlc2NhcGVkIGNoYXJhY3RlcnMgZm9yIHNwZWNpZmljIG1hdGNoaW5nXHJcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7IC8vIENvb3JkaW5hdGUgbmFtZVxyXG4gICAgICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFtcXHdcXGRcXHNcXC0sLjokKCEpX1xcLVxce31cXCtcXFxcXWA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcbiAgICAgICAgY29uc3QgZiA9IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOyYqXFx7XFx9JVxcLTw+XWA7IC8vIEZvcm1hdHRpbmcgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcblxyXG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB1c2luZyBlc2NhcGVkIGJyYWNlcyBhbmQgcGF0dGVybnNcclxuICAgICAgICBjb25zdCBjb29yUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JcXHsoJHtjLnNvdXJjZX0pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSopXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBub2RlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KilcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNlID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFxzKigke3R9KilcXHMqYXRcXHMqKCR7Y30qKVxccypcXFsoJHtmfSopXFxdXFxzKlxceygke3R9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqKFxcW2xhYmVsPVxce1xcWyguKj8pXFxdOlxcXFxcXHcqXFxzKihbXFx3XFxzXSopXFx9XFxdKT9cXHMqXFwoKCR7Y259KylcXClcXHMqYXRcXHMqXFwoKCR7Yy5zb3VyY2V9KVxcKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHh5YXhpc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx4eWF4aXMoe1snXCJcXGBcXHdcXGQtPD5cXCQsXSt9KT8oe1snXCJcXGBcXHdcXGQtPD4kLF0rfSk/YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZCh7W1xcZC0uXSt9KT9gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgY2lyY2xlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNpcmNsZVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceyhbXFx3XFxzXFxkXSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG1hc3NSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbWFzc1xceygke2N9KylcXH1cXHsoJHt0fSopXFx9XFx7PyhbLXw+XSopP1xcfT9cXHs/KFstLlxcc1xcZF0qKT9cXH0/YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHZlY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx2ZWNcXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceygke3R9KilcXH1cXHs/KFstfD5dKik/XFx9P2AsIFwiZ1wiKTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzZSwgc3MsIG5vZGVSZWdleCwgZHJhd1JlZ2V4LCB4eWF4aXNSZWdleCwgZ3JpZFJlZ2V4LCBjaXJjbGVSZWdleCwgbWFzc1JlZ2V4LCB2ZWNSZWdleF07XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlcyA9IHJlZ2V4UGF0dGVybnMuZmxhdE1hcChwYXR0ZXJuID0+IFsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChwYXR0ZXJuKV0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNvcnQgbWF0Y2hlcyBieSB0aGVpciBpbmRleCB0byBlbnN1cmUgY29ycmVjdCBvcmRlclxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGEuaW5kZXggfHwgMCkgLSAoYi5pbmRleCB8fCAwKSk7XHJcbiAgICAgIFxyXG4gICAgICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9IFxyXG5cclxuICAgICAgICAgIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JcIikpIHtcclxuICAgICAgICAgICAgaWYobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yZGluYXRlXCIpKXtcclxuICAgICAgICAgICAgICAgIChbbWF0Y2hbMV0sbWF0Y2hbMl0sbWF0Y2hbNF0sbWF0Y2hbNV1dPVttYXRjaFs1XSxtYXRjaFs0XSxtYXRjaFsxXSxtYXRjaFsyXV0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgLy9jb25zb2xlLmxvZyhtYXRjaClcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgpLmFzQ29vcmRpbmF0ZShtYXRjaCx0aGlzLnRva2VucykpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyhtYXRjaCwgdGhpcy50b2tlbnMpKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChkaXNzZWN0WFlheGlzKG1hdGNoKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHt0eXBlOiBcImdyaWRcIiwgcm90YXRlOiBtYXRjaFsxXX0pO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXG5vZGVcIikpIHtcclxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XHJcbiAgICAgICAgICAgICAgICAoW21hdGNoWzFdLG1hdGNoWzNdLG1hdGNoWzRdLG1hdGNoWzNdXT1bbWF0Y2hbMl0sbWF0Y2hbMV0sbWF0Y2hbM10sbWF0Y2hbNF1dKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoKS5hc05vZGUobWF0Y2gsIHRoaXMudG9rZW5zKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXHJcbiAgICAgICAgICAgICAgZm9ybWF0dGluZzogbWF0Y2hbNF0sXHJcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMl0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxtYXNzXCIpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAgIHR5cGU6IFwibWFzc1wiLFxyXG4gICAgICAgICAgICAgIHRleHQ6IG1hdGNoWzJdIHx8IFwiXCIsXHJcbiAgICAgICAgICAgICAgZm9ybWF0dGluZzogbWF0Y2hbM10gfHwgbnVsbCxcclxuICAgICAgICAgICAgICByb3RhdGU6IE51bWJlcihtYXRjaFs0XSkgfHwgMCxcclxuICAgICAgICAgICAgICAuLi4oKHsgWCwgWSB9KSA9PiAoeyBYLCBZIH0pKShwYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzFdLCB0aGlzLnRva2VucykpLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgdHlwZTogXCJ2ZWNcIixcclxuICAgICAgICAgICAgICB0ZXh0OiBtYXRjaFszXSB8fCBcIlwiLFxyXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdIHx8IG51bGwsXHJcbiAgICAgICAgICAgICAgcm90YXRlOiBOdW1iZXIobWF0Y2hbNV0pIHx8IDAsXHJcbiAgICAgICAgICAgICAgYW5jaG9yOnsuLi4oKHsgWCwgWSB9KSA9PiAoeyBYLCBZIH0pKShwYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzFdLCB0aGlzLnRva2VucykpLH0sXHJcbiAgICAgICAgICAgICAgLi4uKCh7IFgsIFkgfSkgPT4gKHsgWCwgWSB9KSkocGFyc2VDb29yZGluYXRlcyhtYXRjaFsyXSwgdGhpcy50b2tlbnMpKSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZmluZE1pZHBvaW50KCkge1xyXG4gICAgICAgIGxldCBjb29yZGluYXRlcyA9IHRoaXMudG9rZW5zLmZpbHRlcigodG9rZW46IHRva2VuKSA9PiB0b2tlbiBpbnN0YW5jZW9mIENvb3JkaW5hdGUpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zXHJcbiAgICAgICAgLmZpbHRlcigodG9rZW46IHRva2VuKSA9PiB0b2tlbiBpbnN0YW5jZW9mIERyYXcpXHJcbiAgICAgICAgLmZvckVhY2goKG9iamVjdDogRHJhdykgPT4ge1xyXG4gICAgICAgICAgICBjb29yZGluYXRlcyA9IGNvb3JkaW5hdGVzLmNvbmNhdChcclxuICAgICAgICAgICAgICAgIG9iamVjdC5jb29yZGluYXRlcy5maWx0ZXIoKHRva2VuOiB0b2tlbikgPT4gdG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xyXG4gICAgICAgIGNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IHRva2VuKSA9PiB7XHJcbiAgICAgICAgICBzdW1PZlggKz0gTnVtYmVyKGNvb3JkaW5hdGUuWCk7XHJcbiAgICAgICAgICBzdW1PZlkgKz0gTnVtYmVyKGNvb3JkaW5hdGUuWSk7IFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm1pZFBvaW50PW5ldyBDb29yZGluYXRlKCkuYWRkWFkoXHJcbiAgICAgICAgICAgIHN1bU9mWCAvIGNvb3JkaW5hdGVzLmxlbmd0aCE9PTA/Y29vcmRpbmF0ZXMubGVuZ3RoOjFcclxuICAgICAgICAgICAgLHN1bU9mWSAvIGNvb3JkaW5hdGVzLmxlbmd0aCE9PTA/Y29vcmRpbmF0ZXMubGVuZ3RoOjFcclxuICAgICAgICApXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGFwcGx5UXVhZHJhbnRzKCkge1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgdG9rZW4gPT09IFwib2JqZWN0XCIgJiYgdG9rZW4gIT09IG51bGwmJnRva2VuLnR5cGU9PT1cImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgICAgICB0b2tlbi5hZGRRdWFkcmFudCh0aGlzLm1pZFBvaW50KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICByZWNvbnN0cnVjdCgpe1xyXG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xyXG4gICAgICAgIGNvbnN0IGV4dHJlbWVYWT1nZXRFeHRyZW1lWFkodGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuXHJcbiAgICAgICAgICAgIGlmKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZXx8dG9rZW4gaW5zdGFuY2VvZiBEcmF3KXtcclxuICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPXRva2VuLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gXCJvYmplY3RcIikge1xyXG4gICAgICAgICAgICAvKnN3aXRjaCh0b2tlbi50eXBlKXtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJjb29yZGluYXRlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IHRva2VuLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwibm9kZVwiOlxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSBgXFxcXG5vZGUgKCR7dG9rZW4uY29vcmRpbmF0ZU5hbWV9KSBhdCAoJHt0b2tlbi5YfSwke3Rva2VuLll9KSBbJHtnZW5lcmF0ZUZvcm1hdHRpbmcodG9rZW4pfV0geyR7dG9rZW4ubGFiZWx9fTtgO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImRyYXdcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPXRva2VuLnRvU3RyaW5nKClcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJ4eWF4aXNcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbJHt0b2tlbi54RGlyZWN0aW9uPT09XCJ1cFwiP1wiLXtTdGVhbHRofVwiOlwie1N0ZWFsdGh9LVwifV0oJHtleHRyZW1lWFkubWluWH0sMClgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gLS0oJHtleHRyZW1lWFkubWF4WH0sMClgXHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz10b2tlbi5Ybm9kZT9gbm9kZSBbJHt0b2tlbi5YZm9ybWF0dGluZy5zdWJzdHJpbmcoMSx0b2tlbi5YZm9ybWF0dGluZy5sZW5ndGgtMSl9XSB7JHt0b2tlbi5Ybm9kZX19O2A6XCI7XCJcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbJHt0b2tlbi55RGlyZWN0aW9uPT09XCJ1cFwiP1wiLXtTdGVhbHRofVwiOlwie1N0ZWFsdGh9LVwifV0oJHtleHRyZW1lWFkubWluWX0sMClgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gLS0oMCwke2V4dHJlbWVYWS5tYXhZfSlgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz10b2tlbi5Zbm9kZT9gbm9kZSBbJHt0b2tlbi5ZZm9ybWF0dGluZy5zdWJzdHJpbmcoMSx0b2tlbi5ZZm9ybWF0dGluZy5sZW5ndGgtMSl9XSB7JHt0b2tlbi5Zbm9kZX19O2A6XCI7XCJcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJncmlkXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXGRyYXcgW10gKCR7ZXh0cmVtZVhZLm1pblh9LCR7ZXh0cmVtZVhZLm1pbll9KSBncmlkIFtyb3RhdGU9JHt0b2tlbj8ucm90YXRlfHwwfSx4c3RlcD0uNzVjbSx5c3RlcD0uNzVjbV0gKCR7ZXh0cmVtZVhZLm1heFh9LCR7ZXh0cmVtZVhZLm1heFl9KTtgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiY2lyY2xlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGVtcD1jYWxjdWxhdGVDaXJjbGUodG9rZW4uY29vcmRpbmF0ZXNbMF0sdG9rZW4uY29vcmRpbmF0ZXNbMV0sdG9rZW4uY29vcmRpbmF0ZXNbMl0pXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LCR7dG9rZW4uZm9ybWF0dGluZ31dICgke3RlbXA/LmNlbnRlci5YfSwke3RlbXA/LmNlbnRlci5ZfSkgY2lyY2xlIFtyYWRpdXM9JHt0ZW1wPy5yYWRpdXN9XTtgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwibWFzc1wiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRlbXA9dG9rZW4uZm9ybWF0dGluZyE9PW51bGw/dG9rZW4uZm9ybWF0dGluZz09PVwiLXxcIj9cInNvdXRoXCI6XCJub3J0aFwiOlwibm9ydGhcIjtcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSAke3RlbXB9LHJvdGF0ZT0ke3Rva2VuLnJvdGF0ZX1dIGF0ICgke3Rva2VuLlh9LCR7dG9rZW4uWX0peyR7dG9rZW4udGV4dH19O2BcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbLXtTdGVhbHRofSwke3Rva2VuLmZvcm1hdHRpbmd8fFwiXCJ9XSgke3Rva2VuLmFuY2hvci5YfSwke3Rva2VuLmFuY2hvci5ZfSktLW5vZGUgW10geyR7dG9rZW4udGV4dH19KCR7dG9rZW4uWCt0b2tlbi5hbmNob3IuWH0sJHt0b2tlbi5ZK3Rva2VuLmFuY2hvci5ZfSk7YFxyXG4gICAgICAgICAgICB9Ki9cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGRpc3NlY3RYWWF4aXMobWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkpIHtcclxuICAgIGxldCBYbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiLCBZbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiO1xyXG5cclxuICAgIGlmIChtYXRjaFsxXSAmJiBtYXRjaFsyXSkge1xyXG4gICAgICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcclxuICAgICAgICBZbm9kZSA9IG1hdGNoWzJdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XHJcbiAgICAgICAgWG5vZGU9WG5vZGVbMF0uc3Vic3RyaW5nKDEsWG5vZGUubGVuZ3RoKVxyXG4gICAgICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcInh5YXhpc1wiLFxyXG4gICAgICAgIFhmb3JtYXR0aW5nOiBtYXRjaFsxXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICAgICAgWWZvcm1hdHRpbmc6IG1hdGNoWzJdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcclxuICAgICAgICB4RGlyZWN0aW9uOiBtYXRjaFsxXSAmJiAvLT4vLnRlc3QobWF0Y2hbMV0pID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIsXHJcbiAgICAgICAgeURpcmVjdGlvbjogbWF0Y2hbMl0gJiYgLy0+Ly50ZXN0KG1hdGNoWzJdKSA/IFwiZG93blwiIDogXCJ1cFwiLFxyXG4gICAgICAgIFhub2RlOiBYbm9kZSxcclxuICAgICAgICBZbm9kZTogWW5vZGUsXHJcbiAgICB9O1xyXG59XHJcblxyXG5jb25zdCBjYSA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjpdYDtcclxuICAgICAgICAvL2NvbnN0IGM9YCRcXCgoJHtjYX0pXFwpKCEoW1xcZC5dKSF8JHtjYX18KylcXCgoJHtjYX0pXFwpJGA7XHJcbiAgICAgICAgY29uc3QgYz1gKCR7Y2F9K3wxKWA7XHJcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7Ly9jb29yIG5hbWVcclxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOiQoISlfXFwtXFx7fStcXFxcXWA7Ly90ZXh0XHJcbiAgICAgICAgY29uc3QgZiA9IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOyYqW1xcXVxce1xcfSUtPD5dYDsvL0Zvcm1hdHRpbmcuXHJcblxyXG4gIFxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xyXG5sZXQgbWF4WCA9IC1JbmZpbml0eTtcclxubGV0IG1heFkgPSAtSW5maW5pdHk7XHJcbmxldCBtaW5YID0gSW5maW5pdHk7XHJcbmxldCBtaW5ZID0gSW5maW5pdHk7XHJcblxyXG50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgaWYgKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICBpZiAodG9rZW4uWCA+IG1heFgpIG1heFggPSB0b2tlbi5YO1xyXG4gICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcclxuXHJcbiAgICBpZiAodG9rZW4uWSA+IG1heFkpIG1heFkgPSB0b2tlbi5ZO1xyXG4gICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcclxuICAgIH1cclxufSk7XHJcblxyXG5yZXR1cm4ge1xyXG4gICAgbWF4WCxtYXhZLG1pblgsbWluWSxcclxufTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHNpZGVOb2RlRm9ybWF0dGluZyhmb3JtYXR0aW5nOiBzdHJpbmcsc2xvcGU6IG51bWJlcixiZWZvcmVUb2tlbjogQ29vcmRpbmF0ZSxhZnRlclRva2VuOiBDb29yZGluYXRlKSB7XHJcbiAgICBpZiAoZm9ybWF0dGluZy5tYXRjaCgvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLykpIHtcclxuICAgICAgICByZXR1cm4gZm9ybWF0dGluZztcclxuICAgIH1cclxuICAgIGZvcm1hdHRpbmcrPWZvcm1hdHRpbmcubGVuZ3RoPjA/XCIsXCI6XCJcIjtcclxuXHJcbiAgICBjb25zdCBlZGdlMSA9IGJlZm9yZVRva2VuLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xyXG4gICAgY29uc3QgZWRnZTIgPSBhZnRlclRva2VuLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xyXG5cclxuICAgIGlmIChzbG9wZSE9PUluZmluaXR5JiZzbG9wZSE9PS1JbmZpbml0eSl7XHJcbiAgICAgICAgaWYgKHNsb3BlICE9PSAwKSB7XHJcbiAgICAgICAgZm9ybWF0dGluZyArPSBcInNsb3BlZCwgXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICgvKDN8NCkvLnRlc3QoZWRnZTEpICYmIC8oM3w0KS8udGVzdChlZGdlMikpIHtcclxuICAgICAgICBmb3JtYXR0aW5nICs9IFwiYmVsb3cgXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKC8oMXwyKS8udGVzdChlZGdlMSkgJiYgLygxfDIpLy50ZXN0KGVkZ2UyKSkge1xyXG4gICAgICAgIGZvcm1hdHRpbmcgKz0gXCJhYm92ZSBcIjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHNsb3BlICE9PSAwKXtcclxuICAgICAgICBpZiAoLygxfDQpLy50ZXN0KGVkZ2UxKSAmJiAvKDF8NCkvLnRlc3QoZWRnZTIpKSB7XHJcbiAgICAgICAgZm9ybWF0dGluZyArPSBcInJpZ2h0XCI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYoLygyfDMpLy50ZXN0KGVkZ2UxKSAmJiAvKDJ8MykvLnRlc3QoZWRnZTIpKXtcclxuICAgICAgICBmb3JtYXR0aW5nICs9IFwibGVmdFwiO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBmb3JtYXR0aW5nO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZW5lcmF0ZUZvcm1hdHRpbmcoY29vcmRpbmF0ZTogQ29vcmRpbmF0ZSl7XHJcbiAgICBpZiAodHlwZW9mIGNvb3JkaW5hdGUubGFiZWwgIT09IFwic3RyaW5nXCIpeyByZXR1cm4gXCJcIjsgfVxyXG4gICAgY29uc3QgZm9ybWF0dGluZyA9IGNvb3JkaW5hdGUuZm9ybWF0dGluZz8uc3BsaXQoXCIsXCIpIHx8IFtdO1xyXG4gICAgaWYgKGZvcm1hdHRpbmcuc29tZSgodmFsdWU6IHN0cmluZykgPT4gLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8udGVzdCh2YWx1ZSkpKSB7XHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGUuZm9ybWF0dGluZztcclxuICAgIH1cclxuICAgIGlmKGZvcm1hdHRpbmcubGVuZ3RoPjAmJiFmb3JtYXR0aW5nW2Zvcm1hdHRpbmcubGVuZ3RoLTFdLmVuZHNXaXRoKFwiLFwiKSl7Zm9ybWF0dGluZy5wdXNoKFwiLFwiKX1cclxuICAgIHN3aXRjaChjb29yZGluYXRlLnF1YWRyYW50KXtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgcmlnaHQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgbGVmdCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyBsZWZ0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSA0OiBcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyByaWdodCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvcm1hdHRpbmcuam9pbihcIlwiKTtcclxufVxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRQcmVhbWJsZSgpOnN0cmluZ3tcclxuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcclxuICBcclxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXHJcbiAgXHJcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxyXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXHJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcclxuICAgIFxyXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcclxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcclxuICAgIC8vY29uc3QgbWFzcz1gXFxcXGRlZlxcXFxtYXNzIzEjMntcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCMxKXsjMn07fWBcclxuICAgIGNvbnN0IGR2ZWN0b3I9XCJcXFxcbmV3Y29tbWFuZHtcXFxcZHZlY3Rvcn1bMl17XFxcXGNvb3JkaW5hdGUgKHRlbXAxKSBhdCAoJCgwLDAgLXwgIzEpJCk7XFxcXGNvb3JkaW5hdGUgKHRlbXAyKSBhdCAoJCgwLDAgfC0gIzEpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MC43cHQsIzJdICgjMSktLSh0ZW1wMSkoIzEpLS0odGVtcDIpO31cIlxyXG4gICAgXHJcbiAgICBjb25zdCBwaWNBbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYW5nfVs1XXtcXFxcY29vcmRpbmF0ZSAoYW5nMSkgYXQgKCMxKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzIpIGF0ICgjMik7IFxcXFxjb29yZGluYXRlIChhbmczKSBhdCAoIzMpOyBcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nM317Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdDQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcxfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQUJcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXGFuZ0NCIC0gXFxcXGFuZ0FCfVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PDBwdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXHBnZm1hdGhyZXN1bHQgKyAzNjB9XFxcXGZpXFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ+MTgwcHRcXFxccGdmbWF0aHBhcnNlezM2MCAtIFxcXFxwZ2ZtYXRocmVzdWx0fVxcXFxmaVxcXFxsZXRcXFxcYW5nQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhzZXRtYWNyb3tcXFxcYW5nbGVDaGVja317YWJzKFxcXFxhbmdCIC0gOTApfVxcXFxpZnRoZW5lbHNle1xcXFxsZW5ndGh0ZXN0e1xcXFxhbmdsZUNoZWNrIHB0IDwgMC4xcHR9fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXtyaWdodCBhbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde2FuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O319XCJcclxuICAgIGNvbnN0IHByZWFtYmxlPVwiXFxcXHVzZXBhY2thZ2V7cGdmcGxvdHMsaWZ0aGVufVxcXFx1c2V0aWt6bGlicmFyeXthcnJvd3MubWV0YSxhbmdsZXMscXVvdGVzLHBvc2l0aW9uaW5nLCBjYWxjLCBpbnRlcnNlY3Rpb25zLGRlY29yYXRpb25zLm1hcmtpbmdzLG1hdGgsc3B5LG1hdHJpeCxwYXR0ZXJucyxzbmFrZXMsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcclxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcclxufSJdfQ==