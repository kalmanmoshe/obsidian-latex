//// @ts-nocheck
import { processTikzString } from "./BasicMathJaxTokenGroup";
import { Axis, Coordinate, Draw } from "../tikzjax";
import { findModifiedParenIndex, findParenIndex, mapBrackets } from "src/utils/ParenUtensils";
function labelFreeFormTextSeparation(label) {
    const colonIndex = label.findIndex(t => t.name === 'Colon');
    label = label.splice(colonIndex, label.length - colonIndex);
    return label.splice(1);
}
function cleanFormatting(formatting, subType) {
    const values = [];
    let currentGroup = [];
    const formattingKeys = [];
    if (subType === 'Label') {
        const label = labelFreeFormTextSeparation(formatting);
        formattingKeys.push({ key: 'freeFormText', value: label.toString() });
    }
    const bracketMap = mapBrackets('Curly_brackets_open', formatting);
    bracketMap.reverse();
    bracketMap.forEach((bracket) => {
        if (formatting[bracket.open - 1].name === 'Equals') {
            let subFormatting = formatting.splice(bracket.open - 1, bracket.close - (bracket.open - 2));
            subFormatting = subFormatting.slice(2, -1);
            formatting[bracket.open - 2].value = cleanFormatting(subFormatting, formatting[bracket.open - 2].name);
        }
    });
    for (const item of formatting) {
        if (item.name === 'Comma') {
            if (currentGroup.length > 0) {
                values.push(currentGroup);
                currentGroup = [];
            }
        }
        else {
            currentGroup.push(item);
        }
    }
    if (currentGroup.length > 0) {
        values.push(currentGroup);
    }
    values.forEach((value) => {
        formattingKeys.push(assignFormatting(value));
    });
    return formattingKeys;
}
function assignFormatting(formatting) {
    const isEquals = formatting.map((f, idx) => f.name === 'Equals' ? idx : null).filter(t => t !== null);
    const key = formatting[0]?.name;
    if (isEquals.length === 1)
        formatting = formatting.slice((isEquals[0] + 1));
    let value = interpretFormattingValue(formatting);
    return { key, value };
}
function interpretFormattingValue(formatting) {
    if (formatting.length === 1) {
        return formatting[0].value || true;
    }
    return formatting;
}
class TikzCommand {
    trigger;
    hookNum;
    hooks;
    content;
    addCommand(trigger, hookNum, content) {
        this.trigger = trigger;
        this.hookNum = hookNum;
        this.content = content;
        this.findHooks();
        return this;
    }
    findHooks() {
        const hashtagMap = this.content.map((item, index) => item.getStringValue() === 'Hashtag' && this.content[index + 1].getType() === 'number' ? index : null)
            .filter(t => t !== null);
        if (hashtagMap.length !== this.hookNum) {
            throw new Error(`Discrepancy between the number of hooks declared and the number of hooks found in the command hookNum: ${this.hookNum} hashtagMap.length: ${hashtagMap.length}`);
        }
        hashtagMap.sort((a, b) => b - a); /*
        hashtagMap.forEach(idx => {
            const hashtag=this.content[idx];
            hashtag.type='Syntax'
            hashtag.name='hook'
            hashtag.value=this.content[idx+1]?.value;
            this.content.splice(idx+1,1)
        });*/
    }
    getInfo() {
        return { trigger: this.trigger, hooks: this.hookNum };
    }
}
class TikzCommands {
    commands = [];
    constructor() { }
    ;
    addCommand(tokens) {
    }
    addCommandByInterpretation(tokens) {
        console.log('tokens', tokens);
        const id1Token = tokens.find((item) => item.name === 'Curly_brackets_open');
        if (!id1Token) {
            console.error("Error: 'Curly_brackets_open' not found in tokens.");
            return;
        }
        let id1 = id1Token.value;
        const id2 = findModifiedParenIndex(id1, tokens, 0, 1);
        const id3 = findModifiedParenIndex(id1, tokens, 0, 1, 'Curly_brackets_open');
        if (!id2 || !id3) {
            console.error("Error: Unable to find matching brackets.");
            return;
        }
        id1 = findParenIndex(id1, tokens);
        let trigger, hooks, content;
        content = tokens.splice(id3.open + 1, id3.close - id3.open - 1);
        hooks = tokens.splice(id2.open + 1, id2.close - id2.open - 1);
        trigger = tokens.splice(id1.open + 1, id1.close - id1.open - 1);
        if (hooks.length === 1 && hooks[0]?.type === 'number') {
            hooks = hooks[0].value;
        }
        else {
            throw new Error("Invalid hooks: Expected a single numeric value.");
        }
        if (trigger.length === 1 && trigger[0]?.type === 'string') {
            trigger = trigger[0].value;
        }
        else {
            throw new Error("Invalid trigger: Expected a single string value.");
        }
        this.commands.push(new TikzCommand().addCommand(trigger, hooks, content));
    }
    replaceCallWithCommand(trigger, hookNumber, hooks) {
        const content = this.commands.find(command => command.trigger === trigger && hookNumber === command.hookNum)?.content;
        if (!content)
            return null;
        const map = content?.map((item, index) => item.getStringValue() === 'hook' ? { index, value: item.getStringValue() } : null).filter(t => t !== null);
        map?.reverse();
        const uniqueValues = new Set(); /*Remove this disk for the err
        for (const { index, value } of map || []) {
            if (!uniqueValues.has(value)) {
                uniqueValues.add(value);
            }
            content.splice(index, 1, ...hooks[value-1]);
        }
        return content*/
    }
    getHooks(tokens, ids) {
        tokens.splice(0, 1);
        const adjustmentValue = ids[0].open;
        ids.forEach(id => {
            id.open -= adjustmentValue;
            id.close -= adjustmentValue;
        });
        ids.reverse();
        const hooks = [];
        ids.forEach(id => {
            const removed = tokens.splice(id.open + 1, id.close - (id.open + 1));
            hooks.push(removed);
        });
        hooks.reverse();
        return hooks;
    }
}
export class TikzVariable {
}
export class TikzVariables {
    variables = [];
}
export class FormatTikzjax {
    source;
    tokens = [];
    tikzCommands = new TikzCommands();
    //midPoint: Axis;
    viewAnchors;
    processedCode = "";
    debugInfo = "";
    constructor(source, toEval) {
        if (toEval) {
            console.log(processTikzString(source));
        }
        /*
        if(!source.match(/(usepackage|usetikzlibrary)/)){
            const basicTikzTokens=new BasicTikzTokens(source)
            console.log('basicTikzTokens',basicTikzTokens)
            this.tokenize(basicTikzTokens.getTokens())
            console.log('tokenize',this.tokens)
            this.processedCode += this.toString()

            this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"
        }*/
        else {
            this.processedCode = source;
        }
        this.processedCode = this.tidyTikzSource(source);
        this.debugInfo += this.processedCode;
    }
    tidyTikzSource(source) {
        const remove = "&nbsp;";
        source = source.replaceAll(remove, "");
        let lines = source.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g, "");
    }
    tokenize(basicTikzTokens) {
        let endIndex;
        for (let i = 0; i < basicTikzTokens.length; i++) {
            if (basicTikzTokens[i].name === 'Draw') {
                endIndex = basicTikzTokens.slice(i).findIndex(t => t.name === 'Semicolon') + i;
                const segment = basicTikzTokens.slice(i + 1, endIndex);
                i = endIndex;
                this.tokens.push(new Draw('draw').fillCoordinates(segment));
            }
            if (basicTikzTokens[i].name === 'Coordinate') {
                endIndex = basicTikzTokens.slice(i).findIndex(t => t.name === 'Semicolon') + i;
                const segment = basicTikzTokens.slice(i + 1, endIndex);
                console.log(segment);
                i = endIndex;
                this.tokens.push(new Coordinate('coordinate').interpretCoordinate(segment));
            }
        }
        /*
        They're going to be three types stringed syntax number.
         I use them to tokenize. using the ticks commands. Once tokenizer takes commands.
         I move on to actual evaluation.
        */
        let subdefinedTokens = [];
        /*
        for (let i=0;i<basicTikzTokens.length;i++){

        }*/
    }
    getCode(app) {
        if (typeof this.source === "string" && this.source.match(/(usepackage|usetikzlibrary)/)) {
            return this.processedCode;
        }
        return getPreamble(app) + this.processedCode + "\n\\end{tikzpicture}\\end{document}";
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
        return undefined; /*
        const og = this.tokens.slice().reverse().find(
            (token: Token) =>
                (token instanceof Coordinate) && token.coordinateName === value
        );
        return og instanceof Coordinate ? og.clone() : undefined;*/
    }
    toString() {
        let codeBlockOutput = "";
        console.log('this.tokens', this.tokens);
        //const extremeXY=getExtremeXY(this.tokens);
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
import * as fs from 'fs';
import { FileSystemAdapter } from "obsidian";
function getStyFileContent(filePath) {
    try {
        // Check if the file exists before trying to read
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        else {
            console.error(`File does not exist: ${filePath}`);
            return '';
        }
    }
    catch (error) {
        console.error('Error reading the .sty file:', error instanceof Error ? error.message : error);
        return '';
    }
}
import * as path from 'path';
function getPreamble(app) {
    let styContent = '';
    const adapter = app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
        const vaultPath = adapter.getBasePath();
        const preamblePath = path.join(vaultPath, 'obsidian', 'data', 'Files', 'preamble.sty');
        styContent = getStyFileContent(preamblePath);
    }
    styContent = styContent.split('\n').filter(line => !line.match(/(int|frac)/)).join('\n');
    const ang = "\\tikzset{ang/.style 2 args={fill=black!50,opacity=0.5,text opacity=0.9,draw=orange,<->,angle eccentricity=#1,angle radius=#2cm,text=orange,font=\\large},ang/.default={1.6}{0.5}}";
    const mark = "\\def\\mark#1#2#3{\\path [decoration={markings, mark=at position 0.5 with {\\foreach \\x in {#1} { \\draw[line width=1pt] (\\x,-3pt) -- (\\x,3pt); }}}, postaction=decorate] (#2) -- (#3);}";
    const arr = "\\newcommand{\\arr}[8]{\\coordinate (2) at ($(#2)!#7!(#3)$);\\coordinate (1) at ($(2)!#5mm!90:(#3)$);\\coordinate (3) at ($(2)!#5mm+#4cm!#8:(#3)$);\\draw [line width=1pt,<-] (1)--(3)node [pos=#6] {\\large #1};}";
    const lene = "\\def\\cor#1#2#3#4#5{\\coordinate (#1) at($(#2)!#3!#4:(#5)$);}\\def\\dr#1#2{\\draw [line width=#1,]#2;}\\newcommand{\\len}[6]{\\cor{1}{#2}{#3}{90}{#4}\\cor{3}{#4}{#3}{-90}{#2}\\node (2) at ($(1)!0.5!(3)$) [rotate=#6]{\\large #1};\\dr{#5pt,|<-}{(1)--(2)}\\dr{#5pt,->|}{(2)--(3)}}";
    const spring = "\\newcommand{\\spring}[4]{\\tikzmath{coordinate \\start, \\done;\\start = (#1);\\done = (#2);}\\draw[thick] ($(\\start) + (-1.5,0)$) --++(3,0);\\draw (\\start) --+ (0,-0.25cm);\\draw ($(\\start) + (\\donex+0cm,\\doney+0.25cm)$)--+(0,-0.25);\\draw[decoration={aspect=0.3, segment length=3, amplitude=2mm,coil,},decorate] (\\startx,\\starty-0.25cm) --($(\\start) + (\\donex,\\doney+0.25cm)$)node[midway,right=0.25cm,black]{#4};\\node[fill=yellow!60,draw,text=black,anchor= north] at ($(\\start) + (\\donex,\\doney)$){#3};}";
    const tree = "\\newcommand{\\lenu}[3]{\\tikzset{level distance=20mm,level #1/.style={sibling distance=#2mm, nodes={fill=red!#3,circle,inner sep=1pt,draw=none,text=black,}}}}";
    const table = "\\tikzset{ table/.style={matrix of nodes,row sep=-\\pgflinewidth,column sep=-\\pgflinewidth,nodes={rectangle,draw=black,align=center},minimum height=1.5em,text depth=0.5ex,text height=2ex,nodes in empty cells,every even row/.style={nodes={fill=gray!60,text=black,}},column 1/.style={nodes={text width=5em,font=\\bfseries}},row 1/.style={nodes={font=\\bfseries}}}}";
    const coor = "\\def\\coor#1#2#3#4{\\coordinate [label={[#4]:\\Large #3}] (#2) at ($(#1)$);}";
    const mass = `\\def\\mass#1#2{\\node[fill=yellow!60,draw,text=black,anchor= north] at (#1){#2};}`;
    const massSet = "\\tikzset{ mass/.style={fill=yellow!60,draw,text=black}}";
    const dvector = "\\newcommand{\\dvector}[2]{\\coordinate (temp1) at ($(0,0 -| #1)$);\\coordinate (temp2) at ($(0,0 |- #1)$);\\draw [line width=0.7pt,#2] (#1)--(temp1)(#1)--(temp2);}";
    const picAng = "\\newcommand{\\ang}[5]{\\coordinate (ang1) at (#1); \\coordinate (ang2) at (#2); \\coordinate (ang3) at (#3); \\pgfmathanglebetweenpoints{\\pgfpointanchor{ang3}{center}}{\\pgfpointanchor{ang2}{center}}\\let\\angCB\\pgfmathresult\\pgfmathanglebetweenpoints{\\pgfpointanchor{ang2}{center}}{\\pgfpointanchor{ang1}{center}}\\let\\angAB\\pgfmathresult\\pgfmathparse{\\angCB - \\angAB}\\ifdim\\pgfmathresult pt<0pt\\pgfmathparse{\\pgfmathresult + 360}\\fi\\ifdim\\pgfmathresult pt>180pt\\pgfmathparse{360 - \\pgfmathresult}\\fi\\let\\angB\\pgfmathresult\\pgfmathsetmacro{\\angleCheck}{abs(\\angB - 90)}\\ifthenelse{\\lengthtest{\\angleCheck pt < 0.1pt}}{\\pic [ang#5,\"{${#4}\$}\",]{right angle=ang1--ang2--ang3};}{\\pic [ang#5,\"{${#4}\$}\",]{angle=ang1--ang2--ang3};}}";
    const preamble = "\\usepackage{pgfplots,ifthen}\\usetikzlibrary{arrows.meta,angles,quotes,positioning, calc, intersections,decorations.markings,math,spy,matrix,patterns,snakes,decorations.pathreplacing,decorations.pathmorphing,patterns,shadows,shapes.symbols}";
    return preamble + styContent + ang + mark + arr + lene + spring + tree + table + coor + dvector + picAng + massSet + "\\pgfplotsset{compat=1.16}\\begin{document}\\begin{tikzpicture}";
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxnQkFBZ0I7QUFFaEIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDN0QsT0FBTyxFQUFvQixJQUFJLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBc0MsTUFBTSxZQUFZLENBQUM7QUFDMUcsT0FBTyxFQUErQixzQkFBc0IsRUFBRSxjQUFjLEVBQWlCLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBRzFJLFNBQVMsMkJBQTJCLENBQUMsS0FBWTtJQUM3QyxNQUFNLFVBQVUsR0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxPQUFPLENBQUMsQ0FBQTtJQUNwRCxLQUFLLEdBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUMsS0FBSyxDQUFDLE1BQU0sR0FBQyxVQUFVLENBQUMsQ0FBQTtJQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDMUIsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLFVBQWlCLEVBQUMsT0FBZ0I7SUFDdkQsTUFBTSxNQUFNLEdBQVksRUFBRSxDQUFDO0lBQzNCLElBQUksWUFBWSxHQUFVLEVBQUUsQ0FBQztJQUM3QixNQUFNLGNBQWMsR0FBQyxFQUFFLENBQUE7SUFFdkIsSUFBRyxPQUFPLEtBQUcsT0FBTyxFQUFDLENBQUM7UUFDbEIsTUFBTSxLQUFLLEdBQUMsMkJBQTJCLENBQUMsVUFBVSxDQUFDLENBQUE7UUFDbkQsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFDLEdBQUcsRUFBRSxjQUFjLEVBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsRUFBQyxDQUFD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YyxDQUFDLENBQUM7UUFDdEYsVUFBVSxHQUFHLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ2pELENBQUM7SUFDRCxVQUFVLEdBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFBLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7SUFFcEYsTUFBTSxHQUFHLEdBQUMsb0xBQW9MLENBQUE7SUFFOUwsTUFBTSxJQUFJLEdBQUMsNkxBQTZMLENBQUE7SUFFeE0sTUFBTSxHQUFHLEdBQUMsb05BQW9OLENBQUE7SUFDOU4sTUFBTSxJQUFJLEdBQUMsd1JBQXdSLENBQUE7SUFDblMsTUFBTSxNQUFNLEdBQUMsMGdCQUEwZ0IsQ0FBQTtJQUV2aEIsTUFBTSxJQUFJLEdBQUMsaUtBQWlLLENBQUE7SUFFNUssTUFBTSxLQUFLLEdBQUMsNldBQTZXLENBQUE7SUFDelgsTUFBTSxJQUFJLEdBQUMsK0VBQStFLENBQUE7SUFDMUYsTUFBTSxJQUFJLEdBQUMsb0ZBQW9GLENBQUE7SUFDL0YsTUFBTSxPQUFPLEdBQUMsMERBQTBELENBQUE7SUFDeEUsTUFBTSxPQUFPLEdBQUMsc0tBQXNLLENBQUE7SUFFcEwsTUFBTSxNQUFNLEdBQUMsOHZCQUE4dkIsQ0FBQTtJQUMzd0IsTUFBTSxRQUFRLEdBQUMsbVBBQW1QLENBQUE7SUFFbFEsT0FBTyxRQUFRLEdBQUMsVUFBVSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxNQUFNLEdBQUMsSUFBSSxHQUFDLEtBQUssR0FBQyxJQUFJLEdBQUMsT0FBTyxHQUFDLE1BQU0sR0FBQyxPQUFPLEdBQUMsaUVBQWlFLENBQUE7QUFDaEssQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vLy8gQHRzLW5vY2hlY2tcblxuaW1wb3J0IHsgcHJvY2Vzc1Rpa3pTdHJpbmcgfSBmcm9tIFwiLi9CYXNpY01hdGhKYXhUb2tlbkdyb3VwXCI7XG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCByZWdFeHAsIFRva2VuLCB0b1BvaW50IH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcbmltcG9ydCB7IGZpbmREZWVwZXN0UGFyZW50aGVzZXNTY29wZSwgZmluZE1vZGlmaWVkUGFyZW5JbmRleCwgZmluZFBhcmVuSW5kZXgsIGlkUGFyZW50aGVzZXMsIG1hcEJyYWNrZXRzIH0gZnJvbSBcInNyYy91dGlscy9QYXJlblV0ZW5zaWxzXCI7XG5cblxuZnVuY3Rpb24gbGFiZWxGcmVlRm9ybVRleHRTZXBhcmF0aW9uKGxhYmVsOiBhbnlbXSl7XG4gICAgY29uc3QgY29sb25JbmRleD1sYWJlbC5maW5kSW5kZXgodD0+dC5uYW1lPT09J0NvbG9uJylcbiAgICAgbGFiZWw9bGFiZWwuc3BsaWNlKGNvbG9uSW5kZXgsbGFiZWwubGVuZ3RoLWNvbG9uSW5kZXgpXG4gICAgcmV0dXJuIGxhYmVsLnNwbGljZSgxKVxufVxuXG5mdW5jdGlvbiBjbGVhbkZvcm1hdHRpbmcoZm9ybWF0dGluZzogYW55W10sc3ViVHlwZT86IHN0cmluZyk6IGFueVtdIHtcbiAgICBjb25zdCB2YWx1ZXM6IGFueVtdW10gPSBbXTtcbiAgICBsZXQgY3VycmVudEdyb3VwOiBhbnlbXSA9IFtdO1xuICAgIGNvbnN0IGZvcm1hdHRpbmdLZXlzPVtdXG5cbiAgICBpZihzdWJUeXBlPT09J0xhYmVsJyl7XG4gICAgICAgIGNvbnN0IGxhYmVsPWxhYmVsRnJlZUZvcm1UZXh0U2VwYXJhdGlvbihmb3JtYXR0aW5nKVxuICAgICAgICBmb3JtYXR0aW5nS2V5cy5wdXNoKHtrZXk6ICdmcmVlRm9ybVRleHQnLHZhbHVlOiBsYWJlbC50b1N0cmluZygpfSlcbiAgICB9XG4gICAgXG5cbiAgICBjb25zdCBicmFja2V0TWFwPW1hcEJyYWNrZXRzKCdDdXJseV9icmFja2V0c19vcGVuJyxmb3JtYXR0aW5nKTtcbiAgICBicmFja2V0TWFwLnJldmVyc2UoKVxuICAgIGJyYWNrZXRNYXAuZm9yRWFjaCgoYnJhY2tldDogeyBvcGVuOiBudW1iZXI7IGNsb3NlOiBudW1iZXI7IH0pID0+IHtcbiAgICAgICAgaWYoZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMV0ubmFtZT09PSdFcXVhbHMnKXtcbiAgICAgICAgICAgIGxldCBzdWJGb3JtYXR0aW5nPWZvcm1hdHRpbmcuc3BsaWNlKGJyYWNrZXQub3Blbi0xLGJyYWNrZXQuY2xvc2UtKGJyYWNrZXQub3Blbi0yKSlcbiAgICAgICAgICAgIHN1YkZvcm1hdHRpbmc9c3ViRm9ybWF0dGluZy5zbGljZSgyLC0xKVxuICAgICAgICAgICAgZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMl0udmFsdWU9Y2xlYW5Gb3JtYXR0aW5nKHN1YkZvcm1hdHRpbmcsZm9ybWF0dGluZ1ticmFja2V0Lm9wZW4tMl0ubmFtZSlcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGZvcm1hdHRpbmcpIHtcbiAgICAgICAgaWYgKGl0ZW0ubmFtZSA9PT0gJ0NvbW1hJykge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcbiAgICAgICAgICAgICAgICBjdXJyZW50R3JvdXAgPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGN1cnJlbnRHcm91cC5wdXNoKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xuICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xuICAgIH1cblxuICAgIFxuICAgIHZhbHVlcy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuICAgICAgICBmb3JtYXR0aW5nS2V5cy5wdXNoKGFzc2lnbkZvcm1hdHRpbmcodmFsdWUpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gZm9ybWF0dGluZ0tleXMgXG59XG5cbmZ1bmN0aW9uIGFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZzogYW55W10pOiBhbnl7XG5cbiAgICBjb25zdCBpc0VxdWFscz1mb3JtYXR0aW5nLm1hcCgoZixpZHgpPT5mLm5hbWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKHQ9PnQhPT1udWxsKTtcbiAgICBjb25zdCBrZXk9Zm9ybWF0dGluZ1swXT8ubmFtZVxuXG4gICAgaWYoaXNFcXVhbHMubGVuZ3RoPT09MSlcbiAgICAgICAgZm9ybWF0dGluZz1mb3JtYXR0aW5nLnNsaWNlKChpc0VxdWFsc1swXSsxKSlcblxuICAgIGxldCB2YWx1ZT1pbnRlcnByZXRGb3JtYXR0aW5nVmFsdWUoZm9ybWF0dGluZyk7XG4gICAgcmV0dXJuIHtrZXksdmFsdWV9XG59XG5cblxuZnVuY3Rpb24gaW50ZXJwcmV0Rm9ybWF0dGluZ1ZhbHVlKGZvcm1hdHRpbmc6IHN0cmluZyB8IGFueVtdKXtcbiAgICBpZiAoZm9ybWF0dGluZy5sZW5ndGg9PT0xKXtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRpbmdbMF0udmFsdWV8fHRydWVcbiAgICB9XG4gICAgcmV0dXJuIGZvcm1hdHRpbmdcbn1cblxuY2xhc3MgVGlrekNvbW1hbmR7XG4gICAgdHJpZ2dlcjogc3RyaW5nO1xuICAgIGhvb2tOdW06IG51bWJlcjtcbiAgICBob29rczogYW55O1xuICAgIGNvbnRlbnQ6IEJhc2ljVGlrelRva2VuW11cbiAgICBhZGRDb21tYW5kKHRyaWdnZXI6IHN0cmluZywgaG9va051bTogbnVtYmVyLCBjb250ZW50OiBhbnlbXSl7XG4gICAgICAgIHRoaXMudHJpZ2dlcj10cmlnZ2VyO1xuICAgICAgICB0aGlzLmhvb2tOdW09aG9va051bTtcbiAgICAgICAgdGhpcy5jb250ZW50PWNvbnRlbnQ7XG4gICAgICAgIHRoaXMuZmluZEhvb2tzKClcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG4gICAgZmluZEhvb2tzKCl7XG4gICAgICAgIGNvbnN0IGhhc2h0YWdNYXA9dGhpcy5jb250ZW50Lm1hcCgoaXRlbSxpbmRleCk9Pml0ZW0uZ2V0U3RyaW5nVmFsdWUoKT09PSdIYXNodGFnJyYmdGhpcy5jb250ZW50W2luZGV4KzFdLmdldFR5cGUoKT09PSdudW1iZXInP2luZGV4Om51bGwpXG4gICAgICAgIC5maWx0ZXIodD0+dCE9PW51bGwpXG4gICAgICAgIGlmKGhhc2h0YWdNYXAubGVuZ3RoIT09dGhpcy5ob29rTnVtKXtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRGlzY3JlcGFuY3kgYmV0d2VlbiB0aGUgbnVtYmVyIG9mIGhvb2tzIGRlY2xhcmVkIGFuZCB0aGUgbnVtYmVyIG9mIGhvb2tzIGZvdW5kIGluIHRoZSBjb21tYW5kIGhvb2tOdW06ICR7dGhpcy5ob29rTnVtfSBoYXNodGFnTWFwLmxlbmd0aDogJHtoYXNodGFnTWFwLmxlbmd0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICBoYXNodGFnTWFwLnNvcnQoKGEsYik9PmItYSkvKlxuICAgICAgICBoYXNodGFnTWFwLmZvckVhY2goaWR4ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGhhc2h0YWc9dGhpcy5jb250ZW50W2lkeF07XG4gICAgICAgICAgICBoYXNodGFnLnR5cGU9J1N5bnRheCdcbiAgICAgICAgICAgIGhhc2h0YWcubmFtZT0naG9vaydcbiAgICAgICAgICAgIGhhc2h0YWcudmFsdWU9dGhpcy5jb250ZW50W2lkeCsxXT8udmFsdWU7XG4gICAgICAgICAgICB0aGlzLmNvbnRlbnQuc3BsaWNlKGlkeCsxLDEpXG4gICAgICAgIH0pOyovXG4gICAgfVxuICAgIGdldEluZm8oKXtcbiAgICAgICAgcmV0dXJuIHt0cmlnZ2VyOiB0aGlzLnRyaWdnZXIsaG9va3M6IHRoaXMuaG9va051bX1cbiAgICB9XG59XG5cbmNsYXNzIFRpa3pDb21tYW5kc3tcbiAgICBjb21tYW5kczogVGlrekNvbW1hbmRbXT1bXTtcbiAgICBjb25zdHJ1Y3Rvcigpe307XG4gICAgYWRkQ29tbWFuZCh0b2tlbnM6IGFueSl7XG4gICAgICAgIFxuICAgIH1cbiAgICBhZGRDb21tYW5kQnlJbnRlcnByZXRhdGlvbih0b2tlbnM6IGFueVtdKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCd0b2tlbnMnLHRva2VucylcbiAgICAgICAgY29uc3QgaWQxVG9rZW4gPSB0b2tlbnMuZmluZCgoaXRlbSkgPT4gaXRlbS5uYW1lID09PSAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xuICAgICAgICBpZiAoIWlkMVRva2VuKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6ICdDdXJseV9icmFja2V0c19vcGVuJyBub3QgZm91bmQgaW4gdG9rZW5zLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBsZXQgaWQxID0gaWQxVG9rZW4udmFsdWU7XG4gICAgICAgIGNvbnN0IGlkMiA9IGZpbmRNb2RpZmllZFBhcmVuSW5kZXgoaWQxLCB0b2tlbnMsIDAsIDEpO1xuICAgICAgICBjb25zdCBpZDMgPSBmaW5kTW9kaWZpZWRQYXJlbkluZGV4KGlkMSwgdG9rZW5zLCAwLCAxLCAnQ3VybHlfYnJhY2tldHNfb3BlbicpO1xuICAgIFxuICAgICAgICBpZiAoIWlkMiB8fCAhaWQzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3I6IFVuYWJsZSB0byBmaW5kIG1hdGNoaW5nIGJyYWNrZXRzLlwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZDE9ZmluZFBhcmVuSW5kZXgoaWQxLCB0b2tlbnMpXG4gICAgICAgIGxldCB0cmlnZ2VyLCBob29rcywgY29udGVudDtcbiAgICAgICAgY29udGVudCA9IHRva2Vucy5zcGxpY2UoaWQzLm9wZW4gKyAxLCBpZDMuY2xvc2UgLSBpZDMub3BlbiAtIDEpO1xuICAgICAgICBob29rcyA9IHRva2Vucy5zcGxpY2UoaWQyLm9wZW4gKyAxLCBpZDIuY2xvc2UgLSBpZDIub3BlbiAtIDEpO1xuICAgICAgICB0cmlnZ2VyID0gdG9rZW5zLnNwbGljZShpZDEub3BlbisxLCBpZDEuY2xvc2UgLSBpZDEub3BlbiAtIDEpO1xuXG4gICAgICAgIGlmIChob29rcy5sZW5ndGggPT09IDEgJiYgaG9va3NbMF0/LnR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICBob29rcyA9IGhvb2tzWzBdLnZhbHVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBob29rczogRXhwZWN0ZWQgYSBzaW5nbGUgbnVtZXJpYyB2YWx1ZS5cIik7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmICh0cmlnZ2VyLmxlbmd0aCA9PT0gMSAmJiB0cmlnZ2VyWzBdPy50eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdHJpZ2dlciA9IHRyaWdnZXJbMF0udmFsdWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIHRyaWdnZXI6IEV4cGVjdGVkIGEgc2luZ2xlIHN0cmluZyB2YWx1ZS5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jb21tYW5kcy5wdXNoKG5ldyBUaWt6Q29tbWFuZCgpLmFkZENvbW1hbmQodHJpZ2dlciwgaG9va3MsIGNvbnRlbnQpKVxuICAgIH1cblxuICAgIHJlcGxhY2VDYWxsV2l0aENvbW1hbmQodHJpZ2dlcjogc3RyaW5nLGhvb2tOdW1iZXI6IG51bWJlcixob29rczogYW55W10pe1xuICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5jb21tYW5kcy5maW5kKGNvbW1hbmQgPT4gXG4gICAgICAgICAgICBjb21tYW5kLnRyaWdnZXIgPT09IHRyaWdnZXIgJiYgaG9va051bWJlciA9PT0gY29tbWFuZC5ob29rTnVtXG4gICAgICAgICk/LmNvbnRlbnQ7XG4gICAgICAgIGlmKCFjb250ZW50KXJldHVybiBudWxsO1xuICAgICAgICBjb25zdCBtYXAgPSBjb250ZW50Py5tYXAoKGl0ZW0sIGluZGV4KSA9PiBcbiAgICAgICAgICAgIGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSA9PT0gJ2hvb2snID8geyBpbmRleCwgdmFsdWU6IGl0ZW0uZ2V0U3RyaW5nVmFsdWUoKSB9IDogbnVsbFxuICAgICAgICApLmZpbHRlcih0ID0+IHQgIT09IG51bGwpO1xuICAgICAgICBtYXA/LnJldmVyc2UoKTtcblxuICAgICAgICBjb25zdCB1bmlxdWVWYWx1ZXMgPSBuZXcgU2V0KCk7LypSZW1vdmUgdGhpcyBkaXNrIGZvciB0aGUgZXJyXG4gICAgICAgIGZvciAoY29uc3QgeyBpbmRleCwgdmFsdWUgfSBvZiBtYXAgfHwgW10pIHtcbiAgICAgICAgICAgIGlmICghdW5pcXVlVmFsdWVzLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB1bmlxdWVWYWx1ZXMuYWRkKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnRlbnQuc3BsaWNlKGluZGV4LCAxLCAuLi5ob29rc1t2YWx1ZS0xXSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbnRlbnQqL1xuICAgIH1cblxuICAgIGdldEhvb2tzKHRva2VuczogYW55W10saWRzOiBhbnlbXSl7XG4gICAgICAgIHRva2Vucy5zcGxpY2UoMCwxKVxuICAgICAgICBjb25zdCBhZGp1c3RtZW50VmFsdWU9aWRzWzBdLm9wZW5cbiAgICAgICAgaWRzLmZvckVhY2goaWQgPT4ge1xuICAgICAgICAgICAgaWQub3Blbi09YWRqdXN0bWVudFZhbHVlO1xuICAgICAgICAgICAgaWQuY2xvc2UtPWFkanVzdG1lbnRWYWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGlkcy5yZXZlcnNlKCk7XG4gICAgICAgIGNvbnN0IGhvb2tzOiBhbnlbXVtdPVtdXG4gICAgICAgIGlkcy5mb3JFYWNoKGlkID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlbW92ZWQ9dG9rZW5zLnNwbGljZShpZC5vcGVuKzEsaWQuY2xvc2UtKGlkLm9wZW4rMSkpXG4gICAgICAgICAgICBob29rcy5wdXNoKHJlbW92ZWQpXG4gICAgICAgIH0pO1xuICAgICAgICBob29rcy5yZXZlcnNlKCk7XG4gICAgICAgIHJldHVybiBob29rc1xuICAgIH1cbiAgICBcbn1cblxuXG5leHBvcnQgY2xhc3MgVGlrelZhcmlhYmxle1xuICAgIC8vdHlwZTogXG5cbn1cbmV4cG9ydCBjbGFzcyBUaWt6VmFyaWFibGVze1xuICAgIHZhcmlhYmxlczogW109W11cblxufVxuXG5cbmV4cG9ydCBjbGFzcyBGb3JtYXRUaWt6amF4IHtcblx0c291cmNlOiBzdHJpbmc7XG4gICAgdG9rZW5zOiBBcnJheTxUb2tlbj49W107XG4gICAgdGlrekNvbW1hbmRzOiBUaWt6Q29tbWFuZHM9bmV3IFRpa3pDb21tYW5kcygpO1xuICAgIC8vbWlkUG9pbnQ6IEF4aXM7XG4gICAgcHJpdmF0ZSB2aWV3QW5jaG9yczoge21heDogQXhpcyxtaW46QXhpcyxhdmVNaWRQb2ludDogQXhpc31cblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xuICAgIGRlYnVnSW5mbyA9IFwiXCI7XG4gICAgXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nLHRvRXZhbD86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYodG9FdmFsKXtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKHByb2Nlc3NUaWt6U3RyaW5nKHNvdXJjZSkpXG4gICAgICAgIH1cbiAgICAgICAgLypcbiAgICAgICAgaWYoIXNvdXJjZS5tYXRjaCgvKHVzZXBhY2thZ2V8dXNldGlremxpYnJhcnkpLykpe1xuICAgICAgICAgICAgY29uc3QgYmFzaWNUaWt6VG9rZW5zPW5ldyBCYXNpY1Rpa3pUb2tlbnMoc291cmNlKVxuICAgICAgICAgICAgY29uc29sZS5sb2coJ2Jhc2ljVGlrelRva2VucycsYmFzaWNUaWt6VG9rZW5zKVxuICAgICAgICAgICAgdGhpcy50b2tlbml6ZShiYXNpY1Rpa3pUb2tlbnMuZ2V0VG9rZW5zKCkpXG4gICAgICAgICAgICBjb25zb2xlLmxvZygndG9rZW5pemUnLHRoaXMudG9rZW5zKVxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlICs9IHRoaXMudG9TdHJpbmcoKVxuXG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXG4gICAgICAgIH0qL1xuICAgICAgICBlbHNlIHt0aGlzLnByb2Nlc3NlZENvZGU9c291cmNlO31cbiAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXRoaXMudGlkeVRpa3pTb3VyY2Uoc291cmNlKTtcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPXRoaXMucHJvY2Vzc2VkQ29kZTtcblx0fVxuICAgIHRpZHlUaWt6U291cmNlKHNvdXJjZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XG4gICAgICAgIHNvdXJjZSA9IHNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gc291cmNlLnNwbGl0KFwiXFxuXCIpO1xuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpLnJlcGxhY2UoLyg/PD1bXlxcd10pIHwgKD89W15cXHddKS9nLCBcIlwiKS5yZXBsYWNlKC8oPzwhXFxcXCklLiokL2dtLCBcIlwiKS5yZXBsYWNlKC9cXG4vZyxcIlwiKTtcbiAgICB9XG4gICAgdG9rZW5pemUoYmFzaWNUaWt6VG9rZW5zOiBhbnlbXSl7XG4gICAgICAgIGxldCBlbmRJbmRleFxuICAgICAgICBmb3IobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdEcmF3Jyl7XG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcbiAgICAgICAgICAgICAgICBpPWVuZEluZGV4XG4gICAgICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdygnZHJhdycpLmZpbGxDb29yZGluYXRlcyhzZWdtZW50KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdDb29yZGluYXRlJyl7XG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZ21lbnQ9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkrMSxlbmRJbmRleClcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhzZWdtZW50KVxuICAgICAgICAgICAgICAgIGk9ZW5kSW5kZXhcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKCdjb29yZGluYXRlJykuaW50ZXJwcmV0Q29vcmRpbmF0ZShzZWdtZW50KSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvKlxuICAgICAgICBUaGV5J3JlIGdvaW5nIHRvIGJlIHRocmVlIHR5cGVzIHN0cmluZ2VkIHN5bnRheCBudW1iZXIuXG4gICAgICAgICBJIHVzZSB0aGVtIHRvIHRva2VuaXplLiB1c2luZyB0aGUgdGlja3MgY29tbWFuZHMuIE9uY2UgdG9rZW5pemVyIHRha2VzIGNvbW1hbmRzLlxuICAgICAgICAgSSBtb3ZlIG9uIHRvIGFjdHVhbCBldmFsdWF0aW9uLlxuICAgICAgICAqL1xuXG4gICAgICAgIFxuICAgICAgICBsZXQgc3ViZGVmaW5lZFRva2Vucz1bXTtcbiAgICAgICAgLypcbiAgICAgICAgZm9yIChsZXQgaT0wO2k8YmFzaWNUaWt6VG9rZW5zLmxlbmd0aDtpKyspe1xuXG4gICAgICAgIH0qL1xuICAgIH1cblxuICAgIGdldENvZGUoYXBwOiBBcHApe1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuc291cmNlPT09XCJzdHJpbmdcIiYmdGhpcy5zb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2Nlc3NlZENvZGVcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoYXBwKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XG4gICAgfVxuICAgIFxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBmbGF0QXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCAgW2luZGV4LCBjb29yXSBvZiBkcmF3LmNvb3JkaW5hdGVzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICB9XG4gICAgZmluZFZpZXdBbmNob3JzKCkge1xuICAgICAgICBjb25zdCBheGVzID0gZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpID0+IGl0ZW0gaW5zdGFuY2VvZiBBeGlzKTtcbiAgICAgICAgXG4gICAgICAgIGxldCBzdW1PZlggPSAwLCBzdW1PZlkgPSAwO1xuICAgICAgICBsZXQgbWF4WCA9IC1JbmZpbml0eSwgbWF4WSA9IC1JbmZpbml0eTtcbiAgICAgICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5O1xuICAgIFxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzID0ge1xuICAgICAgICAgICAgbWF4OiBuZXcgQXhpcygwLCAwKSxcbiAgICAgICAgICAgIG1pbjogbmV3IEF4aXMoMCwgMCksXG4gICAgICAgICAgICBhdmVNaWRQb2ludDogbmV3IEF4aXMoMCwgMClcbiAgICAgICAgfTtcbiAgICBcbiAgICAgICAgYXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7IGNhcnRlc2lhblgsIGNhcnRlc2lhblkgfSA9IGF4aXM7XG4gICAgXG4gICAgICAgICAgICAvLyBVcGRhdGUgc3VtcyBmb3IgYXZlcmFnZSBjYWxjdWxhdGlvblxuICAgICAgICAgICAgc3VtT2ZYICs9IGNhcnRlc2lhblg7XG4gICAgICAgICAgICBzdW1PZlkgKz0gY2FydGVzaWFuWTtcbiAgICBcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBtYXggYW5kIG1pbiBjb29yZGluYXRlc1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblggPiBtYXhYKSBtYXhYID0gY2FydGVzaWFuWDtcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5ZID4gbWF4WSkgbWF4WSA9IGNhcnRlc2lhblk7XG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA8IG1pblgpIG1pblggPSBjYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPCBtaW5ZKSBtaW5ZID0gY2FydGVzaWFuWTtcbiAgICAgICAgfSk7XG4gICAgXG4gICAgICAgIGNvbnN0IGxlbmd0aCA9IGF4ZXMubGVuZ3RoICE9PSAwID8gYXhlcy5sZW5ndGggOiAxO1xuICAgIFxuICAgICAgICAvLyBTZXQgdGhlIHZpZXdBbmNob3JzXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQgPSBuZXcgQXhpcyhzdW1PZlggLyBsZW5ndGgsIHN1bU9mWSAvIGxlbmd0aCk7XG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWF4ID0gbmV3IEF4aXMobWF4WCwgbWF4WSk7XG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWluID0gbmV3IEF4aXMobWluWCwgbWluWSk7XG4gICAgfVxuICAgIFxuXG4gICAgZmluZE9yaWdpbmFsVmFsdWUodmFsdWU6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkOy8qXG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkOyovXG4gICAgfVxuICAgIFxuXG4gICAgdG9TdHJpbmcoKXtcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XG4gICAgICAgIGNvbnNvbGUubG9nKCd0aGlzLnRva2VucycsdGhpcy50b2tlbnMpXG4gICAgICAgIC8vY29uc3QgZXh0cmVtZVhZPWdldEV4dHJlbWVYWSh0aGlzLnRva2Vucyk7XG4gICAgICAgIHRoaXMudG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcbiAgICAgICAgICAgIGlmKHRva2VuLnRvU3RyaW5nKCkpe1xuICAgICAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPXRva2VuLnRvU3RyaW5nKClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz0gdG9rZW47XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNvZGVCbG9ja091dHB1dDtcbiAgICB9XG59XG5cblxuZnVuY3Rpb24gZmxhdHRlbihkYXRhOiBhbnksIHJlc3VsdHM6IGFueVtdID0gW10sIHN0b3BDbGFzcz86IGFueSk6IGFueVtdIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEpIHtcbiAgICAgICAgZmxhdHRlbihpdGVtLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmIGRhdGEgIT09IG51bGwpIHtcbiAgICAgIC8vIElmIHRoZSBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgdGhlIHN0b3BDbGFzcywgYWRkIGl0IHRvIHJlc3VsdHMgYW5kIHN0b3AgZmxhdHRlbmluZ1xuICAgICAgaWYgKHN0b3BDbGFzcyAmJiBkYXRhIGluc3RhbmNlb2Ygc3RvcENsYXNzKSB7XG4gICAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9XG4gIFxuICAgICAgLy8gQWRkIHRoZSBjdXJyZW50IG9iamVjdCB0byByZXN1bHRzXG4gICAgICByZXN1bHRzLnB1c2goZGF0YSk7XG4gIFxuICAgICAgLy8gUmVjdXJzaXZlbHkgZmxhdHRlbiBwcm9wZXJ0aWVzIG9mIHRoZSBvYmplY3RcbiAgICAgIGZvciAoY29uc3Qga2V5IGluIGRhdGEpIHtcbiAgICAgICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIGZsYXR0ZW4oZGF0YVtrZXldLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG5mdW5jdGlvbiBnZXRFeHRyZW1lWFkodG9rZW5zOiBhbnkpIHtcbiAgICBsZXQgbWF4WCA9IC1JbmZpbml0eTtcbiAgICBsZXQgbWF4WSA9IC1JbmZpbml0eTtcbiAgICBsZXQgbWluWCA9IEluZmluaXR5O1xuICAgIGxldCBtaW5ZID0gSW5maW5pdHk7XG4gICAgXG4gICAgdG9rZW5zLmZvckVhY2goKHRva2VuOiBhbnkpID0+IHtcbiAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XG4gICAgICAgIGlmICh0b2tlbi5YID4gbWF4WCkgbWF4WCA9IHRva2VuLlg7XG4gICAgICAgIGlmICh0b2tlbi5YIDwgbWluWCkgbWluWCA9IHRva2VuLlg7XG4gICAgXG4gICAgICAgIGlmICh0b2tlbi5ZID4gbWF4WSkgbWF4WSA9IHRva2VuLlk7XG4gICAgICAgIGlmICh0b2tlbi5ZIDwgbWluWSkgbWluWSA9IHRva2VuLlk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgICBtYXhYLG1heFksbWluWCxtaW5ZLFxuICAgIH07XG59XG5cblxuXG5cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgQmFzaWNUaWt6VG9rZW4gfSBmcm9tIFwic3JjL2Jhc2ljVG9rZW5cIjtcbmltcG9ydCB7IEFwcCwgRmlsZVN5c3RlbUFkYXB0ZXIgfSBmcm9tIFwib2JzaWRpYW5cIjtcblxuXG5mdW5jdGlvbiBnZXRTdHlGaWxlQ29udGVudChmaWxlUGF0aDogZnMuUGF0aExpa2UpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBmaWxlIGV4aXN0cyBiZWZvcmUgdHJ5aW5nIHRvIHJlYWRcbiAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpKSB7XG4gICAgICAgICAgICByZXR1cm4gZnMucmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmlsZSBkb2VzIG5vdCBleGlzdDogJHtmaWxlUGF0aH1gKTtcbiAgICAgICAgICAgIHJldHVybiAnJztcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJlYWRpbmcgdGhlIC5zdHkgZmlsZTonLCBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yKTtcbiAgICAgICAgcmV0dXJuICcnO1xuICAgIH1cbn1cblxuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcbmZ1bmN0aW9uIGdldFByZWFtYmxlKGFwcDogQXBwKTpzdHJpbmd7XG4gICAgXG4gICAgbGV0IHN0eUNvbnRlbnQgPSAnJ1xuICAgIGNvbnN0IGFkYXB0ZXIgPSBhcHAudmF1bHQuYWRhcHRlcjtcbiAgICBpZiAoYWRhcHRlciBpbnN0YW5jZW9mIEZpbGVTeXN0ZW1BZGFwdGVyKSB7XG4gICAgICAgIGNvbnN0IHZhdWx0UGF0aCA9IGFkYXB0ZXIuZ2V0QmFzZVBhdGgoKTtcbiAgICAgICAgY29uc3QgcHJlYW1ibGVQYXRoID0gcGF0aC5qb2luKHZhdWx0UGF0aCwgJ29ic2lkaWFuJywnZGF0YScsICdGaWxlcycsICdwcmVhbWJsZS5zdHknKTtcbiAgICAgICAgc3R5Q29udGVudCA9IGdldFN0eUZpbGVDb250ZW50KHByZWFtYmxlUGF0aCk7XG4gICAgfVxuICAgIHN0eUNvbnRlbnQ9c3R5Q29udGVudC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmU9PiFsaW5lLm1hdGNoKC8oaW50fGZyYWMpLykpLmpvaW4oJ1xcbicpXG5cbiAgICBjb25zdCBhbmc9XCJcXFxcdGlrenNldHthbmcvLnN0eWxlIDIgYXJncz17ZmlsbD1ibGFjayE1MCxvcGFjaXR5PTAuNSx0ZXh0IG9wYWNpdHk9MC45LGRyYXc9b3JhbmdlLDwtPixhbmdsZSBlY2NlbnRyaWNpdHk9IzEsYW5nbGUgcmFkaXVzPSMyY20sdGV4dD1vcmFuZ2UsZm9udD1cXFxcbGFyZ2V9LGFuZy8uZGVmYXVsdD17MS42fXswLjV9fVwiXG4gIFxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXG4gIFxuICAgIGNvbnN0IGFycj1cIlxcXFxuZXdjb21tYW5ke1xcXFxhcnJ9Wzhde1xcXFxjb29yZGluYXRlICgyKSBhdCAoJCgjMikhIzchKCMzKSQpO1xcXFxjb29yZGluYXRlICgxKSBhdCAoJCgyKSEjNW1tITkwOigjMykkKTtcXFxcY29vcmRpbmF0ZSAoMykgYXQgKCQoMikhIzVtbSsjNGNtISM4OigjMykkKTtcXFxcZHJhdyBbbGluZSB3aWR0aD0xcHQsPC1dICgxKS0tKDMpbm9kZSBbcG9zPSM2XSB7XFxcXGxhcmdlICMxfTt9XCIgXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXG4gICAgY29uc3Qgc3ByaW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXHNwcmluZ31bNF17XFxcXHRpa3ptYXRoe2Nvb3JkaW5hdGUgXFxcXHN0YXJ0LCBcXFxcZG9uZTtcXFxcc3RhcnQgPSAoIzEpO1xcXFxkb25lID0gKCMyKTt9XFxcXGRyYXdbdGhpY2tdICgkKFxcXFxzdGFydCkgKyAoLTEuNSwwKSQpIC0tKysoMywwKTtcXFxcZHJhdyAoXFxcXHN0YXJ0KSAtLSsgKDAsLTAuMjVjbSk7XFxcXGRyYXcgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgrMGNtLFxcXFxkb25leSswLjI1Y20pJCktLSsoMCwtMC4yNSk7XFxcXGRyYXdbZGVjb3JhdGlvbj17YXNwZWN0PTAuMywgc2VnbWVudCBsZW5ndGg9MywgYW1wbGl0dWRlPTJtbSxjb2lsLH0sZGVjb3JhdGVdIChcXFxcc3RhcnR4LFxcXFxzdGFydHktMC4yNWNtKSAtLSgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSswLjI1Y20pJClub2RlW21pZHdheSxyaWdodD0wLjI1Y20sYmxhY2tdeyM0fTtcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KSQpeyMzfTt9XCJcbiAgICBcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcbiAgICBcbiAgICBjb25zdCB0YWJsZT1cIlxcXFx0aWt6c2V0eyB0YWJsZS8uc3R5bGU9e21hdHJpeCBvZiBub2Rlcyxyb3cgc2VwPS1cXFxccGdmbGluZXdpZHRoLGNvbHVtbiBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsbm9kZXM9e3JlY3RhbmdsZSxkcmF3PWJsYWNrLGFsaWduPWNlbnRlcn0sbWluaW11bSBoZWlnaHQ9MS41ZW0sdGV4dCBkZXB0aD0wLjVleCx0ZXh0IGhlaWdodD0yZXgsbm9kZXMgaW4gZW1wdHkgY2VsbHMsZXZlcnkgZXZlbiByb3cvLnN0eWxlPXtub2Rlcz17ZmlsbD1ncmF5ITYwLHRleHQ9YmxhY2ssfX0sY29sdW1uIDEvLnN0eWxlPXtub2Rlcz17dGV4dCB3aWR0aD01ZW0sZm9udD1cXFxcYmZzZXJpZXN9fSxyb3cgMS8uc3R5bGU9e25vZGVzPXtmb250PVxcXFxiZnNlcmllc319fX1cIlxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcbiAgICBjb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxuICAgIGNvbnN0IG1hc3NTZXQ9XCJcXFxcdGlrenNldHsgbWFzcy8uc3R5bGU9e2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFja319XCJcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcbiAgICBcbiAgICBjb25zdCBwaWNBbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYW5nfVs1XXtcXFxcY29vcmRpbmF0ZSAoYW5nMSkgYXQgKCMxKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzIpIGF0ICgjMik7IFxcXFxjb29yZGluYXRlIChhbmczKSBhdCAoIzMpOyBcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nM317Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdDQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcxfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQUJcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXGFuZ0NCIC0gXFxcXGFuZ0FCfVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PDBwdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXHBnZm1hdGhyZXN1bHQgKyAzNjB9XFxcXGZpXFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ+MTgwcHRcXFxccGdmbWF0aHBhcnNlezM2MCAtIFxcXFxwZ2ZtYXRocmVzdWx0fVxcXFxmaVxcXFxsZXRcXFxcYW5nQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhzZXRtYWNyb3tcXFxcYW5nbGVDaGVja317YWJzKFxcXFxhbmdCIC0gOTApfVxcXFxpZnRoZW5lbHNle1xcXFxsZW5ndGh0ZXN0e1xcXFxhbmdsZUNoZWNrIHB0IDwgMC4xcHR9fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXtyaWdodCBhbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde2FuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O319XCJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcbiAgICBcbiAgICByZXR1cm4gcHJlYW1ibGUrc3R5Q29udGVudCthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK21hc3NTZXQrXCJcXFxccGdmcGxvdHNzZXR7Y29tcGF0PTEuMTZ9XFxcXGJlZ2lue2RvY3VtZW50fVxcXFxiZWdpbnt0aWt6cGljdHVyZX1cIlxufSJdfQ==