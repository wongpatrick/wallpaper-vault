"""
Script to pre-download the WD14 ONNX model files at app build/install time.
This avoids delays during the first wallpaper import.
"""
import sys
from pathlib import Path

# Add the backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

def main():
    print("Starting pre-download for WD14 ONNX Tagger model...")
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("Error: huggingface-hub is not installed in the current environment.", file=sys.stderr)
        print("Please run 'uv sync' first to install all dependencies.", file=sys.stderr)
        sys.exit(1)

    model_repo = "SmilingWolf/wd-v1-4-convnext-tagger-v2"
    files_to_download = ["model.onnx", "selected_tags.csv"]

    for filename in files_to_download:
        print(f"Downloading {filename} from {model_repo}...")
        try:
            local_path = hf_hub_download(repo_id=model_repo, filename=filename)
            print(f"Successfully downloaded/verified {filename}. Cached at: {local_path}")
        except Exception as e:
            print(f"Error downloading {filename}: {e}", file=sys.stderr)
            sys.exit(1)

    print("WD14 ONNX Tagger bootstrap completed successfully!")

if __name__ == "__main__":
    main()
