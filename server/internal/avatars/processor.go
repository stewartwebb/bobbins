package avatars

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"strings"

	"github.com/disintegration/imaging"
)

const (
	// AvatarSize is the standard size for avatar thumbnails
	AvatarSize = 128
	// JPEGQuality is the quality setting for JPEG compression
	JPEGQuality = 90
)

// CropData represents the crop/position information for an avatar
type CropData struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	Scale  float64 `json:"scale"`
}

// ProcessAvatar processes an image by cropping and resizing it to create an avatar thumbnail
func ProcessAvatar(reader io.Reader, contentType string, cropData *CropData) ([]byte, string, error) {
	// Decode the image
	img, format, err := image.Decode(reader)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode image: %w", err)
	}

	// If crop data is provided, crop the image first
	if cropData != nil && cropData.Width > 0 && cropData.Height > 0 {
		bounds := img.Bounds()
		imgWidth := float64(bounds.Dx())
		imgHeight := float64(bounds.Dy())

		// Apply scale if provided
		scale := cropData.Scale
		if scale <= 0 {
			scale = 1.0
		}

		// Calculate crop rectangle in image coordinates
		x := int(cropData.X * imgWidth)
		y := int(cropData.Y * imgHeight)
		width := int(cropData.Width * imgWidth / scale)
		height := int(cropData.Height * imgHeight / scale)

		// Ensure crop rectangle is within bounds
		if x < 0 {
			x = 0
		}
		if y < 0 {
			y = 0
		}
		if x+width > int(imgWidth) {
			width = int(imgWidth) - x
		}
		if y+height > int(imgHeight) {
			height = int(imgHeight) - y
		}

		// Crop the image
		cropRect := image.Rect(x, y, x+width, y+height)
		img = imaging.Crop(img, cropRect)
	}

	// Resize to avatar size while maintaining aspect ratio
	img = imaging.Fill(img, AvatarSize, AvatarSize, imaging.Center, imaging.Lanczos)

	// Encode the processed image
	var buf bytes.Buffer
	outputContentType := "image/jpeg"

	// Use PNG for images with transparency
	if format == "png" {
		outputContentType = "image/png"
		err = png.Encode(&buf, img)
	} else {
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: JPEGQuality})
	}

	if err != nil {
		return nil, "", fmt.Errorf("failed to encode image: %w", err)
	}

	return buf.Bytes(), outputContentType, nil
}

// SerializeCropData converts CropData to a JSON string for storage
func SerializeCropData(data *CropData) (string, error) {
	if data == nil {
		return "", nil
	}

	jsonBytes, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("failed to serialize crop data: %w", err)
	}

	return string(jsonBytes), nil
}

// DeserializeCropData converts a JSON string back to CropData
func DeserializeCropData(jsonStr string) (*CropData, error) {
	if strings.TrimSpace(jsonStr) == "" {
		return nil, nil
	}

	var data CropData
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		return nil, fmt.Errorf("failed to deserialize crop data: %w", err)
	}

	return &data, nil
}

// IsValidImageType checks if the content type is a supported image format
func IsValidImageType(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	return contentType == "image/jpeg" ||
		contentType == "image/jpg" ||
		contentType == "image/png" ||
		contentType == "image/gif" ||
		contentType == "image/webp"
}
