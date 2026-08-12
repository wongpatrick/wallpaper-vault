"""
AI Tagging services for Wallpaper Vault.
Provides WD14 ONNX image tagging and mock tagging for testing.
"""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Tuple, Union
import csv
import gc
import numpy as np
import structlog
from PIL import Image
from huggingface_hub import hf_hub_download

logger = structlog.get_logger(__name__)

# Category mapping constants
CATEGORY_GENERAL = 0
CATEGORY_CHARACTER = 4

# Predefined Hugging Face repositories for ONNX Booru taggers
PREDEFINED_REPOS = {
    # WD v3 Models (Latest SOTA)
    "wd_eva02_large_v3": "SmilingWolf/wd-eva02-large-tagger-v3",
    "wd_swinv2_v3": "SmilingWolf/wd-swinv2-tagger-v3",
    "wd_convnext_v3": "SmilingWolf/wd-convnext-tagger-v3",
    "wd_vit_large_v3": "SmilingWolf/wd-vit-large-tagger-v3",
    "wd_vit_v3": "SmilingWolf/wd-vit-tagger-v3",
    # Legacy v2 Models
    "wd14_convnext_v2": "SmilingWolf/wd-v1-4-convnext-tagger-v2",
    "wd14_vit_v2": "SmilingWolf/wd-v1-4-vit-tagger-v2",
    "wd14_swinv2_v2": "SmilingWolf/wd-v1-4-swinv2-tagger-v2",
    "wd14_onnx": "SmilingWolf/wd-v1-4-convnext-tagger-v2",
}


def get_app_models_dir() -> Path:
    """Gets the OS-specific application data directory for storing models."""
    import os
    import sys
    home = Path.home()
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata:
            base_dir = Path(appdata)
        else:
            base_dir = home / "AppData" / "Roaming"
    elif sys.platform == "darwin":
        base_dir = home / "Library" / "Application Support"
    else:
        # Linux/Unix fallback
        base_dir = Path(os.environ.get("XDG_CONFIG_HOME", home / ".config"))
        
    return base_dir / "Wallpaper-Vault" / "models"


def resolve_model_identifier(
    model_source: str = "predefined",
    model_type: str = "wd_eva02_large_v3",
    custom_repo: str = None,
    custom_path: str = None
) -> str:
    """Resolves the human/repo identifier for a model configuration."""
    if model_source == "local":
        return custom_path or "local"
    elif model_source == "huggingface":
        return custom_repo or ""
    else:
        return PREDEFINED_REPOS.get(model_type, "SmilingWolf/wd-eva02-large-tagger-v3")


def is_model_cached(
    model_source: str = "predefined",
    model_type: str = "wd_eva02_large_v3",
    custom_repo: str = None,
    custom_path: str = None
) -> Tuple[bool, int]:
    """
    Checks whether the specified model's files are downloaded/available locally.
    Returns (is_cached, size_bytes).
    """
    if model_source == "local":
        if not custom_path:
            return False, 0
        path = Path(custom_path)
        if not path.exists() or not path.is_dir():
            return False, 0
        files = list(path.glob("*"))
        has_onnx = any(f.suffix.lower() == ".onnx" for f in files)
        has_csv = any(f.suffix.lower() == ".csv" for f in files)
        if not (has_onnx and has_csv):
            return False, 0
        total_bytes = sum(f.stat().st_size for f in files if f.is_file())
        return True, total_bytes

    repo_id = resolve_model_identifier(model_source, model_type, custom_repo, custom_path)
    if not repo_id:
        return False, 0

    app_models_dir = get_app_models_dir()
    repo_folder_name = f"models--{repo_id.replace('/', '--')}"
    repo_dir = app_models_dir / repo_folder_name

    if not repo_dir.exists() or not repo_dir.is_dir():
        return False, 0

    # Verify model.onnx and selected_tags.csv exist in snapshots
    snapshots_dir = repo_dir / "snapshots"
    if not snapshots_dir.exists() or not snapshots_dir.is_dir():
        return False, 0

    found_onnx = False
    found_csv = False
    for snapshot in snapshots_dir.iterdir():
        if snapshot.is_dir():
            if (snapshot / "model.onnx").exists():
                found_onnx = True
            if (snapshot / "selected_tags.csv").exists():
                found_csv = True

    if not (found_onnx and found_csv):
        return False, 0

    # Calculate directory size
    total_bytes = sum(f.stat().st_size for f in repo_dir.rglob("*") if f.is_file())
    return True, total_bytes


