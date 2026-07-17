#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: node render-excalidraw.mjs <diagram.json> <output-dir> [--force]";
const supportedTypes = new Set(["rectangle", "ellipse", "diamond", "text", "arrow", "line"]);
const internalElementFields = new Set([
  "boundElements",
  "frameId",
  "groupIds",
  "index",
  "isDeleted",
  "nonce",
  "points",
  "seed",
  "updated",
  "version",
  "versionNonce",
]);
const fillStyles = new Set(["solid", "hachure", "cross-hatch"]);
const strokeStyles = new Set(["solid", "dashed", "dotted"]);
const textAlignments = new Set(["left", "center", "right"]);
const verticalAlignments = new Set(["top", "middle", "bottom"]);
const arrowheads = new Set(["arrow", "bar", "dot", "triangle"]);
const [inputPath, outputDir, ...options] = process.argv.slice(2);

if (!inputPath || !outputDir || options.some((option) => option !== "--force")) {
  fail(usage);
}

const force = options.includes("--force");
const sourcePath = resolve(inputPath);
const bundleDir = resolve(outputDir);
const bundledSourcePath = join(bundleDir, "diagram.json");
const htmlPath = join(bundleDir, "diagram.html");

if (!existsSync(sourcePath)) fail(`Input file does not exist: ${sourcePath}`);
if (!statSync(sourcePath).isFile()) fail(`Input path is not a file: ${sourcePath}`);

let diagram;
try {
  diagram = JSON.parse(readFileSync(sourcePath, "utf8"));
} catch (error) {
  fail(`Could not parse JSON in ${sourcePath}: ${error.message}`);
}

validateDiagram(diagram);

if (existsSync(bundleDir) && !statSync(bundleDir).isDirectory()) {
  fail(`Output path is not a directory: ${bundleDir}`);
}
mkdirSync(bundleDir, { recursive: true });

const sourceIsAlreadyBundled = sourcePath === bundledSourcePath;
const existingTargets = [
  !sourceIsAlreadyBundled && existsSync(bundledSourcePath) ? bundledSourcePath : null,
  existsSync(htmlPath) ? htmlPath : null,
].filter(Boolean);

if (existingTargets.length && !force) {
  fail(
    `Refusing to overwrite existing bundle file(s): ${existingTargets.join(", ")}. `
      + "Use --force only when replacing this bundle is intentional.",
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, "..", "references", "diagram-template.html"), "utf8");
const html = template
  .replace("__TITLE__", escapeHtml(diagram.title))
  .replace("\"__DIAGRAM_DATA__\"", safeJsonForScript(diagram));

if (!sourceIsAlreadyBundled) copyFileSync(sourcePath, bundledSourcePath);
writeFileSync(htmlPath, html);
console.log(`Rendered ${diagram.elements.length} element(s): ${htmlPath}`);
console.log(`Source JSON: ${bundledSourcePath}`);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateDiagram(value) {
  if (!isObject(value)) fail("Diagram JSON must be an object.");
  if (value.schemaVersion !== 1) fail("diagram.schemaVersion must be the number 1.");
  if (typeof value.title !== "string" || !value.title.trim()) {
    fail("diagram.title must be a non-empty string.");
  }
  if (!Array.isArray(value.elements) || value.elements.length === 0) {
    fail("diagram.elements must be a non-empty array of Excalidraw element skeletons.");
  }
  if (value.elements.length > 1_000) fail("diagram.elements may contain at most 1000 elements.");

  const ids = new Set();
  const elementTypesById = new Map();
  for (const [index, element] of value.elements.entries()) {
    const path = `elements[${index}]`;
    if (!isObject(element)) fail(`${path} must be an object.`);
    if (!supportedTypes.has(element.type)) {
      fail(`${path}.type must be one of: ${[...supportedTypes].join(", ")}.`);
    }
    for (const field of internalElementFields) {
      if (field in element) {
        fail(`${path}.${field} is an internal Excalidraw field; use a skeleton field instead.`);
      }
    }
    if (element.id !== undefined) {
      if (typeof element.id !== "string" || !element.id.trim()) {
        fail(`${path}.id must be a non-empty string when provided.`);
      }
      if (ids.has(element.id)) fail(`${path}.id duplicates an earlier element id: ${element.id}`);
      ids.add(element.id);
      elementTypesById.set(element.id, element.type);
    }
    validatePosition(path, element);
    validateStyleProperties(path, element);

    if (element.type === "text") {
      if (typeof element.text !== "string" || !element.text.trim()) {
        fail(`${path}.text must be a non-empty string for text elements.`);
      }
    } else {
      validateSize(path, element, element.type !== "arrow" && element.type !== "line");
      if (element.label !== undefined) {
        if (element.type === "line") fail(`${path}.label is supported only for shapes and arrows.`);
        validateLabel(path, element.label);
      }
    }
  }

  for (const [index, element] of value.elements.entries()) {
    if (element.type !== "arrow") continue;
    for (const endpoint of ["start", "end"]) {
      if (element[endpoint] === undefined) continue;
      const reference = element[endpoint];
      if (!isObject(reference) || typeof reference.id !== "string" || !reference.id.trim()) {
        fail(`elements[${index}].${endpoint} must be an object with a non-empty id.`);
      }
      if (!ids.has(reference.id)) {
        fail(`elements[${index}].${endpoint}.id does not match an element id: ${reference.id}`);
      }
      if (!["rectangle", "ellipse", "diamond"].includes(elementTypesById.get(reference.id))) {
        fail(`elements[${index}].${endpoint}.id must reference a shape: ${reference.id}`);
      }
    }
  }
}

