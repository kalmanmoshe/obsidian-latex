import { MarkdownView, WorkspaceWindow } from "obsidian";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { cartesianToPolar, findIntersectionPoint, findSlope, polarToCartesian, toNumber } from "src/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";
import { BasicTikzToken, FormatTikzjax } from "./interpret/tokenizeTikzjax.js";
import { mapBrackets } from "src/utils/tokenUtensils.js";
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
                    if (tokens)
                        axis = tokens.findOriginalValue(match)?.axis;
                    else
                        throw new Error(`Tried to find original coordinate value while not being provided with tokens`);
                    if (axis === undefined) {
                        throw new Error(`Couldn't find the coordinate ${match} from ${coordinate}`);
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
            fullMatch: match[0].replace(/-$/g, ""),
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
    toStringSVG() {
        return this.cartesianX + " " + this.cartesianY;
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
            .map((coor, index) => (coor instanceof BasicTikzToken && coor.name === 'ReferenceFirstAxis' ? index : null))
            .filter((t) => t !== null);
        const referenceLastAxisMap = schematic
            .map((coor, index) => (coor instanceof BasicTikzToken && coor.name === 'ReferenceLastAxis' ? index : null))
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBUyxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUl6RCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FB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QVMsQ0FBQyxDQUFDLEVBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ3hDLEtBQUssR0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUE7S0FDM0M7SUFFRCxPQUFPO1FBQ0gsSUFBSSxFQUFFLFFBQVE7UUFDZCxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLENBQUM7UUFDNUQsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxDQUFDO1FBQzVELFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPO1FBQzlELFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJO1FBQzNELEtBQUssRUFBRSxLQUFLO1FBQ1osS0FBSyxFQUFFLEtBQUs7S0FDZixDQUFDO0FBQ04sQ0FBQztBQWFEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUF3QkUiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIE1hcmtkb3duVmlldywgU2NvcGUsIFdvcmtzcGFjZVdpbmRvdyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcInNyYy9tYWluXCI7XG5pbXBvcnQgeyBvcHRpbWl6ZSB9IGZyb20gXCIuL3N2Z28uYnJvd3Nlci5qc1wiO1xuLy8gQHRzLWlnbm9yZVxuaW1wb3J0IHRpa3pqYXhKcyBmcm9tIFwiaW5saW5lOi4vdGlrempheC5qc1wiO1xuaW1wb3J0IHsgY2FydGVzaWFuVG9Qb2xhciwgZmluZEludGVyc2VjdGlvblBvaW50LCBmaW5kU2xvcGUsIHBvbGFyVG9DYXJ0ZXNpYW4sIHRvTnVtYmVyIH0gZnJvbSBcInNyYy9tYXRoVXRpbGl0aWVzLmpzXCI7XG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcbmltcG9ydCB7IEJhc2ljVGlrelRva2VuLCBGb3JtYXRUaWt6amF4IH0gZnJvbSBcIi4vaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC5qc1wiO1xuaW1wb3J0IHsgbWFwQnJhY2tldHMgfSBmcm9tIFwic3JjL3V0aWxzL3Rva2VuVXRlbnNpbHMuanNcIjtcblxuXG5cbmV4cG9ydCBjbGFzcyBUaWt6amF4IHtcbiAgICBhcHA6IEFwcDtcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XG4gICAgYWN0aXZlVmlldzogTWFya2Rvd25WaWV3IHwgbnVsbDtcblxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xuICAgICAgdGhpcy5hcHA9YXBwO1xuICAgICAgdGhpcy5hY3RpdmVWaWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcbiAgICB9XG4gICAgXG4gICAgcmVhZHlMYXlvdXQoKXtcbiAgICAgIHRoaXMucGx1Z2luLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XG4gICAgICAgIHRoaXMubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XG4gICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9KSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgbG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xuICAgICAgICBjb25zdCBzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtcbiAgICAgICAgcy5pZCA9IFwidGlrempheFwiO1xuICAgICAgICBzLnR5cGUgPSBcInRleHQvamF2YXNjcmlwdFwiO1xuICAgICAgICBzLmlubmVyVGV4dCA9IHRpa3pqYXhKcztcbiAgICAgICAgZG9jLmJvZHkuYXBwZW5kQ2hpbGQocyk7XG4gICAgICAgIGRvYy5hZGRFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xuICAgIH1cbiAgXG4gICAgdW5sb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XG4gICAgICAgIGNvbnN0IHMgPSBkb2MuZ2V0RWxlbWVudEJ5SWQoXCJ0aWt6amF4XCIpO1xuICAgICAgICBzPy5yZW1vdmUoKTtcblxuICAgICAgICBkb2MucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcbiAgICB9XG4gIFxuICAgIGxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcbiAgICAgICAgfVxuICAgIH1cbiAgXG4gICAgdW5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XG4gICAgICAgICAgICB0aGlzLnVubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcbiAgICAgICAgfVxuICAgIH1cbiAgXG4gICAgZ2V0QWxsV2luZG93cygpIHtcbiAgICAgICAgY29uc3Qgd2luZG93cyA9IFtdO1xuICAgICAgICBcbiAgICAgICAgLy8gcHVzaCB0aGUgbWFpbiB3aW5kb3cncyByb290IHNwbGl0IHRvIHRoZSBsaXN0XG4gICAgICAgIHdpbmRvd3MucHVzaCh0aGlzLmFwcC53b3Jrc3BhY2Uucm9vdFNwbGl0Lndpbik7XG4gICAgICAgIFxuICAgICAgICAvLyBAdHMtaWdub3JlIGZsb2F0aW5nU3BsaXQgaXMgdW5kb2N1bWVudGVkXG4gICAgICAgIGNvbnN0IGZsb2F0aW5nU3BsaXQgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZmxvYXRpbmdTcGxpdDtcbiAgICAgICAgZmxvYXRpbmdTcGxpdC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiB7XG4gICAgICAgICAgICAvLyBpZiB0aGlzIGlzIGEgd2luZG93LCBwdXNoIGl0IHRvIHRoZSBsaXN0IFxuICAgICAgICAgICAgaWYgKGNoaWxkIGluc3RhbmNlb2YgV29ya3NwYWNlV2luZG93KSB7XG4gICAgICAgICAgICAgICAgd2luZG93cy5wdXNoKGNoaWxkLndpbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB3aW5kb3dzO1xuICAgIH1cbiAgXG4gIFxuICAgIHJlZ2lzdGVyVGlrekNvZGVCbG9jaygpIHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrelwiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihlbC5jcmVhdGVFbChcImRpdlwiKSwge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcbiAgICAgICAgICAgICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgIGNvbnN0IHNjcmlwdCA9IGVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xuICAgICAgICAgICAgY29uc3QgdGlrempheD1uZXcgRm9ybWF0VGlrempheChzb3VyY2UpO1xuICAgICAgICAgICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbmV3IERlYnVnTW9kYWwodGhpcy5hcHAsdGlrempheC5kZWJ1Z0luZm8pLm9wZW4oKTtcbiAgICAgICAgICAgIHNjcmlwdC5zZXRUZXh0KHRpa3pqYXguZ2V0Q29kZSgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIGVsLmlubmVySFRNTCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3JEaXNwbGF5ID0gZWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibWF0aC1lcnJvci1saW5lXCIgfSk7XG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmlubmVyVGV4dCA9IGBFcnJvcjogJHtlLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuY2xhc3NMaXN0LmFkZChcImVycm9yLXRleHRcIik7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIlRpa1ogUHJvY2Vzc2luZyBFcnJvcjpcIiwgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgfVxuICBcbiAgICAgIGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XG4gICAgICB9XG4gIFxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mbyA9IHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLmZpbHRlcihlbCA9PiBlbC5uYW1lICE9IFwiVGlrelwiKTtcbiAgICAgIH1cblxuICBcbiAgICAgIGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xuICAgICAgICBzdmcgPSBzdmcucmVwbGFjZUFsbCgvKFwiIzAwMFwifFwiYmxhY2tcIikvZywgXCJcXFwiY3VycmVudENvbG9yXFxcIlwiKVxuICAgICAgICAgICAgICAgIC5yZXBsYWNlQWxsKC8oXCIjZmZmXCJ8XCJ3aGl0ZVwiKS9nLCBcIlxcXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXFxcIlwiKTtcbiAgICAgICAgcmV0dXJuIHN2ZztcbiAgICAgIH1cbiAgXG4gIFxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gb3B0aW1pemUoc3ZnLCB7cGx1Z2luczpcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFwicHJlc2V0LWRlZmF1bHRcIixcbiAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbnVwSURzOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgIH0pPy5kYXRhO1xuICAgICAgfVxuICBcbiAgXG4gICAgICBwb3N0UHJvY2Vzc1N2ZyA9IChlOiBFdmVudCkgPT4ge1xuICBcbiAgICAgICAgICBjb25zdCBzdmdFbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XG4gIFxuICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKSB7XG4gICAgICAgICAgICBzdmcgPSB0aGlzLmNvbG9yU1ZHaW5EYXJrTW9kZShzdmcpO1xuICAgICAgICAgIH1cbiAgXG4gICAgICAgICAgc3ZnID0gdGhpcy5vcHRpbWl6ZVNWRyhzdmcpO1xuICBcbiAgICAgICAgICBzdmdFbC5vdXRlckhUTUwgPSBzdmc7XG4gICAgfVxufVxuZXhwb3J0IGNvbnN0IGFyclRvUmVnZXhTdHJpbmcgPSAoYXJyOiBBcnJheTxzdHJpbmc+KSA9PiAnKCcgKyBhcnIuam9pbignfCcpICsgJyknO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnRXhwKHBhdHRlcm46IHN0cmluZyB8IFJlZ0V4cCB8IEFycmF5PHN0cmluZz4sIGZsYWdzOiBzdHJpbmcgPSAnJyk6IFJlZ0V4cCB7XG4gICAgaWYgKHBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgcGF0dGVybiA9IHBhdHRlcm4uc291cmNlO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwYXR0ZXJuKSkge1xuICAgICAgICBwYXR0ZXJuID0gYXJyVG9SZWdleFN0cmluZyhwYXR0ZXJuKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgYW5kIHJldHVybiB0aGUgUmVnRXhwXG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoU3RyaW5nLnJhd2Ake3BhdHRlcm59YCwgZmxhZ3MpO1xufVxuXG5cbmZ1bmN0aW9uIGdldFJlZ2V4KCl7XG4gICAgY29uc3QgYmFzaWMgPSBTdHJpbmcucmF3YFtcXHdcXGRcXHMtLC46XWA7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgYmFzaWM6IGJhc2ljLFxuICAgICAgICBtZXJnZTogU3RyaW5nLnJhd2AtXFx8fFxcfC18IVtcXGQuXSshfFxcK3wtYCxcbiAgICAgICAgLy9jb29yZGluYXRlOiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKCR7YmFzaWN9K3wxKWApLFxuICAgICAgICBjb29yZGluYXRlTmFtZTogU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gLFxuICAgICAgICB0ZXh0OiBTdHJpbmcucmF3YFtcXHdcXHMtLC46J1xcJFxcKCFcXClfK1xcXFx7fT1dYCxcbiAgICAgICAgZm9ybWF0dGluZzogU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7Jip7fSgpJS08Pl1gXG4gICAgfTtcbn1cblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuaW50ZXJmYWNlIHRva2VuICB7XG4gICAgWD86IG51bWJlcjtcbiAgICBZPzogbnVtYmVyO1xuICAgIHR5cGU/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZXM/OiBhbnk7XG59XG5cblxuXG5cblxuXG5cbmZ1bmN0aW9uIGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlczogQXJyYXk8QXhpcyB8IHN0cmluZz4sIGluZGV4OiBudW1iZXIpOiB7IGJlZm9yZTogbnVtYmVyLCBhZnRlcjogbnVtYmVyIH0ge1xuICAgIFxuICAgIGxldCBiZWZvcmVJbmRleCA9IGF4ZXMuc2xpY2UoMCwgaW5kZXgpLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIGxldCBhZnRlckluZGV4ID0gYXhlcy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XG5cbiAgICAvLyBBZGp1c3QgYGFmdGVySW5kZXhgIHNpbmNlIHdlIHNsaWNlZCBmcm9tIGBpbmRleCArIDFgXG4gICAgaWYgKGFmdGVySW5kZXggIT09IC0xKSB7XG4gICAgICAgIGFmdGVySW5kZXggKz0gaW5kZXggKyAxO1xuICAgIH1cblxuICAgIC8vIFdyYXAgYXJvdW5kIGlmIG5vdCBmb3VuZFxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgYmVmb3JlSW5kZXggPSBheGVzLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIH1cblxuICAgIGlmIChhZnRlckluZGV4ID09PSAtMSkge1xuICAgICAgICBhZnRlckluZGV4ID0gYXhlcy5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIH1cbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xIHx8IGFmdGVySW5kZXggPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgdmFsaWQgQXhpcyBvYmplY3RzLlwiKTtcbiAgICB9XG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSBhZnRlckluZGV4KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlByYWlzZWQgYXhpcyBhcyBzYW1lIHRva2VuXCIpO1xuICAgIH1cbiAgICByZXR1cm4geyBiZWZvcmU6IGJlZm9yZUluZGV4LCBhZnRlcjogYWZ0ZXJJbmRleCB9O1xufVxuXG5cbmV4cG9ydCBjbGFzcyBBeGlzIHtcbiAgICBjYXJ0ZXNpYW5YOiBudW1iZXI7XG4gICAgY2FydGVzaWFuWTogbnVtYmVyO1xuICAgIHBvbGFyQW5nbGU6IG51bWJlcjtcbiAgICBwb2xhckxlbmd0aDogbnVtYmVyO1xuICAgIG5hbWU/OiBzdHJpbmc7XG4gICAgcXVhZHJhbnQ/OiBudW1iZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihjYXJ0ZXNpYW5YPzogbnVtYmVyLCBjYXJ0ZXNpYW5ZPzogbnVtYmVyLCBwb2xhckxlbmd0aD86IG51bWJlciwgcG9sYXJBbmdsZT86IG51bWJlcixuYW1lPzogc3RyaW5nKSB7XG4gICAgICAgIGlmIChjYXJ0ZXNpYW5YICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWCA9IGNhcnRlc2lhblg7XG4gICAgICAgIGlmIChjYXJ0ZXNpYW5ZICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWSA9IGNhcnRlc2lhblk7XG4gICAgICAgIGlmIChwb2xhckxlbmd0aCAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyTGVuZ3RoID0gcG9sYXJMZW5ndGg7XG4gICAgICAgIGlmIChwb2xhckFuZ2xlICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJBbmdsZSA9IHBvbGFyQW5nbGU7XG4gICAgICAgIHRoaXMubmFtZT1uYW1lXG4gICAgfVxuICAgIFxuICAgIGNsb25lKCk6IEF4aXMge1xuICAgICAgICByZXR1cm4gbmV3IEF4aXModGhpcy5jYXJ0ZXNpYW5YLCB0aGlzLmNhcnRlc2lhblksdGhpcy5wb2xhckxlbmd0aCx0aGlzLnBvbGFyQW5nbGUsdGhpcy5uYW1lKTtcbiAgICB9XG4gICAgcGFyc2VJbnB1dChpbnB1dDogYW55KSB7XG4gICAgICAgIGNvbnN0IGF4ZXM9W11cbiAgICAgICAgY29uc3QgYnJhY2tldE1hcCA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgaW5wdXQpO1xuICAgICAgICBheGVzLnB1c2godGhpcy5wcm9jZXNzSW5kaXZpZHVhbChpbnB1dCkpO1xuICAgICAgICAgICAgaWYoYXhlcy5sZW5ndGg9PT0xKVxuICAgICAgICAgICAgICAgIHJldHVybiBheGVzWzBdXG4gICAgfVxuICAgIFxuICAgIHByb2Nlc3NJbmRpdmlkdWFsKGlucHV0OiBhbnkpIHtcbiAgICAgICAgbGV0IGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICBjb25zdCBpc0NhcnRlc2lhbiA9IGlucHV0LnNvbWUoKHRva2VuOiBhbnkpID0+IHRva2VuLm5hbWUgPT09ICdDb21tYScpO1xuICAgICAgICBpbnB1dCA9IGlucHV0LmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSAhPT0gJ1N5bnRheCcpO1xuICAgICAgICBpZiAoaXNDYXJ0ZXNpYW4gJiYgaW5wdXQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBheGlzLmNhcnRlc2lhblggPSBpbnB1dFswXS52YWx1ZTtcbiAgICAgICAgICAgIGF4aXMuY2FydGVzaWFuWSA9IGlucHV0WzFdLnZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBheGlzO1xuICAgIH1cbiAgICBcblxuICAgIHVuaXZlcnNhbChjb29yZGluYXRlOiBzdHJpbmcsIHRva2Vucz86IEZvcm1hdFRpa3pqYXgsYW5jaG9yQXJyPzogYW55LGFuY2hvcj86IHN0cmluZyk6IEF4aXMge1xuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVBcnI6IEFycmF5PEF4aXN8c3RyaW5nPiA9IFtdO1xuICAgICAgICBtYXRjaGVzLmZvckVhY2goKG1hdGNoOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xuICAgICAgICAgICAgbGV0IGF4aXM6IEF4aXN8dW5kZWZpbmVkO1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZENhcnRlc2lhbihtYXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAvOi8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZFBvbGFyKG1hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5wb2xhclRvQ2FydGVzaWFuKClcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIC8hW1xcZC5dKyEvLnRlc3QobWF0Y2gpOlxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICgvW1xcZFxcd10rLykudGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpXG4gICAgICAgICAgICAgICAgICAgICAgICBheGlzID0gdG9rZW5zLmZpbmRPcmlnaW5hbFZhbHVlKG1hdGNoKT8uYXhpcztcbiAgICAgICAgICAgICAgICAgICAgZWxzZSB0aHJvdyBuZXcgRXJyb3IoYFRyaWVkIHRvIGZpbmQgb3JpZ2luYWwgY29vcmRpbmF0ZSB2YWx1ZSB3aGlsZSBub3QgYmVpbmcgcHJvdmlkZWQgd2l0aCB0b2tlbnNgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGF4aXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIHRoZSBjb29yZGluYXRlICR7bWF0Y2h9IGZyb20gJHtjb29yZGluYXRlfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGF4aXMubmFtZT1tYXRjaFxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLm1lcmdlQXhpcyhjb29yZGluYXRlQXJyKVxuXG4gICAgICAgIGlmKGFuY2hvckFyciYmYW5jaG9yJiZhbmNob3IubWF0Y2goLygtLVxcK3wtLVxcK1xcKykvKSl7XG4gICAgICAgICAgICBsZXQgYTogQXhpc1xuICAgICAgICAgICAgaWYgKGFuY2hvci5tYXRjaCgvKC0tXFwrKS8pKXtcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kKChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kTGFzdCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGEsXCJhZGRpdGlvblwiKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG1lcmdlQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPikge1xuICAgICAgICBpZiAoIWF4ZXMuc29tZSgoYXhpczogYW55KSA9PiB0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIikpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IGF4aXMgb2YgYXhlcykge1xuICAgICAgICAgICAgaWYodHlwZW9mIGF4aXMgPT09IFwic3RyaW5nXCIpe2NvbnRpbnVlO31cbiAgICAgICAgICAgIGF4aXMubmFtZT11bmRlZmluZWRcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGF4ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBheGVzW2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHNpZGVzID0gZmluZEJlZm9yZUFmdGVyQXhpcyhheGVzLCBpKTtcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUF4aXMgPSBheGVzW3NpZGVzLmJlZm9yZV0gYXMgQXhpcztcbiAgICAgICAgICAgIGNvbnN0IGFmdGVyQXhpcyA9IGF4ZXNbc2lkZXMuYWZ0ZXJdIGFzIEF4aXM7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGxldCAgbWF0Y2ggPSBjdXJyZW50Lm1hdGNoKC9eXFwrJC8pO1xuICAgICAgICAgICAgbGV0IG1vZGUsbW9kaWZpZXJzO1xuICAgICAgICAgICAgaWYgKG1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJhZGRpdGlvblwiXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaD1jdXJyZW50Lm1hdGNoKC9eLVxcfCQvKVxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJyaWdodFByb2plY3Rpb25cIlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXlxcIShbXFxkLl0rKVxcISQvKVxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJpbnRlcm5hbFBvaW50XCJcbiAgICAgICAgICAgICAgICBtb2RpZmllcnM9dG9OdW1iZXIobWF0Y2hbMV0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKG1vZGUpe1xuICAgICAgICAgICAgICAgIGF4ZXMuc3BsaWNlKHNpZGVzLmJlZm9yZSwgc2lkZXMuYWZ0ZXIgLSBzaWRlcy5iZWZvcmUgKyAxLCBiZWZvcmVBeGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYWZ0ZXJBeGlzLG1vZGUsbW9kaWZpZXJzKSk7XG4gICAgICAgICAgICAgICAgaSA9IHNpZGVzLmJlZm9yZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGF4ZXMubGVuZ3RoID09PSAxICYmIGF4ZXNbMF0gaW5zdGFuY2VvZiBBeGlzKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29tcGxleENhcnRlc2lhbkFkZChheGlzOiBBeGlzLG1vZGU6IHN0cmluZyxtb2RpZmllcj86IGFueSl7XG4gICAgICAgIHN3aXRjaCAobW9kZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZGl0aW9uXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YKz1heGlzLmNhcnRlc2lhblg7XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZKz1heGlzLmNhcnRlc2lhblk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwic3VidHJhY3Rpb25cIjpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJyaWdodFByb2plY3Rpb25cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9YXhpcy5jYXJ0ZXNpYW5YXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiaW50ZXJuYWxQb2ludFwiOlxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD0odGhpcy5jYXJ0ZXNpYW5YK2F4aXMuY2FydGVzaWFuWCkqbW9kaWZpZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZPSh0aGlzLmNhcnRlc2lhblkrYXhpcy5jYXJ0ZXNpYW5ZKSptb2RpZmllcjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKClcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9O1xuXG5cbiAgICBnZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlOiBzdHJpbmcpe1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm4gPSBnZXRSZWdleCgpO1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW1xuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLmJhc2ljfSspYCwgXCJnXCIpLFxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLm1lcmdlfSspYCwgXCJnXCIpXG4gICAgICAgIF07XG4gICAgICAgIFxuICAgICAgICAvLyBTdGVwIDE6IEV4dHJhY3QgbWF0Y2hlcyBmb3IgZWFjaCBwYXR0ZXJuIHNlcGFyYXRlbHlcbiAgICAgICAgY29uc3QgYmFzaWNNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMF0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLnJlcGxhY2UoLy0kL2csIFwiXCIpLCAvLyBSZW1vdmUgdHJhaWxpbmcgaHlwaGVuIG9ubHlcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGgtKG1hdGNoWzBdLm1hdGNoKC8tJC8pPzE6MClcbiAgICAgICAgfSkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgbWVyZ2VNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMV0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLFxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxuICAgICAgICB9KSk7XG4gICAgICAgIGNvbnN0IG1hdGNoZXM6IEFycmF5PHsgZnVsbE1hdGNoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyIH0+ID0gW107XG5cbiAgICAgICAgZnVuY3Rpb24gaXNPdmVybGFwcGluZyhtYXRjaDE6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSwgbWF0Y2gyOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0pIHtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDEuaW5kZXggPCBtYXRjaDIuaW5kZXggKyBtYXRjaDIubGVuZ3RoICYmIG1hdGNoMi5pbmRleCA8IG1hdGNoMS5pbmRleCArIG1hdGNoMS5sZW5ndGg7XG4gICAgICAgIH1cblxuICAgICAgICBbLi4uYmFzaWNNYXRjaGVzLCAuLi5tZXJnZU1hdGNoZXNdLmZvckVhY2gobWF0Y2ggPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3ZlcmxhcHBpbmdJbmRleCA9IG1hdGNoZXMuZmluZEluZGV4KGV4aXN0aW5nTWF0Y2ggPT4gaXNPdmVybGFwcGluZyhleGlzdGluZ01hdGNoLCBtYXRjaCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAob3ZlcmxhcHBpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ01hdGNoID0gbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgY3VycmVudCBtYXRjaCBjb3ZlcnMgYSBsYXJnZXIgcmFuZ2UsIHJlcGxhY2UgdGhlIGV4aXN0aW5nIG9uZVxuICAgICAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPiBleGlzdGluZ01hdGNoLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdID0gbWF0Y2g7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgMzogU29ydCB0aGUgZmluYWwgbWF0Y2hlcyBieSBpbmRleFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgNDogVmFsaWRhdGUgdGhlIHJlc3VsdFxuICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvb3JkaW5hdGUgaXMgbm90IHZhbGlkOyBleHBlY3RlZCBhIHZhbGlkIGNvb3JkaW5hdGUuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRjaGVzO1xuICAgICAgICBcbiAgICB9XG4gICAgXG4gICAgXG4gICAgXG5cbiAgICBwcm9qZWN0aW9uKGF4aXMxOiBBeGlzfHVuZGVmaW5lZCxheGlzMjogQXhpc3x1bmRlZmluZWQpOmFueXtcbiAgICAgICAgaWYgKCFheGlzMXx8IWF4aXMyKXt0aHJvdyBuZXcgRXJyb3IoXCJheGlzJ3Mgd2VyZSB1bmRlZmluZWQgYXQgcHJvamVjdGlvblwiKTt9XG4gICAgICAgIHJldHVybiBbe1g6IGF4aXMxLmNhcnRlc2lhblgsWTogYXhpczIuY2FydGVzaWFuWX0se1g6IGF4aXMyLmNhcnRlc2lhblgsWTogYXhpczEuY2FydGVzaWFuWX1dXG4gICAgfVxuXG4gICAgY29tYmluZShjb29yZGluYXRlQXJyOiBhbnkpe1xuICAgICAgICBsZXQgeD0wLHk9MDtcbiAgICAgICAgY29vcmRpbmF0ZUFyci5mb3JFYWNoKChjb29yZGluYXRlOiBBeGlzKT0+e1xuICAgICAgICAgICAgeCs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgeSs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5ZO1xuICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPXg7dGhpcy5jYXJ0ZXNpYW5ZPXk7XG4gICAgfVxuICAgIGFkZENhcnRlc2lhbih4OiBzdHJpbmcgfCBudW1iZXIsIHk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgXG4gICAgICAgIGlmICgheSAmJiB0eXBlb2YgeCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgW3gsIHldID0geC5zcGxpdChcIixcIikubWFwKE51bWJlcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCB8fCB5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgQ2FydGVzaWFuIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhcnRlc2lhblggPSB4IGFzIG51bWJlcjtcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZID0geSBhcyBudW1iZXI7XG4gICAgfVxuICAgIFxuICAgIHBvbGFyVG9DYXJ0ZXNpYW4oKXtcbiAgICAgICAgY29uc3QgdGVtcD1wb2xhclRvQ2FydGVzaWFuKHRoaXMucG9sYXJBbmdsZSwgdGhpcy5wb2xhckxlbmd0aClcbiAgICAgICAgdGhpcy5hZGRDYXJ0ZXNpYW4odGVtcC5YLHRlbXAuWSlcbiAgICB9XG5cbiAgICBjYXJ0ZXNpYW5Ub1BvbGFyKCl7XG4gICAgICAgIGNvbnN0IHRlbXA9Y2FydGVzaWFuVG9Qb2xhcih0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSlcbiAgICAgICAgdGhpcy5hZGRQb2xhcih0ZW1wLmFuZ2xlLHRlbXAubGVuZ3RoKVxuICAgIH1cblxuICAgIGFkZFBvbGFyKGFuZ2xlOiBzdHJpbmcgfCBudW1iZXIsIGxlbmd0aD86IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAoIWxlbmd0aCAmJiB0eXBlb2YgYW5nbGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIFthbmdsZSwgbGVuZ3RoXSA9IGFuZ2xlLnNwbGl0KFwiOlwiKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYW5nbGUgPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBwb2xhciBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wb2xhckFuZ2xlID0gYW5nbGUgYXMgbnVtYmVyO1xuICAgICAgICB0aGlzLnBvbGFyTGVuZ3RoID0gbGVuZ3RoIGFzIG51bWJlcjtcbiAgICB9XG4gICAgYWRkUXVhZHJhbnQobWlkUG9pbnQ6IEF4aXMpe1xuICAgICAgICBjb25zdCB4PW1pZFBvaW50LmNhcnRlc2lhblg+dGhpcy5jYXJ0ZXNpYW5YO1xuICAgICAgICBjb25zdCB5PW1pZFBvaW50LmNhcnRlc2lhblk+dGhpcy5jYXJ0ZXNpYW5ZO1xuICAgICAgICB0aGlzLnF1YWRyYW50PXg/eT8xOjQ6eT8yOjM7XG4gICAgfVxuICAgIHRvU3RyaW5nU1ZHKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIgXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xuICAgIH1cbiAgICB0b1N0cmluZygpe1xuICAgICAgICByZXR1cm4gdGhpcy5jYXJ0ZXNpYW5YK1wiLFwiK3RoaXMuY2FydGVzaWFuWTtcbiAgICB9XG5cbiAgICBpbnRlcnNlY3Rpb24oY29vcmQ6IHN0cmluZywgZmluZE9yaWdpbmFsVmFsdWU6IChjb29yZDogc3RyaW5nKSA9PiBDb29yZGluYXRlIHwgdW5kZWZpbmVkKToge1g6bnVtYmVyLFk6bnVtYmVyfSB7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvKFxccyphbmRcXHM/fC0tKS9nLCBcIiBcIilcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcbiAgICAgICAgICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpXG4gICAgICAgICAgICAuZmlsdGVyKCh0b2tlbik6IHRva2VuIGlzIENvb3JkaW5hdGUgPT4gdG9rZW4gIT09IHVuZGVmaW5lZCk7XG5cbiAgICAgICAgaWYgKG9yaWdpbmFsQ29vcmRzLmxlbmd0aCA8IDQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludGVyc2VjdGlvbiBoYWQgdW5kZWZpbmVkIGNvb3JkaW5hdGVzIG9yIGluc3VmZmljaWVudCBkYXRhLlwiKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc3Qgc2xvcGVzID0gW1xuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMV0uYXhpcyBhcyBBeGlzKSxcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1syXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzNdLmF4aXMgYXMgQXhpcyksXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGZpbmRJbnRlcnNlY3Rpb25Qb2ludChvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvUG9pbnQodmFsdWU6bnVtYmVyLGZvcm1hdDogc3RyaW5nKXtcbiAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICBjYXNlIFwiUG9pbnRcIjpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgY2FzZSBcImNtXCI6IFxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKjI4LjM0NjtcbiAgICAgICAgY2FzZSBcIm1tXCI6XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqIDIuODM0NjtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInVua25vbiBmb3JtYXRcIik7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIG1hdGNoS2V5V2l0aFZhbHVlKGtleTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCB2YWx1ZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgXCJhbmNob3JcIjogXCJhbmNob3I9XCIsXG4gICAgICAgIFwicm90YXRlXCI6IFwicm90YXRlPVwiLFxuICAgICAgICBcImxpbmVXaWR0aFwiOiBcImxpbmUgd2lkdGg9XCIsXG4gICAgICAgIFwiZmlsbFwiOiBcImZpbGw9XCIsXG4gICAgICAgIFwiZmlsbE9wYWNpdHlcIjogXCJmaWxsIG9wYWNpdHk9XCIsXG4gICAgICAgIFwidGV4dE9wYWNpdHlcIjogXCJ0ZXh0IG9wYWNpdHk9XCIsXG4gICAgICAgIFwidGV4dENvbG9yXCI6IFwidGV4dCBjb2xvcj1cIixcbiAgICAgICAgXCJkcmF3XCI6IFwiZHJhdz1cIixcbiAgICAgICAgXCJ0ZXh0XCI6IFwidGV4dD1cIixcbiAgICAgICAgXCJwb3NcIjogXCJwb3M9XCIsXG4gICAgICAgIFwic2NhbGVcIjogXCJzY2FsZT1cIixcbiAgICAgICAgXCJkZWNvcmF0ZVwiOiBcImRlY29yYXRlXCIsXG4gICAgICAgIFwic2xvcGVkXCI6IFwic2xvcGVkXCIsXG4gICAgICAgIFwiZGVjb3JhdGlvblwiOiBcImRlY29yYXRpb249XCIsXG4gICAgICAgIFwiYnJhY2VcIjogXCJicmFjZVwiLFxuICAgICAgICBcImFtcGxpdHVkZVwiOiBcImFtcGxpdHVkZT1cIixcbiAgICAgICAgXCJhbmdsZVJhZGl1c1wiOiBcImFuZ2xlIHJhZGl1cz1cIixcbiAgICAgICAgXCJhbmdsZUVjY2VudHJpY2l0eVwiOiBcImFuZ2xlIGVjY2VudHJpY2l0eT1cIixcbiAgICAgICAgXCJmb250XCI6IFwiZm9udD1cIixcbiAgICAgICAgXCJwaWNUZXh0XCI6IFwicGljIHRleHQ9XCIsXG4gICAgICAgIFwibGFiZWxcIjogXCJsYWJlbD1cIixcbiAgICAgICAgXCJmcmVlRm9ybVRleHRcIjogJzonLFxuICAgIH07XG5cbiAgICByZXR1cm4gdmFsdWVNYXBba2V5XSB8fCAnJztcbn1cblxuXG50eXBlIERlY29yYXRpb24gPSB7XG4gICAgYnJhY2U/OiBib29sZWFuO1xuICAgIGNvaWw6IGJvb2xlYW47XG4gICAgYW1wbGl0dWRlPzogbnVtYmVyO1xuICAgIGFzcGVjdD86IG51bWJlcjtcbiAgICBzZWdtZW50TGVuZ3RoPzogbnVtYmVyO1xuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uOyBcbn07XG5cbnR5cGUgTGFiZWwgPSB7XG4gICAgZnJlZUZvcm1UZXh0Pzogc3RyaW5nO1xuICAgIGNvbG9yPzogc3RyaW5nO1xuICAgIG9wYWNpdHk/OiBudW1iZXJcbn07XG5jb25zdCBkZWZhdWx0VmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge1xuICAgIGZyZWVGb3JtVGV4dDogXCJcIixcbiAgICBjb2xvcjogXCJcIixcbiAgICBvcGFjaXR5OiAxLFxufTtcblxuZnVuY3Rpb24gbGluZVdpZHRoQ29udmVydGVyKHdpZHRoOiBzdHJpbmcpe1xuICAgIHJldHVybiBOdW1iZXIod2lkdGgucmVwbGFjZSgvdWx0cmFcXHMqdGhpbi8sXCIwLjFcIilcbiAgICAucmVwbGFjZSgvdmVyeVxccyp0aGluLyxcIjAuMlwiKVxuICAgIC5yZXBsYWNlKC90aGluLyxcIjAuNFwiKVxuICAgIC5yZXBsYWNlKC9zZW1pdGhpY2svLFwiMC42XCIpXG4gICAgLnJlcGxhY2UoL3RoaWNrLyxcIjAuOFwiKVxuICAgIC5yZXBsYWNlKC92ZXJ5XFxzKnRoaWNrLyxcIjEuMlwiKVxuICAgIC5yZXBsYWNlKC91bHRyYVxccyp0aGljay8sXCIxLjZcIikpXG59XG5cbmV4cG9ydCBjbGFzcyBGb3JtYXR0aW5ne1xuICAgIC8vIGltcG9ydGVudCBuZWVkcyB0byBiZSBmb3JzdFxuICAgIHBhdGg/OiBzdHJpbmc7XG5cbiAgICBzY2FsZTogbnVtYmVyO1xuICAgIHJvdGF0ZT86IG51bWJlcjtcbiAgICBsaW5lV2lkdGg/OiBudW1iZXI9MC40O1xuICAgIHRleHRPcGFjaXR5OiBudW1iZXI7XG4gICAgb3BhY2l0eT86IG51bWJlcjtcbiAgICBmaWxsT3BhY2l0eT86IG51bWJlcjtcbiAgICBwb3M/OiBudW1iZXI7XG4gICAgYW5nbGVFY2NlbnRyaWNpdHk/OiBudW1iZXI7XG4gICAgYW5nbGVSYWRpdXM/OiBudW1iZXI7XG4gICAgbGV2ZWxEaXN0YW5jZT86IG51bWJlcjtcblxuICAgIG1vZGU6IHN0cmluZztcbiAgICBhbmNob3I/OiBzdHJpbmc7XG4gICAgY29sb3I/OiBzdHJpbmc7XG4gICAgdGV4dENvbG9yPzogc3RyaW5nO1xuICAgIGZpbGw/OiBzdHJpbmc7XG4gICAgYXJyb3c/OiBzdHJpbmc7XG4gICAgZHJhdz86IHN0cmluZztcbiAgICB0ZXh0Pzogc3RyaW5nO1xuICAgIHRpa3pzZXQ/OiBzdHJpbmc7XG4gICAgcG9zaXRpb24/OiBzdHJpbmc7XG4gICAgbGluZVN0eWxlPzogc3RyaW5nO1xuICAgIGZvbnQ/OiBzdHJpbmc7XG4gICAgcGljVGV4dD86IHN0cmluZztcbiAgICBcbiAgICBzbG9wZWQ/OiBib29sZWFuO1xuICAgIGRlY29yYXRlPzogYm9vbGVhbjtcbiAgICBsYWJlbD86IExhYmVsO1xuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uO1xuXG4gICAgY29uc3RydWN0b3IoZm9ybWF0dGluZzogYW55W10sbW9kZT86IHN0cmluZyl7XG4gICAgICAgIGlmKG1vZGUpdGhpcy5tb2RlPW1vZGU7XG4gICAgICAgIHRoaXMuYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nfHxbXSk7XG4gICAgfVxuXG5cbiAgICBhc3NpZ25Gb3JtYXR0aW5nKFxuICAgICAgICBmb3JtYXR0aW5nQXJyOiBBcnJheTx7IGtleTogc3RyaW5nOyB2YWx1ZTogYW55IH0+LFxuICAgICAgICB0YXJnZXRTY29wZTogUmVjb3JkPHN0cmluZywgYW55PiA9IHRoaXNcbiAgICApIHtcbiAgICAgICAgZm9yIChjb25zdCB7IGtleSwgdmFsdWUgfSBvZiBmb3JtYXR0aW5nQXJyKSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbGl6ZWRLZXkgPSBPYmplY3Qua2V5cyh0YXJnZXRTY29wZSkuZmluZChcbiAgICAgICAgICAgICAgICAocHJvcCkgPT4gcHJvcC50b0xvd2VyQ2FzZSgpID09PSBrZXkudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICAgKSB8fCBrZXk7XG4gICAgXG4gICAgICAgICAgICBpZiAodGhpcy5pc05lc3RlZCh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0YXJnZXRTY29wZVtub3JtYWxpemVkS2V5XSA9IHRhcmdldFNjb3BlW25vcm1hbGl6ZWRLZXldIHx8IHRoaXMuY3JlYXRlTmVzdGVkKG5vcm1hbGl6ZWRLZXkpO1xuICAgICAgICAgICAgICAgIHRoaXMuYXNzaWduRm9ybWF0dGluZyh2YWx1ZSx0YXJnZXRTY29wZVtub3JtYWxpemVkS2V5XSlcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgdGFyZ2V0U2NvcGVbbm9ybWFsaXplZEtleV09dmFsdWVcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBzZXRQcm9wZXJ0eShzY29wZTogYW55LCBrZXk6IGFueSwgdmFsdWU6IGFueSk6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIHNjb3BlID09PSBcIm9iamVjdFwiICYmIHNjb3BlICE9PSBudWxsKSB7XG4gICAgICAgICAgICBzY29wZVtrZXldID0gdmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiSW52YWxpZCBzY29wZSBwcm92aWRlZC4gRXhwZWN0ZWQgYW4gb2JqZWN0IGJ1dCByZWNlaXZlZDpcIiwgc2NvcGUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgY3JlYXRlTmVzdGVkKGtleTogc3RyaW5nKSB7XG4gICAgICAgIHN3aXRjaCAoa2V5KSB7XG4gICAgICAgICAgICBjYXNlICdsYWJlbCc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgY29sb3I6IHVuZGVmaW5lZCwgb3BhY2l0eTogdW5kZWZpbmVkLGZyZWVGb3JtVGV4dDogdW5kZWZpbmVkIH07XG4gICAgICAgICAgICBjYXNlICdkZWNvcmF0aW9uJzpcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICBicmFjZTogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBjb2lsOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgYW1wbGl0dWRlOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGFzcGVjdDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBzZWdtZW50TGVuZ3RoOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGRlY29yYXRpb246IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgaXNOZXN0ZWQodmFsdWU6IGFueSl7XG4gICAgICAgIHJldHVybiBBcnJheS5pc0FycmF5KHZhbHVlKSAmJiB2YWx1ZS5zb21lKChpdGVtOiBhbnkpID0+IGl0ZW0ua2V5ICYmIGl0ZW0udmFsdWUpO1xuICAgIH1cbiAgICBcbiAgICBcbiAgICBcblxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcbiAgICAgICAga2V5OiBLLFxuICAgICAgICBmb3JtYXR0aW5nOiBhbnksXG4gICAgICAgIG5lc3RlZEtleT86IE5LXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGxldCB2YWx1ZTtcbiAgICAgICAgaWYodHlwZW9mIGZvcm1hdHRpbmchPT1cImJvb2xlYW5cIil7XG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBmb3JtYXR0aW5nLnNwbGl0KFwiPVwiKTtcbiAgICBcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgZm9ybWF0dGluZyBzdHJpbmcgaXMgdmFsaWRcbiAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPCAyIHx8ICFtYXRjaFsxXSkgcmV0dXJuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGlmIHRoZSB2YWx1ZSBpcyBhIG51bWJlciBvciBhIHN0cmluZ1xuICAgICAgICAgICAgdmFsdWUgPSAhaXNOYU4ocGFyc2VGbG9hdChyYXdWYWx1ZSkpICYmIGlzRmluaXRlKCtyYXdWYWx1ZSlcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXG4gICAgICAgICAgICAgICAgOiByYXdWYWx1ZS5yZXBsYWNlKC8tXFx8Lywnbm9ydGgnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNle1xuICAgICAgICAgICAgdmFsdWU9Zm9ybWF0dGluZ1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvL3RoaXMuc2V0UHJvcGVydHkoa2V5LCB2YWx1ZSwgbmVzdGVkS2V5KTtcbiAgICB9XG4gICAgXG5cbiAgICBcblxuXG4gICAgYWRkVGlrenNldChzcGxpdEZvcm1hdHRpbmc6IGFueSl7XG4gICAgICAgIGNvbnN0IGE9c3BsaXRGb3JtYXR0aW5nLmZpbmQoKGl0ZW06IHN0cmluZyk9PiBpdGVtLm1hdGNoKC9tYXNzfGFuZ3xoZWxwbGluZXMvKSlcbiAgICAgICAgaWYgKCFhJiYhdGhpcy50aWt6c2V0KXJldHVybjtcbiAgICAgICAgaWYoYSkgdGhpcy50aWt6c2V0PWE7XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLnRpa3pzZXQpIHtcbiAgICAgICAgICAgIGNhc2UgXCJtYXNzXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPVwieWVsbG93ITYwXCI7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoPVwiZHJhd1wiO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dD1cImJsYWNrXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwidmVjXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5hcnJvdz0nLT4nXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiaGVscGxpbmVzXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5saW5lV2lkdGg9MC40O1xuICAgICAgICAgICAgICAgIHRoaXMuZHJhdz0nZ3JheSc7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYW5nXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoPSdkcmF3J1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD0nYmxhY2shNTAnO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsbE9wYWNpdHk9MC41O1xuICAgICAgICAgICAgICAgIHRoaXMuZHJhdz0nb3JhbmdlJ1xuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9JzwtPidcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlRWNjZW50cmljaXR5PTEuNjtcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlUmFkaXVzPXRvUG9pbnQoMC41LFwiY21cIik7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0PSdvcmFuZ2UnO1xuICAgICAgICAgICAgICAgIHRoaXMuZm9udD0nXFxcXGxhcmdlJztcbiAgICAgICAgICAgICAgICB0aGlzLnRleHRPcGFjaXR5PTAuOTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWRkU3Bsb3BBbmRQb3NpdGlvbihhcnI6IGFueSxpbmRleDogbnVtYmVyKXtcbiAgICAgICAgY29uc3QgYmVmb3JlQWZ0ZXI9ZmluZEJlZm9yZUFmdGVyQXhpcyhhcnIsaW5kZXgpO1xuICAgICAgICBjb25zdCBbYmVmb3JlLCBhZnRlcl09W2FycltiZWZvcmVBZnRlci5iZWZvcmVdLGFycltiZWZvcmVBZnRlci5hZnRlcl1dXG4gICAgICAgIGlmICh0aGlzLnBvc2l0aW9ufHx0aGlzLnNsb3BlZCl7cmV0dXJufVxuICAgIFxuICAgICAgICBjb25zdCBlZGdlMSA9IGJlZm9yZS5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcbiAgICAgICAgY29uc3QgZWRnZTIgPSBhZnRlci5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcbiAgICAgICAgY29uc3Qgc2xvcGU9ZmluZFNsb3BlKGJlZm9yZSxhZnRlcilcblxuICAgICAgICB0aGlzLnNsb3BlZCA9IHNsb3BlICE9PSAwJiZzbG9wZSE9PUluZmluaXR5JiZzbG9wZSE9PS1JbmZpbml0eTtcblxuICAgICAgICBsZXQgcXVhZHJhbnRcblxuICAgICAgICBpZiAoZWRnZTEhPT1lZGdlMilcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxK2VkZ2UyO1xuICAgICAgICBlbHNlIFxuICAgICAgICAgICAgcXVhZHJhbnQ9ZWRnZTE7XG5cbiAgICAgICAgLy9zaW50IHBhcmFsbGVsIHRvIFkgYXhpc1xuICAgICAgICBpZiAoc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHkpe1xuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHF1YWRyYW50LnJlcGxhY2UoLygzfDQpLyxcImJlbG93XCIpLnJlcGxhY2UoLygxfDIpLyxcImFib3ZlXCIpLnJlcGxhY2UoLyhiZWxvd2Fib3ZlfGFib3ZlYmVsb3cpLyxcIlwiKVxuICAgICAgICB9XG4gICAgICAgIC8vaXNudCBwYXJhbGxlbCB0byBYIGF4aXNcbiAgICAgICAgaWYgKHNsb3BlICE9PSAwKXtcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb249dGhpcy5wb3NpdGlvbj90aGlzLnBvc2l0aW9uOicnO1xuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbis9cXVhZHJhbnQucmVwbGFjZSgvKDF8NCkvLFwicmlnaHRcIikucmVwbGFjZSgvKDJ8MykvLFwibGVmdFwiKS5yZXBsYWNlKC8ocmlnaHRsZWZ0fGxlZnRyaWdodCkvLFwiXCIpXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHRoaXMucG9zaXRpb24/LnJlcGxhY2UoL1tcXGRdKy9nLFwiXCIpLnJlcGxhY2UoLyhiZWxvd3xhYm92ZSkocmlnaHR8bGVmdCkvLFwiJDEgJDJcIik7XG4gICAgfVxuXG4gICAgXG4gICAgXG5cbiAgICBpbnRlcnByZXRGb3JtYXR0aW5nKGZvcm1hdHRpbmdTdHJpbmc6IHN0cmluZykge1xuICAgICAgICBjb25zdCBzcGxpdEZvcm1hdHRpbmcgPSBmb3JtYXR0aW5nU3RyaW5nLnJlcGxhY2UoL1xccy9nLCBcIlwiKS5tYXRjaCgvKD86e1tefV0qfXxbXix7fV0rKSsvZykgfHwgW107XG4gICAgXG4gICAgICAgIHRoaXMuYWRkVGlrenNldChzcGxpdEZvcm1hdHRpbmcpO1xuICAgIFxuICAgICAgICBjb25zdCBwYXR0ZXJuczogUmVjb3JkPHN0cmluZywgKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQ+ID0ge1xuICAgICAgICAgICAgXCJsaW5ld2lkdGhcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwibGluZVdpZHRoXCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiZmlsbD1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZmlsbFwiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5maWxsb3BhY2l0eVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJmaWxsT3BhY2l0eVwiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl4oLT58PC18LSp7U3RlYWx0aH0tKikkXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmFycm93ID0gdmFsdWU7IH0sXG4gICAgICAgICAgICBcIl4oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCl7MSwyfSRcIjogKHZhbHVlKSA9PiB7IHRoaXMucG9zaXRpb24gPSB2YWx1ZS5yZXBsYWNlKC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLCBcIiQxIFwiKTsgfSxcbiAgICAgICAgICAgIFwiXnBvcz1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwicG9zXCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXmRyYXc9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImRyYXdcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeZGVjb3JhdGUkXCI6ICgpID0+IHsgdGhpcy5kZWNvcmF0ZSA9IHRydWU7IH0sXG4gICAgICAgICAgICBcIl50ZXh0PVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJ0ZXh0XCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXmFuY2hvcj1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiYW5jaG9yXCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXlxcXCJeXFxcIiRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImxhYmVsXCIsdHJ1ZSxcImZyZWVGb3JtVGV4dFwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJsYWJlbFwiXT4pLFxuICAgICAgICAgICAgXCJeYnJhY2UkXCI6ICgpID0+IHRoaXMuc2V0UHJvcGVydHkoXCJkZWNvcmF0aW9uXCIsdHJ1ZSxcImJyYWNlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+KSxcbiAgICAgICAgICAgIFwiXmFtcGxpdHVkZVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJkZWNvcmF0aW9uXCIsIHZhbHVlLCBcImFtcGxpdHVkZVwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJkZWNvcmF0aW9uXCJdPiksXG4gICAgICAgICAgICBcIl5kcmF3JFwiOiAodmFsdWUpID0+IHsgdGhpcy5wYXRoID0gdmFsdWU7IH0sXG4gICAgICAgICAgICBcIl4ocmVkfGJsdWV8cGlua3xibGFja3x3aGl0ZXxbIVxcXFxkLl0rKXsxLDV9JFwiOiAodmFsdWUpID0+IHsgdGhpcy5jb2xvciA9IHZhbHVlOyB9LFxuICAgICAgICAgICAgXCJeKGRvdHRlZHxkYXNoZWR8c21vb3RofGRlbnNlbHl8bG9vc2VseSl7MSwyfSRcIjogKHZhbHVlKSA9PiB7IHRoaXMubGluZVN0eWxlID0gdmFsdWUucmVwbGFjZSgvKGRlbnNlbHl8bG9vc2VseSkvLCBcIiQxIFwiKTsgfSxcbiAgICAgICAgfTtcblxuICAgICAgICBzcGxpdEZvcm1hdHRpbmcuZm9yRWFjaChmb3JtYXR0aW5nID0+IHsvKlxuICAgICAgICAgICAgLy8gSGFuZGxlIG5lc3RlZCBwcm9wZXJ0aWVzXG4gICAgICAgICAgICBjb25zdCBtYXRjaCA9IGZvcm1hdHRpbmcubWF0Y2goL14oW149XSspPXsoLiopfSQvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IFtfLCBwYXJlbnQsIGNoaWxkcmVuXSA9IG1hdGNoO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZ09iaiA9IHRoaXMgYXMgUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICAgICAgICAgICAgICBpZiAoIWZvcm1hdHRpbmdPYmpbcGFyZW50XSkge1xuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nT2JqW3BhcmVudF0gPSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkQ2hpbGQgPSBuZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUse30sY2hpbGRyZW4pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oZm9ybWF0dGluZ09ialtwYXJlbnRdLCAocGFyc2VkQ2hpbGQgYXMgUmVjb3JkPHN0cmluZywgYW55PilbcGFyZW50XSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtwYXR0ZXJuLCBoYW5kbGVyXSBvZiBPYmplY3QuZW50cmllcyhwYXR0ZXJucykpIHtcbiAgICAgICAgICAgICAgICBpZiAobmV3IFJlZ0V4cChwYXR0ZXJuKS50ZXN0KGZvcm1hdHRpbmcpKSB7XG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXIoZm9ybWF0dGluZyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9Ki9cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIFxuXG4gICAgdG9TdHJpbmcob2JqPzogYW55KTogc3RyaW5nIHtcbiAgICAgICAgbGV0IHN0cmluZz1vYmo/J3snOidbJztcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqP29iajp0aGlzKSkge1xuICAgICAgICAgICAgaWYgKGtleS5tYXRjaCgvXihtb2RlfHRpa3pzZXQpJC8pKXtjb250aW51ZTt9XG4gICAgICAgICAgICBpZih0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnJiZ2YWx1ZSl7XG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrdGhpcy50b1N0cmluZyh2YWx1ZSkrJywnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHN0cmluZys9bWF0Y2hLZXlXaXRoVmFsdWUoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcpKyh0eXBlb2YgdmFsdWU9PT1cImJvb2xlYW5cIj8nJzp2YWx1ZSkrJywnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdHJpbmcrKG9iaj8nfSc6J10nKTtcbiAgICB9XG5cbiAgICBoYW5kbGVPYmplY3RUb1N0cmluZyhvYmo6IG9iamVjdCwgcGFyZW50S2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICBsZXQgcmVzdWx0ID0gbWF0Y2hLZXlXaXRoVmFsdWUocGFyZW50S2V5KSsneyc7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBtYXRjaEtleVdpdGhWYWx1ZShgJHtwYXJlbnRLZXl9LiR7a2V5fWApICsgKHR5cGVvZiB2YWx1ZSA9PT0gXCJib29sZWFuXCIgPyAnJyA6IHZhbHVlKSArICcsJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0K1wifSxcIjtcbiAgICB9XG59XG5cbnR5cGUgTW9kZSA9IFwiY29vcmRpbmF0ZVwiIHwgXCJjb29yZGluYXRlLWlubGluZVwiIHwgXCJub2RlXCIgfCBcIm5vZGUtaW5saW5lXCI7XG5cbmV4cG9ydCBjbGFzcyBDb29yZGluYXRlIHtcbiAgICBtb2RlOiBNb2RlXG4gICAgYXhpcz86IEF4aXNcbiAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZ1xuICAgIHZhcmlhYmxlPzogQXhpc1xuICAgIGxhYmVsPzogc3RyaW5nXG4gICAgXG4gIGNvbnN0cnVjdG9yKG1vZGU6IE1vZGUsYXhpcz86IEF4aXMsZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsdmFyaWFibGU/OiBBeGlzLGxhYmVsPzogc3RyaW5nLCkge1xuICAgIHRoaXMubW9kZT1tb2RlO1xuICAgIHRoaXMuYXhpcz1heGlzO1xuICAgIHRoaXMuZm9ybWF0dGluZz1mb3JtYXR0aW5nO1xuICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XG4gICAgdGhpcy5sYWJlbD1sYWJlbDtcbiAgfVxuICAgIGludGVycHJldENvb3JkaW5hdGUoY29vcmRpbmF0ZXM6IGFueVtdKXtcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZz1jb29yZGluYXRlcy5maW5kKGNvb3I9PmNvb3IgaW5zdGFuY2VvZiBGb3JtYXR0aW5nKVxuICAgICAgICBjb25zdCBheGlzPWNvb3JkaW5hdGVzLmZpbmQoY29vcj0+Y29vciBpbnN0YW5jZW9mIEF4aXMpXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlPWNvb3JkaW5hdGVzLmZpbmQoY29vcj0+Y29vcj8udHlwZT09PSd2YXJpYWJsZScpLnZhbHVlXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZz1mb3JtYXR0aW5nO1xuICAgICAgICB0aGlzLmF4aXM9YXhpc1xuICAgICAgICB0aGlzLnZhcmlhYmxlPXZhcmlhYmxlXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIGNsb25lKCk6IENvb3JkaW5hdGUge1xuICAgICAgICByZXR1cm4gbmV3IENvb3JkaW5hdGUoXG4gICAgICAgICAgICB0aGlzLm1vZGUsXG4gICAgICAgICAgICB0aGlzLmF4aXMgPyB0aGlzLmF4aXMuY2xvbmUoKSA6dW5kZWZpbmVkLFxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nLFxuICAgICAgICAgICAgdGhpcy52YXJpYWJsZSxcbiAgICAgICAgICAgIHRoaXMubGFiZWwsXG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgYWRkQXhpcyhjYXJ0ZXNpYW5YPzogbnVtYmVyLCBjYXJ0ZXNpYW5ZPzogbnVtYmVyLCBwb2xhckxlbmd0aD86IG51bWJlciwgcG9sYXJBbmdsZT86IG51bWJlcil7XG4gICAgICAgIHRoaXMuYXhpcz1uZXcgQXhpcyhjYXJ0ZXNpYW5YLCBjYXJ0ZXNpYW5ZLCBwb2xhckxlbmd0aCwgcG9sYXJBbmdsZSk7XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMubW9kZSlcbiAgICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJjb29yZGluYXRlXCI6XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuYFxcXFxjb29yZGluYXRlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpIHx8ICcnfSAoJHt0aGlzLnZhcmlhYmxlIHx8IFwiXCJ9KSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pO2BcbiAgICAgICAgICAgIGNhc2UgXCJub2RlXCI6XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcyl7fVxuICAgICAgICAgICAgICAgICAgICAvL3JldHVybiBgXFxcXG5vZGUgJHt0aGlzLmNvb3JkaW5hdGVOYW1lPycoJyt0aGlzLmNvb3JkaW5hdGVOYW1lKycpJzonJ30gYXQgKCR7dGhpcy5heGlzLnRvU3RyaW5nKCl9KSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKXx8Jyd9IHske3RoaXMubGFiZWx9fTtgXG4gICAgICAgICAgICBjYXNlIFwibm9kZS1pbmxpbmVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gYG5vZGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9IHske3RoaXMubGFiZWwgfHwgJyd9fWBcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZmluZCBtb2RlIGF0IHRvIHN0cmluZyBjb29yZGluYXRlXCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG59XG5cbmV4cG9ydCB0eXBlIFRva2VuID1BeGlzIHwgQ29vcmRpbmF0ZSB8RHJhd3xGb3JtYXR0aW5nfCBzdHJpbmc7XG5cbmV4cG9ydCBjbGFzcyBEcmF3IHtcbiAgICBtb2RlOiBzdHJpbmdcbiAgICBmb3JtYXR0aW5nOiBGb3JtYXR0aW5nO1xuICAgIGNvb3JkaW5hdGVzOiBhbnlbXT1bXTtcblxuXG4gICAgY29uc3RydWN0b3IobW9kZTogc3RyaW5nLGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLGNvb3JkaW5hdGVzPzogYW55W10sIHRva2Vucz86IEZvcm1hdFRpa3pqYXgsKSB7O1xuICAgICAgICB0aGlzLm1vZGU9bW9kZTtcbiAgICAgICAgaWYoZm9ybWF0dGluZylcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZz1mb3JtYXR0aW5nO1xuICAgICAgICBpZihjb29yZGluYXRlcylcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXM9Y29vcmRpbmF0ZXM7XG4gICAgfVxuICAgIGNyZWF0ZUZyb21BcnJheShhcnI6IGFueSl7LypcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpPTA7aTxhcnIubGVuZ3RoO2krKyl7XG4gICAgICAgICAgICBpZiAoYXJyW2ldIGluc3RhbmNlb2YgQXhpc3x8YXJyW2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSl7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmKHR5cGVvZiBhcnI9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZXNBcnJheTsqL1xuICAgIH1cblxuICAgIGZpbGxDb29yZGluYXRlcyhzY2hlbWF0aWM6IGFueVtdLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4KSB7XG4gICAgICAgIGlmKHNjaGVtYXRpY1swXSBpbnN0YW5jZW9mIEZvcm1hdHRpbmcpe1xuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPXNjaGVtYXRpY1swXVxuICAgICAgICAgICAgc2NoZW1hdGljLnNwbGljZSgwLDEpXG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVmZXJlbmNlRmlyc3RBeGlzTWFwID0gc2NoZW1hdGljXG4gICAgICAgICAgICAubWFwKChjb29yLCBpbmRleCkgPT4gKGNvb3IgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbiAmJiBjb29yLm5hbWUgPT09ICdSZWZlcmVuY2VGaXJzdEF4aXMnID8gaW5kZXggOiBudWxsKSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpOiB0IGlzIG51bWJlciA9PiB0ICE9PSBudWxsKTsgXG5cbiAgICAgICAgY29uc3QgcmVmZXJlbmNlTGFzdEF4aXNNYXAgPSBzY2hlbWF0aWNcbiAgICAgICAgICAgIC5tYXAoKGNvb3IsIGluZGV4KSA9PiAoY29vciBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuICYmIGNvb3IubmFtZSA9PT0gJ1JlZmVyZW5jZUxhc3RBeGlzJyA/IGluZGV4IDogbnVsbCkpXG4gICAgICAgICAgICAuZmlsdGVyKCh0KTogdCBpcyBudW1iZXIgPT4gdCAhPT0gbnVsbCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtYXBwZWRSZWZlcmVuY2VzID0gcmVmZXJlbmNlRmlyc3RBeGlzTWFwLm1hcChpbmRleCA9PiB7XG4gICAgICAgICAgICBzY2hlbWF0aWNbaW5kZXhdLm5hbWU9J0F4aXNDb25uZWN0ZXInXG4gICAgICAgICAgICBjb25zdCBuZXh0QXhpc0luZGV4ID0gc2NoZW1hdGljLnNsaWNlKGluZGV4ICsgMSkuZmluZEluZGV4KGl0ZW0gPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXMgPSBuZXh0QXhpc0luZGV4ICE9PSAtMSA/IHNjaGVtYXRpY1tpbmRleCArIDEgKyBuZXh0QXhpc0luZGV4XSA6IG51bGw7XG4gICAgICAgIFxuICAgICAgICAgICAgcmV0dXJuIG5leHRBeGlzO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCByZWxhdGlvbnNoaXBzID0gcmVmZXJlbmNlTGFzdEF4aXNNYXAubWFwKGluZGV4ID0+IHtcbiAgICAgICAgICAgIHNjaGVtYXRpY1tpbmRleF0ubmFtZT0nQXhpc0Nvbm5lY3RlcidcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzSW5kZXggPSBzY2hlbWF0aWMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XG4gICAgICAgICAgICBjb25zdCBuZXh0QXhpcyA9IG5leHRBeGlzSW5kZXggIT09IC0xID8gc2NoZW1hdGljW2luZGV4ICsgMSArIG5leHRBeGlzSW5kZXhdIDogbnVsbDtcblxuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNBeGlzSW5kZXggPSBzY2hlbWF0aWNcbiAgICAgICAgICAgICAgICAuc2xpY2UoMCwgaW5kZXgpXG4gICAgICAgICAgICAgICAgLnJldmVyc2UoKVxuICAgICAgICAgICAgICAgIC5maW5kSW5kZXgoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzQXhpcyA9IHByZXZpb3VzQXhpc0luZGV4ICE9PSAtMSA/IHNjaGVtYXRpY1tpbmRleCAtIDEgLSBwcmV2aW91c0F4aXNJbmRleF0gOiBudWxsO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHJlZmVyZW5jZUZpcnN0QXhpczogc2NoZW1hdGljW2luZGV4XSxcbiAgICAgICAgICAgICAgICBwcmV2aW91c0F4aXMsXG4gICAgICAgICAgICAgICAgbmV4dEF4aXMsXG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgICAgaWYobWFwcGVkUmVmZXJlbmNlcy5sZW5ndGg+MCl7XG4gICAgICAgICAgICBjb25zdCBmaXJzdEF4aXM9c2NoZW1hdGljLmZpbmQodD0+dCBpbnN0YW5jZW9mIEF4aXMpXG4gICAgICAgICAgICBtYXBwZWRSZWZlcmVuY2VzLmZvckVhY2goYXhpcyA9PiB7XG4gICAgICAgICAgICAgICAgYXhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGZpcnN0QXhpcyxcImFkZGl0aW9uXCIpXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXM9c2NoZW1hdGljO1xuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICBcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgY29vckFycjogQXJyYXk8VG9rZW4+PVtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjaGVtYXRpYy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNjaGVtYXRpY1tpXS50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xuICAgICAgICAgICAgICAgIGxldCBwcmV2aW91c0Zvcm1hdHRpbmc7XG5cbiAgICAgICAgICAgICAgICBpZiAoaSA+IDAgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDFdLnZhbHVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA+IDEgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcIm5vZGVcIiAmJiBzY2hlbWF0aWNbaSAtIDJdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMl0udmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChuZXcgQXhpcygpLnVuaXZlcnNhbChzY2hlbWF0aWNbaV0udmFsdWUsIHRva2VucywgY29vckFyciwgcHJldmlvdXNGb3JtYXR0aW5nLCApKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZihzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJub2RlXCIpe1xuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChuZXcgQ29vcmRpbmF0ZSh7bGFiZWw6IHNjaGVtYXRpY1tpXS52YWx1ZSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGUtaW5saW5lXCIse30sc2NoZW1hdGljW2ldLmZvcm1hdHRpbmcpLG1vZGU6IFwibm9kZS1pbmxpbmVcIn0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKHNjaGVtYXRpY1tpXS52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvb3JBcnI7Ki9cbiAgICB9XG5cbiAgICBnZXRTY2hlbWF0aWMoZHJhdzogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4PWdldFJlZ2V4KCk7XG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gcmVnRXhwKFN0cmluZy5yYXdgbm9kZVxccypcXFs/KCR7cmVnZXguZm9ybWF0dGluZ30qKVxcXT9cXHMqeygke3JlZ2V4LnRleHR9Kil9YCk7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRpbmdSZWdleCA9IC8oLS1jeWNsZXxjeWNsZXwtLVxcK1xcK3wtLVxcK3wtLXwtXFx8fFxcfC18Z3JpZHxjaXJjbGV8cmVjdGFuZ2xlKS87XG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHNcXC0sLjpgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoXFwoWyR7Y2F9XStcXCl8XFwoXFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitcXC1dK1xcKFske2NhfV0rXFwpXFwkXFwpKWApO1xuICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgIGxldCBsb29wcyA9IDA7XG4gICAgICAgIFxuICAgICAgICB3aGlsZSAoaSA8IGRyYXcubGVuZ3RoICYmIGxvb3BzIDwgMTAwKSB7IC8vIEluY3JlYXNlIGxvb3AgbGltaXQgb3IgYWRkIGNvbmRpdGlvbiBiYXNlZCBvbiBwYXJzZWQgbGVuZ3RoXG4gICAgICAgICAgICBsb29wcysrO1xuICAgICAgICAgICAgY29uc3QgY29vcmRpbmF0ZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChjb29yZGluYXRlUmVnZXgpO1xuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlTWF0Y2g/LmluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJjb29yZGluYXRlXCIsIHZhbHVlOiBjb29yZGluYXRlTWF0Y2hbMV0gfSk7XG4gICAgICAgICAgICAgICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleCk7XG4gICAgICAgICAgICBpZiAoZm9ybWF0dGluZ01hdGNoPy5pbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGkgKz0gZm9ybWF0dGluZ01hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpO1xuICAgICAgICAgICAgaWYgKG5vZGVNYXRjaD8uaW5kZXggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm5vZGVcIixcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGluZzogbm9kZU1hdGNoWzFdIHx8IFwiXCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBub2RlTWF0Y2hbMl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpICs9IG5vZGVNYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvb3BzID09PSAxMDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBhcnNpbmcgZXhjZWVkZWQgc2FmZSBsb29wIGNvdW50XCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xuICAgIH1cblxuICAgIGlzQ29vcmRpbmF0ZShvYmo6IGFueSk6IG9iaiBpcyBDb29yZGluYXRlIHtcbiAgICAgICAgcmV0dXJuIG9iaiAmJiBvYmogaW5zdGFuY2VvZiBDb29yZGluYXRlO1xuICAgIH1cbiAgICB0b1N0cmluZ0RyYXcoKXtcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKX0gYDtcbiAgICAgICAgdGhpcy5jb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgY29vcmRpbmF0ZSBpbnN0YW5jZW9mIENvb3JkaW5hdGUmJmNvb3JkaW5hdGUubW9kZT09PVwibm9kZS1pbmxpbmVcIjoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW46IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGNvb3JkaW5hdGUudG9TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9YCgke2Nvb3JkaW5hdGUudG9TdHJpbmcoKX0pYFxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcbiAgICB9XG5cbiAgICB0b1N0cmluZ1BpYygpe1xuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3IHBpYyAke3RoaXMuZm9ybWF0dGluZy50b1N0cmluZygpfHwnJ30ge2FuZ2xlID0gJHsodGhpcy5jb29yZGluYXRlc1swXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1sxXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1syXSBhcyBBeGlzKS5uYW1lfX0gYDtcbiAgICAgXG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xuICAgIH1cblxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICBpZiAodGhpcy5tb2RlPT09J2RyYXcnKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmdEcmF3KCk7XG4gICAgICAgIGlmKHRoaXMubW9kZT09PSdkcmF3LXBpYy1hbmcnKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmdQaWMoKVxuICAgICAgICBcbiAgICB9XG59XG5cblxuXG4gIFxuXG5cblxuXG5cblxuZnVuY3Rpb24gZGlzc2VjdFhZYXhpcyhtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSkge1xuICAgIGxldCBYbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiLCBZbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiO1xuXG4gICAgaWYgKG1hdGNoWzFdICYmIG1hdGNoWzJdKSB7XG4gICAgICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcbiAgICAgICAgWW5vZGUgPSBtYXRjaFsyXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xuICAgICAgICBYbm9kZT1Ybm9kZVswXS5zdWJzdHJpbmcoMSxYbm9kZS5sZW5ndGgpXG4gICAgICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogXCJ4eWF4aXNcIixcbiAgICAgICAgWGZvcm1hdHRpbmc6IG1hdGNoWzFdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcbiAgICAgICAgWWZvcm1hdHRpbmc6IG1hdGNoWzJdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcbiAgICAgICAgeERpcmVjdGlvbjogbWF0Y2hbMV0gJiYgLy0+Ly50ZXN0KG1hdGNoWzFdKSA/IFwibGVmdFwiIDogXCJyaWdodFwiLFxuICAgICAgICB5RGlyZWN0aW9uOiBtYXRjaFsyXSAmJiAvLT4vLnRlc3QobWF0Y2hbMl0pID8gXCJkb3duXCIgOiBcInVwXCIsXG4gICAgICAgIFhub2RlOiBYbm9kZSxcbiAgICAgICAgWW5vZGU6IFlub2RlLFxuICAgIH07XG59XG5cblxuXG5cblxuXG5cblxuXG5cblxuXG4vKlxuZnVuY3Rpb24gZ2VuZXJhdGVGb3JtYXR0aW5nKGNvb3JkaW5hdGU6IENvb3JkaW5hdGUpe1xuICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZS5sYWJlbCAhPT0gXCJzdHJpbmdcIil7IHJldHVybiBcIlwiOyB9XG4gICAgY29uc3QgZm9ybWF0dGluZyA9IGNvb3JkaW5hdGUuZm9ybWF0dGluZz8uc3BsaXQoXCIsXCIpIHx8IFtdO1xuICAgIGlmIChmb3JtYXR0aW5nLnNvbWUoKHZhbHVlOiBzdHJpbmcpID0+IC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLnRlc3QodmFsdWUpKSkge1xuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZS5mb3JtYXR0aW5nO1xuICAgIH1cbiAgICBpZihmb3JtYXR0aW5nLmxlbmd0aD4wJiYhZm9ybWF0dGluZ1tmb3JtYXR0aW5nLmxlbmd0aC0xXS5lbmRzV2l0aChcIixcIikpe2Zvcm1hdHRpbmcucHVzaChcIixcIil9XG4gICAgc3dpdGNoKGNvb3JkaW5hdGUucXVhZHJhbnQpe1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIHJpZ2h0LCBcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIGxlZnQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgbGVmdCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA0OiBcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgcmlnaHQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBmb3JtYXR0aW5nLmpvaW4oXCJcIik7XG59XG4qL1xuXG4iXX0=