import { __awaiter } from "tslib";
import { z } from "zod";
import { encode } from "js-base64";
import { RegexSnippet, serializeSnippetLike, StringSnippet, VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER, VisualSnippet } from "./snippets";
import { Options } from "./options";
import { sortSnippets } from "./sort";
import { EXCLUSIONS } from "./environment";
function importRaw(maybeJavaScriptCode) {
    return __awaiter(this, void 0, void 0, function* () {
        let raw;
        try {
            try {
                // first, try to import as a plain js module
                // js-base64.encode is needed over builtin `window.btoa` because the latter errors on unicode
                raw = yield importModuleDefault(`data:text/javascript;base64,${encode(maybeJavaScriptCode)}`);
            }
            catch (_a) {
                // otherwise, try to import as a standalone js object
                raw = yield importModuleDefault(`data:text/javascript;base64,${encode(`export default ${maybeJavaScriptCode}`)}`);
            }
        }
        catch (e) {
            throw "Invalid format.";
        }
        return raw;
    });
}
export function parseSnippetVariables(snippetVariablesStr) {
    return __awaiter(this, void 0, void 0, function* () {
        const rawSnippetVariables = yield importRaw(snippetVariablesStr);
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
    });
}
export function parseSnippets(snippetsStr, snippetVariables) {
    return __awaiter(this, void 0, void 0, function* () {
        let rawSnippets = yield importRaw(snippetsStr);
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
    });
}
/** load snippet string as module */
/**
 * imports the default export of a given module.
 *
 * @param module the module to import. this can be a resource path, data url, etc
 * @returns the default export of said module
 * @throws if import fails or default export is undefined
 */
