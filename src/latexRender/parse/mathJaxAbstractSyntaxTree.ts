import {migrate,parseMath} from "./parse"
import { Whitespace,Parbreak, Macro, Argument, Ast,Node } from './typs/ast-types';

export class MathJaxAbstractSyntaxTree{
    ast: Node[];
    prase(latex: string){
        const ast = migrate(parseMath(latex));
        if(ast instanceof Array){
            this.ast=ast;
        }
        else{
            throw new Error("Root not found it is not in Array, got: "+ast);
        }
    }
    reverseRtl() {
        const args = findTextMacros(this.ast);
        for (const arg of args) {
            const text = arg.toString({ removeOpenCloseMarks: true });
            let tokens = text.match(/([א-ת]+|\s+|[^א-ת\s]+)/g)as string[]|null;
            if (!tokens) continue;
            tokens = mergeHebrewTokens(tokens);
            arg.content = parseMath(
            tokens
                .map((t) => /[א-ת]/.test(t) ? [...t].reverse().join('') : t)
                .join('')
            );
        }
    }
    
    toString(){
        return this.ast.map(node => node.toString()).join("");
    }
}
function mergeHebrewTokens(tokens: string[]): string[] {
    const isHeb = (s: string) => /^[\u05D0-\u05EA]+$/.test(s);
    const res: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (isHeb(tokens[i])) {
        let merged = tokens[i++];
        while (i + 1 < tokens.length && /^\s+$/.test(tokens[i]) && isHeb(tokens[i + 1])) {
          merged += tokens[i] + tokens[i + 1];
          i += 2;
        }
        res.push(merged);
      } else {
        res.push(tokens[i++]);
      }
    }
    return res;
}

function findTextMacros(ast: Ast): Argument[] {
    const macros: Argument[] = [];
  
    if (Array.isArray(ast)) {
      for (const node of ast) {
        macros.push(...findTextMacros(node));
      }
    } else if (ast instanceof Macro && ast.content === "text"&&ast.args) {
      macros.push(...ast.args);
    } else if (!(ast instanceof Whitespace || ast instanceof Parbreak) && Array.isArray(ast.content)) {
      for (const node of ast.content) {
        macros.push(...findTextMacros(node));
      }
    }
  
    return macros;
}