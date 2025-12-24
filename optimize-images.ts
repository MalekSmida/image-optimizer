#!/usr/bin/env tsx

import sharp from "sharp";
import { readdir, stat, mkdir, access, copyFile } from "fs/promises";
import { join, dirname, basename, extname, resolve } from "path";
import { constants } from "fs";
import cliProgress from "cli-progress";
import chalk from "chalk";

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

interface ProcessingStats {
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  originalSize: number;
  optimizedSize: number;
  startTime: number;
  errors: Array<{ file: string; error: string }>;
}

interface FileToProcess {
  inputPath: string;
  outputPath: string;
  relativePath: string;
  isWebP: boolean;
}

interface OptimizationOptions {
  inputFolder: string;
  outputFolder: string;
  quality: number;
  concurrency: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ============================================================================
// MAIN CLASS
// ============================================================================

export class ImageOptimizer {
  private stats: ProcessingStats;
  private progressBar: cliProgress.SingleBar | null = null;

  constructor() {
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      skippedFiles: 0,
      errorFiles: 0,
      originalSize: 0,
      optimizedSize: 0,
      startTime: Date.now(),
      errors: [],
    };
  }

  /**
   * Main entry point for image optimization
   */
  async optimize(options: OptimizationOptions): Promise<void> {
    const { inputFolder, outputFolder, quality, concurrency } = options;

    try {
      // Create output folder
      await mkdir(outputFolder, { recursive: true });

      // Discover all images
      console.log(chalk.cyan("🔍 Discovering images..."));
      const files = await this.discoverImages(inputFolder, outputFolder);
      this.stats.totalFiles = files.length;

      if (files.length === 0) {
        console.log(chalk.yellow("⚠ No images found to process"));
        return;
      }

      console.log(chalk.green(`✓ Found ${files.length} images to process\n`));

      // Process images in batches
      await this.processImagesInBatches(files, concurrency, quality);

      // Print final statistics
      this.printStats();
    } catch (error) {
      console.error(
        chalk.red("Fatal error:"),
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  }

  /**
   * Recursively discover all images in the input folder
   */
  private async discoverImages(
    inputFolder: string,
    outputFolder: string
  ): Promise<FileToProcess[]> {
    const files: FileToProcess[] = [];
    const supportedExtensions = [".png", ".jpg", ".jpeg", ".webp"];

    const scanDirectory = async (
      currentPath: string,
      relativePath: string = ""
    ): Promise<void> => {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relPath = join(relativePath, entry.name);

        if (entry.isDirectory()) {
          // Recursive scan
          await scanDirectory(fullPath, relPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (supportedExtensions.includes(ext)) {
            const isWebP = ext === ".webp";
            const outputFileName = isWebP
              ? basename(entry.name)
              : `${basename(entry.name, ext)}.webp`;
            const outputPath = join(
              outputFolder,
              dirname(relPath),
              outputFileName
            );

            files.push({
              inputPath: fullPath,
              outputPath,
              relativePath: relPath,
              isWebP,
            });
          }
        }
      }
    };

    await scanDirectory(inputFolder);
    return files;
  }

  /**
   * Check if output file already exists (for resume capability)
   */
  private async shouldSkipFile(outputPath: string): Promise<boolean> {
    try {
      await access(outputPath, constants.F_OK);
      return true; // File exists, skip it
    } catch {
      return false; // File doesn't exist, process it
    }
  }

  /**
   * Process images in batches with concurrency control
   */
  private async processImagesInBatches(
    files: FileToProcess[],
    concurrency: number,
    quality: number
  ): Promise<void> {
    const progressBar = new cliProgress.SingleBar(
      {
        format:
          chalk.cyan("{bar}") + " | {percentage}% | {value}/{total} | {status}",
        barCompleteChar: "\u2588",
        barIncompleteChar: "\u2591",
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic
    );

    progressBar.start(files.length, 0, { status: "Starting..." });
    this.progressBar = progressBar;

    // Process in chunks with concurrency control
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);

      await Promise.all(batch.map((file) => this.processImage(file, quality)));

      progressBar.update(Math.min(i + concurrency, files.length), {
        status: `Processing... (${this.stats.errorFiles} errors)`,
      });
    }

    progressBar.stop();
    this.progressBar = null;
  }

  /**
   * Process a single image
   */
  private async processImage(
    file: FileToProcess,
    quality: number
  ): Promise<void> {
    try {
      // Ensure output directory exists
      await mkdir(dirname(file.outputPath), { recursive: true });

      // Check if file should be skipped
      if (await this.shouldSkipFile(file.outputPath)) {
        this.stats.skippedFiles++;
        return;
      }

      // Get original file size
      const inputStats = await stat(file.inputPath);
      this.stats.originalSize += inputStats.size;

      if (file.isWebP) {
        // Copy WebP files directly (no re-encoding)
        await copyFile(file.inputPath, file.outputPath);
      } else {
        // Convert PNG/JPG to WebP
        await sharp(file.inputPath)
          .webp({
            quality,
            effort: 6, // 0-6, higher = slower but better compression
            smartSubsample: true, // Better quality for photos
          })
          .toFile(file.outputPath);
      }

      // Get optimized file size
      const outputStats = await stat(file.outputPath);
      this.stats.optimizedSize += outputStats.size;
      this.stats.processedFiles++;
    } catch (error) {
      this.stats.errorFiles++;
      this.stats.errors.push({
        file: file.relativePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Print final statistics
   */
  private printStats(): void {
    const duration = (Date.now() - this.stats.startTime) / 1000;
    const sizeSaved = this.stats.originalSize - this.stats.optimizedSize;
    const percentSaved =
      this.stats.originalSize > 0
        ? (sizeSaved / this.stats.originalSize) * 100
        : 0;
    const filesPerSec =
      duration > 0 ? (this.stats.processedFiles / duration).toFixed(0) : "0";

    console.log("\n" + chalk.bold("=== Optimization Summary ==="));
    console.log(chalk.green(`✓ Processed: ${this.stats.processedFiles} files`));
    console.log(
      chalk.yellow(
        `⊙ Skipped: ${this.stats.skippedFiles} files (already exist)`
      )
    );
    console.log(chalk.red(`✗ Errors: ${this.stats.errorFiles} files`));
    console.log(
      chalk.cyan(`⧗ Time: ${duration.toFixed(2)}s (${filesPerSec} files/sec)`)
    );
    console.log(
      chalk.magenta(`⊚ Original Size: ${formatBytes(this.stats.originalSize)}`)
    );
    console.log(
      chalk.magenta(
        `⊚ Optimized Size: ${formatBytes(this.stats.optimizedSize)}`
      )
    );
    console.log(
      chalk.bold.green(
        `★ Saved: ${formatBytes(sizeSaved)} (${percentSaved.toFixed(1)}%)`
      )
    );

    if (this.stats.errors.length > 0) {
      console.log("\n" + chalk.bold.red("Errors:"));
      this.stats.errors.slice(0, 10).forEach(({ file, error }) => {
        console.log(chalk.red(`  - ${file}: ${error}`));
      });
      if (this.stats.errors.length > 10) {
        console.log(
          chalk.red(`  ... and ${this.stats.errors.length - 10} more errors`)
        );
      }
    }
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Help display
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(chalk.bold("\n📦 Image Optimizer\n"));
    console.log("Usage: npm run optimize -- <input-folder> [options]\n");
    console.log("Options:");
    console.log(
      "  -q, --quality <number>      WebP quality (1-100, default: 85)"
    );
    console.log(
      "  -c, --concurrency <number>  Concurrent processing (default: 15)"
    );
    console.log("  -h, --help                  Show this help message\n");
    console.log("Examples:");
    console.log("  npm run optimize -- /path/to/folder-with-images");
    console.log(
      "  npm run optimize -- /path/to/folder-with-images -q 90 -c 20\n"
    );
    process.exit(0);
  }

  // Parse arguments
  const inputFolder = resolve(args[0]);
  let quality = 85;
  let concurrency = 15;

  for (let i = 1; i < args.length; i++) {
    if ((args[i] === "-q" || args[i] === "--quality") && args[i + 1]) {
      quality = parseInt(args[i + 1], 10);
      if (isNaN(quality) || quality < 1 || quality > 100) {
        console.error(chalk.red("Error: Quality must be between 1-100"));
        process.exit(1);
      }
      i++;
    } else if (
      (args[i] === "-c" || args[i] === "--concurrency") &&
      args[i + 1]
    ) {
      concurrency = parseInt(args[i + 1], 10);
      if (isNaN(concurrency) || concurrency < 1) {
        console.error(chalk.red("Error: Concurrency must be >= 1"));
        process.exit(1);
      }
      i++;
    }
  }

  // Validate input folder
  try {
    await access(inputFolder, constants.R_OK);
  } catch {
    console.error(chalk.red(`Error: Cannot access folder: ${inputFolder}`));
    process.exit(1);
  }

  // Generate output folder name
  const folderName = basename(inputFolder);
  const parentDir = dirname(inputFolder);
  const outputFolder = join(parentDir, `${folderName}-webp`);

  // Display configuration
  console.log(chalk.bold("\n🚀 Starting Image Optimization\n"));
  console.log(chalk.cyan(`Input:  ${inputFolder}`));
  console.log(chalk.cyan(`Output: ${outputFolder}`));
  console.log(chalk.cyan(`Quality: ${quality}`));
  console.log(chalk.cyan(`Concurrency: ${concurrency}\n`));

  // Run optimization
  const optimizer = new ImageOptimizer();
  await optimizer.optimize({
    inputFolder,
    outputFolder,
    quality,
    concurrency,
  });
}

// Entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
