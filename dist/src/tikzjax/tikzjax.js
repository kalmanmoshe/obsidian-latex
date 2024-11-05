import { MarkdownView, WorkspaceWindow } from "obsidian";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { degreesToRadians } from "src/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";
export class Tikzjax {
    //const editor = activeView?.editor as CodeMirrorEditor | null;
    constructor(app, plugin) {
        this.postProcessSvg = (e) => {
            const svgEl = e.target;
            let svg = svgEl.outerHTML;
            if (this.plugin.settings.invertColorsInDarkMode) {
                svg = this.colorSVGinDarkMode(svg);
            }
            svg = this.optimizeSVG(svg);
            svgEl.outerHTML = svg;
        };
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
            const script = el.createEl("script");
            script.setAttribute("type", "text/tikz");
            script.setAttribute("data-show-console", "true");
            script.setText(this.tidyTikzSource(source, icon));
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
}
class FormatTikzjax {
    constructor(source) {
        this.processedCode = "";
        this.debugInfo = "";
        this.source = source;
        this.debugInfo += this.source;
        this.tokens = this.tokenize();
        this.findMidpoint();
        this.applyQuadrants();
        this.debugInfo += JSON.stringify(this.tokens, null, 0.01) + "\n\n";
        this.processedCode += this.reconstruct();
        this.debugInfo += this.processedCode;
    }
    getCode() {
        return getPreamble() + this.processedCode + "\n\\end{tikzpicture}\\end{document}";
    }
    tokenize() {
        const a = String.raw `[\w\d\s-,.:$(!)+]+`;
        const t = String.raw `[\w\d\s-,.:$(!)_\-\{}+]`;
        const f = String.raw `[\w\d\s-,.:$(!)_\-\{}+]`;
        // Create `tokens` array and define regular expressions
        const tokens = [];
        // Use `String.raw` for regex patterns to avoid double escaping
        const coorRegex = new RegExp(String.raw `\\coor\{(${a})\}\{([A-Za-z\d]*)\}\{([A-Za-z\d]*)\}\{([^}]*)\}`, "g");
        const nodeRegex = new RegExp(String.raw `\\node\{([\w\d\s-,.:]+)\}\{([A-Za-z]*)\}\{([A-Za-z]*)\}\{([^}]*)\}`, "g");
        const ss = new RegExp(String.raw `\\coordinate\s*\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\]\s*\((\w+)\)\s*at\s*\(\$?\(?([\w\d\s-,.]+)\)?\$?\)?;`, "g");
        const drawRegex = new RegExp(String.raw `\\draw\s*\[([\w\s\d=:,!';&*[\]\{\}%-]*)\]\s*(.*?);`, "g");
        const xyaxisRegex = new RegExp(String.raw `\\xyaxis({['"\`\w\d-<>\$,]+})?({['"\`\w\d-<>$,]+})?`, "g");
        const gridRegex = new RegExp(String.raw `\\grid({[\d-.]+})?`, "g");
        const circleRegex = new RegExp(String.raw `\\circle\{([\w\d\s-,.:]+)\}\{([\w\d\s-,.:]+)\}\{([\w\d\s-,.:]*)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw `\\mass\{([\w\d\s-,.:$(!)+]+)\}\{(${t}*)\}\{?([-|>]*)?\}?\{?([-.\s\d]*)?\}?`, "g");
        const vecRegex = new RegExp(String.raw `\\vec\{(${a})\}\{(${a})\}\{(${t}*)\}\{?([-|>]*)?\}?`, "g");
        const regexPatterns = [coorRegex, ss, nodeRegex, drawRegex, xyaxisRegex, gridRegex, circleRegex, massRegex, vecRegex];
        // Collect all matches and their respective indices
        const matches = regexPatterns.flatMap(pattern => [...this.source.matchAll(pattern)]);
        // Sort matches by their index to ensure correct order
        matches.sort((a, b) => (a.index || 0) - (b.index || 0));
        let currentIndex = 0;
        for (const match of matches) {
            if (match.index !== undefined && match.index > currentIndex) {
                tokens.push(this.source.slice(currentIndex, match.index));
            }
            if (match[0].startsWith("\\coor")) {
                tokens.push({ type: "coordinate", ...dissectCoordinates(match, tokens) });
            }
            else if (match[0].startsWith("\\draw")) {
                tokens.push(dissectDraw(match, tokens));
            }
            else if (match[0].startsWith("\\xyaxis")) {
                tokens.push(dissectXYaxis(match));
            }
            else if (match[0].startsWith("\\grid")) {
                tokens.push({ type: "grid", rotate: match[1] });
            }
            else if (match[0].startsWith("\\node")) {
                tokens.push({ type: "node", ...dissectCoordinates(match, tokens) });
            }
            else if (match[0].startsWith("\\circle")) {
                tokens.push({
                    type: "circle",
                    formatting: match[4],
                    coordinates: [
                        parseCoordinates(match[1], tokens),
                        parseCoordinates(match[2], tokens),
                        parseCoordinates(match[3], tokens),
                    ],
                });
            }
            else if (match[0].startsWith("\\mass")) {
                tokens.push({
                    type: "mass",
                    text: match[2] || "",
                    formatting: match[3] || null,
                    rotate: Number(match[4]) || 0,
                    ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[1], tokens)),
                });
            }
            else if (match[0].startsWith("\\vec")) {
                tokens.push({
                    type: "vec",
                    text: match[3] || "",
                    formatting: match[4] || null,
                    rotate: Number(match[5]) || 0,
                    anchor: { ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[1], tokens)), },
                    ...(({ X, Y }) => ({ X, Y }))(parseCoordinates(match[2], tokens)),
                });
            }
            if (match.index !== undefined) {
                currentIndex = match.index + match[0].length;
            }
        }
        if (currentIndex < this.source.length) {
            tokens.push(this.source.slice(currentIndex));
        }
        return tokens;
    }
    findMidpoint() {
        console.log(this.tokens);
        let coordinates = this.tokens.filter((token) => token.type && token.type === "coordinate");
        if (coordinates.length === 0) {
            const tempTokens = this.tokens.filter((token) => token.type && token.type === "draw");
            tempTokens.forEach((object) => {
                coordinates = coordinates.concat(object.coordinates.filter((token) => token.type && token.type === "coordinate"));
            });
        }
        let sumOfX = 0, sumOfY = 0;
        coordinates.forEach((coordinate) => {
            sumOfX += Number(coordinate.X);
            sumOfY += Number(coordinate.Y);
        });
        this.midPoint = {
            X: sumOfX / coordinates.length !== 0 ? coordinates.length : 1,
            Y: sumOfY / coordinates.length !== 0 ? coordinates.length : 1,
        };
    }
    applyQuadrants() {
        this.tokens.forEach((token) => {
            if (typeof token === "object" && token !== null && token.type === "coordinate") {
                token.quadrant = findQuadrant(token, this.midPoint);
            }
        });
    }
    reconstruct() {
        let codeBlockOutput = "", temp;
        const extremeXY = getExtremeXY(this.tokens);
        this.tokens.forEach((token) => {
            if (typeof token === "object") {
                switch (token.type) {
                    case "coordinate":
                        codeBlockOutput += `\\coor{${token.X},${token.Y}}{${token.coordinateName || ""}}{${token.label || ""}}{${generateFormatting(token) || ""}}`;
                        break;
                    case "node":
                        codeBlockOutput += `\\node (${token.coordinateName}) at (${token.X},${token.Y}) [${generateFormatting(token)}] {${token.label}};`;
                        break;
                    case "draw":
                        codeBlockOutput += `\\draw [${token.formatting}] ${reconstructDraw(token, this.tokens, this.midPoint)}`;
                        break;
                    case "xyaxis":
                        codeBlockOutput += `\\draw [${token.xDirection === "up" ? "-{Stealth}" : "{Stealth}-"}](${extremeXY.minX},0)`;
                        codeBlockOutput += `--(${extremeXY.maxX},0)`;
                        codeBlockOutput += token.Xnode ? `node [${token.Xformatting.substring(1, token.Xformatting.length - 1)}] {${token.Xnode}};` : ";";
                        codeBlockOutput += `\\draw [${token.yDirection === "up" ? "-{Stealth}" : "{Stealth}-"}](${extremeXY.minY},0)`;
                        codeBlockOutput += `--(0,${extremeXY.maxY})`;
                        codeBlockOutput += token.Ynode ? `node [${token.Yformatting.substring(1, token.Yformatting.length - 1)}] {${token.Ynode}};` : ";";
                        break;
                    case "grid":
                        codeBlockOutput += `\\draw [] (${extremeXY.minX},${extremeXY.minY}) grid [rotate=${token?.rotate || 0},xstep=.75cm,ystep=.75cm] (${extremeXY.maxX},${extremeXY.maxY});`;
                        break;
                    case "circle":
                        temp = calculateCircle(token.coordinates[0], token.coordinates[1], token.coordinates[2]);
                        codeBlockOutput += `\\draw [line width=1pt,${token.formatting}] (${temp?.center.X},${temp?.center.Y}) circle [radius=${temp?.radius}];`;
                        break;
                    case "mass":
                        temp = token.formatting !== null ? token.formatting === "-|" ? "south" : "north" : "north";
                        codeBlockOutput += `\\node[fill=yellow!60,draw,text=black,anchor= ${temp},rotate=${token.rotate}] at (${token.X},${token.Y}){${token.text}};`;
                        break;
                    case "vec":
                        codeBlockOutput += `\\draw [-{Stealth},${token.formatting || ""}](${token.anchor.X},${token.anchor.Y})--node [] {${token.text}}(${token.X + token.anchor.X},${token.Y + token.anchor.Y});`;
                }
            }
            else {
                codeBlockOutput += token;
            }
        });
        return codeBlockOutput;
    }
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
function dissectXYaxis(match) {
    let Xnode = "", Ynode = "";
    if (match[1] && match[2]) {
        Xnode = match[1].match(/['`"]([\w\d&$]+)['`"]/);
        Ynode = match[2].match(/['`"]([\w\d&$]+)['`"]/);
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
function dissectDraw(match, tokens) {
    if (!match || !match[2]) {
        console.error("Invalid match input, aborting function.");
        return null;
    }
    const path = match[2];
    const coordinatesArray = [];
    //[a-zA-Z0-9.\\{}>\-\\<$\s]*
    const nodeRegex = /[\s]*node[\s]*\[?([\w\d,\s.=]*)\]?[\s]*{([a-zA-Z0-9.\\{}>\-\\<$\s]*)}[\s]*/;
    const formattingRegex = /[\s]*(cycle|--cycle|--\+\+|--\+|--|circle|rectangle)[\s]*/;
    const coordinateRegex = /\s*\(([a-zA-Z0-9,:.\w\d]+)\)[\s]*/;
    let i = 0, j = 0;
    while (i < path.length && j < 20) {
        j++;
        //console.log(coordinatesArray)
        const coordinateMatch = path.slice(i).match(coordinateRegex);
        if (coordinateMatch?.index === 0) {
            coordinatesArray.push({ type: "coordinate", value: coordinateMatch[1] });
            i += coordinateMatch[0].length;
        }
        const formattingMatch = path.slice(i).match(formattingRegex);
        if (formattingMatch?.index === 0) {
            i += formattingMatch[0].length;
            coordinatesArray.push({ type: "formatting", value: formattingMatch[0] });
        }
        const nodeMatch = path.slice(i).match(nodeRegex);
        if (nodeMatch?.index === 0) {
            coordinatesArray.push({ type: "node", formatting: nodeMatch[1] || "", value: nodeMatch[2] });
            i += nodeMatch[0].length;
        }
    }
    if (j === 20) {
        return match[0];
    }
    for (let i = 0; i < coordinatesArray.length; i++) {
        if (coordinatesArray[i].type === "coordinate") {
            let previousFormatting = undefined;
            if (i > 0 && coordinatesArray[i - 1].type === "formatting") {
                previousFormatting = coordinatesArray[i - 1].value;
            }
            else if (i > 1 && coordinatesArray[i - 1].type === "node" && coordinatesArray[i - 2].type === "formatting") {
                previousFormatting = coordinatesArray[i - 2].value;
            }
            coordinatesArray.splice(i, 1, parseCoordinates(coordinatesArray[i].value, tokens, previousFormatting, coordinatesArray));
        }
    }
    return {
        type: "draw",
        formatting: match[1],
        coordinates: coordinatesArray,
    };
}
function parseCoordinates(coordinate, tokens, formatting, coordinatesArray) {
    let xValue = null, yValue = null, name;
    const parseNumber = (value) => {
        const numberValue = parseFloat(value);
        return isNaN(numberValue) ? value : numberValue;
    };
    const findOriginalValue = (value) => {
        return tokens.find((token) => (token.type === "coordinate" || token.type === "node") && token.coordinateName === value);
    };
    const doubleMatchRegex = /\$\(([\w\d\s-,.:$+]+)\)\+\(([\w\d\s-,.:$+]+)\)\$/;
    let match = coordinate.match(doubleMatchRegex);
    if (match) {
        //onsole.log(parseCoordinates(match[1],tokens),parseCoordinates(match[2],tokens))
        const coordinate1 = parseCoordinates(match[1], tokens), coordinate2 = parseCoordinates(match[2], tokens);
        [xValue, yValue] = [coordinate1.X + coordinate2.X, coordinate1.Y + coordinate2.Y];
    }
    const halfMatchRegex = /\$\(([\w\d\s-,.:$+]+)\)!([\d\s-,.:$+]+)!\(([\w\d\s-,.:$+]+)\)\$/;
    match = coordinate.match(halfMatchRegex);
    if (match) {
        const coordinate1 = parseCoordinates(match[1], tokens), coordinate2 = parseCoordinates(match[3], tokens);
        const halfByValue = Number(match[2]);
        if (!isNaN(halfByValue)) {
            [xValue, yValue] = [(coordinate1.X + coordinate2.X) * halfByValue, (coordinate1.Y + coordinate2.Y) * halfByValue];
        }
    }
    else if (coordinate.includes(",")) {
        [xValue, yValue] = coordinate.split(",").map(parseNumber);
    }
    else if (coordinate.includes(":")) {
        const [angle, length] = coordinate.split(":").map(parseFloat);
        if (!isNaN(angle) && !isNaN(length)) {
            const radians = degreesToRadians(angle);
            [xValue, yValue] = [length * Math.cos(radians), length * Math.sin(radians)].map(val => Math.abs(val) < 1e-10 ? 0 : val);
        }
        else {
            console.error("Invalid polar coordinates:", coordinate);
        }
    }
    else if (coordinate.includes("intersection")) {
        const originalCoords = coordinate
            .replace(/intersection\s?of\s?/g, "")
            .replace(/(\s*and\s?|--)/g, " ")
            .split(" ")
            .map(findOriginalValue);
        const slopes = [
            findSlope(originalCoords[0], originalCoords[1]),
            findSlope(originalCoords[2], originalCoords[3])
        ];
        ({ X: xValue, Y: yValue } = findIntersectionPoint(originalCoords[0], originalCoords[2], slopes[0], slopes[1]));
    }
    else {
        name = coordinate;
        const tokenMatch = findOriginalValue(coordinate);
        if (tokenMatch !== undefined) {
            [xValue, yValue] = [parseNumber(tokenMatch.X), parseNumber(tokenMatch.Y)];
        }
    }
    let coor = { X: 0, Y: 0 };
    if (formatting !== undefined && coordinatesArray.length > 0) {
        if (formatting === "--+") {
            coor = coordinatesArray.find((token) => token.type === "coordinate") || coor;
        }
        else if (formatting === "--++") {
            coor = coordinatesArray.findLast((token) => token.type === "coordinate") || coor;
        }
    }
    xValue += coor.X;
    yValue += coor.Y;
    return {
        type: "coordinate",
        X: xValue,
        Y: yValue,
        name: name,
        original: coordinate,
    };
}
function dissectCoordinates(match, tokens) {
    const [fullMatch, position, coordName, label, formatting] = match;
    const { X: xValue, Y: yValue } = parseCoordinates(position, tokens);
    return {
        X: xValue !== undefined ? xValue : null,
        Y: yValue !== undefined ? yValue : null,
        original: position,
        coordinateName: coordName || null,
        label: label || null,
        formatting: formatting.trim() || null,
    };
}
function findIntersectionPoint(coordinate1, coordinate2, slope1, slope2) {
    const xValue = ((slope2 * coordinate2.X) - (slope1 * coordinate1.X) + (coordinate1.Y - coordinate2.Y)) / (slope2 - slope1);
    return {
        X: xValue,
        Y: createLineFunction(coordinate1, slope1)(xValue)
    };
}
function createLineFunction(coordinate, slope) {
    return function (x) {
        return slope * (x - coordinate.X) + coordinate.Y;
    };
}
function findQuadrant(token, midPoint) {
    if (midPoint === null) {
        return null;
    }
    const xDirection = token.X > midPoint.X ? 1 : -1;
    const yDirection = token.Y > midPoint.Y ? 1 : -1;
    return yDirection === 1 ? (xDirection === 1 ? 1 : 2) : (xDirection === 1 ? 4 : 3);
}
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
function reconstructDraw(token, tokens, midPoint) {
    let string = "", beforeToken, afterToken, slope;
    token.coordinates.forEach((coordinate, index) => {
        switch (coordinate.type) {
            case "coordinate":
                if (coordinate.name) {
                    string += `(${coordinate.name})`;
                }
                else {
                    string += `(${coordinate.X},${coordinate.Y})`;
                }
                break;
            case "node":
                afterToken = token.coordinates.slice(index).find((token) => token.type === "coordinate");
                if (afterToken === undefined && token.coordinates[token.coordinates.length - 1].value === "cycle") {
                    afterToken = token.coordinates[0];
                }
                beforeToken = token.coordinates.slice(0, index).reverse()
                    .find((token) => token.type === "coordinate");
                slope = findSlope(beforeToken, afterToken);
                string += `node [${sideNodeFormatting(coordinate.formatting, slope, beforeToken, afterToken, midPoint)}] {${coordinate.value}} `;
                break;
            case "formatting":
                string += coordinate.value;
                break;
        }
    });
    return string + ";";
}
function findSlope(coordinate1, coordinate2) {
    const deltaY = coordinate2.Y - coordinate1.Y;
    const deltaX = coordinate2.X - coordinate1.X;
    return deltaY / deltaX;
}
function sideNodeFormatting(formatting, slope, beforeToken, afterToken, midPoint) {
    if (formatting.match(/(above|below|left|right)/)) {
        return formatting;
    }
    formatting += formatting.length > 0 ? "," : "";
    const edge1 = findQuadrant(beforeToken, midPoint)?.toString() || "";
    const edge2 = findQuadrant(afterToken, midPoint)?.toString() || "";
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
function calculateCircle(point1, point2, point3) {
    const x1 = point1.X, y1 = point1.Y;
    const x2 = point2.X, y2 = point2.Y;
    const x3 = point3.X, y3 = point3.Y;
    // Calculate the determinants needed for solving the system
    const A = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - y2 * x3);
    const B = (x1 ** 2 + y1 ** 2) * (y3 - y2) + (x2 ** 2 + y2 ** 2) * (y1 - y3) + (x3 ** 2 + y3 ** 2) * (y2 - y1);
    const C = (x1 ** 2 + y1 ** 2) * (x2 - x3) + (x2 ** 2 + y2 ** 2) * (x3 - x1) + (x3 ** 2 + y3 ** 2) * (x1 - x2);
    const D = (x1 ** 2 + y1 ** 2) * (x3 * y2 - x2 * y3) + (x2 ** 2 + y2 ** 2) * (x1 * y3 - x3 * y1) + (x3 ** 2 + y3 ** 2) * (x2 * y1 - x1 * y2);
    if (A === 0) {
        return null; // The points are collinear, no unique circle
    }
    // Calculate the center (h, k) of the circle
    const h = -B / (2 * A);
    const k = -C / (2 * A);
    // Calculate the radius of the circle
    const r = Math.sqrt((B ** 2 + C ** 2 - 4 * A * D) / (4 * A ** 2));
    return {
        center: { X: h, Y: k },
        radius: r,
        equation: `(x - ${h.toFixed(2)})^2 + (y - ${k.toFixed(2)})^2 = ${r.toFixed(2)}^2`
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUE0QyxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3QyxhQUFhO0FBQ2IsT0FBTyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDNUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBU2pELE1BQU0sT0FBTyxPQUFPO0lBSXBCLCtEQUErRDtJQUMzRCxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQWdJckMsbUJBQWMsR0FBRyxDQUFDLENBQVEsRUFBRSxFQUFFO1lBRTFCLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxNQUFxQixDQUFDO1lBQ3RDLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7WUFFMUIsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRTtnQkFDN0MsR0FBRyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQzthQUN0QztZQUVELEdBQUcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRTVCLEtBQUssQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDO1FBQzFCLENBQUMsQ0FBQTtRQTNJRCxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIs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QUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzlHLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBQzlHLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0lBRTVJLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtRQUNULE9BQU8sSUFBSSxDQUFDLENBQUMsNkNBQTZDO0tBQzdEO0lBRUQsNENBQTRDO0lBQzVDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQ3ZCLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBRXZCLHFDQUFxQztJQUNyQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFbEUsT0FBTztRQUNILE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRTtRQUN0QixNQUFNLEVBQUUsQ0FBQztRQUNULFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJO0tBQ3BGLENBQUM7QUFDRixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBDb21wb25lbnQsIEVkaXRvciwgTWFya2Rvd25SZW5kZXJlciwgTWFya2Rvd25WaWV3LCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcInNyYy9tYWluXCI7XHJcbmltcG9ydCB7IG9wdGltaXplIH0gZnJvbSBcIi4vc3Znby5icm93c2VyLmpzXCI7XHJcbi8vIEB0cy1pZ25vcmVcclxuaW1wb3J0IHRpa3pqYXhKcyBmcm9tIFwiaW5saW5lOi4vdGlrempheC5qc1wiO1xyXG5pbXBvcnQgeyBkZWdyZWVzVG9SYWRpYW5zIH0gZnJvbSBcInNyYy9tYXRoVXRpbGl0aWVzLmpzXCI7XHJcbmltcG9ydCB7IERlYnVnTW9kYWwgfSBmcm9tIFwic3JjL2Rlc3BseU1vZGFscy5qc1wiO1xyXG5cclxuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcblxyXG5pbnRlcmZhY2UgQ29kZU1pcnJvckVkaXRvciBleHRlbmRzIEVkaXRvciB7XHJcbiAgICBjbTogRWRpdG9yVmlldztcclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBUaWt6amF4IHtcclxuICAgIGFwcDogQXBwO1xyXG4gICAgcGx1Z2luOiBNYXRoUGx1Z2luO1xyXG4gICAgYWN0aXZlVmlldzogTWFya2Rvd25WaWV3IHwgbnVsbDtcclxuLy9jb25zdCBlZGl0b3IgPSBhY3RpdmVWaWV3Py5lZGl0b3IgYXMgQ29kZU1pcnJvckVkaXRvciB8IG51bGw7XHJcbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCxwbHVnaW46IE1hdGhQbHVnaW4pIHtcclxuICAgICAgdGhpcy5hcHA9YXBwO1xyXG4gICAgICB0aGlzLmFjdGl2ZVZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xyXG4gICAgICB0aGlzLnBsdWdpbj1wbHVnaW47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJlYWR5TGF5b3V0KCl7XHJcbiAgICAgIHRoaXMucGx1Z2luLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKTtcclxuICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcIndpbmRvdy1vcGVuXCIsICh3aW4sIHdpbmRvdykgPT4ge1xyXG4gICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH0pKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICBcclxuICAgIGxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcclxuICAgICAgICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xyXG4gICAgICAgICAgcy5pZCA9IFwidGlrempheFwiO1xyXG4gICAgICAgICAgcy50eXBlID0gXCJ0ZXh0L2phdmFzY3JpcHRcIjtcclxuICAgICAgICAgIHMuaW5uZXJUZXh0ID0gdGlrempheEpzO1xyXG4gICAgICAgICAgZG9jLmJvZHkuYXBwZW5kQ2hpbGQocyk7XHJcbiAgXHJcbiAgXHJcbiAgICAgICAgICBkb2MuYWRkRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICB1bmxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcclxuICAgICAgICAgIGNvbnN0IHMgPSBkb2MuZ2V0RWxlbWVudEJ5SWQoXCJ0aWt6amF4XCIpO1xyXG4gICAgICAgICAgcz8ucmVtb3ZlKCk7XHJcbiAgXHJcbiAgICAgICAgICBkb2MucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICBsb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xyXG4gICAgICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICAgIH1cclxuICAgICAgfVxyXG4gIFxyXG4gICAgICB1bmxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcclxuICAgICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy51bmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgZ2V0QWxsV2luZG93cygpIHtcclxuICAgICAgICAgIGNvbnN0IHdpbmRvd3MgPSBbXTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gcHVzaCB0aGUgbWFpbiB3aW5kb3cncyByb290IHNwbGl0IHRvIHRoZSBsaXN0XHJcbiAgICAgICAgICB3aW5kb3dzLnB1c2godGhpcy5hcHAud29ya3NwYWNlLnJvb3RTcGxpdC53aW4pO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlIGZsb2F0aW5nU3BsaXQgaXMgdW5kb2N1bWVudGVkXHJcbiAgICAgICAgICBjb25zdCBmbG9hdGluZ1NwbGl0ID0gdGhpcy5hcHAud29ya3NwYWNlLmZsb2F0aW5nU3BsaXQ7XHJcbiAgICAgICAgICBmbG9hdGluZ1NwbGl0LmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgICAvLyBpZiB0aGlzIGlzIGEgd2luZG93LCBwdXNoIGl0IHRvIHRoZSBsaXN0IFxyXG4gICAgICAgICAgICAgIGlmIChjaGlsZCBpbnN0YW5jZW9mIFdvcmtzcGFjZVdpbmRvdykge1xyXG4gICAgICAgICAgICAgICAgICB3aW5kb3dzLnB1c2goY2hpbGQud2luKTtcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICBcclxuICAgICAgICAgIHJldHVybiB3aW5kb3dzO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgXHJcbiAgICByZWdpc3RlclRpa3pDb2RlQmxvY2soKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrelwiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGVsLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XHJcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICAgICAgICAgICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBjb25zdCBzY3JpcHQgPSBlbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcclxuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBzY3JpcHQuc2V0VGV4dCh0aGlzLnRpZHlUaWt6U291cmNlKHNvdXJjZSxpY29uKSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICBhZGRTeW50YXhIaWdobGlnaHRpbmcoKSB7XHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5wdXNoKHtuYW1lOiBcIlRpa3pcIiwgbWltZTogXCJ0ZXh0L3gtbGF0ZXhcIiwgbW9kZTogXCJzdGV4XCJ9KTtcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICByZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKSB7XHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mbyA9IHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLmZpbHRlcihlbCA9PiBlbC5uYW1lICE9IFwiVGlrelwiKTtcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICB0aWR5VGlrelNvdXJjZSh0aWt6U291cmNlOiBzdHJpbmcsaWNvbjogSFRNTEVsZW1lbnQpIHtcclxuXHJcblx0XHRjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xyXG5cdFx0dGlrelNvdXJjZSA9IHRpa3pTb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHRpa3pTb3VyY2Uuc3BsaXQoXCJcXG5cIik7XHJcblx0XHRsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuXHRcdGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XHJcblxyXG5cdFx0Y29uc3QgdGlrempheD1uZXcgRm9ybWF0VGlrempheChsaW5lcy5qb2luKFwiXFxuXCIpKTtcclxuICAgICAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCx0aWt6amF4LmRlYnVnSW5mbykub3BlbigpO1xyXG5cdFx0cmV0dXJuIHRpa3pqYXguZ2V0Q29kZSgpO1xyXG5cdCAgICB9XHJcbiAgXHJcbiAgICAgIGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xyXG4gICAgICAgICAgc3ZnID0gc3ZnLnJlcGxhY2VBbGwoLyhcIiMwMDBcInxcImJsYWNrXCIpL2csIFwiXFxcImN1cnJlbnRDb2xvclxcXCJcIilcclxuICAgICAgICAgICAgICAgICAgLnJlcGxhY2VBbGwoLyhcIiNmZmZcInxcIndoaXRlXCIpL2csIFwiXFxcInZhcigtLWJhY2tncm91bmQtcHJpbWFyeSlcXFwiXCIpO1xyXG4gICAgICAgICAgcmV0dXJuIHN2ZztcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgICBvcHRpbWl6ZVNWRyhzdmc6IHN0cmluZykge1xyXG4gICAgICAgICAgLy8gT3B0aW1pemUgdGhlIFNWRyB1c2luZyBTVkdPXHJcbiAgICAgICAgICAvLyBGaXhlcyBtaXNhbGlnbmVkIHRleHQgbm9kZXMgb24gbW9iaWxlXHJcbiAgXHJcbiAgICAgICAgICByZXR1cm4gb3B0aW1pemUoc3ZnLCB7cGx1Z2luczpcclxuICAgICAgICAgICAgICBbXHJcbiAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFwicHJlc2V0LWRlZmF1bHRcIixcclxuICAgICAgICAgICAgICAgICAgICAgIHBhcmFtczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJyaWRlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbnVwSURzOiBmYWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIF1cclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIH0pPy5kYXRhO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgXHJcbiAgICAgIHBvc3RQcm9jZXNzU3ZnID0gKGU6IEV2ZW50KSA9PiB7XHJcbiAgXHJcbiAgICAgICAgICBjb25zdCBzdmdFbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgbGV0IHN2ZyA9IHN2Z0VsLm91dGVySFRNTDtcclxuICBcclxuICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKSB7XHJcbiAgICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcclxuICBcclxuICAgICAgICAgIHN2Z0VsLm91dGVySFRNTCA9IHN2ZztcclxuICAgICAgfVxyXG59XHJcblxyXG5cclxuXHJcbmNsYXNzIEZvcm1hdFRpa3pqYXgge1xyXG5cdHNvdXJjZTogc3RyaW5nO1xyXG4gICAgdG9rZW5zOiBhbnk7XHJcbiAgICBtaWRQb2ludDogYW55O1xyXG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcclxuICAgIGRlYnVnSW5mbyA9IFwiXCI7XHJcblx0Y29uc3RydWN0b3Ioc291cmNlOiBzdHJpbmcpIHtcclxuXHRcdHRoaXMuc291cmNlPXNvdXJjZTtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5zb3VyY2U7XHJcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2VuaXplKCk7XHJcbiAgICAgICAgdGhpcy5maW5kTWlkcG9pbnQoKTtcclxuICAgICAgICB0aGlzLmFwcGx5UXVhZHJhbnRzKCk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPUpTT04uc3RyaW5naWZ5KHRoaXMudG9rZW5zLG51bGwsMC4wMSkrXCJcXG5cXG5cIlxyXG4gICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnJlY29uc3RydWN0KCk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcclxuXHR9XHJcbiAgICBnZXRDb2RlKCl7XHJcbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUoKSB7XHJcbiAgICAgICAgY29uc3QgYSA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjokKCEpK10rYDtcclxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOiQoISlfXFwtXFx7fStdYDtcclxuICAgICAgICBjb25zdCBmID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOiQoISlfXFwtXFx7fStdYDtcclxuICAgICAgICAvLyBDcmVhdGUgYHRva2Vuc2AgYXJyYXkgYW5kIGRlZmluZSByZWd1bGFyIGV4cHJlc3Npb25zXHJcbiAgICAgICAgY29uc3QgdG9rZW5zID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVXNlIGBTdHJpbmcucmF3YCBmb3IgcmVnZXggcGF0dGVybnMgdG8gYXZvaWQgZG91YmxlIGVzY2FwaW5nXHJcbiAgICAgICAgY29uc3QgY29vclJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yXFx7KCR7YX0pXFx9XFx7KFtBLVphLXpcXGRdKilcXH1cXHsoW0EtWmEtelxcZF0qKVxcfVxceyhbXn1dKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFx7KFtcXHdcXGRcXHMtLC46XSspXFx9XFx7KFtBLVphLXpdKilcXH1cXHsoW0EtWmEtel0qKVxcfVxceyhbXn1dKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqXFxbbGFiZWw9XFx7XFxbKC4qPylcXF06XFxcXFxcdypcXHMqKFtcXHdcXHNdKilcXH1cXF1cXHMqXFwoKFxcdyspXFwpXFxzKmF0XFxzKlxcKFxcJD9cXCg/KFtcXHdcXGRcXHMtLC5dKylcXCk/XFwkP1xcKT87YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGRyYXdSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZHJhd1xccypcXFsoW1xcd1xcc1xcZD06LCEnOyYqW1xcXVxce1xcfSUtXSopXFxdXFxzKiguKj8pO2AsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzKHtbJ1wiXFxgXFx3XFxkLTw+XFwkLF0rfSk/KHtbJ1wiXFxgXFx3XFxkLTw+JCxdK30pP2AsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBncmlkUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGdyaWQoe1tcXGQtLl0rfSk/YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGNpcmNsZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjaXJjbGVcXHsoW1xcd1xcZFxccy0sLjpdKylcXH1cXHsoW1xcd1xcZFxccy0sLjpdKylcXH1cXHsoW1xcd1xcZFxccy0sLjpdKilcXH1cXHsoW1xcd1xcc1xcZF0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBtYXNzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG1hc3NcXHsoW1xcd1xcZFxccy0sLjokKCEpK10rKVxcfVxceygke3R9KilcXH1cXHs/KFstfD5dKik/XFx9P1xcez8oWy0uXFxzXFxkXSopP1xcfT9gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2F9KVxcfVxceygke2F9KVxcfVxceygke3R9KilcXH1cXHs/KFstfD5dKik/XFx9P2AsIFwiZ1wiKTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIHh5YXhpc1JlZ2V4LCBncmlkUmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4XTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDb2xsZWN0IGFsbCBtYXRjaGVzIGFuZCB0aGVpciByZXNwZWN0aXZlIGluZGljZXNcclxuICAgICAgICBjb25zdCBtYXRjaGVzID0gcmVnZXhQYXR0ZXJucy5mbGF0TWFwKHBhdHRlcm4gPT4gWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKHBhdHRlcm4pXSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU29ydCBtYXRjaGVzIGJ5IHRoZWlyIGluZGV4IHRvIGVuc3VyZSBjb3JyZWN0IG9yZGVyXHJcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiAoYS5pbmRleCB8fCAwKSAtIChiLmluZGV4IHx8IDApKTtcclxuICAgICAgXHJcbiAgICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XHJcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCAmJiBtYXRjaC5pbmRleCA+IGN1cnJlbnRJbmRleCkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAgICAgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vclwiKSkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7dHlwZTogXCJjb29yZGluYXRlXCIsIC4uLmRpc3NlY3RDb29yZGluYXRlcyhtYXRjaCwgdG9rZW5zKX0pO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcclxuICAgICAgICAgICAgdG9rZW5zLnB1c2goZGlzc2VjdERyYXcobWF0Y2gsIHRva2VucykpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHh5YXhpc1wiKSkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaChkaXNzZWN0WFlheGlzKG1hdGNoKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XHJcbiAgICAgICAgICAgIHRva2Vucy5wdXNoKHt0eXBlOiBcIm5vZGVcIiwgLi4uZGlzc2VjdENvb3JkaW5hdGVzKG1hdGNoLCB0b2tlbnMpfSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7XHJcbiAgICAgICAgICAgIHRva2Vucy5wdXNoKHtcclxuICAgICAgICAgICAgICB0eXBlOiBcImNpcmNsZVwiLFxyXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdLFxyXG4gICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbXHJcbiAgICAgICAgICAgICAgICBwYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzFdLCB0b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgcGFyc2VDb29yZGluYXRlcyhtYXRjaFsyXSwgdG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIHBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbM10sIHRva2VucyksXHJcbiAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgdHlwZTogXCJtYXNzXCIsXHJcbiAgICAgICAgICAgICAgdGV4dDogbWF0Y2hbMl0gfHwgXCJcIixcclxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFszXSB8fCBudWxsLFxyXG4gICAgICAgICAgICAgIHJvdGF0ZTogTnVtYmVyKG1hdGNoWzRdKSB8fCAwLFxyXG4gICAgICAgICAgICAgIC4uLigoeyBYLCBZIH0pID0+ICh7IFgsIFkgfSkpKHBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbMV0sIHRva2VucykpLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcclxuICAgICAgICAgICAgdG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAgIHR5cGU6IFwidmVjXCIsXHJcbiAgICAgICAgICAgICAgdGV4dDogbWF0Y2hbM10gfHwgXCJcIixcclxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSB8fCBudWxsLFxyXG4gICAgICAgICAgICAgIHJvdGF0ZTogTnVtYmVyKG1hdGNoWzVdKSB8fCAwLFxyXG4gICAgICAgICAgICAgIGFuY2hvcjp7Li4uKCh7IFgsIFkgfSkgPT4gKHsgWCwgWSB9KSkocGFyc2VDb29yZGluYXRlcyhtYXRjaFsxXSwgdG9rZW5zKSksfSxcclxuICAgICAgICAgICAgICAuLi4oKHsgWCwgWSB9KSA9PiAoeyBYLCBZIH0pKShwYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzJdLCB0b2tlbnMpKSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICBcclxuICAgICAgICBpZiAoY3VycmVudEluZGV4IDwgdGhpcy5zb3VyY2UubGVuZ3RoKSB7XHJcbiAgICAgICAgICB0b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcclxuICAgICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAgIHJldHVybiB0b2tlbnM7XHJcbiAgICB9XHJcblxyXG4gICAgZmluZE1pZHBvaW50KCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMudG9rZW5zKVxyXG4gICAgICAgIGxldCBjb29yZGluYXRlcyA9IHRoaXMudG9rZW5zLmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSAmJiB0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvb3JkaW5hdGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICBjb25zdCB0ZW1wVG9rZW5zID0gdGhpcy50b2tlbnMuZmlsdGVyKCh0b2tlbjogYW55KSA9PiB0b2tlbi50eXBlICYmIHRva2VuLnR5cGUgPT09IFwiZHJhd1wiKTtcclxuICAgICAgICAgICAgdGVtcFRva2Vucy5mb3JFYWNoKChvYmplY3Q6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBjb29yZGluYXRlcyA9IGNvb3JkaW5hdGVzLmNvbmNhdChvYmplY3QuY29vcmRpbmF0ZXMuZmlsdGVyKCh0b2tlbjogYW55KSA9PiB0b2tlbi50eXBlICYmIHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XHJcbiAgICAgICAgY29vcmRpbmF0ZXMuZm9yRWFjaCgoY29vcmRpbmF0ZTogYW55KSA9PiB7XHJcbiAgICAgICAgICBzdW1PZlggKz0gTnVtYmVyKGNvb3JkaW5hdGUuWCk7XHJcbiAgICAgICAgICBzdW1PZlkgKz0gTnVtYmVyKGNvb3JkaW5hdGUuWSk7IFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMubWlkUG9pbnQ9IHtcclxuICAgICAgICAgIFg6IHN1bU9mWCAvIGNvb3JkaW5hdGVzLmxlbmd0aCE9PTA/Y29vcmRpbmF0ZXMubGVuZ3RoOjEsXHJcbiAgICAgICAgICBZOiBzdW1PZlkgLyBjb29yZGluYXRlcy5sZW5ndGghPT0wP2Nvb3JkaW5hdGVzLmxlbmd0aDoxLFxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbiAgICBhcHBseVF1YWRyYW50cygpIHtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIHRva2VuID09PSBcIm9iamVjdFwiICYmIHRva2VuICE9PSBudWxsJiZ0b2tlbi50eXBlPT09XCJjb29yZGluYXRlXCIpIHtcclxuICAgICAgICAgICAgdG9rZW4ucXVhZHJhbnQgPSBmaW5kUXVhZHJhbnQodG9rZW4sdGhpcy5taWRQb2ludClcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJlY29uc3RydWN0KCl7XHJcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCIsdGVtcDogc3RyaW5nIHwgeyBjZW50ZXI6IHsgWDogbnVtYmVyOyBZOiBudW1iZXI7IH07IHJhZGl1czogbnVtYmVyOyBlcXVhdGlvbjogc3RyaW5nOyB9IHwgbnVsbDtcclxuICAgICAgICBjb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcclxuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgICBpZiAodHlwZW9mIHRva2VuID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgICAgIHN3aXRjaCh0b2tlbi50eXBlKXtcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJjb29yZGluYXRlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IGBcXFxcY29vcnske3Rva2VuLlh9LCR7dG9rZW4uWX19eyR7dG9rZW4uY29vcmRpbmF0ZU5hbWUgfHwgXCJcIn19eyR7dG9rZW4ubGFiZWwgfHwgXCJcIn19eyR7Z2VuZXJhdGVGb3JtYXR0aW5nKHRva2VuKXx8XCJcIn19YDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJub2RlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IGBcXFxcbm9kZSAoJHt0b2tlbi5jb29yZGluYXRlTmFtZX0pIGF0ICgke3Rva2VuLlh9LCR7dG9rZW4uWX0pIFske2dlbmVyYXRlRm9ybWF0dGluZyh0b2tlbil9XSB7JHt0b2tlbi5sYWJlbH19O2A7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiZHJhd1wiOlxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9YFxcXFxkcmF3IFske3Rva2VuLmZvcm1hdHRpbmd9XSAke3JlY29uc3RydWN0RHJhdyh0b2tlbix0aGlzLnRva2Vucyx0aGlzLm1pZFBvaW50KX1gXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwieHlheGlzXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXGRyYXcgWyR7dG9rZW4ueERpcmVjdGlvbj09PVwidXBcIj9cIi17U3RlYWx0aH1cIjpcIntTdGVhbHRofS1cIn1dKCR7ZXh0cmVtZVhZLm1pblh9LDApYFxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9YC0tKCR7ZXh0cmVtZVhZLm1heFh9LDApYFxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9dG9rZW4uWG5vZGU/YG5vZGUgWyR7dG9rZW4uWGZvcm1hdHRpbmcuc3Vic3RyaW5nKDEsdG9rZW4uWGZvcm1hdHRpbmcubGVuZ3RoLTEpfV0geyR7dG9rZW4uWG5vZGV9fTtgOlwiO1wiXHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXGRyYXcgWyR7dG9rZW4ueURpcmVjdGlvbj09PVwidXBcIj9cIi17U3RlYWx0aH1cIjpcIntTdGVhbHRofS1cIn1dKCR7ZXh0cmVtZVhZLm1pbll9LDApYFxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9YC0tKDAsJHtleHRyZW1lWFkubWF4WX0pYFxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9dG9rZW4uWW5vZGU/YG5vZGUgWyR7dG9rZW4uWWZvcm1hdHRpbmcuc3Vic3RyaW5nKDEsdG9rZW4uWWZvcm1hdHRpbmcubGVuZ3RoLTEpfV0geyR7dG9rZW4uWW5vZGV9fTtgOlwiO1wiXHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiZ3JpZFwiOlxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9YFxcXFxkcmF3IFtdICgke2V4dHJlbWVYWS5taW5YfSwke2V4dHJlbWVYWS5taW5ZfSkgZ3JpZCBbcm90YXRlPSR7dG9rZW4/LnJvdGF0ZXx8MH0seHN0ZXA9Ljc1Y20seXN0ZXA9Ljc1Y21dICgke2V4dHJlbWVYWS5tYXhYfSwke2V4dHJlbWVYWS5tYXhZfSk7YFxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImNpcmNsZVwiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRlbXA9Y2FsY3VsYXRlQ2lyY2xlKHRva2VuLmNvb3JkaW5hdGVzWzBdLHRva2VuLmNvb3JkaW5hdGVzWzFdLHRva2VuLmNvb3JkaW5hdGVzWzJdKVxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9YFxcXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCwke3Rva2VuLmZvcm1hdHRpbmd9XSAoJHt0ZW1wPy5jZW50ZXIuWH0sJHt0ZW1wPy5jZW50ZXIuWX0pIGNpcmNsZSBbcmFkaXVzPSR7dGVtcD8ucmFkaXVzfV07YFxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm1hc3NcIjpcclxuICAgICAgICAgICAgICAgICAgICB0ZW1wPXRva2VuLmZvcm1hdHRpbmchPT1udWxsP3Rva2VuLmZvcm1hdHRpbmc9PT1cIi18XCI/XCJzb3V0aFwiOlwibm9ydGhcIjpcIm5vcnRoXCI7XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gJHt0ZW1wfSxyb3RhdGU9JHt0b2tlbi5yb3RhdGV9XSBhdCAoJHt0b2tlbi5YfSwke3Rva2VuLll9KXske3Rva2VuLnRleHR9fTtgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwidmVjXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXGRyYXcgWy17U3RlYWx0aH0sJHt0b2tlbi5mb3JtYXR0aW5nfHxcIlwifV0oJHt0b2tlbi5hbmNob3IuWH0sJHt0b2tlbi5hbmNob3IuWX0pLS1ub2RlIFtdIHske3Rva2VuLnRleHR9fSgke3Rva2VuLlgrdG9rZW4uYW5jaG9yLlh9LCR7dG9rZW4uWSt0b2tlbi5hbmNob3IuWX0pO2BcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGNvZGVCbG9ja091dHB1dDtcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRQcmVhbWJsZSgpOnN0cmluZ3tcclxuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcclxuICBcclxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXHJcbiAgXHJcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxyXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXHJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcclxuICAgIFxyXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcclxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcclxuICAgIC8vY29uc3QgbWFzcz1gXFxcXGRlZlxcXFxtYXNzIzEjMntcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCMxKXsjMn07fWBcclxuICAgIGNvbnN0IGR2ZWN0b3I9XCJcXFxcbmV3Y29tbWFuZHtcXFxcZHZlY3Rvcn1bMl17XFxcXGNvb3JkaW5hdGUgKHRlbXAxKSBhdCAoJCgwLDAgLXwgIzEpJCk7XFxcXGNvb3JkaW5hdGUgKHRlbXAyKSBhdCAoJCgwLDAgfC0gIzEpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MC43cHQsIzJdICgjMSktLSh0ZW1wMSkoIzEpLS0odGVtcDIpO31cIlxyXG4gICAgXHJcbiAgICBjb25zdCBwaWNBbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYW5nfVs1XXtcXFxcY29vcmRpbmF0ZSAoYW5nMSkgYXQgKCMxKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzIpIGF0ICgjMik7IFxcXFxjb29yZGluYXRlIChhbmczKSBhdCAoIzMpOyBcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nM317Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdDQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcxfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQUJcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXGFuZ0NCIC0gXFxcXGFuZ0FCfVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PDBwdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXHBnZm1hdGhyZXN1bHQgKyAzNjB9XFxcXGZpXFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ+MTgwcHRcXFxccGdmbWF0aHBhcnNlezM2MCAtIFxcXFxwZ2ZtYXRocmVzdWx0fVxcXFxmaVxcXFxsZXRcXFxcYW5nQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhzZXRtYWNyb3tcXFxcYW5nbGVDaGVja317YWJzKFxcXFxhbmdCIC0gOTApfVxcXFxpZnRoZW5lbHNle1xcXFxsZW5ndGh0ZXN0e1xcXFxhbmdsZUNoZWNrIHB0IDwgMC4xcHR9fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXtyaWdodCBhbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde2FuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O319XCJcclxuICAgIGNvbnN0IHByZWFtYmxlPVwiXFxcXHVzZXBhY2thZ2V7cGdmcGxvdHMsaWZ0aGVufVxcXFx1c2V0aWt6bGlicmFyeXthcnJvd3MubWV0YSxhbmdsZXMscXVvdGVzLHBvc2l0aW9uaW5nLCBjYWxjLCBpbnRlcnNlY3Rpb25zLGRlY29yYXRpb25zLm1hcmtpbmdzLG1hdGgsc3B5LG1hdHJpeCxwYXR0ZXJucyxzbmFrZXMsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcclxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGRpc3NlY3RYWWF4aXMobWF0Y2g6IGFueSkge1xyXG5sZXQgWG5vZGUgPSBcIlwiLCBZbm9kZSA9IFwiXCI7XHJcblxyXG5pZiAobWF0Y2hbMV0gJiYgbWF0Y2hbMl0pIHtcclxuICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKTtcclxuICAgIFlub2RlID0gbWF0Y2hbMl0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKTtcclxuICAgIFhub2RlPVhub2RlWzBdLnN1YnN0cmluZygxLFhub2RlLmxlbmd0aClcclxuICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcclxufVxyXG5yZXR1cm4ge1xyXG4gICAgdHlwZTogXCJ4eWF4aXNcIixcclxuICAgIFhmb3JtYXR0aW5nOiBtYXRjaFsxXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICBZZm9ybWF0dGluZzogbWF0Y2hbMl0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxyXG4gICAgeERpcmVjdGlvbjogbWF0Y2hbMV0gJiYgLy0+Ly50ZXN0KG1hdGNoWzFdKSA/IFwibGVmdFwiIDogXCJyaWdodFwiLFxyXG4gICAgeURpcmVjdGlvbjogbWF0Y2hbMl0gJiYgLy0+Ly50ZXN0KG1hdGNoWzJdKSA/IFwiZG93blwiIDogXCJ1cFwiLFxyXG4gICAgWG5vZGU6IFhub2RlLFxyXG4gICAgWW5vZGU6IFlub2RlLFxyXG59O1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZGlzc2VjdERyYXcobWF0Y2g6IGFueSwgdG9rZW5zOiBhbnkpIHtcclxuaWYgKCFtYXRjaCB8fCAhbWF0Y2hbMl0pIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoXCJJbnZhbGlkIG1hdGNoIGlucHV0LCBhYm9ydGluZyBmdW5jdGlvbi5cIik7XHJcbiAgICByZXR1cm4gbnVsbDsgXHJcbn1cclxuY29uc3QgcGF0aCA9IG1hdGNoWzJdOyBcclxuY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xyXG4vL1thLXpBLVowLTkuXFxcXHt9PlxcLVxcXFw8JFxcc10qXHJcbmNvbnN0IG5vZGVSZWdleCA9IC9bXFxzXSpub2RlW1xcc10qXFxbPyhbXFx3XFxkLFxccy49XSopXFxdP1tcXHNdKnsoW2EtekEtWjAtOS5cXFxce30+XFwtXFxcXDwkXFxzXSopfVtcXHNdKi87XHJcbmNvbnN0IGZvcm1hdHRpbmdSZWdleCA9IC9bXFxzXSooY3ljbGV8LS1jeWNsZXwtLVxcK1xcK3wtLVxcK3wtLXxjaXJjbGV8cmVjdGFuZ2xlKVtcXHNdKi87XHJcbmNvbnN0IGNvb3JkaW5hdGVSZWdleCA9IC9cXHMqXFwoKFthLXpBLVowLTksOi5cXHdcXGRdKylcXClbXFxzXSovO1xyXG5sZXQgaSA9IDAsaiA9IDA7XHJcblxyXG53aGlsZSAoaSA8IHBhdGgubGVuZ3RoICYmIGogPCAyMCkge1xyXG4gICAgaisrO1xyXG4gICAgLy9jb25zb2xlLmxvZyhjb29yZGluYXRlc0FycmF5KVxyXG4gICAgY29uc3QgY29vcmRpbmF0ZU1hdGNoPXBhdGguc2xpY2UoaSkubWF0Y2goY29vcmRpbmF0ZVJlZ2V4KVxyXG4gICAgaWYgKGNvb3JkaW5hdGVNYXRjaD8uaW5kZXg9PT0wKSB7XHJcbiAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImNvb3JkaW5hdGVcIiwgdmFsdWU6IGNvb3JkaW5hdGVNYXRjaFsxXSB9KTtcclxuICAgIGkgKz0gY29vcmRpbmF0ZU1hdGNoWzBdLmxlbmd0aDtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2g9cGF0aC5zbGljZShpKS5tYXRjaChmb3JtYXR0aW5nUmVnZXgpXHJcbiAgICBpZihmb3JtYXR0aW5nTWF0Y2g/LmluZGV4PT09MCl7XHJcbiAgICBpICs9IGZvcm1hdHRpbmdNYXRjaFswXS5sZW5ndGg7XHJcbiAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBub2RlTWF0Y2g9cGF0aC5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpXHJcbiAgICBpZihub2RlTWF0Y2g/LmluZGV4PT09MCl7XHJcbiAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcIm5vZGVcIiwgZm9ybWF0dGluZzogbm9kZU1hdGNoWzFdIHx8IFwiXCIsIHZhbHVlOiBub2RlTWF0Y2hbMl0gfSk7XHJcbiAgICBpICs9IG5vZGVNYXRjaFswXS5sZW5ndGg7IFxyXG4gICAgfVxyXG59XHJcbmlmIChqPT09MjApe1xyXG4gICAgcmV0dXJuIG1hdGNoWzBdXHJcbn1cclxuXHJcbmZvciAobGV0IGkgPSAwOyBpIDwgY29vcmRpbmF0ZXNBcnJheS5sZW5ndGg7IGkrKykge1xyXG4gICAgaWYgKGNvb3JkaW5hdGVzQXJyYXlbaV0udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcclxuICAgIGxldCBwcmV2aW91c0Zvcm1hdHRpbmcgPSB1bmRlZmluZWQ7XHJcblxyXG4gICAgaWYgKGkgPiAwICYmIGNvb3JkaW5hdGVzQXJyYXlbaSAtIDFdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XHJcbiAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gY29vcmRpbmF0ZXNBcnJheVtpIC0gMV0udmFsdWU7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChpID4gMSAmJiBjb29yZGluYXRlc0FycmF5W2kgLSAxXS50eXBlID09PSBcIm5vZGVcIiAmJiBjb29yZGluYXRlc0FycmF5W2kgLSAyXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IGNvb3JkaW5hdGVzQXJyYXlbaSAtIDJdLnZhbHVlO1xyXG4gICAgfVxyXG4gICAgY29vcmRpbmF0ZXNBcnJheS5zcGxpY2UoaSwgMSwgcGFyc2VDb29yZGluYXRlcyhjb29yZGluYXRlc0FycmF5W2ldLnZhbHVlLCB0b2tlbnMsIHByZXZpb3VzRm9ybWF0dGluZyxjb29yZGluYXRlc0FycmF5KSk7XHJcbiAgICB9XHJcbn1cclxucmV0dXJuIHtcclxuICAgIHR5cGU6IFwiZHJhd1wiLFxyXG4gICAgZm9ybWF0dGluZzogbWF0Y2hbMV0sXHJcbiAgICBjb29yZGluYXRlczogY29vcmRpbmF0ZXNBcnJheSxcclxufTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHBhcnNlQ29vcmRpbmF0ZXMoY29vcmRpbmF0ZTogYW55LCB0b2tlbnM6IGFueSwgZm9ybWF0dGluZz86IGFueSxjb29yZGluYXRlc0FycmF5PzogYW55KTogYW55IHtcclxubGV0IHhWYWx1ZSA9IG51bGwsIHlWYWx1ZSA9IG51bGwsIG5hbWU7XHJcblxyXG5jb25zdCBwYXJzZU51bWJlciA9ICh2YWx1ZTogYW55KSA9PiB7XHJcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IHZhbHVlIDogbnVtYmVyVmFsdWU7XHJcbn07XHJcbmNvbnN0IGZpbmRPcmlnaW5hbFZhbHVlID0gKHZhbHVlOiBhbnkpID0+IHtcclxuICAgIHJldHVybiB0b2tlbnMuZmluZCgodG9rZW46IGFueSkgPT4gKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwifHx0b2tlbi50eXBlID09PSBcIm5vZGVcIikgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlKTtcclxufTtcclxuXHJcbmNvbnN0IGRvdWJsZU1hdGNoUmVnZXg9L1xcJFxcKChbXFx3XFxkXFxzLSwuOiQrXSspXFwpXFwrXFwoKFtcXHdcXGRcXHMtLC46JCtdKylcXClcXCQvO1xyXG5sZXQgbWF0Y2g9Y29vcmRpbmF0ZS5tYXRjaChkb3VibGVNYXRjaFJlZ2V4KVxyXG5pZiAobWF0Y2gpe1xyXG4gICAgLy9vbnNvbGUubG9nKHBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbMV0sdG9rZW5zKSxwYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzJdLHRva2VucykpXHJcbiAgICBjb25zdCBjb29yZGluYXRlMT1wYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzFdLHRva2VucyksY29vcmRpbmF0ZTI9cGFyc2VDb29yZGluYXRlcyhtYXRjaFsyXSx0b2tlbnMpO1xyXG4gICAgW3hWYWx1ZSwgeVZhbHVlXT1bY29vcmRpbmF0ZTEuWCtjb29yZGluYXRlMi5YLGNvb3JkaW5hdGUxLlkrY29vcmRpbmF0ZTIuWV1cclxufVxyXG5jb25zdCBoYWxmTWF0Y2hSZWdleD0vXFwkXFwoKFtcXHdcXGRcXHMtLC46JCtdKylcXCkhKFtcXGRcXHMtLC46JCtdKykhXFwoKFtcXHdcXGRcXHMtLC46JCtdKylcXClcXCQvO1xyXG5tYXRjaD1jb29yZGluYXRlLm1hdGNoKGhhbGZNYXRjaFJlZ2V4KVxyXG5pZiAobWF0Y2gpe1xyXG4gICAgY29uc3QgY29vcmRpbmF0ZTE9cGFyc2VDb29yZGluYXRlcyhtYXRjaFsxXSx0b2tlbnMpLGNvb3JkaW5hdGUyPXBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbM10sdG9rZW5zKTtcclxuICAgIGNvbnN0IGhhbGZCeVZhbHVlPU51bWJlcihtYXRjaFsyXSlcclxuICAgIGlmKCFpc05hTihoYWxmQnlWYWx1ZSkpe1xyXG4gICAgICAgIFt4VmFsdWUsIHlWYWx1ZV09Wyhjb29yZGluYXRlMS5YK2Nvb3JkaW5hdGUyLlgpKmhhbGZCeVZhbHVlLChjb29yZGluYXRlMS5ZK2Nvb3JkaW5hdGUyLlkpKmhhbGZCeVZhbHVlXVxyXG4gICAgfVxyXG59XHJcbmVsc2UgaWYgKGNvb3JkaW5hdGUuaW5jbHVkZXMoXCIsXCIpKSB7XHJcbiAgICBbeFZhbHVlLCB5VmFsdWVdID0gY29vcmRpbmF0ZS5zcGxpdChcIixcIikubWFwKHBhcnNlTnVtYmVyKTtcclxufVxyXG5cclxuZWxzZSBpZiAoY29vcmRpbmF0ZS5pbmNsdWRlcyhcIjpcIikpIHtcclxuICAgIGNvbnN0IFthbmdsZSwgbGVuZ3RoXSA9IGNvb3JkaW5hdGUuc3BsaXQoXCI6XCIpLm1hcChwYXJzZUZsb2F0KTtcclxuICAgIGlmICghaXNOYU4oYW5nbGUpICYmICFpc05hTihsZW5ndGgpKSB7XHJcbiAgICBjb25zdCByYWRpYW5zID0gZGVncmVlc1RvUmFkaWFucyhhbmdsZSk7XHJcbiAgICBbeFZhbHVlLCB5VmFsdWVdID0gW2xlbmd0aCAqIE1hdGguY29zKHJhZGlhbnMpLCBsZW5ndGggKiBNYXRoLnNpbihyYWRpYW5zKV0ubWFwKHZhbCA9PiBNYXRoLmFicyh2YWwpIDwgMWUtMTAgPyAwIDogdmFsKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICBjb25zb2xlLmVycm9yKFwiSW52YWxpZCBwb2xhciBjb29yZGluYXRlczpcIiwgY29vcmRpbmF0ZSk7XHJcbiAgICB9XHJcbn1cclxuZWxzZSBpZiAoY29vcmRpbmF0ZS5pbmNsdWRlcyhcImludGVyc2VjdGlvblwiKSkge1xyXG4gICAgY29uc3Qgb3JpZ2luYWxDb29yZHMgPSBjb29yZGluYXRlXHJcbiAgICAucmVwbGFjZSgvaW50ZXJzZWN0aW9uXFxzP29mXFxzPy9nLCBcIlwiKVxyXG4gICAgLnJlcGxhY2UoLyhcXHMqYW5kXFxzP3wtLSkvZywgXCIgXCIpXHJcbiAgICAuc3BsaXQoXCIgXCIpXHJcbiAgICAubWFwKGZpbmRPcmlnaW5hbFZhbHVlKTtcclxuICAgIGNvbnN0IHNsb3BlcyA9IFtcclxuICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1swXSwgb3JpZ2luYWxDb29yZHNbMV0pLFxyXG4gICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLCBvcmlnaW5hbENvb3Jkc1szXSlcclxuICAgIF07XHJcbiAgICAoeyBYOiB4VmFsdWUsIFk6IHlWYWx1ZSB9ID0gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLCBvcmlnaW5hbENvb3Jkc1syXSwgc2xvcGVzWzBdLCBzbG9wZXNbMV0pKTtcclxufSAgXHJcbmVsc2Uge1xyXG4gICAgbmFtZSA9IGNvb3JkaW5hdGU7XHJcbiAgICBjb25zdCB0b2tlbk1hdGNoID0gZmluZE9yaWdpbmFsVmFsdWUoY29vcmRpbmF0ZSk7XHJcbiAgICBpZiAodG9rZW5NYXRjaCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICBbeFZhbHVlLCB5VmFsdWVdID0gW3BhcnNlTnVtYmVyKHRva2VuTWF0Y2guWCksIHBhcnNlTnVtYmVyKHRva2VuTWF0Y2guWSldO1xyXG4gICAgfVxyXG59XHJcbmxldCBjb29yPXtYOjAsWTowfVxyXG5pZiAoZm9ybWF0dGluZyE9PXVuZGVmaW5lZCYmY29vcmRpbmF0ZXNBcnJheS5sZW5ndGg+MCl7XHJcbiAgICBpZihmb3JtYXR0aW5nPT09XCItLStcIil7XHJcbiAgICBjb29yPWNvb3JkaW5hdGVzQXJyYXkuZmluZCgodG9rZW46IGFueSk9PiB0b2tlbi50eXBlPT09XCJjb29yZGluYXRlXCIpfHxjb29yXHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChmb3JtYXR0aW5nID09PSBcIi0tKytcIikge1xyXG4gICAgY29vciA9IGNvb3JkaW5hdGVzQXJyYXkuZmluZExhc3QoKHRva2VuOiBhbnkpID0+IHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB8fCBjb29yO1xyXG4gICAgfVxyXG59XHJcbnhWYWx1ZSs9Y29vci5YO3lWYWx1ZSs9Y29vci5ZO1xyXG5yZXR1cm4ge1xyXG4gICAgdHlwZTogXCJjb29yZGluYXRlXCIsXHJcbiAgICBYOiB4VmFsdWUsXHJcbiAgICBZOiB5VmFsdWUsXHJcbiAgICBuYW1lOiBuYW1lLFxyXG4gICAgb3JpZ2luYWw6IGNvb3JkaW5hdGUsXHJcbn07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGRpc3NlY3RDb29yZGluYXRlcyhtYXRjaDogYW55LHRva2VuczogYW55KXtcclxuY29uc3QgW2Z1bGxNYXRjaCwgcG9zaXRpb24sIGNvb3JkTmFtZSwgbGFiZWwsIGZvcm1hdHRpbmddID0gbWF0Y2g7XHJcbmNvbnN0IHsgWDogeFZhbHVlLCBZOiB5VmFsdWUgfSA9IHBhcnNlQ29vcmRpbmF0ZXMocG9zaXRpb24sIHRva2Vucyk7XHJcbnJldHVybiB7XHJcbiAgICBYOiB4VmFsdWUgIT09IHVuZGVmaW5lZCA/IHhWYWx1ZSA6IG51bGwsXHJcbiAgICBZOiB5VmFsdWUgIT09IHVuZGVmaW5lZCA/IHlWYWx1ZSA6IG51bGwsXHJcbiAgICBvcmlnaW5hbDogcG9zaXRpb24sXHJcbiAgICBjb29yZGluYXRlTmFtZTogY29vcmROYW1lIHx8IG51bGwsXHJcbiAgICBsYWJlbDogbGFiZWwgfHwgbnVsbCxcclxuICAgIGZvcm1hdHRpbmc6IGZvcm1hdHRpbmcudHJpbSgpIHx8IG51bGwsXHJcbn07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpbmRJbnRlcnNlY3Rpb25Qb2ludChjb29yZGluYXRlMTogYW55LCBjb29yZGluYXRlMjogYW55LCBzbG9wZTE6IG51bWJlciwgc2xvcGUyOiBudW1iZXIpIHtcclxuICAgIGNvbnN0IHhWYWx1ZSA9ICgoc2xvcGUyICogY29vcmRpbmF0ZTIuWCkgLSAoc2xvcGUxICogY29vcmRpbmF0ZTEuWCkgKyAoY29vcmRpbmF0ZTEuWSAtIGNvb3JkaW5hdGUyLlkpKSAvIChzbG9wZTIgLSBzbG9wZTEpO1xyXG4gICAgcmV0dXJuIHtcclxuICAgIFg6IHhWYWx1ZSwgXHJcbiAgICBZOiBjcmVhdGVMaW5lRnVuY3Rpb24oY29vcmRpbmF0ZTEsIHNsb3BlMSkoeFZhbHVlKVxyXG59O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVMaW5lRnVuY3Rpb24oY29vcmRpbmF0ZTogYW55LCBzbG9wZTogbnVtYmVyKSB7XHJcbnJldHVybiBmdW5jdGlvbih4OiBudW1iZXIpIHtcclxuICAgIHJldHVybiBzbG9wZSAqICh4IC0gY29vcmRpbmF0ZS5YKSArIGNvb3JkaW5hdGUuWTtcclxufTtcclxufVxyXG5cclxuaW50ZXJmYWNlIHRva2VuICB7XHJcblg6IG51bWJlcjtcclxuWTogbnVtYmVyO1xyXG59XHJcbmZ1bmN0aW9uIGZpbmRRdWFkcmFudCh0b2tlbjogdG9rZW4sbWlkUG9pbnQ6IGFueSl7XHJcbmlmIChtaWRQb2ludD09PW51bGwpe3JldHVybiBudWxsfVxyXG5jb25zdCB4RGlyZWN0aW9uID0gdG9rZW4uWCA+IG1pZFBvaW50LlggPyAxIDogLTE7XHJcbmNvbnN0IHlEaXJlY3Rpb24gPSB0b2tlbi5ZID4gbWlkUG9pbnQuWSA/IDEgOiAtMTtcclxucmV0dXJuIHlEaXJlY3Rpb24gPT09IDEgPyAoeERpcmVjdGlvbiA9PT0gMSA/IDEgOiAyKSA6ICh4RGlyZWN0aW9uID09PSAxID8gNCA6IDMpO1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcclxubGV0IG1heFggPSAtSW5maW5pdHk7XHJcbmxldCBtYXhZID0gLUluZmluaXR5O1xyXG5sZXQgbWluWCA9IEluZmluaXR5O1xyXG5sZXQgbWluWSA9IEluZmluaXR5O1xyXG5cclxudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgIGlmICh0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcclxuICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XHJcblxyXG4gICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcclxuICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XHJcbiAgICB9XHJcbn0pO1xyXG5cclxucmV0dXJuIHtcclxuICAgIG1heFgsbWF4WSxtaW5YLG1pblksXHJcbn07XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiByZWNvbnN0cnVjdERyYXcodG9rZW46IGFueSx0b2tlbnM6IGFueSxtaWRQb2ludDogYW55KXtcclxubGV0IHN0cmluZz1cIlwiLGJlZm9yZVRva2VuLGFmdGVyVG9rZW4sc2xvcGU7XHJcbnRva2VuLmNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICBzd2l0Y2goY29vcmRpbmF0ZS50eXBlKXtcclxuICAgIGNhc2UgXCJjb29yZGluYXRlXCI6XHJcbiAgICAgICAgaWYoY29vcmRpbmF0ZS5uYW1lKXtzdHJpbmcrPWAoJHtjb29yZGluYXRlLm5hbWV9KWA7fVxyXG4gICAgICAgIGVsc2V7c3RyaW5nKz1gKCR7Y29vcmRpbmF0ZS5YfSwke2Nvb3JkaW5hdGUuWX0pYDt9XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwibm9kZVwiOlxyXG4gICAgICAgIGFmdGVyVG9rZW49dG9rZW4uY29vcmRpbmF0ZXMuc2xpY2UoaW5kZXgpLmZpbmQoKHRva2VuOiBhbnkpPT4gdG9rZW4udHlwZT09PVwiY29vcmRpbmF0ZVwiKTtcclxuICAgICAgICBpZiAoYWZ0ZXJUb2tlbj09PXVuZGVmaW5lZCYmdG9rZW4uY29vcmRpbmF0ZXNbdG9rZW4uY29vcmRpbmF0ZXMubGVuZ3RoLTFdLnZhbHVlPT09XCJjeWNsZVwiKXtcclxuICAgICAgICBhZnRlclRva2VuPXRva2VuLmNvb3JkaW5hdGVzWzBdXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGJlZm9yZVRva2VuPXRva2VuLmNvb3JkaW5hdGVzLnNsaWNlKDAsIGluZGV4KS5yZXZlcnNlKClcclxuICAgICAgICAuZmluZCgodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpO1xyXG4gICAgICAgIHNsb3BlPWZpbmRTbG9wZShiZWZvcmVUb2tlbixhZnRlclRva2VuKVxyXG4gICAgICAgIHN0cmluZys9YG5vZGUgWyR7c2lkZU5vZGVGb3JtYXR0aW5nKGNvb3JkaW5hdGUuZm9ybWF0dGluZyxzbG9wZSxiZWZvcmVUb2tlbixhZnRlclRva2VuLG1pZFBvaW50KX1dIHske2Nvb3JkaW5hdGUudmFsdWV9fSBgXHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICBjYXNlIFwiZm9ybWF0dGluZ1wiOlxyXG4gICAgICAgIHN0cmluZys9Y29vcmRpbmF0ZS52YWx1ZTtcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxufSk7XHJcbnJldHVybiBzdHJpbmcrXCI7XCJcclxufVxyXG5mdW5jdGlvbiBmaW5kU2xvcGUoY29vcmRpbmF0ZTE6IGFueSwgY29vcmRpbmF0ZTI6IGFueSkge1xyXG5jb25zdCBkZWx0YVkgPSBjb29yZGluYXRlMi5ZIC0gY29vcmRpbmF0ZTEuWTtcclxuY29uc3QgZGVsdGFYID0gY29vcmRpbmF0ZTIuWCAtIGNvb3JkaW5hdGUxLlg7XHJcbnJldHVybiBkZWx0YVkgLyBkZWx0YVg7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNpZGVOb2RlRm9ybWF0dGluZyhmb3JtYXR0aW5nOiBzdHJpbmcsc2xvcGU6IG51bWJlcixiZWZvcmVUb2tlbjogYW55LGFmdGVyVG9rZW46IGFueSxtaWRQb2ludDogYW55KSB7XHJcbmlmIChmb3JtYXR0aW5nLm1hdGNoKC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvKSkge1xyXG4gICAgcmV0dXJuIGZvcm1hdHRpbmc7XHJcbn1cclxuZm9ybWF0dGluZys9Zm9ybWF0dGluZy5sZW5ndGg+MD9cIixcIjpcIlwiO1xyXG5cclxuY29uc3QgZWRnZTEgPSBmaW5kUXVhZHJhbnQoYmVmb3JlVG9rZW4sbWlkUG9pbnQpPy50b1N0cmluZygpfHxcIlwiO1xyXG5jb25zdCBlZGdlMiA9IGZpbmRRdWFkcmFudChhZnRlclRva2VuLG1pZFBvaW50KT8udG9TdHJpbmcoKXx8XCJcIjtcclxuXHJcbmlmIChzbG9wZSE9PUluZmluaXR5JiZzbG9wZSE9PS1JbmZpbml0eSl7XHJcbiAgICBpZiAoc2xvcGUgIT09IDApIHtcclxuICAgIGZvcm1hdHRpbmcgKz0gXCJzbG9wZWQsIFwiO1xyXG4gICAgfVxyXG4gICAgaWYgKC8oM3w0KS8udGVzdChlZGdlMSkgJiYgLygzfDQpLy50ZXN0KGVkZ2UyKSkge1xyXG4gICAgZm9ybWF0dGluZyArPSBcImJlbG93IFwiO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZiAoLygxfDIpLy50ZXN0KGVkZ2UxKSAmJiAvKDF8MikvLnRlc3QoZWRnZTIpKSB7XHJcbiAgICBmb3JtYXR0aW5nICs9IFwiYWJvdmUgXCI7XHJcbiAgICB9XHJcbn1cclxuXHJcbmlmIChzbG9wZSAhPT0gMCl7XHJcbiAgICBpZiAoLygxfDQpLy50ZXN0KGVkZ2UxKSAmJiAvKDF8NCkvLnRlc3QoZWRnZTIpKSB7XHJcbiAgICBmb3JtYXR0aW5nICs9IFwicmlnaHRcIjtcclxuICAgIH1cclxuICAgIGVsc2UgaWYoLygyfDMpLy50ZXN0KGVkZ2UxKSAmJiAvKDJ8MykvLnRlc3QoZWRnZTIpKXtcclxuICAgIGZvcm1hdHRpbmcgKz0gXCJsZWZ0XCI7XHJcbiAgICB9XHJcbn1cclxucmV0dXJuIGZvcm1hdHRpbmc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdlbmVyYXRlRm9ybWF0dGluZyhjb29yZGluYXRlOiBhbnkpe1xyXG5pZiAodHlwZW9mIGNvb3JkaW5hdGUubGFiZWwgIT09IFwic3RyaW5nXCIpeyByZXR1cm4gXCJcIjsgfVxyXG5jb25zdCBmb3JtYXR0aW5nID0gY29vcmRpbmF0ZS5mb3JtYXR0aW5nPy5zcGxpdChcIixcIikgfHwgW107XHJcbmlmIChmb3JtYXR0aW5nLnNvbWUoKHZhbHVlOiBhbnkpID0+IC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLnRlc3QodmFsdWUpKSkge1xyXG4gICAgcmV0dXJuIGNvb3JkaW5hdGUuZm9ybWF0dGluZztcclxufVxyXG5pZihmb3JtYXR0aW5nLmxlbmd0aD4wJiYhZm9ybWF0dGluZ1tmb3JtYXR0aW5nLmxlbmd0aC0xXS5lbmRzV2l0aChcIixcIikpe2Zvcm1hdHRpbmcucHVzaChcIixcIil9XHJcbnN3aXRjaChjb29yZGluYXRlLnF1YWRyYW50KXtcclxuICAgIGNhc2UgMTpcclxuICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIHJpZ2h0LCBcIik7XHJcbiAgICBicmVhaztcclxuICAgIGNhc2UgMjpcclxuICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIGxlZnQsIFwiKTtcclxuICAgIGJyZWFrO1xyXG4gICAgY2FzZSAzOlxyXG4gICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgbGVmdCwgXCIpO1xyXG4gICAgYnJlYWs7XHJcbiAgICBjYXNlIDQ6IFxyXG4gICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgcmlnaHQsIFwiKTtcclxuICAgIGJyZWFrO1xyXG59XHJcbnJldHVybiBmb3JtYXR0aW5nLmpvaW4oXCJcIik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZUNpcmNsZShwb2ludDE6IGFueSwgcG9pbnQyOiBhbnksIHBvaW50MzogYW55KSB7XHJcbmNvbnN0IHgxID0gcG9pbnQxLlgsIHkxID0gcG9pbnQxLlk7XHJcbmNvbnN0IHgyID0gcG9pbnQyLlgsIHkyID0gcG9pbnQyLlk7XHJcbmNvbnN0IHgzID0gcG9pbnQzLlgsIHkzID0gcG9pbnQzLlk7XHJcblxyXG4vLyBDYWxjdWxhdGUgdGhlIGRldGVybWluYW50cyBuZWVkZWQgZm9yIHNvbHZpbmcgdGhlIHN5c3RlbVxyXG5jb25zdCBBID0geDEgKiAoeTIgLSB5MykgLSB5MSAqICh4MiAtIHgzKSArICh4MiAqIHkzIC0geTIgKiB4Myk7XHJcbmNvbnN0IEIgPSAoeDEgKiogMiArIHkxICoqIDIpICogKHkzIC0geTIpICsgKHgyICoqIDIgKyB5MiAqKiAyKSAqICh5MSAtIHkzKSArICh4MyAqKiAyICsgeTMgKiogMikgKiAoeTIgLSB5MSk7XHJcbmNvbnN0IEMgPSAoeDEgKiogMiArIHkxICoqIDIpICogKHgyIC0geDMpICsgKHgyICoqIDIgKyB5MiAqKiAyKSAqICh4MyAtIHgxKSArICh4MyAqKiAyICsgeTMgKiogMikgKiAoeDEgLSB4Mik7XHJcbmNvbnN0IEQgPSAoeDEgKiogMiArIHkxICoqIDIpICogKHgzICogeTIgLSB4MiAqIHkzKSArICh4MiAqKiAyICsgeTIgKiogMikgKiAoeDEgKiB5MyAtIHgzICogeTEpICsgKHgzICoqIDIgKyB5MyAqKiAyKSAqICh4MiAqIHkxIC0geDEgKiB5Mik7XHJcblxyXG5pZiAoQSA9PT0gMCkge1xyXG4gICAgcmV0dXJuIG51bGw7IC8vIFRoZSBwb2ludHMgYXJlIGNvbGxpbmVhciwgbm8gdW5pcXVlIGNpcmNsZVxyXG59XHJcblxyXG4vLyBDYWxjdWxhdGUgdGhlIGNlbnRlciAoaCwgaykgb2YgdGhlIGNpcmNsZVxyXG5jb25zdCBoID0gLUIgLyAoMiAqIEEpO1xyXG5jb25zdCBrID0gLUMgLyAoMiAqIEEpO1xyXG5cclxuLy8gQ2FsY3VsYXRlIHRoZSByYWRpdXMgb2YgdGhlIGNpcmNsZVxyXG5jb25zdCByID0gTWF0aC5zcXJ0KChCICoqIDIgKyBDICoqIDIgLSA0ICogQSAqIEQpIC8gKDQgKiBBICoqIDIpKTtcclxuXHJcbnJldHVybiB7XHJcbiAgICBjZW50ZXI6IHsgWDogaCwgWTogayB9LFxyXG4gICAgcmFkaXVzOiByLFxyXG4gICAgZXF1YXRpb246IGAoeCAtICR7aC50b0ZpeGVkKDIpfSleMiArICh5IC0gJHtrLnRvRml4ZWQoMil9KV4yID0gJHtyLnRvRml4ZWQoMil9XjJgXHJcbn07XHJcbn1cclxuIl19