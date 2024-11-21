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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGlrempheC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy90aWt6amF4L3Rpa3pqYXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFPLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQzdDLGFBQWE7QUFDYixPQUFPLFNBQVMsTUFBTSxxQkFBcUIsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsU0FBUyxFQUFFLGdCQUFnQixFQUFFLFFBQVEsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUlqRCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsYUFBYSxFQUFFLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxFQUFFO2dCQUM3RSxJQUFJLENBQUMsV0FBVyxDQUFDLE1B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RSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFBO2dCQUN4RixJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUM7b0JBQzlCLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFDLEVBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUMsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUM7aUJBQ3ZHO2dCQUNELE1BQU0sRUFBRSxVQUFVLEVBQUMsUUFBUSxFQUFFLEdBQUcsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUUzQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxFQUFDLElBQUksRUFBRSxNQUFNLEVBQUMsSUFBSSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBQyxJQUFJLENBQUMsRUFBQyxVQUFVLEVBQUUsSUFBSSxVQUFVLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxFQUFDLEdBQUcsSUFBSSxHQUFFLENBQUMsQ0FBQyxDQUFDO2FBQ3BKO2lCQUFNLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFDOzs7Ozs7Ozs7bUJBU3RDO2FBQ047aUJBQU0sSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUN4QyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxFQUFDLElBQUksRUFBRSxNQUFNLEVBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBQyxJQUFJLEVBQUUsSUFBSSxJQUFJ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Ozs7Ozs7Ozs7Ozs7Ozs7O0VBd0JFO0FBR0YsU0FBUyxXQUFXO0lBQ2hCLE1BQU0sR0FBRyxHQUFDLG9MQUFvTCxDQUFBO0lBRTlMLE1BQU0sSUFBSSxHQUFDLDZMQUE2TCxDQUFBO0lBRXhNLE1BQU0sR0FBRyxHQUFDLG9OQUFvTixDQUFBO0lBQzlOLE1BQU0sSUFBSSxHQUFDLHdSQUF3UixDQUFBO0lBQ25TLE1BQU0sTUFBTSxHQUFDLDBnQkFBMGdCLENBQUE7SUFFdmhCLE1BQU0sSUFBSSxHQUFDLGlLQUFpSyxDQUFBO0lBRTVLLE1BQU0sS0FBSyxHQUFDLDZXQUE2VyxDQUFBO0lBQ3pYLE1BQU0sSUFBSSxHQUFDLCtFQUErRSxDQUFBO0lBQzFGLGlHQUFpRztJQUNqRyxNQUFNLE9BQU8sR0FBQyxzS0FBc0ssQ0FBQTtJQUVwTCxNQUFNLE1BQU0sR0FBQyw4dkJBQTh2QixDQUFBO0lBQzN3QixNQUFNLFFBQVEsR0FBQyxtUEFBbVAsQ0FBQTtJQUNsUSxPQUFPLFFBQVEsR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsTUFBTSxHQUFDLElBQUksR0FBQyxLQUFLLEdBQUMsSUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsaUVBQWlFLENBQUE7QUFDN0ksQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFwcCwgTWFya2Rvd25WaWV3LCBXb3Jrc3BhY2VXaW5kb3cgfSBmcm9tIFwib2JzaWRpYW5cIjtcbmltcG9ydCBNYXRoUGx1Z2luIGZyb20gXCJzcmMvbWFpblwiO1xuaW1wb3J0IHsgb3B0aW1pemUgfSBmcm9tIFwiLi9zdmdvLmJyb3dzZXIuanNcIjtcbi8vIEB0cy1pZ25vcmVcbmltcG9ydCB0aWt6amF4SnMgZnJvbSBcImlubGluZTouL3Rpa3pqYXguanNcIjtcbmltcG9ydCB7IGNhcnRlc2lhblRvUG9sYXIsIGZpbmRJbnRlcnNlY3Rpb25Qb2ludCwgZmluZFNsb3BlLCBwb2xhclRvQ2FydGVzaWFuLCB0b051bWJlciB9IGZyb20gXCJzcmMvbWF0aFV0aWxpdGllcy5qc1wiO1xuaW1wb3J0IHsgRGVidWdNb2RhbCB9IGZyb20gXCJzcmMvZGVzcGx5TW9kYWxzLmpzXCI7XG5cblxuXG5leHBvcnQgY2xhc3MgVGlrempheCB7XG4gICAgYXBwOiBBcHA7XG4gICAgcGx1Z2luOiBNYXRoUGx1Z2luO1xuICAgIGFjdGl2ZVZpZXc6IE1hcmtkb3duVmlldyB8IG51bGw7XG5cbiAgICBjb25zdHJ1Y3RvcihhcHA6IEFwcCxwbHVnaW46IE1hdGhQbHVnaW4pIHtcbiAgICAgIHRoaXMuYXBwPWFwcDtcbiAgICAgIHRoaXMuYWN0aXZlVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XG4gICAgICB0aGlzLnBsdWdpbj1wbHVnaW47XG4gICAgfVxuICAgIFxuICAgIHJlYWR5TGF5b3V0KCl7XG4gICAgICB0aGlzLnBsdWdpbi5hcHAud29ya3NwYWNlLm9uTGF5b3V0UmVhZHkoKCkgPT4ge1xuICAgICAgICB0aGlzLmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xuICAgICAgICB0aGlzLnBsdWdpbi5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLndvcmtzcGFjZS5vbihcIndpbmRvdy1vcGVuXCIsICh3aW4sIHdpbmRvdykgPT4ge1xuICAgICAgICAgIHRoaXMubG9hZFRpa1pKYXgod2luZG93LmRvY3VtZW50KTtcbiAgICAgICAgfSkpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIFxuICBcbiAgICBsb2FkVGlrWkpheChkb2M6IERvY3VtZW50KSB7XG4gICAgICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xuICAgICAgICBzLmlkID0gXCJ0aWt6amF4XCI7XG4gICAgICAgIHMudHlwZSA9IFwidGV4dC9qYXZhc2NyaXB0XCI7XG4gICAgICAgIHMuaW5uZXJUZXh0ID0gdGlrempheEpzO1xuICAgICAgICBkb2MuYm9keS5hcHBlbmRDaGlsZChzKTtcbiAgICAgICAgZG9jLmFkZEV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XG4gICAgfVxuICBcbiAgICB1bmxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcbiAgICAgICAgY29uc3QgcyA9IGRvYy5nZXRFbGVtZW50QnlJZChcInRpa3pqYXhcIik7XG4gICAgICAgIHM/LnJlbW92ZSgpO1xuXG4gICAgICAgIGRvYy5yZW1vdmVFdmVudExpc3RlbmVyKFwidGlrempheC1sb2FkLWZpbmlzaGVkXCIsIHRoaXMucG9zdFByb2Nlc3NTdmcpO1xuICAgIH1cbiAgXG4gICAgbG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xuICAgICAgICBmb3IgKGNvbnN0IHdpbmRvdyBvZiB0aGlzLmdldEFsbFdpbmRvd3MoKSkge1xuICAgICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuICBcbiAgICB1bmxvYWRUaWtaSmF4QWxsV2luZG93cygpIHtcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcbiAgICAgICAgICAgIHRoaXMudW5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuICBcbiAgICBnZXRBbGxXaW5kb3dzKCkge1xuICAgICAgICBjb25zdCB3aW5kb3dzID0gW107XG4gICAgICAgIFxuICAgICAgICAvLyBwdXNoIHRoZSBtYWluIHdpbmRvdydzIHJvb3Qgc3BsaXQgdG8gdGhlIGxpc3RcbiAgICAgICAgd2luZG93cy5wdXNoKHRoaXMuYXBwLndvcmtzcGFjZS5yb290U3BsaXQud2luKTtcbiAgICAgICAgXG4gICAgICAgIC8vIEB0cy1pZ25vcmUgZmxvYXRpbmdTcGxpdCBpcyB1bmRvY3VtZW50ZWRcbiAgICAgICAgY29uc3QgZmxvYXRpbmdTcGxpdCA9IHRoaXMuYXBwLndvcmtzcGFjZS5mbG9hdGluZ1NwbGl0O1xuICAgICAgICBmbG9hdGluZ1NwbGl0LmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IHtcbiAgICAgICAgICAgIC8vIGlmIHRoaXMgaXMgYSB3aW5kb3csIHB1c2ggaXQgdG8gdGhlIGxpc3QgXG4gICAgICAgICAgICBpZiAoY2hpbGQgaW5zdGFuY2VvZiBXb3Jrc3BhY2VXaW5kb3cpIHtcbiAgICAgICAgICAgICAgICB3aW5kb3dzLnB1c2goY2hpbGQud2luKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHdpbmRvd3M7XG4gICAgfVxuICBcbiAgXG4gICAgcmVnaXN0ZXJUaWt6Q29kZUJsb2NrKCkge1xuICAgICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGljb24gPSBPYmplY3QuYXNzaWduKGVsLmNyZWF0ZUVsKFwiZGl2XCIpLCB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBcIm1hdGgtZGVidWctaWNvblwiLFxuICAgICAgICAgICAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwidHlwZVwiLCBcInRleHQvdGlrelwiKTtcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJkYXRhLXNob3ctY29uc29sZVwiLCBcInRydWVcIik7XG4gICAgICAgICAgICBjb25zdCB0aWt6amF4PW5ldyBGb3JtYXRUaWt6amF4KHNvdXJjZSk7XG4gICAgICAgICAgICBpY29uLm9uY2xpY2sgPSAoKSA9PiBuZXcgRGVidWdNb2RhbCh0aGlzLmFwcCx0aWt6amF4LmRlYnVnSW5mbykub3BlbigpO1xuICAgICAgICAgICAgc2NyaXB0LnNldFRleHQodGlrempheC5nZXRDb2RlKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2goZSl7XG4gICAgICAgICAgICAgICAgZWwuaW5uZXJIVE1MID0gXCJcIjtcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvckRpc3BsYXkgPSBlbC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJtYXRoLWVycm9yLWxpbmVcIiB9KTtcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuaW5uZXJUZXh0ID0gYEVycm9yOiAke2UubWVzc2FnZX1gO1xuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5jbGFzc0xpc3QuYWRkKFwiZXJyb3ItdGV4dFwiKTtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiVGlrWiBQcm9jZXNzaW5nIEVycm9yOlwiLCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgXG4gICAgICBhZGRTeW50YXhIaWdobGlnaHRpbmcoKSB7XG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLnB1c2goe25hbWU6IFwiVGlrelwiLCBtaW1lOiBcInRleHQveC1sYXRleFwiLCBtb2RlOiBcInN0ZXhcIn0pO1xuICAgICAgfVxuICBcbiAgICAgIHJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpIHtcbiAgICAgICAgICAvLyBAdHMtaWdub3JlXG4gICAgICAgICAgd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8gPSB3aW5kb3cuQ29kZU1pcnJvci5tb2RlSW5mby5maWx0ZXIoZWwgPT4gZWwubmFtZSAhPSBcIlRpa3pcIik7XG4gICAgICB9XG5cbiAgXG4gICAgICBjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcbiAgICAgICAgc3ZnID0gc3ZnLnJlcGxhY2VBbGwoLyhcIiMwMDBcInxcImJsYWNrXCIpL2csIFwiXFxcImN1cnJlbnRDb2xvclxcXCJcIilcbiAgICAgICAgICAgICAgICAucmVwbGFjZUFsbCgvKFwiI2ZmZlwifFwid2hpdGVcIikvZywgXCJcXFwidmFyKC0tYmFja2dyb3VuZC1wcmltYXJ5KVxcXCJcIik7XG4gICAgICAgIHJldHVybiBzdmc7XG4gICAgICB9XG4gIFxuICBcbiAgICAgIG9wdGltaXplU1ZHKHN2Zzogc3RyaW5nKSB7XG4gICAgICAgICAgcmV0dXJuIG9wdGltaXplKHN2Zywge3BsdWdpbnM6XG4gICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICBuYW1lOiBcInByZXNldC1kZWZhdWx0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJyaWRlczoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xlYW51cElEczogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgXVxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcbiAgICAgICAgICB9KT8uZGF0YTtcbiAgICAgIH1cbiAgXG4gIFxuICAgICAgcG9zdFByb2Nlc3NTdmcgPSAoZTogRXZlbnQpID0+IHtcbiAgXG4gICAgICAgICAgY29uc3Qgc3ZnRWwgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgICBsZXQgc3ZnID0gc3ZnRWwub3V0ZXJIVE1MO1xuICBcbiAgICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MuaW52ZXJ0Q29sb3JzSW5EYXJrTW9kZSkge1xuICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcbiAgICAgICAgICB9XG4gIFxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcbiAgXG4gICAgICAgICAgc3ZnRWwub3V0ZXJIVE1MID0gc3ZnO1xuICAgICAgfVxufVxuXG5mdW5jdGlvbiByZWdFeHAocGF0dGVybjogc3RyaW5nIHwgUmVnRXhwLCBmbGFnczogc3RyaW5nID0gJycpOiBSZWdFeHAge1xuICAgIHBhdHRlcm49cGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cD9wYXR0ZXJuLnNvdXJjZTpwYXR0ZXJuO1xuICAgIHJldHVybiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgJHtwYXR0ZXJufWAsIGZsYWdzP2ZsYWdzOicnKTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVnZXgoKXtcbiAgICBjb25zdCBiYXNpYyA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjpdYDtcbiAgICByZXR1cm4ge1xuICAgICAgICBiYXNpYzogYmFzaWMsXG4gICAgICAgIG1lcmdlOiBTdHJpbmcucmF3YC1cXHx8XFx8LXwhW1xcZC5dKyF8XFwrfC1gLFxuICAgICAgICAvL2Nvb3JkaW5hdGU6IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2AoJHtiYXNpY30rfDEpYCksXG4gICAgICAgIGNvb3JkaW5hdGVOYW1lOiBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWAsXG4gICAgICAgIHRleHQ6IFN0cmluZy5yYXdgW1xcd1xccy0sLjokKCEpXytcXFxce309XWAsXG4gICAgICAgIGZvcm1hdHRpbmc6IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOyYqe30lLTw+XWBcbiAgICB9O1xufVxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuXG5pbnRlcmZhY2UgdG9rZW4gIHtcbiAgICBYPzogbnVtYmVyO1xuICAgIFk/OiBudW1iZXI7XG4gICAgdHlwZT86IHN0cmluZztcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcbiAgICBjb29yZGluYXRlcz86IGFueTtcbn1cblxuXG5cblxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IG51bWJlclZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcbn07XG5cblxuZnVuY3Rpb24gZmluZEJlZm9yZUFmdGVyQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPiwgaW5kZXg6IG51bWJlcik6IHsgYmVmb3JlOiBudW1iZXIsIGFmdGVyOiBudW1iZXIgfSB7XG4gICAgXG4gICAgbGV0IGJlZm9yZUluZGV4ID0gYXhlcy5zbGljZSgwLCBpbmRleCkuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XG4gICAgbGV0IGFmdGVySW5kZXggPSBheGVzLnNsaWNlKGluZGV4ICsgMSkuZmluZEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcblxuICAgIC8vIEFkanVzdCBgYWZ0ZXJJbmRleGAgc2luY2Ugd2Ugc2xpY2VkIGZyb20gYGluZGV4ICsgMWBcbiAgICBpZiAoYWZ0ZXJJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgYWZ0ZXJJbmRleCArPSBpbmRleCArIDE7XG4gICAgfVxuXG4gICAgLy8gV3JhcCBhcm91bmQgaWYgbm90IGZvdW5kXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSkge1xuICAgICAgICBiZWZvcmVJbmRleCA9IGF4ZXMuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XG4gICAgfVxuXG4gICAgaWYgKGFmdGVySW5kZXggPT09IC0xKSB7XG4gICAgICAgIGFmdGVySW5kZXggPSBheGVzLmZpbmRJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XG4gICAgfVxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gLTEgfHwgYWZ0ZXJJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZmluZCB2YWxpZCBBeGlzIG9iamVjdHMuXCIpO1xuICAgIH1cbiAgICBpZiAoYmVmb3JlSW5kZXggPT09IGFmdGVySW5kZXgpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUHJhaXNlZCBheGlzIGFzIHNhbWUgdG9rZW5cIik7XG4gICAgfVxuICAgIHJldHVybiB7IGJlZm9yZTogYmVmb3JlSW5kZXgsIGFmdGVyOiBhZnRlckluZGV4IH07XG59XG5cblxuZXhwb3J0IGNsYXNzIEF4aXMge1xuICAgIGNhcnRlc2lhblg6IG51bWJlcjtcbiAgICBjYXJ0ZXNpYW5ZOiBudW1iZXI7XG4gICAgcG9sYXJBbmdsZTogbnVtYmVyO1xuICAgIHBvbGFyTGVuZ3RoOiBudW1iZXI7XG4gICAgbmFtZT86IHN0cmluZztcbiAgICBxdWFkcmFudD86IG51bWJlcjtcblxuICAgIGNvbnN0cnVjdG9yKGNhcnRlc2lhblg/OiBudW1iZXIsIGNhcnRlc2lhblk/OiBudW1iZXIsIHBvbGFyTGVuZ3RoPzogbnVtYmVyLCBwb2xhckFuZ2xlPzogbnVtYmVyLG5hbWU/OiBzdHJpbmcpIHtcbiAgICAgICAgaWYgKGNhcnRlc2lhblggIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5YID0gY2FydGVzaWFuWDtcbiAgICAgICAgaWYgKGNhcnRlc2lhblkgIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5ZID0gY2FydGVzaWFuWTtcbiAgICAgICAgaWYgKHBvbGFyTGVuZ3RoICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJMZW5ndGggPSBwb2xhckxlbmd0aDtcbiAgICAgICAgaWYgKHBvbGFyQW5nbGUgIT09IHVuZGVmaW5lZCkgdGhpcy5wb2xhckFuZ2xlID0gcG9sYXJBbmdsZTtcbiAgICAgICAgdGhpcy5uYW1lPW5hbWVcbiAgICB9XG5cbiAgICBjbG9uZSgpOiBBeGlzIHtcbiAgICAgICAgcmV0dXJuIG5ldyBBeGlzKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZLHRoaXMucG9sYXJMZW5ndGgsdGhpcy5wb2xhckFuZ2xlLHRoaXMubmFtZSk7XG4gICAgfVxuXG4gICAgdW5pdmVyc2FsKGNvb3JkaW5hdGU6IHN0cmluZywgdG9rZW5zPzogRm9ybWF0VGlrempheCxhbmNob3JBcnI/OiBhbnksYW5jaG9yPzogc3RyaW5nKTogQXhpcyB7XG4gICAgICAgIGNvbnN0IG1hdGNoZXM9dGhpcy5nZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlKTtcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZUFycjogQXJyYXk8QXhpc3xzdHJpbmc+ID0gW107XG4gICAgICAgIG1hdGNoZXMuZm9yRWFjaCgobWF0Y2g6IGFueSxpbmRleDogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICBtYXRjaD1tYXRjaC5mdWxsTWF0Y2g7XG4gICAgICAgICAgICBsZXQgYXhpczogQXhpc3x1bmRlZmluZWQ7XG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIC8sLy50ZXN0KG1hdGNoKTpcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkQ2FydGVzaWFuKG1hdGNoKTtcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlIC86Ly50ZXN0KG1hdGNoKTpcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkUG9sYXIobWF0Y2gpO1xuICAgICAgICAgICAgICAgICAgICBheGlzLnBvbGFyVG9DYXJ0ZXNpYW4oKVxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2goYXhpcyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgLyFbXFxkLl0rIS8udGVzdChtYXRjaCk6XG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChtYXRjaCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgKC9bXFxkXFx3XSsvKS50ZXN0KG1hdGNoKTpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VucylcbiAgICAgICAgICAgICAgICAgICAgICAgIGF4aXMgPSB0b2tlbnMuZmluZE9yaWdpbmFsVmFsdWUobWF0Y2gpPy5heGlzO1xuICAgICAgICAgICAgICAgICAgICBlbHNlIHRocm93IG5ldyBFcnJvcihgVHJpZWQgdG8gZmluZCBvcmlnaW5hbCBjb29yZGluYXRlIHZhbHVlIHdoaWxlIG5vdCBiZWluZyBwcm92aWRlZCB3aXRoIHRva2Vuc2ApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoYXhpcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgdGhlIGNvb3JkaW5hdGUgJHttYXRjaH0gZnJvbSAke2Nvb3JkaW5hdGV9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgYXhpcy5uYW1lPW1hdGNoXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMubWVyZ2VBeGlzKGNvb3JkaW5hdGVBcnIpXG5cbiAgICAgICAgaWYoYW5jaG9yQXJyJiZhbmNob3ImJmFuY2hvci5tYXRjaCgvKC0tXFwrfC0tXFwrXFwrKS8pKXtcbiAgICAgICAgICAgIGxldCBhOiBBeGlzXG4gICAgICAgICAgICBpZiAoYW5jaG9yLm1hdGNoKC8oLS1cXCspLykpe1xuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmQoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcbiAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgIGE9YW5jaG9yQXJyLmZpbmRMYXN0KChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYSxcImFkZGl0aW9uXCIpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgbWVyZ2VBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+KSB7XG4gICAgICAgIGlmICghYXhlcy5zb21lKChheGlzOiBhbnkpID0+IHR5cGVvZiBheGlzID09PSBcInN0cmluZ1wiKSkge1xuICAgICAgICAgICAgT2JqZWN0LmFzc2lnbih0aGlzLCAoYXhlc1swXSBhcyBBeGlzKS5jbG9uZSgpKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgYXhpcyBvZiBheGVzKSB7XG4gICAgICAgICAgICBpZih0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIil7Y29udGludWU7fVxuICAgICAgICAgICAgYXhpcy5uYW1lPXVuZGVmaW5lZFxuICAgICAgICB9XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXhlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudCA9IGF4ZXNbaV07XG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnQgIT09IFwic3RyaW5nXCIpIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3Qgc2lkZXMgPSBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXMsIGkpO1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlQXhpcyA9IGF4ZXNbc2lkZXMuYmVmb3JlXSBhcyBBeGlzO1xuICAgICAgICAgICAgY29uc3QgYWZ0ZXJBeGlzID0gYXhlc1tzaWRlcy5hZnRlcl0gYXMgQXhpcztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgbGV0ICBtYXRjaCA9IGN1cnJlbnQubWF0Y2goL15cXCskLyk7XG4gICAgICAgICAgICBsZXQgbW9kZSxtb2RpZmllcnM7XG4gICAgICAgICAgICBpZiAobWF0Y2gpe1xuICAgICAgICAgICAgICAgIG1vZGUgPSBcImFkZGl0aW9uXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL14tXFx8JC8pXG4gICAgICAgICAgICBpZighbW9kZSYmbWF0Y2gpe1xuICAgICAgICAgICAgICAgIG1vZGUgPSBcInJpZ2h0UHJvamVjdGlvblwiXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaD1jdXJyZW50Lm1hdGNoKC9eXFwhKFtcXGQuXSspXFwhJC8pXG4gICAgICAgICAgICBpZighbW9kZSYmbWF0Y2gpe1xuICAgICAgICAgICAgICAgIG1vZGUgPSBcImludGVybmFsUG9pbnRcIlxuICAgICAgICAgICAgICAgIG1vZGlmaWVycz10b051bWJlcihtYXRjaFsxXSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYobW9kZSl7XG4gICAgICAgICAgICAgICAgYXhlcy5zcGxpY2Uoc2lkZXMuYmVmb3JlLCBzaWRlcy5hZnRlciAtIHNpZGVzLmJlZm9yZSArIDEsIGJlZm9yZUF4aXMuY29tcGxleENhcnRlc2lhbkFkZChhZnRlckF4aXMsbW9kZSxtb2RpZmllcnMpKTtcbiAgICAgICAgICAgICAgICBpID0gc2lkZXMuYmVmb3JlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXhlcy5sZW5ndGggPT09IDEgJiYgYXhlc1swXSBpbnN0YW5jZW9mIEF4aXMpIHtcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb21wbGV4Q2FydGVzaWFuQWRkKGF4aXM6IEF4aXMsbW9kZTogc3RyaW5nLG1vZGlmaWVyPzogYW55KXtcbiAgICAgICAgc3dpdGNoIChtb2RlKSB7XG4gICAgICAgICAgICBjYXNlIFwiYWRkaXRpb25cIjpcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblgrPWF4aXMuY2FydGVzaWFuWDtcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblkrPWF4aXMuY2FydGVzaWFuWTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJzdWJ0cmFjdGlvblwiOlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSBcInJpZ2h0UHJvamVjdGlvblwiOlxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWD1heGlzLmNhcnRlc2lhblhcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJpbnRlcm5hbFBvaW50XCI6XG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPSh0aGlzLmNhcnRlc2lhblgrYXhpcy5jYXJ0ZXNpYW5YKSptb2RpZmllcjtcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblk9KHRoaXMuY2FydGVzaWFuWStheGlzLmNhcnRlc2lhblkpKm1vZGlmaWVyO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNhcnRlc2lhblRvUG9sYXIoKVxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH07XG5cblxuICAgIGdldENvb3JkaW5hdGVNYXRjaGVzKGNvb3JkaW5hdGU6IHN0cmluZyl7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybiA9IGdldFJlZ2V4KCk7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4uYmFzaWN9KylgLCBcImdcIiksXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4ubWVyZ2V9KylgLCBcImdcIilcbiAgICAgICAgXTtcbiAgICAgICAgXG4gICAgICAgIC8vIFN0ZXAgMTogRXh0cmFjdCBtYXRjaGVzIGZvciBlYWNoIHBhdHRlcm4gc2VwYXJhdGVseVxuICAgICAgICBjb25zdCBiYXNpY01hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1swXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0ucmVwbGFjZSgvLSQvZywgXCJcIiksIC8vIFJlbW92ZSB0cmFpbGluZyBoeXBoZW4gb25seVxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXG4gICAgICAgICAgICBsZW5ndGg6IG1hdGNoWzBdLmxlbmd0aC0obWF0Y2hbMF0ubWF0Y2goLy0kLyk/MTowKVxuICAgICAgICB9KSk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBtZXJnZU1hdGNoZXMgPSBBcnJheS5mcm9tKGNvb3JkaW5hdGUubWF0Y2hBbGwocmVnZXhQYXR0ZXJuc1sxXSkpLm1hcCgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gKHtcbiAgICAgICAgICAgIGZ1bGxNYXRjaDogbWF0Y2hbMF0sXG4gICAgICAgICAgICBpbmRleDogbWF0Y2guaW5kZXggPz8gMCxcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoXG4gICAgICAgIH0pKTtcbiAgICAgICAgY29uc3QgbWF0Y2hlczogQXJyYXk8eyBmdWxsTWF0Y2g6IHN0cmluZywgaW5kZXg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIgfT4gPSBbXTtcblxuICAgICAgICBmdW5jdGlvbiBpc092ZXJsYXBwaW5nKG1hdGNoMTogeyBpbmRleDogbnVtYmVyOyBsZW5ndGg6IG51bWJlciB9LCBtYXRjaDI6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSkge1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoMS5pbmRleCA8IG1hdGNoMi5pbmRleCArIG1hdGNoMi5sZW5ndGggJiYgbWF0Y2gyLmluZGV4IDwgbWF0Y2gxLmluZGV4ICsgbWF0Y2gxLmxlbmd0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIFsuLi5iYXNpY01hdGNoZXMsIC4uLm1lcmdlTWF0Y2hlc10uZm9yRWFjaChtYXRjaCA9PiB7XG4gICAgICAgICAgICBjb25zdCBvdmVybGFwcGluZ0luZGV4ID0gbWF0Y2hlcy5maW5kSW5kZXgoZXhpc3RpbmdNYXRjaCA9PiBpc092ZXJsYXBwaW5nKGV4aXN0aW5nTWF0Y2gsIG1hdGNoKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGlmIChvdmVybGFwcGluZ0luZGV4ICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nTWF0Y2ggPSBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBjdXJyZW50IG1hdGNoIGNvdmVycyBhIGxhcmdlciByYW5nZSwgcmVwbGFjZSB0aGUgZXhpc3Rpbmcgb25lXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA+IGV4aXN0aW5nTWF0Y2gubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoZXNbb3ZlcmxhcHBpbmdJbmRleF0gPSBtYXRjaDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1hdGNoZXMucHVzaChtYXRjaCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgLy8gU3RlcCAzOiBTb3J0IHRoZSBmaW5hbCBtYXRjaGVzIGJ5IGluZGV4XG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gYS5pbmRleCAtIGIuaW5kZXgpO1xuICAgICAgICBcbiAgICAgICAgLy8gU3RlcCA0OiBWYWxpZGF0ZSB0aGUgcmVzdWx0XG4gICAgICAgIGlmIChtYXRjaGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ29vcmRpbmF0ZSBpcyBub3QgdmFsaWQ7IGV4cGVjdGVkIGEgdmFsaWQgY29vcmRpbmF0ZS5cIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hdGNoZXM7XG4gICAgICAgIFxuICAgIH1cbiAgICBcbiAgICBcbiAgICBcblxuICAgIHByb2plY3Rpb24oYXhpczE6IEF4aXN8dW5kZWZpbmVkLGF4aXMyOiBBeGlzfHVuZGVmaW5lZCk6YW55e1xuICAgICAgICBpZiAoIWF4aXMxfHwhYXhpczIpe3Rocm93IG5ldyBFcnJvcihcImF4aXMncyB3ZXJlIHVuZGVmaW5lZCBhdCBwcm9qZWN0aW9uXCIpO31cbiAgICAgICAgcmV0dXJuIFt7WDogYXhpczEuY2FydGVzaWFuWCxZOiBheGlzMi5jYXJ0ZXNpYW5ZfSx7WDogYXhpczIuY2FydGVzaWFuWCxZOiBheGlzMS5jYXJ0ZXNpYW5ZfV1cbiAgICB9XG5cbiAgICBjb21iaW5lKGNvb3JkaW5hdGVBcnI6IGFueSl7XG4gICAgICAgIGxldCB4PTAseT0wO1xuICAgICAgICBjb29yZGluYXRlQXJyLmZvckVhY2goKGNvb3JkaW5hdGU6IEF4aXMpPT57XG4gICAgICAgICAgICB4Kz1jb29yZGluYXRlLmNhcnRlc2lhblg7XG4gICAgICAgICAgICB5Kz1jb29yZGluYXRlLmNhcnRlc2lhblk7XG4gICAgICAgIH0pXG4gICAgICAgIFxuICAgICAgICB0aGlzLmNhcnRlc2lhblg9eDt0aGlzLmNhcnRlc2lhblk9eTtcbiAgICB9XG4gICAgYWRkQ2FydGVzaWFuKHg6IHN0cmluZyB8IG51bWJlciwgeT86IG51bWJlcik6IHZvaWQge1xuICAgICAgICBcbiAgICAgICAgaWYgKCF5ICYmIHR5cGVvZiB4ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICBbeCwgeV0gPSB4LnNwbGl0KFwiLFwiKS5tYXAoTnVtYmVyKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeCA9PT0gdW5kZWZpbmVkIHx8IHkgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBDYXJ0ZXNpYW4gY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2FydGVzaWFuWCA9IHggYXMgbnVtYmVyO1xuICAgICAgICB0aGlzLmNhcnRlc2lhblkgPSB5IGFzIG51bWJlcjtcbiAgICB9XG4gICAgXG4gICAgcG9sYXJUb0NhcnRlc2lhbigpe1xuICAgICAgICBjb25zdCB0ZW1wPXBvbGFyVG9DYXJ0ZXNpYW4odGhpcy5wb2xhckFuZ2xlLCB0aGlzLnBvbGFyTGVuZ3RoKVxuICAgICAgICB0aGlzLmFkZENhcnRlc2lhbih0ZW1wLlgsdGVtcC5ZKVxuICAgIH1cblxuICAgIGNhcnRlc2lhblRvUG9sYXIoKXtcbiAgICAgICAgY29uc3QgdGVtcD1jYXJ0ZXNpYW5Ub1BvbGFyKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZKVxuICAgICAgICB0aGlzLmFkZFBvbGFyKHRlbXAuYW5nbGUsdGVtcC5sZW5ndGgpXG4gICAgfVxuXG4gICAgYWRkUG9sYXIoYW5nbGU6IHN0cmluZyB8IG51bWJlciwgbGVuZ3RoPzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICghbGVuZ3RoICYmIHR5cGVvZiBhbmdsZSA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgW2FuZ2xlLCBsZW5ndGhdID0gYW5nbGUuc3BsaXQoXCI6XCIpLm1hcChOdW1iZXIpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhbmdsZSA9PT0gdW5kZWZpbmVkIHx8IGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHBvbGFyIGNvb3JkaW5hdGVzIHByb3ZpZGVkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnBvbGFyQW5nbGUgPSBhbmdsZSBhcyBudW1iZXI7XG4gICAgICAgIHRoaXMucG9sYXJMZW5ndGggPSBsZW5ndGggYXMgbnVtYmVyO1xuICAgIH1cbiAgICBhZGRRdWFkcmFudChtaWRQb2ludDogQXhpcyl7XG4gICAgICAgIGNvbnN0IHg9bWlkUG9pbnQuY2FydGVzaWFuWD50aGlzLmNhcnRlc2lhblg7XG4gICAgICAgIGNvbnN0IHk9bWlkUG9pbnQuY2FydGVzaWFuWT50aGlzLmNhcnRlc2lhblk7XG4gICAgICAgIHRoaXMucXVhZHJhbnQ9eD95PzE6NDp5PzI6MztcbiAgICB9XG4gICAgdG9TdHJpbmdTVkcoKXtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FydGVzaWFuWCtcIiBcIit0aGlzLmNhcnRlc2lhblk7XG4gICAgfVxuICAgIHRvU3RyaW5nKCl7XG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIsXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xuICAgIH1cblxuICAgIGludGVyc2VjdGlvbihjb29yZDogc3RyaW5nLCBmaW5kT3JpZ2luYWxWYWx1ZTogKGNvb3JkOiBzdHJpbmcpID0+IENvb3JkaW5hdGUgfCB1bmRlZmluZWQpOiB7WDpudW1iZXIsWTpudW1iZXJ9IHtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxDb29yZHMgPSBjb29yZFxuICAgICAgICAgICAgLnJlcGxhY2UoL2ludGVyc2VjdGlvblxccz9vZlxccz8vZywgXCJcIilcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFxzKmFuZFxccz98LS0pL2csIFwiIFwiKVxuICAgICAgICAgICAgLnNwbGl0KFwiIFwiKVxuICAgICAgICAgICAgLm1hcChmaW5kT3JpZ2luYWxWYWx1ZSlcbiAgICAgICAgICAgIC5maWx0ZXIoKHRva2VuKTogdG9rZW4gaXMgQ29vcmRpbmF0ZSA9PiB0b2tlbiAhPT0gdW5kZWZpbmVkKTtcblxuICAgICAgICBpZiAob3JpZ2luYWxDb29yZHMubGVuZ3RoIDwgNCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW50ZXJzZWN0aW9uIGhhZCB1bmRlZmluZWQgY29vcmRpbmF0ZXMgb3IgaW5zdWZmaWNpZW50IGRhdGEuXCIpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBjb25zdCBzbG9wZXMgPSBbXG4gICAgICAgICAgICBmaW5kU2xvcGUob3JpZ2luYWxDb29yZHNbMF0uYXhpcyBhcyBBeGlzLCBvcmlnaW5hbENvb3Jkc1sxXS5heGlzIGFzIEF4aXMpLFxuICAgICAgICAgICAgZmluZFNsb3BlKG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbM10uYXhpcyBhcyBBeGlzKSxcbiAgICAgICAgXTtcblxuICAgICAgICByZXR1cm4gZmluZEludGVyc2VjdGlvblBvaW50KG9yaWdpbmFsQ29vcmRzWzBdLmF4aXMgYXMgQXhpcywgb3JpZ2luYWxDb29yZHNbMl0uYXhpcyBhcyBBeGlzLCBzbG9wZXNbMF0sIHNsb3Blc1sxXSk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiB0b1BvaW50KHZhbHVlOm51bWJlcixmb3JtYXQ6IHN0cmluZyl7XG4gICAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICAgICAgY2FzZSBcInB0XCI6XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIGNhc2UgXCJjbVwiOiBcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZSoyOC4zNDY7XG4gICAgICAgIGNhc2UgXCJtbVwiOlxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKiAyLjgzNDY7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ1bmtub24gZm9ybWF0XCIpO1xuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBtYXRjaEtleVdpdGhWYWx1ZShrZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgY29uc3QgdmFsdWVNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgICAgIFwiYW5jaG9yXCI6IFwiYW5jaG9yPVwiLFxuICAgICAgICBcInJvdGF0ZVwiOiBcInJvdGF0ZT1cIixcbiAgICAgICAgXCJsaW5lV2lkdGhcIjogXCJsaW5lIHdpZHRoPVwiLFxuICAgICAgICBcImZpbGxcIjogXCJmaWxsPVwiLFxuICAgICAgICBcImZpbGxPcGFjaXR5XCI6IFwiZmlsbCBvcGFjaXR5PVwiLFxuICAgICAgICBcInRleHRPcGFjaXR5XCI6IFwidGV4dCBvcGFjaXR5PVwiLFxuICAgICAgICBcInRleHRDb2xvclwiOiBcInRleHQgY29sb3I9XCIsXG4gICAgICAgIFwiZHJhd1wiOiBcImRyYXc9XCIsXG4gICAgICAgIFwidGV4dFwiOiBcInRleHQ9XCIsXG4gICAgICAgIFwicG9zXCI6IFwicG9zPVwiLFxuICAgICAgICBcInNjYWxlXCI6IFwic2NhbGU9XCIsXG4gICAgICAgIFwiZGVjb3JhdGVcIjogXCJkZWNvcmF0ZVwiLFxuICAgICAgICBcInNsb3BlZFwiOiBcInNsb3BlZFwiLFxuICAgICAgICBcImRlY29yYXRpb25cIjogXCJkZWNvcmF0aW9uPVwiLFxuICAgICAgICBcImJyYWNlXCI6IFwiYnJhY2VcIixcbiAgICAgICAgXCJhbXBsaXR1ZGVcIjogXCJhbXBsaXR1ZGU9XCIsXG4gICAgICAgIFwiYW5nbGVSYWRpdXNcIjogXCJhbmdsZSByYWRpdXM9XCIsXG4gICAgICAgIFwiYW5nbGVFY2NlbnRyaWNpdHlcIjogXCJhbmdsZSBlY2NlbnRyaWNpdHk9XCIsXG4gICAgICAgIFwiZm9udFwiOiBcImZvbnQ9XCIsXG4gICAgICAgIFwicGljVGV4dFwiOiBcInBpYyB0ZXh0PVwiLFxuICAgICAgICBcImxhYmVsXCI6IFwibGFiZWw9XCIsXG4gICAgfTtcblxuICAgIHJldHVybiB2YWx1ZU1hcFtrZXldIHx8ICcnO1xufVxuXG5cbnR5cGUgRGVjb3JhdGlvbiA9IHtcbiAgICBicmFjZT86IGJvb2xlYW47XG4gICAgY29pbDogYm9vbGVhbjtcbiAgICBhbXBsaXR1ZGU/OiBudW1iZXI7XG4gICAgYXNwZWN0PzogbnVtYmVyO1xuICAgIHNlZ21lbnRMZW5ndGg/OiBudW1iZXI7XG4gICAgZGVjb3JhdGlvbj86IERlY29yYXRpb247IFxufTtcbnR5cGUgTGFiZWwgPSB7XG4gICAgZnJlZUZvcm1UZXh0Pzogc3RyaW5nO1xufTtcbmZ1bmN0aW9uIGxpbmVXaWR0aENvbnZlcnRlcih3aWR0aDogc3RyaW5nKXtcbiAgICByZXR1cm4gTnVtYmVyKHdpZHRoLnJlcGxhY2UoL3VsdHJhXFxzKnRoaW4vLFwiMC4xXCIpXG4gICAgLnJlcGxhY2UoL3ZlcnlcXHMqdGhpbi8sXCIwLjJcIilcbiAgICAucmVwbGFjZSgvdGhpbi8sXCIwLjRcIilcbiAgICAucmVwbGFjZSgvc2VtaXRoaWNrLyxcIjAuNlwiKVxuICAgIC5yZXBsYWNlKC90aGljay8sXCIwLjhcIilcbiAgICAucmVwbGFjZSgvdmVyeVxccyp0aGljay8sXCIxLjJcIilcbiAgICAucmVwbGFjZSgvdWx0cmFcXHMqdGhpY2svLFwiMS42XCIpKVxufVxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XG4gICAgLy8gaW1wb3J0ZW50IG5lZWRzIHRvIGJlIGZvcnN0XG4gICAgcGF0aD86IHN0cmluZztcblxuICAgIHNjYWxlOiBudW1iZXI7XG4gICAgcm90YXRlPzogbnVtYmVyO1xuICAgIGxpbmVXaWR0aD86IG51bWJlcj0wLjQ7XG4gICAgdGV4dE9wYWNpdHk6IG51bWJlcjtcbiAgICBvcGFjaXR5PzogbnVtYmVyO1xuICAgIGZpbGxPcGFjaXR5PzogbnVtYmVyO1xuICAgIHBvcz86IG51bWJlcjtcbiAgICBhbmdsZUVjY2VudHJpY2l0eT86IG51bWJlcjtcbiAgICBhbmdsZVJhZGl1cz86IG51bWJlcjtcbiAgICBsZXZlbERpc3RhbmNlPzogbnVtYmVyO1xuXG4gICAgbW9kZTogc3RyaW5nO1xuICAgIGFuY2hvcj86IHN0cmluZztcbiAgICBjb2xvcj86IHN0cmluZztcbiAgICB0ZXh0Q29sb3I/OiBzdHJpbmc7XG4gICAgZmlsbD86IHN0cmluZztcbiAgICBhcnJvdz86IHN0cmluZztcbiAgICBkcmF3Pzogc3RyaW5nO1xuICAgIHRleHQ/OiBzdHJpbmc7XG4gICAgdGlrenNldD86IHN0cmluZztcbiAgICBwb3NpdGlvbj86IHN0cmluZztcbiAgICBsaW5lU3R5bGU/OiBzdHJpbmc7XG4gICAgZm9udD86IHN0cmluZztcbiAgICBwaWNUZXh0Pzogc3RyaW5nO1xuICAgIFxuICAgIHNsb3BlZD86IGJvb2xlYW47XG4gICAgZGVjb3JhdGU/OiBib29sZWFuO1xuICAgIGxhYmVsPzogTGFiZWw7XG4gICAgZGVjb3JhdGlvbj86IERlY29yYXRpb247XG5cbiAgICBjb25zdHJ1Y3Rvcihtb2RlOiBzdHJpbmcsZm9ybWF0dGluZ0FycjogYW55LGZvcm1hdHRpbmdTdHJpbmc/OnN0cmluZyl7XG4gICAgICAgIHRoaXMubW9kZT1tb2RlO1xuICAgICAgICB0aGlzLmFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZ0Fycnx8W10pO1xuICAgICAgICB0aGlzLmludGVycHJldEZvcm1hdHRpbmcoZm9ybWF0dGluZ1N0cmluZ3x8XCJcIik7XG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuXG4gICAgYWRkVGlrenNldChzcGxpdEZvcm1hdHRpbmc6IGFueSl7XG4gICAgICAgIGNvbnN0IGE9c3BsaXRGb3JtYXR0aW5nLmZpbmQoKGl0ZW06IHN0cmluZyk9PiBpdGVtLm1hdGNoKC9tYXNzfGFuZ3xoZWxwbGluZXMvKSlcbiAgICAgICAgaWYgKCFhJiYhdGhpcy50aWt6c2V0KXJldHVybjtcbiAgICAgICAgaWYoYSkgdGhpcy50aWt6c2V0PWE7XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLnRpa3pzZXQpIHtcbiAgICAgICAgICAgIGNhc2UgXCJtYXNzXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5maWxsPVwieWVsbG93ITYwXCI7XG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoPVwiZHJhd1wiO1xuICAgICAgICAgICAgICAgIHRoaXMudGV4dD1cImJsYWNrXCI7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwidmVjXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5hcnJvdz0nLT4nXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiaGVscGxpbmVzXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5saW5lV2lkdGg9MC40O1xuICAgICAgICAgICAgICAgIHRoaXMuZHJhdz0nZ3JheSc7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiYW5nXCI6XG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoPSdkcmF3J1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD0nYmxhY2shNTAnO1xuICAgICAgICAgICAgICAgIHRoaXMuZmlsbE9wYWNpdHk9MC41O1xuICAgICAgICAgICAgICAgIHRoaXMuZHJhdz0nb3JhbmdlJ1xuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9JzwtPidcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlRWNjZW50cmljaXR5PTEuNjtcbiAgICAgICAgICAgICAgICB0aGlzLmFuZ2xlUmFkaXVzPXRvUG9pbnQoMC41LFwiY21cIik7XG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0PSdvcmFuZ2UnO1xuICAgICAgICAgICAgICAgIHRoaXMuZm9udD0nXFxcXGxhcmdlJztcbiAgICAgICAgICAgICAgICB0aGlzLnRleHRPcGFjaXR5PTAuOTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWRkU3Bsb3BBbmRQb3NpdGlvbihhcnI6IGFueSxpbmRleDogbnVtYmVyKXtcbiAgICAgICAgY29uc3QgYmVmb3JlQWZ0ZXI9ZmluZEJlZm9yZUFmdGVyQXhpcyhhcnIsaW5kZXgpO1xuICAgICAgICBjb25zdCBbYmVmb3JlLCBhZnRlcl09W2FycltiZWZvcmVBZnRlci5iZWZvcmVdLGFycltiZWZvcmVBZnRlci5hZnRlcl1dXG4gICAgICAgIGlmICh0aGlzLnBvc2l0aW9ufHx0aGlzLnNsb3BlZCl7cmV0dXJufVxuICAgIFxuICAgICAgICBjb25zdCBlZGdlMSA9IGJlZm9yZS5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcbiAgICAgICAgY29uc3QgZWRnZTIgPSBhZnRlci5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcbiAgICAgICAgY29uc3Qgc2xvcGU9ZmluZFNsb3BlKGJlZm9yZSxhZnRlcilcblxuICAgICAgICB0aGlzLnNsb3BlZCA9IHNsb3BlICE9PSAwJiZzbG9wZSE9PUluZmluaXR5JiZzbG9wZSE9PS1JbmZpbml0eTtcblxuICAgICAgICBsZXQgcXVhZHJhbnRcblxuICAgICAgICBpZiAoZWRnZTEhPT1lZGdlMilcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxK2VkZ2UyO1xuICAgICAgICBlbHNlIFxuICAgICAgICAgICAgcXVhZHJhbnQ9ZWRnZTE7XG5cbiAgICAgICAgLy9zaW50IHBhcmFsbGVsIHRvIFkgYXhpc1xuICAgICAgICBpZiAoc2xvcGUhPT1JbmZpbml0eSYmc2xvcGUhPT0tSW5maW5pdHkpe1xuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHF1YWRyYW50LnJlcGxhY2UoLygzfDQpLyxcImJlbG93XCIpLnJlcGxhY2UoLygxfDIpLyxcImFib3ZlXCIpLnJlcGxhY2UoLyhiZWxvd2Fib3ZlfGFib3ZlYmVsb3cpLyxcIlwiKVxuICAgICAgICB9XG4gICAgICAgIC8vaXNudCBwYXJhbGxlbCB0byBYIGF4aXNcbiAgICAgICAgaWYgKHNsb3BlICE9PSAwKXtcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb249dGhpcy5wb3NpdGlvbj90aGlzLnBvc2l0aW9uOicnO1xuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbis9cXVhZHJhbnQucmVwbGFjZSgvKDF8NCkvLFwicmlnaHRcIikucmVwbGFjZSgvKDJ8MykvLFwibGVmdFwiKS5yZXBsYWNlKC8ocmlnaHRsZWZ0fGxlZnRyaWdodCkvLFwiXCIpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbj8ucmVwbGFjZSgvW1xcZF0rL2csXCJcIikucmVwbGFjZSgvKGJlbG93fGFib3ZlKShyaWdodHxsZWZ0KS8sXCIkMSAkMlwiKTtcbiAgICAgICAgY29uc29sZS5sb2coc2xvcGUsdGhpcy5wb3NpdGlvbixxdWFkcmFudClcbiAgICB9XG5cbiAgICBhc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmdBcnI6IFJlY29yZDxzdHJpbmcsIGFueT4pIHtcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZm9ybWF0dGluZ0FycikpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdmFsdWUgIT09IG51bGwmJiF0aGlzW2tleSBhcyBrZXlvZiBGb3JtYXR0aW5nXSkge1xuICAgICAgICAgICAgICAgICh0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW2tleV0gPSB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRQcm9wZXJ0eShrZXkgYXMga2V5b2YgRm9ybWF0dGluZywgdmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIFxuXG4gICAgaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3Qgc3BsaXRGb3JtYXR0aW5nID0gZm9ybWF0dGluZ1N0cmluZy5yZXBsYWNlKC9cXHMvZywgXCJcIikubWF0Y2goLyg/OntbXn1dKn18W14se31dKykrL2cpIHx8IFtdO1xuICAgIFxuICAgICAgICB0aGlzLmFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nKTtcbiAgICBcbiAgICAgICAgY29uc3QgcGF0dGVybnM6IFJlY29yZDxzdHJpbmcsICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkPiA9IHtcbiAgICAgICAgICAgIFwibGluZXdpZHRoXCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImxpbmVXaWR0aFwiLCB2YWx1ZSksXG4gICAgICAgICAgICBcImZpbGw9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImZpbGxcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeZmlsbG9wYWNpdHlcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZmlsbE9wYWNpdHlcIiwgdmFsdWUpLFxuICAgICAgICAgICAgXCJeKC0+fDwtfC0qe1N0ZWFsdGh9LSopJFwiOiAodmFsdWUpID0+IHsgdGhpcy5hcnJvdyA9IHZhbHVlOyB9LFxuICAgICAgICAgICAgXCJeKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpezEsMn0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLnBvc2l0aW9uID0gdmFsdWUucmVwbGFjZSgvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLywgXCIkMSBcIik7IH0sXG4gICAgICAgICAgICBcIl5wb3M9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcInBvc1wiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5kcmF3PVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJkcmF3XCIsIHZhbHVlKSxcbiAgICAgICAgICAgIFwiXmRlY29yYXRlJFwiOiAoKSA9PiB7IHRoaXMuZGVjb3JhdGUgPSB0cnVlOyB9LFxuICAgICAgICAgICAgXCJedGV4dD1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwidGV4dFwiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5hbmNob3I9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImFuY2hvclwiLCB2YWx1ZSksXG4gICAgICAgICAgICBcIl5cXFwiXlxcXCIkXCI6ICgpID0+IHRoaXMuc2V0UHJvcGVydHkoXCJsYWJlbFwiLHRydWUsXCJmcmVlRm9ybVRleHRcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wibGFiZWxcIl0+KSxcbiAgICAgICAgICAgIFwiXmJyYWNlJFwiOiAoKSA9PiB0aGlzLnNldFByb3BlcnR5KFwiZGVjb3JhdGlvblwiLHRydWUsXCJicmFjZVwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJkZWNvcmF0aW9uXCJdPiksXG4gICAgICAgICAgICBcIl5hbXBsaXR1ZGVcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZGVjb3JhdGlvblwiLCB2YWx1ZSwgXCJhbXBsaXR1ZGVcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxuICAgICAgICAgICAgXCJeZHJhdyRcIjogKHZhbHVlKSA9PiB7IHRoaXMucGF0aCA9IHZhbHVlOyB9LFxuICAgICAgICAgICAgXCJeKHJlZHxibHVlfHBpbmt8YmxhY2t8d2hpdGV8WyFcXFxcZC5dKyl7MSw1fSRcIjogKHZhbHVlKSA9PiB7IHRoaXMuY29sb3IgPSB2YWx1ZTsgfSxcbiAgICAgICAgICAgIFwiXihkb3R0ZWR8ZGFzaGVkfHNtb290aHxkZW5zZWx5fGxvb3NlbHkpezEsMn0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmxpbmVTdHlsZSA9IHZhbHVlLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLywgXCIkMSBcIik7IH0sXG4gICAgICAgIH07XG5cbiAgICAgICAgc3BsaXRGb3JtYXR0aW5nLmZvckVhY2goZm9ybWF0dGluZyA9PiB7XG4gICAgICAgICAgICAvLyBIYW5kbGUgbmVzdGVkIHByb3BlcnRpZXNcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZm9ybWF0dGluZy5tYXRjaCgvXihbXj1dKyk9eyguKil9JC8pO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgW18sIHBhcmVudCwgY2hpbGRyZW5dID0gbWF0Y2g7XG5cbiAgICAgICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nT2JqID0gdGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuICAgICAgICAgICAgICAgIGlmICghZm9ybWF0dGluZ09ialtwYXJlbnRdKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpbcGFyZW50XSA9IHt9O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBwYXJzZWRDaGlsZCA9IG5ldyBGb3JtYXR0aW5nKHRoaXMubW9kZSx7fSxjaGlsZHJlbik7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihmb3JtYXR0aW5nT2JqW3BhcmVudF0sIChwYXJzZWRDaGlsZCBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+KVtwYXJlbnRdKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3BhdHRlcm4sIGhhbmRsZXJdIG9mIE9iamVjdC5lbnRyaWVzKHBhdHRlcm5zKSkge1xuICAgICAgICAgICAgICAgIGlmIChuZXcgUmVnRXhwKHBhdHRlcm4pLnRlc3QoZm9ybWF0dGluZykpIHtcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlcihmb3JtYXR0aW5nKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIFxuICAgIFxuXG4gICAgc3BsaXQ8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxuICAgICAgICBrZXk6IEssXG4gICAgICAgIGZvcm1hdHRpbmc6IGFueSxcbiAgICAgICAgbmVzdGVkS2V5PzogTktcbiAgICApOiB2b2lkIHtcbiAgICAgICAgbGV0IHZhbHVlO1xuICAgICAgICBpZih0eXBlb2YgZm9ybWF0dGluZyE9PVwiYm9vbGVhblwiKXtcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IGZvcm1hdHRpbmcuc3BsaXQoXCI9XCIpO1xuICAgIFxuICAgICAgICAgICAgLy8gRW5zdXJlIHRoZSBmb3JtYXR0aW5nIHN0cmluZyBpcyB2YWxpZFxuICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA8IDIgfHwgIW1hdGNoWzFdKSByZXR1cm47XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFRyaW0gYW55IHBvdGVudGlhbCB3aGl0ZXNwYWNlIGFyb3VuZCB0aGUgdmFsdWVcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gbWF0Y2hbMV0udHJpbSgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHZhbHVlIGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nXG4gICAgICAgICAgICB2YWx1ZSA9ICFpc05hTihwYXJzZUZsb2F0KHJhd1ZhbHVlKSkgJiYgaXNGaW5pdGUoK3Jhd1ZhbHVlKVxuICAgICAgICAgICAgICAgID8gcGFyc2VGbG9hdChyYXdWYWx1ZSlcbiAgICAgICAgICAgICAgICA6IHJhd1ZhbHVlLnJlcGxhY2UoLy1cXHwvLCdub3J0aCcpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2V7XG4gICAgICAgICAgICB2YWx1ZT1mb3JtYXR0aW5nXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMuc2V0UHJvcGVydHkoa2V5LCB2YWx1ZSwgbmVzdGVkS2V5KTtcbiAgICB9XG4gICAgXG4gICAgc2V0UHJvcGVydHk8SyBleHRlbmRzIGtleW9mIEZvcm1hdHRpbmcsIE5LIGV4dGVuZHMga2V5b2YgTm9uTnVsbGFibGU8Rm9ybWF0dGluZ1tLXT4gfCB1bmRlZmluZWQ+KFxuICAgICAgICBrZXk6IEssXG4gICAgICAgIHZhbHVlOiBhbnksXG4gICAgICAgIG5lc3RlZEtleT86IE5LXG4gICAgKTogdm9pZCB7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWU9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgICAgIHZhbHVlPXZhbHVlLnJlcGxhY2UoL15cXHwtJC8sXCJub3J0aFwiKS5yZXBsYWNlKC9eLVxcfCQvLFwic291dGhcIik7XG4gICAgICAgICAgICBjb25zdCBtYXRjaD12YWx1ZS5tYXRjaCgvKFtcXGQuXSspKHB0fGNtfG1tKS8pXG4gICAgICAgICAgICBpZiAobWF0Y2gpXG4gICAgICAgICAgICB2YWx1ZT10b1BvaW50KE51bWJlcihtYXRjaFsxXSksbWF0Y2hbMl0pXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBmb3JtYXR0aW5nT2JqID0gdGhpcyBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuXG4gICAgICAgIGlmIChuZXN0ZWRLZXkpIHtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY29uc3Qga2V5cyA9IHR5cGVvZiBuZXN0ZWRLZXkgPT09IFwic3RyaW5nXCIgPyBuZXN0ZWRLZXkuc3BsaXQoJy4nKSA6IFtuZXN0ZWRLZXldO1xuICAgICAgICAgICAgdGhpcy50aWt6c2V0XG4gICAgICAgICAgICBpZighZm9ybWF0dGluZ09ialtrZXldKWZvcm1hdHRpbmdPYmpba2V5XT17fTtcbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XVtuZXN0ZWRLZXldPXZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZm9ybWF0dGluZ09ialtrZXldID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgfVxuICAgIFxuICAgIFxuICAgIHRvU3RyaW5nKG9iaj86IGFueSk6IHN0cmluZyB7XG4gICAgICAgIGxldCBzdHJpbmc9b2JqPyd7JzonWyc7XG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG9iaj9vYmo6dGhpcykpIHtcbiAgICAgICAgICAgIGlmIChrZXkubWF0Y2goL14obW9kZXx0aWt6c2V0KSQvKSl7Y29udGludWU7fVxuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyYmdmFsdWUpe1xuICAgICAgICAgICAgICAgIHN0cmluZys9bWF0Y2hLZXlXaXRoVmFsdWUoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcpK3RoaXMudG9TdHJpbmcodmFsdWUpKycsJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICBzdHJpbmcrPW1hdGNoS2V5V2l0aFZhbHVlKGtleSBhcyBrZXlvZiBGb3JtYXR0aW5nKSsodHlwZW9mIHZhbHVlPT09XCJib29sZWFuXCI/Jyc6dmFsdWUpKycsJztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc3RyaW5nKyhvYmo/J30nOiddJyk7XG4gICAgfVxuXG4gICAgaGFuZGxlT2JqZWN0VG9TdHJpbmcob2JqOiBvYmplY3QsIHBhcmVudEtleTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICAgICAgbGV0IHJlc3VsdCA9IG1hdGNoS2V5V2l0aFZhbHVlKHBhcmVudEtleSkrJ3snO1xuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQgKz0gbWF0Y2hLZXlXaXRoVmFsdWUoYCR7cGFyZW50S2V5fS4ke2tleX1gKSArICh0eXBlb2YgdmFsdWUgPT09IFwiYm9vbGVhblwiID8gJycgOiB2YWx1ZSkgKyAnLCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdCtcIn0sXCI7XG4gICAgfVxufVxudHlwZSBNb2RlID0gXCJjb29yZGluYXRlXCIgfCBcImNvb3JkaW5hdGUtaW5saW5lXCIgfCBcIm5vZGVcIiB8IFwibm9kZS1pbmxpbmVcIjtcbmV4cG9ydCBjbGFzcyBDb29yZGluYXRlIHtcbiAgICBtb2RlOiBNb2RlO1xuICAgIGF4aXM/OiBBeGlzO1xuICAgIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nO1xuICAgIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nO1xuICAgIGxhYmVsPzogc3RyaW5nO1xuICAgIFxuICAgIGNvbnN0cnVjdG9yKG1vZGU/OiBNb2RlLCBheGlzPzogQXhpcywgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmcsIGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLCBsYWJlbD86IHN0cmluZywpO1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnM6IHsgbW9kZT86IE1vZGU7IGF4aXM/OiBBeGlzOyBjb29yZGluYXRlTmFtZT86IHN0cmluZzsgZm9ybWF0dGluZz86IEZvcm1hdHRpbmc7IGxhYmVsPzogc3RyaW5nOyAgfSk7XG5cblxuICBjb25zdHJ1Y3RvcihcbiAgICBtb2RlPzogTW9kZSB8IHsgbW9kZT86IE1vZGU7IGF4aXM/OiBBeGlzOyBvcmlnaW5hbD86IHN0cmluZzsgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7IGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nOyBsYWJlbD86IHN0cmluZzsgfSxcbiAgICBheGlzPzogQXhpcyxcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZyxcbiAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxcbiAgICBsYWJlbD86IHN0cmluZyxcbiAgKSB7XG4gICAgaWYgKHR5cGVvZiBtb2RlID09PSBcInN0cmluZ1wiKSB7XG5cbiAgICAgIHRoaXMubW9kZSA9IG1vZGU7XG4gICAgICBpZiAoYXhpcyAhPT0gdW5kZWZpbmVkKSB0aGlzLmF4aXMgPSBheGlzO1xuICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSA9IGNvb3JkaW5hdGVOYW1lO1xuICAgICAgaWYgKGZvcm1hdHRpbmcgIT09IHVuZGVmaW5lZCkgdGhpcy5mb3JtYXR0aW5nID0gZm9ybWF0dGluZztcbiAgICAgIHRoaXMubGFiZWwgPSBsYWJlbDtcblxuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZGUgPT09IFwib2JqZWN0XCIgJiYgbW9kZSAhPT0gbnVsbCkge1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IG1vZGU7XG4gICAgICBpZiAob3B0aW9ucy5tb2RlICE9PSB1bmRlZmluZWQpIHRoaXMubW9kZSA9IG9wdGlvbnMubW9kZTtcbiAgICAgIHRoaXMuYXhpcyA9IG9wdGlvbnMuYXhpcztcbiAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUgPSBvcHRpb25zLmNvb3JkaW5hdGVOYW1lO1xuICAgICAgdGhpcy5mb3JtYXR0aW5nID0gb3B0aW9ucy5mb3JtYXR0aW5nO1xuICAgICAgdGhpcy5sYWJlbCA9IG9wdGlvbnMubGFiZWw7XG4gICAgfVxuICAgIGlmICghdGhpcy5mb3JtYXR0aW5nKVxuICAgICAgICB0aGlzLmZvcm1hdHRpbmc9bmV3IEZvcm1hdHRpbmcodGhpcy5tb2RlLFtdKVxuXG4gICAgaWYgKHRoaXMubW9kZT09PVwiY29vcmRpbmF0ZVwiKXtcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nLmFzc2lnbkZvcm1hdHRpbmcoe2xhYmVsOiB7ZnJlZUZvcm1UZXh0OiB0aGlzLmxhYmVsfX0pO1xuICAgIH1cbiAgfVxuXG4gICAgY2xvbmUoKTogQ29vcmRpbmF0ZSB7XG4gICAgICAgIHJldHVybiBuZXcgQ29vcmRpbmF0ZShcbiAgICAgICAgICAgIHRoaXMubW9kZSxcbiAgICAgICAgICAgIHRoaXMuYXhpcyA/IHRoaXMuYXhpcy5jbG9uZSgpIDp1bmRlZmluZWQsXG4gICAgICAgICAgICB0aGlzLmNvb3JkaW5hdGVOYW1lLFxuICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nLFxuICAgICAgICAgICAgdGhpcy5sYWJlbCxcbiAgICAgICAgKTtcbiAgICB9XG4gICAgYWRkQXhpcyhjYXJ0ZXNpYW5YPzogbnVtYmVyLCBjYXJ0ZXNpYW5ZPzogbnVtYmVyLCBwb2xhckxlbmd0aD86IG51bWJlciwgcG9sYXJBbmdsZT86IG51bWJlcil7XG4gICAgICAgIHRoaXMuYXhpcz1uZXcgQXhpcyhjYXJ0ZXNpYW5YLCBjYXJ0ZXNpYW5ZLCBwb2xhckxlbmd0aCwgcG9sYXJBbmdsZSk7XG4gICAgfVxuXG4gICAgdG9TdHJpbmcoKSB7XG4gICAgICAgIHN3aXRjaCAodGhpcy5tb2RlKSB7XG4gICAgICAgICAgICBjYXNlIFwiY29vcmRpbmF0ZVwiOlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmF4aXMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybmBcXFxcY29vcmRpbmF0ZSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKSB8fCAnJ30gKCR7dGhpcy5jb29yZGluYXRlTmFtZSB8fCBcIlwifSkgYXQgKCR7dGhpcy5heGlzLnRvU3RyaW5nKCl9KTtgXG4gICAgICAgICAgICBjYXNlIFwibm9kZVwiOlxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmF4aXMpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgXFxcXG5vZGUgJHt0aGlzLmNvb3JkaW5hdGVOYW1lPycoJyt0aGlzLmNvb3JkaW5hdGVOYW1lKycpJzonJ30gYXQgKCR7dGhpcy5heGlzLnRvU3RyaW5nKCl9KSAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKXx8Jyd9IHske3RoaXMubGFiZWx9fTtgXG4gICAgICAgICAgICBjYXNlIFwibm9kZS1pbmxpbmVcIjpcbiAgICAgICAgICAgICAgICByZXR1cm4gYG5vZGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9IHske3RoaXMubGFiZWwgfHwgJyd9fWBcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZmluZCBtb2RlIGF0IHRvIHN0cmluZyBjb29yZGluYXRlXCIpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG59XG5cbnR5cGUgVG9rZW4gPUF4aXMgfCBDb29yZGluYXRlIHxEcmF3fEZvcm1hdHRpbmd8IHN0cmluZztcblxuZXhwb3J0IGNsYXNzIERyYXcge1xuICAgIG1vZGU/OiBzdHJpbmdcbiAgICBmb3JtYXR0aW5nOiBGb3JtYXR0aW5nO1xuICAgIGNvb3JkaW5hdGVzOiBBcnJheTxUb2tlbj47XG5cbiAgICBjb25zdHJ1Y3Rvcihtb2RlPzogc3RyaW5nLGZvcm1hdHRpbmc/OiBzdHJpbmcsZHJhdz86IHN0cmluZywgdG9rZW5zPzogRm9ybWF0VGlrempheCwpO1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnM6IHttb2RlPzogc3RyaW5nLCBmb3JtYXR0aW5nU3RyaW5nPzogc3RyaW5nLCBmb3JtYXR0aW5nT2JqPzogb2JqZWN0LGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLGRyYXdTdHJpbmc/OiBzdHJpbmcsZHJhd0Fycj86IGFueSx0b2tlbnM/OiBGb3JtYXRUaWt6amF4fSk7XG5cblxuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICBtb2RlPzogc3RyaW5nIHwge21vZGU/OiBzdHJpbmcsIGZvcm1hdHRpbmdTdHJpbmc/OiBzdHJpbmcsIGZvcm1hdHRpbmdPYmo/OiBvYmplY3QsZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsZHJhd1N0cmluZz86IHN0cmluZyxkcmF3QXJyPzogYW55LHRva2Vucz86IEZvcm1hdFRpa3pqYXh9LFxuICAgICAgICBmb3JtYXR0aW5nPzogc3RyaW5nLFxuICAgICAgICBkcmF3Pzogc3RyaW5nLCBcbiAgICAgICAgdG9rZW5zPzogRm9ybWF0VGlrempheFxuICAgICAgKSB7XG4gICAgICAgIGlmICh0eXBlb2YgbW9kZT09PVwic3RyaW5nXCJ8fHR5cGVvZiBkcmF3PT09XCJzdHJpbmdcIil7XG4gICAgICAgICAgICB0aGlzLm1vZGU9YGRyYXcke21vZGU/XCItXCIrbW9kZTpcIlwifWA7XG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmc9bmV3IEZvcm1hdHRpbmcodGhpcy5tb2RlLHt9LGZvcm1hdHRpbmcpO1xuICAgICAgICAgICAgaWYgKGRyYXcpXG4gICAgICAgICAgICB0aGlzLmNvb3JkaW5hdGVzID0gdGhpcy5maWxsQ29vcmRpbmF0ZXModGhpcy5nZXRTY2hlbWF0aWMoZHJhdyksIHRva2Vucyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZihtb2RlJiZ0eXBlb2YgbW9kZT09PVwib2JqZWN0XCIpe1xuICAgICAgICAgICAgY29uc3Qgb3B0aW9ucz1tb2RlO1xuICAgICAgICAgICAgdGhpcy5tb2RlPWBkcmF3JHtvcHRpb25zPy5tb2RlP1wiLVwiK29wdGlvbnMubW9kZTpcIlwifWA7XG4gICAgICAgICAgICBpZiAoIW9wdGlvbnM/LmZvcm1hdHRpbmcpXG4gICAgICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPSBuZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUsb3B0aW9ucz8uZm9ybWF0dGluZ09iaixvcHRpb25zPy5mb3JtYXR0aW5nU3RyaW5nKTtcbiAgICAgICAgICAgIGVsc2UgdGhpcy5mb3JtYXR0aW5nPW9wdGlvbnMuZm9ybWF0dGluZztcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgaWYgKG9wdGlvbnM/LmRyYXdBcnIpXG4gICAgICAgICAgICAgICAgdGhpcy5jb29yZGluYXRlcz1vcHRpb25zLmRyYXdBcnI7XG4gICAgICAgICAgICBlbHNlIGlmIChvcHRpb25zLmRyYXdTdHJpbmchPT11bmRlZmluZWQpe1xuICAgICAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXMgPSB0aGlzLmZpbGxDb29yZGluYXRlcyh0aGlzLmdldFNjaGVtYXRpYyhvcHRpb25zLmRyYXdTdHJpbmcpLCB0b2tlbnMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGNyZWF0ZUZyb21BcnJheShhcnI6IGFueSl7LypcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBpPTA7aTxhcnIubGVuZ3RoO2krKyl7XG4gICAgICAgICAgICBpZiAoYXJyW2ldIGluc3RhbmNlb2YgQXhpc3x8YXJyW2ldIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSl7XG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmKHR5cGVvZiBhcnI9PT1cInN0cmluZ1wiKXtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZXNBcnJheTsqL1xuICAgIH1cblxuICAgIGZpbGxDb29yZGluYXRlcyhzY2hlbWF0aWM6IGFueVtdLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4KSB7XG4gICAgICAgIGNvbnN0IGNvb3JBcnI6IEFycmF5PFRva2VuPj1bXTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzY2hlbWF0aWMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChzY2hlbWF0aWNbaV0udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcbiAgICAgICAgICAgICAgICBsZXQgcHJldmlvdXNGb3JtYXR0aW5nO1xuXG4gICAgICAgICAgICAgICAgaWYgKGkgPiAwICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJmb3JtYXR0aW5nXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAxXS52YWx1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGkgPiAxICYmIHNjaGVtYXRpY1tpIC0gMV0udHlwZSA9PT0gXCJub2RlXCIgJiYgc2NoZW1hdGljW2kgLSAyXS50eXBlID09PSBcImZvcm1hdHRpbmdcIikge1xuICAgICAgICAgICAgICAgICAgICBwcmV2aW91c0Zvcm1hdHRpbmcgPSBzY2hlbWF0aWNbaSAtIDJdLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IEF4aXMoKS51bml2ZXJzYWwoc2NoZW1hdGljW2ldLnZhbHVlLCB0b2tlbnMsIGNvb3JBcnIsIHByZXZpb3VzRm9ybWF0dGluZywgKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwibm9kZVwiKXtcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IENvb3JkaW5hdGUoe2xhYmVsOiBzY2hlbWF0aWNbaV0udmFsdWUsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlLWlubGluZVwiLHt9LHNjaGVtYXRpY1tpXS5mb3JtYXR0aW5nKSxtb2RlOiBcIm5vZGUtaW5saW5lXCJ9KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNle1xuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChzY2hlbWF0aWNbaV0udmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb29yQXJyO1xuICAgIH1cblxuICAgIGdldFNjaGVtYXRpYyhkcmF3OiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgcmVnZXg9Z2V0UmVnZXgoKTtcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xuICAgICAgICBjb25zdCBub2RlUmVnZXggPSByZWdFeHAoU3RyaW5nLnJhd2Bub2RlXFxzKlxcWz8oJHtyZWdleC5mb3JtYXR0aW5nfSopXFxdP1xccyp7KCR7cmVnZXgudGV4dH0qKX1gKTtcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ1JlZ2V4ID0gLygtLWN5Y2xlfGN5Y2xlfC0tXFwrXFwrfC0tXFwrfC0tfC1cXHx8XFx8LXxncmlkfGNpcmNsZXxyZWN0YW5nbGUpLztcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxcc1xcLSwuOmA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZVJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YChcXChbJHtjYX1dK1xcKXxcXChcXCRcXChbJHtjYX1dK1xcKVske2NhfSE6K1xcLV0rXFwoWyR7Y2F9XStcXClcXCRcXCkpYCk7XG4gICAgICAgIGxldCBpID0gMDtcbiAgICAgICAgbGV0IGxvb3BzID0gMDtcbiAgICAgICAgXG4gICAgICAgIHdoaWxlIChpIDwgZHJhdy5sZW5ndGggJiYgbG9vcHMgPCAxMDApIHsgLy8gSW5jcmVhc2UgbG9vcCBsaW1pdCBvciBhZGQgY29uZGl0aW9uIGJhc2VkIG9uIHBhcnNlZCBsZW5ndGhcbiAgICAgICAgICAgIGxvb3BzKys7XG4gICAgICAgICAgICBjb25zdCBjb29yZGluYXRlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKGNvb3JkaW5hdGVSZWdleCk7XG4gICAgICAgICAgICBcblxuICAgICAgICAgICAgaWYgKGNvb3JkaW5hdGVNYXRjaD8uaW5kZXggPT09IDApIHtcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goeyB0eXBlOiBcImNvb3JkaW5hdGVcIiwgdmFsdWU6IGNvb3JkaW5hdGVNYXRjaFsxXSB9KTtcbiAgICAgICAgICAgICAgICBpICs9IGNvb3JkaW5hdGVNYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2goZm9ybWF0dGluZ1JlZ2V4KTtcbiAgICAgICAgICAgIGlmIChmb3JtYXR0aW5nTWF0Y2g/LmluZGV4ID09PSAwKSB7XG4gICAgICAgICAgICAgICAgaSArPSBmb3JtYXR0aW5nTWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiZm9ybWF0dGluZ1wiLCB2YWx1ZTogZm9ybWF0dGluZ01hdGNoWzBdIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBub2RlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKG5vZGVSZWdleCk7XG4gICAgICAgICAgICBpZiAobm9kZU1hdGNoPy5pbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwibm9kZVwiLFxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0aW5nOiBub2RlTWF0Y2hbMV0gfHwgXCJcIixcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG5vZGVNYXRjaFsyXVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGkgKz0gbm9kZU1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAobG9vcHMgPT09IDEwMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiUGFyc2luZyBleGNlZWRlZCBzYWZlIGxvb3AgY291bnRcIik7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvb3JkaW5hdGVzQXJyYXk7XG4gICAgfVxuXG4gICAgaXNDb29yZGluYXRlKG9iajogYW55KTogb2JqIGlzIENvb3JkaW5hdGUge1xuICAgICAgICByZXR1cm4gb2JqICYmIG9iaiBpbnN0YW5jZW9mIENvb3JkaW5hdGU7XG4gICAgfVxuICAgIHRvU3RyaW5nRHJhdygpe1xuICAgICAgICBsZXQgcmVzdWx0ID0gYFxcXFxkcmF3ICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfSBgO1xuICAgICAgICB0aGlzLmNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuICAgICAgICAgICAgc3dpdGNoICh0cnVlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSBjb29yZGluYXRlIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSYmY29vcmRpbmF0ZS5tb2RlPT09XCJub2RlLWlubGluZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBjb29yZGluYXRlLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjYXNlIHR5cGVvZiBjb29yZGluYXRlPT09XCJzdHJpbmdcIjoge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz0gLygtLVxcK1xcK3wtLVxcKykvLnRlc3QoY29vcmRpbmF0ZSk/XCItLVwiOmNvb3JkaW5hdGU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPWAoJHtjb29yZGluYXRlLnRvU3RyaW5nKCl9KWBcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0ICsgXCI7XCI7XG4gICAgfVxuXG4gICAgdG9TdHJpbmdQaWMoKXtcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyBwaWMgJHt0aGlzLmZvcm1hdHRpbmcudG9TdHJpbmcoKXx8Jyd9IHthbmdsZSA9ICR7KHRoaXMuY29vcmRpbmF0ZXNbMF0gYXMgQXhpcykubmFtZX0tLSR7KHRoaXMuY29vcmRpbmF0ZXNbMV0gYXMgQXhpcykubmFtZX0tLSR7KHRoaXMuY29vcmRpbmF0ZXNbMl0gYXMgQXhpcykubmFtZX19IGA7XG4gICAgIFxuXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcbiAgICB9XG5cbiAgICB0b1N0cmluZygpIHtcbiAgICAgICAgaWYgKHRoaXMubW9kZT09PSdkcmF3JylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nRHJhdygpO1xuICAgICAgICBpZih0aGlzLm1vZGU9PT0nZHJhdy1waWMtYW5nJylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnRvU3RyaW5nUGljKClcbiAgICAgICAgXG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgRm9ybWF0VGlrempheCB7XG5cdHNvdXJjZTogc3RyaW5nO1xuICAgIHRva2VuczogQXJyYXk8VG9rZW4+PVtdO1xuICAgIC8vbWlkUG9pbnQ6IEF4aXM7XG4gICAgcHJpdmF0ZSB2aWV3QW5jaG9yczoge21heDogQXhpcyxtaW46QXhpcyxhdmVNaWRQb2ludDogQXhpc31cblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xuICAgIGRlYnVnSW5mbyA9IFwiXCI7XG4gICAgXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nfEFycmF5PFRva2VuPikge1xuICAgICAgICBpZih0eXBlb2Ygc291cmNlPT09XCJzdHJpbmdcIil7XG5cdFx0dGhpcy5zb3VyY2UgPSB0aGlzLnRpZHlUaWt6U291cmNlKHNvdXJjZSk7XG4gICAgICAgIHRoaXMudG9rZW5pemUoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHt0aGlzLnRva2Vucz1zb3VyY2V9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBzb3VyY2U9PT1cInN0cmluZ1wiJiZzb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZT1zb3VyY2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZXtcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnNvdXJjZTtcbiAgICAgICAgICAgIHRoaXMuZmluZFZpZXdBbmNob3JzKCk7XG4gICAgICAgICAgICB0aGlzLmFwcGx5UG9zdFByb2Nlc3NpbmcoKTtcblxuICAgICAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPVwiXFxuXFxudGhpcy5taWRQb2ludDpcXG5cIitKU09OLnN0cmluZ2lmeSh0aGlzLnZpZXdBbmNob3JzLG51bGwsMSkrXCJcXG5cIlxuICAgICAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPUpTT04uc3RyaW5naWZ5KHRoaXMudG9rZW5zLG51bGwsMSkrXCJcXG5cXG5cIlxuXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpO1xuICAgICAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcbiAgICAgICAgfVxuXHR9XG4gICAgXG4gICAgdGlkeVRpa3pTb3VyY2UodGlrelNvdXJjZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XG4gICAgICAgIHRpa3pTb3VyY2UgPSB0aWt6U291cmNlLnJlcGxhY2VBbGwocmVtb3ZlLCBcIlwiKTtsZXQgbGluZXMgPSB0aWt6U291cmNlLnNwbGl0KFwiXFxuXCIpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKTs7XG4gICAgfVxuXG4gICAgYXBwbHlQb3N0UHJvY2Vzc2luZygpe1xuICAgICAgICBjb25zdCBmbGF0QXhlcz1mbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XG4gICAgICAgIGZsYXRBeGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcbiAgICAgICAgICAgIGF4aXMuYWRkUXVhZHJhbnQodGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGZsYXREcmF3PWZsYXR0ZW4odGhpcy50b2tlbnMsW10sRHJhdykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIERyYXcpO1xuICAgICAgICBmbGF0RHJhdy5mb3JFYWNoKChkcmF3OiBEcmF3KSA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0ICBbaW5kZXgsIGNvb3JdIG9mIGRyYXcuY29vcmRpbmF0ZXMuZW50cmllcygpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvb3IgaW5zdGFuY2VvZiBDb29yZGluYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvb3IuZm9ybWF0dGluZz8uYWRkU3Bsb3BBbmRQb3NpdGlvbihkcmF3LmNvb3JkaW5hdGVzLGluZGV4KVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgIH1cbiAgICBnZXRDb2RlKCl7XG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5zb3VyY2U9PT1cInN0cmluZ1wiJiZ0aGlzLnNvdXJjZS5tYXRjaCgvKHVzZXBhY2thZ2V8dXNldGlremxpYnJhcnkpLykpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcm9jZXNzZWRDb2RlXG4gICAgICAgIHJldHVybiBnZXRQcmVhbWJsZSgpK3RoaXMucHJvY2Vzc2VkQ29kZStcIlxcblxcXFxlbmR7dGlrenBpY3R1cmV9XFxcXGVuZHtkb2N1bWVudH1cIjtcbiAgICB9XG4gICAgdG9rZW5pemUoKSB7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzLSwuOnxgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXG4gICAgICAgIGNvbnN0IGMgPSBTdHJpbmcucmF3YFskKF17MCwyfVske2NhfV0rWykkXXswLDJ9fFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXStcXChbJHtjYX1dK1xcKVxcJGA7XG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB3aXRoIGVzY2FwZWQgY2hhcmFjdGVycyBmb3Igc3BlY2lmaWMgbWF0Y2hpbmdcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7IC8vIENvb3JkaW5hdGUgbmFtZVxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcXFwiP1xcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcIF5dKlxcJFxcXCI/fFtcXHdcXGRcXHNcXC0sLjooISlfXFwtXFwrXFxcXF5dKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG4gICAgICAgIGNvbnN0IGYgPSBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsuJipcXHtcXH0lXFwtPD5dYDsgLy8gRm9ybWF0dGluZyB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcblxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXG4gICAgICAgIGNvbnN0IGNvb3JSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vclxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgcGljUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHBpY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc2UgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHMqXFwoKigke2NufSlcXCkqXFxzKmF0XFxzKlxcKCgke2N9KVxcKVxccypcXFsoJHtmfSopXFxdXFxzKlxceygke3R9KVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqKFxcW2xhYmVsPVxce1xcWyguKj8pXFxdOlxcXFxcXHcqXFxzKihbXFx3XFxzXSopXFx9XFxdKT9cXHMqXFwoKCR7Y259KylcXClcXHMqYXRcXHMqXFwoKCR7Y30pXFwpO2AsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzeygke3R9KX17KCR7dH0pfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZ3JpZFJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxncmlkeyhbXFxkLS5dKyl9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG1hc3NSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbWFzc1xceygke2N9KVxcfVxceygke3R9KVxcfVxceygtXFx8fFxcfHw+KXswLDF9XFx9XFx7KFtcXGQuXSopXFx9YCxcImdcIik7XG4gICAgICAgIC8vXFxwaWN7YW5jMn17YW5jMX17YW5jMH17NzVeXFxjaXJjIH17fTtcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzZSwgc3MsIG5vZGVSZWdleCwgZHJhd1JlZ2V4LCBjaXJjbGVSZWdleCwgbWFzc1JlZ2V4LCB2ZWNSZWdleCxwaWNSZWdleF07XG4gICAgICAgIGxldCBtYXRjaGVzOiBhbnlbXT1bXTtcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IChhLmluZGV4IHx8IDApIC0gKGIuaW5kZXggfHwgMCkpO1xuXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsyXSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbNF19XG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzVdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFs0XSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbMl19KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJjb29yZGluYXRlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJjb29yZGluYXRlXCIsIGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xuXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHBpY1wiKSkge1xuICAgICAgICAgICAgY29uc3QgYzE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcylcbiAgICAgICAgICAgIGNvbnN0IGMyPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzJdLHRoaXMpXG4gICAgICAgICAgICBjb25zdCBjMz1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFszXSx0aGlzKVxuXG5cbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoe21vZGU6IFwicGljLWFuZ1wiLHRva2VuczogdGhpcyxmb3JtYXR0aW5nU3RyaW5nOiBtYXRjaFs1XSxmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogXCJhbmdcIixpY1RleHQ6IG1hdGNoWzRdfSxkcmF3QXJyOiBbYzEsYzIsYzNdfSkpO1xuICAgICAgICAgIH1lbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcodW5kZWZpbmVkLG1hdGNoWzFdLG1hdGNoWzJdLCB0aGlzKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHh5YXhpc1wiKSkge1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxncmlkXCIpKSB7XG4gICAgICAgICAgICAvL3RoaXMudG9rZW5zLnB1c2goe3R5cGU6IFwiZ3JpZFwiLCByb3RhdGU6IG1hdGNoWzFdfSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXG5vZGVcIikpIHtcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzNdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX1cbiAgICAgICAgICAgIGlmIChtYXRjaFswXS5tYXRjaCgvXFxcXG5vZGVcXHMqXFwoLykpe1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzJdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsxXSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbNF19KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHsgZm9ybWF0dGluZyxvcmlnaW5hbCwgLi4ucmVzdCB9ID0gaTtcblxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIsIGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjaXJjbGVcIikpIHsvKlxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdLFxuICAgICAgICAgICAgICBjb29yZGluYXRlczogW1xuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzJdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFszXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSk7Ki9cbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJub2RlXCIsbGFiZWw6IG1hdGNoWzJdLGF4aXM6IG5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpLGZvcm1hdHRpbmc6IG5ldyBGb3JtYXR0aW5nKFwibm9kZVwiLHt0aWt6c2V0OiAnbWFzcycsYW5jaG9yOiBtYXRjaFszXSxyb3RhdGU6IG1hdGNoWzRdfSl9KSlcblxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGFuY2VyPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpO1xuICAgICAgICAgICAgY29uc3QgYXhpczE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcyk7XG4gICAgICAgICAgICBjb25zdCBub2RlPW5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGUtaW5saW5lXCIsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoJ25vZGUtaW5saW5lJyx7Y29sb3I6IFwicmVkXCJ9KX0pXG5cbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBDb29yZGluYXRlKFwibm9kZS1pbmxpbmVcIik7XG4gICAgICAgICAgICBjb25zdCBxPVthbmNlciwnLS0rJyxub2RlLGF4aXMxXVxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh7Zm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6ICd2ZWMnfSx0b2tlbnM6IHRoaXMsZHJhd0FycjogcX0pKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChtYXRjaC5pbmRleCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICBjdXJyZW50SW5kZXggPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4KSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZ2V0TWluKCl7cmV0dXJuIHRoaXMudmlld0FuY2hvcnMubWlufVxuICAgIGdldE1heCgpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1heH1cblxuICAgIGZpbmRWaWV3QW5jaG9ycygpIHtcbiAgICAgICAgY29uc3QgYXhlcyA9IGZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XG4gICAgICAgIFxuICAgICAgICBsZXQgc3VtT2ZYID0gMCwgc3VtT2ZZID0gMDtcbiAgICAgICAgbGV0IG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHk7XG4gICAgICAgIGxldCBtaW5YID0gSW5maW5pdHksIG1pblkgPSBJbmZpbml0eTtcbiAgICBcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycyA9IHtcbiAgICAgICAgICAgIG1heDogbmV3IEF4aXMoMCwgMCksXG4gICAgICAgICAgICBtaW46IG5ldyBBeGlzKDAsIDApLFxuICAgICAgICAgICAgYXZlTWlkUG9pbnQ6IG5ldyBBeGlzKDAsIDApXG4gICAgICAgIH07XG4gICAgXG4gICAgICAgIGF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xuICAgICAgICAgICAgY29uc3QgeyBjYXJ0ZXNpYW5YLCBjYXJ0ZXNpYW5ZIH0gPSBheGlzO1xuICAgIFxuICAgICAgICAgICAgLy8gVXBkYXRlIHN1bXMgZm9yIGF2ZXJhZ2UgY2FsY3VsYXRpb25cbiAgICAgICAgICAgIHN1bU9mWCArPSBjYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgc3VtT2ZZICs9IGNhcnRlc2lhblk7XG4gICAgXG4gICAgICAgICAgICAvLyBVcGRhdGUgbWF4IGFuZCBtaW4gY29vcmRpbmF0ZXNcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YID4gbWF4WCkgbWF4WCA9IGNhcnRlc2lhblg7XG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA+IG1heFkpIG1heFkgPSBjYXJ0ZXNpYW5ZO1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblggPCBtaW5YKSBtaW5YID0gY2FydGVzaWFuWDtcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5ZIDwgbWluWSkgbWluWSA9IGNhcnRlc2lhblk7XG4gICAgICAgIH0pO1xuICAgIFxuICAgICAgICBjb25zdCBsZW5ndGggPSBheGVzLmxlbmd0aCAhPT0gMCA/IGF4ZXMubGVuZ3RoIDogMTtcbiAgICBcbiAgICAgICAgLy8gU2V0IHRoZSB2aWV3QW5jaG9yc1xuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50ID0gbmV3IEF4aXMoc3VtT2ZYIC8gbGVuZ3RoLCBzdW1PZlkgLyBsZW5ndGgpO1xuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLm1heCA9IG5ldyBBeGlzKG1heFgsIG1heFkpO1xuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLm1pbiA9IG5ldyBBeGlzKG1pblgsIG1pblkpO1xuICAgIH1cbiAgICBcblxuICAgIGZpbmRPcmlnaW5hbFZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3Qgb2cgPSB0aGlzLnRva2Vucy5zbGljZSgpLnJldmVyc2UoKS5maW5kKFxuICAgICAgICAgICAgKHRva2VuOiBUb2tlbikgPT5cbiAgICAgICAgICAgICAgICAodG9rZW4gaW5zdGFuY2VvZiBDb29yZGluYXRlKSAmJiB0b2tlbi5jb29yZGluYXRlTmFtZSA9PT0gdmFsdWVcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIG9nIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSA/IG9nLmNsb25lKCkgOiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIFxuXG4gICAgdG9TdHJpbmcoKXtcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XG4gICAgICAgIGNvbnN0IGV4dHJlbWVYWT1nZXRFeHRyZW1lWFkodGhpcy50b2tlbnMpO1xuICAgICAgICB0aGlzLnRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XG5cbiAgICAgICAgICAgIGlmKHRva2VuLnRvU3RyaW5nKCkpe1xuICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPXRva2VuLnRvU3RyaW5nKClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW47XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNvZGVCbG9ja091dHB1dDtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGZsYXR0ZW4oZGF0YTogYW55LCByZXN1bHRzOiBhbnlbXSA9IFtdLCBzdG9wQ2xhc3M/OiBhbnkpOiBhbnlbXSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XG4gICAgICAgIGZsYXR0ZW4oaXRlbSwgcmVzdWx0cywgc3RvcENsYXNzKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhICE9PSBudWxsKSB7XG4gICAgICAvLyBJZiB0aGUgb2JqZWN0IGlzIGFuIGluc3RhbmNlIG9mIHRoZSBzdG9wQ2xhc3MsIGFkZCBpdCB0byByZXN1bHRzIGFuZCBzdG9wIGZsYXR0ZW5pbmdcbiAgICAgIGlmIChzdG9wQ2xhc3MgJiYgZGF0YSBpbnN0YW5jZW9mIHN0b3BDbGFzcykge1xuICAgICAgICByZXN1bHRzLnB1c2goZGF0YSk7XG4gICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgfVxuICBcbiAgICAgIC8vIEFkZCB0aGUgY3VycmVudCBvYmplY3QgdG8gcmVzdWx0c1xuICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xuICBcbiAgICAgIC8vIFJlY3Vyc2l2ZWx5IGZsYXR0ZW4gcHJvcGVydGllcyBvZiB0aGUgb2JqZWN0XG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBkYXRhKSB7XG4gICAgICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICBmbGF0dGVuKGRhdGFba2V5XSwgcmVzdWx0cywgc3RvcENsYXNzKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfVxuICBcblxuXG5cblxuXG5cbmZ1bmN0aW9uIGRpc3NlY3RYWWF4aXMobWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkpIHtcbiAgICBsZXQgWG5vZGU6UmVnRXhwTWF0Y2hBcnJheXxzdHJpbmc9XCJcIiwgWW5vZGU6UmVnRXhwTWF0Y2hBcnJheXxzdHJpbmc9XCJcIjtcblxuICAgIGlmIChtYXRjaFsxXSAmJiBtYXRjaFsyXSkge1xuICAgICAgICBYbm9kZSA9IG1hdGNoWzFdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XG4gICAgICAgIFlub2RlID0gbWF0Y2hbMl0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcbiAgICAgICAgWG5vZGU9WG5vZGVbMF0uc3Vic3RyaW5nKDEsWG5vZGUubGVuZ3RoKVxuICAgICAgICBZbm9kZT1Zbm9kZVswXS5zdWJzdHJpbmcoMSxZbm9kZS5sZW5ndGgpXG4gICAgfVxuICAgIFxuICAgIHJldHVybiB7XG4gICAgICAgIHR5cGU6IFwieHlheGlzXCIsXG4gICAgICAgIFhmb3JtYXR0aW5nOiBtYXRjaFsxXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXG4gICAgICAgIFlmb3JtYXR0aW5nOiBtYXRjaFsyXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXG4gICAgICAgIHhEaXJlY3Rpb246IG1hdGNoWzFdICYmIC8tPi8udGVzdChtYXRjaFsxXSkgPyBcImxlZnRcIiA6IFwicmlnaHRcIixcbiAgICAgICAgeURpcmVjdGlvbjogbWF0Y2hbMl0gJiYgLy0+Ly50ZXN0KG1hdGNoWzJdKSA/IFwiZG93blwiIDogXCJ1cFwiLFxuICAgICAgICBYbm9kZTogWG5vZGUsXG4gICAgICAgIFlub2RlOiBZbm9kZSxcbiAgICB9O1xufVxuXG5cblxuXG5cblxuXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcbmxldCBtYXhYID0gLUluZmluaXR5O1xubGV0IG1heFkgPSAtSW5maW5pdHk7XG5sZXQgbWluWCA9IEluZmluaXR5O1xubGV0IG1pblkgPSBJbmZpbml0eTtcblxudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcbiAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcbiAgICBpZiAodG9rZW4uWCA+IG1heFgpIG1heFggPSB0b2tlbi5YO1xuICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XG5cbiAgICBpZiAodG9rZW4uWSA+IG1heFkpIG1heFkgPSB0b2tlbi5ZO1xuICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XG4gICAgfVxufSk7XG5cbnJldHVybiB7XG4gICAgbWF4WCxtYXhZLG1pblgsbWluWSxcbn07XG59XG5cblxuXG5cbi8qXG5mdW5jdGlvbiBnZW5lcmF0ZUZvcm1hdHRpbmcoY29vcmRpbmF0ZTogQ29vcmRpbmF0ZSl7XG4gICAgaWYgKHR5cGVvZiBjb29yZGluYXRlLmxhYmVsICE9PSBcInN0cmluZ1wiKXsgcmV0dXJuIFwiXCI7IH1cbiAgICBjb25zdCBmb3JtYXR0aW5nID0gY29vcmRpbmF0ZS5mb3JtYXR0aW5nPy5zcGxpdChcIixcIikgfHwgW107XG4gICAgaWYgKGZvcm1hdHRpbmcuc29tZSgodmFsdWU6IHN0cmluZykgPT4gLyhhYm92ZXxiZWxvd3xsZWZ0fHJpZ2h0KS8udGVzdCh2YWx1ZSkpKSB7XG4gICAgICAgIHJldHVybiBjb29yZGluYXRlLmZvcm1hdHRpbmc7XG4gICAgfVxuICAgIGlmKGZvcm1hdHRpbmcubGVuZ3RoPjAmJiFmb3JtYXR0aW5nW2Zvcm1hdHRpbmcubGVuZ3RoLTFdLmVuZHNXaXRoKFwiLFwiKSl7Zm9ybWF0dGluZy5wdXNoKFwiLFwiKX1cbiAgICBzd2l0Y2goY29vcmRpbmF0ZS5xdWFkcmFudCl7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgcmlnaHQsIFwiKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgZm9ybWF0dGluZy5wdXNoKFwiYWJvdmUgbGVmdCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAzOlxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyBsZWZ0LCBcIik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDQ6IFxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJiZWxvdyByaWdodCwgXCIpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgcmV0dXJuIGZvcm1hdHRpbmcuam9pbihcIlwiKTtcbn1cbiovXG5cblxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoKTpzdHJpbmd7XG4gICAgY29uc3QgYW5nPVwiXFxcXHRpa3pzZXR7YW5nLy5zdHlsZSAyIGFyZ3M9e2ZpbGw9YmxhY2shNTAsb3BhY2l0eT0wLjUsdGV4dCBvcGFjaXR5PTAuOSxkcmF3PW9yYW5nZSw8LT4sYW5nbGUgZWNjZW50cmljaXR5PSMxLGFuZ2xlIHJhZGl1cz0jMmNtLHRleHQ9b3JhbmdlLGZvbnQ9XFxcXGxhcmdlfSxhbmcvLmRlZmF1bHQ9ezEuNn17MC41fX1cIlxuICBcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxuICBcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxuICAgIGNvbnN0IHNwcmluZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxzcHJpbmd9WzRde1xcXFx0aWt6bWF0aHtjb29yZGluYXRlIFxcXFxzdGFydCwgXFxcXGRvbmU7XFxcXHN0YXJ0ID0gKCMxKTtcXFxcZG9uZSA9ICgjMik7fVxcXFxkcmF3W3RoaWNrXSAoJChcXFxcc3RhcnQpICsgKC0xLjUsMCkkKSAtLSsrKDMsMCk7XFxcXGRyYXcgKFxcXFxzdGFydCkgLS0rICgwLC0wLjI1Y20pO1xcXFxkcmF3ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4KzBjbSxcXFxcZG9uZXkrMC4yNWNtKSQpLS0rKDAsLTAuMjUpO1xcXFxkcmF3W2RlY29yYXRpb249e2FzcGVjdD0wLjMsIHNlZ21lbnQgbGVuZ3RoPTMsIGFtcGxpdHVkZT0ybW0sY29pbCx9LGRlY29yYXRlXSAoXFxcXHN0YXJ0eCxcXFxcc3RhcnR5LTAuMjVjbSkgLS0oJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkrMC4yNWNtKSQpbm9kZVttaWR3YXkscmlnaHQ9MC4yNWNtLGJsYWNrXXsjNH07XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSkkKXsjM307fVwiXG4gICAgXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXG4gICAgXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXG4gICAgLy9jb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxuICAgIGNvbnN0IGR2ZWN0b3I9XCJcXFxcbmV3Y29tbWFuZHtcXFxcZHZlY3Rvcn1bMl17XFxcXGNvb3JkaW5hdGUgKHRlbXAxKSBhdCAoJCgwLDAgLXwgIzEpJCk7XFxcXGNvb3JkaW5hdGUgKHRlbXAyKSBhdCAoJCgwLDAgfC0gIzEpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MC43cHQsIzJdICgjMSktLSh0ZW1wMSkoIzEpLS0odGVtcDIpO31cIlxuICAgIFxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxuICAgIGNvbnN0IHByZWFtYmxlPVwiXFxcXHVzZXBhY2thZ2V7cGdmcGxvdHMsaWZ0aGVufVxcXFx1c2V0aWt6bGlicmFyeXthcnJvd3MubWV0YSxhbmdsZXMscXVvdGVzLHBvc2l0aW9uaW5nLCBjYWxjLCBpbnRlcnNlY3Rpb25zLGRlY29yYXRpb25zLm1hcmtpbmdzLG1hdGgsc3B5LG1hdHJpeCxwYXR0ZXJucyxzbmFrZXMsZGVjb3JhdGlvbnMucGF0aHJlcGxhY2luZyxkZWNvcmF0aW9ucy5wYXRobW9ycGhpbmcscGF0dGVybnMsc2hhZG93cyxzaGFwZXMuc3ltYm9sc31cIlxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcbn0iXX0=