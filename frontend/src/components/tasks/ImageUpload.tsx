import { useState, useCallback, useEffect } from 'react';
import { Upload, Trash2, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { imageApi } from '@/lib/api';
import { toast } from 'sonner';

interface Props {
  taskId: string;
  imageKey?: string;
  onImageChange: () => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function ImageUpload({ taskId, imageKey, onImageChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [imageUrls, setImageUrls] = useState<{ originalUrl: string; thumbnailUrl: string } | null>(null);
  const [fullView, setFullView] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    if (!imageKey) {
      setImageUrls(null);
      return;
    }
    setThumbFailed(false);
    imageApi.getUrls(taskId).then(setImageUrls).catch(() => setImageUrls(null));
  }, [taskId, imageKey]);

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Only JPEG, PNG, GIF, and WebP images are allowed.';
    }
    if (file.size > MAX_SIZE) {
      return 'Image must be smaller than 5 MB.';
    }
    return null;
  };

  const handleUpload = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }

      setUploading(true);
      try {
        await imageApi.upload(taskId, file);
        toast.success('Image uploaded');
        onImageChange();
      } catch {
        toast.error('Failed to upload image');
      } finally {
        setUploading(false);
      }
    },
    [taskId, onImageChange],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await imageApi.delete(taskId);
      toast.success('Image deleted');
      setImageUrls(null);
      onImageChange();
    } catch {
      toast.error('Failed to delete image');
    } finally {
      setDeleting(false);
    }
  }, [taskId, onImageChange]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = '';
    },
    [handleUpload],
  );

  // Full-size lightbox overlay
  if (fullView && imageUrls) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={() => setFullView(false)}
      >
        <button
          onClick={() => setFullView(false)}
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={imageUrls.originalUrl}
          alt="Full size"
          className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  // Image preview with controls
  if (imageKey && imageUrls) {
    return (
      <div className="group relative overflow-hidden rounded-lg border border-border bg-muted/30">
        <img
          src={thumbFailed ? imageUrls.originalUrl : imageUrls.thumbnailUrl}
          alt="Task attachment"
          className="h-48 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          onError={() => setThumbFailed(true)}
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/40 group-hover:opacity-100">
          <button
            onClick={() => setFullView(true)}
            className="rounded-lg bg-white/90 px-3 py-2 text-xs font-medium text-gray-900 shadow-sm transition-colors hover:bg-white"
          >
            <ImageIcon className="mr-1.5 inline h-3.5 w-3.5" />
            View full
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg bg-red-500/90 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 inline h-3.5 w-3.5" />
            )}
            Delete
          </button>
        </div>

        {/* Replace via file input */}
        <label className="absolute bottom-2 right-2 cursor-pointer rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-gray-700 opacity-0 shadow-sm transition-all hover:bg-white group-hover:opacity-100">
          Replace
          <input type="file" accept="image/*" onChange={onFileSelect} className="hidden" />
        </label>
      </div>
    );
  }

  // Loading state while fetching URLs for an existing image
  if (imageKey && !imageUrls) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Upload / drag-and-drop zone
  return (
    <label
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
        dragOver
          ? 'border-primary bg-primary/5'
          : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40'
      } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      {uploading ? (
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      ) : (
        <Upload className="h-8 w-8 text-muted-foreground" />
      )}
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          {uploading ? 'Uploading...' : 'Drop an image here or click to browse'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, GIF, or WebP up to 5 MB</p>
      </div>
      <input
        type="file"
        accept="image/*"
        onChange={onFileSelect}
        className="hidden"
        disabled={uploading}
      />
    </label>
  );
}
