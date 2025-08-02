import { Md5 } from "ts-md5";
import { Config, optimize, PluginConfig } from "svgo";

const fastSVGOConfigPlugins: PluginConfig[] = [
    { name: "cleanupAttrs" },
    { name: "removeDoctype" },
    { name: "removeComments" },
    { name: "removeMetadata" },
    { name: "removeTitle" },
    { name: "removeDesc" },
    { name: "removeEmptyAttrs" },
    { name: "removeEmptyText" },
    { name: "convertPathData", params: { floatPrecision: 3 } },
    { name: "cleanupNumericValues", params: { floatPrecision: 3 } },
]

const fullSVGOConfigPluginsAddOn: PluginConfig[] = [
    { name: "mergePaths" },
    { name: "convertTransform" },
    { name: "sortAttrs" },
    { name: "removeUnusedNS" },
    { name: "reusePaths" },
    { name: "removeDimensions" },
    { name: "removeOffCanvasPaths" },
]

function generatePrefix(svg: string): string {
    const hash = Md5.hashStr(svg.trim()).toString();
    const random = Math.random().toString(36).substring(2, 10);
    return hash + random;
}

export function optimizeSVG(svg: string, full: boolean): string {
    const config: Config = {
        multipass: full,
        plugins: [{ name: "prefixIds", params: { prefix: generatePrefix(svg) } }, ...fastSVGOConfigPlugins, ...(full ? fullSVGOConfigPluginsAddOn: [])],
    }
    try {
        const { width, height } = extractDimensions(svg);
        let optimizedSvg = optimize(svg, config).data;
        if (width && height ) {
            optimizedSvg = optimizedSvg.replace(/<svg/, `<svg width="${width}" height="${height}"`); // Ensure dimensions are preserved
        }
        return optimizedSvg;
    } catch (e) {
        console.warn("SVGO optimization failed:", e);
        return svg;
    }
}

function extractDimensions(svg: string): { width?: string; height?: string } {
    const headerMatch = svg.match(/<svg[^>]+>/i);
    if (!headerMatch) return {};

    const header = headerMatch[0];

    const widthMatch = header.match(/width="([^"]+)"/i);
    const heightMatch = header.match(/height="([^"]+)"/i);

    return {
        width: widthMatch?.[1],
        height: heightMatch?.[1],
    };
}
