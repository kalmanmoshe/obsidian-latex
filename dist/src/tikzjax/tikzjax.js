import { MarkdownView, WorkspaceWindow } from "obsidian";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { cartesianToPolar, findIntersectionPoint, findSlope, polarToCartesian, toNumber } from "src/mathParser/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";
import { FormatTikzjax } from "./interpret/tokenizeTikzjax.js";
import { mapBrackets } from "src/utils/ParenUtensils.js";
import { BasicTikzToken } from "src/basicToken.js";
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
                const tikzjax = new FormatTikzjax(source, false);
                icon.onclick = () => new DebugModal(this.app, tikzjax.getCode(this.app)).open();
                script.setText(tikzjax.getCode(this.app));
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
export const arrToRegexString = (arr) => '(' + arr.join('|') + ')';
export function regExp(pattern, flags = '') {
    if (pattern instanceof RegExp) {
        pattern = pattern.source;
    }
    else if (Array.isArray(pattern)) {
        pattern = arrToRegexString(pattern);
    }
    // Create and return the RegExp
    return new RegExp(String.raw `${pattern}`, flags);
}
function getRegex() {
    const basic = String.raw `[\w\d\s-,.:]`;
    return {
        basic: basic,
        merge: String.raw `-\||\|-|![\d.]+!|\+|-`,
        //coordinate: new RegExp(String.raw`(${basic}+|1)`),
        coordinateName: String.raw `[\w_\d\s]`,
        text: String.raw `[\w\s-,.:'\$\(!\)_+\\{}=]`,
        formatting: String.raw `[\w\s\d=:,!';&*{}()%-<>]`
    };
}
function findBeforeAfterAxis(axes, index) {
    let beforeIndex = axes.slice(0, index).findLastIndex((axis) => axis instanceof Axis);
    let afterIndex = axes.slice(index + 1).findIndex((axis) => axis instanceof Axis);
    // Adjust `afterIndex` since we sliced from `index + 1`
    if (afterIndex !== -1) {
        afterIndex += index + 1;
    }
    // Wrap around if not found
    if (beforeIndex === -1) {
        beforeIndex = axes.findLastIndex((axis) => axis instanceof Axis);
    }
    if (afterIndex === -1) {
        afterIndex = axes.findIndex((axis) => axis instanceof Axis);
    }
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
    quadrant;
    constructor(cartesianX, cartesianY, polarLength, polarAngle, name) {
        if (cartesianX !== undefined)
            this.cartesianX = cartesianX;
        if (cartesianY !== undefined)
            this.cartesianY = cartesianY;
        if (polarLength !== undefined)
            this.polarLength = polarLength;
        if (polarAngle !== undefined)
            this.polarAngle = polarAngle;
        this.name = name;
    }
    clone() {
        return new Axis(this.cartesianX, this.cartesianY, this.polarLength, this.polarAngle, this.name);
    }
    parseInput(input) {
        const axes = [];
        const bracketMap = mapBrackets('Parentheses_open', input);
        axes.push(this.processIndividual(input));
        if (axes.length === 1)
            return axes[0];
    }
    processIndividual(input) {
        let axis = new Axis();
        const isCartesian = input.some((token) => token.name === 'Comma');
        input = input.filter((token) => token.type !== 'Syntax');
        if (isCartesian && input.length === 2) {
            axis.cartesianX = input[0].value;
            axis.cartesianY = input[1].value;
        }
        return axis;
    }
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
                    if (tokens) { }
                    //axis = tokens.findOriginalValue(match)?.axis;
                    else
                        throw new Error(`Tried to find original coordinate value while not being provided with tokens`);
                    if (!axis) {
                        throw new Error(`Couldn't find the coordinate ${match} from ${coordinate}`);
                        return;
                    }
                    axis.name = match;
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
    mergeAxis(axes) {
        if (!axes.some((axis) => typeof axis === "string")) {
            Object.assign(this, axes[0].clone());
            return;
        }
        for (const axis of axes) {
            if (typeof axis === "string") {
                continue;
            }
            axis.name = undefined;
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
            fullMatch: match[0].replace(/-$/g, ""), // Remove trailing hyphen only
            index: match.index ?? 0,
            length: match[0].length - (match[0].match(/-$/) ? 1 : 0)
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
    addQuadrant(midPoint) {
        const x = midPoint.cartesianX > this.cartesianX;
        const y = midPoint.cartesianY > this.cartesianY;
        this.quadrant = x ? y ? 1 : 4 : y ? 2 : 3;
    }
    toStringSVG(bounds) {
        const normalizedX = ((this.cartesianX - bounds.min.cartesianX) / (bounds.max.cartesianX - bounds.min.cartesianX)) * bounds.getWidth();
        const normalizedY = bounds.getHeight() - ((this.cartesianY - bounds.min.cartesianY) / (bounds.max.cartesianY - bounds.min.cartesianY)) * bounds.getHeight();
        return `${normalizedX} ${normalizedY}`;
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
export function toPoint(value, format) {
    switch (format) {
        case "Point":
            return value;
        case "cm":
            return value * 28.346;
        case "mm":
            return value * 2.8346;
        default:
            throw new Error("unknon format");
    }
}
function matchKeyWithValue(key) {
    const valueMap = {
        "anchor": "anchor=",
        "rotate": "rotate=",
        "lineWidth": "line width=",
        "fill": "fill=",
        "fillOpacity": "fill opacity=",
        "textOpacity": "text opacity=",
        "textColor": "text color=",
        "draw": "draw=",
        "text": "text=",
        "pos": "pos=",
        "scale": "scale=",
        "decorate": "decorate",
        "sloped": "sloped",
        "decoration": "decoration=",
        "brace": "brace",
        "amplitude": "amplitude=",
        "angleRadius": "angle radius=",
        "angleEccentricity": "angle eccentricity=",
        "font": "font=",
        "picText": "pic text=",
        "label": "label=",
        "freeFormText": ':',
    };
    return valueMap[key] || '';
}
const defaultValues = {
    freeFormText: "",
    color: "",
    opacity: 1,
};
function lineWidthConverter(width) {
    return Number(width.replace(/ultra\s*thin/, "0.1")
        .replace(/very\s*thin/, "0.2")
        .replace(/thin/, "0.4")
        .replace(/semithick/, "0.6")
        .replace(/thick/, "0.8")
        .replace(/very\s*thick/, "1.2")
        .replace(/ultra\s*thick/, "1.6"));
}
export class Formatting {
    // importent needs to be forst
    path;
    scale;
    rotate;
    lineWidth = 0.4;
    textOpacity;
    opacity;
    fillOpacity;
    pos;
    angleEccentricity;
    angleRadius;
    levelDistance;
    mode;
    anchor;
    color;
    textColor;
    fill;
    arrow;
    draw;
    text;
    tikzset;
    position;
    lineStyle;
    font;
    picText;
    sloped;
    decorate;
    label;
    decoration;
    constructor(formatting, mode) {
        if (mode)
            this.mode = mode;
        this.assignFormatting(formatting || []);
    }
    assignFormatting(formattingArr, targetScope = this) {
        for (const { key, value } of formattingArr) {
            const normalizedKey = Object.keys(targetScope).find((prop) => prop.toLowerCase() === key.toLowerCase()) || key;
            if (this.isNested(value)) {
                targetScope[normalizedKey] = targetScope[normalizedKey] || this.createNested(normalizedKey);
                this.assignFormatting(value, targetScope[normalizedKey]);
                continue;
            }
            else {
                targetScope[normalizedKey] = value;
            }
        }
    }
    setProperty(scope, key, value) {
        if (typeof scope === "object" && scope !== null) {
            scope[key] = value;
        }
        else {
            console.error("Invalid scope provided. Expected an object but received:", scope);
        }
    }
    createNested(key) {
        switch (key) {
            case 'label':
                return { color: undefined, opacity: undefined, freeFormText: undefined };
            case 'decoration':
                return {
                    brace: undefined,
                    coil: false,
                    amplitude: undefined,
                    aspect: undefined,
                    segmentLength: undefined,
                    decoration: undefined,
                };
            default:
                return {};
        }
    }
    isNested(value) {
        return Array.isArray(value) && value.some((item) => item.key && item.value);
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
        //this.setProperty(key, value, nestedKey);
    }
    addTikzset(splitFormatting) {
        const a = splitFormatting.find((item) => item.match(/mass|ang|helplines/));
        if (!a && !this.tikzset)
            return;
        if (a)
            this.tikzset = a;
        switch (this.tikzset) {
            case "mass":
                this.fill = "yellow!60";
                this.path = "draw";
                this.text = "black";
                break;
            case "vec":
                this.arrow = '->';
                break;
            case "helplines":
                this.lineWidth = 0.4;
                this.draw = 'gray';
                break;
            case "ang":
                this.path = 'draw';
                this.fill = 'black!50';
                this.fillOpacity = 0.5;
                this.draw = 'orange';
                this.arrow = '<->';
                this.angleEccentricity = 1.6;
                this.angleRadius = toPoint(0.5, "cm");
                this.text = 'orange';
                this.font = '\\large';
                this.textOpacity = 0.9;
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
        const slope = findSlope(before, after);
        this.sloped = slope !== 0 && slope !== Infinity && slope !== -Infinity;
        let quadrant;
        if (edge1 !== edge2)
            quadrant = edge1 + edge2;
        else
            quadrant = edge1;
        //sint parallel to Y axis
        if (slope !== Infinity && slope !== -Infinity) {
            this.position = quadrant.replace(/(3|4)/, "below").replace(/(1|2)/, "above").replace(/(belowabove|abovebelow)/, "");
        }
        //isnt parallel to X axis
        if (slope !== 0) {
            this.position = this.position ? this.position : '';
            this.position += quadrant.replace(/(1|4)/, "right").replace(/(2|3)/, "left").replace(/(rightleft|leftright)/, "");
        }
        this.position = this.position?.replace(/[\d]+/g, "").replace(/(below|above)(right|left)/, "$1 $2");
    }
    interpretFormatting(formattingString) {
        const splitFormatting = formattingString.replace(/\s/g, "").match(/(?:{[^}]*}|[^,{}]+)+/g) || [];
        this.addTikzset(splitFormatting);
        const patterns = {
            "linewidth": (value) => this.split("lineWidth", value),
            "fill=": (value) => this.split("fill", value),
            "^fillopacity": (value) => this.split("fillOpacity", value),
            "^(->|<-|-*{Stealth}-*)$": (value) => { this.arrow = value; },
            "^(above|below|left|right){1,2}$": (value) => { this.position = value.replace(/(above|below|left|right)/, "$1 "); },
            "^pos=": (value) => this.split("pos", value),
            "^draw=": (value) => this.split("draw", value),
            "^decorate$": () => { this.decorate = true; },
            "^text=": (value) => this.split("text", value),
            "^anchor=": (value) => this.split("anchor", value),
            "^\"^\"$": () => this.setProperty("label", true, "freeFormText"),
            "^brace$": () => this.setProperty("decoration", true, "brace"),
            "^amplitude": (value) => this.split("decoration", value, "amplitude"),
            "^draw$": (value) => { this.path = value; },
            "^(red|blue|pink|black|white|[!\\d.]+){1,5}$": (value) => { this.color = value; },
            "^(dotted|dashed|smooth|densely|loosely){1,2}$": (value) => { this.lineStyle = value.replace(/(densely|loosely)/, "$1 "); },
        };
        splitFormatting.forEach(formatting => {
        });
    }
    toString(obj) {
        let string = obj ? '{' : '[';
        for (const [key, value] of Object.entries(obj ? obj : this)) {
            if (key.match(/^(mode|tikzset)$/)) {
                continue;
            }
            if (typeof value === 'object' && value) {
                string += matchKeyWithValue(key) + this.toString(value) + ',';
            }
            else if (value) {
                string += matchKeyWithValue(key) + (typeof value === "boolean" ? '' : value) + ',';
            }
        }
        return string + (obj ? '}' : ']');
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
    formatting;
    variable;
    label;
    constructor(mode, axis, formatting, variable, label) {
        this.mode = mode;
        this.axis = axis;
        this.formatting = formatting;
        this.variable = variable;
        this.label = label;
    }
    interpretCoordinate(coordinates) {
        const formatting = coordinates.find(coor => coor instanceof Formatting);
        const axis = coordinates.find(coor => coor instanceof Axis);
        const variable = coordinates.find(coor => coor?.type === 'variable').value;
        this.formatting = formatting;
        this.axis = axis;
        this.variable = variable;
        return this;
    }
    clone() {
        return new Coordinate(this.mode, this.axis ? this.axis.clone() : undefined, this.formatting, this.variable, this.label);
    }
    addAxis(cartesianX, cartesianY, polarLength, polarAngle) {
        this.axis = new Axis(cartesianX, cartesianY, polarLength, polarAngle);
    }
    toString() {
        console.log(this.mode);
        switch (this.mode) {
            case "coordinate":
                if (this.axis)
                    return `\\coordinate ${this.formatting?.toString() || ''} (${this.variable || ""}) at (${this.axis.toString()});`;
            case "node":
                if (this.axis) { }
            //return `\\node ${this.coordinateName?'('+this.coordinateName+')':''} at (${this.axis.toString()}) ${this.formatting?.toString()||''} {${this.label}};`
            case "node-inline":
                return `node ${this.formatting?.toString() || ''} {${this.label || ''}}`;
            default:
                throw new Error("Couldn't find mode at to string coordinate");
                break;
        }
    }
}
export class Draw {
    mode;
    formatting;
    coordinates = [];
    constructor(mode, formatting, coordinates, tokens) {
        ;
        this.mode = mode;
        if (formatting)
            this.formatting = formatting;
        if (coordinates)
            this.coordinates = coordinates;
    }
    createFromArray(arr) {
    }
    fillCoordinates(schematic, tokens) {
        if (schematic[0] instanceof Formatting) {
            this.formatting = schematic[0];
            schematic.splice(0, 1);
        }
        const referenceFirstAxisMap = schematic
            .map((coor, index) => (coor instanceof BasicTikzToken && coor.getStringValue() === 'ReferenceFirstAxis' ? index : null))
            .filter((t) => t !== null);
        const referenceLastAxisMap = schematic
            .map((coor, index) => (coor instanceof BasicTikzToken && coor.getStringValue() === 'ReferenceLastAxis' ? index : null))
            .filter((t) => t !== null);
        const mappedReferences = referenceFirstAxisMap.map(index => {
            schematic[index].name = 'AxisConnecter';
            const nextAxisIndex = schematic.slice(index + 1).findIndex(item => item instanceof Axis);
            const nextAxis = nextAxisIndex !== -1 ? schematic[index + 1 + nextAxisIndex] : null;
            return nextAxis;
        });
        const relationships = referenceLastAxisMap.map(index => {
            schematic[index].name = 'AxisConnecter';
            const nextAxisIndex = schematic.slice(index + 1).findIndex(item => item instanceof Axis);
            const nextAxis = nextAxisIndex !== -1 ? schematic[index + 1 + nextAxisIndex] : null;
            const previousAxisIndex = schematic
                .slice(0, index)
                .reverse()
                .findIndex(item => item instanceof Axis);
            const previousAxis = previousAxisIndex !== -1 ? schematic[index - 1 - previousAxisIndex] : null;
            return {
                referenceFirstAxis: schematic[index],
                previousAxis,
                nextAxis,
            };
        });
        if (mappedReferences.length > 0) {
            const firstAxis = schematic.find(t => t instanceof Axis);
            mappedReferences.forEach(axis => {
                axis.complexCartesianAdd(firstAxis, "addition");
            });
        }
        this.coordinates = schematic;
        return this;
        /*
        const coorArr: Array<Token>=[];
        for (let i = 0; i < schematic.length; i++) {
            if (schematic[i].type === "coordinate") {
                let previousFormatting;

                if (i > 0 && schematic[i - 1].type === "formatting") {
                    previousFormatting = schematic[i - 1].value;
                } else if (i > 1 && schematic[i - 1].type === "node" && schematic[i - 2].type === "formatting") {
                    previousFormatting = schematic[i - 2].value;
                }
                coorArr.push(new Axis().universal(schematic[i].value, tokens, coorArr, previousFormatting, ));
            } else if(schematic[i].type === "node"){
                coorArr.push(new Coordinate({label: schematic[i].value,formatting: new Formatting("node-inline",{},schematic[i].formatting),mode: "node-inline"}));
            }
            else{
                coorArr.push(schematic[i].value);
            }
        }
        return coorArr;*/
    }
    getSchematic(draw) {
        const regex = getRegex();
        const coordinatesArray = [];
        const nodeRegex = regExp(String.raw `node\s*\[?(${regex.formatting}*)\]?\s*{(${regex.text}*)}`);
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
    toStringDraw() {
        let result = `\\draw ${this.formatting?.toString()} `;
        this.coordinates.forEach((coordinate, index) => {
            switch (true) {
                case coordinate instanceof Coordinate && coordinate.mode === "node-inline": {
                    result += coordinate.toString();
                    break;
                }
                case coordinate instanceof BasicTikzToken: {
                    result += coordinate.toString();
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
    toStringPic() {
        let result = `\\draw pic ${this.formatting.toString() || ''} {angle = ${this.coordinates[0].name}--${this.coordinates[1].name}--${this.coordinates[2].name}} `;
        return result + ";";
    }
    toString() {
        if (this.mode === 'draw')
            return this.toStringDraw();
        if (this.mode === 'draw-pic-ang')
            return this.toStringPic();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBUyxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUluRCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMs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RUFBRSxLQUFLLEdBQXlCLEVBQUUsQ0FBQztJQUV2RSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUN2QixLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxJQUFFLEVBQUUsQ0FBQztRQUNwRCxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxJQUFFLEVBQUUsQ0FBQztRQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ3hDLEtBQUssR0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUE7SUFDNUMsQ0FBQztJQUVELE9BQU87UUFDSCxJQUFJLEVBQUUsUUFBUTtRQUNkLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLHdCQUF3QixFQUFFLEVBQUUsQ0FBQztRQUM1RCxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLENBQUM7UUFDNUQsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU87UUFDOUQsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDM0QsS0FBSyxFQUFFLEtBQUs7UUFDWixLQUFLLEVBQUUsS0FBSztLQUNmLENBQUM7QUFDTixDQUFDO0FBYUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQXdCRSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcCwgTWFya2Rvd25WaWV3LCBTY29wZSwgV29ya3NwYWNlV2luZG93IH0gZnJvbSBcIm9ic2lkaWFuXCI7XHJcbmltcG9ydCBNYXRoUGx1Z2luLCB7IFN2Z0JvdW5kcyB9IGZyb20gXCJzcmMvbWFpblwiO1xyXG5pbXBvcnQgeyBvcHRpbWl6ZSB9IGZyb20gXCIuL3N2Z28uYnJvd3Nlci5qc1wiO1xyXG4vLyBAdHMtaWdub3JlXHJcbmltcG9ydCB0aWt6amF4SnMgZnJvbSBcImlubGluZTouL3Rpa3pqYXguanNcIjtcclxuaW1wb3J0IHsgY2FydGVzaWFuVG9Qb2xhciwgZmluZEludGVyc2VjdGlvblBvaW50LCBmaW5kU2xvcGUsIHBvbGFyVG9DYXJ0ZXNpYW4sIHRvTnVtYmVyIH0gZnJvbSBcInNyYy9tYXRoUGFyc2VyL21hdGhVdGlsaXRpZXMuanNcIjtcclxuaW1wb3J0IHsgRGVidWdNb2RhbCB9IGZyb20gXCJzcmMvZGVzcGx5TW9kYWxzLmpzXCI7XHJcbmltcG9ydCB7IEZvcm1hdFRpa3pqYXggfSBmcm9tIFwiLi9pbnRlcnByZXQvdG9rZW5pemVUaWt6amF4LmpzXCI7XHJcbmltcG9ydCB7IG1hcEJyYWNrZXRzIH0gZnJvbSBcInNyYy91dGlscy9QYXJlblV0ZW5zaWxzLmpzXCI7XHJcbmltcG9ydCB7IEJhc2ljVGlrelRva2VuIH0gZnJvbSBcInNyYy9iYXNpY1Rva2VuLmpzXCI7XHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBUaWt6amF4IHtcclxuICAgIGFwcDogQXBwO1xyXG4gICAgcGx1Z2luOiBNYXRoUGx1Z2luO1xyXG4gICAgYWN0aXZlVmlldzogTWFya2Rvd25WaWV3IHwgbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCxwbHVnaW46IE1hdGhQbHVnaW4pIHtcclxuICAgICAgdGhpcy5hcHA9YXBwO1xyXG4gICAgICB0aGlzLmFjdGl2ZVZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xyXG4gICAgICB0aGlzLnBsdWdpbj1wbHVnaW47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJlYWR5TGF5b3V0KCl7XHJcbiAgICAgIHRoaXMucGx1Z2luLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKTtcclxuICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcIndpbmRvdy1vcGVuXCIsICh3aW4sIHdpbmRvdykgPT4ge1xyXG4gICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH0pKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtcclxuICAgICAgICBzLmlkID0gXCJ0aWt6amF4XCI7XHJcbiAgICAgICAgcy50eXBlID0gXCJ0ZXh0L2phdmFzY3JpcHRcIjtcclxuICAgICAgICBzLmlubmVyVGV4dCA9IHRpa3pqYXhKcztcclxuICAgICAgICBkb2MuYm9keS5hcHBlbmRDaGlsZChzKTtcclxuICAgICAgICBkb2MuYWRkRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcclxuICAgIH1cclxuICBcclxuICAgIHVubG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG4gICAgICAgIGNvbnN0IHMgPSBkb2MuZ2V0RWxlbWVudEJ5SWQoXCJ0aWt6amF4XCIpO1xyXG4gICAgICAgIHM/LnJlbW92ZSgpO1xyXG5cclxuICAgICAgICBkb2MucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcclxuICAgIH1cclxuICBcclxuICAgIGxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xyXG4gICAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gIFxyXG4gICAgdW5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcclxuICAgICAgICAgICAgdGhpcy51bmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gIFxyXG4gICAgZ2V0QWxsV2luZG93cygpIHtcclxuICAgICAgICBjb25zdCB3aW5kb3dzID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gcHVzaCB0aGUgbWFpbiB3aW5kb3cncyByb290IHNwbGl0IHRvIHRoZSBsaXN0XHJcbiAgICAgICAgd2luZG93cy5wdXNoKHRoaXMuYXBwLndvcmtzcGFjZS5yb290U3BsaXQud2luKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBAdHMtaWdub3JlIGZsb2F0aW5nU3BsaXQgaXMgdW5kb2N1bWVudGVkXHJcbiAgICAgICAgY29uc3QgZmxvYXRpbmdTcGxpdCA9IHRoaXMuYXBwLndvcmtzcGFjZS5mbG9hdGluZ1NwbGl0O1xyXG4gICAgICAgIGZsb2F0aW5nU3BsaXQuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAvLyBpZiB0aGlzIGlzIGEgd2luZG93LCBwdXNoIGl0IHRvIHRoZSBsaXN0IFxyXG4gICAgICAgICAgICBpZiAoY2hpbGQgaW5zdGFuY2VvZiBXb3Jrc3BhY2VXaW5kb3cpIHtcclxuICAgICAgICAgICAgICAgIHdpbmRvd3MucHVzaChjaGlsZC53aW4pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiB3aW5kb3dzO1xyXG4gICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgcmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCkge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihlbC5jcmVhdGVFbChcImRpdlwiKSwge1xyXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxyXG4gICAgICAgICAgICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdHJ5e1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcclxuICAgICAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aWt6amF4PW5ldyBGb3JtYXRUaWt6amF4KHNvdXJjZSxmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCx0aWt6amF4LmdldENvZGUodGhpcy5hcHApKS5vcGVuKCk7XHJcbiAgICAgICAgICAgICAgICBzY3JpcHQuc2V0VGV4dCh0aWt6amF4LmdldENvZGUodGhpcy5hcHApKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaChlKXtcclxuICAgICAgICAgICAgICAgIGVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvckRpc3BsYXkgPSBlbC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJtYXRoLWVycm9yLWxpbmVcIiB9KTtcclxuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5pbm5lclRleHQgPSBgRXJyb3I6ICR7ZS5tZXNzYWdlfWA7XHJcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuY2xhc3NMaXN0LmFkZChcImVycm9yLXRleHRcIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiVGlrWiBQcm9jZXNzaW5nIEVycm9yOlwiLCBlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgXHJcbiAgICAgIGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLnB1c2goe25hbWU6IFwiVGlrelwiLCBtaW1lOiBcInRleHQveC1sYXRleFwiLCBtb2RlOiBcInN0ZXhcIn0pO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIHJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvID0gd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8uZmlsdGVyKGVsID0+IGVsLm5hbWUgIT0gXCJUaWt6XCIpO1xyXG4gICAgICB9XHJcblxyXG4gIFxyXG4gICAgICBjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICBzdmcgPSBzdmcucmVwbGFjZUFsbCgvKFwiIzAwMFwifFwiYmxhY2tcIikvZywgXCJcXFwiY3VycmVudENvbG9yXFxcIlwiKVxyXG4gICAgICAgICAgICAgICAgLnJlcGxhY2VBbGwoLyhcIiNmZmZcInxcIndoaXRlXCIpL2csIFwiXFxcInZhcigtLWJhY2tncm91bmQtcHJpbWFyeSlcXFwiXCIpO1xyXG4gICAgICAgIHJldHVybiBzdmc7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICAgIHJldHVybiBvcHRpbWl6ZShzdmcsIHtwbHVnaW5zOlxyXG4gICAgICAgICAgICAgIFtcclxuICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJwcmVzZXQtZGVmYXVsdFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFudXBJRHM6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgfSk/LmRhdGE7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgcG9zdFByb2Nlc3NTdmcgPSAoZTogRXZlbnQpID0+IHtcclxuICBcclxuICAgICAgICAgIGNvbnN0IHN2Z0VsID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICBsZXQgc3ZnID0gc3ZnRWwub3V0ZXJIVE1MO1xyXG4gIFxyXG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpIHtcclxuICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcclxuICBcclxuICAgICAgICAgIHN2Z0VsLm91dGVySFRNTCA9IHN2ZztcclxuICAgIH1cclxufVxyXG5leHBvcnQgY29uc3QgYXJyVG9SZWdleFN0cmluZyA9IChhcnI6IEFycmF5PHN0cmluZz4pID0+ICcoJyArIGFyci5qb2luKCd8JykgKyAnKSc7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVnRXhwKHBhdHRlcm46IHN0cmluZyB8IFJlZ0V4cCB8IEFycmF5PHN0cmluZz4sIGZsYWdzOiBzdHJpbmcgPSAnJyk6IFJlZ0V4cCB7XHJcbiAgICBpZiAocGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkge1xyXG4gICAgICAgIHBhdHRlcm4gPSBwYXR0ZXJuLnNvdXJjZTtcclxuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwYXR0ZXJuKSkge1xyXG4gICAgICAgIHBhdHRlcm4gPSBhcnJUb1JlZ2V4U3RyaW5nKHBhdHRlcm4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENyZWF0ZSBhbmQgcmV0dXJuIHRoZSBSZWdFeHBcclxuICAgIHJldHVybiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgJHtwYXR0ZXJufWAsIGZsYWdzKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldFJlZ2V4KCl7XHJcbiAgICBjb25zdCBiYXNpYyA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjpdYDtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgYmFzaWM6IGJhc2ljLFxyXG4gICAgICAgIG1lcmdlOiBTdHJpbmcucmF3YC1cXHx8XFx8LXwhW1xcZC5dKyF8XFwrfC1gLFxyXG4gICAgICAgIC8vY29vcmRpbmF0ZTogbmV3IFJlZ0V4cChTdHJpbmcucmF3YCgke2Jhc2ljfSt8MSlgKSxcclxuICAgICAgICBjb29yZGluYXRlTmFtZTogU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gLFxyXG4gICAgICAgIHRleHQ6IFN0cmluZy5yYXdgW1xcd1xccy0sLjonXFwkXFwoIVxcKV8rXFxcXHt9PV1gLFxyXG4gICAgICAgIGZvcm1hdHRpbmc6IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOyYqe30oKSUtPD5dYFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuaW50ZXJmYWNlIHRva2VuICB7XHJcbiAgICBYPzogbnVtYmVyO1xyXG4gICAgWT86IG51bWJlcjtcclxuICAgIHR5cGU/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcclxuICAgIGNvb3JkaW5hdGVzPzogYW55O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+LCBpbmRleDogbnVtYmVyKTogeyBiZWZvcmU6IG51bWJlciwgYWZ0ZXI6IG51bWJlciB9IHtcclxuICAgIFxyXG4gICAgbGV0IGJlZm9yZUluZGV4ID0gYXhlcy5zbGljZSgwLCBpbmRleCkuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICBsZXQgYWZ0ZXJJbmRleCA9IGF4ZXMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xyXG5cclxuICAgIC8vIEFkanVzdCBgYWZ0ZXJJbmRleGAgc2luY2Ugd2Ugc2xpY2VkIGZyb20gYGluZGV4ICsgMWBcclxuICAgIGlmIChhZnRlckluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIGFmdGVySW5kZXggKz0gaW5kZXggKyAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFdyYXAgYXJvdW5kIGlmIG5vdCBmb3VuZFxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIGJlZm9yZUluZGV4ID0gYXhlcy5maW5kTGFzdEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoYWZ0ZXJJbmRleCA9PT0gLTEpIHtcclxuICAgICAgICBhZnRlckluZGV4ID0gYXhlcy5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgfVxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSB8fCBhZnRlckluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgdmFsaWQgQXhpcyBvYmplY3RzLlwiKTtcclxuICAgIH1cclxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gYWZ0ZXJJbmRleCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlByYWlzZWQgYXhpcyBhcyBzYW1lIHRva2VuXCIpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHsgYmVmb3JlOiBiZWZvcmVJbmRleCwgYWZ0ZXI6IGFmdGVySW5kZXggfTtcclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBBeGlzIHtcclxuICAgIGNhcnRlc2lhblg6IG51bWJlcjtcclxuICAgIGNhcnRlc2lhblk6IG51bWJlcjtcclxuICAgIHBvbGFyQW5nbGU6IG51bWJlcjtcclxuICAgIHBvbGFyTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBuYW1lPzogc3RyaW5nO1xyXG4gICAgcXVhZHJhbnQ/OiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIsbmFtZT86IHN0cmluZykge1xyXG4gICAgICAgIGlmIChjYXJ0ZXNpYW5YICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWCA9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgaWYgKGNhcnRlc2lhblkgIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5ZID0gY2FydGVzaWFuWTtcclxuICAgICAgICBpZiAocG9sYXJMZW5ndGggIT09IHVuZGVmaW5lZCkgdGhpcy5wb2xhckxlbmd0aCA9IHBvbGFyTGVuZ3RoO1xyXG4gICAgICAgIGlmIChwb2xhckFuZ2xlICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJBbmdsZSA9IHBvbGFyQW5nbGU7XHJcbiAgICAgICAgdGhpcy5uYW1lPW5hbWVcclxuICAgIH1cclxuICAgIFxyXG4gICAgY2xvbmUoKTogQXhpcyB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBBeGlzKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZLHRoaXMucG9sYXJMZW5ndGgsdGhpcy5wb2xhckFuZ2xlLHRoaXMubmFtZSk7XHJcbiAgICB9XHJcbiAgICBwYXJzZUlucHV0KGlucHV0OiBhbnkpIHtcclxuICAgICAgICBjb25zdCBheGVzPVtdXHJcbiAgICAgICAgY29uc3QgYnJhY2tldE1hcCA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgaW5wdXQpO1xyXG4gICAgICAgIGF4ZXMucHVzaCh0aGlzLnByb2Nlc3NJbmRpdmlkdWFsKGlucHV0KSk7XHJcbiAgICAgICAgICAgIGlmKGF4ZXMubGVuZ3RoPT09MSlcclxuICAgICAgICAgICAgICAgIHJldHVybiBheGVzWzBdXHJcbiAgICB9XHJcbiAgICBcclxuICAgIHByb2Nlc3NJbmRpdmlkdWFsKGlucHV0OiBhbnkpIHtcclxuICAgICAgICBsZXQgYXhpcyA9IG5ldyBBeGlzKCk7XHJcbiAgICAgICAgY29uc3QgaXNDYXJ0ZXNpYW4gPSBpbnB1dC5zb21lKCh0b2tlbjogYW55KSA9PiB0b2tlbi5uYW1lID09PSAnQ29tbWEnKTtcclxuICAgICAgICBpbnB1dCA9IGlucHV0LmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSAhPT0gJ1N5bnRheCcpO1xyXG4gICAgICAgIGlmIChpc0NhcnRlc2lhbiAmJiBpbnB1dC5sZW5ndGggPT09IDIpIHtcclxuICAgICAgICAgICAgYXhpcy5jYXJ0ZXNpYW5YID0gaW5wdXRbMF0udmFsdWU7XHJcbiAgICAgICAgICAgIGF4aXMuY2FydGVzaWFuWSA9IGlucHV0WzFdLnZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gYXhpcztcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHVuaXZlcnNhbChjb29yZGluYXRlOiBzdHJpbmcsIHRva2Vucz86IEZvcm1hdFRpa3pqYXgsYW5jaG9yQXJyPzogYW55LGFuY2hvcj86IHN0cmluZyk6IEF4aXMge1xyXG4gICAgICAgIGNvbnN0IG1hdGNoZXM9dGhpcy5nZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlKTtcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlQXJyOiBBcnJheTxBeGlzfHN0cmluZz4gPSBbXTtcclxuICAgICAgICBtYXRjaGVzLmZvckVhY2goKG1hdGNoOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaD1tYXRjaC5mdWxsTWF0Y2g7XHJcbiAgICAgICAgICAgIGxldCBheGlzOiBBeGlzfHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIC8sLy50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBheGlzID0gbmV3IEF4aXMoKTtcclxuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZENhcnRlc2lhbihtYXRjaCk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvOi8udGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5hZGRQb2xhcihtYXRjaCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5wb2xhclRvQ2FydGVzaWFuKClcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIC8hW1xcZC5dKyEvLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlICgvW1xcZFxcd10rLykudGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vucyl7fVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvL2F4aXMgPSB0b2tlbnMuZmluZE9yaWdpbmFsVmFsdWUobWF0Y2gpPy5heGlzO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgdGhyb3cgbmV3IEVycm9yKGBUcmllZCB0byBmaW5kIG9yaWdpbmFsIGNvb3JkaW5hdGUgdmFsdWUgd2hpbGUgbm90IGJlaW5nIHByb3ZpZGVkIHdpdGggdG9rZW5zYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFheGlzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGRuJ3QgZmluZCB0aGUgY29vcmRpbmF0ZSAke21hdGNofSBmcm9tICR7Y29vcmRpbmF0ZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMubmFtZT1tYXRjaFxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMubWVyZ2VBeGlzKGNvb3JkaW5hdGVBcnIpXHJcblxyXG4gICAgICAgIGlmKGFuY2hvckFyciYmYW5jaG9yJiZhbmNob3IubWF0Y2goLygtLVxcK3wtLVxcK1xcKykvKSl7XHJcbiAgICAgICAgICAgIGxldCBhOiBBeGlzXHJcbiAgICAgICAgICAgIGlmIChhbmNob3IubWF0Y2goLygtLVxcKykvKSl7XHJcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kKChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICAgICAgICAgIH1lbHNle1xyXG4gICAgICAgICAgICAgICAgYT1hbmNob3JBcnIuZmluZExhc3QoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYSxcImFkZGl0aW9uXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIG1lcmdlQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPikge1xyXG4gICAgICAgIGlmICghYXhlcy5zb21lKChheGlzOiBhbnkpID0+IHR5cGVvZiBheGlzID09PSBcInN0cmluZ1wiKSkge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGF4aXMgb2YgYXhlcykge1xyXG4gICAgICAgICAgICBpZih0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIil7Y29udGludWU7fVxyXG4gICAgICAgICAgICBheGlzLm5hbWU9dW5kZWZpbmVkXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXhlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXhlc1tpXTtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcclxuICAgICAgICAgICAgY29uc3Qgc2lkZXMgPSBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXMsIGkpO1xyXG4gICAgICAgICAgICBjb25zdCBiZWZvcmVBeGlzID0gYXhlc1tzaWRlcy5iZWZvcmVdIGFzIEF4aXM7XHJcbiAgICAgICAgICAgIGNvbnN0IGFmdGVyQXhpcyA9IGF4ZXNbc2lkZXMuYWZ0ZXJdIGFzIEF4aXM7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZXQgIG1hdGNoID0gY3VycmVudC5tYXRjaCgvXlxcKyQvKTtcclxuICAgICAgICAgICAgbGV0IG1vZGUsbW9kaWZpZXJzO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiYWRkaXRpb25cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL14tXFx8JC8pXHJcbiAgICAgICAgICAgIGlmKCFtb2RlJiZtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJyaWdodFByb2plY3Rpb25cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL15cXCEoW1xcZC5dKylcXCEkLylcclxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcclxuICAgICAgICAgICAgICAgIG1vZGUgPSBcImludGVybmFsUG9pbnRcIlxyXG4gICAgICAgICAgICAgICAgbW9kaWZpZXJzPXRvTnVtYmVyKG1hdGNoWzFdKVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZihtb2RlKXtcclxuICAgICAgICAgICAgICAgIGF4ZXMuc3BsaWNlKHNpZGVzLmJlZm9yZSwgc2lkZXMuYWZ0ZXIgLSBzaWRlcy5iZWZvcmUgKyAxLCBiZWZvcmVBeGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYWZ0ZXJBeGlzLG1vZGUsbW9kaWZpZXJzKSk7XHJcbiAgICAgICAgICAgICAgICBpID0gc2lkZXMuYmVmb3JlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGF4ZXMubGVuZ3RoID09PSAxICYmIGF4ZXNbMF0gaW5zdGFuY2VvZiBBeGlzKSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbXBsZXhDYXJ0ZXNpYW5BZGQoYXhpczogQXhpcyxtb2RlOiBzdHJpbmcsbW9kaWZpZXI/OiBhbnkpe1xyXG4gICAgICAgIHN3aXRjaCAobW9kZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiYWRkaXRpb25cIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWCs9YXhpcy5jYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZKz1heGlzLmNhcnRlc2lhblk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInN1YnRyYWN0aW9uXCI6XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInJpZ2h0UHJvamVjdGlvblwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPWF4aXMuY2FydGVzaWFuWFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJpbnRlcm5hbFBvaW50XCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9KHRoaXMuY2FydGVzaWFuWCtheGlzLmNhcnRlc2lhblgpKm1vZGlmaWVyO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZPSh0aGlzLmNhcnRlc2lhblkrYXhpcy5jYXJ0ZXNpYW5ZKSptb2RpZmllcjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNhcnRlc2lhblRvUG9sYXIoKVxyXG4gICAgICAgIHJldHVybiB0aGlzXHJcbiAgICB9O1xyXG5cclxuXHJcbiAgICBnZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlOiBzdHJpbmcpe1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybiA9IGdldFJlZ2V4KCk7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtcclxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLmJhc2ljfSspYCwgXCJnXCIpLFxyXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4ubWVyZ2V9KylgLCBcImdcIilcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgMTogRXh0cmFjdCBtYXRjaGVzIGZvciBlYWNoIHBhdHRlcm4gc2VwYXJhdGVseVxyXG4gICAgICAgIGNvbnN0IGJhc2ljTWF0Y2hlcyA9IEFycmF5LmZyb20oY29vcmRpbmF0ZS5tYXRjaEFsbChyZWdleFBhdHRlcm5zWzBdKSkubWFwKChtYXRjaDogUmVnRXhwRXhlY0FycmF5KSA9PiAoe1xyXG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLnJlcGxhY2UoLy0kL2csIFwiXCIpLCAvLyBSZW1vdmUgdHJhaWxpbmcgaHlwaGVuIG9ubHlcclxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXHJcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoLShtYXRjaFswXS5tYXRjaCgvLSQvKT8xOjApXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1lcmdlTWF0Y2hlcyA9IEFycmF5LmZyb20oY29vcmRpbmF0ZS5tYXRjaEFsbChyZWdleFBhdHRlcm5zWzFdKSkubWFwKChtYXRjaDogUmVnRXhwRXhlY0FycmF5KSA9PiAoe1xyXG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLFxyXG4gICAgICAgICAgICBpbmRleDogbWF0Y2guaW5kZXggPz8gMCxcclxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGhcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlczogQXJyYXk8eyBmdWxsTWF0Y2g6IHN0cmluZywgaW5kZXg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIgfT4gPSBbXTtcclxuXHJcbiAgICAgICAgZnVuY3Rpb24gaXNPdmVybGFwcGluZyhtYXRjaDE6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSwgbWF0Y2gyOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0pIHtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoMS5pbmRleCA8IG1hdGNoMi5pbmRleCArIG1hdGNoMi5sZW5ndGggJiYgbWF0Y2gyLmluZGV4IDwgbWF0Y2gxLmluZGV4ICsgbWF0Y2gxLmxlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFsuLi5iYXNpY01hdGNoZXMsIC4uLm1lcmdlTWF0Y2hlc10uZm9yRWFjaChtYXRjaCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG92ZXJsYXBwaW5nSW5kZXggPSBtYXRjaGVzLmZpbmRJbmRleChleGlzdGluZ01hdGNoID0+IGlzT3ZlcmxhcHBpbmcoZXhpc3RpbmdNYXRjaCwgbWF0Y2gpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChvdmVybGFwcGluZ0luZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdNYXRjaCA9IG1hdGNoZXNbb3ZlcmxhcHBpbmdJbmRleF07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBjdXJyZW50IG1hdGNoIGNvdmVycyBhIGxhcmdlciByYW5nZSwgcmVwbGFjZSB0aGUgZXhpc3Rpbmcgb25lXHJcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gubGVuZ3RoID4gZXhpc3RpbmdNYXRjaC5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdID0gbWF0Y2g7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RlcCAzOiBTb3J0IHRoZSBmaW5hbCBtYXRjaGVzIGJ5IGluZGV4XHJcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RlcCA0OiBWYWxpZGF0ZSB0aGUgcmVzdWx0XHJcbiAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvb3JkaW5hdGUgaXMgbm90IHZhbGlkOyBleHBlY3RlZCBhIHZhbGlkIGNvb3JkaW5hdGUuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWF0Y2hlcztcclxuICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICBwcm9qZWN0aW9uKGF4aXMxOiBBeGlzfHVuZGVmaW5lZCxheGlzMjogQXhpc3x1bmRlZmluZWQpOmFueXtcclxuICAgICAgICBpZiAoIWF4aXMxfHwhYXhpczIpe3Rocm93IG5ldyBFcnJvcihcImF4aXMncyB3ZXJlIHVuZGVmaW5lZCBhdCBwcm9qZWN0aW9uXCIpO31cclxuICAgICAgICByZXR1cm4gW3tYOiBheGlzMS5jYXJ0ZXNpYW5YLFk6IGF4aXMyLmNhcnRlc2lhbll9LHtYOiBheGlzMi5jYXJ0ZXNpYW5YLFk6IGF4aXMxLmNhcnRlc2lhbll9XVxyXG4gICAgfVxyXG5cclxuICAgIGNvbWJpbmUoY29vcmRpbmF0ZUFycjogYW55KXtcclxuICAgICAgICBsZXQgeD0wLHk9MDtcclxuICAgICAgICBjb29yZGluYXRlQXJyLmZvckVhY2goKGNvb3JkaW5hdGU6IEF4aXMpPT57XHJcbiAgICAgICAgICAgIHgrPWNvb3JkaW5hdGUuY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgeSs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPXg7dGhpcy5jYXJ0ZXNpYW5ZPXk7XHJcbiAgICB9XHJcbiAgICBhZGRDYXJ0ZXNpYW4oeDogc3RyaW5nIHwgbnVtYmVyLCB5PzogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCF5ICYmIHR5cGVvZiB4ID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgICAgIFt4LCB5XSA9IHguc3BsaXQoXCIsXCIpLm1hcChOdW1iZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoeCA9PT0gdW5kZWZpbmVkIHx8IHkgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIENhcnRlc2lhbiBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWCA9IHggYXMgbnVtYmVyO1xyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWSA9IHkgYXMgbnVtYmVyO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwb2xhclRvQ2FydGVzaWFuKCl7XHJcbiAgICAgICAgY29uc3QgdGVtcD1wb2xhclRvQ2FydGVzaWFuKHRoaXMucG9sYXJBbmdsZSwgdGhpcy5wb2xhckxlbmd0aClcclxuICAgICAgICB0aGlzLmFkZENhcnRlc2lhbih0ZW1wLlgsdGVtcC5ZKVxyXG4gICAgfVxyXG5cclxuICAgIGNhcnRlc2lhblRvUG9sYXIoKXtcclxuICAgICAgICBjb25zdCB0ZW1wPWNhcnRlc2lhblRvUG9sYXIodGhpcy5jYXJ0ZXNpYW5YLCB0aGlzLmNhcnRlc2lhblkpXHJcbiAgICAgICAgdGhpcy5hZGRQb2xhcih0ZW1wLmFuZ2xlLHRlbXAubGVuZ3RoKVxyXG4gICAgfVxyXG5cclxuICAgIGFkZFBvbGFyKGFuZ2xlOiBzdHJpbmcgfCBudW1iZXIsIGxlbmd0aD86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghbGVuZ3RoICYmIHR5cGVvZiBhbmdsZSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICBbYW5nbGUsIGxlbmd0aF0gPSBhbmdsZS5zcGxpdChcIjpcIikubWFwKE51bWJlcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChhbmdsZSA9PT0gdW5kZWZpbmVkIHx8IGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgcG9sYXIgY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBvbGFyQW5nbGUgPSBhbmdsZSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5wb2xhckxlbmd0aCA9IGxlbmd0aCBhcyBudW1iZXI7XHJcbiAgICB9XHJcbiAgICBhZGRRdWFkcmFudChtaWRQb2ludDogQXhpcyl7XHJcbiAgICAgICAgY29uc3QgeD1taWRQb2ludC5jYXJ0ZXNpYW5YPnRoaXMuY2FydGVzaWFuWDtcclxuICAgICAgICBjb25zdCB5PW1pZFBvaW50LmNhcnRlc2lhblk+dGhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIHRoaXMucXVhZHJhbnQ9eD95PzE6NDp5PzI6MztcclxuICAgIH1cclxuICAgIHRvU3RyaW5nU1ZHKGJvdW5kczogU3ZnQm91bmRzKTogc3RyaW5nIHtcclxuICAgICAgICBjb25zdCBub3JtYWxpemVkWCA9ICgodGhpcy5jYXJ0ZXNpYW5YIC0gYm91bmRzLm1pbi5jYXJ0ZXNpYW5YKSAvIChib3VuZHMubWF4LmNhcnRlc2lhblggLSBib3VuZHMubWluLmNhcnRlc2lhblgpKSAqIGJvdW5kcy5nZXRXaWR0aCgpO1xyXG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRZID0gYm91bmRzLmdldEhlaWdodCgpIC0gKCh0aGlzLmNhcnRlc2lhblkgLSBib3VuZHMubWluLmNhcnRlc2lhblkpIC8gKGJvdW5kcy5tYXguY2FydGVzaWFuWSAtIGJvdW5kcy5taW4uY2FydGVzaWFuWSkpICogYm91bmRzLmdldEhlaWdodCgpO1xyXG4gICAgXHJcbiAgICAgICAgcmV0dXJuIGAke25vcm1hbGl6ZWRYfSAke25vcm1hbGl6ZWRZfWA7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FydGVzaWFuWCtcIixcIit0aGlzLmNhcnRlc2lhblk7XHJcbiAgICB9XHJcblxyXG4gICAgaW50ZXJzZWN0aW9uKGNvb3JkOiBzdHJpbmcsIGZpbmRPcmlnaW5hbFZhbHVlOiAoY29vcmQ6IHN0cmluZykgPT4gQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZCk6IHtYOm51bWJlcixZOm51bWJlcn0ge1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcclxuICAgICAgICAgICAgLnJlcGxhY2UoL2ludGVyc2VjdGlvblxccz9vZlxccz8vZywgXCJcIilcclxuICAgICAgICAgICAgLnJlcGxhY2UoLyhcXHMqYW5kXFxzP3wtLSkvZywgXCIgXCIpXHJcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcclxuICAgICAgICAgICAgLm1hcChmaW5kT3JpZ2luYWxWYWx1ZSlcclxuICAgICAgICAgICAgLmZpbHRlcigodG9rZW4pOiB0b2tlbiBpcyBDb29yZGluYXRlID0+IHRva2VuICE9PSB1bmRlZmluZWQpO1xyXG5cclxuICAgICAgICBpZiAob3JpZ2luYWxDb29yZHMubGVuZ3RoIDwgNCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnRlcnNlY3Rpb24gaGFkIHVuZGVmaW5lZCBjb29yZGluYXRlcyBvciBpbnN1ZmZpY2llbnQgZGF0YS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHNsb3BlcyA9IFtcclxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMV0uYXhpcyBhcyBBeGlzKSxcclxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbM10uYXhpcyBhcyBBeGlzKSxcclxuICAgICAgICBdO1xyXG5cclxuICAgICAgICByZXR1cm4gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMl0uYXhpcyBhcyBBeGlzLCBzbG9wZXNbMF0sIHNsb3Blc1sxXSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b1BvaW50KHZhbHVlOm51bWJlcixmb3JtYXQ6IHN0cmluZyl7XHJcbiAgICBzd2l0Y2ggKGZvcm1hdCkge1xyXG4gICAgICAgIGNhc2UgXCJQb2ludFwiOlxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgY2FzZSBcImNtXCI6IFxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqMjguMzQ2O1xyXG4gICAgICAgIGNhc2UgXCJtbVwiOlxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqIDIuODM0NjtcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ1bmtub24gZm9ybWF0XCIpO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gbWF0Y2hLZXlXaXRoVmFsdWUoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgY29uc3QgdmFsdWVNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgICAgICAgXCJhbmNob3JcIjogXCJhbmNob3I9XCIsXHJcbiAgICAgICAgXCJyb3RhdGVcIjogXCJyb3RhdGU9XCIsXHJcbiAgICAgICAgXCJsaW5lV2lkdGhcIjogXCJsaW5lIHdpZHRoPVwiLFxyXG4gICAgICAgIFwiZmlsbFwiOiBcImZpbGw9XCIsXHJcbiAgICAgICAgXCJmaWxsT3BhY2l0eVwiOiBcImZpbGwgb3BhY2l0eT1cIixcclxuICAgICAgICBcInRleHRPcGFjaXR5XCI6IFwidGV4dCBvcGFjaXR5PVwiLFxyXG4gICAgICAgIFwidGV4dENvbG9yXCI6IFwidGV4dCBjb2xvcj1cIixcclxuICAgICAgICBcImRyYXdcIjogXCJkcmF3PVwiLFxyXG4gICAgICAgIFwidGV4dFwiOiBcInRleHQ9XCIsXHJcbiAgICAgICAgXCJwb3NcIjogXCJwb3M9XCIsXHJcbiAgICAgICAgXCJzY2FsZVwiOiBcInNjYWxlPVwiLFxyXG4gICAgICAgIFwiZGVjb3JhdGVcIjogXCJkZWNvcmF0ZVwiLFxyXG4gICAgICAgIFwic2xvcGVkXCI6IFwic2xvcGVkXCIsXHJcbiAgICAgICAgXCJkZWNvcmF0aW9uXCI6IFwiZGVjb3JhdGlvbj1cIixcclxuICAgICAgICBcImJyYWNlXCI6IFwiYnJhY2VcIixcclxuICAgICAgICBcImFtcGxpdHVkZVwiOiBcImFtcGxpdHVkZT1cIixcclxuICAgICAgICBcImFuZ2xlUmFkaXVzXCI6IFwiYW5nbGUgcmFkaXVzPVwiLFxyXG4gICAgICAgIFwiYW5nbGVFY2NlbnRyaWNpdHlcIjogXCJhbmdsZSBlY2NlbnRyaWNpdHk9XCIsXHJcbiAgICAgICAgXCJmb250XCI6IFwiZm9udD1cIixcclxuICAgICAgICBcInBpY1RleHRcIjogXCJwaWMgdGV4dD1cIixcclxuICAgICAgICBcImxhYmVsXCI6IFwibGFiZWw9XCIsXHJcbiAgICAgICAgXCJmcmVlRm9ybVRleHRcIjogJzonLFxyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gdmFsdWVNYXBba2V5XSB8fCAnJztcclxufVxyXG5cclxuXHJcbnR5cGUgRGVjb3JhdGlvbiA9IHtcclxuICAgIGJyYWNlPzogYm9vbGVhbjtcclxuICAgIGNvaWw6IGJvb2xlYW47XHJcbiAgICBhbXBsaXR1ZGU/OiBudW1iZXI7XHJcbiAgICBhc3BlY3Q/OiBudW1iZXI7XHJcbiAgICBzZWdtZW50TGVuZ3RoPzogbnVtYmVyO1xyXG4gICAgZGVjb3JhdGlvbj86IERlY29yYXRpb247IFxyXG59O1xyXG5cclxudHlwZSBMYWJlbCA9IHtcclxuICAgIGZyZWVGb3JtVGV4dD86IHN0cmluZztcclxuICAgIGNvbG9yPzogc3RyaW5nO1xyXG4gICAgb3BhY2l0eT86IG51bWJlclxyXG59O1xyXG5jb25zdCBkZWZhdWx0VmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge1xyXG4gICAgZnJlZUZvcm1UZXh0OiBcIlwiLFxyXG4gICAgY29sb3I6IFwiXCIsXHJcbiAgICBvcGFjaXR5OiAxLFxyXG59O1xyXG5cclxuZnVuY3Rpb24gbGluZVdpZHRoQ29udmVydGVyKHdpZHRoOiBzdHJpbmcpe1xyXG4gICAgcmV0dXJuIE51bWJlcih3aWR0aC5yZXBsYWNlKC91bHRyYVxccyp0aGluLyxcIjAuMVwiKVxyXG4gICAgLnJlcGxhY2UoL3ZlcnlcXHMqdGhpbi8sXCIwLjJcIilcclxuICAgIC5yZXBsYWNlKC90aGluLyxcIjAuNFwiKVxyXG4gICAgLnJlcGxhY2UoL3NlbWl0aGljay8sXCIwLjZcIilcclxuICAgIC5yZXBsYWNlKC90aGljay8sXCIwLjhcIilcclxuICAgIC5yZXBsYWNlKC92ZXJ5XFxzKnRoaWNrLyxcIjEuMlwiKVxyXG4gICAgLnJlcGxhY2UoL3VsdHJhXFxzKnRoaWNrLyxcIjEuNlwiKSlcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XHJcbiAgICAvLyBpbXBvcnRlbnQgbmVlZHMgdG8gYmUgZm9yc3RcclxuICAgIHBhdGg/OiBzdHJpbmc7XHJcblxyXG4gICAgc2NhbGU6IG51bWJlcjtcclxuICAgIHJvdGF0ZT86IG51bWJlcjtcclxuICAgIGxpbmVXaWR0aD86IG51bWJlcj0wLjQ7XHJcbiAgICB0ZXh0T3BhY2l0eTogbnVtYmVyO1xyXG4gICAgb3BhY2l0eT86IG51bWJlcjtcclxuICAgIGZpbGxPcGFjaXR5PzogbnVtYmVyO1xyXG4gICAgcG9zPzogbnVtYmVyO1xyXG4gICAgYW5nbGVFY2NlbnRyaWNpdHk/OiBudW1iZXI7XHJcbiAgICBhbmdsZVJhZGl1cz86IG51bWJlcjtcclxuICAgIGxldmVsRGlzdGFuY2U/OiBudW1iZXI7XHJcblxyXG4gICAgbW9kZTogc3RyaW5nO1xyXG4gICAgYW5jaG9yPzogc3RyaW5nO1xyXG4gICAgY29sb3I/OiBzdHJpbmc7XHJcbiAgICB0ZXh0Q29sb3I/OiBzdHJpbmc7XHJcbiAgICBmaWxsPzogc3RyaW5nO1xyXG4gICAgYXJyb3c/OiBzdHJpbmc7XHJcbiAgICBkcmF3Pzogc3RyaW5nO1xyXG4gICAgdGV4dD86IHN0cmluZztcclxuICAgIHRpa3pzZXQ/OiBzdHJpbmc7XHJcbiAgICBwb3NpdGlvbj86IHN0cmluZztcclxuICAgIGxpbmVTdHlsZT86IHN0cmluZztcclxuICAgIGZvbnQ/OiBzdHJpbmc7XHJcbiAgICBwaWNUZXh0Pzogc3RyaW5nO1xyXG4gICAgXHJcbiAgICBzbG9wZWQ/OiBib29sZWFuO1xyXG4gICAgZGVjb3JhdGU/OiBib29sZWFuO1xyXG4gICAgbGFiZWw/OiBMYWJlbDtcclxuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGZvcm1hdHRpbmc6IGFueVtdLG1vZGU/OiBzdHJpbmcpe1xyXG4gICAgICAgIGlmKG1vZGUpdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgdGhpcy5hc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmd8fFtdKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgYXNzaWduRm9ybWF0dGluZyhcclxuICAgICAgICBmb3JtYXR0aW5nQXJyOiBBcnJheTx7IGtleTogc3RyaW5nOyB2YWx1ZTogYW55IH0+LFxyXG4gICAgICAgIHRhcmdldFNjb3BlOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0gdGhpc1xyXG4gICAgKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB7IGtleSwgdmFsdWUgfSBvZiBmb3JtYXR0aW5nQXJyKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBub3JtYWxpemVkS2V5ID0gT2JqZWN0LmtleXModGFyZ2V0U2NvcGUpLmZpbmQoXHJcbiAgICAgICAgICAgICAgICAocHJvcCkgPT4gcHJvcC50b0xvd2VyQ2FzZSgpID09PSBrZXkudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgICAgICApIHx8IGtleTtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAodGhpcy5pc05lc3RlZCh2YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgIHRhcmdldFNjb3BlW25vcm1hbGl6ZWRLZXldID0gdGFyZ2V0U2NvcGVbbm9ybWFsaXplZEtleV0gfHwgdGhpcy5jcmVhdGVOZXN0ZWQobm9ybWFsaXplZEtleSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2lnbkZvcm1hdHRpbmcodmFsdWUsdGFyZ2V0U2NvcGVbbm9ybWFsaXplZEtleV0pXHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0U2NvcGVbbm9ybWFsaXplZEtleV09dmFsdWVcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgc2V0UHJvcGVydHkoc2NvcGU6IGFueSwga2V5OiBhbnksIHZhbHVlOiBhbnkpOiB2b2lkIHtcclxuICAgICAgICBpZiAodHlwZW9mIHNjb3BlID09PSBcIm9iamVjdFwiICYmIHNjb3BlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHNjb3BlW2tleV0gPSB2YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiSW52YWxpZCBzY29wZSBwcm92aWRlZC4gRXhwZWN0ZWQgYW4gb2JqZWN0IGJ1dCByZWNlaXZlZDpcIiwgc2NvcGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgY3JlYXRlTmVzdGVkKGtleTogc3RyaW5nKSB7XHJcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcclxuICAgICAgICAgICAgY2FzZSAnbGFiZWwnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgY29sb3I6IHVuZGVmaW5lZCwgb3BhY2l0eTogdW5kZWZpbmVkLGZyZWVGb3JtVGV4dDogdW5kZWZpbmVkIH07XHJcbiAgICAgICAgICAgIGNhc2UgJ2RlY29yYXRpb24nOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgICAgICBicmFjZTogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIGNvaWw6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgICAgIGFtcGxpdHVkZTogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIGFzcGVjdDogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIHNlZ21lbnRMZW5ndGg6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgICAgICBkZWNvcmF0aW9uOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHt9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaXNOZXN0ZWQodmFsdWU6IGFueSl7XHJcbiAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLnNvbWUoKGl0ZW06IGFueSkgPT4gaXRlbS5rZXkgJiYgaXRlbS52YWx1ZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgc3BsaXQ8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxyXG4gICAgICAgIGtleTogSyxcclxuICAgICAgICBmb3JtYXR0aW5nOiBhbnksXHJcbiAgICAgICAgbmVzdGVkS2V5PzogTktcclxuICAgICk6IHZvaWQge1xyXG4gICAgICAgIGxldCB2YWx1ZTtcclxuICAgICAgICBpZih0eXBlb2YgZm9ybWF0dGluZyE9PVwiYm9vbGVhblwiKXtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gZm9ybWF0dGluZy5zcGxpdChcIj1cIik7XHJcbiAgICBcclxuICAgICAgICAgICAgLy8gRW5zdXJlIHRoZSBmb3JtYXR0aW5nIHN0cmluZyBpcyB2YWxpZFxyXG4gICAgICAgICAgICBpZiAobWF0Y2gubGVuZ3RoIDwgMiB8fCAhbWF0Y2hbMV0pIHJldHVybjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFRyaW0gYW55IHBvdGVudGlhbCB3aGl0ZXNwYWNlIGFyb3VuZCB0aGUgdmFsdWVcclxuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBtYXRjaFsxXS50cmltKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHZhbHVlIGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nXHJcbiAgICAgICAgICAgIHZhbHVlID0gIWlzTmFOKHBhcnNlRmxvYXQocmF3VmFsdWUpKSAmJiBpc0Zpbml0ZSgrcmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA6IHJhd1ZhbHVlLnJlcGxhY2UoLy1cXHwvLCdub3J0aCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB2YWx1ZT1mb3JtYXR0aW5nXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vdGhpcy5zZXRQcm9wZXJ0eShrZXksIHZhbHVlLCBuZXN0ZWRLZXkpO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgXHJcblxyXG5cclxuICAgIGFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nOiBhbnkpe1xyXG4gICAgICAgIGNvbnN0IGE9c3BsaXRGb3JtYXR0aW5nLmZpbmQoKGl0ZW06IHN0cmluZyk9PiBpdGVtLm1hdGNoKC9tYXNzfGFuZ3xoZWxwbGluZXMvKSlcclxuICAgICAgICBpZiAoIWEmJiF0aGlzLnRpa3pzZXQpcmV0dXJuO1xyXG4gICAgICAgIGlmKGEpIHRoaXMudGlrenNldD1hO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMudGlrenNldCkge1xyXG4gICAgICAgICAgICBjYXNlIFwibWFzc1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPVwieWVsbG93ITYwXCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGg9XCJkcmF3XCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9Jy0+J1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJoZWxwbGluZXNcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMubGluZVdpZHRoPTAuNDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhdz0nZ3JheSc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImFuZ1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoPSdkcmF3J1xyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPSdibGFjayE1MCc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGxPcGFjaXR5PTAuNTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhdz0nb3JhbmdlJ1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hcnJvdz0nPC0+J1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZUVjY2VudHJpY2l0eT0xLjY7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlUmFkaXVzPXRvUG9pbnQoMC41LFwiY21cIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9J29yYW5nZSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmZvbnQ9J1xcXFxsYXJnZSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHRPcGFjaXR5PTAuOTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFkZFNwbG9wQW5kUG9zaXRpb24oYXJyOiBhbnksaW5kZXg6IG51bWJlcil7XHJcbiAgICAgICAgY29uc3QgYmVmb3JlQWZ0ZXI9ZmluZEJlZm9yZUFmdGVyQXhpcyhhcnIsaW5kZXgpO1xyXG4gICAgICAgIGNvbnN0IFtiZWZvcmUsIGFmdGVyXT1bYXJyW2JlZm9yZUFmdGVyLmJlZm9yZV0sYXJyW2JlZm9yZUFmdGVyLmFmdGVyXV1cclxuICAgICAgICBpZiAodGhpcy5wb3NpdGlvbnx8dGhpcy5zbG9wZWQpe3JldHVybn1cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGVkZ2UxID0gYmVmb3JlLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xyXG4gICAgICAgIGNvbnN0IGVkZ2UyID0gYWZ0ZXIucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XHJcbiAgICAgICAgY29uc3Qgc2xvcGU9ZmluZFNsb3BlKGJlZm9yZSxhZnRlcilcclxuXHJcbiAgICAgICAgdGhpcy5zbG9wZWQgPSBzbG9wZSAhPT0gMCYmc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHk7XHJcblxyXG4gICAgICAgIGxldCBxdWFkcmFudFxyXG5cclxuICAgICAgICBpZiAoZWRnZTEhPT1lZGdlMilcclxuICAgICAgICAgICAgcXVhZHJhbnQ9ZWRnZTErZWRnZTI7XHJcbiAgICAgICAgZWxzZSBcclxuICAgICAgICAgICAgcXVhZHJhbnQ9ZWRnZTE7XHJcblxyXG4gICAgICAgIC8vc2ludCBwYXJhbGxlbCB0byBZIGF4aXNcclxuICAgICAgICBpZiAoc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHkpe1xyXG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uID0gcXVhZHJhbnQucmVwbGFjZSgvKDN8NCkvLFwiYmVsb3dcIikucmVwbGFjZSgvKDF8MikvLFwiYWJvdmVcIikucmVwbGFjZSgvKGJlbG93YWJvdmV8YWJvdmViZWxvdykvLFwiXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaXNudCBwYXJhbGxlbCB0byBYIGF4aXNcclxuICAgICAgICBpZiAoc2xvcGUgIT09IDApe1xyXG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uPXRoaXMucG9zaXRpb24/dGhpcy5wb3NpdGlvbjonJztcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbis9cXVhZHJhbnQucmVwbGFjZSgvKDF8NCkvLFwicmlnaHRcIikucmVwbGFjZSgvKDJ8MykvLFwibGVmdFwiKS5yZXBsYWNlKC8ocmlnaHRsZWZ0fGxlZnRyaWdodCkvLFwiXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uPy5yZXBsYWNlKC9bXFxkXSsvZyxcIlwiKS5yZXBsYWNlKC8oYmVsb3d8YWJvdmUpKHJpZ2h0fGxlZnQpLyxcIiQxICQyXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBzcGxpdEZvcm1hdHRpbmcgPSBmb3JtYXR0aW5nU3RyaW5nLnJlcGxhY2UoL1xccy9nLCBcIlwiKS5tYXRjaCgvKD86e1tefV0qfXxbXix7fV0rKSsvZykgfHwgW107XHJcbiAgICBcclxuICAgICAgICB0aGlzLmFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nKTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IHBhdHRlcm5zOiBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IHN0cmluZykgPT4gdm9pZD4gPSB7XHJcbiAgICAgICAgICAgIFwibGluZXdpZHRoXCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImxpbmVXaWR0aFwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiZmlsbD1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZmlsbFwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXmZpbGxvcGFjaXR5XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImZpbGxPcGFjaXR5XCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeKC0+fDwtfC0qe1N0ZWFsdGh9LSopJFwiOiAodmFsdWUpID0+IHsgdGhpcy5hcnJvdyA9IHZhbHVlOyB9LFxyXG4gICAgICAgICAgICBcIl4oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCl7MSwyfSRcIjogKHZhbHVlKSA9PiB7IHRoaXMucG9zaXRpb24gPSB2YWx1ZS5yZXBsYWNlKC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLCBcIiQxIFwiKTsgfSxcclxuICAgICAgICAgICAgXCJecG9zPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJwb3NcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5kcmF3PVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJkcmF3XCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeZGVjb3JhdGUkXCI6ICgpID0+IHsgdGhpcy5kZWNvcmF0ZSA9IHRydWU7IH0sXHJcbiAgICAgICAgICAgIFwiXnRleHQ9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcInRleHRcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5hbmNob3I9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImFuY2hvclwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXlxcXCJeXFxcIiRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImxhYmVsXCIsdHJ1ZSxcImZyZWVGb3JtVGV4dFwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJsYWJlbFwiXT4pLFxyXG4gICAgICAgICAgICBcIl5icmFjZSRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxyXG4gICAgICAgICAgICBcIl5hbXBsaXR1ZGVcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZGVjb3JhdGlvblwiLCB2YWx1ZSwgXCJhbXBsaXR1ZGVcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxyXG4gICAgICAgICAgICBcIl5kcmF3JFwiOiAodmFsdWUpID0+IHsgdGhpcy5wYXRoID0gdmFsdWU7IH0sXHJcbiAgICAgICAgICAgIFwiXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxcXGQuXSspezEsNX0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmNvbG9yID0gdmFsdWU7IH0sXHJcbiAgICAgICAgICAgIFwiXihkb3R0ZWR8ZGFzaGVkfHNtb290aHxkZW5zZWx5fGxvb3NlbHkpezEsMn0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmxpbmVTdHlsZSA9IHZhbHVlLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLywgXCIkMSBcIik7IH0sXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgc3BsaXRGb3JtYXR0aW5nLmZvckVhY2goZm9ybWF0dGluZyA9PiB7LypcclxuICAgICAgICAgICAgLy8gSGFuZGxlIG5lc3RlZCBwcm9wZXJ0aWVzXHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZm9ybWF0dGluZy5tYXRjaCgvXihbXj1dKyk9eyguKil9JC8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IFtfLCBwYXJlbnQsIGNoaWxkcmVuXSA9IG1hdGNoO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdPYmogPSB0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICAgICAgICAgICAgICBpZiAoIWZvcm1hdHRpbmdPYmpbcGFyZW50XSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpbcGFyZW50XSA9IHt9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkQ2hpbGQgPSBuZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUse30sY2hpbGRyZW4pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGZvcm1hdHRpbmdPYmpbcGFyZW50XSwgKHBhcnNlZENoaWxkIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW3BhcmVudF0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtwYXR0ZXJuLCBoYW5kbGVyXSBvZiBPYmplY3QuZW50cmllcyhwYXR0ZXJucykpIHtcclxuICAgICAgICAgICAgICAgIGlmIChuZXcgUmVnRXhwKHBhdHRlcm4pLnRlc3QoZm9ybWF0dGluZykpIHtcclxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyKGZvcm1hdHRpbmcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSovXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB0b1N0cmluZyhvYmo/OiBhbnkpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCBzdHJpbmc9b2JqPyd7JzonWyc7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqP29iajp0aGlzKSkge1xyXG4gICAgICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eKG1vZGV8dGlrenNldCkkLykpe2NvbnRpbnVlO31cclxuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyYmdmFsdWUpe1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrdGhpcy50b1N0cmluZyh2YWx1ZSkrJywnXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZys9bWF0Y2hLZXlXaXRoVmFsdWUoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcpKyh0eXBlb2YgdmFsdWU9PT1cImJvb2xlYW5cIj8nJzp2YWx1ZSkrJywnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcrKG9iaj8nfSc6J10nKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVPYmplY3RUb1N0cmluZyhvYmo6IG9iamVjdCwgcGFyZW50S2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xyXG4gICAgfVxyXG59XHJcblxyXG50eXBlIE1vZGUgPSBcImNvb3JkaW5hdGVcIiB8IFwiY29vcmRpbmF0ZS1pbmxpbmVcIiB8IFwibm9kZVwiIHwgXCJub2RlLWlubGluZVwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIENvb3JkaW5hdGUge1xyXG4gICAgbW9kZTogTW9kZVxyXG4gICAgYXhpcz86IEF4aXNcclxuICAgIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nXHJcbiAgICB2YXJpYWJsZT86IEF4aXNcclxuICAgIGxhYmVsPzogc3RyaW5nXHJcbiAgICBcclxuICBjb25zdHJ1Y3Rvcihtb2RlOiBNb2RlLGF4aXM/OiBBeGlzLGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLHZhcmlhYmxlPzogQXhpcyxsYWJlbD86IHN0cmluZywpIHtcclxuICAgIHRoaXMubW9kZT1tb2RlO1xyXG4gICAgdGhpcy5heGlzPWF4aXM7XHJcbiAgICB0aGlzLmZvcm1hdHRpbmc9Zm9ybWF0dGluZztcclxuICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XHJcbiAgICB0aGlzLmxhYmVsPWxhYmVsO1xyXG4gIH1cclxuICAgIGludGVycHJldENvb3JkaW5hdGUoY29vcmRpbmF0ZXM6IGFueVtdKXtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nPWNvb3JkaW5hdGVzLmZpbmQoY29vcj0+Y29vciBpbnN0YW5jZW9mIEZvcm1hdHRpbmcpXHJcbiAgICAgICAgY29uc3QgYXhpcz1jb29yZGluYXRlcy5maW5kKGNvb3I9PmNvb3IgaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlPWNvb3JkaW5hdGVzLmZpbmQoY29vcj0+Y29vcj8udHlwZT09PSd2YXJpYWJsZScpLnZhbHVlXHJcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nPWZvcm1hdHRpbmc7XHJcbiAgICAgICAgdGhpcy5heGlzPWF4aXNcclxuICAgICAgICB0aGlzLnZhcmlhYmxlPXZhcmlhYmxlXHJcbiAgICAgICAgcmV0dXJuIHRoaXNcclxuICAgIH1cclxuICAgIGNsb25lKCk6IENvb3JkaW5hdGUge1xyXG4gICAgICAgIHJldHVybiBuZXcgQ29vcmRpbmF0ZShcclxuICAgICAgICAgICAgdGhpcy5tb2RlLFxyXG4gICAgICAgICAgICB0aGlzLmF4aXMgPyB0aGlzLmF4aXMuY2xvbmUoKSA6dW5kZWZpbmVkLFxyXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmcsXHJcbiAgICAgICAgICAgIHRoaXMudmFyaWFibGUsXHJcbiAgICAgICAgICAgIHRoaXMubGFiZWwsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRBeGlzKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyKXtcclxuICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoY2FydGVzaWFuWCwgY2FydGVzaWFuWSwgcG9sYXJMZW5ndGgsIHBvbGFyQW5nbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMubW9kZSlcclxuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29vcmRpbmF0ZVwiOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcylcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm5gXFxcXGNvb3JkaW5hdGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9ICgke3RoaXMudmFyaWFibGUgfHwgXCJcIn0pIGF0ICgke3RoaXMuYXhpcy50b1N0cmluZygpfSk7YFxyXG4gICAgICAgICAgICBjYXNlIFwibm9kZVwiOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcyl7fVxyXG4gICAgICAgICAgICAgICAgICAgIC8vcmV0dXJuIGBcXFxcbm9kZSAke3RoaXMuY29vcmRpbmF0ZU5hbWU/JygnK3RoaXMuY29vcmRpbmF0ZU5hbWUrJyknOicnfSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfHwnJ30geyR7dGhpcy5sYWJlbH19O2BcclxuICAgICAgICAgICAgY2FzZSBcIm5vZGUtaW5saW5lXCI6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYG5vZGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9IHske3RoaXMubGFiZWwgfHwgJyd9fWBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgbW9kZSBhdCB0byBzdHJpbmcgY29vcmRpbmF0ZVwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbn1cclxuXHJcbmV4cG9ydCB0eXBlIFRva2VuID1BeGlzIHwgQ29vcmRpbmF0ZSB8RHJhd3xGb3JtYXR0aW5nfCBzdHJpbmc7XHJcblxyXG5leHBvcnQgY2xhc3MgRHJhdyB7XHJcbiAgICBtb2RlOiBzdHJpbmdcclxuICAgIGZvcm1hdHRpbmc6IEZvcm1hdHRpbmc7XHJcbiAgICBjb29yZGluYXRlczogYW55W109W107XHJcblxyXG5cclxuICAgIGNvbnN0cnVjdG9yKG1vZGU6IHN0cmluZyxmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxjb29yZGluYXRlcz86IGFueVtdLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LCkgeztcclxuICAgICAgICB0aGlzLm1vZGU9bW9kZTtcclxuICAgICAgICBpZihmb3JtYXR0aW5nKVxyXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9Zm9ybWF0dGluZztcclxuICAgICAgICBpZihjb29yZGluYXRlcylcclxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcz1jb29yZGluYXRlcztcclxuICAgIH1cclxuICAgIGNyZWF0ZUZyb21BcnJheShhcnI6IGFueSl7LypcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YXJyLmxlbmd0aDtpKyspe1xyXG4gICAgICAgICAgICBpZiAoYXJyW2ldIGluc3RhbmNlb2YgQXhpc3x8YXJyW2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSl7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiBhcnI9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaChhcnJbaV0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7Ki9cclxuICAgIH1cclxuXHJcbiAgICBmaWxsQ29vcmRpbmF0ZXMoc2NoZW1hdGljOiBhbnlbXSwgdG9rZW5zPzogRm9ybWF0VGlrempheCkge1xyXG4gICAgICAgIGlmKHNjaGVtYXRpY1swXSBpbnN0YW5jZW9mIEZvcm1hdHRpbmcpe1xyXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9c2NoZW1hdGljWzBdXHJcbiAgICAgICAgICAgIHNjaGVtYXRpYy5zcGxpY2UoMCwxKVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCByZWZlcmVuY2VGaXJzdEF4aXNNYXAgPSBzY2hlbWF0aWNcclxuICAgICAgICAgICAgLm1hcCgoY29vciwgaW5kZXgpID0+IChjb29yIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgY29vci5nZXRTdHJpbmdWYWx1ZSgpID09PSAnUmVmZXJlbmNlRmlyc3RBeGlzJyA/IGluZGV4IDogbnVsbCkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpOiB0IGlzIG51bWJlciA9PiB0ICE9PSBudWxsKTsgXHJcblxyXG4gICAgICAgIGNvbnN0IHJlZmVyZW5jZUxhc3RBeGlzTWFwID0gc2NoZW1hdGljXHJcbiAgICAgICAgICAgIC5tYXAoKGNvb3IsIGluZGV4KSA9PiAoY29vciBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuICYmIGNvb3IuZ2V0U3RyaW5nVmFsdWUoKSA9PT0gJ1JlZmVyZW5jZUxhc3RBeGlzJyA/IGluZGV4IDogbnVsbCkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpOiB0IGlzIG51bWJlciA9PiB0ICE9PSBudWxsKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtYXBwZWRSZWZlcmVuY2VzID0gcmVmZXJlbmNlRmlyc3RBeGlzTWFwLm1hcChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIHNjaGVtYXRpY1tpbmRleF0ubmFtZT0nQXhpc0Nvbm5lY3RlcidcclxuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXNJbmRleCA9IHNjaGVtYXRpYy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXMgPSBuZXh0QXhpc0luZGV4ICE9PSAtMSA/IHNjaGVtYXRpY1tpbmRleCArIDEgKyBuZXh0QXhpc0luZGV4XSA6IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBuZXh0QXhpcztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwcyA9IHJlZmVyZW5jZUxhc3RBeGlzTWFwLm1hcChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIHNjaGVtYXRpY1tpbmRleF0ubmFtZT0nQXhpc0Nvbm5lY3RlcidcclxuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXNJbmRleCA9IHNjaGVtYXRpYy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXMgPSBuZXh0QXhpc0luZGV4ICE9PSAtMSA/IHNjaGVtYXRpY1tpbmRleCArIDEgKyBuZXh0QXhpc0luZGV4XSA6IG51bGw7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0F4aXNJbmRleCA9IHNjaGVtYXRpY1xyXG4gICAgICAgICAgICAgICAgLnNsaWNlKDAsIGluZGV4KVxyXG4gICAgICAgICAgICAgICAgLnJldmVyc2UoKVxyXG4gICAgICAgICAgICAgICAgLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzQXhpcyA9IHByZXZpb3VzQXhpc0luZGV4ICE9PSAtMSA/IHNjaGVtYXRpY1tpbmRleCAtIDEgLSBwcmV2aW91c0F4aXNJbmRleF0gOiBudWxsO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHJlZmVyZW5jZUZpcnN0QXhpczogc2NoZW1hdGljW2luZGV4XSxcclxuICAgICAgICAgICAgICAgIHByZXZpb3VzQXhpcyxcclxuICAgICAgICAgICAgICAgIG5leHRBeGlzLFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmKG1hcHBlZFJlZmVyZW5jZXMubGVuZ3RoPjApe1xyXG4gICAgICAgICAgICBjb25zdCBmaXJzdEF4aXM9c2NoZW1hdGljLmZpbmQodD0+dCBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICAgICAgICAgIG1hcHBlZFJlZmVyZW5jZXMuZm9yRWFjaChheGlzID0+IHtcclxuICAgICAgICAgICAgICAgIGF4aXMuY29tcGxleENhcnRlc2lhbkFkZChmaXJzdEF4aXMsXCJhZGRpdGlvblwiKVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXM9c2NoZW1hdGljO1xyXG4gICAgICAgIHJldHVybiB0aGlzXHJcbiAgICAgICAgXHJcbiAgICAgICAgLypcclxuICAgICAgICBjb25zdCBjb29yQXJyOiBBcnJheTxUb2tlbj49W107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2hlbWF0aWMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHNjaGVtYXRpY1tpXS50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgICAgICAgICAgbGV0IHByZXZpb3VzRm9ybWF0dGluZztcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoaSA+IDAgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMV0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPiAxICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJub2RlXCIgJiYgc2NoZW1hdGljW2kgLSAyXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMl0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IEF4aXMoKS51bml2ZXJzYWwoc2NoZW1hdGljW2ldLnZhbHVlLCB0b2tlbnMsIGNvb3JBcnIsIHByZXZpb3VzRm9ybWF0dGluZywgKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZihzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJub2RlXCIpe1xyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBDb29yZGluYXRlKHtsYWJlbDogc2NoZW1hdGljW2ldLnZhbHVlLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZS1pbmxpbmVcIix7fSxzY2hlbWF0aWNbaV0uZm9ybWF0dGluZyksbW9kZTogXCJub2RlLWlubGluZVwifSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2V7XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2goc2NoZW1hdGljW2ldLnZhbHVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY29vckFycjsqL1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNjaGVtYXRpYyhkcmF3OiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCByZWdleD1nZXRSZWdleCgpO1xyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcclxuICAgICAgICBjb25zdCBub2RlUmVnZXggPSByZWdFeHAoU3RyaW5nLnJhd2Bub2RlXFxzKlxcWz8oJHtyZWdleC5mb3JtYXR0aW5nfSopXFxdP1xccyp7KCR7cmVnZXgudGV4dH0qKX1gKTtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nUmVnZXggPSAvKC0tY3ljbGV8Y3ljbGV8LS1cXCtcXCt8LS1cXCt8LS18LVxcfHxcXHwtfGdyaWR8Y2lyY2xlfHJlY3RhbmdsZSkvO1xyXG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHNcXC0sLjpgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YChcXChbJHtjYX1dK1xcKXxcXChcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K1xcLV0rXFwoWyR7Y2F9XStcXClcXCRcXCkpYCk7XHJcbiAgICAgICAgbGV0IGkgPSAwO1xyXG4gICAgICAgIGxldCBsb29wcyA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGkgPCBkcmF3Lmxlbmd0aCAmJiBsb29wcyA8IDEwMCkgeyAvLyBJbmNyZWFzZSBsb29wIGxpbWl0IG9yIGFkZCBjb25kaXRpb24gYmFzZWQgb24gcGFyc2VkIGxlbmd0aFxyXG4gICAgICAgICAgICBsb29wcysrO1xyXG4gICAgICAgICAgICBjb25zdCBjb29yZGluYXRlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGNvb3JkaW5hdGVSZWdleCk7XHJcbiAgICAgICAgICAgIFxyXG5cclxuICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiY29vcmRpbmF0ZVwiLCB2YWx1ZTogY29vcmRpbmF0ZU1hdGNoWzFdIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChmb3JtYXR0aW5nTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBpICs9IGZvcm1hdHRpbmdNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3Qgbm9kZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAobm9kZU1hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm5vZGVcIixcclxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBub2RlTWF0Y2hbMV0gfHwgXCJcIixcclxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogbm9kZU1hdGNoWzJdXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbm9kZU1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobG9vcHMgPT09IDEwMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQYXJzaW5nIGV4Y2VlZGVkIHNhZmUgbG9vcCBjb3VudFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNDb29yZGluYXRlKG9iajogYW55KTogb2JqIGlzIENvb3JkaW5hdGUge1xyXG4gICAgICAgIHJldHVybiBvYmogJiYgb2JqIGluc3RhbmNlb2YgQ29vcmRpbmF0ZTtcclxuICAgIH1cclxuICAgIHRvU3RyaW5nRHJhdygpe1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBgXFxcXGRyYXcgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCl9IGA7XHJcbiAgICAgICAgdGhpcy5jb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGNvb3JkaW5hdGUgaW5zdGFuY2VvZiBDb29yZGluYXRlJiZjb29yZGluYXRlLm1vZGU9PT1cIm5vZGUtaW5saW5lXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW46IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPWAoJHtjb29yZGluYXRlLnRvU3RyaW5nKCl9KWBcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0ICsgXCI7XCI7XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmdQaWMoKXtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3IHBpYyAke3RoaXMuZm9ybWF0dGluZy50b1N0cmluZygpfHwnJ30ge2FuZ2xlID0gJHsodGhpcy5jb29yZGluYXRlc1swXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1sxXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1syXSBhcyBBeGlzKS5uYW1lfX0gYDtcclxuICAgICBcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCkge1xyXG4gICAgICAgIGlmICh0aGlzLm1vZGU9PT0nZHJhdycpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nRHJhdygpO1xyXG4gICAgICAgIGlmKHRoaXMubW9kZT09PSdkcmF3LXBpYy1hbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ1BpYygpXHJcbiAgICAgICAgXHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuICBcclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZGlzc2VjdFhZYXhpcyhtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSkge1xyXG4gICAgbGV0IFhub2RlOlJlZ0V4cE1hdGNoQXJyYXl8c3RyaW5nPVwiXCIsIFlub2RlOlJlZ0V4cE1hdGNoQXJyYXl8c3RyaW5nPVwiXCI7XHJcblxyXG4gICAgaWYgKG1hdGNoWzFdICYmIG1hdGNoWzJdKSB7XHJcbiAgICAgICAgWG5vZGUgPSBtYXRjaFsxXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xyXG4gICAgICAgIFlub2RlID0gbWF0Y2hbMl0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcclxuICAgICAgICBYbm9kZT1Ybm9kZVswXS5zdWJzdHJpbmcoMSxYbm9kZS5sZW5ndGgpXHJcbiAgICAgICAgWW5vZGU9WW5vZGVbMF0uc3Vic3RyaW5nKDEsWW5vZGUubGVuZ3RoKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwieHlheGlzXCIsXHJcbiAgICAgICAgWGZvcm1hdHRpbmc6IG1hdGNoWzFdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcclxuICAgICAgICBZZm9ybWF0dGluZzogbWF0Y2hbMl0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxyXG4gICAgICAgIHhEaXJlY3Rpb246IG1hdGNoWzFdICYmIC8tPi8udGVzdChtYXRjaFsxXSkgPyBcImxlZnRcIiA6IFwicmlnaHRcIixcclxuICAgICAgICB5RGlyZWN0aW9uOiBtYXRjaFsyXSAmJiAvLT4vLnRlc3QobWF0Y2hbMl0pID8gXCJkb3duXCIgOiBcInVwXCIsXHJcbiAgICAgICAgWG5vZGU6IFhub2RlLFxyXG4gICAgICAgIFlub2RlOiBZbm9kZSxcclxuICAgIH07XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuLypcclxuZnVuY3Rpb24gZ2VuZXJhdGVGb3JtYXR0aW5nKGNvb3JkaW5hdGU6IENvb3JkaW5hdGUpe1xyXG4gICAgaWYgKHR5cGVvZiBjb29yZGluYXRlLmxhYmVsICE9PSBcInN0cmluZ1wiKXsgcmV0dXJuIFwiXCI7IH1cclxuICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBjb29yZGluYXRlLmZvcm1hdHRpbmc/LnNwbGl0KFwiLFwiKSB8fCBbXTtcclxuICAgIGlmIChmb3JtYXR0aW5nLnNvbWUoKHZhbHVlOiBzdHJpbmcpID0+IC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLnRlc3QodmFsdWUpKSkge1xyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlLmZvcm1hdHRpbmc7XHJcbiAgICB9XHJcbiAgICBpZihmb3JtYXR0aW5nLmxlbmd0aD4wJiYhZm9ybWF0dGluZ1tmb3JtYXR0aW5nLmxlbmd0aC0xXS5lbmRzV2l0aChcIixcIikpe2Zvcm1hdHRpbmcucHVzaChcIixcIil9XHJcbiAgICBzd2l0Y2goY29vcmRpbmF0ZS5xdWFkcmFudCl7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIHJpZ2h0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIGxlZnQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgbGVmdCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgNDogXHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgcmlnaHQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuICAgIHJldHVybiBmb3JtYXR0aW5nLmpvaW4oXCJcIik7XHJcbn1cclxuKi9cclxuXHJcbiJdfQ==