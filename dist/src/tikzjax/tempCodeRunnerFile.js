import { MarkdownView, WorkspaceWindow } from "obsidian";
import { optimize } from "./svgo.browser.js";
// @ts-ignore
import tikzjaxJs from "inline:./tikzjax.js";
import { cartesianToPolar, findIntersectionPoint, findSlope, polarToCartesian, toNumber } from "src/mathUtilities.js";
import { DebugModal } from "src/desplyModals.js";
import { FormatTikzjax } from "./interpret/tokenizeTikzjax.js";
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
    coordinates;
    constructor(mode, formatting, draw, tokens) {
    }
    createFromArray(arr) {
    }
    fillCoordinates(schematic, tokens) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcENvZGVSdW5uZXJGaWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL3Rpa3pqYXgvdGVtcENvZGVSdW5uZXJGaWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sRUFBTyxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRTlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUM3QyxhQUFhO0FBQ2IsT0FBTyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDNUMsT0FBTyxFQUFFLGdCQUFnQixFQUFFLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUN0SCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDakQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUl6RCxNQUFNLE9BQU8sT0FBTztJQUNoQixHQUFHLENBQU07SUFDVCxNQUFNLENBQWE7SUFDbkIsVUFBVSxDQUFzQjtJQUVoQyxZQUFZLEdBQVEsRUFBQyxNQUFrQjtRQUNyQyxJQUFJLENBQUMsR0FBRyxHQUFDLEdBQUcsQ0FBQztRQUNiLElBQUksQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLE1BQU0sR0FBQyxNQUFNLENBQUM7SUFDckIsQ0FBQztJQUVELFdBQVc7UUFDVCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLEdBQUcsRUFBRTtZQUMzQyxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxJ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O0FBV0QsU0FBUyxhQUFhLENBQUMsS0FBdUI7SUFDMUMsSUFBSSxLQUFLLEdBQXlCLEVBQUUsRUFBRSxLQUFLLEdBQXlCLEVBQUUsQ0FBQztJQUV2RSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUU7UUFDdEIsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsSUFBRSxFQUFFLENBQUM7UUFDcEQsS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsSUFBRSxFQUFFLENBQUM7UUFDcEQsS0FBSyxHQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN4QyxLQUFLLEdBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFBO0tBQzNDO0lBRUQsT0FBTztRQUNILElBQUksRUFBRSxRQUFRO1FBQ2QsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsd0JBQXdCLEVBQUUsRUFBRSxDQUFDO1FBQzVELFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLHdCQUF3QixFQUFFLEVBQUUsQ0FBQztRQUM1RCxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTztRQUM5RCxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsSUFBSTtRQUMzRCxLQUFLLEVBQUUsS0FBSztRQUNaLEtBQUssRUFBRSxLQUFLO0tBQ2YsQ0FBQztBQUNOLENBQUM7QUFhRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBd0JFIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBNYXJrZG93blZpZXcsIFdvcmtzcGFjZVdpbmRvdyB9IGZyb20gXCJvYnNpZGlhblwiO1xyXG5pbXBvcnQgTWF0aFBsdWdpbiBmcm9tIFwic3JjL21haW5cIjtcclxuaW1wb3J0IHsgb3B0aW1pemUgfSBmcm9tIFwiLi9zdmdvLmJyb3dzZXIuanNcIjtcclxuLy8gQHRzLWlnbm9yZVxyXG5pbXBvcnQgdGlrempheEpzIGZyb20gXCJpbmxpbmU6Li90aWt6amF4LmpzXCI7XHJcbmltcG9ydCB7IGNhcnRlc2lhblRvUG9sYXIsIGZpbmRJbnRlcnNlY3Rpb25Qb2ludCwgZmluZFNsb3BlLCBwb2xhclRvQ2FydGVzaWFuLCB0b051bWJlciB9IGZyb20gXCJzcmMvbWF0aFV0aWxpdGllcy5qc1wiO1xyXG5pbXBvcnQgeyBEZWJ1Z01vZGFsIH0gZnJvbSBcInNyYy9kZXNwbHlNb2RhbHMuanNcIjtcclxuaW1wb3J0IHsgRm9ybWF0VGlrempheCB9IGZyb20gXCIuL2ludGVycHJldC90b2tlbml6ZVRpa3pqYXguanNcIjtcclxuaW1wb3J0IHsgbWFwQnJhY2tldHMgfSBmcm9tIFwic3JjL3V0aWxzL3Rva2VuVXRlbnNpbHMuanNcIjtcclxuXHJcblxyXG5cclxuZXhwb3J0IGNsYXNzIFRpa3pqYXgge1xyXG4gICAgYXBwOiBBcHA7XHJcbiAgICBwbHVnaW46IE1hdGhQbHVnaW47XHJcbiAgICBhY3RpdmVWaWV3OiBNYXJrZG93blZpZXcgfCBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGFwcDogQXBwLHBsdWdpbjogTWF0aFBsdWdpbikge1xyXG4gICAgICB0aGlzLmFwcD1hcHA7XHJcbiAgICAgIHRoaXMuYWN0aXZlVmlldyA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVWaWV3T2ZUeXBlKE1hcmtkb3duVmlldyk7XHJcbiAgICAgIHRoaXMucGx1Z2luPXBsdWdpbjtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmVhZHlMYXlvdXQoKXtcclxuICAgICAgdGhpcy5wbHVnaW4uYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcclxuICAgICAgICB0aGlzLmxvYWRUaWtaSmF4QWxsV2luZG93cygpO1xyXG4gICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAud29ya3NwYWNlLm9uKFwid2luZG93LW9wZW5cIiwgKHdpbiwgd2luZG93KSA9PiB7XHJcbiAgICAgICAgICB0aGlzLmxvYWRUaWtaSmF4KHdpbmRvdy5kb2N1bWVudCk7XHJcbiAgICAgICAgfSkpO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgbG9hZFRpa1pKYXgoZG9jOiBEb2N1bWVudCkge1xyXG4gICAgICAgIGNvbnN0IHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xyXG4gICAgICAgIHMuaWQgPSBcInRpa3pqYXhcIjtcclxuICAgICAgICBzLnR5cGUgPSBcInRleHQvamF2YXNjcmlwdFwiO1xyXG4gICAgICAgIHMuaW5uZXJUZXh0ID0gdGlrempheEpzO1xyXG4gICAgICAgIGRvYy5ib2R5LmFwcGVuZENoaWxkKHMpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKHMpXHJcbiAgICAgICAgZG9jLmFkZEV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XHJcbiAgICB9XHJcbiAgXHJcbiAgICB1bmxvYWRUaWtaSmF4KGRvYzogRG9jdW1lbnQpIHtcclxuICAgICAgICBjb25zdCBzID0gZG9jLmdldEVsZW1lbnRCeUlkKFwidGlrempheFwiKTtcclxuICAgICAgICBzPy5yZW1vdmUoKTtcclxuXHJcbiAgICAgICAgZG9jLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0aWt6amF4LWxvYWQtZmluaXNoZWRcIiwgdGhpcy5wb3N0UHJvY2Vzc1N2Zyk7XHJcbiAgICB9XHJcbiAgXHJcbiAgICBsb2FkVGlrWkpheEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB3aW5kb3cgb2YgdGhpcy5nZXRBbGxXaW5kb3dzKCkpIHtcclxuICAgICAgICAgICAgdGhpcy5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICBcclxuICAgIHVubG9hZFRpa1pKYXhBbGxXaW5kb3dzKCkge1xyXG4gICAgICAgIGZvciAoY29uc3Qgd2luZG93IG9mIHRoaXMuZ2V0QWxsV2luZG93cygpKSB7XHJcbiAgICAgICAgICAgIHRoaXMudW5sb2FkVGlrWkpheCh3aW5kb3cuZG9jdW1lbnQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICBcclxuICAgIGdldEFsbFdpbmRvd3MoKSB7XHJcbiAgICAgICAgY29uc3Qgd2luZG93cyA9IFtdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIHB1c2ggdGhlIG1haW4gd2luZG93J3Mgcm9vdCBzcGxpdCB0byB0aGUgbGlzdFxyXG4gICAgICAgIHdpbmRvd3MucHVzaCh0aGlzLmFwcC53b3Jrc3BhY2Uucm9vdFNwbGl0Lndpbik7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQHRzLWlnbm9yZSBmbG9hdGluZ1NwbGl0IGlzIHVuZG9jdW1lbnRlZFxyXG4gICAgICAgIGNvbnN0IGZsb2F0aW5nU3BsaXQgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZmxvYXRpbmdTcGxpdDtcclxuICAgICAgICBmbG9hdGluZ1NwbGl0LmNoaWxkcmVuLmZvckVhY2goKGNoaWxkOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgLy8gaWYgdGhpcyBpcyBhIHdpbmRvdywgcHVzaCBpdCB0byB0aGUgbGlzdCBcclxuICAgICAgICAgICAgaWYgKGNoaWxkIGluc3RhbmNlb2YgV29ya3NwYWNlV2luZG93KSB7XHJcbiAgICAgICAgICAgICAgICB3aW5kb3dzLnB1c2goY2hpbGQud2luKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICByZXR1cm4gd2luZG93cztcclxuICAgIH1cclxuICBcclxuICBcclxuICAgIHJlZ2lzdGVyVGlrekNvZGVCbG9jaygpIHtcclxuICAgICAgICAgIHRoaXMucGx1Z2luLnJlZ2lzdGVyTWFya2Rvd25Db2RlQmxvY2tQcm9jZXNzb3IoXCJ0aWt6XCIsIChzb3VyY2UsIGVsLCBjdHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaWNvbiA9IE9iamVjdC5hc3NpZ24oZWwuY3JlYXRlRWwoXCJkaXZcIiksIHtcclxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogXCJtYXRoLWRlYnVnLWljb25cIixcclxuICAgICAgICAgICAgICAgIHRleHRDb250ZW50OiBcIvCfm4hcIixcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRyeXtcclxuICAgICAgICAgICAgY29uc3Qgc2NyaXB0ID0gZWwuY3JlYXRlRWwoXCJzY3JpcHRcIik7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIFwidGV4dC90aWt6XCIpO1xyXG4gICAgICAgICAgICBzY3JpcHQuc2V0QXR0cmlidXRlKFwiZGF0YS1zaG93LWNvbnNvbGVcIiwgXCJ0cnVlXCIpO1xyXG4gICAgICAgICAgICBjb25zdCB0aWt6amF4PW5ldyBGb3JtYXRUaWt6amF4KHNvdXJjZSk7XHJcbiAgICAgICAgICAgIGljb24ub25jbGljayA9ICgpID0+IG5ldyBEZWJ1Z01vZGFsKHRoaXMuYXBwLHRpa3pqYXguZGVidWdJbmZvKS5vcGVuKCk7XHJcbiAgICAgICAgICAgIHNjcmlwdC5zZXRUZXh0KHRpa3pqYXguZ2V0Q29kZSgpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXRjaChlKXtcclxuICAgICAgICAgICAgICAgIGVsLmlubmVySFRNTCA9IFwiXCI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlcnJvckRpc3BsYXkgPSBlbC5jcmVhdGVFbChcImRpdlwiLCB7IGNsczogXCJtYXRoLWVycm9yLWxpbmVcIiB9KTtcclxuICAgICAgICAgICAgICAgIGVycm9yRGlzcGxheS5pbm5lclRleHQgPSBgRXJyb3I6ICR7ZS5tZXNzYWdlfWA7XHJcbiAgICAgICAgICAgICAgICBlcnJvckRpc3BsYXkuY2xhc3NMaXN0LmFkZChcImVycm9yLXRleHRcIik7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiVGlrWiBQcm9jZXNzaW5nIEVycm9yOlwiLCBlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgXHJcbiAgICAgIGFkZFN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvLnB1c2goe25hbWU6IFwiVGlrelwiLCBtaW1lOiBcInRleHQveC1sYXRleFwiLCBtb2RlOiBcInN0ZXhcIn0pO1xyXG4gICAgICB9XHJcbiAgXHJcbiAgICAgIHJlbW92ZVN5bnRheEhpZ2hsaWdodGluZygpIHtcclxuICAgICAgICAgIC8vIEB0cy1pZ25vcmVcclxuICAgICAgICAgIHdpbmRvdy5Db2RlTWlycm9yLm1vZGVJbmZvID0gd2luZG93LkNvZGVNaXJyb3IubW9kZUluZm8uZmlsdGVyKGVsID0+IGVsLm5hbWUgIT0gXCJUaWt6XCIpO1xyXG4gICAgICB9XHJcblxyXG4gIFxyXG4gICAgICBjb2xvclNWR2luRGFya01vZGUoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICBzdmcgPSBzdmcucmVwbGFjZUFsbCgvKFwiIzAwMFwifFwiYmxhY2tcIikvZywgXCJcXFwiY3VycmVudENvbG9yXFxcIlwiKVxyXG4gICAgICAgICAgICAgICAgLnJlcGxhY2VBbGwoLyhcIiNmZmZcInxcIndoaXRlXCIpL2csIFwiXFxcInZhcigtLWJhY2tncm91bmQtcHJpbWFyeSlcXFwiXCIpO1xyXG4gICAgICAgIHJldHVybiBzdmc7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgb3B0aW1pemVTVkcoc3ZnOiBzdHJpbmcpIHtcclxuICAgICAgICAgIHJldHVybiBvcHRpbWl6ZShzdmcsIHtwbHVnaW5zOlxyXG4gICAgICAgICAgICAgIFtcclxuICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgICAgbmFtZTogXCJwcmVzZXQtZGVmYXVsdFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFudXBJRHM6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgXVxyXG4gICAgICAgICAgLy8gQHRzLWlnbm9yZVxyXG4gICAgICAgICAgfSk/LmRhdGE7XHJcbiAgICAgIH1cclxuICBcclxuICBcclxuICAgICAgcG9zdFByb2Nlc3NTdmcgPSAoZTogRXZlbnQpID0+IHtcclxuICBcclxuICAgICAgICAgIGNvbnN0IHN2Z0VsID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XHJcbiAgICAgICAgICBsZXQgc3ZnID0gc3ZnRWwub3V0ZXJIVE1MO1xyXG4gIFxyXG4gICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnNldHRpbmdzLmludmVydENvbG9yc0luRGFya01vZGUpIHtcclxuICAgICAgICAgICAgc3ZnID0gdGhpcy5jb2xvclNWR2luRGFya01vZGUoc3ZnKTtcclxuICAgICAgICAgIH1cclxuICBcclxuICAgICAgICAgIHN2ZyA9IHRoaXMub3B0aW1pemVTVkcoc3ZnKTtcclxuICBcclxuICAgICAgICAgIHN2Z0VsLm91dGVySFRNTCA9IHN2ZztcclxuICAgIH1cclxufVxyXG5leHBvcnQgY29uc3QgYXJyVG9SZWdleFN0cmluZyA9IChhcnI6IEFycmF5PHN0cmluZz4pID0+ICcoJyArIGFyci5qb2luKCd8JykgKyAnKSc7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVnRXhwKHBhdHRlcm46IHN0cmluZyB8IFJlZ0V4cCB8IEFycmF5PHN0cmluZz4sIGZsYWdzOiBzdHJpbmcgPSAnJyk6IFJlZ0V4cCB7XHJcbiAgICBpZiAocGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkge1xyXG4gICAgICAgIHBhdHRlcm4gPSBwYXR0ZXJuLnNvdXJjZTtcclxuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwYXR0ZXJuKSkge1xyXG4gICAgICAgIHBhdHRlcm4gPSBhcnJUb1JlZ2V4U3RyaW5nKHBhdHRlcm4pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENyZWF0ZSBhbmQgcmV0dXJuIHRoZSBSZWdFeHBcclxuICAgIHJldHVybiBuZXcgUmVnRXhwKFN0cmluZy5yYXdgJHtwYXR0ZXJufWAsIGZsYWdzKTtcclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIGdldFJlZ2V4KCl7XHJcbiAgICBjb25zdCBiYXNpYyA9IFN0cmluZy5yYXdgW1xcd1xcZFxccy0sLjpdYDtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgYmFzaWM6IGJhc2ljLFxyXG4gICAgICAgIG1lcmdlOiBTdHJpbmcucmF3YC1cXHx8XFx8LXwhW1xcZC5dKyF8XFwrfC1gLFxyXG4gICAgICAgIC8vY29vcmRpbmF0ZTogbmV3IFJlZ0V4cChTdHJpbmcucmF3YCgke2Jhc2ljfSt8MSlgKSxcclxuICAgICAgICBjb29yZGluYXRlTmFtZTogU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gLFxyXG4gICAgICAgIHRleHQ6IFN0cmluZy5yYXdgW1xcd1xccy0sLjonXFwkXFwoIVxcKV8rXFxcXHt9PV1gLFxyXG4gICAgICAgIGZvcm1hdHRpbmc6IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOyYqe30oKSUtPD5dYFxyXG4gICAgfTtcclxufVxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuaW50ZXJmYWNlIHRva2VuICB7XHJcbiAgICBYPzogbnVtYmVyO1xyXG4gICAgWT86IG51bWJlcjtcclxuICAgIHR5cGU/OiBzdHJpbmc7XHJcbiAgICBjb29yZGluYXRlTmFtZT86IHN0cmluZztcclxuICAgIGNvb3JkaW5hdGVzPzogYW55O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXM6IEFycmF5PEF4aXMgfCBzdHJpbmc+LCBpbmRleDogbnVtYmVyKTogeyBiZWZvcmU6IG51bWJlciwgYWZ0ZXI6IG51bWJlciB9IHtcclxuICAgIFxyXG4gICAgbGV0IGJlZm9yZUluZGV4ID0gYXhlcy5zbGljZSgwLCBpbmRleCkuZmluZExhc3RJbmRleCgoYXhpczogYW55KSA9PiBheGlzIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICBsZXQgYWZ0ZXJJbmRleCA9IGF4ZXMuc2xpY2UoaW5kZXggKyAxKS5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xyXG5cclxuICAgIC8vIEFkanVzdCBgYWZ0ZXJJbmRleGAgc2luY2Ugd2Ugc2xpY2VkIGZyb20gYGluZGV4ICsgMWBcclxuICAgIGlmIChhZnRlckluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIGFmdGVySW5kZXggKz0gaW5kZXggKyAxO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFdyYXAgYXJvdW5kIGlmIG5vdCBmb3VuZFxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIGJlZm9yZUluZGV4ID0gYXhlcy5maW5kTGFzdEluZGV4KChheGlzOiBhbnkpID0+IGF4aXMgaW5zdGFuY2VvZiBBeGlzKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoYWZ0ZXJJbmRleCA9PT0gLTEpIHtcclxuICAgICAgICBhZnRlckluZGV4ID0gYXhlcy5maW5kSW5kZXgoKGF4aXM6IGFueSkgPT4gYXhpcyBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgfVxyXG4gICAgaWYgKGJlZm9yZUluZGV4ID09PSAtMSB8fCBhZnRlckluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgdmFsaWQgQXhpcyBvYmplY3RzLlwiKTtcclxuICAgIH1cclxuICAgIGlmIChiZWZvcmVJbmRleCA9PT0gYWZ0ZXJJbmRleCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIlByYWlzZWQgYXhpcyBhcyBzYW1lIHRva2VuXCIpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHsgYmVmb3JlOiBiZWZvcmVJbmRleCwgYWZ0ZXI6IGFmdGVySW5kZXggfTtcclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBBeGlzIHtcclxuICAgIGNhcnRlc2lhblg6IG51bWJlcjtcclxuICAgIGNhcnRlc2lhblk6IG51bWJlcjtcclxuICAgIHBvbGFyQW5nbGU6IG51bWJlcjtcclxuICAgIHBvbGFyTGVuZ3RoOiBudW1iZXI7XHJcbiAgICBuYW1lPzogc3RyaW5nO1xyXG4gICAgcXVhZHJhbnQ/OiBudW1iZXI7XHJcblxyXG4gICAgY29uc3RydWN0b3IoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIsbmFtZT86IHN0cmluZykge1xyXG4gICAgICAgIGlmIChjYXJ0ZXNpYW5YICE9PSB1bmRlZmluZWQpIHRoaXMuY2FydGVzaWFuWCA9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgaWYgKGNhcnRlc2lhblkgIT09IHVuZGVmaW5lZCkgdGhpcy5jYXJ0ZXNpYW5ZID0gY2FydGVzaWFuWTtcclxuICAgICAgICBpZiAocG9sYXJMZW5ndGggIT09IHVuZGVmaW5lZCkgdGhpcy5wb2xhckxlbmd0aCA9IHBvbGFyTGVuZ3RoO1xyXG4gICAgICAgIGlmIChwb2xhckFuZ2xlICE9PSB1bmRlZmluZWQpIHRoaXMucG9sYXJBbmdsZSA9IHBvbGFyQW5nbGU7XHJcbiAgICAgICAgdGhpcy5uYW1lPW5hbWVcclxuICAgIH1cclxuICAgIFxyXG4gICAgY2xvbmUoKTogQXhpcyB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBBeGlzKHRoaXMuY2FydGVzaWFuWCwgdGhpcy5jYXJ0ZXNpYW5ZLHRoaXMucG9sYXJMZW5ndGgsdGhpcy5wb2xhckFuZ2xlLHRoaXMubmFtZSk7XHJcbiAgICB9XHJcbiAgICBwYXJzZUlucHV0KGlucHV0OiBhbnkpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhpbnB1dCk7XHJcbiAgICAgICAgY29uc3QgYXhlcz1bXVxyXG4gICAgICAgIGNvbnN0IGJyYWNrZXRNYXAgPSBtYXBCcmFja2V0cygnUGFyZW50aGVzZXNfb3BlbicsIGlucHV0KTtcclxuICAgICAgICBheGVzLnB1c2godGhpcy5wcm9jZXNzSW5kaXZpZHVhbChpbnB1dCkpO1xyXG4gICAgICAgICAgICBpZihheGVzLmxlbmd0aD09PTEpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYXhlc1swXVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwcm9jZXNzSW5kaXZpZHVhbChpbnB1dDogYW55KSB7XHJcbiAgICAgICAgbGV0IGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgIGNvbnN0IGlzQ2FydGVzaWFuID0gaW5wdXQuc29tZSgodG9rZW46IGFueSkgPT4gdG9rZW4ubmFtZSA9PT0gJ0NvbW1hJyk7XHJcbiAgICAgICAgaW5wdXQgPSBpbnB1dC5maWx0ZXIoKHRva2VuOiBhbnkpID0+IHRva2VuLnR5cGUgIT09ICdTeW50YXgnKTtcclxuICAgICAgICBpZiAoaXNDYXJ0ZXNpYW4gJiYgaW5wdXQubGVuZ3RoID09PSAyKSB7XHJcbiAgICAgICAgICAgIGF4aXMuY2FydGVzaWFuWCA9IGlucHV0WzBdLnZhbHVlO1xyXG4gICAgICAgICAgICBheGlzLmNhcnRlc2lhblkgPSBpbnB1dFsxXS52YWx1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGF4aXM7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICB1bml2ZXJzYWwoY29vcmRpbmF0ZTogc3RyaW5nLCB0b2tlbnM/OiBGb3JtYXRUaWt6amF4LGFuY2hvckFycj86IGFueSxhbmNob3I/OiBzdHJpbmcpOiBBeGlzIHtcclxuICAgICAgICBjb25zdCBtYXRjaGVzPXRoaXMuZ2V0Q29vcmRpbmF0ZU1hdGNoZXMoY29vcmRpbmF0ZSk7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZUFycjogQXJyYXk8QXhpc3xzdHJpbmc+ID0gW107XHJcbiAgICAgICAgbWF0Y2hlcy5mb3JFYWNoKChtYXRjaDogYW55LGluZGV4OiBudW1iZXIpID0+IHtcclxuICAgICAgICAgICAgbWF0Y2g9bWF0Y2guZnVsbE1hdGNoO1xyXG4gICAgICAgICAgICBsZXQgYXhpczogQXhpc3x1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIHN3aXRjaCAodHJ1ZSkge1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvLC8udGVzdChtYXRjaCk6XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcyA9IG5ldyBBeGlzKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYXhpcy5hZGRDYXJ0ZXNpYW4obWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGNhc2UgLzovLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMgPSBuZXcgQXhpcygpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMuYWRkUG9sYXIobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMucG9sYXJUb0NhcnRlc2lhbigpXHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKGF4aXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAvIVtcXGQuXSshLy50ZXN0KG1hdGNoKTpcclxuICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRlQXJyLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgY2FzZSAoL1tcXGRcXHddKy8pLnRlc3QobWF0Y2gpOlxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnMpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF4aXMgPSB0b2tlbnMuZmluZE9yaWdpbmFsVmFsdWUobWF0Y2gpPy5heGlzO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgdGhyb3cgbmV3IEVycm9yKGBUcmllZCB0byBmaW5kIG9yaWdpbmFsIGNvb3JkaW5hdGUgdmFsdWUgd2hpbGUgbm90IGJlaW5nIHByb3ZpZGVkIHdpdGggdG9rZW5zYCk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGF4aXMgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYENvdWxkbid0IGZpbmQgdGhlIGNvb3JkaW5hdGUgJHttYXRjaH0gZnJvbSAke2Nvb3JkaW5hdGV9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGF4aXMubmFtZT1tYXRjaFxyXG4gICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVBcnIucHVzaChheGlzKTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICAgICAgY29vcmRpbmF0ZUFyci5wdXNoKG1hdGNoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMubWVyZ2VBeGlzKGNvb3JkaW5hdGVBcnIpXHJcblxyXG4gICAgICAgIGlmKGFuY2hvckFyciYmYW5jaG9yJiZhbmNob3IubWF0Y2goLygtLVxcK3wtLVxcK1xcKykvKSl7XHJcbiAgICAgICAgICAgIGxldCBhOiBBeGlzXHJcbiAgICAgICAgICAgIGlmIChhbmNob3IubWF0Y2goLygtLVxcKykvKSl7XHJcbiAgICAgICAgICAgICAgICBhPWFuY2hvckFyci5maW5kKChjb29yOiBhbnkpPT4gY29vciBpbnN0YW5jZW9mIEF4aXMpXHJcbiAgICAgICAgICAgIH1lbHNle1xyXG4gICAgICAgICAgICAgICAgYT1hbmNob3JBcnIuZmluZExhc3QoKGNvb3I6IGFueSk9PiBjb29yIGluc3RhbmNlb2YgQXhpcylcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB0aGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYSxcImFkZGl0aW9uXCIpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIG1lcmdlQXhpcyhheGVzOiBBcnJheTxBeGlzIHwgc3RyaW5nPikge1xyXG4gICAgICAgIGlmICghYXhlcy5zb21lKChheGlzOiBhbnkpID0+IHR5cGVvZiBheGlzID09PSBcInN0cmluZ1wiKSkge1xyXG4gICAgICAgICAgICBPYmplY3QuYXNzaWduKHRoaXMsIChheGVzWzBdIGFzIEF4aXMpLmNsb25lKCkpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGF4aXMgb2YgYXhlcykge1xyXG4gICAgICAgICAgICBpZih0eXBlb2YgYXhpcyA9PT0gXCJzdHJpbmdcIil7Y29udGludWU7fVxyXG4gICAgICAgICAgICBheGlzLm5hbWU9dW5kZWZpbmVkXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYXhlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50ID0gYXhlc1tpXTtcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcclxuICAgICAgICAgICAgY29uc3Qgc2lkZXMgPSBmaW5kQmVmb3JlQWZ0ZXJBeGlzKGF4ZXMsIGkpO1xyXG4gICAgICAgICAgICBjb25zdCBiZWZvcmVBeGlzID0gYXhlc1tzaWRlcy5iZWZvcmVdIGFzIEF4aXM7XHJcbiAgICAgICAgICAgIGNvbnN0IGFmdGVyQXhpcyA9IGF4ZXNbc2lkZXMuYWZ0ZXJdIGFzIEF4aXM7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZXQgIG1hdGNoID0gY3VycmVudC5tYXRjaCgvXlxcKyQvKTtcclxuICAgICAgICAgICAgbGV0IG1vZGUsbW9kaWZpZXJzO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpe1xyXG4gICAgICAgICAgICAgICAgbW9kZSA9IFwiYWRkaXRpb25cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL14tXFx8JC8pXHJcbiAgICAgICAgICAgIGlmKCFtb2RlJiZtYXRjaCl7XHJcbiAgICAgICAgICAgICAgICBtb2RlID0gXCJyaWdodFByb2plY3Rpb25cIlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hdGNoPWN1cnJlbnQubWF0Y2goL15cXCEoW1xcZC5dKylcXCEkLylcclxuICAgICAgICAgICAgaWYoIW1vZGUmJm1hdGNoKXtcclxuICAgICAgICAgICAgICAgIG1vZGUgPSBcImludGVybmFsUG9pbnRcIlxyXG4gICAgICAgICAgICAgICAgbW9kaWZpZXJzPXRvTnVtYmVyKG1hdGNoWzFdKVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZihtb2RlKXtcclxuICAgICAgICAgICAgICAgIGF4ZXMuc3BsaWNlKHNpZGVzLmJlZm9yZSwgc2lkZXMuYWZ0ZXIgLSBzaWRlcy5iZWZvcmUgKyAxLCBiZWZvcmVBeGlzLmNvbXBsZXhDYXJ0ZXNpYW5BZGQoYWZ0ZXJBeGlzLG1vZGUsbW9kaWZpZXJzKSk7XHJcbiAgICAgICAgICAgICAgICBpID0gc2lkZXMuYmVmb3JlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGF4ZXMubGVuZ3RoID09PSAxICYmIGF4ZXNbMF0gaW5zdGFuY2VvZiBBeGlzKSB7XHJcbiAgICAgICAgICAgIE9iamVjdC5hc3NpZ24odGhpcywgKGF4ZXNbMF0gYXMgQXhpcykuY2xvbmUoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbXBsZXhDYXJ0ZXNpYW5BZGQoYXhpczogQXhpcyxtb2RlOiBzdHJpbmcsbW9kaWZpZXI/OiBhbnkpe1xyXG4gICAgICAgIHN3aXRjaCAobW9kZSkge1xyXG4gICAgICAgICAgICBjYXNlIFwiYWRkaXRpb25cIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FydGVzaWFuWCs9YXhpcy5jYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZKz1heGlzLmNhcnRlc2lhblk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInN1YnRyYWN0aW9uXCI6XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBcInJpZ2h0UHJvamVjdGlvblwiOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPWF4aXMuY2FydGVzaWFuWFxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJpbnRlcm5hbFBvaW50XCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNhcnRlc2lhblg9KHRoaXMuY2FydGVzaWFuWCtheGlzLmNhcnRlc2lhblgpKm1vZGlmaWVyO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYXJ0ZXNpYW5ZPSh0aGlzLmNhcnRlc2lhblkrYXhpcy5jYXJ0ZXNpYW5ZKSptb2RpZmllcjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNhcnRlc2lhblRvUG9sYXIoKVxyXG4gICAgICAgIHJldHVybiB0aGlzXHJcbiAgICB9O1xyXG5cclxuXHJcbiAgICBnZXRDb29yZGluYXRlTWF0Y2hlcyhjb29yZGluYXRlOiBzdHJpbmcpe1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybiA9IGdldFJlZ2V4KCk7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtcclxuICAgICAgICAgICAgcmVnRXhwKFN0cmluZy5yYXdgKCR7cmVnZXhQYXR0ZXJuLmJhc2ljfSspYCwgXCJnXCIpLFxyXG4gICAgICAgICAgICByZWdFeHAoU3RyaW5nLnJhd2AoJHtyZWdleFBhdHRlcm4ubWVyZ2V9KylgLCBcImdcIilcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFN0ZXAgMTogRXh0cmFjdCBtYXRjaGVzIGZvciBlYWNoIHBhdHRlcm4gc2VwYXJhdGVseVxyXG4gICAgICAgIGNvbnN0IGJhc2ljTWF0Y2hlcyA9IEFycmF5LmZyb20oY29vcmRpbmF0ZS5tYXRjaEFsbChyZWdleFBhdHRlcm5zWzBdKSkubWFwKChtYXRjaDogUmVnRXhwRXhlY0FycmF5KSA9PiAoe1xyXG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLnJlcGxhY2UoLy0kL2csIFwiXCIpLCAvLyBSZW1vdmUgdHJhaWxpbmcgaHlwaGVuIG9ubHlcclxuICAgICAgICAgICAgaW5kZXg6IG1hdGNoLmluZGV4ID8/IDAsXHJcbiAgICAgICAgICAgIGxlbmd0aDogbWF0Y2hbMF0ubGVuZ3RoLShtYXRjaFswXS5tYXRjaCgvLSQvKT8xOjApXHJcbiAgICAgICAgfSkpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1lcmdlTWF0Y2hlcyA9IEFycmF5LmZyb20oY29vcmRpbmF0ZS5tYXRjaEFsbChyZWdleFBhdHRlcm5zWzFdKSkubWFwKChtYXRjaDogUmVnRXhwRXhlY0FycmF5KSA9PiAoe1xyXG4gICAgICAgICAgICBmdWxsTWF0Y2g6IG1hdGNoWzBdLFxyXG4gICAgICAgICAgICBpbmRleDogbWF0Y2guaW5kZXggPz8gMCxcclxuICAgICAgICAgICAgbGVuZ3RoOiBtYXRjaFswXS5sZW5ndGhcclxuICAgICAgICB9KSk7XHJcbiAgICAgICAgY29uc3QgbWF0Y2hlczogQXJyYXk8eyBmdWxsTWF0Y2g6IHN0cmluZywgaW5kZXg6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIgfT4gPSBbXTtcclxuXHJcbiAgICAgICAgZnVuY3Rpb24gaXNPdmVybGFwcGluZyhtYXRjaDE6IHsgaW5kZXg6IG51bWJlcjsgbGVuZ3RoOiBudW1iZXIgfSwgbWF0Y2gyOiB7IGluZGV4OiBudW1iZXI7IGxlbmd0aDogbnVtYmVyIH0pIHtcclxuICAgICAgICAgICAgcmV0dXJuIG1hdGNoMS5pbmRleCA8IG1hdGNoMi5pbmRleCArIG1hdGNoMi5sZW5ndGggJiYgbWF0Y2gyLmluZGV4IDwgbWF0Y2gxLmluZGV4ICsgbWF0Y2gxLmxlbmd0aDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIFsuLi5iYXNpY01hdGNoZXMsIC4uLm1lcmdlTWF0Y2hlc10uZm9yRWFjaChtYXRjaCA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG92ZXJsYXBwaW5nSW5kZXggPSBtYXRjaGVzLmZpbmRJbmRleChleGlzdGluZ01hdGNoID0+IGlzT3ZlcmxhcHBpbmcoZXhpc3RpbmdNYXRjaCwgbWF0Y2gpKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChvdmVybGFwcGluZ0luZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdNYXRjaCA9IG1hdGNoZXNbb3ZlcmxhcHBpbmdJbmRleF07XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBjdXJyZW50IG1hdGNoIGNvdmVycyBhIGxhcmdlciByYW5nZSwgcmVwbGFjZSB0aGUgZXhpc3Rpbmcgb25lXHJcbiAgICAgICAgICAgICAgICBpZiAobWF0Y2gubGVuZ3RoID4gZXhpc3RpbmdNYXRjaC5sZW5ndGgpIHtcclxuICAgICAgICAgICAgICAgICAgICBtYXRjaGVzW292ZXJsYXBwaW5nSW5kZXhdID0gbWF0Y2g7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBtYXRjaGVzLnB1c2gobWF0Y2gpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RlcCAzOiBTb3J0IHRoZSBmaW5hbCBtYXRjaGVzIGJ5IGluZGV4XHJcbiAgICAgICAgbWF0Y2hlcy5zb3J0KChhLCBiKSA9PiBhLmluZGV4IC0gYi5pbmRleCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU3RlcCA0OiBWYWxpZGF0ZSB0aGUgcmVzdWx0XHJcbiAgICAgICAgaWYgKG1hdGNoZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvb3JkaW5hdGUgaXMgbm90IHZhbGlkOyBleHBlY3RlZCBhIHZhbGlkIGNvb3JkaW5hdGUuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gbWF0Y2hlcztcclxuICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcbiAgICBcclxuXHJcbiAgICBwcm9qZWN0aW9uKGF4aXMxOiBBeGlzfHVuZGVmaW5lZCxheGlzMjogQXhpc3x1bmRlZmluZWQpOmFueXtcclxuICAgICAgICBpZiAoIWF4aXMxfHwhYXhpczIpe3Rocm93IG5ldyBFcnJvcihcImF4aXMncyB3ZXJlIHVuZGVmaW5lZCBhdCBwcm9qZWN0aW9uXCIpO31cclxuICAgICAgICByZXR1cm4gW3tYOiBheGlzMS5jYXJ0ZXNpYW5YLFk6IGF4aXMyLmNhcnRlc2lhbll9LHtYOiBheGlzMi5jYXJ0ZXNpYW5YLFk6IGF4aXMxLmNhcnRlc2lhbll9XVxyXG4gICAgfVxyXG5cclxuICAgIGNvbWJpbmUoY29vcmRpbmF0ZUFycjogYW55KXtcclxuICAgICAgICBsZXQgeD0wLHk9MDtcclxuICAgICAgICBjb29yZGluYXRlQXJyLmZvckVhY2goKGNvb3JkaW5hdGU6IEF4aXMpPT57XHJcbiAgICAgICAgICAgIHgrPWNvb3JkaW5hdGUuY2FydGVzaWFuWDtcclxuICAgICAgICAgICAgeSs9Y29vcmRpbmF0ZS5jYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5jYXJ0ZXNpYW5YPXg7dGhpcy5jYXJ0ZXNpYW5ZPXk7XHJcbiAgICB9XHJcbiAgICBhZGRDYXJ0ZXNpYW4oeDogc3RyaW5nIHwgbnVtYmVyLCB5PzogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKCF5ICYmIHR5cGVvZiB4ID09PSBcInN0cmluZ1wiKSB7XHJcbiAgICAgICAgICAgIFt4LCB5XSA9IHguc3BsaXQoXCIsXCIpLm1hcChOdW1iZXIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoeCA9PT0gdW5kZWZpbmVkIHx8IHkgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIENhcnRlc2lhbiBjb29yZGluYXRlcyBwcm92aWRlZC5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWCA9IHggYXMgbnVtYmVyO1xyXG4gICAgICAgIHRoaXMuY2FydGVzaWFuWSA9IHkgYXMgbnVtYmVyO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBwb2xhclRvQ2FydGVzaWFuKCl7XHJcbiAgICAgICAgY29uc3QgdGVtcD1wb2xhclRvQ2FydGVzaWFuKHRoaXMucG9sYXJBbmdsZSwgdGhpcy5wb2xhckxlbmd0aClcclxuICAgICAgICB0aGlzLmFkZENhcnRlc2lhbih0ZW1wLlgsdGVtcC5ZKVxyXG4gICAgfVxyXG5cclxuICAgIGNhcnRlc2lhblRvUG9sYXIoKXtcclxuICAgICAgICBjb25zdCB0ZW1wPWNhcnRlc2lhblRvUG9sYXIodGhpcy5jYXJ0ZXNpYW5YLCB0aGlzLmNhcnRlc2lhblkpXHJcbiAgICAgICAgdGhpcy5hZGRQb2xhcih0ZW1wLmFuZ2xlLHRlbXAubGVuZ3RoKVxyXG4gICAgfVxyXG5cclxuICAgIGFkZFBvbGFyKGFuZ2xlOiBzdHJpbmcgfCBudW1iZXIsIGxlbmd0aD86IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmICghbGVuZ3RoICYmIHR5cGVvZiBhbmdsZSA9PT0gXCJzdHJpbmdcIikge1xyXG4gICAgICAgICAgICBbYW5nbGUsIGxlbmd0aF0gPSBhbmdsZS5zcGxpdChcIjpcIikubWFwKE51bWJlcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChhbmdsZSA9PT0gdW5kZWZpbmVkIHx8IGxlbmd0aCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgcG9sYXIgY29vcmRpbmF0ZXMgcHJvdmlkZWQuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBvbGFyQW5nbGUgPSBhbmdsZSBhcyBudW1iZXI7XHJcbiAgICAgICAgdGhpcy5wb2xhckxlbmd0aCA9IGxlbmd0aCBhcyBudW1iZXI7XHJcbiAgICB9XHJcbiAgICBhZGRRdWFkcmFudChtaWRQb2ludDogQXhpcyl7XHJcbiAgICAgICAgY29uc3QgeD1taWRQb2ludC5jYXJ0ZXNpYW5YPnRoaXMuY2FydGVzaWFuWDtcclxuICAgICAgICBjb25zdCB5PW1pZFBvaW50LmNhcnRlc2lhblk+dGhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIHRoaXMucXVhZHJhbnQ9eD95PzE6NDp5PzI6MztcclxuICAgIH1cclxuICAgIHRvU3RyaW5nU1ZHKCl7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuY2FydGVzaWFuWCtcIiBcIit0aGlzLmNhcnRlc2lhblk7XHJcbiAgICB9XHJcbiAgICB0b1N0cmluZygpe1xyXG4gICAgICAgIHJldHVybiB0aGlzLmNhcnRlc2lhblgrXCIsXCIrdGhpcy5jYXJ0ZXNpYW5ZO1xyXG4gICAgfVxyXG5cclxuICAgIGludGVyc2VjdGlvbihjb29yZDogc3RyaW5nLCBmaW5kT3JpZ2luYWxWYWx1ZTogKGNvb3JkOiBzdHJpbmcpID0+IENvb3JkaW5hdGUgfCB1bmRlZmluZWQpOiB7WDpudW1iZXIsWTpudW1iZXJ9IHtcclxuICAgICAgICBjb25zdCBvcmlnaW5hbENvb3JkcyA9IGNvb3JkXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9pbnRlcnNlY3Rpb25cXHM/b2ZcXHM/L2csIFwiXCIpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC8oXFxzKmFuZFxccz98LS0pL2csIFwiIFwiKVxyXG4gICAgICAgICAgICAuc3BsaXQoXCIgXCIpXHJcbiAgICAgICAgICAgIC5tYXAoZmluZE9yaWdpbmFsVmFsdWUpXHJcbiAgICAgICAgICAgIC5maWx0ZXIoKHRva2VuKTogdG9rZW4gaXMgQ29vcmRpbmF0ZSA9PiB0b2tlbiAhPT0gdW5kZWZpbmVkKTtcclxuXHJcbiAgICAgICAgaWYgKG9yaWdpbmFsQ29vcmRzLmxlbmd0aCA8IDQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW50ZXJzZWN0aW9uIGhhZCB1bmRlZmluZWQgY29vcmRpbmF0ZXMgb3IgaW5zdWZmaWNpZW50IGRhdGEuXCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBzbG9wZXMgPSBbXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzFdLmF4aXMgYXMgQXhpcyksXHJcbiAgICAgICAgICAgIGZpbmRTbG9wZShvcmlnaW5hbENvb3Jkc1syXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzNdLmF4aXMgYXMgQXhpcyksXHJcbiAgICAgICAgXTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGZpbmRJbnRlcnNlY3Rpb25Qb2ludChvcmlnaW5hbENvb3Jkc1swXS5heGlzIGFzIEF4aXMsIG9yaWdpbmFsQ29vcmRzWzJdLmF4aXMgYXMgQXhpcywgc2xvcGVzWzBdLCBzbG9wZXNbMV0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdG9Qb2ludCh2YWx1ZTpudW1iZXIsZm9ybWF0OiBzdHJpbmcpe1xyXG4gICAgc3dpdGNoIChmb3JtYXQpIHtcclxuICAgICAgICBjYXNlIFwiUG9pbnRcIjpcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgICAgIGNhc2UgXCJjbVwiOiBcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKjI4LjM0NjtcclxuICAgICAgICBjYXNlIFwibW1cIjpcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHVlKiAyLjgzNDY7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidW5rbm9uIGZvcm1hdFwiKTtcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmZ1bmN0aW9uIG1hdGNoS2V5V2l0aFZhbHVlKGtleTogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgIGNvbnN0IHZhbHVlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xyXG4gICAgICAgIFwiYW5jaG9yXCI6IFwiYW5jaG9yPVwiLFxyXG4gICAgICAgIFwicm90YXRlXCI6IFwicm90YXRlPVwiLFxyXG4gICAgICAgIFwibGluZVdpZHRoXCI6IFwibGluZSB3aWR0aD1cIixcclxuICAgICAgICBcImZpbGxcIjogXCJmaWxsPVwiLFxyXG4gICAgICAgIFwiZmlsbE9wYWNpdHlcIjogXCJmaWxsIG9wYWNpdHk9XCIsXHJcbiAgICAgICAgXCJ0ZXh0T3BhY2l0eVwiOiBcInRleHQgb3BhY2l0eT1cIixcclxuICAgICAgICBcInRleHRDb2xvclwiOiBcInRleHQgY29sb3I9XCIsXHJcbiAgICAgICAgXCJkcmF3XCI6IFwiZHJhdz1cIixcclxuICAgICAgICBcInRleHRcIjogXCJ0ZXh0PVwiLFxyXG4gICAgICAgIFwicG9zXCI6IFwicG9zPVwiLFxyXG4gICAgICAgIFwic2NhbGVcIjogXCJzY2FsZT1cIixcclxuICAgICAgICBcImRlY29yYXRlXCI6IFwiZGVjb3JhdGVcIixcclxuICAgICAgICBcInNsb3BlZFwiOiBcInNsb3BlZFwiLFxyXG4gICAgICAgIFwiZGVjb3JhdGlvblwiOiBcImRlY29yYXRpb249XCIsXHJcbiAgICAgICAgXCJicmFjZVwiOiBcImJyYWNlXCIsXHJcbiAgICAgICAgXCJhbXBsaXR1ZGVcIjogXCJhbXBsaXR1ZGU9XCIsXHJcbiAgICAgICAgXCJhbmdsZVJhZGl1c1wiOiBcImFuZ2xlIHJhZGl1cz1cIixcclxuICAgICAgICBcImFuZ2xlRWNjZW50cmljaXR5XCI6IFwiYW5nbGUgZWNjZW50cmljaXR5PVwiLFxyXG4gICAgICAgIFwiZm9udFwiOiBcImZvbnQ9XCIsXHJcbiAgICAgICAgXCJwaWNUZXh0XCI6IFwicGljIHRleHQ9XCIsXHJcbiAgICAgICAgXCJsYWJlbFwiOiBcImxhYmVsPVwiLFxyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gdmFsdWVNYXBba2V5XSB8fCAnJztcclxufVxyXG5cclxuXHJcbnR5cGUgRGVjb3JhdGlvbiA9IHtcclxuICAgIGJyYWNlPzogYm9vbGVhbjtcclxuICAgIGNvaWw6IGJvb2xlYW47XHJcbiAgICBhbXBsaXR1ZGU/OiBudW1iZXI7XHJcbiAgICBhc3BlY3Q/OiBudW1iZXI7XHJcbiAgICBzZWdtZW50TGVuZ3RoPzogbnVtYmVyO1xyXG4gICAgZGVjb3JhdGlvbj86IERlY29yYXRpb247IFxyXG59O1xyXG5cclxudHlwZSBMYWJlbCA9IHtcclxuICAgIGZyZWVGb3JtVGV4dD86IHN0cmluZztcclxufTtcclxuXHJcbmZ1bmN0aW9uIGxpbmVXaWR0aENvbnZlcnRlcih3aWR0aDogc3RyaW5nKXtcclxuICAgIHJldHVybiBOdW1iZXIod2lkdGgucmVwbGFjZSgvdWx0cmFcXHMqdGhpbi8sXCIwLjFcIilcclxuICAgIC5yZXBsYWNlKC92ZXJ5XFxzKnRoaW4vLFwiMC4yXCIpXHJcbiAgICAucmVwbGFjZSgvdGhpbi8sXCIwLjRcIilcclxuICAgIC5yZXBsYWNlKC9zZW1pdGhpY2svLFwiMC42XCIpXHJcbiAgICAucmVwbGFjZSgvdGhpY2svLFwiMC44XCIpXHJcbiAgICAucmVwbGFjZSgvdmVyeVxccyp0aGljay8sXCIxLjJcIilcclxuICAgIC5yZXBsYWNlKC91bHRyYVxccyp0aGljay8sXCIxLjZcIikpXHJcbn1cclxuZXhwb3J0IGNsYXNzIEZvcm1hdHRpbmd7XHJcbiAgICAvLyBpbXBvcnRlbnQgbmVlZHMgdG8gYmUgZm9yc3RcclxuICAgIHBhdGg/OiBzdHJpbmc7XHJcblxyXG4gICAgc2NhbGU6IG51bWJlcjtcclxuICAgIHJvdGF0ZT86IG51bWJlcjtcclxuICAgIGxpbmVXaWR0aD86IG51bWJlcj0wLjQ7XHJcbiAgICB0ZXh0T3BhY2l0eTogbnVtYmVyO1xyXG4gICAgb3BhY2l0eT86IG51bWJlcjtcclxuICAgIGZpbGxPcGFjaXR5PzogbnVtYmVyO1xyXG4gICAgcG9zPzogbnVtYmVyO1xyXG4gICAgYW5nbGVFY2NlbnRyaWNpdHk/OiBudW1iZXI7XHJcbiAgICBhbmdsZVJhZGl1cz86IG51bWJlcjtcclxuICAgIGxldmVsRGlzdGFuY2U/OiBudW1iZXI7XHJcblxyXG4gICAgbW9kZTogc3RyaW5nO1xyXG4gICAgYW5jaG9yPzogc3RyaW5nO1xyXG4gICAgY29sb3I/OiBzdHJpbmc7XHJcbiAgICB0ZXh0Q29sb3I/OiBzdHJpbmc7XHJcbiAgICBmaWxsPzogc3RyaW5nO1xyXG4gICAgYXJyb3c/OiBzdHJpbmc7XHJcbiAgICBkcmF3Pzogc3RyaW5nO1xyXG4gICAgdGV4dD86IHN0cmluZztcclxuICAgIHRpa3pzZXQ/OiBzdHJpbmc7XHJcbiAgICBwb3NpdGlvbj86IHN0cmluZztcclxuICAgIGxpbmVTdHlsZT86IHN0cmluZztcclxuICAgIGZvbnQ/OiBzdHJpbmc7XHJcbiAgICBwaWNUZXh0Pzogc3RyaW5nO1xyXG4gICAgXHJcbiAgICBzbG9wZWQ/OiBib29sZWFuO1xyXG4gICAgZGVjb3JhdGU/OiBib29sZWFuO1xyXG4gICAgbGFiZWw/OiBMYWJlbDtcclxuICAgIGRlY29yYXRpb24/OiBEZWNvcmF0aW9uO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGZvcm1hdHRpbmc6IGFueVtdLG1vZGU/OiBzdHJpbmcpe1xyXG4gICAgICAgIGlmKG1vZGUpdGhpcy5tb2RlPW1vZGU7XHJcbiAgICAgICAgY29uc29sZS5sb2coZm9ybWF0dGluZylcclxuICAgICAgICB0aGlzLmFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZ3x8W10pO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBhc3NpZ25Gb3JtYXR0aW5nKGZvcm1hdHRpbmdBcnI6IEFycmF5PHsga2V5OiBzdHJpbmc7IHZhbHVlOiBhbnkgfT4pIHtcclxuICAgICAgICBjb25zdCBjbGFzc1Byb3BlcnRpZXMgPSBPYmplY3Qua2V5cyh0aGlzKS5yZWR1Y2UoKG1hcCwgcHJvcCkgPT4ge1xyXG4gICAgICAgICAgICBtYXBbcHJvcC50b0xvd2VyQ2FzZSgpXSA9IHByb3A7XHJcbiAgICAgICAgICAgIHJldHVybiBtYXA7XHJcbiAgICAgICAgfSwge30gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPik7XHJcbiAgICBcclxuICAgICAgICBmb3IgKGNvbnN0IHsga2V5LCB2YWx1ZSB9IG9mIGZvcm1hdHRpbmdBcnIpIHtcclxuICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplZEtleSA9IGNsYXNzUHJvcGVydGllc1trZXkudG9Mb3dlckNhc2UoKV07XHJcbiAgICAgICAgICAgIGlmICghbm9ybWFsaXplZEtleSkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBQcm9wZXJ0eSAke2tleX0gbm90IGZvdW5kIG9uIHRoZSBjbGFzc2ApO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAhKHRoaXMgYXMgUmVjb3JkPHN0cmluZywgYW55Pilbbm9ybWFsaXplZEtleV0pIHtcclxuICAgICAgICAgICAgICAgICh0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW25vcm1hbGl6ZWRLZXldID0ge307XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2V0UHJvcGVydHkobm9ybWFsaXplZEtleSBhcyBrZXlvZiBGb3JtYXR0aW5nLCB2YWx1ZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuXHJcbiAgICBhZGRUaWt6c2V0KHNwbGl0Rm9ybWF0dGluZzogYW55KXtcclxuICAgICAgICBjb25zdCBhPXNwbGl0Rm9ybWF0dGluZy5maW5kKChpdGVtOiBzdHJpbmcpPT4gaXRlbS5tYXRjaCgvbWFzc3xhbmd8aGVscGxpbmVzLykpXHJcbiAgICAgICAgaWYgKCFhJiYhdGhpcy50aWt6c2V0KXJldHVybjtcclxuICAgICAgICBpZihhKSB0aGlzLnRpa3pzZXQ9YTtcclxuXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnRpa3pzZXQpIHtcclxuICAgICAgICAgICAgY2FzZSBcIm1hc3NcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD1cInllbGxvdyE2MFwiO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXRoPVwiZHJhd1wiO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0PVwiYmxhY2tcIjtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwidmVjXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFycm93PSctPidcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIFwiaGVscGxpbmVzXCI6XHJcbiAgICAgICAgICAgICAgICB0aGlzLmxpbmVXaWR0aD0wLjQ7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXc9J2dyYXknO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgXCJhbmdcIjpcclxuICAgICAgICAgICAgICAgIHRoaXMucGF0aD0nZHJhdydcclxuICAgICAgICAgICAgICAgIHRoaXMuZmlsbD0nYmxhY2shNTAnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5maWxsT3BhY2l0eT0wLjU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXc9J29yYW5nZSdcclxuICAgICAgICAgICAgICAgIHRoaXMuYXJyb3c9JzwtPidcclxuICAgICAgICAgICAgICAgIHRoaXMuYW5nbGVFY2NlbnRyaWNpdHk9MS42O1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZVJhZGl1cz10b1BvaW50KDAuNSxcImNtXCIpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0PSdvcmFuZ2UnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5mb250PSdcXFxcbGFyZ2UnO1xyXG4gICAgICAgICAgICAgICAgdGhpcy50ZXh0T3BhY2l0eT0wLjk7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhZGRTcGxvcEFuZFBvc2l0aW9uKGFycjogYW55LGluZGV4OiBudW1iZXIpe1xyXG4gICAgICAgIGNvbnN0IGJlZm9yZUFmdGVyPWZpbmRCZWZvcmVBZnRlckF4aXMoYXJyLGluZGV4KTtcclxuICAgICAgICBjb25zdCBbYmVmb3JlLCBhZnRlcl09W2FycltiZWZvcmVBZnRlci5iZWZvcmVdLGFycltiZWZvcmVBZnRlci5hZnRlcl1dXHJcbiAgICAgICAgaWYgKHRoaXMucG9zaXRpb258fHRoaXMuc2xvcGVkKXtyZXR1cm59XHJcbiAgICBcclxuICAgICAgICBjb25zdCBlZGdlMSA9IGJlZm9yZS5xdWFkcmFudD8udG9TdHJpbmcoKXx8XCJcIjtcclxuICAgICAgICBjb25zdCBlZGdlMiA9IGFmdGVyLnF1YWRyYW50Py50b1N0cmluZygpfHxcIlwiO1xyXG4gICAgICAgIGNvbnN0IHNsb3BlPWZpbmRTbG9wZShiZWZvcmUsYWZ0ZXIpXHJcblxyXG4gICAgICAgIHRoaXMuc2xvcGVkID0gc2xvcGUgIT09IDAmJnNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5O1xyXG5cclxuICAgICAgICBsZXQgcXVhZHJhbnRcclxuXHJcbiAgICAgICAgaWYgKGVkZ2UxIT09ZWRnZTIpXHJcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxK2VkZ2UyO1xyXG4gICAgICAgIGVsc2UgXHJcbiAgICAgICAgICAgIHF1YWRyYW50PWVkZ2UxO1xyXG5cclxuICAgICAgICAvL3NpbnQgcGFyYWxsZWwgdG8gWSBheGlzXHJcbiAgICAgICAgaWYgKHNsb3BlIT09SW5maW5pdHkmJnNsb3BlIT09LUluZmluaXR5KXtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbiA9IHF1YWRyYW50LnJlcGxhY2UoLygzfDQpLyxcImJlbG93XCIpLnJlcGxhY2UoLygxfDIpLyxcImFib3ZlXCIpLnJlcGxhY2UoLyhiZWxvd2Fib3ZlfGFib3ZlYmVsb3cpLyxcIlwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICAvL2lzbnQgcGFyYWxsZWwgdG8gWCBheGlzXHJcbiAgICAgICAgaWYgKHNsb3BlICE9PSAwKXtcclxuICAgICAgICAgICAgdGhpcy5wb3NpdGlvbj10aGlzLnBvc2l0aW9uP3RoaXMucG9zaXRpb246Jyc7XHJcbiAgICAgICAgICAgIHRoaXMucG9zaXRpb24rPXF1YWRyYW50LnJlcGxhY2UoLygxfDQpLyxcInJpZ2h0XCIpLnJlcGxhY2UoLygyfDMpLyxcImxlZnRcIikucmVwbGFjZSgvKHJpZ2h0bGVmdHxsZWZ0cmlnaHQpLyxcIlwiKVxyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbj8ucmVwbGFjZSgvW1xcZF0rL2csXCJcIikucmVwbGFjZSgvKGJlbG93fGFib3ZlKShyaWdodHxsZWZ0KS8sXCIkMSAkMlwiKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhzbG9wZSx0aGlzLnBvc2l0aW9uLHF1YWRyYW50KVxyXG4gICAgfVxyXG5cclxuICAgIFxyXG4gICAgXHJcblxyXG4gICAgaW50ZXJwcmV0Rm9ybWF0dGluZyhmb3JtYXR0aW5nU3RyaW5nOiBzdHJpbmcpIHtcclxuICAgICAgICBjb25zdCBzcGxpdEZvcm1hdHRpbmcgPSBmb3JtYXR0aW5nU3RyaW5nLnJlcGxhY2UoL1xccy9nLCBcIlwiKS5tYXRjaCgvKD86e1tefV0qfXxbXix7fV0rKSsvZykgfHwgW107XHJcbiAgICBcclxuICAgICAgICB0aGlzLmFkZFRpa3pzZXQoc3BsaXRGb3JtYXR0aW5nKTtcclxuICAgIFxyXG4gICAgICAgIGNvbnN0IHBhdHRlcm5zOiBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IHN0cmluZykgPT4gdm9pZD4gPSB7XHJcbiAgICAgICAgICAgIFwibGluZXdpZHRoXCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImxpbmVXaWR0aFwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiZmlsbD1cIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZmlsbFwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXmZpbGxvcGFjaXR5XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImZpbGxPcGFjaXR5XCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeKC0+fDwtfC0qe1N0ZWFsdGh9LSopJFwiOiAodmFsdWUpID0+IHsgdGhpcy5hcnJvdyA9IHZhbHVlOyB9LFxyXG4gICAgICAgICAgICBcIl4oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCl7MSwyfSRcIjogKHZhbHVlKSA9PiB7IHRoaXMucG9zaXRpb24gPSB2YWx1ZS5yZXBsYWNlKC8oYWJvdmV8YmVsb3d8bGVmdHxyaWdodCkvLCBcIiQxIFwiKTsgfSxcclxuICAgICAgICAgICAgXCJecG9zPVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJwb3NcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5kcmF3PVwiOiAodmFsdWUpID0+IHRoaXMuc3BsaXQoXCJkcmF3XCIsIHZhbHVlKSxcclxuICAgICAgICAgICAgXCJeZGVjb3JhdGUkXCI6ICgpID0+IHsgdGhpcy5kZWNvcmF0ZSA9IHRydWU7IH0sXHJcbiAgICAgICAgICAgIFwiXnRleHQ9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcInRleHRcIiwgdmFsdWUpLFxyXG4gICAgICAgICAgICBcIl5hbmNob3I9XCI6ICh2YWx1ZSkgPT4gdGhpcy5zcGxpdChcImFuY2hvclwiLCB2YWx1ZSksXHJcbiAgICAgICAgICAgIFwiXlxcXCJeXFxcIiRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImxhYmVsXCIsdHJ1ZSxcImZyZWVGb3JtVGV4dFwiIGFzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbXCJsYWJlbFwiXT4pLFxyXG4gICAgICAgICAgICBcIl5icmFjZSRcIjogKCkgPT4gdGhpcy5zZXRQcm9wZXJ0eShcImRlY29yYXRpb25cIix0cnVlLFwiYnJhY2VcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxyXG4gICAgICAgICAgICBcIl5hbXBsaXR1ZGVcIjogKHZhbHVlKSA9PiB0aGlzLnNwbGl0KFwiZGVjb3JhdGlvblwiLCB2YWx1ZSwgXCJhbXBsaXR1ZGVcIiBhcyBrZXlvZiBOb25OdWxsYWJsZTxGb3JtYXR0aW5nW1wiZGVjb3JhdGlvblwiXT4pLFxyXG4gICAgICAgICAgICBcIl5kcmF3JFwiOiAodmFsdWUpID0+IHsgdGhpcy5wYXRoID0gdmFsdWU7IH0sXHJcbiAgICAgICAgICAgIFwiXihyZWR8Ymx1ZXxwaW5rfGJsYWNrfHdoaXRlfFshXFxcXGQuXSspezEsNX0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmNvbG9yID0gdmFsdWU7IH0sXHJcbiAgICAgICAgICAgIFwiXihkb3R0ZWR8ZGFzaGVkfHNtb290aHxkZW5zZWx5fGxvb3NlbHkpezEsMn0kXCI6ICh2YWx1ZSkgPT4geyB0aGlzLmxpbmVTdHlsZSA9IHZhbHVlLnJlcGxhY2UoLyhkZW5zZWx5fGxvb3NlbHkpLywgXCIkMSBcIik7IH0sXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgc3BsaXRGb3JtYXR0aW5nLmZvckVhY2goZm9ybWF0dGluZyA9PiB7LypcclxuICAgICAgICAgICAgLy8gSGFuZGxlIG5lc3RlZCBwcm9wZXJ0aWVzXHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZm9ybWF0dGluZy5tYXRjaCgvXihbXj1dKyk9eyguKil9JC8pO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IFtfLCBwYXJlbnQsIGNoaWxkcmVuXSA9IG1hdGNoO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdPYmogPSB0aGlzIGFzIFJlY29yZDxzdHJpbmcsIGFueT47XHJcbiAgICAgICAgICAgICAgICBpZiAoIWZvcm1hdHRpbmdPYmpbcGFyZW50XSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpbcGFyZW50XSA9IHt9O1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkQ2hpbGQgPSBuZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUse30sY2hpbGRyZW4pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGZvcm1hdHRpbmdPYmpbcGFyZW50XSwgKHBhcnNlZENoaWxkIGFzIFJlY29yZDxzdHJpbmcsIGFueT4pW3BhcmVudF0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFtwYXR0ZXJuLCBoYW5kbGVyXSBvZiBPYmplY3QuZW50cmllcyhwYXR0ZXJucykpIHtcclxuICAgICAgICAgICAgICAgIGlmIChuZXcgUmVnRXhwKHBhdHRlcm4pLnRlc3QoZm9ybWF0dGluZykpIHtcclxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVyKGZvcm1hdHRpbmcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSovXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIFxyXG5cclxuICAgIHNwbGl0PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcclxuICAgICAgICBrZXk6IEssXHJcbiAgICAgICAgZm9ybWF0dGluZzogYW55LFxyXG4gICAgICAgIG5lc3RlZEtleT86IE5LXHJcbiAgICApOiB2b2lkIHtcclxuICAgICAgICBsZXQgdmFsdWU7XHJcbiAgICAgICAgaWYodHlwZW9mIGZvcm1hdHRpbmchPT1cImJvb2xlYW5cIil7XHJcbiAgICAgICAgICAgIGxldCBtYXRjaCA9IGZvcm1hdHRpbmcuc3BsaXQoXCI9XCIpO1xyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0aGUgZm9ybWF0dGluZyBzdHJpbmcgaXMgdmFsaWRcclxuICAgICAgICAgICAgaWYgKG1hdGNoLmxlbmd0aCA8IDIgfHwgIW1hdGNoWzFdKSByZXR1cm47XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBUcmltIGFueSBwb3RlbnRpYWwgd2hpdGVzcGFjZSBhcm91bmQgdGhlIHZhbHVlXHJcbiAgICAgICAgICAgIGNvbnN0IHJhd1ZhbHVlID0gbWF0Y2hbMV0udHJpbSgpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGlmIHRoZSB2YWx1ZSBpcyBhIG51bWJlciBvciBhIHN0cmluZ1xyXG4gICAgICAgICAgICB2YWx1ZSA9ICFpc05hTihwYXJzZUZsb2F0KHJhd1ZhbHVlKSkgJiYgaXNGaW5pdGUoK3Jhd1ZhbHVlKVxyXG4gICAgICAgICAgICAgICAgPyBwYXJzZUZsb2F0KHJhd1ZhbHVlKVxyXG4gICAgICAgICAgICAgICAgOiByYXdWYWx1ZS5yZXBsYWNlKC8tXFx8Lywnbm9ydGgnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgdmFsdWU9Zm9ybWF0dGluZ1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0aGlzLnNldFByb3BlcnR5KGtleSwgdmFsdWUsIG5lc3RlZEtleSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHNldFByb3BlcnR5PEsgZXh0ZW5kcyBrZXlvZiBGb3JtYXR0aW5nLCBOSyBleHRlbmRzIGtleW9mIE5vbk51bGxhYmxlPEZvcm1hdHRpbmdbS10+IHwgdW5kZWZpbmVkPihcclxuICAgICAgICBrZXk6IEssXHJcbiAgICAgICAgdmFsdWU6IGFueSxcclxuICAgICAgICBuZXN0ZWRLZXk/OiBOS1xyXG4gICAgKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZT09PVwic3RyaW5nXCIpe1xyXG4gICAgICAgICAgICB2YWx1ZT12YWx1ZS5yZXBsYWNlKC9eXFx8LSQvLFwibm9ydGhcIikucmVwbGFjZSgvXi1cXHwkLyxcInNvdXRoXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBtYXRjaD12YWx1ZS5tYXRjaCgvKFtcXGQuXSspKHB0fGNtfG1tKS8pXHJcbiAgICAgICAgICAgIGlmIChtYXRjaClcclxuICAgICAgICAgICAgdmFsdWU9dG9Qb2ludChOdW1iZXIobWF0Y2hbMV0pLG1hdGNoWzJdKVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZm9ybWF0dGluZ09iaiA9IHRoaXMgYXMgUmVjb3JkPHN0cmluZywgYW55PjtcclxuXHJcbiAgICAgICAgaWYgKG5lc3RlZEtleSkge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgY29uc3Qga2V5cyA9IHR5cGVvZiBuZXN0ZWRLZXkgPT09IFwic3RyaW5nXCIgPyBuZXN0ZWRLZXkuc3BsaXQoJy4nKSA6IFtuZXN0ZWRLZXldO1xyXG4gICAgICAgICAgICB0aGlzLnRpa3pzZXRcclxuICAgICAgICAgICAgaWYoIWZvcm1hdHRpbmdPYmpba2V5XSlmb3JtYXR0aW5nT2JqW2tleV09e307XHJcbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XVtuZXN0ZWRLZXldPXZhbHVlO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGZvcm1hdHRpbmdPYmpba2V5XSA9IHZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgIH1cclxuICAgIFxyXG4gICAgXHJcbiAgICB0b1N0cmluZyhvYmo/OiBhbnkpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCBzdHJpbmc9b2JqPyd7JzonWyc7XHJcbiAgICAgICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMob2JqP29iajp0aGlzKSkge1xyXG4gICAgICAgICAgICBpZiAoa2V5Lm1hdGNoKC9eKG1vZGV8dGlrenNldCkkLykpe2NvbnRpbnVlO31cclxuICAgICAgICAgICAgaWYodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyYmdmFsdWUpe1xyXG4gICAgICAgICAgICAgICAgc3RyaW5nKz1tYXRjaEtleVdpdGhWYWx1ZShrZXkgYXMga2V5b2YgRm9ybWF0dGluZykrdGhpcy50b1N0cmluZyh2YWx1ZSkrJywnXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZiAodmFsdWUpIHtcclxuICAgICAgICAgICAgICAgIHN0cmluZys9bWF0Y2hLZXlXaXRoVmFsdWUoa2V5IGFzIGtleW9mIEZvcm1hdHRpbmcpKyh0eXBlb2YgdmFsdWU9PT1cImJvb2xlYW5cIj8nJzp2YWx1ZSkrJywnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBzdHJpbmcrKG9iaj8nfSc6J10nKTtcclxuICAgIH1cclxuXHJcbiAgICBoYW5kbGVPYmplY3RUb1N0cmluZyhvYmo6IG9iamVjdCwgcGFyZW50S2V5OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIGxldCByZXN1bHQgPSBtYXRjaEtleVdpdGhWYWx1ZShwYXJlbnRLZXkpKyd7JztcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XHJcbiAgICAgICAgICAgIGlmICh2YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgcmVzdWx0ICs9IG1hdGNoS2V5V2l0aFZhbHVlKGAke3BhcmVudEtleX0uJHtrZXl9YCkgKyAodHlwZW9mIHZhbHVlID09PSBcImJvb2xlYW5cIiA/ICcnIDogdmFsdWUpICsgJywnO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQrXCJ9LFwiO1xyXG4gICAgfVxyXG59XHJcbnR5cGUgTW9kZSA9IFwiY29vcmRpbmF0ZVwiIHwgXCJjb29yZGluYXRlLWlubGluZVwiIHwgXCJub2RlXCIgfCBcIm5vZGUtaW5saW5lXCI7XHJcbmV4cG9ydCBjbGFzcyBDb29yZGluYXRlIHtcclxuICAgIG1vZGU6IE1vZGU7XHJcbiAgICBheGlzPzogQXhpcztcclxuICAgIGNvb3JkaW5hdGVOYW1lPzogc3RyaW5nO1xyXG4gICAgZm9ybWF0dGluZz86IEZvcm1hdHRpbmc7XHJcbiAgICBsYWJlbD86IHN0cmluZztcclxuICAgIFxyXG4gICAgY29uc3RydWN0b3IobW9kZT86IE1vZGUsIGF4aXM/OiBBeGlzLCBjb29yZGluYXRlTmFtZT86IHN0cmluZywgZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsIGxhYmVsPzogc3RyaW5nLCk7XHJcbiAgICBjb25zdHJ1Y3RvcihvcHRpb25zOiB7IG1vZGU/OiBNb2RlOyBheGlzPzogQXhpczsgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7IGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nOyBsYWJlbD86IHN0cmluZzsgIH0pO1xyXG5cclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBtb2RlPzogTW9kZSB8IHsgbW9kZT86IE1vZGU7IGF4aXM/OiBBeGlzOyBvcmlnaW5hbD86IHN0cmluZzsgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmc7IGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nOyBsYWJlbD86IHN0cmluZzsgfSxcclxuICAgIGF4aXM/OiBBeGlzLFxyXG4gICAgY29vcmRpbmF0ZU5hbWU/OiBzdHJpbmcsXHJcbiAgICBmb3JtYXR0aW5nPzogRm9ybWF0dGluZyxcclxuICAgIGxhYmVsPzogc3RyaW5nLFxyXG4gICkgey8qXHJcbiAgICBpZiAodHlwZW9mIG1vZGUgPT09IFwic3RyaW5nXCIpIHtcclxuXHJcbiAgICAgIHRoaXMubW9kZSA9IG1vZGU7XHJcbiAgICAgIGlmIChheGlzICE9PSB1bmRlZmluZWQpIHRoaXMuYXhpcyA9IGF4aXM7XHJcbiAgICAgIHRoaXMuY29vcmRpbmF0ZU5hbWUgPSBjb29yZGluYXRlTmFtZTtcclxuICAgICAgaWYgKGZvcm1hdHRpbmcgIT09IHVuZGVmaW5lZCkgdGhpcy5mb3JtYXR0aW5nID0gZm9ybWF0dGluZztcclxuICAgICAgdGhpcy5sYWJlbCA9IGxhYmVsO1xyXG5cclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIG1vZGUgPT09IFwib2JqZWN0XCIgJiYgbW9kZSAhPT0gbnVsbCkge1xyXG4gICAgICBjb25zdCBvcHRpb25zID0gbW9kZTtcclxuICAgICAgaWYgKG9wdGlvbnMubW9kZSAhPT0gdW5kZWZpbmVkKSB0aGlzLm1vZGUgPSBvcHRpb25zLm1vZGU7XHJcbiAgICAgIHRoaXMuYXhpcyA9IG9wdGlvbnMuYXhpcztcclxuICAgICAgdGhpcy5jb29yZGluYXRlTmFtZSA9IG9wdGlvbnMuY29vcmRpbmF0ZU5hbWU7XHJcbiAgICAgIHRoaXMuZm9ybWF0dGluZyA9IG9wdGlvbnMuZm9ybWF0dGluZztcclxuICAgICAgdGhpcy5sYWJlbCA9IG9wdGlvbnMubGFiZWw7XHJcbiAgICB9XHJcbiAgICBpZiAoIXRoaXMuZm9ybWF0dGluZylcclxuICAgICAgICB0aGlzLmZvcm1hdHRpbmc9bmV3IEZvcm1hdHRpbmcodGhpcy5tb2RlLFtdKVxyXG5cclxuICAgIGlmICh0aGlzLm1vZGU9PT1cImNvb3JkaW5hdGVcIil7XHJcbiAgICAgICAgdGhpcy5mb3JtYXR0aW5nLmFzc2lnbkZvcm1hdHRpbmcoe2xhYmVsOiB7ZnJlZUZvcm1UZXh0OiB0aGlzLmxhYmVsfX0pO1xyXG4gICAgfSovXHJcbiAgfVxyXG5cclxuICAgIGNsb25lKCk6IENvb3JkaW5hdGUge1xyXG4gICAgICAgIHJldHVybiBuZXcgQ29vcmRpbmF0ZShcclxuICAgICAgICAgICAgdGhpcy5tb2RlLFxyXG4gICAgICAgICAgICB0aGlzLmF4aXMgPyB0aGlzLmF4aXMuY2xvbmUoKSA6dW5kZWZpbmVkLFxyXG4gICAgICAgICAgICB0aGlzLmNvb3JkaW5hdGVOYW1lLFxyXG4gICAgICAgICAgICB0aGlzLmZvcm1hdHRpbmcsXHJcbiAgICAgICAgICAgIHRoaXMubGFiZWwsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgIGFkZEF4aXMoY2FydGVzaWFuWD86IG51bWJlciwgY2FydGVzaWFuWT86IG51bWJlciwgcG9sYXJMZW5ndGg/OiBudW1iZXIsIHBvbGFyQW5nbGU/OiBudW1iZXIpe1xyXG4gICAgICAgIHRoaXMuYXhpcz1uZXcgQXhpcyhjYXJ0ZXNpYW5YLCBjYXJ0ZXNpYW5ZLCBwb2xhckxlbmd0aCwgcG9sYXJBbmdsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgdG9TdHJpbmcoKSB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLm1vZGUpIHtcclxuICAgICAgICAgICAgY2FzZSBcImNvb3JkaW5hdGVcIjpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmF4aXMpXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuYFxcXFxjb29yZGluYXRlICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpIHx8ICcnfSAoJHt0aGlzLmNvb3JkaW5hdGVOYW1lIHx8IFwiXCJ9KSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pO2BcclxuICAgICAgICAgICAgY2FzZSBcIm5vZGVcIjpcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmF4aXMpXHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGBcXFxcbm9kZSAke3RoaXMuY29vcmRpbmF0ZU5hbWU/JygnK3RoaXMuY29vcmRpbmF0ZU5hbWUrJyknOicnfSBhdCAoJHt0aGlzLmF4aXMudG9TdHJpbmcoKX0pICR7dGhpcy5mb3JtYXR0aW5nPy50b1N0cmluZygpfHwnJ30geyR7dGhpcy5sYWJlbH19O2BcclxuICAgICAgICAgICAgY2FzZSBcIm5vZGUtaW5saW5lXCI6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gYG5vZGUgJHt0aGlzLmZvcm1hdHRpbmc/LnRvU3RyaW5nKCkgfHwgJyd9IHske3RoaXMubGFiZWwgfHwgJyd9fWBcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkbid0IGZpbmQgbW9kZSBhdCB0byBzdHJpbmcgY29vcmRpbmF0ZVwiKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbn1cclxuXHJcbmV4cG9ydCB0eXBlIFRva2VuID1BeGlzIHwgQ29vcmRpbmF0ZSB8RHJhd3xGb3JtYXR0aW5nfCBzdHJpbmc7XHJcblxyXG5leHBvcnQgY2xhc3MgRHJhdyB7XHJcbiAgICBtb2RlPzogc3RyaW5nXHJcbiAgICBmb3JtYXR0aW5nOiBGb3JtYXR0aW5nO1xyXG4gICAgY29vcmRpbmF0ZXM6IEFycmF5PFRva2VuPjtcclxuXHJcbiAgICBjb25zdHJ1Y3Rvcihtb2RlPzogc3RyaW5nLGZvcm1hdHRpbmc/OiBzdHJpbmcsZHJhdz86IHN0cmluZywgdG9rZW5zPzogRm9ybWF0VGlrempheCwpO1xyXG4gICAgY29uc3RydWN0b3Iob3B0aW9uczoge21vZGU/OiBzdHJpbmcsIGZvcm1hdHRpbmdTdHJpbmc/OiBzdHJpbmcsIGZvcm1hdHRpbmdPYmo/OiBvYmplY3QsZm9ybWF0dGluZz86IEZvcm1hdHRpbmcsZHJhd1N0cmluZz86IHN0cmluZyxkcmF3QXJyPzogYW55LHRva2Vucz86IEZvcm1hdFRpa3pqYXh9KTtcclxuXHJcblxyXG4gICAgY29uc3RydWN0b3IoXHJcbiAgICAgICAgbW9kZT86IHN0cmluZyB8IHttb2RlPzogc3RyaW5nLCBmb3JtYXR0aW5nU3RyaW5nPzogc3RyaW5nLCBmb3JtYXR0aW5nT2JqPzogb2JqZWN0LGZvcm1hdHRpbmc/OiBGb3JtYXR0aW5nLGRyYXdTdHJpbmc/OiBzdHJpbmcsZHJhd0Fycj86IGFueSx0b2tlbnM/OiBGb3JtYXRUaWt6amF4fSxcclxuICAgICAgICBmb3JtYXR0aW5nPzogc3RyaW5nLFxyXG4gICAgICAgIGRyYXc/OiBzdHJpbmcsIFxyXG4gICAgICAgIHRva2Vucz86IEZvcm1hdFRpa3pqYXhcclxuICAgICAgKSB7LypcclxuICAgICAgICBpZiAodHlwZW9mIG1vZGU9PT1cInN0cmluZ1wifHx0eXBlb2YgZHJhdz09PVwic3RyaW5nXCIpe1xyXG4gICAgICAgICAgICB0aGlzLm1vZGU9YGRyYXcke21vZGU/XCItXCIrbW9kZTpcIlwifWA7XHJcbiAgICAgICAgICAgIHRoaXMuZm9ybWF0dGluZz1uZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUse30sZm9ybWF0dGluZyk7XHJcbiAgICAgICAgICAgIGlmIChkcmF3KVxyXG4gICAgICAgICAgICB0aGlzLmNvb3JkaW5hdGVzID0gdGhpcy5maWxsQ29vcmRpbmF0ZXModGhpcy5nZXRTY2hlbWF0aWMoZHJhdyksIHRva2Vucyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYobW9kZSYmdHlwZW9mIG1vZGU9PT1cIm9iamVjdFwiKXtcclxuICAgICAgICAgICAgY29uc3Qgb3B0aW9ucz1tb2RlO1xyXG4gICAgICAgICAgICB0aGlzLm1vZGU9YGRyYXcke29wdGlvbnM/Lm1vZGU/XCItXCIrb3B0aW9ucy5tb2RlOlwiXCJ9YDtcclxuICAgICAgICAgICAgaWYgKCFvcHRpb25zPy5mb3JtYXR0aW5nKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5mb3JtYXR0aW5nPSBuZXcgRm9ybWF0dGluZyh0aGlzLm1vZGUsb3B0aW9ucz8uZm9ybWF0dGluZ09iaixvcHRpb25zPy5mb3JtYXR0aW5nU3RyaW5nKTtcclxuICAgICAgICAgICAgZWxzZSB0aGlzLmZvcm1hdHRpbmc9b3B0aW9ucy5mb3JtYXR0aW5nO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKG9wdGlvbnM/LmRyYXdBcnIpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvb3JkaW5hdGVzPW9wdGlvbnMuZHJhd0FycjtcclxuICAgICAgICAgICAgZWxzZSBpZiAob3B0aW9ucy5kcmF3U3RyaW5nIT09dW5kZWZpbmVkKXtcclxuICAgICAgICAgICAgICAgIHRoaXMuY29vcmRpbmF0ZXMgPSB0aGlzLmZpbGxDb29yZGluYXRlcyh0aGlzLmdldFNjaGVtYXRpYyhvcHRpb25zLmRyYXdTdHJpbmcpLCB0b2tlbnMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSovXHJcbiAgICB9XHJcbiAgICBjcmVhdGVGcm9tQXJyYXkoYXJyOiBhbnkpey8qXHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPGFyci5sZW5ndGg7aSsrKXtcclxuICAgICAgICAgICAgaWYgKGFycltpXSBpbnN0YW5jZW9mIEF4aXN8fGFycltpXSBpbnN0YW5jZW9mIENvb3JkaW5hdGUpe1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKGFycltpXSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZih0eXBlb2YgYXJyPT09XCJzdHJpbmdcIil7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goYXJyW2ldKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHJldHVybiBjb29yZGluYXRlc0FycmF5OyovXHJcbiAgICB9XHJcblxyXG4gICAgZmlsbENvb3JkaW5hdGVzKHNjaGVtYXRpYzogYW55W10sIHRva2Vucz86IEZvcm1hdFRpa3pqYXgpIHsvKlxyXG4gICAgICAgIGNvbnN0IGNvb3JBcnI6IEFycmF5PFRva2VuPj1bXTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHNjaGVtYXRpYy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAoc2NoZW1hdGljW2ldLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcHJldmlvdXNGb3JtYXR0aW5nO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChpID4gMCAmJiBzY2hlbWF0aWNbaSAtIDFdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAxXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaSA+IDEgJiYgc2NoZW1hdGljW2kgLSAxXS50eXBlID09PSBcIm5vZGVcIiAmJiBzY2hlbWF0aWNbaSAtIDJdLnR5cGUgPT09IFwiZm9ybWF0dGluZ1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXNGb3JtYXR0aW5nID0gc2NoZW1hdGljW2kgLSAyXS52YWx1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChuZXcgQXhpcygpLnVuaXZlcnNhbChzY2hlbWF0aWNbaV0udmFsdWUsIHRva2VucywgY29vckFyciwgcHJldmlvdXNGb3JtYXR0aW5nLCApKTtcclxuICAgICAgICAgICAgfSBlbHNlIGlmKHNjaGVtYXRpY1tpXS50eXBlID09PSBcIm5vZGVcIil7XHJcbiAgICAgICAgICAgICAgICBjb29yQXJyLnB1c2gobmV3IENvb3JkaW5hdGUoe2xhYmVsOiBzY2hlbWF0aWNbaV0udmFsdWUsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlLWlubGluZVwiLHt9LHNjaGVtYXRpY1tpXS5mb3JtYXR0aW5nKSxtb2RlOiBcIm5vZGUtaW5saW5lXCJ9KSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZXtcclxuICAgICAgICAgICAgICAgIGNvb3JBcnIucHVzaChzY2hlbWF0aWNbaV0udmFsdWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBjb29yQXJyOyovXHJcbiAgICB9XHJcblxyXG4gICAgZ2V0U2NoZW1hdGljKGRyYXc6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHJlZ2V4PWdldFJlZ2V4KCk7XHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0ZXNBcnJheSA9IFtdO1xyXG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IHJlZ0V4cChTdHJpbmcucmF3YG5vZGVcXHMqXFxbPygke3JlZ2V4LmZvcm1hdHRpbmd9KilcXF0/XFxzKnsoJHtyZWdleC50ZXh0fSopfWApO1xyXG4gICAgICAgIGNvbnN0IGZvcm1hdHRpbmdSZWdleCA9IC8oLS1jeWNsZXxjeWNsZXwtLVxcK1xcK3wtLVxcK3wtLXwtXFx8fFxcfC18Z3JpZHxjaXJjbGV8cmVjdGFuZ2xlKS87XHJcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxcc1xcLSwuOmA7IC8vIERlZmluZSBhbGxvd2VkIGNoYXJhY3RlcnMgZm9yIGBjYWBcclxuICAgICAgICBjb25zdCBjb29yZGluYXRlUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgKFxcKFske2NhfV0rXFwpfFxcKFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXFwtXStcXChbJHtjYX1dK1xcKVxcJFxcKSlgKTtcclxuICAgICAgICBsZXQgaSA9IDA7XHJcbiAgICAgICAgbGV0IGxvb3BzID0gMDtcclxuICAgICAgICBcclxuICAgICAgICB3aGlsZSAoaSA8IGRyYXcubGVuZ3RoICYmIGxvb3BzIDwgMTAwKSB7IC8vIEluY3JlYXNlIGxvb3AgbGltaXQgb3IgYWRkIGNvbmRpdGlvbiBiYXNlZCBvbiBwYXJzZWQgbGVuZ3RoXHJcbiAgICAgICAgICAgIGxvb3BzKys7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvb3JkaW5hdGVNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2goY29vcmRpbmF0ZVJlZ2V4KTtcclxuICAgICAgICAgICAgXHJcblxyXG4gICAgICAgICAgICBpZiAoY29vcmRpbmF0ZU1hdGNoPy5pbmRleCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXNBcnJheS5wdXNoKHsgdHlwZTogXCJjb29yZGluYXRlXCIsIHZhbHVlOiBjb29yZGluYXRlTWF0Y2hbMV0gfSk7XHJcbiAgICAgICAgICAgICAgICBpICs9IGNvb3JkaW5hdGVNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmdNYXRjaCA9IGRyYXcuc2xpY2UoaSkubWF0Y2goZm9ybWF0dGluZ1JlZ2V4KTtcclxuICAgICAgICAgICAgaWYgKGZvcm1hdHRpbmdNYXRjaD8uaW5kZXggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGkgKz0gZm9ybWF0dGluZ01hdGNoWzBdLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzQXJyYXkucHVzaCh7IHR5cGU6IFwiZm9ybWF0dGluZ1wiLCB2YWx1ZTogZm9ybWF0dGluZ01hdGNoWzBdIH0pO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBub2RlTWF0Y2ggPSBkcmF3LnNsaWNlKGkpLm1hdGNoKG5vZGVSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChub2RlTWF0Y2g/LmluZGV4ID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlc0FycmF5LnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIHR5cGU6IFwibm9kZVwiLFxyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG5vZGVNYXRjaFsxXSB8fCBcIlwiLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBub2RlTWF0Y2hbMl1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBub2RlTWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChsb29wcyA9PT0gMTAwKSB7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlBhcnNpbmcgZXhjZWVkZWQgc2FmZSBsb29wIGNvdW50XCIpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZXNBcnJheTtcclxuICAgIH1cclxuXHJcbiAgICBpc0Nvb3JkaW5hdGUob2JqOiBhbnkpOiBvYmogaXMgQ29vcmRpbmF0ZSB7XHJcbiAgICAgICAgcmV0dXJuIG9iaiAmJiBvYmogaW5zdGFuY2VvZiBDb29yZGluYXRlO1xyXG4gICAgfVxyXG4gICAgdG9TdHJpbmdEcmF3KCl7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyAke3RoaXMuZm9ybWF0dGluZz8udG9TdHJpbmcoKX0gYDtcclxuICAgICAgICB0aGlzLmNvb3JkaW5hdGVzLmZvckVhY2goKGNvb3JkaW5hdGU6IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xyXG4gICAgICAgICAgICBzd2l0Y2ggKHRydWUpIHtcclxuICAgICAgICAgICAgICAgIGNhc2UgY29vcmRpbmF0ZSBpbnN0YW5jZW9mIENvb3JkaW5hdGUmJmNvb3JkaW5hdGUubW9kZT09PVwibm9kZS1pbmxpbmVcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSBjb29yZGluYXRlLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBjYXNlIHR5cGVvZiBjb29yZGluYXRlPT09XCJzdHJpbmdcIjoge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSAvKC0tXFwrXFwrfC0tXFwrKS8udGVzdChjb29yZGluYXRlKT9cIi0tXCI6Y29vcmRpbmF0ZTtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGRlZmF1bHQ6IHtcclxuICAgICAgICAgICAgICAgICAgICByZXN1bHQgKz1gKCR7Y29vcmRpbmF0ZS50b1N0cmluZygpfSlgXHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIFwiO1wiO1xyXG4gICAgfVxyXG5cclxuICAgIHRvU3RyaW5nUGljKCl7XHJcbiAgICAgICAgbGV0IHJlc3VsdCA9IGBcXFxcZHJhdyBwaWMgJHt0aGlzLmZvcm1hdHRpbmcudG9TdHJpbmcoKXx8Jyd9IHthbmdsZSA9ICR7KHRoaXMuY29vcmRpbmF0ZXNbMF0gYXMgQXhpcykubmFtZX0tLSR7KHRoaXMuY29vcmRpbmF0ZXNbMV0gYXMgQXhpcykubmFtZX0tLSR7KHRoaXMuY29vcmRpbmF0ZXNbMl0gYXMgQXhpcykubmFtZX19IGA7XHJcbiAgICAgXHJcblxyXG4gICAgICAgIHJldHVybiByZXN1bHQgKyBcIjtcIjtcclxuICAgIH1cclxuXHJcbiAgICB0b1N0cmluZygpIHtcclxuICAgICAgICBpZiAodGhpcy5tb2RlPT09J2RyYXcnKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZ0RyYXcoKTtcclxuICAgICAgICBpZih0aGlzLm1vZGU9PT0nZHJhdy1waWMtYW5nJylcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudG9TdHJpbmdQaWMoKVxyXG4gICAgICAgIFxyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcbiAgXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbmZ1bmN0aW9uIGRpc3NlY3RYWWF4aXMobWF0Y2g6IFJlZ0V4cE1hdGNoQXJyYXkpIHtcclxuICAgIGxldCBYbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiLCBZbm9kZTpSZWdFeHBNYXRjaEFycmF5fHN0cmluZz1cIlwiO1xyXG5cclxuICAgIGlmIChtYXRjaFsxXSAmJiBtYXRjaFsyXSkge1xyXG4gICAgICAgIFhub2RlID0gbWF0Y2hbMV0ubWF0Y2goL1snYFwiXShbXFx3XFxkJiRdKylbJ2BcIl0vKXx8XCJcIjtcclxuICAgICAgICBZbm9kZSA9IG1hdGNoWzJdLm1hdGNoKC9bJ2BcIl0oW1xcd1xcZCYkXSspWydgXCJdLyl8fFwiXCI7XHJcbiAgICAgICAgWG5vZGU9WG5vZGVbMF0uc3Vic3RyaW5nKDEsWG5vZGUubGVuZ3RoKVxyXG4gICAgICAgIFlub2RlPVlub2RlWzBdLnN1YnN0cmluZygxLFlub2RlLmxlbmd0aClcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB0eXBlOiBcInh5YXhpc1wiLFxyXG4gICAgICAgIFhmb3JtYXR0aW5nOiBtYXRjaFsxXT8ucmVwbGFjZSgvKC0+fDwtfFsnYFwiXS4qP1snYFwiXSkvZywgXCJcIiksXHJcbiAgICAgICAgWWZvcm1hdHRpbmc6IG1hdGNoWzJdPy5yZXBsYWNlKC8oLT58PC18WydgXCJdLio/WydgXCJdKS9nLCBcIlwiKSxcclxuICAgICAgICB4RGlyZWN0aW9uOiBtYXRjaFsxXSAmJiAvLT4vLnRlc3QobWF0Y2hbMV0pID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIsXHJcbiAgICAgICAgeURpcmVjdGlvbjogbWF0Y2hbMl0gJiYgLy0+Ly50ZXN0KG1hdGNoWzJdKSA/IFwiZG93blwiIDogXCJ1cFwiLFxyXG4gICAgICAgIFhub2RlOiBYbm9kZSxcclxuICAgICAgICBZbm9kZTogWW5vZGUsXHJcbiAgICB9O1xyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbi8qXHJcbmZ1bmN0aW9uIGdlbmVyYXRlRm9ybWF0dGluZyhjb29yZGluYXRlOiBDb29yZGluYXRlKXtcclxuICAgIGlmICh0eXBlb2YgY29vcmRpbmF0ZS5sYWJlbCAhPT0gXCJzdHJpbmdcIil7IHJldHVybiBcIlwiOyB9XHJcbiAgICBjb25zdCBmb3JtYXR0aW5nID0gY29vcmRpbmF0ZS5mb3JtYXR0aW5nPy5zcGxpdChcIixcIikgfHwgW107XHJcbiAgICBpZiAoZm9ybWF0dGluZy5zb21lKCh2YWx1ZTogc3RyaW5nKSA9PiAvKGFib3ZlfGJlbG93fGxlZnR8cmlnaHQpLy50ZXN0KHZhbHVlKSkpIHtcclxuICAgICAgICByZXR1cm4gY29vcmRpbmF0ZS5mb3JtYXR0aW5nO1xyXG4gICAgfVxyXG4gICAgaWYoZm9ybWF0dGluZy5sZW5ndGg+MCYmIWZvcm1hdHRpbmdbZm9ybWF0dGluZy5sZW5ndGgtMV0uZW5kc1dpdGgoXCIsXCIpKXtmb3JtYXR0aW5nLnB1c2goXCIsXCIpfVxyXG4gICAgc3dpdGNoKGNvb3JkaW5hdGUucXVhZHJhbnQpe1xyXG4gICAgICAgIGNhc2UgMTpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSByaWdodCwgXCIpO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICAgIGNhc2UgMjpcclxuICAgICAgICBmb3JtYXR0aW5nLnB1c2goXCJhYm92ZSBsZWZ0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOlxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IGxlZnQsIFwiKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgICBjYXNlIDQ6IFxyXG4gICAgICAgIGZvcm1hdHRpbmcucHVzaChcImJlbG93IHJpZ2h0LCBcIik7XHJcbiAgICAgICAgYnJlYWs7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZy5qb2luKFwiXCIpO1xyXG59XHJcbiovXHJcblxyXG4iXX0=