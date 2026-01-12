import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Media, Category, MediaFormData } from '@/types/media';
import { useAuth } from './useAuth';

export function useMedia() {
  const [media, setMedia] = useState<Media[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');
    
    if (!error && data) {
      setCategories(data);
    }
  };

  const fetchMedia = async (categoryId?: string, searchQuery?: string) => {
    setLoading(true);
    
    let query = supabase
      .from('media')
      .select(`
        *,
        category:categories(id, name, description, created_at)
      `)
      .order('created_at', { ascending: false });

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;

    if (!error && data) {
      const formattedData = data.map(item => ({
        ...item,
        tags: Array.isArray(item.tags) ? item.tags as string[] : [],
        media_type: item.media_type as 'photo' | 'video',
        source_type: item.source_type as 'file' | 'url',
        category: item.category as Category | undefined
      })) as Media[];
      setMedia(formattedData);
    }
    
    setLoading(false);
  };

  const uploadMedia = async (formData: MediaFormData, file?: File) => {
    if (!user) return { error: new Error('Usuário não autenticado') };

    let filePath = null;
    let thumbnailUrl = null;

    if (formData.source_type === 'file' && file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file);

      if (uploadError) return { error: uploadError };
      
      filePath = fileName;
      
      const { data: publicUrl } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);
      
      thumbnailUrl = publicUrl.publicUrl;
    } else if (formData.source_type === 'url') {
      thumbnailUrl = formData.external_url;
    }

    const { error } = await supabase.from('media').insert({
      user_id: user.id,
      title: formData.title,
      description: formData.description || null,
      media_type: formData.media_type,
      source_type: formData.source_type,
      file_path: filePath,
      external_url: formData.source_type === 'url' ? formData.external_url : null,
      thumbnail_url: thumbnailUrl,
      tags: formData.tags,
      category_id: formData.category_id || null
    });

    if (!error) {
      await fetchMedia();
    }

    return { error };
  };

  const deleteMedia = async (mediaId: string) => {
    const mediaItem = media.find(m => m.id === mediaId);
    
    if (mediaItem?.file_path) {
      await supabase.storage.from('media').remove([mediaItem.file_path]);
    }

    const { error } = await supabase
      .from('media')
      .delete()
      .eq('id', mediaId);

    if (!error) {
      setMedia(prev => prev.filter(m => m.id !== mediaId));
    }

    return { error };
  };

  useEffect(() => {
    fetchCategories();
    fetchMedia();
  }, []);

  return {
    media,
    categories,
    loading,
    fetchMedia,
    uploadMedia,
    deleteMedia,
    fetchCategories
  };
}
