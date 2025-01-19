import { z } from "zod";
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
const RawSnippetSchema = z.object({
    trigger: z.union([z.string(), z.instanceof(RegExp)]),
    replacement: z.union([z.string(), z.function()]),
    options: z.string(),
    flags: z.string().optional(),
    priority: z.number().optional(),
    description: z.string().optional(),
});
/**
 * tries to parse an unknown value as an array of raw snippets
 * @throws if the value does not adhere to the raw snippet array schema
 */
function validateRawSnippets(snippets) {
    if (!Array.isArray(snippets)) {
        throw new Error("Expected snippets to be an array");
    }
    return snippets.map((raw, index) => {
        const validationResult = RawSnippetSchema.safeParse(raw);
        if (!validationResult.success) {
            const errorMessage = validationResult.error.errors
                .map((error) => `${error.path.join(".")}: ${error.message}`)
                .join(", ");
            throw new Error(`Value does not resemble snippet at index ${index}.\nErrors: ${errorMessage}\nErroring snippet:\n${JSON.stringify(raw, null, 2)}`);
        }
        return validationResult.data;
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
        const normalised = {
            trigger,
            replacement: replacement,
            options,
            priority,
            description,
            excludedEnvironments,
        };
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
        const normalizedReplacement = typeof replacement === "string"
            ? replacement
            : replacement.length === 1
                ? (match) => {
                    const result = replacement(match);
                    if (result === false) {
                        throw new Error("Replacement function returned false, which is not allowed.");
                    }
                    return result;
                }
                : replacement;
        const normalised = {
            trigger,
            replacement: normalizedReplacement,
            options,
            priority,
            description,
            excludedEnvironments,
        };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc25pcHBldHMvcGFyc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLEtBQUssQ0FBQztBQUN4QixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ25DLE9BQU8sRUFBRSxZQUFZLEVBQUUsb0JBQW9CLEVBQVcsYUFBYSxFQUFFLDBDQUEwQyxFQUFFLGFBQWEsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUNuSixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBQ3BDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDdEMsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLGVBQWUsQ0FBQztBQUl4RCxLQUFLLFVBQVUsU0FBUyxDQUFDLG1CQUEyQjtJQUNuRCxJQUFJLEdBQUcsQ0FBQztJQUNSLElBQUksQ0FBQztRQUNKLElBQUksQ0FBQztZQUNKLDRDQUE0QztZQUM1Qyw2RkFBNkY7WUFDN0YsR0FBRyxHQUFHLE1BQU0sbUJBQW1CLENBQUMsK0JBQStCLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvRixDQUFDO1FBQUMsTUFBTSxDQUFDO1lBQ1IscURBQXFEO1lBQ3JELEdBQUcsR0FBRyxNQUFNLG1CQUFtQixDQUFDLCtCQUErQixNQUFNLENBQUMsa0JBQWtCLG1CQUFtQixFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbkgsQ0FBQztJQUNGLENBQUM7SUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ1osTUFBTSxpQkFBaUIsQ0FBQztJQUN6QixDQUFDO0lBQ0QsT0FBTyxHQUFHLENBQUM7QUFDWixDQUFDO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxxQkFBcUIsQ0FBQyxtQkFBMkI7SUFDdEUsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLFNB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Q0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxPQUFPLE9BQU8sQ0FBQztBQUNoQixDQUFDO0FBRUQsU0FBUyx1QkFBdUIsQ0FBQyxPQUFlO0lBQy9DLE1BQU0sTUFBTSxHQUFHLEVBQUUsQ0FBQztJQUNsQixJQUFJLFVBQVUsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBQ2xDLENBQUM7SUFDRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyB6IH0gZnJvbSBcInpvZFwiO1xuaW1wb3J0IHsgZW5jb2RlIH0gZnJvbSBcImpzLWJhc2U2NFwiO1xuaW1wb3J0IHsgUmVnZXhTbmlwcGV0LCBzZXJpYWxpemVTbmlwcGV0TGlrZSwgU25pcHBldCwgU3RyaW5nU25pcHBldCwgVklTVUFMX1NOSVBQRVRfTUFHSUNfU0VMRUNUSU9OX1BMQUNFSE9MREVSLCBWaXN1YWxTbmlwcGV0IH0gZnJvbSBcIi4vc25pcHBldHNcIjtcbmltcG9ydCB7IE9wdGlvbnMgfSBmcm9tIFwiLi9vcHRpb25zXCI7XG5pbXBvcnQgeyBzb3J0U25pcHBldHMgfSBmcm9tIFwiLi9zb3J0XCI7XG5pbXBvcnQgeyBFWENMVVNJT05TLCBFbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XG5cbmV4cG9ydCB0eXBlIFNuaXBwZXRWYXJpYWJsZXMgPSBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXG5hc3luYyBmdW5jdGlvbiBpbXBvcnRSYXcobWF5YmVKYXZhU2NyaXB0Q29kZTogc3RyaW5nKSB7XG5cdGxldCByYXc7XG5cdHRyeSB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIGZpcnN0LCB0cnkgdG8gaW1wb3J0IGFzIGEgcGxhaW4ganMgbW9kdWxlXG5cdFx0XHQvLyBqcy1iYXNlNjQuZW5jb2RlIGlzIG5lZWRlZCBvdmVyIGJ1aWx0aW4gYHdpbmRvdy5idG9hYCBiZWNhdXNlIHRoZSBsYXR0ZXIgZXJyb3JzIG9uIHVuaWNvZGVcblx0XHRcdHJhdyA9IGF3YWl0IGltcG9ydE1vZHVsZURlZmF1bHQoYGRhdGE6dGV4dC9qYXZhc2NyaXB0O2Jhc2U2NCwke2VuY29kZShtYXliZUphdmFTY3JpcHRDb2RlKX1gKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG90aGVyd2lzZSwgdHJ5IHRvIGltcG9ydCBhcyBhIHN0YW5kYWxvbmUganMgb2JqZWN0XG5cdFx0XHRyYXcgPSBhd2FpdCBpbXBvcnRNb2R1bGVEZWZhdWx0KGBkYXRhOnRleHQvamF2YXNjcmlwdDtiYXNlNjQsJHtlbmNvZGUoYGV4cG9ydCBkZWZhdWx0ICR7bWF5YmVKYXZhU2NyaXB0Q29kZX1gKX1gKTtcblx0XHR9XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHR0aHJvdyBcIkludmFsaWQgZm9ybWF0LlwiO1xuXHR9XG5cdHJldHVybiByYXc7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVNuaXBwZXRWYXJpYWJsZXMoc25pcHBldFZhcmlhYmxlc1N0cjogc3RyaW5nKSB7XG5cdGNvbnN0IHJhd1NuaXBwZXRWYXJpYWJsZXMgPSBhd2FpdCBpbXBvcnRSYXcoc25pcHBldFZhcmlhYmxlc1N0cikgYXMgU25pcHBldFZhcmlhYmxlcztcblxuXHRpZiAoQXJyYXkuaXNBcnJheShyYXdTbmlwcGV0VmFyaWFibGVzKSlcblx0XHR0aHJvdyBcIkNhbm5vdCBwYXJzZSBhbiBhcnJheSBhcyBhIHZhcmlhYmxlcyBvYmplY3RcIjtcblxuXHRjb25zdCBzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzID0ge307XG5cdGZvciAoY29uc3QgW3ZhcmlhYmxlLCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmF3U25pcHBldFZhcmlhYmxlcykpIHtcblx0XHRpZiAodmFyaWFibGUuc3RhcnRzV2l0aChcIiR7XCIpKSB7XG5cdFx0XHRpZiAoIXZhcmlhYmxlLmVuZHNXaXRoKFwifVwiKSkge1xuXHRcdFx0XHR0aHJvdyBgSW52YWxpZCBzbmlwcGV0IHZhcmlhYmxlIG5hbWUgJyR7dmFyaWFibGV9JzogU3RhcnRzIHdpdGggJ1xcJHsnIGJ1dCBkb2VzIG5vdCBlbmQgd2l0aCAnfScuIFlvdSBuZWVkIHRvIGhhdmUgYm90aCBvciBuZWl0aGVyLmA7XG5cdFx0XHR9XG5cdFx0XHRzbmlwcGV0VmFyaWFibGVzW3ZhcmlhYmxlXSA9IHZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodmFyaWFibGUuZW5kc1dpdGgoXCJ9XCIpKSB7XG5cdFx0XHRcdHRocm93IGBJbnZhbGlkIHNuaXBwZXQgdmFyaWFibGUgbmFtZSAnJHt2YXJpYWJsZX0nOiBFbmRzIHdpdGggJ30nIGJ1dCBkb2VzIG5vdCBzdGFydCB3aXRoICdcXCR7Jy4gWW91IG5lZWQgdG8gaGF2ZSBib3RoIG9yIG5laXRoZXIuYDtcblx0XHRcdH1cblx0XHRcdHNuaXBwZXRWYXJpYWJsZXNbXCIke1wiICsgdmFyaWFibGUgKyBcIn1cIl0gPSB2YWx1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHNuaXBwZXRWYXJpYWJsZXM7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVNuaXBwZXRzKHNuaXBwZXRzU3RyOiBzdHJpbmcsIHNuaXBwZXRWYXJpYWJsZXM6IFNuaXBwZXRWYXJpYWJsZXMpIHtcblx0bGV0IHJhd1NuaXBwZXRzID0gYXdhaXQgaW1wb3J0UmF3KHNuaXBwZXRzU3RyKSBhcyBSYXdTbmlwcGV0W107XG5cblx0bGV0IHBhcnNlZFNuaXBwZXRzO1xuXHR0cnkge1xuXHRcdC8vIHZhbGlkYXRlIHRoZSBzaGFwZSBvZiB0aGUgcmF3IHNuaXBwZXRzXG5cdFx0cmF3U25pcHBldHMgPSB2YWxpZGF0ZVJhd1NuaXBwZXRzKHJhd1NuaXBwZXRzKTtcblxuXHRcdHBhcnNlZFNuaXBwZXRzID0gcmF3U25pcHBldHMubWFwKChyYXcpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIE5vcm1hbGl6ZSB0aGUgcmF3IHNuaXBwZXQgYW5kIGNvbnZlcnQgaXQgaW50byBhIFNuaXBwZXRcblx0XHRcdFx0cmV0dXJuIHBhcnNlU25pcHBldChyYXcsIHNuaXBwZXRWYXJpYWJsZXMpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBwcm92aWRlIGNvbnRleHQgb2Ygd2hpY2ggc25pcHBldCBlcnJvcmVkXG5cdFx0XHRcdHRocm93IGAke2V9XFxuRXJyb3Jpbmcgc25pcHBldDpcXG4ke3NlcmlhbGl6ZVNuaXBwZXRMaWtlKHJhdyl9YDtcblx0XHRcdH1cblx0XHR9KTtcblx0fSBjYXRjaChlKSB7XG5cdFx0dGhyb3cgYEludmFsaWQgc25pcHBldCBmb3JtYXQ6ICR7ZX1gO1xuXHR9XG5cblx0cGFyc2VkU25pcHBldHMgPSBzb3J0U25pcHBldHMocGFyc2VkU25pcHBldHMpO1xuXHRyZXR1cm4gcGFyc2VkU25pcHBldHM7XG59XG5cbi8qKiBsb2FkIHNuaXBwZXQgc3RyaW5nIGFzIG1vZHVsZSAqL1xuXG4vKipcbiAqIGltcG9ydHMgdGhlIGRlZmF1bHQgZXhwb3J0IG9mIGEgZ2l2ZW4gbW9kdWxlLlxuICpcbiAqIEBwYXJhbSBtb2R1bGUgdGhlIG1vZHVsZSB0byBpbXBvcnQuIHRoaXMgY2FuIGJlIGEgcmVzb3VyY2UgcGF0aCwgZGF0YSB1cmwsIGV0Y1xuICogQHJldHVybnMgdGhlIGRlZmF1bHQgZXhwb3J0IG9mIHNhaWQgbW9kdWxlXG4gKiBAdGhyb3dzIGlmIGltcG9ydCBmYWlscyBvciBkZWZhdWx0IGV4cG9ydCBpcyB1bmRlZmluZWRcbiAqL1xuYXN5bmMgZnVuY3Rpb24gaW1wb3J0TW9kdWxlRGVmYXVsdChtb2R1bGU6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRsZXQgZGF0YTtcblx0dHJ5IHtcblx0XHRkYXRhID0gYXdhaXQgaW1wb3J0KG1vZHVsZSk7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHR0aHJvdyBgZmFpbGVkIHRvIGltcG9ydCBtb2R1bGUgJHttb2R1bGV9YDtcblx0fVxuXG5cdC8vIGl0J3Mgc2FmZSB0byB1c2UgYGluYCBoZXJlIC0gaXQgaGFzIGEgbnVsbCBwcm90b3R5cGUsIHNvIGBPYmplY3QuaGFzT3duUHJvcGVydHlgIGlzbid0IGF2YWlsYWJsZSxcblx0Ly8gYnV0IG9uIHRoZSBvdGhlciBoYW5kIHdlIGRvbid0IG5lZWQgdG8gd29ycnkgYWJvdXQgc29tZXRoaW5nIGZ1cnRoZXIgdXAgdGhlIHByb3RvdHlwZSBjaGFpbiBtZXNzaW5nIHdpdGggdGhpcyBjaGVja1xuXHRpZiAoIShcImRlZmF1bHRcIiBpbiBkYXRhKSkge1xuXHRcdHRocm93IGBObyBkZWZhdWx0IGV4cG9ydCBwcm92aWRlZCBmb3IgbW9kdWxlICR7bW9kdWxlfWA7XG5cdH1cblxuXHRyZXR1cm4gZGF0YS5kZWZhdWx0O1xufVxuXG4vKiogcmF3IHNuaXBwZXQgSVIgKi9cblxuY29uc3QgUmF3U25pcHBldFNjaGVtYSA9IHoub2JqZWN0KHtcbiAgICB0cmlnZ2VyOiB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lmluc3RhbmNlb2YoUmVnRXhwKV0pLFxuICAgIHJlcGxhY2VtZW50OiB6LnVuaW9uKFt6LnN0cmluZygpLCB6LmZ1bmN0aW9uKCldKSxcbiAgICBvcHRpb25zOiB6LnN0cmluZygpLFxuICAgIGZsYWdzOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXG4gICAgcHJpb3JpdHk6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcbiAgICBkZXNjcmlwdGlvbjogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxuICB9KTtcblxudHlwZSBSYXdTbmlwcGV0ID0gei5pbmZlcjx0eXBlb2YgUmF3U25pcHBldFNjaGVtYT47XG5cbi8qKlxuICogdHJpZXMgdG8gcGFyc2UgYW4gdW5rbm93biB2YWx1ZSBhcyBhbiBhcnJheSBvZiByYXcgc25pcHBldHNcbiAqIEB0aHJvd3MgaWYgdGhlIHZhbHVlIGRvZXMgbm90IGFkaGVyZSB0byB0aGUgcmF3IHNuaXBwZXQgYXJyYXkgc2NoZW1hXG4gKi9cbmZ1bmN0aW9uIHZhbGlkYXRlUmF3U25pcHBldHMoc25pcHBldHM6IHVua25vd24pOiBSYXdTbmlwcGV0W10ge1xuICBpZiAoIUFycmF5LmlzQXJyYXkoc25pcHBldHMpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgc25pcHBldHMgdG8gYmUgYW4gYXJyYXlcIik7XG4gIH1cblxuICByZXR1cm4gc25pcHBldHMubWFwKChyYXcsIGluZGV4KSA9PiB7XG4gICAgY29uc3QgdmFsaWRhdGlvblJlc3VsdCA9IFJhd1NuaXBwZXRTY2hlbWEuc2FmZVBhcnNlKHJhdyk7XG5cbiAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuc3VjY2Vzcykge1xuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gdmFsaWRhdGlvblJlc3VsdC5lcnJvci5lcnJvcnNcbiAgICAgICAgLm1hcCgoZXJyb3IpID0+IGAke2Vycm9yLnBhdGguam9pbihcIi5cIil9OiAke2Vycm9yLm1lc3NhZ2V9YClcbiAgICAgICAgLmpvaW4oXCIsIFwiKTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYFZhbHVlIGRvZXMgbm90IHJlc2VtYmxlIHNuaXBwZXQgYXQgaW5kZXggJHtpbmRleH0uXFxuRXJyb3JzOiAke2Vycm9yTWVzc2FnZX1cXG5FcnJvcmluZyBzbmlwcGV0OlxcbiR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgcmF3LFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgMlxuICAgICAgICApfWBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHZhbGlkYXRpb25SZXN1bHQuZGF0YTtcbiAgfSk7XG59XG5cbi8qKlxuICogUGFyc2VzIGEgcmF3IHNuaXBwZXQuXG4gKiBUaGlzIGRvZXMgdGhlIGZvbGxvd2luZzpcbiAqIC0gc25pcHBldCB2YXJpYWJsZXMgYXJlIHN1YnN0aXR1dGVkIGludG8gdGhlIHRyaWdnZXJcbiAqIC0gYG9wdGlvbnMucmVnZXhgIGFuZCBgb3B0aW9ucy52aXN1YWxgIGFyZSBzZXQgcHJvcGVybHlcbiAqIC0gaWYgaXQgaXMgYSByZWdleCBzbmlwcGV0LCB0aGUgdHJpZ2dlciBpcyByZXByZXNlbnRlZCBhcyBhIFJlZ0V4cCBpbnN0YW5jZSB3aXRoIGZsYWdzIHNldFxuICovXG5mdW5jdGlvbiBwYXJzZVNuaXBwZXQocmF3OiBSYXdTbmlwcGV0LCBzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKTogU25pcHBldCB7XG5cdFxuXHRjb25zdCB7IHJlcGxhY2VtZW50LCBwcmlvcml0eSwgZGVzY3JpcHRpb24gfSA9IHJhdztcblx0Y29uc3Qgb3B0aW9ucyA9IE9wdGlvbnMuZnJvbVNvdXJjZShyYXcub3B0aW9ucyk7XG5cdGxldCB0cmlnZ2VyO1xuXHRsZXQgZXhjbHVkZWRFbnZpcm9ubWVudHM7XG5cblx0Ly8gd2UgaGF2ZSBhIHJlZ2V4IHNuaXBwZXRcblx0aWYgKG9wdGlvbnMucmVnZXggfHwgcmF3LnRyaWdnZXIgaW5zdGFuY2VvZiBSZWdFeHApIHtcblx0XHRsZXQgdHJpZ2dlclN0cjogc3RyaW5nO1xuXHRcdC8vIG5vcm1hbGl6ZSBmbGFncyB0byBhIHN0cmluZ1xuXHRcdGxldCBmbGFncyA9IHJhdy5mbGFncyA/PyBcIlwiO1xuXG5cdFx0Ly8gZXh0cmFjdCB0cmlnZ2VyIHN0cmluZyBmcm9tIHRyaWdnZXIsXG5cdFx0Ly8gYW5kIG1lcmdlIGZsYWdzLCBpZiB0cmlnZ2VyIGlzIGEgcmVnZXhwIGFscmVhZHlcblx0XHRpZiAocmF3LnRyaWdnZXIgaW5zdGFuY2VvZiBSZWdFeHApIHtcblx0XHRcdHRyaWdnZXJTdHIgPSByYXcudHJpZ2dlci5zb3VyY2U7XG5cdFx0XHRmbGFncyA9IGAkeyhyYXcudHJpZ2dlciBhcyBSZWdFeHApLmZsYWdzfSR7ZmxhZ3N9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJpZ2dlclN0ciA9IHJhdy50cmlnZ2VyO1xuXHRcdH1cblx0XHQvLyBmaWx0ZXIgb3V0IGludmFsaWQgZmxhZ3Ncblx0XHRmbGFncyA9IGZpbHRlckZsYWdzKGZsYWdzKTtcblxuXHRcdC8vIHN1YnN0aXR1dGUgc25pcHBldCB2YXJpYWJsZXNcblx0XHR0cmlnZ2VyU3RyID0gaW5zZXJ0U25pcHBldFZhcmlhYmxlcyh0cmlnZ2VyU3RyLCBzbmlwcGV0VmFyaWFibGVzKTtcblxuXHRcdC8vIGdldCBleGNsdWRlZCBlbnZpcm9ubWVudChzKSBmb3IgdGhpcyB0cmlnZ2VyLCBpZiBhbnlcblx0XHRleGNsdWRlZEVudmlyb25tZW50cyA9IGdldEV4Y2x1ZGVkRW52aXJvbm1lbnRzKHRyaWdnZXJTdHIpO1xuXG5cdFx0Ly8gQWRkICQgc28gcmVnZXggbWF0Y2hlcyBlbmQgb2Ygc3RyaW5nXG5cdFx0Ly8gaS5lLiBsb29rIGZvciBhIG1hdGNoIGF0IHRoZSBjdXJzb3IncyBjdXJyZW50IHBvc2l0aW9uXG5cdFx0dHJpZ2dlclN0ciA9IGAke3RyaWdnZXJTdHJ9JGA7XG5cblx0XHQvLyBjb252ZXJ0IHRyaWdnZXIgaW50byBSZWdFeHAgaW5zdGFuY2Vcblx0XHR0cmlnZ2VyID0gbmV3IFJlZ0V4cCh0cmlnZ2VyU3RyLCBmbGFncyk7XG5cblx0XHRvcHRpb25zLnJlZ2V4ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IG5vcm1hbGlzZWQgPSB7XG5cdFx0XHR0cmlnZ2VyLFxuXHRcdFx0cmVwbGFjZW1lbnQ6IHJlcGxhY2VtZW50IGFzIHN0cmluZyB8ICgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSkgPT4gc3RyaW5nKSxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRwcmlvcml0eSxcblx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0ZXhjbHVkZWRFbnZpcm9ubWVudHMsXG5cdFx0fTtcdFx0XG5cdFx0cmV0dXJuIG5ldyBSZWdleFNuaXBwZXQobm9ybWFsaXNlZCk7XG5cdH1cblx0ZWxzZSB7XG5cdFx0bGV0IHRyaWdnZXIgPSByYXcudHJpZ2dlciBhcyBzdHJpbmc7XG5cdFx0Ly8gc3Vic3RpdHV0ZSBzbmlwcGV0IHZhcmlhYmxlc1xuXHRcdHRyaWdnZXIgPSBpbnNlcnRTbmlwcGV0VmFyaWFibGVzKHRyaWdnZXIsIHNuaXBwZXRWYXJpYWJsZXMpO1xuXG5cdFx0Ly8gZ2V0IGV4Y2x1ZGVkIGVudmlyb25tZW50KHMpIGZvciB0aGlzIHRyaWdnZXIsIGlmIGFueVxuXHRcdGV4Y2x1ZGVkRW52aXJvbm1lbnRzID0gZ2V0RXhjbHVkZWRFbnZpcm9ubWVudHModHJpZ2dlcik7XG5cblx0XHQvLyBub3JtYWxpemUgdmlzdWFsIHJlcGxhY2VtZW50c1xuXHRcdGlmICh0eXBlb2YgcmVwbGFjZW1lbnQgPT09IFwic3RyaW5nXCIgJiYgcmVwbGFjZW1lbnQuaW5jbHVkZXMoVklTVUFMX1NOSVBQRVRfTUFHSUNfU0VMRUNUSU9OX1BMQUNFSE9MREVSKSkge1xuXHRcdFx0b3B0aW9ucy52aXN1YWwgPSB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBub3JtYWxpemVkUmVwbGFjZW1lbnQ6IHN0cmluZyB8ICgobWF0Y2g6IHN0cmluZykgPT4gc3RyaW5nKSA9XG5cdFx0dHlwZW9mIHJlcGxhY2VtZW50ID09PSBcInN0cmluZ1wiXG5cdFx0XHQ/IHJlcGxhY2VtZW50XG5cdFx0XHQ6IChyZXBsYWNlbWVudCBhcyAoc2VsZWN0aW9uOiBzdHJpbmcpID0+IHN0cmluZyB8IGZhbHNlKS5sZW5ndGggPT09IDFcblx0XHRcdD8gKG1hdGNoOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gKHJlcGxhY2VtZW50IGFzIChzZWxlY3Rpb246IHN0cmluZykgPT4gc3RyaW5nIHwgZmFsc2UpKG1hdGNoKTtcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJSZXBsYWNlbWVudCBmdW5jdGlvbiByZXR1cm5lZCBmYWxzZSwgd2hpY2ggaXMgbm90IGFsbG93ZWQuXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHQ6IHJlcGxhY2VtZW50IGFzIChtYXRjaDogc3RyaW5nKSA9PiBzdHJpbmc7XG5cdFx0Y29uc3Qgbm9ybWFsaXNlZCA9IHtcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHRyZXBsYWNlbWVudDogbm9ybWFsaXplZFJlcGxhY2VtZW50LFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdHByaW9yaXR5LFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRleGNsdWRlZEVudmlyb25tZW50cyxcblx0XHR9O1xuXHRcdGlmIChvcHRpb25zLnZpc3VhbCkge1xuXHRcdFx0cmV0dXJuIG5ldyBWaXN1YWxTbmlwcGV0KG5vcm1hbGlzZWQpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiBuZXcgU3RyaW5nU25pcHBldChub3JtYWxpc2VkKTtcblx0XHR9XG5cdH1cbn1cblxuXG5cbi8qKlxuICogcmVtb3ZlcyBkdXBsaWNhdGUgZmxhZ3MgYW5kIGZpbHRlcnMgb3V0IGludmFsaWQgb25lcyBmcm9tIGEgZmxhZ3Mgc3RyaW5nLlxuICovXG5mdW5jdGlvbiBmaWx0ZXJGbGFncyhmbGFnczogc3RyaW5nKTogc3RyaW5nIHtcblx0Ly8gZmlsdGVyIG91dCBpbnZhbGlkIGZsYWdzXG5cdGNvbnN0IHZhbGlkRmxhZ3MgPSBbXG5cdFx0Ly8gXCJkXCIsIC8vIGRvZXNuJ3QgYWZmZWN0IHRoZSBzZWFyY2hcblx0XHQvLyBcImdcIiwgLy8gZG9lc24ndCBhZmZlY3QgdGhlIHBhdHRlcm4gbWF0Y2ggYW5kIGlzIGFsbW9zdCBjZXJ0YWlubHkgdW5kZXNpcmVkIGJlaGF2aW9yXG5cdFx0XCJpXCIsXG5cdFx0XCJtXCIsXG5cdFx0XCJzXCIsXG5cdFx0XCJ1XCIsXG5cdFx0XCJ2XCIsXG5cdFx0Ly8gXCJ5XCIsIC8vIGFsbW9zdCBjZXJ0YWlubHkgdW5kZXNpcmVkIGJlaGF2aW9yXG5cdF07XG5cdHJldHVybiBBcnJheS5mcm9tKG5ldyBTZXQoZmxhZ3Muc3BsaXQoXCJcIikpKVxuXHRcdFx0LmZpbHRlcihmbGFnID0+IHZhbGlkRmxhZ3MuaW5jbHVkZXMoZmxhZykpXG5cdFx0XHQuam9pbihcIlwiKTtcbn1cblxuZnVuY3Rpb24gaW5zZXJ0U25pcHBldFZhcmlhYmxlcyh0cmlnZ2VyOiBzdHJpbmcsIHZhcmlhYmxlczogU25pcHBldFZhcmlhYmxlcykge1xuXHRmb3IgKGNvbnN0IFt2YXJpYWJsZSwgcmVwbGFjZW1lbnRdIG9mIE9iamVjdC5lbnRyaWVzKHZhcmlhYmxlcykpIHtcblx0XHR0cmlnZ2VyID0gdHJpZ2dlci5yZXBsYWNlKHZhcmlhYmxlLCByZXBsYWNlbWVudCk7XG5cdH1cblxuXHRyZXR1cm4gdHJpZ2dlcjtcbn1cblxuZnVuY3Rpb24gZ2V0RXhjbHVkZWRFbnZpcm9ubWVudHModHJpZ2dlcjogc3RyaW5nKTogRW52aXJvbm1lbnRbXSB7XG5cdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRpZiAoRVhDTFVTSU9OUy5oYXNPd25Qcm9wZXJ0eSh0cmlnZ2VyKSkge1xuXHRcdHJlc3VsdC5wdXNoKEVYQ0xVU0lPTlNbdHJpZ2dlcl0pO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG4iXX0=