import type {
  CanvasPlugin,
  CanvasPluginCapabilities,
  CanvasPreferredTools,
} from "../core/plugin.js";

export const UNIVERSAL_BASELINE_TOOLS = [
  "get_canvas_state",
  "get_canvas_capabilities",
  "list_objects",
  "get_object",
  "delete_object",
  "clear_canvas",
  "save_canvas",
  "open_canvas",
  "screenshot",
  "get_selected_objects",
  "select_objects",
  "undo",
  "redo",
];

export const GENERIC_SHAPE_OBJECT_TOOLS = [
  "find_objects",
  "create_object",
  "apply_canvas_patch",
  "update_object",
  "set_canvas_background",
];

const UNIVERSAL_DESTRUCTIVE_TOOLS = ["delete_object", "clear_canvas", "open_canvas"];

const EMPTY_PREFERRED_TOOLS: CanvasPreferredTools = {
  inspect: [],
  create: [],
  update: [],
  connect: [],
  layout: [],
  file: [],
};

export interface CanvasCapabilitiesResponse {
  canvas: string;
  fileExtension: string;
  baselineTools: string[];
  genericObjectTools: string[];
  pluginTools: string[];
  destructiveTools: string[];
  preferredTools: CanvasPreferredTools;
  usageGuidance: string[];
}

export function getCanvasCapabilities(plugin: CanvasPlugin): CanvasCapabilitiesResponse {
  const pluginCapabilities = plugin.getCapabilities?.() ?? defaultPluginCapabilities();
  const genericObjectTools =
    plugin.createObject && plugin.updateObject ? [...GENERIC_SHAPE_OBJECT_TOOLS] : [];

  return {
    canvas: plugin.name,
    fileExtension: plugin.fileExtension,
    baselineTools: [...UNIVERSAL_BASELINE_TOOLS],
    genericObjectTools,
    pluginTools: [...pluginCapabilities.pluginTools],
    destructiveTools: uniqueTools([
      ...UNIVERSAL_DESTRUCTIVE_TOOLS,
      ...(pluginCapabilities.destructiveTools ?? []),
    ]),
    preferredTools: {
      ...EMPTY_PREFERRED_TOOLS,
      ...pluginCapabilities.preferredTools,
    },
    usageGuidance: [...pluginCapabilities.usageGuidance],
  };
}

function defaultPluginCapabilities(): CanvasPluginCapabilities {
  return {
    pluginTools: [],
    preferredTools: EMPTY_PREFERRED_TOOLS,
    usageGuidance: [
      "Call get_canvas_state first, then use baseline tools unless this canvas advertises plugin-specific tools.",
    ],
  };
}

function uniqueTools(tools: string[]): string[] {
  return [...new Set(tools)];
}
