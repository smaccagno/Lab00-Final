const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const metadataPath = path.join(rootDir, "metadata-types.json");
const projectPath = path.join(rootDir, "sfdx-project.json");
const manifestDir = path.join(rootDir, "manifest");
const manifestPath = path.join(manifestDir, "package.xml");

const metadataRaw = fs.readFileSync(metadataPath, "utf8");
const metadata = JSON.parse(metadataRaw);

let apiVersion = "60.0";
if (fs.existsSync(projectPath)) {
  const projectRaw = fs.readFileSync(projectPath, "utf8");
  const project = JSON.parse(projectRaw);
  if (project && project.sourceApiVersion) {
    apiVersion = String(project.sourceApiVersion);
  }
}

const types = (metadata.metadataObjects || [])
  .map((entry) => entry.xmlName)
  .filter((name) => typeof name === "string" && name.length > 0);

types.sort((a, b) => a.localeCompare(b));

const lines = [];
lines.push('<?xml version="1.0" encoding="UTF-8"?>');
lines.push('<Package xmlns="http://soap.sforce.com/2006/04/metadata">');
for (const typeName of types) {
  lines.push("  <types>");
  lines.push("    <members>*</members>");
  lines.push(`    <name>${typeName}</name>`);
  lines.push("  </types>");
}
lines.push(`  <version>${apiVersion}</version>`);
lines.push("</Package>");
lines.push("");

fs.mkdirSync(manifestDir, { recursive: true });
fs.writeFileSync(manifestPath, lines.join("\n"), "utf8");

console.log(`Wrote ${path.relative(rootDir, manifestPath)}`);
