"""Kisara image Space: draws clip pictures on Hugging Face ZeroGPU.

Upload this file together with requirements.txt and README.md into a Gradio Space, set the Space's
hardware to ZeroGPU, and Kisara can use it as its image service — free, with no credits and no
API keys. The app calls the `generate` function through the Space's Gradio API.

Which model runs is decided in this order:

1. A Space **variable** named `MODEL_ID` — the model you write there is tried first. Set it from
   Space settings › Variables and secrets, so switching model never means editing this file.
2. `black-forest-labs/FLUX.1-schnell` — the best free model, but its repository is *gated*: accept
   the licence on its model page and add a read token as the secret `HF_TOKEN`, or it answers 401.
3. `Alpha-VLLM/Lumina-Image-2.0` — open, modern, close to FLUX in quality.
4. `Efficient-Large-Model/Sana_1600M_1024px_diffusers` — open and small, so it loads fastest.
5. `playgroundai/playground-v2.5-1024px-aesthetic` — SDXL tier; kept only so the Space always
   comes up with something instead of dying.
"""

import os

import gradio as gr
import spaces
import torch
from diffusers import DiffusionPipeline

MODEL_CHAIN = [
    os.environ.get("MODEL_ID", "").strip(),
    "black-forest-labs/FLUX.1-schnell",
    "Alpha-VLLM/Lumina-Image-2.0",
    "Efficient-Large-Model/Sana_1600M_1024px_diffusers",
    "playgroundai/playground-v2.5-1024px-aesthetic",
]

# Each family wants a different number of steps and a different amount of guidance. A distilled model
# (schnell) runs without guidance at all; the others need it, or the picture comes out flat.
PRESETS = {
    "flux": {"min_steps": 1, "max_steps": 8, "guidance": 0.0, "step_scale": 1},
    "lumina": {"min_steps": 20, "max_steps": 45, "guidance": 4.0, "step_scale": 8},
    "sana": {"min_steps": 15, "max_steps": 40, "guidance": 4.5, "step_scale": 8},
    "default": {"min_steps": 20, "max_steps": 40, "guidance": 7.0, "step_scale": 8},
}
MAX_STEPS = 8  # what the UI slider offers; the real ceiling comes from the family preset


def family_of(model: str) -> str:
    """Which preset a model needs, read from its name."""
    name = model.lower()
    if "flux" in name:
        return "flux"
    if "lumina" in name:
        return "lumina"
    if "sana" in name:
        return "sana"
    return "default"


device = "cuda" if torch.cuda.is_available() else "cpu"


def load():
    """Loads the first model of the chain that works, so one blocked repository cannot kill the Space."""
    last = None
    for model in MODEL_CHAIN:
        if not model:
            continue
        # Some repositories ship both fp32 and fp16 weights; fp16 halves the download and fits ZeroGPU.
        for extra in ({"variant": "fp16"}, {}):
            try:
                print(f"[kisara] loading {model} {extra} ...", flush=True)
                pipe = DiffusionPipeline.from_pretrained(model, torch_dtype=torch.bfloat16, **extra).to(device)
                print(f"[kisara] READY: {model}", flush=True)
                return pipe, model
            except Exception as e:
                last = e
                print(f"[kisara] {model} {extra} failed: {type(e).__name__}: {str(e)[:300]}", flush=True)
    raise RuntimeError(f"Tidak ada model yang bisa dimuat. Error terakhir: {last}")


pipe, MODEL = load()
FAMILY = family_of(MODEL)


@spaces.GPU(duration=90)
def generate(prompt: str, width: int = 1024, height: int = 576, steps: int = 4):
    """Draws one picture. Kisara calls this through the Gradio API."""
    preset = PRESETS[FAMILY]
    kwargs = {
        "prompt": prompt,
        "width": int(width),
        "height": int(height),
        "num_inference_steps": max(preset["min_steps"], min(preset["max_steps"], int(steps) * preset["step_scale"])),
        "guidance_scale": preset["guidance"],
    }
    return pipe(**kwargs).images[0]


def which_model() -> str:
    """The model this Space actually loaded — so the app can show it instead of leaving you guessing."""
    return MODEL


with gr.Blocks(title="Kisara — Image") as demo:
    gr.Markdown(
        f"Draws the clip pictures for **Kisara** with `{MODEL}`.\n\n"
        "Kisara calls this Space from its Settings, so you normally never touch this page. "
        "It is left open so you can try a prompt yourself.\n\n"
        "**Want a different model?** Add a Space *variable* named `MODEL_ID` with the model you want "
        "(for example `Alpha-VLLM/Lumina-Image-2.0`) and restart the Space."
    )
    prompt = gr.Textbox(label="Prompt", lines=5, placeholder="Describe the picture...")
    with gr.Row():
        width = gr.Slider(256, 1536, value=1024, step=16, label="Width")
        height = gr.Slider(256, 1536, value=576, step=16, label="Height")
        steps = gr.Slider(1, MAX_STEPS, value=4, step=1, label="Steps")
    run = gr.Button("Generate", variant="primary")
    out = gr.Image(label="Result", type="pil", format="png")
    run.click(generate, [prompt, width, height, steps], out)
    prompt.submit(generate, [prompt, width, height, steps], out)

    # A named endpoint the app can call to report the active model in its Settings.
    with gr.Accordion("Model aktif", open=False):
        model_out = gr.Textbox(label="Model", value=MODEL, interactive=False)
    probe = gr.Button("Cek model", visible=False)
    probe.click(which_model, None, model_out)


demo.launch()
