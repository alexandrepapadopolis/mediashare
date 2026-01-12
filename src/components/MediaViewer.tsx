import { X, User, Calendar, Tag, Folder } from 'lucide-react';
import { Media } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MediaViewerProps {
  media: Media | null;
  open: boolean;
  onClose: () => void;
}

export function MediaViewer({ media, open, onClose }: MediaViewerProps) {
  if (!media) return null;

  const getMediaUrl = () => {
    if (media.source_type === 'url') {
      return media.external_url;
    }
    return media.thumbnail_url;
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-50 bg-background/80 hover:bg-background"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex flex-col md:flex-row max-h-[90vh]">
          <div className="flex-1 bg-black flex items-center justify-center min-h-[300px] md:min-h-[500px]">
            {media.media_type === 'video' ? (
              <video
                src={getMediaUrl() || ''}
                controls
                autoPlay
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <img
                src={getMediaUrl() || ''}
                alt={media.title}
                className="max-w-full max-h-full object-contain"
              />
            )}
          </div>

          <div className="w-full md:w-80 p-6 overflow-y-auto bg-background">
            <h2 className="text-xl font-semibold mb-2">{media.title}</h2>
            
            {media.description && (
              <p className="text-muted-foreground text-sm mb-4">{media.description}</p>
            )}

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{media.profiles?.username || 'Usuário anônimo'}</span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {format(new Date(media.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </span>
              </div>

              {media.category && (
                <div className="flex items-center gap-2 text-sm">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span>{media.category.name}</span>
                </div>
              )}

              {media.tags.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span>Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {media.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
