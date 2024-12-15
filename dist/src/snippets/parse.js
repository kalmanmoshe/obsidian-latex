import { optional, object, string as string_, union, instance, parse, number, special } from "valibot";
import { encode } from "js-base64";
import { RegexSnippet, serializeSnippetLike, StringSnippet, VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER, VisualSnippet } from "./snippets";
import { Options } from "./options";
import { sortSnippets } from "./sort";
import { EXCLUSIONS } from "./environment";
async function importRaw(maybeJavaScriptCode) {
    let raw;
    try {
        try {
            // first, try to import as a plain js module
            // js-base64.encode is needed over builtin `window.btoa` because the latter errors on unicode
            raw = await importModuleDefault(`data:text/javascript;base64,${encode(maybeJavaScriptCode)}`);
        }
        catch {
            // otherwise, try to import as a standalone js object
            raw = await importModuleDefault(`data:text/javascript;base64,${encode(`export default ${maybeJavaScriptCode}`)}`);
        }
    }
    catch (e) {
        throw "Invalid format.";
    }
    return raw;
}
export async function parseSnippetVariables(snippetVariablesStr) {
    const rawSnippetVariables = await importRaw(snippetVariablesStr);
    if (Array.isArray(rawSnippetVariables))
        throw "Cannot parse an array as a variables object";
    const snippetVariables = {};
    for (const [variable, value] of Object.entries(rawSnippetVariables)) {
        if (variable.startsWith("${")) {
            if (!variable.endsWith("}")) {
                throw `Invalid snippet variable name '${variable}': Starts with '\${' but does not end with '}'. You need to have both or neither.`;
            }
            snippetVariables[variable] = value;
        }
        else {
            if (variable.endsWith("}")) {
                throw `Invalid snippet variable name '${variable}': Ends with '}' but does not start with '\${'. You need to have both or neither.`;
            }
            snippetVariables["${" + variable + "}"] = value;
        }
    }
    return snippetVariables;
}
export async function parseSnippets(snippetsStr, snippetVariables) {
    let rawSnippets = await importRaw(snippetsStr);
    let parsedSnippets;
    try {
        // validate the shape of the raw snippets
        rawSnippets = validateRawSnippets(rawSnippets);
        parsedSnippets = rawSnippets.map((raw) => {
            try {
                // Normalize the raw snippet and convert it into a Snippet
                return parseSnippet(raw, snippetVariables);
            }
            catch (e) {
                // provide context of which snippet errored
                throw `${e}\nErroring snippet:\n${serializeSnippetLike(raw)}`;
            }
        });
    }
    catch (e) {
        throw `Invalid snippet format: ${e}`;
    }
    parsedSnippets = sortSnippets(parsedSnippets);
    return parsedSnippets;
}
/** load snippet string as module */
/**
 * imports the default export of a given module.
 *
 * @param module the module to import. this can be a resource path, data url, etc
 * @returns the default export of said module
 * @throws if import fails or default export is undefined
 */
async function importModuleDefault(module) {
    let data;
    try {
        data = await import(module);
    }
    catch (e) {
        throw `failed to import module ${module}`;
    }
    // it's safe to use `in` here - it has a null prototype, so `Object.hasOwnProperty` isn't available,
    // but on the other hand we don't need to worry about something further up the prototype chain messing with this check
    if (!("default" in data)) {
        throw `No default export provided for module ${module}`;
    }
    return data.default;
}
/** raw snippet IR */
const RawSnippetSchema = object({
    trigger: union([string_(), instance(RegExp)]),
    replacement: union([string_(), special(x => typeof x === "function")]),
    options: string_(),
    flags: optional(string_()),
    priority: optional(number()),
    description: optional(string_()),
});
/**
 * tries to parse an unknown value as an array of raw snippets
 * @throws if the value does not adhere to the raw snippet array schema
 */
function validateRawSnippets(snippets) {
    if (!Array.isArray(snippets)) {
        throw "Expected snippets to be an array";
    }
    return snippets.map((raw) => {
        try {
            return parse(RawSnippetSchema, raw);
        }
        catch (e) {
            throw `Value does not resemble snippet.\nErroring snippet:\n${serializeSnippetLike(raw)}`;
        }
    });
}
/**
 * Parses a raw snippet.
 * This does the following:
 * - snippet variables are substituted into the trigger
 * - `options.regex` and `options.visual` are set properly
 * - if it is a regex snippet, the trigger is represented as a RegExp instance with flags set
 */