function validatePosition(path, element) {
  for (const property of ["x", "y"]) {
    if (!isFiniteNumber(element[property])) fail(`${path}.${property} must be a finite number.`);
  }
}

function validateSize(path, element, mustBePositive) {
  for (const property of ["width", "height"]) {
    if (!isFiniteNumber(element[property])) fail(`${path}.${property} must be a finite number.`);
    if (mustBePositive && element[property] <= 0) {
      fail(`${path}.${property} must be greater than zero for ${element.type} elements.`);
    }
  }
}

function validateStyleProperties(path, value) {
  for (const property of ["backgroundColor", "strokeColor"]) {
    if (value[property] !== undefined && (typeof value[property] !== "string" || !value[property].trim())) {
      fail(`${path}.${property} must be a non-empty color string when provided.`);
    }
  }
  validateOptionalEnum(path, value, "fillStyle", fillStyles);
  validateOptionalEnum(path, value, "strokeStyle", strokeStyles);
  validateOptionalEnum(path, value, "textAlign", textAlignments);
  validateOptionalEnum(path, value, "verticalAlign", verticalAlignments);

  for (const property of ["angle", "fontFamily"]) {
    if (value[property] !== undefined && !isFiniteNumber(value[property])) {
      fail(`${path}.${property} must be a finite number when provided.`);
    }
  }
  validateOptionalNumber(path, value, "fontSize", { min: 0.1 });
  validateOptionalNumber(path, value, "strokeWidth", { min: 0.1 });
  validateOptionalNumber(path, value, "roughness", { min: 0, max: 2 });
  validateOptionalNumber(path, value, "opacity", { min: 0, max: 100 });

  for (const property of ["startArrowhead", "endArrowhead"]) {
    if (value[property] !== undefined && value[property] !== null && !arrowheads.has(value[property])) {
      fail(`${path}.${property} must be null or one of: ${[...arrowheads].join(", ")}.`);
    }
  }
}

function validateLabel(path, label) {
  if (!isObject(label) || typeof label.text !== "string" || !label.text.trim()) {
    fail(`${path}.label must be an object with a non-empty text string.`);
  }
  validateStyleProperties(`${path}.label`, label);
}

function validateOptionalEnum(path, value, property, allowed) {
  if (value[property] !== undefined && !allowed.has(value[property])) {
    fail(`${path}.${property} must be one of: ${[...allowed].join(", ")}.`);
  }
}

function validateOptionalNumber(path, value, property, { min, max = Infinity }) {
  if (value[property] === undefined) return;
  if (!isFiniteNumber(value[property]) || value[property] < min || value[property] > max) {
    const range = max === Infinity ? `at least ${min}` : `from ${min} to ${max}`;
    fail(`${path}.${property} must be a finite number ${range}.`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJsonForScript(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
