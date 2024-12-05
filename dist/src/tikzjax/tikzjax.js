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
        console.log(s);
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
        console.log(input);
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
    };
    return valueMap[key] || '';
}
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
        console.log(formatting);
        this.assignFormatting(formatting || []);
    }
    assignFormatting(formattingArr) {
        const classProperties = Object.keys(this).reduce((map, prop) => {
            map[prop.toLowerCase()] = prop;
            return map;
        }, {});
        for (const { key, value } of formattingArr) {
            const normalizedKey = classProperties[key.toLowerCase()];
            if (!normalizedKey) {
                console.warn(`Property ${key} not found on the class`);
                continue;
            }
            if (typeof value === "object" && value !== null && !this[normalizedKey]) {
                this[normalizedKey] = {};
            }
            if (value !== undefined && value !== null) {
                this.setProperty(normalizedKey, value);
            }
        }
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
        console.log(slope, this.position, quadrant);
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
        if (typeof value === "string") {
            value = value.replace(/^\|-$/, "north").replace(/^-\|$/, "south");
            const match = value.match(/([\d.]+)(pt|cm|mm)/);
            if (match)
                value = toPoint(Number(match[1]), match[2]);
        }
        const formattingObj = this;
        if (nestedKey) {
            const keys = typeof nestedKey === "string" ? nestedKey.split('.') : [nestedKey];
            this.tikzset;
            if (!formattingObj[key])
                formattingObj[key] = {};
            formattingObj[key][nestedKey] = value;
        }
        else {
            formattingObj[key] = value;
        }
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
    coordinateName;
    formatting;
    label;
    constructor(mode, axis, coordinateName, formatting, label) {
    }
    clone() {
        return new Coordinate(this.mode, this.axis ? this.axis.clone() : undefined, this.coordinateName, this.formatting, this.label);
    }
    addAxis(cartesianX, cartesianY, polarLength, polarAngle) {
        this.axis = new Axis(cartesianX, cartesianY, polarLength, polarAngle);
    }
    toString() {
        switch (this.mode) {
            case "coordinate":
                if (this.axis)
                    return `\\coordinate ${this.formatting?.toString() || ''} (${this.coordinateName || ""}) at (${this.axis.toString()});`;
            case "node":
                if (this.axis)
                    return `\\node ${this.coordinateName ? '(' + this.coordinateName + ')' : ''} at (${this.axis.toString()}) ${this.formatting?.toString() || ''} {${this.label}};`;
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
                console.log(mappedReferences);
            });
        }
        console.log(referenceFirstAxisMap, referenceLastAxisMap);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsY0FBYyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUl6RCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FB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QUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQTtLQUMzQztJQUVELE9BQU87UUFDSCxJQUFJLEVBQUUsUUFBUTtRQUNkLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLHdCQUF3QixFQUFFLEVBQUUsQ0FBQztRQUM1RCxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLENBQUM7UUFDNUQsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU87UUFDOUQsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUk7UUFDM0QsS0FBSyxFQUFFLEtBQUs7UUFDWixLQUFLLEVBQUUsS0FBSztLQUNmLENBQUM7QUFDTixDQUFDO0FBYUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztFQXdCRSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcCwgTWFya2Rvd25WaWV3LCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCBNYXRoUGx1Z2luIGZyb20gXCJzcmMvbWFpblwiO1xuaW1wb3J0IHsgb3B0aW1pemUgfSBmcm9tIFwiLi9zdmdvLmJyb3dzZXIuanNcIjtcbi8vIEB0cy1pZ25vcmVcbmltcG9ydCB0aWt6amF4SnMgZnJvbSBcImlubGluZTouL3Rpa3pqYXguanNcIjtcbmltcG9ydCB7IGNhcnRlc2lhblRvUG9sYXIsIGZpbmRJbnRlcnNlY3Rpb25Qb2ludCwgZmluZFNsb3BlLCBwb2xhclRvQ2FydGVzaWFuLCB0b051bWJlciB9IGZyb20gXCJzcmMvbWF0aFV0aWxpdGllcy5qc1wiO1xuaW1wb3J0IHsgRGVidWdNb2RhbCB9IGZyb20gXCJzcmMvZGVzcGx5TW9kYWxzLmpzXCI7XG5pbXBvcnQgeyBCYXNpY1Rpa3pUb2tlbiwgRm9ybWF0VGlrempheCB9IGZyb20gXCIuL2ludGVycHJldC90b2tlbml6ZVRpa3pqYXguanNcIjtcbmltcG9ydCB7IG1hcEJyYWNrZXRzIH0gZnJvbSBcInNyYy91dGlscy90b2tlblV0ZW5zaWxzLmpzXCI7XG5cblxuXG5leHBvcnQgY2xhc3MgVGlrempheCB7XG4gICAgYXBwOiBBcHA7XG4gICAgcGx1Z2luOiBNYXRoUGx1Z2luO1xuICAgIGFjdGl2ZVZpZXc6IE1hcmtkb3duVmlldyB8IG51bGw7XG5cbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCxwbHVnaW46IE1hdGhQbHVnaW4pIHtcbiAgICAgIHRoaXMuYXBwPWFwcDtcbiAgICAgIHRoaXMuYWN0aXZlVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XG4gICAgICB0aGlzLnBsdWdpbj1wbHVnaW47XG4gICAgfVxuICAgIFxuICAgIHJlYWR5TGF5b3V0KCl7XG4gICAgICB0aGlzLnBsdWdpbi5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xuICAgICAgICB0aGlzLmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xuICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcIndpbmRvdy1vcGVuXCIsICh3aW4sIHdpbmRvdykgPT4ge1xuICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcbiAgICAgICAgfSkpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIGxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcbiAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XG4gICAgICAgIHMuaWQgPSBcInRpa3pqYXhcIjtcbiAgICAgICAgcy50eXBlID0gXCJ0ZXh0L2phdmFzY3JpcHRcIjtcbiAgICAgICAgcy5pbm5lclRleHQgPSB0aWt6amF4SnM7XG4gICAgICAgIGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xuICAgICAgICBjb25zb2xlLmxvZyhzKVxuICAgICAgICBkb2MuYWRkRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcbiAgICB9XG4gIFxuICAgIHVubG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xuICAgICAgICBjb25zdCBzID0gZG9jLmdldEVsZW1lbnRCeUlkKFwidGlrempheFwiKTtcbiAgICAgICAgcz8ucmVtb3ZlKCk7XG5cbiAgICAgICAgZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XG4gICAgfVxuICBcbiAgICBsb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XG4gICAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICB9XG4gIFxuICAgIHVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xuICAgICAgICAgICAgdGhpcy51bmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICB9XG4gIFxuICAgIGdldEFsbFdpbmRvd3MoKSB7XG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBbXTtcbiAgICAgICAgXG4gICAgICAgIC8vIHB1c2ggdGhlIG1haW4gd2luZG93J3Mgcm9vdCBzcGxpdCB0byB0aGUgbGlzdFxuICAgICAgICB3aW5kb3dzLnB1c2godGhpcy5hcHAud29ya3NwYWNlLnJvb3RTcGxpdC53aW4pO1xuICAgICAgICBcbiAgICAgICAgLy8gQHRzLWlnbm9yZSBmbG9hdGluZ1NwbGl0IGlzIHVuZG9jdW1lbnRlZFxuICAgICAgICBjb25zdCBmbG9hdGluZ1NwbGl0ID0gdGhpcy5hcHAud29ya3NwYWNlLmZsb2F0aW5nU3BsaXQ7XG4gICAgICAgIGZsb2F0aW5nU3BsaXQuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBhIHdpbmRvdywgcHVzaCBpdCB0byB0aGUgbGlzdCBcbiAgICAgICAgICAgIGlmIChjaGlsZCBpbnN0YW5jZW9mIFdvcmtzcGFjZVdpbmRvdykge1xuICAgICAgICAgICAgICAgIHdpbmRvd3MucHVzaChjaGlsZC53aW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gd2luZG93cztcbiAgICB9XG4gIFxuICBcbiAgICByZWdpc3RlclRpa3pDb2RlQmxvY2soKSB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZWwuY3JlYXRlRWwoXCJkaXZcIiksIHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXG4gICAgICAgICAgICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICBjb25zdCBzY3JpcHQgPSBlbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcbiAgICAgICAgICAgIGNvbnN0IHRpa3pqYXg9bmV3IEZvcm1hdFRpa3pqYXgoc291cmNlKTtcbiAgICAgICAgICAgIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLHRpa3pqYXguZGVidWdJbmZvKS5vcGVuKCk7XG4gICAgICAgICAgICBzY3JpcHQuc2V0VGV4dCh0aWt6amF4LmdldENvZGUoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaChlKXtcbiAgICAgICAgICAgICAgICBlbC5pbm5lckhUTUwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yRGlzcGxheSA9IGVsLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm1hdGgtZXJyb3ItbGluZVwiIH0pO1xuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5pbm5lclRleHQgPSBgRXJyb3I6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmNsYXNzTGlzdC5hZGQoXCJlcnJvci10ZXh0XCIpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaWtaIFByb2Nlc3NpbmcgRXJyb3I6XCIsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgIH1cbiAgXG4gICAgICBhZGRTeW50YXhIaWdobGlnaHRpbmcoKSB7XG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLnB1c2goe25hbWU6IFwiVGlrelwiLCBtaW1lOiBcInRleHQveC1sYXRleFwiLCBtb2RlOiBcInN0ZXhcIn0pO1xuICAgICAgfVxuICBcbiAgICAgIHJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpIHtcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8gPSB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5maWx0ZXIoZWwgPT4gZWwubmFtZSAhPSBcIlRpa3pcIik7XG4gICAgICB9XG5cbiAgXG4gICAgICBjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcbiAgICAgICAgc3ZnID0gc3ZnLnJlcGxhY2VBbGwoLyhcIiMwMDBcInxcImJsYWNrXCIpL2csIFwiXFxcImN1cnJlbnRDb2xvclxcXCJcIilcbiAgICAgICAgICAgICAgICAucmVwbGFjZUFsbCgvKFwiI2ZmZlwifFwid2hpdGVcIikvZywgXCJcXFwidmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KVxcXCJcIik7XG4gICAgICAgIHJldHVybiBzdmc7XG4gICAgICB9XG4gIFxuICBcbiAgICAgIG9wdGltaXplU1ZHKHN2Zzogc3RyaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIG9wdGltaXplKHN2Zywge3BsdWdpbnM6XG4gICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInByZXNldC1kZWZhdWx0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJyaWRlczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW51cElEczogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICB9KT8uZGF0YTtcbiAgICAgIH1cbiAgXG4gIFxuICAgICAgcG9zdFByb2Nlc3NTdmcgPSAoZTogRXZlbnQpID0+IHtcbiAgXG4gICAgICAgICAgY29uc3Qgc3ZnRWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICBsZXQgc3ZnID0gc3ZnRWwub3V0ZXJIVE1MO1xuICBcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSkge1xuICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcbiAgICAgICAgICB9XG4gIFxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcbiAgXG4gICAgICAgICAgc3ZnRWwub3V0ZXJIVE1MID0gc3ZnO1xuICAgIH1cbn1cbmV4cG9ydCBjb25zdCBhcnJUb1JlZ2V4U3RyaW5nID0gKGFycjogQXJyYXk8c3RyaW5nPikgPT4gJygnICsgYXJyLmpvaW4oJ3wnKSArICcpJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcgfCBSZWdFeHAgfCBBcnJheTxzdHJpbmc+LCBmbGFnczogc3RyaW5nID0gJycpOiBSZWdFeHAge1xuICAgIGlmIChwYXR0ZXJuIGluc3RhbmNlb2YgUmVnRXhwKSB7XG4gICAgICAgIHBhdHRlcm4gPSBwYXR0ZXJuLnNvdXJjZTtcbiAgICB9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkocGF0dGVybikpIHtcbiAgICAgICAgcGF0dGVybiA9IGFyclRvUmVnZXhTdHJpbmcocGF0dGVybik7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIGFuZCByZXR1cm4gdGhlIFJlZ0V4cFxuICAgIHJldHVybiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgJHtwYXR0ZXJufWAsIGZsYWdzKTtcbn1cblxuXG5mdW5jdGlvbiBnZXRSZWdleCgpe1xuICAgIGNvbnN0IGJhc2ljID0gU3RyaW5nLnJhd2BbXFx3XFxkXFxzLSwuOl1gO1xuICAgIHJldHVybiB7XG4gICAgICAgIGJhc2ljOiBiYXNpYyxcbiAgICAgICAgbWVyZ2U6IFN0cmluZy5yYXdgLVxcfHxcXHwtfCFbXFxkLl0rIXxcXCt8LWAsXG4gICAgICAgIC8vY29vcmRpbmF0ZTogbmV3IFJlZ0V4cChTdHJpbmcucmF3YCgke2Jhc2ljfSt8MSlgKSxcbiAgICAgICAgY29vcmRpbmF0ZU5hbWU6IFN0cmluZy5yYXdgW1xcd19cXGRcXHNdYCxcbiAgICAgICAgdGV4dDogU3RyaW5nLnJhd2BbXFx3XFxzLSwuOidcXCRcXCghXFwpXytcXFxce309XWAsXG4gICAgICAgIGZvcm1hdHRpbmc6IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOyYqe30oKSUtPD5dYFxuICAgIH07XG59XG5cblxuXG5cblxuXG5cblxuXG5cblxuXG5cbmludGVyZmFjZSB0b2tlbiAge1xuICAgIFg/OiBudW1iZXI7XG4gICAgWT86IG51bWJlcjtcbiAgICB0eXBlPzogc3RyaW5nO1xuICAgIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nO1xuICAgIGNvb3JkaW5hdGVzPzogYW55O1xufVxuXG5cblxuXG5cblxuXG5mdW5jdGlvbiBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+LCBpbmRleDogbnVtYmVyKTogeyBiZWZvcmU6IG51bWJlciwgYWZ0ZXI6IG51bWJlciB9IHtcbiAgICBcbiAgICBsZXQgYmVmb3JlSW5kZXggPSBheGVzLnNsaWNlKDAsIGluZGV4KS5maW5kTGFzdEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcbiAgICBsZXQgYWZ0ZXJJbmRleCA9IGF4ZXMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuXG4gICAgLy8gQWRqdXN0IGBhZnRlckluZGV4YCBzaW5jZSB3ZSBzbGljZWQgZnJvbSBgaW5kZXggKyAxYFxuICAgIGlmIChhZnRlckluZGV4ICE9PSAtMSkge1xuICAgICAgICBhZnRlckluZGV4ICs9IGluZGV4ICsgMTtcbiAgICB9XG5cbiAgICAvLyBXcmFwIGFyb3VuZCBpZiBub3QgZm91bmRcbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xKSB7XG4gICAgICAgIGJlZm9yZUluZGV4ID0gYXhlcy5maW5kTGFzdEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcbiAgICB9XG5cbiAgICBpZiAoYWZ0ZXJJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgYWZ0ZXJJbmRleCA9IGF4ZXMuZmluZEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcbiAgICB9XG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSB8fCBhZnRlckluZGV4ID09PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIHZhbGlkIEF4aXMgb2JqZWN0cy5cIik7XG4gICAgfVxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gYWZ0ZXJJbmRleCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQcmFpc2VkIGF4aXMgYXMgc2FtZSB0b2tlblwiKTtcbiAgICB9XG4gICAgcmV0dXJuIHsgYmVmb3JlOiBiZWZvcmVJbmRleCwgYWZ0ZXI6IGFmdGVySW5kZXggfTtcbn1cblxuXG5leHBvcnQgY2xhc3MgQXhpcyB7XG4gICAgY2FydGVzaWFuWDogbnVtYmVyO1xuICAgIGNhcnRlc2lhblk6IG51bWJlcjtcbiAgICBwb2xhckFuZ2xlOiBudW1iZXI7XG4gICAgcG9sYXJMZW5ndGg6IG51bWJlcjtcbiAgICBuYW1lPzogc3RyaW5nO1xuICAgIHF1YWRyYW50PzogbnVtYmVyO1xuXG4gICAgY29uc3RydWN0b3IoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIsbmFtZT86IHN0cmluZykge1xuICAgICAgICBpZiAoY2FydGVzaWFuWCAhPT0gdW5kZWZpbmVkKSB0aGlzLmNhcnRlc2lhblggPSBjYXJ0ZXNpYW5YO1xuICAgICAgICBpZiAoY2FydGVzaWFuWSAhPT0gdW5kZWZpbmVkKSB0aGlzLmNhcnRlc2lhblkgPSBjYXJ0ZXNpYW5ZO1xuICAgICAgICBpZiAocG9sYXJMZW5ndGggIT09IHVuZGVmaW5lZCkgdGhpcy5wb2xhckxlbmd0aCA9IHBvbGFyTGVuZ3RoO1xuICAgICAgICBpZiAocG9sYXJBbmdsZSAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyQW5nbGUgPSBwb2xhckFuZ2xlO1xuICAgICAgICB0aGlzLm5hbWU9bmFtZVxuICAgIH1cbiAgICBcbiAgICBjbG9uZSgpOiBBeGlzIHtcbiAgICAgICAgcmV0dXJuIG5ldyBBeGlzKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZLHRoaXMucG9sYXJMZW5ndGgsdGhpcy5wb2xhckFuZ2xlLHRoaXMubmFtZSk7XG4gICAgfVxuICAgIHBhcnNlSW5wdXQoaW5wdXQ6IGFueSkge1xuICAgICAgICBjb25zb2xlLmxvZyhpbnB1dCk7XG4gICAgICAgIGNvbnN0IGF4ZXM9W11cbiAgICAgICAgY29uc3QgYnJhY2tldE1hcCA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJywgaW5wdXQpO1xuICAgICAgICBheGVzLnB1c2godGhpcy5wcm9jZXNzSW5kaXZpZHVhbChpbnB1dCkpO1xuICAgICAgICAgICAgaWYoYXhlcy5sZW5ndGg9PT0xKVxuICAgICAgICAgICAgICAgIHJldHVybiBheGVzWzBdXG4gICAgfVxuICAgIFxuICAgIHByb2Nlc3NJbmRpdmlkdWFsKGlucHV0OiBhbnkpIHtcbiAgICAgICAgbGV0IGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICBjb25zdCBpc0NhcnRlc2lhbiA9IGlucHV0LnNvbWUoKHRva2VuOiBhbnkpID0+IHRva2VuLm5hbWUgPT09ICdDb21tYScpO1xuICAgICAgICBpbnB1dCA9IGlucHV0LmZpbHRlcigodG9rZW46IGFueSkgPT4gdG9rZW4udHlwZSAhPT0gJ1N5bnRheCcpO1xuICAgICAgICBpZiAoaXNDYXJ0ZXNpYW4gJiYgaW5wdXQubGVuZ3RoID09PSAyKSB7XG4gICAgICAgICAgICBheGlzLmNhcnRlc2lhblggPSBpbnB1dFswXS52YWx1ZTtcbiAgICAgICAgICAgIGF4aXMuY2FydGVzaWFuWSA9IGlucHV0WzFdLnZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBheGlzO1xuICAgIH1cbiAgICBcblxuICAgIHVuaXZlcnNhbChjb29yZGluYXRlOiBzdHJpbmcsIHRva2Vucz86IEZvcm1hdFRpa3pqYXgsYW5jaG9yQXJyPzogYW55LGFuY2hvcj86IHN0cmluZyk6IEF4aXMge1xuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVBcnI6IEFycmF5PEF4aXN8c3RyaW5nPiA9IFtdO1xuICAgICAgICBtYXRjaGVzLmZvckVhY2goKG1hdGNoOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xuICAgICAgICAgICAgbGV0IGF4aXM6IEF4aXN8dW5kZWZpbmVkO1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZENhcnRlc2lhbihtYXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAvOi8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZFBvbGFyKG1hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5wb2xhclRvQ2FydGVzaWFuKClcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIC8hW1xcZC5dKyEvLnRlc3QobWF0Y2gpOlxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICgvW1xcZFxcd10rLykudGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpXG4gICAgICAgICAgICAgICAgICAgICAgICBheGlzID0gdG9rZW5zLmZpbmRPcmlnaW5hbFZhbHVlKG1hdGNoKT8uYXhpcztcbiAgICAgICAgICAgICAgICAgICAgZWxzZSB0aHJvdyBuZXcgRXJyb3IoYFRyaWVkIHRvIGZpbmQgb3JpZ2luYWwgY29vcmRpbmF0ZSB2YWx1ZSB3aGlsZSBub3QgYmVpbmcgcHJvdmlkZWQgd2l0aCB0b2tlbnNgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGF4aXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIHRoZSBjb29yZGluYXRlICR7bWF0Y2h9IGZyb20gJHtjb29yZGluYXRlfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGF4aXMubmFtZT1tYXRjaFxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLm1lcmdlQXhpcyhjb29yZGluYXRlQXJyKVxuXG4gICAgICAgIGlmKGFuY2hvckFyciYmYW5jaG9yJiZhbmNob3IubWF0Y2goLygtLVxcK3wtLVxcK1xcKykvKSl7XG4gICAgICAgICAgICBsZXQgYTogQXhpc1xuICAgICAgICAgICAgaWYgKGFuY2hvci5tYXRjaCgvKC0tXFwrKS8pKXtcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kKChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kTGFzdCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGEsXCJhZGRpdGlvblwiKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG1lcmdlQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPikge1xuICAgICAgICBpZiAoIWF4ZXMuc29tZSgoYXhpczogYW55KSA9PiB0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIikpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IGF4aXMgb2YgYXhlcykge1xuICAgICAgICAgICAgaWYodHlwZW9mIGF4aXMgPT09IFwic3RyaW5nXCIpe2NvbnRpbnVlO31cbiAgICAgICAgICAgIGF4aXMubmFtZT11bmRlZmluZWRcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGF4ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBheGVzW2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHNpZGVzID0gZmluZEJlZm9yZUFmdGVyQXhpcyhheGVzLCBpKTtcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUF4aXMgPSBheGVzW3NpZGVzLmJlZm9yZV0gYXMgQXhpcztcbiAgICAgICAgICAgIGNvbnN0IGFmdGVyQXhpcyA9IGF4ZXNbc2lkZXMuYWZ0ZXJdIGFzIEF4aXM7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGxldCAgbWF0Y2ggPSBjdXJyZW50Lm1hdGNoKC9eXFwrJC8pO1xuICAgICAgICAgICAgbGV0IG1vZGUsbW9kaWZpZXJzO1xuICAgICAgICAgICAgaWYgKG1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJhZGRpdGlvblwiXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaD1jdXJyZW50Lm1hdGNoKC9eLVxcfCQvKVxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJyaWdodFByb2plY3Rpb25cIlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXlxcIShbXFxkLl0rKVxcISQvKVxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJpbnRlcm5hbFBvaW50XCJcbiAgICAgICAgICAgICAgICBtb2RpZmllcnM9dG9OdW1iZXIobWF0Y2hbMV0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKG1vZGUpe1xuICAgICAgICAgICAgICAgIGF4ZXMuc3BsaWNlKHNpZGVzLmJlZm9yZSwgc2lkZXMuYWZ0ZXIgLSBzaWRlcy5iZWZvcmUgKyAxLCBiZWZvcmVBeGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYWZ0ZXJBeGlzLG1vZGUsbW9kaWZpZXJzKSk7XG4gICAgICAgICAgICAgICAgaSA9IHNpZGVzLmJlZm9yZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGF4ZXMubGVuZ3RoID09PSAxICYmIGF4ZXNbMF0gaW5zdGFuY2VvZiBBeGlzKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29tcGxleENhcnRlc2lhbkFkZChheGlzOiBBeGlzLG1vZGU6IHN0cmluZyxtb2RpZmllcj86IGFueSl7XG4gICAgICAgIHN3aXRjaCAobW9kZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZGl0aW9uXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YKz1heGlzLmNhcnRlc2lhblg7XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZKz1heGlzLmNhcnRlc2lhblk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwic3VidHJhY3Rpb25cIjpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJyaWdodFByb2plY3Rpb25cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9YXhpcy5jYXJ0ZXNpYW5YXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiaW50ZXJuYWxQb2ludFwiOlxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD0odGhpcy5jYXJ0ZXNpYW5YK2F4aXMuY2FydGVzaWFuWCkqbW9kaWZpZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZPSh0aGlzLmNhcnRlc2lhblkrYXhpcy5jYXJ0ZXNpYW5ZKSptb2RpZmllcjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKClcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9O1xuXG5cbiAgICBnZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlOiBzdHJpbmcpe1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm4gPSBnZXRSZWdleCgpO1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW1xuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLmJhc2ljfSspYCwgXCJnXCIpLFxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLm1lcmdlfSspYCwgXCJnXCIpXG4gICAgICAgIF07XG4gICAgICAgIFxuICAgICAgICAvLyBTdGVwIDE6IEV4dHJhY3QgbWF0Y2hlcyBmb3IgZWFjaCBwYXR0ZXJuIHNlcGFyYXRlbHlcbiAgICAgICAgY29uc3QgYmFzaWNNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMF0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLnJlcGxhY2UoLy0kL2csIFwiXCIpLCAvLyBSZW1vdmUgdHJhaWxpbmcgaHlwaGVuIG9ubHlcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGgtKG1hdGNoWzBdLm1hdGNoKC8tJC8pPzE6MClcbiAgICAgICAgfSkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgbWVyZ2VNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMV0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLFxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxuICAgICAgICB9KSk7XG4gICAgICAgIGNvbnN0IG1hdGNoZXM6IEFycmF5PHsgZnVsbE1hdGNoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyIH0+ID0gW107XG5cbiAgICAgICAgZnVuY3Rpb24gaXNPdmVybGFwcGluZyhtYXRjaDE6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSwgbWF0Y2gyOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0pIHtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDEuaW5kZXggPCBtYXRjaDIuaW5kZXggKyBtYXRjaDIubGVuZ3RoICYmIG1hdGNoMi5pbmRleCA8IG1hdGNoMS5pbmRleCArIG1hdGNoMS5sZW5ndGg7XG4gICAgICAgIH1cblxuICAgICAgICBbLi4uYmFzaWNNYXRjaGVzLCAuLi5tZXJnZU1hdGNoZXNdLmZvckVhY2gobWF0Y2ggPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3ZlcmxhcHBpbmdJbmRleCA9IG1hdGNoZXMuZmluZEluZGV4KGV4aXN0aW5nTWF0Y2ggPT4gaXNPdmVybGFwcGluZyhleGlzdGluZ01hdGNoLCBtYXRjaCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAob3ZlcmxhcHBpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ01hdGNoID0gbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgY3VycmVudCBtYXRjaCBjb3ZlcnMgYSBsYXJnZXIgcmFuZ2UsIHJlcGxhY2UgdGhlIGV4aXN0aW5nIG9uZVxuICAgICAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPiBleGlzdGluZ01hdGNoLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdID0gbWF0Y2g7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgMzogU29ydCB0aGUgZmluYWwgbWF0Y2hlcyBieSBpbmRleFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgNDogVmFsaWRhdGUgdGhlIHJlc3VsdFxuICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvb3JkaW5hdGUgaXMgbm90IHZhbGlkOyBleHBlY3RlZCBhIHZhbGlkIGNvb3JkaW5hdGUuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRjaGVzO1xuICAgICAgICBcbiAgICB9XG4gICAgXG4gICAgXG4gICAgXG5cbiAgICBwcm9qZWN0aW9uKGF4aXMxOiBBeGlzfHVuZGVmaW5lZCxheGlzMjogQXhpc3x1bmRlZmluZWQpOmFueXtcbiAgICAgICAgaWYgKCFheGlzMXx8IWF4aXMyKXt0aHJvdyBuZXcgRXJyb3IoXCJheGlzJ3Mgd2VyZSB1bmRlZmluZWQgYXQgcHJvamVjdGlvblwiKTt9XG4gICAgICAgIHJldHVybiBbe1g6IGF4aXMxLmNhcnRlc2lhblgsWTogYXhpczIuY2FydGVzaWFuWX0se1g6IGF4aXMyLmNhcnRlc2lhblgsWTogYXhpczEuY2FydGVzaWFuWX1dXG4gICAgfVxuXG4gICAgY29tYmluZShjb29yZGluYXRlQXJyOiBhbnkpe1xuICAgICAgICBsZXQgeD0wLHk9MDtcbiAgICAgICAgY29vcmRpbmF0ZUFyci5mb3JFYWNoKChjb29yZGluYXRlOiBBeGlzKT0+e1xuICAgICAgICAgICAgeCs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgeSs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5ZO1xuICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPXg7dGhpcy5jYXJ0ZXNpYW5ZPXk7XG4gICAgfVxuICAgIGFkZENhcnRlc2lhbih4OiBzdHJpbmcgfCBudW1iZXIsIHk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgXG4gICAgICAgIGlmICgheSAmJiB0eXBlb2YgeCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgW3gsIHldID0geC5zcGxpdChcIixcIikubWFwKE51bWJlcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCB8fCB5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgQ2FydGVzaWFuIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhcnRlc2lhblggPSB4IGFzIG51bWJlcjtcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZID0geSBhcyBudW1iZXI7XG4gICAgfVxuICAgIFxuICAgIHBvbGFyVG9DYXJ0ZXNpYW4oKXtcbiAgICAgICAgY29uc3QgdGVtcD1wb2xhclRvQ2FydGVzaWFuKHRoaXMucG9sYXJBbmdsZSwgdGhpcy5wb2xhckxlbmd0aClcbiAgICAgICAgdGhpcy5hZGRDYXJ0ZXNpYW4odGVtcC5YLHRlbXAuWSlcbiAgICB9XG5cbiAgICBjYXJ0ZXNpYW5Ub1BvbGFyKCl7XG4gICAgICAgIGNvbnN0IHRlbXA9Y2FydGVzaWFuVG9Qb2xhcih0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSlcbiAgICAgICAgdGhpcy5hZGRQb2xhcih0ZW1wLmFuZ2xlLHRlbXAubGVuZ3RoKVxuICAgIH1cblxuICAgIGFkZFBvbGFyKGFuZ2xlOiBzdHJpbmcgfCBudW1iZXIsIGxlbmd0aD86IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAoIWxlbmd0aCAmJiB0eXBlb2YgYW5nbGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIFthbmdsZSwgbGVuZ3RoXSA9IGFuZ2xlLnNwbGl0KFwiOlwiKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYW5nbGUgPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBwb2xhciBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wb2xhckFuZ2xlID0gYW5nbGUgYXMgbnVtYmVyO1xuICAgICAgICB0aGlzLnBvbGFyTGVuZ3RoID0gbGVuZ3RoIGFzIG51bWJlcjtcbiAgICB9XG4gICAgYWRkUXVhZHJhbnQobWlkUG9pbnQ6IEF4aXMpe1xuICAgICAgICBjb25zdCB4PW1pZFBvaW50LmNhcnRlc2lhblg+dGhpcy5jYXJ0ZXNpYW5YO1xuICAgICAgICBjb25zdCB5PW1pZFBvaW50LmNhcnRlc2lhblk+dGhpcy5jYXJ0ZXNpYW5ZO1xuICAgICAgICB0aGlzLnF1YWRyYW50PXg/eT8xOjQ6eT8yOjM7XG4gICAgfVxuICAgIHRvU3RyaW5nU1ZHKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIgXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xuICAgIH1cbiAgICB0b1N0cmluZygpe1xuICAgICAgICByZXR1cm4gdGhpcy5jYXJ0ZXNpYW5YK1wiLFwiK3RoaXMuY2FydGVzaWFuWTtcbiAgICB9XG5cbiAgICBpbnRlcnNlY3Rpb24oY29vcmQ6IHN0cmluZywgZmluZE9yaWdpbmFsVmFsdWU6IChjb29yZDogc3RyaW5nKSA9PiBDb29yZGluYXRlIHwgdW5kZWZpbmVkKToge1g6bnVtYmVyLFk6bnVtYmVyfSB7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvKFxccyphbmRcXHM/fC0tKS9nLCBcIiBcIilcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcbiAgICAgICAgICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpXG4gICAgICAgICAgICAuZmlsdGVyKCh0b2tlbik6IHRva2VuIGlzIENvb3JkaW5hdGUgPT4gdG9rZW4gIT09IHVuZGVmaW5lZCk7XG5cbiAgICAgICAgaWYgKG9yaWdpbmFsQ29vcmRzLmxlbmd0aCA8IDQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludGVyc2VjdGlvbiBoYWQgdW5kZWZpbmVkIGNvb3JkaW5hdGVzIG9yIGluc3VmZmljaWVudCBkYXRhLlwiKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc3Qgc2xvcGVzID0gW1xuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMV0uYXhpcyBhcyBBeGlzKSxcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1syXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzNdLmF4aXMgYXMgQXhpcyksXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGZpbmRJbnRlcnNlY3Rpb25Qb2ludChvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvUG9pbnQodmFsdWU6bnVtYmVyLGZvcm1hdDogc3RyaW5nKXtcbiAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICBjYXNlIFwiUG9pbnRcIjpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgY2FzZSBcImNtXCI6IFxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKjI4LjM0NjtcbiAgICAgICAgY2FzZSBcIm1tXCI6XG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqIDIuODM0NjtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInVua25vbiBmb3JtYXRcIik7XG4gICAgfVxufVxuXG5cbmZ1bmN0aW9uIG1hdGNoS2V5V2l0aFZhbHVlKGtleTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCB2YWx1ZU1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgICAgICAgXCJhbmNob3JcIjogXCJhbmNob3I9XCIsXG4gICAgICAgIFwicm90YXRlXCI6IFwicm90YXRlPVwiLFxuICAgICAgICBcImxpbmVXaWR0aFwiOiBcImxpbmUgd2lkdGg9XCIsXG4gICAgICAgIFwiZmlsbFwiOiBcImZpbGw9XCIsXG4gICAgICAgIFwiZmlsbE9wYWNpdHlcIjogXCJmaWxsIG9wYWNpdHk9XCIsXG4gICAgICAgIFwidGV4dE9wYWNpdHlcIjogXCJ0ZXh0IG9wYWNpdHk9XCIsXG4gICAgICAgIFwidGV4dENvbG9yXCI6IFwidGV4dCBjb2xvcj1cIixcbiAgICAgICAgXCJkcmF3XCI6IFwiZHJhdz1cIixcbiAgICAgICAgXCJ0ZXh0XCI6IFwidGV4dD1cIixcbiAgICAgICAgXCJwb3NcIjogXCJwb3M9XCIsXG4gICAgICAgIFwic2NhbGVcIjogXCJzY2FsZT1cIixcbiAgICAgICAgXCJkZWNvcmF0ZVwiOiBcImRlY29yYXRlXCIsXG4gICAgICAgIFwic2xvcGVkXCI6IFwic2xvcGVkXCIsXG4gICAgICAgIFwiZGVjb3JhdGlvblwiOiBcImRlY29yYXRpb249XCIsXG4gICAgICAgIFwiYnJhY2VcIjogXCJicmFjZVwiLFxuICAgICAgICBcImFtcGxpdHVkZVwiOiBcImFtcGxpdHVkZT1cIixcbiAgICAgICAgXCJhbmdsZVJhZGl1c1wiOiBcImFuZ2xlIHJhZGl1cz1cIixcbiAgICAgICAgXCJhbmdsZUVjY2VudHJpY2l0eVwiOiBcImFuZ2xlIGVjY2VudHJpY2l0eT1cIixcbiAgICAgICAgXCJmb250XCI6IFwiZm9udD1cIixcbiAgICAgICAgXCJwaWNUZXh0XCI6IFwicGljIHRleHQ9XCIsXG4gICAgICAgIFwibGFiZWxcIjogXCJsYWJlbD1cIixcbiAgICB9O1xuXG4gICAgcmV0dXJuIHZhbHVlTWFwW2tleV0gfHwgJyc7XG59XG5cblxudHlwZSBEZWNvcmF0aW9uID0ge1xuICAgIGJyYWNlPzogYm9vbGVhbjtcbiAgICBjb2lsOiBib29sZWFuO1xuICAgIGFtcGxpdHVkZT86IG51bWJlcjtcbiAgICBhc3BlY3Q/OiBudW1iZXI7XG4gICAgc2VnbWVudExlbmd0aD86IG51bWJlcjtcbiAgICBkZWNvcmF0aW9uPzogRGVjb3JhdGlvbjsgXG59O1xuXG50eXBlIExhYmVsID0ge1xuICAgIGZyZWVGb3JtVGV4dD86IHN0cmluZztcbn07XG5cbmZ1bmN0aW9uIGxpbmVXaWR0aENvbnZlcnRlcih3aWR0aDogc3RyaW5nKXtcbiAgICByZXR1cm4gTnVtYmVyKHdpZHRoLnJlcGxhY2UoL3VsdHJhXFxzKnRoaW4vLFwiMC4xXCIpXG4gICAgLnJlcGxhY2UoL3ZlcnlcXHMqdGhpbi8sXCIwLjJcIilcbiAgICAucmVwbGFjZSgvdGhpbi8sXCIwLjRcIilcbiAgICAucmVwbGFjZSgvc2VtaXRoaWNrLyxcIjAuNlwiKVxuICAgIC5yZXBsYWNlKC90aGljay8sXCIwLjhcIilcbiAgICAucmVwbGFjZSgvdmVyeVxccyp0aGljay8sXCIxLjJcIilcbiAgICAucmVwbGFjZSgvdWx0cmFcXHMqdGhpY2svLFwiMS42XCIpKVxufVxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XG4gICAgLy8gaW1wb3J0ZW50IG5lZWRzIHRvIGJlIGZvcnN0XG4gICAgcGF0aD86IHN0cmluZztcblxuICAgIHNjYWxlOiBudW1iZXI7XG4gICAgcm90YXRlPzogbnVtYmVyO1xuICAgIGxpbmVXaWR0aD86IG51bWJlcj0wLjQ7XG4gICAgdGV4dE9wYWNpdHk6IG51bWJlcjtcbiAgICBvcGFjaXR5PzogbnVtYmVyO1xuICAgIGZpbGxPcGFjaXR5PzogbnVtYmVyO1xuICAgIHBvcz86IG51bWJlcjtcbiAgICBhbmdsZUVjY2VudHJpY2l0eT86IG51bWJlcjtcbiAgICBhbmdsZVJhZGl1cz86IG51bWJlcjtcbiAgICBsZXZlbERpc3RhbmNlPzogbnVtYmVyO1xuXG4gICAgbW9kZTogc3RyaW5nO1xuICAgIGFuY2hvcj86IHN0cmluZztcbiAgICBjb2xvcj86IHN0cmluZztcbiAgICB0ZXh0Q29sb3I/OiBzdHJpbmc7XG4gICAgZmlsbD86IHN0cmluZztcbiAgICBhcnJvdz86IHN0cmluZztcbiAgICBkcmF3Pzogc3RyaW5nO1xuICAgIHRleHQ/OiBzdHJpbmc7XG4gICAgdGlrenNldD86IHN0cmluZztcbiAgICBwb3NpdGlvbj86IHN0cmluZztcbiAgICBsaW5lU3R5bGU/OiBzdHJpbmc7XG4gICAgZm9udD86IHN0cmluZztcbiAgICBwaWNUZXh0Pzogc3RyaW5nO1xuICAgIFxuICAgIHNsb3BlZD86IGJvb2xlYW47XG4gICAgZGVjb3JhdGU/OiBib29sZWFuO1xuICAgIGxhYmVsPzogTGFiZWw7XG4gICAgZGVjb3JhdGlvbj86IERlY29yYXRpb247XG5cbiAgICBjb25zdHJ1Y3Rvcihmb3JtYXR0aW5nOiBhbnlbXSxtb2RlPzogc3RyaW5nKXtcbiAgICAgICAgaWYobW9kZSl0aGlzLm1vZGU9bW9kZTtcbiAgICAgICAgY29uc29sZS5sb2coZm9ybWF0dGluZylcbiAgICAgICAgdGhpcy5hc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmd8fFtdKTtcbiAgICB9XG5cblxuICAgIGFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZ0FycjogQXJyYXk8eyBrZXk6IHN0cmluZzsgdmFsdWU6IGFueSB9Pikge1xuICAgICAgICBjb25zdCBjbGFzc1Byb3BlcnRpZXMgPSBPYmplY3Qua2V5cyh0aGlzKS5yZWR1Y2UoKG1hcCwgcHJvcCkgPT4ge1xuICAgICAgICAgICAgbWFwW3Byb3AudG9Mb3dlckNhc2UoKV0gPSBwcm9wO1xuICAgICAgICAgICAgcmV0dXJuIG1hcDtcbiAgICAgICAgfSwge30gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPik7XG4gICAgXG4gICAgICAgIGZvciAoY29uc3QgeyBrZXksIHZhbHVlIH0gb2YgZm9ybWF0dGluZ0Fycikge1xuICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZEtleSA9IGNsYXNzUHJvcGVydGllc1trZXkudG9Mb3dlckNhc2UoKV07XG4gICAgICAgICAgICBpZiAoIW5vcm1hbGl6ZWRLZXkpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFByb3BlcnR5ICR7a2V5fSBub3QgZm91bmQgb24gdGhlIGNsYXNzYCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9PSBudWxsICYmICEodGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+KVtub3JtYWxpemVkS2V5XSkge1xuICAgICAgICAgICAgICAgICh0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW25vcm1hbGl6ZWRLZXldID0ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0UHJvcGVydHkobm9ybWFsaXplZEtleSBhcyBrZXlvZiBGb3JtYXR0aW5nLCB2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgXG4gICAgXG5cblxuICAgIGFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nOiBhbnkpe1xuICAgICAgICBjb25zdCBhPXNwbGl0Rm9ybWF0dGluZy5maW5kKChpdGVtOiBzdHJpbmcpPT4gaXRlbS5tYXRjaCgvbWFzc3xhbmd8aGVscGxpbmVzLykpXG4gICAgICAgIGlmICghYSYmIXRoaXMudGlrenNldClyZXR1cm47XG4gICAgICAgIGlmKGEpIHRoaXMudGlrenNldD1hO1xuXG4gICAgICAgIHN3aXRjaCAodGhpcy50aWt6c2V0KSB7XG4gICAgICAgICAgICBjYXNlIFwibWFzc1wiOlxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD1cInllbGxvdyE2MFwiO1xuICAgICAgICAgICAgICAgIHRoaXMucGF0aD1cImRyYXdcIjtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInZlY1wiOlxuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9Jy0+J1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImhlbHBsaW5lc1wiOlxuICAgICAgICAgICAgICAgIHRoaXMubGluZVdpZHRoPTAuNDtcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXc9J2dyYXknO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFuZ1wiOlxuICAgICAgICAgICAgICAgIHRoaXMucGF0aD0nZHJhdydcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGw9J2JsYWNrITUwJztcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGxPcGFjaXR5PTAuNTtcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXc9J29yYW5nZSdcbiAgICAgICAgICAgICAgICB0aGlzLmFycm93PSc8LT4nXG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZUVjY2VudHJpY2l0eT0xLjY7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZVJhZGl1cz10b1BvaW50KDAuNSxcImNtXCIpO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dD0nb3JhbmdlJztcbiAgICAgICAgICAgICAgICB0aGlzLmZvbnQ9J1xcXFxsYXJnZSc7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0T3BhY2l0eT0wLjk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFkZFNwbG9wQW5kUG9zaXRpb24oYXJyOiBhbnksaW5kZXg6IG51bWJlcil7XG4gICAgICAgIGNvbnN0IGJlZm9yZUFmdGVyPWZpbmRCZWZvcmVBZnRlckF4aXMoYXJyLGluZGV4KTtcbiAgICAgICAgY29uc3QgW2JlZm9yZSwgYWZ0ZXJdPVthcnJbYmVmb3JlQWZ0ZXIuYmVmb3JlXSxhcnJbYmVmb3JlQWZ0ZXIuYWZ0ZXJdXVxuICAgICAgICBpZiAodGhpcy5wb3NpdGlvbnx8dGhpcy5zbG9wZWQpe3JldHVybn1cbiAgICBcbiAgICAgICAgY29uc3QgZWRnZTEgPSBiZWZvcmUucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XG4gICAgICAgIGNvbnN0IGVkZ2UyID0gYWZ0ZXIucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XG4gICAgICAgIGNvbnN0IHNsb3BlPWZpbmRTbG9wZShiZWZvcmUsYWZ0ZXIpXG5cbiAgICAgICAgdGhpcy5zbG9wZWQgPSBzbG9wZSAhPT0gMCYmc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHk7XG5cbiAgICAgICAgbGV0IHF1YWRyYW50XG5cbiAgICAgICAgaWYgKGVkZ2UxIT09ZWRnZTIpXG4gICAgICAgICAgICBxdWFkcmFudD1lZGdlMStlZGdlMjtcbiAgICAgICAgZWxzZSBcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxO1xuXG4gICAgICAgIC8vc2ludCBwYXJhbGxlbCB0byBZIGF4aXNcbiAgICAgICAgaWYgKHNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5KXtcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb24gPSBxdWFkcmFudC5yZXBsYWNlKC8oM3w0KS8sXCJiZWxvd1wiKS5yZXBsYWNlKC8oMXwyKS8sXCJhYm92ZVwiKS5yZXBsYWNlKC8oYmVsb3dhYm92ZXxhYm92ZWJlbG93KS8sXCJcIilcbiAgICAgICAgfVxuICAgICAgICAvL2lzbnQgcGFyYWxsZWwgdG8gWCBheGlzXG4gICAgICAgIGlmIChzbG9wZSAhPT0gMCl7XG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uPXRoaXMucG9zaXRpb24/dGhpcy5wb3NpdGlvbjonJztcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb24rPXF1YWRyYW50LnJlcGxhY2UoLygxfDQpLyxcInJpZ2h0XCIpLnJlcGxhY2UoLygyfDMpLyxcImxlZnRcIikucmVwbGFjZSgvKHJpZ2h0bGVmdHxsZWZ0cmlnaHQpLyxcIlwiKVxuICAgICAgICB9XG4gICAgICAgIHRoaXMucG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uPy5yZXBsYWNlKC9bXFxkXSsvZyxcIlwiKS5yZXBsYWNlKC8oYmVsb3d8YWJvdmUpKHJpZ2h0fGxlZnQpLyxcIiQxICQyXCIpO1xuICAgICAgICBjb25zb2xlLmxvZyhzbG9wZSx0aGlzLnBvc2l0aW9uLHF1YWRyYW50KVxuICAgIH1cblxuICAgIFxuICAgIFxuXG4gICAgaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3Qgc3BsaXRGb3JtYXR0aW5nID0gZm9ybWF0dGluZ1N0cmluZy5yZXBsYWNlKC9cXHMvZywgXCJcIikubWF0Y2goLyg/OntbXn1dKn18W14se31dKykrL2cpIHx8IFtdO1xuICAgIFxuICAgICAgICB0aGlzLmFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nKTtcbiAgICBcbiAgICAgICAgY29uc3QgcGF0dGVybnM6IFJlY29yZDxzdHJpbmcsICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkPiA9IHtcbiAgICAgICAgICAgIFwibGluZXdpZHRoXCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImxpbmVXaWR0aFwiLCB2YWx1ZSksXG4gICAgICAgICAgICBcImZpbGw9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImZpbGxcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeZmlsbG9wYWNpdHlcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZmlsbE9wYWNpdHlcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeKC0+fDwtfC0qe1N0ZWFsdGh9LSopJFwiOiAodmFsdWUpID0+IHsgdGhpcy5hcnJvdyA9IHZhbHVlOyB9LFxuICAgICAgICAgICAgXCJeKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpezEsMn0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLnBvc2l0aW9uID0gdmFsdWUucmVwbGFjZSgvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLywgXCIkMSBcIik7IH0sXG4gICAgICAgICAgICBcIl5wb3M9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcInBvc1wiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5kcmF3PVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJkcmF3XCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXmRlY29yYXRlJFwiOiAoKSA9PiB7IHRoaXMuZGVjb3JhdGUgPSB0cnVlOyB9LFxuICAgICAgICAgICAgXCJedGV4dD1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwidGV4dFwiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5hbmNob3I9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImFuY2hvclwiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5cXFwiXlxcXCIkXCI6ICgpID0+IHRoaXMuc2V0UHJvcGVydHkoXCJsYWJlbFwiLHRydWUsXCJmcmVlRm9ybVRleHRcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wibGFiZWxcIl0+KSxcbiAgICAgICAgICAgIFwiXmJyYWNlJFwiOiAoKSA9PiB0aGlzLnNldFByb3BlcnR5KFwiZGVjb3JhdGlvblwiLHRydWUsXCJicmFjZVwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJkZWNvcmF0aW9uXCJdPiksXG4gICAgICAgICAgICBcIl5hbXBsaXR1ZGVcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZGVjb3JhdGlvblwiLCB2YWx1ZSwgXCJhbXBsaXR1ZGVcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxuICAgICAgICAgICAgXCJeZHJhdyRcIjogKHZhbHVlKSA9PiB7IHRoaXMucGF0aCA9IHZhbHVlOyB9LFxuICAgICAgICAgICAgXCJeKHJlZHxibHVlfHBpbmt8YmxhY2t8d2hpdGV8WyFcXFxcZC5dKyl7MSw1fSRcIjogKHZhbHVlKSA9PiB7IHRoaXMuY29sb3IgPSB2YWx1ZTsgfSxcbiAgICAgICAgICAgIFwiXihkb3R0ZWR8ZGFzaGVkfHNtb290aHxkZW5zZWx5fGxvb3NlbHkpezEsMn0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmxpbmVTdHlsZSA9IHZhbHVlLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLywgXCIkMSBcIik7IH0sXG4gICAgICAgIH07XG5cbiAgICAgICAgc3BsaXRGb3JtYXR0aW5nLmZvckVhY2goZm9ybWF0dGluZyA9PiB7LypcbiAgICAgICAgICAgIC8vIEhhbmRsZSBuZXN0ZWQgcHJvcGVydGllc1xuICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBmb3JtYXR0aW5nLm1hdGNoKC9eKFtePV0rKT17KC4qKX0kLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBbXywgcGFyZW50LCBjaGlsZHJlbl0gPSBtYXRjaDtcblxuICAgICAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdPYmogPSB0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XG4gICAgICAgICAgICAgICAgaWYgKCFmb3JtYXR0aW5nT2JqW3BhcmVudF0pIHtcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGluZ09ialtwYXJlbnRdID0ge307XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZENoaWxkID0gbmV3IEZvcm1hdHRpbmcodGhpcy5tb2RlLHt9LGNoaWxkcmVuKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGZvcm1hdHRpbmdPYmpbcGFyZW50XSwgKHBhcnNlZENoaWxkIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW3BhcmVudF0pO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChjb25zdCBbcGF0dGVybiwgaGFuZGxlcl0gb2YgT2JqZWN0LmVudHJpZXMocGF0dGVybnMpKSB7XG4gICAgICAgICAgICAgICAgaWYgKG5ldyBSZWdFeHAocGF0dGVybikudGVzdChmb3JtYXR0aW5nKSkge1xuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyKGZvcm1hdHRpbmcpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSovXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICBcblxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcbiAgICAgICAga2V5OiBLLFxuICAgICAgICBmb3JtYXR0aW5nOiBhbnksXG4gICAgICAgIG5lc3RlZEtleT86IE5LXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGxldCB2YWx1ZTtcbiAgICAgICAgaWYodHlwZW9mIGZvcm1hdHRpbmchPT1cImJvb2xlYW5cIil7XG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBmb3JtYXR0aW5nLnNwbGl0KFwiPVwiKTtcbiAgICBcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgZm9ybWF0dGluZyBzdHJpbmcgaXMgdmFsaWRcbiAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPCAyIHx8ICFtYXRjaFsxXSkgcmV0dXJuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGlmIHRoZSB2YWx1ZSBpcyBhIG51bWJlciBvciBhIHN0cmluZ1xuICAgICAgICAgICAgdmFsdWUgPSAhaXNOYU4ocGFyc2VGbG9hdChyYXdWYWx1ZSkpICYmIGlzRmluaXRlKCtyYXdWYWx1ZSlcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXG4gICAgICAgICAgICAgICAgOiByYXdWYWx1ZS5yZXBsYWNlKC8tXFx8Lywnbm9ydGgnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNle1xuICAgICAgICAgICAgdmFsdWU9Zm9ybWF0dGluZ1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLnNldFByb3BlcnR5KGtleSwgdmFsdWUsIG5lc3RlZEtleSk7XG4gICAgfVxuICAgIFxuICAgIHNldFByb3BlcnR5PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcbiAgICAgICAga2V5OiBLLFxuICAgICAgICB2YWx1ZTogYW55LFxuICAgICAgICBuZXN0ZWRLZXk/OiBOS1xuICAgICk6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlPT09XCJzdHJpbmdcIil7XG4gICAgICAgICAgICB2YWx1ZT12YWx1ZS5yZXBsYWNlKC9eXFx8LSQvLFwibm9ydGhcIikucmVwbGFjZSgvXi1cXHwkLyxcInNvdXRoXCIpO1xuICAgICAgICAgICAgY29uc3QgbWF0Y2g9dmFsdWUubWF0Y2goLyhbXFxkLl0rKShwdHxjbXxtbSkvKVxuICAgICAgICAgICAgaWYgKG1hdGNoKVxuICAgICAgICAgICAgdmFsdWU9dG9Qb2ludChOdW1iZXIobWF0Y2hbMV0pLG1hdGNoWzJdKVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ09iaiA9IHRoaXMgYXMgUmVjb3JkPHN0cmluZywgYW55PjtcblxuICAgICAgICBpZiAobmVzdGVkS2V5KSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGtleXMgPSB0eXBlb2YgbmVzdGVkS2V5ID09PSBcInN0cmluZ1wiID8gbmVzdGVkS2V5LnNwbGl0KCcuJykgOiBbbmVzdGVkS2V5XTtcbiAgICAgICAgICAgIHRoaXMudGlrenNldFxuICAgICAgICAgICAgaWYoIWZvcm1hdHRpbmdPYmpba2V5XSlmb3JtYXR0aW5nT2JqW2tleV09e307XG4gICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV1bbmVzdGVkS2V5XT12YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgIH1cbiAgICBcbiAgICBcbiAgICB0b1N0cmluZyhvYmo/OiBhbnkpOiBzdHJpbmcge1xuICAgICAgICBsZXQgc3RyaW5nPW9iaj8neyc6J1snO1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmo/b2JqOnRoaXMpKSB7XG4gICAgICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eKG1vZGV8dGlrenNldCkkLykpe2NvbnRpbnVlO31cbiAgICAgICAgICAgIGlmKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcmJnZhbHVlKXtcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW1hdGNoS2V5V2l0aFZhbHVlKGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nKSt0aGlzLnRvU3RyaW5nKHZhbHVlKSsnLCdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrKHR5cGVvZiB2YWx1ZT09PVwiYm9vbGVhblwiPycnOnZhbHVlKSsnLCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZysob2JqPyd9JzonXScpO1xuICAgIH1cblxuICAgIGhhbmRsZU9iamVjdFRvU3RyaW5nKG9iajogb2JqZWN0LCBwYXJlbnRLZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xuICAgIH1cbn1cbnR5cGUgTW9kZSA9IFwiY29vcmRpbmF0ZVwiIHwgXCJjb29yZGluYXRlLWlubGluZVwiIHwgXCJub2RlXCIgfCBcIm5vZGUtaW5saW5lXCI7XG5leHBvcnQgY2xhc3MgQ29vcmRpbmF0ZSB7XG4gICAgbW9kZTogTW9kZTtcbiAgICBheGlzPzogQXhpcztcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcbiAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZztcbiAgICBsYWJlbD86IHN0cmluZztcbiAgICBcbiAgICBjb25zdHJ1Y3Rvcihtb2RlPzogTW9kZSwgYXhpcz86IEF4aXMsIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nLCBmb3JtYXR0aW5nPzogRm9ybWF0dGluZywgbGFiZWw/OiBzdHJpbmcsKTtcbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zOiB7IG1vZGU/OiBNb2RlOyBheGlzPzogQXhpczsgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7IGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nOyBsYWJlbD86IHN0cmluZzsgIH0pO1xuXG5cbiAgY29uc3RydWN0b3IoXG4gICAgbW9kZT86IE1vZGUgfCB7IG1vZGU/OiBNb2RlOyBheGlzPzogQXhpczsgb3JpZ2luYWw/OiBzdHJpbmc7IGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nOyBmb3JtYXR0aW5nPzogRm9ybWF0dGluZzsgbGFiZWw/OiBzdHJpbmc7IH0sXG4gICAgYXhpcz86IEF4aXMsXG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmcsXG4gICAgZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsXG4gICAgbGFiZWw/OiBzdHJpbmcsXG4gICkgey8qXG4gICAgaWYgKHR5cGVvZiBtb2RlID09PSBcInN0cmluZ1wiKSB7XG5cbiAgICAgIHRoaXMubW9kZSA9IG1vZGU7XG4gICAgICBpZiAoYXhpcyAhPT0gdW5kZWZpbmVkKSB0aGlzLmF4aXMgPSBheGlzO1xuICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSA9IGNvb3JkaW5hdGVOYW1lO1xuICAgICAgaWYgKGZvcm1hdHRpbmcgIT09IHVuZGVmaW5lZCkgdGhpcy5mb3JtYXR0aW5nID0gZm9ybWF0dGluZztcbiAgICAgIHRoaXMubGFiZWwgPSBsYWJlbDtcblxuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZGUgPT09IFwib2JqZWN0XCIgJiYgbW9kZSAhPT0gbnVsbCkge1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IG1vZGU7XG4gICAgICBpZiAob3B0aW9ucy5tb2RlICE9PSB1bmRlZmluZWQpIHRoaXMubW9kZSA9IG9wdGlvbnMubW9kZTtcbiAgICAgIHRoaXMuYXhpcyA9IG9wdGlvbnMuYXhpcztcbiAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUgPSBvcHRpb25zLmNvb3JkaW5hdGVOYW1lO1xuICAgICAgdGhpcy5mb3JtYXR0aW5nID0gb3B0aW9ucy5mb3JtYXR0aW5nO1xuICAgICAgdGhpcy5sYWJlbCA9IG9wdGlvbnMubGFiZWw7XG4gICAgfVxuICAgIGlmICghdGhpcy5mb3JtYXR0aW5nKVxuICAgICAgICB0aGlzLmZvcm1hdHRpbmc9bmV3IEZvcm1hdHRpbmcodGhpcy5tb2RlLFtdKVxuXG4gICAgaWYgKHRoaXMubW9kZT09PVwiY29vcmRpbmF0ZVwiKXtcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nLmFzc2lnbkZvcm1hdHRpbmcoe2xhYmVsOiB7ZnJlZUZvcm1UZXh0OiB0aGlzLmxhYmVsfX0pO1xuICAgIH0qL1xuICB9XG5cbiAgICBjbG9uZSgpOiBDb29yZGluYXRlIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDb29yZGluYXRlKFxuICAgICAgICAgICAgdGhpcy5tb2RlLFxuICAgICAgICAgICAgdGhpcy5heGlzID8gdGhpcy5heGlzLmNsb25lKCkgOnVuZGVmaW5lZCxcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUsXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmcsXG4gICAgICAgICAgICB0aGlzLmxhYmVsLFxuICAgICAgICApO1xuICAgIH1cbiAgICBhZGRBeGlzKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyKXtcbiAgICAgICAgdGhpcy5heGlzPW5ldyBBeGlzKGNhcnRlc2lhblgsIGNhcnRlc2lhblksIHBvbGFyTGVuZ3RoLCBwb2xhckFuZ2xlKTtcbiAgICB9XG5cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJjb29yZGluYXRlXCI6XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuYFxcXFxjb29yZGluYXRlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpIHx8ICcnfSAoJHt0aGlzLmNvb3JkaW5hdGVOYW1lIHx8IFwiXCJ9KSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pO2BcbiAgICAgICAgICAgIGNhc2UgXCJub2RlXCI6XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuYXhpcylcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBcXFxcbm9kZSAke3RoaXMuY29vcmRpbmF0ZU5hbWU/JygnK3RoaXMuY29vcmRpbmF0ZU5hbWUrJyknOicnfSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfHwnJ30geyR7dGhpcy5sYWJlbH19O2BcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLWlubGluZVwiOlxuICAgICAgICAgICAgICAgIHJldHVybiBgbm9kZSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKSB8fCAnJ30geyR7dGhpcy5sYWJlbCB8fCAnJ319YFxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIG1vZGUgYXQgdG8gc3RyaW5nIGNvb3JkaW5hdGVcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbn1cblxuZXhwb3J0IHR5cGUgVG9rZW4gPUF4aXMgfCBDb29yZGluYXRlIHxEcmF3fEZvcm1hdHRpbmd8IHN0cmluZztcblxuZXhwb3J0IGNsYXNzIERyYXcge1xuICAgIG1vZGU6IHN0cmluZ1xuICAgIGZvcm1hdHRpbmc6IEZvcm1hdHRpbmc7XG4gICAgY29vcmRpbmF0ZXM6IGFueVtdPVtdO1xuXG5cbiAgICBjb25zdHJ1Y3Rvcihtb2RlOiBzdHJpbmcsZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsY29vcmRpbmF0ZXM/OiBhbnlbXSwgdG9rZW5zPzogRm9ybWF0VGlrempheCwpIHs7XG4gICAgICAgIHRoaXMubW9kZT1tb2RlO1xuICAgICAgICBpZihmb3JtYXR0aW5nKVxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPWZvcm1hdHRpbmc7XG4gICAgICAgIGlmKGNvb3JkaW5hdGVzKVxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcz1jb29yZGluYXRlcztcbiAgICB9XG4gICAgY3JlYXRlRnJvbUFycmF5KGFycjogYW55KXsvKlxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XG4gICAgICAgIGZvciAobGV0IGk9MDtpPGFyci5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGlmIChhcnJbaV0gaW5zdGFuY2VvZiBBeGlzfHxhcnJbaV0gaW5zdGFuY2VvZiBDb29yZGluYXRlKXtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYodHlwZW9mIGFycj09PVwic3RyaW5nXCIpe1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaChhcnJbaV0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5OyovXG4gICAgfVxuXG4gICAgZmlsbENvb3JkaW5hdGVzKHNjaGVtYXRpYzogYW55W10sIHRva2Vucz86IEZvcm1hdFRpa3pqYXgpIHtcbiAgICAgICAgaWYoc2NoZW1hdGljWzBdIGluc3RhbmNlb2YgRm9ybWF0dGluZyl7XG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9c2NoZW1hdGljWzBdXG4gICAgICAgICAgICBzY2hlbWF0aWMuc3BsaWNlKDAsMSlcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZWZlcmVuY2VGaXJzdEF4aXNNYXAgPSBzY2hlbWF0aWNcbiAgICAgICAgICAgIC5tYXAoKGNvb3IsIGluZGV4KSA9PiAoY29vciBpbnN0YW5jZW9mIEJhc2ljVGlrelRva2VuICYmIGNvb3IubmFtZSA9PT0gJ1JlZmVyZW5jZUZpcnN0QXhpcycgPyBpbmRleCA6IG51bGwpKVxuICAgICAgICAgICAgLmZpbHRlcigodCk6IHQgaXMgbnVtYmVyID0+IHQgIT09IG51bGwpOyBcblxuICAgICAgICBjb25zdCByZWZlcmVuY2VMYXN0QXhpc01hcCA9IHNjaGVtYXRpY1xuICAgICAgICAgICAgLm1hcCgoY29vciwgaW5kZXgpID0+IChjb29yIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW4gJiYgY29vci5uYW1lID09PSAnUmVmZXJlbmNlTGFzdEF4aXMnID8gaW5kZXggOiBudWxsKSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHQpOiB0IGlzIG51bWJlciA9PiB0ICE9PSBudWxsKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IG1hcHBlZFJlZmVyZW5jZXMgPSByZWZlcmVuY2VGaXJzdEF4aXNNYXAubWFwKGluZGV4ID0+IHtcbiAgICAgICAgICAgIHNjaGVtYXRpY1tpbmRleF0ubmFtZT0nQXhpc0Nvbm5lY3RlcidcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzSW5kZXggPSBzY2hlbWF0aWMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XG4gICAgICAgICAgICBjb25zdCBuZXh0QXhpcyA9IG5leHRBeGlzSW5kZXggIT09IC0xID8gc2NoZW1hdGljW2luZGV4ICsgMSArIG5leHRBeGlzSW5kZXhdIDogbnVsbDtcbiAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4gbmV4dEF4aXM7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcHMgPSByZWZlcmVuY2VMYXN0QXhpc01hcC5tYXAoaW5kZXggPT4ge1xuICAgICAgICAgICAgc2NoZW1hdGljW2luZGV4XS5uYW1lPSdBeGlzQ29ubmVjdGVyJ1xuICAgICAgICAgICAgY29uc3QgbmV4dEF4aXNJbmRleCA9IHNjaGVtYXRpYy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcbiAgICAgICAgICAgIGNvbnN0IG5leHRBeGlzID0gbmV4dEF4aXNJbmRleCAhPT0gLTEgPyBzY2hlbWF0aWNbaW5kZXggKyAxICsgbmV4dEF4aXNJbmRleF0gOiBudWxsO1xuXG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0F4aXNJbmRleCA9IHNjaGVtYXRpY1xuICAgICAgICAgICAgICAgIC5zbGljZSgwLCBpbmRleClcbiAgICAgICAgICAgICAgICAucmV2ZXJzZSgpXG4gICAgICAgICAgICAgICAgLmZpbmRJbmRleChpdGVtID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcblxuICAgICAgICAgICAgY29uc3QgcHJldmlvdXNBeGlzID0gcHJldmlvdXNBeGlzSW5kZXggIT09IC0xID8gc2NoZW1hdGljW2luZGV4IC0gMSAtIHByZXZpb3VzQXhpc0luZGV4XSA6IG51bGw7XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcmVmZXJlbmNlRmlyc3RBeGlzOiBzY2hlbWF0aWNbaW5kZXhdLFxuICAgICAgICAgICAgICAgIHByZXZpb3VzQXhpcyxcbiAgICAgICAgICAgICAgICBuZXh0QXhpcyxcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pO1xuICAgICAgICBpZihtYXBwZWRSZWZlcmVuY2VzLmxlbmd0aD4wKXtcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0QXhpcz1zY2hlbWF0aWMuZmluZCh0PT50IGluc3RhbmNlb2YgQXhpcylcbiAgICAgICAgICAgIG1hcHBlZFJlZmVyZW5jZXMuZm9yRWFjaChheGlzID0+IHtcbiAgICAgICAgICAgICAgICBheGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoZmlyc3RBeGlzLFwiYWRkaXRpb25cIilcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhtYXBwZWRSZWZlcmVuY2VzKVxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2cocmVmZXJlbmNlRmlyc3RBeGlzTWFwLHJlZmVyZW5jZUxhc3RBeGlzTWFwKVxuXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXM9c2NoZW1hdGljO1xuICAgICAgICByZXR1cm4gdGhpc1xuICAgICAgICBcbiAgICAgICAgLypcbiAgICAgICAgY29uc3QgY29vckFycjogQXJyYXk8VG9rZW4+PVtdO1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjaGVtYXRpYy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHNjaGVtYXRpY1tpXS50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xuICAgICAgICAgICAgICAgIGxldCBwcmV2aW91c0Zvcm1hdHRpbmc7XG5cbiAgICAgICAgICAgICAgICBpZiAoaSA+IDAgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDFdLnZhbHVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA+IDEgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcIm5vZGVcIiAmJiBzY2hlbWF0aWNbaSAtIDJdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMl0udmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChuZXcgQXhpcygpLnVuaXZlcnNhbChzY2hlbWF0aWNbaV0udmFsdWUsIHRva2VucywgY29vckFyciwgcHJldmlvdXNGb3JtYXR0aW5nLCApKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZihzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJub2RlXCIpe1xuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChuZXcgQ29vcmRpbmF0ZSh7bGFiZWw6IHNjaGVtYXRpY1tpXS52YWx1ZSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGUtaW5saW5lXCIse30sc2NoZW1hdGljW2ldLmZvcm1hdHRpbmcpLG1vZGU6IFwibm9kZS1pbmxpbmVcIn0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2V7XG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKHNjaGVtYXRpY1tpXS52YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvb3JBcnI7Ki9cbiAgICB9XG5cbiAgICBnZXRTY2hlbWF0aWMoZHJhdzogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4PWdldFJlZ2V4KCk7XG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gcmVnRXhwKFN0cmluZy5yYXdgbm9kZVxccypcXFs/KCR7cmVnZXguZm9ybWF0dGluZ30qKVxcXT9cXHMqeygke3JlZ2V4LnRleHR9Kil9YCk7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRpbmdSZWdleCA9IC8oLS1jeWNsZXxjeWNsZXwtLVxcK1xcK3wtLVxcK3wtLXwtXFx8fFxcfC18Z3JpZHxjaXJjbGV8cmVjdGFuZ2xlKS87XG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHNcXC0sLjpgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoXFwoWyR7Y2F9XStcXCl8XFwoXFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitcXC1dK1xcKFske2NhfV0rXFwpXFwkXFwpKWApO1xuICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgIGxldCBsb29wcyA9IDA7XG4gICAgICAgIFxuICAgICAgICB3aGlsZSAoaSA8IGRyYXcubGVuZ3RoICYmIGxvb3BzIDwgMTAwKSB7IC8vIEluY3JlYXNlIGxvb3AgbGltaXQgb3IgYWRkIGNvbmRpdGlvbiBiYXNlZCBvbiBwYXJzZWQgbGVuZ3RoXG4gICAgICAgICAgICBsb29wcysrO1xuICAgICAgICAgICAgY29uc3QgY29vcmRpbmF0ZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChjb29yZGluYXRlUmVnZXgpO1xuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlTWF0Y2g/LmluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJjb29yZGluYXRlXCIsIHZhbHVlOiBjb29yZGluYXRlTWF0Y2hbMV0gfSk7XG4gICAgICAgICAgICAgICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleCk7XG4gICAgICAgICAgICBpZiAoZm9ybWF0dGluZ01hdGNoPy5pbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGkgKz0gZm9ybWF0dGluZ01hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpO1xuICAgICAgICAgICAgaWYgKG5vZGVNYXRjaD8uaW5kZXggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm5vZGVcIixcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGluZzogbm9kZU1hdGNoWzFdIHx8IFwiXCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBub2RlTWF0Y2hbMl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpICs9IG5vZGVNYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvb3BzID09PSAxMDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBhcnNpbmcgZXhjZWVkZWQgc2FmZSBsb29wIGNvdW50XCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xuICAgIH1cblxuICAgIGlzQ29vcmRpbmF0ZShvYmo6IGFueSk6IG9iaiBpcyBDb29yZGluYXRlIHtcbiAgICAgICAgcmV0dXJuIG9iaiAmJiBvYmogaW5zdGFuY2VvZiBDb29yZGluYXRlO1xuICAgIH1cbiAgICB0b1N0cmluZ0RyYXcoKXtcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKX0gYDtcbiAgICAgICAgdGhpcy5jb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgY29vcmRpbmF0ZSBpbnN0YW5jZW9mIENvb3JkaW5hdGUmJmNvb3JkaW5hdGUubW9kZT09PVwibm9kZS1pbmxpbmVcIjoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQmFzaWNUaWt6VG9rZW46IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGNvb3JkaW5hdGUudG9TdHJpbmcoKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9YCgke2Nvb3JkaW5hdGUudG9TdHJpbmcoKX0pYFxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcbiAgICB9XG5cbiAgICB0b1N0cmluZ1BpYygpe1xuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3IHBpYyAke3RoaXMuZm9ybWF0dGluZy50b1N0cmluZygpfHwnJ30ge2FuZ2xlID0gJHsodGhpcy5jb29yZGluYXRlc1swXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1sxXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1syXSBhcyBBeGlzKS5uYW1lfX0gYDtcbiAgICAgXG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xuICAgIH1cblxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICBpZiAodGhpcy5tb2RlPT09J2RyYXcnKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmdEcmF3KCk7XG4gICAgICAgIGlmKHRoaXMubW9kZT09PSdkcmF3LXBpYy1hbmcnKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmdQaWMoKVxuICAgICAgICBcbiAgICB9XG59XG5cblxuXG4gIFxuXG5cblxuXG5cblxuZnVuY3Rpb24gZGlzc2VjdFhZYXhpcyhtYXRjaDogUmVnRXhwTWF0Y2hBcnJheSkge1xuICAgIGxldCBYbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiLCBZbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiO1xuXG4gICAgaWYgKG1hdGNoWzFdICYmIG1hdGNoWzJdKSB7XG4gICAgICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcbiAgICAgICAgWW5vZGUgPSBtYXRjaFsyXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xuICAgICAgICBYbm9kZT1Ybm9kZVswXS5zdWJzdHJpbmcoMSxYbm9kZS5sZW5ndGgpXG4gICAgICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgICAgdHlwZTogXCJ4eWF4aXNcIixcbiAgICAgICAgWGZvcm1hdHRpbmc6IG1hdGNoWzFdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcbiAgICAgICAgWWZvcm1hdHRpbmc6IG1hdGNoWzJdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcbiAgICAgICAgeERpcmVjdGlvbjogbWF0Y2hbMV0gJiYgLy0+Ly50ZXN0KG1hdGNoWzFdKSA/IFwibGVmdFwiIDogXCJyaWdodFwiLFxuICAgICAgICB5RGlyZWN0aW9uOiBtYXRjaFsyXSAmJiAvLT4vLnRlc3QobWF0Y2hbMl0pID8gXCJkb3duXCIgOiBcInVwXCIsXG4gICAgICAgIFhub2RlOiBYbm9kZSxcbiAgICAgICAgWW5vZGU6IFlub2RlLFxuICAgIH07XG59XG5cblxuXG5cblxuXG5cblxuXG5cblxuXG4vKlxuZnVuY3Rpb24gZ2VuZXJhdGVGb3JtYXR0aW5nKGNvb3JkaW5hdGU6IENvb3JkaW5hdGUpe1xuICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZS5sYWJlbCAhPT0gXCJzdHJpbmdcIil7IHJldHVybiBcIlwiOyB9XG4gICAgY29uc3QgZm9ybWF0dGluZyA9IGNvb3JkaW5hdGUuZm9ybWF0dGluZz8uc3BsaXQoXCIsXCIpIHx8IFtdO1xuICAgIGlmIChmb3JtYXR0aW5nLnNvbWUoKHZhbHVlOiBzdHJpbmcpID0+IC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLnRlc3QodmFsdWUpKSkge1xuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZS5mb3JtYXR0aW5nO1xuICAgIH1cbiAgICBpZihmb3JtYXR0aW5nLmxlbmd0aD4wJiYhZm9ybWF0dGluZ1tmb3JtYXR0aW5nLmxlbmd0aC0xXS5lbmRzV2l0aChcIixcIikpe2Zvcm1hdHRpbmcucHVzaChcIixcIil9XG4gICAgc3dpdGNoKGNvb3JkaW5hdGUucXVhZHJhbnQpe1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIHJpZ2h0LCBcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIGxlZnQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgbGVmdCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA0OiBcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgcmlnaHQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBmb3JtYXR0aW5nLmpvaW4oXCJcIik7XG59XG4qL1xuXG4iXX0=