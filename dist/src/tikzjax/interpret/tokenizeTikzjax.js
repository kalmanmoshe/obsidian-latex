// @ts-nocheck
import { findConsecutiveSequences } from "src/mathEngine";
import { arrToRegexString, Axis, Coordinate, Draw, Formatting, toPoint } from "../tikzjax";
import { getAllTikzReferences, searchTizkCommands } from "src/tikzjax/tikzCommands";
import { idParentheses, mapBrackets } from "src/utils/tokenUtensils";
class BasicTikzToken {
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
        }
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
            const a = this.cleanBasicTikzTokenify(basicTikzTokens);
            this.PrepareForTokenize(a);
            console.log(a);
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
        basicTikzTokens = basicTikzTokens.filter((t) => t.name !== 'Comma');
        const indexesToRemove = [];
        basicTikzTokens.forEach((token, index) => {
            if (token.type === 'Formatting') {
                if (basicTikzTokens[index + 1].name === 'Equals') {
                    basicTikzTokens[index].value = basicTikzTokens[index + 2];
                    indexesToRemove.push(index + 1, index + 2);
                }
            }
        });
        basicTikzTokens = basicTikzTokens.filter((_, idx) => (!indexesToRemove.includes(idx)));
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
            const formatting = new Formatting(basicTikzTokens.slice(index.open + 1, index.close));
            basicTikzTokens.splice(index.open, index.close + 1 - index.open, formatting);
        });
        const praneIndexes = mapBrackets('Parentheses_open', basicTikzTokens);
        praneIndexes
            .sort((a, b) => b.open - a.open)
            .forEach((index) => {
            const formatting = new Coordinate(basicTikzTokens.slice(index.open + 1, index.close));
            basicTikzTokens.splice(index.open, index.close + 1 - index.open, formatting);
        });
    }
    tokenize() {
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
        return ''; //getPreamble()+this.processedCode+"\n\\end{tikzpicture}\\end{document}";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5pemVUaWt6amF4LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Rpa3pqYXgvaW50ZXJwcmV0L3Rva2VuaXplVGlrempheC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxjQUFjO0FBQ2QsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDMUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBaUIsT0FBTyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BGLE9BQU8sRUFBa0IsYUFBYSxFQUFFLFdBQVcsRUFBUyxNQUFNLHlCQUF5QixDQUFDO0FBQzVGLE1BQU0sY0FBYztJQUNoQixJQUFJLENBQVM7SUFDYixJQUFJLENBQVE7SUFDWixLQUFLLENBQXlCO0lBQzlCLFlBQVksS0FBaUI7UUFDekIsSUFBSSxPQUFPLEtBQUssS0FBRyxRQUFRLEVBQUM7WUFDeEIsSUFBSSxDQUFDLElBQUksR0FBQyxRQUFRLENBQUE7WUFDbEIsSUFBSSxDQUFDLEtBQUssR0FBQyxLQUFLLENBQUM7U0FDcEI7YUFDRztZQUNBLElBQUksQ0FBQyxJQUFJLEdBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFDLFFBQVEsQ0FBQyxDQUFBO1lBQ2hELElBQUksQ0FBQyxJQUFJLEdBQUMsS0FBSyxDQUFDLElBQUksQ0FBQTtTQUN2QjtJQUNMLENBQUM7Q0FDSjtBQUVELE1BQU0sT0FBTyxhQUFhO0lBQ3pCLE1BQU0sQ0FBUztJQUNaLE1BQU0sR0FBZSxFQUFFLENBQUM7SUFDeEIsaUJBQWlCO0lBQ1QsV0FBVyxDQUF3QztJQUM5RCxhQUFhLEdBQUMsRUFBRSxDQUFDO0lBQ2QsU0FBUyxHQUFHLEVBQUUsQ0FBQztJQUVsQixZ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UyxNQUFNLE1BQU0sR0FBQywwZ0JBQTBnQixDQUFBO0lBRXZoQixNQUFNLElBQUksR0FBQyxpS0FBaUssQ0FBQTtJQUU1SyxNQUFNLEtBQUssR0FBQyw2V0FBNlcsQ0FBQTtJQUN6WCxNQUFNLElBQUksR0FBQywrRUFBK0UsQ0FBQTtJQUMxRixpR0FBaUc7SUFDakcsTUFBTSxPQUFPLEdBQUMsc0tBQXNLLENBQUE7SUFFcEwsTUFBTSxNQUFNLEdBQUMsOHZCQUE4dkIsQ0FBQTtJQUMzd0IsTUFBTSxRQUFRLEdBQUMsbVBBQW1QLENBQUE7SUFDbFEsT0FBTyxRQUFRLEdBQUMsR0FBRyxHQUFDLElBQUksR0FBQyxHQUFHLEdBQUMsSUFBSSxHQUFDLE1BQU0sR0FBQyxJQUFJLEdBQUMsS0FBSyxHQUFDLElBQUksR0FBQyxPQUFPLEdBQUMsTUFBTSxHQUFDLGlFQUFpRSxDQUFBO0FBQzdJLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAdHMtbm9jaGVja1xyXG5pbXBvcnQgeyBmaW5kQ29uc2VjdXRpdmVTZXF1ZW5jZXMgfSBmcm9tIFwic3JjL21hdGhFbmdpbmVcIjtcclxuaW1wb3J0IHsgYXJyVG9SZWdleFN0cmluZywgQXhpcywgQ29vcmRpbmF0ZSwgRHJhdywgRm9ybWF0dGluZywgcmVnRXhwLCBUb2tlbiwgdG9Qb2ludCB9IGZyb20gXCIuLi90aWt6amF4XCI7XHJcbmltcG9ydCB7IGdldEFsbFRpa3pSZWZlcmVuY2VzLCBzZWFyY2hUaXprQ29tbWFuZHMgfSBmcm9tIFwic3JjL3Rpa3pqYXgvdGlrekNvbW1hbmRzXCI7XHJcbmltcG9ydCB7IGZpbmRQYXJlbkluZGV4LCBpZFBhcmVudGhlc2VzLCBtYXBCcmFja2V0cywgUGFyZW4gfSBmcm9tIFwic3JjL3V0aWxzL3Rva2VuVXRlbnNpbHNcIjtcclxuY2xhc3MgQmFzaWNUaWt6VG9rZW57XHJcbiAgICB0eXBlOiBzdHJpbmc7XHJcbiAgICBuYW1lOiBzdHJpbmdcclxuICAgIHZhbHVlOiBzdHJpbmd8bnVtYmVyfFBhcmVufGFueVxyXG4gICAgY29uc3RydWN0b3IodmFsdWU6IG51bWJlcnxhbnkpe1xyXG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWU9PT0nbnVtYmVyJyl7XHJcbiAgICAgICAgICAgIHRoaXMudHlwZT0nbnVtYmVyJ1xyXG4gICAgICAgICAgICB0aGlzLnZhbHVlPXZhbHVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNle1xyXG4gICAgICAgICAgICB0aGlzLnR5cGU9dmFsdWUudHlwZS5yZXBsYWNlKC9CcmFja2V0LywnU3ludGF4JylcclxuICAgICAgICAgICAgdGhpcy5uYW1lPXZhbHVlLm5hbWVcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBGb3JtYXRUaWt6amF4IHtcclxuXHRzb3VyY2U6IHN0cmluZztcclxuICAgIHRva2VuczogQXJyYXk8VG9rZW4+PVtdO1xyXG4gICAgLy9taWRQb2ludDogQXhpcztcclxuICAgIHByaXZhdGUgdmlld0FuY2hvcnM6IHttYXg6IEF4aXMsbWluOkF4aXMsYXZlTWlkUG9pbnQ6IEF4aXN9XHJcblx0cHJvY2Vzc2VkQ29kZT1cIlwiO1xyXG4gICAgZGVidWdJbmZvID0gXCJcIjtcclxuICAgIFxyXG5cdGNvbnN0cnVjdG9yKHNvdXJjZTogc3RyaW5nfEFycmF5PFRva2VuPikge1xyXG4gICAgICAgIGlmKHR5cGVvZiBzb3VyY2U9PT1cInN0cmluZ1wiKXtcclxuXHRcdHRoaXMuc291cmNlID0gdGhpcy50aWR5VGlrelNvdXJjZShzb3VyY2UpO1xyXG4gICAgICAgIGNvbnN0IGJhc2ljQXJyYXk9dGhpcy5iYXNpY0FycmF5aWZ5KClcclxuICAgICAgICBsZXQgYmFzaWNUaWt6VG9rZW5zPXRoaXMuYmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNBcnJheSlcclxuXHJcbiAgICAgICAgY29uc3QgYT10aGlzLmNsZWFuQmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNUaWt6VG9rZW5zKVxyXG4gICAgICAgIHRoaXMuUHJlcGFyZUZvclRva2VuaXplKGEpXHJcbiAgICAgICAgY29uc29sZS5sb2coYSlcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7dGhpcy50b2tlbnM9c291cmNlfVxyXG5cclxuICAgICAgICBpZiAodHlwZW9mIHNvdXJjZT09PVwic3RyaW5nXCImJnNvdXJjZS5tYXRjaCgvKHVzZXBhY2thZ2V8dXNldGlremxpYnJhcnkpLykpe1xyXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3NlZENvZGU9c291cmNlO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNley8qXHJcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnNvdXJjZTtcclxuICAgICAgICAgICAgdGhpcy5maW5kVmlld0FuY2hvcnMoKTtcclxuICAgICAgICAgICAgdGhpcy5hcHBseVBvc3RQcm9jZXNzaW5nKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmRlYnVnSW5mbys9XCJcXG5cXG50aGlzLm1pZFBvaW50OlxcblwiK0pTT04uc3RyaW5naWZ5KHRoaXMudmlld0FuY2hvcnMsbnVsbCwxKStcIlxcblwiXHJcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz1KU09OLnN0cmluZ2lmeSh0aGlzLnRva2VucyxudWxsLDEpK1wiXFxuXFxuXCJcclxuXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2Vzc2VkQ29kZSArPSB0aGlzLnRvU3RyaW5nKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZGVidWdJbmZvKz10aGlzLnByb2Nlc3NlZENvZGU7Ki9cclxuICAgICAgICB9XHJcblx0fVxyXG4gICAgYmFzaWNBcnJheWlmeSgpe1xyXG4gICAgICAgIGNvbnN0IGJhc2ljQXJyYXkgPSBbXTtcclxuICAgICAgICBjb25zdCBvcGVyYXRvcnNSZWdleCA9IG5ldyBSZWdFeHAoJ14nICsgYXJyVG9SZWdleFN0cmluZyhnZXRBbGxUaWt6UmVmZXJlbmNlcygpKSk7XHJcbiAgICAgICAgbGV0IGkgPSAwO1xyXG4gICAgICAgICBcclxuICAgICAgICB3aGlsZSAoaSA8IHRoaXMuc291cmNlLmxlbmd0aCkge1xyXG4gICAgICAgICAgICBjb25zdCBzdWJTb3VyY2UgPSB0aGlzLnNvdXJjZS5zbGljZShpKTtcclxuICAgICAgICAgICAgbGV0IG1hdGNoO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBNYXRjaCBUaWtaIG9wZXJhdG9yc1xyXG4gICAgICAgICAgICBtYXRjaCA9IHN1YlNvdXJjZS5tYXRjaChvcGVyYXRvcnNSZWdleCk7XHJcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICBiYXNpY0FycmF5LnB1c2goeyB0eXBlOiAnc3RyaW5nJywgdmFsdWU6IG1hdGNoWzBdIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBNYXRjaCBudW1iZXJzXHJcbiAgICAgICAgICAgIG1hdGNoID0gc3ViU291cmNlLm1hdGNoKC9eWy0wLTkuXSsvKTtcclxuICAgICAgICAgICAgaWYgKG1hdGNoKSB7XHJcbiAgICAgICAgICAgIGJhc2ljQXJyYXkucHVzaCh7IHR5cGU6ICdudW1iZXInLCB2YWx1ZTogcGFyc2VOdW1iZXIobWF0Y2hbMF0pIH0pO1xyXG4gICAgICAgICAgICAgICAgaSArPSBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgICAgICAvLyBJbmNyZW1lbnQgaW5kZXggaWYgbm8gbWF0Y2ggZm91bmRcclxuICAgICAgICAgICAgaSsrO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gYmFzaWNBcnJheVxyXG4gICAgfVxyXG4gICAgYmFzaWNUaWt6VG9rZW5pZnkoYmFzaWNBcnJheSl7XHJcbiAgICAgICAgbGV0IGJhc2ljVGlrelRva2VuczogQXJyYXk8QmFzaWNUaWt6VG9rZW58Rm9ybWF0dGluZz4gPSBbXTtcclxuICAgICAgICAgLy8gUHJvY2VzcyB0b2tlbnNcclxuICAgICAgICBiYXNpY0FycmF5LmZvckVhY2goKHsgdHlwZSwgdmFsdWUgfSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRpa3pDb21tYW5kID0gc2VhcmNoVGl6a0NvbW1hbmRzKHZhbHVlKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgaWYgKHRpa3pDb21tYW5kKSB7XHJcbiAgICAgICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odGlrekNvbW1hbmQpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xyXG4gICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMucHVzaChuZXcgQmFzaWNUaWt6VG9rZW4odmFsdWUpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGlkUGFyZW50aGVzZXMoYmFzaWNUaWt6VG9rZW5zKVxyXG4gICAgICAgIHJldHVybiBiYXNpY1Rpa3pUb2tlbnM7XHJcbiAgICB9XHJcbiAgICBjbGVhbkJhc2ljVGlrelRva2VuaWZ5KGJhc2ljVGlrelRva2Vucyl7XHJcbiAgICAgICAgY29uc3QgdW5pdEluZGljZXM6IG51bWJlcltdID0gYmFzaWNUaWt6VG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuLnR5cGUgPT09ICdVbml0JyA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAgICAgdW5pdEluZGljZXMuZm9yRWFjaCgodW5pdElkeCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBwcmV2VG9rZW4gPSBiYXNpY1Rpa3pUb2tlbnNbdW5pdElkeCAtIDFdO1xyXG5cclxuICAgICAgICAgICAgaWYgKCFwcmV2VG9rZW4gfHwgcHJldlRva2VuLnR5cGUgIT09ICdudW1iZXInKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVuaXRzIGNhbiBvbmx5IGJlIHVzZWQgaW4gcmVmZXJlbmNlIHRvIG51bWJlcnMgYXQgaW5kZXggJHt1bml0SWR4fWApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBwcmV2VG9rZW4udmFsdWUgPSB0b1BvaW50KHByZXZUb2tlbi52YWx1ZSBhcyBudW1iZXIsIGJhc2ljVGlrelRva2Vuc1t1bml0SWR4XS5uYW1lKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2Vucy5maWx0ZXIoKF8sIGlkeCkgPT4gKCF1bml0SW5kaWNlcy5pbmNsdWRlcyhpZHgpKSk7XHJcbiAgICAgICAgYmFzaWNUaWt6VG9rZW5zPWJhc2ljVGlrelRva2Vucy5maWx0ZXIoKHQpID0+IHQubmFtZSE9PSdDb21tYScpO1xyXG5cclxuICAgICAgICBjb25zdCBpbmRleGVzVG9SZW1vdmU6IG51bWJlcltdPVtdXHJcbiAgICAgICAgYmFzaWNUaWt6VG9rZW5zLmZvckVhY2goKHRva2VuLGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKHRva2VuLnR5cGU9PT0nRm9ybWF0dGluZycpe1xyXG4gICAgICAgICAgICAgICAgaWYoYmFzaWNUaWt6VG9rZW5zW2luZGV4KzFdLm5hbWU9PT0nRXF1YWxzJylcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnNbaW5kZXhdLnZhbHVlPWJhc2ljVGlrelRva2Vuc1tpbmRleCsyXVxyXG4gICAgICAgICAgICAgICAgICAgIGluZGV4ZXNUb1JlbW92ZS5wdXNoKGluZGV4KzEsaW5kZXgrMik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBiYXNpY1Rpa3pUb2tlbnM9YmFzaWNUaWt6VG9rZW5zLmZpbHRlcigoXywgaWR4KSA9PiAoIWluZGV4ZXNUb1JlbW92ZS5pbmNsdWRlcyhpZHgpKSk7XHJcblxyXG5cclxuXHJcbiAgICAgICAgY29uc3QgbWFwU3ludGF4ID0gYmFzaWNUaWt6VG9rZW5zXHJcbiAgICAgICAgLm1hcCgodG9rZW4sIGlkeCkgPT4gKHRva2VuLnR5cGUgPT09ICdTeW50YXgnICYmIC8oRGFzaHxQbHVzKS8udGVzdCh0b2tlbi5uYW1lKSA/IGlkeCA6IG51bGwpKVxyXG4gICAgICAgIC5maWx0ZXIoKGlkeCk6IGlkeCBpcyBudW1iZXIgPT4gaWR4ICE9PSBudWxsKTtcclxuXHJcbiAgICAgICAgY29uc3Qgc3ludGF4U2VxdWVuY2VzID0gZmluZENvbnNlY3V0aXZlU2VxdWVuY2VzKG1hcFN5bnRheCk7XHJcblxyXG5cclxuICAgICAgICBjb25zdCBzeW50YXhPYmplY3RzID0gc3ludGF4U2VxdWVuY2VzXHJcbiAgICAgICAgLm1hcCgoc2VxdWVuY2UpID0+IHtcclxuICAgICAgICAgICAgaWYgKHNlcXVlbmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7IC8vIEhhbmRsZSBlbXB0eSBzZXF1ZW5jZXNcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0ID0gc2VxdWVuY2VbMF07XHJcbiAgICAgICAgICAgIGNvbnN0IGVuZCA9IHNlcXVlbmNlW3NlcXVlbmNlLmxlbmd0aCAtIDFdO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gc2VxdWVuY2VcclxuICAgICAgICAgICAgICAgIC5tYXAoKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBiYXNpY1Rpa3pUb2tlbnNbaW5kZXhdO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICghdG9rZW4gfHwgIXRva2VuLm5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBNaXNzaW5nIG9yIGludmFsaWQgdG9rZW4gYXQgaW5kZXggJHtpbmRleH1gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICcnOyAvLyBQcm92aWRlIGEgZmFsbGJhY2tcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRva2VuLm5hbWVcclxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL0Rhc2gvLCAnLScpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9QbHVzLywgJysnKTtcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgICAuam9pbignJyk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4geyBzdGFydCwgZW5kLCB2YWx1ZSB9O1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmZpbHRlcigob2JqKSA9PiBvYmogIT09IG51bGwpXHJcbiAgICAgICAgLnNvcnQoKGEsIGIpID0+IGIuc3RhcnQgLSBhLnN0YXJ0KTtcclxuXHJcbiAgICAgICAgc3ludGF4T2JqZWN0cy5mb3JFYWNoKCh7IHN0YXJ0LCBlbmQsIHZhbHVlIH0pID0+IHtcclxuICAgICAgICAgICAgY29uc3QgY29tbWFuZCA9IHNlYXJjaFRpemtDb21tYW5kcyh2YWx1ZSk7IFxyXG4gICAgICAgICAgICBjb25zdCB0b2tlbiA9IG5ldyBCYXNpY1Rpa3pUb2tlbihjb21tYW5kKVxyXG4gICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMuc3BsaWNlKHN0YXJ0LCBlbmQgKyAxIC0gc3RhcnQsIHRva2VuKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gYmFzaWNUaWt6VG9rZW5zXHJcbiAgICB9XHJcblxyXG4gICAgUHJlcGFyZUZvclRva2VuaXplKGJhc2ljVGlrelRva2Vucyl7XHJcblxyXG4gICAgICAgIGNvbnN0IHNxdWFyZUJyYWNrZXRJbmRleGVzID0gbWFwQnJhY2tldHMoJ1NxdWFyZV9icmFja2V0c19vcGVuJyxiYXNpY1Rpa3pUb2tlbnMpXHJcbiAgICAgICAgXHJcbiAgICAgICAgc3F1YXJlQnJhY2tldEluZGV4ZXNcclxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5vcGVuIC0gYS5vcGVuKSAvLyBTb3J0IGluIGRlc2NlbmRpbmcgb3JkZXIgb2YgJ29wZW4nXHJcbiAgICAgICAgLmZvckVhY2goKGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZvcm1hdHRpbmcgPSBuZXcgRm9ybWF0dGluZyhcclxuICAgICAgICAgICAgICAgIGJhc2ljVGlrelRva2Vucy5zbGljZShpbmRleC5vcGVuICsgMSwgaW5kZXguY2xvc2UpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGJhc2ljVGlrelRva2Vucy5zcGxpY2UoaW5kZXgub3BlbiwgaW5kZXguY2xvc2UgKyAxIC0gaW5kZXgub3BlbiwgZm9ybWF0dGluZyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHByYW5lSW5kZXhlcyA9IG1hcEJyYWNrZXRzKCdQYXJlbnRoZXNlc19vcGVuJyAsYmFzaWNUaWt6VG9rZW5zKVxyXG4gICAgICAgIHByYW5lSW5kZXhlc1xyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBiLm9wZW4gLSBhLm9wZW4pIFxyXG4gICAgICAgIC5mb3JFYWNoKChpbmRleCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBmb3JtYXR0aW5nID0gbmV3IENvb3JkaW5hdGUoXHJcbiAgICAgICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMuc2xpY2UoaW5kZXgub3BlbiArIDEsIGluZGV4LmNsb3NlKVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBiYXNpY1Rpa3pUb2tlbnMuc3BsaWNlKGluZGV4Lm9wZW4sIGluZGV4LmNsb3NlICsgMSAtIGluZGV4Lm9wZW4sIGZvcm1hdHRpbmcpO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH1cclxuICAgIHRva2VuaXplKCl7XHJcbiAgICAgICAgLypcclxuICAgICAgICBUaGV5J3JlIGdvaW5nIHRvIGJlIHRocmVlIHR5cGVzIHN0cmluZ2VkIHN5bnRheCBudW1iZXIuXHJcbiAgICAgICAgIEkgdXNlIHRoZW0gdG8gdG9rZW5pemUuIHVzaW5nIHRoZSB0aWNrcyBjb21tYW5kcy4gT25jZSB0b2tlbml6ZXIgdGFrZXMgY29tbWFuZHMuXHJcbiAgICAgICAgIEkgbW92ZSBvbiB0byBhY3R1YWwgZXZhbHVhdGlvbi5cclxuICAgICAgICAqL1xyXG5cclxuICAgICAgICBcclxuICAgICAgICBsZXQgc3ViZGVmaW5lZFRva2Vucz1bXTtcclxuICAgICAgICAvKlxyXG4gICAgICAgIGZvciAobGV0IGk9MDtpPGJhc2ljVGlrelRva2Vucy5sZW5ndGg7aSsrKXtcclxuXHJcbiAgICAgICAgfSovXHJcbiAgICAgICAgY29uc29sZS5sb2coYmFzaWNUaWt6VG9rZW5zKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGlkeVRpa3pTb3VyY2UodGlrelNvdXJjZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3QgcmVtb3ZlID0gXCImbmJzcDtcIjtcclxuICAgICAgICB0aWt6U291cmNlID0gdGlrelNvdXJjZS5yZXBsYWNlQWxsKHJlbW92ZSwgXCJcIik7bGV0IGxpbmVzID0gdGlrelNvdXJjZS5zcGxpdChcIlxcblwiKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IGxpbmUudHJpbSgpKTtcclxuICAgICAgICBsaW5lcyA9IGxpbmVzLmZpbHRlcihsaW5lID0+IGxpbmUpO1xyXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKS5yZXBsYWNlKC8oPzw9W15cXHddKSB8ICg/PVteXFx3XSkvZywgXCJcIikucmVwbGFjZSgvKD88IVxcXFwpJS4qJC9nbSwgXCJcIikucmVwbGFjZSgvXFxuL2csXCJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0Q29kZSgpe1xyXG4gICAgICAgIGlmICh0eXBlb2YgdGhpcy5zb3VyY2U9PT1cInN0cmluZ1wiJiZ0aGlzLnNvdXJjZS5tYXRjaCgvKHVzZXBhY2thZ2V8dXNldGlremxpYnJhcnkpLykpXHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnByb2Nlc3NlZENvZGVcclxuICAgICAgICByZXR1cm4gJycvL2dldFByZWFtYmxlKCkrdGhpcy5wcm9jZXNzZWRDb2RlK1wiXFxuXFxcXGVuZHt0aWt6cGljdHVyZX1cXFxcZW5ke2RvY3VtZW50fVwiO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhcHBseVBvc3RQcm9jZXNzaW5nKCl7XHJcbiAgICAgICAgY29uc3QgZmxhdEF4ZXM9ZmxhdHRlbih0aGlzLnRva2VucykuZmlsdGVyKChpdGVtOiBhbnkpPT4gaXRlbSBpbnN0YW5jZW9mIEF4aXMpO1xyXG4gICAgICAgIGZsYXRBeGVzLmZvckVhY2goKGF4aXM6IEF4aXMpID0+IHtcclxuICAgICAgICAgICAgYXhpcy5hZGRRdWFkcmFudCh0aGlzLnZpZXdBbmNob3JzLmF2ZU1pZFBvaW50KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY29uc3QgZmxhdERyYXc9ZmxhdHRlbih0aGlzLnRva2VucyxbXSxEcmF3KS5maWx0ZXIoKGl0ZW06IGFueSk9PiBpdGVtIGluc3RhbmNlb2YgRHJhdyk7XHJcbiAgICAgICAgZmxhdERyYXcuZm9yRWFjaCgoZHJhdzogRHJhdykgPT4ge1xyXG4gICAgICAgICAgICBmb3IgKGNvbnN0ICBbaW5kZXgsIGNvb3JdIG9mIGRyYXcuY29vcmRpbmF0ZXMuZW50cmllcygpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoY29vciBpbnN0YW5jZW9mIENvb3JkaW5hdGUpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb29yLmZvcm1hdHRpbmc/LmFkZFNwbG9wQW5kUG9zaXRpb24oZHJhdy5jb29yZGluYXRlcyxpbmRleClcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgfVxyXG5cclxuICAgIC8qXHJcbiAgICB0b2tlbml6ZSgpIHtcclxuICAgICAgICBcclxuXHJcbiAgICAgICAgY29uc3QgY2EgPSBTdHJpbmcucmF3YFxcd1xcZFxccy0sLjp8YDsgLy8gRGVmaW5lIGFsbG93ZWQgY2hhcmFjdGVycyBmb3IgYGNhYFxyXG4gICAgICAgIGNvbnN0IGMgPSBTdHJpbmcucmF3YFskKF17MCwyfVske2NhfV0rWykkXXswLDJ9fFxcJFxcKFske2NhfV0rXFwpWyR7Y2F9ITorXStcXChbJHtjYX1dK1xcKVxcJGA7XHJcbiAgICAgICAgLy8gRGVmaW5lIGBjb29yUmVnZXhgIHdpdGggZXNjYXBlZCBjaGFyYWN0ZXJzIGZvciBzcGVjaWZpYyBtYXRjaGluZ1xyXG4gICAgICAgIGNvbnN0IGNuID0gU3RyaW5nLnJhd2BbXFx3X1xcZFxcc11gOyAvLyBDb29yZGluYXRlIG5hbWVcclxuICAgICAgICBjb25zdCB0ID0gU3RyaW5nLnJhd2BcXFwiP1xcJFtcXHdcXGRcXHNcXC0sLjooISlcXC1cXHtcXH1cXCtcXFxcIF5dKlxcJFxcXCI/fFtcXHdcXGRcXHNcXC0sLjooISlfXFwtXFwrXFxcXF5dKmA7IC8vIFRleHQgd2l0aCBzcGVjaWZpYyBjaGFyYWN0ZXJzXHJcbiAgICAgICAgY29uc3QgZiA9IFN0cmluZy5yYXdgW1xcd1xcc1xcZD06LCEnOy4mKlxce1xcfSVcXC08Pl1gOyAvLyBGb3JtYXR0aW5nIHdpdGggc3BlY2lmaWMgY2hhcmFjdGVyc1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgYGNvb3JSZWdleGAgdXNpbmcgZXNjYXBlZCBicmFjZXMgYW5kIHBhdHRlcm5zXHJcbiAgICAgICAgY29uc3QgY29vclJlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yXFx7KCR7Y30pXFx9XFx7KCR7Y259KilcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHBpY1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxwaWNcXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHtjfSlcXH1cXHsoJHt0fSlcXH1cXHsoJHtmfSopXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IG5vZGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxceygke2N9KVxcfVxceygke2NufSopXFx9XFx7KCR7dH0pXFx9XFx7KCR7Zn0qKVxcfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBzZSA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcbm9kZVxccypcXCgqKCR7Y259KVxcKSpcXHMqYXRcXHMqXFwoKCR7Y30pXFwpXFxzKlxcWygke2Z9KilcXF1cXHMqXFx7KCR7dH0pXFx9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHNzID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxjb29yZGluYXRlXFxzKihcXFtsYWJlbD1cXHtcXFsoLio/KVxcXTpcXFxcXFx3KlxccyooW1xcd1xcc10qKVxcfVxcXSk/XFxzKlxcKCgke2NufSspXFwpXFxzKmF0XFxzKlxcKCgke2N9KVxcKTtgLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgZHJhd1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxkcmF3XFxbKCR7Zn0qKVxcXShbXjtdKik7YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IHh5YXhpc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFx4eWF4aXN7KCR7dH0pfXsoJHt0fSl9YCwgXCJnXCIpO1xyXG4gICAgICAgIGNvbnN0IGdyaWRSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcZ3JpZHsoW1xcZC0uXSspfWAsIFwiZ1wiKTtcclxuICAgICAgICBjb25zdCBjaXJjbGVSZWdleCA9IG5ldyBSZWdFeHAoU3RyaW5nLnJhd2BcXFxcY2lyY2xlXFx7KCR7Y30rKVxcfVxceygke2N9KylcXH1cXHsoJHtjfSspXFx9XFx7KFtcXHdcXHNcXGRdKilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgbWFzc1JlZ2V4ID0gbmV3IFJlZ0V4cChTdHJpbmcucmF3YFxcXFxtYXNzXFx7KCR7Y30pXFx9XFx7KCR7dH0pXFx9XFx7KC1cXHx8XFx8fD4pezAsMX1cXH1cXHsoW1xcZC5dKilcXH1gLFwiZ1wiKTtcclxuICAgICAgICAvL1xccGlje2FuYzJ9e2FuYzF9e2FuYzB9ezc1XlxcY2lyYyB9e307XHJcbiAgICAgICAgY29uc3QgdmVjUmVnZXggPSBuZXcgUmVnRXhwKFN0cmluZy5yYXdgXFxcXHZlY1xceygke2N9KVxcfVxceygke2N9KVxcfVxceygke3R9KVxcfVxceygke2Z9KilcXH1gLCBcImdcIik7XHJcbiAgICAgICAgY29uc3QgcmVnZXhQYXR0ZXJucyA9IFtjb29yUmVnZXgsIHNlLCBzcywgbm9kZVJlZ2V4LCBkcmF3UmVnZXgsIGNpcmNsZVJlZ2V4LCBtYXNzUmVnZXgsIHZlY1JlZ2V4LHBpY1JlZ2V4XTtcclxuICAgICAgICBsZXQgbWF0Y2hlczogYW55W109W107XHJcbiAgICAgICAgcmVnZXhQYXR0ZXJucy5mb3JFYWNoKGFiID0+IHtcclxuICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKC4uLlsuLi50aGlzLnNvdXJjZS5tYXRjaEFsbChhYildKVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1hdGNoZXMuc29ydCgoYSwgYikgPT4gKGEuaW5kZXggfHwgMCkgLSAoYi5pbmRleCB8fCAwKSk7XHJcblxyXG4gICAgICAgIFt4eWF4aXNSZWdleCxncmlkUmVnZXhdLmZvckVhY2goYWIgPT4ge1xyXG4gICAgICAgICAgICBtYXRjaGVzLnB1c2goLi4uWy4uLnRoaXMuc291cmNlLm1hdGNoQWxsKGFiKV0pXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGxldCBjdXJyZW50SW5kZXggPSAwO1xyXG4gICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQgJiYgbWF0Y2guaW5kZXggPiBjdXJyZW50SW5kZXgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgsIG1hdGNoLmluZGV4KSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JcIikpIHtcclxuICAgICAgICAgICAgbGV0IGk9e29yaWdpbmFsOiBtYXRjaFsxXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMl0sbGFiZWw6IG1hdGNoWzNdLGZvcm1hdHRpbmc6IG1hdGNoWzRdfVxyXG4gICAgICAgICAgICBpZihtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNvb3JkaW5hdGVcIikpe1xyXG4gICAgICAgICAgICAgICAgT2JqZWN0LmFzc2lnbihpLHtvcmlnaW5hbDogbWF0Y2hbNV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzRdLGxhYmVsOiBtYXRjaFszXSxmb3JtYXR0aW5nOiBtYXRjaFsyXX0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcImNvb3JkaW5hdGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcImNvb3JkaW5hdGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xyXG5cclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxwaWNcIikpIHtcclxuICAgICAgICAgICAgY29uc3QgYzE9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcylcclxuICAgICAgICAgICAgY29uc3QgYzI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMl0sdGhpcylcclxuICAgICAgICAgICAgY29uc3QgYzM9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbM10sdGhpcylcclxuXHJcblxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHttb2RlOiBcInBpYy1hbmdcIix0b2tlbnM6IHRoaXMsZm9ybWF0dGluZ1N0cmluZzogbWF0Y2hbNV0sZm9ybWF0dGluZ09iajoge3Rpa3pzZXQ6IFwiYW5nXCIsaWNUZXh0OiBtYXRjaFs0XX0sZHJhd0FycjogW2MxLGMyLGMzXX0pKTtcclxuICAgICAgICAgIH1lbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGRyYXdcIikpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaChuZXcgRHJhdyh1bmRlZmluZWQsbWF0Y2hbMV0sbWF0Y2hbMl0sIHRoaXMpKTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx4eWF4aXNcIikpIHtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxncmlkXCIpKSB7XHJcbiAgICAgICAgICAgIC8vdGhpcy50b2tlbnMucHVzaCh7dHlwZTogXCJncmlkXCIsIHJvdGF0ZTogbWF0Y2hbMV19KTtcclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFxub2RlXCIpKSB7XHJcbiAgICAgICAgICAgIGxldCBpPXtvcmlnaW5hbDogbWF0Y2hbMV0sY29vcmRpbmF0ZU5hbWU6IG1hdGNoWzNdLGxhYmVsOiBtYXRjaFs0XSxmb3JtYXR0aW5nOiBtYXRjaFszXX1cclxuICAgICAgICAgICAgaWYgKG1hdGNoWzBdLm1hdGNoKC9cXFxcbm9kZVxccypcXCgvKSl7XHJcbiAgICAgICAgICAgICAgICBPYmplY3QuYXNzaWduKGkse29yaWdpbmFsOiBtYXRjaFsyXSxjb29yZGluYXRlTmFtZTogbWF0Y2hbMV0sbGFiZWw6IG1hdGNoWzRdLGZvcm1hdHRpbmc6IG1hdGNoWzNdfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc3QgeyBmb3JtYXR0aW5nLG9yaWdpbmFsLCAuLi5yZXN0IH0gPSBpO1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixheGlzOiBuZXcgQXhpcygpLnVuaXZlcnNhbChvcmlnaW5hbCx0aGlzKSxmb3JtYXR0aW5nOiBuZXcgRm9ybWF0dGluZyhcIm5vZGVcIiwgdW5kZWZpbmVkLGZvcm1hdHRpbmcpLC4uLnJlc3QsfSkpO1xyXG4gICAgICAgICAgfSBlbHNlIGlmIChtYXRjaFswXS5zdGFydHNXaXRoKFwiXFxcXGNpcmNsZVwiKSkgey8qXHJcbiAgICAgICAgICAgIHRoaXMudG9rZW5zLnB1c2goe1xyXG4gICAgICAgICAgICAgIHR5cGU6IFwiY2lyY2xlXCIsXHJcbiAgICAgICAgICAgICAgZm9ybWF0dGluZzogbWF0Y2hbNF0sXHJcbiAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMV0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbMl0sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICAgIG5ldyBDb29yZGluYXRlKCkuc2ltcGxlWFkobWF0Y2hbM10sIHRoaXMudG9rZW5zKSxcclxuICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICB9KTsqXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKG1hdGNoWzBdLnN0YXJ0c1dpdGgoXCJcXFxcbWFzc1wiKSkge1xyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGVcIixsYWJlbDogbWF0Y2hbMl0sYXhpczogbmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyksZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoXCJub2RlXCIse3Rpa3pzZXQ6ICdtYXNzJyxhbmNob3I6IG1hdGNoWzNdLHJvdGF0ZTogbWF0Y2hbNF19KX0pKVxyXG5cclxuICAgICAgICAgIH0gZWxzZSBpZiAobWF0Y2hbMF0uc3RhcnRzV2l0aChcIlxcXFx2ZWNcIikpIHtcclxuICAgICAgICAgICAgY29uc3QgYW5jZXI9bmV3IEF4aXMoKS51bml2ZXJzYWwobWF0Y2hbMV0sdGhpcyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGF4aXMxPW5ldyBBeGlzKCkudW5pdmVyc2FsKG1hdGNoWzJdLHRoaXMpO1xyXG4gICAgICAgICAgICBjb25zdCBub2RlPW5ldyBDb29yZGluYXRlKHttb2RlOiBcIm5vZGUtaW5saW5lXCIsZm9ybWF0dGluZzogbmV3IEZvcm1hdHRpbmcoJ25vZGUtaW5saW5lJyx7Y29sb3I6IFwicmVkXCJ9KX0pXHJcblxyXG4gICAgICAgICAgICBjb25zdCBjMT1uZXcgQ29vcmRpbmF0ZShcIm5vZGUtaW5saW5lXCIpO1xyXG4gICAgICAgICAgICBjb25zdCBxPVthbmNlciwnLS0rJyxub2RlLGF4aXMxXVxyXG4gICAgICAgICAgICB0aGlzLnRva2Vucy5wdXNoKG5ldyBEcmF3KHtmb3JtYXR0aW5nT2JqOiB7dGlrenNldDogJ3ZlYyd9LHRva2VuczogdGhpcyxkcmF3QXJyOiBxfSkpXHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKG1hdGNoLmluZGV4ICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgY3VycmVudEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChjdXJyZW50SW5kZXggPCB0aGlzLnNvdXJjZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgdGhpcy50b2tlbnMucHVzaCh0aGlzLnNvdXJjZS5zbGljZShjdXJyZW50SW5kZXgpKTtcclxuICAgICAgICB9XHJcbiAgICB9Ki9cclxuICAgIGdldE1pbigpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1pbn1cclxuICAgIGdldE1heCgpe3JldHVybiB0aGlzLnZpZXdBbmNob3JzLm1heH1cclxuXHJcbiAgICBmaW5kVmlld0FuY2hvcnMoKSB7XHJcbiAgICAgICAgY29uc3QgYXhlcyA9IGZsYXR0ZW4odGhpcy50b2tlbnMpLmZpbHRlcigoaXRlbTogYW55KSA9PiBpdGVtIGluc3RhbmNlb2YgQXhpcyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgbGV0IHN1bU9mWCA9IDAsIHN1bU9mWSA9IDA7XHJcbiAgICAgICAgbGV0IG1heFggPSAtSW5maW5pdHksIG1heFkgPSAtSW5maW5pdHk7XHJcbiAgICAgICAgbGV0IG1pblggPSBJbmZpbml0eSwgbWluWSA9IEluZmluaXR5O1xyXG4gICAgXHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycyA9IHtcclxuICAgICAgICAgICAgbWF4OiBuZXcgQXhpcygwLCAwKSxcclxuICAgICAgICAgICAgbWluOiBuZXcgQXhpcygwLCAwKSxcclxuICAgICAgICAgICAgYXZlTWlkUG9pbnQ6IG5ldyBBeGlzKDAsIDApXHJcbiAgICAgICAgfTtcclxuICAgIFxyXG4gICAgICAgIGF4ZXMuZm9yRWFjaCgoYXhpczogQXhpcykgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB7IGNhcnRlc2lhblgsIGNhcnRlc2lhblkgfSA9IGF4aXM7XHJcbiAgICBcclxuICAgICAgICAgICAgLy8gVXBkYXRlIHN1bXMgZm9yIGF2ZXJhZ2UgY2FsY3VsYXRpb25cclxuICAgICAgICAgICAgc3VtT2ZYICs9IGNhcnRlc2lhblg7XHJcbiAgICAgICAgICAgIHN1bU9mWSArPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgXHJcbiAgICAgICAgICAgIC8vIFVwZGF0ZSBtYXggYW5kIG1pbiBjb29yZGluYXRlc1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA+IG1heFgpIG1heFggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA+IG1heFkpIG1heFkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWCA8IG1pblgpIG1pblggPSBjYXJ0ZXNpYW5YO1xyXG4gICAgICAgICAgICBpZiAoY2FydGVzaWFuWSA8IG1pblkpIG1pblkgPSBjYXJ0ZXNpYW5ZO1xyXG4gICAgICAgIH0pO1xyXG4gICAgXHJcbiAgICAgICAgY29uc3QgbGVuZ3RoID0gYXhlcy5sZW5ndGggIT09IDAgPyBheGVzLmxlbmd0aCA6IDE7XHJcbiAgICBcclxuICAgICAgICAvLyBTZXQgdGhlIHZpZXdBbmNob3JzXHJcbiAgICAgICAgdGhpcy52aWV3QW5jaG9ycy5hdmVNaWRQb2ludCA9IG5ldyBBeGlzKHN1bU9mWCAvIGxlbmd0aCwgc3VtT2ZZIC8gbGVuZ3RoKTtcclxuICAgICAgICB0aGlzLnZpZXdBbmNob3JzLm1heCA9IG5ldyBBeGlzKG1heFgsIG1heFkpO1xyXG4gICAgICAgIHRoaXMudmlld0FuY2hvcnMubWluID0gbmV3IEF4aXMobWluWCwgbWluWSk7XHJcbiAgICB9XHJcbiAgICBcclxuXHJcbiAgICBmaW5kT3JpZ2luYWxWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XHJcbiAgICAgICAgY29uc3Qgb2cgPSB0aGlzLnRva2Vucy5zbGljZSgpLnJldmVyc2UoKS5maW5kKFxyXG4gICAgICAgICAgICAodG9rZW46IFRva2VuKSA9PlxyXG4gICAgICAgICAgICAgICAgKHRva2VuIGluc3RhbmNlb2YgQ29vcmRpbmF0ZSkgJiYgdG9rZW4uY29vcmRpbmF0ZU5hbWUgPT09IHZhbHVlXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gb2cgaW5zdGFuY2VvZiBDb29yZGluYXRlID8gb2cuY2xvbmUoKSA6IHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIFxyXG5cclxuICAgIHRvU3RyaW5nKCl7XHJcbiAgICAgICAgbGV0IGNvZGVCbG9ja091dHB1dCA9IFwiXCI7XHJcbiAgICAgICAgY29uc3QgZXh0cmVtZVhZPWdldEV4dHJlbWVYWSh0aGlzLnRva2Vucyk7XHJcbiAgICAgICAgdGhpcy50b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG5cclxuICAgICAgICAgICAgaWYodG9rZW4udG9TdHJpbmcoKSl7XHJcbiAgICAgICAgICAgICAgICBjb2RlQmxvY2tPdXRwdXQgKz10b2tlbi50b1N0cmluZygpXHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGNvZGVCbG9ja091dHB1dCArPSB0b2tlbjtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gY29kZUJsb2NrT3V0cHV0O1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gZmxhdHRlbihkYXRhOiBhbnksIHJlc3VsdHM6IGFueVtdID0gW10sIHN0b3BDbGFzcz86IGFueSk6IGFueVtdIHtcclxuICAgIGlmIChBcnJheS5pc0FycmF5KGRhdGEpKSB7XHJcbiAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XHJcbiAgICAgICAgZmxhdHRlbihpdGVtLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xyXG4gICAgICB9XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJiBkYXRhICE9PSBudWxsKSB7XHJcbiAgICAgIC8vIElmIHRoZSBvYmplY3QgaXMgYW4gaW5zdGFuY2Ugb2YgdGhlIHN0b3BDbGFzcywgYWRkIGl0IHRvIHJlc3VsdHMgYW5kIHN0b3AgZmxhdHRlbmluZ1xyXG4gICAgICBpZiAoc3RvcENsYXNzICYmIGRhdGEgaW5zdGFuY2VvZiBzdG9wQ2xhc3MpIHtcclxuICAgICAgICByZXN1bHRzLnB1c2goZGF0YSk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICAgIH1cclxuICBcclxuICAgICAgLy8gQWRkIHRoZSBjdXJyZW50IG9iamVjdCB0byByZXN1bHRzXHJcbiAgICAgIHJlc3VsdHMucHVzaChkYXRhKTtcclxuICBcclxuICAgICAgLy8gUmVjdXJzaXZlbHkgZmxhdHRlbiBwcm9wZXJ0aWVzIG9mIHRoZSBvYmplY3RcclxuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xyXG4gICAgICAgIGlmIChkYXRhLmhhc093blByb3BlcnR5KGtleSkpIHtcclxuICAgICAgICAgIGZsYXR0ZW4oZGF0YVtrZXldLCByZXN1bHRzLCBzdG9wQ2xhc3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldEV4dHJlbWVYWSh0b2tlbnM6IGFueSkge1xyXG4gICAgbGV0IG1heFggPSAtSW5maW5pdHk7XHJcbiAgICBsZXQgbWF4WSA9IC1JbmZpbml0eTtcclxuICAgIGxldCBtaW5YID0gSW5maW5pdHk7XHJcbiAgICBsZXQgbWluWSA9IEluZmluaXR5O1xyXG4gICAgXHJcbiAgICB0b2tlbnMuZm9yRWFjaCgodG9rZW46IGFueSkgPT4ge1xyXG4gICAgICAgIGlmICh0b2tlbi50eXBlID09PSBcImNvb3JkaW5hdGVcIikge1xyXG4gICAgICAgIGlmICh0b2tlbi5YID4gbWF4WCkgbWF4WCA9IHRva2VuLlg7XHJcbiAgICAgICAgaWYgKHRva2VuLlggPCBtaW5YKSBtaW5YID0gdG9rZW4uWDtcclxuICAgIFxyXG4gICAgICAgIGlmICh0b2tlbi5ZID4gbWF4WSkgbWF4WSA9IHRva2VuLlk7XHJcbiAgICAgICAgaWYgKHRva2VuLlkgPCBtaW5ZKSBtaW5ZID0gdG9rZW4uWTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBtYXhYLG1heFksbWluWCxtaW5ZLFxyXG4gICAgfTtcclxufVxyXG5cclxuY29uc3QgcGFyc2VOdW1iZXIgPSAodmFsdWU6IHN0cmluZykgPT4ge1xyXG4gICAgY29uc3QgbnVtYmVyVmFsdWUgPSBwYXJzZUZsb2F0KHZhbHVlKTtcclxuICAgIHJldHVybiBpc05hTihudW1iZXJWYWx1ZSkgPyAwIDogbnVtYmVyVmFsdWU7XHJcbn07XHJcblxyXG5cclxuXHJcblxyXG5cclxuZnVuY3Rpb24gZ2V0UHJlYW1ibGUoKTpzdHJpbmd7XHJcbiAgICBjb25zdCBhbmc9XCJcXFxcdGlrenNldHthbmcvLnN0eWxlIDIgYXJncz17ZmlsbD1ibGFjayE1MCxvcGFjaXR5PTAuNSx0ZXh0IG9wYWNpdHk9MC45LGRyYXc9b3JhbmdlLDwtPixhbmdsZSBlY2NlbnRyaWNpdHk9IzEsYW5nbGUgcmFkaXVzPSMyY20sdGV4dD1vcmFuZ2UsZm9udD1cXFxcbGFyZ2V9LGFuZy8uZGVmYXVsdD17MS42fXswLjV9fVwiXHJcbiAgXHJcbiAgICBjb25zdCBtYXJrPVwiXFxcXGRlZlxcXFxtYXJrIzEjMiMze1xcXFxwYXRoIFtkZWNvcmF0aW9uPXttYXJraW5ncywgbWFyaz1hdCBwb3NpdGlvbiAwLjUgd2l0aCB7XFxcXGZvcmVhY2ggXFxcXHggaW4geyMxfSB7IFxcXFxkcmF3W2xpbmUgd2lkdGg9MXB0XSAoXFxcXHgsLTNwdCkgLS0gKFxcXFx4LDNwdCk7IH19fSwgcG9zdGFjdGlvbj1kZWNvcmF0ZV0gKCMyKSAtLSAoIzMpO31cIlxyXG4gIFxyXG4gICAgY29uc3QgYXJyPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFycn1bOF17XFxcXGNvb3JkaW5hdGUgKDIpIGF0ICgkKCMyKSEjNyEoIzMpJCk7XFxcXGNvb3JkaW5hdGUgKDEpIGF0ICgkKDIpISM1bW0hOTA6KCMzKSQpO1xcXFxjb29yZGluYXRlICgzKSBhdCAoJCgyKSEjNW1tKyM0Y20hIzg6KCMzKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTFwdCw8LV0gKDEpLS0oMylub2RlIFtwb3M9IzZdIHtcXFxcbGFyZ2UgIzF9O31cIiBcclxuICAgIGNvbnN0IGxlbmU9XCJcXFxcZGVmXFxcXGNvciMxIzIjMyM0IzV7XFxcXGNvb3JkaW5hdGUgKCMxKSBhdCgkKCMyKSEjMyEjNDooIzUpJCk7fVxcXFxkZWZcXFxcZHIjMSMye1xcXFxkcmF3IFtsaW5lIHdpZHRoPSMxLF0jMjt9XFxcXG5ld2NvbW1hbmR7XFxcXGxlbn1bNl17XFxcXGNvcnsxfXsjMn17IzN9ezkwfXsjNH1cXFxcY29yezN9eyM0fXsjM317LTkwfXsjMn1cXFxcbm9kZSAoMikgYXQgKCQoMSkhMC41ISgzKSQpIFtyb3RhdGU9IzZde1xcXFxsYXJnZSAjMX07XFxcXGRyeyM1cHQsfDwtfXsoMSktLSgyKX1cXFxcZHJ7IzVwdCwtPnx9eygyKS0tKDMpfX1cIlxyXG4gICAgY29uc3Qgc3ByaW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXHNwcmluZ31bNF17XFxcXHRpa3ptYXRoe2Nvb3JkaW5hdGUgXFxcXHN0YXJ0LCBcXFxcZG9uZTtcXFxcc3RhcnQgPSAoIzEpO1xcXFxkb25lID0gKCMyKTt9XFxcXGRyYXdbdGhpY2tdICgkKFxcXFxzdGFydCkgKyAoLTEuNSwwKSQpIC0tKysoMywwKTtcXFxcZHJhdyAoXFxcXHN0YXJ0KSAtLSsgKDAsLTAuMjVjbSk7XFxcXGRyYXcgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgrMGNtLFxcXFxkb25leSswLjI1Y20pJCktLSsoMCwtMC4yNSk7XFxcXGRyYXdbZGVjb3JhdGlvbj17YXNwZWN0PTAuMywgc2VnbWVudCBsZW5ndGg9MywgYW1wbGl0dWRlPTJtbSxjb2lsLH0sZGVjb3JhdGVdIChcXFxcc3RhcnR4LFxcXFxzdGFydHktMC4yNWNtKSAtLSgkKFxcXFxzdGFydCkgKyAoXFxcXGRvbmV4LFxcXFxkb25leSswLjI1Y20pJClub2RlW21pZHdheSxyaWdodD0wLjI1Y20sYmxhY2tdeyM0fTtcXFxcbm9kZVtmaWxsPXllbGxvdyE2MCxkcmF3LHRleHQ9YmxhY2ssYW5jaG9yPSBub3J0aF0gYXQgKCQoXFxcXHN0YXJ0KSArIChcXFxcZG9uZXgsXFxcXGRvbmV5KSQpeyMzfTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgdHJlZT1cIlxcXFxuZXdjb21tYW5ke1xcXFxsZW51fVszXXtcXFxcdGlrenNldHtsZXZlbCBkaXN0YW5jZT0yMG1tLGxldmVsICMxLy5zdHlsZT17c2libGluZyBkaXN0YW5jZT0jMm1tLCBub2Rlcz17ZmlsbD1yZWQhIzMsY2lyY2xlLGlubmVyIHNlcD0xcHQsZHJhdz1ub25lLHRleHQ9YmxhY2ssfX19fVwiXHJcbiAgICBcclxuICAgIGNvbnN0IHRhYmxlPVwiXFxcXHRpa3pzZXR7IHRhYmxlLy5zdHlsZT17bWF0cml4IG9mIG5vZGVzLHJvdyBzZXA9LVxcXFxwZ2ZsaW5ld2lkdGgsY29sdW1uIHNlcD0tXFxcXHBnZmxpbmV3aWR0aCxub2Rlcz17cmVjdGFuZ2xlLGRyYXc9YmxhY2ssYWxpZ249Y2VudGVyfSxtaW5pbXVtIGhlaWdodD0xLjVlbSx0ZXh0IGRlcHRoPTAuNWV4LHRleHQgaGVpZ2h0PTJleCxub2RlcyBpbiBlbXB0eSBjZWxscyxldmVyeSBldmVuIHJvdy8uc3R5bGU9e25vZGVzPXtmaWxsPWdyYXkhNjAsdGV4dD1ibGFjayx9fSxjb2x1bW4gMS8uc3R5bGU9e25vZGVzPXt0ZXh0IHdpZHRoPTVlbSxmb250PVxcXFxiZnNlcmllc319LHJvdyAxLy5zdHlsZT17bm9kZXM9e2ZvbnQ9XFxcXGJmc2VyaWVzfX19fVwiXHJcbiAgICBjb25zdCBjb29yPVwiXFxcXGRlZlxcXFxjb29yIzEjMiMzIzR7XFxcXGNvb3JkaW5hdGUgW2xhYmVsPXtbIzRdOlxcXFxMYXJnZSAjM31dICgjMikgYXQgKCQoIzEpJCk7fVwiXHJcbiAgICAvL2NvbnN0IG1hc3M9YFxcXFxkZWZcXFxcbWFzcyMxIzJ7XFxcXG5vZGVbZmlsbD15ZWxsb3chNjAsZHJhdyx0ZXh0PWJsYWNrLGFuY2hvcj0gbm9ydGhdIGF0ICgjMSl7IzJ9O31gXHJcbiAgICBjb25zdCBkdmVjdG9yPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGR2ZWN0b3J9WzJde1xcXFxjb29yZGluYXRlICh0ZW1wMSkgYXQgKCQoMCwwIC18ICMxKSQpO1xcXFxjb29yZGluYXRlICh0ZW1wMikgYXQgKCQoMCwwIHwtICMxKSQpO1xcXFxkcmF3IFtsaW5lIHdpZHRoPTAuN3B0LCMyXSAoIzEpLS0odGVtcDEpKCMxKS0tKHRlbXAyKTt9XCJcclxuICAgIFxyXG4gICAgY29uc3QgcGljQW5nPVwiXFxcXG5ld2NvbW1hbmR7XFxcXGFuZ31bNV17XFxcXGNvb3JkaW5hdGUgKGFuZzEpIGF0ICgjMSk7IFxcXFxjb29yZGluYXRlIChhbmcyKSBhdCAoIzIpOyBcXFxcY29vcmRpbmF0ZSAoYW5nMykgYXQgKCMzKTsgXFxcXHBnZm1hdGhhbmdsZWJldHdlZW5wb2ludHN7XFxcXHBnZnBvaW50YW5jaG9ye2FuZzN9e2NlbnRlcn19e1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fVxcXFxsZXRcXFxcYW5nQ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoYW5nbGViZXR3ZWVucG9pbnRze1xcXFxwZ2Zwb2ludGFuY2hvcnthbmcyfXtjZW50ZXJ9fXtcXFxccGdmcG9pbnRhbmNob3J7YW5nMX17Y2VudGVyfX1cXFxcbGV0XFxcXGFuZ0FCXFxcXHBnZm1hdGhyZXN1bHRcXFxccGdmbWF0aHBhcnNle1xcXFxhbmdDQiAtIFxcXFxhbmdBQn1cXFxcaWZkaW1cXFxccGdmbWF0aHJlc3VsdCBwdDwwcHRcXFxccGdmbWF0aHBhcnNle1xcXFxwZ2ZtYXRocmVzdWx0ICsgMzYwfVxcXFxmaVxcXFxpZmRpbVxcXFxwZ2ZtYXRocmVzdWx0IHB0PjE4MHB0XFxcXHBnZm1hdGhwYXJzZXszNjAgLSBcXFxccGdmbWF0aHJlc3VsdH1cXFxcZmlcXFxcbGV0XFxcXGFuZ0JcXFxccGdmbWF0aHJlc3VsdFxcXFxwZ2ZtYXRoc2V0bWFjcm97XFxcXGFuZ2xlQ2hlY2t9e2FicyhcXFxcYW5nQiAtIDkwKX1cXFxcaWZ0aGVuZWxzZXtcXFxcbGVuZ3RodGVzdHtcXFxcYW5nbGVDaGVjayBwdCA8IDAuMXB0fX17XFxcXHBpYyBbYW5nIzUsXFxcInskeyM0fVxcJH1cXFwiLF17cmlnaHQgYW5nbGU9YW5nMS0tYW5nMi0tYW5nM307fXtcXFxccGljIFthbmcjNSxcXFwieyR7IzR9XFwkfVxcXCIsXXthbmdsZT1hbmcxLS1hbmcyLS1hbmczfTt9fVwiXHJcbiAgICBjb25zdCBwcmVhbWJsZT1cIlxcXFx1c2VwYWNrYWdle3BnZnBsb3RzLGlmdGhlbn1cXFxcdXNldGlremxpYnJhcnl7YXJyb3dzLm1ldGEsYW5nbGVzLHF1b3Rlcyxwb3NpdGlvbmluZywgY2FsYywgaW50ZXJzZWN0aW9ucyxkZWNvcmF0aW9ucy5tYXJraW5ncyxtYXRoLHNweSxtYXRyaXgscGF0dGVybnMsc25ha2VzLGRlY29yYXRpb25zLnBhdGhyZXBsYWNpbmcsZGVjb3JhdGlvbnMucGF0aG1vcnBoaW5nLHBhdHRlcm5zLHNoYWRvd3Msc2hhcGVzLnN5bWJvbHN9XCJcclxuICAgIHJldHVybiBwcmVhbWJsZSthbmcrbWFyaythcnIrbGVuZStzcHJpbmcrdHJlZSt0YWJsZStjb29yK2R2ZWN0b3IrcGljQW5nK1wiXFxcXHBnZnBsb3Rzc2V0e2NvbXBhdD0xLjE2fVxcXFxiZWdpbntkb2N1bWVudH1cXFxcYmVnaW57dGlrenBpY3R1cmV9XCJcclxufSJdfQ==