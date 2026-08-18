import fs from "node:fs";
import path from "node:path";
import {
  SKIP_SCAN_DIR_NAMES,
  isVideoFile,
  parseEpisodeFilename,
  parseMovieFilename,
} from "@media-app/shared";
import type { ConfigManager } from "../config.js";
import type { ScannerService } from "./scanner.js";
import { isPathUnderRoot, validateLibraryPath } from "../utils/paths.js";

export interface AliasLibrary {
  id: number;
  name: string;
  type: "movies" | "tv";
  path: string;
}

export interface AliasCandidate {
  sourcePath: string;
  fileName: string;
  size: number;
  kind: "movie" | "episode";
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  libraryId: number;
  libraryName: string;
  aliasPath: string;
}

export interface AliasScanResult {
  downloadPath: string;
  scanned: number;
  alreadyAliased: number;
  skipped: number;
  candidates: AliasCandidate[];
}

export interface AliasCreateResult {
  created: number;
  failed: Array<{ sourcePath: string; error: string }>;
  scannedLibraries: number[];
}

const SAMPLE_NAME = /(^|[._\-\s])sample([._\-\s]|$)/i;
const INCOMPLETE_EXT = new Set([".part", ".!qb", ".tmp", ".aria2", ".crdownload"]);

export function isJunkDownloadName(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  if (INCOMPLETE_EXT.has(ext)) return true;
  return SAMPLE_NAME.test(filename.replace(/\.[^.]+$/, ""));
}

export function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[\\/\0]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Unknown";
}

export function padSeason(season: number): string {
  return String(season).padStart(2, "0");
}

export function suggestedAliasPath(
  sourcePath: string,
  libraries: AliasLibrary[],
): Omit<AliasCandidate, "sourcePath" | "fileName" | "size"> | null {
  const fileName = path.basename(sourcePath);
  const episode = parseEpisodeFilename(fileName);
  if (episode) {
    const library = libraries.find((lib) => lib.type === "tv");
    if (!library) return null;
    const show = sanitizeFolderName(episode.showName);
    const aliasPath = path.join(
      library.path,
      show,
      `Season ${padSeason(episode.season)}`,
      fileName,
    );
    return {
      kind: "episode",
      title: show,
      season: episode.season,
      episode: episode.episode,
      libraryId: library.id,
      libraryName: library.name,
      aliasPath,
    };
  }

  const library = libraries.find((lib) => lib.type === "movies");
  if (!library) return null;
  const movie = parseMovieFilename(fileName);
  const folder = sanitizeFolderName(
    movie.year ? `${movie.title} (${movie.year})` : movie.title,
  );
  return {
    kind: "movie",
    title: movie.title,
    year: movie.year,
    libraryId: library.id,
    libraryName: library.name,
    aliasPath: path.join(library.path, folder, fileName),
  };
}

function fileIdKey(stat: fs.Stats): string {
  return `${stat.dev}:${stat.ino}`;
}

function walkVideoFiles(root: string, options?: { followSymlinks?: boolean }): string[] {
  const results: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink() && !options?.followSymlinks) {
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIP_SCAN_DIR_NAMES.has(entry.name)) continue;
        if (/^sample$/i.test(entry.name)) continue;
        stack.push(full);
        continue;
      }
      if (!entry.isFile() && !(options?.followSymlinks && entry.isSymbolicLink())) {
        continue;
      }
      if (!isVideoFile(entry.name) || isJunkDownloadName(entry.name)) continue;
      results.push(full);
    }
  }

  return results;
}

function collectLibraryLinks(libraries: AliasLibrary[]): {
  inodes: Set<string>;
  realPaths: Set<string>;
} {
  const inodes = new Set<string>();
  const realPaths = new Set<string>();

  for (const library of libraries) {
    if (!fs.existsSync(library.path)) continue;
    const stack = [library.path];
    while (stack.length > 0) {
      const dir = stack.pop();
      if (!dir) continue;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          if (SKIP_SCAN_DIR_NAMES.has(entry.name)) continue;
          stack.push(full);
          continue;
        }
        if (!isVideoFile(entry.name)) continue;
        try {
          const linkStat = fs.lstatSync(full);
          const targetStat = fs.statSync(full);
          inodes.add(fileIdKey(targetStat));
          realPaths.add(fs.realpathSync(full));
          if (linkStat.isSymbolicLink()) {
            const raw = fs.readlinkSync(full);
            const resolved = path.resolve(path.dirname(full), raw);
            realPaths.add(resolved);
          }
        } catch {
          // unreadable / dangling
        }
      }
    }
  }

  return { inodes, realPaths };
}

