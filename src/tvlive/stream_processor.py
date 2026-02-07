#!/usr/bin/env python3
"""
M3U8 Stream Processor
Captures video stream from m3u8 URL and processes frames.
Future: YOLO object detection integration.
"""

import cv2
import sys
import time
import argparse
from datetime import datetime
from ultralytics import YOLO
import easyocr


class StreamProcessor:
    """Processes m3u8 video streams frame by frame with YOLO detection."""
    
    def __init__(self, stream_url: str, display: bool = False, model_name: str = "yolo11n.pt", confidence: float = 0.5, enable_ocr: bool = False):
        self.stream_url = stream_url
        self.display = display
        self.cap = None
        self.frame_count = 0
        self.start_time = None
        self.confidence = confidence
        self.enable_ocr = enable_ocr
        self.ocr_reader = None
        
        # Load YOLO model
        print(f"Loading YOLO model: {model_name}")
        self.model = YOLO(model_name)
        print("✅ YOLO model loaded!")
        
        # Load OCR reader if enabled
        if self.enable_ocr:
            print("Loading OCR model...")
            self.ocr_reader = easyocr.Reader(['en', 'ru'], gpu=False)
            print("✅ OCR model loaded!")
        
    def connect(self) -> bool:
        """Connect to the m3u8 stream."""
        print(f"[{datetime.now().isoformat()}] Connecting to stream...")
        print(f"URL: {self.stream_url}")
        
        self.cap = cv2.VideoCapture(self.stream_url)
        
        if not self.cap.isOpened():
            print("❌ Failed to open stream")
            return False
            
        # Get stream properties
        width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = self.cap.get(cv2.CAP_PROP_FPS)
        
        print(f"✅ Connected!")
        print(f"   Resolution: {width}x{height}")
        print(f"   FPS: {fps}")
        
        self.start_time = time.time()
        return True
    
    def process_frame(self, frame):
        """
        Process a single frame with YOLO detection and optional OCR.
        """
        # Run YOLO inference
        results = self.model(frame, conf=self.confidence, verbose=False)
        
        detections = []
        for result in results:
            for box in result.boxes:
                cls_id = int(box.cls[0])
                cls_name = self.model.names[cls_id]
                conf = float(box.conf[0])
                bbox = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
                
                detections.append({
                    "class": cls_name,
                    "confidence": round(conf, 3),
                    "bbox": [round(x, 1) for x in bbox]
                })
        
        # Run OCR if enabled
        ocr_texts = []
        if self.enable_ocr and self.ocr_reader:
            try:
                ocr_results = self.ocr_reader.readtext(frame, detail=1)
                for result in ocr_results:
                    text = result[1]
                    confidence = round(float(result[2]), 3)
                    if confidence > 0.3:  # Filter low confidence
                        ocr_texts.append({
                            "text": text,
                            "confidence": confidence
                        })
            except Exception as e:
                # Silently skip OCR errors to not disrupt stream
                pass
        
        return {
            "frame_number": self.frame_count,
            "timestamp": round(time.time() - self.start_time, 2),
            "detections": detections,
            "text": ocr_texts,
            "annotated_frame": results[0].plot() if self.display else None
        }
    
    def run(self, max_frames: int = None):
        """Main processing loop."""
        if not self.connect():
            return
            
        print("\n🎬 Starting stream processing (Ctrl+C to stop)...\n")
        
        try:
            while True:
                ret, frame = self.cap.read()
                
                if not ret:
                    print("⚠️  Frame read failed, reconnecting...")
                    time.sleep(1)
                    if not self.connect():
                        break
                    continue
                
                self.frame_count += 1
                
                # Process frame
                result = self.process_frame(frame)
                
                # Log every 30 frames (~1 sec at 30fps)
                if self.frame_count % 30 == 0:
                    elapsed = time.time() - self.start_time
                    fps = self.frame_count / elapsed if elapsed > 0 else 0
                    det_summary = {}
                    for d in result["detections"]:
                        det_summary[d["class"]] = det_summary.get(d["class"], 0) + 1
                    log_msg = f"📊 Frame #{self.frame_count} | FPS: {fps:.1f} | Objects: {det_summary if det_summary else 'none'}"
                    if result["text"]:
                        texts = [t["text"] for t in result["text"][:3]]
                        log_msg += f" | Text: {texts}"
                    print(log_msg)
                
                # Display if requested
                if self.display:
                    display_frame = result["annotated_frame"] if result["annotated_frame"] is not None else frame
                    cv2.imshow('YOLO Stream', display_frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        print("\n🛑 Stopped by user (q pressed)")
                        break
                
                # Check max frames limit
                if max_frames and self.frame_count >= max_frames:
                    print(f"\n✅ Reached max frames limit ({max_frames})")
                    break
                    
        except KeyboardInterrupt:
            print("\n🛑 Stopped by user (Ctrl+C)")
        finally:
            self.cleanup()
    
    def cleanup(self):
        """Release resources."""
        if self.cap:
            self.cap.release()
        if self.display:
            cv2.destroyAllWindows()
            
        elapsed = time.time() - self.start_time if self.start_time else 0
        print(f"\n📈 Session stats:")
        print(f"   Total frames: {self.frame_count}")
        print(f"   Duration: {elapsed:.1f}s")
        if elapsed > 0:
            print(f"   Average FPS: {self.frame_count / elapsed:.1f}")


def main():
    parser = argparse.ArgumentParser(
        description='Process m3u8 video stream'
    )
    parser.add_argument(
        'url',
        nargs='?',
        default='https://river-5-544.rtbcdn.ru/stream/genetta-304.m9.rutube.ru/7eGJ_bvD_a9ADXWUizEJsA/1770565498/d01241e9fd2bc2d65dbf6d74cca02f89/1080p_stream.m3u8',
        help='M3U8 stream URL'
    )
    parser.add_argument(
        '--display', '-d',
        action='store_true',
        help='Display video in window'
    )
    parser.add_argument(
        '--max-frames', '-m',
        type=int,
        default=None,
        help='Maximum frames to process (default: unlimited)'
    )
    parser.add_argument(
        '--model',
        type=str,
        default='yolo11n.pt',
        help='YOLO model to use (default: yolo11n.pt)'
    )
    parser.add_argument(
        '--confidence', '-c',
        type=float,
        default=0.5,
        help='Detection confidence threshold (default: 0.5)'
    )
    parser.add_argument(
        '--ocr',
        action='store_true',
        help='Enable OCR text recognition (slower)'
    )
    
    args = parser.parse_args()
    
    processor = StreamProcessor(
        stream_url=args.url,
        display=args.display,
        model_name=args.model,
        confidence=args.confidence,
        enable_ocr=args.ocr
    )
    processor.run(max_frames=args.max_frames)


if __name__ == '__main__':
    main()
