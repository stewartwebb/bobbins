package handlers

import (
    "bytes"
    "context"
    "fmt"
    "image"
    "io"
    "log"
    "math"
    "os"
    "os/exec"
    "strings"
    "time"

    "bafachat/internal/models"
    "bafachat/internal/storage"

    "github.com/disintegration/imaging"
    "gorm.io/gorm"
)

const (
    previewMaxWidth        = 640
    previewMaxHeight       = 640
    previewJPEGQuality     = 82
    previewGenerationLimit = 12 * time.Second
)

type previewResult struct {
    objectKey     string
    url           string
    previewWidth  int
    previewHeight int
    width         int
    height        int
}

func generateAttachmentPreviews(ctx context.Context, db *gorm.DB, storageService *storage.Service, attachments []models.MessageAttachment) []models.MessageAttachment {
    if storageService == nil || len(attachments) == 0 {
        return attachments
    }

    ctx, cancel := context.WithTimeout(ctx, previewGenerationLimit)
    defer cancel()

    updated := make([]models.MessageAttachment, len(attachments))
    copy(updated, attachments)

    for index := range updated {
        attachment := &updated[index]
        if attachment.PreviewObjectKey != "" {
            continue
        }

        if attachment.ContentType == "" {
            continue
        }

        contentType := strings.ToLower(attachment.ContentType)
        var result *previewResult
        var err error

        switch {
        case strings.HasPrefix(contentType, "image/"):
            result, err = buildImagePreview(ctx, storageService, attachment)
        case strings.HasPrefix(contentType, "video/"):
            result, err = buildVideoPreview(ctx, storageService, attachment)
        default:
            continue
        }

        if err != nil {
            log.Printf("attachment preview: failed to generate preview for attachment %d: %v", attachment.ID, err)
            continue
        }

        if result == nil {
            continue
        }

        updates := map[string]interface{}{
            "preview_object_key": result.objectKey,
            "preview_url":        result.url,
            "preview_width":      result.previewWidth,
            "preview_height":     result.previewHeight,
        }

        if result.width > 0 {
            updates["width"] = result.width
        }
        if result.height > 0 {
            updates["height"] = result.height
        }

        if err := db.WithContext(ctx).
            Model(&models.MessageAttachment{}).
            Where("id = ?", attachment.ID).
            Updates(updates).Error; err != nil {
            log.Printf("attachment preview: failed to persist metadata for attachment %d: %v", attachment.ID, err)
            continue
        }

        attachment.PreviewObjectKey = result.objectKey
        attachment.PreviewURL = result.url
        attachment.PreviewWidth = result.previewWidth
        attachment.PreviewHeight = result.previewHeight
        if result.width > 0 {
            attachment.Width = result.width
        }
        if result.height > 0 {
            attachment.Height = result.height
        }
    }

    return updated
}

func buildImagePreview(ctx context.Context, storageService *storage.Service, attachment *models.MessageAttachment) (*previewResult, error) {
    reader, _, _, err := storageService.GetObject(ctx, attachment.ObjectKey)
    if err != nil {
        return nil, fmt.Errorf("fetch object: %w", err)
    }
    defer reader.Close()

    data, err := io.ReadAll(reader)
    if err != nil {
        return nil, fmt.Errorf("read object: %w", err)
    }

    img, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
    if err != nil {
        return nil, fmt.Errorf("decode image: %w", err)
    }

    bounds := img.Bounds()
    originalWidth := bounds.Dx()
    originalHeight := bounds.Dy()

    preview := resizeToFit(img, previewMaxWidth, previewMaxHeight)

    var buffer bytes.Buffer
    if err := imaging.Encode(&buffer, preview, imaging.JPEG, imaging.JPEGQuality(previewJPEGQuality)); err != nil {
        return nil, fmt.Errorf("encode preview: %w", err)
    }

    upload, err := storageService.UploadObject(
        ctx,
        attachment.FileName+"-preview.jpg",
        "image/jpeg",
        int64(buffer.Len()),
        bytes.NewReader(buffer.Bytes()),
    )
    if err != nil {
        return nil, fmt.Errorf("upload preview: %w", err)
    }

    previewBounds := preview.Bounds()

    return &previewResult{
        objectKey:     upload.ObjectKey,
        url:           upload.FileURL,
        previewWidth:  previewBounds.Dx(),
        previewHeight: previewBounds.Dy(),
        width:         originalWidth,
        height:        originalHeight,
    }, nil
}

