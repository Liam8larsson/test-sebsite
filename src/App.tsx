import React, { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import {
  Plus,
  Trash2,
  Copy,
  Eye,
  Sparkles,
  Wand2,
  Tag,
  Box,
  ChevronRight,
  FileCode2,
  Zap,
  Image as ImageIcon,
  Grid3X3,
  MousePointerClick,
  Download,
  Package,
  FileJson,
} from "lucide-react";

type Direction = {
  index: number;
  textureX: number;
  textureY: number;
  textureWidth: number;
  textureHeight: number;
  label: string;
};

type ActionConfig = {
  id: string;
  name: string;
  tag: string;
  priority: number;
  scoreValue: number;
  directions: Direction[];
};

type ActionTriggerMode = "tag" | "scoreboard";
type TargetEntityKind = "entity" | "player";
type ViewerFilterMode = "tag" | "all_players";

type Config = {
  bpHeaderUuid: string;
  bpDataModuleUuid: string;
  bpScriptModuleUuid: string;
  rpHeaderUuid: string;
  rpResourceModuleUuid: string;
  projectName: string;
  namespace: string;
  entityId: string;
  packVersion: string;
  actionTriggerMode: ActionTriggerMode;
  actionScoreboardObjective: string;
  directionCount: number;
  targetEntityKind: TargetEntityKind;
  targetTag: string;
  viewerFilterMode: ViewerFilterMode;
  viewerTag: string;
  debugTag: string;
  singleSided: boolean;
  invulnerable: boolean;
  noAi: boolean;
  optimizeWrites: boolean;
  updateInterval: number;
  maxTrackDistance: number;
  scale: number;
  visibleBoundsWidth: number;
  visibleBoundsHeight: number;
  visibleBoundsOffsetY: number;
  spriteOriginX: number;
  spriteOriginY: number;
  spriteOriginZ: number;
  spriteWidth: number;
  spriteHeight: number;
  spriteDepth: number;
  textureWidth: number;
  textureHeight: number;
  debugArrowOffsetZ: number;
  actions: ActionConfig[];
};

type SheetMeta = {
  width: number;
  height: number;
  name: string;
};

const uid = () => crypto.randomUUID();

function makeDirections(count: number): Direction[] {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    textureX: i * 64,
    textureY: 0,
    textureWidth: 64,
    textureHeight: 64,
    label: "",
  }));
}

function makeAction(name: string, tag: string, priority: number, dirCount: number): ActionConfig {
  return {
    id: uid(),
    name,
    tag,
    priority,
    scoreValue: priority,
    directions: makeDirections(dirCount),
  };
}

const initialConfig: Config = {
  bpHeaderUuid: uid(),
  bpDataModuleUuid: uid(),
  bpScriptModuleUuid: uid(),
  rpHeaderUuid: uid(),
  rpResourceModuleUuid: uid(),
  projectName: "DS Monster Maker",
  namespace: "ds",
  entityId: "bill_dbg",
  packVersion: "1.0.0",
  actionTriggerMode: "tag",
  actionScoreboardObjective: "ds_action",
  directionCount: 8,
  targetEntityKind: "entity",
  targetTag: "ds_target",
  viewerFilterMode: "tag",
  viewerTag: "ds_viewer",
  debugTag: "ds_dbg",
  singleSided: true,
  invulnerable: true,
  noAi: true,
  optimizeWrites: true,
  updateInterval: 4,
  maxTrackDistance: 64,
  scale: 1,
  visibleBoundsWidth: 2.2,
  visibleBoundsHeight: 3.2,
  visibleBoundsOffsetY: 1.65,
  spriteOriginX: -8,
  spriteOriginY: 4,
  spriteOriginZ: -0.05,
  spriteWidth: 16,
  spriteHeight: 16,
  spriteDepth: 1,
  textureWidth: 512,
  textureHeight: 192,
  debugArrowOffsetZ: -0.6,
  actions: [
    makeAction("idle", "ds_idle", 1, 8),
    makeAction("walk", "ds_walk", 2, 8),
    makeAction("atk", "ds_atk", 3, 8),
  ],
};

function clampAngle(angle: number): number {
  let value = angle % 360;
  if (value < 0) value += 360;
  return value;
}

function dirFromAngle(angle: number, count: number): number {
  const step = 360 / count;
  return Math.floor((clampAngle(angle) + step / 2) / step) % count;
}

function dirLabel(index: number, count: number): string {
  if (count === 8) {
    return ["front", "front-right", "right", "back-right", "back", "back-left", "left", "front-left"][index] ?? `${index}`;
  }
  if (count === 4) {
    return ["front", "right", "back", "left"][index] ?? `${index}`;
  }
  if (count === 12) {
    return String(index);
  }
  return `dir_${index}`;
}

function packVersionArray(version: string): number[] {
  return version
    .split(".")
    .map((v) => Number(v) || 0)
    .slice(0, 3);
}

function enumMap(config: Config) {
  const sorted = [...config.actions].sort((a, b) => b.priority - a.priority);
  return sorted.map((action, idx) => ({ ...action, enumValue: idx + 1 }));
}

function getDefaultAction(config: Config) {
  const idle = config.actions.find((a) => a.name.toLowerCase() === "idle");
  if (idle) return idle;
  return [...config.actions].sort((a, b) => a.priority - b.priority)[0] ?? config.actions[0];
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function textureKey(actionName: string, i: number): string {
  return `${safeName(actionName)}_${i}`;
}

function coerceNumberInput(raw: string, prev: number): number {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") {
    return prev;
  }
  const next = Number(trimmed);
  return Number.isFinite(next) ? next : prev;
}

