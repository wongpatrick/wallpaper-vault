import os
import shutil
from pathlib import Path
import cv2
import numpy as np

# Simple orientation constants (simplified rule: height > width => vertical)
VERT_AR = 9.0 / 16.0      # vertical: 9:16
HORZ_AR = 16.0 / 10.0     # horizontal: 16:10

def load_image(path):
    path = os.path.normpath(str(path))
    try:
        with open(path, 'rb') as f:
            data = f.read()
        nparr = np.asarray(bytearray(data), dtype=np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            return img
    except Exception:
        pass
    return None

def save_image_buffer(path, img):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)

    ext = p.suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}:
        ext = ".png"

    success, buf = cv2.imencode(ext, img)
    if not success:
        return False

    with open(str(p), "wb") as f:
        buf.tofile(f)
    return True

def save_image(path, img):
    if save_image_buffer(path, img):
        return True
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return cv2.imwrite(str(path), img)

def compute_saliency_map(img_gray):
    saliency = cv2.saliency.StaticSaliencySpectralResidual_create()
    (success, sal_map) = saliency.computeSaliency(img_gray)
    if not success or sal_map is None:
        return None
    sal_map = (sal_map * 255).astype('uint8')
    return sal_map

def window_sum(ii, x, y, cw, ch):
    x2 = x + cw
    y2 = y + ch
    return float(ii[y2, x2] - ii[y, x2] - ii[y2, x] + ii[y, x])

def best_crop_coords(W, H, cw, ch, sal_map_uint8):
    if sal_map_uint8 is None:
        return max(0, (W - cw) // 2), max(0, (H - ch) // 2)

    sal_f = sal_map_uint8.astype(np.float32) / 255.0
    thresh = max(0.01, float(sal_f.mean()))
    ys, xs = np.where(sal_f > thresh)
    if xs.size > 0:
        cx = xs.mean()
        cy = ys.mean()
    else:
        cx, cy = W / 2.0, H / 2.0

    ii = cv2.integral(sal_map_uint8.astype(np.float32))

    best_score = -1e30
    best_x, best_y = max(0, (W - cw) // 2), max(0, (H - ch) // 2)

    max_x = W - cw
    max_y = H - ch
    step_x = max(1, (W - cw) // 10)
    step_y = max(1, (H - ch) // 10)
    m = max(W, H) * 0.0008

    for y in range(0, max_y + 1, step_y):
        for x in range(0, max_x + 1, step_x):
            s = window_sum(ii, x, y, cw, ch)
            cx_win = x + cw / 2.0
            cy_win = y + ch / 2.0
            dist = ((cx_win - cx) ** 2 + (cy_win - cy) ** 2) ** 0.5
            score = s - dist * m
            if score > best_score:
                best_score = score
                best_x, best_y = int(x), int(y)

    return best_x, best_y

def orientation_for_dims(cw, ch):
    ratio = cw / ch if ch else 0
    vert_diff = abs(ratio - VERT_AR)
    horz_diff = abs(ratio - HORZ_AR)
    return "vertical" if vert_diff <= horz_diff else "horizontal"

def process_image(img_path, out_path, target_w=1920, target_h=1080, exact=False, downscale_max=1200, sort_output=True, auto_orient=False):
    img = load_image(img_path)
    if img is None:
        return False, None

    H, W = img.shape[:2]

    # Decide ar based on simple rule if auto_orient is on
    ar = None
    if auto_orient:
        orient = "vertical" if H > W else "horizontal"
        ar = VERT_AR if orient == "vertical" else HORZ_AR
    else:
        ar = float(target_w) / float(target_h) if target_h != 0 else 1.0

    # Downscale for saliency
    scale = 1.0
    max_dim = max(W, H)
    if max_dim > downscale_max:
        scale = downscale_max / float(max_dim)
        W_s = int(round(W * scale))
        H_s = int(round(H * scale))
        img_for_sal = cv2.resize(img, (W_s, H_s), interpolation=cv2.INTER_AREA)
    else:
        img_for_sal = img.copy()
        W_s, H_s = W, H

    if exact and (target_w <= W and target_h <= H):
        cw_s, ch_s = int(round(target_w * scale)), int(round(target_h * scale))
    else:
        if W_s / H_s >= ar:
            ch_s = min(H_s, int(round(W_s / ar)))
            cw_s = int(round(ar * ch_s))
        else:
            cw_s = min(W_s, int(round(H_s * ar)))
            ch_s = int(round(cw_s / ar)) if ar != 0 else H_s

        cw_s = max(1, cw_s)
        ch_s = max(1, ch_s)
        cw_s = min(cw_s, W_s)
        ch_s = min(ch_s, H_s)

    sal_map = compute_saliency_map(cv2.cvtColor(img_for_sal, cv2.COLOR_BGR2GRAY))
    x_s, y_s = best_crop_coords(W_s, H_s, cw_s, ch_s, sal_map)

    if scale < 1.0:
        inv = 1.0 / scale
        x = int(round(x_s * inv))
        y = int(round(y_s * inv))
        cw = int(round(cw_s * inv))
        ch = int(round(ch_s * inv))
    else:
        x, y, cw, ch = x_s, y_s, cw_s, ch_s

    x = max(0, min(x, max(0, W - cw)))
    y = max(0, min(y, max(0, H - ch)))
    cw = min(cw, W - x)
    ch = min(ch, H - y)

    crop = img[y:y+ch, x:x+cw]

    # Handle sorting into vertical/horizontal folders
    if sort_output:
        orientation = orientation_for_dims(cw, ch)
        dest_dir = Path(out_path).parent / orientation
        dest_dir.mkdir(parents=True, exist_ok=True)
        final_out_path = dest_dir / Path(out_path).name
    else:
        final_out_path = Path(out_path)
        final_out_path.parent.mkdir(parents=True, exist_ok=True)

    ok = save_image(str(final_out_path), crop)
    if not ok:
        return False, None

    return True, str(final_out_path)

def collect_image_paths(input_path, recursive=True):
    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".webp"}
    p = Path(input_path)
    if p.is_dir():
        if recursive:
            paths = [f for f in p.rglob("*") if f.suffix.lower() in image_exts]
        else:
            paths = [f for f in p.glob("*") if f.suffix.lower() in image_exts]
    elif p.is_file():
        paths = [p] if p.suffix.lower() in image_exts else []
    else:
        paths = []
    return sorted([str(p) for p in paths])
