'use strict';

const { spawn } = require('child_process');
const { assertMp4 } = require('./flux-video-adapter');

const DEFAULT_CLUSTER_HOST = 'avli';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const SSH_OPTIONS = Object.freeze([
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=10',
  '-o', 'ServerAliveInterval=15',
  '-o', 'ServerAliveCountMax=3',
]);

const RESOURCE_COMMAND = [
  'python3 -c',
  "'import json,os,platform,shutil;",
  'print(json.dumps({',
  '"hostname":platform.node(),',
  '"platform":platform.platform(),',
  '"cpu_count":os.cpu_count(),',
  '"ffmpeg":shutil.which("ffmpeg"),',
  '"ffprobe":shutil.which("ffprobe")',
  '}))\'',
].join(' ');

const FINISH_COMMAND = [
  'work=$(mktemp -d /tmp/avli-morphic-video.XXXXXX) || exit 70',
  'trap \'rm -rf "$work"\' EXIT',
  'cat > "$work/input.mp4"',
  'ffmpeg -hide_banner -loglevel error -y -i "$work/input.mp4" -map 0:v:0 -an '
    + '-vf "eq=contrast=1.015:saturation=1.025:gamma=1.005,unsharp=5:5:0.18:3:3:0.0" '
    + '-c:v libx264 -preset medium -crf 17 -pix_fmt yuv420p '
    + '-movflags +faststart -threads 2 "$work/output.mp4"',
  'ffprobe -v error -select_streams v:0 '
    + '-show_entries stream=codec_name,width,height,r_frame_rate:format=duration,size '
    + '-of json "$work/output.mp4" >&2',
  'cat "$work/output.mp4"',
].join(' && ');

function cancellationError() {
  const error = new Error('media run cancelled');
  error.code = 'L7_CANCELLED';
  return error;
}

function validateHost(host) {
  if (!/^[a-z0-9._@:-]+$/i.test(host)) {
    throw new Error('AVLI cluster host must be an SSH alias, hostname, or address');
  }
  return host;
}

function runProcess(command, args, options = {}) {
  const runner = options.spawn || spawn;
  return new Promise((resolve, reject) => {
    const child = runner(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => {
      child.kill('SIGTERM');
      finish(cancellationError());
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error(`AVLI cluster process timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    options.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', error => finish(error));
    child.once('exit', code => {
      const errorText = Buffer.concat(stderr).toString('utf8').trim();
      if (options.signal?.aborted) return finish(cancellationError());
      if (code !== 0) return finish(new Error(errorText || `AVLI cluster process stopped (${code})`));
      finish(null, {
        stdout: Buffer.concat(stdout),
        stderr: errorText,
      });
    });
    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

class AvliClusterVideoClient {
  constructor(options = {}) {
    this.host = validateHost(options.host || process.env.AVLI_CLUSTER_SSH_HOST || DEFAULT_CLUSTER_HOST);
    this.ssh = options.ssh || process.env.AVLI_CLUSTER_SSH || '/usr/bin/ssh';
    this.run = options.run || runProcess;
    this.timeoutMs = Number(options.timeoutMs || process.env.AVLI_CLUSTER_VIDEO_TIMEOUT_MS)
      || DEFAULT_TIMEOUT_MS;
  }

  sshArgs(command) {
    return [...SSH_OPTIONS, this.host, command];
  }

  async resources() {
    try {
      const result = await this.run(this.ssh, this.sshArgs(RESOURCE_COMMAND), {
        timeoutMs: 15_000,
      });
      const worker = JSON.parse(result.stdout.toString('utf8'));
      return {
        state: worker.ffmpeg && worker.ffprobe ? 'connected' : 'degraded',
        transport: 'tailscale-ssh',
        endpoint: this.host,
        worker,
        roles: {
          synthesis: 'local-apple-mps',
          finish: worker.ffmpeg ? 'cluster-ffmpeg-libx264' : 'unavailable',
        },
        execution_enabled: process.env.AVLI_VIDEO_ENGINE === 'cluster',
      };
    } catch (error) {
      return {
        state: 'offline',
        transport: 'tailscale-ssh',
        endpoint: this.host,
        error: error.message,
        roles: {
          synthesis: 'local-apple-mps',
          finish: 'unavailable',
        },
        execution_enabled: false,
      };
    }
  }

  async finish(bytes, signal) {
    assertMp4(bytes, 'AVLI cluster input');
    const result = await this.run(this.ssh, this.sshArgs(FINISH_COMMAND), {
      input: bytes,
      signal,
      timeoutMs: this.timeoutMs,
    });
    assertMp4(result.stdout, 'AVLI cluster finish');
    let probe = null;
    const start = result.stderr.indexOf('{');
    if (start >= 0) {
      try {
        probe = JSON.parse(result.stderr.slice(start));
      } catch {
        probe = null;
      }
    }
    return { bytes: result.stdout, probe };
  }
}

async function renderAvliClusterFinish(job, context, options = {}) {
  const source = context.dependencies?.[job.input.source_job];
  if (!source) throw new Error(`${job.id} cannot resolve ${job.input.source_job}`);
  if (typeof context.loadAsset !== 'function') {
    throw new Error('AVLI cluster finish requires content-addressed asset access');
  }
  const motion = await context.loadAsset(source.content_hash);
  if (!motion?.bytes?.length) throw new Error('AVLI cluster could not load motion artifact');
  const client = options.client || new AvliClusterVideoClient(options);
  const finished = await client.finish(motion.bytes, context.signal);
  return {
    bytes: finished.bytes,
    mediaType: 'video/mp4',
    extension: 'mp4',
    provider: 'avli-cluster',
    model: 'avli-flux-cluster-finish',
    modelVersion: '1.0.0',
    output: {
      edit_decision_list: [
        {
          operation: 'flux_tempo',
          source_job: job.input.source_job,
          continuity_lock: job.input.continuity_lock,
          node: 'local-apple-mps',
        },
        {
          operation: 'cluster_master',
          node: client.host,
          transport: 'tailscale-ssh',
          codec: 'libx264',
          crf: 17,
          deterministic_grade: 'copper-blue-breath',
        },
        {
          operation: 'cluster_verify',
          temporal_echo: job.input.temporal_echo,
          probe: finished.probe,
        },
      ],
    },
  };
}

module.exports = {
  DEFAULT_CLUSTER_HOST,
  DEFAULT_TIMEOUT_MS,
  RESOURCE_COMMAND,
  FINISH_COMMAND,
  SSH_OPTIONS,
  validateHost,
  runProcess,
  AvliClusterVideoClient,
  renderAvliClusterFinish,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/avli-cluster-video-adapter.js | Body-Hash: SHA-256:3ff3b96c8fea7bd8f689aa16a2ba0ebf0cc1f713793af82b246416055d86af7f
// Chain-Hash: SHA-256:52538b745577bd5e29617bd29b62b45dcf037e1253a96b978314170c1ecd2dd9 | Signed: 2026-07-28T15:51:22.659547+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 67 works. Verify: python3 provenance.py verify lib/avli-cluster-video-adapter.js