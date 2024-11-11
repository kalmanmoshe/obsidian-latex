import { MarkdownView, WorkspaceWindow } from "obsidian";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { cartesianToPolar, findIntersectionPoint, findSlope, polarToCartesian, toNumber } from "src/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";
export class Tikzjax {
    app;
    plugin;
    activeView;
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
                const tikzjax = new FormatTikzjax(source);
                icon.onclick = () => new DebugModal(this.app, tikzjax.debugInfo).open();
                script.setText(tikzjax.getCode());
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
    colorSVGinDarkMode(svg) {
        svg = svg.replaceAll(/("#000"|"black")/g, "\"currentColor\"")
            .replaceAll(/("#fff"|"white")/g, "\"var(--background-primary)\"");
        return svg;
    }
    optimizeSVG(svg) {
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
function regExp(pattern, flags = '') {
    pattern = pattern instanceof RegExp ? pattern.source : pattern;
    return new RegExp(String.raw `${pattern}`, flags ? flags : '');
}
function getRegex() {
    const basic = String.raw `[\w\d\s-,.:]`;
    return {
        basic: basic,
        merge: String.raw `[\+\-\|!\d.]`,
        //coordinate: new RegExp(String.raw`(${basic}+|1)`),
        coordinateName: String.raw `[\w_\d\s]`,
        text: String.raw `[\w\s-,.:$(!)_+\\{}=]`,
        formatting: String.raw `[\w\s\d=:,!';&*[\]{}%-<>]`
    };
}
const parseNumber = (value) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};
function findBeforeAfterAxis(axes, index) {
    const beforeIndex = axes.slice(0, index).findLastIndex((axis) => axis instanceof Axis);
    const afterIndex = axes.findIndex((axis, idx) => axis instanceof Axis && idx > index);
    if (beforeIndex === -1 || afterIndex === -1) {
        throw new Error("Couldn't find valid Axis objects.");
    }
    if (beforeIndex === afterIndex) {
        throw new Error("Praised axis as same token");
    }
    return { before: beforeIndex, after: afterIndex };
}
export class Axis {
    cartesianX;
    cartesianY;
    polarAngle;
    polarLength;
    name;
    universal(coordinate, tokens, anchorArr, anchor) {
        const matches = this.getCoordinateMatches(coordinate);
        const coordinateArr = [];
        matches.forEach((match, index) => {
            match = match.fullMatch;
            let axis;
            switch (true) {
                case /,/.test(match):
                    axis = new Axis();
                    axis.addCartesian(match);
                    coordinateArr.push(axis);
                    break;
                case /:/.test(match):
                    axis = new Axis();
                    axis.addPolar(match);
                    axis.polarToCartesian();
                    coordinateArr.push(axis);
                    break;
                case /![\d.]+!/.test(match):
                    coordinateArr.push(match);
                    break;
                case (/[\d\w]+/).test(match):
                    if (tokens)
                        axis = tokens.findOriginalValue(match)?.axis;
                    else
                        throw new Error(`Tried to find original coordinate value while not being provided with tokens`);
                    if (axis === undefined) {
                        throw new Error(`Couldn't find the coordinate ${match} from ${coordinate}`);
                    }
                    coordinateArr.push(axis);
                    break;
                default:
                    coordinateArr.push(match);
            }
        });
        this.mergeAxis(coordinateArr);
        if (anchorArr && anchor && anchor.match(/(--\+|--\+\+)/)) {
            let a;
            if (anchor.match(/(--\+)/)) {
                a = anchorArr.find((coor) => coor instanceof Axis);
            }
            else {
                a = anchorArr.findLast((coor) => coor instanceof Axis);
            }
            this.complexCartesianAdd(a, "addition");
        }
        return this;
    }
    complexCartesianAdd(axis, mode, modifier) {
        switch (mode) {
            case "addition":
                this.cartesianX += axis.cartesianX;
                this.cartesianY += axis.cartesianY;
                break;
            case "subtraction":
                break;
            case "rightProjection":
                this.cartesianX = axis.cartesianX;
                break;
            case "internalPoint":
                this.cartesianX = (this.cartesianX + axis.cartesianX) * modifier;
                this.cartesianY = (this.cartesianY + axis.cartesianY) * modifier;
                break;
            default:
        }
        this.cartesianToPolar();
        return this;
    }
    ;
    getCoordinateMatches(coordinate) {
        const regexPattern = getRegex();
        const regexPatterns = [
            regExp(String.raw `(${regexPattern.basic}+)`, "g"),
            regExp(String.raw `(${regexPattern.merge}+)`, "g")
        ];
        // Step 1: Extract matches for each pattern separately
        const basicMatches = Array.from(coordinate.matchAll(regexPatterns[0])).map((match) => ({
            fullMatch: match[0].replace(/-$/g, ""),
            index: match.index ?? 0,
            length: match[0].length
        }));
        const mergeMatches = Array.from(coordinate.matchAll(regexPatterns[1])).map((match) => ({
            fullMatch: match[0],
            index: match.index ?? 0,
            length: match[0].length
        }));
        const matches = [];
        function isOverlapping(match1, match2) {
            return match1.index < match2.index + match2.length && match2.index < match1.index + match1.length;
        }
        [...basicMatches, ...mergeMatches].forEach(match => {
            const overlappingIndex = matches.findIndex(existingMatch => isOverlapping(existingMatch, match));
            if (overlappingIndex !== -1) {
                const existingMatch = matches[overlappingIndex];
                // If the current match covers a larger range, replace the existing one
                if (match.length > existingMatch.length) {
                    matches[overlappingIndex] = match;
                }
            }
            else {
                matches.push(match);
            }
        });
        // Step 3: Sort the final matches by index
        matches.sort((a, b) => a.index - b.index);
        // Step 4: Validate the result
        if (matches.length === 0) {
            throw new Error("Coordinate is not valid; expected a valid coordinate.");
        }
        return matches;
    }
    constructor(cartesianX, cartesianY, polarLength, polarAngle) {
        if (cartesianX !== undefined)
            this.cartesianX = cartesianX;
        if (cartesianY !== undefined)
            this.cartesianY = cartesianY;
        if (polarLength !== undefined)
            this.polarLength = polarLength;
        if (polarAngle !== undefined)
            this.polarAngle = polarAngle;
    }
    clone() {
        return new Axis(this.cartesianX, this.cartesianY, this.polarLength, this.polarAngle);
    }
    mergeAxis(axes) {
        if (!axes.some((axis) => typeof axis === "string")) {
            Object.assign(this, axes[0].clone());
            return;
        }
        for (let i = 0; i < axes.length; i++) {
            const current = axes[i];
            if (typeof current !== "string")
                continue;
            const sides = findBeforeAfterAxis(axes, i);
            const beforeAxis = axes[sides.before];
            const afterAxis = axes[sides.after];
            let match = current.match(/^\+$/);
            let mode, modifiers;
            if (match) {
                mode = "addition";
            }
            match = current.match(/^-\|$/);
            if (!mode && match) {
                mode = "rightProjection";
            }
            match = current.match(/^\!([\d.]+)\!$/);
            if (!mode && match) {
                mode = "internalPoint";
                modifiers = toNumber(match[1]);
            }
            if (mode) {
                axes.splice(sides.before, sides.after - sides.before + 1, beforeAxis.complexCartesianAdd(afterAxis, mode, modifiers));
                i = sides.before;
            }
        }
        if (axes.length === 1 && axes[0] instanceof Axis) {
            Object.assign(this, axes[0].clone());
        }
    }
    projection(axis1, axis2) {
        if (!axis1 || !axis2) {
            throw new Error("axis's were undefined at projection");
        }
        return [{ X: axis1.cartesianX, Y: axis2.cartesianY }, { X: axis2.cartesianX, Y: axis1.cartesianY }];
    }
    combine(coordinateArr) {
        let x = 0, y = 0;
        coordinateArr.forEach((coordinate) => {
            x += coordinate.cartesianX;
            y += coordinate.cartesianY;
        });
        this.cartesianX = x;
        this.cartesianY = y;
    }
    addCartesian(x, y) {
        if (!y && typeof x === "string") {
            [x, y] = x.split(",").map(Number);
        }
        if (x === undefined || y === undefined) {
            throw new Error("Invalid Cartesian coordinates provided.");
        }
        this.cartesianX = x;
        this.cartesianY = y;
    }
    polarToCartesian() {
        const temp = polarToCartesian(this.polarAngle, this.polarLength);
        this.addCartesian(temp.X, temp.Y);
    }
    cartesianToPolar() {
        const temp = cartesianToPolar(this.cartesianX, this.cartesianY);
        this.addPolar(temp.angle, temp.length);
    }
    addPolar(angle, length) {
        if (!length && typeof angle === "string") {
            [angle, length] = angle.split(":").map(Number);
        }
        if (angle === undefined || length === undefined) {
            throw new Error("Invalid polar coordinates provided.");
        }
        this.polarAngle = angle;
        this.polarLength = length;
    }
    toString() {
        return this.cartesianX + "," + this.cartesianY;
    }
    intersection(coord, findOriginalValue) {
        const originalCoords = coord
            .replace(/intersection\s?of\s?/g, "")
            .replace(/(\s*and\s?|--)/g, " ")
            .split(" ")
            .map(findOriginalValue)
            .filter((token) => token !== undefined);
        if (originalCoords.length < 4) {
            throw new Error("Intersection had undefined coordinates or insufficient data.");
        }
        const slopes = [
            findSlope(originalCoords[0].axis, originalCoords[1].axis),
            findSlope(originalCoords[2].axis, originalCoords[3].axis),
        ];
        return findIntersectionPoint(originalCoords[0].axis, originalCoords[2].axis, slopes[0], slopes[1]);
    }
}
function covort(value, convrsin) {
}
function matchKeyWithValue(key) {
    const valueMap = {
        "anchor": "anchor=",
        "rotate": "rotate=",
        "lineWidth": "line width=",
        "fill": "fill=",
        "fillOpacity": "fill opacity=",
        "textColor": "text color=",
        "draw": "draw=",
        "text": "text=",
        "pos": "pos=",
        "decorate": "decorate",
        "sloped": "sloped",
        "decoration": "decoration=",
        "decoration.brace": "brace",
        "decoration.amplitude": "amplitude="
    };
    return valueMap[key] || '';
}
export class Formatting {
    mode;
    rotate;
    anchor;
    lineWidth;
    width;
    color;
    textColor;
    fill;
    fillOpacity;
    arrow;
    draw;
    text;
    pathAttribute;
    tikzset;
    pos;
    position;
    lineStyle;
    sloped;
    decoration;
    decorate;
    quickAdd(mode, formatting, formattingForInterpretation) {
        this.mode = mode;
        this.formattingSpecificToMode();
        this.interpretFormatting(formattingForInterpretation || "");
        this.rotate = toNumber(formatting?.rotate) ?? this.rotate;
        this.anchor = formatting?.anchor?.replace(/-\|/, "south")?.replace(/\|-/, "north") ?? this.anchor;
        return this;
    }
    formattingSpecificToMode() {
        switch (this.mode) {
            case "node-mass":
                this.fill = "yellow!60";
                this.pathAttribute = "draw";
                this.text = "black";
                break;
        }
    }
    addSplopAndPosition(arr, index) {
        const beforeAfter = findBeforeAfterAxis(arr, index);
        const [before, after] = [arr[beforeAfter.before], arr[beforeAfter.after]];
        if (this.position || this.sloped) {
            return;
        }
        const edge1 = before.quadrant?.toString() || "";
        const edge2 = after.quadrant?.toString() || "";
        const slope = findSlope(edge1, edge2);
        this.sloped = slope !== 0;
        let quadrant;
        if (edge1 !== edge2)
            quadrant = edge1 + edge2;
        else
            quadrant = edge1;
        if (slope !== Infinity && slope !== -Infinity) {
            this.position = quadrant.replace(/(3|4)/, "below").replace(/(1|4)/, "above");
        }
        if (this.sloped) {
            this.position += quadrant.replace(/(2|3)/, "right").replace(/(1|4)/, "left");
        }
        // Remove unused quadrants. and Add space if two words
        this.position = this.position?.replace(/[\d]+/g, "").replace(/(below|above)(right|right)/, "$1 $2");
    }
    interpretFormatting(formatting) {
        const splitFormatting = formatting.match(/(?:{[^}]*}|[^,{}]+)+/g) || [];
        splitFormatting.forEach(formatting => {
            //console.log(formatting)
            const match = formatting.match(/^([^=]+)={(.*)}$/);
            switch (true) {
                case !!match: {
                    if (match) {
                        const [_, parent, children] = match;
                        this.interpretFormatting(children);
                    }
                    break;
                }
                case formatting.includes("linewidth"): {
                    this.split("lineWidth", formatting);
                    break;
                }
                case formatting.includes("fill="): {
                    this.split("fill", formatting);
                    break;
                }
                case formatting.includes("fillopacity"): {
                    this.split("fillOpacity", formatting);
                    break;
                }
                case !!formatting.match(/^(->|<-|-*{Stealth}-*)$/): {
                    this.arrow = formatting;
                    break;
                }
                case !!formatting.match(/^(above|below|left|right){1,2}$/): {
                    this.position = formatting.replace(/(above|below|left|right)/, "$1 ");
                    break;
                }
                case !!formatting.match(/^pos=/): {
                    this.split("pos", formatting);
                    break;
                }
                case !!formatting.match(/^draw=/): {
                    this.split("draw", formatting);
                    break;
                }
                case !!formatting.match(/^decorate$/): {
                    this.decorate = true;
                    break;
                }
                case !!formatting.match(/^text=/): {
                    this.split("text", formatting);
                    break;
                }
                case !!formatting.match(/^brace$/): {
                    this.split("decoration", true, "brace");
                    break;
                }
                case !!formatting.match(/^amplitude/):
                    this.split("decoration", formatting, "amplitude");
                    break;
                case !!formatting.match(/^draw$/):
                    this.pathAttribute = formatting;
                    break;
                case !!formatting.match(/^helplines$/):
                    this.tikzset = formatting.replace(/helplines/g, "help lines");
                    break;
                case !!formatting.match(/^(red|blue|pink|black|white|[!\d.]+){1,5}$/):
                    this.color = formatting;
                    break;
                case !!formatting.match(/^(dotted|dashed|smooth|densely|loosely){1,2}$/):
                    this.lineStyle = formatting.replace(/(densely|loosely)/, "$1 ");
                    break;
            }
        });
    }
    split(key, formatting, nestedKey) {
        let value;
        if (typeof formatting !== "boolean") {
            let match = formatting.split("=");
            // Ensure the formatting string is valid
            if (match.length < 2 || !match[1])
                return;
            // Trim any potential whitespace around the value
            const rawValue = match[1].trim();
            // Determine if the value is a number or a string
            value = !isNaN(parseFloat(rawValue)) && isFinite(+rawValue)
                ? parseFloat(rawValue)
                : rawValue;
        }
        else {
            value = formatting;
        }
        this.setProperty(key, value, nestedKey);
    }
    setProperty(key, value, nestedKey) {
        const formattingObj = this;
        if (nestedKey) {
            if (!formattingObj[key] || typeof formattingObj[key] !== 'object') {
                formattingObj[key] = {};
            }
            formattingObj[key][nestedKey] = value;
        }
        else {
            formattingObj[key] = value;
        }
    }
    toString() {
        let string = '[';
        for (const [key, value] of Object.entries(this)) {
            if (key === "mode") {
                continue;
            }
            if (typeof value === 'object') {
                string += this.handleObjectToString(value, key);
            }
            else if (value) {
                string += matchKeyWithValue(key) + (typeof value === "boolean" ? '' : value) + ',';
            }
        }
        return string + "]";
    }
    handleObjectToString(obj, parentKey) {
        let result = matchKeyWithValue(parentKey) + '{';
        for (const [key, value] of Object.entries(obj)) {
            if (value) {
                result += matchKeyWithValue(`${parentKey}.${key}`) + (typeof value === "boolean" ? '' : value) + ',';
            }
        }
        return result + "},";
    }
}
export class Coordinate {
    mode;
    axis;
    original;
    coordinateName;
    formatting;
    label;
    quadrant;
    constructor(mode, axis, original, coordinateName, formatting, label, quadrant) {
        if (mode !== undefined)
            this.mode = mode;
        if (axis !== undefined)
            this.axis = axis;
        this.original = original;
        this.coordinateName = coordinateName;
        this.formatting = formatting;
        this.label = label;
        this.quadrant = quadrant;
    }
    clone() {
        return new Coordinate(this.mode, this.axis.clone(), this.original, this.coordinateName, this.formatting, this.label, this.quadrant);
    }
    addInfo(match, mode, tokens, formatting) {
        this.mode = mode;
        ([{ original: this.original, coordinateName: this.coordinateName, label: this.label }] = [match]);
        if (this.original) {
            this.axis = new Axis().universal(this.original, tokens);
        }
        this.formatting = new Formatting();
        this.formatting.quickAdd(this.mode, formatting, match.formatting);
        return this;
    }
    toString() {
        switch (this.mode) {
            case "coordinate":
                return `\\coor{${this.axis.toString()}}{${this.coordinateName || ""}}{${this.label || ""}}{}`;
            case "node":
                return;
            case "node-inline":
                return `node ${this.formatting?.toString()} {${this.label}}`;
            case "node-mass":
                return `\\node ${this.coordinateName ? '(' + this.coordinateName + ')' : ''} at (${this.axis.toString()}) ${this.formatting?.toString()} {${this.label}};`;
            default:
                throw new Error("Couldn't find mode at to string coordinate");
                break;
        }
    }
    addQuadrant(midPoint) {
        const xDirection = this.axis.cartesianX > midPoint.cartesianX ? 1 : -1;
        const yDirection = this.axis.cartesianY > midPoint.cartesianY ? 1 : -1;
        this.quadrant = yDirection === 1 ? (xDirection === 1 ? 1 : 2) : (xDirection === 1 ? 4 : 3);
    }
}
export class Draw {
    mode;
    formatting = new Formatting();
    coordinates;
    constructor(match, tokens, mode) {
        this.mode = mode;
        this.mode = `draw${mode ? "-" + mode : ""}`;
        if (typeof match.formatting === "string")
            this.formatting.quickAdd(`draw`, {}, match.formatting);
        else
            this.formatting.quickAdd(`draw`, match.formatting, '');
        if (typeof match.draw === "string")
            this.coordinates = this.fillCoordinates(this.getSchematic(match.draw), tokens);
        else {
        }
    }
    createFromArray(arr) {
        const coordinatesArray = [];
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] instanceof Axis || arr[i] instanceof Coordinate) {
                coordinatesArray.push(arr[i]);
            }
            if (typeof arr === "string") {
                coordinatesArray.push(arr[i]);
            }
        }
        for (let i = 1; i < coordinatesArray.length; i++) {
            if (coordinatesArray[i] instanceof Coordinate) {
                let found = false;
                while (i < coordinatesArray.length && !found) {
                    i++;
                    if (typeof coordinatesArray[i] === "string") {
                        break;
                    }
                    if (coordinatesArray[i] instanceof Coordinate) {
                        found = true;
                    }
                }
                i--;
                if (found) {
                    coordinatesArray.push('--');
                }
            }
        }
        return coordinatesArray;
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
                coorArr.push(new Axis().universal(schematic[i].value, tokens, coorArr, previousFormatting));
            }
            else if (schematic[i].type === "node") {
                coorArr.push(new Coordinate().addInfo({ label: schematic[i].value, formatting: schematic[i].formatting }, "node-inline", tokens));
            }
            else {
                coorArr.push(schematic[i].value);
            }
        }
        return coorArr;
    }
    getSchematic(draw) {
        const regex = getRegex();
        const coordinatesArray = [];
        const nodeRegex = regExp(String.raw `node\s*\[(${regex.formatting}*)\]\s*{(${regex.text}*)}`);
        const formattingRegex = /(--cycle|cycle|--\+\+|--\+|--|-\||\|-|grid|circle|rectangle)/;
        const ca = String.raw `\w\d\s\-,.:`; // Define allowed characters for `ca`
        const coordinateRegex = new RegExp(String.raw `(\([${ca}]+\)|\(\$\([${ca}]+\)[${ca}!:+\-]+\([${ca}]+\)\$\))`);
        let i = 0;
        let loops = 0;
        while (i < draw.length && loops < 100) { // Increase loop limit or add condition based on parsed length
            loops++;
            const coordinateMatch = draw.slice(i).match(coordinateRegex);
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
        let result = `\\draw ${this.formatting?.toString()} `;
        let beforeToken;
        let afterToken;
        let slope;
        this.coordinates.forEach((coordinate, index) => {
            switch (true) {
                case coordinate instanceof Coordinate && coordinate.mode === "node-inline": {
                    result += coordinate.toString();
                    break;
                }
                case typeof coordinate === "string": {
                    result += /(--\+\+|--\+)/.test(coordinate) ? "--" : coordinate;
                    break;
                }
                default: {
                    result += `(${coordinate.toString()})`;
                    break;
                }
            }
        });
        return result + ";";
    }
}
export class FormatTikzjax {
    source;
    tokens = [];
    midPoint;
    processedCode = "";
    debugInfo = "";
    constructor(source) {
        if (typeof source === "string")
            this.source = this.tidyTikzSource(source);
        else
            this.tokens = source;
        this.debugInfo += this.source;
        this.tokenize();
        this.findMidpoint();
        this.applyPostProcessing();
        this.debugInfo += "\n\nthis.midPoint:\n" + JSON.stringify(this.midPoint, null, 1) + "\n";
        this.debugInfo += JSON.stringify(this.tokens, null, 1) + "\n\n";
        this.processedCode += this.reconstruct();
        this.debugInfo += this.processedCode;
    }
    tidyTikzSource(tikzSource) {
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");
        let lines = tikzSource.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "");
        ;
    }
    applyPostProcessing() {
        for (let i = 0; i < this.tokens.length; i++) {
        }
    }
    getCode() {
        return getPreamble() + this.processedCode + "\n\\end{tikzpicture}\\end{document}";
    }
    tokenize() {
        const ca = String.raw `\w\d\s-,.:|`; // Define allowed characters for `ca`
        const c = String.raw `[$(]{0,2}[${ca}]+[)$]{0,2}|\$\([${ca}]+\)[${ca}!:+]+\([${ca}]+\)\$`;
        // Define `coorRegex` with escaped characters for specific matching
        const cn = String.raw `[\w_\d\s]`; // Coordinate name
        const t = String.raw `\$[\w\d\s\-,.:(!)\-\{\}\+\\]*\$|[\w\d\s\-,.:(!)_\-\+\\]*`; // Text with specific characters
        const f = String.raw `[\w\s\d=:,!';.&*\{\}%\-<>]`; // Formatting with specific characters
        // Define `coorRegex` using escaped braces and patterns
        const coorRegex = new RegExp(String.raw `\\coor\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const nodeRegex = new RegExp(String.raw `\\node\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const se = new RegExp(String.raw `\\node\s*\(*(${cn})\)*\s*at\s*\((${c})\)\s*\[(${f}*)\]\s*\{(${t})\}`, "g");
        const ss = new RegExp(String.raw `\\coordinate\s*(\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\])?\s*\((${cn}+)\)\s*at\s*\((${c})\);`, "g");
        const drawRegex = new RegExp(String.raw `\\draw\[(${f}*)\]([^;]*);`, "g");
        const xyaxisRegex = new RegExp(String.raw `\\xyaxis{(${t})}{(${t})}`, "g");
        const gridRegex = new RegExp(String.raw `\\grid{([\d-.]+)}`, "g");
        const circleRegex = new RegExp(String.raw `\\circle\{(${c}+)\}\{(${c}+)\}\{(${c}+)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw `\\mass\{(${c})\}\{(${t})\}\{(-\||\||>){0,1}\}\{([\d.]*)\}`, "g");
        const vecRegex = new RegExp(String.raw `\\vec\{(${c})\}\{(${c})\}\{(${t})\}\{(${f}*)\}`, "g");
        const regexPatterns = [coorRegex, se, ss, nodeRegex, drawRegex, circleRegex, massRegex, vecRegex];
        let matches = [];
        regexPatterns.forEach(ab => {
            matches.push(...[...this.source.matchAll(ab)]);
        });
        matches.sort((a, b) => (a.index || 0) - (b.index || 0));
        [xyaxisRegex, gridRegex].forEach(ab => {
            matches.push(...[...this.source.matchAll(ab)]);
        });
        let currentIndex = 0;
        for (const match of matches) {
            if (match.index !== undefined && match.index > currentIndex) {
                this.tokens.push(this.source.slice(currentIndex, match.index));
            }
            if (match[0].startsWith("\\coor")) {
                let i = { original: match[1], coordinateName: match[2], label: match[3], formatting: match[4] };
                if (match[0].startsWith("\\coordinate")) {
                    Object.assign(i, { original: match[5], coordinateName: match[4], label: match[3], formatting: match[2] });
                }
                this.tokens.push(new Coordinate().addInfo(i, "coordinate", this));
            }
            else if (match[0].startsWith("\\draw")) {
                this.tokens.push(new Draw({ formatting: match[1], draw: match[2] }, this));
            }
            else if (match[0].startsWith("\\xyaxis")) {
                //this.tokens.push(dissectXYaxis(match));
            }
            else if (match[0].startsWith("\\grid")) {
                //this.tokens.push({type: "grid", rotate: match[1]});
            }
            else if (match[0].startsWith("\\node")) {
                let i = { original: match[1], coordinateName: match[3], label: match[4], formatting: match[3] };
                if (match[0].match(/\\node\s*\(/)) {
                    Object.assign(i, { original: match[2], coordinateName: match[1], label: match[3], formatting: match[4] });
                }
                this.tokens.push(new Coordinate().addInfo(i, "node", this));
            }
            else if (match[0].startsWith("\\circle")) { /*
              this.tokens.push({
                type: "circle",
                formatting: match[4],
                coordinates: [
                  new Coordinate().simpleXY(match[1], this.tokens),
                  new Coordinate().simpleXY(match[2], this.tokens),
                  new Coordinate().simpleXY(match[3], this.tokens),
                ],
              });*/
            }
            else if (match[0].startsWith("\\mass")) {
                let i = { original: match[1], label: match[2] };
                this.tokens.push(new Coordinate().addInfo(i, "node-mass", this, { anchor: match[3], rotate: match[4] }));
            }
            else if (match[0].startsWith("\\vec")) {
                match[2] = `(${match[1]})--+node[]{${match[3]}}(${match[2]})`;
                match[1] = match[4] + ',->';
                this.tokens.push(new Draw(match, this));
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
        /*let coordinates = this.tokens.filter((token: Token) => token instanceof Coordinate);
        this.tokens
        .filter((token: Token) => token instanceof Draw)
        .forEach((object: Draw) => {
            coordinates = coordinates.concat(
                object.coordinates.filter((token: any) => token instanceof Coordinate)
            );
        });
        let sumOfX = 0, sumOfY = 0;
        coordinates.forEach((coordinate: token) => {
          sumOfX += Number(coordinate.X);
          sumOfY += Number(coordinate.Y);
        });

        this.midPoint=new Axis();
        this.midPoint.addCartesian(
            sumOfX / coordinates.length!==0?coordinates.length:1
            ,sumOfY / coordinates.length!==0?coordinates.length:1
        )*/
    }
    findOriginalValue(value) {
        const og = this.tokens.slice().reverse().find((token) => (token instanceof Coordinate) && token.coordinateName === value);
        return og instanceof Coordinate ? og.clone() : undefined;
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
                switch (token.type) { /*
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
                    case "vec":
                        codeBlockOutput+=`\\draw [-{Stealth},${token.formatting||""}](${token.anchor.X},${token.anchor.Y})--node [] {${token.text}}(${token.X+token.anchor.X},${token.Y+token.anchor.Y});`
                */
                }
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
/*
function generateFormatting(coordinate: Coordinate){
    if (typeof coordinate.label !== "string"){ return ""; }
    const formatting = coordinate.formatting?.split(",") || [];
    if (formatting.some((value: string) => /(above|below|left|right)/.test(value))) {
        return coordinate.formatting;
    }
    if(formatting.length>0&&!formatting[formatting.length-1].endsWith(",")){formatting.push(",")}
    switch(coordinate.quadrant){
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
*/
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
    const preamble = "\\usepackage{pgfplots,ifthen}\\usetikzlibrary{arrows.meta,angles,quotes,positioning, calc, intersections,decorations.markings,math,spy,matrix,patterns,snakes,decorations.pathreplacing,decorations.pathmorphing,patterns,shadows,shapes.symbols}";
    return preamble + ang + mark + arr + lene + spring + tree + table + coor + dvector + picAng + "\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUE0QyxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3QyxhQUFhO0FBQ2IsT0FBTyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDNUMsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixxQkFBcUIsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDeEksT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBT2pELE1BQU0sT0FBTyxPQUFPO0lBQ2hCLEdBQUcsQ0FBTTtJQUNULE1BQU0sQ0FBYTtJQUNuQixVQUFVLENBQXNCO0lBRWhDLFlBQVksR0FBUSxFQUFDLE1BQWtCO1FBQ3JDLElBQUksQ0FBQyxHQUFHLEdBQUMsR0FBRyxDQUFDO1FBQ2IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsTUFBTSxHQUFDLE1BQU0sQ0FBQztJQUNyQixDQUFDO0lBRUQsV0FBVztRQUNULElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFO1lBQzNDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUU7Z0JBQzdFLElBQUksQ0FBQyxXQUFXLENBQUMs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QUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBO1FBQ3RFLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBRSxJQUFJLENBQUMsTUFBTSxFQUFDO1lBQUMsT0FBTTtTQUFDO1FBRXZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUUsRUFBRSxDQUFDO1FBQzlDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUUsRUFBRSxDQUFDO1FBQzdDLE1BQU0sS0FBSyxHQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUMsS0FBSyxDQUFDLENBQUE7UUFFbEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDO1FBRTFCLElBQUksUUFBUSxDQUFBO1FBQ1osSUFBSSxLQUFLLEtBQUcsS0FBSztZQUFDLFFBQVEsR0FBQyxLQUFLLEdBQUMsS0FBSyxDQUFDOztZQUNsQyxRQUFRLEdBQUMsS0FBSyxDQUFDO1FBRXBCLElBQUksS0FBSyxLQUFHLFFBQVEsSUFBRSxLQUFLLEtBQUcsQ0FBQyxRQUFRLEVBQUM7WUFDcEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFDLE9BQU8sQ0FBQyxDQUFBO1NBQzdFO1FBQ0QsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFDO1lBQ1osSUFBSSxDQUFDLFFBQVEsSUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFDLE1BQU0sQ0FBQyxDQUFBO1NBQzNFO1FBQ0Qsc0RBQXNEO1FBQ3RELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyw0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QUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQTtnQkFDeEYsSUFBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFDO29CQUNuQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBQyxFQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUMsQ0FBQyxDQUFBO2lCQUN0RztnQkFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUMsWUFBWSxFQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDakU7aUJBQU0sSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUN4QyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxFQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDekU7aUJBQU0sSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxFQUFFO2dCQUMxQyx5Q0FBeUM7YUFDMUM7aUJBQU0sSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUN4QyxxREFBcUQ7YUFDdEQ7aUJBQU0sSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxD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QUF5QixFQUFFLEVBQUUsS0FBSyxHQUF5QixFQUFFLENBQUM7SUFFdkUsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFO1FBQ3RCLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLElBQUUsRUFBRSxDQUFDO1FBQ3BELEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLElBQUUsRUFBRSxDQUFDO1FBQ3BELEtBQUssR0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDeEMsS0FBSyxHQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQTtLQUMzQztJQUVELE9BQU87UUFDSCxJQUFJLEVBQUUsUUFBUTtRQUNkLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLHdCQUF3QixFQUFFLEVBQUUsQ0FBQztRQUM1RCxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLENBQUM7UUFDNUQsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU87UUFDOUQsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDM0QsS0FBSyxFQUFFLEtBQUs7UUFDWixLQUFLLEVBQUUsS0FBSztLQUNmLENBQUM7QUFDTixDQUFDO0FBUUQsU0FBUyxZQUFZLENBQUMsTUFBVztJQUNqQyxJQUFJLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQztJQUNyQixJQUFJLElBQUksR0FBRyxDQUFDLFFBQVEsQ0FBQztJQUNyQixJQUFJLElBQUksR0FBRyxRQUFRLENBQUM7SUFDcEIsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDO0lBRXBCLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFVLEVBQUUsRUFBRTtRQUMxQixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFO1lBQ2pDLElBQUksS0FBSyxDQUFDLENBQUMsR0FBRyxJQUFJO2dCQUFFLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ25DLElBQUksS0FBSyxDQUFDLENBQUMsR0FBRyxJQUFJO2dCQUFFLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBRW5DLElBQUksS0FBSyxDQUFDLENBQUMsR0FBRyxJQUFJO2dCQUFFLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ25DLElBQUksS0FBSyxDQUFDLENBQUMsR0FBRyxJQUFJO2dCQUFFLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO1NBQ2xDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0gsSUFBSSxFQUFDLElBQUksRUFBQyxJQUFJLEVBQUMsSUFBSTtLQUN0QixDQUFDO0FBQ0YsQ0FBQztBQUtEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUF3QkU7QUFHRixTQUFTLFdBQVc7SUFDaEIsTUFBTSxHQUFHLEdBQUMsb0xBQW9MLENBQUE7SUFFOUwsTUFBTSxJQUFJLEdBQUMsNkxBQTZMLENBQUE7SUFFeE0sTUFBTSxHQUFHLEdBQUMsb05BQW9OLENBQUE7SUFDOU4sTUFBTSxJQUFJLEdBQUMsd1JBQXdSLENBQUE7SUFDblMsTUFBTSxNQUFNLEdBQUMsMGdCQUEwZ0IsQ0FBQTtJQUV2aEIsTUFBTSxJQUFJLEdBQUMsaUtBQWlLLENBQUE7SUFFNUssTUFBTSxLQUFLLEdBQUMsNldBQTZXLENBQUE7SUFDelgsTUFBTSxJQUFJLEdBQUMsK0VBQStFLENBQUE7SUFDMUYsaUdBQWlHO0lBQ2pHLE1BQU0sT0FBTyxHQUFDLHNLQUFzSyxDQUFBO0lBRXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBQ2xRLE9BQU8sUUFBUSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxpRUFBaUUsQ0FBQTtBQUM3SSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBDb21wb25lbnQsIEVkaXRvciwgTWFya2Rvd25SZW5kZXJlciwgTWFya2Rvd25WaWV3LCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcInNyYy9tYWluXCI7XHJcbmltcG9ydCB7IG9wdGltaXplIH0gZnJvbSBcIi4vc3Znby5icm93c2VyLmpzXCI7XHJcbi8vIEB0cy1pZ25vcmVcclxuaW1wb3J0IHRpa3pqYXhKcyBmcm9tIFwiaW5saW5lOi4vdGlrempheC5qc1wiO1xyXG5pbXBvcnQgeyBjYXJ0ZXNpYW5Ub1BvbGFyLCBkZWdyZWVzVG9SYWRpYW5zLCBmaW5kSW50ZXJzZWN0aW9uUG9pbnQsIGZpbmRTbG9wZSwgcG9sYXJUb0NhcnRlc2lhbiwgdG9OdW1iZXIgfSBmcm9tIFwic3JjL21hdGhVdGlsaXRpZXMuanNcIjtcclxuaW1wb3J0IHsgRGVidWdNb2RhbCB9IGZyb20gXCJzcmMvZGVzcGx5TW9kYWxzLmpzXCI7XHJcblxyXG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgZXJyb3IgfSBmcm9tIFwiY29uc29sZVwiO1xyXG5pbXBvcnQgeyBmbGF0dGVuQXJyYXkgfSBmcm9tIFwic3JjL21hdGhFbmdpbmUuanNcIjtcclxuXHJcblxyXG5leHBvcnQgY2xhc3MgVGlrempheCB7XHJcbiAgICBhcHA6IEFwcDtcclxuICAgIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuICAgIGFjdGl2ZVZpZXc6IE1hcmtkb3duVmlldyB8IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYXBwOiBBcHAscGx1Z2luOiBNYXRoUGx1Z2luKSB7XHJcbiAgICAgIHRoaXMuYXBwPWFwcDtcclxuICAgICAgdGhpcy5hY3RpdmVWaWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcclxuICAgICAgdGhpcy5wbHVnaW49cGx1Z2luO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZWFkeUxheW91dCgpe1xyXG4gICAgICB0aGlzLnBsdWdpbi5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJ3aW5kb3ctb3BlblwiLCAod2luLCB3aW5kb3cpID0+IHtcclxuICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9KSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgXHJcbiAgICBsb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XHJcbiAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgcy5pZCA9IFwidGlrempheFwiO1xyXG4gICAgICAgIHMudHlwZSA9IFwidGV4dC9qYXZhc2NyaXB0XCI7XHJcbiAgICAgICAgcy5pbm5lclRleHQgPSB0aWt6amF4SnM7XHJcbiAgICAgICAgZG9jLmJvZHkuYXBwZW5kQ2hpbGQocyk7XHJcbiAgICAgICAgZG9jLmFkZEV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XHJcbiAgICB9XHJcbiAgXHJcbiAgICB1bmxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzID0gZG9jLmdldEVsZW1lbnRCeUlkKFwidGlrempheFwiKTtcclxuICAgICAgICBzPy5yZW1vdmUoKTtcclxuXHJcbiAgICAgICAgZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XHJcbiAgICB9XHJcbiAgXHJcbiAgICBsb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcclxuICAgICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICBcclxuICAgIHVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudW5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICBcclxuICAgIGdldEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgY29uc3Qgd2luZG93cyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIHB1c2ggdGhlIG1haW4gd2luZG93J3Mgcm9vdCBzcGxpdCB0byB0aGUgbGlzdFxyXG4gICAgICAgIHdpbmRvd3MucHVzaCh0aGlzLmFwcC53b3Jrc3BhY2Uucm9vdFNwbGl0Lndpbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQHRzLWlnbm9yZSBmbG9hdGluZ1NwbGl0IGlzIHVuZG9jdW1lbnRlZFxyXG4gICAgICAgIGNvbnN0IGZsb2F0aW5nU3BsaXQgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZmxvYXRpbmdTcGxpdDtcclxuICAgICAgICBmbG9hdGluZ1NwbGl0LmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBhIHdpbmRvdywgcHVzaCBpdCB0byB0aGUgbGlzdCBcclxuICAgICAgICAgICAgaWYgKGNoaWxkIGluc3RhbmNlb2YgV29ya3NwYWNlV2luZG93KSB7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3dzLnB1c2goY2hpbGQud2luKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gd2luZG93cztcclxuICAgIH1cclxuICBcclxuICBcclxuICAgIHJlZ2lzdGVyVGlrekNvZGVCbG9jaygpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZWwuY3JlYXRlRWwoXCJkaXZcIiksIHtcclxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcclxuICAgICAgICAgICAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRyeXtcclxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgICAgICBjb25zdCB0aWt6amF4PW5ldyBGb3JtYXRUaWt6amF4KHNvdXJjZSk7XHJcbiAgICAgICAgICAgIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLHRpa3pqYXguZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRUZXh0KHRpa3pqYXguZ2V0Q29kZSgpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaChlKXtcclxuICAgICAgICAgICAgICAgIGVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvckRpc3BsYXkgPSBlbC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJtYXRoLWVycm9yLWxpbmVcIiB9KTtcclxuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5pbm5lclRleHQgPSBgRXJyb3I6ICR7ZS5tZXNzYWdlfWA7XHJcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuY2xhc3NMaXN0LmFkZChcImVycm9yLXRleHRcIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiVGlrWiBQcm9jZXNzaW5nIEVycm9yOlwiLCBlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8gPSB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5maWx0ZXIoZWwgPT4gZWwubmFtZSAhPSBcIlRpa3pcIik7XHJcbiAgICAgIH1cclxuXHJcbiAgXHJcbiAgICAgIGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xyXG4gICAgICAgIHN2ZyA9IHN2Zy5yZXBsYWNlQWxsKC8oXCIjMDAwXCJ8XCJibGFja1wiKS9nLCBcIlxcXCJjdXJyZW50Q29sb3JcXFwiXCIpXHJcbiAgICAgICAgICAgICAgICAucmVwbGFjZUFsbCgvKFwiI2ZmZlwifFwid2hpdGVcIikvZywgXCJcXFwidmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KVxcXCJcIik7XHJcbiAgICAgICAgcmV0dXJuIHN2ZztcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgICBvcHRpbWl6ZVNWRyhzdmc6IHN0cmluZykge1xyXG4gICAgICAgICAgcmV0dXJuIG9wdGltaXplKHN2Zywge3BsdWdpbnM6XHJcbiAgICAgICAgICAgICAgW1xyXG4gICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInByZXNldC1kZWZhdWx0XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBvdmVycmlkZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW51cElEczogZmFsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICB9KT8uZGF0YTtcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgICBwb3N0UHJvY2Vzc1N2ZyA9IChlOiBFdmVudCkgPT4ge1xyXG4gIFxyXG4gICAgICAgICAgY29uc3Qgc3ZnRWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgIGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XHJcbiAgXHJcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSkge1xyXG4gICAgICAgICAgICBzdmcgPSB0aGlzLmNvbG9yU1ZHaW5EYXJrTW9kZShzdmcpO1xyXG4gICAgICAgICAgfVxyXG4gIFxyXG4gICAgICAgICAgc3ZnID0gdGhpcy5vcHRpbWl6ZVNWRyhzdmcpO1xyXG4gIFxyXG4gICAgICAgICAgc3ZnRWwub3V0ZXJIVE1MID0gc3ZnO1xyXG4gICAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcgfCBSZWdFeHAsIGZsYWdzOiBzdHJpbmcgPSAnJyk6IFJlZ0V4cCB7XHJcbiAgICBwYXR0ZXJuPXBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHA/cGF0dGVybi5zb3VyY2U6cGF0dGVybjtcclxuICAgIHJldHVybiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgJHtwYXR0ZXJufWAsIGZsYWdzP2ZsYWdzOicnKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0UmVnZXgoKXtcclxuICAgIGNvbnN0IGJhc2ljID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOl1gO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBiYXNpYzogYmFzaWMsXHJcbiAgICAgICAgbWVyZ2U6IFN0cmluZy5yYXdgW1xcK1xcLVxcfCFcXGQuXWAsXHJcbiAgICAgICAgLy9jb29yZGluYXRlOiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKCR7YmFzaWN9K3wxKWApLFxyXG4gICAgICAgIGNvb3JkaW5hdGVOYW1lOiBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWAsXHJcbiAgICAgICAgdGV4dDogU3RyaW5nLnJhd2BbXFx3XFxzLSwuOiQoISlfK1xcXFx7fT1dYCxcclxuICAgICAgICBmb3JtYXR0aW5nOiBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsmKltcXF17fSUtPD5dYFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuaW50ZXJmYWNlIHRva2VuICB7XHJcbiAgICBYPzogbnVtYmVyO1xyXG4gICAgWT86IG51bWJlcjtcclxuICAgIHR5cGU/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcclxuICAgIGNvb3JkaW5hdGVzPzogYW55O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5jb25zdCBwYXJzZU51bWJlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlczogQXJyYXk8QXhpcyB8IHN0cmluZz4sIGluZGV4OiBudW1iZXIpOiB7IGJlZm9yZTogbnVtYmVyLCBhZnRlcjogbnVtYmVyIH0ge1xyXG4gICAgICAgXHJcbiAgICBjb25zdCBiZWZvcmVJbmRleCA9IGF4ZXMuc2xpY2UoMCxpbmRleCkuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcylcclxuICAgIGNvbnN0IGFmdGVySW5kZXggPSBheGVzLmZpbmRJbmRleCgoYXhpczogYW55LGlkeDogbnVtYmVyKSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyYmaWR4PmluZGV4KTtcclxuXHJcbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xIHx8IGFmdGVySW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZmluZCB2YWxpZCBBeGlzIG9iamVjdHMuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSBhZnRlckluZGV4KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUHJhaXNlZCBheGlzIGFzIHNhbWUgdG9rZW5cIik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4geyBiZWZvcmU6IGJlZm9yZUluZGV4LCBhZnRlcjogYWZ0ZXJJbmRleCB9O1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEF4aXMge1xyXG4gICAgY2FydGVzaWFuWDogbnVtYmVyO1xyXG4gICAgY2FydGVzaWFuWTogbnVtYmVyO1xyXG4gICAgcG9sYXJBbmdsZTogbnVtYmVyO1xyXG4gICAgcG9sYXJMZW5ndGg6IG51bWJlcjtcclxuICAgIG5hbWU/OiBzdHJpbmc7XHJcbiAgICB1bml2ZXJzYWwoY29vcmRpbmF0ZTogc3RyaW5nLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGFuY2hvckFycj86IGFueSxhbmNob3I/OiBzdHJpbmcpOiBBeGlzIHtcclxuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZUFycjogQXJyYXk8QXhpc3xzdHJpbmc+ID0gW107XHJcbiAgICAgICAgbWF0Y2hlcy5mb3JFYWNoKChtYXRjaDogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xyXG4gICAgICAgICAgICBsZXQgYXhpczogQXhpc3x1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5hZGRDYXJ0ZXNpYW4obWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgLzovLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkUG9sYXIobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMucG9sYXJUb0NhcnRlc2lhbigpXHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvIVtcXGQuXSshLy50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAoL1tcXGRcXHddKy8pLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpXHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IHRva2Vucy5maW5kT3JpZ2luYWxWYWx1ZShtYXRjaCk/LmF4aXM7XHJcbiAgICAgICAgICAgICAgICBlbHNlIHRocm93IG5ldyBFcnJvcihgVHJpZWQgdG8gZmluZCBvcmlnaW5hbCBjb29yZGluYXRlIHZhbHVlIHdoaWxlIG5vdCBiZWluZyBwcm92aWRlZCB3aXRoIHRva2Vuc2ApO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChheGlzID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIHRoZSBjb29yZGluYXRlICR7bWF0Y2h9IGZyb20gJHtjb29yZGluYXRlfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLm1lcmdlQXhpcyhjb29yZGluYXRlQXJyKVxyXG5cclxuICAgICAgICBpZihhbmNob3JBcnImJmFuY2hvciYmYW5jaG9yLm1hdGNoKC8oLS1cXCt8LS1cXCtcXCspLykpe1xyXG4gICAgICAgICAgICBsZXQgYTogQXhpc1xyXG4gICAgICAgICAgICBpZiAoYW5jaG9yLm1hdGNoKC8oLS1cXCspLykpe1xyXG4gICAgICAgICAgICAgICAgYT1hbmNob3JBcnIuZmluZCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgICAgICB9ZWxzZXtcclxuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmRMYXN0KChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGEsXCJhZGRpdGlvblwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBjb21wbGV4Q2FydGVzaWFuQWRkKGF4aXM6IEF4aXMsbW9kZTogc3RyaW5nLG1vZGlmaWVyPzogYW55KXtcclxuICAgICAgICBzd2l0Y2ggKG1vZGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImFkZGl0aW9uXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblgrPWF4aXMuY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWSs9YXhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJzdWJ0cmFjdGlvblwiOlxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyaWdodFByb2plY3Rpb25cIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD1heGlzLmNhcnRlc2lhblhcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiaW50ZXJuYWxQb2ludFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPSh0aGlzLmNhcnRlc2lhblgrYXhpcy5jYXJ0ZXNpYW5YKSptb2RpZmllcjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWT0odGhpcy5jYXJ0ZXNpYW5ZK2F4aXMuY2FydGVzaWFuWSkqbW9kaWZpZXI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKClcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfTtcclxuXHJcblxyXG4gICAgZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZTogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCByZWdleFBhdHRlcm4gPSBnZXRSZWdleCgpO1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbXHJcbiAgICAgICAgICAgIHJlZ0V4cChTdHJpbmcucmF3YCgke3JlZ2V4UGF0dGVybi5iYXNpY30rKWAsIFwiZ1wiKSxcclxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLm1lcmdlfSspYCwgXCJnXCIpXHJcbiAgICAgICAgXTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTdGVwIDE6IEV4dHJhY3QgbWF0Y2hlcyBmb3IgZWFjaCBwYXR0ZXJuIHNlcGFyYXRlbHlcclxuICAgICAgICBjb25zdCBiYXNpY01hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1swXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcclxuICAgICAgICAgICAgZnVsbE1hdGNoOiBtYXRjaFswXS5yZXBsYWNlKC8tJC9nLCBcIlwiKSwgLy8gUmVtb3ZlIHRyYWlsaW5nIGh5cGhlbiBvbmx5XHJcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxyXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtZXJnZU1hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1sxXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcclxuICAgICAgICAgICAgZnVsbE1hdGNoOiBtYXRjaFswXSxcclxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXHJcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1hdGNoZXM6IEFycmF5PHsgZnVsbE1hdGNoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyIH0+ID0gW107XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIGlzT3ZlcmxhcHBpbmcobWF0Y2gxOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0sIG1hdGNoMjogeyBpbmRleDogbnVtYmVyOyBsZW5ndGg6IG51bWJlciB9KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDEuaW5kZXggPCBtYXRjaDIuaW5kZXggKyBtYXRjaDIubGVuZ3RoICYmIG1hdGNoMi5pbmRleCA8IG1hdGNoMS5pbmRleCArIG1hdGNoMS5sZW5ndGg7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBbLi4uYmFzaWNNYXRjaGVzLCAuLi5tZXJnZU1hdGNoZXNdLmZvckVhY2gobWF0Y2ggPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBvdmVybGFwcGluZ0luZGV4ID0gbWF0Y2hlcy5maW5kSW5kZXgoZXhpc3RpbmdNYXRjaCA9PiBpc092ZXJsYXBwaW5nKGV4aXN0aW5nTWF0Y2gsIG1hdGNoKSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob3ZlcmxhcHBpbmdJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nTWF0Y2ggPSBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgY3VycmVudCBtYXRjaCBjb3ZlcnMgYSBsYXJnZXIgcmFuZ2UsIHJlcGxhY2UgdGhlIGV4aXN0aW5nIG9uZVxyXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA+IGV4aXN0aW5nTWF0Y2gubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XSA9IG1hdGNoO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKG1hdGNoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgMzogU29ydCB0aGUgZmluYWwgbWF0Y2hlcyBieSBpbmRleFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgNDogVmFsaWRhdGUgdGhlIHJlc3VsdFxyXG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb29yZGluYXRlIGlzIG5vdCB2YWxpZDsgZXhwZWN0ZWQgYSB2YWxpZCBjb29yZGluYXRlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG1hdGNoZXM7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoY2FydGVzaWFuWCAhPT0gdW5kZWZpbmVkKSB0aGlzLmNhcnRlc2lhblggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgIGlmIChjYXJ0ZXNpYW5ZICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWSA9IGNhcnRlc2lhblk7XHJcbiAgICAgICAgaWYgKHBvbGFyTGVuZ3RoICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJMZW5ndGggPSBwb2xhckxlbmd0aDtcclxuICAgICAgICBpZiAocG9sYXJBbmdsZSAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyQW5nbGUgPSBwb2xhckFuZ2xlO1xyXG4gICAgfVxyXG5cclxuICAgIGNsb25lKCk6IEF4aXMge1xyXG4gICAgICAgIHJldHVybiBuZXcgQXhpcyh0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSx0aGlzLnBvbGFyTGVuZ3RoLHRoaXMucG9sYXJBbmdsZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG4gICAgbWVyZ2VBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+KSB7XHJcbiAgICAgICAgaWYgKCFheGVzLnNvbWUoKGF4aXM6IGFueSkgPT4gdHlwZW9mIGF4aXMgPT09IFwic3RyaW5nXCIpKSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBheGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBheGVzW2ldO1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnQgIT09IFwic3RyaW5nXCIpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBjb25zdCBzaWRlcyA9IGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlcywgaSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUF4aXMgPSBheGVzW3NpZGVzLmJlZm9yZV0gYXMgQXhpcztcclxuICAgICAgICAgICAgY29uc3QgYWZ0ZXJBeGlzID0gYXhlc1tzaWRlcy5hZnRlcl0gYXMgQXhpcztcclxuXHJcbiAgICAgICAgICAgIGxldCAgbWF0Y2ggPSBjdXJyZW50Lm1hdGNoKC9eXFwrJC8pO1xyXG4gICAgICAgICAgICBsZXQgbW9kZSxtb2RpZmllcnM7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJhZGRpdGlvblwiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXi1cXHwkLylcclxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcclxuICAgICAgICAgICAgICAgIG1vZGUgPSBcInJpZ2h0UHJvamVjdGlvblwiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXlxcIShbXFxkLl0rKVxcISQvKVxyXG4gICAgICAgICAgICBpZighbW9kZSYmbWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiaW50ZXJuYWxQb2ludFwiXHJcbiAgICAgICAgICAgICAgICBtb2RpZmllcnM9dG9OdW1iZXIobWF0Y2hbMV0pXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmKG1vZGUpe1xyXG4gICAgICAgICAgICAgICAgYXhlcy5zcGxpY2Uoc2lkZXMuYmVmb3JlLCBzaWRlcy5hZnRlciAtIHNpZGVzLmJlZm9yZSArIDEsIGJlZm9yZUF4aXMuY29tcGxleENhcnRlc2lhbkFkZChhZnRlckF4aXMsbW9kZSxtb2RpZmllcnMpKTtcclxuICAgICAgICAgICAgICAgIGkgPSBzaWRlcy5iZWZvcmU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYXhlcy5sZW5ndGggPT09IDEgJiYgYXhlc1swXSBpbnN0YW5jZW9mIEF4aXMpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCAoYXhlc1swXSBhcyBBeGlzKS5jbG9uZSgpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHByb2plY3Rpb24oYXhpczE6IEF4aXN8dW5kZWZpbmVkLGF4aXMyOiBBeGlzfHVuZGVmaW5lZCk6YW55e1xyXG4gICAgICAgIGlmICghYXhpczF8fCFheGlzMil7dGhyb3cgbmV3IEVycm9yKFwiYXhpcydzIHdlcmUgdW5kZWZpbmVkIGF0IHByb2plY3Rpb25cIik7fVxyXG4gICAgICAgIHJldHVybiBbe1g6IGF4aXMxLmNhcnRlc2lhblgsWTogYXhpczIuY2FydGVzaWFuWX0se1g6IGF4aXMyLmNhcnRlc2lhblgsWTogYXhpczEuY2FydGVzaWFuWX1dXHJcbiAgICB9XHJcbiAgICBjb21iaW5lKGNvb3JkaW5hdGVBcnI6IGFueSl7XHJcbiAgICAgICAgbGV0IHg9MCx5PTA7XHJcbiAgICAgICAgY29vcmRpbmF0ZUFyci5mb3JFYWNoKChjb29yZGluYXRlOiBBeGlzKT0+e1xyXG4gICAgICAgICAgICB4Kz1jb29yZGluYXRlLmNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIHkrPWNvb3JkaW5hdGUuY2FydGVzaWFuWTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWD14O3RoaXMuY2FydGVzaWFuWT15O1xyXG4gICAgfVxyXG4gICAgYWRkQ2FydGVzaWFuKHg6IHN0cmluZyB8IG51bWJlciwgeT86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICgheSAmJiB0eXBlb2YgeCA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICBbeCwgeV0gPSB4LnNwbGl0KFwiLFwiKS5tYXAoTnVtYmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCB8fCB5ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBDYXJ0ZXNpYW4gY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNhcnRlc2lhblggPSB4IGFzIG51bWJlcjtcclxuICAgICAgICB0aGlzLmNhcnRlc2lhblkgPSB5IGFzIG51bWJlcjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcG9sYXJUb0NhcnRlc2lhbigpe1xyXG4gICAgICAgIGNvbnN0IHRlbXA9cG9sYXJUb0NhcnRlc2lhbih0aGlzLnBvbGFyQW5nbGUsIHRoaXMucG9sYXJMZW5ndGgpXHJcbiAgICAgICAgdGhpcy5hZGRDYXJ0ZXNpYW4odGVtcC5YLHRlbXAuWSlcclxuICAgIH1cclxuXHJcbiAgICBjYXJ0ZXNpYW5Ub1BvbGFyKCl7XHJcbiAgICAgICAgY29uc3QgdGVtcD1jYXJ0ZXNpYW5Ub1BvbGFyKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZKVxyXG4gICAgICAgIHRoaXMuYWRkUG9sYXIodGVtcC5hbmdsZSx0ZW1wLmxlbmd0aClcclxuICAgIH1cclxuXHJcbiAgICBhZGRQb2xhcihhbmdsZTogc3RyaW5nIHwgbnVtYmVyLCBsZW5ndGg/OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIWxlbmd0aCAmJiB0eXBlb2YgYW5nbGUgPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgICAgW2FuZ2xlLCBsZW5ndGhdID0gYW5nbGUuc3BsaXQoXCI6XCIpLm1hcChOdW1iZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoYW5nbGUgPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHBvbGFyIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wb2xhckFuZ2xlID0gYW5nbGUgYXMgbnVtYmVyO1xyXG4gICAgICAgIHRoaXMucG9sYXJMZW5ndGggPSBsZW5ndGggYXMgbnVtYmVyO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FydGVzaWFuWCtcIixcIit0aGlzLmNhcnRlc2lhblk7XHJcbiAgICB9XHJcblxyXG4gICAgaW50ZXJzZWN0aW9uKGNvb3JkOiBzdHJpbmcsIGZpbmRPcmlnaW5hbFZhbHVlOiAoY29vcmQ6IHN0cmluZykgPT4gQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZCk6IHtYOm51bWJlcixZOm51bWJlcn0ge1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcclxuICAgICAgICAgICAgLnJlcGxhY2UoL2ludGVyc2VjdGlvblxccz9vZlxccz8vZywgXCJcIilcclxuICAgICAgICAgICAgLnJlcGxhY2UoLyhcXHMqYW5kXFxzP3wtLSkvZywgXCIgXCIpXHJcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcclxuICAgICAgICAgICAgLm1hcChmaW5kT3JpZ2luYWxWYWx1ZSlcclxuICAgICAgICAgICAgLmZpbHRlcigodG9rZW4pOiB0b2tlbiBpcyBDb29yZGluYXRlID0+IHRva2VuICE9PSB1bmRlZmluZWQpO1xyXG5cclxuICAgICAgICBpZiAob3JpZ2luYWxDb29yZHMubGVuZ3RoIDwgNCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnRlcnNlY3Rpb24gaGFkIHVuZGVmaW5lZCBjb29yZGluYXRlcyBvciBpbnN1ZmZpY2llbnQgZGF0YS5cIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBzbG9wZXMgPSBbXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1swXS5heGlzLCBvcmlnaW5hbENvb3Jkc1sxXS5heGlzKSxcclxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMsIG9yaWdpbmFsQ29vcmRzWzNdLmF4aXMpLFxyXG4gICAgICAgIF07XHJcblxyXG4gICAgICAgIHJldHVybiBmaW5kSW50ZXJzZWN0aW9uUG9pbnQob3JpZ2luYWxDb29yZHNbMF0uYXhpcywgb3JpZ2luYWxDb29yZHNbMl0uYXhpcywgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjb3ZvcnQodmFsdWU6IG51bWJlcixjb252cnNpbjogc3RyaW5nKXtcclxuXHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBtYXRjaEtleVdpdGhWYWx1ZShrZXk6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICBjb25zdCB2YWx1ZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcclxuICAgICAgICBcImFuY2hvclwiOiBcImFuY2hvcj1cIixcclxuICAgICAgICBcInJvdGF0ZVwiOiBcInJvdGF0ZT1cIixcclxuICAgICAgICBcImxpbmVXaWR0aFwiOiBcImxpbmUgd2lkdGg9XCIsXHJcbiAgICAgICAgXCJmaWxsXCI6IFwiZmlsbD1cIixcclxuICAgICAgICBcImZpbGxPcGFjaXR5XCI6IFwiZmlsbCBvcGFjaXR5PVwiLFxyXG4gICAgICAgIFwidGV4dENvbG9yXCI6IFwidGV4dCBjb2xvcj1cIixcclxuICAgICAgICBcImRyYXdcIjogXCJkcmF3PVwiLFxyXG4gICAgICAgIFwidGV4dFwiOiBcInRleHQ9XCIsXHJcbiAgICAgICAgXCJwb3NcIjogXCJwb3M9XCIsXHJcbiAgICAgICAgXCJkZWNvcmF0ZVwiOiBcImRlY29yYXRlXCIsXHJcbiAgICAgICAgXCJzbG9wZWRcIjogXCJzbG9wZWRcIixcclxuICAgICAgICBcImRlY29yYXRpb25cIjogXCJkZWNvcmF0aW9uPVwiLFxyXG4gICAgICAgIFwiZGVjb3JhdGlvbi5icmFjZVwiOiBcImJyYWNlXCIsXHJcbiAgICAgICAgXCJkZWNvcmF0aW9uLmFtcGxpdHVkZVwiOiBcImFtcGxpdHVkZT1cIlxyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gdmFsdWVNYXBba2V5XSB8fCAnJztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XHJcblxyXG4gICAgbW9kZTogc3RyaW5nO1xyXG4gICAgcm90YXRlPzogbnVtYmVyO1xyXG4gICAgYW5jaG9yPzogc3RyaW5nO1xyXG4gICAgbGluZVdpZHRoPzogbnVtYmVyO1xyXG4gICAgd2lkdGg/OiBzdHJpbmc7XHJcbiAgICBjb2xvcj86IHN0cmluZztcclxuICAgIHRleHRDb2xvcj86IHN0cmluZztcclxuICAgIGZpbGw/OiBzdHJpbmc7XHJcbiAgICBmaWxsT3BhY2l0eT86IG51bWJlcjtcclxuICAgIGFycm93Pzogc3RyaW5nO1xyXG4gICAgZHJhdz86IHN0cmluZztcclxuICAgIHRleHQ/OiBzdHJpbmc7XHJcbiAgICBwYXRoQXR0cmlidXRlPzogc3RyaW5nO1xyXG4gICAgdGlrenNldD86IHN0cmluZztcclxuICAgIHBvcz86IG51bWJlcjtcclxuICAgIHBvc2l0aW9uPzogc3RyaW5nO1xyXG4gICAgbGluZVN0eWxlPzogc3RyaW5nO1xyXG4gICAgc2xvcGVkPzogYm9vbGVhbjtcclxuICAgIGRlY29yYXRpb24/OiB7YnJhY2U/OiBib29sZWFuLGNvaWw6IGJvb2xlYW4sYW1wbGl0dWRlPzogbnVtYmVyLGFzcGVjdDogbnVtYmVyLHNlZ21lbnRMZW5ndGg6bnVtYmVyfTtcclxuICAgIGRlY29yYXRlPzogYm9vbGVhbjtcclxuXHJcbiAgICBxdWlja0FkZChtb2RlOiBzdHJpbmcsZm9ybWF0dGluZzogYW55LGZvcm1hdHRpbmdGb3JJbnRlcnByZXRhdGlvbj86c3RyaW5nICl7XHJcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nU3BlY2lmaWNUb01vZGUoKTtcclxuICAgICAgICB0aGlzLmludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZ0ZvckludGVycHJldGF0aW9ufHxcIlwiKVxyXG4gICAgICAgIHRoaXMucm90YXRlPXRvTnVtYmVyKGZvcm1hdHRpbmc/LnJvdGF0ZSk/P3RoaXMucm90YXRlO1xyXG4gICAgICAgIHRoaXMuYW5jaG9yPWZvcm1hdHRpbmc/LmFuY2hvcj8ucmVwbGFjZSgvLVxcfC8sXCJzb3V0aFwiKT8ucmVwbGFjZSgvXFx8LS8sXCJub3J0aFwiKT8/dGhpcy5hbmNob3I7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgZm9ybWF0dGluZ1NwZWNpZmljVG9Nb2RlKCl7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcIm5vZGUtbWFzc1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPVwieWVsbG93ITYwXCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhBdHRyaWJ1dGU9XCJkcmF3XCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgYWRkU3Bsb3BBbmRQb3NpdGlvbihhcnI6IGFueSxpbmRleDogbnVtYmVyKXtcclxuICAgICAgICBjb25zdCBiZWZvcmVBZnRlcj1maW5kQmVmb3JlQWZ0ZXJBeGlzKGFycixpbmRleCk7XHJcbiAgICAgICAgY29uc3QgW2JlZm9yZSwgYWZ0ZXJdPVthcnJbYmVmb3JlQWZ0ZXIuYmVmb3JlXSxhcnJbYmVmb3JlQWZ0ZXIuYWZ0ZXJdXVxyXG4gICAgICAgIGlmICh0aGlzLnBvc2l0aW9ufHx0aGlzLnNsb3BlZCl7cmV0dXJufVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgZWRnZTEgPSBiZWZvcmUucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XHJcbiAgICAgICAgY29uc3QgZWRnZTIgPSBhZnRlci5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcclxuICAgICAgICBjb25zdCBzbG9wZT1maW5kU2xvcGUoZWRnZTEsZWRnZTIpXHJcblxyXG4gICAgICAgIHRoaXMuc2xvcGVkID0gc2xvcGUgIT09IDA7XHJcblxyXG4gICAgICAgIGxldCBxdWFkcmFudFxyXG4gICAgICAgIGlmIChlZGdlMSE9PWVkZ2UyKXF1YWRyYW50PWVkZ2UxK2VkZ2UyO1xyXG4gICAgICAgIGVsc2UgcXVhZHJhbnQ9ZWRnZTE7XHJcblxyXG4gICAgICAgIGlmIChzbG9wZSE9PUluZmluaXR5JiZzbG9wZSE9PS1JbmZpbml0eSl7XHJcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb24gPSBxdWFkcmFudC5yZXBsYWNlKC8oM3w0KS8sXCJiZWxvd1wiKS5yZXBsYWNlKC8oMXw0KS8sXCJhYm92ZVwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAodGhpcy5zbG9wZWQpe1xyXG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uKz1xdWFkcmFudC5yZXBsYWNlKC8oMnwzKS8sXCJyaWdodFwiKS5yZXBsYWNlKC8oMXw0KS8sXCJsZWZ0XCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFJlbW92ZSB1bnVzZWQgcXVhZHJhbnRzLiBhbmQgQWRkIHNwYWNlIGlmIHR3byB3b3Jkc1xyXG4gICAgICAgIHRoaXMucG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uPy5yZXBsYWNlKC9bXFxkXSsvZyxcIlwiKS5yZXBsYWNlKC8oYmVsb3d8YWJvdmUpKHJpZ2h0fHJpZ2h0KS8sXCIkMSAkMlwiKTtcclxuICAgIH1cclxuICAgIGludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZzogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCBzcGxpdEZvcm1hdHRpbmc9Zm9ybWF0dGluZy5tYXRjaCgvKD86e1tefV0qfXxbXix7fV0rKSsvZykgfHwgW107XHJcbiAgICAgICAgc3BsaXRGb3JtYXR0aW5nLmZvckVhY2goZm9ybWF0dGluZyA9PiB7XHJcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coZm9ybWF0dGluZylcclxuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBmb3JtYXR0aW5nLm1hdGNoKC9eKFtePV0rKT17KC4qKX0kLyk7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAhIW1hdGNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgIFtfLHBhcmVudCwgY2hpbGRyZW5dPW1hdGNoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmludGVycHJldEZvcm1hdHRpbmcoY2hpbGRyZW4pXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSBmb3JtYXR0aW5nLmluY2x1ZGVzKFwibGluZXdpZHRoXCIpOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImxpbmVXaWR0aFwiLGZvcm1hdHRpbmcpXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlIGZvcm1hdHRpbmcuaW5jbHVkZXMoXCJmaWxsPVwiKToge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJmaWxsXCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgZm9ybWF0dGluZy5pbmNsdWRlcyhcImZpbGxvcGFjaXR5XCIpOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImZpbGxPcGFjaXR5XCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKC0+fDwtfC0qe1N0ZWFsdGh9LSopJC8pOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hcnJvdyA9IGZvcm1hdHRpbmdcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpezEsMn0kLyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvc2l0aW9uPWZvcm1hdHRpbmcucmVwbGFjZSgvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLyxcIiQxIFwiKVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15wb3M9Lyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwicG9zXCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZHJhdz0vKToge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJkcmF3XCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZGVjb3JhdGUkLyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRlY29yYXRlPXRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXnRleHQ9Lyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwidGV4dFwiLGZvcm1hdHRpbmcpXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXmJyYWNlJC8pOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4sKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eYW1wbGl0dWRlLyk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRlY29yYXRpb25cIixmb3JtYXR0aW5nLFwiYW1wbGl0dWRlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+LClcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZHJhdyQvKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhdGhBdHRyaWJ1dGUgPSBmb3JtYXR0aW5nO2JyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15oZWxwbGluZXMkLyk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aWt6c2V0ID0gZm9ybWF0dGluZy5yZXBsYWNlKC9oZWxwbGluZXMvZyxcImhlbHAgbGluZXNcIik7YnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxkLl0rKXsxLDV9JC8pOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29sb3I9Zm9ybWF0dGluZzticmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKGRvdHRlZHxkYXNoZWR8c21vb3RofGRlbnNlbHl8bG9vc2VseSl7MSwyfSQvKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpbmVTdHlsZT1mb3JtYXR0aW5nLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLyxcIiQxIFwiKTticmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcclxuICAgICAgICBrZXk6IEssXHJcbiAgICAgICAgZm9ybWF0dGluZzogYW55LFxyXG4gICAgICAgIG5lc3RlZEtleT86IE5LXHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBsZXQgdmFsdWU7XHJcblxyXG4gICAgICAgIGlmKHR5cGVvZiBmb3JtYXR0aW5nIT09XCJib29sZWFuXCIpe1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBmb3JtYXR0aW5nLnNwbGl0KFwiPVwiKTtcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBFbnN1cmUgdGhlIGZvcm1hdHRpbmcgc3RyaW5nIGlzIHZhbGlkXHJcbiAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPCAyIHx8ICFtYXRjaFsxXSkgcmV0dXJuO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXHJcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gbWF0Y2hbMV0udHJpbSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHZhbHVlIGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nXHJcbiAgICAgICAgICAgIHZhbHVlID0gIWlzTmFOKHBhcnNlRmxvYXQocmF3VmFsdWUpKSAmJiBpc0Zpbml0ZSgrcmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA6IHJhd1ZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB2YWx1ZT1mb3JtYXR0aW5nXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuc2V0UHJvcGVydHkoa2V5LCB2YWx1ZSwgbmVzdGVkS2V5KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgc2V0UHJvcGVydHk8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxyXG4gICAgICAgIGtleTogSyxcclxuICAgICAgICB2YWx1ZTogYW55LFxyXG4gICAgICAgIG5lc3RlZEtleT86IE5LXHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nT2JqID0gdGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgXHJcbiAgICAgICAgaWYgKG5lc3RlZEtleSkge1xyXG4gICAgICAgICAgICBpZiAoIWZvcm1hdHRpbmdPYmpba2V5XSB8fCB0eXBlb2YgZm9ybWF0dGluZ09ialtrZXldICE9PSAnb2JqZWN0Jykge1xyXG4gICAgICAgICAgICAgICAgZm9ybWF0dGluZ09ialtrZXldID0ge307XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZm9ybWF0dGluZ09ialtrZXldW25lc3RlZEtleV0gPSB2YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV0gPSB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG4gICAgdG9TdHJpbmcoKTogc3RyaW5nIHtcclxuICAgICAgICBsZXQgc3RyaW5nPSdbJztcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh0aGlzKSkge1xyXG4gICAgICAgICAgICBpZiAoa2V5PT09XCJtb2RlXCIpe2NvbnRpbnVlO31cclxuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jyl7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcrPXRoaXMuaGFuZGxlT2JqZWN0VG9TdHJpbmcodmFsdWUsa2V5KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW1hdGNoS2V5V2l0aFZhbHVlKGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nKSsodHlwZW9mIHZhbHVlPT09XCJib29sZWFuXCI/Jyc6dmFsdWUpKycsJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc3RyaW5nK1wiXVwiO1xyXG4gICAgfVxyXG4gICAgaGFuZGxlT2JqZWN0VG9TdHJpbmcob2JqOiBvYmplY3QsIHBhcmVudEtleTogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gbWF0Y2hLZXlXaXRoVmFsdWUocGFyZW50S2V5KSsneyc7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xyXG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBtYXRjaEtleVdpdGhWYWx1ZShgJHtwYXJlbnRLZXl9LiR7a2V5fWApICsgKHR5cGVvZiB2YWx1ZSA9PT0gXCJib29sZWFuXCIgPyAnJyA6IHZhbHVlKSArICcsJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0K1wifSxcIjtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIENvb3JkaW5hdGUge1xyXG4gICAgbW9kZTogc3RyaW5nO1xyXG4gICAgYXhpczogQXhpcztcclxuICAgIG9yaWdpbmFsPzogc3RyaW5nO1xyXG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XHJcbiAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZztcclxuICAgIGxhYmVsPzogc3RyaW5nO1xyXG4gICAgcXVhZHJhbnQ/OiBudW1iZXI7XHJcbiAgICBcclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIG1vZGU/OiBzdHJpbmcsXHJcbiAgICAgICAgYXhpcz86IEF4aXMsXHJcbiAgICAgICAgb3JpZ2luYWw/OiBzdHJpbmcsXHJcbiAgICAgICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmcsXHJcbiAgICAgICAgZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsXHJcbiAgICAgICAgbGFiZWw/OiBzdHJpbmcsXHJcbiAgICAgICAgcXVhZHJhbnQ/OiBudW1iZXJcclxuICAgICkge1xyXG5cclxuICAgICAgICBpZiAobW9kZSAhPT0gdW5kZWZpbmVkKSB0aGlzLm1vZGUgPSBtb2RlO1xyXG4gICAgICAgIGlmIChheGlzICE9PSB1bmRlZmluZWQpIHRoaXMuYXhpcyA9IGF4aXM7XHJcbiAgICAgICAgdGhpcy5vcmlnaW5hbCA9IG9yaWdpbmFsO1xyXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUgPSBjb29yZGluYXRlTmFtZTtcclxuICAgICAgICB0aGlzLmZvcm1hdHRpbmcgPSBmb3JtYXR0aW5nO1xyXG4gICAgICAgIHRoaXMubGFiZWwgPSBsYWJlbDtcclxuICAgICAgICB0aGlzLnF1YWRyYW50ID0gcXVhZHJhbnQ7XHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBDb29yZGluYXRlIHtcclxuICAgICAgICByZXR1cm4gbmV3IENvb3JkaW5hdGUoXHJcbiAgICAgICAgICAgIHRoaXMubW9kZSxcclxuICAgICAgICAgICAgdGhpcy5heGlzLmNsb25lKCksXHJcbiAgICAgICAgICAgIHRoaXMub3JpZ2luYWwsXHJcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUsXHJcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZyxcclxuICAgICAgICAgICAgdGhpcy5sYWJlbCxcclxuICAgICAgICAgICAgdGhpcy5xdWFkcmFudFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgIFxyXG4gICAgYWRkSW5mbyhtYXRjaDoge29yaWdpbmFsPzogc3RyaW5nLGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nLGxhYmVsPzogc3RyaW5nLGZvcm1hdHRpbmc/OiBzdHJpbmd9LCBtb2RlOiBzdHJpbmcsdG9rZW5zPzogRm9ybWF0VGlrempheCxmb3JtYXR0aW5nPzogb2JqZWN0KSB7XHJcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgKFt7b3JpZ2luYWw6IHRoaXMub3JpZ2luYWwsY29vcmRpbmF0ZU5hbWU6IHRoaXMuY29vcmRpbmF0ZU5hbWUsbGFiZWw6IHRoaXMubGFiZWx9XT1bbWF0Y2hdKVxyXG4gICAgICAgIGlmKHRoaXMub3JpZ2luYWwpe1xyXG4gICAgICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoKS51bml2ZXJzYWwodGhpcy5vcmlnaW5hbCx0b2tlbnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZy5xdWlja0FkZCh0aGlzLm1vZGUsZm9ybWF0dGluZyxtYXRjaC5mb3JtYXR0aW5nKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29vcmRpbmF0ZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBcXFxcY29vcnske3RoaXMuYXhpcy50b1N0cmluZygpfX17JHt0aGlzLmNvb3JkaW5hdGVOYW1lIHx8IFwiXCJ9fXske3RoaXMubGFiZWwgfHwgXCJcIn19e31gO1xyXG4gICAgICAgICAgICBjYXNlIFwibm9kZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLWlubGluZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBub2RlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSB7JHt0aGlzLmxhYmVsfX1gXHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLW1hc3NcIjpcclxuICAgICAgICAgICAgICAgIHJldHVybiBgXFxcXG5vZGUgJHt0aGlzLmNvb3JkaW5hdGVOYW1lPycoJyt0aGlzLmNvb3JkaW5hdGVOYW1lKycpJzonJ30gYXQgKCR7dGhpcy5heGlzLnRvU3RyaW5nKCl9KSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKX0geyR7dGhpcy5sYWJlbH19O2BcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgbW9kZSBhdCB0byBzdHJpbmcgY29vcmRpbmF0ZVwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgIH1cclxuXHJcbiAgICBhZGRRdWFkcmFudChtaWRQb2ludDogQXhpcykge1xyXG4gICAgICAgIGNvbnN0IHhEaXJlY3Rpb24gPSB0aGlzLmF4aXMuY2FydGVzaWFuWCA+IG1pZFBvaW50LmNhcnRlc2lhblggPyAxIDogLTE7XHJcbiAgICAgICAgY29uc3QgeURpcmVjdGlvbiA9IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZID4gbWlkUG9pbnQuY2FydGVzaWFuWSA/IDEgOiAtMTtcclxuICAgICAgICB0aGlzLnF1YWRyYW50ID0geURpcmVjdGlvbiA9PT0gMSA/ICh4RGlyZWN0aW9uID09PSAxID8gMSA6IDIpIDogKHhEaXJlY3Rpb24gPT09IDEgPyA0IDogMyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbnR5cGUgVG9rZW4gPUF4aXMgfCBDb29yZGluYXRlIHxEcmF3fCBzdHJpbmc7XHJcblxyXG5leHBvcnQgY2xhc3MgRHJhdyB7XHJcbiAgICBtb2RlPzogc3RyaW5nXHJcbiAgICBmb3JtYXR0aW5nOiBGb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKCk7XHJcbiAgICBjb29yZGluYXRlczogQXJyYXk8VG9rZW4+O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKG1hdGNoOiB7Zm9ybWF0dGluZzogc3RyaW5nfGFueSxkcmF3OiBzdHJpbmd8YW55fSwgdG9rZW5zPzogRm9ybWF0VGlrempheCxtb2RlPzogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgdGhpcy5tb2RlPWBkcmF3JHttb2RlP1wiLVwiK21vZGU6XCJcIn1gO1xyXG4gICAgICAgIGlmICh0eXBlb2YgbWF0Y2guZm9ybWF0dGluZyA9PT1cInN0cmluZ1wiKVxyXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZy5xdWlja0FkZChgZHJhd2Ase30sbWF0Y2guZm9ybWF0dGluZyk7XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZy5xdWlja0FkZChgZHJhd2AsbWF0Y2guZm9ybWF0dGluZywnJyk7XHJcbiAgICAgICAgaWYodHlwZW9mIG1hdGNoLmRyYXc9PT1cInN0cmluZ1wiKVxyXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXMgPSB0aGlzLmZpbGxDb29yZGluYXRlcyh0aGlzLmdldFNjaGVtYXRpYyhtYXRjaC5kcmF3KSwgdG9rZW5zKTtcclxuICAgICAgICBlbHNle1xyXG5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY3JlYXRlRnJvbUFycmF5KGFycjogYW55KXtcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YXJyLmxlbmd0aDtpKyspe1xyXG4gICAgICAgICAgICBpZiAoYXJyW2ldIGluc3RhbmNlb2YgQXhpc3x8YXJyW2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSl7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiBhcnI9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaChhcnJbaV0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgY29vcmRpbmF0ZXNBcnJheS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoY29vcmRpbmF0ZXNBcnJheVtpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcclxuICAgICAgICAgICAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgd2hpbGUgKGkgPCBjb29yZGluYXRlc0FycmF5Lmxlbmd0aCAmJiAhZm91bmQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpKys7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb29yZGluYXRlc0FycmF5W2ldID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBpZiAoY29vcmRpbmF0ZXNBcnJheVtpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGktLTsgXHJcbiAgICAgICAgICAgICAgICBpZiAoZm91bmQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goJy0tJyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7XHJcbiAgICB9XHJcblxyXG4gICAgZmlsbENvb3JkaW5hdGVzKHNjaGVtYXRpYzogYW55W10sIHRva2Vucz86IEZvcm1hdFRpa3pqYXgpIHtcclxuICAgICAgICBjb25zdCBjb29yQXJyOiBBcnJheTxUb2tlbj49W107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2hlbWF0aWMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHNjaGVtYXRpY1tpXS50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgICAgICAgICAgbGV0IHByZXZpb3VzRm9ybWF0dGluZztcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoaSA+IDAgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMV0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPiAxICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJub2RlXCIgJiYgc2NoZW1hdGljW2kgLSAyXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMl0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IEF4aXMoKS51bml2ZXJzYWwoc2NoZW1hdGljW2ldLnZhbHVlLCB0b2tlbnMsIGNvb3JBcnIsIHByZXZpb3VzRm9ybWF0dGluZywgKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZihzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJub2RlXCIpe1xyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBDb29yZGluYXRlKCkuYWRkSW5mbyh7bGFiZWw6IHNjaGVtYXRpY1tpXS52YWx1ZSxmb3JtYXR0aW5nOiBzY2hlbWF0aWNbaV0uZm9ybWF0dGluZ30sXCJub2RlLWlubGluZVwiLHRva2VucykpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2V7XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2goc2NoZW1hdGljW2ldLnZhbHVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY29vckFycjtcclxuICAgIH1cclxuXHJcbiAgICBnZXRTY2hlbWF0aWMoZHJhdzogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVnZXg9Z2V0UmVnZXgoKTtcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XHJcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gcmVnRXhwKFN0cmluZy5yYXdgbm9kZVxccypcXFsoJHtyZWdleC5mb3JtYXR0aW5nfSopXFxdXFxzKnsoJHtyZWdleC50ZXh0fSopfWApO1xyXG4gICAgICAgIGNvbnN0IGZvcm1hdHRpbmdSZWdleCA9IC8oLS1jeWNsZXxjeWNsZXwtLVxcK1xcK3wtLVxcK3wtLXwtXFx8fFxcfC18Z3JpZHxjaXJjbGV8cmVjdGFuZ2xlKS87XHJcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxcc1xcLSwuOmA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKFxcKFske2NhfV0rXFwpfFxcKFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXFwtXStcXChbJHtjYX1dK1xcKVxcJFxcKSlgKTtcclxuICAgICAgICBsZXQgaSA9IDA7XHJcbiAgICAgICAgbGV0IGxvb3BzID0gMDtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAoaSA8IGRyYXcubGVuZ3RoICYmIGxvb3BzIDwgMTAwKSB7IC8vIEluY3JlYXNlIGxvb3AgbGltaXQgb3IgYWRkIGNvbmRpdGlvbiBiYXNlZCBvbiBwYXJzZWQgbGVuZ3RoXHJcbiAgICAgICAgICAgIGxvb3BzKys7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvb3JkaW5hdGVNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2goY29vcmRpbmF0ZVJlZ2V4KTtcclxuICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICBpZiAoY29vcmRpbmF0ZU1hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJjb29yZGluYXRlXCIsIHZhbHVlOiBjb29yZGluYXRlTWF0Y2hbMV0gfSk7XHJcbiAgICAgICAgICAgICAgICBpICs9IGNvb3JkaW5hdGVNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2goZm9ybWF0dGluZ1JlZ2V4KTtcclxuICAgICAgICAgICAgaWYgKGZvcm1hdHRpbmdNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGkgKz0gZm9ybWF0dGluZ01hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiZm9ybWF0dGluZ1wiLCB2YWx1ZTogZm9ybWF0dGluZ01hdGNoWzBdIH0pO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBub2RlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKG5vZGVSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChub2RlTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwibm9kZVwiLFxyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG5vZGVNYXRjaFsxXSB8fCBcIlwiLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBub2RlTWF0Y2hbMl1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBub2RlTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChsb29wcyA9PT0gMTAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBhcnNpbmcgZXhjZWVkZWQgc2FmZSBsb29wIGNvdW50XCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZXNBcnJheTtcclxuICAgIH1cclxuXHJcbiAgICBpc0Nvb3JkaW5hdGUob2JqOiBhbnkpOiBvYmogaXMgQ29vcmRpbmF0ZSB7XHJcbiAgICAgICAgcmV0dXJuIG9iaiAmJiBvYmogaW5zdGFuY2VvZiBDb29yZGluYXRlO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCkge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBgXFxcXGRyYXcgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCl9IGA7XHJcbiAgICAgICAgbGV0IGJlZm9yZVRva2VuOiBDb29yZGluYXRlIHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIGxldCBhZnRlclRva2VuOiBDb29yZGluYXRlIHwgdW5kZWZpbmVkO1xyXG4gICAgICAgIGxldCBzbG9wZTtcclxuXHJcbiAgICAgICAgdGhpcy5jb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGNvb3JkaW5hdGUgaW5zdGFuY2VvZiBDb29yZGluYXRlJiZjb29yZGluYXRlLm1vZGU9PT1cIm5vZGUtaW5saW5lXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSB0eXBlb2YgY29vcmRpbmF0ZT09PVwic3RyaW5nXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gLygtLVxcK1xcK3wtLVxcKykvLnRlc3QoY29vcmRpbmF0ZSk/XCItLVwiOmNvb3JkaW5hdGU7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9YCgke2Nvb3JkaW5hdGUudG9TdHJpbmcoKX0pYFxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcclxuICAgIH1cclxufVxyXG5leHBvcnQgY2xhc3MgRm9ybWF0VGlrempheCB7XHJcblx0c291cmNlOiBzdHJpbmc7XHJcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcclxuICAgIG1pZFBvaW50OiBBeGlzO1xyXG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcclxuICAgIGRlYnVnSW5mbyA9IFwiXCI7XHJcbiAgICBcclxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZ3xBcnJheTxUb2tlbj4pIHtcclxuICAgICAgICBpZih0eXBlb2Ygc291cmNlPT09XCJzdHJpbmdcIilcclxuXHRcdHRoaXMuc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xyXG4gICAgICAgIGVsc2UgdGhpcy50b2tlbnM9c291cmNlXHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMuc291cmNlO1xyXG4gICAgICAgIHRoaXMudG9rZW5pemUoKTtcclxuICAgICAgICB0aGlzLmZpbmRNaWRwb2ludCgpO1xyXG4gICAgICAgIHRoaXMuYXBwbHlQb3N0UHJvY2Vzc2luZygpO1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz1cIlxcblxcbnRoaXMubWlkUG9pbnQ6XFxuXCIrSlNPTi5zdHJpbmdpZnkodGhpcy5taWRQb2ludCxudWxsLDEpK1wiXFxuXCJcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXHJcblxyXG4gICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnJlY29uc3RydWN0KCk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcclxuXHR9XHJcbiAgICBcclxuICAgIHRpZHlUaWt6U291cmNlKHRpa3pTb3VyY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XHJcbiAgICAgICAgdGlrelNvdXJjZSA9IHRpa3pTb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHRpa3pTb3VyY2Uuc3BsaXQoXCJcXG5cIik7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpOztcclxuICAgIH1cclxuXHJcbiAgICBhcHBseVBvc3RQcm9jZXNzaW5nKCl7XHJcbiAgICAgICAgZm9yKGxldCBpPTA7aTx0aGlzLnRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgZ2V0Q29kZSgpe1xyXG4gICAgICAgIHJldHVybiBnZXRQcmVhbWJsZSgpK3RoaXMucHJvY2Vzc2VkQ29kZStcIlxcblxcXFxlbmR7dGlrenBpY3R1cmV9XFxcXGVuZHtkb2N1bWVudH1cIjtcclxuICAgIH1cclxuICAgIHRva2VuaXplKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHMtLC46fGA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcclxuICAgICAgICBjb25zdCBjID0gU3RyaW5nLnJhd2BbJChdezAsMn1bJHtjYX1dK1spJF17MCwyfXxcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K10rXFwoWyR7Y2F9XStcXClcXCRgO1xyXG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB3aXRoIGVzY2FwZWQgY2hhcmFjdGVycyBmb3Igc3BlY2lmaWMgbWF0Y2hpbmdcclxuICAgICAgICBjb25zdCBjbiA9IFN0cmluZy5yYXdgW1xcd19cXGRcXHNdYDsgLy8gQ29vcmRpbmF0ZSBuYW1lXHJcbiAgICAgICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXFwkW1xcd1xcZFxcc1xcLSwuOighKVxcLVxce1xcfVxcK1xcXFxdKlxcJHxbXFx3XFxkXFxzXFwtLC46KCEpX1xcLVxcK1xcXFxdKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcbiAgICAgICAgY29uc3QgZiA9IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOy4mKlxce1xcfSVcXC08Pl1gOyAvLyBGb3JtYXR0aW5nIHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgY29vclJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBzZSA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxccypcXCgqKCR7Y259KVxcKSpcXHMqYXRcXHMqXFwoKCR7Y30pXFwpXFxzKlxcWygke2Z9KilcXF1cXHMqXFx7KCR7dH0pXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHh5YXhpc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx4eWF4aXN7KCR7dH0pfXsoJHt0fSl9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgbWFzc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxtYXNzXFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KC1cXHx8XFx8fD4pezAsMX1cXH1cXHsoW1xcZC5dKilcXH1gLFwiZ1wiKTtcclxuXHJcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtjb29yUmVnZXgsIHNlLCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4XTtcclxuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XHJcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcclxuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGEuaW5kZXggfHwgMCkgLSAoYi5pbmRleCB8fCAwKSk7XHJcblxyXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxyXG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbNV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzRdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFsyXX0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgpLmFkZEluZm8oaSxcImNvb3JkaW5hdGVcIix0aGlzKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZHJhd1wiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHtmb3JtYXR0aW5nOiBtYXRjaFsxXSxkcmF3OiBtYXRjaFsyXX0sIHRoaXMpKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcclxuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKGRpc3NlY3RYWWF4aXMobWF0Y2gpKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxncmlkXCIpKSB7XHJcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XHJcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzNdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX1cclxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgpLmFkZEluZm8oaSxcIm5vZGVcIix0aGlzKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7LypcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgdHlwZTogXCJjaXJjbGVcIixcclxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSxcclxuICAgICAgICAgICAgICBjb29yZGluYXRlczogW1xyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsxXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsyXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFszXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIH0pOyovXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xyXG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLCBsYWJlbDogbWF0Y2hbMl19XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoKS5hZGRJbmZvKGksXCJub2RlLW1hc3NcIix0aGlzLHthbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KSlcclxuXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcdmVjXCIpKSB7XHJcbiAgICAgICAgICAgIG1hdGNoWzJdPWAoJHttYXRjaFsxXX0pLS0rbm9kZVtdeyR7bWF0Y2hbM119fSgke21hdGNoWzJdfSlgXHJcbiAgICAgICAgICAgIG1hdGNoWzFdPW1hdGNoWzRdKycsLT4nXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcobWF0Y2gsdGhpcykpXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZmluZE1pZHBvaW50KCkge1xyXG4gICAgICAgIC8qbGV0IGNvb3JkaW5hdGVzID0gdGhpcy50b2tlbnMuZmlsdGVyKCh0b2tlbjogVG9rZW4pID0+IHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSk7XHJcbiAgICAgICAgdGhpcy50b2tlbnNcclxuICAgICAgICAuZmlsdGVyKCh0b2tlbjogVG9rZW4pID0+IHRva2VuIGluc3RhbmNlb2YgRHJhdylcclxuICAgICAgICAuZm9yRWFjaCgob2JqZWN0OiBEcmF3KSA9PiB7XHJcbiAgICAgICAgICAgIGNvb3JkaW5hdGVzID0gY29vcmRpbmF0ZXMuY29uY2F0KFxyXG4gICAgICAgICAgICAgICAgb2JqZWN0LmNvb3JkaW5hdGVzLmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xyXG4gICAgICAgIGNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IHRva2VuKSA9PiB7XHJcbiAgICAgICAgICBzdW1PZlggKz0gTnVtYmVyKGNvb3JkaW5hdGUuWCk7XHJcbiAgICAgICAgICBzdW1PZlkgKz0gTnVtYmVyKGNvb3JkaW5hdGUuWSk7IFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm1pZFBvaW50PW5ldyBBeGlzKCk7XHJcbiAgICAgICAgdGhpcy5taWRQb2ludC5hZGRDYXJ0ZXNpYW4oXHJcbiAgICAgICAgICAgIHN1bU9mWCAvIGNvb3JkaW5hdGVzLmxlbmd0aCE9PTA/Y29vcmRpbmF0ZXMubGVuZ3RoOjFcclxuICAgICAgICAgICAgLHN1bU9mWSAvIGNvb3JkaW5hdGVzLmxlbmd0aCE9PTA/Y29vcmRpbmF0ZXMubGVuZ3RoOjFcclxuICAgICAgICApKi9cclxuICAgIH1cclxuXHJcbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3Qgb2cgPSB0aGlzLnRva2Vucy5zbGljZSgpLnJldmVyc2UoKS5maW5kKFxyXG4gICAgICAgICAgICAodG9rZW46IFRva2VuKSA9PlxyXG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gb2cgaW5zdGFuY2VvZiBDb29yZGluYXRlID8gb2cuY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgYXBwbHlRdWFkcmFudHMoKSB7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gXCJvYmplY3RcIiAmJiB0b2tlbiAhPT0gbnVsbCYmdG9rZW4udHlwZT09PVwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICAgICAgICAgIHRva2VuLmFkZFF1YWRyYW50KHRoaXMubWlkUG9pbnQpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHJlY29uc3RydWN0KCl7XHJcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XHJcbiAgICAgICAgY29uc3QgZXh0cmVtZVhZPWdldEV4dHJlbWVYWSh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG5cclxuICAgICAgICAgICAgaWYodG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlfHx0b2tlbiBpbnN0YW5jZW9mIERyYXcpe1xyXG4gICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9dG9rZW4udG9TdHJpbmcoKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICBpZiAodHlwZW9mIHRva2VuID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgICAgIHN3aXRjaCh0b2tlbi50eXBlKXsvKlxyXG4gICAgICAgICAgICAgICAgY2FzZSBcImNvb3JkaW5hdGVcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW4udG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJub2RlXCI6XHJcbiAgICAgICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IGBcXFxcbm9kZSAoJHt0b2tlbi5jb29yZGluYXRlTmFtZX0pIGF0ICgke3Rva2VuLlh9LCR7dG9rZW4uWX0pIFske2dlbmVyYXRlRm9ybWF0dGluZyh0b2tlbil9XSB7JHt0b2tlbi5sYWJlbH19O2A7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIFwiZHJhd1wiOlxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9dG9rZW4udG9TdHJpbmcoKVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcInh5YXhpc1wiOlxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9YFxcXFxkcmF3IFske3Rva2VuLnhEaXJlY3Rpb249PT1cInVwXCI/XCIte1N0ZWFsdGh9XCI6XCJ7U3RlYWx0aH0tXCJ9XSgke2V4dHJlbWVYWS5taW5YfSwwKWBcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWAtLSgke2V4dHJlbWVYWS5tYXhYfSwwKWBcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPXRva2VuLlhub2RlP2Bub2RlIFske3Rva2VuLlhmb3JtYXR0aW5nLnN1YnN0cmluZygxLHRva2VuLlhmb3JtYXR0aW5nLmxlbmd0aC0xKX1dIHske3Rva2VuLlhub2RlfX07YDpcIjtcIlxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCs9YFxcXFxkcmF3IFske3Rva2VuLnlEaXJlY3Rpb249PT1cInVwXCI/XCIte1N0ZWFsdGh9XCI6XCJ7U3RlYWx0aH0tXCJ9XSgke2V4dHJlbWVYWS5taW5ZfSwwKWBcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWAtLSgwLCR7ZXh0cmVtZVhZLm1heFl9KWBcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPXRva2VuLllub2RlP2Bub2RlIFske3Rva2VuLllmb3JtYXR0aW5nLnN1YnN0cmluZygxLHRva2VuLllmb3JtYXR0aW5nLmxlbmd0aC0xKX1dIHske3Rva2VuLllub2RlfX07YDpcIjtcIlxyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSBcImdyaWRcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbXSAoJHtleHRyZW1lWFkubWluWH0sJHtleHRyZW1lWFkubWluWX0pIGdyaWQgW3JvdGF0ZT0ke3Rva2VuPy5yb3RhdGV8fDB9LHhzdGVwPS43NWNtLHlzdGVwPS43NWNtXSAoJHtleHRyZW1lWFkubWF4WH0sJHtleHRyZW1lWFkubWF4WX0pO2BcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJjaXJjbGVcIjpcclxuICAgICAgICAgICAgICAgICAgICB0ZW1wPWNhbGN1bGF0ZUNpcmNsZSh0b2tlbi5jb29yZGluYXRlc1swXSx0b2tlbi5jb29yZGluYXRlc1sxXSx0b2tlbi5jb29yZGluYXRlc1syXSlcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbbGluZSB3aWR0aD0xcHQsJHt0b2tlbi5mb3JtYXR0aW5nfV0gKCR7dGVtcD8uY2VudGVyLlh9LCR7dGVtcD8uY2VudGVyLll9KSBjaXJjbGUgW3JhZGl1cz0ke3RlbXA/LnJhZGl1c31dO2BcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQrPWBcXFxcZHJhdyBbLXtTdGVhbHRofSwke3Rva2VuLmZvcm1hdHRpbmd8fFwiXCJ9XSgke3Rva2VuLmFuY2hvci5YfSwke3Rva2VuLmFuY2hvci5ZfSktLW5vZGUgW10geyR7dG9rZW4udGV4dH19KCR7dG9rZW4uWCt0b2tlbi5hbmNob3IuWH0sJHt0b2tlbi5ZK3Rva2VuLmFuY2hvci5ZfSk7YFxyXG4gICAgICAgICAgICAqL31cclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGRpc3NlY3RYWWF4aXMobWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkpIHtcclxuICAgIGxldCBYbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiLCBZbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiO1xyXG5cclxuICAgIGlmIChtYXRjaFsxXSAmJiBtYXRjaFsyXSkge1xyXG4gICAgICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcclxuICAgICAgICBZbm9kZSA9IG1hdGNoWzJdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XHJcbiAgICAgICAgWG5vZGU9WG5vZGVbMF0uc3Vic3RyaW5nKDEsWG5vZGUubGVuZ3RoKVxyXG4gICAgICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcInh5YXhpc1wiLFxyXG4gICAgICAgIFhmb3JtYXR0aW5nOiBtYXRjaFsxXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICAgICAgWWZvcm1hdHRpbmc6IG1hdGNoWzJdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcclxuICAgICAgICB4RGlyZWN0aW9uOiBtYXRjaFsxXSAmJiAvLT4vLnRlc3QobWF0Y2hbMV0pID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIsXHJcbiAgICAgICAgeURpcmVjdGlvbjogbWF0Y2hbMl0gJiYgLy0+Ly50ZXN0KG1hdGNoWzJdKSA/IFwiZG93blwiIDogXCJ1cFwiLFxyXG4gICAgICAgIFhub2RlOiBYbm9kZSxcclxuICAgICAgICBZbm9kZTogWW5vZGUsXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcclxubGV0IG1heFggPSAtSW5maW5pdHk7XHJcbmxldCBtYXhZID0gLUluZmluaXR5O1xyXG5sZXQgbWluWCA9IEluZmluaXR5O1xyXG5sZXQgbWluWSA9IEluZmluaXR5O1xyXG5cclxudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgIGlmICh0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcclxuICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XHJcblxyXG4gICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcclxuICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XHJcbiAgICB9XHJcbn0pO1xyXG5cclxucmV0dXJuIHtcclxuICAgIG1heFgsbWF4WSxtaW5YLG1pblksXHJcbn07XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbi8qXHJcbmZ1bmN0aW9uIGdlbmVyYXRlRm9ybWF0dGluZyhjb29yZGluYXRlOiBDb29yZGluYXRlKXtcclxuICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZS5sYWJlbCAhPT0gXCJzdHJpbmdcIil7IHJldHVybiBcIlwiOyB9XHJcbiAgICBjb25zdCBmb3JtYXR0aW5nID0gY29vcmRpbmF0ZS5mb3JtYXR0aW5nPy5zcGxpdChcIixcIikgfHwgW107XHJcbiAgICBpZiAoZm9ybWF0dGluZy5zb21lKCh2YWx1ZTogc3RyaW5nKSA9PiAvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLy50ZXN0KHZhbHVlKSkpIHtcclxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZS5mb3JtYXR0aW5nO1xyXG4gICAgfVxyXG4gICAgaWYoZm9ybWF0dGluZy5sZW5ndGg+MCYmIWZvcm1hdHRpbmdbZm9ybWF0dGluZy5sZW5ndGgtMV0uZW5kc1dpdGgoXCIsXCIpKXtmb3JtYXR0aW5nLnB1c2goXCIsXCIpfVxyXG4gICAgc3dpdGNoKGNvb3JkaW5hdGUucXVhZHJhbnQpe1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSByaWdodCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSBsZWZ0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IGxlZnQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDQ6IFxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IHJpZ2h0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZy5qb2luKFwiXCIpO1xyXG59XHJcbiovXHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoKTpzdHJpbmd7XHJcbiAgICBjb25zdCBhbmc9XCJcXFxcdGlrenNldHthbmcvLnN0eWxlIDIgYXJncz17ZmlsbD1ibGFjayE1MCxvcGFjaXR5PTAuNSx0ZXh0IG9wYWNpdHk9MC45LGRyYXc9b3JhbmdlLDwtPixhbmdsZSBlY2NlbnRyaWNpdHk9IzEsYW5nbGUgcmFkaXVzPSMyY20sdGV4dD1vcmFuZ2UsZm9udD1cXFxcbGFyZ2V9LGFuZy8uZGVmYXVsdD17MS42fXswLjV9fVwiXHJcbiAgXHJcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxyXG4gIFxyXG4gICAgY29uc3QgYXJyPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFycn1bOF17XFxcXGNvb3JkaW5hdGUgKDIpIGF0ICgkKCMyKSEjNyEoIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDEpIGF0ICgkKDIpISM1bW0hOTA6KCMzKSQpO1xcXFxjb29yZGluYXRlICgzKSBhdCAoJCgyKSEjNW1tKyM0Y20hIzg6KCMzKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCw8LV0gKDEpLS0oMylub2RlIFtwb3M9IzZdIHtcXFxcbGFyZ2UgIzF9O31cIiBcclxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxyXG4gICAgY29uc3Qgc3ByaW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXHNwcmluZ31bNF17XFxcXHRpa3ptYXRoe2Nvb3JkaW5hdGUgXFxcXHN0YXJ0LCBcXFxcZG9uZTtcXFxcc3RhcnQgPSAoIzEpO1xcXFxkb25lID0gKCMyKTt9XFxcXGRyYXdbdGhpY2tdICgkKFxcXFxzdGFydCkgKyAoLTEuNSwwKSQpIC0tKysoMywwKTtcXFxcZHJhdyAoXFxcXHN0YXJ0KSAtLSsgKDAsLTAuMjVjbSk7XFxcXGRyYXcgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgrMGNtLFxcXFxkb25leSswLjI1Y20pJCktLSsoMCwtMC4yNSk7XFxcXGRyYXdbZGVjb3JhdGlvbj17YXNwZWN0PTAuMywgc2VnbWVudCBsZW5ndGg9MywgYW1wbGl0dWRlPTJtbSxjb2lsLH0sZGVjb3JhdGVdIChcXFxcc3RhcnR4LFxcXFxzdGFydHktMC4yNWNtKSAtLSgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSswLjI1Y20pJClub2RlW21pZHdheSxyaWdodD0wLjI1Y20sYmxhY2tdeyM0fTtcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KSQpeyMzfTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHRhYmxlPVwiXFxcXHRpa3pzZXR7IHRhYmxlLy5zdHlsZT17bWF0cml4IG9mIG5vZGVzLHJvdyBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsY29sdW1uIHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxub2Rlcz17cmVjdGFuZ2xlLGRyYXc9YmxhY2ssYWxpZ249Y2VudGVyfSxtaW5pbXVtIGhlaWdodD0xLjVlbSx0ZXh0IGRlcHRoPTAuNWV4LHRleHQgaGVpZ2h0PTJleCxub2RlcyBpbiBlbXB0eSBjZWxscyxldmVyeSBldmVuIHJvdy8uc3R5bGU9e25vZGVzPXtmaWxsPWdyYXkhNjAsdGV4dD1ibGFjayx9fSxjb2x1bW4gMS8uc3R5bGU9e25vZGVzPXt0ZXh0IHdpZHRoPTVlbSxmb250PVxcXFxiZnNlcmllc319LHJvdyAxLy5zdHlsZT17bm9kZXM9e2ZvbnQ9XFxcXGJmc2VyaWVzfX19fVwiXHJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXHJcbiAgICAvL2NvbnN0IG1hc3M9YFxcXFxkZWZcXFxcbWFzcyMxIzJ7XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgjMSl7IzJ9O31gXHJcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXHJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcclxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcclxufSJdfQ==