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
export const arrToRegexString = (arr) => '(' + arr.join('|') + ')';
export function regExp(pattern, flags = '') {
    pattern = pattern instanceof RegExp ? pattern.source : pattern;
    return new RegExp(String.raw `${pattern}`, flags ? flags : '');
}
function getRegex() {
    const basic = String.raw `[\w\d\s-,.:]`;
    return {
        basic: basic,
        merge: String.raw `-\||\|-|![\d.]+!|\+|-`,
        //coordinate: new RegExp(String.raw`(${basic}+|1)`),
        coordinateName: String.raw `[\w_\d\s]`,
        text: String.raw `[\w\s-,.:$(!)_+\\{}=]`,
        formatting: String.raw `[\w\s\d=:,!';&*{}%-<>]`
    };
}
const parseNumber = (value) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};
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
function toPoint(value, format) {
    switch (format) {
        case "pt":
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
    constructor(mode, formattingArr, formattingString) {
        this.mode = mode;
        this.assignFormatting(formattingArr || []);
        this.interpretFormatting(formattingString || "");
        return this;
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
    assignFormatting(formattingArr) {
        for (const [key, value] of Object.entries(formattingArr)) {
            if (typeof value === "object" && value !== null && !this[key]) {
                this[key] = {};
            }
            if (value !== undefined && value !== null) {
                this.setProperty(key, value);
            }
        }
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
            // Handle nested properties
            const match = formatting.match(/^([^=]+)={(.*)}$/);
            if (match) {
                const [_, parent, children] = match;
                const formattingObj = this;
                if (!formattingObj[parent]) {
                    formattingObj[parent] = {};
                }
                const parsedChild = new Formatting(this.mode, {}, children);
                Object.assign(formattingObj[parent], parsedChild[parent]);
                return;
            }
            for (const [pattern, handler] of Object.entries(patterns)) {
                if (new RegExp(pattern).test(formatting)) {
                    handler(formatting);
                    return;
                }
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
        if (typeof mode === "string") {
            this.mode = mode;
            if (axis !== undefined)
                this.axis = axis;
            this.coordinateName = coordinateName;
            if (formatting !== undefined)
                this.formatting = formatting;
            this.label = label;
        }
        else if (typeof mode === "object" && mode !== null) {
            const options = mode;
            if (options.mode !== undefined)
                this.mode = options.mode;
            this.axis = options.axis;
            this.coordinateName = options.coordinateName;
            this.formatting = options.formatting;
            this.label = options.label;
        }
        if (!this.formatting)
            this.formatting = new Formatting(this.mode, []);
        if (this.mode === "coordinate") {
            this.formatting.assignFormatting({ label: { freeFormText: this.label } });
        }
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
    coordinates;
    constructor(mode, formatting, draw, tokens) {
        if (typeof mode === "string" || typeof draw === "string") {
            this.mode = `draw${mode ? "-" + mode : ""}`;
            this.formatting = new Formatting(this.mode, {}, formatting);
            if (draw)
                this.coordinates = this.fillCoordinates(this.getSchematic(draw), tokens);
        }
        else if (mode && typeof mode === "object") {
            const options = mode;
            this.mode = `draw${options?.mode ? "-" + options.mode : ""}`;
            if (!options?.formatting)
                this.formatting = new Formatting(this.mode, options?.formattingObj, options?.formattingString);
            else
                this.formatting = options.formatting;
            if (options?.drawArr)
                this.coordinates = options.drawArr;
            else if (options.drawString !== undefined) {
                this.coordinates = this.fillCoordinates(this.getSchematic(options.drawString), tokens);
            }
        }
    }
    createFromArray(arr) {
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
                coorArr.push(new Coordinate({ label: schematic[i].value, formatting: new Formatting("node-inline", {}, schematic[i].formatting), mode: "node-inline" }));
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
export class FormatTikzjax {
    source;
    tokens = [];
    //midPoint: Axis;
    viewAnchors;
    processedCode = "";
    debugInfo = "";
    constructor(source) {
        if (typeof source === "string") {
            this.source = this.tidyTikzSource(source);
            this.tokenize();
        }
        else {
            this.tokens = source;
        }
        if (typeof source === "string" && source.match(/(usepackage|usetikzlibrary)/)) {
            this.processedCode = source;
        }
        else {
            this.debugInfo += this.source;
            this.findViewAnchors();
            this.applyPostProcessing();
            this.debugInfo += "\n\nthis.midPoint:\n" + JSON.stringify(this.viewAnchors, null, 1) + "\n";
            this.debugInfo += JSON.stringify(this.tokens, null, 1) + "\n\n";
            this.processedCode += this.toString();
            this.debugInfo += this.processedCode;
        }
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
        const flatAxes = flatten(this.tokens).filter((item) => item instanceof Axis);
        flatAxes.forEach((axis) => {
            axis.addQuadrant(this.viewAnchors.aveMidPoint);
        });
        const flatDraw = flatten(this.tokens, [], Draw).filter((item) => item instanceof Draw);
        flatDraw.forEach((draw) => {
            for (const [index, coor] of draw.coordinates.entries()) {
                if (coor instanceof Coordinate) {
                    coor.formatting?.addSplopAndPosition(draw.coordinates, index);
                }
            }
        });
    }
    getCode() {
        if (typeof this.source === "string" && this.source.match(/(usepackage|usetikzlibrary)/))
            return this.processedCode;
        return getPreamble() + this.processedCode + "\n\\end{tikzpicture}\\end{document}";
    }
    tokenize() {
        const ca = String.raw `\w\d\s-,.:|`; // Define allowed characters for `ca`
        const c = String.raw `[$(]{0,2}[${ca}]+[)$]{0,2}|\$\([${ca}]+\)[${ca}!:+]+\([${ca}]+\)\$`;
        // Define `coorRegex` with escaped characters for specific matching
        const cn = String.raw `[\w_\d\s]`; // Coordinate name
        const t = String.raw `\"?\$[\w\d\s\-,.:(!)\-\{\}\+\\ ^]*\$\"?|[\w\d\s\-,.:(!)_\-\+\\^]*`; // Text with specific characters
        const f = String.raw `[\w\s\d=:,!';.&*\{\}%\-<>]`; // Formatting with specific characters
        // Define `coorRegex` using escaped braces and patterns
        const coorRegex = new RegExp(String.raw `\\coor\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const picRegex = new RegExp(String.raw `\\pic\{(${c})\}\{(${c})\}\{(${c})\}\{(${t})\}\{(${f}*)\}`, "g");
        const nodeRegex = new RegExp(String.raw `\\node\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const se = new RegExp(String.raw `\\node\s*\(*(${cn})\)*\s*at\s*\((${c})\)\s*\[(${f}*)\]\s*\{(${t})\}`, "g");
        const ss = new RegExp(String.raw `\\coordinate\s*(\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\])?\s*\((${cn}+)\)\s*at\s*\((${c})\);`, "g");
        const drawRegex = new RegExp(String.raw `\\draw\[(${f}*)\]([^;]*);`, "g");
        const xyaxisRegex = new RegExp(String.raw `\\xyaxis{(${t})}{(${t})}`, "g");
        const gridRegex = new RegExp(String.raw `\\grid{([\d-.]+)}`, "g");
        const circleRegex = new RegExp(String.raw `\\circle\{(${c}+)\}\{(${c}+)\}\{(${c}+)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw `\\mass\{(${c})\}\{(${t})\}\{(-\||\||>){0,1}\}\{([\d.]*)\}`, "g");
        //\pic{anc2}{anc1}{anc0}{75^\circ }{};
        const vecRegex = new RegExp(String.raw `\\vec\{(${c})\}\{(${c})\}\{(${t})\}\{(${f}*)\}`, "g");
        const regexPatterns = [coorRegex, se, ss, nodeRegex, drawRegex, circleRegex, massRegex, vecRegex, picRegex];
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
                const { formatting, original, ...rest } = i;
                this.tokens.push(new Coordinate({ mode: "coordinate", axis: new Axis().universal(original, this), formatting: new Formatting("coordinate", formatting), ...rest, }));
            }
            else if (match[0].startsWith("\\pic")) {
                const c1 = new Axis().universal(match[1], this);
                const c2 = new Axis().universal(match[2], this);
                const c3 = new Axis().universal(match[3], this);
                this.tokens.push(new Draw({ mode: "pic-ang", tokens: this, formattingString: match[5], formattingObj: { tikzset: "ang", icText: match[4] }, drawArr: [c1, c2, c3] }));
            }
            else if (match[0].startsWith("\\draw")) {
                this.tokens.push(new Draw(undefined, match[1], match[2], this));
            }
            else if (match[0].startsWith("\\xyaxis")) {
            }
            else if (match[0].startsWith("\\grid")) {
                //this.tokens.push({type: "grid", rotate: match[1]});
            }
            else if (match[0].startsWith("\\node")) {
                let i = { original: match[1], coordinateName: match[3], label: match[4], formatting: match[3] };
                if (match[0].match(/\\node\s*\(/)) {
                    Object.assign(i, { original: match[2], coordinateName: match[1], label: match[3], formatting: match[4] });
                }
                const { formatting, original, ...rest } = i;
                this.tokens.push(new Coordinate({ mode: "node", axis: new Axis().universal(original, this), formatting: new Formatting("node", formatting), ...rest, }));
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
                this.tokens.push(new Coordinate({ mode: "node", label: match[2], axis: new Axis().universal(match[1], this), formatting: new Formatting("node", { tikzset: 'mass', anchor: match[3], rotate: match[4] }) }));
            }
            else if (match[0].startsWith("\\vec")) {
                const ancer = new Axis().universal(match[1], this);
                const axis1 = new Axis().universal(match[2], this);
                const node = new Coordinate({ mode: "node-inline", formatting: new Formatting('node-inline', { color: "red" }) });
                const c1 = new Coordinate("node-inline");
                const q = [ancer, '--+', node, axis1];
                this.tokens.push(new Draw({ formattingObj: { tikzset: 'vec' }, tokens: this, drawArr: q }));
            }
            if (match.index !== undefined) {
                currentIndex = match.index + match[0].length;
            }
        }
        if (currentIndex < this.source.length) {
            this.tokens.push(this.source.slice(currentIndex));
        }
    }
    getMin() { return this.viewAnchors.min; }
    getMax() { return this.viewAnchors.max; }
    findViewAnchors() {
        const axes = flatten(this.tokens).filter((item) => item instanceof Axis);
        let sumOfX = 0, sumOfY = 0;
        let maxX = -Infinity, maxY = -Infinity;
        let minX = Infinity, minY = Infinity;
        this.viewAnchors = {
            max: new Axis(0, 0),
            min: new Axis(0, 0),
            aveMidPoint: new Axis(0, 0)
        };
        axes.forEach((axis) => {
            const { cartesianX, cartesianY } = axis;
            // Update sums for average calculation
            sumOfX += cartesianX;
            sumOfY += cartesianY;
            // Update max and min coordinates
            if (cartesianX > maxX)
                maxX = cartesianX;
            if (cartesianY > maxY)
                maxY = cartesianY;
            if (cartesianX < minX)
                minX = cartesianX;
            if (cartesianY < minY)
                minY = cartesianY;
        });
        const length = axes.length !== 0 ? axes.length : 1;
        // Set the viewAnchors
        this.viewAnchors.aveMidPoint = new Axis(sumOfX / length, sumOfY / length);
        this.viewAnchors.max = new Axis(maxX, maxY);
        this.viewAnchors.min = new Axis(minX, minY);
    }
    findOriginalValue(value) {
        const og = this.tokens.slice().reverse().find((token) => (token instanceof Coordinate) && token.coordinateName === value);
        return og instanceof Coordinate ? og.clone() : undefined;
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
function flatten(data, results = [], stopClass) {
    if (Array.isArray(data)) {
        for (const item of data) {
            flatten(item, results, stopClass);
        }
    }
    else if (typeof data === 'object' && data !== null) {
        // If the object is an instance of the stopClass, add it to results and stop flattening
        if (stopClass && data instanceof stopClass) {
            results.push(data);
            return results;
        }
        // Add the current object to results
        results.push(data);
        // Recursively flatten properties of the object
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                flatten(data[key], results, stopClass);
            }
        }
    }
    return results;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUlqRCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUM3RSxJQUFJLENBQUMsV0FBVyxDQUFDLE1B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Q0FBQyxDQUFDO1NBQ2xDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxPQUFPO1FBQ0gsSUFBSSxFQUFDLElBQUksRUFBQyxJQUFJLEVBQUMsSUFBSTtLQUN0QixDQUFDO0FBQ0YsQ0FBQztBQUtEOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUF3QkU7QUFHRixTQUFTLFdBQVc7SUFDaEIsTUFBTSxHQUFHLEdBQUMsb0xBQW9MLENBQUE7SUFFOUwsTUFBTSxJQUFJLEdBQUMsNkxBQTZMLENBQUE7SUFFeE0sTUFBTSxHQUFHLEdBQUMsb05BQW9OLENBQUE7SUFDOU4sTUFBTSxJQUFJLEdBQUMsd1JBQXdSLENBQUE7SUFDblMsTUFBTSxNQUFNLEdBQUMsMGdCQUEwZ0IsQ0FBQTtJQUV2aEIsTUFBTSxJQUFJLEdBQUMsaUtBQWlLLENBQUE7SUFFNUssTUFBTSxLQUFLLEdBQUMsNldBQTZXLENBQUE7SUFDelgsTUFBTSxJQUFJLEdBQUMsK0VBQStFLENBQUE7SUFDMUYsaUdBQWlHO0lBQ2pHLE1BQU0sT0FBTyxHQUFDLHNLQUFzSyxDQUFBO0lBRXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBQ2xRLE9BQU8sUUFBUSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxpRUFBaUUsQ0FBQTtBQUM3SSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBNYXJrZG93blZpZXcsIFdvcmtzcGFjZVdpbmRvdyB9IGZyb20gXCJvYnNpZGlhblwiO1xuaW1wb3J0IE1hdGhQbHVnaW4gZnJvbSBcInNyYy9tYWluXCI7XG5pbXBvcnQgeyBvcHRpbWl6ZSB9IGZyb20gXCIuL3N2Z28uYnJvd3Nlci5qc1wiO1xuLy8gQHRzLWlnbm9yZVxuaW1wb3J0IHRpa3pqYXhKcyBmcm9tIFwiaW5saW5lOi4vdGlrempheC5qc1wiO1xuaW1wb3J0IHsgY2FydGVzaWFuVG9Qb2xhciwgZmluZEludGVyc2VjdGlvblBvaW50LCBmaW5kU2xvcGUsIHBvbGFyVG9DYXJ0ZXNpYW4sIHRvTnVtYmVyIH0gZnJvbSBcInNyYy9tYXRoVXRpbGl0aWVzLmpzXCI7XG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcblxuXG5cbmV4cG9ydCBjbGFzcyBUaWt6amF4IHtcbiAgICBhcHA6IEFwcDtcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XG4gICAgYWN0aXZlVmlldzogTWFya2Rvd25WaWV3IHwgbnVsbDtcblxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xuICAgICAgdGhpcy5hcHA9YXBwO1xuICAgICAgdGhpcy5hY3RpdmVWaWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcbiAgICB9XG4gICAgXG4gICAgcmVhZHlMYXlvdXQoKXtcbiAgICAgIHRoaXMucGx1Z2luLmFwcC53b3Jrc3BhY2Uub25MYXlvdXRSZWFkeSgoKSA9PiB7XG4gICAgICAgIHRoaXMubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCk7XG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XG4gICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9KSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgXG4gIFxuICAgIGxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcbiAgICAgICAgY29uc3QgcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzY3JpcHRcIik7XG4gICAgICAgIHMuaWQgPSBcInRpa3pqYXhcIjtcbiAgICAgICAgcy50eXBlID0gXCJ0ZXh0L2phdmFzY3JpcHRcIjtcbiAgICAgICAgcy5pbm5lclRleHQgPSB0aWt6amF4SnM7XG4gICAgICAgIGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xuICAgICAgICBkb2MuYWRkRXZlbnRMaXN0ZW5lcihcInRpa3pqYXgtbG9hZC1maW5pc2hlZFwiLCB0aGlzLnBvc3RQcm9jZXNzU3ZnKTtcbiAgICB9XG4gIFxuICAgIHVubG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xuICAgICAgICBjb25zdCBzID0gZG9jLmdldEVsZW1lbnRCeUlkKFwidGlrempheFwiKTtcbiAgICAgICAgcz8ucmVtb3ZlKCk7XG5cbiAgICAgICAgZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XG4gICAgfVxuICBcbiAgICBsb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XG4gICAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICB9XG4gIFxuICAgIHVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xuICAgICAgICAgICAgdGhpcy51bmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICB9XG4gIFxuICAgIGdldEFsbFdpbmRvd3MoKSB7XG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBbXTtcbiAgICAgICAgXG4gICAgICAgIC8vIHB1c2ggdGhlIG1haW4gd2luZG93J3Mgcm9vdCBzcGxpdCB0byB0aGUgbGlzdFxuICAgICAgICB3aW5kb3dzLnB1c2godGhpcy5hcHAud29ya3NwYWNlLnJvb3RTcGxpdC53aW4pO1xuICAgICAgICBcbiAgICAgICAgLy8gQHRzLWlnbm9yZSBmbG9hdGluZ1NwbGl0IGlzIHVuZG9jdW1lbnRlZFxuICAgICAgICBjb25zdCBmbG9hdGluZ1NwbGl0ID0gdGhpcy5hcHAud29ya3NwYWNlLmZsb2F0aW5nU3BsaXQ7XG4gICAgICAgIGZsb2F0aW5nU3BsaXQuY2hpbGRyZW4uZm9yRWFjaCgoY2hpbGQ6IGFueSkgPT4ge1xuICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBhIHdpbmRvdywgcHVzaCBpdCB0byB0aGUgbGlzdCBcbiAgICAgICAgICAgIGlmIChjaGlsZCBpbnN0YW5jZW9mIFdvcmtzcGFjZVdpbmRvdykge1xuICAgICAgICAgICAgICAgIHdpbmRvd3MucHVzaChjaGlsZC53aW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gd2luZG93cztcbiAgICB9XG4gIFxuICBcbiAgICByZWdpc3RlclRpa3pDb2RlQmxvY2soKSB7XG4gICAgICAgICAgdGhpcy5wbHVnaW4ucmVnaXN0ZXJNYXJrZG93bkNvZGVCbG9ja1Byb2Nlc3NvcihcInRpa3pcIiwgKHNvdXJjZSwgZWwsIGN0eCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZWwuY3JlYXRlRWwoXCJkaXZcIiksIHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXG4gICAgICAgICAgICAgICAgdGV4dENvbnRlbnQ6IFwi8J+biFwiLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICBjb25zdCBzY3JpcHQgPSBlbC5jcmVhdGVFbChcInNjcmlwdFwiKTtcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcbiAgICAgICAgICAgIGNvbnN0IHRpa3pqYXg9bmV3IEZvcm1hdFRpa3pqYXgoc291cmNlKTtcbiAgICAgICAgICAgIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLHRpa3pqYXguZGVidWdJbmZvKS5vcGVuKCk7XG4gICAgICAgICAgICBzY3JpcHQuc2V0VGV4dCh0aWt6amF4LmdldENvZGUoKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaChlKXtcbiAgICAgICAgICAgICAgICBlbC5pbm5lckhUTUwgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVycm9yRGlzcGxheSA9IGVsLmNyZWF0ZUVsKFwiZGl2XCIsIHsgY2xzOiBcIm1hdGgtZXJyb3ItbGluZVwiIH0pO1xuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5pbm5lclRleHQgPSBgRXJyb3I6ICR7ZS5tZXNzYWdlfWA7XG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmNsYXNzTGlzdC5hZGQoXCJlcnJvci10ZXh0XCIpO1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJUaWtaIFByb2Nlc3NpbmcgRXJyb3I6XCIsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgfVxuICBcbiAgICAgIGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8ucHVzaCh7bmFtZTogXCJUaWt6XCIsIG1pbWU6IFwidGV4dC94LWxhdGV4XCIsIG1vZGU6IFwic3RleFwifSk7XG4gICAgICB9XG4gIFxuICAgICAgcmVtb3ZlU3ludGF4SGlnaGxpZ2h0aW5nKCkge1xuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mbyA9IHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLmZpbHRlcihlbCA9PiBlbC5uYW1lICE9IFwiVGlrelwiKTtcbiAgICAgIH1cblxuICBcbiAgICAgIGNvbG9yU1ZHaW5EYXJrTW9kZShzdmc6IHN0cmluZykge1xuICAgICAgICBzdmcgPSBzdmcucmVwbGFjZUFsbCgvKFwiIzAwMFwifFwiYmxhY2tcIikvZywgXCJcXFwiY3VycmVudENvbG9yXFxcIlwiKVxuICAgICAgICAgICAgICAgIC5yZXBsYWNlQWxsKC8oXCIjZmZmXCJ8XCJ3aGl0ZVwiKS9nLCBcIlxcXCJ2YXIoLS1iYWNrZ3JvdW5kLXByaW1hcnkpXFxcIlwiKTtcbiAgICAgICAgcmV0dXJuIHN2ZztcbiAgICAgIH1cbiAgXG4gIFxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcbiAgICAgICAgICByZXR1cm4gb3B0aW1pemUoc3ZnLCB7cGx1Z2luczpcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IFwicHJlc2V0LWRlZmF1bHRcIixcbiAgICAgICAgICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGVhbnVwSURzOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgIH0pPy5kYXRhO1xuICAgICAgfVxuICBcbiAgXG4gICAgICBwb3N0UHJvY2Vzc1N2ZyA9IChlOiBFdmVudCkgPT4ge1xuICBcbiAgICAgICAgICBjb25zdCBzdmdFbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIGxldCBzdmcgPSBzdmdFbC5vdXRlckhUTUw7XG4gIFxuICAgICAgICAgIGlmICh0aGlzLnBsdWdpbi5zZXR0aW5ncy5pbnZlcnRDb2xvcnNJbkRhcmtNb2RlKSB7XG4gICAgICAgICAgICBzdmcgPSB0aGlzLmNvbG9yU1ZHaW5EYXJrTW9kZShzdmcpO1xuICAgICAgICAgIH1cbiAgXG4gICAgICAgICAgc3ZnID0gdGhpcy5vcHRpbWl6ZVNWRyhzdmcpO1xuICBcbiAgICAgICAgICBzdmdFbC5vdXRlckhUTUwgPSBzdmc7XG4gICAgICB9XG59XG5leHBvcnQgY29uc3QgYXJyVG9SZWdleFN0cmluZz0oYXJyOiBBcnJheTxzdHJpbmc+KT0+JygnK2Fyci5qb2luKCd8JykrJyknO1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcgfCBSZWdFeHB8QXJyYXk8c3RyaW5nPiwgZmxhZ3M6IHN0cmluZyA9ICcnKTogUmVnRXhwIHtcbiAgICBwYXR0ZXJuPXBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHA/cGF0dGVybi5zb3VyY2U6cGF0dGVybjtcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChTdHJpbmcucmF3YCR7cGF0dGVybn1gLCBmbGFncz9mbGFnczonJyk7XG59XG5cbmZ1bmN0aW9uIGdldFJlZ2V4KCl7XG4gICAgY29uc3QgYmFzaWMgPSBTdHJpbmcucmF3YFtcXHdcXGRcXHMtLC46XWA7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgYmFzaWM6IGJhc2ljLFxuICAgICAgICBtZXJnZTogU3RyaW5nLnJhd2AtXFx8fFxcfC18IVtcXGQuXSshfFxcK3wtYCxcbiAgICAgICAgLy9jb29yZGluYXRlOiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKCR7YmFzaWN9K3wxKWApLFxuICAgICAgICBjb29yZGluYXRlTmFtZTogU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gLFxuICAgICAgICB0ZXh0OiBTdHJpbmcucmF3YFtcXHdcXHMtLC46JCghKV8rXFxcXHt9PV1gLFxuICAgICAgICBmb3JtYXR0aW5nOiBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsmKnt9JS08Pl1gXG4gICAgfTtcbn1cblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuaW50ZXJmYWNlIHRva2VuICB7XG4gICAgWD86IG51bWJlcjtcbiAgICBZPzogbnVtYmVyO1xuICAgIHR5cGU/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7XG4gICAgY29vcmRpbmF0ZXM/OiBhbnk7XG59XG5cblxuXG5cbmNvbnN0IHBhcnNlTnVtYmVyID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XG59O1xuXG5cbmZ1bmN0aW9uIGZpbmRCZWZvcmVBZnRlckF4aXMoYXhlczogQXJyYXk8QXhpcyB8IHN0cmluZz4sIGluZGV4OiBudW1iZXIpOiB7IGJlZm9yZTogbnVtYmVyLCBhZnRlcjogbnVtYmVyIH0ge1xuICAgIFxuICAgIGxldCBiZWZvcmVJbmRleCA9IGF4ZXMuc2xpY2UoMCwgaW5kZXgpLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIGxldCBhZnRlckluZGV4ID0gYXhlcy5zbGljZShpbmRleCArIDEpLmZpbmRJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XG5cbiAgICAvLyBBZGp1c3QgYGFmdGVySW5kZXhgIHNpbmNlIHdlIHNsaWNlZCBmcm9tIGBpbmRleCArIDFgXG4gICAgaWYgKGFmdGVySW5kZXggIT09IC0xKSB7XG4gICAgICAgIGFmdGVySW5kZXggKz0gaW5kZXggKyAxO1xuICAgIH1cblxuICAgIC8vIFdyYXAgYXJvdW5kIGlmIG5vdCBmb3VuZFxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgYmVmb3JlSW5kZXggPSBheGVzLmZpbmRMYXN0SW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIH1cblxuICAgIGlmIChhZnRlckluZGV4ID09PSAtMSkge1xuICAgICAgICBhZnRlckluZGV4ID0gYXhlcy5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xuICAgIH1cbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IC0xIHx8IGFmdGVySW5kZXggPT09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgdmFsaWQgQXhpcyBvYmplY3RzLlwiKTtcbiAgICB9XG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSBhZnRlckluZGV4KSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlByYWlzZWQgYXhpcyBhcyBzYW1lIHRva2VuXCIpO1xuICAgIH1cbiAgICByZXR1cm4geyBiZWZvcmU6IGJlZm9yZUluZGV4LCBhZnRlcjogYWZ0ZXJJbmRleCB9O1xufVxuXG5cbmV4cG9ydCBjbGFzcyBBeGlzIHtcbiAgICBjYXJ0ZXNpYW5YOiBudW1iZXI7XG4gICAgY2FydGVzaWFuWTogbnVtYmVyO1xuICAgIHBvbGFyQW5nbGU6IG51bWJlcjtcbiAgICBwb2xhckxlbmd0aDogbnVtYmVyO1xuICAgIG5hbWU/OiBzdHJpbmc7XG4gICAgcXVhZHJhbnQ/OiBudW1iZXI7XG5cbiAgICBjb25zdHJ1Y3RvcihjYXJ0ZXNpYW5YPzogbnVtYmVyLCBjYXJ0ZXNpYW5ZPzogbnVtYmVyLCBwb2xhckxlbmd0aD86IG51bWJlciwgcG9sYXJBbmdsZT86IG51bWJlcixuYW1lPzogc3RyaW5nKSB7XG4gICAgICAgIGlmIChjYXJ0ZXNpYW5YICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWCA9IGNhcnRlc2lhblg7XG4gICAgICAgIGlmIChjYXJ0ZXNpYW5ZICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWSA9IGNhcnRlc2lhblk7XG4gICAgICAgIGlmIChwb2xhckxlbmd0aCAhPT0gdW5kZWZpbmVkKSB0aGlzLnBvbGFyTGVuZ3RoID0gcG9sYXJMZW5ndGg7XG4gICAgICAgIGlmIChwb2xhckFuZ2xlICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJBbmdsZSA9IHBvbGFyQW5nbGU7XG4gICAgICAgIHRoaXMubmFtZT1uYW1lXG4gICAgfVxuXG4gICAgY2xvbmUoKTogQXhpcyB7XG4gICAgICAgIHJldHVybiBuZXcgQXhpcyh0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSx0aGlzLnBvbGFyTGVuZ3RoLHRoaXMucG9sYXJBbmdsZSx0aGlzLm5hbWUpO1xuICAgIH1cblxuICAgIHVuaXZlcnNhbChjb29yZGluYXRlOiBzdHJpbmcsIHRva2Vucz86IEZvcm1hdFRpa3pqYXgsYW5jaG9yQXJyPzogYW55LGFuY2hvcj86IHN0cmluZyk6IEF4aXMge1xuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVBcnI6IEFycmF5PEF4aXN8c3RyaW5nPiA9IFtdO1xuICAgICAgICBtYXRjaGVzLmZvckVhY2goKG1hdGNoOiBhbnksaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xuICAgICAgICAgICAgbGV0IGF4aXM6IEF4aXN8dW5kZWZpbmVkO1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZENhcnRlc2lhbihtYXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgY2FzZSAvOi8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLmFkZFBvbGFyKG1hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5wb2xhclRvQ2FydGVzaWFuKClcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIC8hW1xcZC5dKyEvLnRlc3QobWF0Y2gpOlxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICgvW1xcZFxcd10rLykudGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpXG4gICAgICAgICAgICAgICAgICAgICAgICBheGlzID0gdG9rZW5zLmZpbmRPcmlnaW5hbFZhbHVlKG1hdGNoKT8uYXhpcztcbiAgICAgICAgICAgICAgICAgICAgZWxzZSB0aHJvdyBuZXcgRXJyb3IoYFRyaWVkIHRvIGZpbmQgb3JpZ2luYWwgY29vcmRpbmF0ZSB2YWx1ZSB3aGlsZSBub3QgYmVpbmcgcHJvdmlkZWQgd2l0aCB0b2tlbnNgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGF4aXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZG4ndCBmaW5kIHRoZSBjb29yZGluYXRlICR7bWF0Y2h9IGZyb20gJHtjb29yZGluYXRlfWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGF4aXMubmFtZT1tYXRjaFxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLm1lcmdlQXhpcyhjb29yZGluYXRlQXJyKVxuXG4gICAgICAgIGlmKGFuY2hvckFyciYmYW5jaG9yJiZhbmNob3IubWF0Y2goLygtLVxcK3wtLVxcK1xcKykvKSl7XG4gICAgICAgICAgICBsZXQgYTogQXhpc1xuICAgICAgICAgICAgaWYgKGFuY2hvci5tYXRjaCgvKC0tXFwrKS8pKXtcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kKChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXG4gICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kTGFzdCgoY29vcjogYW55KT0+IGNvb3IgaW5zdGFuY2VvZiBBeGlzKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb21wbGV4Q2FydGVzaWFuQWRkKGEsXCJhZGRpdGlvblwiKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIG1lcmdlQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPikge1xuICAgICAgICBpZiAoIWF4ZXMuc29tZSgoYXhpczogYW55KSA9PiB0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIikpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IGF4aXMgb2YgYXhlcykge1xuICAgICAgICAgICAgaWYodHlwZW9mIGF4aXMgPT09IFwic3RyaW5nXCIpe2NvbnRpbnVlO31cbiAgICAgICAgICAgIGF4aXMubmFtZT11bmRlZmluZWRcbiAgICAgICAgfVxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGF4ZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnQgPSBheGVzW2ldO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHNpZGVzID0gZmluZEJlZm9yZUFmdGVyQXhpcyhheGVzLCBpKTtcbiAgICAgICAgICAgIGNvbnN0IGJlZm9yZUF4aXMgPSBheGVzW3NpZGVzLmJlZm9yZV0gYXMgQXhpcztcbiAgICAgICAgICAgIGNvbnN0IGFmdGVyQXhpcyA9IGF4ZXNbc2lkZXMuYWZ0ZXJdIGFzIEF4aXM7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGxldCAgbWF0Y2ggPSBjdXJyZW50Lm1hdGNoKC9eXFwrJC8pO1xuICAgICAgICAgICAgbGV0IG1vZGUsbW9kaWZpZXJzO1xuICAgICAgICAgICAgaWYgKG1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJhZGRpdGlvblwiXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaD1jdXJyZW50Lm1hdGNoKC9eLVxcfCQvKVxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJyaWdodFByb2plY3Rpb25cIlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWF0Y2g9Y3VycmVudC5tYXRjaCgvXlxcIShbXFxkLl0rKVxcISQvKVxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJpbnRlcm5hbFBvaW50XCJcbiAgICAgICAgICAgICAgICBtb2RpZmllcnM9dG9OdW1iZXIobWF0Y2hbMV0pXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKG1vZGUpe1xuICAgICAgICAgICAgICAgIGF4ZXMuc3BsaWNlKHNpZGVzLmJlZm9yZSwgc2lkZXMuYWZ0ZXIgLSBzaWRlcy5iZWZvcmUgKyAxLCBiZWZvcmVBeGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYWZ0ZXJBeGlzLG1vZGUsbW9kaWZpZXJzKSk7XG4gICAgICAgICAgICAgICAgaSA9IHNpZGVzLmJlZm9yZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGF4ZXMubGVuZ3RoID09PSAxICYmIGF4ZXNbMF0gaW5zdGFuY2VvZiBBeGlzKSB7XG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY29tcGxleENhcnRlc2lhbkFkZChheGlzOiBBeGlzLG1vZGU6IHN0cmluZyxtb2RpZmllcj86IGFueSl7XG4gICAgICAgIHN3aXRjaCAobW9kZSkge1xuICAgICAgICAgICAgY2FzZSBcImFkZGl0aW9uXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YKz1heGlzLmNhcnRlc2lhblg7XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZKz1heGlzLmNhcnRlc2lhblk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwic3VidHJhY3Rpb25cIjpcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJyaWdodFByb2plY3Rpb25cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9YXhpcy5jYXJ0ZXNpYW5YXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiaW50ZXJuYWxQb2ludFwiOlxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD0odGhpcy5jYXJ0ZXNpYW5YK2F4aXMuY2FydGVzaWFuWCkqbW9kaWZpZXI7XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZPSh0aGlzLmNhcnRlc2lhblkrYXhpcy5jYXJ0ZXNpYW5ZKSptb2RpZmllcjtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5Ub1BvbGFyKClcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9O1xuXG5cbiAgICBnZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlOiBzdHJpbmcpe1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm4gPSBnZXRSZWdleCgpO1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW1xuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLmJhc2ljfSspYCwgXCJnXCIpLFxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLm1lcmdlfSspYCwgXCJnXCIpXG4gICAgICAgIF07XG4gICAgICAgIFxuICAgICAgICAvLyBTdGVwIDE6IEV4dHJhY3QgbWF0Y2hlcyBmb3IgZWFjaCBwYXR0ZXJuIHNlcGFyYXRlbHlcbiAgICAgICAgY29uc3QgYmFzaWNNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMF0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLnJlcGxhY2UoLy0kL2csIFwiXCIpLCAvLyBSZW1vdmUgdHJhaWxpbmcgaHlwaGVuIG9ubHlcbiAgICAgICAgICAgIGluZGV4OiBtYXRjaC5pbmRleCA/PyAwLFxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGgtKG1hdGNoWzBdLm1hdGNoKC8tJC8pPzE6MClcbiAgICAgICAgfSkpO1xuICAgICAgICBcbiAgICAgICAgY29uc3QgbWVyZ2VNYXRjaGVzID0gQXJyYXkuZnJvbShjb29yZGluYXRlLm1hdGNoQWxsKHJlZ2V4UGF0dGVybnNbMV0pKS5tYXAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+ICh7XG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLFxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aFxuICAgICAgICB9KSk7XG4gICAgICAgIGNvbnN0IG1hdGNoZXM6IEFycmF5PHsgZnVsbE1hdGNoOiBzdHJpbmcsIGluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyIH0+ID0gW107XG5cbiAgICAgICAgZnVuY3Rpb24gaXNPdmVybGFwcGluZyhtYXRjaDE6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSwgbWF0Y2gyOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0pIHtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaDEuaW5kZXggPCBtYXRjaDIuaW5kZXggKyBtYXRjaDIubGVuZ3RoICYmIG1hdGNoMi5pbmRleCA8IG1hdGNoMS5pbmRleCArIG1hdGNoMS5sZW5ndGg7XG4gICAgICAgIH1cblxuICAgICAgICBbLi4uYmFzaWNNYXRjaGVzLCAuLi5tZXJnZU1hdGNoZXNdLmZvckVhY2gobWF0Y2ggPT4ge1xuICAgICAgICAgICAgY29uc3Qgb3ZlcmxhcHBpbmdJbmRleCA9IG1hdGNoZXMuZmluZEluZGV4KGV4aXN0aW5nTWF0Y2ggPT4gaXNPdmVybGFwcGluZyhleGlzdGluZ01hdGNoLCBtYXRjaCkpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBpZiAob3ZlcmxhcHBpbmdJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZ01hdGNoID0gbWF0Y2hlc1tvdmVybGFwcGluZ0luZGV4XTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgY3VycmVudCBtYXRjaCBjb3ZlcnMgYSBsYXJnZXIgcmFuZ2UsIHJlcGxhY2UgdGhlIGV4aXN0aW5nIG9uZVxuICAgICAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPiBleGlzdGluZ01hdGNoLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdID0gbWF0Y2g7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2gobWF0Y2gpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgMzogU29ydCB0aGUgZmluYWwgbWF0Y2hlcyBieSBpbmRleFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IGEuaW5kZXggLSBiLmluZGV4KTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgNDogVmFsaWRhdGUgdGhlIHJlc3VsdFxuICAgICAgICBpZiAobWF0Y2hlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvb3JkaW5hdGUgaXMgbm90IHZhbGlkOyBleHBlY3RlZCBhIHZhbGlkIGNvb3JkaW5hdGUuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBtYXRjaGVzO1xuICAgICAgICBcbiAgICB9XG4gICAgXG4gICAgXG4gICAgXG5cbiAgICBwcm9qZWN0aW9uKGF4aXMxOiBBeGlzfHVuZGVmaW5lZCxheGlzMjogQXhpc3x1bmRlZmluZWQpOmFueXtcbiAgICAgICAgaWYgKCFheGlzMXx8IWF4aXMyKXt0aHJvdyBuZXcgRXJyb3IoXCJheGlzJ3Mgd2VyZSB1bmRlZmluZWQgYXQgcHJvamVjdGlvblwiKTt9XG4gICAgICAgIHJldHVybiBbe1g6IGF4aXMxLmNhcnRlc2lhblgsWTogYXhpczIuY2FydGVzaWFuWX0se1g6IGF4aXMyLmNhcnRlc2lhblgsWTogYXhpczEuY2FydGVzaWFuWX1dXG4gICAgfVxuXG4gICAgY29tYmluZShjb29yZGluYXRlQXJyOiBhbnkpe1xuICAgICAgICBsZXQgeD0wLHk9MDtcbiAgICAgICAgY29vcmRpbmF0ZUFyci5mb3JFYWNoKChjb29yZGluYXRlOiBBeGlzKT0+e1xuICAgICAgICAgICAgeCs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgeSs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5ZO1xuICAgICAgICB9KVxuICAgICAgICBcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPXg7dGhpcy5jYXJ0ZXNpYW5ZPXk7XG4gICAgfVxuICAgIGFkZENhcnRlc2lhbih4OiBzdHJpbmcgfCBudW1iZXIsIHk/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgXG4gICAgICAgIGlmICgheSAmJiB0eXBlb2YgeCA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgW3gsIHldID0geC5zcGxpdChcIixcIikubWFwKE51bWJlcik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHggPT09IHVuZGVmaW5lZCB8fCB5ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgQ2FydGVzaWFuIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhcnRlc2lhblggPSB4IGFzIG51bWJlcjtcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZID0geSBhcyBudW1iZXI7XG4gICAgfVxuICAgIFxuICAgIHBvbGFyVG9DYXJ0ZXNpYW4oKXtcbiAgICAgICAgY29uc3QgdGVtcD1wb2xhclRvQ2FydGVzaWFuKHRoaXMucG9sYXJBbmdsZSwgdGhpcy5wb2xhckxlbmd0aClcbiAgICAgICAgdGhpcy5hZGRDYXJ0ZXNpYW4odGVtcC5YLHRlbXAuWSlcbiAgICB9XG5cbiAgICBjYXJ0ZXNpYW5Ub1BvbGFyKCl7XG4gICAgICAgIGNvbnN0IHRlbXA9Y2FydGVzaWFuVG9Qb2xhcih0aGlzLmNhcnRlc2lhblgsIHRoaXMuY2FydGVzaWFuWSlcbiAgICAgICAgdGhpcy5hZGRQb2xhcih0ZW1wLmFuZ2xlLHRlbXAubGVuZ3RoKVxuICAgIH1cblxuICAgIGFkZFBvbGFyKGFuZ2xlOiBzdHJpbmcgfCBudW1iZXIsIGxlbmd0aD86IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAoIWxlbmd0aCAmJiB0eXBlb2YgYW5nbGUgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIFthbmdsZSwgbGVuZ3RoXSA9IGFuZ2xlLnNwbGl0KFwiOlwiKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoYW5nbGUgPT09IHVuZGVmaW5lZCB8fCBsZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBwb2xhciBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5wb2xhckFuZ2xlID0gYW5nbGUgYXMgbnVtYmVyO1xuICAgICAgICB0aGlzLnBvbGFyTGVuZ3RoID0gbGVuZ3RoIGFzIG51bWJlcjtcbiAgICB9XG4gICAgYWRkUXVhZHJhbnQobWlkUG9pbnQ6IEF4aXMpe1xuICAgICAgICBjb25zdCB4PW1pZFBvaW50LmNhcnRlc2lhblg+dGhpcy5jYXJ0ZXNpYW5YO1xuICAgICAgICBjb25zdCB5PW1pZFBvaW50LmNhcnRlc2lhblk+dGhpcy5jYXJ0ZXNpYW5ZO1xuICAgICAgICB0aGlzLnF1YWRyYW50PXg/eT8xOjQ6eT8yOjM7XG4gICAgfVxuICAgIHRvU3RyaW5nU1ZHKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIgXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xuICAgIH1cbiAgICB0b1N0cmluZygpe1xuICAgICAgICByZXR1cm4gdGhpcy5jYXJ0ZXNpYW5YK1wiLFwiK3RoaXMuY2FydGVzaWFuWTtcbiAgICB9XG5cbiAgICBpbnRlcnNlY3Rpb24oY29vcmQ6IHN0cmluZywgZmluZE9yaWdpbmFsVmFsdWU6IChjb29yZDogc3RyaW5nKSA9PiBDb29yZGluYXRlIHwgdW5kZWZpbmVkKToge1g6bnVtYmVyLFk6bnVtYmVyfSB7XG4gICAgICAgIGNvbnN0IG9yaWdpbmFsQ29vcmRzID0gY29vcmRcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXG4gICAgICAgICAgICAucmVwbGFjZSgvKFxccyphbmRcXHM/fC0tKS9nLCBcIiBcIilcbiAgICAgICAgICAgIC5zcGxpdChcIiBcIilcbiAgICAgICAgICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpXG4gICAgICAgICAgICAuZmlsdGVyKCh0b2tlbik6IHRva2VuIGlzIENvb3JkaW5hdGUgPT4gdG9rZW4gIT09IHVuZGVmaW5lZCk7XG5cbiAgICAgICAgaWYgKG9yaWdpbmFsQ29vcmRzLmxlbmd0aCA8IDQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludGVyc2VjdGlvbiBoYWQgdW5kZWZpbmVkIGNvb3JkaW5hdGVzIG9yIGluc3VmZmljaWVudCBkYXRhLlwiKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgY29uc3Qgc2xvcGVzID0gW1xuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMV0uYXhpcyBhcyBBeGlzKSxcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1syXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzNdLmF4aXMgYXMgQXhpcyksXG4gICAgICAgIF07XG5cbiAgICAgICAgcmV0dXJuIGZpbmRJbnRlcnNlY3Rpb25Qb2ludChvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gdG9Qb2ludCh2YWx1ZTpudW1iZXIsZm9ybWF0OiBzdHJpbmcpe1xuICAgIHN3aXRjaCAoZm9ybWF0KSB7XG4gICAgICAgIGNhc2UgXCJwdFwiOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICBjYXNlIFwiY21cIjogXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqMjguMzQ2O1xuICAgICAgICBjYXNlIFwibW1cIjpcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSogMi44MzQ2O1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidW5rbm9uIGZvcm1hdFwiKTtcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gbWF0Y2hLZXlXaXRoVmFsdWUoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGNvbnN0IHZhbHVlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgICAgICBcImFuY2hvclwiOiBcImFuY2hvcj1cIixcbiAgICAgICAgXCJyb3RhdGVcIjogXCJyb3RhdGU9XCIsXG4gICAgICAgIFwibGluZVdpZHRoXCI6IFwibGluZSB3aWR0aD1cIixcbiAgICAgICAgXCJmaWxsXCI6IFwiZmlsbD1cIixcbiAgICAgICAgXCJmaWxsT3BhY2l0eVwiOiBcImZpbGwgb3BhY2l0eT1cIixcbiAgICAgICAgXCJ0ZXh0T3BhY2l0eVwiOiBcInRleHQgb3BhY2l0eT1cIixcbiAgICAgICAgXCJ0ZXh0Q29sb3JcIjogXCJ0ZXh0IGNvbG9yPVwiLFxuICAgICAgICBcImRyYXdcIjogXCJkcmF3PVwiLFxuICAgICAgICBcInRleHRcIjogXCJ0ZXh0PVwiLFxuICAgICAgICBcInBvc1wiOiBcInBvcz1cIixcbiAgICAgICAgXCJzY2FsZVwiOiBcInNjYWxlPVwiLFxuICAgICAgICBcImRlY29yYXRlXCI6IFwiZGVjb3JhdGVcIixcbiAgICAgICAgXCJzbG9wZWRcIjogXCJzbG9wZWRcIixcbiAgICAgICAgXCJkZWNvcmF0aW9uXCI6IFwiZGVjb3JhdGlvbj1cIixcbiAgICAgICAgXCJicmFjZVwiOiBcImJyYWNlXCIsXG4gICAgICAgIFwiYW1wbGl0dWRlXCI6IFwiYW1wbGl0dWRlPVwiLFxuICAgICAgICBcImFuZ2xlUmFkaXVzXCI6IFwiYW5nbGUgcmFkaXVzPVwiLFxuICAgICAgICBcImFuZ2xlRWNjZW50cmljaXR5XCI6IFwiYW5nbGUgZWNjZW50cmljaXR5PVwiLFxuICAgICAgICBcImZvbnRcIjogXCJmb250PVwiLFxuICAgICAgICBcInBpY1RleHRcIjogXCJwaWMgdGV4dD1cIixcbiAgICAgICAgXCJsYWJlbFwiOiBcImxhYmVsPVwiLFxuICAgIH07XG5cbiAgICByZXR1cm4gdmFsdWVNYXBba2V5XSB8fCAnJztcbn1cblxuXG50eXBlIERlY29yYXRpb24gPSB7XG4gICAgYnJhY2U/OiBib29sZWFuO1xuICAgIGNvaWw6IGJvb2xlYW47XG4gICAgYW1wbGl0dWRlPzogbnVtYmVyO1xuICAgIGFzcGVjdD86IG51bWJlcjtcbiAgICBzZWdtZW50TGVuZ3RoPzogbnVtYmVyO1xuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uOyBcbn07XG50eXBlIExhYmVsID0ge1xuICAgIGZyZWVGb3JtVGV4dD86IHN0cmluZztcbn07XG5mdW5jdGlvbiBsaW5lV2lkdGhDb252ZXJ0ZXIod2lkdGg6IHN0cmluZyl7XG4gICAgcmV0dXJuIE51bWJlcih3aWR0aC5yZXBsYWNlKC91bHRyYVxccyp0aGluLyxcIjAuMVwiKVxuICAgIC5yZXBsYWNlKC92ZXJ5XFxzKnRoaW4vLFwiMC4yXCIpXG4gICAgLnJlcGxhY2UoL3RoaW4vLFwiMC40XCIpXG4gICAgLnJlcGxhY2UoL3NlbWl0aGljay8sXCIwLjZcIilcbiAgICAucmVwbGFjZSgvdGhpY2svLFwiMC44XCIpXG4gICAgLnJlcGxhY2UoL3ZlcnlcXHMqdGhpY2svLFwiMS4yXCIpXG4gICAgLnJlcGxhY2UoL3VsdHJhXFxzKnRoaWNrLyxcIjEuNlwiKSlcbn1cbmV4cG9ydCBjbGFzcyBGb3JtYXR0aW5ne1xuICAgIC8vIGltcG9ydGVudCBuZWVkcyB0byBiZSBmb3JzdFxuICAgIHBhdGg/OiBzdHJpbmc7XG5cbiAgICBzY2FsZTogbnVtYmVyO1xuICAgIHJvdGF0ZT86IG51bWJlcjtcbiAgICBsaW5lV2lkdGg/OiBudW1iZXI9MC40O1xuICAgIHRleHRPcGFjaXR5OiBudW1iZXI7XG4gICAgb3BhY2l0eT86IG51bWJlcjtcbiAgICBmaWxsT3BhY2l0eT86IG51bWJlcjtcbiAgICBwb3M/OiBudW1iZXI7XG4gICAgYW5nbGVFY2NlbnRyaWNpdHk/OiBudW1iZXI7XG4gICAgYW5nbGVSYWRpdXM/OiBudW1iZXI7XG4gICAgbGV2ZWxEaXN0YW5jZT86IG51bWJlcjtcblxuICAgIG1vZGU6IHN0cmluZztcbiAgICBhbmNob3I/OiBzdHJpbmc7XG4gICAgY29sb3I/OiBzdHJpbmc7XG4gICAgdGV4dENvbG9yPzogc3RyaW5nO1xuICAgIGZpbGw/OiBzdHJpbmc7XG4gICAgYXJyb3c/OiBzdHJpbmc7XG4gICAgZHJhdz86IHN0cmluZztcbiAgICB0ZXh0Pzogc3RyaW5nO1xuICAgIHRpa3pzZXQ/OiBzdHJpbmc7XG4gICAgcG9zaXRpb24/OiBzdHJpbmc7XG4gICAgbGluZVN0eWxlPzogc3RyaW5nO1xuICAgIGZvbnQ/OiBzdHJpbmc7XG4gICAgcGljVGV4dD86IHN0cmluZztcbiAgICBcbiAgICBzbG9wZWQ/OiBib29sZWFuO1xuICAgIGRlY29yYXRlPzogYm9vbGVhbjtcbiAgICBsYWJlbD86IExhYmVsO1xuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uO1xuXG4gICAgY29uc3RydWN0b3IobW9kZTogc3RyaW5nLGZvcm1hdHRpbmdBcnI6IGFueSxmb3JtYXR0aW5nU3RyaW5nPzpzdHJpbmcpe1xuICAgICAgICB0aGlzLm1vZGU9bW9kZTtcbiAgICAgICAgdGhpcy5hc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmdBcnJ8fFtdKTtcbiAgICAgICAgdGhpcy5pbnRlcnByZXRGb3JtYXR0aW5nKGZvcm1hdHRpbmdTdHJpbmd8fFwiXCIpO1xuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH1cblxuICAgIGFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nOiBhbnkpe1xuICAgICAgICBjb25zdCBhPXNwbGl0Rm9ybWF0dGluZy5maW5kKChpdGVtOiBzdHJpbmcpPT4gaXRlbS5tYXRjaCgvbWFzc3xhbmd8aGVscGxpbmVzLykpXG4gICAgICAgIGlmICghYSYmIXRoaXMudGlrenNldClyZXR1cm47XG4gICAgICAgIGlmKGEpIHRoaXMudGlrenNldD1hO1xuXG4gICAgICAgIHN3aXRjaCAodGhpcy50aWt6c2V0KSB7XG4gICAgICAgICAgICBjYXNlIFwibWFzc1wiOlxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD1cInllbGxvdyE2MFwiO1xuICAgICAgICAgICAgICAgIHRoaXMucGF0aD1cImRyYXdcIjtcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInZlY1wiOlxuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9Jy0+J1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImhlbHBsaW5lc1wiOlxuICAgICAgICAgICAgICAgIHRoaXMubGluZVdpZHRoPTAuNDtcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXc9J2dyYXknO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcImFuZ1wiOlxuICAgICAgICAgICAgICAgIHRoaXMucGF0aD0nZHJhdydcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGw9J2JsYWNrITUwJztcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGxPcGFjaXR5PTAuNTtcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXc9J29yYW5nZSdcbiAgICAgICAgICAgICAgICB0aGlzLmFycm93PSc8LT4nXG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZUVjY2VudHJpY2l0eT0xLjY7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZVJhZGl1cz10b1BvaW50KDAuNSxcImNtXCIpO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dD0nb3JhbmdlJztcbiAgICAgICAgICAgICAgICB0aGlzLmZvbnQ9J1xcXFxsYXJnZSc7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0T3BhY2l0eT0wLjk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFkZFNwbG9wQW5kUG9zaXRpb24oYXJyOiBhbnksaW5kZXg6IG51bWJlcil7XG4gICAgICAgIGNvbnN0IGJlZm9yZUFmdGVyPWZpbmRCZWZvcmVBZnRlckF4aXMoYXJyLGluZGV4KTtcbiAgICAgICAgY29uc3QgW2JlZm9yZSwgYWZ0ZXJdPVthcnJbYmVmb3JlQWZ0ZXIuYmVmb3JlXSxhcnJbYmVmb3JlQWZ0ZXIuYWZ0ZXJdXVxuICAgICAgICBpZiAodGhpcy5wb3NpdGlvbnx8dGhpcy5zbG9wZWQpe3JldHVybn1cbiAgICBcbiAgICAgICAgY29uc3QgZWRnZTEgPSBiZWZvcmUucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XG4gICAgICAgIGNvbnN0IGVkZ2UyID0gYWZ0ZXIucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XG4gICAgICAgIGNvbnN0IHNsb3BlPWZpbmRTbG9wZShiZWZvcmUsYWZ0ZXIpXG5cbiAgICAgICAgdGhpcy5zbG9wZWQgPSBzbG9wZSAhPT0gMCYmc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHk7XG5cbiAgICAgICAgbGV0IHF1YWRyYW50XG5cbiAgICAgICAgaWYgKGVkZ2UxIT09ZWRnZTIpXG4gICAgICAgICAgICBxdWFkcmFudD1lZGdlMStlZGdlMjtcbiAgICAgICAgZWxzZSBcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxO1xuXG4gICAgICAgIC8vc2ludCBwYXJhbGxlbCB0byBZIGF4aXNcbiAgICAgICAgaWYgKHNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5KXtcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb24gPSBxdWFkcmFudC5yZXBsYWNlKC8oM3w0KS8sXCJiZWxvd1wiKS5yZXBsYWNlKC8oMXwyKS8sXCJhYm92ZVwiKS5yZXBsYWNlKC8oYmVsb3dhYm92ZXxhYm92ZWJlbG93KS8sXCJcIilcbiAgICAgICAgfVxuICAgICAgICAvL2lzbnQgcGFyYWxsZWwgdG8gWCBheGlzXG4gICAgICAgIGlmIChzbG9wZSAhPT0gMCl7XG4gICAgICAgICAgICB0aGlzLnBvc2l0aW9uPXRoaXMucG9zaXRpb24/dGhpcy5wb3NpdGlvbjonJztcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb24rPXF1YWRyYW50LnJlcGxhY2UoLygxfDQpLyxcInJpZ2h0XCIpLnJlcGxhY2UoLygyfDMpLyxcImxlZnRcIikucmVwbGFjZSgvKHJpZ2h0bGVmdHxsZWZ0cmlnaHQpLyxcIlwiKVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHRoaXMucG9zaXRpb24/LnJlcGxhY2UoL1tcXGRdKy9nLFwiXCIpLnJlcGxhY2UoLyhiZWxvd3xhYm92ZSkocmlnaHR8bGVmdCkvLFwiJDEgJDJcIik7XG4gICAgICAgIGNvbnNvbGUubG9nKHNsb3BlLHRoaXMucG9zaXRpb24scXVhZHJhbnQpXG4gICAgfVxuXG4gICAgYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nQXJyOiBSZWNvcmQ8c3RyaW5nLCBhbnk+KSB7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZvcm1hdHRpbmdBcnIpKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9PSBudWxsJiYhdGhpc1trZXkgYXMga2V5b2YgRm9ybWF0dGluZ10pIHtcbiAgICAgICAgICAgICAgICAodGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+KVtrZXldID0ge307XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0UHJvcGVydHkoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcsIHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBcblxuICAgIGludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZ1N0cmluZzogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHNwbGl0Rm9ybWF0dGluZyA9IGZvcm1hdHRpbmdTdHJpbmcucmVwbGFjZSgvXFxzL2csIFwiXCIpLm1hdGNoKC8oPzp7W159XSp9fFteLHt9XSspKy9nKSB8fCBbXTtcbiAgICBcbiAgICAgICAgdGhpcy5hZGRUaWt6c2V0KHNwbGl0Rm9ybWF0dGluZyk7XG4gICAgXG4gICAgICAgIGNvbnN0IHBhdHRlcm5zOiBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IHN0cmluZykgPT4gdm9pZD4gPSB7XG4gICAgICAgICAgICBcImxpbmV3aWR0aFwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJsaW5lV2lkdGhcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJmaWxsPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJmaWxsXCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXmZpbGxvcGFjaXR5XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImZpbGxPcGFjaXR5XCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXigtPnw8LXwtKntTdGVhbHRofS0qKSRcIjogKHZhbHVlKSA9PiB7IHRoaXMuYXJyb3cgPSB2YWx1ZTsgfSxcbiAgICAgICAgICAgIFwiXihhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KXsxLDJ9JFwiOiAodmFsdWUpID0+IHsgdGhpcy5wb3NpdGlvbiA9IHZhbHVlLnJlcGxhY2UoLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8sIFwiJDEgXCIpOyB9LFxuICAgICAgICAgICAgXCJecG9zPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJwb3NcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeZHJhdz1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZHJhd1wiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5kZWNvcmF0ZSRcIjogKCkgPT4geyB0aGlzLmRlY29yYXRlID0gdHJ1ZTsgfSxcbiAgICAgICAgICAgIFwiXnRleHQ9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcInRleHRcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeYW5jaG9yPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJhbmNob3JcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeXFxcIl5cXFwiJFwiOiAoKSA9PiB0aGlzLnNldFByb3BlcnR5KFwibGFiZWxcIix0cnVlLFwiZnJlZUZvcm1UZXh0XCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImxhYmVsXCJdPiksXG4gICAgICAgICAgICBcIl5icmFjZSRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxuICAgICAgICAgICAgXCJeYW1wbGl0dWRlXCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImRlY29yYXRpb25cIiwgdmFsdWUsIFwiYW1wbGl0dWRlXCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImRlY29yYXRpb25cIl0+KSxcbiAgICAgICAgICAgIFwiXmRyYXckXCI6ICh2YWx1ZSkgPT4geyB0aGlzLnBhdGggPSB2YWx1ZTsgfSxcbiAgICAgICAgICAgIFwiXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxcXGQuXSspezEsNX0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmNvbG9yID0gdmFsdWU7IH0sXG4gICAgICAgICAgICBcIl4oZG90dGVkfGRhc2hlZHxzbW9vdGh8ZGVuc2VseXxsb29zZWx5KXsxLDJ9JFwiOiAodmFsdWUpID0+IHsgdGhpcy5saW5lU3R5bGUgPSB2YWx1ZS5yZXBsYWNlKC8oZGVuc2VseXxsb29zZWx5KS8sIFwiJDEgXCIpOyB9LFxuICAgICAgICB9O1xuXG4gICAgICAgIHNwbGl0Rm9ybWF0dGluZy5mb3JFYWNoKGZvcm1hdHRpbmcgPT4ge1xuICAgICAgICAgICAgLy8gSGFuZGxlIG5lc3RlZCBwcm9wZXJ0aWVzXG4gICAgICAgICAgICBjb25zdCBtYXRjaCA9IGZvcm1hdHRpbmcubWF0Y2goL14oW149XSspPXsoLiopfSQvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IFtfLCBwYXJlbnQsIGNoaWxkcmVuXSA9IG1hdGNoO1xuXG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZ09iaiA9IHRoaXMgYXMgUmVjb3JkPHN0cmluZywgYW55PjtcbiAgICAgICAgICAgICAgICBpZiAoIWZvcm1hdHRpbmdPYmpbcGFyZW50XSkge1xuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nT2JqW3BhcmVudF0gPSB7fTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkQ2hpbGQgPSBuZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUse30sY2hpbGRyZW4pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oZm9ybWF0dGluZ09ialtwYXJlbnRdLCAocGFyc2VkQ2hpbGQgYXMgUmVjb3JkPHN0cmluZywgYW55PilbcGFyZW50XSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtwYXR0ZXJuLCBoYW5kbGVyXSBvZiBPYmplY3QuZW50cmllcyhwYXR0ZXJucykpIHtcbiAgICAgICAgICAgICAgICBpZiAobmV3IFJlZ0V4cChwYXR0ZXJuKS50ZXN0KGZvcm1hdHRpbmcpKSB7XG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXIoZm9ybWF0dGluZyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBcbiAgICBcblxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcbiAgICAgICAga2V5OiBLLFxuICAgICAgICBmb3JtYXR0aW5nOiBhbnksXG4gICAgICAgIG5lc3RlZEtleT86IE5LXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGxldCB2YWx1ZTtcbiAgICAgICAgaWYodHlwZW9mIGZvcm1hdHRpbmchPT1cImJvb2xlYW5cIil7XG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBmb3JtYXR0aW5nLnNwbGl0KFwiPVwiKTtcbiAgICBcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgZm9ybWF0dGluZyBzdHJpbmcgaXMgdmFsaWRcbiAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPCAyIHx8ICFtYXRjaFsxXSkgcmV0dXJuO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IG1hdGNoWzFdLnRyaW0oKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGlmIHRoZSB2YWx1ZSBpcyBhIG51bWJlciBvciBhIHN0cmluZ1xuICAgICAgICAgICAgdmFsdWUgPSAhaXNOYU4ocGFyc2VGbG9hdChyYXdWYWx1ZSkpICYmIGlzRmluaXRlKCtyYXdWYWx1ZSlcbiAgICAgICAgICAgICAgICA/IHBhcnNlRmxvYXQocmF3VmFsdWUpXG4gICAgICAgICAgICAgICAgOiByYXdWYWx1ZS5yZXBsYWNlKC8tXFx8Lywnbm9ydGgnKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNle1xuICAgICAgICAgICAgdmFsdWU9Zm9ybWF0dGluZ1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICB0aGlzLnNldFByb3BlcnR5KGtleSwgdmFsdWUsIG5lc3RlZEtleSk7XG4gICAgfVxuICAgIFxuICAgIHNldFByb3BlcnR5PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcbiAgICAgICAga2V5OiBLLFxuICAgICAgICB2YWx1ZTogYW55LFxuICAgICAgICBuZXN0ZWRLZXk/OiBOS1xuICAgICk6IHZvaWQge1xuICAgICAgICBpZiAodHlwZW9mIHZhbHVlPT09XCJzdHJpbmdcIil7XG4gICAgICAgICAgICB2YWx1ZT12YWx1ZS5yZXBsYWNlKC9eXFx8LSQvLFwibm9ydGhcIikucmVwbGFjZSgvXi1cXHwkLyxcInNvdXRoXCIpO1xuICAgICAgICAgICAgY29uc3QgbWF0Y2g9dmFsdWUubWF0Y2goLyhbXFxkLl0rKShwdHxjbXxtbSkvKVxuICAgICAgICAgICAgaWYgKG1hdGNoKVxuICAgICAgICAgICAgdmFsdWU9dG9Qb2ludChOdW1iZXIobWF0Y2hbMV0pLG1hdGNoWzJdKVxuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ09iaiA9IHRoaXMgYXMgUmVjb3JkPHN0cmluZywgYW55PjtcblxuICAgICAgICBpZiAobmVzdGVkS2V5KSB7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnN0IGtleXMgPSB0eXBlb2YgbmVzdGVkS2V5ID09PSBcInN0cmluZ1wiID8gbmVzdGVkS2V5LnNwbGl0KCcuJykgOiBbbmVzdGVkS2V5XTtcbiAgICAgICAgICAgIHRoaXMudGlrenNldFxuICAgICAgICAgICAgaWYoIWZvcm1hdHRpbmdPYmpba2V5XSlmb3JtYXR0aW5nT2JqW2tleV09e307XG4gICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV1bbmVzdGVkS2V5XT12YWx1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgIH1cbiAgICBcbiAgICBcbiAgICB0b1N0cmluZyhvYmo/OiBhbnkpOiBzdHJpbmcge1xuICAgICAgICBsZXQgc3RyaW5nPW9iaj8neyc6J1snO1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmo/b2JqOnRoaXMpKSB7XG4gICAgICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eKG1vZGV8dGlrenNldCkkLykpe2NvbnRpbnVlO31cbiAgICAgICAgICAgIGlmKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcmJnZhbHVlKXtcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW1hdGNoS2V5V2l0aFZhbHVlKGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nKSt0aGlzLnRvU3RyaW5nKHZhbHVlKSsnLCdcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrKHR5cGVvZiB2YWx1ZT09PVwiYm9vbGVhblwiPycnOnZhbHVlKSsnLCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cmluZysob2JqPyd9JzonXScpO1xuICAgIH1cblxuICAgIGhhbmRsZU9iamVjdFRvU3RyaW5nKG9iajogb2JqZWN0LCBwYXJlbnRLZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xuICAgICAgICAgICAgaWYgKHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xuICAgIH1cbn1cbnR5cGUgTW9kZSA9IFwiY29vcmRpbmF0ZVwiIHwgXCJjb29yZGluYXRlLWlubGluZVwiIHwgXCJub2RlXCIgfCBcIm5vZGUtaW5saW5lXCI7XG5leHBvcnQgY2xhc3MgQ29vcmRpbmF0ZSB7XG4gICAgbW9kZTogTW9kZTtcbiAgICBheGlzPzogQXhpcztcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcbiAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZztcbiAgICBsYWJlbD86IHN0cmluZztcbiAgICBcbiAgICBjb25zdHJ1Y3Rvcihtb2RlPzogTW9kZSwgYXhpcz86IEF4aXMsIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nLCBmb3JtYXR0aW5nPzogRm9ybWF0dGluZywgbGFiZWw/OiBzdHJpbmcsKTtcbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zOiB7IG1vZGU/OiBNb2RlOyBheGlzPzogQXhpczsgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7IGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nOyBsYWJlbD86IHN0cmluZzsgIH0pO1xuXG5cbiAgY29uc3RydWN0b3IoXG4gICAgbW9kZT86IE1vZGUgfCB7IG1vZGU/OiBNb2RlOyBheGlzPzogQXhpczsgb3JpZ2luYWw/OiBzdHJpbmc7IGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nOyBmb3JtYXR0aW5nPzogRm9ybWF0dGluZzsgbGFiZWw/OiBzdHJpbmc7IH0sXG4gICAgYXhpcz86IEF4aXMsXG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmcsXG4gICAgZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsXG4gICAgbGFiZWw/OiBzdHJpbmcsXG4gICkge1xuICAgIGlmICh0eXBlb2YgbW9kZSA9PT0gXCJzdHJpbmdcIikge1xuXG4gICAgICB0aGlzLm1vZGUgPSBtb2RlO1xuICAgICAgaWYgKGF4aXMgIT09IHVuZGVmaW5lZCkgdGhpcy5heGlzID0gYXhpcztcbiAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUgPSBjb29yZGluYXRlTmFtZTtcbiAgICAgIGlmIChmb3JtYXR0aW5nICE9PSB1bmRlZmluZWQpIHRoaXMuZm9ybWF0dGluZyA9IGZvcm1hdHRpbmc7XG4gICAgICB0aGlzLmxhYmVsID0gbGFiZWw7XG5cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBtb2RlID09PSBcIm9iamVjdFwiICYmIG1vZGUgIT09IG51bGwpIHtcbiAgICAgIGNvbnN0IG9wdGlvbnMgPSBtb2RlO1xuICAgICAgaWYgKG9wdGlvbnMubW9kZSAhPT0gdW5kZWZpbmVkKSB0aGlzLm1vZGUgPSBvcHRpb25zLm1vZGU7XG4gICAgICB0aGlzLmF4aXMgPSBvcHRpb25zLmF4aXM7XG4gICAgICB0aGlzLmNvb3JkaW5hdGVOYW1lID0gb3B0aW9ucy5jb29yZGluYXRlTmFtZTtcbiAgICAgIHRoaXMuZm9ybWF0dGluZyA9IG9wdGlvbnMuZm9ybWF0dGluZztcbiAgICAgIHRoaXMubGFiZWwgPSBvcHRpb25zLmxhYmVsO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuZm9ybWF0dGluZylcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKHRoaXMubW9kZSxbXSlcblxuICAgIGlmICh0aGlzLm1vZGU9PT1cImNvb3JkaW5hdGVcIil7XG4gICAgICAgIHRoaXMuZm9ybWF0dGluZy5hc3NpZ25Gb3JtYXR0aW5nKHtsYWJlbDoge2ZyZWVGb3JtVGV4dDogdGhpcy5sYWJlbH19KTtcbiAgICB9XG4gIH1cblxuICAgIGNsb25lKCk6IENvb3JkaW5hdGUge1xuICAgICAgICByZXR1cm4gbmV3IENvb3JkaW5hdGUoXG4gICAgICAgICAgICB0aGlzLm1vZGUsXG4gICAgICAgICAgICB0aGlzLmF4aXMgPyB0aGlzLmF4aXMuY2xvbmUoKSA6dW5kZWZpbmVkLFxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSxcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZyxcbiAgICAgICAgICAgIHRoaXMubGFiZWwsXG4gICAgICAgICk7XG4gICAgfVxuICAgIGFkZEF4aXMoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIpe1xuICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoY2FydGVzaWFuWCwgY2FydGVzaWFuWSwgcG9sYXJMZW5ndGgsIHBvbGFyQW5nbGUpO1xuICAgIH1cblxuICAgIHRvU3RyaW5nKCkge1xuICAgICAgICBzd2l0Y2ggKHRoaXMubW9kZSkge1xuICAgICAgICAgICAgY2FzZSBcImNvb3JkaW5hdGVcIjpcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5heGlzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm5gXFxcXGNvb3JkaW5hdGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9ICgke3RoaXMuY29vcmRpbmF0ZU5hbWUgfHwgXCJcIn0pIGF0ICgke3RoaXMuYXhpcy50b1N0cmluZygpfSk7YFxuICAgICAgICAgICAgY2FzZSBcIm5vZGVcIjpcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5heGlzKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYFxcXFxub2RlICR7dGhpcy5jb29yZGluYXRlTmFtZT8nKCcrdGhpcy5jb29yZGluYXRlTmFtZSsnKSc6Jyd9IGF0ICgke3RoaXMuYXhpcy50b1N0cmluZygpfSkgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCl8fCcnfSB7JHt0aGlzLmxhYmVsfX07YFxuICAgICAgICAgICAgY2FzZSBcIm5vZGUtaW5saW5lXCI6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBub2RlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpIHx8ICcnfSB7JHt0aGlzLmxhYmVsIHx8ICcnfX1gXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgbW9kZSBhdCB0byBzdHJpbmcgY29vcmRpbmF0ZVwiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG50eXBlIFRva2VuID1BeGlzIHwgQ29vcmRpbmF0ZSB8RHJhd3xGb3JtYXR0aW5nfCBzdHJpbmc7XG5cbmV4cG9ydCBjbGFzcyBEcmF3IHtcbiAgICBtb2RlPzogc3RyaW5nXG4gICAgZm9ybWF0dGluZzogRm9ybWF0dGluZztcbiAgICBjb29yZGluYXRlczogQXJyYXk8VG9rZW4+O1xuXG4gICAgY29uc3RydWN0b3IobW9kZT86IHN0cmluZyxmb3JtYXR0aW5nPzogc3RyaW5nLGRyYXc/OiBzdHJpbmcsIHRva2Vucz86IEZvcm1hdFRpa3pqYXgsKTtcbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zOiB7bW9kZT86IHN0cmluZywgZm9ybWF0dGluZ1N0cmluZz86IHN0cmluZywgZm9ybWF0dGluZ09iaj86IG9iamVjdCxmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxkcmF3U3RyaW5nPzogc3RyaW5nLGRyYXdBcnI/OiBhbnksdG9rZW5zPzogRm9ybWF0VGlrempheH0pO1xuXG5cbiAgICBjb25zdHJ1Y3RvcihcbiAgICAgICAgbW9kZT86IHN0cmluZyB8IHttb2RlPzogc3RyaW5nLCBmb3JtYXR0aW5nU3RyaW5nPzogc3RyaW5nLCBmb3JtYXR0aW5nT2JqPzogb2JqZWN0LGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLGRyYXdTdHJpbmc/OiBzdHJpbmcsZHJhd0Fycj86IGFueSx0b2tlbnM/OiBGb3JtYXRUaWt6amF4fSxcbiAgICAgICAgZm9ybWF0dGluZz86IHN0cmluZyxcbiAgICAgICAgZHJhdz86IHN0cmluZywgXG4gICAgICAgIHRva2Vucz86IEZvcm1hdFRpa3pqYXhcbiAgICAgICkge1xuICAgICAgICBpZiAodHlwZW9mIG1vZGU9PT1cInN0cmluZ1wifHx0eXBlb2YgZHJhdz09PVwic3RyaW5nXCIpe1xuICAgICAgICAgICAgdGhpcy5tb2RlPWBkcmF3JHttb2RlP1wiLVwiK21vZGU6XCJcIn1gO1xuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKHRoaXMubW9kZSx7fSxmb3JtYXR0aW5nKTtcbiAgICAgICAgICAgIGlmIChkcmF3KVxuICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcyA9IHRoaXMuZmlsbENvb3JkaW5hdGVzKHRoaXMuZ2V0U2NoZW1hdGljKGRyYXcpLCB0b2tlbnMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYobW9kZSYmdHlwZW9mIG1vZGU9PT1cIm9iamVjdFwiKXtcbiAgICAgICAgICAgIGNvbnN0IG9wdGlvbnM9bW9kZTtcbiAgICAgICAgICAgIHRoaXMubW9kZT1gZHJhdyR7b3B0aW9ucz8ubW9kZT9cIi1cIitvcHRpb25zLm1vZGU6XCJcIn1gO1xuICAgICAgICAgICAgaWYgKCFvcHRpb25zPy5mb3JtYXR0aW5nKVxuICAgICAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZz0gbmV3IEZvcm1hdHRpbmcodGhpcy5tb2RlLG9wdGlvbnM/LmZvcm1hdHRpbmdPYmosb3B0aW9ucz8uZm9ybWF0dGluZ1N0cmluZyk7XG4gICAgICAgICAgICBlbHNlIHRoaXMuZm9ybWF0dGluZz1vcHRpb25zLmZvcm1hdHRpbmc7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChvcHRpb25zPy5kcmF3QXJyKVxuICAgICAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXM9b3B0aW9ucy5kcmF3QXJyO1xuICAgICAgICAgICAgZWxzZSBpZiAob3B0aW9ucy5kcmF3U3RyaW5nIT09dW5kZWZpbmVkKXtcbiAgICAgICAgICAgICAgICB0aGlzLmNvb3JkaW5hdGVzID0gdGhpcy5maWxsQ29vcmRpbmF0ZXModGhpcy5nZXRTY2hlbWF0aWMob3B0aW9ucy5kcmF3U3RyaW5nKSwgdG9rZW5zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBjcmVhdGVGcm9tQXJyYXkoYXJyOiBhbnkpey8qXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YXJyLmxlbmd0aDtpKyspe1xuICAgICAgICAgICAgaWYgKGFycltpXSBpbnN0YW5jZW9mIEF4aXN8fGFycltpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpe1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaChhcnJbaV0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZih0eXBlb2YgYXJyPT09XCJzdHJpbmdcIil7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7Ki9cbiAgICB9XG5cbiAgICBmaWxsQ29vcmRpbmF0ZXMoc2NoZW1hdGljOiBhbnlbXSwgdG9rZW5zPzogRm9ybWF0VGlrempheCkge1xuICAgICAgICBjb25zdCBjb29yQXJyOiBBcnJheTxUb2tlbj49W107XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgc2NoZW1hdGljLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XG4gICAgICAgICAgICAgICAgbGV0IHByZXZpb3VzRm9ybWF0dGluZztcblxuICAgICAgICAgICAgICAgIGlmIChpID4gMCAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMV0udmFsdWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChpID4gMSAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwibm9kZVwiICYmIHNjaGVtYXRpY1tpIC0gMl0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAyXS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBBeGlzKCkudW5pdmVyc2FsKHNjaGVtYXRpY1tpXS52YWx1ZSwgdG9rZW5zLCBjb29yQXJyLCBwcmV2aW91c0Zvcm1hdHRpbmcsICkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHNjaGVtYXRpY1tpXS50eXBlID09PSBcIm5vZGVcIil7XG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBDb29yZGluYXRlKHtsYWJlbDogc2NoZW1hdGljW2ldLnZhbHVlLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZS1pbmxpbmVcIix7fSxzY2hlbWF0aWNbaV0uZm9ybWF0dGluZyksbW9kZTogXCJub2RlLWlubGluZVwifSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZXtcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2goc2NoZW1hdGljW2ldLnZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29vckFycjtcbiAgICB9XG5cbiAgICBnZXRTY2hlbWF0aWMoZHJhdzogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlZ2V4PWdldFJlZ2V4KCk7XG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVzQXJyYXkgPSBbXTtcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gcmVnRXhwKFN0cmluZy5yYXdgbm9kZVxccypcXFs/KCR7cmVnZXguZm9ybWF0dGluZ30qKVxcXT9cXHMqeygke3JlZ2V4LnRleHR9Kil9YCk7XG4gICAgICAgIGNvbnN0IGZvcm1hdHRpbmdSZWdleCA9IC8oLS1jeWNsZXxjeWNsZXwtLVxcK1xcK3wtLVxcK3wtLXwtXFx8fFxcfC18Z3JpZHxjaXJjbGV8cmVjdGFuZ2xlKS87XG4gICAgICAgIGNvbnN0IGNhID0gU3RyaW5nLnJhd2BcXHdcXGRcXHNcXC0sLjpgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoXFwoWyR7Y2F9XStcXCl8XFwoXFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitcXC1dK1xcKFske2NhfV0rXFwpXFwkXFwpKWApO1xuICAgICAgICBsZXQgaSA9IDA7XG4gICAgICAgIGxldCBsb29wcyA9IDA7XG4gICAgICAgIFxuICAgICAgICB3aGlsZSAoaSA8IGRyYXcubGVuZ3RoICYmIGxvb3BzIDwgMTAwKSB7IC8vIEluY3JlYXNlIGxvb3AgbGltaXQgb3IgYWRkIGNvbmRpdGlvbiBiYXNlZCBvbiBwYXJzZWQgbGVuZ3RoXG4gICAgICAgICAgICBsb29wcysrO1xuICAgICAgICAgICAgY29uc3QgY29vcmRpbmF0ZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChjb29yZGluYXRlUmVnZXgpO1xuICAgICAgICAgICAgXG5cbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlTWF0Y2g/LmluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJjb29yZGluYXRlXCIsIHZhbHVlOiBjb29yZGluYXRlTWF0Y2hbMV0gfSk7XG4gICAgICAgICAgICAgICAgaSArPSBjb29yZGluYXRlTWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGZvcm1hdHRpbmdSZWdleCk7XG4gICAgICAgICAgICBpZiAoZm9ybWF0dGluZ01hdGNoPy5pbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGkgKz0gZm9ybWF0dGluZ01hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImZvcm1hdHRpbmdcIiwgdmFsdWU6IGZvcm1hdHRpbmdNYXRjaFswXSB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3Qgbm9kZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChub2RlUmVnZXgpO1xuICAgICAgICAgICAgaWYgKG5vZGVNYXRjaD8uaW5kZXggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goe1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiBcIm5vZGVcIixcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGluZzogbm9kZU1hdGNoWzFdIHx8IFwiXCIsXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBub2RlTWF0Y2hbMl1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICBpICs9IG5vZGVNYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGxvb3BzID09PSAxMDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBhcnNpbmcgZXhjZWVkZWQgc2FmZSBsb29wIGNvdW50XCIpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xuICAgIH1cblxuICAgIGlzQ29vcmRpbmF0ZShvYmo6IGFueSk6IG9iaiBpcyBDb29yZGluYXRlIHtcbiAgICAgICAgcmV0dXJuIG9iaiAmJiBvYmogaW5zdGFuY2VvZiBDb29yZGluYXRlO1xuICAgIH1cbiAgICB0b1N0cmluZ0RyYXcoKXtcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKX0gYDtcbiAgICAgICAgdGhpcy5jb29yZGluYXRlcy5mb3JFYWNoKChjb29yZGluYXRlOiBhbnksIGluZGV4OiBudW1iZXIpID0+IHtcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgY29vcmRpbmF0ZSBpbnN0YW5jZW9mIENvb3JkaW5hdGUmJmNvb3JkaW5hdGUubW9kZT09PVwibm9kZS1pbmxpbmVcIjoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gY29vcmRpbmF0ZS50b1N0cmluZygpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2FzZSB0eXBlb2YgY29vcmRpbmF0ZT09PVwic3RyaW5nXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IC8oLS1cXCtcXCt8LS1cXCspLy50ZXN0KGNvb3JkaW5hdGUpP1wiLS1cIjpjb29yZGluYXRlO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz1gKCR7Y29vcmRpbmF0ZS50b1N0cmluZygpfSlgXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xuICAgIH1cblxuICAgIHRvU3RyaW5nUGljKCl7XG4gICAgICAgIGxldCByZXN1bHQgPSBgXFxcXGRyYXcgcGljICR7dGhpcy5mb3JtYXR0aW5nLnRvU3RyaW5nKCl8fCcnfSB7YW5nbGUgPSAkeyh0aGlzLmNvb3JkaW5hdGVzWzBdIGFzIEF4aXMpLm5hbWV9LS0keyh0aGlzLmNvb3JkaW5hdGVzWzFdIGFzIEF4aXMpLm5hbWV9LS0keyh0aGlzLmNvb3JkaW5hdGVzWzJdIGFzIEF4aXMpLm5hbWV9fSBgO1xuICAgICBcblxuICAgICAgICByZXR1cm4gcmVzdWx0ICsgXCI7XCI7XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIGlmICh0aGlzLm1vZGU9PT0nZHJhdycpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ0RyYXcoKTtcbiAgICAgICAgaWYodGhpcy5tb2RlPT09J2RyYXctcGljLWFuZycpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ1BpYygpXG4gICAgICAgIFxuICAgIH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvcm1hdFRpa3pqYXgge1xuXHRzb3VyY2U6IHN0cmluZztcbiAgICB0b2tlbnM6IEFycmF5PFRva2VuPj1bXTtcbiAgICAvL21pZFBvaW50OiBBeGlzO1xuICAgIHByaXZhdGUgdmlld0FuY2hvcnM6IHttYXg6IEF4aXMsbWluOkF4aXMsYXZlTWlkUG9pbnQ6IEF4aXN9XG5cdHByb2Nlc3NlZENvZGU9XCJcIjtcbiAgICBkZWJ1Z0luZm8gPSBcIlwiO1xuICAgIFxuXHRjb25zdHJ1Y3Rvcihzb3VyY2U6IHN0cmluZ3xBcnJheTxUb2tlbj4pIHtcbiAgICAgICAgaWYodHlwZW9mIHNvdXJjZT09PVwic3RyaW5nXCIpe1xuXHRcdHRoaXMuc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xuICAgICAgICB0aGlzLnRva2VuaXplKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7dGhpcy50b2tlbnM9c291cmNlfVxuXG4gICAgICAgIGlmICh0eXBlb2Ygc291cmNlPT09XCJzdHJpbmdcIiYmc291cmNlLm1hdGNoKC8odXNlcGFja2FnZXx1c2V0aWt6bGlicmFyeSkvKSl7XG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGU9c291cmNlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2V7XG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5zb3VyY2U7XG4gICAgICAgICAgICB0aGlzLmZpbmRWaWV3QW5jaG9ycygpO1xuICAgICAgICAgICAgdGhpcy5hcHBseVBvc3RQcm9jZXNzaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz1cIlxcblxcbnRoaXMubWlkUG9pbnQ6XFxuXCIrSlNPTi5zdHJpbmdpZnkodGhpcy52aWV3QW5jaG9ycyxudWxsLDEpK1wiXFxuXCJcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz1KU09OLnN0cmluZ2lmeSh0aGlzLnRva2VucyxudWxsLDEpK1wiXFxuXFxuXCJcblxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlICs9IHRoaXMudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnByb2Nlc3NlZENvZGU7XG4gICAgICAgIH1cblx0fVxuICAgIFxuICAgIHRpZHlUaWt6U291cmNlKHRpa3pTb3VyY2U6IHN0cmluZykge1xuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xuICAgICAgICB0aWt6U291cmNlID0gdGlrelNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gdGlrelNvdXJjZS5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIik7O1xuICAgIH1cblxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBmbGF0QXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCAgW2luZGV4LCBjb29yXSBvZiBkcmF3LmNvb3JkaW5hdGVzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICB9XG4gICAgZ2V0Q29kZSgpe1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuc291cmNlPT09XCJzdHJpbmdcIiYmdGhpcy5zb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJvY2Vzc2VkQ29kZVxuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XG4gICAgfVxuICAgIHRva2VuaXplKCkge1xuICAgICAgICBcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxccy0sLjp8YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxuICAgICAgICBjb25zdCBjID0gU3RyaW5nLnJhd2BbJChdezAsMn1bJHtjYX1dK1spJF17MCwyfXxcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K10rXFwoWyR7Y2F9XStcXClcXCRgO1xuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgd2l0aCBlc2NhcGVkIGNoYXJhY3RlcnMgZm9yIHNwZWNpZmljIG1hdGNoaW5nXG4gICAgICAgIGNvbnN0IGNuID0gU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gOyAvLyBDb29yZGluYXRlIG5hbWVcbiAgICAgICAgY29uc3QgdCA9IFN0cmluZy5yYXdgXFxcIj9cXCRbXFx3XFxkXFxzXFwtLC46KCEpXFwtXFx7XFx9XFwrXFxcXCBeXSpcXCRcXFwiP3xbXFx3XFxkXFxzXFwtLC46KCEpX1xcLVxcK1xcXFxeXSpgOyAvLyBUZXh0IHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xuICAgICAgICBjb25zdCBmID0gU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7LiYqXFx7XFx9JVxcLTw+XWA7IC8vIEZvcm1hdHRpbmcgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG5cbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHVzaW5nIGVzY2FwZWQgYnJhY2VzIGFuZCBwYXR0ZXJuc1xuICAgICAgICBjb25zdCBjb29yUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHBpY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxwaWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBub2RlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHsoJHtjfSlcXH1cXHsoJHtjbn0qKVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHNlID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxub2RlXFxzKlxcKCooJHtjbn0pXFwpKlxccyphdFxccypcXCgoJHtjfSlcXClcXHMqXFxbKCR7Zn0qKVxcXVxccypcXHsoJHt0fSlcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XG4gICAgICAgIGNvbnN0IGRyYXdSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZHJhd1xcWygke2Z9KilcXF0oW147XSopO2AsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgeHlheGlzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHh5YXhpc3soJHt0fSl9eygke3R9KX1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgY2lyY2xlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNpcmNsZVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KCR7Y30rKVxcfVxceyhbXFx3XFxzXFxkXSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBtYXNzUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG1hc3NcXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoLVxcfHxcXHx8Pil7MCwxfVxcfVxceyhbXFxkLl0qKVxcfWAsXCJnXCIpO1xuICAgICAgICAvL1xccGlje2FuYzJ9e2FuYzF9e2FuYzB9ezc1XlxcY2lyYyB9e307XG4gICAgICAgIGNvbnN0IHZlY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx2ZWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCByZWdleFBhdHRlcm5zID0gW2Nvb3JSZWdleCwgc2UsIHNzLCBub2RlUmVnZXgsIGRyYXdSZWdleCwgY2lyY2xlUmVnZXgsIG1hc3NSZWdleCwgdmVjUmVnZXgscGljUmVnZXhdO1xuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XG4gICAgICAgIHJlZ2V4UGF0dGVybnMuZm9yRWFjaChhYiA9PiB7XG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiAoYS5pbmRleCB8fCAwKSAtIChiLmluZGV4IHx8IDApKTtcblxuICAgICAgICBbeHlheGlzUmVnZXgsZ3JpZFJlZ2V4XS5mb3JFYWNoKGFiID0+IHtcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkICYmIG1hdGNoLmluZGV4ID4gY3VycmVudEluZGV4KSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCwgbWF0Y2guaW5kZXgpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY29vclwiKSkge1xuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxuICAgICAgICAgICAgaWYobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yZGluYXRlXCIpKXtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFs1XSxjb29yZGluYXRlTmFtZTogbWF0Y2hbNF0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzJdfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHsgZm9ybWF0dGluZyxvcmlnaW5hbCwgLi4ucmVzdCB9ID0gaTtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwiY29vcmRpbmF0ZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwiY29vcmRpbmF0ZVwiLCBmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcblxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxwaWNcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpXG4gICAgICAgICAgICBjb25zdCBjMj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKVxuICAgICAgICAgICAgY29uc3QgYzM9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbM10sdGhpcylcblxuXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHttb2RlOiBcInBpYy1hbmdcIix0b2tlbnM6IHRoaXMsZm9ybWF0dGluZ1N0cmluZzogbWF0Y2hbNV0sZm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6IFwiYW5nXCIsaWNUZXh0OiBtYXRjaFs0XX0sZHJhd0FycjogW2MxLGMyLGMzXX0pKTtcbiAgICAgICAgICB9ZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxkcmF3XCIpKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHVuZGVmaW5lZCxtYXRjaFsxXSxtYXRjaFsyXSwgdGhpcykpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKHt0eXBlOiBcImdyaWRcIiwgcm90YXRlOiBtYXRjaFsxXX0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFszXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119XG4gICAgICAgICAgICBpZiAobWF0Y2hbMF0ubWF0Y2goL1xcXFxub2RlXFxzKlxcKC8pKXtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB7IGZvcm1hdHRpbmcsb3JpZ2luYWwsIC4uLnJlc3QgfSA9IGk7XG5cbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZVwiLCBmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcY2lyY2xlXCIpKSB7LypcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xuICAgICAgICAgICAgICB0eXBlOiBcImNpcmNsZVwiLFxuICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBtYXRjaFs0XSxcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzFdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFsyXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pOyovXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXG1hc3NcIikpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZVwiLGxhYmVsOiBtYXRjaFsyXSxheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIix7dGlrenNldDogJ21hc3MnLGFuY2hvcjogbWF0Y2hbM10scm90YXRlOiBtYXRjaFs0XX0pfSkpXG5cbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcdmVjXCIpKSB7XG4gICAgICAgICAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKTtcbiAgICAgICAgICAgIGNvbnN0IGF4aXMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzJdLHRoaXMpO1xuICAgICAgICAgICAgY29uc3Qgbm9kZT1uZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlLWlubGluZVwiLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKCdub2RlLWlubGluZScse2NvbG9yOiBcInJlZFwifSl9KVxuXG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQ29vcmRpbmF0ZShcIm5vZGUtaW5saW5lXCIpO1xuICAgICAgICAgICAgY29uc3QgcT1bYW5jZXIsJy0tKycsbm9kZSxheGlzMV1cbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe2Zvcm1hdHRpbmdPYmo6IHt0aWt6c2V0OiAndmVjJ30sdG9rZW5zOiB0aGlzLGRyYXdBcnI6IHF9KSlcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAoY3VycmVudEluZGV4IDwgdGhpcy5zb3VyY2UubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCkpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGdldE1pbigpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1pbn1cbiAgICBnZXRNYXgoKXtyZXR1cm4gdGhpcy52aWV3QW5jaG9ycy5tYXh9XG5cbiAgICBmaW5kVmlld0FuY2hvcnMoKSB7XG4gICAgICAgIGNvbnN0IGF4ZXMgPSBmbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSkgPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XG4gICAgICAgIGxldCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xuICAgICAgICBsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHk7XG4gICAgXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMgPSB7XG4gICAgICAgICAgICBtYXg6IG5ldyBBeGlzKDAsIDApLFxuICAgICAgICAgICAgbWluOiBuZXcgQXhpcygwLCAwKSxcbiAgICAgICAgICAgIGF2ZU1pZFBvaW50OiBuZXcgQXhpcygwLCAwKVxuICAgICAgICB9O1xuICAgIFxuICAgICAgICBheGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgY2FydGVzaWFuWCwgY2FydGVzaWFuWSB9ID0gYXhpcztcbiAgICBcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBzdW1zIGZvciBhdmVyYWdlIGNhbGN1bGF0aW9uXG4gICAgICAgICAgICBzdW1PZlggKz0gY2FydGVzaWFuWDtcbiAgICAgICAgICAgIHN1bU9mWSArPSBjYXJ0ZXNpYW5ZO1xuICAgIFxuICAgICAgICAgICAgLy8gVXBkYXRlIG1heCBhbmQgbWluIGNvb3JkaW5hdGVzXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA+IG1heFgpIG1heFggPSBjYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPiBtYXhZKSBtYXhZID0gY2FydGVzaWFuWTtcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YIDwgbWluWCkgbWluWCA9IGNhcnRlc2lhblg7XG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA8IG1pblkpIG1pblkgPSBjYXJ0ZXNpYW5ZO1xuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgY29uc3QgbGVuZ3RoID0gYXhlcy5sZW5ndGggIT09IDAgPyBheGVzLmxlbmd0aCA6IDE7XG4gICAgXG4gICAgICAgIC8vIFNldCB0aGUgdmlld0FuY2hvcnNcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCA9IG5ldyBBeGlzKHN1bU9mWCAvIGxlbmd0aCwgc3VtT2ZZIC8gbGVuZ3RoKTtcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5tYXggPSBuZXcgQXhpcyhtYXhYLCBtYXhZKTtcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5taW4gPSBuZXcgQXhpcyhtaW5YLCBtaW5ZKTtcbiAgICB9XG4gICAgXG5cbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkO1xuICAgIH1cbiAgICBcblxuICAgIHRvU3RyaW5nKCl7XG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xuICAgICAgICBjb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuXG4gICAgICAgICAgICBpZih0b2tlbi50b1N0cmluZygpKXtcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IHRva2VuO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjb2RlQmxvY2tPdXRwdXQ7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBmbGF0dGVuKGRhdGE6IGFueSwgcmVzdWx0czogYW55W10gPSBbXSwgc3RvcENsYXNzPzogYW55KTogYW55W10ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuICAgICAgICBmbGF0dGVuKGl0ZW0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgZGF0YSAhPT0gbnVsbCkge1xuICAgICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbiBpbnN0YW5jZSBvZiB0aGUgc3RvcENsYXNzLCBhZGQgaXQgdG8gcmVzdWx0cyBhbmQgc3RvcCBmbGF0dGVuaW5nXG4gICAgICBpZiAoc3RvcENsYXNzICYmIGRhdGEgaW5zdGFuY2VvZiBzdG9wQ2xhc3MpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH1cbiAgXG4gICAgICAvLyBBZGQgdGhlIGN1cnJlbnQgb2JqZWN0IHRvIHJlc3VsdHNcbiAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcbiAgXG4gICAgICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdFxuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xuICAgICAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgZmxhdHRlbihkYXRhW2tleV0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cbiAgXG5cblxuXG5cblxuXG5mdW5jdGlvbiBkaXNzZWN0WFlheGlzKG1hdGNoOiBSZWdFeHBNYXRjaEFycmF5KSB7XG4gICAgbGV0IFhub2RlOlJlZ0V4cE1hdGNoQXJyYXl8c3RyaW5nPVwiXCIsIFlub2RlOlJlZ0V4cE1hdGNoQXJyYXl8c3RyaW5nPVwiXCI7XG5cbiAgICBpZiAobWF0Y2hbMV0gJiYgbWF0Y2hbMl0pIHtcbiAgICAgICAgWG5vZGUgPSBtYXRjaFsxXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xuICAgICAgICBZbm9kZSA9IG1hdGNoWzJdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XG4gICAgICAgIFhub2RlPVhub2RlWzBdLnN1YnN0cmluZygxLFhub2RlLmxlbmd0aClcbiAgICAgICAgWW5vZGU9WW5vZGVbMF0uc3Vic3RyaW5nKDEsWW5vZGUubGVuZ3RoKVxuICAgIH1cbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgICB0eXBlOiBcInh5YXhpc1wiLFxuICAgICAgICBYZm9ybWF0dGluZzogbWF0Y2hbMV0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxuICAgICAgICBZZm9ybWF0dGluZzogbWF0Y2hbMl0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxuICAgICAgICB4RGlyZWN0aW9uOiBtYXRjaFsxXSAmJiAvLT4vLnRlc3QobWF0Y2hbMV0pID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIsXG4gICAgICAgIHlEaXJlY3Rpb246IG1hdGNoWzJdICYmIC8tPi8udGVzdChtYXRjaFsyXSkgPyBcImRvd25cIiA6IFwidXBcIixcbiAgICAgICAgWG5vZGU6IFhub2RlLFxuICAgICAgICBZbm9kZTogWW5vZGUsXG4gICAgfTtcbn1cblxuXG5cblxuXG5cblxuZnVuY3Rpb24gZ2V0RXh0cmVtZVhZKHRva2VuczogYW55KSB7XG5sZXQgbWF4WCA9IC1JbmZpbml0eTtcbmxldCBtYXhZID0gLUluZmluaXR5O1xubGV0IG1pblggPSBJbmZpbml0eTtcbmxldCBtaW5ZID0gSW5maW5pdHk7XG5cbnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XG4gICAgaWYgKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XG4gICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcbiAgICBpZiAodG9rZW4uWCA8IG1pblgpIG1pblggPSB0b2tlbi5YO1xuXG4gICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcbiAgICBpZiAodG9rZW4uWSA8IG1pblkpIG1pblkgPSB0b2tlbi5ZO1xuICAgIH1cbn0pO1xuXG5yZXR1cm4ge1xuICAgIG1heFgsbWF4WSxtaW5YLG1pblksXG59O1xufVxuXG5cblxuXG4vKlxuZnVuY3Rpb24gZ2VuZXJhdGVGb3JtYXR0aW5nKGNvb3JkaW5hdGU6IENvb3JkaW5hdGUpe1xuICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZS5sYWJlbCAhPT0gXCJzdHJpbmdcIil7IHJldHVybiBcIlwiOyB9XG4gICAgY29uc3QgZm9ybWF0dGluZyA9IGNvb3JkaW5hdGUuZm9ybWF0dGluZz8uc3BsaXQoXCIsXCIpIHx8IFtdO1xuICAgIGlmIChmb3JtYXR0aW5nLnNvbWUoKHZhbHVlOiBzdHJpbmcpID0+IC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLnRlc3QodmFsdWUpKSkge1xuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZS5mb3JtYXR0aW5nO1xuICAgIH1cbiAgICBpZihmb3JtYXR0aW5nLmxlbmd0aD4wJiYhZm9ybWF0dGluZ1tmb3JtYXR0aW5nLmxlbmd0aC0xXS5lbmRzV2l0aChcIixcIikpe2Zvcm1hdHRpbmcucHVzaChcIixcIil9XG4gICAgc3dpdGNoKGNvb3JkaW5hdGUucXVhZHJhbnQpe1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIHJpZ2h0LCBcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImFib3ZlIGxlZnQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgbGVmdCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA0OiBcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYmVsb3cgcmlnaHQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBmb3JtYXR0aW5nLmpvaW4oXCJcIik7XG59XG4qL1xuXG5cbmZ1bmN0aW9uIGdldFByZWFtYmxlKCk6c3RyaW5ne1xuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcbiAgXG4gICAgY29uc3QgbWFyaz1cIlxcXFxkZWZcXFxcbWFyayMxIzIjM3tcXFxccGF0aCBbZGVjb3JhdGlvbj17bWFya2luZ3MsIG1hcms9YXQgcG9zaXRpb24gMC41IHdpdGgge1xcXFxmb3JlYWNoIFxcXFx4IGluIHsjMX0geyBcXFxcZHJhd1tsaW5lIHdpZHRoPTFwdF0gKFxcXFx4LC0zcHQpIC0tIChcXFxceCwzcHQpOyB9fX0sIHBvc3RhY3Rpb249ZGVjb3JhdGVdICgjMikgLS0gKCMzKTt9XCJcbiAgXG4gICAgY29uc3QgYXJyPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFycn1bOF17XFxcXGNvb3JkaW5hdGUgKDIpIGF0ICgkKCMyKSEjNyEoIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDEpIGF0ICgkKDIpISM1bW0hOTA6KCMzKSQpO1xcXFxjb29yZGluYXRlICgzKSBhdCAoJCgyKSEjNW1tKyM0Y20hIzg6KCMzKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCw8LV0gKDEpLS0oMylub2RlIFtwb3M9IzZdIHtcXFxcbGFyZ2UgIzF9O31cIiBcbiAgICBjb25zdCBsZW5lPVwiXFxcXGRlZlxcXFxjb3IjMSMyIzMjNCM1e1xcXFxjb29yZGluYXRlICgjMSkgYXQoJCgjMikhIzMhIzQ6KCM1KSQpO31cXFxcZGVmXFxcXGRyIzEjMntcXFxcZHJhdyBbbGluZSB3aWR0aD0jMSxdIzI7fVxcXFxuZXdjb21tYW5ke1xcXFxsZW59WzZde1xcXFxjb3J7MX17IzJ9eyMzfXs5MH17IzR9XFxcXGNvcnszfXsjNH17IzN9ey05MH17IzJ9XFxcXG5vZGUgKDIpIGF0ICgkKDEpITAuNSEoMykkKSBbcm90YXRlPSM2XXtcXFxcbGFyZ2UgIzF9O1xcXFxkcnsjNXB0LHw8LX17KDEpLS0oMil9XFxcXGRyeyM1cHQsLT58fXsoMiktLSgzKX19XCJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxuICAgIFxuICAgIGNvbnN0IHRyZWU9XCJcXFxcbmV3Y29tbWFuZHtcXFxcbGVudX1bM117XFxcXHRpa3pzZXR7bGV2ZWwgZGlzdGFuY2U9MjBtbSxsZXZlbCAjMS8uc3R5bGU9e3NpYmxpbmcgZGlzdGFuY2U9IzJtbSwgbm9kZXM9e2ZpbGw9cmVkISMzLGNpcmNsZSxpbm5lciBzZXA9MXB0LGRyYXc9bm9uZSx0ZXh0PWJsYWNrLH19fX1cIlxuICAgIFxuICAgIGNvbnN0IHRhYmxlPVwiXFxcXHRpa3pzZXR7IHRhYmxlLy5zdHlsZT17bWF0cml4IG9mIG5vZGVzLHJvdyBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsY29sdW1uIHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxub2Rlcz17cmVjdGFuZ2xlLGRyYXc9YmxhY2ssYWxpZ249Y2VudGVyfSxtaW5pbXVtIGhlaWdodD0xLjVlbSx0ZXh0IGRlcHRoPTAuNWV4LHRleHQgaGVpZ2h0PTJleCxub2RlcyBpbiBlbXB0eSBjZWxscyxldmVyeSBldmVuIHJvdy8uc3R5bGU9e25vZGVzPXtmaWxsPWdyYXkhNjAsdGV4dD1ibGFjayx9fSxjb2x1bW4gMS8uc3R5bGU9e25vZGVzPXt0ZXh0IHdpZHRoPTVlbSxmb250PVxcXFxiZnNlcmllc319LHJvdyAxLy5zdHlsZT17bm9kZXM9e2ZvbnQ9XFxcXGJmc2VyaWVzfX19fVwiXG4gICAgY29uc3QgY29vcj1cIlxcXFxkZWZcXFxcY29vciMxIzIjMyM0e1xcXFxjb29yZGluYXRlIFtsYWJlbD17WyM0XTpcXFxcTGFyZ2UgIzN9XSAoIzIpIGF0ICgkKCMxKSQpO31cIlxuICAgIC8vY29uc3QgbWFzcz1gXFxcXGRlZlxcXFxtYXNzIzEjMntcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCMxKXsjMn07fWBcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcbiAgICBcbiAgICBjb25zdCBwaWNBbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYW5nfVs1XXtcXFxcY29vcmRpbmF0ZSAoYW5nMSkgYXQgKCMxKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzIpIGF0ICgjMik7IFxcXFxjb29yZGluYXRlIChhbmczKSBhdCAoIzMpOyBcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nM317Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdDQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcxfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQUJcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXGFuZ0NCIC0gXFxcXGFuZ0FCfVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PDBwdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXHBnZm1hdGhyZXN1bHQgKyAzNjB9XFxcXGZpXFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ+MTgwcHRcXFxccGdmbWF0aHBhcnNlezM2MCAtIFxcXFxwZ2ZtYXRocmVzdWx0fVxcXFxmaVxcXFxsZXRcXFxcYW5nQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhzZXRtYWNyb3tcXFxcYW5nbGVDaGVja317YWJzKFxcXFxhbmdCIC0gOTApfVxcXFxpZnRoZW5lbHNle1xcXFxsZW5ndGh0ZXN0e1xcXFxhbmdsZUNoZWNrIHB0IDwgMC4xcHR9fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXtyaWdodCBhbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde2FuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O319XCJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcbiAgICByZXR1cm4gcHJlYW1ibGUrYW5nK21hcmsrYXJyK2xlbmUrc3ByaW5nK3RyZWUrdGFibGUrY29vcitkdmVjdG9yK3BpY0FuZytcIlxcXFxwZ2ZwbG90c3NldHtjb21wYXQ9MS4xNn1cXFxcYmVnaW57ZG9jdW1lbnR9XFxcXGJlZ2lue3Rpa3pwaWN0dXJlfVwiXG59Il19