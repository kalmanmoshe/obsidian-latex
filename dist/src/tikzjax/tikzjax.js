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
    quickAdd(mode, formatting, formattingForInterpretation) {
        this.mode = mode;
        this.formattingSpecificToMode();
        this.interpretFormatting(formattingForInterpretation || "", formatting || []);
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
    interpretFormatting(formattingString, formattingArr) {
        for (const [key, value] of Object.entries(formattingArr)) {
            if (typeof value === 'object') {
                //this.setProperty(key as keyof Formatting,formatting)
            }
            else if (value) {
                this.setProperty(key, value);
            }
        }
        const splitFormatting = formattingString.replace(/\s/g, "").match(/(?:{[^}]*}|[^,{}]+)+/g) || [];
        splitFormatting.forEach(formatting => {
            const match = formatting.match(/^([^=]+)={(.*)}$/);
            switch (true) {
                case !!match: {
                    if (match) {
                        const [_, parent, children] = match;
                        this.interpretFormatting(children, []);
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
        console.log(value, key);
        if (nestedKey) {
            if (!formattingObj[key] || typeof formattingObj[key] !== 'object') {
                formattingObj[key] = {};
            }
            formattingObj[key][nestedKey] = value;
        }
        else {
            formattingObj[key] = value;
        }
        console.log(formattingObj[key]);
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
    formatting = new Formatting();
    label;
    quadrant;
    constructor(mode, axis, original, coordinateName, formatting, label, quadrant) {
        if (mode !== undefined)
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
                return `node ${this.formatting?.toString()} {${this.label || ''}}`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUlqRCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUM3RSxJQUFJLENBQUMsV0FBVyxDQUFDLE1B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QUcsSUFBSTtnQkFBRSxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQztTQUNsQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTztRQUNILElBQUksRUFBQyxJQUFJLEVBQUMsSUFBSSxFQUFDLElBQUk7S0FDdEIsQ0FBQztBQUNGLENBQUM7QUFLRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBd0JFO0FBR0YsU0FBUyxXQUFXO0lBQ2hCLE1BQU0sR0FBRyxHQUFDLG9MQUFvTCxDQUFBO0lBRTlMLE1BQU0sSUFBSSxHQUFDLDZMQUE2TCxDQUFBO0lBRXhNLE1BQU0sR0FBRyxHQUFDLG9OQUFvTixDQUFBO0lBQzlOLE1BQU0sSUFBSSxHQUFDLHdSQUF3UixDQUFBO0lBQ25TLE1BQU0sTUFBTSxHQUFDLDBnQkFBMGdCLENBQUE7SUFFdmhCLE1BQU0sSUFBSSxHQUFDLGlLQUFpSyxDQUFBO0lBRTVLLE1BQU0sS0FBSyxHQUFDLDZXQUE2VyxDQUFBO0lBQ3pYLE1BQU0sSUFBSSxHQUFDLCtFQUErRSxDQUFBO0lBQzFGLGlHQUFpRztJQUNqRyxNQUFNLE9BQU8sR0FBQyxzS0FBc0ssQ0FBQTtJQUVwTCxNQUFNLE1BQU0sR0FBQyw4dkJBQTh2QixDQUFBO0lBQzN3QixNQUFNLFFBQVEsR0FBQyxtUEFBbVAsQ0FBQTtJQUNsUSxPQUFPLFFBQVEsR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsTUFBTSxHQUFDLElBQUksR0FBQyxLQUFLLEdBQUMsSUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsaUVBQWlFLENBQUE7QUFDN0ksQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcCwgTWFya2Rvd25WaWV3LCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCBNYXRoUGx1Z2luIGZyb20gXCJzcmMvbWFpblwiO1xuaW1wb3J0IHsgb3B0aW1pemUgfSBmcm9tIFwiLi9zdmdvLmJyb3dzZXIuanNcIjtcbi8vIEB0cy1pZ25vcmVcbmltcG9ydCB0aWt6amF4SnMgZnJvbSBcImlubGluZTouL3Rpa3pqYXguanNcIjtcbmltcG9ydCB7IGNhcnRlc2lhblRvUG9sYXIsIGZpbmRJbnRlcnNlY3Rpb25Qb2ludCwgZmluZFNsb3BlLCBwb2xhclRvQ2FydGVzaWFuLCB0b051bWJlciB9IGZyb20gXCJzcmMvbWF0aFV0aWxpdGllcy5qc1wiO1xuaW1wb3J0IHsgRGVidWdNb2RhbCB9IGZyb20gXCJzcmMvZGVzcGx5TW9kYWxzLmpzXCI7XG5cblxuXG5leHBvcnQgY2xhc3MgVGlrempheCB7XG4gICAgYXBwOiBBcHA7XG4gICAgcGx1Z2luOiBNYXRoUGx1Z2luO1xuICAgIGFjdGl2ZVZpZXc6IE1hcmtkb3duVmlldyB8IG51bGw7XG5cbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCxwbHVnaW46IE1hdGhQbHVnaW4pIHtcbiAgICAgIHRoaXMuYXBwPWFwcDtcbiAgICAgIHRoaXMuYWN0aXZlVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XG4gICAgICB0aGlzLnBsdWdpbj1wbHVnaW47XG4gICAgfVxuICAgIFxuICAgIHJlYWR5TGF5b3V0KCl7XG4gICAgICB0aGlzLnBsdWdpbi5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xuICAgICAgICB0aGlzLmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xuICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcIndpbmRvdy1vcGVuXCIsICh3aW4sIHdpbmRvdykgPT4ge1xuICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcbiAgICAgICAgfSkpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICBcbiAgICBsb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XG4gICAgICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xuICAgICAgICBzLmlkID0gXCJ0aWt6amF4XCI7XG4gICAgICAgIHMudHlwZSA9IFwidGV4dC9qYXZhc2NyaXB0XCI7XG4gICAgICAgIHMuaW5uZXJUZXh0ID0gdGlrempheEpzO1xuICAgICAgICBkb2MuYm9keS5hcHBlbmRDaGlsZChzKTtcbiAgICAgICAgZG9jLmFkZEV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XG4gICAgfVxuICBcbiAgICB1bmxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcbiAgICAgICAgY29uc3QgcyA9IGRvYy5nZXRFbGVtZW50QnlJZChcInRpa3pqYXhcIik7XG4gICAgICAgIHM/LnJlbW92ZSgpO1xuXG4gICAgICAgIGRvYy5yZW1vdmVFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xuICAgIH1cbiAgXG4gICAgbG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xuICAgICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuICBcbiAgICB1bmxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcbiAgICAgICAgICAgIHRoaXMudW5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuICBcbiAgICBnZXRBbGxXaW5kb3dzKCkge1xuICAgICAgICBjb25zdCB3aW5kb3dzID0gW107XG4gICAgICAgIFxuICAgICAgICAvLyBwdXNoIHRoZSBtYWluIHdpbmRvdydzIHJvb3Qgc3BsaXQgdG8gdGhlIGxpc3RcbiAgICAgICAgd2luZG93cy5wdXNoKHRoaXMuYXBwLndvcmtzcGFjZS5yb290U3BsaXQud2luKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEB0cy1pZ25vcmUgZmxvYXRpbmdTcGxpdCBpcyB1bmRvY3VtZW50ZWRcbiAgICAgICAgY29uc3QgZmxvYXRpbmdTcGxpdCA9IHRoaXMuYXBwLndvcmtzcGFjZS5mbG9hdGluZ1NwbGl0O1xuICAgICAgICBmbG9hdGluZ1NwbGl0LmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgYSB3aW5kb3csIHB1c2ggaXQgdG8gdGhlIGxpc3QgXG4gICAgICAgICAgICBpZiAoY2hpbGQgaW5zdGFuY2VvZiBXb3Jrc3BhY2VXaW5kb3cpIHtcbiAgICAgICAgICAgICAgICB3aW5kb3dzLnB1c2goY2hpbGQud2luKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHdpbmRvd3M7XG4gICAgfVxuICBcbiAgXG4gICAgcmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCkge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGVsLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxuICAgICAgICAgICAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XG4gICAgICAgICAgICBjb25zdCB0aWt6amF4PW5ldyBGb3JtYXRUaWt6amF4KHNvdXJjZSk7XG4gICAgICAgICAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCx0aWt6amF4LmRlYnVnSW5mbykub3BlbigpO1xuICAgICAgICAgICAgc2NyaXB0LnNldFRleHQodGlrempheC5nZXRDb2RlKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2goZSl7XG4gICAgICAgICAgICAgICAgZWwuaW5uZXJIVE1MID0gXCJcIjtcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvckRpc3BsYXkgPSBlbC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJtYXRoLWVycm9yLWxpbmVcIiB9KTtcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuaW5uZXJUZXh0ID0gYEVycm9yOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5jbGFzc0xpc3QuYWRkKFwiZXJyb3ItdGV4dFwiKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiVGlrWiBQcm9jZXNzaW5nIEVycm9yOlwiLCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgXG4gICAgICBhZGRTeW50YXhIaWdobGlnaHRpbmcoKSB7XG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLnB1c2goe25hbWU6IFwiVGlrelwiLCBtaW1lOiBcInRleHQveC1sYXRleFwiLCBtb2RlOiBcInN0ZXhcIn0pO1xuICAgICAgfVxuICBcbiAgICAgIHJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpIHtcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8gPSB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5maWx0ZXIoZWwgPT4gZWwubmFtZSAhPSBcIlRpa3pcIik7XG4gICAgICB9XG5cbiAgXG4gICAgICBjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcbiAgICAgICAgc3ZnID0gc3ZnLnJlcGxhY2VBbGwoLyhcIiMwMDBcInxcImJsYWNrXCIpL2csIFwiXFxcImN1cnJlbnRDb2xvclxcXCJcIilcbiAgICAgICAgICAgICAgICAucmVwbGFjZUFsbCgvKFwiI2ZmZlwifFwid2hpdGVcIikvZywgXCJcXFwidmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KVxcXCJcIik7XG4gICAgICAgIHJldHVybiBzdmc7XG4gICAgICB9XG4gIFxuICBcbiAgICAgIG9wdGltaXplU1ZHKHN2Zzogc3RyaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIG9wdGltaXplKHN2Zywge3BsdWdpbnM6XG4gICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInByZXNldC1kZWZhdWx0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJyaWRlczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW51cElEczogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICB9KT8uZGF0YTtcbiAgICAgIH1cbiAgXG4gIFxuICAgICAgcG9zdFByb2Nlc3NTdmcgPSAoZTogRXZlbnQpID0+IHtcbiAgXG4gICAgICAgICAgY29uc3Qgc3ZnRWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICBsZXQgc3ZnID0gc3ZnRWwub3V0ZXJIVE1MO1xuICBcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSkge1xuICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcbiAgICAgICAgICB9XG4gIFxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcbiAgXG4gICAgICAgICAgc3ZnRWwub3V0ZXJIVE1MID0gc3ZnO1xuICAgICAgfVxufVxuXG5mdW5jdGlvbiByZWdFeHAocGF0dGVybjogc3RyaW5nIHwgUmVnRXhwLCBmbGFnczogc3RyaW5nID0gJycpOiBSZWdFeHAge1xuICAgIHBhdHRlcm49cGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cD9wYXR0ZXJuLnNvdXJjZTpwYXR0ZXJuO1xuICAgIHJldHVybiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgJHtwYXR0ZXJufWAsIGZsYWdzP2ZsYWdzOicnKTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVnZXgoKXtcbiAgICBjb25zdCBiYXNpYyA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjpdYDtcbiAgICByZXR1cm4ge1xuICAgICAgICBiYXNpYzogYmFzaWMsXG4gICAgICAgIG1lcmdlOiBTdHJpbmcucmF3YFtcXCtcXC1cXHwhXFxkLl1gLFxuICAgICAgICAvL2Nvb3JkaW5hdGU6IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoJHtiYXNpY30rfDEpYCksXG4gICAgICAgIGNvb3JkaW5hdGVOYW1lOiBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWAsXG4gICAgICAgIHRleHQ6IFN0cmluZy5yYXdgW1xcd1xccy0sLjokKCEpXytcXFxce309XWAsXG4gICAgICAgIGZvcm1hdHRpbmc6IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOyYqW1xcXXt9JS08Pl1gXG4gICAgfTtcbn1cblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuaW50ZXJmYWNlIHRva2VuICB7XG4gICAgWD86IG51bWJlcjtcbiAgICBZPzogbnVtYmVyO1xuICAgIHR5cGU/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZXM/OiBhbnk7XG59XG5cblxuXG5cbmNvbnN0IHBhcnNlTnVtYmVyID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XG59O1xuXG5mdW5jdGlvbiBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+LCBpbmRleDogbnVtYmVyKTogeyBiZWZvcmU6IG51bWJlciwgYWZ0ZXI6IG51bWJlciB9IHtcbiAgICAgICBcbiAgICBjb25zdCBiZWZvcmVJbmRleCA9IGF4ZXMuc2xpY2UoMCxpbmRleCkuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcylcbiAgICBjb25zdCBhZnRlckluZGV4ID0gYXhlcy5maW5kSW5kZXgoKGF4aXM6IGFueSxpZHg6IG51bWJlcikgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMmJmlkeD5pbmRleCk7XG5cbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xIHx8IGFmdGVySW5kZXggPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgdmFsaWQgQXhpcyBvYmplY3RzLlwiKTtcbiAgICB9XG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSBhZnRlckluZGV4KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlByYWlzZWQgYXhpcyBhcyBzYW1lIHRva2VuXCIpO1xuICAgIH1cbiAgICByZXR1cm4geyBiZWZvcmU6IGJlZm9yZUluZGV4LCBhZnRlcjogYWZ0ZXJJbmRleCB9O1xufVxuXG5cbmV4cG9ydCBjbGFzcyBBeGlzIHtcbiAgICBjYXJ0ZXNpYW5YOiBudW1iZXI7XG4gICAgY2FydGVzaWFuWTogbnVtYmVyO1xuICAgIHBvbGFyQW5nbGU6IG51bWJlcjtcbiAgICBwb2xhckxlbmd0aDogbnVtYmVyO1xuICAgIG5hbWU/OiBzdHJpbmc7XG4gICAgdW5pdmVyc2FsKGNvb3JkaW5hdGU6IHN0cmluZywgdG9rZW5zPzogRm9ybWF0VGlrempheCxhbmNob3JBcnI/OiBhbnksYW5jaG9yPzogc3RyaW5nKTogQXhpcyB7XG4gICAgICAgIGNvbnN0IG1hdGNoZXM9dGhpcy5nZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlKTtcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZUFycjogQXJyYXk8QXhpc3xzdHJpbmc+ID0gW107XG4gICAgICAgIG1hdGNoZXMuZm9yRWFjaCgobWF0Y2g6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBtYXRjaD1tYXRjaC5mdWxsTWF0Y2g7XG4gICAgICAgICAgICBsZXQgYXhpczogQXhpc3x1bmRlZmluZWQ7XG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIC8sLy50ZXN0KG1hdGNoKTpcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkQ2FydGVzaWFuKG1hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIC86Ly50ZXN0KG1hdGNoKTpcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkUG9sYXIobWF0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLnBvbGFyVG9DYXJ0ZXNpYW4oKVxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgLyFbXFxkLl0rIS8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgKC9bXFxkXFx3XSsvKS50ZXN0KG1hdGNoKTpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VucylcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IHRva2Vucy5maW5kT3JpZ2luYWxWYWx1ZShtYXRjaCk/LmF4aXM7XG4gICAgICAgICAgICAgICAgZWxzZSB0aHJvdyBuZXcgRXJyb3IoYFRyaWVkIHRvIGZpbmQgb3JpZ2luYWwgY29vcmRpbmF0ZSB2YWx1ZSB3aGlsZSBub3QgYmVpbmcgcHJvdmlkZWQgd2l0aCB0b2tlbnNgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGF4aXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIHRoZSBjb29yZGluYXRlICR7bWF0Y2h9IGZyb20gJHtjb29yZGluYXRlfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubWVyZ2VBeGlzKGNvb3JkaW5hdGVBcnIpXG5cbiAgICAgICAgaWYoYW5jaG9yQXJyJiZhbmNob3ImJmFuY2hvci5tYXRjaCgvKC0tXFwrfC0tXFwrXFwrKS8pKXtcbiAgICAgICAgICAgIGxldCBhOiBBeGlzXG4gICAgICAgICAgICBpZiAoYW5jaG9yLm1hdGNoKC8oLS1cXCspLykpe1xuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmQoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmRMYXN0KChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYSxcImFkZGl0aW9uXCIpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgY29tcGxleENhcnRlc2lhbkFkZChheGlzOiBBeGlzLG1vZGU6IHN0cmluZyxtb2RpZmllcj86IGFueSl7XG4gICAgICAgIHN3aXRjaCAobW9kZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZGl0aW9uXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YKz1heGlzLmNhcnRlc2lhblg7XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZKz1heGlzLmNhcnRlc2lhblk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwic3VidHJhY3Rpb25cIjpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJyaWdodFByb2plY3Rpb25cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9YXhpcy5jYXJ0ZXNpYW5YXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiaW50ZXJuYWxQb2ludFwiOlxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD0odGhpcy5jYXJ0ZXNpYW5YK2F4aXMuY2FydGVzaWFuWCkqbW9kaWZpZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZPSh0aGlzLmNhcnRlc2lhblkrYXhpcy5jYXJ0ZXNpYW5ZKSptb2RpZmllcjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKClcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9O1xuXG5cbiAgICBnZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlOiBzdHJpbmcpe1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm4gPSBnZXRSZWdleCgpO1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW1xuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLmJhc2ljfSspYCwgXCJnXCIpLFxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLm1lcmdlfSspYCwgXCJnXCIpXG4gICAgICAgIF07XG4gICAgICAgIFxuICAgICAgICAvLyBTdGVwIDE6IEV4dHJhY3QgbWF0Y2hlcyBmb3IgZWFjaCBwYXR0ZXJuIHNlcGFyYXRlbHlcbiAgICAgICAgY29uc3QgYmFzaWNNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMF0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLnJlcGxhY2UoLy0kL2csIFwiXCIpLCAvLyBSZW1vdmUgdHJhaWxpbmcgaHlwaGVuIG9ubHlcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGhcbiAgICAgICAgfSkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgbWVyZ2VNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMV0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLFxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxuICAgICAgICB9KSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXRjaGVzOiBBcnJheTx7IGZ1bGxNYXRjaDogc3RyaW5nLCBpbmRleDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciB9PiA9IFtdO1xuXG4gICAgICAgIGZ1bmN0aW9uIGlzT3ZlcmxhcHBpbmcobWF0Y2gxOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0sIG1hdGNoMjogeyBpbmRleDogbnVtYmVyOyBsZW5ndGg6IG51bWJlciB9KSB7XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2gxLmluZGV4IDwgbWF0Y2gyLmluZGV4ICsgbWF0Y2gyLmxlbmd0aCAmJiBtYXRjaDIuaW5kZXggPCBtYXRjaDEuaW5kZXggKyBtYXRjaDEubGVuZ3RoO1xuICAgICAgICB9XG5cbiAgICAgICAgWy4uLmJhc2ljTWF0Y2hlcywgLi4ubWVyZ2VNYXRjaGVzXS5mb3JFYWNoKG1hdGNoID0+IHtcbiAgICAgICAgICAgIGNvbnN0IG92ZXJsYXBwaW5nSW5kZXggPSBtYXRjaGVzLmZpbmRJbmRleChleGlzdGluZ01hdGNoID0+IGlzT3ZlcmxhcHBpbmcoZXhpc3RpbmdNYXRjaCwgbWF0Y2gpKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKG92ZXJsYXBwaW5nSW5kZXggIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdNYXRjaCA9IG1hdGNoZXNbb3ZlcmxhcHBpbmdJbmRleF07XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIGN1cnJlbnQgbWF0Y2ggY292ZXJzIGEgbGFyZ2VyIHJhbmdlLCByZXBsYWNlIHRoZSBleGlzdGluZyBvbmVcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gubGVuZ3RoID4gZXhpc3RpbmdNYXRjaC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XSA9IG1hdGNoO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKG1hdGNoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICAvLyBTdGVwIDM6IFNvcnQgdGhlIGZpbmFsIG1hdGNoZXMgYnkgaW5kZXhcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XG4gICAgICAgIFxuICAgICAgICAvLyBTdGVwIDQ6IFZhbGlkYXRlIHRoZSByZXN1bHRcbiAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb29yZGluYXRlIGlzIG5vdCB2YWxpZDsgZXhwZWN0ZWQgYSB2YWxpZCBjb29yZGluYXRlLlwiKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIG1hdGNoZXM7XG4gICAgICAgIFxuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyKSB7XG4gICAgICAgIGlmIChjYXJ0ZXNpYW5YICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWCA9IGNhcnRlc2lhblg7XG4gICAgICAgIGlmIChjYXJ0ZXNpYW5ZICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWSA9IGNhcnRlc2lhblk7XG4gICAgICAgIGlmIChwb2xhckxlbmd0aCAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyTGVuZ3RoID0gcG9sYXJMZW5ndGg7XG4gICAgICAgIGlmIChwb2xhckFuZ2xlICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJBbmdsZSA9IHBvbGFyQW5nbGU7XG4gICAgfVxuXG4gICAgY2xvbmUoKTogQXhpcyB7XG4gICAgICAgIHJldHVybiBuZXcgQXhpcyh0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSx0aGlzLnBvbGFyTGVuZ3RoLHRoaXMucG9sYXJBbmdsZSk7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIG1lcmdlQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPikge1xuICAgICAgICBpZiAoIWF4ZXMuc29tZSgoYXhpczogYW55KSA9PiB0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIikpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBheGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXhlc1tpXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudCAhPT0gXCJzdHJpbmdcIikgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBzaWRlcyA9IGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlcywgaSk7XG4gICAgICAgICAgICBjb25zdCBiZWZvcmVBeGlzID0gYXhlc1tzaWRlcy5iZWZvcmVdIGFzIEF4aXM7XG4gICAgICAgICAgICBjb25zdCBhZnRlckF4aXMgPSBheGVzW3NpZGVzLmFmdGVyXSBhcyBBeGlzO1xuXG4gICAgICAgICAgICBsZXQgIG1hdGNoID0gY3VycmVudC5tYXRjaCgvXlxcKyQvKTtcbiAgICAgICAgICAgIGxldCBtb2RlLG1vZGlmaWVycztcbiAgICAgICAgICAgIGlmIChtYXRjaCl7XG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiYWRkaXRpb25cIlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXi1cXHwkLylcbiAgICAgICAgICAgIGlmKCFtb2RlJiZtYXRjaCl7XG4gICAgICAgICAgICAgICAgbW9kZSA9IFwicmlnaHRQcm9qZWN0aW9uXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL15cXCEoW1xcZC5dKylcXCEkLylcbiAgICAgICAgICAgIGlmKCFtb2RlJiZtYXRjaCl7XG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiaW50ZXJuYWxQb2ludFwiXG4gICAgICAgICAgICAgICAgbW9kaWZpZXJzPXRvTnVtYmVyKG1hdGNoWzFdKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihtb2RlKXtcbiAgICAgICAgICAgICAgICBheGVzLnNwbGljZShzaWRlcy5iZWZvcmUsIHNpZGVzLmFmdGVyIC0gc2lkZXMuYmVmb3JlICsgMSwgYmVmb3JlQXhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGFmdGVyQXhpcyxtb2RlLG1vZGlmaWVycykpO1xuICAgICAgICAgICAgICAgIGkgPSBzaWRlcy5iZWZvcmU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChheGVzLmxlbmd0aCA9PT0gMSAmJiBheGVzWzBdIGluc3RhbmNlb2YgQXhpcykge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCAoYXhlc1swXSBhcyBBeGlzKS5jbG9uZSgpKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBcblxuICAgIHByb2plY3Rpb24oYXhpczE6IEF4aXN8dW5kZWZpbmVkLGF4aXMyOiBBeGlzfHVuZGVmaW5lZCk6YW55e1xuICAgICAgICBpZiAoIWF4aXMxfHwhYXhpczIpe3Rocm93IG5ldyBFcnJvcihcImF4aXMncyB3ZXJlIHVuZGVmaW5lZCBhdCBwcm9qZWN0aW9uXCIpO31cbiAgICAgICAgcmV0dXJuIFt7WDogYXhpczEuY2FydGVzaWFuWCxZOiBheGlzMi5jYXJ0ZXNpYW5ZfSx7WDogYXhpczIuY2FydGVzaWFuWCxZOiBheGlzMS5jYXJ0ZXNpYW5ZfV1cbiAgICB9XG4gICAgY29tYmluZShjb29yZGluYXRlQXJyOiBhbnkpe1xuICAgICAgICBsZXQgeD0wLHk9MDtcbiAgICAgICAgY29vcmRpbmF0ZUFyci5mb3JFYWNoKChjb29yZGluYXRlOiBBeGlzKT0+e1xuICAgICAgICAgICAgeCs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgeSs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5ZO1xuICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPXg7dGhpcy5jYXJ0ZXNpYW5ZPXk7XG4gICAgfVxuICAgIGFkZENhcnRlc2lhbih4OiBzdHJpbmcgfCBudW1iZXIsIHk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgXG4gICAgICAgIGlmICgheSAmJiB0eXBlb2YgeCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgW3gsIHldID0geC5zcGxpdChcIixcIikubWFwKE51bWJlcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCB8fCB5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgQ2FydGVzaWFuIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhcnRlc2lhblggPSB4IGFzIG51bWJlcjtcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZID0geSBhcyBudW1iZXI7XG4gICAgfVxuICAgIFxuICAgIHBvbGFyVG9DYXJ0ZXNpYW4oKXtcbiAgICAgICAgY29uc3QgdGVtcD1wb2xhclRvQ2FydGVzaWFuKHRoaXMucG9sYXJBbmdsZSwgdGhpcy5wb2xhckxlbmd0aClcbiAgICAgICAgdGhpcy5hZGRDYXJ0ZXNpYW4odGVtcC5YLHRlbXAuWSlcbiAgICB9XG5cbiAgICBjYXJ0ZXNpYW5Ub1BvbGFyKCl7XG4gICAgICAgIGNvbnN0IHRlbXA9Y2FydGVzaWFuVG9Qb2xhcih0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSlcbiAgICAgICAgdGhpcy5hZGRQb2xhcih0ZW1wLmFuZ2xlLHRlbXAubGVuZ3RoKVxuICAgIH1cblxuICAgIGFkZFBvbGFyKGFuZ2xlOiBzdHJpbmcgfCBudW1iZXIsIGxlbmd0aD86IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAoIWxlbmd0aCAmJiB0eXBlb2YgYW5nbGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIFthbmdsZSwgbGVuZ3RoXSA9IGFuZ2xlLnNwbGl0KFwiOlwiKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYW5nbGUgPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBwb2xhciBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wb2xhckFuZ2xlID0gYW5nbGUgYXMgbnVtYmVyO1xuICAgICAgICB0aGlzLnBvbGFyTGVuZ3RoID0gbGVuZ3RoIGFzIG51bWJlcjtcbiAgICB9XG5cbiAgICB0b1N0cmluZygpe1xuICAgICAgICByZXR1cm4gdGhpcy5jYXJ0ZXNpYW5YK1wiLFwiK3RoaXMuY2FydGVzaWFuWTtcbiAgICB9XG5cbiAgICBpbnRlcnNlY3Rpb24oY29vcmQ6IHN0cmluZywgZmluZE9yaWdpbmFsVmFsdWU6IChjb29yZDogc3RyaW5nKSA9PiBDb29yZGluYXRlIHwgdW5kZWZpbmVkKToge1g6bnVtYmVyLFk6bnVtYmVyfSB7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvKFxccyphbmRcXHM/fC0tKS9nLCBcIiBcIilcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcbiAgICAgICAgICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpXG4gICAgICAgICAgICAuZmlsdGVyKCh0b2tlbik6IHRva2VuIGlzIENvb3JkaW5hdGUgPT4gdG9rZW4gIT09IHVuZGVmaW5lZCk7XG5cbiAgICAgICAgaWYgKG9yaWdpbmFsQ29vcmRzLmxlbmd0aCA8IDQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludGVyc2VjdGlvbiBoYWQgdW5kZWZpbmVkIGNvb3JkaW5hdGVzIG9yIGluc3VmZmljaWVudCBkYXRhLlwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHNsb3BlcyA9IFtcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1swXS5heGlzLCBvcmlnaW5hbENvb3Jkc1sxXS5heGlzKSxcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1syXS5heGlzLCBvcmlnaW5hbENvb3Jkc1szXS5heGlzKSxcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMsIG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMsIHNsb3Blc1swXSwgc2xvcGVzWzFdKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNvdm9ydCh2YWx1ZTogbnVtYmVyLGNvbnZyc2luOiBzdHJpbmcpe1xuXG59XG5cblxuZnVuY3Rpb24gbWF0Y2hLZXlXaXRoVmFsdWUoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHZhbHVlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICBcImFuY2hvclwiOiBcImFuY2hvcj1cIixcbiAgICAgICAgXCJyb3RhdGVcIjogXCJyb3RhdGU9XCIsXG4gICAgICAgIFwibGluZVdpZHRoXCI6IFwibGluZSB3aWR0aD1cIixcbiAgICAgICAgXCJmaWxsXCI6IFwiZmlsbD1cIixcbiAgICAgICAgXCJmaWxsT3BhY2l0eVwiOiBcImZpbGwgb3BhY2l0eT1cIixcbiAgICAgICAgXCJ0ZXh0Q29sb3JcIjogXCJ0ZXh0IGNvbG9yPVwiLFxuICAgICAgICBcImRyYXdcIjogXCJkcmF3PVwiLFxuICAgICAgICBcInRleHRcIjogXCJ0ZXh0PVwiLFxuICAgICAgICBcInBvc1wiOiBcInBvcz1cIixcbiAgICAgICAgXCJzY2FsZVwiOiBcInNjYWxlPVwiLFxuICAgICAgICBcImRlY29yYXRlXCI6IFwiZGVjb3JhdGVcIixcbiAgICAgICAgXCJzbG9wZWRcIjogXCJzbG9wZWRcIixcbiAgICAgICAgXCJkZWNvcmF0aW9uXCI6IFwiZGVjb3JhdGlvbj1cIixcbiAgICAgICAgXCJkZWNvcmF0aW9uLmJyYWNlXCI6IFwiYnJhY2VcIixcbiAgICAgICAgXCJkZWNvcmF0aW9uLmFtcGxpdHVkZVwiOiBcImFtcGxpdHVkZT1cIlxuICAgIH07XG5cbiAgICByZXR1cm4gdmFsdWVNYXBba2V5XSB8fCAnJztcbn1cblxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XG4gICAgXG4gICAgc2NhbGU6IG51bWJlcjtcbiAgICByb3RhdGU/OiBudW1iZXI7XG4gICAgbGluZVdpZHRoPzogbnVtYmVyO1xuICAgIGZpbGxPcGFjaXR5PzogbnVtYmVyO1xuICAgIHBvcz86IG51bWJlcjtcblxuICAgIG1vZGU6IHN0cmluZztcbiAgICBhbmNob3I/OiBzdHJpbmc7XG4gICAgd2lkdGg/OiBzdHJpbmc7XG4gICAgY29sb3I/OiBzdHJpbmc7XG4gICAgdGV4dENvbG9yPzogc3RyaW5nO1xuICAgIGZpbGw/OiBzdHJpbmc7XG4gICAgYXJyb3c/OiBzdHJpbmc7XG4gICAgZHJhdz86IHN0cmluZztcbiAgICB0ZXh0Pzogc3RyaW5nO1xuICAgIHBhdGhBdHRyaWJ1dGU/OiBzdHJpbmc7XG4gICAgdGlrenNldD86IHN0cmluZztcbiAgICBwb3NpdGlvbj86IHN0cmluZztcbiAgICBsaW5lU3R5bGU/OiBzdHJpbmc7XG4gICAgXG4gICAgc2xvcGVkPzogYm9vbGVhbjtcbiAgICBkZWNvcmF0ZT86IGJvb2xlYW47XG5cbiAgICBkZWNvcmF0aW9uPzoge2JyYWNlPzogYm9vbGVhbixjb2lsOiBib29sZWFuLGFtcGxpdHVkZT86IG51bWJlcixhc3BlY3Q6IG51bWJlcixzZWdtZW50TGVuZ3RoOm51bWJlcn07XG4gICAgXG5cbiAgICBxdWlja0FkZChtb2RlOiBzdHJpbmcsZm9ybWF0dGluZzogYW55LGZvcm1hdHRpbmdGb3JJbnRlcnByZXRhdGlvbj86c3RyaW5nICl7XG4gICAgICAgIHRoaXMubW9kZT1tb2RlO1xuICAgICAgICB0aGlzLmZvcm1hdHRpbmdTcGVjaWZpY1RvTW9kZSgpO1xuICAgICAgICB0aGlzLmludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZ0ZvckludGVycHJldGF0aW9ufHxcIlwiLGZvcm1hdHRpbmd8fFtdKVxuXG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGZvcm1hdHRpbmdTcGVjaWZpY1RvTW9kZSgpe1xuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xuICAgICAgICAgICAgY2FzZSBcIm5vZGUtbWFzc1wiOlxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD1cInllbGxvdyE2MFwiO1xuICAgICAgICAgICAgICAgIHRoaXMucGF0aEF0dHJpYnV0ZT1cImRyYXdcIjtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWRkU3Bsb3BBbmRQb3NpdGlvbihhcnI6IGFueSxpbmRleDogbnVtYmVyKXtcbiAgICAgICAgY29uc3QgYmVmb3JlQWZ0ZXI9ZmluZEJlZm9yZUFmdGVyQXhpcyhhcnIsaW5kZXgpO1xuICAgICAgICBjb25zdCBbYmVmb3JlLCBhZnRlcl09W2FycltiZWZvcmVBZnRlci5iZWZvcmVdLGFycltiZWZvcmVBZnRlci5hZnRlcl1dXG4gICAgICAgIGlmICh0aGlzLnBvc2l0aW9ufHx0aGlzLnNsb3BlZCl7cmV0dXJufVxuICAgIFxuICAgICAgICBjb25zdCBlZGdlMSA9IGJlZm9yZS5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcbiAgICAgICAgY29uc3QgZWRnZTIgPSBhZnRlci5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcbiAgICAgICAgY29uc3Qgc2xvcGU9ZmluZFNsb3BlKGVkZ2UxLGVkZ2UyKVxuXG4gICAgICAgIHRoaXMuc2xvcGVkID0gc2xvcGUgIT09IDA7XG5cbiAgICAgICAgbGV0IHF1YWRyYW50XG4gICAgICAgIGlmIChlZGdlMSE9PWVkZ2UyKXF1YWRyYW50PWVkZ2UxK2VkZ2UyO1xuICAgICAgICBlbHNlIHF1YWRyYW50PWVkZ2UxO1xuXG4gICAgICAgIGlmIChzbG9wZSE9PUluZmluaXR5JiZzbG9wZSE9PS1JbmZpbml0eSl7XG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uID0gcXVhZHJhbnQucmVwbGFjZSgvKDN8NCkvLFwiYmVsb3dcIikucmVwbGFjZSgvKDF8NCkvLFwiYWJvdmVcIilcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5zbG9wZWQpe1xuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbis9cXVhZHJhbnQucmVwbGFjZSgvKDJ8MykvLFwicmlnaHRcIikucmVwbGFjZSgvKDF8NCkvLFwibGVmdFwiKVxuICAgICAgICB9XG4gICAgICAgIC8vIFJlbW92ZSB1bnVzZWQgcXVhZHJhbnRzLiBhbmQgQWRkIHNwYWNlIGlmIHR3byB3b3Jkc1xuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbj8ucmVwbGFjZSgvW1xcZF0rL2csXCJcIikucmVwbGFjZSgvKGJlbG93fGFib3ZlKShyaWdodHxyaWdodCkvLFwiJDEgJDJcIik7XG4gICAgfVxuXG4gICAgaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nOiBzdHJpbmcsZm9ybWF0dGluZ0FycjogYW55KXtcblxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhmb3JtYXR0aW5nQXJyKSkge1xuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jyl7XG4gICAgICAgICAgICAgICAgLy90aGlzLnNldFByb3BlcnR5KGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nLGZvcm1hdHRpbmcpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0UHJvcGVydHkoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcsdmFsdWUpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc3BsaXRGb3JtYXR0aW5nPWZvcm1hdHRpbmdTdHJpbmcucmVwbGFjZSgvXFxzL2csXCJcIikubWF0Y2goLyg/OntbXn1dKn18W14se31dKykrL2cpIHx8IFtdO1xuXG4gICAgICAgIHNwbGl0Rm9ybWF0dGluZy5mb3JFYWNoKGZvcm1hdHRpbmcgPT4ge1xuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBmb3JtYXR0aW5nLm1hdGNoKC9eKFtePV0rKT17KC4qKX0kLyk7XG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgICAgICBjYXNlICEhbWF0Y2g6IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0ICBbXyxwYXJlbnQsIGNoaWxkcmVuXT1tYXRjaDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuaW50ZXJwcmV0Rm9ybWF0dGluZyhjaGlsZHJlbixbXSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSBmb3JtYXR0aW5nLmluY2x1ZGVzKFwibGluZXdpZHRoXCIpOiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJsaW5lV2lkdGhcIixmb3JtYXR0aW5nKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSBmb3JtYXR0aW5nLmluY2x1ZGVzKFwiZmlsbD1cIik6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImZpbGxcIixmb3JtYXR0aW5nKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15maWxsb3BhY2l0eS8pOiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJmaWxsT3BhY2l0eVwiLGZvcm1hdHRpbmcpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXigtPnw8LXwtKntTdGVhbHRofS0qKSQvKToge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFycm93ID0gZm9ybWF0dGluZ1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL14oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCl7MSwyfSQvKToge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvc2l0aW9uPWZvcm1hdHRpbmcucmVwbGFjZSgvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLyxcIiQxIFwiKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15wb3M9Lyk6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcInBvc1wiLGZvcm1hdHRpbmcpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXmRyYXc9Lyk6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRyYXdcIixmb3JtYXR0aW5nKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15kZWNvcmF0ZSQvKToge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmRlY29yYXRlPXRydWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXnRleHQ9Lyk6IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcInRleHRcIixmb3JtYXR0aW5nKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15icmFjZSQvKToge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwiZGVjb3JhdGlvblwiLHRydWUsXCJicmFjZVwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJkZWNvcmF0aW9uXCJdPiwpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15hbXBsaXR1ZGUvKTpcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRlY29yYXRpb25cIixmb3JtYXR0aW5nLFwiYW1wbGl0dWRlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+LClcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15kcmF3JC8pOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhdGhBdHRyaWJ1dGUgPSBmb3JtYXR0aW5nO2JyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eaGVscGxpbmVzJC8pOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLnRpa3pzZXQgPSBmb3JtYXR0aW5nLnJlcGxhY2UoL2hlbHBsaW5lcy9nLFwiaGVscCBsaW5lc1wiKTticmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxkLl0rKXsxLDV9JC8pOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvbG9yPWZvcm1hdHRpbmc7YnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL14oZG90dGVkfGRhc2hlZHxzbW9vdGh8ZGVuc2VseXxsb29zZWx5KXsxLDJ9JC8pOlxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpbmVTdHlsZT1mb3JtYXR0aW5nLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLyxcIiQxIFwiKTticmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgc3BsaXQ8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxuICAgICAgICBrZXk6IEssXG4gICAgICAgIGZvcm1hdHRpbmc6IGFueSxcbiAgICAgICAgbmVzdGVkS2V5PzogTktcbiAgICApOiB2b2lkIHtcbiAgICAgICAgbGV0IHZhbHVlO1xuICAgICAgICBpZih0eXBlb2YgZm9ybWF0dGluZyE9PVwiYm9vbGVhblwiKXtcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IGZvcm1hdHRpbmcuc3BsaXQoXCI9XCIpO1xuICAgIFxuICAgICAgICAgICAgLy8gRW5zdXJlIHRoZSBmb3JtYXR0aW5nIHN0cmluZyBpcyB2YWxpZFxuICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA8IDIgfHwgIW1hdGNoWzFdKSByZXR1cm47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFRyaW0gYW55IHBvdGVudGlhbCB3aGl0ZXNwYWNlIGFyb3VuZCB0aGUgdmFsdWVcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHZhbHVlIGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nXG4gICAgICAgICAgICB2YWx1ZSA9ICFpc05hTihwYXJzZUZsb2F0KHJhd1ZhbHVlKSkgJiYgaXNGaW5pdGUoK3Jhd1ZhbHVlKVxuICAgICAgICAgICAgICAgID8gcGFyc2VGbG9hdChyYXdWYWx1ZSlcbiAgICAgICAgICAgICAgICA6IHJhd1ZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2V7XG4gICAgICAgICAgICB2YWx1ZT1mb3JtYXR0aW5nXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMuc2V0UHJvcGVydHkoa2V5LCB2YWx1ZSwgbmVzdGVkS2V5KTtcbiAgICB9XG4gICAgXG4gICAgc2V0UHJvcGVydHk8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxuICAgICAgICBrZXk6IEssXG4gICAgICAgIHZhbHVlOiBhbnksXG4gICAgICAgIG5lc3RlZEtleT86IE5LXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRpbmdPYmogPSB0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XG4gICAgICAgIGNvbnNvbGUubG9nKHZhbHVlLGtleSlcbiAgICAgICAgaWYgKG5lc3RlZEtleSkge1xuICAgICAgICAgICAgaWYgKCFmb3JtYXR0aW5nT2JqW2tleV0gfHwgdHlwZW9mIGZvcm1hdHRpbmdPYmpba2V5XSAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV0gPSB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XVtuZXN0ZWRLZXldID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZyhmb3JtYXR0aW5nT2JqW2tleV0pXG4gICAgfVxuICAgIFxuICAgIFxuICAgIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICAgIGxldCBzdHJpbmc9J1snO1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh0aGlzKSkge1xuICAgICAgICAgICAgaWYgKGtleT09PVwibW9kZVwiKXtjb250aW51ZTt9XG4gICAgICAgICAgICBpZih0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKXtcbiAgICAgICAgICAgICAgICBzdHJpbmcrPXRoaXMuaGFuZGxlT2JqZWN0VG9TdHJpbmcodmFsdWUsa2V5KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW1hdGNoS2V5V2l0aFZhbHVlKGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nKSsodHlwZW9mIHZhbHVlPT09XCJib29sZWFuXCI/Jyc6dmFsdWUpKycsJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5nK1wiXVwiO1xuICAgIH1cblxuICAgIGhhbmRsZU9iamVjdFRvU3RyaW5nKG9iajogb2JqZWN0LCBwYXJlbnRLZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIENvb3JkaW5hdGUge1xuICAgIG1vZGU6IHN0cmluZztcbiAgICBheGlzOiBBeGlzO1xuICAgIG9yaWdpbmFsPzogc3RyaW5nO1xuICAgIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nO1xuICAgIGZvcm1hdHRpbmcgPSBuZXcgRm9ybWF0dGluZygpO1xuICAgIGxhYmVsPzogc3RyaW5nO1xuICAgIHF1YWRyYW50PzogbnVtYmVyO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICBtb2RlPzogc3RyaW5nLFxuICAgICAgICBheGlzPzogQXhpcyxcbiAgICAgICAgb3JpZ2luYWw/OiBzdHJpbmcsXG4gICAgICAgIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nLFxuICAgICAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxcbiAgICAgICAgbGFiZWw/OiBzdHJpbmcsXG4gICAgICAgIHF1YWRyYW50PzogbnVtYmVyXG4gICAgKSB7XG5cbiAgICAgICAgaWYgKG1vZGUgIT09IHVuZGVmaW5lZCkgdGhpcy5tb2RlID0gbW9kZTtcbiAgICAgICAgaWYgKGF4aXMgIT09IHVuZGVmaW5lZCkgdGhpcy5heGlzID0gYXhpcztcbiAgICAgICAgdGhpcy5vcmlnaW5hbCA9IG9yaWdpbmFsO1xuICAgICAgICB0aGlzLmNvb3JkaW5hdGVOYW1lID0gY29vcmRpbmF0ZU5hbWU7XG4gICAgICAgIGlmIChmb3JtYXR0aW5nICE9PSB1bmRlZmluZWQpIHRoaXMuZm9ybWF0dGluZyA9IGZvcm1hdHRpbmc7XG4gICAgICAgIHRoaXMubGFiZWwgPSBsYWJlbDtcbiAgICAgICAgdGhpcy5xdWFkcmFudCA9IHF1YWRyYW50O1xuICAgIH1cbiAgICBjbG9uZSgpOiBDb29yZGluYXRlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb29yZGluYXRlKFxuICAgICAgICAgICAgdGhpcy5tb2RlLFxuICAgICAgICAgICAgdGhpcy5heGlzLmNsb25lKCksXG4gICAgICAgICAgICB0aGlzLm9yaWdpbmFsLFxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSxcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZyxcbiAgICAgICAgICAgIHRoaXMubGFiZWwsXG4gICAgICAgICAgICB0aGlzLnF1YWRyYW50XG4gICAgICAgICk7XG4gICAgfVxuICAgIGFkZEF4aXMoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIpe1xuICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoY2FydGVzaWFuWCwgY2FydGVzaWFuWSwgcG9sYXJMZW5ndGgsIHBvbGFyQW5nbGUpO1xuICAgIH1cbiAgICBhZGRJbmZvKG1hdGNoOiB7b3JpZ2luYWw/OiBzdHJpbmcsY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmcsbGFiZWw/OiBzdHJpbmcsZm9ybWF0dGluZz86IHN0cmluZ30sIG1vZGU6IHN0cmluZyx0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGZvcm1hdHRpbmc/OiBvYmplY3QpIHtcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XG4gICAgICAgIChbe29yaWdpbmFsOiB0aGlzLm9yaWdpbmFsLGNvb3JkaW5hdGVOYW1lOiB0aGlzLmNvb3JkaW5hdGVOYW1lLGxhYmVsOiB0aGlzLmxhYmVsfV09W21hdGNoXSlcblxuICAgICAgICBpZih0aGlzLm9yaWdpbmFsKXtcbiAgICAgICAgICAgIHRoaXMuYXhpcz1uZXcgQXhpcygpLnVuaXZlcnNhbCh0aGlzLm9yaWdpbmFsLHRva2Vucyk7XG4gICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZz1uZXcgRm9ybWF0dGluZygpO1xuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nLnF1aWNrQWRkKHRoaXMubW9kZSxmb3JtYXR0aW5nLG1hdGNoLmZvcm1hdHRpbmcpO1xuICAgICAgICBcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XG4gICAgICAgICAgICBjYXNlIFwiY29vcmRpbmF0ZVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBgXFxcXGNvb3J7JHt0aGlzLmF4aXMudG9TdHJpbmcoKX19eyR7dGhpcy5jb29yZGluYXRlTmFtZSB8fCBcIlwifX17JHt0aGlzLmxhYmVsIHx8IFwiXCJ9fXt9YDtcbiAgICAgICAgICAgIGNhc2UgXCJub2RlXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICBjYXNlIFwibm9kZS1pbmxpbmVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gYG5vZGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCl9IHske3RoaXMubGFiZWx8fCcnfX1gXG4gICAgICAgICAgICBjYXNlIFwibm9kZS1tYXNzXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBcXFxcbm9kZSAke3RoaXMuY29vcmRpbmF0ZU5hbWU/JygnK3RoaXMuY29vcmRpbmF0ZU5hbWUrJyknOicnfSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSB7JHt0aGlzLmxhYmVsfX07YFxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIG1vZGUgYXQgdG8gc3RyaW5nIGNvb3JkaW5hdGVcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgfVxuXG4gICAgYWRkUXVhZHJhbnQobWlkUG9pbnQ6IEF4aXMpIHtcbiAgICAgICAgY29uc3QgeERpcmVjdGlvbiA9IHRoaXMuYXhpcy5jYXJ0ZXNpYW5YID4gbWlkUG9pbnQuY2FydGVzaWFuWCA/IDEgOiAtMTtcbiAgICAgICAgY29uc3QgeURpcmVjdGlvbiA9IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZID4gbWlkUG9pbnQuY2FydGVzaWFuWSA/IDEgOiAtMTtcbiAgICAgICAgdGhpcy5xdWFkcmFudCA9IHlEaXJlY3Rpb24gPT09IDEgPyAoeERpcmVjdGlvbiA9PT0gMSA/IDEgOiAyKSA6ICh4RGlyZWN0aW9uID09PSAxID8gNCA6IDMpO1xuICAgIH1cbn1cblxudHlwZSBUb2tlbiA9QXhpcyB8IENvb3JkaW5hdGUgfERyYXd8Rm9ybWF0dGluZ3wgc3RyaW5nO1xuXG5leHBvcnQgY2xhc3MgRHJhdyB7XG4gICAgbW9kZT86IHN0cmluZ1xuICAgIGZvcm1hdHRpbmc6IEZvcm1hdHRpbmc9bmV3IEZvcm1hdHRpbmcoKTtcbiAgICBjb29yZGluYXRlczogQXJyYXk8VG9rZW4+O1xuXG4gICAgY29uc3RydWN0b3IobWF0Y2g6IHtmb3JtYXR0aW5nOiBzdHJpbmd8YW55LGRyYXc6IHN0cmluZ3xhbnl9LCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LG1vZGU/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XG4gICAgICAgIHRoaXMubW9kZT1gZHJhdyR7bW9kZT9cIi1cIittb2RlOlwiXCJ9YDtcbiAgICAgICAgaWYgKHR5cGVvZiBtYXRjaC5mb3JtYXR0aW5nID09PVwic3RyaW5nXCIpe1xuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nLnF1aWNrQWRkKGBkcmF3YCx7fSxtYXRjaC5mb3JtYXR0aW5nKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZy5xdWlja0FkZChgZHJhd2AsbWF0Y2guZm9ybWF0dGluZywnJyk7XG5cbiAgICAgICAgaWYodHlwZW9mIG1hdGNoLmRyYXc9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXMgPSB0aGlzLmZpbGxDb29yZGluYXRlcyh0aGlzLmdldFNjaGVtYXRpYyhtYXRjaC5kcmF3KSwgdG9rZW5zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNle1xuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcz10aGlzLmNyZWF0ZUZyb21BcnJheShtYXRjaC5kcmF3KVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgY3JlYXRlRnJvbUFycmF5KGFycjogYW55KXtcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpPTA7aTxhcnIubGVuZ3RoO2krKyl7XG4gICAgICAgICAgICBpZiAoYXJyW2ldIGluc3RhbmNlb2YgQXhpc3x8YXJyW2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSl7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmKHR5cGVvZiBhcnI9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBjb29yZGluYXRlc0FycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoY29vcmRpbmF0ZXNBcnJheVtpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcbiAgICAgICAgICAgICAgICBsZXQgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB3aGlsZSAoaSA8IGNvb3JkaW5hdGVzQXJyYXkubGVuZ3RoICYmICFmb3VuZCkge1xuICAgICAgICAgICAgICAgICAgICBpKys7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZXNBcnJheVtpXSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVzQXJyYXlbaV0gaW5zdGFuY2VvZiBDb29yZGluYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaS0tOyBcbiAgICAgICAgICAgICAgICBpZiAoZm91bmQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKCctLScpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZXNBcnJheTtcbiAgICB9XG5cbiAgICBmaWxsQ29vcmRpbmF0ZXMoc2NoZW1hdGljOiBhbnlbXSwgdG9rZW5zPzogRm9ybWF0VGlrempheCkge1xuICAgICAgICBjb25zdCBjb29yQXJyOiBBcnJheTxUb2tlbj49W107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NoZW1hdGljLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XG4gICAgICAgICAgICAgICAgbGV0IHByZXZpb3VzRm9ybWF0dGluZztcblxuICAgICAgICAgICAgICAgIGlmIChpID4gMCAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMV0udmFsdWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID4gMSAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwibm9kZVwiICYmIHNjaGVtYXRpY1tpIC0gMl0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAyXS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBBeGlzKCkudW5pdmVyc2FsKHNjaGVtYXRpY1tpXS52YWx1ZSwgdG9rZW5zLCBjb29yQXJyLCBwcmV2aW91c0Zvcm1hdHRpbmcsICkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHNjaGVtYXRpY1tpXS50eXBlID09PSBcIm5vZGVcIil7XG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBDb29yZGluYXRlKCkuYWRkSW5mbyh7bGFiZWw6IHNjaGVtYXRpY1tpXS52YWx1ZSxmb3JtYXR0aW5nOiBzY2hlbWF0aWNbaV0uZm9ybWF0dGluZ30sXCJub2RlLWlubGluZVwiLHRva2VucykpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2goc2NoZW1hdGljW2ldLnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29vckFycjtcbiAgICB9XG5cbiAgICBnZXRTY2hlbWF0aWMoZHJhdzogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4PWdldFJlZ2V4KCk7XG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gcmVnRXhwKFN0cmluZy5yYXdgbm9kZVxccypcXFsoJHtyZWdleC5mb3JtYXR0aW5nfSopXFxdXFxzKnsoJHtyZWdleC50ZXh0fSopfWApO1xuICAgICAgICBjb25zdCBmb3JtYXR0aW5nUmVnZXggPSAvKC0tY3ljbGV8Y3ljbGV8LS1cXCtcXCt8LS1cXCt8LS18LVxcfHxcXHwtfGdyaWR8Y2lyY2xlfHJlY3RhbmdsZSkvO1xuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzXFwtLC46YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxuICAgICAgICBjb25zdCBjb29yZGluYXRlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKFxcKFske2NhfV0rXFwpfFxcKFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXFwtXStcXChbJHtjYX1dK1xcKVxcJFxcKSlgKTtcbiAgICAgICAgbGV0IGkgPSAwO1xuICAgICAgICBsZXQgbG9vcHMgPSAwO1xuICAgICAgICBcbiAgICAgICAgd2hpbGUgKGkgPCBkcmF3Lmxlbmd0aCAmJiBsb29wcyA8IDEwMCkgeyAvLyBJbmNyZWFzZSBsb29wIGxpbWl0IG9yIGFkZCBjb25kaXRpb24gYmFzZWQgb24gcGFyc2VkIGxlbmd0aFxuICAgICAgICAgICAgbG9vcHMrKztcbiAgICAgICAgICAgIGNvbnN0IGNvb3JkaW5hdGVNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2goY29vcmRpbmF0ZVJlZ2V4KTtcbiAgICAgICAgICAgIFxuXG4gICAgICAgICAgICBpZiAoY29vcmRpbmF0ZU1hdGNoPy5pbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiY29vcmRpbmF0ZVwiLCB2YWx1ZTogY29vcmRpbmF0ZU1hdGNoWzFdIH0pO1xuICAgICAgICAgICAgICAgIGkgKz0gY29vcmRpbmF0ZU1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZ01hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChmb3JtYXR0aW5nUmVnZXgpO1xuICAgICAgICAgICAgaWYgKGZvcm1hdHRpbmdNYXRjaD8uaW5kZXggPT09IDApIHtcbiAgICAgICAgICAgICAgICBpICs9IGZvcm1hdHRpbmdNYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJmb3JtYXR0aW5nXCIsIHZhbHVlOiBmb3JtYXR0aW5nTWF0Y2hbMF0gfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IG5vZGVNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2gobm9kZVJlZ2V4KTtcbiAgICAgICAgICAgIGlmIChub2RlTWF0Y2g/LmluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJub2RlXCIsXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG5vZGVNYXRjaFsxXSB8fCBcIlwiLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogbm9kZU1hdGNoWzJdXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgaSArPSBub2RlTWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChsb29wcyA9PT0gMTAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQYXJzaW5nIGV4Y2VlZGVkIHNhZmUgbG9vcCBjb3VudFwiKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZXNBcnJheTtcbiAgICB9XG5cbiAgICBpc0Nvb3JkaW5hdGUob2JqOiBhbnkpOiBvYmogaXMgQ29vcmRpbmF0ZSB7XG4gICAgICAgIHJldHVybiBvYmogJiYgb2JqIGluc3RhbmNlb2YgQ29vcmRpbmF0ZTtcbiAgICB9XG5cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKX0gYDtcbiAgICAgICAgbGV0IGJlZm9yZVRva2VuOiBDb29yZGluYXRlIHwgdW5kZWZpbmVkO1xuICAgICAgICBsZXQgYWZ0ZXJUb2tlbjogQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHNsb3BlO1xuXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXMuZm9yRWFjaCgoY29vcmRpbmF0ZTogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIGNvb3JkaW5hdGUgaW5zdGFuY2VvZiBDb29yZGluYXRlJiZjb29yZGluYXRlLm1vZGU9PT1cIm5vZGUtaW5saW5lXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGNvb3JkaW5hdGUudG9TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNhc2UgdHlwZW9mIGNvb3JkaW5hdGU9PT1cInN0cmluZ1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSAvKC0tXFwrXFwrfC0tXFwrKS8udGVzdChjb29yZGluYXRlKT9cIi0tXCI6Y29vcmRpbmF0ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9YCgke2Nvb3JkaW5hdGUudG9TdHJpbmcoKX0pYFxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBGb3JtYXRUaWt6amF4IHtcblx0c291cmNlOiBzdHJpbmc7XG4gICAgdG9rZW5zOiBBcnJheTxUb2tlbj49W107XG4gICAgbWlkUG9pbnQ6IEF4aXM7XG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcbiAgICBkZWJ1Z0luZm8gPSBcIlwiO1xuICAgIFxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZ3xBcnJheTxUb2tlbj4pIHtcbiAgICAgICAgaWYodHlwZW9mIHNvdXJjZT09PVwic3RyaW5nXCIpe1xuXHRcdHRoaXMuc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xuICAgICAgICB0aGlzLnRva2VuaXplKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB0aGlzLnRva2Vucz1zb3VyY2VcblxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5zb3VyY2U7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmZpbmRNaWRwb2ludCgpO1xuICAgICAgICB0aGlzLmFwcGx5UG9zdFByb2Nlc3NpbmcoKTtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPVwiXFxuXFxudGhpcy5taWRQb2ludDpcXG5cIitKU09OLnN0cmluZ2lmeSh0aGlzLm1pZFBvaW50LG51bGwsMSkrXCJcXG5cIlxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXG5cbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlICs9IHRoaXMudG9TdHJpbmcoKTtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcblx0fVxuICAgIFxuICAgIHRpZHlUaWt6U291cmNlKHRpa3pTb3VyY2U6IHN0cmluZykge1xuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xuICAgICAgICB0aWt6U291cmNlID0gdGlrelNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gdGlrelNvdXJjZS5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIik7O1xuICAgIH1cblxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcbiAgICAgICAgZm9yKGxldCBpPTA7aTx0aGlzLnRva2Vucy5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgfVxuICAgIGdldENvZGUoKXtcbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xuICAgIH1cbiAgICB0b2tlbml6ZSgpIHtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHMtLC46fGA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcbiAgICAgICAgY29uc3QgYyA9IFN0cmluZy5yYXdgWyQoXXswLDJ9WyR7Y2F9XStbKSRdezAsMn18XFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitdK1xcKFske2NhfV0rXFwpXFwkYDtcbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHdpdGggZXNjYXBlZCBjaGFyYWN0ZXJzIGZvciBzcGVjaWZpYyBtYXRjaGluZ1xuICAgICAgICBjb25zdCBjbiA9IFN0cmluZy5yYXdgW1xcd19cXGRcXHNdYDsgLy8gQ29vcmRpbmF0ZSBuYW1lXG4gICAgICAgIGNvbnN0IHQgPSBTdHJpbmcucmF3YFxcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcXSpcXCR8W1xcd1xcZFxcc1xcLSwuOighKV9cXC1cXCtcXFxcXSpgOyAvLyBUZXh0IHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xuICAgICAgICBjb25zdCBmID0gU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7LiYqXFx7XFx9JVxcLTw+XWA7IC8vIEZvcm1hdHRpbmcgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG5cbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHVzaW5nIGVzY2FwZWQgYnJhY2VzIGFuZCBwYXR0ZXJuc1xuICAgICAgICBjb25zdCBjb29yUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc2UgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHMqXFwoKigke2NufSlcXCkqXFxzKmF0XFxzKlxcKCgke2N9KVxcKVxccypcXFsoJHtmfSopXFxdXFxzKlxceygke3R9KVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqKFxcW2xhYmVsPVxce1xcWyguKj8pXFxdOlxcXFxcXHcqXFxzKihbXFx3XFxzXSopXFx9XFxdKT9cXHMqXFwoKCR7Y259KylcXClcXHMqYXRcXHMqXFwoKCR7Y30pXFwpO2AsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzeygke3R9KX17KCR7dH0pfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZ3JpZFJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxncmlkeyhbXFxkLS5dKyl9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG1hc3NSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbWFzc1xceygke2N9KVxcfVxceygke3R9KVxcfVxceygtXFx8fFxcfHw+KXswLDF9XFx9XFx7KFtcXGQuXSopXFx9YCxcImdcIik7XG5cbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzZSwgc3MsIG5vZGVSZWdleCwgZHJhd1JlZ2V4LCBjaXJjbGVSZWdleCwgbWFzc1JlZ2V4LCB2ZWNSZWdleF07XG4gICAgICAgIGxldCBtYXRjaGVzOiBhbnlbXT1bXTtcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IChhLmluZGV4IHx8IDApIC0gKGIuaW5kZXggfHwgMCkpO1xuXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsyXSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbNF19XG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzVdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFs0XSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbMl19KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgpLmFkZEluZm8oaSxcImNvb3JkaW5hdGVcIix0aGlzKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe2Zvcm1hdHRpbmc6IG1hdGNoWzFdLGRyYXc6IG1hdGNoWzJdfSwgdGhpcykpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaChkaXNzZWN0WFlheGlzKG1hdGNoKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGdyaWRcIikpIHtcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbm9kZVwiKSkge1xuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbM10sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfVxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbMl0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzFdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFs0XX0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgpLmFkZEluZm8oaSxcIm5vZGVcIix0aGlzKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNpcmNsZVwiKSkgey8qXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHtcbiAgICAgICAgICAgICAgdHlwZTogXCJjaXJjbGVcIixcbiAgICAgICAgICAgICAgZm9ybWF0dGluZzogbWF0Y2hbNF0sXG4gICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsxXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMl0sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzNdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB9KTsqL1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxtYXNzXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLCBsYWJlbDogbWF0Y2hbMl19XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCkuYWRkSW5mbyhpLFwibm9kZS1tYXNzXCIsdGhpcyx7YW5jaG9yOiBtYXRjaFszXSxyb3RhdGU6IG1hdGNoWzRdfSkpXG5cbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcdmVjXCIpKSB7XG4gICAgICAgICAgICBtYXRjaFsyXT1gKCR7bWF0Y2hbMV19KS0tK25vZGVbXXske21hdGNoWzNdfX0oJHttYXRjaFsyXX0pYFxuICAgICAgICAgICAgbWF0Y2hbMV09bWF0Y2hbNF0rJywtPidcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcobWF0Y2gsdGhpcykpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZpbmRNaWRwb2ludCgpIHtcbiAgICAgICAgLypsZXQgY29vcmRpbmF0ZXMgPSB0aGlzLnRva2Vucy5maWx0ZXIoKHRva2VuOiBUb2tlbikgPT4gdG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKTtcbiAgICAgICAgdGhpcy50b2tlbnNcbiAgICAgICAgLmZpbHRlcigodG9rZW46IFRva2VuKSA9PiB0b2tlbiBpbnN0YW5jZW9mIERyYXcpXG4gICAgICAgIC5mb3JFYWNoKChvYmplY3Q6IERyYXcpID0+IHtcbiAgICAgICAgICAgIGNvb3JkaW5hdGVzID0gY29vcmRpbmF0ZXMuY29uY2F0KFxuICAgICAgICAgICAgICAgIG9iamVjdC5jb29yZGluYXRlcy5maWx0ZXIoKHRva2VuOiBhbnkpID0+IHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSlcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgICBsZXQgc3VtT2ZYID0gMCwgc3VtT2ZZID0gMDtcbiAgICAgICAgY29vcmRpbmF0ZXMuZm9yRWFjaCgoY29vcmRpbmF0ZTogdG9rZW4pID0+IHtcbiAgICAgICAgICBzdW1PZlggKz0gTnVtYmVyKGNvb3JkaW5hdGUuWCk7XG4gICAgICAgICAgc3VtT2ZZICs9IE51bWJlcihjb29yZGluYXRlLlkpOyBcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5taWRQb2ludD1uZXcgQXhpcygpO1xuICAgICAgICB0aGlzLm1pZFBvaW50LmFkZENhcnRlc2lhbihcbiAgICAgICAgICAgIHN1bU9mWCAvIGNvb3JkaW5hdGVzLmxlbmd0aCE9PTA/Y29vcmRpbmF0ZXMubGVuZ3RoOjFcbiAgICAgICAgICAgICxzdW1PZlkgLyBjb29yZGluYXRlcy5sZW5ndGghPT0wP2Nvb3JkaW5hdGVzLmxlbmd0aDoxXG4gICAgICAgICkqL1xuICAgIH1cblxuICAgIGZpbmRPcmlnaW5hbFZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3Qgb2cgPSB0aGlzLnRva2Vucy5zbGljZSgpLnJldmVyc2UoKS5maW5kKFxuICAgICAgICAgICAgKHRva2VuOiBUb2tlbikgPT5cbiAgICAgICAgICAgICAgICAodG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWVcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIG9nIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSA/IG9nLmNsb25lKCkgOiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIFxuICAgIGFwcGx5UXVhZHJhbnRzKCkge1xuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gXCJvYmplY3RcIiAmJiB0b2tlbiAhPT0gbnVsbCYmdG9rZW4udHlwZT09PVwiY29vcmRpbmF0ZVwiKSB7XG4gICAgICAgICAgICB0b2tlbi5hZGRRdWFkcmFudCh0aGlzLm1pZFBvaW50KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHRvU3RyaW5nKCl7XG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xuICAgICAgICBjb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuXG4gICAgICAgICAgICBpZih0b2tlbi50b1N0cmluZygpKXtcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IHRva2VuO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjb2RlQmxvY2tPdXRwdXQ7XG4gICAgfVxufVxuXG5cblxuXG5cblxuZnVuY3Rpb24gZGlzc2VjdFhZYXhpcyhtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSkge1xuICAgIGxldCBYbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiLCBZbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiO1xuXG4gICAgaWYgKG1hdGNoWzFdICYmIG1hdGNoWzJdKSB7XG4gICAgICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcbiAgICAgICAgWW5vZGUgPSBtYXRjaFsyXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xuICAgICAgICBYbm9kZT1Ybm9kZVswXS5zdWJzdHJpbmcoMSxYbm9kZS5sZW5ndGgpXG4gICAgICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogXCJ4eWF4aXNcIixcbiAgICAgICAgWGZvcm1hdHRpbmc6IG1hdGNoWzFdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcbiAgICAgICAgWWZvcm1hdHRpbmc6IG1hdGNoWzJdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcbiAgICAgICAgeERpcmVjdGlvbjogbWF0Y2hbMV0gJiYgLy0+Ly50ZXN0KG1hdGNoWzFdKSA/IFwibGVmdFwiIDogXCJyaWdodFwiLFxuICAgICAgICB5RGlyZWN0aW9uOiBtYXRjaFsyXSAmJiAvLT4vLnRlc3QobWF0Y2hbMl0pID8gXCJkb3duXCIgOiBcInVwXCIsXG4gICAgICAgIFhub2RlOiBYbm9kZSxcbiAgICAgICAgWW5vZGU6IFlub2RlLFxuICAgIH07XG59XG5cblxuXG5cblxuXG5cbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xubGV0IG1heFggPSAtSW5maW5pdHk7XG5sZXQgbWF4WSA9IC1JbmZpbml0eTtcbmxldCBtaW5YID0gSW5maW5pdHk7XG5sZXQgbWluWSA9IEluZmluaXR5O1xuXG50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgIGlmICh0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xuICAgIGlmICh0b2tlbi5YID4gbWF4WCkgbWF4WCA9IHRva2VuLlg7XG4gICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcblxuICAgIGlmICh0b2tlbi5ZID4gbWF4WSkgbWF4WSA9IHRva2VuLlk7XG4gICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcbiAgICB9XG59KTtcblxucmV0dXJuIHtcbiAgICBtYXhYLG1heFksbWluWCxtaW5ZLFxufTtcbn1cblxuXG5cblxuLypcbmZ1bmN0aW9uIGdlbmVyYXRlRm9ybWF0dGluZyhjb29yZGluYXRlOiBDb29yZGluYXRlKXtcbiAgICBpZiAodHlwZW9mIGNvb3JkaW5hdGUubGFiZWwgIT09IFwic3RyaW5nXCIpeyByZXR1cm4gXCJcIjsgfVxuICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBjb29yZGluYXRlLmZvcm1hdHRpbmc/LnNwbGl0KFwiLFwiKSB8fCBbXTtcbiAgICBpZiAoZm9ybWF0dGluZy5zb21lKCh2YWx1ZTogc3RyaW5nKSA9PiAvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLy50ZXN0KHZhbHVlKSkpIHtcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGUuZm9ybWF0dGluZztcbiAgICB9XG4gICAgaWYoZm9ybWF0dGluZy5sZW5ndGg+MCYmIWZvcm1hdHRpbmdbZm9ybWF0dGluZy5sZW5ndGgtMV0uZW5kc1dpdGgoXCIsXCIpKXtmb3JtYXR0aW5nLnB1c2goXCIsXCIpfVxuICAgIHN3aXRjaChjb29yZGluYXRlLnF1YWRyYW50KXtcbiAgICAgICAgY2FzZSAxOlxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSByaWdodCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSBsZWZ0LCBcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDM6XG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IGxlZnQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNDogXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IHJpZ2h0LCBcIik7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gZm9ybWF0dGluZy5qb2luKFwiXCIpO1xufVxuKi9cblxuXG5mdW5jdGlvbiBnZXRQcmVhbWJsZSgpOnN0cmluZ3tcbiAgICBjb25zdCBhbmc9XCJcXFxcdGlrenNldHthbmcvLnN0eWxlIDIgYXJncz17ZmlsbD1ibGFjayE1MCxvcGFjaXR5PTAuNSx0ZXh0IG9wYWNpdHk9MC45LGRyYXc9b3JhbmdlLDwtPixhbmdsZSBlY2NlbnRyaWNpdHk9IzEsYW5nbGUgcmFkaXVzPSMyY20sdGV4dD1vcmFuZ2UsZm9udD1cXFxcbGFyZ2V9LGFuZy8uZGVmYXVsdD17MS42fXswLjV9fVwiXG4gIFxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXG4gIFxuICAgIGNvbnN0IGFycj1cIlxcXFxuZXdjb21tYW5ke1xcXFxhcnJ9Wzhde1xcXFxjb29yZGluYXRlICgyKSBhdCAoJCgjMikhIzchKCMzKSQpO1xcXFxjb29yZGluYXRlICgxKSBhdCAoJCgyKSEjNW1tITkwOigjMykkKTtcXFxcY29vcmRpbmF0ZSAoMykgYXQgKCQoMikhIzVtbSsjNGNtISM4OigjMykkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0xcHQsPC1dICgxKS0tKDMpbm9kZSBbcG9zPSM2XSB7XFxcXGxhcmdlICMxfTt9XCIgXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXG4gICAgY29uc3Qgc3ByaW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXHNwcmluZ31bNF17XFxcXHRpa3ptYXRoe2Nvb3JkaW5hdGUgXFxcXHN0YXJ0LCBcXFxcZG9uZTtcXFxcc3RhcnQgPSAoIzEpO1xcXFxkb25lID0gKCMyKTt9XFxcXGRyYXdbdGhpY2tdICgkKFxcXFxzdGFydCkgKyAoLTEuNSwwKSQpIC0tKysoMywwKTtcXFxcZHJhdyAoXFxcXHN0YXJ0KSAtLSsgKDAsLTAuMjVjbSk7XFxcXGRyYXcgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgrMGNtLFxcXFxkb25leSswLjI1Y20pJCktLSsoMCwtMC4yNSk7XFxcXGRyYXdbZGVjb3JhdGlvbj17YXNwZWN0PTAuMywgc2VnbWVudCBsZW5ndGg9MywgYW1wbGl0dWRlPTJtbSxjb2lsLH0sZGVjb3JhdGVdIChcXFxcc3RhcnR4LFxcXFxzdGFydHktMC4yNWNtKSAtLSgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSswLjI1Y20pJClub2RlW21pZHdheSxyaWdodD0wLjI1Y20sYmxhY2tdeyM0fTtcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KSQpeyMzfTt9XCJcbiAgICBcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcbiAgICBcbiAgICBjb25zdCB0YWJsZT1cIlxcXFx0aWt6c2V0eyB0YWJsZS8uc3R5bGU9e21hdHJpeCBvZiBub2Rlcyxyb3cgc2VwPS1cXFxccGdmbGluZXdpZHRoLGNvbHVtbiBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsbm9kZXM9e3JlY3RhbmdsZSxkcmF3PWJsYWNrLGFsaWduPWNlbnRlcn0sbWluaW11bSBoZWlnaHQ9MS41ZW0sdGV4dCBkZXB0aD0wLjVleCx0ZXh0IGhlaWdodD0yZXgsbm9kZXMgaW4gZW1wdHkgY2VsbHMsZXZlcnkgZXZlbiByb3cvLnN0eWxlPXtub2Rlcz17ZmlsbD1ncmF5ITYwLHRleHQ9YmxhY2ssfX0sY29sdW1uIDEvLnN0eWxlPXtub2Rlcz17dGV4dCB3aWR0aD01ZW0sZm9udD1cXFxcYmZzZXJpZXN9fSxyb3cgMS8uc3R5bGU9e25vZGVzPXtmb250PVxcXFxiZnNlcmllc319fX1cIlxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcbiAgICAvL2NvbnN0IG1hc3M9YFxcXFxkZWZcXFxcbWFzcyMxIzJ7XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgjMSl7IzJ9O31gXG4gICAgY29uc3QgZHZlY3Rvcj1cIlxcXFxuZXdjb21tYW5ke1xcXFxkdmVjdG9yfVsyXXtcXFxcY29vcmRpbmF0ZSAodGVtcDEpIGF0ICgkKDAsMCAtfCAjMSkkKTtcXFxcY29vcmRpbmF0ZSAodGVtcDIpIGF0ICgkKDAsMCB8LSAjMSkkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0wLjdwdCwjMl0gKCMxKS0tKHRlbXAxKSgjMSktLSh0ZW1wMik7fVwiXG4gICAgXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXG4gICAgY29uc3QgcHJlYW1ibGU9XCJcXFxcdXNlcGFja2FnZXtwZ2ZwbG90cyxpZnRoZW59XFxcXHVzZXRpa3psaWJyYXJ5e2Fycm93cy5tZXRhLGFuZ2xlcyxxdW90ZXMscG9zaXRpb25pbmcsIGNhbGMsIGludGVyc2VjdGlvbnMsZGVjb3JhdGlvbnMubWFya2luZ3MsbWF0aCxzcHksbWF0cml4LHBhdHRlcm5zLHNuYWtlcyxkZWNvcmF0aW9ucy5wYXRocmVwbGFjaW5nLGRlY29yYXRpb25zLnBhdGhtb3JwaGluZyxwYXR0ZXJucyxzaGFkb3dzLHNoYXBlcy5zeW1ib2xzfVwiXG4gICAgcmV0dXJuIHByZWFtYmxlK2FuZyttYXJrK2FycitsZW5lK3NwcmluZyt0cmVlK3RhYmxlK2Nvb3IrZHZlY3RvcitwaWNBbmcrXCJcXFxccGdmcGxvdHNzZXR7Y29tcGF0PTEuMTZ9XFxcXGJlZ2lue2RvY3VtZW50fVxcXFxiZWdpbnt0aWt6cGljdHVyZX1cIlxufSJdfQ==