import { execa } from 'execa';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function renderGif(outDir: string): Promise<string> {
  const absOut = path.resolve(outDir);
  const mp4Path = path.join(absOut, 'render.mp4');
  const palettePath = path.join(absOut, 'palette.png');
  const gifPath = path.join(absOut, 'render.gif');
  const hfDir = path.resolve('hf');

  console.log('  Running hyperframes lint...');
  await execa('npx', ['hyperframes', 'lint', hfDir], { stdio: 'inherit' });

  console.log('  Rendering MP4...');
  await execa(
    'npx',
    ['hyperframes', 'render', '--output', mp4Path, '--fps', '24', '--quality', 'standard'],
    { stdio: 'inherit', cwd: hfDir }
  );

  console.log('  Converting to GIF (two-pass palette)...');
  await execa('ffmpeg', [
    '-i', mp4Path,
    '-vf', 'fps=15,scale=480:-1:flags=lanczos,palettegen=max_colors=128',
    '-update', '1', '-y', palettePath,
  ], { stdio: 'inherit' });

  await execa('ffmpeg', [
    '-i', mp4Path,
    '-i', palettePath,
    '-filter_complex', 'fps=15,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3',
    '-y', gifPath,
  ], { stdio: 'inherit' });

  await fs.mkdir('emails/static', { recursive: true });
  await fs.copyFile(gifPath, 'emails/static/latest.gif');

  const { size } = await fs.stat(gifPath);
  console.log(`  GIF ready: ${gifPath} (${(size / 1024).toFixed(0)} KB)`);
  return gifPath;
}
