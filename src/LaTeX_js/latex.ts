import { DEFAULT_CAT_CODES } from "./catCodes";
import { ControlSequenceLookupTable } from "./controlSequenceLookupTable ";

export class Latex {}
type CatCode = {
  char: string;
  code: number;
};
enum ActiveState {
  Control,
  ControlSequence,
  ControlSymbol,
  BracketOpen,
  BracketClose,
  Text,
}
class controlSequence {
  expandable: boolean;
  name: string;
}
abstract class BasicParser {
  protected index: number = 0;
  protected chars: string[] = [];
  abstract parse(latex: string): any;
}

class DefParser extends BasicParser {
  parse(latex: string): string {
    return latex;
  }
}

export class LatexParser extends BasicParser {
  private active: ActiveState | null = null;
  private catCodes: CatCode[] = DEFAULT_CAT_CODES;
  private initialText: string;
  tempTokens: { type: string; value: string }[] = [];
  private bracketBalance: number = 0;
  private lookupTable = new ControlSequenceLookupTable();
  getCatCode(char: string): number {
    const catCode = this.catCodes.find((cat) => cat.char === char);
    if (catCode) {
      return catCode.code;
    }
    return 12;
  }
  parse(latex: string): void {
    this.initialText = latex;
    this.chars = latex.split("");
    const codeActoinMap: Record<number, () => void> = {
      0: this.parseControlSequence.bind(this),
      1: this.parseBracketOpen.bind(this),
      2: this.parseBracketClose.bind(this),
      12: this.parseText.bind(this),
    };
    while (this.index < this.chars.length) {
      const char = this.chars[this.index];
      const catCode = this.getCatCode(char);
      if (this.active !== null) {
        const stop = this.parseByActiveState(char, catCode);
        if (stop) {
          continue;
        }
      }
      const action = codeActoinMap[catCode];
      if (action) {
        action();
        continue;
      }
      this.index++;
    }
  }
  private isInControlSequence(code: number): boolean {
    return [11].includes(code);
  }
  private isInControlSymbol(code: number): boolean {
    return [0, 1, 2, 3, 4, 6, 7, 8, 12, 14].includes(code);
  }
  private parseByActiveState(char: string, code: number): boolean {
    if (this.active === ActiveState.Control) {
      if (this.isInControlSymbol(code)) {
        this.active = ActiveState.ControlSymbol;
        this.tempTokens[this.tempTokens.length - 1].type = "ControlSymbol";
      } else if (this.isInControlSequence(code)) {
        this.tempTokens[this.tempTokens.length - 1].type = "ControlSequence";
        this.active = ActiveState.ControlSequence;
      }
    }
    if (
      this.active === ActiveState.ControlSequence &&
      this.isInControlSequence(code)
    ) {
      this.tempTokens[this.tempTokens.length - 1].value += char;
      this.index++;
      return true;
    }
    if (
      this.active === ActiveState.ControlSymbol &&
      this.isInControlSymbol(code)
    ) {
      this.tempTokens[this.tempTokens.length - 1].value += char;
      //control symbol has a length of 1
      this.active = null;
      this.index++;
      return true;
    }
    if (this.active === ActiveState.Text && code == 11) {
      this.tempTokens[this.tempTokens.length - 1].value += char;
      this.index++;
      return true;
    }

    this.active = null;
    return false;
  }
  private parseControlSequence(): void {
    this.index++;
    this.tempTokens.push({ type: "control", value: "" });
    this.active = ActiveState.Control;
  }
  private parseBracketOpen(): void {
    this.index++;
    this.bracketBalance++;
  }
  private parseBracketClose(): void {
    this.index++;
    this.bracketBalance--;
  }
  private parseText(): void {
    this.tempTokens.push({ type: "text", value: this.chars[this.index] });
    this.active = ActiveState.Text;
    this.index++;
  }
}

export class Parser {}

const macroRegexString = String.raw`\\[a-zA-Z]+`;
const bracketRegex = String.raw`[\{\}()[\]]`;

function latexStringToTokenArray(latex: string): string[] {
  const tokens: string[] = [];

  for (let i = 0; i < latex.length; i++) {
    const remaining = latex.slice(i);
    let match = remaining.match(new RegExp("^" + macroRegexString));
    if (!!match) {
      tokens.push(match[0]);
      i += match[0].length - 1;
      continue;
    }

    match = remaining.match(new RegExp("^" + bracketRegex));
    if (!!match) {
      tokens.push(match[0]);
      i += match[0].length - 1;
      continue;
    }

    let index = Math.min(
      ...[
        remaining.search(macroRegexString),
        remaining.search(bracketRegex),
      ].filter((x) => x >= 0),
    );

    // Fallback if no match ahead
    if (!isFinite(index)) index = remaining.length;

    tokens.push(remaining.slice(0, index));
    i += index - 1;
  }

  return tokens;
}
enum TokenType {
  Macro,
  Bracket,
  Text,
}
enum TokenState {
  Open,
  Close,
}
const openBracket = ["{", "(", "["];
function isTokenOpenBracket(token: string): boolean | null {
  if (token.length !== 1 || !token.match(new RegExp(bracketRegex))) return null;
  return openBracket.includes(token);
}

function tokenArrayToObjArray(latex: string[]) {
  const tokens: { type: TokenType; value: string; state?: TokenState }[] = [];

  for (let i = 0; i < latex.length; i++) {
    const token = latex[i];
    if (token.match(new RegExp("^" + macroRegexString))) {
      tokens.push({ type: TokenType.Macro, value: token });
      continue;
    }
    const isOpenBracket = isTokenOpenBracket(token);
    if (isOpenBracket === null) {
      tokens.push({ type: TokenType.Text, value: token });
    } else {
      tokens.push({
        type: TokenType.Bracket,
        state: isOpenBracket ? TokenState.Open : TokenState.Close,
        value: token,
      });
    }
  }
  return tokens;
}

export function temp() {
  const latexParser = new LatexParser();
  latexParser.parse(latex);
  console.log("tokens", latexParser.tempTokens);

  //const stringTokens = latexStringToTokenArray(latex);
  //console.log("stringTokens", latex, stringTokens);
  //console.log("objTokens", tokenArrayToObjArray(stringTokens));
}

const latex = String.raw`
\documentclass{...}
`;
