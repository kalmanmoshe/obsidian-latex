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
        for (const [key, value] of Object.entries(formatting)) {
            if (typeof value === 'object') {
                //this.setProperty(key as keyof Formatting,formatting)
            }
            else if (value) {
                this.setProperty(key, value);
            }
        }
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
    addAxis(cartesianX, cartesianY, polarLength, polarAngle) {
        this.axis = new Axis(cartesianX, cartesianY, polarLength, polarAngle);
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
        if (typeof match.formatting === "string") {
            this.formatting.quickAdd(`draw`, {}, match.formatting);
        }
        else
            this.formatting.quickAdd(`draw`, match.formatting, '');
        if (typeof match.draw === "string") {
            this.coordinates = this.fillCoordinates(this.getSchematic(match.draw), tokens);
        }
        else {
            this.coordinates = this.createFromArray(match.draw);
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
                    //result +=`(${coordinate.toString()})`
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
        if (typeof source === "string") {
            this.source = this.tidyTikzSource(source);
            this.tokenize();
        }
        else
            this.tokens = source;
        this.debugInfo += this.source;
        this.findMidpoint();
        this.applyPostProcessing();
        this.debugInfo += "\n\nthis.midPoint:\n" + JSON.stringify(this.midPoint, null, 1) + "\n";
        this.debugInfo += JSON.stringify(this.tokens, null, 1) + "\n\n";
        this.processedCode += this.toString();
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
    toString() {
        let codeBlockOutput = "";
        const extremeXY = getExtremeXY(this.tokens);
        this.tokens.forEach((token) => {
            if (token.toString()) {
                codeBlockOutput += token.toString();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUE0QyxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3QyxhQUFhO0FBQ2IsT0FBTyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDNUMsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixxQkFBcUIsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDeEksT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBT2pELE1BQU0sT0FBTyxPQUFPO0lBQ2hCLEdBQUcsQ0FBTTtJQUNULE1BQU0sQ0FBYTtJQUNuQixVQUFVLENBQXNCO0lBRWhDLFlBQVksR0FBUSxFQUFDLE1BQWtCO1FBQ3JDLElBQUksQ0FBQyxHQUFHLEdBQUMsR0FBRyxDQUFDO1FBQ2IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsTUFBTSxHQUFDLE1BQU0sQ0FBQztJQUNyQixDQUFDO0lBRUQsV0FBVztRQUNULElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFO1lBQzNDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUU7Z0JBQzdFLElBQUksQ0FBQyxXQUFXLENBQUMs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QyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEVBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFBO1FBQ3RFLElBQUksSUFBSSxDQUFDLFFBQVEsSUFBRSxJQUFJLENBQUMsTUFBTSxFQUFDO1lBQUMsT0FBTTtTQUFDO1FBRXZDLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUUsRUFBRSxDQUFDO1FBQzlDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUUsRUFBRSxDQUFDO1FBQzdDLE1BQU0sS0FBSyxHQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUMsS0FBSyxDQUFDLENBQUE7UUFFbEMsSUFBSSxDQUFDLE1BQU0sR0FBRyxLQUFLLEtBQUssQ0FBQyxDQUFDO1FBRTFCLElBQUksUUFBUSxDQUFBO1FBQ1osSUFBSSxLQUFLLEtBQUcsS0FBSztZQUFDLFFBQVEsR0FBQyxLQUFLLEdBQUMsS0FBSyxDQUFDOztZQUNsQyxRQUFRLEdBQUMsS0FBSyxDQUFDO1FBRXBCLElBQUksS0FBSyxLQUFHLFFBQVEsSUFBRSxLQUFLLEtBQUcsQ0FBQyxRQUFRLEVBQUM7WUFDcEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFDLE9BQU8sQ0FBQyxDQUFBO1NBQzdFO1FBQ0QsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFDO1lBQ1osSUFBSSxDQUFDLFFBQVEsSUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFDLE1BQU0sQ0FBQyxDQUFBO1NBQzNFO1FBQ0Qsc0RBQXNEO1FBQ3RELElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsUUFBUSxFQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FB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d1JBQXdSLENBQUE7SUFDblMsTUFBTSxNQUFNLEdBQUMsMGdCQUEwZ0IsQ0FBQTtJQUV2aEIsTUFBTSxJQUFJLEdBQUMsaUtBQWlLLENBQUE7SUFFNUssTUFBTSxLQUFLLEdBQUMsNldBQTZXLENBQUE7SUFDelgsTUFBTSxJQUFJLEdBQUMsK0VBQStFLENBQUE7SUFDMUYsaUdBQWlHO0lBQ2pHLE1BQU0sT0FBTyxHQUFDLHNLQUFzSyxDQUFBO0lBRXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBQ2xRLE9BQU8sUUFBUSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxpRUFBaUUsQ0FBQTtBQUM3SSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBDb21wb25lbnQsIEVkaXRvciwgTWFya2Rvd25SZW5kZXJlciwgTWFya2Rvd25WaWV3LCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcInNyYy9tYWluXCI7XHJcbmltcG9ydCB7IG9wdGltaXplIH0gZnJvbSBcIi4vc3Znby5icm93c2VyLmpzXCI7XHJcbi8vIEB0cy1pZ25vcmVcclxuaW1wb3J0IHRpa3pqYXhKcyBmcm9tIFwiaW5saW5lOi4vdGlrempheC5qc1wiO1xyXG5pbXBvcnQgeyBjYXJ0ZXNpYW5Ub1BvbGFyLCBkZWdyZWVzVG9SYWRpYW5zLCBmaW5kSW50ZXJzZWN0aW9uUG9pbnQsIGZpbmRTbG9wZSwgcG9sYXJUb0NhcnRlc2lhbiwgdG9OdW1iZXIgfSBmcm9tIFwic3JjL21hdGhVdGlsaXRpZXMuanNcIjtcclxuaW1wb3J0IHsgRGVidWdNb2RhbCB9IGZyb20gXCJzcmMvZGVzcGx5TW9kYWxzLmpzXCI7XHJcblxyXG5pbXBvcnQgeyBFZGl0b3JWaWV3IH0gZnJvbSBcIkBjb2RlbWlycm9yL3ZpZXdcIjtcclxuaW1wb3J0IHsgZXJyb3IgfSBmcm9tIFwiY29uc29sZVwiO1xyXG5pbXBvcnQgeyBmbGF0dGVuQXJyYXkgfSBmcm9tIFwic3JjL21hdGhFbmdpbmUuanNcIjtcclxuXHJcblxyXG5leHBvcnQgY2xhc3MgVGlrempheCB7XHJcbiAgICBhcHA6IEFwcDtcclxuICAgIHBsdWdpbjogTWF0aFBsdWdpbjtcclxuICAgIGFjdGl2ZVZpZXc6IE1hcmtkb3duVmlldyB8IG51bGw7XHJcblxyXG4gICAgY29uc3RydWN0b3IoYXBwOiBBcHAscGx1Z2luOiBNYXRoUGx1Z2luKSB7XHJcbiAgICAgIHRoaXMuYXBwPWFwcDtcclxuICAgICAgdGhpcy5hY3RpdmVWaWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcclxuICAgICAgdGhpcy5wbHVnaW49cGx1Z2luO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZWFkeUxheW91dCgpe1xyXG4gICAgICB0aGlzLnBsdWdpbi5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XHJcbiAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC53b3Jrc3BhY2Uub24oXCJ3aW5kb3ctb3BlblwiLCAod2luLCB3aW5kb3cpID0+IHtcclxuICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9KSk7XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgXHJcbiAgICBsb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XHJcbiAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgcy5pZCA9IFwidGlrempheFwiO1xyXG4gICAgICAgIHMudHlwZSA9IFwidGV4dC9qYXZhc2NyaXB0XCI7XHJcbiAgICAgICAgcy5pbm5lclRleHQgPSB0aWt6amF4SnM7XHJcbiAgICAgICAgZG9jLmJvZHkuYXBwZW5kQ2hpbGQocyk7XHJcbiAgICAgICAgZG9jLmFkZEV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XHJcbiAgICB9XHJcbiAgXHJcbiAgICB1bmxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzID0gZG9jLmdldEVsZW1lbnRCeUlkKFwidGlrempheFwiKTtcclxuICAgICAgICBzPy5yZW1vdmUoKTtcclxuXHJcbiAgICAgICAgZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XHJcbiAgICB9XHJcbiAgXHJcbiAgICBsb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcclxuICAgICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICBcclxuICAgIHVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudW5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICBcclxuICAgIGdldEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgY29uc3Qgd2luZG93cyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIHB1c2ggdGhlIG1haW4gd2luZG93J3Mgcm9vdCBzcGxpdCB0byB0aGUgbGlzdFxyXG4gICAgICAgIHdpbmRvd3MucHVzaCh0aGlzLmFwcC53b3Jrc3BhY2Uucm9vdFNwbGl0Lndpbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQHRzLWlnbm9yZSBmbG9hdGluZ1NwbGl0IGlzIHVuZG9jdW1lbnRlZFxyXG4gICAgICAgIGNvbnN0IGZsb2F0aW5nU3BsaXQgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZmxvYXRpbmdTcGxpdDtcclxuICAgICAgICBmbG9hdGluZ1NwbGl0LmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBhIHdpbmRvdywgcHVzaCBpdCB0byB0aGUgbGlzdCBcclxuICAgICAgICAgICAgaWYgKGNoaWxkIGluc3RhbmNlb2YgV29ya3NwYWNlV2luZG93KSB7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3dzLnB1c2goY2hpbGQud2luKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gd2luZG93cztcclxuICAgIH1cclxuICBcclxuICBcclxuICAgIHJlZ2lzdGVyVGlrekNvZGVCbG9jaygpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZWwuY3JlYXRlRWwoXCJkaXZcIiksIHtcclxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcclxuICAgICAgICAgICAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRyeXtcclxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgICAgICBjb25zdCB0aWt6amF4PW5ldyBGb3JtYXRUaWt6amF4KHNvdXJjZSk7XHJcbiAgICAgICAgICAgIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLHRpa3pqYXguZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRUZXh0KHRpa3pqYXguZ2V0Q29kZSgpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaChlKXtcclxuICAgICAgICAgICAgICAgIGVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvckRpc3BsYXkgPSBlbC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJtYXRoLWVycm9yLWxpbmVcIiB9KTtcclxuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5pbm5lclRleHQgPSBgRXJyb3I6ICR7ZS5tZXNzYWdlfWA7XHJcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuY2xhc3NMaXN0LmFkZChcImVycm9yLXRleHRcIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiVGlrWiBQcm9jZXNzaW5nIEVycm9yOlwiLCBlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8gPSB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5maWx0ZXIoZWwgPT4gZWwubmFtZSAhPSBcIlRpa3pcIik7XHJcbiAgICAgIH1cclxuXHJcbiAgXHJcbiAgICAgIGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xyXG4gICAgICAgIHN2ZyA9IHN2Zy5yZXBsYWNlQWxsKC8oXCIjMDAwXCJ8XCJibGFja1wiKS9nLCBcIlxcXCJjdXJyZW50Q29sb3JcXFwiXCIpXHJcbiAgICAgICAgICAgICAgICAucmVwbGFjZUFsbCgvKFwiI2ZmZlwifFwid2hpdGVcIikvZywgXCJcXFwidmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KVxcXCJcIik7XHJcbiAgICAgICAgcmV0dXJuIHN2ZztcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgICBvcHRpbWl6ZVNWRyhzdmc6IHN0cmluZykge1xyXG4gICAgICAgICAgcmV0dXJuIG9wdGltaXplKHN2Zywge3BsdWdpbnM6XHJcbiAgICAgICAgICAgICAgW1xyXG4gICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInByZXNldC1kZWZhdWx0XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBvdmVycmlkZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW51cElEczogZmFsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICB9KT8uZGF0YTtcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgICBwb3N0UHJvY2Vzc1N2ZyA9IChlOiBFdmVudCkgPT4ge1xyXG4gIFxyXG4gICAgICAgICAgY29uc3Qgc3ZnRWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgIGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XHJcbiAgXHJcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSkge1xyXG4gICAgICAgICAgICBzdmcgPSB0aGlzLmNvbG9yU1ZHaW5EYXJrTW9kZShzdmcpO1xyXG4gICAgICAgICAgfVxyXG4gIFxyXG4gICAgICAgICAgc3ZnID0gdGhpcy5vcHRpbWl6ZVNWRyhzdmcpO1xyXG4gIFxyXG4gICAgICAgICAgc3ZnRWwub3V0ZXJIVE1MID0gc3ZnO1xyXG4gICAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcgfCBSZWdFeHAsIGZsYWdzOiBzdHJpbmcgPSAnJyk6IFJlZ0V4cCB7XHJcbiAgICBwYXR0ZXJuPXBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHA/cGF0dGVybi5zb3VyY2U6cGF0dGVybjtcclxuICAgIHJldHVybiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgJHtwYXR0ZXJufWAsIGZsYWdzP2ZsYWdzOicnKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0UmVnZXgoKXtcclxuICAgIGNvbnN0IGJhc2ljID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOl1gO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBiYXNpYzogYmFzaWMsXHJcbiAgICAgICAgbWVyZ2U6IFN0cmluZy5yYXdgW1xcK1xcLVxcfCFcXGQuXWAsXHJcbiAgICAgICAgLy9jb29yZGluYXRlOiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKCR7YmFzaWN9K3wxKWApLFxyXG4gICAgICAgIGNvb3JkaW5hdGVOYW1lOiBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWAsXHJcbiAgICAgICAgdGV4dDogU3RyaW5nLnJhd2BbXFx3XFxzLSwuOiQoISlfK1xcXFx7fT1dYCxcclxuICAgICAgICBmb3JtYXR0aW5nOiBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsmKltcXF17fSUtPD5dYFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuaW50ZXJmYWNlIHRva2VuICB7XHJcbiAgICBYPzogbnVtYmVyO1xyXG4gICAgWT86IG51bWJlcjtcclxuICAgIHR5cGU/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcclxuICAgIGNvb3JkaW5hdGVzPzogYW55O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5jb25zdCBwYXJzZU51bWJlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlczogQXJyYXk8QXhpcyB8IHN0cmluZz4sIGluZGV4OiBudW1iZXIpOiB7IGJlZm9yZTogbnVtYmVyLCBhZnRlcjogbnVtYmVyIH0ge1xyXG4gICAgICAgXHJcbiAgICBjb25zdCBiZWZvcmVJbmRleCA9IGF4ZXMuc2xpY2UoMCxpbmRleCkuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcylcclxuICAgIGNvbnN0IGFmdGVySW5kZXggPSBheGVzLmZpbmRJbmRleCgoYXhpczogYW55LGlkeDogbnVtYmVyKSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyYmaWR4PmluZGV4KTtcclxuXHJcbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xIHx8IGFmdGVySW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZmluZCB2YWxpZCBBeGlzIG9iamVjdHMuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSBhZnRlckluZGV4KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUHJhaXNlZCBheGlzIGFzIHNhbWUgdG9rZW5cIik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4geyBiZWZvcmU6IGJlZm9yZUluZGV4LCBhZnRlcjogYWZ0ZXJJbmRleCB9O1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEF4aXMge1xyXG4gICAgY2FydGVzaWFuWDogbnVtYmVyO1xyXG4gICAgY2FydGVzaWFuWTogbnVtYmVyO1xyXG4gICAgcG9sYXJBbmdsZTogbnVtYmVyO1xyXG4gICAgcG9sYXJMZW5ndGg6IG51bWJlcjtcclxuICAgIG5hbWU/OiBzdHJpbmc7XHJcbiAgICB1bml2ZXJzYWwoY29vcmRpbmF0ZTogc3RyaW5nLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGFuY2hvckFycj86IGFueSxhbmNob3I/OiBzdHJpbmcpOiBBeGlzIHtcclxuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZUFycjogQXJyYXk8QXhpc3xzdHJpbmc+ID0gW107XHJcbiAgICAgICAgbWF0Y2hlcy5mb3JFYWNoKChtYXRjaDogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xyXG4gICAgICAgICAgICBsZXQgYXhpczogQXhpc3x1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5hZGRDYXJ0ZXNpYW4obWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgLzovLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkUG9sYXIobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMucG9sYXJUb0NhcnRlc2lhbigpXHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvIVtcXGQuXSshLy50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAoL1tcXGRcXHddKy8pLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpXHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IHRva2Vucy5maW5kT3JpZ2luYWxWYWx1ZShtYXRjaCk/LmF4aXM7XHJcbiAgICAgICAgICAgICAgICBlbHNlIHRocm93IG5ldyBFcnJvcihgVHJpZWQgdG8gZmluZCBvcmlnaW5hbCBjb29yZGluYXRlIHZhbHVlIHdoaWxlIG5vdCBiZWluZyBwcm92aWRlZCB3aXRoIHRva2Vuc2ApO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChheGlzID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIHRoZSBjb29yZGluYXRlICR7bWF0Y2h9IGZyb20gJHtjb29yZGluYXRlfWApO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLm1lcmdlQXhpcyhjb29yZGluYXRlQXJyKVxyXG5cclxuICAgICAgICBpZihhbmNob3JBcnImJmFuY2hvciYmYW5jaG9yLm1hdGNoKC8oLS1cXCt8LS1cXCtcXCspLykpe1xyXG4gICAgICAgICAgICBsZXQgYTogQXhpc1xyXG4gICAgICAgICAgICBpZiAoYW5jaG9yLm1hdGNoKC8oLS1cXCspLykpe1xyXG4gICAgICAgICAgICAgICAgYT1hbmNob3JBcnIuZmluZCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgICAgICB9ZWxzZXtcclxuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmRMYXN0KChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGEsXCJhZGRpdGlvblwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBjb21wbGV4Q2FydGVzaWFuQWRkKGF4aXM6IEF4aXMsbW9kZTogc3RyaW5nLG1vZGlmaWVyPzogYW55KXtcclxuICAgICAgICBzd2l0Y2ggKG1vZGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImFkZGl0aW9uXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblgrPWF4aXMuY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWSs9YXhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJzdWJ0cmFjdGlvblwiOlxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyaWdodFByb2plY3Rpb25cIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD1heGlzLmNhcnRlc2lhblhcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiaW50ZXJuYWxQb2ludFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPSh0aGlzLmNhcnRlc2lhblgrYXhpcy5jYXJ0ZXNpYW5YKSptb2RpZmllcjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWT0odGhpcy5jYXJ0ZXNpYW5ZK2F4aXMuY2FydGVzaWFuWSkqbW9kaWZpZXI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKClcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfTtcclxuXHJcblxyXG4gICAgZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZTogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCByZWdleFBhdHRlcm4gPSBnZXRSZWdleCgpO1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbXHJcbiAgICAgICAgICAgIHJlZ0V4cChTdHJpbmcucmF3YCgke3JlZ2V4UGF0dGVybi5iYXNpY30rKWAsIFwiZ1wiKSxcclxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLm1lcmdlfSspYCwgXCJnXCIpXHJcbiAgICAgICAgXTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTdGVwIDE6IEV4dHJhY3QgbWF0Y2hlcyBmb3IgZWFjaCBwYXR0ZXJuIHNlcGFyYXRlbHlcclxuICAgICAgICBjb25zdCBiYXNpY01hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1swXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcclxuICAgICAgICAgICAgZnVsbE1hdGNoOiBtYXRjaFswXS5yZXBsYWNlKC8tJC9nLCBcIlwiKSwgLy8gUmVtb3ZlIHRyYWlsaW5nIGh5cGhlbiBvbmx5XHJcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxyXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtZXJnZU1hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1sxXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcclxuICAgICAgICAgICAgZnVsbE1hdGNoOiBtYXRjaFswXSxcclxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXHJcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1hdGNoZXM6IEFycmF5PHsgZnVsbE1hdGNoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyIH0+ID0gW107XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIGlzT3ZlcmxhcHBpbmcobWF0Y2gxOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0sIG1hdGNoMjogeyBpbmRleDogbnVtYmVyOyBsZW5ndGg6IG51bWJlciB9KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDEuaW5kZXggPCBtYXRjaDIuaW5kZXggKyBtYXRjaDIubGVuZ3RoICYmIG1hdGNoMi5pbmRleCA8IG1hdGNoMS5pbmRleCArIG1hdGNoMS5sZW5ndGg7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBbLi4uYmFzaWNNYXRjaGVzLCAuLi5tZXJnZU1hdGNoZXNdLmZvckVhY2gobWF0Y2ggPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBvdmVybGFwcGluZ0luZGV4ID0gbWF0Y2hlcy5maW5kSW5kZXgoZXhpc3RpbmdNYXRjaCA9PiBpc092ZXJsYXBwaW5nKGV4aXN0aW5nTWF0Y2gsIG1hdGNoKSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob3ZlcmxhcHBpbmdJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nTWF0Y2ggPSBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgY3VycmVudCBtYXRjaCBjb3ZlcnMgYSBsYXJnZXIgcmFuZ2UsIHJlcGxhY2UgdGhlIGV4aXN0aW5nIG9uZVxyXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA+IGV4aXN0aW5nTWF0Y2gubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XSA9IG1hdGNoO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKG1hdGNoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgMzogU29ydCB0aGUgZmluYWwgbWF0Y2hlcyBieSBpbmRleFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgNDogVmFsaWRhdGUgdGhlIHJlc3VsdFxyXG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb29yZGluYXRlIGlzIG5vdCB2YWxpZDsgZXhwZWN0ZWQgYSB2YWxpZCBjb29yZGluYXRlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIG1hdGNoZXM7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIpIHtcclxuICAgICAgICBpZiAoY2FydGVzaWFuWCAhPT0gdW5kZWZpbmVkKSB0aGlzLmNhcnRlc2lhblggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgIGlmIChjYXJ0ZXNpYW5ZICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWSA9IGNhcnRlc2lhblk7XHJcbiAgICAgICAgaWYgKHBvbGFyTGVuZ3RoICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJMZW5ndGggPSBwb2xhckxlbmd0aDtcclxuICAgICAgICBpZiAocG9sYXJBbmdsZSAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyQW5nbGUgPSBwb2xhckFuZ2xlO1xyXG4gICAgfVxyXG5cclxuICAgIGNsb25lKCk6IEF4aXMge1xyXG4gICAgICAgIHJldHVybiBuZXcgQXhpcyh0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSx0aGlzLnBvbGFyTGVuZ3RoLHRoaXMucG9sYXJBbmdsZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG4gICAgbWVyZ2VBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+KSB7XHJcbiAgICAgICAgaWYgKCFheGVzLnNvbWUoKGF4aXM6IGFueSkgPT4gdHlwZW9mIGF4aXMgPT09IFwic3RyaW5nXCIpKSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBheGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBheGVzW2ldO1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnQgIT09IFwic3RyaW5nXCIpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBjb25zdCBzaWRlcyA9IGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlcywgaSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUF4aXMgPSBheGVzW3NpZGVzLmJlZm9yZV0gYXMgQXhpcztcclxuICAgICAgICAgICAgY29uc3QgYWZ0ZXJBeGlzID0gYXhlc1tzaWRlcy5hZnRlcl0gYXMgQXhpcztcclxuXHJcbiAgICAgICAgICAgIGxldCAgbWF0Y2ggPSBjdXJyZW50Lm1hdGNoKC9eXFwrJC8pO1xyXG4gICAgICAgICAgICBsZXQgbW9kZSxtb2RpZmllcnM7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJhZGRpdGlvblwiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXi1cXHwkLylcclxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcclxuICAgICAgICAgICAgICAgIG1vZGUgPSBcInJpZ2h0UHJvamVjdGlvblwiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXlxcIShbXFxkLl0rKVxcISQvKVxyXG4gICAgICAgICAgICBpZighbW9kZSYmbWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiaW50ZXJuYWxQb2ludFwiXHJcbiAgICAgICAgICAgICAgICBtb2RpZmllcnM9dG9OdW1iZXIobWF0Y2hbMV0pXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmKG1vZGUpe1xyXG4gICAgICAgICAgICAgICAgYXhlcy5zcGxpY2Uoc2lkZXMuYmVmb3JlLCBzaWRlcy5hZnRlciAtIHNpZGVzLmJlZm9yZSArIDEsIGJlZm9yZUF4aXMuY29tcGxleENhcnRlc2lhbkFkZChhZnRlckF4aXMsbW9kZSxtb2RpZmllcnMpKTtcclxuICAgICAgICAgICAgICAgIGkgPSBzaWRlcy5iZWZvcmU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYXhlcy5sZW5ndGggPT09IDEgJiYgYXhlc1swXSBpbnN0YW5jZW9mIEF4aXMpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCAoYXhlc1swXSBhcyBBeGlzKS5jbG9uZSgpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHByb2plY3Rpb24oYXhpczE6IEF4aXN8dW5kZWZpbmVkLGF4aXMyOiBBeGlzfHVuZGVmaW5lZCk6YW55e1xyXG4gICAgICAgIGlmICghYXhpczF8fCFheGlzMil7dGhyb3cgbmV3IEVycm9yKFwiYXhpcydzIHdlcmUgdW5kZWZpbmVkIGF0IHByb2plY3Rpb25cIik7fVxyXG4gICAgICAgIHJldHVybiBbe1g6IGF4aXMxLmNhcnRlc2lhblgsWTogYXhpczIuY2FydGVzaWFuWX0se1g6IGF4aXMyLmNhcnRlc2lhblgsWTogYXhpczEuY2FydGVzaWFuWX1dXHJcbiAgICB9XHJcbiAgICBjb21iaW5lKGNvb3JkaW5hdGVBcnI6IGFueSl7XHJcbiAgICAgICAgbGV0IHg9MCx5PTA7XHJcbiAgICAgICAgY29vcmRpbmF0ZUFyci5mb3JFYWNoKChjb29yZGluYXRlOiBBeGlzKT0+e1xyXG4gICAgICAgICAgICB4Kz1jb29yZGluYXRlLmNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIHkrPWNvb3JkaW5hdGUuY2FydGVzaWFuWTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWD14O3RoaXMuY2FydGVzaWFuWT15O1xyXG4gICAgfVxyXG4gICAgYWRkQ2FydGVzaWFuKHg6IHN0cmluZyB8IG51bWJlciwgeT86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICgheSAmJiB0eXBlb2YgeCA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICBbeCwgeV0gPSB4LnNwbGl0KFwiLFwiKS5tYXAoTnVtYmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCB8fCB5ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBDYXJ0ZXNpYW4gY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNhcnRlc2lhblggPSB4IGFzIG51bWJlcjtcclxuICAgICAgICB0aGlzLmNhcnRlc2lhblkgPSB5IGFzIG51bWJlcjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcG9sYXJUb0NhcnRlc2lhbigpe1xyXG4gICAgICAgIGNvbnN0IHRlbXA9cG9sYXJUb0NhcnRlc2lhbih0aGlzLnBvbGFyQW5nbGUsIHRoaXMucG9sYXJMZW5ndGgpXHJcbiAgICAgICAgdGhpcy5hZGRDYXJ0ZXNpYW4odGVtcC5YLHRlbXAuWSlcclxuICAgIH1cclxuXHJcbiAgICBjYXJ0ZXNpYW5Ub1BvbGFyKCl7XHJcbiAgICAgICAgY29uc3QgdGVtcD1jYXJ0ZXNpYW5Ub1BvbGFyKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZKVxyXG4gICAgICAgIHRoaXMuYWRkUG9sYXIodGVtcC5hbmdsZSx0ZW1wLmxlbmd0aClcclxuICAgIH1cclxuXHJcbiAgICBhZGRQb2xhcihhbmdsZTogc3RyaW5nIHwgbnVtYmVyLCBsZW5ndGg/OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIWxlbmd0aCAmJiB0eXBlb2YgYW5nbGUgPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgICAgW2FuZ2xlLCBsZW5ndGhdID0gYW5nbGUuc3BsaXQoXCI6XCIpLm1hcChOdW1iZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoYW5nbGUgPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHBvbGFyIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wb2xhckFuZ2xlID0gYW5nbGUgYXMgbnVtYmVyO1xyXG4gICAgICAgIHRoaXMucG9sYXJMZW5ndGggPSBsZW5ndGggYXMgbnVtYmVyO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FydGVzaWFuWCtcIixcIit0aGlzLmNhcnRlc2lhblk7XHJcbiAgICB9XHJcblxyXG4gICAgaW50ZXJzZWN0aW9uKGNvb3JkOiBzdHJpbmcsIGZpbmRPcmlnaW5hbFZhbHVlOiAoY29vcmQ6IHN0cmluZykgPT4gQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZCk6IHtYOm51bWJlcixZOm51bWJlcn0ge1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcclxuICAgICAgICAgICAgLnJlcGxhY2UoL2ludGVyc2VjdGlvblxccz9vZlxccz8vZywgXCJcIilcclxuICAgICAgICAgICAgLnJlcGxhY2UoLyhcXHMqYW5kXFxzP3wtLSkvZywgXCIgXCIpXHJcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcclxuICAgICAgICAgICAgLm1hcChmaW5kT3JpZ2luYWxWYWx1ZSlcclxuICAgICAgICAgICAgLmZpbHRlcigodG9rZW4pOiB0b2tlbiBpcyBDb29yZGluYXRlID0+IHRva2VuICE9PSB1bmRlZmluZWQpO1xyXG5cclxuICAgICAgICBpZiAob3JpZ2luYWxDb29yZHMubGVuZ3RoIDwgNCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnRlcnNlY3Rpb24gaGFkIHVuZGVmaW5lZCBjb29yZGluYXRlcyBvciBpbnN1ZmZpY2llbnQgZGF0YS5cIik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBzbG9wZXMgPSBbXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1swXS5heGlzLCBvcmlnaW5hbENvb3Jkc1sxXS5heGlzKSxcclxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMsIG9yaWdpbmFsQ29vcmRzWzNdLmF4aXMpLFxyXG4gICAgICAgIF07XHJcblxyXG4gICAgICAgIHJldHVybiBmaW5kSW50ZXJzZWN0aW9uUG9pbnQob3JpZ2luYWxDb29yZHNbMF0uYXhpcywgb3JpZ2luYWxDb29yZHNbMl0uYXhpcywgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBjb3ZvcnQodmFsdWU6IG51bWJlcixjb252cnNpbjogc3RyaW5nKXtcclxuXHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBtYXRjaEtleVdpdGhWYWx1ZShrZXk6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICBjb25zdCB2YWx1ZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcclxuICAgICAgICBcImFuY2hvclwiOiBcImFuY2hvcj1cIixcclxuICAgICAgICBcInJvdGF0ZVwiOiBcInJvdGF0ZT1cIixcclxuICAgICAgICBcImxpbmVXaWR0aFwiOiBcImxpbmUgd2lkdGg9XCIsXHJcbiAgICAgICAgXCJmaWxsXCI6IFwiZmlsbD1cIixcclxuICAgICAgICBcImZpbGxPcGFjaXR5XCI6IFwiZmlsbCBvcGFjaXR5PVwiLFxyXG4gICAgICAgIFwidGV4dENvbG9yXCI6IFwidGV4dCBjb2xvcj1cIixcclxuICAgICAgICBcImRyYXdcIjogXCJkcmF3PVwiLFxyXG4gICAgICAgIFwidGV4dFwiOiBcInRleHQ9XCIsXHJcbiAgICAgICAgXCJwb3NcIjogXCJwb3M9XCIsXHJcbiAgICAgICAgXCJkZWNvcmF0ZVwiOiBcImRlY29yYXRlXCIsXHJcbiAgICAgICAgXCJzbG9wZWRcIjogXCJzbG9wZWRcIixcclxuICAgICAgICBcImRlY29yYXRpb25cIjogXCJkZWNvcmF0aW9uPVwiLFxyXG4gICAgICAgIFwiZGVjb3JhdGlvbi5icmFjZVwiOiBcImJyYWNlXCIsXHJcbiAgICAgICAgXCJkZWNvcmF0aW9uLmFtcGxpdHVkZVwiOiBcImFtcGxpdHVkZT1cIlxyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gdmFsdWVNYXBba2V5XSB8fCAnJztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XHJcblxyXG4gICAgbW9kZTogc3RyaW5nO1xyXG4gICAgcm90YXRlPzogbnVtYmVyO1xyXG4gICAgYW5jaG9yPzogc3RyaW5nO1xyXG4gICAgbGluZVdpZHRoPzogbnVtYmVyO1xyXG4gICAgd2lkdGg/OiBzdHJpbmc7XHJcbiAgICBjb2xvcj86IHN0cmluZztcclxuICAgIHRleHRDb2xvcj86IHN0cmluZztcclxuICAgIGZpbGw/OiBzdHJpbmc7XHJcbiAgICBmaWxsT3BhY2l0eT86IG51bWJlcjtcclxuICAgIGFycm93Pzogc3RyaW5nO1xyXG4gICAgZHJhdz86IHN0cmluZztcclxuICAgIHRleHQ/OiBzdHJpbmc7XHJcbiAgICBwYXRoQXR0cmlidXRlPzogc3RyaW5nO1xyXG4gICAgdGlrenNldD86IHN0cmluZztcclxuICAgIHBvcz86IG51bWJlcjtcclxuICAgIHBvc2l0aW9uPzogc3RyaW5nO1xyXG4gICAgbGluZVN0eWxlPzogc3RyaW5nO1xyXG4gICAgc2xvcGVkPzogYm9vbGVhbjtcclxuICAgIGRlY29yYXRpb24/OiB7YnJhY2U/OiBib29sZWFuLGNvaWw6IGJvb2xlYW4sYW1wbGl0dWRlPzogbnVtYmVyLGFzcGVjdDogbnVtYmVyLHNlZ21lbnRMZW5ndGg6bnVtYmVyfTtcclxuICAgIGRlY29yYXRlPzogYm9vbGVhbjtcclxuXHJcbiAgICBxdWlja0FkZChtb2RlOiBzdHJpbmcsZm9ybWF0dGluZzogYW55LGZvcm1hdHRpbmdGb3JJbnRlcnByZXRhdGlvbj86c3RyaW5nICl7XHJcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nU3BlY2lmaWNUb01vZGUoKTtcclxuICAgICAgICB0aGlzLmludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZ0ZvckludGVycHJldGF0aW9ufHxcIlwiKVxyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmb3JtYXR0aW5nKSkge1xyXG4gICAgICAgICAgICBpZih0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKXtcclxuICAgICAgICAgICAgICAgIC8vdGhpcy5zZXRQcm9wZXJ0eShrZXkgYXMga2V5b2YgRm9ybWF0dGluZyxmb3JtYXR0aW5nKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFByb3BlcnR5KGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nLHZhbHVlKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGZvcm1hdHRpbmdTcGVjaWZpY1RvTW9kZSgpe1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLW1hc3NcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD1cInllbGxvdyE2MFwiO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoQXR0cmlidXRlPVwiZHJhd1wiO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0PVwiYmxhY2tcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhZGRTcGxvcEFuZFBvc2l0aW9uKGFycjogYW55LGluZGV4OiBudW1iZXIpe1xyXG4gICAgICAgIGNvbnN0IGJlZm9yZUFmdGVyPWZpbmRCZWZvcmVBZnRlckF4aXMoYXJyLGluZGV4KTtcclxuICAgICAgICBjb25zdCBbYmVmb3JlLCBhZnRlcl09W2FycltiZWZvcmVBZnRlci5iZWZvcmVdLGFycltiZWZvcmVBZnRlci5hZnRlcl1dXHJcbiAgICAgICAgaWYgKHRoaXMucG9zaXRpb258fHRoaXMuc2xvcGVkKXtyZXR1cm59XHJcbiAgICBcclxuICAgICAgICBjb25zdCBlZGdlMSA9IGJlZm9yZS5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcclxuICAgICAgICBjb25zdCBlZGdlMiA9IGFmdGVyLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xyXG4gICAgICAgIGNvbnN0IHNsb3BlPWZpbmRTbG9wZShlZGdlMSxlZGdlMilcclxuXHJcbiAgICAgICAgdGhpcy5zbG9wZWQgPSBzbG9wZSAhPT0gMDtcclxuXHJcbiAgICAgICAgbGV0IHF1YWRyYW50XHJcbiAgICAgICAgaWYgKGVkZ2UxIT09ZWRnZTIpcXVhZHJhbnQ9ZWRnZTErZWRnZTI7XHJcbiAgICAgICAgZWxzZSBxdWFkcmFudD1lZGdlMTtcclxuXHJcbiAgICAgICAgaWYgKHNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5KXtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHF1YWRyYW50LnJlcGxhY2UoLygzfDQpLyxcImJlbG93XCIpLnJlcGxhY2UoLygxfDQpLyxcImFib3ZlXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLnNsb3BlZCl7XHJcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb24rPXF1YWRyYW50LnJlcGxhY2UoLygyfDMpLyxcInJpZ2h0XCIpLnJlcGxhY2UoLygxfDQpLyxcImxlZnRcIilcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gUmVtb3ZlIHVudXNlZCBxdWFkcmFudHMuIGFuZCBBZGQgc3BhY2UgaWYgdHdvIHdvcmRzXHJcbiAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHRoaXMucG9zaXRpb24/LnJlcGxhY2UoL1tcXGRdKy9nLFwiXCIpLnJlcGxhY2UoLyhiZWxvd3xhYm92ZSkocmlnaHR8cmlnaHQpLyxcIiQxICQyXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZzogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCBzcGxpdEZvcm1hdHRpbmc9Zm9ybWF0dGluZy5tYXRjaCgvKD86e1tefV0qfXxbXix7fV0rKSsvZykgfHwgW107XHJcbiAgICAgICAgc3BsaXRGb3JtYXR0aW5nLmZvckVhY2goZm9ybWF0dGluZyA9PiB7XHJcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coZm9ybWF0dGluZylcclxuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBmb3JtYXR0aW5nLm1hdGNoKC9eKFtePV0rKT17KC4qKX0kLyk7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAhIW1hdGNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgIFtfLHBhcmVudCwgY2hpbGRyZW5dPW1hdGNoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmludGVycHJldEZvcm1hdHRpbmcoY2hpbGRyZW4pXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSBmb3JtYXR0aW5nLmluY2x1ZGVzKFwibGluZXdpZHRoXCIpOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImxpbmVXaWR0aFwiLGZvcm1hdHRpbmcpXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlIGZvcm1hdHRpbmcuaW5jbHVkZXMoXCJmaWxsPVwiKToge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJmaWxsXCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgZm9ybWF0dGluZy5pbmNsdWRlcyhcImZpbGxvcGFjaXR5XCIpOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImZpbGxPcGFjaXR5XCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKC0+fDwtfC0qe1N0ZWFsdGh9LSopJC8pOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hcnJvdyA9IGZvcm1hdHRpbmdcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpezEsMn0kLyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvc2l0aW9uPWZvcm1hdHRpbmcucmVwbGFjZSgvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLyxcIiQxIFwiKVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15wb3M9Lyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwicG9zXCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZHJhdz0vKToge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJkcmF3XCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZGVjb3JhdGUkLyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRlY29yYXRlPXRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXnRleHQ9Lyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwidGV4dFwiLGZvcm1hdHRpbmcpXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXmJyYWNlJC8pOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4sKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eYW1wbGl0dWRlLyk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRlY29yYXRpb25cIixmb3JtYXR0aW5nLFwiYW1wbGl0dWRlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+LClcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZHJhdyQvKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhdGhBdHRyaWJ1dGUgPSBmb3JtYXR0aW5nO2JyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15oZWxwbGluZXMkLyk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aWt6c2V0ID0gZm9ybWF0dGluZy5yZXBsYWNlKC9oZWxwbGluZXMvZyxcImhlbHAgbGluZXNcIik7YnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxkLl0rKXsxLDV9JC8pOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29sb3I9Zm9ybWF0dGluZzticmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKGRvdHRlZHxkYXNoZWR8c21vb3RofGRlbnNlbHl8bG9vc2VseSl7MSwyfSQvKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpbmVTdHlsZT1mb3JtYXR0aW5nLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLyxcIiQxIFwiKTticmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcclxuICAgICAgICBrZXk6IEssXHJcbiAgICAgICAgZm9ybWF0dGluZzogYW55LFxyXG4gICAgICAgIG5lc3RlZEtleT86IE5LXHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBsZXQgdmFsdWU7XHJcblxyXG4gICAgICAgIGlmKHR5cGVvZiBmb3JtYXR0aW5nIT09XCJib29sZWFuXCIpe1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBmb3JtYXR0aW5nLnNwbGl0KFwiPVwiKTtcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBFbnN1cmUgdGhlIGZvcm1hdHRpbmcgc3RyaW5nIGlzIHZhbGlkXHJcbiAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPCAyIHx8ICFtYXRjaFsxXSkgcmV0dXJuO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXHJcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gbWF0Y2hbMV0udHJpbSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHZhbHVlIGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nXHJcbiAgICAgICAgICAgIHZhbHVlID0gIWlzTmFOKHBhcnNlRmxvYXQocmF3VmFsdWUpKSAmJiBpc0Zpbml0ZSgrcmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA6IHJhd1ZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB2YWx1ZT1mb3JtYXR0aW5nXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuc2V0UHJvcGVydHkoa2V5LCB2YWx1ZSwgbmVzdGVkS2V5KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgc2V0UHJvcGVydHk8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxyXG4gICAgICAgIGtleTogSyxcclxuICAgICAgICB2YWx1ZTogYW55LFxyXG4gICAgICAgIG5lc3RlZEtleT86IE5LXHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nT2JqID0gdGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChuZXN0ZWRLZXkpIHtcclxuICAgICAgICAgICAgaWYgKCFmb3JtYXR0aW5nT2JqW2tleV0gfHwgdHlwZW9mIGZvcm1hdHRpbmdPYmpba2V5XSAhPT0gJ29iamVjdCcpIHtcclxuICAgICAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XSA9IHt9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XVtuZXN0ZWRLZXldID0gdmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZm9ybWF0dGluZ09ialtrZXldID0gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuICAgIHRvU3RyaW5nKCk6IHN0cmluZyB7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nWyc7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModGhpcykpIHtcclxuICAgICAgICAgICAgaWYgKGtleT09PVwibW9kZVwiKXtjb250aW51ZTt9XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpe1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nKz10aGlzLmhhbmRsZU9iamVjdFRvU3RyaW5nKHZhbHVlLGtleSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrKHR5cGVvZiB2YWx1ZT09PVwiYm9vbGVhblwiPycnOnZhbHVlKSsnLCc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZytcIl1cIjtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVPYmplY3RUb1N0cmluZyhvYmo6IG9iamVjdCwgcGFyZW50S2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQ29vcmRpbmF0ZSB7XHJcbiAgICBtb2RlOiBzdHJpbmc7XHJcbiAgICBheGlzOiBBeGlzO1xyXG4gICAgb3JpZ2luYWw/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcclxuICAgIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nO1xyXG4gICAgbGFiZWw/OiBzdHJpbmc7XHJcbiAgICBxdWFkcmFudD86IG51bWJlcjtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgbW9kZT86IHN0cmluZyxcclxuICAgICAgICBheGlzPzogQXhpcyxcclxuICAgICAgICBvcmlnaW5hbD86IHN0cmluZyxcclxuICAgICAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZyxcclxuICAgICAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxcclxuICAgICAgICBsYWJlbD86IHN0cmluZyxcclxuICAgICAgICBxdWFkcmFudD86IG51bWJlclxyXG4gICAgKSB7XHJcblxyXG4gICAgICAgIGlmIChtb2RlICE9PSB1bmRlZmluZWQpIHRoaXMubW9kZSA9IG1vZGU7XHJcbiAgICAgICAgaWYgKGF4aXMgIT09IHVuZGVmaW5lZCkgdGhpcy5heGlzID0gYXhpcztcclxuICAgICAgICB0aGlzLm9yaWdpbmFsID0gb3JpZ2luYWw7XHJcbiAgICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSA9IGNvb3JkaW5hdGVOYW1lO1xyXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZyA9IGZvcm1hdHRpbmc7XHJcbiAgICAgICAgdGhpcy5sYWJlbCA9IGxhYmVsO1xyXG4gICAgICAgIHRoaXMucXVhZHJhbnQgPSBxdWFkcmFudDtcclxuICAgIH1cclxuICAgIGNsb25lKCk6IENvb3JkaW5hdGUge1xyXG4gICAgICAgIHJldHVybiBuZXcgQ29vcmRpbmF0ZShcclxuICAgICAgICAgICAgdGhpcy5tb2RlLFxyXG4gICAgICAgICAgICB0aGlzLmF4aXMuY2xvbmUoKSxcclxuICAgICAgICAgICAgdGhpcy5vcmlnaW5hbCxcclxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSxcclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nLFxyXG4gICAgICAgICAgICB0aGlzLmxhYmVsLFxyXG4gICAgICAgICAgICB0aGlzLnF1YWRyYW50XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgIGFkZEF4aXMoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIpe1xyXG4gICAgICAgIHRoaXMuYXhpcz1uZXcgQXhpcyhjYXJ0ZXNpYW5YLCBjYXJ0ZXNpYW5ZLCBwb2xhckxlbmd0aCwgcG9sYXJBbmdsZSk7XHJcbiAgICB9XHJcbiAgICBhZGRJbmZvKG1hdGNoOiB7b3JpZ2luYWw/OiBzdHJpbmcsY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmcsbGFiZWw/OiBzdHJpbmcsZm9ybWF0dGluZz86IHN0cmluZ30sIG1vZGU6IHN0cmluZyx0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGZvcm1hdHRpbmc/OiBvYmplY3QpIHtcclxuICAgICAgICB0aGlzLm1vZGU9bW9kZTtcclxuICAgICAgICAoW3tvcmlnaW5hbDogdGhpcy5vcmlnaW5hbCxjb29yZGluYXRlTmFtZTogdGhpcy5jb29yZGluYXRlTmFtZSxsYWJlbDogdGhpcy5sYWJlbH1dPVttYXRjaF0pXHJcblxyXG4gICAgICAgIGlmKHRoaXMub3JpZ2luYWwpe1xyXG4gICAgICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoKS51bml2ZXJzYWwodGhpcy5vcmlnaW5hbCx0b2tlbnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZy5xdWlja0FkZCh0aGlzLm1vZGUsZm9ybWF0dGluZyxtYXRjaC5mb3JtYXR0aW5nKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29vcmRpbmF0ZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBcXFxcY29vcnske3RoaXMuYXhpcy50b1N0cmluZygpfX17JHt0aGlzLmNvb3JkaW5hdGVOYW1lIHx8IFwiXCJ9fXske3RoaXMubGFiZWwgfHwgXCJcIn19e31gO1xyXG4gICAgICAgICAgICBjYXNlIFwibm9kZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLWlubGluZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBub2RlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSB7JHt0aGlzLmxhYmVsfX1gXHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLW1hc3NcIjpcclxuICAgICAgICAgICAgICAgIHJldHVybiBgXFxcXG5vZGUgJHt0aGlzLmNvb3JkaW5hdGVOYW1lPycoJyt0aGlzLmNvb3JkaW5hdGVOYW1lKycpJzonJ30gYXQgKCR7dGhpcy5heGlzLnRvU3RyaW5nKCl9KSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKX0geyR7dGhpcy5sYWJlbH19O2BcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgbW9kZSBhdCB0byBzdHJpbmcgY29vcmRpbmF0ZVwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgIH1cclxuXHJcbiAgICBhZGRRdWFkcmFudChtaWRQb2ludDogQXhpcykge1xyXG4gICAgICAgIGNvbnN0IHhEaXJlY3Rpb24gPSB0aGlzLmF4aXMuY2FydGVzaWFuWCA+IG1pZFBvaW50LmNhcnRlc2lhblggPyAxIDogLTE7XHJcbiAgICAgICAgY29uc3QgeURpcmVjdGlvbiA9IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZID4gbWlkUG9pbnQuY2FydGVzaWFuWSA/IDEgOiAtMTtcclxuICAgICAgICB0aGlzLnF1YWRyYW50ID0geURpcmVjdGlvbiA9PT0gMSA/ICh4RGlyZWN0aW9uID09PSAxID8gMSA6IDIpIDogKHhEaXJlY3Rpb24gPT09IDEgPyA0IDogMyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbnR5cGUgVG9rZW4gPUF4aXMgfCBDb29yZGluYXRlIHxEcmF3fEZvcm1hdHRpbmd8IHN0cmluZztcclxuXHJcbmV4cG9ydCBjbGFzcyBEcmF3IHtcclxuICAgIG1vZGU/OiBzdHJpbmdcclxuICAgIGZvcm1hdHRpbmc6IEZvcm1hdHRpbmc9bmV3IEZvcm1hdHRpbmcoKTtcclxuICAgIGNvb3JkaW5hdGVzOiBBcnJheTxUb2tlbj47XHJcblxyXG4gICAgY29uc3RydWN0b3IobWF0Y2g6IHtmb3JtYXR0aW5nOiBzdHJpbmd8YW55LGRyYXc6IHN0cmluZ3xhbnl9LCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LG1vZGU/OiBzdHJpbmcpIHtcclxuICAgICAgICB0aGlzLm1vZGU9bW9kZTtcclxuICAgICAgICB0aGlzLm1vZGU9YGRyYXcke21vZGU/XCItXCIrbW9kZTpcIlwifWA7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBtYXRjaC5mb3JtYXR0aW5nID09PVwic3RyaW5nXCIpe1xyXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmcucXVpY2tBZGQoYGRyYXdgLHt9LG1hdGNoLmZvcm1hdHRpbmcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nLnF1aWNrQWRkKGBkcmF3YCxtYXRjaC5mb3JtYXR0aW5nLCcnKTtcclxuXHJcbiAgICAgICAgaWYodHlwZW9mIG1hdGNoLmRyYXc9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcyA9IHRoaXMuZmlsbENvb3JkaW5hdGVzKHRoaXMuZ2V0U2NoZW1hdGljKG1hdGNoLmRyYXcpLCB0b2tlbnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB0aGlzLmNvb3JkaW5hdGVzPXRoaXMuY3JlYXRlRnJvbUFycmF5KG1hdGNoLmRyYXcpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNyZWF0ZUZyb21BcnJheShhcnI6IGFueSl7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPGFyci5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgaWYgKGFycltpXSBpbnN0YW5jZW9mIEF4aXN8fGFycltpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpe1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZih0eXBlb2YgYXJyPT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGNvb3JkaW5hdGVzQXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVzQXJyYXlbaV0gaW5zdGFuY2VvZiBDb29yZGluYXRlKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgZm91bmQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHdoaWxlIChpIDwgY29vcmRpbmF0ZXNBcnJheS5sZW5ndGggJiYgIWZvdW5kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZXNBcnJheVtpXSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVzQXJyYXlbaV0gaW5zdGFuY2VvZiBDb29yZGluYXRlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpLS07IFxyXG4gICAgICAgICAgICAgICAgaWYgKGZvdW5kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKCctLScpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xyXG4gICAgfVxyXG5cclxuICAgIGZpbGxDb29yZGluYXRlcyhzY2hlbWF0aWM6IGFueVtdLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4KSB7XHJcbiAgICAgICAgY29uc3QgY29vckFycjogQXJyYXk8VG9rZW4+PVtdO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NoZW1hdGljLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcclxuICAgICAgICAgICAgICAgIGxldCBwcmV2aW91c0Zvcm1hdHRpbmc7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGkgPiAwICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDFdLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID4gMSAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwibm9kZVwiICYmIHNjaGVtYXRpY1tpIC0gMl0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDJdLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBBeGlzKCkudW5pdmVyc2FsKHNjaGVtYXRpY1tpXS52YWx1ZSwgdG9rZW5zLCBjb29yQXJyLCBwcmV2aW91c0Zvcm1hdHRpbmcsICkpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwibm9kZVwiKXtcclxuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChuZXcgQ29vcmRpbmF0ZSgpLmFkZEluZm8oe2xhYmVsOiBzY2hlbWF0aWNbaV0udmFsdWUsZm9ybWF0dGluZzogc2NoZW1hdGljW2ldLmZvcm1hdHRpbmd9LFwibm9kZS1pbmxpbmVcIix0b2tlbnMpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKHNjaGVtYXRpY1tpXS52YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvb3JBcnI7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0U2NoZW1hdGljKGRyYXc6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4PWdldFJlZ2V4KCk7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xyXG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IHJlZ0V4cChTdHJpbmcucmF3YG5vZGVcXHMqXFxbKCR7cmVnZXguZm9ybWF0dGluZ30qKVxcXVxccyp7KCR7cmVnZXgudGV4dH0qKX1gKTtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nUmVnZXggPSAvKC0tY3ljbGV8Y3ljbGV8LS1cXCtcXCt8LS1cXCt8LS18LVxcfHxcXHwtfGdyaWR8Y2lyY2xlfHJlY3RhbmdsZSkvO1xyXG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHNcXC0sLjpgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YChcXChbJHtjYX1dK1xcKXxcXChcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K1xcLV0rXFwoWyR7Y2F9XStcXClcXCRcXCkpYCk7XHJcbiAgICAgICAgbGV0IGkgPSAwO1xyXG4gICAgICAgIGxldCBsb29wcyA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGkgPCBkcmF3Lmxlbmd0aCAmJiBsb29wcyA8IDEwMCkgeyAvLyBJbmNyZWFzZSBsb29wIGxpbWl0IG9yIGFkZCBjb25kaXRpb24gYmFzZWQgb24gcGFyc2VkIGxlbmd0aFxyXG4gICAgICAgICAgICBsb29wcysrO1xyXG4gICAgICAgICAgICBjb25zdCBjb29yZGluYXRlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGNvb3JkaW5hdGVSZWdleCk7XHJcbiAgICAgICAgICAgIFxyXG5cclxuICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiY29vcmRpbmF0ZVwiLCB2YWx1ZTogY29vcmRpbmF0ZU1hdGNoWzFdIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChmb3JtYXR0aW5nTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBpICs9IGZvcm1hdHRpbmdNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3Qgbm9kZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAobm9kZU1hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm5vZGVcIixcclxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBub2RlTWF0Y2hbMV0gfHwgXCJcIixcclxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogbm9kZU1hdGNoWzJdXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbm9kZU1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobG9vcHMgPT09IDEwMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQYXJzaW5nIGV4Y2VlZGVkIHNhZmUgbG9vcCBjb3VudFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNDb29yZGluYXRlKG9iajogYW55KTogb2JqIGlzIENvb3JkaW5hdGUge1xyXG4gICAgICAgIHJldHVybiBvYmogJiYgb2JqIGluc3RhbmNlb2YgQ29vcmRpbmF0ZTtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3ICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSBgO1xyXG4gICAgICAgIGxldCBiZWZvcmVUb2tlbjogQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgYWZ0ZXJUb2tlbjogQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZDtcclxuICAgICAgICBsZXQgc2xvcGU7XHJcblxyXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXMuZm9yRWFjaCgoY29vcmRpbmF0ZTogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSYmY29vcmRpbmF0ZS5tb2RlPT09XCJub2RlLWlubGluZVwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGNvb3JkaW5hdGUudG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgdHlwZW9mIGNvb3JkaW5hdGU9PT1cInN0cmluZ1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IC8oLS1cXCtcXCt8LS1cXCspLy50ZXN0KGNvb3JkaW5hdGUpP1wiLS1cIjpjb29yZGluYXRlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vcmVzdWx0ICs9YCgke2Nvb3JkaW5hdGUudG9TdHJpbmcoKX0pYFxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEZvcm1hdFRpa3pqYXgge1xyXG5cdHNvdXJjZTogc3RyaW5nO1xyXG4gICAgdG9rZW5zOiBBcnJheTxUb2tlbj49W107XHJcbiAgICBtaWRQb2ludDogQXhpcztcclxuXHRwcm9jZXNzZWRDb2RlPVwiXCI7XHJcbiAgICBkZWJ1Z0luZm8gPSBcIlwiO1xyXG4gICAgXHJcblx0Y29uc3RydWN0b3Ioc291cmNlOiBzdHJpbmd8QXJyYXk8VG9rZW4+KSB7XHJcbiAgICAgICAgaWYodHlwZW9mIHNvdXJjZT09PVwic3RyaW5nXCIpe1xyXG5cdFx0dGhpcy5zb3VyY2UgPSB0aGlzLnRpZHlUaWt6U291cmNlKHNvdXJjZSk7XHJcbiAgICAgICAgdGhpcy50b2tlbml6ZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHRoaXMudG9rZW5zPXNvdXJjZVxyXG5cclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5zb3VyY2U7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5maW5kTWlkcG9pbnQoKTtcclxuICAgICAgICB0aGlzLmFwcGx5UG9zdFByb2Nlc3NpbmcoKTtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9XCJcXG5cXG50aGlzLm1pZFBvaW50OlxcblwiK0pTT04uc3RyaW5naWZ5KHRoaXMubWlkUG9pbnQsbnVsbCwxKStcIlxcblwiXHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPUpTT04uc3RyaW5naWZ5KHRoaXMudG9rZW5zLG51bGwsMSkrXCJcXG5cXG5cIlxyXG5cclxuICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpO1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnByb2Nlc3NlZENvZGU7XHJcblx0fVxyXG4gICAgXHJcbiAgICB0aWR5VGlrelNvdXJjZSh0aWt6U291cmNlOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xyXG4gICAgICAgIHRpa3pTb3VyY2UgPSB0aWt6U291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSB0aWt6U291cmNlLnNwbGl0KFwiXFxuXCIpO1xyXG4gICAgICAgIGxpbmVzID0gbGluZXMubWFwKGxpbmUgPT4gbGluZS50cmltKCkpO1xyXG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XHJcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKTs7XHJcbiAgICB9XHJcblxyXG4gICAgYXBwbHlQb3N0UHJvY2Vzc2luZygpe1xyXG4gICAgICAgIGZvcihsZXQgaT0wO2k8dGhpcy50b2tlbnMubGVuZ3RoO2krKyl7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGdldENvZGUoKXtcclxuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XHJcbiAgICB9XHJcbiAgICB0b2tlbml6ZSgpIHtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzLSwuOnxgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXHJcbiAgICAgICAgY29uc3QgYyA9IFN0cmluZy5yYXdgWyQoXXswLDJ9WyR7Y2F9XStbKSRdezAsMn18XFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitdK1xcKFske2NhfV0rXFwpXFwkYDtcclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgd2l0aCBlc2NhcGVkIGNoYXJhY3RlcnMgZm9yIHNwZWNpZmljIG1hdGNoaW5nXHJcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7IC8vIENvb3JkaW5hdGUgbmFtZVxyXG4gICAgICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcXSpcXCR8W1xcd1xcZFxcc1xcLSwuOighKV9cXC1cXCtcXFxcXSpgOyAvLyBUZXh0IHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xyXG4gICAgICAgIGNvbnN0IGYgPSBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsuJipcXHtcXH0lXFwtPD5dYDsgLy8gRm9ybWF0dGluZyB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcclxuXHJcbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHVzaW5nIGVzY2FwZWQgYnJhY2VzIGFuZCBwYXR0ZXJuc1xyXG4gICAgICAgIGNvbnN0IGNvb3JSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vclxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBub2RlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3Qgc2UgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHMqXFwoKigke2NufSlcXCkqXFxzKmF0XFxzKlxcKCgke2N9KVxcKVxccypcXFsoJHtmfSopXFxdXFxzKlxceygke3R9KVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBzcyA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vcmRpbmF0ZVxccyooXFxbbGFiZWw9XFx7XFxbKC4qPylcXF06XFxcXFxcdypcXHMqKFtcXHdcXHNdKilcXH1cXF0pP1xccypcXCgoJHtjbn0rKVxcKVxccyphdFxccypcXCgoJHtjfSlcXCk7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGRyYXdSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZHJhd1xcWygke2Z9KilcXF0oW147XSopO2AsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzeygke3R9KX17KCR7dH0pfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBncmlkUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGdyaWR7KFtcXGQtLl0rKX1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgY2lyY2xlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNpcmNsZVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceyhbXFx3XFxzXFxkXSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG1hc3NSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbWFzc1xceygke2N9KVxcfVxceygke3R9KVxcfVxceygtXFx8fFxcfHw+KXswLDF9XFx9XFx7KFtcXGQuXSopXFx9YCxcImdcIik7XHJcblxyXG4gICAgICAgIGNvbnN0IHZlY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx2ZWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzZSwgc3MsIG5vZGVSZWdleCwgZHJhd1JlZ2V4LCBjaXJjbGVSZWdleCwgbWFzc1JlZ2V4LCB2ZWNSZWdleF07XHJcbiAgICAgICAgbGV0IG1hdGNoZXM6IGFueVtdPVtdO1xyXG4gICAgICAgIHJlZ2V4UGF0dGVybnMuZm9yRWFjaChhYiA9PiB7XHJcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IChhLmluZGV4IHx8IDApIC0gKGIuaW5kZXggfHwgMCkpO1xyXG5cclxuICAgICAgICBbeHlheGlzUmVnZXgsZ3JpZFJlZ2V4XS5mb3JFYWNoKGFiID0+IHtcclxuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcclxuICAgICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcclxuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkICYmIG1hdGNoLmluZGV4ID4gY3VycmVudEluZGV4KSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4LCBtYXRjaC5pbmRleCkpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yXCIpKSB7XHJcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzJdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFs0XX1cclxuICAgICAgICAgICAgaWYobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yZGluYXRlXCIpKXtcclxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzVdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFs0XSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbMl19KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoKS5hZGRJbmZvKGksXCJjb29yZGluYXRlXCIsdGhpcykpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7Zm9ybWF0dGluZzogbWF0Y2hbMV0sZHJhdzogbWF0Y2hbMl19LCB0aGlzKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxceHlheGlzXCIpKSB7XHJcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaChkaXNzZWN0WFlheGlzKG1hdGNoKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xyXG4gICAgICAgICAgICAvL3RoaXMudG9rZW5zLnB1c2goe3R5cGU6IFwiZ3JpZFwiLCByb3RhdGU6IG1hdGNoWzFdfSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbm9kZVwiKSkge1xyXG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFszXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119XHJcbiAgICAgICAgICAgIGlmIChtYXRjaFswXS5tYXRjaCgvXFxcXG5vZGVcXHMqXFwoLykpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbMl0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzFdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFs0XX0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoKS5hZGRJbmZvKGksXCJub2RlXCIsdGhpcykpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNpcmNsZVwiKSkgey8qXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXHJcbiAgICAgICAgICAgICAgZm9ybWF0dGluZzogbWF0Y2hbNF0sXHJcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMl0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICB9KTsqL1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXG1hc3NcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSwgbGFiZWw6IG1hdGNoWzJdfVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCkuYWRkSW5mbyhpLFwibm9kZS1tYXNzXCIsdGhpcyx7YW5jaG9yOiBtYXRjaFszXSxyb3RhdGU6IG1hdGNoWzRdfSkpXHJcblxyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHZlY1wiKSkge1xyXG4gICAgICAgICAgICBtYXRjaFsyXT1gKCR7bWF0Y2hbMV19KS0tK25vZGVbXXske21hdGNoWzNdfX0oJHttYXRjaFsyXX0pYFxyXG4gICAgICAgICAgICBtYXRjaFsxXT1tYXRjaFs0XSsnLC0+J1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KG1hdGNoLHRoaXMpKVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoY3VycmVudEluZGV4IDwgdGhpcy5zb3VyY2UubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZpbmRNaWRwb2ludCgpIHtcclxuICAgICAgICAvKmxldCBjb29yZGluYXRlcyA9IHRoaXMudG9rZW5zLmZpbHRlcigodG9rZW46IFRva2VuKSA9PiB0b2tlbiBpbnN0YW5jZW9mIENvb3JkaW5hdGUpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zXHJcbiAgICAgICAgLmZpbHRlcigodG9rZW46IFRva2VuKSA9PiB0b2tlbiBpbnN0YW5jZW9mIERyYXcpXHJcbiAgICAgICAgLmZvckVhY2goKG9iamVjdDogRHJhdykgPT4ge1xyXG4gICAgICAgICAgICBjb29yZGluYXRlcyA9IGNvb3JkaW5hdGVzLmNvbmNhdChcclxuICAgICAgICAgICAgICAgIG9iamVjdC5jb29yZGluYXRlcy5maWx0ZXIoKHRva2VuOiBhbnkpID0+IHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBsZXQgc3VtT2ZYID0gMCwgc3VtT2ZZID0gMDtcclxuICAgICAgICBjb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiB0b2tlbikgPT4ge1xyXG4gICAgICAgICAgc3VtT2ZYICs9IE51bWJlcihjb29yZGluYXRlLlgpO1xyXG4gICAgICAgICAgc3VtT2ZZICs9IE51bWJlcihjb29yZGluYXRlLlkpOyBcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5taWRQb2ludD1uZXcgQXhpcygpO1xyXG4gICAgICAgIHRoaXMubWlkUG9pbnQuYWRkQ2FydGVzaWFuKFxyXG4gICAgICAgICAgICBzdW1PZlggLyBjb29yZGluYXRlcy5sZW5ndGghPT0wP2Nvb3JkaW5hdGVzLmxlbmd0aDoxXHJcbiAgICAgICAgICAgICxzdW1PZlkgLyBjb29yZGluYXRlcy5sZW5ndGghPT0wP2Nvb3JkaW5hdGVzLmxlbmd0aDoxXHJcbiAgICAgICAgKSovXHJcbiAgICB9XHJcblxyXG4gICAgZmluZE9yaWdpbmFsVmFsdWUodmFsdWU6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcclxuICAgICAgICAgICAgKHRva2VuOiBUb2tlbikgPT5cclxuICAgICAgICAgICAgICAgICh0b2tlbiBpbnN0YW5jZW9mIENvb3JkaW5hdGUpICYmIHRva2VuLmNvb3JkaW5hdGVOYW1lID09PSB2YWx1ZVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIG9nIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSA/IG9nLmNsb25lKCkgOiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGFwcGx5UXVhZHJhbnRzKCkge1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgICAgICAgIGlmICh0eXBlb2YgdG9rZW4gPT09IFwib2JqZWN0XCIgJiYgdG9rZW4gIT09IG51bGwmJnRva2VuLnR5cGU9PT1cImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgICAgICB0b2tlbi5hZGRRdWFkcmFudCh0aGlzLm1pZFBvaW50KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xyXG4gICAgICAgIGNvbnN0IGV4dHJlbWVYWT1nZXRFeHRyZW1lWFkodGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuXHJcbiAgICAgICAgICAgIGlmKHRva2VuLnRvU3RyaW5nKCkpe1xyXG4gICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9dG9rZW4udG9TdHJpbmcoKVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGNvZGVCbG9ja091dHB1dDtcclxuICAgIH1cclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBkaXNzZWN0WFlheGlzKG1hdGNoOiBSZWdFeHBNYXRjaEFycmF5KSB7XHJcbiAgICBsZXQgWG5vZGU6UmVnRXhwTWF0Y2hBcnJheXxzdHJpbmc9XCJcIiwgWW5vZGU6UmVnRXhwTWF0Y2hBcnJheXxzdHJpbmc9XCJcIjtcclxuXHJcbiAgICBpZiAobWF0Y2hbMV0gJiYgbWF0Y2hbMl0pIHtcclxuICAgICAgICBYbm9kZSA9IG1hdGNoWzFdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XHJcbiAgICAgICAgWW5vZGUgPSBtYXRjaFsyXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xyXG4gICAgICAgIFhub2RlPVhub2RlWzBdLnN1YnN0cmluZygxLFhub2RlLmxlbmd0aClcclxuICAgICAgICBZbm9kZT1Zbm9kZVswXS5zdWJzdHJpbmcoMSxZbm9kZS5sZW5ndGgpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJ4eWF4aXNcIixcclxuICAgICAgICBYZm9ybWF0dGluZzogbWF0Y2hbMV0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxyXG4gICAgICAgIFlmb3JtYXR0aW5nOiBtYXRjaFsyXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICAgICAgeERpcmVjdGlvbjogbWF0Y2hbMV0gJiYgLy0+Ly50ZXN0KG1hdGNoWzFdKSA/IFwibGVmdFwiIDogXCJyaWdodFwiLFxyXG4gICAgICAgIHlEaXJlY3Rpb246IG1hdGNoWzJdICYmIC8tPi8udGVzdChtYXRjaFsyXSkgPyBcImRvd25cIiA6IFwidXBcIixcclxuICAgICAgICBYbm9kZTogWG5vZGUsXHJcbiAgICAgICAgWW5vZGU6IFlub2RlLFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0RXh0cmVtZVhZKHRva2VuczogYW55KSB7XHJcbmxldCBtYXhYID0gLUluZmluaXR5O1xyXG5sZXQgbWF4WSA9IC1JbmZpbml0eTtcclxubGV0IG1pblggPSBJbmZpbml0eTtcclxubGV0IG1pblkgPSBJbmZpbml0eTtcclxuXHJcbnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcclxuICAgIGlmICh0b2tlbi5YID4gbWF4WCkgbWF4WCA9IHRva2VuLlg7XHJcbiAgICBpZiAodG9rZW4uWCA8IG1pblgpIG1pblggPSB0b2tlbi5YO1xyXG5cclxuICAgIGlmICh0b2tlbi5ZID4gbWF4WSkgbWF4WSA9IHRva2VuLlk7XHJcbiAgICBpZiAodG9rZW4uWSA8IG1pblkpIG1pblkgPSB0b2tlbi5ZO1xyXG4gICAgfVxyXG59KTtcclxuXHJcbnJldHVybiB7XHJcbiAgICBtYXhYLG1heFksbWluWCxtaW5ZLFxyXG59O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG4vKlxyXG5mdW5jdGlvbiBnZW5lcmF0ZUZvcm1hdHRpbmcoY29vcmRpbmF0ZTogQ29vcmRpbmF0ZSl7XHJcbiAgICBpZiAodHlwZW9mIGNvb3JkaW5hdGUubGFiZWwgIT09IFwic3RyaW5nXCIpeyByZXR1cm4gXCJcIjsgfVxyXG4gICAgY29uc3QgZm9ybWF0dGluZyA9IGNvb3JkaW5hdGUuZm9ybWF0dGluZz8uc3BsaXQoXCIsXCIpIHx8IFtdO1xyXG4gICAgaWYgKGZvcm1hdHRpbmcuc29tZSgodmFsdWU6IHN0cmluZykgPT4gLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8udGVzdCh2YWx1ZSkpKSB7XHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGUuZm9ybWF0dGluZztcclxuICAgIH1cclxuICAgIGlmKGZvcm1hdHRpbmcubGVuZ3RoPjAmJiFmb3JtYXR0aW5nW2Zvcm1hdHRpbmcubGVuZ3RoLTFdLmVuZHNXaXRoKFwiLFwiKSl7Zm9ybWF0dGluZy5wdXNoKFwiLFwiKX1cclxuICAgIHN3aXRjaChjb29yZGluYXRlLnF1YWRyYW50KXtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgcmlnaHQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgbGVmdCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyBsZWZ0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSA0OiBcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyByaWdodCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvcm1hdHRpbmcuam9pbihcIlwiKTtcclxufVxyXG4qL1xyXG5cclxuXHJcbmZ1bmN0aW9uIGdldFByZWFtYmxlKCk6c3RyaW5ne1xyXG4gICAgY29uc3QgYW5nPVwiXFxcXHRpa3pzZXR7YW5nLy5zdHlsZSAyIGFyZ3M9e2ZpbGw9YmxhY2shNTAsb3BhY2l0eT0wLjUsdGV4dCBvcGFjaXR5PTAuOSxkcmF3PW9yYW5nZSw8LT4sYW5nbGUgZWNjZW50cmljaXR5PSMxLGFuZ2xlIHJhZGl1cz0jMmNtLHRleHQ9b3JhbmdlLGZvbnQ9XFxcXGxhcmdlfSxhbmcvLmRlZmF1bHQ9ezEuNn17MC41fX1cIlxyXG4gIFxyXG4gICAgY29uc3QgbWFyaz1cIlxcXFxkZWZcXFxcbWFyayMxIzIjM3tcXFxccGF0aCBbZGVjb3JhdGlvbj17bWFya2luZ3MsIG1hcms9YXQgcG9zaXRpb24gMC41IHdpdGgge1xcXFxmb3JlYWNoIFxcXFx4IGluIHsjMX0geyBcXFxcZHJhd1tsaW5lIHdpZHRoPTFwdF0gKFxcXFx4LC0zcHQpIC0tIChcXFxceCwzcHQpOyB9fX0sIHBvc3RhY3Rpb249ZGVjb3JhdGVdICgjMikgLS0gKCMzKTt9XCJcclxuICBcclxuICAgIGNvbnN0IGFycj1cIlxcXFxuZXdjb21tYW5ke1xcXFxhcnJ9Wzhde1xcXFxjb29yZGluYXRlICgyKSBhdCAoJCgjMikhIzchKCMzKSQpO1xcXFxjb29yZGluYXRlICgxKSBhdCAoJCgyKSEjNW1tITkwOigjMykkKTtcXFxcY29vcmRpbmF0ZSAoMykgYXQgKCQoMikhIzVtbSsjNGNtISM4OigjMykkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0xcHQsPC1dICgxKS0tKDMpbm9kZSBbcG9zPSM2XSB7XFxcXGxhcmdlICMxfTt9XCIgXHJcbiAgICBjb25zdCBsZW5lPVwiXFxcXGRlZlxcXFxjb3IjMSMyIzMjNCM1e1xcXFxjb29yZGluYXRlICgjMSkgYXQoJCgjMikhIzMhIzQ6KCM1KSQpO31cXFxcZGVmXFxcXGRyIzEjMntcXFxcZHJhdyBbbGluZSB3aWR0aD0jMSxdIzI7fVxcXFxuZXdjb21tYW5ke1xcXFxsZW59WzZde1xcXFxjb3J7MX17IzJ9eyMzfXs5MH17IzR9XFxcXGNvcnszfXsjNH17IzN9ey05MH17IzJ9XFxcXG5vZGUgKDIpIGF0ICgkKDEpITAuNSEoMykkKSBbcm90YXRlPSM2XXtcXFxcbGFyZ2UgIzF9O1xcXFxkcnsjNXB0LHw8LX17KDEpLS0oMil9XFxcXGRyeyM1cHQsLT58fXsoMiktLSgzKX19XCJcclxuICAgIGNvbnN0IHNwcmluZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxzcHJpbmd9WzRde1xcXFx0aWt6bWF0aHtjb29yZGluYXRlIFxcXFxzdGFydCwgXFxcXGRvbmU7XFxcXHN0YXJ0ID0gKCMxKTtcXFxcZG9uZSA9ICgjMik7fVxcXFxkcmF3W3RoaWNrXSAoJChcXFxcc3RhcnQpICsgKC0xLjUsMCkkKSAtLSsrKDMsMCk7XFxcXGRyYXcgKFxcXFxzdGFydCkgLS0rICgwLC0wLjI1Y20pO1xcXFxkcmF3ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4KzBjbSxcXFxcZG9uZXkrMC4yNWNtKSQpLS0rKDAsLTAuMjUpO1xcXFxkcmF3W2RlY29yYXRpb249e2FzcGVjdD0wLjMsIHNlZ21lbnQgbGVuZ3RoPTMsIGFtcGxpdHVkZT0ybW0sY29pbCx9LGRlY29yYXRlXSAoXFxcXHN0YXJ0eCxcXFxcc3RhcnR5LTAuMjVjbSkgLS0oJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkrMC4yNWNtKSQpbm9kZVttaWR3YXkscmlnaHQ9MC4yNWNtLGJsYWNrXXsjNH07XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSkkKXsjM307fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHRyZWU9XCJcXFxcbmV3Y29tbWFuZHtcXFxcbGVudX1bM117XFxcXHRpa3pzZXR7bGV2ZWwgZGlzdGFuY2U9MjBtbSxsZXZlbCAjMS8uc3R5bGU9e3NpYmxpbmcgZGlzdGFuY2U9IzJtbSwgbm9kZXM9e2ZpbGw9cmVkISMzLGNpcmNsZSxpbm5lciBzZXA9MXB0LGRyYXc9bm9uZSx0ZXh0PWJsYWNrLH19fX1cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0YWJsZT1cIlxcXFx0aWt6c2V0eyB0YWJsZS8uc3R5bGU9e21hdHJpeCBvZiBub2Rlcyxyb3cgc2VwPS1cXFxccGdmbGluZXdpZHRoLGNvbHVtbiBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsbm9kZXM9e3JlY3RhbmdsZSxkcmF3PWJsYWNrLGFsaWduPWNlbnRlcn0sbWluaW11bSBoZWlnaHQ9MS41ZW0sdGV4dCBkZXB0aD0wLjVleCx0ZXh0IGhlaWdodD0yZXgsbm9kZXMgaW4gZW1wdHkgY2VsbHMsZXZlcnkgZXZlbiByb3cvLnN0eWxlPXtub2Rlcz17ZmlsbD1ncmF5ITYwLHRleHQ9YmxhY2ssfX0sY29sdW1uIDEvLnN0eWxlPXtub2Rlcz17dGV4dCB3aWR0aD01ZW0sZm9udD1cXFxcYmZzZXJpZXN9fSxyb3cgMS8uc3R5bGU9e25vZGVzPXtmb250PVxcXFxiZnNlcmllc319fX1cIlxyXG4gICAgY29uc3QgY29vcj1cIlxcXFxkZWZcXFxcY29vciMxIzIjMyM0e1xcXFxjb29yZGluYXRlIFtsYWJlbD17WyM0XTpcXFxcTGFyZ2UgIzN9XSAoIzIpIGF0ICgkKCMxKSQpO31cIlxyXG4gICAgLy9jb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxyXG4gICAgY29uc3QgZHZlY3Rvcj1cIlxcXFxuZXdjb21tYW5ke1xcXFxkdmVjdG9yfVsyXXtcXFxcY29vcmRpbmF0ZSAodGVtcDEpIGF0ICgkKDAsMCAtfCAjMSkkKTtcXFxcY29vcmRpbmF0ZSAodGVtcDIpIGF0ICgkKDAsMCB8LSAjMSkkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0wLjdwdCwjMl0gKCMxKS0tKHRlbXAxKSgjMSktLSh0ZW1wMik7fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxyXG4gICAgY29uc3QgcHJlYW1ibGU9XCJcXFxcdXNlcGFja2FnZXtwZ2ZwbG90cyxpZnRoZW59XFxcXHVzZXRpa3psaWJyYXJ5e2Fycm93cy5tZXRhLGFuZ2xlcyxxdW90ZXMscG9zaXRpb25pbmcsIGNhbGMsIGludGVyc2VjdGlvbnMsZGVjb3JhdGlvbnMubWFya2luZ3MsbWF0aCxzcHksbWF0cml4LHBhdHRlcm5zLHNuYWtlcyxkZWNvcmF0aW9ucy5wYXRocmVwbGFjaW5nLGRlY29yYXRpb25zLnBhdGhtb3JwaGluZyxwYXR0ZXJucyxzaGFkb3dzLHNoYXBlcy5zeW1ib2xzfVwiXHJcbiAgICByZXR1cm4gcHJlYW1ibGUrYW5nK21hcmsrYXJyK2xlbmUrc3ByaW5nK3RyZWUrdGFibGUrY29vcitkdmVjdG9yK3BpY0FuZytcIlxcXFxwZ2ZwbG90c3NldHtjb21wYXQ9MS4xNn1cXFxcYmVnaW57ZG9jdW1lbnR9XFxcXGJlZ2lue3Rpa3pwaWN0dXJlfVwiXHJcbn0iXX0=