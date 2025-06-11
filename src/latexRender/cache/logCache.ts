import Moshe from "src/main";
import { ProcessedLog } from "../logs/latex-log-parser";
import parseLatexLog from "../logs/HumanReadableLogs";

export default class LogCache {
    private plugin: Moshe;
    private cache?: Map<string, ProcessedLog>;
    constructor(plugin: Moshe) {
        this.plugin = plugin;
    }
    
    addLog(log: ProcessedLog|string,hash: string): void {
        if (!this.plugin.settings.saveLogs) return this.cache=undefined;
        if (!this.cache) this.cache = new Map();
        if (typeof log === "string") log = parseLatexLog(log);
        this.cache.set(hash, log);
    }
    getLog(hash: string): ProcessedLog | undefined {
        if (!this.plugin.settings.saveLogs||!this.cache) return undefined;
        return this.cache.get(hash);
    }
    removeLog(log: ProcessedLog,hash: string): void {
        if (!this.plugin.settings.saveLogs||!this.cache) return this.cache=undefined;
        this.cache.delete(hash);
    }
}