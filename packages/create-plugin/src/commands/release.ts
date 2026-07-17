import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { unzipSync } from "fflate";
import { packPlugin } from "./pack.js";

export interface PrepareReleaseOptions {
  directory?: string;
  outputDirectory?: string;
  tag?: string;
}

interface PluginManifest {
  id: string;
  version: string;
}

export async function preparePluginRelease(
  options: PrepareReleaseOptions = {},
): Promise<string[]> {
  const directory = resolve(options.directory ?? process.cwd());
  const outputDirectory = resolve(
    options.outputDirectory ?? resolve(directory, "release-assets"),
  );
  const manifest = JSON.parse(
    await readFile(resolve(directory, "opsrabbit.plugin.json"), "utf8"),
  ) as PluginManifest;
  const packageJson = JSON.parse(
    await readFile(resolve(directory, "package.json"), "utf8"),
  ) as { version?: string };
  if (packageJson.version !== manifest.version)
    throw new Error(
      `package.json version ${String(packageJson.version)} must match plugin version ${manifest.version}.`,
    );

  const tag =
    options.tag ?? process.env.GITHUB_REF_NAME ?? `v${manifest.version}`;
  const expectedTag = `v${manifest.version}`;
  if (tag !== expectedTag)
    throw new Error(
      `Release tag ${tag} must exactly match plugin version tag ${expectedTag}.`,
    );

  await mkdir(outputDirectory, { recursive: true });
  const archivePath = await packPlugin(directory, outputDirectory);
  const archive = await readFile(archivePath);
  const archiveDigest = sha256(archive);
  const base = basename(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  const sbomPath = resolve(
    outputDirectory,
    `${manifest.id}-${manifest.version}.spdx.json`,
  );
  const metadataPath = resolve(
    outputDirectory,
    `${manifest.id}-${manifest.version}.release.json`,
  );

  await writeFile(checksumPath, `${archiveDigest}  ${base}\n`);
  await writeFile(
    sbomPath,
    `${JSON.stringify(createSpdx(manifest, archiveDigest, archive), null, 2)}\n`,
  );
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        tag,
        archive: base,
        sha256: archiveDigest,
        sbom: basename(sbomPath),
      },
      null,
      2,
    )}\n`,
  );
  return [archivePath, checksumPath, sbomPath, metadataPath];
}

function createSpdx(
  manifest: PluginManifest,
  archiveDigest: string,
  archive: Uint8Array,
): Record<string, unknown> {
  const files = Object.entries(unzipSync(archive))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, contents], index) => ({
      fileName: `./${name}`,
      SPDXID: `SPDXRef-File-${index + 1}`,
      checksums: [{ algorithm: "SHA256", checksumValue: sha256(contents) }],
      licenseConcluded: "NOASSERTION",
      copyrightText: "NOASSERTION",
    }));
  return {
    spdxVersion: "SPDX-2.3",
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${manifest.id}-${manifest.version}`,
    documentNamespace: `https://opsrabbit.dev/spdx/${manifest.id}/${manifest.version}/${archiveDigest}`,
    creationInfo: {
      created: new Date(0).toISOString(),
      creators: ["Tool: @opsrabbit/create-plugin"],
    },
    packages: [
      {
        name: manifest.id,
        SPDXID: "SPDXRef-Package",
        versionInfo: manifest.version,
        downloadLocation: "NOASSERTION",
        filesAnalyzed: true,
        licenseConcluded: "NOASSERTION",
        licenseDeclared: "NOASSERTION",
        copyrightText: "NOASSERTION",
        checksums: [{ algorithm: "SHA256", checksumValue: archiveDigest }],
      },
    ],
    files,
    relationships: [
      {
        spdxElementId: "SPDXRef-DOCUMENT",
        relationshipType: "DESCRIBES",
        relatedSpdxElement: "SPDXRef-Package",
      },
      ...files.map((file) => ({
        spdxElementId: "SPDXRef-Package",
        relationshipType: "CONTAINS",
        relatedSpdxElement: file.SPDXID,
      })),
    ],
  };
}

function sha256(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}
