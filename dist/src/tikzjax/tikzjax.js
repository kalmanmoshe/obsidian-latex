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
                icon.onclick = () => new DebugModal(this.app, tikzjax.getCode()).open();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBUyxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3pELE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUluRCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMs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Ozs7Ozs7O0VBd0JFIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBNYXJrZG93blZpZXcsIFNjb3BlLCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IE1hdGhQbHVnaW4sIHsgU3ZnQm91bmRzIH0gZnJvbSBcInNyYy9tYWluXCI7XHJcbmltcG9ydCB7IG9wdGltaXplIH0gZnJvbSBcIi4vc3Znby5icm93c2VyLmpzXCI7XHJcbi8vIEB0cy1pZ25vcmVcclxuaW1wb3J0IHRpa3pqYXhKcyBmcm9tIFwiaW5saW5lOi4vdGlrempheC5qc1wiO1xyXG5pbXBvcnQgeyBjYXJ0ZXNpYW5Ub1BvbGFyLCBmaW5kSW50ZXJzZWN0aW9uUG9pbnQsIGZpbmRTbG9wZSwgcG9sYXJUb0NhcnRlc2lhbiwgdG9OdW1iZXIgfSBmcm9tIFwic3JjL21hdGhQYXJzZXIvbWF0aFV0aWxpdGllcy5qc1wiO1xyXG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcclxuaW1wb3J0IHsgRm9ybWF0VGlrempheCB9IGZyb20gXCIuL2ludGVycHJldC90b2tlbml6ZVRpa3pqYXguanNcIjtcclxuaW1wb3J0IHsgbWFwQnJhY2tldHMgfSBmcm9tIFwic3JjL3V0aWxzL1BhcmVuVXRlbnNpbHMuanNcIjtcclxuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4gfSBmcm9tIFwic3JjL2Jhc2ljVG9rZW4uanNcIjtcclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRpa3pqYXgge1xyXG4gICAgYXBwOiBBcHA7XHJcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgICBhY3RpdmVWaWV3OiBNYXJrZG93blZpZXcgfCBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgICB0aGlzLmFwcD1hcHA7XHJcbiAgICAgIHRoaXMuYWN0aXZlVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmVhZHlMYXlvdXQoKXtcclxuICAgICAgdGhpcy5wbHVnaW4uYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcclxuICAgICAgICB0aGlzLmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XHJcbiAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG4gICAgICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xyXG4gICAgICAgIHMuaWQgPSBcInRpa3pqYXhcIjtcclxuICAgICAgICBzLnR5cGUgPSBcInRleHQvamF2YXNjcmlwdFwiO1xyXG4gICAgICAgIHMuaW5uZXJUZXh0ID0gdGlrempheEpzO1xyXG4gICAgICAgIGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xyXG4gICAgICAgIGRvYy5hZGRFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgdW5sb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XHJcbiAgICAgICAgY29uc3QgcyA9IGRvYy5nZXRFbGVtZW50QnlJZChcInRpa3pqYXhcIik7XHJcbiAgICAgICAgcz8ucmVtb3ZlKCk7XHJcblxyXG4gICAgICAgIGRvYy5yZW1vdmVFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgbG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcbiAgICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgXHJcbiAgICB1bmxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xyXG4gICAgICAgICAgICB0aGlzLnVubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgXHJcbiAgICBnZXRBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBwdXNoIHRoZSBtYWluIHdpbmRvdydzIHJvb3Qgc3BsaXQgdG8gdGhlIGxpc3RcclxuICAgICAgICB3aW5kb3dzLnB1c2godGhpcy5hcHAud29ya3NwYWNlLnJvb3RTcGxpdC53aW4pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEB0cy1pZ25vcmUgZmxvYXRpbmdTcGxpdCBpcyB1bmRvY3VtZW50ZWRcclxuICAgICAgICBjb25zdCBmbG9hdGluZ1NwbGl0ID0gdGhpcy5hcHAud29ya3NwYWNlLmZsb2F0aW5nU3BsaXQ7XHJcbiAgICAgICAgZmxvYXRpbmdTcGxpdC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgYSB3aW5kb3csIHB1c2ggaXQgdG8gdGhlIGxpc3QgXHJcbiAgICAgICAgICAgIGlmIChjaGlsZCBpbnN0YW5jZW9mIFdvcmtzcGFjZVdpbmRvdykge1xyXG4gICAgICAgICAgICAgICAgd2luZG93cy5wdXNoKGNoaWxkLndpbik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHdpbmRvd3M7XHJcbiAgICB9XHJcbiAgXHJcbiAgXHJcbiAgICByZWdpc3RlclRpa3pDb2RlQmxvY2soKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrelwiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGVsLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XHJcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICAgICAgICAgICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB0cnl7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBzY3JpcHQgPSBlbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcclxuICAgICAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xyXG4gICAgICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpa3pqYXg9bmV3IEZvcm1hdFRpa3pqYXgoc291cmNlLGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLHRpa3pqYXguZ2V0Q29kZSgpKS5vcGVuKCk7XHJcbiAgICAgICAgICAgICAgICBzY3JpcHQuc2V0VGV4dCh0aWt6amF4LmdldENvZGUoKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2goZSl7XHJcbiAgICAgICAgICAgICAgICBlbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3JEaXNwbGF5ID0gZWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibWF0aC1lcnJvci1saW5lXCIgfSk7XHJcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuaW5uZXJUZXh0ID0gYEVycm9yOiAke2UubWVzc2FnZX1gO1xyXG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmNsYXNzTGlzdC5hZGQoXCJlcnJvci10ZXh0XCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIlRpa1ogUHJvY2Vzc2luZyBFcnJvcjpcIiwgZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgICBhZGRTeW50YXhIaWdobGlnaHRpbmcoKSB7XHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5wdXNoKHtuYW1lOiBcIlRpa3pcIiwgbWltZTogXCJ0ZXh0L3gtbGF0ZXhcIiwgbW9kZTogXCJzdGV4XCJ9KTtcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICByZW1vdmVTeW50YXhIaWdobGlnaHRpbmcoKSB7XHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mbyA9IHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLmZpbHRlcihlbCA9PiBlbC5uYW1lICE9IFwiVGlrelwiKTtcclxuICAgICAgfVxyXG5cclxuICBcclxuICAgICAgY29sb3JTVkdpbkRhcmtNb2RlKHN2Zzogc3RyaW5nKSB7XHJcbiAgICAgICAgc3ZnID0gc3ZnLnJlcGxhY2VBbGwoLyhcIiMwMDBcInxcImJsYWNrXCIpL2csIFwiXFxcImN1cnJlbnRDb2xvclxcXCJcIilcclxuICAgICAgICAgICAgICAgIC5yZXBsYWNlQWxsKC8oXCIjZmZmXCJ8XCJ3aGl0ZVwiKS9nLCBcIlxcXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXFxcIlwiKTtcclxuICAgICAgICByZXR1cm4gc3ZnO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgXHJcbiAgICAgIG9wdGltaXplU1ZHKHN2Zzogc3RyaW5nKSB7XHJcbiAgICAgICAgICByZXR1cm4gb3B0aW1pemUoc3ZnLCB7cGx1Z2luczpcclxuICAgICAgICAgICAgICBbXHJcbiAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFwicHJlc2V0LWRlZmF1bHRcIixcclxuICAgICAgICAgICAgICAgICAgICAgIHBhcmFtczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJyaWRlczoge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbnVwSURzOiBmYWxzZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIF1cclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIH0pPy5kYXRhO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgXHJcbiAgICAgIHBvc3RQcm9jZXNzU3ZnID0gKGU6IEV2ZW50KSA9PiB7XHJcbiAgXHJcbiAgICAgICAgICBjb25zdCBzdmdFbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xyXG4gICAgICAgICAgbGV0IHN2ZyA9IHN2Z0VsLm91dGVySFRNTDtcclxuICBcclxuICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKSB7XHJcbiAgICAgICAgICAgIHN2ZyA9IHRoaXMuY29sb3JTVkdpbkRhcmtNb2RlKHN2Zyk7XHJcbiAgICAgICAgICB9XHJcbiAgXHJcbiAgICAgICAgICBzdmcgPSB0aGlzLm9wdGltaXplU1ZHKHN2Zyk7XHJcbiAgXHJcbiAgICAgICAgICBzdmdFbC5vdXRlckhUTUwgPSBzdmc7XHJcbiAgICB9XHJcbn1cclxuZXhwb3J0IGNvbnN0IGFyclRvUmVnZXhTdHJpbmcgPSAoYXJyOiBBcnJheTxzdHJpbmc+KSA9PiAnKCcgKyBhcnIuam9pbignfCcpICsgJyknO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcgfCBSZWdFeHAgfCBBcnJheTxzdHJpbmc+LCBmbGFnczogc3RyaW5nID0gJycpOiBSZWdFeHAge1xyXG4gICAgaWYgKHBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApIHtcclxuICAgICAgICBwYXR0ZXJuID0gcGF0dGVybi5zb3VyY2U7XHJcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkocGF0dGVybikpIHtcclxuICAgICAgICBwYXR0ZXJuID0gYXJyVG9SZWdleFN0cmluZyhwYXR0ZXJuKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBDcmVhdGUgYW5kIHJldHVybiB0aGUgUmVnRXhwXHJcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChTdHJpbmcucmF3YCR7cGF0dGVybn1gLCBmbGFncyk7XHJcbn1cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRSZWdleCgpe1xyXG4gICAgY29uc3QgYmFzaWMgPSBTdHJpbmcucmF3YFtcXHdcXGRcXHMtLC46XWA7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGJhc2ljOiBiYXNpYyxcclxuICAgICAgICBtZXJnZTogU3RyaW5nLnJhd2AtXFx8fFxcfC18IVtcXGQuXSshfFxcK3wtYCxcclxuICAgICAgICAvL2Nvb3JkaW5hdGU6IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoJHtiYXNpY30rfDEpYCksXHJcbiAgICAgICAgY29vcmRpbmF0ZU5hbWU6IFN0cmluZy5yYXdgW1xcd19cXGRcXHNdYCxcclxuICAgICAgICB0ZXh0OiBTdHJpbmcucmF3YFtcXHdcXHMtLC46J1xcJFxcKCFcXClfK1xcXFx7fT1dYCxcclxuICAgICAgICBmb3JtYXR0aW5nOiBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsmKnt9KCklLTw+XWBcclxuICAgIH07XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmludGVyZmFjZSB0b2tlbiAge1xyXG4gICAgWD86IG51bWJlcjtcclxuICAgIFk/OiBudW1iZXI7XHJcbiAgICB0eXBlPzogc3RyaW5nO1xyXG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlcz86IGFueTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZmluZEJlZm9yZUFmdGVyQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPiwgaW5kZXg6IG51bWJlcik6IHsgYmVmb3JlOiBudW1iZXIsIGFmdGVyOiBudW1iZXIgfSB7XHJcbiAgICBcclxuICAgIGxldCBiZWZvcmVJbmRleCA9IGF4ZXMuc2xpY2UoMCwgaW5kZXgpLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgbGV0IGFmdGVySW5kZXggPSBheGVzLnNsaWNlKGluZGV4ICsgMSkuZmluZEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcclxuXHJcbiAgICAvLyBBZGp1c3QgYGFmdGVySW5kZXhgIHNpbmNlIHdlIHNsaWNlZCBmcm9tIGBpbmRleCArIDFgXHJcbiAgICBpZiAoYWZ0ZXJJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICBhZnRlckluZGV4ICs9IGluZGV4ICsgMTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBXcmFwIGFyb3VuZCBpZiBub3QgZm91bmRcclxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gLTEpIHtcclxuICAgICAgICBiZWZvcmVJbmRleCA9IGF4ZXMuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGFmdGVySW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgYWZ0ZXJJbmRleCA9IGF4ZXMuZmluZEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgIH1cclxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gLTEgfHwgYWZ0ZXJJbmRleCA9PT0gLTEpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIHZhbGlkIEF4aXMgb2JqZWN0cy5cIik7XHJcbiAgICB9XHJcbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IGFmdGVySW5kZXgpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQcmFpc2VkIGF4aXMgYXMgc2FtZSB0b2tlblwiKTtcclxuICAgIH1cclxuICAgIHJldHVybiB7IGJlZm9yZTogYmVmb3JlSW5kZXgsIGFmdGVyOiBhZnRlckluZGV4IH07XHJcbn1cclxuXHJcblxyXG5leHBvcnQgY2xhc3MgQXhpcyB7XHJcbiAgICBjYXJ0ZXNpYW5YOiBudW1iZXI7XHJcbiAgICBjYXJ0ZXNpYW5ZOiBudW1iZXI7XHJcbiAgICBwb2xhckFuZ2xlOiBudW1iZXI7XHJcbiAgICBwb2xhckxlbmd0aDogbnVtYmVyO1xyXG4gICAgbmFtZT86IHN0cmluZztcclxuICAgIHF1YWRyYW50PzogbnVtYmVyO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyLG5hbWU/OiBzdHJpbmcpIHtcclxuICAgICAgICBpZiAoY2FydGVzaWFuWCAhPT0gdW5kZWZpbmVkKSB0aGlzLmNhcnRlc2lhblggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgIGlmIChjYXJ0ZXNpYW5ZICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWSA9IGNhcnRlc2lhblk7XHJcbiAgICAgICAgaWYgKHBvbGFyTGVuZ3RoICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJMZW5ndGggPSBwb2xhckxlbmd0aDtcclxuICAgICAgICBpZiAocG9sYXJBbmdsZSAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyQW5nbGUgPSBwb2xhckFuZ2xlO1xyXG4gICAgICAgIHRoaXMubmFtZT1uYW1lXHJcbiAgICB9XHJcbiAgICBcclxuICAgIGNsb25lKCk6IEF4aXMge1xyXG4gICAgICAgIHJldHVybiBuZXcgQXhpcyh0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSx0aGlzLnBvbGFyTGVuZ3RoLHRoaXMucG9sYXJBbmdsZSx0aGlzLm5hbWUpO1xyXG4gICAgfVxyXG4gICAgcGFyc2VJbnB1dChpbnB1dDogYW55KSB7XHJcbiAgICAgICAgY29uc3QgYXhlcz1bXVxyXG4gICAgICAgIGNvbnN0IGJyYWNrZXRNYXAgPSBtYXBCcmFja2V0cygnUGFyZW50aGVzZXNfb3BlbicsIGlucHV0KTtcclxuICAgICAgICBheGVzLnB1c2godGhpcy5wcm9jZXNzSW5kaXZpZHVhbChpbnB1dCkpO1xyXG4gICAgICAgICAgICBpZihheGVzLmxlbmd0aD09PTEpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYXhlc1swXVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcm9jZXNzSW5kaXZpZHVhbChpbnB1dDogYW55KSB7XHJcbiAgICAgICAgbGV0IGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgIGNvbnN0IGlzQ2FydGVzaWFuID0gaW5wdXQuc29tZSgodG9rZW46IGFueSkgPT4gdG9rZW4ubmFtZSA9PT0gJ0NvbW1hJyk7XHJcbiAgICAgICAgaW5wdXQgPSBpbnB1dC5maWx0ZXIoKHRva2VuOiBhbnkpID0+IHRva2VuLnR5cGUgIT09ICdTeW50YXgnKTtcclxuICAgICAgICBpZiAoaXNDYXJ0ZXNpYW4gJiYgaW5wdXQubGVuZ3RoID09PSAyKSB7XHJcbiAgICAgICAgICAgIGF4aXMuY2FydGVzaWFuWCA9IGlucHV0WzBdLnZhbHVlO1xyXG4gICAgICAgICAgICBheGlzLmNhcnRlc2lhblkgPSBpbnB1dFsxXS52YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGF4aXM7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB1bml2ZXJzYWwoY29vcmRpbmF0ZTogc3RyaW5nLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGFuY2hvckFycj86IGFueSxhbmNob3I/OiBzdHJpbmcpOiBBeGlzIHtcclxuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZUFycjogQXJyYXk8QXhpc3xzdHJpbmc+ID0gW107XHJcbiAgICAgICAgbWF0Y2hlcy5mb3JFYWNoKChtYXRjaDogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xyXG4gICAgICAgICAgICBsZXQgYXhpczogQXhpc3x1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5hZGRDYXJ0ZXNpYW4obWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgLzovLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkUG9sYXIobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMucG9sYXJUb0NhcnRlc2lhbigpXHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvIVtcXGQuXSshLy50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAoL1tcXGRcXHddKy8pLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpe31cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy9heGlzID0gdG9rZW5zLmZpbmRPcmlnaW5hbFZhbHVlKG1hdGNoKT8uYXhpcztcclxuICAgICAgICAgICAgICAgICAgICBlbHNlIHRocm93IG5ldyBFcnJvcihgVHJpZWQgdG8gZmluZCBvcmlnaW5hbCBjb29yZGluYXRlIHZhbHVlIHdoaWxlIG5vdCBiZWluZyBwcm92aWRlZCB3aXRoIHRva2Vuc2ApO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghYXhpcykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgdGhlIGNvb3JkaW5hdGUgJHttYXRjaH0gZnJvbSAke2Nvb3JkaW5hdGV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVyblxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBheGlzLm5hbWU9bWF0Y2hcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLm1lcmdlQXhpcyhjb29yZGluYXRlQXJyKVxyXG5cclxuICAgICAgICBpZihhbmNob3JBcnImJmFuY2hvciYmYW5jaG9yLm1hdGNoKC8oLS1cXCt8LS1cXCtcXCspLykpe1xyXG4gICAgICAgICAgICBsZXQgYTogQXhpc1xyXG4gICAgICAgICAgICBpZiAoYW5jaG9yLm1hdGNoKC8oLS1cXCspLykpe1xyXG4gICAgICAgICAgICAgICAgYT1hbmNob3JBcnIuZmluZCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgICAgICB9ZWxzZXtcclxuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmRMYXN0KChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGEsXCJhZGRpdGlvblwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBtZXJnZUF4aXMoYXhlczogQXJyYXk8QXhpcyB8IHN0cmluZz4pIHtcclxuICAgICAgICBpZiAoIWF4ZXMuc29tZSgoYXhpczogYW55KSA9PiB0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIikpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCAoYXhlc1swXSBhcyBBeGlzKS5jbG9uZSgpKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBheGlzIG9mIGF4ZXMpIHtcclxuICAgICAgICAgICAgaWYodHlwZW9mIGF4aXMgPT09IFwic3RyaW5nXCIpe2NvbnRpbnVlO31cclxuICAgICAgICAgICAgYXhpcy5uYW1lPXVuZGVmaW5lZFxyXG4gICAgICAgIH1cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGF4ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IGF4ZXNbaV07XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudCAhPT0gXCJzdHJpbmdcIikgY29udGludWU7XHJcbiAgICAgICAgICAgIGNvbnN0IHNpZGVzID0gZmluZEJlZm9yZUFmdGVyQXhpcyhheGVzLCBpKTtcclxuICAgICAgICAgICAgY29uc3QgYmVmb3JlQXhpcyA9IGF4ZXNbc2lkZXMuYmVmb3JlXSBhcyBBeGlzO1xyXG4gICAgICAgICAgICBjb25zdCBhZnRlckF4aXMgPSBheGVzW3NpZGVzLmFmdGVyXSBhcyBBeGlzO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgbGV0ICBtYXRjaCA9IGN1cnJlbnQubWF0Y2goL15cXCskLyk7XHJcbiAgICAgICAgICAgIGxldCBtb2RlLG1vZGlmaWVycztcclxuICAgICAgICAgICAgaWYgKG1hdGNoKXtcclxuICAgICAgICAgICAgICAgIG1vZGUgPSBcImFkZGl0aW9uXCJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaD1jdXJyZW50Lm1hdGNoKC9eLVxcfCQvKVxyXG4gICAgICAgICAgICBpZighbW9kZSYmbWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgbW9kZSA9IFwicmlnaHRQcm9qZWN0aW9uXCJcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBtYXRjaD1jdXJyZW50Lm1hdGNoKC9eXFwhKFtcXGQuXSspXFwhJC8pXHJcbiAgICAgICAgICAgIGlmKCFtb2RlJiZtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJpbnRlcm5hbFBvaW50XCJcclxuICAgICAgICAgICAgICAgIG1vZGlmaWVycz10b051bWJlcihtYXRjaFsxXSlcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYobW9kZSl7XHJcbiAgICAgICAgICAgICAgICBheGVzLnNwbGljZShzaWRlcy5iZWZvcmUsIHNpZGVzLmFmdGVyIC0gc2lkZXMuYmVmb3JlICsgMSwgYmVmb3JlQXhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGFmdGVyQXhpcyxtb2RlLG1vZGlmaWVycykpO1xyXG4gICAgICAgICAgICAgICAgaSA9IHNpZGVzLmJlZm9yZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChheGVzLmxlbmd0aCA9PT0gMSAmJiBheGVzWzBdIGluc3RhbmNlb2YgQXhpcykge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBjb21wbGV4Q2FydGVzaWFuQWRkKGF4aXM6IEF4aXMsbW9kZTogc3RyaW5nLG1vZGlmaWVyPzogYW55KXtcclxuICAgICAgICBzd2l0Y2ggKG1vZGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImFkZGl0aW9uXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblgrPWF4aXMuY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWSs9YXhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJzdWJ0cmFjdGlvblwiOlxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJyaWdodFByb2plY3Rpb25cIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD1heGlzLmNhcnRlc2lhblhcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiaW50ZXJuYWxQb2ludFwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPSh0aGlzLmNhcnRlc2lhblgrYXhpcy5jYXJ0ZXNpYW5YKSptb2RpZmllcjtcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWT0odGhpcy5jYXJ0ZXNpYW5ZK2F4aXMuY2FydGVzaWFuWSkqbW9kaWZpZXI7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKClcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfTtcclxuXHJcblxyXG4gICAgZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZTogc3RyaW5nKXtcclxuICAgICAgICBjb25zdCByZWdleFBhdHRlcm4gPSBnZXRSZWdleCgpO1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbXHJcbiAgICAgICAgICAgIHJlZ0V4cChTdHJpbmcucmF3YCgke3JlZ2V4UGF0dGVybi5iYXNpY30rKWAsIFwiZ1wiKSxcclxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLm1lcmdlfSspYCwgXCJnXCIpXHJcbiAgICAgICAgXTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTdGVwIDE6IEV4dHJhY3QgbWF0Y2hlcyBmb3IgZWFjaCBwYXR0ZXJuIHNlcGFyYXRlbHlcclxuICAgICAgICBjb25zdCBiYXNpY01hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1swXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcclxuICAgICAgICAgICAgZnVsbE1hdGNoOiBtYXRjaFswXS5yZXBsYWNlKC8tJC9nLCBcIlwiKSwgLy8gUmVtb3ZlIHRyYWlsaW5nIGh5cGhlbiBvbmx5XHJcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxyXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aC0obWF0Y2hbMF0ubWF0Y2goLy0kLyk/MTowKVxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtZXJnZU1hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1sxXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcclxuICAgICAgICAgICAgZnVsbE1hdGNoOiBtYXRjaFswXSxcclxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXHJcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIGNvbnN0IG1hdGNoZXM6IEFycmF5PHsgZnVsbE1hdGNoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyIH0+ID0gW107XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIGlzT3ZlcmxhcHBpbmcobWF0Y2gxOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0sIG1hdGNoMjogeyBpbmRleDogbnVtYmVyOyBsZW5ndGg6IG51bWJlciB9KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDEuaW5kZXggPCBtYXRjaDIuaW5kZXggKyBtYXRjaDIubGVuZ3RoICYmIG1hdGNoMi5pbmRleCA8IG1hdGNoMS5pbmRleCArIG1hdGNoMS5sZW5ndGg7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBbLi4uYmFzaWNNYXRjaGVzLCAuLi5tZXJnZU1hdGNoZXNdLmZvckVhY2gobWF0Y2ggPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBvdmVybGFwcGluZ0luZGV4ID0gbWF0Y2hlcy5maW5kSW5kZXgoZXhpc3RpbmdNYXRjaCA9PiBpc092ZXJsYXBwaW5nKGV4aXN0aW5nTWF0Y2gsIG1hdGNoKSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob3ZlcmxhcHBpbmdJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nTWF0Y2ggPSBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgY3VycmVudCBtYXRjaCBjb3ZlcnMgYSBsYXJnZXIgcmFuZ2UsIHJlcGxhY2UgdGhlIGV4aXN0aW5nIG9uZVxyXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA+IGV4aXN0aW5nTWF0Y2gubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XSA9IG1hdGNoO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKG1hdGNoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgMzogU29ydCB0aGUgZmluYWwgbWF0Y2hlcyBieSBpbmRleFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgNDogVmFsaWRhdGUgdGhlIHJlc3VsdFxyXG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb29yZGluYXRlIGlzIG5vdCB2YWxpZDsgZXhwZWN0ZWQgYSB2YWxpZCBjb29yZGluYXRlLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG1hdGNoZXM7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgcHJvamVjdGlvbihheGlzMTogQXhpc3x1bmRlZmluZWQsYXhpczI6IEF4aXN8dW5kZWZpbmVkKTphbnl7XHJcbiAgICAgICAgaWYgKCFheGlzMXx8IWF4aXMyKXt0aHJvdyBuZXcgRXJyb3IoXCJheGlzJ3Mgd2VyZSB1bmRlZmluZWQgYXQgcHJvamVjdGlvblwiKTt9XHJcbiAgICAgICAgcmV0dXJuIFt7WDogYXhpczEuY2FydGVzaWFuWCxZOiBheGlzMi5jYXJ0ZXNpYW5ZfSx7WDogYXhpczIuY2FydGVzaWFuWCxZOiBheGlzMS5jYXJ0ZXNpYW5ZfV1cclxuICAgIH1cclxuXHJcbiAgICBjb21iaW5lKGNvb3JkaW5hdGVBcnI6IGFueSl7XHJcbiAgICAgICAgbGV0IHg9MCx5PTA7XHJcbiAgICAgICAgY29vcmRpbmF0ZUFyci5mb3JFYWNoKChjb29yZGluYXRlOiBBeGlzKT0+e1xyXG4gICAgICAgICAgICB4Kz1jb29yZGluYXRlLmNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIHkrPWNvb3JkaW5hdGUuY2FydGVzaWFuWTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIFxyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWD14O3RoaXMuY2FydGVzaWFuWT15O1xyXG4gICAgfVxyXG4gICAgYWRkQ2FydGVzaWFuKHg6IHN0cmluZyB8IG51bWJlciwgeT86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICgheSAmJiB0eXBlb2YgeCA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICBbeCwgeV0gPSB4LnNwbGl0KFwiLFwiKS5tYXAoTnVtYmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCB8fCB5ID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBDYXJ0ZXNpYW4gY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNhcnRlc2lhblggPSB4IGFzIG51bWJlcjtcclxuICAgICAgICB0aGlzLmNhcnRlc2lhblkgPSB5IGFzIG51bWJlcjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcG9sYXJUb0NhcnRlc2lhbigpe1xyXG4gICAgICAgIGNvbnN0IHRlbXA9cG9sYXJUb0NhcnRlc2lhbih0aGlzLnBvbGFyQW5nbGUsIHRoaXMucG9sYXJMZW5ndGgpXHJcbiAgICAgICAgdGhpcy5hZGRDYXJ0ZXNpYW4odGVtcC5YLHRlbXAuWSlcclxuICAgIH1cclxuXHJcbiAgICBjYXJ0ZXNpYW5Ub1BvbGFyKCl7XHJcbiAgICAgICAgY29uc3QgdGVtcD1jYXJ0ZXNpYW5Ub1BvbGFyKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZKVxyXG4gICAgICAgIHRoaXMuYWRkUG9sYXIodGVtcC5hbmdsZSx0ZW1wLmxlbmd0aClcclxuICAgIH1cclxuXHJcbiAgICBhZGRQb2xhcihhbmdsZTogc3RyaW5nIHwgbnVtYmVyLCBsZW5ndGg/OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIWxlbmd0aCAmJiB0eXBlb2YgYW5nbGUgPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgICAgW2FuZ2xlLCBsZW5ndGhdID0gYW5nbGUuc3BsaXQoXCI6XCIpLm1hcChOdW1iZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoYW5nbGUgPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHBvbGFyIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5wb2xhckFuZ2xlID0gYW5nbGUgYXMgbnVtYmVyO1xyXG4gICAgICAgIHRoaXMucG9sYXJMZW5ndGggPSBsZW5ndGggYXMgbnVtYmVyO1xyXG4gICAgfVxyXG4gICAgYWRkUXVhZHJhbnQobWlkUG9pbnQ6IEF4aXMpe1xyXG4gICAgICAgIGNvbnN0IHg9bWlkUG9pbnQuY2FydGVzaWFuWD50aGlzLmNhcnRlc2lhblg7XHJcbiAgICAgICAgY29uc3QgeT1taWRQb2ludC5jYXJ0ZXNpYW5ZPnRoaXMuY2FydGVzaWFuWTtcclxuICAgICAgICB0aGlzLnF1YWRyYW50PXg/eT8xOjQ6eT8yOjM7XHJcbiAgICB9XHJcbiAgICB0b1N0cmluZ1NWRyhib3VuZHM6IFN2Z0JvdW5kcyk6IHN0cmluZyB7XHJcbiAgICAgICAgY29uc3Qgbm9ybWFsaXplZFggPSAoKHRoaXMuY2FydGVzaWFuWCAtIGJvdW5kcy5taW4uY2FydGVzaWFuWCkgLyAoYm91bmRzLm1heC5jYXJ0ZXNpYW5YIC0gYm91bmRzLm1pbi5jYXJ0ZXNpYW5YKSkgKiBib3VuZHMuZ2V0V2lkdGgoKTtcclxuICAgICAgICBjb25zdCBub3JtYWxpemVkWSA9IGJvdW5kcy5nZXRIZWlnaHQoKSAtICgodGhpcy5jYXJ0ZXNpYW5ZIC0gYm91bmRzLm1pbi5jYXJ0ZXNpYW5ZKSAvIChib3VuZHMubWF4LmNhcnRlc2lhblkgLSBib3VuZHMubWluLmNhcnRlc2lhblkpKSAqIGJvdW5kcy5nZXRIZWlnaHQoKTtcclxuICAgIFxyXG4gICAgICAgIHJldHVybiBgJHtub3JtYWxpemVkWH0gJHtub3JtYWxpemVkWX1gO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIsXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgfVxyXG5cclxuICAgIGludGVyc2VjdGlvbihjb29yZDogc3RyaW5nLCBmaW5kT3JpZ2luYWxWYWx1ZTogKGNvb3JkOiBzdHJpbmcpID0+IENvb3JkaW5hdGUgfCB1bmRlZmluZWQpOiB7WDpudW1iZXIsWTpudW1iZXJ9IHtcclxuICAgICAgICBjb25zdCBvcmlnaW5hbENvb3JkcyA9IGNvb3JkXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFxzKmFuZFxccz98LS0pL2csIFwiIFwiKVxyXG4gICAgICAgICAgICAuc3BsaXQoXCIgXCIpXHJcbiAgICAgICAgICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHRva2VuKTogdG9rZW4gaXMgQ29vcmRpbmF0ZSA9PiB0b2tlbiAhPT0gdW5kZWZpbmVkKTtcclxuXHJcbiAgICAgICAgaWYgKG9yaWdpbmFsQ29vcmRzLmxlbmd0aCA8IDQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW50ZXJzZWN0aW9uIGhhZCB1bmRlZmluZWQgY29vcmRpbmF0ZXMgb3IgaW5zdWZmaWNpZW50IGRhdGEuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBzbG9wZXMgPSBbXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzFdLmF4aXMgYXMgQXhpcyksXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1syXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzNdLmF4aXMgYXMgQXhpcyksXHJcbiAgICAgICAgXTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGZpbmRJbnRlcnNlY3Rpb25Qb2ludChvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdG9Qb2ludCh2YWx1ZTpudW1iZXIsZm9ybWF0OiBzdHJpbmcpe1xyXG4gICAgc3dpdGNoIChmb3JtYXQpIHtcclxuICAgICAgICBjYXNlIFwiUG9pbnRcIjpcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIGNhc2UgXCJjbVwiOiBcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKjI4LjM0NjtcclxuICAgICAgICBjYXNlIFwibW1cIjpcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKiAyLjgzNDY7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidW5rbm9uIGZvcm1hdFwiKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIG1hdGNoS2V5V2l0aFZhbHVlKGtleTogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgIGNvbnN0IHZhbHVlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgICAgIFwiYW5jaG9yXCI6IFwiYW5jaG9yPVwiLFxyXG4gICAgICAgIFwicm90YXRlXCI6IFwicm90YXRlPVwiLFxyXG4gICAgICAgIFwibGluZVdpZHRoXCI6IFwibGluZSB3aWR0aD1cIixcclxuICAgICAgICBcImZpbGxcIjogXCJmaWxsPVwiLFxyXG4gICAgICAgIFwiZmlsbE9wYWNpdHlcIjogXCJmaWxsIG9wYWNpdHk9XCIsXHJcbiAgICAgICAgXCJ0ZXh0T3BhY2l0eVwiOiBcInRleHQgb3BhY2l0eT1cIixcclxuICAgICAgICBcInRleHRDb2xvclwiOiBcInRleHQgY29sb3I9XCIsXHJcbiAgICAgICAgXCJkcmF3XCI6IFwiZHJhdz1cIixcclxuICAgICAgICBcInRleHRcIjogXCJ0ZXh0PVwiLFxyXG4gICAgICAgIFwicG9zXCI6IFwicG9zPVwiLFxyXG4gICAgICAgIFwic2NhbGVcIjogXCJzY2FsZT1cIixcclxuICAgICAgICBcImRlY29yYXRlXCI6IFwiZGVjb3JhdGVcIixcclxuICAgICAgICBcInNsb3BlZFwiOiBcInNsb3BlZFwiLFxyXG4gICAgICAgIFwiZGVjb3JhdGlvblwiOiBcImRlY29yYXRpb249XCIsXHJcbiAgICAgICAgXCJicmFjZVwiOiBcImJyYWNlXCIsXHJcbiAgICAgICAgXCJhbXBsaXR1ZGVcIjogXCJhbXBsaXR1ZGU9XCIsXHJcbiAgICAgICAgXCJhbmdsZVJhZGl1c1wiOiBcImFuZ2xlIHJhZGl1cz1cIixcclxuICAgICAgICBcImFuZ2xlRWNjZW50cmljaXR5XCI6IFwiYW5nbGUgZWNjZW50cmljaXR5PVwiLFxyXG4gICAgICAgIFwiZm9udFwiOiBcImZvbnQ9XCIsXHJcbiAgICAgICAgXCJwaWNUZXh0XCI6IFwicGljIHRleHQ9XCIsXHJcbiAgICAgICAgXCJsYWJlbFwiOiBcImxhYmVsPVwiLFxyXG4gICAgICAgIFwiZnJlZUZvcm1UZXh0XCI6ICc6JyxcclxuICAgIH07XHJcblxyXG4gICAgcmV0dXJuIHZhbHVlTWFwW2tleV0gfHwgJyc7XHJcbn1cclxuXHJcblxyXG50eXBlIERlY29yYXRpb24gPSB7XHJcbiAgICBicmFjZT86IGJvb2xlYW47XHJcbiAgICBjb2lsOiBib29sZWFuO1xyXG4gICAgYW1wbGl0dWRlPzogbnVtYmVyO1xyXG4gICAgYXNwZWN0PzogbnVtYmVyO1xyXG4gICAgc2VnbWVudExlbmd0aD86IG51bWJlcjtcclxuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uOyBcclxufTtcclxuXHJcbnR5cGUgTGFiZWwgPSB7XHJcbiAgICBmcmVlRm9ybVRleHQ/OiBzdHJpbmc7XHJcbiAgICBjb2xvcj86IHN0cmluZztcclxuICAgIG9wYWNpdHk/OiBudW1iZXJcclxufTtcclxuY29uc3QgZGVmYXVsdFZhbHVlczogUmVjb3JkPHN0cmluZywgYW55PiA9IHtcclxuICAgIGZyZWVGb3JtVGV4dDogXCJcIixcclxuICAgIGNvbG9yOiBcIlwiLFxyXG4gICAgb3BhY2l0eTogMSxcclxufTtcclxuXHJcbmZ1bmN0aW9uIGxpbmVXaWR0aENvbnZlcnRlcih3aWR0aDogc3RyaW5nKXtcclxuICAgIHJldHVybiBOdW1iZXIod2lkdGgucmVwbGFjZSgvdWx0cmFcXHMqdGhpbi8sXCIwLjFcIilcclxuICAgIC5yZXBsYWNlKC92ZXJ5XFxzKnRoaW4vLFwiMC4yXCIpXHJcbiAgICAucmVwbGFjZSgvdGhpbi8sXCIwLjRcIilcclxuICAgIC5yZXBsYWNlKC9zZW1pdGhpY2svLFwiMC42XCIpXHJcbiAgICAucmVwbGFjZSgvdGhpY2svLFwiMC44XCIpXHJcbiAgICAucmVwbGFjZSgvdmVyeVxccyp0aGljay8sXCIxLjJcIilcclxuICAgIC5yZXBsYWNlKC91bHRyYVxccyp0aGljay8sXCIxLjZcIikpXHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBGb3JtYXR0aW5ne1xyXG4gICAgLy8gaW1wb3J0ZW50IG5lZWRzIHRvIGJlIGZvcnN0XHJcbiAgICBwYXRoPzogc3RyaW5nO1xyXG5cclxuICAgIHNjYWxlOiBudW1iZXI7XHJcbiAgICByb3RhdGU/OiBudW1iZXI7XHJcbiAgICBsaW5lV2lkdGg/OiBudW1iZXI9MC40O1xyXG4gICAgdGV4dE9wYWNpdHk6IG51bWJlcjtcclxuICAgIG9wYWNpdHk/OiBudW1iZXI7XHJcbiAgICBmaWxsT3BhY2l0eT86IG51bWJlcjtcclxuICAgIHBvcz86IG51bWJlcjtcclxuICAgIGFuZ2xlRWNjZW50cmljaXR5PzogbnVtYmVyO1xyXG4gICAgYW5nbGVSYWRpdXM/OiBudW1iZXI7XHJcbiAgICBsZXZlbERpc3RhbmNlPzogbnVtYmVyO1xyXG5cclxuICAgIG1vZGU6IHN0cmluZztcclxuICAgIGFuY2hvcj86IHN0cmluZztcclxuICAgIGNvbG9yPzogc3RyaW5nO1xyXG4gICAgdGV4dENvbG9yPzogc3RyaW5nO1xyXG4gICAgZmlsbD86IHN0cmluZztcclxuICAgIGFycm93Pzogc3RyaW5nO1xyXG4gICAgZHJhdz86IHN0cmluZztcclxuICAgIHRleHQ/OiBzdHJpbmc7XHJcbiAgICB0aWt6c2V0Pzogc3RyaW5nO1xyXG4gICAgcG9zaXRpb24/OiBzdHJpbmc7XHJcbiAgICBsaW5lU3R5bGU/OiBzdHJpbmc7XHJcbiAgICBmb250Pzogc3RyaW5nO1xyXG4gICAgcGljVGV4dD86IHN0cmluZztcclxuICAgIFxyXG4gICAgc2xvcGVkPzogYm9vbGVhbjtcclxuICAgIGRlY29yYXRlPzogYm9vbGVhbjtcclxuICAgIGxhYmVsPzogTGFiZWw7XHJcbiAgICBkZWNvcmF0aW9uPzogRGVjb3JhdGlvbjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihmb3JtYXR0aW5nOiBhbnlbXSxtb2RlPzogc3RyaW5nKXtcclxuICAgICAgICBpZihtb2RlKXRoaXMubW9kZT1tb2RlO1xyXG4gICAgICAgIHRoaXMuYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nfHxbXSk7XHJcbiAgICB9XHJcblxyXG5cclxuICAgIGFzc2lnbkZvcm1hdHRpbmcoXHJcbiAgICAgICAgZm9ybWF0dGluZ0FycjogQXJyYXk8eyBrZXk6IHN0cmluZzsgdmFsdWU6IGFueSB9PixcclxuICAgICAgICB0YXJnZXRTY29wZTogUmVjb3JkPHN0cmluZywgYW55PiA9IHRoaXNcclxuICAgICkge1xyXG4gICAgICAgIGZvciAoY29uc3QgeyBrZXksIHZhbHVlIH0gb2YgZm9ybWF0dGluZ0Fycikge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZEtleSA9IE9iamVjdC5rZXlzKHRhcmdldFNjb3BlKS5maW5kKFxyXG4gICAgICAgICAgICAgICAgKHByb3ApID0+IHByb3AudG9Mb3dlckNhc2UoKSA9PT0ga2V5LnRvTG93ZXJDYXNlKClcclxuICAgICAgICAgICAgKSB8fCBrZXk7XHJcbiAgICBcclxuICAgICAgICAgICAgaWYgKHRoaXMuaXNOZXN0ZWQodmFsdWUpKSB7XHJcbiAgICAgICAgICAgICAgICB0YXJnZXRTY29wZVtub3JtYWxpemVkS2V5XSA9IHRhcmdldFNjb3BlW25vcm1hbGl6ZWRLZXldIHx8IHRoaXMuY3JlYXRlTmVzdGVkKG5vcm1hbGl6ZWRLZXkpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hc3NpZ25Gb3JtYXR0aW5nKHZhbHVlLHRhcmdldFNjb3BlW25vcm1hbGl6ZWRLZXldKVxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgICAgIHRhcmdldFNjb3BlW25vcm1hbGl6ZWRLZXldPXZhbHVlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHNldFByb3BlcnR5KHNjb3BlOiBhbnksIGtleTogYW55LCB2YWx1ZTogYW55KTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBzY29wZSA9PT0gXCJvYmplY3RcIiAmJiBzY29wZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzY29wZVtrZXldID0gdmFsdWU7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkludmFsaWQgc2NvcGUgcHJvdmlkZWQuIEV4cGVjdGVkIGFuIG9iamVjdCBidXQgcmVjZWl2ZWQ6XCIsIHNjb3BlKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIGNyZWF0ZU5lc3RlZChrZXk6IHN0cmluZykge1xyXG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2xhYmVsJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiB7IGNvbG9yOiB1bmRlZmluZWQsIG9wYWNpdHk6IHVuZGVmaW5lZCxmcmVlRm9ybVRleHQ6IHVuZGVmaW5lZCB9O1xyXG4gICAgICAgICAgICBjYXNlICdkZWNvcmF0aW9uJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJhY2U6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgICAgICBjb2lsOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICBhbXBsaXR1ZGU6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgICAgICBhc3BlY3Q6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgICAgICBzZWdtZW50TGVuZ3RoOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgZGVjb3JhdGlvbjogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHJldHVybiB7fTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGlzTmVzdGVkKHZhbHVlOiBhbnkpe1xyXG4gICAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5zb21lKChpdGVtOiBhbnkpID0+IGl0ZW0ua2V5ICYmIGl0ZW0udmFsdWUpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcclxuICAgICAgICBrZXk6IEssXHJcbiAgICAgICAgZm9ybWF0dGluZzogYW55LFxyXG4gICAgICAgIG5lc3RlZEtleT86IE5LXHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBsZXQgdmFsdWU7XHJcbiAgICAgICAgaWYodHlwZW9mIGZvcm1hdHRpbmchPT1cImJvb2xlYW5cIil7XHJcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IGZvcm1hdHRpbmcuc3BsaXQoXCI9XCIpO1xyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgZm9ybWF0dGluZyBzdHJpbmcgaXMgdmFsaWRcclxuICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA8IDIgfHwgIW1hdGNoWzFdKSByZXR1cm47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXHJcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gbWF0Y2hbMV0udHJpbSgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGlmIHRoZSB2YWx1ZSBpcyBhIG51bWJlciBvciBhIHN0cmluZ1xyXG4gICAgICAgICAgICB2YWx1ZSA9ICFpc05hTihwYXJzZUZsb2F0KHJhd1ZhbHVlKSkgJiYgaXNGaW5pdGUoK3Jhd1ZhbHVlKVxyXG4gICAgICAgICAgICAgICAgPyBwYXJzZUZsb2F0KHJhd1ZhbHVlKVxyXG4gICAgICAgICAgICAgICAgOiByYXdWYWx1ZS5yZXBsYWNlKC8tXFx8Lywnbm9ydGgnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgdmFsdWU9Zm9ybWF0dGluZ1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvL3RoaXMuc2V0UHJvcGVydHkoa2V5LCB2YWx1ZSwgbmVzdGVkS2V5KTtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIFxyXG5cclxuXHJcbiAgICBhZGRUaWt6c2V0KHNwbGl0Rm9ybWF0dGluZzogYW55KXtcclxuICAgICAgICBjb25zdCBhPXNwbGl0Rm9ybWF0dGluZy5maW5kKChpdGVtOiBzdHJpbmcpPT4gaXRlbS5tYXRjaCgvbWFzc3xhbmd8aGVscGxpbmVzLykpXHJcbiAgICAgICAgaWYgKCFhJiYhdGhpcy50aWt6c2V0KXJldHVybjtcclxuICAgICAgICBpZihhKSB0aGlzLnRpa3pzZXQ9YTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnRpa3pzZXQpIHtcclxuICAgICAgICAgICAgY2FzZSBcIm1hc3NcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD1cInllbGxvdyE2MFwiO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoPVwiZHJhd1wiO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0PVwiYmxhY2tcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwidmVjXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFycm93PSctPidcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiaGVscGxpbmVzXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxpbmVXaWR0aD0wLjQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXc9J2dyYXknO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJhbmdcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMucGF0aD0nZHJhdydcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD0nYmxhY2shNTAnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsT3BhY2l0eT0wLjU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXc9J29yYW5nZSdcclxuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9JzwtPidcclxuICAgICAgICAgICAgICAgIHRoaXMuYW5nbGVFY2NlbnRyaWNpdHk9MS42O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZVJhZGl1cz10b1BvaW50KDAuNSxcImNtXCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0PSdvcmFuZ2UnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5mb250PSdcXFxcbGFyZ2UnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0T3BhY2l0eT0wLjk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhZGRTcGxvcEFuZFBvc2l0aW9uKGFycjogYW55LGluZGV4OiBudW1iZXIpe1xyXG4gICAgICAgIGNvbnN0IGJlZm9yZUFmdGVyPWZpbmRCZWZvcmVBZnRlckF4aXMoYXJyLGluZGV4KTtcclxuICAgICAgICBjb25zdCBbYmVmb3JlLCBhZnRlcl09W2FycltiZWZvcmVBZnRlci5iZWZvcmVdLGFycltiZWZvcmVBZnRlci5hZnRlcl1dXHJcbiAgICAgICAgaWYgKHRoaXMucG9zaXRpb258fHRoaXMuc2xvcGVkKXtyZXR1cm59XHJcbiAgICBcclxuICAgICAgICBjb25zdCBlZGdlMSA9IGJlZm9yZS5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcclxuICAgICAgICBjb25zdCBlZGdlMiA9IGFmdGVyLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xyXG4gICAgICAgIGNvbnN0IHNsb3BlPWZpbmRTbG9wZShiZWZvcmUsYWZ0ZXIpXHJcblxyXG4gICAgICAgIHRoaXMuc2xvcGVkID0gc2xvcGUgIT09IDAmJnNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5O1xyXG5cclxuICAgICAgICBsZXQgcXVhZHJhbnRcclxuXHJcbiAgICAgICAgaWYgKGVkZ2UxIT09ZWRnZTIpXHJcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxK2VkZ2UyO1xyXG4gICAgICAgIGVsc2UgXHJcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxO1xyXG5cclxuICAgICAgICAvL3NpbnQgcGFyYWxsZWwgdG8gWSBheGlzXHJcbiAgICAgICAgaWYgKHNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5KXtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHF1YWRyYW50LnJlcGxhY2UoLygzfDQpLyxcImJlbG93XCIpLnJlcGxhY2UoLygxfDIpLyxcImFib3ZlXCIpLnJlcGxhY2UoLyhiZWxvd2Fib3ZlfGFib3ZlYmVsb3cpLyxcIlwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICAvL2lzbnQgcGFyYWxsZWwgdG8gWCBheGlzXHJcbiAgICAgICAgaWYgKHNsb3BlICE9PSAwKXtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbj10aGlzLnBvc2l0aW9uP3RoaXMucG9zaXRpb246Jyc7XHJcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb24rPXF1YWRyYW50LnJlcGxhY2UoLygxfDQpLyxcInJpZ2h0XCIpLnJlcGxhY2UoLygyfDMpLyxcImxlZnRcIikucmVwbGFjZSgvKHJpZ2h0bGVmdHxsZWZ0cmlnaHQpLyxcIlwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbj8ucmVwbGFjZSgvW1xcZF0rL2csXCJcIikucmVwbGFjZSgvKGJlbG93fGFib3ZlKShyaWdodHxsZWZ0KS8sXCIkMSAkMlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIGludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZ1N0cmluZzogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3Qgc3BsaXRGb3JtYXR0aW5nID0gZm9ybWF0dGluZ1N0cmluZy5yZXBsYWNlKC9cXHMvZywgXCJcIikubWF0Y2goLyg/OntbXn1dKn18W14se31dKykrL2cpIHx8IFtdO1xyXG4gICAgXHJcbiAgICAgICAgdGhpcy5hZGRUaWt6c2V0KHNwbGl0Rm9ybWF0dGluZyk7XHJcbiAgICBcclxuICAgICAgICBjb25zdCBwYXR0ZXJuczogUmVjb3JkPHN0cmluZywgKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQ+ID0ge1xyXG4gICAgICAgICAgICBcImxpbmV3aWR0aFwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJsaW5lV2lkdGhcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcImZpbGw9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImZpbGxcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5maWxsb3BhY2l0eVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJmaWxsT3BhY2l0eVwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXigtPnw8LXwtKntTdGVhbHRofS0qKSRcIjogKHZhbHVlKSA9PiB7IHRoaXMuYXJyb3cgPSB2YWx1ZTsgfSxcclxuICAgICAgICAgICAgXCJeKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpezEsMn0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLnBvc2l0aW9uID0gdmFsdWUucmVwbGFjZSgvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLywgXCIkMSBcIik7IH0sXHJcbiAgICAgICAgICAgIFwiXnBvcz1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwicG9zXCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeZHJhdz1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZHJhd1wiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXmRlY29yYXRlJFwiOiAoKSA9PiB7IHRoaXMuZGVjb3JhdGUgPSB0cnVlOyB9LFxyXG4gICAgICAgICAgICBcIl50ZXh0PVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJ0ZXh0XCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeYW5jaG9yPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJhbmNob3JcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5cXFwiXlxcXCIkXCI6ICgpID0+IHRoaXMuc2V0UHJvcGVydHkoXCJsYWJlbFwiLHRydWUsXCJmcmVlRm9ybVRleHRcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wibGFiZWxcIl0+KSxcclxuICAgICAgICAgICAgXCJeYnJhY2UkXCI6ICgpID0+IHRoaXMuc2V0UHJvcGVydHkoXCJkZWNvcmF0aW9uXCIsdHJ1ZSxcImJyYWNlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+KSxcclxuICAgICAgICAgICAgXCJeYW1wbGl0dWRlXCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImRlY29yYXRpb25cIiwgdmFsdWUsIFwiYW1wbGl0dWRlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+KSxcclxuICAgICAgICAgICAgXCJeZHJhdyRcIjogKHZhbHVlKSA9PiB7IHRoaXMucGF0aCA9IHZhbHVlOyB9LFxyXG4gICAgICAgICAgICBcIl4ocmVkfGJsdWV8cGlua3xibGFja3x3aGl0ZXxbIVxcXFxkLl0rKXsxLDV9JFwiOiAodmFsdWUpID0+IHsgdGhpcy5jb2xvciA9IHZhbHVlOyB9LFxyXG4gICAgICAgICAgICBcIl4oZG90dGVkfGRhc2hlZHxzbW9vdGh8ZGVuc2VseXxsb29zZWx5KXsxLDJ9JFwiOiAodmFsdWUpID0+IHsgdGhpcy5saW5lU3R5bGUgPSB2YWx1ZS5yZXBsYWNlKC8oZGVuc2VseXxsb29zZWx5KS8sIFwiJDEgXCIpOyB9LFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHNwbGl0Rm9ybWF0dGluZy5mb3JFYWNoKGZvcm1hdHRpbmcgPT4gey8qXHJcbiAgICAgICAgICAgIC8vIEhhbmRsZSBuZXN0ZWQgcHJvcGVydGllc1xyXG4gICAgICAgICAgICBjb25zdCBtYXRjaCA9IGZvcm1hdHRpbmcubWF0Y2goL14oW149XSspPXsoLiopfSQvKTtcclxuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBbXywgcGFyZW50LCBjaGlsZHJlbl0gPSBtYXRjaDtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nT2JqID0gdGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gICAgICAgICAgICAgICAgaWYgKCFmb3JtYXR0aW5nT2JqW3BhcmVudF0pIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nT2JqW3BhcmVudF0gPSB7fTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZENoaWxkID0gbmV3IEZvcm1hdHRpbmcodGhpcy5tb2RlLHt9LGNoaWxkcmVuKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihmb3JtYXR0aW5nT2JqW3BhcmVudF0sIChwYXJzZWRDaGlsZCBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+KVtwYXJlbnRdKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgZm9yIChjb25zdCBbcGF0dGVybiwgaGFuZGxlcl0gb2YgT2JqZWN0LmVudHJpZXMocGF0dGVybnMpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAobmV3IFJlZ0V4cChwYXR0ZXJuKS50ZXN0KGZvcm1hdHRpbmcpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlcihmb3JtYXR0aW5nKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0qL1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgdG9TdHJpbmcob2JqPzogYW55KTogc3RyaW5nIHtcclxuICAgICAgICBsZXQgc3RyaW5nPW9iaj8neyc6J1snO1xyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG9iaj9vYmo6dGhpcykpIHtcclxuICAgICAgICAgICAgaWYgKGtleS5tYXRjaCgvXihtb2RlfHRpa3pzZXQpJC8pKXtjb250aW51ZTt9XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcmJnZhbHVlKXtcclxuICAgICAgICAgICAgICAgIHN0cmluZys9bWF0Y2hLZXlXaXRoVmFsdWUoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcpK3RoaXMudG9TdHJpbmcodmFsdWUpKycsJ1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW1hdGNoS2V5V2l0aFZhbHVlKGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nKSsodHlwZW9mIHZhbHVlPT09XCJib29sZWFuXCI/Jyc6dmFsdWUpKycsJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc3RyaW5nKyhvYmo/J30nOiddJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlT2JqZWN0VG9TdHJpbmcob2JqOiBvYmplY3QsIHBhcmVudEtleTogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gbWF0Y2hLZXlXaXRoVmFsdWUocGFyZW50S2V5KSsneyc7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xyXG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBtYXRjaEtleVdpdGhWYWx1ZShgJHtwYXJlbnRLZXl9LiR7a2V5fWApICsgKHR5cGVvZiB2YWx1ZSA9PT0gXCJib29sZWFuXCIgPyAnJyA6IHZhbHVlKSArICcsJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0K1wifSxcIjtcclxuICAgIH1cclxufVxyXG5cclxudHlwZSBNb2RlID0gXCJjb29yZGluYXRlXCIgfCBcImNvb3JkaW5hdGUtaW5saW5lXCIgfCBcIm5vZGVcIiB8IFwibm9kZS1pbmxpbmVcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBDb29yZGluYXRlIHtcclxuICAgIG1vZGU6IE1vZGVcclxuICAgIGF4aXM/OiBBeGlzXHJcbiAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZ1xyXG4gICAgdmFyaWFibGU/OiBBeGlzXHJcbiAgICBsYWJlbD86IHN0cmluZ1xyXG4gICAgXHJcbiAgY29uc3RydWN0b3IobW9kZTogTW9kZSxheGlzPzogQXhpcyxmb3JtYXR0aW5nPzogRm9ybWF0dGluZyx2YXJpYWJsZT86IEF4aXMsbGFiZWw/OiBzdHJpbmcsKSB7XHJcbiAgICB0aGlzLm1vZGU9bW9kZTtcclxuICAgIHRoaXMuYXhpcz1heGlzO1xyXG4gICAgdGhpcy5mb3JtYXR0aW5nPWZvcm1hdHRpbmc7XHJcbiAgICB0aGlzLnZhcmlhYmxlPXZhcmlhYmxlO1xyXG4gICAgdGhpcy5sYWJlbD1sYWJlbDtcclxuICB9XHJcbiAgICBpbnRlcnByZXRDb29yZGluYXRlKGNvb3JkaW5hdGVzOiBhbnlbXSl7XHJcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZz1jb29yZGluYXRlcy5maW5kKGNvb3I9PmNvb3IgaW5zdGFuY2VvZiBGb3JtYXR0aW5nKVxyXG4gICAgICAgIGNvbnN0IGF4aXM9Y29vcmRpbmF0ZXMuZmluZChjb29yPT5jb29yIGluc3RhbmNlb2YgQXhpcylcclxuICAgICAgICBjb25zdCB2YXJpYWJsZT1jb29yZGluYXRlcy5maW5kKGNvb3I9PmNvb3I/LnR5cGU9PT0ndmFyaWFibGUnKS52YWx1ZVxyXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZz1mb3JtYXR0aW5nO1xyXG4gICAgICAgIHRoaXMuYXhpcz1heGlzXHJcbiAgICAgICAgdGhpcy52YXJpYWJsZT12YXJpYWJsZVxyXG4gICAgICAgIHJldHVybiB0aGlzXHJcbiAgICB9XHJcbiAgICBjbG9uZSgpOiBDb29yZGluYXRlIHtcclxuICAgICAgICByZXR1cm4gbmV3IENvb3JkaW5hdGUoXHJcbiAgICAgICAgICAgIHRoaXMubW9kZSxcclxuICAgICAgICAgICAgdGhpcy5heGlzID8gdGhpcy5heGlzLmNsb25lKCkgOnVuZGVmaW5lZCxcclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nLFxyXG4gICAgICAgICAgICB0aGlzLnZhcmlhYmxlLFxyXG4gICAgICAgICAgICB0aGlzLmxhYmVsLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgYWRkQXhpcyhjYXJ0ZXNpYW5YPzogbnVtYmVyLCBjYXJ0ZXNpYW5ZPzogbnVtYmVyLCBwb2xhckxlbmd0aD86IG51bWJlciwgcG9sYXJBbmdsZT86IG51bWJlcil7XHJcbiAgICAgICAgdGhpcy5heGlzPW5ldyBBeGlzKGNhcnRlc2lhblgsIGNhcnRlc2lhblksIHBvbGFyTGVuZ3RoLCBwb2xhckFuZ2xlKTtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyh0aGlzLm1vZGUpXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImNvb3JkaW5hdGVcIjpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmF4aXMpXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuYFxcXFxjb29yZGluYXRlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpIHx8ICcnfSAoJHt0aGlzLnZhcmlhYmxlIHx8IFwiXCJ9KSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pO2BcclxuICAgICAgICAgICAgY2FzZSBcIm5vZGVcIjpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmF4aXMpe31cclxuICAgICAgICAgICAgICAgICAgICAvL3JldHVybiBgXFxcXG5vZGUgJHt0aGlzLmNvb3JkaW5hdGVOYW1lPycoJyt0aGlzLmNvb3JkaW5hdGVOYW1lKycpJzonJ30gYXQgKCR7dGhpcy5heGlzLnRvU3RyaW5nKCl9KSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKXx8Jyd9IHske3RoaXMubGFiZWx9fTtgXHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLWlubGluZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBub2RlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpIHx8ICcnfSB7JHt0aGlzLmxhYmVsIHx8ICcnfX1gXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIG1vZGUgYXQgdG8gc3RyaW5nIGNvb3JkaW5hdGVcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG59XHJcblxyXG5leHBvcnQgdHlwZSBUb2tlbiA9QXhpcyB8IENvb3JkaW5hdGUgfERyYXd8Rm9ybWF0dGluZ3wgc3RyaW5nO1xyXG5cclxuZXhwb3J0IGNsYXNzIERyYXcge1xyXG4gICAgbW9kZTogc3RyaW5nXHJcbiAgICBmb3JtYXR0aW5nOiBGb3JtYXR0aW5nO1xyXG4gICAgY29vcmRpbmF0ZXM6IGFueVtdPVtdO1xyXG5cclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihtb2RlOiBzdHJpbmcsZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsY29vcmRpbmF0ZXM/OiBhbnlbXSwgdG9rZW5zPzogRm9ybWF0VGlrempheCwpIHs7XHJcbiAgICAgICAgdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgaWYoZm9ybWF0dGluZylcclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPWZvcm1hdHRpbmc7XHJcbiAgICAgICAgaWYoY29vcmRpbmF0ZXMpXHJcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXM9Y29vcmRpbmF0ZXM7XHJcbiAgICB9XHJcbiAgICBjcmVhdGVGcm9tQXJyYXkoYXJyOiBhbnkpey8qXHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPGFyci5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgaWYgKGFycltpXSBpbnN0YW5jZW9mIEF4aXN8fGFycltpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpe1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZih0eXBlb2YgYXJyPT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5OyovXHJcbiAgICB9XHJcblxyXG4gICAgZmlsbENvb3JkaW5hdGVzKHNjaGVtYXRpYzogYW55W10sIHRva2Vucz86IEZvcm1hdFRpa3pqYXgpIHtcclxuICAgICAgICBpZihzY2hlbWF0aWNbMF0gaW5zdGFuY2VvZiBGb3JtYXR0aW5nKXtcclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPXNjaGVtYXRpY1swXVxyXG4gICAgICAgICAgICBzY2hlbWF0aWMuc3BsaWNlKDAsMSlcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgcmVmZXJlbmNlRmlyc3RBeGlzTWFwID0gc2NoZW1hdGljXHJcbiAgICAgICAgICAgIC5tYXAoKGNvb3IsIGluZGV4KSA9PiAoY29vciBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuICYmIGNvb3IuZ2V0U3RyaW5nVmFsdWUoKSA9PT0gJ1JlZmVyZW5jZUZpcnN0QXhpcycgPyBpbmRleCA6IG51bGwpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKCh0KTogdCBpcyBudW1iZXIgPT4gdCAhPT0gbnVsbCk7IFxyXG5cclxuICAgICAgICBjb25zdCByZWZlcmVuY2VMYXN0QXhpc01hcCA9IHNjaGVtYXRpY1xyXG4gICAgICAgICAgICAubWFwKChjb29yLCBpbmRleCkgPT4gKGNvb3IgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiAmJiBjb29yLmdldFN0cmluZ1ZhbHVlKCkgPT09ICdSZWZlcmVuY2VMYXN0QXhpcycgPyBpbmRleCA6IG51bGwpKVxyXG4gICAgICAgICAgICAuZmlsdGVyKCh0KTogdCBpcyBudW1iZXIgPT4gdCAhPT0gbnVsbCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbWFwcGVkUmVmZXJlbmNlcyA9IHJlZmVyZW5jZUZpcnN0QXhpc01hcC5tYXAoaW5kZXggPT4ge1xyXG4gICAgICAgICAgICBzY2hlbWF0aWNbaW5kZXhdLm5hbWU9J0F4aXNDb25uZWN0ZXInXHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzSW5kZXggPSBzY2hlbWF0aWMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzID0gbmV4dEF4aXNJbmRleCAhPT0gLTEgPyBzY2hlbWF0aWNbaW5kZXggKyAxICsgbmV4dEF4aXNJbmRleF0gOiBudWxsO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICByZXR1cm4gbmV4dEF4aXM7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcHMgPSByZWZlcmVuY2VMYXN0QXhpc01hcC5tYXAoaW5kZXggPT4ge1xyXG4gICAgICAgICAgICBzY2hlbWF0aWNbaW5kZXhdLm5hbWU9J0F4aXNDb25uZWN0ZXInXHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzSW5kZXggPSBzY2hlbWF0aWMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzID0gbmV4dEF4aXNJbmRleCAhPT0gLTEgPyBzY2hlbWF0aWNbaW5kZXggKyAxICsgbmV4dEF4aXNJbmRleF0gOiBudWxsO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNBeGlzSW5kZXggPSBzY2hlbWF0aWNcclxuICAgICAgICAgICAgICAgIC5zbGljZSgwLCBpbmRleClcclxuICAgICAgICAgICAgICAgIC5yZXZlcnNlKClcclxuICAgICAgICAgICAgICAgIC5maW5kSW5kZXgoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0F4aXMgPSBwcmV2aW91c0F4aXNJbmRleCAhPT0gLTEgPyBzY2hlbWF0aWNbaW5kZXggLSAxIC0gcHJldmlvdXNBeGlzSW5kZXhdIDogbnVsbDtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICByZWZlcmVuY2VGaXJzdEF4aXM6IHNjaGVtYXRpY1tpbmRleF0sXHJcbiAgICAgICAgICAgICAgICBwcmV2aW91c0F4aXMsXHJcbiAgICAgICAgICAgICAgICBuZXh0QXhpcyxcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBpZihtYXBwZWRSZWZlcmVuY2VzLmxlbmd0aD4wKXtcclxuICAgICAgICAgICAgY29uc3QgZmlyc3RBeGlzPXNjaGVtYXRpYy5maW5kKHQ9PnQgaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgICAgICBtYXBwZWRSZWZlcmVuY2VzLmZvckVhY2goYXhpcyA9PiB7XHJcbiAgICAgICAgICAgICAgICBheGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoZmlyc3RBeGlzLFwiYWRkaXRpb25cIilcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmNvb3JkaW5hdGVzPXNjaGVtYXRpYztcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgY29vckFycjogQXJyYXk8VG9rZW4+PVtdO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NoZW1hdGljLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGlmIChzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcclxuICAgICAgICAgICAgICAgIGxldCBwcmV2aW91c0Zvcm1hdHRpbmc7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGkgPiAwICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDFdLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID4gMSAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwibm9kZVwiICYmIHNjaGVtYXRpY1tpIC0gMl0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDJdLnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBBeGlzKCkudW5pdmVyc2FsKHNjaGVtYXRpY1tpXS52YWx1ZSwgdG9rZW5zLCBjb29yQXJyLCBwcmV2aW91c0Zvcm1hdHRpbmcsICkpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwibm9kZVwiKXtcclxuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChuZXcgQ29vcmRpbmF0ZSh7bGFiZWw6IHNjaGVtYXRpY1tpXS52YWx1ZSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGUtaW5saW5lXCIse30sc2NoZW1hdGljW2ldLmZvcm1hdHRpbmcpLG1vZGU6IFwibm9kZS1pbmxpbmVcIn0pKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKHNjaGVtYXRpY1tpXS52YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvb3JBcnI7Ki9cclxuICAgIH1cclxuXHJcbiAgICBnZXRTY2hlbWF0aWMoZHJhdzogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVnZXg9Z2V0UmVnZXgoKTtcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XHJcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gcmVnRXhwKFN0cmluZy5yYXdgbm9kZVxccypcXFs/KCR7cmVnZXguZm9ybWF0dGluZ30qKVxcXT9cXHMqeygke3JlZ2V4LnRleHR9Kil9YCk7XHJcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ1JlZ2V4ID0gLygtLWN5Y2xlfGN5Y2xlfC0tXFwrXFwrfC0tXFwrfC0tfC1cXHx8XFx8LXxncmlkfGNpcmNsZXxyZWN0YW5nbGUpLztcclxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzXFwtLC46YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoXFwoWyR7Y2F9XStcXCl8XFwoXFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitcXC1dK1xcKFske2NhfV0rXFwpXFwkXFwpKWApO1xyXG4gICAgICAgIGxldCBpID0gMDtcclxuICAgICAgICBsZXQgbG9vcHMgPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChpIDwgZHJhdy5sZW5ndGggJiYgbG9vcHMgPCAxMDApIHsgLy8gSW5jcmVhc2UgbG9vcCBsaW1pdCBvciBhZGQgY29uZGl0aW9uIGJhc2VkIG9uIHBhcnNlZCBsZW5ndGhcclxuICAgICAgICAgICAgbG9vcHMrKztcclxuICAgICAgICAgICAgY29uc3QgY29vcmRpbmF0ZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChjb29yZGluYXRlUmVnZXgpO1xyXG4gICAgICAgICAgICBcclxuXHJcbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImNvb3JkaW5hdGVcIiwgdmFsdWU6IGNvb3JkaW5hdGVNYXRjaFsxXSB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gY29vcmRpbmF0ZU1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZ01hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChmb3JtYXR0aW5nUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAoZm9ybWF0dGluZ01hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgaSArPSBmb3JtYXR0aW5nTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJmb3JtYXR0aW5nXCIsIHZhbHVlOiBmb3JtYXR0aW5nTWF0Y2hbMF0gfSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG5vZGVNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2gobm9kZVJlZ2V4KTtcclxuICAgICAgICAgICAgaWYgKG5vZGVNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJub2RlXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGluZzogbm9kZU1hdGNoWzFdIHx8IFwiXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG5vZGVNYXRjaFsyXVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBpICs9IG5vZGVNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGxvb3BzID09PSAxMDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUGFyc2luZyBleGNlZWRlZCBzYWZlIGxvb3AgY291bnRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xyXG4gICAgfVxyXG5cclxuICAgIGlzQ29vcmRpbmF0ZShvYmo6IGFueSk6IG9iaiBpcyBDb29yZGluYXRlIHtcclxuICAgICAgICByZXR1cm4gb2JqICYmIG9iaiBpbnN0YW5jZW9mIENvb3JkaW5hdGU7XHJcbiAgICB9XHJcbiAgICB0b1N0cmluZ0RyYXcoKXtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3ICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSBgO1xyXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXMuZm9yRWFjaCgoY29vcmRpbmF0ZTogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSYmY29vcmRpbmF0ZS5tb2RlPT09XCJub2RlLWlubGluZVwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGNvb3JkaW5hdGUudG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgY29vcmRpbmF0ZSBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGNvb3JkaW5hdGUudG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz1gKCR7Y29vcmRpbmF0ZS50b1N0cmluZygpfSlgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nUGljKCl7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyBwaWMgJHt0aGlzLmZvcm1hdHRpbmcudG9TdHJpbmcoKXx8Jyd9IHthbmdsZSA9ICR7KHRoaXMuY29vcmRpbmF0ZXNbMF0gYXMgQXhpcykubmFtZX0tLSR7KHRoaXMuY29vcmRpbmF0ZXNbMV0gYXMgQXhpcykubmFtZX0tLSR7KHRoaXMuY29vcmRpbmF0ZXNbMl0gYXMgQXhpcykubmFtZX19IGA7XHJcbiAgICAgXHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpIHtcclxuICAgICAgICBpZiAodGhpcy5tb2RlPT09J2RyYXcnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ0RyYXcoKTtcclxuICAgICAgICBpZih0aGlzLm1vZGU9PT0nZHJhdy1waWMtYW5nJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmdQaWMoKVxyXG4gICAgICAgIFxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcbiAgXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGRpc3NlY3RYWWF4aXMobWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkpIHtcclxuICAgIGxldCBYbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiLCBZbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiO1xyXG5cclxuICAgIGlmIChtYXRjaFsxXSAmJiBtYXRjaFsyXSkge1xyXG4gICAgICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcclxuICAgICAgICBZbm9kZSA9IG1hdGNoWzJdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XHJcbiAgICAgICAgWG5vZGU9WG5vZGVbMF0uc3Vic3RyaW5nKDEsWG5vZGUubGVuZ3RoKVxyXG4gICAgICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcInh5YXhpc1wiLFxyXG4gICAgICAgIFhmb3JtYXR0aW5nOiBtYXRjaFsxXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICAgICAgWWZvcm1hdHRpbmc6IG1hdGNoWzJdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcclxuICAgICAgICB4RGlyZWN0aW9uOiBtYXRjaFsxXSAmJiAvLT4vLnRlc3QobWF0Y2hbMV0pID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIsXHJcbiAgICAgICAgeURpcmVjdGlvbjogbWF0Y2hbMl0gJiYgLy0+Ly50ZXN0KG1hdGNoWzJdKSA/IFwiZG93blwiIDogXCJ1cFwiLFxyXG4gICAgICAgIFhub2RlOiBYbm9kZSxcclxuICAgICAgICBZbm9kZTogWW5vZGUsXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbi8qXHJcbmZ1bmN0aW9uIGdlbmVyYXRlRm9ybWF0dGluZyhjb29yZGluYXRlOiBDb29yZGluYXRlKXtcclxuICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZS5sYWJlbCAhPT0gXCJzdHJpbmdcIil7IHJldHVybiBcIlwiOyB9XHJcbiAgICBjb25zdCBmb3JtYXR0aW5nID0gY29vcmRpbmF0ZS5mb3JtYXR0aW5nPy5zcGxpdChcIixcIikgfHwgW107XHJcbiAgICBpZiAoZm9ybWF0dGluZy5zb21lKCh2YWx1ZTogc3RyaW5nKSA9PiAvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLy50ZXN0KHZhbHVlKSkpIHtcclxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZS5mb3JtYXR0aW5nO1xyXG4gICAgfVxyXG4gICAgaWYoZm9ybWF0dGluZy5sZW5ndGg+MCYmIWZvcm1hdHRpbmdbZm9ybWF0dGluZy5sZW5ndGgtMV0uZW5kc1dpdGgoXCIsXCIpKXtmb3JtYXR0aW5nLnB1c2goXCIsXCIpfVxyXG4gICAgc3dpdGNoKGNvb3JkaW5hdGUucXVhZHJhbnQpe1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSByaWdodCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSBsZWZ0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IGxlZnQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDQ6IFxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IHJpZ2h0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZy5qb2luKFwiXCIpO1xyXG59XHJcbiovXHJcblxyXG4iXX0=