import { useState } from 'react';
import { Play, Trash2, Eye } from 'lucide-react';
import { Media } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { useAuth } from '@/hooks/useAuth';

interface MediaCardProps {
  media: Media;
  onDelete?: (id: string) => void;
  onClick?: (media: Media) => void;
}

export function MediaCard({ media, onDelete, onClick }: MediaCardProps) {
  const [imageError, setImageError] = useState(false);
  const { user } = useAuth();
  const isOwner = user?.id === media.user_id;

  const getMediaUrl = () => {
    if (media.source_type === 'url') {
      return media.external_url;
    }
    return media.thumbnail_url;
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(media.id);
  };

  return (
    <Card 
      className="group overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
      onClick={() => onClick?.(media)}
    >
      <div className="relative">
        <AspectRatio ratio={4/3}>
          {imageError ? (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-sm">Imagem indisponível</span>
            </div>
          ) : (
            <>
              {media.media_type === 'video' ? (
                <div className="relative w-full h-full">
                  <img
                    src={getMediaUrl() || ''}
                    alt={media.title}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="h-6 w-6 text-primary fill-primary" />
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={getMediaUrl() || ''}
                  alt={media.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={() => setImageError(true)}
                />
              )}
            </>
          )}
        </AspectRatio>

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <h3 className="text-white font-medium text-sm line-clamp-1">{media.title}</h3>
          {media.description && (
            <p className="text-white/80 text-xs line-clamp-1 mt-0.5">{media.description}</p>
          )}
        </div>

        {isOwner && (
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}

        {media.media_type === 'video' && (
          <Badge variant="secondary" className="absolute top-2 left-2">
            Vídeo
          </Badge>
        )}
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {media.category?.name || 'Sem categoria'}
          </span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Eye className="h-3 w-3" />
            <span className="text-xs">{media.view_count}</span>
          </div>
        </div>
        
        {media.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {media.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs px-1.5 py-0">
                {tag}
              </Badge>
            ))}
            {media.tags.length > 3 && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                +{media.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
