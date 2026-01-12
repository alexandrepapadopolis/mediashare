import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Link as LinkIcon, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMedia } from '@/hooks/useMedia';
import { MediaFormData } from '@/types/media';

export function UploadForm() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { categories, uploadMedia } = useMedia();
  const [loading, setLoading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<MediaFormData>({
    title: '',
    description: '',
    media_type: 'photo',
    source_type: 'file',
    external_url: '',
    tags: [],
    category_id: ''
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      const isVideo = selectedFile.type.startsWith('video/');
      setFormData(prev => ({
        ...prev,
        media_type: isVideo ? 'video' : 'photo'
      }));

      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({ title: 'Erro', description: 'Título é obrigatório', variant: 'destructive' });
      return;
    }

    if (formData.source_type === 'file' && !file) {
      toast({ title: 'Erro', description: 'Selecione um arquivo', variant: 'destructive' });
      return;
    }

    if (formData.source_type === 'url' && !formData.external_url.trim()) {
      toast({ title: 'Erro', description: 'URL é obrigatória', variant: 'destructive' });
      return;
    }

    setLoading(true);
    const { error } = await uploadMedia(formData, file || undefined);
    setLoading(false);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Sucesso', description: 'Mídia enviada com sucesso!' });
      navigate('/');
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Adicionar Nova Mídia</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Tipo de Fonte</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={formData.source_type === 'file' ? 'default' : 'outline'}
                onClick={() => setFormData(prev => ({ ...prev, source_type: 'file' }))}
                className="flex-1"
              >
                <Upload className="h-4 w-4 mr-2" />
                Arquivo
              </Button>
              <Button
                type="button"
                variant={formData.source_type === 'url' ? 'default' : 'outline'}
                onClick={() => setFormData(prev => ({ ...prev, source_type: 'url' }))}
                className="flex-1"
              >
                <LinkIcon className="h-4 w-4 mr-2" />
                URL Externa
              </Button>
            </div>
          </div>

          {formData.source_type === 'file' ? (
            <div className="space-y-2">
              <Label htmlFor="file">Arquivo</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                {preview ? (
                  <div className="relative">
                    {formData.media_type === 'video' ? (
                      <video src={preview} className="max-h-48 mx-auto rounded" />
                    ) : (
                      <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded" />
                    )}
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-0 right-0"
                      onClick={() => { setFile(null); setPreview(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label htmlFor="file" className="cursor-pointer">
                    <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Clique para selecionar ou arraste um arquivo
                    </p>
                    <input
                      id="file"
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="url">URL Externa</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://exemplo.com/imagem.jpg"
                value={formData.external_url}
                onChange={(e) => setFormData(prev => ({ ...prev, external_url: e.target.value }))}
              />
            </div>
          )}

          {formData.source_type === 'url' && (
            <div className="space-y-2">
              <Label>Tipo de Mídia</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formData.media_type === 'photo' ? 'default' : 'outline'}
                  onClick={() => setFormData(prev => ({ ...prev, media_type: 'photo' }))}
                  size="sm"
                >
                  Foto
                </Button>
                <Button
                  type="button"
                  variant={formData.media_type === 'video' ? 'default' : 'outline'}
                  onClick={() => setFormData(prev => ({ ...prev, media_type: 'video' }))}
                  size="sm"
                >
                  Vídeo
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              placeholder="Título da mídia"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              placeholder="Descreva sua mídia..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            <Select
              value={formData.category_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, category_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Adicionar tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              />
              <Button type="button" variant="outline" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {formData.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="pr-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => navigate('/')} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Enviando...' : 'Enviar Mídia'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
