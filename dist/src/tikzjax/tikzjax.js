import { MarkdownView, WorkspaceWindow } from "obsidian";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { cartesianToPolar, findIntersectionPoint, findSlope, polarToCartesian, toNumber } from "src/mathParser/mathUtilities.js";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBUyxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUl6RCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FB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QUFDLENBQUMsRUFBRSxPQUFPLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxDQUFDO1FBQzVELFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLHdCQUF3QixFQUFFLEVBQUUsQ0FBQztRQUM1RCxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTztRQUM5RCxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUMzRCxLQUFLLEVBQUUsS0FBSztRQUNaLEtBQUssRUFBRSxLQUFLO0tBQ2YsQ0FBQztBQUNOLENBQUM7QUFhRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBd0JFIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBNYXJrZG93blZpZXcsIFNjb3BlLCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcclxuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcInNyYy9tYWluXCI7XHJcbmltcG9ydCB7IG9wdGltaXplIH0gZnJvbSBcIi4vc3Znby5icm93c2VyLmpzXCI7XHJcbi8vIEB0cy1pZ25vcmVcclxuaW1wb3J0IHRpa3pqYXhKcyBmcm9tIFwiaW5saW5lOi4vdGlrempheC5qc1wiO1xyXG5pbXBvcnQgeyBjYXJ0ZXNpYW5Ub1BvbGFyLCBmaW5kSW50ZXJzZWN0aW9uUG9pbnQsIGZpbmRTbG9wZSwgcG9sYXJUb0NhcnRlc2lhbiwgdG9OdW1iZXIgfSBmcm9tIFwic3JjL21hdGhQYXJzZXIvbWF0aFV0aWxpdGllcy5qc1wiO1xyXG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcclxuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4sIEZvcm1hdFRpa3pqYXggfSBmcm9tIFwiLi9pbnRlcnByZXQvdG9rZW5pemVUaWt6amF4LmpzXCI7XHJcbmltcG9ydCB7IG1hcEJyYWNrZXRzIH0gZnJvbSBcInNyYy91dGlscy90b2tlblV0ZW5zaWxzLmpzXCI7XHJcblxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBUaWt6amF4IHtcclxuICAgIGFwcDogQXBwO1xyXG4gICAgcGx1Z2luOiBNYXRoUGx1Z2luO1xyXG4gICAgYWN0aXZlVmlldzogTWFya2Rvd25WaWV3IHwgbnVsbDtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCxwbHVnaW46IE1hdGhQbHVnaW4pIHtcclxuICAgICAgdGhpcy5hcHA9YXBwO1xyXG4gICAgICB0aGlzLmFjdGl2ZVZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xyXG4gICAgICB0aGlzLnBsdWdpbj1wbHVnaW47XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJlYWR5TGF5b3V0KCl7XHJcbiAgICAgIHRoaXMucGx1Z2luLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XHJcbiAgICAgICAgdGhpcy5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKTtcclxuICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcIndpbmRvdy1vcGVuXCIsICh3aW4sIHdpbmRvdykgPT4ge1xyXG4gICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH0pKTtcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtcclxuICAgICAgICBzLmlkID0gXCJ0aWt6amF4XCI7XHJcbiAgICAgICAgcy50eXBlID0gXCJ0ZXh0L2phdmFzY3JpcHRcIjtcclxuICAgICAgICBzLmlubmVyVGV4dCA9IHRpa3pqYXhKcztcclxuICAgICAgICBkb2MuYm9keS5hcHBlbmRDaGlsZChzKTtcclxuICAgICAgICBkb2MuYWRkRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcclxuICAgIH1cclxuICBcclxuICAgIHVubG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG4gICAgICAgIGNvbnN0IHMgPSBkb2MuZ2V0RWxlbWVudEJ5SWQoXCJ0aWt6amF4XCIpO1xyXG4gICAgICAgIHM/LnJlbW92ZSgpO1xyXG5cclxuICAgICAgICBkb2MucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcclxuICAgIH1cclxuICBcclxuICAgIGxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xyXG4gICAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gIFxyXG4gICAgdW5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcclxuICAgICAgICAgICAgdGhpcy51bmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gIFxyXG4gICAgZ2V0QWxsV2luZG93cygpIHtcclxuICAgICAgICBjb25zdCB3aW5kb3dzID0gW107XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gcHVzaCB0aGUgbWFpbiB3aW5kb3cncyByb290IHNwbGl0IHRvIHRoZSBsaXN0XHJcbiAgICAgICAgd2luZG93cy5wdXNoKHRoaXMuYXBwLndvcmtzcGFjZS5yb290U3BsaXQud2luKTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBAdHMtaWdub3JlIGZsb2F0aW5nU3BsaXQgaXMgdW5kb2N1bWVudGVkXHJcbiAgICAgICAgY29uc3QgZmxvYXRpbmdTcGxpdCA9IHRoaXMuYXBwLndvcmtzcGFjZS5mbG9hdGluZ1NwbGl0O1xyXG4gICAgICAgIGZsb2F0aW5nU3BsaXQuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAvLyBpZiB0aGlzIGlzIGEgd2luZG93LCBwdXNoIGl0IHRvIHRoZSBsaXN0IFxyXG4gICAgICAgICAgICBpZiAoY2hpbGQgaW5zdGFuY2VvZiBXb3Jrc3BhY2VXaW5kb3cpIHtcclxuICAgICAgICAgICAgICAgIHdpbmRvd3MucHVzaChjaGlsZC53aW4pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybiB3aW5kb3dzO1xyXG4gICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgcmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCkge1xyXG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihlbC5jcmVhdGVFbChcImRpdlwiKSwge1xyXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxyXG4gICAgICAgICAgICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgdHJ5e1xyXG4gICAgICAgICAgICBjb25zdCBzY3JpcHQgPSBlbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcclxuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHRpa3pqYXg9bmV3IEZvcm1hdFRpa3pqYXgoc291cmNlKTtcclxuICAgICAgICAgICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbmV3IERlYnVnTW9kYWwodGhpcy5hcHAsdGlrempheC5kZWJ1Z0luZm8pLm9wZW4oKTtcclxuICAgICAgICAgICAgc2NyaXB0LnNldFRleHQodGlrempheC5nZXRDb2RlKCkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNhdGNoKGUpe1xyXG4gICAgICAgICAgICAgICAgZWwuaW5uZXJIVE1MID0gXCJcIjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yRGlzcGxheSA9IGVsLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm1hdGgtZXJyb3ItbGluZVwiIH0pO1xyXG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmlubmVyVGV4dCA9IGBFcnJvcjogJHtlLm1lc3NhZ2V9YDtcclxuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5jbGFzc0xpc3QuYWRkKFwiZXJyb3ItdGV4dFwiKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaWtaIFByb2Nlc3NpbmcgRXJyb3I6XCIsIGUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9KTtcclxuICAgIH1cclxuICBcclxuICAgICAgYWRkU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8gPSB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5maWx0ZXIoZWwgPT4gZWwubmFtZSAhPSBcIlRpa3pcIik7XHJcbiAgICAgIH1cclxuXHJcbiAgXHJcbiAgICAgIGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xyXG4gICAgICAgIHN2ZyA9IHN2Zy5yZXBsYWNlQWxsKC8oXCIjMDAwXCJ8XCJibGFja1wiKS9nLCBcIlxcXCJjdXJyZW50Q29sb3JcXFwiXCIpXHJcbiAgICAgICAgICAgICAgICAucmVwbGFjZUFsbCgvKFwiI2ZmZlwifFwid2hpdGVcIikvZywgXCJcXFwidmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KVxcXCJcIik7XHJcbiAgICAgICAgcmV0dXJuIHN2ZztcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgICBvcHRpbWl6ZVNWRyhzdmc6IHN0cmluZykge1xyXG4gICAgICAgICAgcmV0dXJuIG9wdGltaXplKHN2Zywge3BsdWdpbnM6XHJcbiAgICAgICAgICAgICAgW1xyXG4gICAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInByZXNldC1kZWZhdWx0XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBvdmVycmlkZXM6IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW51cElEczogZmFsc2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICBdXHJcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICB9KT8uZGF0YTtcclxuICAgICAgfVxyXG4gIFxyXG4gIFxyXG4gICAgICBwb3N0UHJvY2Vzc1N2ZyA9IChlOiBFdmVudCkgPT4ge1xyXG4gIFxyXG4gICAgICAgICAgY29uc3Qgc3ZnRWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcclxuICAgICAgICAgIGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XHJcbiAgXHJcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSkge1xyXG4gICAgICAgICAgICBzdmcgPSB0aGlzLmNvbG9yU1ZHaW5EYXJrTW9kZShzdmcpO1xyXG4gICAgICAgICAgfVxyXG4gIFxyXG4gICAgICAgICAgc3ZnID0gdGhpcy5vcHRpbWl6ZVNWRyhzdmcpO1xyXG4gIFxyXG4gICAgICAgICAgc3ZnRWwub3V0ZXJIVE1MID0gc3ZnO1xyXG4gICAgfVxyXG59XHJcbmV4cG9ydCBjb25zdCBhcnJUb1JlZ2V4U3RyaW5nID0gKGFycjogQXJyYXk8c3RyaW5nPikgPT4gJygnICsgYXJyLmpvaW4oJ3wnKSArICcpJztcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiByZWdFeHAocGF0dGVybjogc3RyaW5nIHwgUmVnRXhwIHwgQXJyYXk8c3RyaW5nPiwgZmxhZ3M6IHN0cmluZyA9ICcnKTogUmVnRXhwIHtcclxuICAgIGlmIChwYXR0ZXJuIGluc3RhbmNlb2YgUmVnRXhwKSB7XHJcbiAgICAgICAgcGF0dGVybiA9IHBhdHRlcm4uc291cmNlO1xyXG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHBhdHRlcm4pKSB7XHJcbiAgICAgICAgcGF0dGVybiA9IGFyclRvUmVnZXhTdHJpbmcocGF0dGVybik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ3JlYXRlIGFuZCByZXR1cm4gdGhlIFJlZ0V4cFxyXG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoU3RyaW5nLnJhd2Ake3BhdHRlcm59YCwgZmxhZ3MpO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0UmVnZXgoKXtcclxuICAgIGNvbnN0IGJhc2ljID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOl1gO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBiYXNpYzogYmFzaWMsXHJcbiAgICAgICAgbWVyZ2U6IFN0cmluZy5yYXdgLVxcfHxcXHwtfCFbXFxkLl0rIXxcXCt8LWAsXHJcbiAgICAgICAgLy9jb29yZGluYXRlOiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKCR7YmFzaWN9K3wxKWApLFxyXG4gICAgICAgIGNvb3JkaW5hdGVOYW1lOiBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWAsXHJcbiAgICAgICAgdGV4dDogU3RyaW5nLnJhd2BbXFx3XFxzLSwuOidcXCRcXCghXFwpXytcXFxce309XWAsXHJcbiAgICAgICAgZm9ybWF0dGluZzogU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7Jip7fSgpJS08Pl1gXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5pbnRlcmZhY2UgdG9rZW4gIHtcclxuICAgIFg/OiBudW1iZXI7XHJcbiAgICBZPzogbnVtYmVyO1xyXG4gICAgdHlwZT86IHN0cmluZztcclxuICAgIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nO1xyXG4gICAgY29vcmRpbmF0ZXM/OiBhbnk7XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlczogQXJyYXk8QXhpcyB8IHN0cmluZz4sIGluZGV4OiBudW1iZXIpOiB7IGJlZm9yZTogbnVtYmVyLCBhZnRlcjogbnVtYmVyIH0ge1xyXG4gICAgXHJcbiAgICBsZXQgYmVmb3JlSW5kZXggPSBheGVzLnNsaWNlKDAsIGluZGV4KS5maW5kTGFzdEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgIGxldCBhZnRlckluZGV4ID0gYXhlcy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XHJcblxyXG4gICAgLy8gQWRqdXN0IGBhZnRlckluZGV4YCBzaW5jZSB3ZSBzbGljZWQgZnJvbSBgaW5kZXggKyAxYFxyXG4gICAgaWYgKGFmdGVySW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgYWZ0ZXJJbmRleCArPSBpbmRleCArIDE7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gV3JhcCBhcm91bmQgaWYgbm90IGZvdW5kXHJcbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgYmVmb3JlSW5kZXggPSBheGVzLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChhZnRlckluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIGFmdGVySW5kZXggPSBheGVzLmZpbmRJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICB9XHJcbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xIHx8IGFmdGVySW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZmluZCB2YWxpZCBBeGlzIG9iamVjdHMuXCIpO1xyXG4gICAgfVxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSBhZnRlckluZGV4KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUHJhaXNlZCBheGlzIGFzIHNhbWUgdG9rZW5cIik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4geyBiZWZvcmU6IGJlZm9yZUluZGV4LCBhZnRlcjogYWZ0ZXJJbmRleCB9O1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIEF4aXMge1xyXG4gICAgY2FydGVzaWFuWDogbnVtYmVyO1xyXG4gICAgY2FydGVzaWFuWTogbnVtYmVyO1xyXG4gICAgcG9sYXJBbmdsZTogbnVtYmVyO1xyXG4gICAgcG9sYXJMZW5ndGg6IG51bWJlcjtcclxuICAgIG5hbWU/OiBzdHJpbmc7XHJcbiAgICBxdWFkcmFudD86IG51bWJlcjtcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihjYXJ0ZXNpYW5YPzogbnVtYmVyLCBjYXJ0ZXNpYW5ZPzogbnVtYmVyLCBwb2xhckxlbmd0aD86IG51bWJlciwgcG9sYXJBbmdsZT86IG51bWJlcixuYW1lPzogc3RyaW5nKSB7XHJcbiAgICAgICAgaWYgKGNhcnRlc2lhblggIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5YID0gY2FydGVzaWFuWDtcclxuICAgICAgICBpZiAoY2FydGVzaWFuWSAhPT0gdW5kZWZpbmVkKSB0aGlzLmNhcnRlc2lhblkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIGlmIChwb2xhckxlbmd0aCAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyTGVuZ3RoID0gcG9sYXJMZW5ndGg7XHJcbiAgICAgICAgaWYgKHBvbGFyQW5nbGUgIT09IHVuZGVmaW5lZCkgdGhpcy5wb2xhckFuZ2xlID0gcG9sYXJBbmdsZTtcclxuICAgICAgICB0aGlzLm5hbWU9bmFtZVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBjbG9uZSgpOiBBeGlzIHtcclxuICAgICAgICByZXR1cm4gbmV3IEF4aXModGhpcy5jYXJ0ZXNpYW5YLCB0aGlzLmNhcnRlc2lhblksdGhpcy5wb2xhckxlbmd0aCx0aGlzLnBvbGFyQW5nbGUsdGhpcy5uYW1lKTtcclxuICAgIH1cclxuICAgIHBhcnNlSW5wdXQoaW5wdXQ6IGFueSkge1xyXG4gICAgICAgIGNvbnN0IGF4ZXM9W11cclxuICAgICAgICBjb25zdCBicmFja2V0TWFwID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nLCBpbnB1dCk7XHJcbiAgICAgICAgYXhlcy5wdXNoKHRoaXMucHJvY2Vzc0luZGl2aWR1YWwoaW5wdXQpKTtcclxuICAgICAgICAgICAgaWYoYXhlcy5sZW5ndGg9PT0xKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGF4ZXNbMF1cclxuICAgIH1cclxuICAgIFxyXG4gICAgcHJvY2Vzc0luZGl2aWR1YWwoaW5wdXQ6IGFueSkge1xyXG4gICAgICAgIGxldCBheGlzID0gbmV3IEF4aXMoKTtcclxuICAgICAgICBjb25zdCBpc0NhcnRlc2lhbiA9IGlucHV0LnNvbWUoKHRva2VuOiBhbnkpID0+IHRva2VuLm5hbWUgPT09ICdDb21tYScpO1xyXG4gICAgICAgIGlucHV0ID0gaW5wdXQuZmlsdGVyKCh0b2tlbjogYW55KSA9PiB0b2tlbi50eXBlICE9PSAnU3ludGF4Jyk7XHJcbiAgICAgICAgaWYgKGlzQ2FydGVzaWFuICYmIGlucHV0Lmxlbmd0aCA9PT0gMikge1xyXG4gICAgICAgICAgICBheGlzLmNhcnRlc2lhblggPSBpbnB1dFswXS52YWx1ZTtcclxuICAgICAgICAgICAgYXhpcy5jYXJ0ZXNpYW5ZID0gaW5wdXRbMV0udmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBheGlzO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgdW5pdmVyc2FsKGNvb3JkaW5hdGU6IHN0cmluZywgdG9rZW5zPzogRm9ybWF0VGlrempheCxhbmNob3JBcnI/OiBhbnksYW5jaG9yPzogc3RyaW5nKTogQXhpcyB7XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlcz10aGlzLmdldENvb3JkaW5hdGVNYXRjaGVzKGNvb3JkaW5hdGUpO1xyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVBcnI6IEFycmF5PEF4aXN8c3RyaW5nPiA9IFtdO1xyXG4gICAgICAgIG1hdGNoZXMuZm9yRWFjaCgobWF0Y2g6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIG1hdGNoPW1hdGNoLmZ1bGxNYXRjaDtcclxuICAgICAgICAgICAgbGV0IGF4aXM6IEF4aXN8dW5kZWZpbmVkO1xyXG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgLywvLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkQ2FydGVzaWFuKG1hdGNoKTtcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICBjYXNlIC86Ly50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBheGlzID0gbmV3IEF4aXMoKTtcclxuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZFBvbGFyKG1hdGNoKTtcclxuICAgICAgICAgICAgICAgICAgICBheGlzLnBvbGFyVG9DYXJ0ZXNpYW4oKVxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgLyFbXFxkLl0rIS8udGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgKC9bXFxkXFx3XSsvKS50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zKXt9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vYXhpcyA9IHRva2Vucy5maW5kT3JpZ2luYWxWYWx1ZShtYXRjaCk/LmF4aXM7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSB0aHJvdyBuZXcgRXJyb3IoYFRyaWVkIHRvIGZpbmQgb3JpZ2luYWwgY29vcmRpbmF0ZSB2YWx1ZSB3aGlsZSBub3QgYmVpbmcgcHJvdmlkZWQgd2l0aCB0b2tlbnNgKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWF4aXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIHRoZSBjb29yZGluYXRlICR7bWF0Y2h9IGZyb20gJHtjb29yZGluYXRlfWApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm5cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5uYW1lPW1hdGNoXHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5tZXJnZUF4aXMoY29vcmRpbmF0ZUFycilcclxuXHJcbiAgICAgICAgaWYoYW5jaG9yQXJyJiZhbmNob3ImJmFuY2hvci5tYXRjaCgvKC0tXFwrfC0tXFwrXFwrKS8pKXtcclxuICAgICAgICAgICAgbGV0IGE6IEF4aXNcclxuICAgICAgICAgICAgaWYgKGFuY2hvci5tYXRjaCgvKC0tXFwrKS8pKXtcclxuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmQoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcclxuICAgICAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kTGFzdCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMuY29tcGxleENhcnRlc2lhbkFkZChhLFwiYWRkaXRpb25cIilcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgbWVyZ2VBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+KSB7XHJcbiAgICAgICAgaWYgKCFheGVzLnNvbWUoKGF4aXM6IGFueSkgPT4gdHlwZW9mIGF4aXMgPT09IFwic3RyaW5nXCIpKSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgYXhpcyBvZiBheGVzKSB7XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiBheGlzID09PSBcInN0cmluZ1wiKXtjb250aW51ZTt9XHJcbiAgICAgICAgICAgIGF4aXMubmFtZT11bmRlZmluZWRcclxuICAgICAgICB9XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBheGVzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBheGVzW2ldO1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnQgIT09IFwic3RyaW5nXCIpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICBjb25zdCBzaWRlcyA9IGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlcywgaSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUF4aXMgPSBheGVzW3NpZGVzLmJlZm9yZV0gYXMgQXhpcztcclxuICAgICAgICAgICAgY29uc3QgYWZ0ZXJBeGlzID0gYXhlc1tzaWRlcy5hZnRlcl0gYXMgQXhpcztcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGxldCAgbWF0Y2ggPSBjdXJyZW50Lm1hdGNoKC9eXFwrJC8pO1xyXG4gICAgICAgICAgICBsZXQgbW9kZSxtb2RpZmllcnM7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJhZGRpdGlvblwiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXi1cXHwkLylcclxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcclxuICAgICAgICAgICAgICAgIG1vZGUgPSBcInJpZ2h0UHJvamVjdGlvblwiXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXlxcIShbXFxkLl0rKVxcISQvKVxyXG4gICAgICAgICAgICBpZighbW9kZSYmbWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiaW50ZXJuYWxQb2ludFwiXHJcbiAgICAgICAgICAgICAgICBtb2RpZmllcnM9dG9OdW1iZXIobWF0Y2hbMV0pXHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmKG1vZGUpe1xyXG4gICAgICAgICAgICAgICAgYXhlcy5zcGxpY2Uoc2lkZXMuYmVmb3JlLCBzaWRlcy5hZnRlciAtIHNpZGVzLmJlZm9yZSArIDEsIGJlZm9yZUF4aXMuY29tcGxleENhcnRlc2lhbkFkZChhZnRlckF4aXMsbW9kZSxtb2RpZmllcnMpKTtcclxuICAgICAgICAgICAgICAgIGkgPSBzaWRlcy5iZWZvcmU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYXhlcy5sZW5ndGggPT09IDEgJiYgYXhlc1swXSBpbnN0YW5jZW9mIEF4aXMpIHtcclxuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCAoYXhlc1swXSBhcyBBeGlzKS5jbG9uZSgpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29tcGxleENhcnRlc2lhbkFkZChheGlzOiBBeGlzLG1vZGU6IHN0cmluZyxtb2RpZmllcj86IGFueSl7XHJcbiAgICAgICAgc3dpdGNoIChtb2RlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJhZGRpdGlvblwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YKz1heGlzLmNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblkrPWF4aXMuY2FydGVzaWFuWTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwic3VidHJhY3Rpb25cIjpcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwicmlnaHRQcm9qZWN0aW9uXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9YXhpcy5jYXJ0ZXNpYW5YXHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImludGVybmFsUG9pbnRcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD0odGhpcy5jYXJ0ZXNpYW5YK2F4aXMuY2FydGVzaWFuWCkqbW9kaWZpZXI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblk9KHRoaXMuY2FydGVzaWFuWStheGlzLmNhcnRlc2lhblkpKm1vZGlmaWVyO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuVG9Qb2xhcigpXHJcbiAgICAgICAgcmV0dXJuIHRoaXNcclxuICAgIH07XHJcblxyXG5cclxuICAgIGdldENvb3JkaW5hdGVNYXRjaGVzKGNvb3JkaW5hdGU6IHN0cmluZyl7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJuID0gZ2V0UmVnZXgoKTtcclxuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW1xyXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4uYmFzaWN9KylgLCBcImdcIiksXHJcbiAgICAgICAgICAgIHJlZ0V4cChTdHJpbmcucmF3YCgke3JlZ2V4UGF0dGVybi5tZXJnZX0rKWAsIFwiZ1wiKVxyXG4gICAgICAgIF07XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RlcCAxOiBFeHRyYWN0IG1hdGNoZXMgZm9yIGVhY2ggcGF0dGVybiBzZXBhcmF0ZWx5XHJcbiAgICAgICAgY29uc3QgYmFzaWNNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMF0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XHJcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0ucmVwbGFjZSgvLSQvZywgXCJcIiksIC8vIFJlbW92ZSB0cmFpbGluZyBoeXBoZW4gb25seVxyXG4gICAgICAgICAgICBpbmRleDogbWF0Y2guaW5kZXggPz8gMCxcclxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGgtKG1hdGNoWzBdLm1hdGNoKC8tJC8pPzE6MClcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgbWVyZ2VNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMV0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XHJcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0sXHJcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxyXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxyXG4gICAgICAgIH0pKTtcclxuICAgICAgICBjb25zdCBtYXRjaGVzOiBBcnJheTx7IGZ1bGxNYXRjaDogc3RyaW5nLCBpbmRleDogbnVtYmVyLCBsZW5ndGg6IG51bWJlciB9PiA9IFtdO1xyXG5cclxuICAgICAgICBmdW5jdGlvbiBpc092ZXJsYXBwaW5nKG1hdGNoMTogeyBpbmRleDogbnVtYmVyOyBsZW5ndGg6IG51bWJlciB9LCBtYXRjaDI6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSkge1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2gxLmluZGV4IDwgbWF0Y2gyLmluZGV4ICsgbWF0Y2gyLmxlbmd0aCAmJiBtYXRjaDIuaW5kZXggPCBtYXRjaDEuaW5kZXggKyBtYXRjaDEubGVuZ3RoO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgWy4uLmJhc2ljTWF0Y2hlcywgLi4ubWVyZ2VNYXRjaGVzXS5mb3JFYWNoKG1hdGNoID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgb3ZlcmxhcHBpbmdJbmRleCA9IG1hdGNoZXMuZmluZEluZGV4KGV4aXN0aW5nTWF0Y2ggPT4gaXNPdmVybGFwcGluZyhleGlzdGluZ01hdGNoLCBtYXRjaCkpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG92ZXJsYXBwaW5nSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ01hdGNoID0gbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIGN1cnJlbnQgbWF0Y2ggY292ZXJzIGEgbGFyZ2VyIHJhbmdlLCByZXBsYWNlIHRoZSBleGlzdGluZyBvbmVcclxuICAgICAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPiBleGlzdGluZ01hdGNoLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXNbb3ZlcmxhcHBpbmdJbmRleF0gPSBtYXRjaDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIG1hdGNoZXMucHVzaChtYXRjaCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTdGVwIDM6IFNvcnQgdGhlIGZpbmFsIG1hdGNoZXMgYnkgaW5kZXhcclxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBTdGVwIDQ6IFZhbGlkYXRlIHRoZSByZXN1bHRcclxuICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29vcmRpbmF0ZSBpcyBub3QgdmFsaWQ7IGV4cGVjdGVkIGEgdmFsaWQgY29vcmRpbmF0ZS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBtYXRjaGVzO1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHByb2plY3Rpb24oYXhpczE6IEF4aXN8dW5kZWZpbmVkLGF4aXMyOiBBeGlzfHVuZGVmaW5lZCk6YW55e1xyXG4gICAgICAgIGlmICghYXhpczF8fCFheGlzMil7dGhyb3cgbmV3IEVycm9yKFwiYXhpcydzIHdlcmUgdW5kZWZpbmVkIGF0IHByb2plY3Rpb25cIik7fVxyXG4gICAgICAgIHJldHVybiBbe1g6IGF4aXMxLmNhcnRlc2lhblgsWTogYXhpczIuY2FydGVzaWFuWX0se1g6IGF4aXMyLmNhcnRlc2lhblgsWTogYXhpczEuY2FydGVzaWFuWX1dXHJcbiAgICB9XHJcblxyXG4gICAgY29tYmluZShjb29yZGluYXRlQXJyOiBhbnkpe1xyXG4gICAgICAgIGxldCB4PTAseT0wO1xyXG4gICAgICAgIGNvb3JkaW5hdGVBcnIuZm9yRWFjaCgoY29vcmRpbmF0ZTogQXhpcyk9PntcclxuICAgICAgICAgICAgeCs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICB5Kz1jb29yZGluYXRlLmNhcnRlc2lhblk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICBcclxuICAgICAgICB0aGlzLmNhcnRlc2lhblg9eDt0aGlzLmNhcnRlc2lhblk9eTtcclxuICAgIH1cclxuICAgIGFkZENhcnRlc2lhbih4OiBzdHJpbmcgfCBudW1iZXIsIHk/OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoIXkgJiYgdHlwZW9mIHggPT09IFwic3RyaW5nXCIpIHtcclxuICAgICAgICAgICAgW3gsIHldID0geC5zcGxpdChcIixcIikubWFwKE51bWJlcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh4ID09PSB1bmRlZmluZWQgfHwgeSA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgQ2FydGVzaWFuIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YID0geCBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZID0geSBhcyBudW1iZXI7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHBvbGFyVG9DYXJ0ZXNpYW4oKXtcclxuICAgICAgICBjb25zdCB0ZW1wPXBvbGFyVG9DYXJ0ZXNpYW4odGhpcy5wb2xhckFuZ2xlLCB0aGlzLnBvbGFyTGVuZ3RoKVxyXG4gICAgICAgIHRoaXMuYWRkQ2FydGVzaWFuKHRlbXAuWCx0ZW1wLlkpXHJcbiAgICB9XHJcblxyXG4gICAgY2FydGVzaWFuVG9Qb2xhcigpe1xyXG4gICAgICAgIGNvbnN0IHRlbXA9Y2FydGVzaWFuVG9Qb2xhcih0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSlcclxuICAgICAgICB0aGlzLmFkZFBvbGFyKHRlbXAuYW5nbGUsdGVtcC5sZW5ndGgpXHJcbiAgICB9XHJcblxyXG4gICAgYWRkUG9sYXIoYW5nbGU6IHN0cmluZyB8IG51bWJlciwgbGVuZ3RoPzogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCFsZW5ndGggJiYgdHlwZW9mIGFuZ2xlID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgICAgIFthbmdsZSwgbGVuZ3RoXSA9IGFuZ2xlLnNwbGl0KFwiOlwiKS5tYXAoTnVtYmVyKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGFuZ2xlID09PSB1bmRlZmluZWQgfHwgbGVuZ3RoID09PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBwb2xhciBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucG9sYXJBbmdsZSA9IGFuZ2xlIGFzIG51bWJlcjtcclxuICAgICAgICB0aGlzLnBvbGFyTGVuZ3RoID0gbGVuZ3RoIGFzIG51bWJlcjtcclxuICAgIH1cclxuICAgIGFkZFF1YWRyYW50KG1pZFBvaW50OiBBeGlzKXtcclxuICAgICAgICBjb25zdCB4PW1pZFBvaW50LmNhcnRlc2lhblg+dGhpcy5jYXJ0ZXNpYW5YO1xyXG4gICAgICAgIGNvbnN0IHk9bWlkUG9pbnQuY2FydGVzaWFuWT50aGlzLmNhcnRlc2lhblk7XHJcbiAgICAgICAgdGhpcy5xdWFkcmFudD14P3k/MTo0Onk/MjozO1xyXG4gICAgfVxyXG4gICAgdG9TdHJpbmdTVkcoKXtcclxuICAgICAgICByZXR1cm4gdGhpcy5jYXJ0ZXNpYW5YK1wiIFwiK3RoaXMuY2FydGVzaWFuWTtcclxuICAgIH1cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FydGVzaWFuWCtcIixcIit0aGlzLmNhcnRlc2lhblk7XHJcbiAgICB9XHJcblxyXG4gICAgaW50ZXJzZWN0aW9uKGNvb3JkOiBzdHJpbmcsIGZpbmRPcmlnaW5hbFZhbHVlOiAoY29vcmQ6IHN0cmluZykgPT4gQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZCk6IHtYOm51bWJlcixZOm51bWJlcn0ge1xyXG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcclxuICAgICAgICAgICAgLnJlcGxhY2UoL2ludGVyc2VjdGlvblxccz9vZlxccz8vZywgXCJcIilcclxuICAgICAgICAgICAgLnJlcGxhY2UoLyhcXHMqYW5kXFxzP3wtLSkvZywgXCIgXCIpXHJcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcclxuICAgICAgICAgICAgLm1hcChmaW5kT3JpZ2luYWxWYWx1ZSlcclxuICAgICAgICAgICAgLmZpbHRlcigodG9rZW4pOiB0b2tlbiBpcyBDb29yZGluYXRlID0+IHRva2VuICE9PSB1bmRlZmluZWQpO1xyXG5cclxuICAgICAgICBpZiAob3JpZ2luYWxDb29yZHMubGVuZ3RoIDwgNCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnRlcnNlY3Rpb24gaGFkIHVuZGVmaW5lZCBjb29yZGluYXRlcyBvciBpbnN1ZmZpY2llbnQgZGF0YS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IHNsb3BlcyA9IFtcclxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMV0uYXhpcyBhcyBBeGlzKSxcclxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbM10uYXhpcyBhcyBBeGlzKSxcclxuICAgICAgICBdO1xyXG5cclxuICAgICAgICByZXR1cm4gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMl0uYXhpcyBhcyBBeGlzLCBzbG9wZXNbMF0sIHNsb3Blc1sxXSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB0b1BvaW50KHZhbHVlOm51bWJlcixmb3JtYXQ6IHN0cmluZyl7XHJcbiAgICBzd2l0Y2ggKGZvcm1hdCkge1xyXG4gICAgICAgIGNhc2UgXCJQb2ludFwiOlxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgY2FzZSBcImNtXCI6IFxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqMjguMzQ2O1xyXG4gICAgICAgIGNhc2UgXCJtbVwiOlxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqIDIuODM0NjtcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ1bmtub24gZm9ybWF0XCIpO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gbWF0Y2hLZXlXaXRoVmFsdWUoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgY29uc3QgdmFsdWVNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgICAgICAgXCJhbmNob3JcIjogXCJhbmNob3I9XCIsXHJcbiAgICAgICAgXCJyb3RhdGVcIjogXCJyb3RhdGU9XCIsXHJcbiAgICAgICAgXCJsaW5lV2lkdGhcIjogXCJsaW5lIHdpZHRoPVwiLFxyXG4gICAgICAgIFwiZmlsbFwiOiBcImZpbGw9XCIsXHJcbiAgICAgICAgXCJmaWxsT3BhY2l0eVwiOiBcImZpbGwgb3BhY2l0eT1cIixcclxuICAgICAgICBcInRleHRPcGFjaXR5XCI6IFwidGV4dCBvcGFjaXR5PVwiLFxyXG4gICAgICAgIFwidGV4dENvbG9yXCI6IFwidGV4dCBjb2xvcj1cIixcclxuICAgICAgICBcImRyYXdcIjogXCJkcmF3PVwiLFxyXG4gICAgICAgIFwidGV4dFwiOiBcInRleHQ9XCIsXHJcbiAgICAgICAgXCJwb3NcIjogXCJwb3M9XCIsXHJcbiAgICAgICAgXCJzY2FsZVwiOiBcInNjYWxlPVwiLFxyXG4gICAgICAgIFwiZGVjb3JhdGVcIjogXCJkZWNvcmF0ZVwiLFxyXG4gICAgICAgIFwic2xvcGVkXCI6IFwic2xvcGVkXCIsXHJcbiAgICAgICAgXCJkZWNvcmF0aW9uXCI6IFwiZGVjb3JhdGlvbj1cIixcclxuICAgICAgICBcImJyYWNlXCI6IFwiYnJhY2VcIixcclxuICAgICAgICBcImFtcGxpdHVkZVwiOiBcImFtcGxpdHVkZT1cIixcclxuICAgICAgICBcImFuZ2xlUmFkaXVzXCI6IFwiYW5nbGUgcmFkaXVzPVwiLFxyXG4gICAgICAgIFwiYW5nbGVFY2NlbnRyaWNpdHlcIjogXCJhbmdsZSBlY2NlbnRyaWNpdHk9XCIsXHJcbiAgICAgICAgXCJmb250XCI6IFwiZm9udD1cIixcclxuICAgICAgICBcInBpY1RleHRcIjogXCJwaWMgdGV4dD1cIixcclxuICAgICAgICBcImxhYmVsXCI6IFwibGFiZWw9XCIsXHJcbiAgICAgICAgXCJmcmVlRm9ybVRleHRcIjogJzonLFxyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gdmFsdWVNYXBba2V5XSB8fCAnJztcclxufVxyXG5cclxuXHJcbnR5cGUgRGVjb3JhdGlvbiA9IHtcclxuICAgIGJyYWNlPzogYm9vbGVhbjtcclxuICAgIGNvaWw6IGJvb2xlYW47XHJcbiAgICBhbXBsaXR1ZGU/OiBudW1iZXI7XHJcbiAgICBhc3BlY3Q/OiBudW1iZXI7XHJcbiAgICBzZWdtZW50TGVuZ3RoPzogbnVtYmVyO1xyXG4gICAgZGVjb3JhdGlvbj86IERlY29yYXRpb247IFxyXG59O1xyXG5cclxudHlwZSBMYWJlbCA9IHtcclxuICAgIGZyZWVGb3JtVGV4dD86IHN0cmluZztcclxuICAgIGNvbG9yPzogc3RyaW5nO1xyXG4gICAgb3BhY2l0eT86IG51bWJlclxyXG59O1xyXG5jb25zdCBkZWZhdWx0VmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge1xyXG4gICAgZnJlZUZvcm1UZXh0OiBcIlwiLFxyXG4gICAgY29sb3I6IFwiXCIsXHJcbiAgICBvcGFjaXR5OiAxLFxyXG59O1xyXG5cclxuZnVuY3Rpb24gbGluZVdpZHRoQ29udmVydGVyKHdpZHRoOiBzdHJpbmcpe1xyXG4gICAgcmV0dXJuIE51bWJlcih3aWR0aC5yZXBsYWNlKC91bHRyYVxccyp0aGluLyxcIjAuMVwiKVxyXG4gICAgLnJlcGxhY2UoL3ZlcnlcXHMqdGhpbi8sXCIwLjJcIilcclxuICAgIC5yZXBsYWNlKC90aGluLyxcIjAuNFwiKVxyXG4gICAgLnJlcGxhY2UoL3NlbWl0aGljay8sXCIwLjZcIilcclxuICAgIC5yZXBsYWNlKC90aGljay8sXCIwLjhcIilcclxuICAgIC5yZXBsYWNlKC92ZXJ5XFxzKnRoaWNrLyxcIjEuMlwiKVxyXG4gICAgLnJlcGxhY2UoL3VsdHJhXFxzKnRoaWNrLyxcIjEuNlwiKSlcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XHJcbiAgICAvLyBpbXBvcnRlbnQgbmVlZHMgdG8gYmUgZm9yc3RcclxuICAgIHBhdGg/OiBzdHJpbmc7XHJcblxyXG4gICAgc2NhbGU6IG51bWJlcjtcclxuICAgIHJvdGF0ZT86IG51bWJlcjtcclxuICAgIGxpbmVXaWR0aD86IG51bWJlcj0wLjQ7XHJcbiAgICB0ZXh0T3BhY2l0eTogbnVtYmVyO1xyXG4gICAgb3BhY2l0eT86IG51bWJlcjtcclxuICAgIGZpbGxPcGFjaXR5PzogbnVtYmVyO1xyXG4gICAgcG9zPzogbnVtYmVyO1xyXG4gICAgYW5nbGVFY2NlbnRyaWNpdHk/OiBudW1iZXI7XHJcbiAgICBhbmdsZVJhZGl1cz86IG51bWJlcjtcclxuICAgIGxldmVsRGlzdGFuY2U/OiBudW1iZXI7XHJcblxyXG4gICAgbW9kZTogc3RyaW5nO1xyXG4gICAgYW5jaG9yPzogc3RyaW5nO1xyXG4gICAgY29sb3I/OiBzdHJpbmc7XHJcbiAgICB0ZXh0Q29sb3I/OiBzdHJpbmc7XHJcbiAgICBmaWxsPzogc3RyaW5nO1xyXG4gICAgYXJyb3c/OiBzdHJpbmc7XHJcbiAgICBkcmF3Pzogc3RyaW5nO1xyXG4gICAgdGV4dD86IHN0cmluZztcclxuICAgIHRpa3pzZXQ/OiBzdHJpbmc7XHJcbiAgICBwb3NpdGlvbj86IHN0cmluZztcclxuICAgIGxpbmVTdHlsZT86IHN0cmluZztcclxuICAgIGZvbnQ/OiBzdHJpbmc7XHJcbiAgICBwaWNUZXh0Pzogc3RyaW5nO1xyXG4gICAgXHJcbiAgICBzbG9wZWQ/OiBib29sZWFuO1xyXG4gICAgZGVjb3JhdGU/OiBib29sZWFuO1xyXG4gICAgbGFiZWw/OiBMYWJlbDtcclxuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGZvcm1hdHRpbmc6IGFueVtdLG1vZGU/OiBzdHJpbmcpe1xyXG4gICAgICAgIGlmKG1vZGUpdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgdGhpcy5hc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmd8fFtdKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgYXNzaWduRm9ybWF0dGluZyhcclxuICAgICAgICBmb3JtYXR0aW5nQXJyOiBBcnJheTx7IGtleTogc3RyaW5nOyB2YWx1ZTogYW55IH0+LFxyXG4gICAgICAgIHRhcmdldFNjb3BlOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0gdGhpc1xyXG4gICAgKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB7IGtleSwgdmFsdWUgfSBvZiBmb3JtYXR0aW5nQXJyKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBjb25zdCBub3JtYWxpemVkS2V5ID0gT2JqZWN0LmtleXModGFyZ2V0U2NvcGUpLmZpbmQoXHJcbiAgICAgICAgICAgICAgICAocHJvcCkgPT4gcHJvcC50b0xvd2VyQ2FzZSgpID09PSBrZXkudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgICAgICApIHx8IGtleTtcclxuICAgIFxyXG4gICAgICAgICAgICBpZiAodGhpcy5pc05lc3RlZCh2YWx1ZSkpIHtcclxuICAgICAgICAgICAgICAgIHRhcmdldFNjb3BlW25vcm1hbGl6ZWRLZXldID0gdGFyZ2V0U2NvcGVbbm9ybWFsaXplZEtleV0gfHwgdGhpcy5jcmVhdGVOZXN0ZWQobm9ybWFsaXplZEtleSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFzc2lnbkZvcm1hdHRpbmcodmFsdWUsdGFyZ2V0U2NvcGVbbm9ybWFsaXplZEtleV0pXHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICAgICAgdGFyZ2V0U2NvcGVbbm9ybWFsaXplZEtleV09dmFsdWVcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgc2V0UHJvcGVydHkoc2NvcGU6IGFueSwga2V5OiBhbnksIHZhbHVlOiBhbnkpOiB2b2lkIHtcclxuICAgICAgICBpZiAodHlwZW9mIHNjb3BlID09PSBcIm9iamVjdFwiICYmIHNjb3BlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHNjb3BlW2tleV0gPSB2YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiSW52YWxpZCBzY29wZSBwcm92aWRlZC4gRXhwZWN0ZWQgYW4gb2JqZWN0IGJ1dCByZWNlaXZlZDpcIiwgc2NvcGUpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgY3JlYXRlTmVzdGVkKGtleTogc3RyaW5nKSB7XHJcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcclxuICAgICAgICAgICAgY2FzZSAnbGFiZWwnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgY29sb3I6IHVuZGVmaW5lZCwgb3BhY2l0eTogdW5kZWZpbmVkLGZyZWVGb3JtVGV4dDogdW5kZWZpbmVkIH07XHJcbiAgICAgICAgICAgIGNhc2UgJ2RlY29yYXRpb24nOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgICAgICBicmFjZTogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIGNvaWw6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgICAgIGFtcGxpdHVkZTogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIGFzcGVjdDogdW5kZWZpbmVkLFxyXG4gICAgICAgICAgICAgICAgICAgIHNlZ21lbnRMZW5ndGg6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgICAgICAgICBkZWNvcmF0aW9uOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHt9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgaXNOZXN0ZWQodmFsdWU6IGFueSl7XHJcbiAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLnNvbWUoKGl0ZW06IGFueSkgPT4gaXRlbS5rZXkgJiYgaXRlbS52YWx1ZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgc3BsaXQ8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxyXG4gICAgICAgIGtleTogSyxcclxuICAgICAgICBmb3JtYXR0aW5nOiBhbnksXHJcbiAgICAgICAgbmVzdGVkS2V5PzogTktcclxuICAgICk6IHZvaWQge1xyXG4gICAgICAgIGxldCB2YWx1ZTtcclxuICAgICAgICBpZih0eXBlb2YgZm9ybWF0dGluZyE9PVwiYm9vbGVhblwiKXtcclxuICAgICAgICAgICAgbGV0IG1hdGNoID0gZm9ybWF0dGluZy5zcGxpdChcIj1cIik7XHJcbiAgICBcclxuICAgICAgICAgICAgLy8gRW5zdXJlIHRoZSBmb3JtYXR0aW5nIHN0cmluZyBpcyB2YWxpZFxyXG4gICAgICAgICAgICBpZiAobWF0Y2gubGVuZ3RoIDwgMiB8fCAhbWF0Y2hbMV0pIHJldHVybjtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIFRyaW0gYW55IHBvdGVudGlhbCB3aGl0ZXNwYWNlIGFyb3VuZCB0aGUgdmFsdWVcclxuICAgICAgICAgICAgY29uc3QgcmF3VmFsdWUgPSBtYXRjaFsxXS50cmltKCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHZhbHVlIGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nXHJcbiAgICAgICAgICAgIHZhbHVlID0gIWlzTmFOKHBhcnNlRmxvYXQocmF3VmFsdWUpKSAmJiBpc0Zpbml0ZSgrcmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXHJcbiAgICAgICAgICAgICAgICA6IHJhd1ZhbHVlLnJlcGxhY2UoLy1cXHwvLCdub3J0aCcpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB2YWx1ZT1mb3JtYXR0aW5nXHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vdGhpcy5zZXRQcm9wZXJ0eShrZXksIHZhbHVlLCBuZXN0ZWRLZXkpO1xyXG4gICAgfVxyXG4gICAgXHJcblxyXG4gICAgXHJcblxyXG5cclxuICAgIGFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nOiBhbnkpe1xyXG4gICAgICAgIGNvbnN0IGE9c3BsaXRGb3JtYXR0aW5nLmZpbmQoKGl0ZW06IHN0cmluZyk9PiBpdGVtLm1hdGNoKC9tYXNzfGFuZ3xoZWxwbGluZXMvKSlcclxuICAgICAgICBpZiAoIWEmJiF0aGlzLnRpa3pzZXQpcmV0dXJuO1xyXG4gICAgICAgIGlmKGEpIHRoaXMudGlrenNldD1hO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMudGlrenNldCkge1xyXG4gICAgICAgICAgICBjYXNlIFwibWFzc1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPVwieWVsbG93ITYwXCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGg9XCJkcmF3XCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9Jy0+J1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJoZWxwbGluZXNcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMubGluZVdpZHRoPTAuNDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhdz0nZ3JheSc7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcImFuZ1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoPSdkcmF3J1xyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPSdibGFjayE1MCc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGxPcGFjaXR5PTAuNTtcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhdz0nb3JhbmdlJ1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hcnJvdz0nPC0+J1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZUVjY2VudHJpY2l0eT0xLjY7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlUmFkaXVzPXRvUG9pbnQoMC41LFwiY21cIik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9J29yYW5nZSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmZvbnQ9J1xcXFxsYXJnZSc7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHRPcGFjaXR5PTAuOTtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFkZFNwbG9wQW5kUG9zaXRpb24oYXJyOiBhbnksaW5kZXg6IG51bWJlcil7XHJcbiAgICAgICAgY29uc3QgYmVmb3JlQWZ0ZXI9ZmluZEJlZm9yZUFmdGVyQXhpcyhhcnIsaW5kZXgpO1xyXG4gICAgICAgIGNvbnN0IFtiZWZvcmUsIGFmdGVyXT1bYXJyW2JlZm9yZUFmdGVyLmJlZm9yZV0sYXJyW2JlZm9yZUFmdGVyLmFmdGVyXV1cclxuICAgICAgICBpZiAodGhpcy5wb3NpdGlvbnx8dGhpcy5zbG9wZWQpe3JldHVybn1cclxuICAgIFxyXG4gICAgICAgIGNvbnN0IGVkZ2UxID0gYmVmb3JlLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xyXG4gICAgICAgIGNvbnN0IGVkZ2UyID0gYWZ0ZXIucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XHJcbiAgICAgICAgY29uc3Qgc2xvcGU9ZmluZFNsb3BlKGJlZm9yZSxhZnRlcilcclxuXHJcbiAgICAgICAgdGhpcy5zbG9wZWQgPSBzbG9wZSAhPT0gMCYmc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHk7XHJcblxyXG4gICAgICAgIGxldCBxdWFkcmFudFxyXG5cclxuICAgICAgICBpZiAoZWRnZTEhPT1lZGdlMilcclxuICAgICAgICAgICAgcXVhZHJhbnQ9ZWRnZTErZWRnZTI7XHJcbiAgICAgICAgZWxzZSBcclxuICAgICAgICAgICAgcXVhZHJhbnQ9ZWRnZTE7XHJcblxyXG4gICAgICAgIC8vc2ludCBwYXJhbGxlbCB0byBZIGF4aXNcclxuICAgICAgICBpZiAoc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHkpe1xyXG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uID0gcXVhZHJhbnQucmVwbGFjZSgvKDN8NCkvLFwiYmVsb3dcIikucmVwbGFjZSgvKDF8MikvLFwiYWJvdmVcIikucmVwbGFjZSgvKGJlbG93YWJvdmV8YWJvdmViZWxvdykvLFwiXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vaXNudCBwYXJhbGxlbCB0byBYIGF4aXNcclxuICAgICAgICBpZiAoc2xvcGUgIT09IDApe1xyXG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uPXRoaXMucG9zaXRpb24/dGhpcy5wb3NpdGlvbjonJztcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbis9cXVhZHJhbnQucmVwbGFjZSgvKDF8NCkvLFwicmlnaHRcIikucmVwbGFjZSgvKDJ8MykvLFwibGVmdFwiKS5yZXBsYWNlKC8ocmlnaHRsZWZ0fGxlZnRyaWdodCkvLFwiXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMucG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uPy5yZXBsYWNlKC9bXFxkXSsvZyxcIlwiKS5yZXBsYWNlKC8oYmVsb3d8YWJvdmUpKHJpZ2h0fGxlZnQpLyxcIiQxICQyXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBzcGxpdEZvcm1hdHRpbmcgPSBmb3JtYXR0aW5nU3RyaW5nLnJlcGxhY2UoL1xccy9nLCBcIlwiKS5tYXRjaCgvKD86e1tefV0qfXxbXix7fV0rKSsvZykgfHwgW107XHJcbiAgICBcclxuICAgICAgICB0aGlzLmFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nKTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IHBhdHRlcm5zOiBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IHN0cmluZykgPT4gdm9pZD4gPSB7XHJcbiAgICAgICAgICAgIFwibGluZXdpZHRoXCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImxpbmVXaWR0aFwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiZmlsbD1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZmlsbFwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXmZpbGxvcGFjaXR5XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImZpbGxPcGFjaXR5XCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeKC0+fDwtfC0qe1N0ZWFsdGh9LSopJFwiOiAodmFsdWUpID0+IHsgdGhpcy5hcnJvdyA9IHZhbHVlOyB9LFxyXG4gICAgICAgICAgICBcIl4oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCl7MSwyfSRcIjogKHZhbHVlKSA9PiB7IHRoaXMucG9zaXRpb24gPSB2YWx1ZS5yZXBsYWNlKC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLCBcIiQxIFwiKTsgfSxcclxuICAgICAgICAgICAgXCJecG9zPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJwb3NcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5kcmF3PVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJkcmF3XCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeZGVjb3JhdGUkXCI6ICgpID0+IHsgdGhpcy5kZWNvcmF0ZSA9IHRydWU7IH0sXHJcbiAgICAgICAgICAgIFwiXnRleHQ9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcInRleHRcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5hbmNob3I9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImFuY2hvclwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXlxcXCJeXFxcIiRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImxhYmVsXCIsdHJ1ZSxcImZyZWVGb3JtVGV4dFwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJsYWJlbFwiXT4pLFxyXG4gICAgICAgICAgICBcIl5icmFjZSRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxyXG4gICAgICAgICAgICBcIl5hbXBsaXR1ZGVcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZGVjb3JhdGlvblwiLCB2YWx1ZSwgXCJhbXBsaXR1ZGVcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxyXG4gICAgICAgICAgICBcIl5kcmF3JFwiOiAodmFsdWUpID0+IHsgdGhpcy5wYXRoID0gdmFsdWU7IH0sXHJcbiAgICAgICAgICAgIFwiXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxcXGQuXSspezEsNX0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmNvbG9yID0gdmFsdWU7IH0sXHJcbiAgICAgICAgICAgIFwiXihkb3R0ZWR8ZGFzaGVkfHNtb290aHxkZW5zZWx5fGxvb3NlbHkpezEsMn0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmxpbmVTdHlsZSA9IHZhbHVlLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLywgXCIkMSBcIik7IH0sXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgc3BsaXRGb3JtYXR0aW5nLmZvckVhY2goZm9ybWF0dGluZyA9PiB7LypcclxuICAgICAgICAgICAgLy8gSGFuZGxlIG5lc3RlZCBwcm9wZXJ0aWVzXHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZm9ybWF0dGluZy5tYXRjaCgvXihbXj1dKyk9eyguKil9JC8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IFtfLCBwYXJlbnQsIGNoaWxkcmVuXSA9IG1hdGNoO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdPYmogPSB0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICAgICAgICAgICAgICBpZiAoIWZvcm1hdHRpbmdPYmpbcGFyZW50XSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpbcGFyZW50XSA9IHt9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkQ2hpbGQgPSBuZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUse30sY2hpbGRyZW4pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGZvcm1hdHRpbmdPYmpbcGFyZW50XSwgKHBhcnNlZENoaWxkIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW3BhcmVudF0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtwYXR0ZXJuLCBoYW5kbGVyXSBvZiBPYmplY3QuZW50cmllcyhwYXR0ZXJucykpIHtcclxuICAgICAgICAgICAgICAgIGlmIChuZXcgUmVnRXhwKHBhdHRlcm4pLnRlc3QoZm9ybWF0dGluZykpIHtcclxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyKGZvcm1hdHRpbmcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSovXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB0b1N0cmluZyhvYmo/OiBhbnkpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCBzdHJpbmc9b2JqPyd7JzonWyc7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqP29iajp0aGlzKSkge1xyXG4gICAgICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eKG1vZGV8dGlrenNldCkkLykpe2NvbnRpbnVlO31cclxuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyYmdmFsdWUpe1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrdGhpcy50b1N0cmluZyh2YWx1ZSkrJywnXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZys9bWF0Y2hLZXlXaXRoVmFsdWUoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcpKyh0eXBlb2YgdmFsdWU9PT1cImJvb2xlYW5cIj8nJzp2YWx1ZSkrJywnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcrKG9iaj8nfSc6J10nKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVPYmplY3RUb1N0cmluZyhvYmo6IG9iamVjdCwgcGFyZW50S2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xyXG4gICAgfVxyXG59XHJcblxyXG50eXBlIE1vZGUgPSBcImNvb3JkaW5hdGVcIiB8IFwiY29vcmRpbmF0ZS1pbmxpbmVcIiB8IFwibm9kZVwiIHwgXCJub2RlLWlubGluZVwiO1xyXG5cclxuZXhwb3J0IGNsYXNzIENvb3JkaW5hdGUge1xyXG4gICAgbW9kZTogTW9kZVxyXG4gICAgYXhpcz86IEF4aXNcclxuICAgIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nXHJcbiAgICB2YXJpYWJsZT86IEF4aXNcclxuICAgIGxhYmVsPzogc3RyaW5nXHJcbiAgICBcclxuICBjb25zdHJ1Y3Rvcihtb2RlOiBNb2RlLGF4aXM/OiBBeGlzLGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLHZhcmlhYmxlPzogQXhpcyxsYWJlbD86IHN0cmluZywpIHtcclxuICAgIHRoaXMubW9kZT1tb2RlO1xyXG4gICAgdGhpcy5heGlzPWF4aXM7XHJcbiAgICB0aGlzLmZvcm1hdHRpbmc9Zm9ybWF0dGluZztcclxuICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGU7XHJcbiAgICB0aGlzLmxhYmVsPWxhYmVsO1xyXG4gIH1cclxuICAgIGludGVycHJldENvb3JkaW5hdGUoY29vcmRpbmF0ZXM6IGFueVtdKXtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nPWNvb3JkaW5hdGVzLmZpbmQoY29vcj0+Y29vciBpbnN0YW5jZW9mIEZvcm1hdHRpbmcpXHJcbiAgICAgICAgY29uc3QgYXhpcz1jb29yZGluYXRlcy5maW5kKGNvb3I9PmNvb3IgaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgIGNvbnN0IHZhcmlhYmxlPWNvb3JkaW5hdGVzLmZpbmQoY29vcj0+Y29vcj8udHlwZT09PSd2YXJpYWJsZScpLnZhbHVlXHJcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nPWZvcm1hdHRpbmc7XHJcbiAgICAgICAgdGhpcy5heGlzPWF4aXNcclxuICAgICAgICB0aGlzLnZhcmlhYmxlPXZhcmlhYmxlXHJcbiAgICAgICAgcmV0dXJuIHRoaXNcclxuICAgIH1cclxuICAgIGNsb25lKCk6IENvb3JkaW5hdGUge1xyXG4gICAgICAgIHJldHVybiBuZXcgQ29vcmRpbmF0ZShcclxuICAgICAgICAgICAgdGhpcy5tb2RlLFxyXG4gICAgICAgICAgICB0aGlzLmF4aXMgPyB0aGlzLmF4aXMuY2xvbmUoKSA6dW5kZWZpbmVkLFxyXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmcsXHJcbiAgICAgICAgICAgIHRoaXMudmFyaWFibGUsXHJcbiAgICAgICAgICAgIHRoaXMubGFiZWwsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBhZGRBeGlzKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyKXtcclxuICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoY2FydGVzaWFuWCwgY2FydGVzaWFuWSwgcG9sYXJMZW5ndGgsIHBvbGFyQW5nbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMubW9kZSlcclxuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiY29vcmRpbmF0ZVwiOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcylcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm5gXFxcXGNvb3JkaW5hdGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9ICgke3RoaXMudmFyaWFibGUgfHwgXCJcIn0pIGF0ICgke3RoaXMuYXhpcy50b1N0cmluZygpfSk7YFxyXG4gICAgICAgICAgICBjYXNlIFwibm9kZVwiOlxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcyl7fVxyXG4gICAgICAgICAgICAgICAgICAgIC8vcmV0dXJuIGBcXFxcbm9kZSAke3RoaXMuY29vcmRpbmF0ZU5hbWU/JygnK3RoaXMuY29vcmRpbmF0ZU5hbWUrJyknOicnfSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfHwnJ30geyR7dGhpcy5sYWJlbH19O2BcclxuICAgICAgICAgICAgY2FzZSBcIm5vZGUtaW5saW5lXCI6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYG5vZGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9IHske3RoaXMubGFiZWwgfHwgJyd9fWBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgbW9kZSBhdCB0byBzdHJpbmcgY29vcmRpbmF0ZVwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbn1cclxuXHJcbmV4cG9ydCB0eXBlIFRva2VuID1BeGlzIHwgQ29vcmRpbmF0ZSB8RHJhd3xGb3JtYXR0aW5nfCBzdHJpbmc7XHJcblxyXG5leHBvcnQgY2xhc3MgRHJhdyB7XHJcbiAgICBtb2RlOiBzdHJpbmdcclxuICAgIGZvcm1hdHRpbmc6IEZvcm1hdHRpbmc7XHJcbiAgICBjb29yZGluYXRlczogYW55W109W107XHJcblxyXG5cclxuICAgIGNvbnN0cnVjdG9yKG1vZGU6IHN0cmluZyxmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxjb29yZGluYXRlcz86IGFueVtdLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LCkgeztcclxuICAgICAgICB0aGlzLm1vZGU9bW9kZTtcclxuICAgICAgICBpZihmb3JtYXR0aW5nKVxyXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9Zm9ybWF0dGluZztcclxuICAgICAgICBpZihjb29yZGluYXRlcylcclxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcz1jb29yZGluYXRlcztcclxuICAgIH1cclxuICAgIGNyZWF0ZUZyb21BcnJheShhcnI6IGFueSl7LypcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XHJcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YXJyLmxlbmd0aDtpKyspe1xyXG4gICAgICAgICAgICBpZiAoYXJyW2ldIGluc3RhbmNlb2YgQXhpc3x8YXJyW2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSl7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiBhcnI9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaChhcnJbaV0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7Ki9cclxuICAgIH1cclxuXHJcbiAgICBmaWxsQ29vcmRpbmF0ZXMoc2NoZW1hdGljOiBhbnlbXSwgdG9rZW5zPzogRm9ybWF0VGlrempheCkge1xyXG4gICAgICAgIGlmKHNjaGVtYXRpY1swXSBpbnN0YW5jZW9mIEZvcm1hdHRpbmcpe1xyXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9c2NoZW1hdGljWzBdXHJcbiAgICAgICAgICAgIHNjaGVtYXRpYy5zcGxpY2UoMCwxKVxyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCByZWZlcmVuY2VGaXJzdEF4aXNNYXAgPSBzY2hlbWF0aWNcclxuICAgICAgICAgICAgLm1hcCgoY29vciwgaW5kZXgpID0+IChjb29yIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgY29vci5uYW1lID09PSAnUmVmZXJlbmNlRmlyc3RBeGlzJyA/IGluZGV4IDogbnVsbCkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpOiB0IGlzIG51bWJlciA9PiB0ICE9PSBudWxsKTsgXHJcblxyXG4gICAgICAgIGNvbnN0IHJlZmVyZW5jZUxhc3RBeGlzTWFwID0gc2NoZW1hdGljXHJcbiAgICAgICAgICAgIC5tYXAoKGNvb3IsIGluZGV4KSA9PiAoY29vciBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuICYmIGNvb3IubmFtZSA9PT0gJ1JlZmVyZW5jZUxhc3RBeGlzJyA/IGluZGV4IDogbnVsbCkpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpOiB0IGlzIG51bWJlciA9PiB0ICE9PSBudWxsKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBtYXBwZWRSZWZlcmVuY2VzID0gcmVmZXJlbmNlRmlyc3RBeGlzTWFwLm1hcChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIHNjaGVtYXRpY1tpbmRleF0ubmFtZT0nQXhpc0Nvbm5lY3RlcidcclxuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXNJbmRleCA9IHNjaGVtYXRpYy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXMgPSBuZXh0QXhpc0luZGV4ICE9PSAtMSA/IHNjaGVtYXRpY1tpbmRleCArIDEgKyBuZXh0QXhpc0luZGV4XSA6IG51bGw7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiBuZXh0QXhpcztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwcyA9IHJlZmVyZW5jZUxhc3RBeGlzTWFwLm1hcChpbmRleCA9PiB7XHJcbiAgICAgICAgICAgIHNjaGVtYXRpY1tpbmRleF0ubmFtZT0nQXhpc0Nvbm5lY3RlcidcclxuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXNJbmRleCA9IHNjaGVtYXRpYy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXMgPSBuZXh0QXhpc0luZGV4ICE9PSAtMSA/IHNjaGVtYXRpY1tpbmRleCArIDEgKyBuZXh0QXhpc0luZGV4XSA6IG51bGw7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0F4aXNJbmRleCA9IHNjaGVtYXRpY1xyXG4gICAgICAgICAgICAgICAgLnNsaWNlKDAsIGluZGV4KVxyXG4gICAgICAgICAgICAgICAgLnJldmVyc2UoKVxyXG4gICAgICAgICAgICAgICAgLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzQXhpcyA9IHByZXZpb3VzQXhpc0luZGV4ICE9PSAtMSA/IHNjaGVtYXRpY1tpbmRleCAtIDEgLSBwcmV2aW91c0F4aXNJbmRleF0gOiBudWxsO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIHJlZmVyZW5jZUZpcnN0QXhpczogc2NoZW1hdGljW2luZGV4XSxcclxuICAgICAgICAgICAgICAgIHByZXZpb3VzQXhpcyxcclxuICAgICAgICAgICAgICAgIG5leHRBeGlzLFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlmKG1hcHBlZFJlZmVyZW5jZXMubGVuZ3RoPjApe1xyXG4gICAgICAgICAgICBjb25zdCBmaXJzdEF4aXM9c2NoZW1hdGljLmZpbmQodD0+dCBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICAgICAgICAgIG1hcHBlZFJlZmVyZW5jZXMuZm9yRWFjaChheGlzID0+IHtcclxuICAgICAgICAgICAgICAgIGF4aXMuY29tcGxleENhcnRlc2lhbkFkZChmaXJzdEF4aXMsXCJhZGRpdGlvblwiKVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXM9c2NoZW1hdGljO1xyXG4gICAgICAgIHJldHVybiB0aGlzXHJcbiAgICAgICAgXHJcbiAgICAgICAgLypcclxuICAgICAgICBjb25zdCBjb29yQXJyOiBBcnJheTxUb2tlbj49W107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2hlbWF0aWMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHNjaGVtYXRpY1tpXS50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgICAgICAgICAgbGV0IHByZXZpb3VzRm9ybWF0dGluZztcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoaSA+IDAgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMV0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPiAxICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJub2RlXCIgJiYgc2NoZW1hdGljW2kgLSAyXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMl0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IEF4aXMoKS51bml2ZXJzYWwoc2NoZW1hdGljW2ldLnZhbHVlLCB0b2tlbnMsIGNvb3JBcnIsIHByZXZpb3VzRm9ybWF0dGluZywgKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZihzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJub2RlXCIpe1xyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBDb29yZGluYXRlKHtsYWJlbDogc2NoZW1hdGljW2ldLnZhbHVlLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZS1pbmxpbmVcIix7fSxzY2hlbWF0aWNbaV0uZm9ybWF0dGluZyksbW9kZTogXCJub2RlLWlubGluZVwifSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2V7XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2goc2NoZW1hdGljW2ldLnZhbHVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY29vckFycjsqL1xyXG4gICAgfVxyXG5cclxuICAgIGdldFNjaGVtYXRpYyhkcmF3OiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCByZWdleD1nZXRSZWdleCgpO1xyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcclxuICAgICAgICBjb25zdCBub2RlUmVnZXggPSByZWdFeHAoU3RyaW5nLnJhd2Bub2RlXFxzKlxcWz8oJHtyZWdleC5mb3JtYXR0aW5nfSopXFxdP1xccyp7KCR7cmVnZXgudGV4dH0qKX1gKTtcclxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nUmVnZXggPSAvKC0tY3ljbGV8Y3ljbGV8LS1cXCtcXCt8LS1cXCt8LS18LVxcfHxcXHwtfGdyaWR8Y2lyY2xlfHJlY3RhbmdsZSkvO1xyXG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHNcXC0sLjpgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YChcXChbJHtjYX1dK1xcKXxcXChcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K1xcLV0rXFwoWyR7Y2F9XStcXClcXCRcXCkpYCk7XHJcbiAgICAgICAgbGV0IGkgPSAwO1xyXG4gICAgICAgIGxldCBsb29wcyA9IDA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGkgPCBkcmF3Lmxlbmd0aCAmJiBsb29wcyA8IDEwMCkgeyAvLyBJbmNyZWFzZSBsb29wIGxpbWl0IG9yIGFkZCBjb25kaXRpb24gYmFzZWQgb24gcGFyc2VkIGxlbmd0aFxyXG4gICAgICAgICAgICBsb29wcysrO1xyXG4gICAgICAgICAgICBjb25zdCBjb29yZGluYXRlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGNvb3JkaW5hdGVSZWdleCk7XHJcbiAgICAgICAgICAgIFxyXG5cclxuICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiY29vcmRpbmF0ZVwiLCB2YWx1ZTogY29vcmRpbmF0ZU1hdGNoWzFdIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChmb3JtYXR0aW5nTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBpICs9IGZvcm1hdHRpbmdNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3Qgbm9kZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAobm9kZU1hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm5vZGVcIixcclxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBub2RlTWF0Y2hbMV0gfHwgXCJcIixcclxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogbm9kZU1hdGNoWzJdXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbm9kZU1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAobG9vcHMgPT09IDEwMCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQYXJzaW5nIGV4Y2VlZGVkIHNhZmUgbG9vcCBjb3VudFwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7XHJcbiAgICB9XHJcblxyXG4gICAgaXNDb29yZGluYXRlKG9iajogYW55KTogb2JqIGlzIENvb3JkaW5hdGUge1xyXG4gICAgICAgIHJldHVybiBvYmogJiYgb2JqIGluc3RhbmNlb2YgQ29vcmRpbmF0ZTtcclxuICAgIH1cclxuICAgIHRvU3RyaW5nRHJhdygpe1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBgXFxcXGRyYXcgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCl9IGA7XHJcbiAgICAgICAgdGhpcy5jb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICBjYXNlIGNvb3JkaW5hdGUgaW5zdGFuY2VvZiBDb29yZGluYXRlJiZjb29yZGluYXRlLm1vZGU9PT1cIm5vZGUtaW5saW5lXCI6IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW46IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPWAoJHtjb29yZGluYXRlLnRvU3RyaW5nKCl9KWBcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0ICsgXCI7XCI7XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmdQaWMoKXtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3IHBpYyAke3RoaXMuZm9ybWF0dGluZy50b1N0cmluZygpfHwnJ30ge2FuZ2xlID0gJHsodGhpcy5jb29yZGluYXRlc1swXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1sxXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1syXSBhcyBBeGlzKS5uYW1lfX0gYDtcclxuICAgICBcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCkge1xyXG4gICAgICAgIGlmICh0aGlzLm1vZGU9PT0nZHJhdycpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nRHJhdygpO1xyXG4gICAgICAgIGlmKHRoaXMubW9kZT09PSdkcmF3LXBpYy1hbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ1BpYygpXHJcbiAgICAgICAgXHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5cclxuICBcclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZGlzc2VjdFhZYXhpcyhtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSkge1xyXG4gICAgbGV0IFhub2RlOlJlZ0V4cE1hdGNoQXJyYXl8c3RyaW5nPVwiXCIsIFlub2RlOlJlZ0V4cE1hdGNoQXJyYXl8c3RyaW5nPVwiXCI7XHJcblxyXG4gICAgaWYgKG1hdGNoWzFdICYmIG1hdGNoWzJdKSB7XHJcbiAgICAgICAgWG5vZGUgPSBtYXRjaFsxXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xyXG4gICAgICAgIFlub2RlID0gbWF0Y2hbMl0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcclxuICAgICAgICBYbm9kZT1Ybm9kZVswXS5zdWJzdHJpbmcoMSxYbm9kZS5sZW5ndGgpXHJcbiAgICAgICAgWW5vZGU9WW5vZGVbMF0uc3Vic3RyaW5nKDEsWW5vZGUubGVuZ3RoKVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHR5cGU6IFwieHlheGlzXCIsXHJcbiAgICAgICAgWGZvcm1hdHRpbmc6IG1hdGNoWzFdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcclxuICAgICAgICBZZm9ybWF0dGluZzogbWF0Y2hbMl0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxyXG4gICAgICAgIHhEaXJlY3Rpb246IG1hdGNoWzFdICYmIC8tPi8udGVzdChtYXRjaFsxXSkgPyBcImxlZnRcIiA6IFwicmlnaHRcIixcclxuICAgICAgICB5RGlyZWN0aW9uOiBtYXRjaFsyXSAmJiAvLT4vLnRlc3QobWF0Y2hbMl0pID8gXCJkb3duXCIgOiBcInVwXCIsXHJcbiAgICAgICAgWG5vZGU6IFhub2RlLFxyXG4gICAgICAgIFlub2RlOiBZbm9kZSxcclxuICAgIH07XHJcbn1cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuLypcclxuZnVuY3Rpb24gZ2VuZXJhdGVGb3JtYXR0aW5nKGNvb3JkaW5hdGU6IENvb3JkaW5hdGUpe1xyXG4gICAgaWYgKHR5cGVvZiBjb29yZGluYXRlLmxhYmVsICE9PSBcInN0cmluZ1wiKXsgcmV0dXJuIFwiXCI7IH1cclxuICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBjb29yZGluYXRlLmZvcm1hdHRpbmc/LnNwbGl0KFwiLFwiKSB8fCBbXTtcclxuICAgIGlmIChmb3JtYXR0aW5nLnNvbWUoKHZhbHVlOiBzdHJpbmcpID0+IC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLnRlc3QodmFsdWUpKSkge1xyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlLmZvcm1hdHRpbmc7XHJcbiAgICB9XHJcbiAgICBpZihmb3JtYXR0aW5nLmxlbmd0aD4wJiYhZm9ybWF0dGluZ1tmb3JtYXR0aW5nLmxlbmd0aC0xXS5lbmRzV2l0aChcIixcIikpe2Zvcm1hdHRpbmcucHVzaChcIixcIil9XHJcbiAgICBzd2l0Y2goY29vcmRpbmF0ZS5xdWFkcmFudCl7XHJcbiAgICAgICAgY2FzZSAxOlxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIHJpZ2h0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOlxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIGxlZnQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDM6XHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgbGVmdCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgNDogXHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgcmlnaHQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuICAgIHJldHVybiBmb3JtYXR0aW5nLmpvaW4oXCJcIik7XHJcbn1cclxuKi9cclxuXHJcbiJdfQ==