export class AliasService {
  constructor(
    private configManager: ConfigManager,
    private scanner: ScannerService,
    private listLibraries: () => Promise<AliasLibrary[]>,
  ) {}

  async scan(downloadPath?: string): Promise<AliasScanResult> {
    const resolved = this.resolveDownloadPath(downloadPath);
    this.configManager.setDownloadsDir(resolved);

    const libraries = await this.listLibraries();
    if (libraries.length === 0) {
      throw new Error("Add a movie or TV library before creating aliases.");
    }

    const downloads = walkVideoFiles(resolved);
    const links = collectLibraryLinks(libraries);
    const candidates: AliasCandidate[] = [];
    let alreadyAliased = 0;
    let skipped = 0;

    for (const sourcePath of downloads) {
      if (libraries.some((lib) => isPathUnderRoot(lib.path, sourcePath))) {
        skipped += 1;
        continue;
      }

      let stat: fs.Stats;
      try {
        stat = fs.statSync(sourcePath);
      } catch {
        skipped += 1;
        continue;
      }

      const realPath = fs.realpathSync(sourcePath);
      if (links.inodes.has(fileIdKey(stat)) || links.realPaths.has(realPath)) {
        alreadyAliased += 1;
        continue;
      }

      const suggestion = suggestedAliasPath(sourcePath, libraries);
      if (!suggestion) {
        skipped += 1;
        continue;
      }

      candidates.push({
        sourcePath,
        fileName: path.basename(sourcePath),
        size: stat.size,
        ...suggestion,
      });
    }

    candidates.sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" }));

    return {
      downloadPath: resolved,
      scanned: downloads.length,
      alreadyAliased,
      skipped,
      candidates,
    };
  }

  async create(sourcePaths: string[]): Promise<AliasCreateResult> {
    const downloadPath = this.resolveDownloadPath();
    const libraries = await this.listLibraries();
    const failed: Array<{ sourcePath: string; error: string }> = [];
    const scannedLibraries = new Set<number>();
    let created = 0;

    const uniqueSources = [...new Set(sourcePaths.map((p) => path.resolve(p)))];

    for (const sourcePath of uniqueSources) {
      try {
        if (!isPathUnderRoot(downloadPath, sourcePath)) {
          throw new Error("File is outside the download folder");
        }
        const stat = fs.lstatSync(sourcePath);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error("Not a regular media file");
        }
        if (!isVideoFile(sourcePath) || isJunkDownloadName(path.basename(sourcePath))) {
          throw new Error("Not a media file");
        }

        const suggestion = suggestedAliasPath(sourcePath, libraries);
        if (!suggestion) {
          throw new Error("No matching movie or TV library");
        }

        const library = libraries.find((lib) => lib.id === suggestion.libraryId);
        if (!library || !isPathUnderRoot(library.path, suggestion.aliasPath)) {
          throw new Error("Alias path is outside the library");
        }

        fs.mkdirSync(path.dirname(suggestion.aliasPath), { recursive: true });
        if (fs.existsSync(suggestion.aliasPath)) {
          const existingReal = fs.realpathSync(suggestion.aliasPath);
          if (existingReal === fs.realpathSync(sourcePath)) {
            scannedLibraries.add(suggestion.libraryId);
            continue;
          }
          throw new Error("A different file already exists at the alias path");
        }

        const destDir = path.dirname(suggestion.aliasPath);
        const target = path.relative(destDir, sourcePath) || sourcePath;
        fs.symlinkSync(target, suggestion.aliasPath);
        scannedLibraries.add(suggestion.libraryId);
        created += 1;
      } catch (err) {
        failed.push({
          sourcePath,
          error: err instanceof Error ? err.message : "Failed to create alias",
        });
      }
    }

    for (const libraryId of scannedLibraries) {
      this.scanner.scheduleScan(libraryId);
    }

    return {
      created,
      failed,
      scannedLibraries: [...scannedLibraries],
    };
  }

  private resolveDownloadPath(input?: string): string {
    const raw = input?.trim() || this.configManager.get().downloads_dir || "";
    if (!raw) {
      throw new Error("Choose a download folder first");
    }
    const validation = validateLibraryPath(raw);
    if (!validation.valid || !validation.resolvedPath) {
      throw new Error(validation.error ?? "Download folder is not readable");
    }
    return validation.resolvedPath;
  }
}