def download_model_files(
    model_source: str = "predefined",
    model_type: str = "wd_eva02_large_v3",
    custom_repo: str = None,
    custom_path: str = None
) -> Tuple[str, str, int]:
    """
    Downloads model.onnx and selected_tags.csv to the local app models directory if not already cached.
    Returns (model_path, csv_path, total_size_bytes).
    """
    if model_source == "local":
        if not custom_path:
            raise ValueError("Model source is 'local' but no custom path was provided.")
        path = Path(custom_path)
        if not path.exists() or not path.is_dir():
            raise ValueError(f"Custom local model directory '{custom_path}' does not exist or is not a directory.")
        files = list(path.glob("*"))
        onnx_files = [f for f in files if f.suffix.lower() == ".onnx"]
        csv_files = [f for f in files if f.suffix.lower() == ".csv"]
        if not onnx_files:
            raise ValueError(f"No '.onnx' file found in custom model directory '{custom_path}'.")
        if not csv_files:
            raise ValueError(f"No '.csv' file found in custom model directory '{custom_path}'.")
        total_size = sum(f.stat().st_size for f in files if f.is_file())
        return str(onnx_files[0]), str(csv_files[0]), total_size

    repo_id = resolve_model_identifier(model_source, model_type, custom_repo, custom_path)
    if not repo_id:
        raise ValueError("Invalid repository identifier.")

    app_models_dir = get_app_models_dir()
    app_models_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Downloading/verifying Hugging Face model files", repo_id=repo_id)
    model_path = hf_hub_download(repo_id=repo_id, filename="model.onnx", cache_dir=str(app_models_dir))
    csv_path = hf_hub_download(repo_id=repo_id, filename="selected_tags.csv", cache_dir=str(app_models_dir))

    _, total_size = is_model_cached(model_source, model_type, custom_repo, custom_path)
    return model_path, csv_path, total_size


def clear_tagger_instances():
    """Unload all cached tagger instances and free system memory."""
    global _tagger_instances
    _tagger_instances.clear()
    gc.collect()


class ImageTagger(ABC):
    @abstractmethod
    def tag_image(
        self,
        image_path: Union[str, Path, Image.Image],
        threshold: float = 0.35
    ) -> Tuple[List[str], List[str]]:
        """
        Analyze an image and return general and character tags.
        
        Args:
            image_path: Path to the image file or a PIL Image instance.
            threshold: Confidence threshold for returned tags.
            
        Returns:
            Tuple[List[str], List[str]]: (general_tags, character_tags)
        """
        pass


class MockTagger(ImageTagger):
    def tag_image(
        self,
        image_path: Union[str, Path, Image.Image],
        threshold: float = 0.35
    ) -> Tuple[List[str], List[str]]:
        logger.info("Mock tagging image", path=str(image_path) if not isinstance(image_path, Image.Image) else "PIL.Image")
        return ["anime", "girl"], []


