"use client";

import React from "react";
import { Dialog } from "@/components/ui/Dialog/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

interface ImageFormatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageFile: File | null;
  onConfirm: (processedImageUrl: string) => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageFormatDialog: React.FC<ImageFormatDialogProps> = ({
  open,
  onOpenChange,
  imageFile,
  onConfirm,
}) => {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [cropMode, setCropMode] = React.useState<boolean>(false);
  const [cropArea, setCropArea] = React.useState<CropArea | null>(null);
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const [dragStart, setDragStart] = React.useState<{ x: number; y: number } | null>(null);
  const [naturalSize, setNaturalSize] = React.useState<{ width: number; height: number } | null>(null);
  const [displaySize, setDisplaySize] = React.useState<{ width: number; height: number } | null>(null);
  
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Calculate final output dimensions
  const finalDimensions = React.useMemo(() => {
    if (!naturalSize || !displaySize) return null;
    
    let finalWidth = naturalSize.width;
    let finalHeight = naturalSize.height;
    
    if (cropMode && cropArea) {
      // If cropping, use crop dimensions in natural coordinates
      const displayToNaturalScale = naturalSize.width / displaySize.width;
      finalWidth = Math.round(cropArea.width * displayToNaturalScale);
      finalHeight = Math.round(cropArea.height * displayToNaturalScale);
    }
    
    return { finalWidth, finalHeight };
  }, [naturalSize, displaySize, cropMode, cropArea]);

  // Load image when file changes
  React.useEffect(() => {
    if (!imageFile) {
      setImageUrl(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setImageUrl(url);
      setCropArea(null);
      setCropMode(false);
    };
    reader.readAsDataURL(imageFile);
  }, [imageFile]);

  // Get natural image dimensions when image loads
  React.useEffect(() => {
    if (!imageRef.current || !imageUrl) return;

    const img = imageRef.current;
    const handleLoad = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      setDisplaySize({ width: img.width, height: img.height });
    };

    if (img.complete) {
      handleLoad();
    } else {
      img.addEventListener("load", handleLoad);
      return () => img.removeEventListener("load", handleLoad);
    }
  }, [imageUrl]);

  // Initialize crop area when entering crop mode
  React.useEffect(() => {
    if (cropMode && displaySize && !cropArea) {
      // Default crop area: center 80% of the image
      const cropWidth = Math.max(50, Math.round(displaySize.width * 0.8));
      const cropHeight = Math.max(50, Math.round(displaySize.height * 0.8));
      const cropX = Math.round((displaySize.width - cropWidth) / 2);
      const cropY = Math.round((displaySize.height - cropHeight) / 2);
      setCropArea({ x: cropX, y: cropY, width: cropWidth, height: cropHeight });
    }
  }, [cropMode, displaySize, cropArea]);

  // Adjust crop area when display size changes
  React.useEffect(() => {
    if (cropMode && cropArea && displaySize) {
      // Ensure crop area stays within bounds
      const maxX = displaySize.width - cropArea.width;
      const maxY = displaySize.height - cropArea.height;
      const newX = Math.max(0, Math.min(cropArea.x, maxX));
      const newY = Math.max(0, Math.min(cropArea.y, maxY));
      const newWidth = Math.min(cropArea.width, displaySize.width - newX);
      const newHeight = Math.min(cropArea.height, displaySize.height - newY);
      
      if (newX !== cropArea.x || newY !== cropArea.y || newWidth !== cropArea.width || newHeight !== cropArea.height) {
        setCropArea({ x: newX, y: newY, width: newWidth, height: newHeight });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySize, cropMode]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cropMode || !cropArea || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if click is within crop area
    if (
      x >= cropArea.x &&
      x <= cropArea.x + cropArea.width &&
      y >= cropArea.y &&
      y <= cropArea.y + cropArea.height
    ) {
      setIsDragging(true);
      setDragStart({ x: x - cropArea.x, y: y - cropArea.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStart || !cropArea || !displaySize || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newX = Math.max(0, Math.min(x - dragStart.x, displaySize.width - cropArea.width));
    const newY = Math.max(0, Math.min(y - dragStart.y, displaySize.height - cropArea.height));

    setCropArea({ ...cropArea, x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const handleCropResize = (direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw", e: React.MouseEvent) => {
    if (!cropArea || !displaySize) return;

    e.stopPropagation();
    setIsDragging(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startCrop = { ...cropArea };

    const handleMove = (moveEvent: MouseEvent) => {
      if (!displaySize) return;

      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      let newCrop = { ...startCrop };

      if (direction.includes("e")) {
        newCrop.width = Math.min(displaySize.width - newCrop.x, Math.max(50, startCrop.width + deltaX));
      }
      if (direction.includes("w")) {
        const newWidth = Math.min(newCrop.x + newCrop.width, Math.max(50, startCrop.width - deltaX));
        newCrop.x = startCrop.x + startCrop.width - newWidth;
        newCrop.width = newWidth;
      }
      if (direction.includes("s")) {
        newCrop.height = Math.min(displaySize.height - newCrop.y, Math.max(50, startCrop.height + deltaY));
      }
      if (direction.includes("n")) {
        const newHeight = Math.min(newCrop.y + newCrop.height, Math.max(50, startCrop.height - deltaY));
        newCrop.y = startCrop.y + startCrop.height - newHeight;
        newCrop.height = newHeight;
      }

      setCropArea(newCrop);
    };

    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  const processImage = async (): Promise<string> => {
    if (!imageUrl || !imageRef.current || !naturalSize) {
      throw new Error("Image not loaded");
    }

    const canvas = canvasRef.current || document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = naturalSize.width;
    let sourceHeight = naturalSize.height;
    let finalWidth = naturalSize.width;
    let finalHeight = naturalSize.height;

    // Apply crop if in crop mode
    if (cropMode && cropArea && displaySize) {
      // Calculate crop area in natural image coordinates
      // The display size may differ from the natural size, so we need to account for that
      const displayToNaturalScale = naturalSize.width / displaySize.width;
      sourceX = Math.round(cropArea.x * displayToNaturalScale);
      sourceY = Math.round(cropArea.y * displayToNaturalScale);
      sourceWidth = Math.round(cropArea.width * displayToNaturalScale);
      sourceHeight = Math.round(cropArea.height * displayToNaturalScale);
      
      // Crop dimensions become the new base dimensions
      finalWidth = sourceWidth;
      finalHeight = sourceHeight;
    }

    canvas.width = finalWidth;
    canvas.height = finalHeight;

    // Draw image: crop from source
    ctx.drawImage(
      imageRef.current,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      finalWidth,
      finalHeight
    );

    return canvas.toDataURL("image/png", 0.92);
  };

  const handleConfirm = async () => {
    try {
      const processedUrl = await processImage();
      onConfirm(processedUrl);
      onOpenChange(false);
    } catch (error) {
      console.error("Error processing image:", error);
      alert("Failed to process image. Please try again.");
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Format Image"
      description="Preview and crop your image before inserting it"
      className="max-w-5xl"
    >
      <div className="px-4 sm:px-6 py-6 space-y-6">
        {/* Image Preview Section */}
        <div className="flex flex-col items-center space-y-4">
          <div
            ref={containerRef}
            className={cn(
              "relative rounded-xl overflow-hidden bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900",
              "flex items-center justify-center shadow-lg border border-neutral-200 dark:border-neutral-700",
              "transition-all duration-200",
              cropMode && "cursor-move ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-neutral-900"
            )}
            style={{
              width: displaySize ? `${displaySize.width}px` : "auto",
              height: displaySize ? `${displaySize.height}px` : "auto",
              maxWidth: "100%",
              maxHeight: "500px",
              minHeight: "200px",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Preview"
                className={cn(
                  "max-w-full max-h-[500px] object-contain transition-opacity duration-200",
                  cropMode && "pointer-events-none opacity-90"
                )}
                style={{
                  width: displaySize ? `${displaySize.width}px` : "auto",
                  height: displaySize ? `${displaySize.height}px` : "auto",
                }}
              />
            )}

            {/* Crop Overlay */}
            {cropMode && cropArea && (
              <>
                {/* Dark overlay */}
                <div
                  className="absolute inset-0 bg-black/50"
                  style={{
                    clipPath: `polygon(
                      0% 0%,
                      0% 100%,
                      ${(cropArea.x / (displaySize?.width || 1)) * 100}% 100%,
                      ${(cropArea.x / (displaySize?.width || 1)) * 100}% ${(cropArea.y / (displaySize?.height || 1)) * 100}%,
                      ${((cropArea.x + cropArea.width) / (displaySize?.width || 1)) * 100}% ${(cropArea.y / (displaySize?.height || 1)) * 100}%,
                      ${((cropArea.x + cropArea.width) / (displaySize?.width || 1)) * 100}% ${((cropArea.y + cropArea.height) / (displaySize?.height || 1)) * 100}%,
                      ${(cropArea.x / (displaySize?.width || 1)) * 100}% ${((cropArea.y + cropArea.height) / (displaySize?.height || 1)) * 100}%,
                      ${(cropArea.x / (displaySize?.width || 1)) * 100}% 100%,
                      100% 100%,
                      100% 0%
                    )`,
                  }}
                />
                {/* Crop area border */}
                <div
                  className="absolute border-2 border-white shadow-2xl ring-2 ring-primary-500/50"
                  style={{
                    left: `${cropArea.x}px`,
                    top: `${cropArea.y}px`,
                    width: `${cropArea.width}px`,
                    height: `${cropArea.height}px`,
                  }}
                >
                  {/* Resize handles */}
                  {["nw", "ne", "sw", "se", "n", "s", "e", "w"].map((dir) => (
                    <div
                      key={dir}
                      className={cn(
                        "absolute bg-white border-2 border-primary-500 rounded-full shadow-lg",
                        "hover:bg-primary-50 hover:border-primary-600 hover:scale-110 transition-all duration-150",
                        "active:scale-95",
                        dir === "nw" && "top-0 left-0 w-5 h-5 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize",
                        dir === "ne" && "top-0 right-0 w-5 h-5 translate-x-1/2 -translate-y-1/2 cursor-ne-resize",
                        dir === "sw" && "bottom-0 left-0 w-5 h-5 -translate-x-1/2 translate-y-1/2 cursor-sw-resize",
                        dir === "se" && "bottom-0 right-0 w-5 h-5 translate-x-1/2 translate-y-1/2 cursor-se-resize",
                        dir === "n" && "top-0 left-1/2 w-5 h-5 -translate-x-1/2 -translate-y-1/2 cursor-n-resize",
                        dir === "s" && "bottom-0 left-1/2 w-5 h-5 -translate-x-1/2 translate-y-1/2 cursor-s-resize",
                        dir === "e" && "top-1/2 right-0 w-5 h-5 translate-x-1/2 -translate-y-1/2 cursor-e-resize",
                        dir === "w" && "top-1/2 left-0 w-5 h-5 -translate-x-1/2 -translate-y-1/2 cursor-w-resize"
                      )}
                      onMouseDown={(e) => handleCropResize(dir as any, e)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Image Info */}
          {naturalSize && displaySize && finalDimensions && (
            <div className="flex items-center justify-center gap-4 text-sm">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
                <span className="text-neutral-500 dark:text-neutral-400 font-medium">Original:</span>
                <span className="text-neutral-700 dark:text-neutral-300 font-mono">
                  {naturalSize.width} × {naturalSize.height}px
                </span>
              </div>
              {cropMode && cropArea && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                  <span className="text-primary-600 dark:text-primary-400 font-medium">Crop:</span>
                  <span className="text-primary-700 dark:text-primary-300 font-mono">
                    {Math.round(cropArea.width)} × {Math.round(cropArea.height)}px
                  </span>
                </div>
              )}
              {cropMode && cropArea && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary-50 dark:bg-secondary-900/20 rounded-lg border border-secondary-200 dark:border-secondary-800">
                  <span className="text-secondary-600 dark:text-secondary-400 font-medium">Final:</span>
                  <span className="text-secondary-700 dark:text-secondary-300 font-mono">
                    {finalDimensions.finalWidth} × {finalDimensions.finalHeight}px
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls Section */}
        <div className="space-y-5">
          {/* Crop / Resize Toggle Card */}
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
                  Crop & Resize
                </label>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Enable to crop and resize by dragging the edges of the selection box
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !cropMode;
                  setCropMode(next);
                  if (!next) {
                    setCropArea(null);
                  }
                }}
                className={cn(
                  "relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900",
                  cropMode 
                    ? "bg-primary-600 hover:bg-primary-700" 
                    : "bg-neutral-300 dark:bg-neutral-600 hover:bg-neutral-400 dark:hover:bg-neutral-500"
                )}
                aria-label={cropMode ? "Disable crop mode" : "Enable crop mode"}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200",
                    cropMode ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleCancel}
            className="min-w-[100px]"
          >
            Cancel
          </Button>
          <Button 
            type="button" 
            variant="primary" 
            onClick={handleConfirm}
            className="min-w-[120px] shadow-md hover:shadow-lg transition-shadow"
          >
            Insert Image
          </Button>
        </div>
      </div>

      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} className="hidden" />
    </Dialog>
  );
};
