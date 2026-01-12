import { Media } from '@/types/media';
import { MediaCard } from './MediaCard';
import { Skeleton } from '@/components/ui/skeleton';

interface MediaGridProps {
  media: Media[];
  loading: boolean;
  onDelete?: (id: string) => void;
  onMediaClick?: (media: Media) => void;
}

export function MediaGrid({ media, loading, onDelete, onMediaClick }: MediaGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[4/3] rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
          <span className="text-4xl">📷</span>
        </div>
        <h3 className="text-lg font-medium mb-1">Nenhuma mídia encontrada</h3>
        <p className="text-muted-foreground text-sm">
          Seja o primeiro a compartilhar algo!
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {media.map((item) => (
        <MediaCard
          key={item.id}
          media={item}
          onDelete={onDelete}
          onClick={onMediaClick}
        />
      ))}
    </div>
  );
}
