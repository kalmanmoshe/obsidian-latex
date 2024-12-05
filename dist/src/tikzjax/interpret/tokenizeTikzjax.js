// @ts-nocheck
import { findConsecutiveSequences } from "src/mathEngine";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, toPoint } from "../tikzjax";
import { getAllTikzReferences, searchTizkCommands, searchTizkForOgLatex } from "src/tikzjax/tikzCommands";
import { idParentheses, mapBrackets } from "src/utils/tokenUtensils";
function cleanFormatting(formatting) {
    const values = [];
    let currentGroup = [];
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
    const formattingKeys = [];
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
export class BasicTikzToken {
    type;
    name;
    value;
    constructor(value) {
        if (typeof value === 'number') {
            this.type = 'number';
            this.value = value;
            return;
        }
        if (typeof value === 'string') {
            this.type = 'string';
            this.value = value;
            return;
        }
        this.type = value.type.replace(/Bracket/, 'Syntax');
        this.name = value.name;
        this.value = value.value;
    }
    toString() {
        return searchTizkForOgLatex(this.name).latex;
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
            const basicArray = this.basicArrayify();
            let basicTikzTokens = this.basicTikzTokenify(basicArray);
            let a = this.cleanBasicTikzTokenify(basicTikzTokens);
            console.log(a);
            this.PrepareForTokenize(a);
            this.tokenize(a);
            this.processedCode += this.toString();
            this.debugInfo += JSON.stringify(this.tokens, null, 1) + "\n\n";
            this.debugInfo += this.processedCode;
        }
        else {
            this.tokens = source;
        }
        if (typeof source === "string" && source.match(/(usepackage|usetikzlibrary)/)) {
            this.processedCode = source;
        }
        else { /*
            this.debugInfo+=this.source;
            this.findViewAnchors();
            this.applyPostProcessing();

            this.debugInfo+="\n\nthis.midPoint:\n"+JSON.stringify(this.viewAnchors,null,1)+"\n"
            this.debugInfo+=JSON.stringify(this.tokens,null,1)+"\n\n"

            this.processedCode += this.toString();
            this.debugInfo+=this.processedCode;*/
        }
    }
    basicArrayify() {
        const basicArray = [];
        const operatorsRegex = new RegExp('^' + arrToRegexString(getAllTikzReferences()));
        let i = 0;
        while (i < this.source.length) {
            const subSource = this.source.slice(i);
            let match;
            // Match TikZ operators
            match = subSource.match(operatorsRegex);
            if (match) {
                basicArray.push({ type: 'string', value: match[0] });
                i += match[0].length;
                continue;
            }
            // Match numbers
            match = subSource.match(/^[-0-9.]+/);
            if (match) {
                basicArray.push({ type: 'number', value: parseNumber(match[0]) });
                i += match[0].length;
                continue;
            }
            match = subSource.match(/^[a-zA-Z\\#]+/);
            if (match) {
                basicArray.push({ type: 'string', value: match[0] });
                i += match[0].length;
                continue;
            }
            // Increment index if no match found
            i++;
        }
        return basicArray;
    }
    basicTikzTokenify(basicArray) {
        let basicTikzTokens = [];
        // Process tokens
        basicArray.forEach(({ type, value }) => {
            if (type === 'string') {
                const tikzCommand = searchTizkCommands(value);
                if (tikzCommand) {
                    basicTikzTokens.push(new BasicTikzToken(tikzCommand));
                }
                else
                    basicTikzTokens.push(new BasicTikzToken(value));
            }
            else if (type === 'number') {
                basicTikzTokens.push(new BasicTikzToken(value));
            }
        });
        idParentheses(basicTikzTokens);
        return basicTikzTokens;
    }
    cleanBasicTikzTokenify(basicTikzTokens) {
        const unitIndices = basicTikzTokens
            .map((token, idx) => (token.type === 'Unit' ? idx : null))
            .filter((idx) => idx !== null);
        unitIndices.forEach((unitIdx) => {
            const prevToken = basicTikzTokens[unitIdx - 1];
            if (!prevToken || prevToken.type !== 'number') {
                throw new Error(`Units can only be used in reference to numbers at index ${unitIdx}`);
            }
            prevToken.value = toPoint(prevToken.value, basicTikzTokens[unitIdx].name);
        });
        basicTikzTokens = basicTikzTokens.filter((_, idx) => (!unitIndices.includes(idx)));
        //basicTikzTokens=basicTikzTokens.filter((t) => t.name!=='Comma');
        /*
        const indexesToRemove: number[]=[]
        basicTikzTokens.forEach((token,index) => {
            if(token.type==='Formatting'){
                if(basicTikzTokens[index+1].name==='Equals')
                {
                    basicTikzTokens[index].value=basicTikzTokens[index+2]
                    indexesToRemove.push(index+1,index+2);
                }
            }
        });
        basicTikzTokens=basicTikzTokens.filter((_, idx) => (!indexesToRemove.includes(idx)));*/
        const mapSyntax = basicTikzTokens
            .map((token, idx) => (token.type === 'Syntax' && /(Dash|Plus)/.test(token.name) ? idx : null))
            .filter((idx) => idx !== null);
        const syntaxSequences = findConsecutiveSequences(mapSyntax);
        const syntaxObjects = syntaxSequences
            .map((sequence) => {
            if (sequence.length === 0)
                return null; // Handle empty sequences
            const start = sequence[0];
            const end = sequence[sequence.length - 1];
            const value = sequence
                .map((index) => {
                const token = basicTikzTokens[index];
                if (!token || !token.name) {
                    console.warn(`Missing or invalid token at index ${index}`);
                    return ''; // Provide a fallback
                }
                return token.name
                    .replace(/Dash/, '-')
                    .replace(/Plus/, '+');
            })
                .join('');
            return { start, end, value };
        })
            .filter((obj) => obj !== null)
            .sort((a, b) => b.start - a.start);
        syntaxObjects.forEach(({ start, end, value }) => {
            const command = searchTizkCommands(value);
            const token = new BasicTikzToken(command);
            basicTikzTokens.splice(start, end + 1 - start, token);
        });
        return basicTikzTokens;
    }
    PrepareForTokenize(basicTikzTokens) {
        const squareBracketIndexes = mapBrackets('Square_brackets_open', basicTikzTokens);
        squareBracketIndexes
            .sort((a, b) => b.open - a.open) // Sort in descending order of 'open'
            .forEach((index) => {
            const formatting = new Formatting(cleanFormatting(basicTikzTokens.slice(index.open + 1, index.close)));
            basicTikzTokens.splice(index.open, index.close + 1 - index.open, formatting);
        });
        const praneIndexes = mapBrackets('Parentheses_open', basicTikzTokens);
        praneIndexes
            .sort((a, b) => b.open - a.open)
            .forEach((index) => {
            const axis = new Axis().parseInput(basicTikzTokens.slice(index.open + 1, index.close));
            basicTikzTokens.splice(index.open, index.close + 1 - index.open, axis);
        });
        return basicTikzTokens;
    }
    tokenize(basicTikzTokens) {
        let endIndex;
        for (let i = 0; i < basicTikzTokens.length; i++) {
            if (basicTikzTokens[i].name === 'Draw') {
                endIndex = basicTikzTokens.slice(i).findIndex(t => t.name === 'Semicolon') + i;
                const drawSegment = basicTikzTokens.slice(i + 1, endIndex);
                i = endIndex;
                this.tokens.push(new Draw('draw').fillCoordinates(drawSegment));
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
        console.log(basicTikzTokens);
    }
    tidyTikzSource(tikzSource) {
        const remove = "&nbsp;";
        tikzSource = tikzSource.replaceAll(remove, "");
        let lines = tikzSource.split("\n");
        lines = lines.map(line => line.trim());
        lines = lines.filter(line => line);
        return lines.join('\n').replace(/(?<=[^\w]) | (?=[^\w])/g, "").replace(/(?<!\\)%.*$/gm, "").replace(/\n/g, "");
    }
    getCode() {
        if (typeof this.source === "string" && this.source.match(/(usepackage|usetikzlibrary)/))
            return this.processedCode;
        return getPreamble() + this.processedCode + "\n\\end{tikzpicture}\\end{document}";
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
    /*
    tokenize() {
        

        const ca = String.raw`\w\d\s-,.:|`; // Define allowed characters for `ca`
        const c = String.raw`[$(]{0,2}[${ca}]+[)$]{0,2}|\$\([${ca}]+\)[${ca}!:+]+\([${ca}]+\)\$`;
        // Define `coorRegex` with escaped characters for specific matching
        const cn = String.raw`[\w_\d\s]`; // Coordinate name
        const t = String.raw`\"?\$[\w\d\s\-,.:(!)\-\{\}\+\\ ^]*\$\"?|[\w\d\s\-,.:(!)_\-\+\\^]*`; // Text with specific characters
        const f = String.raw`[\w\s\d=:,!';.&*\{\}%\-<>]`; // Formatting with specific characters

        // Define `coorRegex` using escaped braces and patterns
        const coorRegex = new RegExp(String.raw`\\coor\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const picRegex = new RegExp(String.raw`\\pic\{(${c})\}\{(${c})\}\{(${c})\}\{(${t})\}\{(${f}*)\}`, "g");
        const nodeRegex = new RegExp(String.raw`\\node\{(${c})\}\{(${cn}*)\}\{(${t})\}\{(${f}*)\}`, "g");
        const se = new RegExp(String.raw`\\node\s*\(*(${cn})\)*\s*at\s*\((${c})\)\s*\[(${f}*)\]\s*\{(${t})\}`, "g");
        const ss = new RegExp(String.raw`\\coordinate\s*(\[label=\{\[(.*?)\]:\\\w*\s*([\w\s]*)\}\])?\s*\((${cn}+)\)\s*at\s*\((${c})\);`, "g");
        const drawRegex = new RegExp(String.raw`\\draw\[(${f}*)\]([^;]*);`, "g");
        const xyaxisRegex = new RegExp(String.raw`\\xyaxis{(${t})}{(${t})}`, "g");
        const gridRegex = new RegExp(String.raw`\\grid{([\d-.]+)}`, "g");
        const circleRegex = new RegExp(String.raw`\\circle\{(${c}+)\}\{(${c}+)\}\{(${c}+)\}\{([\w\s\d]*)\}`, "g");
        const massRegex = new RegExp(String.raw`\\mass\{(${c})\}\{(${t})\}\{(-\||\||>){0,1}\}\{([\d.]*)\}`,"g");
        //\pic{anc2}{anc1}{anc0}{75^\circ }{};
        const vecRegex = new RegExp(String.raw`\\vec\{(${c})\}\{(${c})\}\{(${t})\}\{(${f}*)\}`, "g");
        const regexPatterns = [coorRegex, se, ss, nodeRegex, drawRegex, circleRegex, massRegex, vecRegex,picRegex];
        let matches: any[]=[];
        regexPatterns.forEach(ab => {
            matches.push(...[...this.source.matchAll(ab)])
        });
        
        matches.sort((a, b) => (a.index || 0) - (b.index || 0));

        [xyaxisRegex,gridRegex].forEach(ab => {
            matches.push(...[...this.source.matchAll(ab)])
        });

        let currentIndex = 0;
        for (const match of matches) {
          if (match.index !== undefined && match.index > currentIndex) {
            this.tokens.push(this.source.slice(currentIndex, match.index));
          }
          
          if (match[0].startsWith("\\coor")) {
            let i={original: match[1],coordinateName: match[2],label: match[3],formatting: match[4]}
            if(match[0].startsWith("\\coordinate")){
                Object.assign(i,{original: match[5],coordinateName: match[4],label: match[3],formatting: match[2]})
            }
            const { formatting,original, ...rest } = i;
            this.tokens.push(new Coordinate({mode: "coordinate",axis: new Axis().universal(original,this),formatting: new Formatting("coordinate", undefined,formatting),...rest,}));

          } else if (match[0].startsWith("\\pic")) {
            const c1=new Axis().universal(match[1],this)
            const c2=new Axis().universal(match[2],this)
            const c3=new Axis().universal(match[3],this)


            this.tokens.push(new Draw({mode: "pic-ang",tokens: this,formattingString: match[5],formattingObj: {tikzset: "ang",icText: match[4]},drawArr: [c1,c2,c3]}));
          }else if (match[0].startsWith("\\draw")) {
            this.tokens.push(new Draw(undefined,match[1],match[2], this));
          } else if (match[0].startsWith("\\xyaxis")) {
          } else if (match[0].startsWith("\\grid")) {
            //this.tokens.push({type: "grid", rotate: match[1]});
          } else if (match[0].startsWith("\\node")) {
            let i={original: match[1],coordinateName: match[3],label: match[4],formatting: match[3]}
            if (match[0].match(/\\node\s*\(/)){
                Object.assign(i,{original: match[2],coordinateName: match[1],label: match[4],formatting: match[3]});
            }
            const { formatting,original, ...rest } = i;
            this.tokens.push(new Coordinate({mode: "node",axis: new Axis().universal(original,this),formatting: new Formatting("node", undefined,formatting),...rest,}));
          } else if (match[0].startsWith("\\circle")) {/*
            this.tokens.push({
              type: "circle",
              formatting: match[4],
              coordinates: [
                new Coordinate().simpleXY(match[1], this.tokens),
                new Coordinate().simpleXY(match[2], this.tokens),
                new Coordinate().simpleXY(match[3], this.tokens),
              ],
            });*
          } else if (match[0].startsWith("\\mass")) {
            this.tokens.push(new Coordinate({mode: "node",label: match[2],axis: new Axis().universal(match[1],this),formatting: new Formatting("node",{tikzset: 'mass',anchor: match[3],rotate: match[4]})}))

          } else if (match[0].startsWith("\\vec")) {
            const ancer=new Axis().universal(match[1],this);
            const axis1=new Axis().universal(match[2],this);
            const node=new Coordinate({mode: "node-inline",formatting: new Formatting('node-inline',{color: "red"})})

            const c1=new Coordinate("node-inline");
            const q=[ancer,'--+',node,axis1]
            this.tokens.push(new Draw({formattingObj: {tikzset: 'vec'},tokens: this,drawArr: q}))
          }

          if (match.index !== undefined) {
            currentIndex = match.index + match[0].length;
          }
        }
        
        if (currentIndex < this.source.length) {
            this.tokens.push(this.source.slice(currentIndex));
        }
    }*/
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
class TikzVariables {
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
const parseNumber = (value) => {
    const numberValue = parseFloat(value);
    return isNaN(numberValue) ? 0 : numberValue;
};
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxjQUFjO0FBQ2QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFHLE9BQU8sRUFBa0IsYUFBYSxFQUFFLFdBQVcsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBRTVGLFNBQVMsZUFBZSxDQUFDLFVBQWlCO0lBQ3RDLE1BQU0sTUFBTSxHQUFZLEVBQUUsQ0FBQztJQUMzQixJQUFJLFlBQVksR0FBVSxFQUFFLENBQUM7SUFFN0IsS0FBSyxNQUFNLElBQUksSUFBSSxVQUFVLEVBQUU7UUFDM0IsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRTtZQUN2QixJQUFJLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2dCQUN6QixNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUMxQixZQUFZLEdBQUcsRUFBRSxDQUFDO2FBQ3JCO1NBQ0o7YUFBTTtZQUNILFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDM0I7S0FDSjtJQUNELElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDekIsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztLQUM3QjtJQUNELE1BQU0sY0FBYyxHQUFDLEVBQUUsQ0FBQTtJQUN2QixNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7UUFDckIsY0FBYyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ2pELENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxjQUFjLENBQUE7QUFDekIsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsVUFBVTtJQUNoQyxNQUFNLFFBQVEsR0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFDLEdBQUcsRUFBQyxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxRQUFRLENBQUEsQ0FBQyxDQUFBLEdBQUcsQ0FBQSxDQUFDLENBQUEsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxLQUFHLElBQUksQ0FBQyxDQUFDO0lBQ3ZGLE1BQU0sR0FBRyxHQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUE7SUFDN0IsSUFBRyxRQUFRLENBQUMsTUFBTSxLQUFHLENBQUM7UUFDbEIsVUFBVSxHQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtJQUNoRCxJQUFJLEtBQUssR0FBQyx3QkFBd0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMvQyxPQUFPLEVBQUMsR0FBRyxFQUFDLEtBQUssRUFBQyxDQUFBO0FBQ3RCLENBQUM7QUFFRCxTQUFTLHdCQUF3QixDQUFDLFVBQVU7SUFDeEMsSUFBSSxVQUFVLENBQUMsTUFBTSxLQUFHLENBQUMsRUFBQztRQUN0QixPQUFPLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUUsSUFBSSxDQUFBO0tBQ25DO0lBQ0QsT0FBTyxVQUFVLENBQUE7QUFDckIsQ0FBQztBQUVELE1BQU0sT0FBTyxjQUFjO0lBQ3ZCLElBQUksQ0FBUztJQUNiLElBQUksQ0FBUTtJQUNaLEtBQUssQ0FBeUI7SUFDOUIsWUFBWSxLQUEyQjtRQUNuQyxJQUFJLE9BQU8sS0FBSyxLQUFHLFFBQVEsRUFBQztZQUN4QixJQUFJLENBQUMsSUFBSSxHQUFDLFFBQVEsQ0FBQTtZQUNsQixJQUFJLENBQUMsS0FBSyxHQUFDLEtBQUssQ0FBQztZQUNqQixPQUFNO1NBQ1Q7UUFDRCxJQUFHLE9BQU8sS0FBSyxLQUFHLFFBQVEsRUFBQztZQUN2QixJQUFJLENBQUMsSUFBSSxHQUFDLFFBQVEsQ0FBQTtZQUNsQixJQUFJLENBQUMsS0FBSyxHQUFDLEtBQUssQ0FBQztZQUNqQixPQUFNO1NBQ1Q7UUFFRCxJQUFJLENBQUMsSUFBSSxHQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBQyxRQUFRLENBQUMsQ0FBQTtRQUNoRCxJQUFJLENBQUMsSUFBSSxHQUFDLEtBQUssQ0FBQyxJQUFJLENBQUE7UUFDcEIsSUFBSSxDQUFDLEtBQUssR0FBQyxLQUFLLENBQUMsS0FBSyxDQUFBO0lBRTFCLENBQUM7SUFDRCxRQUFRO1FBQ0osT0FBTyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFBO0lBQ2hELENBQUM7Q0FDSjtBQUdELE1BQU0sT0FBTyxhQUFhO0lBQ3pCLE1BQU0sQ0FBUztJQUNaLE1BQU0sR0FBZSxFQUFFLENBQUM7SUFDeEIsaUJBQWlCO0lBQ1QsV0FBVyxDQUF3QztJQUM5RCxhQUFhLEdBQUMsRUFBRSxDQUFDO0lBQ2QsU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUVsQixZQUFZLE1BQTJCO1FBQ2hDLElBQUcsT0FBTyxNQUFNLEtBQUcsUUFBUSxFQUFDO1lBQ2xDLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwQyxNQUFNLFVBQVUsR0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUE7WUFDckMsSUFBSSxlQUFlLEdBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFBO1lBRXRELElBQUksQ0FBQyxHQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxlQUFlLENBQUMsQ0FBQTtZQUNsRCxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQ2QsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQzFCLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDaEIsSUFBSSxDQUFDLGFBQWEsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUE7WUFDckMsSUFBSSxDQUFDLFNBQVMsSUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUMsSUFBSSxFQUFDLENBQUMsQ0FBQyxHQUFDLE1BQU0sQ0FBQTtZQUN6RCxJQUFJLENBQUMsU0FBUyxJQUFFLElBQUksQ0FBQyxhQUFhLENBQUM7U0FDbEM7YUFDSTtZQUFDLElBQUksQ0FBQyxNQUFNLEdBQUMsTUFBTSxDQUFBO1NBQUM7UUFFekIsSUFBSSxPQUFPLE1BQU0sS0FBRyxRQUFRLElBQUUsTUFBTSxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsQ0FBQyxFQUFDO1lBQ3RFLElBQUksQ0FBQyxhQUFhLEdBQUMsTUFBTSxDQUFDO1NBQzdCO2FBQ0csRUFBQzs7Ozs7Ozs7O2lEQVNvQztTQUN4QztJQUNSLENBQUM7SUFDRSxhQUFhO1FBQ1QsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDO1FBQ3RCLE1BQU0sY0FBYyxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNsRixJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFVixPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRTtZQUMzQixNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxJQUFJLEtBQUssQ0FBQztZQUVWLHVCQUF1QjtZQUN2QixLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUN4QyxJQUFJLEtBQUssRUFBRTtnQkFDWCxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDakQsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQ3JCLFNBQVM7YUFDWjtZQUVELGdCQUFnQjtZQUNoQixLQUFLLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztZQUNyQyxJQUFJLEtBQUssRUFBRTtnQkFDWCxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDOUQsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQ3JCLFNBQVM7YUFDWjtZQUNELEtBQUssR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3pDLElBQUksS0FBSyxFQUFFO2dCQUNYLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNqRCxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztnQkFDckIsU0FBUzthQUNaO1lBR0Qsb0NBQW9DO1lBQ3BDLENBQUMsRUFBRSxDQUFDO1NBQ1A7UUFDRCxPQUFPLFVBQVUsQ0FBQTtJQUNyQixDQUFDO0lBQ0QsaUJBQWlCLENBQUMsVUFBVTtRQUN4QixJQUFJLGVBQWUsR0FBcUMsRUFBRSxDQUFDO1FBQzFELGlCQUFpQjtRQUNsQixVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBRTtZQUNuQyxJQUFJLElBQUksS0FBSyxRQUFRLEVBQUU7Z0JBQ25CLE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUM5QyxJQUFJLFdBQVcsRUFBRTtvQkFDakIsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO2lCQUNyRDs7b0JBRUcsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2FBRXZEO2lCQUFNLElBQUksSUFBSSxLQUFLLFFBQVEsRUFBRTtnQkFDOUIsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2FBQy9DO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSCxhQUFhLENBQUMsZUFBZSxDQUFDLENBQUE7UUFDOUIsT0FBTyxlQUFlLENBQUM7SUFDM0IsQ0FBQztJQUNELHNCQUFzQixDQUFDLGVBQWU7UUFDbEMsTUFBTSxXQUFXLEdBQWEsZUFBZTthQUM1QyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQ3pELE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBaUIsRUFBRSxDQUFDLEdBQUcsS0FBSyxJQUFJLENBQUMsQ0FBQztRQUU5QyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUU7WUFDNUIsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQztZQUUvQyxJQUFJLENBQUMsU0FBUyxJQUFJLFNBQVMsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFO2dCQUMzQyxNQUFNLElBQUksS0FBSyxDQUFDLDJEQUEyRCxPQUFPLEVBQUUsQ0FBQyxDQUFDO2FBQ3pGO1lBRUQsU0FBUyxDQUFDLEtBQUssR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQWUsRUFBRSxlQUFlLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEYsQ0FBQyxDQUFDLENBQUM7UUFFSCxlQUFlLEdBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqRixrRUFBa0U7UUFDbEU7Ozs7Ozs7Ozs7OytGQVd1RjtRQUl2RixNQUFNLFNBQVMsR0FBRyxlQUFlO2FBQ2hDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDN0YsTUFBTSxDQUFDLENBQUMsR0FBRyxFQUFpQixFQUFFLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQyxDQUFDO1FBRTlDLE1BQU0sZUFBZSxHQUFHLHdCQUF3QixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRzVELE1BQU0sYUFBYSxHQUFHLGVBQWU7YUFDcEMsR0FBRyxDQUFDLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDZCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssQ0FBQztnQkFBRSxPQUFPLElBQUksQ0FBQyxDQUFDLHlCQUF5QjtZQUVqRSxNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUIsTUFBTSxHQUFHLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFHMUMsTUFBTSxLQUFLLEdBQUcsUUFBUTtpQkFDakIsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7Z0JBQ1gsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNyQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRTtvQkFDdkIsT0FBTyxDQUFDLElBQUksQ0FBQyxxQ0FBcUMsS0FBSyxFQUFFLENBQUMsQ0FBQztvQkFDM0QsT0FBTyxFQUFFLENBQUMsQ0FBQyxxQkFBcUI7aUJBQ25DO2dCQUNELE9BQU8sS0FBSyxDQUFDLElBQUk7cUJBQ1osT0FBTyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUM7cUJBQ3BCLE9BQU8sQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDOUIsQ0FBQyxDQUFDO2lCQUNELElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUVkLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxDQUFDO1FBQ2pDLENBQUMsQ0FBQzthQUNELE1BQU0sQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQzthQUM3QixJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUVuQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUU7WUFDNUMsTUFBTSxPQUFPLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUMsTUFBTSxLQUFLLEdBQUcsSUFBSSxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUE7WUFDekMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsR0FBRyxHQUFHLENBQUMsR0FBRyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDMUQsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLGVBQWUsQ0FBQTtJQUMxQixDQUFDO0lBRUQsa0JBQWtCLENBQUMsZUFBZTtRQUU5QixNQUFNLG9CQUFvQixHQUFHLFdBQVcsQ0FBQyxzQkFBc0IsRUFBQyxlQUFlLENBQUMsQ0FBQTtRQUVoRixvQkFBb0I7YUFDbkIsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMscUNBQXFDO2FBQ3JFLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO1lBQ2YsTUFBTSxVQUFVLEdBQUcsSUFBSSxVQUFVLENBQzdCLGVBQWUsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUN0RSxDQUFDO1lBQ0YsZUFBZSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxLQUFLLEdBQUcsQ0FBQyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDakYsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsa0JBQWtCLEVBQUUsZUFBZSxDQUFDLENBQUE7UUFDckUsWUFBWTthQUNYLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQzthQUMvQixPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRTtZQUNmLE1BQU0sSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsVUFBVSxDQUM5QixlQUFlLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FDckQsQ0FBQztZQUNGLGVBQWUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzNFLENBQUMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxlQUFlLENBQUE7SUFDMUIsQ0FBQztJQUNELFFBQVEsQ0FBQyxlQUFlO1FBQ3BCLElBQUksUUFBUSxDQUFBO1FBQ1osS0FBSSxJQUFJLENBQUMsR0FBQyxDQUFDLEVBQUMsQ0FBQyxHQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUMsQ0FBQyxFQUFFLEVBQUM7WUFDckMsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFHLE1BQU0sRUFBQztnQkFDakMsUUFBUSxHQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQSxFQUFFLENBQUEsQ0FBQyxDQUFDLElBQUksS0FBRyxXQUFXLENBQUMsR0FBQyxDQUFDLENBQUE7Z0JBQ3RFLE1BQU0sV0FBVyxHQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFDLENBQUMsRUFBQyxRQUFRLENBQUMsQ0FBQTtnQkFDckQsQ0FBQyxHQUFDLFFBQVEsQ0FBQTtnQkFDVixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQTthQUNsRTtTQUVKO1FBQ0Q7Ozs7VUFJRTtRQUdGLElBQUksZ0JBQWdCLEdBQUMsRUFBRSxDQUFDO1FBQ3hCOzs7V0FHRztRQUNILE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVELGNBQWMsQ0FBQyxVQUFrQjtRQUM3QixNQUFNLE1BQU0sR0FBRyxRQUFRLENBQUM7UUFDeEIsVUFBVSxHQUFHLFVBQVUsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQUEsSUFBSSxLQUFLLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNsRixLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZDLEtBQUssR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDbkMsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUMsRUFBRSxDQUFDLENBQUM7SUFDbEgsQ0FBQztJQUVELE9BQU87UUFDSCxJQUFJLE9BQU8sSUFBSSxDQUFDLE1BQU0sS0FBRyxRQUFRLElBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLENBQUM7WUFDL0UsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFBO1FBQzdCLE9BQU8sV0FBVyxFQUFFLEdBQUMsSUFBSSxDQUFDLGFBQWEsR0FBQyxxQ0FBcUMsQ0FBQztJQUNsRixDQUFDO0lBRUQsbUJBQW1CO1FBQ2YsTUFBTSxRQUFRLEdBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFTLEVBQUMsRUFBRSxDQUFDLElBQUksWUFBWSxJQUFJLENBQUMsQ0FBQztRQUMvRSxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBVSxFQUFFLEVBQUU7WUFDNUIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ25ELENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxRQUFRLEdBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUMsRUFBRSxFQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQVMsRUFBQyxFQUFFLENBQUMsSUFBSSxZQUFZLElBQUksQ0FBQyxDQUFDO1FBQ3ZGLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFVLEVBQUUsRUFBRTtZQUM1QixLQUFLLE1BQU8sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBRTtnQkFDckQsSUFBSSxJQUFJLFlBQVksVUFBVSxFQUFFO29CQUM1QixJQUFJLENBQUMsVUFBVSxFQUFFLG1CQUFtQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUMsS0FBSyxDQUFDLENBQUE7aUJBQy9EO2FBQ0o7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUVQLENBQUM7SUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztPQW9HRztJQUNILE1BQU0sS0FBRyxPQUFPLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFBLENBQUEsQ0FBQztJQUNyQyxNQUFNLEtBQUcsT0FBTyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQSxDQUFBLENBQUM7SUFFckMsZUFBZTtRQUNYLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBUyxFQUFFLEVBQUUsQ0FBQyxJQUFJLFlBQVksSUFBSSxDQUFDLENBQUM7UUFFOUUsSUFBSSxNQUFNLEdBQUcsQ0FBQyxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUM7UUFDM0IsSUFBSSxJQUFJLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQ3ZDLElBQUksSUFBSSxHQUFHLFFBQVEsRUFBRSxJQUFJLEdBQUcsUUFBUSxDQUFDO1FBRXJDLElBQUksQ0FBQyxXQUFXLEdBQUc7WUFDZixHQUFHLEVBQUUsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNuQixHQUFHLEVBQUUsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNuQixXQUFXLEVBQUUsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUM5QixDQUFDO1FBRUYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQVUsRUFBRSxFQUFFO1lBQ3hCLE1BQU0sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEdBQUcsSUFBSSxDQUFDO1lBRXhDLHNDQUFzQztZQUN0QyxNQUFNLElBQUksVUFBVSxDQUFDO1lBQ3JCLE1BQU0sSUFBSSxVQUFVLENBQUM7WUFFckIsaUNBQWlDO1lBQ2pDLElBQUksVUFBVSxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLFVBQVUsQ0FBQztZQUN6QyxJQUFJLFVBQVUsR0FBRyxJQUFJO2dCQUFFLElBQUksR0FBRyxVQUFVLENBQUM7WUFDekMsSUFBSSxVQUFVLEdBQUcsSUFBSTtnQkFBRSxJQUFJLEdBQUcsVUFBVSxDQUFDO1lBQ3pDLElBQUksVUFBVSxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLFVBQVUsQ0FBQztRQUM3QyxDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFbkQsc0JBQXNCO1FBQ3RCLElBQUksQ0FBQyxXQUFXLENBQUMsV0FBVyxHQUFHLElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLEVBQUUsTUFBTSxHQUFHLE1BQU0sQ0FBQyxDQUFDO1FBQzFFLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxHQUFHLElBQUksSUFBSSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUdELGlCQUFpQixDQUFDLEtBQWE7UUFDM0IsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxJQUFJLENBQ3pDLENBQUMsS0FBWSxFQUFFLEVBQUUsQ0FDYixDQUFDLEtBQUssWUFBWSxVQUFVLENBQUMsSUFBSSxLQUFLLENBQUMsY0FBYyxLQUFLLEtBQUssQ0FDdEUsQ0FBQztRQUNGLE9BQU8sRUFBRSxZQUFZLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7SUFDN0QsQ0FBQztJQUdELFFBQVE7UUFDSixJQUFJLGVBQWUsR0FBRyxFQUFFLENBQUM7UUFDekIsTUFBTSxTQUFTLEdBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUMxQyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO1lBRS9CLElBQUcsS0FBSyxDQUFDLFFBQVEsRUFBRSxFQUFDO2dCQUNoQixlQUFlLElBQUcsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFBO2FBQ3JDO2lCQUFNO2dCQUNQLGVBQWUsSUFBSSxLQUFLLENBQUM7YUFDMUI7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sZUFBZSxDQUFDO0lBQzNCLENBQUM7Q0FDSjtBQUNELE1BQU0sYUFBYTtDQUVsQjtBQUVELFNBQVMsT0FBTyxDQUFDLElBQVMsRUFBRSxVQUFpQixFQUFFLEVBQUUsU0FBZTtJQUM1RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDdkIsS0FBSyxNQUFNLElBQUksSUFBSSxJQUFJLEVBQUU7WUFDdkIsT0FBTyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7U0FDbkM7S0FDRjtTQUFNLElBQUksT0FBTyxJQUFJLEtBQUssUUFBUSxJQUFJLElBQUksS0FBSyxJQUFJLEVBQUU7UUFDcEQsdUZBQXVGO1FBQ3ZGLElBQUksU0FBUyxJQUFJLElBQUksWUFBWSxTQUFTLEVBQUU7WUFDMUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNuQixPQUFPLE9BQU8sQ0FBQztTQUNoQjtRQUVELG9DQUFvQztRQUNwQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRW5CLCtDQUErQztRQUMvQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRTtZQUN0QixJQUFJLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUU7Z0JBQzVCLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsT0FBTyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2FBQ3hDO1NBQ0Y7S0FDRjtJQUNELE9BQU8sT0FBTyxDQUFDO0FBQ25CLENBQUM7QUFFRCxTQUFTLFlBQVksQ0FBQyxNQUFXO0lBQzdCLElBQUksSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDO0lBQ3JCLElBQUksSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDO0lBQ3JCLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQztJQUNwQixJQUFJLElBQUksR0FBRyxRQUFRLENBQUM7SUFFcEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQVUsRUFBRSxFQUFFO1FBQzFCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxZQUFZLEVBQUU7WUFDakMsSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbkMsSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFFbkMsSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDbkMsSUFBSSxLQUFLLENBQUMsQ0FBQyxHQUFHLElBQUk7Z0JBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7U0FDbEM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILE9BQU87UUFDSCxJQUFJLEVBQUMsSUFBSSxFQUFDLElBQUksRUFBQyxJQUFJO0tBQ3RCLENBQUM7QUFDTixDQUFDO0FBRUQsTUFBTSxXQUFXLEdBQUcsQ0FBQyxLQUFhLEVBQUUsRUFBRTtJQUNsQyxNQUFNLFdBQVcsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdEMsT0FBTyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDO0FBQ2hELENBQUMsQ0FBQztBQU1GLFNBQVMsV0FBVztJQUNoQixNQUFNLEdBQUcsR0FBQyxvTEFBb0wsQ0FBQTtJQUU5TCxNQUFNLElBQUksR0FBQyw2TEFBNkwsQ0FBQTtJQUV4TSxNQUFNLEdBQUcsR0FBQyxvTkFBb04sQ0FBQTtJQUM5TixNQUFNLElBQUksR0FBQyx3UkFBd1IsQ0FBQTtJQUNuUyxNQUFNLE1BQU0sR0FBQywwZ0JBQTBnQixDQUFBO0lBRXZoQixNQUFNLElBQUksR0FBQyxpS0FBaUssQ0FBQTtJQUU1SyxNQUFNLEtBQUssR0FBQyw2V0FBNlcsQ0FBQTtJQUN6WCxNQUFNLElBQUksR0FBQywrRUFBK0UsQ0FBQTtJQUMxRixpR0FBaUc7SUFDakcsTUFBTSxPQUFPLEdBQUMsc0tBQXNLLENBQUE7SUFFcEwsTUFBTSxNQUFNLEdBQUMsOHZCQUE4dkIsQ0FBQTtJQUMzd0IsTUFBTSxRQUFRLEdBQUMsbVBBQW1QLENBQUE7SUFDbFEsT0FBTyxRQUFRLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLE1BQU0sR0FBQyxJQUFJLEdBQUMsS0FBSyxHQUFDLElBQUksR0FBQyxPQUFPLEdBQUMsTUFBTSxHQUFDLGlFQUFpRSxDQUFBO0FBQzdJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAdHMtbm9jaGVja1xuaW1wb3J0IHsgZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzIH0gZnJvbSBcInNyYy9tYXRoRW5naW5lXCI7XG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCByZWdFeHAsIFRva2VuLCB0b1BvaW50IH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcbmltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaXprQ29tbWFuZHMsIHNlYXJjaFRpemtGb3JPZ0xhdGV4IH0gZnJvbSBcInNyYy90aWt6amF4L3Rpa3pDb21tYW5kc1wiO1xuaW1wb3J0IHsgZmluZFBhcmVuSW5kZXgsIGlkUGFyZW50aGVzZXMsIG1hcEJyYWNrZXRzLCBQYXJlbiB9IGZyb20gXCJzcmMvdXRpbHMvdG9rZW5VdGVuc2lsc1wiO1xuXG5mdW5jdGlvbiBjbGVhbkZvcm1hdHRpbmcoZm9ybWF0dGluZzogYW55W10pOiBhbnlbXVtdIHtcbiAgICBjb25zdCB2YWx1ZXM6IGFueVtdW10gPSBbXTtcbiAgICBsZXQgY3VycmVudEdyb3VwOiBhbnlbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGZvcm1hdHRpbmcpIHtcbiAgICAgICAgaWYgKGl0ZW0ubmFtZSA9PT0gJ0NvbW1hJykge1xuICAgICAgICAgICAgaWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goY3VycmVudEdyb3VwKTtcbiAgICAgICAgICAgICAgICBjdXJyZW50R3JvdXAgPSBbXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGN1cnJlbnRHcm91cC5wdXNoKGl0ZW0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xuICAgICAgICB2YWx1ZXMucHVzaChjdXJyZW50R3JvdXApO1xuICAgIH1cbiAgICBjb25zdCBmb3JtYXR0aW5nS2V5cz1bXVxuICAgIHZhbHVlcy5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuICAgICAgICBmb3JtYXR0aW5nS2V5cy5wdXNoKGFzc2lnbkZvcm1hdHRpbmcodmFsdWUpKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBmb3JtYXR0aW5nS2V5cyBcbn1cblxuZnVuY3Rpb24gYXNzaWduRm9ybWF0dGluZyhmb3JtYXR0aW5nKXtcbiAgICBjb25zdCBpc0VxdWFscz1mb3JtYXR0aW5nLm1hcCgoZixpZHgpPT5mLm5hbWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKHQ9PnQhPT1udWxsKTtcbiAgICBjb25zdCBrZXk9Zm9ybWF0dGluZ1swXT8ubmFtZVxuICAgIGlmKGlzRXF1YWxzLmxlbmd0aD09PTEpXG4gICAgICAgIGZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zbGljZSgoaXNFcXVhbHNbMF0rMSkpXG4gICAgbGV0IHZhbHVlPWludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nKTtcbiAgICByZXR1cm4ge2tleSx2YWx1ZX1cbn1cblxuZnVuY3Rpb24gaW50ZXJwcmV0Rm9ybWF0dGluZ1ZhbHVlKGZvcm1hdHRpbmcpe1xuICAgIGlmIChmb3JtYXR0aW5nLmxlbmd0aD09PTEpe1xuICAgICAgICByZXR1cm4gZm9ybWF0dGluZ1swXS52YWx1ZXx8dHJ1ZVxuICAgIH1cbiAgICByZXR1cm4gZm9ybWF0dGluZ1xufVxuXG5leHBvcnQgY2xhc3MgQmFzaWNUaWt6VG9rZW57XG4gICAgdHlwZTogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZ1xuICAgIHZhbHVlOiBzdHJpbmd8bnVtYmVyfFBhcmVufGFueVxuICAgIGNvbnN0cnVjdG9yKHZhbHVlOiBudW1iZXJ8c3RyaW5nfG9iamVjdCl7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWU9PT0nbnVtYmVyJyl7XG4gICAgICAgICAgICB0aGlzLnR5cGU9J251bWJlcidcbiAgICAgICAgICAgIHRoaXMudmFsdWU9dmFsdWU7XG4gICAgICAgICAgICByZXR1cm4gXG4gICAgICAgIH1cbiAgICAgICAgaWYodHlwZW9mIHZhbHVlPT09J3N0cmluZycpe1xuICAgICAgICAgICAgdGhpcy50eXBlPSdzdHJpbmcnXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIHRoaXMudHlwZT12YWx1ZS50eXBlLnJlcGxhY2UoL0JyYWNrZXQvLCdTeW50YXgnKVxuICAgICAgICB0aGlzLm5hbWU9dmFsdWUubmFtZVxuICAgICAgICB0aGlzLnZhbHVlPXZhbHVlLnZhbHVlXG4gICAgICAgIFxuICAgIH1cbiAgICB0b1N0cmluZygpe1xuICAgICAgICByZXR1cm4gc2VhcmNoVGl6a0Zvck9nTGF0ZXgodGhpcy5uYW1lKS5sYXRleFxuICAgIH1cbn1cblxuXG5leHBvcnQgY2xhc3MgRm9ybWF0VGlrempheCB7XG5cdHNvdXJjZTogc3RyaW5nO1xuICAgIHRva2VuczogQXJyYXk8VG9rZW4+PVtdO1xuICAgIC8vbWlkUG9pbnQ6IEF4aXM7XG4gICAgcHJpdmF0ZSB2aWV3QW5jaG9yczoge21heDogQXhpcyxtaW46QXhpcyxhdmVNaWRQb2ludDogQXhpc31cblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xuICAgIGRlYnVnSW5mbyA9IFwiXCI7XG4gICAgXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nfEFycmF5PFRva2VuPikge1xuICAgICAgICBpZih0eXBlb2Ygc291cmNlPT09XCJzdHJpbmdcIil7XG5cdFx0dGhpcy5zb3VyY2UgPSB0aGlzLnRpZHlUaWt6U291cmNlKHNvdXJjZSk7XG4gICAgICAgIGNvbnN0IGJhc2ljQXJyYXk9dGhpcy5iYXNpY0FycmF5aWZ5KClcbiAgICAgICAgbGV0IGJhc2ljVGlrelRva2Vucz10aGlzLmJhc2ljVGlrelRva2VuaWZ5KGJhc2ljQXJyYXkpXG4gICAgICAgIFxuICAgICAgICBsZXQgYT10aGlzLmNsZWFuQmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNUaWt6VG9rZW5zKVxuICAgICAgICBjb25zb2xlLmxvZyhhKVxuICAgICAgICB0aGlzLlByZXBhcmVGb3JUb2tlbml6ZShhKVxuICAgICAgICB0aGlzLnRva2VuaXplKGEpXG4gICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnRvU3RyaW5nKClcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPUpTT04uc3RyaW5naWZ5KHRoaXMudG9rZW5zLG51bGwsMSkrXCJcXG5cXG5cIlxuICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5wcm9jZXNzZWRDb2RlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge3RoaXMudG9rZW5zPXNvdXJjZX1cblxuICAgICAgICBpZiAodHlwZW9mIHNvdXJjZT09PVwic3RyaW5nXCImJnNvdXJjZS5tYXRjaCgvKHVzZXBhY2thZ2V8dXNldGlremxpYnJhcnkpLykpe1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXNvdXJjZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNley8qXG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5zb3VyY2U7XG4gICAgICAgICAgICB0aGlzLmZpbmRWaWV3QW5jaG9ycygpO1xuICAgICAgICAgICAgdGhpcy5hcHBseVBvc3RQcm9jZXNzaW5nKCk7XG5cbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz1cIlxcblxcbnRoaXMubWlkUG9pbnQ6XFxuXCIrSlNPTi5zdHJpbmdpZnkodGhpcy52aWV3QW5jaG9ycyxudWxsLDEpK1wiXFxuXCJcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz1KU09OLnN0cmluZ2lmeSh0aGlzLnRva2VucyxudWxsLDEpK1wiXFxuXFxuXCJcblxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlICs9IHRoaXMudG9TdHJpbmcoKTtcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnByb2Nlc3NlZENvZGU7Ki9cbiAgICAgICAgfVxuXHR9XG4gICAgYmFzaWNBcnJheWlmeSgpe1xuICAgICAgICBjb25zdCBiYXNpY0FycmF5ID0gW107XG4gICAgICAgIGNvbnN0IG9wZXJhdG9yc1JlZ2V4ID0gbmV3IFJlZ0V4cCgnXicgKyBhcnJUb1JlZ2V4U3RyaW5nKGdldEFsbFRpa3pSZWZlcmVuY2VzKCkpKTtcbiAgICAgICAgbGV0IGkgPSAwO1xuICAgICAgICAgXG4gICAgICAgIHdoaWxlIChpIDwgdGhpcy5zb3VyY2UubGVuZ3RoKSB7XG4gICAgICAgICAgICBjb25zdCBzdWJTb3VyY2UgPSB0aGlzLnNvdXJjZS5zbGljZShpKTtcbiAgICAgICAgICAgIGxldCBtYXRjaDtcbiAgICAgICAgXG4gICAgICAgICAgICAvLyBNYXRjaCBUaWtaIG9wZXJhdG9yc1xuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2gob3BlcmF0b3JzUmVnZXgpO1xuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG1hdGNoWzBdIH0pO1xuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgICAgIC8vIE1hdGNoIG51bWJlcnNcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eWy0wLTkuXSsvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ251bWJlcicsIHZhbHVlOiBwYXJzZU51bWJlcihtYXRjaFswXSkgfSk7XG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlthLXpBLVpcXFxcI10rLyk7XG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaCh7IHR5cGU6ICdzdHJpbmcnLCB2YWx1ZTogbWF0Y2hbMF0gfSk7XG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgXG4gICAgICAgICAgICAvLyBJbmNyZW1lbnQgaW5kZXggaWYgbm8gbWF0Y2ggZm91bmRcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYmFzaWNBcnJheVxuICAgIH1cbiAgICBiYXNpY1Rpa3pUb2tlbmlmeShiYXNpY0FycmF5KXtcbiAgICAgICAgbGV0IGJhc2ljVGlrelRva2VuczogQXJyYXk8QmFzaWNUaWt6VG9rZW58Rm9ybWF0dGluZz4gPSBbXTtcbiAgICAgICAgIC8vIFByb2Nlc3MgdG9rZW5zXG4gICAgICAgIGJhc2ljQXJyYXkuZm9yRWFjaCgoeyB0eXBlLCB2YWx1ZSB9KSA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0aWt6Q29tbWFuZCA9IHNlYXJjaFRpemtDb21tYW5kcyh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgaWYgKHRpa3pDb21tYW5kKSB7XG4gICAgICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnB1c2gobmV3IEJhc2ljVGlrelRva2VuKHRpa3pDb21tYW5kKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnB1c2gobmV3IEJhc2ljVGlrelRva2VuKHZhbHVlKSk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGlkUGFyZW50aGVzZXMoYmFzaWNUaWt6VG9rZW5zKVxuICAgICAgICByZXR1cm4gYmFzaWNUaWt6VG9rZW5zO1xuICAgIH1cbiAgICBjbGVhbkJhc2ljVGlrelRva2VuaWZ5KGJhc2ljVGlrelRva2Vucyl7XG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IGJhc2ljVGlrelRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaWR4KSA9PiAodG9rZW4udHlwZSA9PT0gJ1VuaXQnID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcblxuICAgICAgICB1bml0SW5kaWNlcy5mb3JFYWNoKCh1bml0SWR4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSBiYXNpY1Rpa3pUb2tlbnNbdW5pdElkeCAtIDFdO1xuXG4gICAgICAgICAgICBpZiAoIXByZXZUb2tlbiB8fCBwcmV2VG9rZW4udHlwZSAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuaXRzIGNhbiBvbmx5IGJlIHVzZWQgaW4gcmVmZXJlbmNlIHRvIG51bWJlcnMgYXQgaW5kZXggJHt1bml0SWR4fWApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBwcmV2VG9rZW4udmFsdWUgPSB0b1BvaW50KHByZXZUb2tlbi52YWx1ZSBhcyBudW1iZXIsIGJhc2ljVGlrelRva2Vuc1t1bml0SWR4XS5uYW1lKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCF1bml0SW5kaWNlcy5pbmNsdWRlcyhpZHgpKSk7XG4gICAgICAgIC8vYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2Vucy5maWx0ZXIoKHQpID0+IHQubmFtZSE9PSdDb21tYScpO1xuICAgICAgICAvKlxuICAgICAgICBjb25zdCBpbmRleGVzVG9SZW1vdmU6IG51bWJlcltdPVtdXG4gICAgICAgIGJhc2ljVGlrelRva2Vucy5mb3JFYWNoKCh0b2tlbixpbmRleCkgPT4ge1xuICAgICAgICAgICAgaWYodG9rZW4udHlwZT09PSdGb3JtYXR0aW5nJyl7XG4gICAgICAgICAgICAgICAgaWYoYmFzaWNUaWt6VG9rZW5zW2luZGV4KzFdLm5hbWU9PT0nRXF1YWxzJylcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGJhc2ljVGlrelRva2Vuc1tpbmRleF0udmFsdWU9YmFzaWNUaWt6VG9rZW5zW2luZGV4KzJdXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ZXNUb1JlbW92ZS5wdXNoKGluZGV4KzEsaW5kZXgrMik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCFpbmRleGVzVG9SZW1vdmUuaW5jbHVkZXMoaWR4KSkpOyovXG5cblxuXG4gICAgICAgIGNvbnN0IG1hcFN5bnRheCA9IGJhc2ljVGlrelRva2Vuc1xuICAgICAgICAubWFwKCh0b2tlbiwgaWR4KSA9PiAodG9rZW4udHlwZSA9PT0gJ1N5bnRheCcgJiYgLyhEYXNofFBsdXMpLy50ZXN0KHRva2VuLm5hbWUpID8gaWR4IDogbnVsbCkpXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcblxuICAgICAgICBjb25zdCBzeW50YXhTZXF1ZW5jZXMgPSBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMobWFwU3ludGF4KTtcblxuXG4gICAgICAgIGNvbnN0IHN5bnRheE9iamVjdHMgPSBzeW50YXhTZXF1ZW5jZXNcbiAgICAgICAgLm1hcCgoc2VxdWVuY2UpID0+IHtcbiAgICAgICAgICAgIGlmIChzZXF1ZW5jZS5sZW5ndGggPT09IDApIHJldHVybiBudWxsOyAvLyBIYW5kbGUgZW1wdHkgc2VxdWVuY2VzXG5cbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gc2VxdWVuY2VbMF07XG4gICAgICAgICAgICBjb25zdCBlbmQgPSBzZXF1ZW5jZVtzZXF1ZW5jZS5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHNlcXVlbmNlXG4gICAgICAgICAgICAgICAgLm1hcCgoaW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBiYXNpY1Rpa3pUb2tlbnNbaW5kZXhdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIXRva2VuIHx8ICF0b2tlbi5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYE1pc3Npbmcgb3IgaW52YWxpZCB0b2tlbiBhdCBpbmRleCAke2luZGV4fWApO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnOyAvLyBQcm92aWRlIGEgZmFsbGJhY2tcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9rZW4ubmFtZVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL0Rhc2gvLCAnLScpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvUGx1cy8sICcrJyk7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuam9pbignJyk7XG5cbiAgICAgICAgICAgIHJldHVybiB7IHN0YXJ0LCBlbmQsIHZhbHVlIH07XG4gICAgICAgIH0pXG4gICAgICAgIC5maWx0ZXIoKG9iaikgPT4gb2JqICE9PSBudWxsKVxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5zdGFydCAtIGEuc3RhcnQpO1xuXG4gICAgICAgIHN5bnRheE9iamVjdHMuZm9yRWFjaCgoeyBzdGFydCwgZW5kLCB2YWx1ZSB9KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBjb21tYW5kID0gc2VhcmNoVGl6a0NvbW1hbmRzKHZhbHVlKTsgXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBCYXNpY1Rpa3pUb2tlbihjb21tYW5kKVxuICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnNwbGljZShzdGFydCwgZW5kICsgMSAtIHN0YXJ0LCB0b2tlbik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gYmFzaWNUaWt6VG9rZW5zXG4gICAgfVxuXG4gICAgUHJlcGFyZUZvclRva2VuaXplKGJhc2ljVGlrelRva2Vucyl7XG5cbiAgICAgICAgY29uc3Qgc3F1YXJlQnJhY2tldEluZGV4ZXMgPSBtYXBCcmFja2V0cygnU3F1YXJlX2JyYWNrZXRzX29wZW4nLGJhc2ljVGlrelRva2VucylcbiAgICAgICAgXG4gICAgICAgIHNxdWFyZUJyYWNrZXRJbmRleGVzXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLm9wZW4gLSBhLm9wZW4pIC8vIFNvcnQgaW4gZGVzY2VuZGluZyBvcmRlciBvZiAnb3BlbidcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nID0gbmV3IEZvcm1hdHRpbmcoXG4gICAgICAgICAgICAgICAgY2xlYW5Gb3JtYXR0aW5nKGJhc2ljVGlrelRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJhc2ljVGlrelRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgZm9ybWF0dGluZyk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHByYW5lSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJyAsYmFzaWNUaWt6VG9rZW5zKVxuICAgICAgICBwcmFuZUluZGV4ZXNcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIub3BlbiAtIGEub3BlbikgXG4gICAgICAgIC5mb3JFYWNoKChpbmRleCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYXhpcyA9IG5ldyBBeGlzKCkucGFyc2VJbnB1dChcbiAgICAgICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGJhc2ljVGlrelRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgYXhpcyk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gYmFzaWNUaWt6VG9rZW5zXG4gICAgfVxuICAgIHRva2VuaXplKGJhc2ljVGlrelRva2Vucyl7XG4gICAgICAgIGxldCBlbmRJbmRleFxuICAgICAgICBmb3IobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdEcmF3Jyl7XG4gICAgICAgICAgICAgICAgZW5kSW5kZXg9YmFzaWNUaWt6VG9rZW5zLnNsaWNlKGkpLmZpbmRJbmRleCh0PT50Lm5hbWU9PT0nU2VtaWNvbG9uJykraVxuICAgICAgICAgICAgICAgIGNvbnN0IGRyYXdTZWdtZW50PWJhc2ljVGlrelRva2Vucy5zbGljZShpKzEsZW5kSW5kZXgpXG4gICAgICAgICAgICAgICAgaT1lbmRJbmRleFxuICAgICAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2gobmV3IERyYXcoJ2RyYXcnKS5maWxsQ29vcmRpbmF0ZXMoZHJhd1NlZ21lbnQpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIFxuICAgICAgICB9XG4gICAgICAgIC8qXG4gICAgICAgIFRoZXkncmUgZ29pbmcgdG8gYmUgdGhyZWUgdHlwZXMgc3RyaW5nZWQgc3ludGF4IG51bWJlci5cbiAgICAgICAgIEkgdXNlIHRoZW0gdG8gdG9rZW5pemUuIHVzaW5nIHRoZSB0aWNrcyBjb21tYW5kcy4gT25jZSB0b2tlbml6ZXIgdGFrZXMgY29tbWFuZHMuXG4gICAgICAgICBJIG1vdmUgb24gdG8gYWN0dWFsIGV2YWx1YXRpb24uXG4gICAgICAgICovXG5cbiAgICAgICAgXG4gICAgICAgIGxldCBzdWJkZWZpbmVkVG9rZW5zPVtdO1xuICAgICAgICAvKlxuICAgICAgICBmb3IgKGxldCBpPTA7aTxiYXNpY1Rpa3pUb2tlbnMubGVuZ3RoO2krKyl7XG5cbiAgICAgICAgfSovXG4gICAgICAgIGNvbnNvbGUubG9nKGJhc2ljVGlrelRva2Vucyk7XG4gICAgfVxuICAgIFxuICAgIHRpZHlUaWt6U291cmNlKHRpa3pTb3VyY2U6IHN0cmluZykge1xuICAgICAgICBjb25zdCByZW1vdmUgPSBcIiZuYnNwO1wiO1xuICAgICAgICB0aWt6U291cmNlID0gdGlrelNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gdGlrelNvdXJjZS5zcGxpdChcIlxcblwiKTtcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XG4gICAgICAgIGxpbmVzID0gbGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSk7XG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XG4gICAgfVxuXG4gICAgZ2V0Q29kZSgpe1xuICAgICAgICBpZiAodHlwZW9mIHRoaXMuc291cmNlPT09XCJzdHJpbmdcIiYmdGhpcy5zb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJvY2Vzc2VkQ29kZVxuICAgICAgICByZXR1cm4gZ2V0UHJlYW1ibGUoKSt0aGlzLnByb2Nlc3NlZENvZGUrXCJcXG5cXFxcZW5ke3Rpa3pwaWN0dXJlfVxcXFxlbmR7ZG9jdW1lbnR9XCI7XG4gICAgfVxuICAgIFxuICAgIGFwcGx5UG9zdFByb2Nlc3NpbmcoKXtcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBmbGF0QXhlcy5mb3JFYWNoKChheGlzOiBBeGlzKSA9PiB7XG4gICAgICAgICAgICBheGlzLmFkZFF1YWRyYW50KHRoaXMudmlld0FuY2hvcnMuYXZlTWlkUG9pbnQpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBmbGF0RHJhdz1mbGF0dGVuKHRoaXMudG9rZW5zLFtdLERyYXcpLmZpbHRlcigoaXRlbTogYW55KT0+IGl0ZW0gaW5zdGFuY2VvZiBEcmF3KTtcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xuICAgICAgICAgICAgZm9yIChjb25zdCAgW2luZGV4LCBjb29yXSBvZiBkcmF3LmNvb3JkaW5hdGVzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgICAgIGlmIChjb29yIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkge1xuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICB9XG5cbiAgICAvKlxuICAgIHRva2VuaXplKCkge1xuICAgICAgICBcblxuICAgICAgICBjb25zdCBjYSA9IFN0cmluZy5yYXdgXFx3XFxkXFxzLSwuOnxgOyAvLyBEZWZpbmUgYWxsb3dlZCBjaGFyYWN0ZXJzIGZvciBgY2FgXG4gICAgICAgIGNvbnN0IGMgPSBTdHJpbmcucmF3YFskKF17MCwyfVske2NhfV0rWykkXXswLDJ9fFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXStcXChbJHtjYX1dK1xcKVxcJGA7XG4gICAgICAgIC8vIERlZmluZSBgY29vclJlZ2V4YCB3aXRoIGVzY2FwZWQgY2hhcmFjdGVycyBmb3Igc3BlY2lmaWMgbWF0Y2hpbmdcbiAgICAgICAgY29uc3QgY24gPSBTdHJpbmcucmF3YFtcXHdfXFxkXFxzXWA7IC8vIENvb3JkaW5hdGUgbmFtZVxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcXFwiP1xcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcIF5dKlxcJFxcXCI/fFtcXHdcXGRcXHNcXC0sLjooISlfXFwtXFwrXFxcXF5dKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXG4gICAgICAgIGNvbnN0IGYgPSBTdHJpbmcucmF3YFtcXHdcXHNcXGQ9OiwhJzsuJipcXHtcXH0lXFwtPD5dYDsgLy8gRm9ybWF0dGluZyB3aXRoIHNwZWNpZmljIGNoYXJhY3RlcnNcblxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXG4gICAgICAgIGNvbnN0IGNvb3JSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY29vclxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgcGljUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHBpY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc2UgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXG5vZGVcXHMqXFwoKigke2NufSlcXCkqXFxzKmF0XFxzKlxcKCgke2N9KVxcKVxccypcXFsoJHtmfSopXFxdXFxzKlxceygke3R9KVxcfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3Qgc3MgPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXGNvb3JkaW5hdGVcXHMqKFxcW2xhYmVsPVxce1xcWyguKj8pXFxdOlxcXFxcXHcqXFxzKihbXFx3XFxzXSopXFx9XFxdKT9cXHMqXFwoKCR7Y259KylcXClcXHMqYXRcXHMqXFwoKCR7Y30pXFwpO2AsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCB4eWF4aXNSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxceHlheGlzeygke3R9KX17KCR7dH0pfWAsIFwiZ1wiKTtcbiAgICAgICAgY29uc3QgZ3JpZFJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxncmlkeyhbXFxkLS5dKyl9YCwgXCJnXCIpO1xuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IG1hc3NSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbWFzc1xceygke2N9KVxcfVxceygke3R9KVxcfVxceygtXFx8fFxcfHw+KXswLDF9XFx9XFx7KFtcXGQuXSopXFx9YCxcImdcIik7XG4gICAgICAgIC8vXFxwaWN7YW5jMn17YW5jMX17YW5jMH17NzVeXFxjaXJjIH17fTtcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XG4gICAgICAgIGNvbnN0IHJlZ2V4UGF0dGVybnMgPSBbY29vclJlZ2V4LCBzZSwgc3MsIG5vZGVSZWdleCwgZHJhd1JlZ2V4LCBjaXJjbGVSZWdleCwgbWFzc1JlZ2V4LCB2ZWNSZWdleCxwaWNSZWdleF07XG4gICAgICAgIGxldCBtYXRjaGVzOiBhbnlbXT1bXTtcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcbiAgICAgICAgICAgIG1hdGNoZXMucHVzaCguLi5bLi4udGhpcy5zb3VyY2UubWF0Y2hBbGwoYWIpXSlcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBtYXRjaGVzLnNvcnQoKGEsIGIpID0+IChhLmluZGV4IHx8IDApIC0gKGIuaW5kZXggfHwgMCkpO1xuXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2godGhpcy5zb3VyY2Uuc2xpY2UoY3VycmVudEluZGV4LCBtYXRjaC5pbmRleCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjb29yXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFsyXSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbNF19XG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xuICAgICAgICAgICAgICAgIE9iamVjdC5hc3NpZ24oaSx7b3JpZ2luYWw6IG1hdGNoWzVdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFs0XSxsYWJlbDogbWF0Y2hbM10sZm9ybWF0dGluZzogbWF0Y2hbMl19KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgQ29vcmRpbmF0ZSh7bW9kZTogXCJjb29yZGluYXRlXCIsYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwob3JpZ2luYWwsdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJjb29yZGluYXRlXCIsIHVuZGVmaW5lZCxmb3JtYXR0aW5nKSwuLi5yZXN0LH0pKTtcblxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxwaWNcIikpIHtcbiAgICAgICAgICAgIGNvbnN0IGMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzFdLHRoaXMpXG4gICAgICAgICAgICBjb25zdCBjMj1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKVxuICAgICAgICAgICAgY29uc3QgYzM9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbM10sdGhpcylcblxuXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHttb2RlOiBcInBpYy1hbmdcIix0b2tlbnM6IHRoaXMsZm9ybWF0dGluZ1N0cmluZzogbWF0Y2hbNV0sZm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6IFwiYW5nXCIsaWNUZXh0OiBtYXRjaFs0XX0sZHJhd0FycjogW2MxLGMyLGMzXX0pKTtcbiAgICAgICAgICB9ZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxkcmF3XCIpKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHVuZGVmaW5lZCxtYXRjaFsxXSxtYXRjaFsyXSwgdGhpcykpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcZ3JpZFwiKSkge1xuICAgICAgICAgICAgLy90aGlzLnRva2Vucy5wdXNoKHt0eXBlOiBcImdyaWRcIiwgcm90YXRlOiBtYXRjaFsxXX0pO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XG4gICAgICAgICAgICBsZXQgaT17b3JpZ2luYWw6IG1hdGNoWzFdLGNvb3JkaW5hdGVOYW1lOiBtYXRjaFszXSxsYWJlbDogbWF0Y2hbNF0sZm9ybWF0dGluZzogbWF0Y2hbM119XG4gICAgICAgICAgICBpZiAobWF0Y2hbMF0ubWF0Y2goL1xcXFxub2RlXFxzKlxcKC8pKXtcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCB7IGZvcm1hdHRpbmcsb3JpZ2luYWwsIC4uLnJlc3QgfSA9IGk7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxjaXJjbGVcIikpIHsvKlxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh7XG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXG4gICAgICAgICAgICAgIGZvcm1hdHRpbmc6IG1hdGNoWzRdLFxuICAgICAgICAgICAgICBjb29yZGluYXRlczogW1xuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcbiAgICAgICAgICAgICAgICBuZXcgQ29vcmRpbmF0ZSgpLnNpbXBsZVhZKG1hdGNoWzJdLCB0aGlzLnRva2VucyksXG4gICAgICAgICAgICAgICAgbmV3IENvb3JkaW5hdGUoKS5zaW1wbGVYWShtYXRjaFszXSwgdGhpcy50b2tlbnMpLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSk7KlxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxtYXNzXCIpKSB7XG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixsYWJlbDogbWF0Y2hbMl0sYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIse3Rpa3pzZXQ6ICdtYXNzJyxhbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KX0pKVxuXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXHZlY1wiKSkge1xuICAgICAgICAgICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyk7XG4gICAgICAgICAgICBjb25zdCBheGlzMT1uZXcgQXhpcygpLnVuaXZlcnNhbChtYXRjaFsyXSx0aGlzKTtcbiAgICAgICAgICAgIGNvbnN0IG5vZGU9bmV3IENvb3JkaW5hdGUoe21vZGU6IFwibm9kZS1pbmxpbmVcIixmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZygnbm9kZS1pbmxpbmUnLHtjb2xvcjogXCJyZWRcIn0pfSlcblxuICAgICAgICAgICAgY29uc3QgYzE9bmV3IENvb3JkaW5hdGUoXCJub2RlLWlubGluZVwiKTtcbiAgICAgICAgICAgIGNvbnN0IHE9W2FuY2VyLCctLSsnLG5vZGUsYXhpczFdXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHtmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogJ3ZlYyd9LHRva2VuczogdGhpcyxkcmF3QXJyOiBxfSkpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGN1cnJlbnRJbmRleCA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcbiAgICAgICAgfVxuICAgIH0qL1xuICAgIGdldE1pbigpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1pbn1cbiAgICBnZXRNYXgoKXtyZXR1cm4gdGhpcy52aWV3QW5jaG9ycy5tYXh9XG5cbiAgICBmaW5kVmlld0FuY2hvcnMoKSB7XG4gICAgICAgIGNvbnN0IGF4ZXMgPSBmbGF0dGVuKHRoaXMudG9rZW5zKS5maWx0ZXIoKGl0ZW06IGFueSkgPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xuICAgICAgICBcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XG4gICAgICAgIGxldCBtYXhYID0gLUluZmluaXR5LCBtYXhZID0gLUluZmluaXR5O1xuICAgICAgICBsZXQgbWluWCA9IEluZmluaXR5LCBtaW5ZID0gSW5maW5pdHk7XG4gICAgXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMgPSB7XG4gICAgICAgICAgICBtYXg6IG5ldyBBeGlzKDAsIDApLFxuICAgICAgICAgICAgbWluOiBuZXcgQXhpcygwLCAwKSxcbiAgICAgICAgICAgIGF2ZU1pZFBvaW50OiBuZXcgQXhpcygwLCAwKVxuICAgICAgICB9O1xuICAgIFxuICAgICAgICBheGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHsgY2FydGVzaWFuWCwgY2FydGVzaWFuWSB9ID0gYXhpcztcbiAgICBcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBzdW1zIGZvciBhdmVyYWdlIGNhbGN1bGF0aW9uXG4gICAgICAgICAgICBzdW1PZlggKz0gY2FydGVzaWFuWDtcbiAgICAgICAgICAgIHN1bU9mWSArPSBjYXJ0ZXNpYW5ZO1xuICAgIFxuICAgICAgICAgICAgLy8gVXBkYXRlIG1heCBhbmQgbWluIGNvb3JkaW5hdGVzXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA+IG1heFgpIG1heFggPSBjYXJ0ZXNpYW5YO1xuICAgICAgICAgICAgaWYgKGNhcnRlc2lhblkgPiBtYXhZKSBtYXhZID0gY2FydGVzaWFuWTtcbiAgICAgICAgICAgIGlmIChjYXJ0ZXNpYW5YIDwgbWluWCkgbWluWCA9IGNhcnRlc2lhblg7XG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA8IG1pblkpIG1pblkgPSBjYXJ0ZXNpYW5ZO1xuICAgICAgICB9KTtcbiAgICBcbiAgICAgICAgY29uc3QgbGVuZ3RoID0gYXhlcy5sZW5ndGggIT09IDAgPyBheGVzLmxlbmd0aCA6IDE7XG4gICAgXG4gICAgICAgIC8vIFNldCB0aGUgdmlld0FuY2hvcnNcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCA9IG5ldyBBeGlzKHN1bU9mWCAvIGxlbmd0aCwgc3VtT2ZZIC8gbGVuZ3RoKTtcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5tYXggPSBuZXcgQXhpcyhtYXhYLCBtYXhZKTtcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5taW4gPSBuZXcgQXhpcyhtaW5YLCBtaW5ZKTtcbiAgICB9XG4gICAgXG5cbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIGNvbnN0IG9nID0gdGhpcy50b2tlbnMuc2xpY2UoKS5yZXZlcnNlKCkuZmluZChcbiAgICAgICAgICAgICh0b2tlbjogVG9rZW4pID0+XG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybiBvZyBpbnN0YW5jZW9mIENvb3JkaW5hdGUgPyBvZy5jbG9uZSgpIDogdW5kZWZpbmVkO1xuICAgIH1cbiAgICBcblxuICAgIHRvU3RyaW5nKCl7XG4gICAgICAgIGxldCBjb2RlQmxvY2tPdXRwdXQgPSBcIlwiO1xuICAgICAgICBjb25zdCBleHRyZW1lWFk9Z2V0RXh0cmVtZVhZKHRoaXMudG9rZW5zKTtcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuXG4gICAgICAgICAgICBpZih0b2tlbi50b1N0cmluZygpKXtcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29kZUJsb2NrT3V0cHV0ICs9IHRva2VuO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBjb2RlQmxvY2tPdXRwdXQ7XG4gICAgfVxufVxuY2xhc3MgVGlrelZhcmlhYmxlc3tcblxufVxuXG5mdW5jdGlvbiBmbGF0dGVuKGRhdGE6IGFueSwgcmVzdWx0czogYW55W10gPSBbXSwgc3RvcENsYXNzPzogYW55KTogYW55W10ge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XG4gICAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgZGF0YSkge1xuICAgICAgICBmbGF0dGVuKGl0ZW0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcgJiYgZGF0YSAhPT0gbnVsbCkge1xuICAgICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbiBpbnN0YW5jZSBvZiB0aGUgc3RvcENsYXNzLCBhZGQgaXQgdG8gcmVzdWx0cyBhbmQgc3RvcCBmbGF0dGVuaW5nXG4gICAgICBpZiAoc3RvcENsYXNzICYmIGRhdGEgaW5zdGFuY2VvZiBzdG9wQ2xhc3MpIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xuICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgIH1cbiAgXG4gICAgICAvLyBBZGQgdGhlIGN1cnJlbnQgb2JqZWN0IHRvIHJlc3VsdHNcbiAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcbiAgXG4gICAgICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdFxuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xuICAgICAgICBpZiAoZGF0YS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgZmxhdHRlbihkYXRhW2tleV0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xuICAgIGxldCBtYXhYID0gLUluZmluaXR5O1xuICAgIGxldCBtYXhZID0gLUluZmluaXR5O1xuICAgIGxldCBtaW5YID0gSW5maW5pdHk7XG4gICAgbGV0IG1pblkgPSBJbmZpbml0eTtcbiAgICBcbiAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xuICAgICAgICBpZiAodG9rZW4udHlwZSA9PT0gXCJjb29yZGluYXRlXCIpIHtcbiAgICAgICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcbiAgICAgICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcbiAgICBcbiAgICAgICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcbiAgICAgICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIHJldHVybiB7XG4gICAgICAgIG1heFgsbWF4WSxtaW5YLG1pblksXG4gICAgfTtcbn1cblxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xuICAgIGNvbnN0IG51bWJlclZhbHVlID0gcGFyc2VGbG9hdCh2YWx1ZSk7XG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcbn07XG5cblxuXG5cblxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoKTpzdHJpbmd7XG4gICAgY29uc3QgYW5nPVwiXFxcXHRpa3pzZXR7YW5nLy5zdHlsZSAyIGFyZ3M9e2ZpbGw9YmxhY2shNTAsb3BhY2l0eT0wLjUsdGV4dCBvcGFjaXR5PTAuOSxkcmF3PW9yYW5nZSw8LT4sYW5nbGUgZWNjZW50cmljaXR5PSMxLGFuZ2xlIHJhZGl1cz0jMmNtLHRleHQ9b3JhbmdlLGZvbnQ9XFxcXGxhcmdlfSxhbmcvLmRlZmF1bHQ9ezEuNn17MC41fX1cIlxuICBcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxuICBcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxuICAgIGNvbnN0IHNwcmluZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxzcHJpbmd9WzRde1xcXFx0aWt6bWF0aHtjb29yZGluYXRlIFxcXFxzdGFydCwgXFxcXGRvbmU7XFxcXHN0YXJ0ID0gKCMxKTtcXFxcZG9uZSA9ICgjMik7fVxcXFxkcmF3W3RoaWNrXSAoJChcXFxcc3RhcnQpICsgKC0xLjUsMCkkKSAtLSsrKDMsMCk7XFxcXGRyYXcgKFxcXFxzdGFydCkgLS0rICgwLC0wLjI1Y20pO1xcXFxkcmF3ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4KzBjbSxcXFxcZG9uZXkrMC4yNWNtKSQpLS0rKDAsLTAuMjUpO1xcXFxkcmF3W2RlY29yYXRpb249e2FzcGVjdD0wLjMsIHNlZ21lbnQgbGVuZ3RoPTMsIGFtcGxpdHVkZT0ybW0sY29pbCx9LGRlY29yYXRlXSAoXFxcXHN0YXJ0eCxcXFxcc3RhcnR5LTAuMjVjbSkgLS0oJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkrMC4yNWNtKSQpbm9kZVttaWR3YXkscmlnaHQ9MC4yNWNtLGJsYWNrXXsjNH07XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSkkKXsjM307fVwiXG4gICAgXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXG4gICAgXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXG4gICAgLy9jb25zdCBtYXNzPWBcXFxcZGVmXFxcXG1hc3MjMSMye1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoIzEpeyMyfTt9YFxuICAgIGNvbnN0IGR2ZWN0b3I9XCJcXFxcbmV3Y29tbWFuZHtcXFxcZHZlY3Rvcn1bMl17XFxcXGNvb3JkaW5hdGUgKHRlbXAxKSBhdCAoJCgwLDAgLXwgIzEpJCk7XFxcXGNvb3JkaW5hdGUgKHRlbXAyKSBhdCAoJCgwLDAgfC0gIzEpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MC43cHQsIzJdICgjMSktLSh0ZW1wMSkoIzEpLS0odGVtcDIpO31cIlxuICAgIFxuICAgIGNvbnN0IHBpY0FuZz1cIlxcXFxuZXdjb21tYW5ke1xcXFxhbmd9WzVde1xcXFxjb29yZGluYXRlIChhbmcxKSBhdCAoIzEpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMikgYXQgKCMyKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzMpIGF0ICgjMyk7IFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmczfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0NCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nMn17Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzF9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdBQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhwYXJzZXtcXFxcYW5nQ0IgLSBcXFxcYW5nQUJ9XFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ8MHB0XFxcXHBnZm1hdGhwYXJzZXtcXFxccGdmbWF0aHJlc3VsdCArIDM2MH1cXFxcZmlcXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdD4xODBwdFxcXFxwZ2ZtYXRocGFyc2V7MzYwIC0gXFxcXHBnZm1hdGhyZXN1bHR9XFxcXGZpXFxcXGxldFxcXFxhbmdCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHNldG1hY3Jve1xcXFxhbmdsZUNoZWNrfXthYnMoXFxcXGFuZ0IgLSA5MCl9XFxcXGlmdGhlbmVsc2V7XFxcXGxlbmd0aHRlc3R7XFxcXGFuZ2xlQ2hlY2sgcHQgPCAwLjFwdH19e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde3JpZ2h0IGFuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O317XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17YW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fX1cIlxuICAgIGNvbnN0IHByZWFtYmxlPVwiXFxcXHVzZXBhY2thZ2V7cGdmcGxvdHMsaWZ0aGVufVxcXFx1c2V0aWt6bGlicmFyeXthcnJvd3MubWV0YSxhbmdsZXMscXVvdGVzLHBvc2l0aW9uaW5nLCBjYWxjLCBpbnRlcnNlY3Rpb25zLGRlY29yYXRpb25zLm1hcmtpbmdzLG1hdGgsc3B5LG1hdHJpeCxwYXR0ZXJucyxzbmFrZXMsZGVjb3JhdGlvbnMucGF0aHJlcGxhY2luZyxkZWNvcmF0aW9ucy5wYXRobW9ycGhpbmcscGF0dGVybnMsc2hhZG93cyxzaGFwZXMuc3ltYm9sc31cIlxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcbn0iXX0=