function importModuleDefault(module) {
    return __awaiter(this, void 0, void 0, function* () {
        let data;
        try {
            data = yield import(module);
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
    });
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
    var _a;
    const { replacement, priority, description } = raw;
    const options = Options.fromSource(raw.options);
    let trigger;
    let excludedEnvironments;
    // we have a regex snippet
    if (options.regex || raw.trigger instanceof RegExp) {
        let triggerStr;
        // normalize flags to a string
        let flags = (_a = raw.flags) !== null && _a !== void 0 ? _a : "";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvc25pcHBldHMvcGFyc2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxLQUFLLENBQUM7QUFDeEIsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUNuQyxPQUFPLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFXLGFBQWEsRUFBRSwwQ0FBMEMsRUFBRSxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDbkosT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUNwQyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3RDLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxlQUFlLENBQUM7QUFJeEQsU0FBZSxTQUFTLENBQUMsbUJBQTJCOztRQUNuRCxJQUFJLEdBQUcsQ0FBQztRQUNSLElBQUksQ0FBQztZQUNKLElBQUksQ0FBQztnQkFDSiw0Q0FBNEM7Z0JBQzVDLDZGQUE2RjtnQkFDN0YsR0FBRyxHQUFHLE1BQU0sbUJBQW1CLENBQUMsK0JBQStCLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUMvRixDQUFDO1lBQUMsV0FBTSxDQUFDO2dCQUNSLHFEQUFxRDtnQkFDckQsR0FBRyxHQUFHLE1BQU0sbUJBQW1CLENBQUMsK0JBQStCLE1BQU0sQ0FBQyxrQkFBa0IsbUJBQW1CLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNuSCxDQUFDO1FBQ0YsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDWixNQUFNLGlCQUFpQixDQUFDO1FBQ3pCLENBQUM7UUFDRCxPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7Q0FBQTtBQUVELE1BQU0sVUFBZ0IscUJBQXFCLENBQUMsbUJBQTJCOztRQUN0RSxNQUFNLG1CQUFtQixHQUFHLE1BQU0sU0FB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QUNqRSxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUM7QUFFRCxTQUFTLHVCQUF1QixDQUFDLE9BQWU7SUFDL0MsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDO0lBQ2xCLElBQUksVUFBVSxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHogfSBmcm9tIFwiem9kXCI7XHJcbmltcG9ydCB7IGVuY29kZSB9IGZyb20gXCJqcy1iYXNlNjRcIjtcclxuaW1wb3J0IHsgUmVnZXhTbmlwcGV0LCBzZXJpYWxpemVTbmlwcGV0TGlrZSwgU25pcHBldCwgU3RyaW5nU25pcHBldCwgVklTVUFMX1NOSVBQRVRfTUFHSUNfU0VMRUNUSU9OX1BMQUNFSE9MREVSLCBWaXN1YWxTbmlwcGV0IH0gZnJvbSBcIi4vc25pcHBldHNcIjtcclxuaW1wb3J0IHsgT3B0aW9ucyB9IGZyb20gXCIuL29wdGlvbnNcIjtcclxuaW1wb3J0IHsgc29ydFNuaXBwZXRzIH0gZnJvbSBcIi4vc29ydFwiO1xyXG5pbXBvcnQgeyBFWENMVVNJT05TLCBFbnZpcm9ubWVudCB9IGZyb20gXCIuL2Vudmlyb25tZW50XCI7XHJcblxyXG5leHBvcnQgdHlwZSBTbmlwcGV0VmFyaWFibGVzID0gUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIGltcG9ydFJhdyhtYXliZUphdmFTY3JpcHRDb2RlOiBzdHJpbmcpIHtcclxuXHRsZXQgcmF3O1xyXG5cdHRyeSB7XHJcblx0XHR0cnkge1xyXG5cdFx0XHQvLyBmaXJzdCwgdHJ5IHRvIGltcG9ydCBhcyBhIHBsYWluIGpzIG1vZHVsZVxyXG5cdFx0XHQvLyBqcy1iYXNlNjQuZW5jb2RlIGlzIG5lZWRlZCBvdmVyIGJ1aWx0aW4gYHdpbmRvdy5idG9hYCBiZWNhdXNlIHRoZSBsYXR0ZXIgZXJyb3JzIG9uIHVuaWNvZGVcclxuXHRcdFx0cmF3ID0gYXdhaXQgaW1wb3J0TW9kdWxlRGVmYXVsdChgZGF0YTp0ZXh0L2phdmFzY3JpcHQ7YmFzZTY0LCR7ZW5jb2RlKG1heWJlSmF2YVNjcmlwdENvZGUpfWApO1xyXG5cdFx0fSBjYXRjaCB7XHJcblx0XHRcdC8vIG90aGVyd2lzZSwgdHJ5IHRvIGltcG9ydCBhcyBhIHN0YW5kYWxvbmUganMgb2JqZWN0XHJcblx0XHRcdHJhdyA9IGF3YWl0IGltcG9ydE1vZHVsZURlZmF1bHQoYGRhdGE6dGV4dC9qYXZhc2NyaXB0O2Jhc2U2NCwke2VuY29kZShgZXhwb3J0IGRlZmF1bHQgJHttYXliZUphdmFTY3JpcHRDb2RlfWApfWApO1xyXG5cdFx0fVxyXG5cdH0gY2F0Y2ggKGUpIHtcclxuXHRcdHRocm93IFwiSW52YWxpZCBmb3JtYXQuXCI7XHJcblx0fVxyXG5cdHJldHVybiByYXc7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVNuaXBwZXRWYXJpYWJsZXMoc25pcHBldFZhcmlhYmxlc1N0cjogc3RyaW5nKSB7XHJcblx0Y29uc3QgcmF3U25pcHBldFZhcmlhYmxlcyA9IGF3YWl0IGltcG9ydFJhdyhzbmlwcGV0VmFyaWFibGVzU3RyKSBhcyBTbmlwcGV0VmFyaWFibGVzO1xyXG5cclxuXHRpZiAoQXJyYXkuaXNBcnJheShyYXdTbmlwcGV0VmFyaWFibGVzKSlcclxuXHRcdHRocm93IFwiQ2Fubm90IHBhcnNlIGFuIGFycmF5IGFzIGEgdmFyaWFibGVzIG9iamVjdFwiO1xyXG5cclxuXHRjb25zdCBzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzID0ge307XHJcblx0Zm9yIChjb25zdCBbdmFyaWFibGUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyYXdTbmlwcGV0VmFyaWFibGVzKSkge1xyXG5cdFx0aWYgKHZhcmlhYmxlLnN0YXJ0c1dpdGgoXCIke1wiKSkge1xyXG5cdFx0XHRpZiAoIXZhcmlhYmxlLmVuZHNXaXRoKFwifVwiKSkge1xyXG5cdFx0XHRcdHRocm93IGBJbnZhbGlkIHNuaXBwZXQgdmFyaWFibGUgbmFtZSAnJHt2YXJpYWJsZX0nOiBTdGFydHMgd2l0aCAnXFwkeycgYnV0IGRvZXMgbm90IGVuZCB3aXRoICd9Jy4gWW91IG5lZWQgdG8gaGF2ZSBib3RoIG9yIG5laXRoZXIuYDtcclxuXHRcdFx0fVxyXG5cdFx0XHRzbmlwcGV0VmFyaWFibGVzW3ZhcmlhYmxlXSA9IHZhbHVlO1xyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0aWYgKHZhcmlhYmxlLmVuZHNXaXRoKFwifVwiKSkge1xyXG5cdFx0XHRcdHRocm93IGBJbnZhbGlkIHNuaXBwZXQgdmFyaWFibGUgbmFtZSAnJHt2YXJpYWJsZX0nOiBFbmRzIHdpdGggJ30nIGJ1dCBkb2VzIG5vdCBzdGFydCB3aXRoICdcXCR7Jy4gWW91IG5lZWQgdG8gaGF2ZSBib3RoIG9yIG5laXRoZXIuYDtcclxuXHRcdFx0fVxyXG5cdFx0XHRzbmlwcGV0VmFyaWFibGVzW1wiJHtcIiArIHZhcmlhYmxlICsgXCJ9XCJdID0gdmFsdWU7XHJcblx0XHR9XHJcblx0fVxyXG5cdHJldHVybiBzbmlwcGV0VmFyaWFibGVzO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VTbmlwcGV0cyhzbmlwcGV0c1N0cjogc3RyaW5nLCBzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKSB7XHJcblx0bGV0IHJhd1NuaXBwZXRzID0gYXdhaXQgaW1wb3J0UmF3KHNuaXBwZXRzU3RyKSBhcyBSYXdTbmlwcGV0W107XHJcblxyXG5cdGxldCBwYXJzZWRTbmlwcGV0cztcclxuXHR0cnkge1xyXG5cdFx0Ly8gdmFsaWRhdGUgdGhlIHNoYXBlIG9mIHRoZSByYXcgc25pcHBldHNcclxuXHRcdHJhd1NuaXBwZXRzID0gdmFsaWRhdGVSYXdTbmlwcGV0cyhyYXdTbmlwcGV0cyk7XHJcblxyXG5cdFx0cGFyc2VkU25pcHBldHMgPSByYXdTbmlwcGV0cy5tYXAoKHJhdykgPT4ge1xyXG5cdFx0XHR0cnkge1xyXG5cdFx0XHRcdC8vIE5vcm1hbGl6ZSB0aGUgcmF3IHNuaXBwZXQgYW5kIGNvbnZlcnQgaXQgaW50byBhIFNuaXBwZXRcclxuXHRcdFx0XHRyZXR1cm4gcGFyc2VTbmlwcGV0KHJhdywgc25pcHBldFZhcmlhYmxlcyk7XHJcblx0XHRcdH0gY2F0Y2ggKGUpIHtcclxuXHRcdFx0XHQvLyBwcm92aWRlIGNvbnRleHQgb2Ygd2hpY2ggc25pcHBldCBlcnJvcmVkXHJcblx0XHRcdFx0dGhyb3cgYCR7ZX1cXG5FcnJvcmluZyBzbmlwcGV0OlxcbiR7c2VyaWFsaXplU25pcHBldExpa2UocmF3KX1gO1xyXG5cdFx0XHR9XHJcblx0XHR9KTtcclxuXHR9IGNhdGNoKGUpIHtcclxuXHRcdHRocm93IGBJbnZhbGlkIHNuaXBwZXQgZm9ybWF0OiAke2V9YDtcclxuXHR9XHJcblxyXG5cdHBhcnNlZFNuaXBwZXRzID0gc29ydFNuaXBwZXRzKHBhcnNlZFNuaXBwZXRzKTtcclxuXHRyZXR1cm4gcGFyc2VkU25pcHBldHM7XHJcbn1cclxuXHJcbi8qKiBsb2FkIHNuaXBwZXQgc3RyaW5nIGFzIG1vZHVsZSAqL1xyXG5cclxuLyoqXHJcbiAqIGltcG9ydHMgdGhlIGRlZmF1bHQgZXhwb3J0IG9mIGEgZ2l2ZW4gbW9kdWxlLlxyXG4gKlxyXG4gKiBAcGFyYW0gbW9kdWxlIHRoZSBtb2R1bGUgdG8gaW1wb3J0LiB0aGlzIGNhbiBiZSBhIHJlc291cmNlIHBhdGgsIGRhdGEgdXJsLCBldGNcclxuICogQHJldHVybnMgdGhlIGRlZmF1bHQgZXhwb3J0IG9mIHNhaWQgbW9kdWxlXHJcbiAqIEB0aHJvd3MgaWYgaW1wb3J0IGZhaWxzIG9yIGRlZmF1bHQgZXhwb3J0IGlzIHVuZGVmaW5lZFxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gaW1wb3J0TW9kdWxlRGVmYXVsdChtb2R1bGU6IHN0cmluZyk6IFByb21pc2U8dW5rbm93bj4ge1xyXG5cdGxldCBkYXRhO1xyXG5cdHRyeSB7XHJcblx0XHRkYXRhID0gYXdhaXQgaW1wb3J0KG1vZHVsZSk7XHJcblx0fSBjYXRjaCAoZSkge1xyXG5cdFx0dGhyb3cgYGZhaWxlZCB0byBpbXBvcnQgbW9kdWxlICR7bW9kdWxlfWA7XHJcblx0fVxyXG5cclxuXHQvLyBpdCdzIHNhZmUgdG8gdXNlIGBpbmAgaGVyZSAtIGl0IGhhcyBhIG51bGwgcHJvdG90eXBlLCBzbyBgT2JqZWN0Lmhhc093blByb3BlcnR5YCBpc24ndCBhdmFpbGFibGUsXHJcblx0Ly8gYnV0IG9uIHRoZSBvdGhlciBoYW5kIHdlIGRvbid0IG5lZWQgdG8gd29ycnkgYWJvdXQgc29tZXRoaW5nIGZ1cnRoZXIgdXAgdGhlIHByb3RvdHlwZSBjaGFpbiBtZXNzaW5nIHdpdGggdGhpcyBjaGVja1xyXG5cdGlmICghKFwiZGVmYXVsdFwiIGluIGRhdGEpKSB7XHJcblx0XHR0aHJvdyBgTm8gZGVmYXVsdCBleHBvcnQgcHJvdmlkZWQgZm9yIG1vZHVsZSAke21vZHVsZX1gO1xyXG5cdH1cclxuXHJcblx0cmV0dXJuIGRhdGEuZGVmYXVsdDtcclxufVxyXG5cclxuLyoqIHJhdyBzbmlwcGV0IElSICovXHJcblxyXG5jb25zdCBSYXdTbmlwcGV0U2NoZW1hID0gei5vYmplY3Qoe1xyXG4gICAgdHJpZ2dlcjogei51bmlvbihbei5zdHJpbmcoKSwgei5pbnN0YW5jZW9mKFJlZ0V4cCldKSxcclxuICAgIHJlcGxhY2VtZW50OiB6LnVuaW9uKFt6LnN0cmluZygpLCB6LmZ1bmN0aW9uKCldKSxcclxuICAgIG9wdGlvbnM6IHouc3RyaW5nKCksXHJcbiAgICBmbGFnczogei5zdHJpbmcoKS5vcHRpb25hbCgpLFxyXG4gICAgcHJpb3JpdHk6IHoubnVtYmVyKCkub3B0aW9uYWwoKSxcclxuICAgIGRlc2NyaXB0aW9uOiB6LnN0cmluZygpLm9wdGlvbmFsKCksXHJcbiAgfSk7XHJcblxyXG50eXBlIFJhd1NuaXBwZXQgPSB6LmluZmVyPHR5cGVvZiBSYXdTbmlwcGV0U2NoZW1hPjtcclxuXHJcbi8qKlxyXG4gKiB0cmllcyB0byBwYXJzZSBhbiB1bmtub3duIHZhbHVlIGFzIGFuIGFycmF5IG9mIHJhdyBzbmlwcGV0c1xyXG4gKiBAdGhyb3dzIGlmIHRoZSB2YWx1ZSBkb2VzIG5vdCBhZGhlcmUgdG8gdGhlIHJhdyBzbmlwcGV0IGFycmF5IHNjaGVtYVxyXG4gKi9cclxuZnVuY3Rpb24gdmFsaWRhdGVSYXdTbmlwcGV0cyhzbmlwcGV0czogdW5rbm93bik6IFJhd1NuaXBwZXRbXSB7XHJcbiAgaWYgKCFBcnJheS5pc0FycmF5KHNuaXBwZXRzKSkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgc25pcHBldHMgdG8gYmUgYW4gYXJyYXlcIik7XHJcbiAgfVxyXG5cclxuICByZXR1cm4gc25pcHBldHMubWFwKChyYXcsIGluZGV4KSA9PiB7XHJcbiAgICBjb25zdCB2YWxpZGF0aW9uUmVzdWx0ID0gUmF3U25pcHBldFNjaGVtYS5zYWZlUGFyc2UocmF3KTtcclxuXHJcbiAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuc3VjY2Vzcykge1xyXG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSB2YWxpZGF0aW9uUmVzdWx0LmVycm9yLmVycm9yc1xyXG4gICAgICAgIC5tYXAoKGVycm9yKSA9PiBgJHtlcnJvci5wYXRoLmpvaW4oXCIuXCIpfTogJHtlcnJvci5tZXNzYWdlfWApXHJcbiAgICAgICAgLmpvaW4oXCIsIFwiKTtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgIGBWYWx1ZSBkb2VzIG5vdCByZXNlbWJsZSBzbmlwcGV0IGF0IGluZGV4ICR7aW5kZXh9LlxcbkVycm9yczogJHtlcnJvck1lc3NhZ2V9XFxuRXJyb3Jpbmcgc25pcHBldDpcXG4ke0pTT04uc3RyaW5naWZ5KFxyXG4gICAgICAgICAgcmF3LFxyXG4gICAgICAgICAgbnVsbCxcclxuICAgICAgICAgIDJcclxuICAgICAgICApfWBcclxuICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdmFsaWRhdGlvblJlc3VsdC5kYXRhO1xyXG4gIH0pO1xyXG59XHJcblxyXG4vKipcclxuICogUGFyc2VzIGEgcmF3IHNuaXBwZXQuXHJcbiAqIFRoaXMgZG9lcyB0aGUgZm9sbG93aW5nOlxyXG4gKiAtIHNuaXBwZXQgdmFyaWFibGVzIGFyZSBzdWJzdGl0dXRlZCBpbnRvIHRoZSB0cmlnZ2VyXHJcbiAqIC0gYG9wdGlvbnMucmVnZXhgIGFuZCBgb3B0aW9ucy52aXN1YWxgIGFyZSBzZXQgcHJvcGVybHlcclxuICogLSBpZiBpdCBpcyBhIHJlZ2V4IHNuaXBwZXQsIHRoZSB0cmlnZ2VyIGlzIHJlcHJlc2VudGVkIGFzIGEgUmVnRXhwIGluc3RhbmNlIHdpdGggZmxhZ3Mgc2V0XHJcbiAqL1xyXG5mdW5jdGlvbiBwYXJzZVNuaXBwZXQocmF3OiBSYXdTbmlwcGV0LCBzbmlwcGV0VmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKTogU25pcHBldCB7XHJcblx0XHJcblx0Y29uc3QgeyByZXBsYWNlbWVudCwgcHJpb3JpdHksIGRlc2NyaXB0aW9uIH0gPSByYXc7XHJcblx0Y29uc3Qgb3B0aW9ucyA9IE9wdGlvbnMuZnJvbVNvdXJjZShyYXcub3B0aW9ucyk7XHJcblx0bGV0IHRyaWdnZXI7XHJcblx0bGV0IGV4Y2x1ZGVkRW52aXJvbm1lbnRzO1xyXG5cclxuXHQvLyB3ZSBoYXZlIGEgcmVnZXggc25pcHBldFxyXG5cdGlmIChvcHRpb25zLnJlZ2V4IHx8IHJhdy50cmlnZ2VyIGluc3RhbmNlb2YgUmVnRXhwKSB7XHJcblx0XHRsZXQgdHJpZ2dlclN0cjogc3RyaW5nO1xyXG5cdFx0Ly8gbm9ybWFsaXplIGZsYWdzIHRvIGEgc3RyaW5nXHJcblx0XHRsZXQgZmxhZ3MgPSByYXcuZmxhZ3MgPz8gXCJcIjtcclxuXHJcblx0XHQvLyBleHRyYWN0IHRyaWdnZXIgc3RyaW5nIGZyb20gdHJpZ2dlcixcclxuXHRcdC8vIGFuZCBtZXJnZSBmbGFncywgaWYgdHJpZ2dlciBpcyBhIHJlZ2V4cCBhbHJlYWR5XHJcblx0XHRpZiAocmF3LnRyaWdnZXIgaW5zdGFuY2VvZiBSZWdFeHApIHtcclxuXHRcdFx0dHJpZ2dlclN0ciA9IHJhdy50cmlnZ2VyLnNvdXJjZTtcclxuXHRcdFx0ZmxhZ3MgPSBgJHsocmF3LnRyaWdnZXIgYXMgUmVnRXhwKS5mbGFnc30ke2ZsYWdzfWA7XHJcblx0XHR9IGVsc2Uge1xyXG5cdFx0XHR0cmlnZ2VyU3RyID0gcmF3LnRyaWdnZXI7XHJcblx0XHR9XHJcblx0XHQvLyBmaWx0ZXIgb3V0IGludmFsaWQgZmxhZ3NcclxuXHRcdGZsYWdzID0gZmlsdGVyRmxhZ3MoZmxhZ3MpO1xyXG5cclxuXHRcdC8vIHN1YnN0aXR1dGUgc25pcHBldCB2YXJpYWJsZXNcclxuXHRcdHRyaWdnZXJTdHIgPSBpbnNlcnRTbmlwcGV0VmFyaWFibGVzKHRyaWdnZXJTdHIsIHNuaXBwZXRWYXJpYWJsZXMpO1xyXG5cclxuXHRcdC8vIGdldCBleGNsdWRlZCBlbnZpcm9ubWVudChzKSBmb3IgdGhpcyB0cmlnZ2VyLCBpZiBhbnlcclxuXHRcdGV4Y2x1ZGVkRW52aXJvbm1lbnRzID0gZ2V0RXhjbHVkZWRFbnZpcm9ubWVudHModHJpZ2dlclN0cik7XHJcblxyXG5cdFx0Ly8gQWRkICQgc28gcmVnZXggbWF0Y2hlcyBlbmQgb2Ygc3RyaW5nXHJcblx0XHQvLyBpLmUuIGxvb2sgZm9yIGEgbWF0Y2ggYXQgdGhlIGN1cnNvcidzIGN1cnJlbnQgcG9zaXRpb25cclxuXHRcdHRyaWdnZXJTdHIgPSBgJHt0cmlnZ2VyU3RyfSRgO1xyXG5cclxuXHRcdC8vIGNvbnZlcnQgdHJpZ2dlciBpbnRvIFJlZ0V4cCBpbnN0YW5jZVxyXG5cdFx0dHJpZ2dlciA9IG5ldyBSZWdFeHAodHJpZ2dlclN0ciwgZmxhZ3MpO1xyXG5cclxuXHRcdG9wdGlvbnMucmVnZXggPSB0cnVlO1xyXG5cclxuXHRcdGNvbnN0IG5vcm1hbGlzZWQgPSB7XHJcblx0XHRcdHRyaWdnZXIsXHJcblx0XHRcdHJlcGxhY2VtZW50OiByZXBsYWNlbWVudCBhcyBzdHJpbmcgfCAoKG1hdGNoOiBSZWdFeHBFeGVjQXJyYXkpID0+IHN0cmluZyksXHJcblx0XHRcdG9wdGlvbnMsXHJcblx0XHRcdHByaW9yaXR5LFxyXG5cdFx0XHRkZXNjcmlwdGlvbixcclxuXHRcdFx0ZXhjbHVkZWRFbnZpcm9ubWVudHMsXHJcblx0XHR9O1x0XHRcclxuXHRcdHJldHVybiBuZXcgUmVnZXhTbmlwcGV0KG5vcm1hbGlzZWQpO1xyXG5cdH1cclxuXHRlbHNlIHtcclxuXHRcdGxldCB0cmlnZ2VyID0gcmF3LnRyaWdnZXIgYXMgc3RyaW5nO1xyXG5cdFx0Ly8gc3Vic3RpdHV0ZSBzbmlwcGV0IHZhcmlhYmxlc1xyXG5cdFx0dHJpZ2dlciA9IGluc2VydFNuaXBwZXRWYXJpYWJsZXModHJpZ2dlciwgc25pcHBldFZhcmlhYmxlcyk7XHJcblxyXG5cdFx0Ly8gZ2V0IGV4Y2x1ZGVkIGVudmlyb25tZW50KHMpIGZvciB0aGlzIHRyaWdnZXIsIGlmIGFueVxyXG5cdFx0ZXhjbHVkZWRFbnZpcm9ubWVudHMgPSBnZXRFeGNsdWRlZEVudmlyb25tZW50cyh0cmlnZ2VyKTtcclxuXHJcblx0XHQvLyBub3JtYWxpemUgdmlzdWFsIHJlcGxhY2VtZW50c1xyXG5cdFx0aWYgKHR5cGVvZiByZXBsYWNlbWVudCA9PT0gXCJzdHJpbmdcIiAmJiByZXBsYWNlbWVudC5pbmNsdWRlcyhWSVNVQUxfU05JUFBFVF9NQUdJQ19TRUxFQ1RJT05fUExBQ0VIT0xERVIpKSB7XHJcblx0XHRcdG9wdGlvbnMudmlzdWFsID0gdHJ1ZTtcclxuXHRcdH1cclxuXHRcdGNvbnN0IG5vcm1hbGl6ZWRSZXBsYWNlbWVudDogc3RyaW5nIHwgKChtYXRjaDogc3RyaW5nKSA9PiBzdHJpbmcpID1cclxuXHRcdHR5cGVvZiByZXBsYWNlbWVudCA9PT0gXCJzdHJpbmdcIlxyXG5cdFx0XHQ/IHJlcGxhY2VtZW50XHJcblx0XHRcdDogKHJlcGxhY2VtZW50IGFzIChzZWxlY3Rpb246IHN0cmluZykgPT4gc3RyaW5nIHwgZmFsc2UpLmxlbmd0aCA9PT0gMVxyXG5cdFx0XHQ/IChtYXRjaDogc3RyaW5nKSA9PiB7XHJcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gKHJlcGxhY2VtZW50IGFzIChzZWxlY3Rpb246IHN0cmluZykgPT4gc3RyaW5nIHwgZmFsc2UpKG1hdGNoKTtcclxuXHRcdFx0XHRpZiAocmVzdWx0ID09PSBmYWxzZSkge1xyXG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiUmVwbGFjZW1lbnQgZnVuY3Rpb24gcmV0dXJuZWQgZmFsc2UsIHdoaWNoIGlzIG5vdCBhbGxvd2VkLlwiKTtcclxuXHRcdFx0XHR9XHJcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcclxuXHRcdFx0fVxyXG5cdFx0XHQ6IHJlcGxhY2VtZW50IGFzIChtYXRjaDogc3RyaW5nKSA9PiBzdHJpbmc7XHJcblx0XHRjb25zdCBub3JtYWxpc2VkID0ge1xyXG5cdFx0XHR0cmlnZ2VyLFxyXG5cdFx0XHRyZXBsYWNlbWVudDogbm9ybWFsaXplZFJlcGxhY2VtZW50LFxyXG5cdFx0XHRvcHRpb25zLFxyXG5cdFx0XHRwcmlvcml0eSxcclxuXHRcdFx0ZGVzY3JpcHRpb24sXHJcblx0XHRcdGV4Y2x1ZGVkRW52aXJvbm1lbnRzLFxyXG5cdFx0fTtcclxuXHRcdGlmIChvcHRpb25zLnZpc3VhbCkge1xyXG5cdFx0XHRyZXR1cm4gbmV3IFZpc3VhbFNuaXBwZXQobm9ybWFsaXNlZCk7XHJcblx0XHR9XHJcblx0XHRlbHNlIHtcclxuXHRcdFx0cmV0dXJuIG5ldyBTdHJpbmdTbmlwcGV0KG5vcm1hbGlzZWQpO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5cclxuXHJcblxyXG4vKipcclxuICogcmVtb3ZlcyBkdXBsaWNhdGUgZmxhZ3MgYW5kIGZpbHRlcnMgb3V0IGludmFsaWQgb25lcyBmcm9tIGEgZmxhZ3Mgc3RyaW5nLlxyXG4gKi9cclxuZnVuY3Rpb24gZmlsdGVyRmxhZ3MoZmxhZ3M6IHN0cmluZyk6IHN0cmluZyB7XHJcblx0Ly8gZmlsdGVyIG91dCBpbnZhbGlkIGZsYWdzXHJcblx0Y29uc3QgdmFsaWRGbGFncyA9IFtcclxuXHRcdC8vIFwiZFwiLCAvLyBkb2Vzbid0IGFmZmVjdCB0aGUgc2VhcmNoXHJcblx0XHQvLyBcImdcIiwgLy8gZG9lc24ndCBhZmZlY3QgdGhlIHBhdHRlcm4gbWF0Y2ggYW5kIGlzIGFsbW9zdCBjZXJ0YWlubHkgdW5kZXNpcmVkIGJlaGF2aW9yXHJcblx0XHRcImlcIixcclxuXHRcdFwibVwiLFxyXG5cdFx0XCJzXCIsXHJcblx0XHRcInVcIixcclxuXHRcdFwidlwiLFxyXG5cdFx0Ly8gXCJ5XCIsIC8vIGFsbW9zdCBjZXJ0YWlubHkgdW5kZXNpcmVkIGJlaGF2aW9yXHJcblx0XTtcclxuXHRyZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGZsYWdzLnNwbGl0KFwiXCIpKSlcclxuXHRcdFx0LmZpbHRlcihmbGFnID0+IHZhbGlkRmxhZ3MuaW5jbHVkZXMoZmxhZykpXHJcblx0XHRcdC5qb2luKFwiXCIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpbnNlcnRTbmlwcGV0VmFyaWFibGVzKHRyaWdnZXI6IHN0cmluZywgdmFyaWFibGVzOiBTbmlwcGV0VmFyaWFibGVzKSB7XHJcblx0Zm9yIChjb25zdCBbdmFyaWFibGUsIHJlcGxhY2VtZW50XSBvZiBPYmplY3QuZW50cmllcyh2YXJpYWJsZXMpKSB7XHJcblx0XHR0cmlnZ2VyID0gdHJpZ2dlci5yZXBsYWNlKHZhcmlhYmxlLCByZXBsYWNlbWVudCk7XHJcblx0fVxyXG5cclxuXHRyZXR1cm4gdHJpZ2dlcjtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0RXhjbHVkZWRFbnZpcm9ubWVudHModHJpZ2dlcjogc3RyaW5nKTogRW52aXJvbm1lbnRbXSB7XHJcblx0Y29uc3QgcmVzdWx0ID0gW107XHJcblx0aWYgKEVYQ0xVU0lPTlMuaGFzT3duUHJvcGVydHkodHJpZ2dlcikpIHtcclxuXHRcdHJlc3VsdC5wdXNoKEVYQ0xVU0lPTlNbdHJpZ2dlcl0pO1xyXG5cdH1cclxuXHRyZXR1cm4gcmVzdWx0O1xyXG59XHJcbiJdfQ==