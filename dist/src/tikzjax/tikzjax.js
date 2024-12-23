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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBUyxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFckUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pJLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUl6RCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FB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QUFDLENBQUMsRUFBRSxPQUFPLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxDQUFDO1FBQzVELFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLHdCQUF3QixFQUFFLEVBQUUsQ0FBQztRQUM1RCxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTztRQUM5RCxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUMzRCxLQUFLLEVBQUUsS0FBSztRQUNaLEtBQUssRUFBRSxLQUFLO0tBQ2YsQ0FBQztBQUNOLENBQUM7QUFhRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBd0JFIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBNYXJrZG93blZpZXcsIFNjb3BlLCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCBNYXRoUGx1Z2luIGZyb20gXCJzcmMvbWFpblwiO1xuaW1wb3J0IHsgb3B0aW1pemUgfSBmcm9tIFwiLi9zdmdvLmJyb3dzZXIuanNcIjtcbi8vIEB0cy1pZ25vcmVcbmltcG9ydCB0aWt6amF4SnMgZnJvbSBcImlubGluZTouL3Rpa3pqYXguanNcIjtcbmltcG9ydCB7IGNhcnRlc2lhblRvUG9sYXIsIGZpbmRJbnRlcnNlY3Rpb25Qb2ludCwgZmluZFNsb3BlLCBwb2xhclRvQ2FydGVzaWFuLCB0b051bWJlciB9IGZyb20gXCJzcmMvbWF0aFBhcnNlci9tYXRoVXRpbGl0aWVzLmpzXCI7XG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcbmltcG9ydCB7IEJhc2ljVGlrelRva2VuLCBGb3JtYXRUaWt6amF4IH0gZnJvbSBcIi4vaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC5qc1wiO1xuaW1wb3J0IHsgbWFwQnJhY2tldHMgfSBmcm9tIFwic3JjL3V0aWxzL3Rva2VuVXRlbnNpbHMuanNcIjtcblxuXG5cbmV4cG9ydCBjbGFzcyBUaWt6amF4IHtcbiAgICBhcHA6IEFwcDtcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XG4gICAgYWN0aXZlVmlldzogTWFya2Rvd25WaWV3IHwgbnVsbDtcblxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xuICAgICAgdGhpcy5hcHA9YXBwO1xuICAgICAgdGhpcy5hY3RpdmVWaWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcbiAgICB9XG4gICAgXG4gICAgcmVhZHlMYXlvdXQoKXtcbiAgICAgIHRoaXMucGx1Z2luLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XG4gICAgICAgIHRoaXMubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XG4gICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9KSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gICAgbG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xuICAgICAgICBjb25zdCBzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtcbiAgICAgICAgcy5pZCA9IFwidGlrempheFwiO1xuICAgICAgICBzLnR5cGUgPSBcInRleHQvamF2YXNjcmlwdFwiO1xuICAgICAgICBzLmlubmVyVGV4dCA9IHRpa3pqYXhKcztcbiAgICAgICAgZG9jLmJvZHkuYXBwZW5kQ2hpbGQocyk7XG4gICAgICAgIGRvYy5hZGRFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xuICAgIH1cbiAgXG4gICAgdW5sb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XG4gICAgICAgIGNvbnN0IHMgPSBkb2MuZ2V0RWxlbWVudEJ5SWQoXCJ0aWt6amF4XCIpO1xuICAgICAgICBzPy5yZW1vdmUoKTtcblxuICAgICAgICBkb2MucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcbiAgICB9XG4gIFxuICAgIGxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcbiAgICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcbiAgICAgICAgfVxuICAgIH1cbiAgXG4gICAgdW5sb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XG4gICAgICAgICAgICB0aGlzLnVubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcbiAgICAgICAgfVxuICAgIH1cbiAgXG4gICAgZ2V0QWxsV2luZG93cygpIHtcbiAgICAgICAgY29uc3Qgd2luZG93cyA9IFtdO1xuICAgICAgICBcbiAgICAgICAgLy8gcHVzaCB0aGUgbWFpbiB3aW5kb3cncyByb290IHNwbGl0IHRvIHRoZSBsaXN0XG4gICAgICAgIHdpbmRvd3MucHVzaCh0aGlzLmFwcC53b3Jrc3BhY2Uucm9vdFNwbGl0Lndpbik7XG4gICAgICAgIFxuICAgICAgICAvLyBAdHMtaWdub3JlIGZsb2F0aW5nU3BsaXQgaXMgdW5kb2N1bWVudGVkXG4gICAgICAgIGNvbnN0IGZsb2F0aW5nU3BsaXQgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZmxvYXRpbmdTcGxpdDtcbiAgICAgICAgZmxvYXRpbmdTcGxpdC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiB7XG4gICAgICAgICAgICAvLyBpZiB0aGlzIGlzIGEgd2luZG93LCBwdXNoIGl0IHRvIHRoZSBsaXN0IFxuICAgICAgICAgICAgaWYgKGNoaWxkIGluc3RhbmNlb2YgV29ya3NwYWNlV2luZG93KSB7XG4gICAgICAgICAgICAgICAgd2luZG93cy5wdXNoKGNoaWxkLndpbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiB3aW5kb3dzO1xuICAgIH1cbiAgXG4gIFxuICAgIHJlZ2lzdGVyVGlrekNvZGVCbG9jaygpIHtcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrelwiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBpY29uID0gT2JqZWN0LmFzc2lnbihlbC5jcmVhdGVFbChcImRpdlwiKSwge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcbiAgICAgICAgICAgICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgIGNvbnN0IHNjcmlwdCA9IGVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L3Rpa3pcIik7XG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xuICAgICAgICAgICAgY29uc3QgdGlrempheD1uZXcgRm9ybWF0VGlrempheChzb3VyY2UpO1xuICAgICAgICAgICAgaWNvbi5vbmNsaWNrID0gKCkgPT4gbmV3IERlYnVnTW9kYWwodGhpcy5hcHAsdGlrempheC5kZWJ1Z0luZm8pLm9wZW4oKTtcbiAgICAgICAgICAgIHNjcmlwdC5zZXRUZXh0KHRpa3pqYXguZ2V0Q29kZSgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhdGNoKGUpe1xuICAgICAgICAgICAgICAgIGVsLmlubmVySFRNTCA9IFwiXCI7XG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3JEaXNwbGF5ID0gZWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibWF0aC1lcnJvci1saW5lXCIgfSk7XG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmlubmVyVGV4dCA9IGBFcnJvcjogJHtlLm1lc3NhZ2V9YDtcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuY2xhc3NMaXN0LmFkZChcImVycm9yLXRleHRcIik7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIlRpa1ogUHJvY2Vzc2luZyBFcnJvcjpcIiwgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgfVxuICBcbiAgICAgIGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XG4gICAgICB9XG4gIFxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mbyA9IHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLmZpbHRlcihlbCA9PiBlbC5uYW1lICE9IFwiVGlrelwiKTtcbiAgICAgIH1cblxuICBcbiAgICAgIGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xuICAgICAgICBzdmcgPSBzdmcucmVwbGFjZUFsbCgvKFwiIzAwMFwifFwiYmxhY2tcIikvZywgXCJcXFwiY3VycmVudENvbG9yXFxcIlwiKVxuICAgICAgICAgICAgICAgIC5yZXBsYWNlQWxsKC8oXCIjZmZmXCJ8XCJ3aGl0ZVwiKS9nLCBcIlxcXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXFxcIlwiKTtcbiAgICAgICAgcmV0dXJuIHN2ZztcbiAgICAgIH1cbiAgXG4gIFxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gb3B0aW1pemUoc3ZnLCB7cGx1Z2luczpcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFwicHJlc2V0LWRlZmF1bHRcIixcbiAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbnVwSURzOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgIH0pPy5kYXRhO1xuICAgICAgfVxuICBcbiAgXG4gICAgICBwb3N0UHJvY2Vzc1N2ZyA9IChlOiBFdmVudCkgPT4ge1xuICBcbiAgICAgICAgICBjb25zdCBzdmdFbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XG4gIFxuICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKSB7XG4gICAgICAgICAgICBzdmcgPSB0aGlzLmNvbG9yU1ZHaW5EYXJrTW9kZShzdmcpO1xuICAgICAgICAgIH1cbiAgXG4gICAgICAgICAgc3ZnID0gdGhpcy5vcHRpbWl6ZVNWRyhzdmcpO1xuICBcbiAgICAgICAgICBzdmdFbC5vdXRlckhUTUwgPSBzdmc7XG4gICAgfVxufVxuZXhwb3J0IGNvbnN0IGFyclRvUmVnZXhTdHJpbmcgPSAoYXJyOiBBcnJheTxzdHJpbmc+KSA9PiAnKCcgKyBhcnIuam9pbignfCcpICsgJyknO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnRXhwKHBhdHRlcm46IHN0cmluZyB8IFJlZ0V4cCB8IEFycmF5PHN0cmluZz4sIGZsYWdzOiBzdHJpbmcgPSAnJyk6IFJlZ0V4cCB7XG4gICAgaWYgKHBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgICAgcGF0dGVybiA9IHBhdHRlcm4uc291cmNlO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwYXR0ZXJuKSkge1xuICAgICAgICBwYXR0ZXJuID0gYXJyVG9SZWdleFN0cmluZyhwYXR0ZXJuKTtcbiAgICB9XG5cbiAgICAvLyBDcmVhdGUgYW5kIHJldHVybiB0aGUgUmVnRXhwXG4gICAgcmV0dXJuIG5ldyBSZWdFeHAoU3RyaW5nLnJhd2Ake3BhdHRlcm59YCwgZmxhZ3MpO1xufVxuXG5cbmZ1bmN0aW9uIGdldFJlZ2V4KCl7XG4gICAgY29uc3QgYmFzaWMgPSBTdHJpbmcucmF3YFtcXHdcXGRcXHMtLC46XWA7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgYmFzaWM6IGJhc2ljLFxuICAgICAgICBtZXJnZTogU3RyaW5nLnJhd2AtXFx8fFxcfC18IVtcXGQuXSshfFxcK3wtYCxcbiAgICAgICAgLy9jb29yZGluYXRlOiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKCR7YmFzaWN9K3wxKWApLFxuICAgICAgICBjb29yZGluYXRlTmFtZTogU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gLFxuICAgICAgICB0ZXh0OiBTdHJpbmcucmF3YFtcXHdcXHMtLC46J1xcJFxcKCFcXClfK1xcXFx7fT1dYCxcbiAgICAgICAgZm9ybWF0dGluZzogU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7Jip7fSgpJS08Pl1gXG4gICAgfTtcbn1cblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuaW50ZXJmYWNlIHRva2VuICB7XG4gICAgWD86IG51bWJlcjtcbiAgICBZPzogbnVtYmVyO1xuICAgIHR5cGU/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZXM/OiBhbnk7XG59XG5cblxuXG5cblxuXG5cbmZ1bmN0aW9uIGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlczogQXJyYXk8QXhpcyB8IHN0cmluZz4sIGluZGV4OiBudW1iZXIpOiB7IGJlZm9yZTogbnVtYmVyLCBhZnRlcjogbnVtYmVyIH0ge1xuICAgIFxuICAgIGxldCBiZWZvcmVJbmRleCA9IGF4ZXMuc2xpY2UoMCwgaW5kZXgpLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIGxldCBhZnRlckluZGV4ID0gYXhlcy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XG5cbiAgICAvLyBBZGp1c3QgYGFmdGVySW5kZXhgIHNpbmNlIHdlIHNsaWNlZCBmcm9tIGBpbmRleCArIDFgXG4gICAgaWYgKGFmdGVySW5kZXggIT09IC0xKSB7XG4gICAgICAgIGFmdGVySW5kZXggKz0gaW5kZXggKyAxO1xuICAgIH1cblxuICAgIC8vIFdyYXAgYXJvdW5kIGlmIG5vdCBmb3VuZFxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgYmVmb3JlSW5kZXggPSBheGVzLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIH1cblxuICAgIGlmIChhZnRlckluZGV4ID09PSAtMSkge1xuICAgICAgICBhZnRlckluZGV4ID0gYXhlcy5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIH1cbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xIHx8IGFmdGVySW5kZXggPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgdmFsaWQgQXhpcyBvYmplY3RzLlwiKTtcbiAgICB9XG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSBhZnRlckluZGV4KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlByYWlzZWQgYXhpcyBhcyBzYW1lIHRva2VuXCIpO1xuICAgIH1cbiAgICByZXR1cm4geyBiZWZvcmU6IGJlZm9yZUluZGV4LCBhZnRlcjogYWZ0ZXJJbmRleCB9O1xufVxuXG5cbmV4cG9ydCBjbGFzcyBBeGlzIHtcbiAgICBjYXJ0ZXNpYW5YOiBudW1iZXI7XG4gICAgY2FydGVzaWFuWTogbnVtYmVyO1xuICAgIHBvbGFyQW5nbGU6IG51bWJlcjtcbiAgICBwb2xhckxlbmd0aDogbnVtYmVyO1xuICAgIG5hbWU/OiBzdHJpbmc7XG4gICAgcXVhZHJhbnQ/OiBudW1iZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihjYXJ0ZXNpYW5YPzogbnVtYmVyLCBjYXJ0ZXNpYW5ZPzogbnVtYmVyLCBwb2xhckxlbmd0aD86IG51bWJlciwgcG9sYXJBbmdsZT86IG51bWJlcixuYW1lPzogc3RyaW5nKSB7XG4gICAgICAgIGlmIChjYXJ0ZXNpYW5YICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWCA9IGNhcnRlc2lhblg7XG4gICAgICAgIGlmIChjYXJ0ZXNpYW5ZICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWSA9IGNhcnRlc2lhblk7XG4gICAgICAgIGlmIChwb2xhckxlbmd0aCAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyTGVuZ3RoID0gcG9sYXJMZW5ndGg7XG4gICAgICAgIGlmIChwb2xhckFuZ2xlICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJBbmdsZSA9IHBvbGFyQW5nbGU7XG4gICAgICAgIHRoaXMubmFtZT1uYW1lXG4gICAgfVxuICAgIFxuICAgIGNsb25lKCk6IEF4aXMge1xuICAgICAgICByZXR1cm4gbmV3IEF4aXModGhpcy5jYXJ0ZXNpYW5YLCB0aGlzLmNhcnRlc2lhblksdGhpcy5wb2xhckxlbmd0aCx0aGlzLnBvbGFyQW5nbGUsdGhpcy5uYW1lKTtcbiAgICB9XG4gICAgcGFyc2VJbnB1dChpbnB1dDogYW55KSB7XG4gICAgICAgIGNvbnN0IGF4ZXM9W11cbiAgICAgICAgY29uc3QgYnJhY2tldE1hcCA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgaW5wdXQpO1xuICAgICAgICBheGVzLnB1c2godGhpcy5wcm9jZXNzSW5kaXZpZHVhbChpbnB1dCkpO1xuICAgICAgICAgICAgaWYoYXhlcy5sZW5ndGg9PT0xKVxuICAgICAgICAgICAgICAgIHJldHVybiBheGVzWzBdXG4gICAgfVxuICAgIFxuICAgIHByb2Nlc3NJbmRpdmlkdWFsKGlucHV0OiBhbnkpIHtcbiAgICAgICAgbGV0IGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICBjb25zdCBpc0NhcnRlc2lhbiA9IGlucHV0LnNvbWUoKHRva2VuOiBhbnkpID0+IHRva2VuLm5hbWUgPT09ICdDb21tYScpO1xuICAgICAgICBpbnB1dCA9IGlucHV0LmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSAhPT0gJ1N5bnRheCcpO1xuICAgICAgICBpZiAoaXNDYXJ0ZXNpYW4gJiYgaW5wdXQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBheGlzLmNhcnRlc2lhblggPSBpbnB1dFswXS52YWx1ZTtcbiAgICAgICAgICAgIGF4aXMuY2FydGVzaWFuWSA9IGlucHV0WzFdLnZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBheGlzO1xuICAgIH1cbiAgICBcblxuICAgIHVuaXZlcnNhbChjb29yZGluYXRlOiBzdHJpbmcsIHRva2Vucz86IEZvcm1hdFRpa3pqYXgsYW5jaG9yQXJyPzogYW55LGFuY2hvcj86IHN0cmluZyk6IEF4aXMge1xuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVBcnI6IEFycmF5PEF4aXN8c3RyaW5nPiA9IFtdO1xuICAgICAgICBtYXRjaGVzLmZvckVhY2goKG1hdGNoOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xuICAgICAgICAgICAgbGV0IGF4aXM6IEF4aXN8dW5kZWZpbmVkO1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZENhcnRlc2lhbihtYXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAvOi8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZFBvbGFyKG1hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5wb2xhclRvQ2FydGVzaWFuKClcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIC8hW1xcZC5dKyEvLnRlc3QobWF0Y2gpOlxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICgvW1xcZFxcd10rLykudGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpe31cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vYXhpcyA9IHRva2Vucy5maW5kT3JpZ2luYWxWYWx1ZShtYXRjaCk/LmF4aXM7XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgdGhyb3cgbmV3IEVycm9yKGBUcmllZCB0byBmaW5kIG9yaWdpbmFsIGNvb3JkaW5hdGUgdmFsdWUgd2hpbGUgbm90IGJlaW5nIHByb3ZpZGVkIHdpdGggdG9rZW5zYCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYXhpcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIHRoZSBjb29yZGluYXRlICR7bWF0Y2h9IGZyb20gJHtjb29yZGluYXRlfWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYXhpcy5uYW1lPW1hdGNoXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubWVyZ2VBeGlzKGNvb3JkaW5hdGVBcnIpXG5cbiAgICAgICAgaWYoYW5jaG9yQXJyJiZhbmNob3ImJmFuY2hvci5tYXRjaCgvKC0tXFwrfC0tXFwrXFwrKS8pKXtcbiAgICAgICAgICAgIGxldCBhOiBBeGlzXG4gICAgICAgICAgICBpZiAoYW5jaG9yLm1hdGNoKC8oLS1cXCspLykpe1xuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmQoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmRMYXN0KChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYSxcImFkZGl0aW9uXCIpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgbWVyZ2VBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+KSB7XG4gICAgICAgIGlmICghYXhlcy5zb21lKChheGlzOiBhbnkpID0+IHR5cGVvZiBheGlzID09PSBcInN0cmluZ1wiKSkge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCAoYXhlc1swXSBhcyBBeGlzKS5jbG9uZSgpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgYXhpcyBvZiBheGVzKSB7XG4gICAgICAgICAgICBpZih0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIil7Y29udGludWU7fVxuICAgICAgICAgICAgYXhpcy5uYW1lPXVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXhlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IGF4ZXNbaV07XG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnQgIT09IFwic3RyaW5nXCIpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3Qgc2lkZXMgPSBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXMsIGkpO1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlQXhpcyA9IGF4ZXNbc2lkZXMuYmVmb3JlXSBhcyBBeGlzO1xuICAgICAgICAgICAgY29uc3QgYWZ0ZXJBeGlzID0gYXhlc1tzaWRlcy5hZnRlcl0gYXMgQXhpcztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbGV0ICBtYXRjaCA9IGN1cnJlbnQubWF0Y2goL15cXCskLyk7XG4gICAgICAgICAgICBsZXQgbW9kZSxtb2RpZmllcnM7XG4gICAgICAgICAgICBpZiAobWF0Y2gpe1xuICAgICAgICAgICAgICAgIG1vZGUgPSBcImFkZGl0aW9uXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL14tXFx8JC8pXG4gICAgICAgICAgICBpZighbW9kZSYmbWF0Y2gpe1xuICAgICAgICAgICAgICAgIG1vZGUgPSBcInJpZ2h0UHJvamVjdGlvblwiXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaD1jdXJyZW50Lm1hdGNoKC9eXFwhKFtcXGQuXSspXFwhJC8pXG4gICAgICAgICAgICBpZighbW9kZSYmbWF0Y2gpe1xuICAgICAgICAgICAgICAgIG1vZGUgPSBcImludGVybmFsUG9pbnRcIlxuICAgICAgICAgICAgICAgIG1vZGlmaWVycz10b051bWJlcihtYXRjaFsxXSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYobW9kZSl7XG4gICAgICAgICAgICAgICAgYXhlcy5zcGxpY2Uoc2lkZXMuYmVmb3JlLCBzaWRlcy5hZnRlciAtIHNpZGVzLmJlZm9yZSArIDEsIGJlZm9yZUF4aXMuY29tcGxleENhcnRlc2lhbkFkZChhZnRlckF4aXMsbW9kZSxtb2RpZmllcnMpKTtcbiAgICAgICAgICAgICAgICBpID0gc2lkZXMuYmVmb3JlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXhlcy5sZW5ndGggPT09IDEgJiYgYXhlc1swXSBpbnN0YW5jZW9mIEF4aXMpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb21wbGV4Q2FydGVzaWFuQWRkKGF4aXM6IEF4aXMsbW9kZTogc3RyaW5nLG1vZGlmaWVyPzogYW55KXtcbiAgICAgICAgc3dpdGNoIChtb2RlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkaXRpb25cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblgrPWF4aXMuY2FydGVzaWFuWDtcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblkrPWF4aXMuY2FydGVzaWFuWTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJzdWJ0cmFjdGlvblwiOlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInJpZ2h0UHJvamVjdGlvblwiOlxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD1heGlzLmNhcnRlc2lhblhcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJpbnRlcm5hbFBvaW50XCI6XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPSh0aGlzLmNhcnRlc2lhblgrYXhpcy5jYXJ0ZXNpYW5YKSptb2RpZmllcjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblk9KHRoaXMuY2FydGVzaWFuWStheGlzLmNhcnRlc2lhblkpKm1vZGlmaWVyO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhcnRlc2lhblRvUG9sYXIoKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH07XG5cblxuICAgIGdldENvb3JkaW5hdGVNYXRjaGVzKGNvb3JkaW5hdGU6IHN0cmluZyl7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybiA9IGdldFJlZ2V4KCk7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4uYmFzaWN9KylgLCBcImdcIiksXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4ubWVyZ2V9KylgLCBcImdcIilcbiAgICAgICAgXTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgMTogRXh0cmFjdCBtYXRjaGVzIGZvciBlYWNoIHBhdHRlcm4gc2VwYXJhdGVseVxuICAgICAgICBjb25zdCBiYXNpY01hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1swXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0ucmVwbGFjZSgvLSQvZywgXCJcIiksIC8vIFJlbW92ZSB0cmFpbGluZyBoeXBoZW4gb25seVxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aC0obWF0Y2hbMF0ubWF0Y2goLy0kLyk/MTowKVxuICAgICAgICB9KSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtZXJnZU1hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1sxXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0sXG4gICAgICAgICAgICBpbmRleDogbWF0Y2guaW5kZXggPz8gMCxcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoXG4gICAgICAgIH0pKTtcbiAgICAgICAgY29uc3QgbWF0Y2hlczogQXJyYXk8eyBmdWxsTWF0Y2g6IHN0cmluZywgaW5kZXg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIgfT4gPSBbXTtcblxuICAgICAgICBmdW5jdGlvbiBpc092ZXJsYXBwaW5nKG1hdGNoMTogeyBpbmRleDogbnVtYmVyOyBsZW5ndGg6IG51bWJlciB9LCBtYXRjaDI6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSkge1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoMS5pbmRleCA8IG1hdGNoMi5pbmRleCArIG1hdGNoMi5sZW5ndGggJiYgbWF0Y2gyLmluZGV4IDwgbWF0Y2gxLmluZGV4ICsgbWF0Y2gxLmxlbmd0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIFsuLi5iYXNpY01hdGNoZXMsIC4uLm1lcmdlTWF0Y2hlc10uZm9yRWFjaChtYXRjaCA9PiB7XG4gICAgICAgICAgICBjb25zdCBvdmVybGFwcGluZ0luZGV4ID0gbWF0Y2hlcy5maW5kSW5kZXgoZXhpc3RpbmdNYXRjaCA9PiBpc092ZXJsYXBwaW5nKGV4aXN0aW5nTWF0Y2gsIG1hdGNoKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChvdmVybGFwcGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nTWF0Y2ggPSBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBjdXJyZW50IG1hdGNoIGNvdmVycyBhIGxhcmdlciByYW5nZSwgcmVwbGFjZSB0aGUgZXhpc3Rpbmcgb25lXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA+IGV4aXN0aW5nTWF0Y2gubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXNbb3ZlcmxhcHBpbmdJbmRleF0gPSBtYXRjaDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1hdGNoZXMucHVzaChtYXRjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgLy8gU3RlcCAzOiBTb3J0IHRoZSBmaW5hbCBtYXRjaGVzIGJ5IGluZGV4XG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xuICAgICAgICBcbiAgICAgICAgLy8gU3RlcCA0OiBWYWxpZGF0ZSB0aGUgcmVzdWx0XG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29vcmRpbmF0ZSBpcyBub3QgdmFsaWQ7IGV4cGVjdGVkIGEgdmFsaWQgY29vcmRpbmF0ZS5cIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdGNoZXM7XG4gICAgICAgIFxuICAgIH1cbiAgICBcbiAgICBcbiAgICBcblxuICAgIHByb2plY3Rpb24oYXhpczE6IEF4aXN8dW5kZWZpbmVkLGF4aXMyOiBBeGlzfHVuZGVmaW5lZCk6YW55e1xuICAgICAgICBpZiAoIWF4aXMxfHwhYXhpczIpe3Rocm93IG5ldyBFcnJvcihcImF4aXMncyB3ZXJlIHVuZGVmaW5lZCBhdCBwcm9qZWN0aW9uXCIpO31cbiAgICAgICAgcmV0dXJuIFt7WDogYXhpczEuY2FydGVzaWFuWCxZOiBheGlzMi5jYXJ0ZXNpYW5ZfSx7WDogYXhpczIuY2FydGVzaWFuWCxZOiBheGlzMS5jYXJ0ZXNpYW5ZfV1cbiAgICB9XG5cbiAgICBjb21iaW5lKGNvb3JkaW5hdGVBcnI6IGFueSl7XG4gICAgICAgIGxldCB4PTAseT0wO1xuICAgICAgICBjb29yZGluYXRlQXJyLmZvckVhY2goKGNvb3JkaW5hdGU6IEF4aXMpPT57XG4gICAgICAgICAgICB4Kz1jb29yZGluYXRlLmNhcnRlc2lhblg7XG4gICAgICAgICAgICB5Kz1jb29yZGluYXRlLmNhcnRlc2lhblk7XG4gICAgICAgIH0pXG4gICAgICAgIFxuICAgICAgICB0aGlzLmNhcnRlc2lhblg9eDt0aGlzLmNhcnRlc2lhblk9eTtcbiAgICB9XG4gICAgYWRkQ2FydGVzaWFuKHg6IHN0cmluZyB8IG51bWJlciwgeT86IG51bWJlcik6IHZvaWQge1xuICAgICAgICBcbiAgICAgICAgaWYgKCF5ICYmIHR5cGVvZiB4ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBbeCwgeV0gPSB4LnNwbGl0KFwiLFwiKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeCA9PT0gdW5kZWZpbmVkIHx8IHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBDYXJ0ZXNpYW4gY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2FydGVzaWFuWCA9IHggYXMgbnVtYmVyO1xuICAgICAgICB0aGlzLmNhcnRlc2lhblkgPSB5IGFzIG51bWJlcjtcbiAgICB9XG4gICAgXG4gICAgcG9sYXJUb0NhcnRlc2lhbigpe1xuICAgICAgICBjb25zdCB0ZW1wPXBvbGFyVG9DYXJ0ZXNpYW4odGhpcy5wb2xhckFuZ2xlLCB0aGlzLnBvbGFyTGVuZ3RoKVxuICAgICAgICB0aGlzLmFkZENhcnRlc2lhbih0ZW1wLlgsdGVtcC5ZKVxuICAgIH1cblxuICAgIGNhcnRlc2lhblRvUG9sYXIoKXtcbiAgICAgICAgY29uc3QgdGVtcD1jYXJ0ZXNpYW5Ub1BvbGFyKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZKVxuICAgICAgICB0aGlzLmFkZFBvbGFyKHRlbXAuYW5nbGUsdGVtcC5sZW5ndGgpXG4gICAgfVxuXG4gICAgYWRkUG9sYXIoYW5nbGU6IHN0cmluZyB8IG51bWJlciwgbGVuZ3RoPzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICghbGVuZ3RoICYmIHR5cGVvZiBhbmdsZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgW2FuZ2xlLCBsZW5ndGhdID0gYW5nbGUuc3BsaXQoXCI6XCIpLm1hcChOdW1iZXIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhbmdsZSA9PT0gdW5kZWZpbmVkIHx8IGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHBvbGFyIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBvbGFyQW5nbGUgPSBhbmdsZSBhcyBudW1iZXI7XG4gICAgICAgIHRoaXMucG9sYXJMZW5ndGggPSBsZW5ndGggYXMgbnVtYmVyO1xuICAgIH1cbiAgICBhZGRRdWFkcmFudChtaWRQb2ludDogQXhpcyl7XG4gICAgICAgIGNvbnN0IHg9bWlkUG9pbnQuY2FydGVzaWFuWD50aGlzLmNhcnRlc2lhblg7XG4gICAgICAgIGNvbnN0IHk9bWlkUG9pbnQuY2FydGVzaWFuWT50aGlzLmNhcnRlc2lhblk7XG4gICAgICAgIHRoaXMucXVhZHJhbnQ9eD95PzE6NDp5PzI6MztcbiAgICB9XG4gICAgdG9TdHJpbmdTVkcoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FydGVzaWFuWCtcIiBcIit0aGlzLmNhcnRlc2lhblk7XG4gICAgfVxuICAgIHRvU3RyaW5nKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIsXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xuICAgIH1cblxuICAgIGludGVyc2VjdGlvbihjb29yZDogc3RyaW5nLCBmaW5kT3JpZ2luYWxWYWx1ZTogKGNvb3JkOiBzdHJpbmcpID0+IENvb3JkaW5hdGUgfCB1bmRlZmluZWQpOiB7WDpudW1iZXIsWTpudW1iZXJ9IHtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxDb29yZHMgPSBjb29yZFxuICAgICAgICAgICAgLnJlcGxhY2UoL2ludGVyc2VjdGlvblxccz9vZlxccz8vZywgXCJcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFxzKmFuZFxccz98LS0pL2csIFwiIFwiKVxuICAgICAgICAgICAgLnNwbGl0KFwiIFwiKVxuICAgICAgICAgICAgLm1hcChmaW5kT3JpZ2luYWxWYWx1ZSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHRva2VuKTogdG9rZW4gaXMgQ29vcmRpbmF0ZSA9PiB0b2tlbiAhPT0gdW5kZWZpbmVkKTtcblxuICAgICAgICBpZiAob3JpZ2luYWxDb29yZHMubGVuZ3RoIDwgNCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW50ZXJzZWN0aW9uIGhhZCB1bmRlZmluZWQgY29vcmRpbmF0ZXMgb3IgaW5zdWZmaWNpZW50IGRhdGEuXCIpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zdCBzbG9wZXMgPSBbXG4gICAgICAgICAgICBmaW5kU2xvcGUob3JpZ2luYWxDb29yZHNbMF0uYXhpcyBhcyBBeGlzLCBvcmlnaW5hbENvb3Jkc1sxXS5heGlzIGFzIEF4aXMpLFxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbM10uYXhpcyBhcyBBeGlzKSxcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMl0uYXhpcyBhcyBBeGlzLCBzbG9wZXNbMF0sIHNsb3Blc1sxXSk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9Qb2ludCh2YWx1ZTpudW1iZXIsZm9ybWF0OiBzdHJpbmcpe1xuICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICAgIGNhc2UgXCJQb2ludFwiOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICBjYXNlIFwiY21cIjogXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqMjguMzQ2O1xuICAgICAgICBjYXNlIFwibW1cIjpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSogMi44MzQ2O1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidW5rbm9uIGZvcm1hdFwiKTtcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gbWF0Y2hLZXlXaXRoVmFsdWUoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHZhbHVlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICBcImFuY2hvclwiOiBcImFuY2hvcj1cIixcbiAgICAgICAgXCJyb3RhdGVcIjogXCJyb3RhdGU9XCIsXG4gICAgICAgIFwibGluZVdpZHRoXCI6IFwibGluZSB3aWR0aD1cIixcbiAgICAgICAgXCJmaWxsXCI6IFwiZmlsbD1cIixcbiAgICAgICAgXCJmaWxsT3BhY2l0eVwiOiBcImZpbGwgb3BhY2l0eT1cIixcbiAgICAgICAgXCJ0ZXh0T3BhY2l0eVwiOiBcInRleHQgb3BhY2l0eT1cIixcbiAgICAgICAgXCJ0ZXh0Q29sb3JcIjogXCJ0ZXh0IGNvbG9yPVwiLFxuICAgICAgICBcImRyYXdcIjogXCJkcmF3PVwiLFxuICAgICAgICBcInRleHRcIjogXCJ0ZXh0PVwiLFxuICAgICAgICBcInBvc1wiOiBcInBvcz1cIixcbiAgICAgICAgXCJzY2FsZVwiOiBcInNjYWxlPVwiLFxuICAgICAgICBcImRlY29yYXRlXCI6IFwiZGVjb3JhdGVcIixcbiAgICAgICAgXCJzbG9wZWRcIjogXCJzbG9wZWRcIixcbiAgICAgICAgXCJkZWNvcmF0aW9uXCI6IFwiZGVjb3JhdGlvbj1cIixcbiAgICAgICAgXCJicmFjZVwiOiBcImJyYWNlXCIsXG4gICAgICAgIFwiYW1wbGl0dWRlXCI6IFwiYW1wbGl0dWRlPVwiLFxuICAgICAgICBcImFuZ2xlUmFkaXVzXCI6IFwiYW5nbGUgcmFkaXVzPVwiLFxuICAgICAgICBcImFuZ2xlRWNjZW50cmljaXR5XCI6IFwiYW5nbGUgZWNjZW50cmljaXR5PVwiLFxuICAgICAgICBcImZvbnRcIjogXCJmb250PVwiLFxuICAgICAgICBcInBpY1RleHRcIjogXCJwaWMgdGV4dD1cIixcbiAgICAgICAgXCJsYWJlbFwiOiBcImxhYmVsPVwiLFxuICAgICAgICBcImZyZWVGb3JtVGV4dFwiOiAnOicsXG4gICAgfTtcblxuICAgIHJldHVybiB2YWx1ZU1hcFtrZXldIHx8ICcnO1xufVxuXG5cbnR5cGUgRGVjb3JhdGlvbiA9IHtcbiAgICBicmFjZT86IGJvb2xlYW47XG4gICAgY29pbDogYm9vbGVhbjtcbiAgICBhbXBsaXR1ZGU/OiBudW1iZXI7XG4gICAgYXNwZWN0PzogbnVtYmVyO1xuICAgIHNlZ21lbnRMZW5ndGg/OiBudW1iZXI7XG4gICAgZGVjb3JhdGlvbj86IERlY29yYXRpb247IFxufTtcblxudHlwZSBMYWJlbCA9IHtcbiAgICBmcmVlRm9ybVRleHQ/OiBzdHJpbmc7XG4gICAgY29sb3I/OiBzdHJpbmc7XG4gICAgb3BhY2l0eT86IG51bWJlclxufTtcbmNvbnN0IGRlZmF1bHRWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIGFueT4gPSB7XG4gICAgZnJlZUZvcm1UZXh0OiBcIlwiLFxuICAgIGNvbG9yOiBcIlwiLFxuICAgIG9wYWNpdHk6IDEsXG59O1xuXG5mdW5jdGlvbiBsaW5lV2lkdGhDb252ZXJ0ZXIod2lkdGg6IHN0cmluZyl7XG4gICAgcmV0dXJuIE51bWJlcih3aWR0aC5yZXBsYWNlKC91bHRyYVxccyp0aGluLyxcIjAuMVwiKVxuICAgIC5yZXBsYWNlKC92ZXJ5XFxzKnRoaW4vLFwiMC4yXCIpXG4gICAgLnJlcGxhY2UoL3RoaW4vLFwiMC40XCIpXG4gICAgLnJlcGxhY2UoL3NlbWl0aGljay8sXCIwLjZcIilcbiAgICAucmVwbGFjZSgvdGhpY2svLFwiMC44XCIpXG4gICAgLnJlcGxhY2UoL3ZlcnlcXHMqdGhpY2svLFwiMS4yXCIpXG4gICAgLnJlcGxhY2UoL3VsdHJhXFxzKnRoaWNrLyxcIjEuNlwiKSlcbn1cblxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XG4gICAgLy8gaW1wb3J0ZW50IG5lZWRzIHRvIGJlIGZvcnN0XG4gICAgcGF0aD86IHN0cmluZztcblxuICAgIHNjYWxlOiBudW1iZXI7XG4gICAgcm90YXRlPzogbnVtYmVyO1xuICAgIGxpbmVXaWR0aD86IG51bWJlcj0wLjQ7XG4gICAgdGV4dE9wYWNpdHk6IG51bWJlcjtcbiAgICBvcGFjaXR5PzogbnVtYmVyO1xuICAgIGZpbGxPcGFjaXR5PzogbnVtYmVyO1xuICAgIHBvcz86IG51bWJlcjtcbiAgICBhbmdsZUVjY2VudHJpY2l0eT86IG51bWJlcjtcbiAgICBhbmdsZVJhZGl1cz86IG51bWJlcjtcbiAgICBsZXZlbERpc3RhbmNlPzogbnVtYmVyO1xuXG4gICAgbW9kZTogc3RyaW5nO1xuICAgIGFuY2hvcj86IHN0cmluZztcbiAgICBjb2xvcj86IHN0cmluZztcbiAgICB0ZXh0Q29sb3I/OiBzdHJpbmc7XG4gICAgZmlsbD86IHN0cmluZztcbiAgICBhcnJvdz86IHN0cmluZztcbiAgICBkcmF3Pzogc3RyaW5nO1xuICAgIHRleHQ/OiBzdHJpbmc7XG4gICAgdGlrenNldD86IHN0cmluZztcbiAgICBwb3NpdGlvbj86IHN0cmluZztcbiAgICBsaW5lU3R5bGU/OiBzdHJpbmc7XG4gICAgZm9udD86IHN0cmluZztcbiAgICBwaWNUZXh0Pzogc3RyaW5nO1xuICAgIFxuICAgIHNsb3BlZD86IGJvb2xlYW47XG4gICAgZGVjb3JhdGU/OiBib29sZWFuO1xuICAgIGxhYmVsPzogTGFiZWw7XG4gICAgZGVjb3JhdGlvbj86IERlY29yYXRpb247XG5cbiAgICBjb25zdHJ1Y3Rvcihmb3JtYXR0aW5nOiBhbnlbXSxtb2RlPzogc3RyaW5nKXtcbiAgICAgICAgaWYobW9kZSl0aGlzLm1vZGU9bW9kZTtcbiAgICAgICAgdGhpcy5hc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmd8fFtdKTtcbiAgICB9XG5cblxuICAgIGFzc2lnbkZvcm1hdHRpbmcoXG4gICAgICAgIGZvcm1hdHRpbmdBcnI6IEFycmF5PHsga2V5OiBzdHJpbmc7IHZhbHVlOiBhbnkgfT4sXG4gICAgICAgIHRhcmdldFNjb3BlOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0gdGhpc1xuICAgICkge1xuICAgICAgICBmb3IgKGNvbnN0IHsga2V5LCB2YWx1ZSB9IG9mIGZvcm1hdHRpbmdBcnIpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZEtleSA9IE9iamVjdC5rZXlzKHRhcmdldFNjb3BlKS5maW5kKFxuICAgICAgICAgICAgICAgIChwcm9wKSA9PiBwcm9wLnRvTG93ZXJDYXNlKCkgPT09IGtleS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgICApIHx8IGtleTtcbiAgICBcbiAgICAgICAgICAgIGlmICh0aGlzLmlzTmVzdGVkKHZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHRhcmdldFNjb3BlW25vcm1hbGl6ZWRLZXldID0gdGFyZ2V0U2NvcGVbbm9ybWFsaXplZEtleV0gfHwgdGhpcy5jcmVhdGVOZXN0ZWQobm9ybWFsaXplZEtleSk7XG4gICAgICAgICAgICAgICAgdGhpcy5hc3NpZ25Gb3JtYXR0aW5nKHZhbHVlLHRhcmdldFNjb3BlW25vcm1hbGl6ZWRLZXldKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICB0YXJnZXRTY29wZVtub3JtYWxpemVkS2V5XT12YWx1ZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIFxuICAgIHNldFByb3BlcnR5KHNjb3BlOiBhbnksIGtleTogYW55LCB2YWx1ZTogYW55KTogdm9pZCB7XG4gICAgICAgIGlmICh0eXBlb2Ygc2NvcGUgPT09IFwib2JqZWN0XCIgJiYgc2NvcGUgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHNjb3BlW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJJbnZhbGlkIHNjb3BlIHByb3ZpZGVkLiBFeHBlY3RlZCBhbiBvYmplY3QgYnV0IHJlY2VpdmVkOlwiLCBzY29wZSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgXG5cbiAgICBjcmVhdGVOZXN0ZWQoa2V5OiBzdHJpbmcpIHtcbiAgICAgICAgc3dpdGNoIChrZXkpIHtcbiAgICAgICAgICAgIGNhc2UgJ2xhYmVsJzpcbiAgICAgICAgICAgICAgICByZXR1cm4geyBjb2xvcjogdW5kZWZpbmVkLCBvcGFjaXR5OiB1bmRlZmluZWQsZnJlZUZvcm1UZXh0OiB1bmRlZmluZWQgfTtcbiAgICAgICAgICAgIGNhc2UgJ2RlY29yYXRpb24nOlxuICAgICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgICAgIGJyYWNlOiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIGNvaWw6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBhbXBsaXR1ZGU6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgYXNwZWN0OiB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIHNlZ21lbnRMZW5ndGg6IHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgZGVjb3JhdGlvbjogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBcbiAgICBpc05lc3RlZCh2YWx1ZTogYW55KXtcbiAgICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkodmFsdWUpICYmIHZhbHVlLnNvbWUoKGl0ZW06IGFueSkgPT4gaXRlbS5rZXkgJiYgaXRlbS52YWx1ZSk7XG4gICAgfVxuICAgIFxuICAgIFxuICAgIFxuXG4gICAgc3BsaXQ8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxuICAgICAgICBrZXk6IEssXG4gICAgICAgIGZvcm1hdHRpbmc6IGFueSxcbiAgICAgICAgbmVzdGVkS2V5PzogTktcbiAgICApOiB2b2lkIHtcbiAgICAgICAgbGV0IHZhbHVlO1xuICAgICAgICBpZih0eXBlb2YgZm9ybWF0dGluZyE9PVwiYm9vbGVhblwiKXtcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IGZvcm1hdHRpbmcuc3BsaXQoXCI9XCIpO1xuICAgIFxuICAgICAgICAgICAgLy8gRW5zdXJlIHRoZSBmb3JtYXR0aW5nIHN0cmluZyBpcyB2YWxpZFxuICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA8IDIgfHwgIW1hdGNoWzFdKSByZXR1cm47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFRyaW0gYW55IHBvdGVudGlhbCB3aGl0ZXNwYWNlIGFyb3VuZCB0aGUgdmFsdWVcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHZhbHVlIGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nXG4gICAgICAgICAgICB2YWx1ZSA9ICFpc05hTihwYXJzZUZsb2F0KHJhd1ZhbHVlKSkgJiYgaXNGaW5pdGUoK3Jhd1ZhbHVlKVxuICAgICAgICAgICAgICAgID8gcGFyc2VGbG9hdChyYXdWYWx1ZSlcbiAgICAgICAgICAgICAgICA6IHJhd1ZhbHVlLnJlcGxhY2UoLy1cXHwvLCdub3J0aCcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2V7XG4gICAgICAgICAgICB2YWx1ZT1mb3JtYXR0aW5nXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vdGhpcy5zZXRQcm9wZXJ0eShrZXksIHZhbHVlLCBuZXN0ZWRLZXkpO1xuICAgIH1cbiAgICBcblxuICAgIFxuXG5cbiAgICBhZGRUaWt6c2V0KHNwbGl0Rm9ybWF0dGluZzogYW55KXtcbiAgICAgICAgY29uc3QgYT1zcGxpdEZvcm1hdHRpbmcuZmluZCgoaXRlbTogc3RyaW5nKT0+IGl0ZW0ubWF0Y2goL21hc3N8YW5nfGhlbHBsaW5lcy8pKVxuICAgICAgICBpZiAoIWEmJiF0aGlzLnRpa3pzZXQpcmV0dXJuO1xuICAgICAgICBpZihhKSB0aGlzLnRpa3pzZXQ9YTtcblxuICAgICAgICBzd2l0Y2ggKHRoaXMudGlrenNldCkge1xuICAgICAgICAgICAgY2FzZSBcIm1hc3NcIjpcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGw9XCJ5ZWxsb3chNjBcIjtcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGg9XCJkcmF3XCI7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0PVwiYmxhY2tcIjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJ2ZWNcIjpcbiAgICAgICAgICAgICAgICB0aGlzLmFycm93PSctPidcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJoZWxwbGluZXNcIjpcbiAgICAgICAgICAgICAgICB0aGlzLmxpbmVXaWR0aD0wLjQ7XG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3PSdncmF5JztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJhbmdcIjpcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGg9J2RyYXcnXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPSdibGFjayE1MCc7XG4gICAgICAgICAgICAgICAgdGhpcy5maWxsT3BhY2l0eT0wLjU7XG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3PSdvcmFuZ2UnXG4gICAgICAgICAgICAgICAgdGhpcy5hcnJvdz0nPC0+J1xuICAgICAgICAgICAgICAgIHRoaXMuYW5nbGVFY2NlbnRyaWNpdHk9MS42O1xuICAgICAgICAgICAgICAgIHRoaXMuYW5nbGVSYWRpdXM9dG9Qb2ludCgwLjUsXCJjbVwiKTtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9J29yYW5nZSc7XG4gICAgICAgICAgICAgICAgdGhpcy5mb250PSdcXFxcbGFyZ2UnO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dE9wYWNpdHk9MC45O1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhZGRTcGxvcEFuZFBvc2l0aW9uKGFycjogYW55LGluZGV4OiBudW1iZXIpe1xuICAgICAgICBjb25zdCBiZWZvcmVBZnRlcj1maW5kQmVmb3JlQWZ0ZXJBeGlzKGFycixpbmRleCk7XG4gICAgICAgIGNvbnN0IFtiZWZvcmUsIGFmdGVyXT1bYXJyW2JlZm9yZUFmdGVyLmJlZm9yZV0sYXJyW2JlZm9yZUFmdGVyLmFmdGVyXV1cbiAgICAgICAgaWYgKHRoaXMucG9zaXRpb258fHRoaXMuc2xvcGVkKXtyZXR1cm59XG4gICAgXG4gICAgICAgIGNvbnN0IGVkZ2UxID0gYmVmb3JlLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xuICAgICAgICBjb25zdCBlZGdlMiA9IGFmdGVyLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xuICAgICAgICBjb25zdCBzbG9wZT1maW5kU2xvcGUoYmVmb3JlLGFmdGVyKVxuXG4gICAgICAgIHRoaXMuc2xvcGVkID0gc2xvcGUgIT09IDAmJnNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5O1xuXG4gICAgICAgIGxldCBxdWFkcmFudFxuXG4gICAgICAgIGlmIChlZGdlMSE9PWVkZ2UyKVxuICAgICAgICAgICAgcXVhZHJhbnQ9ZWRnZTErZWRnZTI7XG4gICAgICAgIGVsc2UgXG4gICAgICAgICAgICBxdWFkcmFudD1lZGdlMTtcblxuICAgICAgICAvL3NpbnQgcGFyYWxsZWwgdG8gWSBheGlzXG4gICAgICAgIGlmIChzbG9wZSE9PUluZmluaXR5JiZzbG9wZSE9PS1JbmZpbml0eSl7XG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uID0gcXVhZHJhbnQucmVwbGFjZSgvKDN8NCkvLFwiYmVsb3dcIikucmVwbGFjZSgvKDF8MikvLFwiYWJvdmVcIikucmVwbGFjZSgvKGJlbG93YWJvdmV8YWJvdmViZWxvdykvLFwiXCIpXG4gICAgICAgIH1cbiAgICAgICAgLy9pc250IHBhcmFsbGVsIHRvIFggYXhpc1xuICAgICAgICBpZiAoc2xvcGUgIT09IDApe1xuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbj10aGlzLnBvc2l0aW9uP3RoaXMucG9zaXRpb246Jyc7XG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uKz1xdWFkcmFudC5yZXBsYWNlKC8oMXw0KS8sXCJyaWdodFwiKS5yZXBsYWNlKC8oMnwzKS8sXCJsZWZ0XCIpLnJlcGxhY2UoLyhyaWdodGxlZnR8bGVmdHJpZ2h0KS8sXCJcIilcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbj8ucmVwbGFjZSgvW1xcZF0rL2csXCJcIikucmVwbGFjZSgvKGJlbG93fGFib3ZlKShyaWdodHxsZWZ0KS8sXCIkMSAkMlwiKTtcbiAgICB9XG5cbiAgICBcbiAgICBcblxuICAgIGludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZ1N0cmluZzogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHNwbGl0Rm9ybWF0dGluZyA9IGZvcm1hdHRpbmdTdHJpbmcucmVwbGFjZSgvXFxzL2csIFwiXCIpLm1hdGNoKC8oPzp7W159XSp9fFteLHt9XSspKy9nKSB8fCBbXTtcbiAgICBcbiAgICAgICAgdGhpcy5hZGRUaWt6c2V0KHNwbGl0Rm9ybWF0dGluZyk7XG4gICAgXG4gICAgICAgIGNvbnN0IHBhdHRlcm5zOiBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IHN0cmluZykgPT4gdm9pZD4gPSB7XG4gICAgICAgICAgICBcImxpbmV3aWR0aFwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJsaW5lV2lkdGhcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJmaWxsPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJmaWxsXCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXmZpbGxvcGFjaXR5XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImZpbGxPcGFjaXR5XCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXigtPnw8LXwtKntTdGVhbHRofS0qKSRcIjogKHZhbHVlKSA9PiB7IHRoaXMuYXJyb3cgPSB2YWx1ZTsgfSxcbiAgICAgICAgICAgIFwiXihhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KXsxLDJ9JFwiOiAodmFsdWUpID0+IHsgdGhpcy5wb3NpdGlvbiA9IHZhbHVlLnJlcGxhY2UoLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8sIFwiJDEgXCIpOyB9LFxuICAgICAgICAgICAgXCJecG9zPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJwb3NcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeZHJhdz1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZHJhd1wiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5kZWNvcmF0ZSRcIjogKCkgPT4geyB0aGlzLmRlY29yYXRlID0gdHJ1ZTsgfSxcbiAgICAgICAgICAgIFwiXnRleHQ9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcInRleHRcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeYW5jaG9yPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJhbmNob3JcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeXFxcIl5cXFwiJFwiOiAoKSA9PiB0aGlzLnNldFByb3BlcnR5KFwibGFiZWxcIix0cnVlLFwiZnJlZUZvcm1UZXh0XCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImxhYmVsXCJdPiksXG4gICAgICAgICAgICBcIl5icmFjZSRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxuICAgICAgICAgICAgXCJeYW1wbGl0dWRlXCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImRlY29yYXRpb25cIiwgdmFsdWUsIFwiYW1wbGl0dWRlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+KSxcbiAgICAgICAgICAgIFwiXmRyYXckXCI6ICh2YWx1ZSkgPT4geyB0aGlzLnBhdGggPSB2YWx1ZTsgfSxcbiAgICAgICAgICAgIFwiXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxcXGQuXSspezEsNX0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmNvbG9yID0gdmFsdWU7IH0sXG4gICAgICAgICAgICBcIl4oZG90dGVkfGRhc2hlZHxzbW9vdGh8ZGVuc2VseXxsb29zZWx5KXsxLDJ9JFwiOiAodmFsdWUpID0+IHsgdGhpcy5saW5lU3R5bGUgPSB2YWx1ZS5yZXBsYWNlKC8oZGVuc2VseXxsb29zZWx5KS8sIFwiJDEgXCIpOyB9LFxuICAgICAgICB9O1xuXG4gICAgICAgIHNwbGl0Rm9ybWF0dGluZy5mb3JFYWNoKGZvcm1hdHRpbmcgPT4gey8qXG4gICAgICAgICAgICAvLyBIYW5kbGUgbmVzdGVkIHByb3BlcnRpZXNcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZm9ybWF0dGluZy5tYXRjaCgvXihbXj1dKyk9eyguKil9JC8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgW18sIHBhcmVudCwgY2hpbGRyZW5dID0gbWF0Y2g7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nT2JqID0gdGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICAgICAgICAgICAgICAgIGlmICghZm9ybWF0dGluZ09ialtwYXJlbnRdKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpbcGFyZW50XSA9IHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZWRDaGlsZCA9IG5ldyBGb3JtYXR0aW5nKHRoaXMubW9kZSx7fSxjaGlsZHJlbik7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihmb3JtYXR0aW5nT2JqW3BhcmVudF0sIChwYXJzZWRDaGlsZCBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+KVtwYXJlbnRdKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3BhdHRlcm4sIGhhbmRsZXJdIG9mIE9iamVjdC5lbnRyaWVzKHBhdHRlcm5zKSkge1xuICAgICAgICAgICAgICAgIGlmIChuZXcgUmVnRXhwKHBhdHRlcm4pLnRlc3QoZm9ybWF0dGluZykpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlcihmb3JtYXR0aW5nKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0qL1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgXG5cbiAgICB0b1N0cmluZyhvYmo/OiBhbnkpOiBzdHJpbmcge1xuICAgICAgICBsZXQgc3RyaW5nPW9iaj8neyc6J1snO1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmo/b2JqOnRoaXMpKSB7XG4gICAgICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eKG1vZGV8dGlrenNldCkkLykpe2NvbnRpbnVlO31cbiAgICAgICAgICAgIGlmKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcmJnZhbHVlKXtcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW1hdGNoS2V5V2l0aFZhbHVlKGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nKSt0aGlzLnRvU3RyaW5nKHZhbHVlKSsnLCdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrKHR5cGVvZiB2YWx1ZT09PVwiYm9vbGVhblwiPycnOnZhbHVlKSsnLCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZysob2JqPyd9JzonXScpO1xuICAgIH1cblxuICAgIGhhbmRsZU9iamVjdFRvU3RyaW5nKG9iajogb2JqZWN0LCBwYXJlbnRLZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xuICAgIH1cbn1cblxudHlwZSBNb2RlID0gXCJjb29yZGluYXRlXCIgfCBcImNvb3JkaW5hdGUtaW5saW5lXCIgfCBcIm5vZGVcIiB8IFwibm9kZS1pbmxpbmVcIjtcblxuZXhwb3J0IGNsYXNzIENvb3JkaW5hdGUge1xuICAgIG1vZGU6IE1vZGVcbiAgICBheGlzPzogQXhpc1xuICAgIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nXG4gICAgdmFyaWFibGU/OiBBeGlzXG4gICAgbGFiZWw/OiBzdHJpbmdcbiAgICBcbiAgY29uc3RydWN0b3IobW9kZTogTW9kZSxheGlzPzogQXhpcyxmb3JtYXR0aW5nPzogRm9ybWF0dGluZyx2YXJpYWJsZT86IEF4aXMsbGFiZWw/OiBzdHJpbmcsKSB7XG4gICAgdGhpcy5tb2RlPW1vZGU7XG4gICAgdGhpcy5heGlzPWF4aXM7XG4gICAgdGhpcy5mb3JtYXR0aW5nPWZvcm1hdHRpbmc7XG4gICAgdGhpcy52YXJpYWJsZT12YXJpYWJsZTtcbiAgICB0aGlzLmxhYmVsPWxhYmVsO1xuICB9XG4gICAgaW50ZXJwcmV0Q29vcmRpbmF0ZShjb29yZGluYXRlczogYW55W10pe1xuICAgICAgICBjb25zdCBmb3JtYXR0aW5nPWNvb3JkaW5hdGVzLmZpbmQoY29vcj0+Y29vciBpbnN0YW5jZW9mIEZvcm1hdHRpbmcpXG4gICAgICAgIGNvbnN0IGF4aXM9Y29vcmRpbmF0ZXMuZmluZChjb29yPT5jb29yIGluc3RhbmNlb2YgQXhpcylcbiAgICAgICAgY29uc3QgdmFyaWFibGU9Y29vcmRpbmF0ZXMuZmluZChjb29yPT5jb29yPy50eXBlPT09J3ZhcmlhYmxlJykudmFsdWVcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nPWZvcm1hdHRpbmc7XG4gICAgICAgIHRoaXMuYXhpcz1heGlzXG4gICAgICAgIHRoaXMudmFyaWFibGU9dmFyaWFibGVcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG4gICAgY2xvbmUoKTogQ29vcmRpbmF0ZSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29vcmRpbmF0ZShcbiAgICAgICAgICAgIHRoaXMubW9kZSxcbiAgICAgICAgICAgIHRoaXMuYXhpcyA/IHRoaXMuYXhpcy5jbG9uZSgpIDp1bmRlZmluZWQsXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmcsXG4gICAgICAgICAgICB0aGlzLnZhcmlhYmxlLFxuICAgICAgICAgICAgdGhpcy5sYWJlbCxcbiAgICAgICAgKTtcbiAgICB9XG5cbiAgICBhZGRBeGlzKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyKXtcbiAgICAgICAgdGhpcy5heGlzPW5ldyBBeGlzKGNhcnRlc2lhblgsIGNhcnRlc2lhblksIHBvbGFyTGVuZ3RoLCBwb2xhckFuZ2xlKTtcbiAgICB9XG5cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5tb2RlKVxuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xuICAgICAgICAgICAgY2FzZSBcImNvb3JkaW5hdGVcIjpcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5heGlzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm5gXFxcXGNvb3JkaW5hdGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9ICgke3RoaXMudmFyaWFibGUgfHwgXCJcIn0pIGF0ICgke3RoaXMuYXhpcy50b1N0cmluZygpfSk7YFxuICAgICAgICAgICAgY2FzZSBcIm5vZGVcIjpcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5heGlzKXt9XG4gICAgICAgICAgICAgICAgICAgIC8vcmV0dXJuIGBcXFxcbm9kZSAke3RoaXMuY29vcmRpbmF0ZU5hbWU/JygnK3RoaXMuY29vcmRpbmF0ZU5hbWUrJyknOicnfSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfHwnJ30geyR7dGhpcy5sYWJlbH19O2BcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLWlubGluZVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBgbm9kZSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKSB8fCAnJ30geyR7dGhpcy5sYWJlbCB8fCAnJ319YFxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIG1vZGUgYXQgdG8gc3RyaW5nIGNvb3JkaW5hdGVcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbn1cblxuZXhwb3J0IHR5cGUgVG9rZW4gPUF4aXMgfCBDb29yZGluYXRlIHxEcmF3fEZvcm1hdHRpbmd8IHN0cmluZztcblxuZXhwb3J0IGNsYXNzIERyYXcge1xuICAgIG1vZGU6IHN0cmluZ1xuICAgIGZvcm1hdHRpbmc6IEZvcm1hdHRpbmc7XG4gICAgY29vcmRpbmF0ZXM6IGFueVtdPVtdO1xuXG5cbiAgICBjb25zdHJ1Y3Rvcihtb2RlOiBzdHJpbmcsZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsY29vcmRpbmF0ZXM/OiBhbnlbXSwgdG9rZW5zPzogRm9ybWF0VGlrempheCwpIHs7XG4gICAgICAgIHRoaXMubW9kZT1tb2RlO1xuICAgICAgICBpZihmb3JtYXR0aW5nKVxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPWZvcm1hdHRpbmc7XG4gICAgICAgIGlmKGNvb3JkaW5hdGVzKVxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcz1jb29yZGluYXRlcztcbiAgICB9XG4gICAgY3JlYXRlRnJvbUFycmF5KGFycjogYW55KXsvKlxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XG4gICAgICAgIGZvciAobGV0IGk9MDtpPGFyci5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGlmIChhcnJbaV0gaW5zdGFuY2VvZiBBeGlzfHxhcnJbaV0gaW5zdGFuY2VvZiBDb29yZGluYXRlKXtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYodHlwZW9mIGFycj09PVwic3RyaW5nXCIpe1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaChhcnJbaV0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5OyovXG4gICAgfVxuXG4gICAgZmlsbENvb3JkaW5hdGVzKHNjaGVtYXRpYzogYW55W10sIHRva2Vucz86IEZvcm1hdFRpa3pqYXgpIHtcbiAgICAgICAgaWYoc2NoZW1hdGljWzBdIGluc3RhbmNlb2YgRm9ybWF0dGluZyl7XG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9c2NoZW1hdGljWzBdXG4gICAgICAgICAgICBzY2hlbWF0aWMuc3BsaWNlKDAsMSlcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZWZlcmVuY2VGaXJzdEF4aXNNYXAgPSBzY2hlbWF0aWNcbiAgICAgICAgICAgIC5tYXAoKGNvb3IsIGluZGV4KSA9PiAoY29vciBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuICYmIGNvb3IubmFtZSA9PT0gJ1JlZmVyZW5jZUZpcnN0QXhpcycgPyBpbmRleCA6IG51bGwpKVxuICAgICAgICAgICAgLmZpbHRlcigodCk6IHQgaXMgbnVtYmVyID0+IHQgIT09IG51bGwpOyBcblxuICAgICAgICBjb25zdCByZWZlcmVuY2VMYXN0QXhpc01hcCA9IHNjaGVtYXRpY1xuICAgICAgICAgICAgLm1hcCgoY29vciwgaW5kZXgpID0+IChjb29yIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgY29vci5uYW1lID09PSAnUmVmZXJlbmNlTGFzdEF4aXMnID8gaW5kZXggOiBudWxsKSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpOiB0IGlzIG51bWJlciA9PiB0ICE9PSBudWxsKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IG1hcHBlZFJlZmVyZW5jZXMgPSByZWZlcmVuY2VGaXJzdEF4aXNNYXAubWFwKGluZGV4ID0+IHtcbiAgICAgICAgICAgIHNjaGVtYXRpY1tpbmRleF0ubmFtZT0nQXhpc0Nvbm5lY3RlcidcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzSW5kZXggPSBzY2hlbWF0aWMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XG4gICAgICAgICAgICBjb25zdCBuZXh0QXhpcyA9IG5leHRBeGlzSW5kZXggIT09IC0xID8gc2NoZW1hdGljW2luZGV4ICsgMSArIG5leHRBeGlzSW5kZXhdIDogbnVsbDtcbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gbmV4dEF4aXM7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcHMgPSByZWZlcmVuY2VMYXN0QXhpc01hcC5tYXAoaW5kZXggPT4ge1xuICAgICAgICAgICAgc2NoZW1hdGljW2luZGV4XS5uYW1lPSdBeGlzQ29ubmVjdGVyJ1xuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXNJbmRleCA9IHNjaGVtYXRpYy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzID0gbmV4dEF4aXNJbmRleCAhPT0gLTEgPyBzY2hlbWF0aWNbaW5kZXggKyAxICsgbmV4dEF4aXNJbmRleF0gOiBudWxsO1xuXG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0F4aXNJbmRleCA9IHNjaGVtYXRpY1xuICAgICAgICAgICAgICAgIC5zbGljZSgwLCBpbmRleClcbiAgICAgICAgICAgICAgICAucmV2ZXJzZSgpXG4gICAgICAgICAgICAgICAgLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcblxuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNBeGlzID0gcHJldmlvdXNBeGlzSW5kZXggIT09IC0xID8gc2NoZW1hdGljW2luZGV4IC0gMSAtIHByZXZpb3VzQXhpc0luZGV4XSA6IG51bGw7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcmVmZXJlbmNlRmlyc3RBeGlzOiBzY2hlbWF0aWNbaW5kZXhdLFxuICAgICAgICAgICAgICAgIHByZXZpb3VzQXhpcyxcbiAgICAgICAgICAgICAgICBuZXh0QXhpcyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgICBpZihtYXBwZWRSZWZlcmVuY2VzLmxlbmd0aD4wKXtcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0QXhpcz1zY2hlbWF0aWMuZmluZCh0PT50IGluc3RhbmNlb2YgQXhpcylcbiAgICAgICAgICAgIG1hcHBlZFJlZmVyZW5jZXMuZm9yRWFjaChheGlzID0+IHtcbiAgICAgICAgICAgICAgICBheGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoZmlyc3RBeGlzLFwiYWRkaXRpb25cIilcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jb29yZGluYXRlcz1zY2hlbWF0aWM7XG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgICAgIFxuICAgICAgICAvKlxuICAgICAgICBjb25zdCBjb29yQXJyOiBBcnJheTxUb2tlbj49W107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NoZW1hdGljLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XG4gICAgICAgICAgICAgICAgbGV0IHByZXZpb3VzRm9ybWF0dGluZztcblxuICAgICAgICAgICAgICAgIGlmIChpID4gMCAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMV0udmFsdWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID4gMSAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwibm9kZVwiICYmIHNjaGVtYXRpY1tpIC0gMl0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAyXS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBBeGlzKCkudW5pdmVyc2FsKHNjaGVtYXRpY1tpXS52YWx1ZSwgdG9rZW5zLCBjb29yQXJyLCBwcmV2aW91c0Zvcm1hdHRpbmcsICkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHNjaGVtYXRpY1tpXS50eXBlID09PSBcIm5vZGVcIil7XG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBDb29yZGluYXRlKHtsYWJlbDogc2NoZW1hdGljW2ldLnZhbHVlLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZS1pbmxpbmVcIix7fSxzY2hlbWF0aWNbaV0uZm9ybWF0dGluZyksbW9kZTogXCJub2RlLWlubGluZVwifSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2goc2NoZW1hdGljW2ldLnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29vckFycjsqL1xuICAgIH1cblxuICAgIGdldFNjaGVtYXRpYyhkcmF3OiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVnZXg9Z2V0UmVnZXgoKTtcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xuICAgICAgICBjb25zdCBub2RlUmVnZXggPSByZWdFeHAoU3RyaW5nLnJhd2Bub2RlXFxzKlxcWz8oJHtyZWdleC5mb3JtYXR0aW5nfSopXFxdP1xccyp7KCR7cmVnZXgudGV4dH0qKX1gKTtcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ1JlZ2V4ID0gLygtLWN5Y2xlfGN5Y2xlfC0tXFwrXFwrfC0tXFwrfC0tfC1cXHx8XFx8LXxncmlkfGNpcmNsZXxyZWN0YW5nbGUpLztcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxcc1xcLSwuOmA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YChcXChbJHtjYX1dK1xcKXxcXChcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K1xcLV0rXFwoWyR7Y2F9XStcXClcXCRcXCkpYCk7XG4gICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgbGV0IGxvb3BzID0gMDtcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIChpIDwgZHJhdy5sZW5ndGggJiYgbG9vcHMgPCAxMDApIHsgLy8gSW5jcmVhc2UgbG9vcCBsaW1pdCBvciBhZGQgY29uZGl0aW9uIGJhc2VkIG9uIHBhcnNlZCBsZW5ndGhcbiAgICAgICAgICAgIGxvb3BzKys7XG4gICAgICAgICAgICBjb25zdCBjb29yZGluYXRlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGNvb3JkaW5hdGVSZWdleCk7XG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVNYXRjaD8uaW5kZXggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImNvb3JkaW5hdGVcIiwgdmFsdWU6IGNvb3JkaW5hdGVNYXRjaFsxXSB9KTtcbiAgICAgICAgICAgICAgICBpICs9IGNvb3JkaW5hdGVNYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2goZm9ybWF0dGluZ1JlZ2V4KTtcbiAgICAgICAgICAgIGlmIChmb3JtYXR0aW5nTWF0Y2g/LmluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgaSArPSBmb3JtYXR0aW5nTWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiZm9ybWF0dGluZ1wiLCB2YWx1ZTogZm9ybWF0dGluZ01hdGNoWzBdIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKG5vZGVSZWdleCk7XG4gICAgICAgICAgICBpZiAobm9kZU1hdGNoPy5pbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwibm9kZVwiLFxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBub2RlTWF0Y2hbMV0gfHwgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG5vZGVNYXRjaFsyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGkgKz0gbm9kZU1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAobG9vcHMgPT09IDEwMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUGFyc2luZyBleGNlZWRlZCBzYWZlIGxvb3AgY291bnRcIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7XG4gICAgfVxuXG4gICAgaXNDb29yZGluYXRlKG9iajogYW55KTogb2JqIGlzIENvb3JkaW5hdGUge1xuICAgICAgICByZXR1cm4gb2JqICYmIG9iaiBpbnN0YW5jZW9mIENvb3JkaW5hdGU7XG4gICAgfVxuICAgIHRvU3RyaW5nRHJhdygpe1xuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3ICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSBgO1xuICAgICAgICB0aGlzLmNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSYmY29vcmRpbmF0ZS5tb2RlPT09XCJub2RlLWlubGluZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBjb29yZGluYXRlLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlIGNvb3JkaW5hdGUgaW5zdGFuY2VvZiBCYXNpY1Rpa3pUb2tlbjoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz1gKCR7Y29vcmRpbmF0ZS50b1N0cmluZygpfSlgXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xuICAgIH1cblxuICAgIHRvU3RyaW5nUGljKCl7XG4gICAgICAgIGxldCByZXN1bHQgPSBgXFxcXGRyYXcgcGljICR7dGhpcy5mb3JtYXR0aW5nLnRvU3RyaW5nKCl8fCcnfSB7YW5nbGUgPSAkeyh0aGlzLmNvb3JkaW5hdGVzWzBdIGFzIEF4aXMpLm5hbWV9LS0keyh0aGlzLmNvb3JkaW5hdGVzWzFdIGFzIEF4aXMpLm5hbWV9LS0keyh0aGlzLmNvb3JkaW5hdGVzWzJdIGFzIEF4aXMpLm5hbWV9fSBgO1xuICAgICBcblxuICAgICAgICByZXR1cm4gcmVzdWx0ICsgXCI7XCI7XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIGlmICh0aGlzLm1vZGU9PT0nZHJhdycpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ0RyYXcoKTtcbiAgICAgICAgaWYodGhpcy5tb2RlPT09J2RyYXctcGljLWFuZycpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ1BpYygpXG4gICAgICAgIFxuICAgIH1cbn1cblxuXG5cbiAgXG5cblxuXG5cblxuXG5mdW5jdGlvbiBkaXNzZWN0WFlheGlzKG1hdGNoOiBSZWdFeHBNYXRjaEFycmF5KSB7XG4gICAgbGV0IFhub2RlOlJlZ0V4cE1hdGNoQXJyYXl8c3RyaW5nPVwiXCIsIFlub2RlOlJlZ0V4cE1hdGNoQXJyYXl8c3RyaW5nPVwiXCI7XG5cbiAgICBpZiAobWF0Y2hbMV0gJiYgbWF0Y2hbMl0pIHtcbiAgICAgICAgWG5vZGUgPSBtYXRjaFsxXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xuICAgICAgICBZbm9kZSA9IG1hdGNoWzJdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XG4gICAgICAgIFhub2RlPVhub2RlWzBdLnN1YnN0cmluZygxLFhub2RlLmxlbmd0aClcbiAgICAgICAgWW5vZGU9WW5vZGVbMF0uc3Vic3RyaW5nKDEsWW5vZGUubGVuZ3RoKVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgICB0eXBlOiBcInh5YXhpc1wiLFxuICAgICAgICBYZm9ybWF0dGluZzogbWF0Y2hbMV0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxuICAgICAgICBZZm9ybWF0dGluZzogbWF0Y2hbMl0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxuICAgICAgICB4RGlyZWN0aW9uOiBtYXRjaFsxXSAmJiAvLT4vLnRlc3QobWF0Y2hbMV0pID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIsXG4gICAgICAgIHlEaXJlY3Rpb246IG1hdGNoWzJdICYmIC8tPi8udGVzdChtYXRjaFsyXSkgPyBcImRvd25cIiA6IFwidXBcIixcbiAgICAgICAgWG5vZGU6IFhub2RlLFxuICAgICAgICBZbm9kZTogWW5vZGUsXG4gICAgfTtcbn1cblxuXG5cblxuXG5cblxuXG5cblxuXG5cbi8qXG5mdW5jdGlvbiBnZW5lcmF0ZUZvcm1hdHRpbmcoY29vcmRpbmF0ZTogQ29vcmRpbmF0ZSl7XG4gICAgaWYgKHR5cGVvZiBjb29yZGluYXRlLmxhYmVsICE9PSBcInN0cmluZ1wiKXsgcmV0dXJuIFwiXCI7IH1cbiAgICBjb25zdCBmb3JtYXR0aW5nID0gY29vcmRpbmF0ZS5mb3JtYXR0aW5nPy5zcGxpdChcIixcIikgfHwgW107XG4gICAgaWYgKGZvcm1hdHRpbmcuc29tZSgodmFsdWU6IHN0cmluZykgPT4gLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8udGVzdCh2YWx1ZSkpKSB7XG4gICAgICAgIHJldHVybiBjb29yZGluYXRlLmZvcm1hdHRpbmc7XG4gICAgfVxuICAgIGlmKGZvcm1hdHRpbmcubGVuZ3RoPjAmJiFmb3JtYXR0aW5nW2Zvcm1hdHRpbmcubGVuZ3RoLTFdLmVuZHNXaXRoKFwiLFwiKSl7Zm9ybWF0dGluZy5wdXNoKFwiLFwiKX1cbiAgICBzd2l0Y2goY29vcmRpbmF0ZS5xdWFkcmFudCl7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgcmlnaHQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgbGVmdCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyBsZWZ0LCBcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDQ6IFxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyByaWdodCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGZvcm1hdHRpbmcuam9pbihcIlwiKTtcbn1cbiovXG5cbiJdfQ==