function parseSnippet(raw, snippetVariables) {
    const { replacement, priority, description } = raw;
    const options = Options.fromSource(raw.options);
    let trigger;
    let excludedEnvironments;
    // we have a regex snippet
    if (options.regex || raw.trigger instanceof RegExp) {
        let triggerStr;
        // normalize flags to a string
        let flags = raw.flags ?? "";
        // extract trigger string from trigger,
        // and merge flags, if trigger is a regexp already
        if (raw.trigger instanceof RegExp) {
            triggerStr = raw.trigger.source;
            flags = `${raw.trigger.flags}${flags}`;
        }
        else {
            triggerStr = raw.trigger;
        }
        // filter out invalid flags
        flags = filterFlags(flags);
        // substitute snippet variables
        triggerStr = insertSnippetVariables(triggerStr, snippetVariables);
        // get excluded environment(s) for this trigger, if any
        excludedEnvironments = getExcludedEnvironments(triggerStr);
        // Add $ so regex matches end of string
        // i.e. look for a match at the cursor's current position
        triggerStr = `${triggerStr}$`;
        // convert trigger into RegExp instance
        trigger = new RegExp(triggerStr, flags);
        options.regex = true;
        const normalised = { trigger, replacement, options, priority, description, excludedEnvironments };
        return new RegexSnippet(normalised);
    }
    else {
        let trigger = raw.trigger;
        // substitute snippet variables
        trigger = insertSnippetVariables(trigger, snippetVariables);
        // get excluded environment(s) for this trigger, if any
        excludedEnvironments = getExcludedEnvironments(trigger);
        // normalize visual replacements
        if (typeof replacement === "string" && replacement.includes(VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER)) {
            options.visual = true;
        }
        const normalised = { trigger, replacement, options, priority, description, excludedEnvironments };
        if (options.visual) {
            return new VisualSnippet(normalised);
        }
        else {
            return new StringSnippet(normalised);
        }
    }
}
/**
 * removes duplicate flags and filters out invalid ones from a flags string.
 */
