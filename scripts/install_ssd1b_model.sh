#!/bin/sh
set -eu

runtime_dir="${AVLI_IMAGE_RUNTIME:-$HOME/.l7/runtime/ssd1b}"
model_cache="${HF_HOME:-$HOME/.l7/models/huggingface}"
ssd_cache="$model_cache/hub/models--segmind--SSD-1B/snapshots"
vae_cache="$model_cache/hub/models--madebyollin--sdxl-vae-fp16-fix/snapshots"

if [ -x "$runtime_dir/bin/python3" ] \
  && find -L "$ssd_cache" -type f -name model_index.json -print -quit 2>/dev/null | grep -q . \
  && find -L "$vae_cache" -type f -name config.json -print -quit 2>/dev/null | grep -q .; then
  echo "SSD-1B runtime and fp16-fixed VAE are already installed."
  exit 0
fi

available_kb="$(df -Pk "$HOME" | awk 'NR==2 {print $4}')"
required_kb=6291456

if [ "$available_kb" -lt "$required_kb" ]; then
  echo "SSD-1B installation needs at least 6 GiB free; only $((available_kb / 1048576)) GiB is available." >&2
  exit 1
fi

python3 -m venv "$runtime_dir"
"$runtime_dir/bin/python3" -m pip install --upgrade pip
"$runtime_dir/bin/python3" -m pip install \
  torch==2.8.0 \
  diffusers==0.36.0 \
  transformers==4.57.6 \
  'accelerate>=1.10,<2' \
  'safetensors>=0.5,<1'

HF_HOME="$model_cache" "$runtime_dir/bin/python3" - <<'PY'
import os
import torch
from diffusers import AutoencoderKL, DiffusionPipeline

model = os.environ.get("AVLI_IMAGE_MODEL", "segmind/SSD-1B")
vae_model = os.environ.get("AVLI_IMAGE_VAE", "madebyollin/sdxl-vae-fp16-fix")
vae = AutoencoderKL.from_pretrained(
    vae_model,
    torch_dtype=torch.float16,
    use_safetensors=True,
)
DiffusionPipeline.from_pretrained(
    model,
    torch_dtype=torch.float16,
    variant="fp16",
    use_safetensors=True,
    vae=vae,
)
print(f"Installed {model} fp16 with {vae_model}")
PY

# L7:PROVENANCE
# Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
# File: scripts/install_ssd1b_model.sh | Body-Hash: SHA-256:c421ce4f2c7a55b29995681b932c2d013f956cb0f3cc08b7a9ca1bf8dbd68316
# Chain-Hash: SHA-256:d2770e7835ed2ab1acf288d0735a1b44861cf3472669cd64deb886c0a1ec16e7 | Signed: 2026-07-24T05:00:23.964184+00:00
# This work is the intellectual property of Alberto Valido Delgado.
# Chain: 53 works. Verify: python3 provenance.py verify scripts/install_ssd1b_model.sh
# L7:PROVENANCE
