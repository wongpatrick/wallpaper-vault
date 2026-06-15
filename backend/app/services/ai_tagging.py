"""
AI Tagging services for Wallpaper Vault.
Provides WD14 ONNX image tagging and mock tagging for testing.
"""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Tuple, Union
import csv
import numpy as np
import structlog
from PIL import Image
from huggingface_hub import hf_hub_download

logger = structlog.get_logger(__name__)

# Category mapping constants
CATEGORY_GENERAL = 0
CATEGORY_CHARACTER = 4

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
            # Resolve model and tag file paths
            if model_source == "local":
                if not custom_path:
                    raise ValueError("Model source is 'local' but no custom path was provided.")
                path = Path(custom_path)
                if not path.exists() or not path.is_dir():
                    raise ValueError(f"Custom local model directory '{custom_path}' does not exist or is not a directory.")
                
                # Scan for first .onnx and first .csv file
                files = list(path.glob("*"))
                onnx_files = [f for f in files if f.suffix.lower() == ".onnx"]
                csv_files = [f for f in files if f.suffix.lower() == ".csv"]
                
                if not onnx_files:
                    raise ValueError(f"No '.onnx' file found in custom model directory '{custom_path}'.")
                if not csv_files:
                    raise ValueError(f"No '.csv' file found in custom model directory '{custom_path}'.")
                    
                self.model_path = str(onnx_files[0])
                self.csv_path = str(csv_files[0])
                logger.info("Local model files located successfully", model_path=self.model_path, csv_path=self.csv_path)
            else:
                if model_source == "huggingface":
                    if not custom_repo:
                        raise ValueError("Model source is 'huggingface' but no custom repository ID was provided.")
                    model_repo = custom_repo
                else:
                    predefined_repos = {
                        "wd14_onnx": "SmilingWolf/wd-v1-4-convnext-tagger-v2",
                        "wd14_convnext_v2": "SmilingWolf/wd-v1-4-convnext-tagger-v2",
                        "wd14_vit_v2": "SmilingWolf/wd-v1-4-vit-tagger-v2",
                        "wd14_swinv2_v2": "SmilingWolf/wd-v1-4-swinv2-tagger-v2",
                        "wd_vit_large_v3": "SmilingWolf/wd-vit-large-tagger-v3"
                    }
                    model_repo = predefined_repos.get(model_type, "SmilingWolf/wd-v1-4-convnext-tagger-v2")
                
                logger.info("Downloading/loading model from Hugging Face", repo_id=model_repo)
                
                app_models_dir = get_app_models_dir()
                self.model_path = hf_hub_download(repo_id=model_repo, filename="model.onnx", cache_dir=str(app_models_dir))
                self.csv_path = hf_hub_download(repo_id=model_repo, filename="selected_tags.csv", cache_dir=str(app_models_dir))
                logger.info("Hugging Face model files loaded successfully from AppData", model_path=self.model_path, csv_path=self.csv_path)
            
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
