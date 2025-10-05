import argparse
import os
import random
from pathlib import Path
from typing import List

import numpy as np
import torch
from ultralytics import YOLO


def read_class_names(classes_file: Path) -> List[str]:
    if not classes_file.exists():
        raise FileNotFoundError(f"Classes file not found: {classes_file}")
    with classes_file.open("r", encoding="utf-8") as f:
        names = [line.strip() for line in f.readlines() if line.strip()]
    if not names:
        raise ValueError(f"No classes found in {classes_file}")
    return names


def set_global_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)


def collect_images(images_dir: Path) -> List[Path]:
    supported_exts = (".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff")
    all_images = []
    for ext in supported_exts:
        all_images.extend(sorted(images_dir.glob(f"*{ext}")))
    return all_images


def filter_images_with_labels(image_paths: List[Path], labels_dir: Path) -> List[Path]:
    filtered = []
    for img_path in image_paths:
        label_path = labels_dir / f"{img_path.stem}.txt"
        if label_path.exists():
            filtered.append(img_path)
    return filtered


def write_split_files(
    image_paths: List[Path], split_dir: Path, val_split: float, seed: int
) -> tuple[Path, Path]:
    split_dir.mkdir(parents=True, exist_ok=True)
    random.Random(seed).shuffle(image_paths)
    split_index = int(len(image_paths) * (1.0 - val_split))
    train_images = image_paths[:split_index]
    val_images = image_paths[split_index:]

    train_txt = split_dir / "train.txt"
    val_txt = split_dir / "val.txt"
    with train_txt.open("w", encoding="utf-8") as f:
        for p in train_images:
            f.write(str(p.resolve()) + "\n")
    with val_txt.open("w", encoding="utf-8") as f:
        for p in val_images:
            f.write(str(p.resolve()) + "\n")
    return train_txt, val_txt


def write_dataset_yaml(
    names: List[str], train_txt: Path, val_txt: Path, yaml_path: Path
) -> Path:
    yaml_path.parent.mkdir(parents=True, exist_ok=True)
    # Minimal YAML without requiring PyYAML
    content_lines = [
        f"train: {train_txt.resolve()}",
        f"val: {val_txt.resolve()}",
        "names:",
    ]
    for idx, name in enumerate(names):
        content_lines.append(f"  {idx}: {name}")
    yaml_path.write_text("\n".join(content_lines) + "\n", encoding="utf-8")
    return yaml_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a YOLOv8 model on local dataset"
    )
    cwd = Path(__file__).resolve().parent

    parser.add_argument(
        "--data_root",
        type=Path,
        default=cwd,
        help="Root directory containing images/, labels/, classes.txt",
    )
    parser.add_argument(
        "--images_dir",
        type=str,
        default="images",
        help="Images directory (relative to data_root or absolute path)",
    )
    parser.add_argument(
        "--labels_dir",
        type=str,
        default="labels",
        help="Labels directory (relative to data_root or absolute path)",
    )
    parser.add_argument(
        "--classes_file",
        type=str,
        default="classes.txt",
        help="Path to classes.txt (relative to data_root or absolute path)",
    )

    parser.add_argument(
        "--model",
        type=str,
        default="yolov8n.pt",
        help="Model to train (e.g., yolov8n.pt)",
    )
    parser.add_argument(
        "--epochs", type=int, default=100, help="Number of training epochs"
    )
    parser.add_argument(
        "--imgsz", type=int, default=640, help="Image size for training"
    )
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        help="Device to use: 'cpu', '0', '0,1', or 'auto'",
    )
    parser.add_argument(
        "--val_split", type=float, default=0.2, help="Validation split fraction [0,1)"
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument(
        "--name",
        type=str,
        default="yolov8",
        help="Training run name (under runs/detect/<name>)",
    )

    return parser.parse_args()


def resolve_path(base: Path, maybe_rel: str) -> Path:
    p = Path(maybe_rel)
    return p if p.is_absolute() else (base / p)


def main() -> None:
    args = parse_args()

    data_root: Path = args.data_root.resolve()
    images_dir = resolve_path(data_root, args.images_dir)
    labels_dir = resolve_path(data_root, args.labels_dir)
    classes_file = resolve_path(data_root, args.classes_file)

    if not images_dir.exists():
        raise FileNotFoundError(f"Images directory not found: {images_dir}")
    if not labels_dir.exists():
        raise FileNotFoundError(f"Labels directory not found: {labels_dir}")

    class_names = read_class_names(classes_file)
    set_global_seed(args.seed)

    all_images = collect_images(images_dir)
    if not all_images:
        raise RuntimeError(f"No images found in {images_dir}")
    images_with_labels = filter_images_with_labels(all_images, labels_dir)
    if not images_with_labels:
        raise RuntimeError("No images with corresponding YOLO label files were found.")

    split_dir = data_root / "splits"
    train_txt, val_txt = write_split_files(
        images_with_labels, split_dir, args.val_split, args.seed
    )

    dataset_yaml = split_dir / "dataset.yaml"
    write_dataset_yaml(class_names, train_txt, val_txt, dataset_yaml)

    print(
        f"Found {len(images_with_labels)} labeled images. Training/val split written to: {split_dir}"
    )
    print(f"Dataset YAML: {dataset_yaml}")

    model = YOLO(args.model)
    model.train(
        data=str(dataset_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        name=args.name,
        device=args.device,
        seed=args.seed,
        cache=True,
        workers=8,
        verbose=True,
    )


if __name__ == "__main__":
    main()
