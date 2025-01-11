import { isOperatorWithAssociativity, searchAllMathJaxOperatorsAndSymbols, searchMathJaxOperators, searchTikzComponents } from "./staticData/dataManager";

class BasicToken {
    protected type: string;
    protected value: string | number;

    constructor(type?: string, value?: string | number) {
        if (type) this.type = type;
        if (value) this.value = value;
    }
    getType(){return this.type}
    getValue(){return this.value}
    getNumberValue(){return this.value as number}
    getStringValue(){return this.value as string}
    setValue(value: number|string){this.value=value}
    isValueString(): this is { value: string } { return typeof this.value === 'string'; }
}

export class BasicMathJaxToken extends BasicToken {
    constructor(type: string, value: string | number) {
        super(type, value);
    }


    getStringValue(): string {
        return this.value as string;
    }

    getLatexSymbol(): string | undefined {
        return typeof this.value === "string"
            ? searchMathJaxOperators(this.value)?.latex
            : undefined;
    }

    getFullType(): string | undefined {
        return this.type;
    }
    static create(value: string|number){
        if (typeof value === "string") {
            const operator = searchAllMathJaxOperatorsAndSymbols(value)
            if (operator) {
                return new BasicMathJaxToken(/[\(\)]/.test(value)?'bracket':'operator',operator.name)
            }
            return new BasicMathJaxToken('variable',value)
        }
        return new BasicMathJaxToken('number',value)
    }
    clone(): BasicMathJaxToken {return new BasicMathJaxToken(this.type || "", this.value as string | number)}

    

    isValueToken(): boolean {
        return this.type === "variable" || this.type === "number";
    }

    toStringLatex(): string {
        let latexString = "";
        if (this.isValueString()) {
            latexString += this.getLatexSymbol() || "";
        }
        if (this.type === "number") {
            latexString += this.value;
        }
        return latexString;
    }

    affectedOperatorRange(direction: string): boolean {
        if (this.type !== "operator" || this.value === "Equals") {
            return false;
        }
        if (
            typeof this.value === "string" &&
            direction === "left" &&
            !isOperatorWithAssociativity(this.value, [-1, 1], true)
        ) {
            return false;
        }
        return true;
    }
}

export class BasicTikzToken extends BasicToken {
    constructor(type?: string, value?: string | number) {
        super(type, value);
    }

    getStringValue(): string {
        return this.value as string;
    }

    setValue(value: string | number): void {
        this.value = value;
    }

    getNumberValue(): number {
        return this.value as number;
    }

    static create(value: string | number): BasicTikzToken {
        const token = new BasicTikzToken();
        if (typeof value === "number") {
            token.type = "number";
            token.value = value;
        } else if (typeof value === "string") {
            const tikzCommand = searchTikzComponents(value);
            if (tikzCommand) {
                token.type = tikzCommand.type.replace(/Bracket/, "Syntax");
                token.value = tikzCommand.name;
            }
        }
        return token;
    }

    clone(): BasicTikzToken {return new BasicTikzToken(this.type, this.value);}

    toString(): string {
        if (typeof this.value === "number") {
            return this.getNumberValue().toString();
        }
        const component = searchTikzComponents(this.value as string);
        if (component && component.latex) {
            return component.latex;
        }
        return this.value as string;
    }
}