func buildVideoPreview(ctx context.Context, storageService *storage.Service, attachment *models.MessageAttachment) (*previewResult, error) {
    reader, _, _, err := storageService.GetObject(ctx, attachment.ObjectKey)
    if err != nil {
        return nil, fmt.Errorf("fetch object: %w", err)
    }
    defer reader.Close()

    tmpDir := os.TempDir()
    tmpVideo, err := os.CreateTemp(tmpDir, "bafachat-video-*.tmp")
    if err != nil {
        return nil, fmt.Errorf("create temp video: %w", err)
    }
    videoPath := tmpVideo.Name()
    defer func() {
        tmpVideo.Close()
        os.Remove(videoPath)
    }()

    if _, err := io.Copy(tmpVideo, reader); err != nil {
        return nil, fmt.Errorf("buffer video: %w", err)
    }

    if err := tmpVideo.Close(); err != nil {
        return nil, fmt.Errorf("close temp video: %w", err)
    }

    thumbFile, err := os.CreateTemp(tmpDir, "bafachat-thumb-*.jpg")
    if err != nil {
        return nil, fmt.Errorf("create temp thumbnail: %w", err)
    }
    thumbPath := thumbFile.Name()
    thumbFile.Close()
    defer os.Remove(thumbPath)

    cmd := exec.CommandContext(
        ctx,
        "ffmpeg",
        "-y",
        "-i", videoPath,
        "-vf", fmt.Sprintf("thumbnail,scale='min(%d,iw)':-1", previewMaxWidth),
        "-frames:v", "1",
        thumbPath,
    )
    cmd.Stdout = io.Discard
    cmd.Stderr = io.Discard

    if err := cmd.Run(); err != nil {
        return nil, fmt.Errorf("ffmpeg thumbnail: %w", err)
    }

    thumbData, err := os.ReadFile(thumbPath)
    if err != nil {
        return nil, fmt.Errorf("read thumbnail: %w", err)
    }

    img, err := imaging.Decode(bytes.NewReader(thumbData))
    if err != nil {
        return nil, fmt.Errorf("decode thumbnail: %w", err)
    }

    preview := resizeToFit(img, previewMaxWidth, previewMaxHeight)

    var buffer bytes.Buffer
    if err := imaging.Encode(&buffer, preview, imaging.JPEG, imaging.JPEGQuality(previewJPEGQuality)); err != nil {
        return nil, fmt.Errorf("encode preview: %w", err)
    }

    upload, err := storageService.UploadObject(
        ctx,
        attachment.FileName+"-preview.jpg",
        "image/jpeg",
        int64(buffer.Len()),
        bytes.NewReader(buffer.Bytes()),
    )
    if err != nil {
        return nil, fmt.Errorf("upload preview: %w", err)
    }

    bounds := preview.Bounds()

    return &previewResult{
        objectKey:     upload.ObjectKey,
        url:           upload.FileURL,
        previewWidth:  bounds.Dx(),
        previewHeight: bounds.Dy(),
    }, nil
}

func resizeToFit(img image.Image, maxWidth, maxHeight int) image.Image {
    width := img.Bounds().Dx()
    height := img.Bounds().Dy()

    if width <= maxWidth && height <= maxHeight {
        return img
    }

    ratio := math.Min(float64(maxWidth)/float64(width), float64(maxHeight)/float64(height))
    targetWidth := int(math.Round(float64(width) * ratio))
    targetHeight := int(math.Round(float64(height) * ratio))

    if targetWidth < 1 {
        targetWidth = 1
    }
    if targetHeight < 1 {
        targetHeight = 1
    }

    return imaging.Resize(img, targetWidth, targetHeight, imaging.Lanczos)
}
*** End of File