function filterFlags(flags) {
    // filter out invalid flags
    const validFlags = [
        // "d", // doesn't affect the search
        // "g", // doesn't affect the pattern match and is almost certainly undesired behavior
        "i",
        "m",
        "s",
        "u",
        "v",
        // "y", // almost certainly undesired behavior
    ];
    return Array.from(new Set(flags.split("")))
        .filter(flag => validFlags.includes(flag))
        .join("");
}
function insertSnippetVariables(trigger, variables) {
    for (const [variable, replacement] of Object.entries(variables)) {
        trigger = trigger.replace(variable, replacement);
    }
    return trigger;
}
function getExcludedEnvironments(trigger) {
    const result = [];
    if (EXCLUSIONS.hasOwnProperty(trigger)) {
        result.push(EXCLUSIONS[trigger]);
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc25pcHBldHMvcGFyc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLE9BQU8sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQVUsT0FBTyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQy9HLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDbkMsT0FBTyxFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBVyxhQUFhLEVBQUUsMENBQTBDLEVBQUUsYUFBYSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQ25KLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFDcEMsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN0QyxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sZUFBZSxDQUFDO0FBSXhELEtBQUssVUFBVSxTQUFTLENBQUMsbUJBQTJCO0lBQ25ELElBQUksR0FBRyxDQUFDO0lBQ1IsSUFBSSxDQUFDO1FBQ0osSUFBSSxDQUFDO1lBQ0osNENBQTRDO1lBQzVDLDZGQUE2RjtZQUM3RixHQUFHLEdBQUcsTUFBTSxtQkFBbUIsQ0FBQywrQkFBK0IsTUFBTSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQy9GLENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUixxREFBcUQ7WUFDckQsR0FBRyxHQUFHLE1BQU0sbUJBQW1CLENBQUMsK0JBQStCLE1BQU0sQ0FBQyxrQkFBa0IsbUJBQW1CLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNuSCxDQUFDO0lBQ0YsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWixNQUFNLGlCQUFpQixDQUFDO0lBQ3pCLENBQUM7SUFDRCxPQUFPLEdBQUcsQ0FBQztBQUNa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QUFRLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDekMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsc0JBQXNCLENBQUMsT0FBZSxFQUFFLFNBQTJCO0lBQzNFLEtBQUssTUFBTSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7UUFDakUsT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxPQUFlO0lBQy9DLE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNsQixJQUFJLFVBQVUsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBvcHRpb25hbCwgb2JqZWN0LCBzdHJpbmcgYXMgc3RyaW5nXywgdW5pb24sIGluc3RhbmNlLCBwYXJzZSwgbnVtYmVyLCBPdXRwdXQsIHNwZWNpYWwgfSBmcm9tIFwidmFsaWJvdFwiO1xuaW1wb3J0IHsgZW5jb2RlIH0gZnJvbSBcImpzLWJhc2U2NFwiO1xuaW1wb3J0IHsgUmVnZXhTbmlwcGV0LCBzZXJpYWxpemVTbmlwcGV0TGlrZSwgU25pcHBldCwgU3RyaW5nU25pcHBldCwgVklTVUFMX1NOSVBQRVRfTUFHSUNfU0VMRUNUSU9OX1BMQUNFSE9MREVSLCBWaXN1YWxTbmlwcGV0IH0gZnJvbSBcIi4vc25pcHBldHNcIjtcbmltcG9ydCB7IE9wdGlvbnMgfSBmcm9tIFwiLi9vcHRpb25zXCI7XG5pbXBvcnQgeyBzb3J0U25pcHBldHMgfSBmcm9tIFwiLi9zb3J0XCI7XG5pbXBvcnQgeyBFWENMVVNJT05TLCBFbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5cbmV4cG9ydCB0eXBlIFNuaXBwZXRWYXJpYWJsZXMgPSBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXG5hc3luYyBmdW5jdGlvbiBpbXBvcnRSYXcobWF5YmVKYXZhU2NyaXB0Q29kZTogc3RyaW5nKSB7XG5cdGxldCByYXc7XG5cdHRyeSB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIGZpcnN0LCB0cnkgdG8gaW1wb3J0IGFzIGEgcGxhaW4ganMgbW9kdWxlXG5cdFx0XHQvLyBqcy1iYXNlNjQuZW5jb2RlIGlzIG5lZWRlZCBvdmVyIGJ1aWx0aW4gYHdpbmRvdy5idG9hYCBiZWNhdXNlIHRoZSBsYXR0ZXIgZXJyb3JzIG9uIHVuaWNvZGVcblx0XHRcdHJhdyA9IGF3YWl0IGltcG9ydE1vZHVsZURlZmF1bHQoYGRhdGE6dGV4dC9qYXZhc2NyaXB0O2Jhc2U2NCwke2VuY29kZShtYXliZUphdmFTY3JpcHRDb2RlKX1gKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG90aGVyd2lzZSwgdHJ5IHRvIGltcG9ydCBhcyBhIHN0YW5kYWxvbmUganMgb2JqZWN0XG5cdFx0XHRyYXcgPSBhd2FpdCBpbXBvcnRNb2R1bGVEZWZhdWx0KGBkYXRhOnRleHQvamF2YXNjcmlwdDtiYXNlNjQsJHtlbmNvZGUoYGV4cG9ydCBkZWZhdWx0ICR7bWF5YmVKYXZhU2NyaXB0Q29kZX1gKX1gKTtcblx0XHR9XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHR0aHJvdyBcIkludmFsaWQgZm9ybWF0LlwiO1xuXHR9XG5cdHJldHVybiByYXc7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVNuaXBwZXRWYXJpYWJsZXMoc25pcHBldFZhcmlhYmxlc1N0cjogc3RyaW5nKSB7XG5cdGNvbnN0IHJhd1NuaXBwZXRWYXJpYWJsZXMgPSBhd2FpdCBpbXBvcnRSYXcoc25pcHBldFZhcmlhYmxlc1N0cikgYXMgU25pcHBldFZhcmlhYmxlcztcblxuXHRpZiAoQXJyYXkuaXNBcnJheShyYXdTbmlwcGV0VmFyaWFibGVzKSlcblx0XHR0aHJvdyBcIkNhbm5vdCBwYXJzZSBhbiBhcnJheSBhcyBhIHZhcmlhYmxlcyBvYmplY3RcIjtcblxuXHRjb25zdCBzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzID0ge307XG5cdGZvciAoY29uc3QgW3ZhcmlhYmxlLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmF3U25pcHBldFZhcmlhYmxlcykpIHtcblx0XHRpZiAodmFyaWFibGUuc3RhcnRzV2l0aChcIiR7XCIpKSB7XG5cdFx0XHRpZiAoIXZhcmlhYmxlLmVuZHNXaXRoKFwifVwiKSkge1xuXHRcdFx0XHR0aHJvdyBgSW52YWxpZCBzbmlwcGV0IHZhcmlhYmxlIG5hbWUgJyR7dmFyaWFibGV9JzogU3RhcnRzIHdpdGggJ1xcJHsnIGJ1dCBkb2VzIG5vdCBlbmQgd2l0aCAnfScuIFlvdSBuZWVkIHRvIGhhdmUgYm90aCBvciBuZWl0aGVyLmA7XG5cdFx0XHR9XG5cdFx0XHRzbmlwcGV0VmFyaWFibGVzW3ZhcmlhYmxlXSA9IHZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmFyaWFibGUuZW5kc1dpdGgoXCJ9XCIpKSB7XG5cdFx0XHRcdHRocm93IGBJbnZhbGlkIHNuaXBwZXQgdmFyaWFibGUgbmFtZSAnJHt2YXJpYWJsZX0nOiBFbmRzIHdpdGggJ30nIGJ1dCBkb2VzIG5vdCBzdGFydCB3aXRoICdcXCR7Jy4gWW91IG5lZWQgdG8gaGF2ZSBib3RoIG9yIG5laXRoZXIuYDtcblx0XHRcdH1cblx0XHRcdHNuaXBwZXRWYXJpYWJsZXNbXCIke1wiICsgdmFyaWFibGUgKyBcIn1cIl0gPSB2YWx1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHNuaXBwZXRWYXJpYWJsZXM7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVNuaXBwZXRzKHNuaXBwZXRzU3RyOiBzdHJpbmcsIHNuaXBwZXRWYXJpYWJsZXM6IFNuaXBwZXRWYXJpYWJsZXMpIHtcblx0bGV0IHJhd1NuaXBwZXRzID0gYXdhaXQgaW1wb3J0UmF3KHNuaXBwZXRzU3RyKSBhcyBSYXdTbmlwcGV0W107XG5cblx0bGV0IHBhcnNlZFNuaXBwZXRzO1xuXHR0cnkge1xuXHRcdC8vIHZhbGlkYXRlIHRoZSBzaGFwZSBvZiB0aGUgcmF3IHNuaXBwZXRzXG5cdFx0cmF3U25pcHBldHMgPSB2YWxpZGF0ZVJhd1NuaXBwZXRzKHJhd1NuaXBwZXRzKTtcblxuXHRcdHBhcnNlZFNuaXBwZXRzID0gcmF3U25pcHBldHMubWFwKChyYXcpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIE5vcm1hbGl6ZSB0aGUgcmF3IHNuaXBwZXQgYW5kIGNvbnZlcnQgaXQgaW50byBhIFNuaXBwZXRcblx0XHRcdFx0cmV0dXJuIHBhcnNlU25pcHBldChyYXcsIHNuaXBwZXRWYXJpYWJsZXMpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBwcm92aWRlIGNvbnRleHQgb2Ygd2hpY2ggc25pcHBldCBlcnJvcmVkXG5cdFx0XHRcdHRocm93IGAke2V9XFxuRXJyb3Jpbmcgc25pcHBldDpcXG4ke3NlcmlhbGl6ZVNuaXBwZXRMaWtlKHJhdyl9YDtcblx0XHRcdH1cblx0XHR9KTtcblx0fSBjYXRjaChlKSB7XG5cdFx0dGhyb3cgYEludmFsaWQgc25pcHBldCBmb3JtYXQ6ICR7ZX1gO1xuXHR9XG5cblx0cGFyc2VkU25pcHBldHMgPSBzb3J0U25pcHBldHMocGFyc2VkU25pcHBldHMpO1xuXG5cdHJldHVybiBwYXJzZWRTbmlwcGV0cztcbn1cblxuLyoqIGxvYWQgc25pcHBldCBzdHJpbmcgYXMgbW9kdWxlICovXG5cbi8qKlxuICogaW1wb3J0cyB0aGUgZGVmYXVsdCBleHBvcnQgb2YgYSBnaXZlbiBtb2R1bGUuXG4gKlxuICogQHBhcmFtIG1vZHVsZSB0aGUgbW9kdWxlIHRvIGltcG9ydC4gdGhpcyBjYW4gYmUgYSByZXNvdXJjZSBwYXRoLCBkYXRhIHVybCwgZXRjXG4gKiBAcmV0dXJucyB0aGUgZGVmYXVsdCBleHBvcnQgb2Ygc2FpZCBtb2R1bGVcbiAqIEB0aHJvd3MgaWYgaW1wb3J0IGZhaWxzIG9yIGRlZmF1bHQgZXhwb3J0IGlzIHVuZGVmaW5lZFxuICovXG5hc3luYyBmdW5jdGlvbiBpbXBvcnRNb2R1bGVEZWZhdWx0KG1vZHVsZTogc3RyaW5nKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdGxldCBkYXRhO1xuXHR0cnkge1xuXHRcdGRhdGEgPSBhd2FpdCBpbXBvcnQobW9kdWxlKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdHRocm93IGBmYWlsZWQgdG8gaW1wb3J0IG1vZHVsZSAke21vZHVsZX1gO1xuXHR9XG5cblx0Ly8gaXQncyBzYWZlIHRvIHVzZSBgaW5gIGhlcmUgLSBpdCBoYXMgYSBudWxsIHByb3RvdHlwZSwgc28gYE9iamVjdC5oYXNPd25Qcm9wZXJ0eWAgaXNuJ3QgYXZhaWxhYmxlLFxuXHQvLyBidXQgb24gdGhlIG90aGVyIGhhbmQgd2UgZG9uJ3QgbmVlZCB0byB3b3JyeSBhYm91dCBzb21ldGhpbmcgZnVydGhlciB1cCB0aGUgcHJvdG90eXBlIGNoYWluIG1lc3Npbmcgd2l0aCB0aGlzIGNoZWNrXG5cdGlmICghKFwiZGVmYXVsdFwiIGluIGRhdGEpKSB7XG5cdFx0dGhyb3cgYE5vIGRlZmF1bHQgZXhwb3J0IHByb3ZpZGVkIGZvciBtb2R1bGUgJHttb2R1bGV9YDtcblx0fVxuXG5cdHJldHVybiBkYXRhLmRlZmF1bHQ7XG59XG5cbi8qKiByYXcgc25pcHBldCBJUiAqL1xuXG5jb25zdCBSYXdTbmlwcGV0U2NoZW1hID0gb2JqZWN0KHtcblx0dHJpZ2dlcjogdW5pb24oW3N0cmluZ18oKSwgaW5zdGFuY2UoUmVnRXhwKV0pLFxuXHRyZXBsYWNlbWVudDogdW5pb24oW3N0cmluZ18oKSwgc3BlY2lhbDxBbnlGdW5jdGlvbj4oeCA9PiB0eXBlb2YgeCA9PT0gXCJmdW5jdGlvblwiKV0pLFxuXHRvcHRpb25zOiBzdHJpbmdfKCksXG5cdGZsYWdzOiBvcHRpb25hbChzdHJpbmdfKCkpLFxuXHRwcmlvcml0eTogb3B0aW9uYWwobnVtYmVyKCkpLFxuXHRkZXNjcmlwdGlvbjogb3B0aW9uYWwoc3RyaW5nXygpKSxcbn0pO1xuXG50eXBlIFJhd1NuaXBwZXQgPSBPdXRwdXQ8dHlwZW9mIFJhd1NuaXBwZXRTY2hlbWE+O1xuXG4vKipcbiAqIHRyaWVzIHRvIHBhcnNlIGFuIHVua25vd24gdmFsdWUgYXMgYW4gYXJyYXkgb2YgcmF3IHNuaXBwZXRzXG4gKiBAdGhyb3dzIGlmIHRoZSB2YWx1ZSBkb2VzIG5vdCBhZGhlcmUgdG8gdGhlIHJhdyBzbmlwcGV0IGFycmF5IHNjaGVtYVxuICovXG5mdW5jdGlvbiB2YWxpZGF0ZVJhd1NuaXBwZXRzKHNuaXBwZXRzOiB1bmtub3duKTogUmF3U25pcHBldFtdIHtcblx0aWYgKCFBcnJheS5pc0FycmF5KHNuaXBwZXRzKSkgeyB0aHJvdyBcIkV4cGVjdGVkIHNuaXBwZXRzIHRvIGJlIGFuIGFycmF5XCI7IH1cblx0cmV0dXJuIHNuaXBwZXRzLm1hcCgocmF3KSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBwYXJzZShSYXdTbmlwcGV0U2NoZW1hLCByYXcpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRocm93IGBWYWx1ZSBkb2VzIG5vdCByZXNlbWJsZSBzbmlwcGV0LlxcbkVycm9yaW5nIHNuaXBwZXQ6XFxuJHtzZXJpYWxpemVTbmlwcGV0TGlrZShyYXcpfWA7XG5cdFx0fVxuXHR9KVxufVxuXG4vKipcbiAqIFBhcnNlcyBhIHJhdyBzbmlwcGV0LlxuICogVGhpcyBkb2VzIHRoZSBmb2xsb3dpbmc6XG4gKiAtIHNuaXBwZXQgdmFyaWFibGVzIGFyZSBzdWJzdGl0dXRlZCBpbnRvIHRoZSB0cmlnZ2VyXG4gKiAtIGBvcHRpb25zLnJlZ2V4YCBhbmQgYG9wdGlvbnMudmlzdWFsYCBhcmUgc2V0IHByb3Blcmx5XG4gKiAtIGlmIGl0IGlzIGEgcmVnZXggc25pcHBldCwgdGhlIHRyaWdnZXIgaXMgcmVwcmVzZW50ZWQgYXMgYSBSZWdFeHAgaW5zdGFuY2Ugd2l0aCBmbGFncyBzZXRcbiAqL1xuZnVuY3Rpb24gcGFyc2VTbmlwcGV0KHJhdzogUmF3U25pcHBldCwgc25pcHBldFZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcyk6IFNuaXBwZXQge1xuXHRjb25zdCB7IHJlcGxhY2VtZW50LCBwcmlvcml0eSwgZGVzY3JpcHRpb24gfSA9IHJhdztcblx0Y29uc3Qgb3B0aW9ucyA9IE9wdGlvbnMuZnJvbVNvdXJjZShyYXcub3B0aW9ucyk7XG5cdGxldCB0cmlnZ2VyO1xuXHRsZXQgZXhjbHVkZWRFbnZpcm9ubWVudHM7XG5cblx0Ly8gd2UgaGF2ZSBhIHJlZ2V4IHNuaXBwZXRcblx0aWYgKG9wdGlvbnMucmVnZXggfHwgcmF3LnRyaWdnZXIgaW5zdGFuY2VvZiBSZWdFeHApIHtcblx0XHRsZXQgdHJpZ2dlclN0cjogc3RyaW5nO1xuXHRcdC8vIG5vcm1hbGl6ZSBmbGFncyB0byBhIHN0cmluZ1xuXHRcdGxldCBmbGFncyA9IHJhdy5mbGFncyA/PyBcIlwiO1xuXG5cdFx0Ly8gZXh0cmFjdCB0cmlnZ2VyIHN0cmluZyBmcm9tIHRyaWdnZXIsXG5cdFx0Ly8gYW5kIG1lcmdlIGZsYWdzLCBpZiB0cmlnZ2VyIGlzIGEgcmVnZXhwIGFscmVhZHlcblx0XHRpZiAocmF3LnRyaWdnZXIgaW5zdGFuY2VvZiBSZWdFeHApIHtcblx0XHRcdHRyaWdnZXJTdHIgPSByYXcudHJpZ2dlci5zb3VyY2U7XG5cdFx0XHRmbGFncyA9IGAkeyhyYXcudHJpZ2dlciBhcyBSZWdFeHApLmZsYWdzfSR7ZmxhZ3N9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJpZ2dlclN0ciA9IHJhdy50cmlnZ2VyO1xuXHRcdH1cblx0XHQvLyBmaWx0ZXIgb3V0IGludmFsaWQgZmxhZ3Ncblx0XHRmbGFncyA9IGZpbHRlckZsYWdzKGZsYWdzKTtcblxuXHRcdC8vIHN1YnN0aXR1dGUgc25pcHBldCB2YXJpYWJsZXNcblx0XHR0cmlnZ2VyU3RyID0gaW5zZXJ0U25pcHBldFZhcmlhYmxlcyh0cmlnZ2VyU3RyLCBzbmlwcGV0VmFyaWFibGVzKTtcblxuXHRcdC8vIGdldCBleGNsdWRlZCBlbnZpcm9ubWVudChzKSBmb3IgdGhpcyB0cmlnZ2VyLCBpZiBhbnlcblx0XHRleGNsdWRlZEVudmlyb25tZW50cyA9IGdldEV4Y2x1ZGVkRW52aXJvbm1lbnRzKHRyaWdnZXJTdHIpO1xuXG5cdFx0Ly8gQWRkICQgc28gcmVnZXggbWF0Y2hlcyBlbmQgb2Ygc3RyaW5nXG5cdFx0Ly8gaS5lLiBsb29rIGZvciBhIG1hdGNoIGF0IHRoZSBjdXJzb3IncyBjdXJyZW50IHBvc2l0aW9uXG5cdFx0dHJpZ2dlclN0ciA9IGAke3RyaWdnZXJTdHJ9JGA7XG5cblx0XHQvLyBjb252ZXJ0IHRyaWdnZXIgaW50byBSZWdFeHAgaW5zdGFuY2Vcblx0XHR0cmlnZ2VyID0gbmV3IFJlZ0V4cCh0cmlnZ2VyU3RyLCBmbGFncyk7XG5cblx0XHRvcHRpb25zLnJlZ2V4ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IG5vcm1hbGlzZWQgPSB7IHRyaWdnZXIsIHJlcGxhY2VtZW50LCBvcHRpb25zLCBwcmlvcml0eSwgZGVzY3JpcHRpb24sIGV4Y2x1ZGVkRW52aXJvbm1lbnRzIH07XG5cblx0XHRyZXR1cm4gbmV3IFJlZ2V4U25pcHBldChub3JtYWxpc2VkKTtcblx0fVxuXHRlbHNlIHtcblx0XHRsZXQgdHJpZ2dlciA9IHJhdy50cmlnZ2VyIGFzIHN0cmluZztcblx0XHQvLyBzdWJzdGl0dXRlIHNuaXBwZXQgdmFyaWFibGVzXG5cdFx0dHJpZ2dlciA9IGluc2VydFNuaXBwZXRWYXJpYWJsZXModHJpZ2dlciwgc25pcHBldFZhcmlhYmxlcyk7XG5cblx0XHQvLyBnZXQgZXhjbHVkZWQgZW52aXJvbm1lbnQocykgZm9yIHRoaXMgdHJpZ2dlciwgaWYgYW55XG5cdFx0ZXhjbHVkZWRFbnZpcm9ubWVudHMgPSBnZXRFeGNsdWRlZEVudmlyb25tZW50cyh0cmlnZ2VyKTtcblxuXHRcdC8vIG5vcm1hbGl6ZSB2aXN1YWwgcmVwbGFjZW1lbnRzXG5cdFx0aWYgKHR5cGVvZiByZXBsYWNlbWVudCA9PT0gXCJzdHJpbmdcIiAmJiByZXBsYWNlbWVudC5pbmNsdWRlcyhWSVNVQUxfU05JUFBFVF9NQUdJQ19TRUxFQ1RJT05fUExBQ0VIT0xERVIpKSB7XG5cdFx0XHRvcHRpb25zLnZpc3VhbCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9ybWFsaXNlZCA9IHsgdHJpZ2dlciwgcmVwbGFjZW1lbnQsIG9wdGlvbnMsIHByaW9yaXR5LCBkZXNjcmlwdGlvbiwgZXhjbHVkZWRFbnZpcm9ubWVudHMgfTtcblxuXHRcdGlmIChvcHRpb25zLnZpc3VhbCkge1xuXHRcdFx0cmV0dXJuIG5ldyBWaXN1YWxTbmlwcGV0KG5vcm1hbGlzZWQpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiBuZXcgU3RyaW5nU25pcHBldChub3JtYWxpc2VkKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiByZW1vdmVzIGR1cGxpY2F0ZSBmbGFncyBhbmQgZmlsdGVycyBvdXQgaW52YWxpZCBvbmVzIGZyb20gYSBmbGFncyBzdHJpbmcuXG4gKi9cbmZ1bmN0aW9uIGZpbHRlckZsYWdzKGZsYWdzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHQvLyBmaWx0ZXIgb3V0IGludmFsaWQgZmxhZ3Ncblx0Y29uc3QgdmFsaWRGbGFncyA9IFtcblx0XHQvLyBcImRcIiwgLy8gZG9lc24ndCBhZmZlY3QgdGhlIHNlYXJjaFxuXHRcdC8vIFwiZ1wiLCAvLyBkb2Vzbid0IGFmZmVjdCB0aGUgcGF0dGVybiBtYXRjaCBhbmQgaXMgYWxtb3N0IGNlcnRhaW5seSB1bmRlc2lyZWQgYmVoYXZpb3Jcblx0XHRcImlcIixcblx0XHRcIm1cIixcblx0XHRcInNcIixcblx0XHRcInVcIixcblx0XHRcInZcIixcblx0XHQvLyBcInlcIiwgLy8gYWxtb3N0IGNlcnRhaW5seSB1bmRlc2lyZWQgYmVoYXZpb3Jcblx0XTtcblx0cmV0dXJuIEFycmF5LmZyb20obmV3IFNldChmbGFncy5zcGxpdChcIlwiKSkpXG5cdFx0XHQuZmlsdGVyKGZsYWcgPT4gdmFsaWRGbGFncy5pbmNsdWRlcyhmbGFnKSlcblx0XHRcdC5qb2luKFwiXCIpO1xufVxuXG5mdW5jdGlvbiBpbnNlcnRTbmlwcGV0VmFyaWFibGVzKHRyaWdnZXI6IHN0cmluZywgdmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKSB7XG5cdGZvciAoY29uc3QgW3ZhcmlhYmxlLCByZXBsYWNlbWVudF0gb2YgT2JqZWN0LmVudHJpZXModmFyaWFibGVzKSkge1xuXHRcdHRyaWdnZXIgPSB0cmlnZ2VyLnJlcGxhY2UodmFyaWFibGUsIHJlcGxhY2VtZW50KTtcblx0fVxuXG5cdHJldHVybiB0cmlnZ2VyO1xufVxuXG5mdW5jdGlvbiBnZXRFeGNsdWRlZEVudmlyb25tZW50cyh0cmlnZ2VyOiBzdHJpbmcpOiBFbnZpcm9ubWVudFtdIHtcblx0Y29uc3QgcmVzdWx0ID0gW107XG5cdGlmIChFWENMVVNJT05TLmhhc093blByb3BlcnR5KHRyaWdnZXIpKSB7XG5cdFx0cmVzdWx0LnB1c2goRVhDTFVTSU9OU1t0cmlnZ2VyXSk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbnR5cGUgRm48QXJncyBleHRlbmRzIHJlYWRvbmx5IGFueVtdLCBSZXQ+ID0gKC4uLmFyZ3M6IEFyZ3MpID0+IFJldDtcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG50eXBlIEFueUZ1bmN0aW9uID0gRm48YW55LCBhbnk+O1xuIl19