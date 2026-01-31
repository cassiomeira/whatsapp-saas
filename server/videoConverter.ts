import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fs from "fs/promises";
import path from "path";
import os from "os";

// Configure fluent-ffmpeg to use the NPM-installed binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Convert WebM video to MP4 (H.264) for WhatsApp compatibility
 */
export async function convertWebMToMP4(inputBuffer: Buffer): Promise<Buffer> {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `input-${Date.now()}.webm`);
    const outputPath = path.join(tmpDir, `output-${Date.now()}.mp4`);

    try {
        // Write input to temp file
        await fs.writeFile(inputPath, inputBuffer);

        // Convert using FFmpeg with WhatsApp mobile-optimized settings
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
                // Video settings optimized for mobile devices
                .videoCodec("libx264")
                .videoBitrate("600k") // Even more conservative bitrate
                .size("?x480") // 480p height (safe for Level 3.0)
                .fps(30)
                .format("mp4")
                // Audio settings
                .audioCodec("aac")
                .audioChannels(2)
                .audioBitrate("128k")
                .audioFrequency(44100)
                // CRITICAL H.264 settings for maximum mobile compatibility
                .outputOptions([
                    "-preset medium", // Better quality/compression balance than veryfast
                    "-profile:v baseline", // Highest compatibility
                    "-level 3.0", // Level 3.0 matches 480p perfectly
                    "-pix_fmt yuv420p",
                    "-movflags +faststart",
                    "-max_muxing_queue_size 1024",
                    "-vf scale='min(480,iw)':'min(480,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2", // Ensure even dimensions and max 480p
                ])
                .on("start", (cmd) => {
                    console.log("[FFmpeg] Starting WhatsApp mobile conversion:", cmd);
                })
                .on("progress", (progress) => {
                    if (progress.percent) {
                        console.log(`[FFmpeg] Progress: ${progress.percent.toFixed(1)}%`);
                    }
                })
                .on("end", () => {
                    console.log("[FFmpeg] Conversion completed successfully");
                    resolve();
                })
                .on("error", (err) => {
                    console.error("[FFmpeg] Conversion error:", err);
                    reject(err);
                })
                .save(outputPath);
        });

        // Read converted file
        const outputBuffer = await fs.readFile(outputPath);

        // Cleanup
        await fs.unlink(inputPath).catch(() => { });
        await fs.unlink(outputPath).catch(() => { });

        return outputBuffer;
    } catch (error) {
        // Cleanup on error
        await fs.unlink(inputPath).catch(() => { });
        await fs.unlink(outputPath).catch(() => { });
        throw error;
    }
}
