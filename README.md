# Image Optimizer

High-performance batch image optimization tool using Sharp. Converts PNG/JPG to WebP format with quality control.

## Features

- Converts PNG/JPG to WebP at configurable quality (default: 85%)
- Copies existing WebP files as-is (no re-encoding)
- Preserves folder structure
- Parallel processing (15 concurrent by default)
- Automatic resume capability (skips existing files)
- Real-time progress tracking
- Detailed statistics (files processed, size saved, time taken)
- Comprehensive error handling and logging

## Installation

```bash
cd image-optimizer
npm install
```

## Usage

### Basic Usage

```bash
npm run optimize -- /path/to/images
```

This will:

1. Process all PNG/JPG/WebP files in `/path/to/images`
2. Create output folder: `/path/to/images-webp`
3. Use quality 85 and concurrency 15

### Advanced Options

```bash
# Custom quality (90%)
npm run optimize -- /path/to/images -q 90

# Custom concurrency (20 parallel)
npm run optimize -- /path/to/images -c 20

# Both custom quality and concurrency
npm run optimize -- /path/to/images -q 90 -c 20
```

## Output

The script creates a new folder with `-webp` suffix:

```bash
Input:  ~/Downloads/images
Output: ~/Downloads/images-webp
```

## Performance

Expected performance on modern hardware:

- **Speed**: 500-1000 images/minute (varies by image size/complexity)
- **Concurrency**: 15 (default) - adjust based on CPU cores
- **Memory**: ~2-4 GB for typical workloads

### Concurrency Tuning Recommendations

| CPU Cores | Recommended Concurrency |
| --------- | ----------------------- |
| 4 cores   | 10-12                   |
| 8 cores   | 15-20                   |
| 16 cores  | 20-30                   |

## Resume Capability

If interrupted, simply run the same command again. The script automatically skips files that already exist in the output folder.

## Error Handling

Errors are logged but don't stop processing:

- Failed files are reported in the summary
- Other files continue processing
- Check error log for troubleshooting

## Technical Details

- **Library**: Sharp (high-performance image processing)
- **Output Format**: WebP with quality 85 (default)
- **Effort Level**: 6 (balance of speed/quality)
- **Parallel Processing**: Promise-based concurrency control
- **Memory Management**: Batch processing to avoid OOM

## Example Output

```bash
🚀 Starting Image Optimization

Input:  ~/Downloads/images
Output: ~/Downloads/images-webp
Quality: 85
Concurrency: 15

🔍 Discovering images...
✓ Found 700 images to process

████████████████████████████████████████ | 100% | 700/700 | Processing... (0 errors)

=== Optimization Summary ===
✓ Processed: 700 files
⊙ Skipped: 0 files (already exist)
✗ Errors: 0 files
⧗ Time: 45.32s (17 files/sec)
⊚ Original Size: 127.1 MB
⊚ Optimized Size: 38.4 MB
★ Saved: 88.7 MB (69.8%)
```
