import argparse
from pathlib import Path
from typing import List

from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run YOLOv8 inference on images or a directory"
    )
    parser.add_argument(
        "--weights",
        type=Path,
        required=True,
        help="Path to trained model weights (e.g., runs/detect/exp/weights/best.pt)",
    )
    parser.add_argument(
        "--source",
        type=str,
        required=True,
        help="Image/video path, directory, or glob pattern",
    )
    parser.add_argument("--imgsz", type=int, default=640, help="Inference image size")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.45, help="NMS IoU threshold")
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        help="Device: 'cpu', '0', '0,1', or 'auto'",
    )
    parser.add_argument(
        "--save", action="store_true", help="Save annotated results to file"
    )
    parser.add_argument(
        "--save_txt", action="store_true", help="Save results as YOLO label files"
    )
    parser.add_argument(
        "--save_conf",
        action="store_true",
        help="Include confidences in saved txt labels",
    )
    parser.add_argument(
        "--project",
        type=Path,
        default=Path("runs/predict"),
        help="Project directory for outputs",
    )
    parser.add_argument(
        "--name", type=str, default="exp", help="Run name under project directory"
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Display results window (use source=0 for webcam)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not args.weights.exists():
        raise FileNotFoundError(f"Weights file not found: {args.weights}")

    model = YOLO(str(args.weights))
    results = model.predict(
        source=args.source,
        imgsz=args.imgsz,
        conf=args.conf,
        iou=args.iou,
        device=args.device,
        save=args.save,
        show=args.show,
        save_txt=args.save_txt,
        save_conf=args.save_conf,
        project=str(args.project),
        name=args.name,
        verbose=True,
    )

    # Print a concise summary
    num_items: List[int] = [len(r.boxes) if hasattr(r, "boxes") else 0 for r in results]
    total = sum(num_items)
    print(f"Processed {len(results)} item(s). Total detections: {total}")
    if args.save or args.save_txt:
        print(f"Outputs saved under: {args.project / args.name}")


if __name__ == "__main__":
    main()
