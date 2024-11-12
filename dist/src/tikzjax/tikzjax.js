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
        "scale": "scale=",
        "decorate": "decorate",
        "sloped": "sloped",
        "decoration": "decoration=",
        "decoration.brace": "brace",
        "decoration.amplitude": "amplitude="
    };
    return valueMap[key] || '';
}
export class Formatting {
    scale;
    rotate;
    lineWidth;
    fillOpacity;
    pos;
    mode;
    anchor;
    width;
    color;
    textColor;
    fill;
    arrow;
    draw;
    text;
    pathAttribute;
    tikzset;
    position;
    lineStyle;
    sloped;
    decorate;
    decoration;
    constructor(mode, formattingArr, formattingString) {
        this.mode = mode;
        this.formattingSpecificToMode();
        this.assignFormatting(formattingArr || []);
        this.interpretFormatting(formattingString || "");
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
    assignFormatting(formattingArr) {
        for (const [key, value] of Object.entries(formattingArr)) {
            if (typeof value === 'object') {
                //this.setProperty(key as keyof Formatting,formatting)
            }
            else if (value) {
                this.setProperty(key, value);
            }
        }
    }
    interpretFormatting(formattingString) {
        const splitFormatting = formattingString.replace(/\s/g, "").match(/(?:{[^}]*}|[^,{}]+)+/g) || [];
        splitFormatting.forEach(formatting => {
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
                case !!formatting.match(/^fillopacity/): {
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
                case !!formatting.match(/^ancohr=/): {
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
                : rawValue.replace(/-\|/, 'north');
        }
        else {
            value = formatting;
        }
        this.setProperty(key, value, nestedKey);
    }
    setProperty(key, value, nestedKey) {
        if (typeof value === "string")
            value = value.replace(/^\|-$/, "north").replace(/^-\|$/, "south");
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
        if (typeof mode === "string") {
            // Handle the case where individual parameters are passed
            this.mode = mode;
            if (axis !== undefined)
                this.axis = axis;
            this.original = original;
            this.coordinateName = coordinateName;
            if (formatting !== undefined)
                this.formatting = formatting;
            this.label = label;
            this.quadrant = quadrant;
        }
        else if (typeof mode === "object" && mode !== null) {
            // Handle the case where an options object is passed
            const options = mode;
            if (options.mode !== undefined)
                this.mode = options.mode;
            this.axis = options.axis;
            this.original = options.original;
            this.coordinateName = options.coordinateName;
            this.formatting = options.formatting;
            this.label = options.label;
            this.quadrant = options.quadrant;
        }
    }
    clone() {
        return new Coordinate(this.mode, this.axis ? this.axis.clone() : undefined, this.original, this.coordinateName, this.formatting, this.label, this.quadrant);
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
        this.formatting = new Formatting(this.mode, formatting, match.formatting);
        return this;
    }
    toString() {
        switch (this.mode) {
            case "coordinate":
                if (this.axis)
                    return `\\coor{${this.axis.toString()}}{${this.coordinateName || ""}}{${this.label || ""}}{}`;
            case "node":
                return;
            case "node-inline":
                return `node ${this.formatting?.toString()} {${this.label || ''}}`;
            case "node-mass":
                if (this.axis)
                    return `\\node ${this.coordinateName ? '(' + this.coordinateName + ')' : ''} at (${this.axis.toString()}) ${this.formatting?.toString()} {${this.label}};`;
            default:
                throw new Error("Couldn't find mode at to string coordinate");
                break;
        }
    }
    addQuadrant(midPoint) {
        if (this.axis) {
            const xDirection = this.axis.cartesianX > midPoint.cartesianX ? 1 : -1;
            const yDirection = this.axis.cartesianY > midPoint.cartesianY ? 1 : -1;
            this.quadrant = yDirection === 1 ? (xDirection === 1 ? 1 : 2) : (xDirection === 1 ? 4 : 3);
        }
    }
}
export class Draw {
    mode;
    formatting;
    coordinates;
    constructor(match, tokens, mode) {
        this.mode = mode;
        this.mode = `draw${mode ? "-" + mode : ""}`;
        if (typeof match.formatting === "string") {
            this.formatting = new Formatting(`draw`, {}, match.formatting);
        }
        else
            this.formatting = new Formatting(`draw`, match.formatting, '');
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
                const ancer = new Axis().universal(match[1]);
                const axis1 = new Axis().universal(match[2]);
                const node = new Coordinate({ mode: 'node-inline', formatting: new Formatting('node-inline', {}, ''), label: match[3] });
                const c1 = new Coordinate("node-inline");
                match[2] = `(${match[1]})--+node[]{${match[3]}}(${match[2]})`;
                match[1] = match[4] + ',->';
                const q = [ancer, '--+', node, axis1];
                this.tokens.push(new Draw({ formatting: '', draw: q }, this, 'draw'));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUlqRCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUM3RSxJQUFJLENBQUMsV0FBVyxDQUFDLE1B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RXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBQ2xRLE9BQU8sUUFBUSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxpRUFBaUUsQ0FBQTtBQUM3SSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBNYXJrZG93blZpZXcsIFdvcmtzcGFjZVdpbmRvdyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcInNyYy9tYWluXCI7XG5pbXBvcnQgeyBvcHRpbWl6ZSB9IGZyb20gXCIuL3N2Z28uYnJvd3Nlci5qc1wiO1xuLy8gQHRzLWlnbm9yZVxuaW1wb3J0IHRpa3pqYXhKcyBmcm9tIFwiaW5saW5lOi4vdGlrempheC5qc1wiO1xuaW1wb3J0IHsgY2FydGVzaWFuVG9Qb2xhciwgZmluZEludGVyc2VjdGlvblBvaW50LCBmaW5kU2xvcGUsIHBvbGFyVG9DYXJ0ZXNpYW4sIHRvTnVtYmVyIH0gZnJvbSBcInNyYy9tYXRoVXRpbGl0aWVzLmpzXCI7XG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcblxuXG5cbmV4cG9ydCBjbGFzcyBUaWt6amF4IHtcbiAgICBhcHA6IEFwcDtcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XG4gICAgYWN0aXZlVmlldzogTWFya2Rvd25WaWV3IHwgbnVsbDtcblxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xuICAgICAgdGhpcy5hcHA9YXBwO1xuICAgICAgdGhpcy5hY3RpdmVWaWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcbiAgICB9XG4gICAgXG4gICAgcmVhZHlMYXlvdXQoKXtcbiAgICAgIHRoaXMucGx1Z2luLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XG4gICAgICAgIHRoaXMubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XG4gICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9KSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gIFxuICAgIGxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcbiAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XG4gICAgICAgIHMuaWQgPSBcInRpa3pqYXhcIjtcbiAgICAgICAgcy50eXBlID0gXCJ0ZXh0L2phdmFzY3JpcHRcIjtcbiAgICAgICAgcy5pbm5lclRleHQgPSB0aWt6amF4SnM7XG4gICAgICAgIGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xuICAgICAgICBkb2MuYWRkRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcbiAgICB9XG4gIFxuICAgIHVubG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xuICAgICAgICBjb25zdCBzID0gZG9jLmdldEVsZW1lbnRCeUlkKFwidGlrempheFwiKTtcbiAgICAgICAgcz8ucmVtb3ZlKCk7XG5cbiAgICAgICAgZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XG4gICAgfVxuICBcbiAgICBsb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XG4gICAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICB9XG4gIFxuICAgIHVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xuICAgICAgICAgICAgdGhpcy51bmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICB9XG4gIFxuICAgIGdldEFsbFdpbmRvd3MoKSB7XG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBbXTtcbiAgICAgICAgXG4gICAgICAgIC8vIHB1c2ggdGhlIG1haW4gd2luZG93J3Mgcm9vdCBzcGxpdCB0byB0aGUgbGlzdFxuICAgICAgICB3aW5kb3dzLnB1c2godGhpcy5hcHAud29ya3NwYWNlLnJvb3RTcGxpdC53aW4pO1xuICAgICAgICBcbiAgICAgICAgLy8gQHRzLWlnbm9yZSBmbG9hdGluZ1NwbGl0IGlzIHVuZG9jdW1lbnRlZFxuICAgICAgICBjb25zdCBmbG9hdGluZ1NwbGl0ID0gdGhpcy5hcHAud29ya3NwYWNlLmZsb2F0aW5nU3BsaXQ7XG4gICAgICAgIGZsb2F0aW5nU3BsaXQuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBhIHdpbmRvdywgcHVzaCBpdCB0byB0aGUgbGlzdCBcbiAgICAgICAgICAgIGlmIChjaGlsZCBpbnN0YW5jZW9mIFdvcmtzcGFjZVdpbmRvdykge1xuICAgICAgICAgICAgICAgIHdpbmRvd3MucHVzaChjaGlsZC53aW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gd2luZG93cztcbiAgICB9XG4gIFxuICBcbiAgICByZWdpc3RlclRpa3pDb2RlQmxvY2soKSB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZWwuY3JlYXRlRWwoXCJkaXZcIiksIHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXG4gICAgICAgICAgICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICBjb25zdCBzY3JpcHQgPSBlbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcbiAgICAgICAgICAgIGNvbnN0IHRpa3pqYXg9bmV3IEZvcm1hdFRpa3pqYXgoc291cmNlKTtcbiAgICAgICAgICAgIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLHRpa3pqYXguZGVidWdJbmZvKS5vcGVuKCk7XG4gICAgICAgICAgICBzY3JpcHQuc2V0VGV4dCh0aWt6amF4LmdldENvZGUoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaChlKXtcbiAgICAgICAgICAgICAgICBlbC5pbm5lckhUTUwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yRGlzcGxheSA9IGVsLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm1hdGgtZXJyb3ItbGluZVwiIH0pO1xuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5pbm5lclRleHQgPSBgRXJyb3I6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmNsYXNzTGlzdC5hZGQoXCJlcnJvci10ZXh0XCIpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaWtaIFByb2Nlc3NpbmcgRXJyb3I6XCIsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfVxuICBcbiAgICAgIGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XG4gICAgICB9XG4gIFxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mbyA9IHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLmZpbHRlcihlbCA9PiBlbC5uYW1lICE9IFwiVGlrelwiKTtcbiAgICAgIH1cblxuICBcbiAgICAgIGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xuICAgICAgICBzdmcgPSBzdmcucmVwbGFjZUFsbCgvKFwiIzAwMFwifFwiYmxhY2tcIikvZywgXCJcXFwiY3VycmVudENvbG9yXFxcIlwiKVxuICAgICAgICAgICAgICAgIC5yZXBsYWNlQWxsKC8oXCIjZmZmXCJ8XCJ3aGl0ZVwiKS9nLCBcIlxcXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXFxcIlwiKTtcbiAgICAgICAgcmV0dXJuIHN2ZztcbiAgICAgIH1cbiAgXG4gIFxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gb3B0aW1pemUoc3ZnLCB7cGx1Z2luczpcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFwicHJlc2V0LWRlZmF1bHRcIixcbiAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbnVwSURzOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgIH0pPy5kYXRhO1xuICAgICAgfVxuICBcbiAgXG4gICAgICBwb3N0UHJvY2Vzc1N2ZyA9IChlOiBFdmVudCkgPT4ge1xuICBcbiAgICAgICAgICBjb25zdCBzdmdFbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XG4gIFxuICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKSB7XG4gICAgICAgICAgICBzdmcgPSB0aGlzLmNvbG9yU1ZHaW5EYXJrTW9kZShzdmcpO1xuICAgICAgICAgIH1cbiAgXG4gICAgICAgICAgc3ZnID0gdGhpcy5vcHRpbWl6ZVNWRyhzdmcpO1xuICBcbiAgICAgICAgICBzdmdFbC5vdXRlckhUTUwgPSBzdmc7XG4gICAgICB9XG59XG5cbmZ1bmN0aW9uIHJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcgfCBSZWdFeHAsIGZsYWdzOiBzdHJpbmcgPSAnJyk6IFJlZ0V4cCB7XG4gICAgcGF0dGVybj1wYXR0ZXJuIGluc3RhbmNlb2YgUmVnRXhwP3BhdHRlcm4uc291cmNlOnBhdHRlcm47XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoU3RyaW5nLnJhd2Ake3BhdHRlcm59YCwgZmxhZ3M/ZmxhZ3M6JycpO1xufVxuXG5mdW5jdGlvbiBnZXRSZWdleCgpe1xuICAgIGNvbnN0IGJhc2ljID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOl1gO1xuICAgIHJldHVybiB7XG4gICAgICAgIGJhc2ljOiBiYXNpYyxcbiAgICAgICAgbWVyZ2U6IFN0cmluZy5yYXdgW1xcK1xcLVxcfCFcXGQuXWAsXG4gICAgICAgIC8vY29vcmRpbmF0ZTogbmV3IFJlZ0V4cChTdHJpbmcucmF3YCgke2Jhc2ljfSt8MSlgKSxcbiAgICAgICAgY29vcmRpbmF0ZU5hbWU6IFN0cmluZy5yYXdgW1xcd19cXGRcXHNdYCxcbiAgICAgICAgdGV4dDogU3RyaW5nLnJhd2BbXFx3XFxzLSwuOiQoISlfK1xcXFx7fT1dYCxcbiAgICAgICAgZm9ybWF0dGluZzogU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7JipbXFxde30lLTw+XWBcbiAgICB9O1xufVxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuXG5pbnRlcmZhY2UgdG9rZW4gIHtcbiAgICBYPzogbnVtYmVyO1xuICAgIFk/OiBudW1iZXI7XG4gICAgdHlwZT86IHN0cmluZztcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcbiAgICBjb29yZGluYXRlcz86IGFueTtcbn1cblxuXG5cblxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IG51bWJlclZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcbn07XG5cbmZ1bmN0aW9uIGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlczogQXJyYXk8QXhpcyB8IHN0cmluZz4sIGluZGV4OiBudW1iZXIpOiB7IGJlZm9yZTogbnVtYmVyLCBhZnRlcjogbnVtYmVyIH0ge1xuICAgICAgIFxuICAgIGNvbnN0IGJlZm9yZUluZGV4ID0gYXhlcy5zbGljZSgwLGluZGV4KS5maW5kTGFzdEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKVxuICAgIGNvbnN0IGFmdGVySW5kZXggPSBheGVzLmZpbmRJbmRleCgoYXhpczogYW55LGlkeDogbnVtYmVyKSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyYmaWR4PmluZGV4KTtcblxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gLTEgfHwgYWZ0ZXJJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZmluZCB2YWxpZCBBeGlzIG9iamVjdHMuXCIpO1xuICAgIH1cbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IGFmdGVySW5kZXgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUHJhaXNlZCBheGlzIGFzIHNhbWUgdG9rZW5cIik7XG4gICAgfVxuICAgIHJldHVybiB7IGJlZm9yZTogYmVmb3JlSW5kZXgsIGFmdGVyOiBhZnRlckluZGV4IH07XG59XG5cblxuZXhwb3J0IGNsYXNzIEF4aXMge1xuICAgIGNhcnRlc2lhblg6IG51bWJlcjtcbiAgICBjYXJ0ZXNpYW5ZOiBudW1iZXI7XG4gICAgcG9sYXJBbmdsZTogbnVtYmVyO1xuICAgIHBvbGFyTGVuZ3RoOiBudW1iZXI7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICB1bml2ZXJzYWwoY29vcmRpbmF0ZTogc3RyaW5nLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGFuY2hvckFycj86IGFueSxhbmNob3I/OiBzdHJpbmcpOiBBeGlzIHtcbiAgICAgICAgY29uc3QgbWF0Y2hlcz10aGlzLmdldENvb3JkaW5hdGVNYXRjaGVzKGNvb3JkaW5hdGUpO1xuICAgICAgICBjb25zdCBjb29yZGluYXRlQXJyOiBBcnJheTxBeGlzfHN0cmluZz4gPSBbXTtcbiAgICAgICAgbWF0Y2hlcy5mb3JFYWNoKChtYXRjaDogYW55LGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIG1hdGNoPW1hdGNoLmZ1bGxNYXRjaDtcbiAgICAgICAgICAgIGxldCBheGlzOiBBeGlzfHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgLywvLnRlc3QobWF0Y2gpOlxuICAgICAgICAgICAgICAgICAgICBheGlzID0gbmV3IEF4aXMoKTtcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5hZGRDYXJ0ZXNpYW4obWF0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgLzovLnRlc3QobWF0Y2gpOlxuICAgICAgICAgICAgICAgICAgICBheGlzID0gbmV3IEF4aXMoKTtcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5hZGRQb2xhcihtYXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGF4aXMucG9sYXJUb0NhcnRlc2lhbigpXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAvIVtcXGQuXSshLy50ZXN0KG1hdGNoKTpcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAoL1tcXGRcXHddKy8pLnRlc3QobWF0Y2gpOlxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zKVxuICAgICAgICAgICAgICAgICAgICBheGlzID0gdG9rZW5zLmZpbmRPcmlnaW5hbFZhbHVlKG1hdGNoKT8uYXhpcztcbiAgICAgICAgICAgICAgICBlbHNlIHRocm93IG5ldyBFcnJvcihgVHJpZWQgdG8gZmluZCBvcmlnaW5hbCBjb29yZGluYXRlIHZhbHVlIHdoaWxlIG5vdCBiZWluZyBwcm92aWRlZCB3aXRoIHRva2Vuc2ApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXhpcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgdGhlIGNvb3JkaW5hdGUgJHttYXRjaH0gZnJvbSAke2Nvb3JkaW5hdGV9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5tZXJnZUF4aXMoY29vcmRpbmF0ZUFycilcblxuICAgICAgICBpZihhbmNob3JBcnImJmFuY2hvciYmYW5jaG9yLm1hdGNoKC8oLS1cXCt8LS1cXCtcXCspLykpe1xuICAgICAgICAgICAgbGV0IGE6IEF4aXNcbiAgICAgICAgICAgIGlmIChhbmNob3IubWF0Y2goLygtLVxcKykvKSl7XG4gICAgICAgICAgICAgICAgYT1hbmNob3JBcnIuZmluZCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxuICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgYT1hbmNob3JBcnIuZmluZExhc3QoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29tcGxleENhcnRlc2lhbkFkZChhLFwiYWRkaXRpb25cIilcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBjb21wbGV4Q2FydGVzaWFuQWRkKGF4aXM6IEF4aXMsbW9kZTogc3RyaW5nLG1vZGlmaWVyPzogYW55KXtcbiAgICAgICAgc3dpdGNoIChtb2RlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkaXRpb25cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblgrPWF4aXMuY2FydGVzaWFuWDtcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblkrPWF4aXMuY2FydGVzaWFuWTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJzdWJ0cmFjdGlvblwiOlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInJpZ2h0UHJvamVjdGlvblwiOlxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD1heGlzLmNhcnRlc2lhblhcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJpbnRlcm5hbFBvaW50XCI6XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPSh0aGlzLmNhcnRlc2lhblgrYXhpcy5jYXJ0ZXNpYW5YKSptb2RpZmllcjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblk9KHRoaXMuY2FydGVzaWFuWStheGlzLmNhcnRlc2lhblkpKm1vZGlmaWVyO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhcnRlc2lhblRvUG9sYXIoKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH07XG5cblxuICAgIGdldENvb3JkaW5hdGVNYXRjaGVzKGNvb3JkaW5hdGU6IHN0cmluZyl7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybiA9IGdldFJlZ2V4KCk7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4uYmFzaWN9KylgLCBcImdcIiksXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4ubWVyZ2V9KylgLCBcImdcIilcbiAgICAgICAgXTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgMTogRXh0cmFjdCBtYXRjaGVzIGZvciBlYWNoIHBhdHRlcm4gc2VwYXJhdGVseVxuICAgICAgICBjb25zdCBiYXNpY01hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1swXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0ucmVwbGFjZSgvLSQvZywgXCJcIiksIC8vIFJlbW92ZSB0cmFpbGluZyBoeXBoZW4gb25seVxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxuICAgICAgICB9KSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtZXJnZU1hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1sxXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0sXG4gICAgICAgICAgICBpbmRleDogbWF0Y2guaW5kZXggPz8gMCxcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoXG4gICAgICAgIH0pKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IG1hdGNoZXM6IEFycmF5PHsgZnVsbE1hdGNoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyIH0+ID0gW107XG5cbiAgICAgICAgZnVuY3Rpb24gaXNPdmVybGFwcGluZyhtYXRjaDE6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSwgbWF0Y2gyOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0pIHtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDEuaW5kZXggPCBtYXRjaDIuaW5kZXggKyBtYXRjaDIubGVuZ3RoICYmIG1hdGNoMi5pbmRleCA8IG1hdGNoMS5pbmRleCArIG1hdGNoMS5sZW5ndGg7XG4gICAgICAgIH1cblxuICAgICAgICBbLi4uYmFzaWNNYXRjaGVzLCAuLi5tZXJnZU1hdGNoZXNdLmZvckVhY2gobWF0Y2ggPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3ZlcmxhcHBpbmdJbmRleCA9IG1hdGNoZXMuZmluZEluZGV4KGV4aXN0aW5nTWF0Y2ggPT4gaXNPdmVybGFwcGluZyhleGlzdGluZ01hdGNoLCBtYXRjaCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAob3ZlcmxhcHBpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ01hdGNoID0gbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgY3VycmVudCBtYXRjaCBjb3ZlcnMgYSBsYXJnZXIgcmFuZ2UsIHJlcGxhY2UgdGhlIGV4aXN0aW5nIG9uZVxuICAgICAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPiBleGlzdGluZ01hdGNoLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdID0gbWF0Y2g7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgMzogU29ydCB0aGUgZmluYWwgbWF0Y2hlcyBieSBpbmRleFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgNDogVmFsaWRhdGUgdGhlIHJlc3VsdFxuICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvb3JkaW5hdGUgaXMgbm90IHZhbGlkOyBleHBlY3RlZCBhIHZhbGlkIGNvb3JkaW5hdGUuXCIpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gbWF0Y2hlcztcbiAgICAgICAgXG4gICAgfVxuXG4gICAgY29uc3RydWN0b3IoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKGNhcnRlc2lhblggIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5YID0gY2FydGVzaWFuWDtcbiAgICAgICAgaWYgKGNhcnRlc2lhblkgIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5ZID0gY2FydGVzaWFuWTtcbiAgICAgICAgaWYgKHBvbGFyTGVuZ3RoICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJMZW5ndGggPSBwb2xhckxlbmd0aDtcbiAgICAgICAgaWYgKHBvbGFyQW5nbGUgIT09IHVuZGVmaW5lZCkgdGhpcy5wb2xhckFuZ2xlID0gcG9sYXJBbmdsZTtcbiAgICB9XG5cbiAgICBjbG9uZSgpOiBBeGlzIHtcbiAgICAgICAgcmV0dXJuIG5ldyBBeGlzKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZLHRoaXMucG9sYXJMZW5ndGgsdGhpcy5wb2xhckFuZ2xlKTtcbiAgICB9XG4gICAgXG4gICAgXG4gICAgbWVyZ2VBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+KSB7XG4gICAgICAgIGlmICghYXhlcy5zb21lKChheGlzOiBhbnkpID0+IHR5cGVvZiBheGlzID09PSBcInN0cmluZ1wiKSkge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCAoYXhlc1swXSBhcyBBeGlzKS5jbG9uZSgpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGF4ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBheGVzW2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHNpZGVzID0gZmluZEJlZm9yZUFmdGVyQXhpcyhheGVzLCBpKTtcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUF4aXMgPSBheGVzW3NpZGVzLmJlZm9yZV0gYXMgQXhpcztcbiAgICAgICAgICAgIGNvbnN0IGFmdGVyQXhpcyA9IGF4ZXNbc2lkZXMuYWZ0ZXJdIGFzIEF4aXM7XG5cbiAgICAgICAgICAgIGxldCAgbWF0Y2ggPSBjdXJyZW50Lm1hdGNoKC9eXFwrJC8pO1xuICAgICAgICAgICAgbGV0IG1vZGUsbW9kaWZpZXJzO1xuICAgICAgICAgICAgaWYgKG1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJhZGRpdGlvblwiXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaD1jdXJyZW50Lm1hdGNoKC9eLVxcfCQvKVxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJyaWdodFByb2plY3Rpb25cIlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXlxcIShbXFxkLl0rKVxcISQvKVxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJpbnRlcm5hbFBvaW50XCJcbiAgICAgICAgICAgICAgICBtb2RpZmllcnM9dG9OdW1iZXIobWF0Y2hbMV0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKG1vZGUpe1xuICAgICAgICAgICAgICAgIGF4ZXMuc3BsaWNlKHNpZGVzLmJlZm9yZSwgc2lkZXMuYWZ0ZXIgLSBzaWRlcy5iZWZvcmUgKyAxLCBiZWZvcmVBeGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYWZ0ZXJBeGlzLG1vZGUsbW9kaWZpZXJzKSk7XG4gICAgICAgICAgICAgICAgaSA9IHNpZGVzLmJlZm9yZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGF4ZXMubGVuZ3RoID09PSAxICYmIGF4ZXNbMF0gaW5zdGFuY2VvZiBBeGlzKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgcHJvamVjdGlvbihheGlzMTogQXhpc3x1bmRlZmluZWQsYXhpczI6IEF4aXN8dW5kZWZpbmVkKTphbnl7XG4gICAgICAgIGlmICghYXhpczF8fCFheGlzMil7dGhyb3cgbmV3IEVycm9yKFwiYXhpcydzIHdlcmUgdW5kZWZpbmVkIGF0IHByb2plY3Rpb25cIik7fVxuICAgICAgICByZXR1cm4gW3tYOiBheGlzMS5jYXJ0ZXNpYW5YLFk6IGF4aXMyLmNhcnRlc2lhbll9LHtYOiBheGlzMi5jYXJ0ZXNpYW5YLFk6IGF4aXMxLmNhcnRlc2lhbll9XVxuICAgIH1cbiAgICBjb21iaW5lKGNvb3JkaW5hdGVBcnI6IGFueSl7XG4gICAgICAgIGxldCB4PTAseT0wO1xuICAgICAgICBjb29yZGluYXRlQXJyLmZvckVhY2goKGNvb3JkaW5hdGU6IEF4aXMpPT57XG4gICAgICAgICAgICB4Kz1jb29yZGluYXRlLmNhcnRlc2lhblg7XG4gICAgICAgICAgICB5Kz1jb29yZGluYXRlLmNhcnRlc2lhblk7XG4gICAgICAgIH0pXG4gICAgICAgIFxuICAgICAgICB0aGlzLmNhcnRlc2lhblg9eDt0aGlzLmNhcnRlc2lhblk9eTtcbiAgICB9XG4gICAgYWRkQ2FydGVzaWFuKHg6IHN0cmluZyB8IG51bWJlciwgeT86IG51bWJlcik6IHZvaWQge1xuICAgICAgICBcbiAgICAgICAgaWYgKCF5ICYmIHR5cGVvZiB4ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBbeCwgeV0gPSB4LnNwbGl0KFwiLFwiKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeCA9PT0gdW5kZWZpbmVkIHx8IHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBDYXJ0ZXNpYW4gY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2FydGVzaWFuWCA9IHggYXMgbnVtYmVyO1xuICAgICAgICB0aGlzLmNhcnRlc2lhblkgPSB5IGFzIG51bWJlcjtcbiAgICB9XG4gICAgXG4gICAgcG9sYXJUb0NhcnRlc2lhbigpe1xuICAgICAgICBjb25zdCB0ZW1wPXBvbGFyVG9DYXJ0ZXNpYW4odGhpcy5wb2xhckFuZ2xlLCB0aGlzLnBvbGFyTGVuZ3RoKVxuICAgICAgICB0aGlzLmFkZENhcnRlc2lhbih0ZW1wLlgsdGVtcC5ZKVxuICAgIH1cblxuICAgIGNhcnRlc2lhblRvUG9sYXIoKXtcbiAgICAgICAgY29uc3QgdGVtcD1jYXJ0ZXNpYW5Ub1BvbGFyKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZKVxuICAgICAgICB0aGlzLmFkZFBvbGFyKHRlbXAuYW5nbGUsdGVtcC5sZW5ndGgpXG4gICAgfVxuXG4gICAgYWRkUG9sYXIoYW5nbGU6IHN0cmluZyB8IG51bWJlciwgbGVuZ3RoPzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICghbGVuZ3RoICYmIHR5cGVvZiBhbmdsZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgW2FuZ2xlLCBsZW5ndGhdID0gYW5nbGUuc3BsaXQoXCI6XCIpLm1hcChOdW1iZXIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhbmdsZSA9PT0gdW5kZWZpbmVkIHx8IGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHBvbGFyIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBvbGFyQW5nbGUgPSBhbmdsZSBhcyBudW1iZXI7XG4gICAgICAgIHRoaXMucG9sYXJMZW5ndGggPSBsZW5ndGggYXMgbnVtYmVyO1xuICAgIH1cblxuICAgIHRvU3RyaW5nKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIsXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xuICAgIH1cblxuICAgIGludGVyc2VjdGlvbihjb29yZDogc3RyaW5nLCBmaW5kT3JpZ2luYWxWYWx1ZTogKGNvb3JkOiBzdHJpbmcpID0+IENvb3JkaW5hdGUgfCB1bmRlZmluZWQpOiB7WDpudW1iZXIsWTpudW1iZXJ9IHtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxDb29yZHMgPSBjb29yZFxuICAgICAgICAgICAgLnJlcGxhY2UoL2ludGVyc2VjdGlvblxccz9vZlxccz8vZywgXCJcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFxzKmFuZFxccz98LS0pL2csIFwiIFwiKVxuICAgICAgICAgICAgLnNwbGl0KFwiIFwiKVxuICAgICAgICAgICAgLm1hcChmaW5kT3JpZ2luYWxWYWx1ZSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHRva2VuKTogdG9rZW4gaXMgQ29vcmRpbmF0ZSA9PiB0b2tlbiAhPT0gdW5kZWZpbmVkKTtcblxuICAgICAgICBpZiAob3JpZ2luYWxDb29yZHMubGVuZ3RoIDwgNCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW50ZXJzZWN0aW9uIGhhZCB1bmRlZmluZWQgY29vcmRpbmF0ZXMgb3IgaW5zdWZmaWNpZW50IGRhdGEuXCIpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zdCBzbG9wZXMgPSBbXG4gICAgICAgICAgICBmaW5kU2xvcGUob3JpZ2luYWxDb29yZHNbMF0uYXhpcyBhcyBBeGlzLCBvcmlnaW5hbENvb3Jkc1sxXS5heGlzIGFzIEF4aXMpLFxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbM10uYXhpcyBhcyBBeGlzKSxcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMl0uYXhpcyBhcyBBeGlzLCBzbG9wZXNbMF0sIHNsb3Blc1sxXSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjb3ZvcnQodmFsdWU6IG51bWJlcixjb252cnNpbjogc3RyaW5nKXtcblxufVxuXG5cbmZ1bmN0aW9uIG1hdGNoS2V5V2l0aFZhbHVlKGtleTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCB2YWx1ZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgXCJhbmNob3JcIjogXCJhbmNob3I9XCIsXG4gICAgICAgIFwicm90YXRlXCI6IFwicm90YXRlPVwiLFxuICAgICAgICBcImxpbmVXaWR0aFwiOiBcImxpbmUgd2lkdGg9XCIsXG4gICAgICAgIFwiZmlsbFwiOiBcImZpbGw9XCIsXG4gICAgICAgIFwiZmlsbE9wYWNpdHlcIjogXCJmaWxsIG9wYWNpdHk9XCIsXG4gICAgICAgIFwidGV4dENvbG9yXCI6IFwidGV4dCBjb2xvcj1cIixcbiAgICAgICAgXCJkcmF3XCI6IFwiZHJhdz1cIixcbiAgICAgICAgXCJ0ZXh0XCI6IFwidGV4dD1cIixcbiAgICAgICAgXCJwb3NcIjogXCJwb3M9XCIsXG4gICAgICAgIFwic2NhbGVcIjogXCJzY2FsZT1cIixcbiAgICAgICAgXCJkZWNvcmF0ZVwiOiBcImRlY29yYXRlXCIsXG4gICAgICAgIFwic2xvcGVkXCI6IFwic2xvcGVkXCIsXG4gICAgICAgIFwiZGVjb3JhdGlvblwiOiBcImRlY29yYXRpb249XCIsXG4gICAgICAgIFwiZGVjb3JhdGlvbi5icmFjZVwiOiBcImJyYWNlXCIsXG4gICAgICAgIFwiZGVjb3JhdGlvbi5hbXBsaXR1ZGVcIjogXCJhbXBsaXR1ZGU9XCJcbiAgICB9O1xuXG4gICAgcmV0dXJuIHZhbHVlTWFwW2tleV0gfHwgJyc7XG59XG5cbmV4cG9ydCBjbGFzcyBGb3JtYXR0aW5ne1xuICAgIFxuICAgIHNjYWxlOiBudW1iZXI7XG4gICAgcm90YXRlPzogbnVtYmVyO1xuICAgIGxpbmVXaWR0aD86IG51bWJlcjtcbiAgICBmaWxsT3BhY2l0eT86IG51bWJlcjtcbiAgICBwb3M/OiBudW1iZXI7XG5cbiAgICBtb2RlOiBzdHJpbmc7XG4gICAgYW5jaG9yPzogc3RyaW5nO1xuICAgIHdpZHRoPzogc3RyaW5nO1xuICAgIGNvbG9yPzogc3RyaW5nO1xuICAgIHRleHRDb2xvcj86IHN0cmluZztcbiAgICBmaWxsPzogc3RyaW5nO1xuICAgIGFycm93Pzogc3RyaW5nO1xuICAgIGRyYXc/OiBzdHJpbmc7XG4gICAgdGV4dD86IHN0cmluZztcbiAgICBwYXRoQXR0cmlidXRlPzogc3RyaW5nO1xuICAgIHRpa3pzZXQ/OiBzdHJpbmc7XG4gICAgcG9zaXRpb24/OiBzdHJpbmc7XG4gICAgbGluZVN0eWxlPzogc3RyaW5nO1xuICAgIFxuICAgIHNsb3BlZD86IGJvb2xlYW47XG4gICAgZGVjb3JhdGU/OiBib29sZWFuO1xuXG4gICAgZGVjb3JhdGlvbj86IHticmFjZT86IGJvb2xlYW4sY29pbDogYm9vbGVhbixhbXBsaXR1ZGU/OiBudW1iZXIsYXNwZWN0OiBudW1iZXIsc2VnbWVudExlbmd0aDpudW1iZXJ9O1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKG1vZGU6IHN0cmluZyxmb3JtYXR0aW5nQXJyOiBhbnksZm9ybWF0dGluZ1N0cmluZz86c3RyaW5nKXtcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XG4gICAgICAgIHRoaXMuZm9ybWF0dGluZ1NwZWNpZmljVG9Nb2RlKCk7XG4gICAgICAgIHRoaXMuYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nQXJyfHxbXSk7XG4gICAgICAgIHRoaXMuaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nfHxcIlwiKTtcblxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cblxuICAgIGZvcm1hdHRpbmdTcGVjaWZpY1RvTW9kZSgpe1xuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xuICAgICAgICAgICAgY2FzZSBcIm5vZGUtbWFzc1wiOlxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD1cInllbGxvdyE2MFwiO1xuICAgICAgICAgICAgICAgIHRoaXMucGF0aEF0dHJpYnV0ZT1cImRyYXdcIjtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWRkU3Bsb3BBbmRQb3NpdGlvbihhcnI6IGFueSxpbmRleDogbnVtYmVyKXtcbiAgICAgICAgY29uc3QgYmVmb3JlQWZ0ZXI9ZmluZEJlZm9yZUFmdGVyQXhpcyhhcnIsaW5kZXgpO1xuICAgICAgICBjb25zdCBbYmVmb3JlLCBhZnRlcl09W2FycltiZWZvcmVBZnRlci5iZWZvcmVdLGFycltiZWZvcmVBZnRlci5hZnRlcl1dXG4gICAgICAgIGlmICh0aGlzLnBvc2l0aW9ufHx0aGlzLnNsb3BlZCl7cmV0dXJufVxuICAgIFxuICAgICAgICBjb25zdCBlZGdlMSA9IGJlZm9yZS5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcbiAgICAgICAgY29uc3QgZWRnZTIgPSBhZnRlci5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcbiAgICAgICAgY29uc3Qgc2xvcGU9ZmluZFNsb3BlKGVkZ2UxLGVkZ2UyKVxuXG4gICAgICAgIHRoaXMuc2xvcGVkID0gc2xvcGUgIT09IDA7XG5cbiAgICAgICAgbGV0IHF1YWRyYW50XG4gICAgICAgIGlmIChlZGdlMSE9PWVkZ2UyKXF1YWRyYW50PWVkZ2UxK2VkZ2UyO1xuICAgICAgICBlbHNlIHF1YWRyYW50PWVkZ2UxO1xuXG4gICAgICAgIGlmIChzbG9wZSE9PUluZmluaXR5JiZzbG9wZSE9PS1JbmZpbml0eSl7XG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uID0gcXVhZHJhbnQucmVwbGFjZSgvKDN8NCkvLFwiYmVsb3dcIikucmVwbGFjZSgvKDF8NCkvLFwiYWJvdmVcIilcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5zbG9wZWQpe1xuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbis9cXVhZHJhbnQucmVwbGFjZSgvKDJ8MykvLFwicmlnaHRcIikucmVwbGFjZSgvKDF8NCkvLFwibGVmdFwiKVxuICAgICAgICB9XG4gICAgICAgIC8vIFJlbW92ZSB1bnVzZWQgcXVhZHJhbnRzLiBhbmQgQWRkIHNwYWNlIGlmIHR3byB3b3Jkc1xuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbj8ucmVwbGFjZSgvW1xcZF0rL2csXCJcIikucmVwbGFjZSgvKGJlbG93fGFib3ZlKShyaWdodHxyaWdodCkvLFwiJDEgJDJcIik7XG4gICAgfVxuXG4gICAgYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nQXJyOiBhbnkpe1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmb3JtYXR0aW5nQXJyKSkge1xuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jyl7XG4gICAgICAgICAgICAgICAgLy90aGlzLnNldFByb3BlcnR5KGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nLGZvcm1hdHRpbmcpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0UHJvcGVydHkoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcsdmFsdWUpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpbnRlcnByZXRGb3JtYXR0aW5nKGZvcm1hdHRpbmdTdHJpbmc6IHN0cmluZywpe1xuXG4gICAgICAgIGNvbnN0IHNwbGl0Rm9ybWF0dGluZz1mb3JtYXR0aW5nU3RyaW5nLnJlcGxhY2UoL1xccy9nLFwiXCIpLm1hdGNoKC8oPzp7W159XSp9fFteLHt9XSspKy9nKSB8fCBbXTtcblxuICAgICAgICBzcGxpdEZvcm1hdHRpbmcuZm9yRWFjaChmb3JtYXR0aW5nID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZm9ybWF0dGluZy5tYXRjaCgvXihbXj1dKyk9eyguKil9JC8pO1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAhIW1hdGNoOiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCl7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCAgW18scGFyZW50LCBjaGlsZHJlbl09bWF0Y2g7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmludGVycHJldEZvcm1hdHRpbmcoY2hpbGRyZW4pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgZm9ybWF0dGluZy5pbmNsdWRlcyhcImxpbmV3aWR0aFwiKToge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwibGluZVdpZHRoXCIsZm9ybWF0dGluZylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgZm9ybWF0dGluZy5pbmNsdWRlcyhcImZpbGw9XCIpOiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJmaWxsXCIsZm9ybWF0dGluZylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZmlsbG9wYWNpdHkvKToge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwiZmlsbE9wYWNpdHlcIixmb3JtYXR0aW5nKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL14oLT58PC18LSp7U3RlYWx0aH0tKikkLyk6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hcnJvdyA9IGZvcm1hdHRpbmdcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpezEsMn0kLyk6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wb3NpdGlvbj1mb3JtYXR0aW5nLnJlcGxhY2UoLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8sXCIkMSBcIilcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9ecG9zPS8pOiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJwb3NcIixmb3JtYXR0aW5nKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15kcmF3PS8pOiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJkcmF3XCIsZm9ybWF0dGluZylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZGVjb3JhdGUkLyk6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kZWNvcmF0ZT10cnVlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL150ZXh0PS8pOiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJ0ZXh0XCIsZm9ybWF0dGluZylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eYW5jb2hyPS8pOiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJ0ZXh0XCIsZm9ybWF0dGluZylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eYnJhY2UkLyk6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4sKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eYW1wbGl0dWRlLyk6XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJkZWNvcmF0aW9uXCIsZm9ybWF0dGluZyxcImFtcGxpdHVkZVwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJkZWNvcmF0aW9uXCJdPiwpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZHJhdyQvKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXRoQXR0cmlidXRlID0gZm9ybWF0dGluZzticmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXmhlbHBsaW5lcyQvKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aWt6c2V0ID0gZm9ybWF0dGluZy5yZXBsYWNlKC9oZWxwbGluZXMvZyxcImhlbHAgbGluZXNcIik7YnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL14ocmVkfGJsdWV8cGlua3xibGFja3x3aGl0ZXxbIVxcZC5dKyl7MSw1fSQvKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2xvcj1mb3JtYXR0aW5nO2JyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKGRvdHRlZHxkYXNoZWR8c21vb3RofGRlbnNlbHl8bG9vc2VseSl7MSwyfSQvKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5saW5lU3R5bGU9Zm9ybWF0dGluZy5yZXBsYWNlKC8oZGVuc2VseXxsb29zZWx5KS8sXCIkMSBcIik7YnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcbiAgICAgICAga2V5OiBLLFxuICAgICAgICBmb3JtYXR0aW5nOiBhbnksXG4gICAgICAgIG5lc3RlZEtleT86IE5LXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGxldCB2YWx1ZTtcbiAgICAgICAgaWYodHlwZW9mIGZvcm1hdHRpbmchPT1cImJvb2xlYW5cIil7XG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBmb3JtYXR0aW5nLnNwbGl0KFwiPVwiKTtcbiAgICBcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgZm9ybWF0dGluZyBzdHJpbmcgaXMgdmFsaWRcbiAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPCAyIHx8ICFtYXRjaFsxXSkgcmV0dXJuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGlmIHRoZSB2YWx1ZSBpcyBhIG51bWJlciBvciBhIHN0cmluZ1xuICAgICAgICAgICAgdmFsdWUgPSAhaXNOYU4ocGFyc2VGbG9hdChyYXdWYWx1ZSkpICYmIGlzRmluaXRlKCtyYXdWYWx1ZSlcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXG4gICAgICAgICAgICAgICAgOiByYXdWYWx1ZS5yZXBsYWNlKC8tXFx8Lywnbm9ydGgnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNle1xuICAgICAgICAgICAgdmFsdWU9Zm9ybWF0dGluZ1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLnNldFByb3BlcnR5KGtleSwgdmFsdWUsIG5lc3RlZEtleSk7XG4gICAgfVxuICAgIFxuICAgIHNldFByb3BlcnR5PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcbiAgICAgICAga2V5OiBLLFxuICAgICAgICB2YWx1ZTogYW55LFxuICAgICAgICBuZXN0ZWRLZXk/OiBOS1xuICAgICk6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlPT09XCJzdHJpbmdcIilcbiAgICAgICAgICAgIHZhbHVlPXZhbHVlLnJlcGxhY2UoL15cXHwtJC8sXCJub3J0aFwiKS5yZXBsYWNlKC9eLVxcfCQvLFwic291dGhcIik7XG5cbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ09iaiA9IHRoaXMgYXMgUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICAgICAgaWYgKG5lc3RlZEtleSkge1xuICAgICAgICAgICAgaWYgKCFmb3JtYXR0aW5nT2JqW2tleV0gfHwgdHlwZW9mIGZvcm1hdHRpbmdPYmpba2V5XSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV0gPSB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XVtuZXN0ZWRLZXldID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBcbiAgICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICBsZXQgc3RyaW5nPSdbJztcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModGhpcykpIHtcbiAgICAgICAgICAgIGlmIChrZXk9PT1cIm1vZGVcIil7Y29udGludWU7fVxuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jyl7XG4gICAgICAgICAgICAgICAgc3RyaW5nKz10aGlzLmhhbmRsZU9iamVjdFRvU3RyaW5nKHZhbHVlLGtleSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrKHR5cGVvZiB2YWx1ZT09PVwiYm9vbGVhblwiPycnOnZhbHVlKSsnLCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZytcIl1cIjtcbiAgICB9XG5cbiAgICBoYW5kbGVPYmplY3RUb1N0cmluZyhvYmo6IG9iamVjdCwgcGFyZW50S2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICBsZXQgcmVzdWx0ID0gbWF0Y2hLZXlXaXRoVmFsdWUocGFyZW50S2V5KSsneyc7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBtYXRjaEtleVdpdGhWYWx1ZShgJHtwYXJlbnRLZXl9LiR7a2V5fWApICsgKHR5cGVvZiB2YWx1ZSA9PT0gXCJib29sZWFuXCIgPyAnJyA6IHZhbHVlKSArICcsJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0K1wifSxcIjtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBDb29yZGluYXRlIHtcbiAgICBtb2RlOiBzdHJpbmc7XG4gICAgYXhpcz86IEF4aXM7XG4gICAgb3JpZ2luYWw/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XG4gICAgZm9ybWF0dGluZz86IEZvcm1hdHRpbmc7XG4gICAgbGFiZWw/OiBzdHJpbmc7XG4gICAgcXVhZHJhbnQ/OiBudW1iZXI7XG4gICAgXG4gICAgY29uc3RydWN0b3IobW9kZT86IHN0cmluZywgYXhpcz86IEF4aXMsIG9yaWdpbmFsPzogc3RyaW5nLCBjb29yZGluYXRlTmFtZT86IHN0cmluZywgZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsIGxhYmVsPzogc3RyaW5nLCBxdWFkcmFudD86IG51bWJlcik7XG4gICAgY29uc3RydWN0b3Iob3B0aW9uczogeyBtb2RlPzogc3RyaW5nOyBheGlzPzogQXhpczsgb3JpZ2luYWw/OiBzdHJpbmc7IGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nOyBmb3JtYXR0aW5nPzogRm9ybWF0dGluZzsgbGFiZWw/OiBzdHJpbmc7IHF1YWRyYW50PzogbnVtYmVyIH0pO1xuXG5cbiAgY29uc3RydWN0b3IoXG4gICAgbW9kZT86IHN0cmluZyB8IHsgbW9kZT86IHN0cmluZzsgYXhpcz86IEF4aXM7IG9yaWdpbmFsPzogc3RyaW5nOyBjb29yZGluYXRlTmFtZT86IHN0cmluZzsgZm9ybWF0dGluZz86IEZvcm1hdHRpbmc7IGxhYmVsPzogc3RyaW5nOyBxdWFkcmFudD86IG51bWJlciB9LFxuICAgIGF4aXM/OiBBeGlzLFxuICAgIG9yaWdpbmFsPzogc3RyaW5nLFxuICAgIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nLFxuICAgIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLFxuICAgIGxhYmVsPzogc3RyaW5nLFxuICAgIHF1YWRyYW50PzogbnVtYmVyXG4gICkge1xuICAgIGlmICh0eXBlb2YgbW9kZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgLy8gSGFuZGxlIHRoZSBjYXNlIHdoZXJlIGluZGl2aWR1YWwgcGFyYW1ldGVycyBhcmUgcGFzc2VkXG4gICAgICB0aGlzLm1vZGUgPSBtb2RlO1xuICAgICAgaWYgKGF4aXMgIT09IHVuZGVmaW5lZCkgdGhpcy5heGlzID0gYXhpcztcbiAgICAgIHRoaXMub3JpZ2luYWwgPSBvcmlnaW5hbDtcbiAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUgPSBjb29yZGluYXRlTmFtZTtcbiAgICAgIGlmIChmb3JtYXR0aW5nICE9PSB1bmRlZmluZWQpIHRoaXMuZm9ybWF0dGluZyA9IGZvcm1hdHRpbmc7XG4gICAgICB0aGlzLmxhYmVsID0gbGFiZWw7XG4gICAgICB0aGlzLnF1YWRyYW50ID0gcXVhZHJhbnQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kZSA9PT0gXCJvYmplY3RcIiAmJiBtb2RlICE9PSBudWxsKSB7XG4gICAgICAvLyBIYW5kbGUgdGhlIGNhc2Ugd2hlcmUgYW4gb3B0aW9ucyBvYmplY3QgaXMgcGFzc2VkXG4gICAgICBjb25zdCBvcHRpb25zID0gbW9kZTtcblxuICAgICAgaWYgKG9wdGlvbnMubW9kZSAhPT0gdW5kZWZpbmVkKSB0aGlzLm1vZGUgPSBvcHRpb25zLm1vZGU7XG4gICAgICB0aGlzLmF4aXMgPSBvcHRpb25zLmF4aXM7XG4gICAgICB0aGlzLm9yaWdpbmFsID0gb3B0aW9ucy5vcmlnaW5hbDtcbiAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUgPSBvcHRpb25zLmNvb3JkaW5hdGVOYW1lO1xuICAgICAgdGhpcy5mb3JtYXR0aW5nID0gb3B0aW9ucy5mb3JtYXR0aW5nO1xuICAgICAgdGhpcy5sYWJlbCA9IG9wdGlvbnMubGFiZWw7XG4gICAgICB0aGlzLnF1YWRyYW50ID0gb3B0aW9ucy5xdWFkcmFudDtcbiAgICB9XG4gIH1cblxuICAgIGNsb25lKCk6IENvb3JkaW5hdGUge1xuICAgICAgICByZXR1cm4gbmV3IENvb3JkaW5hdGUoXG4gICAgICAgICAgICB0aGlzLm1vZGUsXG4gICAgICAgICAgICB0aGlzLmF4aXMgPyB0aGlzLmF4aXMuY2xvbmUoKSA6dW5kZWZpbmVkLFxuICAgICAgICAgICAgdGhpcy5vcmlnaW5hbCxcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUsXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmcsXG4gICAgICAgICAgICB0aGlzLmxhYmVsLFxuICAgICAgICAgICAgdGhpcy5xdWFkcmFudFxuICAgICAgICApO1xuICAgIH1cbiAgICBhZGRBeGlzKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyKXtcbiAgICAgICAgdGhpcy5heGlzPW5ldyBBeGlzKGNhcnRlc2lhblgsIGNhcnRlc2lhblksIHBvbGFyTGVuZ3RoLCBwb2xhckFuZ2xlKTtcbiAgICB9XG4gICAgYWRkSW5mbyhtYXRjaDoge29yaWdpbmFsPzogc3RyaW5nLGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nLGxhYmVsPzogc3RyaW5nLGZvcm1hdHRpbmc/OiBzdHJpbmd9LCBtb2RlOiBzdHJpbmcsdG9rZW5zPzogRm9ybWF0VGlrempheCxmb3JtYXR0aW5nPzogb2JqZWN0KSB7XG4gICAgICAgIHRoaXMubW9kZT1tb2RlO1xuICAgICAgICAoW3tvcmlnaW5hbDogdGhpcy5vcmlnaW5hbCxjb29yZGluYXRlTmFtZTogdGhpcy5jb29yZGluYXRlTmFtZSxsYWJlbDogdGhpcy5sYWJlbH1dPVttYXRjaF0pXG5cbiAgICAgICAgaWYodGhpcy5vcmlnaW5hbCl7XG4gICAgICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoKS51bml2ZXJzYWwodGhpcy5vcmlnaW5hbCx0b2tlbnMpO1xuICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9bmV3IEZvcm1hdHRpbmcodGhpcy5tb2RlLGZvcm1hdHRpbmcsbWF0Y2guZm9ybWF0dGluZyk7XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJjb29yZGluYXRlXCI6XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcylcbiAgICAgICAgICAgICAgICByZXR1cm4gYFxcXFxjb29yeyR7dGhpcy5heGlzLnRvU3RyaW5nKCl9fXske3RoaXMuY29vcmRpbmF0ZU5hbWUgfHwgXCJcIn19eyR7dGhpcy5sYWJlbCB8fCBcIlwifX17fWA7XG4gICAgICAgICAgICBjYXNlIFwibm9kZVwiOlxuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgY2FzZSBcIm5vZGUtaW5saW5lXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBub2RlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSB7JHt0aGlzLmxhYmVsfHwnJ319YFxuICAgICAgICAgICAgY2FzZSBcIm5vZGUtbWFzc1wiOlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmF4aXMpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBcXFxcbm9kZSAke3RoaXMuY29vcmRpbmF0ZU5hbWU/JygnK3RoaXMuY29vcmRpbmF0ZU5hbWUrJyknOicnfSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSB7JHt0aGlzLmxhYmVsfX07YFxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIG1vZGUgYXQgdG8gc3RyaW5nIGNvb3JkaW5hdGVcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgfVxuXG4gICAgYWRkUXVhZHJhbnQobWlkUG9pbnQ6IEF4aXMpIHtcbiAgICAgICAgaWYgKHRoaXMuYXhpcyl7XG4gICAgICAgICAgICBjb25zdCB4RGlyZWN0aW9uID0gdGhpcy5heGlzLmNhcnRlc2lhblggPiBtaWRQb2ludC5jYXJ0ZXNpYW5YID8gMSA6IC0xO1xuICAgICAgICAgICAgY29uc3QgeURpcmVjdGlvbiA9IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZID4gbWlkUG9pbnQuY2FydGVzaWFuWSA/IDEgOiAtMTtcbiAgICAgICAgICAgIHRoaXMucXVhZHJhbnQgPSB5RGlyZWN0aW9uID09PSAxID8gKHhEaXJlY3Rpb24gPT09IDEgPyAxIDogMikgOiAoeERpcmVjdGlvbiA9PT0gMSA/IDQgOiAzKTtcbiAgICAgICAgfSAgIFxuICAgIH1cbn1cblxudHlwZSBUb2tlbiA9QXhpcyB8IENvb3JkaW5hdGUgfERyYXd8Rm9ybWF0dGluZ3wgc3RyaW5nO1xuXG5leHBvcnQgY2xhc3MgRHJhdyB7XG4gICAgbW9kZT86IHN0cmluZ1xuICAgIGZvcm1hdHRpbmc6IEZvcm1hdHRpbmc7XG4gICAgY29vcmRpbmF0ZXM6IEFycmF5PFRva2VuPjtcblxuICAgIGNvbnN0cnVjdG9yKG1hdGNoOiB7Zm9ybWF0dGluZzogc3RyaW5nfGFueSxkcmF3OiBzdHJpbmd8YW55fSwgdG9rZW5zPzogRm9ybWF0VGlrempheCxtb2RlPzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMubW9kZT1tb2RlO1xuICAgICAgICB0aGlzLm1vZGU9YGRyYXcke21vZGU/XCItXCIrbW9kZTpcIlwifWA7XG4gICAgICAgIGlmICh0eXBlb2YgbWF0Y2guZm9ybWF0dGluZyA9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZz1uZXcgRm9ybWF0dGluZyhgZHJhd2Ase30sbWF0Y2guZm9ybWF0dGluZyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICB0aGlzLmZvcm1hdHRpbmc9IG5ldyBGb3JtYXR0aW5nKGBkcmF3YCxtYXRjaC5mb3JtYXR0aW5nLCcnKTtcblxuICAgICAgICBpZih0eXBlb2YgbWF0Y2guZHJhdz09PVwic3RyaW5nXCIpe1xuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcyA9IHRoaXMuZmlsbENvb3JkaW5hdGVzKHRoaXMuZ2V0U2NoZW1hdGljKG1hdGNoLmRyYXcpLCB0b2tlbnMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2V7XG4gICAgICAgICAgICB0aGlzLmNvb3JkaW5hdGVzPXRoaXMuY3JlYXRlRnJvbUFycmF5KG1hdGNoLmRyYXcpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjcmVhdGVGcm9tQXJyYXkoYXJyOiBhbnkpe1xuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XG4gICAgICAgIGZvciAobGV0IGk9MDtpPGFyci5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGlmIChhcnJbaV0gaW5zdGFuY2VvZiBBeGlzfHxhcnJbaV0gaW5zdGFuY2VvZiBDb29yZGluYXRlKXtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYodHlwZW9mIGFycj09PVwic3RyaW5nXCIpe1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaChhcnJbaV0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGNvb3JkaW5hdGVzQXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlc0FycmF5W2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xuICAgICAgICAgICAgICAgIGxldCBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHdoaWxlIChpIDwgY29vcmRpbmF0ZXNBcnJheS5sZW5ndGggJiYgIWZvdW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb29yZGluYXRlc0FycmF5W2ldID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiAoY29vcmRpbmF0ZXNBcnJheVtpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpLS07IFxuICAgICAgICAgICAgICAgIGlmIChmb3VuZCkge1xuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goJy0tJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xuICAgIH1cblxuICAgIGZpbGxDb29yZGluYXRlcyhzY2hlbWF0aWM6IGFueVtdLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4KSB7XG4gICAgICAgIGNvbnN0IGNvb3JBcnI6IEFycmF5PFRva2VuPj1bXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2hlbWF0aWMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcbiAgICAgICAgICAgICAgICBsZXQgcHJldmlvdXNGb3JtYXR0aW5nO1xuXG4gICAgICAgICAgICAgICAgaWYgKGkgPiAwICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAxXS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPiAxICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJub2RlXCIgJiYgc2NoZW1hdGljW2kgLSAyXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDJdLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IEF4aXMoKS51bml2ZXJzYWwoc2NoZW1hdGljW2ldLnZhbHVlLCB0b2tlbnMsIGNvb3JBcnIsIHByZXZpb3VzRm9ybWF0dGluZywgKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwibm9kZVwiKXtcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IENvb3JkaW5hdGUoKS5hZGRJbmZvKHtsYWJlbDogc2NoZW1hdGljW2ldLnZhbHVlLGZvcm1hdHRpbmc6IHNjaGVtYXRpY1tpXS5mb3JtYXR0aW5nfSxcIm5vZGUtaW5saW5lXCIsdG9rZW5zKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChzY2hlbWF0aWNbaV0udmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb29yQXJyO1xuICAgIH1cblxuICAgIGdldFNjaGVtYXRpYyhkcmF3OiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVnZXg9Z2V0UmVnZXgoKTtcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xuICAgICAgICBjb25zdCBub2RlUmVnZXggPSByZWdFeHAoU3RyaW5nLnJhd2Bub2RlXFxzKlxcWygke3JlZ2V4LmZvcm1hdHRpbmd9KilcXF1cXHMqeygke3JlZ2V4LnRleHR9Kil9YCk7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRpbmdSZWdleCA9IC8oLS1jeWNsZXxjeWNsZXwtLVxcK1xcK3wtLVxcK3wtLXwtXFx8fFxcfC18Z3JpZHxjaXJjbGV8cmVjdGFuZ2xlKS87XG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHNcXC0sLjpgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoXFwoWyR7Y2F9XStcXCl8XFwoXFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitcXC1dK1xcKFske2NhfV0rXFwpXFwkXFwpKWApO1xuICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgIGxldCBsb29wcyA9IDA7XG4gICAgICAgIFxuICAgICAgICB3aGlsZSAoaSA8IGRyYXcubGVuZ3RoICYmIGxvb3BzIDwgMTAwKSB7IC8vIEluY3JlYXNlIGxvb3AgbGltaXQgb3IgYWRkIGNvbmRpdGlvbiBiYXNlZCBvbiBwYXJzZWQgbGVuZ3RoXG4gICAgICAgICAgICBsb29wcysrO1xuICAgICAgICAgICAgY29uc3QgY29vcmRpbmF0ZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChjb29yZGluYXRlUmVnZXgpO1xuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlTWF0Y2g/LmluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJjb29yZGluYXRlXCIsIHZhbHVlOiBjb29yZGluYXRlTWF0Y2hbMV0gfSk7XG4gICAgICAgICAgICAgICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleCk7XG4gICAgICAgICAgICBpZiAoZm9ybWF0dGluZ01hdGNoPy5pbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGkgKz0gZm9ybWF0dGluZ01hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpO1xuICAgICAgICAgICAgaWYgKG5vZGVNYXRjaD8uaW5kZXggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm5vZGVcIixcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGluZzogbm9kZU1hdGNoWzFdIHx8IFwiXCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBub2RlTWF0Y2hbMl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpICs9IG5vZGVNYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvb3BzID09PSAxMDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBhcnNpbmcgZXhjZWVkZWQgc2FmZSBsb29wIGNvdW50XCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xuICAgIH1cblxuICAgIGlzQ29vcmRpbmF0ZShvYmo6IGFueSk6IG9iaiBpcyBDb29yZGluYXRlIHtcbiAgICAgICAgcmV0dXJuIG9iaiAmJiBvYmogaW5zdGFuY2VvZiBDb29yZGluYXRlO1xuICAgIH1cblxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3ICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSBgO1xuICAgICAgICBsZXQgYmVmb3JlVG9rZW46IENvb3JkaW5hdGUgfCB1bmRlZmluZWQ7XG4gICAgICAgIGxldCBhZnRlclRva2VuOiBDb29yZGluYXRlIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgc2xvcGU7XG5cbiAgICAgICAgdGhpcy5jb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgY29vcmRpbmF0ZSBpbnN0YW5jZW9mIENvb3JkaW5hdGUmJmNvb3JkaW5hdGUubW9kZT09PVwibm9kZS1pbmxpbmVcIjoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSB0eXBlb2YgY29vcmRpbmF0ZT09PVwic3RyaW5nXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IC8oLS1cXCtcXCt8LS1cXCspLy50ZXN0KGNvb3JkaW5hdGUpP1wiLS1cIjpjb29yZGluYXRlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz1gKCR7Y29vcmRpbmF0ZS50b1N0cmluZygpfSlgXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvcm1hdFRpa3pqYXgge1xuXHRzb3VyY2U6IHN0cmluZztcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcbiAgICBtaWRQb2ludDogQXhpcztcblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xuICAgIGRlYnVnSW5mbyA9IFwiXCI7XG4gICAgXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nfEFycmF5PFRva2VuPikge1xuICAgICAgICBpZih0eXBlb2Ygc291cmNlPT09XCJzdHJpbmdcIil7XG5cdFx0dGhpcy5zb3VyY2UgPSB0aGlzLnRpZHlUaWt6U291cmNlKHNvdXJjZSk7XG4gICAgICAgIHRoaXMudG9rZW5pemUoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHRoaXMudG9rZW5zPXNvdXJjZVxuXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnNvdXJjZTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuZmluZE1pZHBvaW50KCk7XG4gICAgICAgIHRoaXMuYXBwbHlQb3N0UHJvY2Vzc2luZygpO1xuICAgICAgICB0aGlzLmRlYnVnSW5mbys9XCJcXG5cXG50aGlzLm1pZFBvaW50OlxcblwiK0pTT04uc3RyaW5naWZ5KHRoaXMubWlkUG9pbnQsbnVsbCwxKStcIlxcblwiXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz1KU09OLnN0cmluZ2lmeSh0aGlzLnRva2VucyxudWxsLDEpK1wiXFxuXFxuXCJcblxuICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpO1xuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5wcm9jZXNzZWRDb2RlO1xuXHR9XG4gICAgXG4gICAgdGlkeVRpa3pTb3VyY2UodGlrelNvdXJjZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XG4gICAgICAgIHRpa3pTb3VyY2UgPSB0aWt6U291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSB0aWt6U291cmNlLnNwbGl0KFwiXFxuXCIpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKTs7XG4gICAgfVxuXG4gICAgYXBwbHlQb3N0UHJvY2Vzc2luZygpe1xuICAgICAgICBmb3IobGV0IGk9MDtpPHRoaXMudG9rZW5zLmxlbmd0aDtpKyspe1xuICAgICAgICAgICAgXG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0Q29kZSgpe1xuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XG4gICAgfVxuICAgIHRva2VuaXplKCkge1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxccy0sLjp8YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxuICAgICAgICBjb25zdCBjID0gU3RyaW5nLnJhd2BbJChdezAsMn1bJHtjYX1dK1spJF17MCwyfXxcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K10rXFwoWyR7Y2F9XStcXClcXCRgO1xuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgd2l0aCBlc2NhcGVkIGNoYXJhY3RlcnMgZm9yIHNwZWNpZmljIG1hdGNoaW5nXG4gICAgICAgIGNvbnN0IGNuID0gU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gOyAvLyBDb29yZGluYXRlIG5hbWVcbiAgICAgICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXFwkW1xcd1xcZFxcc1xcLSwuOighKVxcLVxce1xcfVxcK1xcXFxdKlxcJHxbXFx3XFxkXFxzXFwtLC46KCEpX1xcLVxcK1xcXFxdKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG4gICAgICAgIGNvbnN0IGYgPSBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsuJipcXHtcXH0lXFwtPD5dYDsgLy8gRm9ybWF0dGluZyB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcblxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXG4gICAgICAgIGNvbnN0IGNvb3JSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vclxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBzZSA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxccypcXCgqKCR7Y259KVxcKSpcXHMqYXRcXHMqXFwoKCR7Y30pXFwpXFxzKlxcWygke2Z9KilcXF1cXHMqXFx7KCR7dH0pXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBzcyA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vcmRpbmF0ZVxccyooXFxbbGFiZWw9XFx7XFxbKC4qPylcXF06XFxcXFxcdypcXHMqKFtcXHdcXHNdKilcXH1cXF0pP1xccypcXCgoJHtjbn0rKVxcKVxccyphdFxccypcXCgoJHtjfSlcXCk7YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBkcmF3UmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGRyYXdcXFsoJHtmfSopXFxdKFteO10qKTtgLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHh5YXhpc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx4eWF4aXN7KCR7dH0pfXsoJHt0fSl9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBncmlkUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGdyaWR7KFtcXGQtLl0rKX1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IGNpcmNsZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjaXJjbGVcXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoW1xcd1xcc1xcZF0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgbWFzc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxtYXNzXFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KC1cXHx8XFx8fD4pezAsMX1cXH1cXHsoW1xcZC5dKilcXH1gLFwiZ1wiKTtcblxuICAgICAgICBjb25zdCB2ZWNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcdmVjXFx7KCR7Y30pXFx9XFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtjb29yUmVnZXgsIHNlLCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4XTtcbiAgICAgICAgbGV0IG1hdGNoZXM6IGFueVtdPVtdO1xuICAgICAgICByZWdleFBhdHRlcm5zLmZvckVhY2goYWIgPT4ge1xuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGEuaW5kZXggfHwgMCkgLSAoYi5pbmRleCB8fCAwKSk7XG5cbiAgICAgICAgW3h5YXhpc1JlZ2V4LGdyaWRSZWdleF0uZm9yRWFjaChhYiA9PiB7XG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xuICAgICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCAmJiBtYXRjaC5pbmRleCA+IGN1cnJlbnRJbmRleCkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JcIikpIHtcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzJdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFs0XX1cbiAgICAgICAgICAgIGlmKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vcmRpbmF0ZVwiKSl7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbNV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzRdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFsyXX0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCkuYWRkSW5mbyhpLFwiY29vcmRpbmF0ZVwiLHRoaXMpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZHJhd1wiKSkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7Zm9ybWF0dGluZzogbWF0Y2hbMV0sZHJhdzogbWF0Y2hbMl19LCB0aGlzKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHh5YXhpc1wiKSkge1xuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKGRpc3NlY3RYWWF4aXMobWF0Y2gpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKHt0eXBlOiBcImdyaWRcIiwgcm90YXRlOiBtYXRjaFsxXX0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFszXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119XG4gICAgICAgICAgICBpZiAobWF0Y2hbMF0ubWF0Y2goL1xcXFxub2RlXFxzKlxcKC8pKXtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCkuYWRkSW5mbyhpLFwibm9kZVwiLHRoaXMpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7LypcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICB0eXBlOiBcImNpcmNsZVwiLFxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSxcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzFdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsyXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pOyovXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXG1hc3NcIikpIHtcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sIGxhYmVsOiBtYXRjaFsyXX1cbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoKS5hZGRJbmZvKGksXCJub2RlLW1hc3NcIix0aGlzLHthbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KSlcblxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdKTtcbiAgICAgICAgICAgIGNvbnN0IGF4aXMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzJdKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGU9bmV3IENvb3JkaW5hdGUoe21vZGU6ICdub2RlLWlubGluZScsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoJ25vZGUtaW5saW5lJyx7fSwnJyksbGFiZWw6IG1hdGNoWzNdfSlcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQ29vcmRpbmF0ZShcIm5vZGUtaW5saW5lXCIpO1xuICAgICAgICAgICAgbWF0Y2hbMl09YCgke21hdGNoWzFdfSktLStub2RlW117JHttYXRjaFszXX19KCR7bWF0Y2hbMl19KWBcbiAgICAgICAgICAgIG1hdGNoWzFdPW1hdGNoWzRdKycsLT4nXG4gICAgICAgICAgICBjb25zdCBxPVthbmNlciwnLS0rJyxub2RlLGF4aXMxXVxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7Zm9ybWF0dGluZzogJycsZHJhdzogcX0sdGhpcywnZHJhdycpKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjdXJyZW50SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4KSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmaW5kTWlkcG9pbnQoKSB7XG4gICAgICAgIC8qbGV0IGNvb3JkaW5hdGVzID0gdGhpcy50b2tlbnMuZmlsdGVyKCh0b2tlbjogVG9rZW4pID0+IHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSk7XG4gICAgICAgIHRoaXMudG9rZW5zXG4gICAgICAgIC5maWx0ZXIoKHRva2VuOiBUb2tlbikgPT4gdG9rZW4gaW5zdGFuY2VvZiBEcmF3KVxuICAgICAgICAuZm9yRWFjaCgob2JqZWN0OiBEcmF3KSA9PiB7XG4gICAgICAgICAgICBjb29yZGluYXRlcyA9IGNvb3JkaW5hdGVzLmNvbmNhdChcbiAgICAgICAgICAgICAgICBvYmplY3QuY29vcmRpbmF0ZXMuZmlsdGVyKCh0b2tlbjogYW55KSA9PiB0b2tlbiBpbnN0YW5jZW9mIENvb3JkaW5hdGUpXG4gICAgICAgICAgICApO1xuICAgICAgICB9KTtcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XG4gICAgICAgIGNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IHRva2VuKSA9PiB7XG4gICAgICAgICAgc3VtT2ZYICs9IE51bWJlcihjb29yZGluYXRlLlgpO1xuICAgICAgICAgIHN1bU9mWSArPSBOdW1iZXIoY29vcmRpbmF0ZS5ZKTsgXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMubWlkUG9pbnQ9bmV3IEF4aXMoKTtcbiAgICAgICAgdGhpcy5taWRQb2ludC5hZGRDYXJ0ZXNpYW4oXG4gICAgICAgICAgICBzdW1PZlggLyBjb29yZGluYXRlcy5sZW5ndGghPT0wP2Nvb3JkaW5hdGVzLmxlbmd0aDoxXG4gICAgICAgICAgICAsc3VtT2ZZIC8gY29vcmRpbmF0ZXMubGVuZ3RoIT09MD9jb29yZGluYXRlcy5sZW5ndGg6MVxuICAgICAgICApKi9cbiAgICB9XG5cbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkO1xuICAgIH1cbiAgICBcbiAgICBhcHBseVF1YWRyYW50cygpIHtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICAgIGlmICh0eXBlb2YgdG9rZW4gPT09IFwib2JqZWN0XCIgJiYgdG9rZW4gIT09IG51bGwmJnRva2VuLnR5cGU9PT1cImNvb3JkaW5hdGVcIikge1xuICAgICAgICAgICAgdG9rZW4uYWRkUXVhZHJhbnQodGhpcy5taWRQb2ludCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICB0b1N0cmluZygpe1xuICAgICAgICBsZXQgY29kZUJsb2NrT3V0cHV0ID0gXCJcIjtcbiAgICAgICAgY29uc3QgZXh0cmVtZVhZPWdldEV4dHJlbWVYWSh0aGlzLnRva2Vucyk7XG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcblxuICAgICAgICAgICAgaWYodG9rZW4udG9TdHJpbmcoKSl7XG4gICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9dG9rZW4udG9TdHJpbmcoKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xuICAgIH1cbn1cblxuXG5cblxuXG5cbmZ1bmN0aW9uIGRpc3NlY3RYWWF4aXMobWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkpIHtcbiAgICBsZXQgWG5vZGU6UmVnRXhwTWF0Y2hBcnJheXxzdHJpbmc9XCJcIiwgWW5vZGU6UmVnRXhwTWF0Y2hBcnJheXxzdHJpbmc9XCJcIjtcblxuICAgIGlmIChtYXRjaFsxXSAmJiBtYXRjaFsyXSkge1xuICAgICAgICBYbm9kZSA9IG1hdGNoWzFdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XG4gICAgICAgIFlub2RlID0gbWF0Y2hbMl0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcbiAgICAgICAgWG5vZGU9WG5vZGVbMF0uc3Vic3RyaW5nKDEsWG5vZGUubGVuZ3RoKVxuICAgICAgICBZbm9kZT1Zbm9kZVswXS5zdWJzdHJpbmcoMSxZbm9kZS5sZW5ndGgpXG4gICAgfVxuICAgIFxuICAgIHJldHVybiB7XG4gICAgICAgIHR5cGU6IFwieHlheGlzXCIsXG4gICAgICAgIFhmb3JtYXR0aW5nOiBtYXRjaFsxXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXG4gICAgICAgIFlmb3JtYXR0aW5nOiBtYXRjaFsyXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXG4gICAgICAgIHhEaXJlY3Rpb246IG1hdGNoWzFdICYmIC8tPi8udGVzdChtYXRjaFsxXSkgPyBcImxlZnRcIiA6IFwicmlnaHRcIixcbiAgICAgICAgeURpcmVjdGlvbjogbWF0Y2hbMl0gJiYgLy0+Ly50ZXN0KG1hdGNoWzJdKSA/IFwiZG93blwiIDogXCJ1cFwiLFxuICAgICAgICBYbm9kZTogWG5vZGUsXG4gICAgICAgIFlub2RlOiBZbm9kZSxcbiAgICB9O1xufVxuXG5cblxuXG5cblxuXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcbmxldCBtYXhYID0gLUluZmluaXR5O1xubGV0IG1heFkgPSAtSW5maW5pdHk7XG5sZXQgbWluWCA9IEluZmluaXR5O1xubGV0IG1pblkgPSBJbmZpbml0eTtcblxudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcbiAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcbiAgICBpZiAodG9rZW4uWCA+IG1heFgpIG1heFggPSB0b2tlbi5YO1xuICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XG5cbiAgICBpZiAodG9rZW4uWSA+IG1heFkpIG1heFkgPSB0b2tlbi5ZO1xuICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XG4gICAgfVxufSk7XG5cbnJldHVybiB7XG4gICAgbWF4WCxtYXhZLG1pblgsbWluWSxcbn07XG59XG5cblxuXG5cbi8qXG5mdW5jdGlvbiBnZW5lcmF0ZUZvcm1hdHRpbmcoY29vcmRpbmF0ZTogQ29vcmRpbmF0ZSl7XG4gICAgaWYgKHR5cGVvZiBjb29yZGluYXRlLmxhYmVsICE9PSBcInN0cmluZ1wiKXsgcmV0dXJuIFwiXCI7IH1cbiAgICBjb25zdCBmb3JtYXR0aW5nID0gY29vcmRpbmF0ZS5mb3JtYXR0aW5nPy5zcGxpdChcIixcIikgfHwgW107XG4gICAgaWYgKGZvcm1hdHRpbmcuc29tZSgodmFsdWU6IHN0cmluZykgPT4gLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8udGVzdCh2YWx1ZSkpKSB7XG4gICAgICAgIHJldHVybiBjb29yZGluYXRlLmZvcm1hdHRpbmc7XG4gICAgfVxuICAgIGlmKGZvcm1hdHRpbmcubGVuZ3RoPjAmJiFmb3JtYXR0aW5nW2Zvcm1hdHRpbmcubGVuZ3RoLTFdLmVuZHNXaXRoKFwiLFwiKSl7Zm9ybWF0dGluZy5wdXNoKFwiLFwiKX1cbiAgICBzd2l0Y2goY29vcmRpbmF0ZS5xdWFkcmFudCl7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgcmlnaHQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgbGVmdCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyBsZWZ0LCBcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDQ6IFxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyByaWdodCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGZvcm1hdHRpbmcuam9pbihcIlwiKTtcbn1cbiovXG5cblxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoKTpzdHJpbmd7XG4gICAgY29uc3QgYW5nPVwiXFxcXHRpa3pzZXR7YW5nLy5zdHlsZSAyIGFyZ3M9e2ZpbGw9YmxhY2shNTAsb3BhY2l0eT0wLjUsdGV4dCBvcGFjaXR5PTAuOSxkcmF3PW9yYW5nZSw8LT4sYW5nbGUgZWNjZW50cmljaXR5PSMxLGFuZ2xlIHJhZGl1cz0jMmNtLHRleHQ9b3JhbmdlLGZvbnQ9XFxcXGxhcmdlfSxhbmcvLmRlZmF1bHQ9ezEuNn17MC41fX1cIlxuICBcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxuICBcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxuICAgIGNvbnN0IHNwcmluZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxzcHJpbmd9WzRde1xcXFx0aWt6bWF0aHtjb29yZGluYXRlIFxcXFxzdGFydCwgXFxcXGRvbmU7XFxcXHN0YXJ0ID0gKCMxKTtcXFxcZG9uZSA9ICgjMik7fVxcXFxkcmF3W3RoaWNrXSAoJChcXFxcc3RhcnQpICsgKC0xLjUsMCkkKSAtLSsrKDMsMCk7XFxcXGRyYXcgKFxcXFxzdGFydCkgLS0rICgwLC0wLjI1Y20pO1xcXFxkcmF3ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4KzBjbSxcXFxcZG9uZXkrMC4yNWNtKSQpLS0rKDAsLTAuMjUpO1xcXFxkcmF3W2RlY29yYXRpb249e2FzcGVjdD0wLjMsIHNlZ21lbnQgbGVuZ3RoPTMsIGFtcGxpdHVkZT0ybW0sY29pbCx9LGRlY29yYXRlXSAoXFxcXHN0YXJ0eCxcXFxcc3RhcnR5LTAuMjVjbSkgLS0oJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkrMC4yNWNtKSQpbm9kZVttaWR3YXkscmlnaHQ9MC4yNWNtLGJsYWNrXXsjNH07XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSkkKXsjM307fVwiXG4gICAgXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXG4gICAgXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXG4gICAgLy9jb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxuICAgIGNvbnN0IGR2ZWN0b3I9XCJcXFxcbmV3Y29tbWFuZHtcXFxcZHZlY3Rvcn1bMl17XFxcXGNvb3JkaW5hdGUgKHRlbXAxKSBhdCAoJCgwLDAgLXwgIzEpJCk7XFxcXGNvb3JkaW5hdGUgKHRlbXAyKSBhdCAoJCgwLDAgfC0gIzEpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MC43cHQsIzJdICgjMSktLSh0ZW1wMSkoIzEpLS0odGVtcDIpO31cIlxuICAgIFxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxuICAgIGNvbnN0IHByZWFtYmxlPVwiXFxcXHVzZXBhY2thZ2V7cGdmcGxvdHMsaWZ0aGVufVxcXFx1c2V0aWt6bGlicmFyeXthcnJvd3MubWV0YSxhbmdsZXMscXVvdGVzLHBvc2l0aW9uaW5nLCBjYWxjLCBpbnRlcnNlY3Rpb25zLGRlY29yYXRpb25zLm1hcmtpbmdzLG1hdGgsc3B5LG1hdHJpeCxwYXR0ZXJucyxzbmFrZXMsZGVjb3JhdGlvbnMucGF0aHJlcGxhY2luZyxkZWNvcmF0aW9ucy5wYXRobW9ycGhpbmcscGF0dGVybnMsc2hhZG93cyxzaGFwZXMuc3ltYm9sc31cIlxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcbn0iXX0=