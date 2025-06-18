const constantControlSequences = [];

export class ControlSequenceLookupTable {
  private table: Map<string, string>;
  private symbolTable: Map<string, string>;

  constructor() {
    this.table = new Map(); // For control words: \foo
    this.symbolTable = new Map(); // For control symbols: \%
  }

  /**
   * Register a control word (e.g. \textbf).
   */
  defineControlWord(name: string, definition: string): void {
    if (!/^[a-zA-Z]+$/.test(name)) {
      throw new Error(`Invalid control word: ${name}`);
    }
    this.table.set(name, definition);
  }

  /**
   * Register a control symbol (e.g. \&, \$).
   */
  defineControlSymbol(symbol: string, definition: string): void {
    if (symbol.length !== 1) {
      throw new Error(`Control symbols must be single characters: ${symbol}`);
    }
    this.symbolTable.set(symbol, definition);
  }

  /**
   * Lookup a control sequence (word or symbol).
   */
  lookup(name: string): string | undefined {
    if (this.table.has(name)) return this.table.get(name);
    if (name.length === 1 && this.symbolTable.has(name))
      return this.symbolTable.get(name);
    return undefined;
  }

  /**
   * Check if a control sequence exists.
   */
  has(name: string): boolean {
    return this.table.has(name) || this.symbolTable.has(name);
  }

  /**
   * Dump all control sequences (for debugging).
   */
  dump(): void {
    console.log("Control Words:");
    for (const [name, def] of this.table.entries()) {
      console.log(`\\${name} => ${def}`);
    }

    console.log("Control Symbols:");
    for (const [sym, def] of this.symbolTable.entries()) {
      console.log(`\\${sym} => ${def}`);
    }
  }
}
