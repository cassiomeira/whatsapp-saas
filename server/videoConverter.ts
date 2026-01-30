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

        // Convert using FFmpeg with WhatsApp mobile-specific settings
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
                // Video settings
                .videoCodec("libx264")
                .videoBitrate("1000k") // Lower bitrate for mobile
                .size("640x?") // Max 640px width, preserve aspect ratio
                .fps(30)
                .format("mp4")
                // Audio settings
                .audioCodec("aac")
                .audioChannels(1) // Mono for smaller size
                .audioBitrate("64k")
                .audioFrequency(44100)
                // Critical H.264 settings for WhatsApp mobile
                .outputOptions([
                    "-preset veryfast",
                    "-profile:v baseline", // MUST be baseline for mobile
                    "-level 3.0",
                    "-pix_fmt yuv420p",
                    "-movflags +faststart",
                    "-strict -2", // Required for some AAC encoders
                    "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2", // Ensure even dimensions
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
