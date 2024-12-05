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
        }
        else {
            this.type = value.type.replace(/Bracket/, 'Syntax');
            this.name = value.name;
            this.value = value.value;
        }
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
                console.log('drawSegment', drawSegment, basicTikzTokens[i]);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxjQUFjO0FBQ2QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzFHLE9BQU8sRUFBa0IsYUFBYSxFQUFFLFdBQVcsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBRTVGLFNBQVMsZUFBZSxDQUFDLFVBQWlCO0lBQ3RDLE1BQU0sTUFBTSxHQUFZLEVBQUUsQ0FBQztJQUMzQixJQUFJLFlBQVksR0FBVSxFQUFFLENBQUM7SUFFN0IsS0FBSyxNQUFNLElBQUksSUFBSSxVQUFVLEVBQUU7UUFDM0IsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLE9BQU8sRUFBRTtZQUN2QixJQUFJLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2dCQUN6QixNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUMxQixZQUFZLEdBQUcsRUFBRSxDQUFDO2FBQ3JCO1NBQ0o7YUFBTTtZQUNILFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDM0I7S0FDSjtJQUNELElBQUksWUFBWSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDekIsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztLQUM3QjtJQUNELE1BQU0sY0FBYyxHQUFDLEVBQUUsQ0FBQTtJQUN2QixNQUFNLENBQUMsT0FBTyxD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QUFpSyxDQUFBO0lBRTVLLE1BQU0sS0FBSyxHQUFDLDZXQUE2VyxDQUFBO0lBQ3pYLE1BQU0sSUFBSSxHQUFDLCtFQUErRSxDQUFBO0lBQzFGLGlHQUFpRztJQUNqRyxNQUFNLE9BQU8sR0FBQyxzS0FBc0ssQ0FBQTtJQUVwTCxNQUFNLE1BQU0sR0FBQyw4dkJBQTh2QixDQUFBO0lBQzN3QixNQUFNLFFBQVEsR0FBQyxtUEFBbVAsQ0FBQTtJQUNsUSxPQUFPLFFBQVEsR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLEdBQUcsR0FBQyxJQUFJLEdBQUMsTUFBTSxHQUFDLElBQUksR0FBQyxLQUFLLEdBQUMsSUFBSSxHQUFDLE9BQU8sR0FBQyxNQUFNLEdBQUMsaUVBQWlFLENBQUE7QUFDN0ksQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8vIEB0cy1ub2NoZWNrXHJcbmltcG9ydCB7IGZpbmRDb25zZWN1dGl2ZVNlcXVlbmNlcyB9IGZyb20gXCJzcmMvbWF0aEVuZ2luZVwiO1xyXG5pbXBvcnQgeyBhcnJUb1JlZ2V4U3RyaW5nLCBBeGlzLCBDb29yZGluYXRlLCBEcmF3LCBGb3JtYXR0aW5nLCByZWdFeHAsIFRva2VuLCB0b1BvaW50IH0gZnJvbSBcIi4uL3Rpa3pqYXhcIjtcclxuaW1wb3J0IHsgZ2V0QWxsVGlrelJlZmVyZW5jZXMsIHNlYXJjaFRpemtDb21tYW5kcywgc2VhcmNoVGl6a0Zvck9nTGF0ZXggfSBmcm9tIFwic3JjL3Rpa3pqYXgvdGlrekNvbW1hbmRzXCI7XHJcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBpZFBhcmVudGhlc2VzLCBtYXBCcmFja2V0cywgUGFyZW4gfSBmcm9tIFwic3JjL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcclxuXHJcbmZ1bmN0aW9uIGNsZWFuRm9ybWF0dGluZyhmb3JtYXR0aW5nOiBhbnlbXSk6IGFueVtdW10ge1xyXG4gICAgY29uc3QgdmFsdWVzOiBhbnlbXVtdID0gW107XHJcbiAgICBsZXQgY3VycmVudEdyb3VwOiBhbnlbXSA9IFtdO1xyXG5cclxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBmb3JtYXR0aW5nKSB7XHJcbiAgICAgICAgaWYgKGl0ZW0ubmFtZSA9PT0gJ0NvbW1hJykge1xyXG4gICAgICAgICAgICBpZiAoY3VycmVudEdyb3VwLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGN1cnJlbnRHcm91cCk7XHJcbiAgICAgICAgICAgICAgICBjdXJyZW50R3JvdXAgPSBbXTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN1cnJlbnRHcm91cC5wdXNoKGl0ZW0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChjdXJyZW50R3JvdXAubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIHZhbHVlcy5wdXNoKGN1cnJlbnRHcm91cCk7XHJcbiAgICB9XHJcbiAgICBjb25zdCBmb3JtYXR0aW5nS2V5cz1bXVxyXG4gICAgdmFsdWVzLmZvckVhY2goKHZhbHVlKSA9PiB7XHJcbiAgICAgICAgZm9ybWF0dGluZ0tleXMucHVzaChhc3NpZ25Gb3JtYXR0aW5nKHZhbHVlKSk7XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gZm9ybWF0dGluZ0tleXMgXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFzc2lnbkZvcm1hdHRpbmcoZm9ybWF0dGluZyl7XHJcbiAgICBjb25zdCBpc0VxdWFscz1mb3JtYXR0aW5nLm1hcCgoZixpZHgpPT5mLm5hbWU9PT0nRXF1YWxzJz9pZHg6bnVsbCkuZmlsdGVyKHQ9PnQhPT1udWxsKTtcclxuICAgIGNvbnN0IGtleT1mb3JtYXR0aW5nWzBdPy5uYW1lXHJcbiAgICBpZihpc0VxdWFscy5sZW5ndGg9PT0xKVxyXG4gICAgICAgIGZvcm1hdHRpbmc9Zm9ybWF0dGluZy5zbGljZSgoaXNFcXVhbHNbMF0rMSkpXHJcbiAgICBsZXQgdmFsdWU9aW50ZXJwcmV0Rm9ybWF0dGluZ1ZhbHVlKGZvcm1hdHRpbmcpO1xyXG4gICAgcmV0dXJuIHtrZXksdmFsdWV9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGludGVycHJldEZvcm1hdHRpbmdWYWx1ZShmb3JtYXR0aW5nKXtcclxuICAgIGlmIChmb3JtYXR0aW5nLmxlbmd0aD09PTEpe1xyXG4gICAgICAgIHJldHVybiBmb3JtYXR0aW5nWzBdLnZhbHVlfHx0cnVlXHJcbiAgICB9XHJcbiAgICByZXR1cm4gZm9ybWF0dGluZ1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQmFzaWNUaWt6VG9rZW57XHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmdcclxuICAgIHZhbHVlOiBzdHJpbmd8bnVtYmVyfFBhcmVufGFueVxyXG4gICAgY29uc3RydWN0b3IodmFsdWU6IG51bWJlcnxhbnkpe1xyXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWU9PT0nbnVtYmVyJyl7XHJcbiAgICAgICAgICAgIHRoaXMudHlwZT0nbnVtYmVyJ1xyXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB0aGlzLnR5cGU9dmFsdWUudHlwZS5yZXBsYWNlKC9CcmFja2V0LywnU3ludGF4JylcclxuICAgICAgICAgICAgdGhpcy5uYW1lPXZhbHVlLm5hbWVcclxuICAgICAgICAgICAgdGhpcy52YWx1ZT12YWx1ZS52YWx1ZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgcmV0dXJuIHNlYXJjaFRpemtGb3JPZ0xhdGV4KHRoaXMubmFtZSkubGF0ZXhcclxuICAgIH1cclxufVxyXG5cclxuXHJcbmV4cG9ydCBjbGFzcyBGb3JtYXRUaWt6amF4IHtcclxuXHRzb3VyY2U6IHN0cmluZztcclxuICAgIHRva2VuczogQXJyYXk8VG9rZW4+PVtdO1xyXG4gICAgLy9taWRQb2ludDogQXhpcztcclxuICAgIHByaXZhdGUgdmlld0FuY2hvcnM6IHttYXg6IEF4aXMsbWluOkF4aXMsYXZlTWlkUG9pbnQ6IEF4aXN9XHJcblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xyXG4gICAgZGVidWdJbmZvID0gXCJcIjtcclxuICAgIFxyXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nfEFycmF5PFRva2VuPikge1xyXG4gICAgICAgIGlmKHR5cGVvZiBzb3VyY2U9PT1cInN0cmluZ1wiKXtcclxuXHRcdHRoaXMuc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xyXG4gICAgICAgIGNvbnN0IGJhc2ljQXJyYXk9dGhpcy5iYXNpY0FycmF5aWZ5KClcclxuICAgICAgICBsZXQgYmFzaWNUaWt6VG9rZW5zPXRoaXMuYmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNBcnJheSlcclxuXHJcbiAgICAgICAgbGV0IGE9dGhpcy5jbGVhbkJhc2ljVGlrelRva2VuaWZ5KGJhc2ljVGlrelRva2VucylcclxuICAgICAgICB0aGlzLlByZXBhcmVGb3JUb2tlbml6ZShhKVxyXG4gICAgICAgIHRoaXMudG9rZW5pemUoYSlcclxuICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpXHJcbiAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPUpTT04uc3RyaW5naWZ5KHRoaXMudG9rZW5zLG51bGwsMSkrXCJcXG5cXG5cIlxyXG4gICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnByb2Nlc3NlZENvZGU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge3RoaXMudG9rZW5zPXNvdXJjZX1cclxuXHJcbiAgICAgICAgaWYgKHR5cGVvZiBzb3VyY2U9PT1cInN0cmluZ1wiJiZzb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKXtcclxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzZWRDb2RlPXNvdXJjZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZXsvKlxyXG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5zb3VyY2U7XHJcbiAgICAgICAgICAgIHRoaXMuZmluZFZpZXdBbmNob3JzKCk7XHJcbiAgICAgICAgICAgIHRoaXMuYXBwbHlQb3N0UHJvY2Vzc2luZygpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5kZWJ1Z0luZm8rPVwiXFxuXFxudGhpcy5taWRQb2ludDpcXG5cIitKU09OLnN0cmluZ2lmeSh0aGlzLnZpZXdBbmNob3JzLG51bGwsMSkrXCJcXG5cIlxyXG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9SlNPTi5zdHJpbmdpZnkodGhpcy50b2tlbnMsbnVsbCwxKStcIlxcblxcblwiXHJcblxyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGUgKz0gdGhpcy50b1N0cmluZygpO1xyXG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9dGhpcy5wcm9jZXNzZWRDb2RlOyovXHJcbiAgICAgICAgfVxyXG5cdH1cclxuICAgIGJhc2ljQXJyYXlpZnkoKXtcclxuICAgICAgICBjb25zdCBiYXNpY0FycmF5ID0gW107XHJcbiAgICAgICAgY29uc3Qgb3BlcmF0b3JzUmVnZXggPSBuZXcgUmVnRXhwKCdeJyArIGFyclRvUmVnZXhTdHJpbmcoZ2V0QWxsVGlrelJlZmVyZW5jZXMoKSkpO1xyXG4gICAgICAgIGxldCBpID0gMDtcclxuICAgICAgICAgXHJcbiAgICAgICAgd2hpbGUgKGkgPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc3Qgc3ViU291cmNlID0gdGhpcy5zb3VyY2Uuc2xpY2UoaSk7XHJcbiAgICAgICAgICAgIGxldCBtYXRjaDtcclxuICAgICAgICBcclxuICAgICAgICAgICAgLy8gTWF0Y2ggVGlrWiBvcGVyYXRvcnNcclxuICAgICAgICAgICAgbWF0Y2ggPSBzdWJTb3VyY2UubWF0Y2gob3BlcmF0b3JzUmVnZXgpO1xyXG4gICAgICAgICAgICBpZiAobWF0Y2gpIHtcclxuICAgICAgICAgICAgYmFzaWNBcnJheS5wdXNoKHsgdHlwZTogJ3N0cmluZycsIHZhbHVlOiBtYXRjaFswXSB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAgICAgLy8gTWF0Y2ggbnVtYmVyc1xyXG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaCgvXlstMC05Ll0rLyk7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnbnVtYmVyJywgdmFsdWU6IHBhcnNlTnVtYmVyKG1hdGNoWzBdKSB9KTtcclxuICAgICAgICAgICAgICAgIGkgKz0gbWF0Y2hbMF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAgICAgLy8gSW5jcmVtZW50IGluZGV4IGlmIG5vIG1hdGNoIGZvdW5kXHJcbiAgICAgICAgICAgIGkrKztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGJhc2ljQXJyYXlcclxuICAgIH1cclxuICAgIGJhc2ljVGlrelRva2VuaWZ5KGJhc2ljQXJyYXkpe1xyXG4gICAgICAgIGxldCBiYXNpY1Rpa3pUb2tlbnM6IEFycmF5PEJhc2ljVGlrelRva2VufEZvcm1hdHRpbmc+ID0gW107XHJcbiAgICAgICAgIC8vIFByb2Nlc3MgdG9rZW5zXHJcbiAgICAgICAgYmFzaWNBcnJheS5mb3JFYWNoKCh7IHR5cGUsIHZhbHVlIH0pID0+IHtcclxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0aWt6Q29tbWFuZCA9IHNlYXJjaFRpemtDb21tYW5kcyh2YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGlmICh0aWt6Q29tbWFuZCkge1xyXG4gICAgICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnB1c2gobmV3IEJhc2ljVGlrelRva2VuKHRpa3pDb21tYW5kKSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcclxuICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnB1c2gobmV3IEJhc2ljVGlrelRva2VuKHZhbHVlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBpZFBhcmVudGhlc2VzKGJhc2ljVGlrelRva2VucylcclxuICAgICAgICByZXR1cm4gYmFzaWNUaWt6VG9rZW5zO1xyXG4gICAgfVxyXG4gICAgY2xlYW5CYXNpY1Rpa3pUb2tlbmlmeShiYXNpY1Rpa3pUb2tlbnMpe1xyXG4gICAgICAgIGNvbnN0IHVuaXRJbmRpY2VzOiBudW1iZXJbXSA9IGJhc2ljVGlrelRva2Vuc1xyXG4gICAgICAgIC5tYXAoKHRva2VuLCBpZHgpID0+ICh0b2tlbi50eXBlID09PSAnVW5pdCcgPyBpZHggOiBudWxsKSlcclxuICAgICAgICAuZmlsdGVyKChpZHgpOiBpZHggaXMgbnVtYmVyID0+IGlkeCAhPT0gbnVsbCk7XHJcblxyXG4gICAgICAgIHVuaXRJbmRpY2VzLmZvckVhY2goKHVuaXRJZHgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcHJldlRva2VuID0gYmFzaWNUaWt6VG9rZW5zW3VuaXRJZHggLSAxXTtcclxuXHJcbiAgICAgICAgICAgIGlmICghcHJldlRva2VuIHx8IHByZXZUb2tlbi50eXBlICE9PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbml0cyBjYW4gb25seSBiZSB1c2VkIGluIHJlZmVyZW5jZSB0byBudW1iZXJzIGF0IGluZGV4ICR7dW5pdElkeH1gKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcHJldlRva2VuLnZhbHVlID0gdG9Qb2ludChwcmV2VG9rZW4udmFsdWUgYXMgbnVtYmVyLCBiYXNpY1Rpa3pUb2tlbnNbdW5pdElkeF0ubmFtZSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGJhc2ljVGlrelRva2Vucz1iYXNpY1Rpa3pUb2tlbnMuZmlsdGVyKChfLCBpZHgpID0+ICghdW5pdEluZGljZXMuaW5jbHVkZXMoaWR4KSkpO1xyXG4gICAgICAgIC8vYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2Vucy5maWx0ZXIoKHQpID0+IHQubmFtZSE9PSdDb21tYScpO1xyXG4gICAgICAgIC8qXHJcbiAgICAgICAgY29uc3QgaW5kZXhlc1RvUmVtb3ZlOiBudW1iZXJbXT1bXVxyXG4gICAgICAgIGJhc2ljVGlrelRva2Vucy5mb3JFYWNoKCh0b2tlbixpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBpZih0b2tlbi50eXBlPT09J0Zvcm1hdHRpbmcnKXtcclxuICAgICAgICAgICAgICAgIGlmKGJhc2ljVGlrelRva2Vuc1tpbmRleCsxXS5uYW1lPT09J0VxdWFscycpXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zW2luZGV4XS52YWx1ZT1iYXNpY1Rpa3pUb2tlbnNbaW5kZXgrMl1cclxuICAgICAgICAgICAgICAgICAgICBpbmRleGVzVG9SZW1vdmUucHVzaChpbmRleCsxLGluZGV4KzIpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCFpbmRleGVzVG9SZW1vdmUuaW5jbHVkZXMoaWR4KSkpOyovXHJcblxyXG5cclxuXHJcbiAgICAgICAgY29uc3QgbWFwU3ludGF4ID0gYmFzaWNUaWt6VG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuLnR5cGUgPT09ICdTeW50YXgnICYmIC8oRGFzaHxQbHVzKS8udGVzdCh0b2tlbi5uYW1lKSA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAgICAgY29uc3Qgc3ludGF4U2VxdWVuY2VzID0gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG1hcFN5bnRheCk7XHJcblxyXG5cclxuICAgICAgICBjb25zdCBzeW50YXhPYmplY3RzID0gc3ludGF4U2VxdWVuY2VzXHJcbiAgICAgICAgLm1hcCgoc2VxdWVuY2UpID0+IHtcclxuICAgICAgICAgICAgaWYgKHNlcXVlbmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7IC8vIEhhbmRsZSBlbXB0eSBzZXF1ZW5jZXNcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gc2VxdWVuY2VbMF07XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IHNlcXVlbmNlW3NlcXVlbmNlLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gc2VxdWVuY2VcclxuICAgICAgICAgICAgICAgIC5tYXAoKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBiYXNpY1Rpa3pUb2tlbnNbaW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdG9rZW4gfHwgIXRva2VuLm5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBNaXNzaW5nIG9yIGludmFsaWQgdG9rZW4gYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnOyAvLyBQcm92aWRlIGEgZmFsbGJhY2tcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuLm5hbWVcclxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL0Rhc2gvLCAnLScpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9QbHVzLywgJysnKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuam9pbignJyk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4geyBzdGFydCwgZW5kLCB2YWx1ZSB9O1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmZpbHRlcigob2JqKSA9PiBvYmogIT09IG51bGwpXHJcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc3RhcnQgLSBhLnN0YXJ0KTtcclxuXHJcbiAgICAgICAgc3ludGF4T2JqZWN0cy5mb3JFYWNoKCh7IHN0YXJ0LCBlbmQsIHZhbHVlIH0pID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29tbWFuZCA9IHNlYXJjaFRpemtDb21tYW5kcyh2YWx1ZSk7IFxyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBCYXNpY1Rpa3pUb2tlbihjb21tYW5kKVxyXG4gICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMuc3BsaWNlKHN0YXJ0LCBlbmQgKyAxIC0gc3RhcnQsIHRva2VuKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gYmFzaWNUaWt6VG9rZW5zXHJcbiAgICB9XHJcblxyXG4gICAgUHJlcGFyZUZvclRva2VuaXplKGJhc2ljVGlrelRva2Vucyl7XHJcblxyXG4gICAgICAgIGNvbnN0IHNxdWFyZUJyYWNrZXRJbmRleGVzID0gbWFwQnJhY2tldHMoJ1NxdWFyZV9icmFja2V0c19vcGVuJyxiYXNpY1Rpa3pUb2tlbnMpXHJcbiAgICAgICAgXHJcbiAgICAgICAgc3F1YXJlQnJhY2tldEluZGV4ZXNcclxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5vcGVuIC0gYS5vcGVuKSAvLyBTb3J0IGluIGRlc2NlbmRpbmcgb3JkZXIgb2YgJ29wZW4nXHJcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBuZXcgRm9ybWF0dGluZyhcclxuICAgICAgICAgICAgICAgIGNsZWFuRm9ybWF0dGluZyhiYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKSlcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgYmFzaWNUaWt6VG9rZW5zLnNwbGljZShpbmRleC5vcGVuLCBpbmRleC5jbG9zZSArIDEgLSBpbmRleC5vcGVuLCBmb3JtYXR0aW5nKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgcHJhbmVJbmRleGVzID0gbWFwQnJhY2tldHMoJ1BhcmVudGhlc2VzX29wZW4nICxiYXNpY1Rpa3pUb2tlbnMpXHJcbiAgICAgICAgcHJhbmVJbmRleGVzXHJcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIub3BlbiAtIGEub3BlbikgXHJcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGF4aXMgPSBuZXcgQXhpcygpLnBhcnNlSW5wdXQoXHJcbiAgICAgICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGF4aXMpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBiYXNpY1Rpa3pUb2tlbnNcclxuICAgIH1cclxuICAgIHRva2VuaXplKGJhc2ljVGlrelRva2Vucyl7XHJcbiAgICAgICAgbGV0IGVuZEluZGV4XHJcbiAgICAgICAgZm9yKGxldCBpPTA7aTxiYXNpY1Rpa3pUb2tlbnMubGVuZ3RoO2krKyl7XHJcbiAgICAgICAgICAgIGlmIChiYXNpY1Rpa3pUb2tlbnNbaV0ubmFtZT09PSdEcmF3Jyl7XHJcbiAgICAgICAgICAgICAgICBlbmRJbmRleD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSkuZmluZEluZGV4KHQ9PnQubmFtZT09PSdTZW1pY29sb24nKStpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBkcmF3U2VnbWVudD1iYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaSsxLGVuZEluZGV4KVxyXG4gICAgICAgICAgICAgICAgaT1lbmRJbmRleFxyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ2RyYXdTZWdtZW50JyxkcmF3U2VnbWVudCxiYXNpY1Rpa3pUb2tlbnNbaV0pXHJcbiAgICAgICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KCdkcmF3JykuZmlsbENvb3JkaW5hdGVzKGRyYXdTZWdtZW50KSlcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8qXHJcbiAgICAgICAgVGhleSdyZSBnb2luZyB0byBiZSB0aHJlZSB0eXBlcyBzdHJpbmdlZCBzeW50YXggbnVtYmVyLlxyXG4gICAgICAgICBJIHVzZSB0aGVtIHRvIHRva2VuaXplLiB1c2luZyB0aGUgdGlja3MgY29tbWFuZHMuIE9uY2UgdG9rZW5pemVyIHRha2VzIGNvbW1hbmRzLlxyXG4gICAgICAgICBJIG1vdmUgb24gdG8gYWN0dWFsIGV2YWx1YXRpb24uXHJcbiAgICAgICAgKi9cclxuXHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IHN1YmRlZmluZWRUb2tlbnM9W107XHJcbiAgICAgICAgLypcclxuICAgICAgICBmb3IgKGxldCBpPTA7aTxiYXNpY1Rpa3pUb2tlbnMubGVuZ3RoO2krKyl7XHJcblxyXG4gICAgICAgIH0qL1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGJhc2ljVGlrelRva2Vucyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRpZHlUaWt6U291cmNlKHRpa3pTb3VyY2U6IHN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHJlbW92ZSA9IFwiJm5ic3A7XCI7XHJcbiAgICAgICAgdGlrelNvdXJjZSA9IHRpa3pTb3VyY2UucmVwbGFjZUFsbChyZW1vdmUsIFwiXCIpO2xldCBsaW5lcyA9IHRpa3pTb3VyY2Uuc3BsaXQoXCJcXG5cIik7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5tYXAobGluZSA9PiBsaW5lLnRyaW0oKSk7XHJcbiAgICAgICAgbGluZXMgPSBsaW5lcy5maWx0ZXIobGluZSA9PiBsaW5lKTtcclxuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJykucmVwbGFjZSgvKD88PVteXFx3XSkgfCAoPz1bXlxcd10pL2csIFwiXCIpLnJlcGxhY2UoLyg/PCFcXFxcKSUuKiQvZ20sIFwiXCIpLnJlcGxhY2UoL1xcbi9nLFwiXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIGdldENvZGUoKXtcclxuICAgICAgICBpZiAodHlwZW9mIHRoaXMuc291cmNlPT09XCJzdHJpbmdcIiYmdGhpcy5zb3VyY2UubWF0Y2goLyh1c2VwYWNrYWdlfHVzZXRpa3psaWJyYXJ5KS8pKVxyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcm9jZXNzZWRDb2RlXHJcbiAgICAgICAgcmV0dXJuIGdldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhcHBseVBvc3RQcm9jZXNzaW5nKCl7XHJcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgICAgIGZsYXRBeGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcclxuICAgICAgICAgICAgYXhpcy5hZGRRdWFkcmFudCh0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgZmxhdERyYXc9ZmxhdHRlbih0aGlzLnRva2VucyxbXSxEcmF3KS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgRHJhdyk7XHJcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0ICBbaW5kZXgsIGNvb3JdIG9mIGRyYXcuY29vcmRpbmF0ZXMuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoY29vciBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG5cclxuICAgIC8qXHJcbiAgICB0b2tlbml6ZSgpIHtcclxuICAgICAgICBcclxuXHJcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxccy0sLjp8YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxyXG4gICAgICAgIGNvbnN0IGMgPSBTdHJpbmcucmF3YFskKF17MCwyfVske2NhfV0rWykkXXswLDJ9fFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXStcXChbJHtjYX1dK1xcKVxcJGA7XHJcbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHdpdGggZXNjYXBlZCBjaGFyYWN0ZXJzIGZvciBzcGVjaWZpYyBtYXRjaGluZ1xyXG4gICAgICAgIGNvbnN0IGNuID0gU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gOyAvLyBDb29yZGluYXRlIG5hbWVcclxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcXFwiP1xcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcIF5dKlxcJFxcXCI/fFtcXHdcXGRcXHNcXC0sLjooISlfXFwtXFwrXFxcXF5dKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcbiAgICAgICAgY29uc3QgZiA9IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOy4mKlxce1xcfSVcXC08Pl1gOyAvLyBGb3JtYXR0aW5nIHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgY29vclJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHBpY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxwaWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBzZSA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxccypcXCgqKCR7Y259KVxcKSpcXHMqYXRcXHMqXFwoKCR7Y30pXFwpXFxzKlxcWygke2Z9KilcXF1cXHMqXFx7KCR7dH0pXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHh5YXhpc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx4eWF4aXN7KCR7dH0pfXsoJHt0fSl9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgbWFzc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxtYXNzXFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KC1cXHx8XFx8fD4pezAsMX1cXH1cXHsoW1xcZC5dKilcXH1gLFwiZ1wiKTtcclxuICAgICAgICAvL1xccGlje2FuYzJ9e2FuYzF9e2FuYzB9ezc1XlxcY2lyYyB9e307XHJcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtjb29yUmVnZXgsIHNlLCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4LHBpY1JlZ2V4XTtcclxuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XHJcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcclxuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGEuaW5kZXggfHwgMCkgLSAoYi5pbmRleCB8fCAwKSk7XHJcblxyXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxyXG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbNV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzRdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFsyXX0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcImNvb3JkaW5hdGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcImNvb3JkaW5hdGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xyXG5cclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxwaWNcIikpIHtcclxuICAgICAgICAgICAgY29uc3QgYzE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcylcclxuICAgICAgICAgICAgY29uc3QgYzI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcylcclxuICAgICAgICAgICAgY29uc3QgYzM9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbM10sdGhpcylcclxuXHJcblxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHttb2RlOiBcInBpYy1hbmdcIix0b2tlbnM6IHRoaXMsZm9ybWF0dGluZ1N0cmluZzogbWF0Y2hbNV0sZm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6IFwiYW5nXCIsaWNUZXh0OiBtYXRjaFs0XX0sZHJhd0FycjogW2MxLGMyLGMzXX0pKTtcclxuICAgICAgICAgIH1lbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh1bmRlZmluZWQsbWF0Y2hbMV0sbWF0Y2hbMl0sIHRoaXMpKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxncmlkXCIpKSB7XHJcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XHJcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzNdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX1cclxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNpcmNsZVwiKSkgey8qXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXHJcbiAgICAgICAgICAgICAgZm9ybWF0dGluZzogbWF0Y2hbNF0sXHJcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMl0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICB9KTsqXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixsYWJlbDogbWF0Y2hbMl0sYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIse3Rpa3pzZXQ6ICdtYXNzJyxhbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KX0pKVxyXG5cclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcclxuICAgICAgICAgICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGF4aXMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzJdLHRoaXMpO1xyXG4gICAgICAgICAgICBjb25zdCBub2RlPW5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGUtaW5saW5lXCIsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoJ25vZGUtaW5saW5lJyx7Y29sb3I6IFwicmVkXCJ9KX0pXHJcblxyXG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQ29vcmRpbmF0ZShcIm5vZGUtaW5saW5lXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBxPVthbmNlciwnLS0rJyxub2RlLGF4aXMxXVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHtmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogJ3ZlYyd9LHRva2VuczogdGhpcyxkcmF3QXJyOiBxfSkpXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcclxuICAgICAgICB9XHJcbiAgICB9Ki9cclxuICAgIGdldE1pbigpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1pbn1cclxuICAgIGdldE1heCgpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1heH1cclxuXHJcbiAgICBmaW5kVmlld0FuY2hvcnMoKSB7XHJcbiAgICAgICAgY29uc3QgYXhlcyA9IGZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XHJcbiAgICAgICAgbGV0IG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHk7XHJcbiAgICAgICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5O1xyXG4gICAgXHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycyA9IHtcclxuICAgICAgICAgICAgbWF4OiBuZXcgQXhpcygwLCAwKSxcclxuICAgICAgICAgICAgbWluOiBuZXcgQXhpcygwLCAwKSxcclxuICAgICAgICAgICAgYXZlTWlkUG9pbnQ6IG5ldyBBeGlzKDAsIDApXHJcbiAgICAgICAgfTtcclxuICAgIFxyXG4gICAgICAgIGF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB7IGNhcnRlc2lhblgsIGNhcnRlc2lhblkgfSA9IGF4aXM7XHJcbiAgICBcclxuICAgICAgICAgICAgLy8gVXBkYXRlIHN1bXMgZm9yIGF2ZXJhZ2UgY2FsY3VsYXRpb25cclxuICAgICAgICAgICAgc3VtT2ZYICs9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIHN1bU9mWSArPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBtYXggYW5kIG1pbiBjb29yZGluYXRlc1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA+IG1heFgpIG1heFggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA+IG1heFkpIG1heFkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA8IG1pblgpIG1pblggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA8IG1pblkpIG1pblkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIH0pO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgbGVuZ3RoID0gYXhlcy5sZW5ndGggIT09IDAgPyBheGVzLmxlbmd0aCA6IDE7XHJcbiAgICBcclxuICAgICAgICAvLyBTZXQgdGhlIHZpZXdBbmNob3JzXHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCA9IG5ldyBBeGlzKHN1bU9mWCAvIGxlbmd0aCwgc3VtT2ZZIC8gbGVuZ3RoKTtcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLm1heCA9IG5ldyBBeGlzKG1heFgsIG1heFkpO1xyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWluID0gbmV3IEF4aXMobWluWCwgbWluWSk7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3Qgb2cgPSB0aGlzLnRva2Vucy5zbGljZSgpLnJldmVyc2UoKS5maW5kKFxyXG4gICAgICAgICAgICAodG9rZW46IFRva2VuKSA9PlxyXG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gb2cgaW5zdGFuY2VvZiBDb29yZGluYXRlID8gb2cuY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XHJcbiAgICAgICAgY29uc3QgZXh0cmVtZVhZPWdldEV4dHJlbWVYWSh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG5cclxuICAgICAgICAgICAgaWYodG9rZW4udG9TdHJpbmcoKSl7XHJcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xyXG4gICAgfVxyXG59XHJcbmNsYXNzIFRpa3pWYXJpYWJsZXN7XHJcblxyXG59XHJcblxyXG5mdW5jdGlvbiBmbGF0dGVuKGRhdGE6IGFueSwgcmVzdWx0czogYW55W10gPSBbXSwgc3RvcENsYXNzPzogYW55KTogYW55W10ge1xyXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcclxuICAgICAgZm9yIChjb25zdCBpdGVtIG9mIGRhdGEpIHtcclxuICAgICAgICBmbGF0dGVuKGl0ZW0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XHJcbiAgICAgIH1cclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnICYmIGRhdGEgIT09IG51bGwpIHtcclxuICAgICAgLy8gSWYgdGhlIG9iamVjdCBpcyBhbiBpbnN0YW5jZSBvZiB0aGUgc3RvcENsYXNzLCBhZGQgaXQgdG8gcmVzdWx0cyBhbmQgc3RvcCBmbGF0dGVuaW5nXHJcbiAgICAgIGlmIChzdG9wQ2xhc3MgJiYgZGF0YSBpbnN0YW5jZW9mIHN0b3BDbGFzcykge1xyXG4gICAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcclxuICAgICAgICByZXR1cm4gcmVzdWx0cztcclxuICAgICAgfVxyXG4gIFxyXG4gICAgICAvLyBBZGQgdGhlIGN1cnJlbnQgb2JqZWN0IHRvIHJlc3VsdHNcclxuICAgICAgcmVzdWx0cy5wdXNoKGRhdGEpO1xyXG4gIFxyXG4gICAgICAvLyBSZWN1cnNpdmVseSBmbGF0dGVuIHByb3BlcnRpZXMgb2YgdGhlIG9iamVjdFxyXG4gICAgICBmb3IgKGNvbnN0IGtleSBpbiBkYXRhKSB7XHJcbiAgICAgICAgaWYgKGRhdGEuaGFzT3duUHJvcGVydHkoa2V5KSkge1xyXG4gICAgICAgICAgZmxhdHRlbihkYXRhW2tleV0sIHJlc3VsdHMsIHN0b3BDbGFzcyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVzdWx0cztcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0RXh0cmVtZVhZKHRva2VuczogYW55KSB7XHJcbiAgICBsZXQgbWF4WCA9IC1JbmZpbml0eTtcclxuICAgIGxldCBtYXhZID0gLUluZmluaXR5O1xyXG4gICAgbGV0IG1pblggPSBJbmZpbml0eTtcclxuICAgIGxldCBtaW5ZID0gSW5maW5pdHk7XHJcbiAgICBcclxuICAgIHRva2Vucy5mb3JFYWNoKCh0b2tlbjogYW55KSA9PiB7XHJcbiAgICAgICAgaWYgKHRva2VuLnR5cGUgPT09IFwiY29vcmRpbmF0ZVwiKSB7XHJcbiAgICAgICAgaWYgKHRva2VuLlggPiBtYXhYKSBtYXhYID0gdG9rZW4uWDtcclxuICAgICAgICBpZiAodG9rZW4uWCA8IG1pblgpIG1pblggPSB0b2tlbi5YO1xyXG4gICAgXHJcbiAgICAgICAgaWYgKHRva2VuLlkgPiBtYXhZKSBtYXhZID0gdG9rZW4uWTtcclxuICAgICAgICBpZiAodG9rZW4uWSA8IG1pblkpIG1pblkgPSB0b2tlbi5ZO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIG1heFgsbWF4WSxtaW5YLG1pblksXHJcbiAgICB9O1xyXG59XHJcblxyXG5jb25zdCBwYXJzZU51bWJlciA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XHJcbiAgICBjb25zdCBudW1iZXJWYWx1ZSA9IHBhcnNlRmxvYXQodmFsdWUpO1xyXG4gICAgcmV0dXJuIGlzTmFOKG51bWJlclZhbHVlKSA/IDAgOiBudW1iZXJWYWx1ZTtcclxufTtcclxuXHJcblxyXG5cclxuXHJcblxyXG5mdW5jdGlvbiBnZXRQcmVhbWJsZSgpOnN0cmluZ3tcclxuICAgIGNvbnN0IGFuZz1cIlxcXFx0aWt6c2V0e2FuZy8uc3R5bGUgMiBhcmdzPXtmaWxsPWJsYWNrITUwLG9wYWNpdHk9MC41LHRleHQgb3BhY2l0eT0wLjksZHJhdz1vcmFuZ2UsPC0+LGFuZ2xlIGVjY2VudHJpY2l0eT0jMSxhbmdsZSByYWRpdXM9IzJjbSx0ZXh0PW9yYW5nZSxmb250PVxcXFxsYXJnZX0sYW5nLy5kZWZhdWx0PXsxLjZ9ezAuNX19XCJcclxuICBcclxuICAgIGNvbnN0IG1hcms9XCJcXFxcZGVmXFxcXG1hcmsjMSMyIzN7XFxcXHBhdGggW2RlY29yYXRpb249e21hcmtpbmdzLCBtYXJrPWF0IHBvc2l0aW9uIDAuNSB3aXRoIHtcXFxcZm9yZWFjaCBcXFxceCBpbiB7IzF9IHsgXFxcXGRyYXdbbGluZSB3aWR0aD0xcHRdIChcXFxceCwtM3B0KSAtLSAoXFxcXHgsM3B0KTsgfX19LCBwb3N0YWN0aW9uPWRlY29yYXRlXSAoIzIpIC0tICgjMyk7fVwiXHJcbiAgXHJcbiAgICBjb25zdCBhcnI9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYXJyfVs4XXtcXFxcY29vcmRpbmF0ZSAoMikgYXQgKCQoIzIpISM3ISgjMykkKTtcXFxcY29vcmRpbmF0ZSAoMSkgYXQgKCQoMikhIzVtbSE5MDooIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDMpIGF0ICgkKDIpISM1bW0rIzRjbSEjODooIzMpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MXB0LDwtXSAoMSktLSgzKW5vZGUgW3Bvcz0jNl0ge1xcXFxsYXJnZSAjMX07fVwiIFxyXG4gICAgY29uc3QgbGVuZT1cIlxcXFxkZWZcXFxcY29yIzEjMiMzIzQjNXtcXFxcY29vcmRpbmF0ZSAoIzEpIGF0KCQoIzIpISMzISM0OigjNSkkKTt9XFxcXGRlZlxcXFxkciMxIzJ7XFxcXGRyYXcgW2xpbmUgd2lkdGg9IzEsXSMyO31cXFxcbmV3Y29tbWFuZHtcXFxcbGVufVs2XXtcXFxcY29yezF9eyMyfXsjM317OTB9eyM0fVxcXFxjb3J7M317IzR9eyMzfXstOTB9eyMyfVxcXFxub2RlICgyKSBhdCAoJCgxKSEwLjUhKDMpJCkgW3JvdGF0ZT0jNl17XFxcXGxhcmdlICMxfTtcXFxcZHJ7IzVwdCx8PC19eygxKS0tKDIpfVxcXFxkcnsjNXB0LC0+fH17KDIpLS0oMyl9fVwiXHJcbiAgICBjb25zdCBzcHJpbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcc3ByaW5nfVs0XXtcXFxcdGlrem1hdGh7Y29vcmRpbmF0ZSBcXFxcc3RhcnQsIFxcXFxkb25lO1xcXFxzdGFydCA9ICgjMSk7XFxcXGRvbmUgPSAoIzIpO31cXFxcZHJhd1t0aGlja10gKCQoXFxcXHN0YXJ0KSArICgtMS41LDApJCkgLS0rKygzLDApO1xcXFxkcmF3IChcXFxcc3RhcnQpIC0tKyAoMCwtMC4yNWNtKTtcXFxcZHJhdyAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCswY20sXFxcXGRvbmV5KzAuMjVjbSkkKS0tKygwLC0wLjI1KTtcXFxcZHJhd1tkZWNvcmF0aW9uPXthc3BlY3Q9MC4zLCBzZWdtZW50IGxlbmd0aD0zLCBhbXBsaXR1ZGU9Mm1tLGNvaWwsfSxkZWNvcmF0ZV0gKFxcXFxzdGFydHgsXFxcXHN0YXJ0eS0wLjI1Y20pIC0tKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KzAuMjVjbSkkKW5vZGVbbWlkd2F5LHJpZ2h0PTAuMjVjbSxibGFja117IzR9O1xcXFxub2RlW2ZpbGw9eWVsbG93ITYwLGRyYXcsdGV4dD1ibGFjayxhbmNob3I9IG5vcnRoXSBhdCAoJChcXFxcc3RhcnQpICsgKFxcXFxkb25leCxcXFxcZG9uZXkpJCl7IzN9O31cIlxyXG4gICAgXHJcbiAgICBjb25zdCB0cmVlPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGxlbnV9WzNde1xcXFx0aWt6c2V0e2xldmVsIGRpc3RhbmNlPTIwbW0sbGV2ZWwgIzEvLnN0eWxlPXtzaWJsaW5nIGRpc3RhbmNlPSMybW0sIG5vZGVzPXtmaWxsPXJlZCEjMyxjaXJjbGUsaW5uZXIgc2VwPTFwdCxkcmF3PW5vbmUsdGV4dD1ibGFjayx9fX19XCJcclxuICAgIFxyXG4gICAgY29uc3QgdGFibGU9XCJcXFxcdGlrenNldHsgdGFibGUvLnN0eWxlPXttYXRyaXggb2Ygbm9kZXMscm93IHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxjb2x1bW4gc2VwPS1cXFxccGdmbGluZXdpZHRoLG5vZGVzPXtyZWN0YW5nbGUsZHJhdz1ibGFjayxhbGlnbj1jZW50ZXJ9LG1pbmltdW0gaGVpZ2h0PTEuNWVtLHRleHQgZGVwdGg9MC41ZXgsdGV4dCBoZWlnaHQ9MmV4LG5vZGVzIGluIGVtcHR5IGNlbGxzLGV2ZXJ5IGV2ZW4gcm93Ly5zdHlsZT17bm9kZXM9e2ZpbGw9Z3JheSE2MCx0ZXh0PWJsYWNrLH19LGNvbHVtbiAxLy5zdHlsZT17bm9kZXM9e3RleHQgd2lkdGg9NWVtLGZvbnQ9XFxcXGJmc2VyaWVzfX0scm93IDEvLnN0eWxlPXtub2Rlcz17Zm9udD1cXFxcYmZzZXJpZXN9fX19XCJcclxuICAgIGNvbnN0IGNvb3I9XCJcXFxcZGVmXFxcXGNvb3IjMSMyIzMjNHtcXFxcY29vcmRpbmF0ZSBbbGFiZWw9e1sjNF06XFxcXExhcmdlICMzfV0gKCMyKSBhdCAoJCgjMSkkKTt9XCJcclxuICAgIC8vY29uc3QgbWFzcz1gXFxcXGRlZlxcXFxtYXNzIzEjMntcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCMxKXsjMn07fWBcclxuICAgIGNvbnN0IGR2ZWN0b3I9XCJcXFxcbmV3Y29tbWFuZHtcXFxcZHZlY3Rvcn1bMl17XFxcXGNvb3JkaW5hdGUgKHRlbXAxKSBhdCAoJCgwLDAgLXwgIzEpJCk7XFxcXGNvb3JkaW5hdGUgKHRlbXAyKSBhdCAoJCgwLDAgfC0gIzEpJCk7XFxcXGRyYXcgW2xpbmUgd2lkdGg9MC43cHQsIzJdICgjMSktLSh0ZW1wMSkoIzEpLS0odGVtcDIpO31cIlxyXG4gICAgXHJcbiAgICBjb25zdCBwaWNBbmc9XCJcXFxcbmV3Y29tbWFuZHtcXFxcYW5nfVs1XXtcXFxcY29vcmRpbmF0ZSAoYW5nMSkgYXQgKCMxKTsgXFxcXGNvb3JkaW5hdGUgKGFuZzIpIGF0ICgjMik7IFxcXFxjb29yZGluYXRlIChhbmczKSBhdCAoIzMpOyBcXFxccGdmbWF0aGFuZ2xlYmV0d2VlbnBvaW50c3tcXFxccGdmcG9pbnRhbmNob3J7YW5nM317Y2VudGVyfX17XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19XFxcXGxldFxcXFxhbmdDQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzJ9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcxfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQUJcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXGFuZ0NCIC0gXFxcXGFuZ0FCfVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PDBwdFxcXFxwZ2ZtYXRocGFyc2V7XFxcXHBnZm1hdGhyZXN1bHQgKyAzNjB9XFxcXGZpXFxcXGlmZGltXFxcXHBnZm1hdGhyZXN1bHQgcHQ+MTgwcHRcXFxccGdmbWF0aHBhcnNlezM2MCAtIFxcXFxwZ2ZtYXRocmVzdWx0fVxcXFxmaVxcXFxsZXRcXFxcYW5nQlxcXFxwZ2ZtYXRocmVzdWx0XFxcXHBnZm1hdGhzZXRtYWNyb3tcXFxcYW5nbGVDaGVja317YWJzKFxcXFxhbmdCIC0gOTApfVxcXFxpZnRoZW5lbHNle1xcXFxsZW5ndGh0ZXN0e1xcXFxhbmdsZUNoZWNrIHB0IDwgMC4xcHR9fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXtyaWdodCBhbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9e1xcXFxwaWMgW2FuZyM1LFxcXCJ7JHsjNH1cXCR9XFxcIixde2FuZ2xlPWFuZzEtLWFuZzItLWFuZzN9O319XCJcclxuICAgIGNvbnN0IHByZWFtYmxlPVwiXFxcXHVzZXBhY2thZ2V7cGdmcGxvdHMsaWZ0aGVufVxcXFx1c2V0aWt6bGlicmFyeXthcnJvd3MubWV0YSxhbmdsZXMscXVvdGVzLHBvc2l0aW9uaW5nLCBjYWxjLCBpbnRlcnNlY3Rpb25zLGRlY29yYXRpb25zLm1hcmtpbmdzLG1hdGgsc3B5LG1hdHJpeCxwYXR0ZXJucyxzbmFrZXMsZGVjb3JhdGlvbnMucGF0aHJlcGxhY2luZyxkZWNvcmF0aW9ucy5wYXRobW9ycGhpbmcscGF0dGVybnMsc2hhZG93cyxzaGFwZXMuc3ltYm9sc31cIlxyXG4gICAgcmV0dXJuIHByZWFtYmxlK2FuZyttYXJrK2FycitsZW5lK3NwcmluZyt0cmVlK3RhYmxlK2Nvb3IrZHZlY3RvcitwaWNBbmcrXCJcXFxccGdmcGxvdHNzZXR7Y29tcGF0PTEuMTZ9XFxcXGJlZ2lue2RvY3VtZW50fVxcXFxiZWdpbnt0aWt6cGljdHVyZX1cIlxyXG59Il19