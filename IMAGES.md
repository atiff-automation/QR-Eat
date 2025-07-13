# Image Upload Feature

## Overview
The QR Restaurant System now supports local file upload for menu item images with automatic resizing and optimization guidelines.

## Features

### 🖼️ File Upload Component
- **Drag & Drop**: Drag images directly onto the upload area
- **Click to Upload**: Click the upload area to open file browser
- **Live Preview**: See uploaded images immediately
- **Error Handling**: Clear error messages for invalid files

### 📏 Image Guidelines
- **Recommended Size**: 800x600px (4:3 aspect ratio)
- **Minimum Size**: 400x300px
- **Maximum File Size**: 5MB
- **Supported Formats**: JPEG, PNG, WebP
- **Storage**: Local filesystem (public/uploads/menu-images/)

### 🔒 Security Features
- **Authentication Required**: Only authenticated staff can upload
- **Permission Checks**: Menu write permissions required
- **File Validation**: Type and size validation
- **Path Security**: Protection against directory traversal attacks

## API Endpoints

### Upload Image
```
POST /api/upload/image
Content-Type: multipart/form-data
Body: { image: File }
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "/uploads/menu-images/menu-1234567890-abc123.jpg",
  "filename": "menu-1234567890-abc123.jpg",
  "originalName": "burger.jpg",
  "size": 245760,
  "type": "image/jpeg"
}
```

### Delete Image
```
DELETE /api/upload/image/[filename]
```

## Usage in Forms

### Add New Menu Item
1. Fill in item details (name, price, etc.)
2. In the "Menu Item Image" section:
   - Drag and drop an image, or
   - Click to browse and select an image
3. See instant preview with change/remove options
4. Save the menu item

### Edit Existing Menu Item
1. Click edit on any menu item
2. The current image (if any) will be shown
3. Upload a new image to replace it
4. Use "Remove" to delete the current image
5. Save changes

## File Management

### Automatic Cleanup
- Images are stored in `/public/uploads/menu-images/`
- Filenames are auto-generated with timestamp and random string
- Old images should be manually cleaned up when menu items are deleted

### Storage Recommendations
- **Development**: Local filesystem (current implementation)
- **Production**: Consider cloud storage (AWS S3, Cloudinary, etc.)
- **Backup**: Include uploads directory in backup strategy

## Image Optimization Tips

### For Best Results
1. **Use good lighting** when photographing food
2. **Square or 4:3 aspect ratio** works best
3. **High contrast** makes food look more appealing
4. **Compress images** before upload to stay under 5MB
5. **Consistent style** across all menu images

### Recommended Tools
- **Compression**: TinyPNG, ImageOptim
- **Editing**: Canva, GIMP, Photoshop
- **Mobile**: Use phone camera with good lighting

## Future Enhancements

### Planned Features
- [ ] Automatic image resizing/compression server-side
- [ ] Multiple image support per menu item
- [ ] Cloud storage integration (AWS S3, Cloudinary)
- [ ] Image cropping tool in the UI
- [ ] Bulk image upload for menu import
- [ ] Image optimization with WebP conversion
- [ ] Progressive image loading

### Integration Options
- **Sharp**: Server-side image processing
- **Cloudinary**: Cloud-based image optimization
- **AWS S3**: Scalable cloud storage
- **Next.js Image**: Optimized image delivery