class WD14OnnxTagger(ImageTagger):
    def __init__(
        self,
        model_source: str = "predefined",
        model_type: str = "wd14_onnx",
        custom_repo: str = None,
        custom_path: str = None
    ):
        """
        Initialize the WD14 ONNX Tagger.
        Downloads model weights and tag mapping from Hugging Face if not already present.
        """
        logger.info("Initializing WD14 ONNX Tagger", 
                    model_source=model_source,
                    model_type=model_type,
                    custom_repo=custom_repo,
                    custom_path=custom_path)
        try:
            import onnxruntime as ort
        except ImportError as e:
            logger.error("onnxruntime is not installed. Please add it to dependencies.", error=str(e))
            raise e
            
        try:
            # Download/resolve model weights and csv mappings
            self.model_path, self.csv_path, _ = download_model_files(
                model_source=model_source,
                model_type=model_type,
                custom_repo=custom_repo,
                custom_path=custom_path
            )
            
            # Load ONNX Inference Session
            available_providers = ort.get_available_providers()
            providers = []
            if "CUDAExecutionProvider" in available_providers:
                providers.append("CUDAExecutionProvider")
            providers.append("CPUExecutionProvider")
            
            self.session = ort.InferenceSession(self.model_path, providers=providers)
            
            # Get expected input details
            input_meta = self.session.get_inputs()[0]
            self.input_name = input_meta.name
            shape = input_meta.shape # e.g. [1, 448, 448, 3] or [1, 3, 448, 448]
            
            # Parse input dims and format dynamically
            if len(shape) == 4:  # noqa: PLR2004
                if isinstance(shape[1], int) and shape[1] > 3:  # noqa: PLR2004
                    self.target_height = shape[1]
                    self.target_width = shape[2]
                    self.nchw = False
                elif isinstance(shape[2], int) and shape[2] > 3:  # noqa: PLR2004
                    self.target_height = shape[2]
                    self.target_width = shape[3]
                    self.nchw = True
                else:
                    self.target_height = 448
                    self.target_width = 448
                    self.nchw = False
            else:
                self.target_height = 448
                self.target_width = 448
                self.nchw = False
                
            logger.info("ONNX Session loaded", input_name=self.input_name, 
                        shape=shape, target_height=self.target_height, 
                        target_width=self.target_width, nchw=self.nchw)
            
            self._load_tags()
            
        except Exception as e:
            logger.error("Failed to initialize WD14OnnxTagger", error=str(e))
            raise e
            
    def _load_tags(self):
        self.tag_names = []
        self.tag_categories = []
        
        with open(self.csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                # selected_tags.csv has columns: tag_id, name, category, count
                self.tag_names.append(row["name"])
                self.tag_categories.append(int(row["category"]))
                
        logger.info("Loaded tags mapping", total_tags=len(self.tag_names))

    def preprocess_image(self, image: Image.Image) -> np.ndarray:
        """
        Preprocess a PIL image for the model (resize with aspect-ratio-preserving padding,
        BGR channels, scaling to float32).
        """
        # Convert RGBA to RGB using a white background
        if image.mode == "RGBA":
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")
            
        # Resize maintaining aspect ratio
        ratio = min(self.target_width / image.size[0], self.target_height / image.size[1])
        new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
        image = image.resize(new_size, Image.Resampling.LANCZOS)
        
        # Pad to target dimensions (white background)
        square = Image.new("RGB", (self.target_width, self.target_height), (255, 255, 255))
        paste_x = (self.target_width - new_size[0]) // 2
        paste_y = (self.target_height - new_size[1]) // 2
        square.paste(image, (paste_x, paste_y))
        
        # Convert to numpy array and swap channels RGB -> BGR
        image_array = np.array(square, dtype=np.float32)
        image_array = image_array[:, :, ::-1]  # RGB to BGR
        
        # Transpose if NCHW format is expected
        if self.nchw:
            image_array = image_array.transpose(2, 0, 1) # HWC to CHW
            
        # Add batch dimension
        image_array = np.expand_dims(image_array, axis=0)
        return image_array

    def tag_image(
        self,
        image_input: Union[str, Path, Image.Image],
        threshold: float = 0.35
    ) -> Tuple[List[str], List[str]]:
        """
        Tags an image and returns a tuple of lists: (general_tags, character_tags).
        """
        if isinstance(image_input, (str, Path)):
            img = Image.open(image_input)
        else:
            img = image_input
            
        # Preprocess
        input_data = self.preprocess_image(img)
        
        # Run inference
        outputs = self.session.run(None, {self.input_name: input_data})
        probs = outputs[0][0]
        
        # Apply sigmoid to get probabilities (logits are output by the model)
        probs = 1.0 / (1.0 + np.exp(-probs))
        
        general_tags = []
        character_tags = []
        
        for i, prob in enumerate(probs):
            if prob >= threshold:
                tag_name = self.tag_names[i]
                category = self.tag_categories[i]
                
                # Replace underscores with spaces for standard tag formatting in DB
                tag_name_clean = tag_name.replace("_", " ")
                if category == CATEGORY_GENERAL:
                    general_tags.append(tag_name_clean)
                elif category == CATEGORY_CHARACTER:
                    character_tags.append(tag_name_clean)
                    
        return general_tags, character_tags

_tagger_instances = {}

def get_tagger(
    model_source: str = "predefined",
    model_type: str = "wd14_onnx",
    custom_repo: str = None,
    custom_path: str = None
) -> ImageTagger:
    """
    Factory function to get or create a tagger instance. Caches the instances.
    """
    global _tagger_instances
    cache_key = (model_source, model_type, custom_repo, custom_path)
    if cache_key not in _tagger_instances:
        if model_type == "mock":
            _tagger_instances[cache_key] = MockTagger()
        else:
            _tagger_instances[cache_key] = WD14OnnxTagger(
                model_source=model_source,
                model_type=model_type,
                custom_repo=custom_repo,
                custom_path=custom_path
            )
    return _tagger_instances[cache_key]
