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
        this.interpretFormatting(formattingForInterpretation || "", []);
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
        const splitFormatting = formattingString.match(/(?:{[^}]*}|[^,{}]+)+/g) || [];
        splitFormatting.forEach(formatting => {
            //console.log(formatting)
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUE0QyxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRW5HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3QyxhQUFhO0FBQ2IsT0FBTyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDNUMsT0FBTyxFQUFFLGdCQUFnQixFQUFvQixxQkFBcUIsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDeEksT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBT2pELE1BQU0sT0FBTyxPQUFPO0lBQ2hCLEdBQUcsQ0FBTTtJQUNULE1BQU0sQ0FBYTtJQUNuQixVQUFVLENBQXNCO0lBRWhDLFlBQVksR0FBUSxFQUFDLE1BQWtCO1FBQ3JDLElBQUksQ0FBQyxHQUFHLEdBQUMsR0FBRyxDQUFDO1FBQ2IsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN2RSxJQUFJLENBQUMsTUFBTSxHQUFDLE1BQU0sQ0FBQztJQUNyQixDQUFDO0lBRUQsV0FBVztRQUNULElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFO1lBQzNDLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1lBQzdCLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUU7Z0JBQzdFLElBQUksQ0FBQyxXQUFXLENBQUMs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Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBd0JFO0FBR0YsU0FBUyxXQUFXO0lBQ2hCLE1BQU0sR0FBRyxHQUFDLG9MQUFvTCxDQUFBO0lBRTlMLE1BQU0sSUFBSSxHQUFDLDZMQUE2TCxDQUFBO0lBRXhNLE1BQU0sR0FBRyxHQUFDLG9OQUFvTixDQUFBO0lBQzlOLE1BQU0sSUFBSSxHQUFDLHdSQUF3UixDQUFBO0lBQ25TLE1BQU0sTUFBTSxHQUFDLDBnQkFBMGdCLENBQUE7SUFFdmhCLE1BQU0sSUFBSSxHQUFDLGlLQUFpSyxDQUFBO0lBRTVLLE1BQU0sS0FBSyxHQUFDLDZXQUE2VyxDQUFBO0lBQ3pYLE1BQU0sSUFBSSxHQUFDLCtFQUErRSxDQUFBO0lBQzFGLGlHQUFpRztJQUNqRyxNQUFNLE9BQU8sR0FBQyxzS0FBc0ssQ0FBQTtJQUVwTCxNQUFNLE1BQU0sR0FBQyw4dkJBQTh2QixDQUFBO0lBQzN3QixNQUFNLFFBQVEsR0FBQyxtUEFBbVAsQ0FBQTtJQUNsUSxPQUFPLFFBQVEsR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsTUFBTSxHQUFDLElBQUksR0FBQyxLQUFLLEdBQUMsSUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsaUVBQWlFLENBQUE7QUFDN0ksQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcCwgQ29tcG9uZW50LCBFZGl0b3IsIE1hcmtkb3duUmVuZGVyZXIsIE1hcmtkb3duVmlldywgV29ya3NwYWNlV2luZG93IH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCBNYXRoUGx1Z2luIGZyb20gXCJzcmMvbWFpblwiO1xyXG5pbXBvcnQgeyBvcHRpbWl6ZSB9IGZyb20gXCIuL3N2Z28uYnJvd3Nlci5qc1wiO1xyXG4vLyBAdHMtaWdub3JlXHJcbmltcG9ydCB0aWt6amF4SnMgZnJvbSBcImlubGluZTouL3Rpa3pqYXguanNcIjtcclxuaW1wb3J0IHsgY2FydGVzaWFuVG9Qb2xhciwgZGVncmVlc1RvUmFkaWFucywgZmluZEludGVyc2VjdGlvblBvaW50LCBmaW5kU2xvcGUsIHBvbGFyVG9DYXJ0ZXNpYW4sIHRvTnVtYmVyIH0gZnJvbSBcInNyYy9tYXRoVXRpbGl0aWVzLmpzXCI7XHJcbmltcG9ydCB7IERlYnVnTW9kYWwgfSBmcm9tIFwic3JjL2Rlc3BseU1vZGFscy5qc1wiO1xyXG5cclxuaW1wb3J0IHsgRWRpdG9yVmlldyB9IGZyb20gXCJAY29kZW1pcnJvci92aWV3XCI7XHJcbmltcG9ydCB7IGVycm9yIH0gZnJvbSBcImNvbnNvbGVcIjtcclxuaW1wb3J0IHsgZmxhdHRlbkFycmF5IH0gZnJvbSBcInNyYy9tYXRoRW5naW5lLmpzXCI7XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRpa3pqYXgge1xyXG4gICAgYXBwOiBBcHA7XHJcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgICBhY3RpdmVWaWV3OiBNYXJrZG93blZpZXcgfCBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgICB0aGlzLmFwcD1hcHA7XHJcbiAgICAgIHRoaXMuYWN0aXZlVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmVhZHlMYXlvdXQoKXtcclxuICAgICAgdGhpcy5wbHVnaW4uYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcclxuICAgICAgICB0aGlzLmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XHJcbiAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gIFxyXG4gICAgbG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG4gICAgICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xyXG4gICAgICAgIHMuaWQgPSBcInRpa3pqYXhcIjtcclxuICAgICAgICBzLnR5cGUgPSBcInRleHQvamF2YXNjcmlwdFwiO1xyXG4gICAgICAgIHMuaW5uZXJUZXh0ID0gdGlrempheEpzO1xyXG4gICAgICAgIGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xyXG4gICAgICAgIGRvYy5hZGRFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgdW5sb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XHJcbiAgICAgICAgY29uc3QgcyA9IGRvYy5nZXRFbGVtZW50QnlJZChcInRpa3pqYXhcIik7XHJcbiAgICAgICAgcz8ucmVtb3ZlKCk7XHJcblxyXG4gICAgICAgIGRvYy5yZW1vdmVFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgbG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcbiAgICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgXHJcbiAgICB1bmxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xyXG4gICAgICAgICAgICB0aGlzLnVubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgXHJcbiAgICBnZXRBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBwdXNoIHRoZSBtYWluIHdpbmRvdydzIHJvb3Qgc3BsaXQgdG8gdGhlIGxpc3RcclxuICAgICAgICB3aW5kb3dzLnB1c2godGhpcy5hcHAud29ya3NwYWNlLnJvb3RTcGxpdC53aW4pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEB0cy1pZ25vcmUgZmxvYXRpbmdTcGxpdCBpcyB1bmRvY3VtZW50ZWRcclxuICAgICAgICBjb25zdCBmbG9hdGluZ1NwbGl0ID0gdGhpcy5hcHAud29ya3NwYWNlLmZsb2F0aW5nU3BsaXQ7XHJcbiAgICAgICAgZmxvYXRpbmdTcGxpdC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgYSB3aW5kb3csIHB1c2ggaXQgdG8gdGhlIGxpc3QgXHJcbiAgICAgICAgICAgIGlmIChjaGlsZCBpbnN0YW5jZW9mIFdvcmtzcGFjZVdpbmRvdykge1xyXG4gICAgICAgICAgICAgICAgd2luZG93cy5wdXNoKGNoaWxkLndpbik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHdpbmRvd3M7XHJcbiAgICB9XHJcbiAgXHJcbiAgXHJcbiAgICByZWdpc3RlclRpa3pDb2RlQmxvY2soKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrelwiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGVsLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XHJcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICAgICAgICAgICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB0cnl7XHJcbiAgICAgICAgICAgIGNvbnN0IHNjcmlwdCA9IGVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcclxuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcclxuICAgICAgICAgICAgY29uc3QgdGlrempheD1uZXcgRm9ybWF0VGlrempheChzb3VyY2UpO1xyXG4gICAgICAgICAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCx0aWt6amF4LmRlYnVnSW5mbykub3BlbigpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0VGV4dCh0aWt6amF4LmdldENvZGUoKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2goZSl7XHJcbiAgICAgICAgICAgICAgICBlbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3JEaXNwbGF5ID0gZWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibWF0aC1lcnJvci1saW5lXCIgfSk7XHJcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuaW5uZXJUZXh0ID0gYEVycm9yOiAke2UubWVzc2FnZX1gO1xyXG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmNsYXNzTGlzdC5hZGQoXCJlcnJvci10ZXh0XCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIlRpa1ogUHJvY2Vzc2luZyBFcnJvcjpcIiwgZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLnB1c2goe25hbWU6IFwiVGlrelwiLCBtaW1lOiBcInRleHQveC1sYXRleFwiLCBtb2RlOiBcInN0ZXhcIn0pO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIHJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvID0gd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8uZmlsdGVyKGVsID0+IGVsLm5hbWUgIT0gXCJUaWt6XCIpO1xyXG4gICAgICB9XHJcblxyXG4gIFxyXG4gICAgICBjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICBzdmcgPSBzdmcucmVwbGFjZUFsbCgvKFwiIzAwMFwifFwiYmxhY2tcIikvZywgXCJcXFwiY3VycmVudENvbG9yXFxcIlwiKVxyXG4gICAgICAgICAgICAgICAgLnJlcGxhY2VBbGwoLyhcIiNmZmZcInxcIndoaXRlXCIpL2csIFwiXFxcInZhcigtLWJhY2tncm91bmQtcHJpbWFyeSlcXFwiXCIpO1xyXG4gICAgICAgIHJldHVybiBzdmc7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICAgIHJldHVybiBvcHRpbWl6ZShzdmcsIHtwbHVnaW5zOlxyXG4gICAgICAgICAgICAgIFtcclxuICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJwcmVzZXQtZGVmYXVsdFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFudXBJRHM6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgfSk/LmRhdGE7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgcG9zdFByb2Nlc3NTdmcgPSAoZTogRXZlbnQpID0+IHtcclxuICBcclxuICAgICAgICAgIGNvbnN0IHN2Z0VsID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICBsZXQgc3ZnID0gc3ZnRWwub3V0ZXJIVE1MO1xyXG4gIFxyXG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpIHtcclxuICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcclxuICBcclxuICAgICAgICAgIHN2Z0VsLm91dGVySFRNTCA9IHN2ZztcclxuICAgICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZWdFeHAocGF0dGVybjogc3RyaW5nIHwgUmVnRXhwLCBmbGFnczogc3RyaW5nID0gJycpOiBSZWdFeHAge1xyXG4gICAgcGF0dGVybj1wYXR0ZXJuIGluc3RhbmNlb2YgUmVnRXhwP3BhdHRlcm4uc291cmNlOnBhdHRlcm47XHJcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChTdHJpbmcucmF3YCR7cGF0dGVybn1gLCBmbGFncz9mbGFnczonJyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFJlZ2V4KCl7XHJcbiAgICBjb25zdCBiYXNpYyA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjpdYDtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgYmFzaWM6IGJhc2ljLFxyXG4gICAgICAgIG1lcmdlOiBTdHJpbmcucmF3YFtcXCtcXC1cXHwhXFxkLl1gLFxyXG4gICAgICAgIC8vY29vcmRpbmF0ZTogbmV3IFJlZ0V4cChTdHJpbmcucmF3YCgke2Jhc2ljfSt8MSlgKSxcclxuICAgICAgICBjb29yZGluYXRlTmFtZTogU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gLFxyXG4gICAgICAgIHRleHQ6IFN0cmluZy5yYXdgW1xcd1xccy0sLjokKCEpXytcXFxce309XWAsXHJcbiAgICAgICAgZm9ybWF0dGluZzogU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7JipbXFxde30lLTw+XWBcclxuICAgIH07XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmludGVyZmFjZSB0b2tlbiAge1xyXG4gICAgWD86IG51bWJlcjtcclxuICAgIFk/OiBudW1iZXI7XHJcbiAgICB0eXBlPzogc3RyaW5nO1xyXG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlcz86IGFueTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xyXG4gICAgY29uc3QgbnVtYmVyVmFsdWUgPSBwYXJzZUZsb2F0KHZhbHVlKTtcclxuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+LCBpbmRleDogbnVtYmVyKTogeyBiZWZvcmU6IG51bWJlciwgYWZ0ZXI6IG51bWJlciB9IHtcclxuICAgICAgIFxyXG4gICAgY29uc3QgYmVmb3JlSW5kZXggPSBheGVzLnNsaWNlKDAsaW5kZXgpLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICBjb25zdCBhZnRlckluZGV4ID0gYXhlcy5maW5kSW5kZXgoKGF4aXM6IGFueSxpZHg6IG51bWJlcikgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMmJmlkeD5pbmRleCk7XHJcblxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSB8fCBhZnRlckluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgdmFsaWQgQXhpcyBvYmplY3RzLlwiKTtcclxuICAgIH1cclxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gYWZ0ZXJJbmRleCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlByYWlzZWQgYXhpcyBhcyBzYW1lIHRva2VuXCIpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHsgYmVmb3JlOiBiZWZvcmVJbmRleCwgYWZ0ZXI6IGFmdGVySW5kZXggfTtcclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBBeGlzIHtcclxuICAgIGNhcnRlc2lhblg6IG51bWJlcjtcclxuICAgIGNhcnRlc2lhblk6IG51bWJlcjtcclxuICAgIHBvbGFyQW5nbGU6IG51bWJlcjtcclxuICAgIHBvbGFyTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBuYW1lPzogc3RyaW5nO1xyXG4gICAgdW5pdmVyc2FsKGNvb3JkaW5hdGU6IHN0cmluZywgdG9rZW5zPzogRm9ybWF0VGlrempheCxhbmNob3JBcnI/OiBhbnksYW5jaG9yPzogc3RyaW5nKTogQXhpcyB7XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlcz10aGlzLmdldENvb3JkaW5hdGVNYXRjaGVzKGNvb3JkaW5hdGUpO1xyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVBcnI6IEFycmF5PEF4aXN8c3RyaW5nPiA9IFtdO1xyXG4gICAgICAgIG1hdGNoZXMuZm9yRWFjaCgobWF0Y2g6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIG1hdGNoPW1hdGNoLmZ1bGxNYXRjaDtcclxuICAgICAgICAgICAgbGV0IGF4aXM6IEF4aXN8dW5kZWZpbmVkO1xyXG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgLywvLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkQ2FydGVzaWFuKG1hdGNoKTtcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIC86Ly50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBheGlzID0gbmV3IEF4aXMoKTtcclxuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZFBvbGFyKG1hdGNoKTtcclxuICAgICAgICAgICAgICAgICAgICBheGlzLnBvbGFyVG9DYXJ0ZXNpYW4oKVxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgLyFbXFxkLl0rIS8udGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgKC9bXFxkXFx3XSsvKS50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zKVxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSB0b2tlbnMuZmluZE9yaWdpbmFsVmFsdWUobWF0Y2gpPy5heGlzO1xyXG4gICAgICAgICAgICAgICAgZWxzZSB0aHJvdyBuZXcgRXJyb3IoYFRyaWVkIHRvIGZpbmQgb3JpZ2luYWwgY29vcmRpbmF0ZSB2YWx1ZSB3aGlsZSBub3QgYmVpbmcgcHJvdmlkZWQgd2l0aCB0b2tlbnNgKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYXhpcyA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgZmluZCB0aGUgY29vcmRpbmF0ZSAke21hdGNofSBmcm9tICR7Y29vcmRpbmF0ZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5tZXJnZUF4aXMoY29vcmRpbmF0ZUFycilcclxuXHJcbiAgICAgICAgaWYoYW5jaG9yQXJyJiZhbmNob3ImJmFuY2hvci5tYXRjaCgvKC0tXFwrfC0tXFwrXFwrKS8pKXtcclxuICAgICAgICAgICAgbGV0IGE6IEF4aXNcclxuICAgICAgICAgICAgaWYgKGFuY2hvci5tYXRjaCgvKC0tXFwrKS8pKXtcclxuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmQoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcclxuICAgICAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kTGFzdCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY29tcGxleENhcnRlc2lhbkFkZChhLFwiYWRkaXRpb25cIilcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgY29tcGxleENhcnRlc2lhbkFkZChheGlzOiBBeGlzLG1vZGU6IHN0cmluZyxtb2RpZmllcj86IGFueSl7XHJcbiAgICAgICAgc3dpdGNoIChtb2RlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJhZGRpdGlvblwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YKz1heGlzLmNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblkrPWF4aXMuY2FydGVzaWFuWTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwic3VidHJhY3Rpb25cIjpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmlnaHRQcm9qZWN0aW9uXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9YXhpcy5jYXJ0ZXNpYW5YXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImludGVybmFsUG9pbnRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD0odGhpcy5jYXJ0ZXNpYW5YK2F4aXMuY2FydGVzaWFuWCkqbW9kaWZpZXI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblk9KHRoaXMuY2FydGVzaWFuWStheGlzLmNhcnRlc2lhblkpKm1vZGlmaWVyO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuVG9Qb2xhcigpXHJcbiAgICAgICAgcmV0dXJuIHRoaXNcclxuICAgIH07XHJcblxyXG5cclxuICAgIGdldENvb3JkaW5hdGVNYXRjaGVzKGNvb3JkaW5hdGU6IHN0cmluZyl7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJuID0gZ2V0UmVnZXgoKTtcclxuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW1xyXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4uYmFzaWN9KylgLCBcImdcIiksXHJcbiAgICAgICAgICAgIHJlZ0V4cChTdHJpbmcucmF3YCgke3JlZ2V4UGF0dGVybi5tZXJnZX0rKWAsIFwiZ1wiKVxyXG4gICAgICAgIF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RlcCAxOiBFeHRyYWN0IG1hdGNoZXMgZm9yIGVhY2ggcGF0dGVybiBzZXBhcmF0ZWx5XHJcbiAgICAgICAgY29uc3QgYmFzaWNNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMF0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XHJcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0ucmVwbGFjZSgvLSQvZywgXCJcIiksIC8vIFJlbW92ZSB0cmFpbGluZyBoeXBoZW4gb25seVxyXG4gICAgICAgICAgICBpbmRleDogbWF0Y2guaW5kZXggPz8gMCxcclxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGhcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbWVyZ2VNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMV0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XHJcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0sXHJcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxyXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtYXRjaGVzOiBBcnJheTx7IGZ1bGxNYXRjaDogc3RyaW5nLCBpbmRleDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciB9PiA9IFtdO1xyXG5cclxuICAgICAgICBmdW5jdGlvbiBpc092ZXJsYXBwaW5nKG1hdGNoMTogeyBpbmRleDogbnVtYmVyOyBsZW5ndGg6IG51bWJlciB9LCBtYXRjaDI6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSkge1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2gxLmluZGV4IDwgbWF0Y2gyLmluZGV4ICsgbWF0Y2gyLmxlbmd0aCAmJiBtYXRjaDIuaW5kZXggPCBtYXRjaDEuaW5kZXggKyBtYXRjaDEubGVuZ3RoO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgWy4uLmJhc2ljTWF0Y2hlcywgLi4ubWVyZ2VNYXRjaGVzXS5mb3JFYWNoKG1hdGNoID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgb3ZlcmxhcHBpbmdJbmRleCA9IG1hdGNoZXMuZmluZEluZGV4KGV4aXN0aW5nTWF0Y2ggPT4gaXNPdmVybGFwcGluZyhleGlzdGluZ01hdGNoLCBtYXRjaCkpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG92ZXJsYXBwaW5nSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ01hdGNoID0gbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIGN1cnJlbnQgbWF0Y2ggY292ZXJzIGEgbGFyZ2VyIHJhbmdlLCByZXBsYWNlIHRoZSBleGlzdGluZyBvbmVcclxuICAgICAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPiBleGlzdGluZ01hdGNoLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXNbb3ZlcmxhcHBpbmdJbmRleF0gPSBtYXRjaDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIG1hdGNoZXMucHVzaChtYXRjaCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTdGVwIDM6IFNvcnQgdGhlIGZpbmFsIG1hdGNoZXMgYnkgaW5kZXhcclxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTdGVwIDQ6IFZhbGlkYXRlIHRoZSByZXN1bHRcclxuICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29vcmRpbmF0ZSBpcyBub3QgdmFsaWQ7IGV4cGVjdGVkIGEgdmFsaWQgY29vcmRpbmF0ZS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBtYXRjaGVzO1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyKSB7XHJcbiAgICAgICAgaWYgKGNhcnRlc2lhblggIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5YID0gY2FydGVzaWFuWDtcclxuICAgICAgICBpZiAoY2FydGVzaWFuWSAhPT0gdW5kZWZpbmVkKSB0aGlzLmNhcnRlc2lhblkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIGlmIChwb2xhckxlbmd0aCAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyTGVuZ3RoID0gcG9sYXJMZW5ndGg7XHJcbiAgICAgICAgaWYgKHBvbGFyQW5nbGUgIT09IHVuZGVmaW5lZCkgdGhpcy5wb2xhckFuZ2xlID0gcG9sYXJBbmdsZTtcclxuICAgIH1cclxuXHJcbiAgICBjbG9uZSgpOiBBeGlzIHtcclxuICAgICAgICByZXR1cm4gbmV3IEF4aXModGhpcy5jYXJ0ZXNpYW5YLCB0aGlzLmNhcnRlc2lhblksdGhpcy5wb2xhckxlbmd0aCx0aGlzLnBvbGFyQW5nbGUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuICAgIG1lcmdlQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPikge1xyXG4gICAgICAgIGlmICghYXhlcy5zb21lKChheGlzOiBhbnkpID0+IHR5cGVvZiBheGlzID09PSBcInN0cmluZ1wiKSkge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXhlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXhlc1tpXTtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcclxuICAgICAgICAgICAgY29uc3Qgc2lkZXMgPSBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXMsIGkpO1xyXG4gICAgICAgICAgICBjb25zdCBiZWZvcmVBeGlzID0gYXhlc1tzaWRlcy5iZWZvcmVdIGFzIEF4aXM7XHJcbiAgICAgICAgICAgIGNvbnN0IGFmdGVyQXhpcyA9IGF4ZXNbc2lkZXMuYWZ0ZXJdIGFzIEF4aXM7XHJcblxyXG4gICAgICAgICAgICBsZXQgIG1hdGNoID0gY3VycmVudC5tYXRjaCgvXlxcKyQvKTtcclxuICAgICAgICAgICAgbGV0IG1vZGUsbW9kaWZpZXJzO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiYWRkaXRpb25cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL14tXFx8JC8pXHJcbiAgICAgICAgICAgIGlmKCFtb2RlJiZtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJyaWdodFByb2plY3Rpb25cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL15cXCEoW1xcZC5dKylcXCEkLylcclxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcclxuICAgICAgICAgICAgICAgIG1vZGUgPSBcImludGVybmFsUG9pbnRcIlxyXG4gICAgICAgICAgICAgICAgbW9kaWZpZXJzPXRvTnVtYmVyKG1hdGNoWzFdKVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZihtb2RlKXtcclxuICAgICAgICAgICAgICAgIGF4ZXMuc3BsaWNlKHNpZGVzLmJlZm9yZSwgc2lkZXMuYWZ0ZXIgLSBzaWRlcy5iZWZvcmUgKyAxLCBiZWZvcmVBeGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYWZ0ZXJBeGlzLG1vZGUsbW9kaWZpZXJzKSk7XHJcbiAgICAgICAgICAgICAgICBpID0gc2lkZXMuYmVmb3JlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGF4ZXMubGVuZ3RoID09PSAxICYmIGF4ZXNbMF0gaW5zdGFuY2VvZiBBeGlzKSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICBwcm9qZWN0aW9uKGF4aXMxOiBBeGlzfHVuZGVmaW5lZCxheGlzMjogQXhpc3x1bmRlZmluZWQpOmFueXtcclxuICAgICAgICBpZiAoIWF4aXMxfHwhYXhpczIpe3Rocm93IG5ldyBFcnJvcihcImF4aXMncyB3ZXJlIHVuZGVmaW5lZCBhdCBwcm9qZWN0aW9uXCIpO31cclxuICAgICAgICByZXR1cm4gW3tYOiBheGlzMS5jYXJ0ZXNpYW5YLFk6IGF4aXMyLmNhcnRlc2lhbll9LHtYOiBheGlzMi5jYXJ0ZXNpYW5YLFk6IGF4aXMxLmNhcnRlc2lhbll9XVxyXG4gICAgfVxyXG4gICAgY29tYmluZShjb29yZGluYXRlQXJyOiBhbnkpe1xyXG4gICAgICAgIGxldCB4PTAseT0wO1xyXG4gICAgICAgIGNvb3JkaW5hdGVBcnIuZm9yRWFjaCgoY29vcmRpbmF0ZTogQXhpcyk9PntcclxuICAgICAgICAgICAgeCs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICB5Kz1jb29yZGluYXRlLmNhcnRlc2lhblk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmNhcnRlc2lhblg9eDt0aGlzLmNhcnRlc2lhblk9eTtcclxuICAgIH1cclxuICAgIGFkZENhcnRlc2lhbih4OiBzdHJpbmcgfCBudW1iZXIsIHk/OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIXkgJiYgdHlwZW9mIHggPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgICAgW3gsIHldID0geC5zcGxpdChcIixcIikubWFwKE51bWJlcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh4ID09PSB1bmRlZmluZWQgfHwgeSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgQ2FydGVzaWFuIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YID0geCBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZID0geSBhcyBudW1iZXI7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHBvbGFyVG9DYXJ0ZXNpYW4oKXtcclxuICAgICAgICBjb25zdCB0ZW1wPXBvbGFyVG9DYXJ0ZXNpYW4odGhpcy5wb2xhckFuZ2xlLCB0aGlzLnBvbGFyTGVuZ3RoKVxyXG4gICAgICAgIHRoaXMuYWRkQ2FydGVzaWFuKHRlbXAuWCx0ZW1wLlkpXHJcbiAgICB9XHJcblxyXG4gICAgY2FydGVzaWFuVG9Qb2xhcigpe1xyXG4gICAgICAgIGNvbnN0IHRlbXA9Y2FydGVzaWFuVG9Qb2xhcih0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSlcclxuICAgICAgICB0aGlzLmFkZFBvbGFyKHRlbXAuYW5nbGUsdGVtcC5sZW5ndGgpXHJcbiAgICB9XHJcblxyXG4gICAgYWRkUG9sYXIoYW5nbGU6IHN0cmluZyB8IG51bWJlciwgbGVuZ3RoPzogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCFsZW5ndGggJiYgdHlwZW9mIGFuZ2xlID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgICAgIFthbmdsZSwgbGVuZ3RoXSA9IGFuZ2xlLnNwbGl0KFwiOlwiKS5tYXAoTnVtYmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGFuZ2xlID09PSB1bmRlZmluZWQgfHwgbGVuZ3RoID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBwb2xhciBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucG9sYXJBbmdsZSA9IGFuZ2xlIGFzIG51bWJlcjtcclxuICAgICAgICB0aGlzLnBvbGFyTGVuZ3RoID0gbGVuZ3RoIGFzIG51bWJlcjtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIsXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgfVxyXG5cclxuICAgIGludGVyc2VjdGlvbihjb29yZDogc3RyaW5nLCBmaW5kT3JpZ2luYWxWYWx1ZTogKGNvb3JkOiBzdHJpbmcpID0+IENvb3JkaW5hdGUgfCB1bmRlZmluZWQpOiB7WDpudW1iZXIsWTpudW1iZXJ9IHtcclxuICAgICAgICBjb25zdCBvcmlnaW5hbENvb3JkcyA9IGNvb3JkXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFxzKmFuZFxccz98LS0pL2csIFwiIFwiKVxyXG4gICAgICAgICAgICAuc3BsaXQoXCIgXCIpXHJcbiAgICAgICAgICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHRva2VuKTogdG9rZW4gaXMgQ29vcmRpbmF0ZSA9PiB0b2tlbiAhPT0gdW5kZWZpbmVkKTtcclxuXHJcbiAgICAgICAgaWYgKG9yaWdpbmFsQ29vcmRzLmxlbmd0aCA8IDQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW50ZXJzZWN0aW9uIGhhZCB1bmRlZmluZWQgY29vcmRpbmF0ZXMgb3IgaW5zdWZmaWNpZW50IGRhdGEuXCIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc2xvcGVzID0gW1xyXG4gICAgICAgICAgICBmaW5kU2xvcGUob3JpZ2luYWxDb29yZHNbMF0uYXhpcywgb3JpZ2luYWxDb29yZHNbMV0uYXhpcyksXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1syXS5heGlzLCBvcmlnaW5hbENvb3Jkc1szXS5heGlzKSxcclxuICAgICAgICBdO1xyXG5cclxuICAgICAgICByZXR1cm4gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMsIG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMsIHNsb3Blc1swXSwgc2xvcGVzWzFdKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY292b3J0KHZhbHVlOiBudW1iZXIsY29udnJzaW46IHN0cmluZyl7XHJcblxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gbWF0Y2hLZXlXaXRoVmFsdWUoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgY29uc3QgdmFsdWVNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgICAgICAgXCJhbmNob3JcIjogXCJhbmNob3I9XCIsXHJcbiAgICAgICAgXCJyb3RhdGVcIjogXCJyb3RhdGU9XCIsXHJcbiAgICAgICAgXCJsaW5lV2lkdGhcIjogXCJsaW5lIHdpZHRoPVwiLFxyXG4gICAgICAgIFwiZmlsbFwiOiBcImZpbGw9XCIsXHJcbiAgICAgICAgXCJmaWxsT3BhY2l0eVwiOiBcImZpbGwgb3BhY2l0eT1cIixcclxuICAgICAgICBcInRleHRDb2xvclwiOiBcInRleHQgY29sb3I9XCIsXHJcbiAgICAgICAgXCJkcmF3XCI6IFwiZHJhdz1cIixcclxuICAgICAgICBcInRleHRcIjogXCJ0ZXh0PVwiLFxyXG4gICAgICAgIFwicG9zXCI6IFwicG9zPVwiLFxyXG4gICAgICAgIFwic2NhbGVcIjogXCJzY2FsZT1cIixcclxuICAgICAgICBcImRlY29yYXRlXCI6IFwiZGVjb3JhdGVcIixcclxuICAgICAgICBcInNsb3BlZFwiOiBcInNsb3BlZFwiLFxyXG4gICAgICAgIFwiZGVjb3JhdGlvblwiOiBcImRlY29yYXRpb249XCIsXHJcbiAgICAgICAgXCJkZWNvcmF0aW9uLmJyYWNlXCI6IFwiYnJhY2VcIixcclxuICAgICAgICBcImRlY29yYXRpb24uYW1wbGl0dWRlXCI6IFwiYW1wbGl0dWRlPVwiXHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiB2YWx1ZU1hcFtrZXldIHx8ICcnO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRm9ybWF0dGluZ3tcclxuICAgIFxyXG4gICAgc2NhbGU6IG51bWJlcjtcclxuICAgIHJvdGF0ZT86IG51bWJlcjtcclxuICAgIGxpbmVXaWR0aD86IG51bWJlcjtcclxuICAgIGZpbGxPcGFjaXR5PzogbnVtYmVyO1xyXG4gICAgcG9zPzogbnVtYmVyO1xyXG5cclxuICAgIG1vZGU6IHN0cmluZztcclxuICAgIGFuY2hvcj86IHN0cmluZztcclxuICAgIHdpZHRoPzogc3RyaW5nO1xyXG4gICAgY29sb3I/OiBzdHJpbmc7XHJcbiAgICB0ZXh0Q29sb3I/OiBzdHJpbmc7XHJcbiAgICBmaWxsPzogc3RyaW5nO1xyXG4gICAgYXJyb3c/OiBzdHJpbmc7XHJcbiAgICBkcmF3Pzogc3RyaW5nO1xyXG4gICAgdGV4dD86IHN0cmluZztcclxuICAgIHBhdGhBdHRyaWJ1dGU/OiBzdHJpbmc7XHJcbiAgICB0aWt6c2V0Pzogc3RyaW5nO1xyXG4gICAgcG9zaXRpb24/OiBzdHJpbmc7XHJcbiAgICBsaW5lU3R5bGU/OiBzdHJpbmc7XHJcbiAgICBcclxuICAgIHNsb3BlZD86IGJvb2xlYW47XHJcbiAgICBkZWNvcmF0ZT86IGJvb2xlYW47XHJcblxyXG4gICAgZGVjb3JhdGlvbj86IHticmFjZT86IGJvb2xlYW4sY29pbDogYm9vbGVhbixhbXBsaXR1ZGU/OiBudW1iZXIsYXNwZWN0OiBudW1iZXIsc2VnbWVudExlbmd0aDpudW1iZXJ9O1xyXG4gICAgXHJcblxyXG4gICAgcXVpY2tBZGQobW9kZTogc3RyaW5nLGZvcm1hdHRpbmc6IGFueSxmb3JtYXR0aW5nRm9ySW50ZXJwcmV0YXRpb24/OnN0cmluZyApe1xyXG4gICAgICAgIHRoaXMubW9kZT1tb2RlO1xyXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZ1NwZWNpZmljVG9Nb2RlKCk7XHJcbiAgICAgICAgdGhpcy5pbnRlcnByZXRGb3JtYXR0aW5nKGZvcm1hdHRpbmdGb3JJbnRlcnByZXRhdGlvbnx8XCJcIixbXSlcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgZm9ybWF0dGluZ1NwZWNpZmljVG9Nb2RlKCl7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcIm5vZGUtbWFzc1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPVwieWVsbG93ITYwXCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhBdHRyaWJ1dGU9XCJkcmF3XCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFkZFNwbG9wQW5kUG9zaXRpb24oYXJyOiBhbnksaW5kZXg6IG51bWJlcil7XHJcbiAgICAgICAgY29uc3QgYmVmb3JlQWZ0ZXI9ZmluZEJlZm9yZUFmdGVyQXhpcyhhcnIsaW5kZXgpO1xyXG4gICAgICAgIGNvbnN0IFtiZWZvcmUsIGFmdGVyXT1bYXJyW2JlZm9yZUFmdGVyLmJlZm9yZV0sYXJyW2JlZm9yZUFmdGVyLmFmdGVyXV1cclxuICAgICAgICBpZiAodGhpcy5wb3NpdGlvbnx8dGhpcy5zbG9wZWQpe3JldHVybn1cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGVkZ2UxID0gYmVmb3JlLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xyXG4gICAgICAgIGNvbnN0IGVkZ2UyID0gYWZ0ZXIucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XHJcbiAgICAgICAgY29uc3Qgc2xvcGU9ZmluZFNsb3BlKGVkZ2UxLGVkZ2UyKVxyXG5cclxuICAgICAgICB0aGlzLnNsb3BlZCA9IHNsb3BlICE9PSAwO1xyXG5cclxuICAgICAgICBsZXQgcXVhZHJhbnRcclxuICAgICAgICBpZiAoZWRnZTEhPT1lZGdlMilxdWFkcmFudD1lZGdlMStlZGdlMjtcclxuICAgICAgICBlbHNlIHF1YWRyYW50PWVkZ2UxO1xyXG5cclxuICAgICAgICBpZiAoc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHkpe1xyXG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uID0gcXVhZHJhbnQucmVwbGFjZSgvKDN8NCkvLFwiYmVsb3dcIikucmVwbGFjZSgvKDF8NCkvLFwiYWJvdmVcIilcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuc2xvcGVkKXtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbis9cXVhZHJhbnQucmVwbGFjZSgvKDJ8MykvLFwicmlnaHRcIikucmVwbGFjZSgvKDF8NCkvLFwibGVmdFwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBSZW1vdmUgdW51c2VkIHF1YWRyYW50cy4gYW5kIEFkZCBzcGFjZSBpZiB0d28gd29yZHNcclxuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbj8ucmVwbGFjZSgvW1xcZF0rL2csXCJcIikucmVwbGFjZSgvKGJlbG93fGFib3ZlKShyaWdodHxyaWdodCkvLFwiJDEgJDJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nOiBzdHJpbmcsZm9ybWF0dGluZ0FycjogYW55KXtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZm9ybWF0dGluZ0FycikpIHtcclxuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jyl7XHJcbiAgICAgICAgICAgICAgICAvL3RoaXMuc2V0UHJvcGVydHkoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRQcm9wZXJ0eShrZXkgYXMga2V5b2YgRm9ybWF0dGluZyx2YWx1ZSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcblxyXG4gICAgICAgIGNvbnN0IHNwbGl0Rm9ybWF0dGluZz1mb3JtYXR0aW5nU3RyaW5nLm1hdGNoKC8oPzp7W159XSp9fFteLHt9XSspKy9nKSB8fCBbXTtcclxuXHJcbiAgICAgICAgc3BsaXRGb3JtYXR0aW5nLmZvckVhY2goZm9ybWF0dGluZyA9PiB7XHJcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coZm9ybWF0dGluZylcclxuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBmb3JtYXR0aW5nLm1hdGNoKC9eKFtePV0rKT17KC4qKX0kLyk7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAhIW1hdGNoOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgIFtfLHBhcmVudCwgY2hpbGRyZW5dPW1hdGNoO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmludGVycHJldEZvcm1hdHRpbmcoY2hpbGRyZW4sW10pXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSBmb3JtYXR0aW5nLmluY2x1ZGVzKFwibGluZXdpZHRoXCIpOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImxpbmVXaWR0aFwiLGZvcm1hdHRpbmcpXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlIGZvcm1hdHRpbmcuaW5jbHVkZXMoXCJmaWxsPVwiKToge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJmaWxsXCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgZm9ybWF0dGluZy5pbmNsdWRlcyhcImZpbGxvcGFjaXR5XCIpOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImZpbGxPcGFjaXR5XCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKC0+fDwtfC0qe1N0ZWFsdGh9LSopJC8pOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hcnJvdyA9IGZvcm1hdHRpbmdcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpezEsMn0kLyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBvc2l0aW9uPWZvcm1hdHRpbmcucmVwbGFjZSgvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLyxcIiQxIFwiKVxyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15wb3M9Lyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwicG9zXCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZHJhdz0vKToge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3BsaXQoXCJkcmF3XCIsZm9ybWF0dGluZylcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZGVjb3JhdGUkLyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRlY29yYXRlPXRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXnRleHQ9Lyk6IHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNwbGl0KFwidGV4dFwiLGZvcm1hdHRpbmcpXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXmJyYWNlJC8pOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4sKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eYW1wbGl0dWRlLyk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zcGxpdChcImRlY29yYXRpb25cIixmb3JtYXR0aW5nLFwiYW1wbGl0dWRlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+LClcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eZHJhdyQvKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBhdGhBdHRyaWJ1dGUgPSBmb3JtYXR0aW5nO2JyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAhIWZvcm1hdHRpbmcubWF0Y2goL15oZWxwbGluZXMkLyk6XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50aWt6c2V0ID0gZm9ybWF0dGluZy5yZXBsYWNlKC9oZWxwbGluZXMvZyxcImhlbHAgbGluZXNcIik7YnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICEhZm9ybWF0dGluZy5tYXRjaCgvXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxkLl0rKXsxLDV9JC8pOlxyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29sb3I9Zm9ybWF0dGluZzticmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgISFmb3JtYXR0aW5nLm1hdGNoKC9eKGRvdHRlZHxkYXNoZWR8c21vb3RofGRlbnNlbHl8bG9vc2VseSl7MSwyfSQvKTpcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmxpbmVTdHlsZT1mb3JtYXR0aW5nLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLyxcIiQxIFwiKTticmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcclxuICAgICAgICBrZXk6IEssXHJcbiAgICAgICAgZm9ybWF0dGluZzogYW55LFxyXG4gICAgICAgIG5lc3RlZEtleT86IE5LXHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBsZXQgdmFsdWU7XHJcblxyXG4gICAgICAgIGlmKHR5cGVvZiBmb3JtYXR0aW5nIT09XCJib29sZWFuXCIpe1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBmb3JtYXR0aW5nLnNwbGl0KFwiPVwiKTtcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBFbnN1cmUgdGhlIGZvcm1hdHRpbmcgc3RyaW5nIGlzIHZhbGlkXHJcbiAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPCAyIHx8ICFtYXRjaFsxXSkgcmV0dXJuO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXHJcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gbWF0Y2hbMV0udHJpbSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHZhbHVlIGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nXHJcbiAgICAgICAgICAgIHZhbHVlID0gIWlzTmFOKHBhcnNlRmxvYXQocmF3VmFsdWUpKSAmJiBpc0Zpbml0ZSgrcmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA6IHJhd1ZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB2YWx1ZT1mb3JtYXR0aW5nXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuc2V0UHJvcGVydHkoa2V5LCB2YWx1ZSwgbmVzdGVkS2V5KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgc2V0UHJvcGVydHk8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxyXG4gICAgICAgIGtleTogSyxcclxuICAgICAgICB2YWx1ZTogYW55LFxyXG4gICAgICAgIG5lc3RlZEtleT86IE5LXHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nT2JqID0gdGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChuZXN0ZWRLZXkpIHtcclxuICAgICAgICAgICAgaWYgKCFmb3JtYXR0aW5nT2JqW2tleV0gfHwgdHlwZW9mIGZvcm1hdHRpbmdPYmpba2V5XSAhPT0gJ29iamVjdCcpIHtcclxuICAgICAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XSA9IHt9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XVtuZXN0ZWRLZXldID0gdmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZm9ybWF0dGluZ09ialtrZXldID0gdmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuICAgIHRvU3RyaW5nKCk6IHN0cmluZyB7XHJcbiAgICAgICAgbGV0IHN0cmluZz0nWyc7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModGhpcykpIHtcclxuICAgICAgICAgICAgaWYgKGtleT09PVwibW9kZVwiKXtjb250aW51ZTt9XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpe1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nKz10aGlzLmhhbmRsZU9iamVjdFRvU3RyaW5nKHZhbHVlLGtleSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrKHR5cGVvZiB2YWx1ZT09PVwiYm9vbGVhblwiPycnOnZhbHVlKSsnLCc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0cmluZytcIl1cIjtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVPYmplY3RUb1N0cmluZyhvYmo6IG9iamVjdCwgcGFyZW50S2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQ29vcmRpbmF0ZSB7XHJcbiAgICBtb2RlOiBzdHJpbmc7XHJcbiAgICBheGlzOiBBeGlzO1xyXG4gICAgb3JpZ2luYWw/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcclxuICAgIGZvcm1hdHRpbmcgPSBuZXcgRm9ybWF0dGluZygpO1xyXG4gICAgbGFiZWw/OiBzdHJpbmc7XHJcbiAgICBxdWFkcmFudD86IG51bWJlcjtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgbW9kZT86IHN0cmluZyxcclxuICAgICAgICBheGlzPzogQXhpcyxcclxuICAgICAgICBvcmlnaW5hbD86IHN0cmluZyxcclxuICAgICAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZyxcclxuICAgICAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxcclxuICAgICAgICBsYWJlbD86IHN0cmluZyxcclxuICAgICAgICBxdWFkcmFudD86IG51bWJlclxyXG4gICAgKSB7XHJcblxyXG4gICAgICAgIGlmIChtb2RlICE9PSB1bmRlZmluZWQpIHRoaXMubW9kZSA9IG1vZGU7XHJcbiAgICAgICAgaWYgKGF4aXMgIT09IHVuZGVmaW5lZCkgdGhpcy5heGlzID0gYXhpcztcclxuICAgICAgICB0aGlzLm9yaWdpbmFsID0gb3JpZ2luYWw7XHJcbiAgICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSA9IGNvb3JkaW5hdGVOYW1lO1xyXG4gICAgICAgIGlmIChmb3JtYXR0aW5nICE9PSB1bmRlZmluZWQpIHRoaXMuZm9ybWF0dGluZyA9IGZvcm1hdHRpbmc7XHJcbiAgICAgICAgdGhpcy5sYWJlbCA9IGxhYmVsO1xyXG4gICAgICAgIHRoaXMucXVhZHJhbnQgPSBxdWFkcmFudDtcclxuICAgIH1cclxuICAgIGNsb25lKCk6IENvb3JkaW5hdGUge1xyXG4gICAgICAgIHJldHVybiBuZXcgQ29vcmRpbmF0ZShcclxuICAgICAgICAgICAgdGhpcy5tb2RlLFxyXG4gICAgICAgICAgICB0aGlzLmF4aXMuY2xvbmUoKSxcclxuICAgICAgICAgICAgdGhpcy5vcmlnaW5hbCxcclxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSxcclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nLFxyXG4gICAgICAgICAgICB0aGlzLmxhYmVsLFxyXG4gICAgICAgICAgICB0aGlzLnF1YWRyYW50XHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgIGFkZEF4aXMoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIpe1xyXG4gICAgICAgIHRoaXMuYXhpcz1uZXcgQXhpcyhjYXJ0ZXNpYW5YLCBjYXJ0ZXNpYW5ZLCBwb2xhckxlbmd0aCwgcG9sYXJBbmdsZSk7XHJcbiAgICB9XHJcbiAgICBhZGRJbmZvKG1hdGNoOiB7b3JpZ2luYWw/OiBzdHJpbmcsY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmcsbGFiZWw/OiBzdHJpbmcsZm9ybWF0dGluZz86IHN0cmluZ30sIG1vZGU6IHN0cmluZyx0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGZvcm1hdHRpbmc/OiBvYmplY3QpIHtcclxuICAgICAgICB0aGlzLm1vZGU9bW9kZTtcclxuICAgICAgICAoW3tvcmlnaW5hbDogdGhpcy5vcmlnaW5hbCxjb29yZGluYXRlTmFtZTogdGhpcy5jb29yZGluYXRlTmFtZSxsYWJlbDogdGhpcy5sYWJlbH1dPVttYXRjaF0pXHJcblxyXG4gICAgICAgIGlmKHRoaXMub3JpZ2luYWwpe1xyXG4gICAgICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoKS51bml2ZXJzYWwodGhpcy5vcmlnaW5hbCx0b2tlbnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZy5xdWlja0FkZCh0aGlzLm1vZGUsZm9ybWF0dGluZyxtYXRjaC5mb3JtYXR0aW5nKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpIHtcclxuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29vcmRpbmF0ZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBcXFxcY29vcnske3RoaXMuYXhpcy50b1N0cmluZygpfX17JHt0aGlzLmNvb3JkaW5hdGVOYW1lIHx8IFwiXCJ9fXske3RoaXMubGFiZWwgfHwgXCJcIn19e31gO1xyXG4gICAgICAgICAgICBjYXNlIFwibm9kZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLWlubGluZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBub2RlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSB7JHt0aGlzLmxhYmVsfHwnJ319YFxyXG4gICAgICAgICAgICBjYXNlIFwibm9kZS1tYXNzXCI6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYFxcXFxub2RlICR7dGhpcy5jb29yZGluYXRlTmFtZT8nKCcrdGhpcy5jb29yZGluYXRlTmFtZSsnKSc6Jyd9IGF0ICgke3RoaXMuYXhpcy50b1N0cmluZygpfSkgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCl9IHske3RoaXMubGFiZWx9fTtgXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIG1vZGUgYXQgdG8gc3RyaW5nIGNvb3JkaW5hdGVcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICB9XHJcblxyXG4gICAgYWRkUXVhZHJhbnQobWlkUG9pbnQ6IEF4aXMpIHtcclxuICAgICAgICBjb25zdCB4RGlyZWN0aW9uID0gdGhpcy5heGlzLmNhcnRlc2lhblggPiBtaWRQb2ludC5jYXJ0ZXNpYW5YID8gMSA6IC0xO1xyXG4gICAgICAgIGNvbnN0IHlEaXJlY3Rpb24gPSB0aGlzLmF4aXMuY2FydGVzaWFuWSA+IG1pZFBvaW50LmNhcnRlc2lhblkgPyAxIDogLTE7XHJcbiAgICAgICAgdGhpcy5xdWFkcmFudCA9IHlEaXJlY3Rpb24gPT09IDEgPyAoeERpcmVjdGlvbiA9PT0gMSA/IDEgOiAyKSA6ICh4RGlyZWN0aW9uID09PSAxID8gNCA6IDMpO1xyXG4gICAgfVxyXG59XHJcblxyXG50eXBlIFRva2VuID1BeGlzIHwgQ29vcmRpbmF0ZSB8RHJhd3xGb3JtYXR0aW5nfCBzdHJpbmc7XHJcblxyXG5leHBvcnQgY2xhc3MgRHJhdyB7XHJcbiAgICBtb2RlPzogc3RyaW5nXHJcbiAgICBmb3JtYXR0aW5nOiBGb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKCk7XHJcbiAgICBjb29yZGluYXRlczogQXJyYXk8VG9rZW4+O1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKG1hdGNoOiB7Zm9ybWF0dGluZzogc3RyaW5nfGFueSxkcmF3OiBzdHJpbmd8YW55fSwgdG9rZW5zPzogRm9ybWF0VGlrempheCxtb2RlPzogc3RyaW5nKSB7XHJcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgdGhpcy5tb2RlPWBkcmF3JHttb2RlP1wiLVwiK21vZGU6XCJcIn1gO1xyXG4gICAgICAgIGlmICh0eXBlb2YgbWF0Y2guZm9ybWF0dGluZyA9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nLnF1aWNrQWRkKGBkcmF3YCx7fSxtYXRjaC5mb3JtYXR0aW5nKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZy5xdWlja0FkZChgZHJhd2AsbWF0Y2guZm9ybWF0dGluZywnJyk7XHJcblxyXG4gICAgICAgIGlmKHR5cGVvZiBtYXRjaC5kcmF3PT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXMgPSB0aGlzLmZpbGxDb29yZGluYXRlcyh0aGlzLmdldFNjaGVtYXRpYyhtYXRjaC5kcmF3KSwgdG9rZW5zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcz10aGlzLmNyZWF0ZUZyb21BcnJheShtYXRjaC5kcmF3KVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjcmVhdGVGcm9tQXJyYXkoYXJyOiBhbnkpe1xyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcclxuICAgICAgICBmb3IgKGxldCBpPTA7aTxhcnIubGVuZ3RoO2krKyl7XHJcbiAgICAgICAgICAgIGlmIChhcnJbaV0gaW5zdGFuY2VvZiBBeGlzfHxhcnJbaV0gaW5zdGFuY2VvZiBDb29yZGluYXRlKXtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaChhcnJbaV0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYodHlwZW9mIGFycj09PVwic3RyaW5nXCIpe1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBjb29yZGluYXRlc0FycmF5Lmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlc0FycmF5W2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xyXG4gICAgICAgICAgICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB3aGlsZSAoaSA8IGNvb3JkaW5hdGVzQXJyYXkubGVuZ3RoICYmICFmb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGkrKztcclxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGNvb3JkaW5hdGVzQXJyYXlbaV0gPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjb29yZGluYXRlc0FycmF5W2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaS0tOyBcclxuICAgICAgICAgICAgICAgIGlmIChmb3VuZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCgnLS0nKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZXNBcnJheTtcclxuICAgIH1cclxuXHJcbiAgICBmaWxsQ29vcmRpbmF0ZXMoc2NoZW1hdGljOiBhbnlbXSwgdG9rZW5zPzogRm9ybWF0VGlrempheCkge1xyXG4gICAgICAgIGNvbnN0IGNvb3JBcnI6IEFycmF5PFRva2VuPj1bXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjaGVtYXRpYy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcHJldmlvdXNGb3JtYXR0aW5nO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChpID4gMCAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAxXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA+IDEgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcIm5vZGVcIiAmJiBzY2hlbWF0aWNbaSAtIDJdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAyXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChuZXcgQXhpcygpLnVuaXZlcnNhbChzY2hlbWF0aWNbaV0udmFsdWUsIHRva2VucywgY29vckFyciwgcHJldmlvdXNGb3JtYXR0aW5nLCApKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKHNjaGVtYXRpY1tpXS50eXBlID09PSBcIm5vZGVcIil7XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IENvb3JkaW5hdGUoKS5hZGRJbmZvKHtsYWJlbDogc2NoZW1hdGljW2ldLnZhbHVlLGZvcm1hdHRpbmc6IHNjaGVtYXRpY1tpXS5mb3JtYXR0aW5nfSxcIm5vZGUtaW5saW5lXCIsdG9rZW5zKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChzY2hlbWF0aWNbaV0udmFsdWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb29yQXJyO1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNjaGVtYXRpYyhkcmF3OiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCByZWdleD1nZXRSZWdleCgpO1xyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcclxuICAgICAgICBjb25zdCBub2RlUmVnZXggPSByZWdFeHAoU3RyaW5nLnJhd2Bub2RlXFxzKlxcWygke3JlZ2V4LmZvcm1hdHRpbmd9KilcXF1cXHMqeygke3JlZ2V4LnRleHR9Kil9YCk7XHJcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ1JlZ2V4ID0gLygtLWN5Y2xlfGN5Y2xlfC0tXFwrXFwrfC0tXFwrfC0tfC1cXHx8XFx8LXxncmlkfGNpcmNsZXxyZWN0YW5nbGUpLztcclxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzXFwtLC46YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoXFwoWyR7Y2F9XStcXCl8XFwoXFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitcXC1dK1xcKFske2NhfV0rXFwpXFwkXFwpKWApO1xyXG4gICAgICAgIGxldCBpID0gMDtcclxuICAgICAgICBsZXQgbG9vcHMgPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChpIDwgZHJhdy5sZW5ndGggJiYgbG9vcHMgPCAxMDApIHsgLy8gSW5jcmVhc2UgbG9vcCBsaW1pdCBvciBhZGQgY29uZGl0aW9uIGJhc2VkIG9uIHBhcnNlZCBsZW5ndGhcclxuICAgICAgICAgICAgbG9vcHMrKztcclxuICAgICAgICAgICAgY29uc3QgY29vcmRpbmF0ZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChjb29yZGluYXRlUmVnZXgpO1xyXG4gICAgICAgICAgICBcclxuXHJcbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImNvb3JkaW5hdGVcIiwgdmFsdWU6IGNvb3JkaW5hdGVNYXRjaFsxXSB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gY29vcmRpbmF0ZU1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZ01hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChmb3JtYXR0aW5nUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAoZm9ybWF0dGluZ01hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgaSArPSBmb3JtYXR0aW5nTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJmb3JtYXR0aW5nXCIsIHZhbHVlOiBmb3JtYXR0aW5nTWF0Y2hbMF0gfSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG5vZGVNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2gobm9kZVJlZ2V4KTtcclxuICAgICAgICAgICAgaWYgKG5vZGVNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJub2RlXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGluZzogbm9kZU1hdGNoWzFdIHx8IFwiXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG5vZGVNYXRjaFsyXVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBpICs9IG5vZGVNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGxvb3BzID09PSAxMDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUGFyc2luZyBleGNlZWRlZCBzYWZlIGxvb3AgY291bnRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xyXG4gICAgfVxyXG5cclxuICAgIGlzQ29vcmRpbmF0ZShvYmo6IGFueSk6IG9iaiBpcyBDb29yZGluYXRlIHtcclxuICAgICAgICByZXR1cm4gb2JqICYmIG9iaiBpbnN0YW5jZW9mIENvb3JkaW5hdGU7XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmcoKSB7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKX0gYDtcclxuICAgICAgICBsZXQgYmVmb3JlVG9rZW46IENvb3JkaW5hdGUgfCB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGV0IGFmdGVyVG9rZW46IENvb3JkaW5hdGUgfCB1bmRlZmluZWQ7XHJcbiAgICAgICAgbGV0IHNsb3BlO1xyXG5cclxuICAgICAgICB0aGlzLmNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgY29vcmRpbmF0ZSBpbnN0YW5jZW9mIENvb3JkaW5hdGUmJmNvb3JkaW5hdGUubW9kZT09PVwibm9kZS1pbmxpbmVcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBjb29yZGluYXRlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlIHR5cGVvZiBjb29yZGluYXRlPT09XCJzdHJpbmdcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSAvKC0tXFwrXFwrfC0tXFwrKS8udGVzdChjb29yZGluYXRlKT9cIi0tXCI6Y29vcmRpbmF0ZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz1gKCR7Y29vcmRpbmF0ZS50b1N0cmluZygpfSlgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRm9ybWF0VGlrempheCB7XHJcblx0c291cmNlOiBzdHJpbmc7XHJcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcclxuICAgIG1pZFBvaW50OiBBeGlzO1xyXG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcclxuICAgIGRlYnVnSW5mbyA9IFwiXCI7XHJcbiAgICBcclxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZ3xBcnJheTxUb2tlbj4pIHtcclxuICAgICAgICBpZih0eXBlb2Ygc291cmNlPT09XCJzdHJpbmdcIil7XHJcblx0XHR0aGlzLnNvdXJjZSA9IHRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcclxuICAgICAgICB0aGlzLnRva2VuaXplKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgdGhpcy50b2tlbnM9c291cmNlXHJcblxyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnNvdXJjZTtcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmZpbmRNaWRwb2ludCgpO1xyXG4gICAgICAgIHRoaXMuYXBwbHlQb3N0UHJvY2Vzc2luZygpO1xyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz1cIlxcblxcbnRoaXMubWlkUG9pbnQ6XFxuXCIrSlNPTi5zdHJpbmdpZnkodGhpcy5taWRQb2ludCxudWxsLDEpK1wiXFxuXCJcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXHJcblxyXG4gICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcclxuXHR9XHJcbiAgICBcclxuICAgIHRpZHlUaWt6U291cmNlKHRpa3pTb3VyY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XHJcbiAgICAgICAgdGlrelNvdXJjZSA9IHRpa3pTb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHRpa3pTb3VyY2Uuc3BsaXQoXCJcXG5cIik7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpOztcclxuICAgIH1cclxuXHJcbiAgICBhcHBseVBvc3RQcm9jZXNzaW5nKCl7XHJcbiAgICAgICAgZm9yKGxldCBpPTA7aTx0aGlzLnRva2Vucy5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgZ2V0Q29kZSgpe1xyXG4gICAgICAgIHJldHVybiBnZXRQcmVhbWJsZSgpK3RoaXMucHJvY2Vzc2VkQ29kZStcIlxcblxcXFxlbmR7dGlrenBpY3R1cmV9XFxcXGVuZHtkb2N1bWVudH1cIjtcclxuICAgIH1cclxuICAgIHRva2VuaXplKCkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHMtLC46fGA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcclxuICAgICAgICBjb25zdCBjID0gU3RyaW5nLnJhd2BbJChdezAsMn1bJHtjYX1dK1spJF17MCwyfXxcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K10rXFwoWyR7Y2F9XStcXClcXCRgO1xyXG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB3aXRoIGVzY2FwZWQgY2hhcmFjdGVycyBmb3Igc3BlY2lmaWMgbWF0Y2hpbmdcclxuICAgICAgICBjb25zdCBjbiA9IFN0cmluZy5yYXdgW1xcd19cXGRcXHNdYDsgLy8gQ29vcmRpbmF0ZSBuYW1lXHJcbiAgICAgICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXFwkW1xcd1xcZFxcc1xcLSwuOighKVxcLVxce1xcfVxcK1xcXFxdKlxcJHxbXFx3XFxkXFxzXFwtLC46KCEpX1xcLVxcK1xcXFxdKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcbiAgICAgICAgY29uc3QgZiA9IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOy4mKlxce1xcfSVcXC08Pl1gOyAvLyBGb3JtYXR0aW5nIHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgY29vclJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBzZSA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxccypcXCgqKCR7Y259KVxcKSpcXHMqYXRcXHMqXFwoKCR7Y30pXFwpXFxzKlxcWygke2Z9KilcXF1cXHMqXFx7KCR7dH0pXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHh5YXhpc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx4eWF4aXN7KCR7dH0pfXsoJHt0fSl9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgbWFzc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxtYXNzXFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KC1cXHx8XFx8fD4pezAsMX1cXH1cXHsoW1xcZC5dKilcXH1gLFwiZ1wiKTtcclxuXHJcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtjb29yUmVnZXgsIHNlLCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4XTtcclxuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XHJcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcclxuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGEuaW5kZXggfHwgMCkgLSAoYi5pbmRleCB8fCAwKSk7XHJcblxyXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxyXG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbNV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzRdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFsyXX0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgpLmFkZEluZm8oaSxcImNvb3JkaW5hdGVcIix0aGlzKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZHJhd1wiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHtmb3JtYXR0aW5nOiBtYXRjaFsxXSxkcmF3OiBtYXRjaFsyXX0sIHRoaXMpKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcclxuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKGRpc3NlY3RYWWF4aXMobWF0Y2gpKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxncmlkXCIpKSB7XHJcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XHJcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzNdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX1cclxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSgpLmFkZEluZm8oaSxcIm5vZGVcIix0aGlzKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7LypcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XHJcbiAgICAgICAgICAgICAgdHlwZTogXCJjaXJjbGVcIixcclxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSxcclxuICAgICAgICAgICAgICBjb29yZGluYXRlczogW1xyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsxXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsyXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFszXSwgdGhpcy50b2tlbnMpLFxyXG4gICAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgIH0pOyovXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xyXG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLCBsYWJlbDogbWF0Y2hbMl19XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoKS5hZGRJbmZvKGksXCJub2RlLW1hc3NcIix0aGlzLHthbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KSlcclxuXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcdmVjXCIpKSB7XHJcbiAgICAgICAgICAgIG1hdGNoWzJdPWAoJHttYXRjaFsxXX0pLS0rbm9kZVtdeyR7bWF0Y2hbM119fSgke21hdGNoWzJdfSlgXHJcbiAgICAgICAgICAgIG1hdGNoWzFdPW1hdGNoWzRdKycsLT4nXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcobWF0Y2gsdGhpcykpXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZmluZE1pZHBvaW50KCkge1xyXG4gICAgICAgIC8qbGV0IGNvb3JkaW5hdGVzID0gdGhpcy50b2tlbnMuZmlsdGVyKCh0b2tlbjogVG9rZW4pID0+IHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSk7XHJcbiAgICAgICAgdGhpcy50b2tlbnNcclxuICAgICAgICAuZmlsdGVyKCh0b2tlbjogVG9rZW4pID0+IHRva2VuIGluc3RhbmNlb2YgRHJhdylcclxuICAgICAgICAuZm9yRWFjaCgob2JqZWN0OiBEcmF3KSA9PiB7XHJcbiAgICAgICAgICAgIGNvb3JkaW5hdGVzID0gY29vcmRpbmF0ZXMuY29uY2F0KFxyXG4gICAgICAgICAgICAgICAgb2JqZWN0LmNvb3JkaW5hdGVzLmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xyXG4gICAgICAgIGNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IHRva2VuKSA9PiB7XHJcbiAgICAgICAgICBzdW1PZlggKz0gTnVtYmVyKGNvb3JkaW5hdGUuWCk7XHJcbiAgICAgICAgICBzdW1PZlkgKz0gTnVtYmVyKGNvb3JkaW5hdGUuWSk7IFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB0aGlzLm1pZFBvaW50PW5ldyBBeGlzKCk7XHJcbiAgICAgICAgdGhpcy5taWRQb2ludC5hZGRDYXJ0ZXNpYW4oXHJcbiAgICAgICAgICAgIHN1bU9mWCAvIGNvb3JkaW5hdGVzLmxlbmd0aCE9PTA/Y29vcmRpbmF0ZXMubGVuZ3RoOjFcclxuICAgICAgICAgICAgLHN1bU9mWSAvIGNvb3JkaW5hdGVzLmxlbmd0aCE9PTA/Y29vcmRpbmF0ZXMubGVuZ3RoOjFcclxuICAgICAgICApKi9cclxuICAgIH1cclxuXHJcbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3Qgb2cgPSB0aGlzLnRva2Vucy5zbGljZSgpLnJldmVyc2UoKS5maW5kKFxyXG4gICAgICAgICAgICAodG9rZW46IFRva2VuKSA9PlxyXG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gb2cgaW5zdGFuY2VvZiBDb29yZGluYXRlID8gb2cuY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIFxyXG4gICAgYXBwbHlRdWFkcmFudHMoKSB7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgICAgaWYgKHR5cGVvZiB0b2tlbiA9PT0gXCJvYmplY3RcIiAmJiB0b2tlbiAhPT0gbnVsbCYmdG9rZW4udHlwZT09PVwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICAgICAgICAgIHRva2VuLmFkZFF1YWRyYW50KHRoaXMubWlkUG9pbnQpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XHJcbiAgICAgICAgY29uc3QgZXh0cmVtZVhZPWdldEV4dHJlbWVYWSh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG5cclxuICAgICAgICAgICAgaWYodG9rZW4udG9TdHJpbmcoKSl7XHJcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGRpc3NlY3RYWWF4aXMobWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkpIHtcclxuICAgIGxldCBYbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiLCBZbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiO1xyXG5cclxuICAgIGlmIChtYXRjaFsxXSAmJiBtYXRjaFsyXSkge1xyXG4gICAgICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcclxuICAgICAgICBZbm9kZSA9IG1hdGNoWzJdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XHJcbiAgICAgICAgWG5vZGU9WG5vZGVbMF0uc3Vic3RyaW5nKDEsWG5vZGUubGVuZ3RoKVxyXG4gICAgICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcInh5YXhpc1wiLFxyXG4gICAgICAgIFhmb3JtYXR0aW5nOiBtYXRjaFsxXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICAgICAgWWZvcm1hdHRpbmc6IG1hdGNoWzJdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcclxuICAgICAgICB4RGlyZWN0aW9uOiBtYXRjaFsxXSAmJiAvLT4vLnRlc3QobWF0Y2hbMV0pID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIsXHJcbiAgICAgICAgeURpcmVjdGlvbjogbWF0Y2hbMl0gJiYgLy0+Ly50ZXN0KG1hdGNoWzJdKSA/IFwiZG93blwiIDogXCJ1cFwiLFxyXG4gICAgICAgIFhub2RlOiBYbm9kZSxcclxuICAgICAgICBZbm9kZTogWW5vZGUsXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcclxubGV0IG1heFggPSAtSW5maW5pdHk7XHJcbmxldCBtYXhZID0gLUluZmluaXR5O1xyXG5sZXQgbWluWCA9IEluZmluaXR5O1xyXG5sZXQgbWluWSA9IEluZmluaXR5O1xyXG5cclxudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuICAgIGlmICh0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcclxuICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XHJcblxyXG4gICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcclxuICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XHJcbiAgICB9XHJcbn0pO1xyXG5cclxucmV0dXJuIHtcclxuICAgIG1heFgsbWF4WSxtaW5YLG1pblksXHJcbn07XHJcbn1cclxuXHJcblxyXG5cclxuXHJcbi8qXHJcbmZ1bmN0aW9uIGdlbmVyYXRlRm9ybWF0dGluZyhjb29yZGluYXRlOiBDb29yZGluYXRlKXtcclxuICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZS5sYWJlbCAhPT0gXCJzdHJpbmdcIil7IHJldHVybiBcIlwiOyB9XHJcbiAgICBjb25zdCBmb3JtYXR0aW5nID0gY29vcmRpbmF0ZS5mb3JtYXR0aW5nPy5zcGxpdChcIixcIikgfHwgW107XHJcbiAgICBpZiAoZm9ybWF0dGluZy5zb21lKCh2YWx1ZTogc3RyaW5nKSA9PiAvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLy50ZXN0KHZhbHVlKSkpIHtcclxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZS5mb3JtYXR0aW5nO1xyXG4gICAgfVxyXG4gICAgaWYoZm9ybWF0dGluZy5sZW5ndGg+MCYmIWZvcm1hdHRpbmdbZm9ybWF0dGluZy5sZW5ndGgtMV0uZW5kc1dpdGgoXCIsXCIpKXtmb3JtYXR0aW5nLnB1c2goXCIsXCIpfVxyXG4gICAgc3dpdGNoKGNvb3JkaW5hdGUucXVhZHJhbnQpe1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSByaWdodCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSBsZWZ0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IGxlZnQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDQ6IFxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IHJpZ2h0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZy5qb2luKFwiXCIpO1xyXG59XHJcbiovXHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoKTpzdHJpbmd7XHJcbiAgICBjb25zdCBhbmc9XCJcXFxcdGlrenNldHthbmcvLnN0eWxlIDIgYXJncz17ZmlsbD1ibGFjayE1MCxvcGFjaXR5PTAuNSx0ZXh0IG9wYWNpdHk9MC45LGRyYXc9b3JhbmdlLDwtPixhbmdsZSBlY2NlbnRyaWNpdHk9IzEsYW5nbGUgcmFkaXVzPSMyY20sdGV4dD1vcmFuZ2UsZm9udD1cXFxcbGFyZ2V9LGFuZy8uZGVmYXVsdD17MS42fXswLjV9fVwiXHJcbiAgXHJcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxyXG4gIFxyXG4gICAgY29uc3QgYXJyPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFycn1bOF17XFxcXGNvb3JkaW5hdGUgKDIpIGF0ICgkKCMyKSEjNyEoIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDEpIGF0ICgkKDIpISM1bW0hOTA6KCMzKSQpO1xcXFxjb29yZGluYXRlICgzKSBhdCAoJCgyKSEjNW1tKyM0Y20hIzg6KCMzKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCw8LV0gKDEpLS0oMylub2RlIFtwb3M9IzZdIHtcXFxcbGFyZ2UgIzF9O31cIiBcclxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxyXG4gICAgY29uc3Qgc3ByaW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXHNwcmluZ31bNF17XFxcXHRpa3ptYXRoe2Nvb3JkaW5hdGUgXFxcXHN0YXJ0LCBcXFxcZG9uZTtcXFxcc3RhcnQgPSAoIzEpO1xcXFxkb25lID0gKCMyKTt9XFxcXGRyYXdbdGhpY2tdICgkKFxcXFxzdGFydCkgKyAoLTEuNSwwKSQpIC0tKysoMywwKTtcXFxcZHJhdyAoXFxcXHN0YXJ0KSAtLSsgKDAsLTAuMjVjbSk7XFxcXGRyYXcgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgrMGNtLFxcXFxkb25leSswLjI1Y20pJCktLSsoMCwtMC4yNSk7XFxcXGRyYXdbZGVjb3JhdGlvbj17YXNwZWN0PTAuMywgc2VnbWVudCBsZW5ndGg9MywgYW1wbGl0dWRlPTJtbSxjb2lsLH0sZGVjb3JhdGVdIChcXFxcc3RhcnR4LFxcXFxzdGFydHktMC4yNWNtKSAtLSgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSswLjI1Y20pJClub2RlW21pZHdheSxyaWdodD0wLjI1Y20sYmxhY2tdeyM0fTtcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KSQpeyMzfTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHRhYmxlPVwiXFxcXHRpa3pzZXR7IHRhYmxlLy5zdHlsZT17bWF0cml4IG9mIG5vZGVzLHJvdyBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsY29sdW1uIHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxub2Rlcz17cmVjdGFuZ2xlLGRyYXc9YmxhY2ssYWxpZ249Y2VudGVyfSxtaW5pbXVtIGhlaWdodD0xLjVlbSx0ZXh0IGRlcHRoPTAuNWV4LHRleHQgaGVpZ2h0PTJleCxub2RlcyBpbiBlbXB0eSBjZWxscyxldmVyeSBldmVuIHJvdy8uc3R5bGU9e25vZGVzPXtmaWxsPWdyYXkhNjAsdGV4dD1ibGFjayx9fSxjb2x1bW4gMS8uc3R5bGU9e25vZGVzPXt0ZXh0IHdpZHRoPTVlbSxmb250PVxcXFxiZnNlcmllc319LHJvdyAxLy5zdHlsZT17bm9kZXM9e2ZvbnQ9XFxcXGJmc2VyaWVzfX19fVwiXHJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXHJcbiAgICAvL2NvbnN0IG1hc3M9YFxcXFxkZWZcXFxcbWFzcyMxIzJ7XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgjMSl7IzJ9O31gXHJcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXHJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcclxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcclxufSJdfQ==