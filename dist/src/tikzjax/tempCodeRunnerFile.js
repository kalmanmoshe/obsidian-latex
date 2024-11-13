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
export class Formatting {
    // importent needs to be forst
    path;
    scale;
    rotate;
    lineWidth;
    textOpacity;
    opacity;
    fillOpacity;
    pos;
    angleEccentricity;
    angleRadius;
    levelDistance;
    mode;
    anchor;
    width;
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
                this.width = 'thin';
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
        const slope = findSlope(edge1, edge2);
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
    quadrant;
    constructor(mode, axis, coordinateName, formatting, label, quadrant) {
        if (typeof mode === "string") {
            this.mode = mode;
            if (axis !== undefined)
                this.axis = axis;
            this.coordinateName = coordinateName;
            if (formatting !== undefined)
                this.formatting = formatting;
            this.label = label;
            this.quadrant = quadrant;
        }
        else if (typeof mode === "object" && mode !== null) {
            const options = mode;
            if (options.mode !== undefined)
                this.mode = options.mode;
            this.axis = options.axis;
            this.coordinateName = options.coordinateName;
            this.formatting = options.formatting;
            this.label = options.label;
            this.quadrant = options.quadrant;
        }
        if (!this.formatting)
            this.formatting = new Formatting(this.mode, []);
        if (this.mode === "coordinate") {
            this.formatting.assignFormatting({ label: { freeFormText: this.label } });
        }
    }
    clone() {
        return new Coordinate(this.mode, this.axis ? this.axis.clone() : undefined, this.coordinateName, this.formatting, this.label, this.quadrant);
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
    midPoint;
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
        const flatAxes = flatten(this.tokens).filter((item) => item instanceof Axis);
        flatAxes.forEach((axis) => {
            axis.addQuadrant(this.midPoint);
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
                this.tokens.push(new Draw({ mode: "pic-ang", tokens: this, formattingString: match[5], formattingObj: { picText: match[4] }, drawArr: [c1, c2, c3] }));
            }
            else if (match[0].startsWith("\\draw")) {
                this.tokens.push(new Draw(undefined, match[1], match[2], this));
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
    findMidpoint() {
        const axes = flatten(this.tokens).filter((item) => item instanceof Axis);
        let sumOfX = 0, sumOfY = 0;
        axes.forEach((axis) => {
            sumOfX += axis.cartesianX;
            sumOfY += axis.cartesianY;
        });
        this.midPoint = new Axis();
        const length = axes.length !== 0 ? axes.length : 1;
        this.midPoint.addCartesian(sumOfX / length, sumOfY / length);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Rpa3pqYXgvdGVtcENvZGVSdW5uZXJGaWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBTyxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRTlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3QyxhQUFhO0FBQ2IsT0FBTyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDNUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN0SCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFJakQsTUFBTSxPQUFPLE9BQU87SUFDaEIsR0FBRyxDQUFNO0lBQ1QsTUFBTSxDQUFhO0lBQ25CLFVBQVUsQ0FBc0I7SUFFaEMsWUFBWSxHQUFRLEVBQUMsTUFBa0I7UUFDckMsSUFBSSxDQUFDLEdBQUcsR0FBQyxHQUFHLENBQUM7UUFDYixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLG1CQUFtQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxNQUFNLEdBQUMsTUFBTSxDQUFDO0lBQ3JCLENBQUM7SUFFRCxXQUFXO1FBQ1QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUU7WUFDM0MsSUFBSSxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLGFBQWEsRUFBRSxDQUFDLEdBQUcsRUFBRSxNQUFNLEVBQUUsRUFBRTtnQkFDN0Us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QVc7SUFDaEIsTUFBTSxHQUFHLEdBQUMsb0xBQW9MLENBQUE7SUFFOUwsTUFBTSxJQUFJLEdBQUMsNkxBQTZMLENBQUE7SUFFeE0sTUFBTSxHQUFHLEdBQUMsb05BQW9OLENBQUE7SUFDOU4sTUFBTSxJQUFJLEdBQUMsd1JBQXdSLENBQUE7SUFDblMsTUFBTSxNQUFNLEdBQUMsMGdCQUEwZ0IsQ0FBQTtJQUV2aEIsTUFBTSxJQUFJLEdBQUMsaUtBQWlLLENBQUE7SUFFNUssTUFBTSxLQUFLLEdBQUMsNldBQTZXLENBQUE7SUFDelgsTUFBTSxJQUFJLEdBQUMsK0VBQStFLENBQUE7SUFDMUYsaUdBQWlHO0lBQ2pHLE1BQU0sT0FBTyxHQUFDLHNLQUFzSyxDQUFBO0lBRXBMLE1BQU0sTUFBTSxHQUFDLDh2QkFBOHZCLENBQUE7SUFDM3dCLE1BQU0sUUFBUSxHQUFDLG1QQUFtUCxDQUFBO0lBQ2xRLE9BQU8sUUFBUSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxpRUFBaUUsQ0FBQTtBQUM3SSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBNYXJrZG93blZpZXcsIFdvcmtzcGFjZVdpbmRvdyB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgTWF0aFBsdWdpbiBmcm9tIFwic3JjL21haW5cIjtcclxuaW1wb3J0IHsgb3B0aW1pemUgfSBmcm9tIFwiLi9zdmdvLmJyb3dzZXIuanNcIjtcclxuLy8gQHRzLWlnbm9yZVxyXG5pbXBvcnQgdGlrempheEpzIGZyb20gXCJpbmxpbmU6Li90aWt6amF4LmpzXCI7XHJcbmltcG9ydCB7IGNhcnRlc2lhblRvUG9sYXIsIGZpbmRJbnRlcnNlY3Rpb25Qb2ludCwgZmluZFNsb3BlLCBwb2xhclRvQ2FydGVzaWFuLCB0b051bWJlciB9IGZyb20gXCJzcmMvbWF0aFV0aWxpdGllcy5qc1wiO1xyXG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRpa3pqYXgge1xyXG4gICAgYXBwOiBBcHA7XHJcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgICBhY3RpdmVWaWV3OiBNYXJrZG93blZpZXcgfCBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgICB0aGlzLmFwcD1hcHA7XHJcbiAgICAgIHRoaXMuYWN0aXZlVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmVhZHlMYXlvdXQoKXtcclxuICAgICAgdGhpcy5wbHVnaW4uYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcclxuICAgICAgICB0aGlzLmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XHJcbiAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gIFxyXG4gICAgbG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG4gICAgICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xyXG4gICAgICAgIHMuaWQgPSBcInRpa3pqYXhcIjtcclxuICAgICAgICBzLnR5cGUgPSBcInRleHQvamF2YXNjcmlwdFwiO1xyXG4gICAgICAgIHMuaW5uZXJUZXh0ID0gdGlrempheEpzO1xyXG4gICAgICAgIGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xyXG4gICAgICAgIGRvYy5hZGRFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgdW5sb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XHJcbiAgICAgICAgY29uc3QgcyA9IGRvYy5nZXRFbGVtZW50QnlJZChcInRpa3pqYXhcIik7XHJcbiAgICAgICAgcz8ucmVtb3ZlKCk7XHJcblxyXG4gICAgICAgIGRvYy5yZW1vdmVFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xyXG4gICAgfVxyXG4gIFxyXG4gICAgbG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcbiAgICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgXHJcbiAgICB1bmxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcclxuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xyXG4gICAgICAgICAgICB0aGlzLnVubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgXHJcbiAgICBnZXRBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGNvbnN0IHdpbmRvd3MgPSBbXTtcclxuICAgICAgICBcclxuICAgICAgICAvLyBwdXNoIHRoZSBtYWluIHdpbmRvdydzIHJvb3Qgc3BsaXQgdG8gdGhlIGxpc3RcclxuICAgICAgICB3aW5kb3dzLnB1c2godGhpcy5hcHAud29ya3NwYWNlLnJvb3RTcGxpdC53aW4pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEB0cy1pZ25vcmUgZmxvYXRpbmdTcGxpdCBpcyB1bmRvY3VtZW50ZWRcclxuICAgICAgICBjb25zdCBmbG9hdGluZ1NwbGl0ID0gdGhpcy5hcHAud29ya3NwYWNlLmZsb2F0aW5nU3BsaXQ7XHJcbiAgICAgICAgZmxvYXRpbmdTcGxpdC5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgYSB3aW5kb3csIHB1c2ggaXQgdG8gdGhlIGxpc3QgXHJcbiAgICAgICAgICAgIGlmIChjaGlsZCBpbnN0YW5jZW9mIFdvcmtzcGFjZVdpbmRvdykge1xyXG4gICAgICAgICAgICAgICAgd2luZG93cy5wdXNoKGNoaWxkLndpbik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHdpbmRvd3M7XHJcbiAgICB9XHJcbiAgXHJcbiAgXHJcbiAgICByZWdpc3RlclRpa3pDb2RlQmxvY2soKSB7XHJcbiAgICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3Rlck1hcmtkb3duQ29kZUJsb2NrUHJvY2Vzc29yKFwidGlrelwiLCAoc291cmNlLCBlbCwgY3R4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGVsLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XHJcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IFwibWF0aC1kZWJ1Zy1pY29uXCIsXHJcbiAgICAgICAgICAgICAgICB0ZXh0Q29udGVudDogXCLwn5uIXCIsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB0cnl7XHJcbiAgICAgICAgICAgIGNvbnN0IHNjcmlwdCA9IGVsLmNyZWF0ZUVsKFwic2NyaXB0XCIpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcclxuICAgICAgICAgICAgc2NyaXB0LnNldEF0dHJpYnV0ZShcImRhdGEtc2hvdy1jb25zb2xlXCIsIFwidHJ1ZVwiKTtcclxuICAgICAgICAgICAgY29uc3QgdGlrempheD1uZXcgRm9ybWF0VGlrempheChzb3VyY2UpO1xyXG4gICAgICAgICAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCx0aWt6amF4LmRlYnVnSW5mbykub3BlbigpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0VGV4dCh0aWt6amF4LmdldENvZGUoKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2F0Y2goZSl7XHJcbiAgICAgICAgICAgICAgICBlbC5pbm5lckhUTUwgPSBcIlwiO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZXJyb3JEaXNwbGF5ID0gZWwuY3JlYXRlRWwoXCJkaXZcIiwgeyBjbHM6IFwibWF0aC1lcnJvci1saW5lXCIgfSk7XHJcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuaW5uZXJUZXh0ID0gYEVycm9yOiAke2UubWVzc2FnZX1gO1xyXG4gICAgICAgICAgICAgICAgZXJyb3JEaXNwbGF5LmNsYXNzTGlzdC5hZGQoXCJlcnJvci10ZXh0XCIpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIlRpa1ogUHJvY2Vzc2luZyBFcnJvcjpcIiwgZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLnB1c2goe25hbWU6IFwiVGlrelwiLCBtaW1lOiBcInRleHQveC1sYXRleFwiLCBtb2RlOiBcInN0ZXhcIn0pO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIHJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvID0gd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8uZmlsdGVyKGVsID0+IGVsLm5hbWUgIT0gXCJUaWt6XCIpO1xyXG4gICAgICB9XHJcblxyXG4gIFxyXG4gICAgICBjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICBzdmcgPSBzdmcucmVwbGFjZUFsbCgvKFwiIzAwMFwifFwiYmxhY2tcIikvZywgXCJcXFwiY3VycmVudENvbG9yXFxcIlwiKVxyXG4gICAgICAgICAgICAgICAgLnJlcGxhY2VBbGwoLyhcIiNmZmZcInxcIndoaXRlXCIpL2csIFwiXFxcInZhcigtLWJhY2tncm91bmQtcHJpbWFyeSlcXFwiXCIpO1xyXG4gICAgICAgIHJldHVybiBzdmc7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICAgIHJldHVybiBvcHRpbWl6ZShzdmcsIHtwbHVnaW5zOlxyXG4gICAgICAgICAgICAgIFtcclxuICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJwcmVzZXQtZGVmYXVsdFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFudXBJRHM6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgfSk/LmRhdGE7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgcG9zdFByb2Nlc3NTdmcgPSAoZTogRXZlbnQpID0+IHtcclxuICBcclxuICAgICAgICAgIGNvbnN0IHN2Z0VsID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICBsZXQgc3ZnID0gc3ZnRWwub3V0ZXJIVE1MO1xyXG4gIFxyXG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpIHtcclxuICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcclxuICBcclxuICAgICAgICAgIHN2Z0VsLm91dGVySFRNTCA9IHN2ZztcclxuICAgICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZWdFeHAocGF0dGVybjogc3RyaW5nIHwgUmVnRXhwLCBmbGFnczogc3RyaW5nID0gJycpOiBSZWdFeHAge1xyXG4gICAgcGF0dGVybj1wYXR0ZXJuIGluc3RhbmNlb2YgUmVnRXhwP3BhdHRlcm4uc291cmNlOnBhdHRlcm47XHJcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChTdHJpbmcucmF3YCR7cGF0dGVybn1gLCBmbGFncz9mbGFnczonJyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldFJlZ2V4KCl7XHJcbiAgICBjb25zdCBiYXNpYyA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjpdYDtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgYmFzaWM6IGJhc2ljLFxyXG4gICAgICAgIG1lcmdlOiBTdHJpbmcucmF3YC1cXHx8XFx8LXwhW1xcZC5dKyF8XFwrfC1gLFxyXG4gICAgICAgIC8vY29vcmRpbmF0ZTogbmV3IFJlZ0V4cChTdHJpbmcucmF3YCgke2Jhc2ljfSt8MSlgKSxcclxuICAgICAgICBjb29yZGluYXRlTmFtZTogU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gLFxyXG4gICAgICAgIHRleHQ6IFN0cmluZy5yYXdgW1xcd1xccy0sLjokKCEpXytcXFxce309XWAsXHJcbiAgICAgICAgZm9ybWF0dGluZzogU3RyaW5nLnJhd2BbXFx3XFxzXFxkPTosISc7Jip7fSUtPD5dYFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuaW50ZXJmYWNlIHRva2VuICB7XHJcbiAgICBYPzogbnVtYmVyO1xyXG4gICAgWT86IG51bWJlcjtcclxuICAgIHR5cGU/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcclxuICAgIGNvb3JkaW5hdGVzPzogYW55O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5jb25zdCBwYXJzZU51bWJlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcclxufTtcclxuXHJcblxyXG5mdW5jdGlvbiBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+LCBpbmRleDogbnVtYmVyKTogeyBiZWZvcmU6IG51bWJlciwgYWZ0ZXI6IG51bWJlciB9IHtcclxuICAgIFxyXG4gICAgbGV0IGJlZm9yZUluZGV4ID0gYXhlcy5zbGljZSgwLCBpbmRleCkuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICBsZXQgYWZ0ZXJJbmRleCA9IGF4ZXMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xyXG5cclxuICAgIC8vIEFkanVzdCBgYWZ0ZXJJbmRleGAgc2luY2Ugd2Ugc2xpY2VkIGZyb20gYGluZGV4ICsgMWBcclxuICAgIGlmIChhZnRlckluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIGFmdGVySW5kZXggKz0gaW5kZXggKyAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFdyYXAgYXJvdW5kIGlmIG5vdCBmb3VuZFxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIGJlZm9yZUluZGV4ID0gYXhlcy5maW5kTGFzdEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoYWZ0ZXJJbmRleCA9PT0gLTEpIHtcclxuICAgICAgICBhZnRlckluZGV4ID0gYXhlcy5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgfVxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSB8fCBhZnRlckluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgdmFsaWQgQXhpcyBvYmplY3RzLlwiKTtcclxuICAgIH1cclxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gYWZ0ZXJJbmRleCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlByYWlzZWQgYXhpcyBhcyBzYW1lIHRva2VuXCIpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHsgYmVmb3JlOiBiZWZvcmVJbmRleCwgYWZ0ZXI6IGFmdGVySW5kZXggfTtcclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBBeGlzIHtcclxuICAgIGNhcnRlc2lhblg6IG51bWJlcjtcclxuICAgIGNhcnRlc2lhblk6IG51bWJlcjtcclxuICAgIHBvbGFyQW5nbGU6IG51bWJlcjtcclxuICAgIHBvbGFyTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBuYW1lPzogc3RyaW5nO1xyXG4gICAgcXVhZHJhbnQ/OiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIsbmFtZT86IHN0cmluZykge1xyXG4gICAgICAgIGlmIChjYXJ0ZXNpYW5YICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWCA9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgaWYgKGNhcnRlc2lhblkgIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5ZID0gY2FydGVzaWFuWTtcclxuICAgICAgICBpZiAocG9sYXJMZW5ndGggIT09IHVuZGVmaW5lZCkgdGhpcy5wb2xhckxlbmd0aCA9IHBvbGFyTGVuZ3RoO1xyXG4gICAgICAgIGlmIChwb2xhckFuZ2xlICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJBbmdsZSA9IHBvbGFyQW5nbGU7XHJcbiAgICAgICAgdGhpcy5uYW1lPW5hbWVcclxuICAgIH1cclxuXHJcbiAgICBjbG9uZSgpOiBBeGlzIHtcclxuICAgICAgICByZXR1cm4gbmV3IEF4aXModGhpcy5jYXJ0ZXNpYW5YLCB0aGlzLmNhcnRlc2lhblksdGhpcy5wb2xhckxlbmd0aCx0aGlzLnBvbGFyQW5nbGUsdGhpcy5uYW1lKTtcclxuICAgIH1cclxuXHJcbiAgICB1bml2ZXJzYWwoY29vcmRpbmF0ZTogc3RyaW5nLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGFuY2hvckFycj86IGFueSxhbmNob3I/OiBzdHJpbmcpOiBBeGlzIHtcclxuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZUFycjogQXJyYXk8QXhpc3xzdHJpbmc+ID0gW107XHJcbiAgICAgICAgbWF0Y2hlcy5mb3JFYWNoKChtYXRjaDogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xyXG4gICAgICAgICAgICBsZXQgYXhpczogQXhpc3x1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5hZGRDYXJ0ZXNpYW4obWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgLzovLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkUG9sYXIobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMucG9sYXJUb0NhcnRlc2lhbigpXHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvIVtcXGQuXSshLy50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAoL1tcXGRcXHddKy8pLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF4aXMgPSB0b2tlbnMuZmluZE9yaWdpbmFsVmFsdWUobWF0Y2gpPy5heGlzO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgdGhyb3cgbmV3IEVycm9yKGBUcmllZCB0byBmaW5kIG9yaWdpbmFsIGNvb3JkaW5hdGUgdmFsdWUgd2hpbGUgbm90IGJlaW5nIHByb3ZpZGVkIHdpdGggdG9rZW5zYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGF4aXMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgdGhlIGNvb3JkaW5hdGUgJHttYXRjaH0gZnJvbSAke2Nvb3JkaW5hdGV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMubmFtZT1tYXRjaFxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMubWVyZ2VBeGlzKGNvb3JkaW5hdGVBcnIpXHJcblxyXG4gICAgICAgIGlmKGFuY2hvckFyciYmYW5jaG9yJiZhbmNob3IubWF0Y2goLygtLVxcK3wtLVxcK1xcKykvKSl7XHJcbiAgICAgICAgICAgIGxldCBhOiBBeGlzXHJcbiAgICAgICAgICAgIGlmIChhbmNob3IubWF0Y2goLygtLVxcKykvKSl7XHJcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kKChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICAgICAgICAgIH1lbHNle1xyXG4gICAgICAgICAgICAgICAgYT1hbmNob3JBcnIuZmluZExhc3QoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYSxcImFkZGl0aW9uXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIG1lcmdlQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPikge1xyXG4gICAgICAgIGlmICghYXhlcy5zb21lKChheGlzOiBhbnkpID0+IHR5cGVvZiBheGlzID09PSBcInN0cmluZ1wiKSkge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGF4aXMgb2YgYXhlcykge1xyXG4gICAgICAgICAgICBpZih0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIil7Y29udGludWU7fVxyXG4gICAgICAgICAgICBheGlzLm5hbWU9dW5kZWZpbmVkXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXhlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXhlc1tpXTtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcclxuICAgICAgICAgICAgY29uc3Qgc2lkZXMgPSBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXMsIGkpO1xyXG4gICAgICAgICAgICBjb25zdCBiZWZvcmVBeGlzID0gYXhlc1tzaWRlcy5iZWZvcmVdIGFzIEF4aXM7XHJcbiAgICAgICAgICAgIGNvbnN0IGFmdGVyQXhpcyA9IGF4ZXNbc2lkZXMuYWZ0ZXJdIGFzIEF4aXM7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZXQgIG1hdGNoID0gY3VycmVudC5tYXRjaCgvXlxcKyQvKTtcclxuICAgICAgICAgICAgbGV0IG1vZGUsbW9kaWZpZXJzO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiYWRkaXRpb25cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL14tXFx8JC8pXHJcbiAgICAgICAgICAgIGlmKCFtb2RlJiZtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJyaWdodFByb2plY3Rpb25cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL15cXCEoW1xcZC5dKylcXCEkLylcclxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcclxuICAgICAgICAgICAgICAgIG1vZGUgPSBcImludGVybmFsUG9pbnRcIlxyXG4gICAgICAgICAgICAgICAgbW9kaWZpZXJzPXRvTnVtYmVyKG1hdGNoWzFdKVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZihtb2RlKXtcclxuICAgICAgICAgICAgICAgIGF4ZXMuc3BsaWNlKHNpZGVzLmJlZm9yZSwgc2lkZXMuYWZ0ZXIgLSBzaWRlcy5iZWZvcmUgKyAxLCBiZWZvcmVBeGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYWZ0ZXJBeGlzLG1vZGUsbW9kaWZpZXJzKSk7XHJcbiAgICAgICAgICAgICAgICBpID0gc2lkZXMuYmVmb3JlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGF4ZXMubGVuZ3RoID09PSAxICYmIGF4ZXNbMF0gaW5zdGFuY2VvZiBBeGlzKSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbXBsZXhDYXJ0ZXNpYW5BZGQoYXhpczogQXhpcyxtb2RlOiBzdHJpbmcsbW9kaWZpZXI/OiBhbnkpe1xyXG4gICAgICAgIHN3aXRjaCAobW9kZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiYWRkaXRpb25cIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWCs9YXhpcy5jYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZKz1heGlzLmNhcnRlc2lhblk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInN1YnRyYWN0aW9uXCI6XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInJpZ2h0UHJvamVjdGlvblwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPWF4aXMuY2FydGVzaWFuWFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJpbnRlcm5hbFBvaW50XCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9KHRoaXMuY2FydGVzaWFuWCtheGlzLmNhcnRlc2lhblgpKm1vZGlmaWVyO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZPSh0aGlzLmNhcnRlc2lhblkrYXhpcy5jYXJ0ZXNpYW5ZKSptb2RpZmllcjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNhcnRlc2lhblRvUG9sYXIoKVxyXG4gICAgICAgIHJldHVybiB0aGlzXHJcbiAgICB9O1xyXG5cclxuXHJcbiAgICBnZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlOiBzdHJpbmcpe1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybiA9IGdldFJlZ2V4KCk7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtcclxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLmJhc2ljfSspYCwgXCJnXCIpLFxyXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4ubWVyZ2V9KylgLCBcImdcIilcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgMTogRXh0cmFjdCBtYXRjaGVzIGZvciBlYWNoIHBhdHRlcm4gc2VwYXJhdGVseVxyXG4gICAgICAgIGNvbnN0IGJhc2ljTWF0Y2hlcyA9IEFycmF5LmZyb20oY29vcmRpbmF0ZS5tYXRjaEFsbChyZWdleFBhdHRlcm5zWzBdKSkubWFwKChtYXRjaDogUmVnRXhwRXhlY0FycmF5KSA9PiAoe1xyXG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLnJlcGxhY2UoLy0kL2csIFwiXCIpLCAvLyBSZW1vdmUgdHJhaWxpbmcgaHlwaGVuIG9ubHlcclxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXHJcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoLShtYXRjaFswXS5tYXRjaCgvLSQvKT8xOjApXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1lcmdlTWF0Y2hlcyA9IEFycmF5LmZyb20oY29vcmRpbmF0ZS5tYXRjaEFsbChyZWdleFBhdHRlcm5zWzFdKSkubWFwKChtYXRjaDogUmVnRXhwRXhlY0FycmF5KSA9PiAoe1xyXG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLFxyXG4gICAgICAgICAgICBpbmRleDogbWF0Y2guaW5kZXggPz8gMCxcclxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGhcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlczogQXJyYXk8eyBmdWxsTWF0Y2g6IHN0cmluZywgaW5kZXg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIgfT4gPSBbXTtcclxuXHJcbiAgICAgICAgZnVuY3Rpb24gaXNPdmVybGFwcGluZyhtYXRjaDE6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSwgbWF0Y2gyOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0pIHtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoMS5pbmRleCA8IG1hdGNoMi5pbmRleCArIG1hdGNoMi5sZW5ndGggJiYgbWF0Y2gyLmluZGV4IDwgbWF0Y2gxLmluZGV4ICsgbWF0Y2gxLmxlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFsuLi5iYXNpY01hdGNoZXMsIC4uLm1lcmdlTWF0Y2hlc10uZm9yRWFjaChtYXRjaCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG92ZXJsYXBwaW5nSW5kZXggPSBtYXRjaGVzLmZpbmRJbmRleChleGlzdGluZ01hdGNoID0+IGlzT3ZlcmxhcHBpbmcoZXhpc3RpbmdNYXRjaCwgbWF0Y2gpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChvdmVybGFwcGluZ0luZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdNYXRjaCA9IG1hdGNoZXNbb3ZlcmxhcHBpbmdJbmRleF07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBjdXJyZW50IG1hdGNoIGNvdmVycyBhIGxhcmdlciByYW5nZSwgcmVwbGFjZSB0aGUgZXhpc3Rpbmcgb25lXHJcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gubGVuZ3RoID4gZXhpc3RpbmdNYXRjaC5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdID0gbWF0Y2g7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RlcCAzOiBTb3J0IHRoZSBmaW5hbCBtYXRjaGVzIGJ5IGluZGV4XHJcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RlcCA0OiBWYWxpZGF0ZSB0aGUgcmVzdWx0XHJcbiAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvb3JkaW5hdGUgaXMgbm90IHZhbGlkOyBleHBlY3RlZCBhIHZhbGlkIGNvb3JkaW5hdGUuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWF0Y2hlcztcclxuICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICBwcm9qZWN0aW9uKGF4aXMxOiBBeGlzfHVuZGVmaW5lZCxheGlzMjogQXhpc3x1bmRlZmluZWQpOmFueXtcclxuICAgICAgICBpZiAoIWF4aXMxfHwhYXhpczIpe3Rocm93IG5ldyBFcnJvcihcImF4aXMncyB3ZXJlIHVuZGVmaW5lZCBhdCBwcm9qZWN0aW9uXCIpO31cclxuICAgICAgICByZXR1cm4gW3tYOiBheGlzMS5jYXJ0ZXNpYW5YLFk6IGF4aXMyLmNhcnRlc2lhbll9LHtYOiBheGlzMi5jYXJ0ZXNpYW5YLFk6IGF4aXMxLmNhcnRlc2lhbll9XVxyXG4gICAgfVxyXG5cclxuICAgIGNvbWJpbmUoY29vcmRpbmF0ZUFycjogYW55KXtcclxuICAgICAgICBsZXQgeD0wLHk9MDtcclxuICAgICAgICBjb29yZGluYXRlQXJyLmZvckVhY2goKGNvb3JkaW5hdGU6IEF4aXMpPT57XHJcbiAgICAgICAgICAgIHgrPWNvb3JkaW5hdGUuY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgeSs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPXg7dGhpcy5jYXJ0ZXNpYW5ZPXk7XHJcbiAgICB9XHJcbiAgICBhZGRDYXJ0ZXNpYW4oeDogc3RyaW5nIHwgbnVtYmVyLCB5PzogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCF5ICYmIHR5cGVvZiB4ID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgICAgIFt4LCB5XSA9IHguc3BsaXQoXCIsXCIpLm1hcChOdW1iZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoeCA9PT0gdW5kZWZpbmVkIHx8IHkgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIENhcnRlc2lhbiBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWCA9IHggYXMgbnVtYmVyO1xyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWSA9IHkgYXMgbnVtYmVyO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwb2xhclRvQ2FydGVzaWFuKCl7XHJcbiAgICAgICAgY29uc3QgdGVtcD1wb2xhclRvQ2FydGVzaWFuKHRoaXMucG9sYXJBbmdsZSwgdGhpcy5wb2xhckxlbmd0aClcclxuICAgICAgICB0aGlzLmFkZENhcnRlc2lhbih0ZW1wLlgsdGVtcC5ZKVxyXG4gICAgfVxyXG5cclxuICAgIGNhcnRlc2lhblRvUG9sYXIoKXtcclxuICAgICAgICBjb25zdCB0ZW1wPWNhcnRlc2lhblRvUG9sYXIodGhpcy5jYXJ0ZXNpYW5YLCB0aGlzLmNhcnRlc2lhblkpXHJcbiAgICAgICAgdGhpcy5hZGRQb2xhcih0ZW1wLmFuZ2xlLHRlbXAubGVuZ3RoKVxyXG4gICAgfVxyXG5cclxuICAgIGFkZFBvbGFyKGFuZ2xlOiBzdHJpbmcgfCBudW1iZXIsIGxlbmd0aD86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghbGVuZ3RoICYmIHR5cGVvZiBhbmdsZSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICBbYW5nbGUsIGxlbmd0aF0gPSBhbmdsZS5zcGxpdChcIjpcIikubWFwKE51bWJlcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChhbmdsZSA9PT0gdW5kZWZpbmVkIHx8IGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgcG9sYXIgY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBvbGFyQW5nbGUgPSBhbmdsZSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5wb2xhckxlbmd0aCA9IGxlbmd0aCBhcyBudW1iZXI7XHJcbiAgICB9XHJcbiAgICBhZGRRdWFkcmFudChtaWRQb2ludDogQXhpcyl7XHJcbiAgICAgICAgY29uc3QgeD1taWRQb2ludC5jYXJ0ZXNpYW5YPnRoaXMuY2FydGVzaWFuWDtcclxuICAgICAgICBjb25zdCB5PW1pZFBvaW50LmNhcnRlc2lhblk+dGhpcy5jYXJ0ZXNpYW5ZO1xyXG5cclxuICAgICAgICB0aGlzLnF1YWRyYW50PXg/eT8xOjQ6eT8yOjM7XHJcbiAgICB9XHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIsXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgfVxyXG5cclxuICAgIGludGVyc2VjdGlvbihjb29yZDogc3RyaW5nLCBmaW5kT3JpZ2luYWxWYWx1ZTogKGNvb3JkOiBzdHJpbmcpID0+IENvb3JkaW5hdGUgfCB1bmRlZmluZWQpOiB7WDpudW1iZXIsWTpudW1iZXJ9IHtcclxuICAgICAgICBjb25zdCBvcmlnaW5hbENvb3JkcyA9IGNvb3JkXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFxzKmFuZFxccz98LS0pL2csIFwiIFwiKVxyXG4gICAgICAgICAgICAuc3BsaXQoXCIgXCIpXHJcbiAgICAgICAgICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHRva2VuKTogdG9rZW4gaXMgQ29vcmRpbmF0ZSA9PiB0b2tlbiAhPT0gdW5kZWZpbmVkKTtcclxuXHJcbiAgICAgICAgaWYgKG9yaWdpbmFsQ29vcmRzLmxlbmd0aCA8IDQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW50ZXJzZWN0aW9uIGhhZCB1bmRlZmluZWQgY29vcmRpbmF0ZXMgb3IgaW5zdWZmaWNpZW50IGRhdGEuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBzbG9wZXMgPSBbXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzFdLmF4aXMgYXMgQXhpcyksXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1syXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzNdLmF4aXMgYXMgQXhpcyksXHJcbiAgICAgICAgXTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGZpbmRJbnRlcnNlY3Rpb25Qb2ludChvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB0b1BvaW50KHZhbHVlOm51bWJlcixmb3JtYXQ6IHN0cmluZyl7XHJcbiAgICBzd2l0Y2ggKGZvcm1hdCkge1xyXG4gICAgICAgIGNhc2UgXCJwdFwiOlxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgY2FzZSBcImNtXCI6IFxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqMjguMzQ2O1xyXG4gICAgICAgIGNhc2UgXCJtbVwiOlxyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWUqIDIuODM0NjtcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ1bmtub24gZm9ybWF0XCIpO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gbWF0Y2hLZXlXaXRoVmFsdWUoa2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgY29uc3QgdmFsdWVNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XHJcbiAgICAgICAgXCJhbmNob3JcIjogXCJhbmNob3I9XCIsXHJcbiAgICAgICAgXCJyb3RhdGVcIjogXCJyb3RhdGU9XCIsXHJcbiAgICAgICAgXCJsaW5lV2lkdGhcIjogXCJsaW5lIHdpZHRoPVwiLFxyXG4gICAgICAgIFwiZmlsbFwiOiBcImZpbGw9XCIsXHJcbiAgICAgICAgXCJmaWxsT3BhY2l0eVwiOiBcImZpbGwgb3BhY2l0eT1cIixcclxuICAgICAgICBcInRleHRPcGFjaXR5XCI6IFwidGV4dCBvcGFjaXR5PVwiLFxyXG4gICAgICAgIFwidGV4dENvbG9yXCI6IFwidGV4dCBjb2xvcj1cIixcclxuICAgICAgICBcImRyYXdcIjogXCJkcmF3PVwiLFxyXG4gICAgICAgIFwidGV4dFwiOiBcInRleHQ9XCIsXHJcbiAgICAgICAgXCJwb3NcIjogXCJwb3M9XCIsXHJcbiAgICAgICAgXCJzY2FsZVwiOiBcInNjYWxlPVwiLFxyXG4gICAgICAgIFwiZGVjb3JhdGVcIjogXCJkZWNvcmF0ZVwiLFxyXG4gICAgICAgIFwic2xvcGVkXCI6IFwic2xvcGVkXCIsXHJcbiAgICAgICAgXCJkZWNvcmF0aW9uXCI6IFwiZGVjb3JhdGlvbj1cIixcclxuICAgICAgICBcImJyYWNlXCI6IFwiYnJhY2VcIixcclxuICAgICAgICBcImFtcGxpdHVkZVwiOiBcImFtcGxpdHVkZT1cIixcclxuICAgICAgICBcImFuZ2xlUmFkaXVzXCI6IFwiYW5nbGUgcmFkaXVzPVwiLFxyXG4gICAgICAgIFwiYW5nbGVFY2NlbnRyaWNpdHlcIjogXCJhbmdsZSBlY2NlbnRyaWNpdHk9XCIsXHJcbiAgICAgICAgXCJmb250XCI6IFwiZm9udD1cIixcclxuICAgICAgICBcInBpY1RleHRcIjogXCJwaWMgdGV4dD1cIixcclxuICAgICAgICBcImxhYmVsXCI6IFwibGFiZWw9XCIsXHJcbiAgICB9O1xyXG5cclxuICAgIHJldHVybiB2YWx1ZU1hcFtrZXldIHx8ICcnO1xyXG59XHJcblxyXG5cclxudHlwZSBEZWNvcmF0aW9uID0ge1xyXG4gICAgYnJhY2U/OiBib29sZWFuO1xyXG4gICAgY29pbDogYm9vbGVhbjtcclxuICAgIGFtcGxpdHVkZT86IG51bWJlcjtcclxuICAgIGFzcGVjdD86IG51bWJlcjtcclxuICAgIHNlZ21lbnRMZW5ndGg/OiBudW1iZXI7XHJcbiAgICBkZWNvcmF0aW9uPzogRGVjb3JhdGlvbjsgXHJcbn07XHJcbnR5cGUgTGFiZWwgPSB7XHJcbiAgICBmcmVlRm9ybVRleHQ/OiBzdHJpbmc7XHJcbn07XHJcblxyXG5leHBvcnQgY2xhc3MgRm9ybWF0dGluZ3tcclxuICAgIC8vIGltcG9ydGVudCBuZWVkcyB0byBiZSBmb3JzdFxyXG4gICAgcGF0aD86IHN0cmluZztcclxuXHJcbiAgICBzY2FsZTogbnVtYmVyO1xyXG4gICAgcm90YXRlPzogbnVtYmVyO1xyXG4gICAgbGluZVdpZHRoPzogbnVtYmVyO1xyXG4gICAgdGV4dE9wYWNpdHk6IG51bWJlcjtcclxuICAgIG9wYWNpdHk/OiBudW1iZXI7XHJcbiAgICBmaWxsT3BhY2l0eT86IG51bWJlcjtcclxuICAgIHBvcz86IG51bWJlcjtcclxuICAgIGFuZ2xlRWNjZW50cmljaXR5PzogbnVtYmVyO1xyXG4gICAgYW5nbGVSYWRpdXM/OiBudW1iZXI7XHJcbiAgICBsZXZlbERpc3RhbmNlPzogbnVtYmVyO1xyXG5cclxuICAgIG1vZGU6IHN0cmluZztcclxuICAgIGFuY2hvcj86IHN0cmluZztcclxuICAgIHdpZHRoPzogc3RyaW5nO1xyXG4gICAgY29sb3I/OiBzdHJpbmc7XHJcbiAgICB0ZXh0Q29sb3I/OiBzdHJpbmc7XHJcbiAgICBmaWxsPzogc3RyaW5nO1xyXG4gICAgYXJyb3c/OiBzdHJpbmc7XHJcbiAgICBkcmF3Pzogc3RyaW5nO1xyXG4gICAgdGV4dD86IHN0cmluZztcclxuICAgIHRpa3pzZXQ/OiBzdHJpbmc7XHJcbiAgICBwb3NpdGlvbj86IHN0cmluZztcclxuICAgIGxpbmVTdHlsZT86IHN0cmluZztcclxuICAgIGZvbnQ/OiBzdHJpbmc7XHJcbiAgICBwaWNUZXh0Pzogc3RyaW5nO1xyXG4gICAgXHJcbiAgICBzbG9wZWQ/OiBib29sZWFuO1xyXG4gICAgZGVjb3JhdGU/OiBib29sZWFuO1xyXG4gICAgbGFiZWw/OiBMYWJlbDtcclxuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKG1vZGU6IHN0cmluZyxmb3JtYXR0aW5nQXJyOiBhbnksZm9ybWF0dGluZ1N0cmluZz86c3RyaW5nKXtcclxuICAgICAgICB0aGlzLm1vZGU9bW9kZTtcclxuICAgICAgICB0aGlzLmFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZ0Fycnx8W10pO1xyXG4gICAgICAgIHRoaXMuaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nfHxcIlwiKTtcclxuICAgICAgICByZXR1cm4gdGhpc1xyXG4gICAgfVxyXG5cclxuICAgIGFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nOiBhbnkpe1xyXG4gICAgICAgIGNvbnN0IGE9c3BsaXRGb3JtYXR0aW5nLmZpbmQoKGl0ZW06IHN0cmluZyk9PiBpdGVtLm1hdGNoKC9tYXNzfGFuZ3xoZWxwbGluZXMvKSlcclxuICAgICAgICBpZiAoIWEmJiF0aGlzLnRpa3pzZXQpcmV0dXJuO1xyXG4gICAgICAgIGlmKGEpIHRoaXMudGlrenNldD1hO1xyXG5cclxuICAgICAgICBzd2l0Y2ggKHRoaXMudGlrenNldCkge1xyXG4gICAgICAgICAgICBjYXNlIFwibWFzc1wiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPVwieWVsbG93ITYwXCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGg9XCJkcmF3XCI7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnRleHQ9XCJibGFja1wiO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJ2ZWNcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9Jy0+J1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJoZWxwbGluZXNcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMud2lkdGg9J3RoaW4nO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3PSdncmF5JztcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiYW5nXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGg9J2RyYXcnXHJcbiAgICAgICAgICAgICAgICB0aGlzLmZpbGw9J2JsYWNrITUwJztcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbE9wYWNpdHk9MC41O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3PSdvcmFuZ2UnXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFycm93PSc8LT4nXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlRWNjZW50cmljaXR5PTEuNjtcclxuICAgICAgICAgICAgICAgIHRoaXMuYW5nbGVSYWRpdXM9dG9Qb2ludCgwLjUsXCJjbVwiKTtcclxuICAgICAgICAgICAgICAgIHRoaXMudGV4dD0nb3JhbmdlJztcclxuICAgICAgICAgICAgICAgIHRoaXMuZm9udD0nXFxcXGxhcmdlJztcclxuICAgICAgICAgICAgICAgIHRoaXMudGV4dE9wYWNpdHk9MC45O1xyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYWRkU3Bsb3BBbmRQb3NpdGlvbihhcnI6IGFueSxpbmRleDogbnVtYmVyKXtcclxuICAgICAgICBjb25zdCBiZWZvcmVBZnRlcj1maW5kQmVmb3JlQWZ0ZXJBeGlzKGFycixpbmRleCk7XHJcbiAgICAgICAgY29uc3QgW2JlZm9yZSwgYWZ0ZXJdPVthcnJbYmVmb3JlQWZ0ZXIuYmVmb3JlXSxhcnJbYmVmb3JlQWZ0ZXIuYWZ0ZXJdXVxyXG4gICAgICAgIGlmICh0aGlzLnBvc2l0aW9ufHx0aGlzLnNsb3BlZCl7cmV0dXJufVxyXG4gICAgXHJcbiAgICAgICAgY29uc3QgZWRnZTEgPSBiZWZvcmUucXVhZHJhbnQ/LnRvU3RyaW5nKCl8fFwiXCI7XHJcbiAgICAgICAgY29uc3QgZWRnZTIgPSBhZnRlci5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcclxuICAgICAgICBjb25zdCBzbG9wZT1maW5kU2xvcGUoZWRnZTEsZWRnZTIpXHJcblxyXG4gICAgICAgIHRoaXMuc2xvcGVkID0gc2xvcGUgIT09IDAmJnNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5O1xyXG5cclxuICAgICAgICBsZXQgcXVhZHJhbnRcclxuXHJcbiAgICAgICAgaWYgKGVkZ2UxIT09ZWRnZTIpXHJcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxK2VkZ2UyO1xyXG4gICAgICAgIGVsc2UgXHJcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxO1xyXG5cclxuICAgICAgICAvL3NpbnQgcGFyYWxsZWwgdG8gWSBheGlzXHJcbiAgICAgICAgaWYgKHNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5KXtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHF1YWRyYW50LnJlcGxhY2UoLygzfDQpLyxcImJlbG93XCIpLnJlcGxhY2UoLygxfDIpLyxcImFib3ZlXCIpLnJlcGxhY2UoLyhiZWxvd2Fib3ZlfGFib3ZlYmVsb3cpLyxcIlwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICAvL2lzbnQgcGFyYWxsZWwgdG8gWCBheGlzXHJcbiAgICAgICAgaWYgKHNsb3BlICE9PSAwKXtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbis9cXVhZHJhbnQucmVwbGFjZSgvKDF8NCkvLFwicmlnaHRcIikucmVwbGFjZSgvKDJ8MykvLFwibGVmdFwiKS5yZXBsYWNlKC8ocmlnaHRsZWZ0fGxlZnRyaWdodCkvLFwiXCIpXHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbj8ucmVwbGFjZSgvW1xcZF0rL2csXCJcIikucmVwbGFjZSgvKGJlbG93fGFib3ZlKShyaWdodHxsZWZ0KS8sXCIkMSAkMlwiKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhzbG9wZSx0aGlzLnBvc2l0aW9uLHF1YWRyYW50KVxyXG4gICAgfVxyXG5cclxuICAgIGFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZ0FycjogUmVjb3JkPHN0cmluZywgYW55Pikge1xyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGZvcm1hdHRpbmdBcnIpKSB7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwmJiF0aGlzW2tleSBhcyBrZXlvZiBGb3JtYXR0aW5nXSkge1xyXG4gICAgICAgICAgICAgICAgKHRoaXMgYXMgUmVjb3JkPHN0cmluZywgYW55Pilba2V5XSA9IHt9O1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNldFByb3BlcnR5KGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nLCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBpbnRlcnByZXRGb3JtYXR0aW5nKGZvcm1hdHRpbmdTdHJpbmc6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHNwbGl0Rm9ybWF0dGluZyA9IGZvcm1hdHRpbmdTdHJpbmcucmVwbGFjZSgvXFxzL2csIFwiXCIpLm1hdGNoKC8oPzp7W159XSp9fFteLHt9XSspKy9nKSB8fCBbXTtcclxuICAgIFxyXG4gICAgICAgIHRoaXMuYWRkVGlrenNldChzcGxpdEZvcm1hdHRpbmcpO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgcGF0dGVybnM6IFJlY29yZDxzdHJpbmcsICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkPiA9IHtcclxuICAgICAgICAgICAgXCJsaW5ld2lkdGhcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwibGluZVdpZHRoXCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJmaWxsPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJmaWxsXCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeZmlsbG9wYWNpdHlcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZmlsbE9wYWNpdHlcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl4oLT58PC18LSp7U3RlYWx0aH0tKikkXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmFycm93ID0gdmFsdWU7IH0sXHJcbiAgICAgICAgICAgIFwiXihhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KXsxLDJ9JFwiOiAodmFsdWUpID0+IHsgdGhpcy5wb3NpdGlvbiA9IHZhbHVlLnJlcGxhY2UoLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8sIFwiJDEgXCIpOyB9LFxyXG4gICAgICAgICAgICBcIl5wb3M9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcInBvc1wiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXmRyYXc9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImRyYXdcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5kZWNvcmF0ZSRcIjogKCkgPT4geyB0aGlzLmRlY29yYXRlID0gdHJ1ZTsgfSxcclxuICAgICAgICAgICAgXCJedGV4dD1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwidGV4dFwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXmFuY2hvcj1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiYW5jaG9yXCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeXFxcIl5cXFwiJFwiOiAoKSA9PiB0aGlzLnNldFByb3BlcnR5KFwibGFiZWxcIix0cnVlLFwiZnJlZUZvcm1UZXh0XCIgYXMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tcImxhYmVsXCJdPiksXHJcbiAgICAgICAgICAgIFwiXmJyYWNlJFwiOiAoKSA9PiB0aGlzLnNldFByb3BlcnR5KFwiZGVjb3JhdGlvblwiLHRydWUsXCJicmFjZVwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJkZWNvcmF0aW9uXCJdPiksXHJcbiAgICAgICAgICAgIFwiXmFtcGxpdHVkZVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJkZWNvcmF0aW9uXCIsIHZhbHVlLCBcImFtcGxpdHVkZVwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJkZWNvcmF0aW9uXCJdPiksXHJcbiAgICAgICAgICAgIFwiXmRyYXckXCI6ICh2YWx1ZSkgPT4geyB0aGlzLnBhdGggPSB2YWx1ZTsgfSxcclxuICAgICAgICAgICAgXCJeKHJlZHxibHVlfHBpbmt8YmxhY2t8d2hpdGV8WyFcXFxcZC5dKyl7MSw1fSRcIjogKHZhbHVlKSA9PiB7IHRoaXMuY29sb3IgPSB2YWx1ZTsgfSxcclxuICAgICAgICAgICAgXCJeKGRvdHRlZHxkYXNoZWR8c21vb3RofGRlbnNlbHl8bG9vc2VseSl7MSwyfSRcIjogKHZhbHVlKSA9PiB7IHRoaXMubGluZVN0eWxlID0gdmFsdWUucmVwbGFjZSgvKGRlbnNlbHl8bG9vc2VseSkvLCBcIiQxIFwiKTsgfSxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBzcGxpdEZvcm1hdHRpbmcuZm9yRWFjaChmb3JtYXR0aW5nID0+IHtcclxuICAgICAgICAgICAgLy8gSGFuZGxlIG5lc3RlZCBwcm9wZXJ0aWVzXHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZm9ybWF0dGluZy5tYXRjaCgvXihbXj1dKyk9eyguKil9JC8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IFtfLCBwYXJlbnQsIGNoaWxkcmVuXSA9IG1hdGNoO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdPYmogPSB0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICAgICAgICAgICAgICBpZiAoIWZvcm1hdHRpbmdPYmpbcGFyZW50XSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpbcGFyZW50XSA9IHt9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkQ2hpbGQgPSBuZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUse30sY2hpbGRyZW4pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGZvcm1hdHRpbmdPYmpbcGFyZW50XSwgKHBhcnNlZENoaWxkIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW3BhcmVudF0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtwYXR0ZXJuLCBoYW5kbGVyXSBvZiBPYmplY3QuZW50cmllcyhwYXR0ZXJucykpIHtcclxuICAgICAgICAgICAgICAgIGlmIChuZXcgUmVnRXhwKHBhdHRlcm4pLnRlc3QoZm9ybWF0dGluZykpIHtcclxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyKGZvcm1hdHRpbmcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICBzcGxpdDxLIGV4dGVuZHMga2V5b2YgRm9ybWF0dGluZywgTksgZXh0ZW5kcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW0tdPiB8IHVuZGVmaW5lZD4oXHJcbiAgICAgICAga2V5OiBLLFxyXG4gICAgICAgIGZvcm1hdHRpbmc6IGFueSxcclxuICAgICAgICBuZXN0ZWRLZXk/OiBOS1xyXG4gICAgKTogdm9pZCB7XHJcbiAgICAgICAgbGV0IHZhbHVlO1xyXG4gICAgICAgIGlmKHR5cGVvZiBmb3JtYXR0aW5nIT09XCJib29sZWFuXCIpe1xyXG4gICAgICAgICAgICBsZXQgbWF0Y2ggPSBmb3JtYXR0aW5nLnNwbGl0KFwiPVwiKTtcclxuICAgIFxyXG4gICAgICAgICAgICAvLyBFbnN1cmUgdGhlIGZvcm1hdHRpbmcgc3RyaW5nIGlzIHZhbGlkXHJcbiAgICAgICAgICAgIGlmIChtYXRjaC5sZW5ndGggPCAyIHx8ICFtYXRjaFsxXSkgcmV0dXJuO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gVHJpbSBhbnkgcG90ZW50aWFsIHdoaXRlc3BhY2UgYXJvdW5kIHRoZSB2YWx1ZVxyXG4gICAgICAgICAgICBjb25zdCByYXdWYWx1ZSA9IG1hdGNoWzFdLnRyaW0oKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIERldGVybWluZSBpZiB0aGUgdmFsdWUgaXMgYSBudW1iZXIgb3IgYSBzdHJpbmdcclxuICAgICAgICAgICAgdmFsdWUgPSAhaXNOYU4ocGFyc2VGbG9hdChyYXdWYWx1ZSkpICYmIGlzRmluaXRlKCtyYXdWYWx1ZSlcclxuICAgICAgICAgICAgICAgID8gcGFyc2VGbG9hdChyYXdWYWx1ZSlcclxuICAgICAgICAgICAgICAgIDogcmF3VmFsdWUucmVwbGFjZSgvLVxcfC8sJ25vcnRoJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2V7XHJcbiAgICAgICAgICAgIHZhbHVlPWZvcm1hdHRpbmdcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5zZXRQcm9wZXJ0eShrZXksIHZhbHVlLCBuZXN0ZWRLZXkpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBzZXRQcm9wZXJ0eTxLIGV4dGVuZHMga2V5b2YgRm9ybWF0dGluZywgTksgZXh0ZW5kcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW0tdPiB8IHVuZGVmaW5lZD4oXHJcbiAgICAgICAga2V5OiBLLFxyXG4gICAgICAgIHZhbHVlOiBhbnksXHJcbiAgICAgICAgbmVzdGVkS2V5PzogTktcclxuICAgICk6IHZvaWQge1xyXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWU9PT1cInN0cmluZ1wiKXtcclxuICAgICAgICAgICAgdmFsdWU9dmFsdWUucmVwbGFjZSgvXlxcfC0kLyxcIm5vcnRoXCIpLnJlcGxhY2UoL14tXFx8JC8sXCJzb3V0aFwiKTtcclxuICAgICAgICAgICAgY29uc3QgbWF0Y2g9dmFsdWUubWF0Y2goLyhbXFxkLl0rKShwdHxjbXxtbSkvKVxyXG4gICAgICAgICAgICBpZiAobWF0Y2gpXHJcbiAgICAgICAgICAgIHZhbHVlPXRvUG9pbnQoTnVtYmVyKG1hdGNoWzFdKSxtYXRjaFsyXSlcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGZvcm1hdHRpbmdPYmogPSB0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XHJcblxyXG4gICAgICAgIGlmIChuZXN0ZWRLZXkpIHtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IGtleXMgPSB0eXBlb2YgbmVzdGVkS2V5ID09PSBcInN0cmluZ1wiID8gbmVzdGVkS2V5LnNwbGl0KCcuJykgOiBbbmVzdGVkS2V5XTtcclxuICAgICAgICAgICAgdGhpcy50aWt6c2V0XHJcbiAgICAgICAgICAgIGlmKCFmb3JtYXR0aW5nT2JqW2tleV0pZm9ybWF0dGluZ09ialtrZXldPXt9O1xyXG4gICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV1bbmVzdGVkS2V5XT12YWx1ZTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBmb3JtYXR0aW5nT2JqW2tleV0gPSB2YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG4gICAgdG9TdHJpbmcob2JqPzogYW55KTogc3RyaW5nIHtcclxuICAgICAgICBsZXQgc3RyaW5nPW9iaj8neyc6J1snO1xyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG9iaj9vYmo6dGhpcykpIHtcclxuICAgICAgICAgICAgaWYgKGtleS5tYXRjaCgvXihtb2RlfHRpa3pzZXQpJC8pKXtjb250aW51ZTt9XHJcbiAgICAgICAgICAgIGlmKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcmJnZhbHVlKXtcclxuICAgICAgICAgICAgICAgIHN0cmluZys9bWF0Y2hLZXlXaXRoVmFsdWUoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcpK3RoaXMudG9TdHJpbmcodmFsdWUpKycsJ1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW1hdGNoS2V5V2l0aFZhbHVlKGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nKSsodHlwZW9mIHZhbHVlPT09XCJib29sZWFuXCI/Jyc6dmFsdWUpKycsJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc3RyaW5nKyhvYmo/J30nOiddJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaGFuZGxlT2JqZWN0VG9TdHJpbmcob2JqOiBvYmplY3QsIHBhcmVudEtleTogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gbWF0Y2hLZXlXaXRoVmFsdWUocGFyZW50S2V5KSsneyc7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqKSkge1xyXG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCArPSBtYXRjaEtleVdpdGhWYWx1ZShgJHtwYXJlbnRLZXl9LiR7a2V5fWApICsgKHR5cGVvZiB2YWx1ZSA9PT0gXCJib29sZWFuXCIgPyAnJyA6IHZhbHVlKSArICcsJztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0K1wifSxcIjtcclxuICAgIH1cclxufVxyXG50eXBlIE1vZGUgPSBcImNvb3JkaW5hdGVcIiB8IFwiY29vcmRpbmF0ZS1pbmxpbmVcIiB8IFwibm9kZVwiIHwgXCJub2RlLWlubGluZVwiO1xyXG5leHBvcnQgY2xhc3MgQ29vcmRpbmF0ZSB7XHJcbiAgICBtb2RlOiBNb2RlO1xyXG4gICAgYXhpcz86IEF4aXM7XHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcclxuICAgIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nO1xyXG4gICAgbGFiZWw/OiBzdHJpbmc7XHJcbiAgICBxdWFkcmFudD86IG51bWJlcjtcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IobW9kZT86IE1vZGUsIGF4aXM/OiBBeGlzLCBjb29yZGluYXRlTmFtZT86IHN0cmluZywgZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsIGxhYmVsPzogc3RyaW5nLCBxdWFkcmFudD86IG51bWJlcik7XHJcbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zOiB7IG1vZGU/OiBNb2RlOyBheGlzPzogQXhpczsgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7IGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nOyBsYWJlbD86IHN0cmluZzsgcXVhZHJhbnQ/OiBudW1iZXIgfSk7XHJcblxyXG5cclxuICBjb25zdHJ1Y3RvcihcclxuICAgIG1vZGU/OiBNb2RlIHwgeyBtb2RlPzogTW9kZTsgYXhpcz86IEF4aXM7IG9yaWdpbmFsPzogc3RyaW5nOyBjb29yZGluYXRlTmFtZT86IHN0cmluZzsgZm9ybWF0dGluZz86IEZvcm1hdHRpbmc7IGxhYmVsPzogc3RyaW5nOyBxdWFkcmFudD86IG51bWJlciB9LFxyXG4gICAgYXhpcz86IEF4aXMsXHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZyxcclxuICAgIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLFxyXG4gICAgbGFiZWw/OiBzdHJpbmcsXHJcbiAgICBxdWFkcmFudD86IG51bWJlclxyXG4gICkge1xyXG4gICAgaWYgKHR5cGVvZiBtb2RlID09PSBcInN0cmluZ1wiKSB7XHJcblxyXG4gICAgICB0aGlzLm1vZGUgPSBtb2RlO1xyXG4gICAgICBpZiAoYXhpcyAhPT0gdW5kZWZpbmVkKSB0aGlzLmF4aXMgPSBheGlzO1xyXG4gICAgICB0aGlzLmNvb3JkaW5hdGVOYW1lID0gY29vcmRpbmF0ZU5hbWU7XHJcbiAgICAgIGlmIChmb3JtYXR0aW5nICE9PSB1bmRlZmluZWQpIHRoaXMuZm9ybWF0dGluZyA9IGZvcm1hdHRpbmc7XHJcbiAgICAgIHRoaXMubGFiZWwgPSBsYWJlbDtcclxuICAgICAgdGhpcy5xdWFkcmFudCA9IHF1YWRyYW50O1xyXG5cclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZGUgPT09IFwib2JqZWN0XCIgJiYgbW9kZSAhPT0gbnVsbCkge1xyXG4gICAgICBjb25zdCBvcHRpb25zID0gbW9kZTtcclxuICAgICAgaWYgKG9wdGlvbnMubW9kZSAhPT0gdW5kZWZpbmVkKSB0aGlzLm1vZGUgPSBvcHRpb25zLm1vZGU7XHJcbiAgICAgIHRoaXMuYXhpcyA9IG9wdGlvbnMuYXhpcztcclxuICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSA9IG9wdGlvbnMuY29vcmRpbmF0ZU5hbWU7XHJcbiAgICAgIHRoaXMuZm9ybWF0dGluZyA9IG9wdGlvbnMuZm9ybWF0dGluZztcclxuICAgICAgdGhpcy5sYWJlbCA9IG9wdGlvbnMubGFiZWw7XHJcbiAgICAgIHRoaXMucXVhZHJhbnQgPSBvcHRpb25zLnF1YWRyYW50O1xyXG4gICAgfVxyXG4gICAgaWYgKCF0aGlzLmZvcm1hdHRpbmcpXHJcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKHRoaXMubW9kZSxbXSlcclxuXHJcbiAgICBpZiAodGhpcy5tb2RlPT09XCJjb29yZGluYXRlXCIpe1xyXG4gICAgICAgIHRoaXMuZm9ybWF0dGluZy5hc3NpZ25Gb3JtYXR0aW5nKHtsYWJlbDoge2ZyZWVGb3JtVGV4dDogdGhpcy5sYWJlbH19KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gICAgY2xvbmUoKTogQ29vcmRpbmF0ZSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBDb29yZGluYXRlKFxyXG4gICAgICAgICAgICB0aGlzLm1vZGUsXHJcbiAgICAgICAgICAgIHRoaXMuYXhpcyA/IHRoaXMuYXhpcy5jbG9uZSgpIDp1bmRlZmluZWQsXHJcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUsXHJcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZyxcclxuICAgICAgICAgICAgdGhpcy5sYWJlbCxcclxuICAgICAgICAgICAgdGhpcy5xdWFkcmFudFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICBhZGRBeGlzKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyKXtcclxuICAgICAgICB0aGlzLmF4aXM9bmV3IEF4aXMoY2FydGVzaWFuWCwgY2FydGVzaWFuWSwgcG9sYXJMZW5ndGgsIHBvbGFyQW5nbGUpO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCkge1xyXG4gICAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgXCJjb29yZGluYXRlXCI6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5heGlzKVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybmBcXFxcY29vcmRpbmF0ZSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKSB8fCAnJ30gKCR7dGhpcy5jb29yZGluYXRlTmFtZSB8fCBcIlwifSkgYXQgKCR7dGhpcy5heGlzLnRvU3RyaW5nKCl9KTtgXHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlXCI6XHJcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5heGlzKVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgXFxcXG5vZGUgJHt0aGlzLmNvb3JkaW5hdGVOYW1lPycoJyt0aGlzLmNvb3JkaW5hdGVOYW1lKycpJzonJ30gYXQgKCR7dGhpcy5heGlzLnRvU3RyaW5nKCl9KSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKXx8Jyd9IHske3RoaXMubGFiZWx9fTtgXHJcbiAgICAgICAgICAgIGNhc2UgXCJub2RlLWlubGluZVwiOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBub2RlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpIHx8ICcnfSB7JHt0aGlzLmxhYmVsIHx8ICcnfX1gXHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDb3VsZG4ndCBmaW5kIG1vZGUgYXQgdG8gc3RyaW5nIGNvb3JkaW5hdGVcIik7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgYWRkUXVhZHJhbnQobWlkUG9pbnQ6IEF4aXMpIHtcclxuICAgICAgICBpZiAodGhpcy5heGlzKXtcclxuICAgICAgICAgICAgY29uc3QgeERpcmVjdGlvbiA9IHRoaXMuYXhpcy5jYXJ0ZXNpYW5YID4gbWlkUG9pbnQuY2FydGVzaWFuWCA/IDEgOiAtMTtcclxuICAgICAgICAgICAgY29uc3QgeURpcmVjdGlvbiA9IHRoaXMuYXhpcy5jYXJ0ZXNpYW5ZID4gbWlkUG9pbnQuY2FydGVzaWFuWSA/IDEgOiAtMTtcclxuICAgICAgICAgICAgdGhpcy5xdWFkcmFudCA9IHlEaXJlY3Rpb24gPT09IDEgPyAoeERpcmVjdGlvbiA9PT0gMSA/IDEgOiAyKSA6ICh4RGlyZWN0aW9uID09PSAxID8gNCA6IDMpO1xyXG4gICAgICAgIH0gICBcclxuICAgIH1cclxufVxyXG5cclxudHlwZSBUb2tlbiA9QXhpcyB8IENvb3JkaW5hdGUgfERyYXd8Rm9ybWF0dGluZ3wgc3RyaW5nO1xyXG5cclxuZXhwb3J0IGNsYXNzIERyYXcge1xyXG4gICAgbW9kZT86IHN0cmluZ1xyXG4gICAgZm9ybWF0dGluZzogRm9ybWF0dGluZztcclxuICAgIGNvb3JkaW5hdGVzOiBBcnJheTxUb2tlbj47XHJcblxyXG4gICAgY29uc3RydWN0b3IobW9kZT86IHN0cmluZyxmb3JtYXR0aW5nPzogc3RyaW5nLGRyYXc/OiBzdHJpbmcsIHRva2Vucz86IEZvcm1hdFRpa3pqYXgsKTtcclxuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnM6IHttb2RlPzogc3RyaW5nLCBmb3JtYXR0aW5nU3RyaW5nPzogc3RyaW5nLCBmb3JtYXR0aW5nT2JqPzogb2JqZWN0LGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLGRyYXdTdHJpbmc/OiBzdHJpbmcsZHJhd0Fycj86IGFueSx0b2tlbnM/OiBGb3JtYXRUaWt6amF4fSk7XHJcblxyXG5cclxuICAgIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIG1vZGU/OiBzdHJpbmcgfCB7bW9kZT86IHN0cmluZywgZm9ybWF0dGluZ1N0cmluZz86IHN0cmluZywgZm9ybWF0dGluZ09iaj86IG9iamVjdCxmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxkcmF3U3RyaW5nPzogc3RyaW5nLGRyYXdBcnI/OiBhbnksdG9rZW5zPzogRm9ybWF0VGlrempheH0sXHJcbiAgICAgICAgZm9ybWF0dGluZz86IHN0cmluZyxcclxuICAgICAgICBkcmF3Pzogc3RyaW5nLCBcclxuICAgICAgICB0b2tlbnM/OiBGb3JtYXRUaWt6amF4XHJcbiAgICAgICkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgbW9kZT09PVwic3RyaW5nXCJ8fHR5cGVvZiBkcmF3PT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgIHRoaXMubW9kZT1gZHJhdyR7bW9kZT9cIi1cIittb2RlOlwiXCJ9YDtcclxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPW5ldyBGb3JtYXR0aW5nKHRoaXMubW9kZSx7fSxmb3JtYXR0aW5nKTtcclxuICAgICAgICAgICAgaWYgKGRyYXcpXHJcbiAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXMgPSB0aGlzLmZpbGxDb29yZGluYXRlcyh0aGlzLmdldFNjaGVtYXRpYyhkcmF3KSwgdG9rZW5zKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSBpZihtb2RlJiZ0eXBlb2YgbW9kZT09PVwib2JqZWN0XCIpe1xyXG4gICAgICAgICAgICBjb25zdCBvcHRpb25zPW1vZGU7XHJcbiAgICAgICAgICAgIHRoaXMubW9kZT1gZHJhdyR7b3B0aW9ucz8ubW9kZT9cIi1cIitvcHRpb25zLm1vZGU6XCJcIn1gO1xyXG4gICAgICAgICAgICBpZiAoIW9wdGlvbnM/LmZvcm1hdHRpbmcpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9IG5ldyBGb3JtYXR0aW5nKHRoaXMubW9kZSxvcHRpb25zPy5mb3JtYXR0aW5nT2JqLG9wdGlvbnM/LmZvcm1hdHRpbmdTdHJpbmcpO1xyXG4gICAgICAgICAgICBlbHNlIHRoaXMuZm9ybWF0dGluZz1vcHRpb25zLmZvcm1hdHRpbmc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAob3B0aW9ucz8uZHJhd0FycilcclxuICAgICAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXM9b3B0aW9ucy5kcmF3QXJyO1xyXG4gICAgICAgICAgICBlbHNlIGlmIChvcHRpb25zLmRyYXdTdHJpbmchPT11bmRlZmluZWQpe1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcyA9IHRoaXMuZmlsbENvb3JkaW5hdGVzKHRoaXMuZ2V0U2NoZW1hdGljKG9wdGlvbnMuZHJhd1N0cmluZyksIHRva2Vucyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBjcmVhdGVGcm9tQXJyYXkoYXJyOiBhbnkpey8qXHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPGFyci5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgaWYgKGFycltpXSBpbnN0YW5jZW9mIEF4aXN8fGFycltpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpe1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZih0eXBlb2YgYXJyPT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5OyovXHJcbiAgICB9XHJcblxyXG4gICAgZmlsbENvb3JkaW5hdGVzKHNjaGVtYXRpYzogYW55W10sIHRva2Vucz86IEZvcm1hdFRpa3pqYXgpIHtcclxuICAgICAgICBjb25zdCBjb29yQXJyOiBBcnJheTxUb2tlbj49W107XHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2hlbWF0aWMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgaWYgKHNjaGVtYXRpY1tpXS50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgICAgICAgICAgbGV0IHByZXZpb3VzRm9ybWF0dGluZztcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoaSA+IDAgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMV0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPiAxICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJub2RlXCIgJiYgc2NoZW1hdGljW2kgLSAyXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHByZXZpb3VzRm9ybWF0dGluZyA9IHNjaGVtYXRpY1tpIC0gMl0udmFsdWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IEF4aXMoKS51bml2ZXJzYWwoc2NoZW1hdGljW2ldLnZhbHVlLCB0b2tlbnMsIGNvb3JBcnIsIHByZXZpb3VzRm9ybWF0dGluZywgKSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZihzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJub2RlXCIpe1xyXG4gICAgICAgICAgICAgICAgY29vckFyci5wdXNoKG5ldyBDb29yZGluYXRlKHtsYWJlbDogc2NoZW1hdGljW2ldLnZhbHVlLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZS1pbmxpbmVcIix7fSxzY2hlbWF0aWNbaV0uZm9ybWF0dGluZyksbW9kZTogXCJub2RlLWlubGluZVwifSkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2V7XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2goc2NoZW1hdGljW2ldLnZhbHVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY29vckFycjtcclxuICAgIH1cclxuXHJcbiAgICBnZXRTY2hlbWF0aWMoZHJhdzogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVnZXg9Z2V0UmVnZXgoKTtcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlc0FycmF5ID0gW107XHJcbiAgICAgICAgY29uc3Qgbm9kZVJlZ2V4ID0gcmVnRXhwKFN0cmluZy5yYXdgbm9kZVxccypcXFs/KCR7cmVnZXguZm9ybWF0dGluZ30qKVxcXT9cXHMqeygke3JlZ2V4LnRleHR9Kil9YCk7XHJcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ1JlZ2V4ID0gLygtLWN5Y2xlfGN5Y2xlfC0tXFwrXFwrfC0tXFwrfC0tfC1cXHx8XFx8LXxncmlkfGNpcmNsZXxyZWN0YW5nbGUpLztcclxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzXFwtLC46YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxyXG4gICAgICAgIGNvbnN0IGNvb3JkaW5hdGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoXFwoWyR7Y2F9XStcXCl8XFwoXFwkXFwoWyR7Y2F9XStcXClbJHtjYX0hOitcXC1dK1xcKFske2NhfV0rXFwpXFwkXFwpKWApO1xyXG4gICAgICAgIGxldCBpID0gMDtcclxuICAgICAgICBsZXQgbG9vcHMgPSAwO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHdoaWxlIChpIDwgZHJhdy5sZW5ndGggJiYgbG9vcHMgPCAxMDApIHsgLy8gSW5jcmVhc2UgbG9vcCBsaW1pdCBvciBhZGQgY29uZGl0aW9uIGJhc2VkIG9uIHBhcnNlZCBsZW5ndGhcclxuICAgICAgICAgICAgbG9vcHMrKztcclxuICAgICAgICAgICAgY29uc3QgY29vcmRpbmF0ZU1hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChjb29yZGluYXRlUmVnZXgpO1xyXG4gICAgICAgICAgICBcclxuXHJcbiAgICAgICAgICAgIGlmIChjb29yZGluYXRlTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImNvb3JkaW5hdGVcIiwgdmFsdWU6IGNvb3JkaW5hdGVNYXRjaFsxXSB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gY29vcmRpbmF0ZU1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgZm9ybWF0dGluZ01hdGNoID0gZHJhdy5zbGljZShpKS5tYXRjaChmb3JtYXR0aW5nUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAoZm9ybWF0dGluZ01hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgaSArPSBmb3JtYXR0aW5nTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJmb3JtYXR0aW5nXCIsIHZhbHVlOiBmb3JtYXR0aW5nTWF0Y2hbMF0gfSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG5vZGVNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2gobm9kZVJlZ2V4KTtcclxuICAgICAgICAgICAgaWYgKG5vZGVNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogXCJub2RlXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgZm9ybWF0dGluZzogbm9kZU1hdGNoWzFdIHx8IFwiXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG5vZGVNYXRjaFsyXVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBpICs9IG5vZGVNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGxvb3BzID09PSAxMDApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUGFyc2luZyBleGNlZWRlZCBzYWZlIGxvb3AgY291bnRcIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5O1xyXG4gICAgfVxyXG5cclxuICAgIGlzQ29vcmRpbmF0ZShvYmo6IGFueSk6IG9iaiBpcyBDb29yZGluYXRlIHtcclxuICAgICAgICByZXR1cm4gb2JqICYmIG9iaiBpbnN0YW5jZW9mIENvb3JkaW5hdGU7XHJcbiAgICB9XHJcbiAgICB0b1N0cmluZ0RyYXcoKXtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3ICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSBgO1xyXG4gICAgICAgIHRoaXMuY29vcmRpbmF0ZXMuZm9yRWFjaCgoY29vcmRpbmF0ZTogYW55LCBpbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSYmY29vcmRpbmF0ZS5tb2RlPT09XCJub2RlLWlubGluZVwiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IGNvb3JkaW5hdGUudG9TdHJpbmcoKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNhc2UgdHlwZW9mIGNvb3JkaW5hdGU9PT1cInN0cmluZ1wiOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0ICs9IC8oLS1cXCtcXCt8LS1cXCspLy50ZXN0KGNvb3JkaW5hdGUpP1wiLS1cIjpjb29yZGluYXRlO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZGVmYXVsdDoge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPWAoJHtjb29yZGluYXRlLnRvU3RyaW5nKCl9KWBcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gcmVzdWx0ICsgXCI7XCI7XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmdQaWMoKXtcclxuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3IHBpYyAke3RoaXMuZm9ybWF0dGluZy50b1N0cmluZygpfHwnJ30ge2FuZ2xlID0gJHsodGhpcy5jb29yZGluYXRlc1swXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1sxXSBhcyBBeGlzKS5uYW1lfS0tJHsodGhpcy5jb29yZGluYXRlc1syXSBhcyBBeGlzKS5uYW1lfX0gYDtcclxuICAgICBcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nKCkge1xyXG4gICAgICAgIGlmICh0aGlzLm1vZGU9PT0nZHJhdycpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nRHJhdygpO1xyXG4gICAgICAgIGlmKHRoaXMubW9kZT09PSdkcmF3LXBpYy1hbmcnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ1BpYygpXHJcbiAgICAgICAgXHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBGb3JtYXRUaWt6amF4IHtcclxuXHRzb3VyY2U6IHN0cmluZztcclxuICAgIHRva2VuczogQXJyYXk8VG9rZW4+PVtdO1xyXG4gICAgbWlkUG9pbnQ6IEF4aXM7XHJcblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xyXG4gICAgZGVidWdJbmZvID0gXCJcIjtcclxuICAgIFxyXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nfEFycmF5PFRva2VuPikge1xyXG4gICAgICAgIGlmKHR5cGVvZiBzb3VyY2U9PT1cInN0cmluZ1wiKXtcclxuXHRcdHRoaXMuc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xyXG4gICAgICAgIHRoaXMudG9rZW5pemUoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7dGhpcy50b2tlbnM9c291cmNlfVxyXG5cclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5zb3VyY2U7XHJcbiAgICAgICAgdGhpcy5maW5kTWlkcG9pbnQoKTtcclxuICAgICAgICB0aGlzLmFwcGx5UG9zdFByb2Nlc3NpbmcoKTtcclxuXHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPVwiXFxuXFxudGhpcy5taWRQb2ludDpcXG5cIitKU09OLnN0cmluZ2lmeSh0aGlzLm1pZFBvaW50LG51bGwsMSkrXCJcXG5cIlxyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz1KU09OLnN0cmluZ2lmeSh0aGlzLnRva2VucyxudWxsLDEpK1wiXFxuXFxuXCJcclxuXHJcbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlICs9IHRoaXMudG9TdHJpbmcoKTtcclxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5wcm9jZXNzZWRDb2RlO1xyXG5cdH1cclxuICAgIFxyXG4gICAgdGlkeVRpa3pTb3VyY2UodGlrelNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuICAgICAgICB0aWt6U291cmNlID0gdGlrelNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gdGlrelNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIik7O1xyXG4gICAgfVxyXG5cclxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcclxuICAgICAgICBjb25zdCBmbGF0QXhlcz1mbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgZmxhdEF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xyXG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMubWlkUG9pbnQpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcclxuICAgICAgICBmbGF0RHJhdy5mb3JFYWNoKChkcmF3OiBEcmF3KSA9PiB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgIFtpbmRleCwgY29vcl0gb2YgZHJhdy5jb29yZGluYXRlcy5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3IuZm9ybWF0dGluZz8uYWRkU3Bsb3BBbmRQb3NpdGlvbihkcmF3LmNvb3JkaW5hdGVzLGluZGV4KVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICB9XHJcbiAgICBnZXRDb2RlKCl7XHJcbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xyXG4gICAgfVxyXG4gICAgdG9rZW5pemUoKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxccy0sLjp8YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxyXG4gICAgICAgIGNvbnN0IGMgPSBTdHJpbmcucmF3YFskKF17MCwyfVske2NhfV0rWykkXXswLDJ9fFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXStcXChbJHtjYX1dK1xcKVxcJGA7XHJcbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHdpdGggZXNjYXBlZCBjaGFyYWN0ZXJzIGZvciBzcGVjaWZpYyBtYXRjaGluZ1xyXG4gICAgICAgIGNvbnN0IGNuID0gU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gOyAvLyBDb29yZGluYXRlIG5hbWVcclxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcXFwiP1xcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcIF5dKlxcJFxcXCI/fFtcXHdcXGRcXHNcXC0sLjooISlfXFwtXFwrXFxcXF5dKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcbiAgICAgICAgY29uc3QgZiA9IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOy4mKlxce1xcfSVcXC08Pl1gOyAvLyBGb3JtYXR0aW5nIHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgY29vclJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHBpY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxwaWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBzZSA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxccypcXCgqKCR7Y259KVxcKSpcXHMqYXRcXHMqXFwoKCR7Y30pXFwpXFxzKlxcWygke2Z9KilcXF1cXHMqXFx7KCR7dH0pXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHh5YXhpc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx4eWF4aXN7KCR7dH0pfXsoJHt0fSl9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgbWFzc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxtYXNzXFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KC1cXHx8XFx8fD4pezAsMX1cXH1cXHsoW1xcZC5dKilcXH1gLFwiZ1wiKTtcclxuICAgICAgICAvL1xccGlje2FuYzJ9e2FuYzF9e2FuYzB9ezc1XlxcY2lyYyB9e307XHJcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtjb29yUmVnZXgsIHNlLCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4LHBpY1JlZ2V4XTtcclxuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XHJcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcclxuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGEuaW5kZXggfHwgMCkgLSAoYi5pbmRleCB8fCAwKSk7XHJcblxyXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxyXG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbNV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzRdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFsyXX0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcImNvb3JkaW5hdGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcImNvb3JkaW5hdGVcIiwgZm9ybWF0dGluZyksLi4ucmVzdCx9KSk7XHJcblxyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHBpY1wiKSkge1xyXG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKVxyXG4gICAgICAgICAgICBjb25zdCBjMj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKVxyXG4gICAgICAgICAgICBjb25zdCBjMz1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFszXSx0aGlzKVxyXG5cclxuXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe21vZGU6IFwicGljLWFuZ1wiLHRva2VuczogdGhpcyxmb3JtYXR0aW5nU3RyaW5nOiBtYXRjaFs1XSxmb3JtYXR0aW5nT2JqOiB7cGljVGV4dDogbWF0Y2hbNF19LGRyYXdBcnI6IFtjMSxjMixjM119KSk7XHJcbiAgICAgICAgICB9ZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxkcmF3XCIpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcodW5kZWZpbmVkLG1hdGNoWzFdLG1hdGNoWzJdLCB0aGlzKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxceHlheGlzXCIpKSB7XHJcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaChkaXNzZWN0WFlheGlzKG1hdGNoKSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xyXG4gICAgICAgICAgICAvL3RoaXMudG9rZW5zLnB1c2goe3R5cGU6IFwiZ3JpZFwiLCByb3RhdGU6IG1hdGNoWzFdfSk7XHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbm9kZVwiKSkge1xyXG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFszXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119XHJcbiAgICAgICAgICAgIGlmIChtYXRjaFswXS5tYXRjaCgvXFxcXG5vZGVcXHMqXFwoLykpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbMl0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzFdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFs0XX0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IHsgZm9ybWF0dGluZyxvcmlnaW5hbCwgLi4ucmVzdCB9ID0gaTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZVwiLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG9yaWdpbmFsLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZVwiLCBmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjaXJjbGVcIikpIHsvKlxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHtcclxuICAgICAgICAgICAgICB0eXBlOiBcImNpcmNsZVwiLFxyXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdLFxyXG4gICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBbXHJcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzFdLCB0aGlzLnRva2VucyksXHJcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzJdLCB0aGlzLnRva2VucyksXHJcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzNdLCB0aGlzLnRva2VucyksXHJcbiAgICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAgfSk7Ki9cclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxtYXNzXCIpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZVwiLGxhYmVsOiBtYXRjaFsyXSxheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIix7dGlrenNldDogJ21hc3MnLGFuY2hvcjogbWF0Y2hbM10scm90YXRlOiBtYXRjaFs0XX0pfSkpXHJcblxyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHZlY1wiKSkge1xyXG4gICAgICAgICAgICBjb25zdCBhbmNlcj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsxXSx0aGlzKTtcclxuICAgICAgICAgICAgY29uc3QgYXhpczE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcyk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vZGU9bmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZS1pbmxpbmVcIixmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZygnbm9kZS1pbmxpbmUnLHtjb2xvcjogXCJyZWRcIn0pfSlcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBDb29yZGluYXRlKFwibm9kZS1pbmxpbmVcIik7XHJcbiAgICAgICAgICAgIGNvbnN0IHE9W2FuY2VyLCctLSsnLG5vZGUsYXhpczFdXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe2Zvcm1hdHRpbmdPYmo6IHt0aWt6c2V0OiAndmVjJ30sdG9rZW5zOiB0aGlzLGRyYXdBcnI6IHF9KSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAobWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICBjdXJyZW50SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKHRoaXMuc291cmNlLnNsaWNlKGN1cnJlbnRJbmRleCkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmaW5kTWlkcG9pbnQoKSB7XHJcbiAgICAgICAgY29uc3QgYXhlcyA9IGZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKVxyXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xyXG5cclxuICAgICAgICBheGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcclxuICAgICAgICAgIHN1bU9mWCArPSBheGlzLmNhcnRlc2lhblg7XHJcbiAgICAgICAgICBzdW1PZlkgKz0gYXhpcy5jYXJ0ZXNpYW5ZOyBcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgdGhpcy5taWRQb2ludD1uZXcgQXhpcygpO1xyXG4gICAgICAgIGNvbnN0IGxlbmd0aD1heGVzLmxlbmd0aCE9PTA/YXhlcy5sZW5ndGg6MVxyXG4gICAgICAgIHRoaXMubWlkUG9pbnQuYWRkQ2FydGVzaWFuKHN1bU9mWCAvIGxlbmd0aCxzdW1PZlkgLyBsZW5ndGgpXHJcbiAgICB9XHJcblxyXG4gICAgZmluZE9yaWdpbmFsVmFsdWUodmFsdWU6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcclxuICAgICAgICAgICAgKHRva2VuOiBUb2tlbikgPT5cclxuICAgICAgICAgICAgICAgICh0b2tlbiBpbnN0YW5jZW9mIENvb3JkaW5hdGUpICYmIHRva2VuLmNvb3JkaW5hdGVOYW1lID09PSB2YWx1ZVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgcmV0dXJuIG9nIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSA/IG9nLmNsb25lKCkgOiB1bmRlZmluZWQ7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xyXG4gICAgICAgIGNvbnN0IGV4dHJlbWVYWT1nZXRFeHRyZW1lWFkodGhpcy50b2tlbnMpO1xyXG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcclxuXHJcbiAgICAgICAgICAgIGlmKHRva2VuLnRvU3RyaW5nKCkpe1xyXG4gICAgICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9dG9rZW4udG9TdHJpbmcoKVxyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGNvZGVCbG9ja091dHB1dDtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZmxhdHRlbihkYXRhOiBhbnksIHJlc3VsdHM6IGFueVtdID0gW10sIHN0b3BDbGFzcz86IGFueSk6IGFueVtdIHtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XHJcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XHJcbiAgICAgICAgZmxhdHRlbihpdGVtLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhICE9PSBudWxsKSB7XHJcbiAgICAgIC8vIElmIHRoZSBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgdGhlIHN0b3BDbGFzcywgYWRkIGl0IHRvIHJlc3VsdHMgYW5kIHN0b3AgZmxhdHRlbmluZ1xyXG4gICAgICBpZiAoc3RvcENsYXNzICYmIGRhdGEgaW5zdGFuY2VvZiBzdG9wQ2xhc3MpIHtcclxuICAgICAgICByZXN1bHRzLnB1c2goZGF0YSk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgLy8gQWRkIHRoZSBjdXJyZW50IG9iamVjdCB0byByZXN1bHRzXHJcbiAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcclxuICBcclxuICAgICAgLy8gUmVjdXJzaXZlbHkgZmxhdHRlbiBwcm9wZXJ0aWVzIG9mIHRoZSBvYmplY3RcclxuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xyXG4gICAgICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgIGZsYXR0ZW4oZGF0YVtrZXldLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgfVxyXG4gIFxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBkaXNzZWN0WFlheGlzKG1hdGNoOiBSZWdFeHBNYXRjaEFycmF5KSB7XHJcbiAgICBsZXQgWG5vZGU6UmVnRXhwTWF0Y2hBcnJheXxzdHJpbmc9XCJcIiwgWW5vZGU6UmVnRXhwTWF0Y2hBcnJheXxzdHJpbmc9XCJcIjtcclxuXHJcbiAgICBpZiAobWF0Y2hbMV0gJiYgbWF0Y2hbMl0pIHtcclxuICAgICAgICBYbm9kZSA9IG1hdGNoWzFdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XHJcbiAgICAgICAgWW5vZGUgPSBtYXRjaFsyXS5tYXRjaCgvWydgXCJdKFtcXHdcXGQmJF0rKVsnYFwiXS8pfHxcIlwiO1xyXG4gICAgICAgIFhub2RlPVhub2RlWzBdLnN1YnN0cmluZygxLFhub2RlLmxlbmd0aClcclxuICAgICAgICBZbm9kZT1Zbm9kZVswXS5zdWJzdHJpbmcoMSxZbm9kZS5sZW5ndGgpXHJcbiAgICB9XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHlwZTogXCJ4eWF4aXNcIixcclxuICAgICAgICBYZm9ybWF0dGluZzogbWF0Y2hbMV0/LnJlcGxhY2UoLygtPnw8LXxbJ2BcIl0uKj9bJ2BcIl0pL2csIFwiXCIpLFxyXG4gICAgICAgIFlmb3JtYXR0aW5nOiBtYXRjaFsyXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICAgICAgeERpcmVjdGlvbjogbWF0Y2hbMV0gJiYgLy0+Ly50ZXN0KG1hdGNoWzFdKSA/IFwibGVmdFwiIDogXCJyaWdodFwiLFxyXG4gICAgICAgIHlEaXJlY3Rpb246IG1hdGNoWzJdICYmIC8tPi8udGVzdChtYXRjaFsyXSkgPyBcImRvd25cIiA6IFwidXBcIixcclxuICAgICAgICBYbm9kZTogWG5vZGUsXHJcbiAgICAgICAgWW5vZGU6IFlub2RlLFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0RXh0cmVtZVhZKHRva2VuczogYW55KSB7XHJcbmxldCBtYXhYID0gLUluZmluaXR5O1xyXG5sZXQgbWF4WSA9IC1JbmZpbml0eTtcclxubGV0IG1pblggPSBJbmZpbml0eTtcclxubGV0IG1pblkgPSBJbmZpbml0eTtcclxuXHJcbnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcclxuICAgIGlmICh0b2tlbi5YID4gbWF4WCkgbWF4WCA9IHRva2VuLlg7XHJcbiAgICBpZiAodG9rZW4uWCA8IG1pblgpIG1pblggPSB0b2tlbi5YO1xyXG5cclxuICAgIGlmICh0b2tlbi5ZID4gbWF4WSkgbWF4WSA9IHRva2VuLlk7XHJcbiAgICBpZiAodG9rZW4uWSA8IG1pblkpIG1pblkgPSB0b2tlbi5ZO1xyXG4gICAgfVxyXG59KTtcclxuXHJcbnJldHVybiB7XHJcbiAgICBtYXhYLG1heFksbWluWCxtaW5ZLFxyXG59O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG4vKlxyXG5mdW5jdGlvbiBnZW5lcmF0ZUZvcm1hdHRpbmcoY29vcmRpbmF0ZTogQ29vcmRpbmF0ZSl7XHJcbiAgICBpZiAodHlwZW9mIGNvb3JkaW5hdGUubGFiZWwgIT09IFwic3RyaW5nXCIpeyByZXR1cm4gXCJcIjsgfVxyXG4gICAgY29uc3QgZm9ybWF0dGluZyA9IGNvb3JkaW5hdGUuZm9ybWF0dGluZz8uc3BsaXQoXCIsXCIpIHx8IFtdO1xyXG4gICAgaWYgKGZvcm1hdHRpbmcuc29tZSgodmFsdWU6IHN0cmluZykgPT4gLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8udGVzdCh2YWx1ZSkpKSB7XHJcbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGUuZm9ybWF0dGluZztcclxuICAgIH1cclxuICAgIGlmKGZvcm1hdHRpbmcubGVuZ3RoPjAmJiFmb3JtYXR0aW5nW2Zvcm1hdHRpbmcubGVuZ3RoLTFdLmVuZHNXaXRoKFwiLFwiKSl7Zm9ybWF0dGluZy5wdXNoKFwiLFwiKX1cclxuICAgIHN3aXRjaChjb29yZGluYXRlLnF1YWRyYW50KXtcclxuICAgICAgICBjYXNlIDE6XHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgcmlnaHQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDI6XHJcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgbGVmdCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMzpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyBsZWZ0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSA0OiBcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyByaWdodCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZvcm1hdHRpbmcuam9pbihcIlwiKTtcclxufVxyXG4qL1xyXG5cclxuXHJcbmZ1bmN0aW9uIGdldFByZWFtYmxlKCk6c3RyaW5ne1xyXG4gICAgY29uc3QgYW5nPVwiXFxcXHRpa3pzZXR7YW5nLy5zdHlsZSAyIGFyZ3M9e2ZpbGw9YmxhY2shNTAsb3BhY2l0eT0wLjUsdGV4dCBvcGFjaXR5PTAuOSxkcmF3PW9yYW5nZSw8LT4sYW5nbGUgZWNjZW50cmljaXR5PSMxLGFuZ2xlIHJhZGl1cz0jMmNtLHRleHQ9b3JhbmdlLGZvbnQ9XFxcXGxhcmdlfSxhbmcvLmRlZmF1bHQ9ezEuNn17MC41fX1cIlxyXG4gIFxyXG4gICAgY29uc3QgbWFyaz1cIlxcXFxkZWZcXFxcbWFyayMxIzIjM3tcXFxccGF0aCBbZGVjb3JhdGlvbj17bWFya2luZ3MsIG1hcms9YXQgcG9zaXRpb24gMC41IHdpdGgge1xcXFxmb3JlYWNoIFxcXFx4IGluIHsjMX0geyBcXFxcZHJhd1tsaW5lIHdpZHRoPTFwdF0gKFxcXFx4LC0zcHQpIC0tIChcXFxceCwzcHQpOyB9fX0sIHBvc3RhY3Rpb249ZGVjb3JhdGVdICgjMikgLS0gKCMzKTt9XCJcclxuICBcclxuICAgIGNvbnN0IGFycj1cIlxcXFxuZXdjb21tYW5ke1xcXFxhcnJ9Wzhde1xcXFxjb29yZGluYXRlICgyKSBhdCAoJCgjMikhIzchKCMzKSQpO1xcXFxjb29yZGluYXRlICgxKSBhdCAoJCgyKSEjNW1tITkwOigjMykkKTtcXFxcY29vcmRpbmF0ZSAoMykgYXQgKCQoMikhIzVtbSsjNGNtISM4OigjMykkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0xcHQsPC1dICgxKS0tKDMpbm9kZSBbcG9zPSM2XSB7XFxcXGxhcmdlICMxfTt9XCIgXHJcbiAgICBjb25zdCBsZW5lPVwiXFxcXGRlZlxcXFxjb3IjMSMyIzMjNCM1e1xcXFxjb29yZGluYXRlICgjMSkgYXQoJCgjMikhIzMhIzQ6KCM1KSQpO31cXFxcZGVmXFxcXGRyIzEjMntcXFxcZHJhdyBbbGluZSB3aWR0aD0jMSxdIzI7fVxcXFxuZXdjb21tYW5ke1xcXFxsZW59WzZde1xcXFxjb3J7MX17IzJ9eyMzfXs5MH17IzR9XFxcXGNvcnszfXsjNH17IzN9ey05MH17IzJ9XFxcXG5vZGUgKDIpIGF0ICgkKDEpITAuNSEoMykkKSBbcm90YXRlPSM2XXtcXFxcbGFyZ2UgIzF9O1xcXFxkcnsjNXB0LHw8LX17KDEpLS0oMil9XFxcXGRyeyM1cHQsLT58fXsoMiktLSgzKX19XCJcclxuICAgIGNvbnN0IHNwcmluZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxzcHJpbmd9WzRde1xcXFx0aWt6bWF0aHtjb29yZGluYXRlIFxcXFxzdGFydCwgXFxcXGRvbmU7XFxcXHN0YXJ0ID0gKCMxKTtcXFxcZG9uZSA9ICgjMik7fVxcXFxkcmF3W3RoaWNrXSAoJChcXFxcc3RhcnQpICsgKC0xLjUsMCkkKSAtLSsrKDMsMCk7XFxcXGRyYXcgKFxcXFxzdGFydCkgLS0rICgwLC0wLjI1Y20pO1xcXFxkcmF3ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4KzBjbSxcXFxcZG9uZXkrMC4yNWNtKSQpLS0rKDAsLTAuMjUpO1xcXFxkcmF3W2RlY29yYXRpb249e2FzcGVjdD0wLjMsIHNlZ21lbnQgbGVuZ3RoPTMsIGFtcGxpdHVkZT0ybW0sY29pbCx9LGRlY29yYXRlXSAoXFxcXHN0YXJ0eCxcXFxcc3RhcnR5LTAuMjVjbSkgLS0oJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkrMC4yNWNtKSQpbm9kZVttaWR3YXkscmlnaHQ9MC4yNWNtLGJsYWNrXXsjNH07XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSkkKXsjM307fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHRyZWU9XCJcXFxcbmV3Y29tbWFuZHtcXFxcbGVudX1bM117XFxcXHRpa3pzZXR7bGV2ZWwgZGlzdGFuY2U9MjBtbSxsZXZlbCAjMS8uc3R5bGU9e3NpYmxpbmcgZGlzdGFuY2U9IzJtbSwgbm9kZXM9e2ZpbGw9cmVkISMzLGNpcmNsZSxpbm5lciBzZXA9MXB0LGRyYXc9bm9uZSx0ZXh0PWJsYWNrLH19fX1cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0YWJsZT1cIlxcXFx0aWt6c2V0eyB0YWJsZS8uc3R5bGU9e21hdHJpeCBvZiBub2Rlcyxyb3cgc2VwPS1cXFxccGdmbGluZXdpZHRoLGNvbHVtbiBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsbm9kZXM9e3JlY3RhbmdsZSxkcmF3PWJsYWNrLGFsaWduPWNlbnRlcn0sbWluaW11bSBoZWlnaHQ9MS41ZW0sdGV4dCBkZXB0aD0wLjVleCx0ZXh0IGhlaWdodD0yZXgsbm9kZXMgaW4gZW1wdHkgY2VsbHMsZXZlcnkgZXZlbiByb3cvLnN0eWxlPXtub2Rlcz17ZmlsbD1ncmF5ITYwLHRleHQ9YmxhY2ssfX0sY29sdW1uIDEvLnN0eWxlPXtub2Rlcz17dGV4dCB3aWR0aD01ZW0sZm9udD1cXFxcYmZzZXJpZXN9fSxyb3cgMS8uc3R5bGU9e25vZGVzPXtmb250PVxcXFxiZnNlcmllc319fX1cIlxyXG4gICAgY29uc3QgY29vcj1cIlxcXFxkZWZcXFxcY29vciMxIzIjMyM0e1xcXFxjb29yZGluYXRlIFtsYWJlbD17WyM0XTpcXFxcTGFyZ2UgIzN9XSAoIzIpIGF0ICgkKCMxKSQpO31cIlxyXG4gICAgLy9jb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxyXG4gICAgY29uc3QgZHZlY3Rvcj1cIlxcXFxuZXdjb21tYW5ke1xcXFxkdmVjdG9yfVsyXXtcXFxcY29vcmRpbmF0ZSAodGVtcDEpIGF0ICgkKDAsMCAtfCAjMSkkKTtcXFxcY29vcmRpbmF0ZSAodGVtcDIpIGF0ICgkKDAsMCB8LSAjMSkkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0wLjdwdCwjMl0gKCMxKS0tKHRlbXAxKSgjMSktLSh0ZW1wMik7fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxyXG4gICAgY29uc3QgcHJlYW1ibGU9XCJcXFxcdXNlcGFja2FnZXtwZ2ZwbG90cyxpZnRoZW59XFxcXHVzZXRpa3psaWJyYXJ5e2Fycm93cy5tZXRhLGFuZ2xlcyxxdW90ZXMscG9zaXRpb25pbmcsIGNhbGMsIGludGVyc2VjdGlvbnMsZGVjb3JhdGlvbnMubWFya2luZ3MsbWF0aCxzcHksbWF0cml4LHBhdHRlcm5zLHNuYWtlcyxkZWNvcmF0aW9ucy5wYXRocmVwbGFjaW5nLGRlY29yYXRpb25zLnBhdGhtb3JwaGluZyxwYXR0ZXJucyxzaGFkb3dzLHNoYXBlcy5zeW1ib2xzfVwiXHJcbiAgICByZXR1cm4gcHJlYW1ibGUrYW5nK21hcmsrYXJyK2xlbmUrc3ByaW5nK3RyZWUrdGFibGUrY29vcitkdmVjdG9yK3BpY0FuZytcIlxcXFxwZ2ZwbG90c3NldHtjb21wYXQ9MS4xNn1cXFxcYmVnaW57ZG9jdW1lbnR9XFxcXGJlZ2lue3Rpa3pwaWN0dXJlfVwiXHJcbn0iXX0=