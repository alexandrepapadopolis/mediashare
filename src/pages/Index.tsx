import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { CategoryFilter } from '@/components/CategoryFilter';
import { MediaGrid } from '@/components/MediaGrid';
import { MediaViewer } from '@/components/MediaViewer';
import { useMedia } from '@/hooks/useMedia';
import { Media } from '@/types/media';

export default function Index() {
  const { media, categories, loading, fetchMedia, deleteMedia } = useMedia();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleCategorySelect = useCallback((categoryId: string | null) => {
    setSelectedCategory(categoryId);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteMedia(id);
  }, [deleteMedia]);

  useEffect(() => {
    fetchMedia(selectedCategory || undefined, searchQuery || undefined);
  }, [selectedCategory, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <Header onSearch={handleSearch} />
      
      <main className="container py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Explorar</h1>
          <p className="text-muted-foreground text-sm">
            Descubra fotos e vídeos incríveis
          </p>
        </div>

        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={handleCategorySelect}
        />

        <MediaGrid
          media={media}
          loading={loading}
          onDelete={handleDelete}
          onMediaClick={setSelectedMedia}
        />
      </main>

      <MediaViewer
        media={selectedMedia}
        open={!!selectedMedia}
        onClose={() => setSelectedMedia(null)}
      />
    </div>
  );
}
