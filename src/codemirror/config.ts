import { EditorView } from "@codemirror/view";
import { Facet, EditorState } from "@codemirror/state";
import { MosheCMSettings, DEFAULT_SETTINGS } from "src/settings/settings";
/*
export const latexSuiteConfig = Facet.define<MosheCMSettings, MosheCMSettings>({
    combine: (input) => {
        const settings = input.length > 0 ? input[0] : processMosheSettings([], DEFAULT_SETTINGS);
        return settings;
    }
});

export function getMosheConfig(viewOrState: EditorView | EditorState) {
    const state = viewOrState instanceof EditorView ? viewOrState.state : viewOrState;

    return state.facet(latexSuiteConfig);
}

export function getLatexSuiteConfigExtension(pluginSettings: MosheCMSettings) {
    return latexSuiteConfig.of(pluginSettings);
}*/