function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadZip(filename: string, files: Record<string, string | Blob>) {
  const zip = new JSZip();
  Object.entries(files).forEach(([path, content]) => zip.file(path, content));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function buildPackBlob(files: Record<string, string | Blob>) {
  const zip = new JSZip();
  Object.entries(files).forEach(([path, content]) => zip.file(path, content));
  return zip.generateAsync({ type: "blob" });
}

async function downloadMcaddon(filename: string, bpFiles: Record<string, string | Blob>, rpFiles: Record<string, string | Blob>) {
  const bpBlob = await buildPackBlob(bpFiles);
  const rpBlob = await buildPackBlob(rpFiles);
  const addonZip = new JSZip();
  addonZip.file(`${filename}_BP.mcpack`, bpBlob);
  addonZip.file(`${filename}_RP.mcpack`, rpBlob);
  const mcaddonBlob = await addonZip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(mcaddonBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.mcaddon`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildSummary(config: Config): string {
  const lines: string[] = [];
  lines.push(`# ${config.projectName}`);
  lines.push(`namespace: ${config.namespace}`);
  lines.push(`entity: ${config.namespace}:${config.entityId}`);
  lines.push(`directions: ${config.directionCount}`);
  lines.push(`target: ${config.targetEntityKind} / tag=${config.targetTag}`);
  lines.push(`viewer filter: ${config.viewerFilterMode}${config.viewerFilterMode === "tag" ? ` (${config.viewerTag})` : ""}`);
  lines.push(`action trigger: ${config.actionTriggerMode}${config.actionTriggerMode === "scoreboard" ? ` / objective=${config.actionScoreboardObjective}` : ""}`);
  lines.push(`debug tag: ${config.debugTag}`);
  lines.push(`single sided: ${config.singleSided ? "yes" : "no"}`);
  lines.push(`update interval: ${config.updateInterval}`);
  lines.push(`max track distance: ${config.maxTrackDistance}`);
  lines.push(`texture sheet: ${config.textureWidth} x ${config.textureHeight}`);
  lines.push(`sprite size: ${config.spriteWidth} x ${config.spriteHeight} x ${config.spriteDepth}`);
  lines.push("");
  enumMap(config).forEach((a) => {
    lines.push(`- ${a.name}: tag=${a.tag}, score=${a.scoreValue}, enum=${a.enumValue}, priority=${a.priority}`);
  });
  return lines.join(String.fromCharCode(10));
}

function buildManifestBP(config: Config): string {
  const version = packVersionArray(config.packVersion);
  return JSON.stringify(
    {
      format_version: 2,
      header: {
        name: `${config.projectName} BP`,
        description: "Generated billboard sprite monster BP",
        uuid: config.bpHeaderUuid,
        version,
        min_engine_version: [1, 21, 0],
      },
      modules: [
        { type: "data", uuid: config.bpDataModuleUuid, version },
        { type: "script", language: "javascript", entry: "scripts/main.js", uuid: config.bpScriptModuleUuid, version }
      ],
      dependencies: [{ module_name: "@minecraft/server", version: "2.6.0" }],
    },
    null,
    2,
  );
}

function buildManifestRP(config: Config): string {
  const version = packVersionArray(config.packVersion);
  return JSON.stringify(
    {
      format_version: 2,
      header: {
        name: `${config.projectName} RP`,
        description: "Generated billboard sprite monster RP",
        uuid: config.rpHeaderUuid,
        version,
        min_engine_version: [1, 21, 0],
      },
      modules: [{ type: "resources", uuid: config.rpResourceModuleUuid, version }],
    },
    null,
    2,
  );
}

function buildMainJs(config: Config): string {
  const ns = config.namespace;
  const fullId = `${ns}:${config.entityId}`;
  const mapped = enumMap(config);

  const lines: string[] = [];
  lines.push('import { system, world } from "@minecraft/server";');
  lines.push("");
  lines.push(`const BILLBOARD_ID = "${fullId}";`);
  lines.push(`const TARGET_TAG = "${config.targetTag}";`);
  lines.push(`const VIEWER_TAG = "${config.viewerTag}";`);
  lines.push(`const DEBUG_TAG = "${config.debugTag}";`);
  lines.push(`const UPDATE_INTERVAL = ${Math.max(1, config.updateInterval)};`);
  lines.push(`const MAX_TRACK_DISTANCE = ${Math.max(1, config.maxTrackDistance)};`);
  lines.push("");

  lines.push("function getTargets() {");
  if (config.targetEntityKind === "player") {
    lines.push('  return [...world.getPlayers()].filter((p) => p.hasTag(TARGET_TAG));');
  } else {
    lines.push('  return world.getDimension("overworld").getEntities({ tags: [TARGET_TAG] }).filter((e) => e.typeId !== "minecraft:player");');
  }
  lines.push("}");
  lines.push("");

  lines.push("function findBillboardFor(target, dimension) {");
  lines.push("  const targetId = target.id;");
  lines.push("  for (const entity of dimension.getEntities({ type: BILLBOARD_ID, maxDistance: 4, location: target.location })) {");
  lines.push('    try { if (entity.getDynamicProperty("targetId") === targetId) return entity; } catch {}');
  lines.push("  }");
  lines.push("  return null;");
  lines.push("}");
  lines.push("");

  lines.push("function ensureBillboard(target, dimension) {");
  lines.push("  let billboard = findBillboardFor(target, dimension);");
  lines.push("  if (!billboard) {");
  lines.push("    billboard = dimension.spawnEntity(BILLBOARD_ID, target.location);");
  lines.push('    billboard.setDynamicProperty("targetId", target.id);');
  lines.push("  }");
  lines.push("  return billboard;");
  lines.push("}");
  lines.push("");

  lines.push("function setIfChanged(entity, prop, value) {");
  if (config.optimizeWrites) {
    lines.push("  try {");
    lines.push("    if (entity.getProperty(prop) === value) return;");
    lines.push("  } catch {}");
  }
  lines.push("  try { entity.setProperty(prop, value); } catch {}");
  lines.push("}");
  lines.push("");

  lines.push("function syncBillboard(target, billboard) {");
  lines.push("  try {");
  lines.push("    const loc = target.location;");
  lines.push("    const rot = target.getRotation();");
  lines.push("    billboard.teleport(loc, {");
  lines.push("      dimension: billboard.dimension,");
  lines.push("      keepVelocity: false,");
  lines.push("      rotation: { x: 0, y: rot.y },");
  lines.push("    });");
  lines.push("  } catch {}");
  lines.push("");
  lines.push("  let nextAction = 0;");

  if (config.actionTriggerMode === "scoreboard") {
    lines.push("  let scoreValue = 0;");
    lines.push(`  try { const objective = world.scoreboard.getObjective("${config.actionScoreboardObjective}"); if (objective && target.scoreboardIdentity) scoreValue = objective.getScore(target.scoreboardIdentity) ?? 0; } catch {}`);
    mapped.forEach((a, idx) => {
      lines.push(`  ${idx === 0 ? "if" : "else if"} (scoreValue === ${a.scoreValue}) { nextAction = ${a.enumValue}; }`);
    });
  } else {
    mapped.forEach((a, idx) => {
      lines.push(`  ${idx === 0 ? "if" : "else if"} (target.hasTag("${a.tag}")) { nextAction = ${a.enumValue}; }`);
    });
  }

  lines.push(`  setIfChanged(billboard, "${ns}:a", nextAction);`);
  lines.push(`  setIfChanged(billboard, "${ns}:dbg", target.hasTag(DEBUG_TAG));`);
  lines.push("}");
  lines.push("");

  lines.push("function applyViewerFilter(billboard) {");
  lines.push("  for (const player of world.getPlayers()) {");
  if (config.viewerFilterMode === "tag") {
    lines.push("    if (!player.hasTag(VIEWER_TAG)) {");
    lines.push(`      player.setPropertyOverrideForEntity(billboard, "${ns}:show", false);`);
    lines.push("      continue;");
    lines.push("    }");
    lines.push(`    player.removePropertyOverrideForEntity(billboard, "${ns}:show");`);
  } else {
    lines.push(`    player.removePropertyOverrideForEntity(billboard, "${ns}:show");`);
  }
  lines.push("  }");
  lines.push("}");
  lines.push("");

  lines.push("system.runInterval(() => {");
  lines.push('  const dimension = world.getDimension("overworld");');
  lines.push("  const targets = [...getTargets()];");
  lines.push("  for (const target of targets) {");
  lines.push("    const billboard = ensureBillboard(target, dimension);");
  lines.push("    syncBillboard(target, billboard);");
  lines.push("    applyViewerFilter(billboard);");
  lines.push("  }");
  lines.push("  for (const billboard of dimension.getEntities({ type: BILLBOARD_ID })) {");
  lines.push('    const targetId = billboard.getDynamicProperty("targetId");');
  lines.push("    const targetStillExists = targets.some((t) => t.id === targetId && Math.abs(t.location.x - billboard.location.x) <= MAX_TRACK_DISTANCE && Math.abs(t.location.z - billboard.location.z) <= MAX_TRACK_DISTANCE);");
  lines.push("    if (!targetStillExists) { try { billboard.remove(); } catch {} }");
  lines.push("  }");
  lines.push("}, UPDATE_INTERVAL);");

return lines.join(String.fromCharCode(10));
}

function buildBpEntity(config: Config): string {
  const ns = config.namespace;
  const fullId = `${ns}:${config.entityId}`;
  const maxEnum = Math.max(0, ...enumMap(config).map((a) => a.enumValue));
  return JSON.stringify(
    {
      format_version: "1.21.0",
      "minecraft:entity": {
        description: {
          identifier: fullId,
          is_spawnable: true,
          is_summonable: true,
          is_experimental: false,
          properties: {
            [`${ns}:a`]: { type: "int", range: [0, maxEnum], default: 0, client_sync: true },
            [`${ns}:dbg`]: { type: "bool", default: false, client_sync: true },
            [`${ns}:show`]: { type: "bool", default: true, client_sync: true },
          },
        },
        components: {
          ...(config.noAi
            ? {
                "minecraft:behavior.float": {},
                "minecraft:physics": {},
                "minecraft:pushable": { is_pushable: false, is_pushable_by_piston: false },
              }
            : {}),
          "minecraft:scale": { value: config.scale },
          "minecraft:collision_box": { width: 0.1, height: 0.1 },
          "minecraft:movement": { value: 0 },
          "minecraft:health": { value: 20, max: 20 },
          ...(config.invulnerable ? { "minecraft:damage_sensor": { triggers: [{ cause: "all", deals_damage: false }] } } : {}),
          "minecraft:nameable": {},
          "minecraft:persistent": {},
        },
      },
    },
    null,
    2,
  );
}

function buildClientEntity(config: Config): string {
  const ns = config.namespace;
  const fullId = `${ns}:${config.entityId}`;
  const mapped = enumMap(config);
  const defaultAction = getDefaultAction(config);
  const defaultActionIndex = Math.max(0, mapped.findIndex((a) => a.id === defaultAction.id));
  const totalGeoCount = Math.max(1, mapped.length * config.directionCount);
  const geometryEntries: Record<string, string> = {};

  config.actions.forEach((action) => {
    action.directions.forEach((_, i) => {
      geometryEntries[textureKey(action.name, i)] = `geometry.${ns}.${safeName(config.entityId)}.${textureKey(action.name, i)}`;
    });
  });

  return JSON.stringify(
    {
      format_version: "1.10.0",
      "minecraft:client_entity": {
        description: {
          identifier: fullId,
          materials: { default: "entity_alphatest" },
          textures: { sheet: "textures/entity/spritesheet" },
          geometry: geometryEntries,
          animations: {
            face_camera: `animation.${ns}.face_camera`,
            body_fix: `animation.${ns}.body_fix`,
          },
          scripts: {
            animate: ["body_fix", "face_camera"],
            pre_animation: [
              `v.dir_count = ${config.directionCount};`,
              "v.step = 360.0 / v.dir_count;",
              "v.cam_yaw = q.rotation_to_camera(1);",
              "v.rel_yaw = v.cam_yaw - q.body_y_rotation;",
              "v.rel_yaw = v.rel_yaw < 0 ? v.rel_yaw + 360 : v.rel_yaw;",
              "v.rel_yaw = v.rel_yaw >= 360 ? v.rel_yaw - 360 : v.rel_yaw;",
              "v.dir_index = math.mod(math.floor((v.rel_yaw + v.step * 0.5) / v.step), v.dir_count);",
              `v.action_raw = q.has_property('${ns}:a') ? q.property('${ns}:a') : 0;`,
              `v.action_index = v.action_raw > 0 ? v.action_raw - 1 : ${defaultActionIndex};`,
              `v.geo_index = math.mod(v.action_index * v.dir_count + v.dir_index, ${totalGeoCount});`,
              `v.show_debug = q.property('${ns}:dbg');`,
              `v.show_billboard = q.has_property('${ns}:show') ? q.property('${ns}:show') : 1;`,
            ],
          },
          render_controllers: [`controller.render.${ns}.${safeName(config.entityId)}`],
        },
      },
    },
    null,
    2,
  );
}

function buildGeometry(config: Config): string {
  const entityName = safeName(config.entityId);
  const geometries = config.actions.flatMap((action) =>
    action.directions.map((dir, i) => {
      const northUv = { uv: [dir.textureX, dir.textureY], uv_size: [dir.textureWidth, dir.textureHeight] };
      const southUv = { uv: [dir.textureX + dir.textureWidth, dir.textureY], uv_size: [-dir.textureWidth, dir.textureHeight] };
      const spriteCube = {
        origin: [config.spriteOriginX, config.spriteOriginY, config.spriteOriginZ],
        size: [config.spriteWidth, config.spriteHeight, config.spriteDepth],
        uv: config.singleSided ? { north: northUv } : { north: northUv, south: southUv },
      };
      const arrowCube = {
        origin: [-1, config.spriteOriginY + config.spriteHeight + 1, config.debugArrowOffsetZ],
        size: [2, 6, 2],
        uv: { north: { uv: [0, 0], uv_size: [8, 8] } },
      };

      return {
        description: {
          identifier: `geometry.${config.namespace}.${entityName}.${textureKey(action.name, i)}`,
          texture_width: config.textureWidth,
          texture_height: config.textureHeight,
          visible_bounds_width: config.visibleBoundsWidth,
          visible_bounds_height: config.visibleBoundsHeight,
          visible_bounds_offset: [0, config.visibleBoundsOffsetY, 0],
        },
        bones: [
          { name: "root", pivot: [0, 0, 0] },
          { name: "sprite", parent: "root", pivot: [0, config.spriteOriginY + config.spriteHeight / 2, 0], cubes: [spriteCube] },
          { name: "debug_arrow", parent: "root", pivot: [0, config.spriteOriginY + config.spriteHeight, 0], cubes: [arrowCube] },
        ],
      };
    }),
  );

  return JSON.stringify(
    {
      format_version: "1.12.0",
      "minecraft:geometry": geometries,
    },
    null,
    2,
  );
}

function buildAnimations(config: Config): string {
  return JSON.stringify(
    {
      format_version: "1.8.0",
      animations: {
        [`animation.${config.namespace}.body_fix`]: { loop: true, bones: { root: { rotation: [0, "-q.body_y_rotation", 0] } } },
        [`animation.${config.namespace}.face_camera`]: { loop: true, bones: { sprite: { rotation: [0, "q.rotation_to_camera(1)", 0] } } },
      },
    },
    null,
    2,
  );
}

function buildRenderController(config: Config): string {
  const ns = config.namespace;
  const mapped = enumMap(config);
  const geometryArray = mapped.flatMap((action) =>
    action.directions.map((_, i) => `Geometry.${textureKey(action.name, i)}`),
  );

  return JSON.stringify(
    {
      format_version: "1.10.0",
      render_controllers: {
        [`controller.render.${ns}.${safeName(config.entityId)}`]: {
          arrays: {
            geometries: {
              "Array.geo_all": geometryArray,
            },
          },
          geometry: "Array.geo_all[v.geo_index]",
          materials: [{ "*": "Material.default" }],
          textures: ["Texture.sheet"],
          part_visibility: [{ sprite: "v.show_billboard" }, { debug_arrow: "v.show_debug" }],
        },
      },
    },
    null,
    2,
  );
}

function buildMaterials(config: Config): string {
  return JSON.stringify(
    {
      materials: {
        version: "1.0.0",
        [`${config.namespace}.sprite`]: {
          states: { DepthFunc: "LessEqual", DepthWrite: true, Cull: false, Blend: true },
          defines: ["USE_TEXTURE", "USE_ALPHA_TEST"],
        },
      },
    },
    null,
    2,
  );
}

function buildTexturePlan(config: Config): string {
  const rows: string[] = [];
  rows.push("spritesheet file: RP/textures/entity/spritesheet.png");
  rows.push("");

  enumMap(config).forEach((action) => {
    action.directions.forEach((dir, i) => {
      rows.push(`${textureKey(action.name, i)} => x:${dir.textureX}, y:${dir.textureY}, w:${dir.textureWidth}, h:${dir.textureHeight}`);
    });
  });

  return rows.join(String.fromCharCode(10));
}

function makeExportFiles(config: Config) {
  const entityName = safeName(config.entityId);
  const clientEntityName = `${config.namespace}.${entityName}`;
  const allFiles = {
    "export/config.json": JSON.stringify(config, null, 2),
    "export/summary.txt": buildSummary(config),
    "BP/manifest.json": buildManifestBP(config),
    [`BP/entities/${entityName}.json`]: buildBpEntity(config),
    "BP/scripts/main.js": buildMainJs(config),
    "RP/manifest.json": buildManifestRP(config),
    [`RP/entity/${entityName}.entity.json`]: buildClientEntity(config),
    [`RP/models/entity/${entityName}.geo.json`]: buildGeometry(config),
    [`RP/animations/${clientEntityName}.animations.json`]: buildAnimations(config),
    [`RP/render_controllers/${clientEntityName}.render_controllers.json`]: buildRenderController(config),
    [`RP/materials/${clientEntityName}.material.json`]: buildMaterials(config),
    "export/texture_plan.txt": buildTexturePlan(config),
  };

  const bpFiles = {
    "manifest.json": buildManifestBP(config),
    [`entities/${entityName}.json`]: buildBpEntity(config),
    "scripts/main.js": buildMainJs(config),
  };

  const rpFiles = {
    "manifest.json": buildManifestRP(config),
    [`entity/${entityName}.entity.json`]: buildClientEntity(config),
    [`models/entity/${entityName}.geo.json`]: buildGeometry(config),
    [`animations/${clientEntityName}.animations.json`]: buildAnimations(config),
    [`render_controllers/${clientEntityName}.render_controllers.json`]: buildRenderController(config),
    [`materials/${clientEntityName}.material.json`]: buildMaterials(config),
    "texture_plan.txt": buildTexturePlan(config),
  };

  return { allFiles, bpFiles, rpFiles };
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #d7dde7",
  borderRadius: 20,
  background: "#ffffff",
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  boxSizing: "border-box",
};

const buttonBase: React.CSSProperties = {
  border: "1px solid #cfd8e3",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const buttonPrimary: React.CSSProperties = {
  ...buttonBase,
  background: "#111827",
  color: "#fff",
  borderColor: "#111827",
};

function SimpleInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

function SimpleSelect(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode },
) {
  const { children, ...rest } = props;
  return (
    <select {...rest} style={{ ...inputStyle, ...(props.style || {}) }}>
      {children}
    </select>
  );
}

function SimpleButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; children: React.ReactNode },
) {
  const { primary, children, ...rest } = props;
  return (
    <button {...rest} style={primary ? buttonPrimary : buttonBase}>
      {children}
    </button>
  );
}

function SimpleTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...inputStyle, minHeight: 180, fontFamily: "monospace", ...(props.style || {}) }} />;
}

const BadgeBox = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      border: "1px solid #d7dde7",
      borderRadius: 999,
      padding: "6px 10px",
      fontSize: 12,
      background: "#f8fafc",
    }}
  >
    {children}
  </span>
);

function PreviewRing(props: { directionCount: number; previewAngle: number; activeIndex: number; actionName: string }) {
  const { directionCount, previewAngle, activeIndex, actionName } = props;
  const points = Array.from({ length: directionCount }, (_, i) => {
    const rad = (i / directionCount) * Math.PI * 2 - Math.PI / 2;
    return { i, x: 50 + Math.cos(rad) * 38, y: 50 + Math.sin(rad) * 38 };
  });

  return (
    <div style={{ ...panelStyle, position: "relative", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <BadgeBox>action: {actionName}</BadgeBox>
        <BadgeBox>dir {activeIndex}</BadgeBox>
      </div>
      <svg viewBox="0 0 100 100" style={{ width: "100%", maxWidth: 320, display: "block", margin: "0 auto" }}>
        <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="0.8" />
        {points.map((p) => (
          <g key={p.i}>
            <line x1="50" y1="50" x2={p.x} y2={p.y} stroke="rgba(0,0,0,0.15)" strokeWidth="0.6" />
            <circle cx={p.x} cy={p.y} r={p.i === activeIndex ? 5.3 : 4} fill="rgba(17,24,39,0.9)" opacity={p.i === activeIndex ? 1 : 0.28} />
            <text x={p.x} y={p.y + 0.8} textAnchor="middle" fontSize="3.1" fill="white">{p.i}</text>
          </g>
        ))}
        <circle cx="50" cy="50" r="9" fill="rgba(17,24,39,0.85)" />
        <line
          x1="50"
          y1="50"
          x2={50 + Math.cos((previewAngle - 90) * Math.PI / 180) * 24}
          y2={50 + Math.sin((previewAngle - 90) * Math.PI / 180) * 24}
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function SpriteCard({ config }: { config: Config }) {
  return (
    <div style={{ ...panelStyle, height: 320, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 64, borderTop: "1px solid #d7dde7", background: "#f1f5f9" }} />
      <div
        style={{
          width: `${config.spriteWidth * config.scale * 8}px`,
          height: `${config.spriteHeight * config.scale * 8}px`,
          border: "1px solid #cfd8e3",
          background: "#fff",
          position: "absolute",
          left: "50%",
          bottom: `${32 + config.spriteOriginY * 2}px`,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#64748b",
          fontSize: 12,
        }}
      >
        {config.singleSided ? "single-sided billboard" : "double-sided billboard"}
      </div>
    </div>
  );
}

function SheetPicker(props: {
  imageUrl: string;
  imageMeta: SheetMeta;
  zoom: number;
  setZoom: (v: number) => void;
  config: Config;
  selectedAction?: ActionConfig;
  selectedDirIndex: number;
  setSelectedDirIndex: (v: number) => void;
  onPickCell: (x: number, y: number) => void;
  onFillActionRow: () => void;
  onFillAllRows: () => void;
}) {
  const { imageUrl, imageMeta, zoom, setZoom, config, selectedAction, selectedDirIndex, setSelectedDirIndex, onPickCell, onFillActionRow, onFillAllRows } = props;

  if (!imageUrl) {
    return <div style={{ ...panelStyle, color: "#64748b" }}>스프라이트 시트를 업로드하면 여기서 UV를 맞출 수 있습니다.</div>;
  }

  const activeDir = selectedAction?.directions?.[selectedDirIndex];
  const cellW = activeDir?.textureWidth || 64;
  const cellH = activeDir?.textureHeight || 64;
  const displayW = imageMeta.width * zoom;
  const displayH = imageMeta.height * zoom;
  const cols = Math.max(1, Math.floor(imageMeta.width / cellW));
  const rows = Math.max(1, Math.floor(imageMeta.height / cellH));

  const overlays = config.actions.flatMap((action) =>
    action.directions.map((dir, dirIdx) => ({
      actionId: action.id,
      dirIndex: dirIdx,
      x: dir.textureX * zoom,
      y: dir.textureY * zoom,
      w: dir.textureWidth * zoom,
      h: dir.textureHeight * zoom,
      active: action.id === selectedAction?.id && dirIdx === selectedDirIndex,
      label: `${action.name}:${dirIdx}`,
    })),
  );

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    onPickCell(Math.floor(x / cellW) * cellW, Math.floor(y / cellH) * cellH);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <BadgeBox>sheet {imageMeta.width}×{imageMeta.height}</BadgeBox>
        <BadgeBox>cell {cellW}×{cellH}</BadgeBox>
        <BadgeBox>grid {cols}×{rows}</BadgeBox>
        <SimpleButton onClick={onFillActionRow}><Grid3X3 size={14} /> 현재 액션 자동 배치</SimpleButton>
        <SimpleButton onClick={onFillAllRows}><Grid3X3 size={14} /> 모든 액션 자동 배치</SimpleButton>
      </div>

      <div>
        <label style={labelStyle}>미리보기 확대</label>
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ ...panelStyle, padding: 12, overflow: "auto", maxHeight: 440 }}>
        <div style={{ position: "relative", width: displayW, height: displayH }}>
          <img
            src={imageUrl}
            alt="sprite sheet"
            style={{ width: displayW, height: displayH, display: "block", imageRendering: "pixelated" as const }}
          />
          <button
            type="button"
            onClick={handleClick}
            aria-label="pick uv cell"
            style={{ position: "absolute", inset: 0, background: "transparent", border: 0, cursor: "crosshair" }}
          />
          <svg
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            width={displayW}
            height={displayH}
            viewBox={`0 0 ${displayW} ${displayH}`}
          >
            {Array.from({ length: cols + 1 }, (_, i) => (
              <line key={`v-${i}`} x1={i * cellW * zoom} y1={0} x2={i * cellW * zoom} y2={displayH} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            ))}
            {Array.from({ length: rows + 1 }, (_, i) => (
              <line key={`h-${i}`} x1={0} y1={i * cellH * zoom} x2={displayW} y2={i * cellH * zoom} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
            ))}
            {overlays.map((o) => (
              <g key={`${o.actionId}-${o.dirIndex}`}>
                <rect
                  x={o.x}
                  y={o.y}
                  width={o.w}
                  height={o.h}
                  fill={o.active ? "rgba(59,130,246,0.24)" : "rgba(255,255,255,0.05)"}
                  stroke={o.active ? "rgba(59,130,246,0.95)" : "rgba(255,255,255,0.38)"}
                  strokeWidth={o.active ? "2" : "1"}
                />
                <text x={o.x + 4} y={o.y + 14} fill={o.active ? "#2563eb" : "rgba(255,255,255,0.9)"} fontSize="11">
                  {o.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>

      <div style={{ ...panelStyle, padding: 12, color: "#64748b", fontSize: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MousePointerClick size={14} />
          셀 클릭으로 UV 좌표를 빠르게 맞출 수 있고 자동 배치도 가능합니다.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        {selectedAction?.directions?.map((_, idx) => (
          <SimpleButton
            key={idx}
            onClick={() => setSelectedDirIndex(idx)}
            primary={idx === selectedDirIndex}
          >
            {dirLabel(idx, config.directionCount)}
          </SimpleButton>
        ))}
      </div>
    </div>
  );
}

export default function DSMaker() {
  const [config, setConfig] = useState<Config>(initialConfig);
  const [selectedActionId, setSelectedActionId] = useState(initialConfig.actions[0].id);
  const [selectedDirIndex, setSelectedDirIndex] = useState(0);
  const [previewMonsterYaw, setPreviewMonsterYaw] = useState(0);
  const [previewCameraAround, setPreviewCameraAround] = useState(0);
  const [sheetZoom, setSheetZoom] = useState(1);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetMeta, setSheetMeta] = useState<SheetMeta>({ width: 0, height: 0, name: "" });
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [exportingZip, setExportingZip] = useState(false);
  const [autoGapX, setAutoGapX] = useState(0);
  const [autoGapY, setAutoGapY] = useState(0);
  const [autoLayoutMode, setAutoLayoutMode] = useState<"dirs_x_actions_y" | "dirs_y_actions_x">("dirs_x_actions_y");
  const [bulkTexX, setBulkTexX] = useState(0);
  const [bulkTexY, setBulkTexY] = useState(0);
  const [bulkTexW, setBulkTexW] = useState(64);
  const [bulkTexH, setBulkTexH] = useState(64);

  useEffect(() => {
    return () => {
      if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    };
  }, [sheetUrl]);

  const selectedAction = useMemo(
    () => config.actions.find((a) => a.id === selectedActionId) ?? config.actions[0],
    [config.actions, selectedActionId],
  );
  const activeDirIndex = useMemo(
    () => dirFromAngle(previewCameraAround - previewMonsterYaw, config.directionCount),
    [previewCameraAround, previewMonsterYaw, config.directionCount],
  );

  const selfChecks = useMemo(
    () => [
      { name: "direction count >= 1", ok: config.directionCount >= 1 },
      { name: "has at least one action", ok: config.actions.length >= 1 },
      { name: "every action has correct direction slots", ok: config.actions.every((a) => a.directions.length === config.directionCount) },
      { name: "sprite depth > 0", ok: config.spriteDepth > 0 },
      { name: "texture size valid", ok: config.textureWidth > 0 && config.textureHeight > 0 },
      { name: "update interval >= 1", ok: config.updateInterval >= 1 },
    ],
    [config],
  );

  const exportBundles = useMemo(() => makeExportFiles(config), [config]);
  const exportFiles = exportBundles.allFiles;
  const summary = useMemo(() => buildSummary(config), [config]);
  const bpManifest = useMemo(() => buildManifestBP(config), [config]);
  const rpManifest = useMemo(() => buildManifestRP(config), [config]);
  const bpEntity = useMemo(() => buildBpEntity(config), [config]);
  const clientEntity = useMemo(() => buildClientEntity(config), [config]);
  const geometry = useMemo(() => buildGeometry(config), [config]);
  const animations = useMemo(() => buildAnimations(config), [config]);
  const renderController = useMemo(() => buildRenderController(config), [config]);
  const materials = useMemo(() => buildMaterials(config), [config]);
  const mainJs = useMemo(() => buildMainJs(config), [config]);
  const texturePlan = useMemo(() => buildTexturePlan(config), [config]);

  const updateConfig = (patch: Partial<Config>) => setConfig((prev) => ({ ...prev, ...patch }));
  const updateAction = (id: string, patch: Partial<ActionConfig>) =>
    setConfig((prev) => ({ ...prev, actions: prev.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const updateDir = (actionId: string, dirIndex: number, patch: Partial<Direction>) =>
    setConfig((prev) => ({
      ...prev,
      actions: prev.actions.map((a) =>
        a.id !== actionId ? a : { ...a, directions: a.directions.map((d, i) => (i === dirIndex ? { ...d, ...patch } : d)) },
      ),
    }));

  const updateDirectionCount = (count: number) => {
    setConfig((prev) => ({
      ...prev,
      directionCount: count,
      actions: prev.actions.map((a) => ({
        ...a,
        directions: Array.from({ length: count }, (_, i) => a.directions[i] ?? { index: i, textureX: i * 64, textureY: 0, textureWidth: 64, textureHeight: 64, label: "" }),
      })),
    }));
    setSelectedDirIndex(0);
  };

  const addAction = () => {
    const next = makeAction(`action_${config.actions.length + 1}`, `${config.namespace}_tag_${config.actions.length + 1}`, config.actions.length + 1, config.directionCount);
    setConfig((prev) => ({ ...prev, actions: [...prev.actions, next] }));
    setSelectedActionId(next.id);
    setSelectedDirIndex(0);
  };

  const duplicateAction = (action: ActionConfig) => {
    const copy: ActionConfig = {
      ...action,
      id: uid(),
      name: `${action.name}_copy`,
      tag: `${action.tag}_copy`,
      directions: action.directions.map((d) => ({ ...d })),
    };
    setConfig((prev) => ({ ...prev, actions: [...prev.actions, copy] }));
    setSelectedActionId(copy.id);
    setSelectedDirIndex(0);
  };

  const removeAction = (id: string) => {
    if (config.actions.length <= 1) return;
    const next = config.actions.filter((a) => a.id !== id);
    setConfig((prev) => ({ ...prev, actions: next }));
    setSelectedActionId(next[0].id);
    setSelectedDirIndex(0);
  };

  const handleSheetUpload = (file?: File) => {
    if (!file) return;
    if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    const nextUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setSheetMeta({ width: img.naturalWidth, height: img.naturalHeight, name: file.name });
      updateConfig({ textureWidth: img.naturalWidth, textureHeight: img.naturalHeight });
    };
    img.src = nextUrl;
    setSheetFile(file);
    setSheetUrl(nextUrl);
  };

  const pickCellForSelected = (x: number, y: number) => {
    if (!selectedAction) return;
    updateDir(selectedAction.id, selectedDirIndex, { textureX: x, textureY: y });
  };

  const getAutoPlacementBase = () => {
    const anchorDir = selectedAction?.directions?.[selectedDirIndex];
    const actionIndex = Math.max(0, config.actions.findIndex((a) => a.id === selectedAction?.id));
    return {
      startX: anchorDir?.textureX || 0,
      startY: anchorDir?.textureY || 0,
      cellW: anchorDir?.textureWidth || 64,
      cellH: anchorDir?.textureHeight || 64,
      anchorDirIndex: selectedDirIndex,
      anchorActionIndex: actionIndex,
    };
  };

  const getAutoPlacementPoint = (actionIndex: number, dirIndex: number) => {
    const base = getAutoPlacementBase();
    const dirOffset = dirIndex - base.anchorDirIndex;
    const actionOffset = actionIndex - base.anchorActionIndex;

    if (autoLayoutMode === "dirs_y_actions_x") {
      return {
        x: base.startX + actionOffset * (base.cellW + autoGapX),
        y: base.startY + dirOffset * (base.cellH + autoGapY),
      };
    }

    return {
      x: base.startX + dirOffset * (base.cellW + autoGapX),
      y: base.startY + actionOffset * (base.cellH + autoGapY),
    };
  };

  const autoFillCurrentAction = () => {
    if (!selectedAction) return;
    const selectedActionIndex = Math.max(0, config.actions.findIndex((a) => a.id === selectedAction.id));
    setConfig((prev) => ({
      ...prev,
      actions: prev.actions.map((action) =>
        action.id !== selectedAction.id
          ? action
          : {
              ...action,
              directions: action.directions.map((dir, i) => {
                const point = getAutoPlacementPoint(selectedActionIndex, i);
                return { ...dir, textureX: point.x, textureY: point.y };
              }),
            },
      ),
    }));
  };

  const autoFillAllActions = () => {
    setConfig((prev) => ({
      ...prev,
      actions: prev.actions.map((action, actionIndex) => ({
        ...action,
        directions: action.directions.map((dir, dirIndex) => {
          const point = getAutoPlacementPoint(actionIndex, dirIndex);
          return { ...dir, textureX: point.x, textureY: point.y };
        }),
      })),
    }));
  };

  const applyBulkToCurrentAction = () => {
    if (!selectedAction) return;
    setConfig((prev) => ({
      ...prev,
      actions: prev.actions.map((action) =>
        action.id !== selectedAction.id
          ? action
          : {
              ...action,
              directions: action.directions.map((dir) => ({
                ...dir,
                textureX: bulkTexX,
                textureY: bulkTexY,
                textureWidth: bulkTexW,
                textureHeight: bulkTexH,
              })),
            },
      ),
    }));
  };

  const applyBulkToAllActions = () => {
    setConfig((prev) => ({
      ...prev,
      actions: prev.actions.map((action) => ({
        ...action,
        directions: action.directions.map((dir) => ({
          ...dir,
          textureX: bulkTexX,
          textureY: bulkTexY,
          textureWidth: bulkTexW,
          textureHeight: bulkTexH,
        })),
      })),
    }));
  };

  const loadBulkFromSelectedSlot = () => {
    const dir = selectedAction?.directions?.[selectedDirIndex];
    if (!dir) return;
    setBulkTexX(dir.textureX);
    setBulkTexY(dir.textureY);
    setBulkTexW(dir.textureWidth);
    setBulkTexH(dir.textureHeight);
  };

  const handleExportConfig = () => {
    downloadText(`${safeName(config.projectName)}_config.json`, JSON.stringify(config, null, 2), "application/json;charset=utf-8");
  };

  const handleExportFilesJson = () => {
    downloadText(`${safeName(config.projectName)}_files.json`, JSON.stringify(exportFiles, null, 2), "application/json;charset=utf-8");
  };

  const handleExportZip = async () => {
    try {
      setExportingZip(true);
      const zipFiles: Record<string, string | Blob> = { ...exportFiles };
      if (sheetFile) {
        zipFiles["RP/textures/entity/spritesheet.png"] = sheetFile;
      } else {
        zipFiles["RP/textures/entity/PUT_spritesheet.png_HERE.txt"] = "Upload a spritesheet image in the website before exporting, or place your spritesheet.png here manually.";
      }
      await downloadZip(`${safeName(config.projectName)}_export.zip`, zipFiles);
    } finally {
      setExportingZip(false);
    }
  };

  const handleExportMcaddon = async () => {
    try {
      setExportingZip(true);
      const bpFiles: Record<string, string | Blob> = { ...exportBundles.bpFiles };
      const rpFiles: Record<string, string | Blob> = { ...exportBundles.rpFiles };
      if (sheetFile) {
        rpFiles["textures/entity/spritesheet.png"] = sheetFile;
      } else {
        rpFiles["textures/entity/PUT_spritesheet.png_HERE.txt"] = "Upload a spritesheet image in the website before exporting, or place your spritesheet.png here manually.";
      }
      await downloadMcaddon(safeName(config.projectName), bpFiles, rpFiles);
    } finally {
      setExportingZip(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(to bottom, #f8fafc, #eef2f7)", padding: 24, fontFamily: "Arial, sans-serif", color: "#111827" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "grid", gap: 24 }}>
        <div style={panelStyle}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid #d7dde7", borderRadius: 999, padding: "6px 12px", fontSize: 13, marginBottom: 12 }}>
            <Sparkles size={14} /> DS Monster Maker
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 30 }}>단면 빌보드 몹 간편 제작기</h1>
          <p style={{ margin: 0, color: "#64748b" }}>shadcn/ui 없이 바로 돌릴 수 있게 정리한 버전이며, 현재는 spritesheet.png 한 장을 기준으로 geometry UV를 바꿔 동작합니다.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, marginTop: 16 }}>
            <div><label style={labelStyle}>BP Header UUID</label><SimpleInput value={config.bpHeaderUuid} onChange={(e) => updateConfig({ bpHeaderUuid: e.target.value })} /></div>
            <div><label style={labelStyle}>BP Data UUID</label><SimpleInput value={config.bpDataModuleUuid} onChange={(e) => updateConfig({ bpDataModuleUuid: e.target.value })} /></div>
            <div><label style={labelStyle}>BP Script UUID</label><SimpleInput value={config.bpScriptModuleUuid} onChange={(e) => updateConfig({ bpScriptModuleUuid: e.target.value })} /></div>
            <div><label style={labelStyle}>RP Header UUID</label><SimpleInput value={config.rpHeaderUuid} onChange={(e) => updateConfig({ rpHeaderUuid: e.target.value })} /></div>
            <div><label style={labelStyle}>RP Module UUID</label><SimpleInput value={config.rpResourceModuleUuid} onChange={(e) => updateConfig({ rpResourceModuleUuid: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
            <SimpleButton primary onClick={handleExportMcaddon} disabled={exportingZip}><Package size={14} /> {exportingZip ? "패키징 중..." : "MCADDON 내보내기"}</SimpleButton>
            <SimpleButton onClick={handleExportZip} disabled={exportingZip}><Download size={14} /> ZIP 내보내기</SimpleButton>
            <SimpleButton onClick={handleExportConfig}><FileJson size={14} /> 설정 JSON 내보내기</SimpleButton>
            <SimpleButton onClick={handleExportFilesJson}><Download size={14} /> 파일맵 JSON 내보내기</SimpleButton>
            <BadgeBox>texture mode: single spritesheet</BadgeBox>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 24 }}>
          <div style={{ display: "grid", gap: 24 }}>
            <div style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
                <Wand2 size={18} /> 기본 설정
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
                <div><label style={labelStyle}>프로젝트 이름</label><SimpleInput value={config.projectName} onChange={(e) => updateConfig({ projectName: e.target.value })} /></div>
                <div><label style={labelStyle}>팩 버전</label><SimpleInput value={config.packVersion} onChange={(e) => updateConfig({ packVersion: e.target.value })} /></div>
                <div><label style={labelStyle}>네임스페이스</label><SimpleInput value={config.namespace} onChange={(e) => updateConfig({ namespace: e.target.value })} /></div>
                <div><label style={labelStyle}>엔티티 ID</label><SimpleInput value={config.entityId} onChange={(e) => updateConfig({ entityId: e.target.value })} /></div>
                <div><label style={labelStyle}>행동 전환 방식</label><SimpleSelect value={config.actionTriggerMode} onChange={(e) => updateConfig({ actionTriggerMode: e.target.value as ActionTriggerMode })}><option value="tag">태그</option><option value="scoreboard">스코어보드</option></SimpleSelect></div>
                <div><label style={labelStyle}>스코어보드 objective</label><SimpleInput value={config.actionScoreboardObjective} disabled={config.actionTriggerMode !== "scoreboard"} onChange={(e) => updateConfig({ actionScoreboardObjective: e.target.value })} /></div>
                <div><label style={labelStyle}>대상 종류</label><SimpleSelect value={config.targetEntityKind} onChange={(e) => updateConfig({ targetEntityKind: e.target.value as TargetEntityKind })}><option value="entity">일반 엔티티</option><option value="player">플레이어</option></SimpleSelect></div>
                <div><label style={labelStyle}>대상 태그</label><SimpleInput value={config.targetTag} onChange={(e) => updateConfig({ targetTag: e.target.value })} /></div>
                <div><label style={labelStyle}>보는 쪽 필터</label><SimpleSelect value={config.viewerFilterMode} onChange={(e) => updateConfig({ viewerFilterMode: e.target.value as ViewerFilterMode })}><option value="tag">태그</option><option value="all_players">모든 플레이어</option></SimpleSelect></div>
                <div><label style={labelStyle}>보는 플레이어 태그</label><SimpleInput value={config.viewerTag} onChange={(e) => updateConfig({ viewerTag: e.target.value })} /></div>
                <div><label style={labelStyle}>디버그 태그</label><SimpleInput value={config.debugTag} onChange={(e) => updateConfig({ debugTag: e.target.value })} /></div>
                <div><label style={labelStyle}>전체 배율</label><SimpleInput type="number" step="0.1" value={config.scale} onChange={(e) => updateConfig({ scale: coerceNumberInput(e.target.value, config.scale) })} /></div>
                <div style={{ gridColumn: "1 / span 2" }}>
                  <label style={labelStyle}>방향 수</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {[4, 8, 12].map((n) => (
                      <SimpleButton key={n} primary={config.directionCount === n} onClick={() => updateDirectionCount(n)}>
                        {n}
                      </SimpleButton>
                    ))}
                    <SimpleInput type="number" min={1} value={config.directionCount} onChange={(e) => updateDirectionCount(Math.max(1, Number(e.target.value) || 1))} style={{ maxWidth: 100 }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
                <Zap size={18} /> 최적화 / 렌더 설정
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
                <div><label style={labelStyle}>업데이트 주기(틱)</label><SimpleInput type="number" min={1} value={config.updateInterval} onChange={(e) => updateConfig({ updateInterval: Math.max(1, coerceNumberInput(e.target.value, config.updateInterval)) })} /></div>
                <div><label style={labelStyle}>최대 추적 거리</label><SimpleInput type="number" min={1} value={config.maxTrackDistance} onChange={(e) => updateConfig({ maxTrackDistance: Math.max(1, coerceNumberInput(e.target.value, config.maxTrackDistance)) })} /></div>
                <div><label style={labelStyle}>단면 빌보드</label><SimpleSelect value={config.singleSided ? "yes" : "no"} onChange={(e) => updateConfig({ singleSided: e.target.value === "yes" })}><option value="yes">예</option><option value="no">아니오</option></SimpleSelect></div>
                <div><label style={labelStyle}>변경 시에만 쓰기</label><SimpleSelect value={config.optimizeWrites ? "yes" : "no"} onChange={(e) => updateConfig({ optimizeWrites: e.target.value === "yes" })}><option value="yes">예</option><option value="no">아니오</option></SimpleSelect></div>
                <div><label style={labelStyle}>무적</label><SimpleSelect value={config.invulnerable ? "yes" : "no"} onChange={(e) => updateConfig({ invulnerable: e.target.value === "yes" })}><option value="yes">예</option><option value="no">아니오</option></SimpleSelect></div>
                <div><label style={labelStyle}>AI 제거</label><SimpleSelect value={config.noAi ? "yes" : "no"} onChange={(e) => updateConfig({ noAi: e.target.value === "yes" })}><option value="yes">예</option><option value="no">아니오</option></SimpleSelect></div>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
                <Box size={18} /> 스프라이트 판 / 디버그
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
                <div>
                  <label style={labelStyle}>origin X / Y / Z</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    <SimpleInput type="number" step="0.01" value={config.spriteOriginX} onChange={(e) => updateConfig({ spriteOriginX: coerceNumberInput(e.target.value, config.spriteOriginX) })} />
                    <SimpleInput type="number" step="0.01" value={config.spriteOriginY} onChange={(e) => updateConfig({ spriteOriginY: coerceNumberInput(e.target.value, config.spriteOriginY) })} />
                    <SimpleInput type="number" step="0.01" value={config.spriteOriginZ} onChange={(e) => updateConfig({ spriteOriginZ: coerceNumberInput(e.target.value, config.spriteOriginZ) })} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>size W / H / D</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    <SimpleInput type="number" value={config.spriteWidth} onChange={(e) => updateConfig({ spriteWidth: coerceNumberInput(e.target.value, config.spriteWidth) })} />
                    <SimpleInput type="number" value={config.spriteHeight} onChange={(e) => updateConfig({ spriteHeight: coerceNumberInput(e.target.value, config.spriteHeight) })} />
                    <SimpleInput type="number" step="0.1" value={config.spriteDepth} onChange={(e) => updateConfig({ spriteDepth: coerceNumberInput(e.target.value, config.spriteDepth) })} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>visible bounds</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    <SimpleInput type="number" step="0.1" value={config.visibleBoundsWidth} onChange={(e) => updateConfig({ visibleBoundsWidth: coerceNumberInput(e.target.value, config.visibleBoundsWidth) })} />
                    <SimpleInput type="number" step="0.1" value={config.visibleBoundsHeight} onChange={(e) => updateConfig({ visibleBoundsHeight: coerceNumberInput(e.target.value, config.visibleBoundsHeight) })} />
                    <SimpleInput type="number" step="0.1" value={config.visibleBoundsOffsetY} onChange={(e) => updateConfig({ visibleBoundsOffsetY: coerceNumberInput(e.target.value, config.visibleBoundsOffsetY) })} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>텍스처 시트 W / H</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                    <SimpleInput type="number" value={config.textureWidth} onChange={(e) => updateConfig({ textureWidth: coerceNumberInput(e.target.value, config.textureWidth) })} />
                    <SimpleInput type="number" value={config.textureHeight} onChange={(e) => updateConfig({ textureHeight: coerceNumberInput(e.target.value, config.textureHeight) })} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>디버그 화살표 Z 오프셋</label>
                  <SimpleInput type="number" step="0.01" value={config.debugArrowOffsetZ} onChange={(e) => updateConfig({ debugArrowOffsetZ: coerceNumberInput(e.target.value, config.debugArrowOffsetZ) })} />
                </div>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
                  <Tag size={18} /> 액션 / 방향별 시트 좌표
                </div>
                <SimpleButton onClick={addAction}><Plus size={14} /> 액션 추가</SimpleButton>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {config.actions.map((a) => (
                  <SimpleButton key={a.id} primary={selectedAction?.id === a.id} onClick={() => { setSelectedActionId(a.id); setSelectedDirIndex(0); }}>
                    {a.name}
                  </SimpleButton>
                ))}
              </div>

              {selectedAction && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: 14, marginBottom: 16 }}>
                    <div><label style={labelStyle}>액션 이름</label><SimpleInput value={selectedAction.name} onChange={(e) => updateAction(selectedAction.id, { name: e.target.value })} /></div>
                    <div>
                      <label style={labelStyle}>{config.actionTriggerMode === "scoreboard" ? "스코어 값" : "태그"}</label>
                      {config.actionTriggerMode === "scoreboard" ? (
                        <SimpleInput type="number" value={selectedAction.scoreValue} onChange={(e) => updateAction(selectedAction.id, { scoreValue: coerceNumberInput(e.target.value, selectedAction.scoreValue) })} />
                      ) : (
                        <SimpleInput value={selectedAction.tag} onChange={(e) => updateAction(selectedAction.id, { tag: e.target.value })} />
                      )}
                    </div>
                    <div><label style={labelStyle}>우선순위</label><SimpleInput type="number" value={selectedAction.priority} onChange={(e) => updateAction(selectedAction.id, { priority: coerceNumberInput(e.target.value, selectedAction.priority) })} /></div>
                    <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                      <SimpleButton onClick={() => duplicateAction(selectedAction)}><Copy size={14} /> 복제</SimpleButton>
                      <SimpleButton onClick={() => removeAction(selectedAction.id)}><Trash2 size={14} /> 삭제</SimpleButton>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {selectedAction.directions.map((dir, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "90px 110px 110px 110px 110px 1fr",
                          gap: 10,
                          padding: 12,
                          border: "1px solid #d7dde7",
                          borderRadius: 16,
                          boxShadow: idx === selectedDirIndex ? "0 0 0 2px rgba(59,130,246,0.2) inset" : "none",
                        }}
                      >
                        <SimpleButton primary={idx === selectedDirIndex} onClick={() => setSelectedDirIndex(idx)}>
                          {dirLabel(idx, config.directionCount)}
                        </SimpleButton>
                        <div><label style={labelStyle}>tex X</label><SimpleInput type="number" value={dir.textureX} onChange={(e) => updateDir(selectedAction.id, idx, { textureX: coerceNumberInput(e.target.value, dir.textureX) })} /></div>
                        <div><label style={labelStyle}>tex Y</label><SimpleInput type="number" value={dir.textureY} onChange={(e) => updateDir(selectedAction.id, idx, { textureY: coerceNumberInput(e.target.value, dir.textureY) })} /></div>
                        <div><label style={labelStyle}>tex W</label><SimpleInput type="number" value={dir.textureWidth} onChange={(e) => updateDir(selectedAction.id, idx, { textureWidth: coerceNumberInput(e.target.value, dir.textureWidth) })} /></div>
                        <div><label style={labelStyle}>tex H</label><SimpleInput type="number" value={dir.textureHeight} onChange={(e) => updateDir(selectedAction.id, idx, { textureHeight: coerceNumberInput(e.target.value, dir.textureHeight) })} /></div>
                        <div><label style={labelStyle}>메모</label><SimpleInput value={dir.label} onChange={(e) => updateDir(selectedAction.id, idx, { label: e.target.value })} placeholder="front, back-right ..." /></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
                <ImageIcon size={18} /> 스프라이트 시트 / UV 맞추기
              </div>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "end" }}>
                  <div><label style={labelStyle}>시트 이미지 업로드</label><SimpleInput type="file" accept="image/*" onChange={(e) => handleSheetUpload(e.target.files?.[0] || undefined)} /></div>
                  <BadgeBox>선택 슬롯: {selectedAction?.name} / {dirLabel(selectedDirIndex, config.directionCount)}</BadgeBox>
                </div>

                <div style={{ ...panelStyle, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 12 }}>
                    <Grid3X3 size={16} /> UV 자동화
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>자동 배치 모드</label>
                      <SimpleSelect value={autoLayoutMode} onChange={(e) => setAutoLayoutMode(e.target.value as "dirs_x_actions_y" | "dirs_y_actions_x")}>
                        <option value="dirs_x_actions_y">방향 가로 / 액션 세로</option>
                        <option value="dirs_y_actions_x">방향 세로 / 액션 가로</option>
                      </SimpleSelect>
                    </div>
                    <div>
                      <label style={labelStyle}>칸 간격 X</label>
                      <SimpleInput type="number" value={autoGapX} onChange={(e) => setAutoGapX(coerceNumberInput(e.target.value, autoGapX))} />
                    </div>
                    <div>
                      <label style={labelStyle}>칸 간격 Y</label>
                      <SimpleInput type="number" value={autoGapY} onChange={(e) => setAutoGapY(coerceNumberInput(e.target.value, autoGapY))} />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <BadgeBox>기준점: 현재 선택 슬롯의 UV</BadgeBox>
                    <BadgeBox>현재 dir: {selectedDirIndex}</BadgeBox>
                    <BadgeBox>gap: {autoGapX}, {autoGapY}</BadgeBox>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <SimpleButton onClick={autoFillCurrentAction}><Grid3X3 size={14} /> 현재 액션 자동 배치</SimpleButton>
                    <SimpleButton onClick={autoFillAllActions}><Grid3X3 size={14} /> 전체 액션 자동 배치</SimpleButton>
                  </div>
                </div>

                <div style={{ ...panelStyle, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 12 }}>
                    <FileJson size={16} /> UV 일괄 변경
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                    <div>
                      <label style={labelStyle}>tex X</label>
                      <SimpleInput type="number" value={bulkTexX} onChange={(e) => setBulkTexX(coerceNumberInput(e.target.value, bulkTexX))} />
                    </div>
                    <div>
                      <label style={labelStyle}>tex Y</label>
                      <SimpleInput type="number" value={bulkTexY} onChange={(e) => setBulkTexY(coerceNumberInput(e.target.value, bulkTexY))} />
                    </div>
                    <div>
                      <label style={labelStyle}>tex W</label>
                      <SimpleInput type="number" value={bulkTexW} onChange={(e) => setBulkTexW(coerceNumberInput(e.target.value, bulkTexW))} />
                    </div>
                    <div>
                      <label style={labelStyle}>tex H</label>
                      <SimpleInput type="number" value={bulkTexH} onChange={(e) => setBulkTexH(coerceNumberInput(e.target.value, bulkTexH))} />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <SimpleButton onClick={loadBulkFromSelectedSlot}><Copy size={14} /> 선택 슬롯 값 가져오기</SimpleButton>
                    <SimpleButton onClick={applyBulkToCurrentAction}><Tag size={14} /> 현재 액션 전체 적용</SimpleButton>
                    <SimpleButton onClick={applyBulkToAllActions}><Package size={14} /> 전체 액션 전체 적용</SimpleButton>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    <BadgeBox>현재 값: {bulkTexX}, {bulkTexY}, {bulkTexW}, {bulkTexH}</BadgeBox>
                  </div>
                </div>
                <SheetPicker
                  imageUrl={sheetUrl}
                  imageMeta={sheetMeta}
                  zoom={sheetZoom}
                  setZoom={setSheetZoom}
                  config={config}
                  selectedAction={selectedAction}
                  selectedDirIndex={selectedDirIndex}
                  setSelectedDirIndex={setSelectedDirIndex}
                  onPickCell={pickCellForSelected}
                  onFillActionRow={autoFillCurrentAction}
                  onFillAllRows={autoFillAllActions}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 24 }}>
            <div style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
                <Eye size={18} /> 미리보기
              </div>
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <label style={labelStyle}>대상 body yaw</label>
                  <input type="range" min={0} max={359} value={previewMonsterYaw} onChange={(e) => setPreviewMonsterYaw(Number(e.target.value))} style={{ width: "100%" }} />
                  <div style={{ fontSize: 12, color: "#64748b" }}>{Math.round(previewMonsterYaw)}°</div>
                </div>
                <div>
                  <label style={labelStyle}>카메라가 대상을 보는 각도</label>
                  <input type="range" min={0} max={359} value={previewCameraAround} onChange={(e) => setPreviewCameraAround(Number(e.target.value))} style={{ width: "100%" }} />
                  <div style={{ fontSize: 12, color: "#64748b" }}>{Math.round(previewCameraAround)}°</div>
                </div>
                <PreviewRing directionCount={config.directionCount} previewAngle={previewCameraAround} activeIndex={activeDirIndex} actionName={selectedAction?.name ?? "idle"} />
                <SpriteCard config={config} />
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>선택 방향 인덱스</span><BadgeBox>{activeDirIndex}</BadgeBox></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span>현재 액션 기준</span><BadgeBox>{config.actionTriggerMode === "scoreboard" ? `${config.actionScoreboardObjective}=${selectedAction?.scoreValue}` : selectedAction?.tag}</BadgeBox></div>
                </div>
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
                <Zap size={18} /> 자체 점검
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {selfChecks.map((check) => (
                  <div key={check.name} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #d7dde7", borderRadius: 12, padding: 12 }}>
                    <span>{check.name}</span>
                    <BadgeBox>{check.ok ? "PASS" : "FAIL"}</BadgeBox>
                  </div>
                ))}
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 16 }}>
                <FileCode2 size={18} /> 실제 파일 내보내기 미리보기
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <SimpleTextarea readOnly value={summary} />
                <SimpleTextarea readOnly value={bpManifest} />
                <SimpleTextarea readOnly value={rpManifest} />
                <SimpleTextarea readOnly value={mainJs} />
                <SimpleTextarea readOnly value={bpEntity} />
                <SimpleTextarea readOnly value={clientEntity} />
                <SimpleTextarea readOnly value={geometry} />
                <SimpleTextarea readOnly value={animations} />
                <SimpleTextarea readOnly value={renderController} />
                <SimpleTextarea readOnly value={materials} />
                <SimpleTextarea readOnly value={texturePlan} />
              </div>
            </div>

            <div style={panelStyle}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>작업 흐름</div>
              <div style={{ display: "grid", gap: 10, color: "#64748b", fontSize: 14 }}>
                <div style={{ display: "flex", gap: 8 }}><ChevronRight size={16} /> 대상은 태그된 플레이어/엔티티를 추적하는 빌보드 엔티티 방식입니다.</div>
                <div style={{ display: "flex", gap: 8 }}><ChevronRight size={16} /> 행동 전환은 태그 또는 스코어보드 중 하나만 씁니다.</div>
                <div style={{ display: "flex", gap: 8 }}><ChevronRight size={16} /> 상단의 내보내기 버튼으로 설정 JSON 또는 전체 파일 ZIP을 받을 수 있습니다.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
