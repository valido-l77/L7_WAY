#!/usr/bin/env python3
"""Persistent SSD-1B text-to-image worker for Apple Silicon."""

import base64
import io
import json
import os
import sys

import torch
from diffusers import AutoencoderKL, DiffusionPipeline


MODEL_ID = os.environ.get("AVLI_IMAGE_MODEL", "segmind/SSD-1B")
VAE_ID = os.environ.get("AVLI_IMAGE_VAE", "madebyollin/sdxl-vae-fp16-fix")
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
PRECISION = os.environ.get("AVLI_IMAGE_PRECISION", "float32")
DTYPE = {
    "float16": torch.float16,
    "bfloat16": torch.bfloat16,
    "float32": torch.float32,
}.get(PRECISION)
if DTYPE is None:
    raise ValueError(f"Unsupported AVLI_IMAGE_PRECISION: {PRECISION}")


def emit(message):
    sys.stdout.write(json.dumps(message, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def load_pipeline():
    vae = AutoencoderKL.from_pretrained(
        VAE_ID,
        torch_dtype=DTYPE,
        use_safetensors=True,
    )
    pipeline = DiffusionPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=DTYPE,
        variant="fp16",
        use_safetensors=True,
        vae=vae,
    )
    pipeline.to(DEVICE)
    pipeline.enable_attention_slicing()
    if hasattr(pipeline.vae, "enable_slicing"):
        pipeline.vae.enable_slicing()
    pipeline.set_progress_bar_config(disable=True)
    return pipeline


PIPELINE = load_pipeline()
emit({"type": "ready", "model": MODEL_ID, "device": DEVICE})


for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        seed = int(request["seed"]) & 0xFFFFFFFF
        generator = torch.Generator(device="cpu").manual_seed(seed)
        with torch.inference_mode():
            image = PIPELINE(
                prompt=request["prompt"],
                negative_prompt=request.get("negative_prompt") or None,
                width=int(request["width"]),
                height=int(request["height"]),
                num_inference_steps=int(request.get("steps", 25)),
                guidance_scale=float(request.get("guidance_scale", 9)),
                generator=generator,
            ).images[0]
        output = io.BytesIO()
        image.save(output, format="PNG", optimize=True)
        emit({
            "id": request["id"],
            "image_base64": base64.b64encode(output.getvalue()).decode("ascii"),
            "seed": seed,
            "width": image.width,
            "height": image.height,
            "steps": int(request.get("steps", 25)),
            "guidance_scale": float(request.get("guidance_scale", 9)),
            "device": DEVICE,
            "precision": PRECISION,
            "model_id": MODEL_ID,
            "model_revision": "fp16",
        })
        if DEVICE == "mps":
            torch.mps.empty_cache()
    except Exception as error:
        emit({"id": request.get("id") if isinstance(request, dict) else None, "error": str(error)})

# L7:PROVENANCE
# Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
# File: scripts/ssd_image_worker.py | Body-Hash: SHA-256:c44f8e62a58aebf8ff086454daccf32f44c5080a2ad36799dbee1b2070b5914d
# Chain-Hash: SHA-256:63fa3fe45fe4f368d45ec2a7fd4e58257b7b0bd8a2135cc2d280de8d8fc04432 | Signed: 2026-07-24T05:00:23.936902+00:00
# This work is the intellectual property of Alberto Valido Delgado.
# Chain: 52 works. Verify: python3 provenance.py verify scripts/ssd_image_worker.py
# L7:PROVENANCE
