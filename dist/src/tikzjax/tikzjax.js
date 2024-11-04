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
        this.tokens = this.tokenize();
        this.midPoint = this.findMidpoint();
        this.tokens = this.applyQuadrants();
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
        let coordinates = this.tokens.filter((token) => token.type && token.type === "coordinate");
        if (coordinates.length === 0) {
            this.tokens = this.tokens.filter((token) => token.type && token.type === "draw");
            this.tokens.forEach((object) => {
                coordinates = coordinates.concat(object.coordinates.filter((token) => token.type && token.type === "coordinate"));
            });
        }
        let sumOfX = 0, sumOfY = 0;
        coordinates.forEach((coordinate) => {
            sumOfX += Number(coordinate.X);
            sumOfY += Number(coordinate.Y);
        });
        return {
            X: sumOfX / coordinates.length,
            Y: sumOfY / coordinates.length
        };
    }
    applyQuadrants() {
        this.tokens.forEach((token) => {
            if (typeof token === "object" && token !== null && token.type === "coordinate") {
                token.quadrant = findQuadrant(token, this.midPoint);
            }
        });
        return this.tokens;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUE0QyxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3QyxhQUFhO0FBQ2IsT0FBTyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDNUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBU2pELE1BQU0sT0FBTyxPQUFPO0lBSXBCLCtEQUErRDtJQUMzRCxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQWdJckMsbUJBQWMsR0FBRyxDQUFDLENBQVEsRUFBRSxFQUFFO1lBRTFCLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxNQUFxQixDQUFDO1lBQ3RDLElBQUksR0FBRyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUM7WUFFMUIsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRTtnQkFDN0MsR0FBRyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsQ0FBQzthQUN0QztZQUVELEdBQUcsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRTVCLEtBQUssQ0FBQyxTQUFTLEdBQUcsR0FBRyxDQUFDO1FBQzFCLENBQUMsQ0FBQTtRQTNJRCxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIs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QUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUM5RyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztJQUU1SSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDVCxPQUFPLElBQUksQ0FBQyxDQUFDLDZDQUE2QztLQUM3RDtJQUVELDRDQUE0QztJQUM1QyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUN2QixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUV2QixxQ0FBcUM7SUFDckMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRWxFLE9BQU87UUFDSCxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUU7UUFDdEIsTUFBTSxFQUFFLENBQUM7UUFDVCxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSTtLQUNwRixDQUFDO0FBQ0YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcCwgQ29tcG9uZW50LCBFZGl0b3IsIE1hcmtkb3duUmVuZGVyZXIsIE1hcmtkb3duVmlldywgV29ya3NwYWNlV2luZG93IH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCBNYXRoUGx1Z2luIGZyb20gXCJzcmMvbWFpblwiO1xyXG5pbXBvcnQgeyBvcHRpbWl6ZSB9IGZyb20gXCIuL3N2Z28uYnJvd3Nlci5qc1wiO1xyXG4vLyBAdHMtaWdub3JlXHJcbmltcG9ydCB0aWt6amF4SnMgZnJvbSBcImlubGluZTouL3Rpa3pqYXguanNcIjtcclxuaW1wb3J0IHsgZGVncmVlc1RvUmFkaWFucyB9IGZyb20gXCJzcmMvbWF0aFV0aWxpdGllcy5qc1wiO1xyXG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcclxuXHJcbmltcG9ydCB7IEVkaXRvclZpZXcgfSBmcm9tIFwiQGNvZGVtaXJyb3Ivdmlld1wiO1xyXG5cclxuaW50ZXJmYWNlIENvZGVNaXJyb3JFZGl0b3IgZXh0ZW5kcyBFZGl0b3Ige1xyXG4gICAgY206IEVkaXRvclZpZXc7XHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgVGlrempheCB7XHJcbiAgICBhcHA6IEFwcDtcclxuICAgIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuICAgIGFjdGl2ZVZpZXc6IE1hcmtkb3duVmlldyB8IG51bGw7XHJcbi8vY29uc3QgZWRpdG9yID0gYWN0aXZlVmlldz8uZWRpdG9yIGFzIENvZGVNaXJyb3JFZGl0b3IgfCBudWxsO1xyXG4gICAgY29uc3RydWN0b3IoYXBwOiBBcHAscGx1Z2luOiBNYXRoUGx1Z2luKSB7XHJcbiAgICAgIHRoaXMuYXBwPWFwcDtcclxuICAgICAgdGhpcy5hY3RpdmVWaWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcclxuICAgICAgdGhpcy5wbHVnaW49cGx1Z2luO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZWFkeUxheW91dCgpe1xyXG4gICAgICB0aGlzLnBsdWdpbi5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJ3aW5kb3ctb3BlblwiLCAod2luLCB3aW5kb3cpID0+IHtcclxuICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9KSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgXHJcbiAgICBsb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XHJcbiAgICAgICAgICBjb25zdCBzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtcclxuICAgICAgICAgIHMuaWQgPSBcInRpa3pqYXhcIjtcclxuICAgICAgICAgIHMudHlwZSA9IFwidGV4dC9qYXZhc2NyaXB0XCI7XHJcbiAgICAgICAgICBzLmlubmVyVGV4dCA9IHRpa3pqYXhKcztcclxuICAgICAgICAgIGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xyXG4gIFxyXG4gIFxyXG4gICAgICAgICAgZG9jLmFkZEV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgdW5sb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XHJcbiAgICAgICAgICBjb25zdCBzID0gZG9jLmdldEVsZW1lbnRCeUlkKFwidGlrempheFwiKTtcclxuICAgICAgICAgIHM/LnJlbW92ZSgpO1xyXG4gIFxyXG4gICAgICAgICAgZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgbG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcclxuICAgICAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgdW5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xyXG4gICAgICAgICAgICAgIHRoaXMudW5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIGdldEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgICBjb25zdCB3aW5kb3dzID0gW107XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIC8vIHB1c2ggdGhlIG1haW4gd2luZG93J3Mgcm9vdCBzcGxpdCB0byB0aGUgbGlzdFxyXG4gICAgICAgICAgd2luZG93cy5wdXNoKHRoaXMuYXBwLndvcmtzcGFjZS5yb290U3BsaXQud2luKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZSBmbG9hdGluZ1NwbGl0IGlzIHVuZG9jdW1lbnRlZFxyXG4gICAgICAgICAgY29uc3QgZmxvYXRpbmdTcGxpdCA9IHRoaXMuYXBwLndvcmtzcGFjZS5mbG9hdGluZ1NwbGl0O1xyXG4gICAgICAgICAgZmxvYXRpbmdTcGxpdC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBhIHdpbmRvdywgcHVzaCBpdCB0byB0aGUgbGlzdCBcclxuICAgICAgICAgICAgICBpZiAoY2hpbGQgaW5zdGFuY2VvZiBXb3Jrc3BhY2VXaW5kb3cpIHtcclxuICAgICAgICAgICAgICAgICAgd2luZG93cy5wdXNoKGNoaWxkLndpbik7XHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgXHJcbiAgICAgICAgICByZXR1cm4gd2luZG93cztcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgcmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCkge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihlbC5jcmVhdGVFbChcImRpdlwiKSwge1xyXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxyXG4gICAgICAgICAgICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2NyaXB0LnNldFRleHQodGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UsaWNvbikpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8gPSB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5maWx0ZXIoZWwgPT4gZWwubmFtZSAhPSBcIlRpa3pcIik7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgdGlkeVRpa3pTb3VyY2UodGlrelNvdXJjZTogc3RyaW5nLGljb246IEhUTUxFbGVtZW50KSB7XHJcblxyXG5cdFx0Y29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuXHRcdHRpa3pTb3VyY2UgPSB0aWt6U291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSB0aWt6U291cmNlLnNwbGl0KFwiXFxuXCIpO1xyXG5cdFx0bGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XHJcblx0XHRsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG5cclxuXHRcdGNvbnN0IHRpa3pqYXg9bmV3IEZvcm1hdFRpa3pqYXgobGluZXMuam9pbihcIlxcblwiKSk7XHJcbiAgICAgICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbmV3IERlYnVnTW9kYWwodGhpcy5hcHAsdGlrempheC5kZWJ1Z0luZm8pLm9wZW4oKTtcclxuXHRcdHJldHVybiB0aWt6amF4LmdldENvZGUoKTtcclxuXHQgICAgfVxyXG4gIFxyXG4gICAgICBjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICAgIHN2ZyA9IHN2Zy5yZXBsYWNlQWxsKC8oXCIjMDAwXCJ8XCJibGFja1wiKS9nLCBcIlxcXCJjdXJyZW50Q29sb3JcXFwiXCIpXHJcbiAgICAgICAgICAgICAgICAgIC5yZXBsYWNlQWxsKC8oXCIjZmZmXCJ8XCJ3aGl0ZVwiKS9nLCBcIlxcXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXFxcIlwiKTtcclxuICAgICAgICAgIHJldHVybiBzdmc7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICAgIC8vIE9wdGltaXplIHRoZSBTVkcgdXNpbmcgU1ZHT1xyXG4gICAgICAgICAgLy8gRml4ZXMgbWlzYWxpZ25lZCB0ZXh0IG5vZGVzIG9uIG1vYmlsZVxyXG4gIFxyXG4gICAgICAgICAgcmV0dXJuIG9wdGltaXplKHN2Zywge3BsdWdpbnM6XHJcbiAgICAgICAgICAgICAgW1xyXG4gICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInByZXNldC1kZWZhdWx0XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBvdmVycmlkZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW51cElEczogZmFsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICB9KT8uZGF0YTtcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgICBwb3N0UHJvY2Vzc1N2ZyA9IChlOiBFdmVudCkgPT4ge1xyXG4gIFxyXG4gICAgICAgICAgY29uc3Qgc3ZnRWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgIGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XHJcbiAgXHJcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSkge1xyXG4gICAgICAgICAgICAgIHN2ZyA9IHRoaXMuY29sb3JTVkdpbkRhcmtNb2RlKHN2Zyk7XHJcbiAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICBzdmcgPSB0aGlzLm9wdGltaXplU1ZHKHN2Zyk7XHJcbiAgXHJcbiAgICAgICAgICBzdmdFbC5vdXRlckhUTUwgPSBzdmc7XHJcbiAgICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5jbGFzcyBGb3JtYXRUaWt6amF4IHtcclxuXHRzb3VyY2U6IHN0cmluZztcclxuICAgIHRva2VuczogYW55O1xyXG4gICAgbWlkUG9pbnQ6IGFueTtcclxuXHRwcm9jZXNzZWRDb2RlPVwiXCI7XHJcbiAgICBkZWJ1Z0luZm8gPSBcIlwiO1xyXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nKSB7XHJcblx0XHR0aGlzLnNvdXJjZT1zb3VyY2U7XHJcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLnRva2VuaXplKCk7XHJcbiAgICAgICAgdGhpcy5taWRQb2ludCA9IHRoaXMuZmluZE1pZHBvaW50KCk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMgPSB0aGlzLmFwcGx5UXVhZHJhbnRzKCk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPUpTT04uc3RyaW5naWZ5KHRoaXMudG9rZW5zLG51bGwsMC4wMSkrXCJcXG5cXG5cIlxyXG4gICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnJlY29uc3RydWN0KCk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcclxuXHR9XHJcbiAgICBnZXRDb2RlKCl7XHJcbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUoKSB7XHJcbiAgICAgICAgY29uc3QgYSA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjokKCEpK10rYDtcclxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOiQoISlfXFwtXFx7fStdYDtcclxuICAgICAgICBjb25zdCBmID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOiQoISlfXFwtXFx7fStdYDtcclxuICAgICAgICAvLyBDcmVhdGUgYHRva2Vuc2AgYXJyYXkgYW5kIGRlZmluZSByZWd1bGFyIGV4cHJlc3Npb25zXHJcbiAgICAgICAgY29uc3QgdG9rZW5zID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVXNlIGBTdHJpbmcucmF3YCBmb3IgcmVnZXggcGF0dGVybnMgdG8gYXZvaWQgZG91YmxlIGVzY2FwaW5nXHJcbiAgICAgICAgY29uc3QgY29vclJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yXFx7KCR7YX0pXFx9XFx7KFtBLVphLXpcXGRdKilcXH1cXHsoW0EtWmEtelxcZF0qKVxcfVxceyhbXn1dKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFx7KFtcXHdcXGRcXHMtLC46XSspXFx9XFx7KFtBLVphLXpdKilcXH1cXHsoW0EtWmEtel0qKVxcfVxceyhbXn1dKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqXFxbbGFiZWw9XFx7XFxbKC4qPylcXF06XFxcXFxcdypcXHMqKFtcXHdcXHNdKilcXH1cXF1cXHMqXFwoKFxcdyspXFwpXFxzKmF0XFxzKlxcKFxcJD9cXCg/KFtcXHdcXGRcXHMtLC5dKylcXCk/XFwkP1xcKT87YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGRyYXdSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZHJhd1xccypcXFsoW1xcd1xcc1xcZD06LCEnOyYqW1xcXVxce1xcfSUtXSopXFxdXFxzKiguKj8pO2AsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzKHtbJ1wiXFxgXFx3XFxkLTw+XFwkLF0rfSk/KHtbJ1wiXFxgXFx3XFxkLTw+JCxdK30pP2AsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBncmlkUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGdyaWQoe1tcXGQtLl0rfSk/YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGNpcmNsZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjaXJjbGVcXHsoW1xcd1xcZFxccy0sLjpdKylcXH1cXHsoW1xcd1xcZFxccy0sLjpdKylcXH1cXHsoW1xcd1xcZFxccy0sLjpdKilcXH1cXHsoW1xcd1xcc1xcZF0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBtYXNzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG1hc3NcXHsoW1xcd1xcZFxccy0sLjokKCEpK10rKVxcfVxceygke3R9KilcXH1cXHs/KFstfD5dKik/XFx9P1xcez8oWy0uXFxzXFxkXSopP1xcfT9gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2F9KVxcfVxceygke2F9KVxcfVxceygke3R9KilcXH1cXHs/KFstfD5dKik/XFx9P2AsIFwiZ1wiKTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIHh5YXhpc1JlZ2V4LCBncmlkUmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4XTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBDb2xsZWN0IGFsbCBtYXRjaGVzIGFuZCB0aGVpciByZXNwZWN0aXZlIGluZGljZXNcclxuICAgICAgICBjb25zdCBtYXRjaGVzID0gcmVnZXhQYXR0ZXJucy5mbGF0TWFwKHBhdHRlcm4gPT4gWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKHBhdHRlcm4pXSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU29ydCBtYXRjaGVzIGJ5IHRoZWlyIGluZGV4IHRvIGVuc3VyZSBjb3JyZWN0IG9yZGVyXHJcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiAoYS5pbmRleCB8fCAwKSAtIChiLmluZGV4IHx8IDApKTtcclxuICAgICAgXHJcbiAgICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XHJcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCAmJiBtYXRjaC5pbmRleCA+IGN1cnJlbnRJbmRleCkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAgICAgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vclwiKSkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7dHlwZTogXCJjb29yZGluYXRlXCIsIC4uLmRpc3NlY3RDb29yZGluYXRlcyhtYXRjaCwgdG9rZW5zKX0pO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcclxuICAgICAgICAgICAgdG9rZW5zLnB1c2goZGlzc2VjdERyYXcobWF0Y2gsIHRva2VucykpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHh5YXhpc1wiKSkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaChkaXNzZWN0WFlheGlzKG1hdGNoKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XHJcbiAgICAgICAgICAgIHRva2Vucy5wdXNoKHt0eXBlOiBcIm5vZGVcIiwgLi4uZGlzc2VjdENvb3JkaW5hdGVzKG1hdGNoLCB0b2tlbnMpfSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7XHJcbiAgICAgICAgICAgIHRva2Vucy5wdXNoKHtcclxuICAgICAgICAgICAgICB0eXBlOiBcImNpcmNsZVwiLFxyXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdLFxyXG4gICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbXHJcbiAgICAgICAgICAgICAgICBwYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzFdLCB0b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgcGFyc2VDb29yZGluYXRlcyhtYXRjaFsyXSwgdG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIHBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbM10sIHRva2VucyksXHJcbiAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xyXG4gICAgICAgICAgICB0b2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgdHlwZTogXCJtYXNzXCIsXHJcbiAgICAgICAgICAgICAgdGV4dDogbWF0Y2hbMl0gfHwgXCJcIixcclxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFszXSB8fCBudWxsLFxyXG4gICAgICAgICAgICAgIHJvdGF0ZTogTnVtYmVyKG1hdGNoWzRdKSB8fCAwLFxyXG4gICAgICAgICAgICAgIC4uLigoeyBYLCBZIH0pID0+ICh7IFgsIFkgfSkpKHBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbMV0sIHRva2VucykpLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcclxuICAgICAgICAgICAgdG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAgIHR5cGU6IFwidmVjXCIsXHJcbiAgICAgICAgICAgICAgdGV4dDogbWF0Y2hbM10gfHwgXCJcIixcclxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSB8fCBudWxsLFxyXG4gICAgICAgICAgICAgIHJvdGF0ZTogTnVtYmVyKG1hdGNoWzVdKSB8fCAwLFxyXG4gICAgICAgICAgICAgIGFuY2hvcjp7Li4uKCh7IFgsIFkgfSkgPT4gKHsgWCwgWSB9KSkocGFyc2VDb29yZGluYXRlcyhtYXRjaFsxXSwgdG9rZW5zKSksfSxcclxuICAgICAgICAgICAgICAuLi4oKHsgWCwgWSB9KSA9PiAoeyBYLCBZIH0pKShwYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzJdLCB0b2tlbnMpKSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICBcclxuICAgICAgICBpZiAoY3VycmVudEluZGV4IDwgdGhpcy5zb3VyY2UubGVuZ3RoKSB7XHJcbiAgICAgICAgICB0b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcclxuICAgICAgICB9XHJcbiAgICAgIFxyXG4gICAgICAgIHJldHVybiB0b2tlbnM7XHJcbiAgICB9XHJcblxyXG4gICAgZmluZE1pZHBvaW50KCkge1xyXG4gICAgICAgIGxldCBjb29yZGluYXRlcyA9IHRoaXMudG9rZW5zLmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSAmJiB0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGNvb3JkaW5hdGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2VucyA9IHRoaXMudG9rZW5zLmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSAmJiB0b2tlbi50eXBlID09PSBcImRyYXdcIik7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKG9iamVjdDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGNvb3JkaW5hdGVzID0gY29vcmRpbmF0ZXMuY29uY2F0KG9iamVjdC5jb29yZGluYXRlcy5maWx0ZXIoKHRva2VuOiBhbnkpID0+IHRva2VuLnR5cGUgJiYgdG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpKTtcclxuICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBsZXQgc3VtT2ZYID0gMCwgc3VtT2ZZID0gMDtcclxuICAgICAgICBjb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnkpID0+IHtcclxuICAgICAgICAgIHN1bU9mWCArPSBOdW1iZXIoY29vcmRpbmF0ZS5YKTtcclxuICAgICAgICAgIHN1bU9mWSArPSBOdW1iZXIoY29vcmRpbmF0ZS5ZKTsgXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIFxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICBYOiBzdW1PZlggLyBjb29yZGluYXRlcy5sZW5ndGgsXHJcbiAgICAgICAgICBZOiBzdW1PZlkgLyBjb29yZGluYXRlcy5sZW5ndGhcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgYXBwbHlRdWFkcmFudHMoKSB7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gXCJvYmplY3RcIiAmJiB0b2tlbiAhPT0gbnVsbCYmdG9rZW4udHlwZT09PVwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICAgICAgICAgIHRva2VuLnF1YWRyYW50ID0gZmluZFF1YWRyYW50KHRva2VuLHRoaXMubWlkUG9pbnQpXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMudG9rZW5zO1xyXG4gICAgfVxyXG4gICAgcmVjb25zdHJ1Y3QoKXtcclxuICAgICAgICBsZXQgY29kZUJsb2NrT3V0cHV0ID0gXCJcIix0ZW1wOiBzdHJpbmcgfCB7IGNlbnRlcjogeyBYOiBudW1iZXI7IFk6IG51bWJlcjsgfTsgcmFkaXVzOiBudW1iZXI7IGVxdWF0aW9uOiBzdHJpbmc7IH0gfCBudWxsO1xyXG4gICAgICAgIGNvbnN0IGV4dHJlbWVYWT1nZXRFeHRyZW1lWFkodGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgdG9rZW4gPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICAgICAgc3dpdGNoKHRva2VuLnR5cGUpe1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImNvb3JkaW5hdGVcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gYFxcXFxjb29yeyR7dG9rZW4uWH0sJHt0b2tlbi5ZfX17JHt0b2tlbi5jb29yZGluYXRlTmFtZSB8fCBcIlwifX17JHt0b2tlbi5sYWJlbCB8fCBcIlwifX17JHtnZW5lcmF0ZUZvcm1hdHRpbmcodG9rZW4pfHxcIlwifX1gO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcIm5vZGVcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gYFxcXFxub2RlICgke3Rva2VuLmNvb3JkaW5hdGVOYW1lfSkgYXQgKCR7dG9rZW4uWH0sJHt0b2tlbi5ZfSkgWyR7Z2VuZXJhdGVGb3JtYXR0aW5nKHRva2VuKX1dIHske3Rva2VuLmxhYmVsfX07YDtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJkcmF3XCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXGRyYXcgWyR7dG9rZW4uZm9ybWF0dGluZ31dICR7cmVjb25zdHJ1Y3REcmF3KHRva2VuLHRoaXMudG9rZW5zLHRoaXMubWlkUG9pbnQpfWBcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJ4eWF4aXNcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbJHt0b2tlbi54RGlyZWN0aW9uPT09XCJ1cFwiP1wiLXtTdGVhbHRofVwiOlwie1N0ZWFsdGh9LVwifV0oJHtleHRyZW1lWFkubWluWH0sMClgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gLS0oJHtleHRyZW1lWFkubWF4WH0sMClgXHJcbiAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz10b2tlbi5Ybm9kZT9gbm9kZSBbJHt0b2tlbi5YZm9ybWF0dGluZy5zdWJzdHJpbmcoMSx0b2tlbi5YZm9ybWF0dGluZy5sZW5ndGgtMSl9XSB7JHt0b2tlbi5Ybm9kZX19O2A6XCI7XCJcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbJHt0b2tlbi55RGlyZWN0aW9uPT09XCJ1cFwiP1wiLXtTdGVhbHRofVwiOlwie1N0ZWFsdGh9LVwifV0oJHtleHRyZW1lWFkubWluWX0sMClgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gLS0oMCwke2V4dHJlbWVYWS5tYXhZfSlgXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz10b2tlbi5Zbm9kZT9gbm9kZSBbJHt0b2tlbi5ZZm9ybWF0dGluZy5zdWJzdHJpbmcoMSx0b2tlbi5ZZm9ybWF0dGluZy5sZW5ndGgtMSl9XSB7JHt0b2tlbi5Zbm9kZX19O2A6XCI7XCJcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJncmlkXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXGRyYXcgW10gKCR7ZXh0cmVtZVhZLm1pblh9LCR7ZXh0cmVtZVhZLm1pbll9KSBncmlkIFtyb3RhdGU9JHt0b2tlbj8ucm90YXRlfHwwfSx4c3RlcD0uNzVjbSx5c3RlcD0uNzVjbV0gKCR7ZXh0cmVtZVhZLm1heFh9LCR7ZXh0cmVtZVhZLm1heFl9KTtgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiY2lyY2xlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgdGVtcD1jYWxjdWxhdGVDaXJjbGUodG9rZW4uY29vcmRpbmF0ZXNbMF0sdG9rZW4uY29vcmRpbmF0ZXNbMV0sdG9rZW4uY29vcmRpbmF0ZXNbMl0pXHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0Kz1gXFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LCR7dG9rZW4uZm9ybWF0dGluZ31dICgke3RlbXA/LmNlbnRlci5YfSwke3RlbXA/LmNlbnRlci5ZfSkgY2lyY2xlIFtyYWRpdXM9JHt0ZW1wPy5yYWRpdXN9XTtgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwibWFzc1wiOlxyXG4gICAgICAgICAgICAgICAgICAgIHRlbXA9dG9rZW4uZm9ybWF0dGluZyE9PW51bGw/dG9rZW4uZm9ybWF0dGluZz09PVwiLXxcIj9cInNvdXRoXCI6XCJub3J0aFwiOlwibm9ydGhcIjtcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSAke3RlbXB9LHJvdGF0ZT0ke3Rva2VuLnJvdGF0ZX1dIGF0ICgke3Rva2VuLlh9LCR7dG9rZW4uWX0peyR7dG9rZW4udGV4dH19O2BcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbLXtTdGVhbHRofSwke3Rva2VuLmZvcm1hdHRpbmd8fFwiXCJ9XSgke3Rva2VuLmFuY2hvci5YfSwke3Rva2VuLmFuY2hvci5ZfSktLW5vZGUgW10geyR7dG9rZW4udGV4dH19KCR7dG9rZW4uWCt0b2tlbi5hbmNob3IuWH0sJHt0b2tlbi5ZK3Rva2VuLmFuY2hvci5ZfSk7YFxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldFByZWFtYmxlKCk6c3RyaW5ne1xyXG4gICAgY29uc3QgYW5nPVwiXFxcXHRpa3pzZXR7YW5nLy5zdHlsZSAyIGFyZ3M9e2ZpbGw9YmxhY2shNTAsb3BhY2l0eT0wLjUsdGV4dCBvcGFjaXR5PTAuOSxkcmF3PW9yYW5nZSw8LT4sYW5nbGUgZWNjZW50cmljaXR5PSMxLGFuZ2xlIHJhZGl1cz0jMmNtLHRleHQ9b3JhbmdlLGZvbnQ9XFxcXGxhcmdlfSxhbmcvLmRlZmF1bHQ9ezEuNn17MC41fX1cIlxyXG4gIFxyXG4gICAgY29uc3QgbWFyaz1cIlxcXFxkZWZcXFxcbWFyayMxIzIjM3tcXFxccGF0aCBbZGVjb3JhdGlvbj17bWFya2luZ3MsIG1hcms9YXQgcG9zaXRpb24gMC41IHdpdGgge1xcXFxmb3JlYWNoIFxcXFx4IGluIHsjMX0geyBcXFxcZHJhd1tsaW5lIHdpZHRoPTFwdF0gKFxcXFx4LC0zcHQpIC0tIChcXFxceCwzcHQpOyB9fX0sIHBvc3RhY3Rpb249ZGVjb3JhdGVdICgjMikgLS0gKCMzKTt9XCJcclxuICBcclxuICAgIGNvbnN0IGFycj1cIlxcXFxuZXdjb21tYW5ke1xcXFxhcnJ9Wzhde1xcXFxjb29yZGluYXRlICgyKSBhdCAoJCgjMikhIzchKCMzKSQpO1xcXFxjb29yZGluYXRlICgxKSBhdCAoJCgyKSEjNW1tITkwOigjMykkKTtcXFxcY29vcmRpbmF0ZSAoMykgYXQgKCQoMikhIzVtbSsjNGNtISM4OigjMykkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0xcHQsPC1dICgxKS0tKDMpbm9kZSBbcG9zPSM2XSB7XFxcXGxhcmdlICMxfTt9XCIgXHJcbiAgICBjb25zdCBsZW5lPVwiXFxcXGRlZlxcXFxjb3IjMSMyIzMjNCM1e1xcXFxjb29yZGluYXRlICgjMSkgYXQoJCgjMikhIzMhIzQ6KCM1KSQpO31cXFxcZGVmXFxcXGRyIzEjMntcXFxcZHJhdyBbbGluZSB3aWR0aD0jMSxdIzI7fVxcXFxuZXdjb21tYW5ke1xcXFxsZW59WzZde1xcXFxjb3J7MX17IzJ9eyMzfXs5MH17IzR9XFxcXGNvcnszfXsjNH17IzN9ey05MH17IzJ9XFxcXG5vZGUgKDIpIGF0ICgkKDEpITAuNSEoMykkKSBbcm90YXRlPSM2XXtcXFxcbGFyZ2UgIzF9O1xcXFxkcnsjNXB0LHw8LX17KDEpLS0oMil9XFxcXGRyeyM1cHQsLT58fXsoMiktLSgzKX19XCJcclxuICAgIGNvbnN0IHNwcmluZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxzcHJpbmd9WzRde1xcXFx0aWt6bWF0aHtjb29yZGluYXRlIFxcXFxzdGFydCwgXFxcXGRvbmU7XFxcXHN0YXJ0ID0gKCMxKTtcXFxcZG9uZSA9ICgjMik7fVxcXFxkcmF3W3RoaWNrXSAoJChcXFxcc3RhcnQpICsgKC0xLjUsMCkkKSAtLSsrKDMsMCk7XFxcXGRyYXcgKFxcXFxzdGFydCkgLS0rICgwLC0wLjI1Y20pO1xcXFxkcmF3ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4KzBjbSxcXFxcZG9uZXkrMC4yNWNtKSQpLS0rKDAsLTAuMjUpO1xcXFxkcmF3W2RlY29yYXRpb249e2FzcGVjdD0wLjMsIHNlZ21lbnQgbGVuZ3RoPTMsIGFtcGxpdHVkZT0ybW0sY29pbCx9LGRlY29yYXRlXSAoXFxcXHN0YXJ0eCxcXFxcc3RhcnR5LTAuMjVjbSkgLS0oJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkrMC4yNWNtKSQpbm9kZVttaWR3YXkscmlnaHQ9MC4yNWNtLGJsYWNrXXsjNH07XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSkkKXsjM307fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHRyZWU9XCJcXFxcbmV3Y29tbWFuZHtcXFxcbGVudX1bM117XFxcXHRpa3pzZXR7bGV2ZWwgZGlzdGFuY2U9MjBtbSxsZXZlbCAjMS8uc3R5bGU9e3NpYmxpbmcgZGlzdGFuY2U9IzJtbSwgbm9kZXM9e2ZpbGw9cmVkISMzLGNpcmNsZSxpbm5lciBzZXA9MXB0LGRyYXc9bm9uZSx0ZXh0PWJsYWNrLH19fX1cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0YWJsZT1cIlxcXFx0aWt6c2V0eyB0YWJsZS8uc3R5bGU9e21hdHJpeCBvZiBub2Rlcyxyb3cgc2VwPS1cXFxccGdmbGluZXdpZHRoLGNvbHVtbiBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsbm9kZXM9e3JlY3RhbmdsZSxkcmF3PWJsYWNrLGFsaWduPWNlbnRlcn0sbWluaW11bSBoZWlnaHQ9MS41ZW0sdGV4dCBkZXB0aD0wLjVleCx0ZXh0IGhlaWdodD0yZXgsbm9kZXMgaW4gZW1wdHkgY2VsbHMsZXZlcnkgZXZlbiByb3cvLnN0eWxlPXtub2Rlcz17ZmlsbD1ncmF5ITYwLHRleHQ9YmxhY2ssfX0sY29sdW1uIDEvLnN0eWxlPXtub2Rlcz17dGV4dCB3aWR0aD01ZW0sZm9udD1cXFxcYmZzZXJpZXN9fSxyb3cgMS8uc3R5bGU9e25vZGVzPXtmb250PVxcXFxiZnNlcmllc319fX1cIlxyXG4gICAgY29uc3QgY29vcj1cIlxcXFxkZWZcXFxcY29vciMxIzIjMyM0e1xcXFxjb29yZGluYXRlIFtsYWJlbD17WyM0XTpcXFxcTGFyZ2UgIzN9XSAoIzIpIGF0ICgkKCMxKSQpO31cIlxyXG4gICAgLy9jb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxyXG4gICAgY29uc3QgZHZlY3Rvcj1cIlxcXFxuZXdjb21tYW5ke1xcXFxkdmVjdG9yfVsyXXtcXFxcY29vcmRpbmF0ZSAodGVtcDEpIGF0ICgkKDAsMCAtfCAjMSkkKTtcXFxcY29vcmRpbmF0ZSAodGVtcDIpIGF0ICgkKDAsMCB8LSAjMSkkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0wLjdwdCwjMl0gKCMxKS0tKHRlbXAxKSgjMSktLSh0ZW1wMik7fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxyXG4gICAgY29uc3QgcHJlYW1ibGU9XCJcXFxcdXNlcGFja2FnZXtwZ2ZwbG90cyxpZnRoZW59XFxcXHVzZXRpa3psaWJyYXJ5e2Fycm93cy5tZXRhLGFuZ2xlcyxxdW90ZXMscG9zaXRpb25pbmcsIGNhbGMsIGludGVyc2VjdGlvbnMsZGVjb3JhdGlvbnMubWFya2luZ3MsbWF0aCxzcHksbWF0cml4LHBhdHRlcm5zLHNuYWtlcyxkZWNvcmF0aW9ucy5wYXRobW9ycGhpbmcscGF0dGVybnMsc2hhZG93cyxzaGFwZXMuc3ltYm9sc31cIlxyXG4gICAgcmV0dXJuIHByZWFtYmxlK2FuZyttYXJrK2FycitsZW5lK3NwcmluZyt0cmVlK3RhYmxlK2Nvb3IrZHZlY3RvcitwaWNBbmcrXCJcXFxccGdmcGxvdHNzZXR7Y29tcGF0PTEuMTZ9XFxcXGJlZ2lue2RvY3VtZW50fVxcXFxiZWdpbnt0aWt6cGljdHVyZX1cIlxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZGlzc2VjdFhZYXhpcyhtYXRjaDogYW55KSB7XHJcbmxldCBYbm9kZSA9IFwiXCIsIFlub2RlID0gXCJcIjtcclxuXHJcbmlmIChtYXRjaFsxXSAmJiBtYXRjaFsyXSkge1xyXG4gICAgWG5vZGUgPSBtYXRjaFsxXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pO1xyXG4gICAgWW5vZGUgPSBtYXRjaFsyXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pO1xyXG4gICAgWG5vZGU9WG5vZGVbMF0uc3Vic3RyaW5nKDEsWG5vZGUubGVuZ3RoKVxyXG4gICAgWW5vZGU9WW5vZGVbMF0uc3Vic3RyaW5nKDEsWW5vZGUubGVuZ3RoKVxyXG59XHJcbnJldHVybiB7XHJcbiAgICB0eXBlOiBcInh5YXhpc1wiLFxyXG4gICAgWGZvcm1hdHRpbmc6IG1hdGNoWzFdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcclxuICAgIFlmb3JtYXR0aW5nOiBtYXRjaFsyXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICB4RGlyZWN0aW9uOiBtYXRjaFsxXSAmJiAvLT4vLnRlc3QobWF0Y2hbMV0pID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIsXHJcbiAgICB5RGlyZWN0aW9uOiBtYXRjaFsyXSAmJiAvLT4vLnRlc3QobWF0Y2hbMl0pID8gXCJkb3duXCIgOiBcInVwXCIsXHJcbiAgICBYbm9kZTogWG5vZGUsXHJcbiAgICBZbm9kZTogWW5vZGUsXHJcbn07XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBkaXNzZWN0RHJhdyhtYXRjaDogYW55LCB0b2tlbnM6IGFueSkge1xyXG5pZiAoIW1hdGNoIHx8ICFtYXRjaFsyXSkge1xyXG4gICAgY29uc29sZS5lcnJvcihcIkludmFsaWQgbWF0Y2ggaW5wdXQsIGFib3J0aW5nIGZ1bmN0aW9uLlwiKTtcclxuICAgIHJldHVybiBudWxsOyBcclxufVxyXG5jb25zdCBwYXRoID0gbWF0Y2hbMl07IFxyXG5jb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XHJcbi8vW2EtekEtWjAtOS5cXFxce30+XFwtXFxcXDwkXFxzXSpcclxuY29uc3Qgbm9kZVJlZ2V4ID0gL1tcXHNdKm5vZGVbXFxzXSpcXFs/KFtcXHdcXGQsXFxzLj1dKilcXF0/W1xcc10qeyhbYS16QS1aMC05LlxcXFx7fT5cXC1cXFxcPCRcXHNdKil9W1xcc10qLztcclxuY29uc3QgZm9ybWF0dGluZ1JlZ2V4ID0gL1tcXHNdKihjeWNsZXwtLWN5Y2xlfC0tXFwrXFwrfC0tXFwrfC0tfGNpcmNsZXxyZWN0YW5nbGUpW1xcc10qLztcclxuY29uc3QgY29vcmRpbmF0ZVJlZ2V4ID0gL1xccypcXCgoW2EtekEtWjAtOSw6Llxcd1xcZF0rKVxcKVtcXHNdKi87XHJcbmxldCBpID0gMCxqID0gMDtcclxuXHJcbndoaWxlIChpIDwgcGF0aC5sZW5ndGggJiYgaiA8IDIwKSB7XHJcbiAgICBqKys7XHJcbiAgICAvL2NvbnNvbGUubG9nKGNvb3JkaW5hdGVzQXJyYXkpXHJcbiAgICBjb25zdCBjb29yZGluYXRlTWF0Y2g9cGF0aC5zbGljZShpKS5tYXRjaChjb29yZGluYXRlUmVnZXgpXHJcbiAgICBpZiAoY29vcmRpbmF0ZU1hdGNoPy5pbmRleD09PTApIHtcclxuICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiY29vcmRpbmF0ZVwiLCB2YWx1ZTogY29vcmRpbmF0ZU1hdGNoWzFdIH0pO1xyXG4gICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGZvcm1hdHRpbmdNYXRjaD1wYXRoLnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleClcclxuICAgIGlmKGZvcm1hdHRpbmdNYXRjaD8uaW5kZXg9PT0wKXtcclxuICAgIGkgKz0gZm9ybWF0dGluZ01hdGNoWzBdLmxlbmd0aDtcclxuICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiZm9ybWF0dGluZ1wiLCB2YWx1ZTogZm9ybWF0dGluZ01hdGNoWzBdIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IG5vZGVNYXRjaD1wYXRoLnNsaWNlKGkpLm1hdGNoKG5vZGVSZWdleClcclxuICAgIGlmKG5vZGVNYXRjaD8uaW5kZXg9PT0wKXtcclxuICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwibm9kZVwiLCBmb3JtYXR0aW5nOiBub2RlTWF0Y2hbMV0gfHwgXCJcIiwgdmFsdWU6IG5vZGVNYXRjaFsyXSB9KTtcclxuICAgIGkgKz0gbm9kZU1hdGNoWzBdLmxlbmd0aDsgXHJcbiAgICB9XHJcbn1cclxuaWYgKGo9PT0yMCl7XHJcbiAgICByZXR1cm4gbWF0Y2hbMF1cclxufVxyXG5cclxuZm9yIChsZXQgaSA9IDA7IGkgPCBjb29yZGluYXRlc0FycmF5Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICBpZiAoY29vcmRpbmF0ZXNBcnJheVtpXS50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgbGV0IHByZXZpb3VzRm9ybWF0dGluZyA9IHVuZGVmaW5lZDtcclxuXHJcbiAgICBpZiAoaSA+IDAgJiYgY29vcmRpbmF0ZXNBcnJheVtpIC0gMV0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcclxuICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBjb29yZGluYXRlc0FycmF5W2kgLSAxXS52YWx1ZTtcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKGkgPiAxICYmIGNvb3JkaW5hdGVzQXJyYXlbaSAtIDFdLnR5cGUgPT09IFwibm9kZVwiICYmIGNvb3JkaW5hdGVzQXJyYXlbaSAtIDJdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XHJcbiAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gY29vcmRpbmF0ZXNBcnJheVtpIC0gMl0udmFsdWU7XHJcbiAgICB9XHJcbiAgICBjb29yZGluYXRlc0FycmF5LnNwbGljZShpLCAxLCBwYXJzZUNvb3JkaW5hdGVzKGNvb3JkaW5hdGVzQXJyYXlbaV0udmFsdWUsIHRva2VucywgcHJldmlvdXNGb3JtYXR0aW5nLGNvb3JkaW5hdGVzQXJyYXkpKTtcclxuICAgIH1cclxufVxyXG5yZXR1cm4ge1xyXG4gICAgdHlwZTogXCJkcmF3XCIsXHJcbiAgICBmb3JtYXR0aW5nOiBtYXRjaFsxXSxcclxuICAgIGNvb3JkaW5hdGVzOiBjb29yZGluYXRlc0FycmF5LFxyXG59O1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gcGFyc2VDb29yZGluYXRlcyhjb29yZGluYXRlOiBhbnksIHRva2VuczogYW55LCBmb3JtYXR0aW5nPzogYW55LGNvb3JkaW5hdGVzQXJyYXk/OiBhbnkpOiBhbnkge1xyXG5sZXQgeFZhbHVlID0gbnVsbCwgeVZhbHVlID0gbnVsbCwgbmFtZTtcclxuXHJcbmNvbnN0IHBhcnNlTnVtYmVyID0gKHZhbHVlOiBhbnkpID0+IHtcclxuICAgIGNvbnN0IG51bWJlclZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XHJcbiAgICByZXR1cm4gaXNOYU4obnVtYmVyVmFsdWUpID8gdmFsdWUgOiBudW1iZXJWYWx1ZTtcclxufTtcclxuY29uc3QgZmluZE9yaWdpbmFsVmFsdWUgPSAodmFsdWU6IGFueSkgPT4ge1xyXG4gICAgcmV0dXJuIHRva2Vucy5maW5kKCh0b2tlbjogYW55KSA9PiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCJ8fHRva2VuLnR5cGUgPT09IFwibm9kZVwiKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWUpO1xyXG59O1xyXG5cclxuY29uc3QgZG91YmxlTWF0Y2hSZWdleD0vXFwkXFwoKFtcXHdcXGRcXHMtLC46JCtdKylcXClcXCtcXCgoW1xcd1xcZFxccy0sLjokK10rKVxcKVxcJC87XHJcbmxldCBtYXRjaD1jb29yZGluYXRlLm1hdGNoKGRvdWJsZU1hdGNoUmVnZXgpXHJcbmlmIChtYXRjaCl7XHJcbiAgICAvL29uc29sZS5sb2cocGFyc2VDb29yZGluYXRlcyhtYXRjaFsxXSx0b2tlbnMpLHBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbMl0sdG9rZW5zKSlcclxuICAgIGNvbnN0IGNvb3JkaW5hdGUxPXBhcnNlQ29vcmRpbmF0ZXMobWF0Y2hbMV0sdG9rZW5zKSxjb29yZGluYXRlMj1wYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzJdLHRva2Vucyk7XHJcbiAgICBbeFZhbHVlLCB5VmFsdWVdPVtjb29yZGluYXRlMS5YK2Nvb3JkaW5hdGUyLlgsY29vcmRpbmF0ZTEuWStjb29yZGluYXRlMi5ZXVxyXG59XHJcbmNvbnN0IGhhbGZNYXRjaFJlZ2V4PS9cXCRcXCgoW1xcd1xcZFxccy0sLjokK10rKVxcKSEoW1xcZFxccy0sLjokK10rKSFcXCgoW1xcd1xcZFxccy0sLjokK10rKVxcKVxcJC87XHJcbm1hdGNoPWNvb3JkaW5hdGUubWF0Y2goaGFsZk1hdGNoUmVnZXgpXHJcbmlmIChtYXRjaCl7XHJcbiAgICBjb25zdCBjb29yZGluYXRlMT1wYXJzZUNvb3JkaW5hdGVzKG1hdGNoWzFdLHRva2VucyksY29vcmRpbmF0ZTI9cGFyc2VDb29yZGluYXRlcyhtYXRjaFszXSx0b2tlbnMpO1xyXG4gICAgY29uc3QgaGFsZkJ5VmFsdWU9TnVtYmVyKG1hdGNoWzJdKVxyXG4gICAgaWYoIWlzTmFOKGhhbGZCeVZhbHVlKSl7XHJcbiAgICAgICAgW3hWYWx1ZSwgeVZhbHVlXT1bKGNvb3JkaW5hdGUxLlgrY29vcmRpbmF0ZTIuWCkqaGFsZkJ5VmFsdWUsKGNvb3JkaW5hdGUxLlkrY29vcmRpbmF0ZTIuWSkqaGFsZkJ5VmFsdWVdXHJcbiAgICB9XHJcbn1cclxuZWxzZSBpZiAoY29vcmRpbmF0ZS5pbmNsdWRlcyhcIixcIikpIHtcclxuICAgIFt4VmFsdWUsIHlWYWx1ZV0gPSBjb29yZGluYXRlLnNwbGl0KFwiLFwiKS5tYXAocGFyc2VOdW1iZXIpO1xyXG59XHJcblxyXG5lbHNlIGlmIChjb29yZGluYXRlLmluY2x1ZGVzKFwiOlwiKSkge1xyXG4gICAgY29uc3QgW2FuZ2xlLCBsZW5ndGhdID0gY29vcmRpbmF0ZS5zcGxpdChcIjpcIikubWFwKHBhcnNlRmxvYXQpO1xyXG4gICAgaWYgKCFpc05hTihhbmdsZSkgJiYgIWlzTmFOKGxlbmd0aCkpIHtcclxuICAgIGNvbnN0IHJhZGlhbnMgPSBkZWdyZWVzVG9SYWRpYW5zKGFuZ2xlKTtcclxuICAgIFt4VmFsdWUsIHlWYWx1ZV0gPSBbbGVuZ3RoICogTWF0aC5jb3MocmFkaWFucyksIGxlbmd0aCAqIE1hdGguc2luKHJhZGlhbnMpXS5tYXAodmFsID0+IE1hdGguYWJzKHZhbCkgPCAxZS0xMCA/IDAgOiB2YWwpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoXCJJbnZhbGlkIHBvbGFyIGNvb3JkaW5hdGVzOlwiLCBjb29yZGluYXRlKTtcclxuICAgIH1cclxufVxyXG5lbHNlIGlmIChjb29yZGluYXRlLmluY2x1ZGVzKFwiaW50ZXJzZWN0aW9uXCIpKSB7XHJcbiAgICBjb25zdCBvcmlnaW5hbENvb3JkcyA9IGNvb3JkaW5hdGVcclxuICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXHJcbiAgICAucmVwbGFjZSgvKFxccyphbmRcXHM/fC0tKS9nLCBcIiBcIilcclxuICAgIC5zcGxpdChcIiBcIilcclxuICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpO1xyXG4gICAgY29uc3Qgc2xvcGVzID0gW1xyXG4gICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzBdLCBvcmlnaW5hbENvb3Jkc1sxXSksXHJcbiAgICBmaW5kU2xvcGUob3JpZ2luYWxDb29yZHNbMl0sIG9yaWdpbmFsQ29vcmRzWzNdKVxyXG4gICAgXTtcclxuICAgICh7IFg6IHhWYWx1ZSwgWTogeVZhbHVlIH0gPSBmaW5kSW50ZXJzZWN0aW9uUG9pbnQob3JpZ2luYWxDb29yZHNbMF0sIG9yaWdpbmFsQ29vcmRzWzJdLCBzbG9wZXNbMF0sIHNsb3Blc1sxXSkpO1xyXG59ICBcclxuZWxzZSB7XHJcbiAgICBuYW1lID0gY29vcmRpbmF0ZTtcclxuICAgIGNvbnN0IHRva2VuTWF0Y2ggPSBmaW5kT3JpZ2luYWxWYWx1ZShjb29yZGluYXRlKTtcclxuICAgIGlmICh0b2tlbk1hdGNoICE9PSB1bmRlZmluZWQpIHtcclxuICAgIFt4VmFsdWUsIHlWYWx1ZV0gPSBbcGFyc2VOdW1iZXIodG9rZW5NYXRjaC5YKSwgcGFyc2VOdW1iZXIodG9rZW5NYXRjaC5ZKV07XHJcbiAgICB9XHJcbn1cclxubGV0IGNvb3I9e1g6MCxZOjB9XHJcbmlmIChmb3JtYXR0aW5nIT09dW5kZWZpbmVkJiZjb29yZGluYXRlc0FycmF5Lmxlbmd0aD4wKXtcclxuICAgIGlmKGZvcm1hdHRpbmc9PT1cIi0tK1wiKXtcclxuICAgIGNvb3I9Y29vcmRpbmF0ZXNBcnJheS5maW5kKCh0b2tlbjogYW55KT0+IHRva2VuLnR5cGU9PT1cImNvb3JkaW5hdGVcIil8fGNvb3JcclxuICAgIH1cclxuICAgIGVsc2UgaWYgKGZvcm1hdHRpbmcgPT09IFwiLS0rK1wiKSB7XHJcbiAgICBjb29yID0gY29vcmRpbmF0ZXNBcnJheS5maW5kTGFzdCgodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHx8IGNvb3I7XHJcbiAgICB9XHJcbn1cclxueFZhbHVlKz1jb29yLlg7eVZhbHVlKz1jb29yLlk7XHJcbnJldHVybiB7XHJcbiAgICB0eXBlOiBcImNvb3JkaW5hdGVcIixcclxuICAgIFg6IHhWYWx1ZSxcclxuICAgIFk6IHlWYWx1ZSxcclxuICAgIG5hbWU6IG5hbWUsXHJcbiAgICBvcmlnaW5hbDogY29vcmRpbmF0ZSxcclxufTtcclxufVxyXG5cclxuZnVuY3Rpb24gZGlzc2VjdENvb3JkaW5hdGVzKG1hdGNoOiBhbnksdG9rZW5zOiBhbnkpe1xyXG5jb25zdCBbZnVsbE1hdGNoLCBwb3NpdGlvbiwgY29vcmROYW1lLCBsYWJlbCwgZm9ybWF0dGluZ10gPSBtYXRjaDtcclxuY29uc3QgeyBYOiB4VmFsdWUsIFk6IHlWYWx1ZSB9ID0gcGFyc2VDb29yZGluYXRlcyhwb3NpdGlvbiwgdG9rZW5zKTtcclxucmV0dXJuIHtcclxuICAgIFg6IHhWYWx1ZSAhPT0gdW5kZWZpbmVkID8geFZhbHVlIDogbnVsbCxcclxuICAgIFk6IHlWYWx1ZSAhPT0gdW5kZWZpbmVkID8geVZhbHVlIDogbnVsbCxcclxuICAgIG9yaWdpbmFsOiBwb3NpdGlvbixcclxuICAgIGNvb3JkaW5hdGVOYW1lOiBjb29yZE5hbWUgfHwgbnVsbCxcclxuICAgIGxhYmVsOiBsYWJlbCB8fCBudWxsLFxyXG4gICAgZm9ybWF0dGluZzogZm9ybWF0dGluZy50cmltKCkgfHwgbnVsbCxcclxufTtcclxufVxyXG5cclxuZnVuY3Rpb24gZmluZEludGVyc2VjdGlvblBvaW50KGNvb3JkaW5hdGUxOiBhbnksIGNvb3JkaW5hdGUyOiBhbnksIHNsb3BlMTogbnVtYmVyLCBzbG9wZTI6IG51bWJlcikge1xyXG4gICAgY29uc3QgeFZhbHVlID0gKChzbG9wZTIgKiBjb29yZGluYXRlMi5YKSAtIChzbG9wZTEgKiBjb29yZGluYXRlMS5YKSArIChjb29yZGluYXRlMS5ZIC0gY29vcmRpbmF0ZTIuWSkpIC8gKHNsb3BlMiAtIHNsb3BlMSk7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgWDogeFZhbHVlLCBcclxuICAgIFk6IGNyZWF0ZUxpbmVGdW5jdGlvbihjb29yZGluYXRlMSwgc2xvcGUxKSh4VmFsdWUpXHJcbn07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNyZWF0ZUxpbmVGdW5jdGlvbihjb29yZGluYXRlOiBhbnksIHNsb3BlOiBudW1iZXIpIHtcclxucmV0dXJuIGZ1bmN0aW9uKHg6IG51bWJlcikge1xyXG4gICAgcmV0dXJuIHNsb3BlICogKHggLSBjb29yZGluYXRlLlgpICsgY29vcmRpbmF0ZS5ZO1xyXG59O1xyXG59XHJcblxyXG5pbnRlcmZhY2UgdG9rZW4gIHtcclxuWDogbnVtYmVyO1xyXG5ZOiBudW1iZXI7XHJcbn1cclxuZnVuY3Rpb24gZmluZFF1YWRyYW50KHRva2VuOiB0b2tlbixtaWRQb2ludDogYW55KXtcclxuaWYgKG1pZFBvaW50PT09bnVsbCl7cmV0dXJuIG51bGx9XHJcbmNvbnN0IHhEaXJlY3Rpb24gPSB0b2tlbi5YID4gbWlkUG9pbnQuWCA/IDEgOiAtMTtcclxuY29uc3QgeURpcmVjdGlvbiA9IHRva2VuLlkgPiBtaWRQb2ludC5ZID8gMSA6IC0xO1xyXG5yZXR1cm4geURpcmVjdGlvbiA9PT0gMSA/ICh4RGlyZWN0aW9uID09PSAxID8gMSA6IDIpIDogKHhEaXJlY3Rpb24gPT09IDEgPyA0IDogMyk7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xyXG5sZXQgbWF4WCA9IC1JbmZpbml0eTtcclxubGV0IG1heFkgPSAtSW5maW5pdHk7XHJcbmxldCBtaW5YID0gSW5maW5pdHk7XHJcbmxldCBtaW5ZID0gSW5maW5pdHk7XHJcblxyXG50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgaWYgKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICBpZiAodG9rZW4uWCA+IG1heFgpIG1heFggPSB0b2tlbi5YO1xyXG4gICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcclxuXHJcbiAgICBpZiAodG9rZW4uWSA+IG1heFkpIG1heFkgPSB0b2tlbi5ZO1xyXG4gICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcclxuICAgIH1cclxufSk7XHJcblxyXG5yZXR1cm4ge1xyXG4gICAgbWF4WCxtYXhZLG1pblgsbWluWSxcclxufTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIHJlY29uc3RydWN0RHJhdyh0b2tlbjogYW55LHRva2VuczogYW55LG1pZFBvaW50OiBhbnkpe1xyXG5sZXQgc3RyaW5nPVwiXCIsYmVmb3JlVG9rZW4sYWZ0ZXJUb2tlbixzbG9wZTtcclxudG9rZW4uY29vcmRpbmF0ZXMuZm9yRWFjaCgoY29vcmRpbmF0ZTogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgIHN3aXRjaChjb29yZGluYXRlLnR5cGUpe1xyXG4gICAgY2FzZSBcImNvb3JkaW5hdGVcIjpcclxuICAgICAgICBpZihjb29yZGluYXRlLm5hbWUpe3N0cmluZys9YCgke2Nvb3JkaW5hdGUubmFtZX0pYDt9XHJcbiAgICAgICAgZWxzZXtzdHJpbmcrPWAoJHtjb29yZGluYXRlLlh9LCR7Y29vcmRpbmF0ZS5ZfSlgO31cclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJub2RlXCI6XHJcbiAgICAgICAgYWZ0ZXJUb2tlbj10b2tlbi5jb29yZGluYXRlcy5zbGljZShpbmRleCkuZmluZCgodG9rZW46IGFueSk9PiB0b2tlbi50eXBlPT09XCJjb29yZGluYXRlXCIpO1xyXG4gICAgICAgIGlmIChhZnRlclRva2VuPT09dW5kZWZpbmVkJiZ0b2tlbi5jb29yZGluYXRlc1t0b2tlbi5jb29yZGluYXRlcy5sZW5ndGgtMV0udmFsdWU9PT1cImN5Y2xlXCIpe1xyXG4gICAgICAgIGFmdGVyVG9rZW49dG9rZW4uY29vcmRpbmF0ZXNbMF1cclxuICAgICAgICB9XHJcbiAgICAgICAgYmVmb3JlVG9rZW49dG9rZW4uY29vcmRpbmF0ZXMuc2xpY2UoMCwgaW5kZXgpLnJldmVyc2UoKVxyXG4gICAgICAgIC5maW5kKCh0b2tlbjogYW55KSA9PiB0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIik7XHJcbiAgICAgICAgc2xvcGU9ZmluZFNsb3BlKGJlZm9yZVRva2VuLGFmdGVyVG9rZW4pXHJcbiAgICAgICAgc3RyaW5nKz1gbm9kZSBbJHtzaWRlTm9kZUZvcm1hdHRpbmcoY29vcmRpbmF0ZS5mb3JtYXR0aW5nLHNsb3BlLGJlZm9yZVRva2VuLGFmdGVyVG9rZW4sbWlkUG9pbnQpfV0geyR7Y29vcmRpbmF0ZS52YWx1ZX19IGBcclxuICAgICAgICBicmVhaztcclxuICAgIGNhc2UgXCJmb3JtYXR0aW5nXCI6XHJcbiAgICAgICAgc3RyaW5nKz1jb29yZGluYXRlLnZhbHVlO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG59KTtcclxucmV0dXJuIHN0cmluZytcIjtcIlxyXG59XHJcbmZ1bmN0aW9uIGZpbmRTbG9wZShjb29yZGluYXRlMTogYW55LCBjb29yZGluYXRlMjogYW55KSB7XHJcbmNvbnN0IGRlbHRhWSA9IGNvb3JkaW5hdGUyLlkgLSBjb29yZGluYXRlMS5ZO1xyXG5jb25zdCBkZWx0YVggPSBjb29yZGluYXRlMi5YIC0gY29vcmRpbmF0ZTEuWDtcclxucmV0dXJuIGRlbHRhWSAvIGRlbHRhWDtcclxufVxyXG5cclxuZnVuY3Rpb24gc2lkZU5vZGVGb3JtYXR0aW5nKGZvcm1hdHRpbmc6IHN0cmluZyxzbG9wZTogbnVtYmVyLGJlZm9yZVRva2VuOiBhbnksYWZ0ZXJUb2tlbjogYW55LG1pZFBvaW50OiBhbnkpIHtcclxuaWYgKGZvcm1hdHRpbmcubWF0Y2goLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8pKSB7XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZztcclxufVxyXG5mb3JtYXR0aW5nKz1mb3JtYXR0aW5nLmxlbmd0aD4wP1wiLFwiOlwiXCI7XHJcblxyXG5jb25zdCBlZGdlMSA9IGZpbmRRdWFkcmFudChiZWZvcmVUb2tlbixtaWRQb2ludCk/LnRvU3RyaW5nKCl8fFwiXCI7XHJcbmNvbnN0IGVkZ2UyID0gZmluZFF1YWRyYW50KGFmdGVyVG9rZW4sbWlkUG9pbnQpPy50b1N0cmluZygpfHxcIlwiO1xyXG5cclxuaWYgKHNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5KXtcclxuICAgIGlmIChzbG9wZSAhPT0gMCkge1xyXG4gICAgZm9ybWF0dGluZyArPSBcInNsb3BlZCwgXCI7XHJcbiAgICB9XHJcbiAgICBpZiAoLygzfDQpLy50ZXN0KGVkZ2UxKSAmJiAvKDN8NCkvLnRlc3QoZWRnZTIpKSB7XHJcbiAgICBmb3JtYXR0aW5nICs9IFwiYmVsb3cgXCI7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmICgvKDF8MikvLnRlc3QoZWRnZTEpICYmIC8oMXwyKS8udGVzdChlZGdlMikpIHtcclxuICAgIGZvcm1hdHRpbmcgKz0gXCJhYm92ZSBcIjtcclxuICAgIH1cclxufVxyXG5cclxuaWYgKHNsb3BlICE9PSAwKXtcclxuICAgIGlmICgvKDF8NCkvLnRlc3QoZWRnZTEpICYmIC8oMXw0KS8udGVzdChlZGdlMikpIHtcclxuICAgIGZvcm1hdHRpbmcgKz0gXCJyaWdodFwiO1xyXG4gICAgfVxyXG4gICAgZWxzZSBpZigvKDJ8MykvLnRlc3QoZWRnZTEpICYmIC8oMnwzKS8udGVzdChlZGdlMikpe1xyXG4gICAgZm9ybWF0dGluZyArPSBcImxlZnRcIjtcclxuICAgIH1cclxufVxyXG5yZXR1cm4gZm9ybWF0dGluZztcclxufVxyXG5cclxuZnVuY3Rpb24gZ2VuZXJhdGVGb3JtYXR0aW5nKGNvb3JkaW5hdGU6IGFueSl7XHJcbmlmICh0eXBlb2YgY29vcmRpbmF0ZS5sYWJlbCAhPT0gXCJzdHJpbmdcIil7IHJldHVybiBcIlwiOyB9XHJcbmNvbnN0IGZvcm1hdHRpbmcgPSBjb29yZGluYXRlLmZvcm1hdHRpbmc/LnNwbGl0KFwiLFwiKSB8fCBbXTtcclxuaWYgKGZvcm1hdHRpbmcuc29tZSgodmFsdWU6IGFueSkgPT4gLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8udGVzdCh2YWx1ZSkpKSB7XHJcbiAgICByZXR1cm4gY29vcmRpbmF0ZS5mb3JtYXR0aW5nO1xyXG59XHJcbmlmKGZvcm1hdHRpbmcubGVuZ3RoPjAmJiFmb3JtYXR0aW5nW2Zvcm1hdHRpbmcubGVuZ3RoLTFdLmVuZHNXaXRoKFwiLFwiKSl7Zm9ybWF0dGluZy5wdXNoKFwiLFwiKX1cclxuc3dpdGNoKGNvb3JkaW5hdGUucXVhZHJhbnQpe1xyXG4gICAgY2FzZSAxOlxyXG4gICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgcmlnaHQsIFwiKTtcclxuICAgIGJyZWFrO1xyXG4gICAgY2FzZSAyOlxyXG4gICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgbGVmdCwgXCIpO1xyXG4gICAgYnJlYWs7XHJcbiAgICBjYXNlIDM6XHJcbiAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyBsZWZ0LCBcIik7XHJcbiAgICBicmVhaztcclxuICAgIGNhc2UgNDogXHJcbiAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyByaWdodCwgXCIpO1xyXG4gICAgYnJlYWs7XHJcbn1cclxucmV0dXJuIGZvcm1hdHRpbmcuam9pbihcIlwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2FsY3VsYXRlQ2lyY2xlKHBvaW50MTogYW55LCBwb2ludDI6IGFueSwgcG9pbnQzOiBhbnkpIHtcclxuY29uc3QgeDEgPSBwb2ludDEuWCwgeTEgPSBwb2ludDEuWTtcclxuY29uc3QgeDIgPSBwb2ludDIuWCwgeTIgPSBwb2ludDIuWTtcclxuY29uc3QgeDMgPSBwb2ludDMuWCwgeTMgPSBwb2ludDMuWTtcclxuXHJcbi8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRzIG5lZWRlZCBmb3Igc29sdmluZyB0aGUgc3lzdGVtXHJcbmNvbnN0IEEgPSB4MSAqICh5MiAtIHkzKSAtIHkxICogKHgyIC0geDMpICsgKHgyICogeTMgLSB5MiAqIHgzKTtcclxuY29uc3QgQiA9ICh4MSAqKiAyICsgeTEgKiogMikgKiAoeTMgLSB5MikgKyAoeDIgKiogMiArIHkyICoqIDIpICogKHkxIC0geTMpICsgKHgzICoqIDIgKyB5MyAqKiAyKSAqICh5MiAtIHkxKTtcclxuY29uc3QgQyA9ICh4MSAqKiAyICsgeTEgKiogMikgKiAoeDIgLSB4MykgKyAoeDIgKiogMiArIHkyICoqIDIpICogKHgzIC0geDEpICsgKHgzICoqIDIgKyB5MyAqKiAyKSAqICh4MSAtIHgyKTtcclxuY29uc3QgRCA9ICh4MSAqKiAyICsgeTEgKiogMikgKiAoeDMgKiB5MiAtIHgyICogeTMpICsgKHgyICoqIDIgKyB5MiAqKiAyKSAqICh4MSAqIHkzIC0geDMgKiB5MSkgKyAoeDMgKiogMiArIHkzICoqIDIpICogKHgyICogeTEgLSB4MSAqIHkyKTtcclxuXHJcbmlmIChBID09PSAwKSB7XHJcbiAgICByZXR1cm4gbnVsbDsgLy8gVGhlIHBvaW50cyBhcmUgY29sbGluZWFyLCBubyB1bmlxdWUgY2lyY2xlXHJcbn1cclxuXHJcbi8vIENhbGN1bGF0ZSB0aGUgY2VudGVyIChoLCBrKSBvZiB0aGUgY2lyY2xlXHJcbmNvbnN0IGggPSAtQiAvICgyICogQSk7XHJcbmNvbnN0IGsgPSAtQyAvICgyICogQSk7XHJcblxyXG4vLyBDYWxjdWxhdGUgdGhlIHJhZGl1cyBvZiB0aGUgY2lyY2xlXHJcbmNvbnN0IHIgPSBNYXRoLnNxcnQoKEIgKiogMiArIEMgKiogMiAtIDQgKiBBICogRCkgLyAoNCAqIEEgKiogMikpO1xyXG5cclxucmV0dXJuIHtcclxuICAgIGNlbnRlcjogeyBYOiBoLCBZOiBrIH0sXHJcbiAgICByYWRpdXM6IHIsXHJcbiAgICBlcXVhdGlvbjogYCh4IC0gJHtoLnRvRml4ZWQoMil9KV4yICsgKHkgLSAke2sudG9GaXhlZCgyKX0pXjIgPSAke3IudG9GaXhlZCgyKX1eMmBcclxufTtcclxufVxyXG4iXX0=